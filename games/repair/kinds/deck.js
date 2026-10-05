// ПарДек — портативный компьютер 330×140 (сверху сцены, лотки снизу). Спереди — экран на клею, стики, крестовина,
// кнопки и тачпады; сзади — крышка на 4 винтах, под ней плата, вентилятор, батарея, диск на винте и модули стиков
// (каждый на своём винте). Сзади всё зеркально: левый стик — справа.

import { frame, pcb, screwHead, hole, plugBody, socket, jackMark, screenStates } from '../scene.js';

const F = frame(15, 36);
const { box, pt, wrap } = F;

const BODY = 'M30 0H300A30 30 0 0 1 330 30V96Q330 140 288 140H42Q0 140 0 96V30A30 30 0 0 1 30 0Z';
const SCREWS = { h1: [18, 18], h2: [312, 18], h3: [18, 122], h4: [312, 122], d1: [82, 85], l1: [268, 50], r1: [62, 50] };
const CONNS = { str: [80, 34], disp: [116, 34], fan: [202, 30], bat: [226, 58], stl: [250, 34] };
const FLEX = { str: 'left', disp: 'right', fan: 'left', bat: 'down', stl: 'right' };

const topEdge = (front) => `${jackMark(165, 2, 16, 5)}<rect class="pr-side-btn" x="${front ? 48 : 258}" y="-3" width="24" height="4" rx="2"/>`;

function frontBody() {
  return wrap(`<path class="pr-dark-plastic" d="${BODY}"/>
<rect class="pr-midframe" x="78" y="14" width="174" height="106" rx="6"/><rect class="pr-glue" x="82" y="18" width="166" height="98" rx="4"/>
<rect class="pr-slot" x="96" y="60" width="22" height="10" rx="3"/>
<circle class="pr-stick-cap" cx="45" cy="34" r="14"/><circle class="pr-stick-top" cx="45" cy="34" r="9"/>
<circle class="pr-stick-cap" cx="285" cy="34" r="14"/><circle class="pr-stick-top" cx="285" cy="34" r="9"/>
<path class="pr-dpad" d="M40 62h10v8h8v10h-8v8H40v-8h-8V70h8Z"/>
${[[285, 64], [297, 76], [285, 88], [273, 76]].map(([x, y]) => `<circle class="pr-abxy" cx="${x}" cy="${y}" r="5.5"/>`).join('')}
<rect class="pr-pad" x="28" y="98" width="34" height="30" rx="6"/><rect class="pr-pad" x="268" y="98" width="34" height="30" rx="6"/>
<text class="pr-brand-dark" x="165" y="132" text-anchor="middle">ПАРДЕК</text>${topEdge(true)}`);
}

function backBody() {
  return wrap(`<path class="pr-dark-plastic" d="${BODY}"/>
<path class="pr-cavity" d="M34 8H296A24 24 0 0 1 320 32V94Q320 132 286 132H44Q10 132 10 94V32A24 24 0 0 1 34 8Z"/>
${pcb(86, 10, 160, 56, 5, 8)}
${Object.values(CONNS).map(([x, y]) => socket(x, y)).join('')}
<rect class="pr-bay" x="20" y="8" width="54" height="52" rx="6"/><rect class="pr-bay" x="256" y="8" width="54" height="52" rx="6"/>
${topEdge(false)}`);
}

const SCREEN = { x: 86, y: 20, w: 158, h: 94, rx: 3 };

const DRAW = {
  shell: () => `<path class="pr-dark-plastic pr-shell" d="${BODY}"/>
<path class="pr-shell-grip" d="M20 40c0-14 10-22 26-22h20v100H44c-16 0-24-10-24-24Z"/><path class="pr-shell-grip" d="M310 40c0-14-10-22-26-22h-20v100h22c16 0 24-10 24-24Z"/>
<g class="pr-vent">${[0, 1, 2, 3, 4, 5, 6, 7].map((k) => `<rect x="${126 + k * 10}" y="10" width="5" height="22" rx="2.5"/>`).join('')}</g>
<rect class="pr-sticker" x="128" y="70" width="74" height="30" rx="4"/><text class="pr-sticker-text" x="165" y="89" text-anchor="middle">ПарДек</text>
${['h1', 'h2', 'h3', 'h4'].map((id) => hole(...SCREWS[id])).join('')}
<rect class="pr-cover-gap" x="322" y="30" width="5" height="80" rx="2.5"/><ellipse class="pr-bulge" cx="165" cy="80" rx="80" ry="34"/>`,
  battery: (s) => `<rect class="pr-battery" x="96" y="70" width="140" height="58" rx="6"/>
<rect class="pr-battery-label" x="106" y="80" width="86" height="38" rx="3"/>
<text class="pr-battery-text" x="112" y="95">7.7 V  40 Wh</text><text class="pr-battery-text" x="112" y="110">${s.parts.battery.broken === 'worn' ? 'ИЗНОС 58%' : 'Li-Po 2S'}</text>
<rect class="pr-flex" x="219" y="60" width="14" height="12" rx="2"/>`,
  ssd: (s) => `<rect class="pr-ssd" x="24" y="74" width="64" height="22" rx="2"/><rect class="pr-chip" x="34" y="78" width="20" height="14" rx="1"/><rect class="pr-chip" x="58" y="79" width="14" height="12" rx="1"/>
<rect class="pr-gold-strip" x="24" y="76" width="5" height="18"/>${hole(...SCREWS.d1, 4)}
${s.parts.ssd.broken ? '<path class="pr-scorch" d="M38 80c4-4 12-3 14 2s-4 9-9 8-8-6-5-10Z"/>' : ''}`,
  fan: (s) => {
    const blades = [0, 1, 2, 3, 4, 5, 6].map((k) => `<path class="pr-blade" transform="rotate(${k * 51.4} 165 37)" d="M165 37c4-10 12-16 18-14-2 7-9 12-18 14Z"/>`).join('');
    return `<rect class="pr-fan-box" x="140" y="12" width="50" height="50" rx="8"/><circle class="pr-fan-ring" cx="165" cy="37" r="21"/>
<g class="pr-fan-blades">${blades}</g><circle class="pr-fan-hub" cx="165" cy="37" r="6"/>
${s.parts.fan.broken ? '<path class="pr-tear" d="M150 26l8 6-3 4 8 6"/>' : ''}
<g class="pr-dust"><circle cx="152" cy="28" r="4"/><circle cx="176" cy="46" r="5"/><circle cx="160" cy="50" r="3"/><circle cx="178" cy="24" r="3"/><path d="M146 40c6-3 10 2 16-1"/></g>
<rect class="pr-flex" x="190" y="26" width="12" height="8" rx="1"/>`;
  },
  stickL: (s) => stick(256, 'stickL', s),
  stickR: (s) => stick(20, 'stickR', s),
  display: (s) => {
    const tiles = [0, 1, 2, 3, 4].map((k) => `<rect class="pr-tile pr-app-${(k * 3) % 8}" x="${94 + k * 30}" y="44" width="26" height="36" rx="3"/>`).join('');
    const home = `<rect x="86" y="20" width="158" height="94" class="pr-ui-dark"/>
<text class="pr-ui-title" x="94" y="34">Библиотека</text><text class="pr-ui-time" x="236" y="34" text-anchor="end">12:30</text>
${tiles}<rect class="pr-cursor" x="92" y="42" width="30" height="40" rx="4"/>
<rect class="pr-ui-bar" x="94" y="92" width="80" height="6" rx="3"/><rect class="pr-ui-bar" x="94" y="102" width="50" height="5" rx="2.5"/>`;
    return `<rect class="pr-glass" x="78" y="14" width="174" height="106" rx="6" fill="url(#pr-g-glass)"/>
${screenStates(SCREEN, s, home)}
<rect class="pr-glass-edge" x="78.5" y="14.5" width="173" height="105" rx="5.5"/>
<rect class="pr-heat" x="78" y="14" width="174" height="106" rx="6"/>`;
  },
};

/** Модуль стика: квадрат с основанием и рычажком; у сломанного — потёртое кольцо. */
function stick(x, id, s) {
  const screw = SCREWS[id === 'stickL' ? 'l1' : 'r1'];
  return `<rect class="pr-stick-module" x="${x + 2}" y="12" width="50" height="44" rx="5"/>
<circle class="pr-stick-base" cx="${x + 27}" cy="32" r="15"/><circle class="pr-stick-top" cx="${x + 27}" cy="32" r="8"/>
${s.parts[id].broken ? `<circle class="pr-worn-ring" cx="${x + 27}" cy="32" r="12"/>` : ''}${hole(...screw, 4)}
<rect class="pr-flex" x="${id === 'stickL' ? x - 4 : x + 50}" y="30" width="8" height="8" rx="1"/>`;
}

const at = (o) => Object.fromEntries(Object.entries(o).map(([k, [x, y]]) => [k, pt(x, y)]));

export default {
  kind: 'deck',
  origin: [180, 106],
  DISHES: [[6, 190, 226, 244], [238, 190, 116, 244]],
  MAT: { x: 242, y: 194, w: 108, h: 92 },
  MAT_CELL: { h1: [262, 214], h2: [296, 214], h3: [330, 214], h4: [262, 240], d1: [296, 240], l1: [330, 240], r1: [262, 266] },
  BOX: {
    shell: box(0, 0, 330, 140),
    display: box(78, 14, 174, 106),
    battery: box(96, 70, 140, 58),
    ssd: box(24, 74, 64, 22),
    fan: box(140, 12, 50, 50),
    stickL: box(258, 12, 50, 44),
    stickR: box(22, 12, 50, 44),
  },
  SCREEN: box(SCREEN.x, SCREEN.y, SCREEN.w, SCREEN.h),
  TRAY: {
    shell: { cx: 119, cy: 238, w: 210, h: 84 },
    display: { cx: 119, cy: 318, w: 200, h: 64 },
    battery: { cx: 62, cy: 394, w: 100, h: 46 },
    fan: { cx: 146, cy: 394, w: 44, h: 44 },
    ssd: { cx: 200, cy: 394, w: 48, h: 20 },
    stickL: { cx: 268, cy: 336, w: 44, h: 40 },
    stickR: { cx: 322, cy: 336, w: 44, h: 40 },
  },
  SCREW_AT: at(SCREWS),
  CONN_AT: at(CONNS),
  SPOT_AT: { jack: pt(165, 2), fan: pt(165, 37) },
  JACK: { back: box(148, -12, 34, 22), front: box(148, -12, 34, 22) },
  BUTTON: { back: box(252, -14, 36, 20), front: box(42, -14, 36, 20) },
  ORDER: { back: ['battery', 'ssd', 'fan', 'stickL', 'stickR', 'plugs', 'shell'], front: ['display'] },
  backBody,
  frontBody,
  part: (id, s) => wrap(DRAW[id](s)),
  plug: (id) => wrap(plugBody(...CONNS[id], FLEX[id])),
  screw: (id) => wrap(screwHead(...SCREWS[id])),
};

