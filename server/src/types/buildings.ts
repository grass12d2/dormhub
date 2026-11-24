/**
 * Типы данных общежитий общежития и их сотрудников.
 * Row — строка базы данных (snake_case); остальные типы — формат API (camelCase).
 */

export type BuildingType = 'corridor' | 'block' | 'apartment';

export interface BuildingRow {
  id: string;
  building_number: number;
  address: string;
  metro_station: string | null;
  building_type: BuildingType;
  floors_count: number;
  /** numeric приходит из драйвера строкой, например «700.00» */
  monthly_rate: string;
  created_at: Date;
  updated_at: Date;
}

/** Изменяемые поля общежития (без идентификатора и меток времени) */
export interface BuildingValues {
  buildingNumber: number;
  address: string;
  metroStation: string | null;
  buildingType: BuildingType;
  floorsCount: number;
  monthlyRate: number;
}

export interface Building extends BuildingValues {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface StaffRow {
  id: string;
  building_id: string;
  job_title: string;
  full_name: string;
  phone: string | null;
  created_at: Date;
  updated_at: Date;
}

/** Изменяемые поля сотрудника */
export interface StaffValues {
  jobTitle: string;
  fullName: string;
  phone: string | null;
}

export interface StaffMember extends StaffValues {
  id: string;
  buildingId: string;
  createdAt: Date;
  updatedAt: Date;
}

export function toBuildingValues(row: BuildingRow): BuildingValues {
  return {
    buildingNumber: row.building_number,
    address: row.address,
    metroStation: row.metro_station,
    buildingType: row.building_type,
    floorsCount: row.floors_count,
    monthlyRate: Number(row.monthly_rate),
  };
}

export function toBuilding(row: BuildingRow): Building {
  return {
    id: row.id,
    ...toBuildingValues(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toStaffValues(row: StaffRow): StaffValues {
  return { jobTitle: row.job_title, fullName: row.full_name, phone: row.phone };
}

export function toStaffMember(row: StaffRow): StaffMember {
  return {
    id: row.id,
    buildingId: row.building_id,
    ...toStaffValues(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}