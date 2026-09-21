// Чистая логика Wordle — без DOM, тестируется в Node.
// Доска: { secret, guesses: string[] }. Слова сравниваются по кодпоинтам ([...word]).

export const WORD_LEN = 5;
export const MAX_TRIES = 6;

/**
 * Подсветка по правилам Wordle (как wg_score в юзерботе): сначала точные попадания,
 * потом «есть, но не тут» — не больше, чем таких букв осталось в слове.
 * Возвращает массив 'correct' | 'present' | 'absent'.
 */
export function score(guess, secret) {
  const g = [...guess];
  const s = [...secret];
  const result = Array(s.length).fill('absent');
  const left = new Map();
  g.forEach((ch, i) => {
    if (ch === s[i]) result[i] = 'correct';
    else left.set(s[i], (left.get(s[i]) ?? 0) + 1);
  });
  g.forEach((ch, i) => {
    if (result[i] !== 'correct' && (left.get(ch) ?? 0) > 0) {
      result[i] = 'present';
      left.set(ch, left.get(ch) - 1);
    }
  });
  return result;
}

const RANK = { absent: 1, present: 2, correct: 3 };

/** Цвет клавиш: лучший статус буквы по всем ходам. */
export function keyStatuses(secret, guesses) {
  const statuses = new Map();
  for (const guess of guesses) {
    const marks = score(guess, secret);
    [...guess].forEach((ch, i) => {
      if (RANK[marks[i]] > (RANK[statuses.get(ch)] ?? 0)) statuses.set(ch, marks[i]);
    });
  }
  return statuses;
}

/** null — ход допустим, иначе код ошибки 'short' | 'repeat' | 'unknown' (попытка не тратится). */
export function checkGuess(board, guess, allowed) {
  if ([...guess].length !== WORD_LEN) return 'short';
  if (board.guesses.includes(guess)) return 'repeat';
  if (!allowed.has(guess)) return 'unknown';
  return null;
}

/** 'won' | 'lost' | 'playing' */
export function getStatus(board) {
  if (board.guesses.includes(board.secret)) return 'won';
  if (board.guesses.length >= MAX_TRIES) return 'lost';
  return 'playing';
}

export function newBoard(answers, rng = Math.random) {
  return { secret: answers[Math.floor(rng() * answers.length)], guesses: [] };
}

/** С первой попытки — 60, с шестой — 10. */
export function getScore(board) {
  return (MAX_TRIES - board.guesses.length + 1) * 10;
}

const SHARE_EMOJI = { correct: '🟩', present: '🟨', absent: '⬛️' };

/** Текст «Поделиться»: «4/6» (при проигрыше «X/6»), пустая строка, сетка квадратов без букв. */
export function shareText(board) {
  const head = `${getStatus(board) === 'won' ? board.guesses.length : 'X'}/${MAX_TRIES}`;
  const rows = board.guesses.map((guess) => score(guess, board.secret).map((m) => SHARE_EMOJI[m]).join(''));
  return `${head}\n\n${rows.join('\n')}`;
}

// ---------- статистика одного языка (как wgame_player в юзерботе) ----------
// { played, wins, streak, maxStreak, dist: [побед с 1-й, со 2-й, … с 6-й попытки] }

export function emptyStats() {
  return { played: 0, wins: 0, streak: 0, maxStreak: 0, dist: Array(MAX_TRIES).fill(0) };
}

/** Учитывает законченную доску; возвращает новую статистику. */
export function recordGame(stats, board) {
  const next = { ...stats, dist: [...stats.dist], played: stats.played + 1 };
  if (getStatus(board) === 'won') {
    next.wins += 1;
    next.streak += 1;
    next.maxStreak = Math.max(next.maxStreak, next.streak);
    next.dist[board.guesses.length - 1] += 1;
  } else {
    next.streak = 0;
  }
  return next;
}

export function isValidStats(stats) {
  const count = (n) => Number.isInteger(n) && n >= 0;
  return Boolean(stats)
    && ['played', 'wins', 'streak', 'maxStreak'].every((k) => count(stats[k]))
    && Array.isArray(stats.dist) && stats.dist.length === MAX_TRIES && stats.dist.every(count);
}

/** Битое сохранение → новая партия, а не падение. */
export function isValidBoard(board) {
  const isWord = (w) => typeof w === 'string' && [...w].length === WORD_LEN;
  return Boolean(board)
    && isWord(board.secret)
    && Array.isArray(board.guesses)
    && board.guesses.length <= MAX_TRIES
    && board.guesses.every(isWord);
}
