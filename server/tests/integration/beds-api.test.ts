import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { BedsService } from '../../src/services/beds.service.js';
import { createTestAppOptions } from '../setup/app-options.js';
import {
    call,
    createBuildingViaApi,
    loginForToken,
    type HttpMethod,
} from '../setup/api-helpers.js';
import { createLoginUser, type TestUser } from '../setup/auth-helpers.js';
import { captureDbError } from '../setup/capture.js';
import { createContract, createStudent, createUser } from '../setup/factories.js';
import { createRoomViaApi } from '../setup/rooms-helpers.js';
import { createTestPool } from '../setup/test-db.js';

const pool = createTestPool();
const app = createApp(pool, createTestAppOptions());
const service = new BedsService(pool);

let admin: TestUser;
let adminToken = '';
let studentToken = '';

beforeAll(async () => {
    admin = await createLoginUser(pool, { role: 'admin' });
    adminToken = await loginForToken(app, admin);
    studentToken = await loginForToken(app, await createLoginUser(pool, { role: 'student' }));
});

afterAll(async () => {
    await pool.end();
});

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface BedBody {
    id: string;
    roomId: string;
    bedNumber: number;
    status: string;
    createdAt: string;
    updatedAt: string;
}

/** Новая комната в новом здании */
async function newRoom(capacity = 3) {
    const building = await createBuildingViaApi(app, pool, adminToken);
    return createRoomViaApi(app, adminToken, building.id, { capacity });
}

const postBed = (roomId: string, bedNumber: number, extra: Record<string, unknown> = {}) =>
    call(app, 'post', '/api/beds', { token: adminToken, body: { roomId, bedNumber, ...extra } });

async function newBed(
    roomId: string,
    bedNumber: number,
    extra: Record<string, unknown> = {}
): Promise<BedBody> {
    const response = await postBed(roomId, bedNumber, extra);
    expect(response.status).toBe(201);
    return response.body.data as BedBody;
}

const bedUrl = (id: string) => `/api/beds/${id}`;

async function fetchBed(id: string): Promise<BedBody> {
    const response = await call(app, 'get', bedUrl(id), { token: adminToken });
    expect(response.status).toBe(200);
    return response.body.data as BedBody;
}

async function countBeds(roomId: string): Promise<number> {
    const result = await pool.query<{ count: string }>(
        'SELECT count(*) AS count FROM beds WHERE room_id = $1',
        [roomId]
    );
    return Number(result.rows[0].count);
}

interface AuditRow {
    actor_user_id: string | null;
    action: string;
    entity_type: string | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    details: Record<string, any>;
    ip: string | null;
}

async function auditFor(entityId: string): Promise<AuditRow[]> {
    const result = await pool.query<AuditRow>(
        `SELECT actor_user_id, action, entity_type, details, host(ip_address) AS ip
     FROM audit_logs WHERE entity_id = $1 ORDER BY id`,
        [entityId]
    );
    return result.rows;
}

describe('доступ и роли', () => {
    it('список коек без токена даёт 401', async () => {
        const response = await call(app, 'get', '/api/beds');

        expect(response.status).toBe(401);
    });

    it('студент не может читать список коек (403)', async () => {
        const response = await call(app, 'get', '/api/beds', { token: studentToken });

        expect(response.status).toBe(403);
    });

    it('студент не может создавать койку (403)', async () => {
        const room = await newRoom();

        const response = await call(app, 'post', '/api/beds', {
            token: studentToken,
            body: { roomId: room.id, bedNumber: 1 },
        });

        expect(response.status).toBe(403);
        expect(await countBeds(room.id)).toBe(0);
    });

    it.each<[string, HttpMethod, object | undefined]>([
        ['PUT', 'put', { bedNumber: 2, status: 'available' }],
        ['PATCH', 'patch', { status: 'maintenance' }],
        ['DELETE', 'delete', undefined],
    ])('студент не может изменять койку: %s (403)', async (_name, method, body) => {
        const bed = await newBed((await newRoom()).id, 1);

        const response = await call(app, method, bedUrl(bed.id), { token: studentToken, body });

        expect(response.status).toBe(403);
        expect(await fetchBed(bed.id)).toEqual(bed);
    });
});

describe('сообщежитие коек (POST)', () => {
    it('возвращает койку в формате camelCase, статус по умолчанию available', async () => {
        const room = await newRoom();

        const bed = await newBed(room.id, 1);

        expect(Object.keys(bed).sort()).toEqual([
            'bedNumber',
            'createdAt',
            'id',
            'roomId',
            'status',
            'updatedAt',
        ]);
        expect(bed).toMatchObject({ roomId: room.id, bedNumber: 1, status: 'available' });
    });

    it('принимает статус maintenance', async () => {
        const bed = await newBed((await newRoom()).id, 1, { status: 'maintenance' });

        expect(bed.status).toBe('maintenance');
    });

    it('повторный номер койки в комнате даёт 409', async () => {
        const room = await newRoom();
        await newBed(room.id, 1);

        const response = await postBed(room.id, 1);

        expect(response.status).toBe(409);
        expect(response.body.message).toBe('Койка с таким номером уже есть в этой комнате');
    });

    it('тот же номер койки в другой комнате допустим', async () => {
        await newBed((await newRoom()).id, 1);

        const bed = await newBed((await newRoom()).id, 1);

        expect(bed.bedNumber).toBe(1);
    });

    it('несуществующая комната даёт 422', async () => {
        const response = await postBed(randomUUID(), 1);

        expect(response.status).toBe(422);
        expect(response.body).toEqual({ status: 'error', message: 'Комната не найдена' });
    });

    it.each<[string, Record<string, unknown>, string]>([
        ['номер койки 0', { bedNumber: 0 }, 'bedNumber'],
        ['неизвестный статус', { status: 'broken' }, 'status'],
        ['лишнее поле', { foo: 1 }, 'foo'],
    ])('сообщежитие отклоняет: %s (400)', async (_name, extra, field) => {
        const room = await newRoom();

        const response = await postBed(room.id, 1, extra);

        expect(response.status).toBe(400);
        expect(response.body.message).toContain(field);
        expect(await countBeds(room.id)).toBe(0);
    });
});

describe('вместимость комнаты', () => {
    it('койки добавляются до вместимости, следующая даёт 409', async () => {
        const room = await newRoom(2);
        await newBed(room.id, 1);
        await newBed(room.id, 2);

        const response = await postBed(room.id, 3);

        expect(response.status).toBe(409);
        expect(response.body.message).toBe('Нельзя добавить койку: в комнате уже 2 коек из 2');
        expect(await countBeds(room.id)).toBe(2);
    });

    it('комната может быть заполнена не полностью', async () => {
        const room = await newRoom(3);
        await newBed(room.id, 1);

        const response = await call(app, 'get', `/api/beds?roomId=${room.id}`, { token: adminToken });

        expect(response.body.data).toHaveLength(1);
    });

    it('после удаления койки освобождается место', async () => {
        const room = await newRoom(2);
        const first = await newBed(room.id, 1);
        await newBed(room.id, 2);
        expect((await postBed(room.id, 3)).status).toBe(409);

        await call(app, 'delete', bedUrl(first.id), { token: adminToken });

        expect((await postBed(room.id, 3)).status).toBe(201);
    });

    it('койка на обслуживании тоже занимает место', async () => {
        const room = await newRoom(2);
        await newBed(room.id, 1, { status: 'maintenance' });
        await newBed(room.id, 2);

        const response = await postBed(room.id, 3);

        expect(response.status).toBe(409);
    });

    it('при одновременном добавлении в комнату с одним свободным местом успешна ровно одна койка', async () => {
        for (let round = 0; round < 3; round++) {
            const room = await newRoom(2);
            await newBed(room.id, 1);

            const responses = await Promise.all([postBed(room.id, 2), postBed(room.id, 3)]);

            expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
            expect(await countBeds(room.id)).toBe(2);
        }
    });

    it('добавление ждёт транзакцию, занявшую места, и затем отклоняется (409)', async () => {
        const room = await newRoom(2);
        const holder = await pool.connect();

        try {
            await holder.query('BEGIN');
            await holder.query('SELECT id FROM rooms WHERE id = $1 FOR UPDATE', [room.id]);
            await holder.query('INSERT INTO beds (room_id, bed_number) VALUES ($1, 1), ($1, 2)', [
                room.id,
            ]);

            let finished = false;
            const pending = postBed(room.id, 3).then((response) => {
                finished = true;
                return response;
            });

            await sleep(600);
            expect(finished, 'запрос должен ждать снятия блокировки комнаты').toBe(false);

            await holder.query('COMMIT');
            const response = await pending;

            expect(response.status).toBe(409);
            expect(response.body.message).toContain('уже 2 коек из 2');
            expect(await countBeds(room.id)).toBe(2);
        } finally {
            await holder.query('ROLLBACK');
            holder.release();
        }
    });
});

describe('чтение коек (GET)', () => {
    it('фильтр ?roomId= возвращает койки только этой комнаты по возрастанию номера', async () => {
        const room = await newRoom();
        const other = await newRoom();
        await newBed(room.id, 2);
        await newBed(room.id, 1);
        await newBed(other.id, 1);

        const response = await call(app, 'get', `/api/beds?roomId=${room.id}`, { token: adminToken });

        expect(response.status).toBe(200);
        const numbers = (response.body.data as BedBody[]).map((bed) => bed.bedNumber);
        expect(numbers).toEqual([1, 2]);
    });

    it('койка по идентификатору возвращает те же данные, что при создании', async () => {
        const bed = await newBed((await newRoom()).id, 1);

        expect(await fetchBed(bed.id)).toEqual(bed);
    });

    it('неизвестный идентификатор даёт 404', async () => {
        const response = await call(app, 'get', bedUrl(randomUUID()), { token: adminToken });

        expect(response.status).toBe(404);
        expect(response.body).toEqual({ status: 'error', message: 'Койка не найдена' });
    });

    it('некорректный идентификатор даёт 400', async () => {
        const response = await call(app, 'get', '/api/beds/not-a-uuid', { token: adminToken });

        expect(response.status).toBe(400);
    });

    it('неизвестный параметр запроса даёт 400', async () => {
        const response = await call(app, 'get', '/api/beds?foo=1', { token: adminToken });

        expect(response.status).toBe(400);
        expect(response.body.message).toContain('foo');
    });
});

describe('замена и изменение', () => {
    it('PUT заменяет номер и статус', async () => {
        const bed = await newBed((await newRoom()).id, 1);

        const response = await call(app, 'put', bedUrl(bed.id), {
            token: adminToken,
            body: { bedNumber: 5, status: 'maintenance' },
        });

        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({
            id: bed.id,
            roomId: bed.roomId,
            bedNumber: 5,
            status: 'maintenance',
        });
    });

    it('PUT с roomId даёт 400: койку нельзя перенести в другую комнату', async () => {
        const room = await newRoom();
        const other = await newRoom();
        const bed = await newBed(room.id, 1);

        const response = await call(app, 'put', bedUrl(bed.id), {
            token: adminToken,
            body: { roomId: other.id, bedNumber: 1, status: 'available' },
        });

        expect(response.status).toBe(400);
        expect(response.body.message).toContain('roomId');
        expect(await fetchBed(bed.id)).toEqual(bed);
    });

    it('PATCH меняет только статус', async () => {
        const bed = await newBed((await newRoom()).id, 1);

        const response = await call(app, 'patch', bedUrl(bed.id), {
            token: adminToken,
            body: { status: 'maintenance' },
        });

        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({
            ...bed,
            status: 'maintenance',
            updatedAt: expect.any(String),
        });
    });

    it('PATCH с номером, занятым в комнате, даёт 409', async () => {
        const room = await newRoom();
        await newBed(room.id, 1);
        const second = await newBed(room.id, 2);

        const response = await call(app, 'patch', bedUrl(second.id), {
            token: adminToken,
            body: { bedNumber: 1 },
        });

        expect(response.status).toBe(409);
        expect(response.body.message).toBe('Койка с таким номером уже есть в этой комнате');
        expect(await fetchBed(second.id)).toEqual(second);
    });

    it('PATCH с пустым объектом даёт 400', async () => {
        const bed = await newBed((await newRoom()).id, 1);

        const response = await call(app, 'patch', bedUrl(bed.id), { token: adminToken, body: {} });

        expect(response.status).toBe(400);
    });

    it('PATCH неизвестной койки даёт 404', async () => {
        const response = await call(app, 'patch', bedUrl(randomUUID()), {
            token: adminToken,
            body: { status: 'maintenance' },
        });

        expect(response.status).toBe(404);
        expect(response.body.message).toBe('Койка не найдена');
    });
});

describe('удаление коек', () => {
    it('удаляет койку и возвращает её идентификатор', async () => {
        const bed = await newBed((await newRoom()).id, 1);

        const response = await call(app, 'delete', bedUrl(bed.id), { token: adminToken });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ status: 'success', data: { id: bed.id } });
        expect((await call(app, 'get', bedUrl(bed.id), { token: adminToken })).status).toBe(404);
    });

    it('удаление неизвестной койки даёт 404', async () => {
        const response = await call(app, 'delete', bedUrl(randomUUID()), { token: adminToken });

        expect(response.status).toBe(404);
    });

    it('койка с договором не удаляется (409)', async () => {
        const bed = await newBed((await newRoom()).id, 1);
        await createContract(pool, {
            studentId: await createStudent(pool),
            bedId: bed.id,
            startDate: '2026-09-01',
            endDate: '2026-12-01',
            createdBy: await createUser(pool, 'admin'),
        });

        const response = await call(app, 'delete', bedUrl(bed.id), { token: adminToken });

        expect(response.status).toBe(409);
        expect(response.body.message).toBe('Нельзя удалить койку: по ней есть договоры');
        expect(await fetchBed(bed.id)).toEqual(bed);
    });
});

describe('журнал аудита', () => {
    it('сообщежитие записывает автора, адрес клиента и новые данные', async () => {
        const room = await newRoom();

        const response = await call(app, 'post', '/api/beds', {
            token: adminToken,
            ip: '10.20.30.60',
            body: { roomId: room.id, bedNumber: 1 },
        });

        expect(response.status).toBe(201);
        const rows = await auditFor(response.body.data.id as string);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            actor_user_id: admin.id,
            action: 'create_bed',
            entity_type: 'beds',
            ip: '10.20.30.60',
        });
        expect(rows[0].details.after).toEqual({ roomId: room.id, bedNumber: 1, status: 'available' });
    });

    it('изменение записывает значения до и после', async () => {
        const bed = await newBed((await newRoom()).id, 1);

        await call(app, 'patch', bedUrl(bed.id), {
            token: adminToken,
            ip: '10.20.30.61',
            body: { status: 'maintenance' },
        });

        const rows = await auditFor(bed.id);
        expect(rows.map((row) => row.action)).toEqual(['create_bed', 'update_bed']);
        expect(rows[1].ip).toBe('10.20.30.61');
        expect(rows[1].details.before.status).toBe('available');
        expect(rows[1].details.after.status).toBe('maintenance');
    });

    it('удаление записывает снимок удалённой койки', async () => {
        const room = await newRoom();
        const bed = await newBed(room.id, 1);

        await call(app, 'delete', bedUrl(bed.id), { token: adminToken });

        const rows = await auditFor(bed.id);
        expect(rows.map((row) => row.action)).toEqual(['create_bed', 'delete_bed']);
        expect(rows[1].details.snapshot).toEqual({
            roomId: room.id,
            bedNumber: 1,
            status: 'available',
        });
    });

    it('отклонённое добавление (409) не записывает аудит', async () => {
        const room = await newRoom(2);
        await newBed(room.id, 1);
        await newBed(room.id, 2);

        const response = await postBed(room.id, 3);

        expect(response.status).toBe(409);
        const count = await pool.query<{ count: string }>(
            `SELECT count(*) AS count FROM audit_logs
       WHERE action = 'create_bed' AND details->'after'->>'roomId' = $1`,
            [room.id]
        );
        expect(Number(count.rows[0].count)).toBe(2);
    });

    it('ошибка аудита при создании откатывает сообщежитие койки', async () => {
        const room = await newRoom();

        const error = await captureDbError(
            service.create({ roomId: room.id, bedNumber: 1 }, { userId: randomUUID() })
        );

        expect(error.code).toBe('23503');
        expect(error.constraint).toBe('audit_logs_actor_user_id_fkey');
        expect(await countBeds(room.id)).toBe(0);
    });

    it('ошибка аудита при удалении откатывает удаление и не принимается за договор', async () => {
        const bed = await newBed((await newRoom()).id, 1);

        const error = await captureDbError(service.delete(bed.id, { userId: randomUUID() }));

        expect(error.code).toBe('23503');
        expect(error.constraint).toBe('audit_logs_actor_user_id_fkey');
        expect(error.message).not.toContain('договоры');
        expect(await fetchBed(bed.id)).toEqual(bed);
    });
});