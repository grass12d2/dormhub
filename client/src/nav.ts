import {
    BedDouble,
    Building2,
    CreditCard,
    DoorOpen,
    FileText,
    History,
    Home,
    LayoutDashboard,
    Receipt,
    Settings,
    Users,
    MessageCircle,
    Megaphone,
    type LucideIcon,
} from 'lucide-react';
import type { Role } from './auth/user';

export interface NavItem {
    path: string;
    label: string;
    icon: LucideIcon;
    role: Role;
    group: string;
    /** Место в нижней панели на телефоне (1–4, слева направо); без значения — только в «Ещё» */
    bottom?: number;
}

/** Меню по ролям; у администратора и студента один путь может называться по-разному */
export const NAV_ITEMS: NavItem[] = [
    { path: '/', label: 'Обзор', icon: LayoutDashboard, role: 'admin', group: 'Главная', bottom: 1 },
    { path: '/students', label: 'Студенты', icon: Users, role: 'admin', group: 'Учёт', bottom: 2 },
    { path: '/buildings', label: 'Общежития', icon: Building2, role: 'admin', group: 'Учёт' },
    { path: '/rooms', label: 'Комнаты', icon: DoorOpen, role: 'admin', group: 'Учёт' },
    { path: '/beds', label: 'Кровати', icon: BedDouble, role: 'admin', group: 'Учёт' },
    { path: '/contracts', label: 'Договоры', icon: FileText, role: 'admin', group: 'Финансы' },
    { path: '/invoices', label: 'Счета', icon: Receipt, role: 'admin', group: 'Финансы', bottom: 4 },
    { path: '/payments', label: 'Платежи', icon: CreditCard, role: 'admin', group: 'Финансы' },
    { path: '/announcements', label: 'Объявления', icon: Megaphone, role: 'admin', group: 'Общение' },
    { path: '/chat', label: 'Чат', icon: MessageCircle, role: 'admin', group: 'Общение', bottom: 3 },
    { path: '/audit', label: 'Журнал действий', icon: History, role: 'admin', group: 'Система' },
    { path: '/settings', label: 'Настройки', icon: Settings, role: 'admin', group: 'Система' },

    { path: '/', label: 'Обзор', icon: LayoutDashboard, role: 'student', group: 'Главная', bottom: 1 },
    { path: '/residence', label: 'Моё жильё', icon: Home, role: 'student', group: 'Проживание', bottom: 2 },
    { path: '/contracts', label: 'Договоры', icon: FileText, role: 'student', group: 'Проживание' },
    { path: '/invoices', label: 'Счета', icon: Receipt, role: 'student', group: 'Проживание', bottom: 4 },
    { path: '/announcements', label: 'Объявления', icon: Megaphone, role: 'student', group: 'Общение' },
    { path: '/chat', label: 'Чат', icon: MessageCircle, role: 'student', group: 'Общение', bottom: 3 },
    { path: '/settings', label: 'Настройки', icon: Settings, role: 'student', group: 'Система' },
];

export function navFor(role: Role): NavItem[] {
    return NAV_ITEMS.filter((item) => item.role === role);
}

/** Разделы нижней панели на телефоне в порядке их места */
export function bottomNavFor(role: Role): NavItem[] {
    return navFor(role)
        .filter((item) => item.bottom !== undefined)
        .sort((a, b) => (a.bottom ?? 0) - (b.bottom ?? 0));
}

/** Группы меню в порядке первого появления */
export function groupItems(items: NavItem[]): Array<{ group: string; items: NavItem[] }> {
    const groups: Array<{ group: string; items: NavItem[] }> = [];
    for (const item of items) {
        const found = groups.find((entry) => entry.group === item.group);
        if (found) {
            found.items.push(item);
        } else {
            groups.push({ group: item.group, items: [item] });
        }
    }
    return groups;
}

export function findItem(pathname: string, role: Role): NavItem | undefined {
    return navFor(role).find((item) => item.path === pathname);
}

/** Пути разделов (без главной и настроек) с ролями, которым они доступны */
export function sectionRoutes(): Array<{ path: string; roles: Role[] }> {
    const map = new Map<string, Role[]>();
    for (const item of NAV_ITEMS) {
        if (item.path === '/' || item.path === '/settings') {
            continue;
        }
        map.set(item.path, [...(map.get(item.path) ?? []), item.role]);
    }
    return [...map.entries()].map(([path, roles]) => ({ path, roles }));
}

type Crumb = { label: string; to?: string };

/** Группа меню в крошках пишется прописными, как заголовок группы в боковом меню */
const groupCrumb = (group: string, to?: string): Crumb => ({ label: group, ...(to ? { to } : {}) });

/** Страницы вне меню (настройки и аккаунт): крошки отражают их структуру */
const EXTRA_PAGES: Record<string, Crumb[]> = {
    '/settings': [groupCrumb('Система'), { label: 'Настройки' }],
    '/settings/appearance': [groupCrumb('Система'), { label: 'Настройки', to: '/settings' }, { label: 'Внешний вид' }],
    '/settings/notifications': [groupCrumb('Система'), { label: 'Настройки', to: '/settings' }, { label: 'Уведомления' }],
    '/profile': [groupCrumb('Система'), { label: 'Аккаунт' }, { label: 'Мой профиль' }],
    '/security': [groupCrumb('Система'), { label: 'Аккаунт' }, { label: 'Безопасность' }],
};

/** Хлебные крошки: первой идёт группа меню (ГЛАВНАЯ, УЧЁТ, ФИНАНСЫ…), затем раздел */
export function breadcrumbs(pathname: string, role: Role): Crumb[] {
    const extra = EXTRA_PAGES[pathname];
    if (extra) {
        return extra;
    }
    const current = findItem(pathname, role);
    if (!current) {
        return [groupCrumb('Главная', '/'), { label: 'Страница не найдена' }];
    }
    return [groupCrumb(current.group), { label: current.label }];
}
