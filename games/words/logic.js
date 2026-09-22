// «Слова из слова»: из букв длинного слова составь слова. Без DOM, тестируется в Node.
//
// Уровни — levels.json (100 шт., собраны скриптом из словаря Филворда games/boggle/words/ru.json):
// { word, common: [частые слова — их знают почти все, показываются на поле], rare: [остальные слова словаря] }.
// Слова — нарицательные существительные в начальной форме, от 3 букв, ё = е; грубые и оскорбительные исключены.
// Уровень пройден, когда найдено слов (обычных и редких) не меньше половины обычных; звёзды — 50% / 75% / 100%.
// Открыты пройденные уровни и следующий за последним пройденным.

export const LEVEL_COUNT = 100;
export const MIN_LEN = 3;
export const START_HINTS = 5;
export const HINTS_PER_LEVEL = 2;
export const STATE_VERSION = 1;

export const normalize = (w) => String(w).toLowerCase().replace(/ё/g, 'е').replace(/[^а-я]/g, '');

function letterCount(w) {
  const m = new Map();
  for (const ch of w) m.set(ch, (m.get(ch) ?? 0) + 1);
  return m;
}

/** Можно ли составить word из букв source (каждая буква — не больше, чем в source). */
export function canCompose(word, source) {
  const have = letterCount(source);
  for (const [ch, n] of letterCount(word)) if ((have.get(ch) ?? 0) < n) return false;
  return true;
}

/** Нужно найти слов для прохождения уровня. */
export const target = (level) => Math.ceil(level.common.length / 2);

/**
 * Проверка слова: 'common' | 'rare' — новое слово; 'found' — уже найдено; 'short' — короче трёх букв;
 * 'self' — само исходное слово; 'letters' — таких букв нет; 'unknown' — нет в словаре.
 */
export function check(level, input, found) {
  const w = normalize(input);
  if (w.length < MIN_LEN) return 'short';
  if (w === level.word) return 'self';
  if (!canCompose(w, level.word)) return 'letters';
  if (found.includes(w)) return 'found';
  if (level.common.includes(w)) return 'common';
  if (level.rare.includes(w)) return 'rare';
  return 'unknown';
}

/** Доля найденного (обычные + редкие) от числа обычных слов. */
export const share = (level, found) => found.length / level.common.length;

/** Звёзды: 50% — 1 (уровень пройден), 75% — 2, 100% — 3. */
export function stars(level, found) {
  const k = share(level, found);
  return k >= 1 ? 3 : k >= 0.75 ? 2 : k >= 0.5 ? 1 : 0;
}

export const passed = (level, found) => found.length >= target(level);

// ---------- прогресс ----------

export function newProgress() {
  return { v: STATE_VERSION, levels: {}, current: 0, hints: START_HINTS, passedCount: 0 };
}

export const levelState = (p, i) => p.levels[i] ?? { found: [], hinted: {} };

/** Самый дальний открытый уровень (индекс): следующий за последним пройденным. */
export function unlockedMax(p, levels) {
  let max = 0;
  for (let i = 0; i < levels.length; i++) if (passed(levels[i], levelState(p, i).found)) max = Math.min(levels.length - 1, i + 1);
  return max;
}

export const isUnlocked = (p, levels, i) => i >= 0 && i <= unlockedMax(p, levels);

/**
 * Засчитать слово на уровне i. Возвращает { result, justPassed, newStars }: justPassed — уровень пройден этим
 * словом впервые (тогда +HINTS_PER_LEVEL подсказки).
 */
export function submit(p, levels, i, input) {
  const level = levels[i];
  const st = levelState(p, i);
  const result = check(level, input, st.found);
  if (result !== 'common' && result !== 'rare') return { result, justPassed: false, newStars: false };
  const wasPassed = passed(level, st.found);
  const starsBefore = stars(level, st.found);
  const found = [...st.found, normalize(input)];
  p.levels[i] = { ...st, found };
  const justPassed = !wasPassed && passed(level, found);
  if (justPassed) {
    p.passedCount += 1;
    p.hints += HINTS_PER_LEVEL;
  }
  return { result, justPassed, newStars: stars(level, found) > starsBefore };
}

/**
 * Подсказка: ещё одна буква в случайном ненайденном обычном слове (сначала — в уже начатых подсказкой).
 * Возвращает слово или null (подсказок нет / всё найдено).
 */
export function hint(p, levels, i, rng = Math.random) {
  if (p.hints <= 0) return null;
  const level = levels[i];
  const st = levelState(p, i);
  const open = level.common.filter((w) => !st.found.includes(w) && (st.hinted[w] ?? 0) < w.length - 1);
  if (!open.length) return null;
  const started = open.filter((w) => st.hinted[w]);
  const pool = started.length ? started : open;
  const w = pool[Math.floor(rng() * pool.length)];
  p.levels[i] = { ...st, hinted: { ...st.hinted, [w]: (st.hinted[w] ?? 0) + 1 } };
  p.hints -= 1;
  return w;
}

export function isValidProgress(p, levels) {
  return p?.v === STATE_VERSION && p.levels && typeof p.levels === 'object'
    && Number.isInteger(p.current) && p.current >= 0 && p.current < levels.length
    && Number.isInteger(p.hints) && p.hints >= 0 && Number.isInteger(p.passedCount)
    && Object.entries(p.levels).every(([k, v]) => Number(k) < levels.length && Array.isArray(v.found) && v.hinted && typeof v.hinted === 'object');
}
