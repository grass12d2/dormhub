import { Megaphone, Paperclip, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useCallback, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  createAnnouncement,
  deleteAnnouncement,
  deleteAnnouncementFile,
  listAnnouncements,
  replaceAnnouncement,
  uploadAnnouncementFile,
  type Announcement,
  type AnnouncementFile,
} from '../api/announcements';
import { listBuildings } from '../api/buildings';
import { listRooms } from '../api/rooms';
import { DataTable, type Column } from '../components/data/DataTable';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Field } from '../components/ui/Field';
import { Input, Select } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { RichEditor } from '../components/ui/RichEditor';
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
import { ACCEPT, MAX_FILES, formatSize, validateFile } from '../lib/files';
import { formatDate, formatDateTime } from '../lib/format';
import { useAsync } from '../lib/useAsync';

const PAGE_SIZE = 20;
const KIND_LABELS: Record<TargetRow['kind'], string> = {
  building: 'Здание',
  floor: 'Этаж здания',
  room: 'Комната',
};

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

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

  // Вложения: сохранённые на сервере и ожидающие загрузки после публикации
  const fileInput = useRef<HTMLInputElement>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [savedFiles, setSavedFiles] = useState<AnnouncementFile[]>([]);
  const [fileError, setFileError] = useState('');

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
        body: target.bodyHtml ?? `<p>${escapeHtml(target.body)}</p>`,
        targets: rows,
        expiresOn: target.expiresAt ? target.expiresAt.slice(0, 10) : '',
      });
    }
    setPendingFiles([]);
    setFileError('');
    setSavedFiles(target === 'new' ? [] : target.files);
    setErrors({});
    setFormError('');
  };

  const patchRow = (index: number, change: Partial<TargetRow>) =>
    setForm((prev) => ({ ...prev, targets: prev.targets.map((row, i) => (i === index ? { ...row, ...change } : row)) }));

  const pickFiles = (picked: FileList | null) => {
    if (!picked) return;
    const next = [...pendingFiles];
    for (const file of Array.from(picked)) {
      const problem = validateFile(file);
      if (problem) {
        setFileError(problem);
        return;
      }
      if (savedFiles.length + next.length >= MAX_FILES) {
        setFileError(`Не более ${MAX_FILES} файлов`);
        return;
      }
      next.push(file);
    }
    setFileError('');
    setPendingFiles(next);
    if (fileInput.current) fileInput.current.value = '';
  };

  const removeSaved = async (file: AnnouncementFile) => {
    if (editing === null || editing === 'new') return;
    try {
      await deleteAnnouncementFile(editing.id, file.id);
      setSavedFiles((prev) => prev.filter((f) => f.id !== file.id));
    } catch (error) {
      setFileError(error instanceof Error ? error.message : 'Не удалось удалить файл');
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const found = validateAnnouncementForm(form);
    setErrors(found);
    if (Object.keys(found).length > 0 || editing === null) return;
    setBusy(true);
    setFormError('');
    try {
      const input = toAnnouncementInput(form);
      let id: string;
      if (editing === 'new') {
        id = (await createAnnouncement(input)).id;
      } else {
        await replaceAnnouncement(editing.id, input);
        id = editing.id;
      }
      // Объявление уже сохранено; при ошибке загрузки файл можно добавить через «Изменить»
      for (const file of pendingFiles) {
        await uploadAnnouncementFile(id, file);
      }
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
            {() => (
              <RichEditor
                key={editing === 'new' ? 'new' : (editing as Announcement).id}
                value={form.body}
                invalid={Boolean(errors.body)}
                onChange={(html) => setForm((prev) => ({ ...prev, body: html }))}
                onAttach={() => fileInput.current?.click()}
              />
            )}
          </Field>

          <input
            ref={fileInput}
            type="file"
            multiple
            accept={ACCEPT}
            className="sr-only"
            aria-label="Выбрать файлы"
            onChange={(e) => pickFiles(e.target.files)}
          />
          {savedFiles.length + pendingFiles.length > 0 || fileError ? (
            <div className="flex flex-col gap-1">
              {savedFiles.map((f) => (
                <div key={f.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm">
                  <Paperclip size={14} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{f.fileName}</span>
                  <span className="tabular text-xs text-muted">{formatSize(f.sizeBytes)}</span>
                  <Button variant="ghost" size="sm" aria-label="Удалить файл" onClick={() => void removeSaved(f)}>
                    <X size={14} aria-hidden="true" />
                  </Button>
                </div>
              ))}
              {pendingFiles.map((f, i) => (
                <div key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-1.5 text-sm">
                  <Paperclip size={14} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{f.name}</span>
                  <span className="tabular text-xs text-muted">{formatSize(f.size)}</span>
                  <Button variant="ghost" size="sm" aria-label="Убрать файл" onClick={() => setPendingFiles((prev) => prev.filter((_, j) => j !== i))}>
                    <X size={14} aria-hidden="true" />
                  </Button>
                </div>
              ))}
              {fileError ? <p className="text-sm text-danger">{fileError}</p> : null}
            </div>
          ) : null}

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