import { Ban, Banknote, Plus, ReceiptText } from 'lucide-react';
import { useCallback, useMemo, useState, type FormEvent } from 'react';
import { listBeds } from '../api/beds';
import { listBuildings } from '../api/buildings';
import { listContracts } from '../api/contracts';
import {
    INVOICE_STATUS_LABELS,
    METHOD_LABELS,
    cancelInvoice,
    createInvoice,
    createPayment,
    listInvoices,
    type Invoice,
    type InvoiceStatus,
    type PaymentMethod,
} from '../api/invoices';
import { listRooms } from '../api/rooms';
import { listStudents } from '../api/students';
import { DataTable, type Column } from '../components/data/DataTable';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge, type Tone } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Field } from '../components/ui/Field';
import { Input, Select } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';
import { formatDate, formatMoney } from '../lib/format';
import {
    EMPTY_INVOICE_FORM,
    parseMoney,
    validateInvoiceForm,
    validatePaymentAmount,
    type InvoiceFormErrors,
    type InvoiceFormValues,
} from '../lib/moneyForm';
import { useAsync } from '../lib/useAsync';
import { useDebounced } from '../lib/useDebounced';

const PAGE_SIZE = 20;

const TONES: Record<InvoiceStatus, Tone> = {
    unpaid: 'warning',
    partially_paid: 'info',
    paid: 'success',
    cancelled: 'neutral',
};

/** Страница «Счета»: список (страницы на сервере), выставление, приём платежа, отмена */
export default function InvoicesPage() {
    const toast = useToast();
    const [page, setPage] = useState(1);
    const [status, setStatus] = useState<InvoiceStatus | ''>('');
    const [overdue, setOverdue] = useState(false);
    const [query, setQuery] = useState('');
    const debounced = useDebounced(query.trim());

    const invoices = useAsync(
        () => listInvoices({ status, overdue, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
        [status, overdue, page]
    );

    // Справочники: подписи договоров (студент и койка) и список для формы
    const contracts = useAsync(() => listContracts({ status: '', studentId: '', limit: 200, offset: 0 }));
    const students = useAsync(() => listStudents({ q: '', faculty: '', groupName: '', limit: 200, offset: 0 }));
    const buildings = useAsync(listBuildings);
    const rooms = useAsync(() => listRooms());
    const beds = useAsync(() => listBeds());

    const contractLabel = useMemo(() => {
        const names = new Map((students.data?.items ?? []).map((s) => [s.id, s.displayName]));
        const roomById = new Map((rooms.data ?? []).map((r) => [r.id, r]));
        const numberById = new Map((buildings.data ?? []).map((b) => [b.id, b.buildingNumber]));
        const bedById = new Map((beds.data ?? []).map((b) => [b.id, b]));
        return new Map(
            (contracts.data?.items ?? []).map((c) => {
                const bed = bedById.get(c.bedId);
                const room = roomById.get(bed?.roomId ?? '');
                const where = `№ ${numberById.get(room?.buildingId ?? '') ?? '?'} · ${room?.roomNumber ?? '?'}`;
                return [c.id, `${names.get(c.studentId) ?? '—'} (${where})`];
            })
        );
    }, [contracts.data, students.data, rooms.data, buildings.data, beds.data]);

    // Поиск по описанию, номеру и студенту работает по текущей странице
    const items = (invoices.data?.items ?? []).filter((i) => {
        const text = `${i.invoiceNumber} ${i.description} ${contractLabel.get(i.contractId) ?? ''}`.toLowerCase();
        return debounced.toLowerCase().split(/\s+/).filter(Boolean).every((w) => text.includes(w));
    });
    const total = invoices.data?.meta.total ?? 0;

    const [creating, setCreating] = useState(false);
    const [form, setForm] = useState<InvoiceFormValues>(EMPTY_INVOICE_FORM);
    const [errors, setErrors] = useState<InvoiceFormErrors>({});
    const [formError, setFormError] = useState('');
    const [busy, setBusy] = useState(false);

    const [paying, setPaying] = useState<Invoice | null>(null);
    const [payAmount, setPayAmount] = useState('');
    const [payMethod, setPayMethod] = useState<PaymentMethod>('cash');
    const [payRef, setPayRef] = useState('');
    const [payError, setPayError] = useState('');
    const [toCancel, setToCancel] = useState<Invoice | null>(null);

    const closeForm = useCallback(() => setCreating(false), []);
    const closePay = useCallback(() => setPaying(null), []);

    const openForm = () => {
        setForm(EMPTY_INVOICE_FORM);
        setErrors({});
        setFormError('');
        setCreating(true);
    };

    const openPay = (invoice: Invoice) => {
        setPaying(invoice);
        setPayAmount(String(invoice.remainingAmount));
        setPayMethod('cash');
        setPayRef('');
        setPayError('');
    };

    const submitInvoice = async (event: FormEvent) => {
        event.preventDefault();
        const found = validateInvoiceForm(form);
        setErrors(found);
        if (Object.keys(found).length > 0) return;
        setBusy(true);
        setFormError('');
        try {
            await createInvoice({
                contractId: form.contractId,
                description: form.description.trim(),
                amount: parseMoney(form.amount) as number,
                dueDate: form.dueDate,
            });
            toast.show('Счёт выставлен');
            setCreating(false);
            invoices.reload();
        } catch (error) {
            setFormError(error instanceof Error ? error.message : 'Не удалось выставить счёт');
        } finally {
            setBusy(false);
        }
    };

    const submitPayment = async (event: FormEvent) => {
        event.preventDefault();
        if (!paying) return;
        const problem = validatePaymentAmount(payAmount, paying.remainingAmount);
        if (problem) {
            setPayError(problem);
            return;
        }
        setBusy(true);
        setPayError('');
        try {
            await createPayment({
                invoiceId: paying.id,
                amount: parseMoney(payAmount) as number,
                method: payMethod,
                reference: payRef.trim() || undefined,
            });
            toast.show('Платёж принят');
            setPaying(null);
            invoices.reload();
        } catch (error) {
            // Здесь же сообщения сервера: счёт оплачен, отменён, превышен остаток
            setPayError(error instanceof Error ? error.message : 'Не удалось принять платёж');
        } finally {
            setBusy(false);
        }
    };

    const confirmCancel = async () => {
        if (!toCancel) return;
        setBusy(true);
        try {
            await cancelInvoice(toCancel.id);
            toast.show('Счёт отменён');
            invoices.reload();
        } catch (error) {
            toast.show(error instanceof Error ? error.message : 'Не удалось отменить', 'danger');
        } finally {
            setToCancel(null);
            setBusy(false);
        }
    };

    const columns: Column<Invoice>[] = [
        { key: 'number', header: '№', render: (i) => <span className="tabular font-medium">{i.invoiceNumber}</span> },
        {
            key: 'what',
            header: 'Счёт',
            render: (i) => (
                <span>
                    <span className="block font-medium">{i.description}</span>
                    <span className="block text-xs text-muted">{contractLabel.get(i.contractId) ?? '—'}</span>
                </span>
            ),
        },
        { key: 'due', header: 'Срок', render: (i) => <span className="tabular">{formatDate(i.dueDate)}</span>, hideOnMobile: true },
        { key: 'amount', header: 'Сумма', align: 'right', render: (i) => <span className="tabular">{formatMoney(i.amount)}</span> },
        {
            key: 'left',
            header: 'Остаток',
            align: 'right',
            render: (i) => <span className="tabular">{formatMoney(i.remainingAmount)}</span>,
            hideOnMobile: true,
        },
        {
            key: 'status',
            header: 'Статус',
            render: (i) => (
                <span className="flex flex-wrap gap-1">
                    <Badge tone={TONES[i.status]}>{INVOICE_STATUS_LABELS[i.status]}</Badge>
                    {i.isOverdue ? <Badge tone="danger">Просрочен</Badge> : null}
                </span>
            ),
        },
        {
            key: 'actions',
            header: '',
            align: 'right',
            render: (i) => (
                <div className="flex justify-end gap-1">
                    {i.status === 'unpaid' || i.status === 'partially_paid' ? (
                        <Button variant="ghost" size="sm" aria-label="Принять платёж" title="Принять платёж" onClick={() => openPay(i)}>
                            <Banknote size={16} aria-hidden="true" />
                        </Button>
                    ) : null}
                    {i.status === 'unpaid' ? (
                        <Button variant="ghost" size="sm" aria-label="Отменить счёт" title="Отменить счёт" onClick={() => setToCancel(i)}>
                            <Ban size={16} aria-hidden="true" />
                        </Button>
                    ) : null}
                </div>
            ),
        },
    ];

    return (
        <>
            <PageHeader
                title="Счета"
                description="Выставление счетов и приём платежей."
                actions={<Button icon={<Plus size={16} aria-hidden="true" />} onClick={openForm}>Выставить</Button>}
            />
            <DataTable
                columns={columns}
                rows={items}
                rowKey={(i) => i.id}
                loading={invoices.loading}
                error={invoices.error}
                onRetry={invoices.reload}
                query={query}
                onQuery={setQuery}
                searchPlaceholder="Поиск по номеру, описанию, студенту (на этой странице)"
                sort={null}
                onSort={() => undefined}
                page={page}
                pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
                total={total}
                pageSize={PAGE_SIZE}
                onPage={setPage}
                toolbar={
                    <>
                        <div className="w-48">
                            <Select
                                aria-label="Фильтр по статусу"
                                value={status}
                                onChange={(e) => {
                                    setStatus(e.target.value as InvoiceStatus | '');
                                    setPage(1);
                                }}
                            >
                                <option value="">Все статусы</option>
                                {(Object.keys(INVOICE_STATUS_LABELS) as InvoiceStatus[]).map((s) => (
                                    <option key={s} value={s}>{INVOICE_STATUS_LABELS[s]}</option>
                                ))}
                            </Select>
                        </div>
                        <label className="flex h-10 cursor-pointer items-center gap-2 text-sm font-medium">
                            <input
                                type="checkbox"
                                className="size-4 accent-[var(--primary)]"
                                checked={overdue}
                                onChange={(e) => {
                                    setOverdue(e.target.checked);
                                    setPage(1);
                                }}
                            />
                            Просроченные
                        </label>
                    </>
                }
                emptyTitle="Счетов не найдено"
                emptyDescription="Измените фильтры или выставьте счёт."
            />

            <Modal open={creating} title="Новый счёт" onClose={closeForm}>
                <form onSubmit={submitInvoice} className="flex flex-col gap-3" noValidate>
                    {formError ? <p role="alert" className="text-sm text-danger">{formError}</p> : null}
                    <Field label="Договор" required error={errors.contractId}>
                        {(p) => (
                            <Select {...p} value={form.contractId} onChange={(e) => setForm({ ...form, contractId: e.target.value })}>
                                <option value="">Выберите договор</option>
                                {(contracts.data?.items ?? [])
                                    .filter((c) => c.status !== 'cancelled')
                                    .map((c) => (
                                        <option key={c.id} value={c.id}>{contractLabel.get(c.id) ?? c.id}</option>
                                    ))}
                            </Select>
                        )}
                    </Field>
                    <Field label="Описание" required error={errors.description}>
                        {(p) => <Input {...p} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />}
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Сумма, ₽" required error={errors.amount}>
                            {(p) => <Input {...p} inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />}
                        </Field>
                        <Field label="Срок оплаты" required error={errors.dueDate}>
                            {(p) => <Input {...p} type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />}
                        </Field>
                    </div>
                    <div className="mt-2 flex justify-end gap-2">
                        <Button variant="secondary" onClick={closeForm}>Отмена</Button>
                        <Button type="submit" loading={busy} icon={<ReceiptText size={16} aria-hidden="true" />}>Выставить</Button>
                    </div>
                </form>
            </Modal>

            <Modal open={paying !== null} title={`Платёж по счёту № ${paying?.invoiceNumber ?? ''}`} onClose={closePay}>
                <form onSubmit={submitPayment} className="flex flex-col gap-3" noValidate>
                    <p className="text-sm text-muted">Остаток по счёту: {formatMoney(paying?.remainingAmount ?? 0)}</p>
                    {payError ? <p role="alert" className="text-sm text-danger">{payError}</p> : null}
                    <Field label="Сумма, ₽" required>
                        {(p) => <Input {...p} inputMode="decimal" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />}
                    </Field>
                    <Field label="Способ оплаты">
                        {(p) => (
                            <Select {...p} value={payMethod} onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}>
                                {(Object.keys(METHOD_LABELS) as PaymentMethod[]).map((m) => (
                                    <option key={m} value={m}>{METHOD_LABELS[m]}</option>
                                ))}
                            </Select>
                        )}
                    </Field>
                    <Field label="Номер платёжного документа">
                        {(p) => <Input {...p} value={payRef} onChange={(e) => setPayRef(e.target.value)} />}
                    </Field>
                    <p className="text-xs text-muted">Платёж нельзя изменить или удалить после записи.</p>
                    <div className="mt-2 flex justify-end gap-2">
                        <Button variant="secondary" onClick={closePay}>Отмена</Button>
                        <Button type="submit" loading={busy} icon={<Banknote size={16} aria-hidden="true" />}>Принять платёж</Button>
                    </div>
                </form>
            </Modal>

            <ConfirmDialog
                open={toCancel !== null}
                title="Отменить счёт?"
                message={`Счёт № ${toCancel?.invoiceNumber ?? ''} будет отменён, платежи по нему принять будет нельзя. Действие нельзя отменить.`}
                confirmLabel="Отменить счёт"
                danger
                loading={busy}
                onConfirm={confirmCancel}
                onCancel={() => setToCancel(null)}
            />
        </>
    );
}