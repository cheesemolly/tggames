// Правила «Круга слов» без DOM: разбор уровня, проверка слова, открытие клеток, подсказки, монеты, прогресс.
//
// Уровень — буквы круга и кроссворд из слов, которые из этих букв складываются. Игрок собирает слово, оно встаёт
// в кроссворд; слово, которого в кроссворде нет, но оно есть в словаре уровня, — бонусное (монета). Клетку может
// открыть и подсказка; слово, у которого открыты все клетки, считается найденным. Уровень пройден, когда найдены
// все слова кроссворда.
//
// Уровни (levels.json) собирает tools/word-circle-levels.mjs. Строка уровня:
//   «буквы|слово,x,y,d;слово,x,y,d;…|бонусное,бонусное,…»   (d: 0 — слева направо, 1 — сверху вниз)

export const START_COINS = 100;
/** Цены подсказок: буква в случайной клетке, буква в выбранной клетке, пять букв разом. */
export const COSTS = { letter: 25, cell: 50, rocket: 100 };
export const ROCKET_CELLS = 5;
export const CHAPTER = 20;                   // уровней в главе (у главы свой пейзаж)
export const CHAPTER_BONUS = 50;
export const BONUS_COIN = 1;                 // монет за бонусное слово
export const MIN_WORD = 3;
export const MAX_COLS = 9;
export const MAX_ROWS = 7;

const fold = (text) => String(text ?? '').toLowerCase().replace(/ё/g, 'е');
const key = (x, y) => y * 64 + x;

/** Разбор строки уровня. → { letters, words: [{ word, x, y, dir, cells }], cells: [{ x, y, ch, words }], cols, rows, bonus } */
export function parseLevel(text) {
  const [lettersPart = '', wordsPart = '', bonusPart = ''] = String(text ?? '').split('|');
  const letters = [...lettersPart];
  const cells = [];
  const at = new Map();
  const words = wordsPart.split(';').filter(Boolean).map((item, index) => {
    const [word, xs, ys, ds] = item.split(',');
    const x = Number(xs);
    const y = Number(ys);
    const dir = Number(ds) ? 1 : 0;
    const own = [];
    [...word].forEach((ch, k) => {
      const cx = x + (dir ? 0 : k);
      const cy = y + (dir ? k : 0);
      let id = at.get(key(cx, cy));
      if (id == null) {
        id = cells.length;
        at.set(key(cx, cy), id);
        cells.push({ x: cx, y: cy, ch, words: [] });
      }
      cells[id].words.push(index);
      own.push(id);
    });
    return { word, x, y, dir, cells: own };
  });
  const cols = cells.reduce((m, c) => Math.max(m, c.x + 1), 0);
  const rows = cells.reduce((m, c) => Math.max(m, c.y + 1), 0);
  return { letters, words, cells, cols, rows, bonus: new Set(bonusPart.split(',').filter(Boolean)) };
}

/** Можно ли сложить слово из букв круга (каждая буква — не больше раз, чем она есть). */
export function canForm(word, letters) {
  const pool = new Map();
  for (const ch of letters) pool.set(ch, (pool.get(ch) ?? 0) + 1);
  for (const ch of word) {
    const left = pool.get(ch) ?? 0;
    if (!left) return false;
    pool.set(ch, left - 1);
  }
  return true;
}

/**
 * Что не так с уровнем (пусто — всё в порядке). Проверка независима от генератора: буквы и слова, пересечения,
 * случайные соседства (любая цепочка букв по строке или столбцу — ровно одно слово уровня), связность, размер.
 */
export function levelProblems(level) {
  const out = [];
  const { letters, words, cells, cols, rows, bonus } = level;
  if (letters.length < 3 || letters.length > 7) out.push(`букв в круге: ${letters.length}`);
  if (!letters.every((ch) => /^[а-я]$/.test(ch))) out.push('в круге не буквы');
  if (words.length < 2) out.push(`слов: ${words.length}`);
  if (cols > MAX_COLS || rows > MAX_ROWS) out.push(`кроссворд ${cols}×${rows}`);
  const seen = new Set();
  const grid = new Map();
  for (const w of words) {
    if (!/^[а-я]+$/.test(w.word) || w.word.length < MIN_WORD) out.push(`слово «${w.word}»`);
    if (!canForm(w.word, letters)) out.push(`«${w.word}» не складывается из букв`);
    if (seen.has(w.word)) out.push(`«${w.word}» дважды`);
    seen.add(w.word);
    if (!(w.x >= 0 && w.y >= 0)) out.push(`«${w.word}» за краем`);
    [...w.word].forEach((ch, k) => {
      const k2 = key(w.x + (w.dir ? 0 : k), w.y + (w.dir ? k : 0));
      if (grid.has(k2) && grid.get(k2) !== ch) out.push(`«${w.word}»: в клетке уже «${grid.get(k2)}»`);
      grid.set(k2, ch);
    });
  }
  if (cells.length !== grid.size) out.push('клетки не сходятся');
  // каждая цепочка из двух и более букв подряд — слово уровня, стоящее именно здесь
  const placed = new Set(words.map((w) => `${w.word},${w.x},${w.y},${w.dir}`));
  let runs = 0;
  for (const dir of [0, 1]) {
    const outer = dir ? cols : rows;
    const inner = dir ? rows : cols;
    for (let a = 0; a < outer; a++) {
      let run = '';
      let start = 0;
      for (let b = 0; b <= inner; b++) {
        const ch = b < inner ? grid.get(dir ? key(a, b) : key(b, a)) : undefined;
        if (ch) {
          if (!run) start = b;
          run += ch;
          continue;
        }
        if (run.length >= 2) {
          runs++;
          const id = dir ? `${run},${a},${start},1` : `${run},${start},${a},0`;
          if (!placed.has(id)) out.push(`лишняя цепочка «${run}»`);
        }
        run = '';
      }
    }
  }
  if (runs !== words.length) out.push(`цепочек ${runs}, слов ${words.length}`);
  // связность: от первого слова по пересечениям доходим до всех
  const reached = new Set([0]);
  const queue = [0];
  while (queue.length) {
    const w = words[queue.pop()];
    if (!w) break;
    for (const c of w.cells) {
      for (const other of cells[c].words) {
        if (!reached.has(other)) {
          reached.add(other);
          queue.push(other);
        }
      }
    }
  }
  if (words.length && reached.size !== words.length) out.push('кроссворд не связан');
  for (const b of bonus) {
    if (seen.has(b)) out.push(`бонусное «${b}» стоит в кроссворде`);
    if (!/^[а-я]+$/.test(b) || b.length < MIN_WORD) out.push(`бонусное «${b}»`);
    else if (!canForm(b, letters)) out.push(`бонусное «${b}» не складывается`);
  }
  return out;
}

/** Строка уровня с номером n (с единицы). Уровни кончились — идут по кругу. */
export function levelText(levels, n) {
  const total = levels.length;
  if (!total) return '';
  return levels[(((Math.max(1, Math.floor(n)) - 1) % total) + total) % total];
}

export const chapterOf = (n) => Math.floor((Math.max(1, n) - 1) / CHAPTER);
/** Последний ли это уровень главы (за него — надбавка). */
export const endsChapter = (n) => n % CHAPTER === 0;

/** Монеты за пройденный уровень: больше слов и букв — больше. */
export const reward = (level) => 8 + 2 * level.words.length + (level.letters.length >= 6 ? 4 : 0);

function shuffled(count, rng) {
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/** Новый порядок букв в круге — обязательно другой (если буквы вообще можно переставить). */
export function reorder(order, rng = Math.random) {
  if (order.length < 2) return [...order];
  for (let tries = 0; tries < 20; tries++) {
    const next = shuffled(order.length, rng).map((i) => order[i]);
    if (next.some((v, i) => v !== order[i])) return next;
  }
  return [...order.slice(1), order[0]];
}

/** Начатый уровень: найденные слова (номера), открытые подсказкой клетки, бонусные слова, порядок букв в круге. */
export function newState(n, level) {
  return { v: 1, level: n, found: [], open: [], bonus: [], order: level.letters.map((_, i) => i) };
}

const isIndexList = (list, limit) => Array.isArray(list) && list.length <= limit
  && list.every((v) => Number.isInteger(v) && v >= 0 && v < limit) && new Set(list).size === list.length;

export function isValidState(state, level, n) {
  if (!state || typeof state !== 'object' || state.v !== 1) return false;
  if (!Number.isInteger(state.level) || state.level < 1 || (n != null && state.level !== n)) return false;
  if (!isIndexList(state.found, level.words.length) || !isIndexList(state.open, level.cells.length)) return false;
  if (!Array.isArray(state.bonus) || state.bonus.length > level.bonus.size) return false;
  if (!state.bonus.every((w) => level.bonus.has(w)) || new Set(state.bonus).size !== state.bonus.length) return false;
  if (!isIndexList(state.order, level.letters.length) || state.order.length !== level.letters.length) return false;
  return true;
}

/** Клетки, в которых буква уже видна: из найденных слов и открытые подсказкой. → Set номеров клеток. */
export function shownCells(level, state) {
  const shown = new Set(state.open);
  for (const w of state.found) for (const c of level.words[w].cells) shown.add(c);
  return shown;
}

/** Слова, у которых видны все буквы, становятся найденными. → номера таких слов. */
export function settle(level, state) {
  const shown = shownCells(level, state);
  const fresh = [];
  level.words.forEach((w, index) => {
    if (state.found.includes(index) || !w.cells.every((c) => shown.has(c))) return;
    state.found.push(index);
    fresh.push(index);
  });
  return fresh;
}

export const isDone = (level, state) => state.found.length >= level.words.length;

/**
 * Игрок собрал слово. → { kind, index?, also? }:
 *   'found' — слово кроссворда (index), also — слова, которые этим заодно закрылись;
 *   'again' — оно уже найдено (index); 'bonus' — бонусное; 'bonus-again' — уже было;
 *   'short' — меньше трёх букв; 'none' — такого слова нет.
 */
export function submit(level, state, text) {
  const word = fold(text);
  if ([...word].length < MIN_WORD) return { kind: 'short' };
  const index = level.words.findIndex((w) => w.word === word);
  if (index >= 0) {
    if (state.found.includes(index)) return { kind: 'again', index };
    state.found.push(index);
    return { kind: 'found', index, also: settle(level, state) };
  }
  if (level.bonus.has(word)) {
    if (state.bonus.includes(word)) return { kind: 'bonus-again' };
    state.bonus.push(word);
    return { kind: 'bonus' };
  }
  return { kind: 'none' };
}

/** Клетки, которые ещё можно открыть подсказкой. */
export function hiddenCells(level, state) {
  const shown = shownCells(level, state);
  return level.cells.map((_, i) => i).filter((i) => !shown.has(i));
}

/** Подсказка: открыть count случайных клеток. → { cells: открытые, words: закрывшиеся этим слова }. */
export function revealRandom(level, state, count = 1, rng = Math.random) {
  const hidden = hiddenCells(level, state);
  const cells = [];
  while (cells.length < count && hidden.length) cells.push(hidden.splice(Math.floor(rng() * hidden.length), 1)[0]);
  state.open.push(...cells);
  return { cells, words: settle(level, state) };
}

/** Подсказка «в эту клетку». → { cells, words } или null, если буква там уже видна. */
export function revealCell(level, state, cell) {
  if (!Number.isInteger(cell) || cell < 0 || cell >= level.cells.length) return null;
  if (shownCells(level, state).has(cell)) return null;
  state.open.push(cell);
  return { cells: [cell], words: settle(level, state) };
}

// ---------- прогресс и статистика ----------

const nat = (v) => (Number.isInteger(v) && v > 0 ? v : 0);

/** level — уровень, на котором игрок (пройдено level − 1); coins — монеты. */
export const emptyProgress = () => ({ level: 1, coins: START_COINS });

export function migrateProgress(raw) {
  if (!raw || typeof raw !== 'object') return emptyProgress();
  return {
    level: Math.max(1, nat(raw.level)),
    coins: Number.isInteger(raw.coins) && raw.coins >= 0 ? Math.min(raw.coins, 1e7) : START_COINS,
  };
}

export const isValidProgress = (raw) => JSON.stringify(migrateProgress(raw)) === JSON.stringify(raw);

/** Списать монеты. → хватило ли. */
export function spend(progress, cost) {
  if (!(cost > 0) || progress.coins < cost) return false;
  progress.coins -= cost;
  return true;
}

/** levels — пройдено уровней, words — найдено слов кроссвордов, bonus — бонусных слов, hints — открыто букв подсказками. */
export const emptyStats = () => ({ levels: 0, words: 0, bonus: 0, hints: 0 });

export function migrateStats(raw) {
  const stats = emptyStats();
  if (!raw || typeof raw !== 'object') return stats;
  for (const k of Object.keys(stats)) stats[k] = nat(raw[k]);
  return stats;
}

export const isValidStats = (raw) => JSON.stringify(migrateStats(raw)) === JSON.stringify(raw);
