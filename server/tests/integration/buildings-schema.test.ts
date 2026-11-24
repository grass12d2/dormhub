import { afterAll, describe, expect, it } from 'vitest';
import { expectDbError } from '../setup/db-assert.js';
import { createTestPool } from '../setup/test-db.js';

const pool = createTestPool();

afterAll(async () => {
  await pool.end();
});

/** Общежитие с заданной платой; номер общежития подбирается автоматически */
function insertBuilding(monthlyRate: string | null) {
  return pool.query<{ monthly_rate: string }>(
    `INSERT INTO buildings (building_number, address, building_type, floors_count, monthly_rate)
     VALUES ((SELECT COALESCE(max(building_number), 0) + 1 FROM buildings), 'Адрес', 'corridor', 3, $1)
     RETURNING monthly_rate`,
    [monthlyRate]
  );
}

describe('плата за проживание в здании', () => {
  it('хранится с двумя знаками после запятой', async () => {
    const result = await insertBuilding('700');
    expect(result.rows[0].monthly_rate).toBe('700.00');
  });

  it('допускает нулевую плату', async () => {
    const result = await insertBuilding('0');
    expect(result.rows[0].monthly_rate).toBe('0.00');
  });

  it('отклоняет отрицательную плату', async () => {
    await expectDbError(insertBuilding('-1'), {
      code: '23514',
      constraint: 'buildings_monthly_rate_check',
    });
  });

  it('плата обязательна', async () => {
    await expectDbError(insertBuilding(null), { code: '23502' });
  });
});