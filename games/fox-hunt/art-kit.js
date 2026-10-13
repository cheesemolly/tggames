/// Набор художника «Лисьей охоты»: общие приёмы для всех файлов рисунков (art-fox.js, art-fx.js, art-tiles.js,
// art-mobs.js, art-items.js). Без DOM: функции получают контекст Canvas 2D и рисуют в единицах мира.
//
// Вид игры — книжка с картинками: пухлые округлые формы с объёмом, не пиксели и не плоская заливка. Свет всегда
// слева сверху. Любая масса (тело, голова, крона, камень) красится одним вызовом solid() и всегда одинаково:
//   основа → мягкое светлое пятно слева сверху, к правому низу краска густеет → тень-серп справа снизу →
//   тонкая кайма света по освещённому краю → пятна другого цвета (с тем же светом и тенью) и мелкие детали →
//   обводка тёмным тоном той же краски, не чёрным.
// Всё запекается в картинку один раз (defineSprite в art.js), поэтому здесь можно градиенты и обрезку; в кадре —
// только готовые картинки.
//
// Как рисовать новое: цвет → tone() (краска со своим светом, тенью и обводкой) → формы blob / egg / ball / capsule /
// limb / leaf (или свой контур в solid) → мелочи eye / nose / blush / speck / shine. Образец — лиса в art-fox.js.
//   • Обводка: большие массы — 1,5; мелкие части (ухо, лапа) — 1,2–1,3; зверёк меньше 20 единиц — около 1,
//     иначе контур съедает форму. Мягкое (пыль, сияние) — без обводки или с полупрозрачной.
//   • Части, которые гнутся в суставе (лапа, хвост, ухо), — limb() или открытый конец у solid() (stroke + shade):
//     обводки на суставе нет, и часть сливается с соседней при любом повороте; край можно растворить fadeEdge().
//   • Форма из нескольких фигур внахлёст (облако, крона) — solid(…, { union: true }).
//   • Контуры обходят по часовой стрелке (как на экране: вправо → вниз → влево → вверх) — тогда клочья меха
//     tufts() смотрят наружу.
//   • Цвета — только '#hex' и rgb()/rgba(): другое rgb() не разберёт, а холст может молча не принять.
// Смотреть, что получилось, — tools/fox-hunt-sheet.html (на земле своего места и в размере телефона).

import { defineSprite } from './art.js';

export const TAU = Math.PI * 2;

/** Тон, к которому уходят обводка и тени: тёмный сливовый, не чёрный. */
export const INK = '#241a26';

/** Куда смотрит освещённая сторона: влево и вверх (единичный вектор). */
export const LIGHT = [-0.62, -0.78];

/** Общие цвета игры (у мест и существ — свои, в их файлах). */
export const COLORS = {
  danger: '#ff3b30', dangerRim: '#ffe1dc',
  coin: '#ffc93c', coinLight: '#fff0a8', coinDark: '#c8901c',
  heart: '#ff4d5e', heartLight: '#ff9aa4', heartDark: '#b8243a',
  mana: '#4aa3ff', manaLight: '#bfe0ff', manaDark: '#1f6fd0',
  shield: '#9fb7d4',
  rarity: ['#c9ced6', '#4aa3ff', '#b06cff', '#ffb629'],
  elite: '#ffb629',
  poison: '#8fd14f',
  fire: '#ff8a2a', fireLight: '#ffd76a',
  ice: '#9fe3ff',
  lightning: '#fff7a8',
  shadow: 'rgba(20, 24, 40, 0.28)',
};

// ---------- числа ----------

/** Число в пределах от lo до hi. */
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Число в пределах 0…1. */
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Между a и b: t = 0 — a, 1 — b. */
export const lerp = (a, b, t) => a + (b - a) * t;

/** Плавно войти и плавно выйти: 0…1. */
export const smooth = (t) => {
  const u = clamp01(t);
  return u * u * (3 - 2 * u);
};

/** Быстро начать, мягко остановиться. */
export const easeOut = (t) => 1 - (1 - clamp01(t)) ** 3;

/** С перелётом за цель и возвратом — приземление, вскакивание. */
export const backOut = (t) => {
  const u = clamp01(t) - 1;
  return 1 + u * u * (2.7 * u + 1.7);
};

/** Горка 0 → 1 → 0. */
export const bump = (t) => Math.sin(Math.PI * clamp01(t));

/** Число из позы: всё, что не конечное число, — запасное значение (поза не должна давать NaN в рисунок). */
export const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

// ---------- цвет ----------

const parsed = new Map();

/** Разобрать цвет '#rgb', '#rrggbb', '#rrggbbaa', 'rgb(…)', 'rgba(…)' → [r, g, b, a]; не цвет — ошибка. */
export function rgb(color) {
  const known = parsed.get(color);
  if (known) return known;
  const s = String(color).trim();
  let c = null;
  if (/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s)) {
    const h = s.slice(1);
    const v = h.length < 6 ? [...h].map((x) => parseInt(x + x, 16)) : [0, 2, 4, 6].filter((i) => i < h.length).map((i) => parseInt(h.slice(i, i + 2), 16));
    c = [v[0], v[1], v[2], v.length > 3 ? v[3] / 255 : 1];
  } else if (/^rgba?\(/i.test(s)) {
    const v = (s.match(/-?\d*\.?\d+/g) ?? []).map(Number);
    if (v.length === 3 || v.length === 4) c = [v[0], v[1], v[2], v.length > 3 ? v[3] : 1];
  }
  if (!c || !c.every(Number.isFinite)) throw new Error(`не цвет: «${color}»`);
  parsed.set(color, c);
  return c;
}

const two = (v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0');

/** Цвет из трёх чисел 0…255. */
export const hex = (r, g, b) => `#${two(r)}${two(g)}${two(b)}`;

/** Смесь двух цветов: t = 0 — первый, 1 — второй. */
export function mix(a, b, t) {
  const A = rgb(a);
  const B = rgb(b);
  const u = clamp01(t);
  const r = A[0] + (B[0] - A[0]) * u;
  const g = A[1] + (B[1] - A[1]) * u;
  const l = A[2] + (B[2] - A[2]) * u;
  const o = A[3] + (B[3] - A[3]) * u;
  return o > 0.999 ? hex(r, g, l) : `rgba(${Math.round(r)},${Math.round(g)},${Math.round(l)},${Number(o.toFixed(3))})`;
}

/** Светлее: к тёплому белому (свет в игре тёплый). */
export const lighten = (c, t = 0.3) => mix(c, '#fff8ea', t);

/** Темнее, но не серее: краска гуще и чуть уходит в сливовый. */
export function darken(c, t = 0.25) {
  const [r, g, b] = rgb(c);
  const k = 1 - clamp01(t) * 0.72;
  return mix(hex(r * k, g * k, b * k), INK, clamp01(t) * 0.42);
}

/** Тот же цвет с прозрачностью a. */
export function alpha(c, a) {
  const v = rgb(c);
  return `rgba(${Math.round(v[0])},${Math.round(v[1])},${Math.round(v[2])},${Number((v[3] * clamp01(a)).toFixed(3))})`;
}

/** Цвет обводки для заливки: тёмный тон той же краски (60–70 % к сливовому), никогда не чёрный. */
export const outline = (c, t = 0.64) => mix(c, INK, t);

/**
 * Краска формы: основа и всё, что из неё следует. Можно задать своё: light — освещённое место, dark — тень,
 * line — обводка, lw — её толщина (1,5; 0 — без обводки), rim — сила каймы света (0…1), shade — сила тени-серпа
 * (1 — обычная, 0 — без неё), flat — без объёма (значок, плоская деталь).
 */
export function tone(fill, o = {}) {
  return {
    fill,
    light: o.light ?? lighten(fill, 0.36),
    dark: o.dark ?? darken(fill, 0.3),
    line: o.line ?? outline(fill),
    lw: o.lw ?? 1.5,
    rim: o.rim ?? 0.55,
    shade: o.shade ?? 1,
    flat: o.flat ?? false,
  };
}

const asTone = (look) => (typeof look === 'string' ? tone(look) : look);

// ---------- случайность ----------

/** Случайные числа 0…1 от зерна: рисунок всегда один и тот же. */
export function rand(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Случайное 0…1 от пары целых (клетка и номер) — без состояния. */
export function hash2(a, b) {
  let x = Math.imul(a * 374761393 + b * 668265263, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

// ---------- контуры ----------
// Каждая функция добавляет замкнутый контур к текущему пути (beginPath не зовёт) и возвращает его рамку
// [x0, y0, x1, y1] — по ней solid() кладёт свет и тень.

function boxOf(pts) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of pts) {
    if (p[0] < x0) x0 = p[0];
    if (p[0] > x1) x1 = p[0];
    if (p[1] < y0) y0 = p[1];
    if (p[1] > y1) y1 = p[1];
  }
  return [x0, y0, x1, y1];
}

// кривые между узлами: линия в узле идёт вдоль соседей, плечо — треть хорды (без петель при неровном шаге);
// в остром узле плеча нет
function curveTo(g, p0, p1, p2, p3, tension) {
  const k = (Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) * tension) / 3;
  let ax = p1[0];
  let ay = p1[1];
  let bx = p2[0];
  let by = p2[1];
  if (!p1[2] && p0) {
    const dx = p2[0] - p0[0];
    const dy = p2[1] - p0[1];
    const d = Math.hypot(dx, dy) || 1;
    ax += (dx / d) * k;
    ay += (dy / d) * k;
  }
  if (!p2[2] && p3) {
    const dx = p3[0] - p1[0];
    const dy = p3[1] - p1[1];
    const d = Math.hypot(dx, dy) || 1;
    bx -= (dx / d) * k;
    by -= (dy / d) * k;
  }
  g.bezierCurveTo(ax, ay, bx, by, p2[0], p2[1]);
}

/** Гладкий замкнутый контур через узлы [x, y]; узел [x, y, 1] — острый угол (кончик уха, клок меха). */
export function pathBlob(g, pts, tension = 1) {
  const n = pts.length;
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < n; i++) curveTo(g, pts[(i - 1 + n) % n], pts[i], pts[(i + 1) % n], pts[(i + 2) % n], tension);
  g.closePath();
  return boxOf(pts);
}

/** Кусок того же контура от узла from до узла to (по ходу узлов) — обводка формы с открытым концом. */
export function pathBlobSpan(g, pts, from, to, tension = 1) {
  const n = pts.length;
  g.moveTo(pts[from][0], pts[from][1]);
  for (let i = from; i !== to; i = (i + 1) % n) curveTo(g, pts[(i - 1 + n) % n], pts[i], pts[(i + 1) % n], pts[(i + 2) % n], tension);
}

/** Многоугольник с острыми углами. */
export function pathPoly(g, pts) {
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
  return boxOf(pts);
}

/** Эллипс (rot — поворот). */
export function pathEllipse(g, cx, cy, rx, ry = rx, rot = 0) {
  g.moveTo(cx + Math.cos(rot) * rx, cy + Math.sin(rot) * rx);
  g.ellipse(cx, cy, rx, ry, rot, 0, TAU);
  g.closePath();
  const r = Math.max(rx, ry);
  return rot ? [cx - r, cy - r, cx + r, cy + r] : [cx - rx, cy - ry, cx + rx, cy + ry];
}

/** Узлы «яйца»: эллипс, у которого конец +x толще, а −x уже (fat 0…0.5); rot — куда смотрит толстый конец. */
export function eggNodes(cx, cy, rx, ry, rot = 0, fat = 0, n = 16) {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const x = rx * Math.cos(a);
    const y = ry * Math.sin(a) * (1 + fat * Math.cos(a));
    out.push([cx + x * c - y * s, cy + x * s + y * c]);
  }
  return out;
}

/** Яйцо — см. eggNodes. */
export const pathEgg = (g, cx, cy, rx, ry, rot = 0, fat = 0) => pathBlob(g, eggNodes(cx, cy, rx, ry, rot, fat), 1.04);

// касательные двух кругов: угол оси и раствор
function tangent(x1, y1, r1, x2, y2, r2) {
  const d = Math.hypot(x2 - x1, y2 - y1);
  return { d, a: Math.atan2(y2 - y1, x2 - x1), b: d > 1e-6 ? Math.acos(clamp((r1 - r2) / d, -1, 1)) : Math.PI / 2 };
}

/** Капсула: два круга (x1, y1, r1) и (x2, y2, r2), стянутые касательными, — лапа, шея, бревно, сужающийся хвост. */
export function pathCapsule(g, x1, y1, r1, x2, y2, r2) {
  const { d, a, b } = tangent(x1, y1, r1, x2, y2, r2);
  if (d + Math.min(r1, r2) <= Math.max(r1, r2) + 1e-6) return r1 >= r2 ? pathEllipse(g, x1, y1, r1) : pathEllipse(g, x2, y2, r2);
  g.moveTo(x1 + Math.cos(a + b) * r1, y1 + Math.sin(a + b) * r1);
  g.arc(x1, y1, r1, a + b, a - b + TAU);
  g.lineTo(x2 + Math.cos(a - b) * r2, y2 + Math.sin(a - b) * r2);
  g.arc(x2, y2, r2, a - b, a + b);
  g.closePath();
  return [Math.min(x1 - r1, x2 - r2), Math.min(y1 - r1, y2 - r2), Math.max(x1 + r1, x2 + r2), Math.max(y1 + r1, y2 + r2)];
}

// та же капсула без дуги вокруг первого круга — обводка части, которая растёт из сустава
function pathCapsuleOpen(g, x1, y1, r1, x2, y2, r2) {
  const { a, b } = tangent(x1, y1, r1, x2, y2, r2);
  g.moveTo(x1 + Math.cos(a - b) * r1, y1 + Math.sin(a - b) * r1);
  g.lineTo(x2 + Math.cos(a - b) * r2, y2 + Math.sin(a - b) * r2);
  g.arc(x2, y2, r2, a - b, a + b);
  g.lineTo(x1 + Math.cos(a + b) * r1, y1 + Math.sin(a + b) * r1);
}

/** Лист: от черешка (x1, y1) до кончика (x2, y2), w — ширина, bend — изгиб вбок (в долях длины). */
export function pathLeaf(g, x1, y1, x2, y2, w, bend = 0) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const mx = (x1 + x2) / 2 + nx * bend * len;
  const my = (y1 + y2) / 2 + ny * bend * len;
  g.moveTo(x1, y1);
  g.quadraticCurveTo(mx - nx * w, my - ny * w, x2, y2);
  g.quadraticCurveTo(mx + nx * w, my + ny * w, x1, y1);
  g.closePath();
  const h = w / 2 + Math.abs(bend) * len;
  return [Math.min(x1, x2) - h, Math.min(y1, y2) - h, Math.max(x1, x2) + h, Math.max(y1, y2) + h];
}

/** Звезда: n лучей, inner — доля радиуса у впадин, rot — куда смотрит первый луч. */
export function pathStar(g, cx, cy, r, n = 5, inner = 0.5, rot = -Math.PI / 2) {
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n;
    const d = i % 2 ? r * inner : r;
    if (i) g.lineTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d);
    else g.moveTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d);
  }
  g.closePath();
  return [cx - r, cy - r, cx + r, cy + r];
}

/**
 * Клочья меха вдоль прямого края — узлы для blob(): n зубцов от (x1, y1) до (x2, y2), остриями влево от хода
 * (у контура по часовой стрелке — наружу) на depth; lean — куда зачёсаны: 0 — торчат прямо, 1 — легли к концу края.
 * Концы края в ответ не входят: их узлы задаёт сам контур.
 */
export function tufts(x1, y1, x2, y2, n, depth, lean = 0.5) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = dy / len;
  const ny = -dx / len;
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = i / n;
    const tip = (i + 0.5 + 0.42 * lean) / n;
    const mid = (a + tip) / 2;
    if (i) out.push([x1 + dx * a, y1 + dy * a, 1]);
    out.push([x1 + dx * mid + nx * depth * 0.66, y1 + dy * mid + ny * depth * 0.66]);
    out.push([x1 + dx * tip + nx * depth, y1 + dy * tip + ny * depth, 1]);
  }
  return out;
}

/** То же по дуге круга (cx, cy, r) от угла a0 до a1 (по часовой стрелке a1 > a0): щека, грива, конец хвоста. */
export function tuftsArc(cx, cy, r, a0, a1, n, depth, lean = 0.5) {
  const at = (u, d) => {
    const a = a0 + (a1 - a0) * u;
    return [cx + Math.cos(a) * (r + d), cy + Math.sin(a) * (r + d)];
  };
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = i / n;
    const tip = (i + 0.5 + 0.42 * lean) / n;
    if (i) out.push([...at(a, 0), 1]);
    out.push(at((a + tip) / 2, depth * 0.66));
    out.push([...at(tip, depth), 1]);
  }
  return out;
}

// ---------- объём ----------

// обрезать по контуру edge, сдвинутому на (dx, dy); снимает обрезку парный g.restore()
function clipShifted(g, edge, dx, dy) {
  g.save();
  g.save();
  g.translate(dx, dy);
  g.beginPath();
  edge(g);
  g.restore();
  g.clip();
}

// Закрасить массу: основа, свет, тень-серп, кайма. box — по какой рамке класть свет (у пятна — рамка всей формы),
// edge — чей край даёт тень и кайму (у пятна — край всей формы: по своей границе пятно не оттеняется).
// Серп и кайма — это «форма минус она же, сдвинутая к свету (от света)». Вычитания у холста нет, поэтому красим
// наоборот: сначала всю форму тенью, потом под обрезкой сдвинутым контуром возвращаем свет. Так годится любой
// контур, и составной из нескольких кругов тоже.
function mass(g, trace, L, box, edge) {
  g.beginPath();
  const own = trace(g);
  const b = box ?? own;
  g.fillStyle = L.fill;
  g.fill();
  if (L.flat || !b) return b;
  const x0 = b[0];
  const y0 = b[1];
  const w = b[2] - b[0];
  const h = b[3] - b[1];
  const s = Math.min(w, h);
  const far = Math.max(w, h);
  const m = far + 8;
  const rim = edge ?? trace;
  // свет: тёплое пятно слева сверху, к правому низу краска густеет
  const grad = g.createRadialGradient(x0 + w * 0.33, y0 + h * 0.27, s * 0.04, x0 + w * 0.4, y0 + h * 0.36, far * 0.82);
  grad.addColorStop(0, L.light);
  grad.addColorStop(0.46, L.fill);
  grad.addColorStop(1, mix(L.fill, L.dark, 0.82));
  const all = (style) => {
    g.fillStyle = style;
    g.fillRect(x0 - m, y0 - m, w + m * 2, h + m * 2);
  };
  const d = clamp(s * 0.17, 0.9, 4.2) * L.shade + L.lw / 2;
  const shaded = () => {
    all(grad);
    if (!(L.shade > 0)) return;
    // тень в два шага — край серпа не режет глаз
    all(alpha(L.dark, 0.34));
    all(alpha(L.dark, 0.42));
    clipShifted(g, rim, LIGHT[0] * d * 0.55, LIGHT[1] * d * 0.55);
    all(grad);
    all(alpha(L.dark, 0.34));
    clipShifted(g, rim, LIGHT[0] * d, LIGHT[1] * d);
    all(grad);
    g.restore();
    g.restore();
  };
  g.save();
  g.clip();
  shaded();
  if (L.rim > 0) {
    // кайма света по освещённому краю: то же самое, но сдвиг от света и совсем тонко
    const e = L.lw / 2 + clamp(s * 0.05, 0.45, 0.9);
    all(alpha(L.light, L.rim));
    clipShifted(g, rim, -LIGHT[0] * e, -LIGHT[1] * e);
    shaded();
    g.restore();
  }
  g.restore();
  return b;
}

/**
 * Главный приём: закрасить форму «с объёмом». trace(g) — функция, добавляющая контур (любая path… отсюда или своя;
 * должна вернуть рамку [x0, y0, x1, y1]). look — краска (tone() или просто цвет; непрозрачная). o:
 *   over(g, patch) — что нарисовано на самой форме, под обводкой и строго внутри контура: линии, румянец, узор.
 *                    patch(узлы или контур, краска) — пятно другого цвета (кремовая морда на рыжей голове, носок на
 *                    лапе): оно освещено как часть той же формы — свой свет и своя тень по краю формы, без шва;
 *   stroke(g)      — свой путь обводки вместо всего контура (открытый конец у сустава);
 *   shade(g)       — свой контур для тени и каймы (у открытого конца он длиннее формы, чтобы сустав остался чистым);
 *   union          — контур сложен из нескольких фигур внахлёст (крона из трёх кругов): обводка идёт только по
 *                    внешнему краю (и целиком снаружи формы);
 *   box            — рамка, если trace её не возвращает.
 */
export function solid(g, trace, look, o = {}) {
  const L = asTone(look);
  const edge = o.shade ?? trace;
  const outline = () => {
    g.beginPath();
    (o.stroke ?? trace)(g);
    g.strokeStyle = L.line;
    g.lineWidth = o.union ? L.lw * 2 : L.lw;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.stroke();
  };
  // у составной формы линия идёт первой и вдвое толще: заливка закроет её внутреннюю половину и все перемычки
  if (L.lw > 0 && o.union) outline();
  const b = mass(g, trace, L, o.box, edge);
  if (o.over) {
    g.save();
    g.beginPath();
    trace(g);
    g.clip();
    o.over(g, (shape, paint) => mass(g, typeof shape === 'function' ? shape : (c) => pathBlob(c, shape), { ...asTone(paint), lw: L.lw }, b, edge));
    g.restore();
  }
  if (L.lw > 0 && !o.union) outline();
}

/**
 * Часть фигуры: картинка с рамкой box = [x0, y0, x1, y1], заданной от сустава, вокруг которого часть вращается.
 * paint(g, v) рисует в осях сустава (он в нуле) — те же числа потом стоят в позах фигуры.
 */
export function definePart(key, box, paint, variants = 1, pad = 1) {
  defineSprite(key, {
    w: box[2] - box[0],
    h: box[3] - box[1],
    ox: -box[0],
    oy: -box[1],
    variants,
    pad,
    paint(g, v) {
      g.translate(-box[0], -box[1]);
      paint(g, v);
    },
  });
}

/**
 * Растворить край уже нарисованной части: вдоль линии от (x1, y1) — совсем прозрачно — до (x2, y2) — целиком.
 * Так лапа «врастает» в тело, а ухо — в голову: шва не видно при любом повороте. Звать последним.
 */
export function fadeEdge(g, x1, y1, x2, y2) {
  g.save();
  g.globalCompositeOperation = 'destination-in';
  g.fillStyle = linear(g, x1, y1, x2, y2, [[0, 'rgba(0,0,0,0)'], [1, '#000000']]);
  g.fillRect(-999, -999, 1998, 1998);
  g.restore();
}

/** Нарисовать что-то строго внутри контура (пятно на шкуре, блик на воде): paint(g) — под обрезкой. */
export function within(g, trace, paint) {
  g.save();
  g.beginPath();
  trace(g);
  g.clip();
  paint(g);
  g.restore();
}

/** Гладкая форма через узлы — с объёмом и обводкой. */
export const blob = (g, pts, look, o) => solid(g, (c) => pathBlob(c, pts), look, o);

/** Яйцо (см. eggNodes) — тело, голова, камень. */
export const egg = (g, cx, cy, rx, ry, look, rot = 0, fat = 0, o) => solid(g, (c) => pathEgg(c, cx, cy, rx, ry, rot, fat), look, o);

/** Шар или эллипс. */
export const ball = (g, cx, cy, rx, ry, look, o) => solid(g, (c) => pathEllipse(c, cx, cy, rx, ry ?? rx), look, o);

/** Капсула с обводкой кругом — отдельная деталь (бревно, рог, палец). */
export const capsule = (g, x1, y1, r1, x2, y2, r2, look, o) => solid(g, (c) => pathCapsule(c, x1, y1, r1, x2, y2, r2), look, o);

/**
 * Конечность из сустава: капсула, у которой вокруг первого круга нет ни обводки, ни тени — этим концом она
 * ложится на соседнюю часть (или следующий сегмент хвоста на предыдущий) и сливается с ней при любом повороте.
 * Соседний сегмент в этом месте должен кончаться кругом того же радиуса с центром в точке привязки.
 */
export function limb(g, x1, y1, r1, x2, y2, r2, look, o = {}) {
  const d = Math.hypot(x2 - x1, y2 - y1) || 1;
  const bx = x1 - ((x2 - x1) / d) * r1 * 3;
  const by = y1 - ((y2 - y1) / d) * r1 * 3;
  solid(g, (c) => pathCapsule(c, x1, y1, r1, x2, y2, r2), look, {
    stroke: (c) => pathCapsuleOpen(c, x1, y1, r1, x2, y2, r2),
    shade: (c) => pathCapsule(c, bx, by, r1, x2, y2, r2),
    ...o,
  });
}

/** Лист с жилкой (vein — её цвет; без него жилки нет). */
export function leaf(g, x1, y1, x2, y2, w, look, bend = 0, vein = null) {
  solid(g, (c) => pathLeaf(c, x1, y1, x2, y2, w, bend), look, {
    over: vein ? (c) => {
      const len = Math.hypot(x2 - x1, y2 - y1) || 1;
      c.strokeStyle = vein;
      c.lineWidth = 0.7;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(x1, y1);
      c.quadraticCurveTo((x1 + x2) / 2 - ((y2 - y1) / len) * bend * len * 0.9, (y1 + y2) / 2 + ((x2 - x1) / len) * bend * len * 0.9, x2, y2);
      c.stroke();
    } : null,
  });
}

// ---------- линии ----------

/** Гладкая незамкнутая линия через узлы: рот, складка, бровь, ус. */
export function stroke(g, pts, color, lw = 1.2) {
  g.strokeStyle = color;
  g.lineWidth = lw;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0; i + 1 < pts.length; i++) curveTo(g, pts[i - 1], pts[i], pts[i + 1], pts[i + 2], 1);
  g.stroke();
}

/** Штрихи меха внутри формы: marks — [[x, y, угол, длина], …]; короткие дужки тоном темнее шкуры. */
export function fur(g, marks, color, lw = 0.9) {
  g.strokeStyle = color;
  g.lineWidth = lw;
  g.lineCap = 'round';
  for (const [x, y, a, len] of marks) {
    const dx = Math.cos(a) * len;
    const dy = Math.sin(a) * len;
    g.beginPath();
    g.moveTo(x - dx / 2, y - dy / 2);
    g.quadraticCurveTo(x + dy * 0.3, y - dx * 0.3, x + dx / 2, y + dy / 2);
    g.stroke();
  }
}

// ---------- свет и блики ----------

/** Круговой градиент: stops — [[доля, цвет], …]. */
export function radial(g, x, y, r, stops, r0 = 0) {
  const grad = g.createRadialGradient(x, y, r0, x, y, r);
  for (const [at, color] of stops) grad.addColorStop(at, color);
  return grad;
}

/** Линейный градиент от (x1, y1) к (x2, y2): stops — [[доля, цвет], …]. */
export function linear(g, x1, y1, x2, y2, stops) {
  const grad = g.createLinearGradient(x1, y1, x2, y2);
  for (const [at, color] of stops) grad.addColorStop(at, color);
  return grad;
}

/** Мягкое сияние: круг цвета color, к краю сходит на нет (strength — яркость середины). */
export function glow(g, x, y, r, color, strength = 0.6) {
  g.fillStyle = radial(g, x, y, r, [[0, alpha(color, strength)], [0.4, alpha(color, strength * 0.45)], [1, alpha(color, 0)]]);
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
}

/** Белая точка-блик: маленький наклонный овал — на глазу, носу, ягоде, капле. */
export function speck(g, x, y, r, a = 0.9, color = '#ffffff') {
  g.fillStyle = alpha(color, a);
  g.beginPath();
  g.ellipse(x, y, r, r * 0.72, -0.7, 0, TAU);
  g.fill();
}

/** Блик глянцевой вещи: большая точка слева сверху и маленькая рядом, от середины (x, y) формы радиуса r. */
export function shine(g, x, y, r, a = 0.85) {
  speck(g, x - r * 0.36, y - r * 0.42, r * 0.24, a);
  speck(g, x - r * 0.62, y - r * 0.08, r * 0.1, a * 0.8);
}

/** Искорка: четыре острых луча (звёздочка-блеск); r — длина луча. */
export function sparkle(g, x, y, r, color = '#ffffff', thin = 0.22) {
  g.fillStyle = color;
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const d = i % 2 ? r * thin : r;
    if (i) g.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
    else g.moveTo(x + d, y);
  }
  g.closePath();
  g.fill();
}

/** Румянец: мягкое розовое пятно на щеке. */
export function blush(g, x, y, r, color = '#ff8f8a', a = 0.5) {
  glow(g, x, y, r, color, a);
}

// ---------- мордочка ----------

/** Нос: тёмная капелька с бликом. */
export function nose(g, x, y, r, color = '#2a1a16') {
  g.fillStyle = color;
  g.beginPath();
  pathBlob(g, [[x - r, y - r * 0.3], [x, y - r * 0.78], [x + r, y - r * 0.3], [x + r * 0.5, y + r * 0.55], [x, y + r * 0.86], [x - r * 0.5, y + r * 0.55]]);
  g.fill();
  speck(g, x - r * 0.3, y - r * 0.32, r * 0.3, 0.75);
}

/**
 * Глаз: тёмный, с белой точкой-бликом слева сверху; r — полувысота. kind:
 *   'round'  — обычный, чуть вытянут вверх;
 *   'prey'   — большой круглый глаз добычи: два блика и тёплый отсвет снизу;
 *   'narrow' — прищур: сверху срезан веком (lid 0…1 — насколько, slant — наклон века к носу, в радианах);
 *              brow — цвет брови над веком (враги хмурятся; без него — просто усталый или решительный взгляд);
 *   'closed' — закрыт (дуга вниз);        'happy'  — зажмурен от удовольствия (дуга вверх);
 *   'cross'  — крестик (сбит с ног);      'squint' — зажмурен от боли: «>» (dir −1 — «<»);
 *   'wide'   — вытаращен от страха: белок и маленький зрачок.
 * color — цвет глаза, wide — насколько он шире обычного (1 — как есть), glint — цвет тёплого отсвета снизу
 * (у 'round' его нет, пока не задан).
 */
export function eye(g, x, y, r, o = {}) {
  const kind = o.kind ?? 'round';
  const color = o.color ?? '#221613';
  const lw = Math.max(0.7, r * 0.46);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (kind === 'closed' || kind === 'happy') {
    const up = kind === 'happy' ? -1 : 1;
    g.strokeStyle = color;
    g.lineWidth = lw;
    g.beginPath();
    g.moveTo(x - r * 0.8, y - up * r * 0.1);
    g.quadraticCurveTo(x, y + up * r * 0.72, x + r * 0.8, y - up * r * 0.1);
    g.stroke();
    return;
  }
  if (kind === 'cross') {
    g.strokeStyle = color;
    g.lineWidth = lw;
    g.beginPath();
    g.moveTo(x - r * 0.68, y - r * 0.68);
    g.lineTo(x + r * 0.68, y + r * 0.68);
    g.moveTo(x + r * 0.68, y - r * 0.68);
    g.lineTo(x - r * 0.68, y + r * 0.68);
    g.stroke();
    return;
  }
  if (kind === 'squint') {
    const d = o.dir ?? 1;
    g.strokeStyle = color;
    g.lineWidth = lw;
    g.beginPath();
    g.moveTo(x - d * r * 0.7, y - r * 0.66);
    g.lineTo(x + d * r * 0.6, y);
    g.lineTo(x - d * r * 0.7, y + r * 0.66);
    g.stroke();
    return;
  }
  if (kind === 'wide') {
    g.fillStyle = '#ffffff';
    g.strokeStyle = color;
    g.lineWidth = Math.max(0.5, r * 0.22);
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
    g.stroke();
    g.fillStyle = color;
    g.beginPath();
    g.arc(x + r * 0.12, y + r * 0.05, r * 0.42, 0, TAU);
    g.fill();
    speck(g, x - r * 0.08, y - r * 0.12, r * 0.16, 1);
    return;
  }
  const rx = r * (kind === 'prey' ? 0.94 : 0.8) * (o.wide ?? 1);
  if (kind === 'narrow') {
    // нижняя часть глаза под веком: дуга, замкнутая хордой
    const lid = clamp(o.lid ?? 0.4, 0, 0.9);
    const cut = Math.asin(clamp(1 - lid * 2, -1, 1));       // на какой высоте хорда: 0.5 — через середину
    g.save();
    g.translate(x, y);
    g.rotate(o.slant ?? 0);
    g.scale(rx / r, 1);
    g.fillStyle = color;
    g.beginPath();
    g.arc(0, 0, r, -cut, Math.PI + cut);
    g.closePath();
    g.fill();
    g.restore();
    g.save();
    g.translate(x, y);
    g.rotate(o.slant ?? 0);
    const ly = -Math.sin(cut) * r;
    if (o.brow) {
      g.strokeStyle = o.brow;
      g.lineWidth = Math.max(0.6, r * 0.3);
      g.beginPath();
      g.moveTo(-rx * 1.1, ly - r * 0.36);
      g.quadraticCurveTo(-rx * 0.1, ly - r * 0.42, rx * 0.85, ly - r * 0.14);
      g.stroke();
    }
    g.restore();
    speck(g, x - rx * 0.3, y + ly * 0.5 + r * 0.16, r * 0.2, 0.95);
    return;
  }
  g.fillStyle = color;
  g.beginPath();
  g.ellipse(x, y, rx, r, 0, 0, TAU);
  g.fill();
  if (kind === 'prey') {
    // тёплый отсвет снизу — глаз кажется влажным и глубоким
    g.save();
    g.beginPath();
    g.ellipse(x, y, rx, r, 0, 0, TAU);
    g.clip();
    g.fillStyle = alpha(o.glint ?? '#a8683a', 0.75);
    g.beginPath();
    g.ellipse(x + rx * 0.1, y + r * 0.95, rx * 0.95, r * 0.62, 0, 0, TAU);
    g.fill();
    g.restore();
    speck(g, x - rx * 0.3, y - r * 0.36, r * 0.36, 1);
    speck(g, x + rx * 0.36, y + r * 0.3, r * 0.15, 0.85);
    return;
  }
  if (o.glint) {
    g.save();
    g.beginPath();
    g.ellipse(x, y, rx, r, 0, 0, TAU);
    g.clip();
    g.fillStyle = alpha(o.glint, 0.7);
    g.beginPath();
    g.ellipse(x + rx * 0.1, y + r * 1.02, rx * 0.95, r * 0.6, 0, 0, TAU);
    g.fill();
    g.restore();
  }
  speck(g, x - rx * 0.3, y - r * 0.36, r * 0.3, 1);
  if (r >= 2) speck(g, x + rx * 0.32, y + r * 0.34, r * 0.12, 0.7);
}
