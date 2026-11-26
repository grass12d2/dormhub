import { formatDate } from './format';

/** Преобразование деталей журнала в строки «поле: значение» на русском */

const FIELD_LABELS: Record<string, string> = {
    studentNumber: 'Номер студенческого',
    displayName: 'Имя для показа',
    lastName: 'Фамилия',
    firstName: 'Имя',
    middleName: 'Отчество',
    birthDate: 'Дата рождения',
    phone: 'Телефон',
    faculty: 'Институт',
    groupName: 'Группа',
    studyYear: 'Курс',
    fundingType: 'Финансирование',
    educationLevel: 'Уровень образования',
    fieldOfStudy: 'Направление',
    programCode: 'Код программы',
    specialization: 'Специализация',
    email: 'Email',
    role: 'Роль',
    userId: 'Учётная запись',
    accountCreated: 'Создана учётная запись',
    createdWithStudent: 'Создана вместе со студентом',
    buildingNumber: 'Номер общежития',
    address: 'Адрес',
    metroStation: 'Метро',
    buildingType: 'Тип общежития',
    floorsCount: 'Этажей',
    monthlyRate: 'Плата в месяц',
    buildingId: 'Общежитие',
    roomNumber: 'Комната',
    floor: 'Этаж',
    capacity: 'Вместимость',
    roomId: 'Комната (id)',
    bedNumber: 'Номер койки',
    status: 'Статус',
    studentId: 'Студент (id)',
    bedId: 'Койка (id)',
    startDate: 'Начало',
    endDate: 'Окончание',
    reason: 'Причина',
    contractId: 'Договор (id)',
    description: 'Описание',
    amount: 'Сумма',
    issueDate: 'Дата выставления',
    dueDate: 'Срок оплаты',
    invoiceId: 'Счёт (id)',
    method: 'Способ оплаты',
    reference: 'Документ',
    statusBefore: 'Статус до',
    statusAfter: 'Статус после',
    jobTitle: 'Должность',
    fullName: 'ФИО',
    buildings: 'Зданий',
    rooms: 'Комнат',
    beds: 'Коек',
    staff: 'Сотрудников',
    students: 'Студентов',
    accounts: 'Учётных записей',
    contracts: 'Договоров',
    invoices: 'Счетов',
    payments: 'Платежей',
    title: 'Заголовок',
    targets: 'Адресаты',
    expiresAt: 'Действует до',
    fileName: 'Файл',
    contentType: 'Тип файла',
    bytes: 'Размер',
    chatId: 'Чат (id)',
    messageId: 'Сообщение (id)',
};

const VALUE_LABELS: Record<string, string> = {
    budget: 'Бюджет',
    paid: 'Платное',
    scholarship: 'Стипендия',
    available: 'Доступна',
    maintenance: 'Обслуживание',
    pending: 'Ожидает',
    active: 'Действует',
    terminated: 'Расторгнут',
    expired: 'Истёк',
    cancelled: 'Отменён',
    unpaid: 'Не оплачен',
    partially_paid: 'Оплачен частично',
    cash: 'Наличные',
    card: 'Карта',
    bank_transfer: 'Банковский перевод',
    corridor: 'Коридорный',
    block: 'Блочный',
    apartment: 'Квартирный',
    admin: 'Администратор',
    student: 'Студент',
};

/** Порядок показа полей: jsonb хранит ключи в произвольном порядке, поэтому он задан здесь */
const FIELD_ORDER = [
    'studentNumber', 'displayName', 'lastName', 'firstName', 'middleName', 'birthDate', 'phone',
    'faculty', 'groupName', 'studyYear', 'fundingType', 'educationLevel', 'fieldOfStudy',
    'programCode', 'specialization',
    'email', 'role', 'userId', 'accountCreated', 'createdWithStudent',
    'buildingNumber', 'address', 'metroStation', 'buildingType', 'floorsCount', 'monthlyRate',
    'buildingId', 'floor', 'roomNumber', 'roomId', 'capacity', 'bedNumber', 'bedId',
    'studentId', 'contractId', 'invoiceId', 'description', 'amount', 'method', 'reference',
    'startDate', 'endDate', 'issueDate', 'dueDate', 'status', 'statusBefore', 'statusAfter', 'reason',
    'jobTitle', 'fullName',
    'title', 'targets', 'expiresAt', 'fileName', 'contentType', 'bytes', 'chatId', 'messageId',
    'buildings', 'rooms', 'beds', 'staff', 'students', 'accounts', 'contracts', 'invoices', 'payments',
];

/** Сортировка по заданному порядку; неизвестные поля в конце по алфавиту */
function orderedKeys(keys: string[]): string[] {
    const rank = (key: string) => {
        const index = FIELD_ORDER.indexOf(key);
        return index === -1 ? FIELD_ORDER.length : index;
    };
    return [...keys].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

export interface DetailRow {
    label: string;
    value: string;
    /** Для изменений: прежнее значение */
    before?: string;
}

/** Значение для показа; пустое даёт null (строка скрывается) */
export function formatValue(value: unknown): string | null {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'boolean') return value ? 'да' : 'нет';
    if (typeof value === 'object') return JSON.stringify(value);
    const text = String(value);
    return VALUE_LABELS[text] ?? formatDate(text);
}

const labelOf = (key: string) => FIELD_LABELS[key] ?? key;

/** Размер файла: байты, КБ или МБ */
export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} Б`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} КБ`;
    return `${(bytes / 1024 / 1024).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} МБ`;
}

/** Значение конкретного поля: для некоторых полей — особый вид */
function fieldValue(key: string, value: unknown): string | null {
    if (key === 'bytes' && typeof value === 'number') return formatBytes(value);
    if (key === 'targets' && Array.isArray(value)) {
        return value.length === 0 ? 'Все жильцы' : `Выбранные места: ${value.length}`;
    }
    if (key === 'contentType' && typeof value === 'string') return value;
    return formatValue(value);
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);

/** Строки для одной записи: after, snapshot, before/after (только изменения) или плоские поля */
export function detailRows(details: Record<string, unknown>): DetailRow[] {
    const rows: DetailRow[] = [];
    const { before, after, snapshot, ...rest } = details;

    if (isRecord(before) && isRecord(after)) {
        for (const key of orderedKeys(Object.keys(after))) {
            const was = fieldValue(key, before[key]);
            const now = fieldValue(key, after[key]);
            if (was !== now) {
                rows.push({ label: labelOf(key), value: now ?? '—', before: was ?? '—' });
            }
        }
    } else {
        const source = isRecord(after) ? after : isRecord(snapshot) ? snapshot : null;
        if (source) {
            for (const key of orderedKeys(Object.keys(source))) {
                const raw = source[key];
                const value = fieldValue(key, raw);
                if (value !== null) rows.push({ label: labelOf(key), value });
            }
        }
    }
    for (const key of orderedKeys(Object.keys(rest))) {
        const raw = rest[key];
        const value = fieldValue(key, raw);
        if (value !== null) rows.push({ label: labelOf(key), value });
    }
    return rows;
}