import { describe, expect, it } from 'vitest';
import {
  DEMO_ACCOUNT_COUNT,
  DEMO_BUILDINGS,
  DEMO_CONTRACT_COUNT,
  DEMO_STAFF,
  DEMO_STUDENTS,
  FIRST_RESIDENTIAL_FLOOR,
  planContracts,
  planInvoices,
  planRooms,
} from '../../src/seed/demo-data.js';
import { isValidRoomNumber } from '../../src/utils/room-number.js';
import { replaceStudentSchema } from '../../src/validation/students.validation.js';

const roomsOf = (buildingNumber: number) => {
  const building = DEMO_BUILDINGS.find((item) => item.buildingNumber === buildingNumber);
  if (!building) {
    throw new Error(`Нет здания ${buildingNumber}`);
  }
  return planRooms(building);
};

describe('здания', () => {
  it('шесть зданий с номерами 1–6 и утверждёнными параметрами', () => {
    expect(DEMO_BUILDINGS.map((b) => b.buildingNumber)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(DEMO_BUILDINGS.map((b) => b.buildingType)).toEqual([
      'corridor',
      'corridor',
      'block',
      'block',
      'apartment',
      'apartment',
    ]);
    expect(DEMO_BUILDINGS.map((b) => b.floorsCount)).toEqual([16, 12, 16, 12, 10, 12]);
    expect(DEMO_BUILDINGS.map((b) => b.monthlyRate)).toEqual([700, 700, 900, 900, 1200, 1200]);
    expect(DEMO_BUILDINGS.map((b) => b.roomCapacity)).toEqual([3, 4, 2, 2, 3, 3]);
  });

  it('адреса и станции метро совпадают с описанием проекта', () => {
    expect(DEMO_BUILDINGS.map((b) => [b.address, b.metroStation])).toEqual([
      ['ул. Руднева, д. 6', 'Озерки'],
      ['пр. Художников, д. 16', 'Озерки'],
      ['пр. Ударников, д. 29, к. 1', 'Ладожская'],
      ['ул. Звездная, д. 7', 'Звездная'],
      ['ул. Трефолева, д. 37', 'Нарвская'],
      ['ул. Ленская, д. 14', 'Ладожская'],
    ]);
  });
});

describe('комнаты и койки', () => {
  it('число комнат по зданиям и всего: 1412', () => {
    const counts = DEMO_BUILDINGS.map((b) => planRooms(b).length);

    expect(counts).toEqual([300, 264, 300, 264, 108, 176]);
    expect(counts.reduce((sum, value) => sum + value, 0)).toBe(1412);
  });

  it('число коек (сумма вместимостей) равно 3936', () => {
    const beds = DEMO_BUILDINGS.flatMap((b) => planRooms(b)).reduce(
      (sum, room) => sum + room.capacity,
      0
    );

    expect(beds).toBe(3936);
  });

  it.each(DEMO_BUILDINGS)(
    'здание $buildingNumber: этажи от второго до последнего, номера корректны и уникальны',
    (building) => {
      const rooms = planRooms(building);
      const floors = rooms.map((room) => room.floor);

      expect(Math.min(...floors)).toBe(FIRST_RESIDENTIAL_FLOOR);
      expect(Math.max(...floors)).toBe(building.floorsCount);
      expect(new Set(rooms.map((room) => room.roomNumber)).size).toBe(rooms.length);
      for (const room of rooms) {
        expect(isValidRoomNumber(building.buildingType, room.floor, room.roomNumber)).toBe(true);
        expect(room.capacity).toBeGreaterThanOrEqual(2);
        expect(room.capacity).toBeLessThanOrEqual(4);
      }
    }
  );

  it('примеры нумерации из описания проекта', () => {
    const numbers = (n: number) => roomsOf(n).map((room) => room.roomNumber);

    expect(numbers(1)).toContain('201');
    expect(numbers(1)).toContain('220');
    expect(numbers(1)).not.toContain('221');
    expect(numbers(2)).toContain('324');
    expect(numbers(3)).toContain('7-3-2');
    expect(numbers(3)).not.toContain('7-5-1');
    expect(numbers(4)).toContain('643');
    expect(numbers(4)).not.toContain('647');
    expect(numbers(5)).toContain('810');
    expect(numbers(6)).toContain('1216');
    expect(numbers(6)).not.toContain('1217');
  });
});

describe('сотрудники', () => {
  it('по два на здание: комендант и вахтёр, телефоны уникальны', () => {
    expect(DEMO_STAFF).toHaveLength(12);
    for (const building of DEMO_BUILDINGS) {
      const titles = DEMO_STAFF.filter((s) => s.buildingNumber === building.buildingNumber).map(
        (s) => s.jobTitle
      );
      expect(titles).toEqual(['Комендант', 'Вахтёр']);
    }
    expect(new Set(DEMO_STAFF.map((s) => s.phone)).size).toBe(12);
    expect(new Set(DEMO_STAFF.map((s) => s.fullName)).size).toBe(12);
  });
});

describe('студенты', () => {
  it('30 студентов: номера из семи цифр и имена уникальны', () => {
    expect(DEMO_STUDENTS).toHaveLength(30);
    expect(new Set(DEMO_STUDENTS.map((s) => s.studentNumber)).size).toBe(30);
    expect(new Set(DEMO_STUDENTS.map((s) => s.displayName)).size).toBe(30);
    for (const student of DEMO_STUDENTS) {
      expect(student.studentNumber).toMatch(/^\d{7}$/);
    }
  });

  it('номер строится из годов поступления и окончания', () => {
    expect(DEMO_STUDENTS[0].studentNumber).toBe('2630001');
    expect(DEMO_STUDENTS[6].studentNumber).toBe('2529001');
    expect(DEMO_STUDENTS[29].studentNumber).toBe('2628002');
  });

  it('данные проходят ту же проверку, что и API (кроме учётной записи)', () => {
    for (const { accountEmail, ...profile } of DEMO_STUDENTS) {
      void accountEmail;
      const result = replaceStudentSchema.safeParse(profile);

      expect(result.success, profile.displayName).toBe(true);
    }
  });

  it('учётные записи у первых трёх студентов, адреса в домене example.com', () => {
    const emails = DEMO_STUDENTS.map((s) => s.accountEmail);

    expect(emails.filter((email) => email !== null)).toHaveLength(DEMO_ACCOUNT_COUNT);
    expect(emails.slice(0, DEMO_ACCOUNT_COUNT)).toEqual([
      'demo.student1@example.com',
      'demo.student2@example.com',
      'demo.student3@example.com',
    ]);
  });

  it('есть студенты всех видов финансирования и обоих уровней обучения', () => {
    expect(new Set(DEMO_STUDENTS.map((s) => s.fundingType))).toEqual(
      new Set(['budget', 'paid', 'scholarship'])
    );
    expect(new Set(DEMO_STUDENTS.map((s) => s.educationLevel))).toEqual(
      new Set(['Бакалавриат', 'Магистратура'])
    );
  });
});

describe('договоры', () => {
  const contracts = planContracts();

  it('20 договоров, у каждого свой студент, студенты с учётными записями среди них', () => {
    expect(contracts).toHaveLength(DEMO_CONTRACT_COUNT);
    expect(new Set(contracts.map((c) => c.studentIndex)).size).toBe(20);
    for (let index = 0; index < DEMO_ACCOUNT_COUNT; index++) {
      expect(contracts.map((c) => c.studentIndex)).toContain(index);
    }
  });

  it('распределение по зданиям: 4, 4, 3, 3, 3, 3', () => {
    const counts = DEMO_BUILDINGS.map(
      (b) => contracts.filter((c) => c.buildingNumber === b.buildingNumber).length
    );

    expect(counts).toEqual([4, 4, 3, 3, 3, 3]);
  });

  it('порядковые номера коек в здании идут подряд с нуля и помещаются в здание', () => {
    for (const building of DEMO_BUILDINGS) {
      const ordinals = contracts
        .filter((c) => c.buildingNumber === building.buildingNumber)
        .map((c) => c.bedOrdinal);

      expect(ordinals).toEqual(ordinals.map((_, index) => index));
    }
  });

  it('период — полуинтервал: окончание позже начала', () => {
    for (const contract of contracts) {
      expect(contract.endDate > contract.startDate).toBe(true);
    }
  });
});

describe('счета и платежи', () => {
  const invoices = planInvoices();

  it('18 счетов: 12 за ноябрь и 6 за декабрь, срок оплаты не раньше выставления', () => {
    expect(invoices).toHaveLength(18);
    expect(invoices.filter((i) => i.description.includes('ноябрь'))).toHaveLength(12);
    expect(invoices.filter((i) => i.description.includes('декабрь'))).toHaveLength(6);
    for (const invoice of invoices) {
      expect(invoice.dueDate >= invoice.issueDate).toBe(true);
      expect(invoice.contractIndex).toBeLessThan(DEMO_CONTRACT_COUNT);
    }
  });

  it('платежей 9: шесть счетов оплачены полностью, три наполовину, остальные без платежей', () => {
    const withPayments = invoices.filter((i) => i.payment !== null);

    expect(withPayments).toHaveLength(9);
    expect(invoices.filter((i) => i.payment?.share === 'full')).toHaveLength(6);
    expect(invoices.filter((i) => i.payment?.share === 'half')).toHaveLength(3);
    expect(invoices.filter((i) => i.payment === null)).toHaveLength(9);
  });

  it('есть все способы оплаты, номер платёжного документа только у перевода', () => {
    const payments = invoices.flatMap((i) => (i.payment ? [i.payment] : []));

    expect(new Set(payments.map((p) => p.method))).toEqual(new Set(['cash', 'card', 'bank_transfer']));
    for (const payment of payments) {
      expect(payment.reference !== null).toBe(payment.method === 'bank_transfer');
    }
  });

  it('у одного договора не больше одного счёта за месяц', () => {
    const keys = invoices.map((i) => `${i.contractIndex}|${i.issueDate}`);

    expect(new Set(keys).size).toBe(keys.length);
  });
});