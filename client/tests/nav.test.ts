import { describe, expect, it } from 'vitest';
import { parseUser } from '../src/auth/user';
import { bottomNavFor, breadcrumbs, findItem, groupItems, navFor, sectionRoutes } from '../src/nav';

describe('меню администратора', () => {
    const items = navFor('admin');

    it('содержит тринадцать утверждённых разделов в нужном порядке', () => {
        expect(items.map((item) => item.label)).toEqual([
            'Обзор',
            'Студенты',
            'Общежития',
            'Комнаты',
            'Кровати',
            'Договоры',
            'Счета',
            'Платежи',
            'Объявления',
            'Чат',
            'Правила и памятки',
            'Журнал действий',
            'Настройки',
        ]);
    });

    it('разделено на пять групп', () => {
        expect(groupItems(items).map((entry) => entry.group)).toEqual([
            'Главная',
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
        expect(paths).toEqual(['/', '/residence', '/contracts', '/invoices', '/rules', '/announcements', '/chat', '/settings']);
    });
});

describe('нижняя панель', () => {
    it('студент: Обзор, Моё жильё, Чат, Счета', () => {
        expect(bottomNavFor('student').map((item) => item.label)).toEqual(['Обзор', 'Моё жильё', 'Чат', 'Счета']);
    });

    it('администратор: Обзор, Студенты, Чат, Счета', () => {
        expect(bottomNavFor('admin').map((item) => item.label)).toEqual(['Обзор', 'Студенты', 'Чат', 'Счета']);
    });
});

describe('хлебные крошки и поиск раздела', () => {
    it('на главной: «Главная» и «Обзор»', () => {
        expect(breadcrumbs('/', 'admin')).toEqual([{ label: 'Главная' }, { label: 'Обзор' }]);
    });

    it('в разделе: группа прописными и текущий раздел', () => {
        expect(breadcrumbs('/rooms', 'admin')).toEqual([{ label: 'Учёт' }, { label: 'Комнаты' }]);
        expect(breadcrumbs('/invoices', 'admin')).toEqual([{ label: 'Финансы' }, { label: 'Счета' }]);
        expect(breadcrumbs('/audit', 'admin')).toEqual([{ label: 'Система' }, { label: 'Журнал действий' }]);
    });

    it('чат: «Общение» и «Чат»', () => {
        expect(breadcrumbs('/chat', 'student')).toEqual([{ label: 'Общение' }, { label: 'Чат' }]);
    });

    it('неизвестный путь: главная со ссылкой и сообщение', () => {
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

    it('аккаунт: «Система › Аккаунт › …»', () => {
        expect(labels('/profile')).toEqual(['Система', 'Аккаунт', 'Мой профиль']);
        expect(labels('/security')).toEqual(['Система', 'Аккаунт', 'Безопасность']);
    });

    it('подстраницы настроек ведут обратно в «Настройки»', () => {
        expect(breadcrumbs('/settings/appearance', 'admin')).toEqual([
            { label: 'Система' },
            { label: 'Настройки', to: '/settings' },
            { label: 'Внешний вид' },
        ]);
        expect(labels('/settings/notifications')).toEqual(['Система', 'Настройки', 'Уведомления']);
        expect(labels('/settings')).toEqual(['Система', 'Настройки']);
    });
});