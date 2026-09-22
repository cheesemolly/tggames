// Реестр игр — единственное место, где оболочка узнаёт об играх.
// Модуль игры грузится лениво, только при открытии; title здесь — для меню без загрузки модуля.
// css (необязательно) — подключается оболочкой на время игры.

export const games = [
  {
    id: 'loop',
    title: 'Петля',
    load: () => import('../games/loop/index.js'),
    css: new URL('../games/loop/game.css', import.meta.url),
  },
  {
    id: 'connect-dots',
    title: 'Соедини точки',
    load: () => import('../games/connect-dots/index.js'),
    css: new URL('../games/connect-dots/game.css', import.meta.url),
  },
  {
    id: 'mahjong',
    title: 'Маджонг',
    load: () => import('../games/mahjong/index.js'),
    css: new URL('../games/mahjong/game.css', import.meta.url),
  },
  {
    id: '2048',
    title: '2048',
    load: () => import('../games/2048/index.js'),
    css: new URL('../games/2048/game.css', import.meta.url),
  },
  {
    id: 'boggle',               // id прежний — по нему хранятся партия, статистика и настройки
    title: 'Филворд',
    load: () => import('../games/boggle/index.js'),
    css: new URL('../games/boggle/game.css', import.meta.url),
  },
  {
    id: 'block-blast',
    title: 'Block Blast',
    load: () => import('../games/block-blast/index.js'),
    css: new URL('../games/block-blast/game.css', import.meta.url),
  },
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
