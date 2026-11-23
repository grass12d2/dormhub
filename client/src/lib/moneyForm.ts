/** Проверка денежных сумм и форм счетов и платежей в браузере; сервер проверяет повторно */

const MAX_MONEY = 1_000_000;

/** Сумма из текста («750,5» → 750.5); null, если формат неверный, ноль или больше предела */
export function parseMoney(text: string): number | null {
  const value = text.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(value)) {
    return null;
  }
  const number = Number(value);
  return number > 0 && number <= MAX_MONEY ? number : null;
}

export interface InvoiceFormValues {
  contractId: string;
  description: string;
  amount: string;
  dueDate: string;
}
export type InvoiceFormErrors = Partial<Record<keyof InvoiceFormValues, string>>;

export const EMPTY_INVOICE_FORM: InvoiceFormValues = { contractId: '', description: '', amount: '', dueDate: '' };

export function validateInvoiceForm(v: InvoiceFormValues): InvoiceFormErrors {
  const errors: InvoiceFormErrors = {};
  if (!v.contractId) errors.contractId = 'Выберите договор';
  if (!v.description.trim()) errors.description = 'Описание обязательно';
  if (parseMoney(v.amount) === null) errors.amount = 'Сумма больше 0 и не более 1 000 000, до двух знаков после запятой';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.dueDate)) errors.dueDate = 'Укажите срок оплаты';
  return errors;
}

/** Платёж не может превышать остаток по счёту (сравнение в копейках) */
export function validatePaymentAmount(text: string, remaining: number): string | null {
  const amount = parseMoney(text);
  if (amount === null) return 'Сумма больше 0, до двух знаков после запятой';
  if (Math.round(amount * 100) > Math.round(remaining * 100)) return 'Сумма превышает остаток по счёту';
  return null;
}