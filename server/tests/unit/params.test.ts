import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { BadRequestError } from '../../src/utils/errors.js';
import { parseUuidParam } from '../../src/utils/params.js';

describe('parseUuidParam', () => {
  it('возвращает корректный UUID без изменений', () => {
    const id = randomUUID();
    expect(parseUuidParam(id)).toBe(id);
  });

  it('приводит UUID к нижнему регистру', () => {
    const id = randomUUID();
    expect(parseUuidParam(id.toUpperCase())).toBe(id);
  });

  it.each<[string, unknown]>([
    ['обычная строка', 'abc'],
    ['пустая строка', ''],
    ['число', 42],
    ['значение undefined', undefined],
    ['массив', ['x']],
    ['UUID с лишним символом', `${randomUUID()}x`],
  ])('отклоняет: %s', (_name, value) => {
    const call = () => parseUuidParam(value);
    expect(call).toThrow(BadRequestError);
    expect(call).toThrow('Некорректный идентификатор');
  });
});