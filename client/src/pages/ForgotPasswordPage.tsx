import { Mail } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { requestResetCode, resetPassword } from '../api/passwordReset';
import { Logo } from '../components/layout/Logo';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Field } from '../components/ui/Field';
import { Input } from '../components/ui/Input';
import { OtpInput } from '../components/ui/OtpInput';
import { useToast } from '../components/ui/Toast';
import { validateEmail, validatePasswords } from '../lib/resetForm';

const errorText = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

/** Восстановление пароля: 1 — email, 2 — код из письма, 3 — новый пароль, 4 — код 2FA (если включена) */
export default function ForgotPasswordPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [tfCode, setTfCode] = useState('');
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [errors, setErrors] = useState<{ next?: string; repeat?: string }>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const normalized = email.trim().toLowerCase();

  const sendCode = async (event: FormEvent) => {
    event.preventDefault();
    const problem = validateEmail(email);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await requestResetCode(normalized);
      setCode('');
      setStep(2);
    } catch (caught) {
      setError(errorText(caught, 'Не удалось отправить код'));
    } finally {
      setBusy(false);
    }
  };

  const confirmCode = (event: FormEvent) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError('Введите все шесть цифр');
      return;
    }
    setError('');
    setStep(3);
  };

  /** Отправка на сервер: с кодом 2FA или без него */
  const submitReset = async (twoFactorCode?: string) => {
    setBusy(true);
    setError('');
    try {
      await resetPassword(normalized, code, next, twoFactorCode);
      toast.show('Пароль изменён. Войдите с новым паролем.');
      navigate('/login', { replace: true });
    } catch (caught) {
      const message = errorText(caught, 'Не удалось сменить пароль');
      if (/двухфакторной/i.test(message)) {
        // Нужен второй фактор: переходим к его вводу (если код уже вводили, показываем ошибку)
        setStep(4);
        setError(twoFactorCode ? message : '');
        setTfCode('');
      } else if (/код/i.test(message)) {
        // Неверный код из письма: возвращаем на шаг 2
        setCode('');
        setStep(2);
        setError(message);
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  };

  const submitPassword = (event: FormEvent) => {
    event.preventDefault();
    const found = validatePasswords(next, repeat);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      return;
    }
    void submitReset();
  };

  const submitTwoFactor = (event: FormEvent) => {
    event.preventDefault();
    const ready = recoveryMode ? tfCode.trim().length >= 6 : /^\d{6}$/.test(tfCode);
    if (!ready) {
      setError(recoveryMode ? 'Введите код восстановления' : 'Введите все шесть цифр');
      return;
    }
    void submitReset(tfCode.trim());
  };

  const changeTf = (value: string) => {
    setTfCode(value);
    // Шесть цифр введены: отправляем сразу
    if (!recoveryMode && /^\d{6}$/.test(value) && !busy) {
      void submitReset(value);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-bg p-4">
      <Logo />
      <Card className="w-full max-w-sm p-6">
        <h1 className="mb-1 text-xl font-semibold">Восстановление пароля</h1>

        {step === 1 ? (
          <form onSubmit={sendCode} className="flex flex-col gap-3" noValidate>
            <p className="text-sm text-muted">Введите email: мы отправим на него шестизначный код.</p>
            {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
            <Field label="Email" required>
              {(p) => <Input {...p} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
            </Field>
            <Button type="submit" loading={busy} icon={<Mail size={16} aria-hidden="true" />}>
              Отправить код
            </Button>
          </form>
        ) : null}

        {step === 2 ? (
          <form onSubmit={confirmCode} className="flex flex-col gap-4" noValidate>
            <p className="text-sm text-muted">
              Если адрес {normalized} зарегистрирован, на него отправлен код. Он действует 10 минут.
            </p>
            {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
            <OtpInput value={code} onChange={setCode} invalid={Boolean(error)} autoFocus />
            <Button type="submit" disabled={code.length < 6}>Продолжить</Button>
            <button type="button" className="text-sm text-primary" onClick={() => { setStep(1); setError(''); }}>
              Отправить код ещё раз
            </button>
          </form>
        ) : null}

        {step === 3 ? (
          <form onSubmit={submitPassword} className="flex flex-col gap-3" noValidate>
            <p className="text-sm text-muted">Придумайте новый пароль.</p>
            {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
            <Field label="Новый пароль" required error={errors.next} hint="Не короче 10 символов">
              {(p) => <Input {...p} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />}
            </Field>
            <Field label="Повторите пароль" required error={errors.repeat}>
              {(p) => <Input {...p} type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />}
            </Field>
            <Button type="submit" loading={busy}>Сменить пароль</Button>
          </form>
        ) : null}

        {step === 4 ? (
          <form onSubmit={submitTwoFactor} className="flex flex-col gap-4" noValidate>
            <p className="text-sm text-muted">
              {recoveryMode
                ? 'Введите один из кодов восстановления.'
                : 'У вас включена двухфакторная защита. Введите код из приложения-аутентификатора.'}
            </p>
            {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
            {recoveryMode ? (
              <Field label="Код восстановления" required>
                {(p) => <Input {...p} autoFocus autoComplete="off" placeholder="abcd-ef12-3456" value={tfCode} onChange={(e) => setTfCode(e.target.value)} />}
              </Field>
            ) : (
              <OtpInput value={tfCode} onChange={changeTf} invalid={Boolean(error)} autoFocus />
            )}
            <Button type="submit" loading={busy} disabled={recoveryMode ? tfCode.trim().length < 6 : tfCode.length < 6}>
              Подтвердить и сменить пароль
            </Button>
            <button type="button" className="text-sm text-primary" onClick={() => { setRecoveryMode((prev) => !prev); setTfCode(''); setError(''); }}>
              {recoveryMode ? 'Использовать код из приложения' : 'Использовать код восстановления'}
            </button>
          </form>
        ) : null}

        <p className="mt-4 text-center text-sm">
          <Link to="/login" className="text-primary">Вернуться ко входу</Link>
        </p>
      </Card>
    </div>
  );
}