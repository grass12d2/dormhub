/**
 * Сервис договоров.
 *
 * Койка и студент связываются договором. Правила:
 *  - на одну койку нельзя оформить пересекающиеся ожидающие и действующие договоры
 *    (ограничение GiST в базе данных);
 *  - у студента не больше одного ожидающего или действующего договора;
 *  - койку на обслуживании занять нельзя. При оформлении койка блокируется
 *    (FOR SHARE), а перевод койки на обслуживание берёт блокировку FOR UPDATE,
 *    поэтому они не могут пройти одновременно.
 * Число коек в комнате не превышает вместимость, на койке один договор,
 * значит число проживающих не превышает вместимость комнаты.
 * Запись данных и запись аудита выполняются в одной транзакции на одном клиенте.
 */

import type { Pool } from 'pg';
import { ContractQueries } from '../db/queries/contracts.js';
import { StudentQueries } from '../db/queries/students.js';
import { withRetry } from '../db/transaction.js';
import type { AuthenticatedUser } from '../types/auth.js';
import {
  toContract,
  toContractTerms,
  type Contract,
  type ContractRow,
  type ContractStatus,
  type ContractTerms,
} from '../types/contracts.js';
import { writeAuditLog } from '../utils/audit.js';
import { isDbError } from '../utils/db-errors.js';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnprocessableError,
} from '../utils/errors.js';
import type {
  CreateContractInput,
  ListContractsQuery,
  PatchContractInput,
} from '../validation/contracts.validation.js';
import type { ActionContext } from './buildings.service.js';

const CONTRACT_NOT_FOUND = 'Договор не найден';
const PROFILE_NOT_FOUND = 'Профиль студента не найден';

const STATUS_LABELS: Record<ContractStatus, string> = {
  pending: 'ожидает',
  active: 'действует',
  terminated: 'расторгнут',
  expired: 'истёк',
  cancelled: 'отменён',
};

type ContractAction = 'activate' | 'cancel' | 'terminate' | 'expire';

/** Допустимые переходы между статусами */
const TRANSITIONS: Record<ContractAction, { from: ContractStatus; to: ContractStatus }> = {
  activate: { from: 'pending', to: 'active' },
  cancel: { from: 'pending', to: 'cancelled' },
  terminate: { from: 'active', to: 'terminated' },
  expire: { from: 'active', to: 'expired' },
};

export interface ContractsPage {
  items: Contract[];
  total: number;
  limit: number;
  offset: number;
}

/** Применить PATCH: отсутствующее поле сохраняет текущее значение */
export function mergeContractTerms(current: ContractTerms, patch: PatchContractInput): ContractTerms {
  return {
    startDate: patch.startDate ?? current.startDate,
    endDate: patch.endDate ?? current.endDate,
    monthlyRate: patch.monthlyRate ?? current.monthlyRate,
  };
}

/** Снимок договора для журнала аудита */
function toSnapshot(row: ContractRow) {
  return {
    studentId: row.student_id,
    bedId: row.bed_id,
    status: row.status,
    ...toContractTerms(row),
  };
}

/** Преобразовать нарушения ограничений базы в понятные ошибки приложения */
function translateContractError(error: unknown): unknown {
  if (isDbError(error, '23P01', 'contracts_bed_no_overlap')) {
    return new ConflictError('Койка уже занята на выбранный период');
  }
  if (isDbError(error, '23505', 'idx_contracts_one_live')) {
    return new ConflictError('У студента уже есть ожидающий или действующий договор');
  }
  if (isDbError(error, '23503', 'contracts_student_id_fkey')) {
    return new UnprocessableError('Студент не найден');
  }
  return error;
}

export class ContractsService {
  constructor(private readonly pool: Pool) {}

  async list(query: ListContractsQuery): Promise<ContractsPage> {
    const page = await new ContractQueries(this.pool).findPage(query);
    return {
      items: page.rows.map(toContract),
      total: page.total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  /** Договоры студента, привязанного к учётной записи пользователя */
  async listMine(userId: string): Promise<Contract[]> {
    const student = await new StudentQueries(this.pool).findByUserId(userId);
    if (!student) {
      throw new NotFoundError(PROFILE_NOT_FOUND);
    }
    const rows = await new ContractQueries(this.pool).findByStudentId(student.id);
    return rows.map(toContract);
  }

  /** Администратор видит любой договор, студент — только свой (чужой выглядит как «не найден») */
  async get(id: string, viewer: AuthenticatedUser): Promise<Contract> {
    const row = await new ContractQueries(this.pool).findById(id);
    if (!row) {
      throw new NotFoundError(CONTRACT_NOT_FOUND);
    }
    if (viewer.role !== 'admin') {
      const student = await new StudentQueries(this.pool).findByUserId(viewer.id);
      if (!student || student.id !== row.student_id) {
        throw new NotFoundError(CONTRACT_NOT_FOUND);
      }
    }
    return toContract(row);
  }

  async create(input: CreateContractInput, ctx: ActionContext): Promise<Contract> {
    try {
      const row = await withRetry(this.pool, async (client) => {
        const contracts = new ContractQueries(client);

        const bed = await contracts.lockBedForShare(input.bedId);
        if (!bed) {
          throw new UnprocessableError('Койка не найдена');
        }
        if (bed.status !== 'available') {
          throw new ConflictError('Койка на обслуживании: оформить договор нельзя');
        }

        const created = await contracts.insert({
          studentId: input.studentId,
          bedId: input.bedId,
          startDate: input.startDate,
          endDate: input.endDate,
          monthlyRate: input.monthlyRate ?? Number(bed.monthly_rate),
          createdBy: ctx.userId,
        });
        await writeAuditLog(client, {
          actorUserId: ctx.userId,
          action: 'create_contract',
          entityType: 'contracts',
          entityId: created.id,
          details: { after: toSnapshot(created) },
          ipAddress: ctx.ip,
        });
        return created;
      });
      return toContract(row);
    } catch (error) {
      throw translateContractError(error);
    }
  }

  /** PATCH: даты и ставка, только пока договор ожидает */
  async patch(id: string, input: PatchContractInput, ctx: ActionContext): Promise<Contract> {
    try {
      const row = await withRetry(this.pool, async (client) => {
        const contracts = new ContractQueries(client);
        const current = await contracts.findByIdForUpdate(id);
        if (!current) {
          throw new NotFoundError(CONTRACT_NOT_FOUND);
        }
        if (current.status !== 'pending') {
          throw new ConflictError('Изменять можно только договор в статусе «ожидает»');
        }

        const next = mergeContractTerms(toContractTerms(current), input);
        if (next.endDate <= next.startDate) {
          throw new BadRequestError('Дата окончания должна быть позже даты начала');
        }

        const updated = await contracts.updateTerms(id, next);
        if (!updated) {
          throw new NotFoundError(CONTRACT_NOT_FOUND);
        }
        await writeAuditLog(client, {
          actorUserId: ctx.userId,
          action: 'update_contract',
          entityType: 'contracts',
          entityId: id,
          details: { before: toSnapshot(current), after: toSnapshot(updated) },
          ipAddress: ctx.ip,
        });
        return updated;
      });
      return toContract(row);
    } catch (error) {
      throw translateContractError(error);
    }
  }

  activate(id: string, ctx: ActionContext): Promise<Contract> {
    return this.transition(id, 'activate', ctx);
  }

  cancel(id: string, ctx: ActionContext): Promise<Contract> {
    return this.transition(id, 'cancel', ctx);
  }

  terminate(id: string, reason: string | undefined, ctx: ActionContext): Promise<Contract> {
    return this.transition(id, 'terminate', ctx, reason ?? null);
  }

  /** Завершить договор, срок которого истёк (дата окончания не позже сегодняшней) */
  expire(id: string, ctx: ActionContext): Promise<Contract> {
    return this.transition(id, 'expire', ctx);
  }

  /**
   * Перевод договора в новый статус: строка договора блокируется, проверяется
   * текущий статус, обновление и аудит выполняются в одной транзакции.
   */
  private async transition(
    id: string,
    action: ContractAction,
    ctx: ActionContext,
    reason: string | null = null
  ): Promise<Contract> {
    const rule = TRANSITIONS[action];

    const row = await withRetry(this.pool, async (client) => {
      const contracts = new ContractQueries(client);
      const current = await contracts.findByIdForUpdate(id);
      if (!current) {
        throw new NotFoundError(CONTRACT_NOT_FOUND);
      }
      if (current.status !== rule.from) {
        throw new ConflictError(
          `Недопустимое действие: договор в статусе «${STATUS_LABELS[current.status]}»`
        );
      }
      if (action === 'expire' && current.end_date > (await contracts.currentDate())) {
        throw new ConflictError('Срок договора ещё не истёк');
      }

      const updated = await contracts.updateStatus(id, rule.to, reason);
      if (!updated) {
        throw new NotFoundError(CONTRACT_NOT_FOUND);
      }
      await writeAuditLog(client, {
        actorUserId: ctx.userId,
        action: `${action}_contract`,
        entityType: 'contracts',
        entityId: id,
        details: {
          before: { status: current.status },
          after: { status: updated.status },
          ...(reason !== null ? { reason } : {}),
        },
        ipAddress: ctx.ip,
      });
      return updated;
    });
    return toContract(row);
  }
}