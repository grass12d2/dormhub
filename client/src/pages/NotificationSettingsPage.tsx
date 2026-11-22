import { useEffect, useState } from 'react';
import { Warning } from '../components/feedback/Warning';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardHeader } from '../components/ui/Card';

const KEY = 'dormhub.notifications';

interface Prefs {
  news: boolean;
  push: boolean;
  chat: boolean;
}
const DEFAULTS: Prefs = { news: true, push: false, chat: true };

function read(): Prefs {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Prefs>) };
  } catch {
    return DEFAULTS;
  }
}

/** Переключатель с подписью и описанием */
function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 px-5 py-4">
      <span>
        <span className="block font-medium">{label}</span>
        <span className="block text-sm text-muted">{hint}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-5 accent-[var(--primary)]"
      />
    </label>
  );
}

/** Настройки уведомлений: пока хранятся только в браузере */
export default function NotificationSettingsPage() {
  const [prefs, setPrefs] = useState<Prefs>(read);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch {
      // Хранилище недоступно: настройки не сохранятся
    }
  }, [prefs]);

  return (
    <>
      <PageHeader title="Уведомления" />
      <div className="flex max-w-2xl flex-col gap-4">
        <Card>
          <CardHeader title="Что присылать" />
          <div className="divide-y divide-border">
            <Toggle
              label="Новые объявления"
              hint="Сообщения администрации: учения, уборка, обработка"
              checked={prefs.news}
              onChange={(news) => setPrefs((p) => ({ ...p, news }))}
            />
            <Toggle
              label="Push-уведомления"
              hint="Оповещения вне страницы (подключатся позже)"
              checked={prefs.push}
              onChange={(push) => setPrefs((p) => ({ ...p, push }))}
            />
            <Toggle
              label="Сообщения в чате"
              hint="Новые сообщения комнаты, этажа и личные"
              checked={prefs.chat}
              onChange={(chat) => setPrefs((p) => ({ ...p, chat }))}
            />
          </div>
        </Card>
        <Warning title="Пока только в браузере">
          Настройки сохраняются на этом устройстве. Серверные уведомления и чат появятся позже.
        </Warning>
      </div>
    </>
  );
}