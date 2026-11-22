/**
 * Клиент API. Ответы сервера имеют вид { status: 'success', data, meta? }
 * или { status: 'error', message }. Ошибки превращаются в ApiError с русским сообщением.
 */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface PageMeta {
  total: number;
  limit: number;
  offset: number;
}

export interface ApiResponse<T> {
  data: T;
  meta?: PageMeta;
}

export interface TokenStore {
  get(): string | null;
  set(token: string): void;
  clear(): void;
}

const TOKEN_KEY = 'dormhub.token';

/** Токен живёт в sessionStorage: пропадает при закрытии вкладки */
export const sessionTokenStore: TokenStore = {
  get() {
    try {
      return sessionStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token) {
    try {
      sessionStorage.setItem(TOKEN_KEY, token);
    } catch {
      // Хранилище недоступно: вход действует до перезагрузки страницы
    }
  },
  clear() {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      // Нечего очищать
    }
  },
};

export interface ApiClientOptions {
  baseUrl?: string;
  store?: TokenStore;
  fetchImpl?: typeof fetch;
  /** Вызывается, когда сервер отклонил токен (401): сессия истекла */
  onUnauthorized?: () => void;
}

export type QueryValue = string | number | boolean | undefined | null;

/** Строка запроса без пустых значений: { a: 1, b: undefined } → «?a=1» */
export function buildQuery(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

interface Envelope {
  status?: string;
  data?: unknown;
  meta?: PageMeta;
  message?: string;
}

export function createApiClient(options: ApiClientOptions = {}) {
  const baseUrl = options.baseUrl ?? '/api';
  const store = options.store ?? sessionTokenStore;
  const fetchImpl = options.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));

  async function request<T>(method: string, path: string, body?: unknown): Promise<ApiResponse<T>> {
    const token = store.get();
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError(0, 'Нет связи с сервером');
    }

    let envelope: Envelope = {};
    try {
      envelope = (await response.json()) as Envelope;
    } catch {
      // Тело не JSON: сообщение будет общим
    }

    if (!response.ok || envelope.status === 'error') {
      // Токен был отправлен и отклонён: сессия истекла. Ошибка входа (без токена) сюда не попадает
      if (response.status === 401 && token) {
        store.clear();
        options.onUnauthorized?.();
      }
      throw new ApiError(response.status, envelope.message ?? 'Не удалось выполнить запрос');
    }
    return { data: envelope.data as T, meta: envelope.meta };
  }

  return {
    request,
    get: <T>(path: string) => request<T>('GET', path),
    post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
    put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
    patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
    delete: <T>(path: string) => request<T>('DELETE', path),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;