import { FileText } from 'lucide-react';
import { CONTRACT_STATUS_LABELS, type ContractStatus } from '../api/contracts';
import { listMyContracts } from '../api/my';
import { Warning } from '../components/feedback/Warning';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge, type Tone } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { formatDate, formatMoney } from '../lib/format';
import { useAsync } from '../lib/useAsync';

const TONES: Record<ContractStatus, Tone> = {
  pending: 'info',
  active: 'success',
  terminated: 'danger',
  expired: 'neutral',
  cancelled: 'neutral',
};

/** «Договоры» студента: только свои договоры, только чтение */
export default function MyContractsPage() {
  const contracts = useAsync(listMyContracts);
  const items = contracts.data ?? [];

  return (
    <>
      <PageHeader title="Договоры" description="Ваши договоры проживания." />
      {contracts.error ? (
        <Warning tone="danger" title="Не удалось загрузить договоры">
          <p>{contracts.error}</p>
          <Button variant="secondary" size="sm" className="mt-2" onClick={contracts.reload}>
            Повторить
          </Button>
        </Warning>
      ) : contracts.loading ? (
        <Skeleton className="h-24 w-full" />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState icon={FileText} title="Договоров пока нет" description="Договор оформляет администрация." />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((c) => (
            <Card key={c.id} className="flex flex-col gap-3 p-5">
              <div className="flex items-center justify-between gap-2">
                <span className="tabular font-medium">
                  {formatDate(c.startDate)} — {formatDate(c.endDate)}
                </span>
                <Badge tone={TONES[c.status]}>{CONTRACT_STATUS_LABELS[c.status]}</Badge>
              </div>
              <p className="text-sm text-muted">Плата в месяц: {formatMoney(c.monthlyRate)}</p>
              {c.terminationReason ? (
                <p className="text-sm text-muted">Причина расторжения: {c.terminationReason}</p>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}