/**
 * Общий вид выпадающих меню шапки («Внешний вид», меню пользователя) и круглых кнопок рядом с ними.
 * На телефоне панель растягивается по ширине экрана с отступом 0.75rem, с sm — висит под кнопкой.
 */
export const MENU_PANEL =
  'animate-pop-in fixed inset-x-3 top-[4.25rem] z-50 max-h-[calc(100dvh-5rem)] overflow-y-auto rounded-xl border border-border bg-surface p-2 shadow-pop sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-2 sm:w-64';

/** Шапка меню: заголовок и подпись под ним */
export const MENU_HEAD = 'border-b border-border px-3 pt-1 pb-3';

/** Пункт меню */
export const MENU_ITEM =
  'flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-fg transition-colors hover:bg-surface-2';

/** Подпись группы пунктов — как заголовок группы в боковом меню */
export const MENU_LABEL = 'flex items-center justify-between gap-2 px-3 pt-2 pb-1 text-xs font-medium tracking-wide text-muted uppercase';

/** Квадратная кнопка-значок в шапке: та же высота, что у кнопки пользователя */
export const HEADER_ICON_BUTTON =
  'flex size-10 shrink-0 items-center justify-center rounded-lg text-fg transition-colors hover:bg-surface-2';
