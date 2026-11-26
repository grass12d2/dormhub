import { api } from './index';

export interface BuildingLoad {
  buildingId: string;
  buildingNumber: number;
  beds: number;
  occupied: number;
}

export interface DashboardSummary {
  students: number;
  residents: number;
  freeBeds: number;
  debt: number;
  buildings: BuildingLoad[];
  finance: { paid: number; outstanding: number; overdueInvoices: number; totalInvoices: number };
}

export interface AuditEntry {
  id: number;
  actorEmail: string | null;
  action: string;
  createdAt: string;
}

export async function fetchSummary(): Promise<DashboardSummary> {
  return (await api.get<DashboardSummary>('/dashboard/summary')).data;
}

export async function fetchRecentActivity(): Promise<AuditEntry[]> {
  return (await api.get<AuditEntry[]>('/audit-logs?limit=10&scope=activity')).data;
}