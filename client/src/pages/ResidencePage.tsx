import { Home, Users } from 'lucide-react';
import { getMyResidence } from '../api/my';
import { Warning } from '../components/feedback/Warning';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { formatDate, formatMoney } from '../lib/format';
import { useAsync } from '../lib/useAsync';

/** «Моё жильё»: где живёт студент и с кем, только чтение */
export default function ResidencePage() {
  const residence = useAsync(getMyResidence);
  const data = residence.data;

  const facts: Array<[string, string]> = data
    ? [
        ['Общежитие', `№ ${data.buildingNumber}`],
        ['Адрес', data.metroStation ? `${data.address} (м. ${data.metroStation})` : data.address],
        ['Этаж', String(data.floor)],
        ['Комната', data.roomNumber],
        ['Койка', String(data.bedNumber)],
        ['Срок проживания', `${formatDate(data.startDate)} — ${formatDate(data.endDate)}`],
        ['Плата в месяц', formatMoney(data.monthlyRate)],
      ]
    : [];

  return (
    <>
      <PageHeader title="Моё жильё" description="Ваше место в общежитии." />
      {residence.error ? (
        <Warning tone="danger" title="Не удалось загрузить данные">
          <p>{residence.error}</p>
          <Button variant="secondary" size="sm" className="mt-2" onClick={residence.reload}>
            Повторить
          </Button>
        </Warning>
      ) : residence.loading ? (
        <Skeleton className="h-48 w-full" />
      ) : !data ? (
        <Card>
          <EmptyState
            icon={Home}
            title="Действующего договора нет"
            description="Когда администрация активирует договор, здесь появится ваше жильё."
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title="Проживание" />
            <dl className="grid gap-4 p-5 sm:grid-cols-2">
              {facts.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted">{label}</dt>
                  <dd className="font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card>
            <CardHeader title="Соседи по комнате" />
            {data.roommates.length === 0 ? (
              <EmptyState icon={Users} title="Пока никого" description="Вы живёте в комнате один." />
            ) : (
              <ul className="divide-y divide-border">
                {data.roommates.map((mate) => (
                  <li key={`${mate.displayName}-${mate.groupName ?? ''}`} className="px-5 py-3">
                    <span className="block font-medium">{mate.displayName}</span>
                    {mate.groupName ? (
                      <span className="block text-sm text-muted">{mate.groupName}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </>
  );
}