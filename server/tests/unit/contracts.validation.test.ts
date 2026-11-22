import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { mergeContractTerms } from '../../src/services/contracts.service.js';
import type { ContractTerms } from '../../src/types/contracts.js';
import {
  createContractSchema,
  listContractsQuerySchema,
  patchContractSchema,
  terminateContractSchema,
} from '../../src/validation/contracts.validation.js';

const STUDENT_ID = randomUUID();
const BED_ID = randomUUID();
const VALID = {
  studentId: STUDENT_ID,
  bedId: BED_ID,
  startDate: '2030-09-01',
  endDate: '2030-12-01',
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
  ['дата окончания равна дате начала', withOverrides({ endDate: '2030-09-01' })],
  ['дата окончания раньше даты начала', withOverrides({ endDate: '2030-08-01' })],
  ['несуществующая дата', withOverrides({ startDate: '2030-02-30' })],
  ['дата в другом формате', withOverrides({ startDate: '01.09.2030' })],
  ['дата раньше 2000 года', withOverrides({ startDate: '1999-12-31' })],
  ['дата позже 2100 года', withOverrides({ endDate: '2101-01-01' })],
  ['отрицательная ставка', withOverrides({ monthlyRate: -1 })],
  ['ставка с тремя знаками после запятой', withOverrides({ monthlyRate: 700.123 })],
  ['ставка строкой', withOverrides({ monthlyRate: '700' })],
  ['идентификатор студента не UUID', withOverrides({ studentId: 'abc' })],
  ['лишнее поле', withOverrides({ status: 'active' })],
];

describe('createContractSchema', () => {
  it('принимает корректные данные без ставки', () => {
    expect(createContractSchema.safeParse(VALID).success).toBe(true);
  });

  it('принимает нулевую ставку и ставку с копейками', () => {
    for (const monthlyRate of [0, 700.5]) {
      expect(createContractSchema.safeParse(withOverrides({ monthlyRate })).success).toBe(true);
    }
  });

  it.each(INVALID)('отклоняет: %s', (_name, body) => {
    expect(createContractSchema.safeParse(body).success).toBe(false);
  });

  it.each(['studentId', 'bedId', 'startDate', 'endDate'])(
    'отклоняет данные без поля %s',
    (key) => {
      expect(createContractSchema.safeParse(without(key)).success).toBe(false);
    }
  );

  it('ошибку дат относит к полю endDate', () => {
    const result = createContractSchema.safeParse(withOverrides({ endDate: '2030-09-01' }));

    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('endDate');
  });

  it('приводит идентификаторы к нижнему регистру', () => {
    const result = createContractSchema.safeParse(
      withOverrides({ studentId: STUDENT_ID.toUpperCase(), bedId: BED_ID.toUpperCase() })
    );

    expect(result.data?.studentId).toBe(STUDENT_ID);
    expect(result.data?.bedId).toBe(BED_ID);
  });
});

describe('patchContractSchema', () => {
  it('принимает одно поле', () => {
    expect(patchContractSchema.safeParse({ monthlyRate: 650 }).success).toBe(true);
  });

  it('отклоняет пустой объект', () => {
    expect(patchContractSchema.safeParse({}).success).toBe(false);
  });

  it.each(['studentId', 'bedId', 'status'])('отклоняет поле %s', (key) => {
    expect(patchContractSchema.safeParse({ [key]: randomUUID() }).success).toBe(false);
  });

  it('отклоняет некорректное значение поля', () => {
    expect(patchContractSchema.safeParse({ startDate: '2030-02-30' }).success).toBe(false);
  });
});

describe('terminateContractSchema', () => {
  it('принимает пустой объект', () => {
    expect(terminateContractSchema.safeParse({}).success).toBe(true);
  });

  it('обрезает пробелы по краям причины', () => {
    expect(terminateContractSchema.safeParse({ reason: '  По желанию  ' }).data?.reason).toBe(
      'По желанию'
    );
  });

  it('отклоняет причину из одних пробелов и лишнее поле', () => {
    expect(terminateContractSchema.safeParse({ reason: '   ' }).success).toBe(false);
    expect(terminateContractSchema.safeParse({ foo: 1 }).success).toBe(false);
  });
});

describe('listContractsQuerySchema', () => {
  it('без параметров: limit 50, offset 0', () => {
    expect(listContractsQuerySchema.parse({})).toEqual({ limit: 50, offset: 0 });
  });

  it('принимает фильтры и приводит строки к числам', () => {
    const parsed = listContractsQuerySchema.parse({
      studentId: STUDENT_ID.toUpperCase(),
      status: 'active',
      limit: '10',
      offset: '5',
    });

    expect(parsed).toEqual({ studentId: STUDENT_ID, status: 'active', limit: 10, offset: 5 });
  });

  it.each<[string, Record<string, unknown>]>([
    ['неизвестный статус', { status: 'bogus' }],
    ['limit 0', { limit: '0' }],
    ['limit 201', { limit: '201' }],
    ['bedId не UUID', { bedId: 'abc' }],
    ['неизвестный параметр', { foo: '1' }],
  ])('отклоняет: %s', (_name, query) => {
    expect(listContractsQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe('mergeContractTerms', () => {
  const CURRENT: ContractTerms = {
    startDate: '2030-09-01',
    endDate: '2030-12-01',
    monthlyRate: 700,
  };

  it('меняет только указанные поля', () => {
    expect(mergeContractTerms(CURRENT, { monthlyRate: 650 })).toEqual({
      ...CURRENT,
      monthlyRate: 650,
    });
  });

  it('заменяет все переданные поля', () => {
    const patch = { startDate: '2030-10-01', endDate: '2031-01-01', monthlyRate: 900 };

    expect(mergeContractTerms(CURRENT, patch)).toEqual(patch);
  });
});