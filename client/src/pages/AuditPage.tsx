import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { listAudit, type AuditEntry } from '../api/audit';
import { DataTable, type Column } from '../components/data/DataTable';
import { PageHeader } from '../components/layout/PageHeader';
import { FilterInput, FilterSelect } from '../components/ui/Filters';
import { AUDIT_LABELS, auditLabel } from '../lib/audit-labels';
import { formatDateTime } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { detailRows } from '../lib/audit-details';

const PAGE_SIZE = 20;

/** Страница «Журнал действий»: только чтение, фильтры по действию и периоду */
export default function AuditPage() {
    const [page, setPage] = useState(1);
    const [action, setAction] = useState('');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [open, setOpen] = useState<number | null>(null);

    const log = useAsync(
        () => listAudit({ action, from, to, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
        [action, from, to, page]
    );
    const total = log.data?.meta.total ?? 0;
    const periodInvalid = from !== '' && to !== '' && to < from;

    const columns: Column<AuditEntry>[] = [
        {
            key: 'when',
            header: 'Время',
            render: (e) => (
                <button
                    type="button"
                    className="inline-flex items-center gap-1 tabular"
                    aria-expanded={open === e.id}
                    onClick={() => setOpen(open === e.id ? null : e.id)}
                >
                    {open === e.id ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
                    {formatDateTime(e.createdAt)}
                </button>
            ),
        },
        {
            key: 'action',
            header: 'Действие',
            render: (e) => (
                <span>
                    <span className="block font-medium">{auditLabel(e.action)}</span>
                    {open === e.id ? (
                        <dl className="mt-2 grid max-w-xl grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg bg-surface-2 p-3 text-xs">
                            {detailRows(e.details).map((row) => (
                                <div key={row.label} className="contents">
                                    <dt className="text-muted">{row.label}</dt>
                                    <dd className="font-medium break-words">
                                        {row.before !== undefined ? (
                                            <>
                                                <span className="text-muted line-through">{row.before}</span> → {row.value}
                                            </>
                                        ) : (
                                            row.value
                                        )}
                                    </dd>
                                </div>
                            ))}
                            {detailRows(e.details).length === 0 ? <dd className="col-span-2 text-muted">Нет подробностей</dd> : null}
                        </dl>
                    ) : null}
                </span>
            ),
        },
        { key: 'actor', header: 'Кто', render: (e) => e.actorEmail ?? 'Система', hideOnMobile: true },
        { key: 'ip', header: 'IP', render: (e) => <span className="tabular">{e.ipAddress ?? '—'}</span>, hideOnMobile: true },
    ];

    return (
        <>
            <PageHeader title="Журнал действий" description="Все изменения в системе. Записи нельзя изменить или удалить." />
            <DataTable
                columns={columns}
                rows={log.data?.items ?? []}
                rowKey={(e) => String(e.id)}
                loading={log.loading}
                error={periodInvalid ? 'Дата «по» раньше даты «с»' : log.error}
                onRetry={log.reload}
                query=""
                onQuery={() => undefined}
                searchPlaceholder="Новые записи сверху"
                sort={null}
                onSort={() => undefined}
                page={page}
                pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
                total={total}
                pageSize={PAGE_SIZE}
                onPage={setPage}
                toolbar={
                    <>
                        <FilterSelect
                            label="Действие"
                            options={Object.keys(AUDIT_LABELS).map((a) => ({ value: a, label: AUDIT_LABELS[a] }))}
                            value={action}
                            onChange={(value) => {
                                setAction(value);
                                setPage(1);
                            }}
                        />
                        <FilterInput label="С" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
                        <FilterInput label="По" type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
                    </>
                }
                emptyTitle="Записей не найдено"
                emptyDescription="Измените действие или период."
            />
        </>
    );
}