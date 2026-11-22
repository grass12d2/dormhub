import type { ReactNode } from 'react';
import { cn } from './cn';

export type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

/** Пастельный фон и более тёмный текст того же оттенка */
const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-muted',
  primary: 'bg-primary-soft text-primary',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        TONES[tone]
      )}
    >
      {children}
    </span>
  );
}