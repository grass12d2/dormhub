/**
 * Защита тестовой базы данных.
 *
 * Первая часть проверки (локальный сервер, имя dormhub_test, отсутствие
 * параметров в строке подключения) выполняется в resolveTarget.
 * Здесь добавлены две проверки: переменные libpq и фактическое имя базы.
 * Сообщения об ошибках не содержат строк подключения и паролей.
 */

const TEST_DATABASE_NAME = 'dormhub_test';

/** Переменные libpq, которыми можно незаметно подменить сервер или базу */
const OVERRIDING_VARIABLES = [
  'PGHOST',
  'PGHOSTADDR',
  'PGPORT',
  'PGDATABASE',
  'PGSERVICE',
  'PGSERVICEFILE',
  'PGOPTIONS',
];

/** Отклонить запуск, если заданы переменные, способные подменить подключение */
export function assertNoConnectionOverrides(env: NodeJS.ProcessEnv = process.env): void {
  const found = OVERRIDING_VARIABLES.filter((name) => env[name] !== undefined && env[name] !== '');
  if (found.length > 0) {
    throw new Error(
      `Заданы переменные окружения, способные подменить подключение к базе: ${found.join(', ')}. ` +
        'Уберите их перед запуском интеграционных тестов'
    );
  }
}

/** Убедиться, что фактическое подключение выполнено к тестовой базе */
export function assertConnectedToTestDatabase(actualDatabase: string): void {
  if (actualDatabase !== TEST_DATABASE_NAME) {
    throw new Error(
      `Подключение выполнено не к тестовой базе (получено «${actualDatabase}»); сброс схемы отменён`
    );
  }
}