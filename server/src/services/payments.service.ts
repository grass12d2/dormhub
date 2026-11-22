/**
 * Сервис платежей.
 *
 * Запись платежа в одной транзакции на одном клиенте:
 *  1. блокировка счёта (FOR UPDATE);
 *  2. проверка статуса счёта и суммы: платежи в сумме не превышают сумму счёта;
 *  3. запись платежа;
 *  4. обновление статуса счёта (partially_paid или paid);
 *  5. запись аудита.
 * Если любой шаг не удался, не сохраняется ничего. Платежи неизменяемы:
 * ни изменить, ни удалить их через приложение нельзя.
 * Суммы сравниваются в копейках (целые числа).
 */

import type { Pool } from 'pg';
import { InvoiceQueries } from '../db/queries/invoices.js';
import { PaymentQueries } from '../db/queries/payments.js';
import { StudentQueries } from '../db/queries/students.js';
import { withRetry } from '../db/transaction.js';
import { toPayment, type Payment } from '../types/payments.js';
import { writeAuditLog } from '../utils/audit.js';
import { ConflictError, NotFoundError, UnprocessableError } from '../utils/errors.js';
import { formatCents, toCents } from '../utils/money.js';
import type { CreatePaymentInput, ListPaymentsQuery } from '../validation/payments.validation.js';
import type { ActionContext } from './buildings.service.js';

const PAYMENT_NOT_FOUND = 'Платёж не найден';
const PROFILE_NOT_FOUND = 'Профиль студента не найден';

export interface PaymentsPage {
  items: Payment[];
  total: number;
  limit: number;
  offset: number;
}

export class PaymentsService {
  constructor(private readonly pool: Pool) {}

  async list(query: ListPaymentsQuery): Promise<PaymentsPage> {
    const page = await new PaymentQueries(this.pool).findPage(query);
    return {
      items: page.rows.map(toPayment),
      total: page.total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  /** Платежи студента, привязанного к учётной записи пользователя */
  async listMine(userId: string): Promise<Payment[]> {
    const student = await new StudentQueries(this.pool).findByUserId(userId);
    if (!student) {
      throw new NotFoundError(PROFILE_NOT_FOUND);
    }
    const rows = await new PaymentQueries(this.pool).findMine(userId);
    return rows.map(toPayment);
  }

  async get(id: string): Promise<Payment> {
    const row = await new PaymentQueries(this.pool).findById(id);
    if (!row) {
      throw new NotFoundError(PAYMENT_NOT_FOUND);
    }
    return toPayment(row);
  }

  async create(input: CreatePaymentInput, ctx: ActionContext): Promise<Payment> {
    const row = await withRetry(this.pool, async (client) => {
      const invoices = new InvoiceQueries(client);

      const invoice = await invoices.lockForUpdate(input.invoiceId);
      if (!invoice) {
        throw new UnprocessableError('Счёт не найден');
      }
      if (invoice.status === 'cancelled') {
        throw new ConflictError('Счёт отменён: платёж принять нельзя');
      }
      if (invoice.status === 'paid') {
        throw new ConflictError('Счёт уже оплачен полностью');
      }

      const paidCents = toCents(await invoices.paidTotal(invoice.id));
      const remainingCents = toCents(invoice.amount) - paidCents;
      const amountCents = toCents(input.amount);
      if (amountCents > remainingCents) {
        throw new ConflictError(
          `Сумма платежа превышает остаток по счёту (${formatCents(remainingCents)})`
        );
      }

      const created = await new PaymentQueries(client).insert({
        invoiceId: invoice.id,
        amount: input.amount,
        method: input.method,
        reference: input.reference ?? null,
        recordedBy: ctx.userId,
      });

      const statusAfter = amountCents === remainingCents ? 'paid' : 'partially_paid';
      await invoices.updateStatus(invoice.id, statusAfter);

      await writeAuditLog(client, {
        actorUserId: ctx.userId,
        action: 'create_payment',
        entityType: 'payments',
        entityId: created.id,
        details: {
          invoiceId: invoice.id,
          amount: Number(created.amount),
          method: created.method,
          reference: created.reference,
          statusBefore: invoice.status,
          statusAfter,
        },
        ipAddress: ctx.ip,
      });
      return created;
    });
    return toPayment(row);
  }
}