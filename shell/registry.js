// Реестр игр — единственное место, где оболочка узнаёт об играх.
// Модуль игры грузится лениво, только при открытии; title здесь — для меню без загрузки модуля.
// css (необязательно) — подключается оболочкой на время игры.
//
// menu (необязательно) — что писать в меню под названием (shell/menu-line.js):
//   played/wins/best — показывать ли «Сыграно», «Побед», «Рекорд» (по умолчанию все);
//   bestLabel — подпись рекорда, bestValue — как показать его значение («Уровень 7»);
//   progress: 'replace' — вместо статистики строка от самой игры (api.progress), 'append' — в конец.
// Побед нет у бесконечных игр, а у уровневых важен уровень, а не число партий.
//
// admin: true — игра видна только владельцу (Telegram-id из ADMIN_IDS): так новая игра обкатывается,
// не мозоля глаза остальным. Меню её не рисует, а маршрут `#/game/<id>` возвращает в меню.

export const games = [
  {
    id: 'words',
    title: 'Слова из слова',
    load: () => import('../games/words/index.js'),
    css: new URL('../games/words/game.css', import.meta.url),
    menu: { progress: 'replace' },                       // «Уровень 14»
  },
  {
    id: 'flags',
    title: 'Флаги',
    load: () => import('../games/flags/index.js'),
    css: new URL('../games/flags/game.css', import.meta.url),
  },
  {
    id: 'checkers',
    title: 'Шашки',
    load: () => import('../games/checkers/index.js'),
    css: new URL('../games/checkers/game.css', import.meta.url),
  },
  {
    id: 'flappy-burger',
    title: 'Flappy Burger',
    load: () => import('../games/flappy-burger/index.js'),
    css: new URL('../games/flappy-burger/game.css', import.meta.url),
    menu: { wins: false },                               // бесконечный забег, победить нельзя
  },
  {
    id: 'bubble-shooter',
    title: 'Шарики',
    load: () => import('../games/bubble-shooter/index.js'),
    css: new URL('../games/bubble-shooter/game.css', import.meta.url),
    menu: { progress: 'replace' },                       // «Уровень 3»
  },
  {
    id: 'brick-blast',
    title: 'Brick Blast',
    load: () => import('../games/brick-blast/index.js'),
    css: new URL('../games/brick-blast/game.css', import.meta.url),
    menu: { progress: 'replace' },                       // «Уровень 11»
  },
  {
    id: 'loop',
    title: 'Петля',
    load: () => import('../games/loop/index.js'),
    css: new URL('../games/loop/game.css', import.meta.url),
    menu: { progress: 'replace' },                       // «Уровень 3»
  },
  {
    id: 'connect-dots',
    title: 'Соедини точки',
    load: () => import('../games/connect-dots/index.js'),
    css: new URL('../games/connect-dots/game.css', import.meta.url),
    menu: { wins: false, bestValue: (n) => `Уровень ${n}` },   // рекорд — как далеко зашёл
  },
  {
    id: 'mahjong',
    title: 'Маджонг',
    load: () => import('../games/mahjong/index.js'),
    css: new URL('../games/mahjong/game.css', import.meta.url),
    menu: { wins: false, best: false },                  // проиграть нельзя — только число партий
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
    menu: { progress: 'replace' },                       // «Уровень 4 · Рекорд за уровень: 780»
  },
  {
    id: 'block-blast',
    title: 'Block Blast',
    load: () => import('../games/block-blast/index.js'),
    css: new URL('../games/block-blast/game.css', import.meta.url),
    menu: { wins: false },                               // бесконечная, победы не бывает
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
    menu: { best: false, progress: 'append' },           // вместо рекорда — серия побед
  },
  {
    id: 'bongo-cat',
    title: 'Bongo Cat',
    load: () => import('../games/bongo-cat/index.js'),
    css: new URL('../games/bongo-cat/game.css', import.meta.url),
    menu: { progress: 'replace' },                       // «Ударов: 1 234» — партий и побед нет
  },
];
