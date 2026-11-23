/** TOTP по RFC 6238 (SHA-1, 6 цифр, шаг 30 с) и шифрование секрета */

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;
/** Допуск по времени: один шаг назад и вперёд */
export const TOTP_WINDOW = 1;

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(data: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += BASE32[(value << (5 - bits)) & 31];
  }
  return out;
}

export function base32Decode(text: string): Buffer {
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of text.replace(/=+$/, '').toUpperCase()) {
    const index = BASE32.indexOf(char);
    if (index === -1) {
      throw new Error('Неверный символ base32');
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Новый секрет: 20 случайных байт в base32 */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** Код для заданного шага времени (counter) */
export function totpAt(secretBase32: string, counter: number): string {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', base32Decode(secretBase32)).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 15;
  const binary =
    ((hmac[offset] & 127) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

export function stepOf(timeMs: number): number {
  return Math.floor(timeMs / 1000 / TOTP_STEP_SECONDS);
}

/**
 * Проверка кода с допуском по времени. Возвращает шаг, по которому код совпал,
 * или null. Шаг сохраняется, чтобы тот же код нельзя было использовать повторно.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  timeMs: number,
  lastStep = 0
): number | null {
  if (!/^\d{6}$/.test(code)) {
    return null;
  }
  const current = stepOf(timeMs);
  for (let delta = -TOTP_WINDOW; delta <= TOTP_WINDOW; delta++) {
    const step = current + delta;
    if (step <= lastStep) {
      continue;
    }
    const expected = Buffer.from(totpAt(secretBase32, step));
    if (timingSafeEqual(expected, Buffer.from(code))) {
      return step;
    }
  }
  return null;
}

/** Адрес для приложения-аутентификатора (из него строится QR-код) */
export function otpauthUrl(secretBase32: string, email: string, issuer = 'DormHub'): string {
  const label = encodeURIComponent(`${issuer}:${email}`);
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

function keyFrom(secret: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, 'dormhub-2fa', 'totp-secret-encryption', 32));
}

/** AES-256-GCM: результат «iv.tag.данные» в base64 */
export function encryptSecret(plain: string, appSecret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(appSecret), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((part) => part.toString('base64')).join('.');
}

export function decryptSecret(encrypted: string, appSecret: string): string {
  const [iv, tag, data] = encrypted.split('.').map((part) => Buffer.from(part, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', keyFrom(appSecret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}