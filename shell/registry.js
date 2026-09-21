// Реестр игр — единственное место, где оболочка узнаёт об играх.
// Модуль игры грузится лениво, только при открытии; title здесь — для меню без загрузки модуля.
// css (необязательно) — подключается оболочкой на время игры.

export const games = [
  {
    id: 'sudoku',
    title: 'Судоку',
    load: () => import('../games/sudoku/index.js'),
    css: new URL('../games/sudoku/game.css', import.meta.url),
  },
  {
    id: 'wordle',
    title: 'Wordle',
    load: () => import('../games/wordle/index.js'),
    css: new URL('../games/wordle/game.css', import.meta.url),
  },
  {
    id: 'guess-number',
    title: 'Угадай число',
    load: () => import('../games/guess-number/index.js'),
    css: new URL('../games/guess-number/game.css', import.meta.url),
  },
  {
    id: '_stub-a',
    title: 'Заглушка A · кликер',
    load: () => import('../games/_stub-a/index.js'),
    css: new URL('../games/_stub-a/game.css', import.meta.url),
  },
  {
    id: '_stub-b',
    title: 'Заглушка B · таймер',
    load: () => import('../games/_stub-b/index.js'),
  },
];
