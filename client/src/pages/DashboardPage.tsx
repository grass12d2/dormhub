import { useAuth } from '../auth/AuthProvider';
import AdminDashboard from './AdminDashboard';
import StudentDashboard from './StudentDashboard';

/** Главная страница: у администратора сводка, у студента — своя сводка */
export default function DashboardPage() {
  const { user } = useAuth();

  if (user?.role === 'admin') {
    return <AdminDashboard />;
  }

  return <StudentDashboard />;
}
