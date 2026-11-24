import { describe, expect, it } from 'vitest';
import { detailRows, formatValue } from '../src/lib/audit-details';

describe('formatValue', () => {
    it('пустые значения скрываются, коды переводятся', () => {
        expect(formatValue(null)).toBeNull();
        expect(formatValue('')).toBeNull();
        expect(formatValue('budget')).toBe('Бюджет');
        expect(formatValue(true)).toBe('да');
    });
});

describe('detailRows', () => {
    it('сообщежитие: подписи по-русски, пустые поля скрыты', () => {
        const rows = detailRows({ after: { lastName: 'Лыонг', middleName: null, groupName: 'МД-7' }, accountCreated: false });
        expect(rows).toEqual([
            { label: 'Фамилия', value: 'Лыонг' },
            { label: 'Группа', value: 'МД-7' },
            { label: 'Создана учётная запись', value: 'нет' },
        ]);
    });

    it('изменение: только изменившиеся поля с прежним значением', () => {
        const rows = detailRows({ before: { status: 'active', floor: 2 }, after: { status: 'terminated', floor: 2 } });
        expect(rows).toEqual([{ label: 'Статус', value: 'Расторгнут', before: 'Действует' }]);
    });

    it('удаление: берётся снимок', () => {
        expect(detailRows({ snapshot: { roomNumber: '201' } })).toEqual([{ label: 'Комната', value: '201' }]);
    });

    it('порядок полей не зависит от порядка ключей', () => {
        const rows = detailRows({
            after: { phone: '+7 900 100-00-01', groupName: 'МД-7', lastName: 'Лыонг', studentNumber: '2026374' },
        });
        expect(rows.map((r) => r.label)).toEqual(['Номер студенческого', 'Фамилия', 'Телефон', 'Группа']);
    });

    it('даты показываются как ДД.ММ.ГГГГ', () => {
        expect(detailRows({ after: { birthDate: '2005-02-12' } })).toEqual([
            { label: 'Дата рождения', value: '12.02.2005' },
        ]);
    });
});