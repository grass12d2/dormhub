import {
  AlarmClock,
  BookOpen,
  Brush,
  CalendarClock,
  ChevronRight,
  FileText,
  Home,
  Megaphone,
  MessageCircle,
  QrCode,
  ReceiptText,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { getProfile } from '../api/account';
import { listAnnouncements } from '../api/announcements';
import { CONTRACT_STATUS_LABELS, type Contract } from '../api/contracts';
import { getMyResidence, listMyContracts, listMyInvoices } from '../api/my';
import { PageHeader } from '../components/layout/PageHeader';
import { PaymentDialog } from '../components/payment/PaymentDialog';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Skeleton } from '../components/ui/Skeleton';
import { formatDate, formatDateTime, formatMoney } from '../lib/format';
import {
  curfewState,
  daysUntil,
  debtSummary,
  durationLabel,
  dutyWeekday,
  isoDate,
  nextDutyDate,
  plural,
  RENEW_WARN_DAYS,
  WEEKDAYS,
  WEEKDAYS_EVERY,
} from '../lib/studentOverview';
import { useAsync } from '../lib/useAsync';

/** Текущее время, обновляется раз в 30 секунд */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

/** Небольшая карточка верхнего ряда: заголовок с иконкой, содержимое и ссылка внизу */
function StatCard({
  icon: Icon,
  title,
  to,
  linkLabel,
  loading,
  action,
  strong = false,
  flush = false,
  children,
}: {
  icon: LucideIcon;
  title: string;
  to: string;
  linkLabel: string;
  loading: boolean;
  /** Кнопка справа от заголовка */
  action?: ReactNode;
  /** Заголовок прописными и жирным (для крупных блоков) */
  strong?: boolean;
  /** Содержимое без внутренних отступов (список во всю ширину) */
  flush?: boolean;
  children: ReactNode;
}) {
  return (
    <Card className="flex min-w-0 flex-col">
      <div className={`flex items-center justify-between gap-3 px-5 py-3.5 ${flush ? 'border-b border-border' : 'pb-1'}`}>
        <h2
          className={`flex items-center gap-2 text-sm whitespace-nowrap ${
            strong ? 'font-semibold tracking-wide text-fg uppercase' : 'text-muted'
          }`}
        >
          <Icon size={16} className={strong ? 'text-primary' : ''} aria-hidden="true" />
          {title}
        </h2>
        {action}
      </div>
      <div className={`flex flex-1 flex-col gap-2 ${flush ? '' : 'px-5 pb-5'}`}>
        {loading ? (
          <div className={flush ? 'p-5' : ''}>
            <Skeleton className="h-14 w-full" />
          </div>
        ) : (
          children
        )}
      </div>
      <Link
        to={to}
        className="flex items-center justify-between border-t border-border px-5 py-3 text-sm font-medium text-primary hover:bg-surface-2"
      >
        {linkLabel}
        <ChevronRight size={16} aria-hidden="true" />
      </Link>
    </Card>
  );
}

/** Договор для обзора: действующий, иначе ожидающий активации */
function currentContract(contracts: Contract[]): Contract | null {
  return contracts.find((c) => c.status === 'active') ?? contracts.find((c) => c.status === 'pending') ?? null;
}

/** «Обзор» студента: оплата, жильё, договор, дежурство, комендантский час и объявления */
export default function StudentDashboard() {
  const navigate = useNavigate();
  const now = useNow();
  const [paying, setPaying] = useState(false);

  const profile = useAsync(getProfile);
  const residence = useAsync(getMyResidence);
  const contracts = useAsync(listMyContracts);
  const invoices = useAsync(listMyInvoices);
  const news = useAsync(() => listAnnouncements({ limit: 4, offset: 0 }));

  const place = residence.data;
  const contract = currentContract(contracts.data ?? []);
  const debt = debtSummary(invoices.data ?? []);
  const curfew = curfewState(now);

  const firstName = profile.data?.student?.firstName || profile.data?.displayName;
  const summary = place
    ? [`Общежитие № ${place.buildingNumber}`, `комната ${place.roomNumber}`, `койка ${place.bedNumber}`, `договор до ${formatDate(place.endDate)}`].join(' · ')
    : residence.loading
      ? ''
      : 'Сейчас у вас нет действующего договора проживания.';

  // Дежурство комнаты по кухне и санузлам
  const dutyDay = place ? dutyWeekday(place.roomNumber) : null;
  const nextDuty = place ? nextDutyDate(place.roomNumber, now) : null;
  const dutyToday = nextDuty ? isoDate(nextDuty) === isoDate(now) : false;

  const daysLeft = contract?.status === 'active' ? daysUntil(contract.endDate, now) : null;

  const actions: Array<{ label: string; icon: LucideIcon; onClick: () => void }> = [
    { label: 'Написать администрации', icon: MessageCircle, onClick: () => navigate('/chat') },
    { label: 'Сообщить о поломке', icon: Wrench, onClick: () => navigate('/rules#repair') },
    { label: 'Правила и памятки', icon: BookOpen, onClick: () => navigate('/rules') },
  ];

  return (
    <>
      <PageHeader title={firstName ? `Здравствуйте, ${firstName}!` : 'Обзор'} description={summary || undefined} />

      <div className="flex flex-col gap-4">
        {place && dutyToday ? (
          <div role="status" className="flex items-start gap-3 rounded-xl border border-primary bg-primary-soft px-4 py-3 text-sm">
            <Brush size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
            <p className="min-w-0">
              <span className="font-semibold text-primary">Сегодня дежурит ваша комната {place.roomNumber}.</span>{' '}
              Уберите общую кухню, душевые и туалеты; кто что делает — договоритесь с соседями.
            </p>
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <StatCard
            icon={ReceiptText}
            title="К оплате"
            to="/invoices"
            linkLabel="Все счета"
            loading={invoices.loading}
          >
            {invoices.error ? (
              <p className="text-sm text-muted">Не удалось загрузить счета.</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className={`tabular text-2xl font-semibold ${debt.overdue ? 'text-danger' : ''}`}>{formatMoney(debt.remaining)}</p>
                  <Button size="sm" icon={<QrCode size={16} aria-hidden="true" />} onClick={() => setPaying(true)}>
                    Оплатить
                  </Button>
                </div>
                {debt.next ? (
                  <p className="text-sm text-muted">
                    Ближайший срок: <span className="tabular text-fg">{formatDate(debt.next.dueDate)}</span>
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  {debt.remaining <= 0 ? (
                    <Badge tone="success">Задолженности нет</Badge>
                  ) : debt.overdue ? (
                    <Badge tone="danger">
                      Просрочено: {debt.overdue} {plural(debt.overdue, 'счёт', 'счёта', 'счетов')}
                    </Badge>
                  ) : null}
                </div>
              </>
            )}
          </StatCard>

          <StatCard icon={Home} title="Моё жильё" to="/residence" linkLabel="Подробнее" loading={residence.loading}>
            {place ? (
              <>
                <p className="text-2xl font-semibold">
                  Комната {place.roomNumber}
                  <span className="text-base font-normal text-muted"> · койка {place.bedNumber}</span>
                </p>
                <p className="text-sm text-muted">
                  Общежитие № {place.buildingNumber}, {place.floor} этаж
                </p>
                <p className="text-sm text-muted">{place.metroStation ? `${place.address} (м. ${place.metroStation})` : place.address}</p>
                {dutyDay !== null ? (
                  <p className="flex items-center gap-1.5 text-sm">
                    <Brush size={14} className="shrink-0 text-muted" aria-hidden="true" />
                    <span>
                      Дежурство: <span className="font-medium">{dutyToday ? 'сегодня' : WEEKDAYS_EVERY[dutyDay]}</span>
                    </span>
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-muted">
                {residence.error ? 'Не удалось загрузить данные.' : 'Место появится после активации договора.'}
              </p>
            )}
          </StatCard>

          <StatCard icon={FileText} title="Договор" to="/contracts" linkLabel="Все договоры" loading={contracts.loading}>
            {contract ? (
              <>
                <div className="flex flex-wrap items-center gap-2 py-1.5">
                  <Badge tone={contract.status === 'active' ? 'success' : 'info'}>{CONTRACT_STATUS_LABELS[contract.status]}</Badge>
                </div>
                <p className="text-sm text-muted">
                  {formatDate(contract.startDate)} — {formatDate(contract.endDate)}
                </p>
                {daysLeft !== null && daysLeft >= 0 ? (
                  <p className={`tabular text-sm font-medium ${daysLeft <= RENEW_WARN_DAYS ? 'text-warning' : ''}`}>
                    Осталось {daysLeft} {plural(daysLeft, 'день', 'дня', 'дней')}
                  </p>
                ) : null}
                {daysLeft !== null && daysLeft <= RENEW_WARN_DAYS ? (
                  <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
                    Договор скоро закончится. Чтобы продлить проживание, напишите администрации.
                  </p>
                ) : null}
                {contract.status === 'pending' ? (
                  <p className="text-sm text-muted">Ждёт активации администрацией.</p>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-muted">
                {contracts.error ? 'Не удалось загрузить договоры.' : 'Действующего договора нет.'}
              </p>
            )}
          </StatCard>
        </div>

        <div className="flex flex-wrap gap-2">
          {actions.map(({ label, icon: Icon, onClick }) => (
            <Button key={label} variant="secondary" icon={<Icon size={16} aria-hidden="true" />} onClick={onClick}>
              {label}
            </Button>
          ))}
        </div>

        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <StatCard
            icon={Megaphone}
            title="Объявления"
            to="/announcements"
            linkLabel="Все объявления"
            loading={news.loading}
            strong
            flush
          >
            {(news.data?.items ?? []).length === 0 ? (
              <p className="p-5 text-sm text-muted">
                {news.error ? 'Не удалось загрузить объявления.' : 'Новых объявлений нет.'}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {(news.data?.items ?? []).map((a) => (
                  <li key={a.id}>
                    <Link to={`/announcements#a-${a.id}`} className="flex min-w-0 gap-3 px-5 py-3 hover:bg-surface-2">
                      <span
                        className={`mt-2 size-2 shrink-0 rounded-full ${a.isRead ? 'bg-transparent' : 'bg-primary'}`}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center justify-between gap-x-3">
                          <span className={`min-w-0 break-words ${a.isRead ? 'font-medium' : 'font-semibold'}`}>{a.title}</span>
                          <span className="tabular text-xs text-muted">{formatDateTime(a.createdAt)}</span>
                        </span>
                        <span className="block truncate text-sm text-muted">{a.body}</span>
                      </span>
                      {a.isRead ? null : <span className="sr-only">новое</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </StatCard>

          <div className="flex min-w-0 flex-col gap-4">
            {place && dutyDay !== null && nextDuty ? (
              <Card className={`flex min-w-0 gap-3 p-5 ${dutyToday ? 'border-primary' : ''}`}>
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  {dutyToday ? <Brush size={18} aria-hidden="true" /> : <CalendarClock size={18} aria-hidden="true" />}
                </span>
                <div className="min-w-0 text-sm">
                  <h2 className="flex flex-wrap items-center gap-2 font-semibold">
                    Дежурство комнаты {place.roomNumber}
                    {dutyToday ? <Badge tone="primary">Сегодня</Badge> : null}
                  </h2>
                  <p className="text-muted">
                    Ваша комната дежурит {WEEKDAYS_EVERY[dutyDay]}: кухня, душевые и туалеты. Кто что убирает — договоритесь внутри комнаты.
                  </p>
                  {dutyToday ? null : (
                    <p className="tabular mt-1 font-medium">
                      Следующее: {WEEKDAYS[dutyDay]}, {formatDate(isoDate(nextDuty))}
                    </p>
                  )}
                </div>
              </Card>
            ) : null}

            <Card className="flex min-w-0 gap-3 p-5">
              <span
                className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${
                  curfew.kind === 'open' ? 'bg-primary-soft text-primary' : curfew.kind === 'soon' ? 'bg-warning-soft text-warning' : 'bg-danger-soft text-danger'
                }`}
              >
                <AlarmClock size={18} aria-hidden="true" />
              </span>
              <div className="min-w-0 text-sm">
                <h2 className="font-semibold">Комендантский час — 23:00</h2>
                <p className="text-muted">
                  {curfew.kind === 'closed'
                    ? 'Вход закрыт до 06:00. Задерживаетесь по уважительной причине — предупредите дежурного.'
                    : curfew.kind === 'soon'
                      ? `До закрытия входа осталось ${durationLabel(curfew.minutesLeft)}. Возвращайтесь вовремя.`
                      : 'Возвращайтесь в общежитие до 23:00, после этого вход закрыт до 06:00.'}
                </p>
              </div>
            </Card>

          </div>
        </div>
      </div>

      <PaymentDialog open={paying} onClose={() => setPaying(false)} />
    </>
  );
}
