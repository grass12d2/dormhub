import { useMemo, useState } from 'react';
import { listInvoices, listPayments, METHOD_LABELS, type Payment } from '../api/invoices';
import { DataTable, type Column } from '../components/data/DataTable';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge } from '../components/ui/Badge';
import { formatDateTime, formatMoney } from '../lib/format';
import { useAsync } from '../lib/useAsync';

const PAGE_SIZE = 20;

/** Страница «Платежи»: только чтение, платежи неизменяемы */
export default function PaymentsPage() {
  const [page, setPage] = useState(1);
  const payments = useAsync(() => listPayments({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }), [page]);
  // Номера счетов для подписей (первые 200 счетов)
  const invoices = useAsync(() => listInvoices({ status: '', overdue: false, limit: 200, offset: 0 }));
  const numbers = useMemo(
    () => new Map((invoices.data?.items ?? []).map((i) => [i.id, i.invoiceNumber])),
    [invoices.data]
  );
  const total = payments.data?.meta.total ?? 0;

  const columns: Column<Payment>[] = [
    { key: 'date', header: 'Дата', render: (p) => <span className="tabular">{formatDateTime(p.paidAt)}</span> },
    { key: 'invoice', header: 'Счёт', render: (p) => <span className="tabular">№ {numbers.get(p.invoiceId) ?? '—'}</span> },
    { key: 'amount', header: 'Сумма', align: 'right', render: (p) => <span className="tabular font-medium">{formatMoney(p.amount)}</span> },
    { key: 'method', header: 'Способ', render: (p) => <Badge tone="primary">{METHOD_LABELS[p.method]}</Badge>, hideOnMobile: true },
    { key: 'ref', header: 'Документ', render: (p) => p.reference ?? '—', hideOnMobile: true },
  ];

  return (
    <>
      <PageHeader title="Платежи" description="Принятые платежи. Записи нельзя изменить или удалить." />
      <DataTable
        columns={columns}
        rows={payments.data?.items ?? []}
        rowKey={(p) => p.id}
        loading={payments.loading}
        error={payments.error}
        onRetry={payments.reload}
        query=""
        onQuery={() => undefined}
        searchPlaceholder="Новые платежи сверху"
        sort={null}
        onSort={() => undefined}
        page={page}
        pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
        total={total}
        pageSize={PAGE_SIZE}
        onPage={setPage}
        emptyTitle="Платежей пока нет"
        emptyDescription="Платежи появятся после приёма оплаты по счетам."
      />
    </>
  );
}