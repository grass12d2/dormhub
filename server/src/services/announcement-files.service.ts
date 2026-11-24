/** Вложения объявлений: загрузка, список, скачивание с проверкой адресата, удаление */

import type { Pool } from 'pg';
import { withRetry } from '../db/transaction.js';
import { writeAuditLog } from '../utils/audit.js';
import { ConflictError, NotFoundError, UnprocessableError } from '../utils/errors.js';
import { MAX_FILE_BYTES, detectFileType, safeFileName } from '../utils/file-type.js';
import type { ActionContext } from './buildings.service.js';

export const MAX_FILES_PER_ANNOUNCEMENT = 5;

export interface FileInfo {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

/** Адресат объявления a (параметр $1 — id пользователя); та же логика, что в AnnouncementsService */
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

export class AnnouncementFilesService {
  constructor(private readonly pool: Pool) {}

  async listFor(ids: string[]): Promise<Map<string, FileInfo[]>> {
    const map = new Map<string, FileInfo[]>();
    if (ids.length === 0) return map;
    const result = await this.pool.query<{
      id: string; announcement_id: string; file_name: string; content_type: string; size_bytes: number;
    }>(
      `SELECT id, announcement_id, file_name, content_type, size_bytes
       FROM announcement_files WHERE announcement_id = ANY($1::uuid[]) ORDER BY created_at, id`,
      [ids]
    );
    for (const r of result.rows) {
      const list = map.get(r.announcement_id) ?? [];
      list.push({ id: r.id, fileName: r.file_name, contentType: r.content_type, sizeBytes: r.size_bytes });
      map.set(r.announcement_id, list);
    }
    return map;
  }

  async upload(announcementId: string, rawName: string, data: Buffer, ctx: ActionContext): Promise<FileInfo> {
    const fileName = safeFileName(rawName);
    if (!fileName) throw new UnprocessableError('Укажите имя файла');
    if (data.length === 0) throw new UnprocessableError('Файл пустой');
    if (data.length > MAX_FILE_BYTES) throw new UnprocessableError('Файл больше 5 МБ');
    const type = detectFileType(data, fileName);
    if (!type) {
      throw new UnprocessableError('Допустимы изображения PNG, JPEG, WebP и документы PDF, DOC, DOCX, XLS, XLSX, TXT');
    }
    return withRetry(this.pool, async (client) => {
      const found = await client.query('SELECT 1 FROM announcements WHERE id = $1 FOR UPDATE', [announcementId]);
      if (found.rowCount === 0) throw new NotFoundError('Объявление не найдено');
      const count = await client.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM announcement_files WHERE announcement_id = $1',
        [announcementId]
      );
      if (count.rows[0].n >= MAX_FILES_PER_ANNOUNCEMENT) {
        throw new ConflictError(`К объявлению можно прикрепить не более ${MAX_FILES_PER_ANNOUNCEMENT} файлов`);
      }
      const created = await client.query<{ id: string }>(
        `INSERT INTO announcement_files (announcement_id, file_name, content_type, size_bytes, data)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [announcementId, fileName, type, data.length, data]
      );
      await writeAuditLog(client, {
        actorUserId: ctx.userId,
        action: 'attach_announcement_file',
        entityType: 'announcements',
        entityId: announcementId,
        details: { fileName, contentType: type, bytes: data.length },
        ipAddress: ctx.ip,
      });
      return { id: created.rows[0].id, fileName, contentType: type, sizeBytes: data.length };
    });
  }

  /** Скачивание: администратор — любой файл, студент — только вложения адресованных ему объявлений */
  async download(
    announcementId: string,
    fileId: string,
    viewer: { id: string; role: 'admin' | 'student' }
  ): Promise<{ fileName: string; contentType: string; data: Buffer }> {
    const visible =
      viewer.role === 'admin'
        ? ''
        : `AND (a.expires_at IS NULL OR a.expires_at > now()) AND ${VISIBLE_TO_STUDENT}`;
    const params = viewer.role === 'admin' ? [announcementId, fileId] : [viewer.id, announcementId, fileId];
    const [aId, fId] = viewer.role === 'admin' ? ['$1', '$2'] : ['$2', '$3'];
    const result = await this.pool.query<{ file_name: string; content_type: string; data: Buffer }>(
      `SELECT f.file_name, f.content_type, f.data
       FROM announcement_files f JOIN announcements a ON a.id = f.announcement_id
       WHERE a.id = ${aId} AND f.id = ${fId} ${visible}`,
      params
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundError('Файл не найден');
    return { fileName: row.file_name, contentType: row.content_type, data: row.data };
  }

  async remove(announcementId: string, fileId: string, ctx: ActionContext): Promise<void> {
    await withRetry(this.pool, async (client) => {
      const deleted = await client.query<{ file_name: string }>(
        'DELETE FROM announcement_files WHERE id = $1 AND announcement_id = $2 RETURNING file_name',
        [fileId, announcementId]
      );
      if (deleted.rowCount === 0) throw new NotFoundError('Файл не найден');
      await writeAuditLog(client, {
        actorUserId: ctx.userId,
        action: 'remove_announcement_file',
        entityType: 'announcements',
        entityId: announcementId,
        details: { fileName: deleted.rows[0].file_name },
        ipAddress: ctx.ip,
      });
    });
  }
}