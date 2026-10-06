// Значки и рамки профиля (в бете 'badges'): значок стоит справа от имени, рамка надета на аватар — в таблицах
// рейтинга и в профиле. Носить можно один значок и одну рамку, выбирает игрок в своём профиле. Что у кого есть и
// что надето, решает сервер (server/lib.js: FRAMES, BADGES, wearOf); списки сверяются тестом.
//
// Значок — пиксельная картинка 16×16: чёрная обводка по форме, внутри переливающаяся заливка, грань (свет сверху-
// слева, тень снизу-справа) и символ. Размер задаётся в px (16 — в строке таблицы, 1 пиксель картинки = 1 px).
// Стили — styles/app.css (.cbadge…).

import { el } from '../shared/dom.js';
import { testerFrame } from './tester-frame.js';

export const FRAMES = { tester: 'Рамка тестера' };
export const BADGES = { contributor: 'Contributor' };

const N = 16;
const F = '#'.repeat(N);
const rep = (row, n) => Array(n).fill(row);

// «Аметист»: огранённый камень, внутри плюс (вклад); фиолетово-розовые лучи ходят по кругу
const ART = {
  contributor: {
    shape: ['...##########...', '..############..', '.##############.', ...rep(F, 6), '.##############.', '..############..',
      '...##########...', '....########....', '.....######.....', '......####......', '.......##.......'],
    symbol: [...rep('...##...', 3), ...rep('########', 2), ...rep('...##...', 3)],
    dy: -1,
    ink: '#220a4a',
    colors: ['#9b5cff', '#f0b3ff', '#ff7ad9', '#9b5cff', '#c9a3ff', '#ffffff', '#9b5cff'],
    seconds: 4.5,
  },
};

// ---------- геометрия (чистая, проверяется тестом) ----------

export const grid = (rows) => rows.map((r) => [...r].map((c) => c === '#'));

/** Символ по центру сетки 16×16 (dy — сдвиг по вертикали). */
export function place(rows, dy = 0) {
  const b = Array.from({ length: N }, () => Array(N).fill(false));
  const ox = Math.floor((N - rows[0].length) / 2);
  const oy = Math.floor((N - rows.length) / 2) + dy;
  rows.forEach((r, y) => [...r].forEach((c, x) => {
    if (c === '#') b[oy + y][ox + x] = true;
  }));
  return b;
}

/** Без крайнего слоя пикселей — то, что внутри обводки. */
export const erode = (b) => b.map((row, y) => row.map((v, x) => v
  && [-1, 0, 1].every((dy) => [-1, 0, 1].every((dx) => b[y + dy]?.[x + dx]))));

/** Грань: пиксели, у которых со стороны d (−1 — сверху-слева, 1 — снизу-справа) уже не заливка. */
export const edge = (b, d) => b.map((row, y) => row.map((v, x) => v && !(row[x + d] && b[y + d]?.[x])));

/** Путь SVG из пикселей: по прямоугольнику на каждый отрезок строки. */
export function path(b) {
  let d = '';
  b.forEach((row, y) => {
    for (let x = 0; x < N; x++) {
      if (!row[x]) continue;
      let w = 1;
      while (row[x + w]) w++;
      d += `M${x} ${y}h${w}v1h-${w}z`;
      x += w;
    }
  });
  return d;
}

/**
 * Контур формы для clip-path: polygon() в процентах. Форма — «без дыр по строкам» (в каждой строке один отрезок):
 * вниз по левому краю, вверх по правому.
 */
export function polygon(b) {
  const runs = b.map((row, y) => ({ y, from: row.indexOf(true), to: row.lastIndexOf(true) + 1 })).filter((r) => r.from >= 0);
  const pct = (v) => `${(v / N) * 100}%`;
  const left = runs.flatMap((r) => [[r.from, r.y], [r.from, r.y + 1]]);
  const right = [...runs].reverse().flatMap((r) => [[r.to, r.y + 1], [r.to, r.y]]);
  return `polygon(${[...left, ...right].map(([x, y]) => `${pct(x)} ${pct(y)}`).join(',')})`;
}

// ---------- картинка ----------

const htmlCache = new Map();

function htmlOf(id) {
  if (htmlCache.has(id)) return htmlCache.get(id);
  const art = ART[id];
  const outer = grid(art.shape);
  const inner = erode(outer);
  const light = edge(inner, -1);
  const dark = edge(inner, 1).map((row, y) => row.map((v, x) => v && !light[y][x]));
  const html = `<span class="cbadge-l cbadge-out" style="clip-path:${polygon(outer)}"></span>`
    + `<span class="cbadge-l" style="clip-path:${polygon(inner)}"><i class="cbadge-spin" style="background-image:conic-gradient(${[...art.colors, art.colors[0]].join(',')});animation-duration:${art.seconds}s"></i></span>`
    + `<svg class="cbadge-l" viewBox="0 0 ${N} ${N}" shape-rendering="crispEdges" aria-hidden="true">`
    + `<path fill="#fff" opacity=".5" d="${path(light)}"/><path fill="#000" opacity=".28" d="${path(dark)}"/>`
    + `<path fill="${art.ink}" d="${path(place(art.symbol, art.dy))}"/></svg>`;
  htmlCache.set(id, html);
  return html;
}

/** Значок размером size px; незнакомый id (значок новее приложения) — null. */
export function badge(id, size = 16) {
  if (!Object.hasOwn(ART, id)) return null;
  const node = el('span', { class: 'cbadge', role: 'img', 'aria-label': `Значок ${BADGES[id]}`, title: BADGES[id], style: `--s: ${size}px` });
  node.innerHTML = htmlOf(id);
  return node;
}

export const hasBadgeArt = (id) => Object.hasOwn(ART, id);

/** Аватар в надетой рамке (size — 'lg' | 'md' | 'sm'); рамки нет или она незнакома — аватар как есть. */
export const framed = (avatarNode, frameId, size = 'lg') => (frameId === 'tester' ? testerFrame(avatarNode, size) : avatarNode);
