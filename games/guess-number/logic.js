// Чистая логика «Угадай число» — без DOM, тестируется в Node.
// Состояние: { secret, guesses: number[] } — его же игра отдаёт в getState().

export const MIN = 1;
export const MAX = 100;
// ceil(log2(100)) = 7: двоичным поиском угадывается всегда (см. tests/logic.test.js).
export const MAX_ATTEMPTS = 7;

export function createGame(rng = Math.random) {
  return { secret: MIN + Math.floor(rng() * (MAX - MIN + 1)), guesses: [] };
}

/** Разбирает ввод. Возвращает { value } или { error } — ошибочный ввод попыткой не считается. */
export function parseGuess(state, text) {
  const trimmed = String(text).trim();
  if (!/^\d+$/.test(trimmed)) return { error: 'Введи целое число' };
  const value = Number(trimmed);
  if (value < MIN || value > MAX) return { error: `Нужно число от ${MIN} до ${MAX}` };
  if (state.guesses.includes(value)) return { error: `${value} уже было` };
  return { value };
}

export function makeGuess(state, value) {
  return { ...state, guesses: [...state.guesses, value] };
}

/** 'higher' — загаданное больше, 'lower' — меньше, 'correct' — угадал. */
export function compare(secret, value) {
  if (value < secret) return 'higher';
  if (value > secret) return 'lower';
  return 'correct';
}

/** 'won' | 'lost' | 'playing' */
export function getStatus(state) {
  if (state.guesses.includes(state.secret)) return 'won';
  if (state.guesses.length >= MAX_ATTEMPTS) return 'lost';
  return 'playing';
}

export function attemptsLeft(state) {
  return MAX_ATTEMPTS - state.guesses.length;
}

/** Диапазон, в котором ещё может быть число, с учётом подсказок. */
export function knownRange(state) {
  let low = MIN;
  let high = MAX;
  for (const g of state.guesses) {
    if (g < state.secret) low = Math.max(low, g + 1);
    else if (g > state.secret) high = Math.min(high, g - 1);
  }
  return { low, high };
}

/** С первой попытки — 70, с последней — 10. */
export function getScore(state) {
  return (MAX_ATTEMPTS - state.guesses.length + 1) * 10;
}

/** Проверка сохранённого состояния: битое сохранение → начать заново, а не упасть. */
export function isValidState(state) {
  const inRange = (n) => Number.isInteger(n) && n >= MIN && n <= MAX;
  return Boolean(state)
    && inRange(state.secret)
    && Array.isArray(state.guesses)
    && state.guesses.length <= MAX_ATTEMPTS
    && state.guesses.every(inRange)
    && new Set(state.guesses).size === state.guesses.length;
}
