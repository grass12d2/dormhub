/**
 * Запросы для сводки главной страницы. Все подсчёты выполняются в SQL.
 * Суммы приводятся к тексту, чтобы не терять точность при передаче numeric.
 */

import type { Queryable } from '../queryable.js';

export interface SummaryCounts {
  students: number;
  residents: number;
  free_beds: number;
}

export interface BuildingLoadRow {
  building_id: string;
  building_number: number;
  beds: number;
  occupied: number;
}

export interface FinanceRow {
  paid: string;
  outstanding: string;
  overdue_invoices: number;
  total_invoices: number;
}

export class DashboardQueries {
  constructor(private readonly db: Queryable) {}

  async counts(): Promise<SummaryCounts> {
    const result = await this.db.query<SummaryCounts>(
      `SELECT
         (SELECT count(*) FROM students)::int AS students,
         (SELECT count(*) FROM contracts WHERE status = 'active')::int AS residents,
         (SELECT count(*) FROM beds b
           WHERE b.status = 'available'
             AND NOT EXISTS (
               SELECT 1 FROM contracts c
               WHERE c.bed_id = b.id AND c.status IN ('pending', 'active')
             ))::int AS free_beds`
    );
    return result.rows[0];
  }

  /** Загрузка по общежитиям: койки и занятые койки (с живым договором) */
  async buildingLoad(): Promise<BuildingLoadRow[]> {
    const result = await this.db.query<BuildingLoadRow>(
      `SELECT bl.id AS building_id, bl.building_number,
              count(b.id)::int AS beds,
              count(b.id) FILTER (
                WHERE EXISTS (
                  SELECT 1 FROM contracts c
                  WHERE c.bed_id = b.id AND c.status IN ('pending', 'active')
                )
              )::int AS occupied
       FROM buildings bl
       LEFT JOIN rooms r ON r.building_id = bl.id
       LEFT JOIN beds b ON b.room_id = r.id
       GROUP BY bl.id, bl.building_number
       ORDER BY bl.building_number`
    );
    return result.rows;
  }

  /** Финансы: платежи, остаток по неотменённым счетам, просроченные счета */
  async finance(): Promise<FinanceRow> {
    const result = await this.db.query<FinanceRow>(
      `SELECT
         COALESCE((SELECT sum(amount) FROM payments), 0)::text AS paid,
         COALESCE((SELECT sum(i.amount - COALESCE(p.paid, 0))
                   FROM invoices i
                   LEFT JOIN LATERAL (
                     SELECT sum(amount) AS paid FROM payments WHERE invoice_id = i.id
                   ) p ON true
                   WHERE i.status <> 'cancelled'), 0)::text AS outstanding,
         (SELECT count(*) FROM invoices
           WHERE status IN ('unpaid', 'partially_paid') AND due_date < current_date)::int
           AS overdue_invoices,
         (SELECT count(*) FROM invoices WHERE status <> 'cancelled')::int AS total_invoices`
    );
    return result.rows[0];
  }
}