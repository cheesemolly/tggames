// Мир «Лисьей охоты», нарисованный кодом: земля, тропы, вода, норы, стена леса вокруг комнаты, деревья, камни,
// пни, кусты, двери и вещи, с которыми лиса что-то делает. Без DOM при импорте: всё рисуется в переданный
// контекст Canvas в единицах мира (клетка — 32), свет — слева сверху.
//
// Комната собирается из двух частей:
//   paintRoom(g, room) — всё, что лежит на земле и не двигается: один раз в заготовку фона. Начало координат —
//     левый верхний угол комнаты; рисунок выходит за её края на ROOM_MARGIN (там уже лес);
//   propsOf(room)      — всё, у чего есть высота: [{ key, v, x, y, over }]. Рендер сортирует это по y вместе
//     с существами; over — листва, под которую заходят (рисуется поверх всех).
// Обе выводят рисунок из клеток и room.seed: то же зерно — та же картинка. Случайность считается от места
// (зерно + клетка), а не по очереди: сломали куст — остальное не шелохнулось.
//
// Как устроен вид. Землю видно сверху, а всё высокое — спереди и чуть сверху, как в сказочной книжке:
//   • верхняя стена смотрит на нас: стволы, тёмная глубина за ними и высокая слоистая крона над ними;
//   • боковые и нижняя стены видны сверху — клубы крон, нависающие над полом;
//   • дерево в комнате — ствол и крона, за которой можно спрятаться;
//   • у всего, что мешает пройти, есть обводка, объём и тень на земле; украшения земли плоские и без обводки —
//     так сразу видно, обо что споткнёшься.
// Тени и корни под деревьями и камнями — часть фона (нарисованы в земле), в самих картинках теней на земле нет.
// Исключение — куст: его ломают посреди боя, поэтому в фоне от него нет ничего, а тень — в его картинке.
// Фон не зависит и от того, открыты ли двери: пока комната та же, готовить его заново не приходится.
// Дальний лес (поля фона, клетка глубокого леса) нарочно нарисован просто — плоскими клубами в несколько
// проходов на всех: фон большой комнаты готовится за доли секунды, а не за секунды.
//
// Места (биомы) — таблица BIOME_LOOK: краски и то, чем место отличается (какие деревья, что за особая земля).
// Новое место — новая строка таблицы и несколько своих рисунков; незнакомое место рисуется как лес.
//
// Двери: prop.<место>.door — проём верхней стены, prop.<место>.door.e / .s / .w — правой, нижней и левой;
// у каждой вариант 0 — открыто (арка из веток над тропой), 1 — закрыто (заросло ежевикой).
// Глубокий лес tile.<место>.deep (64×64, без шва) лежит по сетке от угла комнаты: поля фона заканчиваются им же.

import { T, TILE } from './tiles.js';
import { defineSprite } from './art.js';

/** На сколько единиц фон комнаты выходит за её края. */
export const ROOM_MARGIN = 48;

const TAU = Math.PI * 2;
const DEEP = 64;                 // сторона клетки глубокого леса

// ---------- цвет и случайность ----------

const INK = '#241a26';           // к нему темнеют обводки: тёмный тон той же краски, а не чёрный
const SHADOW = '#141828';        // тень на земле
const WARM = '#fff6d8';          // тёплый свет

const parsed = new Map();
/** Цвет → [r, g, b]: понимает #rgb, #rrggbb и rgb(...). */
function rgb(c) {
  let v = parsed.get(c);
  if (v) return v;
  if (c[0] === '#') {
    const s = c.length === 4 ? c[1] + c[1] + c[2] + c[2] + c[3] + c[3] : c.slice(1);
    v = [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
  } else v = c.match(/[\d.]+/g).slice(0, 3).map(Number);
  parsed.set(c, v);
  return v;
}
/** Смесь двух цветов: t = 0 — первый, 1 — второй. */
function mix(a, b, t) {
  const A = rgb(a);
  const B = rgb(b);
  return `rgb(${Math.round(A[0] + (B[0] - A[0]) * t)},${Math.round(A[1] + (B[1] - A[1]) * t)},${Math.round(A[2] + (B[2] - A[2]) * t)})`;
}
/** Цвет с прозрачностью. */
function fade(c, a) {
  const v = rgb(c);
  return `rgba(${v[0]},${v[1]},${v[2]},${Math.round(Math.max(0, Math.min(1, a)) * 1000) / 1000})`;
}
const dim = (c, t = 0.64) => mix(c, INK, t);        // тон обводки
const lift = (c, t = 0.4) => mix(c, WARM, t);       // тон на свету

/** Число 0…2³²−1 от зерна и до трёх чисел (клетка, номер). */
function hashInt(a, b = 0, c = 0, d = 0) {
  let h = (a ^ 0x9e3779b9) | 0;
  h = Math.imul(h ^ (b | 0), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h ^ (c | 0), 0xc2b2ae35);
  h ^= h >>> 16;
  h = Math.imul(h ^ (d | 0), 0x27d4eb2f);
  h ^= h >>> 15;
  h = Math.imul(h, 0x165667b1);
  return (h ^ (h >>> 16)) >>> 0;
}
const h01 = (a, b, c, d) => hashInt(a, b, c, d) / 4294967296;

/** Ряд случайных чисел 0…1 от зерна. */
function rngOf(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (list, u) => list[Math.min(list.length - 1, Math.floor(u * list.length))];

/** Выбор по весам: table — [[что, вес], …], u — число 0…1. */
function weighted(table, u) {
  let sum = 0;
  for (const row of table) sum += row[1];
  let at = u * sum;
  for (const row of table) {
    at -= row[1];
    if (at < 0) return row[0];
  }
  return table[table.length - 1][0];
}

// ---------- кисти ----------

/** Мягкое пятно: к краю сходит на нет. */
function spot(g, x, y, rx, ry, color, alpha, rot = 0) {
  g.save();
  g.translate(x, y);
  if (rot) g.rotate(rot);
  g.scale(1, ry / rx);
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, rx);
  grad.addColorStop(0, fade(color, alpha));
  grad.addColorStop(0.5, fade(color, alpha * 0.62));
  grad.addColorStop(1, fade(color, 0));
  g.fillStyle = grad;
  g.beginPath();
  g.arc(0, 0, rx, 0, TAU);
  g.fill();
  g.restore();
}

function disc(g, x, y, r, color) {
  g.fillStyle = color;
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
}

function oval(g, x, y, rx, ry, color, rot = 0) {
  g.fillStyle = color;
  g.beginPath();
  g.ellipse(x, y, rx, ry, rot, 0, TAU);
  g.fill();
}

/** Гладкий замкнутый контур по узлам (плоский список x, y): узлы — «рычаги», линия проходит между ними. */
function closedCurve(g, p) {
  const n = p.length / 2;
  g.moveTo((p[n * 2 - 2] + p[0]) / 2, (p[n * 2 - 1] + p[1]) / 2);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    g.quadraticCurveTo(p[i * 2], p[i * 2 + 1], (p[i * 2] + p[j * 2]) / 2, (p[i * 2 + 1] + p[j * 2 + 1]) / 2);
  }
  g.closePath();
}

/** Узлы «живого» пятна вокруг (cx, cy): n точек по эллипсу, каждая чуть ближе или дальше. */
function blobPoints(cx, cy, rx, ry, seed, rough = 0.14, n = 9, rot = 0) {
  const r = rngOf(seed);
  const a0 = r() * TAU;
  const co = Math.cos(rot);
  const si = Math.sin(rot);
  const p = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * TAU;
    const k = 1 + (r() - 0.5) * 2 * rough;
    const x = Math.cos(a) * rx * k;
    const y = Math.sin(a) * ry * k;
    p.push(cx + x * co - y * si, cy + x * si + y * co);
  }
  return p;
}
const blob = (g, cx, cy, rx, ry, seed, rough, n, rot) => closedCurve(g, blobPoints(cx, cy, rx, ry, seed, rough, n, rot));

/**
 * Объём внутри уже обрезанной формы: светлее к левому верхнему краю, тёмный полумесяц справа снизу.
 * (cx, cy, rx, ry) — примерный овал формы.
 */
function volume(g, cx, cy, rx, ry, base, light = 0.5, dark = 0.5) {
  const R = Math.max(rx, ry);
  const lx = cx - rx * 0.42;
  const ly = cy - ry * 0.5;
  let grad = g.createRadialGradient(lx, ly, 0, lx, ly, R * 1.3);
  const hi = lift(base, 0.55);
  grad.addColorStop(0, fade(hi, light));
  grad.addColorStop(0.45, fade(hi, light * 0.4));
  grad.addColorStop(1, fade(hi, 0));
  g.fillStyle = grad;
  g.fillRect(cx - rx - 3, cy - ry - 3, rx * 2 + 6, ry * 2 + 6);
  const sx = cx - rx * 0.3;
  const sy = cy - ry * 0.38;
  grad = g.createRadialGradient(sx, sy, R * 0.5, sx, sy, R * 1.6);
  const lo = mix(dim(base, 0.6), SHADOW, 0.25);
  grad.addColorStop(0, fade(lo, 0));
  grad.addColorStop(0.55, fade(lo, dark * 0.5));
  grad.addColorStop(1, fade(lo, dark));
  g.fillStyle = grad;
  g.fillRect(cx - rx - 3, cy - ry - 3, rx * 2 + 6, ry * 2 + 6);
}

/**
 * Масса с объёмом и обводкой. path(g) строит контур; (cx, cy, rx, ry) — её примерный овал.
 * o: light, dark — сила света и тени; inside(g) — что нарисовать внутри (под обводкой); line, lw — обводка.
 */
function solid(g, path, cx, cy, rx, ry, color, o = {}) {
  g.fillStyle = color;
  g.beginPath();
  path(g);
  g.fill();
  g.save();
  g.beginPath();
  path(g);
  g.clip();
  volume(g, cx, cy, rx, ry, color, o.light ?? 0.5, o.dark ?? 0.5);
  if (o.inside) o.inside(g);
  // блик по освещённому краю: обводка светом, которая гаснет к середине (обрезка оставляет её внутреннюю половину)
  const rim = g.createLinearGradient(cx - rx, cy - ry, cx + rx * 0.1, cy + ry * 0.1);
  rim.addColorStop(0, fade(lift(color, 0.75), o.rim ?? 0.7));
  rim.addColorStop(1, fade(lift(color, 0.75), 0));
  g.strokeStyle = rim;
  g.lineWidth = 3;
  g.beginPath();
  path(g);
  g.stroke();
  g.restore();
  g.strokeStyle = o.line ?? dim(color);
  g.lineWidth = o.lw ?? 1.6;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.beginPath();
  path(g);
  g.stroke();
}

function circlesPath(g, circles, grow = 0) {
  g.beginPath();
  for (const c of circles) {
    g.moveTo(c[0] + c[2] + grow, c[1]);
    g.arc(c[0], c[1], c[2] + grow, 0, TAU);
  }
}

/**
 * Клуб листвы: несколько кругов одним пятном. Обводка общая (сначала те же круги шире — цветом обводки, потом
 * заливка закрывает всё, кроме наружного края), у каждого круга свой бок в тени и светлая макушка.
 * tone — { base, light, dark, line }; o: lw — обводка, marks — сколько листьев-штрихов, under — тень снизу (0…1).
 */
function puff(g, circles, tone, seed, o = {}) {
  const lw = o.lw ?? 1.6;
  if (lw > 0) {
    g.fillStyle = tone.line;
    circlesPath(g, circles, lw);
    g.fill();
  }
  g.fillStyle = tone.base;
  circlesPath(g, circles);
  g.fill();
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y, r] of circles) {
    x0 = Math.min(x0, x - r);
    y0 = Math.min(y0, y - r);
    x1 = Math.max(x1, x + r);
    y1 = Math.max(y1, y + r);
  }
  g.save();
  circlesPath(g, circles);
  g.clip();
  volume(g, (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2, tone.base, o.light ?? 0.42, o.dark ?? 0.5);
  const rnd = rngOf(seed);
  for (const [x, y, r] of circles) {
    // бок каждого круга уходит в тень — клуб получается «пухлым»
    const grad = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.35, x - r * 0.35, y - r * 0.4, r * 1.5);
    grad.addColorStop(0, fade(tone.dark, 0));
    grad.addColorStop(1, fade(tone.dark, 0.42));
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
  }
  g.lineCap = 'round';
  for (const [x, y, r] of circles) {
    if (r < 5) continue;
    g.strokeStyle = fade(tone.light, 0.62);
    g.lineWidth = Math.min(2, r * 0.16);
    g.beginPath();
    g.arc(x, y, r - Math.min(2.6, r * 0.24), Math.PI * 1.02, Math.PI * 1.56);
    g.stroke();
  }
  // листья: короткие скобки — светлые на свету, тёмные в тени
  const marks = o.marks ?? Math.round(circles.length * 2.5);
  for (let i = 0; i < marks; i++) {
    const c = circles[Math.floor(rnd() * circles.length)];
    const a = rnd() * TAU;
    const d = Math.sqrt(rnd()) * c[2] * 0.78;
    const mx = c[0] + Math.cos(a) * d;
    const my = c[1] + Math.sin(a) * d;
    const lit = (mx - (x0 + x1) / 2) / (x1 - x0) + (my - (y0 + y1) / 2) / (y1 - y0) < 0.04 + (rnd() - 0.5) * 0.3;
    const s = 1.7 + rnd() * 1.5;
    g.strokeStyle = lit ? fade(tone.light, 0.75) : fade(tone.dark, 0.6);
    g.lineWidth = 1.15;
    g.beginPath();
    g.arc(mx, my, s, Math.PI * (1.05 + rnd() * 0.15), Math.PI * (1.8 + rnd() * 0.2));
    g.stroke();
  }
  if (o.under) {
    // низ клуба — в собственной тени
    const grad = g.createLinearGradient(0, y1 - (y1 - y0) * 0.45, 0, y1);
    grad.addColorStop(0, fade(tone.dark, 0));
    grad.addColorStop(1, fade(mix(tone.dark, SHADOW, 0.35), o.under));
    g.fillStyle = grad;
    g.fillRect(x0 - 2, y0, x1 - x0 + 4, y1 - y0 + 2);
  }
  g.restore();
}

/**
 * Клуб листвы попроще — для дальнего плана: без переходов цвета и обрезки, только обводка, заливка, светлые
 * макушки и тёмные бока дугами (detail = false — и без дуг). Дальний лес и не должен быть прорисован, как
 * ближний, а фон комнаты из сотен таких клубов готовится в разы быстрее. Стоит такой рисунок числом кругов —
 * сколько бы клубов ни собрали в один проход, — поэтому дальние клубы крупные и их немного.
 */
function puffFlat(g, circles, tone, lw = 1.2, detail = true) {
  g.fillStyle = tone.line;
  circlesPath(g, circles, lw);
  g.fill();
  g.fillStyle = tone.base;
  circlesPath(g, circles);
  g.fill();
  g.fillStyle = fade(tone.light, 0.42);
  g.beginPath();
  for (const [x, y, r] of circles) {
    g.moveTo(x - r * 0.2 + r * 0.6, y - r * 0.26);
    g.arc(x - r * 0.2, y - r * 0.26, r * 0.6, 0, TAU);
  }
  g.fill();
  if (!detail) return;
  g.strokeStyle = fade(tone.dark, 0.55);
  g.lineWidth = 1.8;
  g.lineCap = 'round';
  g.beginPath();
  for (const [x, y, r] of circles) {
    if (r < 5) continue;
    g.moveTo(x + Math.cos(0.15) * (r - 1.7), y + Math.sin(0.15) * (r - 1.7));
    g.arc(x, y, r - 1.7, 0.15, Math.PI * 0.62);
  }
  g.stroke();
  g.strokeStyle = fade(tone.light, 0.7);
  g.lineWidth = 1.1;
  g.beginPath();
  for (const [x, y, r] of circles) {
    if (r < 7) continue;
    g.moveTo(x - r * 0.3 + 2.4, y - r * 0.3);
    g.arc(x - r * 0.3, y - r * 0.3, 2.4, 0, -Math.PI * 0.8, true);
  }
  g.stroke();
}

/** Те же круги, но сдвинутые и чуть другие: варианты одной кроны. */
function jitterCircles(circles, seed, amount = 1) {
  const r = rngOf(seed);
  return circles.map(([x, y, rad]) => [x + (r() - 0.5) * 3 * amount, y + (r() - 0.5) * 3 * amount, rad * (1 + (r() - 0.5) * 0.16 * amount)]);
}

/** Плавная линия через точки (плоский список): для стеблей и веток. */
function curve(g, p) {
  g.beginPath();
  g.moveTo(p[0], p[1]);
  if (p.length === 4) g.lineTo(p[2], p[3]);
  else {
    for (let i = 2; i < p.length - 2; i += 2) g.quadraticCurveTo(p[i], p[i + 1], (p[i] + p[i + 2]) / 2, (p[i + 1] + p[i + 3]) / 2);
    g.lineTo(p[p.length - 2], p[p.length - 1]);
  }
}

/** Линия с обводкой: сначала шире тёмным, потом своим цветом. */
function limb(g, p, width, color, line = dim(color), lw = 1.4) {
  g.lineCap = 'round';
  g.lineJoin = 'round';
  curve(g, p);
  g.strokeStyle = line;
  g.lineWidth = width + lw * 2;
  g.stroke();
  curve(g, p);
  g.strokeStyle = color;
  g.lineWidth = width;
  g.stroke();
}

/** Листик-капля: остриём по углу a. */
function leaf(g, x, y, len, wide, a, color) {
  const co = Math.cos(a);
  const si = Math.sin(a);
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x, y);
  g.quadraticCurveTo(x + co * len * 0.5 - si * wide, y + si * len * 0.5 + co * wide, x + co * len, y + si * len);
  g.quadraticCurveTo(x + co * len * 0.5 + si * wide, y + si * len * 0.5 - co * wide, x, y);
  g.fill();
}

// ---------- разбор комнаты ----------

const SIDES = ['n', 'e', 's', 'w'];
const WALKABLE = new Uint8Array(12);
for (const code of [TILE.FLOOR, TILE.PATH, TILE.THORN, TILE.SPECIAL, TILE.BURROW, TILE.DEN, TILE.DOOR]) WALKABLE[code] = 1;

/**
 * Комната глазами художника: размеры, зерно, клетка по месту (за краем — стена) и двери с их сторонами.
 * Проём ищется по клеткам DOOR в крайнем ряду; если клеток нет, а дверь в room.doors есть — посередине стороны.
 */
function scan(room) {
  const w = room.w | 0;
  const h = room.h | 0;
  const tiles = room.tiles;
  const seed = (room.seed >>> 0) || 1;
  const gate = new Uint8Array(w * h);
  const raw = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? TILE.WALL : tiles[y * w + x]);
  const doors = [];
  for (const side of SIDES) {
    const horiz = side === 'n' || side === 's';
    const len = horiz ? w : h;
    const fixed = side === 'n' || side === 'w' ? 0 : horiz ? h - 1 : w - 1;
    let lo = -1;
    let hi = -1;
    for (let i = 0; i < len; i++) {
      if ((horiz ? raw(i, fixed) : raw(fixed, i)) !== TILE.DOOR) continue;
      if (lo < 0) lo = i;
      hi = i;
    }
    const info = room.doors ? room.doors[side] : null;
    if (lo < 0 && !info) continue;
    if (lo < 0) {
      lo = (len >> 1) - 1;
      hi = lo + 2;
    }
    for (let i = lo; i <= hi; i++) gate[horiz ? fixed * w + i : i * w + fixed] = 1;
    const mid = ((lo + hi + 1) / 2) * T;
    doors.push({
      side, horiz, lo, hi, open: Boolean(info && info.open),
      x: horiz ? mid : fixed * T + T / 2,
      y: horiz ? fixed * T + T / 2 : mid,
      half: ((hi - lo + 1) * T) / 2,
      // куда проём смотрит: внутрь комнаты
      dx: side === 'w' ? 1 : side === 'e' ? -1 : 0,
      dy: side === 'n' ? 1 : side === 's' ? -1 : 0,
    });
  }
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? TILE.WALL : gate[y * w + x] ? TILE.DOOR : tiles[y * w + x]);
  const R = {
    w, h, W: w * T, H: h * T, seed, at, doors,
    wall: (x, y) => at(x, y) === TILE.WALL,
    /** Стена смотрит на нас: под ней пол. Клетка над проёмом боковой двери не в счёт — там хватает рамки двери. */
    face: (x, y) => at(x, y) === TILE.WALL && at(x, y + 1) !== TILE.WALL && at(x, y + 1) !== TILE.DOOR,
    /** Клетка под точкой мира. */
    under: (px, py) => at(Math.floor(px / T), Math.floor(py / T)),
    /** Рядом (в том числе наискосок) есть что-то, кроме ровной земли: у краёв и преград растёт гуще. */
    edgy(x, y) {
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if ((i || j) && !WALKABLE[at(x + i, y + j)]) return true;
      return false;
    },
    rnd: (x, y, salt) => h01(seed, x, y, salt),
  };
  return R;
}

/**
 * Контуры области клеток: замкнутые ломаные по границам клеток в единицах мира, область — справа по ходу.
 * Где клетки касаются только углами, контур сворачивает к своей клетке (области остаются раздельными).
 */
function contours(w, h, inside) {
  const stride = w + 1;
  const next = new Map();
  const add = (x0, y0, x1, y1) => {
    const k = y0 * stride + x0;
    const list = next.get(k);
    if (list) list.push(y1 * stride + x1);
    else next.set(k, [y1 * stride + x1]);
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!inside(x, y)) continue;
      if (!inside(x, y - 1)) add(x, y, x + 1, y);
      if (!inside(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (!inside(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (!inside(x - 1, y)) add(x, y + 1, x, y);
    }
  }
  const loops = [];
  for (const [start, first] of next) {
    while (first.length) {
      const loop = [];
      let prev = -1;
      let cur = start;
      for (let guard = 0; guard < 100000; guard++) {
        loop.push([(cur % stride) * T, Math.floor(cur / stride) * T]);
        const out = next.get(cur);
        let take = out.length - 1;
        if (out.length > 1 && prev >= 0) {
          const dx = (cur % stride) - (prev % stride);
          const dy = Math.floor(cur / stride) - Math.floor(prev / stride);
          for (let i = 0; i < out.length; i++) {
            const ox = (out[i] % stride) - (cur % stride);
            const oy = Math.floor(out[i] / stride) - Math.floor(cur / stride);
            if (dx * oy - dy * ox > 0) take = i;
          }
        }
        const to = out[take];
        out.splice(take, 1);
        prev = cur;
        cur = to;
        if (cur === start) break;
      }
      loops.push(loop);
    }
  }
  return loops;
}

/**
 * Ломаная по границам клеток → узлы плавного «живого» контура (для closedCurve): стороны дробятся, каждый узел
 * уходит по нормали — на grow наружу и ещё случайно до amp. Случайность — от места узла, поэтому контуры одной
 * области с разным grow идут рядом, как берег и вода. round — сколько раз срезать углы до этого: пруд из
 * клеток перестаёт быть лесенкой.
 */
function organic(loop, seed, step = 14, amp = 3, grow = 0, round = 0) {
  for (let pass = 0; pass < round; pass++) {
    // срезать углы: каждая сторона отдаёт точки на четверти и на трёх четвертях
    const cut = [];
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i];
      const b = loop[(i + 1) % loop.length];
      cut.push([a[0] + (b[0] - a[0]) * 0.25, a[1] + (b[1] - a[1]) * 0.25], [a[0] + (b[0] - a[0]) * 0.75, a[1] + (b[1] - a[1]) * 0.75]);
    }
    loop = cut;
  }
  const pts = [];
  const n = loop.length;
  for (let i = 0; i < n; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % n];
    const m = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 0; k < m; k++) pts.push(a[0] + ((b[0] - a[0]) * k) / m, a[1] + ((b[1] - a[1]) * k) / m);
  }
  const m = pts.length / 2;
  const out = [];
  for (let i = 0; i < m; i++) {
    const p = ((i + m - 1) % m) * 2;
    const q = ((i + 1) % m) * 2;
    let dx = pts[q] - pts[p];
    let dy = pts[q + 1] - pts[p + 1];
    const d = Math.hypot(dx, dy) || 1;
    dx /= d;
    dy /= d;
    const x = pts[i * 2];
    const y = pts[i * 2 + 1];
    const move = grow + (h01(seed, Math.round(x * 4), Math.round(y * 4), 5) - 0.5) * 2 * amp;
    out.push(x + dy * move, y - dx * move);
  }
  return out;
}

/** Контуры области одним путём (для заливки и обрезки). */
function regionPath(g, loops, seed, step, amp, grow, round = 0) {
  g.beginPath();
  for (const loop of loops) closedCurve(g, organic(loop, seed, step, amp, grow, round));
}

// ---------- земля ----------

/** Основа: заливка и мягкие пятна трёх тонов — большие и помельче. Ровной заливки нигде не остаётся. */
function paintGround(g, R, P) {
  g.fillStyle = P.ground;
  g.fillRect(0, 0, R.W, R.H);
  const rnd = rngOf(hashInt(R.seed, 1));
  const area = R.W * R.H;
  for (let i = Math.round(area / 9500); i > 0; i--) {
    const deep = i % 5 === 0;
    const tone = deep ? P.groundDeep : i % 2 ? P.groundLight : P.groundDark;
    const rx = 38 + rnd() * 50;
    spot(g, rnd() * R.W, rnd() * R.H, rx, rx * (0.42 + rnd() * 0.4), tone, deep ? 0.2 : 0.42, rnd() * Math.PI);
  }
  for (let i = Math.round(area / 1700); i > 0; i--) {
    const tone = i % 3 === 0 ? P.groundLight : i % 3 === 1 ? P.groundDark : P.groundDeep;
    const rx = 9 + rnd() * 17;
    spot(g, rnd() * R.W, rnd() * R.H, rx, rx * (0.5 + rnd() * 0.4), tone, tone === P.groundDeep ? 0.1 : 0.2, rnd() * Math.PI);
  }
}

/** Кустик травы: несколько травинок веером. */
function tuft(g, x, y, size, P, rnd) {
  const n = 3 + Math.floor(rnd() * 3);
  g.lineCap = 'round';
  g.lineWidth = 1.25;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.44 + (rnd() - 0.5) * 0.3;
    const len = size * (0.65 + rnd() * 0.55);
    g.strokeStyle = i % 2 ? fade(P.groundDeep, 0.85) : rnd() < 0.55 ? lift(P.groundLight, 0.18) : P.groundDark;
    g.beginPath();
    g.moveTo(x + (i - (n - 1) / 2) * 0.9, y);
    g.quadraticCurveTo(x + Math.cos(a) * len * 0.45, y + Math.sin(a) * len * 0.7, x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
}

function flower(g, x, y, color, P, size = 1) {
  oval(g, x + 0.6, y + 1, 2.7 * size, 1.9 * size, fade(P.groundDeep, 0.3));
  g.fillStyle = color;
  g.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU - 0.3;
    g.moveTo(x + Math.cos(a) * 1.5 * size + 1.25 * size, y + Math.sin(a) * 1.5 * size);
    g.arc(x + Math.cos(a) * 1.5 * size, y + Math.sin(a) * 1.5 * size, 1.25 * size, 0, TAU);
  }
  g.fill();
  disc(g, x, y, 0.95 * size, color === P.flowers[0] ? P.flowerCore[1] : P.flowerCore[0]);
}

function pebble(g, x, y, r, P, rnd) {
  const ry = r * (0.6 + rnd() * 0.2);
  oval(g, x + 0.5, y + 0.8, r + 0.5, ry + 0.3, fade(SHADOW, 0.22));
  oval(g, x, y, r, ry, mix(P.rock, P.ground, 0.18));
  oval(g, x - r * 0.25, y - ry * 0.3, r * 0.5, ry * 0.45, fade(P.rockLight, 0.75));
}

/** Гриб с красной шляпкой — у подножия деревьев. */
function toadstool(g, x, y, s, P) {
  oval(g, x + 0.8, y + 0.6, 2.6 * s, 1.1 * s, fade(SHADOW, 0.22));
  g.fillStyle = P.bone;
  g.fillRect(x - 0.8 * s, y - 2.6 * s, 1.6 * s, 2.8 * s);
  g.fillStyle = P.toadstool;
  g.beginPath();
  g.ellipse(x, y - 2.6 * s, 2.7 * s, 2.1 * s, 0, Math.PI, TAU);
  g.fill();
  disc(g, x - 1 * s, y - 3.6 * s, 0.5 * s, '#ffffff');
  disc(g, x + 0.9 * s, y - 3.2 * s, 0.4 * s, '#ffffff');
}

/** Мелочи на земле: трава, цветы, клевер, камешки, опавшие листья, грибы. У стен и преград — гуще. */
function paintDecals(g, R, P) {
  // клевер и цветы растут полянками: крупная сетка, в каждой ячейке — может быть одна
  for (let cy = 0; cy * 112 < R.H; cy++) {
    for (let cx = 0; cx * 112 < R.W; cx++) {
      const rnd = rngOf(hashInt(R.seed, cx, cy, 31));
      if (rnd() < 0.5) {
        const px = (cx + rnd()) * 112;
        const py = (cy + rnd()) * 112;
        if (R.under(px, py) === TILE.FLOOR) {
          const rad = 14 + rnd() * 10;
          spot(g, px, py, rad * 1.25, rad * 0.9, P.groundDark, 0.34, rnd() * 3);
          for (let i = 8 + Math.floor(rnd() * 8); i > 0; i--) {
            const a = rnd() * TAU;
            const d = Math.sqrt(rnd()) * rad;
            const x = px + Math.cos(a) * d;
            const y = py + Math.sin(a) * d * 0.72;
            if (R.under(x, y) !== TILE.FLOOR) continue;
            const tone = rnd() < 0.5 ? mix(P.groundDark, P.groundDeep, 0.45) : mix(P.ground, P.groundLight, 0.5);
            for (let k = 0; k < 3; k++) disc(g, x + Math.cos(k * 2.1 + a) * 1.4, y + Math.sin(k * 2.1 + a) * 1.4, 1.35, tone);
          }
        }
      }
      if (rnd() < 0.62) {
        const px = (cx + rnd()) * 112;
        const py = (cy + rnd()) * 112;
        const color = pick(P.flowers, rnd());
        const rad = 8 + rnd() * 16;
        for (let i = 3 + Math.floor(rnd() * 5); i > 0; i--) {
          const a = rnd() * TAU;
          const d = Math.sqrt(rnd()) * rad;
          const x = px + Math.cos(a) * d;
          const y = py + Math.sin(a) * d * 0.7;
          const other = rnd() < 0.2 ? pick(P.flowers, rnd()) : color;
          if (R.under(x, y) === TILE.FLOOR && R.under(x, y - 4) === TILE.FLOOR) flower(g, x, y, other, P, 0.85 + rnd() * 0.35);
        }
      }
    }
  }
  for (let y = 0; y < R.h; y++) {
    for (let x = 0; x < R.w; x++) {
      const code = R.at(x, y);
      if (code !== TILE.FLOOR && code !== TILE.PATH) continue;
      const rnd = rngOf(hashInt(R.seed, x, y, 21));
      const edgy = R.edgy(x, y);
      const bare = code === TILE.PATH;
      const px = () => (x + 0.08 + rnd() * 0.84) * T;
      const py = () => (y + 0.12 + rnd() * 0.84) * T;
      for (let i = bare ? (rnd() < 0.3 ? 1 : 0) : edgy ? 2 + Math.floor(rnd() * 3) : Math.floor(rnd() * 2.3); i > 0; i--) {
        tuft(g, px(), py(), 4.2 + rnd() * 3.2, P, rnd);
      }
      if (rnd() < (bare ? 0.45 : edgy ? 0.22 : 0.09)) {
        for (let i = 1 + Math.floor(rnd() * 2.4); i > 0; i--) pebble(g, px(), py(), 1.5 + rnd() * 1.7, P, rnd);
      }
      if (!bare && rnd() < (edgy ? 0.4 : 0.08)) {
        for (let i = 1 + Math.floor(rnd() * 2); i > 0; i--) {
          const lx = px();
          const ly = py();
          const a = rnd() * TAU;
          leaf(g, lx + 0.5, ly + 0.7, 4.4, 1.5, a, fade(SHADOW, 0.18));
          leaf(g, lx, ly, 4.4, 1.5, a, pick(P.fallen, rnd()));
        }
      }
      // грибы — у подножия высокого: клетка рядом с деревом
      if (!bare && rnd() < 0.3 && (R.at(x - 1, y) === TILE.TALL || R.at(x + 1, y) === TILE.TALL || R.at(x, y - 1) === TILE.TALL)) {
        const mx = px();
        const my = py();
        toadstool(g, mx, my, 0.9 + rnd() * 0.3, P);
        if (rnd() < 0.5) toadstool(g, mx + 4 + rnd() * 2, my + 1.5, 0.65, P);
      }
    }
  }
}

// ---------- тропы ----------

/** Вытоптанное место: мягкое пятно земли. */
function dab(g, R, P, x, y, r, alpha, salt) {
  const u = h01(R.seed, Math.round(x * 3), Math.round(y * 3), salt);
  spot(g, x, y, r, r * (0.66 + u * 0.26), P.path, alpha, u * 3);
}

/** Тропы: клетки PATH (и связи между соседними) и от каждой двери внутрь — сужается и гаснет. */
function paintPaths(g, R, P) {
  const mid = (x, y, axis) => (axis ? y : x) * T + T / 2 + (R.rnd(x, y, 41 + axis) - 0.5) * 9;
  for (let y = 0; y < R.h; y++) {
    for (let x = 0; x < R.w; x++) {
      if (R.at(x, y) !== TILE.PATH) continue;
      const ax = mid(x, y, 0);
      const ay = mid(x, y, 1);
      dab(g, R, P, ax, ay, 19, 0.62, 43);
      for (const [nx, ny] of [[x + 1, y], [x, y + 1]]) {
        const code = R.at(nx, ny);
        if (code !== TILE.PATH && code !== TILE.DOOR) continue;
        const bx = mid(nx, ny, 0);
        const by = mid(nx, ny, 1);
        for (let k = 1; k < 3; k++) dab(g, R, P, ax + ((bx - ax) * k) / 3, ay + ((by - ay) * k) / 3, 16.5, 0.52, 44 + k);
      }
    }
  }
  for (const d of R.doors) {
    const phase = R.rnd(d.lo, d.hi, 47) * TAU;
    const reach = (3 + R.rnd(d.lo, d.hi, 48) * 1.2) * T;
    const from = -(T / 2 + ROOM_MARGIN);
    for (let s = from; s < reach; s += 8) {
      const k = Math.max(0, s) / reach;                    // 0 в проёме → 1 в конце тропы
      const sway = Math.sin(phase + s * 0.045) * 7 * Math.min(1, Math.max(0, s) / 40);
      const x = d.x + d.dx * s + d.dy * sway;
      const y = d.y + d.dy * s + d.dx * sway;
      if (s > T / 2 && !WALKABLE[R.under(x, y)]) break;
      dab(g, R, P, x, y, 17.5 - 9 * k, 0.64 - 0.46 * k, 49);
      if (k < 0.8 && h01(R.seed, Math.round(s * 10), d.lo, 50) < 0.5) {
        const u = h01(R.seed, Math.round(s * 10), d.lo, 51);
        const v = h01(R.seed, Math.round(s * 10), d.lo, 52);
        spot(g, x + (u - 0.5) * 16, y + (v - 0.5) * 16, 2.5 + u * 2, 2 + v * 1.5, P.pathDark, 0.4);
      }
    }
  }
}

// ---------- особая земля леса: высокая трава ----------

function paintTallGrass(g, R, P) {
  const loops = contours(R.w, R.h, (x, y) => R.at(x, y) === TILE.SPECIAL);
  if (!loops.length) return;
  regionPath(g, loops, R.seed + 3, 12, 4, 4, 2);
  g.fillStyle = fade(P.groundDark, 0.5);
  g.fill();
  regionPath(g, loops, R.seed + 3, 12, 4, -2, 2);
  g.fillStyle = fade(P.groundDeep, 0.34);
  g.fill();
  g.lineCap = 'round';
  // травинки рядами сверху вниз: нижние ряды перекрывают верхние
  for (let y = 0; y < R.h; y++) {
    for (let row = 0; row < 3; row++) {
      for (let x = 0; x < R.w; x++) {
        if (R.at(x, y) !== TILE.SPECIAL) continue;
        const rnd = rngOf(hashInt(R.seed, x, y, 60 + row));
        for (let i = 0; i < 6; i++) {
          const bx = (x + (i + rnd()) / 6) * T;
          const by = y * T + 9 + row * 10.5 + (rnd() - 0.5) * 5;
          const tall = 8.5 + rnd() * 5;
          const lean = (rnd() - 0.5) * 6.5;
          const u = rnd();
          g.strokeStyle = u < 0.26 ? P.groundDeep : u < 0.56 ? mix(P.groundDark, P.groundDeep, 0.4) : u < 0.8 ? P.groundDark : lift(P.groundLight, 0.12);
          g.lineWidth = 1.2 + rnd() * 0.5;
          g.beginPath();
          g.moveTo(bx, by);
          g.quadraticCurveTo(bx + lean * 0.15, by - tall * 0.6, bx + lean, by - tall);
          g.stroke();
          if (rnd() < 0.13) oval(g, bx + lean, by - tall - 0.6, 1, 2, P.seedHead, lean * 0.08);
        }
      }
    }
  }
}

// ---------- вода ----------

function lilyPad(g, x, y, r, P, rnd) {
  const turn = rnd() * TAU;
  oval(g, x + 1, y + 1.3, r, r * 0.72, fade(P.waterDeep, 0.55));
  g.fillStyle = P.lilyPad;
  g.beginPath();
  g.ellipse(x, y, r, r * 0.72, 0, turn + 0.32, turn + TAU - 0.32);
  g.lineTo(x, y);
  g.closePath();
  g.fill();
  g.strokeStyle = fade(lift(P.lilyPad, 0.5), 0.8);
  g.lineWidth = 0.9;
  g.beginPath();
  g.ellipse(x, y, r - 0.8, r * 0.72 - 0.7, 0, Math.PI * 1.05, Math.PI * 1.6);
  g.stroke();
  if (rnd() < 0.4) {
    const color = rnd() < 0.5 ? P.lily : '#ffffff';
    g.fillStyle = color;
    g.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + turn;
      g.moveTo(x + Math.cos(a) * 1.5 + 1.2, y - 0.8 + Math.sin(a) * 1.1);
      g.arc(x + Math.cos(a) * 1.5, y - 0.8 + Math.sin(a) * 1.1, 1.2, 0, TAU);
    }
    g.fill();
    disc(g, x, y - 0.8, 0.9, P.flowerCore[0]);
  }
}

/** Камыш у берега: стебли с тёмными головками и пара длинных листьев. */
function reeds(g, x, y, P, rnd) {
  g.lineCap = 'round';
  const n = 3 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) {
    const bx = x + (i - (n - 1) / 2) * 2.6 + (rnd() - 0.5);
    const tall = 11 + rnd() * 8;
    const lean = (rnd() - 0.5) * 5;
    g.strokeStyle = i % 2 ? P.groundDeep : mix(P.groundDark, P.groundDeep, 0.5);
    g.lineWidth = 1.3;
    g.beginPath();
    g.moveTo(bx, y);
    g.quadraticCurveTo(bx + lean * 0.2, y - tall * 0.6, bx + lean, y - tall);
    g.stroke();
    if (i % 2 === 0) oval(g, bx + lean * 0.86, y - tall + 1.4, 1.25, 2.9, P.trunkDark, lean * 0.06);
  }
}

/** Пруд: берег светлее травы, вода темнеет к середине, от берега на воду ложится тень; кувшинки и камыш. */
function paintPond(g, R, P) {
  const water = (x, y) => R.at(x, y) === TILE.WATER;
  const loops = contours(R.w, R.h, water);
  if (!loops.length) return;
  const s = R.seed + 7;
  regionPath(g, loops, s, 13, 2.6, 6.5, 2);
  g.fillStyle = fade(P.groundDeep, 0.4);
  g.fill();
  regionPath(g, loops, s, 13, 2.6, 3.6, 2);
  g.fillStyle = P.shore;
  g.fill();
  regionPath(g, loops, s, 13, 2.6, 0.2, 2);
  g.fillStyle = mix(P.water, P.shine, 0.22);
  g.fill();
  g.save();
  regionPath(g, loops, s, 13, 2.6, 0.2, 2);
  g.clip();
  regionPath(g, loops, s, 13, 2.6, -4.5, 2);
  g.fillStyle = P.water;
  g.fill();
  regionPath(g, loops, s, 13, 2.6, -10, 2);
  g.fillStyle = fade(P.waterDeep, 0.6);
  g.fill();
  regionPath(g, loops, s, 13, 2.6, -17, 2);
  g.fillStyle = fade(P.waterDeep, 0.75);
  g.fill();
  // берег выше воды: слева сверху на воду падает его тень, справа снизу край воды светится
  g.lineJoin = 'round';
  g.save();
  g.translate(2.4, 3);
  regionPath(g, loops, s, 13, 2.6, 0.2, 2);
  g.strokeStyle = fade(mix(P.waterDeep, SHADOW, 0.5), 0.5);
  g.lineWidth = 4.4;
  g.stroke();
  g.restore();
  g.save();
  g.translate(-1.5, -1.9);
  regionPath(g, loops, s, 13, 2.6, 0.2, 2);
  g.strokeStyle = fade(P.shine, 0.75);
  g.lineWidth = 1.7;
  g.stroke();
  g.restore();
  // блики: короткие светлые чёрточки
  g.lineCap = 'round';
  for (let y = 0; y < R.h; y++) {
    for (let x = 0; x < R.w; x++) {
      if (!water(x, y)) continue;
      const rnd = rngOf(hashInt(R.seed, x, y, 71));
      for (let i = 1 + Math.floor(rnd() * 2); i > 0; i--) {
        const bx = (x + 0.15 + rnd() * 0.6) * T;
        const by = (y + 0.15 + rnd() * 0.7) * T;
        const len = 3 + rnd() * 5;
        g.strokeStyle = fade(P.shine, 0.34 + rnd() * 0.3);
        g.lineWidth = 1.1;
        g.beginPath();
        g.moveTo(bx, by);
        g.lineTo(bx + len, by);
        g.stroke();
        if (rnd() < 0.4) {
          g.beginPath();
          g.moveTo(bx + 2, by + 2.2);
          g.lineTo(bx + 2 + len * 0.5, by + 2.2);
          g.stroke();
        }
      }
      if (rnd() < 0.42) lilyPad(g, (x + 0.25 + rnd() * 0.5) * T, (y + 0.3 + rnd() * 0.45) * T, 3.6 + rnd() * 1.6, P, rnd);
      if (rnd() < 0.2) lilyPad(g, (x + 0.2 + rnd() * 0.6) * T, (y + 0.25 + rnd() * 0.5) * T, 2.6 + rnd(), P, rnd);
    }
  }
  g.restore();
  // камыш — на берегу со стороны земли
  for (let y = 0; y < R.h; y++) {
    for (let x = 0; x < R.w; x++) {
      if (!water(x, y)) continue;
      const rnd = rngOf(hashInt(R.seed, x, y, 73));
      if (!water(x, y - 1) && rnd() < 0.5) reeds(g, (x + 0.2 + rnd() * 0.6) * T, y * T + 3, P, rnd);
      if (!water(x - 1, y) && rnd() < 0.3) reeds(g, x * T + 1, (y + 0.3 + rnd() * 0.6) * T, P, rnd);
      if (!water(x + 1, y) && rnd() < 0.3) reeds(g, (x + 1) * T - 1, (y + 0.3 + rnd() * 0.6) * T, P, rnd);
    }
  }
}

// ---------- колючки, норы ----------

/** Колючки: плети с шипами на тёмной подложке — по ним ходят, но больно. Плоские, без объёма. */
function paintThorns(g, R, P) {
  for (let y = 0; y < R.h; y++) {
    for (let x = 0; x < R.w; x++) {
      if (R.at(x, y) !== TILE.THORN) continue;
      const rnd = rngOf(hashInt(R.seed, x, y, 81));
      const x0 = x * T;
      const y0 = y * T;
      spot(g, x0 + 16, y0 + 17, 21, 17, mix(P.groundDeep, SHADOW, 0.3), 0.6);
      spot(g, x0 + 16, y0 + 16, 17, 14, P.thornLeaf, 0.2);
      for (let i = 0; i < 4; i++) {
        // плеть — дуга через клетку, концы чуть за её краями: соседние клетки срастаются
        const side = i % 2;
        const ax = x0 + (side ? rnd() * T : -3 + rnd() * 6);
        const ay = y0 + (side ? -3 + rnd() * 6 : rnd() * T);
        const bx = x0 + (side ? rnd() * T : T - 3 + rnd() * 6);
        const by = y0 + (side ? T - 3 + rnd() * 6 : rnd() * T);
        const mx = (ax + bx) / 2 + (rnd() - 0.5) * 18;
        const my = (ay + by) / 2 + (rnd() - 0.5) * 18;
        limb(g, [ax, ay, mx, my, bx, by], 2, P.thorn, dim(P.thorn, 0.55), 0.9);
        for (let k = 0; k < 6; k++) {
          const t = 0.1 + k * 0.16;
          // точка на дуге и её направление
          const u = 1 - t;
          const px = u * u * ax + 2 * u * t * mx + t * t * bx;
          const py = u * u * ay + 2 * u * t * my + t * t * by;
          let dx = 2 * u * (mx - ax) + 2 * t * (bx - mx);
          let dy = 2 * u * (my - ay) + 2 * t * (by - my);
          const d = Math.hypot(dx, dy) || 1;
          dx /= d;
          dy /= d;
          const out = k % 2 ? 1 : -1;
          const len = 3.6 + rnd() * 1.6;
          g.fillStyle = P.thornTip;
          g.strokeStyle = dim(P.thorn, 0.5);
          g.lineWidth = 0.7;
          g.beginPath();
          g.moveTo(px - dx * 1.5, py - dy * 1.5);
          g.lineTo(px + dx * 0.6 - dy * out * len, py + dy * 0.6 + dx * out * len);
          g.lineTo(px + dx * 1.5, py + dy * 1.5);
          g.closePath();
          g.fill();
          g.stroke();
        }
      }
      for (let i = 0; i < 3; i++) leaf(g, x0 + 4 + rnd() * 24, y0 + 4 + rnd() * 24, 4.6, 1.7, rnd() * TAU, P.thornLeaf);
    }
  }
}

/** Кроличья нора: тёмный лаз, бугорок выброшенной земли за ним, комья вокруг. */
function paintBurrows(g, R, P) {
  for (let y = 0; y < R.h; y++) {
    for (let x = 0; x < R.w; x++) {
      if (R.at(x, y) !== TILE.BURROW) continue;
      const rnd = rngOf(hashInt(R.seed, x, y, 83));
      const cx = x * T + 16;
      const cy = y * T + 17;
      spot(g, cx, cy + 2, 21, 15, P.path, 0.55);
      for (let i = 0; i < 7; i++) {
        const a = Math.PI * (0.05 + rnd() * 0.9);
        const d = 10 + rnd() * 8;
        const r = 1.2 + rnd() * 1.6;
        oval(g, cx + Math.cos(a) * d * 1.15 + 0.5, cy + 2 + Math.sin(a) * d * 0.6 + 0.7, r + 0.3, r * 0.75, fade(SHADOW, 0.2));
        oval(g, cx + Math.cos(a) * d * 1.15, cy + 2 + Math.sin(a) * d * 0.6, r, r * 0.72, rnd() < 0.5 ? P.pathDark : P.path);
      }
      // бугорок позади лаза
      const mound = blobPoints(cx, cy - 4, 14.5, 8.5, hashInt(R.seed, x, y, 84), 0.1, 9);
      solid(g, (c) => closedCurve(c, mound), cx, cy - 4, 14.5, 8.5, mix(P.pathDark, P.path, 0.35), { lw: 1.3, line: dim(P.pathDark, 0.45), dark: 0.42 });
      // лаз
      const hole = g.createLinearGradient(0, cy - 5, 0, cy + 7);
      hole.addColorStop(0, P.holeDeep);
      hole.addColorStop(1, P.hole);
      g.fillStyle = hole;
      g.beginPath();
      g.ellipse(cx, cy + 1, 9.6, 6, 0, 0, TAU);
      g.fill();
      g.strokeStyle = dim(P.pathDark, 0.6);
      g.lineWidth = 1.3;
      g.stroke();
      g.strokeStyle = fade(lift(P.path, 0.3), 0.75);
      g.lineWidth = 1.1;
      g.beginPath();
      g.ellipse(cx, cy + 1.6, 9.2, 5.8, 0, Math.PI * 0.12, Math.PI * 0.88);
      g.stroke();
      tuft(g, cx - 14, cy + 1, 5.5, P, rnd);
      tuft(g, cx + 14.5, cy, 5, P, rnd);
    }
  }
}

/** След лапы: подушечка и четыре пальца. */
function pawPrint(g, x, y, a, color) {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  oval(g, 0, 0.6, 1.5, 1.2, color);
  for (let i = 0; i < 4; i++) disc(g, (i - 1.5) * 1.05, -1.5 - (i === 1 || i === 2 ? 0.5 : 0), 0.56, color);
  g.restore();
}

/**
 * Лисья нора — дом: травяной холмик, вход под корнями, тёплая глубина, подстилка из соломы у порога, следы лап,
 * косточка и перо.
 */
function paintDens(g, R, P) {
  for (let y = 0; y < R.h; y++) {
    for (let x = 0; x < R.w; x++) {
      if (R.at(x, y) !== TILE.DEN) continue;
      const rnd = rngOf(hashInt(R.seed, x, y, 86));
      const cx = x * T + 16;
      const cy = y * T + 15;
      // крупнее клетки: дом должен быть заметен (по нему ходят, так что соседям не мешает)
      g.save();
      g.translate(cx, cy + 6);
      g.scale(1.24, 1.24);
      g.translate(-cx, -(cy + 6));
      spot(g, cx, cy + 9, 27, 15, P.path, 0.6);
      spot(g, cx + 4, cy + 6, 27, 14, SHADOW, 0.24);
      // холмик: земля, сверху трава
      const hill = blobPoints(cx, cy - 2, 21, 14.5, hashInt(R.seed, x, y, 87), 0.07, 10);
      const hillPath = (c) => closedCurve(c, hill);
      solid(g, hillPath, cx, cy - 2, 21, 14.5, mix(P.pathDark, P.trunk, 0.3), {
        lw: 1.5, dark: 0.45,
        inside: (c) => {
          c.fillStyle = P.groundDark;
          c.beginPath();
          blob(c, cx - 1, cy - 9, 22, 10.5, hashInt(R.seed, x, y, 88), 0.1, 9);
          c.fill();
          spot(c, cx - 7, cy - 13, 13, 6, P.groundLight, 0.75);
          for (let i = 0; i < 7; i++) tuft(c, cx - 17 + i * 5.6 + rnd() * 2, cy - 1.5 - Math.sin((i / 6) * Math.PI) * 2.5 + rnd(), 4.5, P, rnd);
        },
      });
      // вход
      const door = (c) => {
        c.moveTo(cx - 9.5, cy + 11);
        c.bezierCurveTo(cx - 10.5, cy - 7, cx + 10.5, cy - 7, cx + 9.5, cy + 11);
        c.closePath();
      };
      const dark = g.createLinearGradient(0, cy - 4, 0, cy + 11);
      dark.addColorStop(0, P.holeDeep);
      dark.addColorStop(1, mix(P.hole, P.trunkDark, 0.35));
      g.fillStyle = dark;
      g.beginPath();
      door(g);
      g.fill();
      g.save();
      g.beginPath();
      door(g);
      g.clip();
      spot(g, cx, cy + 12, 10, 6, P.cosy, 0.42);
      g.restore();
      // корни над входом и по бокам
      limb(g, [cx - 14, cy - 4, cx - 12.5, cy + 3, cx - 11.5, cy + 11.5], 3, P.trunk, dim(P.trunk), 1.2);
      limb(g, [cx + 14.5, cy - 3, cx + 12.5, cy + 4, cx + 11.5, cy + 11.5], 3, mix(P.trunk, P.trunkDark, 0.4), dim(P.trunk), 1.2);
      limb(g, [cx - 13, cy - 3, cx - 5, cy - 8.5, cx + 2, cy - 7.5, cx + 13.5, cy - 2.5], 3.2, P.trunk, dim(P.trunk), 1.2);
      g.strokeStyle = fade(lift(P.trunk, 0.5), 0.7);
      g.lineWidth = 0.9;
      curve(g, [cx - 12, cy - 4.4, cx - 5, cy - 9.4, cx + 2, cy - 8.5, cx + 9, cy - 5.6]);
      g.stroke();
      // подстилка у порога
      g.lineCap = 'round';
      for (let i = 0; i < 11; i++) {
        const sx = cx - 9 + rnd() * 18;
        g.strokeStyle = i % 3 ? P.straw : dim(P.straw, 0.25);
        g.lineWidth = 1.1;
        g.beginPath();
        g.moveTo(sx, cy + 10 + rnd() * 2);
        g.lineTo(sx + (rnd() - 0.5) * 9, cy + 13.5 + rnd() * 3.5);
        g.stroke();
      }
      // следы к порогу
      const print = fade(P.trunkDark, 0.45);
      pawPrint(g, cx - 5, cy + 20, 0.25, print);
      pawPrint(g, cx + 3, cy + 23.5, -0.1, print);
      pawPrint(g, cx - 2, cy + 28, 0.2, print);
      // косточка и перо
      g.save();
      g.translate(cx + 19, cy + 15);
      g.rotate(-0.5);
      g.strokeStyle = dim(P.bone, 0.45);
      g.lineWidth = 3.2;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(-3.4, 0);
      g.lineTo(3.4, 0);
      g.stroke();
      for (const [bx, by] of [[-4, -1.1], [-4, 1.1], [4, -1.1], [4, 1.1]]) disc(g, bx, by, 1.9, dim(P.bone, 0.45));
      g.strokeStyle = P.bone;
      g.lineWidth = 1.8;
      g.beginPath();
      g.moveTo(-3.4, 0);
      g.lineTo(3.4, 0);
      g.stroke();
      for (const [bx, by] of [[-4, -1.1], [-4, 1.1], [4, -1.1], [4, 1.1]]) disc(g, bx, by, 1.2, P.bone);
      g.restore();
      leaf(g, cx - 22.4, cy + 17.6, 9, 2.6, -0.5, fade(SHADOW, 0.2));
      leaf(g, cx - 23, cy + 17, 9, 2.4, -0.5, P.feather);
      g.strokeStyle = dim(P.feather, 0.35);
      g.lineWidth = 0.7;
      g.beginPath();
      g.moveTo(cx - 24, cy + 17.6);
      g.lineTo(cx - 15, cy + 12.6);
      g.stroke();
      flower(g, cx - 21, cy + 4, P.flowers[0], P, 1.05);
      flower(g, cx + 22, cy + 5, P.flowers[1], P, 1);
      g.restore();
    }
  }
}

// ---------- что стоит на клетках ----------

/**
 * Что растёт на клетке: дерево, камень, пень, бревно, куст. Одна и та же функция для рисунка тени в земле и для
 * списка предметов — тень всегда под своим предметом. Два соседних «низких» могут оказаться одним длинным бревном.
 */
function standing(R, look, x, y) {
  const code = R.at(x, y);
  let name;
  let px = x * T + T / 2;
  if (code === TILE.TALL) name = weighted(look.tall, R.rnd(x, y, 91));
  else if (code === TILE.BUSH) name = look.bush;
  else if (code === TILE.LOW) {
    let x0 = x;
    while (R.at(x0 - 1, y) === TILE.LOW) x0 -= 1;
    const first = (x - x0) % 2 === 0;
    const lead = first ? x : x - 1;
    if (look.sprites.biglog && R.at(lead + 1, y) === TILE.LOW && R.rnd(lead, y, 95) < 0.6) {
      if (!first) return null;
      name = 'biglog';
      px = (x + 1) * T;
    } else name = weighted(look.low, R.rnd(x, y, 91));
  } else return null;
  const def = look.sprites[name];
  return {
    name, def,
    key: `prop.${look.id}.${name}`,
    v: Math.floor(R.rnd(x, y, 92) * def.variants),
    x: px + (R.rnd(x, y, 93) - 0.5) * (name === 'biglog' ? 2 : 6),
    y: y * T + T / 2 + (def.sit ?? 9) + (R.rnd(x, y, 94) - 0.5) * 3,
  };
}

/**
 * Основания преград в земле: плотная тень у самого низа, тень кроны — вправо вниз, трава у подножия.
 * Куст — исключение: его ломают посреди боя, и готовить фон заново ради этого нельзя. Поэтому в фоне от куста
 * нет ничего, а тень у него своя, в картинке.
 */
function paintBases(g, R, look) {
  const P = look.pal;
  for (let y = 0; y < R.h; y++) {
    for (let x = 0; x < R.w; x++) {
      if (R.at(x, y) === TILE.BUSH) continue;
      const s = standing(R, look, x, y);
      if (!s) continue;
      const [rx, ry] = s.def.foot;
      const rnd = rngOf(hashInt(R.seed, x, y, 97));
      if (s.def.crown) {
        spot(g, x * T + 16, y * T + 18, 22, 17, P.groundDeep, 0.42);
        spot(g, s.x + s.def.crown * 0.55, s.y + 4, s.def.crown * 1.05, s.def.crown * 0.42, SHADOW, 0.2);
      }
      spot(g, s.x + 2.5, s.y + 0.5, rx * 1.55, ry * 1.9, SHADOW, 0.42);
      oval(g, s.x + 1, s.y - 0.5, rx, ry, fade(SHADOW, 0.3));
      tuft(g, s.x - rx - 1 - rnd() * 2, s.y + 1, 5, P, rnd);
      tuft(g, s.x + rx + 1 + rnd() * 2, s.y + 1.5, 4.6, P, rnd);
      if (rnd() < 0.6) tuft(g, s.x - rx * 0.4 + rnd() * rx, s.y + ry + 1.5, 4.2, P, rnd);
    }
  }
}

/** Солнечные пятна сквозь листву: бледные, кучками. */
function paintLight(g, R, P) {
  const rnd = rngOf(hashInt(R.seed, 5));
  for (let i = Math.round((R.W * R.H) / 5600); i > 0; i--) {
    const cx = T + rnd() * (R.W - 2 * T);
    const cy = T * 1.7 + rnd() * (R.H - 2.8 * T);
    for (let k = 2 + Math.floor(rnd() * 4); k > 0; k--) {
      const r = 5 + rnd() * 8.5;
      spot(g, cx + (rnd() - 0.5) * 46, cy + (rnd() - 0.5) * 30, r, r * (0.55 + rnd() * 0.3), P.sun, 0.17 + rnd() * 0.1, rnd() * 3);
    }
  }
}

// ---------- стена леса и лес вокруг ----------

/** Тона листвы от ближней к самой дальней: чем дальше, тем темнее и ближе к цвету глубины. */
function canopyTones(P) {
  return {
    near: { base: P.canopy, light: P.canopyLight, dark: P.canopyDark, line: dim(P.canopy, 0.62) },
    mid: { base: mix(P.canopy, P.canopyDark, 0.62), light: P.canopy, dark: P.canopyDeep, line: dim(P.canopyDark, 0.58) },
    far: { base: mix(P.canopyDark, P.canopyDeep, 0.6), light: mix(P.canopy, P.canopyDark, 0.55), dark: P.under, line: dim(P.canopyDeep, 0.5) },
    deep: { base: mix(P.canopyDeep, P.under, 0.45), light: mix(P.canopyDark, P.canopyDeep, 0.5), dark: P.under, line: mix(P.under, INK, 0.35) },
    dusk: { base: mix(P.canopyDeep, P.under, 0.2), light: mix(P.canopyDark, P.canopyDeep, 0.3), dark: P.under, line: mix(P.under, INK, 0.3) },
    // на свету, куст, берёза, ель
    lit: { base: mix(P.canopy, P.canopyLight, 0.6), light: lift(P.canopyLight, 0.4), dark: P.canopy, line: dim(P.canopy, 0.56) },
    bush: { base: P.bush, light: lift(P.bush, 0.42), dark: mix(P.bush, P.canopyDeep, 0.6), line: dim(P.bush, 0.62) },
    birch: { base: P.birchLeaf, light: lift(P.birchLeaf, 0.45), dark: mix(P.birchLeaf, P.canopyDark, 0.6), line: dim(P.birchLeaf, 0.6) },
    fir: { base: P.fir, light: mix(P.fir, P.canopyLight, 0.5), dark: mix(P.fir, P.under, 0.6), line: dim(P.fir, 0.6) },
  };
}

/** Круги клуба листвы вокруг точки: середина и три-четыре поменьше по бокам (few — два-три). */
function clump(x, y, r, seed, few = false) {
  const rnd = rngOf(seed);
  const list = [[x, y, r]];
  const n = few ? 2 + Math.floor(rnd() * 1.5) : 3 + Math.floor(rnd() * 2);
  const a0 = rnd() * TAU;
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * TAU + (rnd() - 0.5) * 0.5;
    const d = r * (0.62 + rnd() * 0.2);
    list.push([x + Math.cos(a) * d, y + Math.sin(a) * d * 0.82, r * (0.5 + rnd() * 0.22)]);
  }
  return list;
}

/** Папоротник: веер листьев от земли. */
function fern(g, x, y, size, back, front, rnd) {
  const n = 5;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.5 + (rnd() - 0.5) * 0.2;
    leaf(g, x, y, size * (0.8 + rnd() * 0.4), size * 0.2, a, i % 2 ? front : back);
  }
}

// Глубокий лес: кроны сверху, сплошь, в тени. Два слоя клубов, расставленных по клетке 64×64 раз и навсегда;
// нижний темнее. Каждый слой рисуется одним проходом на всю площадь (пять заливок на сотни клубов), поэтому
// рисунок не зависит от того, с какой клетки начали: он повторяется без шва и на полях фона, и в картинке.
const DEEP_LAYERS = [[2, 7741, 15, 4], [2, 9133, 12.5, 3]].map(([n, seed, size, spread], layer) => {
  const rnd = rngOf(seed);
  const circles = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      if (layer && (i + j) % 2) continue;       // верхний слой реже: два клуба на клетку
      const x = ((i + 0.5 + (rnd() - 0.5) * 0.6) * DEEP) / n + layer * 15;
      const y = ((j + 0.5 + (rnd() - 0.5) * 0.6) * DEEP) / n + layer * 17;
      for (const c of clump(x, y, size + rnd() * spread, seed + j * n + i, true)) circles.push(c);
    }
  }
  return circles;
});

/**
 * Глубокий лес на прямоугольнике (x0, y0)…(x1, y1); сетка клеток — от начала координат.
 * skip(x, y, r) — этот круг не нужен (фон комнаты не рисует то, что целиком под полом).
 */
function paintDeep(g, look, x0, y0, x1, y1, skip = null) {
  const tones = [look.tone.deep, look.tone.dusk];
  DEEP_LAYERS.forEach((layer, k) => {
    const all = [];
    for (let gy = Math.floor((y0 - 30) / DEEP); gy * DEEP < y1 + 30; gy++) {
      for (let gx = Math.floor((x0 - 30) / DEEP); gx * DEEP < x1 + 30; gx++) {
        for (const c of layer) {
          const x = c[0] + gx * DEEP;
          const y = c[1] + gy * DEEP;
          const r = c[2] + 2;
          if (x + r < x0 || x - r > x1 || y + r < y0 || y - r > y1 || (skip && skip(x, y, r))) continue;
          all.push([x, y, c[2]]);
        }
      }
    }
    if (all.length) puffFlat(g, all, tones[k], 1.1, false);
  });
}

function paintWalls(g, R, look) {
  const P = look.pal;
  const tone = look.tone;
  const M = ROOM_MARGIN;
  const wall = R.wall;
  const face = R.face;
  // тени стены на полу: под верхней — глубокая, от левой — шире (свет слева сверху)
  for (let y = 0; y < R.h; y++) {
    for (let x = 0; x < R.w; x++) {
      if (!wall(x, y)) continue;
      const cx = x * T + 16;
      const cy = y * T + 16;
      const j = (R.rnd(x, y, 101) - 0.5) * 8;
      if (!wall(x, y + 1)) spot(g, cx + j, (y + 1) * T + 3, 31, 25, SHADOW, 0.42);
      if (!wall(x + 1, y)) spot(g, (x + 1) * T + 2, cy + j, 21, 29, SHADOW, 0.3);
      if (!wall(x - 1, y)) spot(g, x * T - 1, cy + j, 11, 27, SHADOW, 0.17);
      if (!wall(x, y - 1)) spot(g, cx + j, y * T - 1, 28, 10, SHADOW, 0.17);
    }
  }
  // подножие леса: тёмная земля под кронами, край неровный
  const loops = contours(R.w, R.h, (x, y) => !wall(x, y));
  g.beginPath();
  g.rect(-M, -M, R.W + 2 * M, R.H + 2 * M);
  for (const loop of loops) closedCurve(g, organic(loop, R.seed + 9, 12, 2.2, -2));
  g.fillStyle = P.under;
  g.fill('evenodd');
  // верхняя стена: глубина темнеет кверху, у земли — отсвет травы и дальние стволы
  for (let y = 0; y < R.h; y++) {
    for (let x = 0; x < R.w; x++) {
      if (!face(x, y)) continue;
      let x1 = x;
      while (face(x1 + 1, y)) x1 += 1;
      const grad = g.createLinearGradient(0, y * T - 2, 0, (y + 1) * T);
      grad.addColorStop(0, fade(SHADOW, 0.55));
      grad.addColorStop(1, fade(SHADOW, 0.05));
      g.fillStyle = grad;
      g.fillRect(x * T, y * T - 2, (x1 - x + 1) * T, T + 2);
      for (let i = x; i <= x1; i++) {
        const rnd = rngOf(hashInt(R.seed, i, y, 103));
        spot(g, i * T + 16 + (rnd() - 0.5) * 10, (y + 1) * T - 2, 22, 10, P.groundDeep, 0.6);
        for (let k = 2 + Math.floor(rnd() * 2); k > 0; k--) {
          const tx = i * T + rnd() * T;
          const tw = 3 + rnd() * 3.6;
          const top = y * T - 8;
          const tall = T + 5 - rnd() * 6;
          g.fillStyle = mix(P.trunkDark, P.under, 0.5);
          g.fillRect(tx - tw / 2, top, tw, tall);
          g.fillStyle = fade(P.trunk, 0.4);
          g.fillRect(tx - tw / 2, top, tw * 0.3, tall);
        }
      }
      x = x1;
    }
  }
  // подлесок по краю: у верхней стены — папоротник и трава, у остальных — клубы листвы (все — одним проходом)
  const shrubs = [];
  for (let y = 0; y < R.h; y++) {
    for (let x = 0; x < R.w; x++) {
      if (!wall(x, y)) continue;
      const rnd = rngOf(hashInt(R.seed, x, y, 105));
      const x0 = x * T;
      const y0 = y * T;
      if (face(x, y)) {
        for (let k = 0; k < 2; k++) {
          const fx = x0 + (k + 0.2 + rnd() * 0.6) * 16;
          if (rnd() < 0.6) fern(g, fx, y0 + T + 1.5, 8 + rnd() * 4, tone.far.base, tone.mid.base, rnd);
          else tuft(g, fx, y0 + T + 2, 6 + rnd() * 3, P, rnd);
        }
      }
      const bush = (bx, by) => {
        for (const c of clump(bx, by, 5.5 + rnd() * 3, hashInt(R.seed, Math.round(bx), Math.round(by), 106))) shrubs.push(c);
      };
      if (!wall(x + 1, y)) for (let k = 0; k < 2; k++) bush(x0 + T - 2 + rnd() * 3, y0 + (k + 0.2 + rnd() * 0.6) * 16);
      if (!wall(x - 1, y)) for (let k = 0; k < 2; k++) bush(x0 + 2 - rnd() * 3, y0 + (k + 0.2 + rnd() * 0.6) * 16);
      if (!wall(x, y - 1)) for (let k = 0; k < 2; k++) bush(x0 + (k + 0.2 + rnd() * 0.6) * 16, y0 + 3 - rnd() * 3);
    }
  }
  if (shrubs.length) puffFlat(g, shrubs, tone.far);
  // глубокий лес на полях — тем же рисунком и по той же сетке, что рендер кладёт дальше: шва на краю фона нет
  g.save();
  g.beginPath();
  g.rect(-M, -M, R.W + 2 * M, R.H + 2 * M);
  g.rect(0, 0, R.W, R.H);
  g.clip('evenodd');
  paintDeep(g, look, -M, -M, R.W + M, R.H + M, (x, y, r) => x - r > 0 && y - r > 0 && x + r < R.W && y + r < R.H);
  g.restore();
  // проёмы: тропа в них темнеет и уходит под кроны — за краем комнаты уже лес
  for (const d of R.doors) {
    const ex = d.x - d.dx * (T / 2);            // середина наружного края проёма
    const ey = d.y - d.dy * (T / 2);
    const dusk = mix(P.under, SHADOW, 0.3);
    const grad = g.createLinearGradient(ex + d.dx * (T + 10), ey + d.dy * (T + 10), ex, ey);
    grad.addColorStop(0, fade(dusk, 0));
    grad.addColorStop(0.3, fade(dusk, 0.22));
    grad.addColorStop(0.62, fade(dusk, 0.66));
    grad.addColorStop(0.86, fade(dusk, 0.92));
    grad.addColorStop(1, fade(dusk, 1));
    g.fillStyle = grad;
    if (d.horiz) g.fillRect(d.x - d.half, d.side === 'n' ? 0 : R.H - T - 10, d.half * 2, T + 10);
    else g.fillRect(d.side === 'w' ? 0 : R.W - T - 10, d.y - d.half, T + 10, d.half * 2);
    // кромка леса над проёмом: клубы наполовину заходят в него — у темноты нет ровного края
    const lintel = [];
    for (let t = -d.half + 5; t < d.half; t += 14) {
      const u = h01(R.seed, Math.round(t), d.lo, 110);
      const cx = ex - d.dx * (3 + u * 5) + d.dy * t;
      const cy = ey - d.dy * (3 + u * 5) + d.dx * t;
      for (const c of clump(cx, cy, 9 + u * 3, hashInt(R.seed, Math.round(t), d.lo, 113), true)) lintel.push(c);
    }
    puffFlat(g, lintel, tone.deep, 1.2);
  }
  // дальние кроны: на полях и над стеной (кроме клеток, что смотрят на нас, и проёмов)
  const solidAt = (px, py) => px < 0 || py < 0 || px >= R.W || py >= R.H || wall(Math.floor(px / T), Math.floor(py / T));
  for (let row = 0, py = -M + 6; py < R.H + M - 2; py += 21, row++) {
    const batch = [[], [], [], []];           // через один; у края полей — тоном глубины
    for (let col = 0, px = -M + 6 + (row % 2) * 13; px < R.W + M - 2; px += 26, col++) {
      const u = h01(R.seed, row, Math.round(px), 107);
      const v = h01(R.seed, row, Math.round(px), 108);
      const x = px + (u - 0.5) * 14;
      const y = py + (v - 0.5) * 12;
      const r = 12.5 + u * 4.5;
      if (!solidAt(x, y) || !solidAt(x + 11, y) || !solidAt(x - 11, y) || !solidAt(x, y + 11) || !solidAt(x, y - 9)) continue;
      const inside = x >= 0 && y >= 0 && x < R.W && y < R.H;
      if (inside && face(Math.floor(x / T), Math.floor(y / T))) continue;
      if (inside && face(Math.floor(x / T), Math.floor((y + 13) / T))) continue;
      // у самого края полей клубов нет: там рисунок глубокого леса должен остаться нетронутым
      const edge = Math.min(x + M, y + M, R.W + M - x, R.H + M - y);
      if (edge < r * 1.7 + 3) continue;
      const list = batch[(col % 2) + (edge < 34 ? 2 : 0)];
      for (const c of clump(x, y, r, hashInt(R.seed, row, Math.round(px), 109), true)) list.push(c);
    }
    for (let k = 0; k < 4; k++) if (batch[k].length) puffFlat(g, batch[k], k < 2 ? tone.far : tone.deep, 1.3);
  }
}

// ---------- фон комнаты ----------

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
/** Вид места; незнакомое рисуется как лес. */
function lookOf(biome) {
  return typeof biome === 'string' && hasOwn(BIOME_LOOK, biome) ? BIOME_LOOK[biome] : BIOME_LOOK.forest;
}

/**
 * Весь неподвижный фон комнаты. g — контекст в единицах мира с началом в левом верхнем углу комнаты;
 * рисунок занимает прямоугольник от −ROOM_MARGIN до размера комнаты + ROOM_MARGIN.
 * room — { w, h, tiles, biome, seed, doors: { n|e|s|w: { open } } }.
 */
export function paintRoom(g, room) {
  const look = lookOf(room.biome);
  const R = scan(room);
  const P = look.pal;
  g.save();
  g.beginPath();
  g.rect(0, 0, R.W, R.H);
  g.clip();
  look.ground(g, R, P);
  paintPaths(g, R, P);
  look.special(g, R, P);
  look.decals(g, R, P);
  look.water(g, R, P);
  look.thorns(g, R, P);
  paintBurrows(g, R, P);
  paintDens(g, R, P);
  paintBases(g, R, look);
  paintLight(g, R, P);
  g.restore();
  paintWalls(g, R, look);
}

// ---------- картинки: деревья ----------
// У картинки начало координат — левый верхний угол её рамки; точка привязки — где ствол входит в землю.

/**
 * Ствол: от земли (x, base) вверх на tall; у земли расходится корнями. o: color, dark — свои цвета (берёза),
 * flare — размах корней, lean — наклон верхушки, shade — тень от кроны сверху, marks — берёзовые чёрточки.
 */
function trunk(g, x, base, tall, wide, P, seed, o = {}) {
  const top = base - tall;
  const w0 = wide / 2;
  const w1 = wide * (o.taper ?? 0.36);
  const flare = o.flare ?? wide * 0.4;
  const lean = o.lean ?? 0;
  const color = o.color ?? P.trunk;
  const dark = o.dark ?? P.trunkDark;
  const path = (c) => {
    c.moveTo(x - w0 - flare, base + 1.2);
    c.quadraticCurveTo(x - w0 - 0.4, base - 1.5, x - w0 * 0.92 + lean * 0.25, base - tall * 0.3);
    c.lineTo(x + lean - w1, top);
    c.lineTo(x + lean + w1, top);
    c.lineTo(x + w0 * 0.92 + lean * 0.25, base - tall * 0.3);
    c.quadraticCurveTo(x + w0 + 0.4, base - 1.5, x + w0 + flare, base + 1.2);
    c.quadraticCurveTo(x, base + 3.4, x - w0 - flare, base + 1.2);
    c.closePath();
  };
  solid(g, path, x + lean / 2, base - tall / 2, w0 + 1, tall / 2 + 2, color, {
    light: 0.3, dark: 0.3, lw: o.lw ?? 1.6, rim: 0.5,
    inside: (c) => {
      const grad = c.createLinearGradient(x - w0, 0, x + w0, 0);
      grad.addColorStop(0, fade(lift(color, 0.5), 0.55));
      grad.addColorStop(0.42, fade(color, 0));
      grad.addColorStop(1, fade(dark, 0.9));
      c.fillStyle = grad;
      c.fillRect(x - w0 - flare - 3, top - 2, wide + flare * 2 + 6, tall + 8);
      const rnd = rngOf(seed);
      c.lineCap = 'round';
      if (o.marks) {
        for (let i = 0; i < tall / 5; i++) {
          const my = top + 3 + rnd() * (tall - 6);
          const mx = x + lean * (1 - (my - top) / tall) + (rnd() - 0.5) * wide * 0.5;
          c.strokeStyle = fade(o.marks, 0.85);
          c.lineWidth = 1 + rnd() * 0.7;
          c.beginPath();
          c.moveTo(mx - 1 - rnd() * 1.6, my);
          c.lineTo(mx + 1 + rnd() * 1.6, my + (rnd() - 0.5) * 0.8);
          c.stroke();
        }
      } else {
        for (let i = 0; i < tall / 4; i++) {
          const my = top + 2 + rnd() * (tall - 5);
          const mx = x + (rnd() - 0.5) * wide * 0.7;
          c.strokeStyle = fade(dark, 0.6);
          c.lineWidth = 0.9;
          c.beginPath();
          c.moveTo(mx, my);
          c.lineTo(mx + (rnd() - 0.5), my + 3 + rnd() * 4);
          c.stroke();
        }
      }
      if (o.shade) {
        const sh = c.createLinearGradient(0, top, 0, top + o.shade);
        sh.addColorStop(0, fade(mix(dark, SHADOW, 0.4), 0.8));
        sh.addColorStop(1, fade(dark, 0));
        c.fillStyle = sh;
        c.fillRect(x - wide, top - 1, wide * 2, o.shade + 1);
      }
    },
  });
}

/** Дуб: толстый ствол с сучьями и крона из четырёх клубов — задний темнее, верхний левый на свету. */
function paintOak(g, look, v) {
  const P = look.pal;
  const t = look.tone;
  const x = 38;
  const base = 85;
  const J = (list, salt) => jitterCircles(list, v * 131 + salt, v ? 1.5 : 0.4);
  trunk(g, x, base, 48, 13, P, 20 + v, { shade: 18 });
  limb(g, [x - 2, base - 30, x - 8, base - 38, x - 13, base - 44], 3.4, P.trunk, dim(P.trunk), 1.3);
  limb(g, [x + 2, base - 33, x + 8, base - 40, x + 13, base - 45], 3, mix(P.trunk, P.trunkDark, 0.5), dim(P.trunk), 1.3);
  puff(g, J([[38, 27, 21], [22, 31, 15], [55, 31, 16], [38, 14, 13.5], [27, 18, 11.5], [50, 18, 11.5]], 1), t.mid, 31 + v, { under: 0.3 });
  puff(g, J([[53, 41, 14], [63, 44, 8.5], [45, 47, 9.5]], 2), t.mid, 32 + v, { under: 0.55, light: 0.25 });
  puff(g, J([[23, 40, 15], [12, 43, 9], [32, 46, 10.5]], 3), t.near, 33 + v, { under: 0.4 });
  puff(g, J([[32, 22, 13.5], [22, 25, 9.5], [42, 18, 10], [31, 12, 8.5]], 4), t.lit, 34 + v, { dark: 0.3 });
}

/** Берёза: тонкий светлый ствол в чёрточках, лёгкая жёлто-зелёная крона, ствол проглядывает. */
function paintBirch(g, look, v) {
  const P = look.pal;
  const t = look.tone;
  const x = 27;
  const base = 90;
  const lean = v ? -2 : 2.5;
  const J = (list, salt) => jitterCircles(list, v * 173 + salt, 1);
  g.save();
  g.translate(1, 0);
  puff(g, J([[27 + lean, 24, 15], [16 + lean, 29, 10], [38 + lean, 28, 10.5], [27 + lean, 12, 10]], 1), t.near, 41 + v, { under: 0.3 });
  trunk(g, x, base, 66, 8, P, 40 + v, { color: P.birch, dark: P.birchShade, marks: P.birchMark, flare: 1.6, lean, taper: 0.3, shade: 10 });
  limb(g, [x + lean * 0.5 + 1, base - 40, x + 8, base - 47, x + 12, base - 52], 2, P.birch, dim(P.birch, 0.55), 1.1);
  puff(g, J([[16 + lean, 41, 10.5], [9 + lean, 44, 6.5], [22 + lean, 46, 7]], 2), t.birch, 42 + v, { under: 0.35 });
  puff(g, J([[40 + lean, 37, 10], [47 + lean, 40, 6.5], [34 + lean, 41, 6.5]], 3), t.birch, 43 + v, { under: 0.45, light: 0.3 });
  puff(g, J([[26 + lean, 20, 12.5], [17 + lean, 23, 8.5], [35 + lean, 17, 8.5], [25 + lean, 10, 7.5]], 4), t.birch, 44 + v, { dark: 0.36 });
  g.restore();
}

/** Ель: ярусы-юбки с зубчатым низом, каждый верхний затеняет нижний. */
function paintFir(g, look, v) {
  const P = look.pal;
  const t = look.tone.fir;
  const x = 28;
  const base = 94;
  trunk(g, x, base, 22, 9, P, 50 + v, { shade: 12 });
  const tiers = v ? [[80, 25, 30], [62, 21, 28], [44, 16.5, 25], [27, 11.5, 22]] : [[78, 26, 28], [61, 22, 27], [45, 17.5, 25], [29, 12.5, 23]];
  tiers.forEach(([bottom, half, tall], k) => {
    const top = bottom - tall;
    const rnd = rngOf(hashInt(55, v, k));
    const teeth = 4 + (k < 2 ? 1 : 0);
    const path = (c) => {
      c.moveTo(x, top);
      c.quadraticCurveTo(x - half * 0.3, bottom - tall * 0.4, x - half, bottom - 2);
      for (let i = 0; i < teeth; i++) {
        const x0 = x - half + (i / teeth) * half * 2;
        const x1 = x - half + ((i + 1) / teeth) * half * 2;
        c.quadraticCurveTo((x0 + x1) / 2 + (rnd() - 0.5) * 2, bottom + 4.5 + rnd() * 2.5, x1, bottom - 2 + (i === teeth - 1 ? 0 : rnd() * 1.5));
      }
      c.quadraticCurveTo(x + half * 0.3, bottom - tall * 0.4, x, top);
      c.closePath();
    };
    // тень яруса на том, что ниже
    if (k) spot(g, x + 2, bottom + 5, half * 0.95, 5, mix(t.dark, SHADOW, 0.4), 0.5);
    solid(g, path, x, bottom - tall * 0.45, half, tall * 0.6, k % 2 ? t.base : mix(t.base, t.dark, 0.18), {
      light: 0.5, dark: 0.55, line: t.line,
      inside: (c) => {
        c.lineCap = 'round';
        for (let i = 0; i < 7; i++) {
          const mx = x + (rnd() - 0.5) * half * 1.5;
          const my = top + tall * (0.35 + rnd() * 0.6);
          c.strokeStyle = mx < x ? fade(t.light, 0.6) : fade(t.dark, 0.6);
          c.lineWidth = 1.1;
          c.beginPath();
          c.moveTo(mx, my);
          c.lineTo(mx + (mx < x ? -2.4 : 2.4), my + 3.2);
          c.stroke();
        }
      },
    });
  });
}

/** Молодое деревце: тонкий ствол и один круглый клуб; второй вариант — в цвету. */
function paintSapling(g, look, v) {
  const P = look.pal;
  const t = look.tone;
  const x = 20;
  const base = 55;
  trunk(g, x, base, 30, 5.5, P, 60 + v, { flare: 1.6, lean: v ? 1.5 : -1.5, shade: 8 });
  const lean = v ? 1.5 : -1.5;
  puff(g, [[20 + lean, 21, 13], [10 + lean, 26, 7.5], [30 + lean, 25, 8], [21 + lean, 11, 8.5]], t.near, 61 + v, { under: 0.4 });
  puff(g, [[16 + lean, 17, 9], [11 + lean, 20, 5.5], [22 + lean, 12, 6]], t.lit, 62 + v, { dark: 0.3, marks: 4 });
  if (v) {
    const rnd = rngOf(63);
    for (let i = 0; i < 9; i++) {
      const a = rnd() * TAU;
      const d = Math.sqrt(rnd()) * 11;
      const fx = 20 + lean + Math.cos(a) * d;
      const fy = 20 + Math.sin(a) * d * 0.9;
      disc(g, fx, fy, 1.7, dim(P.flowers[1], 0.3));
      disc(g, fx, fy, 1.2, i % 3 ? P.flowers[1] : '#ffffff');
    }
  }
}

// ---------- картинки: камни, пни, брёвна, кусты ----------

/**
 * Камень гранями: силуэт — неровный многоугольник с плоским низом; грань светлее, если смотрит на свет.
 * o: moss — мох на макушке (доля 0…1), cracks — трещины.
 */
function rock(g, cx, base, w, h, seed, P, o = {}) {
  const rnd = rngOf(seed);
  const n = 9;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = Math.PI + (i / (n - 1)) * Math.PI;
    const k = i === 0 || i === n - 1 ? 1 : 0.84 + rnd() * 0.24;
    pts.push([cx + Math.cos(a) * (w / 2) * k, base + Math.sin(a) * h * k]);
  }
  const path = (c) => {
    c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < n; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.quadraticCurveTo(cx, base + 2.6, pts[0][0], pts[0][1]);
    c.closePath();
  };
  const ax = cx - w * 0.1 + (rnd() - 0.5) * w * 0.12;
  const ay = base - h * 0.62;
  solid(g, path, cx, base - h / 2, w / 2, h / 2, P.rock, {
    light: 0.22, dark: 0.36, line: dim(P.rock, 0.66), lw: o.lw ?? 1.7,
    inside: (c) => {
      for (let i = 0; i < n - 1; i++) {
        const mx = (pts[i][0] + pts[i + 1][0]) / 2 - ax;
        const my = (pts[i][1] + pts[i + 1][1]) / 2 - ay;
        const d = Math.hypot(mx, my) || 1;
        const lit = (-mx * 0.62 - my * 0.78) / d;
        const tone = lit > 0 ? mix(P.rock, P.rockLight, Math.min(1, lit * 1.05)) : mix(P.rock, P.rockDark, Math.min(1, -lit * 1.15));
        c.fillStyle = tone;
        c.strokeStyle = tone;
        c.lineWidth = 0.6;
        c.beginPath();
        c.moveTo(ax, ay);
        c.lineTo(pts[i][0], pts[i][1]);
        c.lineTo(pts[i + 1][0], pts[i + 1][1]);
        c.closePath();
        c.fill();
        c.stroke();
      }
      // низ в тени: от земли поднимается сумрак
      const grad = c.createLinearGradient(0, base - h * 0.42, 0, base + 2);
      grad.addColorStop(0, fade(P.rockDark, 0));
      grad.addColorStop(1, fade(mix(P.rockDark, SHADOW, 0.35), 0.62));
      c.fillStyle = grad;
      c.fillRect(cx - w / 2 - 2, base - h * 0.42, w + 4, h * 0.42 + 4);
      c.strokeStyle = fade(dim(P.rock, 0.6), 0.6);
      c.lineWidth = 0.9;
      c.lineCap = 'round';
      for (let i = 0; i < (o.cracks ?? 2); i++) {
        const sx = ax + (rnd() - 0.3) * w * 0.4;
        c.beginPath();
        c.moveTo(sx, ay + rnd() * 4);
        c.lineTo(sx + (rnd() - 0.4) * 5, ay + h * 0.22 + rnd() * 3);
        c.lineTo(sx + (rnd() - 0.4) * 8, ay + h * 0.4 + rnd() * 4);
        c.stroke();
      }
      if (o.moss) {
        c.fillStyle = P.moss;
        c.beginPath();
        blob(c, cx - w * 0.08, base - h * 0.98, w * 0.42 * o.moss + 3, h * 0.26 * o.moss + 2, seed + 5, 0.2, 8);
        c.fill();
        spot(c, cx - w * 0.2, base - h * 1.02, w * 0.24, h * 0.14, lift(P.moss, 0.5), 0.8);
      }
    },
  });
}

function paintRock(g, look, v) {
  const P = look.pal;
  if (v === 0) rock(g, 18, 25, 29, 19, 201, P, { moss: 0.5 });
  else if (v === 1) {
    rock(g, 15, 24.5, 23, 17, 202, P, {});
    rock(g, 28, 25.5, 13, 9.5, 203, P, { cracks: 1, lw: 1.5 });
  } else rock(g, 18, 25, 32, 14, 204, P, { moss: 1, cracks: 1 });
}

/** Высокая скала: стоит как дерево — не пройти, не перепрыгнуть. */
function paintCrag(g, look, v) {
  const P = look.pal;
  if (v === 0) {
    rock(g, 29, 53, 22, 30, 211, P, { cracks: 1 });
    rock(g, 19, 55, 30, 47, 212, P, { moss: 0.7, cracks: 3 });
  } else {
    rock(g, 15, 54, 20, 26, 213, P, { cracks: 1 });
    rock(g, 26, 55, 31, 44, 214, P, { moss: 0.5, cracks: 3 });
  }
  const rnd = rngOf(215 + v);
  fern(g, 7, 56, 7, look.tone.mid.base, look.tone.near.base, rnd);
  tuft(g, 39, 56, 6, P, rnd);
}

/** Спил пня или бревна: светлый овал с годовыми кольцами. */
function cutFace(g, x, y, rx, ry, P, rot = 0) {
  const face = lift(P.stump, 0.42);
  g.fillStyle = face;
  g.beginPath();
  g.ellipse(x, y, rx, ry, rot, 0, TAU);
  g.fill();
  g.strokeStyle = fade(dim(P.stump, 0.3), 0.7);
  g.lineWidth = 0.8;
  for (const k of [0.66, 0.36]) {
    g.beginPath();
    g.ellipse(x + rx * 0.06, y + ry * 0.05, rx * k, ry * k, rot, 0, TAU);
    g.stroke();
  }
  g.fillStyle = fade(lift(face, 0.6), 0.7);
  g.beginPath();
  g.ellipse(x - rx * 0.3, y - ry * 0.3, rx * 0.4, ry * 0.36, rot, 0, TAU);
  g.fill();
  g.strokeStyle = dim(P.stump, 0.6);
  g.lineWidth = 1.5;
  g.beginPath();
  g.ellipse(x, y, rx, ry, rot, 0, TAU);
  g.stroke();
}

/** Пень: кора с корнями и светлый спил; на одном — поганка-соседка, на другом — росток. */
function paintStump(g, look, v) {
  const P = look.pal;
  const x = 17;
  const base = 26;
  const top = 12.5;
  const bark = mix(P.trunk, P.stump, 0.35);
  const path = (c) => {
    c.moveTo(x - 15, base + 1);
    c.quadraticCurveTo(x - 10.5, base - 1.5, x - 10.5, top);
    c.lineTo(x + 10.5, top);
    c.quadraticCurveTo(x + 10.5, base - 1.5, x + 15.5, base + 1);
    c.quadraticCurveTo(x + 6, base + 3.4, x + 2, base + 1);
    c.quadraticCurveTo(x - 4, base + 3.6, x - 15, base + 1);
    c.closePath();
  };
  solid(g, path, x, (top + base) / 2, 13, 9, bark, {
    light: 0.3, dark: 0.3,
    inside: (c) => {
      const grad = c.createLinearGradient(x - 11, 0, x + 12, 0);
      grad.addColorStop(0, fade(lift(bark, 0.5), 0.5));
      grad.addColorStop(0.4, fade(bark, 0));
      grad.addColorStop(1, fade(P.trunkDark, 0.9));
      c.fillStyle = grad;
      c.fillRect(x - 17, top - 2, 34, 20);
      const rnd = rngOf(220 + v);
      c.strokeStyle = fade(P.trunkDark, 0.6);
      c.lineWidth = 0.9;
      c.lineCap = 'round';
      for (let i = 0; i < 7; i++) {
        const bx = x - 9 + rnd() * 18;
        c.beginPath();
        c.moveTo(bx, top + 4 + rnd() * 3);
        c.lineTo(bx + (rnd() - 0.5), top + 8 + rnd() * 5);
        c.stroke();
      }
    },
  });
  cutFace(g, x, top, 10.5, 4.7, P);
  if (v === 0) {
    oval(g, x - 4, top + 1, 4.6, 1.9, look.pal.moss);
    oval(g, x - 5, top + 0.5, 2.4, 1, lift(look.pal.moss, 0.5));
    toadstool(g, x + 13, base + 1.5, 1.05, P);
  } else {
    g.strokeStyle = dim(P.canopy, 0.4);
    g.lineWidth = 1.2;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x + 4, top);
    g.quadraticCurveTo(x + 4.6, top - 4, x + 3.6, top - 7.5);
    g.stroke();
    leaf(g, x + 3.8, top - 6.6, 5.4, 2, -0.5, P.canopyLight);
    leaf(g, x + 3.8, top - 5.4, 5, 1.9, Math.PI + 0.4, P.canopy);
  }
}

/** Лежащее бревно длиной len: спил слева (на свету), кора сверху светлее, мох, сучок. */
function logBody(g, x0, cy, len, r, P, seed, o = {}) {
  const x1 = x0 + len;
  const path = (c) => {
    c.moveTo(x0 + 1, cy - r);
    c.lineTo(x1 - r * 0.5, cy - r);
    c.quadraticCurveTo(x1 + r * 0.42, cy, x1 - r * 0.5, cy + r);
    c.lineTo(x0 + 1, cy + r);
    c.closePath();
  };
  solid(g, path, (x0 + x1) / 2, cy, len / 2, r, P.trunk, {
    light: 0.18, dark: 0.25,
    inside: (c) => {
      const grad = c.createLinearGradient(0, cy - r, 0, cy + r);
      grad.addColorStop(0, fade(lift(P.trunk, 0.5), 0.6));
      grad.addColorStop(0.35, fade(P.trunk, 0));
      grad.addColorStop(1, fade(P.trunkDark, 0.92));
      c.fillStyle = grad;
      c.fillRect(x0 - 2, cy - r - 2, len + 6, r * 2 + 4);
      const rnd = rngOf(seed);
      c.strokeStyle = fade(P.trunkDark, 0.55);
      c.lineWidth = 0.9;
      c.lineCap = 'round';
      for (let i = 0; i < len / 5; i++) {
        const bx = x0 + 5 + rnd() * (len - 10);
        const by = cy - r + 2 + rnd() * (r * 2 - 4);
        c.beginPath();
        c.moveTo(bx, by);
        c.lineTo(bx + 3 + rnd() * 5, by + (rnd() - 0.5));
        c.stroke();
      }
      if (o.moss) {
        c.fillStyle = P.moss;
        c.beginPath();
        blob(c, x0 + len * o.moss, cy - r, len * 0.2, r * 0.62, seed + 3, 0.2, 8);
        c.fill();
        spot(c, x0 + len * o.moss - 2, cy - r - 0.5, len * 0.1, r * 0.3, lift(P.moss, 0.5), 0.8);
      }
    },
  });
  cutFace(g, x0 + 1.6, cy, r * 0.56, r, P);
}

function paintLog(g, look, v) {
  const P = look.pal;
  logBody(g, 5, 14.5, 30, 7.5, P, 230 + v, { moss: v ? 0.7 : 0.45 });
  if (v) toadstool(g, 31, 9, 0.95, P);
  else {
    limb(g, [24, 8.5, 26, 5, 29.5, 3.2], 2.2, P.trunk, dim(P.trunk), 1.1);
    leaf(g, 29, 3.6, 5, 1.9, -0.3, P.canopyLight);
  }
}

function paintBigLog(g, look, v) {
  const P = look.pal;
  limb(g, [44, 9, 47.5, 4.5, 52, 2.6], 2.6, P.trunk, dim(P.trunk), 1.2);
  logBody(g, 5, 15, 62, 8, P, 240 + v, { moss: v ? 0.3 : 0.62 });
  leaf(g, 51.5, 3, 5.4, 2, -0.4, P.canopyLight);
  leaf(g, 50.6, 3.6, 4.8, 1.8, -1.9, P.canopy);
  toadstool(g, v ? 46 : 22, 8.6, 1, P);
  toadstool(g, v ? 50.5 : 26.5, 9.2, 0.7, P);
  // сучок-срез на боку
  cutFace(g, v ? 24 : 40, 17, 2.4, 2.1, P);
}

/**
 * Куст с ягодами: два клуба и россыпь ягод. Его ломают рывком — поэтому он ниже и светлее деревьев, а тень
 * на земле у него в самой картинке (см. paintBases): сломали — исчезла вместе с ним.
 */
function paintBush(g, look, v) {
  const P = look.pal;
  const t = look.tone;
  const J = (list, salt) => jitterCircles(list, v * 211 + salt, v ? 1.3 : 0.3);
  spot(g, 24, 32, 19, 5.4, SHADOW, 0.5);
  oval(g, 23, 31.6, 14.5, 3.6, fade(SHADOW, 0.28));
  puff(g, J([[22, 16, 12], [12, 20, 8.5], [32, 19, 9.5], [22, 9, 7]], 1), t.near, 251 + v, { under: 0.35 });
  const front = J([[15, 23, 9.5], [28, 24, 10], [22, 18, 8.5], [7.5, 26.5, 5.6], [36, 27, 5.6]], 2);
  puff(g, front, t.bush, 252 + v, { under: 0.45 });
  const rnd = rngOf(253 + v);
  for (let i = v === 1 ? 5 : 8; i > 0; i--) {
    const c = front[Math.floor(rnd() * 3)];
    const a = rnd() * TAU;
    const d = Math.sqrt(rnd()) * c[2] * 0.74;
    const bx = c[0] + Math.cos(a) * d;
    const by = c[1] + Math.sin(a) * d;
    disc(g, bx, by, 2.5, dim(P.berry, 0.55));
    disc(g, bx, by, 1.75, P.berry);
    disc(g, bx - 0.6, by - 0.65, 0.6, lift(P.berry, 0.75));
  }
}

// ---------- картинки: стена ----------

/** Ствол в стене: стоит в тени кроны — кверху темнеет и уходит под листву. */
function paintWallTrunk(g, look, v) {
  const P = look.pal;
  const x = 14;
  const base = 49;
  if (v === 0) trunk(g, x, base, 50, 13, P, 301, { shade: 30 });
  else if (v === 1) trunk(g, x, base, 50, 8.5, P, 302, { shade: 30, lean: 2.5, flare: 2.4 });
  else if (v === 2) trunk(g, x, base, 50, 7.5, P, 303, { color: P.birch, dark: P.birchShade, marks: P.birchMark, flare: 1.6, lean: -2, taper: 0.32, shade: 32 });
  else {
    trunk(g, x, base, 50, 10.5, P, 304, { color: mix(P.trunk, P.trunkDark, 0.35), shade: 30, lean: -1.5 });
    fern(g, x + 7, base + 1, 7, look.tone.far.base, look.tone.mid.base, rngOf(305));
  }
}

/**
 * Крона над верхней стеной: три ряда клубов — дальний тёмный, средний и ближний с зубчатым низом в тени.
 * Низ ближнего ряда висит над землёй: под ним видны стволы.
 */
function paintWallTop(g, look, v) {
  const t = look.tone;
  const J = (list, salt) => jitterCircles(list, v * 97 + salt, 1.6);
  puff(g, J([[18, 23, 13], [38, 19, 15], [60, 18, 16], [82, 20, 15], [100, 24, 13], [49, 25, 13], [72, 26, 13]], 1), t.far, 311 + v, { light: 0.3 });
  puff(g, J([[14, 33, 11], [32, 29, 15], [56, 27, 17], [80, 29, 16], [101, 33, 12], [44, 35, 12], [68, 36, 12]], 2), t.mid, 312 + v, { under: 0.3 });
  puff(g, J([[11, 43, 8], [24, 43, 12], [42, 44, 12.5], [60, 43, 13.5], [78, 44, 12.5], [94, 43, 12], [106, 43, 8], [33, 49, 7], [51, 50, 7.5], [69, 50, 7.5], [86, 49, 7]], 3), t.near, 313 + v, { under: 0.72, light: 0.34 });
  // макушки на свету — у каждого варианта в своих местах: ряд одинаковых крон не выглядит узором
  const lit = [[[30, 36, 10], [64, 34, 10.5]], [[45, 35, 11], [88, 37, 9]], [[21, 37, 8.5], [56, 33, 9.5], [90, 36, 8.5]]][v % 3];
  lit.forEach(([x, y, r], k) => {
    puff(g, J([[x, y, r], [x - r * 0.82, y + r * 0.3, r * 0.65], [x + r * 0.8, y - r * 0.3, r * 0.68]], 4 + k), t.lit, 314 + v * 3 + k, { dark: 0.3, marks: 4 });
  });
}

/** То же, но узкое: для стены в одну-две клетки (островок чащи посреди комнаты). */
function paintWallCap(g, look, v) {
  const t = look.tone;
  const J = (list, salt) => jitterCircles(list, v * 71 + salt, 1.5);
  puff(g, J([[26, 25, 13], [42, 21, 15], [57, 26, 12], [40, 31, 12]], 1), t.far, 331 + v, { light: 0.3 });
  puff(g, J([[20, 35, 11], [36, 31, 14], [54, 33, 13], [64, 37, 9], [44, 38, 11]], 2), t.mid, 332 + v, { under: 0.3 });
  puff(g, J([[14, 44, 8], [26, 44, 11.5], [41, 45, 12.5], [56, 44, 11.5], [67, 44, 8], [33, 50, 7], [49, 50, 7]], 3), t.near, 333 + v, { under: 0.72, light: 0.34 });
  puff(g, J([[32, 37, 9.5], [25, 40, 6], [39, 34, 6.5]], 4), t.lit, 334 + v, { dark: 0.3, marks: 4 });
}

/** Клуб кроны сверху: боковые и нижняя стены. Нависает над полом — под него заходят. */
function paintWallSide(g, look, v) {
  const t = look.tone;
  const J = (list, salt) => jitterCircles(list, v * 59 + salt, 2);
  puff(g, J([[38, 33, 21], [22, 36, 14], [54, 35, 15], [38, 47, 13], [27, 22, 12], [49, 21, 12]], 1), t.mid, 321 + v, { under: 0.36 });
  puff(g, J([[32, 28, 15], [21, 31, 9.5], [42, 24, 10], [31, 17, 9]], 2), t.near, 322 + v, { dark: 0.4 });
  puff(g, J([[28, 23, 9.5], [21, 26, 6], [34, 19, 6.5]], 3), t.lit, 323 + v, { dark: 0.28, marks: 4 });
}

// ---------- картинки: двери ----------

/**
 * Заросль ежевики в прямоугольнике: тёмная листва сплошь, поверх — плети с шипами, листья и ягоды.
 * Закрытая дверь должна читаться сразу: не пройти.
 */
function bramble(g, x0, y0, x1, y1, seed, look) {
  const P = look.pal;
  const t = look.tone;
  const rnd = rngOf(seed);
  const w = x1 - x0;
  const h = y1 - y0;
  // листва: клубы по сетке, сверху вниз
  const rows = Math.max(2, Math.round(h / 15));
  const cols = Math.max(2, Math.round(w / 15));
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const cx = x0 + ((i + 0.5 + (rnd() - 0.5) * 0.5) / cols) * w;
      const cy = y0 + ((j + 0.5 + (rnd() - 0.5) * 0.4) / rows) * h;
      puff(g, clump(cx, cy, Math.max(w / cols, h / rows) * 0.66, seed + j * 16 + i), (i + j) % 3 ? t.far : t.mid, seed + i, { lw: 1.4, marks: 2, light: 0.3 });
    }
  }
  // плети: дуги от края к краю
  const n = Math.round((w + h) / 14);
  for (let i = 0; i < n; i++) {
    const side = rnd() < w / (w + h);
    const ax = side ? x0 + rnd() * w : x0 + 2;
    const ay = side ? y0 + 2 : y0 + rnd() * h;
    const bx = side ? x0 + rnd() * w : x1 - 2;
    const by = side ? y1 - 2 : y0 + rnd() * h;
    const mx = (ax + bx) / 2 + (rnd() - 0.5) * w * 0.5;
    const my = (ay + by) / 2 + (rnd() - 0.5) * h * 0.5;
    limb(g, [ax, ay, mx, my, bx, by], 2.2, P.thorn, dim(P.thorn, 0.55), 1);
    const len = Math.hypot(bx - ax, by - ay);
    const steps = Math.max(3, Math.round(len / 7));
    for (let k = 0; k < steps; k++) {
      const tt = (k + 0.5) / steps;
      const u = 1 - tt;
      const px = u * u * ax + 2 * u * tt * mx + tt * tt * bx;
      const py = u * u * ay + 2 * u * tt * my + tt * tt * by;
      let dx = 2 * u * (mx - ax) + 2 * tt * (bx - mx);
      let dy = 2 * u * (my - ay) + 2 * tt * (by - my);
      const d = Math.hypot(dx, dy) || 1;
      dx /= d;
      dy /= d;
      const out = k % 2 ? 1 : -1;
      g.fillStyle = P.thornTip;
      g.strokeStyle = dim(P.thorn, 0.5);
      g.lineWidth = 0.7;
      g.beginPath();
      g.moveTo(px - dx * 1.6, py - dy * 1.6);
      g.lineTo(px + dx * 0.7 - dy * out * 4.6, py + dy * 0.7 + dx * out * 4.6);
      g.lineTo(px + dx * 1.6, py + dy * 1.6);
      g.closePath();
      g.fill();
      g.stroke();
    }
  }
  for (let i = Math.round((w * h) / 150); i > 0; i--) {
    const lx = x0 + 3 + rnd() * (w - 6);
    const ly = y0 + 3 + rnd() * (h - 6);
    const a = rnd() * TAU;
    leaf(g, lx, ly, 6.4, 2.6, a, dim(t.near.base, 0.5));
    leaf(g, lx + Math.cos(a) * 0.6, ly + Math.sin(a) * 0.6, 5.2, 1.9, a, rnd() < 0.25 ? P.thornLeaf : rnd() < 0.5 ? t.near.base : t.lit.base);
  }
  for (let i = Math.round((w * h) / 260); i > 0; i--) {
    const bx = x0 + 4 + rnd() * (w - 8);
    const by = y0 + 4 + rnd() * (h - 8);
    const color = rnd() < 0.7 ? P.berry : P.berryDark;
    disc(g, bx, by, 2.5, dim(color, 0.55));
    disc(g, bx, by, 1.8, color);
    disc(g, bx - 0.6, by - 0.6, 0.6, lift(color, 0.7));
  }
}

/** Гирлянда листвы вдоль линии: ветка и клубы на ней. pts — плоский список узлов. */
function garland(g, pts, look, seed, r = 10) {
  const P = look.pal;
  const t = look.tone;
  limb(g, pts, 4, P.trunk, dim(P.trunk), 1.3);
  const rnd = rngOf(seed);
  for (let i = 0; i + 1 < pts.length; i += 2) {
    const tone = i % 4 ? t.near : t.mid;
    puff(g, clump(pts[i], pts[i + 1], r * (0.85 + rnd() * 0.3), seed + i), tone, seed + i, { under: 0.3, marks: 3 });
  }
  for (let i = 2; i + 1 < pts.length; i += 4) puff(g, clump(pts[i] - 2, pts[i + 1] - 3, r * 0.55, seed + 40 + i), t.lit, seed + i, { dark: 0.3, marks: 2 });
}

/**
 * Дверь верхней стены: два ствола по краям проёма, их ветки сходятся аркой, на арке листва и свисающие плети.
 * Закрытая — проём зарос ежевикой. Рамка 140×87: проём — от 22 до 118, земля — на 81. Арка невысокая — её
 * листва не поднимается выше полей фона.
 */
function paintDoorNorth(g, look, v) {
  const P = look.pal;
  const t = look.tone;
  const base = 81;
  const A = 7;                         // на сколько арка ниже верха рамки
  if (v) bramble(g, 26, 40, 114, base - 4, 401, look);
  trunk(g, 19, base, 51, 11, P, 402, { lean: 5, shade: 16 });
  trunk(g, 121, base, 51, 11, P, 403, { lean: -5, shade: 16, color: mix(P.trunk, P.trunkDark, 0.25) });
  limb(g, [23, A + 30, 30, A + 16, 48, A + 9, 70, A + 8], 5, P.trunk, dim(P.trunk), 1.4);
  limb(g, [117, A + 30, 110, A + 16, 92, A + 9, 70, A + 8], 5, mix(P.trunk, P.trunkDark, 0.3), dim(P.trunk), 1.4);
  // плети с листьями свисают с арки
  const rnd = rngOf(404);
  for (const [vx, len] of [[40, 15], [58, 9], [84, 12], [101, 17]]) {
    const top = A + 12 + Math.abs(vx - 70) * 0.12;
    g.strokeStyle = dim(P.canopy, 0.45);
    g.lineWidth = 1.2;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(vx, top);
    g.quadraticCurveTo(vx + 2, top + len * 0.5, vx - 1, top + len);
    g.stroke();
    for (let k = 1; k <= 3; k++) leaf(g, vx + (k % 2 ? 1 : -1), top + (len * k) / 3, 4.6, 1.8, k % 2 ? 0.5 : Math.PI - 0.5, rnd() < 0.5 ? P.canopy : P.canopyLight);
  }
  const up = (list) => list.map(([x, y, r]) => [x, y + A, r]);
  puff(g, up([[17, 26, 13], [8, 30, 8], [27, 20, 10], [14, 15, 9]]), t.mid, 405, { under: 0.4 });
  puff(g, up([[123, 26, 13], [132, 30, 8], [113, 20, 10], [126, 15, 9]]), t.mid, 406, { under: 0.5, light: 0.3 });
  puff(g, up([[44, 11, 11], [34, 15, 8], [54, 8, 8.5]]), t.near, 407, { under: 0.4 });
  puff(g, up([[96, 11, 11], [106, 15, 8], [86, 8, 8.5]]), t.near, 408, { under: 0.45 });
  puff(g, up([[70, 8, 12], [60, 10, 8], [80, 10, 8], [70, 2.5, 7]]), t.near, 409, { under: 0.4 });
  puff(g, up([[22, 19, 8.5], [16, 22, 5.5], [28, 15, 6]]), t.lit, 410, { dark: 0.3, marks: 3 });
  puff(g, up([[66, 5, 7.5], [59, 7, 5], [72, 3, 5]]), t.lit, 411, { dark: 0.3, marks: 3 });
}

/**
 * Дверь нижней стены, вид сверху: клубы по краям проёма и гирлянда, прогнувшаяся к нам, — тропа ныряет под неё.
 * Рамка 160×90 (рисунок сдвинут на 6 и 5): пол кончается на 13, проём — клетки от 13 до 45 по высоте и
 * от 32 до 128 по ширине.
 */
function paintDoorSouth(g, look, v) {
  const t = look.tone;
  g.save();
  g.translate(6, 5);
  if (v) bramble(g, 27, 6, 121, 44, 421, look);
  const pts = [];
  for (let i = 0; i <= 8; i++) {
    const u = i / 8;
    pts.push(26 + u * 96, 46 + 25 * (1 - (2 * u - 1) ** 2));
  }
  garland(g, pts, look, 422, 10.5);
  puff(g, [[16, 36, 19], [5, 42, 10], [27, 46, 11], [15, 22, 12], [28, 28, 9]], t.mid, 423, { under: 0.35 });
  puff(g, [[132, 36, 19], [143, 42, 10], [121, 46, 11], [133, 22, 12], [120, 28, 9]], t.mid, 424, { under: 0.45, light: 0.3 });
  puff(g, [[13, 30, 12], [6, 33, 7], [20, 25, 8]], t.near, 425, { dark: 0.4 });
  puff(g, [[129, 30, 12], [122, 33, 7], [136, 25, 8]], t.near, 426, { dark: 0.45 });
  puff(g, [[10, 26, 7.5], [5, 28, 4.5], [15, 23, 5]], t.lit, 427, { dark: 0.3, marks: 3 });
  puff(g, [[126, 26, 7.5], [121, 28, 4.5], [131, 23, 5]], t.lit, 428, { dark: 0.3, marks: 3 });
  g.restore();
}

/**
 * Дверь боковой стены, вид сверху: клубы над и под проёмом, гирлянда выгнута наружу. Рамка 92×156 (рисунок
 * сдвинут на 3 вниз); у левой двери стена — от 48 до 80 по ширине, проём — от 30 до 126 по высоте.
 * Правая — её отражение (flip), но свет остаётся слева сверху.
 */
function paintDoorSide(g, look, v, flip) {
  const t = look.tone;
  const X = (x) => (flip ? 92 - x : x);
  g.save();
  g.translate(0, 3);
  if (v) bramble(g, flip ? 10 : 44, 28, flip ? 48 : 82, 122, flip ? 441 : 431, look);
  const pts = [];
  for (let i = 0; i <= 8; i++) {
    const u = i / 8;
    pts.push(X(60 - 44 * (1 - (2 * u - 1) ** 2)), 27 + u * 96);
  }
  garland(g, pts, look, flip ? 442 : 432, 10.5);
  const C = (list) => list.map(([x, y, r]) => [X(x), y, r]);
  puff(g, C([[58, 19, 18], [44, 22, 11], [70, 24, 11], [58, 8, 10], [47, 12, 9]]), t.mid, 433, { under: 0.4 });
  puff(g, C([[58, 131, 18], [44, 128, 11], [70, 126, 11], [58, 142, 9], [47, 138, 9]]), t.mid, 434, { under: 0.4 });
  puff(g, [[X(58) - 4, 15, 11.5], [X(58) - 11, 18, 7], [X(58) + 3, 10, 7.5]], t.near, 435, { dark: 0.4 });
  puff(g, [[X(58) - 4, 127, 11.5], [X(58) - 11, 130, 7], [X(58) + 3, 122, 7.5]], t.near, 436, { dark: 0.4 });
  puff(g, [[X(58) - 7, 11, 7], [X(58) - 12, 13, 4.5], [X(58) - 2, 8, 4.5]], t.lit, 437, { dark: 0.3, marks: 3 });
  puff(g, [[X(58) - 7, 123, 7], [X(58) - 12, 125, 4.5], [X(58) - 2, 120, 4.5]], t.lit, 438, { dark: 0.3, marks: 3 });
  g.restore();
}

// ---------- вещи: сундук, камень торговца, портал, пень задания, мишень, указатель ----------
// Общие для всех мест, поэтому краски — леса: дерево, камень, мох. Тени на земле — забота рендера.

const WOOD = '#b07a44';
const BRASS = '#e6bc4e';
const GLOW = '#fff0a8';

/** Блёстка: четырёхлучевая звёздочка. */
function sparkle(g, x, y, r, color) {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x, y - r);
  g.quadraticCurveTo(x + r * 0.16, y - r * 0.16, x + r, y);
  g.quadraticCurveTo(x + r * 0.16, y + r * 0.16, x, y + r);
  g.quadraticCurveTo(x - r * 0.16, y + r * 0.16, x - r, y);
  g.quadraticCurveTo(x - r * 0.16, y - r * 0.16, x, y - r);
  g.fill();
}

/** Доски: тёмные швы поперёк рамки. */
function planks(c, x0, y0, x1, y1, n, color) {
  c.strokeStyle = fade(color, 0.55);
  c.lineWidth = 0.9;
  for (let i = 1; i < n; i++) {
    const y = y0 + ((y1 - y0) * i) / n;
    c.beginPath();
    c.moveTo(x0, y);
    c.lineTo(x1, y);
    c.stroke();
  }
}

/** Сундук: 0 — закрыт (из-под крышки пробивается свет), 1 — открыт (крышка откинута, внутри сияет). */
function paintChest(g, v) {
  const line = dim(WOOD, 0.66);
  const band = (c, x, y0, y1) => {
    c.fillStyle = BRASS;
    c.fillRect(x - 2.2, y0, 4.4, y1 - y0);
    c.fillStyle = fade(lift(BRASS, 0.7), 0.8);
    c.fillRect(x - 2.2, y0, 1.3, y1 - y0);
    c.fillStyle = fade(dim(BRASS, 0.45), 0.7);
    c.fillRect(x + 1.2, y0, 1, y1 - y0);
  };
  if (v) {
    // откинутая крышка — позади
    const lid = (c) => {
      c.moveTo(5.5, 13);
      c.quadraticCurveTo(5, 2.5, 18, 2);
      c.quadraticCurveTo(31, 2.5, 30.5, 13);
      c.closePath();
    };
    solid(g, lid, 18, 8, 13, 6, mix(WOOD, INK, 0.2), { line, inside: (c) => { band(c, 10, 0, 14); band(c, 26, 0, 14); } });
    spot(g, 18, 12, 19, 13, GLOW, 0.75);
  }
  const body = (c) => {
    c.moveTo(4, 16.5);
    c.lineTo(32, 16.5);
    c.lineTo(31, 28.5);
    c.quadraticCurveTo(31, 30.2, 29, 30.2);
    c.lineTo(7, 30.2);
    c.quadraticCurveTo(5, 30.2, 5, 28.5);
    c.closePath();
  };
  solid(g, body, 18, 23.5, 14, 7, WOOD, {
    line, light: 0.35, dark: 0.5,
    inside: (c) => {
      planks(c, 4, 16.5, 32, 30, 3, line);
      band(c, 10, 15, 31);
      band(c, 26, 15, 31);
    },
  });
  if (v) {
    // нутро: тёмный проём, золото и свет
    const mouth = (c) => {
      c.moveTo(4.6, 16.5);
      c.quadraticCurveTo(18, 9, 31.4, 16.5);
      c.quadraticCurveTo(18, 19.6, 4.6, 16.5);
      c.closePath();
    };
    solid(g, mouth, 18, 15, 13, 4, mix(WOOD, INK, 0.62), { line, light: 0, dark: 0.2, rim: 0, inside: (c) => {
      spot(c, 18, 16.5, 13, 5, GLOW, 0.95);
      for (const [x, y] of [[12, 16.4], [17, 15.4], [22, 16.6], [26, 16]]) {
        oval(c, x, y, 2.3, 1.5, dim(BRASS, 0.3));
        oval(c, x, y - 0.5, 2.1, 1.3, BRASS);
      }
    } });
    sparkle(g, 9, 8.5, 2.8, '#ffffff');
    sparkle(g, 27, 6, 2.2, GLOW);
    sparkle(g, 19, 3.8, 1.7, '#ffffff');
  } else {
    const lid = (c) => {
      c.moveTo(3.4, 17);
      c.quadraticCurveTo(3, 6, 18, 5.6);
      c.quadraticCurveTo(33, 6, 32.6, 17);
      c.closePath();
    };
    solid(g, lid, 18, 11.5, 14.5, 6, lift(WOOD, 0.08), {
      line, light: 0.5, dark: 0.4,
      inside: (c) => {
        planks(c, 3, 5, 33, 17, 3, line);
        band(c, 10, 4, 18);
        band(c, 26, 4, 18);
      },
    });
    // щель света под крышкой
    spot(g, 18, 17, 15, 3.4, GLOW, 0.7);
    g.strokeStyle = GLOW;
    g.lineWidth = 1.1;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(6, 17);
    g.lineTo(30, 17);
    g.stroke();
    // замок
    const lock = (c) => {
      c.moveTo(14.6, 14.4);
      c.lineTo(21.4, 14.4);
      c.lineTo(21.4, 20);
      c.quadraticCurveTo(18, 23, 14.6, 20);
      c.closePath();
    };
    solid(g, lock, 18, 18, 3.4, 4, BRASS, { lw: 1.3, line: dim(BRASS, 0.6) });
    disc(g, 18, 17.6, 1.05, dim(BRASS, 0.75));
    g.fillStyle = dim(BRASS, 0.75);
    g.fillRect(17.5, 17.6, 1, 2.4);
  }
}

/** Плоский замшелый камень под товар торговца. */
function paintPedestal(g) {
  const P = FOREST;
  const side = (c) => {
    c.moveTo(3, 8);
    c.quadraticCurveTo(3, 14.6, 17, 15.6);
    c.quadraticCurveTo(31, 14.6, 31, 8);
    c.closePath();
  };
  solid(g, side, 17, 11, 14, 5, P.rockDark, { line: dim(P.rock, 0.66), light: 0.2, dark: 0.5 });
  const top = (c) => c.ellipse(17, 7.6, 14, 5.4, 0, 0, TAU);
  solid(g, top, 17, 7.6, 14, 5.4, mix(P.rock, P.rockLight, 0.45), {
    line: dim(P.rock, 0.66), light: 0.5, dark: 0.3,
    inside: (c) => {
      c.strokeStyle = fade(dim(P.rock, 0.5), 0.5);
      c.lineWidth = 0.8;
      c.beginPath();
      c.moveTo(20, 4.4);
      c.lineTo(22.5, 7.4);
      c.lineTo(21.4, 10);
      c.stroke();
      c.fillStyle = P.moss;
      c.beginPath();
      blob(c, 8, 6.4, 6.4, 2.8, 501, 0.2, 8);
      c.fill();
      spot(c, 7, 5.6, 4, 1.6, lift(P.moss, 0.5), 0.8);
    },
  });
  oval(g, 26.4, 13.2, 3.2, 1.3, P.moss);
  flower(g, 28.6, 12, P.flowers[0], P, 0.7);
}

/**
 * Портал в следующее место: старое дуплистое дерево-арка, в проёме мягко светится. Свечение — внутри проёма и
 * отсветом на коре; рендер может добавить поверх своё мерцание.
 */
function paintPortal(g) {
  const P = FOREST;
  const t = BIOME_LOOK.forest.tone;
  const x = 36;
  const base = 84;
  g.save();
  g.translate(0, 4);
  puff(g, [[36, 17, 16], [21, 22, 12], [51, 22, 12], [36, 7, 9.5], [27, 11, 9], [45, 11, 9]], t.mid, 511, { under: 0.4 });
  const tree = (c) => {
    c.moveTo(x - 28, base + 1.5);
    c.quadraticCurveTo(x - 19, base - 6, x - 19.5, base - 30);
    c.quadraticCurveTo(x - 20, base - 52, x - 13, base - 62);
    c.lineTo(x + 13, base - 62);
    c.quadraticCurveTo(x + 20, base - 52, x + 19.5, base - 30);
    c.quadraticCurveTo(x + 19, base - 6, x + 28, base + 1.5);
    c.quadraticCurveTo(x + 16, base + 3.6, x + 12, base + 0.5);
    c.lineTo(x - 12, base + 0.5);
    c.quadraticCurveTo(x - 16, base + 3.6, x - 28, base + 1.5);
    c.closePath();
  };
  const arch = (c) => {
    c.moveTo(x - 11.5, base + 0.6);
    c.lineTo(x - 11.5, base - 30);
    c.bezierCurveTo(x - 11.5, base - 49, x + 11.5, base - 49, x + 11.5, base - 30);
    c.lineTo(x + 11.5, base + 0.6);
    c.closePath();
  };
  solid(g, tree, x, base - 30, 22, 32, P.trunk, {
    light: 0.3, dark: 0.3,
    inside: (c) => {
      const grad = c.createLinearGradient(x - 22, 0, x + 22, 0);
      grad.addColorStop(0, fade(lift(P.trunk, 0.5), 0.5));
      grad.addColorStop(0.4, fade(P.trunk, 0));
      grad.addColorStop(1, fade(P.trunkDark, 0.9));
      c.fillStyle = grad;
      c.fillRect(x - 30, base - 64, 60, 70);
      const rnd = rngOf(512);
      c.strokeStyle = fade(P.trunkDark, 0.6);
      c.lineWidth = 1;
      c.lineCap = 'round';
      for (let i = 0; i < 16; i++) {
        const bx = x + (i % 2 ? 1 : -1) * (13.5 + rnd() * 5);
        const by = base - 58 + rnd() * 52;
        c.beginPath();
        c.moveTo(bx, by);
        c.lineTo(bx + (rnd() - 0.5) * 1.5, by + 4 + rnd() * 5);
        c.stroke();
      }
      // отсвет проёма на коре
      c.strokeStyle = fade(GLOW, 0.5);
      c.lineWidth = 5;
      c.beginPath();
      arch(c);
      c.stroke();
    },
  });
  // проём: свет, к краям — зеленее и темнее
  g.save();
  g.beginPath();
  arch(g);
  g.clip();
  const grad = g.createRadialGradient(x, base - 22, 1, x, base - 22, 30);
  grad.addColorStop(0, '#fffde8');
  grad.addColorStop(0.3, '#d9fbd0');
  grad.addColorStop(0.62, '#7fdcae');
  grad.addColorStop(1, '#2f9a86');
  g.fillStyle = grad;
  g.fillRect(x - 13, base - 46, 26, 48);
  const rnd = rngOf(513);
  for (let i = 0; i < 9; i++) sparkle(g, x - 8 + rnd() * 16, base - 40 + rnd() * 36, 1 + rnd() * 1.6, fade('#ffffff', 0.9));
  g.restore();
  g.strokeStyle = dim(P.trunk, 0.66);
  g.lineWidth = 1.6;
  g.lineJoin = 'round';
  g.beginPath();
  arch(g);
  g.stroke();
  spot(g, x, base + 1, 15, 4, GLOW, 0.5);
  puff(g, [[25, 24, 9.5], [17, 27, 6], [32, 20, 6.5]], t.near, 514, { dark: 0.4, marks: 3 });
  puff(g, [[50, 25, 8.5], [57, 28, 5.5], [44, 21, 6]], t.near, 515, { dark: 0.5, marks: 3, light: 0.3 });
  puff(g, [[31, 12, 8], [24, 15, 5], [37, 9, 5.5]], t.lit, 516, { dark: 0.3, marks: 3 });
  limb(g, [x - 19, base - 40, x - 26, base - 46, x - 30, base - 53], 3, P.trunk, dim(P.trunk), 1.3);
  leaf(g, x - 30, base - 53, 6, 2.3, -2.2, P.canopyLight);
  leaf(g, x - 29.4, base - 52, 5.4, 2.1, -0.7, P.canopy);
  g.restore();
}

/** Пень задания (ломается рывком): 0 — целый, с красной лентой; 1 — разбит в щепки. */
function paintTaskStump(g, v) {
  const P = FOREST;
  const x = 19;
  const base = 31;
  const bark = mix(P.trunk, P.stump, 0.55);
  const line = dim(bark, 0.64);
  const grain = (c, top) => {
    const grad = c.createLinearGradient(x - 12, 0, x + 13, 0);
    grad.addColorStop(0, fade(lift(bark, 0.5), 0.5));
    grad.addColorStop(0.4, fade(bark, 0));
    grad.addColorStop(1, fade(P.trunkDark, 0.85));
    c.fillStyle = grad;
    c.fillRect(x - 18, top - 8, 36, 40);
  };
  if (v) {
    // обломок: рваный верх, щепки вокруг
    const stub = (c) => {
      c.moveTo(x - 15, base + 1);
      c.quadraticCurveTo(x - 11, base - 1.5, x - 11, base - 7);
      c.lineTo(x - 7.5, base - 13);
      c.lineTo(x - 5, base - 8);
      c.lineTo(x - 1, base - 15.5);
      c.lineTo(x + 2.5, base - 8.5);
      c.lineTo(x + 6.5, base - 12.5);
      c.lineTo(x + 11, base - 6);
      c.quadraticCurveTo(x + 11, base - 1.5, x + 15.5, base + 1);
      c.quadraticCurveTo(x, base + 4, x - 15, base + 1);
      c.closePath();
    };
    solid(g, stub, x, base - 6, 13, 8, bark, { line, inside: (c) => {
      grain(c, base - 14);
      c.fillStyle = fade(lift(P.stump, 0.5), 0.9);
      c.beginPath();
      c.moveTo(x - 10, base - 7.5);
      c.lineTo(x - 7.5, base - 12.4);
      c.lineTo(x - 5, base - 7.4);
      c.lineTo(x - 1, base - 14.6);
      c.lineTo(x + 2.5, base - 7.8);
      c.lineTo(x + 6.5, base - 11.6);
      c.lineTo(x + 10.4, base - 6);
      c.lineTo(x + 6, base - 4.6);
      c.lineTo(x - 6, base - 4.6);
      c.closePath();
      c.fill();
    } });
    for (const [sx, sy, a, len] of [[5, 25, -0.5, 7], [33, 27, 0.4, 6.5], [8, 31, 0.2, 5], [29, 18, -1, 6], [3, 18, 0.9, 5]]) {
      g.save();
      g.translate(sx, sy);
      g.rotate(a);
      g.fillStyle = line;
      g.fillRect(-len / 2 - 0.8, -1.9, len + 1.6, 3.8);
      g.fillStyle = lift(P.stump, 0.35);
      g.fillRect(-len / 2, -1.1, len, 2.2);
      g.restore();
    }
    limb(g, [24, 30.5, 28, 32.5, 33, 31.6], 2.2, P.berry, dim(P.berry, 0.55), 1);
    return;
  }
  const top = 11;
  const side = (c) => {
    c.moveTo(x - 16, base + 1);
    c.quadraticCurveTo(x - 11.5, base - 1.5, x - 11.5, top);
    c.lineTo(x + 11.5, top);
    c.quadraticCurveTo(x + 11.5, base - 1.5, x + 16.5, base + 1);
    c.quadraticCurveTo(x + 6, base + 3.6, x + 2, base + 1);
    c.quadraticCurveTo(x - 4, base + 3.8, x - 16, base + 1);
    c.closePath();
  };
  solid(g, side, x, (top + base) / 2, 14, 10, bark, { line, inside: (c) => {
    grain(c, top);
    // лента
    c.fillStyle = P.berry;
    c.fillRect(x - 13, top + 7, 26, 4.6);
    c.fillStyle = fade(lift(P.berry, 0.6), 0.7);
    c.fillRect(x - 13, top + 7, 8, 4.6);
    c.fillStyle = fade(dim(P.berry, 0.5), 0.6);
    c.fillRect(x + 6, top + 7, 7, 4.6);
    c.strokeStyle = dim(P.berry, 0.6);
    c.lineWidth = 1;
    c.strokeRect(x - 13, top + 7, 26, 4.6);
  } });
  cutFace(g, x, top, 11.5, 5, P);
  // бант
  for (const dir of [-1, 1]) {
    const bow = (c) => {
      c.moveTo(x + 5, top + 9.4);
      c.quadraticCurveTo(x + 5 + dir * 5, top + 4.6, x + 5 + dir * 6.4, top + 9);
      c.quadraticCurveTo(x + 5 + dir * 5, top + 13.6, x + 5, top + 9.4);
      c.closePath();
    };
    solid(g, bow, x + 5 + dir * 3.6, top + 9.2, 3, 3.6, P.berry, { lw: 1.1, line: dim(P.berry, 0.6) });
  }
  disc(g, x + 5, top + 9.4, 1.9, dim(P.berry, 0.6));
  disc(g, x + 5, top + 9.4, 1.2, lift(P.berry, 0.3));
}

/** Соломенная мишень на колышке. */
function paintTarget(g) {
  const P = FOREST;
  const straw = P.straw;
  limb(g, [15, 41, 15.4, 30, 15, 22], 3, P.trunk, dim(P.trunk), 1.3);
  const rnd = rngOf(521);
  g.lineCap = 'round';
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * TAU + rnd() * 0.2;
    g.strokeStyle = i % 2 ? dim(straw, 0.4) : straw;
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(15 + Math.cos(a) * 11, 14.5 + Math.sin(a) * 11);
    g.lineTo(15 + Math.cos(a) * (13.4 + rnd() * 1.6), 14.5 + Math.sin(a) * (13.4 + rnd() * 1.6));
    g.stroke();
  }
  solid(g, (c) => c.arc(15, 14.5, 12, 0, TAU), 15, 14.5, 12, 12, straw, {
    line: dim(straw, 0.62), light: 0.4, dark: 0.5,
    inside: (c) => {
      disc(c, 15, 14.5, 9.2, P.berry);
      disc(c, 15, 14.5, 6.2, '#fff6e6');
      disc(c, 15, 14.5, 3.2, P.berry);
      c.strokeStyle = fade(dim(straw, 0.5), 0.45);
      c.lineWidth = 0.8;
      for (const r of [10.6, 7.7, 4.7]) {
        c.beginPath();
        c.arc(15, 14.5, r, 0, TAU);
        c.stroke();
      }
    },
  });
}

/** Указатель: дощечка на столбике, на ней вырезан след лапы. */
function paintSign(g) {
  const P = FOREST;
  limb(g, [15, 31, 15.3, 22, 15, 13], 3.2, P.trunk, dim(P.trunk), 1.3);
  g.save();
  g.translate(15, 11);
  g.rotate(-0.07);
  const board = (c) => {
    c.moveTo(-12, -6);
    c.lineTo(10, -6);
    c.lineTo(13.5, -0.4);
    c.lineTo(10, 5.6);
    c.lineTo(-12, 5.6);
    c.closePath();
  };
  solid(g, board, 0, 0, 12.5, 6, lift(WOOD, 0.22), { line: dim(WOOD, 0.66), light: 0.4, dark: 0.35, inside: (c) => planks(c, -12, -6, 13, 5.6, 2, dim(WOOD, 0.6)) });
  pawPrint(g, -1, 0.6, 0.15, dim(WOOD, 0.62));
  disc(g, -9.6, -3.6, 0.8, dim(WOOD, 0.7));
  disc(g, -9.6, 3.2, 0.8, dim(WOOD, 0.7));
  g.restore();
  tuft(g, 11, 31, 5, P, rngOf(531));
  tuft(g, 19.5, 31.4, 4.4, P, rngOf(532));
}

defineSprite('thing.chest', { w: 36, h: 34, ox: 18, oy: 30, variants: 2, pad: 2, paint: paintChest });
defineSprite('thing.pedestal', { w: 34, h: 20, ox: 17, oy: 15, pad: 2, paint: paintPedestal });
defineSprite('thing.portal', { w: 72, h: 94, ox: 36, oy: 88, pad: 2, paint: paintPortal });
defineSprite('thing.stump', { w: 38, h: 36, ox: 19, oy: 31, variants: 2, pad: 2, paint: paintTaskStump });
defineSprite('thing.target', { w: 30, h: 44, ox: 15, oy: 41, pad: 2, paint: paintTarget });
defineSprite('thing.sign', { w: 30, h: 34, ox: 15, oy: 31, pad: 2, paint: paintSign });

// ---------- места ----------

// Краски леса: первые строки — из общей палитры игры, ниже — свои добавки (свет, берег, нора, колючки, берёза…).
const FOREST = {
  ground: '#7cc45a', groundLight: '#9ad96f', groundDark: '#5ea646', groundDeep: '#3f8238',
  flowers: ['#fff3a0', '#ff9fb5', '#ffffff'],
  path: '#c9a56b', pathDark: '#a9844f',
  trunk: '#8a5a34', trunkDark: '#5e3a20',
  canopy: '#3f9a45', canopyLight: '#6cc45a', canopyDark: '#2b7238', canopyDeep: '#1d5230',
  stump: '#b98a56', rock: '#9aa3ad', rockDark: '#6d7783', rockLight: '#c6ced6',
  bush: '#4fae4c', berry: '#e4473c',
  water: '#4aa8d8', waterDeep: '#2f86bd', shine: '#bfe9ff',

  under: mix('#1d5230', SHADOW, 0.5),      // земля под кронами и глубина леса
  sun: '#fff3a8', shore: '#e3d3a4', flowerCore: ['#f2b632', '#e08a2a'], seedHead: '#e9df9a',
  fallen: ['#d9c05a', '#b7a04a', '#e0a650', '#c7d26a'], toadstool: '#d8574a', moss: '#6fae4a',
  lilyPad: '#5fb04e', lily: '#f6d7e8',
  hole: '#3a2620', holeDeep: '#160e0e', cosy: '#ffb057', straw: '#e2c36a', bone: '#f3ecdc', feather: '#f1f3f6',
  thorn: '#7b4a3c', thornTip: '#f6ead0', thornLeaf: '#9a3b3b', berryDark: '#7a2a5a',
  birch: '#f1ece0', birchShade: '#9a938c', birchMark: '#4a4038', birchLeaf: '#8fd05a', fir: '#2a7a52',
};

/**
 * Виды мест. У каждого: id (он же в ключах картинок), pal — краски, tall / low — что растёт на высоких и низких
 * клетках (картинка и вес), bush — куст, рисунки земли (ground, decals, special, water, thorns) и sprites —
 * картинки места: рамка, точка привязки, варианты, рисунок и след на земле (foot — овал тени у основания,
 * crown — размах тени от кроны, sit — на сколько основание ниже середины клетки).
 * Новое место — ещё одна запись здесь: свои краски и те рисунки, что отличаются.
 */
export const BIOME_LOOK = {
  forest: {
    id: 'forest',
    pal: FOREST,
    tall: [['oak', 5], ['birch', 2.2], ['fir', 2.2], ['sapling', 1.6], ['crag', 2]],
    low: [['stump', 4], ['rock', 5], ['log', 3]],
    bush: 'bush',
    ground: paintGround,
    decals: paintDecals,
    special: paintTallGrass,
    water: paintPond,
    thorns: paintThorns,
    sprites: {
      oak: { w: 76, h: 92, ox: 38, oy: 85, variants: 2, paint: paintOak, foot: [10, 4.4], crown: 25 },
      birch: { w: 56, h: 96, ox: 28, oy: 90, variants: 2, paint: paintBirch, foot: [6, 3], crown: 17 },
      fir: { w: 56, h: 100, ox: 28, oy: 94, variants: 2, paint: paintFir, foot: [7.5, 3.6], crown: 21 },
      sapling: { w: 40, h: 60, ox: 20, oy: 55, variants: 2, paint: paintSapling, foot: [4.6, 2.4], crown: 12 },
      crag: { w: 46, h: 60, ox: 23, oy: 55, variants: 2, paint: paintCrag, foot: [18, 5.6], crown: 16, sit: 11 },
      rock: { w: 36, h: 28, ox: 18, oy: 25, variants: 3, paint: paintRock, foot: [14, 4.6] },
      stump: { w: 34, h: 30, ox: 17, oy: 26, variants: 2, paint: paintStump, foot: [13, 4.4], sit: 8 },
      log: { w: 40, h: 26, ox: 20, oy: 22, variants: 2, paint: paintLog, foot: [15, 4.2], sit: 8 },
      biglog: { w: 72, h: 28, ox: 36, oy: 23, variants: 2, paint: paintBigLog, foot: [31, 4.6], sit: 8 },
      bush: { w: 46, h: 38, ox: 22, oy: 32, variants: 3, paint: paintBush, foot: [15, 5], sit: 10 },
      wtrunk: { w: 28, h: 52, ox: 14, oy: 49, variants: 4, paint: paintWallTrunk },
      wtop: { w: 116, h: 74, ox: 58, oy: 72, variants: 3, paint: paintWallTop },
      wcap: { w: 80, h: 74, ox: 40, oy: 72, variants: 2, paint: paintWallCap },
      wside: { w: 76, h: 66, ox: 38, oy: 62, variants: 4, paint: paintWallSide },
      door: { w: 140, h: 87, ox: 70, oy: 81, variants: 2, paint: paintDoorNorth },
      'door.s': { w: 160, h: 90, ox: 80, oy: 90, variants: 2, paint: paintDoorSouth },
      'door.w': { w: 92, h: 156, ox: 48, oy: 156, variants: 2, paint: (g, look, v) => paintDoorSide(g, look, v, false) },
      'door.e': { w: 92, h: 156, ox: 44, oy: 156, variants: 2, paint: (g, look, v) => paintDoorSide(g, look, v, true) },
    },
  },
};

/** Записать картинки места в реестр: всё из look.sprites и клетку глубокого леса. */
function registerLook(look) {
  look.tone = look.tone ?? canopyTones(look.pal);
  for (const [name, def] of Object.entries(look.sprites)) {
    defineSprite(`prop.${look.id}.${name}`, {
      w: def.w, h: def.h, ox: def.ox, oy: def.oy, variants: def.variants, pad: 2,
      paint: (g, v) => def.paint(g, look, v),
    });
  }
  // без запаса по краям: клетка кладётся встык, рисунок сам повторяется за её границей
  defineSprite(`tile.${look.id}.deep`, {
    w: DEEP, h: DEEP, ox: 0, oy: 0, pad: 0,
    paint: (g) => {
      g.fillStyle = look.pal.under;
      g.fillRect(-2, -2, DEEP + 4, DEEP + 4);
      (look.deep ?? paintDeep)(g, look, -2, -2, DEEP + 2, DEEP + 2);
    },
  });
}

for (const look of Object.values(BIOME_LOOK)) registerLook(look);

/**
 * Новое место из другого файла (болото, зима, пещеры, осень — art-tiles2.js, art-tiles3.js): запись того же вида,
 * что у леса. Чего в записи нет — берётся лесное (рисунки земли, воды, колючек; картинки, которых место не задало).
 */
export function addBiome(look) {
  const base = BIOME_LOOK.forest;
  const full = { ...base, ...look, pal: { ...base.pal, ...look.pal }, sprites: { ...base.sprites, ...look.sprites }, tone: null };
  BIOME_LOOK[full.id] = full;
  registerLook(full);
  return full;
}

// ---------- всё, у чего есть высота ----------

/**
 * Предметы комнаты для сортировки по глубине: [{ key, v, x, y, over }], (x, y) — точка привязки картинки
 * в единицах мира. over: true — листва, под которую заходят: рисуется поверх существ, в порядке списка.
 * Деревья, камни, пни, кусты — по клеткам; у стены, что смотрит на нас, — стволы и крона над ними; у боковых и
 * нижней — клубы крон; у каждой двери — рамка: вариант 0 открыта, 1 закрыта.
 */
export function propsOf(room) {
  const look = lookOf(room.biome);
  const R = scan(room);
  const id = look.id;
  const wall = R.wall;
  const out = [];
  const over = [];
  const door = (x, y) => R.at(x, y) === TILE.DOOR;
  for (let y = 0; y < R.h; y++) {
    for (let x = 0; x < R.w; x++) {
      if (!wall(x, y)) {
        const s = standing(R, look, x, y);
        if (s) out.push({ key: s.key, v: s.v, x: s.x, y: s.y, over: false });
        continue;
      }
      const x0 = x * T;
      const y0 = y * T;
      if (R.face(x, y)) {
        // стена смотрит на нас: стволы у её нижнего края и крона над ними
        const base = y0 + T;
        const n = R.rnd(x, y, 111) < 0.45 ? 2 : 1;
        for (let k = 0; k < n; k++) {
          out.push({
            key: `prop.${id}.wtrunk`, v: Math.floor(R.rnd(x, y, 112 + k) * 4),
            x: x0 + (n === 1 ? 0.3 + R.rnd(x, y, 114) * 0.4 : 0.22 + k * 0.5 + R.rnd(x, y, 115 + k) * 0.12) * T,
            y: base - 2 - R.rnd(x, y, 117 + k) * 3, over: false,
          });
        }
        // крона — сразу на весь ряд таких клеток, от его начала: короткому ряду — узкие клубы, длинному —
        // широкие, и ни один не свисает далеко за край ряда (у проёма двери — совсем чуть-чуть)
        if (R.face(x - 1, y)) continue;
        let x1 = x;
        while (R.face(x1 + 1, y)) x1 += 1;
        const len = (x1 - x + 1) * T;
        const top = (key, variants, cx, salt) => out.push({
          key: `prop.${id}.${key}`, v: Math.floor(R.rnd(salt, y, 119) * variants), x: cx, y: base - 1 + R.rnd(salt, y, 121) * 0.9, over: false,
        });
        if (len <= 2 * T) {
          for (let i = x; i <= x1; i++) top('wcap', 2, i * T + T / 2 + (R.rnd(i, y, 120) - 0.5) * 4, i);
        } else {
          const m = Math.max(1, Math.floor(len / 58));
          const lo = x0 + (door(x - 1, y) ? 54 : 44);
          const hi = x0 + len - (door(x1 + 1, y) ? 54 : 44);
          for (let i = 0; i < m; i++) {
            const cx = x0 + ((i + 0.5) * len) / m + (R.rnd(x + i, y, 120) - 0.5) * 8;
            top('wtop', 3, Math.min(hi, Math.max(lo, cx)), x + i);
          }
        }
        continue;
      }
      // остальная стена видна сверху: клуб кроны там, где рядом (хоть наискосок) есть пол
      let open = false;
      let sx = 0;
      let sy = 0;
      for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++) {
          if ((!i && !j) || wall(x + i, y + j)) continue;
          open = true;
          if (!j) sx -= i;
          if (!i) sy -= j;
        }
      }
      if (!open) continue;
      over.push({
        key: `prop.${id}.wside`, v: Math.floor(R.rnd(x, y, 123) * 4),
        x: x0 + T / 2 + sx * 5 + (R.rnd(x, y, 124) - 0.5) * 6,
        y: y0 + T / 2 + 30 + sy * 4 + (R.rnd(x, y, 125) - 0.5) * 6, over: true,
      });
    }
  }
  for (const d of R.doors) {
    const v = d.open ? 0 : 1;
    if (d.side === 'n') out.push({ key: `prop.${id}.door`, v, x: d.x, y: T - 1, over: false });
    else if (d.side === 's') over.push({ key: `prop.${id}.door.s`, v, x: d.x, y: R.H + 45, over: true });
    else if (d.side === 'w') over.push({ key: `prop.${id}.door.w`, v, x: 0, y: d.y + 78, over: true });
    else over.push({ key: `prop.${id}.door.e`, v, x: R.W, y: d.y + 78, over: true });
  }
  over.sort((a, b) => a.y - b.y);
  for (const p of over) out.push(p);
  return out;
}

// ---------- для файлов других мест ----------

// Болото, зима, пещеры и осень рисуются в своих файлах теми же приёмами и рисунками, что и лес: берут их отсюда
// и записывают своё место через addBiome().
export {
  TAU, DEEP, INK, SHADOW, WARM, parsed, rgb, mix, fade, dim, lift, hashInt, h01, rngOf, pick, weighted, spot, disc,
  oval, closedCurve, blobPoints, blob, volume, solid, circlesPath, puff, puffFlat, jitterCircles, curve, limb, leaf,
  SIDES, WALKABLE, scan, contours, organic, regionPath, paintGround, tuft, flower, pebble, toadstool, paintDecals,
  dab, paintPaths, paintTallGrass, lilyPad, reeds, paintPond, paintThorns, paintBurrows, pawPrint, paintDens,
  standing, paintBases, paintLight, canopyTones, clump, fern, DEEP_LAYERS, paintDeep, paintWalls, hasOwn, lookOf,
  trunk, paintOak, paintBirch, paintFir, paintSapling, rock, paintRock, paintCrag, cutFace, paintStump, logBody,
  paintLog, paintBigLog, paintBush, paintWallTrunk, paintWallTop, paintWallCap, paintWallSide, bramble, garland,
  paintDoorNorth, paintDoorSouth, paintDoorSide, WOOD, BRASS, GLOW, sparkle, planks, paintChest, paintPedestal,
  paintPortal, paintTaskStump, paintTarget, paintSign, FOREST,
};
