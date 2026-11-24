import { buildQuery } from './client';
import { api } from './index';

export interface Room {
  id: string;
  buildingId: string;
  roomNumber: string;
  floor: number;
  capacity: number;
}

export interface RoomInput {
  buildingId: string;
  roomNumber: string;
  floor: number;
  capacity: number;
}

/** Все комнаты или комнаты одного общежития */
export const listRooms = async (buildingId?: string) =>
  (await api.get<Room[]>(`/rooms${buildQuery({ buildingId })}`)).data;
export const createRoom = async (input: RoomInput) => (await api.post<Room>('/rooms', input)).data;
/** PUT заменяет все поля, поэтому отправляется полный набор */
export const updateRoom = async (id: string, input: RoomInput) =>
  (await api.put<Room>(`/rooms/${id}`, input)).data;
export const deleteRoom = async (id: string) => (await api.delete(`/rooms/${id}`)).data;