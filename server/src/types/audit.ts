/**
 * Типы данных журнала аудита.
 * Row — строка базы данных (snake_case); остальные типы — формат API (camelCase).
 */

export interface AuditLogRow {
  /** bigint приходит строкой */
  id: string;
  actor_user_id: string | null;
  actor_email: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown>;
  /** Адрес без маски сети (host(inet)) */
  ip_address: string | null;
  created_at: Date;
}

export interface AuditLogEntry {
  id: number;
  actorUserId: string | null;
  actorEmail: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  details: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: Date;
}

export function toAuditLogEntry(row: AuditLogRow): AuditLogEntry {
  return {
    id: Number(row.id),
    actorUserId: row.actor_user_id,
    actorEmail: row.actor_email,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    details: row.details,
    ipAddress: row.ip_address,
    createdAt: row.created_at,
  };
}