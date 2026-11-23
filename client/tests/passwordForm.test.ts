import { describe, expect, it } from 'vitest';
import { EMPTY_PASSWORD_FORM, validatePasswordForm } from '../src/lib/passwordForm';

const valid = { current: 'old-password-1', next: 'new-password-12', repeat: 'new-password-12' };

describe('validatePasswordForm', () => {
  it('корректная форма без ошибок, пустая даёт три ошибки', () => {
    expect(validatePasswordForm(valid)).toEqual({});
    expect(Object.keys(validatePasswordForm(EMPTY_PASSWORD_FORM)).sort()).toEqual(['current', 'next']);
  });

  it('короткий, совпадающий со старым и слишком длинный пароли отклоняются', () => {
    expect(validatePasswordForm({ ...valid, next: 'short', repeat: 'short' })).toHaveProperty('next');
    expect(validatePasswordForm({ ...valid, next: valid.current, repeat: valid.current })).toHaveProperty('next');
    const long = 'я'.repeat(40);
    expect(validatePasswordForm({ ...valid, next: long, repeat: long })).toHaveProperty('next');
  });

  it('несовпадающее повторение отклоняется', () => {
    expect(validatePasswordForm({ ...valid, repeat: 'other-password-1' })).toHaveProperty('repeat');
  });
});