import { Loader2 } from 'lucide-react';

/** Индикатор загрузки; без подписи читается скринридером как «Загрузка» */
export function Spinner({ size = 20, label }: { size?: number; label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-muted">
      <Loader2 size={size} className="animate-spin" aria-hidden="true" />
      {label ? <span>{label}</span> : <span className="sr-only">Загрузка</span>}
    </span>
  );
}