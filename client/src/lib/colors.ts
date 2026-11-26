/** Любой CSS-цвет (hex, rgb, oklch, var(--x)) в виде #rrggbb: сервер принимает только такой формат */
export function toHex(input: string): string {
  let value = input.trim();
  const variable = /^var\((--[^,)]+)/.exec(value);
  if (variable) {
    value = getComputedStyle(document.documentElement).getPropertyValue(variable[1]).trim() || value;
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return '#000000';
  ctx.fillStyle = '#000000';
  ctx.fillStyle = value;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}