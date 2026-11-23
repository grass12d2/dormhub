/**
 * Точка входа HTTP-сервера DormHub.
 */

import { Pool } from 'pg';
import { createApp } from './app.js';
import { loadConfig, loadEnvFile } from './config.js';
import { createSmtpMailer } from './services/mailer.js';

/** Максимальное ожидание завершения запросов при остановке, мс */
const SHUTDOWN_TIMEOUT_MS = 10_000;

function main(): void {
    loadEnvFile();
    const config = loadConfig();

    const pool = new Pool({
        connectionString: config.databaseUrl,
        application_name: 'dormhub-api',
        max: 10,
    });
    // Без обработчика ошибка неактивного соединения завершила бы процесс
    pool.on('error', (error) => {
        console.error('[пул] ошибка неактивного соединения:', error.message);
    });

    // Express 5 вызывает этот обратный вызов и при ошибке запуска (с аргументом error),
    // поэтому сообщение об успехе выводится только при отсутствии ошибки
    const server = createApp(pool, { auth: { jwtSecret: config.jwtSecret }, mailer: createSmtpMailer(config.mail) }).listen(config.port, (error?: Error) => {
        if (!error) {
            console.log(`DormHub API слушает порт ${config.port}`);
        }
    });

    server.once('error', (error: NodeJS.ErrnoException) => {
        console.error(
            error.code === 'EADDRINUSE'
                ? `Порт ${config.port} уже занят`
                : `Ошибка сервера: ${error.message}`
        );
        process.exit(1);
    });

    let stopping = false;
    const shutdown = (signal: string): void => {
        if (stopping) {
            return;
        }
        stopping = true;
        console.log(`Получен сигнал ${signal}, завершение работы...`);

        const forced = setTimeout(() => {
            console.error('Принудительное завершение по таймауту');
            process.exit(1);
        }, SHUTDOWN_TIMEOUT_MS);
        forced.unref();

        server.close(() => {
            pool.end().then(
                () => {
                    console.log('Сервер остановлен');
                    process.exit(0);
                },
                (error: unknown) => {
                    console.error('Ошибка закрытия пула:', error instanceof Error ? error.message : error);
                    process.exit(1);
                }
            );
        });
        server.closeIdleConnections();
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
}

try {
    main();
} catch (error) {
    console.error('Ошибка запуска:', error instanceof Error ? error.message : String(error));
    process.exit(1);
}