// «Эрудит» — скрэббл на русском против бота. Здесь правила без DOM: набор фишек, поле с премиями, проверка
// и счёт хода, мешок, обмен, пас, конец партии, статистика. Словарь сюда не входит — проверка слов приходит
// функцией isWord (словарь и бот — в engine.js).
//
// Набор и отличия от Скрэббла — как в советском «Эрудите»: 131 фишка (128 букв и 3 звёздочки), буквы Ё нет
// (ё = е), центральная клетка без премии, за ход всеми семью фишками +15.
//
// Поле — строка из 225 знаков: «.» — пусто, строчная буква — фишка, ЗАГЛАВНАЯ — звёздочка, играющая за эту
// букву (очков не даёт). Игрок — 0, бот — 1.

export const SIZE = 15;
export const CELLS = SIZE * SIZE;
export const CENTER = 112;
export const RACK = 7;
export const BINGO = 15;
export const BLANK = '*';
export const BLANKS = 3;
export const LETTERS = 'абвгдежзийклмнопрстуфхцчшщъыьэюя';

// буква: [сколько фишек, очков]
export const TILES = {
  а: [10, 1], б: [3, 3], в: [5, 2], г: [3, 3], д: [5, 2], е: [9, 1], ж: [2, 5], з: [2, 5], и: [8, 1], й: [4, 2],
  к: [6, 2], л: [4, 2], м: [5, 2], н: [8, 1], о: [10, 1], п: [6, 2], р: [6, 2], с: [6, 2], т: [5, 2], у: [3, 3],
  ф: [1, 10], х: [2, 5], ц: [1, 10], ч: [2, 5], ш: [1, 10], щ: [1, 10], ъ: [1, 10], ы: [2, 5], ь: [2, 5],
  э: [1, 10], ю: [1, 10], я: [3, 3],
};
export const TOTAL_TILES = Object.values(TILES).reduce((n, [count]) => n + count, 0) + BLANKS;

/** Очки фишки: звёздочка — 0. */
export const valueOf = (ch) => TILES[ch]?.[1] ?? 0;

// Премии: d — буква ×2, t — буква ×3, 2 — слово ×2, 3 — слово ×3. Центр — обычная клетка.
const LAYOUT = [
  '3..d...3...d..3',
  '.2...t...t...2.',
  '..2...d.d...2..',
  'd..2...d...2..d',
  '....2.....2....',
  '.t...t...t...t.',
  '..d...d.d...d..',
  '3..d.......d..3',
  '..d...d.d...d..',
  '.t...t...t...t.',
  '....2.....2....',
  'd..2...d...2..d',
  '..2...d.d...2..',
  '.2...t...t...2.',
  '3..d...3...d..3',
].join('');
export const PREMIUM = [...LAYOUT].map((c) => (c === '.' ? '' : c));
const LETTER_MULT = { d: 2, t: 3 };
const WORD_MULT = { 2: 2, 3: 3 };

export const LEVEL_IDS = ['easy', 'medium', 'hard', 'master'];
export const IDLE_LIMIT = 4;            // столько ходов подряд без слов (два круга) — партия кончается

export const rowOf = (i) => Math.floor(i / SIZE);
export const colOf = (i) => i % SIZE;
export const EMPTY_BOARD = '.'.repeat(CELLS);
export const isEmptyBoard = (board) => board === EMPTY_BOARD;
const filled = (cells, i) => cells[i] !== '.';

// ---------- ход: раскладка, слова и очки ----------

/**
 * Что получается, если выложить фишки tiles = [{ i, ch, blank }] (ch — буква, за которую играет фишка):
 * { ok: true, dir, words: [{ word, cells, score }], score, bingo } или { ok: false, error }.
 * Ошибки: empty — фишек нет, occupied — клетка занята или её нет, line — не в одну линию, gap — с разрывом,
 * center — первое слово не через центр, short — одна буква не слово, connect — не касается выложенных слов.
 * Словарь не проверяется — это делает checkMove.
 */
export function layout(board, tiles) {
  if (!Array.isArray(tiles) || tiles.length === 0) return { ok: false, error: 'empty' };
  const cells = [...board];
  const fresh = new Map();
  for (const t of tiles) {
    if (!Number.isInteger(t.i) || t.i < 0 || t.i >= CELLS || cells[t.i] !== '.' || !(t.ch in TILES)) return { ok: false, error: 'occupied' };
    cells[t.i] = t.blank ? t.ch.toUpperCase() : t.ch;
    fresh.set(t.i, t);
  }
  if (fresh.size !== tiles.length) return { ok: false, error: 'occupied' };

  const rows = new Set(tiles.map((t) => rowOf(t.i)));
  const cols = new Set(tiles.map((t) => colOf(t.i)));
  if (rows.size > 1 && cols.size > 1) return { ok: false, error: 'line' };

  const first = isEmptyBoard(board);
  const neighbours = (i) => {
    const out = [];
    if (colOf(i) > 0) out.push(i - 1);
    if (colOf(i) < SIZE - 1) out.push(i + 1);
    if (i >= SIZE) out.push(i - SIZE);
    if (i < CELLS - SIZE) out.push(i + SIZE);
    return out;
  };
  const step = (dir) => (dir === 'h' ? 1 : SIZE);
  /** Все клетки слова, проходящего через клетку i в направлении dir. */
  const run = (i, dir) => {
    const s = step(dir);
    const sameLine = (a, b) => (dir === 'h' ? rowOf(a) === rowOf(b) : true);
    let from = i;
    while (from - s >= 0 && sameLine(from - s, i) && filled(cells, from - s)) from -= s;
    const out = [];
    for (let k = from; k < CELLS && sameLine(k, i) && filled(cells, k); k += s) out.push(k);
    return out;
  };

  let dir;
  if (tiles.length > 1) dir = rows.size === 1 ? 'h' : 'v';
  else dir = run(tiles[0].i, 'h').length > 1 ? 'h' : 'v';

  const main = run(tiles[0].i, dir);
  if (tiles.some((t) => !main.includes(t.i))) return { ok: false, error: 'gap' };
  if (first) {
    if (!fresh.has(CENTER)) return { ok: false, error: 'center' };
    if (main.length < 2) return { ok: false, error: 'short' };
  } else if (!tiles.some((t) => neighbours(t.i).some((n) => filled(board, n)))) {
    return { ok: false, error: 'connect' };
  }
  if (main.length < 2) return { ok: false, error: 'short' };

  const scoreOf = (list) => {
    let sum = 0;
    let mult = 1;
    for (const i of list) {
      const ch = cells[i];
      const value = ch === ch.toLowerCase() ? valueOf(ch) : 0;
      if (fresh.has(i)) {
        sum += value * (LETTER_MULT[PREMIUM[i]] ?? 1);
        mult *= WORD_MULT[PREMIUM[i]] ?? 1;
      } else {
        sum += value;
      }
    }
    return sum * mult;
  };
  const wordOf = (list) => ({ word: list.map((i) => cells[i].toLowerCase()).join(''), cells: list, score: scoreOf(list) });

  const cross = dir === 'h' ? 'v' : 'h';
  const words = [wordOf(main)];
  for (const t of tiles) {
    const list = run(t.i, cross);
    if (list.length > 1) words.push(wordOf(list));
  }
  const bingo = tiles.length === RACK;
  const score = words.reduce((n, w) => n + w.score, 0) + (bingo ? BINGO : 0);
  return { ok: true, dir, words, score, bingo };
}

/** layout + словарь: при неизвестных словах — { ok: false, error: 'word', bad: [слова], words }. */
export function checkMove(board, tiles, isWord) {
  const res = layout(board, tiles);
  if (!res.ok) return res;
  const bad = res.words.filter((w) => !isWord(w.word));
  if (bad.length) return { ok: false, error: 'word', bad: bad.map((w) => w.word), words: res.words };
  return res;
}

/** Хватает ли фишек на руках, чтобы выложить tiles (звёздочка — фишка «*»). */
export function hasTiles(rack, tiles) {
  const left = [...rack];
  for (const t of tiles) {
    const k = left.indexOf(t.blank ? BLANK : t.ch);
    if (k < 0) return false;
    left.splice(k, 1);
  }
  return true;
}

// ---------- мешок и партия ----------

function shuffle(list, rng) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/** Полный мешок, перемешанный; фишки тянутся с конца. */
export function newBag(rng = Math.random) {
  const bag = [];
  for (const [ch, [count]] of Object.entries(TILES)) for (let k = 0; k < count; k++) bag.push(ch);
  for (let k = 0; k < BLANKS; k++) bag.push(BLANK);
  return shuffle(bag, rng);
}

function refill(game, who) {
  while (game.racks[who].length < RACK && game.bag.length) game.racks[who].push(game.bag.pop());
}

/** Новая партия: по семь фишек, кто ходит первым — жребий. */
export function newGame(level = 'easy', rng = Math.random) {
  const game = {
    v: 1,
    level: LEVEL_IDS.includes(level) ? level : 'easy',
    board: EMPTY_BOARD,
    bag: newBag(rng),
    racks: [[], []],
    scores: [0, 0],
    turn: 0,
    idle: 0,          // ходов подряд без слов (пас или обмен)
    moves: 0,
    best: 0,          // лучший ход игрока за партию
    last: null,       // последний ход: { by, type: 'play' | 'swap' | 'pass', score, words, cells, count }
  };
  refill(game, 0);
  refill(game, 1);
  game.turn = rng() < 0.5 ? 0 : 1;
  return game;
}

function endTurn(game, last) {
  game.last = last;
  game.moves += 1;
  game.turn = 1 - game.turn;
}

/** Выложить слово: res — результат checkMove для этих фишек. Проверки — на вызывающем. */
export function play(game, tiles, res) {
  const who = game.turn;
  const cells = [...game.board];
  for (const t of tiles) {
    cells[t.i] = t.blank ? t.ch.toUpperCase() : t.ch;
    game.racks[who].splice(game.racks[who].indexOf(t.blank ? BLANK : t.ch), 1);
  }
  game.board = cells.join('');
  game.scores[who] += res.score;
  if (who === 0) game.best = Math.max(game.best, res.score);
  game.idle = 0;
  refill(game, who);
  endTurn(game, {
    by: who, type: 'play', score: res.score, words: res.words.map((w) => w.word), cells: tiles.map((t) => t.i), bingo: res.bingo,
  });
}

/** Можно ли менять фишки: в мешке должно быть не меньше семи. */
export const canSwap = (game) => game.bag.length >= RACK;

/** Обмен: picks — номера фишек на руках. Новые тянутся до возврата старых в мешок. */
export function swap(game, picks, rng = Math.random) {
  const who = game.turn;
  const rack = game.racks[who];
  const out = [...new Set(picks)].filter((k) => Number.isInteger(k) && k >= 0 && k < rack.length).sort((a, b) => b - a);
  if (!out.length || !canSwap(game)) return false;
  const back = out.map((k) => rack.splice(k, 1)[0]);
  refill(game, who);
  game.bag.push(...back);
  shuffle(game.bag, rng);
  game.idle += 1;
  endTurn(game, { by: who, type: 'swap', score: 0, words: [], cells: [], count: back.length });
  return true;
}

export function pass(game) {
  const who = game.turn;
  game.idle += 1;
  endTurn(game, { by: who, type: 'pass', score: 0, words: [], cells: [] });
}

/**
 * Кончилась ли партия: 'out' — мешок пуст и у кого-то не осталось фишек; 'idle' — два круга подряд никто
 * не выложил слово; иначе null.
 */
export function ending(game) {
  if (!game.bag.length && game.racks.some((r) => r.length === 0)) return 'out';
  if (game.idle >= IDLE_LIMIT) return 'idle';
  return null;
}

const rackValue = (rack) => rack.reduce((n, ch) => n + valueOf(ch), 0);

/**
 * Итог: у каждого вычитаются очки оставшихся на руках фишек; кто выложил всё — получает очки фишек соперника.
 * Меньше нуля счёт не опускается. → { scores, left: [минус игроку, минус боту], out: кто выложил всё | null }
 */
export function finalScores(game) {
  const left = game.racks.map(rackValue);
  const out = !game.bag.length ? game.racks.findIndex((r) => r.length === 0) : -1;
  const scores = game.scores.map((s, who) => Math.max(0, s - left[who] + (who === out ? left[1 - who] : 0)));
  return { scores, left, out: out < 0 ? null : out };
}

/** Исход для игрока по итоговому счёту. */
export function outcomeOf(scores) {
  if (scores[0] > scores[1]) return 'win';
  return scores[0] < scores[1] ? 'lose' : 'draw';
}

// ---------- сохранение ----------

const isCount = (n, max = 1e6) => Number.isInteger(n) && n >= 0 && n <= max;
const BOARD_RE = /^[.а-яА-Я]{225}$/;

/** Сохранённая партия цела: все 131 фишка на месте (поле + мешок + руки), счёт и очередь — в пределах. */
export function isValidState(s) {
  if (!s || typeof s !== 'object' || s.v !== 1 || !LEVEL_IDS.includes(s.level)) return false;
  if (typeof s.board !== 'string' || !BOARD_RE.test(s.board)) return false;
  if (!Array.isArray(s.bag) || !Array.isArray(s.racks) || s.racks.length !== 2) return false;
  if (!s.racks.every((r) => Array.isArray(r) && r.length <= RACK)) return false;
  if (!Array.isArray(s.scores) || s.scores.length !== 2 || !s.scores.every((n) => isCount(n))) return false;
  if (s.turn !== 0 && s.turn !== 1) return false;
  if (!isCount(s.idle, IDLE_LIMIT - 1) || !isCount(s.moves) || !isCount(s.best)) return false;
  const counts = {};
  const add = (ch) => { counts[ch] = (counts[ch] ?? 0) + 1; };
  for (const ch of s.board) {
    if (ch === '.') continue;
    add(ch === ch.toLowerCase() ? ch : BLANK);
  }
  for (const ch of [...s.bag, ...s.racks[0], ...s.racks[1]]) {
    if (ch !== BLANK && !(ch in TILES)) return false;
    add(ch);
  }
  if ((counts[BLANK] ?? 0) !== BLANKS) return false;
  if (!Object.entries(TILES).every(([ch, [count]]) => (counts[ch] ?? 0) === count)) return false;
  // фишки добираются до семи, пока мешок не пуст; на поле — либо пусто, либо слово через центр
  if (s.bag.length && s.racks.some((r) => r.length !== RACK)) return false;
  if (!isEmptyBoard(s.board) && s.board[CENTER] === '.') return false;
  if (ending(s)) return false;
  if (s.last != null) {
    const l = s.last;
    if (typeof l !== 'object' || (l.by !== 0 && l.by !== 1) || !['play', 'swap', 'pass'].includes(l.type)) return false;
    if (!isCount(l.score) || !Array.isArray(l.words) || !Array.isArray(l.cells)) return false;
    if (!l.words.every((w) => typeof w === 'string') || !l.cells.every((i) => isCount(i, CELLS - 1))) return false;
  }
  return true;
}

// ---------- статистика ----------

const emptyLevel = () => ({ played: 0, wins: 0, losses: 0, draws: 0, best: 0, bestMove: 0 });

/** Статистика по уровням бота: партий, побед, поражений, ничьих, лучший счёт партии и лучший ход. */
export function emptyStats() {
  return Object.fromEntries(LEVEL_IDS.map((id) => [id, emptyLevel()]));
}

export function isValidStats(s) {
  if (!s || typeof s !== 'object') return false;
  return LEVEL_IDS.every((id) => {
    const lv = s[id];
    return lv && typeof lv === 'object' && Object.keys(emptyLevel()).every((k) => isCount(lv[k], 1e7));
  });
}

/** Статистика из хранилища: чего нет или испорчено — нули. */
export function migrateStats(saved) {
  const stats = emptyStats();
  for (const id of LEVEL_IDS) {
    for (const k of Object.keys(stats[id])) {
      const v = saved?.[id]?.[k];
      if (isCount(v, 1e7)) stats[id][k] = v;
    }
  }
  return stats;
}

/** Записать законченную партию в статистику уровня. */
export function recordGame(stats, level, outcome, score, bestMove) {
  const lv = stats[level];
  lv.played += 1;
  if (outcome === 'win') lv.wins += 1;
  else if (outcome === 'lose') lv.losses += 1;
  else lv.draws += 1;
  lv.best = Math.max(lv.best, score);
  lv.bestMove = Math.max(lv.bestMove, bestMove);
  return stats;
}
