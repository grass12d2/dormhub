import { createApiClient } from './client';

/** Событие, которое отправляется, когда сервер отклонил токен (сессия истекла) */
export const UNAUTHORIZED_EVENT = 'dormhub:unauthorized';

/** Единый клиент API для всего приложения */
export const api = createApiClient({
  onUnauthorized: () => window.dispatchEvent(new Event(UNAUTHORIZED_EVENT)),
});