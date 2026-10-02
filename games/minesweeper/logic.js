// Правила сапёра без DOM: поле, первый ход, открытие с заливкой пустот, флажки, «аккорд» по цифре, победа и
// поражение, 3BV, подсказка, сохранение, статистика, настройки. rng передаётся параметром (тесты — с зерном).
//
// Мины расставляются при первом открытии — первая клетка и её соседи свободны (первый ход всегда открывает
// пустоту, если мин не слишком много). «Без угадываний»: расстановки перебираются, пока поле не проходится одной
// логикой от первого хода (solver.js); не нашлось за TRY_BUDGET попыток или TIME_BUDGET мс — обычное поле
// (ng = false). Перебора хватает до ~22% мин (эксперт — в среднем 7 попыток, ~7 мс); плотнее нужен «сдвиг мин»,
// как у Tatham, — его нет, поэтому в своём поле выше NG_DENSITY предупреждаем.

import { makeCtx, numbersOf, solveFrom, deduce, probabilities } from './solver.js';

export const CLOSED = 0;
export const OPEN = 1;
export const FLAG = 2;
export const MARK = 3;

/** Сложности: классика Windows; «Сложный» на телефоне стоит вертикально (16×30), на широком экране — 30×16. */
export const DIFFS = {
  easy: { w: 9, h: 9, mines: 10 },
  medium: { w: 16, h: 16, mines: 40 },
  hard: { w: 16, h: 30, mines: 99 },
};
export const DIFF_IDS = ['easy', 'medium', 'hard', 'custom'];
export const LIMITS = { min: 5, maxW: 30, maxH: 30, density: 0.3 };
export const HINTS = 3;
export const NG_DENSITY = 0.22;
const TRY_BUDGET = 4000;
const TIME_BUDGET = 400;      // мс: дольше игрока не держим — плотное поле без угадываний перебором не найти

/** Сколько мин можно на поле w×h: не больше 30% и так, чтобы первый ход открывал пустоту. */
export const maxMines = (w, h) => Math.max(1, Math.min(Math.floor(w * h * LIMITS.density), w * h - 9));

export function mulberry32(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clampInt = (v, lo, hi, def) => (Number.isInteger(v) ? Math.max(lo, Math.min(hi, v)) : def);

/** Размеры партии по выбору: { w, h, mines }. landscape — широкий экран (сложное поле лёжа). */
export function sizeOf(setup, landscape = false) {
  if (setup.diff === 'custom') {
    const w = clampInt(setup.custom?.w, LIMITS.min, LIMITS.maxW, 12);
    const h = clampInt(setup.custom?.h, LIMITS.min, LIMITS.maxH, 16);
    return { w, h, mines: clampInt(setup.custom?.mines, 1, maxMines(w, h), Math.min(30, maxMines(w, h))) };
  }
  const d = DIFFS[setup.diff] ?? DIFFS.easy;
  if (setup.diff === 'hard' && landscape) return { w: d.h, h: d.w, mines: d.mines };
  return { ...d };
}

export function newGame({ diff = 'easy', w, h, mines, noGuess = true }) {
  const n = w * h;
  return {
    v: 1, diff, w, h, mines, noGuess: Boolean(noGuess), ng: false,
    mine: null, cells: new Array(n).fill(CLOSED),
    over: null, boom: -1, first: -1,
    time: 0, clicks: 0, hints: HINTS,
  };
}

const ctxOf = (g) => makeCtx(g.w, g.h);
export const neighborsOf = (g, i) => ctxOf(g).nb[i];

const numCache = new WeakMap();

/** Цифры поля (кэш по массиву мин — в сохранение не идёт). */
export function numbers(g) {
  if (!g.mine) return null;
  let nums = numCache.get(g.mine);
  if (!nums) {
    nums = numbersOf(ctxOf(g), g.mine);
    numCache.set(g.mine, nums);
  }
  return nums;
}

/**
 * Расставить мины перед первым открытием клетки first. → { tries, ng } (ng — поле проходится без угадываний).
 */
export function placeMines(g, first, rng = Math.random, clock = () => performance.now()) {
  const ctx = ctxOf(g);
  const zone = new Set([first]);
  if (g.w * g.h - g.mines >= 9) ctx.nb[first].forEach((j) => zone.add(j));
  const cand = [];
  for (let i = 0; i < ctx.n; i++) if (!zone.has(i)) cand.push(i);
  let best = null;
  let tries = 0;
  const limit = g.noGuess ? TRY_BUDGET : 1;
  const t0 = clock();
  while (tries < limit && (tries < 8 || clock() - t0 < TIME_BUDGET)) {
    tries++;
    for (let k = 0; k < g.mines; k++) {
      const j = k + Math.floor(rng() * (cand.length - k));
      [cand[k], cand[j]] = [cand[j], cand[k]];
    }
    const mine = new Array(ctx.n).fill(0);
    for (let k = 0; k < g.mines; k++) mine[cand[k]] = 1;
    if (!g.noGuess) {
      best = { mine, ng: false };
      break;
    }
    const res = solveFrom(g.w, g.h, mine, first);
    if (res.solved) {
      best = { mine, ng: true };
      break;
    }
    if (!best || res.opened > best.opened) best = { mine, ng: false, opened: res.opened };
  }
  g.mine = best.mine;
  g.ng = best.ng;
  g.first = first;
  return { tries, ng: best.ng };
}

/**
 * Открыть клетку i (флажок не открывается, «?» — открывается). → { opened: [{ i, d }] — по порядку с
 * расстоянием от i (для волны), boom } . Победа/поражение — в g.over.
 */
export function reveal(g, i) {
  if (g.over || !g.mine) return { opened: [], boom: false };
  const st = g.cells[i];
  if (st === OPEN || st === FLAG) return { opened: [], boom: false };
  if (g.mine[i]) {
    lose(g, i);
    return { opened: [], boom: true };
  }
  const opened = flood(g, [i]);
  checkWin(g);
  return { opened, boom: false };
}

/** Заливка: открыть клетки from, от пустых — дальше; флажки не трогаются. */
function flood(g, from) {
  const ctx = ctxOf(g);
  const nums = numbers(g);
  const out = [];
  const dist = new Map();
  const queue = [];
  for (const i of from) {
    if (g.cells[i] === OPEN || g.cells[i] === FLAG || g.mine[i]) continue;
    g.cells[i] = OPEN;
    dist.set(i, 0);
    queue.push(i);
  }
  for (let q = 0; q < queue.length; q++) {
    const c = queue[q];
    out.push({ i: c, d: dist.get(c) });
    if (nums[c] !== 0) continue;
    for (const j of ctx.nb[c]) {
      if (g.cells[j] === OPEN || g.cells[j] === FLAG || g.mine[j]) continue;
      g.cells[j] = OPEN;
      dist.set(j, dist.get(c) + 1);
      queue.push(j);
    }
  }
  return out;
}

/** Флажков вокруг клетки. */
export function flagsAround(g, i) {
  let f = 0;
  for (const j of neighborsOf(g, i)) if (g.cells[j] === FLAG) f++;
  return f;
}

/**
 * «Аккорд»: касание открытой цифры, вокруг которой стоит столько же флажков, открывает остальных соседей
 * (если флажок стоит не там — взрыв). → { opened, boom, fail } — fail: флажков не столько, сколько цифра.
 */
export function chord(g, i) {
  if (g.over || !g.mine || g.cells[i] !== OPEN) return { opened: [], boom: false, fail: false };
  const n = numbers(g)[i];
  if (!n) return { opened: [], boom: false, fail: false };
  const closed = neighborsOf(g, i).filter((j) => g.cells[j] === CLOSED || g.cells[j] === MARK);
  if (!closed.length) return { opened: [], boom: false, fail: false };
  if (flagsAround(g, i) !== n) return { opened: [], boom: false, fail: true, cells: closed };
  const bad = closed.find((j) => g.mine[j]);
  if (bad !== undefined) {
    lose(g, bad);
    return { opened: [], boom: true, fail: false };
  }
  const opened = flood(g, closed);
  checkWin(g);
  return { opened, boom: false, fail: false };
}

/** Флажок: закрытая → флажок → «?» (если включены) → закрытая. → новое состояние или null. */
export function toggleFlag(g, i, marks = false) {
  if (g.over) return null;
  const st = g.cells[i];
  if (st === OPEN) return null;
  const next = st === CLOSED ? FLAG : st === FLAG ? (marks ? MARK : CLOSED) : CLOSED;
  g.cells[i] = next;
  return next;
}

function lose(g, i) {
  g.over = 'lose';
  g.boom = i;
}

function checkWin(g) {
  if (g.over) return;
  let open = 0;
  for (const c of g.cells) if (c === OPEN) open++;
  if (open === g.w * g.h - g.mines) {
    g.over = 'win';
    // оставшиеся мины — под флажками, как в Windows
    g.cells = g.cells.map((c, i) => (g.mine[i] ? FLAG : c));
  }
}

export function flagCount(g) {
  let f = 0;
  for (const c of g.cells) if (c === FLAG) f++;
  return f;
}
export const minesLeft = (g) => g.mines - flagCount(g);

/** Доля открытых безопасных клеток (0…1). */
export function progressOf(g) {
  let open = 0;
  for (const c of g.cells) if (c === OPEN) open++;
  return open / (g.w * g.h - g.mines);
}

/**
 * 3BV — наименьшее число нажатий без флажков: каждая область пустых клеток (с её каймой) — одно нажатие,
 * плюс каждая цифра, которую не открывает ни одна пустота.
 */
export function bbbv(g) {
  if (!g.mine) return 0;
  const ctx = ctxOf(g);
  const nums = numbers(g);
  const seen = new Uint8Array(ctx.n);
  let count = 0;
  for (let i = 0; i < ctx.n; i++) {
    if (g.mine[i] || seen[i] || nums[i] !== 0) continue;
    count++;
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const c = stack.pop();
      for (const j of ctx.nb[c]) {
        if (seen[j] || g.mine[j]) continue;
        seen[j] = 1;
        if (nums[j] === 0) stack.push(j);
      }
    }
  }
  for (let i = 0; i < ctx.n; i++) if (!g.mine[i] && !seen[i]) count++;
  return count;
}

// ---------- подсказка ----------

/**
 * Что подсказать: { kind: 'start' } — поле ещё не открыто; { kind: 'flag', i } — флажок не на мине;
 * { kind: 'safe' | 'mine', i, rule, from } — логический вывод; { kind: 'guess', i, p } — без угадывания не
 * обойтись, i — самая безопасная клетка (вероятность мины p).
 * Знание — открытые цифры и флажки (неверные флажки подсказка показывает раньше всего), near — последняя
 * клетка игрока: из равных выводов берётся ближайший к ней.
 */
export function hintFor(g, near = -1) {
  if (!g.mine) return { kind: 'start' };
  const ctx = ctxOf(g);
  for (let i = 0; i < ctx.n; i++) if (g.cells[i] === FLAG && !g.mine[i]) return { kind: 'flag', i };
  const know = {
    open: Uint8Array.from(g.cells, (c) => (c === OPEN ? 1 : 0)),
    num: numbers(g),
    mine: Uint8Array.from(g.cells, (c) => (c === FLAG ? 1 : 0)),
    total: g.mines,
  };
  const dist = (i) => {
    if (near < 0) return 0;
    return Math.max(Math.abs((i % g.w) - (near % g.w)), Math.abs(Math.floor(i / g.w) - Math.floor(near / g.w)));
  };
  const r = deduce(ctx, know);
  if (r) {
    const safe = r.items.filter((it) => !it.mine);
    const pool = safe.length ? safe : r.items;
    const it = pool.reduce((a, b) => (dist(b.i) < dist(a.i) ? b : a));
    return { kind: it.mine ? 'mine' : 'safe', i: it.i, rule: it.rule, from: it.from };
  }
  const prob = probabilities(ctx, know);
  let best = -1;
  for (let i = 0; i < ctx.n; i++) {
    if (Number.isNaN(prob[i])) continue;
    if (best < 0 || prob[i] < prob[best] - 1e-9 || (Math.abs(prob[i] - prob[best]) <= 1e-9 && dist(i) < dist(best))) best = i;
  }
  return { kind: 'guess', i: best, p: best >= 0 ? prob[best] : 0 };
}

// ---------- сохранение ----------

/** Партия для хранилища: клетки и мины строками (поле до 900 клеток). */
export function serialize(g) {
  return {
    v: 1, diff: g.diff, w: g.w, h: g.h, mines: g.mines, noGuess: g.noGuess, ng: g.ng,
    mine: g.mine ? g.mine.join('') : null, cells: g.cells.join(''),
    over: g.over, boom: g.boom, first: g.first, time: Math.round(g.time), clicks: g.clicks, hints: g.hints,
  };
}

export function isValidState(s) {
  if (!s || typeof s !== 'object' || s.v !== 1) return false;
  const { w, h, mines } = s;
  if (![w, h, mines].every(Number.isInteger) || w < LIMITS.min || h < LIMITS.min || w > LIMITS.maxW || h > LIMITS.maxH) return false;
  // «Сложный» лёжа — 30×16: проверка размеров по максимуму сторон
  if (mines < 1 || mines > maxMines(w, h)) return false;
  if (!DIFF_IDS.includes(s.diff)) return false;
  const n = w * h;
  if (typeof s.cells !== 'string' || s.cells.length !== n || !/^[0-3]*$/.test(s.cells)) return false;
  if (s.mine !== null) {
    if (typeof s.mine !== 'string' || s.mine.length !== n || !/^[01]*$/.test(s.mine)) return false;
    let m = 0;
    for (const ch of s.mine) m += ch === '1';
    if (m !== mines) return false;
    for (let i = 0; i < n; i++) if (s.cells[i] === '1' && s.mine[i] === '1') return false;
  } else if (/[1]/.test(s.cells)) return false;
  if (![null, 'win', 'lose'].includes(s.over)) return false;
  if (!Number.isInteger(s.boom) || s.boom < -1 || s.boom >= n) return false;
  if (!Number.isInteger(s.first) || s.first < -1 || s.first >= n) return false;
  if (!Number.isFinite(s.time) || s.time < 0) return false;
  if (!Number.isInteger(s.clicks) || s.clicks < 0) return false;
  if (!Number.isInteger(s.hints) || s.hints < 0 || s.hints > 99) return false;
  return typeof s.noGuess === 'boolean' && typeof s.ng === 'boolean';
}

export function deserialize(s) {
  if (!isValidState(s)) return null;
  return {
    ...s,
    mine: s.mine === null ? null : [...s.mine].map(Number),
    cells: [...s.cells].map(Number),
  };
}

// ---------- статистика ----------

const emptyRow = () => ({ played: 0, wins: 0, best: 0, bestNg: 0, streak: 0, bestStreak: 0 });
export const emptyStats = () => Object.fromEntries(DIFF_IDS.map((d) => [d, emptyRow()]));

/** Проверка мягкая (без «побед не больше партий»): статистика сливается с других устройств, и одна странность не
 * должна выбрасывать всю статистику. */
export function isValidStats(s) {
  if (!s || typeof s !== 'object') return false;
  return DIFF_IDS.every((d) => {
    const r = s[d];
    return r && typeof r === 'object' && ['played', 'wins', 'best', 'bestNg', 'streak', 'bestStreak']
      .every((k) => Number.isFinite(r[k]) && r[k] >= 0);
  });
}

/** Записать партию: win — победа, ms — время. Рекорд времени — отдельно для полей «без угадываний». */
export function recordGame(stats, diff, { win, ms = 0, ng = false }) {
  const r = stats[diff] ?? (stats[diff] = emptyRow());
  r.played++;
  if (win) {
    r.wins++;
    r.streak++;
    r.bestStreak = Math.max(r.bestStreak, r.streak);
    if (diff !== 'custom' && ms > 0) {
      const key = ng ? 'bestNg' : 'best';
      if (!r[key] || ms < r[key]) r[key] = Math.round(ms);
    }
  } else r.streak = 0;
  return stats;
}

// ---------- выбор партии и настройки ----------

export const SKINS = ['telegram', 'classic', 'lawn', 'neon', 'ice', 'candy'];
export const SIZES = ['fit', 'normal', 'big'];

export function normalizeSetup(s) {
  const diff = DIFF_IDS.includes(s?.diff) ? s.diff : 'easy';
  const w = clampInt(s?.custom?.w, LIMITS.min, LIMITS.maxW, 12);
  const h = clampInt(s?.custom?.h, LIMITS.min, LIMITS.maxH, 16);
  const mines = clampInt(s?.custom?.mines, 1, maxMines(w, h), Math.min(30, maxMines(w, h)));
  return { diff, noGuess: s?.noGuess !== false, custom: { w, h, mines } };
}

export const HOLDS = { fast: 200, normal: 300, slow: 450 };
export const defaultSettings = () => ({ skin: 'telegram', size: 'normal', longPress: true, hold: 'normal', chord: true, marks: false });

export function normalizeSettings(s) {
  const d = defaultSettings();
  if (!s || typeof s !== 'object') return d;
  return {
    skin: SKINS.includes(s.skin) ? s.skin : d.skin,
    size: SIZES.includes(s.size) ? s.size : d.size,
    longPress: s.longPress !== false,
    hold: Object.hasOwn(HOLDS, s.hold) ? s.hold : d.hold,
    chord: s.chord !== false,
    marks: s.marks === true,
  };
}

/** Время для людей: 0:42, 12:05, 1:02:07. */
export function fmtTime(ms) {
  const t = Math.floor(ms / 1000);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = String(t % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
