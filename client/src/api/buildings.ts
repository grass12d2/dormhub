import { api } from './index';

export type BuildingType = 'corridor' | 'block' | 'apartment';

export interface Building {
  id: string;
  buildingNumber: number;
  address: string;
  metroStation: string | null;
  buildingType: BuildingType;
  floorsCount: number;
  monthlyRate: number;
}

export interface BuildingInput {
  buildingNumber: number;
  address: string;
  metroStation: string | null;
  buildingType: BuildingType;
  floorsCount: number;
  monthlyRate: number;
}

export interface Staff {
  id: string;
  buildingId: string;
  jobTitle: string;
  fullName: string;
  phone: string | null;
}

export interface StaffInput {
  jobTitle: string;
  fullName: string;
  phone: string | null;
}

export const BUILDING_TYPE_LABELS: Record<BuildingType, string> = {
  corridor: 'Коридорный',
  block: 'Блочный',
  apartment: 'Квартирный',
};

export const listBuildings = async () => (await api.get<Building[]>('/buildings')).data;
export const createBuilding = async (input: BuildingInput) =>
  (await api.post<Building>('/buildings', input)).data;
/** PUT заменяет все поля, поэтому отправляется полный набор */
export const updateBuilding = async (id: string, input: BuildingInput) =>
  (await api.put<Building>(`/buildings/${id}`, input)).data;
export const deleteBuilding = async (id: string) => (await api.delete(`/buildings/${id}`)).data;

export const listStaff = async (buildingId: string) =>
  (await api.get<Staff[]>(`/buildings/${buildingId}/staff`)).data;
export const createStaff = async (buildingId: string, input: StaffInput) =>
  (await api.post<Staff>(`/buildings/${buildingId}/staff`, input)).data;
export const deleteStaff = async (buildingId: string, staffId: string) =>
  (await api.delete(`/buildings/${buildingId}/staff/${staffId}`)).data;