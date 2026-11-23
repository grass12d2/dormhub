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

/** Студент с действующим договором в новой комнате нового здания */
async function resident(floor = 2) {
    const user = await createLoginUser(pool, { role: 'student' });
    const studentId = await createStudent(pool, user.id);
    const buildingId = await createBuilding(pool, 10);
    const roomId = await createRoom(pool, buildingId, { roomNumber: `${floor}01`, floor });
    const bedId = await createBed(pool, roomId, 1);
    await createContract(pool, {
        studentId, bedId, startDate: '2030-09-01', endDate: '2030-12-01', createdBy: admin.id, status: 'active',
    });
    return { token: await loginForToken(app, user), buildingId, roomId };
}

const post = (body: object) => call(app, 'post', '/api/announcements', { token: adminToken, body });
const mine = async (token: string) =>
    ((await call(app, 'get', '/api/announcements', { token })).body.data as Array<{ id: string; isRead: boolean }>);

describe('доступ', () => {
    it('без токена 401, студент не создаёт и не удаляет', async () => {
        const { token } = await resident();
        expect((await call(app, 'get', '/api/announcements')).status).toBe(401);
        expect((await call(app, 'post', '/api/announcements', { token, body: { title: 'a', body: 'b', targets: [] } })).status).toBe(403);
        expect((await call(app, 'delete', '/api/announcements/00000000-0000-4000-8000-000000000000', { token })).status).toBe(403);
    });
});

describe('адресаты', () => {
    it('объявление для всех видят все, для здания — только жильцы здания', async () => {
        const a = await resident();
        const b = await resident();
        const everyone = (await post({ title: 'Всем', body: 'Текст', targets: [] })).body.data.id as string;
        const forA = (await post({ title: 'Зданию', body: 'Текст', targets: [{ buildingId: a.buildingId }] })).body.data.id as string;

        const seenByA = (await mine(a.token)).map((x) => x.id);
        const seenByB = (await mine(b.token)).map((x) => x.id);

        expect(seenByA).toEqual(expect.arrayContaining([everyone, forA]));
        expect(seenByB).toContain(everyone);
        expect(seenByB).not.toContain(forA);
    });

    it('этаж и комната: чужой этаж и чужая комната не видят', async () => {
        const a = await resident(3);
        const other = await resident(4);
        const floor = (await post({ title: 'Этаж', body: 'Т', targets: [{ buildingId: a.buildingId, floor: 3 }] })).body.data.id as string;
        const wrongFloor = (await post({ title: 'Этаж 5', body: 'Т', targets: [{ buildingId: a.buildingId, floor: 5 }] })).body.data.id as string;
        const room = (await post({ title: 'Комната', body: 'Т', targets: [{ roomId: a.roomId }] })).body.data.id as string;

        const ids = (await mine(a.token)).map((x) => x.id);
        expect(ids).toEqual(expect.arrayContaining([floor, room]));
        expect(ids).not.toContain(wrongFloor);
        const others = (await mine(other.token)).map((x) => x.id);
        expect(others).not.toContain(floor);
        expect(others).not.toContain(room);
    });

    it('истёкшее объявление студент не видит, администратор видит', async () => {
        const { token } = await resident();
        const id = (await post({ title: 'Старое', body: 'Т', targets: [], expiresAt: '2020-01-01T00:00:00Z' })).body.data.id as string;
        expect((await mine(token)).map((x) => x.id)).not.toContain(id);
        const all = (await call(app, 'get', '/api/announcements?limit=100', { token: adminToken })).body.data as Array<{ id: string }>;
        expect(all.map((x) => x.id)).toContain(id);
    });
});

describe('прочтение', () => {
    it('число непрочитанных уменьшается после отметки; чужое объявление не отметить', async () => {
        const a = await resident();
        const b = await resident();
        const id = (await post({ title: 'Зданию', body: 'Т', targets: [{ buildingId: a.buildingId }] })).body.data.id as string;
        const count = async () => (await call(app, 'get', '/api/announcements/unread-count', { token: a.token })).body.data.count as number;

        const before = await count();
        expect((await call(app, 'post', `/api/announcements/${id}/read`, { token: a.token })).status).toBe(200);
        expect(await count()).toBe(before - 1);
        expect((await mine(a.token)).find((x) => x.id === id)?.isRead).toBe(true);
        expect((await call(app, 'post', `/api/announcements/${id}/read`, { token: b.token })).status).toBe(404);
    });

    it('после изменения объявление снова непрочитанное', async () => {
        const a = await resident();
        const id = (await post({ title: 'Т', body: 'Б', targets: [{ buildingId: a.buildingId }] })).body.data.id as string;
        await call(app, 'post', `/api/announcements/${id}/read`, { token: a.token });

        await call(app, 'put', `/api/announcements/${id}`, {
            token: adminToken,
            body: { title: 'Новый', body: 'Б', targets: [{ buildingId: a.buildingId }] },
        });

        expect((await mine(a.token)).find((x) => x.id === id)?.isRead).toBe(false);
    });

    it('«прочитать все» отмечает адресованные, чужие не затрагивает', async () => {
        const a = await resident();
        const b = await resident();
        await post({ title: 'А1', body: 'Т', targets: [{ buildingId: a.buildingId }] });
        await post({ title: 'А2', body: 'Т', targets: [] });
        const count = async (token: string) =>
            (await call(app, 'get', '/api/announcements/unread-count', { token })).body.data.count as number;
        expect(await count(a.token)).toBeGreaterThanOrEqual(2);
        const bBefore = await count(b.token);

        const response = await call(app, 'post', '/api/announcements/read-all', { token: a.token });

        expect(response.status).toBe(200);
        expect(await count(a.token)).toBe(0);
        expect(await count(b.token)).toBe(bBefore);
    });

});

describe('управление', () => {
    it('удаление и аудит; неверное тело и несуществующее здание', async () => {
        const created = await post({ title: 'Т', body: 'Б', targets: [] });
        const id = created.body.data.id as string;
        const removed = await call(app, 'delete', `/api/announcements/${id}`, { token: adminToken });
        expect(removed.status).toBe(200);
        expect((await call(app, 'delete', `/api/announcements/${id}`, { token: adminToken })).status).toBe(404);
        const audit = await pool.query("SELECT action FROM audit_logs WHERE entity_id = $1 ORDER BY id", [id]);
        expect(audit.rows.map((r) => r.action)).toEqual(['create_announcement', 'delete_announcement']);

        expect((await post({ title: '', body: 'Б', targets: [] })).status).toBe(400);
        expect((await post({ title: 'Т', body: 'Б', targets: [], extra: 1 })).status).toBe(400);
        expect((await post({ title: 'Т', body: 'Б', targets: [{ buildingId: '00000000-0000-4000-8000-000000000000' }] })).status).toBe(422);
    });
});

describe('форматированный текст', () => {
  it('HTML очищается, простой текст вычисляется, пустой текст отклоняется', async () => {
    const { token } = await resident();
    const created = await post({
      title: 'Т',
      bodyHtml: '<p><strong>Важно</strong></p><script>alert(1)</script><img src=x onerror=alert(1)>',
      targets: [],
    });
    expect(created.status).toBe(201);

    const item = (
      (await call(app, 'get', '/api/announcements?limit=100', { token })).body.data as Array<{
        id: string; body: string; bodyHtml: string | null;
      }>
    ).find((x) => x.id === created.body.data.id);
    expect(item?.bodyHtml).toBe('<p><strong>Важно</strong></p>');
    expect(item?.body).toBe('Важно');

    expect((await post({ title: 'Т', bodyHtml: '<script>x</script>', targets: [] })).status).toBe(422);
    expect((await post({ title: 'Т', targets: [] })).status).toBe(400);
  });
});