import { useLocation } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import { Warning } from '../components/feedback/Warning';
import { PageHeader } from '../components/layout/PageHeader';
import { findItem } from '../nav';

/** Временная страница раздела: заголовок берётся из меню */
export default function PlaceholderPage() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const title = user ? (findItem(pathname, user.role)?.label ?? 'Раздел') : 'Раздел';

  return (
    <>
      <PageHeader title={title} />
      <Warning title="Раздел в разработке">Эта страница будет подключена к данным на следующих шагах.</Warning>
    </>
  );
}