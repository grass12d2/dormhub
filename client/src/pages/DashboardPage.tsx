import { useAuth } from '../auth/AuthProvider';
import { Warning } from '../components/feedback/Warning';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardHeader } from '../components/ui/Card';

/** Главная страница; статистика и объявления появятся на следующих шагах */
export default function DashboardPage() {
  const { user } = useAuth();

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
              <dd className="font-medium">{user?.role === 'admin' ? 'Администратор' : 'Студент'}</dd>
            </div>
          </dl>
        </Card>
        <Warning title="Статистика пока недоступна">
          Показатели загрузки и финансов появятся после подключения сводки с сервера.
        </Warning>
      </div>
    </>
  );
}