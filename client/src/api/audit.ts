import { buildQuery, type PageMeta } from './client';
import { api } from './index';

export interface AuditEntry {
  id: number;
  actorEmail: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  details: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: string;
}

export interface AuditPage {
  items: AuditEntry[];
  meta: PageMeta;
}

export async function listAudit(params: {
  action: string;
  from: string;
  to: string;
  limit: number;
  offset: number;
}): Promise<AuditPage> {
  const response = await api.get<AuditEntry[]>(`/audit-logs${buildQuery(params)}`);
  return {
    items: response.data,
    meta: response.meta ?? { total: response.data.length, limit: params.limit, offset: params.offset },
  };
}