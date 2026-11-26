import { describe, expect, it } from 'vitest';
import { FACULTIES, facultyLabel, facultyShort, findFaculty, searchFaculties } from '../src/lib/faculties';

describe('институты', () => {
  it('их семнадцать, коды уникальны, названия заполнены', () => {
    expect(FACULTIES).toHaveLength(17);
    expect(new Set(FACULTIES.map((f) => f.code)).size).toBe(17);
    for (const faculty of FACULTIES) {
      expect(faculty.name.length).toBeGreaterThan(5);
    }
  });

  it('поиск по коду и по словам названия, регистр не важен', () => {
    expect(searchFaculties('ииТа').map((f) => f.code)).toContain('ИИТА');
    expect(searchFaculties('дизайн').map((f) => f.code)).toEqual(['ИГД', 'ИДК', 'ИДПС', 'ИДИ']);
    expect(searchFaculties('')).toHaveLength(17);
    expect(searchFaculties('несуществующее')).toEqual([]);
  });

  it('код находит институт; подпись содержит код и название', () => {
    const faculty = findFaculty('ИТМ');
    expect(faculty?.name).toBe('Институт текстиля и моды');
    expect(facultyLabel(faculty!)).toBe('ИТМ — Институт текстиля и моды');
    expect(findFaculty('XYZ')).toBeUndefined();
    expect(findFaculty(null)).toBeUndefined();
  });
});
describe('facultyShort', () => {
  it('код из справочника остаётся, полное название сокращается до кода', () => {
    expect(facultyShort('ИИТА')).toBe('ИИТА');
    expect(facultyShort('Институт информационных технологий и автоматизации')).toBe('ИИТА');
  });

  it('названия вне справочника — по первым буквам значимых слов', () => {
    expect(facultyShort('Факультет компьютерных наук')).toBe('ФКН');
    expect(facultyShort('Факультет экономики')).toBe('ФЭ');
    expect(facultyShort('  ')).toBe('');
    expect(facultyShort(null)).toBe('');
  });
});
