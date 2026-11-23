import { useRef, type ClipboardEvent, type KeyboardEvent } from 'react';

export interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  invalid?: boolean;
  autoFocus?: boolean;
}

/** Код из отдельных ячеек: автопереход, Backspace назад, вставка целого кода */
export function OtpInput({ value, onChange, length = 6, invalid, autoFocus }: OtpInputProps) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? '');

  const focus = (index: number) => refs.current[Math.min(Math.max(index, 0), length - 1)]?.focus();

  const setDigit = (index: number, digit: string) => {
    const next = digits.slice();
    next[index] = digit;
    onChange(next.join('').slice(0, length));
  };

  const onKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !digits[index]) {
      event.preventDefault();
      if (index > 0) {
        setDigit(index - 1, '');
        focus(index - 1);
      }
    } else if (event.key === 'ArrowLeft') {
      focus(index - 1);
    } else if (event.key === 'ArrowRight') {
      focus(index + 1);
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!pasted) return;
    event.preventDefault();
    onChange(pasted);
    focus(pasted.length >= length ? length - 1 : pasted.length);
  };

  return (
    <div role="group" aria-label="Код из письма" className="flex justify-between gap-2">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            refs.current[index] = el;
          }}
          value={digit}
          inputMode="numeric"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          autoFocus={autoFocus && index === 0}
          maxLength={1}
          aria-label={`Цифра ${index + 1}`}
          aria-invalid={invalid}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => onKeyDown(index, e)}
          onPaste={onPaste}
          onChange={(e) => {
            const typed = e.target.value.replace(/\D/g, '').slice(-1);
            setDigit(index, typed);
            if (typed) focus(index + 1);
          }}
          className={`h-12 w-full min-w-0 rounded-lg border bg-surface text-center text-xl font-semibold tabular focus:border-primary focus:outline-none ${
            invalid ? 'border-danger' : 'border-border'
          }`}
        />
      ))}
    </div>
  );
}