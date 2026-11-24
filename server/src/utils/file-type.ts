/** Определение типа вложения по сигнатуре; расширение уточняет тип внутри одного семейства */

export const MAX_FILE_BYTES = 5 * 1024 * 1024;

export const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const startsWith = (data: Buffer, bytes: number[]) =>
  data.length >= bytes.length && bytes.every((b, i) => data[i] === b);

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

/** Тип файла или null, если формат не поддерживается или расширение не подходит к содержимому */
export function detectFileType(data: Buffer, fileName: string): string | null {
  const ext = extensionOf(fileName);
  if (startsWith(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return ext === 'png' ? 'image/png' : null;
  if (startsWith(data, [0xff, 0xd8, 0xff])) return ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : null;
  if (data.length >= 12 && data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP') {
    return ext === 'webp' ? 'image/webp' : null;
  }
  if (startsWith(data, [0x25, 0x50, 0x44, 0x46])) return ext === 'pdf' ? 'application/pdf' : null;
  // ZIP-контейнер: docx и xlsx
  if (startsWith(data, [0x50, 0x4b, 0x03, 0x04])) {
    if (ext === 'docx') return DOCX;
    if (ext === 'xlsx') return XLSX;
    return null;
  }
  // Составной документ OLE2: doc и xls
  if (startsWith(data, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    if (ext === 'doc') return 'application/msword';
    if (ext === 'xls') return 'application/vnd.ms-excel';
    return null;
  }
  if (ext === 'txt' && !data.includes(0)) {
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(data);
      return 'text/plain';
    } catch {
      return null;
    }
  }
  return null;
}

/** Безопасное имя для заголовка: без путей и управляющих символов */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  return base.replace(/[\u0000-\u001f\u007f"]/g, '').trim().slice(0, 255);
}

export const MAX_CHAT_FILE_BYTES = 10 * 1024 * 1024;