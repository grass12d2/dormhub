/** Форма объявления: проверка в браузере и преобразование в тело запроса */

import type { AnnouncementInput, AnnouncementTarget } from '../api/announcements';

export type ScopeKind = 'all' | 'building' | 'floor' | 'room';

/** Одна строка адресата в форме */
export interface TargetRow {
  kind: Exclude<ScopeKind, 'all'>;
  buildingId: string;
  floor: string;
  roomId: string;
}

export interface AnnouncementFormValues {
  title: string;
  body: string;
  /** Пустой список — для всех */
  targets: TargetRow[];
  /** Дата окончания в формате ГГГГ-ММ-ДД или пусто */
  expiresOn: string;
}

export type AnnouncementFormErrors = Partial<Record<'title' | 'body' | 'targets' | 'expiresOn', string>>;

export const EMPTY_ANNOUNCEMENT_FORM: AnnouncementFormValues = {
  title: '',
  body: '',
  targets: [],
  expiresOn: '',
};

export const newTargetRow = (kind: TargetRow['kind'] = 'building'): TargetRow => ({
  kind,
  buildingId: '',
  floor: '',
  roomId: '',
});

export function validateAnnouncementForm(v: AnnouncementFormValues, today = new Date()): AnnouncementFormErrors {
  const errors: AnnouncementFormErrors = {};
  if (!v.title.trim()) errors.title = 'Заголовок обязателен';
  else if (v.title.trim().length > 200) errors.title = 'Не более 200 символов';
  if (!v.body.trim()) errors.body = 'Текст обязателен';
  else if (v.body.trim().length > 5000) errors.body = 'Не более 5000 символов';

  for (const row of v.targets) {
    if (row.kind === 'room' ? !row.roomId : !row.buildingId) {
      errors.targets = 'Заполните все адреса или удалите лишние';
      break;
    }
    if (row.kind === 'floor' && !/^\d+$/.test(row.floor)) {
      errors.targets = 'Укажите этаж числом';
      break;
    }
  }
  if (v.expiresOn) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.expiresOn)) errors.expiresOn = 'Неверная дата';
    else if (v.expiresOn < today.toISOString().slice(0, 10)) errors.expiresOn = 'Дата уже прошла';
  }
  return errors;
}

/** Срок действует до конца указанного дня (по московскому времени) */
export function expiresAtOf(expiresOn: string): string | null {
  return expiresOn ? `${expiresOn}T23:59:59+03:00` : null;
}

export function toAnnouncementInput(v: AnnouncementFormValues): AnnouncementInput {
  const targets: AnnouncementTarget[] = v.targets.map((row) =>
    row.kind === 'room'
      ? { roomId: row.roomId }
      : row.kind === 'floor'
        ? { buildingId: row.buildingId, floor: Number(row.floor) }
        : { buildingId: row.buildingId }
  );
  return { title: v.title.trim(), body: v.body.trim(), targets, expiresAt: expiresAtOf(v.expiresOn) };
}

/** Обратное преобразование для редактирования; room-адрес не знает здание, поэтому оно подставляется отдельно */
export function targetsToRows(targets: AnnouncementTarget[]): TargetRow[] {
  return targets.map((t) =>
    'roomId' in t
      ? { kind: 'room', buildingId: '', floor: '', roomId: t.roomId }
      : t.floor !== undefined
        ? { kind: 'floor', buildingId: t.buildingId, floor: String(t.floor), roomId: '' }
        : { kind: 'building', buildingId: t.buildingId, floor: '', roomId: '' }
  );
}

/** Описание адресата для таблицы */
export function describeTargets(
  targets: AnnouncementTarget[],
  buildingNumber: (id: string) => string,
  roomLabel: (id: string) => string
): string {
  if (targets.length === 0) return 'Все';
  return targets
    .map((t) =>
      'roomId' in t
        ? `Комната ${roomLabel(t.roomId)}`
        : t.floor !== undefined
          ? `Здание ${buildingNumber(t.buildingId)}, этаж ${t.floor}`
          : `Здание ${buildingNumber(t.buildingId)}`
    )
    .join('; ');
}