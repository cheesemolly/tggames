// Ноутбук (сверху сцены, лотки снизу). Спереди — открытый ноутбук: крышка с экраном на клею стоит над петлёй, ниже —
// корпус с клавиатурой в перспективе (липкий чай — спирт), тачпад, кнопка питания справа от клавиатуры. Крышка
// открывается и закрывается касанием (закрытая — экран складывается к петле, сверху видна крышка с логотипом).
// Сзади — дно на 4 винтах: батарея, вентилятор, память, диск на винте, разъёмы на плате.

import { frame, screwHead, hole, plugBody, socket, jackMark, pcb, cell, fanAt, stickyAt, screenStates, homeTiles, logo, LANDSCAPE, trayLayout } from '../scene.js';

const F = frame(30, 12);
const { box, pt, wrap } = F;

const SCREWS = { h1: [12, 40], h2: [288, 40], h3: [12, 176], h4: [288, 176], d1: [282, 132] };
const CONNS = { fan: [76, 92], disp: [110, 52], bat: [150, 98], kbd: [190, 52] };
const SCREEN = { x: 42, y: 10, w: 216, h: 104, rx: 2 };
const HINGE = 127;
const DECK = 'M30 131H270L298 188H2Z';

/** Клавиши в перспективе: ряды сужаются кверху. */
function keys(s) {
  let out = '';
  const rows = 5;
  for (let r = 0; r < rows; r++) {
    const y0 = 136 + r * 6.2;
    const t = (y0 - 131) / 57;
    const left = 46 - t * 24;
    const right = 254 + t * 24;
    const n = 14;
    const kw = (right - left) / n;
    if (r === rows - 1) {
      out += `<rect class="pr-keycap pr-keycap-flat" x="${(left + kw * 4).toFixed(1)}" y="${y0.toFixed(1)}" width="${(kw * 6 - 1).toFixed(1)}" height="5" rx="1"/>`;
      continue;
    }
    for (let k = 0; k < n; k++) out += `<rect class="pr-keycap pr-keycap-flat" x="${(left + k * kw).toFixed(1)}" y="${y0.toFixed(1)}" width="${(kw - 1.2).toFixed(1)}" height="5" rx="1"/>`;
  }
  return out + stickyAt('keys', 150, 150, 0.9)
    + (s.parts.keypad.broken ? '<path class="pr-key-worn" d="M80 142h8M140 148h8M200 154h8"/>' : '');
}

function frontBody() {
  return wrap(`<g class="pr-lid-swing"><rect class="pr-plastic" x="30" y="0" width="240" height="${HINGE}" rx="9" fill="url(#pr-g-plastic)"/>
<rect class="pr-midframe" x="36" y="5" width="228" height="114" rx="4"/><rect class="pr-glue" x="40" y="8" width="220" height="108" rx="3"/></g>
<rect class="pr-hinge" x="44" y="${HINGE - 2}" width="212" height="6" rx="3"/>
<path class="pr-plastic" d="${DECK}" fill="url(#pr-g-plastic)"/><path class="pr-deck-edge" d="M2 188H298"/>
<path class="pr-kbd-well" d="M48 134H252L262 166H38Z"/>
<path class="pr-touchpad" d="M124 170H176L180 184H120Z"/>
<rect class="pr-power-key" x="258" y="134" width="12" height="5" rx="2.5"/><circle class="pr-led-dot" cx="264" cy="143" r="1.2"/>
<path class="pr-side-port" d="M14.5 158L12 163.5H15.5L18 158Z"/>${jackMark(10, 176, 3, 7)}`);
}

/** Закрытая крышка: лежит на корпусе (видна сверху), с логотипом. */
function frontTop(s) {
  return wrap(`<g class="pr-lid-top"><path class="pr-plastic" d="M34 128H266L292 186H8Z" fill="url(#pr-g-plastic)"/>
<path class="pr-sheen" d="M40 140L260 132l8 14L32 156Z"/><g class="pr-logo" transform="translate(150 158) scale(0.42 0.3) translate(-90 -166)">${logo(s.model.logo)}</g>
<path class="pr-lid-lip" d="M128 185h44"/></g>`);
}

function backBody() {
  return wrap(`<rect class="pr-body" x="0" y="30" width="300" height="156" rx="10"/><rect class="pr-cavity" x="7" y="36" width="286" height="144" rx="6"/>
${pcb(70, 40, 160, 46, 4, 4)}${Object.values(CONNS).map(([x, y]) => socket(x, y)).join('')}
<rect class="pr-side-port" x="295" y="164" width="5" height="10" rx="1"/>${jackMark(297, 178, 2, 6)}`);
}

export default {
  kind: 'laptop',
  origin: [180, 112],
  ...trayLayout(LANDSCAPE, { bottom: 'A1', display: 'A2', keypad: 'C3', battery: 'B1', fan: 'B2', ram: 'C1', ssd: 'C2' }, ['h1', 'h2', 'h3', 'h4', 'd1']),
  BOX: {
    display: box(36, 5, 228, 114),
    keypad: box(38, 134, 224, 32),
    bottom: box(0, 30, 300, 156),
    battery: box(90, 106, 120, 64),
    fan: box(16, 52, 48, 48),
    ram: box(236, 44, 52, 22),
    ssd: box(234, 122, 54, 20),
  },
  LID: { closed: box(8, 124, 284, 64), open: box(30, -8, 240, 24) },
  SCREEN: box(SCREEN.x, SCREEN.y, SCREEN.w, SCREEN.h),
  CONN_AT: Object.fromEntries(Object.entries(CONNS).map(([k, v]) => [k, pt(...v)])),
  SCREW_AT: Object.fromEntries(Object.entries(SCREWS).map(([k, v]) => [k, pt(...v)])),
  SPOT_AT: { jack: { front: pt(10, 176), back: pt(297, 176) } },
  JACK: { front: box(-4, 162, 28, 28), back: box(288, 160, 24, 28) },
  BUTTON: { front: box(254, 128, 22, 16), back: null },
  ORDER: { back: ['ram', 'ssd', 'fan', 'battery', 'plugs', 'bottom'], front: ['display', 'keypad'] },
  backBody,
  frontBody,
  frontTop,
  part: (id, s) => wrap({
    display: () => `<rect class="pr-glass" x="36" y="5" width="228" height="114" rx="4" fill="url(#pr-g-glass)"/>
${screenStates(SCREEN, s, `${homeTiles(SCREEN.x, SCREEN.y, SCREEN.w, SCREEN.h, 12)}<rect class="pr-taskbar" x="42" y="104" width="216" height="10"/>`)}
<circle class="pr-front-cam" cx="150" cy="8" r="1.6"/><rect class="pr-heat" x="36" y="5" width="228" height="114" rx="4"/>`,
    keypad: () => keys(s),
    bottom: () => `<rect class="pr-body pr-shell" x="0" y="30" width="300" height="156" rx="10"/>
<g class="pr-vent">${Array.from({ length: 16 }, (_, k) => `<rect x="${40 + k * 7}" y="54" width="3.5" height="30" rx="1.75"/>`).join('')}</g>
<rect class="pr-foot" x="22" y="164" width="60" height="9" rx="4.5"/><rect class="pr-foot" x="218" y="164" width="60" height="9" rx="4.5"/>
<rect class="pr-foot" x="22" y="42" width="40" height="7" rx="3.5"/><rect class="pr-foot" x="238" y="42" width="40" height="7" rx="3.5"/>
<rect class="pr-sticker" x="168" y="116" width="76" height="30" rx="3"/><text class="pr-sticker-text" x="206" y="134" text-anchor="middle">${s.model.code}</text>
${['h1', 'h2', 'h3', 'h4'].map((k) => hole(...SCREWS[k])).join('')}`,
    battery: () => `${cell(90, 106, 120, 64, s, 'battery', '56 Wh')}<rect class="pr-flex" x="143" y="96" width="14" height="12" rx="1"/>`,
    fan: () => `${fanAt(40, 76, 20, Boolean(s.parts.fan.broken))}<rect class="pr-flex" x="62" y="86" width="12" height="8" rx="1"/>`,
    ram: () => `<rect class="pr-ram" x="236" y="44" width="52" height="22" rx="2"/>${[0, 1, 2].map((k) => `<rect class="pr-chip" x="${240 + k * 16}" y="48" width="12" height="14" rx="1"/>`).join('')}
<rect class="pr-gold-strip" x="236" y="62" width="52" height="4"/>${s.parts.ram.broken ? '<path class="pr-scorch" d="M244 50c4-4 12-3 12 2s-4 8-8 7-6-6-4-9Z"/>' : ''}`,
    ssd: () => `<rect class="pr-ssd" x="234" y="122" width="54" height="20" rx="2"/><rect class="pr-chip" x="240" y="126" width="16" height="12" rx="1"/><rect class="pr-chip" x="260" y="127" width="12" height="10" rx="1"/>${hole(...SCREWS.d1, 3.5)}
${s.parts.ssd.broken ? '<path class="pr-scorch" d="M246 126c4-4 12-3 12 2s-4 8-8 7-6-6-4-9Z"/>' : ''}`,
  }[id]()),
  plug: (id) => wrap(plugBody(...CONNS[id], 'down')),
  screw: (id) => wrap(screwHead(...SCREWS[id])),
};
