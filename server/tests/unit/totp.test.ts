import { describe, expect, it } from 'vitest';
import {
  base32Decode,
  base32Encode,
  decryptSecret,
  encryptSecret,
  generateTotpSecret,
  otpauthUrl,
  stepOf,
  totpAt,
  verifyTotp,
} from '../../src/utils/totp.js';

const SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('TOTP по RFC 6238', () => {
  it.each([
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
  ])('время %i с даёт код %s', (seconds, code) => {
    expect(totpAt(SECRET, stepOf(seconds * 1000))).toBe(code);
  });
});

describe('verifyTotp', () => {
  const now = 1234567890 * 1000;

  it('принимает текущий код и соседние шаги, отклоняет далёкие и неверные', () => {
    const step = stepOf(now);
    expect(verifyTotp(SECRET, totpAt(SECRET, step), now)).toBe(step);
    expect(verifyTotp(SECRET, totpAt(SECRET, step - 1), now)).toBe(step - 1);
    expect(verifyTotp(SECRET, totpAt(SECRET, step + 1), now)).toBe(step + 1);
    expect(verifyTotp(SECRET, totpAt(SECRET, step + 5), now)).toBeNull();
    expect(verifyTotp(SECRET, '12345', now)).toBeNull();
    expect(verifyTotp(SECRET, 'abcdef', now)).toBeNull();
  });

  it('использованный шаг повторно не принимается', () => {
    const step = stepOf(now);
    const code = totpAt(SECRET, step);
    expect(verifyTotp(SECRET, code, now, step)).toBeNull();
    expect(verifyTotp(SECRET, code, now, step - 1)).toBe(step);
  });
});

describe('base32 и секрет', () => {
  it('кодирование обратимо, секрет — 32 символа', () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Encode(base32Decode(secret))).toBe(secret);
  });

  it('шифрование обратимо, с другим ключом не расшифровывается', () => {
    const encrypted = encryptSecret('JBSWY3DPEHPK3PXP', 'app-secret-long-enough-1234567890');
    expect(encrypted).not.toContain('JBSWY3DPEHPK3PXP');
    expect(decryptSecret(encrypted, 'app-secret-long-enough-1234567890')).toBe('JBSWY3DPEHPK3PXP');
    expect(() => decryptSecret(encrypted, 'other-secret-long-enough-1234567')).toThrow();
  });

  it('otpauth-адрес содержит секрет, издателя и параметры', () => {
    const url = otpauthUrl('ABC234', 'a@b.ru');
    expect(url).toContain('otpauth://totp/DormHub%3Aa%40b.ru');
    expect(url).toContain('secret=ABC234');
    expect(url).toContain('digits=6');
  });
});