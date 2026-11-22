/**
 * Запросы к таблице audit_logs (только чтение).
 * Границы периода вычисляются по UTC независимо от часового пояса сеанса.
 */

import type { AuditLogRow } from '../../types/audit.js';
import type { Queryable } from '../queryable.js';

const SELECT_ENTRY = `
  SELECT a.id::text AS id, a.actor_user_id, u.email AS actor_email, a.action, a.entity_type,
         a.entity_id, a.details, host(a.ip_address) AS ip_address, a.created_at
  FROM audit_logs a
  LEFT JOIN users u ON u.id = a.actor_user_id`;

const FILTER = `($1::uuid IS NULL OR a.actor_user_id = $1::uuid)
  AND ($2::text IS NULL OR a.action = $2::text)
  AND ($3::text IS NULL OR a.entity_type = $3::text)
  AND ($4::uuid IS NULL OR a.entity_id = $4::uuid)
  AND ($5::date IS NULL OR a.created_at >= ($5::date)::timestamp AT TIME ZONE 'UTC')
  AND ($6::date IS NULL OR a.created_at < (($6::date + 1))::timestamp AT TIME ZONE 'UTC')`;

export interface AuditLogFilter {
  actorUserId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  from?: string;
  to?: string;
}

export interface AuditLogPage {
  rows: AuditLogRow[];
  total: number;
}

export class AuditLogQueries {
  constructor(private readonly db: Queryable) {}

  async findPage(params: AuditLogFilter & { limit: number; offset: number }): Promise<AuditLogPage> {
    const filter = [
      params.actorUserId ?? null,
      params.action ?? null,
      params.entityType ?? null,
      params.entityId ?? null,
      params.from ?? null,
      params.to ?? null,
    ];

    const count = await this.db.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM audit_logs a WHERE ${FILTER}`,
      filter
    );
    const rows = await this.db.query<AuditLogRow>(
      `${SELECT_ENTRY}
       WHERE ${FILTER}
       ORDER BY a.id DESC
       LIMIT $7 OFFSET $8`,
      [...filter, params.limit, params.offset]
    );
    return { rows: rows.rows, total: count.rows[0]?.total ?? 0 };
  }

  async findById(id: string): Promise<AuditLogRow | null> {
    const result = await this.db.query<AuditLogRow>(
      `${SELECT_ENTRY} WHERE a.id = $1::bigint`,
      [id]
    );
    return result.rows[0] ?? null;
  }
}