import { cn } from './cn';

/** Заглушка на время загрузки данных */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn('animate-pulse rounded-md bg-surface-2', className)} />
  );
}