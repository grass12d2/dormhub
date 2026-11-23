import { ReceiptText } from 'lucide-react';
import { INVOICE_STATUS_LABELS, type InvoiceStatus } from '../api/invoices';
import { listMyInvoices } from '../api/my';
import { Warning } from '../components/feedback/Warning';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge, type Tone } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { formatDate, formatMoney } from '../lib/format';
import { useAsync } from '../lib/useAsync';

const TONES: Record<InvoiceStatus, Tone> = {
  unpaid: 'warning',
  partially_paid: 'info',
  paid: 'success',
  cancelled: 'neutral',
};

/** «Счета» студента: свои счета и общий остаток к оплате, только чтение */
export default function MyInvoicesPage() {
  const invoices = useAsync(listMyInvoices);
  const items = invoices.data ?? [];
  // Сумма остатка по неотменённым счетам (в копейках, чтобы не копить погрешность)
  const debtKopecks = items
    .filter((i) => i.status !== 'cancelled')
    .reduce((sum, i) => sum + Math.round(i.remainingAmount * 100), 0);

  return (
    <>
      <PageHeader title="Счета" description="Ваши счета и оплаты." />
      {invoices.error ? (
        <Warning tone="danger" title="Не удалось загрузить счета">
          <p>{invoices.error}</p>
          <Button variant="secondary" size="sm" className="mt-2" onClick={invoices.reload}>
            Повторить
          </Button>
        </Warning>
      ) : invoices.loading ? (
        <Skeleton className="h-24 w-full" />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState icon={ReceiptText} title="Счетов пока нет" description="Счета выставляет администрация." />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          <Card className="p-5">
            <p className="text-sm text-muted">К оплате</p>
            <p className="tabular text-2xl font-semibold">{formatMoney(debtKopecks / 100)}</p>
          </Card>
          <Card>
            <CardHeader title="Список счетов" />
            <ul className="divide-y divide-border">
              {items.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <span className="min-w-0">
                    <span className="block font-medium">
                      № {i.invoiceNumber} · {i.description}
                    </span>
                    <span className="block text-sm text-muted">Срок оплаты: {formatDate(i.dueDate)}</span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="tabular text-sm">
                      {formatMoney(i.paidAmount)} из {formatMoney(i.amount)}
                    </span>
                    <Badge tone={TONES[i.status]}>{INVOICE_STATUS_LABELS[i.status]}</Badge>
                    {i.isOverdue ? <Badge tone="danger">Просрочен</Badge> : null}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </>
  );
}