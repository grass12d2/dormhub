/**
 * Запросы к таблице rooms.
 */

import type { RoomRow, RoomValues } from '../../types/rooms.js';
import type { Queryable } from '../queryable.js';

const COLUMNS = 'id, building_id, room_number, floor, capacity, created_at, updated_at';
const ALIASED_COLUMNS = COLUMNS.split(', ')
  .map((column) => `r.${column}`)
  .join(', ');

export class RoomQueries {
  constructor(private readonly db: Queryable) {}

  /** Все комнаты (или комнаты одного здания) по номеру здания, этажу и номеру комнаты */
  async findAll(buildingId?: string): Promise<RoomRow[]> {
    const result = await this.db.query<RoomRow>(
      `SELECT ${ALIASED_COLUMNS}
       FROM rooms r
       JOIN buildings b ON b.id = r.building_id
       WHERE ($1::uuid IS NULL OR r.building_id = $1::uuid)
       ORDER BY b.building_number, r.floor, r.room_number`,
      [buildingId ?? null]
    );
    return result.rows;
  }

  async findById(id: string): Promise<RoomRow | null> {
    const result = await this.db.query<RoomRow>(
      `SELECT ${COLUMNS} FROM rooms WHERE id = $1`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  /** Блокировка строки комнаты на запись до конца транзакции */
  async findByIdForUpdate(id: string): Promise<RoomRow | null> {
    const result = await this.db.query<RoomRow>(
      `SELECT ${COLUMNS} FROM rooms WHERE id = $1 FOR UPDATE`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  async create(values: RoomValues): Promise<RoomRow> {
    const result = await this.db.query<RoomRow>(
      `INSERT INTO rooms (building_id, room_number, floor, capacity)
       VALUES ($1, $2, $3, $4)
       RETURNING ${COLUMNS}`,
      [values.buildingId, values.roomNumber, values.floor, values.capacity]
    );
    return result.rows[0];
  }

  async update(id: string, values: RoomValues): Promise<RoomRow | null> {
    const result = await this.db.query<RoomRow>(
      `UPDATE rooms
       SET building_id = $2, room_number = $3, floor = $4, capacity = $5
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [id, values.buildingId, values.roomNumber, values.floor, values.capacity]
    );
    return result.rows[0] ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.query('DELETE FROM rooms WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }
}