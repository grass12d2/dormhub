/**
 * Сервис студентов.
 *
 * Создание студента вместе с учётной записью выполняется в одной транзакции:
 * если не удалась любая часть (в том числе запись аудита), не сохраняется ничего.
 * Пароль хешируется до транзакции (это долгая операция) и нигде не журналируется.
 */

import type { Pool } from 'pg';
import { StudentQueries } from '../db/queries/students.js';
import { UserQueries } from '../db/queries/users.js';
import { withRetry } from '../db/transaction.js';
import {
  toStudent,
  toStudentValues,
  type Student,
  type StudentValues,
} from '../types/students.js';
import { writeAuditLog } from '../utils/audit.js';
import { isDbError } from '../utils/db-errors.js';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnprocessableError,
} from '../utils/errors.js';
import { DEFAULT_BCRYPT_ROUNDS, hashPassword, validatePasswordPolicy } from '../utils/password.js';
import type {
  CreateStudentInput,
  ListStudentsQuery,
  PatchStudentInput,
  ReplaceStudentInput,
} from '../validation/students.validation.js';
import type { ActionContext } from './buildings.service.js';

const STUDENT_NOT_FOUND = 'Студент не найден';
const PROFILE_NOT_FOUND = 'Профиль студента не найден';

export interface StudentsServiceOptions {
  bcryptRounds?: number;
}

export interface StudentsPage {
  items: Student[];
  total: number;
  limit: number;
  offset: number;
}

/** Полные значения из тела запроса: пропущенные необязательные поля становятся null */
export function valuesFromInput(input: ReplaceStudentInput): StudentValues {
  return {
    studentNumber: input.studentNumber,
    displayName: input.displayName,
    lastName: input.lastName ?? null,
    firstName: input.firstName ?? null,
    middleName: input.middleName ?? null,
    birthDate: input.birthDate,
    phone: input.phone ?? null,
    faculty: input.faculty ?? null,
    groupName: input.groupName ?? null,
    educationLevel: input.educationLevel ?? null,
    fieldOfStudy: input.fieldOfStudy ?? null,
    programCode: input.programCode ?? null,
    specialization: input.specialization ?? null,
    studyYear: input.studyYear ?? null,
    fundingType: input.fundingType ?? null,
  };
}

/**
 * Применить PATCH: отсутствующее поле сохраняет текущее значение,
 * null в необязательном поле очищает его.
 */
export function mergeStudentValues(current: StudentValues, patch: PatchStudentInput): StudentValues {
  return {
    studentNumber: patch.studentNumber ?? current.studentNumber,
    displayName: patch.displayName ?? current.displayName,
    lastName: patch.lastName !== undefined ? patch.lastName : current.lastName,
    firstName: patch.firstName !== undefined ? patch.firstName : current.firstName,
    middleName: patch.middleName !== undefined ? patch.middleName : current.middleName,
    birthDate: patch.birthDate ?? current.birthDate,
    phone: patch.phone !== undefined ? patch.phone : current.phone,
    faculty: patch.faculty !== undefined ? patch.faculty : current.faculty,
    groupName: patch.groupName !== undefined ? patch.groupName : current.groupName,
    educationLevel:
      patch.educationLevel !== undefined ? patch.educationLevel : current.educationLevel,
    fieldOfStudy: patch.fieldOfStudy !== undefined ? patch.fieldOfStudy : current.fieldOfStudy,
    programCode: patch.programCode !== undefined ? patch.programCode : current.programCode,
    specialization:
      patch.specialization !== undefined ? patch.specialization : current.specialization,
    studyYear: patch.studyYear !== undefined ? patch.studyYear : current.studyYear,
    fundingType: patch.fundingType !== undefined ? patch.fundingType : current.fundingType,
  };
}

/** Преобразовать нарушения ограничений базы в понятные ошибки приложения */
function translateStudentError(error: unknown): unknown {
  if (isDbError(error, '23505', 'students_student_number_key')) {
    return new ConflictError('Студент с таким номером студенческого уже существует');
  }
  if (isDbError(error, '23505', 'students_user_id_key')) {
    return new ConflictError('Эта учётная запись уже привязана к другому студенту');
  }
  if (isDbError(error, '23505', 'users_email_key')) {
    return new ConflictError('Пользователь с таким email уже существует');
  }
  if (isDbError(error, '23503', 'students_user_id_user_role_fkey')) {
    return new UnprocessableError('Учётная запись не найдена или не имеет роли студента');
  }
  if (isDbError(error, '23503', 'contracts_student_id_fkey')) {
    return new ConflictError('Нельзя удалить студента: по нему есть договоры');
  }
  return error;
}

export class StudentsService {
  private readonly bcryptRounds: number;

  constructor(
    private readonly pool: Pool,
    options: StudentsServiceOptions = {}
  ) {
    this.bcryptRounds = options.bcryptRounds ?? DEFAULT_BCRYPT_ROUNDS;
  }

  async list(query: ListStudentsQuery): Promise<StudentsPage> {
    const page = await new StudentQueries(this.pool).findPage(query);
    return {
      items: page.rows.map(toStudent),
      total: page.total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async get(id: string): Promise<Student> {
    const row = await new StudentQueries(this.pool).findById(id);
    if (!row) {
      throw new NotFoundError(STUDENT_NOT_FOUND);
    }
    return toStudent(row);
  }

  /** Профиль студента, привязанный к учётной записи пользователя */
  async getByUserId(userId: string): Promise<Student> {
    const row = await new StudentQueries(this.pool).findByUserId(userId);
    if (!row) {
      throw new NotFoundError(PROFILE_NOT_FOUND);
    }
    return toStudent(row);
  }

  async create(input: CreateStudentInput, ctx: ActionContext): Promise<Student> {
    const values = valuesFromInput(input);
    const { account } = input;

    let passwordHash: string | null = null;
    if (account) {
      const policyError = validatePasswordPolicy(account.password);
      if (policyError) {
        throw new BadRequestError(policyError);
      }
      passwordHash = await hashPassword(account.password, this.bcryptRounds);
    }

    try {
      const row = await withRetry(this.pool, async (client) => {
        let userId = input.userId ?? null;

        if (account && passwordHash) {
          const user = await new UserQueries(client).create(account.email, passwordHash, 'student');
          await writeAuditLog(client, {
            actorUserId: ctx.userId,
            action: 'create_user',
            entityType: 'users',
            entityId: user.id,
            details: { email: user.email, role: user.role, createdWithStudent: true },
            ipAddress: ctx.ip,
          });
          userId = user.id;
        }

        const created = await new StudentQueries(client).create(userId, values);
        await writeAuditLog(client, {
          actorUserId: ctx.userId,
          action: 'create_student',
          entityType: 'students',
          entityId: created.id,
          details: {
            after: toStudentValues(created),
            userId: created.user_id,
            accountCreated: account !== undefined,
          },
          ipAddress: ctx.ip,
        });
        return created;
      });
      return toStudent(row);
    } catch (error) {
      throw translateStudentError(error);
    }
  }

  /** PUT: полная замена полей */
  replace(id: string, input: ReplaceStudentInput, ctx: ActionContext): Promise<Student> {
    return this.modify(id, () => valuesFromInput(input), ctx);
  }

  /** PATCH: изменение только переданных полей */
  patch(id: string, input: PatchStudentInput, ctx: ActionContext): Promise<Student> {
    return this.modify(id, (current) => mergeStudentValues(current, input), ctx);
  }

  async delete(id: string, ctx: ActionContext): Promise<void> {
    try {
      await withRetry(this.pool, async (client) => {
        const students = new StudentQueries(client);
        const current = await students.findByIdForUpdate(id);
        if (!current) {
          throw new NotFoundError(STUDENT_NOT_FOUND);
        }

        await students.delete(id);

        // Журнал неизменяем, поэтому снимок удалённой записи — единственный её след.
        // Привязанная учётная запись не удаляется.
        await writeAuditLog(client, {
          actorUserId: ctx.userId,
          action: 'delete_student',
          entityType: 'students',
          entityId: id,
          details: { snapshot: toStudentValues(current), userId: current.user_id },
          ipAddress: ctx.ip,
        });
      });
    } catch (error) {
      throw translateStudentError(error);
    }
  }

  /**
   * Изменить студента. Новые значения вычисляются после блокировки строки:
   * иначе параллельное изменение другого поля было бы затёрто устаревшими данными.
   */
  private async modify(
    id: string,
    compute: (current: StudentValues) => StudentValues,
    ctx: ActionContext
  ): Promise<Student> {
    try {
      const row = await withRetry(this.pool, async (client) => {
        const students = new StudentQueries(client);
        const currentRow = await students.findByIdForUpdate(id);
        if (!currentRow) {
          throw new NotFoundError(STUDENT_NOT_FOUND);
        }

        const before = toStudentValues(currentRow);
        const updated = await students.update(id, compute(before));
        if (!updated) {
          throw new NotFoundError(STUDENT_NOT_FOUND);
        }

        await writeAuditLog(client, {
          actorUserId: ctx.userId,
          action: 'update_student',
          entityType: 'students',
          entityId: id,
          details: { before, after: toStudentValues(updated) },
          ipAddress: ctx.ip,
        });
        return updated;
      });
      return toStudent(row);
    } catch (error) {
      throw translateStudentError(error);
    }
  }
}