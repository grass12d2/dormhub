/**
 * Демонстрационные реквизиты для оплаты проживания. Одинаковы для всех студентов,
 * в базе не хранятся; значения условные и для настоящих переводов не годятся.
 */
export const PAYMENT_DETAILS = {
  recipient: 'Студенческий городок (демо)',
  inn: '0000000000',
  kpp: '000000000',
  account: '40503810000000000000',
  bank: 'Демо-банк',
  bic: '000000000',
  correspondentAccount: '30101810000000000000',
  purpose: 'Оплата проживания в общежитии. Укажите ФИО, номер студенческого и номер счёта',
} as const;

/** Строки «название — значение» для окна оплаты */
export const PAYMENT_ROWS: Array<[string, string]> = [
  ['Получатель', PAYMENT_DETAILS.recipient],
  ['ИНН / КПП', `${PAYMENT_DETAILS.inn} / ${PAYMENT_DETAILS.kpp}`],
  ['Расчётный счёт', PAYMENT_DETAILS.account],
  ['Банк', PAYMENT_DETAILS.bank],
  ['БИК', PAYMENT_DETAILS.bic],
  ['Корр. счёт', PAYMENT_DETAILS.correspondentAccount],
  ['Назначение платежа', PAYMENT_DETAILS.purpose],
];

/** Содержимое QR-кода в формате платёжных QR (ST00012), без суммы — она вводится в приложении банка */
export function paymentQrPayload(): string {
  const d = PAYMENT_DETAILS;
  return [
    'ST00012',
    `Name=${d.recipient}`,
    `PersonalAcc=${d.account}`,
    `BankName=${d.bank}`,
    `BIC=${d.bic}`,
    `CorrespAcc=${d.correspondentAccount}`,
    `PayeeINN=${d.inn}`,
    `KPP=${d.kpp}`,
    `Purpose=${d.purpose}`,
  ].join('|');
}
