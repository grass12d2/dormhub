import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectDbError } from '../setup/db-assert.js';
import {
  createBed,
  createBuilding,
  createContract,
  createRoom,
  createStudent,
  createUser,
  type ContractStatus,
} from '../setup/factories.js';
import { createTestPool } from '../setup/test-db.js';

const pool = createTestPool();

let adminId = '';
let buildingId = '';

beforeAll(async () => {
  adminId = await createUser(pool, 'admin');
  buildingId = await createBuilding(pool);
});

afterAll(async () => {
  await pool.end();
});

/** Новая койка в новой комнате: тесты не зависят друг от друга */
async function newBed(): Promise<string> {
  const roomId = await createRoom(pool, buildingId);
  return createBed(pool, roomId, 1);
}

function insertContract(
  studentId: string,
  bedId: string,
  startDate: string,
  endDate: string,
  status?: ContractStatus
): Promise<string> {
  return createContract(pool, { studentId, bedId, startDate, endDate, createdBy: adminId, status });
}

describe('пересечение договоров на одну койку', () => {
  it.each(['pending', 'active'] as const)(
    'живой договор (%s) блокирует пересекающийся договор на ту же койку',
    async (existing) => {
      const bedId = await newBed();
      await insertContract(await createStudent(pool), bedId, '2026-09-01', '2026-12-01', existing);
      await expectDbError(
        insertContract(await createStudent(pool), bedId, '2026-11-01', '2027-01-01'),
        { code: '23P01', constraint: 'contracts_bed_no_overlap' }
      );
    }
  );

  it('смежные периоды допустимы: конец полуинтервала не входит в период', async () => {
    const bedId = await newBed();
    await insertContract(await createStudent(pool), bedId, '2026-09-01', '2026-12-01');
    await expect(
      insertContract(await createStudent(pool), bedId, '2026-12-01', '2027-03-01')
    ).resolves.toBeTypeOf('string');
  });

  it.each(['cancelled', 'terminated', 'expired'] as const)(
    'неживой договор (%s) не блокирует койку',
    async (status) => {
      const bedId = await newBed();
      await insertContract(await createStudent(pool), bedId, '2026-09-01', '2026-12-01', status);
      await expect(
        insertContract(await createStudent(pool), bedId, '2026-09-01', '2026-12-01')
      ).resolves.toBeTypeOf('string');
    }
  );

  it('договоры на разные койки с одинаковыми датами допустимы', async () => {
    const firstBed = await newBed();
    const secondBed = await newBed();
    await insertContract(await createStudent(pool), firstBed, '2026-09-01', '2026-12-01');
    await expect(
      insertContract(await createStudent(pool), secondBed, '2026-09-01', '2026-12-01')
    ).resolves.toBeTypeOf('string');
  });

  it('после расторжения договора койка снова доступна на тот же период', async () => {
    const bedId = await newBed();
    const firstId = await insertContract(
      await createStudent(pool),
      bedId,
      '2026-09-01',
      '2026-12-01',
      'active'
    );
    await pool.query(
      "UPDATE contracts SET status = 'terminated', terminated_at = now() WHERE id = $1",
      [firstId]
    );
    await expect(
      insertContract(await createStudent(pool), bedId, '2026-09-01', '2026-12-01')
    ).resolves.toBeTypeOf('string');
  });
});

describe('один живой договор на студента', () => {
  it('второй живой договор того же студента отклоняется', async () => {
    const studentId = await createStudent(pool);
    await insertContract(studentId, await newBed(), '2026-09-01', '2026-12-01');
    await expectDbError(insertContract(studentId, await newBed(), '2027-01-01', '2027-04-01'), {
      code: '23505',
      constraint: 'idx_contracts_one_live',
    });
  });

  it('после отмены первого договора можно оформить второй', async () => {
    const studentId = await createStudent(pool);
    const firstId = await insertContract(studentId, await newBed(), '2026-09-01', '2026-12-01');
    await pool.query("UPDATE contracts SET status = 'cancelled' WHERE id = $1", [firstId]);
    await expect(
      insertContract(studentId, await newBed(), '2027-01-01', '2027-04-01')
    ).resolves.toBeTypeOf('string');
  });

  it('неживых договоров у студента может быть сколько угодно', async () => {
    const studentId = await createStudent(pool);
    await insertContract(studentId, await newBed(), '2026-09-01', '2026-12-01', 'cancelled');
    await insertContract(studentId, await newBed(), '2026-09-01', '2026-12-01', 'expired');
    await insertContract(studentId, await newBed(), '2026-09-01', '2026-12-01', 'terminated');
    await expect(
      insertContract(studentId, await newBed(), '2026-09-01', '2026-12-01')
    ).resolves.toBeTypeOf('string');
  });
});

describe('проверки полей договора', () => {
  it('отклоняет договор, у которого дата окончания равна дате начала', async () => {
    await expectDbError(
      insertContract(await createStudent(pool), await newBed(), '2026-09-01', '2026-09-01'),
      { code: '23514', constraint: 'contracts_dates_check' }
    );
  });

  it('статус terminated требует terminated_at', async () => {
    await expectDbError(
      pool.query(
        `INSERT INTO contracts
           (student_id, bed_id, start_date, end_date, monthly_rate, status, created_by)
         VALUES ($1, $2, '2026-09-01', '2026-12-01', 1000, 'terminated', $3)`,
        [await createStudent(pool), await newBed(), adminId]
      ),
      { code: '23514', constraint: 'contracts_terminated_consistency' }
    );
  });

  it('terminated_at допустим только для статуса terminated', async () => {
    await expectDbError(
      pool.query(
        `INSERT INTO contracts
           (student_id, bed_id, start_date, end_date, monthly_rate, status, created_by, terminated_at)
         VALUES ($1, $2, '2026-09-01', '2026-12-01', 1000, 'active', $3, now())`,
        [await createStudent(pool), await newBed(), adminId]
      ),
      { code: '23514', constraint: 'contracts_terminated_consistency' }
    );
  });

  it('отклоняет отрицательную месячную плату', async () => {
    await expectDbError(
      pool.query(
        `INSERT INTO contracts
           (student_id, bed_id, start_date, end_date, monthly_rate, created_by)
         VALUES ($1, $2, '2026-09-01', '2026-12-01', -1, $3)`,
        [await createStudent(pool), await newBed(), adminId]
      ),
      { code: '23514', constraint: 'contracts_monthly_rate_check' }
    );
  });
});

describe('параллельные операции', () => {
  it('при одновременной вставке пересекающихся договоров успешна ровно одна', async () => {
    for (let round = 0; round < 5; round++) {
      const bedId = await newBed();
      const studentA = await createStudent(pool);
      const studentB = await createStudent(pool);

      const results = await Promise.allSettled([
        insertContract(studentA, bedId, '2026-09-01', '2026-12-01'),
        insertContract(studentB, bedId, '2026-10-01', '2027-01-01'),
      ]);

      const fulfilled = results.filter((result) => result.status === 'fulfilled');
      const rejected = results.filter(
        (result): result is PromiseRejectedResult => result.status === 'rejected'
      );
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0].reason as { code?: string }).code).toBe('23P01');
    }
  });

  it('при одновременной вставке двух живых договоров студента успешен ровно один', async () => {
    for (let round = 0; round < 5; round++) {
      const studentId = await createStudent(pool);
      const firstBed = await newBed();
      const secondBed = await newBed();

      const results = await Promise.allSettled([
        insertContract(studentId, firstBed, '2026-09-01', '2026-12-01'),
        insertContract(studentId, secondBed, '2026-09-01', '2026-12-01'),
      ]);

      const fulfilled = results.filter((result) => result.status === 'fulfilled');
      const rejected = results.filter(
        (result): result is PromiseRejectedResult => result.status === 'rejected'
      );
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0].reason as { code?: string }).code).toBe('23505');
    }
  });
});

describe('запрет удаления записей, на которые ссылаются договоры', () => {
  it('нельзя удалить студента с договором', async () => {
    const studentId = await createStudent(pool);
    await insertContract(studentId, await newBed(), '2026-09-01', '2026-12-01');
    await expectDbError(pool.query('DELETE FROM students WHERE id = $1', [studentId]), {
      code: '23503',
      constraint: 'contracts_student_id_fkey',
    });
  });

  it('нельзя удалить койку с договором', async () => {
    const bedId = await newBed();
    await insertContract(await createStudent(pool), bedId, '2026-09-01', '2026-12-01');
    await expectDbError(pool.query('DELETE FROM beds WHERE id = $1', [bedId]), {
      code: '23503',
      constraint: 'contracts_bed_id_fkey',
    });
  });
});