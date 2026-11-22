import { useAuth } from '../auth/AuthProvider';
import { PageHeader } from '../components/layout/PageHeader';
import { displayNameOf } from '../components/layout/UserMenu';
import { Card, CardHeader } from '../components/ui/Card';

/** Мой профиль: данные учётной записи (расширенный профиль студента появится позже) */
export default function ProfilePage() {
  const { user } = useAuth();
  if (!user) {
    return null;
  }

  return (
    <>
      <PageHeader title="Мой профиль" />
      <Card>
        <CardHeader title="Учётная запись" />
        <dl className="grid gap-4 p-5 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted">Имя</dt>
            <dd className="font-medium">{displayNameOf(user.email)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Электронная почта</dt>
            <dd className="font-medium">{user.email}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Роль</dt>
            <dd className="font-medium">{user.role === 'admin' ? 'Администратор' : 'Студент'}</dd>
          </div>
        </dl>
      </Card>
    </>
  );
}