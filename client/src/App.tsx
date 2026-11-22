import { Building2, Inbox, Plus } from 'lucide-react';
import { useState } from 'react';
import { ThemeSwitcher } from './components/ThemeSwitcher';
import { Badge } from './components/ui/Badge';
import { Button } from './components/ui/Button';
import { Card, CardHeader } from './components/ui/Card';
import { ConfirmDialog } from './components/ui/ConfirmDialog';
import { EmptyState } from './components/ui/EmptyState';
import { Field } from './components/ui/Field';
import { Input, Select, Textarea } from './components/ui/Input';
import { Modal } from './components/ui/Modal';
import { Skeleton } from './components/ui/Skeleton';
import { Spinner } from './components/ui/Spinner';
import { useToast } from './components/ui/Toast';

/** Временная страница: образцы всех компонентов в светлой и тёмной теме */
export default function App() {
  const toast = useToast();
  const [modal, setModal] = useState(false);
  const [confirm, setConfirm] = useState(false);

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-4 sm:p-8">
      <header>
        <h1 className="text-2xl font-semibold">DormHub: образцы компонентов</h1>
        <p className="text-muted">Временная страница для проверки дизайн-системы в обоих режимах.</p>
      </header>

      <Card>
        <CardHeader title="Тема" />
        <div className="p-5">
          <ThemeSwitcher />
        </div>
      </Card>

      <Card>
        <CardHeader title="Кнопки и метки" />
        <div className="flex flex-col gap-4 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <Button icon={<Plus size={16} aria-hidden="true" />}>Добавить</Button>
            <Button variant="secondary">Вторичная</Button>
            <Button variant="ghost">Прозрачная</Button>
            <Button variant="danger">Удалить</Button>
            <Button loading>Сохранение</Button>
            <Button disabled>Недоступна</Button>
            <Button size="sm">Малая</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge>Нейтральная</Badge>
            <Badge tone="primary">Действует</Badge>
            <Badge tone="success">Оплачен</Badge>
            <Badge tone="warning">Оплачен частично</Badge>
            <Badge tone="danger">Просрочен</Badge>
            <Badge tone="info">Ожидает</Badge>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Форма" />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Номер здания" required hint="Целое число от 1">
            {(props) => <Input type="number" placeholder="1" {...props} />}
          </Field>
          <Field label="Тип здания">
            {(props) => (
              <Select {...props} defaultValue="corridor">
                <option value="corridor">Коридорный</option>
                <option value="block">Блочный</option>
                <option value="apartment">Квартирный</option>
              </Select>
            )}
          </Field>
          <Field label="Адрес" error="Адрес обязателен">
            {(props) => <Input {...props} />}
          </Field>
          <Field label="Примечание">{(props) => <Textarea {...props} />}</Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Состояния" />
        <div className="grid gap-6 p-5 sm:grid-cols-2">
          <div className="flex flex-col gap-3">
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Spinner label="Загрузка данных" />
          </div>
          <EmptyState
            icon={Inbox}
            title="Пока ничего нет"
            description="Здесь появятся записи, когда вы их добавите."
            action={<Button size="sm">Добавить</Button>}
          />
        </div>
      </Card>

      <Card>
        <CardHeader title="Окна и уведомления" />
        <div className="flex flex-wrap gap-3 p-5">
          <Button variant="secondary" onClick={() => setModal(true)}>
            Открыть окно
          </Button>
          <Button variant="secondary" onClick={() => setConfirm(true)}>
            Подтверждение
          </Button>
          <Button variant="secondary" onClick={() => toast.show('Здание сохранено')}>
            Уведомление: успех
          </Button>
          <Button variant="secondary" onClick={() => toast.show('Не удалось сохранить', 'danger')}>
            Уведомление: ошибка
          </Button>
        </div>
      </Card>

      <Modal
        open={modal}
        title="Новое здание"
        onClose={() => setModal(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModal(false)}>
              Отмена
            </Button>
            <Button icon={<Building2 size={16} aria-hidden="true" />} onClick={() => setModal(false)}>
              Создать
            </Button>
          </>
        }
      >
        <Field label="Адрес" required>
          {(props) => <Input {...props} />}
        </Field>
      </Modal>

      <ConfirmDialog
        open={confirm}
        title="Отменить счёт?"
        message="Счёт будет отменён, платежи по нему принять будет нельзя. Действие нельзя отменить."
        confirmLabel="Отменить счёт"
        danger
        onConfirm={() => setConfirm(false)}
        onCancel={() => setConfirm(false)}
      />
    </main>
  );
}