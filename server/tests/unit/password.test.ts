import { describe, expect, it } from 'vitest';
import {
  hashPassword,
  validatePasswordPolicy,
  verifyPassword,
} from '../../src/utils/password.js';

describe('validatePasswordPolicy', () => {
  it('принимает пароль из 10 символов', () => {
    expect(validatePasswordPolicy('abcdefghij')).toBeNull();
  });

  it('отклоняет пароль из 9 символов сообщением на русском', () => {
    expect(validatePasswordPolicy('abcdefghi')).toMatch(/не менее 10 символов/);
  });

  it('отклоняет пароль длиннее 72 байт (37 кириллических символов)', () => {
    expect(validatePasswordPolicy('я'.repeat(37))).toMatch(/72 байт/);
  });

  it('принимает пароль ровно из 72 байт (36 кириллических символов)', () => {
    expect(validatePasswordPolicy('я'.repeat(36))).toBeNull();
  });
});

describe('хеширование паролей', () => {
  it('хеш подходит к исходному паролю', async () => {
    const hash = await hashPassword('correct-password-1', 4);

    expect(await verifyPassword('correct-password-1', hash)).toBe(true);
  });

  it('хеш не подходит к другому паролю', async () => {
    const hash = await hashPassword('correct-password-1', 4);

    expect(await verifyPassword('wrong-password-1', hash)).toBe(false);
  });

  it('один и тот же пароль даёт разные хеши (соль)', async () => {
    const first = await hashPassword('correct-password-1', 4);
    const second = await hashPassword('correct-password-1', 4);

    expect(first).not.toBe(second);
  });

  it('пароль длиннее 72 байт заведомо неверный', async () => {
    const hash = await hashPassword('я'.repeat(36), 4);

    expect(await verifyPassword('я'.repeat(37), hash)).toBe(false);
  });
});