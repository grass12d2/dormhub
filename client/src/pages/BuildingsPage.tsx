import { Building2, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { useCallback, useState, type FormEvent } from 'react';
import {
  BUILDING_TYPE_LABELS,
  createBuilding,
  createStaff,
  deleteBuilding,
  deleteStaff,
  listBuildings,
  listStaff,
  updateBuilding,
  type Building,
  type BuildingType,
} from '../api/buildings';
import { DataTable, type Column } from '../components/data/DataTable';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Field } from '../components/ui/Field';
import { Input, Select } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';
import {
  EMPTY_BUILDING_FORM,
  toBuildingInput,
  validateBuildingForm,
  type BuildingFormErrors,
  type BuildingFormValues,
} from '../lib/buildingForm';
import { formatMoney } from '../lib/format';
import type { CellValue } from '../lib/table';
import { useAsync } from '../lib/useAsync';
import { useClientTable } from '../lib/useClientTable';

const SORT_VALUES: Record<string, (b: Building) => CellValue> = {
  number: (b) => b.buildingNumber,
  address: (b) => b.address,
  type: (b) => BUILDING_TYPE_LABELS[b.buildingType],
  floors: (b) => b.floorsCount,
  rate: (b) => b.monthlyRate,
};

const searchText = (b: Building): CellValue[] => [
  b.buildingNumber,
  b.address,
  b.metroStation,
  BUILDING_TYPE_LABELS[b.buildingType],
];
const sortValue = (b: Building, key: string): CellValue => SORT_VALUES[key]?.(b);

const toForm = (b: Building): BuildingFormValues => ({
  buildingNumber: String(b.buildingNumber),
  address: b.address,
  metroStation: b.metroStation ?? '',
  buildingType: b.buildingType,
  floorsCount: String(b.floorsCount),
  monthlyRate: String(b.monthlyRate),
});

/** Окно сотрудников общежития: список, добавление и удаление */
function StaffModal({ building, onClose }: { building: Building | null; onClose: () => void }) {
  const toast = useToast();
  const id = building?.id ?? '';
    const staff = useAsync(() => (id ? listStaff(id) : Promise.resolve([])), [id]);
  const [form, setForm] = useState({ jobTitle: '', fullName: '', phone: '' });
  const [busy, setBusy] = useState(false);

  const add = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await createStaff(id, {
        jobTitle: form.jobTitle.trim(),
        fullName: form.fullName.trim(),
        phone: form.phone.trim() || null,
      });
      setForm({ jobTitle: '', fullName: '', phone: '' });
      staff.reload();
      toast.show('Сотрудник добавлен');
    } catch (error) {
      toast.show(error instanceof Error ? error.message : 'Не удалось добавить', 'danger');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (staffId: string) => {
    try {
      await deleteStaff(id, staffId);
      staff.reload();
      toast.show('Сотрудник удалён');
    } catch (error) {
      toast.show(error instanceof Error ? error.message : 'Не удалось удалить', 'danger');
    }
  };

  return (
    <Modal
      open={building !== null}
      title={building ? `Сотрудники: общежитие ${building.buildingNumber}` : 'Сотрудники'}
      onClose={onClose}
    >
      <ul className="mb-4 divide-y divide-border">
        {(staff.data ?? []).map((member) => (
          <li key={member.id} className="flex items-center justify-between gap-3 py-2">
            <span className="min-w-0">
              <span className="block truncate font-medium">{member.fullName}</span>
              <span className="block truncate text-sm text-muted">
                {member.jobTitle}
                {member.phone ? ` · ${member.phone}` : ''}
              </span>
            </span>
            <Button variant="ghost" size="sm" aria-label="Удалить сотрудника" onClick={() => remove(member.id)}>
              <Trash2 size={16} aria-hidden="true" />
            </Button>
          </li>
        ))}
        {staff.data && staff.data.length === 0 ? (
          <li className="py-2 text-muted">Сотрудников пока нет.</li>
        ) : null}
      </ul>
      <form onSubmit={add} className="flex flex-col gap-3 border-t border-border pt-4">
        <Field label="Должность" required>
          {(p) => <Input {...p} value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} />}
        </Field>
        <Field label="ФИО" required>
          {(p) => <Input {...p} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />}
        </Field>
        <Field label="Телефон">
          {(p) => <Input {...p} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />}
        </Field>
        <Button type="submit" loading={busy} disabled={!form.jobTitle.trim() || !form.fullName.trim()}>
          Добавить сотрудника
        </Button>
      </form>
    </Modal>
  );
}

/** Страница «Общежития»: список, сообщежитие, изменение, удаление, сотрудники */
export default function BuildingsPage() {
  const toast = useToast();
  const buildings = useAsync(listBuildings);
  const table = useClientTable<Building>({ rows: buildings.data ?? [], searchText, sortValue });

  const [editing, setEditing] = useState<Building | 'new' | null>(null);
  const [form, setForm] = useState<BuildingFormValues>(EMPTY_BUILDING_FORM);
  const [errors, setErrors] = useState<BuildingFormErrors>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [staffOf, setStaffOf] = useState<Building | null>(null);
  const [toDelete, setToDelete] = useState<Building | null>(null);

  const openForm = (target: Building | 'new') => {
    setEditing(target);
    setForm(target === 'new' ? EMPTY_BUILDING_FORM : toForm(target));
    setErrors({});
    setFormError('');
  };
  const closeForm = useCallback(() => setEditing(null), []);
  const closeStaff = useCallback(() => setStaffOf(null), []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const found = validateBuildingForm(form);
    setErrors(found);
    if (Object.keys(found).length > 0 || editing === null) {
      return;
    }
    setBusy(true);
    setFormError('');
    try {
      const input = toBuildingInput(form);
      if (editing === 'new') {
        await createBuilding(input);
      } else {
        await updateBuilding(editing.id, input);
      }
      toast.show(editing === 'new' ? 'Общежитие создано' : 'Изменения сохранены');
      setEditing(null);
      buildings.reload();
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
      await deleteBuilding(toDelete.id);
      toast.show('Общежитие удалено');
      setToDelete(null);
      buildings.reload();
    } catch (error) {
      toast.show(error instanceof Error ? error.message : 'Не удалось удалить', 'danger');
      setToDelete(null);
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<Building>[] = [
    { key: 'number', header: '№', render: (b) => <span className="font-medium">{b.buildingNumber}</span>, sortValue: SORT_VALUES.number },
    { key: 'address', header: 'Адрес', render: (b) => (
      <span>
        {b.address}
        {b.metroStation ? <span className="block text-xs text-muted">м. {b.metroStation}</span> : null}
      </span>
    ), sortValue: SORT_VALUES.address },
    { key: 'type', header: 'Тип', render: (b) => <Badge tone="primary">{BUILDING_TYPE_LABELS[b.buildingType]}</Badge>, sortValue: SORT_VALUES.type, hideOnMobile: true },
    { key: 'floors', header: 'Этажей', align: 'right', render: (b) => <span className="tabular">{b.floorsCount}</span>, sortValue: SORT_VALUES.floors, hideOnMobile: true },
    { key: 'rate', header: 'Плата', align: 'right', render: (b) => <span className="tabular">{formatMoney(b.monthlyRate)}</span>, sortValue: SORT_VALUES.rate },
    { key: 'actions', header: '', align: 'right', render: (b) => (
      <div className="flex justify-end gap-1">
        <Button variant="ghost" size="sm" aria-label="Сотрудники" title="Сотрудники" onClick={() => setStaffOf(b)}>
          <Users size={16} aria-hidden="true" />
        </Button>
        <Button variant="ghost" size="sm" aria-label="Изменить" title="Изменить" onClick={() => openForm(b)}>
          <Pencil size={16} aria-hidden="true" />
        </Button>
        <Button variant="ghost" size="sm" aria-label="Удалить" title="Удалить" onClick={() => setToDelete(b)}>
          <Trash2 size={16} aria-hidden="true" />
        </Button>
      </div>
    ) },
  ];

  return (
    <>
      <PageHeader
        title="Общежития"
        description="Общежития, их параметры и сотрудники."
        actions={<Button icon={<Plus size={16} aria-hidden="true" />} onClick={() => openForm('new')}>Добавить</Button>}
      />
      <DataTable
        columns={columns}
        rows={table.items}
        rowKey={(b) => b.id}
        loading={buildings.loading}
        error={buildings.error}
        onRetry={buildings.reload}
        query={table.query}
        onQuery={table.setQuery}
        searchPlaceholder="Поиск по адресу, номеру, типу"
        sort={table.sort}
        onSort={table.setSort}
        page={table.page}
        pageCount={table.pageCount}
        total={table.total}
        pageSize={table.pageSize}
        onPage={table.setPage}
        emptyTitle="Общежитий не найдено"
        emptyDescription="Добавьте общежитие или измените запрос."
      />

      <Modal
        open={editing !== null}
        title={editing === 'new' ? 'Новое общежитие' : 'Изменить общежитие'}
        onClose={closeForm}
      >
        <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
          {formError ? <p role="alert" className="text-sm text-danger">{formError}</p> : null}
          <Field label="Номер общежития" required error={errors.buildingNumber}>
            {(p) => <Input {...p} inputMode="numeric" value={form.buildingNumber} onChange={(e) => setForm({ ...form, buildingNumber: e.target.value })} />}
          </Field>
          <Field label="Адрес" required error={errors.address}>
            {(p) => <Input {...p} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />}
          </Field>
          <Field label="Станция метро">
            {(p) => <Input {...p} value={form.metroStation} onChange={(e) => setForm({ ...form, metroStation: e.target.value })} />}
          </Field>
          <Field label="Тип общежития">
            {(p) => (
              <Select {...p} value={form.buildingType} onChange={(e) => setForm({ ...form, buildingType: e.target.value as BuildingType })}>
                {(Object.keys(BUILDING_TYPE_LABELS) as BuildingType[]).map((type) => (
                  <option key={type} value={type}>{BUILDING_TYPE_LABELS[type]}</option>
                ))}
              </Select>
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Этажей" required error={errors.floorsCount}>
              {(p) => <Input {...p} inputMode="numeric" value={form.floorsCount} onChange={(e) => setForm({ ...form, floorsCount: e.target.value })} />}
            </Field>
            <Field label="Плата за койку, ₽/мес" required error={errors.monthlyRate}>
              {(p) => <Input {...p} inputMode="decimal" value={form.monthlyRate} onChange={(e) => setForm({ ...form, monthlyRate: e.target.value })} />}
            </Field>
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="secondary" onClick={closeForm}>Отмена</Button>
            <Button type="submit" loading={busy} icon={<Building2 size={16} aria-hidden="true" />}>Сохранить</Button>
          </div>
        </form>
      </Modal>

      <StaffModal building={staffOf} onClose={closeStaff} />

      <ConfirmDialog
        open={toDelete !== null}
        title="Удалить общежитие?"
        message={`Общежитие ${toDelete?.buildingNumber ?? ''} будет удалено. Если в нём есть комнаты или сотрудники, сервер откажет.`}
        confirmLabel="Удалить"
        danger
        loading={busy}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </>
  );
}