/**
 * Сервис «Моё жильё»: действующее проживание студента и его соседи по комнате.
 * Только чтение. Студент видит только свои данные; соседи — только имена и группы.
 */

import type { Pool } from 'pg';
import { StudentQueries } from '../db/queries/students.js';
import type { Residence } from '../types/residence.js';
import { NotFoundError } from '../utils/errors.js';

interface ResidenceRow {
  contract_id: string;
  start_date: string;
  end_date: string;
  monthly_rate: string;
  room_id: string;
  building_number: number;
  address: string;
  metro_station: string | null;
  floor: number;
  room_number: string;
  bed_number: number;
}

interface RoommateRow {
  display_name: string;
  group_name: string | null;
}

export class ResidenceService {
  constructor(private readonly pool: Pool) {}

  /** Действующий договор студента; null, если сейчас он нигде не проживает */
  async getMine(userId: string): Promise<Residence | null> {
    const student = await new StudentQueries(this.pool).findByUserId(userId);
    if (!student) {
      throw new NotFoundError('Профиль студента не найден');
    }

    const current = await this.pool.query<ResidenceRow>(
      `SELECT c.id AS contract_id, c.start_date::text AS start_date, c.end_date::text AS end_date,
              c.monthly_rate::text AS monthly_rate, r.id AS room_id,
              bl.building_number, bl.address, bl.metro_station,
              r.floor, r.room_number, b.bed_number
       FROM contracts c
       JOIN beds b ON b.id = c.bed_id
       JOIN rooms r ON r.id = b.room_id
       JOIN buildings bl ON bl.id = r.building_id
       WHERE c.student_id = $1 AND c.status = 'active'
       LIMIT 1`,
      [student.id]
    );
    const row = current.rows[0];
    if (!row) {
      return null;
    }

    const mates = await this.pool.query<RoommateRow>(
      `SELECT s.display_name, s.group_name
       FROM contracts c
       JOIN beds b ON b.id = c.bed_id
       JOIN students s ON s.id = c.student_id
       WHERE b.room_id = $1 AND c.status = 'active' AND c.student_id <> $2
       ORDER BY s.display_name`,
      [row.room_id, student.id]
    );

    return {
      contractId: row.contract_id,
      startDate: row.start_date,
      endDate: row.end_date,
      monthlyRate: Number(row.monthly_rate),
      buildingNumber: row.building_number,
      address: row.address,
      metroStation: row.metro_station,
      floor: row.floor,
      roomNumber: row.room_number,
      bedNumber: row.bed_number,
      roommates: mates.rows.map((m) => ({ displayName: m.display_name, groupName: m.group_name })),
    };
  }
}