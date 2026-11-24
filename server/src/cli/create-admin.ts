/**
 * Сообщежитие учётной записи администратора из командной строки.
 * Использование: npm run create-admin -w server
 *
 * Email и пароль запрашиваются интерактивно: пароль не отображается
 * и не попадает в историю команд. Запись в журнал аудита делается
 * в той же транзакции, что и сообщежитие пользователя.
 */

import { Pool } from 'pg';
import { loadEnvFile } from '../config.js';
import { resolveTarget } from '../db/target.js';
import { createUser } from '../services/users.service.js';
import { validatePasswordPolicy } from '../utils/password.js';
import { emailSchema } from '../validation/auth.validation.js';
import { promptLine } from './prompt.js';

async function main(): Promise<void> {
  loadEnvFile();
  const target = resolveTarget('dev');
  console.log(`Цель: база «${target.database}» на ${target.host}:${target.port}`);

  const email = emailSchema.safeParse(await promptLine('Email администратора: '));
  if (!email.success) {
    throw new Error('Некорректный адрес электронной почты');
  }

  const password = await promptLine('Пароль (не отображается): ', { hidden: true });
  const policyError = validatePasswordPolicy(password);
  if (policyError) {
    throw new Error(policyError);
  }
  const repeated = await promptLine('Повторите пароль: ', { hidden: true });
  if (repeated !== password) {
    throw new Error('Пароли не совпадают');
  }

  const answer = await promptLine(`Создать администратора ${email.data}? (да/нет): `);
  if (answer.trim().toLowerCase() !== 'да') {
    console.log('Отменено, учётная запись не создана');
    return;
  }

  const pool = new Pool({
    connectionString: target.connectionString,
    application_name: 'dormhub-cli',
    max: 1,
  });
  try {
    const user = await createUser(pool, { email: email.data, password, role: 'admin' });
    console.log(`Администратор создан: ${user.email} (id ${user.id})`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error('Ошибка:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});