/**
 * Профиль учётной записи: данные, телефон студента, аватар, смена email.
 * Студент меняет телефон в таблице students (там он уже есть), администратор — в user_profiles.
 * Каждое изменение и запись аудита выполняются в одной транзакции.
 */

import type { Pool } from 'pg';
import { withRetry } from '../db/transaction.js';
import { writeAuditLog } from '../utils/audit.js';
import { isDbError } from '../utils/db-errors.js';
import { ConflictError, NotFoundError, UnprocessableError } from '../utils/errors.js';
import { detectImageType, MAX_AVATAR_BYTES } from '../utils/image.js';
import { verifyPassword } from '../utils/password.js';
import type { ChangeEmailInput, PatchProfileInput } from '../validation/account.validation.js';
import type { ActionContext } from './buildings.service.js';

export interface Profile {
  email: string;
  role: 'admin' | 'student';
  displayName: string | null;
  phone: string | null;
  jobTitle: string | null;
  hasAvatar: boolean;
  student: {
    studentNumber: string;
    lastName: string | null;
    firstName: string | null;
    middleName: string | null;
    birthDate: string;
    faculty: string | null;
    groupName: string | null;
    studyYear: number | null;
  } | null;
}

interface ProfileRow {
  email: string;
  role: 'admin' | 'student';
  p_display_name: string | null;
  p_phone: string | null;
  p_job_title: string | null;
  has_avatar: boolean;
  s_id: string | null;
  s_number: string | null;
  s_display_name: string | null;
  s_last: string | null;
  s_first: string | null;
  s_middle: string | null;
  s_birth: string | null;
  s_phone: string | null;
  s_faculty: string | null;
  s_group: string | null;
  s_year: number | null;
}

export class ProfileService {
  constructor(private readonly pool: Pool) {}

  async get(userId: string): Promise<Profile> {
    const result = await this.pool.query<ProfileRow>(
      `SELECT u.email, u.role,
              p.display_name AS p_display_name, p.phone AS p_phone, p.job_title AS p_job_title,
              EXISTS (SELECT 1 FROM user_avatars a WHERE a.user_id = u.id) AS has_avatar,
              s.id AS s_id, s.student_number AS s_number, s.display_name AS s_display_name,
              s.last_name AS s_last, s.first_name AS s_first, s.middle_name AS s_middle,
              s.birth_date::text AS s_birth, s.phone AS s_phone, s.faculty AS s_faculty,
              s.group_name AS s_group, s.study_year AS s_year
       FROM users u
       LEFT JOIN user_profiles p ON p.user_id = u.id
       LEFT JOIN students s ON s.user_id = u.id
       WHERE u.id = $1`,
      [userId]
    );
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundError('Пользователь не найден');
    }
    const isStudent = row.s_id !== null;
    return {
      email: row.email,
      role: row.role,
      displayName: isStudent ? row.s_display_name : row.p_display_name,
      phone: isStudent ? row.s_phone : row.p_phone,
      jobTitle: row.p_job_title,
      hasAvatar: row.has_avatar,
      student: isStudent
        ? {
            studentNumber: row.s_number as string,
            lastName: row.s_last,
            firstName: row.s_first,
            middleName: row.s_middle,
            birthDate: row.s_birth as string,
            faculty: row.s_faculty,
            groupName: row.s_group,
            studyYear: row.s_year,
          }
        : null,
    };
  }

  /** Администратор меняет имя, телефон, должность; студент — только телефон */
  async patch(input: PatchProfileInput, role: 'admin' | 'student', ctx: ActionContext): Promise<void> {
    if (role === 'student' && (input.displayName !== undefined || input.jobTitle !== undefined)) {
      throw new UnprocessableError('Студент может изменить только телефон, email и аватар');
    }
    await withRetry(this.pool, async (client) => {
      const before = await this.get(ctx.userId);
      if (role === 'student') {
        const updated = await client.query(
          'UPDATE students SET phone = $2 WHERE user_id = $1',
          [ctx.userId, input.phone ?? null]
        );
        if ((updated.rowCount ?? 0) === 0) {
          throw new NotFoundError('Профиль студента не найден');
        }
      } else {
        await client.query(
          `INSERT INTO user_profiles (user_id, display_name, phone, job_title)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (user_id) DO UPDATE SET
             display_name = CASE WHEN $5 THEN EXCLUDED.display_name ELSE user_profiles.display_name END,
             phone = CASE WHEN $6 THEN EXCLUDED.phone ELSE user_profiles.phone END,
             job_title = CASE WHEN $7 THEN EXCLUDED.job_title ELSE user_profiles.job_title END,
             updated_at = now()`,
          [
            ctx.userId,
            input.displayName ?? null,
            input.phone ?? null,
            input.jobTitle ?? null,
            input.displayName !== undefined,
            input.phone !== undefined,
            input.jobTitle !== undefined,
          ]
        );
      }
      await writeAuditLog(client, {
        actorUserId: ctx.userId,
        action: 'update_profile',
        entityType: 'users',
        entityId: ctx.userId,
        details: {
          before: { displayName: before.displayName, phone: before.phone, jobTitle: before.jobTitle },
          after: input,
        },
        ipAddress: ctx.ip,
      });
    });
  }

  async changeEmail(input: ChangeEmailInput, ctx: ActionContext): Promise<void> {
    try {
      await withRetry(this.pool, async (client) => {
        const found = await client.query<{ email: string; password_hash: string }>(
          'SELECT email, password_hash FROM users WHERE id = $1 FOR UPDATE',
          [ctx.userId]
        );
        const row = found.rows[0];
        if (!row) {
          throw new NotFoundError('Пользователь не найден');
        }
        if (!(await verifyPassword(input.currentPassword, row.password_hash))) {
          throw new UnprocessableError('Неверный текущий пароль');
        }
        await client.query('UPDATE users SET email = $2 WHERE id = $1', [ctx.userId, input.email]);
        await writeAuditLog(client, {
          actorUserId: ctx.userId,
          action: 'change_email',
          entityType: 'users',
          entityId: ctx.userId,
          details: { before: { email: row.email }, after: { email: input.email } },
          ipAddress: ctx.ip,
        });
      });
    } catch (error) {
      if (isDbError(error, '23505', 'users_email_key')) {
        throw new ConflictError('Пользователь с таким email уже существует');
      }
      throw error;
    }
  }

  async getAvatar(userId: string): Promise<{ type: string; data: Buffer } | null> {
    const result = await this.pool.query<{ content_type: string; data: Buffer }>(
      'SELECT content_type, data FROM user_avatars WHERE user_id = $1',
      [userId]
    );
    const row = result.rows[0];
    return row ? { type: row.content_type, data: row.data } : null;
  }

  async setAvatar(data: Buffer, ctx: ActionContext): Promise<void> {
    if (data.length === 0) {
      throw new UnprocessableError('Файл пустой');
    }
    if (data.length > MAX_AVATAR_BYTES) {
      throw new UnprocessableError('Изображение больше 2 МБ');
    }
    const type = detectImageType(data);
    if (!type) {
      throw new UnprocessableError('Допустимы только изображения PNG, JPEG и WebP');
    }
    await withRetry(this.pool, async (client) => {
      await client.query(
        `INSERT INTO user_avatars (user_id, content_type, data) VALUES ($1, $2, $3)
         ON CONFLICT (user_id) DO UPDATE SET
           content_type = EXCLUDED.content_type, data = EXCLUDED.data, updated_at = now()`,
        [ctx.userId, type, data]
      );
      await writeAuditLog(client, {
        actorUserId: ctx.userId,
        action: 'update_avatar',
        entityType: 'users',
        entityId: ctx.userId,
        details: { contentType: type, bytes: data.length },
        ipAddress: ctx.ip,
      });
    });
  }

  async deleteAvatar(ctx: ActionContext): Promise<void> {
    await withRetry(this.pool, async (client) => {
      await client.query('DELETE FROM user_avatars WHERE user_id = $1', [ctx.userId]);
      await writeAuditLog(client, {
        actorUserId: ctx.userId,
        action: 'delete_avatar',
        entityType: 'users',
        entityId: ctx.userId,
        details: {},
        ipAddress: ctx.ip,
      });
    });
  }
}