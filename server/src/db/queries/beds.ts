/**
 * Запросы к таблице beds.
 * Модуль коек дополнит этот файл остальными запросами.
 */

import type { Queryable } from '../queryable.js';

export class BedQueries {
  constructor(private readonly db: Queryable) {}

  /**
   * Блокирует койки комнаты в порядке возрастания идентификатора
   * и возвращает их число.
   */
  async lockByRoomId(roomId: string): Promise<number> {
    const result = await this.db.query(
      'SELECT id FROM beds WHERE room_id = $1 ORDER BY id FOR UPDATE',
      [roomId]
    );
    return result.rows.length;
  }
}