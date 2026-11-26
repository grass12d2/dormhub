import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/** Пустое состояние: что произошло и что можно сделать */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-surface-2 text-muted">
        <Icon size={22} aria-hidden="true" />
      </span>
      <h3 className="text-base font-semibold">{title}</h3>
      {description ? <p className="max-w-sm text-muted">{description}</p> : null}
      {action}
    </div>
  );
}