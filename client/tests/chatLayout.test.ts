import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '../src/api/chat';
import { buildRows, mergeMessages } from '../src/lib/chatLayout';

const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).toISOString();
const msg = (id: number, sender: string, createdAt: string, body = 'т'): ChatMessage => ({
  id, senderId: sender, senderName: sender, body, bodyHtml: null, deleted: false, createdAt,
  replyTo: null, reactions: {}, myReaction: null, files: [],
});

describe('buildRows', () => {
  it('подряд идущие сообщения одного автора — одна группа', () => {
    const rows = buildRows([msg(1, 'a', at(24, 10)), msg(2, 'a', at(24, 11)), msg(3, 'b', at(24, 12))]);
    expect(rows.map((r) => r.kind)).toEqual(['day', 'group', 'group']);
    const groups = rows.filter((r) => r.kind === 'group');
    expect(groups.map((g) => (g.kind === 'group' ? g.messages.length : 0))).toEqual([2, 1]);
  });

  it('смена дня даёт разделитель и новую группу', () => {
    const rows = buildRows([msg(1, 'a', at(24, 23)), msg(2, 'a', at(25, 1))]);
    expect(rows.map((r) => r.kind)).toEqual(['day', 'group', 'day', 'group']);
    const label = rows[0].kind === 'day' ? rows[0].label : '';
    expect(label).toContain('2026');
  });

  it('пустой список — пустая лента', () => {
    expect(buildRows([])).toEqual([]);
  });
});

describe('mergeMessages', () => {
  it('новые заменяют старые по id и порядок сохраняется', () => {
    const merged = mergeMessages(
      [msg(1, 'a', at(24, 10)), msg(2, 'a', at(24, 11), 'старое')],
      [msg(2, 'a', at(24, 11), 'новое'), msg(3, 'b', at(24, 12))]
    );
    expect(merged.map((m) => m.id)).toEqual([1, 2, 3]);
    expect(merged[1].body).toBe('новое');
  });
});