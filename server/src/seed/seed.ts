/**
 * Загрузка демонстрационных данных в базу.
 *
 * Всё выполняется на переданном клиенте и не открывает транзакцию само: её открывает
 * вызывающий код (команда seed или тест, который откатывает изменения), поэтому
 * при любой ошибке не сохраняется ничего. Данные записываются пакетными запросами
 * SQL (тысячи комнат и коек); правила предметной области защищены ограничениями базы.
 */

import type { PoolClient } from 'pg';
import { hashPassword } from '../utils/password.js';
import {
  DEMO_BUILDINGS,
  DEMO_STAFF,
  DEMO_STUDENTS,
  planContracts,
  planInvoices,
  planRooms,
} from './demo-data.js';

export interface SeedSummary {
  buildings: number;
  rooms: number;
  beds: number;
  staff: number;
  students: number;
  accounts: number;
  contracts: number;
  invoices: number;
  payments: number;
}

export interface SeedOptions {
  /** Пароль учётных записей демонстрационных студентов */
  password: string;
  bcryptRounds: number;
  /** Прибавляется к номерам зданий; нужен тестам, где номера 1–6 могут быть заняты */
  buildingNumberOffset?: number;
}

/** Сколько строк вставлять одним запросом (в запросе не более 65 535 параметров) */
const BATCH = 500;

/**
 * Вставка строк пакетами; возвращает вставленные строки в порядке запроса.
 * Имена таблицы и столбцов заданы в коде, значения передаются параметрами.
 */
async function insertRows<T extends Record<string, unknown>>(
  client: PoolClient,
  table: string,
  columns: string[],
  rows: unknown[][],
  returning: string
): Promise<T[]> {
  const result: T[] = [];
  for (let start = 0; start < rows.length; start += BATCH) {
    const chunk = rows.slice(start, start + BATCH);
    const params: unknown[] = [];
    const tuples = chunk.map((row) => {
      const placeholders = row.map((value) => {
        params.push(value);
        return `$${params.length}`;
      });
      return `(${placeholders.join(', ')})`;
    });
    const inserted = await client.query<T>(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${tuples.join(', ')} RETURNING ${returning}`,
      params
    );
    result.push(...inserted.rows);
  }
  return result;
}

function mustGet<K, V>(map: Map<K, V>, key: K): V {
  const value = map.get(key);
  if (value === undefined) {
    throw new Error(`Нет данных для ключа ${String(key)}`);
  }
  return value;
}

const toCents = (value: string): number => Math.round(Number(value) * 100);

export async function loadDemoData(client: PoolClient, options: SeedOptions): Promise<SeedSummary> {
  const offset = options.buildingNumberOffset ?? 0;
  const summary: SeedSummary = {
    buildings: 0,
    rooms: 0,
    beds: 0,
    staff: 0,
    students: 0,
    accounts: 0,
    contracts: 0,
    invoices: 0,
    payments: 0,
  };

  // Администратор нужен как автор договоров и платежей
  const admin = await client.query<{ id: string }>(
    "SELECT id FROM users WHERE role = 'admin' AND is_active ORDER BY created_at LIMIT 1"
  );
  if (admin.rows.length === 0) {
    throw new Error('Нет ни одного активного администратора: сначала выполните create-admin');
  }
  const adminId = admin.rows[0].id;

  // Здания
  const buildings = await insertRows<{ id: string; building_number: number }>(
    client,
    'buildings',
    ['building_number', 'address', 'metro_station', 'building_type', 'floors_count', 'monthly_rate'],
    DEMO_BUILDINGS.map((b) => [
      b.buildingNumber + offset,
      b.address,
      b.metroStation,
      b.buildingType,
      b.floorsCount,
      b.monthlyRate,
    ]),
    'id, building_number'
  );
  summary.buildings = buildings.length;
  const buildingIdByNumber = new Map(buildings.map((b) => [b.building_number - offset, b.id]));

  // Комнаты и койки: койка на каждое место вместимости
  const bedIdsByBuilding = new Map<number, string[]>();
  for (const building of DEMO_BUILDINGS) {
    const buildingId = mustGet(buildingIdByNumber, building.buildingNumber);
    const planned = planRooms(building);
    const rooms = await insertRows<{ id: string }>(
      client,
      'rooms',
      ['building_id', 'room_number', 'floor', 'capacity'],
      planned.map((room) => [buildingId, room.roomNumber, room.floor, room.capacity]),
      'id'
    );
    if (rooms.length !== planned.length) {
      throw new Error(`Здание ${building.buildingNumber}: создано комнат ${rooms.length} из ${planned.length}`);
    }
    summary.rooms += rooms.length;

    const bedRows: unknown[][] = [];
    rooms.forEach((room, index) => {
      for (let bed = 1; bed <= planned[index].capacity; bed++) {
        bedRows.push([room.id, bed]);
      }
    });
    const beds = await insertRows<{ id: string }>(
      client,
      'beds',
      ['room_id', 'bed_number'],
      bedRows,
      'id'
    );
    summary.beds += beds.length;
    // Порядок коек совпадает с порядком вставки: этаж, номер комнаты, номер койки
    bedIdsByBuilding.set(
      building.buildingNumber,
      beds.map((bed) => bed.id)
    );
  }

  // Сотрудники
  await insertRows(
    client,
    'building_staff',
    ['building_id', 'job_title', 'full_name', 'phone'],
    DEMO_STAFF.map((s) => [
      mustGet(buildingIdByNumber, s.buildingNumber),
      s.jobTitle,
      s.fullName,
      s.phone,
    ]),
    'id'
  );
  summary.staff = DEMO_STAFF.length;

  // Учётные записи студентов (пароль хешируется один раз)
  const passwordHash = await hashPassword(options.password, options.bcryptRounds);
  const accountEmails = DEMO_STUDENTS.flatMap((s) => (s.accountEmail ? [s.accountEmail] : []));
  const users = await insertRows<{ id: string; email: string }>(
    client,
    'users',
    ['email', 'password_hash', 'role'],
    accountEmails.map((email) => [email, passwordHash, 'student']),
    'id, email'
  );
  summary.accounts = users.length;
  const userIdByEmail = new Map(users.map((u) => [u.email, u.id]));

  // Студенты
  const students = await insertRows<{ id: string }>(
    client,
    'students',
    [
      'user_id',
      'student_number',
      'display_name',
      'last_name',
      'first_name',
      'middle_name',
      'birth_date',
      'phone',
      'faculty',
      'group_name',
      'education_level',
      'field_of_study',
      'program_code',
      'specialization',
      'study_year',
      'funding_type',
    ],
    DEMO_STUDENTS.map((s) => [
      s.accountEmail ? mustGet(userIdByEmail, s.accountEmail) : null,
      s.studentNumber,
      s.displayName,
      s.lastName,
      s.firstName,
      s.middleName,
      s.birthDate,
      s.phone,
      s.faculty,
      s.groupName,
      s.educationLevel,
      s.fieldOfStudy,
      s.programCode,
      s.specialization,
      s.studyYear,
      s.fundingType,
    ]),
    'id'
  );
  summary.students = students.length;

  // Договоры: создаются в статусе pending, затем переводятся в active
  const plannedContracts = planContracts();
  const rateByBuilding = new Map(DEMO_BUILDINGS.map((b) => [b.buildingNumber, b.monthlyRate]));
  const contracts = await insertRows<{ id: string }>(
    client,
    'contracts',
    ['student_id', 'bed_id', 'start_date', 'end_date', 'monthly_rate', 'created_by'],
    plannedContracts.map((contract) => {
      const bedId = bedIdsByBuilding.get(contract.buildingNumber)?.[contract.bedOrdinal];
      if (!bedId) {
        throw new Error(`В здании ${contract.buildingNumber} нет койки №${contract.bedOrdinal}`);
      }
      return [
        students[contract.studentIndex].id,
        bedId,
        contract.startDate,
        contract.endDate,
        mustGet(rateByBuilding, contract.buildingNumber),
        adminId,
      ];
    }),
    'id'
  );
  summary.contracts = contracts.length;
  await client.query("UPDATE contracts SET status = 'active' WHERE id = ANY($1::uuid[])", [
    contracts.map((c) => c.id),
  ]);

  // Счета: сумма равна ставке здания по договору
  const plannedInvoices = planInvoices();
  const invoices = await insertRows<{ id: string; amount: string }>(
    client,
    'invoices',
    ['contract_id', 'description', 'amount', 'issue_date', 'due_date'],
    plannedInvoices.map((invoice) => [
      contracts[invoice.contractIndex].id,
      invoice.description,
      mustGet(rateByBuilding, plannedContracts[invoice.contractIndex].buildingNumber),
      invoice.issueDate,
      invoice.dueDate,
    ]),
    'id, amount'
  );
  summary.invoices = invoices.length;

  // Платежи и статусы счетов
  const paymentRows: unknown[][] = [];
  const fullyPaid: string[] = [];
  const partlyPaid: string[] = [];
  plannedInvoices.forEach((planned, index) => {
    if (!planned.payment) {
      return;
    }
    const invoice = invoices[index];
    const totalCents = toCents(invoice.amount);
    const cents = planned.payment.share === 'full' ? totalCents : Math.floor(totalCents / 2);
    paymentRows.push([
      invoice.id,
      (cents / 100).toFixed(2),
      planned.payment.method,
      planned.payment.reference,
      adminId,
    ]);
    (planned.payment.share === 'full' ? fullyPaid : partlyPaid).push(invoice.id);
  });
  await insertRows(
    client,
    'payments',
    ['invoice_id', 'amount', 'method', 'reference', 'recorded_by'],
    paymentRows,
    'id'
  );
  summary.payments = paymentRows.length;
  await client.query("UPDATE invoices SET status = 'paid' WHERE id = ANY($1::uuid[])", [fullyPaid]);
  await client.query("UPDATE invoices SET status = 'partially_paid' WHERE id = ANY($1::uuid[])", [
    partlyPaid,
  ]);

  // Одна запись аудита: команда выполняется без автора, пароль в журнал не попадает
  await client.query(
    "INSERT INTO audit_logs (actor_user_id, action, entity_type, details) VALUES (NULL, 'seed_data', NULL, $1::jsonb)",
    [JSON.stringify(summary)]
  );

  return summary;
}