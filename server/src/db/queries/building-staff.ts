/**
 * Запросы к таблице building_staff.
 */

import type { StaffRow, StaffValues } from '../../types/buildings.js';
import type { Queryable } from '../queryable.js';

const COLUMNS = 'id, building_id, job_title, full_name, phone, created_at, updated_at';

export class BuildingStaffQueries {
  constructor(private readonly db: Queryable) {}

  async findByBuilding(buildingId: string): Promise<StaffRow[]> {
    const result = await this.db.query<StaffRow>(
      `SELECT ${COLUMNS} FROM building_staff WHERE building_id = $1 ORDER BY created_at, id`,
      [buildingId]
    );
    return result.rows;
  }

  /** Сотрудник именно этого общежития, с блокировкой строки */
  async findInBuildingForUpdate(buildingId: string, staffId: string): Promise<StaffRow | null> {
    const result = await this.db.query<StaffRow>(
      `SELECT ${COLUMNS} FROM building_staff WHERE id = $2 AND building_id = $1 FOR UPDATE`,
      [buildingId, staffId]
    );
    return result.rows[0] ?? null;
  }

  async create(buildingId: string, values: StaffValues): Promise<StaffRow> {
    const result = await this.db.query<StaffRow>(
      `INSERT INTO building_staff (building_id, job_title, full_name, phone)
       VALUES ($1, $2, $3, $4)
       RETURNING ${COLUMNS}`,
      [buildingId, values.jobTitle, values.fullName, values.phone]
    );
    return result.rows[0];
  }

  async update(id: string, values: StaffValues): Promise<StaffRow | null> {
    const result = await this.db.query<StaffRow>(
      `UPDATE building_staff SET job_title = $2, full_name = $3, phone = $4
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [id, values.jobTitle, values.fullName, values.phone]
    );
    return result.rows[0] ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.query('DELETE FROM building_staff WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }
}