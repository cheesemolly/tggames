// Иконки меню: по одной на игру и на категорию. Рисуются линиями (stroke), цвет берут от родителя
// (currentColor), поэтому одинаково работают в светлой и тёмной теме и в любом акцентном цвете.
// Картинок-файлов нет намеренно: SVG внутри кода не грузится по сети и не мылится на ретине.

const svg = (body) => '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor"'
  + ` stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const GAME_ICONS = {
  // Слова
  words: svg('<rect x="2.5" y="8.5" width="5.5" height="7" rx="1.5"/><rect x="9.2" y="5.5" width="5.5" height="10" rx="1.5"/>'
    + '<rect x="15.9" y="8.5" width="5.5" height="7" rx="1.5"/>'),
  boggle: svg('<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18" opacity="0.45"/>'
    + '<path d="M5.8 5.8 18.2 18.2" stroke-width="2.4"/>'),
  wordle: svg('<rect x="2.5" y="4" width="5.6" height="5.6" rx="1.4" fill="currentColor" stroke="none"/>'
    + '<rect x="9.2" y="4" width="5.6" height="5.6" rx="1.4"/><rect x="15.9" y="4" width="5.6" height="5.6" rx="1.4"/>'
    + '<rect x="2.5" y="14.4" width="5.6" height="5.6" rx="1.4"/>'
    + '<rect x="9.2" y="14.4" width="5.6" height="5.6" rx="1.4" fill="currentColor" stroke="none"/>'
    + '<rect x="15.9" y="14.4" width="5.6" height="5.6" rx="1.4"/>'),

  // Головоломки
  sudoku: svg('<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>'
    + '<circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/>'),
  // киллер: поле, пунктирная группа и плюс в её углу — там, где у группы сумма
  'killer-sudoku': svg('<rect x="3" y="3" width="18" height="18" rx="3"/>'
    + '<path d="M11.5 7H17v10H7v-5.5" stroke-width="1.6" stroke-dasharray="2 1.8"/>'
    + '<path d="M8.2 5.9v4.6M5.9 8.2h4.6" stroke-width="1.8"/>'),
  // японский кроссворд: сетка с числами сверху и слева, закрашенные клетки
  nonogram: svg('<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M8 12.3h13M8 16.6h13M12.3 8v13M16.6 8v13" opacity="0.45"/>'
    + '<rect x="8.6" y="12.9" width="3.1" height="3.1" fill="currentColor" stroke="none"/>'
    + '<rect x="12.9" y="12.9" width="3.1" height="3.1" fill="currentColor" stroke="none"/>'
    + '<rect x="12.9" y="17.2" width="3.1" height="3.1" fill="currentColor" stroke="none"/>'
    + '<path d="M3.2 13.5h2.2M3.2 18h2.2M13.6 3.2v2.2M18 3.2v2.2" stroke-width="1.8"/>'),
  // сапёр: мина с шипами и флажок рядом
  minesweeper: svg('<circle cx="10" cy="14" r="4.6" fill="currentColor" stroke="none"/>'
    + '<path d="M10 7v2.2M10 18.8V21M3 14h2.2M14.8 14H17M5.1 9.1l1.6 1.6M13.3 17.3l1.6 1.6M5.1 18.9l1.6-1.6M13.3 10.7l1.6-1.6"/>'
    + '<path d="M17 3v7" stroke-width="1.6"/><path d="M17 3.2h4l-1.4 1.7L21 6.6h-4" fill="currentColor" stroke-width="1.2"/>'),
  // пятнашки: три плитки и пустая клетка пунктиром
  fifteen: svg('<rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.8" fill="currentColor" stroke="none"/>'
    + '<rect x="13" y="3.5" width="7.5" height="7.5" rx="1.8"/><rect x="3.5" y="13" width="7.5" height="7.5" rx="1.8"/>'
    + '<rect x="13" y="13" width="7.5" height="7.5" rx="1.8" stroke-width="1.4" stroke-dasharray="2 1.7" opacity="0.6"/>'),
  // кубик Рубика: куб в изометрии с сеткой на гранях
  rubik: svg('<path d="M12 2.6 20.2 7.3v9.4L12 21.4l-8.2-4.7V7.3Z"/><path d="M3.8 7.3 12 12l8.2-4.7M12 12v9.4"/>'
    + '<path d="M6.5 5.7l8.2 4.7M9.3 4.2l8.2 4.7M6.5 10.4v9.4M9.2 12v9.4M14.8 13.5v6.4M17.5 11.9v6.4" stroke-width="1.1" opacity="0.55"/>'),
  // ханойская башня: подставка, стержень и три диска
  hanoi: svg('<path d="M2.5 20.5h19"/><path d="M12 3.5v17" stroke-width="1.5"/>'
    + '<rect x="4" y="15.6" width="16" height="3.4" rx="1.7" fill="currentColor" stroke="none"/>'
    + '<rect x="6.5" y="11.4" width="11" height="3.4" rx="1.7" fill="currentColor" stroke="none" opacity="0.75"/>'
    + '<rect x="9" y="7.2" width="6" height="3.4" rx="1.7"/>'),
  // ремонт телефона: телефон и гаечный ключ поверх
  repair: svg('<rect x="4" y="2.5" width="11" height="19" rx="2.4"/><path d="M8 18.5h3"/>'
    + '<path d="M20.6 9.4a3.4 3.4 0 0 1-4.3 4.3l-4.6 4.6a1.4 1.4 0 0 1-2-2l4.6-4.6a3.4 3.4 0 0 1 4.3-4.3l-2 2 .3 1.7 1.7.3Z" fill="currentColor" stroke-width="1.2"/>'),
  loop: svg('<path d="M5 19v-6.5A4.5 4.5 0 0 1 9.5 8H19"/><circle cx="5" cy="19" r="2.2"/><circle cx="19" cy="8" r="2.2"/>'),
  'connect-dots': svg('<circle cx="5.5" cy="6" r="2.4" fill="currentColor" stroke="none"/>'
    + '<circle cx="18.5" cy="18" r="2.4" fill="currentColor" stroke="none"/>'
    + '<path d="M5.5 9v4.5a2.5 2.5 0 0 0 2.5 2.5h8"/>'),
  mahjong: svg('<rect x="2.5" y="7" width="9" height="13.5" rx="2"/><rect x="12.5" y="3.5" width="9" height="13.5" rx="2"/>'
    + '<path d="M6 11.5h2.5M6 15h2.5M16 8h2.5M16 11.5h2.5" opacity="0.7"/>'),
  klondike: svg('<rect x="3" y="6.5" width="10.5" height="14.5" rx="2" transform="rotate(-9 8 14)"/><rect x="10" y="3.5" width="10.5" height="14.5" rx="2"/>'
    + '<path d="M15.2 13.4c-1.6-1.2-2.8-2.1-2.8-3.4a1.4 1.4 0 0 1 2.8-.5 1.4 1.4 0 0 1 2.8.5c0 1.3-1.2 2.2-2.8 3.4Z" fill="currentColor" stroke="none"/>'),
  spider: svg('<circle cx="12" cy="13.5" r="3.4"/><circle cx="12" cy="8.2" r="1.9"/>'
    + '<path d="M9.2 11.5 5 8.5 3.5 4.5M8.8 13.5H4.5L2.5 11M9.2 15.5 5.5 18.5 4.5 21.5M14.8 11.5 19 8.5l1.5-4M15.2 13.5h4.3l2-2.5M14.8 15.5l3.7 3 1 3"/>'),
  match3: svg('<circle cx="6" cy="7" r="3"/><circle cx="12" cy="7" r="3"/><circle cx="18" cy="7" r="3"/>'
    + '<path d="M9 14.5 12 12l3 2.5-3 5.5Z"/><path d="M3.5 17h5M15.5 17h5" opacity="0.5"/>'),
  // го: сетка, чёрный и белый камни
  go: svg('<path d="M3 7h18M3 12h18M3 17h18M7 3v18M12 3v18M17 3v18" opacity="0.45"/>'
    + '<circle cx="12" cy="7" r="3.3" fill="currentColor" stroke="none"/><circle cx="7" cy="12" r="3.3" fill="currentColor" stroke="none"/>'
    + '<circle cx="17" cy="12" r="3.1"/><circle cx="12" cy="17" r="3.1"/>'),
  tictactoe: svg('<path d="M9 3v18M15 3v18M3 9h18M3 15h18" opacity="0.45"/><path d="m4.5 4.5 3 3m0-3-3 3"/><circle cx="12" cy="12" r="1.6"/><path d="m16.5 16.5 3 3m0-3-3 3"/>'),
  memory: svg('<rect x="3" y="4" width="8" height="10" rx="1.8"/><rect x="13" y="10" width="8" height="10" rx="1.8"/>'
    + '<path d="M5.5 7.5l3 3M8.5 7.5l-3 3" opacity="0.55"/><circle cx="17" cy="15" r="2.2" fill="currentColor" stroke="none"/>'),
  2048: svg('<rect x="3" y="3" width="18" height="18" rx="3"/>'
    + '<path d="M9.2 9.6a2.8 2.8 0 0 1 5.6.2c0 2.4-5.6 3.6-5.6 6.2h5.8"/>'),

  // Настольные
  chess: svg('<path d="M6.5 20.5h11"/><path d="M8.5 20.5c-.3-2.6.6-4.4 2.4-6.3-1.5.5-2.9.3-3.8-.8l.1-1.5 2.6-3.6c.8-1.3 1.9-2.2 3.4-2.6l.9-1.6 1 1.9c2.4 1.4 3.5 4.9 3.2 10.6l-.3 4.2"/>'
    + '<circle cx="12.3" cy="9" r="0.9" fill="currentColor" stroke="none"/>'),
  checkers: svg('<rect x="3" y="3" width="18" height="18" rx="3"/>'
    + '<circle cx="8.6" cy="8.6" r="2.4" fill="currentColor" stroke="none"/>'
    + '<circle cx="15.4" cy="15.4" r="2.4"/><path d="M3 12h18" opacity="0.35"/>'),

  // Аркады
  pinball: svg('<circle cx="12" cy="8" r="3.2" fill="currentColor" stroke="none"/>'
    + '<path d="M3.5 15.5l6 3"/><path d="M20.5 15.5l-6 3"/><path d="M3.5 21.5h17" opacity="0.4"/>'
    + '<path d="M16.5 3.8a6.5 6.5 0 0 1 1.9 4.2" opacity="0.5"/>'),
  'flappy-burger': svg('<path d="M4 9.5c0-3 3.6-5 8-5s8 2 8 5z"/><path d="M4.5 12.6h15"/>'
    + '<path d="M4 16h16c0 2-1.4 3.4-3.2 3.4H7.2C5.4 19.4 4 18 4 16z"/>'),
  snake: svg('<path d="M4 18.5h9.5a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7.5"/><circle cx="18.5" cy="6.5" r="2.4" fill="currentColor" stroke="none"/>'
    + '<circle cx="5" cy="18.5" r="1.4" fill="currentColor" stroke="none" opacity="0.5"/>'),
  arkanoid: svg('<rect x="2.6" y="3.4" width="5.2" height="3.4" rx="1"/><rect x="9.4" y="3.4" width="5.2" height="3.4" rx="1"/>'
    + '<rect x="16.2" y="3.4" width="5.2" height="3.4" rx="1"/><rect x="6" y="8.4" width="5.2" height="3.4" rx="1" opacity="0.5"/>'
    + '<rect x="12.8" y="8.4" width="5.2" height="3.4" rx="1" opacity="0.5"/>'
    + '<circle cx="14.6" cy="15.4" r="1.9" fill="currentColor" stroke="none"/><path d="M6.5 20.4h11" stroke-width="2.6"/>'),
  'brick-blast': svg('<rect x="2.5" y="3.5" width="8.4" height="4.4" rx="1.2"/><rect x="13.1" y="3.5" width="8.4" height="4.4" rx="1.2"/>'
    + '<rect x="2.5" y="9.6" width="8.4" height="4.4" rx="1.2"/><rect x="13.1" y="9.6" width="8.4" height="4.4" rx="1.2"/>'
    + '<circle cx="12" cy="19.2" r="2.4" fill="currentColor" stroke="none"/>'),
  'bubble-shooter': svg('<circle cx="7.5" cy="6" r="3.1"/><circle cx="14.5" cy="6" r="3.1"/>'
    + '<circle cx="11" cy="11.8" r="3.1"/><circle cx="18" cy="11.8" r="3.1" opacity="0.5"/>'
    + '<circle cx="11" cy="19.6" r="2.3" fill="currentColor" stroke="none"/><path d="M11 17.2v-1.6"/>'),
  'block-blast': svg('<rect x="3" y="3" width="8" height="8" rx="1.8"/><rect x="13" y="3" width="8" height="8" rx="1.8"/>'
    + '<rect x="3" y="13" width="8" height="8" rx="1.8"/>'
    + '<rect x="13" y="13" width="8" height="8" rx="1.8" fill="currentColor" stroke="none"/>'),

  // Музыка
  'bongo-cat': svg('<path d="M4.5 13.5V6l3.2 2.6h8.6L19.5 6v7.5"/><circle cx="9.2" cy="11.2" r="0.9" fill="currentColor" stroke="none"/>'
    + '<circle cx="14.8" cy="11.2" r="0.9" fill="currentColor" stroke="none"/><path d="M2.5 16.5 21.5 14"/>'
    + '<path d="M6 19.5c0-1.6 1-2.6 2.4-2.6s2.4 1 2.4 2.6M13.4 19c0-1.4.9-2.3 2.1-2.3s2.1.9 2.1 2.3"/>'),

  // Викторина
  flags: svg('<path d="M6 3.5v17"/><path d="M6 5h11l-2.6 4L17 13H6z" fill="currentColor" fill-opacity="0.18"/>'),
};

export const CATEGORY_ICONS = {
  words: svg('<path d="M5 19.5 12 4.5l7 15"/><path d="M8.2 14.5h7.6"/>'),
  puzzles: svg('<path d="M4 4.5h5a2 2 0 1 1 4 0h5v5a2 2 0 1 0 0 4v5h-5a2 2 0 1 0-4 0H4v-5a2 2 0 1 1 0-4z"/>'),
  board: svg('<rect x="3" y="3" width="18" height="18" rx="3"/>'
    + '<circle cx="8.6" cy="8.6" r="2.3" fill="currentColor" stroke="none"/>'
    + '<circle cx="15.4" cy="15.4" r="2.3"/>'),
  arcade: svg('<rect x="2.5" y="7.5" width="19" height="11" rx="5"/><path d="M7 11.2v3.6M5.2 13h3.6"/>'
    + '<circle cx="16.2" cy="12.2" r="1.3" fill="currentColor" stroke="none"/>'
    + '<circle cx="18.6" cy="14.6" r="1.3" fill="currentColor" stroke="none"/>'),
  music: svg('<path d="M9 18V5.5l11-2V16"/><circle cx="6.5" cy="18" r="2.6"/><circle cx="17.5" cy="16" r="2.6"/>'),
  // песочница: ведёрко и совок
  chill: svg('<path d="M4.5 10h11l-1.5 9.6a1.6 1.6 0 0 1-1.6 1.4H7.6A1.6 1.6 0 0 1 6 19.6Z"/><path d="M6 10a4 4 0 0 1 8 0"/>'
    + '<path d="M19 3v9"/><path d="M17 12h4l-.5 3.2a1.5 1.5 0 0 1-3 0Z" fill="currentColor" fill-opacity="0.18"/>'),
  quiz: svg('<circle cx="12" cy="12" r="9"/><path d="M3.2 12h17.6"/><path d="M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18"/>'),
};
