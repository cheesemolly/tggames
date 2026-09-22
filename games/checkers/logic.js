// Русские шашки: правила и движок-соперник. Без DOM, тестируется в Node (движок работает и в Web Worker).
//
// Доска 8×8, индекс = ряд × 8 + столбец, ряд 0 — верх (8-я горизонталь), столбец 0 — «a». Игровые (тёмные) поля —
// где (ряд + столбец) нечётно (a1 — тёмное). Клетка: 0 — пусто, 1 — белая простая, 2 — белая дамка,
// −1 — чёрная простая, −2 — чёрная дамка. Белые внизу (ряды 5–7) и ходят первыми, превращаются в дамку на ряду 0.
//
// Правила (Википедия «Русские шашки»): простая ходит вперёд на одно поле, бьёт вперёд и назад; бить обязательно,
// из нескольких вариантов — любой (не обязательно самый длинный), но начатый бой продолжается до конца; простая,
// дошедшая до последнего ряда во время боя, сразу становится дамкой и продолжает бить как дамка; дамка ходит и бьёт
// на любое расстояние, после взятия встаёт на любое свободное поле за побитой шашкой — но если с какого-то из этих
// полей бой продолжается, встать нужно на такое; турецкий удар: шашку можно побить только раз, побитые снимаются
// в конце хода и до того мешают. Ничья: троекратное повторение позиции; 15 ходов (30 полуходов) подряд без
// взятий и ходов простыми.
//
// Поддавки (mode 'giveaway'): те же ходы и правила взятия, но цель обратная — выигрывает тот, кто отдал все шашки
// или остался без ходов.

export const WHITE = 1;
export const BLACK = -1;
export const DRAW_PLIES = 30;
export const STATE_VERSION = 1;
export const MODES = ['classic', 'giveaway'];
const DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

export const rowOf = (i) => i >> 3;
export const colOf = (i) => i & 7;
export const isDark = (i) => ((rowOf(i) + colOf(i)) & 1) === 1;
const inside = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
const sideOf = (v) => Math.sign(v);

export function initialBoard() {
  const b = new Array(64).fill(0);
  for (let i = 0; i < 64; i++) {
    if (!isDark(i)) continue;
    if (rowOf(i) <= 2) b[i] = BLACK;
    else if (rowOf(i) >= 5) b[i] = WHITE;
  }
  return b;
}

/** Поле в нотации: 'c3'. */
export const squareName = (i) => 'abcdefgh'[colOf(i)] + (8 - rowOf(i));

const promoRow = (side) => (side === WHITE ? 0 : 7);

// ---------- генерация ходов ----------

/**
 * Все взятия шашкой с поля from: [{ from, path: [поля остановок], captures: [побитые поля], promote }].
 * Бой продолжается, пока возможно; дамка встаёт только на поля, откуда бой продолжается, если такие есть.
 */
function capturesFrom(board, from) {
  const piece = board[from];
  const side = sideOf(piece);
  const out = [];
  const empty = (i) => board[i] === 0 || i === from;          // своё начальное поле уже освободилось

  // возможные прыжки с поля pos: [{ over, landings: [...] }]
  function jumps(pos, king, taken) {
    const res = [];
    const r0 = rowOf(pos);
    const c0 = colOf(pos);
    for (const [dr, dc] of DIRS) {
      if (!king) {
        const r1 = r0 + dr;
        const c1 = c0 + dc;
        const r2 = r0 + 2 * dr;
        const c2 = c0 + 2 * dc;
        if (!inside(r2, c2)) continue;
        const over = r1 * 8 + c1;
        const land = r2 * 8 + c2;
        if (sideOf(board[over]) === -side && !taken.has(over) && empty(land)) res.push({ over, landings: [land] });
        continue;
      }
      let r = r0 + dr;
      let c = c0 + dc;
      while (inside(r, c) && empty(r * 8 + c)) {
        r += dr;
        c += dc;
      }
      if (!inside(r, c)) continue;
      const over = r * 8 + c;
      if (sideOf(board[over]) !== -side || taken.has(over)) continue;   // своя, побитая (турецкий удар) — стоп
      const landings = [];
      r += dr;
      c += dc;
      while (inside(r, c) && empty(r * 8 + c)) {
        landings.push(r * 8 + c);
        r += dr;
        c += dc;
      }
      if (landings.length) res.push({ over, landings });
    }
    return res;
  }

  function dfs(pos, king, taken, path, captures, promote) {
    const js = jumps(pos, king, taken);
    if (!js.length) {
      if (path.length) out.push({ from, path: [...path], captures: [...captures], promote });
      return;
    }
    for (const { over, landings } of js) {
      taken.add(over);
      const next = landings.map((land) => {
        const becomesKing = king || rowOf(land) === promoRow(side);
        return { land, becomesKing, more: jumps(land, becomesKing, taken).length > 0 };
      });
      // дамка: если с каких-то полей бой продолжается — встать можно только на них
      const cont = next.some((n) => n.more) ? next.filter((n) => n.more) : next;
      for (const n of cont) {
        path.push(n.land);
        captures.push(over);
        dfs(n.land, n.becomesKing, taken, path, captures, promote || (!king && n.becomesKing));
        path.pop();
        captures.pop();
      }
      taken.delete(over);
    }
  }

  dfs(from, Math.abs(piece) === 2, new Set(), [], [], false);
  return out;
}

function quietFrom(board, from) {
  const piece = board[from];
  const side = sideOf(piece);
  const out = [];
  const r0 = rowOf(from);
  const c0 = colOf(from);
  if (Math.abs(piece) === 1) {
    const dr = side === WHITE ? -1 : 1;
    for (const dc of [-1, 1]) {
      const r = r0 + dr;
      const c = c0 + dc;
      if (inside(r, c) && board[r * 8 + c] === 0) {
        out.push({ from, path: [r * 8 + c], captures: [], promote: r === promoRow(side) });
      }
    }
    return out;
  }
  for (const [dr, dc] of DIRS) {
    let r = r0 + dr;
    let c = c0 + dc;
    while (inside(r, c) && board[r * 8 + c] === 0) {
      out.push({ from, path: [r * 8 + c], captures: [], promote: false });
      r += dr;
      c += dc;
    }
  }
  return out;
}

/** Все законные ходы стороны: если есть взятия — только взятия. */
export function generateMoves(board, side) {
  const caps = [];
  for (let i = 0; i < 64; i++) if (sideOf(board[i]) === side) caps.push(...capturesFrom(board, i));
  if (caps.length) return caps;
  const quiet = [];
  for (let i = 0; i < 64; i++) if (sideOf(board[i]) === side) quiet.push(...quietFrom(board, i));
  return quiet;
}

export const moveTo = (m) => m.path[m.path.length - 1];

/** Новая доска после хода. */
export function applyMove(board, m) {
  const b = board.slice();
  const piece = b[m.from];
  b[m.from] = 0;
  for (const c of m.captures) b[c] = 0;
  const to = moveTo(m);
  const side = sideOf(piece);
  b[to] = m.promote || Math.abs(piece) === 2 || rowOf(to) === promoRow(side) ? 2 * side : piece;
  return b;
}

/** Совпадают ли два хода. */
export const sameMove = (a, b) => a.from === b.from && a.path.length === b.path.length && a.path.every((x, k) => x === b.path[k]);

// ---------- партия ----------

export const positionKey = (board, turn) => `${turn}:${board.join(',')}`;

export function newGame(player = WHITE, level = 'medium', mode = 'classic') {
  const board = initialBoard();
  return {
    v: STATE_VERSION, board, turn: WHITE, player, level, mode, quiet: 0,
    history: [],                                   // { move, board (до хода), quiet }
    seen: { [positionKey(board, WHITE)]: 1 },
    lastMove: null,
  };
}

/** Сделать ход в партии (проверка законности — снаружи). */
export function playMove(s, m) {
  s.history.push({ move: m, board: s.board, quiet: s.quiet, turn: s.turn });
  const man = Math.abs(s.board[m.from]) === 1;
  s.board = applyMove(s.board, m);
  s.quiet = m.captures.length || man ? 0 : s.quiet + 1;
  s.turn = -s.turn;
  s.lastMove = m;
  const key = positionKey(s.board, s.turn);
  s.seen[key] = (s.seen[key] ?? 0) + 1;
}

/** Отменить последний ход. */
export function undoMove(s) {
  const h = s.history.pop();
  if (!h) return false;
  const key = positionKey(s.board, s.turn);
  s.seen[key] -= 1;
  if (!s.seen[key]) delete s.seen[key];
  s.board = h.board;
  s.quiet = h.quiet;
  s.turn = h.turn;
  s.lastMove = s.history.length ? s.history[s.history.length - 1].move : null;
  return true;
}

/** Итог: null — игра идёт; { winner } — победа; { draw: 'repeat' | 'kings' }. */
export function result(s) {
  // нет ходов (или фигур): в классике — проигрыш, в поддавках — победа
  if (!generateMoves(s.board, s.turn).length) return { winner: s.mode === 'giveaway' ? s.turn : -s.turn };
  if (s.seen[positionKey(s.board, s.turn)] >= 3) return { draw: 'repeat' };
  if (s.quiet >= DRAW_PLIES) return { draw: 'kings' };
  return null;
}

export function count(board) {
  const c = { wm: 0, wk: 0, bm: 0, bk: 0 };
  for (const v of board) {
    if (v === 1) c.wm++;
    else if (v === 2) c.wk++;
    else if (v === -1) c.bm++;
    else if (v === -2) c.bk++;
  }
  return c;
}

export function isValidState(s) {
  return s?.v === STATE_VERSION && Array.isArray(s.board) && s.board.length === 64
    && s.board.every((v, i) => [0, 1, 2, -1, -2].includes(v) && (v === 0 || isDark(i)))
    && (s.turn === WHITE || s.turn === BLACK) && (s.player === WHITE || s.player === BLACK)
    && typeof s.level === 'string' && (s.mode === undefined || MODES.includes(s.mode)) && Number.isInteger(s.quiet) && Array.isArray(s.history) && s.seen && typeof s.seen === 'object';
}

// ---------- движок ----------

/** Уровни: глубина перебора, лимит времени, «шум» (случайная добавка к оценке хода в корне — ошибки слабых уровней). */
export const LEVELS = {
  novice: { depth: 1, timeMs: 200, noise: 160, blunder: 0.25 },
  easy: { depth: 2, timeMs: 300, noise: 60, blunder: 0.08 },
  medium: { depth: 4, timeMs: 600, noise: 18, blunder: 0 },
  hard: { depth: 8, timeMs: 900, noise: 0, blunder: 0 },
  master: { depth: 24, timeMs: 2200, noise: 0, blunder: 0 },
};
export const LEVEL_IDS = Object.keys(LEVELS);

const MAN = 100;
const KING = 300;
const WIN = 100000;

// центральные поля и большая дорога (a1–h8)
const CENTER = new Set([27, 29, 34, 36, 18, 20, 43, 45].filter(isDark));
const MAIN_DIAG = new Set([56, 49, 42, 35, 28, 21, 14, 7]);

/**
 * Оценка для поддавок с точки зрения side: чем меньше своих шашек и больше чужих — тем лучше; дамка «тяжелее»
 * отдаётся (ходит далеко и реже попадает под бой) — считается дороже; простым лучше стоять вперёд, где их бьют.
 */
function evaluateGiveaway(board, side) {
  let score = 0;
  for (let i = 0; i < 64; i++) {
    const v = board[i];
    if (!v) continue;
    const s = sideOf(v);
    const adv = s === WHITE ? 7 - rowOf(i) : rowOf(i);
    const val = Math.abs(v) === 2 ? 250 : 100 - adv * 3;
    score -= s * val;
  }
  return score * side;
}

/** Оценка позиции с точки зрения side. */
export function evaluate(board, side, mode = 'classic') {
  if (mode === 'giveaway') return evaluateGiveaway(board, side);
  let score = 0;
  let whitePieces = 0;
  let blackPieces = 0;
  for (let i = 0; i < 64; i++) {
    const v = board[i];
    if (!v) continue;
    const s = sideOf(v);
    let val;
    if (Math.abs(v) === 1) {
      const adv = s === WHITE ? 7 - rowOf(i) : rowOf(i);          // сколько прошла вперёд
      val = MAN + adv * adv * 1.5;
      if (adv === 0) val += 6;                                    // охрана последнего ряда
      if (CENTER.has(i)) val += 6;
      if (colOf(i) === 0 || colOf(i) === 7) val -= 3;              // у края — меньше возможностей
    } else {
      val = KING + (MAIN_DIAG.has(i) ? 25 : 0);
    }
    score += s * val;
    if (s === WHITE) whitePieces++;
    else blackPieces++;
  }
  // в окончании при перевесе — размен выгоден: чем меньше у отстающего фигур, тем лучше
  if (score > 150) score += (12 - blackPieces) * 8;
  else if (score < -150) score -= (12 - whitePieces) * 8;
  return score * side;
}

// хэш позиции для таблицы: два 32-битных числа из фиксированной таблицы (Зобрист)
const ZOBRIST = (() => {
  let x = 0x2545f491;
  const next = () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return x >>> 0;
  };
  return Array.from({ length: 64 * 5 * 2 }, next);
})();
function hashOf(board, side) {
  let a = side === WHITE ? 0x9e3779b9 : 0x7f4a7c15;
  let b = side === WHITE ? 0x85ebca6b : 0xc2b2ae35;
  for (let i = 0; i < 64; i++) {
    const v = board[i];
    if (!v) continue;
    const k = (i * 5 + v + 2) * 2;
    a ^= ZOBRIST[k];
    b ^= ZOBRIST[k + 1];
  }
  return (a >>> 0) * 2097152 + (b & 0x1fffff);
}

function orderMoves(moves, best) {
  return moves
    .map((m) => ({ m, k: (best && sameMove(m, best) ? 1e6 : 0) + m.captures.length * 100 + (m.promote ? 50 : 0) }))
    .sort((a, b) => b.k - a.k)
    .map((x) => x.m);
}

/**
 * Лучший ход для side. opts: { level | depth, timeMs, noise, blunder, rng }. Итеративное углубление, альфа-бета
 * (negamax), таблица позиций, сортировка ходов, продление при взятиях (взятия обязательны — горизонт не режет бой).
 */
export function bestMove(board, side, opts = {}) {
  const cfg = { ...(LEVELS[opts.level] ?? LEVELS.medium), ...opts };
  const giveaway = cfg.mode === 'giveaway';
  const rng = cfg.rng ?? Math.random;
  const rootMoves = generateMoves(board, side);
  if (!rootMoves.length) return null;
  if (rootMoves.length === 1) return rootMoves[0];
  if (cfg.blunder && rng() < cfg.blunder) return rootMoves[Math.floor(rng() * rootMoves.length)];

  const start = Date.now();
  const deadline = start + cfg.timeMs;
  const tt = new Map();
  let nodes = 0;
  let aborted = false;

  function search(b, s, depth, alpha, beta, ply) {
    if ((++nodes & 1023) === 0 && Date.now() > deadline) aborted = true;
    if (aborted) return 0;
    const moves = generateMoves(b, s);
    if (!moves.length) return giveaway ? WIN - ply : -WIN + ply;     // поддавки: без ходов — выигрыш
    const capture = moves[0].captures.length > 0;
    if (depth <= 0 && !capture) return evaluate(b, s, cfg.mode);
    if (depth <= -10) return evaluate(b, s, cfg.mode);        // предохранитель длинных разменов
    const key = hashOf(b, s);
    const entry = tt.get(key);
    if (entry && entry.depth >= depth) {
      if (entry.flag === 0) return entry.score;
      if (entry.flag === 1 && entry.score >= beta) return entry.score;
      if (entry.flag === -1 && entry.score <= alpha) return entry.score;
    }
    const a0 = alpha;
    let best = -Infinity;
    let bestM = null;
    for (const m of orderMoves(moves, entry?.best)) {
      // единственный ход и взятия не тратят глубину
      const d = moves.length === 1 ? depth : depth - 1;
      const score = -search(applyMove(b, m), -s, d, -beta, -alpha, ply + 1);
      if (aborted) return 0;
      if (score > best) {
        best = score;
        bestM = m;
      }
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
    }
    tt.set(key, { depth, score: best, flag: best <= a0 ? -1 : best >= beta ? 1 : 0, best: bestM });
    return best;
  }

  let chosen = rootMoves[0];
  let scores = null;
  let ordered = rootMoves;
  for (let depth = 1; depth <= cfg.depth; depth++) {
    const cur = [];
    let alpha = -Infinity;
    for (const m of ordered) {
      // со «шумом» нужны точные оценки всех ходов — окно полное; без него — обычное отсечение
      const sc = -search(applyMove(board, m), -side, depth - 1, -Infinity, cfg.noise ? Infinity : -alpha, 1);
      if (aborted) break;
      cur.push({ m, sc });
      if (sc > alpha) alpha = sc;
    }
    if (aborted && cur.length < ordered.length) break;
    scores = cur;
    ordered = [...cur].sort((x, y) => y.sc - x.sc).map((x) => x.m);
    chosen = ordered[0];
    if (Math.abs(cur.find((x) => x.m === chosen).sc) > WIN / 2) break;   // найден форсированный выигрыш/проигрыш
    if (Date.now() - start > cfg.timeMs * 0.5 && depth >= 2) break;       // следующий уровень не успеем
  }
  // слабые уровни: к оценке добавляется шум — выбирают «почти лучшие», иногда ошибаясь
  if (cfg.noise && scores) {
    let top = null;
    for (const { m, sc } of scores) {
      const v = sc + rng() * cfg.noise;
      if (!top || v > top.v) top = { m, v };
    }
    chosen = top.m;
  }
  return chosen;
}

// ---------- статистика ----------

const emptyLevels = () => Object.fromEntries(LEVEL_IDS.map((l) => [l, { played: 0, wins: 0, losses: 0, draws: 0 }]));

/** Статистика: режим → уровень → { played, wins, losses, draws }. */
export function emptyStats() {
  return Object.fromEntries(MODES.map((m) => [m, emptyLevels()]));
}

const validLevels = (x) => Boolean(x) && LEVEL_IDS.every((l) => x[l]
  && ['played', 'wins', 'losses', 'draws'].every((k) => Number.isInteger(x[l][k]) && x[l][k] >= 0));

export function isValidStats(s) {
  return Boolean(s) && MODES.every((m) => validLevels(s[m]));
}

/** Статистика первой версии (только уровни, без режимов) — это классика. */
export function migrateStats(s) {
  if (isValidStats(s)) return s;
  if (validLevels(s)) return { classic: s, giveaway: emptyLevels() };
  return emptyStats();
}
