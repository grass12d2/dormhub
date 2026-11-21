/**
 * Запросы к таблице users.
 * Явный список столбцов: лишние поля в ответ не попадают.
 */

import type { Queryable } from '../queryable.js';
import type { UserRole } from '../../types/auth.js';

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  role: UserRole;
  is_active: boolean;
  last_login_at: Date | null;
  created_at: Date;
}

const USER_COLUMNS = 'id, email, password_hash, role, is_active, last_login_at, created_at';

export class UserQueries {
  constructor(private readonly db: Queryable) {}

  async findByEmail(email: string): Promise<UserRow | null> {
    const result = await this.db.query<UserRow>(
      `SELECT ${USER_COLUMNS} FROM users WHERE email = $1`,
      [email]
    );
    return result.rows[0] ?? null;
  }

  async findById(id: string): Promise<UserRow | null> {
    const result = await this.db.query<UserRow>(
      `SELECT ${USER_COLUMNS} FROM users WHERE id = $1`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  async touchLastLogin(id: string): Promise<void> {
    await this.db.query('UPDATE users SET last_login_at = now() WHERE id = $1', [id]);
  }

  async create(email: string, passwordHash: string, role: UserRole): Promise<UserRow> {
    const result = await this.db.query<UserRow>(
      `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)
       RETURNING ${USER_COLUMNS}`,
      [email, passwordHash, role]
    );
    return result.rows[0];
  }
}