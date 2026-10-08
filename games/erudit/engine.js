// Словарь и бот «Эрудита».
//
// Словарь — префиксное дерево в типизированных массивах (первый потомок / следующий сосед): 49 тысяч слов —
// около 190 тысяч узлов и пара мегабайт памяти вместо десятков на объектах.
//
// Перебор ходов — алгоритм Аппеля и Джейкобсона («The World's Fastest Scrabble Program», 1988): в каждой линии
// для пустых клеток заранее считаются буквы, дающие верные поперечные слова; ход строится от «якоря» (пустой
// клетки рядом с выложенной) — сначала левая часть из фишек с руки, потом вправо по дереву. Столбцы — те же
// линии, только поле читается по столбцам.
//
// Уровни бота отличаются словарным запасом (частые слова или весь словарь) и тем, насколько строго он берёт
// самый дорогой ход.

import { SIZE, CELLS, CENTER, RACK, BINGO, BLANK, LETTERS, PREMIUM, TILES, canSwap } from './logic.js';

const A = LETTERS.charCodeAt(0);
const N = LETTERS.length;                 // 32 буквы подряд в Юникоде: а…я без ё
const STAR = N;                           // номер звёздочки в счётчиках руки
const VALUES = [...LETTERS].map((ch) => TILES[ch][1]);
const WORD = 1;                           // признаки конца слова в дереве
const COMMON = 2;
const AVOID = 4;

// Слова, которые бот сам не выкладывает (грубые, оскорбительные, мрачные). Игроку они не запрещены — они есть
// в словаре.
const BOT_AVOID = ('жид жидовка жидомор кацап кацапка москаль чухонец чухонка чухоночка хохол хохлушка хохлушечка '
  + 'негритос негритоска арап арапка арапчонок азиатчина хер дерьмо шлюха сука стерва стервец стервоза лярва мразь '
  + 'мраз сволочье ублюдок выродок подонок быдло гнида дебил кретин кретинка идиот идиотка потаскуха потаскуша '
  + 'потаскушка потаскун потаскунья проститутка проститут проституция бордель сутенер педераст педерастия педофил '
  + 'педофилия онанизм онанист онанистка онанирование пенис фалл фаллос фаллус влагалище мошонка оргазм сперма '
  + 'сиська титька задница понос моча кал блевота блевотина рвота гонорея сифилис сифилитик сифилитичка триппер '
  + 'изнасилование насильник суицид самоубийство самоубийца холокост геноцид гестапо гестаповец эсэсовец нацизм '
  + 'нацист нацистка фашист фашистка расист расистка свастика концлагерь висельник виселица').split(' ');

// ---------- словарь ----------

/**
 * Словарь из списка слов (строчные а…я) и списка частых. Возвращает дерево и проверки:
 * isWord(слово), isCommon(слово), size — число слов.
 */
/** Список слов вместе с добавкой современных слов (её может не быть — тогда список как есть). */
export const joinWords = (main, extra) => (Array.isArray(extra) && extra.length ? [...main, ...extra] : main);

export function createDict(words, common = []) {
  const sorted = words.every((w, k) => k === 0 || words[k - 1] < w) ? words : [...new Set(words)].sort();
  const total = sorted.reduce((n, w) => n + w.length, 1);
  const first = new Int32Array(total);
  const next = new Int32Array(total);
  const last = new Int32Array(total);
  const letter = new Uint8Array(total);
  const end = new Uint8Array(total);
  let count = 1;                          // узел 0 — корень
  const path = [0];
  let prev = '';
  for (const w of sorted) {
    let k = 0;
    while (k < prev.length && k < w.length && prev.charCodeAt(k) === w.charCodeAt(k)) k++;
    path.length = k + 1;
    for (let j = k; j < w.length; j++) {
      const node = count++;
      const parent = path[j];
      letter[node] = w.charCodeAt(j) - A;
      if (last[parent]) next[last[parent]] = node;
      else first[parent] = node;
      last[parent] = node;
      path.push(node);
    }
    end[path[w.length]] |= WORD;
    prev = w;
  }

  const child = (node, c) => {
    for (let k = first[node]; k; k = next[k]) if (letter[k] === c) return k;
    return 0;
  };
  /** Узел слова или -1 (корень — пустая строка). */
  const find = (word) => {
    let node = 0;
    for (let k = 0; k < word.length; k++) {
      const c = word.charCodeAt(k) - A;
      if (c < 0 || c >= N) return -1;
      node = child(node, c);
      if (!node) return -1;
    }
    return node;
  };
  const mark = (list, flag) => {
    for (const w of list) {
      const node = find(w);
      if (node > 0 && (end[node] & WORD)) end[node] |= flag;
    }
  };
  mark(common, COMMON);
  mark(BOT_AVOID, AVOID);

  const has = (word, flag) => {
    const node = typeof word === 'string' && word.length > 1 ? find(word) : -1;
    return node > 0 && (end[node] & flag) !== 0;
  };
  return {
    size: sorted.length,
    nodes: count,
    first: first.subarray(0, count),
    next: next.subarray(0, count),
    letter: letter.subarray(0, count),
    end: end.subarray(0, count),
    child,
    isWord: (word) => has(word, WORD),
    isCommon: (word) => has(word, COMMON),
    isAvoided: (word) => has(word, AVOID),
  };
}

// ---------- перебор ходов ----------

const LETTER_MULT = PREMIUM.map((p) => (p === 'd' ? 2 : p === 't' ? 3 : 1));
const WORD_MULT = PREMIUM.map((p) => (p === '2' ? 2 : p === '3' ? 3 : 1));

/**
 * Все ходы, которые можно сделать фишками rack на поле board:
 * [{ tiles: [{ i, ch, blank }], score, word, common }] — word — главное слово, common — оно из частых.
 * polite — не предлагать слова из списка BOT_AVOID (ни главным, ни поперечным): так ходит бот.
 * Один и тот же ход дважды не встречается.
 */
export function generateMoves(dict, board, rack, { polite = false } = {}) {
  const { first, next, letter, end } = dict;
  const okEnd = polite ? (node) => (end[node] & (WORD | AVOID)) === WORD : (node) => (end[node] & WORD) !== 0;

  const grid = new Int8Array(CELLS);        // -1 пусто, иначе номер буквы
  const points = new Uint8Array(CELLS);     // очки выложенной фишки (звёздочка — 0)
  let empty = true;
  for (let i = 0; i < CELLS; i++) {
    const ch = board[i];
    if (ch === '.') {
      grid[i] = -1;
      continue;
    }
    const low = ch.toLowerCase();
    grid[i] = low.charCodeAt(0) - A;
    points[i] = ch === low ? VALUES[grid[i]] : 0;
    empty = false;
  }

  const hand = new Uint8Array(N + 1);
  for (const ch of rack) hand[ch === BLANK ? STAR : ch.charCodeAt(0) - A] += 1;

  const moves = [];
  const crossMask = new Int32Array(SIZE);   // по клеткам текущей линии
  const crossSum = new Int16Array(SIZE);    // очки соседей по поперечному слову или -1 — соседей нет
  const anchor = new Uint8Array(SIZE);
  const leftPart = [];                      // буквы левой части: номер буквы + 64, если это звёздочка
  const rightPos = [];
  const rightTile = [];

  for (let dir = 0; dir < 2; dir++) {
    // клетка линии: по строкам — (line, pos), по столбцам — (pos, line)
    const at = dir === 0 ? (line, pos) => line * SIZE + pos : (line, pos) => pos * SIZE + line;

    for (let line = 0; line < SIZE; line++) {
      let any = false;
      for (let pos = 0; pos < SIZE; pos++) {
        const i = at(line, pos);
        anchor[pos] = 0;
        crossMask[pos] = 0;
        crossSum[pos] = -1;
        if (grid[i] >= 0) continue;
        // соседи поперёк: над клеткой и под ней (в координатах линии — соседние линии)
        let up = line;
        while (up > 0 && grid[at(up - 1, pos)] >= 0) up--;
        let down = line;
        while (down < SIZE - 1 && grid[at(down + 1, pos)] >= 0) down++;
        const side = (pos > 0 && grid[at(line, pos - 1)] >= 0) || (pos < SIZE - 1 && grid[at(line, pos + 1)] >= 0);
        if (up === line && down === line) {
          crossMask[pos] = -1;              // все 32 буквы
          anchor[pos] = side ? 1 : 0;
        } else {
          anchor[pos] = 1;
          let sum = 0;
          let node = 0;
          for (let l = up; l < line && node >= 0; l++) {
            const j = at(l, pos);
            sum += points[j];
            node = childOf(node, grid[j]);
          }
          for (let l = line + 1; l <= down; l++) sum += points[at(l, pos)];
          crossSum[pos] = sum;
          if (node >= 0) {
            for (let k = first[node]; k; k = next[k]) {
              let tail = k;
              for (let l = line + 1; l <= down && tail >= 0; l++) tail = childOf(tail, grid[at(l, pos)]);
              if (tail >= 0 && okEnd(tail)) crossMask[pos] |= 1 << letter[k];
            }
          }
        }
        if (empty && i === CENTER) anchor[pos] = 1;
        if (anchor[pos]) any = true;
      }
      if (!any) continue;

      for (let pos = 0; pos < SIZE; pos++) {
        if (!anchor[pos]) continue;
        if (pos > 0 && grid[at(line, pos - 1)] >= 0) {
          // слева уже лежат фишки — они и есть левая часть
          let start = pos - 1;
          while (start > 0 && grid[at(line, start - 1)] >= 0) start--;
          let node = 0;
          for (let p = start; p < pos && node >= 0; p++) node = childOf(node, grid[at(line, p)]);
          if (node >= 0) extendRight(node, pos, pos, start, line, at, dir);
        } else {
          let limit = 0;
          while (pos - limit - 1 >= 0 && !anchor[pos - limit - 1] && grid[at(line, pos - limit - 1)] < 0) limit++;
          buildLeft(0, limit, pos, line, at, dir);
        }
      }
    }
  }
  return moves;

  function childOf(node, c) {
    for (let k = first[node]; k; k = next[k]) if (letter[k] === c) return k;
    return -1;
  }

  /** Левая часть из фишек с руки: до limit букв левее якоря (там пусто и нет соседей поперёк). */
  function buildLeft(node, limit, anchorPos, line, at, dir) {
    extendRight(node, anchorPos, anchorPos, anchorPos - leftPart.length, line, at, dir);
    if (limit <= 0) return;
    for (let k = first[node]; k; k = next[k]) {
      const c = letter[k];
      if (hand[c]) {
        hand[c]--;
        leftPart.push(c);
        buildLeft(k, limit - 1, anchorPos, line, at, dir);
        leftPart.pop();
        hand[c]++;
      }
      if (hand[STAR]) {
        hand[STAR]--;
        leftPart.push(c + 64);
        buildLeft(k, limit - 1, anchorPos, line, at, dir);
        leftPart.pop();
        hand[STAR]++;
      }
    }
  }

  /** Продолжение вправо от клетки pos: node — узел уже набранного (от start до pos − 1). */
  function extendRight(node, pos, anchorPos, start, line, at, dir) {
    if (pos < SIZE && grid[at(line, pos)] >= 0) {
      const k = childOf(node, grid[at(line, pos)]);
      if (k >= 0) extendRight(k, pos + 1, anchorPos, start, line, at, dir);
      return;
    }
    if (pos > anchorPos && okEnd(node)) record(node, start, pos - 1, anchorPos, line, at, dir);
    if (pos >= SIZE) return;
    const mask = crossMask[pos];
    if (!mask) return;
    for (let k = first[node]; k; k = next[k]) {
      const c = letter[k];
      if (!(mask & (1 << c))) continue;
      if (hand[c]) {
        hand[c]--;
        rightPos.push(pos);
        rightTile.push(c);
        extendRight(k, pos + 1, anchorPos, start, line, at, dir);
        rightPos.pop();
        rightTile.pop();
        hand[c]++;
      }
      if (hand[STAR]) {
        hand[STAR]--;
        rightPos.push(pos);
        rightTile.push(c + 64);
        extendRight(k, pos + 1, anchorPos, start, line, at, dir);
        rightPos.pop();
        rightTile.pop();
        hand[STAR]++;
      }
    }
  }

  function record(node, start, stop, anchorPos, line, at, dir) {
    const placed = leftPart.length + rightPos.length;
    // одна фишка с соседями в обе стороны находится и по строкам, и по столбцам — берём только из строк
    if (dir === 1 && placed === 1 && crossSum[rightPos[0]] >= 0) return;
    const tiles = [];
    let main = 0;
    let mult = 1;
    let cross = 0;
    let word = '';
    let r = 0;
    for (let pos = start; pos <= stop; pos++) {
      const i = at(line, pos);
      if (grid[i] >= 0) {
        main += points[i];
        word += LETTERS[grid[i]];
        continue;
      }
      const t = pos < anchorPos ? leftPart[pos - (anchorPos - leftPart.length)] : rightTile[r++];
      const blank = t >= 64;
      const c = blank ? t - 64 : t;
      const value = (blank ? 0 : VALUES[c]) * LETTER_MULT[i];
      main += value;
      mult *= WORD_MULT[i];
      if (crossSum[pos] >= 0) cross += (crossSum[pos] + value) * WORD_MULT[i];
      word += LETTERS[c];
      tiles.push({ i, ch: LETTERS[c], blank });
    }
    moves.push({
      tiles, word, score: main * mult + cross + (placed === RACK ? BINGO : 0), common: (end[node] & COMMON) !== 0,
    });
  }
}

// ---------- бот ----------

/**
 * Уровни: vocab — словарный запас главного слова ('common' — частые слова, 'all' — весь словарь);
 * temp — «температура» выбора: 0 — всегда самый дорогой ход, больше — чаще ходы подешевле (вес хода —
 * exp((очки − лучшие) / temp), как Skill Level у шахматных движков), Infinity — любой ход наугад;
 * stuck — что делать, когда слов из своего запаса нет: 'swap' — менять фишки, 'any' — взять слово из всего словаря.
 * Менять по своей воле бот перестаёт, когда уже два хода подряд прошли без слов: ещё два — и партия кончилась бы.
 * Подобрано партиями против сильнейшего уровня — очков за ход: ≈ 8 / 12 / 16 / 18 (лёгкий меняет фишки в каждом шестом ходу).
 */
export const LEVELS = {
  easy: { vocab: 'common', temp: Infinity, stuck: 'swap' },
  medium: { vocab: 'common', temp: 6, stuck: 'any' },
  hard: { vocab: 'all', temp: 3, stuck: 'any' },
  master: { vocab: 'all', temp: 0, stuck: 'any' },
};

const STAR_COST = 6;                        // звёздочку жалко тратить на дешёвый ход

/**
 * Ход бота: { type: 'play', tiles, score, word } | { type: 'swap', picks } | { type: 'pass' }.
 * Нет ходов — меняет фишки (звёздочки оставляет), а когда менять нельзя (в мешке меньше семи) — пасует.
 */
export function botMove(dict, game, level = game.level, rng = Math.random) {
  const cfg = LEVELS[level] ?? LEVELS.easy;
  const rack = game.racks[game.turn];
  const all = generateMoves(dict, game.board, rack, { polite: true });
  let pool = cfg.vocab === 'common' ? all.filter((m) => m.common) : all;
  // слов из своего запаса нет: слабый бот меняет фишки, пока это можно и партия от этого не кончится; иначе — любое слово
  if (!pool.length && !(cfg.stuck === 'swap' && canSwap(game) && game.idle < 2)) pool = all;
  if (!pool.length) {
    if (!canSwap(game)) return { type: 'pass' };
    const picks = rack.map((ch, k) => (ch === BLANK ? -1 : k)).filter((k) => k >= 0);
    return picks.length ? { type: 'swap', picks } : { type: 'pass' };
  }
  // последние фишки: звёздочку беречь уже не для чего
  const starCost = game.bag.length ? STAR_COST : 0;
  const worth = (m) => m.score - starCost * m.tiles.reduce((n, t) => n + (t.blank ? 1 : 0), 0);
  let best = pool[0];
  let top = worth(best);
  for (const m of pool) {
    const w = worth(m);
    if (w > top || (w === top && m.score > best.score)) {
      best = m;
      top = w;
    }
  }
  let pick = best;
  if (cfg.temp > 0) {
    const weights = pool.map((m) => (cfg.temp === Infinity ? 1 : Math.exp((worth(m) - top) / cfg.temp)));
    let roll = rng() * weights.reduce((n, w) => n + w, 0);
    for (let k = 0; k < pool.length; k++) {
      roll -= weights[k];
      if (roll <= 0) {
        pick = pool[k];
        break;
      }
    }
  }
  return { type: 'play', tiles: pick.tiles, score: pick.score, word: pick.word };
}
