/**
 * Типы данных комнат.
 * Row — строка базы данных (snake_case); остальные типы — формат API (camelCase).
 */

export interface RoomRow {
  id: string;
  building_id: string;
  room_number: string;
  floor: number;
  capacity: number;
  created_at: Date;
  updated_at: Date;
}

/** Изменяемые поля комнаты (без идентификатора и меток времени) */
export interface RoomValues {
  buildingId: string;
  roomNumber: string;
  floor: number;
  capacity: number;
}

export interface Room extends RoomValues {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export function toRoomValues(row: RoomRow): RoomValues {
  return {
    buildingId: row.building_id,
    roomNumber: row.room_number,
    floor: row.floor,
    capacity: row.capacity,
  };
}

export function toRoom(row: RoomRow): Room {
  return {
    id: row.id,
    ...toRoomValues(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}