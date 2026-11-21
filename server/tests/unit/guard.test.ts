import { describe, expect, it } from 'vitest';
import { resolveTarget } from '../../src/db/target.js';
import { assertConnectedToTestDatabase, assertNoConnectionOverrides } from '../setup/guard.js';

const PASSWORD = 'pa55word';

function urlFor(host: string, database: string): string {
  return `postgresql://user:${PASSWORD}@${host}:5432/${database}`;
}

describe('resolveTarget для тестовой базы', () => {
  it('принимает локальную базу dormhub_test', () => {
    const target = resolveTarget('test', { DATABASE_URL_TEST: urlFor('127.0.0.1', 'dormhub_test') });
    expect(target.database).toBe('dormhub_test');
    expect(target.host).toBe('127.0.0.1');
  });

  const rejected: Array<[string, NodeJS.ProcessEnv]> = [
    ['переменная не задана', {}],
    ['удалённый сервер', { DATABASE_URL_TEST: urlFor('db.example.com', 'dormhub_test') }],
    ['рабочая база вместо тестовой', { DATABASE_URL_TEST: urlFor('127.0.0.1', 'dormhub') }],
    [
      'параметры после «?»',
      { DATABASE_URL_TEST: `${urlFor('127.0.0.1', 'dormhub_test')}?host=db.example.com` },
    ],
    ['некорректный URL', { DATABASE_URL_TEST: `не-url-${PASSWORD}` }],
    [
      'чужой протокол',
      { DATABASE_URL_TEST: `mysql://user:${PASSWORD}@127.0.0.1:5432/dormhub_test` },
    ],
  ];

  it.each(rejected)('отклоняет: %s', (_name, env) => {
    expect(() => resolveTarget('test', env)).toThrow();
  });

  it('сообщения об ошибках не содержат пароль', () => {
    const messages = rejected.map(([, env]) => {
      try {
        resolveTarget('test', env);
        return '';
      } catch (error) {
        return (error as Error).message;
      }
    });

    for (const message of messages) {
      expect(message).not.toBe('');
      expect(message).not.toContain(PASSWORD);
    }
  });

  it('рабочая база не может указывать на dormhub_test', () => {
    expect(() =>
      resolveTarget('dev', { DATABASE_URL: urlFor('127.0.0.1', 'dormhub_test') })
    ).toThrow();
  });
});

describe('assertNoConnectionOverrides', () => {
  it('пропускает чистое окружение', () => {
    expect(() => assertNoConnectionOverrides({ DATABASE_URL_TEST: 'x' })).not.toThrow();
  });

  it.each([
    'PGHOST',
    'PGHOSTADDR',
    'PGPORT',
    'PGDATABASE',
    'PGSERVICE',
    'PGSERVICEFILE',
    'PGOPTIONS',
  ])('отклоняет переменную %s', (name) => {
    expect(() => assertNoConnectionOverrides({ [name]: 'value' })).toThrow();
  });
});

describe('assertConnectedToTestDatabase', () => {
  it('принимает dormhub_test', () => {
    expect(() => assertConnectedToTestDatabase('dormhub_test')).not.toThrow();
  });

  it.each(['dormhub', ''])('отклоняет базу «%s»', (name) => {
    expect(() => assertConnectedToTestDatabase(name)).toThrow();
  });
});