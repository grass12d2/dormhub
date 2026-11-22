/**
 * Сервис сводки для главной страницы администратора.
 * Только чтение: запросы выполняются в одной транзакции с уровнем REPEATABLE READ,
 * чтобы числа были согласованы между собой.
 */

import type { Pool } from 'pg';
import { DashboardQueries } from '../db/queries/dashboard.js';
import type { DashboardSummary } from '../types/dashboard.js';

export class DashboardService {
  constructor(private readonly pool: Pool) {}

  async summary(): Promise<DashboardSummary> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const queries = new DashboardQueries(client);
      const counts = await queries.counts();
      const load = await queries.buildingLoad();
      const finance = await queries.finance();
      await client.query('COMMIT');

      return {
        students: counts.students,
        residents: counts.residents,
        freeBeds: counts.free_beds,
        debt: Number(finance.outstanding),
        buildings: load.map((row) => ({
          buildingId: row.building_id,
          buildingNumber: row.building_number,
          beds: row.beds,
          occupied: row.occupied,
        })),
        finance: {
          paid: Number(finance.paid),
          outstanding: Number(finance.outstanding),
          overdueInvoices: finance.overdue_invoices,
          totalInvoices: finance.total_invoices,
        },
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}