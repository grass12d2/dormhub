/**
 * Сервис чтения журнала аудита.
 * Журнал неизменяем, поэтому сервис только читает; чтение записей в журнал не попадает.
 */

import type { Pool } from 'pg';
import { AuditLogQueries } from '../db/queries/audit-logs.js';
import { toAuditLogEntry, type AuditLogEntry } from '../types/audit.js';
import { NotFoundError } from '../utils/errors.js';
import { PERSONAL_ACTIONS, type ListAuditLogsQuery } from '../validation/audit.validation.js';

export interface AuditLogsPage {
  items: AuditLogEntry[];
  total: number;
  limit: number;
  offset: number;
}

export class AuditLogsService {
  constructor(private readonly pool: Pool) {}

  async list(query: ListAuditLogsQuery): Promise<AuditLogsPage> {
    const { scope, ...filter } = query;
    const page = await new AuditLogQueries(this.pool).findPage({
      ...filter,
      excludeActions: scope === 'activity' ? PERSONAL_ACTIONS : [],
    });
    return {
      items: page.rows.map(toAuditLogEntry),
      total: page.total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async get(id: string): Promise<AuditLogEntry> {
    const row = await new AuditLogQueries(this.pool).findById(id);
    if (!row) {
      throw new NotFoundError('Запись журнала не найдена');
    }
    return toAuditLogEntry(row);
  }
}