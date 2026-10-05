// Свичер — приставка-планшет 300×130 с отстёгиваемыми контроллерами по бокам (сверху сцены, лотки снизу).
// Контроллеры (joyL, joyR) видны с обеих сторон: сзади они меняются местами (код сдвигает их зеркально), лицевые
// детали прячутся (.pr-face-front). Сзади — крышка на 4 винтах (снимается только без контроллеров), внутри
// вентилятор, считыватель картриджей, батарея; щель картриджа — на верхнем торце, её чистят кисточкой снаружи.

import { frame, screwHead, hole, plugBody, socket, jackMark, screenStates } from '../scene.js';

const F = frame(30, 40);
const { box, pt, wrap } = F;

const SCREWS = { h1: [52, 12], h2: [248, 12], h3: [52, 118], h4: [248, 118] };
const CONNS = { disp: [116, 30], bat: [150, 56], crt: [200, 46] };
const FLEX = { disp: 'right', bat: 'down', crt: 'right' };

const edge = (front) => `${jackMark(150, 128, 16, 5)}
<rect class="pr-cart-slot" x="${front ? 206 : 50}" y="-2" width="44" height="5" rx="2"/>
<g class="pr-slot-dust"><path d="M${front ? 212 : 56} 0.5c4-2 8 1 12-1s8 2 12 0 6 1 8 1"/></g>
<rect class="pr-side-btn" x="${front ? 58 : 218}" y="-3" width="24" height="4" rx="2"/>`;

function frontBody() {
  return wrap(`<rect class="pr-dark-plastic" x="40" y="0" width="220" height="130" rx="10"/>
<rect class="pr-midframe" x="48" y="8" width="204" height="114" rx="6"/><rect class="pr-glue" x="52" y="12" width="196" height="106" rx="4"/>
<rect class="pr-slot" x="60" y="56" width="22" height="10" rx="3"/>
<rect class="pr-rail" x="38" y="10" width="4" height="110" rx="2"/><rect class="pr-rail" x="258" y="10" width="4" height="110" rx="2"/>${edge(true)}`);
}

function backBody() {
  const chips = [[70, 18, 18, 14], [140, 18, 16, 16], [168, 40, 14, 12], [90, 40, 20, 12]]
    .map(([x, y, w, h]) => `<rect class="pr-chip" x="${x}" y="${y}" width="${w}" height="${h}" rx="2"/>`).join('');
  return wrap(`<rect class="pr-dark-plastic" x="40" y="0" width="220" height="130" rx="10"/>
<rect class="pr-cavity" x="46" y="6" width="208" height="118" rx="7"/>
<rect class="pr-pcb" x="52" y="8" width="196" height="56" rx="6"/>
<path class="pr-trace" d="M60 30h20M130 14v10M170 60h20M236 20v20M100 58h30"/>${chips}
${Object.values(CONNS).map(([x, y]) => socket(x, y)).join('')}
<rect class="pr-rail" x="38" y="10" width="4" height="110" rx="2"/><rect class="pr-rail" x="258" y="10" width="4" height="110" rx="2"/>${edge(false)}`);
}

const SCREEN = { x: 56, y: 14, w: 188, h: 102, rx: 3 };

/** Контроллер: лицевая сторона — стик и кнопки, обратная — гладкая с кнопками SL/SR. */
function joy(left, s) {
  const id = left ? 'joyL' : 'joyR';
  const x = left ? 0 : 260;
  const d = left
    ? 'M40 0H24A24 24 0 0 0 0 24V106A24 24 0 0 0 24 130H40Z'
    : 'M260 0H276A24 24 0 0 1 300 24V106A24 24 0 0 1 276 130H260Z';
  const stickY = left ? 34 : 82;
  const btnY = left ? 82 : 40;
  const face = `<g class="pr-face-front">
<circle class="pr-stick-cap" cx="${x + 20}" cy="${stickY}" r="10"/><circle class="pr-stick-top" cx="${x + 20}" cy="${stickY}" r="6"/>
${[[0, -9], [9, 0], [0, 9], [-9, 0]].map(([dx, dy]) => `<circle class="pr-abxy" cx="${x + 20 + dx}" cy="${btnY + dy}" r="4"/>`).join('')}
<rect class="pr-mini-btn" x="${left ? 26 : 268}" y="8" width="7" height="3" rx="1.5"/>
${s.parts[id].broken ? `<circle class="pr-worn-ring" cx="${x + 20}" cy="${stickY}" r="8"/>` : ''}</g>
<g class="pr-face-back"><rect class="pr-mini-btn" x="${left ? 36 : 260}" y="30" width="4" height="16" rx="2"/><rect class="pr-mini-btn" x="${left ? 36 : 260}" y="84" width="4" height="16" rx="2"/></g>`;
  return `<path class="pr-joy pr-joy-${left ? 'l' : 'r'}" d="${d}"/>${face}`;
}

const DRAW = {
  joyL: (s) => joy(true, s),
  joyR: (s) => joy(false, s),
  shell: () => `<rect class="pr-dark-plastic pr-shell" x="40" y="0" width="220" height="130" rx="10"/>
<g class="pr-vent">${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => `<rect x="${100 + k * 10}" y="8" width="5" height="16" rx="2.5"/>`).join('')}</g>
<rect class="pr-kickstand" x="86" y="88" width="128" height="34" rx="4"/>
<text class="pr-brand-dark" x="150" y="62" text-anchor="middle">СВИЧЕР</text>
${Object.values(SCREWS).map(([x, y]) => hole(x, y)).join('')}
<rect class="pr-cover-gap" x="252" y="24" width="5" height="82" rx="2.5"/><ellipse class="pr-bulge" cx="150" cy="80" rx="70" ry="34"/>`,
  battery: (s) => `<path class="pr-battery" d="${s.parts.battery.broken === 'swollen'
    ? 'M90 66h120c8 0 10 4 11 10 2 14 2 28 0 38-1 6-3 8-11 8H90c-8 0-10-2-11-8-2-10-2-24 0-38 1-6 3-10 11-10Z'
    : 'M86 64h128a6 6 0 0 1 6 6v46a6 6 0 0 1-6 6H86a6 6 0 0 1-6-6V70a6 6 0 0 1 6-6Z'}"/>
<rect class="pr-battery-label" x="96" y="74" width="80" height="38" rx="3"/>
<text class="pr-battery-text" x="102" y="89">3.7 V  4310 mAh</text><text class="pr-battery-text" x="102" y="104">Li-ion</text>
<rect class="pr-flex" x="143" y="58" width="14" height="8" rx="1"/>`,
  fan: () => {
    const blades = [0, 1, 2, 3, 4, 5].map((k) => `<path class="pr-blade" transform="rotate(${k * 60} 83 35)" d="M83 35c3-9 10-14 16-12-2 6-8 10-16 12Z"/>`).join('');
    return `<rect class="pr-fan-box" x="60" y="12" width="46" height="46" rx="8"/><circle class="pr-fan-ring" cx="83" cy="35" r="19"/>
<g class="pr-fan-blades">${blades}</g><circle class="pr-fan-hub" cx="83" cy="35" r="5"/>
<g class="pr-dust"><circle cx="72" cy="28" r="4"/><circle cx="94" cy="44" r="4.5"/><circle cx="80" cy="48" r="3"/><circle cx="96" cy="22" r="3"/></g>`;
  },
  cart: (s) => `<rect class="pr-cart-reader" x="196" y="4" width="50" height="32" rx="4"/><rect class="pr-cart-mouth" x="202" y="4" width="38" height="6" rx="2"/>
<rect class="pr-gold-strip" x="206" y="14" width="30" height="5"/>
${s.parts.cart.broken ? '<path class="pr-scorch" d="M210 22c4-4 12-3 14 2s-4 9-9 8-8-6-5-10Z"/>' : ''}
<rect class="pr-flex" x="206" y="34" width="10" height="8" rx="1"/>`,
  display: (s) => {
    const icons = [0, 1, 2, 3, 4, 5].map((k) => `<circle class="pr-app pr-app-${(k * 5) % 8}" cx="${94 + k * 22}" cy="102" r="7"/>`).join('');
    const tiles = [0, 1, 2, 3].map((k) => `<rect class="pr-tile pr-app-${(k * 3 + 1) % 8}" x="${64 + k * 44}" y="40" width="40" height="40" rx="3"/>`).join('');
    const home = `<rect x="56" y="14" width="188" height="102" class="pr-ui-light"/>
<circle class="pr-ui-avatar" cx="70" cy="26" r="6"/><text class="pr-ui-time pr-ui-time-dark" x="236" y="28" text-anchor="end">12:30</text>
${tiles}<rect class="pr-cursor" x="62" y="38" width="44" height="44" rx="5"/>${icons}`;
    return `<rect class="pr-glass" x="48" y="8" width="204" height="114" rx="6" fill="url(#pr-g-glass)"/>
${screenStates(SCREEN, s, home)}
<rect class="pr-glass-edge" x="48.5" y="8.5" width="203" height="113" rx="5.5"/>
<rect class="pr-heat" x="48" y="8" width="204" height="114" rx="6"/>`;
  },
};

const at = (o) => Object.fromEntries(Object.entries(o).map(([k, [x, y]]) => [k, pt(x, y)]));

export default {
  kind: 'switch',
  origin: [180, 105],
  DISHES: [[6, 186, 226, 248], [238, 186, 116, 248]],
  MAT: { x: 242, y: 190, w: 108, h: 62 },
  MAT_CELL: { h1: [270, 207], h2: [322, 207], h3: [270, 235], h4: [322, 235] },
  BOX: {
    joyL: box(0, 0, 40, 130),
    joyR: box(260, 0, 40, 130),
    shell: box(40, 0, 220, 130),
    display: box(48, 8, 204, 114),
    battery: box(80, 64, 140, 58),
    fan: box(60, 12, 46, 46),
    cart: box(196, 4, 50, 38),
  },
  SCREEN: box(SCREEN.x, SCREEN.y, SCREEN.w, SCREEN.h),
  TRAY: {
    shell: { cx: 119, cy: 236, w: 200, h: 88 },
    display: { cx: 119, cy: 322, w: 200, h: 68 },
    battery: { cx: 62, cy: 396, w: 96, h: 42 },
    fan: { cx: 146, cy: 396, w: 42, h: 42 },
    cart: { cx: 200, cy: 396, w: 46, h: 36 },
    joyL: { cx: 270, cy: 334, w: 40, h: 120 },
    joyR: { cx: 322, cy: 334, w: 40, h: 120 },
  },
  SCREW_AT: at(SCREWS),
  CONN_AT: at(CONNS),
  SPOT_AT: { jack: pt(150, 128), fan: pt(83, 35), slot: { front: pt(228, 0), back: pt(72, 0) } },
  SPOT_BOX: { slot: { front: box(200, -12, 56, 22), back: box(44, -12, 56, 22) } },
  JACK: { back: box(133, 118, 34, 24), front: box(133, 118, 34, 24) },
  BUTTON: { back: box(212, -14, 36, 20), front: box(52, -14, 36, 20) },
  ORDER: { back: ['battery', 'fan', 'cart', 'plugs', 'shell'], front: ['display'], edge: ['joyL', 'joyR'] },
  backBody,
  frontBody,
  part: (id, s) => wrap(DRAW[id](s)),
  plug: (id) => wrap(plugBody(...CONNS[id], FLEX[id])),
  screw: (id) => wrap(screwHead(...SCREWS[id])),
};
