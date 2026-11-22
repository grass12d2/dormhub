/**
 * Сервис комнат.
 *
 * Порядок блокировок во всех операциях: здания (по возрастанию идентификатора),
 * затем комната, затем койки. Запись данных, запись аудита и проверки правил
 * выполняются в одной транзакции на одном клиенте: если аудит не записался,
 * изменение откатывается.
 */

import type { Pool } from 'pg';
import { BedQueries } from '../db/queries/beds.js';
import { BuildingQueries } from '../db/queries/buildings.js';
import { RoomQueries } from '../db/queries/rooms.js';
import { withRetry } from '../db/transaction.js';
import type { BuildingRow } from '../types/buildings.js';
import { toRoom, toRoomValues, type Room, type RoomValues } from '../types/rooms.js';
import { writeAuditLog } from '../utils/audit.js';
import { isDbError } from '../utils/db-errors.js';
import {
  ConflictError,
  NotFoundError,
  RetryableConflict,
  UnprocessableError,
} from '../utils/errors.js';
import { isValidRoomNumber, roomNumberHint } from '../utils/room-number.js';
import type { CreateRoomInput, PatchRoomInput } from '../validation/rooms.validation.js';
import type { ActionContext } from './buildings.service.js';

const ROOM_NOT_FOUND = 'Комната не найдена';
const BUILDING_NOT_FOUND = 'Здание не найдено';

/**
 * Применить PATCH: отсутствующее поле сохраняет текущее значение.
 */
export function mergeRoomValues(current: RoomValues, patch: PatchRoomInput): RoomValues {
  return {
    buildingId: patch.buildingId ?? current.buildingId,
    roomNumber: patch.roomNumber ?? current.roomNumber,
    floor: patch.floor ?? current.floor,
    capacity: patch.capacity ?? current.capacity,
  };
}

/**
 * Проверка размещения комнаты в здании: этаж не выше числа этажей здания,
 * номер соответствует типу здания и этажу. Возвращает сообщение или null.
 */
export function placementError(
  building: Pick<BuildingRow, 'floors_count' | 'building_type'>,
  placement: Pick<RoomValues, 'floor' | 'roomNumber'>
): string | null {
  if (placement.floor > building.floors_count) {
    return `Этаж ${placement.floor} превышает число этажей здания (${building.floors_count})`;
  }
  if (!isValidRoomNumber(building.building_type, placement.floor, placement.roomNumber)) {
    const hint = roomNumberHint(building.building_type, placement.floor);
    return `Номер комнаты «${placement.roomNumber}» не соответствует типу здания и этажу. Пример: ${hint}`;
  }
  return null;
}

/** Преобразовать нарушения ограничений базы в понятные ошибки приложения */
function translateRoomError(error: unknown): unknown {
  if (isDbError(error, '23505', 'rooms_building_id_room_number_key')) {
    return new ConflictError('Комната с таким номером уже существует в этом здании');
  }
  if (isDbError(error, '23503', 'beds_room_id_fkey')) {
    return new ConflictError('Нельзя удалить комнату: в ней есть койки');
  }
  return error;
}

export class RoomsService {
  constructor(private readonly pool: Pool) {}

  async list(buildingId?: string): Promise<Room[]> {
    const rows = await new RoomQueries(this.pool).findAll(buildingId);
    return rows.map(toRoom);
  }

  async get(id: string): Promise<Room> {
    const row = await new RoomQueries(this.pool).findById(id);
    if (!row) {
      throw new NotFoundError(ROOM_NOT_FOUND);
    }
    return toRoom(row);
  }

  async create(input: CreateRoomInput, ctx: ActionContext): Promise<Room> {
    const values: RoomValues = input;

    try {
      const row = await withRetry(this.pool, async (client) => {
        // Здание блокируется на чтение: так его нельзя изменить, пока идёт вставка
        const building = await new BuildingQueries(client).findByIdForShare(values.buildingId);
        if (!building) {
          throw new UnprocessableError(BUILDING_NOT_FOUND);
        }
        const problem = placementError(building, values);
        if (problem) {
          throw new UnprocessableError(problem);
        }

        const created = await new RoomQueries(client).create(values);
        await writeAuditLog(client, {
          actorUserId: ctx.userId,
          action: 'create_room',
          entityType: 'rooms',
          entityId: created.id,
          details: { after: toRoomValues(created) },
          ipAddress: ctx.ip,
        });
        return created;
      });
      return toRoom(row);
    } catch (error) {
      throw translateRoomError(error);
    }
  }

  /** PUT: полная замена полей */
  replace(id: string, input: CreateRoomInput, ctx: ActionContext): Promise<Room> {
    return this.modify(id, () => ({ ...input }), ctx);
  }

  /** PATCH: изменение только переданных полей */
  patch(id: string, input: PatchRoomInput, ctx: ActionContext): Promise<Room> {
    return this.modify(id, (current) => mergeRoomValues(current, input), ctx);
  }

  async delete(id: string, ctx: ActionContext): Promise<void> {
    try {
      await withRetry(this.pool, async (client) => {
        const rooms = new RoomQueries(client);

        const peek = await rooms.findById(id);
        if (!peek) {
          throw new NotFoundError(ROOM_NOT_FOUND);
        }

        // Порядок: здание, комната, койки
        const building = await new BuildingQueries(client).findByIdForShare(peek.building_id);
        if (!building) {
          throw new RetryableConflict();
        }
        const current = await rooms.findByIdForUpdate(id);
        if (!current) {
          throw new NotFoundError(ROOM_NOT_FOUND);
        }
        if (current.building_id !== peek.building_id) {
          throw new RetryableConflict();
        }

        const bedCount = await new BedQueries(client).lockByRoomId(id);
        if (bedCount > 0) {
          throw new ConflictError('Нельзя удалить комнату: в ней есть койки');
        }

        await rooms.delete(id);

        // Журнал неизменяем, поэтому снимок удалённой записи — единственный её след
        await writeAuditLog(client, {
          actorUserId: ctx.userId,
          action: 'delete_room',
          entityType: 'rooms',
          entityId: id,
          details: { snapshot: toRoomValues(current) },
          ipAddress: ctx.ip,
        });
      });
    } catch (error) {
      throw translateRoomError(error);
    }
  }

  /**
   * Изменить комнату: блокировка зданий и комнаты, проверка правил, обновление, аудит.
   *
   * Здания блокируются до комнаты и по возрастанию идентификатора (при переносе
   * в другое здание их два), поэтому взаимных блокировок не возникает. Новые
   * значения вычисляются уже после блокировки комнаты: иначе параллельное
   * изменение другого поля было бы затёрто устаревшими данными.
   */
  private async modify(
    id: string,
    compute: (current: RoomValues) => RoomValues,
    ctx: ActionContext
  ): Promise<Room> {
    try {
      const row = await withRetry(this.pool, async (client) => {
        const rooms = new RoomQueries(client);

        const peek = await rooms.findById(id);
        if (!peek) {
          throw new NotFoundError(ROOM_NOT_FOUND);
        }

        // Здание-цель не зависит от устаревших полей: оно либо указано в запросе,
        // либо остаётся прежним (это проверяется ниже)
        const targetBuildingId = compute(toRoomValues(peek)).buildingId;
        const buildingIds = [...new Set([peek.building_id, targetBuildingId])].sort();
        const lockedBuildings = await new BuildingQueries(client).findManyByIdsForShare(
          buildingIds
        );
        const target = lockedBuildings.find((building) => building.id === targetBuildingId);
        if (!target) {
          throw new UnprocessableError(BUILDING_NOT_FOUND);
        }

        const current = await rooms.findByIdForUpdate(id);
        if (!current) {
          throw new NotFoundError(ROOM_NOT_FOUND);
        }
        // Комнату перенесли в другое здание между чтением и блокировкой: повторить
        if (current.building_id !== peek.building_id) {
          throw new RetryableConflict();
        }

        const before = toRoomValues(current);
        const next = compute(before);

        const problem = placementError(target, next);
        if (problem) {
          throw new UnprocessableError(problem);
        }

        if (next.capacity < before.capacity) {
          const bedCount = await new BedQueries(client).lockByRoomId(id);
          if (next.capacity < bedCount) {
            throw new ConflictError(
              `Нельзя уменьшить вместимость до ${next.capacity}: в комнате уже ${bedCount} коек`
            );
          }
        }

        const updated = await rooms.update(id, next);
        if (!updated) {
          throw new NotFoundError(ROOM_NOT_FOUND);
        }

        await writeAuditLog(client, {
          actorUserId: ctx.userId,
          action: 'update_room',
          entityType: 'rooms',
          entityId: id,
          details: { before, after: toRoomValues(updated) },
          ipAddress: ctx.ip,
        });
        return updated;
      });
      return toRoom(row);
    } catch (error) {
      throw translateRoomError(error);
    }
  }
}