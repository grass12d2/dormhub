/**
 * Типы данных студентов.
 * Row — строка базы данных (snake_case); остальные типы — формат API (camelCase).
 */

export type FundingType = 'budget' | 'paid' | 'scholarship';

export interface StudentRow {
  id: string;
  user_id: string | null;
  student_number: string;
  display_name: string;
  last_name: string | null;
  first_name: string | null;
  middle_name: string | null;
  /** Строка ГГГГ-ММ-ДД: в SQL дата приведена к тексту, чтобы избежать сдвига часового пояса */
  birth_date: string;
  phone: string | null;
  faculty: string | null;
  group_name: string | null;
  education_level: string | null;
  field_of_study: string | null;
  program_code: string | null;
  specialization: string | null;
  study_year: number | null;
  funding_type: FundingType | null;
  created_at: Date;
  updated_at: Date;
}

/** Изменяемые поля студента (связь с учётной записью после создания не меняется) */
export interface StudentValues {
  studentNumber: string;
  displayName: string;
  lastName: string | null;
  firstName: string | null;
  middleName: string | null;
  birthDate: string;
  phone: string | null;
  faculty: string | null;
  groupName: string | null;
  educationLevel: string | null;
  fieldOfStudy: string | null;
  programCode: string | null;
  specialization: string | null;
  studyYear: number | null;
  fundingType: FundingType | null;
}

export interface Student extends StudentValues {
  id: string;
  userId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toStudentValues(row: StudentRow): StudentValues {
  return {
    studentNumber: row.student_number,
    displayName: row.display_name,
    lastName: row.last_name,
    firstName: row.first_name,
    middleName: row.middle_name,
    birthDate: row.birth_date,
    phone: row.phone,
    faculty: row.faculty,
    groupName: row.group_name,
    educationLevel: row.education_level,
    fieldOfStudy: row.field_of_study,
    programCode: row.program_code,
    specialization: row.specialization,
    studyYear: row.study_year,
    fundingType: row.funding_type,
  };
}

export function toStudent(row: StudentRow): Student {
  return {
    id: row.id,
    userId: row.user_id,
    ...toStudentValues(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}