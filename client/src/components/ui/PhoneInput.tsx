import { formatPhone } from '../../lib/phone';
import { Input } from './Input';

export interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  invalid?: boolean;
}

/** Поле телефона: префикс «+7 » всегда на месте, цифры форматируются при вводе */
export function PhoneInput({ value, onChange, id, invalid }: PhoneInputProps) {
  return (
    <Input
      id={id}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      aria-invalid={invalid}
      value={value}
      onChange={(event) => onChange(formatPhone(event.target.value))}
      onFocus={(event) => {
        // Курсор в конец, чтобы нельзя было стереть префикс
        const end = event.target.value.length;
        requestAnimationFrame(() => event.target.setSelectionRange(end, end));
      }}
    />
  );
}