import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { AUTH_LINK, AuthLayout } from '../components/layout/AuthLayout';
import { TwoFactorStep } from '../components/security/TwoFactorStep';
import { Button } from '../components/ui/Button';
import { Field } from '../components/ui/Field';
import { IconInput } from '../components/ui/IconInput';

/** Страница входа: пароль, затем (если включена 2FA) код подтверждения */
export default function LoginPage() {
  const { user, login } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Токен второго шага; пока он задан, показывается ввод кода
  const [challenge, setChallenge] = useState<string | null>(null);

  // Уже вошли: возвращаем туда, откуда пришли
  if (user) {
    return <Navigate to={from} replace />;
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const outcome = await login(email.trim(), password);
      if (outcome.twoFactorRequired) {
        setChallenge(outcome.challengeToken);
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось войти');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title={challenge ? 'Подтверждение входа' : 'Вход'}
      subtitle="Система управления общежитием"
    >
      {challenge ? (
        <TwoFactorStep
          challengeToken={challenge}
          onBack={() => {
            setChallenge(null);
            setPassword('');
          }}
        />
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <Field label="Электронная почта" required>
            {(props) => (
              <IconInput
                {...props}
                icon={Mail}
                type="email"
                autoComplete="username"
                placeholder="name@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            )}
          </Field>
          <div className="flex flex-col gap-2">
            <Field label="Пароль" required error={error}>
              {(props) => (
                <IconInput
                  {...props}
                  icon={Lock}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  trailing={
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                      aria-pressed={showPassword}
                    >
                      {showPassword ? (
                        <EyeOff size={18} aria-hidden="true" />
                      ) : (
                        <Eye size={18} aria-hidden="true" />
                      )}
                    </Button>
                  }
                />
              )}
            </Field>
            <div className="flex justify-end">
              <Link to="/forgot-password" className={AUTH_LINK}>
                Забыли пароль?
              </Link>
            </div>
          </div>
          <Button type="submit" loading={busy} disabled={!email || !password}>
            Войти
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}