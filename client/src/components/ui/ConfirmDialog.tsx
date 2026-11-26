import { X } from 'lucide-react';
import { Button } from './Button';
import { Modal } from './Modal';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** Нужно прямо назвать последствия действия */
  message: string;
  confirmLabel: string;
  /** Опасное действие подсвечивается красной кнопкой */
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Диалог подтверждения необратимых действий */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" icon={<X size={16} aria-hidden="true" />} onClick={onCancel} disabled={loading}>
            Отмена
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-muted">{message}</p>
    </Modal>
  );
}