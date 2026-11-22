import { ChevronRight } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { useAuth } from '../../auth/AuthProvider';
import { breadcrumbs } from '../../nav';

/** Хлебные крошки: где пользователь находится сейчас */
export function Breadcrumbs() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  if (!user) {
    return null;
  }
  const parts = breadcrumbs(pathname, user.role);

  return (
    <nav aria-label="Хлебные крошки" className="min-w-0">
      <ol className="flex items-center gap-1.5 text-sm">
        {parts.map((part, index) => (
          <li key={part.label} className="flex items-center gap-1.5 truncate">
            {index > 0 ? <ChevronRight size={14} className="text-muted" aria-hidden="true" /> : null}
            {part.to ? (
              <Link to={part.to} className="text-muted transition-colors hover:text-fg">
                {part.label}
              </Link>
            ) : (
              <span className="font-medium" aria-current="page">
                {part.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}