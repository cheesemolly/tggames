// Заготовки для рендера «Лисьей охоты», которые нельзя собрать в кадре: надписи (fillText) и виньетка (градиент).
// Всё здесь делается один раз и кладётся в кэш; render.js только ставит готовое через drawImage.

const TEXTS = new Map();
const TEXT_CAP = 80;

const domCanvas = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

/**
 * Надпись как картинка: { c, w, h } в точках холста; середина по x, низ по y — точка привязки.
 * k — точек холста на единицу мира, size — высота букв в единицах мира.
 */
export function bakeText(str, color, k, size = 11, makeCanvas = domCanvas) {
  const key = `${k}|${size}|${color}|${str}`;
  let t = TEXTS.get(key);
  if (t) return t;
  if (TEXTS.size >= TEXT_CAP) TEXTS.clear();
  const px = Math.max(8, Math.round(size * k));
  const font = `800 ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  const probe = makeCanvas(4, 4).getContext('2d');
  probe.font = font;
  const tw = Math.ceil(probe.measureText(str).width ?? str.length * px * 0.6);
  const pad = Math.ceil(px * 0.3);
  const w = tw + pad * 2;
  const h = Math.ceil(px * 1.35) + pad * 2;
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.lineJoin = 'round';
  g.lineWidth = Math.max(2, px * 0.28);
  g.strokeStyle = 'rgba(30,18,30,0.85)';
  const y = pad + px;
  g.strokeText(str, w / 2, y);
  g.fillStyle = color;
  g.fillText(str, w / 2, y);
  t = { c, w, h, ox: w / 2, oy: y + pad * 0.4 };
  TEXTS.set(key, t);
  return t;
}

/** Виньетка на весь экран: тёмные углы, прозрачная середина. Размер заготовки маленький — растягивается. */
export function bakeVignette(strength = 0.5, makeCanvas = domCanvas) {
  const w = 96;
  const h = 64;
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(w / 2, h / 2, h * 0.38, w / 2, h / 2, w * 0.62);
  gr.addColorStop(0, 'rgba(10,8,22,0)');
  gr.addColorStop(1, `rgba(10,8,22,${strength})`);
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  return c;
}

export function clearBakes() {
  TEXTS.clear();
}
