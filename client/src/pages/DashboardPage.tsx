import { useAuth } from '../auth/AuthProvider';
import { Warning } from '../components/feedback/Warning';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardHeader } from '../components/ui/Card';
import AdminDashboard from './AdminDashboard';

/** Главная страница: у администратора сводка, у студента данные учётной записи */
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
                <Warning title="Раздел «Моё жильё» появится позже">
                    Здесь будут данные о вашей комнате, договоре и счетах.
                </Warning>
            </div>
        </>
    );
}