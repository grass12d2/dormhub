import { describe, expect, it } from 'vitest';
import { FACULTIES, facultyLabel, findFaculty, searchFaculties } from '../src/lib/faculties';

describe('институты', () => {
  it('их восемнадцать, коды уникальны, названия заполнены', () => {
    expect(FACULTIES).toHaveLength(18);
    expect(new Set(FACULTIES.map((f) => f.code)).size).toBe(18);
    for (const faculty of FACULTIES) {
      expect(faculty.name.length).toBeGreaterThan(5);
    }
  });

  it('поиск по коду и по словам названия, регистр не важен', () => {
    expect(searchFaculties('ииТа').map((f) => f.code)).toContain('ИИТА');
    expect(searchFaculties('дизайн').map((f) => f.code)).toEqual(['ИГД', 'ИДК', 'ИДПС', 'ИДИ']);
    expect(searchFaculties('')).toHaveLength(18);
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