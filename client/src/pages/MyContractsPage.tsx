import { BookOpen, CalendarRange, FileText, Home, ReceiptText, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { getProfile } from '../api/account';
import { CONTRACT_STATUS_LABELS, type Contract, type ContractStatus } from '../api/contracts';
import { getMyResidence, listMyContracts, listMyInvoices, type Residence } from '../api/my';
import { Warning } from '../components/feedback/Warning';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge, type Tone } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { contractMonths, contractNumber, invoiceTotals, monthsLabel, type InvoiceTotals } from '../lib/contractInfo';
import { formatDate, formatMoney } from '../lib/format';
import { useAsync } from '../lib/useAsync';

const TONES: Record<ContractStatus, Tone> = {
  pending: 'info',
  active: 'success',
  terminated: 'danger',
  expired: 'neutral',
  cancelled: 'neutral',
};

/** Пояснение к статусу договора */
const STATUS_HINTS: Record<ContractStatus, string> = {
  pending: 'Договор оформлен и ждёт активации администрацией. После активации появится место и счета.',
  active: 'Договор действует: вы проживаете в общежитии и оплачиваете проживание по счетам.',
  terminated: 'Договор расторгнут досрочно.',
  expired: 'Срок договора закончился.',
  cancelled: 'Договор отменён до начала действия.',
};

/** Действующие и ожидающие — выше, затем по дате начала, новые первыми */
const ORDER: Record<ContractStatus, number> = { active: 0, pending: 1, terminated: 2, expired: 2, cancelled: 3 };

/** Основные условия проживания (одинаковы для всех договоров) */
const TERMS = [
  'Плата за месяц вносится по счёту до срока, указанного в нём, обычно до 10-го числа.',
  'Место закрепляется за студентом на весь срок договора; переселение — только через администрацию.',
  'Жилец соблюдает правила проживания, бережёт имущество и возмещает ущерб, причинённый по его вине.',
  'Посторонние находятся в общежитии только по согласованию с администрацией и до 22:00.',
  'При выселении комната сдаётся в чистом виде вместе с выданным имуществом и ключом.',
  'Договор может быть расторгнут досрочно по заявлению студента или при грубом нарушении правил.',
];

function Facts({ icon: Icon, title, rows, children }: { icon: LucideIcon; title: string; rows: Array<[string, ReactNode]>; children?: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-3 md:px-6 md:first:pl-0 md:last:pr-0">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Icon size={16} className="text-muted" aria-hidden="true" />
        {title}
      </h3>
      {rows.length > 0 ? (
        <dl className="flex flex-col gap-2">
          {rows.map(([label, value]) => (
            <div key={label} className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
              <dt className="text-muted">{label}</dt>
              <dd className="tabular text-right font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {children}
    </section>
  );
}

function ContractCard({
  contract: c,
  residence,
  totals,
  holder,
}: {
  contract: Contract;
  residence: Residence | null;
  totals: InvoiceTotals | null;
  holder: string | null;
}) {
  const navigate = useNavigate();
  const months = contractMonths(c.startDate, c.endDate);
  const place = residence && residence.contractId === c.id ? residence : null;

  const termRows: Array<[string, ReactNode]> = [
    ['Начало', formatDate(c.startDate)],
    ['Окончание', formatDate(c.endDate)],
    ['Срок', months ? monthsLabel(months) : '—'],
  ];
  if (c.terminatedAt) termRows.push(['Расторгнут', formatDate(c.terminatedAt.slice(0, 10))]);

  const placeRows: Array<[string, ReactNode]> = place
    ? [
        ['Общежитие', `№ ${place.buildingNumber}`],
        ['Адрес', place.metroStation ? `${place.address} (м. ${place.metroStation})` : place.address],
        ['Этаж', String(place.floor)],
        ['Комната', place.roomNumber],
        ['Койка', String(place.bedNumber)],
      ]
    : [];

  const payRows: Array<[string, ReactNode]> = [
    ['Плата в месяц', formatMoney(c.monthlyRate)],
    ['За весь срок, примерно', months ? formatMoney(c.monthlyRate * months) : '—'],
  ];
  if (totals) {
    payRows.push(
      ['Выставлено счетов', totals.count ? `${totals.count} на ${formatMoney(totals.amount)}` : 'пока нет'],
      ['Оплачено', formatMoney(totals.paid)],
      [
        'Осталось оплатить',
        <span className={totals.remaining > 0 ? 'text-warning' : 'text-success'}>{formatMoney(totals.remaining)}</span>,
      ]
    );
    if (totals.overdue) payRows.push(['Просрочено счетов', <span className="text-danger">{totals.overdue}</span>]);
  }

  return (
    <Card>
      <CardHeader title={`Договор № ${contractNumber(c.id)}`} action={<Badge tone={TONES[c.status]}>{CONTRACT_STATUS_LABELS[c.status]}</Badge>} />
      <div className="flex flex-col gap-5 p-5">
        <div className="flex flex-col gap-1 text-sm">
          <p className="text-muted">{STATUS_HINTS[c.status]}</p>
          {holder ? (
            <p>
              <span className="text-muted">Наниматель: </span>
              <span className="font-medium">{holder}</span>
            </p>
          ) : null}
          {c.terminationReason ? (
            <p>
              <span className="text-muted">Причина расторжения: </span>
              {c.terminationReason}
            </p>
          ) : null}
        </div>

        <div className="grid gap-6 md:grid-cols-3 md:gap-0 md:divide-x md:divide-border">
          <Facts icon={CalendarRange} title="Сроки" rows={termRows} />
          <Facts icon={Home} title="Место" rows={placeRows}>
            {place ? null : (
              <p className="text-sm text-muted">
                {c.status === 'pending' ? 'Место станет известно после активации договора.' : 'Место показывается для действующего договора.'}
              </p>
            )}
          </Facts>
          <Facts icon={Wallet} title="Оплата" rows={payRows} />
        </div>

        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          <Button variant="secondary" size="sm" icon={<ReceiptText size={16} aria-hidden="true" />} onClick={() => navigate('/invoices')}>
            Счета
          </Button>
          {place ? (
            <Button variant="secondary" size="sm" icon={<Home size={16} aria-hidden="true" />} onClick={() => navigate('/residence')}>
              Моё жильё
            </Button>
          ) : null}
          <Button variant="secondary" size="sm" icon={<BookOpen size={16} aria-hidden="true" />} onClick={() => navigate('/rules')}>
            Правила проживания
          </Button>
        </div>
      </div>
    </Card>
  );
}

/** «Договоры» студента: подробные сведения о своих договорах — сроки, место, оплата, условия. Только чтение */
export default function MyContractsPage() {
  const contracts = useAsync(listMyContracts);
  // Дополнительные сведения: если не загрузятся, договоры всё равно показываются
  const invoices = useAsync(listMyInvoices);
  const residence = useAsync(getMyResidence);
  const profile = useAsync(getProfile);

  const items = [...(contracts.data ?? [])].sort(
    (a, b) => ORDER[a.status] - ORDER[b.status] || b.startDate.localeCompare(a.startDate)
  );
  const student = profile.data?.student;
  const holder = student
    ? [[student.lastName, student.firstName, student.middleName].filter(Boolean).join(' ') || profile.data?.displayName, `студ. № ${student.studentNumber}`]
        .filter(Boolean)
        .join(', ')
    : profile.data?.displayName ?? null;

  return (
    <>
      <PageHeader title="Договоры" description="Ваши договоры проживания: сроки, место и оплата." />
      {contracts.error ? (
        <Warning tone="danger" title="Не удалось загрузить договоры">
          <p>{contracts.error}</p>
          <Button variant="secondary" size="sm" className="mt-2" onClick={contracts.reload}>
            Повторить
          </Button>
        </Warning>
      ) : contracts.loading ? (
        <Skeleton className="h-64 w-full" />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState icon={FileText} title="Договоров пока нет" description="Договор оформляет администрация." />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {items.map((c) => (
            <ContractCard
              key={c.id}
              contract={c}
              residence={residence.data ?? null}
              totals={invoices.data ? invoiceTotals(invoices.data, c.id) : null}
              holder={holder}
            />
          ))}
          <Card>
            <CardHeader title="Основные условия договора" />
            <ol className="flex list-decimal flex-col gap-2 py-5 pr-5 pl-10 text-sm marker:text-muted">
              {TERMS.map((term) => (
                <li key={term}>{term}</li>
              ))}
            </ol>
          </Card>
        </div>
      )}
    </>
  );
}
