// Шахматы: правила без DOM. Доска 0x88 (128 клеток, выход за край — одной проверкой sq & 0x88), фигуры —
// числа: тип (1 пешка … 6 король) | цвет (0 белые, 8 чёрные). Ход — одно целое число (from, to, превращение,
// флаги); ходы делаются и отменяются на месте (make/unmake) — так быстро и для правил, и для движка.
// Всё по правилам ФИДЕ: рокировка (не из-под шаха, не через битое поле), взятие на проходе (с проверкой связки),
// превращение пешки, мат, пат, троекратное повторение, правило 50 ходов, недостаток материала — ничьи
// засчитываются сами, как в приложениях. Хэш позиции — Зобрист из двух 32-битных половин (для повторений и движка).
// Проверка — perft на эталонных позициях (tests/rules.test.js).

export const WHITE = 0;
export const BLACK = 8;
export const PAWN = 1;
export const KNIGHT = 2;
export const BISHOP = 3;
export const ROOK = 4;
export const QUEEN = 5;
export const KING = 6;

export const FLAG = { capture: 1, double: 2, ep: 4, castle: 8 };
export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const typeOf = (p) => p & 7;
export const colorOf = (p) => p & 8;
export const fileOf = (sq) => sq & 7;
export const rankOf = (sq) => sq >> 4;
export const sqName = (sq) => 'abcdefgh'[sq & 7] + String((sq >> 4) + 1);
export const sqFrom = (name) => (Number(name[1]) - 1) * 16 + 'abcdefgh'.indexOf(name[0]);

export const fromOf = (m) => m & 127;
export const toOf = (m) => (m >> 7) & 127;
export const promoOf = (m) => (m >> 14) & 7;
export const flagsOf = (m) => m >> 17;
const encode = (from, to, promo = 0, flags = 0) => from | (to << 7) | (promo << 14) | (flags << 17);

const N_DIRS = [33, 31, 18, 14, -33, -31, -18, -14];
const B_DIRS = [17, 15, -17, -15];
const R_DIRS = [16, 1, -16, -1];
const K_DIRS = [17, 15, -17, -15, 16, 1, -16, -1];

// права рокировки: 1 — белые короткая, 2 — белые длинная, 4 — чёрные короткая, 8 — чёрные длинная
const CASTLE_MASK = new Int8Array(128).fill(15);
CASTLE_MASK[0x04] = 12; // e1
CASTLE_MASK[0x00] = 13; // a1
CASTLE_MASK[0x07] = 14; // h1
CASTLE_MASK[0x74] = 3;  // e8
CASTLE_MASK[0x70] = 7;  // a8
CASTLE_MASK[0x77] = 11; // h8

// ---------- Зобрист ----------

function rng32(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) | 0;
  };
}
const rnd = rng32(20260927);
const Z_PIECE_LO = new Int32Array(16 * 128).map(() => rnd());
const Z_PIECE_HI = new Int32Array(16 * 128).map(() => rnd());
const Z_CASTLE_LO = new Int32Array(16).map(() => rnd());
const Z_CASTLE_HI = new Int32Array(16).map(() => rnd());
const Z_EP_LO = new Int32Array(8).map(() => rnd());
const Z_EP_HI = new Int32Array(8).map(() => rnd());
const Z_SIDE_LO = rnd();
const Z_SIDE_HI = rnd();

function fullHash(pos) {
  let lo = 0;
  let hi = 0;
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) continue;
    const p = pos.board[sq];
    if (p) {
      lo ^= Z_PIECE_LO[p * 128 + sq];
      hi ^= Z_PIECE_HI[p * 128 + sq];
    }
  }
  lo ^= Z_CASTLE_LO[pos.castle];
  hi ^= Z_CASTLE_HI[pos.castle];
  if (pos.ep >= 0) {
    lo ^= Z_EP_LO[pos.ep & 7];
    hi ^= Z_EP_HI[pos.ep & 7];
  }
  if (pos.turn === BLACK) {
    lo ^= Z_SIDE_LO;
    hi ^= Z_SIDE_HI;
  }
  pos.lo = lo;
  pos.hi = hi;
}

// ---------- FEN ----------

const LETTERS = { p: PAWN, n: KNIGHT, b: BISHOP, r: ROOK, q: QUEEN, k: KING };

/** Позиция из FEN. keys — ключи позиций от последнего необратимого хода (для троекратного повторения). */
export function fromFen(fen = START_FEN) {
  const [placement, side, castling, ep, half, full] = fen.trim().split(/\s+/);
  const pos = {
    board: new Int8Array(128), turn: side === 'b' ? BLACK : WHITE, castle: 0, ep: -1,
    half: Number(half) || 0, full: Number(full) || 1, kings: [0, 0], lo: 0, hi: 0, undo: [], keys: [],
  };
  const rows = placement.split('/');
  if (rows.length !== 8) throw new Error('FEN: нужно 8 рядов');
  rows.forEach((row, k) => {
    const rank = 7 - k;
    let file = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) file += Number(ch);
      else {
        const t = LETTERS[ch.toLowerCase()];
        if (!t || file > 7) throw new Error(`FEN: «${ch}»`);
        const piece = t | (ch === ch.toLowerCase() ? BLACK : WHITE);
        pos.board[rank * 16 + file] = piece;
        if (t === KING) pos.kings[piece & 8 ? 1 : 0] = rank * 16 + file;
        file += 1;
      }
    }
  });
  if (castling && castling !== '-') {
    if (castling.includes('K')) pos.castle |= 1;
    if (castling.includes('Q')) pos.castle |= 2;
    if (castling.includes('k')) pos.castle |= 4;
    if (castling.includes('q')) pos.castle |= 8;
  }
  if (ep && ep !== '-') pos.ep = sqFrom(ep);
  fullHash(pos);
  pos.keys.push(key(pos));
  return pos;
}

export function toFen(pos) {
  const rows = [];
  for (let rank = 7; rank >= 0; rank--) {
    let row = '';
    let empty = 0;
    for (let file = 0; file < 8; file++) {
      const p = pos.board[rank * 16 + file];
      if (!p) {
        empty += 1;
        continue;
      }
      if (empty) row += empty;
      empty = 0;
      const ch = ' pnbrqk'[typeOf(p)];
      row += colorOf(p) ? ch : ch.toUpperCase();
    }
    rows.push(row + (empty || ''));
  }
  const castle = (pos.castle & 1 ? 'K' : '') + (pos.castle & 2 ? 'Q' : '') + (pos.castle & 4 ? 'k' : '') + (pos.castle & 8 ? 'q' : '') || '-';
  return `${rows.join('/')} ${pos.turn ? 'b' : 'w'} ${castle} ${pos.ep >= 0 ? sqName(pos.ep) : '-'} ${pos.half} ${pos.full}`;
}

export const key = (pos) => `${pos.lo}:${pos.hi}`;

// ---------- атаки ----------

/** Бьёт ли сторона by клетку sq. */
export function attacked(pos, sq, by) {
  const b = pos.board;
  // пешки: белая пешка бьёт вверх, значит на sq нападает белая пешка, стоящая ниже по диагонали
  const pawn = PAWN | by;
  if (by === WHITE) {
    if (!((sq - 15) & 0x88) && b[sq - 15] === pawn) return true;
    if (!((sq - 17) & 0x88) && b[sq - 17] === pawn) return true;
  } else {
    if (!((sq + 15) & 0x88) && b[sq + 15] === pawn) return true;
    if (!((sq + 17) & 0x88) && b[sq + 17] === pawn) return true;
  }
  const knight = KNIGHT | by;
  for (const d of N_DIRS) {
    const t = sq + d;
    if (!(t & 0x88) && b[t] === knight) return true;
  }
  const king = KING | by;
  for (const d of K_DIRS) {
    const t = sq + d;
    if (!(t & 0x88) && b[t] === king) return true;
  }
  const bishop = BISHOP | by;
  const rook = ROOK | by;
  const queen = QUEEN | by;
  for (const d of B_DIRS) {
    for (let t = sq + d; !(t & 0x88); t += d) {
      const p = b[t];
      if (!p) continue;
      if (p === bishop || p === queen) return true;
      break;
    }
  }
  for (const d of R_DIRS) {
    for (let t = sq + d; !(t & 0x88); t += d) {
      const p = b[t];
      if (!p) continue;
      if (p === rook || p === queen) return true;
      break;
    }
  }
  return false;
}

export const inCheck = (pos, side = pos.turn) => attacked(pos, pos.kings[side ? 1 : 0], side ^ 8);

// ---------- генерация ходов ----------

/** Все ходы по правилам хода фигур (без проверки, не остаётся ли король под шахом). capturesOnly — для движка. */
export function pseudoMoves(pos, out = [], capturesOnly = false) {
  const b = pos.board;
  const us = pos.turn;
  const them = us ^ 8;
  for (let from = 0; from < 128; from++) {
    if (from & 0x88) {
      from += 7;
      continue;
    }
    const p = b[from];
    if (!p || colorOf(p) !== us) continue;
    const t = typeOf(p);
    if (t === PAWN) {
      const up = us === WHITE ? 16 : -16;
      const startRank = us === WHITE ? 1 : 6;
      const lastRank = us === WHITE ? 7 : 0;
      const one = from + up;
      if (!(one & 0x88) && !b[one]) {
        if (rankOf(one) === lastRank) {
          for (const promo of [QUEEN, KNIGHT, ROOK, BISHOP]) out.push(encode(from, one, promo));
        } else if (!capturesOnly) {
          out.push(encode(from, one));
          const two = one + up;
          if (rankOf(from) === startRank && !b[two]) out.push(encode(from, two, 0, FLAG.double));
        }
      }
      for (const side of [up - 1, up + 1]) {
        const to = from + side;
        if (to & 0x88) continue;
        const target = b[to];
        if (target && colorOf(target) === them) {
          if (rankOf(to) === lastRank) for (const promo of [QUEEN, KNIGHT, ROOK, BISHOP]) out.push(encode(from, to, promo, FLAG.capture));
          else out.push(encode(from, to, 0, FLAG.capture));
        } else if (to === pos.ep) out.push(encode(from, to, 0, FLAG.capture | FLAG.ep));
      }
      continue;
    }
    if (t === KNIGHT || t === KING) {
      for (const d of t === KNIGHT ? N_DIRS : K_DIRS) {
        const to = from + d;
        if (to & 0x88) continue;
        const target = b[to];
        if (!target) {
          if (!capturesOnly) out.push(encode(from, to));
        } else if (colorOf(target) === them) out.push(encode(from, to, 0, FLAG.capture));
      }
      if (t === KING && !capturesOnly) castles(pos, from, out);
      continue;
    }
    const dirs = t === BISHOP ? B_DIRS : t === ROOK ? R_DIRS : K_DIRS;
    for (const d of dirs) {
      for (let to = from + d; !(to & 0x88); to += d) {
        const target = b[to];
        if (!target) {
          if (!capturesOnly) out.push(encode(from, to));
          continue;
        }
        if (colorOf(target) === them) out.push(encode(from, to, 0, FLAG.capture));
        break;
      }
    }
  }
  return out;
}

function castles(pos, from, out) {
  const b = pos.board;
  const us = pos.turn;
  const them = us ^ 8;
  const home = us === WHITE ? 0x04 : 0x74;
  if (from !== home) return;
  const [short, long] = us === WHITE ? [1, 2] : [4, 8];
  if (!(pos.castle & (short | long)) || attacked(pos, home, them)) return;
  if (pos.castle & short && !b[home + 1] && !b[home + 2] && b[home + 3] === (ROOK | us)
    && !attacked(pos, home + 1, them) && !attacked(pos, home + 2, them)) out.push(encode(home, home + 2, 0, FLAG.castle));
  if (pos.castle & long && !b[home - 1] && !b[home - 2] && !b[home - 3] && b[home - 4] === (ROOK | us)
    && !attacked(pos, home - 1, them) && !attacked(pos, home - 2, them)) out.push(encode(home, home - 2, 0, FLAG.castle));
}

// ---------- ход и отмена ----------

function put(pos, sq, p) {
  pos.board[sq] = p;
  pos.lo ^= Z_PIECE_LO[p * 128 + sq];
  pos.hi ^= Z_PIECE_HI[p * 128 + sq];
}

function lift(pos, sq) {
  const p = pos.board[sq];
  pos.board[sq] = 0;
  pos.lo ^= Z_PIECE_LO[p * 128 + sq];
  pos.hi ^= Z_PIECE_HI[p * 128 + sq];
  return p;
}

/** Сделать ход (без проверки легальности). Возвращает true, если король не остался под шахом. */
export function make(pos, m) {
  const from = fromOf(m);
  const to = toOf(m);
  const promo = promoOf(m);
  const flags = flagsOf(m);
  const us = pos.turn;
  const b = pos.board;
  pos.undo.push({ m, captured: 0, castle: pos.castle, ep: pos.ep, half: pos.half, lo: pos.lo, hi: pos.hi, kings0: pos.kings[0], kings1: pos.kings[1] });
  const u = pos.undo[pos.undo.length - 1];

  // старые права и взятие на проходе — из хэша
  pos.lo ^= Z_CASTLE_LO[pos.castle];
  pos.hi ^= Z_CASTLE_HI[pos.castle];
  if (pos.ep >= 0) {
    pos.lo ^= Z_EP_LO[pos.ep & 7];
    pos.hi ^= Z_EP_HI[pos.ep & 7];
  }

  const piece = lift(pos, from);
  if (flags & FLAG.ep) {
    const victim = to + (us === WHITE ? -16 : 16);
    u.captured = lift(pos, victim);
  } else if (b[to]) u.captured = lift(pos, to);
  put(pos, to, promo ? promo | us : piece);
  if (typeOf(piece) === KING) {
    pos.kings[us ? 1 : 0] = to;
    if (flags & FLAG.castle) {
      const [rookFrom, rookTo] = to > from ? [from + 3, from + 1] : [from - 4, from - 1];
      put(pos, rookTo, lift(pos, rookFrom));
    }
  }
  pos.castle &= CASTLE_MASK[from] & CASTLE_MASK[to];
  pos.ep = flags & FLAG.double ? from + (us === WHITE ? 16 : -16) : -1;
  pos.half = typeOf(piece) === PAWN || u.captured ? 0 : pos.half + 1;
  if (us === BLACK) pos.full += 1;
  pos.turn = us ^ 8;

  pos.lo ^= Z_CASTLE_LO[pos.castle] ^ Z_SIDE_LO;
  pos.hi ^= Z_CASTLE_HI[pos.castle] ^ Z_SIDE_HI;
  if (pos.ep >= 0) {
    pos.lo ^= Z_EP_LO[pos.ep & 7];
    pos.hi ^= Z_EP_HI[pos.ep & 7];
  }
  pos.keys.push(key(pos));
  return !attacked(pos, pos.kings[us ? 1 : 0], us ^ 8);
}

export function unmake(pos) {
  const u = pos.undo.pop();
  pos.keys.pop();
  const m = u.m;
  const from = fromOf(m);
  const to = toOf(m);
  const flags = flagsOf(m);
  const us = pos.turn ^ 8;
  const b = pos.board;
  const moved = b[to];
  b[from] = promoOf(m) ? PAWN | us : moved;
  b[to] = 0;
  if (flags & FLAG.ep) b[to + (us === WHITE ? -16 : 16)] = u.captured;
  else if (u.captured) b[to] = u.captured;
  if (flags & FLAG.castle) {
    const [rookFrom, rookTo] = to > from ? [from + 3, from + 1] : [from - 4, from - 1];
    b[rookFrom] = b[rookTo];
    b[rookTo] = 0;
  }
  pos.kings[0] = u.kings0;
  pos.kings[1] = u.kings1;
  pos.castle = u.castle;
  pos.ep = u.ep;
  pos.half = u.half;
  pos.lo = u.lo;
  pos.hi = u.hi;
  if (us === BLACK) pos.full -= 1;
  pos.turn = us;
}

/** Нулевой ход (для движка): только передача очереди. */
export function makeNull(pos) {
  pos.undo.push({ m: 0, nul: true, ep: pos.ep, lo: pos.lo, hi: pos.hi });
  if (pos.ep >= 0) {
    pos.lo ^= Z_EP_LO[pos.ep & 7];
    pos.hi ^= Z_EP_HI[pos.ep & 7];
  }
  pos.ep = -1;
  pos.turn ^= 8;
  pos.lo ^= Z_SIDE_LO;
  pos.hi ^= Z_SIDE_HI;
  pos.keys.push(key(pos));
}

export function unmakeNull(pos) {
  const u = pos.undo.pop();
  pos.keys.pop();
  pos.ep = u.ep;
  pos.lo = u.lo;
  pos.hi = u.hi;
  pos.turn ^= 8;
}

/** Легальные ходы. */
export function legalMoves(pos) {
  const out = [];
  for (const m of pseudoMoves(pos)) {
    if (make(pos, m)) out.push(m);
    unmake(pos);
  }
  return out;
}

export function perft(pos, depth) {
  if (depth === 0) return 1;
  let n = 0;
  for (const m of pseudoMoves(pos)) {
    if (make(pos, m)) n += depth === 1 ? 1 : perft(pos, depth - 1);
    unmake(pos);
  }
  return n;
}

// ---------- конец партии ----------

/** Сколько раз текущая позиция уже встречалась (включая сейчас) с последнего необратимого хода. */
export function repetitions(pos) {
  const k = pos.keys[pos.keys.length - 1];
  let n = 0;
  const stop = Math.max(0, pos.keys.length - 1 - pos.half);
  for (let i = pos.keys.length - 1; i >= stop; i -= 2) if (pos.keys[i] === k) n += 1;
  return n;
}

/** Ни одна сторона не может поставить мат: K–K, K+К/С–K, K+С–K+С (слоны одного цвета полей). */
export function insufficientMaterial(pos) {
  const minors = [];
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) continue;
    const p = pos.board[sq];
    if (!p) continue;
    const t = typeOf(p);
    if (t === KING) continue;
    if (t === PAWN || t === ROOK || t === QUEEN) return false;
    minors.push({ t, sq, c: colorOf(p) });
  }
  if (minors.length <= 1) return true;
  if (minors.every((m) => m.t === BISHOP)) {
    const shade = (sq) => (fileOf(sq) + rankOf(sq)) % 2;
    return minors.every((m) => shade(m.sq) === shade(minors[0].sq));
  }
  return false;
}

/**
 * Итог позиции: null — игра идёт; иначе { result: 'checkmate' | 'stalemate' | 'repetition' | 'fifty' | 'material',
 * winner?: WHITE | BLACK }.
 */
export function outcome(pos, moves = legalMoves(pos)) {
  if (!moves.length) return inCheck(pos) ? { result: 'checkmate', winner: pos.turn ^ 8 } : { result: 'stalemate' };
  if (insufficientMaterial(pos)) return { result: 'material' };
  if (pos.half >= 100) return { result: 'fifty' };
  if (repetitions(pos) >= 3) return { result: 'repetition' };
  return null;
}

// ---------- нотация ----------

const SAN_LETTER = ['', '', 'N', 'B', 'R', 'Q', 'K'];

/** Ход в алгебраической нотации (SAN): Nf3, exd5, O-O, e8=Q+, Qxf7#. Позиция — до хода. */
export function san(pos, m, moves = legalMoves(pos)) {
  const from = fromOf(m);
  const to = toOf(m);
  const flags = flagsOf(m);
  const piece = pos.board[from];
  const t = typeOf(piece);
  let text;
  if (flags & FLAG.castle) text = to > from ? 'O-O' : 'O-O-O';
  else if (t === PAWN) {
    text = flags & FLAG.capture ? `${'abcdefgh'[fileOf(from)]}x${sqName(to)}` : sqName(to);
    if (promoOf(m)) text += `=${SAN_LETTER[promoOf(m)]}`;
  } else {
    // уточнение, если такая же фигура может пойти на то же поле
    const rivals = moves.filter((x) => x !== m && toOf(x) === to && pos.board[fromOf(x)] === piece);
    let dis = '';
    if (rivals.length) {
      const sameFile = rivals.some((x) => fileOf(fromOf(x)) === fileOf(from));
      const sameRank = rivals.some((x) => rankOf(fromOf(x)) === rankOf(from));
      if (!sameFile) dis = 'abcdefgh'[fileOf(from)];
      else if (!sameRank) dis = String(rankOf(from) + 1);
      else dis = sqName(from);
    }
    text = `${SAN_LETTER[t]}${dis}${flags & FLAG.capture ? 'x' : ''}${sqName(to)}`;
  }
  make(pos, m);
  const replies = legalMoves(pos);
  if (inCheck(pos)) text += replies.length ? '+' : '#';
  unmake(pos);
  return text;
}

/** UCI-строка хода: e2e4, e7e8q. */
export const uci = (m) => sqName(fromOf(m)) + sqName(toOf(m)) + (promoOf(m) ? ' nbrq'[promoOf(m) - 1] : '');

/** Легальный ход по UCI-строке или null. */
export function moveFromUci(pos, text, moves = legalMoves(pos)) {
  return moves.find((m) => uci(m) === text) ?? null;
}

/** Легальный ход from→to (превращение по умолчанию — ферзь, либо promo). */
export function findMove(pos, from, to, promo = QUEEN, moves = legalMoves(pos)) {
  return moves.find((m) => fromOf(m) === from && toOf(m) === to && (!promoOf(m) || promoOf(m) === promo)) ?? null;
}

/** Копия позиции (для движка в отдельном потоке и для проверок). */
export function clonePos(pos) {
  return { ...pos, board: pos.board.slice(), kings: pos.kings.slice(), undo: [], keys: pos.keys.slice() };
}
