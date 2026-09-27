// Карта уровней «Три в ряд» (по наброску владельца): извилистая дорожка снизу вверх, 10 глав со своим
// оформлением, каждый 10-й уровень — босс (крупнее, с короной и подписью «Босс»). Пройденные — зелёные с галочкой,
// текущий пульсирует, закрытые — серые с замком. Карта сама прокручивается к текущему уровню.

import { el } from '../../shared/dom.js';
import { CHAPTERS, LEVEL_COUNT } from './levels.js';

const STEP = 92;                 // расстояние между уровнями по вертикали
const TOP_PAD = 110;
const BOTTOM_PAD = 90;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** Положение уровня n на карте: x — доля ширины, y — пиксели сверху. */
export function nodePos(n) {
  const x = 0.5 + 0.27 * Math.sin(n * 1.02) + 0.06 * Math.sin(n * 2.7);
  const y = TOP_PAD + (LEVEL_COUNT - n) * STEP;
  return { x, y };
}

export const mapHeight = () => TOP_PAD + (LEVEL_COUNT - 1) * STEP + BOTTOM_PAD;

const svg = (tag, attrs = {}) => {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
};

// украшения глав: простые фигуры в тонах главы (рисуются SVG, без картинок)
const DECOR = {
  meadow: ['flower', 'flower', 'bush', 'flower'],
  beach: ['palm', 'shell', 'wave', 'shell'],
  forest: ['tree', 'tree', 'mushroom', 'tree'],
  desert: ['cactus', 'dune', 'cactus', 'pyramid'],
  swamp: ['reed', 'lily', 'reed', 'bubble'],
  mountain: ['peak', 'peak', 'pine', 'peak'],
  snow: ['flake', 'pine', 'flake', 'snowman'],
  ocean: ['fish', 'bubble', 'coral', 'fish'],
  volcano: ['rock', 'flame', 'rock', 'flame'],
  space: ['planet', 'star', 'star', 'rocket'],
};

function decorSvg(kind) {
  const s = svg('svg', { viewBox: '0 0 40 40', class: 'm3-decor-svg' });
  const add = (tag, attrs) => s.append(svg(tag, attrs));
  switch (kind) {
    case 'flower':
      for (let k = 0; k < 5; k++) add('ellipse', { cx: 20 + Math.cos(k * 1.26) * 7, cy: 16 + Math.sin(k * 1.26) * 7, rx: 5, ry: 5, fill: ['#ff7aa8', '#ffd166', '#b28dff'][k % 3] });
      add('circle', { cx: 20, cy: 16, r: 4, fill: '#ffe066' });
      add('rect', { x: 19, y: 22, width: 2, height: 16, fill: '#3fa34d' });
      break;
    case 'bush': add('ellipse', { cx: 20, cy: 28, rx: 16, ry: 10, fill: '#4cbb5b' }); add('ellipse', { cx: 14, cy: 24, rx: 8, ry: 7, fill: '#6fd67a' }); break;
    case 'palm':
      add('rect', { x: 18, y: 14, width: 4, height: 24, rx: 2, fill: '#b07a3c' });
      for (const a of [-60, -20, 20, 60]) add('ellipse', { cx: 20, cy: 12, rx: 13, ry: 4, fill: '#3fbf6a', transform: `rotate(${a} 20 14)` });
      break;
    case 'shell': add('path', { d: 'M8 30 Q20 4 32 30 Z', fill: '#ffb3a7' }); add('path', { d: 'M20 30 L20 12 M14 30 L17 14 M26 30 L23 14', stroke: '#e0766a', 'stroke-width': 1.5 }); break;
    case 'wave': add('path', { d: 'M2 26 Q10 18 18 26 T34 26 T50 26', stroke: '#8fe3ff', 'stroke-width': 3, fill: 'none' }); break;
    case 'tree': add('rect', { x: 18, y: 26, width: 4, height: 12, fill: '#7a4a24' }); add('circle', { cx: 20, cy: 18, r: 12, fill: '#2f9e4a' }); add('circle', { cx: 15, cy: 14, r: 5, fill: '#46b85f' }); break;
    case 'mushroom': add('rect', { x: 16, y: 22, width: 8, height: 14, rx: 3, fill: '#f5e6c8' }); add('path', { d: 'M6 24 Q20 2 34 24 Z', fill: '#e8443a' }); add('circle', { cx: 16, cy: 16, r: 2.5, fill: '#fff' }); add('circle', { cx: 25, cy: 18, r: 2, fill: '#fff' }); break;
    case 'cactus': add('rect', { x: 17, y: 8, width: 6, height: 30, rx: 3, fill: '#3aa35a' }); add('path', { d: 'M17 22 H10 V14', stroke: '#3aa35a', 'stroke-width': 5, fill: 'none', 'stroke-linecap': 'round' }); add('path', { d: 'M23 18 H30 V10', stroke: '#3aa35a', 'stroke-width': 5, fill: 'none', 'stroke-linecap': 'round' }); break;
    case 'dune': add('path', { d: 'M0 36 Q14 18 26 30 T40 32 V40 H0 Z', fill: '#f2c46b' }); break;
    case 'pyramid': add('path', { d: 'M4 36 L20 8 L36 36 Z', fill: '#e6b35a' }); add('path', { d: 'M20 8 L36 36 L24 36 Z', fill: '#c9923e' }); break;
    case 'reed': for (const x of [12, 20, 28]) add('path', { d: `M${x} 38 Q${x - 2} 20 ${x + 1} 6`, stroke: '#6a9c3a', 'stroke-width': 2.5, fill: 'none' }); add('ellipse', { cx: 21, cy: 10, rx: 2.5, ry: 6, fill: '#7a5230' }); break;
    case 'lily': add('ellipse', { cx: 20, cy: 28, rx: 15, ry: 7, fill: '#4fae5a' }); add('circle', { cx: 20, cy: 22, r: 5, fill: '#ff9ec7' }); break;
    case 'bubble': add('circle', { cx: 16, cy: 24, r: 7, fill: 'none', stroke: '#c8f3ff', 'stroke-width': 2 }); add('circle', { cx: 27, cy: 12, r: 4, fill: 'none', stroke: '#c8f3ff', 'stroke-width': 2 }); break;
    case 'peak': add('path', { d: 'M2 38 L20 6 L38 38 Z', fill: '#8c96b8' }); add('path', { d: 'M13 18 L20 6 L27 18 L23 16 L20 19 L17 16 Z', fill: '#fff' }); break;
    case 'pine': add('path', { d: 'M20 4 L32 30 H8 Z', fill: '#2b7a4b' }); add('rect', { x: 18, y: 30, width: 4, height: 8, fill: '#6b4424' }); break;
    case 'flake': for (let a = 0; a < 180; a += 60) add('line', { x1: 20, y1: 6, x2: 20, y2: 34, stroke: '#eaf6ff', 'stroke-width': 2.5, 'stroke-linecap': 'round', transform: `rotate(${a} 20 20)` }); break;
    case 'snowman': add('circle', { cx: 20, cy: 29, r: 9, fill: '#fff' }); add('circle', { cx: 20, cy: 14, r: 6, fill: '#fff' }); add('path', { d: 'M20 14 L27 15 L20 16 Z', fill: '#ff8a1f' }); break;
    case 'fish': add('ellipse', { cx: 18, cy: 20, rx: 11, ry: 7, fill: '#ffb347' }); add('path', { d: 'M28 20 L37 13 L37 27 Z', fill: '#ff8a1f' }); add('circle', { cx: 13, cy: 18, r: 1.8, fill: '#222' }); break;
    case 'coral': for (const [x, h] of [[12, 18], [20, 26], [28, 16]]) add('rect', { x: x - 2.5, y: 38 - h, width: 5, height: h, rx: 2.5, fill: '#ff6f91' }); break;
    case 'rock': add('path', { d: 'M4 36 L10 20 L22 14 L34 24 L36 36 Z', fill: '#5a3b3b' }); add('path', { d: 'M14 30 L20 22 L26 30', stroke: '#ff6a2a', 'stroke-width': 2, fill: 'none' }); break;
    case 'flame': add('path', { d: 'M20 4 Q34 20 26 32 Q20 40 14 32 Q6 20 20 4 Z', fill: '#ff6a2a' }); add('path', { d: 'M20 16 Q27 26 22 33 Q20 36 18 33 Q13 26 20 16 Z', fill: '#ffd34d' }); break;
    case 'planet': add('circle', { cx: 20, cy: 20, r: 10, fill: '#8f7bff' }); add('ellipse', { cx: 20, cy: 20, rx: 17, ry: 5, fill: 'none', stroke: '#ffd166', 'stroke-width': 2.5, transform: 'rotate(-20 20 20)' }); break;
    case 'star': add('path', { d: 'M20 4 L24 16 L37 16 L26 24 L30 37 L20 29 L10 37 L14 24 L3 16 L16 16 Z', fill: '#fff4b0' }); break;
    case 'rocket': add('path', { d: 'M20 4 Q30 14 26 30 H14 Q10 14 20 4 Z', fill: '#eef2ff' }); add('circle', { cx: 20, cy: 16, r: 3.5, fill: '#5ab0ff' }); add('path', { d: 'M16 30 L20 38 L24 30 Z', fill: '#ff8a1f' }); break;
    default: break;
  }
  return s;
}

/**
 * Карта. levelState(n) → { done: bool, open: bool, current: bool }; onPick(n) — нажали на открытый уровень.
 * → { root, scrollTo(n, smooth), unlock(n) }
 */
export function createMap({ levelState, onPick }) {
  const height = mapHeight();
  const inner = el('div', { class: 'm3-map-inner', style: `height: ${height}px` });
  const scroller = el('div', { class: 'm3-map' }, inner);

  // полосы глав: снизу вверх
  CHAPTERS.forEach((ch, k) => {
    const first = k * 10 + 1;
    const top = nodePos(Math.min(LEVEL_COUNT, first + 9)).y - STEP * 0.55 - (k === CHAPTERS.length - 1 ? TOP_PAD : 0);
    const bottom = nodePos(first).y + STEP * 0.45 + (k === 0 ? BOTTOM_PAD : 0);
    const band = el('div', { class: 'm3-band', 'data-theme': ch.theme, style: `top: ${top}px; height: ${bottom - top}px` });
    const decor = DECOR[ch.theme] ?? [];
    for (let d = 0; d < 6; d++) {
      const n = first + d * 2;
      const pos = nodePos(Math.min(LEVEL_COUNT, n));
      const side = pos.x > 0.5 ? 0.06 + (d % 3) * 0.05 : 0.8 + (d % 3) * 0.04;
      const node = el('div', { class: 'm3-decor', style: `left: ${side * 100}%; top: ${pos.y - top - 20 + (d % 2) * 26}px` });
      node.append(decorSvg(decor[d % decor.length]));
      band.append(node);
    }
    // табличка главы — с той стороны, где нет первого уровня главы
    const side = nodePos(first).x > 0.5 ? 'left: 26%' : 'left: 74%';
    band.append(el('div', { class: 'm3-chapter', style: side }, el('span', { class: 'm3-chapter-num' }, `Глава ${k + 1}`), el('span', {}, ch.name)));
    inner.append(band);
  });

  // дорожка
  const path = svg('svg', { class: 'm3-path', width: '100%', height: String(height), preserveAspectRatio: 'none' });
  const road = svg('path', { class: 'm3-road' });
  const done = svg('path', { class: 'm3-road-done' });
  path.append(road, done);
  inner.append(path);

  const nodes = new Map();
  for (let n = 1; n <= LEVEL_COUNT; n++) {
    const pos = nodePos(n);
    const boss = n % 10 === 0;
    const node = el('button', {
      class: `m3-node${boss ? ' m3-node-boss' : ''}`,
      style: `left: ${pos.x * 100}%; top: ${pos.y}px`,
      'aria-label': `Уровень ${n}${boss ? ', босс' : ''}`,
      onclick: () => {
        if (levelState(n).open) onPick(n);
        else node.animate?.([{ transform: 'translate(-50%, -50%) rotate(0)' }, { transform: 'translate(-50%, -50%) rotate(-8deg)' }, { transform: 'translate(-50%, -50%) rotate(8deg)' }, { transform: 'translate(-50%, -50%) rotate(0)' }], { duration: 300 });
      },
    });
    nodes.set(n, node);
    inner.append(node);
  }

  function paint() {
    let current = 1;
    for (const [n, node] of nodes) {
      const st = levelState(n);
      if (st.current) current = n;
      node.classList.toggle('m3-open', st.open);
      node.classList.toggle('m3-done', st.done);
      node.classList.toggle('m3-current', st.current);
      const boss = n % 10 === 0;
      // replaceChildren, в отличие от el(), не пропускает false — отсеиваем сами
      node.replaceChildren(...[
        boss && el('span', { class: 'm3-crown' }, st.open ? '👑' : '💀'),
        el('span', { class: 'm3-node-num' }, st.open ? String(n) : '🔒'),
        st.done && el('span', { class: 'm3-check' }, '✓'),
        boss && el('span', { class: 'm3-boss-label' }, 'Босс'),
      ].filter(Boolean));
    }
    drawRoad(current);
  }

  function drawRoad(current) {
    const w = inner.clientWidth || 360;
    const pts = [];
    for (let n = 1; n <= LEVEL_COUNT; n++) {
      const p = nodePos(n);
      pts.push([p.x * w, p.y]);
    }
    const d = smoothPath(pts);
    road.setAttribute('d', d);
    done.setAttribute('d', smoothPath(pts.slice(0, Math.max(1, current))));
    path.setAttribute('viewBox', `0 0 ${w} ${height}`);
  }

  const onResize = () => paint();
  const observer = new ResizeObserver(onResize);
  observer.observe(inner);
  paint();

  return {
    root: scroller,
    paint,
    node: (n) => nodes.get(n),
    /** Прокрутить так, чтобы уровень n был чуть ниже середины экрана. */
    scrollTo(n, smooth = false) {
      const y = nodePos(n).y - scroller.clientHeight * 0.58;
      scroller.scrollTo({ top: Math.max(0, y), behavior: smooth ? 'smooth' : 'auto' });
    },
    destroy() {
      observer.disconnect();
    },
  };
}

/** Плавная линия через точки (Catmull-Rom → Безье). */
function smoothPath(pts) {
  if (!pts.length) return '';
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let k = 0; k < pts.length - 1; k++) {
    const p0 = pts[k - 1] ?? pts[k];
    const p1 = pts[k];
    const p2 = pts[k + 1];
    const p3 = pts[k + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}
