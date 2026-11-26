import type { InputHTMLAttributes } from 'react';

/**
 * Переключатель-ползунок «вкл/выкл». Внутри — настоящий чекбокс с role="switch",
 * поэтому работает с клавиатуры и в <label>; видимы только дорожка и бегунок.
 */
export function Switch({
  checked,
  onChange,
  className = '',
  ...rest
}: { checked: boolean; onChange: (checked: boolean) => void } & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'role' | 'checked' | 'onChange'
>) {
  return (
    <span className={`relative inline-flex shrink-0 ${className}`}>
      <input
        {...rest}
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="peer absolute inset-0 m-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none h-6 w-11 rounded-full bg-border transition-colors peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface peer-disabled:opacity-60"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5"
      />
    </span>
  );
}
