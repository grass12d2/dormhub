import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { StudentsService } from '../../src/services/students.service.js';
import { createTestAppOptions } from '../setup/app-options.js';
import { call, loginForToken, type HttpMethod } from '../setup/api-helpers.js';
import { createLoginUser, postLogin, TEST_PASSWORD, type TestUser } from '../setup/auth-helpers.js';
import { captureDbError } from '../setup/capture.js';
import {
    createBed,
    createBuilding,
    createContract,
    createRoom,
    createUser,
} from '../setup/factories.js';
import { createTestPool } from '../setup/test-db.js';

const pool = createTestPool();
const app = createApp(pool, createTestAppOptions());
const service = new StudentsService(pool, { bcryptRounds: 4 });

let admin: TestUser;
let adminToken = '';
let studentUser: TestUser;
let studentToken = '';

beforeAll(async () => {
    admin = await createLoginUser(pool, { role: 'admin' });
    adminToken = await loginForToken(app, admin);
    studentUser = await createLoginUser(pool, { role: 'student' });
    studentToken = await loginForToken(app, studentUser);
});

afterAll(async () => {
    await pool.end();
});

interface StudentBody {
    id: string;
    userId: string | null;
    studentNumber: string;
    displayName: string;
    lastName: string | null;
    firstName: string | null;
    middleName: string | null;
    birthDate: string;
    phone: string | null;
    faculty: string | null;
    groupName: string | null;
    educationLevel: string | null;
    fieldOfStudy: string | null;
    programCode: string | null;
    specialization: string | null;
    studyYear: number | null;
    fundingType: string | null;
    createdAt: string;
    updatedAt: string;
}

/** Следующий свободный номер студенческого (в тестовой базе нет других писателей) */
async function nextStudentNumber(): Promise<string> {
    const result = await pool.query<{ next: string }>(
        "SELECT lpad((COALESCE(max(student_number::bigint), 0) + 1)::text, 7, '0') AS next FROM students"
    );
    return result.rows[0].next;
}

async function payload(overrides: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    return {
        studentNumber: await nextStudentNumber(),
        displayName: 'Тестов Тест Тестович',
        birthDate: '2005-01-01',
        ...overrides,
    };
}

const postStudent = (body: object) =>
    call(app, 'post', '/api/students', { token: adminToken, body });

async function newStudent(overrides: Record<string, unknown> = {}): Promise<StudentBody> {
    const response = await postStudent(await payload(overrides));
    expect(response.status).toBe(201);
    return response.body.data as StudentBody;
}

const studentUrl = (id: string) => `/api/students/${id}`;

async function fetchStudent(id: string): Promise<StudentBody> {
    const response = await call(app, 'get', studentUrl(id), { token: adminToken });
    expect(response.status).toBe(200);
    return response.body.data as StudentBody;
}

async function countStudents(studentNumber: string): Promise<number> {
    const result = await pool.query<{ count: string }>(
        'SELECT count(*) AS count FROM students WHERE student_number = $1',
        [studentNumber]
    );
    return Number(result.rows[0].count);
}

async function countUsers(email: string): Promise<number> {
    const result = await pool.query<{ count: string }>(
        'SELECT count(*) AS count FROM users WHERE email = $1',
        [email]
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

const uniqueEmail = () => `student-${randomUUID()}@example.com`;

describe('доступ и роли', () => {
    it('список студентов без токена даёт 401', async () => {
        const response = await call(app, 'get', '/api/students');

        expect(response.status).toBe(401);
    });

    it('студент не может читать список (403)', async () => {
        const response = await call(app, 'get', '/api/students', { token: studentToken });

        expect(response.status).toBe(403);
    });

    it('студент не может создавать студента (403)', async () => {
        const body = await payload();

        const response = await call(app, 'post', '/api/students', { token: studentToken, body });

        expect(response.status).toBe(403);
        expect(await countStudents(body.studentNumber as string)).toBe(0);
    });

    it.each<[string, HttpMethod, object | undefined]>([
        ['GET', 'get', undefined],
        ['PUT', 'put', { studentNumber: '9999999', displayName: 'Чужой', birthDate: '2005-01-01' }],
        ['PATCH', 'patch', { displayName: 'Чужой' }],
        ['DELETE', 'delete', undefined],
    ])('студент не может работать с чужой записью: %s (403)', async (_name, method, body) => {
        const student = await newStudent();

        const response = await call(app, method, studentUrl(student.id), {
            token: studentToken,
            body,
        });

        expect(response.status).toBe(403);
        expect(await fetchStudent(student.id)).toEqual(student);
    });
});

describe('собственный профиль (GET /api/students/me)', () => {
    it('без токена даёт 401', async () => {
        expect((await call(app, 'get', '/api/students/me')).status).toBe(401);
    });

    it('учётная запись без профиля даёт 404', async () => {
        const response = await call(app, 'get', '/api/students/me', { token: studentToken });

        expect(response.status).toBe(404);
        expect(response.body.message).toBe('Профиль студента не найден');
    });

    it('администратор без профиля тоже получает 404', async () => {
        const response = await call(app, 'get', '/api/students/me', { token: adminToken });

        expect(response.status).toBe(404);
    });

    it('студент с привязанным профилем читает именно свой профиль', async () => {
        const owner = await createLoginUser(pool, { role: 'student' });
        const student = await newStudent({ userId: owner.id });

        const response = await call(app, 'get', '/api/students/me', {
            token: await loginForToken(app, owner),
        });

        expect(response.status).toBe(200);
        expect(response.body.data).toEqual(student);
        expect(response.body.data.userId).toBe(owner.id);
    });
});

describe('сообщежитие студентов (POST)', () => {
    it('возвращает студента в формате camelCase, необязательные поля равны null', async () => {
        const student = await newStudent();

        expect(Object.keys(student).sort()).toEqual([
            'birthDate',
            'createdAt',
            'displayName',
            'educationLevel',
            'faculty',
            'fieldOfStudy',
            'firstName',
            'fundingType',
            'groupName',
            'id',
            'lastName',
            'middleName',
            'phone',
            'programCode',
            'specialization',
            'studentNumber',
            'studyYear',
            'updatedAt',
            'userId',
        ]);
        expect(student).toMatchObject({
            displayName: 'Тестов Тест Тестович',
            userId: null,
            lastName: null,
            studyYear: null,
            fundingType: null,
        });
    });

    it('сохраняет все поля', async () => {
        const student = await newStudent({
            lastName: 'Тестов',
            firstName: 'Тест',
            middleName: 'Тестович',
            phone: '+7 900 000-00-00',
            faculty: 'Факультет тестирования',
            groupName: 'ТС-10',
            educationLevel: 'Бакалавриат',
            fieldOfStudy: 'Информатика',
            programCode: '09.03.01',
            specialization: 'Тестирование',
            studyYear: 2,
            fundingType: 'scholarship',
        });

        expect(student).toMatchObject({
            lastName: 'Тестов',
            groupName: 'ТС-10',
            programCode: '09.03.01',
            studyYear: 2,
            fundingType: 'scholarship',
        });
    });

    it('дата рождения возвращается строкой ГГГГ-ММ-ДД без сдвига часового пояса', async () => {
        const student = await newStudent({ birthDate: '2005-01-01' });

        expect(student.birthDate).toBe('2005-01-01');
        const stored = await pool.query<{ birth_date: string }>(
            'SELECT birth_date::text AS birth_date FROM students WHERE id = $1',
            [student.id]
        );
        expect(stored.rows[0].birth_date).toBe('2005-01-01');
    });

    it('обрезает пробелы по краям отображаемого имени', async () => {
        const student = await newStudent({ displayName: '  Тестов Тест  ' });

        expect(student.displayName).toBe('Тестов Тест');
    });

    it('повторный номер студенческого даёт 409', async () => {
        const existing = await newStudent();

        const response = await postStudent(await payload({ studentNumber: existing.studentNumber }));

        expect(response.status).toBe(409);
        expect(response.body.message).toBe('Студент с таким номером студенческого уже существует');
    });

    it.each<[string, Record<string, unknown>, string]>([
        ['номер из 6 цифр', { studentNumber: '123456' }, 'studentNumber'],
        ['номер с буквой', { studentNumber: '12a4567' }, 'studentNumber'],
        ['пустое отображаемое имя', { displayName: '   ' }, 'displayName'],
        ['дата рождения в будущем', { birthDate: '2999-01-01' }, 'birthDate'],
        ['несуществующая дата рождения', { birthDate: '2005-02-30' }, 'birthDate'],
        ['неизвестный вид финансирования', { fundingType: 'grant' }, 'fundingType'],
        ['нулевой курс', { studyYear: 0 }, 'studyYear'],
        ['лишнее поле', { foo: 1 }, 'foo'],
        ['userId не UUID', { userId: 'abc' }, 'userId'],
    ])('сообщежитие отклоняет: %s (400)', async (_name, overrides, field) => {
        const response = await postStudent(await payload(overrides));

        expect(response.status).toBe(400);
        expect(response.body.message).toMatch(/^Некорректные данные запроса: /);
        expect(response.body.message).toContain(field);
    });

    it('одновременные userId и account дают 400', async () => {
        const response = await postStudent(
            await payload({
                userId: studentUser.id,
                account: { email: uniqueEmail(), password: TEST_PASSWORD },
            })
        );

        expect(response.status).toBe(400);
        expect(response.body.message).toContain('account');
    });
});

describe('связь с учётной записью', () => {
    it('привязывает существующую учётную запись студента', async () => {
        const owner = await createLoginUser(pool, { role: 'student' });

        const student = await newStudent({ userId: owner.id });

        expect(student.userId).toBe(owner.id);
    });

    it('учётная запись администратора не привязывается (422)', async () => {
        const adminUser = await createLoginUser(pool, { role: 'admin' });
        const body = await payload({ userId: adminUser.id });

        const response = await postStudent(body);

        expect(response.status).toBe(422);
        expect(response.body.message).toBe('Учётная запись не найдена или не имеет роли студента');
        expect(await countStudents(body.studentNumber as string)).toBe(0);
    });

    it('несуществующая учётная запись даёт 422', async () => {
        const response = await postStudent(await payload({ userId: randomUUID() }));

        expect(response.status).toBe(422);
    });

    it('одну учётную запись нельзя привязать к двум студентам (409)', async () => {
        const owner = await createLoginUser(pool, { role: 'student' });
        await newStudent({ userId: owner.id });

        const response = await postStudent(await payload({ userId: owner.id }));

        expect(response.status).toBe(409);
        expect(response.body.message).toBe('Эта учётная запись уже привязана к другому студенту');
    });

    it('сообщежитие с учётной записью: пользователь с ролью student, хеш пароля, вход и профиль', async () => {
        const email = uniqueEmail();

        const response = await postStudent(
            await payload({ account: { email, password: TEST_PASSWORD } })
        );

        expect(response.status).toBe(201);
        const student = response.body.data as StudentBody;
        expect(student.userId).toEqual(expect.any(String));
        const user = await pool.query<{ role: string; is_active: boolean; password_hash: string }>(
            'SELECT role, is_active, password_hash FROM users WHERE id = $1',
            [student.userId]
        );
        expect(user.rows[0].role).toBe('student');
        expect(user.rows[0].is_active).toBe(true);
        expect(user.rows[0].password_hash).toMatch(/^\$2[aby]\$04\$/);
        expect(user.rows[0].password_hash).not.toContain(TEST_PASSWORD);

        const login = await postLogin(app, email, TEST_PASSWORD);
        expect(login.status).toBe(200);
        const me = await call(app, 'get', '/api/students/me', { token: login.body.data.token });
        expect(me.status).toBe(200);
        expect(me.body.data.id).toBe(student.id);
    });

    it('повторный email учётной записи даёт 409 и студент не создаётся', async () => {
        const email = uniqueEmail();
        await postStudent(await payload({ account: { email, password: TEST_PASSWORD } }));
        const body = await payload({ account: { email, password: TEST_PASSWORD } });

        const response = await postStudent(body);

        expect(response.status).toBe(409);
        expect(response.body.message).toBe('Пользователь с таким email уже существует');
        expect(await countStudents(body.studentNumber as string)).toBe(0);
    });

    it('слишком короткий пароль даёт 400 и ничего не создаётся', async () => {
        const email = uniqueEmail();
        const body = await payload({ account: { email, password: 'short' } });

        const response = await postStudent(body);

        expect(response.status).toBe(400);
        expect(response.body.message).toMatch(/не менее 10 символов/);
        expect(await countStudents(body.studentNumber as string)).toBe(0);
        expect(await countUsers(email)).toBe(0);
    });

    it('ошибка при создании студента откатывает и учётную запись (повторный номер)', async () => {
        const existing = await newStudent();
        const email = uniqueEmail();

        const response = await postStudent(
            await payload({
                studentNumber: existing.studentNumber,
                account: { email, password: TEST_PASSWORD },
            })
        );

        expect(response.status).toBe(409);
        expect(await countUsers(email)).toBe(0);
    });
});

describe('чтение студентов (GET)', () => {
    it('список: метаданные и постраничный вывод по отображаемому имени', async () => {
        const tag = `Пг${randomUUID().slice(0, 8)}`;
        for (const suffix of ['Гамма', 'Альфа', 'Бета']) {
            await newStudent({ displayName: `${tag} ${suffix}` });
        }
        const url = (extra: string) => `/api/students?q=${encodeURIComponent(tag)}&${extra}`;

        const first = await call(app, 'get', url('limit=2&offset=0'), { token: adminToken });
        const second = await call(app, 'get', url('limit=2&offset=2'), { token: adminToken });

        expect(first.status).toBe(200);
        expect(first.body.meta).toEqual({ total: 3, limit: 2, offset: 0 });
        expect((first.body.data as StudentBody[]).map((s) => s.displayName)).toEqual([
            `${tag} Альфа`,
            `${tag} Бета`,
        ]);
        expect(second.body.meta).toEqual({ total: 3, limit: 2, offset: 2 });
        expect((second.body.data as StudentBody[]).map((s) => s.displayName)).toEqual([
            `${tag} Гамма`,
        ]);
    });

    it('поиск по отображаемому имени не зависит от регистра', async () => {
        const tag = `Рг${randomUUID().slice(0, 8)}`;
        await newStudent({ displayName: `${tag} Иванов` });

        const response = await call(
            app,
            'get',
            `/api/students?q=${encodeURIComponent(tag.toLowerCase())}`,
            { token: adminToken }
        );

        expect(response.status).toBe(200);
        expect(response.body.meta.total).toBe(1);
    });

    it('поиск по номеру студенческого', async () => {
        const student = await newStudent();

        const response = await call(app, 'get', `/api/students?q=${student.studentNumber}`, {
            token: adminToken,
        });

        expect(response.body.data.map((s: StudentBody) => s.id)).toEqual([student.id]);
    });

    it('служебные символы в поиске не работают как шаблон', async () => {
        await newStudent();

        const response = await call(app, 'get', `/api/students?q=${encodeURIComponent('%')}`, {
            token: adminToken,
        });

        expect(response.status).toBe(200);
        expect(response.body.meta.total).toBe(0);
        expect(response.body.data).toEqual([]);
    });

    it('по умолчанию limit равен 50, offset равен 0', async () => {
        const response = await call(app, 'get', '/api/students', { token: adminToken });

        expect(response.status).toBe(200);
        expect(response.body.meta).toMatchObject({ limit: 50, offset: 0 });
        expect(response.body.meta.total).toEqual(expect.any(Number));
    });

    it.each(['limit=0', 'limit=201', 'offset=-1', 'foo=1'])(
        'неверный параметр запроса %s даёт 400',
        async (query) => {
            const response = await call(app, 'get', `/api/students?${query}`, { token: adminToken });

            expect(response.status).toBe(400);
        }
    );

    it('студент по идентификатору возвращает те же данные, что при создании', async () => {
        const student = await newStudent({ lastName: 'Тестов' });

        expect(await fetchStudent(student.id)).toEqual(student);
    });

    it('неизвестный идентификатор даёт 404', async () => {
        const response = await call(app, 'get', studentUrl(randomUUID()), { token: adminToken });

        expect(response.status).toBe(404);
        expect(response.body).toEqual({ status: 'error', message: 'Студент не найден' });
    });

    it('некорректный идентификатор даёт 400', async () => {
        const response = await call(app, 'get', '/api/students/not-a-uuid', { token: adminToken });

        expect(response.status).toBe(400);
    });

    it('поиск находит подстроку в середине имени', async () => {
        const tag = `Сер${randomUUID().slice(0, 8)}`;
        await newStudent({ displayName: `Иванов ${tag}ович` });

        const response = await call(app, 'get', `/api/students?q=${encodeURIComponent(tag)}`, {
            token: adminToken,
        });

        expect(response.status).toBe(200);
        expect(response.body.meta.total).toBe(1);
    });

    it('фильтр по институту и группе', async () => {
        const group = 'ЯЯ-12';
        const inGroup = await newStudent({ faculty: 'ИИТА', groupName: group });
        await newStudent({ faculty: 'ИГД', groupName: group });

        const response = await call(
            app,
            'get',
            `/api/students?faculty=ИИТА&groupName=${encodeURIComponent(group)}`,
            { token: adminToken }
        );

        expect(response.status).toBe(200);
        expect(response.body.data.map((s: StudentBody) => s.id)).toEqual([inGroup.id]);
    });
});

describe('замена и изменение', () => {
    it('PUT заменяет все поля, пропущенные необязательные становятся null', async () => {
        const student = await newStudent({ lastName: 'Тестов', studyYear: 3, fundingType: 'paid' });

        const response = await call(app, 'put', studentUrl(student.id), {
            token: adminToken,
            body: {
                studentNumber: student.studentNumber,
                displayName: 'Новое Имя',
                birthDate: '2004-12-31',
            },
        });

        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({
            id: student.id,
            displayName: 'Новое Имя',
            birthDate: '2004-12-31',
            lastName: null,
            studyYear: null,
            fundingType: null,
        });
    });

    it('PUT с userId даёт 400', async () => {
        const student = await newStudent();

        const response = await call(app, 'put', studentUrl(student.id), {
            token: adminToken,
            body: {
                studentNumber: student.studentNumber,
                displayName: student.displayName,
                birthDate: student.birthDate,
                userId: randomUUID(),
            },
        });

        expect(response.status).toBe(400);
        expect(response.body.message).toContain('userId');
        expect(await fetchStudent(student.id)).toEqual(student);
    });

    it('PUT неизвестного студента даёт 404', async () => {
        const response = await call(app, 'put', studentUrl(randomUUID()), {
            token: adminToken,
            body: await payload(),
        });

        expect(response.status).toBe(404);
    });

    it('PATCH меняет только переданные поля', async () => {
        const student = await newStudent({ lastName: 'Тестов', groupName: 'ТС-10' });

        const response = await call(app, 'patch', studentUrl(student.id), {
            token: adminToken,
            body: { groupName: 'ТС-11' },
        });

        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({
            ...student,
            groupName: 'ТС-11',
            updatedAt: expect.any(String),
        });
    });

    it('PATCH с null очищает необязательное поле', async () => {
        const student = await newStudent({ lastName: 'Тестов' });

        const response = await call(app, 'patch', studentUrl(student.id), {
            token: adminToken,
            body: { lastName: null },
        });

        expect(response.status).toBe(200);
        expect(response.body.data.lastName).toBeNull();
        expect(response.body.data.displayName).toBe(student.displayName);
    });

    it('PATCH с пустым объектом даёт 400', async () => {
        const student = await newStudent();

        const response = await call(app, 'patch', studentUrl(student.id), {
            token: adminToken,
            body: {},
        });

        expect(response.status).toBe(400);
    });

    it('PATCH с неизвестным полем даёт 400', async () => {
        const student = await newStudent();

        const response = await call(app, 'patch', studentUrl(student.id), {
            token: adminToken,
            body: { foo: 1 },
        });

        expect(response.status).toBe(400);
        expect(response.body.message).toContain('foo');
    });

    it('PATCH с номером другого студента даёт 409', async () => {
        const first = await newStudent();
        const second = await newStudent();

        const response = await call(app, 'patch', studentUrl(second.id), {
            token: adminToken,
            body: { studentNumber: first.studentNumber },
        });

        expect(response.status).toBe(409);
        expect(await fetchStudent(second.id)).toEqual(second);
    });

    it('PATCH с некорректной датой рождения даёт 400', async () => {
        const student = await newStudent();

        const response = await call(app, 'patch', studentUrl(student.id), {
            token: adminToken,
            body: { birthDate: '2999-01-01' },
        });

        expect(response.status).toBe(400);
    });

    it('PATCH неизвестного студента даёт 404', async () => {
        const response = await call(app, 'patch', studentUrl(randomUUID()), {
            token: adminToken,
            body: { displayName: 'Имя' },
        });

        expect(response.status).toBe(404);
    });
});

describe('удаление студентов', () => {
    it('удаляет студента и возвращает его идентификатор', async () => {
        const student = await newStudent();

        const response = await call(app, 'delete', studentUrl(student.id), { token: adminToken });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ status: 'success', data: { id: student.id } });
        expect((await call(app, 'get', studentUrl(student.id), { token: adminToken })).status).toBe(
            404
        );
    });

    it('удаление неизвестного студента даёт 404', async () => {
        const response = await call(app, 'delete', studentUrl(randomUUID()), { token: adminToken });

        expect(response.status).toBe(404);
    });

    it('студент с договором не удаляется (409)', async () => {
        const student = await newStudent();
        const bedId = await createBed(
            pool,
            await createRoom(pool, await createBuilding(pool)),
            1
        );
        await createContract(pool, {
            studentId: student.id,
            bedId,
            startDate: '2026-09-01',
            endDate: '2026-12-01',
            createdBy: await createUser(pool, 'admin'),
        });

        const response = await call(app, 'delete', studentUrl(student.id), { token: adminToken });

        expect(response.status).toBe(409);
        expect(response.body.message).toBe('Нельзя удалить студента: по нему есть договоры');
        expect(await fetchStudent(student.id)).toEqual(student);
    });

    it('удаление студента не удаляет привязанную учётную запись', async () => {
        const email = uniqueEmail();
        const student = (
            await postStudent(await payload({ account: { email, password: TEST_PASSWORD } }))
        ).body.data as StudentBody;

        const response = await call(app, 'delete', studentUrl(student.id), { token: adminToken });

        expect(response.status).toBe(200);
        expect(await countUsers(email)).toBe(1);
    });
});

describe('журнал аудита', () => {
    it('сообщежитие записывает автора, адрес клиента и новые данные', async () => {
        const response = await call(app, 'post', '/api/students', {
            token: adminToken,
            ip: '10.20.30.70',
            body: await payload(),
        });

        expect(response.status).toBe(201);
        const student = response.body.data as StudentBody;
        const rows = await auditFor(student.id);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            actor_user_id: admin.id,
            action: 'create_student',
            entity_type: 'students',
            ip: '10.20.30.70',
        });
        expect(rows[0].details.after.studentNumber).toBe(student.studentNumber);
        expect(rows[0].details.accountCreated).toBe(false);
    });

    it('сообщежитие с учётной записью даёт две записи аудита и не содержит пароль', async () => {
        const email = uniqueEmail();

        const response = await postStudent(
            await payload({ account: { email, password: TEST_PASSWORD } })
        );

        const student = response.body.data as StudentBody;
        const studentRows = await auditFor(student.id);
        const userRows = await auditFor(student.userId as string);
        expect(studentRows.map((row) => row.action)).toEqual(['create_student']);
        expect(studentRows[0].details.accountCreated).toBe(true);
        expect(userRows.map((row) => row.action)).toEqual(['create_user']);
        expect(userRows[0].details).toMatchObject({ email, role: 'student' });
        expect(JSON.stringify([...studentRows, ...userRows])).not.toContain(TEST_PASSWORD);
    });

    it('изменение записывает значения до и после', async () => {
        const student = await newStudent({ groupName: 'ТС-10' });

        await call(app, 'patch', studentUrl(student.id), {
            token: adminToken,
            ip: '10.20.30.71',
            body: { groupName: 'ТС-11' },
        });

        const rows = await auditFor(student.id);
        expect(rows.map((row) => row.action)).toEqual(['create_student', 'update_student']);
        expect(rows[1].ip).toBe('10.20.30.71');
        expect(rows[1].details.before.groupName).toBe('ТС-10');
        expect(rows[1].details.after.groupName).toBe('ТС-11');
    });

    it('удаление записывает снимок удалённого студента', async () => {
        const student = await newStudent({ lastName: 'Тестов' });

        await call(app, 'delete', studentUrl(student.id), { token: adminToken });

        const rows = await auditFor(student.id);
        expect(rows.map((row) => row.action)).toEqual(['create_student', 'delete_student']);
        expect(rows[1].details.snapshot.studentNumber).toBe(student.studentNumber);
        expect(rows[1].details.snapshot.lastName).toBe('Тестов');
    });

    it('отклонённое сообщежитие (409) не записывает аудит', async () => {
        const existing = await newStudent();
        const countCreateAudits = async (): Promise<number> => {
            const result = await pool.query<{ count: string }>(
                "SELECT count(*) AS count FROM audit_logs WHERE action = 'create_student'"
            );
            return Number(result.rows[0].count);
        };
        const before = await countCreateAudits();

        const response = await postStudent(await payload({ studentNumber: existing.studentNumber }));

        expect(response.status).toBe(409);
        expect(await countCreateAudits()).toBe(before);
    });

    it('ошибка аудита откатывает сообщежитие студента', async () => {
        const input = { studentNumber: await nextStudentNumber(), displayName: 'Откат', birthDate: '2005-01-01' };

        const error = await captureDbError(service.create(input, { userId: randomUUID() }));

        expect(error.code).toBe('23503');
        expect(error.constraint).toBe('audit_logs_actor_user_id_fkey');
        expect(await countStudents(input.studentNumber)).toBe(0);
    });

    it('ошибка аудита откатывает и сообщежитие студента, и учётной записи', async () => {
        const email = uniqueEmail();
        const input = {
            studentNumber: await nextStudentNumber(),
            displayName: 'Откат',
            birthDate: '2005-01-01',
            account: { email, password: TEST_PASSWORD },
        };

        const error = await captureDbError(service.create(input, { userId: randomUUID() }));

        expect(error.code).toBe('23503');
        expect(error.constraint).toBe('audit_logs_actor_user_id_fkey');
        expect(await countStudents(input.studentNumber)).toBe(0);
        expect(await countUsers(email)).toBe(0);
    });
});

describe('параллельные операции', () => {
    it('два одновременных запроса с одним номером: один создаёт, другой получает 409', async () => {
        for (let round = 0; round < 3; round++) {
            const studentNumber = await nextStudentNumber();
            const send = () =>
                postStudent({ studentNumber, displayName: 'Гонка', birthDate: '2005-01-01' });

            const responses = await Promise.all([send(), send()]);

            expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
            expect(await countStudents(studentNumber)).toBe(1);
        }
    });

    it('параллельные изменения разных полей не затирают друг друга', async () => {
        for (let round = 0; round < 5; round++) {
            const student = await newStudent();
            const url = studentUrl(student.id);

            const [first, second] = await Promise.all([
                call(app, 'patch', url, { token: adminToken, body: { displayName: `Имя ${round}` } }),
                call(app, 'patch', url, { token: adminToken, body: { phone: `+7 900 000-00-0${round}` } }),
            ]);

            expect(first.status).toBe(200);
            expect(second.status).toBe(200);
            const final = await fetchStudent(student.id);
            expect(final).toMatchObject({ displayName: `Имя ${round}`, phone: `+7 900 000-00-0${round}` });
        }
    });
});