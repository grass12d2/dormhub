/** Институты университета: код (сохраняется) и полное название (показывается) */

export interface Faculty {
  code: string;
  name: string;
}

export const FACULTIES: Faculty[] = [
  { code: 'ИГД', name: 'Институт графического дизайна' },
  { code: 'ИДК', name: 'Институт дизайна костюма' },
  { code: 'ИДПС', name: 'Институт дизайна пространственной среды' },
  { code: 'ИДИ', name: 'Институт дизайна и искусств' },
  { code: 'ИПИ', name: 'Институт прикладного искусства' },
  { code: 'ИТМ', name: 'Институт текстиля и моды' },
  { code: 'ИПХЭ', name: 'Институт прикладной химии и экологии' },
  { code: 'ИИТА', name: 'Институт информационных технологий и автоматизации' },
  { code: 'ИБК', name: 'Институт бизнес-коммуникаций' },
  { code: 'ИЭСТ', name: 'Институт экономики и социальных технологий' },
  { code: 'ИМТ', name: 'Институт медиатехнологий' },
  { code: 'ИПТО', name: 'Институт полиграфических технологий и оборудования' },
  { code: 'ИЭА', name: 'Институт энергетики и автоматизации' },
  { code: 'ИТ', name: 'Институт технологии' },
  { code: 'ИУЭ', name: 'Институт управления и экономики' },
  { code: 'РИНПО', name: 'Региональный институт непрерывного профессионального образования' },
  { code: 'ИДПО', name: 'Институт дополнительного профессионального образования' },
  { code: 'ИДО', name: 'Институт дистанционного обучения' },
];

/** Подпись для списка и таблицы: «ИИТА — Институт …» */
export function facultyLabel(faculty: Faculty): string {
  return `${faculty.code} — ${faculty.name}`;
}

/** Институт по коду; неизвестный код даёт undefined */
export function findFaculty(code: string | null | undefined): Faculty | undefined {
  return FACULTIES.find((faculty) => faculty.code === code);
}

/** Поиск по коду и названию: все слова запроса должны встретиться */
export function searchFaculties(query: string): Faculty[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return FACULTIES;
  }
  return FACULTIES.filter((faculty) => {
    const text = facultyLabel(faculty).toLowerCase();
    return words.every((word) => text.includes(word));
  });
}