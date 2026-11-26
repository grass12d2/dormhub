/** Сообщение без текста (только вложения) хранится с этим знаком и в ленте не показывается */
export const FILE_MARKER = '📎';

const SEGMENTER =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
const EMOJI = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}{2})(?:\uFE0F|\p{Emoji_Modifier}|\u200D\p{Extended_Pictographic}\uFE0F?)*$/u;

/** Число эмодзи, если текст состоит только из них (не более пяти); иначе 0 */
export function emojiOnlyCount(text: string): number {
  const compact = text.replace(/\s+/g, '');
  if (!compact) return 0;
  const parts = SEGMENTER ? Array.from(SEGMENTER.segment(compact), (s) => s.segment) : Array.from(compact);
  if (parts.length > 5) return 0;
  return parts.every((p) => EMOJI.test(p)) ? parts.length : 0;
}