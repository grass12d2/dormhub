export interface HighlightPart {
  text: string;
  match: boolean;
}

/** Делит текст на куски: совпадения со словами запроса (без учёта регистра) и остальное */
export function splitHighlight(text: string, query: string): HighlightPart[] {
  const words = query.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0 || !text) {
    return [{ text, match: false }];
  }
  // Длинные слова первыми, чтобы «стир» не перебивал «стирка»
  const pattern = words
    .sort((a, b) => b.length - a.length)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  return text
    .split(new RegExp(`(${pattern})`, 'giu'))
    .map((part, index) => ({ text: part, match: index % 2 === 1 }))
    .filter((part) => part.text !== '');
}
