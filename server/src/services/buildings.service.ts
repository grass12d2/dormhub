/**
 * Сервис общежитий и их сотрудников.
 *
 * Каждая запись данных, запись аудита и проверки правил выполняются
 * в одной транзакции на одном клиенте: если аудит не записался,
 * изменение откатывается.
 */

import type { Pool } from 'pg';
import { BuildingStaffQueries } from '../db/queries/building-staff.js';
import { BuildingQueries } from '../db/queries/buildings.js';
import { withRetry } from '../db/transaction.js';
import {
  toBuilding,
  toBuildingValues,
  toStaffMember,
  toStaffValues,
  type Building,
  type BuildingValues,
  type StaffMember,
  type StaffValues,
} from '../types/buildings.js';
import { writeAuditLog } from '../utils/audit.js';
import { isDbError } from '../utils/db-errors.js';
import { ConflictError, NotFoundError, UnprocessableError } from '../utils/errors.js';
import type {
  CreateBuildingInput,
  CreateStaffInput,
  PatchBuildingInput,
  PatchStaffInput,
} from '../validation/buildings.validation.js';

const BUILDING_NOT_FOUND = 'Общежитие не найдено';
const STAFF_NOT_FOUND = 'Сотрудник не найден';

/** Кто и откуда выполняет действие (для журнала аудита) */
export interface ActionContext {
  userId: string;
  ip?: string;
}

/**
 * Применить PATCH: отсутствующее поле сохраняет текущее значение.
 * Для metroStation значение null осмысленно (очистить станцию), поэтому
 * оно отличается от отсутствия поля.
 */
export function mergeBuildingValues(
  current: BuildingValues,
  patch: PatchBuildingInput
): BuildingValues {
  return {
    buildingNumber: patch.buildingNumber ?? current.buildingNumber,
    address: patch.address ?? current.address,
    metroStation: patch.metroStation !== undefined ? patch.metroStation : current.metroStation,
    buildingType: patch.buildingType ?? current.buildingType,
    floorsCount: patch.floorsCount ?? current.floorsCount,
    monthlyRate: patch.monthlyRate ?? current.monthlyRate,
  };
}

/** То же для сотрудника: null в phone очищает телефон */
export function mergeStaffValues(current: StaffValues, patch: PatchStaffInput): StaffValues {
  return {
    jobTitle: patch.jobTitle ?? current.jobTitle,
    fullName: patch.fullName ?? current.fullName,
    phone: patch.phone !== undefined ? patch.phone : current.phone,
  };
}

/** Преобразовать нарушения ограничений базы в понятные ошибки приложения */
function translateBuildingError(error: unknown): unknown {
  if (isDbError(error, '23505', 'buildings_building_number_key')) {
    return new ConflictError('Общежитие с таким номером уже существует');
  }
  if (isDbError(error, '23503', 'rooms_building_id_fkey')) {
    return new ConflictError('Нельзя удалить общежитие: в нём есть комнаты');
  }
  if (isDbError(error, '23503', 'building_staff_building_id_fkey')) {
    return new ConflictError('Нельзя удалить общежитие: у него есть сотрудники');
  }
  return error;
}

export class BuildingsService {
  constructor(private readonly pool: Pool) {}

  async list(): Promise<Building[]> {
    const rows = await new BuildingQueries(this.pool).findAll();
    return rows.map(toBuilding);
  }

  async get(id: string): Promise<Building> {
    const row = await new BuildingQueries(this.pool).findById(id);
    if (!row) {
      throw new NotFoundError(BUILDING_NOT_FOUND);
    }
    return toBuilding(row);
  }

  async create(input: CreateBuildingInput, ctx: ActionContext): Promise<Building> {
    const values: BuildingValues = { ...input, metroStation: input.metroStation ?? null };

    try {
      const row = await withRetry(this.pool, async (client) => {
        const created = await new BuildingQueries(client).create(values);
        await writeAuditLog(client, {
          actorUserId: ctx.userId,
          action: 'create_building',
          entityType: 'buildings',
          entityId: created.id,
          details: { after: toBuildingValues(created) },
          ipAddress: ctx.ip,
        });
        return created;
      });
      return toBuilding(row);
    } catch (error) {
      throw translateBuildingError(error);
    }
  }

  /** PUT: полная замена полей */
  replace(id: string, input: CreateBuildingInput, ctx: ActionContext): Promise<Building> {
    const next: BuildingValues = { ...input, metroStation: input.metroStation ?? null };
    return this.modify(id, () => next, ctx);
  }

  /** PATCH: изменение только переданных полей */
  patch(id: string, input: PatchBuildingInput, ctx: ActionContext): Promise<Building> {
    return this.modify(id, (current) => mergeBuildingValues(current, input), ctx);
  }

  async delete(id: string, ctx: ActionContext): Promise<void> {
    try {
      await withRetry(this.pool, async (client) => {
        const queries = new BuildingQueries(client);
        const current = await queries.findByIdForUpdate(id);
        if (!current) {
          throw new NotFoundError(BUILDING_NOT_FOUND);
        }

        await queries.delete(id);

        // Журнал неизменяем, поэтому снимок удалённой записи — единственный её след
        await writeAuditLog(client, {
          actorUserId: ctx.userId,
          action: 'delete_building',
          entityType: 'buildings',
          entityId: id,
          details: { snapshot: toBuildingValues(current) },
          ipAddress: ctx.ip,
        });
      });
    } catch (error) {
      throw translateBuildingError(error);
    }
  }

  async listStaff(buildingId: string): Promise<StaffMember[]> {
    const building = await new BuildingQueries(this.pool).findById(buildingId);
    if (!building) {
      throw new NotFoundError(BUILDING_NOT_FOUND);
    }
    const rows = await new BuildingStaffQueries(this.pool).findByBuilding(buildingId);
    return rows.map(toStaffMember);
  }

  async createStaff(
    buildingId: string,
    input: CreateStaffInput,
    ctx: ActionContext
  ): Promise<StaffMember> {
    const values: StaffValues = {
      jobTitle: input.jobTitle,
      fullName: input.fullName,
      phone: input.phone ?? null,
    };

    try {
      const row = await withRetry(this.pool, async (client) => {
        const created = await new BuildingStaffQueries(client).create(buildingId, values);
        await writeAuditLog(client, {
          actorUserId: ctx.userId,
          action: 'create_building_staff',
          entityType: 'building_staff',
          entityId: created.id,
          details: { buildingId, after: toStaffValues(created) },
          ipAddress: ctx.ip,
        });
        return created;
      });
      return toStaffMember(row);
    } catch (error) {
      // Общежития не существует (или его удалили между проверкой и записью)
      if (isDbError(error, '23503', 'building_staff_building_id_fkey')) {
        throw new NotFoundError(BUILDING_NOT_FOUND);
      }
      throw error;
    }
  }

  /** PUT: полная замена полей сотрудника */
  replaceStaff(
    buildingId: string,
    staffId: string,
    input: CreateStaffInput,
    ctx: ActionContext
  ): Promise<StaffMember> {
    const next: StaffValues = {
      jobTitle: input.jobTitle,
      fullName: input.fullName,
      phone: input.phone ?? null,
    };
    return this.modifyStaff(buildingId, staffId, () => next, ctx);
  }

  /** PATCH: изменение только переданных полей сотрудника */
  patchStaff(
    buildingId: string,
    staffId: string,
    input: PatchStaffInput,
    ctx: ActionContext
  ): Promise<StaffMember> {
    return this.modifyStaff(
      buildingId,
      staffId,
      (current) => mergeStaffValues(current, input),
      ctx
    );
  }

  async deleteStaff(buildingId: string, staffId: string, ctx: ActionContext): Promise<void> {
    await withRetry(this.pool, async (client) => {
      const queries = new BuildingStaffQueries(client);
      const current = await queries.findInBuildingForUpdate(buildingId, staffId);
      if (!current) {
        throw new NotFoundError(STAFF_NOT_FOUND);
      }

      await queries.delete(staffId);

      await writeAuditLog(client, {
        actorUserId: ctx.userId,
        action: 'delete_building_staff',
        entityType: 'building_staff',
        entityId: staffId,
        details: { buildingId, snapshot: toStaffValues(current) },
        ipAddress: ctx.ip,
      });
    });
  }

  /**
   * Изменить общежитие: блокировка строки, проверка числа этажей, обновление, аудит.
   *
   * Строка общежития блокируется до чтения этажей комнат. Добавление и изменение
   * комнат берёт на общежитие блокировку FOR SHARE, которая несовместима с FOR UPDATE,
   * поэтому комната не может появиться между проверкой и обновлением.
   */
  private async modify(
    id: string,
    compute: (current: BuildingValues) => BuildingValues,
    ctx: ActionContext
  ): Promise<Building> {
    try {
      const row = await withRetry(this.pool, async (client) => {
        const queries = new BuildingQueries(client);
        const currentRow = await queries.findByIdForUpdate(id);
        if (!currentRow) {
          throw new NotFoundError(BUILDING_NOT_FOUND);
        }

        const before = toBuildingValues(currentRow);
        const next = compute(before);

        if (next.floorsCount < before.floorsCount) {
          const maxFloor = await queries.maxRoomFloor(id);
          if (maxFloor !== null && next.floorsCount < maxFloor) {
            throw new UnprocessableError(
              `Нельзя уменьшить число этажей до ${next.floorsCount}: в здании есть комнаты на этаже ${maxFloor}`
            );
          }
        }

        const updated = await queries.update(id, next);
        if (!updated) {
          throw new NotFoundError(BUILDING_NOT_FOUND);
        }

        await writeAuditLog(client, {
          actorUserId: ctx.userId,
          action: 'update_building',
          entityType: 'buildings',
          entityId: id,
          details: { before, after: toBuildingValues(updated) },
          ipAddress: ctx.ip,
        });
        return updated;
      });
      return toBuilding(row);
    } catch (error) {
      throw translateBuildingError(error);
    }
  }

  private async modifyStaff(
    buildingId: string,
    staffId: string,
    compute: (current: StaffValues) => StaffValues,
    ctx: ActionContext
  ): Promise<StaffMember> {
    const row = await withRetry(this.pool, async (client) => {
      const queries = new BuildingStaffQueries(client);
      const currentRow = await queries.findInBuildingForUpdate(buildingId, staffId);
      if (!currentRow) {
        throw new NotFoundError(STAFF_NOT_FOUND);
      }

      const before = toStaffValues(currentRow);
      const updated = await queries.update(staffId, compute(before));
      if (!updated) {
        throw new NotFoundError(STAFF_NOT_FOUND);
      }

      await writeAuditLog(client, {
        actorUserId: ctx.userId,
        action: 'update_building_staff',
        entityType: 'building_staff',
        entityId: staffId,
        details: { buildingId, before, after: toStaffValues(updated) },
        ipAddress: ctx.ip,
      });
      return updated;
    });
    return toStaffMember(row);
  }
}