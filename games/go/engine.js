// Бот для го — поиск по дереву Монте-Карло (MCTS) с RAVE, как в программах до нейросетей (MoGo, Fuego, Pachi,
// michi). Без DOM; считает в Web Worker (worker.js), запасной путь — в основном потоке.
//
// Розыгрыш (playout) — партия до конца быстрыми «почти случайными» ходами: сначала взять камни соперника в атари
// рядом с его последним ходом, увести свою цепь из атари, потом сыграть по шаблону 3×3 вокруг последнего хода
// (хане, разрез, загиб — шаблоны из статьи о MoGo: Gelly и др., 2006), иначе — случайный законный ход, не в свой
// глаз и не в бессмысленное самоатари. Конец — два паса; счёт по площади.
// Дерево: у каждого хода — победы/посещения и AMAF-статистика (ход сыгран где угодно позже в розыгрыше — RAVE),
// значение = (1 − β)·доля побед + β·доля AMAF, β падает с числом посещений. Новые узлы получают «априорные»
// победы и поражения: взятие, уход из атари, шаблон, близость к последним ходам, третья линия в пустом углу —
// плюс; самоатари и первая линия в пустоте — минус. Узел раскрывается после EXPAND посещений.
// Владение (ownership) — доля розыгрышей, где точка в конце чёрная/белая: по нему бот решает, когда пасовать,
// а подсчёт — какие камни мёртвые.

import { EMPTY, BLACK, WHITE, EDGE, PASS } from './board.js';

const RAVE_EQUIV = 3000;
const EXPAND = 8;
const PRIOR_EVEN = 10;        // каждому ходу: 10 посещений, половина побед
const PRIOR_CAPTURE = 18;
const PRIOR_ESCAPE = 16;
const PRIOR_PAT3 = 10;
const PRIOR_SELFATARI = 14;   // поражений
const PRIOR_NEAR = [0, 22, 14, 6];   // по расстоянию до последнего хода (1–3)
const PRIOR_EDGE = 12;        // первая/вторая линия в пустоте — поражения; третья (и четвёртая на больших) — победы
const PRIOR_CORNER = 30;      // дебют на больших досках: пустой угол — 3-3, 3-4, 4-4 (как играют люди и старые программы)
const PRIOR_SIDE = 8;         // пустая сторона — третья/четвёртая линия

// ---------- шаблоны 3×3 ----------
// Центр — ход (пусто). X, O — камни разных цветов (оба варианта раскраски), x — не X, o — не O, '.' — пусто,
// ' ' — край, '?' — что угодно. Код окрестности: 8 соседей по 2 бита (0 пусто, 1/2 камни, 3 край).
const PATTERNS = [
  ['XOX', '...', '???'],     // хане, охватывающее
  ['XO.', '...', '?.?'],     // хане без разреза
  ['XO?', 'X..', 'x.?'],     // загиб (магари)
  ['.O.', 'X..', '...'],     // приставка по диагонали
  ['XO?', 'O.o', '?o?'],     // разрез, не защищённый
  ['XO?', 'O.X', '???'],     // разрез после «подглядывания»
  ['?X?', 'O.O', 'ooo'],     // разрез-выход
  ['OX?', 'o.O', '???'],     // разрез кэймы
  ['X.?', 'O.?', '   '],     // у края: преследование
  ['OX ', 'X.O', '   '],     // у края: защита от разреза
  ['?X?', 'x.O', '   '],     // у края: связь
  ['?XO', 'x.x', '   '],     // у края: сагари
  ['?OX', 'X.O', '   '],     // у края: разрез
];

export const PAT3 = new Uint8Array(65536);
{
  const ORDER = [[0, 0], [0, 1], [0, 2], [1, 0], [1, 2], [2, 0], [2, 1], [2, 2]];   // СЗ, С, СВ, З, В, ЮЗ, Ю, ЮВ
  const rot = (g) => [0, 1, 2].map((r) => [0, 1, 2].map((c) => g[2 - c][r]).join(''));
  const flip = (g) => g.map((row) => [...row].reverse().join(''));
  const swap = (g) => g.map((row) => [...row].map((ch) => ({ X: 'O', O: 'X', x: 'o', o: 'x' }[ch] ?? ch)).join(''));
  const opts = { '.': [0], X: [1], O: [2], ' ': [3], x: [0, 2, 3], o: [0, 1, 3], '?': [0, 1, 2, 3] };
  for (const pat of PATTERNS) {
    let variants = [pat];
    for (let k = 0; k < 3; k++) variants.push(rot(variants[variants.length - 1]));
    variants = [...variants, ...variants.map(flip)];
    variants = [...variants, ...variants.map(swap)];
    for (const g of variants) {
      const fill = (k, code) => {
        if (k === 8) {
          PAT3[code] = 1;
          return;
        }
        const [r, c] = ORDER[k];
        for (const v of opts[g[r][c]]) fill(k + 1, code | (v << (2 * k)));
      };
      fill(0, 0);
    }
  }
}

function code3(b, p) {
  const col = b.color;
  const W = b.W;
  return col[p - W - 1] | (col[p - W] << 2) | (col[p - W + 1] << 4) | (col[p - 1] << 6)
    | (col[p + 1] << 8) | (col[p + W - 1] << 10) | (col[p + W] << 12) | (col[p + W + 1] << 14);
}

// ---------- случайные числа ----------

export function makeRng(seed = (Math.random() * 2 ** 31) | 0) {
  let x = seed | 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

// ---------- быстрые проверки хода ----------

/**
 * Примерно, сколько свобод будет у камня c в p после хода (≥ 2 — «много»): пустые соседи + свободы своих цепей
 * помимо p + взятия. Нужно, чтобы не играть самоатари.
 */
function libsAfter(b, p, c) {
  const col = b.color;
  const W = b.W;
  let n = 0;
  let firstEmpty = 0;
  for (let k = 0; k < 4; k++) {
    const q = k === 0 ? p - 1 : k === 1 ? p + 1 : k === 2 ? p - W : p + W;
    const v = col[q];
    if (v === EMPTY) {
      if (q !== firstEmpty) n++;
      firstEmpty = q;
    } else if (v === c) {
      const h = b.head[q];
      if (!b.onlyLib(h, p)) n += b.inAtari(h) ? 1 : 2;
    } else if (v !== EDGE && b.onlyLib(b.head[q], p)) n += 2;   // взятие освобождает место
    if (n >= 2) return 2;
  }
  return n;
}

/** Ход c в p берёт камни: сколько (по головам соседних цепей в атари на p). */
function captureSize(b, p, c) {
  const col = b.color;
  const W = b.W;
  const o = 3 - c;
  let total = 0;
  let seen1 = 0;
  let seen2 = 0;
  for (let k = 0; k < 4; k++) {
    const q = k === 0 ? p - 1 : k === 1 ? p + 1 : k === 2 ? p - W : p + W;
    if (col[q] !== o) continue;
    const h = b.head[q];
    if (h === seen1 || h === seen2 || !b.onlyLib(h, p)) continue;
    total += b.stones[h];
    if (seen1) seen2 = h;
    else seen1 = h;
  }
  return total;
}

/** Ход в p спасает свою цепь из атари (и после него у неё ≥ 2 свобод). */
function savesAtari(b, p, c) {
  const col = b.color;
  const W = b.W;
  for (let k = 0; k < 4; k++) {
    const q = k === 0 ? p - 1 : k === 1 ? p + 1 : k === 2 ? p - W : p + W;
    if (col[q] === c && b.onlyLib(b.head[q], p)) return libsAfter(b, p, c) >= 2 || captureSize(b, p, c) > 0;
  }
  return false;
}

// ---------- розыгрыш ----------

const cand = new Int16Array(64);

/** Эвристический ход розыгрыша рядом с последним ходом last (или 0). */
function heuristicMove(b, c, last, rng) {
  if (last <= 0) return 0;
  const col = b.color;
  const W = b.W;
  const o = 3 - c;
  let n = 0;
  // 1) взять: цепи соперника в атари — сам последний ход и его соседи
  // 2) спастись: свои цепи в атари рядом с последним ходом
  const around = [last, last - 1, last + 1, last - W, last + W];
  for (let k = 0; k < 5; k++) {
    const q = around[k];
    const v = col[q];
    if (v !== BLACK && v !== WHITE) continue;
    const h = b.head[q];
    if (!b.inAtari(h)) continue;
    const lib = b.atariLib(h);
    if (v === o) {
      if (b.isLegal(lib, c)) cand[n++] = lib;
    } else if (b.isLegal(lib, c) && libsAfter(b, lib, c) >= 2) cand[n++] = lib;
  }
  if (n) return cand[Math.floor(rng() * n)];
  // 3) шаблоны 3×3 вокруг последнего хода
  const ring = [last - W - 1, last - W, last - W + 1, last - 1, last + 1, last + W - 1, last + W, last + W + 1];
  for (let k = 0; k < 8; k++) {
    const q = ring[k];
    if (col[q] === EMPTY && PAT3[code3(b, q)] && b.isLegal(q, c) && libsAfter(b, q, c) >= 2) cand[n++] = q;
  }
  if (n) return cand[Math.floor(rng() * n)];
  return 0;
}

/** Случайный законный ход: не в свой глаз, без самоатари (кроме взятия). 0 — ходов нет (пас). */
function randomMove(b, c, rng) {
  const count = b.emptyCount;
  if (!count) return 0;
  let k = Math.floor(rng() * count);
  for (let t = 0; t < count; t++, k++) {
    if (k === count) k = 0;
    const p = b.empty[k];
    if (b.isEye(p, c) || !b.isLegal(p, c)) continue;
    if (libsAfter(b, p, c) < 2 && !captureSize(b, p, c)) continue;
    return p;
  }
  return 0;
}

/**
 * Доиграть розыгрыш на доске b (меняется) от хода c; last — последний ход. amaf[p] — кто первым сыграл в p.
 * Возвращает счёт по площади в пользу чёрных без коми.
 */
function playout(b, c, last, amaf, rng, limit) {
  let passes = 0;
  for (let k = 0; k < limit && passes < 2; k++) {
    let p = rng() < 0.92 ? heuristicMove(b, c, last, rng) : 0;
    if (!p) p = randomMove(b, c, rng);
    if (p) {
      b.play(p, c);
      if (!amaf[p]) amaf[p] = c;
      passes = 0;
    } else {
      b.pass();
      passes++;
    }
    last = p;
    c = 3 - c;
  }
  return areaScore(b);
}

/** Счёт по площади (чёрные − белые), пустая точка — тому, чьи все соседи. */
export function areaScore(b, own = null) {
  const col = b.color;
  const W = b.W;
  const n = b.n;
  let s = 0;
  for (let r = 1; r <= n; r++) {
    for (let p = r * W + 1, e = p + n; p < e; p++) {
      let v = col[p];
      if (v === EMPTY) {
        let seen = 0;
        const a = col[p - 1];
        const bb = col[p + 1];
        const cc = col[p - W];
        const d = col[p + W];
        if (a !== EDGE) seen |= a;
        if (bb !== EDGE) seen |= bb;
        if (cc !== EDGE) seen |= cc;
        if (d !== EDGE) seen |= d;
        v = seen === 1 || seen === 2 ? seen : 0;
      }
      if (v === BLACK) s++;
      else if (v === WHITE) s--;
      if (own) own[p] += v === BLACK ? 1 : v === WHITE ? -1 : 0;
    }
  }
  return s;
}

// ---------- дерево ----------

class Node {
  constructor(p, turn) {
    this.p = p;           // ход, который привёл сюда
    this.turn = turn;     // кто его сделал
    this.n = 0;           // настоящие посещения (v, w — вместе с априорными)
    this.v = 0;
    this.w = 0;
    this.av = 0;
    this.aw = 0;
    this.children = null;
  }
}

/** Расстояние (по общей судьбе: цепь — одна точка) от точки from до остальных, не дальше 3. */
function nearMap(b, from) {
  const dist = new Int8Array(b.len).fill(9);
  if (from <= 0) return dist;
  const W = b.W;
  const col = b.color;
  let frontier = [from];
  dist[from] = 0;
  for (let d = 0; d < 3 && frontier.length; d++) {
    const next = [];
    for (const p of frontier) {
      for (const q of [p - 1, p + 1, p - W, p + W]) {
        if (col[q] === EDGE || dist[q] <= d + 1) continue;
        if (col[q] !== EMPTY) {
          for (const s of b.chain(q)) {
            if (dist[s] > d + 1) {
              dist[s] = d + 1;
              next.push(s);
            }
          }
        } else {
          dist[q] = d + 1;
          next.push(q);
        }
      }
    }
    frontier = next;
  }
  return dist;
}

/** Ни одного камня в квадрате радиуса 3 вокруг p. */
function emptyArea(b, p) {
  const W = b.W;
  for (let dr = -3; dr <= 3; dr++) {
    for (let dc = -3; dc <= 3; dc++) {
      const q = p + dr * W + dc;
      if (q < 0 || q >= b.len) continue;
      const v = b.color[q];
      if (v === BLACK || v === WHITE) return false;
    }
  }
  return true;
}

/** Линия от края (0 — первая). */
function lineOf(b, p) {
  const r = b.rowOf(p);
  const c = b.colOf(p);
  return Math.min(r, c, b.n - 1 - r, b.n - 1 - c);
}

function expand(node, b, turn, last, last2, filter) {
  const d1 = nearMap(b, last);
  const d2 = nearMap(b, last2);
  const big = b.n >= 13;
  const kids = [];
  for (let k = 0; k < b.emptyCount; k++) {
    const p = b.empty[k];
    if (b.isEye(p, turn) || !b.isLegal(p, turn) || (filter && !filter(p))) continue;
    const child = new Node(p, turn);
    let wins = PRIOR_EVEN / 2;
    let visits = PRIOR_EVEN;
    const cap = captureSize(b, p, turn);
    if (cap) { wins += PRIOR_CAPTURE + Math.min(cap, 4) * 4; visits += PRIOR_CAPTURE + Math.min(cap, 4) * 4; }
    if (savesAtari(b, p, turn)) { wins += PRIOR_ESCAPE; visits += PRIOR_ESCAPE; }
    if (PAT3[code3(b, p)]) { wins += PRIOR_PAT3; visits += PRIOR_PAT3; }
    if (!cap && libsAfter(b, p, turn) < 2) visits += PRIOR_SELFATARI;
    const near = Math.min(d1[p], d2[p]);
    if (near <= 3) { wins += PRIOR_NEAR[near]; visits += PRIOR_NEAR[near]; }
    if (emptyArea(b, p)) {
      const line = lineOf(b, p);
      if (line <= 1) visits += PRIOR_EDGE;
      else if (line === 2 || (big && line === 3)) { wins += PRIOR_EDGE; visits += PRIOR_EDGE; }
      if (big) {
        const r = b.rowOf(p);
        const c = b.colOf(p);
        const lr = Math.min(r, b.n - 1 - r);
        const lc = Math.min(c, b.n - 1 - c);
        const good = (x) => x === 2 || x === 3;
        if (good(lr) && good(lc)) { wins += PRIOR_CORNER; visits += PRIOR_CORNER; }
        else if ((good(lr) && lc >= 4) || (good(lc) && lr >= 4)) { wins += PRIOR_SIDE; visits += PRIOR_SIDE; }
      }
    }
    child.v = visits;
    child.w = wins;
    child.av = visits;
    child.aw = wins;
    kids.push(child);
  }
  node.children = kids;
}

function pick(node) {
  let best = null;
  let bestVal = -1;
  for (const ch of node.children) {
    const beta = ch.av / (ch.av + ch.v + (ch.v * ch.av) / RAVE_EQUIV);
    const val = (1 - beta) * (ch.w / ch.v) + beta * (ch.aw / ch.av);
    if (val > bestVal) {
      bestVal = val;
      best = ch;
    }
  }
  return best;
}

/**
 * Поиск хода. root — доска (не меняется), turn — кто ходит, opts: { komi, playouts, timeMs, last, last2,
 * allowed (p → bool, для суперко у корня), rng }.
 * → { root, own (на точку с рамкой: среднее владение −1…1, + чёрные), count, winrate (у лучшего хода) }.
 */
export function search(board, turn, opts) {
  const rng = opts.rng ?? makeRng();
  const komi = opts.komi;
  const root = new Node(PASS, 3 - turn);
  expand(root, board, turn, opts.last ?? 0, opts.last2 ?? 0, opts.allowed);
  const b = board.clone();
  const amaf = new Uint8Array(board.len);
  const own = new Float64Array(board.len);
  const limit = board.n * board.n * 3;
  const path = [];
  const started = Date.now();
  let count = 0;
  const maxCount = opts.playouts ?? Infinity;
  const timeMs = opts.timeMs ?? Infinity;
  while (count < maxCount && root.children.length) {
    if ((count & 63) === 0 && Date.now() - started > timeMs) break;
    b.copyFrom(board);
    amaf.fill(0);
    path.length = 0;
    let node = root;
    let c = turn;
    let last = opts.last ?? 0;
    let last2 = opts.last2 ?? 0;
    // спуск по дереву
    while (node.children && node.children.length) {
      const ch = pick(node);
      path.push(ch);
      if (b.isLegal(ch.p, c)) {
        b.play(ch.p, c);
        if (!amaf[ch.p]) amaf[ch.p] = c;
      } else b.pass();               // ко изменился внутри дерева — пас, чтобы не ломать розыгрыш
      last2 = last;
      last = ch.p;
      c = 3 - c;
      node = ch;
      if (!node.children && node.n >= EXPAND) expand(node, b, c, last, last2, null);
    }
    const score = playout(b, c, last, amaf, rng, limit) - komi;
    if (count < 4000 || (count & 3) === 0) areaScore(b, own);
    const winner = score > 0 ? BLACK : WHITE;
    // награда с оглядкой на перевес: победа 0,9–1, поражение 0–0,1 — бот не «расслабляется», когда всё равно выиграл
    const vb = (winner === BLACK ? 0.9 : 0) + 0.05 + 0.05 * Math.tanh(score / 10);
    count++;
    // обратный проход: победы + AMAF у «братьев» на каждом уровне
    let parent = root;
    for (let k = 0; k < path.length; k++) {
      const ch = path[k];
      for (const sib of parent.children) {
        if (amaf[sib.p] === sib.turn) {
          sib.av++;
          sib.aw += sib.turn === BLACK ? vb : 1 - vb;
        }
      }
      ch.n++;
      ch.v++;
      ch.w += ch.turn === BLACK ? vb : 1 - vb;
      parent = ch;
    }
    root.v++;
  }
  const samples = Math.min(count, 4000) + Math.max(0, Math.floor((count - 4000) / 4));
  if (samples) for (let p = 0; p < own.length; p++) own[p] /= samples;
  let best = null;
  for (const ch of root.children) if (!best || ch.n > best.n) best = ch;
  return { root, own, count, best, winrate: best ? best.w / best.v : 0 };
}

/**
 * Владение для подсчёта: много розыгрышей из позиции (с обеих сторон очереди) — среднее −1…1 на точку с рамкой.
 */
export function ownership(board, turn, komi, playouts = 600, rng = makeRng(1234)) {
  const b = board.clone();
  const amaf = new Uint8Array(board.len);
  const own = new Float64Array(board.len);
  const limit = board.n * board.n * 3;
  for (let k = 0; k < playouts; k++) {
    b.copyFrom(board);
    const c = k % 2 ? turn : 3 - turn;
    playout(b, c, 0, amaf, rng, limit);
    areaScore(b, own);
  }
  for (let p = 0; p < own.length; p++) own[p] /= playouts;
  return own;
}

export { Node };
