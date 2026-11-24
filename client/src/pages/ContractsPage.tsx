import { Ban, CalendarX, CheckCircle2, FilePlus2, Plus, XCircle } from 'lucide-react';
import { useCallback, useMemo, useState, type FormEvent } from 'react';
import { listBeds } from '../api/beds';
import { listBuildings } from '../api/buildings';
import {
    CONTRACT_STATUS_LABELS,
    createContract,
    listContracts,
    runContractAction,
    type Contract,
    type ContractAction,
    type ContractStatus,
} from '../api/contracts';
import { listRooms } from '../api/rooms';
import { listStudents } from '../api/students';
import { DataTable, type Column } from '../components/data/DataTable';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge, type Tone } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Field } from '../components/ui/Field';
import { Input, Select, Textarea } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';
import {
    EMPTY_CONTRACT_FORM,
    rateOrUndefined,
    validateContractForm,
    type ContractFormErrors,
    type ContractFormValues,
} from '../lib/contractForm';
import { formatDate, formatMoney } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { useDebounced } from '../lib/useDebounced';

const PAGE_SIZE = 20;

const TONES: Record<ContractStatus, Tone> = {
    pending: 'info',
    active: 'success',
    terminated: 'danger',
    expired: 'neutral',
    cancelled: 'neutral',
};

const ACTION_TEXT: Record<ContractAction, { title: string; message: string; label: string; danger: boolean; done: string }> = {
    activate: { title: 'Активировать договор?', message: 'Договор станет действующим.', label: 'Активировать', danger: false, done: 'Договор активирован' },
    cancel: { title: 'Отменить договор?', message: 'Ожидающий договор будет отменён, койка освободится. Действие нельзя отменить.', label: 'Отменить договор', danger: true, done: 'Договор отменён' },
    terminate: { title: 'Расторгнуть договор?', message: 'Действующий договор будет расторгнут, койка освободится. Действие нельзя отменить.', label: 'Расторгнуть', danger: true, done: 'Договор расторгнут' },
    expire: { title: 'Завершить договор по сроку?', message: 'Договор будет помечен как истёкший. Это возможно, только если срок уже вышел.', label: 'Завершить', danger: false, done: 'Договор завершён' },
};

/** Страница «Договоры»: список (страницы на сервере), сообщежитие, действия жизненного цикла */
export default function ContractsPage() {
    const toast = useToast();
    const [page, setPage] = useState(1);
    const [status, setStatus] = useState<ContractStatus | ''>('');
    const [query, setQuery] = useState('');
    const debounced = useDebounced(query.trim());

    const contracts = useAsync(
        () => listContracts({ status, studentId: '', limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
        [status, page]
    );
    // Справочники для подписей и формы сообщежития
    const students = useAsync(() => listStudents({ q: '', faculty: '', groupName: '', limit: 200, offset: 0 }));
    const buildings = useAsync(listBuildings);
    const rooms = useAsync(() => listRooms());
    const beds = useAsync(() => listBeds());

    const studentName = useMemo(
        () => new Map((students.data?.items ?? []).map((s) => [s.id, s.displayName])),
        [students.data]
    );
    const bedInfo = useMemo(() => {
        const roomById = new Map((rooms.data ?? []).map((r) => [r.id, r]));
        const numberById = new Map((buildings.data ?? []).map((b) => [b.id, b.buildingNumber]));
        return new Map(
            (beds.data ?? []).map((bed) => {
                const room = roomById.get(bed.roomId);
                return [bed.id, `№ ${numberById.get(room?.buildingId ?? '') ?? '?'} · комн. ${room?.roomNumber ?? '?'} · кр. ${bed.bedNumber}`];
            })
        );
    }, [beds.data, rooms.data, buildings.data]);

    // Поиск по имени студента и койке выполняется по текущей странице
    const items = (contracts.data?.items ?? []).filter((c) => {
        const text = `${studentName.get(c.studentId) ?? ''} ${bedInfo.get(c.bedId) ?? ''}`.toLowerCase();
        return debounced.toLowerCase().split(/\s+/).filter(Boolean).every((w) => text.includes(w));
    });
    const total = contracts.data?.meta.total ?? 0;

    const [creating, setCreating] = useState(false);
    const [form, setForm] = useState<ContractFormValues>(EMPTY_CONTRACT_FORM);
    const [errors, setErrors] = useState<ContractFormErrors>({});
    const [formError, setFormError] = useState('');
    const [busy, setBusy] = useState(false);
    const [pending, setPending] = useState<{ contract: Contract; action: ContractAction } | null>(null);
    const [reason, setReason] = useState('');

    const patch = (change: Partial<ContractFormValues>) => setForm((prev) => ({ ...prev, ...change }));
    const closeForm = useCallback(() => setCreating(false), []);
    const openForm = () => {
        setForm(EMPTY_CONTRACT_FORM);
        setErrors({});
        setFormError('');
        setCreating(true);
    };

    const roomsOfBuilding = (rooms.data ?? []).filter((r) => r.buildingId === form.buildingId);
    const bedsOfRoom = (beds.data ?? []).filter((b) => b.roomId === form.roomId && b.status === 'available');

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        const found = validateContractForm(form);
        setErrors(found);
        if (Object.keys(found).length > 0) return;
        setBusy(true);
        setFormError('');
        try {
            await createContract({
                studentId: form.studentId,
                bedId: form.bedId,
                startDate: form.startDate,
                endDate: form.endDate,
                monthlyRate: rateOrUndefined(form.monthlyRate),
            });
            toast.show('Договор оформлен');
            setCreating(false);
            contracts.reload();
        } catch (error) {
            setFormError(error instanceof Error ? error.message : 'Не удалось оформить');
        } finally {
            setBusy(false);
        }
    };

    const confirmAction = async () => {
        if (!pending) return;
        setBusy(true);
        try {
            await runContractAction(pending.contract.id, pending.action, pending.action === 'terminate' ? reason.trim() || undefined : undefined);
            toast.show(ACTION_TEXT[pending.action].done);
            contracts.reload();
        } catch (error) {
            toast.show(error instanceof Error ? error.message : 'Действие не выполнено', 'danger');
        } finally {
            setPending(null);
            setReason('');
            setBusy(false);
        }
    };

    const actionButton = (c: Contract, action: ContractAction, Icon: typeof Ban, title: string) => (
        <Button variant="ghost" size="sm" aria-label={title} title={title} onClick={() => setPending({ contract: c, action })}>
            <Icon size={16} aria-hidden="true" />
        </Button>
    );

    const columns: Column<Contract>[] = [
        { key: 'student', header: 'Студент', render: (c) => <span className="font-medium">{studentName.get(c.studentId) ?? '—'}</span> },
        { key: 'bed', header: 'Койка', render: (c) => bedInfo.get(c.bedId) ?? '—', hideOnMobile: true },
        { key: 'period', header: 'Период', render: (c) => <span className="tabular">{formatDate(c.startDate)} — {formatDate(c.endDate)}</span> },
        { key: 'rate', header: 'Плата', align: 'right', render: (c) => <span className="tabular">{formatMoney(c.monthlyRate)}</span>, hideOnMobile: true },
        { key: 'status', header: 'Статус', render: (c) => <Badge tone={TONES[c.status]}>{CONTRACT_STATUS_LABELS[c.status]}</Badge> },
        {
            key: 'actions',
            header: '',
            align: 'right',
            render: (c) => (
                <div className="flex justify-end gap-1">
                    {c.status === 'pending' ? actionButton(c, 'activate', CheckCircle2, 'Активировать') : null}
                    {c.status === 'pending' ? actionButton(c, 'cancel', XCircle, 'Отменить') : null}
                    {c.status === 'active' ? actionButton(c, 'terminate', Ban, 'Расторгнуть') : null}
                    {c.status === 'active' ? actionButton(c, 'expire', CalendarX, 'Завершить по сроку') : null}
                </div>
            ),
        },
    ];

    const text = pending ? ACTION_TEXT[pending.action] : null;

    return (
        <>
            <PageHeader
                title="Договоры"
                description="Проживание студентов: оформление и жизненный цикл."
                actions={<Button icon={<Plus size={16} aria-hidden="true" />} onClick={openForm}>Оформить</Button>}
            />
            <DataTable
                columns={columns}
                rows={items}
                rowKey={(c) => c.id}
                loading={contracts.loading}
                error={contracts.error}
                onRetry={contracts.reload}
                query={query}
                onQuery={setQuery}
                searchPlaceholder="Поиск по студенту или койке (на этой странице)"
                sort={null}
                onSort={() => undefined}
                page={page}
                pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
                total={total}
                pageSize={PAGE_SIZE}
                onPage={setPage}
                toolbar={
                    <div className="w-44">
                        <Select
                            aria-label="Фильтр по статусу"
                            value={status}
                            onChange={(e) => {
                                setStatus(e.target.value as ContractStatus | '');
                                setPage(1);
                            }}
                        >
                            <option value="">Все статусы</option>
                            {(Object.keys(CONTRACT_STATUS_LABELS) as ContractStatus[]).map((s) => (
                                <option key={s} value={s}>{CONTRACT_STATUS_LABELS[s]}</option>
                            ))}
                        </Select>
                    </div>
                }
                emptyTitle="Договоров не найдено"
                emptyDescription="Измените фильтр или оформите договор."
            />

            <Modal open={creating} title="Новый договор" onClose={closeForm}>
                <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
                    {formError ? <p role="alert" className="text-sm text-danger">{formError}</p> : null}
                    <Field label="Студент" required error={errors.studentId}>
                        {(p) => (
                            <Select {...p} value={form.studentId} onChange={(e) => patch({ studentId: e.target.value })}>
                                <option value="">Выберите студента</option>
                                {(students.data?.items ?? []).map((s) => (
                                    <option key={s.id} value={s.id}>{s.displayName} ({s.studentNumber})</option>
                                ))}
                            </Select>
                        )}
                    </Field>
                    <div className="grid grid-cols-3 gap-3">
                        <Field label="Общежитие">
                            {(p) => (
                                <Select {...p} value={form.buildingId} onChange={(e) => patch({ buildingId: e.target.value, roomId: '', bedId: '' })}>
                                    <option value="">—</option>
                                    {(buildings.data ?? []).map((b) => (
                                        <option key={b.id} value={b.id}>№ {b.buildingNumber}</option>
                                    ))}
                                </Select>
                            )}
                        </Field>
                        <Field label="Комната">
                            {(p) => (
                                <Select {...p} value={form.roomId} disabled={!form.buildingId} onChange={(e) => patch({ roomId: e.target.value, bedId: '' })}>
                                    <option value="">—</option>
                                    {roomsOfBuilding.map((r) => (
                                        <option key={r.id} value={r.id}>{r.roomNumber}</option>
                                    ))}
                                </Select>
                            )}
                        </Field>
                        <Field label="Койка" required error={errors.bedId}>
                            {(p) => (
                                <Select {...p} value={form.bedId} disabled={!form.roomId} onChange={(e) => patch({ bedId: e.target.value })}>
                                    <option value="">—</option>
                                    {bedsOfRoom.map((b) => (
                                        <option key={b.id} value={b.id}>{b.bedNumber}</option>
                                    ))}
                                </Select>
                            )}
                        </Field>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Начало" required error={errors.startDate}>
                            {(p) => <Input {...p} type="date" value={form.startDate} onChange={(e) => patch({ startDate: e.target.value })} />}
                        </Field>
                        <Field label="Окончание" required error={errors.endDate}>
                            {(p) => <Input {...p} type="date" value={form.endDate} onChange={(e) => patch({ endDate: e.target.value })} />}
                        </Field>
                    </div>
                    <Field label="Плата, ₽/мес" error={errors.monthlyRate} hint="Пусто — ставка общежития">
                        {(p) => <Input {...p} inputMode="decimal" value={form.monthlyRate} onChange={(e) => patch({ monthlyRate: e.target.value })} />}
                    </Field>
                    <div className="mt-2 flex justify-end gap-2">
                        <Button variant="secondary" onClick={closeForm}>Отмена</Button>
                        <Button type="submit" loading={busy} icon={<FilePlus2 size={16} aria-hidden="true" />}>Оформить</Button>
                    </div>
                </form>
            </Modal>

            <ConfirmDialog
                open={pending !== null}
                title={text?.title ?? ''}
                message={text?.message ?? ''}
                confirmLabel={text?.label ?? ''}
                danger={text?.danger}
                loading={busy}
                onConfirm={confirmAction}
                onCancel={() => {
                    setPending(null);
                    setReason('');
                }}
            />
            {pending?.action === 'terminate' ? (
                <div className="sr-only">
                    <Textarea aria-label="Причина расторжения" value={reason} onChange={(e) => setReason(e.target.value)} />
                </div>
            ) : null}
        </>
    );
}