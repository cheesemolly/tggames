// Генератор уровней Арканоида: 300 своих раскладок в 10 главах по 30 уровней.
// Запуск: node tools/arkanoid-levels.mjs — перезаписывает games/arkanoid/levels.js
//         node tools/arkanoid-levels.mjs --json файл.json — ещё и раскладки списком (для листов-миниатюр);
//         node tools/arkanoid-levels.mjs --bot — ничего не пишет: бот проходит все уровни, печатает долгие и непройденные.
// Генератор детерминированный (случайность — от номера уровня): тест games/arkanoid/tests/levels.test.js сверяет
// levels.js с тем, что он выдаёт. Менять раскладку ВЫПУЩЕННОГО уровня нельзя: начатые на нём партии начнутся заново.
//
// Уровень — либо картинка (PICTURES: рисунок из кирпичей под тему главы), либо узор одного из строителей (B.*):
// стены, пирамиды, ромбы, рамки, кольца из повёрнутых кирпичей, спирали, треугольная мозаика, крепости из стали…
// После узора «наряд» (dress): часть кирпичей становится крепкими, с бонусом, взрывными — зеркально, если узор
// зеркальный. Сложность d растёт от 0 (первый уровень) до 1 (трёхсотый): больше кирпичей, крепких и стали,
// меньше бонусов. Объём уровня (сумма ударов) ограничен — уровень не должен затягиваться.

import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const COLS = 19;            // кирпичей в ряду
export const ROWS = 24;
export const X0 = 4;               // поле 616: 19 × 32 = 608, по 4 с краёв
export const Y0 = 30;
const CW = 32;
const CH = 18;
const HC = 36;                     // крайняя левая позиция кирпича в полуколонках (шаг 16) у правого края
const W = 616;
export const LEVELS_TOTAL = 300;
export const CHAPTER_SIZE = 30;
export const CHAPTER_NAMES = ['Космос', 'Океан', 'Джунгли', 'Пустыня', 'Льды', 'Вулкан', 'Неон', 'Карамель', 'Завод', 'Кристаллы'];

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$%&()*+,-./:;<=>?@[]^_{}~';
const GOOD = ['split3', 'split3', 'split8', 'slow', 'fire', 'rail', 'catch', 'laser', 'laser', 'missile', 'expand', 'expand', 'life', 'normal'];
const BAD = ['fast', 'small', 'shrink', 'bomb'];
// первые уровни знакомят с бонусами по одному-два, без вредных
const INTRO = [['split3', 'expand'], ['catch', 'split3'], ['slow', 'laser'], ['split3', 'life'], ['split8', 'expand'], ['fire', 'catch']];

// ---------- случайность ----------

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function tools(rng) {
  const int = (a, b) => a + Math.floor(rng() * (b - a + 1));
  const pick = (list) => list[Math.floor(rng() * list.length)];
  const chance = (p) => rng() < p;
  const shuffle = (list) => {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  return { rng, int, pick, chance, shuffle };
}

// ---------- раскладка ----------

const N = (t = 0, s = 'R') => ({ k: 'n', t, s, b: null });
const HARD = (s = 'R') => ({ k: 'h', t: 0, s, b: null });
const STEEL = (s = 'R') => ({ k: 'x', t: 0, s, b: null });
const BOOM = (s = 'R') => ({ k: 'e', t: 0, s, b: null });
const GIFT = (b = null, s = 'R') => ({ k: 'p', t: 0, s, b });
const BALL = () => ({ k: 't', t: 0, s: 'C', b: null });
const FLIP = { a: 'b', b: 'a', c: 'd', d: 'c' };

/** Кирпичи по сетке (позиция — в полуколонках: x = X0 + hc × 16) и свободные (повёрнутые, в единицах поля). */
class Layout {
  constructor() {
    this.cells = new Map();
    this.free = [];
    this.mirrored = false;
  }

  /** Кирпич в колонке c (0…18), ряду r (0…23). */
  set(c, r, spec) {
    this.setH(c * 2, r, spec);
  }

  setH(hc, r, spec) {
    if (hc < 0 || hc > HC || r < 0 || r >= ROWS || !Number.isInteger(hc) || !Number.isInteger(r)) return;
    this.cells.set(r * 64 + hc, { ...spec, hc, r });
  }

  get(c, r) {
    return this.cells.get(r * 64 + c * 2);
  }

  getH(hc, r) {
    return this.cells.get(r * 64 + hc);
  }

  del(c, r) {
    this.cells.delete(r * 64 + c * 2);
  }

  /** Свободный кирпич: центр (cx, cy) в единицах поля, поворот в градусах. */
  add(cx, cy, rot, spec, scale = 100) {
    const x = Math.round(cx - CW / 2);
    const y = Math.round(cy - CH / 2);
    if (x < 0 || x > W - CW || y < 0 || y > Y0 + ROWS * CH) return;
    this.free.push({ ...spec, x, y, rot: ((Math.round(rot) % 360) + 360) % 360, scale });
  }

  /** Отразить левую половину на правую (кирпичи правее середины, если были, заменяются). */
  mirror() {
    for (const cell of [...this.cells.values()]) {
      if (cell.hc >= HC / 2) continue;
      this.setH(HC - cell.hc, cell.r, { ...cell, s: FLIP[cell.s] ?? cell.s });
    }
    this.mirrored = true;
  }

  count() {
    return this.cells.size + this.free.length;
  }

  /**
   * Поставить узор по высоте: его середина — около ряда mid (над узором остаётся место, куда шарик может залететь).
   * Узоры, которые держатся за потолок (pinned), не двигаются.
   */
  settle(mid = 8.5) {
    if (this.pinned || !this.count()) return;
    let top = Infinity;
    let bottom = -Infinity;
    for (const c of this.cells.values()) {
      top = Math.min(top, c.r);
      bottom = Math.max(bottom, c.r);
    }
    for (const b of this.free) {
      top = Math.min(top, (b.y - Y0 - CH) / CH);
      bottom = Math.max(bottom, (b.y - Y0 + CH) / CH);
    }
    let shift = Math.round(mid - (top + bottom) / 2);
    shift = Math.max(Math.ceil(1 - top), Math.min(Math.floor(ROWS - 2 - bottom), shift));
    if (!shift) return;
    const cells = [...this.cells.values()];
    this.cells.clear();
    for (const c of cells) this.setH(c.hc, c.r + shift, c);
    for (const b of this.free) b.y += shift * CH;
  }

  all() {
    return [...this.cells.values(), ...this.free];
  }
}

const HP = { n: 1, h: 3, p: 1, e: 1, x: 0, t: 0 };
const work = (L) => L.all().reduce((sum, b) => sum + HP[b.k], 0);

// ---------- строители узоров ----------
// P: { d — сложность 0…1, size — размер 0…1, T — шесть оттенков главы в случайном порядке, int, pick, chance, shuffle }

const B = {};

/** Стена: ряды во всю ширину или уже, полосами оттенков; бывают просветы-колонки. */
B.wall = (L, P) => {
  const rows = 3 + Math.round(P.size * 6);
  const half = Math.min(9, 4 + Math.round(P.size * 4) + P.int(0, 1));
  const r0 = P.int(1, 3);
  const band = P.pick([1, 1, 2, 3]);
  const gap = P.pick([0, 0, 0, 2, 3, 4]);
  const byCol = P.chance(0.3);
  for (let r = 0; r < rows; r++) {
    for (let c = 9 - half; c <= 9; c++) {
      if (gap && (9 - c) % gap === gap - 1) continue;
      L.set(c, r0 + r, N(P.T[Math.floor((byCol ? 9 - c : r) / band) % 4]));
    }
  }
  L.mirror();
};

/** Кладка: ряды со сдвигом на полкирпича. */
B.bricks = (L, P) => {
  const rows = 4 + Math.round(P.size * 6);
  const half = 3 + Math.round(P.size * 5) + P.int(0, 1);
  const r0 = P.int(1, 3);
  const taper = P.chance(0.4);
  for (let r = 0; r < rows; r++) {
    const off = r % 2;
    const w = taper ? Math.max(1, half - Math.abs(r - (rows >> 1))) : half;
    for (let hc = 18 - 2 * Math.min(w, 9) + off; hc <= 18; hc += 2) L.setH(hc, r0 + r, N(P.T[(r >> 1) % 3]));
  }
  L.mirror();
};

/** Шахматка: два оттенка через один или редкая (через клетку пусто). */
B.checker = (L, P) => {
  const rows = 4 + Math.round(P.size * 7);
  const half = 4 + Math.round(P.size * 5);
  const r0 = P.int(1, 2);
  const sparse = P.chance(0.55);
  const block = P.pick([1, 1, 2]);
  for (let r = 0; r < rows; r++) {
    for (let c = 9 - half; c <= 9; c++) {
      const odd = (Math.floor((9 - c) / block) + Math.floor(r / block)) % 2;
      if (sparse && odd) continue;
      L.set(c, r0 + r, N(P.T[sparse ? Math.floor(r / block) % 3 : odd]));
    }
  }
  L.mirror();
};

/** Пирамида вершиной вверх или вниз. */
B.pyramid = (L, P) => {
  const rows = 4 + Math.round(P.size * 6);
  const down = P.chance(0.35);
  const r0 = P.int(1, 3);
  const hollow = P.chance(0.25) && rows > 5;
  for (let i = 0; i < rows; i++) {
    const r = r0 + (down ? rows - 1 - i : i);
    for (let c = 9 - i; c <= 9; c++) {
      const edge = c === 9 - i || i === rows - 1;
      if (hollow && !edge && (9 - c) % 2 === i % 2) continue;
      L.set(c, r, N(P.T[edge ? 0 : 1 + (i % 2)]));
    }
  }
  L.mirror();
};

/** Ромб из вложенных колец. */
B.diamond = (L, P) => {
  const R = 3 + Math.round(P.size * 5);
  const rc = 1 + R + P.int(0, 1);
  const rings = P.chance(0.4);
  for (let dr = -R; dr <= R; dr++) {
    for (let dc = -R; dc <= 0; dc++) {
      const m = Math.abs(dc) + Math.abs(dr);
      if (m > R) continue;
      if (rings && (R - m) % 2 === 1) continue;
      L.set(9 + dc, rc + dr, N(P.T[(R - m) % (rings ? 2 : 3)]));
    }
  }
  L.mirror();
  if (!rings) L.set(9, rc, GIFT());
};

/** Вложенные рамки; наружная иногда стальная с проходами сверху и снизу. */
B.frames = (L, P) => {
  const hw = Math.min(9, 4 + Math.round(P.size * 5));
  const hh = 3 + Math.round(P.size * 4);
  const rc = 1 + hh + P.int(0, 1);
  const steel = P.d > 0.25 && P.chance(0.45);
  for (let k = 0; hw - k >= 1 && hh - k >= 1; k += 2) {
    for (let dr = -(hh - k); dr <= hh - k; dr++) {
      for (let dc = -(hw - k); dc <= 0; dc++) {
        if (Math.abs(dr) !== hh - k && dc !== -(hw - k)) continue;
        if (k === 0 && steel) {
          if (Math.abs(dc) <= 1) continue;                       // проходы сверху и снизу — три кирпича
          L.set(9 + dc, rc + dr, STEEL());
        } else L.set(9 + dc, rc + dr, N(P.T[(k >> 1) % 4]));
      }
    }
  }
  L.mirror();
  L.set(9, rc, GIFT());
};

/** Косые полосы (после отражения — «ёлочка»). */
B.stripes = (L, P) => {
  const rows = 4 + Math.round(P.size * 7);
  const half = 5 + Math.round(P.size * 4);
  const r0 = P.int(1, 2);
  const w = P.pick([1, 2, 2, 3]);
  const skip = P.pick([0, 3, 4]);
  const dir = P.chance(0.5) ? 1 : -1;
  for (let r = 0; r < rows; r++) {
    for (let c = 9 - half; c <= 9; c++) {
      const i = Math.floor((9 - c + dir * r + 40) / w);
      if (skip && i % skip === skip - 1) continue;
      L.set(c, r0 + r, N(P.T[i % 4]));
    }
  }
  L.mirror();
};

/** Колонны разной высоты. */
B.columns = (L, P) => {
  const step = P.pick([2, 2, 3]);
  const maxH = 4 + Math.round(P.size * 8);
  const r0 = P.int(1, 2);
  const mode = P.pick(['up', 'down', 'rand', 'even']);
  let i = 0;
  for (let c = 9; c >= 0; c -= step, i++) {
    const h = mode === 'even' ? maxH : mode === 'rand' ? P.int(3, maxH) : Math.max(2, mode === 'up' ? maxH - i * 2 : maxH - (4 - i) * 2);
    for (let r = 0; r < h; r++) L.set(c, r0 + r, r === h - 1 && P.d > 0.2 ? HARD() : N(P.T[i % 4]));
    if (step === 3 && P.size > 0.5) for (let r = 0; r < h; r += 3) L.set(c - 1, r0 + r, N(P.T[(i + 2) % 4]));
  }
  L.mirror();
};

/** Эквалайзер: столбики растут вверх от общей линии. */
B.equalizer = (L, P) => {
  const base = 6 + Math.round(P.size * 8);
  const f = 0.5 + P.rng() * 0.9;
  const ph = P.rng() * 6;
  for (let c = 9; c >= 9 - (5 + Math.round(P.size * 4)); c--) {
    const h = 2 + Math.round((0.5 + 0.5 * Math.sin((9 - c) * f + ph)) * (base - 3));
    for (let k = 0; k < h; k++) L.set(c, 1 + base - k, N(P.T[Math.min(3, Math.floor((k * 4) / base))]));
  }
  L.mirror();
};

/** Зигзаги. */
B.zigzag = (L, P) => {
  const lines = 2 + Math.round(P.size * 3);
  const period = P.pick([2, 3, 4]);
  const thick = P.size > 0.45 ? 2 : 1;
  const gapRows = period + thick + 1;
  for (let k = 0; k < lines; k++) {
    for (let c = 0; c <= 9; c++) {
      const tri = Math.abs(((9 - c) % (2 * period)) - period);
      for (let t = 0; t < thick; t++) L.set(c, 1 + k * gapRows + tri + t, N(P.T[k % 4]));
    }
  }
  L.mirror();
};

/** Волны. */
B.waves = (L, P) => {
  const lines = 2 + Math.round(P.size * 3);
  const amp = P.pick([1, 2, 2, 3]);
  const f = 0.55 + P.rng() * 0.5;
  const thick = P.size > 0.4 ? 2 : 1;
  for (let k = 0; k < lines; k++) {
    for (let c = 0; c <= 9; c++) {
      const y = Math.round(amp * Math.cos((9 - c) * f + k * 0.9));
      for (let t = 0; t < thick; t++) L.set(c, 1 + amp + k * (thick + 2) + y + t, N(P.T[k % 4]));
    }
  }
  L.mirror();
};

/** Кольца из повёрнутых кирпичей вокруг ядра. */
B.rings = (L, P) => {
  const n = 2 + Math.round(P.size * 3.4);
  const cy = Y0 + 34 + n * 28 + 18;
  const gap = P.pick([0, 0, 4, 6]);
  const core = P.pick(['gift', 'ball', 'boom']);
  L.add(W / 2, cy, 0, core === 'gift' ? GIFT() : core === 'ball' ? BALL() : BOOM());
  for (let k = 0; k < n; k++) {
    const R = 46 + k * 28;
    const m = Math.floor((2 * Math.PI * R) / 35);
    const turn = (k % 2) * (Math.PI / m);
    for (let i = 0; i < m; i++) {
      if (gap && i % gap === gap - 1 && k > 0) continue;
      const a = (i / m) * 2 * Math.PI + turn - Math.PI / 2;
      L.add(W / 2 + R * Math.cos(a), cy + R * Math.sin(a), (a * 180) / Math.PI + 90, N(P.T[k % 4]));
    }
  }
};

/** Солнце: диск и лучи. */
B.sun = (L, P) => {
  const rays = P.pick([8, 10, 12]);
  const len = 2 + Math.round(P.size * 2);
  const cy = Y0 + 80 + len * 34 + 20;
  L.add(W / 2, cy, 0, GIFT());
  for (const [R, m] of [[30, 5], [58, 10]]) {
    for (let i = 0; i < m; i++) {
      const a = (i / m) * 2 * Math.PI - Math.PI / 2;
      L.add(W / 2 + R * Math.cos(a), cy + R * Math.sin(a), (a * 180) / Math.PI + 90, N(P.T[R === 30 ? 0 : 1]));
    }
  }
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * 2 * Math.PI - Math.PI / 2;
    for (let k = 0; k < len; k++) {
      const R = 98 + k * 34;
      L.add(W / 2 + R * Math.cos(a), cy + R * Math.sin(a), (a * 180) / Math.PI, N(P.T[2 + ((i + k) % 2)]));
    }
  }
};

/** Спираль. */
B.spiral = (L, P) => {
  const turns = 1.6 + P.size * 1.9;
  const cy = Y0 + 60 + turns * 30 + 30;
  const dir = P.chance(0.5) ? 1 : -1;
  L.add(W / 2, cy, 0, GIFT());
  let a = 0.6;
  let i = 0;
  while (a < turns * 2 * Math.PI) {
    const R = 30 + 4.6 * a;
    const x = W / 2 + R * Math.cos(a * dir);
    const y = cy + R * Math.sin(a * dir);
    L.add(x, y, ((a * dir * 180) / Math.PI) + 90, N(P.T[Math.floor(i / 6) % 4]));
    a += 35 / R;
    i++;
  }
};

/** Радуга: дуги одна над другой. */
B.arcs = (L, P) => {
  const n = 3 + Math.round(P.size * 3);
  const R0 = 70;
  const cy = Y0 + R0 + n * 26 + 30;
  for (let k = 0; k < n; k++) {
    const R = R0 + k * 26;
    const m = Math.floor((Math.PI * R) / 35);
    for (let i = 0; i <= m; i++) {
      const a = Math.PI + (i / m) * Math.PI;
      L.add(W / 2 + R * Math.cos(a), cy + R * Math.sin(a), (a * 180) / Math.PI + 90, N(P.T[k % 6]));
    }
  }
  for (const dx of [-32, 0, 32]) L.add(W / 2 + dx, cy - 20, 0, dx ? N(P.T[5]) : GIFT());
};

/** Треугольная мозаика: большой треугольник, ромб или ленты. */
B.tri = (L, P) => {
  const kind = P.pick(['up', 'rhomb', 'bands', 'down']);
  const n = 4 + Math.round(P.size * 5);
  const r0 = P.int(1, 2);
  const tone = (i, j) => P.T[kind === 'bands' ? j % 2 : (i + (j % 2)) % 3];
  const row = (i, r, flip) => {
    for (let j = 0; j <= 2 * i; j++) L.setH(18 - i + j, r, N(tone(i, j), (j % 2 === 0) !== flip ? 'U' : 'D'));
  };
  if (kind === 'bands') {
    const lines = 2 + Math.round(P.size * 3);
    const half = 5 + Math.round(P.size * 4);
    for (let k = 0; k < lines; k++) {
      for (let hc = 18 - half * 2; hc <= 18 + half * 2; hc++) L.setH(hc, r0 + k * 2, N(tone(k, hc + k), (hc + k) % 2 ? 'D' : 'U'));
    }
    L.mirrored = true;
    return;
  }
  L.mirrored = true;
  if (kind === 'up' || kind === 'rhomb') for (let i = 0; i < n; i++) row(i, r0 + i, false);
  if (kind === 'down') for (let i = 0; i < n; i++) row(n - 1 - i, r0 + i, true);
  if (kind === 'rhomb') for (let i = 0; i < n; i++) row(n - 1 - i, r0 + n + i, true);
};

/** Гранёный камень: прямоугольник со срезанными по диагонали углами (треугольные кирпичи). */
B.gem = (L, P) => {
  const hw = 3 + Math.round(P.size * 4);            // полуширина в кирпичах (середина — между колонками)
  const cut = Math.min(hw, 2 + Math.round(P.size * 3));
  const mid = Math.round(P.size * 3);
  const r0 = P.int(1, 2);
  const rows = cut * 2 + mid;
  for (let i = 0; i < rows; i++) {
    const top = i < cut;
    const bottom = i >= cut + mid;
    const inset = top ? cut - 1 - i : bottom ? i - cut - mid : -1;
    const left = 19 - 2 * hw + 2 * Math.max(0, inset);
    for (let hc = left; hc < 19; hc += 2) {
      const edge = hc === left && inset >= 0;
      const depth = Math.min((hc - left) / 2, i, rows - 1 - i);
      L.setH(hc, r0 + i, N(P.T[Math.min(2, depth)], edge ? (top ? 'a' : 'c') : 'R'));
    }
  }
  L.mirror();
};

/** Крепость: стальные стены и крыша, вход снизу (или пол и вход сверху — сложнее), внутри — добыча. */
B.fortress = (L, P) => {
  const hw = 3 + Math.round(P.size * 4);
  const hh = 4 + Math.round(P.size * 5);
  const r0 = P.int(1, 2);
  const openTop = P.d > 0.5 && P.chance(0.4);
  for (let r = 0; r < hh; r++) L.set(9 - hw, r0 + r, STEEL());
  for (let c = 9 - hw; c <= 9; c++) L.set(c, r0 + (openTop ? hh - 1 : 0), STEEL());
  for (let r = 1; r < hh; r++) {
    const row = r0 + (openTop ? r - 1 : r);
    for (let c = 9 - hw + 1; c <= 9; c++) {
      if ((r + (9 - c)) % 5 === 0) L.set(c, row, r % 2 ? GIFT() : BOOM());
      else L.set(c, row, N(P.T[r % 3]));
    }
  }
  L.mirror();
};

/** Щиты: кучки кирпичей, под каждой — стальная полка. */
B.shields = (L, P) => {
  const rows = 1 + Math.round(P.size * 2);
  const h = 2 + Math.round(P.size * 2);
  for (let k = 0; k < rows; k++) {
    const r0 = 1 + k * (h + 3);
    for (const c0 of k % 2 ? [3, 8] : [1, 6]) {
      for (let c = c0; c < c0 + 3 && c <= 9; c++) {
        for (let r = 0; r < h; r++) L.set(c, r0 + r, N(P.T[(k + r) % 4]));
        L.set(c, r0 + h, STEEL());
      }
    }
  }
  L.mirror();
};

/** Фитили: плотный блок, прошитый линиями взрывных кирпичей, — одно попадание запускает цепочку. */
B.fuse = (L, P) => {
  const rows = 5 + Math.round(P.size * 6);
  const half = 4 + Math.round(P.size * 5);
  const r0 = P.int(1, 2);
  const every = P.pick([3, 4]);
  const cross = P.chance(0.5);
  for (let r = 0; r < rows; r++) {
    for (let c = 9 - half; c <= 9; c++) {
      const line = r % every === every - 1 || (cross && (9 - c) % every === 0);
      L.set(c, r0 + r, line ? BOOM() : N(P.T[(Math.floor(r / every) + Math.floor((9 - c) / every)) % 4]));
    }
  }
  L.mirror();
};

/** Пятна: случайные острова (клеточный автомат), кромка — другим оттенком. */
B.blobs = (L, P) => {
  const rows = 6 + Math.round(P.size * 8);
  const half = 6 + Math.round(P.size * 3);
  let g = Array.from({ length: rows }, () => Array.from({ length: half + 1 }, () => P.chance(0.5)));
  const at = (r, c) => (r < 0 || r >= rows || c < 0 ? false : g[r][Math.min(c, half)]);
  for (let it = 0; it < 3; it++) {
    g = g.map((line, r) => line.map((v, c) => {
      let n = 0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if ((dr || dc) && at(r + dr, c + dc)) n++;
      return n > 4 || (n === 4 && v);
    }));
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c <= half; c++) {
      if (!g[r][c]) continue;
      const edge = !at(r - 1, c) || !at(r + 1, c) || !at(r, c - 1) || (c < half && !at(r, c + 1));
      L.set(9 - half + c, 1 + r, N(P.T[edge ? 0 : 1 + ((r + c) % 2)]));
    }
  }
  L.mirror();
};

/** Отряд: одинаковые фигурки рядами. */
B.squad = (L, P) => {
  const bits = Array.from({ length: 4 }, () => Array.from({ length: 3 }, () => P.chance(0.62)));
  bits[1][2] = true;
  bits[2][1] = true;
  const lines = 1 + Math.round(P.size * 2.4);
  for (let k = 0; k < lines; k++) {
    for (const c0 of [1, 7]) {
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 3; c++) {
          if (!bits[r][c]) continue;
          L.set(c0 + c, 1 + k * 6 + r, N(P.T[k % 4]));
          if (c0 === 1) L.set(c0 + 4 - c, 1 + k * 6 + r, N(P.T[k % 4]));
        }
      }
    }
  }
  L.mirror();
};

/** Клетки: запертые шарики в рамках из кирпичей. */
B.cage = (L, P) => {
  const lines = 1 + Math.round(P.size * 1.6);
  for (let k = 0; k < lines; k++) {
    for (const c0 of k % 2 ? [3, 8] : [0, 5]) {
      for (let r = 0; r < 3; r++) {
        for (let c = c0; c < c0 + 3 && c <= 9; c++) {
          if (r === 1 && c === c0 + 1) L.set(c, 1 + k * 5 + r, BALL());
          else L.set(c, 1 + k * 5 + r, N(P.T[(k + (r === 1 ? 1 : 0)) % 4]));
        }
      }
    }
  }
  L.mirror();
};

/** Лестницы от середины к краям. */
B.stairs = (L, P) => {
  const steps = 5 + Math.round(P.size * 4);
  const thick = 2 + Math.round(P.size * 2);
  const up = P.chance(0.5);
  for (let i = 0; i <= steps; i++) {
    for (let t = 0; t < thick; t++) L.set(9 - i, 1 + (up ? steps - i : i) + t, N(P.T[t === 0 ? 0 : 1 + (i % 2)]));
  }
  L.mirror();
};

/** Песочные часы или бабочка. */
B.hourglass = (L, P) => {
  const R = 3 + Math.round(P.size * 4);
  const side = P.chance(0.5);
  for (let dr = -R; dr <= R; dr++) {
    for (let dc = -R; dc <= 0; dc++) {
      const inside = side ? Math.abs(dr) <= Math.abs(dc) : Math.abs(dc) <= Math.abs(dr);
      if (!inside) continue;
      L.set(9 + dc, 1 + R + dr, N(P.T[Math.max(Math.abs(dc), Math.abs(dr)) % 3]));
    }
  }
  L.mirror();
  L.set(9, 1 + R, GIFT());
};

/** Решётка: линии через две, в узлах — крепкие. */
B.lattice = (L, P) => {
  const rows = 5 + Math.round(P.size * 8);
  const half = 4 + Math.round(P.size * 5);
  const step = P.pick([3, 3, 4]);
  for (let r = 0; r < rows; r++) {
    for (let c = 9 - half; c <= 9; c++) {
      const hr = r % step === 0;
      const hc = (9 - c) % step === 0;
      if (!hr && !hc) continue;
      L.set(c, 1 + r, hr && hc ? HARD() : N(P.T[hr ? 0 : 1]));
    }
  }
  L.mirror();
};

/** Сердце. */
B.heart = (L, P) => {
  const s = 3.4 + P.size * 3.2;
  const rows = Math.round(s * 3.2);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c <= 9; c++) {
      const x = ((9 - c) * 1.78) / (s * 1.5);
      const y = 1.25 - r / (s * 1.25);
      const v = (x * x + y * y - 1) ** 3 - x * x * y * y * y;
      if (v > 0) continue;
      L.set(c, 1 + r, N(P.T[v > -0.12 ? 0 : 1]));
    }
  }
  L.mirror();
};

/** Сосульки: потолок и свисающие зубья с треугольным остриём. */
B.icicles = (L, P) => {
  const maxH = 3 + Math.round(P.size * 7);
  L.pinned = true;
  for (let c = 0; c <= 9; c++) {
    L.set(c, 1, N(P.T[0]));
    if ((9 - c) % 2) continue;
    const h = P.int(2, maxH);
    for (let r = 0; r < h; r++) L.set(c, 2 + r, N(P.T[1 + (r % 2)]));
    L.set(c, 2 + h, N(P.T[3], 'D'));
  }
  L.mirror();
};

/** Храм: фронтон со скатами, колонны и ступени. */
B.temple = (L, P) => {
  const hw = 3 + Math.round(P.size * 4);
  const roof = Math.min(hw, 2 + Math.round(P.size * 2));
  const colH = 3 + Math.round(P.size * 5);
  let r = 1;
  for (let i = 0; i < roof; i++, r++) {
    const left = 19 - 2 * Math.round(((i + 1) * hw) / roof);
    for (let hc = left; hc < 19; hc += 2) L.setH(hc, r, N(P.T[0], hc === left ? 'a' : 'R'));
  }
  for (let hc = 19 - 2 * hw; hc < 19; hc += 2) L.setH(hc, r, N(P.T[1]));
  r++;
  for (let i = 0; i < colH; i++, r++) {
    for (let hc = 19 - 2 * hw; hc < 19; hc += 4) L.setH(hc, r, i === 0 || i === colH - 1 ? N(P.T[1]) : N(P.T[2]));
  }
  for (let k = 0; k < 2; k++, r++) {
    for (let hc = 19 - 2 * Math.min(9, hw + k); hc < 19; hc += 2) L.setH(hc, r, N(P.T[3]));
  }
  L.mirror();
};

/** Горошек: маленькие крестики по узлам. */
B.dots = (L, P) => {
  const lines = 2 + Math.round(P.size * 3);
  for (let k = 0; k < lines; k++) {
    for (let c = k % 2 ? 2 : 0; c <= 9; c += 4) {
      const r = 2 + k * 4;
      const t = P.T[(k + (c >> 2)) % 4];
      L.set(c, r, P.size > 0.5 ? HARD() : N(t));
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) L.set(c + dc, r + dr, N(t));
    }
  }
  L.mirror();
};

/** Мишень: овальные кольца по сетке. */
B.target = (L, P) => {
  const R = 2.2 + P.size * 3.6;
  const rc = 1 + Math.ceil(R * 1.78);
  const hollow = P.chance(0.45);
  for (let dr = -Math.ceil(R * 1.8); dr <= Math.ceil(R * 1.8); dr++) {
    for (let dc = -Math.ceil(R); dc <= 0; dc++) {
      const m = Math.hypot(dc, dr / 1.78);
      if (m > R + 0.2) continue;
      const ring = Math.floor(m + 0.4);
      if (hollow && ring % 2 === 1) continue;
      L.set(9 + dc, rc + dr, N(P.T[ring % 3]));
    }
  }
  L.mirror();
  L.set(9, rc, GIFT());
};

/** Стрела вверх. */
B.arrow = (L, P) => {
  const head = 3 + Math.round(P.size * 4);
  const shaft = 3 + Math.round(P.size * 5);
  for (let i = 0; i < head; i++) for (let c = 9 - i; c <= 9; c++) L.set(c, 1 + i, N(P.T[c === 9 - i ? 0 : 1]));
  for (let r = 0; r < shaft; r++) for (let c = 9 - Math.max(1, head >> 2); c <= 9; c++) L.set(c, 1 + head + r, N(P.T[2]));
  L.mirror();
};

/** Косой крест. */
B.cross = (L, P) => {
  const R = 4 + Math.round(P.size * 5);
  const thick = P.size > 0.5 ? 1.1 : 0.6;
  for (let dr = -R; dr <= R; dr++) {
    for (let dc = -Math.min(9, R); dc <= 0; dc++) {
      if (Math.abs(Math.abs(dc) - Math.abs(dr) * 0.75) > thick) continue;
      L.set(9 + dc, 1 + R + dr, N(P.T[Math.abs(dr) % 3]));
    }
  }
  L.mirror();
  L.set(9, 1 + R, BOOM());
};

/** Россыпь ромбиков. */
B.gems = (L, P) => {
  const lines = 1 + Math.round(P.size * 2.2);
  for (let k = 0; k < lines; k++) {
    for (const c0 of k % 2 ? [4, 9] : [2, 7]) {
      const r = 3 + k * 6;
      const t = P.T[(k + (c0 >> 2)) % 4];
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -(2 - Math.abs(dr)); dc <= 2 - Math.abs(dr); dc++) L.set(c0 + dc, r + dr, dr === 0 && dc === 0 ? GIFT() : N(t));
      }
    }
  }
  L.mirror();
};

// какие узоры идут в главе чаще (свои) и общий набор
const COMMON = ['wall', 'bricks', 'checker', 'pyramid', 'diamond', 'frames', 'stripes', 'columns', 'zigzag', 'stairs', 'hourglass', 'lattice', 'target', 'cross', 'blobs', 'fuse'];
const SIGNATURE = [
  ['rings', 'sun', 'spiral', 'squad', 'target', 'arcs'],                // Космос
  ['waves', 'arcs', 'blobs', 'cage', 'zigzag', 'bricks'],               // Океан
  ['blobs', 'columns', 'lattice', 'heart', 'spiral', 'dots'],           // Джунгли
  ['pyramid', 'temple', 'stairs', 'sun', 'hourglass', 'wall'],          // Пустыня
  ['icicles', 'tri', 'diamond', 'gem', 'dots', 'rings'],                // Льды
  ['fuse', 'tri', 'cross', 'pyramid', 'spiral', 'shields'],             // Вулкан
  ['equalizer', 'rings', 'lattice', 'stripes', 'squad', 'arrow'],       // Неон
  ['checker', 'heart', 'arcs', 'dots', 'stripes', 'gems'],              // Карамель
  ['fortress', 'shields', 'frames', 'lattice', 'cage', 'columns'],      // Завод
  ['gem', 'gems', 'tri', 'diamond', 'target', 'fortress'],              // Кристаллы
];

// ---------- картинки ----------
// Строка — ряд кирпичей: «.» пусто, цифра — оттенок главы (0…5), h крепкий, x стальной, e взрывной, p с бонусом,
// t запертый шарик. m: true — нарисована левая половина с серединой, правая отражается.

const PICTURES = [
  // Космос: 0 синий, 1 голубой, 2 фиолетовый, 3 розовый, 4 жёлтый, 5 белый
  [
    { name: 'ракета', m: true, rows: ['....3', '...35', '...55', '..555', '..55p', '..555', '..000', '..555', '.2555', '22555', '22.55', '2..44', '...43', '....4'] },
    { name: 'тарелка', m: true, rows: ['....111', '...1151', '..11511', '.222222', '2422424', '.222222', '..3...3', '.3...3.', '3...3..'] },
    { name: 'пришелец', m: true, rows: ['..3...', '...3..', '..3333', '.33p33', '333333', '3.3333', '3.3...', '...33.'] },
    { name: 'планета', m: true, rows: ['.....222', '...22222', '..222332', '..223322', '4.222222', '44444444', '.4222222', '..222222', '..223222', '...22222', '.....222'] },
    { name: 'звезда', m: true, rows: ['.....4', '....44', '....44', '444444', '.4444p', '..4444', '..4444', '.4444.', '.44...', '4.....'] },
  ],
  // Океан: 0 жёлтый, 1 бирюзовый, 2 коралловый, 3 зелёный, 4 фиолетовый, 5 жемчужный
  [
    { name: 'рыба', rows: ['.....000.....', '2..00000000..', '22.000000500.', '2220000000p00', '222000000000.', '22.00000000..', '2....000.....'] },
    { name: 'якорь', m: true, rows: ['....55', '...5.5', '....55', '..5555', '.....5', '.....5', '5....5', '55...5', '.55..5', '..5555', '....55'] },
    { name: 'краб', m: true, rows: ['2.....', '22..2.', '.2.2..', '..2222', '.22522', '222222', '.22222', '2.2.2.', '2..2..'] },
    { name: 'медуза', m: true, rows: ['...444', '..4444', '.44544', '.44444', '.44p44', '.4.4.4', '.4.4.4', '4..4..', '4...4.', '....4.'] },
    { name: 'парусник', rows: ['.....5.......', '.....55......', '.....555.....', '.....5555....', '.....55555...', '.....555555..', '.....5.......', '2222222222222', '.22222p2222..', '..222222222..', '111.111.111.1'] },
  ],
  // Джунгли: 0 зелёный, 1 манго, 2 красный, 3 бирюзовый, 4 древесный, 5 кремовый
  [
    { name: 'пальма', m: true, rows: ['..00..0', '.0000.0', '00..000', '0..0000', '..00.40', '.00..4.', '.0...4.', '.....4.', '.....4.', '....44.', '...4444'] },
    { name: 'бабочка', m: true, rows: ['11....', '111..4', '1211.4', '12p114', '.11114', '..1114', '.33334', '333334', '3233.4', '.33...'] },
    { name: 'лягушка', m: true, rows: ['.00...', '0550..', '050000', '000000', '000000', '0.0000', '00....', '.00000', '..0000'] },
    { name: 'цветок', m: true, rows: ['...222', '..2222', '.22212', '.2211p', '.22212', '..2222', '...222', '.....0', '.00..0', '..00.0', '...000', '.....0'] },
    { name: 'гриб', m: true, rows: ['...222', '.22522', '225222', '222252', '222222', '...555', '...555', '...555', '..5555'] },
  ],
  // Пустыня: 0 песочный, 1 терракота, 2 бирюза, 3 красный, 4 фиолетовый, 5 слоновая кость
  [
    { name: 'пирамиды', m: true, rows: ['.........0', '........00', '.......001', '......0011', '.....00111', '..0.001111', '.00.011111', '0010111111'] },
    { name: 'кактус', m: true, rows: ['....2', '....2', '2...2', '2...2', '2...2', '2222p', '.2222', '....2', '....2', '....2', '.1111', '..111'] },
    { name: 'скарабей', m: true, rows: ['.2...2', '..2.2.', '..2222', '.22422', '222222', '224222', '222242', '.22222', '2.222.', '2..2..'] },
    { name: 'ваза', m: true, rows: ['..1111', '...111', '...111', '..1111', '.11211', '112221', '11222p', '112221', '.11211', '..1111', '...111', '..1111'] },
    { name: 'око', m: true, rows: ['...00000', '.0005555', '005522p4', '.0055224', '..000555', '....0000', '...0..0.', '..0...0.'] },
  ],
  // Льды: 0 голубой, 1 белый, 2 лазурный, 3 сиреневый, 4 мятный, 5 розовый
  [
    { name: 'снежинка', m: true, rows: ['.....1', '..1..1', '...1.1', '1...11', '.1..1.', '..111.', '11111p', '..111.', '.1..1.', '1...11', '...1.1', '..1..1', '.....1'] },
    { name: 'пингвин', m: true, rows: ['...222', '..2222', '..2112', '..21p1', '.22111', '222111', '222111', '2.2111', '..2111', '...211', '..55.5'] },
    { name: 'снеговик', m: true, rows: ['...333', '..3333', '...111', '..1211', '..1115', '...111', '.11111', '.1111p', '.11111', '111111', '111112', '111111', '.11111'] },
    { name: 'ёлка', m: true, rows: ['.....5', '.....4', '....44', '...444', '....44', '...444', '..4454', '...444', '..4444', '.44544', '444444', '.....3', '.....3'] },
    { name: 'горы', m: true, rows: ['.........1', '........11', '...1...112', '..11..1122', '.112.11222', '11221122p2', '1222222222'] },
  ],
  // Вулкан: 0 оранжевый, 1 янтарный, 2 красный, 3 пепельный, 4 фиолетовый, 5 бледный
  [
    { name: 'пламя', m: true, rows: ['.....2', '....22', '....22', '..2.22', '..2220', '.22200', '.22001', '220011', '22011p', '220011', '.22001', '..2200'] },
    { name: 'вулкан', m: true, rows: ['...2.1', '..1.2.', '....12', '...ee1', '...333', '..3323', '..3323', '.33233', '.33323', '333233', '333323'] },
    { name: 'череп', m: true, rows: ['..3333', '.33333', '333333', '3..333', '3..33.', '33333.', '.33333', '..3.3.', '..3.3.', '..3333'] },
    { name: 'факел', m: true, rows: ['....2', '...22', '..220', '..201', '..20p', '...00', '.3333', '..333', '...44', '...44', '...44', '...44'] },
    { name: 'метеор', rows: ['..........22.', '.........2002', '........20110', '......1.2011.', '.....1..200..', '....1.1..2...', '...1.1.......', '..1.1........', '.1...........'] },
  ],
  // Неон: 0 пурпурный, 1 голубой, 2 жёлтый, 3 зелёный, 4 оранжевый, 5 фиолетовый
  [
    { name: 'сердце', m: true, rows: ['.000..', '000000', '000500', '000000', '00000p', '.00000', '..0000', '...000', '....00', '.....0'] },
    { name: 'молния', rows: ['....2222.', '...2222..', '..2222...', '.2222....', '2222222..', '...2222..', '..2222...', '.222.....', '.22......', '2........'] },
    { name: 'призрак', m: true, rows: ['...111', '.11111', '.11111', '11..11', '11..11', '111111', '11111p', '111111', '111111', '11.11.', '1...1.'] },
    { name: 'нота', rows: ['....33333', '....33333', '....3...3', '....3...3', '....3...3', '.3333.333', '33333.333', '.333..33.'] },
    { name: 'джойстик', m: true, rows: ['..55555', '.555555', '5505555', '500055p', '5505555', '5555555', '555..55', '.55...5'] },
  ],
  // Карамель: 0 розовый, 1 небесный, 2 лимонный, 3 мятный, 4 сиреневый, 5 кремовый
  [
    { name: 'леденец', m: true, rows: ['...000', '..0550', '.05005', '.0505p', '.05005', '..0550', '...000', '.....5', '.....5', '.....5', '.....5', '.....5'] },
    { name: 'кекс', m: true, rows: ['.....0', '....00', '...555', '..5505', '.55555', '.5p555', '555555', '.22222', '.2.2.2', '..2222', '..2.2.', '...222'] },
    { name: 'вишня', rows: ['.......3.', '......33.', '.....3.3.', '....3..3.', '...3...3.', '.000..000', '00500.050', '00000p000', '00000.000', '.000..000'] },
    { name: 'пончик', m: true, rows: ['...000', '.00000', '002000', '000..0', '00...0', '03...0', '000..0', '00000p', '.00000', '...000'] },
    { name: 'рожок', m: true, rows: ['...000', '..0000', '.01000', '.00000', '.33333', '.33313', '..3333', '.22222', '..2222', '...222', '....22', '.....2'] },
  ],
  // Завод: 0 янтарный, 1 ржавый, 2 стальной синий, 3 зелёный, 4 светлый металл, 5 фиолетовый
  [
    { name: 'шестерня', m: true, rows: ['.....4', '.4..44', '..4444', '.44444', '.444..', '4444.p', '.444..', '.44444', '..4444', '.4..44', '.....4'] },
    { name: 'робот', m: true, rows: ['.....0', '.....4', '..4444', '..4334', '..4334', '..4444', '..4p44', '...222', '4.2222', '4.2202', '..2222', '..22.2', '..44.4'] },
    { name: 'ключ', rows: ['.000.........', '00.00........', '0...000000000', '00.00...0.0.0', '.000....0...0'] },
    { name: 'лампа', m: true, rows: ['...000', '..0000', '.00500', '.05000', '.00000', '.0000p', '..0000', '...000', '...444', '...222', '...444', '....22'] },
    { name: 'батарея', m: true, rows: ['....44', '.44444', '.4...4', '.4.333', '.4.333', '.4.33p', '.4.333', '.4.333', '.4...4', '.44444'] },
  ],
  // Кристаллы: 0 аметист, 1 аквамарин, 2 рубин, 3 изумруд, 4 топаз, 5 алмаз
  [
    { name: 'алмаз', m: true, rows: ['..11111', '.115111', '1151111', '.111511', '..11151', '...1115', '....111', '.....1p', '......1'] },
    { name: 'корона', m: true, rows: ['4....4', '4....4', '44..44', '44..44', '444444', '444444', '42444p', '444444', '.44444'] },
    { name: 'кольцо', m: true, rows: ['.....2', '....22', '...252', '....22', '....44', '..444.', '.44...', '.4....', '.4....', '.44...', '..444.', '....44'] },
    { name: 'меч', m: true, rows: ['....5', '...55', '...55', '...55', '...55', '...55', '...55', '.4444', '4.444', '...44', '...22', '...2p'] },
    { name: 'кубок', m: true, rows: ['.444444', '4.44444', '4.44544', '4.44454', '.444444', '...4444', '....444', '.....44', '.....44', '....444', '...4444', '..22p22'] },
  ],
];

const CHARS = { h: HARD, x: STEEL, e: BOOM, p: GIFT, t: BALL };

function drawPicture(L, pic) {
  if (new Set(pic.rows.map((row) => row.length)).size !== 1) throw new Error(`картинка «${pic.name}»: ряды разной длины`);
  const rows = pic.m ? pic.rows.map((row) => row + [...row].slice(0, -1).reverse().join('')) : pic.rows;
  const w = Math.max(...rows.map((row) => row.length));
  if (w > COLS || rows.length > ROWS - 2) throw new Error(`картинка «${pic.name}» не помещается`);
  const c0 = Math.floor((COLS - w) / 2);
  const r0 = Math.max(1, Math.min(3, Math.floor((ROWS - 4 - rows.length) / 2)));
  rows.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      if (ch === '.') return;
      const make = CHARS[ch];
      if (!make && !(ch >= '0' && ch <= '5')) throw new Error(`картинка «${pic.name}»: знак «${ch}»`);
      L.set(c0 + c, r0 + r, make ? make() : N(Number(ch)));
    });
  });
  L.mirrored = Boolean(pic.m);
}

// ---------- наряд ----------

/** Группы кирпичей: зеркальные пары считаются вместе, чтобы узор остался зеркальным. */
function groups(L) {
  const map = new Map();
  for (const cell of L.cells.values()) {
    if (cell.k !== 'n') continue;
    const key = L.mirrored ? cell.r * 64 + Math.min(cell.hc, HC - cell.hc) : cell.r * 64 + cell.hc;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(cell);
  }
  const list = [...map.values()];
  for (const b of L.free) if (b.k === 'n') list.push([b]);
  return list;
}

const become = (group, make) => group.forEach((cell) => Object.assign(cell, make(cell.s)));

function dress(L, P, n, picture) {
  const d = P.d;
  let pool = P.shuffle(groups(L));
  const total = pool.reduce((sum, g) => sum + g.length, 0);
  const take = (count, make, order) => {
    if (order) pool = order(pool);
    let left = count;
    while (left > 0 && pool.length > 4) {
      const g = pool.shift();
      become(g, make);
      left -= g.length;
    }
  };
  const has = (k) => L.all().some((b) => b.k === k);
  // картинка остаётся как нарисована; только бонусов должно быть не меньше трёх
  if (picture) take(3 - L.all().filter((b) => b.k === 'p').length, (s) => GIFT(null, s));
  else {
    // бонусы: чем дальше, тем реже
    const gifts = Math.max(2, Math.min(10, Math.round(total * (0.12 - 0.05 * d)))) - L.all().filter((b) => b.k === 'p').length;
    take(gifts, (s) => GIFT(null, s));
    // крепкие — верхние ряды, кромка или вразброс
    const hard = Math.round(total * Math.min(0.3, Math.max(0, d - 0.03) * 0.42));
    const mode = P.pick(['top', 'rand', 'rand']);
    take(hard, HARD, mode === 'top' ? (list) => list.slice().sort((a, b) => (a[0].r ?? a[0].y / CH) - (b[0].r ?? b[0].y / CH)) : null);
    pool = P.shuffle(pool);
    if (d > 0.05 && !has('e')) take(Math.round(total * (0.015 + 0.045 * P.rng())), BOOM);
    if (d > 0.08 && !has('t') && P.chance(0.2)) take(1, () => BALL());
  }
  // какие бонусы заданы уровнем
  const gifts = L.all().filter((b) => b.k === 'p');
  if (n <= INTRO.length) gifts.forEach((b, i) => (b.b = INTRO[n - 1][i % 2]));
  else {
    for (const b of gifts) {
      if (P.chance(0.4)) b.b = P.chance(0.22 + 0.1 * d) ? P.pick(BAD) : P.pick(GOOD);
    }
  }
}

// ---------- уровень ----------

const PICTURE_AT = [0, 7, 14, 21, 29];              // места картинок в главе

function difficulty(n) {
  const g = (n - 1) / (LEVELS_TOTAL - 1);
  const local = ((n - 1) % CHAPTER_SIZE) / (CHAPTER_SIZE - 1);
  return Math.min(1, 0.82 * g + 0.18 * g * local + 0.03 * local);
}

/** Какой узор у каждого уровня главы: свои узоры главы — чаще, подряд один и тот же не идёт. */
function plan(chapter) {
  const P = tools(mulberry(9001 + chapter * 131));
  const bag = [];
  const out = [];
  for (let i = 0; i < CHAPTER_SIZE; i++) {
    const slot = PICTURE_AT.indexOf(i);
    if (slot >= 0 && PICTURES[chapter][slot]) {
      out.push({ picture: PICTURES[chapter][slot] });
      continue;
    }
    if (!bag.length) bag.push(...P.shuffle([...SIGNATURE[chapter], ...SIGNATURE[chapter], ...P.shuffle(COMMON).slice(0, 7)]));
    let k = bag.findIndex((name) => name !== out[out.length - 1]?.builder && name !== out[out.length - 2]?.builder);
    if (k < 0) k = 0;
    out.push({ builder: bag.splice(k, 1)[0] });
  }
  return out;
}

const PLANS = CHAPTER_NAMES.map((_, chapter) => plan(chapter));

export function makeLevel(n) {
  const chapter = Math.floor((n - 1) / CHAPTER_SIZE);
  const item = PLANS[chapter][(n - 1) % CHAPTER_SIZE];
  const d = difficulty(n);
  const limit = 48 + 118 * d;                       // объём уровня: сумма ударов по разрушаемым кирпичам
  let L = null;
  let P = null;
  let size = Math.min(1, 0.3 + d * 0.75);
  for (let attempt = 0; attempt < 14; attempt++) {
    P = tools(mulberry(n * 7919 + attempt * 104729));
    P.d = d;
    P.size = Math.max(0, Math.min(1, size));
    P.T = P.shuffle([0, 1, 2, 3, 4, 5]);
    L = new Layout();
    if (item.picture) drawPicture(L, item.picture);
    else B[item.builder](L, P);
    L.settle();
    dress(L, P, n, Boolean(item.picture));
    if (item.picture) break;
    const w = work(L);
    if (w > limit * 1.15) size -= 0.09;
    else if (w < Math.max(20, limit * 0.45) && size < 1) size += 0.1;
    else break;
  }
  const bricks = [
    ...[...L.cells.values()].map((b) => ({ k: b.k, t: b.t, s: b.s, b: b.b, x: X0 + b.hc * 16, y: Y0 + b.r * CH, rot: 0, scale: 100 })),
    ...L.free.map((b) => ({ k: b.k, t: b.t, s: b.s, b: b.b, x: b.x, y: b.y, rot: b.rot, scale: b.scale })),
  ];
  return { n, chapter, name: item.picture ? item.picture.name : item.builder, picture: Boolean(item.picture), bricks };
}

// ---------- запись ----------

const D36 = '0123456789abcdefghijklmnopqrstuvwxyz';
function b36(v, len) {
  let s = '';
  for (let i = 0; i < len; i++) {
    s = D36[v % 36] + s;
    v = Math.floor(v / 36);
  }
  if (v) throw new Error('число не помещается');
  return s;
}

export function buildAll() {
  const levels = [];
  for (let n = 1; n <= LEVELS_TOTAL; n++) levels.push(makeLevel(n));
  const code = (b) => `${b.k}${b.t}${b.s}${b.b ?? ''}`;
  const counts = new Map();
  for (const level of levels) for (const b of level.bricks) counts.set(code(b), (counts.get(code(b)) ?? 0) + 1);
  const codes = [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([c]) => c);
  if (codes.length > ALPHABET.length) throw new Error(`видов кирпичей ${codes.length} — больше, чем знаков`);
  const char = new Map(codes.map((c, i) => [c, ALPHABET[i]]));
  const packed = levels.map((level) => {
    const rows = new Map();
    const extra = [];
    for (const b of level.bricks) {
      if (b.rot || b.scale !== 100) extra.push(b36(b.x, 2) + b36(b.y, 2) + char.get(code(b)) + b36(b.rot, 2) + b36(b.scale, 2));
      else {
        if (!rows.has(b.y)) rows.set(b.y, []);
        rows.get(b.y).push(b);
      }
    }
    const main = [...rows.keys()].sort((a, b) => a - b)
      .map((y) => b36(y, 2) + rows.get(y).sort((a, b) => a.x - b.x).map((b) => b36(b.x, 2) + char.get(code(b))).join('')).join(' ');
    return D36[level.chapter] + main + (extra.length ? `|${extra.join(' ')}` : '');
  });
  const text = [
    '// Раскладки уровней (300: 10 глав по 30). Файл собирает tools/arkanoid-levels.mjs — руками не править.',
    '// Строка уровня: глава (0–9), затем ряды через пробел: «yy» и тройки «xxC» (yy, xx — координаты левого верхнего',
    '// угла кирпича 32×18 в системе base36, C — вид кирпича из CODES); после «|» — повёрнутые кирпичи: «xxyyCrrss»',
    '// (rr — угол в градусах, ss — размер в %). Вид кирпича в CODES: тип (n обычный, h на три удара, x стальной,',
    '// e взрывной, p с бонусом, t запертый шарик), оттенок 0–5, форма (R прямоугольник, a–d прямоугольные треугольники,',
    '// U/D — треугольник вершиной вверх/вниз, C — круг) и, у кирпича с бонусом, какой именно бонус (пусто — случайный).',
    '// Разбор — parseLevel() в logic.js.',
    '',
    `export const ALPHABET = '${ALPHABET}';`,
    '',
    `export const CODES = '${codes.join(' ')}'.split(' ');`,
    '',
    'export const LEVELS = [',
    ...packed.map((s) => `  '${s}',`),
    '];',
    '',
  ].join('\n');
  return { levels, text };
}

/** Бот (не теряет шариков) проходит каждый уровень: сколько секунд игры это занимает. */
async function botSweep(levels, limit = 900) {
  const { gameFrom, step, launch, movePaddle, botTarget, LIVES } = await import('../games/arkanoid/logic.js');
  const times = [];
  for (const level of levels) {
    const rng = mulberry(level.n);
    const g = gameFrom({
      chapter: level.chapter,
      bricks: level.bricks.map((b) => ({ kind: b.k, tone: b.t, shape: b.s, bonus: b.b, x: b.x, y: b.y, rot: b.rot, scale: b.scale / 100 })),
    }, level.n);
    let t = 0;
    for (; t < limit && g.status !== 'won'; t += 1 / 60) {
      g.lives = LIVES;
      if (g.balls.some((b) => b.stuck !== null)) launch(g);
      movePaddle(g, g.paddle.x + Math.max(-30, Math.min(30, botTarget(g) - g.paddle.x)));
      step(g, 1 / 60, rng);
      g.events.length = 0;
    }
    times.push(t);
    if (g.status !== 'won') console.log(`${level.n} (${level.name}): НЕ ПРОЙДЕН, осталось ${g.left} из ${g.total}`);
    else if (t > 300) console.log(`${level.n} (${level.name}): ${Math.round(t)} с`);
  }
  const sorted = times.slice().sort((a, b) => a - b);
  console.log(`бот: медиана ${Math.round(sorted[sorted.length >> 1])} с, 90% — до ${Math.round(sorted[Math.floor(sorted.length * 0.9)])} с, самый долгий — ${Math.round(sorted[sorted.length - 1])} с`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { levels, text } = buildAll();
  if (process.argv.includes('--bot')) {
    await botSweep(levels);
    process.exit(0);
  }
  writeFileSync(new URL('../games/arkanoid/levels.js', import.meta.url), text);
  const json = process.argv.indexOf('--json');
  if (json > 0) writeFileSync(process.argv[json + 1], JSON.stringify(levels));
  const sizes = levels.map((l) => l.bricks.length);
  console.log(`уровней: ${levels.length}, кирпичей: ${Math.min(...sizes)}…${Math.max(...sizes)}, файл: ${text.length} байт`);
}
