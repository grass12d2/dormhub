/** Подготовка аватара в браузере: проверка файла и вычисление квадратной обрезки */

export const AVATAR_SIZE = 256;
export const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const MAX_SOURCE_BYTES = 10 * 1024 * 1024;

/** Проверка выбранного файла; null, если файл подходит */
export function validateAvatarFile(file: { type: string; size: number }): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return 'Выберите изображение PNG, JPEG или WebP';
  }
  if (file.size === 0) {
    return 'Файл пустой';
  }
  if (file.size > MAX_SOURCE_BYTES) {
    return 'Файл больше 10 МБ';
  }
  return null;
}

/** Квадрат по центру изображения: из него получается аватар */
export function coverCrop(width: number, height: number): { sx: number; sy: number; size: number } {
  const size = Math.min(width, height);
  return { sx: Math.floor((width - size) / 2), sy: Math.floor((height - size) / 2), size };
}

/** Уменьшение до 256×256 и сжатие в WebP */
export async function resizeToWebp(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const { sx, sy, size } = coverCrop(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Не удалось обработать изображение');
  }
  context.drawImage(bitmap, sx, sy, size, size, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  bitmap.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Не удалось сжать изображение'))),
      'image/webp',
      0.85
    );
  });
}