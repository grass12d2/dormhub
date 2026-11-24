import { DoorOpen, Pencil, Plus, Trash2 } from 'lucide-react';
import { useCallback, useMemo, useState, type FormEvent } from 'react';
import { listBuildings } from '../api/buildings';
import { createRoom, deleteRoom, listRooms, updateRoom, type Room } from '../api/rooms';
import { DataTable, type Column } from '../components/data/DataTable';
import { PlacementFilters } from '../components/data/PlacementFilters';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Field } from '../components/ui/Field';
import { Input, Select } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';
import { EMPTY_SELECTION, matchesPlacement, type FilterSelection } from '../lib/filters';
import {
    EMPTY_ROOM_FORM,
    toRoomInput,
    validateRoomForm,
    type RoomFormErrors,
    type RoomFormValues,
} from '../lib/roomForm';
import type { CellValue } from '../lib/table';
import { useAsync } from '../lib/useAsync';
import { useClientTable } from '../lib/useClientTable';

/** Строка таблицы: комната и номер её общежития */
interface RoomRow {
    room: Room;
    buildingNumber: number;
}

const searchText = (row: RoomRow): CellValue[] => [row.buildingNumber, row.room.roomNumber, row.room.floor];

const sortValue = (row: RoomRow, key: string): CellValue => {
    switch (key) {
        case 'building':
            return row.buildingNumber;
        case 'floor':
            return row.room.floor;
        case 'number':
            return row.room.roomNumber;
        case 'capacity':
            return row.room.capacity;
        default:
            return null;
    }
};

/** Страница «Комнаты»: фильтры по общежитию, этажу и комнате, сообщежитие, изменение, удаление */
export default function RoomsPage() {
    const toast = useToast();
    const buildings = useAsync(listBuildings);
    const rooms = useAsync(() => listRooms());
    const [selection, setSelection] = useState<FilterSelection>(EMPTY_SELECTION);

    const buildingList = useMemo(() => buildings.data ?? [], [buildings.data]);
    const roomList = useMemo(() => rooms.data ?? [], [rooms.data]);
    const numberById = useMemo(
        () => new Map(buildingList.map((b) => [b.id, b.buildingNumber])),
        [buildingList]
    );

    const rows = useMemo<RoomRow[]>(
        () =>
            roomList
                .filter((room) =>
                    matchesPlacement(
                        { buildingId: room.buildingId, floor: room.floor, roomNumber: room.roomNumber },
                        selection
                    )
                )
                .map((room) => ({ room, buildingNumber: numberById.get(room.buildingId) ?? 0 })),
        [roomList, selection, numberById]
    );
    const table = useClientTable<RoomRow>({ rows, searchText, sortValue });

    const [editing, setEditing] = useState<Room | 'new' | null>(null);
    const [form, setForm] = useState<RoomFormValues>(EMPTY_ROOM_FORM);
    const [errors, setErrors] = useState<RoomFormErrors>({});
    const [formError, setFormError] = useState('');
    const [busy, setBusy] = useState(false);
    const [toDelete, setToDelete] = useState<Room | null>(null);

    const openForm = (target: Room | 'new') => {
        setEditing(target);
        setForm(
            target === 'new'
                ? { ...EMPTY_ROOM_FORM, buildingId: selection.buildings.length === 1 ? selection.buildings[0] : '' }
                : {
                    buildingId: target.buildingId,
                    roomNumber: target.roomNumber,
                    floor: String(target.floor),
                    capacity: String(target.capacity),
                }
        );
        setErrors({});
        setFormError('');
    };
    const closeForm = useCallback(() => setEditing(null), []);

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        const floors = buildingList.find((b) => b.id === form.buildingId)?.floorsCount;
        const found = validateRoomForm(form, floors);
        setErrors(found);
        if (Object.keys(found).length > 0 || editing === null) {
            return;
        }
        setBusy(true);
        setFormError('');
        try {
            const input = toRoomInput(form);
            if (editing === 'new') {
                await createRoom(input);
            } else {
                await updateRoom(editing.id, input);
            }
            toast.show(editing === 'new' ? 'Комната создана' : 'Изменения сохранены');
            setEditing(null);
            rooms.reload();
        } catch (error) {
            setFormError(error instanceof Error ? error.message : 'Не удалось сохранить');
        } finally {
            setBusy(false);
        }
    };

    const confirmDelete = async () => {
        if (!toDelete) {
            return;
        }
        setBusy(true);
        try {
            await deleteRoom(toDelete.id);
            toast.show('Комната удалена');
            rooms.reload();
        } catch (error) {
            toast.show(error instanceof Error ? error.message : 'Не удалось удалить', 'danger');
        } finally {
            setToDelete(null);
            setBusy(false);
        }
    };

    const columns: Column<RoomRow>[] = [
        { key: 'building', header: 'Общежитие', render: (r) => <span className="font-medium">№ {r.buildingNumber}</span>, sortValue: (r) => r.buildingNumber },
        { key: 'floor', header: 'Этаж', align: 'right', render: (r) => <span className="tabular">{r.room.floor}</span>, sortValue: (r) => r.room.floor },
        { key: 'number', header: 'Комната', render: (r) => <span className="font-medium">{r.room.roomNumber}</span>, sortValue: (r) => r.room.roomNumber },
        { key: 'capacity', header: 'Мест', align: 'right', render: (r) => <span className="tabular">{r.room.capacity}</span>, sortValue: (r) => r.room.capacity, hideOnMobile: true },
        {
            key: 'actions',
            header: '',
            align: 'right',
            render: (r) => (
                <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" aria-label="Изменить" title="Изменить" onClick={() => openForm(r.room)}>
                        <Pencil size={16} aria-hidden="true" />
                    </Button>
                    <Button variant="ghost" size="sm" aria-label="Удалить" title="Удалить" onClick={() => setToDelete(r.room)}>
                        <Trash2 size={16} aria-hidden="true" />
                    </Button>
                </div>
            ),
        },
    ];

    return (
        <>
            <PageHeader
                title="Комнаты"
                description="Жилые комнаты общежитий (со второго этажа)."
                actions={<Button icon={<Plus size={16} aria-hidden="true" />} onClick={() => openForm('new')}>Добавить</Button>}
            />
            <DataTable
                columns={columns}
                rows={table.items}
                rowKey={(r) => r.room.id}
                loading={rooms.loading || buildings.loading}
                error={rooms.error || buildings.error}
                onRetry={() => {
                    rooms.reload();
                    buildings.reload();
                }}
                query={table.query}
                onQuery={table.setQuery}
                searchPlaceholder="Поиск по номеру комнаты, этажу, общежитию"
                sort={table.sort}
                onSort={table.setSort}
                page={table.page}
                pageCount={table.pageCount}
                total={table.total}
                pageSize={table.pageSize}
                onPage={table.setPage}
                toolbar={
                    <PlacementFilters
                        buildings={buildingList}
                        rooms={roomList}
                        selection={selection}
                        onChange={(next) => {
                            setSelection(next);
                            table.setPage(1);
                        }}
                    />
                }
                emptyTitle="Комнат не найдено"
                emptyDescription="Измените запрос или фильтры, либо добавьте комнату."
            />

            <Modal open={editing !== null} title={editing === 'new' ? 'Новая комната' : 'Изменить комнату'} onClose={closeForm}>
                <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
                    {formError ? <p role="alert" className="text-sm text-danger">{formError}</p> : null}
                    <Field label="Общежитие" required error={errors.buildingId}>
                        {(p) => (
                            <Select {...p} value={form.buildingId} onChange={(e) => setForm({ ...form, buildingId: e.target.value })}>
                                <option value="">Выберите общежитие</option>
                                {buildingList.map((b) => (
                                    <option key={b.id} value={b.id}>Общежитие {b.buildingNumber}, {b.floorsCount} эт.</option>
                                ))}
                            </Select>
                        )}
                    </Field>
                    <div className="grid grid-cols-3 gap-3">
                        <Field label="Этаж" required error={errors.floor}>
                            {(p) => <Input {...p} inputMode="numeric" value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })} />}
                        </Field>
                        <Field label="Комната" required error={errors.roomNumber}>
                            {(p) => <Input {...p} value={form.roomNumber} onChange={(e) => setForm({ ...form, roomNumber: e.target.value })} />}
                        </Field>
                        <Field label="Мест" required error={errors.capacity}>
                            {(p) => <Input {...p} inputMode="numeric" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />}
                        </Field>
                    </div>
                    <p className="text-xs text-muted">
                        Формат номера: 201 для коридорных и квартирных общежитий, 7-3-2 или 732 для блочных.
                    </p>
                    <div className="mt-2 flex justify-end gap-2">
                        <Button variant="secondary" onClick={closeForm}>Отмена</Button>
                        <Button type="submit" loading={busy} icon={<DoorOpen size={16} aria-hidden="true" />}>Сохранить</Button>
                    </div>
                </form>
            </Modal>

            <ConfirmDialog
                open={toDelete !== null}
                title="Удалить комнату?"
                message={`Комната ${toDelete?.roomNumber ?? ''} будет удалена. Если в ней есть койки, сервер откажет.`}
                confirmLabel="Удалить"
                danger
                loading={busy}
                onConfirm={confirmDelete}
                onCancel={() => setToDelete(null)}
            />
        </>
    );
}