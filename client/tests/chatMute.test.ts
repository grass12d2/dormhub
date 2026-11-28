import { describe, expect, it } from 'vitest';
import { muteLeftLabel } from '../src/lib/chatMute';

describe('muteLeftLabel', () => {
  const now = 1_000_000_000;
  it('бессрочно', () => expect(muteLeftLabel(-1, now)).toBe('пока не включите'));
  it('часы и минуты', () => expect(muteLeftLabel(now + (2 * 60 + 15) * 60_000, now)).toBe('2 ч 15 мин'));
  it('ровно часы', () => expect(muteLeftLabel(now + 3 * 3_600_000, now)).toBe('3 ч'));
  it('минуты округляются вверх, минимум 1', () => {
    expect(muteLeftLabel(now + 40 * 60_000 - 5_000, now)).toBe('40 мин');
    expect(muteLeftLabel(now + 1_000, now)).toBe('1 мин');
  });
});
