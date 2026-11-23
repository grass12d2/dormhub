/**
 * Объявления. Администратор создаёт и меняет их вместе с адресатами в одной транзакции
 * с записью аудита. Студент видит только объявления, адресованные ему
 * (по действующему договору), и отмечает их прочитанными.
 */

import type { Pool } from 'pg';
import { withRetry } from '../db/transaction.js';
import type { Queryable } from '../db/queryable.js';
import { writeAuditLog } from '../utils/audit.js';
import { isDbError } from '../utils/db-errors.js';
import { NotFoundError, UnprocessableError } from '../utils/errors.js';
import type {
  AnnouncementTargetInput,
  CreateAnnouncementInput,
  ListAnnouncementsQuery,
} from '../validation/announcements.validation.js';
import type { ActionContext } from './buildings.service.js';

export interface Announcement {
  id: string;
  title: string;
  body: string;
  expiresAt: string | null;
  createdAt: string;
  isRead: boolean;
  targets: AnnouncementTargetInput[];
}

interface Row {
  id: string;
  title: string;
  body: string;
  expires_at: Date | null;
  created_at: Date;
  is_read: boolean;
}

const NOT_FOUND = 'Объявление не найдено';

/** Условие «студент (параметр $1 — user id) является адресатом объявления a» */
const VISIBLE_TO_STUDENT = `(
  NOT EXISTS (SELECT 1 FROM announcement_targets t WHERE t.announcement_id = a.id)
  OR EXISTS (
    SELECT 1
    FROM announcement_targets t
    JOIN students s ON s.user_id = $1
    JOIN contracts c ON c.student_id = s.id AND c.status = 'active'
    JOIN beds b ON b.id = c.bed_id
    JOIN rooms r ON r.id = b.room_id
    WHERE t.announcement_id = a.id
      AND ((t.room_id IS NOT NULL AND t.room_id = r.id)
        OR (t.building_id IS NOT NULL AND t.building_id = r.building_id
            AND (t.floor IS NULL OR t.floor = r.floor)))
  )
)`;

export class AnnouncementsService {
  constructor(private readonly pool: Pool) {}

  private async targetsOf(db: Queryable, ids: string[]): Promise<Map<string, AnnouncementTargetInput[]>> {
    const map = new Map<string, AnnouncementTargetInput[]>();
    if (ids.length === 0) {
      return map;
    }
    const result = await db.query<{
      announcement_id: string;
      building_id: string | null;
      floor: number | null;
      room_id: string | null;
    }>(
      'SELECT announcement_id, building_id, floor, room_id FROM announcement_targets WHERE announcement_id = ANY($1::uuid[]) ORDER BY id',
      [ids]
    );
    for (const row of result.rows) {
      const list = map.get(row.announcement_id) ?? [];
      list.push(
        row.room_id
          ? { roomId: row.room_id }
          : { buildingId: row.building_id as string, ...(row.floor !== null ? { floor: row.floor } : {}) }
      );
      map.set(row.announcement_id, list);
    }
    return map;
  }

  private async assemble(db: Queryable, rows: Row[]): Promise<Announcement[]> {
    const targets = await this.targetsOf(db, rows.map((r) => r.id));
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      expiresAt: r.expires_at ? r.expires_at.toISOString() : null,
      createdAt: r.created_at.toISOString(),
      isRead: r.is_read,
      targets: targets.get(r.id) ?? [],
    }));
  }

  private async writeTargets(db: Queryable, id: string, targets: AnnouncementTargetInput[]): Promise<void> {
    for (const t of targets) {
      const room = 'roomId' in t ? t.roomId : null;
      const building = 'buildingId' in t ? t.buildingId : null;
      const floor = 'floor' in t && t.floor !== undefined ? t.floor : null;
      await db.query(
        'INSERT INTO announcement_targets (announcement_id, building_id, floor, room_id) VALUES ($1, $2, $3, $4)',
        [id, building, floor, room]
      );
    }
  }

  private translate(error: unknown): unknown {
    if (isDbError(error, '23503')) {
      return new UnprocessableError('Здание или комната не найдены');
    }
    return error;
  }

  /** Список для администратора: все объявления, isRead относится к самому администратору */
  async listAll(userId: string, q: ListAnnouncementsQuery): Promise<{ items: Announcement[]; total: number }> {
    const total = await this.pool.query<{ n: number }>('SELECT count(*)::int AS n FROM announcements');
    const rows = await this.pool.query<Row>(
      `SELECT a.id, a.title, a.body, a.expires_at, a.created_at,
              EXISTS (SELECT 1 FROM announcement_reads x WHERE x.announcement_id = a.id AND x.user_id = $1) AS is_read
       FROM announcements a ORDER BY a.created_at DESC, a.id LIMIT $2 OFFSET $3`,
      [userId, q.limit, q.offset]
    );
    return { items: await this.assemble(this.pool, rows.rows), total: total.rows[0].n };
  }

  /** Список для студента: только адресованные ему и не истёкшие */
  async listMine(userId: string, q: ListAnnouncementsQuery): Promise<{ items: Announcement[]; total: number }> {
    const where = `(a.expires_at IS NULL OR a.expires_at > now()) AND ${VISIBLE_TO_STUDENT}`;
    const total = await this.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM announcements a WHERE ${where}`,
      [userId]
    );
    const rows = await this.pool.query<Row>(
      `SELECT a.id, a.title, a.body, a.expires_at, a.created_at,
              EXISTS (SELECT 1 FROM announcement_reads x WHERE x.announcement_id = a.id AND x.user_id = $1) AS is_read
       FROM announcements a WHERE ${where}
       ORDER BY a.created_at DESC, a.id LIMIT $2 OFFSET $3`,
      [userId, q.limit, q.offset]
    );
    return { items: await this.assemble(this.pool, rows.rows), total: total.rows[0].n };
  }

  async unreadCount(userId: string): Promise<number> {
    const result = await this.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM announcements a
       WHERE (a.expires_at IS NULL OR a.expires_at > now()) AND ${VISIBLE_TO_STUDENT}
         AND NOT EXISTS (SELECT 1 FROM announcement_reads x WHERE x.announcement_id = a.id AND x.user_id = $1)`,
      [userId]
    );
    return result.rows[0].n;
  }

  /** Отметить прочитанным; чужое (не адресованное) объявление выглядит как «не найдено» */
  async markRead(id: string, userId: string): Promise<void> {
    const visible = await this.pool.query(
      `SELECT 1 FROM announcements a WHERE a.id = $2 AND (a.expires_at IS NULL OR a.expires_at > now()) AND ${VISIBLE_TO_STUDENT}`,
      [userId, id]
    );
    if (visible.rowCount === 0) {
      throw new NotFoundError(NOT_FOUND);
    }
    await this.pool.query(
      'INSERT INTO announcement_reads (announcement_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [id, userId]
    );
  }

  async create(input: CreateAnnouncementInput, ctx: ActionContext): Promise<string> {
    try {
      return await withRetry(this.pool, async (client) => {
        const created = await client.query<{ id: string }>(
          'INSERT INTO announcements (title, body, author_id, expires_at) VALUES ($1, $2, $3, $4) RETURNING id',
          [input.title, input.body, ctx.userId, input.expiresAt ?? null]
        );
        const id = created.rows[0].id;
        await this.writeTargets(client, id, input.targets);
        await writeAuditLog(client, {
          actorUserId: ctx.userId,
          action: 'create_announcement',
          entityType: 'announcements',
          entityId: id,
          details: { after: { title: input.title, targets: input.targets, expiresAt: input.expiresAt ?? null } },
          ipAddress: ctx.ip,
        });
        return id;
      });
    } catch (error) {
      throw this.translate(error);
    }
  }

  async replace(id: string, input: CreateAnnouncementInput, ctx: ActionContext): Promise<void> {
    try {
      await withRetry(this.pool, async (client) => {
        const updated = await client.query(
          `UPDATE announcements SET title = $2, body = $3, expires_at = $4, updated_at = now() WHERE id = $1`,
          [id, input.title, input.body, input.expiresAt ?? null]
        );
        if (updated.rowCount === 0) {
          throw new NotFoundError(NOT_FOUND);
        }
        await client.query('DELETE FROM announcement_targets WHERE announcement_id = $1', [id]);
        await this.writeTargets(client, id, input.targets);
        // После изменения текста объявление снова считается непрочитанным
        await client.query('DELETE FROM announcement_reads WHERE announcement_id = $1', [id]);
        await writeAuditLog(client, {
          actorUserId: ctx.userId,
          action: 'update_announcement',
          entityType: 'announcements',
          entityId: id,
          details: { after: { title: input.title, targets: input.targets, expiresAt: input.expiresAt ?? null } },
          ipAddress: ctx.ip,
        });
      });
    } catch (error) {
      throw this.translate(error);
    }
  }

  async delete(id: string, ctx: ActionContext): Promise<void> {
    await withRetry(this.pool, async (client) => {
      const found = await client.query<{ title: string }>('SELECT title FROM announcements WHERE id = $1 FOR UPDATE', [id]);
      if (!found.rows[0]) {
        throw new NotFoundError(NOT_FOUND);
      }
      await client.query('DELETE FROM announcements WHERE id = $1', [id]);
      await writeAuditLog(client, {
        actorUserId: ctx.userId,
        action: 'delete_announcement',
        entityType: 'announcements',
        entityId: id,
        details: { snapshot: { title: found.rows[0].title } },
        ipAddress: ctx.ip,
      });
    });
  }
}