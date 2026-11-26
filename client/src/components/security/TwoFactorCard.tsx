import { Copy, ShieldCheck, ShieldOff, X } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useState, type FormEvent } from 'react';
import {
  disableTwoFactor,
  enableTwoFactor,
  getTwoFactorStatus,
  setupTwoFactor,
} from '../../api/twoFactor';
import { useAsync } from '../../lib/useAsync';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Field } from '../ui/Field';
import { Input } from '../ui/Input';
import { OtpInput } from '../ui/OtpInput';
import { Skeleton } from '../ui/Skeleton';
import { useToast } from '../ui/Toast';

const errorText = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

/** Блок двухфакторной защиты: включение с QR-кодом, коды восстановления, отключение */
export function TwoFactorCard() {
  const toast = useToast();
  const status = useAsync(getTwoFactorStatus);
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [qr, setQr] = useState('');
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [password, setPassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [disabling, setDisabling] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // QR-код рисуется в браузере: секрет не уходит на сторонние сервисы
  useEffect(() => {
    if (!setup) {
      setQr('');
      return;
    }
    let cancelled = false;
    void QRCode.toDataURL(setup.otpauthUrl, { width: 192, margin: 1 }).then((url) => {
      if (!cancelled) setQr(url);
    });
    return () => {
      cancelled = true;
    };
  }, [setup]);

  const begin = async () => {
    setBusy(true);
    setError('');
    try {
      setSetup(await setupTwoFactor());
      setCode('');
    } catch (caught) {
      setError(errorText(caught, 'Не удалось начать настройку'));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (event: FormEvent) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError('Введите все шесть цифр');
      return;
    }
    setBusy(true);
    setError('');
    try {
      setRecovery(await enableTwoFactor(code));
      setSetup(null);
      status.reload();
      toast.show('Двухфакторная защита включена');
    } catch (caught) {
      setError(errorText(caught, 'Не удалось включить защиту'));
    } finally {
      setBusy(false);
    }
  };

  const disable = async (event: FormEvent) => {
    event.preventDefault();
    if (!password || disableCode.trim().length < 6) {
      setError('Введите пароль и код');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await disableTwoFactor(password, disableCode.trim());
      setDisabling(false);
      setPassword('');
      setDisableCode('');
      status.reload();
      toast.show('Двухфакторная защита отключена');
    } catch (caught) {
      setError(errorText(caught, 'Не удалось отключить защиту'));
    } finally {
      setBusy(false);
    }
  };

  const copyRecovery = async () => {
    try {
      await navigator.clipboard.writeText((recovery ?? []).join('\n'));
      toast.show('Коды скопированы');
    } catch {
      toast.show('Не удалось скопировать: выделите коды вручную', 'danger');
    }
  };

  const enabled = status.data?.enabled === true;

  return (
    <Card>
      <CardHeader title="Двухфакторная защита (2FA)" />
      <div className="flex flex-col gap-4 p-5">
        {status.loading ? <Skeleton className="h-20 w-full" /> : null}
        {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}

        {recovery ? (
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-2 p-4">
            <p className="text-sm font-medium">Коды восстановления</p>
            <p className="text-sm text-muted">
              Сохраните их в надёжном месте. Каждый код работает один раз и больше не будет показан.
            </p>
            <ul className="tabular grid grid-cols-2 gap-1 text-sm">
              {recovery.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" icon={<Copy size={16} aria-hidden="true" />} onClick={() => void copyRecovery()}>
                Скопировать
              </Button>
              <Button size="sm" onClick={() => setRecovery(null)}>Я сохранил коды</Button>
            </div>
          </div>
        ) : null}

        {!status.loading && !enabled && !setup && !recovery ? (
          <>
            <p className="text-sm text-muted">
              Вход с одноразовым кодом из приложения Google Authenticator, Microsoft Authenticator
              или Яндекс Ключ.
            </p>
            <Button loading={busy} icon={<ShieldCheck size={16} aria-hidden="true" />} onClick={() => void begin()}>
              Включить 2FA
            </Button>
          </>
        ) : null}

        {setup ? (
          <form onSubmit={confirm} className="flex flex-col gap-3" noValidate>
            <p className="text-sm text-muted">
              1. Отсканируйте QR-код в приложении-аутентификаторе. 2. Введите шестизначный код из приложения.
            </p>
            {qr ? <img src={qr} alt="QR-код для приложения-аутентификатора" className="mx-auto size-48 rounded-lg bg-white p-1" /> : <Skeleton className="mx-auto size-48" />}
            <p className="text-center text-xs text-muted">
              Или введите ключ вручную: <span className="tabular font-medium text-fg break-all">{setup.secret}</span>
            </p>
            <OtpInput value={code} onChange={setCode} invalid={Boolean(error)} />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" icon={<X size={16} aria-hidden="true" />} onClick={() => { setSetup(null); setError(''); }}>Отмена</Button>
              <Button type="submit" loading={busy} disabled={code.length < 6} icon={<ShieldCheck size={16} aria-hidden="true" />}>Подтвердить</Button>
            </div>
          </form>
        ) : null}

        {enabled && !setup && !recovery ? (
          <>
            <p className="text-sm">
              Защита <span className="font-medium text-success">включена</span>. Неиспользованных кодов восстановления: {status.data?.recoveryLeft ?? 0}.
            </p>
            {disabling ? (
              <form onSubmit={disable} className="flex flex-col gap-3" noValidate>
                <Field label="Текущий пароль" required>
                  {(p) => <Input {...p} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
                </Field>
                <Field label="Код из приложения или код восстановления" required>
                  {(p) => <Input {...p} autoComplete="one-time-code" value={disableCode} onChange={(e) => setDisableCode(e.target.value)} />}
                </Field>
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" icon={<X size={16} aria-hidden="true" />} onClick={() => { setDisabling(false); setError(''); }}>Отмена</Button>
                  <Button type="submit" variant="danger" loading={busy} icon={<ShieldOff size={16} aria-hidden="true" />}>Отключить</Button>
                </div>
              </form>
            ) : (
              <Button variant="secondary" icon={<ShieldOff size={16} aria-hidden="true" />} onClick={() => setDisabling(true)}>
                Отключить 2FA
              </Button>
            )}
          </>
        ) : null}
      </div>
    </Card>
  );
}