// Правила го для партии (без DOM): партия хранится списком ходов и при загрузке переигрывается (так проверяется,
// что сохранение честное). Правила — «китайские» (как в GoQuest; OGS и KGS дают их на выбор): подсчёт по площади
// (свои живые камни + окружённая пустота) — его же считает бот, свою территорию заполнять не вредно, спор
// решается доигрыванием, сэки — без особых правил. Самоубийство запрещено, повторять позицию нельзя
// (позиционное суперко — ловит и простое ко), два паса подряд — подсчёт.
// Коми: 7,5 на 13×13 и 19×19 (китайские правила); на 9×9 — 6,5: при подсчёте по площади на нечётной доске разница
// почти всегда нечётная, и 7,5 там — как 8,5 (честное коми 9×9 по KataGo — 7). При форе — 0,5 + число камней.
// Индекс точки — r·n + c, пас — −1.

import { Board, EMPTY, BLACK, WHITE, PASS } from './board.js';

export { BLACK, WHITE, PASS };
export const SIZES = [9, 13, 19];
export const komiFor = (n, handicap = 0) => (handicap >= 2 ? 0.5 + handicap : n === 9 ? 6.5 : 7.5);

/** «Звёзды» (хоси) доски — для рисунка и форы. */
export function starPoints(n) {
  const a = n >= 13 ? 3 : 2;
  const b = n - 1 - a;
  const m = (n - 1) / 2;
  const pts = n === 9 ? [[a, a], [a, b], [b, a], [b, b], [m, m]]
    : [[a, a], [a, b], [b, a], [b, b], [a, m], [m, a], [m, b], [b, m], [m, m]];
  return pts.map(([r, c]) => r * n + c);
}

/** Камни форы по стандарту GTP: 2 — по диагонали, 3–4 — углы, 5 — + центр, 6–9 — стороны (на 9×9 — третья линия). */
export function handicapPoints(n, k) {
  if (k < 2) return [];
  const a = n >= 13 ? 3 : 2;
  const b = n - 1 - a;
  const m = (n - 1) / 2;
  const at = (r, c) => r * n + c;
  const corners = [at(a, b), at(b, a), at(b, b), at(a, a)];   // верх-право, низ-лево, низ-право, верх-лево
  const sides = [at(m, a), at(m, b), at(a, m), at(b, m)];
  if (k <= 4) return corners.slice(0, k);
  if (k === 5) return [...corners, at(m, m)];
  if (k === 6) return [...corners, sides[0], sides[1]];
  if (k === 7) return [...corners, sides[0], sides[1], at(m, m)];
  if (k === 8) return [...corners, ...sides];
  return [...corners, ...sides, at(m, m)];
}

export const maxHandicap = (n) => (n === 9 ? 5 : 9);

/**
 * Новая партия. setup: { size, vs: 'bot' | 'friend', level, player (1 — играю чёрными), handicap }.
 * При форе (2+ камня) первыми ходят белые, коми — 0,5 + число камней.
 */
export function newGame({ size = 9, vs = 'bot', level = 2, player = BLACK, handicap = 0 } = {}) {
  const h = handicap >= 2 ? Math.min(handicap, maxHandicap(size)) : 0;
  return {
    v: 1, size, vs, level, player: vs === 'bot' ? player : null,
    handicap: h, komi: komiFor(size, h), moves: [], over: null, hints: 3, scoring: null,
  };
}

/** Позиция партии: { board, turn, keys (позиции для суперко), passes (паса подряд в конце), last }. */
export function replay(s) {
  const board = new Board(s.size);
  for (const i of handicapPoints(s.size, s.handicap)) board.play(board.fromIndex(i), BLACK);
  const keys = new Set([board.key()]);
  let turn = s.handicap ? WHITE : BLACK;
  let passes = 0;
  let last = PASS;
  for (const i of s.moves) {
    if (i === PASS) {
      board.pass();
      passes++;
    } else {
      const p = board.fromIndex(i);
      if (!board.isLegal(p, turn)) return null;
      board.play(p, turn);
      const key = board.key();
      if (keys.has(key)) return null;
      keys.add(key);
      passes = 0;
    }
    last = i;
    turn = 3 - turn;
  }
  return { board, turn, keys, passes, last };
}

/** Можно ли сходить в индекс i (с суперко). */
export function canPlayAt(pos, i) {
  const { board, turn, keys } = pos;
  const p = board.fromIndex(i);
  if (!board.isLegal(p, turn)) return false;
  const b = board.clone();
  b.play(p, turn);
  return !keys.has(b.key());
}

/** Сделать ход (индекс или PASS) в партии s, pos — её позиция (обновляется). false — ход невозможен. */
export function playMove(s, pos, i) {
  if (s.over || s.scoring) return false;
  if (i !== PASS && !canPlayAt(pos, i)) return false;
  if (i === PASS) {
    pos.board.pass();
    pos.passes++;
  } else {
    pos.board.play(pos.board.fromIndex(i), pos.turn);
    pos.keys.add(pos.board.key());
    pos.passes = 0;
  }
  s.moves.push(i);
  pos.last = i;
  pos.turn = 3 - pos.turn;
  return true;
}

/**
 * Подсчёт по площади. dead — Set индексов мёртвых камней (снимаются как пленные). Пустая область, которую
 * окружают камни одного цвета, — его территория; задевает оба цвета — нейтральная (даме).
 * → { black, white (с коми), owner: [n·n] 0/1/2 — кому принадлежит точка в итоге, margin (чёрные − белые) }.
 */
export function scoreArea(board, dead, komi) {
  const n = board.n;
  const size = n * n;
  const stone = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    const v = board.color[board.fromIndex(i)];
    stone[i] = v !== EMPTY && !dead.has(i) ? v : 0;
  }
  const owner = new Uint8Array(size);
  const seen = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    if (stone[i]) owner[i] = stone[i];
    if (stone[i] || seen[i]) continue;
    const region = [i];
    seen[i] = 1;
    let touch = 0;
    for (let k = 0; k < region.length; k++) {
      const j = region[k];
      const r = Math.floor(j / n);
      const c = j % n;
      for (const [rr, cc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
        if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
        const q = rr * n + cc;
        if (stone[q]) touch |= stone[q];
        else if (!seen[q]) {
          seen[q] = 1;
          region.push(q);
        }
      }
    }
    const who = touch === 1 ? BLACK : touch === 2 ? WHITE : 0;
    for (const j of region) owner[j] = who;
  }
  let black = 0;
  let white = komi;
  for (let i = 0; i < size; i++) {
    if (owner[i] === BLACK) black++;
    else if (owner[i] === WHITE) white++;
  }
  return { black, white, owner, margin: black - white };
}

/** Индексы всех камней цепи, где стоит индекс i. */
export function chainAt(board, i) {
  const p = board.fromIndex(i);
  if (board.color[p] !== BLACK && board.color[p] !== WHITE) return [];
  return board.chain(p).map((q) => board.toIndex(q));
}

/** Проверка сохранения: поля на месте и все ходы законны. */
export function isValidGame(s) {
  if (!s || s.v !== 1 || !SIZES.includes(s.size) || !['bot', 'friend'].includes(s.vs)) return false;
  if (!Array.isArray(s.moves) || !s.moves.every((m) => Number.isInteger(m) && m >= PASS && m < s.size * s.size)) return false;
  if (!Number.isInteger(s.handicap) || s.handicap < 0 || s.handicap > maxHandicap(s.size)) return false;
  if (typeof s.komi !== 'number' || !Number.isInteger(s.hints) || s.hints < 0) return false;
  if (s.vs === 'bot' && ![BLACK, WHITE].includes(s.player)) return false;
  if (s.scoring && !(Array.isArray(s.scoring.dead) && s.scoring.dead.every((i) => Number.isInteger(i) && i >= 0 && i < s.size * s.size))) return false;
  return replay(s) !== null;
}

/** Буквенные координаты для записи: A–T без I (как на досках), номер строки снизу. */
export function coordName(n, i) {
  if (i === PASS) return 'пас';
  const letters = 'ABCDEFGHJKLMNOPQRST';
  return `${letters[i % n]}${n - Math.floor(i / n)}`;
}
