import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createTestAppOptions } from '../setup/app-options.js';
import { call, loginForToken } from '../setup/api-helpers.js';
import { createLoginUser, type TestUser } from '../setup/auth-helpers.js';
import { createBed, createBuilding, createContract, createRoom, createStudent } from '../setup/factories.js';
import { createTestPool } from '../setup/test-db.js';

const pool = createTestPool();
const app = createApp(pool, createTestAppOptions());

let admin: TestUser;
let adminToken = '';

beforeAll(async () => {
    admin = await createLoginUser(pool, { role: 'admin' });
    adminToken = await loginForToken(app, admin);
});
afterAll(async () => {
    await pool.end();
});

async function resident(buildingId: string, floor: number, roomNumber: string) {
    const user = await createLoginUser(pool, { role: 'student' });
    const studentId = await createStudent(pool, user.id);
    const roomId = await createRoom(pool, buildingId, { roomNumber, floor });
    const bedId = await createBed(pool, roomId, 1);
    await createContract(pool, {
        studentId, bedId, startDate: '2030-09-01', endDate: '2030-12-01', createdBy: admin.id, status: 'active',
    });
    return { user, token: await loginForToken(app, user) };
}

type Chat = { id: number; kind: string; title: string; unread: number };
const chats = async (token: string) => (await call(app, 'get', '/api/chats', { token })).body.data as Chat[];
const send = (token: string, id: number, body: object) =>
    call(app, 'post', `/api/chats/${id}/messages`, { token, body });
const messages = async (token: string, id: number, query = '') =>
    (await call(app, 'get', `/api/chats/${id}/messages${query}`, { token })).body.data as Array<{
        id: number; body: string | null; bodyHtml: string | null; deleted: boolean;
        replyTo: { id: number } | null; reactions: Record<string, number>; myReaction: string | null;
    }>;

describe('групповые чаты', () => {
    it('жильцы этажа в общем чате, чужой этаж не видит', async () => {
        const b = await createBuilding(pool, 10);
        const a1 = await resident(b, 3, '301');
        const a2 = await resident(b, 3, '302');
        const other = await resident(b, 4, '401');
        const f1 = (await chats(a1.token)).find((c) => c.kind === 'floor')!;
        const f2 = (await chats(a2.token)).find((c) => c.kind === 'floor')!;
        expect(f1.id).toBe(f2.id);

        expect((await send(a1.token, f1.id, { body: 'Привет, этаж' })).status).toBe(201);
        expect((await messages(a2.token, f1.id)).map((m) => m.body)).toEqual(['Привет, этаж']);
        await chats(other.token);
        expect((await call(app, 'get', `/api/chats/${f1.id}/messages`, { token: other.token })).status).toBe(404);
    });

    it('чат блока только в блочном здании и только для своего блока', async () => {
        const buildingId = (
            await pool.query<{ id: string }>(
                `INSERT INTO buildings (building_number, address, building_type, floors_count, monthly_rate)
         VALUES ((SELECT COALESCE(max(building_number), 0) + 1 FROM buildings), 'Блоки', 'block', 10, 700) RETURNING id`
            )
        ).rows[0].id;
        const s1 = await resident(buildingId, 7, '7-3-1');
        const s2 = await resident(buildingId, 7, '7-3-2');
        const o = await resident(buildingId, 7, '7-4-1');
        const b1 = (await chats(s1.token)).find((c) => c.kind === 'block')!;
        const b2 = (await chats(s2.token)).find((c) => c.kind === 'block')!;
        const bo = (await chats(o.token)).find((c) => c.kind === 'block')!;
        expect(b1.id).toBe(b2.id);
        expect(bo.id).not.toBe(b1.id);
        expect(b1.title).toContain('блок 3');
        expect((await call(app, 'get', `/api/chats/${b1.id}/messages`, { token: o.token })).status).toBe(404);
    });
});

describe('сообщения', () => {
    it('HTML очищается, ответ, реакции и их смена, удаление', async () => {
        const b = await createBuilding(pool, 10);
        const x = await resident(b, 2, '201');
        const y = await resident(b, 2, '202');
        const floor = (await chats(x.token)).find((c) => c.kind === 'floor')!;
        await chats(y.token);

        const first = (await send(x.token, floor.id, { bodyHtml: '<p><strong>Важно</strong></p><script>x</script>' })).body.data.id as number;
        const reply = (await send(y.token, floor.id, { body: 'Ответ', replyToId: first })).body.data.id as number;
        const list = await messages(y.token, floor.id);
        expect(list[0].bodyHtml).toBe('<p><strong>Важно</strong></p>');
        expect(list[0].body).toBe('Важно');
        expect(list[1].replyTo?.id).toBe(first);

        await call(app, 'put', `/api/chats/${floor.id}/messages/${first}/reaction`, { token: y.token, body: { kind: 'love' } });
        await call(app, 'put', `/api/chats/${floor.id}/messages/${first}/reaction`, { token: y.token, body: { kind: 'wow' } });
        await call(app, 'put', `/api/chats/${floor.id}/messages/${first}/reaction`, { token: x.token, body: { kind: 'wow' } });
        const reacted = (await messages(y.token, floor.id)).find((m) => m.id === first)!;
        expect(reacted.reactions).toEqual({ wow: 2 });
        expect(reacted.myReaction).toBe('wow');
        expect((await call(app, 'put', `/api/chats/${floor.id}/messages/${first}/reaction`, { token: y.token, body: { kind: 'care' } })).status).toBe(400);
        await call(app, 'put', `/api/chats/${floor.id}/messages/${first}/reaction`, { token: y.token, body: { kind: null } });
        expect((await messages(y.token, floor.id)).find((m) => m.id === first)!.reactions).toEqual({ wow: 1 });

        expect((await call(app, 'delete', `/api/chats/${floor.id}/messages/${first}`, { token: y.token })).status).toBe(403);
        expect((await call(app, 'delete', `/api/chats/${floor.id}/messages/${first}`, { token: x.token })).status).toBe(200);
        expect((await call(app, 'delete', `/api/chats/${floor.id}/messages/${reply}`, { token: adminToken })).status).toBe(200);
        const all = await messages(y.token, floor.id);
        expect(all.every((m) => m.deleted && m.body === null)).toBe(true);
        expect(await messages(y.token, floor.id, `?after=${first}`)).toHaveLength(1);
    });

    it('проверки: пустое и неверное сообщение, без токена, чужой ответ', async () => {
        const b = await createBuilding(pool, 10);
        const x = await resident(b, 2, '201');
        const floor = (await chats(x.token)).find((c) => c.kind === 'floor')!;
        expect((await send(x.token, floor.id, { body: '  ' })).status).toBe(400);
        expect((await send(x.token, floor.id, { bodyHtml: '<script>x</script>' })).status).toBe(422);
        expect((await send(x.token, floor.id, { body: 'а', replyToId: 999999999 })).status).toBe(422);
        expect((await call(app, 'get', '/api/chats')).status).toBe(401);
    });

    it('не более 30 сообщений в минуту', async () => {
        const b = await createBuilding(pool, 10);
        const x = await resident(b, 2, '201');
        const floor = (await chats(x.token)).find((c) => c.kind === 'floor')!;
        for (let i = 0; i < 30; i++) expect((await send(x.token, floor.id, { body: `m${i}` })).status).toBe(201);
        expect((await send(x.token, floor.id, { body: 'лишнее' })).status).toBe(429);
    });
});

describe('личные чаты, прочтение, блокировки', () => {
    it('личный чат, непрочитанные, прочтение, «прочитать все»', async () => {
        const b = await createBuilding(pool, 10);
        const x = await resident(b, 2, '201');
        const y = await resident(b, 2, '202');
        const opened = await call(app, 'post', '/api/chats/direct', { token: x.token, body: { userId: y.user.id } });
        const again = await call(app, 'post', '/api/chats/direct', { token: y.token, body: { userId: x.user.id } });
        expect(again.body.data.id).toBe(opened.body.data.id);
        const id = opened.body.data.id as number;

        await send(x.token, id, { body: 'Привет' });
        expect((await chats(y.token)).find((c) => c.id === id)?.unread).toBe(1);
        expect((await chats(x.token)).find((c) => c.id === id)?.unread).toBe(0);
        await call(app, 'post', '/api/chats/read-all', { token: y.token });
        expect((await chats(y.token)).find((c) => c.id === id)?.unread).toBe(0);
        expect((await call(app, 'post', '/api/chats/direct', { token: x.token, body: { userId: x.user.id } })).status).toBe(422);
    });

    it('блокировка закрывает переписку, разблокировка открывает, администратора блокировать нельзя', async () => {
        const b = await createBuilding(pool, 10);
        const x = await resident(b, 2, '201');
        const y = await resident(b, 2, '202');
        const id = (await call(app, 'post', '/api/chats/direct', { token: x.token, body: { userId: y.user.id } })).body.data.id as number;

        expect((await call(app, 'post', '/api/chats/blocks', { token: x.token, body: { userId: y.user.id } })).status).toBe(200);
        expect((await send(y.token, id, { body: 'Эй' })).status).toBe(403);
        expect((await send(x.token, id, { body: 'Эй' })).status).toBe(403);
        expect((await chats(x.token)).find((c) => c.id === id)).toMatchObject({ blockedByMe: true });
        expect((await call(app, 'delete', `/api/chats/blocks/${y.user.id}`, { token: x.token })).status).toBe(200);
        expect((await send(y.token, id, { body: 'Эй' })).status).toBe(201);

        expect((await call(app, 'post', '/api/chats/blocks', { token: x.token, body: { userId: admin.id } })).status).toBe(403);
    });

    it('поиск людей и личный чат с администратором', async () => {
        const b = await createBuilding(pool, 10);
        const x = await resident(b, 2, '201');
        expect((await call(app, 'get', '/api/chats/people?q=Тестовый', { token: x.token })).status).toBe(200);
        const direct = await call(app, 'post', '/api/chats/direct', { token: x.token, body: { userId: admin.id } });
        expect(direct.status).toBe(200);
        expect((await send(adminToken, direct.body.data.id, { body: 'Здравствуйте' })).status).toBe(201);
    });
});