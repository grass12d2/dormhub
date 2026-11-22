import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

/** Карточка: светлая рамка и едва заметная тень */
export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-xl border border-border bg-surface shadow-card', className)}
      {...rest}
    />
  );
}

/** Заголовок карточки с необязательным действием справа */
export function CardHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
      <h2 className="text-base font-medium">{title}</h2>
      {action}
    </div>
  );
}