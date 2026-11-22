import { SearchX } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState } from '../components/ui/EmptyState';

/** Страница не найдена */
export default function NotFoundPage() {
  return (
    <EmptyState
      icon={SearchX}
      title="Страница не найдена"
      description="Такого адреса нет. Проверьте ссылку или вернитесь на главную."
      action={
        <Link to="/" className="font-medium text-primary hover:underline">
          На главную
        </Link>
      }
    />
  );
}