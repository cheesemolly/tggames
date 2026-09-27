// Шахматный движок: альфа-бета (PVS) с итеративным углублением, таблица позиций (Зобрист), досчёт взятий,
// порядок ходов (ход из таблицы, взятия «ценная жертва — дешёвый нападающий», убийцы, история), нулевой ход,
// сокращение поздних ходов, продление шахов. Оценка — материал и таблицы полей (Simplified Evaluation Function,
// Томаш Михневский, chessprogramming.org), король — отдельно для миттельшпиля и эндшпиля, пара слонов,
// пешки (сдвоенные, изолированные, проходные), ладьи на открытых линиях.
//
// Уровни — по образцу Skill Level у Stockfish: чем слабее, тем мельче расчёт и тем чаще выбирается не лучший
// ход (вероятность — по тому, сколько он теряет в оценке: exp(−потеря / temp)). У «Новичка» нет досчёта
// взятий — он «человечески» зевает фигуры (не видит ответного взятия), а не ходит как попало.

import {
  WHITE, BLACK, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING, FLAG,
  typeOf, colorOf, fileOf, rankOf, fromOf, toOf, promoOf, flagsOf,
  pseudoMoves, make, unmake, makeNull, unmakeNull, inCheck, legalMoves, uci, moveFromUci,
} from './rules.js';

export const MATE = 30000;
const INF = 32000;
const VALUE = [0, 100, 320, 330, 500, 900, 0];

// таблицы полей: 8 строк с 8-й горизонтали по 1-ю (как доска с белыми снизу), с точки зрения белых
const PST_RAW = {
  [PAWN]: [
    0, 0, 0, 0, 0, 0, 0, 0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
    5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0,
    5, -5, -10, 0, 0, -10, -5, 5,
    5, 10, 10, -20, -20, 10, 10, 5,
    0, 0, 0, 0, 0, 0, 0, 0,
  ],
  [KNIGHT]: [
    -50, -40, -30, -30, -30, -30, -40, -50,
    -40, -20, 0, 0, 0, 0, -20, -40,
    -30, 0, 10, 15, 15, 10, 0, -30,
    -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30,
    -30, 5, 10, 15, 15, 10, 5, -30,
    -40, -20, 0, 5, 5, 0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  [BISHOP]: [
    -20, -10, -10, -10, -10, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 10, 10, 5, 0, -10,
    -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 10, 10, 10, 10, 0, -10,
    -10, 10, 10, 10, 10, 10, 10, -10,
    -10, 5, 0, 0, 0, 0, 5, -10,
    -20, -10, -10, -10, -10, -10, -10, -20,
  ],
  [ROOK]: [
    0, 0, 0, 0, 0, 0, 0, 0,
    5, 10, 10, 10, 10, 10, 10, 5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    0, 0, 0, 5, 5, 0, 0, 0,
  ],
  [QUEEN]: [
    -20, -10, -10, -5, -5, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 5, 5, 5, 0, -10,
    -5, 0, 5, 5, 5, 5, 0, -5,
    0, 0, 5, 5, 5, 5, 0, -5,
    -10, 5, 5, 5, 5, 5, 0, -10,
    -10, 0, 5, 0, 0, 0, 0, -10,
    -20, -10, -10, -5, -5, -10, -10, -20,
  ],
  kingMid: [
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20,
    -10, -20, -20, -20, -20, -20, -20, -10,
    20, 20, 0, 0, 0, 0, 20, 20,
    20, 30, 10, 0, 0, 10, 30, 20,
  ],
  kingEnd: [
    -50, -40, -30, -20, -20, -30, -40, -50,
    -30, -20, -10, 0, 0, -10, -20, -30,
    -30, -10, 20, 30, 30, 20, -10, -30,
    -30, -10, 30, 40, 40, 30, -10, -30,
    -30, -10, 30, 40, 40, 30, -10, -30,
    -30, -10, 20, 30, 30, 20, -10, -30,
    -30, -30, 0, 0, 0, 0, -30, -30,
    -50, -30, -30, -30, -30, -30, -30, -50,
  ],
};

/** Таблица в клетках 0x88: для белых — зеркально по вертикали (строка 0 таблицы — 8-я горизонталь). */
function pst(raw, color) {
  const out = new Int16Array(128);
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const row = color === WHITE ? 7 - rank : rank;
      out[rank * 16 + file] = raw[row * 8 + file];
    }
  }
  return out;
}
const PST = { [WHITE]: {}, [BLACK]: {} };
for (const color of [WHITE, BLACK]) {
  for (const t of [PAWN, KNIGHT, BISHOP, ROOK, QUEEN]) PST[color][t] = pst(PST_RAW[t], color);
  PST[color].kingMid = pst(PST_RAW.kingMid, color);
  PST[color].kingEnd = pst(PST_RAW.kingEnd, color);
}
const PASSED = [0, 5, 10, 20, 35, 60, 100, 0];     // бонус проходной по тому, сколько она прошла

// ---------- оценка ----------

/** Оценка позиции в сантипешках с точки зрения того, чей ход. */
export function evaluate(pos) {
  const b = pos.board;
  let score = 0;             // белые − чёрные
  let phase = 0;             // 24 — все фигуры на месте, 0 — голые короли и пешки
  let bishopsW = 0;
  let bishopsB = 0;
  const pawnFiles = [new Int8Array(8), new Int8Array(8)];
  const pawns = [[], []];
  const rooks = [[], []];
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) {
      sq += 7;
      continue;
    }
    const p = b[sq];
    if (!p) continue;
    const t = typeOf(p);
    const c = colorOf(p);
    const sign = c === WHITE ? 1 : -1;
    const side = c === WHITE ? 0 : 1;
    if (t === KING) continue;
    score += sign * (VALUE[t] + PST[c][t][sq]);
    if (t === KNIGHT || t === BISHOP) phase += 1;
    else if (t === ROOK) phase += 2;
    else if (t === QUEEN) phase += 4;
    if (t === BISHOP) {
      if (c === WHITE) bishopsW += 1;
      else bishopsB += 1;
    } else if (t === PAWN) {
      pawnFiles[side][fileOf(sq)] += 1;
      pawns[side].push(sq);
    } else if (t === ROOK) rooks[side].push(sq);
  }
  if (phase > 24) phase = 24;
  // король: в миттельшпиле — прятаться, в эндшпиле — в центр
  for (const [c, idx, sign] of [[WHITE, 0, 1], [BLACK, 1, -1]]) {
    const k = pos.kings[idx];
    score += sign * Math.round((PST[c].kingMid[k] * phase + PST[c].kingEnd[k] * (24 - phase)) / 24);
  }
  if (bishopsW >= 2) score += 30;
  if (bishopsB >= 2) score -= 30;
  // пешки: сдвоенные, изолированные, проходные
  for (let side = 0; side < 2; side++) {
    const sign = side === 0 ? 1 : -1;
    const own = pawnFiles[side];
    const enemy = pawnFiles[1 - side];
    for (let f = 0; f < 8; f++) {
      if (own[f] > 1) score -= sign * 12 * (own[f] - 1);
      if (own[f] && !(f > 0 && own[f - 1]) && !(f < 7 && own[f + 1])) score -= sign * 10 * own[f];
    }
    for (const sq of pawns[side]) {
      const f = fileOf(sq);
      const r = rankOf(sq);
      let passed = true;
      for (const ef of [f - 1, f, f + 1]) {
        if (ef < 0 || ef > 7 || !enemy[ef]) continue;
        for (const esq of pawns[1 - side]) {
          if (fileOf(esq) !== ef) continue;
          if (side === 0 ? rankOf(esq) > r : rankOf(esq) < r) passed = false;
        }
      }
      if (passed) {
        const advanced = side === 0 ? r : 7 - r;
        score += sign * Math.round(PASSED[advanced] * (1 + (24 - phase) / 24));
      }
    }
    for (const sq of rooks[side]) {
      const f = fileOf(sq);
      if (!own[f]) score += sign * (enemy[f] ? 10 : 20);
    }
  }
  return pos.turn === WHITE ? score : -score;
}

// ---------- таблица позиций ----------

const TT_SIZE = 1 << 18;
const TT_MASK = TT_SIZE - 1;
const ttLo = new Int32Array(TT_SIZE);
const ttHi = new Int32Array(TT_SIZE);
const ttMove = new Int32Array(TT_SIZE);
const ttScore = new Int32Array(TT_SIZE);
const ttDepth = new Int8Array(TT_SIZE);
const ttFlag = new Int8Array(TT_SIZE);      // 0 пусто, 1 точно, 2 нижняя граница, 3 верхняя
const EXACT = 1;
const LOWER = 2;
const UPPER = 3;

export function clearTable() {
  ttFlag.fill(0);
}

// ---------- поиск ----------

function createSearch(pos, { timeMs = Infinity, maxNodes = Infinity, quiesce: useQ = true } = {}) {
  const start = Date.now();
  let nodes = 0;
  let stopped = false;
  const killers = [new Int32Array(128), new Int32Array(128)];
  const history = new Int32Array(16 * 128);

  const timeUp = () => {
    if ((nodes & 1023) === 0 && (Date.now() - start > timeMs || nodes > maxNodes)) stopped = true;
    return stopped;
  };

  const nonPawnMaterial = (side) => {
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) {
        sq += 7;
        continue;
      }
      const p = pos.board[sq];
      if (p && colorOf(p) === side && typeOf(p) !== PAWN && typeOf(p) !== KING) return true;
    }
    return false;
  };

  /** Повторение позиции внутри расчёта — считаем ничьёй (первого повтора достаточно). */
  const repeated = () => {
    const keys = pos.keys;
    const k = keys[keys.length - 1];
    const stop = Math.max(0, keys.length - 1 - pos.half);
    for (let i = keys.length - 3; i >= stop; i -= 2) if (keys[i] === k) return true;
    return false;
  };

  function order(moves, ttm, ply) {
    const scores = new Int32Array(moves.length);
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      if (m === ttm) scores[i] = 1e7;
      else if (flagsOf(m) & FLAG.capture) {
        const victim = flagsOf(m) & FLAG.ep ? PAWN : typeOf(pos.board[toOf(m)]);
        scores[i] = 1e6 + VALUE[victim] * 10 - VALUE[typeOf(pos.board[fromOf(m)])] / 10;
      } else if (promoOf(m)) scores[i] = 9e5 + VALUE[promoOf(m)];
      else if (m === killers[0][ply]) scores[i] = 8e5;
      else if (m === killers[1][ply]) scores[i] = 7e5;
      else scores[i] = history[pos.board[fromOf(m)] * 128 + toOf(m)];
    }
    const idx = Array.from(moves.keys()).sort((a, b) => scores[b] - scores[a]);
    return idx.map((i) => moves[i]);
  }

  function qsearch(alpha, beta, ply) {
    nodes++;
    if (timeUp()) return 0;
    const stand = evaluate(pos);
    if (!useQ) return stand;
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    const moves = order(pseudoMoves(pos, [], true), 0, ply);
    for (const m of moves) {
      // дельта-отсечение: даже взятие не вытянет позицию до alpha
      const victim = flagsOf(m) & FLAG.ep ? PAWN : typeOf(pos.board[toOf(m)]);
      if (!promoOf(m) && stand + VALUE[victim] + 200 < alpha) continue;
      if (!make(pos, m)) {
        unmake(pos);
        continue;
      }
      const score = -qsearch(-beta, -alpha, ply + 1);
      unmake(pos);
      if (stopped) return 0;
      if (score >= beta) return score;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  function negamax(depth, alpha, beta, ply, allowNull) {
    if (ply > 0 && (pos.half >= 100 || repeated())) return 0;
    const check = inCheck(pos);
    if (check) depth += 1;
    if (depth <= 0) return qsearch(alpha, beta, ply);
    nodes++;
    if (timeUp()) return 0;
    const alpha0 = alpha;
    const slot = pos.lo & TT_MASK;
    let ttm = 0;
    if (ttFlag[slot] && ttLo[slot] === pos.lo && ttHi[slot] === pos.hi) {
      ttm = ttMove[slot];
      if (ply > 0 && ttDepth[slot] >= depth) {
        let s = ttScore[slot];
        if (s > MATE - 500) s -= ply;
        else if (s < -MATE + 500) s += ply;
        if (ttFlag[slot] === EXACT) return s;
        if (ttFlag[slot] === LOWER && s >= beta) return s;
        if (ttFlag[slot] === UPPER && s <= alpha) return s;
      }
    }
    // нулевой ход: если даже пропустив ход мы выше beta — отсекаем (не под шахом и не в эндшпиле без фигур)
    if (allowNull && !check && depth >= 3 && ply > 0 && nonPawnMaterial(pos.turn) && evaluate(pos) >= beta) {
      makeNull(pos);
      const score = -negamax(depth - 3, -beta, -beta + 1, ply + 1, false);
      unmakeNull(pos);
      if (stopped) return 0;
      if (score >= beta) return beta;
    }
    const moves = order(pseudoMoves(pos), ttm, ply);
    let best = -INF;
    let bestMove = 0;
    let legal = 0;
    for (const m of moves) {
      if (!make(pos, m)) {
        unmake(pos);
        continue;
      }
      legal += 1;
      const quiet = !(flagsOf(m) & FLAG.capture) && !promoOf(m);
      let score;
      if (legal === 1) score = -negamax(depth - 1, -beta, -alpha, ply + 1, true);
      else {
        // поздние тихие ходы — сначала мельче; вышло лучше — пересчёт
        let reduce = 0;
        if (depth >= 3 && legal > 4 && quiet && !check && !inCheck(pos)) reduce = legal > 10 ? 2 : 1;
        score = -negamax(depth - 1 - reduce, -alpha - 1, -alpha, ply + 1, true);
        if (score > alpha && reduce) score = -negamax(depth - 1, -alpha - 1, -alpha, ply + 1, true);
        if (score > alpha && score < beta) score = -negamax(depth - 1, -beta, -alpha, ply + 1, true);
      }
      unmake(pos);
      if (stopped) return 0;
      if (score > best) {
        best = score;
        bestMove = m;
        if (score > alpha) {
          alpha = score;
          if (alpha >= beta) {
            if (quiet) {
              if (killers[0][ply] !== m) {
                killers[1][ply] = killers[0][ply];
                killers[0][ply] = m;
              }
              history[pos.board[fromOf(m)] * 128 + toOf(m)] += depth * depth;
            }
            break;
          }
        }
      }
    }
    if (!legal) return check ? -MATE + ply : 0;
    let stored = best;
    if (stored > MATE - 500) stored += ply;
    else if (stored < -MATE + 500) stored -= ply;
    ttLo[slot] = pos.lo;
    ttHi[slot] = pos.hi;
    ttMove[slot] = bestMove;
    ttScore[slot] = stored;
    ttDepth[slot] = depth;
    ttFlag[slot] = best <= alpha0 ? UPPER : best >= beta ? LOWER : EXACT;
    return best;
  }

  return {
    negamax,
    qsearch,
    get nodes() { return nodes; },
    get stopped() { return stopped; },
    elapsed: () => Date.now() - start,
  };
}

/**
 * Лучший ход итеративным углублением. → { move, score, depth, nodes } (score — для того, чей ход).
 * opts: { depth, timeMs, maxNodes }.
 */
export function bestMove(pos, { depth = 64, timeMs = 1000, maxNodes = Infinity } = {}) {
  const moves = legalMoves(pos);
  if (!moves.length) return { move: 0, score: 0, depth: 0, nodes: 0 };
  const s = createSearch(pos, { timeMs, maxNodes });
  let result = { move: moves[0], score: 0, depth: 0 };
  for (let d = 1; d <= depth; d++) {
    let alpha = -INF;
    let best = 0;
    let bestScore = -INF;
    // ход из прошлой итерации — первым
    const ordered = result.move ? [result.move, ...moves.filter((m) => m !== result.move)] : moves;
    for (const m of ordered) {
      make(pos, m);
      const score = -s.negamax(d - 1, -INF, -alpha, 1, true);
      unmake(pos);
      if (s.stopped) break;
      if (score > bestScore) {
        bestScore = score;
        best = m;
      }
      if (score > alpha) alpha = score;
    }
    if (s.stopped && d > 1) break;
    if (best) result = { move: best, score: bestScore, depth: d };
    if (Math.abs(bestScore) > MATE - 100) break;          // нашли мат — дальше не нужно
    if (s.elapsed() > timeMs * 0.55) break;               // следующая итерация не успеет
  }
  return { ...result, nodes: s.nodes };
}

/** Оценка каждого хода на глубине depth (для слабых уровней). → [{ move, score }] */
export function scoreRootMoves(pos, depth, { quiesce = true } = {}) {
  const s = createSearch(pos, { quiesce });
  const out = [];
  for (const m of legalMoves(pos)) {
    make(pos, m);
    const score = depth <= 1 ? -s.qsearch(-INF, INF, 1) : -s.negamax(depth - 1, -INF, INF, 1, true);
    unmake(pos);
    out.push({ move: m, score });
  }
  return out.sort((a, b) => b.score - a.score);
}

// ---------- уровни ----------

/**
 * Уровни от новичка до сильного любителя. depth — глубина оценки каждого хода (у верхних — поиск по времени),
 * temp — насколько охотно выбирается не лучший ход (сантипешки), random — доля совсем случайных ходов,
 * book — играть ли по дебютной книге.
 */
export const LEVELS = [
  { id: 1, name: 'Новичок', hint: 'видит только свой ход, часто зевает', depth: 1, quiesce: false, temp: 220, random: 0.15, book: false },
  { id: 2, name: 'Начинающий', hint: 'видит простые угрозы', depth: 2, quiesce: false, temp: 140, random: 0.05, book: false },
  { id: 3, name: 'Любитель', hint: 'считает размены', depth: 2, quiesce: true, temp: 80, random: 0, book: true },
  { id: 4, name: 'Разрядник', hint: 'считает на 3 полухода', depth: 3, quiesce: true, temp: 40, random: 0, book: true },
  { id: 5, name: 'Кандидат', hint: 'считает на 4 полухода', depth: 4, quiesce: true, temp: 18, random: 0, book: true },
  { id: 6, name: 'Мастер', hint: 'думает до секунды', timeMs: 900, book: true },
  { id: 7, name: 'Максимум', hint: 'в полную силу, думает до 2,5 секунды', timeMs: 2500, book: true },
];

// ---------- дебютная книга ----------

/** Основные дебюты (UCI): бот сильнее «Начинающего» разыгрывает их по-разному, а не одно и то же. */
export const BOOK = [
  'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6 e1g1 f8e7', // испанская
  'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 c2c3 g8f6 d2d4',     // итальянская
  'e2e4 e7e5 g1f3 b8c6 f1c4 g8f6 f3g5 d7d5 e4d5 c6a5', // два коня
  'e2e4 e7e5 g1f3 b8c6 d2d4 e5d4 f3d4 g8f6',          // шотландская
  'e2e4 e7e5 g1f3 g8f6 f3e5 d7d6 e5f3 f6e4 d2d4 d6d5', // русская (Петрова)
  'e2e4 e7e5 b1c3 g8f6 f1c4 f6e4',                    // венская
  'e2e4 e7e5 f2f4 e5f4 g1f3 g7g5',                    // королевский гамбит
  'e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 a7a6', // сицилианская, Найдорф
  'e2e4 c7c5 g1f3 b8c6 d2d4 c5d4 f3d4 g8f6 b1c3 e7e5', // сицилианская, Свешников
  'e2e4 c7c5 g1f3 e7e6 d2d4 c5d4 f3d4 a7a6',          // сицилианская, Паульсен
  'e2e4 c7c5 c2c3 g8f6 e4e5 f6d5 d2d4 c5d4',          // сицилианская, Алапин
  'e2e4 c7c5 b1c3 b8c6 g2g3 g7g6 f1g2 f8g7',          // сицилианская, закрытая
  'e2e4 e7e6 d2d4 d7d5 b1c3 g8f6 c1g5 f8e7',          // французская
  'e2e4 e7e6 d2d4 d7d5 e4e5 c7c5 c2c3 b8c6',          // французская, продвинутая
  'e2e4 c7c6 d2d4 d7d5 b1c3 d5e4 c3e4 c8f5',          // Каро-Канн
  'e2e4 d7d5 e4d5 d8d5 b1c3 d5a5',                    // скандинавская
  'e2e4 g8f6 e4e5 f6d5 d2d4 d7d6',                    // Алехина
  'e2e4 d7d6 d2d4 g8f6 b1c3 g7g6',                    // Пирц
  'd2d4 d7d5 c2c4 e7e6 b1c3 g8f6 c1g5 f8e7',          // ферзевый гамбит, отказанный
  'd2d4 d7d5 c2c4 c7c6 g1f3 g8f6 b1c3 d5c4',          // славянская
  'd2d4 d7d5 c2c4 d5c4 g1f3 g8f6 e2e3 e7e6',          // ферзевый гамбит, принятый
  'd2d4 d7d5 g1f3 g8f6 c1f4 e7e6 e2e3 c7c5',          // Лондонская система
  'd2d4 g8f6 c2c4 g7g6 b1c3 f8g7 e2e4 d7d6 g1f3 e8g8', // староиндийская
  'd2d4 g8f6 c2c4 e7e6 b1c3 f8b4 e2e3 e8g8',          // защита Нимцовича
  'd2d4 g8f6 c2c4 e7e6 g1f3 b7b6 g2g3 c8b7',          // новоиндийская
  'd2d4 g8f6 c2c4 g7g6 b1c3 d7d5 c4d5 f6d5 e2e4 d5c3 b2c3', // Грюнфельд
  'd2d4 g8f6 c2c4 c7c5 d4d5 e7e6 b1c3 e6d5 c4d5 d7d6', // Бенони
  'd2d4 f7f5 g2g3 g8f6 f1g2 g7g6',                    // голландская
  'c2c4 e7e5 b1c3 g8f6 g1f3 b8c6 g2g3 d7d5',          // английское
  'g1f3 d7d5 g2g3 g8f6 f1g2 e7e6 e1g1 f8e7',          // Рети
];

/** Ход из книги, если партия идёт по одной из линий. history — сыгранные ходы (UCI). */
export function bookMove(pos, history, rng = Math.random) {
  const next = new Set();
  for (const line of BOOK) {
    const moves = line.split(' ');
    if (moves.length <= history.length) continue;
    if (history.every((m, k) => moves[k] === m)) next.add(moves[history.length]);
  }
  const options = [...next].map((u) => moveFromUci(pos, u)).filter(Boolean);
  return options.length ? options[Math.floor(rng() * options.length)] : 0;
}

/**
 * Ход бота уровня level. history — сыгранные ходы (UCI) с начальной позиции, для книги.
 * → { move, score, book? }
 */
export function chooseMove(pos, level, history = [], rng = Math.random) {
  const lv = LEVELS.find((l) => l.id === level) ?? LEVELS[2];
  const moves = legalMoves(pos);
  if (!moves.length) return { move: 0, score: 0 };
  if (moves.length === 1) return { move: moves[0], score: 0 };
  if (lv.book && history.length < 12) {
    const b = bookMove(pos, history, rng);
    if (b) return { move: b, score: 0, book: true };
  }
  if (lv.timeMs) return bestMove(pos, { timeMs: lv.timeMs });
  if (lv.random && rng() < lv.random) return { move: moves[Math.floor(rng() * moves.length)], score: 0 };
  const scored = scoreRootMoves(pos, lv.depth, { quiesce: lv.quiesce });
  const top = scored[0].score;
  // мат, который видно, — не упускает; иначе выбор с весом exp(−потеря / temp)
  if (top > MATE - 100) return scored[0];
  const weights = scored.map((x) => Math.exp(Math.max(-40, (x.score - top) / lv.temp)));
  let r = rng() * weights.reduce((a, w) => a + w, 0);
  for (let i = 0; i < scored.length; i++) {
    r -= weights[i];
    if (r <= 0) return scored[i];
  }
  return scored[0];
}

export { uci };
