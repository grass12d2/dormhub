/**
 * Общий исполнитель запросов для слоя доступа к данным.
 *
 * Описывает минимальный контракт, которому соответствуют и Pool,
 * и PoolClient. Благодаря этому слой запросов работает одинаково
 * как напрямую с пулом, так и внутри транзакции.
 */

import type { QueryConfig, QueryResult, QueryResultRow } from 'pg';

/**
 * Исполнитель SQL-запросов: пул соединений или клиент транзакции.
 */
export interface Queryable {
  query<R extends QueryResultRow = any, I = any[]>(
    queryTextOrConfig: string | QueryConfig<I>,
    values?: I
  ): Promise<QueryResult<R>>;
}