import { useId, type ReactNode } from 'react';

export interface FieldProps {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  /** Получает id и атрибуты доступности для элемента ввода */
  children: (props: { id: string; 'aria-invalid': boolean; 'aria-describedby'?: string }) => ReactNode;
}

/** Общая обёртка поля формы: подпись сверху, подсказка или сообщение об ошибке снизу */
export function Field({ label, error, hint, required, children }: FieldProps) {
  const id = useId();
  const describedBy = error || hint ? `${id}-note` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {label}
        {required ? <span className="text-danger"> *</span> : null}
      </label>
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy })}
      {error ? (
        <p id={`${id}-note`} role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-note`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}