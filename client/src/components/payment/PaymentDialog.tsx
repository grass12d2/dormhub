import QRCode from 'qrcode';
import { Copy, Info, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PAYMENT_ROWS, paymentQrPayload } from '../../lib/payment';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Skeleton } from '../ui/Skeleton';
import { useToast } from '../ui/Toast';

/**
 * Окно «Оплата проживания»: реквизиты и QR-код для приложения банка.
 * Демонстрация — у всех студентов одно и то же окно, оплата здесь не проводится.
 */
export function PaymentDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [qr, setQr] = useState('');

  useEffect(() => {
    if (!open || qr) return;
    // QR рисуется в браузере, без сторонних сервисов
    QRCode.toDataURL(paymentQrPayload(), { margin: 1, width: 224, errorCorrectionLevel: 'M' })
      .then(setQr)
      .catch(() => setQr(''));
  }, [open, qr]);

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.show(`Скопировано: ${label}`);
    } catch {
      toast.show('Не удалось скопировать', 'danger');
    }
  };

  return (
    <Modal
      open={open}
      title="Оплата проживания"
      onClose={onClose}
      footer={
        <Button variant="secondary" icon={<X size={16} aria-hidden="true" />} onClick={onClose}>
          Закрыть
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="flex items-start gap-2 rounded-lg bg-primary-soft px-3 py-2 text-sm text-primary">
          <Info size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          Демонстрация: реквизиты условные, деньги по ним не переводятся.
        </p>

        <div className="flex flex-col items-center gap-2">
          {qr ? (
            <img src={qr} alt="QR-код с реквизитами для оплаты" className="size-56 rounded-lg bg-white p-1" />
          ) : (
            <Skeleton className="size-56" />
          )}
          <p className="text-center text-xs text-muted">
            Отсканируйте код в приложении банка и введите сумму к оплате.
          </p>
        </div>

        <dl className="divide-y divide-border rounded-lg border border-border">
          {PAYMENT_ROWS.map(([label, value]) => (
            <div key={label} className="flex items-start gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <dt className="text-xs text-muted">{label}</dt>
                <dd className="tabular text-sm font-medium break-words">{value}</dd>
              </div>
              <button
                type="button"
                aria-label={`Скопировать: ${label}`}
                title="Скопировать"
                onClick={() => void copy(label, value)}
                className="shrink-0 rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-fg"
              >
                <Copy size={16} aria-hidden="true" />
              </button>
            </div>
          ))}
        </dl>

        <p className="text-xs text-muted">
          После оплаты платёж отмечает администрация, обычно в течение 1–3 рабочих дней. Вопросы — в чате с администрацией.
        </p>
      </div>
    </Modal>
  );
}
