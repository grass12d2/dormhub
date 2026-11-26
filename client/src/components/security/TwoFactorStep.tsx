import { ArrowLeft } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { AUTH_LINK, AUTH_LINK_MUTED } from '../layout/AuthLayout';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import { Input } from '../ui/Input';
import { OtpInput } from '../ui/OtpInput';

/** Второй шаг входа: шесть ячеек для кода из приложения или поле для кода восстановления */
export function TwoFactorStep({ challengeToken, onBack }: { challengeToken: string; onBack: () => void }) {
  const { verifyTwoFactor } = useAuth();
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async (value: string) => {
    setBusy(true);
    setError('');
    try {
      await verifyTwoFactor(challengeToken, value.trim());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось подтвердить код');
      if (!recoveryMode) {
        setCode('');
      }
      setBusy(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const ready = recoveryMode ? code.trim().length >= 6 : /^\d{6}$/.test(code);
    if (!ready) {
      setError(recoveryMode ? 'Введите код восстановления' : 'Введите все шесть цифр');
      return;
    }
    void send(code);
  };

  const change = (value: string) => {
    setCode(value);
    // Шесть цифр введены: отправляем сразу
    if (!recoveryMode && /^\d{6}$/.test(value) && !busy) {
      void send(value);
    }
  };

  const switchMode = () => {
    setRecoveryMode((prev) => !prev);
    setCode('');
    setError('');
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <p className="text-sm text-muted">
        {recoveryMode
          ? 'Введите один из кодов восстановления.'
          : 'Введите шестизначный код из приложения-аутентификатора.'}
      </p>
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      {recoveryMode ? (
        <Field label="Код восстановления" required>
          {(p) => (
            <Input {...p} autoFocus autoComplete="off" placeholder="abcd-ef12-3456" value={code} onChange={(e) => setCode(e.target.value)} />
          )}
        </Field>
      ) : (
        <OtpInput value={code} onChange={change} invalid={Boolean(error)} autoFocus />
      )}
      <Button type="submit" loading={busy} disabled={recoveryMode ? code.trim().length < 6 : code.length < 6}>
        Подтвердить
      </Button>
      <button type="button" className={`${AUTH_LINK} self-center`} onClick={switchMode}>
        {recoveryMode ? 'Использовать код из приложения' : 'Использовать код восстановления'}
      </button>
      <button type="button" className={`${AUTH_LINK_MUTED} self-center`} onClick={onBack}>
        <ArrowLeft size={16} aria-hidden="true" />
        Назад
      </button>
    </form>
  );
}