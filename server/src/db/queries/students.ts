/**
 * Запросы к таблице students.
 * Дата рождения приводится к тексту (ГГГГ-ММ-ДД): драйвер pg превращает date
 * в объект Date по часовому поясу машины, и дата сдвигалась бы на сутки.
 */

import type { StudentRow, StudentValues } from '../../types/students.js';
import type { Queryable } from '../queryable.js';

const COLUMNS = `id, user_id, student_number, display_name, last_name, first_name, middle_name,
  birth_date::text AS birth_date, phone, faculty, group_name, education_level, field_of_study,
  program_code, specialization, study_year, funding_type, created_at, updated_at`;

/** Условие поиска: начало отображаемого имени (без учёта регистра) или номера студенческого */
const SEARCH_CONDITION = `($1::text IS NULL
  OR lower(display_name) LIKE lower($1) ESCAPE '\\'
  OR student_number LIKE $1 ESCAPE '\\')`;

/** Экранировать служебные символы шаблона LIKE */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export interface StudentPage {
  rows: StudentRow[];
  total: number;
}

export class StudentQueries {
  constructor(private readonly db: Queryable) {}

  async findPage(params: { q?: string; limit: number; offset: number }): Promise<StudentPage> {
    const pattern = params.q === undefined ? null : `${escapeLike(params.q)}%`;

    const count = await this.db.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM students WHERE ${SEARCH_CONDITION}`,
      [pattern]
    );
    const rows = await this.db.query<StudentRow>(
      `SELECT ${COLUMNS} FROM students
       WHERE ${SEARCH_CONDITION}
       ORDER BY display_name, id
       LIMIT $2 OFFSET $3`,
      [pattern, params.limit, params.offset]
    );
    return { rows: rows.rows, total: count.rows[0]?.total ?? 0 };
  }

  async findById(id: string): Promise<StudentRow | null> {
    const result = await this.db.query<StudentRow>(
      `SELECT ${COLUMNS} FROM students WHERE id = $1`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  async findByUserId(userId: string): Promise<StudentRow | null> {
    const result = await this.db.query<StudentRow>(
      `SELECT ${COLUMNS} FROM students WHERE user_id = $1`,
      [userId]
    );
    return result.rows[0] ?? null;
  }

  /** Блокировка строки студента на запись до конца транзакции */
  async findByIdForUpdate(id: string): Promise<StudentRow | null> {
    const result = await this.db.query<StudentRow>(
      `SELECT ${COLUMNS} FROM students WHERE id = $1 FOR UPDATE`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  async create(userId: string | null, values: StudentValues): Promise<StudentRow> {
    const result = await this.db.query<StudentRow>(
      `INSERT INTO students
         (user_id, student_number, display_name, last_name, first_name, middle_name, birth_date,
          phone, faculty, group_name, education_level, field_of_study, program_code,
          specialization, study_year, funding_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       RETURNING ${COLUMNS}`,
      [
        userId,
        values.studentNumber,
        values.displayName,
        values.lastName,
        values.firstName,
        values.middleName,
        values.birthDate,
        values.phone,
        values.faculty,
        values.groupName,
        values.educationLevel,
        values.fieldOfStudy,
        values.programCode,
        values.specialization,
        values.studyYear,
        values.fundingType,
      ]
    );
    return result.rows[0];
  }

  /** Связь с учётной записью не меняется */
  async update(id: string, values: StudentValues): Promise<StudentRow | null> {
    const result = await this.db.query<StudentRow>(
      `UPDATE students
       SET student_number = $2, display_name = $3, last_name = $4, first_name = $5,
           middle_name = $6, birth_date = $7, phone = $8, faculty = $9, group_name = $10,
           education_level = $11, field_of_study = $12, program_code = $13,
           specialization = $14, study_year = $15, funding_type = $16
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [
        id,
        values.studentNumber,
        values.displayName,
        values.lastName,
        values.firstName,
        values.middleName,
        values.birthDate,
        values.phone,
        values.faculty,
        values.groupName,
        values.educationLevel,
        values.fieldOfStudy,
        values.programCode,
        values.specialization,
        values.studyYear,
        values.fundingType,
      ]
    );
    return result.rows[0] ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.query('DELETE FROM students WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }
}