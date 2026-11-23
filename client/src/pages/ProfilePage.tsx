import { ImagePlus, Save, Trash2 } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import {
  PROFILE_EVENT,
  changeEmail,
  getProfile,
  patchProfile,
  removeAvatar,
  uploadAvatar,
  type Profile,
} from '../api/account';
import { Warning } from '../components/feedback/Warning';
import { PageHeader } from '../components/layout/PageHeader';
import { displayNameOf } from '../components/layout/UserMenu';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { Field } from '../components/ui/Field';
import { Input } from '../components/ui/Input';
import { PhoneInput } from '../components/ui/PhoneInput';
import { Skeleton } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';
import { resizeToWebp, validateAvatarFile } from '../lib/avatar';
import { formatDate } from '../lib/format';
import { isCompletePhone, phoneFromApi, phoneToApi } from '../lib/phone';
import { useAsync } from '../lib/useAsync';

const errorText = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

/** Карточка аватара: выбор файла, уменьшение в браузере, удаление */
function AvatarCard({ profile, onChanged }: { profile: Profile; onChanged: () => void }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const name = profile.displayName ?? displayNameOf(profile.email);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    const problem = validateAvatarFile(file);
    if (problem) {
      toast.show(problem, 'danger');
      return;
    }
    setBusy(true);
    try {
      await uploadAvatar(await resizeToWebp(file));
      toast.show('Аватар обновлён');
      onChanged();
    } catch (error) {
      toast.show(errorText(error, 'Не удалось загрузить аватар'), 'danger');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await removeAvatar();
      toast.show('Аватар удалён');
      onChanged();
    } catch (error) {
      toast.show(errorText(error, 'Не удалось удалить аватар'), 'danger');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Аватар" />
      <div className="flex flex-col items-center gap-4 p-5">
        <Avatar name={name} className="size-28 text-4xl" />
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          aria-label="Выбрать изображение"
          onChange={(e) => void pick(e.target.files?.[0])}
        />
        <div className="flex flex-wrap justify-center gap-2">
          <Button loading={busy} icon={<ImagePlus size={16} aria-hidden="true" />} onClick={() => input.current?.click()}>
            Изменить
          </Button>
          {profile.hasAvatar ? (
            <Button variant="secondary" disabled={busy} icon={<Trash2 size={16} aria-hidden="true" />} onClick={() => void remove()}>
              Удалить
            </Button>
          ) : null}
        </div>
        <p className="text-center text-xs text-muted">PNG, JPEG или WebP. Изображение уменьшается до 256×256.</p>
      </div>
    </Card>
  );
}

/** Редактирование данных: администратор меняет имя, телефон и должность, студент — телефон */
function InfoCard({ profile, onSaved }: { profile: Profile; onSaved: () => void }) {
  const toast = useToast();
  const isAdmin = profile.role === 'admin';
  const [displayName, setDisplayName] = useState(profile.displayName ?? '');
  const [jobTitle, setJobTitle] = useState(profile.jobTitle ?? '');
  const [phone, setPhone] = useState(phoneFromApi(profile.phone));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (phone !== '+7 ' && !isCompletePhone(phone)) {
      setError('Введите номер полностью: +7 900 123-45-67');
      return;
    }
    if (isAdmin && !displayName.trim()) {
      setError('Имя не может быть пустым');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await patchProfile(
        isAdmin
          ? { displayName: displayName.trim(), jobTitle: jobTitle.trim() || null, phone: phoneToApi(phone) }
          : { phone: phoneToApi(phone) }
      );
      toast.show('Изменения сохранены');
      onSaved();
    } catch (caught) {
      setError(errorText(caught, 'Не удалось сохранить'));
    } finally {
      setBusy(false);
    }
  };

  const student = profile.student;
  const facts: Array<[string, string]> = student
    ? [
        ['Номер студенческого', student.studentNumber],
        ['Фамилия', student.lastName ?? '—'],
        ['Имя', student.firstName ?? '—'],
        ['Отчество', student.middleName ?? '—'],
        ['Дата рождения', formatDate(student.birthDate)],
        ['Институт', student.faculty ?? '—'],
        ['Группа', student.groupName ? `${student.studyYear ? `${student.studyYear}-` : ''}${student.groupName}` : '—'],
      ]
    : [];

  return (
    <Card>
      <CardHeader title="Личные данные" />
      <form onSubmit={submit} className="flex flex-col gap-3 p-5" noValidate>
        {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
        {isAdmin ? (
          <>
            <Field label="Имя" required>
              {(p) => <Input {...p} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />}
            </Field>
            <Field label="Должность">
              {(p) => <Input {...p} value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />}
            </Field>
          </>
        ) : (
          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted">Имя</dt>
              <dd className="font-medium">{profile.displayName ?? '—'}</dd>
            </div>
            {facts.map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-muted">{label}</dt>
                <dd className="font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        )}
        <Field label="Телефон">
          {(p) => <PhoneInput id={p.id} invalid={p['aria-invalid']} value={phone} onChange={setPhone} />}
        </Field>
        {!isAdmin ? (
          <p className="text-xs text-muted">Остальные данные изменяет администрация.</p>
        ) : null}
        <div className="mt-1 flex justify-end">
          <Button type="submit" loading={busy} icon={<Save size={16} aria-hidden="true" />}>Сохранить</Button>
        </div>
      </form>
    </Card>
  );
}

/** Смена email: нужен текущий пароль; после успеха страница перезагружается */
function EmailCard({ profile }: { profile: Profile }) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Введите корректный email');
      return;
    }
    if (!password) {
      setError('Введите текущий пароль');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await changeEmail(email.trim(), password);
      toast.show('Email изменён');
      // Перезагрузка: сессия восстановится по токену и покажет новый email
      window.setTimeout(() => window.location.reload(), 600);
    } catch (caught) {
      setError(errorText(caught, 'Не удалось сменить email'));
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Электронная почта" />
      <form onSubmit={submit} className="flex flex-col gap-3 p-5" noValidate>
        <p className="text-sm text-muted">Сейчас: <span className="font-medium text-fg">{profile.email}</span></p>
        {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
        <Field label="Новый email" required>
          {(p) => <Input {...p} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        <Field label="Текущий пароль" required hint="Подтверждение, что это вы">
          {(p) => <Input {...p} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <div className="mt-1 flex justify-end">
          <Button type="submit" loading={busy}>Сменить email</Button>
        </div>
      </form>
    </Card>
  );
}

/** Мой профиль: аватар, личные данные и email, данные сохраняются в базе */
export default function ProfilePage() {
  const profile = useAsync(getProfile);
  const data = profile.data;

  /** После сохранения перезагружаем профиль и сообщаем шапке, что имя могло измениться */
  const refresh = () => {
    profile.reload();
    window.dispatchEvent(new Event(PROFILE_EVENT));
  };

  return (
    <>
      <PageHeader title="Мой профиль" description="Данные вашей учётной записи." />
      {profile.error ? (
        <Warning tone="danger" title="Не удалось загрузить профиль">
          <p>{profile.error}</p>
          <Button variant="secondary" size="sm" className="mt-2" onClick={profile.reload}>Повторить</Button>
        </Warning>
      ) : profile.loading || !data ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-3">
          <AvatarCard profile={data} onChanged={profile.reload} />
          <div className="flex flex-col gap-4 lg:col-span-2">
            <InfoCard key={`${data.displayName}|${data.phone}|${data.jobTitle}`} profile={data} onSaved={refresh} />
            <EmailCard profile={data} />
          </div>
        </div>
      )}
    </>
  );
}