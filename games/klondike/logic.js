// Косынка (Klondike, как в Windows): правила без экрана — раздача по зерну, ходы, колода и сброс (по одной или по три),
// «дома» (основания), отмена, подсказки, сбор в конце, статистика. Состояние — простые массивы (сохраняется как JSON).
//
// Карта — число: масть × 16 + достоинство (1 — туз … 13 — король), +64 — лежит лицом вверх. Масти: 0 — пики,
// 1 — червы, 2 — бубны, 3 — трефы (червы и бубны — красные).
// Раздача: 7 столбцов по 1…7 карт, верхняя открыта; 24 карты в колоде. Касание колоды — 1 или 3 карты в сброс;
// колода кончилась — сброс переворачивается обратно (сколько угодно раз, как в Microsoft Solitaire Collection).
// Ход в столбец: на карту на единицу старше другого цвета; в пустой столбец — только король (или ряд с короля).
// В «дом»: туз на пустой, дальше по возрастанию той же масти; только по одной карте. Из «дома» можно вернуть в столбец.
// Очков нет (как в Пауке — решение владельца): считаются ходы и время, рекорд — число побед.

export const UP = 64;
export const COLUMNS = 7;
export const MODES = [1, 3];

export const suitOf = (c) => (c >> 4) & 3;
export const rankOf = (c) => c & 15;
export const isUp = (c) => (c & UP) !== 0;
export const card = (suit, rank, up = false) => suit * 16 + rank + (up ? UP : 0);
export const face = (c) => c & 63;
export const isRed = (c) => suitOf(c) === 1 || suitOf(c) === 2;

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

export function deck() {
  const cards = [];
  for (let suit = 0; suit < 4; suit++) for (let r = 1; r <= 13; r++) cards.push(card(suit, r));
  return cards;
}

/** Новая партия по зерну. draw — сколько карт открывать из колоды: 1 или 3. */
export function newGame(draw, seed) {
  const rng = seeded(seed);
  const cards = deck();
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  const cols = Array.from({ length: COLUMNS }, () => []);
  let k = 0;
  for (let row = 0; row < COLUMNS; row++) {
    for (let col = row; col < COLUMNS; col++) cols[col].push(cards[k++]);
  }
  for (const col of cols) col[col.length - 1] |= UP;
  return {
    v: 1, draw, seed, cols, stock: cards.slice(k), waste: [], found: [[], [], [], []],
    moves: 0, passes: 0, undo: [], hintsUsed: 0, undos: 0,
  };
}

// ---------- места и ходы ----------
// Место — { k: 't', i } столбец, { k: 'w' } сброс, { k: 'f', i } «дом».

const top = (list) => list[list.length - 1];

/** Можно ли взять карты столбца начиная с index: все открыты, по убыванию с чередованием цвета. */
export function canPick(col, index) {
  if (index < 0 || index >= col.length || !isUp(col[index])) return false;
  for (let i = index + 1; i < col.length; i++) {
    const a = col[i - 1];
    const b = col[i];
    if (!isUp(b) || rankOf(a) !== rankOf(b) + 1 || isRed(a) === isRed(b)) return false;
  }
  return true;
}

/** Первая открытая карта столбца (или -1). */
export function firstUp(col) {
  const i = col.findIndex(isUp);
  return i;
}

/** Можно ли положить карту c на столбец. */
export function canDropOnColumn(col, c) {
  if (!col.length) return rankOf(c) === 13;
  const t = top(col);
  return isUp(t) && rankOf(t) === rankOf(c) + 1 && isRed(t) !== isRed(c);
}

/** Можно ли положить карту c в «дом» f (список карт). */
export function canDropOnFoundation(f, c) {
  if (!f.length) return rankOf(c) === 1;
  const t = top(f);
  return suitOf(t) === suitOf(c) && rankOf(t) + 1 === rankOf(c);
}

/** В какой «дом» можно положить карту: сначала её масти, иначе первый пустой для туза. → номер или -1. */
export function foundationFor(s, c) {
  for (let i = 0; i < 4; i++) if (s.found[i].length && canDropOnFoundation(s.found[i], c)) return i;
  if (rankOf(c) === 1) return s.found.findIndex((f) => !f.length);
  return -1;
}

/** Карты, которые берутся из места from (index — для столбца). → массив или null. */
function taken(s, from, index) {
  if (from.k === 'w') return s.waste.length ? [top(s.waste)] : null;
  if (from.k === 'f') return s.found[from.i].length ? [top(s.found[from.i])] : null;
  const col = s.cols[from.i];
  return canPick(col, index) ? col.slice(index) : null;
}

/** Законен ли ход: карты из from (со столбца — начиная с index) — в to. */
export function canMove(s, from, index, to) {
  const cards = taken(s, from, index);
  if (!cards) return false;
  if (to.k === 't') return !(from.k === 't' && from.i === to.i) && canDropOnColumn(s.cols[to.i], cards[0]);
  if (to.k === 'f') return cards.length === 1 && !(from.k === 'f' && from.i === to.i) && canDropOnFoundation(s.found[to.i], cards[0]);
  return false;
}

const listOf = (s, place) => (place.k === 't' ? s.cols[place.i] : place.k === 'w' ? s.waste : s.found[place.i]);

/** Ход. → { ok, flipped }. Состояние меняется на месте, в s.undo — запись для отмены. */
export function move(s, from, index, to) {
  if (!canMove(s, from, index, to)) return { ok: false };
  const src = listOf(s, from);
  const n = from.k === 't' ? src.length - index : 1;
  const cards = src.splice(src.length - n, n);
  listOf(s, to).push(...cards);
  let flipped = false;
  if (from.k === 't' && src.length && !isUp(top(src))) {
    src[src.length - 1] |= UP;
    flipped = true;
  }
  s.moves += 1;
  s.undo.push({ t: 'm', from, to, n, fl: flipped ? 1 : 0 });
  return { ok: true, flipped };
}

/** Касание колоды: открыть 1 или 3 карты; колода пуста — перевернуть сброс обратно. → { ok, kind, n } */
export function draw(s) {
  if (s.stock.length) {
    const n = Math.min(s.draw, s.stock.length);
    for (let k = 0; k < n; k++) s.waste.push(s.stock.pop() | UP);
    s.moves += 1;
    s.undo.push({ t: 'd', n });
    return { ok: true, kind: 'draw', n };
  }
  if (!s.waste.length) return { ok: false };
  const n = s.waste.length;
  while (s.waste.length) s.stock.push(s.waste.pop() & ~UP);
  s.moves += 1;
  s.passes += 1;
  s.undo.push({ t: 'r', n });
  return { ok: true, kind: 'recycle', n };
}

/** Отмена последнего действия (считается ходом). → запись или null. */
export function undo(s) {
  const rec = s.undo.pop();
  if (!rec) return null;
  if (rec.t === 'm') {
    const src = listOf(s, rec.from);
    if (rec.fl) src[src.length - 1] &= ~UP;
    const dst = listOf(s, rec.to);
    src.push(...dst.splice(dst.length - rec.n, rec.n));
  } else if (rec.t === 'd') {
    for (let k = 0; k < rec.n; k++) s.stock.push(s.waste.pop() & ~UP);
  } else {
    while (s.stock.length) s.waste.push(s.stock.pop() | UP);
    s.passes -= 1;
  }
  s.moves += 1;
  s.undos += 1;
  return rec;
}

export const isWon = (s) => s.found.every((f) => f.length === 13);

/** Можно ли собрать всё само: колода и сброс пусты, все карты столбцов открыты. */
export const canAutoFinish = (s) => !isWon(s) && !s.stock.length && !s.waste.length && s.cols.every((c) => c.every(isUp));

/** Следующий ход сбора: самая младшая карта со столбцов, которая идёт в «дом». → { from, index, to } или null. */
export function nextFinishMove(s) {
  let best = null;
  for (let i = 0; i < COLUMNS; i++) {
    const col = s.cols[i];
    if (!col.length) continue;
    const c = top(col);
    const f = foundationFor(s, c);
    if (f >= 0 && (!best || rankOf(c) < best.rank)) best = { from: { k: 't', i }, index: col.length - 1, to: { k: 'f', i: f }, rank: rankOf(c) };
  }
  return best;
}

// ---------- все ходы и подсказки ----------

/** Все законные ходы: { from, index, to }. */
export function allMoves(s) {
  const out = [];
  const sources = [];
  if (s.waste.length) sources.push({ from: { k: 'w' }, index: s.waste.length - 1 });
  for (let i = 0; i < 4; i++) if (s.found[i].length) sources.push({ from: { k: 'f', i }, index: s.found[i].length - 1 });
  for (let i = 0; i < COLUMNS; i++) {
    const col = s.cols[i];
    const start = firstUp(col);
    if (start < 0) continue;
    for (let index = start; index < col.length; index++) if (canPick(col, index)) sources.push({ from: { k: 't', i }, index });
  }
  for (const { from, index } of sources) {
    for (let i = 0; i < COLUMNS; i++) if (canMove(s, from, index, { k: 't', i })) out.push({ from, index, to: { k: 't', i } });
    for (let i = 0; i < 4; i++) if (canMove(s, from, index, { k: 'f', i })) out.push({ from, index, to: { k: 'f', i } });
  }
  return out;
}

/**
 * Осмысленные ходы с оценкой (лучшие первыми): { from, index, to, score }. Не предлагаются: король с пустого
 * основания столбца в другой пустой, перекладывание ряда с карты на такую же карту другой масти (ничего не открывает),
 * возврат из «дома» (разве что игрок сам захочет), туз и двойка — всегда в «дом».
 */
export function hintMoves(s) {
  const out = [];
  for (const m of allMoves(s)) {
    if (m.from.k === 'f') continue;
    const cards = taken(s, m.from, m.index);
    const c = cards[0];
    let score;
    if (m.to.k === 'f') {
      score = 600 + (14 - rankOf(c)) * 5;
      if (m.from.k === 't') {
        const col = s.cols[m.from.i];
        if (m.index > 0 && !isUp(col[m.index - 1])) score += 400;       // и откроет карту
      }
    } else if (m.from.k === 'w') {
      score = s.cols[m.to.i].length ? 400 : (rankOf(c) === 13 ? 250 : 0);
    } else {
      const col = s.cols[m.from.i];
      const below = m.index > 0 ? col[m.index - 1] : null;
      const reveals = below != null && !isUp(below);
      const empties = m.index === 0;
      const toEmpty = !s.cols[m.to.i].length;
      if (toEmpty && empties) continue;                                  // король из пустого в пустой
      if (!reveals && !empties && below != null && isUp(below)) continue; // с карты на такую же — по кругу
      if (reveals) score = 800 + m.index * 10;                          // под большой стопкой — ценнее
      else if (empties) score = toEmpty ? 0 : 350;
      else score = 100;
    }
    if (score > 0) out.push({ ...m, score });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Подсказка: лучший ход, иначе открыть колоду / перевернуть сброс, иначе null. */
export function hint(s) {
  const moves = hintMoves(s);
  if (moves.length) return { type: 'move', ...moves[0] };
  if (s.stock.length || s.waste.length) return { type: 'draw' };
  return null;
}

// ---------- сохранение и статистика ----------

const validCard = (c) => Number.isInteger(c) && c >= 0 && c < 128 && rankOf(c) >= 1 && rankOf(c) <= 13;
const validPlace = (p) => p && (p.k === 'w' || (p.k === 't' && p.i >= 0 && p.i < COLUMNS) || (p.k === 'f' && p.i >= 0 && p.i < 4));

/** Сохранённая партия годится: ровно 52 разные карты, разумные поля. Битое сохранение — новая партия. */
export function isValidState(s) {
  try {
    if (!s || s.v !== 1 || !MODES.includes(s.draw) || !Array.isArray(s.cols) || s.cols.length !== COLUMNS) return false;
    if (!Array.isArray(s.stock) || !Array.isArray(s.waste) || !Array.isArray(s.found) || s.found.length !== 4) return false;
    if (![s.moves, s.passes, s.hintsUsed, s.undos].every(Number.isInteger) || !Array.isArray(s.undo)) return false;
    const all = [...s.cols.flat(), ...s.stock, ...s.waste, ...s.found.flat()];
    if (all.length !== 52 || !all.every(validCard)) return false;
    if (new Set(all.map(face)).size !== 52) return false;
    if (s.stock.some(isUp) || !s.waste.every(isUp) || !s.found.flat().every(isUp)) return false;
    for (const f of s.found) {
      for (let k = 0; k < f.length; k++) if (rankOf(f[k]) !== k + 1 || suitOf(f[k]) !== suitOf(f[0])) return false;
    }
    for (const col of s.cols) {
      let seenUp = false;
      for (const c of col) {
        if (isUp(c)) seenUp = true;
        else if (seenUp) return false;
      }
      if (col.length && !isUp(top(col))) return false;
    }
    return s.undo.every((r) => r && ((r.t === 'm' && validPlace(r.from) && validPlace(r.to)) || r.t === 'd' || r.t === 'r'));
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
export function recordGame(stats, draw, { won, moves = 0, timeMs = 0 }) {
  const row = stats[draw];
  row.played += 1;
  if (won) {
    row.wins += 1;
    row.streak += 1;
    row.bestStreak = Math.max(row.bestStreak, row.streak);
    const sec = Math.round(timeMs / 1000);
    if (sec > 0 && (!row.bestTime || sec < row.bestTime)) row.bestTime = sec;
    if (moves > 0 && (!row.fewestMoves || moves < row.fewestMoves)) row.fewestMoves = moves;
  } else {
    row.streak = 0;
  }
  return stats;
}
