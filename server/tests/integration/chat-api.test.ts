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
        editedAt: string | null;
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

    it('чат блока только в блочном общежитии и только для своего блока', async () => {
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

    it('администратор не видит чаты этажа и блока', async () => {
        const b = await createBuilding(pool, 10);
        const x = await resident(b, 3, '301');
        const floor = (await chats(x.token)).find((c) => c.kind === 'floor')!;
        expect((await chats(adminToken)).every((c) => c.kind === 'direct')).toBe(true);
        expect((await call(app, 'get', `/api/chats/${floor.id}/messages`, { token: adminToken })).status).toBe(404);
    });

    it('список участников чата этажа и «заблокирован мной / мной» в личном чате', async () => {
        const b = await createBuilding(pool, 10);
        const x = await resident(b, 3, '301');
        const y = await resident(b, 3, '302');
        const floor = (await chats(x.token)).find((c) => c.kind === 'floor')!;
        const members = await call(app, 'get', `/api/chats/${floor.id}/members`, { token: x.token });
        expect(members.status).toBe(200);
        expect(members.body.data).toHaveLength(2);

        const id = (await call(app, 'post', '/api/chats/direct', { token: x.token, body: { userId: y.user.id } })).body.data.id as number;
        expect((await call(app, 'get', `/api/chats/${id}/members`, { token: x.token })).status).toBe(422);
        await call(app, 'post', '/api/chats/blocks', { token: x.token, body: { userId: y.user.id } });
        expect((await chats(y.token)).find((c) => c.id === id)).toMatchObject({ blockedMe: true, blockedByMe: false });
    });

    it('участники чата этажа и блокировка в обе стороны', async () => {
        const b = await createBuilding(pool, 10);
        const x = await resident(b, 3, '301');
        const y = await resident(b, 3, '302');
        const floor = (await chats(x.token)).find((c) => c.kind === 'floor')!;
        const members = await call(app, 'get', `/api/chats/${floor.id}/members`, { token: x.token });
        expect(members.status).toBe(200);
        expect(members.body.data).toHaveLength(2);

        const id = (await call(app, 'post', '/api/chats/direct', { token: x.token, body: { userId: y.user.id } })).body.data.id as number;
        expect((await call(app, 'get', `/api/chats/${id}/members`, { token: x.token })).status).toBe(422);
        await call(app, 'post', '/api/chats/blocks', { token: x.token, body: { userId: y.user.id } });
        expect((await chats(y.token)).find((c) => c.id === id)).toMatchObject({ blockedMe: true, blockedByMe: false });
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
        // Администратор не состоит в чатах этажа: доступа нет
        expect((await call(app, 'delete', `/api/chats/${floor.id}/messages/${reply}`, { token: adminToken })).status).toBe(404);
        const all = await messages(y.token, floor.id);
        expect(all.find((m) => m.id === first)).toBeUndefined();
        expect(all.find((m) => m.id === reply)?.replyTo).toBeNull();
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

describe('правка сообщений', () => {
    const edit = (token: string, chatId: number, id: number, body: object) =>
        call(app, 'patch', `/api/chats/${chatId}/messages/${id}`, { token, body });

    it('автор меняет текст, сообщение помечается изменённым; чужое и пустое — нельзя', async () => {
        const b = await createBuilding(pool, 10);
        const x = await resident(b, 3, '301');
        const y = await resident(b, 3, '302');
        const floor = (await chats(x.token)).find((c) => c.kind === 'floor')!;
        await chats(y.token);

        const id = (await send(x.token, floor.id, { body: 'Черновик' })).body.data.id as number;
        expect((await messages(y.token, floor.id)).find((m) => m.id === id)!.editedAt).toBeNull();

        expect((await edit(x.token, floor.id, id, { bodyHtml: '<p><em>Итог</em></p><script>x</script>' })).status).toBe(200);
        const edited = (await messages(y.token, floor.id)).find((m) => m.id === id)!;
        expect(edited.bodyHtml).toBe('<p><em>Итог</em></p>');
        expect(edited.body).toBe('Итог');
        expect(edited.editedAt).not.toBeNull();

        expect((await edit(y.token, floor.id, id, { body: 'Чужая правка' })).status).toBe(403);
        expect((await edit(x.token, floor.id, id, { bodyHtml: '<p> </p>' })).status).toBe(422);
        expect((await edit(x.token, floor.id, id, {})).status).toBe(400);
        expect((await edit(x.token, floor.id, 999999, { body: 'Нет' })).status).toBe(404);
        expect((await messages(x.token, floor.id)).find((m) => m.id === id)!.body).toBe('Итог');
    });

    it('администратор не меняет чужие сообщения в личном чате', async () => {
        const b = await createBuilding(pool, 10);
        const x = await resident(b, 4, '401');
        const direct = (await call(app, 'post', '/api/chats/direct', { token: x.token, body: { userId: admin.id } })).body.data.id as number;
        const id = (await send(x.token, direct, { body: 'Вопрос' })).body.data.id as number;
        expect((await edit(adminToken, direct, id, { body: 'Изменено' })).status).toBe(403);
        const own = (await send(adminToken, direct, { body: 'Ответ' })).body.data.id as number;
        expect((await edit(adminToken, direct, own, { body: 'Ответ исправлен' })).status).toBe(200);
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

describe('поиск сообщений', () => {
    type Hit = { chatId: number; messageId: number; senderName: string; text: string };
    const search = (token: string, query: string) => call(app, 'get', `/api/chats/search${query}`, { token });
    const q = (text: string) => '?q=' + encodeURIComponent(text);

    it('ищет без учёта регистра во всех беседах и в одной; чужое, удалённое и вложения не находятся', async () => {
        const b = await createBuilding(pool, 10);
        const a1 = await resident(b, 5, '501');
        const a2 = await resident(b, 5, '502');
        const other = await resident(b, 6, '601');
        const floor = (await chats(a1.token)).find((c) => c.kind === 'floor')!;
        const direct = (await call(app, 'post', '/api/chats/direct', { token: a1.token, body: { userId: a2.user.id } })).body.data
            .id as number;

        await send(a1.token, floor.id, { body: 'Где ключ от прачечной?' });
        await send(a2.token, direct, { body: 'Ключ у вахтёра' });
        const gone = (await send(a2.token, direct, { body: 'ключ потерялся' })).body.data.id as number;
        await call(app, 'delete', `/api/chats/${direct}/messages/${gone}`, { token: a2.token });
        await send(a1.token, direct, { body: '📎' });
        await send(a1.token, direct, { body: 'скидка 100% и a_b' });

        const all = (await search(a1.token, q('КЛЮЧ'))).body.data as Hit[];
        expect(all.map((h) => h.text)).toEqual(['Ключ у вахтёра', 'Где ключ от прачечной?']);
        expect(all[0].chatId).toBe(direct);

        const one = (await search(a1.token, `${q('ключ')}&chatId=${floor.id}`)).body.data as Hit[];
        expect(one.map((h) => h.chatId)).toEqual([floor.id]);

        // % и _ — обычные символы, а не шаблон
        expect(((await search(a1.token, q('%'))).body.data as Hit[]).map((h) => h.text)).toEqual(['скидка 100% и a_b']);
        expect((await search(a1.token, q('a_c'))).body.data).toEqual([]);

        // Жилец другого этажа ничего не находит, поиск в чужой беседе — 404
        expect((await search(other.token, q('ключ'))).body.data).toEqual([]);
        expect((await search(other.token, `?q=x&chatId=${floor.id}`)).status).toBe(404);
        expect((await search(a1.token, '?q=')).status).toBe(400);
        expect((await call(app, 'get', '/api/chats/search?q=x')).status).toBe(401);
    });
});

describe('аватар участника', () => {
    it('без аватара 404, без токена 401', async () => {
        const b = await createBuilding(pool, 10);
        const x = await resident(b, 2, '201');
        expect((await call(app, 'get', `/api/chats/avatar/${admin.id}`, { token: x.token })).status).toBe(404);
        expect((await call(app, 'get', `/api/chats/avatar/${admin.id}`)).status).toBe(401);
    });
});
describe('карточка пользователя', () => {
    type Profile = {
        userId: string; name: string; role: string; age: number | null;
        faculty: string | null; group: string | null;
        place: { buildingNumber: number; roomNumber: string } | null;
    } & Record<string, unknown>;
    const profile = async (token: string, userId: string) =>
        (await call(app, 'get', `/api/chats/users/${userId}/profile`, { token })).body.data as Profile;

    it('возраст без даты рождения; комната видна соседям по общежитию и администратору, но не жильцам другого', async () => {
        const home = await createBuilding(pool, 10);
        const away = await createBuilding(pool, 10);
        const target = await resident(home, 5, '501');
        const neighbour = await resident(home, 9, '901');
        const stranger = await resident(away, 5, '501');
        await pool.query(`UPDATE students SET faculty = 'ИИТА', group_name = ' ИТ-21 ' WHERE user_id = $1`, [target.user.id]);

        const seen = await profile(neighbour.token, target.user.id);
        expect(seen.faculty).toBe('ИИТА');
        expect(seen.group).toBe('ИТ-21');
        expect(seen.role).toBe('student');
        // Дата рождения в фабрике — 1 января 2005 года
        expect(seen.age).toBe(new Date().getFullYear() - 2005);
        expect(seen.place?.roomNumber).toBe('501');
        expect(JSON.stringify(seen)).not.toContain('2005');

        expect((await profile(adminToken, target.user.id)).place?.roomNumber).toBe('501');
        expect((await profile(target.token, target.user.id)).place?.roomNumber).toBe('501');
        const hidden = await profile(stranger.token, target.user.id);
        expect(hidden.place).toBeNull();
        expect(hidden.age).not.toBeNull();
        // Институт и группа видны всем, кто может открыть карточку
        expect(hidden.faculty).toBe('ИИТА');
        expect((await profile(neighbour.token, neighbour.user.id)).group).toBeNull();

        // Поиск людей тоже не раскрывает комнату и не ищет по ней жильцам другого общежития
        const found = (await call(app, 'get', `/api/chats/people?q=501`, { token: stranger.token })).body.data as Array<{
            userId: string; place: string | null;
        }>;
        expect(found.some((p) => p.userId === target.user.id)).toBe(false);
        const byName = (await call(app, 'get', `/api/chats/people?q=Тестовый`, { token: stranger.token })).body.data as Array<{
            userId: string; place: string | null;
        }>;
        expect(byName.find((p) => p.userId === target.user.id)?.place ?? null).toBeNull();
    });

    it('администратор без возраста и комнаты; неизвестный — 404, неверный id — 400, без токена — 401', async () => {
        const b = await createBuilding(pool, 10);
        const x = await resident(b, 2, '202');
        const a = await profile(x.token, admin.id);
        expect(a.role).toBe('admin');
        expect(a.age).toBeNull();
        expect(a.place).toBeNull();
        const missing = '00000000-0000-4000-8000-000000000000';
        expect((await call(app, 'get', `/api/chats/users/${missing}/profile`, { token: x.token })).status).toBe(404);
        expect((await call(app, 'get', '/api/chats/users/abc/profile', { token: x.token })).status).toBe(400);
        expect((await call(app, 'get', `/api/chats/users/${admin.id}/profile`)).status).toBe(401);
    });
});
