import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';
import { withRetry } from '../../src/db/transaction.js';
import { loadDemoData, type SeedSummary } from '../../src/seed/seed.js';
import { createLoginUser } from '../setup/auth-helpers.js';
import { createTestPool } from '../setup/test-db.js';

const pool = createTestPool();
const SEED_PASSWORD = 'Seed-Test-Password-1';
/** Номера общежитий сдвинуты, чтобы не пересечься с данными других тестов */
const OFFSET = 30000;

beforeAll(async () => {
    await createLoginUser(pool, { role: 'admin' });
});

afterAll(async () => {
    await pool.end();
});

/** Выбрасывается после проверок: транзакция откатывается и данные не остаются в базе */
class Rollback extends Error { }

/** Только данные загрузки: общежития с номерами от OFFSET */
const SEEDED_BUILDINGS = `buildings b WHERE b.building_number >= ${OFFSET}`;
const SEEDED_INVOICES = `
  FROM invoices i
  JOIN contracts c ON c.id = i.contract_id
  JOIN beds bd ON bd.id = c.bed_id
  JOIN rooms r ON r.id = bd.room_id
  JOIN buildings b ON b.id = r.building_id
  WHERE b.building_number >= ${OFFSET}`;
const SEEDED_CONTRACTS = `
  FROM contracts c
  JOIN beds bd ON bd.id = c.bed_id
  JOIN rooms r ON r.id = bd.room_id
  JOIN buildings b ON b.id = r.building_id
  WHERE b.building_number >= ${OFFSET}`;
const SEEDED_ROOMS = `
  FROM rooms r JOIN buildings b ON b.id = r.building_id
  WHERE b.building_number >= ${OFFSET}`;

async function count(client: PoolClient, sql: string): Promise<number> {
    const result = await client.query<{ n: number }>(sql);
    return result.rows[0].n;
}

/** Выполнить загрузку и проверки в транзакции, которая всегда откатывается */
async function inRolledBackSeed(
    check: (client: PoolClient, summary: SeedSummary) => Promise<void>
): Promise<void> {
    let failure: unknown;
    await expect(
        withRetry(pool, async (client) => {
            const summary = await loadDemoData(client, {
                password: SEED_PASSWORD,
                bcryptRounds: 4,
                buildingNumberOffset: OFFSET,
            });
            try {
                await check(client, summary);
            } catch (error) {
                failure = error;
            }
            throw new Rollback('откат');
        })
    ).rejects.toThrow(Rollback);
    if (failure) {
        throw failure;
    }
}

describe('загрузка демонстрационных данных', () => {
    it('создаёт 6 общежитий, 1412 комнат, 3936 коек и остальные данные в нужном числе', async () => {
        await inRolledBackSeed(async (client, summary) => {
            expect(summary).toEqual({
                buildings: 6,
                rooms: 1412,
                beds: 3936,
                staff: 12,
                students: 30,
                accounts: 3,
                contracts: 20,
                invoices: 18,
                payments: 9,
            });
            expect(await count(client, `SELECT count(*)::int AS n FROM ${SEEDED_BUILDINGS}`)).toBe(6);
            expect(await count(client, `SELECT count(*)::int AS n ${SEEDED_ROOMS}`)).toBe(1412);
            expect(
                await count(
                    client,
                    `SELECT count(*)::int AS n FROM beds bd JOIN rooms r ON r.id = bd.room_id
           JOIN buildings b ON b.id = r.building_id WHERE b.building_number >= ${OFFSET}`
                )
            ).toBe(3936);
        });
    });

    it('все договоры действуют, а на койку приходится не более одного договора', async () => {
        await inRolledBackSeed(async (client) => {
            expect(await count(client, `SELECT count(*)::int AS n ${SEEDED_CONTRACTS}`)).toBe(20);
            expect(
                await count(client, `SELECT count(*)::int AS n ${SEEDED_CONTRACTS} AND c.status = 'active'`)
            ).toBe(20);
            expect(
                await count(
                    client,
                    `SELECT count(*)::int AS n FROM (
             SELECT c.bed_id ${SEEDED_CONTRACTS} GROUP BY c.bed_id HAVING count(*) > 1) t`
                )
            ).toBe(0);
        });
    });

    it('число коек в каждой комнате равно вместимости, комнаты только со второго этажа', async () => {
        await inRolledBackSeed(async (client) => {
            expect(
                await count(
                    client,
                    `SELECT count(*)::int AS n ${SEEDED_ROOMS}
           AND r.capacity <> (SELECT count(*) FROM beds WHERE room_id = r.id)`
                )
            ).toBe(0);
            expect(await count(client, `SELECT min(r.floor)::int AS n ${SEEDED_ROOMS}`)).toBe(2);
        });
    });

    it('суммы и статусы счетов согласованы с платежами', async () => {
        await inRolledBackSeed(async (client) => {
            const statuses = await client.query<{ status: string; n: number }>(
                `SELECT i.status, count(*)::int AS n ${SEEDED_INVOICES} GROUP BY i.status ORDER BY i.status`
            );
            expect(statuses.rows).toEqual([
                { status: 'paid', n: 6 },
                { status: 'partially_paid', n: 3 },
                { status: 'unpaid', n: 9 },
            ]);
            const paidSum = '(SELECT sum(amount) FROM payments WHERE invoice_id = i.id)';
            expect(
                await count(
                    client,
                    `SELECT count(*)::int AS n ${SEEDED_INVOICES} AND i.status = 'paid' AND i.amount <> ${paidSum}`
                )
            ).toBe(0);
            expect(
                await count(
                    client,
                    `SELECT count(*)::int AS n ${SEEDED_INVOICES}
           AND i.status = 'partially_paid' AND i.amount <= ${paidSum}`
                )
            ).toBe(0);
            expect(
                await count(
                    client,
                    `SELECT count(*)::int AS n ${SEEDED_INVOICES}
           AND i.status = 'unpaid' AND EXISTS (SELECT 1 FROM payments WHERE invoice_id = i.id)`
                )
            ).toBe(0);
        });
    });

    it('учётные записи студентов: роль student, пароль только в виде хеша, профили привязаны', async () => {
        await inRolledBackSeed(async (client) => {
            const users = await client.query<{ email: string; password_hash: string; role: string }>(
                "SELECT email, password_hash, role FROM users WHERE email LIKE 'demo.student%' ORDER BY email"
            );
            expect(users.rows.map((u) => u.email)).toEqual([
                'demo.student1@example.com',
                'demo.student2@example.com',
                'demo.student3@example.com',
            ]);
            for (const user of users.rows) {
                expect(user.role).toBe('student');
                expect(user.password_hash).toMatch(/^\$2[aby]\$04\$/);
                expect(user.password_hash).not.toContain(SEED_PASSWORD);
            }
            expect(
                await count(
                    client,
                    `SELECT count(*)::int AS n FROM students s JOIN users u ON u.id = s.user_id
           WHERE u.email LIKE 'demo.student%'`
                )
            ).toBe(3);
        });
    });

    it('пишет один аудит seed_data с числами и без пароля', async () => {
        await inRolledBackSeed(async (client) => {
            const rows = await client.query<{ details: Record<string, unknown> }>(
                "SELECT details FROM audit_logs WHERE action = 'seed_data'"
            );
            expect(rows.rows).toHaveLength(1);
            expect(rows.rows[0].details).toMatchObject({ buildings: 6, rooms: 1412, beds: 3936 });
            expect(JSON.stringify(rows.rows[0].details)).not.toContain(SEED_PASSWORD);
        });
    });

    it('после отката в тестовой базе нет данных загрузки', async () => {
        await inRolledBackSeed(async () => undefined);

        const buildings = await pool.query<{ n: number }>(
            `SELECT count(*)::int AS n FROM buildings WHERE building_number >= ${OFFSET}`
        );
        const users = await pool.query<{ n: number }>(
            "SELECT count(*)::int AS n FROM users WHERE email LIKE 'demo.student%'"
        );
        const audits = await pool.query<{ n: number }>(
            "SELECT count(*)::int AS n FROM audit_logs WHERE action = 'seed_data'"
        );
        expect(buildings.rows[0].n).toBe(0);
        expect(users.rows[0].n).toBe(0);
        expect(audits.rows[0].n).toBe(0);
    });
});