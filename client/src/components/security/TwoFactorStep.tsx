import { useState, type FormEvent } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import { Input } from '../ui/Input';

/** Второй шаг входа: код из приложения (6 цифр) или код восстановления */
export function TwoFactorStep({ challengeToken, onBack }: { challengeToken: string; onBack: () => void }) {
  const { verifyTwoFactor } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (code.trim().length < 6) {
      setError('Введите код');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await verifyTwoFactor(challengeToken, code.trim());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось подтвердить код');
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <p className="text-sm text-muted">Введите код из приложения-аутентификатора или код восстановления.</p>
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      <Field label="Код" required>
        {(p) => <Input {...p} autoFocus autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />}
      </Field>
      <Button type="submit" loading={busy}>Подтвердить</Button>
      <button type="button" className="text-sm text-primary" onClick={onBack}>Назад</button>
    </form>
  );
}