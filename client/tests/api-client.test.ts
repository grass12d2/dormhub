import { describe, expect, it } from 'vitest';
import { ApiError, buildQuery, createApiClient, type TokenStore } from '../src/api/client';

/** Хранилище токена в памяти вместо sessionStorage */
function memoryStore(initial: string | null = null): TokenStore & { value: string | null } {
  const store = {
    value: initial,
    get: () => store.value,
    set: (token: string) => {
      store.value = token;
    },
    clear: () => {
      store.value = null;
    },
  };
  return store;
}

interface Call {
  url: string;
  init: RequestInit;
}

/** Поддельный fetch: возвращает заданный ответ и запоминает вызовы */
function fakeFetch(status: number, body: unknown, calls: Call[] = []) {
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return impl;
}

describe('buildQuery', () => {
  it('пропускает пустые значения', () => {
    expect(buildQuery({ a: 1, b: undefined, c: null, d: '', e: false })).toBe('?a=1&e=false');
  });

  it('пустой набор даёт пустую строку, значения кодируются', () => {
    expect(buildQuery({})).toBe('');
    expect(buildQuery({ q: 'Иван Иванов' })).toBe('?q=%D0%98%D0%B2%D0%B0%D0%BD+%D0%98%D0%B2%D0%B0%D0%BD%D0%BE%D0%B2');
  });
});

describe('createApiClient', () => {
  it('отправляет токен и возвращает data и meta', async () => {
    const calls: Call[] = [];
    const client = createApiClient({
      store: memoryStore('abc'),
      fetchImpl: fakeFetch(200, { status: 'success', data: [1], meta: { total: 1, limit: 50, offset: 0 } }, calls),
    });

    const result = await client.get<number[]>('/buildings');

    expect(result).toEqual({ data: [1], meta: { total: 1, limit: 50, offset: 0 } });
    expect(calls[0].url).toBe('/api/buildings');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer abc');
  });

  it('без токена заголовок Authorization не отправляется', async () => {
    const calls: Call[] = [];
    const client = createApiClient({
      store: memoryStore(),
      fetchImpl: fakeFetch(200, { status: 'success', data: null }, calls),
    });

    await client.get('/health');

    expect((calls[0].init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('тело отправляется как JSON с нужным заголовком', async () => {
    const calls: Call[] = [];
    const client = createApiClient({
      store: memoryStore(),
      fetchImpl: fakeFetch(201, { status: 'success', data: { id: '1' } }, calls),
    });

    await client.post('/rooms', { roomNumber: '201' });

    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.body).toBe('{"roomNumber":"201"}');
    expect((calls[0].init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('ошибка сервера становится ApiError с его сообщением и кодом', async () => {
    const client = createApiClient({
      store: memoryStore(),
      fetchImpl: fakeFetch(409, { status: 'error', message: 'Здание с таким номером уже существует' }),
    });

    const error = await client.post('/buildings', {}).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(409);
    expect((error as ApiError).message).toBe('Здание с таким номером уже существует');
  });

  it('ответ не в формате JSON даёт общее сообщение', async () => {
    const client = createApiClient({
      store: memoryStore(),
      fetchImpl: fakeFetch(502, '<html>Bad gateway</html>'),
    });

    const error = await client.get('/x').catch((e: unknown) => e);

    expect((error as ApiError).message).toBe('Не удалось выполнить запрос');
    expect((error as ApiError).status).toBe(502);
  });

  it('сетевой сбой даёт ApiError со статусом 0', async () => {
    const client = createApiClient({
      store: memoryStore(),
      fetchImpl: (async () => {
        throw new TypeError('fetch failed');
      }) as unknown as typeof fetch,
    });

    const error = await client.get('/x').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(0);
    expect((error as ApiError).message).toBe('Нет связи с сервером');
  });

  it('401 при отправленном токене очищает токен и сообщает о конце сессии', async () => {
    const store = memoryStore('expired');
    let notified = 0;
    const client = createApiClient({
      store,
      onUnauthorized: () => {
        notified += 1;
      },
      fetchImpl: fakeFetch(401, { status: 'error', message: 'Сессия истекла' }),
    });

    await client.get('/auth/me').catch(() => undefined);

    expect(store.value).toBeNull();
    expect(notified).toBe(1);
  });

  it('401 без токена (неверный пароль при входе) сессию не сбрасывает', async () => {
    let notified = 0;
    const client = createApiClient({
      store: memoryStore(),
      onUnauthorized: () => {
        notified += 1;
      },
      fetchImpl: fakeFetch(401, { status: 'error', message: 'Неверный email или пароль' }),
    });

    const error = await client.post('/auth/login', {}).catch((e: unknown) => e);

    expect((error as ApiError).message).toBe('Неверный email или пароль');
    expect(notified).toBe(0);
  });
});