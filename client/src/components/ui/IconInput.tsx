import type { LucideIcon } from 'lucide-react';
import type { InputHTMLAttributes, ReactNode, Ref } from 'react';
import { Input } from './Input';
import { cn } from './cn';

export interface IconInputProps extends InputHTMLAttributes<HTMLInputElement> {
    /** Значок слева внутри поля */
    icon: LucideIcon;
    /** Элемент справа (например, кнопка «показать пароль») */
    trailing?: ReactNode;
    /** Ссылка на сам элемент ввода (для установки фокуса) */
    inputRef?: Ref<HTMLInputElement>;
}

/** Поле ввода со значком слева и необязательным элементом справа */
export function IconInput({ icon: Icon, trailing, inputRef, className, ...rest }: IconInputProps) {
    return (
        <div className="relative">
            <Icon
                size={18}
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
                aria-hidden="true"
            />
            <Input
                ref={inputRef}
                className={cn('pl-10', trailing ? 'pr-11' : false, className)}
                {...rest}
            />
            {trailing ? <div className="absolute top-1/2 right-1.5 -translate-y-1/2">{trailing}</div> : null}
        </div>
    );
}