import { describe, expect, it } from 'vitest';
import { generateResetCode, hashResetCode, verifyResetCode } from '../../src/utils/reset-code.js';

const SECRET = 'test-secret-with-enough-length-1234567890';

describe('generateResetCode', () => {
  it('всегда шесть цифр', () => {
    for (let i = 0; i < 500; i++) {
      expect(generateResetCode()).toMatch(/^\d{6}$/);
    }
  });
});

describe('hashResetCode и verifyResetCode', () => {
  it('хеш — 64 символа hex и зависит от секрета', () => {
    const hash = hashResetCode('012345', SECRET);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashResetCode('012345', `${SECRET}x`)).not.toBe(hash);
  });

  it('верный код проходит, неверный и неправильного формата нет', () => {
    const hash = hashResetCode('012345', SECRET);
    expect(verifyResetCode('012345', hash, SECRET)).toBe(true);
    expect(verifyResetCode('012346', hash, SECRET)).toBe(false);
    expect(verifyResetCode('12345', hash, SECRET)).toBe(false);
    expect(verifyResetCode('0123456', hash, SECRET)).toBe(false);
    expect(verifyResetCode('abcdef', hash, SECRET)).toBe(false);
  });

  it('код с чужим секретом не проходит', () => {
    const hash = hashResetCode('012345', SECRET);
    expect(verifyResetCode('012345', hash, 'other-secret-with-enough-length-12345')).toBe(false);
  });
});