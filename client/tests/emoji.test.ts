import { describe, expect, it } from 'vitest';
import { emojiOnlyCount } from '../src/lib/emoji';

describe('emojiOnlyCount', () => {
  it('только эмодзи', () => {
    expect(emojiOnlyCount('😀')).toBe(1);
    expect(emojiOnlyCount('😀 😂')).toBe(2);
    expect(emojiOnlyCount('👨‍👩‍👧')).toBe(1);
  });
  it('текст, цифры, пустое и слишком много', () => {
    expect(emojiOnlyCount('а😀')).toBe(0);
    expect(emojiOnlyCount('123')).toBe(0);
    expect(emojiOnlyCount('   ')).toBe(0);
    expect(emojiOnlyCount('😀😀😀😀😀😀')).toBe(0);
  });
});