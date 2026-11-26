import { ArrowLeft, Lock, Mail, Send } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { requestResetCode, resetPassword } from '../api/passwordReset';
import { AUTH_LINK, AUTH_LINK_MUTED, AuthLayout } from '../components/layout/AuthLayout';
import { Button } from '../components/ui/Button';
import { Field } from '../components/ui/Field';
import { IconInput } from '../components/ui/IconInput';
import { Input } from '../components/ui/Input';
import { OtpInput } from '../components/ui/OtpInput';
import { useToast } from '../components/ui/Toast';
import { validateEmail, validatePasswords } from '../lib/resetForm';

/** Подзаголовок карточки на каждом шаге */
const STEP_HINTS = {
  1: 'Шаг 1 из 3: электронная почта',
  2: 'Шаг 2 из 3: код из письма',
  3: 'Шаг 3 из 3: новый пароль',
  4: 'Подтверждение двухфакторной защитой',
} as const;

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
    <AuthLayout
      title="Восстановление пароля"
      subtitle={STEP_HINTS[step]}
      footer={
        <Link to="/login" className={AUTH_LINK_MUTED}>
          <ArrowLeft size={16} aria-hidden="true" />
          Вернуться ко входу
        </Link>
      }
    >

      {step === 1 ? (
        <form onSubmit={sendCode} className="flex flex-col gap-4" noValidate>
          <p className="text-sm text-muted">Мы отправим шестизначный код на вашу электронную почту.</p>
          <Field label="Электронная почта" required error={error}>
            {(p) => (
              <IconInput
                {...p}
                icon={Mail}
                type="email"
                autoComplete="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            )}
          </Field>
          <Button type="submit" loading={busy} icon={<Send size={16} aria-hidden="true" />}>
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
          <button type="button" className={`${AUTH_LINK} self-center`} onClick={() => { setStep(1); setError(''); }}>
            Отправить код ещё раз
          </button>
        </form>
      ) : null}

      {step === 3 ? (
        <form onSubmit={submitPassword} className="flex flex-col gap-4" noValidate>
          <p className="text-sm text-muted">Придумайте новый пароль.</p>
          {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
          <Field label="Новый пароль" required error={errors.next} hint="Не короче 10 символов">
            {(p) => <IconInput {...p} icon={Lock} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />}
          </Field>
          <Field label="Повторите пароль" required error={errors.repeat}>
            {(p) => <IconInput {...p} icon={Lock} type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />}
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
          <button type="button" className={`${AUTH_LINK} self-center`} onClick={() => { setRecoveryMode((prev) => !prev); setTfCode(''); setError(''); }}>
            {recoveryMode ? 'Использовать код из приложения' : 'Использовать код восстановления'}
          </button>
        </form>
      ) : null}
    </AuthLayout>
  );
}