import type { ReactNode } from 'react';
import { Card } from '../ui/Card';
import { Logo } from './Logo';
import { ThemeMenu } from './ThemeMenu';

/** Текстовая кнопка-ссылка на страницах входа: одинаковая у «Забыли пароль?», «Вернуться ко входу» и др. */
export const AUTH_LINK =
  'inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-primary underline-offset-4 transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

/** Второстепенная ссылка («Назад») */
export const AUTH_LINK_MUTED =
  'inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-muted transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

/** Общий каркас страниц входа и восстановления: тема справа сверху, логотип и заголовок в карточке */
export function AuthLayout({
  title,
  subtitle,
  footer,
  children,
}: {
  title: string;
  subtitle?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-bg p-4">
      {/* Тема доступна и до входа */}
      <div className="absolute top-4 right-4">
        <ThemeMenu />
      </div>
      <Card className="w-full max-w-sm p-6 sm:p-8">
        <div className="mb-6 flex flex-col items-center gap-4 text-center">
          <Logo />
          <div>
            <h1 className="text-xl font-semibold">{title}</h1>
            {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
          </div>
        </div>
        {children}
        {footer ? <div className="mt-6 flex justify-center border-t border-border pt-4">{footer}</div> : null}
      </Card>
    </div>
  );
}
