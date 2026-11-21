/**
 * Запись в журнал аудита.
 * Вызывается внутри той же транзакции, что и изменение данных:
 * если запись аудита не удалась, изменение откатывается.
 */

import type { Queryable } from '../db/queryable.js';

export interface AuditEntry {
  /** Автор действия; null для действий без пользователя (например, командная строка) */
  actorUserId: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}

export async function writeAuditLog(db: Queryable, entry: AuditEntry): Promise<void> {
  await db.query(
    `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, details, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      entry.actorUserId,
      entry.action,
      entry.entityType ?? null,
      entry.entityId ?? null,
      JSON.stringify(entry.details ?? {}),
      entry.ipAddress ?? null,
    ]
  );
}