// Категории меню («папки»): на главной — сетка папок, внутри папки — сетка игр.
//
// Порядок игр внутри папки задаётся здесь, а не реестром: в реестре он про загрузку, здесь — про вид.
// Каждая игра должна лежать ровно в одной папке — это проверяет тест.
// color — переменная акцента папки (значения для светлой и тёмной темы в styles/app.css).

export const categories = [
  {
    id: 'words',
    title: 'Слова',
    hint: 'Буквы, поиск и угадывание',
    color: '--cat-words',
    games: ['words', 'boggle', 'wordle', 'erudit', 'word-circle', 'subwords'],
  },
  {
    id: 'puzzles',
    title: 'Головоломки',
    hint: 'Подумать не спеша',
    color: '--cat-puzzles',
    games: ['match3', 'sudoku', 'killer-sudoku', 'nonogram', 'minesweeper', 'fifteen', 'rubik', 'hanoi', 'loop', 'connect-dots', 'mahjong', 'klondike', 'spider', '2048', 'memory'],
  },
  {
    id: 'arcade',
    title: 'Аркады',
    hint: 'На реакцию и меткость',
    color: '--cat-arcade',
    games: ['pinball', 'snake', 'flappy-burger', 'arkanoid', 'brick-blast', 'block-blast', 'bubble-shooter'],
  },
  {
    id: 'board',
    title: 'Настольные',
    hint: 'Против бота',
    color: '--cat-board',
    games: ['checkers', 'chess', 'go', 'tictactoe', 'billiards'],
  },
  {
    id: 'quiz',
    title: 'Викторина',
    hint: 'Проверить, что знаешь',
    color: '--cat-quiz',
    games: ['flags', 'cities'],
  },
  {
    // «Песочница» — игры без рейтинга, просто поиграть в своё удовольствие (решение владельца, 2026-10-05)
    id: 'chill',
    title: 'Песочница',
    hint: 'Без спешки и соревнований',
    color: '--cat-chill',
    games: ['repair'],
  },
  {
    id: 'music',
    title: 'Музыка',
    hint: 'Поиграть на инструментах',
    color: '--cat-music',
    games: ['bongo-cat'],
  },
];

export const findCategory = (id) => categories.find((c) => c.id === id) ?? null;

/** Папка, в которой лежит игра (для возврата из игры именно в неё). */
export const categoryOfGame = (gameId) => categories.find((c) => c.games.includes(gameId)) ?? null;

/** Игры папки в её порядке; неизвестные id пропускаются (игра могла быть удалена). */
export function gamesOf(category, games) {
  return category.games.map((id) => games.find((g) => g.id === id)).filter(Boolean);
}

/**
 * Папки, в которых игроку есть что открыть. Игры из беты (shell/beta.js) видны только владельцу —
 * папка из одних таких у остальных пропадает, а не показывает «0 игр».
 */
export const visibleCategories = (games) => categories.filter((c) => gamesOf(c, games).length > 0);

export const gameWord = (n) => {
  const last = n % 10;
  const tens = n % 100;
  if (tens >= 11 && tens <= 14) return 'игр';
  if (last === 1) return 'игра';
  if (last >= 2 && last <= 4) return 'игры';
  return 'игр';
};

/** Сводка рейтинга «По играм» (в бете 'top-sort'): игры сгруппированы по папкам — по цвету значка, в порядке
 *  папок, — внутри папки сначала лучшие свои места, потом игры, где тебя ещё нет (в порядке папки).
 *  place(item) — твоё место в игре или null. */
export function byFolderAndPlace(items, idOf, place) {
  const order = categories.flatMap((c) => c.games);
  const folder = (id) => categories.findIndex((c) => c.games.includes(id));
  const rank = (x) => place(x) ?? Infinity;
  return [...items].sort((a, b) => folder(idOf(a)) - folder(idOf(b))
    || rank(a) - rank(b)
    || order.indexOf(idOf(a)) - order.indexOf(idOf(b)));
}
