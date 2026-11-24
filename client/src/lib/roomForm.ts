import type { RoomInput } from '../api/rooms';

export interface RoomFormValues {
  buildingId: string;
  roomNumber: string;
  floor: string;
  capacity: string;
}

export type RoomFormErrors = Partial<Record<keyof RoomFormValues, string>>;

export const EMPTY_ROOM_FORM: RoomFormValues = {
  buildingId: '',
  roomNumber: '',
  floor: '',
  capacity: '3',
};

/**
 * Проверка формы в браузере; формат номера комнаты проверяет сервер
 * (он зависит от типа общежития). floorsCount — число этажей выбранного общежития.
 */
export function validateRoomForm(values: RoomFormValues, floorsCount?: number): RoomFormErrors {
  const errors: RoomFormErrors = {};
  if (!values.buildingId) {
    errors.buildingId = 'Выберите общежитие';
  }
  const number = values.roomNumber.trim();
  if (!number || number.length > 20) {
    errors.roomNumber = 'Номер комнаты обязателен, не длиннее 20 символов';
  }
  const floor = Number(values.floor);
  if (!/^\d+$/.test(values.floor) || floor < 2) {
    errors.floor = 'Жилые комнаты есть только со второго этажа';
  } else if (floorsCount !== undefined && floor > floorsCount) {
    errors.floor = `В здании всего ${floorsCount} эт.`;
  }
  if (!/^\d+$/.test(values.capacity) || Number(values.capacity) < 2 || Number(values.capacity) > 4) {
    errors.capacity = 'Вместимость от 2 до 4';
  }
  return errors;
}

export function toRoomInput(values: RoomFormValues): RoomInput {
  return {
    buildingId: values.buildingId,
    roomNumber: values.roomNumber.trim(),
    floor: Number(values.floor),
    capacity: Number(values.capacity),
  };
}