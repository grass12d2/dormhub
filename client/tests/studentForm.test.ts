import { describe, expect, it } from 'vitest';
import {
  EMPTY_STUDENT_FORM,
  composeDisplayName,
  groupNameOf,
  groupTitle,
  toStudentInput,
  validateStudentForm,
} from '../src/lib/studentForm';

const valid = {
  ...EMPTY_STUDENT_FORM,
  studentNumber: '2630001',
  displayName: 'Тестов Тест Тестович',
  lastName: 'Тестов',
  firstName: 'Тест',
  middleName: 'Тестович',
  birthDate: '2005-01-01',
  faculty: 'ИИТА',
  groupPrefix: 'МД',
  groupNumber: '7',
  studyYear: '2',
  phone: '+7 900 123-45-67',
  fundingType: 'budget' as const,
};

describe('validateStudentForm', () => {
  it('корректная форма без ошибок', () => {
    expect(validateStudentForm(valid, true)).toEqual({});
  });

  it('пустая форма: номер, имя для показа и дата рождения', () => {
    expect(Object.keys(validateStudentForm(EMPTY_STUDENT_FORM, true)).sort()).toEqual([
      'birthDate',
      'displayName',
      'studentNumber',
    ]);
  });

  it('имя для показа обязательно, ФИО можно не заполнять', () => {
    const noNames = { ...valid, lastName: '', firstName: '', middleName: '' };
    expect(validateStudentForm(noNames, true)).toEqual({});
    expect(validateStudentForm({ ...valid, displayName: '  ' }, true)).toHaveProperty('displayName');
  });

  it.each(['123456', '12345678', '12a4567'])('номер «%s» отклоняется', (studentNumber) => {
    expect(validateStudentForm({ ...valid, studentNumber }, true)).toHaveProperty('studentNumber');
  });

  it.each(['0', '7', 'x'])('курс «%s» отклоняется', (studyYear) => {
    expect(validateStudentForm({ ...valid, studyYear }, true)).toHaveProperty('studyYear');
  });

  it.each([
    ['MD', '7'],
    ['МДД', '7'],
    ['МД', '13'],
    ['МД', '0'],
    ['МД', ''],
    ['', '7'],
  ])('группа «%s» и номер «%s» отклоняются', (groupPrefix, groupNumber) => {
    expect(validateStudentForm({ ...valid, groupPrefix, groupNumber }, true)).toHaveProperty('groupPrefix');
  });

  it('неполный телефон отклоняется, пустой «+7 » допустим', () => {
    expect(validateStudentForm({ ...valid, phone: '+7 900 12' }, true)).toHaveProperty('phone');
    expect(validateStudentForm({ ...valid, phone: '+7 ' }, true)).toEqual({});
  });

  it('неизвестный институт отклоняется', () => {
    expect(validateStudentForm({ ...valid, faculty: 'XYZ' }, true)).toHaveProperty('faculty');
  });

  it('учётная запись проверяется только при создании и только если включена', () => {
    const withAccount = { ...valid, createAccount: true, email: 'bad', password: 'short' };
    expect(Object.keys(validateStudentForm(withAccount, true)).sort()).toEqual(['email', 'password']);
    expect(validateStudentForm(withAccount, false)).toEqual({});
  });
});

describe('имя и группа', () => {
  it('composeDisplayName: ручное значение главнее, иначе собирается из ФИО', () => {
    expect(composeDisplayName(valid)).toBe('Тестов Тест Тестович');
    expect(composeDisplayName({ ...valid, displayName: ' Иван ' })).toBe('Иван');
    expect(composeDisplayName({ ...valid, displayName: '' })).toBe('Тестов Тест Тестович');
  });

  it('название группы и полное название с курсом', () => {
    expect(groupNameOf(valid)).toBe('МД-7');
    expect(groupTitle(2, 'МД-7')).toBe('2-МД-7');
    expect(groupTitle(null, 'МД-7')).toBe('МД-7');
    expect(groupTitle(2, null)).toBe('—');
  });
});

describe('toStudentInput', () => {
  it('собирает тело запроса', () => {
    expect(toStudentInput(valid)).toEqual({
      studentNumber: '2630001',
      displayName: 'Тестов Тест Тестович',
      lastName: 'Тестов',
      firstName: 'Тест',
      middleName: 'Тестович',
      birthDate: '2005-01-01',
      phone: '+7 900 123-45-67',
      faculty: 'ИИТА',
      groupName: 'МД-7',
      studyYear: 2,
      fundingType: 'budget',
    });
  });

  it('имя для показа берётся только из своего поля, обрезаются пробелы', () => {
    const input = toStudentInput({ ...valid, displayName: '  Иван  ', lastName: 'Петров' });
    expect(input.displayName).toBe('Иван');
  });

  it('пустые поля становятся null', () => {
    const input = toStudentInput({
      ...EMPTY_STUDENT_FORM,
      studentNumber: '2630001',
      displayName: 'Имя',
      birthDate: '2005-01-01',
    });
    expect(input).toMatchObject({
      phone: null,
      faculty: null,
      groupName: null,
      studyYear: null,
      lastName: null,
    });
  });
});