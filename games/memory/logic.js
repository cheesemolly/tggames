// «Мемори»: карточки лежат рубашкой вверх, открываешь по две (или по три в «Тройках») и ищешь одинаковые.
// Здесь — правила без DOM: раздача, ход, джокер и бонусные пары, ошибки, жизни и время, звёзды, уровни.
// rng передаётся параметром (в тестах — с зерном).
//
// Бонусные пары (особые карточки, открываются как обычные — действуют, когда собраны):
//   gold   — золотая: очки ×3;
//   eye    — «глаз»: на мгновение показывает все закрытые карточки;
//   vortex — «вихрь»: оставшиеся закрытые карточки перемешиваются (что запомнил — забудь);
//   clock  — «часы»: +10 секунд (только в режиме «На время»);
//   heart  — «сердце»: +1 жизнь (только в режиме «Три ошибки»);
//   joker  — джокер (2 шт.): подходит к любой карточке — открыл джокер и любую, и вся её группа уходит.
// «bonus» в описании уровня — часы, сердце или золото, смотря по режиму.
//
// Ошибка — не любой промах, а промах, которого можно было избежать: вторая карточка уже была видна,
// или пара первой уже была видна (надо было открыть её). Промах вслепую (обе новые) ошибкой не считается.
// По ошибкам — звёзды и жизни. Так честно: везение в первых открытиях не наказывает.

import { makeFaces, findSet, maxKeys, shuffle } from './sets.js';

export const SIZES = [
  { id: '3x4', cols: 3, rows: 4 },
  { id: '4x4', cols: 4, rows: 4 },
  { id: '4x5', cols: 4, rows: 5 },
  { id: '4x6', cols: 4, rows: 6 },
  { id: '5x6', cols: 5, rows: 6 },
  { id: '6x6', cols: 6, rows: 6 },
];
export const findSize = (id) => SIZES.find((s) => s.id === id) ?? null;

export const SPECIALS = ['gold', 'eye', 'vortex', 'clock', 'heart', 'joker'];
export const PRESSURES = ['calm', 'lives', 'time'];
export const LIVES = 3;
export const MAX_LIVES = 5;
export const CLOCK_BONUS_MS = 10000;
export const MAX_COMBO = 5;
export const WORDS_MAX_COLS = 4;

/** Можно ли разложить поле на группы (с джокерами или без). */
export function fits(size, group, joker = false) {
  const n = size.cols * size.rows - (joker ? 2 : 0);
  return n > 0 && n % group === 0;
}

/** «bonus» → бонус, который имеет смысл в этом режиме. */
const resolveBonus = (special, pressure) => {
  if (special !== 'bonus') return special;
  return pressure === 'time' ? 'clock' : pressure === 'lives' ? 'heart' : 'gold';
};

/** Время на партию: по 2,6 с на карточку (3,2 с в «Тройках») + 8 с. */
export const timeLimit = (cards, group) => Math.round(((group === 3 ? 3.2 : 2.6) * cards + 8) * 1000);

// ---------- раздача ----------

/**
 * Новая партия.
 * cfg: { cols, rows, group: 2|3, set, specials: [...], pressure, mode: 'levels'|'free', level? }
 */
export function newGame(cfg, rng = Math.random) {
  const { cols, rows, group, pressure = 'calm' } = cfg;
  const total = cols * rows;
  let specials = [...new Set((cfg.specials ?? []).map((s) => resolveBonus(s, pressure)))];
  // часы без таймера и сердце без жизней бессмысленны
  specials = specials.filter((s) => (s !== 'clock' || pressure === 'time') && (s !== 'heart' || pressure === 'lives'));
  if (specials.includes('joker') && !fits({ cols, rows }, group, true)) specials = specials.filter((s) => s !== 'joker');
  const jokers = specials.includes('joker') ? 2 : 0;
  if ((total - jokers) % group !== 0) throw new Error(`поле ${cols}×${rows} не делится на группы по ${group}`);

  const keys = (total - jokers) / group;
  const specialKeys = specials.filter((s) => s !== 'joker');
  const normalKeys = keys - specialKeys.length;
  let setId = cfg.set;
  if (findSet(setId)?.pairsOnly && group !== 2) setId = 'monsters';
  // слова на узких карточках (5–6 в ряд) не помещаются — там эмодзи
  if (setId === 'words' && cols > WORDS_MAX_COLS) setId = 'emoji';
  if (normalKeys > maxKeys(setId)) setId = 'monsters';
  const { faces, theme } = makeFaces(setId, normalKeys, group, rng);

  const cards = [];
  faces.forEach((list, key) => list.forEach((face) => cards.push({ key, kind: 'normal', face })));
  specialKeys.forEach((kind, i) => {
    for (let g = 0; g < group; g++) cards.push({ key: normalKeys + i, kind, face: { type: 'special', kind } });
  });
  for (let j = 0; j < jokers; j++) cards.push({ key: -1, kind: 'joker', face: { type: 'special', kind: 'joker' } });
  shuffle(cards, rng);
  for (const c of cards) {
    c.gone = false;
    c.seen = false;
  }

  return {
    v: 1,
    mode: cfg.mode ?? 'free',
    level: cfg.level ?? 0,
    cols,
    rows,
    group,
    set: setId,
    theme,
    pressure,
    specials,
    keys,
    cards,
    open: [],
    closePending: false,
    moves: 0,
    misses: 0,
    mistakes: 0,
    combo: 0,
    bestCombo: 0,
    score: 0,
    lives: pressure === 'lives' ? LIVES : null,
    timeLeft: pressure === 'time' ? timeLimit(total, group) : null,
    timeTotal: pressure === 'time' ? timeLimit(total, group) : null,
    done: false,
    failed: false,
  };
}

// ---------- ход ----------

const alive = (s) => s.cards.filter((c) => !c.gone);

/** Закрыть открытые после промаха карточки (экран зовёт после паузы, flip — сам, если не успел). */
export function closeOpen(s) {
  if (!s.closePending) return [];
  const closed = s.open.slice();
  s.open = [];
  s.closePending = false;
  return closed;
}

/** Можно ли открыть карточку i. */
export function canFlip(s, i) {
  const c = s.cards[i];
  return Boolean(c) && !s.done && !s.failed && !c.gone && (s.closePending || !s.open.includes(i));
}

/**
 * Открыть карточку i. Возвращает событие для экрана:
 *   { type: 'open', i, closed }                             — открыта, ждём следующую;
 *   { type: 'match', cards, extra, kinds, gained, combo, shuffle?, peek?, win?, closed }
 *        cards — открытые игроком, extra — снятые джокером без открытия;
 *   { type: 'miss', cards, mistake, fail, closed }          — не совпали (закрыть — closeOpen после паузы);
 *   null — открыть нельзя.
 * closed — карточки прошлого промаха, закрытые этим нажатием (игрок не стал ждать).
 */
export function flip(s, i) {
  if (!canFlip(s, i)) return null;
  const closed = closeOpen(s);
  if (s.open.includes(i)) return null;
  s.open.push(i);

  const openCards = s.open.map((k) => s.cards[k]);
  const normals = openCards.filter((c) => c.kind !== 'joker');
  const jokers = openCards.filter((c) => c.kind === 'joker');
  const key = normals[0]?.key;

  if (normals.some((c) => c.key !== key)) return miss(s, i, closed);
  if (jokers.length && (normals.length || jokers.length >= 2)) return match(s, key, closed);
  if (normals.length === s.group) return match(s, key, closed);

  return { type: 'open', i, closed };
}

function wasKnown(s, card, except) {
  return s.cards.some((c, idx) => c !== card && !c.gone && c.seen && c.key === card.key && !except.includes(idx));
}

function miss(s, last, closed) {
  const lastCard = s.cards[last];
  const first = s.cards[s.open[0]];
  // избежать можно было: последняя уже была видна, или пара первой уже была видна (и не среди открытых)
  const mistake = lastCard.seen || (first.kind !== 'joker' && wasKnown(s, first, s.open));
  for (const k of s.open) s.cards[k].seen = true;
  s.moves++;
  s.misses++;
  s.combo = 0;
  s.closePending = true;
  let fail = false;
  if (mistake) {
    s.mistakes++;
    if (s.lives != null) {
      s.lives--;
      if (s.lives <= 0) {
        s.failed = true;
        fail = true;
      }
    }
  }
  return { type: 'miss', cards: s.open.slice(), mistake, fail, closed };
}

function match(s, key, closed, { booster = false } = {}) {
  const opened = s.open.slice();
  // джокер забирает всю группу ключа, даже неоткрытые карточки
  const extra = key == null ? [] : s.cards
    .map((c, idx) => idx)
    .filter((idx) => !opened.includes(idx) && !s.cards[idx].gone && s.cards[idx].key === key);
  const all = [...opened, ...extra];
  for (const idx of all) {
    s.cards[idx].gone = true;
    s.cards[idx].seen = true;
  }
  s.open = [];
  s.closePending = false;
  s.moves += booster ? 0 : 1;

  const kinds = new Set(all.map((idx) => s.cards[idx].kind));
  if (!booster) s.combo++;
  s.bestCombo = Math.max(s.bestCombo, s.combo);
  const mult = Math.max(1, Math.min(s.combo, MAX_COMBO));
  let gained = 10 * s.group * mult;
  if (kinds.has('gold')) gained *= 3;
  s.score += gained;

  const event = { type: 'match', cards: opened, extra, kinds: [...kinds], gained, combo: s.combo, closed, booster };
  if (kinds.has('clock') && s.timeLeft != null) s.timeLeft += CLOCK_BONUS_MS;
  if (kinds.has('heart') && s.lives != null) s.lives = Math.min(MAX_LIVES, s.lives + 1);
  if (kinds.has('eye')) event.peek = true;
  if (kinds.has('vortex')) event.shuffle = vortex(s);

  // остались одни джокеры — им не к чему подходить, уходят сами
  const rest = alive(s);
  if (rest.length && rest.every((c) => c.kind === 'joker')) {
    event.extra.push(...s.cards.map((c, idx) => idx).filter((idx) => !s.cards[idx].gone));
    for (const c of rest) c.gone = true;
  }
  if (!alive(s).length) {
    s.done = true;
    event.win = true;
  }
  return event;
}

/** «Вихрь»: закрытые карточки меняются местами. Возвращает [{ from, to }] для анимации. */
function vortex(s, rng = Math.random) {
  const slots = s.cards.map((c, idx) => idx).filter((idx) => !s.cards[idx].gone && !s.open.includes(idx));
  const order = shuffle(slots.slice(), rng);
  const moved = order.map((from) => s.cards[from]);
  const moves = [];
  slots.forEach((to, k) => {
    s.cards[to] = moved[k];
    if (order[k] !== to) moves.push({ from: order[k], to });
  });
  for (const idx of slots) s.cards[idx].seen = false;       // запомненное больше не годится
  return moves;
}

/**
 * Бонус-помощник «Магнит»: снимает одну группу. Если одна карточка уже открыта — её группу.
 * Иначе — группу, которую игрок уже видел (помогает памяти), а если такой нет — любую.
 */
export function magnet(s, rng = Math.random) {
  if (s.done || s.failed) return null;
  const closed = closeOpen(s);
  let key = s.open.map((k) => s.cards[k]).find((c) => c.kind !== 'joker')?.key;
  if (key == null) {
    const rest = alive(s).filter((c) => c.kind !== 'joker');
    if (!rest.length) return null;
    const seen = rest.filter((c) => c.seen);
    const pool = seen.length ? seen : rest;
    key = pool[Math.floor(rng() * pool.length)].key;
  }
  // открытый джокер (или чужая карточка) в эту группу не входит — закрывается
  closed.push(...s.open.filter((k) => s.cards[k].key !== key));
  s.open = s.open.filter((k) => s.cards[k].key === key);
  return match(s, key, closed, { booster: true });
}

/** Время идёт только в режиме «На время». Возвращает true, если время вышло. */
export function tick(s, dtMs) {
  if (s.timeLeft == null || s.done || s.failed) return false;
  s.timeLeft = Math.max(0, s.timeLeft - dtMs);
  if (s.timeLeft === 0) {
    s.failed = true;
    return true;
  }
  return false;
}

// ---------- оценка ----------

/** Звёзды за пройденную партию — по ошибкам (избегаемым промахам). */
export function starsFor(s) {
  if (s.mistakes <= Math.floor(s.keys / 8)) return 3;
  if (s.mistakes <= Math.floor(s.keys / 3) + 1) return 2;
  return 1;
}

// ---------- уровни ----------

const LEVELS = [
  { size: '3x4', group: 2, specials: [] },
  { size: '4x4', group: 2, specials: [] },
  { size: '4x4', group: 2, specials: ['gold'] },
  { size: '4x5', group: 2, specials: ['eye'] },
  { size: '4x5', group: 2, specials: ['joker'] },
  { size: '3x4', group: 3, specials: [] },
  { size: '4x6', group: 2, specials: ['vortex', 'bonus'] },
  { size: '4x6', group: 2, specials: ['gold', 'eye'] },
  { size: '5x6', group: 2, specials: ['joker', 'bonus'] },
  { size: '4x6', group: 3, specials: ['gold'] },
  { size: '5x6', group: 2, specials: ['vortex', 'gold', 'eye'] },
  { size: '6x6', group: 2, specials: ['joker', 'vortex', 'bonus'] },
];
const LATE_SIZES = ['4x6', '5x6', '6x6'];
const LATE_SPECIALS = ['gold', 'eye', 'vortex', 'joker', 'bonus'];
const MIX_SETS = ['monsters', 'emoji', 'words', 'patterns'];

/** Генератор с зерном — у уровня N всегда одни и те же параметры. */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Параметры уровня: размер, по сколько карточек, бонусные пары и набор картинок (при «Случайно»). */
export function levelParams(level) {
  const rng = seeded(level * 7919 + 17);
  let p;
  if (level <= LEVELS.length) p = { ...LEVELS[level - 1] };
  else {
    let size = LATE_SIZES[Math.floor(rng() * LATE_SIZES.length)];
    let group = rng() < 0.2 ? 3 : 2;
    if (!fits(findSize(size), group)) group = 2;
    const n = 1 + Math.floor(rng() * 3);
    const specials = shuffle(LATE_SPECIALS.slice(), rng).slice(0, n);
    p = { size, group, specials };
  }
  const setIdx = level === 1 ? 0 : Math.floor(rng() * MIX_SETS.length);
  p.mixSet = MIX_SETS[setIdx];
  if (p.group !== 2 && p.mixSet === 'words') p.mixSet = 'monsters';
  return p;
}

/** Партия уровня с учётом настроек игрока. */
export function newLevel(level, settings, rng = Math.random) {
  const p = levelParams(level);
  const size = findSize(p.size);
  const set = settings.set === 'mix' || !settings.set || findSet(settings.set)?.freeOnly ? p.mixSet : settings.set;
  return newGame({
    cols: size.cols, rows: size.rows, group: p.group, set, specials: p.specials,
    pressure: settings.pressure ?? 'calm', mode: 'levels', level,
  }, rng);
}

// ---------- сохранение и статистика ----------

export function isValidState(s) {
  if (!s || typeof s !== 'object' || s.v !== 1) return false;
  if (!findSize(`${s.cols}x${s.rows}`) || ![2, 3].includes(s.group)) return false;
  if (!Array.isArray(s.cards) || s.cards.length !== s.cols * s.rows) return false;
  if (!s.cards.every((c) => c && Number.isInteger(c.key) && typeof c.kind === 'string' && c.face && typeof c.gone === 'boolean')) return false;
  if (!Array.isArray(s.open) || !s.open.every((k) => Number.isInteger(k) && s.cards[k] && !s.cards[k].gone)) return false;
  if (!PRESSURES.includes(s.pressure)) return false;
  return Number.isInteger(s.moves) && Number.isInteger(s.mistakes) && Number.isInteger(s.score);
}

export const emptyStats = () => ({
  levelsCleared: 0, bestLevel: 0, stars: 0, perfect: 0, fails: 0, bestCombo: 0, free: {},
});

export function isValidStats(s) {
  return Boolean(s) && typeof s === 'object'
    && ['levelsCleared', 'bestLevel', 'stars', 'perfect', 'fails', 'bestCombo'].every((k) => Number.isInteger(s[k]) && s[k] >= 0)
    && s.free && typeof s.free === 'object';
}

/** Итог партии в статистику. */
export function recordGame(stats, s, stars) {
  const out = { ...stats, free: { ...stats.free }, bestCombo: Math.max(stats.bestCombo, s.bestCombo) };
  if (s.failed) {
    out.fails++;
    return out;
  }
  if (s.mode === 'levels') {
    out.levelsCleared++;
    out.bestLevel = Math.max(out.bestLevel, s.level);
    out.stars += stars;
    if (s.mistakes === 0) out.perfect++;
  } else {
    const id = `${s.cols}x${s.rows}:${s.group}`;
    const prev = out.free[id] ?? { played: 0, bestMoves: null };
    out.free[id] = {
      played: prev.played + 1,
      bestMoves: prev.bestMoves == null ? s.moves : Math.min(prev.bestMoves, s.moves),
    };
  }
  return out;
}
