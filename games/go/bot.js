// Выбор хода бота по уровню, пас и сдача, подсказка и мёртвые камни для подсчёта (без DOM; worker.js и запасной
// путь в основном потоке). Сила уровня — число розыгрышей (и потолок времени: телефон в 3–5 раз медленнее ПК), а
// слабые уровни ещё и выбирают не лучший ход, а случайный из хороших, с весом по числу посещений, — ошибаются
// «по-человечески», а не ходят куда попало (как Skill Level у Stockfish и уровни ботов OGS).

import { BLACK, WHITE, EMPTY, PASS } from './board.js';
import { replay, canPlayAt } from './rules.js';
import { search, ownership, makeRng } from './engine.js';

// playouts — розыгрышей на ход, timeMs — потолок времени, temp — «температура» выбора (0 — лучший),
// resign — сдаётся ли (слабым сдаваться рано не к лицу: пусть игрок доиграет и посчитает)
export const LEVELS = [
  { id: 1, playouts: 150, timeMs: 400, temp: 1.6, resign: false },
  { id: 2, playouts: 700, timeMs: 700, temp: 0.9, resign: false },
  { id: 3, playouts: 3000, timeMs: 1200, temp: 0.35, resign: true },
  { id: 4, playouts: 9000, timeMs: 1800, temp: 0, resign: true },
  { id: 5, playouts: 60000, timeMs: 2600, temp: 0, resign: true },
];
export const HINT_LEVEL = { playouts: 6000, timeMs: 1500, temp: 0 };

const lastMoves = (s, pos) => {
  const m = s.moves;
  const pt = (i) => (i === undefined || i === PASS ? 0 : pos.board.fromIndex(i));
  return [pt(m[m.length - 1]), pt(m[m.length - 2])];
};

/** Счёт по владению: каждая точка — тому, чьё владение > 0 (с коми), в пользу чёрных. */
function ownScore(board, own, komi) {
  let s = -komi;
  for (let r = 0; r < board.n; r++) for (let c = 0; c < board.n; c++) {
    const v = own[board.pt(r, c)];
    if (v > 0.15) s++;
    else if (v < -0.15) s--;
  }
  return s;
}

/** Всё ли поделено: у каждой пустой точки владение уверенное. */
function settled(board, own) {
  for (let k = 0; k < board.emptyCount; k++) if (Math.abs(own[board.empty[k]]) < 0.75) return false;
  return true;
}

/**
 * Ход бота: { move: индекс | PASS | 'resign', winrate, count }. s — партия, level — номер уровня (1–5) или
 * объект настроек; rng — для детерминированных тестов.
 */
export function chooseMove(s, level, rng = makeRng()) {
  const cfg = typeof level === 'object' ? level : LEVELS[Math.max(0, Math.min(LEVELS.length - 1, level - 1))];
  const pos = replay(s);
  const { board, turn } = pos;
  const [last, last2] = lastMoves(s, pos);
  const allowed = (p) => canPlayAt(pos, board.toIndex(p));
  const r = search(board, turn, { komi: s.komi, playouts: cfg.playouts, timeMs: cfg.timeMs, last, last2, allowed, rng });
  if (!r.best) return { move: PASS, winrate: 0.5, count: r.count };
  const sign = turn === BLACK ? 1 : -1;
  const margin = ownScore(board, r.own, s.komi) * sign;
  const oppPassed = s.moves[s.moves.length - 1] === PASS;
  const moveNo = s.moves.length;
  const n2 = board.n * board.n;
  // сдача — только у сильных уровней, явно проигранная и не в начале партии
  if (cfg.resign && r.winrate < 0.06 && moveNo > n2 * 0.4 && margin < -5) return { move: 'resign', winrate: r.winrate, count: r.count };
  // пас: соперник спасовал, а бот не проигрывает (или играть уже не за что — всё поделено); всё поделено и бот
  // впереди. Проигрывающий слабый бот не бросает камни в чужую территорию бесконечно.
  const done = settled(board, r.own);
  if (oppPassed && (margin > 0 || done)) return { move: PASS, winrate: r.winrate, count: r.count };
  if (moveNo > n2 * 0.5 && done && (margin > 0 || r.winrate < 0.1)) return { move: PASS, winrate: r.winrate, count: r.count };
  let ch = r.best;
  if (cfg.temp > 0) {
    // как у Wu и др. (AAAI 2019): вероятность ∝ посещения^z среди ходов, у которых ≥ 10% посещений лучшего
    const kids = r.root.children.filter((k) => k.n >= r.best.n * 0.1).sort((a, b) => b.n - a.n).slice(0, 8);
    const weights = kids.map((k) => (k.n / r.best.n) ** (1 / cfg.temp));
    let x = rng() * weights.reduce((a, b) => a + b, 0);
    for (let k = 0; k < kids.length; k++) {
      x -= weights[k];
      if (x <= 0) {
        ch = kids[k];
        break;
      }
    }
  }
  return { move: board.toIndex(ch.p), winrate: r.winrate, count: r.count };
}

/** Подсказка — лучший ход за того, чья очередь (индекс или PASS). */
export function hintMove(s, rng = makeRng()) {
  const pos = replay(s);
  const { board, turn } = pos;
  const [last, last2] = lastMoves(s, pos);
  const r = search(board, turn, {
    komi: s.komi, playouts: HINT_LEVEL.playouts, timeMs: HINT_LEVEL.timeMs, last, last2, rng,
    allowed: (p) => canPlayAt(pos, board.toIndex(p)),
  });
  return r.best ? board.toIndex(r.best.p) : PASS;
}

/**
 * Мёртвые камни в конце партии: розыгрыши из позиции — цепь мертва, если в среднем её точки достаются сопернику.
 * Лёгкие розыгрыши плохо видят одинокий камень в широкой чужой территории (владение ≈ 0), поэтому ещё проверка
 * окружения: область цепи (пустые точки и свои камни, через которые до неё можно дойти) упирается только в
 * живые чужие стены, своих камней в ней мало — цепь мертва, если розыгрыши уверенно не говорят обратное.
 * → { dead: [индексы], own: [n·n] владение −1…1 (+ чёрные) }.
 */
export function estimateDead(s, playouts = 1000, rng = makeRng(99)) {
  const pos = replay(s);
  const { board, turn } = pos;
  const own = ownership(board, turn, s.komi, playouts, rng);
  const W = board.W;
  const col = board.color;
  const dead = [];
  const seen = new Set();
  const chainOwn = (stones, c) => stones.reduce((a, q) => a + own[q], 0) / stones.length * (c === BLACK ? 1 : -1);
  for (let r = 0; r < board.n; r++) for (let c = 0; c < board.n; c++) {
    const p = board.pt(r, c);
    const v = col[p];
    if (v === EMPTY || seen.has(board.head[p])) continue;
    seen.add(board.head[p]);
    const stones = board.chain(p);
    const mine = chainOwn(stones, v);      // > 0 — розыгрыши за эту цепь
    let isDead = mine < -0.2;
    if (!isDead && mine < 0.3) {
      // область: пустые и свои камни, достижимые от цепи
      const region = new Set(stones);
      const stack = [...stones];
      const walls = new Set();
      let own2 = 0;
      while (stack.length) {
        const q = stack.pop();
        if (col[q] === v) own2++;
        for (const t of [q - 1, q + 1, q - W, q + W]) {
          const k = col[t];
          if (k === 3) continue;
          if (k === 3 - v) walls.add(board.head[t]);
          else if (!region.has(t)) {
            region.add(t);
            stack.push(t);
          }
        }
      }
      const wallsAlive = walls.size > 0 && [...walls].every((h) => chainOwn(board.chain(h), 3 - v) > 0.2);
      if (wallsAlive && own2 <= Math.max(6, region.size / 4) && region.size < board.n * board.n / 2) isDead = true;
    }
    if (isDead) for (const q of stones) dead.push(board.toIndex(q));
  }
  const ownIdx = [];
  for (let r = 0; r < board.n; r++) for (let c = 0; c < board.n; c++) ownIdx.push(Math.round(own[board.pt(r, c)] * 100) / 100);
  return { dead, own: ownIdx };
}
