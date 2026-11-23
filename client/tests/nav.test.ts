import { describe, expect, it } from 'vitest';
import { parseUser } from '../src/auth/user';
import { breadcrumbs, findItem, groupItems, navFor, sectionRoutes } from '../src/nav';

describe('меню администратора', () => {
    const items = navFor('admin');

    it('содержит двенадцать утверждённых разделов в нужном порядке', () => {
        expect(items.map((item) => item.label)).toEqual([
            'Главная',
            'Студенты',
            'Общежития',
            'Комнаты',
            'Кровати',
            'Договоры',
            'Счета',
            'Платежи',
            'Объявления',
            'Чат',
            'Журнал действий',
            'Настройки',
        ]);
    });

    it('разделено на пять групп', () => {
        expect(groupItems(items).map((entry) => entry.group)).toEqual([
            'Обзор',
            'Учёт',
            'Финансы',
            'Общение',
            'Система',
        ]);
    });

    it('пути не повторяются', () => {
        expect(new Set(items.map((item) => item.path)).size).toBe(items.length);
    });
});

describe('меню студента', () => {
    const items = navFor('student');

    it('не содержит разделов администратора', () => {
        const paths = items.map((item) => item.path);
        for (const forbidden of ['/students', '/buildings', '/rooms', '/beds', '/payments', '/audit']) {
            expect(paths).not.toContain(forbidden);
        }
        expect(paths).toEqual(['/', '/residence', '/contracts', '/invoices', '/announcements', '/chat', '/settings']);
    });
});

describe('нижняя панель', () => {
    it('у каждой роли по четыре раздела, чат остаётся в «Ещё»', () => {
        expect(navFor('admin').filter((item) => item.bottom)).toHaveLength(4);
        expect(navFor('student').filter((item) => item.bottom)).toHaveLength(4);
        expect(findItem('/chat', 'admin')?.bottom).toBeFalsy();
        expect(findItem('/chat', 'student')?.bottom).toBeFalsy();
    });
});

describe('хлебные крошки и поиск раздела', () => {
    it('на главной две крошки: «Главная» и «Обзор»', () => {
        expect(breadcrumbs('/', 'admin')).toEqual([{ label: 'Главная' }, { label: 'Обзор' }]);
    });

    it('в разделе: главная со ссылкой и текущий раздел', () => {
        expect(breadcrumbs('/rooms', 'admin')).toEqual([
            { label: 'Главная', to: '/' },
            { label: 'Комнаты' },
        ]);
    });

    it('чат: главная со ссылкой и «Чат»', () => {
        expect(breadcrumbs('/chat', 'student')).toEqual([
            { label: 'Главная', to: '/' },
            { label: 'Чат' },
        ]);
    });

    it('неизвестный путь: главная и сообщение', () => {
        expect(breadcrumbs('/nowhere', 'admin')).toEqual([
            { label: 'Главная', to: '/' },
            { label: 'Страница не найдена' },
        ]);
    });

    it('раздел ищется с учётом роли', () => {
        expect(findItem('/residence', 'student')?.label).toBe('Моё жильё');
        expect(findItem('/residence', 'admin')).toBeUndefined();
    });
});

describe('маршруты разделов', () => {
    const routes = sectionRoutes();
    const rolesOf = (path: string) => routes.find((route) => route.path === path)?.roles;

    it('общие пути доступны обеим ролям, остальные только своей', () => {
        expect(rolesOf('/contracts')).toEqual(['admin', 'student']);
        expect(rolesOf('/invoices')).toEqual(['admin', 'student']);
        expect(rolesOf('/announcements')).toEqual(['admin', 'student']);
        expect(rolesOf('/chat')).toEqual(['admin', 'student']);
        expect(rolesOf('/students')).toEqual(['admin']);
        expect(rolesOf('/residence')).toEqual(['student']);
    });

    it('главная и настройки не входят в разделы', () => {
        expect(routes.map((route) => route.path)).not.toContain('/');
        expect(routes.map((route) => route.path)).not.toContain('/settings');
    });
});

describe('parseUser', () => {
    const user = { id: 'f09d', email: 'admin@dormhub.ru', role: 'admin' };

    it('принимает объект пользователя и объект с полем user', () => {
        expect(parseUser(user)).toEqual(user);
        expect(parseUser({ user })).toEqual(user);
    });

    it('отбрасывает лишние поля', () => {
        expect(parseUser({ ...user, passwordHash: 'x' })).toEqual(user);
    });

    it.each([null, undefined, 'text', 42, {}, { user: {} }, { ...user, role: 'root' }, { ...user, id: 1 }])(
        'неверная форма %j даёт null',
        (value) => {
            expect(parseUser(value)).toBeNull();
        }
    );
});

describe('крошки страниц аккаунта и настроек', () => {
    const labels = (path: string) => breadcrumbs(path, 'admin').map((part) => part.label);

    it('аккаунт не начинается с «Главная»', () => {
        expect(labels('/profile')).toEqual(['Аккаунт', 'Мой профиль']);
        expect(labels('/security')).toEqual(['Аккаунт', 'Безопасность']);
    });

    it('подстраницы настроек ведут обратно в «Настройки»', () => {
        expect(breadcrumbs('/settings/appearance', 'admin')).toEqual([
            { label: 'Настройки', to: '/settings' },
            { label: 'Внешний вид' },
        ]);
        expect(labels('/settings/notifications')).toEqual(['Настройки', 'Уведомления']);
        expect(labels('/settings')).toEqual(['Настройки']);
    });
});