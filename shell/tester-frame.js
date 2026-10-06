// Рамка тестера (в бете 'tester-frame'): серебряная пиксельная рамка вокруг аватара в профиле — у бета-тестеров
// и разработчика. Цельная: заклёпки по краям, снизу планка с надписью TESTER, в правом нижнем углу — плашка с
// гаечным ключом и молотом. Блик проходит по диагонали, потом искра обегает заклёпки. Стили — styles/app.css
// (.tframe…): рамка одна и та же во вкладке «Профиль» и в профиле игрока в рейтинге.

import { el } from '../shared/dom.js';

/** Размеры в px: рамка W×H, шаг пикселя блика STEP; из них считаются и стили (тест сверяет). */
export const FRAME = { w: 96, h: 117, step: 3 };

/**
 * Блик — две ступенчатые диагонали (широкая и узкая следом) во всю высоту рамки: пути SVG и его ширина.
 * Одним SVG, а не тенями от точки: рисунок целиком в своём прямоугольнике — браузер не теряет, что перерисовать
 * (блик тенями оставлял «след» на планке).
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

// гаечный ключ и молот, 16×16 пикселей
const TOOLS = '<svg viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true">'
  + '<path fill="#eef2f8" d="M1 14h2v1h-2zM1 13h3v1h-3zM3 12h2v1h-2zM4 11h2v1h-2zM5 10h2v1h-2zM6 9h2v1h-2zM7 8h2v1h-2zM8 7h2v1h-2zM9 6h2v1h-2zM10 5h4v1h-4zM10 4h5v1h-5zM10 3h2v1h-2zM14 3h2v1h-2zM10 2h2v1h-2zM15 2h1v1h-1zM11 1h2v1h-2z"/>'
  + '<path fill="#9aa6bd" d="M3 13h1v1h-1zM4 12h1v1h-1zM5 11h1v1h-1zM6 10h1v1h-1zM7 9h1v1h-1zM8 8h1v1h-1zM9 7h1v1h-1zM10 6h1v1h-1zM11 5h3v1h-3z"/>'
  + '<path fill="#ffd23d" d="M12 13h2v1h-2zM11 12h2v1h-2zM10 11h2v1h-2zM9 10h2v1h-2zM8 9h2v1h-2zM7 8h2v1h-2zM6 7h2v1h-2zM5 6h2v1h-2zM4 5h2v1h-2z"/>'
  + '<path fill="#8a95ad" d="M5 1h3v1h-3zM4 2h3v1h-3zM3 3h3v1h-3zM2 4h3v1h-3zM1 5h3v1h-3zM1 6h2v1h-2z"/>'
  + '<path fill="#dfe6f2" d="M5 1h1v1h-1zM4 2h1v1h-1zM3 3h1v1h-1zM2 4h1v1h-1zM1 5h1v1h-1z"/></svg>';

// заклёпки по часовой стрелке (в правом нижнем углу её нет — там плашка): [left, top]
const RIVETS = [[3, 3], [46, 3], [90, 3], [90, 46], [3, 111], [3, 46]];

/**
 * Аватар в рамке тестера. avatarNode — обычный аватар (вкладки «Профиль» или рейтинга): из него берутся буква и
 * цвет, сам он в рамку не вставляется (у каждого экрана свои размеры и тени аватара).
 */
export function testerFrame(avatarNode) {
  const ava = el('span', { class: 'tframe-ava' }, avatarNode.textContent);
  if (avatarNode.dataset.cat) ava.dataset.cat = avatarNode.dataset.cat;      // новый интерфейс: цвет папки (--c)
  const cat = avatarNode.style.getPropertyValue('--cat');                    // рейтинг: --cat
  if (cat) ava.style.setProperty('--cat', cat);

  const { main, tail, width } = shine();
  const body = el('span', { class: 'tframe-body' },
    RIVETS.map(([x, y], i) => el('span', { class: 'tframe-rv', style: `left: ${x}px; top: ${y}px; --i: ${i}` })),
    el('span', { class: 'tframe-word' }, 'TESTER'),
  );
  body.insertAdjacentHTML('beforeend',
    `<svg class="tframe-shine" width="${width}" height="${FRAME.h}" shape-rendering="crispEdges" aria-hidden="true">`
    + `<path fill="#fff" d="${main}"/><path fill="#fff" opacity=".55" d="${tail}"/></svg>`);
  const badge = el('span', { class: 'tframe-badge' });
  badge.innerHTML = TOOLS;
  return el('span', { class: 'tframe', role: 'img', 'aria-label': 'Аватар в рамке бета-тестера' }, body, ava, badge);
}
