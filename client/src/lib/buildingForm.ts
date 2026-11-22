import type { BuildingInput, BuildingType } from '../api/buildings';

export interface BuildingFormValues {
  buildingNumber: string;
  address: string;
  metroStation: string;
  buildingType: BuildingType;
  floorsCount: string;
  monthlyRate: string;
}

export type BuildingFormErrors = Partial<Record<keyof BuildingFormValues, string>>;

export const EMPTY_BUILDING_FORM: BuildingFormValues = {
  buildingNumber: '',
  address: '',
  metroStation: '',
  buildingType: 'corridor',
  floorsCount: '',
  monthlyRate: '',
};

const isPositiveInt = (text: string) => /^\d+$/.test(text) && Number(text) > 0;

/** Проверка формы на стороне браузера; сервер всё равно проверяет повторно */
export function validateBuildingForm(values: BuildingFormValues): BuildingFormErrors {
  const errors: BuildingFormErrors = {};
  if (!isPositiveInt(values.buildingNumber)) {
    errors.buildingNumber = 'Введите целое число больше нуля';
  }
  if (!values.address.trim()) {
    errors.address = 'Адрес обязателен';
  }
  if (!isPositiveInt(values.floorsCount) || Number(values.floorsCount) > 100) {
    errors.floorsCount = 'Число этажей от 1 до 100';
  }
  const rate = values.monthlyRate.replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(rate) || Number(rate) > 1_000_000) {
    errors.monthlyRate = 'Сумма от 0 до 1 000 000, не более двух знаков после запятой';
  }
  return errors;
}

/** Преобразование заполненной формы в тело запроса */
export function toBuildingInput(values: BuildingFormValues): BuildingInput {
  return {
    buildingNumber: Number(values.buildingNumber),
    address: values.address.trim(),
    metroStation: values.metroStation.trim() || null,
    buildingType: values.buildingType,
    floorsCount: Number(values.floorsCount),
    monthlyRate: Number(values.monthlyRate.replace(',', '.')),
  };
}