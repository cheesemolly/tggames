// Цвета для холста глобуса: Canvas не понимает var() и color-mix(), поэтому цвет скина читается через проверочный
// элемент (computed color) и разбирается в числа — из них собираются и полупрозрачные оттенки.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Цвет CSS → [r, g, b] (0…255). Понимает rgb(), rgba(), color(srgb …) и #rrggbb. */
export function parseColor(text, fallback = [128, 128, 128]) {
  const s = String(text ?? '').trim();
  let m = /^rgba?\(([^)]+)\)/.exec(s);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    if (p.length >= 3 && p.slice(0, 3).every(Number.isFinite)) return p.slice(0, 3);
  }
  m = /^color\(srgb\s+([^)]+)\)/.exec(s);
  if (m) {
    const p = m[1].split(/[\s/]+/).filter(Boolean).map(Number);
    if (p.length >= 3 && p.slice(0, 3).every(Number.isFinite)) return p.slice(0, 3).map((v) => Math.round(clamp(v, 0, 1) * 255));
  }
  m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) return [0, 2, 4].map((k) => parseInt(m[1].slice(k, k + 2), 16));
  m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) return [...m[1]].map((ch) => parseInt(ch + ch, 16));
  return fallback;
}

export const rgba = (c, a = 1) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;

/** Цвета глобуса — переменные скина --ct-g-<имя>: шар (свет, середина, край), суша, ореол, маршруты игрока и бота, сердцевина точки. */
export const GLOBE_COLORS = ['light', 'base', 'edge', 'land', 'halo', 'me', 'bot', 'core'];
