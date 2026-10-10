// Прыгалка вверх: каракуля сама прыгает по платформам, игрок только ведёт её влево-вправо. Без DOM, тестируется
// в Node. Образец — Doodle Jump: прыжок всегда одной высоты, сквозь платформу снизу проходишь, сверху — отскок.
//
// Мир — тетрадный лист шириной W; высота y растёт вверх. По горизонтали лист замкнут: ушёл за правый край — вышел
// слева. cam — высота нижнего края экрана, она только растёт; упал ниже экрана — конец. Счёт — сколько клеток
// (CELL) набрано по высоте.
//
// Платформы идут рядами снизу вверх. В каждом ряду есть «надёжная» (не карандашная обманка), и между соседними
// рядами не больше MAX_GAP — меньше высоты прыжка, так что путь наверх есть всегда (тест проверяет это на сотнях
// зёрен и гоняет бота). Ряды собраны в «куски» (лесенка, зигзаг, обманки, качели…), чтобы подъём не был ровной
// кашей. Случайность — от зерна в состоянии (s.rs): партию можно сохранить и продолжить с того же места.

export const VERSION = 1;
export const W = 360;
export const CELL = 20;                     // клетка листа; счёт — в клетках
export const VIEW_MIN = 440;                // высота экрана в единицах мира (зависит от телефона)
export const VIEW_MAX = 860;
export const CAM_AT = 0.46;                 // каракуля не поднимается выше этой доли экрана — едет лист
export const STEP = 1 / 120;                // шаг расчёта

export const GRAVITY = 1900;
export const JUMP = 830;                    // скорость отскока; высота прыжка JUMP_H
export const JUMP_H = (JUMP * JUMP) / (2 * GRAVITY);      // ≈ 181
export const SPRING = JUMP * 1.6;           // пружинка: в 2,5 раза выше
export const ERASER = JUMP * 2.1;           // ластик-батут: в 4,4 раза выше, с кувырком
export const MAX_FALL = 1500;
export const MAX_GAP = 150;                 // между рядами надёжных платформ — не больше
export const MAX_REACH = JUMP_H - 15;       // …а с размахом качелей (в худшем их положении) — не больше этого
export const ONCE_BACK = 2.6;               // через столько секунд стёртая платформа проявляется снова

export const PLAT_W = 62;
export const FOOT = 11;                     // полуширина ступней
export const BODY_W = 28;
export const BODY_H = 36;
export const KEY_V = 470;                   // клавиши и «нажимать по краям»: скорость, разгон, остановка
export const KEY_ACC = 3400;
export const KEY_STOP = 2600;

/** Полёты: поймал — летишь вверх сам, ничего не задевая. */
export const FLIGHTS = {
  plane: { speed: 700, time: 3 },           // бумажный самолётик
  rocket: { speed: 1150, time: 4 },         // карандаш-ракета
};
export const FLY_EXIT = JUMP * 0.9;         // после полёта — ещё прыжок вверх, чтобы осмотреться
export const FLY_GRACE = 0.7;               // …и столько секунд враги не страшны: куда вынесет, игрок не выбирал
export const SHIELD_TIME = 10;              // наклейка-звёздочка: кляксы и двойки не страшны
export const FLIP_TIME = 0.75;              // кувырок после ластика

export const TYPES = ['solid', 'move', 'vert', 'once', 'crumble'];
export const RELIABLE = new Set(['solid', 'move', 'vert', 'once']);
export const ITEMS = ['spring', 'eraser', 'plane', 'rocket', 'star'];
/** Насколько далеко от середины пружинки / ластика может встать ступня, чтобы они сработали. */
export const ITEM_REACH = { spring: 19, eraser: 29 };
/** Размеры подбираемого: самолётик, ракета, звёздочка. */
export const PICK = { plane: { w: 34, h: 26 }, rocket: { w: 18, h: 46 }, star: { w: 24, h: 24 } };

/** Враги: клякса сидит на месте, двойка ходит туда-сюда; дырка в листе затягивает. */
export const FOES = {
  blot: { hw: 20, hh: 16 },
  two: { hw: 15, hh: 21 },
};
export const HOLE_PULL = 70;                // с такого расстояния дырка начинает тянуть
export const HOLE_KILL = 18;
export const HOLE_SPEED = 430;
export const HOLE_TIME = 0.85;              // сколько каракулю затягивает
export const OUT_TIME = 0.75;               // сколько она падает за экраном до итогов

/** С какой высоты (в клетках) что появляется. */
export const OPEN = {
  move: 60, springs: 90, crumble: 150, plane: 200, once: 260, sparse: 300, blot: 320, eraser: 400,
  vert: 520, two: 650, star: 700, rocket: 900, hole: 1100,
};
export const FULL = 2500;                   // на этой высоте сложность полная
export const START_CAM = -36;               // в начале под землёй видно немного листа
export const START_FREE = PLAT_W / 2 + FOOT + 22;       // над стартом платформы не ближе к середине листа
const AHEAD = 340;                          // платформы готовы на столько выше верхнего края экрана
const BELOW = 70;                           // и живут на столько ниже нижнего
const EDGE = PLAT_W / 2 + 6;                // середина платформы не ближе к краю листа

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, k) => a + (b - a) * k;
export const wrap = (x) => ((x % W) + W) % W;
/** Кратчайший путь от a до b по замкнутому листу (со знаком). */
export const wrapDist = (a, b) => {
  const d = wrap(b - a);
  return d > W / 2 ? d - W : d;
};
/** Пила −1…1…−1 с периодом 1: движение туда-обратно с постоянной скоростью. */
export const tri = (u) => {
  const f = u - Math.floor(u);
  return f < 0.5 ? 4 * f - 1 : 3 - 4 * f;
};
export const clampView = (h) => clamp(Number.isFinite(h) ? h : 640, VIEW_MIN, VIEW_MAX);
export const cellsOf = (y) => Math.max(0, Math.floor(y / CELL));
/**
 * Счёт — высота опоры, с которой каракуля прыгала выше всего (на земле — 0): top — докуда она долетала.
 * 0,1 — запас на шаг расчёта: верхняя точка прыжка попадает между шагами.
 */
export const score = (s) => cellsOf(s.top - JUMP_H + 0.1);
/** Сложность 0…1 на высоте y. */
export const diff = (y) => clamp(y / CELL / FULL, 0, 1);
const opened = (what, y) => y / CELL >= OPEN[what];

// ---------- случайность ----------

function rnd(s) {
  s.rs = (s.rs + 0x6d2b79f5) >>> 0;
  let x = s.rs;
  x = Math.imul(x ^ (x >>> 15), x | 1);
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
}
const pick = (s, a, b) => a + (b - a) * rnd(s);
const chance = (s, p) => rnd(s) < p;
const int = (s, a, b) => a + Math.floor(rnd(s) * (b - a + 1));

function weighted(s, table) {
  let total = 0;
  for (const k of Object.keys(table)) total += table[k];
  let r = rnd(s) * total;
  for (const k of Object.keys(table)) {
    r -= table[k];
    if (r < 0) return k;
  }
  return Object.keys(table)[0];
}

// ---------- новая партия ----------

export function newGame({ seed = 1, viewH = 640 } = {}) {
  const s = {
    v: VERSION,
    rs: (seed >>> 0) || 1,
    t: 0,
    viewH: clampView(viewH),
    cam: START_CAM,
    top: 0,
    phase: 'play',                          // play | dying | over
    cause: null,                            // fall | blot | two | hole
    dieT: 0,
    out: -1,                                // когда (по dieT) каракуля скрылась за нижним краем
    hole: 0,                                // id дырки, которая затянула
    p: { x: W / 2, y: 0, vx: 0, vy: 0, mv: 0, face: 1, fly: null, shield: 0, grace: 0, flip: 0 },
    plats: [{ id: 0, type: 'ground', x: W / 2, y: 0, w: W, item: null, gone: -1, hit: -1 }],
    foes: [],
    gen: { y: 0, x: W / 2, id: 0, last: '', reach: 0, spring: 0, pity: 7, foe: 6, flight: 0, chunks: 0 },
    run: { jumps: 0, springs: 0, stomps: 0, flights: 0 },
  };
  grow(s);
  return s;
}

// ---------- генератор ----------

function put(s, type, x, y, extra) {
  const a = { id: ++s.gen.id, type, x, y, w: PLAT_W, item: null, gone: -1, hit: -1, ...extra };
  s.plats.push(a);
  return a;
}

/** Движущаяся платформа: по всей ширине листа или на своём участке. */
function mover(s, y, x) {
  const d = diff(y);
  const speed = pick(s, 58, 96 + 50 * d);
  if (chance(s, 0.6)) {
    const range = W / 2 - EDGE;
    return { bx: W / 2, range, period: (4 * range) / speed, ph: rnd(s) };
  }
  const range = pick(s, 46, 88);
  return { bx: clamp(x, EDGE + range, W - EDGE - range), range, period: (4 * range) / speed, ph: rnd(s) };
}

function lifter(s, y) {
  const range = pick(s, 24, 32);
  return { by: y, range, period: (4 * range) / pick(s, 40, 62), ph: rnd(s) };
}

/** Следующее место по горизонтали: сдвиг от прошлого, через край листа — на другую сторону. */
function shiftX(s, from, lo = 42, hi = 172) {
  const span = W - 2 * EDGE;
  const d = pick(s, lo, hi) * (chance(s, 0.5) ? 1 : -1);
  return EDGE + ((((from + d - EDGE) % span) + span) % span);
}

/** Место в ряду подальше от занятых (taken — середины платформ ряда). */
function freeX(s, taken, min = 84) {
  let best = null;
  let bestGap = -1;
  for (let k = 0; k < 8; k++) {
    const x = pick(s, EDGE, W - EDGE);
    let gap = Infinity;
    for (const t of taken) gap = Math.min(gap, Math.abs(x - t));
    if (gap > bestGap) {
      best = x;
      bestGap = gap;
    }
  }
  return bestGap >= min ? best : null;
}

const gapMin = (d) => 36 + 44 * d;
const gapMax = (d) => 74 + 76 * d;

// Куски: каждый возвращает ряды { gap, type, x, extras: [{ type, x }], spring? } — снизу вверх.
const CHUNKS = {
  // первые ряды партии: густо, только обычные, на седьмой — пружинка (знакомство). Над местом старта пусто на
  // высоту прыжка: пока игрок не повёл каракулю, она прыгает на земле и сама наверх не уходит
  intro(s) {
    const rows = [];
    let x = W / 2;
    let y = 0;
    let side = chance(s, 0.5) ? 1 : -1;
    for (let k = 0; k < 9; k++) {
      const gap = pick(s, 42, 62);
      y += gap;
      if (y < JUMP_H + 20) {
        side = -side;
        x = W / 2 + side * pick(s, START_FREE, 128);
      } else x = clamp(x + pick(s, 48, 118) * (chance(s, 0.5) ? 1 : -1), EDGE, W - EDGE);
      rows.push({ gap, type: 'solid', x, extras: k % 3 === 1 && y >= JUMP_H + 20 ? [{ type: 'solid' }] : [], spring: k === 6 });
    }
    return rows;
  },
  // вперемешку — основа игры
  plain(s, y) {
    const d = diff(y);
    const rows = [];
    let x = s.gen.x;
    const n = int(s, 6, 10);
    for (let k = 0; k < n; k++) {
      const type = weighted(s, {
        solid: 1 - 0.72 * d,
        move: opened('move', y) ? 0.14 + 0.22 * d : 0,
        once: opened('once', y) ? 0.06 + 0.26 * d : 0,
        vert: opened('vert', y) ? 0.04 + 0.1 * d : 0,
      });
      x = shiftX(s, x);
      const extras = [];
      if (type !== 'move' && type !== 'vert') {
        if (chance(s, 0.3 - 0.2 * d)) extras.push({ type: 'solid' });
        if (opened('crumble', y) && chance(s, 0.12 + 0.26 * d)) extras.push({ type: 'crumble' });
      }
      rows.push({ gap: pick(s, gapMin(d), gapMax(d)), type, x, extras });
    }
    return rows;
  },
  // лесенка в одну сторону, через край листа
  stairs(s, y) {
    const d = diff(y);
    const rows = [];
    const dir = chance(s, 0.5) ? 1 : -1;
    const stepX = pick(s, 58, 86);
    const gap = lerp(52, 110, d) + pick(s, -6, 6);
    const span = W - 2 * EDGE;
    let x = s.gen.x;
    const n = int(s, 5, 8);
    for (let k = 0; k < n; k++) {
      x = EDGE + ((((x + dir * stepX - EDGE) % span) + span) % span);
      rows.push({ gap, type: opened('once', y) && chance(s, 0.25 * d) ? 'once' : 'solid', x, extras: [] });
    }
    return rows;
  },
  // от края к краю
  zigzag(s, y) {
    const d = diff(y);
    const rows = [];
    const left = pick(s, EDGE + 4, 104);
    const right = W - pick(s, EDGE + 4, 104);
    let side = s.gen.x < W / 2 ? 1 : 0;
    const n = int(s, 5, 8);
    for (let k = 0; k < n; k++) {
      side = 1 - side;
      rows.push({ gap: lerp(58, 124, d) + pick(s, -8, 8), type: 'solid', x: (side ? right : left) + pick(s, -10, 10), extras: [] });
    }
    return rows;
  },
  // одни ездящие
  movers(s, y) {
    const d = diff(y);
    const rows = [];
    const n = int(s, 4, 6);
    for (let k = 0; k < n; k++) rows.push({ gap: lerp(62, 116, d) + pick(s, -8, 8), type: 'move', x: pick(s, EDGE, W - EDGE), extras: [] });
    return rows;
  },
  // обманки: в ряду три платформы, настоящая одна
  fakes(s, y) {
    const d = diff(y);
    const rows = [];
    let slot = int(s, 0, 2);
    const n = int(s, 4, 6);
    for (let k = 0; k < n; k++) {
      slot = (slot + int(s, 1, 2)) % 3;
      const xs = [0, 1, 2].map((i) => 62 + i * 118 + pick(s, -12, 12));
      rows.push({
        gap: lerp(70, 112, d) + pick(s, -6, 6), type: 'solid', x: xs[slot],
        extras: xs.filter((_, i) => i !== slot).map((x) => ({ type: 'crumble', x })),
      });
    }
    return rows;
  },
  // одноразовые: назад дороги нет
  once(s, y) {
    const d = diff(y);
    const rows = [];
    let x = s.gen.x;
    const n = int(s, 5, 8);
    for (let k = 0; k < n; k++) {
      x = shiftX(s, x, 50, 150);
      rows.push({ gap: lerp(56, 116, d) + pick(s, -8, 8), type: 'once', x, extras: [] });
    }
    return rows;
  },
  // качели: ездят вверх-вниз
  lift(s) {
    const rows = [];
    let side = chance(s, 0.5) ? 1 : 0;
    const n = int(s, 3, 5);
    for (let k = 0; k < n; k++) {
      side = 1 - side;
      rows.push({ gap: pick(s, 84, 112), type: 'vert', x: (side ? W * 0.72 : W * 0.28) + pick(s, -40, 40), extras: [] });
    }
    return rows;
  },
  // дорожка пружинок
  springs(s, y) {
    const d = diff(y);
    const rows = [];
    let x = s.gen.x;
    const n = int(s, 5, 8);
    for (let k = 0; k < n; k++) {
      x = shiftX(s, x, 40, 130);
      rows.push({ gap: pick(s, gapMin(d) + 12, gapMax(d)), type: 'solid', x, extras: [], spring: chance(s, 0.75) });
    }
    return rows;
  },
  // редкие платформы на пределе прыжка
  sparse(s, y) {
    const d = diff(y);
    const rows = [];
    let x = s.gen.x;
    const n = int(s, 3, 5);
    for (let k = 0; k < n; k++) {
      x = shiftX(s, x, 60, 172);
      rows.push({ gap: gapMax(d) * pick(s, 0.86, 1), type: opened('move', y) && chance(s, 0.3) ? 'move' : 'solid', x, extras: [] });
    }
    return rows;
  },
};

function chooseChunk(s, y) {
  const g = s.gen;
  if (!g.chunks) return 'intro';
  const d = diff(y);
  const table = {
    plain: g.last === 'plain' ? 2.4 : 5,
    stairs: 1.2,
    zigzag: 1.2,
    movers: opened('move', y) ? 0.6 + 1.1 * d : 0,
    springs: opened('springs', y) ? 0.7 : 0,
    fakes: y / CELL >= OPEN.crumble + 60 ? 0.5 + 1 * d : 0,
    once: opened('once', y) ? 0.4 + 1.1 * d : 0,
    sparse: opened('sparse', y) ? 0.3 + 0.9 * d : 0,
    lift: opened('vert', y) ? 0.3 + 0.8 * d : 0,
  };
  if (g.last !== 'plain') table[g.last] = 0;
  return weighted(s, table);
}

/** Что положить на платформу (или ничего). */
function itemFor(s, a, forced) {
  const g = s.gen;
  const y = a.y;
  const d = diff(y);
  if (forced || g.spring >= g.pity || chance(s, 0.06)) {
    g.spring = 0;
    g.pity = int(s, 9, 16);
    return { kind: 'spring', ox: pick(s, -18, 18), hit: -1, taken: false };
  }
  g.spring += 1;
  if (opened('eraser', y) && chance(s, 0.022 + 0.012 * d)) return { kind: 'eraser', ox: pick(s, -6, 6), hit: -1, taken: false };
  if (y >= g.flight) {
    if (opened('rocket', y) && chance(s, 0.008)) {
      g.flight = y + 9000;
      return { kind: 'rocket', ox: pick(s, -12, 12), hit: -1, taken: false };
    }
    if (opened('plane', y) && chance(s, 0.018)) {
      g.flight = y + 4200;
      return { kind: 'plane', ox: pick(s, -10, 10), hit: -1, taken: false };
    }
  }
  if (opened('star', y) && chance(s, 0.012 + 0.012 * d)) return { kind: 'star', ox: pick(s, -14, 14), hit: -1, taken: false };
  return null;
}

/** На какую высоту каракуля подлетит с платформы: обычный прыжок, пружинка или ластик. */
const launchHeight = (a) => {
  const v = a.item?.kind === 'spring' ? SPRING : a.item?.kind === 'eraser' ? ERASER : JUMP;
  return (v * v) / (2 * GRAVITY);
};

/** Насколько середина каракули должна быть в стороне от середины врага, чтобы его не задеть. */
export const foeReach = (f) => (f.kind === 'hole' ? 46 : FOES[f.kind].hw + BODY_W / 2 - 4 + (f.range ?? 0));
/**
 * Достаёт ли каракуля до врага, прыгая с платформы a прямо вверх (по высоте). Дырка тянет и вверх: платформа
 * прямо над ней тоже считается — стоять на такой было бы страшно, а промахнуться мимо края — конец.
 */
export function underFoe(a, f) {
  const up = f.kind === 'hole' ? 60 : FOES[f.kind].hh + 6;
  const down = f.kind === 'hole' ? HOLE_PULL * 0.8 : FOES[f.kind].hh;
  const ay = a.type === 'vert' ? a.by : a.y;
  const reach = a.type === 'vert' ? a.range : 0;
  return ay - reach <= f.y + up && ay + reach + launchHeight(a) + BODY_H + 6 >= f.y - down;
}
/** Насколько середина платформы должна быть в стороне от врага, чтобы прыжок с любого её места был безопасен. */
export const foeKeep = (a, f) => a.w / 2 + FOOT + foeReach(f);

/**
 * Можно ли поставить врага f: под ним не должно быть платформ, с которых прыгаешь прямо в него. Мешающие
 * платформы этого же куска (fresh) отодвигаются в сторону; если мешает чужая или ездящая — нельзя.
 * Возвращает список сдвигов [{ a, x }] или null.
 */
function foeMoves(s, f, fresh) {
  const moves = [];
  for (const a of s.plats) {
    if (a.type === 'ground' || a.type === 'crumble' || !underFoe(a, f)) continue;
    const keep = foeKeep(a, f);
    if (a.type === 'move') {
      if (Math.abs(f.x - a.bx) < a.range + keep) return null;
      continue;
    }
    if (Math.abs(wrapDist(f.x, a.x)) >= keep) continue;
    if (!fresh.has(a.id)) return null;
    const left = f.x - keep - 2;
    const right = f.x + keep + 2;
    const fits = [left, right].filter((x) => x >= EDGE && x <= W - EDGE);
    if (!fits.length) return null;
    moves.push({ a, x: fits.length === 2 && Math.abs(right - a.x) < Math.abs(left - a.x) ? right : fits[0] });
  }
  return moves;
}

function placeFoes(s, rows, kind) {
  const g = s.gen;
  if (kind === 'fakes') return;                           // там всё держится на местах платформ
  const fresh = new Set(rows.flatMap((r) => r.all.map((a) => a.id)));
  for (let k = 1; k < rows.length - 1; k++) {
    if (g.foe > 0) {
      g.foe -= 1;
      continue;
    }
    const y0 = rows[k].y;
    if (!opened('blot', y0)) continue;
    const d = diff(y0);
    if (!chance(s, 0.08 + 0.17 * d)) continue;
    const f = {
      id: 0, dead: -1, x: 0,
      kind: weighted(s, { blot: 1, two: opened('two', y0) ? 0.7 : 0, hole: opened('hole', y0) ? 0.3 : 0 }),
      y: Math.min(y0 + pick(s, 62, 96), rows[rows.length - 1].y - 50),
    };
    if (f.kind === 'two') Object.assign(f, { bx: 0, range: pick(s, 34, 52), period: 1, ph: rnd(s) });
    const half = f.kind === 'hole' ? 30 : FOES[f.kind].hw + (f.range ?? 0);
    let best = null;
    for (let i = 0; i < 10 && !(best && !best.moves.length); i++) {
      f.x = pick(s, half + 8, W - half - 8);
      const moves = foeMoves(s, f, fresh);
      if (moves && (!best || moves.length < best.moves.length)) best = { x: f.x, moves };
    }
    if (!best) continue;
    f.x = best.x;
    f.id = ++g.id;
    if (f.kind === 'two') Object.assign(f, { bx: f.x, period: (4 * f.range) / pick(s, 46, 78) });
    for (const { a, x } of best.moves) {
      if (!s.plats.includes(a)) continue;                 // уже убрана: мешала соседке по ряду
      a.x = x;
      // наехала на соседа по ряду — лишняя из двух убирается (надёжная платформа ряда остаётся всегда)
      const row = rows.find((r) => r.all.includes(a));
      const hits = (o) => o !== a && Math.abs(o.x - a.x) < (o.w + a.w) / 2 + 12;
      const drop = row.main === a ? row.all.filter(hits) : row.all.some(hits) ? [a] : [];
      for (const o of drop) s.plats.splice(s.plats.indexOf(o), 1);
      row.all = row.all.filter((o) => !drop.includes(o));
    }
    g.x = rows[rows.length - 1].main.x;
    s.foes.push(f);
    g.foe = 3;
  }
}

function addChunk(s) {
  const g = s.gen;
  const kind = chooseChunk(s, g.y);
  const rows = CHUNKS[kind](s, g.y);
  const made = [];
  for (const row of rows) {
    let gap = clamp(row.gap, 34, MAX_GAP);
    // качели: соседний ряд не ближе размаха (не налезают друг на друга) и не дальше, чем допрыгнуть при любом
    // их положении — снизу качели могут быть в нижней точке, сверху — в верхней
    const lift = row.type === 'vert' ? lifter(s, 0) : null;
    const reach = (lift ? lift.range : 0) + g.reach;
    if (reach > 0) gap = clamp(gap, reach + (lift && g.reach ? 20 : 30), MAX_REACH - reach);
    const y = g.y + gap;
    const main = put(s, row.type, clamp(row.x, EDGE, W - EDGE), y,
      row.type === 'move' ? mover(s, y, row.x) : lift ? { ...lift, by: y } : null);
    if (row.type === 'move') main.x = main.bx + main.range * tri(main.ph);
    const taken = [main.x];
    const sidekicks = [main];
    for (const extra of row.extras) {
      const x = extra.x ?? freeX(s, taken);
      if (x == null) continue;
      taken.push(x);
      const a = put(s, extra.type, clamp(x, EDGE, W - EDGE), y);
      if (extra.type === 'solid' && chance(s, 0.04)) a.item = { kind: 'spring', ox: pick(s, -18, 18), hit: -1, taken: false };
      sidekicks.push(a);
    }
    if (row.type === 'solid' || row.type === 'move') main.item = itemFor(s, main, row.spring);
    made.push({ y, main, all: sidekicks });
    g.y = y;
    g.x = main.x;
    g.reach = lift ? lift.range : 0;
  }
  placeFoes(s, made, kind);
  g.last = kind;
  g.chunks += 1;
}

/** Достроить платформы выше экрана и убрать ушедшее вниз. */
export function grow(s) {
  const until = s.cam + s.viewH + AHEAD;
  while (s.gen.y < until) addChunk(s);
  const floor = s.cam - BELOW;
  // карандашная обманка, сломавшись, пропадает совсем; стёртая (once) остаётся — она проявится снова
  const spent = (a) => a.type === 'crumble' && a.gone >= 0 && s.t - a.gone > 1;
  const low = (a) => (a.type === 'vert' ? a.by + a.range : a.y) < floor;
  if (s.plats.some((a) => low(a) || spent(a))) s.plats = s.plats.filter((a) => !low(a) && !spent(a));
  if (s.foes.some((f) => f.y < floor - 40 || (f.dead >= 0 && s.t - f.dead > 1))) {
    s.foes = s.foes.filter((f) => (f.y >= floor - 40 && !(f.dead >= 0 && s.t - f.dead > 1)) || f.id === s.hole);
  }
}

// ---------- шаг ----------

/**
 * Продвинуть мир на dt секунд. input: dx — на сколько палец сдвинул каракулю за это время (единицы мира),
 * dir — −1 / 0 / 1 от клавиш. Возвращает события: { type: 'jump' | 'spring' | 'eraser' | 'crumble' | 'back' |
 * 'stomp' | 'bump' | 'fly' | 'flyend' | 'shield' | 'shieldend' | 'die' | 'over', … }.
 */
export function step(s, dt, input = {}) {
  const ev = [];
  if (s.phase === 'over' || !(dt > 0)) return ev;
  const n = Math.max(1, Math.ceil(dt / STEP - 1e-9));
  const h = dt / n;
  const dx = (Number.isFinite(input.dx) ? input.dx : 0) / n;
  const dir = input.dir > 0 ? 1 : input.dir < 0 ? -1 : 0;
  for (let k = 0; k < n && s.phase !== 'over'; k++) sub(s, h, dx, dir, ev);
  if (s.phase === 'play') grow(s);
  return ev;
}

/** Свободный полёт за время h: скорость меняется ровно, путь — по средней скорости (так прыжок выходит точной высоты). */
function fall(p, h) {
  const v = p.vy;
  p.vy = Math.max(-MAX_FALL, v - GRAVITY * h);
  p.y += ((v + p.vy) / 2) * h;
}

function sub(s, h, dx, dir, ev) {
  s.t += h;
  for (const a of s.plats) {
    if (a.type === 'move') a.x = a.bx + a.range * tri(s.t / a.period + a.ph);
    else if (a.type === 'vert') {
      a.py = a.y;
      a.y = a.by + a.range * tri(s.t / a.period + a.ph);
    } else if (a.type === 'once' && a.gone >= 0 && s.t - a.gone >= ONCE_BACK) {
      a.gone = -1;
      a.back = s.t;
      ev.push({ type: 'back', id: a.id, x: a.x, y: a.y });
    }
  }
  for (const f of s.foes) if (f.kind === 'two' && f.dead < 0) f.x = f.bx + f.range * tri(s.t / f.period + f.ph);
  if (s.phase === 'dying') {
    dying(s, h, ev);
    return;
  }
  const p = s.p;
  const acc = (dir ? KEY_ACC : KEY_STOP) * h;
  p.vx += clamp(dir * KEY_V - p.vx, -acc, acc);
  const mx = dx + p.vx * h;
  p.x = wrap(p.x + mx);
  p.mv = mx / h;
  if (Math.abs(p.mv) > 50) p.face = p.mv > 0 ? 1 : -1;

  const y0 = p.y;
  if (p.fly) {
    p.vy = FLIGHTS[p.fly.kind].speed;
    p.y += p.vy * h;
    p.fly.left -= h;
    if (p.fly.left <= 0) {
      ev.push({ type: 'flyend', kind: p.fly.kind });
      p.fly = null;
      p.vy = FLY_EXIT;
      p.grace = FLY_GRACE;
    }
  } else fall(p, h);
  if (p.shield > 0) {
    p.shield -= h;
    if (p.shield <= 0) {
      p.shield = 0;
      ev.push({ type: 'shieldend' });
    }
  }
  if (p.flip > 0) p.flip = Math.max(0, p.flip - h / FLIP_TIME);
  if (p.grace > 0) p.grace = Math.max(0, p.grace - h);

  // скрылась за нижним краем — конец: то, что лежит ниже экрана (его ещё не убрали), уже не спасёт
  if (p.y + BODY_H < s.cam) {
    die(s, 'fall', ev);
    return;
  }
  if (!p.fly) {
    if (p.vy <= 0) land(s, y0, ev);
    pickups(s, ev);
  }
  if (meetFoes(s, y0, h, ev)) return;

  const line = s.cam + s.viewH * CAM_AT;
  if (p.y > line) s.cam += p.y - line;
  if (p.y > s.top) s.top = p.y;
}

function land(s, y0, ev) {
  const p = s.p;
  let best = null;
  for (const a of s.plats) {
    if (a.gone >= 0) continue;
    const before = a.type === 'vert' ? a.py ?? a.y : a.y;
    if (y0 < before - 0.001 || p.y > a.y) continue;
    if (Math.abs(wrapDist(p.x, a.x)) > a.w / 2 + FOOT) continue;
    if (!best || a.y > best.y) best = a;
  }
  if (!best) return;
  if (best.type === 'crumble') {
    best.gone = s.t;
    ev.push({ type: 'crumble', id: best.id, x: best.x, y: best.y });
    return;
  }
  let type = 'jump';
  let v = JUMP;
  const it = best.item;
  if (it && ITEM_REACH[it.kind] && Math.abs(wrapDist(p.x, best.x + it.ox)) <= ITEM_REACH[it.kind]) {
    type = it.kind;
    v = it.kind === 'spring' ? SPRING : ERASER;
    it.hit = s.t;
    if (it.kind === 'eraser') p.flip = 1;
    s.run.springs += 1;
  }
  p.y = best.y;
  p.vy = v;
  best.hit = s.t;
  if (best.type !== 'ground') s.run.jumps += 1;
  if (best.type === 'once') best.gone = s.t;
  ev.push({ type, id: best.id, x: p.x, y: best.y, plat: best.type });
}

function pickups(s, ev) {
  const p = s.p;
  for (const a of s.plats) {
    const it = a.item;
    if (!it || it.taken || a.gone >= 0) continue;
    const box = PICK[it.kind];
    if (!box) continue;
    if (Math.abs(wrapDist(p.x, a.x + it.ox)) > (BODY_W + box.w) / 2) continue;
    if (p.y > a.y + box.h || p.y + BODY_H < a.y) continue;
    it.taken = true;
    if (it.kind === 'star') {
      p.shield = SHIELD_TIME;
      ev.push({ type: 'shield', x: a.x + it.ox, y: a.y });
    } else {
      p.fly = { kind: it.kind, left: FLIGHTS[it.kind].time };
      p.vy = FLIGHTS[it.kind].speed;
      p.flip = 0;
      s.run.flights += 1;
      ev.push({ type: 'fly', kind: it.kind, x: a.x + it.ox, y: a.y });
      return;
    }
  }
}

/** Встреча с врагами; true — каракуля погибла. */
function meetFoes(s, y0, h, ev) {
  const p = s.p;
  for (const f of s.foes) {
    if (f.dead >= 0) continue;
    const dx = wrapDist(p.x, f.x);
    if (f.kind === 'hole') {
      if (p.fly || p.grace > 0) continue;
      const dy = f.y - (p.y + BODY_H / 2);
      const dist = Math.hypot(dx, dy);
      if (dist < HOLE_KILL) {
        s.hole = f.id;
        die(s, 'hole', ev);
        return true;
      }
      if (dist < HOLE_PULL) {
        const pull = HOLE_SPEED * (1 - dist / HOLE_PULL) ** 2 * h;
        p.x = wrap(p.x + (dx / dist) * pull);
        p.y += (dy / dist) * pull;
      }
      continue;
    }
    const box = FOES[f.kind];
    if (Math.abs(dx) > box.hw + BODY_W / 2 - 4) continue;
    if (p.y > f.y + box.hh || p.y + BODY_H - 6 < f.y - box.hh) continue;
    if (p.fly || p.shield > 0 || p.grace > 0) {
      f.dead = s.t;
      s.run.stomps += 1;
      ev.push({ type: 'bump', kind: f.kind, x: f.x, y: f.y });
      continue;
    }
    if (p.vy < 0 && y0 >= f.y - 2) {
      f.dead = s.t;
      p.vy = JUMP;
      s.run.stomps += 1;
      s.run.jumps += 1;
      ev.push({ type: 'stomp', kind: f.kind, x: f.x, y: f.y });
      continue;
    }
    die(s, f.kind, ev);
    return true;
  }
  return false;
}

function die(s, cause, ev) {
  s.phase = 'dying';
  s.cause = cause;
  s.dieT = 0;
  s.out = cause === 'fall' ? 0 : -1;
  s.p.fly = null;
  s.p.shield = 0;
  s.p.grace = 0;
  s.p.vx = 0;
  if (cause === 'blot' || cause === 'two') s.p.vy = 320;
  ev.push({ type: 'die', cause });
}

function dying(s, h, ev) {
  const p = s.p;
  s.dieT += h;
  if (s.cause === 'hole') {
    const f = s.foes.find((x) => x.id === s.hole);
    if (f) {
      const k = 1 - 0.002 ** h;
      p.x = wrap(p.x + wrapDist(p.x, f.x) * k);
      p.y += (f.y - BODY_H / 2 - p.y) * k;
    }
    if (s.dieT >= HOLE_TIME) over(s, ev);
    return;
  }
  fall(p, h);
  if (s.out < 0 && p.y + BODY_H < s.cam) s.out = s.dieT;
  if ((s.out >= 0 && s.dieT - s.out >= OUT_TIME) || s.dieT > 3.5) over(s, ev);
}

function over(s, ev) {
  s.phase = 'over';
  ev.push({ type: 'over', cause: s.cause });
}

// ---------- бот ----------

/** Через сколько секунд каракуля, летя как сейчас, опустится на высоту y (или null — не достанет). */
export function landTime(p, y) {
  const disc = p.vy * p.vy + 2 * GRAVITY * (p.y - y);
  if (disc < 0) return null;
  return (p.vy + Math.sqrt(disc)) / GRAVITY;
}

const platXAt = (a, t) => (a.type === 'move' ? a.bx + a.range * tri(t / a.period + a.ph) : a.x);
const platYAt = (a, t) => (a.type === 'vert' ? a.by + a.range * tri(t / a.period + a.ph) : a.y);

/**
 * Бот для проверки проходимости, записи ролика и отладки: выбирает платформу, до которой допрыгнет, и ведёт к ней
 * каракулю, обходя врагов. bot(s, dt) → сдвиг dx за этот кадр. vmax — как быстро «ведёт пальцем».
 */
export function createBot({ vmax = 620 } = {}) {
  let plan = null;                          // { id, mode, dir, go } — куда и как вести
  let think = 0;
  let from = 0;                             // высота последнего отскока: за пружинкой ниже неё бот не спускается
  let lastVy = 0;

  /**
   * Пройдёт ли каракуля к точке tx за время tl, не задев врага: её путь считается по шагам. Сначала wait секунд
   * стоит на месте, потом едет со скоростью speed — кратчайшим путём или, если задано dir, только в эту сторону.
   */
  function safe(s, tx, tl, speed, wait = 0, dir = 0) {
    const p = s.p;
    if (!s.foes.some((f) => f.dead < 0)) return true;
    let x = p.x;
    let y = p.y;
    let vy = p.vy;
    let left = dir ? wrap((tx - p.x) * dir) : 0;          // сколько ещё ехать в заданную сторону
    const h = 1 / 40;
    for (let t = 0; t < tl + 0.02; t += h) {
      const prevY = y;
      const v0 = vy;
      vy = Math.max(-MAX_FALL, vy - GRAVITY * h);
      y += ((v0 + vy) / 2) * h;
      if (t >= wait) {
        if (dir) {
          const go = Math.min(left, speed * h);
          left -= go;
          x = wrap(x + dir * go);
        } else x = wrap(x + clamp(wrapDist(x, tx), -speed * h, speed * h));
      }
      for (const f of s.foes) {
        if (f.dead >= 0) continue;
        if (f.kind === 'hole') {
          if (Math.hypot(wrapDist(x, f.x), f.y - (y + BODY_H / 2)) < HOLE_PULL * 0.86) return false;
          continue;
        }
        const box = FOES[f.kind];
        const fx = f.kind === 'two' ? f.bx + f.range * tri((s.t + t) / f.period + f.ph) : f.x;
        if (Math.abs(wrapDist(x, fx)) > box.hw + BODY_W / 2 + 6) continue;
        if (y > f.y + box.hh + 4 || y + BODY_H < f.y - box.hh - 6) continue;
        if (vy < 0 && prevY >= f.y + 2) continue;         // сверху — раздавит
        return false;
      }
    }
    return true;
  }

  // когда и на какой высоте каракуля опустится на платформу (качели за это время уедут) — или null
  function eta(s, a) {
    let y = a.y;
    let tl = landTime(s.p, y);
    for (let k = 0; k < 3 && tl !== null && a.type === 'vert'; k++) {
      y = platYAt(a, s.t + tl);
      tl = landTime(s.p, y);
    }
    return tl === null ? null : { tl, y };
  }

  /** Как доехать до точки безопасно: спокойно, сразу быстро, выждать и быстро или в обход через край листа. */
  function route(s, aim, tl, dist) {
    const need = Math.min(vmax, dist / Math.max(tl * 0.75, 0.03));
    if (safe(s, aim, tl, need)) return { mode: 'calm' };
    if (safe(s, aim, tl, vmax)) return { mode: 'fast' };
    const spare = tl - dist / vmax - 0.06;
    for (const part of [1, 0.6, 0.3]) {
      if (spare * part > 0.05 && safe(s, aim, tl, vmax, spare * part)) return { mode: 'late', go: s.t + spare * part };
    }
    const dir = wrapDist(s.p.x, aim) > 0 ? -1 : 1;        // в обход — в другую сторону
    if ((W - dist) / vmax < tl - 0.04 && safe(s, aim, tl, vmax, 0, dir)) return { mode: 'far', dir };
    return null;
  }

  /** Самолётик, карандаш или звёздочку можно подхватить на лету, пока каракуля поднимается мимо. */
  function grab(s) {
    const p = s.p;
    if (p.vy <= 0) return null;
    for (const a of s.plats) {
      const it = a.item;
      // с ездящей платформы на лету не берём: пока долетишь, она уедет, а путь к ней может лежать через врага
      if (!it || it.taken || a.gone >= 0 || !PICK[it.kind] || a.type === 'move') continue;
      const up = a.y + 6 - p.y;                           // на сколько ещё подняться, чтобы задеть
      const disc = p.vy * p.vy - 2 * GRAVITY * up;
      if (up < -BODY_H || disc < 0 || a.y < s.cam) continue;
      const tl = Math.max(0, (p.vy - Math.sqrt(disc)) / GRAVITY);
      const aim = platXAt(a, s.t + tl) + it.ox;
      if (Math.abs(wrapDist(p.x, aim)) > vmax * tl * 0.9 + 12) continue;
      if (safe(s, aim, tl, vmax)) return { id: a.id, mode: 'grab' };
    }
    return null;
  }

  function choose(s) {
    const p = s.p;
    const apex = p.y + (p.vy > 0 ? (p.vy * p.vy) / (2 * GRAVITY) : 0);
    let best = grab(s);
    if (best) return { best, rescue: null };
    let bestScore = -Infinity;
    let rescue = null;
    let rescueLack = Infinity;
    for (const a of s.plats) {
      if (a.gone >= 0 || a.type === 'crumble') continue;
      const at = eta(s, a);
      if (!at || at.y > apex - 6 || at.y < s.cam - BODY_H + 8) continue;   // ниже экрана — уже не достать
      const { tl, y: top } = at;
      const it = a.item && !a.item.taken ? a.item : null;
      const aim = a.type === 'ground' ? p.x : platXAt(a, s.t + tl) + (it && ITEM_REACH[it.kind] ? it.ox : 0);
      const dist = Math.abs(wrapDist(p.x, aim));
      const lack = dist - (vmax * tl + (a.type === 'ground' ? W : 16));
      if (lack > 0) {
        if (lack < rescueLack) {
          rescue = { id: a.id, mode: 'fast' };
          rescueLack = lack;
        }
        continue;
      }
      // за пружинкой, ластиком и особенно за самолётиком стоит свернуть с прямой дороги
      const bonus = !it || top < from + 20 ? 0 : it.kind === 'spring' ? 110 : it.kind === 'eraser' ? 200 : it.kind === 'star' ? 60 : 700;
      const value = top + bonus - dist * 0.12 - (a.type === 'move' ? 18 : 0) - (a.type === 'vert' ? 26 : 0)
        + (plan && plan.id === a.id ? 12 : 0);            // от выбранного не отказываемся из-за мелочи
      if (value <= bestScore) continue;
      const way = route(s, aim, tl, dist);
      if (!way) continue;
      best = { id: a.id, ...way };
      bestScore = value;
    }
    return { best, rescue };
  }

  function bot(s, dt) {
    const p = s.p;
    if (p.vy > lastVy + 200) from = p.y;
    lastVy = p.vy;
    if (s.phase !== 'play' || p.fly) {
      plan = null;
      return 0;
    }
    think -= dt;
    const target = plan && s.plats.find((a) => a.id === plan.id && a.gone < 0);
    if (!target || think <= 0 || p.vy > JUMP * 0.97) {
      const { best, rescue } = choose(s);
      // обход через край уже начат — направление не меняем; безопасного пути не видно — держимся прежнего
      // (остановиться посреди прыжка хуже всего)
      if (!best) plan = target ? plan : rescue;
      else plan = plan && target && best.id === plan.id && plan.mode === 'far' && best.mode !== 'calm' ? plan : best;
      think = 0.08;
    }
    if (!plan) return 0;
    const a = s.plats.find((x) => x.id === plan.id);
    if (!a) return 0;
    if (plan.mode === 'grab') return clamp(wrapDist(p.x, a.x + (a.item?.ox ?? 0)), -vmax * dt, vmax * dt);
    const tl = eta(s, a)?.tl ?? 0.1;
    const it = a.item && !a.item.taken && ITEM_REACH[a.item.kind] ? a.item.ox : 0;
    const aim = a.type === 'ground' ? p.x : platXAt(a, s.t + tl) + it;
    const d = wrapDist(p.x, aim);
    if (plan.mode === 'late' && s.t < plan.go) return 0;
    if (plan.mode === 'far' && Math.abs(d) > 8 && Math.sign(d) !== plan.dir) return plan.dir * vmax * dt;
    const speed = plan.mode === 'calm' ? Math.min(vmax, Math.abs(d) / Math.max(tl * 0.75, dt)) : vmax;
    return clamp(d, -speed * dt, speed * dt);
  }
  /** К какой платформе бот ведёт сейчас (id) — для отладки. */
  bot.target = () => plan?.id ?? null;
  bot.mode = () => plan?.mode ?? null;
  return bot;
}

// ---------- сохранение ----------

const num = (v) => typeof v === 'number' && Number.isFinite(v);
const nat = (v) => Number.isInteger(v) && v >= 0;

function validItem(it) {
  if (it === null) return true;
  return Boolean(it) && ITEMS.includes(it.kind) && num(it.ox) && Math.abs(it.ox) <= PLAT_W && num(it.hit) && typeof it.taken === 'boolean';
}

function validPlat(a) {
  if (!a || !nat(a.id) || !num(a.x) || !num(a.y) || !num(a.w) || a.w <= 0 || a.w > W || !num(a.gone) || !num(a.hit)) return false;
  if (a.type !== 'ground' && !TYPES.includes(a.type)) return false;
  if (a.type === 'move' && !(num(a.bx) && num(a.range) && num(a.ph) && num(a.period) && a.period > 0)) return false;
  if (a.type === 'vert' && !(num(a.by) && num(a.range) && num(a.ph) && num(a.period) && a.period > 0)) return false;
  return validItem(a.item ?? null);
}

function validFoe(f) {
  if (!f || !nat(f.id) || !num(f.x) || !num(f.y) || !num(f.dead)) return false;
  if (f.kind === 'two') return num(f.bx) && num(f.range) && num(f.ph) && num(f.period) && f.period > 0;
  return f.kind === 'blot' || f.kind === 'hole';
}

/** Годится ли сохранённая партия, чтобы её продолжить (сохраняется только идущая). */
export function isValidState(d) {
  if (!d || typeof d !== 'object' || d.v !== VERSION || d.phase !== 'play') return false;
  if (!nat(d.rs) || d.rs > 0xffffffff || !num(d.t) || d.t < 0 || !num(d.viewH) || !num(d.cam) || d.cam < START_CAM || !num(d.top) || d.top < 0) return false;
  const p = d.p;
  if (!p || !num(p.x) || p.x < 0 || p.x >= W || !num(p.y) || p.y < d.cam - BODY_H - 1 || p.y > d.cam + VIEW_MAX) return false;
  if (!num(p.vx) || !num(p.vy) || Math.abs(p.vy) > 4000 || (p.face !== 1 && p.face !== -1)) return false;
  if (!num(p.shield) || p.shield < 0 || p.shield > SHIELD_TIME || !num(p.flip) || p.flip < 0 || p.flip > 1) return false;
  if (!num(p.grace) || p.grace < 0 || p.grace > FLY_GRACE) return false;
  if (p.fly !== null && !(p.fly && FLIGHTS[p.fly.kind] && num(p.fly.left) && p.fly.left > 0 && p.fly.left <= FLIGHTS[p.fly.kind].time)) return false;
  if (!Array.isArray(d.plats) || d.plats.length > 400 || !d.plats.every(validPlat)) return false;
  if (!Array.isArray(d.foes) || d.foes.length > 100 || !d.foes.every(validFoe)) return false;
  const g = d.gen;
  if (!g || !num(g.y) || g.y < d.cam || !num(g.x) || !nat(g.id) || typeof g.last !== 'string' || !(g.last === '' || g.last in CHUNKS)) return false;
  if (!num(g.reach) || g.reach < 0 || g.reach > 60) return false;
  if (!nat(g.spring) || !nat(g.pity) || !nat(g.foe) || !num(g.flight) || !nat(g.chunks) || g.chunks < 1) return false;
  const r = d.run;
  return Boolean(r) && ['jumps', 'springs', 'stomps', 'flights'].every((k) => nat(r[k]));
}

/** Снимок идущей партии (или null — сохранять нечего: она кончается или каракуля ещё не ушла с земли). */
export function snapshot(s) {
  if (!s || s.phase !== 'play' || score(s) <= 0) return null;
  return JSON.parse(JSON.stringify(s));
}

/** Партия из снимка под экран высотой viewH, или null, если снимок не годится. */
export function restore(data, viewH) {
  if (!isValidState(data)) return null;
  const s = JSON.parse(JSON.stringify(data));
  s.viewH = clampView(viewH ?? s.viewH);
  s.cause = null;
  s.dieT = 0;
  s.out = -1;
  s.hole = 0;
  s.p.mv = 0;
  s.p.vx = 0;
  grow(s);
  return s;
}

// ---------- статистика ----------

export const emptyStats = () => ({ games: 0, best: 0, cells: 0, jumps: 0, springs: 0, stomps: 0, flights: 0 });

export function isValidStats(v) {
  return Boolean(v) && typeof v === 'object' && Object.keys(emptyStats()).every((k) => nat(v[k]));
}

/** Статистика после партии. */
export function recordGame(stats, s) {
  const cells = score(s);
  return {
    games: stats.games + 1,
    best: Math.max(stats.best, cells),
    cells: stats.cells + cells,
    jumps: stats.jumps + s.run.jumps,
    springs: stats.springs + s.run.springs,
    stomps: stats.stomps + s.run.stomps,
    flights: stats.flights + s.run.flights,
  };
}
