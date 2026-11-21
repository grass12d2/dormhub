import { describe, expect, it } from 'vitest';
import { mergeBuildingValues, mergeStaffValues } from '../../src/services/buildings.service.js';
import type { BuildingValues, StaffValues } from '../../src/types/buildings.js';
import { BadRequestError } from '../../src/utils/errors.js';
import {
  createBuildingSchema,
  createStaffSchema,
  patchBuildingSchema,
  patchStaffSchema,
} from '../../src/validation/buildings.validation.js';
import { parseWithSchema } from '../../src/validation/parse.js';

const VALID_BUILDING = {
  buildingNumber: 1,
  address: 'ул. Руднева, д. 6',
  metroStation: 'Озерки',
  buildingType: 'corridor',
  floorsCount: 16,
  monthlyRate: 700,
};

function withOverrides(overrides: Record<string, unknown>): Record<string, unknown> {
  return { ...VALID_BUILDING, ...overrides };
}

function without(key: string): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...VALID_BUILDING };
  delete copy[key];
  return copy;
}

const INVALID_BUILDINGS: Array<[string, Record<string, unknown>]> = [
  ['номер здания 0', withOverrides({ buildingNumber: 0 })],
  ['номер здания не целый', withOverrides({ buildingNumber: 1.5 })],
  ['номер здания больше предела smallint', withOverrides({ buildingNumber: 32768 })],
  ['ноль этажей', withOverrides({ floorsCount: 0 })],
  ['101 этаж', withOverrides({ floorsCount: 101 })],
  ['неизвестный тип здания', withOverrides({ buildingType: 'tower' })],
  ['адрес из одних пробелов', withOverrides({ address: '   ' })],
  ['отрицательная плата', withOverrides({ monthlyRate: -1 })],
  ['плата с тремя знаками после запятой', withOverrides({ monthlyRate: 700.123 })],
  ['плата строкой', withOverrides({ monthlyRate: '700' })],
  ['лишнее поле', withOverrides({ extra: 1 })],
  ['станция метро из одних пробелов', withOverrides({ metroStation: '  ' })],
];

describe('createBuildingSchema', () => {
  it('принимает корректные данные', () => {
    expect(createBuildingSchema.safeParse(VALID_BUILDING).success).toBe(true);
  });

  it('станцию метро можно опустить или передать null', () => {
    expect(createBuildingSchema.safeParse(without('metroStation')).success).toBe(true);
    expect(createBuildingSchema.safeParse(withOverrides({ metroStation: null })).success).toBe(
      true
    );
  });

  it('обрезает пробелы по краям адреса и станции', () => {
    const result = createBuildingSchema.safeParse(
      withOverrides({ address: '  ул. Руднева  ', metroStation: ' Озерки ' })
    );

    expect(result.success).toBe(true);
    expect(result.data?.address).toBe('ул. Руднева');
    expect(result.data?.metroStation).toBe('Озерки');
  });

  it.each(INVALID_BUILDINGS)('отклоняет: %s', (_name, body) => {
    expect(createBuildingSchema.safeParse(body).success).toBe(false);
  });

  it.each(['buildingNumber', 'address', 'buildingType', 'floorsCount', 'monthlyRate'])(
    'отклоняет данные без поля %s',
    (key) => {
      expect(createBuildingSchema.safeParse(without(key)).success).toBe(false);
    }
  );

  it('принимает плату с одним и двумя знаками после запятой, а также нулевую', () => {
    for (const monthlyRate of [700.1, 700.15, 0]) {
      expect(createBuildingSchema.safeParse(withOverrides({ monthlyRate })).success).toBe(true);
    }
  });
});

describe('patchBuildingSchema', () => {
  it('принимает одно поле', () => {
    expect(patchBuildingSchema.safeParse({ address: 'Новый адрес' }).success).toBe(true);
  });

  it('принимает metroStation со значением null', () => {
    expect(patchBuildingSchema.safeParse({ metroStation: null }).success).toBe(true);
  });

  it('отклоняет пустой объект', () => {
    expect(patchBuildingSchema.safeParse({}).success).toBe(false);
  });

  it('отклоняет неизвестное поле', () => {
    expect(patchBuildingSchema.safeParse({ foo: 1 }).success).toBe(false);
  });

  it('отклоняет некорректное значение поля', () => {
    expect(patchBuildingSchema.safeParse({ floorsCount: 0 }).success).toBe(false);
  });
});

describe('схемы сотрудников', () => {
  const VALID_STAFF = { jobTitle: 'Комендант', fullName: 'Иванов Иван Иванович' };

  it('создание принимает данные без телефона', () => {
    expect(createStaffSchema.safeParse(VALID_STAFF).success).toBe(true);
  });

  it('создание принимает телефон null', () => {
    expect(createStaffSchema.safeParse({ ...VALID_STAFF, phone: null }).success).toBe(true);
  });

  it('создание обрезает пробелы по краям', () => {
    const result = createStaffSchema.safeParse({
      jobTitle: '  Комендант  ',
      fullName: ' Иванов Иван ',
    });

    expect(result.data?.jobTitle).toBe('Комендант');
    expect(result.data?.fullName).toBe('Иванов Иван');
  });

  it.each<[string, Record<string, unknown>]>([
    ['должность из одних пробелов', { ...VALID_STAFF, jobTitle: '   ' }],
    ['пустое ФИО', { ...VALID_STAFF, fullName: '' }],
    ['должность не строка', { ...VALID_STAFF, jobTitle: 5 }],
    ['лишнее поле', { ...VALID_STAFF, extra: true }],
    ['телефон из одних пробелов', { ...VALID_STAFF, phone: '  ' }],
  ])('создание отклоняет: %s', (_name, body) => {
    expect(createStaffSchema.safeParse(body).success).toBe(false);
  });

  it('PATCH принимает одно поле', () => {
    expect(patchStaffSchema.safeParse({ phone: '+7 900 000-00-00' }).success).toBe(true);
  });

  it('PATCH отклоняет пустой объект', () => {
    expect(patchStaffSchema.safeParse({}).success).toBe(false);
  });

  it('PATCH отклоняет неизвестное поле', () => {
    expect(patchStaffSchema.safeParse({ foo: 1 }).success).toBe(false);
  });
});

describe('mergeBuildingValues', () => {
  const CURRENT: BuildingValues = {
    buildingNumber: 3,
    address: 'Старый адрес',
    metroStation: 'Ладожская',
    buildingType: 'block',
    floorsCount: 16,
    monthlyRate: 900,
  };

  it('меняет только указанные поля', () => {
    expect(mergeBuildingValues(CURRENT, { address: 'Новый адрес' })).toEqual({
      ...CURRENT,
      address: 'Новый адрес',
    });
  });

  it('null в metroStation очищает станцию', () => {
    expect(mergeBuildingValues(CURRENT, { metroStation: null })).toEqual({
      ...CURRENT,
      metroStation: null,
    });
  });

  it('отсутствующий metroStation сохраняет текущую станцию', () => {
    expect(mergeBuildingValues(CURRENT, { floorsCount: 12 }).metroStation).toBe('Ладожская');
  });

  it('заменяет все переданные поля', () => {
    const patch = {
      buildingNumber: 4,
      address: 'Другой адрес',
      metroStation: 'Звездная',
      buildingType: 'apartment' as const,
      floorsCount: 12,
      monthlyRate: 1200,
    };

    expect(mergeBuildingValues(CURRENT, patch)).toEqual(patch);
  });
});

describe('mergeStaffValues', () => {
  const CURRENT: StaffValues = {
    jobTitle: 'Комендант',
    fullName: 'Иванов Иван',
    phone: '+7 900 000-00-00',
  };

  it('null в phone очищает телефон', () => {
    expect(mergeStaffValues(CURRENT, { phone: null })).toEqual({ ...CURRENT, phone: null });
  });

  it('отсутствующие поля сохраняют текущие значения', () => {
    expect(mergeStaffValues(CURRENT, { fullName: 'Петров Пётр' })).toEqual({
      ...CURRENT,
      fullName: 'Петров Пётр',
    });
  });
});

describe('parseWithSchema', () => {
  it('возвращает разобранные данные', () => {
    expect(parseWithSchema(createBuildingSchema, VALID_BUILDING).buildingNumber).toBe(1);
  });

  it('при ошибке выбрасывает BadRequestError', () => {
    const call = () => parseWithSchema(createBuildingSchema, withOverrides({ floorsCount: 0 }));

    expect(call).toThrow(BadRequestError);
  });

  it('сообщение на русском перечисляет поля и не содержит текста валидатора', () => {
    let message = '';
    try {
      parseWithSchema(createBuildingSchema, withOverrides({ floorsCount: 0, address: '' }));
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toMatch(/^Некорректные данные запроса: /);
    expect(message).toContain('floorsCount');
    expect(message).toContain('address');
    expect(message).not.toMatch(/Invalid|expected|Too small/i);
  });

  it('лишние поля перечисляются по имени', () => {
    let message = '';
    try {
      parseWithSchema(createBuildingSchema, withOverrides({ role: 'admin' }));
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain('role');
  });

  it('отсутствующее тело обозначается как «тело запроса»', () => {
    let message = '';
    try {
      parseWithSchema(createBuildingSchema, undefined);
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain('тело запроса');
  });
});