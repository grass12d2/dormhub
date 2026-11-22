/**
 * Сервис коек.
 *
 * Правило вместимости: число коек в комнате не превышает вместимость комнаты.
 * Оно проверяется в транзакции с блокировкой комнаты (FOR UPDATE): две
 * одновременные вставки не могут обе занять последнее место.
 * Койку с ожидающим или действующим договором нельзя перевести на обслуживание.
 * Запись данных и запись аудита выполняются в одной транзакции на одном клиенте.
 */

import type { Pool } from 'pg';
import { BedQueries } from '../db/queries/beds.js';
import { ContractQueries } from '../db/queries/contracts.js';
import { RoomQueries } from '../db/queries/rooms.js';
import { withRetry } from '../db/transaction.js';
import { toBed, toBedValues, type Bed, type BedValues } from '../types/beds.js';
import { writeAuditLog } from '../utils/audit.js';
import { isDbError } from '../utils/db-errors.js';
import { ConflictError, NotFoundError, UnprocessableError } from '../utils/errors.js';
import type {
  CreateBedInput,
  PatchBedInput,
  ReplaceBedInput,
} from '../validation/beds.validation.js';
import type { ActionContext } from './buildings.service.js';

const BED_NOT_FOUND = 'Койка не найдена';
const ROOM_NOT_FOUND = 'Комната не найдена';

/** Применить PATCH: отсутствующее поле сохраняет текущее значение */
export function mergeBedValues(current: BedValues, patch: PatchBedInput): BedValues {
  return {
    roomId: current.roomId,
    bedNumber: patch.bedNumber ?? current.bedNumber,
    status: patch.status ?? current.status,
  };
}

/** Преобразовать нарушения ограничений базы в понятные ошибки приложения */
function translateBedError(error: unknown): unknown {
  if (isDbError(error, '23505', 'beds_room_id_bed_number_key')) {
    return new ConflictError('Койка с таким номером уже есть в этой комнате');
  }
  if (isDbError(error, '23503', 'contracts_bed_id_fkey')) {
    return new ConflictError('Нельзя удалить койку: по ней есть договоры');
  }
  return error;
}

export class BedsService {
  constructor(private readonly pool: Pool) {}

  async list(roomId?: string): Promise<Bed[]> {
    const rows = await new BedQueries(this.pool).findAll(roomId);
    return rows.map(toBed);
  }

  async get(id: string): Promise<Bed> {
    const row = await new BedQueries(this.pool).findById(id);
    if (!row) {
      throw new NotFoundError(BED_NOT_FOUND);
    }
    return toBed(row);
  }

  async create(input: CreateBedInput, ctx: ActionContext): Promise<Bed> {
    const values: BedValues = {
      roomId: input.roomId,
      bedNumber: input.bedNumber,
      status: input.status ?? 'available',
    };

    try {
      const row = await withRetry(this.pool, async (client) => {
        // Порядок блокировок: комната, затем койки
        const room = await new RoomQueries(client).findByIdForUpdate(values.roomId);
        if (!room) {
          throw new UnprocessableError(ROOM_NOT_FOUND);
        }

        const beds = new BedQueries(client);
        const count = await beds.countByRoomId(room.id);
        if (count >= room.capacity) {
          throw new ConflictError(
            `Нельзя добавить койку: в комнате уже ${count} коек из ${room.capacity}`
          );
        }

        const created = await beds.create(values);
        await writeAuditLog(client, {
          actorUserId: ctx.userId,
          action: 'create_bed',
          entityType: 'beds',
          entityId: created.id,
          details: { after: toBedValues(created) },
          ipAddress: ctx.ip,
        });
        return created;
      });
      return toBed(row);
    } catch (error) {
      throw translateBedError(error);
    }
  }

  /** PUT: полная замена номера и статуса */
  replace(id: string, input: ReplaceBedInput, ctx: ActionContext): Promise<Bed> {
    return this.modify(id, (current) => ({ ...current, ...input }), ctx);
  }

  /** PATCH: изменение только переданных полей */
  patch(id: string, input: PatchBedInput, ctx: ActionContext): Promise<Bed> {
    return this.modify(id, (current) => mergeBedValues(current, input), ctx);
  }

  async delete(id: string, ctx: ActionContext): Promise<void> {
    try {
      await withRetry(this.pool, async (client) => {
        const beds = new BedQueries(client);
        const current = await beds.findByIdForUpdate(id);
        if (!current) {
          throw new NotFoundError(BED_NOT_FOUND);
        }

        await beds.delete(id);

        // Журнал неизменяем, поэтому снимок удалённой записи — единственный её след
        await writeAuditLog(client, {
          actorUserId: ctx.userId,
          action: 'delete_bed',
          entityType: 'beds',
          entityId: id,
          details: { snapshot: toBedValues(current) },
          ipAddress: ctx.ip,
        });
      });
    } catch (error) {
      throw translateBedError(error);
    }
  }

  /**
   * Изменить койку. Новые значения вычисляются после блокировки строки койки:
   * иначе параллельное изменение другого поля было бы затёрто устаревшими данными.
   * Блокировка FOR UPDATE несовместима с блокировкой FOR SHARE, которую берёт
   * оформление договора, поэтому проверка договоров не пропустит гонку.
   */
  private async modify(
    id: string,
    compute: (current: BedValues) => BedValues,
    ctx: ActionContext
  ): Promise<Bed> {
    try {
      const row = await withRetry(this.pool, async (client) => {
        const beds = new BedQueries(client);
        const currentRow = await beds.findByIdForUpdate(id);
        if (!currentRow) {
          throw new NotFoundError(BED_NOT_FOUND);
        }

        const before = toBedValues(currentRow);
        const next = compute(before);

        if (next.status === 'maintenance' && before.status !== 'maintenance') {
          if (await new ContractQueries(client).hasLiveByBed(id)) {
            throw new ConflictError(
              'Нельзя перевести койку на обслуживание: по ней есть ожидающий или действующий договор'
            );
          }
        }

        const updated = await beds.update(id, next);
        if (!updated) {
          throw new NotFoundError(BED_NOT_FOUND);
        }

        await writeAuditLog(client, {
          actorUserId: ctx.userId,
          action: 'update_bed',
          entityType: 'beds',
          entityId: id,
          details: { before, after: toBedValues(updated) },
          ipAddress: ctx.ip,
        });
        return updated;
      });
      return toBed(row);
    } catch (error) {
      throw translateBedError(error);
    }
  }
}