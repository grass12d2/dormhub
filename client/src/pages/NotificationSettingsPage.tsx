import { useEffect, useState } from 'react';
import { Warning } from '../components/feedback/Warning';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardHeader } from '../components/ui/Card';
import { NOTIFY_KEY, readNotifyPrefs, type NotifyPrefs } from '../lib/notifyPrefs';

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

/** Настройки уведомлений: хранятся только в браузере */
export default function NotificationSettingsPage() {
  const [prefs, setPrefs] = useState<NotifyPrefs>(readNotifyPrefs);

  useEffect(() => {
    try {
      localStorage.setItem(NOTIFY_KEY, JSON.stringify(prefs));
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
              hint="Всплывающее окно с новым объявлением при входе"
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
        <Warning title="Настройки хранятся в браузере">
          Они действуют только на этом устройстве. Push-уведомления и чат появятся позже.
        </Warning>
      </div>
    </>
  );
}