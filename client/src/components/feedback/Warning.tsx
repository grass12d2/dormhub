import { AlertCircle, Info, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

type Tone = 'info' | 'warning' | 'danger';

const STYLES: Record<Tone, string> = {
  info: 'border-info/30 bg-info-soft text-info',
  warning: 'border-warning/30 bg-warning-soft text-warning',
  danger: 'border-danger/30 bg-danger-soft text-danger',
};
const ICONS = { info: Info, warning: TriangleAlert, danger: AlertCircle } as const;

/** Блок предупреждения (техработы, важные сообщения) */
export function Warning({
  tone = 'info',
  title,
  children,
}: {
  tone?: Tone;
  title: string;
  children?: ReactNode;
}) {
  const Icon = ICONS[tone];
  return (
    <div role="alert" className={`flex gap-3 rounded-xl border p-4 ${STYLES[tone]}`}>
      <Icon size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div>
        <p className="font-medium">{title}</p>
        {children ? <div className="mt-1 text-sm text-fg">{children}</div> : null}
      </div>
    </div>
  );
}