import { buildQuery } from './client';
import { api } from './index';

export type BedStatus = 'available' | 'maintenance';

export interface Bed {
  id: string;
  roomId: string;
  bedNumber: number;
  status: BedStatus;
}

export const BED_STATUS_LABELS: Record<BedStatus, string> = {
  available: 'Доступна',
  maintenance: 'Обслуживание',
};

export const listBeds = async (roomId?: string) =>
  (await api.get<Bed[]>(`/beds${buildQuery({ roomId })}`)).data;
export const createBed = async (roomId: string, bedNumber: number) =>
  (await api.post<Bed>('/beds', { roomId, bedNumber })).data;
export const setBedStatus = async (id: string, status: BedStatus) =>
  (await api.patch<Bed>(`/beds/${id}`, { status })).data;
export const deleteBed = async (id: string) => (await api.delete(`/beds/${id}`)).data;