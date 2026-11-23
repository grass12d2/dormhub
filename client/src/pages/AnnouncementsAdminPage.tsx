import { Megaphone, Pencil, Plus, Trash2 } from 'lucide-react';
import { useCallback, useMemo, useState, type FormEvent } from 'react';
import {
  createAnnouncement,
  deleteAnnouncement,
  listAnnouncements,
  replaceAnnouncement,
  type Announcement,
} from '../api/announcements';
import { listBuildings } from '../api/buildings';
import { listRooms } from '../api/rooms';
import { DataTable, type Column } from '../components/data/DataTable';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Field } from '../components/ui/Field';
import { Input, Select, Textarea } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';
import {
  EMPTY_ANNOUNCEMENT_FORM,
  describeTargets,
  newTargetRow,
  targetsToRows,
  toAnnouncementInput,
  validateAnnouncementForm,
  type AnnouncementFormErrors,
  type AnnouncementFormValues,
  type TargetRow,
} from '../lib/announcementForm';
import { formatDate, formatDateTime } from '../lib/format';
import { useAsync } from '../lib/useAsync';

const PAGE_SIZE = 20;
const KIND_LABELS: Record<TargetRow['kind'], string> = {
  building: 'Здание',
  floor: 'Этаж здания',
  room: 'Комната',
};

/** Страница «Объявления» для администратора */
export default function AnnouncementsAdminPage() {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const list = useAsync(() => listAnnouncements({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }), [page]);
  const buildings = useAsync(listBuildings);
  const rooms = useAsync(() => listRooms());

  const buildingList = useMemo(() => buildings.data ?? [], [buildings.data]);
  const roomList = useMemo(() => rooms.data ?? [], [rooms.data]);
  const numberOf = (id: string) => String(buildingList.find((b) => b.id === id)?.buildingNumber ?? '?');
  const roomLabel = (id: string) => {
    const room = roomList.find((r) => r.id === id);
    return room ? `${room.roomNumber} (здание ${numberOf(room.buildingId)})` : '?';
  };

  const [editing, setEditing] = useState<Announcement | 'new' | null>(null);
  const [form, setForm] = useState<AnnouncementFormValues>(EMPTY_ANNOUNCEMENT_FORM);
  const [errors, setErrors] = useState<AnnouncementFormErrors>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState<Announcement | null>(null);

  const closeForm = useCallback(() => setEditing(null), []);

  const openForm = (target: Announcement | 'new') => {
    setEditing(target);
    if (target === 'new') {
      setForm(EMPTY_ANNOUNCEMENT_FORM);
    } else {
      // Для адреса-комнаты здание берётся из самой комнаты
      const rows = targetsToRows(target.targets).map((row) =>
        row.kind === 'room'
          ? { ...row, buildingId: roomList.find((r) => r.id === row.roomId)?.buildingId ?? '' }
          : row
      );
      setForm({
        title: target.title,
        body: target.body,
        targets: rows,
        expiresOn: target.expiresAt ? target.expiresAt.slice(0, 10) : '',
      });
    }
    setErrors({});
    setFormError('');
  };

  const patchRow = (index: number, change: Partial<TargetRow>) =>
    setForm((prev) => ({ ...prev, targets: prev.targets.map((row, i) => (i === index ? { ...row, ...change } : row)) }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const found = validateAnnouncementForm(form);
    setErrors(found);
    if (Object.keys(found).length > 0 || editing === null) return;
    setBusy(true);
    setFormError('');
    try {
      const input = toAnnouncementInput(form);
      if (editing === 'new') await createAnnouncement(input);
      else await replaceAnnouncement(editing.id, input);
      toast.show(editing === 'new' ? 'Объявление опубликовано' : 'Изменения сохранены');
      setEditing(null);
      list.reload();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setBusy(true);
    try {
      await deleteAnnouncement(toDelete.id);
      toast.show('Объявление удалено');
      list.reload();
    } catch (error) {
      toast.show(error instanceof Error ? error.message : 'Не удалось удалить', 'danger');
    } finally {
      setToDelete(null);
      setBusy(false);
    }
  };

  const total = list.data?.meta.total ?? 0;

  const columns: Column<Announcement>[] = [
    {
      key: 'title',
      header: 'Объявление',
      render: (a) => (
        <span>
          <span className="block font-medium">{a.title}</span>
          <span className="block max-w-md truncate text-xs text-muted">{a.body}</span>
        </span>
      ),
    },
    {
      key: 'to',
      header: 'Кому',
      render: (a) => describeTargets(a.targets, numberOf, roomLabel),
      hideOnMobile: true,
    },
    { key: 'date', header: 'Опубликовано', render: (a) => <span className="tabular">{formatDateTime(a.createdAt)}</span>, hideOnMobile: true },
    {
      key: 'until',
      header: 'До',
      render: (a) => (a.expiresAt ? <span className="tabular">{formatDate(a.expiresAt.slice(0, 10))}</span> : '—'),
      hideOnMobile: true,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (a) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" aria-label="Изменить" title="Изменить" onClick={() => openForm(a)}>
            <Pencil size={16} aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="sm" aria-label="Удалить" title="Удалить" onClick={() => setToDelete(a)}>
            <Trash2 size={16} aria-hidden="true" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Объявления"
        description="Сообщения для жильцов: всем, зданию, этажу или комнате."
        actions={<Button icon={<Plus size={16} aria-hidden="true" />} onClick={() => openForm('new')}>Создать</Button>}
      />
      <DataTable
        columns={columns}
        rows={list.data?.items ?? []}
        rowKey={(a) => a.id}
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        query=""
        onQuery={() => undefined}
        searchPlaceholder="Новые объявления сверху"
        sort={null}
        onSort={() => undefined}
        page={page}
        pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
        total={total}
        pageSize={PAGE_SIZE}
        onPage={setPage}
        emptyTitle="Объявлений пока нет"
        emptyDescription="Создайте первое объявление."
      />

      <Modal open={editing !== null} title={editing === 'new' ? 'Новое объявление' : 'Изменить объявление'} onClose={closeForm}>
        <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
          {formError ? <p role="alert" className="text-sm text-danger">{formError}</p> : null}
          <Field label="Заголовок" required error={errors.title}>
            {(p) => <Input {...p} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />}
          </Field>
          <Field label="Текст" required error={errors.body}>
            {(p) => <Textarea {...p} rows={5} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />}
          </Field>

          <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <p className="text-sm font-medium">Кому: {form.targets.length === 0 ? 'всем жильцам' : 'выбранным адресатам'}</p>
            {form.targets.map((row, index) => {
              const roomsOfBuilding = roomList.filter((r) => r.buildingId === row.buildingId);
              return (
                <div key={index} className="grid grid-cols-[7rem_1fr_auto] items-center gap-2">
                  <Select aria-label="Вид адреса" value={row.kind} onChange={(e) => patchRow(index, { kind: e.target.value as TargetRow['kind'], floor: '', roomId: '' })}>
                    {(Object.keys(KIND_LABELS) as TargetRow['kind'][]).map((k) => (
                      <option key={k} value={k}>{KIND_LABELS[k]}</option>
                    ))}
                  </Select>
                  <div className="flex gap-2">
                    <Select aria-label="Здание" value={row.buildingId} onChange={(e) => patchRow(index, { buildingId: e.target.value, roomId: '' })}>
                      <option value="">Здание</option>
                      {buildingList.map((b) => (
                        <option key={b.id} value={b.id}>№ {b.buildingNumber}</option>
                      ))}
                    </Select>
                    {row.kind === 'floor' ? (
                      <Input aria-label="Этаж" inputMode="numeric" placeholder="Этаж" value={row.floor} onChange={(e) => patchRow(index, { floor: e.target.value })} />
                    ) : null}
                    {row.kind === 'room' ? (
                      <Select aria-label="Комната" value={row.roomId} disabled={!row.buildingId} onChange={(e) => patchRow(index, { roomId: e.target.value })}>
                        <option value="">Комната</option>
                        {roomsOfBuilding.map((r) => (
                          <option key={r.id} value={r.id}>{r.roomNumber}</option>
                        ))}
                      </Select>
                    ) : null}
                  </div>
                  <Button variant="ghost" size="sm" aria-label="Убрать адрес" onClick={() => setForm({ ...form, targets: form.targets.filter((_, i) => i !== index) })}>
                    <Trash2 size={16} aria-hidden="true" />
                  </Button>
                </div>
              );
            })}
            {errors.targets ? <p className="text-sm text-danger">{errors.targets}</p> : null}
            <div>
              <Button variant="secondary" size="sm" icon={<Plus size={16} aria-hidden="true" />} onClick={() => setForm({ ...form, targets: [...form.targets, newTargetRow()] })}>
                Добавить адрес
              </Button>
            </div>
          </div>

          <Field label="Показывать до" error={errors.expiresOn} hint="Пусто — без срока">
            {(p) => <Input {...p} type="date" value={form.expiresOn} onChange={(e) => setForm({ ...form, expiresOn: e.target.value })} />}
          </Field>
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="secondary" onClick={closeForm}>Отмена</Button>
            <Button type="submit" loading={busy} icon={<Megaphone size={16} aria-hidden="true" />}>
              {editing === 'new' ? 'Опубликовать' : 'Сохранить'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={toDelete !== null}
        title="Удалить объявление?"
        message={`Объявление «${toDelete?.title ?? ''}» исчезнет у всех жильцов. Действие нельзя отменить.`}
        confirmLabel="Удалить"
        danger
        loading={busy}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </>
  );
}