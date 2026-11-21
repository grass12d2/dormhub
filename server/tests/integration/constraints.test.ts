import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { expectDbError } from '../setup/db-assert.js';
import {
  createBed,
  createBuilding,
  createRoom,
  createStudent,
  createUser,
} from '../setup/factories.js';
import { createTestPool } from '../setup/test-db.js';

const pool = createTestPool();

afterAll(async () => {
  await pool.end();
});

/** Следующий свободный номер здания (чтобы проверять другие ограничения) */
const NEXT_BUILDING_NUMBER = '(SELECT COALESCE(max(building_number), 0) + 1 FROM buildings)';

describe('пользователи', () => {
  it('отклоняет email в верхнем регистре', async () => {
    await expectDbError(
      pool.query(
        "INSERT INTO users (email, password_hash, role) VALUES ('Upper@Example.com', 'x', 'admin')"
      ),
      { code: '23514', constraint: 'users_email_check' }
    );
  });

  it('отклоняет неизвестную роль', async () => {
    await expectDbError(
      pool.query(
        "INSERT INTO users (email, password_hash, role) VALUES ('role-test@example.com', 'x', 'manager')"
      ),
      { code: '23514', constraint: 'users_role_check' }
    );
  });

  it('отклоняет повторный email', async () => {
    const email = `dup-${randomUUID()}@example.com`;
    const sql = "INSERT INTO users (email, password_hash, role) VALUES ($1, 'x', 'admin')";
    await pool.query(sql, [email]);
    await expectDbError(pool.query(sql, [email]), {
      code: '23505',
      constraint: 'users_email_key',
    });
  });
});

describe('студенты', () => {
  function insertStudentNumber(studentNumber: string) {
    return pool.query(
      "INSERT INTO students (student_number, display_name, birth_date) VALUES ($1, 'Тест', '2005-01-01')",
      [studentNumber]
    );
  }

  it.each(['123456', '12345678', '12a4567', ''])(
    'отклоняет номер студенческого «%s»',
    async (studentNumber) => {
      await expectDbError(insertStudentNumber(studentNumber), {
        code: '23514',
        constraint: 'students_student_number_format',
      });
    }
  );

  it('отклоняет повторный номер студенческого', async () => {
    const id = await createStudent(pool);
    const found = await pool.query<{ student_number: string }>(
      'SELECT student_number FROM students WHERE id = $1',
      [id]
    );
    await expectDbError(insertStudentNumber(found.rows[0].student_number), {
      code: '23505',
      constraint: 'students_student_number_key',
    });
  });

  it('отклоняет пустое отображаемое имя', async () => {
    await expectDbError(
      pool.query(
        `INSERT INTO students (student_number, display_name, birth_date)
         VALUES ('8000001', '   ', '2005-01-01')`
      ),
      { code: '23514', constraint: 'students_display_name_check' }
    );
  });

  it('отклоняет неизвестный вид финансирования', async () => {
    await expectDbError(
      pool.query(
        `INSERT INTO students (student_number, display_name, birth_date, funding_type)
         VALUES ('8000002', 'Тест', '2005-01-01', 'grant')`
      ),
      { code: '23514', constraint: 'students_funding_type_check' }
    );
  });

  it('отклоняет нулевой курс', async () => {
    await expectDbError(
      pool.query(
        `INSERT INTO students (student_number, display_name, birth_date, study_year)
         VALUES ('8000003', 'Тест', '2005-01-01', 0)`
      ),
      { code: '23514', constraint: 'students_study_year_check' }
    );
  });

  it('допускает пустые фамилию, имя и отчество', async () => {
    const id = await createStudent(pool);
    const result = await pool.query<{
      last_name: string | null;
      first_name: string | null;
      middle_name: string | null;
    }>('SELECT last_name, first_name, middle_name FROM students WHERE id = $1', [id]);
    expect(result.rows[0]).toEqual({ last_name: null, first_name: null, middle_name: null });
  });

  it('не позволяет привязать пользователя с ролью admin', async () => {
    const adminId = await createUser(pool, 'admin');
    await expectDbError(createStudent(pool, adminId), {
      code: '23503',
      constraint: 'students_user_id_user_role_fkey',
    });
  });

  it('позволяет привязать пользователя с ролью student', async () => {
    const userId = await createUser(pool, 'student');
    const studentId = await createStudent(pool, userId);
    const result = await pool.query<{ user_id: string; user_role: string }>(
      'SELECT user_id, user_role FROM students WHERE id = $1',
      [studentId]
    );
    expect(result.rows[0]).toEqual({ user_id: userId, user_role: 'student' });
  });

  it('не позволяет привязать одного пользователя к двум студентам', async () => {
    const userId = await createUser(pool, 'student');
    await createStudent(pool, userId);
    await expectDbError(createStudent(pool, userId), {
      code: '23505',
      constraint: 'students_user_id_key',
    });
  });
});

describe('здания', () => {
  it('отклоняет номер здания 0', async () => {
    await expectDbError(
      pool.query(
        `INSERT INTO buildings (building_number, address, building_type, floors_count, monthly_rate)
         VALUES (0, 'Адрес', 'corridor', 3, 700)`
      ),
      { code: '23514', constraint: 'buildings_building_number_check' }
    );
  });

  it('отклоняет неизвестный тип здания', async () => {
    await expectDbError(
      pool.query(
        `INSERT INTO buildings (building_number, address, building_type, floors_count, monthly_rate)
         VALUES (${NEXT_BUILDING_NUMBER}, 'Адрес', 'tower', 3, 700)`
      ),
      { code: '23514', constraint: 'buildings_building_type_check' }
    );
  });

  it('отклоняет здание без этажей', async () => {
    await expectDbError(
      pool.query(
        `INSERT INTO buildings (building_number, address, building_type, floors_count, monthly_rate)
         VALUES (${NEXT_BUILDING_NUMBER}, 'Адрес', 'corridor', 0, 700)`
      ),
      { code: '23514', constraint: 'buildings_floors_count_check' }
    );
  });

  it('отклоняет пустой адрес', async () => {
    await expectDbError(
      pool.query(
        `INSERT INTO buildings (building_number, address, building_type, floors_count, monthly_rate)
         VALUES (${NEXT_BUILDING_NUMBER}, '   ', 'corridor', 3, 700)`
      ),
      { code: '23514', constraint: 'buildings_address_check' }
    );
  });

  it('отклоняет повторный номер здания', async () => {
    const id = await createBuilding(pool);
    const found = await pool.query<{ building_number: number }>(
      'SELECT building_number FROM buildings WHERE id = $1',
      [id]
    );
    await expectDbError(
      pool.query(
        `INSERT INTO buildings (building_number, address, building_type, floors_count, monthly_rate)
         VALUES ($1, 'Адрес', 'corridor', 3, 700)`,
        [found.rows[0].building_number]
      ),
      { code: '23505', constraint: 'buildings_building_number_key' }
    );
  });
});

describe('комнаты', () => {
  it('отклоняет этаж 0', async () => {
    const buildingId = await createBuilding(pool);
    await expectDbError(createRoom(pool, buildingId, { floor: 0 }), {
      code: '23514',
      constraint: 'rooms_floor_check',
    });
  });

  it.each([1, 5])('отклоняет вместимость %i', async (capacity) => {
    const buildingId = await createBuilding(pool);
    await expectDbError(createRoom(pool, buildingId, { capacity }), {
      code: '23514',
      constraint: 'rooms_capacity_check',
    });
  });

  it.each([2, 3, 4])('допускает вместимость %i и комнату без коек', async (capacity) => {
    const buildingId = await createBuilding(pool);
    const roomId = await createRoom(pool, buildingId, { capacity });
    const beds = await pool.query<{ count: string }>(
      'SELECT count(*) AS count FROM beds WHERE room_id = $1',
      [roomId]
    );
    expect(Number(beds.rows[0].count)).toBe(0);
  });

  it('отклоняет повторный номер комнаты в том же здании', async () => {
    const buildingId = await createBuilding(pool);
    await createRoom(pool, buildingId, { roomNumber: '101' });
    await expectDbError(createRoom(pool, buildingId, { roomNumber: '101' }), {
      code: '23505',
      constraint: 'rooms_building_id_room_number_key',
    });
  });

  it('допускает тот же номер комнаты в другом здании', async () => {
    const firstBuilding = await createBuilding(pool);
    const secondBuilding = await createBuilding(pool);
    await createRoom(pool, firstBuilding, { roomNumber: '101' });
    await expect(createRoom(pool, secondBuilding, { roomNumber: '101' })).resolves.toBeTypeOf(
      'string'
    );
  });
});

describe('койки', () => {
  it('отклоняет повторный номер койки в комнате', async () => {
    const roomId = await createRoom(pool, await createBuilding(pool));
    await createBed(pool, roomId, 1);
    await expectDbError(createBed(pool, roomId, 1), {
      code: '23505',
      constraint: 'beds_room_id_bed_number_key',
    });
  });

  it('отклоняет номер койки 0', async () => {
    const roomId = await createRoom(pool, await createBuilding(pool));
    await expectDbError(createBed(pool, roomId, 0), {
      code: '23514',
      constraint: 'beds_bed_number_check',
    });
  });

  it('отклоняет неизвестный статус койки', async () => {
    const roomId = await createRoom(pool, await createBuilding(pool));
    await expectDbError(
      pool.query("INSERT INTO beds (room_id, bed_number, status) VALUES ($1, 1, 'broken')", [
        roomId,
      ]),
      { code: '23514', constraint: 'beds_status_check' }
    );
  });

  it('допускает статус maintenance', async () => {
    const roomId = await createRoom(pool, await createBuilding(pool));
    const result = await pool.query(
      "INSERT INTO beds (room_id, bed_number, status) VALUES ($1, 1, 'maintenance') RETURNING id",
      [roomId]
    );
    expect(result.rowCount).toBe(1);
  });
});

describe('запрет удаления связанных записей (RESTRICT)', () => {
  it('нельзя удалить здание, в котором есть комнаты', async () => {
    const buildingId = await createBuilding(pool);
    await createRoom(pool, buildingId);
    await expectDbError(pool.query('DELETE FROM buildings WHERE id = $1', [buildingId]), {
      code: '23503',
      constraint: 'rooms_building_id_fkey',
    });
  });

  it('нельзя удалить здание, у которого есть сотрудники', async () => {
    const buildingId = await createBuilding(pool);
    await pool.query(
      "INSERT INTO building_staff (building_id, job_title, full_name) VALUES ($1, 'Комендант', 'Тестовый Сотрудник')",
      [buildingId]
    );
    await expectDbError(pool.query('DELETE FROM buildings WHERE id = $1', [buildingId]), {
      code: '23503',
      constraint: 'building_staff_building_id_fkey',
    });
  });

  it('нельзя удалить комнату, в которой есть койки', async () => {
    const roomId = await createRoom(pool, await createBuilding(pool));
    await createBed(pool, roomId, 1);
    await expectDbError(pool.query('DELETE FROM rooms WHERE id = $1', [roomId]), {
      code: '23503',
      constraint: 'beds_room_id_fkey',
    });
  });

  it('здание без зависимостей удаляется', async () => {
    const buildingId = await createBuilding(pool);
    const result = await pool.query('DELETE FROM buildings WHERE id = $1', [buildingId]);
    expect(result.rowCount).toBe(1);
  });
});

describe('автоматическое обновление updated_at', () => {
  it('изменение записи сдвигает updated_at вперёд', async () => {
    const buildingId = await createBuilding(pool);
    const result = await pool.query<{ changed: boolean }>(
      `UPDATE buildings SET address = 'Новый адрес' WHERE id = $1
       RETURNING updated_at > created_at AS changed`,
      [buildingId]
    );
    expect(result.rows[0].changed).toBe(true);
  });
});