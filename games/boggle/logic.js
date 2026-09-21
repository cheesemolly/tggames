// Правила Boggle — без DOM, тестируется в Node.
// Сетка size×size из букв (массив строк по одной букве). Слово — путь по соседним клеткам (включая
// диагонали), каждая клетка в слове не больше одного раза, от 3 букв, есть в словаре (существительные
// в начальной форме, ё = е).
//
// Словарь — отсортированный массив: проверка префикса бинарным поиском (без дерева в памяти)
// и Set для проверки слова целиком.

export const SIZES = [4, 5, 6, 8, 10];
export const DEFAULT_SIZE = 6;
export const MIN_LEN = 3;
/** Время партии по размеру поля, секунды. */
export const TIME_BY_SIZE = { 4: 180, 5: 180, 6: 240, 8: 300, 10: 360 };

// Частоты букв русского языка, %; «ъ» не используем (слов с ним в словаре нет).
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
  return { sorted, set: new Set(sorted), common: new Set(common.map(normalize)) };
}

/** Есть ли в словаре слово, начинающееся с prefix. */
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

// ---------- сетка ----------

const neighborCache = new Map();

/** Соседи каждой клетки (8 направлений). */
export function neighbors(size) {
  if (!neighborCache.has(size)) {
    const list = [];
    for (let i = 0; i < size * size; i++) {
      const r = Math.floor(i / size);
      const c = i % size;
      const out = [];
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const rr = r + dr;
          const cc = c + dc;
          if ((dr || dc) && rr >= 0 && rr < size && cc >= 0 && cc < size) out.push(rr * size + cc);
        }
      }
      list.push(out);
    }
    neighborCache.set(size, list);
  }
  return neighborCache.get(size);
}

export function isAdjacent(a, b, size) {
  return a !== b && Math.abs(Math.floor(a / size) - Math.floor(b / size)) <= 1 && Math.abs((a % size) - (b % size)) <= 1;
}

/** Путь корректен: соседние клетки, без повторов. */
export function isValidPath(path, size) {
  if (new Set(path).size !== path.length) return false;
  return path.every((cell, k) => cell >= 0 && cell < size * size && (k === 0 || isAdjacent(path[k - 1], cell, size)));
}

export const pathWord = (grid, path) => path.map((i) => grid[i]).join('');

function randomLetter(rng) {
  let roll = rng() * FREQ_TOTAL;
  for (const letter of LETTERS) {
    roll -= LETTER_FREQ[letter];
    if (roll <= 0) return letter;
  }
  return 'о';
}

export function randomGrid(size, rng = Math.random) {
  return Array.from({ length: size * size }, () => randomLetter(rng));
}

/** Все слова словаря, которые можно составить на сетке. */
export function solve(grid, size, dict) {
  const nb = neighbors(size);
  const found = new Set();
  const used = new Uint8Array(grid.length);
  const walk = (cell, prefix) => {
    const word = prefix + grid[cell];
    if (!hasPrefix(dict, word)) return;
    if (word.length >= MIN_LEN && dict.set.has(word)) found.add(word);
    used[cell] = 1;
    for (const next of nb[cell]) if (!used[next]) walk(next, word);
    used[cell] = 0;
  };
  for (let i = 0; i < grid.length; i++) walk(i, '');
  return found;
}

/** Путь для слова на сетке (для подсветки в разборе) или null. */
export function findPath(grid, size, word) {
  const nb = neighbors(size);
  const target = normalize(word);
  const path = [];
  const used = new Uint8Array(grid.length);
  const walk = (cell, k) => {
    if (grid[cell] !== target[k]) return false;
    path.push(cell);
    if (k === target.length - 1) return true;
    used[cell] = 1;
    for (const next of nb[cell]) if (!used[next] && walk(next, k + 1)) return true;
    used[cell] = 0;
    path.pop();
    return false;
  };
  for (let i = 0; i < grid.length; i++) if (walk(i, 0)) return path;
  return null;
}

/**
 * Сетка для партии: из нескольких случайных выбирается та, где больше всего частых слов
 * (с ними партия интереснее, чем с редкими). Возвращает { grid, words: [...все слова] }.
 */
export function generateGrid(size, dict, rng = Math.random, attempts = 8) {
  let best = null;
  for (let k = 0; k < attempts; k++) {
    const grid = randomGrid(size, rng);
    const words = solve(grid, size, dict);
    let common = 0;
    for (const w of words) if (dict.common.has(w)) common++;
    const rank = common * 3 + words.size;
    if (!best || rank > best.rank) best = { grid, words, rank };
  }
  return { grid: best.grid, words: [...best.words].sort((a, b) => b.length - a.length || a.localeCompare(b)) };
}

// ---------- очки и ходы ----------

/** Очки за слово — как в классическом Boggle. */
export function wordScore(word) {
  const n = word.length;
  if (n < MIN_LEN) return 0;
  if (n <= 4) return 1;
  if (n === 5) return 2;
  if (n === 6) return 3;
  if (n === 7) return 5;
  return 11;
}

/** Проверка слова: 'short' | 'unknown' | 'repeat' | 'ok'. Путь проверяет интерфейс (isValidPath). */
export function checkWord(state, word, dict) {
  const w = normalize(word);
  if (w.length < MIN_LEN) return 'short';
  if (state.found.includes(w)) return 'repeat';
  if (!dict.set.has(w)) return 'unknown';
  return 'ok';
}

/** Засчитать найденное слово. Возвращает очки. */
export function addWord(state, word) {
  const w = normalize(word);
  const points = wordScore(w);
  state.found.push(w);
  state.score += points;
  return points;
}

export function newGame(size, grid, total) {
  return { size, grid, found: [], score: 0, total, remainingMs: TIME_BY_SIZE[size] * 1000 };
}

export function isValidState(s) {
  return Boolean(s)
    && SIZES.includes(s.size)
    && Array.isArray(s.grid) && s.grid.length === s.size * s.size && s.grid.every((l) => LETTERS.includes(l))
    && Array.isArray(s.found) && s.found.every((w) => typeof w === 'string')
    && [s.score, s.total, s.remainingMs].every((n) => Number.isFinite(n) && n >= 0);
}

// ---------- статистика по размеру поля ----------

export function emptyStats() {
  return { played: 0, best: 0, words: 0, longest: '' };
}

export function recordGame(stats, state) {
  const longest = state.found.reduce((a, w) => (w.length > a.length ? w : a), stats.longest);
  return {
    played: stats.played + 1,
    best: Math.max(stats.best, state.score),
    words: stats.words + state.found.length,
    longest,
  };
}

export function isValidStats(s) {
  return Boolean(s) && ['played', 'best', 'words'].every((k) => Number.isFinite(s[k]) && s[k] >= 0)
    && typeof s.longest === 'string';
}
