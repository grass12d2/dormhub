import type { FundingType, Student, StudentInput } from '../api/students';
import { isPlausibleBirthDate } from './birthDate';
import { findFaculty } from './faculties';
import { isCompletePhone, phoneFromApi, phoneToApi } from './phone';

/** Группа: две заглавные русские буквы, дефис, номер от 1 до 12 (как проверяет сервер) */
export const GROUP_PATTERN = /^[А-ЯЁ]{2}-(?:[1-9]|1[0-2])$/;

export interface StudentFormValues {
    studentNumber: string;
    lastName: string;
    firstName: string;
    middleName: string;
    displayName: string;
    birthDate: string;
    phone: string;
    faculty: string;
    /** Две буквы префикса группы */
    groupPrefix: string;
    /** Номер группы 1–12 */
    groupNumber: string;
    studyYear: string;
    fundingType: FundingType | '';
    createAccount: boolean;
    email: string;
    password: string;
}

export type StudentFormErrors = Partial<Record<keyof StudentFormValues, string>>;

export const EMPTY_STUDENT_FORM: StudentFormValues = {
    studentNumber: '',
    lastName: '',
    firstName: '',
    middleName: '',
    displayName: '',
    birthDate: '',
    phone: '+7 ',
    faculty: '',
    groupPrefix: '',
    groupNumber: '',
    studyYear: '',
    fundingType: '',
    createAccount: false,
    email: '',
    password: '',
};

/** Имя для показа: введённое вручную или «Фамилия Имя Отчество» */
export function composeDisplayName(values: Pick<StudentFormValues, 'lastName' | 'firstName' | 'middleName' | 'displayName'>): string {
    const manual = values.displayName.trim();
    if (manual) {
        return manual;
    }
    return [values.lastName, values.firstName, values.middleName]
        .map((part) => part.trim())
        .filter(Boolean)
        .join(' ');
}

/** Полное название группы для показа: «2-МД-7» (курс, префикс, номер) */
export function groupTitle(year: number | null, groupName: string | null): string {
    if (!groupName) {
        return '—';
    }
    return year ? `${year}-${groupName}` : groupName;
}

export function formFromStudent(s: Student): StudentFormValues {
    const match = /^([А-ЯЁ]{2})-(\d{1,2})$/.exec(s.groupName ?? '');
    return {
        ...EMPTY_STUDENT_FORM,
        studentNumber: s.studentNumber,
        lastName: s.lastName ?? '',
        firstName: s.firstName ?? '',
        middleName: s.middleName ?? '',
        displayName: s.displayName,
        birthDate: s.birthDate,
        phone: phoneFromApi(s.phone),
        faculty: s.faculty ?? '',
        groupPrefix: match?.[1] ?? '',
        groupNumber: match?.[2] ?? '',
        studyYear: s.studyYear === null ? '' : String(s.studyYear),
        fundingType: s.fundingType ?? '',
    };
}

/** Название группы из двух полей; пустая строка, если не заполнено */
export function groupNameOf(values: Pick<StudentFormValues, 'groupPrefix' | 'groupNumber'>): string {
    return values.groupPrefix && values.groupNumber ? `${values.groupPrefix}-${values.groupNumber}` : '';
}

/** Проверка в браузере; сервер проверяет повторно. isNew включает проверку учётной записи */
export function validateStudentForm(values: StudentFormValues, isNew: boolean): StudentFormErrors {
    const errors: StudentFormErrors = {};
    if (!/^\d{7}$/.test(values.studentNumber)) {
        errors.studentNumber = 'Номер студенческого: ровно 7 цифр';
    }
    if (!values.displayName.trim()) {
        errors.displayName = 'Имя для показа обязательно';
    }
    if (!values.birthDate || !isPlausibleBirthDate(values.birthDate)) {
        errors.birthDate = 'Выберите дату рождения';
    }
    if (values.phone !== '+7 ' && !isCompletePhone(values.phone)) {
        errors.phone = 'Введите номер полностью: +7 900 123-45-67';
    }
    if (values.faculty && !findFaculty(values.faculty)) {
        errors.faculty = 'Выберите институт из списка';
    }
    const group = groupNameOf(values);
    if (values.groupPrefix || values.groupNumber) {
        if (!GROUP_PATTERN.test(group)) {
            errors.groupPrefix = 'Группа: две русские буквы и номер от 1 до 12, например МД-7';
        }
    }
    if (values.studyYear && (!/^[1-6]$/.test(values.studyYear))) {
        errors.studyYear = 'Курс от 1 до 6';
    }
    if (isNew && values.createAccount) {
        if (!/^\S+@\S+\.\S+$/.test(values.email.trim())) {
            errors.email = 'Введите корректный email';
        }
        if (values.password.length < 10) {
            errors.password = 'Пароль не короче 10 символов';
        }
    }
    return errors;
}

const orNull = (text: string) => text.trim() || null;

export function toStudentInput(values: StudentFormValues): StudentInput {
    const group = groupNameOf(values);
    return {
        studentNumber: values.studentNumber,
            displayName: values.displayName.trim(),
        lastName: orNull(values.lastName),
        firstName: orNull(values.firstName),
        middleName: orNull(values.middleName),
        birthDate: values.birthDate,
        phone: phoneToApi(values.phone),
        faculty: values.faculty || null,
        groupName: group || null,
        studyYear: values.studyYear ? Number(values.studyYear) : null,
        fundingType: values.fundingType || null,
    };
}