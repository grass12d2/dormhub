import { Link } from 'react-router';
import { listAnnouncements } from '../api/announcements';
import { useAuth } from '../auth/AuthProvider';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardHeader } from '../components/ui/Card';
import { useAsync } from '../lib/useAsync';
import AdminDashboard from './AdminDashboard';

/** Последние объявления студента; отдельный компонент, чтобы хук не вызывался условно */
function StudentNews() {
  const news = useAsync(() => listAnnouncements({ limit: 3, offset: 0 }));
  const items = news.data?.items ?? [];
  return (
    <Card>
      <CardHeader title="Объявления" />
      {items.length === 0 ? (
        <p className="p-5 text-sm text-muted">{news.loading ? 'Загрузка…' : 'Новых объявлений нет.'}</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((a) => (
            <li key={a.id} className="px-5 py-3">
              <span className="block font-medium">
                {a.title}
                {a.isRead ? '' : ' • новое'}
              </span>
              <span className="block truncate text-sm text-muted">{a.body}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="border-t border-border px-5 py-3 text-sm">
        <Link to="/announcements" className="text-primary">
          Все объявления
        </Link>
      </div>
    </Card>
  );
}

/** Главная страница: у администратора сводка, у студента данные учётной записи и объявления */
export default function DashboardPage() {
  const { user } = useAuth();

  if (user?.role === 'admin') {
    return <AdminDashboard />;
  }

  // Ниже остаётся только студент
  return (
    <>
      <PageHeader title="Главная" description="Добро пожаловать в DormHub." />
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader title="Ваша учётная запись" />
          <dl className="grid gap-3 p-5 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted">Электронная почта</dt>
              <dd className="font-medium">{user?.email}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Роль</dt>
              <dd className="font-medium">Студент</dd>
            </div>
          </dl>
        </Card>
        <StudentNews />
      </div>
    </>
  );
}