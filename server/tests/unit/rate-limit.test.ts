import { describe, expect, it } from 'vitest';
import { FailureLimiter } from '../../src/utils/rate-limit.js';

/** Управляемые часы */
function createClock(start = 1_000) {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

describe('FailureLimiter', () => {
  it('не блокирует ключ без неудач', () => {
    const limiter = new FailureLimiter(3, 1_000, createClock().now);

    expect(limiter.isBlocked('a')).toBe(false);
  });

  it('блокирует ключ, когда число неудач достигло лимита', () => {
    const limiter = new FailureLimiter(3, 1_000, createClock().now);

    limiter.recordFailure('a');
    limiter.recordFailure('a');
    expect(limiter.isBlocked('a')).toBe(false);

    limiter.recordFailure('a');
    expect(limiter.isBlocked('a')).toBe(true);
  });

  it('ключи независимы', () => {
    const limiter = new FailureLimiter(1, 1_000, createClock().now);

    limiter.recordFailure('a');

    expect(limiter.isBlocked('a')).toBe(true);
    expect(limiter.isBlocked('b')).toBe(false);
  });

  it('по окончании окна блокировка снимается', () => {
    const clock = createClock();
    const limiter = new FailureLimiter(2, 1_000, clock.now);
    limiter.recordFailure('a');
    limiter.recordFailure('a');
    expect(limiter.isBlocked('a')).toBe(true);

    clock.advance(1_000);

    expect(limiter.isBlocked('a')).toBe(false);
  });

  it('reset снимает блокировку', () => {
    const limiter = new FailureLimiter(1, 1_000, createClock().now);
    limiter.recordFailure('a');
    expect(limiter.isBlocked('a')).toBe(true);

    limiter.reset('a');

    expect(limiter.isBlocked('a')).toBe(false);
  });

  it('число записей ограничено: самые старые вытесняются', () => {
    const limiter = new FailureLimiter(5, 60_000, createClock().now, 3);

    for (const key of ['a', 'b', 'c', 'd']) {
      limiter.recordFailure(key);
    }

    expect(limiter.size).toBe(3);
  });
});