import { describe, expect, it } from 'vitest';
import { validateEmail, validatePasswords } from '../src/lib/resetForm';

describe('validateEmail', () => {
  it('принимает адрес и отклоняет мусор', () => {
    expect(validateEmail('a@b.ru')).toBeNull();
    expect(validateEmail('abc')).not.toBeNull();
  });
});

describe('validatePasswords', () => {
  it('корректная пара без ошибок', () => {
    expect(validatePasswords('new-password-12', 'new-password-12')).toEqual({});
  });

  it('короткий пароль и несовпадение отклоняются', () => {
    expect(validatePasswords('short', 'short')).toHaveProperty('next');
    expect(validatePasswords('new-password-12', 'other-password-1')).toHaveProperty('repeat');
  });

  it('слишком длинный в байтах пароль отклоняется', () => {
    const long = 'я'.repeat(40);
    expect(validatePasswords(long, long)).toHaveProperty('next');
  });
});