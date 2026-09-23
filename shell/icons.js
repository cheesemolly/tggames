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
  loop: svg('<path d="M5 19v-6.5A4.5 4.5 0 0 1 9.5 8H19"/><circle cx="5" cy="19" r="2.2"/><circle cx="19" cy="8" r="2.2"/>'),
  'connect-dots': svg('<circle cx="5.5" cy="6" r="2.4" fill="currentColor" stroke="none"/>'
    + '<circle cx="18.5" cy="18" r="2.4" fill="currentColor" stroke="none"/>'
    + '<path d="M5.5 9v4.5a2.5 2.5 0 0 0 2.5 2.5h8"/>'),
  mahjong: svg('<rect x="2.5" y="7" width="9" height="13.5" rx="2"/><rect x="12.5" y="3.5" width="9" height="13.5" rx="2"/>'
    + '<path d="M6 11.5h2.5M6 15h2.5M16 8h2.5M16 11.5h2.5" opacity="0.7"/>'),
  2048: svg('<rect x="3" y="3" width="18" height="18" rx="3"/>'
    + '<path d="M9.2 9.6a2.8 2.8 0 0 1 5.6.2c0 2.4-5.6 3.6-5.6 6.2h5.8"/>'),

  // Настольные
  checkers: svg('<rect x="3" y="3" width="18" height="18" rx="3"/>'
    + '<circle cx="8.6" cy="8.6" r="2.4" fill="currentColor" stroke="none"/>'
    + '<circle cx="15.4" cy="15.4" r="2.4"/><path d="M3 12h18" opacity="0.35"/>'),

  // Аркады
  'flappy-burger': svg('<path d="M4 9.5c0-3 3.6-5 8-5s8 2 8 5z"/><path d="M4.5 12.6h15"/>'
    + '<path d="M4 16h16c0 2-1.4 3.4-3.2 3.4H7.2C5.4 19.4 4 18 4 16z"/>'),
  'brick-blast': svg('<rect x="2.5" y="3.5" width="8.4" height="4.4" rx="1.2"/><rect x="13.1" y="3.5" width="8.4" height="4.4" rx="1.2"/>'
    + '<rect x="2.5" y="9.6" width="8.4" height="4.4" rx="1.2"/><rect x="13.1" y="9.6" width="8.4" height="4.4" rx="1.2"/>'
    + '<circle cx="12" cy="19.2" r="2.4" fill="currentColor" stroke="none"/>'),
  'bubble-shooter': svg('<circle cx="7.5" cy="6" r="3.1"/><circle cx="14.5" cy="6" r="3.1"/>'
    + '<circle cx="11" cy="11.8" r="3.1"/><circle cx="18" cy="11.8" r="3.1" opacity="0.5"/>'
    + '<circle cx="11" cy="19.6" r="2.3" fill="currentColor" stroke="none"/><path d="M11 17.2v-1.6"/>'),
  'block-blast': svg('<rect x="3" y="3" width="8" height="8" rx="1.8"/><rect x="13" y="3" width="8" height="8" rx="1.8"/>'
    + '<rect x="3" y="13" width="8" height="8" rx="1.8"/>'
    + '<rect x="13" y="13" width="8" height="8" rx="1.8" fill="currentColor" stroke="none"/>'),

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
  quiz: svg('<circle cx="12" cy="12" r="9"/><path d="M3.2 12h17.6"/><path d="M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18"/>'),
};
