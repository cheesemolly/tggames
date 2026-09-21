// Правила игры «слова на сетке» (филворд) — без DOM, тестируется в Node.
//
// На сетке size×size спрятаны слова банка (их список виден игроку). Слова стоят только по прямой —
// горизонталь, вертикаль или диагональ, в любую из 8 сторон; выделять тоже можно только по прямой.
// Любое другое слово словаря, найденное по прямой, — бонусное. Времени нет: партия кончается,
// когда найдены все слова банка.
//
// Словарь: существительные в начальной форме (ё = е). Банк берётся из частых слов, бонусом засчитывается
// любое слово словаря. Проверка префикса — бинарный поиск по отсортированному массиву.

export const SIZES = [8, 10, 12, 14];
export const DEFAULT_SIZE = 12;
/** Сколько слов в банке для каждого размера поля. */
export const WORDS_BY_SIZE = { 8: 10, 10: 15, 12: 20, 14: 25 };
export const MIN_LEN = 3;

/** 8 направлений: [шаг по строкам, шаг по столбцам]. */
export const DIRS = [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1]];

// Частоты букв русского языка, %; «ъ» не используем.
const LETTER_FREQ = {
  о: 10.97, е: 8.45, а: 8.01, и: 7.35, н: 6.7, т: 6.26, с: 5.47, р: 4.73, в: 4.54, л: 4.4,
  к: 3.49, м: 3.21, д: 2.98, п: 2.81, у: 2.62, я: 2.01, ы: 1.9, ь: 1.74, г: 1.7, з: 1.65,
  б: 1.59, ч: 1.44, й: 1.21, х: 0.97, ж: 0.94, ш: 0.73, ю: 0.64, ц: 0.48, щ: 0.36, э: 0.32, ф: 0.26,
};
const LETTERS = Object.keys(LETTER_FREQ);
const FREQ_TOTAL = Object.values(LETTER_FREQ).reduce((a, b) => a + b, 0);

export function normalize(word) {
  return String(word).toLowerCase().replace(/ё/g, 'е');
}

// ---------- словарь ----------

export function createDictionary(words, common = []) {
  const sorted = [...new Set(words.map(normalize))].sort();
  return { sorted, set: new Set(sorted), common: [...new Set(common.map(normalize))].sort() };
}

export function hasPrefix(dict, prefix) {
  const arr = dict.sorted;
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < prefix) lo = mid + 1;
    else hi = mid;
  }
  return lo < arr.length && arr[lo].startsWith(prefix);
}

// ---------- линии ----------

/** Клетки прямой от start до end (горизонталь, вертикаль, диагональ) или null, если не по прямой. */
export function lineCells(start, end, size) {
  const r0 = Math.floor(start / size);
  const c0 = start % size;
  const dr = Math.floor(end / size) - r0;
  const dc = (end % size) - c0;
  if (dr !== 0 && dc !== 0 && Math.abs(dr) !== Math.abs(dc)) return null;
  const len = Math.max(Math.abs(dr), Math.abs(dc));
  const sr = Math.sign(dr);
  const sc = Math.sign(dc);
  return Array.from({ length: len + 1 }, (_, k) => (r0 + sr * k) * size + (c0 + sc * k));
}

/**
 * Выделение пальцем: от клетки start к точке (row, col) — прямая в ближайшем из 8 направлений
 * (по углу), длиной до проекции точки, не выходя за поле. row/col могут быть дробными.
 */
export function snapLine(start, row, col, size) {
  const r0 = Math.floor(start / size);
  const c0 = start % size;
  const dy = row - (r0 + 0.5);
  const dx = col - (c0 + 0.5);
  if (Math.hypot(dx, dy) < 0.5) return [start];
  const angle = Math.atan2(dy, dx);
  const step = Math.round(angle / (Math.PI / 4));
  const sr = Math.round(Math.sin(step * Math.PI / 4));
  const sc = Math.round(Math.cos(step * Math.PI / 4));
  let len = Math.round(Math.max(Math.abs(dy) * Math.abs(sr), Math.abs(dx) * Math.abs(sc)));
  while (len > 0) {
    const r = r0 + sr * len;
    const c = c0 + sc * len;
    if (r >= 0 && r < size && c >= 0 && c < size) break;
    len--;
  }
  return Array.from({ length: len + 1 }, (_, k) => (r0 + sr * k) * size + (c0 + sc * k));
}

export const cellsWord = (grid, cells) => cells.map((i) => grid[i]).join('');

/** Все слова словаря, которые читаются по прямой в любую из 8 сторон. */
export function lineWords(grid, size, dict) {
  const found = new Set();
  for (let start = 0; start < grid.length; start++) {
    for (const [sr, sc] of DIRS) {
      let r = Math.floor(start / size);
      let c = start % size;
      let word = '';
      while (r >= 0 && r < size && c >= 0 && c < size) {
        word += grid[r * size + c];
        if (!hasPrefix(dict, word)) break;
        if (word.length >= MIN_LEN && dict.set.has(word)) found.add(word);
        r += sr;
        c += sc;
      }
    }
  }
  return found;
}

// ---------- генерация ----------

function randomLetter(rng) {
  let roll = rng() * FREQ_TOTAL;
  for (const letter of LETTERS) {
    roll -= LETTER_FREQ[letter];
    if (roll <= 0) return letter;
  }
  return 'о';
}

function shuffled(arr, rng) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Попробовать вписать слово: случайное направление и место, пересекаться можно только совпадающими буквами. */
function tryPlace(grid, size, word, rng) {
  for (let attempt = 0; attempt < 80; attempt++) {
    const [sr, sc] = DIRS[Math.floor(rng() * DIRS.length)];
    const r0 = Math.floor(rng() * size);
    const c0 = Math.floor(rng() * size);
    const r1 = r0 + sr * (word.length - 1);
    const c1 = c0 + sc * (word.length - 1);
    if (r1 < 0 || r1 >= size || c1 < 0 || c1 >= size) continue;
    const cells = [...word].map((_, k) => (r0 + sr * k) * size + (c0 + sc * k));
    if (cells.every((i, k) => grid[i] === '' || grid[i] === word[k])) {
      cells.forEach((i, k) => { grid[i] = word[k]; });
      return cells;
    }
  }
  return null;
}

/**
 * Поле с банком слов: { grid, bank: [{ word, cells }], bonusTotal }.
 * Банк — частые слова от 3 до min(size, 9) букв, без слов, входящих одно в другое.
 * Пустые клетки заполняются буквами по частотам русского языка.
 */
export function generatePuzzle(size, dict, rng = Math.random) {
  const count = WORDS_BY_SIZE[size];
  const maxLen = Math.min(size, 9);
  const pool = dict.common.filter((w) => w.length >= MIN_LEN && w.length <= maxLen);
  for (let attempt = 0; attempt < 30; attempt++) {
    const grid = Array(size * size).fill('');
    const bank = [];
    for (const word of shuffled(pool, rng)) {
      if (bank.length === count) break;
      if (bank.some((b) => b.word.includes(word) || word.includes(b.word))) continue;
      const cells = tryPlace(grid, size, word, rng);
      if (cells) bank.push({ word, cells });
    }
    if (bank.length < count) continue;
    for (let i = 0; i < grid.length; i++) if (!grid[i]) grid[i] = randomLetter(rng);
    const words = new Set(bank.map((b) => b.word));
    const bonusTotal = [...lineWords(grid, size, dict)].filter((w) => !words.has(w)).length;
    bank.sort((a, b) => a.word.localeCompare(b.word));
    return { grid, bank, bonusTotal };
  }
  throw new Error(`Не удалось собрать поле ${size}×${size}`);
}

// ---------- ходы и очки ----------

export const bankPoints = (word) => word.length * 10;
export const bonusPoints = (word) => word.length * 5;

/**
 * Проверка выделения. Слово читается в сторону движения пальца; если так его нет — в обратную.
 * Возвращает { verdict: 'short' | 'bank' | 'bonus' | 'repeat' | 'unknown', word }.
 */
export function checkSelection(state, cells, dict) {
  if (cells.length < MIN_LEN) return { verdict: 'short', word: '' };
  const forward = cellsWord(state.grid, cells);
  const backward = [...forward].reverse().join('');
  const inBank = (w) => state.bank.some((b) => b.word === w);
  for (const word of [forward, backward]) {
    if (!inBank(word)) continue;
    return { verdict: state.found.some((f) => f.word === word) ? 'repeat' : 'bank', word };
  }
  for (const word of [forward, backward]) {
    if (!dict.set.has(word)) continue;
    return { verdict: state.bonus.includes(word) ? 'repeat' : 'bonus', word };
  }
  return { verdict: 'unknown', word: forward };
}

/** Засчитать слово банка или бонусное. Возвращает очки. */
export function applyWord(state, verdict, word, cells) {
  if (verdict === 'bank') {
    state.found.push({ word, cells: [...cells] });
    state.score += bankPoints(word);
    return bankPoints(word);
  }
  if (verdict === 'bonus') {
    state.bonus.push(word);
    state.score += bonusPoints(word);
    return bonusPoints(word);
  }
  return 0;
}

export const isComplete = (state) => state.found.length === state.bank.length;

export function newGame(size, puzzle) {
  return { size, grid: puzzle.grid, bank: puzzle.bank, bonusTotal: puzzle.bonusTotal, found: [], bonus: [], score: 0 };
}

export function isValidState(s) {
  const cellsOk = (cells) => Array.isArray(cells) && cells.every((i) => Number.isInteger(i) && i >= 0 && i < s.size * s.size);
  return Boolean(s)
    && SIZES.includes(s.size)
    && Array.isArray(s.grid) && s.grid.length === s.size * s.size && s.grid.every((l) => LETTERS.includes(l))
    && Array.isArray(s.bank) && s.bank.every((b) => typeof b.word === 'string' && cellsOk(b.cells))
    && Array.isArray(s.found) && s.found.every((f) => typeof f.word === 'string' && cellsOk(f.cells))
    && Array.isArray(s.bonus) && s.bonus.every((w) => typeof w === 'string')
    && [s.score, s.bonusTotal].every((n) => Number.isFinite(n) && n >= 0);
}

// ---------- статистика по размеру поля ----------

export function emptyStats() {
  return { played: 0, best: 0, bonus: 0 };
}

export function recordGame(stats, state) {
  return { played: stats.played + 1, best: Math.max(stats.best, state.score), bonus: stats.bonus + state.bonus.length };
}

export function isValidStats(s) {
  return Boolean(s) && ['played', 'best', 'bonus'].every((k) => Number.isFinite(s[k]) && s[k] >= 0);
}
