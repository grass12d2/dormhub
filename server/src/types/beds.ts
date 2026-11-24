/**
 * Типы данных коек.
 * Row — строка базы данных (snake_case); остальные типы — формат API (camelCase).
 */

export type BedStatus = 'available' | 'maintenance';

export interface BedRow {
  id: string;
  room_id: string;
  bed_number: number;
  status: BedStatus;
  created_at: Date;
  updated_at: Date;
}

/** Изменяемые поля койки (комната не меняется после сообщежития) */
export interface BedValues {
  roomId: string;
  bedNumber: number;
  status: BedStatus;
}

export interface Bed extends BedValues {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export function toBedValues(row: BedRow): BedValues {
  return { roomId: row.room_id, bedNumber: row.bed_number, status: row.status };
}

export function toBed(row: BedRow): Bed {
  return {
    id: row.id,
    ...toBedValues(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}