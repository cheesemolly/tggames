// «Флаги»: угадай страну по флагу. Без DOM, тестируется в Node.
//
// Данные: countries.json — 196 стран (194 независимых государства — члены ООН, плюс Ватикан, Палестина и Косово):
// { code, name, aliases, region }; русские названия — из mledoze/countries (ODbL), с правками и вариантами ответа
// (США, ЮАР, ОАЭ, Беларусь/Белоруссия…); флаги — flags/<code>.svg из lipis/flag-icons (MIT).
//
// Режимы: 'test' — четыре варианта (подставные — чаще из того же региона); 'type' — ввести название своей
// клавиатурой, снизу автодополнение. Длина: 10, 20 или марафон (все флаги региона, до трёх ошибок).

export const MODES = ['test', 'type'];
export const LENGTHS = [10, 20, 'marathon'];
export const REGIONS = ['world', 'europe', 'asia', 'africa', 'americas', 'oceania'];
export const MARATHON_LIVES = 3;
export const STATE_VERSION = 1;
export const WIN_SHARE = 0.7;               // от 70% верных — победа

/** Нормализация для сравнения: регистр, ё → е, дефисы/тире/апострофы/точки — пробелы, лишние пробелы. */
export function normalize(text) {
  return String(text)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[-‐‑‒–—―'’`´.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Все написания страны (название и варианты), нормализованные. */
export const spellings = (c) => [c.name, ...c.aliases].map(normalize);

/** Страна, которую означает введённый текст (точное совпадение с названием или вариантом), или null. */
export function findCountry(countries, text) {
  const t = normalize(text);
  if (!t) return null;
  return countries.find((c) => spellings(c).includes(t)) ?? null;
}

/**
 * Автодополнение: сначала страны, чьё название начинается с введённого, затем — чей вариант начинается с него,
 * затем — у которых с него начинается любое слово. По алфавиту внутри группы, не больше limit.
 */
export function suggest(countries, text, limit = 6) {
  const t = normalize(text);
  if (!t) return [];
  const byName = [];
  const byAlias = [];
  const byWord = [];
  for (const c of countries) {
    const names = spellings(c);
    if (names[0].startsWith(t)) byName.push(c);
    else if (names.slice(1).some((n) => n.startsWith(t))) byAlias.push(c);
    else if (names.some((n) => n.split(' ').some((w) => w.startsWith(t)))) byWord.push(c);
  }
  const abc = (a, b) => a.name.localeCompare(b.name, 'ru');
  return [...byName.sort(abc), ...byAlias.sort(abc), ...byWord.sort(abc)].slice(0, limit);
}

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export const regionPool = (countries, region) => (region === 'world' ? countries : countries.filter((c) => c.region === region));

/** Четыре варианта ответа: верный + три подставных (два из того же региона, если есть), в случайном порядке. */
export function options(countries, code, rng = Math.random) {
  const answer = countries.find((c) => c.code === code);
  const same = shuffle(countries.filter((c) => c.code !== code && c.region === answer.region), rng);
  const other = shuffle(countries.filter((c) => c.code !== code && c.region !== answer.region), rng);
  const picked = [...same.slice(0, 2)];
  for (const c of [...other, ...same.slice(2)]) {
    if (picked.length >= 3) break;
    if (!picked.includes(c)) picked.push(c);
  }
  return shuffle([answer, ...picked], rng).map((c) => c.code);
}

/** Новая игра: очередь флагов региона в случайном порядке нужной длины. */
export function newGame(countries, { mode = 'test', length = 10, region = 'world' } = {}, rng = Math.random) {
  const pool = shuffle(regionPool(countries, region).map((c) => c.code), rng);
  const queue = length === 'marathon' ? pool : pool.slice(0, length);
  const first = queue[0];
  return {
    v: STATE_VERSION, mode, length, region, queue, index: 0, correct: 0, wrong: [], streak: 0, bestStreak: 0,
    lives: length === 'marathon' ? MARATHON_LIVES : null,
    choices: mode === 'test' ? options(countries, first, rng) : null,
    answered: null,                                  // { code, ok } — ответ на текущий флаг
  };
}

export const current = (s) => s.queue[s.index];

/** Ответ на текущий флаг (код выбранной страны или null — «не знаю»). */
export function answer(s, code) {
  if (s.answered) return s.answered;
  const ok = code === current(s);
  if (ok) {
    s.correct += 1;
    s.streak += 1;
    s.bestStreak = Math.max(s.bestStreak, s.streak);
  } else {
    s.wrong.push(current(s));
    s.streak = 0;
    if (s.lives !== null) s.lives -= 1;
  }
  s.answered = { code, ok };
  return s.answered;
}

/** Игра кончена: флаги закончились или (в марафоне) кончились жизни. */
export const isOver = (s) => Boolean(s.answered) && (s.index >= s.queue.length - 1 || (s.lives !== null && s.lives <= 0));

/** Следующий флаг. */
export function next(s, countries, rng = Math.random) {
  s.index += 1;
  s.answered = null;
  s.choices = s.mode === 'test' ? options(countries, current(s), rng) : null;
}

export const asked = (s) => s.index + (s.answered ? 1 : 0);

export function isValidState(s, countries) {
  const codes = new Set(countries.map((c) => c.code));
  return s?.v === STATE_VERSION && MODES.includes(s.mode) && LENGTHS.includes(s.length) && REGIONS.includes(s.region)
    && Array.isArray(s.queue) && s.queue.length > 0 && s.queue.every((c) => codes.has(c))
    && Number.isInteger(s.index) && s.index >= 0 && s.index < s.queue.length
    && Number.isInteger(s.correct) && Array.isArray(s.wrong)
    && (s.mode === 'type' || (Array.isArray(s.choices) && s.choices.every((c) => codes.has(c))));
}

// ---------- статистика ----------

export function emptyStats() {
  return { games: 0, answers: 0, correct: 0, best: { test: 0, type: 0 }, bestStreak: 0, misses: {} };
}

/** Учесть законченную игру; misses — сколько раз ошибся на каждом флаге (для «трудных флагов»). */
export function recordGame(stats, s) {
  const misses = { ...stats.misses };
  for (const code of s.wrong) misses[code] = (misses[code] ?? 0) + 1;
  return {
    games: stats.games + 1,
    answers: stats.answers + asked(s),
    correct: stats.correct + s.correct,
    best: { ...stats.best, [s.mode]: Math.max(stats.best[s.mode] ?? 0, s.correct) },
    bestStreak: Math.max(stats.bestStreak, s.bestStreak),
    misses,
  };
}

export function isValidStats(s) {
  return Boolean(s) && ['games', 'answers', 'correct', 'bestStreak'].every((k) => Number.isInteger(s[k]) && s[k] >= 0)
    && s.best && typeof s.misses === 'object';
}
