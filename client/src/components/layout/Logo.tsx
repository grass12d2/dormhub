import { Building2 } from 'lucide-react';
import { Link } from 'react-router';

/** Логотип DormHub; ссылка на главную страницу */
export function Logo() {
  return (
    <Link to="/" aria-label="DormHub: на главную" className="flex items-center gap-2.5">
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-on-primary">
        <Building2 size={18} aria-hidden="true" />
      </span>
      <span className="text-lg font-semibold tracking-tight">DormHub</span>
    </Link>
  );
}