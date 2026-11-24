import { afterAll, describe, expect, it } from 'vitest';
import { createLoginUser } from '../setup/auth-helpers.js';
import { expectDbError } from '../setup/db-assert.js';
import { createBuilding, createRoom } from '../setup/factories.js';
import { createTestPool } from '../setup/test-db.js';

const pool = createTestPool();

afterAll(async () => {
    await pool.end();
});

async function newAnnouncement(title = 'Заголовок', body = 'Текст') {
    const result = await pool.query<{ id: string }>(
        'INSERT INTO announcements (title, body) VALUES ($1, $2) RETURNING id',
        [title, body]
    );
    return result.rows[0].id;
}

const addTarget = (id: string, building: string | null, floor: number | null, room: string | null) =>
    pool.query(
        'INSERT INTO announcement_targets (announcement_id, building_id, floor, room_id) VALUES ($1, $2, $3, $4)',
        [id, building, floor, room]
    );

describe('announcements', () => {
    it('принимает объявление, отклоняет пустой заголовок и пустой текст', async () => {
        await newAnnouncement();
        await expectDbError(newAnnouncement('   '), { code: '23514', constraint: 'announcements_title_check' });
        await expectDbError(newAnnouncement('Тема', ''), { code: '23514', constraint: 'announcements_body_check' });
    });

    it('удаление автора оставляет объявление без автора', async () => {
        const user = await createLoginUser(pool);
        const id = (
            await pool.query<{ id: string }>(
                'INSERT INTO announcements (title, body, author_id) VALUES ($1, $2, $3) RETURNING id',
                ['T', 'B', user.id]
            )
        ).rows[0].id;
        await pool.query('DELETE FROM users WHERE id = $1', [user.id]);
        const row = await pool.query('SELECT author_id FROM announcements WHERE id = $1', [id]);
        expect(row.rows[0].author_id).toBeNull();
    });
});

describe('announcement_targets', () => {
    it('принимает общежитие, общежитие с этажом и комнату', async () => {
        const id = await newAnnouncement();
        const building = await createBuilding(pool, 10);
        const room = await createRoom(pool, building, { roomNumber: '201', floor: 2 });
        await addTarget(id, building, null, null);
        await addTarget(id, building, 2, null);
        await addTarget(id, null, null, room);
    });

    it('отклоняет неверные сочетания и этаж ниже второго', async () => {
        const id = await newAnnouncement();
        const building = await createBuilding(pool, 10);
        const room = await createRoom(pool, building, { roomNumber: '201', floor: 2 });
        await expectDbError(addTarget(id, null, null, null), { code: '23514', constraint: 'announcement_targets_shape_check' });
        await expectDbError(addTarget(id, building, null, room), { code: '23514', constraint: 'announcement_targets_shape_check' });
        await expectDbError(addTarget(id, null, 3, null), { code: '23514', constraint: 'announcement_targets_shape_check' });
        await expectDbError(addTarget(id, building, 1, null), { code: '23514', constraint: 'announcement_targets_floor_check' });
    });

    it('удаление объявления удаляет адресатов и отметки', async () => {
        const id = await newAnnouncement();
        const user = await createLoginUser(pool);
        const building = await createBuilding(pool, 10);
        await addTarget(id, building, null, null);
        await pool.query('INSERT INTO announcement_reads (announcement_id, user_id) VALUES ($1, $2)', [id, user.id]);
        await pool.query('DELETE FROM announcements WHERE id = $1', [id]);
        expect((await pool.query('SELECT 1 FROM announcement_targets WHERE announcement_id = $1', [id])).rowCount).toBe(0);
        expect((await pool.query('SELECT 1 FROM announcement_reads WHERE announcement_id = $1', [id])).rowCount).toBe(0);
    });
});

describe('announcement_reads', () => {
    it('одна отметка на пару объявление и пользователь', async () => {
        const id = await newAnnouncement();
        const user = await createLoginUser(pool);
        await pool.query('INSERT INTO announcement_reads (announcement_id, user_id) VALUES ($1, $2)', [id, user.id]);
        await expectDbError(
            pool.query('INSERT INTO announcement_reads (announcement_id, user_id) VALUES ($1, $2)', [id, user.id]),
            { code: '23505', constraint: 'announcement_reads_pkey' }
        );
    });
});