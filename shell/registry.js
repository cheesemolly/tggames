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
// Новая игра сначала попадает в бету (shell/beta.js, kind: 'game') — её видит только владелец, пока
// не скажет «релиз». Раньше для этого было поле admin: true; оно больше не используется.

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
    id: 'snake',
    title: 'Змейка',
    load: () => import('../games/snake/index.js'),
    css: new URL('../games/snake/game.css', import.meta.url),
    menu: { wins: false, progress: 'append' },           // «Сыграно · Рекорд» классики + «Уровень N»
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
    // рекорд — как далеко зашёл; без таймера забег не кончается — показываем, где он сейчас
    menu: { wins: false, bestValue: (n) => `Уровень ${n}`, saveLine: (s) => (s.round ? `Сейчас: уровень ${s.round}` : null) },
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
    id: 'killer-sudoku',
    title: 'Судоку-киллер',
    load: () => import('../games/killer-sudoku/index.js'),
    css: new URL('../games/killer-sudoku/game.css', import.meta.url),
  },
  {
    id: 'nonogram',
    title: 'Японский кроссворд',
    load: () => import('../games/nonogram/index.js'),
    css: new URL('../games/nonogram/game.css', import.meta.url),
    menu: { progress: 'replace' },                       // «Решено: 12 из 100»
  },
  {
    id: 'minesweeper',
    title: 'Сапёр',
    load: () => import('../games/minesweeper/index.js'),
    css: new URL('../games/minesweeper/game.css', import.meta.url),
    menu: { best: false, progress: 'append' },           // «Сыграно · Побед · Лучшее: 1:23 · средний»
  },
  {
    id: 'fifteen',
    title: 'Пятнашки',
    load: () => import('../games/fifteen/index.js'),
    css: new URL('../games/fifteen/game.css', import.meta.url),
    menu: { best: false, progress: 'append' },           // «Сыграно · Побед · Лучшее 4×4: 1:23»
  },
  {
    id: 'rubik',
    title: 'Кубик Рубика',
    load: () => import('../games/rubik/index.js'),
    css: new URL('../games/rubik/game.css', import.meta.url),
    menu: { best: false, progress: 'append' },           // «Сыграно · Побед · Лучшее: 23.45»
  },
  {
    id: 'hanoi',
    title: 'Ханойская башня',
    load: () => import('../games/hanoi/index.js'),
    css: new URL('../games/hanoi/game.css', import.meta.url),
    menu: { best: false, progress: 'append' },           // «Сыграно · Побед · Рекорд: 7 дисков»
  },
  {
    id: 'wordle',
    title: 'Wordle',
    load: () => import('../games/wordle/index.js'),
    css: new URL('../games/wordle/game.css', import.meta.url),
    menu: { best: false, progress: 'append' },           // вместо рекорда — серия побед
  },
  {
    id: 'memory',
    title: 'Мемори',
    load: () => import('../games/memory/index.js'),
    css: new URL('../games/memory/game.css', import.meta.url),
    menu: { progress: 'replace' },                       // «Уровень 7»
  },
  {
    id: 'bongo-cat',
    title: 'Bongo Cat',
    load: () => import('../games/bongo-cat/index.js'),
    css: new URL('../games/bongo-cat/game.css', import.meta.url),
    menu: { progress: 'replace' },                       // «Ударов: 1 234» — партий и побед нет
  },
  {
    id: 'tictactoe',
    title: 'Крестики-нолики',
    load: () => import('../games/tictactoe/index.js'),
    css: new URL('../games/tictactoe/game.css', import.meta.url),
    menu: { best: false },                               // «Сыграно · Побед» — рекорда нет
  },
  {
    id: 'go',
    title: 'Го',
    load: () => import('../games/go/index.js'),
    css: new URL('../games/go/game.css', import.meta.url),
    menu: { best: false },                               // «Сыграно · Побед» — партии с ботом
  },
  {
    id: 'match3',
    title: 'Три в ряд',
    load: () => import('../games/match3/index.js'),
    css: new URL('../games/match3/game.css', import.meta.url),
    menu: { progress: 'replace' },                       // «Уровень 12 · ★ 30»
  },
  {
    id: 'chess',
    title: 'Шахматы',
    load: () => import('../games/chess/index.js'),
    css: new URL('../games/chess/game.css', import.meta.url),
    menu: { best: false },                               // «Сыграно · Побед» — рекорда нет
  },
  {
    id: 'spider',
    title: 'Паук',
    load: () => import('../games/spider/index.js'),
    css: new URL('../games/spider/game.css', import.meta.url),
    menu: { best: false },                               // «Сыграно · Побед» — очков нет, рекорд — победы
  },
  {
    id: 'klondike',
    title: 'Косынка',
    load: () => import('../games/klondike/index.js'),
    css: new URL('../games/klondike/game.css', import.meta.url),
    menu: { best: false },                               // «Сыграно · Побед» — очков нет, рекорд — победы
  },
  {
    id: 'pinball',
    title: 'Пинбол',
    load: () => import('../games/pinball/index.js'),
    css: new URL('../games/pinball/game.css', import.meta.url),
    // «Сыграно · Рекорд: 1 234 500 · Звание: Капитан» — победы в пинболе нет
    menu: { wins: false, progress: 'append', bestValue: (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') },
  },
];
