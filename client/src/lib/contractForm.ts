export interface ContractFormValues {
  studentId: string;
  buildingId: string;
  roomId: string;
  bedId: string;
  startDate: string;
  endDate: string;
  monthlyRate: string;
}

export type ContractFormErrors = Partial<Record<keyof ContractFormValues, string>>;

export const EMPTY_CONTRACT_FORM: ContractFormValues = {
  studentId: '',
  buildingId: '',
  roomId: '',
  bedId: '',
  startDate: '',
  endDate: '',
  monthlyRate: '',
};

/** Проверка формы в браузере; сервер проверяет повторно (занятость койки, пересечения) */
export function validateContractForm(v: ContractFormValues): ContractFormErrors {
  const errors: ContractFormErrors = {};
  if (!v.studentId) errors.studentId = 'Выберите студента';
  if (!v.bedId) errors.bedId = 'Выберите койку';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.startDate)) errors.startDate = 'Укажите дату начала';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.endDate)) {
    errors.endDate = 'Укажите дату окончания';
  } else if (v.startDate && v.endDate <= v.startDate) {
    errors.endDate = 'Дата окончания должна быть позже даты начала';
  }
  if (v.monthlyRate.trim()) {
    const rate = v.monthlyRate.replace(',', '.');
    if (!/^\d+(\.\d{1,2})?$/.test(rate) || Number(rate) > 1_000_000) {
      errors.monthlyRate = 'Сумма до 1 000 000, не более двух знаков после запятой';
    }
  }
  return errors;
}

/** Ставка необязательна: пустое поле означает ставку общежития */
export function rateOrUndefined(text: string): number | undefined {
  return text.trim() ? Number(text.replace(',', '.')) : undefined;
}