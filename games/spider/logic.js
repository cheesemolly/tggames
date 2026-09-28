// Паук (Spider Solitaire, как в Windows): правила без экрана — раздача, ходы, сбор масти, раздача из колоды,
// отмена, подсказки, статистика. rng передаётся параметром, состояние — простые массивы (сохраняется как JSON).
//
// Карта — число: масть × 16 + достоинство (1 — туз … 13 — король), +64 — лежит лицом вверх.
// Две колоды (104 карты): одна масть — 8 наборов пик, две — по 4 пик и червей, четыре — по 2 каждой масти.
// Раздача: 10 столбцов, в первых четырёх по 6 карт, в остальных по 5, верхняя открыта; 50 карт в колоде —
// 5 раздач по 10 (по карте в каждый столбец, лицом вверх). Раздавать нельзя, пока есть пустой столбец (Windows) —
// кроме случая, когда карт на столе меньше 10 и занять все столбцы нечем (в Windows тут тупик — известная ошибка).
// Ход: на карту на единицу старше любой масти кладётся карта или ряд одной масти по убыванию; в пустой столбец —
// любая карта или ряд. Собран ряд одной масти от короля до туза — он уходит со стола.
// Очков нет (решение владельца, 2026-09-28: «рекорды — по числу побед, очки вообще убери»): считаются ходы и время.
// Отмена без ограничений.
//
// Решаемость: если видеть все карты, решается ≈ 98,5% раскладок даже в четыре масти (Solvitaire, Blake & Gent;
// plspider — 64 998 из 65 000), сложность — в закрытых картах. Поэтому банка «решаемых раскладок» нет:
// раскладка — случайное зерно.

export const SPADES = 0;
export const HEARTS = 1;
export const DIAMONDS = 2;
export const CLUBS = 3;
export const UP = 64;
export const COLUMNS = 10;
export const MODES = [1, 2, 4];

export const suitOf = (c) => (c >> 4) & 3;
export const rankOf = (c) => c & 15;
export const isUp = (c) => (c & UP) !== 0;
export const card = (suit, rank, up = false) => suit * 16 + rank + (up ? UP : 0);
export const face = (c) => c & 63;               // без признака «лицом вверх»

/** Генератор случайных чисел по зерну (mulberry32): одна раскладка — одно зерно. */
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

/** 104 карты для режима: 1, 2 или 4 масти. */
export function deck(suits) {
  const list = suits === 4 ? [SPADES, HEARTS, DIAMONDS, CLUBS] : suits === 2 ? [SPADES, HEARTS] : [SPADES];
  const cards = [];
  for (let k = 0; k < 8; k++) {
    const suit = list[k % list.length];
    for (let r = 1; r <= 13; r++) cards.push(card(suit, r));
  }
  return cards;
}

/** Новая партия по зерну: раздача детерминирована — одно зерно даёт одну и ту же раскладку. */
export function newGame(suits, seed) {
  const rng = seeded(seed);
  const cards = deck(suits);
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  const cols = Array.from({ length: COLUMNS }, () => []);
  let k = 0;
  for (let col = 0; col < COLUMNS; col++) {
    const n = col < 4 ? 6 : 5;
    for (let i = 0; i < n; i++) cols[col].push(cards[k++]);
    cols[col][n - 1] |= UP;
  }
  return {
    v: 1, suits, seed, cols, stock: cards.slice(k), done: [], moves: 0, undo: [],
    hintsUsed: 0, undos: 0,
  };
}

// ---------- ходы ----------

/** Можно ли взять карты столбца начиная с index: все открыты, одной масти, по убыванию подряд. */
export function canPick(col, index) {
  if (index < 0 || index >= col.length || !isUp(col[index])) return false;
  for (let i = index + 1; i < col.length; i++) {
    const a = col[i - 1];
    const b = col[i];
    if (!isUp(b) || suitOf(a) !== suitOf(b) || rankOf(a) !== rankOf(b) + 1) return false;
  }
  return true;
}

/** Самое нижнее место, откуда можно взять ряд (начало ряда одной масти сверху столбца), или -1. */
export function runStart(col) {
  if (!col.length || !isUp(col[col.length - 1])) return -1;
  let i = col.length - 1;
  while (i > 0 && canPick(col, i - 1)) i--;
  return i;
}

/** Можно ли положить ряд, начинающийся картой c, на столбец col. */
export function canDrop(col, c) {
  if (!col.length) return true;
  const top = col[col.length - 1];
  return isUp(top) && rankOf(top) === rankOf(c) + 1;
}

export const canMove = (s, from, index, to) => from !== to && canPick(s.cols[from], index) && canDrop(s.cols[to], s.cols[from][index]);

/** Сколько раздач осталось в колоде. */
export const dealsLeft = (s) => Math.floor(s.stock.length / COLUMNS);

/** Собран ли на столбце ряд от короля до туза одной масти (последние 13 карт). */
export function completeRunAt(col) {
  if (col.length < 13) return false;
  const start = col.length - 13;
  return rankOf(col[start]) === 13 && canPick(col, start);
}

/** Убрать собранные ряды со столбца col (и открыть карту под ними). → записи для отмены. */
function collect(s, col) {
  const out = [];
  const cards = s.cols[col];
  while (completeRunAt(cards)) {
    const suit = suitOf(cards[cards.length - 1]);
    cards.length -= 13;
    s.done.push(suit);
    let flipped = false;
    if (cards.length && !isUp(cards[cards.length - 1])) {
      cards[cards.length - 1] |= UP;
      flipped = true;
    }
    out.push({ col, suit, flipped });
  }
  return out;
}

/**
 * Ход: карты столбца from начиная с index — на столбец to. → { ok, flipped, completed: [{ col, suit, flipped }] }.
 * Состояние меняется на месте, в s.undo — запись для отмены.
 */
export function move(s, from, index, to) {
  if (!canMove(s, from, index, to)) return { ok: false };
  const src = s.cols[from];
  const n = src.length - index;
  s.cols[to].push(...src.splice(index, n));
  let flipped = false;
  if (src.length && !isUp(src[src.length - 1])) {
    src[src.length - 1] |= UP;
    flipped = true;
  }
  s.moves += 1;
  const completed = collect(s, to);
  s.undo.push({ t: 'm', f: from, to, n, fl: flipped ? 1 : 0, cp: completed });
  return { ok: true, flipped, completed };
}

/** Раздать из колоды: по карте на каждый столбец. Нельзя, пока колода пуста или есть пустой столбец (если есть чем его занять). */
export function canDeal(s) {
  if (s.stock.length < COLUMNS) return false;
  if (s.cols.every((c) => c.length > 0)) return true;
  return s.cols.reduce((n, c) => n + c.length, 0) < COLUMNS;     // занять все столбцы нечем — раздача разрешена
}

export function deal(s) {
  if (!canDeal(s)) return { ok: false, reason: s.stock.length ? 'empty' : 'stock' };
  for (let col = 0; col < COLUMNS; col++) s.cols[col].push(s.stock.pop() | UP);
  s.moves += 1;
  const completed = [];
  for (let col = 0; col < COLUMNS; col++) completed.push(...collect(s, col));
  s.undo.push({ t: 'd', cp: completed });
  return { ok: true, completed };
}

/** Отмена последнего хода или раздачи (считается ходом). → запись или null. */
export function undo(s) {
  const rec = s.undo.pop();
  if (!rec) return null;
  // сначала вернуть собранные ряды (в обратном порядке)
  for (let k = rec.cp.length - 1; k >= 0; k--) {
    const { col, suit, flipped } = rec.cp[k];
    const cards = s.cols[col];
    if (flipped) cards[cards.length - 1] &= ~UP;
    for (let r = 13; r >= 1; r--) cards.push(card(suit, r, true));
    s.done.pop();
  }
  if (rec.t === 'm') {
    const src = s.cols[rec.f];
    if (rec.fl) src[src.length - 1] &= ~UP;
    src.push(...s.cols[rec.to].splice(s.cols[rec.to].length - rec.n, rec.n));
  } else {
    for (let col = COLUMNS - 1; col >= 0; col--) s.stock.push(s.cols[col].pop() & ~UP);
  }
  s.moves += 1;
  s.undos += 1;
  return rec;
}

export const isWon = (s) => s.done.length === 8;

/** Все законные ходы: [from, index, to]. */
export function allMoves(s) {
  const out = [];
  for (let from = 0; from < COLUMNS; from++) {
    const src = s.cols[from];
    const start = runStart(src);
    if (start < 0) continue;
    for (let index = start; index < src.length; index++) {
      for (let to = 0; to < COLUMNS; to++) if (to !== from && canDrop(s.cols[to], src[index])) out.push([from, index, to]);
    }
  }
  return out;
}

// ---------- подсказки ----------

/**
 * Все осмысленные ходы с оценкой (лучшие первыми): { from, index, to, score }.
 * Бессмысленные не предлагаются: перенос ряда с «родной» карты той же масти, ряд целиком со столбца в пустой
 * столбец, перекладывание с одной чужой масти на другую чужую (крутился бы на месте).
 */
export function hintMoves(s) {
  const out = [];
  const empties = s.cols.filter((c) => !c.length).length;
  for (let from = 0; from < COLUMNS; from++) {
    const src = s.cols[from];
    const start = runStart(src);
    if (start < 0) continue;
    for (let index = start; index < src.length; index++) {
      const c = src[index];
      const below = index > 0 ? src[index - 1] : null;
      const onOwnSuit = below != null && isUp(below) && rankOf(below) === rankOf(c) + 1 && suitOf(below) === suitOf(c);
      if (onOwnSuit) continue;                                  // рвать свою масть незачем
      const onOther = below != null && isUp(below) && rankOf(below) === rankOf(c) + 1;
      const reveals = below != null && !isUp(below);
      const empties0 = index === 0;
      const len = src.length - index;
      for (let to = 0; to < COLUMNS; to++) {
        if (to === from) continue;
        const dst = s.cols[to];
        if (!canDrop(dst, c)) continue;
        let score = 0;
        if (!dst.length) {
          if (empties0) continue;                              // весь столбец в пустой — ничего не меняет
          if (!reveals && !onOther) continue;
          score = reveals ? 120 : 20;                           // пустой столбец — ценность, тратим с толком
          score += Math.max(0, 6 - index);
        } else {
          const top = dst[dst.length - 1];
          const same = suitOf(top) === suitOf(c);
          if (onOther && !same) continue;                       // с чужой масти на чужую — по кругу
          score = same ? 300 + len * 3 : 100;
          if (reveals) score += 400;
          if (empties0) score += 150 + (empties === 0 ? 50 : 0);
          if (onOther && same) score += 60;                     // чужую масть сменили на свою
          if (same && completesAfter(s, from, index, to)) score += 1000;
          // длиннее ряд одной масти в итоге — лучше
          score += sameRunBelow(dst) * 2;
        }
        out.push({ from, index, to, score });
      }
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

function sameRunBelow(col) {
  const start = runStart(col);
  return start < 0 ? 0 : col.length - start;
}

function completesAfter(s, from, index, to) {
  const dst = s.cols[to];
  const moving = s.cols[from].slice(index);
  return completeRunAt([...dst, ...moving]);
}

/** Подсказка: лучший ход, иначе раздача, иначе null (ходов нет). */
export function hint(s) {
  const moves = hintMoves(s);
  if (moves.length) return { type: 'move', ...moves[0] };
  if (canDeal(s)) return { type: 'deal' };
  return null;
}

/**
 * Куда положить ряд при касании карты: сначала на ту же масть, потом на чужую, потом в пустой столбец.
 * Среди равных — где длиннее выйдет ряд одной масти, потом ближе. → номер столбца или -1.
 */
export function bestTarget(s, from, index) {
  if (!canPick(s.cols[from], index)) return -1;
  const c = s.cols[from][index];
  let best = -1;
  let bestScore = -Infinity;
  for (let to = 0; to < COLUMNS; to++) {
    if (to === from || !canDrop(s.cols[to], c)) continue;
    const dst = s.cols[to];
    let score;
    if (!dst.length) score = index === 0 ? -1000 : 0;
    else score = suitOf(dst[dst.length - 1]) === suitOf(c) ? 200 + sameRunBelow(dst) : 100;
    score -= Math.abs(to - from) * 0.1;
    if (score > bestScore) {
      bestScore = score;
      best = to;
    }
  }
  return bestScore <= -1000 ? -1 : best;
}

// ---------- сохранение и статистика ----------

const validCard = (c) => Number.isInteger(c) && c >= 0 && c < 128 && rankOf(c) >= 1 && rankOf(c) <= 13 && (c & 128) === 0;

/** Сохранённая партия годится: те же 104 карты режима, разумные поля. Битое сохранение — новая партия. */
export function isValidState(s) {
  try {
    if (!s || s.v !== 1 || !MODES.includes(s.suits) || !Array.isArray(s.cols) || s.cols.length !== COLUMNS) return false;
    if (!Array.isArray(s.stock) || !Array.isArray(s.done) || !Array.isArray(s.undo)) return false;
    if (![s.moves, s.hintsUsed, s.undos].every(Number.isInteger)) return false;
    const all = [...s.cols.flat(), ...s.stock];
    if (!all.every(validCard) || s.stock.some(isUp)) return false;
    if (s.stock.length % COLUMNS !== 0) return false;
    // вместе с собранными рядами — ровно колода режима
    const counts = new Map();
    for (const c of all) counts.set(face(c), (counts.get(face(c)) ?? 0) + 1);
    for (const suit of s.done) {
      if (![0, 1, 2, 3].includes(suit)) return false;
      for (let r = 1; r <= 13; r++) counts.set(card(suit, r), (counts.get(card(suit, r)) ?? 0) + 1);
    }
    const want = new Map();
    for (const c of deck(s.suits)) want.set(c, (want.get(c) ?? 0) + 1);
    if (counts.size !== want.size) return false;
    for (const [c, n] of want) if (counts.get(c) !== n) return false;
    // открытые карты — только сверху столбца
    for (const col of s.cols) {
      let seenUp = false;
      for (const c of col) {
        if (isUp(c)) seenUp = true;
        else if (seenUp) return false;
      }
      if (col.length && !isUp(col[col.length - 1])) return false;
    }
    return s.undo.every((r) => r && (r.t === 'm' || r.t === 'd') && Array.isArray(r.cp));
  } catch {
    return false;
  }
}

export function emptyStats() {
  const out = {};
  for (const m of MODES) out[m] = { played: 0, wins: 0, bestTime: 0, fewestMoves: 0, streak: 0, bestStreak: 0 };
  return out;
}

export function isValidStats(st) {
  return Boolean(st) && MODES.every((m) => ['played', 'wins', 'bestTime', 'fewestMoves', 'streak', 'bestStreak']
    .every((k) => Number.isInteger(st[m]?.[k]) && st[m][k] >= 0));
}

/** Итог партии в статистику режима: победа (с ходами и временем) или поражение (брошенная партия). */
export function recordGame(stats, suits, { won, moves = 0, timeMs = 0 }) {
  const row = stats[suits];
  row.played += 1;
  if (won) {
    row.wins += 1;
    row.streak += 1;
    row.bestStreak = Math.max(row.bestStreak, row.streak);
    if (moves > 0 && (!row.fewestMoves || moves < row.fewestMoves)) row.fewestMoves = moves;
    const sec = Math.round(timeMs / 1000);
    if (sec > 0 && (!row.bestTime || sec < row.bestTime)) row.bestTime = sec;
  } else {
    row.streak = 0;
  }
  return stats;
}
