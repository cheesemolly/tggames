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
    games: ['words', 'boggle', 'wordle'],
  },
  {
    id: 'puzzles',
    title: 'Головоломки',
    hint: 'Подумать не спеша',
    color: '--cat-puzzles',
    games: ['sudoku', 'loop', 'connect-dots', 'mahjong', '2048'],
  },
  {
    id: 'arcade',
    title: 'Аркады',
    hint: 'На реакцию и меткость',
    color: '--cat-arcade',
    games: ['flappy-burger', 'brick-blast', 'block-blast', 'bubble-shooter'],
  },
  {
    id: 'board',
    title: 'Настольные',
    hint: 'Против бота',
    color: '--cat-board',
    games: ['checkers'],
  },
  {
    id: 'quiz',
    title: 'Викторина',
    hint: 'Проверить, что знаешь',
    color: '--cat-quiz',
    games: ['flags'],
  },
];

export const findCategory = (id) => categories.find((c) => c.id === id) ?? null;

/** Папка, в которой лежит игра (для возврата из игры именно в неё). */
export const categoryOfGame = (gameId) => categories.find((c) => c.games.includes(gameId)) ?? null;

/** Игры папки в её порядке; неизвестные id пропускаются (игра могла быть удалена). */
export function gamesOf(category, games) {
  return category.games.map((id) => games.find((g) => g.id === id)).filter(Boolean);
}

export const gameWord = (n) => {
  const last = n % 10;
  const tens = n % 100;
  if (tens >= 11 && tens <= 14) return 'игр';
  if (last === 1) return 'игра';
  if (last >= 2 && last <= 4) return 'игры';
  return 'игр';
};
