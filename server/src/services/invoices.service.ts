/**
 * Сервис счетов.
 *
 * Сумма счёта после сообщежития не меняется. Статус счёта (unpaid, partially_paid, paid)
 * обновляет только запись платежа, в той же транзакции. Просрочка не хранится:
 * она вычисляется при чтении. Запись данных и запись аудита выполняются
 * в одной транзакции на одном клиенте.
 */

import type { Pool } from 'pg';
import { InvoiceQueries } from '../db/queries/invoices.js';
import { StudentQueries } from '../db/queries/students.js';
import { withRetry } from '../db/transaction.js';
import type { AuthenticatedUser } from '../types/auth.js';
import { toInvoice, type Invoice, type InvoiceRow } from '../types/invoices.js';
import { writeAuditLog } from '../utils/audit.js';
import { isDbError } from '../utils/db-errors.js';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnprocessableError,
} from '../utils/errors.js';
import type {
  CreateInvoiceInput,
  ListInvoicesQuery,
  PatchInvoiceInput,
} from '../validation/invoices.validation.js';
import type { ActionContext } from './buildings.service.js';

const INVOICE_NOT_FOUND = 'Счёт не найден';
const PROFILE_NOT_FOUND = 'Профиль студента не найден';
const DUE_BEFORE_ISSUE = 'Срок оплаты не может быть раньше даты выставления';

export interface InvoicesPage {
  items: Invoice[];
  total: number;
  limit: number;
  offset: number;
}

/** Снимок счёта для журнала аудита */
function toSnapshot(row: InvoiceRow) {
  return {
    contractId: row.contract_id,
    description: row.description,
    amount: Number(row.amount),
    issueDate: row.issue_date,
    dueDate: row.due_date,
    status: row.status,
  };
}

/** Преобразовать нарушения ограничений базы в понятные ошибки приложения */
function translateInvoiceError(error: unknown): unknown {
  if (isDbError(error, '23514', 'invoices_dates_check')) {
    return new BadRequestError(DUE_BEFORE_ISSUE);
  }
  return error;
}

export class InvoicesService {
  constructor(private readonly pool: Pool) {}

  async list(query: ListInvoicesQuery): Promise<InvoicesPage> {
    const page = await new InvoiceQueries(this.pool).findPage({
      contractId: query.contractId,
      studentId: query.studentId,
      status: query.status,
      overdue: query.overdue === true,
      limit: query.limit,
      offset: query.offset,
    });
    return {
      items: page.rows.map(toInvoice),
      total: page.total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  /** Счета студента, привязанного к учётной записи пользователя */
  async listMine(userId: string): Promise<Invoice[]> {
    const student = await new StudentQueries(this.pool).findByUserId(userId);
    if (!student) {
      throw new NotFoundError(PROFILE_NOT_FOUND);
    }
    const rows = await new InvoiceQueries(this.pool).findMine(userId);
    return rows.map(toInvoice);
  }

  /** Администратор видит любой счёт, студент — только свой (чужой выглядит как «не найден») */
  async get(id: string, viewer: AuthenticatedUser): Promise<Invoice> {
    const queries = new InvoiceQueries(this.pool);
    const row =
      viewer.role === 'admin'
        ? await queries.findById(id)
        : await queries.findByIdForUser(id, viewer.id);
    if (!row) {
      throw new NotFoundError(INVOICE_NOT_FOUND);
    }
    return toInvoice(row);
  }

  async create(input: CreateInvoiceInput, ctx: ActionContext): Promise<Invoice> {
    try {
      const row = await withRetry(this.pool, async (client) => {
        const invoices = new InvoiceQueries(client);

        const contract = await invoices.lockContractForShare(input.contractId);
        if (!contract) {
          throw new UnprocessableError('Договор не найден');
        }
        if (contract.status === 'cancelled') {
          throw new ConflictError('По отменённому договору счета не выставляются');
        }

        const id = await invoices.insert({
          contractId: input.contractId,
          description: input.description,
          amount: input.amount,
          issueDate: input.issueDate ?? null,
          dueDate: input.dueDate,
        });
        const created = await invoices.findById(id);
        if (!created) {
          throw new NotFoundError(INVOICE_NOT_FOUND);
        }

        await writeAuditLog(client, {
          actorUserId: ctx.userId,
          action: 'create_invoice',
          entityType: 'invoices',
          entityId: id,
          details: { after: toSnapshot(created) },
          ipAddress: ctx.ip,
        });
        return created;
      });
      return toInvoice(row);
    } catch (error) {
      throw translateInvoiceError(error);
    }
  }

  /** PATCH: описание и срок оплаты, пока счёт не оплачен полностью и не отменён */
  async patch(id: string, input: PatchInvoiceInput, ctx: ActionContext): Promise<Invoice> {
    try {
      const row = await withRetry(this.pool, async (client) => {
        const invoices = new InvoiceQueries(client);
        const current = await invoices.lockForUpdate(id);
        if (!current) {
          throw new NotFoundError(INVOICE_NOT_FOUND);
        }
        if (current.status === 'paid' || current.status === 'cancelled') {
          throw new ConflictError(
            'Изменять можно только неоплаченный или частично оплаченный счёт'
          );
        }

        const next = {
          description: input.description ?? current.description,
          dueDate: input.dueDate ?? current.due_date,
        };
        if (next.dueDate < current.issue_date) {
          throw new BadRequestError(DUE_BEFORE_ISSUE);
        }

        await invoices.updateDetails(id, next.description, next.dueDate);
        const updated = await invoices.findById(id);
        if (!updated) {
          throw new NotFoundError(INVOICE_NOT_FOUND);
        }

        await writeAuditLog(client, {
          actorUserId: ctx.userId,
          action: 'update_invoice',
          entityType: 'invoices',
          entityId: id,
          details: {
            before: { description: current.description, dueDate: current.due_date },
            after: { description: updated.description, dueDate: updated.due_date },
          },
          ipAddress: ctx.ip,
        });
        return updated;
      });
      return toInvoice(row);
    } catch (error) {
      throw translateInvoiceError(error);
    }
  }

  /**
   * Отмена: только счёт без платежей. Запись платежа блокирует счёт тем же FOR UPDATE,
   * поэтому отмена и платёж не могут пройти одновременно.
   */
  async cancel(id: string, ctx: ActionContext): Promise<Invoice> {
    const row = await withRetry(this.pool, async (client) => {
      const invoices = new InvoiceQueries(client);
      const current = await invoices.lockForUpdate(id);
      if (!current) {
        throw new NotFoundError(INVOICE_NOT_FOUND);
      }
      if (current.status === 'cancelled') {
        throw new ConflictError('Счёт уже отменён');
      }
      if (current.status !== 'unpaid') {
        throw new ConflictError('Нельзя отменить счёт: по нему есть платежи');
      }

      await invoices.updateStatus(id, 'cancelled');
      const updated = await invoices.findById(id);
      if (!updated) {
        throw new NotFoundError(INVOICE_NOT_FOUND);
      }

      await writeAuditLog(client, {
        actorUserId: ctx.userId,
        action: 'cancel_invoice',
        entityType: 'invoices',
        entityId: id,
        details: { before: { status: current.status }, after: { status: updated.status } },
        ipAddress: ctx.ip,
      });
      return updated;
    });
    return toInvoice(row);
  }
}