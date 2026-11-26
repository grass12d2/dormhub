import { BedDouble, Home, RefreshCw, Users, Wallet } from 'lucide-react';
import { fetchRecentActivity, fetchSummary } from '../api/dashboard';
import { StatCard } from '../components/data/StatCard';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { Warning } from '../components/feedback/Warning';
import { History } from 'lucide-react';
import { auditLabel } from '../lib/audit-labels';
import { formatDateTime, formatMoney, formatNumber, percent } from '../lib/format';
import { useAsync } from '../lib/useAsync';

/** Главная страница администратора: показатели, загрузка общежитий, финансы, активность */
export default function AdminDashboard() {
  const summary = useAsync(fetchSummary);
  const activity = useAsync(fetchRecentActivity);
  const data = summary.data;

  return (
    <>
      <PageHeader
        title="Обзор"
        description="Сводка по общежитиям."
        actions={
          <Button
            variant="secondary"
            size="sm"
            icon={<RefreshCw size={16} aria-hidden="true" />}
            onClick={() => {
              summary.reload();
              activity.reload();
            }}
          >
            Обновить
          </Button>
        }
      />

      {summary.error ? (
        <div className="mb-4">
          <Warning tone="danger" title="Не удалось загрузить сводку">
            <p>{summary.error}</p>
            <Button variant="secondary" size="sm" className="mt-2" onClick={summary.reload}>
              Повторить
            </Button>
          </Warning>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Студенты" value={formatNumber(data?.students ?? 0)} icon={Users} loading={summary.loading} />
        <StatCard label="Проживающие" value={formatNumber(data?.residents ?? 0)} icon={Home} loading={summary.loading} />
        <StatCard label="Свободные места" value={formatNumber(data?.freeBeds ?? 0)} icon={BedDouble} loading={summary.loading} />
        <StatCard label="Задолженность" value={formatMoney(data?.debt ?? 0)} icon={Wallet} loading={summary.loading} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Загрузка общежитий" />
          <div className="flex flex-col gap-4 p-5">
            {summary.loading ? (
              <>
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
              </>
            ) : data && data.buildings.length > 0 ? (
              data.buildings.map((item) => {
                const share = percent(item.occupied, item.beds);
                return (
                  <div key={item.buildingId}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-medium">Общежитие {item.buildingNumber}</span>
                      <span className="tabular text-muted">
                        {formatNumber(item.occupied)} из {formatNumber(item.beds)} ({share}%)
                      </span>
                    </div>
                    <div
                      role="progressbar"
                      aria-valuenow={share}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`Загрузка общежития ${item.buildingNumber}`}
                      className="h-2 overflow-hidden rounded-full bg-surface-2"
                    >
                      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(share, item.occupied > 0 ? 1 : 0)}%` }} />
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-muted">Общежитий пока нет.</p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Финансы" />
          <dl className="flex flex-col gap-4 p-5">
            {summary.loading || !data ? (
              <>
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </>
            ) : (
              <>
                <div>
                  <dt className="text-xs text-muted">Получено платежей</dt>
                  <dd className="tabular text-lg font-semibold text-success">{formatMoney(data.finance.paid)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Осталось оплатить</dt>
                  <dd className="tabular text-lg font-semibold">{formatMoney(data.finance.outstanding)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Просроченные счета</dt>
                  <dd className="tabular text-lg font-semibold text-danger">
                    {formatNumber(data.finance.overdueInvoices)} из {formatNumber(data.finance.totalInvoices)}
                  </dd>
                </div>
              </>
            )}
          </dl>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Недавняя активность" />
        {activity.loading ? (
          <div className="flex flex-col gap-3 p-5">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
          </div>
        ) : activity.error ? (
          <div className="p-5">
            <p className="text-danger">{activity.error}</p>
            <Button variant="secondary" size="sm" className="mt-2" onClick={activity.reload}>
              Повторить
            </Button>
          </div>
        ) : activity.data && activity.data.length > 0 ? (
          <ul className="divide-y divide-border">
            {activity.data.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{auditLabel(entry.action)}</span>
                  <span className="block truncate text-sm text-muted">{entry.actorEmail ?? 'Система'}</span>
                </span>
                <span className="tabular shrink-0 text-sm text-muted">{formatDateTime(entry.createdAt)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={History} title="Действий пока нет" description="Здесь появятся последние изменения в системе." />
        )}
      </Card>
    </>
  );
}