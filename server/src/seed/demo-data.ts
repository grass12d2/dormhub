/**
 * Демонстрационные данные: здания, сотрудники, студенты, договоры и счета.
 *
 * Все имена, телефоны и адреса электронной почты вымышленные
 * (домен example.com зарезервирован для примеров).
 * Состав зданий соответствует утверждённой таблице: 6 зданий,
 * 1412 жилых комнат и 3936 коек. Модуль только описывает данные и не работает с базой.
 */

import type { BuildingType } from '../types/buildings.js';
import type { PaymentMethod } from '../types/payments.js';
import type { FundingType, StudentValues } from '../types/students.js';

/** Первый этаж занят службами общежития, жилые комнаты есть только со второго */
export const FIRST_RESIDENTIAL_FLOOR = 2;

/** Способ нумерации комнат в здании */
export type RoomLayout =
    /** Этаж и две цифры: 201, 1001 */
    | { kind: 'sequential'; roomsPerFloor: number }
    /** Этаж-блок-комната: 7-3-2 */
    | { kind: 'blockDashed'; blocksPerFloor: number; roomsPerBlock: number }
    /** Этаж, блок и комната слитно: 643 */
    | { kind: 'blockCompact'; blocksPerFloor: number; roomsPerBlock: number };

export interface DemoBuilding {
    buildingNumber: number;
    address: string;
    metroStation: string;
    buildingType: BuildingType;
    floorsCount: number;
    monthlyRate: number;
    roomCapacity: number;
    layout: RoomLayout;
}

export const DEMO_BUILDINGS: DemoBuilding[] = [
    {
        buildingNumber: 1,
        address: 'ул. Руднева, д. 6',
        metroStation: 'Озерки',
        buildingType: 'corridor',
        floorsCount: 16,
        monthlyRate: 700,
        roomCapacity: 3,
        layout: { kind: 'sequential', roomsPerFloor: 20 },
    },
    {
        buildingNumber: 2,
        address: 'пр. Художников, д. 16',
        metroStation: 'Озерки',
        buildingType: 'corridor',
        floorsCount: 12,
        monthlyRate: 700,
        roomCapacity: 4,
        layout: { kind: 'sequential', roomsPerFloor: 24 },
    },
    {
        buildingNumber: 3,
        address: 'пр. Ударников, д. 29, к. 1',
        metroStation: 'Ладожская',
        buildingType: 'block',
        floorsCount: 16,
        monthlyRate: 900,
        roomCapacity: 2,
        layout: { kind: 'blockDashed', blocksPerFloor: 4, roomsPerBlock: 5 },
    },
    {
        buildingNumber: 4,
        address: 'ул. Звездная, д. 7',
        metroStation: 'Звездная',
        buildingType: 'block',
        floorsCount: 12,
        monthlyRate: 900,
        roomCapacity: 2,
        layout: { kind: 'blockCompact', blocksPerFloor: 4, roomsPerBlock: 6 },
    },
    {
        buildingNumber: 5,
        address: 'ул. Трефолева, д. 37',
        metroStation: 'Нарвская',
        buildingType: 'apartment',
        floorsCount: 10,
        monthlyRate: 1200,
        roomCapacity: 3,
        layout: { kind: 'sequential', roomsPerFloor: 12 },
    },
    {
        buildingNumber: 6,
        address: 'ул. Ленская, д. 14',
        metroStation: 'Ладожская',
        buildingType: 'apartment',
        floorsCount: 12,
        monthlyRate: 1200,
        roomCapacity: 3,
        layout: { kind: 'sequential', roomsPerFloor: 16 },
    },
];

export interface PlannedRoom {
    floor: number;
    roomNumber: string;
    capacity: number;
}

/** Все жилые комнаты здания: со второго этажа до последнего */
export function planRooms(building: DemoBuilding): PlannedRoom[] {
    const { layout, roomCapacity: capacity } = building;
    const rooms: PlannedRoom[] = [];

    for (let floor = FIRST_RESIDENTIAL_FLOOR; floor <= building.floorsCount; floor++) {
        if (layout.kind === 'sequential') {
            for (let room = 1; room <= layout.roomsPerFloor; room++) {
                rooms.push({ floor, roomNumber: String(floor * 100 + room), capacity });
            }
            continue;
        }
        for (let block = 1; block <= layout.blocksPerFloor; block++) {
            for (let room = 1; room <= layout.roomsPerBlock; room++) {
                const roomNumber =
                    layout.kind === 'blockDashed' ? `${floor}-${block}-${room}` : `${floor}${block}${room}`;
                rooms.push({ floor, roomNumber, capacity });
            }
        }
    }
    return rooms;
}

const pad2 = (value: number): string => String(value).padStart(2, '0');

export interface DemoStaff {
    buildingNumber: number;
    jobTitle: string;
    fullName: string;
    phone: string;
}

const COMMANDANTS = [
    'Примеров Алексей Сергеевич',
    'Образцова Марина Ивановна',
    'Шаблонов Дмитрий Петрович',
    'Макетова Ольга Николаевна',
    'Демонов Сергей Андреевич',
    'Тестова Елена Викторовна',
];

const WATCHMEN = [
    'Условный Николай Павлович',
    'Условная Татьяна Михайловна',
    'Вымышленов Игорь Олегович',
    'Вымышленова Галина Юрьевна',
    'Пробный Виктор Степанович',
    'Пробная Светлана Аркадьевна',
];

/** По два сотрудника на здание: комендант и вахтёр */
export const DEMO_STAFF: DemoStaff[] = DEMO_BUILDINGS.flatMap((building, index) => [
    {
        buildingNumber: building.buildingNumber,
        jobTitle: 'Комендант',
        fullName: COMMANDANTS[index],
        phone: `+7 900 000-01-${pad2(index + 1)}`,
    },
    {
        buildingNumber: building.buildingNumber,
        jobTitle: 'Вахтёр',
        fullName: WATCHMEN[index],
        phone: `+7 900 000-02-${pad2(index + 1)}`,
    },
]);

/** Студент для загрузки: поля профиля и, при необходимости, адрес учётной записи */
export interface DemoStudent extends StudentValues {
    accountEmail: string | null;
}

interface Cohort {
    count: number;
    admissionYear: number;
    graduationYear: number;
    level: 'bachelor' | 'master';
    studyYear: number;
}

/** Набор по годам поступления: всего 30 студентов */
const COHORTS: Cohort[] = [
    { count: 6, admissionYear: 2026, graduationYear: 2030, level: 'bachelor', studyYear: 1 },
    { count: 8, admissionYear: 2025, graduationYear: 2029, level: 'bachelor', studyYear: 2 },
    { count: 6, admissionYear: 2024, graduationYear: 2028, level: 'bachelor', studyYear: 3 },
    { count: 5, admissionYear: 2023, graduationYear: 2027, level: 'bachelor', studyYear: 4 },
    { count: 3, admissionYear: 2025, graduationYear: 2027, level: 'master', studyYear: 2 },
    { count: 2, admissionYear: 2026, graduationYear: 2028, level: 'master', studyYear: 1 },
];

/** Вымышленные фамилии (женские формы образуются добавлением «а») */
const SURNAMES = [
    'Абрикосов',
    'Берёзкин',
    'Васильков',
    'Грушин',
    'Дубов',
    'Ёлкин',
    'Жимолостов',
    'Зверобоев',
    'Ивушкин',
    'Кедров',
    'Липин',
    'Малинин',
    'Нивянкин',
    'Орешкин',
    'Пихтов',
];
const MALE_NAMES = ['Алексей', 'Борис', 'Виктор', 'Георгий', 'Денис'];
const FEMALE_NAMES = ['Анна', 'Вера', 'Галина', 'Дарья', 'Ева'];
const MALE_PATRONYMICS = ['Андреевич', 'Борисович', 'Викторович', 'Георгиевич', 'Денисович'];
const FEMALE_PATRONYMICS = ['Андреевна', 'Борисовна', 'Викторовна', 'Георгиевна', 'Денисовна'];

const FACULTIES = ['Факультет информатики', 'Факультет экономики', 'Факультет права'];
const FIELDS = ['Информатика и вычислительная техника', 'Экономика', 'Юриспруденция'];
const GROUP_PREFIXES = ['ЭК', 'МД', 'МТ', 'ЮР', 'ПТ', 'ТЕ'];
const BACHELOR_PROGRAMS = ['09.03.01', '38.03.01', '40.03.01'];
const MASTER_PROGRAMS = ['09.04.01', '38.04.01', '40.04.01'];
const FUNDING: FundingType[] = ['budget', 'paid', 'scholarship'];

/** Число студентов, у которых есть учётная запись для входа */
export const DEMO_ACCOUNT_COUNT = 3;

function buildStudents(): DemoStudent[] {
    const students: DemoStudent[] = [];
    let index = 0;

    for (const cohort of COHORTS) {
        for (let sequence = 1; sequence <= cohort.count; sequence++) {
            const female = index % 2 === 1;
            const pair = Math.floor(index / 2);
            const lastName = `${SURNAMES[pair]}${female ? 'а' : ''}`;
            const firstName = (female ? FEMALE_NAMES : MALE_NAMES)[pair % 5];
            const middleName = (female ? FEMALE_PATRONYMICS : MALE_PATRONYMICS)[(pair + 2) % 5];
            const direction = index % 3;
            const isBachelor = cohort.level === 'bachelor';
            const birthYear = cohort.admissionYear - (isBachelor ? 18 : 22) - (index % 2);

            students.push({
                // Номер: две цифры года поступления, две цифры года окончания, три цифры порядкового номера
                studentNumber: `${cohort.admissionYear % 100}${cohort.graduationYear % 100}${String(sequence).padStart(3, '0')}`,
                displayName: `${lastName} ${firstName} ${middleName}`,
                lastName,
                firstName,
                middleName,
                birthDate: `${birthYear}-${pad2((index % 12) + 1)}-${pad2((index % 27) + 1)}`,
                phone: `+7 900 100-00-${pad2(index + 1)}`,
                faculty: FACULTIES[direction],
                groupName: `${GROUP_PREFIXES[index % GROUP_PREFIXES.length]}-${(index % 12) + 1}`,
                educationLevel: isBachelor ? 'Бакалавриат' : 'Магистратура',
                fieldOfStudy: FIELDS[direction],
                programCode: (isBachelor ? BACHELOR_PROGRAMS : MASTER_PROGRAMS)[direction],
                specialization: null,
                studyYear: cohort.studyYear,
                fundingType: FUNDING[index % 3],
                accountEmail: index < DEMO_ACCOUNT_COUNT ? `demo.student${index + 1}@example.com` : null,
            });
            index += 1;
        }
    }
    return students;
}

export const DEMO_STUDENTS: DemoStudent[] = buildStudents();

export interface PlannedContract {
    /** Индекс студента в DEMO_STUDENTS */
    studentIndex: number;
    buildingNumber: number;
    /** Порядковый номер койки в здании (по этажу, номеру комнаты и номеру койки) */
    bedOrdinal: number;
    startDate: string;
    endDate: string;
}

/** Число действующих договоров */
export const DEMO_CONTRACT_COUNT = 20;

/**
 * Договоры на учебный год 2026–2027 (период — полуинтервал [начало, конец)).
 * Студенты по очереди расселяются по зданиям, поэтому в части комнат живёт
 * меньше людей, чем вместимость, а в части они заполнены полностью.
 */
export function planContracts(): PlannedContract[] {
    return Array.from({ length: DEMO_CONTRACT_COUNT }, (_, index) => ({
        studentIndex: index,
        buildingNumber: DEMO_BUILDINGS[index % DEMO_BUILDINGS.length].buildingNumber,
        bedOrdinal: Math.floor(index / DEMO_BUILDINGS.length),
        startDate: '2026-09-01',
        endDate: '2027-07-01',
    }));
}

export interface PlannedPayment {
    share: 'full' | 'half';
    method: PaymentMethod;
    reference: string | null;
}

export interface PlannedInvoice {
    /** Индекс договора в planContracts() */
    contractIndex: number;
    description: string;
    issueDate: string;
    dueDate: string;
    /** null — платежей нет */
    payment: PlannedPayment | null;
}

/**
 * Счета за ноябрь (12 договоров) и декабрь (6 договоров).
 * Ноябрьские счета: полностью оплачен наличными, наполовину оплачен картой,
 * не оплачен (просрочен), полностью оплачен переводом.
 */
export function planInvoices(): PlannedInvoice[] {
    const invoices: PlannedInvoice[] = [];

    for (let index = 0; index < 12; index++) {
        const scenario = index % 4;
        let payment: PlannedPayment | null = null;
        if (scenario === 0) {
            payment = { share: 'full', method: 'cash', reference: null };
        } else if (scenario === 1) {
            payment = { share: 'half', method: 'card', reference: null };
        } else if (scenario === 3) {
            payment = { share: 'full', method: 'bank_transfer', reference: `ПП-${1000 + index}` };
        }
        invoices.push({
            contractIndex: index,
            description: 'Оплата проживания за ноябрь 2026',
            issueDate: '2026-11-01',
            dueDate: '2026-11-10',
            payment,
        });
    }

    for (let index = 0; index < 6; index++) {
        invoices.push({
            contractIndex: index,
            description: 'Оплата проживания за декабрь 2026',
            issueDate: '2026-12-01',
            dueDate: '2026-12-10',
            payment: null,
        });
    }
    return invoices;
}