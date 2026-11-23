import type {
    AriaAttributes,
    InputHTMLAttributes,
    Ref,
    SelectHTMLAttributes,
    TextareaHTMLAttributes,
} from 'react';
import { cn } from './cn';

const BASE =
  'rounded-lg border bg-surface px-3 text-sm text-fg placeholder:text-muted transition-colors ' +
  'focus:border-primary focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-60';

/** Красная рамка у поля с ошибкой; значения «grammar» и «spelling» тоже означают ошибку */
const border = (invalid: AriaAttributes['aria-invalid']) =>
    invalid !== undefined && invalid !== false && invalid !== 'false'
        ? 'border-danger'
        : 'border-border';

export function Input({
    className,
    ...rest
}: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
    return <input className={cn('w-full', BASE, 'h-10', border(rest['aria-invalid']), className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
    return (
        <select className={cn('w-full', BASE, 'h-10', border(rest['aria-invalid']), className)} {...rest}>
            {children}
        </select>
    );
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
    return (
        <textarea
            className={cn('w-full', BASE, 'min-h-24 py-2', border(rest['aria-invalid']), className)}
            {...rest}
        />
    );
}