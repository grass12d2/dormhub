/**
 * Запросы к таблице buildings.
 * Транзакциями управляет сервис; здесь только SQL.
 */

import type { BuildingRow, BuildingValues } from '../../types/buildings.js';
import type { Queryable } from '../queryable.js';

const COLUMNS =
  'id, building_number, address, metro_station, building_type, floors_count, monthly_rate, created_at, updated_at';

export class BuildingQueries {
  constructor(private readonly db: Queryable) {}

  async findAll(): Promise<BuildingRow[]> {
    const result = await this.db.query<BuildingRow>(
      `SELECT ${COLUMNS} FROM buildings ORDER BY building_number`
    );
    return result.rows;
  }

  async findById(id: string): Promise<BuildingRow | null> {
    const result = await this.db.query<BuildingRow>(
      `SELECT ${COLUMNS} FROM buildings WHERE id = $1`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  /** Блокировка строки здания на запись до конца транзакции */
  async findByIdForUpdate(id: string): Promise<BuildingRow | null> {
    const result = await this.db.query<BuildingRow>(
      `SELECT ${COLUMNS} FROM buildings WHERE id = $1 FOR UPDATE`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  /** Наибольший этаж среди комнат здания; null, если комнат нет */
  async maxRoomFloor(buildingId: string): Promise<number | null> {
    const result = await this.db.query<{ max_floor: number | null }>(
      'SELECT max(floor) AS max_floor FROM rooms WHERE building_id = $1',
      [buildingId]
    );
    return result.rows[0]?.max_floor ?? null;
  }

  async create(values: BuildingValues): Promise<BuildingRow> {
    const result = await this.db.query<BuildingRow>(
      `INSERT INTO buildings
         (building_number, address, metro_station, building_type, floors_count, monthly_rate)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${COLUMNS}`,
      [
        values.buildingNumber,
        values.address,
        values.metroStation,
        values.buildingType,
        values.floorsCount,
        values.monthlyRate,
      ]
    );
    return result.rows[0];
  }

  async update(id: string, values: BuildingValues): Promise<BuildingRow | null> {
    const result = await this.db.query<BuildingRow>(
      `UPDATE buildings
       SET building_number = $2, address = $3, metro_station = $4,
           building_type = $5, floors_count = $6, monthly_rate = $7
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [
        id,
        values.buildingNumber,
        values.address,
        values.metroStation,
        values.buildingType,
        values.floorsCount,
        values.monthlyRate,
      ]
    );
    return result.rows[0] ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.query('DELETE FROM buildings WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }
}