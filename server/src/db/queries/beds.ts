/**
 * Запросы к таблице beds.
 */

import type { BedRow, BedValues } from '../../types/beds.js';
import type { Queryable } from '../queryable.js';

const COLUMNS = 'id, room_id, bed_number, status, created_at, updated_at';

export class BedQueries {
  constructor(private readonly db: Queryable) {}

  /** Все койки (или койки одной комнаты) по зданию, этажу, комнате и номеру койки */
  async findAll(roomId?: string): Promise<BedRow[]> {
    const result = await this.db.query<BedRow>(
      `SELECT b.id, b.room_id, b.bed_number, b.status, b.created_at, b.updated_at
       FROM beds b
       JOIN rooms r ON r.id = b.room_id
       JOIN buildings bl ON bl.id = r.building_id
       WHERE ($1::uuid IS NULL OR b.room_id = $1::uuid)
       ORDER BY bl.building_number, r.floor, r.room_number, b.bed_number`,
      [roomId ?? null]
    );
    return result.rows;
  }

  async findById(id: string): Promise<BedRow | null> {
    const result = await this.db.query<BedRow>(`SELECT ${COLUMNS} FROM beds WHERE id = $1`, [id]);
    return result.rows[0] ?? null;
  }

  /** Блокировка строки койки на запись до конца транзакции */
  async findByIdForUpdate(id: string): Promise<BedRow | null> {
    const result = await this.db.query<BedRow>(
      `SELECT ${COLUMNS} FROM beds WHERE id = $1 FOR UPDATE`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  async countByRoomId(roomId: string): Promise<number> {
    const result = await this.db.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM beds WHERE room_id = $1',
      [roomId]
    );
    return result.rows[0]?.count ?? 0;
  }

  /**
   * Блокирует койки комнаты в порядке возрастания идентификатора
   * и возвращает их число.
   */
  async lockByRoomId(roomId: string): Promise<number> {
    const result = await this.db.query(
      'SELECT id FROM beds WHERE room_id = $1 ORDER BY id FOR UPDATE',
      [roomId]
    );
    return result.rows.length;
  }

  async create(values: BedValues): Promise<BedRow> {
    const result = await this.db.query<BedRow>(
      `INSERT INTO beds (room_id, bed_number, status)
       VALUES ($1, $2, $3)
       RETURNING ${COLUMNS}`,
      [values.roomId, values.bedNumber, values.status]
    );
    return result.rows[0];
  }

  /** Комната не меняется: обновляются только номер и статус */
  async update(id: string, values: BedValues): Promise<BedRow | null> {
    const result = await this.db.query<BedRow>(
      `UPDATE beds SET bed_number = $2, status = $3
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [id, values.bedNumber, values.status]
    );
    return result.rows[0] ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.query('DELETE FROM beds WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }
}