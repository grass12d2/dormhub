import { GraduationCap, Pencil, Plus, Trash2 } from 'lucide-react';
import { useCallback, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import {
    FUNDING_LABELS,
    createStudent,
    deleteStudent,
    listStudents,
    updateStudent,
    type FundingType,
    type Student,
} from '../api/students';
import { DataTable, type Column } from '../components/data/DataTable';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { DatePicker } from '../components/ui/DatePicker';
import { formatDate } from '../lib/format';
import { FacultyCombobox } from '../components/ui/FacultyCombobox';
import { Field } from '../components/ui/Field';
import { Input, Select } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { PhoneInput } from '../components/ui/PhoneInput';
import { useToast } from '../components/ui/Toast';
import {
    EMPTY_STUDENT_FORM,
    formFromStudent,
    groupTitle,
    toStudentInput,
    validateStudentForm,
    type StudentFormErrors,
    type StudentFormValues,
} from '../lib/studentForm';
import type { SortState } from '../lib/table';
import { useAsync } from '../lib/useAsync';
import { useDebounced } from '../lib/useDebounced';
import { FACULTIES } from '../lib/faculties';

const PAGE_SIZE = 20;
const GROUP_NUMBERS = Array.from({ length: 12 }, (_, i) => String(i + 1));

/** Страница «Студенты»: поиск и страницы на стороне сервера, сообщежитие (с учётной записью), изменение, удаление */
export default function StudentsPage() {
    const toast = useToast();
    const [params, setParams] = useSearchParams();
    // Начальный запрос приходит из поиска в шапке (?q=)
    const [query, setQuery] = useState(params.get('q') ?? '');
    const [page, setPage] = useState(1);
    const [sort, setSort] = useState<SortState | null>(null);
    const [facultyFilter, setFacultyFilter] = useState('');
    const [groupPrefix, setGroupPrefix] = useState('');
    const [groupNumber, setGroupNumber] = useState('');
    const groupFilter = groupPrefix && groupNumber ? `${groupPrefix}-${groupNumber}` : '';
    const debounced = useDebounced(query.trim());

    const students = useAsync(
        () =>
            listStudents({
                q: debounced,
                faculty: facultyFilter,
                groupName: groupFilter,
                limit: PAGE_SIZE,
                offset: (page - 1) * PAGE_SIZE,
            }),
        [debounced, facultyFilter, groupFilter, page]
    );

    const [editing, setEditing] = useState<Student | 'new' | null>(null);
    const [form, setForm] = useState<StudentFormValues>(EMPTY_STUDENT_FORM);
    const [errors, setErrors] = useState<StudentFormErrors>({});
    const [formError, setFormError] = useState('');
    const [busy, setBusy] = useState(false);
    const [toDelete, setToDelete] = useState<Student | null>(null);

    const patch = (change: Partial<StudentFormValues>) => setForm((prev) => ({ ...prev, ...change }));

    const openForm = (target: Student | 'new') => {
        setEditing(target);
        setForm(target === 'new' ? EMPTY_STUDENT_FORM : formFromStudent(target));
        setErrors({});
        setFormError('');
    };
    const closeForm = useCallback(() => setEditing(null), []);

    const changeQuery = (value: string) => {
        setQuery(value);
        setPage(1);
        // Адрес отражает запрос, чтобы страницу можно было открыть по ссылке
        setParams(value.trim() ? { q: value.trim() } : {}, { replace: true });
    };

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        const isNew = editing === 'new';
        const found = validateStudentForm(form, isNew);
        setErrors(found);
        if (Object.keys(found).length > 0 || editing === null) {
            return;
        }
        setBusy(true);
        setFormError('');
        try {
            const input = toStudentInput(form);
            if (editing === 'new') {
                await createStudent(
                    input,
                    form.createAccount ? { email: form.email.trim(), password: form.password } : undefined
                );
            } else {
                await updateStudent(editing.id, input);
            }
            toast.show(isNew ? 'Студент добавлен' : 'Изменения сохранены');
            setEditing(null);
            students.reload();
        } catch (error) {
            setFormError(error instanceof Error ? error.message : 'Не удалось сохранить');
        } finally {
            setBusy(false);
        }
    };

    const confirmDelete = async () => {
        if (!toDelete) {
            return;
        }
        setBusy(true);
        try {
            await deleteStudent(toDelete.id);
            toast.show('Студент удалён');
            students.reload();
        } catch (error) {
            toast.show(error instanceof Error ? error.message : 'Не удалось удалить', 'danger');
        } finally {
            setToDelete(null);
            setBusy(false);
        }
    };

    const data = students.data;
    const total = data?.meta.total ?? 0;
    const items = data?.items ?? [];

    // Порядок задаёт сервер (по имени); сортировка по заголовкам действует внутри текущей страницы
    const shown = sort
        ? [...items].sort((a, b) => {
            const left = sort.key === 'number' ? a.studentNumber : a.displayName;
            const right = sort.key === 'number' ? b.studentNumber : b.displayName;
            return (sort.direction === 'asc' ? 1 : -1) * left.localeCompare(right, 'ru', { numeric: true });
        })
        : items;

    const columns: Column<Student>[] = [
        { key: 'number', header: 'Студенческий', render: (s) => <span className="tabular">{s.studentNumber}</span>, sortValue: (s) => s.studentNumber },
        { key: 'name', header: 'Имя', render: (s) => <span className="font-medium">{s.displayName}</span>, sortValue: (s) => s.displayName },
        { key: 'birth', header: 'Дата рождения', render: (s) => <span className="tabular">{formatDate(s.birthDate)}</span>, hideOnMobile: true },
        { key: 'faculty', header: 'Институт', render: (s) => s.faculty ?? '—', hideOnMobile: true },
        { key: 'group', header: 'Группа', render: (s) => groupTitle(s.studyYear, s.groupName), hideOnMobile: true },
        {
            key: 'funding',
            header: 'Финансирование',
            render: (s) => (s.fundingType ? <Badge tone="primary">{FUNDING_LABELS[s.fundingType]}</Badge> : '—'),
            hideOnMobile: true,
        },
        {
            key: 'account',
            header: 'Аккаунт',
            render: (s) => <Badge tone={s.userId ? 'success' : 'neutral'}>{s.userId ? 'Есть' : 'Нет'}</Badge>,
            hideOnMobile: true,
        },
        {
            key: 'actions',
            header: '',
            align: 'right',
            render: (s) => (
                <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" aria-label="Изменить" title="Изменить" onClick={() => openForm(s)}>
                        <Pencil size={16} aria-hidden="true" />
                    </Button>
                    <Button variant="ghost" size="sm" aria-label="Удалить" title="Удалить" onClick={() => setToDelete(s)}>
                        <Trash2 size={16} aria-hidden="true" />
                    </Button>
                </div>
            ),
        },
    ];

    const isNew = editing === 'new';

    return (
        <>
            <PageHeader
                title="Студенты"
                description="Профили студентов и учётные записи."
                actions={<Button icon={<Plus size={16} aria-hidden="true" />} onClick={() => openForm('new')}>Добавить</Button>}
            />
            <DataTable
                columns={columns}
                rows={shown}
                rowKey={(s) => s.id}
                loading={students.loading}
                error={students.error}
                onRetry={students.reload}
                query={query}
                onQuery={changeQuery}
                searchPlaceholder="Поиск по имени или номеру студенческого"
                sort={sort}
                onSort={setSort}
                page={page}
                pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
                total={total}
                pageSize={PAGE_SIZE}
                onPage={setPage}
                emptyTitle="Студенты не найдены"
                toolbar={
                    <>
                        <div className="w-40">
                            <Select
                                aria-label="Фильтр по институту"
                                value={facultyFilter}
                                onChange={(e) => {
                                    setFacultyFilter(e.target.value);
                                    setPage(1);
                                }}
                            >
                                <option value="">Все институты</option>
                                {FACULTIES.map((f) => (
                                    <option key={f.code} value={f.code}>{f.code}</option>
                                ))}
                            </Select>
                        </div>
                        <div className="w-28">
                            <Input
                                aria-label="Буквы группы"
                                placeholder="Группа"
                                maxLength={2}
                                value={groupPrefix}
                                onChange={(e) => {
                                    setGroupPrefix(e.target.value.toUpperCase());
                                    setPage(1);
                                }}
                            />
                        </div>
                        <div className="w-24">
                            <Select
                                aria-label="Номер группы"
                                value={groupNumber}
                                onChange={(e) => {
                                    setGroupNumber(e.target.value);
                                    setPage(1);
                                }}
                            >
                                <option value="">№</option>
                                {GROUP_NUMBERS.map((n) => (
                                    <option key={n} value={n}>{n}</option>
                                ))}
                            </Select>
                        </div>
                    </>
                }
                emptyDescription="Измените запрос или добавьте студента."
            />

            <Modal open={editing !== null} title={isNew ? 'Новый студент' : 'Изменить студента'} onClose={closeForm}>
                <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
                    {formError ? <p role="alert" className="text-sm text-danger">{formError}</p> : null}

                    <Field label="Имя для показа" required error={errors.displayName} hint="Так студент отображается в системе">
                        {(p) => (
                            <Input
                                {...p}
                                value={form.displayName}
                                onChange={(e) => patch({ displayName: e.target.value })}
                            />
                        )}
                    </Field>

                    <div className="grid grid-cols-3 gap-3">
                        <Field label="Фамилия">
                            {(p) => <Input {...p} value={form.lastName} onChange={(e) => patch({ lastName: e.target.value })} />}
                        </Field>
                        <Field label="Имя">
                            {(p) => <Input {...p} value={form.firstName} onChange={(e) => patch({ firstName: e.target.value })} />}
                        </Field>
                        <Field label="Отчество">
                            {(p) => <Input {...p} value={form.middleName} onChange={(e) => patch({ middleName: e.target.value })} />}
                        </Field>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Номер студенческого" required error={errors.studentNumber} hint="7 цифр">
                            {(p) => <Input {...p} inputMode="numeric" value={form.studentNumber} onChange={(e) => patch({ studentNumber: e.target.value })} />}
                        </Field>
                        <Field label="Телефон" error={errors.phone}>
                            {(p) => <PhoneInput id={p.id} invalid={p['aria-invalid']} value={form.phone} onChange={(phone) => patch({ phone })} />}
                        </Field>
                    </div>

                    <Field label="Дата рождения" required error={errors.birthDate}>
                        {(p) => <DatePicker id={p.id} invalid={p['aria-invalid']} value={form.birthDate} onChange={(birthDate) => patch({ birthDate })} />}
                    </Field>

                    <Field label="Институт" error={errors.faculty}>
                        {(p) => <FacultyCombobox id={p.id} invalid={p['aria-invalid']} value={form.faculty} onChange={(faculty) => patch({ faculty })} />}
                    </Field>

                    <div className="grid grid-cols-3 gap-3">
                        <Field label="Группа (буквы)" error={errors.groupPrefix} hint="Две буквы, например МД">
                            {(p) => (
                                <Input
                                    {...p}
                                    maxLength={2}
                                    value={form.groupPrefix}
                                    onChange={(e) => patch({ groupPrefix: e.target.value.toUpperCase() })}
                                />
                            )}
                        </Field>
                        <Field label="Номер группы">
                            {(p) => (
                                <Select {...p} value={form.groupNumber} onChange={(e) => patch({ groupNumber: e.target.value })}>
                                    <option value="">—</option>
                                    {GROUP_NUMBERS.map((n) => (
                                        <option key={n} value={n}>{n}</option>
                                    ))}
                                </Select>
                            )}
                        </Field>
                        <Field label="Курс" error={errors.studyYear}>
                            {(p) => (
                                <Select {...p} value={form.studyYear} onChange={(e) => patch({ studyYear: e.target.value })}>
                                    <option value="">—</option>
                                    {[1, 2, 3, 4, 5, 6].map((n) => (
                                        <option key={n} value={n}>{n}</option>
                                    ))}
                                </Select>
                            )}
                        </Field>
                    </div>

                    <Field label="Финансирование">
                        {(p) => (
                            <Select {...p} value={form.fundingType} onChange={(e) => patch({ fundingType: e.target.value as FundingType | '' })}>
                                <option value="">Не указано</option>
                                {(Object.keys(FUNDING_LABELS) as FundingType[]).map((type) => (
                                    <option key={type} value={type}>{FUNDING_LABELS[type]}</option>
                                ))}
                            </Select>
                        )}
                    </Field>

                    {isNew ? (
                        <div className="rounded-lg border border-border p-3">
                            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                                <input
                                    type="checkbox"
                                    className="size-4 accent-[var(--primary)]"
                                    checked={form.createAccount}
                                    onChange={(e) => patch({ createAccount: e.target.checked })}
                                />
                                Создать учётную запись для входа
                            </label>
                            {form.createAccount ? (
                                <div className="mt-3 flex flex-col gap-3">
                                    <Field label="Email" required error={errors.email}>
                                        {(p) => <Input {...p} type="email" value={form.email} onChange={(e) => patch({ email: e.target.value })} />}
                                    </Field>
                                    <Field label="Пароль" required error={errors.password} hint="Не короче 10 символов">
                                        {(p) => <Input {...p} type="password" autoComplete="new-password" value={form.password} onChange={(e) => patch({ password: e.target.value })} />}
                                    </Field>
                                </div>
                            ) : null}
                        </div>
                    ) : null}

                    <div className="mt-2 flex justify-end gap-2">
                        <Button variant="secondary" onClick={closeForm}>Отмена</Button>
                        <Button type="submit" loading={busy} icon={<GraduationCap size={16} aria-hidden="true" />}>Сохранить</Button>
                    </div>
                </form>
            </Modal>

            <ConfirmDialog
                open={toDelete !== null}
                title="Удалить студента?"
                message={`Профиль «${toDelete?.displayName ?? ''}» будет удалён; учётная запись, если она есть, останется. Если по студенту есть договоры, сервер откажет.`}
                confirmLabel="Удалить"
                danger
                loading={busy}
                onConfirm={confirmDelete}
                onCancel={() => setToDelete(null)}
            />
        </>
    );
}