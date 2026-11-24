/**
 * Запросы к таблице contracts.
 * Даты приводятся к тексту (ГГГГ-ММ-ДД): драйвер pg превращает date в объект Date
 * по часовому поясу машины, и дата сдвигалась бы на сутки.
 */

import type { ContractRow, ContractStatus, ContractTerms } from '../../types/contracts.js';
import type { Queryable } from '../queryable.js';

const COLUMNS = `id, student_id, bed_id, start_date::text AS start_date, end_date::text AS end_date,
  monthly_rate, status, created_by, terminated_at, termination_reason, created_at, updated_at`;

const FILTER = `($1::uuid IS NULL OR student_id = $1::uuid)
  AND ($2::uuid IS NULL OR bed_id = $2::uuid)
  AND ($3::text IS NULL OR status = $3::text)`;

export interface NewContract extends ContractTerms {
  studentId: string;
  bedId: string;
  createdBy: string;
}

export interface BedForContract {
  id: string;
  status: string;
  /** Ставка общежития, в котором стоит койка */
  monthly_rate: string;
}

export interface ContractPage {
  rows: ContractRow[];
  total: number;
}

export class ContractQueries {
  constructor(private readonly db: Queryable) {}

  async findPage(params: {
    studentId?: string;
    bedId?: string;
    status?: ContractStatus;
    limit: number;
    offset: number;
  }): Promise<ContractPage> {
    const filter = [params.studentId ?? null, params.bedId ?? null, params.status ?? null];

    const count = await this.db.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM contracts WHERE ${FILTER}`,
      filter
    );
    const rows = await this.db.query<ContractRow>(
      `SELECT ${COLUMNS} FROM contracts
       WHERE ${FILTER}
       ORDER BY contracts.start_date DESC, contracts.id
       LIMIT $4 OFFSET $5`,
      [...filter, params.limit, params.offset]
    );
    return { rows: rows.rows, total: count.rows[0]?.total ?? 0 };
  }

  /** Все договоры студента, новые первыми */
  async findByStudentId(studentId: string): Promise<ContractRow[]> {
    const result = await this.db.query<ContractRow>(
      `SELECT ${COLUMNS} FROM contracts WHERE student_id = $1
       ORDER BY contracts.start_date DESC, contracts.id`,
      [studentId]
    );
    return result.rows;
  }

  async findById(id: string): Promise<ContractRow | null> {
    const result = await this.db.query<ContractRow>(
      `SELECT ${COLUMNS} FROM contracts WHERE id = $1`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  /** Блокировка строки договора на запись до конца транзакции */
  async findByIdForUpdate(id: string): Promise<ContractRow | null> {
    const result = await this.db.query<ContractRow>(
      `SELECT ${COLUMNS} FROM contracts WHERE id = $1 FOR UPDATE`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  /**
   * Общая блокировка койки: койку нельзя перевести на обслуживание, пока идёт
   * оформление договора. Возвращает также ставку общежития.
   */
  async lockBedForShare(bedId: string): Promise<BedForContract | null> {
    const result = await this.db.query<BedForContract>(
      `SELECT b.id, b.status, bl.monthly_rate
       FROM beds b
       JOIN rooms r ON r.id = b.room_id
       JOIN buildings bl ON bl.id = r.building_id
       WHERE b.id = $1
       FOR SHARE OF b`,
      [bedId]
    );
    return result.rows[0] ?? null;
  }

  /** Есть ли по койке ожидающий или действующий договор */
  async hasLiveByBed(bedId: string): Promise<boolean> {
    const result = await this.db.query(
      "SELECT 1 FROM contracts WHERE bed_id = $1 AND status IN ('pending', 'active') LIMIT 1",
      [bedId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** Текущая дата базы данных (ГГГГ-ММ-ДД) */
  async currentDate(): Promise<string> {
    const result = await this.db.query<{ today: string }>('SELECT current_date::text AS today');
    return result.rows[0].today;
  }

  /** Новый договор всегда создаётся в статусе pending */
  async insert(values: NewContract): Promise<ContractRow> {
    const result = await this.db.query<ContractRow>(
      `INSERT INTO contracts (student_id, bed_id, start_date, end_date, monthly_rate, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${COLUMNS}`,
      [
        values.studentId,
        values.bedId,
        values.startDate,
        values.endDate,
        values.monthlyRate,
        values.createdBy,
      ]
    );
    return result.rows[0];
  }

  async updateTerms(id: string, terms: ContractTerms): Promise<ContractRow | null> {
    const result = await this.db.query<ContractRow>(
      `UPDATE contracts SET start_date = $2, end_date = $3, monthly_rate = $4
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [id, terms.startDate, terms.endDate, terms.monthlyRate]
    );
    return result.rows[0] ?? null;
  }

  /** Время и причина расторжения заполняются только для статуса terminated */
  async updateStatus(
    id: string,
    status: ContractStatus,
    reason: string | null
  ): Promise<ContractRow | null> {
    const result = await this.db.query<ContractRow>(
      `UPDATE contracts
       SET status = $2::text,
           terminated_at = CASE WHEN $2::text = 'terminated' THEN now() ELSE NULL END,
           termination_reason = $3::text
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [id, status, reason]
    );
    return result.rows[0] ?? null;
  }
}