/** Проверка вложений в браузере; сервер проверяет повторно по сигнатуре */

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_FILES = 5;
export const ACCEPT = '.png,.jpg,.jpeg,.webp,.pdf,.doc,.docx,.xls,.xlsx,.txt';
const EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt'];

export function validateFile(file: { name: string; size: number }, maxBytes = MAX_FILE_BYTES): string | null {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!EXTENSIONS.includes(ext)) return `«${file.name}»: формат не поддерживается`;
  if (file.size === 0) return `«${file.name}»: файл пустой`;
  if (file.size > maxBytes) return `«${file.name}»: файл больше ${Math.round(maxBytes / 1024 / 1024)} МБ`;
  return null;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

export const isImage = (contentType: string) => contentType.startsWith('image/');