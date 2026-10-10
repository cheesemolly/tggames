// «Логические схемы» — рисунок схемы: строки SVG без DOM (ими же рисуются детали в лотке, справке и настройках).
// Всё нарисовано линиями одной толщины, подписи вентилей — свои буквы из линий (И, Л, Н, Е): на любом телефоне
// они одинаковые и той же руки, что и провода. Цвета — только классами (палитра скина в game.css).
//
// Слои схемы: провода (под каждым — «подложка» цвета фона: на пересечении верхний провод разрывает нижний, как на
// схеме метро), бусины «НЕ» на входах, узлы. У провода четыре линии: погашенная, свечение, ток и искры. Ток
// «добегает» по пути за счёт stroke-dashoffset (длина пути принята за единицу — pathLength="1"); искры — короткие
// штрихи, которые бегут по уже горящему проводу от источника к лампе.

import { KIND_TITLES } from './logic.js';
import { CHIP, BEAD, SRC, LAMP } from './layout.js';

// буквы в клетке 10×14 от левого верхнего угла
const GLYPH = { w: 10, h: 14, gap: 5 };
const GLYPHS = {
  И: (x) => `M${x} 0V14L${x + 10} 0V14`,
  Л: (x) => `M${x} 14L${x + 5} 0L${x + 10} 14`,
  Н: (x) => `M${x} 0V14M${x + 10} 0V14M${x} 7H${x + 10}`,
  Е: (x) => `M${x + 9.5} 0H${x}V14H${x + 9.5}M${x} 7H${x + 7.5}`,
};

const f = (v) => Math.round(v * 100) / 100;

/** Надпись своими буквами: середина в (cx, cy), высота букв h, толщина линии stroke (в единицах схемы). */
export function word(text, cx, cy, h, stroke) {
  const k = h / GLYPH.h;
  const w = text.length * GLYPH.w + (text.length - 1) * GLYPH.gap;
  const d = [...text].map((ch, i) => GLYPHS[ch](i * (GLYPH.w + GLYPH.gap))).join('');
  return `<path class="lg-word" transform="translate(${f(cx - (w * k) / 2)} ${f(cy - h / 2)}) scale(${f(k)})" `
    + `stroke-width="${f(stroke / k)}" d="${d}"/>`;
}

/** Вентиль с серединой в нуле: ножки (два входа снизу, выход сверху), корпус, подпись. */
export function chip(kind, cls = '') {
  const { w, h, pin } = CHIP;
  return `<g class="lg-chip ${cls}" data-kind="${kind}">`
    + `<path class="lg-legs" d="M${-pin} ${h / 2 - 3}v6M${pin} ${h / 2 - 3}v6M0 ${-h / 2 + 3}v-6"/>`
    + `<rect class="lg-body" x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="11"/>`
    + word(KIND_TITLES[kind], 0, 0, 15, 2.9)
    + '</g>';
}

/** Пустое гнездо под вентиль: пунктирный контур и три контакта. */
export function socket() {
  const { w, h, pin } = CHIP;
  return '<g class="lg-socket">'
    + `<rect class="lg-hole" x="${-w / 2 + 1}" y="${-h / 2 + 1}" width="${w - 2}" height="${h - 2}" rx="10"/>`
    + `<circle class="lg-pad" cx="${-pin}" cy="${h / 2}" r="3.4"/><circle class="lg-pad" cx="${pin}" cy="${h / 2}" r="3.4"/>`
    + `<circle class="lg-pad" cx="0" cy="${-h / 2}" r="3.4"/>`
    + '</g>';
}

/** Бусина «НЕ» с серединой в нуле. */
export function bead(cls = '') {
  const { w, h } = BEAD;
  return `<g class="lg-bead ${cls}">`
    + `<rect class="lg-body" x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="${h / 2}"/>`
    + word(KIND_TITLES.not, 0, 0, 8.4, 2)
    + '</g>';
}

/** Колечко — место под «НЕ». */
export function ring() {
  const { w, h } = BEAD;
  return `<rect class="lg-ring" x="${-w / 2 + 1}" y="${-h / 2 + 1}" width="${w - 2}" height="${h - 2}" rx="${h / 2 - 1}"/>`;
}

/** Источник: клемма с молнией. */
export function source() {
  const { w, h } = SRC;
  return `<rect class="lg-src-aura" x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="9"/>`
    + `<rect class="lg-src-body" x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="9"/>`
    + '<path class="lg-bolt" d="M2.5 -9L-5.5 1.5h4.5L-2.5 9L5.5 -1.5H1Z"/>';
}

const RAYS = [-90, -45, -135, 0, 180, 45, 135];

/** Лампа с серединой колбы в нуле: ореол, лучи, цоколь, колба с нитью, черта «гореть не должна». */
export function lamp() {
  const { r, base } = LAMP;
  const rays = RAYS.map((deg) => {
    const a = (deg * Math.PI) / 180;
    return `M${f(Math.cos(a) * (r + 6))} ${f(Math.sin(a) * (r + 6))}L${f(Math.cos(a) * (r + 12))} ${f(Math.sin(a) * (r + 12))}`;
  }).join('');
  return '<circle class="lg-halo" r="62" fill="url(#lg-halo-fill)"/>'
    + `<path class="lg-rays" d="${rays}"/>`
    + `<rect class="lg-lamp-base" x="-7.5" y="${r - 3}" width="15" height="${base + 3}" rx="3"/>`
    + `<path class="lg-lamp-thread" d="M-7.5 ${r + 2.5}h15M-7.5 ${r + 5.8}h15"/>`
    + `<circle class="lg-glass" r="${r}"/>`
    + '<path class="lg-filament" d="M-5.5 9V1c0-7 5.5-7 5.5 0c0-7 5.5-7 5.5 0V9"/>'
    + '<path class="lg-slash-case" d="M-12.5 -12.5L12.5 12.5"/><path class="lg-slash" d="M-12.5 -12.5L12.5 12.5"/>';
}

const wire = (cls, d) => `<path class="${cls}" pathLength="1" d="${d}"/>`;
const sparks = (d) => `<path class="lg-sparks" d="${d}"/>`;
const wires4 = (d) => `<path class="lg-case" d="${d}"/><path class="lg-base" d="${d}"/>${wire('lg-glow', d)}${wire('lg-live', d)}${sparks(d)}`;

/** Схема целиком — содержимое <svg>. Узлы и входы помечены data-атрибутами: по ним игра находит их и красит. */
export function board(level, lay) {
  const S = level.sources.length;
  const ringIndex = new Map(level.rings.map((r, k) => [r.out === undefined ? `g${r.gate}:${r.pin}` : `o${r.out}`, k]));
  const socketIndex = new Map(level.sockets.map((g, k) => [g, k]));
  const at = (p) => `transform="translate(${f(p.x)} ${f(p.y)})"`;
  // провод узла: сначала подложки всех кусков, потом сами куски — иначе подложка куска перекрыла бы соседний
  let wires = '';
  for (const net of lay.nets) {
    wires += `<g class="lg-net" data-net="${net.node}">`
      + net.pieces.map((p) => `<path class="lg-case" d="${p.d}"/>`).join('')
      + net.pieces.map((p) => `<path class="lg-base" d="${p.d}"/>`).join('')
      + net.pieces.map((p) => wire('lg-glow', p.d)).join('')
      + net.pieces.map((p) => wire('lg-live', p.d)).join('')
      + net.pieces.map((p) => sparks(p.d)).join('')
      + net.dots.map((p) => `<circle class="lg-dot" cx="${f(p.x)}" cy="${f(p.y)}" r="4.3"/>`).join('')
      + '</g>';
  }
  let tails = '';
  let marks = '';
  for (const [key, pin] of lay.pins) {
    if (!pin.tail) continue;
    tails += `<g class="lg-tail" data-pin="${key}">${wires4(pin.tail.d)}</g>`;
    marks += pin.mark === 'ring'
      ? `<g class="lg-mark lg-ring-slot" data-ring="${ringIndex.get(key)}" data-pin="${key}" ${at(pin.bead)}>`
        + `<rect class="lg-hit" x="-21" y="-17" width="42" height="34"/>${ring()}<g class="lg-slot"></g></g>`
      : `<g class="lg-mark" data-pin="${key}" ${at(pin.bead)}>${bead('lg-fixed')}</g>`;
  }
  const sources = lay.sources.map((p, i) => `<g class="lg-src" data-src="${i}" ${at(p)}>${source()}</g>`).join('');
  const gates = lay.gates.map((p, i) => {
    const g = level.gates[i];
    return g.kind
      ? `<g class="lg-gate" data-gate="${i}" data-node="${S + i}" ${at(p)}>${chip(g.kind, 'lg-fixed')}</g>`
      : `<g class="lg-gate lg-socket-slot" data-gate="${i}" data-node="${S + i}" data-socket="${socketIndex.get(i)}" ${at(p)}>`
        + `<rect class="lg-hit" x="${-CHIP.w / 2 - 3}" y="${-CHIP.h / 2 - 6}" width="${CHIP.w + 6}" height="${CHIP.h + 12}"/>`
        + `${socket()}<g class="lg-slot"></g></g>`;
  }).join('');
  const outs = lay.outs.map((p, i) => `<g class="lg-lamp" data-out="${i}" ${at(p)}>${lamp()}</g>`).join('');
  return '<defs><radialGradient id="lg-halo-fill"><stop class="lg-halo-a" offset="0.2"/><stop class="lg-halo-b" offset="0.62"/>'
    + '<stop class="lg-halo-c" offset="1"/></radialGradient></defs>'
    + `<g class="lg-halos">${lay.outs.map((p, i) => `<circle class="lg-wash" data-out="${i}" cx="${f(p.x)}" cy="${f(p.y)}" r="150" fill="url(#lg-halo-fill)"/>`).join('')}</g>`
    + `<g class="lg-wires">${wires}${tails}</g><g class="lg-marks">${marks}</g>`
    + `<g class="lg-nodes">${sources}${gates}${outs}</g>`;
}
