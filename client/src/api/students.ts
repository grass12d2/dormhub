import { buildQuery, type PageMeta } from './client';
import { api } from './index';

export type FundingType = 'budget' | 'paid' | 'scholarship';

export interface Student {
    id: string;
    userId: string | null;
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

export interface StudentInput {
    studentNumber: string;
    displayName: string;
    lastName: string | null;
    firstName: string | null;
    middleName: string | null;
    birthDate: string;
    phone: string | null;
    faculty: string | null;
    groupName: string | null;
    studyYear: number | null;
    fundingType: FundingType | null;
}

export const FUNDING_LABELS: Record<FundingType, string> = {
    budget: 'Бюджет',
    paid: 'Платное',
    scholarship: 'Стипендия',
};

export interface StudentPage {
    items: Student[];
    meta: PageMeta;
}

export async function listStudents(params: {
  q: string;
  faculty: string;
  groupName: string;
  limit: number;
  offset: number;
}): Promise<StudentPage> {
  const response = await api.get<Student[]>(`/students${buildQuery(params)}`);
  return {
    items: response.data,
    meta: response.meta ?? { total: response.data.length, limit: params.limit, offset: params.offset },
  };
}

/** Создание; account необязателен: тогда создаётся и учётная запись студента */
export const createStudent = async (
    input: StudentInput,
    account?: { email: string; password: string }
) => (await api.post<Student>('/students', account ? { ...input, account } : input)).data;

/** PATCH меняет только переданные поля; null очищает необязательные */
export const updateStudent = async (id: string, input: StudentInput) =>
    (await api.patch<Student>(`/students/${id}`, input)).data;

export const deleteStudent = async (id: string) => (await api.delete(`/students/${id}`)).data;