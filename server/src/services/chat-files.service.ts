/** Вложения чата: до 10 МБ, хранятся 7 дней; после срока содержимое удаляется, имя остаётся */

import type { Pool } from 'pg';
import { ConflictError, ForbiddenError, NotFoundError, UnprocessableError } from '../utils/errors.js';
import { MAX_CHAT_FILE_BYTES, detectFileType, safeFileName } from '../utils/file-type.js';
import type { Viewer } from './chat.service.js';

export const MAX_FILES_PER_MESSAGE = 5;
export const FILE_TTL_DAYS = 7;

export interface ChatFileInfo {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  expired: boolean;
}

export class ChatFilesService {
  constructor(private readonly pool: Pool) {}

  /** Удаляет содержимое файлов старше семи дней; возвращает число очищенных файлов */
  async expireOld(): Promise<number> {
    const result = await this.pool.query(
      `UPDATE chat_message_files SET data = NULL, expired_at = now()
       WHERE data IS NOT NULL AND created_at < now() - make_interval(days => $1)`,
      [FILE_TTL_DAYS]
    );
    return result.rowCount ?? 0;
  }

  async listFor(messageIds: number[]): Promise<Map<number, ChatFileInfo[]>> {
    const map = new Map<number, ChatFileInfo[]>();
    if (messageIds.length === 0) return map;
    const result = await this.pool.query<{
      id: string; message_id: string; file_name: string; content_type: string; size_bytes: number;
      expired: boolean;
    }>(
      `SELECT id, message_id, file_name, content_type, size_bytes,
              (data IS NULL OR created_at < now() - make_interval(days => $2)) AS expired
       FROM chat_message_files WHERE message_id = ANY($1::bigint[]) ORDER BY created_at, id`,
      [messageIds, FILE_TTL_DAYS]
    );
    for (const r of result.rows) {
      const key = Number(r.message_id);
      const list = map.get(key) ?? [];
      list.push({
        id: r.id,
        fileName: r.file_name,
        contentType: r.content_type,
        sizeBytes: r.size_bytes,
        expired: r.expired,
      });
      map.set(key, list);
    }
    return map;
  }

  /** Принадлежит ли сообщение чату, доступному пользователю; возвращает автора сообщения */
  private async senderOf(chatId: number, messageId: number): Promise<string | null> {
    const r = await this.pool.query<{ sender_id: string | null }>(
      'SELECT sender_id FROM chat_messages WHERE id = $1 AND chat_id = $2 AND deleted_at IS NULL',
      [messageId, chatId]
    );
    if (!r.rows[0]) throw new NotFoundError('Сообщение не найдено');
    return r.rows[0].sender_id;
  }

  async upload(chatId: number, messageId: number, viewer: Viewer, rawName: string, data: Buffer): Promise<ChatFileInfo> {
    const sender = await this.senderOf(chatId, messageId);
    if (sender !== viewer.id) throw new ForbiddenError('Прикреплять файлы можно только к своему сообщению');
    const fileName = safeFileName(rawName);
    if (!fileName) throw new UnprocessableError('Укажите имя файла');
    if (data.length === 0) throw new UnprocessableError('Файл пустой');
    if (data.length > MAX_CHAT_FILE_BYTES) throw new UnprocessableError('Файл больше 10 МБ');
    const type = detectFileType(data, fileName);
    if (!type) {
      throw new UnprocessableError('Допустимы изображения PNG, JPEG, WebP и документы PDF, DOC, DOCX, XLS, XLSX, TXT');
    }
    const count = await this.pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM chat_message_files WHERE message_id = $1',
      [messageId]
    );
    if (count.rows[0].n >= MAX_FILES_PER_MESSAGE) {
      throw new ConflictError(`К сообщению можно прикрепить не более ${MAX_FILES_PER_MESSAGE} файлов`);
    }
    const created = await this.pool.query<{ id: string }>(
      `INSERT INTO chat_message_files (message_id, file_name, content_type, size_bytes, data)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [messageId, fileName, type, data.length, data]
    );
    return { id: created.rows[0].id, fileName, contentType: type, sizeBytes: data.length, expired: false };
  }

  /** Скачивание; доступ к чату проверяет вызывающий. Просроченный файл — 410 */
  async download(chatId: number, messageId: number, fileId: string): Promise<{ fileName: string; contentType: string; data: Buffer }> {
    const r = await this.pool.query<{
      file_name: string; content_type: string; data: Buffer | null; stale: boolean;
    }>(
      `SELECT f.file_name, f.content_type, f.data,
              (f.created_at < now() - make_interval(days => $4)) AS stale
       FROM chat_message_files f JOIN chat_messages m ON m.id = f.message_id
       WHERE f.id = $1 AND m.id = $2 AND m.chat_id = $3 AND m.deleted_at IS NULL`,
      [fileId, messageId, chatId, FILE_TTL_DAYS]
    );
    const row = r.rows[0];
    if (!row) throw new NotFoundError('Файл не найден');
    if (!row.data || row.stale) {
      const gone = new ConflictError('Срок хранения файла истёк');
      throw Object.assign(gone, { status: 410 });
    }
    return { fileName: row.file_name, contentType: row.content_type, data: row.data };
  }
}