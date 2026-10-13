// Основа расчёта «Лисьей охоты»: числа, случайность от зерна, геометрия, сетка для быстрого поиска соседей,
// очередь событий и общий реестр содержимого. Без DOM и без случайности «со стороны»: всё, что здесь есть,
// одинаково считается в браузере и в Node.
//
// Мир — в единицах: клетка T = 32, x вправо, y вниз, углы в радианах (0 — вправо, по часовой, как на экране).
// Место существа — середина ступней. Шаг расчёта H = 1/60 с.
//
// Реестр REG — куда content.js складывает зверей, оружие, вещи, комнаты и прочее из файлов содержимого. Движок
// (world, player, combat, ai, director) сам эти файлы не подключает и берёт всё отсюда: так файлы содержимого
// могут свободно звать функции движка, и ничего не зацикливается.

import { T, TILE, F_WALK, F_SHOT, F_LEAP, BLOCK, CHAR, MARKS, BIOMES, BIOME_NAMES, SIZES, tileX, tileY } from './tiles.js';

export { T, TILE, F_WALK, F_SHOT, F_LEAP, BLOCK, CHAR, MARKS, BIOMES, BIOME_NAMES, SIZES, tileX, tileY };

export const VERSION = 1;
export const H = 1 / 60;                    // шаг расчёта
export const TAU = Math.PI * 2;
export const F_MOB = 8;                     // сюда не заходят звери: открытый проём двери
export const F_ALL = F_WALK | F_SHOT | F_LEAP | F_MOB;
export const FOX_R = 9;                     // радиус лисы

/** Больше этого в комнате не бывает: лишнее просто не появляется. */
export const CAPS = { mobs: 48, shots: 220, picks: 80, zones: 40, things: 24, pals: 3, actors: 8, events: 480 };

/** Что делает особая земля (клетка «=») в каждом месте. */
export const SPECIAL_FX = { forest: 'grass', swamp: 'mud', taiga: 'ice', cave: 'hot', autumn: 'grass' };

// ---------- реестр содержимого ----------

export const REG = {
  MOBS: {},           // добыча, враги и хозяева мест
  WEAPONS: {},
  ARMOR: {},
  ACCESSORIES: {},
  POTIONS: {},
  GIFTS: {},
  EFFECTS: {},        // временные действия на лису: ускорение, ярость…
  PLACES: {},
  TASKS: {},
  HAZARDS: {},
  MINIONS: {},
  MODS: {},
  ROOMS: [],          // шаблоны комнат
  ROOM_BY_ID: {},
};

/** Своё ли это поле объекта (а не унаследованное вроде constructor): ключи приходят и из сохранений. */
export const own = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);

/** Вид вещи по её id: 'weapon' | 'armor' | 'acc' | 'potion' | null. */
export function kindOf(id) {
  if (own(REG.WEAPONS, id)) return 'weapon';
  if (own(REG.ARMOR, id)) return 'armor';
  if (own(REG.ACCESSORIES, id)) return 'acc';
  if (own(REG.POTIONS, id)) return 'potion';
  return null;
}

/** Описание вещи из реестра (или null). */
export function itemDef(id) {
  const kind = kindOf(id);
  if (kind === 'weapon') return REG.WEAPONS[id];
  if (kind === 'armor') return REG.ARMOR[id];
  if (kind === 'acc') return REG.ACCESSORIES[id];
  if (kind === 'potion') return REG.POTIONS[id];
  return null;
}

// ---------- случайность ----------

/** Следующее число 0…1 от зерна в состоянии (s.rs — uint32): партию можно сохранить и продолжить так же. */
export function rnd(s) {
  s.rs = (s.rs + 0x6d2b79f5) >>> 0;
  let x = s.rs;
  x = Math.imul(x ^ (x >>> 15), x | 1);
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
}
export const rand = (s, a, b) => a + (b - a) * rnd(s);
export const randInt = (s, a, b) => a + Math.floor(rnd(s) * (b - a + 1));
export const chance = (s, p) => rnd(s) < p;
export const pickOf = (s, list) => list[Math.floor(rnd(s) * list.length)];

// «Случайность-функция» для содержимого и генераторов: r() → 0…1 и удобные добавки.
function decorate(r) {
  r.range = (a, b) => a + (b - a) * r();
  r.int = (a, b) => a + Math.floor(r() * (b - a + 1));
  r.chance = (p) => r() < p;
  r.pick = (list) => list[Math.floor(r() * list.length)];
  r.shuffle = (list) => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = list[i];
      list[i] = list[j];
      list[j] = t;
    }
    return list;
  };
  /** Один из списка с весами: weight(item) → число ≥ 0. Все веса нулевые — null. */
  r.weighted = (list, weight) => {
    let total = 0;
    for (const item of list) total += Math.max(0, weight(item));
    if (!(total > 0)) return null;
    let at = r() * total;
    for (const item of list) {
      at -= Math.max(0, weight(item));
      if (at < 0) return item;
    }
    return list[list.length - 1];
  };
  return r;
}

/** Отдельная случайность от зерна — для генераторов (карта локации, обстановка комнаты): партию не трогает. */
export function rngFrom(seed) {
  const s = { rs: (seed >>> 0) || 1 };
  return decorate(() => rnd(s));
}

const BOUND = new WeakMap();
/** Случайность самой партии в виде функции — её получают обработчики содержимого (fire, start, build…). */
export function rndOf(G) {
  let r = BOUND.get(G);
  if (!r) {
    r = decorate(() => rnd(G));
    BOUND.set(G, r);
  }
  return r;
}

/** Перемешать два числа в одно uint32 — зёрна комнат и локаций. */
export function hash2(a, b) {
  let h = Math.imul((a ^ 0x9e3779b9) | 0, 0x85ebca6b) ^ Math.imul((b + 0x7f4a7c15) | 0, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return h >>> 0;
}

// ---------- геометрия ----------

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, k) => a + (b - a) * k;
export const dist2 = (ax, ay, bx, by) => (bx - ax) * (bx - ax) + (by - ay) * (by - ay);

/** На сколько повернуть от угла a к углу b кратчайшим путём (−π…π). */
export function angDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  else if (d < -Math.PI) d += TAU;
  return d;
}

/** Квадрат расстояния от точки до отрезка. */
export function segDist2(x1, y1, x2, y2, px, py) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = x1 + dx * t - px;
  const cy = y1 + dy * t - py;
  return cx * cx + cy * cy;
}

/** Задевает ли отрезок круг. */
export const segCircle = (x1, y1, x2, y2, cx, cy, r) => segDist2(x1, y1, x2, y2, cx, cy) <= r * r;

/** Круг (px, py, pr) задевает сектор: вершина (ox, oy), направление a, раствор arc, радиус r. */
export function inCone(ox, oy, a, arc, r, px, py, pr = 0) {
  const dx = px - ox;
  const dy = py - oy;
  const d2 = dx * dx + dy * dy;
  if (d2 > (r + pr) * (r + pr)) return false;
  if (d2 <= pr * pr) return true;
  const widen = pr > 0 ? Math.asin(Math.min(1, pr / Math.sqrt(d2))) : 0;
  return Math.abs(angDiff(a, Math.atan2(dy, dx))) <= arc / 2 + widen;
}

/** Круг задевает кольцо: середина (cx, cy), радиус r, толщина w. */
export function inRing(cx, cy, r, w, px, py, pr = 0) {
  return Math.abs(Math.hypot(px - cx, py - cy) - r) <= w / 2 + pr;
}

// ---------- сетка соседей ----------

/**
 * Равномерная сетка: раскладывает существ по клеткам, чтобы выстрел искал цель не среди всех, а среди ближних.
 * Кладётся середина существа, поэтому искать надо с запасом на самый большой радиус. Всё на заранее
 * выделенных массивах — в шаге расчёта ничего не создаётся.
 */
export function createGrid(cell = 64, maxCells = 512, maxItems = 64) {
  const start = new Int16Array(maxCells + 1);
  const fill = new Int16Array(maxCells);
  const items = new Int16Array(maxItems);
  let cols = 1;
  let rows = 1;
  const col = (x) => {
    const c = Math.floor(x / cell);
    return c < 0 ? 0 : c >= cols ? cols - 1 : c;
  };
  const row = (y) => {
    const c = Math.floor(y / cell);
    return c < 0 ? 0 : c >= rows ? rows - 1 : c;
  };
  return {
    /** Разложить list[0…n) (берутся x и y; у кого dead — пропускается) по полю w×h. */
    build(list, n, w, h) {
      cols = Math.max(1, Math.ceil(w / cell));
      rows = Math.max(1, Math.ceil(h / cell));
      while (cols * rows > maxCells) {
        if (cols > rows) cols -= 1;
        else rows -= 1;
      }
      const cells = cols * rows;
      const m = Math.min(n, maxItems);
      for (let i = 0; i <= cells; i++) start[i] = 0;
      for (let i = 0; i < m; i++) {
        const e = list[i];
        if (!e.dead) start[row(e.y) * cols + col(e.x) + 1] += 1;
      }
      for (let i = 0; i < cells; i++) {
        start[i + 1] += start[i];
        fill[i] = start[i];
      }
      for (let i = 0; i < m; i++) {
        const e = list[i];
        if (!e.dead) items[fill[row(e.y) * cols + col(e.x)]++] = i;
      }
    },
    /** Номера тех, чьи клетки задеты прямоугольником, — в out; возвращает, сколько их. */
    query(x0, y0, x1, y1, out) {
      const c0 = col(x0);
      const c1 = col(x1);
      const r0 = row(y0);
      const r1 = row(y1);
      let k = 0;
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const id = r * cols + c;
          for (let j = start[id]; j < start[id + 1] && k < out.length; j++) out[k++] = items[j];
        }
      }
      return k;
    },
  };
}

// ---------- списки ----------

/** Убрать i-й из списка, поставив на его место последний: порядок не важен, зато ничего не сдвигается. */
export function swapRemove(list, i) {
  const last = list.pop();
  if (i < list.length) list[i] = last;
}

// ---------- события ----------

/** Событие для рисования, звука и окон. Очередь разбирает игра каждый кадр; если её не разбирают — не растёт без конца. */
export function emit(G, e) {
  const q = G.events;
  if (q.length >= CAPS.events) q.splice(0, CAPS.events >> 1);
  q.push(e);
}

/** Звук: имя — из списка sounds.js. Всё, что звучит в расчёте, идёт только через эту функцию. */
export function sfx(G, id, x, y, v) {
  emit(G, { t: 'sfx', id, x, y, v });
}

/** Всплывающая надпись над местом (очки, «Мимо», «+1»). */
export const floatText = (G, x, y, s, c) => emit(G, { t: 'text', x, y, s, c });
/** Короткая подсказка внизу экрана. */
export const toast = (G, s) => emit(G, { t: 'toast', s });
/** Отклик телефона: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error'. */
export const haptic = (G, kind) => emit(G, { t: 'haptic', kind });

/** Плашка через весь экран (хозяин места, особая комната). */
export function banner(G, title, sub = '', kind = '') {
  emit(G, { t: 'banner', title, sub, kind });
}

/** Тряхнуть экран (a — сила 0…1). */
export function shake(G, a) {
  if (G.room && a > G.room.shake) G.room.shake = a;
  emit(G, { t: 'shake', a });
}
