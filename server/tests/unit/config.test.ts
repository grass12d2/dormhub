import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';

const SECRET = 'a'.repeat(32);
const BASE_ENV = {
  DATABASE_URL: 'postgresql://user:pa55word@127.0.0.1:5432/dormhub',
  JWT_SECRET: SECRET,
};

describe('loadConfig', () => {
  it('возвращает настройки: порт по умолчанию 3000, секрет из 32 символов допустим', () => {
    const config = loadConfig({ ...BASE_ENV });

    expect(config.port).toBe(3000);
    expect(config.jwtSecret).toBe(SECRET);
    expect(config.databaseUrl).toBe(BASE_ENV.DATABASE_URL);
  });

  it('берёт порт из PORT', () => {
    expect(loadConfig({ ...BASE_ENV, PORT: '4000' }).port).toBe(4000);
  });

  it('отклоняет отсутствие JWT_SECRET', () => {
    expect(() => loadConfig({ DATABASE_URL: BASE_ENV.DATABASE_URL })).toThrow('JWT_SECRET');
  });

  it('отклоняет короткий JWT_SECRET и не раскрывает его в сообщении', () => {
    const shortSecret = 'z'.repeat(31);
    let message = '';
    try {
      loadConfig({ ...BASE_ENV, JWT_SECRET: shortSecret });
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain('JWT_SECRET');
    expect(message).not.toContain(shortSecret);
  });

  it.each(['abc', '0', '70000'])('отклоняет некорректный PORT «%s»', (port) => {
    expect(() => loadConfig({ ...BASE_ENV, PORT: port })).toThrow('PORT');
  });

  it('отклоняет рабочую базу, указывающую на dormhub_test', () => {
    expect(() =>
      loadConfig({
        ...BASE_ENV,
        DATABASE_URL: 'postgresql://user:pa55word@127.0.0.1:5432/dormhub_test',
      })
    ).toThrow();
  });
});