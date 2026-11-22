/** Определяет по строке платформы, что это Mac или устройство Apple */
export function isMacLike(platform: string): boolean {
  return /mac|iphone|ipad/i.test(platform);
}

/** Подпись клавиши-модификатора для сочетания поиска: ⌘ на Mac, Ctrl на остальных */
export function modifierLabel(platform: string): string {
  return isMacLike(platform) ? '⌘' : 'Ctrl';
}

/** Платформа текущего браузера (пустая строка вне браузера) */
export function currentPlatform(): string {
  if (typeof navigator === 'undefined') {
    return '';
  }
  return navigator.platform || navigator.userAgent || '';
}