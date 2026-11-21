import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { UnauthorizedError } from '../../src/utils/errors.js';
import { signAccessToken, TOKEN_ISSUER, verifyAccessToken } from '../../src/utils/token.js';

const SECRET = 'unit-test-secret-of-sufficient-length-1234';
const USER_ID = randomUUID();

function expectRejected(token: string, message: string | RegExp = 'Недействительный токен'): void {
  const call = () => verifyAccessToken(token, SECRET);
  expect(call).toThrow(UnauthorizedError);
  expect(call).toThrow(message);
}

const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

describe('токены доступа', () => {
  it('выпущенный токен проходит проверку и возвращает пользователя и роль', () => {
    const token = signAccessToken({ userId: USER_ID, role: 'admin' }, SECRET, 60);

    expect(verifyAccessToken(token, SECRET)).toEqual({ userId: USER_ID, role: 'admin' });
  });

  it('токен с чужим секретом отклоняется', () => {
    const token = signAccessToken({ userId: USER_ID, role: 'admin' }, 'x'.repeat(40), 60);

    expectRejected(token);
  });

  it('токен с подделанным содержимым отклоняется', () => {
    const token = signAccessToken({ userId: USER_ID, role: 'student' }, SECRET, 60);
    const [header, payload, signature] = token.split('.');
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as object;
    const forged = encode({ ...claims, role: 'admin' });

    expectRejected(`${header}.${forged}.${signature}`);
  });

  it('просроченный токен отклоняется с отдельным сообщением', () => {
    const token = jwt.sign(
      { role: 'admin', exp: Math.floor(Date.now() / 1000) - 60 },
      SECRET,
      { algorithm: 'HS256', issuer: TOKEN_ISSUER, subject: USER_ID }
    );

    expectRejected(token, /Срок действия/);
  });

  it('токен без подписи (alg: none) отклоняется', () => {
    const claims = {
      sub: USER_ID,
      role: 'admin',
      iss: TOKEN_ISSUER,
      exp: Math.floor(Date.now() / 1000) + 3600,
    };

    expectRejected(`${encode({ alg: 'none', typ: 'JWT' })}.${encode(claims)}.`);
  });

  it('токен с чужим издателем отклоняется', () => {
    const token = jwt.sign({ role: 'admin' }, SECRET, {
      algorithm: 'HS256',
      issuer: 'other-service',
      subject: USER_ID,
      expiresIn: 60,
    });

    expectRejected(token);
  });

  it('токен с недопустимой ролью отклоняется', () => {
    const token = jwt.sign({ role: 'superuser' }, SECRET, {
      algorithm: 'HS256',
      issuer: TOKEN_ISSUER,
      subject: USER_ID,
      expiresIn: 60,
    });

    expectRejected(token);
  });

  it('токен с некорректным идентификатором пользователя отклоняется', () => {
    const token = jwt.sign({ role: 'admin' }, SECRET, {
      algorithm: 'HS256',
      issuer: TOKEN_ISSUER,
      subject: 'not-a-uuid',
      expiresIn: 60,
    });

    expectRejected(token);
  });

  it('произвольная строка отклоняется', () => {
    expectRejected('abc');
  });
});