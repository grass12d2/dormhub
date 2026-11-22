import type { LucideIcon } from 'lucide-react';
import { Card } from '../ui/Card';
import { Skeleton } from '../ui/Skeleton';

/** Карточка показателя; пока данных нет, показывается заглушка */
export function StatCard({
  label,
  value,
  icon: Icon,
  loading,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  loading: boolean;
}) {
  return (
    <Card className="flex items-center justify-between gap-3 p-5">
      <div className="min-w-0">
        <p className="text-sm text-muted">{label}</p>
        {loading ? (
          <Skeleton className="mt-2 h-8 w-24" />
        ) : (
          <p className="tabular mt-1 truncate text-2xl font-semibold">{value}</p>
        )}
      </div>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
        <Icon size={20} aria-hidden="true" />
      </span>
    </Card>
  );
}