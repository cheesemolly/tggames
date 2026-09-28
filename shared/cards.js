// Игральные карты для пасьянсов (Паук, Косынка): свои SVG, рисуются кодом — рисунки чужих колод не берём.
// Крупный индекс сверху слева, масть сверху справа (при раскладке столбиком видна только верхняя полоска карты —
// там всё и должно читаться на ширине ~30 px), в середине — большая масть, у картинок (В, Д, К) — буква с простым
// рисунком: у короля корона, у дамы — диадема с жемчугом, у валета — перо.
// Стили лица — shared/cards.css (классы pc-*, размер — переменная --pc-w, цвета мастей — --pc-suit-0…3).
// Масти: 0 — пики, 1 — червы, 2 — бубны, 3 — трефы.

import { loadCss } from './dom.js';

// масти в поле 100×100
export const SUIT_PATHS = [
  // пики
  'M50 6C38 24 12 38 12 60c0 13 10 21 21 21 7 0 12-3 15-7-1 8-4 14-11 19h26c-7-5-10-11-11-19 3 4 8 7 15 7 11 0 21-8 21-21C88 38 62 24 50 6Z',
  // червы
  'M50 90C40 80 8 58 8 34 8 20 19 10 31 10c9 0 15 5 19 12 4-7 10-12 19-12 12 0 23 10 23 24 0 24-32 46-42 56Z',
  // бубны
  'M50 5 84 50 50 95 16 50Z',
  // трефы
  'M50 7c-12 0-21 9-21 20 0 5 2 9 4 12-3-2-6-3-10-3-11 0-19 9-19 20s8 20 19 20c8 0 14-4 18-10-1 9-4 16-12 22h42c-8-6-11-13-12-22 4 6 10 10 18 10 11 0 19-9 19-20s-8-20-19-20c-4 0-7 1-10 3 2-3 4-7 4-12 0-11-9-20-21-20Z',
];
export const SUIT_NAMES = ['пики', 'червы', 'бубны', 'трефы'];
const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const rankLabel = (rank) => RANKS[rank];
/** Красная ли масть (червы, бубны). */
export const isRed = (suit) => suit === 1 || suit === 2;

// рисунки картинок в поле 100×100 (контур, цвет — масть)
const COURT = {
  13: 'M18 70 12 30l20 18 18-30 18 30 20-18-6 40Z M18 78h64',                          // корона
  12: 'M16 72C22 48 34 40 50 40s28 8 34 32Z M45 26a5 5 0 1 0 10 0 5 5 0 1 0-10 0 M22 42a4 4 0 1 0 8 0 4 4 0 1 0-8 0 M70 42a4 4 0 1 0 8 0 4 4 0 1 0-8 0',   // диадема с жемчугом
  11: 'M28 84C34 52 52 26 78 14 70 38 60 62 34 84Z M36 72 60 36',                       // перо
};

export const suitSvg = (suit, cls = '') => `<svg class="${cls}" viewBox="0 0 100 100" aria-hidden="true"><path d="${SUIT_PATHS[suit]}"/></svg>`;

/** Лицевая сторона карты (внутренности элемента с классом pc-s<масть>). */
export function faceHtml(suit, rank) {
  const label = RANKS[rank];
  const center = COURT[rank]
    ? `<svg class="pc-court" viewBox="0 0 100 100" aria-hidden="true"><path d="${COURT[rank]}"/></svg>${suitSvg(suit, 'pc-court-suit')}`
    : suitSvg(suit, rank === 1 ? 'pc-pip pc-pip-ace' : 'pc-pip');
  return `<span class="pc-idx${label.length > 1 ? ' pc-idx-10' : ''}">${label}</span>${suitSvg(suit, 'pc-idx-suit')}<span class="pc-center">${center}</span>`;
}

/** Картинка карты для холста (каскад победы): SVG в data:, color — цвет масти. */
export function cardImage(suit, rank, color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="142" viewBox="0 0 100 142">`
    + '<rect x="1" y="1" width="98" height="140" rx="9" fill="#fdfdfb" stroke="#b9b9b3" stroke-width="2"/>'
    + `<text x="9" y="36" font-family="system-ui, sans-serif" font-weight="800" font-size="34" fill="${color}">${RANKS[rank]}</text>`
    + `<g transform="translate(62 10) scale(0.3)" fill="${color}"><path d="${SUIT_PATHS[suit]}"/></g>`
    + `<g transform="translate(22 52) scale(0.56)" fill="${color}"><path d="${SUIT_PATHS[suit]}"/></g></svg>`;
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return img;
}

let cssLoaded = null;
/** Подключить shared/cards.css (один раз на страницу). */
export function loadCardStyles() {
  cssLoaded ??= loadCss(new URL('./cards.css', import.meta.url));
  return cssLoaded;
}
