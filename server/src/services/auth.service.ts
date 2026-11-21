/**
 * Сервис аутентификации: вход, выпуск и проверка токенов.
 *
 * Токен хранит только идентификатор пользователя и роль. При каждом запросе
 * пользователь проверяется по базе данных: удалённый, отключённый или
 * сменивший роль пользователь теряет доступ сразу, а не по истечении токена.
 */

import { randomUUID } from 'node:crypto';
import { MIN_JWT_SECRET_LENGTH } from '../config.js';
import { UserQueries } from '../db/queries/users.js';
import type { Queryable } from '../db/queryable.js';
import type { AuthenticatedUser } from '../types/auth.js';
import { TooManyRequestsError, UnauthorizedError } from '../utils/errors.js';
import { DEFAULT_BCRYPT_ROUNDS, hashPassword, verifyPassword } from '../utils/password.js';
import { FailureLimiter } from '../utils/rate-limit.js';
import { signAccessToken, verifyAccessToken } from '../utils/token.js';

/**
 * Лимиты неудачных попыток входа в окне LOGIN_FAILURE_WINDOW_MS.
 *  - Пара «IP + email»: ошибки одного человека блокируют только его самого,
 *    остальные пользователи той же сети (NAT общежития) не затрагиваются.
 *  - Email: защита от подбора пароля с множества разных адресов.
 *  - IP: грубая защита от потока запросов с одного адреса.
 */
export const LOGIN_PAIR_FAILURE_LIMIT = 5;
export const LOGIN_EMAIL_FAILURE_LIMIT = 25;
export const LOGIN_IP_FAILURE_LIMIT = 100;
export const LOGIN_FAILURE_WINDOW_MS = 15 * 60 * 1000;

export const DEFAULT_TOKEN_TTL_SECONDS = 3600;

/** Одно и то же сообщение для любой причины неудачного входа */
export const INVALID_CREDENTIALS_MESSAGE = 'Неверный email или пароль';
const TOO_MANY_ATTEMPTS_MESSAGE = 'Слишком много неудачных попыток входа. Повторите попытку позже.';

export interface AuthServiceOptions {
  jwtSecret: string;
  tokenTtlSeconds?: number;
  bcryptRounds?: number;
  /** Источник времени для ограничителей (подменяется в тестах) */
  now?: () => number;
}

export interface LoginResult {
  token: string;
  expiresIn: number;
  user: AuthenticatedUser;
}

export class AuthService {
  private readonly users: UserQueries;
  private readonly jwtSecret: string;
  private readonly tokenTtlSeconds: number;
  private readonly bcryptRounds: number;
  private readonly pairLimiter: FailureLimiter;
  private readonly emailLimiter: FailureLimiter;
  private readonly ipLimiter: FailureLimiter;
  private dummyHash: Promise<string> | undefined;

  constructor(db: Queryable, options: AuthServiceOptions) {
    if (options.jwtSecret.length < MIN_JWT_SECRET_LENGTH) {
      throw new Error(`Секрет JWT должен содержать не менее ${MIN_JWT_SECRET_LENGTH} символов`);
    }
    this.users = new UserQueries(db);
    this.jwtSecret = options.jwtSecret;
    this.tokenTtlSeconds = options.tokenTtlSeconds ?? DEFAULT_TOKEN_TTL_SECONDS;
    this.bcryptRounds = options.bcryptRounds ?? DEFAULT_BCRYPT_ROUNDS;

    const now = options.now ?? Date.now;
    this.pairLimiter = new FailureLimiter(LOGIN_PAIR_FAILURE_LIMIT, LOGIN_FAILURE_WINDOW_MS, now);
    this.emailLimiter = new FailureLimiter(LOGIN_EMAIL_FAILURE_LIMIT, LOGIN_FAILURE_WINDOW_MS, now);
    this.ipLimiter = new FailureLimiter(LOGIN_IP_FAILURE_LIMIT, LOGIN_FAILURE_WINDOW_MS, now);
  }

  /**
   * Вход по email и паролю. Email должен быть уже приведён к нижнему регистру.
   */
  async login(email: string, password: string, ip: string): Promise<LoginResult> {
    // В IP символ «|» не встречается, поэтому ключ пары однозначен
    const pairKey = `${ip}|${email}`;

    // Проверка лимитов идёт до обращения к базе: ответ не зависит от существования email
    if (
      this.pairLimiter.isBlocked(pairKey) ||
      this.emailLimiter.isBlocked(email) ||
      this.ipLimiter.isBlocked(ip)
    ) {
      throw new TooManyRequestsError(TOO_MANY_ATTEMPTS_MESSAGE);
    }

    const user = await this.users.findByEmail(email);

    // Пароль проверяется всегда, даже если пользователя нет: по времени ответа
    // нельзя определить, зарегистрирован ли email
    const hash = user ? user.password_hash : await this.getDummyHash();
    const passwordMatches = await verifyPassword(password, hash);

    if (!user || !user.is_active || !passwordMatches) {
      this.pairLimiter.recordFailure(pairKey);
      this.emailLimiter.recordFailure(email);
      this.ipLimiter.recordFailure(ip);
      throw new UnauthorizedError(INVALID_CREDENTIALS_MESSAGE);
    }

    await this.users.touchLastLogin(user.id);
    // Сбрасывается только счётчик пары «IP + email»: общие счётчики email и IP
    // очищаются лишь по истечении окна, чтобы успешный вход не обнулял
    // защиту от подбора с других адресов
    this.pairLimiter.reset(pairKey);

    return {
      token: signAccessToken(
        { userId: user.id, role: user.role },
        this.jwtSecret,
        this.tokenTtlSeconds
      ),
      expiresIn: this.tokenTtlSeconds,
      user: { id: user.id, email: user.email, role: user.role },
    };
  }

  /**
   * Проверить токен и актуальное состояние пользователя в базе данных.
   */
  async authenticate(token: string): Promise<AuthenticatedUser> {
    const payload = verifyAccessToken(token, this.jwtSecret);
    const user = await this.users.findById(payload.userId);

    if (!user || !user.is_active || user.role !== payload.role) {
      throw new UnauthorizedError('Недействительный токен');
    }
    return { id: user.id, email: user.email, role: user.role };
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= hashPassword(randomUUID(), this.bcryptRounds);
    return this.dummyHash;
  }
}