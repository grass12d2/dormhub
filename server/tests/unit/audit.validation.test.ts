import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { BadRequestError } from '../../src/utils/errors.js';
import {
  listAuditLogsQuerySchema,
  parseAuditLogId,
} from '../../src/validation/audit.validation.js';

const ACTOR_ID = randomUUID();
const ENTITY_ID = randomUUID();

describe('listAuditLogsQuerySchema', () => {
  it('без параметров: limit 50, offset 0', () => {
    expect(listAuditLogsQuerySchema.parse({})).toEqual({ limit: 50, offset: 0 });
  });

  it('принимает все фильтры, приводит идентификаторы к нижнему регистру и обрезает пробелы', () => {
    const parsed = listAuditLogsQuerySchema.parse({
      actorUserId: ACTOR_ID.toUpperCase(),
      action: ' create_building ',
      entityType: ' buildings ',
      entityId: ENTITY_ID.toUpperCase(),
      from: '2031-05-10',
      to: '2031-05-11',
      limit: '10',
      offset: '5',
    });

    expect(parsed).toEqual({
      actorUserId: ACTOR_ID,
      action: 'create_building',
      entityType: 'buildings',
      entityId: ENTITY_ID,
      from: '2031-05-10',
      to: '2031-05-11',
      limit: 10,
      offset: 5,
    });
  });

  it('даты from и to могут совпадать', () => {
    expect(
      listAuditLogsQuerySchema.safeParse({ from: '2031-05-10', to: '2031-05-10' }).success
    ).toBe(true);
  });

  it.each<[string, Record<string, unknown>]>([
    ['actorUserId не UUID', { actorUserId: 'abc' }],
    ['entityId не UUID', { entityId: 'abc' }],
    ['пустое действие', { action: '   ' }],
    ['действие длиннее 100 символов', { action: 'x'.repeat(101) }],
    ['несуществующая дата from', { from: '2031-02-30' }],
    ['дата to в другом формате', { to: '10.05.2031' }],
    ['to раньше from', { from: '2031-05-11', to: '2031-05-10' }],
    ['limit 0', { limit: '0' }],
    ['limit 201', { limit: '201' }],
    ['отрицательный offset', { offset: '-1' }],
    ['неизвестный параметр', { foo: '1' }],
  ])('отклоняет: %s', (_name, query) => {
    expect(listAuditLogsQuerySchema.safeParse(query).success).toBe(false);
  });

  it('ошибку периода относит к полю to', () => {
    const result = listAuditLogsQuerySchema.safeParse({ from: '2031-05-11', to: '2031-05-10' });

    expect(JSON.stringify(result.error?.issues)).toContain('"to"');
  });
});

describe('parseAuditLogId', () => {
  it.each(['1', '42', '999999999999999999'])('принимает «%s»', (value) => {
    expect(parseAuditLogId(value)).toBe(value);
  });

  it.each(['0', '-1', 'abc', '', '1.5', '01', '1000000000000000000', ' 1'])(
    'отклоняет «%s»',
    (value) => {
      const call = () => parseAuditLogId(value);

      expect(call).toThrow(BadRequestError);
      expect(call).toThrow('Некорректный идентификатор');
    }
  );

  it('отклоняет значение не строкой', () => {
    expect(() => parseAuditLogId(undefined)).toThrow(BadRequestError);
  });
});