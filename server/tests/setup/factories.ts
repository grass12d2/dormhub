/**
 * Фабрики тестовых данных.
 *
 * Каждая фабрика создаёт запись с уникальными значениями, поэтому тесты
 * не мешают друг другу. Очистка таблиц не нужна: база пересоздаётся
 * перед каждым запуском интеграционных тестов.
 * Пароли и адреса вымышленные.
 */

import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

/** Всё, что нужно фабрикам от пула соединений */
export type Db = Pick<Pool, 'query'>;

export type UserRole = 'admin' | 'student';
export type ContractStatus = 'pending' | 'active' | 'terminated' | 'expired' | 'cancelled';

let sequence = 0;

/** Следующее число последовательности в пределах одного тестового файла */
export function nextNumber(): number {
  sequence += 1;
  return sequence;
}

export async function createUser(db: Db, role: UserRole = 'admin'): Promise<string> {
  const result = await db.query<{ id: string }>(
    'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id',
    [`user-${randomUUID()}@example.com`, 'test-hash-not-real', role]
  );
  return result.rows[0].id;
}

export async function createBuilding(db: Db, floorsCount = 5): Promise<string> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO buildings (building_number, address, building_type, floors_count, monthly_rate)
     VALUES ((SELECT COALESCE(max(building_number), 0) + 1 FROM buildings), $1, 'corridor', $2, 700)
     RETURNING id`,
    ['Тестовый адрес', floorsCount]
  );
  return result.rows[0].id;
}

export interface RoomOptions {
  roomNumber?: string;
  floor?: number;
  capacity?: number;
}

export async function createRoom(
  db: Db,
  buildingId: string,
  options: RoomOptions = {}
): Promise<string> {
  const { roomNumber = String(nextNumber()), floor = 1, capacity = 4 } = options;
  const result = await db.query<{ id: string }>(
    `INSERT INTO rooms (building_id, room_number, floor, capacity)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [buildingId, roomNumber, floor, capacity]
  );
  return result.rows[0].id;
}

export async function createBed(db: Db, roomId: string, bedNumber = 1): Promise<string> {
  const result = await db.query<{ id: string }>(
    'INSERT INTO beds (room_id, bed_number) VALUES ($1, $2) RETURNING id',
    [roomId, bedNumber]
  );
  return result.rows[0].id;
}

/** Студент с уникальным семизначным номером; учётная запись необязательна */
export async function createStudent(db: Db, userId: string | null = null): Promise<string> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO students (student_number, display_name, birth_date, user_id)
     VALUES (
       (SELECT lpad((COALESCE(max(student_number::bigint), 0) + 1)::text, 7, '0') FROM students),
       $1, '2005-01-01', $2
     )
     RETURNING id`,
    ['Тестовый Студент', userId]
  );
  return result.rows[0].id;
}

export interface ContractParams {
  studentId: string;
  bedId: string;
  startDate: string;
  endDate: string;
  createdBy: string;
  status?: ContractStatus;
}

export async function createContract(db: Db, params: ContractParams): Promise<string> {
  const { studentId, bedId, startDate, endDate, createdBy, status = 'pending' } = params;
  const result = await db.query<{ id: string }>(
    `INSERT INTO contracts
       (student_id, bed_id, start_date, end_date, monthly_rate, status, created_by, terminated_at)
     VALUES
       ($1, $2, $3, $4, 1000, $5, $6, CASE WHEN $5::text = 'terminated' THEN now() END)
     RETURNING id`,
    [studentId, bedId, startDate, endDate, status, createdBy]
  );
  return result.rows[0].id;
}