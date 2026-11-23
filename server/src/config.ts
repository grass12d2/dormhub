/**
 * Настройки сервера из переменных окружения.
 */

import path from 'node:path';
import { resolveTarget } from './db/target.js';

/** Минимальная длина секрета JWT в символах */
export const MIN_JWT_SECRET_LENGTH = 32;

export interface MailConfig {
    host: string;
    port: number;
    from: string;
}

export interface AppConfig {
    port: number;
    databaseUrl: string;
    jwtSecret: string;
    mail: MailConfig;
}

/** Загрузить .env из корня репозитория; переменные оболочки имеют приоритет */
export function loadEnvFile(): void {
    const envPath = path.resolve(import.meta.dirname, '../../.env');
    try {
        process.loadEnvFile(envPath);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw error;
        }
    }
}

/**
 * Прочитать и проверить настройки.
 * Строка подключения проверяется так же, как в командной строке миграций:
 * рабочая база не может указывать на dormhub_test.
 * Значение секрета в сообщения об ошибках не попадает.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
    const target = resolveTarget('dev', env);

    const port = Number(env.PORT ?? '3000');
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('Переменная PORT должна быть целым числом от 1 до 65535');
    }

    const jwtSecret = env.JWT_SECRET;
    if (!jwtSecret) {
        throw new Error('Не задана переменная окружения JWT_SECRET');
    }
    if (jwtSecret.length < MIN_JWT_SECRET_LENGTH) {
        throw new Error(
            `Переменная JWT_SECRET должна содержать не менее ${MIN_JWT_SECRET_LENGTH} символов`
        );
    }

        const mailPort = Number(env.SMTP_PORT ?? '1025');
    if (!Number.isInteger(mailPort) || mailPort < 1 || mailPort > 65535) {
        throw new Error('Переменная SMTP_PORT должна быть целым числом от 1 до 65535');
    }
    const mail: MailConfig = {
        host: env.SMTP_HOST ?? '127.0.0.1',
        port: mailPort,
        from: env.MAIL_FROM ?? 'DormHub <no-reply@dormhub.local>',
    };

    return { port, databaseUrl: target.connectionString, jwtSecret, mail };
}