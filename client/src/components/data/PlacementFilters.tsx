import { useMemo } from 'react';
import {
  floorOptions,
  pruneSelection,
  roomNumberOptions,
  type FilterSelection,
} from '../../lib/filters';
import { MultiSelect } from '../ui/MultiSelect';

export interface PlacementFiltersProps {
  buildings: Array<{ id: string; buildingNumber: number }>;
  rooms: Array<{ id: string; buildingId: string; floor: number; roomNumber: string }>;
  selection: FilterSelection;
  onChange: (selection: FilterSelection) => void;
}

/** Три связанных фильтра: общежитие, этаж, номер комнаты (комнаты доступны после выбора общежития) */
export function PlacementFilters({ buildings, rooms, selection, onChange }: PlacementFiltersProps) {
  const buildingOpts = useMemo(
    () => buildings.map((b) => ({ value: b.id, label: `№ ${b.buildingNumber}` })),
    [buildings]
  );
  const floorOpts = useMemo(
    () =>
      floorOptions(rooms, selection.buildings).map((floor) => ({
        value: floor,
        label: String(floor),
      })),
    [rooms, selection.buildings]
  );
  // Один пункт на номер комнаты: одинаковые номера разных общежитий объединяются
  const roomOpts = useMemo(
    () =>
      roomNumberOptions(rooms, selection.buildings, selection.floors).map((number) => ({
        value: number,
        label: number,
      })),
    [rooms, selection.buildings, selection.floors]
  );

  // После каждого изменения лишний выбор убирается
  const update = (next: FilterSelection) => onChange(pruneSelection(next, rooms));

  return (
    <>
      <MultiSelect
        label="Общежитие"
        options={buildingOpts}
        selected={selection.buildings}
        onChange={(ids) => update({ ...selection, buildings: ids })}
      />
      <MultiSelect
        label="Этаж"
        options={floorOpts}
        selected={selection.floors}
        onChange={(floors) => update({ ...selection, floors })}
      />
      <MultiSelect
        label="Комната"
        options={roomOpts}
        selected={selection.rooms}
        onChange={(numbers) => update({ ...selection, rooms: numbers })}
        disabled={selection.buildings.length === 0}
        emptyHint={selection.buildings.length === 0 ? 'Сначала выберите общежитие' : 'Нет вариантов'}
      />
    </>
  );
}