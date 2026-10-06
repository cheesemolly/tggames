// Рамка тестера (в бете 'tester-frame'): серебряная пиксельная рамка вокруг аватара — у бета-тестеров и
// разработчика. Квадратная толстая кайма с заклёпками, внизу по центру — гаечный ключ и молот (свисают за край).
// Блик проходит по диагонали, в большой рамке потом искра обегает заклёпки. Вид один и тот же везде: в профиле,
// на пьедестале и в строке таблицы — меняется только размер. Стили — styles/app.css (.tframe…).

import { el } from '../shared/dom.js';

/**
 * Размеры в px: рамка W×H, кайма PAD (вместе с чёрной линией у аватара), шаг пикселя блика STEP, пиксель значка
 * ICON; из них считаются и стили (тест сверяет). lg — профиль (аватар 78), md — пьедестал (44), sm — строка
 * таблицы (34).
 */
export const SIZES = {
  lg: { w: 102, h: 102, pad: 12, step: 3, icon: 3 },
  md: { w: 56, h: 56, pad: 6, step: 2, icon: 2 },
  sm: { w: 44, h: 44, pad: 5, step: 2, icon: 1 },
};
export const FRAME = SIZES.lg;

/**
 * Блик — две ступенчатые диагонали (широкая и узкая следом) во всю высоту рамки: пути SVG и его ширина.
 * Одним SVG, а не тенями от точки: рисунок целиком в своём прямоугольнике — браузер не теряет, что перерисовать
 * (блик тенями оставлял «след» на рамке).
 */
export function shine({ h, step } = FRAME) {
  let main = '';
  let tail = '';
  for (let k = 0; k < h / step; k++) {
    const y = h - step * (k + 1);
    main += `M${step * (5 + k)} ${y}h${step * 2}v${step}h-${step * 2}z`;
    tail += `M${step * k} ${y}h${step}v${step}h-${step}z`;
  }
  return { main, tail, width: h + step * 7 };
}

/** Сколько шагов проходит блик: от «целиком слева за рамкой» до «целиком справа». */
export const shineSteps = ({ w, h, step } = FRAME) => (shine({ h, step }).width + w) / step;

// гаечный ключ и молот, 16×16 пикселей: W, w — ключ и его тень; H — рукоять молота; S, s — боёк и блик на нём
export const TOOLS_ART = [
  '................',
  '.....sSS...WW...',
  '....sSS...WW...W',
  '...sSS....WW..WW',
  '..sSS.....WWWWW.',
  '.sSSHH....Wwww..',
  '.SS..HH..Ww.....',
  '......HHWw......',
  '.......HH.......',
  '......WwHH......',
  '.....Ww..HH.....',
  '....Ww....HH....',
  '...Ww......HH...',
  '.WWw........HH..',
  '.WW.............',
  '................',
];
const TOOL_COLORS = { W: '#eef2f8', w: '#9aa6bd', H: '#ffd23d', S: '#8a95ad', s: '#dfe6f2' };

/** Отрезки строк, где test(символ) верно, — путём SVG; (ox, oy) — сдвиг. */
function runs(rows, test, ox = 0, oy = 0) {
  let d = '';
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (!test(row[x], x, y)) continue;
      let w = 1;
      while (x + w < row.length && test(row[x + w], x + w, y)) w++;
      d += `M${x + ox} ${y + oy}h${w}v1h-${w}z`;
      x += w - 1;
    }
  });
  return d;
}

/**
 * Значок с чёрной обводкой в пиксель (плашки под ним нет — он лежит на рамке и свисает за неё): картинка 18×18.
 * Обводка — все пиксели, у которых рядом (в том числе по диагонали) есть цветной.
 */
export function toolsSvg(art = TOOLS_ART) {
  const n = art.length;
  const filled = (x, y) => art[y]?.[x] !== undefined && art[y][x] !== '.';
  const padded = Array.from({ length: n + 2 }, () => '.'.repeat(n + 2));
  const near = (_, x, y) => [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => filled(x - 1 + dx, y - 1 + dy)));
  return `<svg viewBox="0 0 ${n + 2} ${n + 2}" shape-rendering="crispEdges" aria-hidden="true">`
    + `<path fill="#000" d="${runs(padded, near)}"/>`
    + Object.entries(TOOL_COLORS).map(([key, color]) => `<path fill="${color}" d="${runs(art, (c) => c === key, 1, 1)}"/>`).join('')
    + '</svg>';
}

const TOOLS = toolsSvg();

// заклёпки [left, top] по часовой стрелке; внизу по центру её нет — там значок. В маленьких рамках — точки по углам.
const RIVETS = {
  lg: [[5, 5], [49, 5], [94, 5], [94, 49], [94, 94], [5, 94], [5, 49]],
  md: [[3, 3], [52, 3], [52, 52], [3, 52]],
  sm: [[2, 2], [41, 2], [41, 41], [2, 41]],
};

/**
 * Аватар в рамке тестера. avatarNode — обычный аватар (вкладки «Профиль» или рейтинга): из него берутся буква и
 * цвет, сам он в рамку не вставляется (у каждого экрана свои размеры и тени аватара). size — ключ SIZES.
 */
export function testerFrame(avatarNode, size = 'lg') {
  const key = Object.hasOwn(SIZES, size) ? size : 'lg';
  const box = SIZES[key];
  const ava = el('span', { class: 'tframe-ava' }, avatarNode.textContent);
  if (avatarNode.dataset.cat) ava.dataset.cat = avatarNode.dataset.cat;      // новый интерфейс: цвет папки (--c)
  const cat = avatarNode.style.getPropertyValue('--cat');                    // рейтинг: --cat
  if (cat) ava.style.setProperty('--cat', cat);

  const { main, tail, width } = shine(box);
  const body = el('span', { class: 'tframe-body' },
    RIVETS[key].map(([x, y], i) => el('span', { class: 'tframe-rv', style: `left: ${x}px; top: ${y}px; --i: ${i}` })),
  );
  body.insertAdjacentHTML('beforeend',
    `<svg class="tframe-shine" width="${width}" height="${box.h}" shape-rendering="crispEdges" aria-hidden="true">`
    + `<path fill="#fff" d="${main}"/><path fill="#fff" opacity=".55" d="${tail}"/></svg>`);
  const icon = el('span', { class: 'tframe-icon' });
  icon.innerHTML = TOOLS;
  return el('span', { class: `tframe tframe-${key}`, role: 'img', 'aria-label': 'Аватар в рамке бета-тестера' }, body, ava, icon);
}
