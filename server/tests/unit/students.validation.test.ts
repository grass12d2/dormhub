import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { mergeStudentValues } from '../../src/services/students.service.js';
import type { StudentValues } from '../../src/types/students.js';
import {
    createStudentSchema,
    listStudentsQuerySchema,
    patchStudentSchema,
    replaceStudentSchema,
} from '../../src/validation/students.validation.js';

const VALID = {
    studentNumber: '2326001',
    displayName: 'Тестов Тест Тестович',
    birthDate: '2005-01-01',
};

const FULL = {
    ...VALID,
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
    fundingType: 'budget',
};

function withOverrides(overrides: Record<string, unknown>): Record<string, unknown> {
    return { ...VALID, ...overrides };
}

function without(key: string): Record<string, unknown> {
    const copy: Record<string, unknown> = { ...VALID };
    delete copy[key];
    return copy;
}

const INVALID: Array<[string, Record<string, unknown>]> = [
    ['номер из 6 цифр', withOverrides({ studentNumber: '123456' })],
    ['номер из 8 цифр', withOverrides({ studentNumber: '12345678' })],
    ['номер с буквой', withOverrides({ studentNumber: '12a4567' })],
    ['номер с пробелом', withOverrides({ studentNumber: ' 2326001' })],
    ['номер числом', withOverrides({ studentNumber: 2326001 })],
    ['пустое отображаемое имя', withOverrides({ displayName: '   ' })],
    ['дата в будущем', withOverrides({ birthDate: '2999-01-01' })],
    ['дата раньше 1900 года', withOverrides({ birthDate: '1899-12-31' })],
    ['несуществующая дата 30 февраля', withOverrides({ birthDate: '2005-02-30' })],
    ['несуществующий месяц', withOverrides({ birthDate: '2005-13-01' })],
    ['дата в другом формате', withOverrides({ birthDate: '01.01.2005' })],
    ['неизвестный вид финансирования', withOverrides({ fundingType: 'grant' })],
    ['нулевой курс', withOverrides({ studyYear: 0 })],
    ['курс 11', withOverrides({ studyYear: 11 })],
    ['курс не целый', withOverrides({ studyYear: 1.5 })],
    ['фамилия из одних пробелов', withOverrides({ lastName: '  ' })],
    ['идентификатор учётной записи не UUID', withOverrides({ userId: 'not-a-uuid' })],
    ['лишнее поле', withOverrides({ foo: 1 })],
    ['группа из трёх букв', withOverrides({ groupName: 'ИТМ-5' })],
    ['группа латиницей', withOverrides({ groupName: 'MD-7' })],
    ['номер группы 13', withOverrides({ groupName: 'МД-13' })],
    ['номер группы 0', withOverrides({ groupName: 'МД-0' })],
    ['группа без дефиса', withOverrides({ groupName: 'МД7' })],
];

describe('createStudentSchema', () => {
    it('принимает минимальные данные', () => {
        expect(createStudentSchema.safeParse(VALID).success).toBe(true);
    });

    it('принимает все необязательные поля', () => {
        expect(createStudentSchema.safeParse(FULL).success).toBe(true);
    });

    it('необязательные поля можно передать как null', () => {
        const body = withOverrides({ lastName: null, studyYear: null, fundingType: null });

        expect(createStudentSchema.safeParse(body).success).toBe(true);
    });

    it('принимает номер с ведущими нулями и граничные даты рождения', () => {
        expect(createStudentSchema.safeParse(withOverrides({ studentNumber: '0000001' })).success).toBe(
            true
        );
        expect(createStudentSchema.safeParse(withOverrides({ birthDate: '1900-01-01' })).success).toBe(
            true
        );
    });

    it('обрезает пробелы по краям текстовых полей', () => {
        const result = createStudentSchema.safeParse(
            withOverrides({ displayName: '  Тестов Тест  ', lastName: ' Тестов ' })
        );

        expect(result.data?.displayName).toBe('Тестов Тест');
        expect(result.data?.lastName).toBe('Тестов');
    });

    it.each(INVALID)('отклоняет: %s', (_name, body) => {
        expect(createStudentSchema.safeParse(body).success).toBe(false);
    });

    it.each(['studentNumber', 'displayName', 'birthDate'])('отклоняет данные без поля %s', (key) => {
        expect(createStudentSchema.safeParse(without(key)).success).toBe(false);
    });

    it('приводит userId к нижнему регистру', () => {
        const id = randomUUID();

        const result = createStudentSchema.safeParse(withOverrides({ userId: id.toUpperCase() }));

        expect(result.data?.userId).toBe(id);
    });

    it('принимает новую учётную запись', () => {
        const body = withOverrides({ account: { email: 'New@Example.com', password: 'Whatever-123' } });

        const result = createStudentSchema.safeParse(body);

        expect(result.success).toBe(true);
        expect(result.data?.account?.email).toBe('new@example.com');
    });

    it('отклоняет учётную запись с некорректным email', () => {
        const body = withOverrides({ account: { email: 'not-an-email', password: 'Whatever-123' } });

        expect(createStudentSchema.safeParse(body).success).toBe(false);
    });

    it('отклоняет учётную запись с лишним полем', () => {
        const body = withOverrides({
            account: { email: 'a@example.com', password: 'Whatever-123', role: 'admin' },
        });

        expect(createStudentSchema.safeParse(body).success).toBe(false);
    });

    it('отклоняет одновременные userId и account и называет поле account', () => {
        const body = withOverrides({
            userId: randomUUID(),
            account: { email: 'a@example.com', password: 'Whatever-123' },
        });

        const result = createStudentSchema.safeParse(body);

        expect(result.success).toBe(false);
        expect(JSON.stringify(result.error?.issues)).toContain('account');
    });
    it('принимает группы от 1 до 12 и null', () => {
        for (const groupName of ['МД-1', 'ЭК-12', 'ЁЖ-7', null]) {
            expect(createStudentSchema.safeParse(withOverrides({ groupName })).success).toBe(true);
        }
    });
});

describe('replaceStudentSchema', () => {
    it('принимает минимальные данные', () => {
        expect(replaceStudentSchema.safeParse(VALID).success).toBe(true);
    });

    it('отклоняет userId: связь с учётной записью не меняется', () => {
        expect(replaceStudentSchema.safeParse(withOverrides({ userId: randomUUID() })).success).toBe(
            false
        );
    });

    it('отклоняет account', () => {
        const body = withOverrides({ account: { email: 'a@example.com', password: 'Whatever-123' } });

        expect(replaceStudentSchema.safeParse(body).success).toBe(false);
    });
});

describe('patchStudentSchema', () => {
    it('принимает одно поле', () => {
        expect(patchStudentSchema.safeParse({ displayName: 'Новое Имя' }).success).toBe(true);
    });

    it('принимает null для необязательного поля', () => {
        expect(patchStudentSchema.safeParse({ lastName: null }).success).toBe(true);
    });

    it('отклоняет пустой объект', () => {
        expect(patchStudentSchema.safeParse({}).success).toBe(false);
    });

    it('отклоняет неизвестное поле', () => {
        expect(patchStudentSchema.safeParse({ foo: 1 }).success).toBe(false);
    });

    it('отклоняет userId', () => {
        expect(patchStudentSchema.safeParse({ userId: randomUUID() }).success).toBe(false);
    });

    it('отклоняет некорректное значение поля', () => {
        expect(patchStudentSchema.safeParse({ studentNumber: '123' }).success).toBe(false);
    });
});

describe('listStudentsQuerySchema', () => {
    it('без параметров: limit 50, offset 0', () => {
        expect(listStudentsQuerySchema.parse({})).toEqual({ limit: 50, offset: 0 });
    });

    it('строковые значения приводятся к числам', () => {
        expect(listStudentsQuerySchema.parse({ limit: '10', offset: '20', q: ' Иванов ' })).toEqual({
            limit: 10,
            offset: 20,
            q: 'Иванов',
        });
    });

    it.each<[string, Record<string, unknown>]>([
        ['limit 0', { limit: '0' }],
        ['limit 201', { limit: '201' }],
        ['отрицательный offset', { offset: '-1' }],
        ['limit не число', { limit: 'abc' }],
        ['пустой q', { q: '' }],
        ['неизвестный параметр', { foo: '1' }],
    ])('отклоняет: %s', (_name, query) => {
        expect(listStudentsQuerySchema.safeParse(query).success).toBe(false);
    });
});

describe('mergeStudentValues', () => {
    const CURRENT: StudentValues = {
        studentNumber: '2326001',
        displayName: 'Тестов Тест',
        lastName: 'Тестов',
        firstName: 'Тест',
        middleName: null,
        birthDate: '2005-01-01',
        phone: '+7 900 000-00-00',
        faculty: null,
        groupName: 'ТС-10',
        educationLevel: null,
        fieldOfStudy: null,
        programCode: null,
        specialization: null,
        studyYear: 2,
        fundingType: 'budget',
    };

    it('меняет только указанные поля', () => {
        expect(mergeStudentValues(CURRENT, { groupName: 'ТС-11' })).toEqual({
            ...CURRENT,
            groupName: 'ТС-11',
        });
    });

    it('null очищает необязательное поле', () => {
        expect(mergeStudentValues(CURRENT, { phone: null, studyYear: null })).toEqual({
            ...CURRENT,
            phone: null,
            studyYear: null,
        });
    });

    it('отсутствующие поля сохраняют текущие значения', () => {
        expect(mergeStudentValues(CURRENT, { displayName: 'Другое Имя' }).fundingType).toBe('budget');
    });
});