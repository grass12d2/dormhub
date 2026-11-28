/**
 * Отрывок найденного сообщения вокруг первого совпадения: пробелы и переносы схлопываются,
 * слева и справа не больше radius символов, обрезанное помечается многоточием
 */
export function searchSnippet(text: string, query: string, radius = 40): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const lower = flat.toLowerCase();
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const at = words.map((w) => lower.indexOf(w)).filter((i) => i >= 0);
  const index = at.length > 0 ? Math.min(...at) : 0;
  const start = index > radius ? index - radius : 0;
  const end = Math.min(flat.length, index + radius * 2);
  return `${start > 0 ? '…' : ''}${flat.slice(start, end).trim()}${end < flat.length ? '…' : ''}`;
}
