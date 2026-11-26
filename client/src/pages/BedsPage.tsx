import { BedDouble, Plus, Trash2, Wrench, X } from 'lucide-react';
import { useCallback, useMemo, useState, type FormEvent } from 'react';
import {
    BED_STATUS_LABELS,
    createBed,
    deleteBed,
    listBeds,
    setBedStatus,
    type Bed,
    type BedStatus,
} from '../api/beds';
import { listBuildings } from '../api/buildings';
import { listRooms, type Room } from '../api/rooms';
import { DataTable, type Column } from '../components/data/DataTable';
import { PlacementFilters } from '../components/data/PlacementFilters';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Field } from '../components/ui/Field';
import { Input, Select } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { MultiSelect } from '../components/ui/MultiSelect';
import { useToast } from '../components/ui/Toast';
import { EMPTY_SELECTION, matchesPlacement, type FilterSelection } from '../lib/filters';
import type { CellValue } from '../lib/table';
import { useAsync } from '../lib/useAsync';
import { useClientTable } from '../lib/useClientTable';

/** Строка таблицы: койка, её комната и номер общежития */
interface BedRow {
    bed: Bed;
    room: Room | undefined;
    buildingNumber: number;
}

const searchText = (row: BedRow): CellValue[] => [
    row.buildingNumber,
    row.room?.roomNumber,
    row.bed.bedNumber,
    BED_STATUS_LABELS[row.bed.status],
];

const sortValue = (row: BedRow, key: string): CellValue => {
    switch (key) {
        case 'building':
            return row.buildingNumber;
        case 'room':
            return row.room?.roomNumber;
        case 'bed':
            return row.bed.bedNumber;
        case 'status':
            return BED_STATUS_LABELS[row.bed.status];
        default:
            return null;
    }
};

const STATUS_OPTIONS: Array<{ value: BedStatus; label: string }> = [
    { value: 'available', label: BED_STATUS_LABELS.available },
    { value: 'maintenance', label: BED_STATUS_LABELS.maintenance },
];

/** Страница «Кровати»: фильтры по общежитию, этажу, комнате и статусу, добавление, смена статуса, удаление */
export default function BedsPage() {
    const toast = useToast();
    const buildings = useAsync(listBuildings);
    const rooms = useAsync(() => listRooms());
    const beds = useAsync(() => listBeds());
    const [selection, setSelection] = useState<FilterSelection>(EMPTY_SELECTION);
    const [statuses, setStatuses] = useState<BedStatus[]>([]);

    const buildingList = useMemo(() => buildings.data ?? [], [buildings.data]);
    const roomList = useMemo(() => rooms.data ?? [], [rooms.data]);
    const roomById = useMemo(() => new Map(roomList.map((r) => [r.id, r])), [roomList]);
    const numberById = useMemo(
        () => new Map(buildingList.map((b) => [b.id, b.buildingNumber])),
        [buildingList]
    );

    const rows = useMemo<BedRow[]>(
        () =>
            (beds.data ?? [])
                .map((bed) => {
                    const room = roomById.get(bed.roomId);
                    return { bed, room, buildingNumber: numberById.get(room?.buildingId ?? '') ?? 0 };
                })
                .filter(
                    (row) =>
                        row.room !== undefined &&
                        matchesPlacement(
                            {
                                buildingId: row.room.buildingId,
                                floor: row.room.floor,
                                roomNumber: row.room.roomNumber,
                            },
                            selection
                        )
                )
                .filter((row) => statuses.length === 0 || statuses.includes(row.bed.status)),
        [beds.data, roomById, numberById, selection, statuses]
    );
    const table = useClientTable<BedRow>({ rows, searchText, sortValue });

    const [adding, setAdding] = useState(false);
    const [formBuilding, setFormBuilding] = useState('');
    const [formRoom, setFormRoom] = useState('');
    const [formNumber, setFormNumber] = useState('');
    const [formError, setFormError] = useState('');
    const [busy, setBusy] = useState(false);
    const [toDelete, setToDelete] = useState<BedRow | null>(null);

    const roomsOfBuilding = roomList.filter((r) => r.buildingId === formBuilding);
    const closeForm = useCallback(() => setAdding(false), []);

    const openForm = () => {
        setAdding(true);
        setFormBuilding(selection.buildings.length === 1 ? selection.buildings[0] : '');
        setFormRoom('');
        setFormNumber('');
        setFormError('');
    };

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (!formRoom || !/^\d+$/.test(formNumber) || Number(formNumber) < 1) {
            setFormError('Выберите комнату и укажите номер койки (целое число от 1)');
            return;
        }
        setBusy(true);
        setFormError('');
        try {
            await createBed(formRoom, Number(formNumber));
            toast.show('Койка добавлена');
            setAdding(false);
            beds.reload();
        } catch (error) {
            // Здесь же сообщение о превышении вместимости комнаты (409)
            setFormError(error instanceof Error ? error.message : 'Не удалось добавить');
        } finally {
            setBusy(false);
        }
    };

    const toggleStatus = async (row: BedRow) => {
        const next: BedStatus = row.bed.status === 'available' ? 'maintenance' : 'available';
        try {
            await setBedStatus(row.bed.id, next);
            toast.show(next === 'maintenance' ? 'Койка переведена на обслуживание' : 'Койка снова доступна');
            beds.reload();
        } catch (error) {
            toast.show(error instanceof Error ? error.message : 'Не удалось изменить статус', 'danger');
        }
    };

    const confirmDelete = async () => {
        if (!toDelete) {
            return;
        }
        setBusy(true);
        try {
            await deleteBed(toDelete.bed.id);
            toast.show('Койка удалена');
            beds.reload();
        } catch (error) {
            toast.show(error instanceof Error ? error.message : 'Не удалось удалить', 'danger');
        } finally {
            setToDelete(null);
            setBusy(false);
        }
    };

    const columns: Column<BedRow>[] = [
        { key: 'building', header: 'Общежитие', render: (r) => <span className="font-medium">№ {r.buildingNumber}</span>, sortValue: (r) => r.buildingNumber },
        { key: 'room', header: 'Комната', render: (r) => r.room?.roomNumber ?? '—', sortValue: (r) => r.room?.roomNumber },
        { key: 'bed', header: 'Койка', align: 'right', render: (r) => <span className="tabular">{r.bed.bedNumber}</span>, sortValue: (r) => r.bed.bedNumber },
        {
            key: 'status',
            header: 'Статус',
            render: (r) => <Badge tone={r.bed.status === 'available' ? 'success' : 'warning'}>{BED_STATUS_LABELS[r.bed.status]}</Badge>,
            sortValue: (r) => BED_STATUS_LABELS[r.bed.status],
        },
        {
            key: 'actions',
            header: '',
            align: 'right',
            render: (r) => (
                <div className="flex justify-end gap-1">
                    <Button
                        variant="ghost"
                        size="sm"
                        aria-label={r.bed.status === 'available' ? 'На обслуживание' : 'Сделать доступной'}
                        title={r.bed.status === 'available' ? 'На обслуживание' : 'Сделать доступной'}
                        onClick={() => toggleStatus(r)}
                    >
                        <Wrench size={16} aria-hidden="true" />
                    </Button>
                    <Button variant="ghost" size="sm" aria-label="Удалить" title="Удалить" onClick={() => setToDelete(r)}>
                        <Trash2 size={16} aria-hidden="true" />
                    </Button>
                </div>
            ),
        },
    ];

    return (
        <>
            <PageHeader
                title="Кровати"
                description="Койки по комнатам; число коек в комнате не превышает её вместимость."
                actions={<Button icon={<Plus size={16} aria-hidden="true" />} onClick={openForm}>Добавить</Button>}
            />
            <DataTable
                columns={columns}
                rows={table.items}
                rowKey={(r) => r.bed.id}
                loading={beds.loading || rooms.loading || buildings.loading}
                error={beds.error || rooms.error || buildings.error}
                onRetry={() => {
                    beds.reload();
                    rooms.reload();
                    buildings.reload();
                }}
                query={table.query}
                onQuery={table.setQuery}
                searchPlaceholder="Поиск по общежитию, комнате, койке"
                sort={table.sort}
                onSort={table.setSort}
                page={table.page}
                pageCount={table.pageCount}
                total={table.total}
                pageSize={table.pageSize}
                onPage={table.setPage}
                toolbar={
                    <>
                        <PlacementFilters
                            buildings={buildingList}
                            rooms={roomList}
                            selection={selection}
                            onChange={(next) => {
                                setSelection(next);
                                table.setPage(1);
                            }}
                        />
                        <MultiSelect
                            label="Статус"
                            options={STATUS_OPTIONS}
                            selected={statuses}
                            onChange={(next) => {
                                setStatuses(next);
                                table.setPage(1);
                            }}
                        />
                    </>
                }
                emptyTitle="Коек не найдено"
                emptyDescription="Измените запрос или фильтры."
            />

            <Modal open={adding} title="Новая койка" onClose={closeForm}>
                <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
                    {formError ? <p role="alert" className="text-sm text-danger">{formError}</p> : null}
                    <Field label="Общежитие" required>
                        {(p) => (
                            <Select {...p} value={formBuilding} onChange={(e) => { setFormBuilding(e.target.value); setFormRoom(''); }}>
                                <option value="">Выберите общежитие</option>
                                {buildingList.map((b) => (
                                    <option key={b.id} value={b.id}>Общежитие {b.buildingNumber}</option>
                                ))}
                            </Select>
                        )}
                    </Field>
                    <Field label="Комната" required>
                        {(p) => (
                            <Select {...p} value={formRoom} disabled={!formBuilding} onChange={(e) => setFormRoom(e.target.value)}>
                                <option value="">Выберите комнату</option>
                                {roomsOfBuilding.map((r) => (
                                    <option key={r.id} value={r.id}>{r.roomNumber} (мест: {r.capacity})</option>
                                ))}
                            </Select>
                        )}
                    </Field>
                    <Field label="Номер койки" required>
                        {(p) => <Input {...p} inputMode="numeric" value={formNumber} onChange={(e) => setFormNumber(e.target.value)} />}
                    </Field>
                    <div className="mt-2 flex justify-end gap-2">
                        <Button variant="secondary" icon={<X size={16} aria-hidden="true" />} onClick={closeForm}>Отмена</Button>
                        <Button type="submit" loading={busy} icon={<BedDouble size={16} aria-hidden="true" />}>Добавить</Button>
                    </div>
                </form>
            </Modal>

            <ConfirmDialog
                open={toDelete !== null}
                title="Удалить койку?"
                message={`Койка ${toDelete?.bed.bedNumber ?? ''} в комнате ${toDelete?.room?.roomNumber ?? ''} будет удалена. Если по ней есть договоры, сервер откажет.`}
                confirmLabel="Удалить"
                danger
                loading={busy}
                onConfirm={confirmDelete}
                onCancel={() => setToDelete(null)}
            />
        </>
    );
}