import { describe, expect, it } from 'vitest';
import {
  EMPTY_ANNOUNCEMENT_FORM,
  describeTargets,
  newTargetRow,
  targetsToRows,
  toAnnouncementInput,
  validateAnnouncementForm,
} from '../src/lib/announcementForm';

const today = new Date('2026-11-23T12:00:00Z');
const valid = { ...EMPTY_ANNOUNCEMENT_FORM, title: ' Уборка ', body: '<p>Текст</p>' }

describe('validateAnnouncementForm', () => {
  it('корректная форма без адресатов — для всех', () => {
    expect(validateAnnouncementForm(valid, today)).toEqual({});
  });

  it('пустая форма: заголовок и текст', () => {
    expect(Object.keys(validateAnnouncementForm(EMPTY_ANNOUNCEMENT_FORM, today)).sort()).toEqual(['body', 'title']);
  });

  it('неполный адрес и этаж не числом отклоняются', () => {
    expect(validateAnnouncementForm({ ...valid, targets: [newTargetRow('building')] }, today)).toHaveProperty('targets');
    expect(
      validateAnnouncementForm({ ...valid, targets: [{ ...newTargetRow('floor'), buildingId: 'b', floor: 'x' }] }, today)
    ).toHaveProperty('targets');
    expect(
      validateAnnouncementForm({ ...valid, targets: [{ ...newTargetRow('room'), roomId: 'r' }] }, today)
    ).toEqual({});
  });

  it('прошедшая дата отклоняется, сегодняшняя допустима', () => {
    expect(validateAnnouncementForm({ ...valid, expiresOn: '2026-11-22' }, today)).toHaveProperty('expiresOn');
    expect(validateAnnouncementForm({ ...valid, expiresOn: '2026-11-23' }, today)).toEqual({});
  });
});

describe('преобразования', () => {
  it('тело запроса: обрезка, три вида адресов, срок до конца дня', () => {
    const input = toAnnouncementInput({
      ...valid,
      expiresOn: '2026-12-01',
      targets: [
        { kind: 'building', buildingId: 'b1', floor: '', roomId: '' },
        { kind: 'floor', buildingId: 'b2', floor: '5', roomId: '' },
        { kind: 'room', buildingId: 'b3', floor: '', roomId: 'r1' },
      ],
    });
    expect(input).toEqual({
      title: 'Уборка',
      bodyHtml: '<p>Текст</p>',
      targets: [{ buildingId: 'b1' }, { buildingId: 'b2', floor: 5 }, { roomId: 'r1' }],
      expiresAt: '2026-12-01T23:59:59+03:00',
    });
  });

  it('адреса обратимы, описание понятное', () => {
    const rows = targetsToRows([{ buildingId: 'b1' }, { buildingId: 'b2', floor: 5 }, { roomId: 'r1' }]);
    expect(rows.map((r) => r.kind)).toEqual(['building', 'floor', 'room']);
    const text = describeTargets([{ buildingId: 'b1' }, { buildingId: 'b2', floor: 5 }, { roomId: 'r1' }], (id) => id.toUpperCase(), (id) => id);
    expect(text).toBe('Здание B1; Здание B2, этаж 5; Комната r1');
    expect(describeTargets([], String, String)).toBe('Все');
  });
});