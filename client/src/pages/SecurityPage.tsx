import { KeyRound } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { changePassword } from '../api/account';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { Field } from '../components/ui/Field';
import { Input } from '../components/ui/Input';
import { TwoFactorCard } from '../components/security/TwoFactorCard';
import { useToast } from '../components/ui/Toast';
import {
    EMPTY_PASSWORD_FORM,
    validatePasswordForm,
    type PasswordFormErrors,
    type PasswordFormValues,
} from '../lib/passwordForm';

/** Безопасность: смена пароля (двухфакторная защита появится позже) */
export default function SecurityPage() {
    const toast = useToast();
    const [form, setForm] = useState<PasswordFormValues>(EMPTY_PASSWORD_FORM);
    const [errors, setErrors] = useState<PasswordFormErrors>({});
    const [formError, setFormError] = useState('');
    const [busy, setBusy] = useState(false);

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        const found = validatePasswordForm(form);
        setErrors(found);
        if (Object.keys(found).length > 0) {
            return;
        }
        setBusy(true);
        setFormError('');
        try {
            await changePassword(form.current, form.next);
            toast.show('Пароль изменён');
            setForm(EMPTY_PASSWORD_FORM);
        } catch (error) {
            setFormError(error instanceof Error ? error.message : 'Не удалось сменить пароль');
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <PageHeader title="Безопасность" description="Пароль и защита учётной записи." />
            <div className="grid items-start gap-4 lg:grid-cols-2">
                <Card>
                    <CardHeader title="Смена пароля" />
                    <form onSubmit={submit} className="flex flex-col gap-3 p-5" noValidate>
                        {formError ? <p role="alert" className="text-sm text-danger">{formError}</p> : null}
                        <Field label="Текущий пароль" required error={errors.current}>
                            {(p) => <Input {...p} type="password" autoComplete="current-password" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} />}
                        </Field>
                        <Field label="Новый пароль" required error={errors.next} hint="Не короче 10 символов">
                            {(p) => <Input {...p} type="password" autoComplete="new-password" value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} />}
                        </Field>
                        <Field label="Повторите новый пароль" required error={errors.repeat}>
                            {(p) => <Input {...p} type="password" autoComplete="new-password" value={form.repeat} onChange={(e) => setForm({ ...form, repeat: e.target.value })} />}
                        </Field>
                        <div className="mt-2 flex justify-end">
                            <Button type="submit" loading={busy} icon={<KeyRound size={16} aria-hidden="true" />}>
                                Сменить пароль
                            </Button>
                        </div>
                    </form>
                </Card>
                <TwoFactorCard />
            </div>
        </>
    );
}