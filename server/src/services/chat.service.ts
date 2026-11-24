/**
 * Чат: групповые чаты этажа и блока (по действующему договору) и личные переписки.
 * Мягкое удаление с аудитом, реакции, ответы, блокировки в личных чатах.
 */

import type { Pool } from 'pg';
import { withRetry } from '../db/transaction.js';
import type { BuildingType } from '../types/buildings.js';
import { writeAuditLog } from '../utils/audit.js';
import { ForbiddenError, NotFoundError, TooManyRequestsError, UnprocessableError } from '../utils/errors.js';
import { htmlToText, sanitizeAnnouncementHtml } from '../utils/html.js';
import { FailureLimiter } from '../utils/rate-limit.js';
import { blockOfRoom } from '../utils/room-number.js';
import type { MessagesQuery, SendMessageInput } from '../validation/chat.validation.js';
import type { ActionContext } from './buildings.service.js';

export type Viewer = { id: string; role: 'admin' | 'student' };

export interface ChatSummary {
  id: number;
  kind: 'floor' | 'block' | 'direct';
  title: string;
  /** Для личных чатов: собеседник и состояние блокировки */
  otherUserId: string | null;
  blockedByMe: boolean;
  lastMessage: { text: string; createdAt: string } | null;
  unread: number;
}

export interface ChatMessage {
  id: number;
  senderId: string | null;
  senderName: string;
  body: string | null;
  bodyHtml: string | null;
  deleted: boolean;
  createdAt: string;
  replyTo: { id: number; senderName: string; text: string | null } | null;
  /** Количество реакций по видам и реакция текущего пользователя */
  reactions: Record<string, number>;
  myReaction: string | null;
}

export const MESSAGES_PER_MINUTE = 30;

export class ChatService {
  private readonly limiter: FailureLimiter;

  constructor(
    private readonly pool: Pool,
    now: () => number = Date.now
  ) {
    this.limiter = new FailureLimiter(MESSAGES_PER_MINUTE, 60_000, now);
  }

  /** Создаёт (если нет) чаты этажа и блока по действующим договорам студента */
  private async ensureGroups(userId: string): Promise<void> {
    const rows = await this.pool.query<{
      building_id: string; floor: number; room_number: string; building_type: BuildingType;
    }>(
      `SELECT r.building_id, r.floor, r.room_number, bl.building_type
       FROM students s
       JOIN contracts c ON c.student_id = s.id AND c.status = 'active'
       JOIN beds b ON b.id = c.bed_id
       JOIN rooms r ON r.id = b.room_id
       JOIN buildings bl ON bl.id = r.building_id
       WHERE s.user_id = $1`,
      [userId]
    );
    for (const r of rows.rows) {
      await this.pool.query(
        `INSERT INTO chats (kind, building_id, floor) VALUES ('floor', $1, $2) ON CONFLICT DO NOTHING`,
        [r.building_id, r.floor]
      );
      const block = blockOfRoom(r.building_type, r.floor, r.room_number);
      if (block !== null) {
        await this.pool.query(
          `INSERT INTO chats (kind, building_id, floor, block) VALUES ('block', $1, $2, $3) ON CONFLICT DO NOTHING`,
          [r.building_id, r.floor, block]
        );
      }
    }
  }

  /** Доступ студента (параметр $1 — id пользователя) к чату c */
  private static readonly MEMBER = `(
    (c.kind = 'direct' AND $1::uuid IN (c.user_a, c.user_b))
    OR (c.kind IN ('floor', 'block') AND EXISTS (
      SELECT 1 FROM students s
      JOIN contracts k ON k.student_id = s.id AND k.status = 'active'
      JOIN beds b ON b.id = k.bed_id
      JOIN rooms r ON r.id = b.room_id
      JOIN buildings bl ON bl.id = r.building_id
      WHERE s.user_id = $1 AND r.building_id = c.building_id AND r.floor = c.floor
        AND (c.kind = 'floor' OR (
          bl.building_type = 'block' AND (
            CASE
              WHEN r.room_number ~ '^[0-9]+-[0-9]+-[0-9]+$' THEN split_part(r.room_number, '-', 2)::int
              WHEN r.room_number ~ '^[0-9]+$' THEN substr(r.room_number, length(r.floor::text) + 1, 1)::int
            END) = c.block))
    ))
  )`;

  private static readonly ADMIN_SCOPE = `(c.kind <> 'direct' OR $1::uuid IN (c.user_a, c.user_b))`;

  private scope(viewer: Viewer): string {
    return viewer.role === 'admin' ? ChatService.ADMIN_SCOPE : ChatService.MEMBER;
  }

  /** Проверка доступа; возвращает вид чата и собеседника для личных */
  private async access(
    chatId: number,
    viewer: Viewer
  ): Promise<{ kind: string; other: string | null }> {
    const result = await this.pool.query<{ kind: string; user_a: string | null; user_b: string | null }>(
      `SELECT c.kind, c.user_a, c.user_b FROM chats c WHERE c.id = $2 AND ${this.scope(viewer)}`,
      [viewer.id, chatId]
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundError('Чат не найден');
    const other = row.kind === 'direct' ? (row.user_a === viewer.id ? row.user_b : row.user_a) : null;
    return { kind: row.kind, other };
  }

  async list(viewer: Viewer): Promise<ChatSummary[]> {
    if (viewer.role === 'student') await this.ensureGroups(viewer.id);
    const result = await this.pool.query<{
      id: string; kind: ChatSummary['kind']; building_number: number | null; floor: number | null;
      block: number | null; other_id: string | null; other_name: string | null;
      last_text: string | null; last_at: Date | null; unread: number; blocked: boolean;
    }>(
      `SELECT c.id, c.kind, bl.building_number, c.floor, c.block,
              CASE WHEN c.kind = 'direct'
                   THEN CASE WHEN c.user_a = $1::uuid THEN c.user_b ELSE c.user_a END END AS other_id,
              (SELECT COALESCE(p.display_name, st.display_name, u.email)
                 FROM users u
                 LEFT JOIN user_profiles p ON p.user_id = u.id
                 LEFT JOIN students st ON st.user_id = u.id
                WHERE c.kind = 'direct'
                  AND u.id = CASE WHEN c.user_a = $1::uuid THEN c.user_b ELSE c.user_a END) AS other_name,
              lm.body AS last_text, lm.created_at AS last_at,
              (SELECT count(*)::int FROM chat_messages m
                WHERE m.chat_id = c.id AND m.deleted_at IS NULL
                  AND m.sender_id IS DISTINCT FROM $1::uuid
                  AND m.id > COALESCE((SELECT last_read_message_id FROM chat_reads
                                        WHERE chat_id = c.id AND user_id = $1::uuid), 0)) AS unread,
              EXISTS (SELECT 1 FROM chat_blocks cb WHERE cb.blocker_id = $1::uuid
                        AND cb.blocked_id = CASE WHEN c.user_a = $1::uuid THEN c.user_b ELSE c.user_a END) AS blocked
       FROM chats c
       LEFT JOIN buildings bl ON bl.id = c.building_id
       LEFT JOIN LATERAL (
         SELECT body, created_at FROM chat_messages
         WHERE chat_id = c.id AND deleted_at IS NULL ORDER BY id DESC LIMIT 1
       ) lm ON true
       WHERE ${this.scope(viewer)}
       ORDER BY COALESCE(lm.created_at, c.created_at) DESC, c.id DESC`,
      [viewer.id]
    );
    return result.rows.map((r) => ({
      id: Number(r.id),
      kind: r.kind,
      title:
        r.kind === 'direct'
          ? (r.other_name ?? 'Пользователь')
          : r.kind === 'floor'
            ? `Здание ${r.building_number}, этаж ${r.floor}`
            : `Здание ${r.building_number}, этаж ${r.floor}, блок ${r.block}`,
      otherUserId: r.other_id,
      blockedByMe: r.blocked,
      lastMessage: r.last_text && r.last_at ? { text: r.last_text, createdAt: r.last_at.toISOString() } : null,
      unread: r.unread,
    }));
  }

  async totalUnread(viewer: Viewer): Promise<number> {
    return (await this.list(viewer)).reduce((sum, c) => sum + c.unread, 0);
  }

  async messages(chatId: number, viewer: Viewer, q: MessagesQuery): Promise<ChatMessage[]> {
    await this.access(chatId, viewer);
    const params: unknown[] = [chatId, q.limit, viewer.id];
    let filter = '';
    if (q.after !== undefined) {
      params.push(q.after);
      filter = `AND m.id > $${params.length}`;
    } else if (q.before !== undefined) {
      params.push(q.before);
      filter = `AND m.id < $${params.length}`;
    }
    const order = q.after !== undefined ? 'ASC' : 'DESC';
    const result = await this.pool.query<{
      id: string; sender_id: string | null; sender_name: string | null; body: string; body_html: string | null;
      deleted_at: Date | null; created_at: Date; reply_id: string | null; reply_name: string | null;
      reply_body: string | null; reply_deleted: Date | null; reactions: Record<string, number> | null;
      my_reaction: string | null;
    }>(
      `SELECT m.id, m.sender_id, m.body, m.body_html, m.deleted_at, m.created_at,
              COALESCE(p.display_name, st.display_name, u.email) AS sender_name,
              rm.id AS reply_id, rm.body AS reply_body, rm.deleted_at AS reply_deleted,
              (SELECT COALESCE(rp.display_name, rs.display_name, ru.email) FROM users ru
                 LEFT JOIN user_profiles rp ON rp.user_id = ru.id
                 LEFT JOIN students rs ON rs.user_id = ru.id WHERE ru.id = rm.sender_id) AS reply_name,
              (SELECT jsonb_object_agg(kind, n) FROM (
                 SELECT kind, count(*)::int AS n FROM chat_reactions WHERE message_id = m.id GROUP BY kind) x) AS reactions,
              (SELECT kind FROM chat_reactions WHERE message_id = m.id AND user_id = $3::uuid) AS my_reaction
       FROM chat_messages m
       LEFT JOIN users u ON u.id = m.sender_id
       LEFT JOIN user_profiles p ON p.user_id = u.id
       LEFT JOIN students st ON st.user_id = u.id
       LEFT JOIN chat_messages rm ON rm.id = m.reply_to_id
       WHERE m.chat_id = $1 ${filter}
       ORDER BY m.id ${order} LIMIT $2`,
      params
    );
    const rows = order === 'DESC' ? result.rows.reverse() : result.rows;
    return rows.map((m) => ({
      id: Number(m.id),
      senderId: m.sender_id,
      senderName: m.sender_name ?? 'Удалённый пользователь',
      body: m.deleted_at ? null : m.body,
      bodyHtml: m.deleted_at ? null : m.body_html,
      deleted: m.deleted_at !== null,
      createdAt: m.created_at.toISOString(),
      replyTo: m.reply_id
        ? {
            id: Number(m.reply_id),
            senderName: m.reply_name ?? 'Удалённый пользователь',
            text: m.reply_deleted ? null : m.reply_body,
          }
        : null,
      reactions: m.deleted_at ? {} : (m.reactions ?? {}),
      myReaction: m.my_reaction,
    }));
  }

  /** Блокировка в личном чате: true, если отправителю писать нельзя */
  private async isBlocked(sender: string, other: string): Promise<boolean> {
    const r = await this.pool.query(
      'SELECT 1 FROM chat_blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)',
      [sender, other]
    );
    return (r.rowCount ?? 0) > 0;
  }

  async send(chatId: number, viewer: Viewer, input: SendMessageInput): Promise<number> {
    const { other } = await this.access(chatId, viewer);
    if (other && (await this.isBlocked(viewer.id, other))) {
      throw new ForbiddenError('Переписка заблокирована');
    }
    let html: string | null = null;
    let text: string;
    if (input.bodyHtml !== undefined) {
      html = sanitizeAnnouncementHtml(input.bodyHtml);
      text = htmlToText(html).slice(0, 2000);
    } else {
      text = (input.body ?? '').trim();
    }
    if (!text) throw new UnprocessableError('Сообщение не может быть пустым');
    if (input.replyToId !== undefined) {
      const reply = await this.pool.query('SELECT 1 FROM chat_messages WHERE id = $1 AND chat_id = $2', [
        input.replyToId,
        chatId,
      ]);
      if (reply.rowCount === 0) throw new UnprocessableError('Исходное сообщение не найдено');
    }
    if (this.limiter.isBlocked(viewer.id)) {
      throw new TooManyRequestsError('Слишком много сообщений. Повторите через минуту.');
    }
    this.limiter.recordFailure(viewer.id);
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO chat_messages (chat_id, sender_id, body, body_html, reply_to_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [chatId, viewer.id, text, html, input.replyToId ?? null]
    );
    const id = Number(result.rows[0].id);
    await this.markRead(chatId, viewer, id);
    return id;
  }

  async markRead(chatId: number, viewer: Viewer, upTo?: number): Promise<void> {
    await this.access(chatId, viewer);
    await this.pool.query(
      `INSERT INTO chat_reads (chat_id, user_id, last_read_message_id)
       VALUES ($1, $2, COALESCE($3::bigint, (SELECT COALESCE(max(id), 0) FROM chat_messages WHERE chat_id = $1)))
       ON CONFLICT (chat_id, user_id) DO UPDATE
         SET last_read_message_id = GREATEST(chat_reads.last_read_message_id, EXCLUDED.last_read_message_id)`,
      [chatId, viewer.id, upTo ?? null]
    );
  }

  async markAllRead(viewer: Viewer): Promise<void> {
    for (const chat of await this.list(viewer)) {
      if (chat.unread > 0) await this.markRead(chat.id, viewer);
    }
  }

  async deleteMessage(chatId: number, messageId: number, viewer: Viewer, ctx: ActionContext): Promise<void> {
    await this.access(chatId, viewer);
    await withRetry(this.pool, async (client) => {
      const found = await client.query<{ sender_id: string | null; deleted_at: Date | null }>(
        'SELECT sender_id, deleted_at FROM chat_messages WHERE id = $1 AND chat_id = $2 FOR UPDATE',
        [messageId, chatId]
      );
      const row = found.rows[0];
      if (!row) throw new NotFoundError('Сообщение не найдено');
      if (viewer.role !== 'admin' && row.sender_id !== viewer.id) {
        throw new ForbiddenError('Можно удалять только свои сообщения');
      }
      if (row.deleted_at) return;
      await client.query('UPDATE chat_messages SET deleted_at = now(), deleted_by = $2 WHERE id = $1', [
        messageId,
        viewer.id,
      ]);
      // entity_id в аудите имеет тип uuid, а идентификатор сообщения числовой: он записывается в details
      await writeAuditLog(client, {
        actorUserId: viewer.id,
        action: 'delete_chat_message',
        entityType: 'chat_messages',
        details: { chatId, messageId },
        ipAddress: ctx.ip,
      });
    });
  }

  /** Поставить, сменить или снять (kind = null) реакцию */
  async react(chatId: number, messageId: number, viewer: Viewer, kind: string | null): Promise<void> {
    await this.access(chatId, viewer);
    const msg = await this.pool.query(
      'SELECT 1 FROM chat_messages WHERE id = $1 AND chat_id = $2 AND deleted_at IS NULL',
      [messageId, chatId]
    );
    if (msg.rowCount === 0) throw new NotFoundError('Сообщение не найдено');
    if (kind === null) {
      await this.pool.query('DELETE FROM chat_reactions WHERE message_id = $1 AND user_id = $2', [messageId, viewer.id]);
      return;
    }
    await this.pool.query(
      `INSERT INTO chat_reactions (message_id, user_id, kind) VALUES ($1, $2, $3)
       ON CONFLICT (message_id, user_id) DO UPDATE SET kind = EXCLUDED.kind, created_at = now()`,
      [messageId, viewer.id, kind]
    );
  }

  /** Заблокировать собеседника; администратора студент блокировать не может */
  async block(viewer: Viewer, targetId: string): Promise<void> {
    if (targetId === viewer.id) throw new UnprocessableError('Нельзя заблокировать себя');
    const target = await this.pool.query<{ role: string }>('SELECT role FROM users WHERE id = $1', [targetId]);
    if (!target.rows[0]) throw new NotFoundError('Пользователь не найден');
    if (target.rows[0].role === 'admin') throw new ForbiddenError('Администратора заблокировать нельзя');
    await this.pool.query(
      'INSERT INTO chat_blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [viewer.id, targetId]
    );
  }

  async unblock(viewer: Viewer, targetId: string): Promise<void> {
    await this.pool.query('DELETE FROM chat_blocks WHERE blocker_id = $1 AND blocked_id = $2', [viewer.id, targetId]);
  }

  /** Люди для личной переписки: пользователи с учётной записью */
  async people(viewer: Viewer, q: string): Promise<Array<{ userId: string; name: string; role: string }>> {
    const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    const result = await this.pool.query<{ id: string; name: string; role: string }>(
      `SELECT u.id, COALESCE(p.display_name, st.display_name, u.email) AS name, u.role
       FROM users u
       LEFT JOIN user_profiles p ON p.user_id = u.id
       LEFT JOIN students st ON st.user_id = u.id
       WHERE u.id <> $1 AND u.is_active
         AND (COALESCE(p.display_name, st.display_name, '') ILIKE $2
              OR COALESCE(st.student_number, '') ILIKE $2 OR u.email ILIKE $2)
       ORDER BY name LIMIT 20`,
      [viewer.id, like]
    );
    return result.rows.map((r) => ({ userId: r.id, name: r.name, role: r.role }));
  }

  /** Открыть (или создать) личный чат */
  async openDirect(viewer: Viewer, otherId: string): Promise<number> {
    if (otherId === viewer.id) throw new UnprocessableError('Нельзя написать самому себе');
    const exists = await this.pool.query('SELECT 1 FROM users WHERE id = $1 AND is_active', [otherId]);
    if (exists.rowCount === 0) throw new NotFoundError('Пользователь не найден');
    const [a, b] = viewer.id < otherId ? [viewer.id, otherId] : [otherId, viewer.id];
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO chats (kind, user_a, user_b) VALUES ('direct', $1, $2)
       ON CONFLICT (user_a, user_b) WHERE kind = 'direct' DO UPDATE SET kind = 'direct'
       RETURNING id`,
      [a, b]
    );
    return Number(result.rows[0].id);
  }
}