// Ноутбук 300×180 (открытый, вид сверху; лотки снизу). Спереди — экран на клею и клавиатура (липкий чай — спирт).
// Сзади — крышка экрана с логотипом и дно на 4 винтах: батарея, вентилятор, память, диск на винте, разъёмы.

import { frame, screwHead, hole, plugBody, socket, jackMark, pcb, cell, fanAt, stickyAt, screenStates, homeTiles, logo, LANDSCAPE, trayLayout } from '../scene.js';

const F = frame(30, 20);
const { box, pt, wrap } = F;

const SCREWS = { h1: [10, 106], h2: [290, 106], h3: [10, 172], h4: [290, 172], d1: [282, 160] };
const CONNS = { fan: [74, 116], disp: [118, 104], bat: [158, 124], kbd: [200, 104] };
const SCREEN = { x: 16, y: 10, w: 268, h: 76, rx: 3 };
const KEYS = [];
for (let r = 0; r < 4; r++) for (let c = 0; c < 13; c++) KEYS.push([24 + c * 19.5, 106 + r * 12.5]);

export default {
  kind: 'laptop',
  origin: [180, 110],
  ...trayLayout(LANDSCAPE, { bottom: 'A1', display: 'A2', keypad: 'C3', battery: 'B1', fan: 'B2', ram: 'C1', ssd: 'C2' }, ['h1', 'h2', 'h3', 'h4', 'd1']),
  BOX: {
    display: box(8, 4, 284, 88),
    keypad: box(18, 102, 264, 52),
    bottom: box(0, 96, 300, 84),
    battery: box(96, 130, 116, 44),
    fan: box(30, 106, 44, 44),
    ram: box(226, 106, 52, 22),
    ssd: box(234, 150, 52, 18),
  },
  SCREEN: box(SCREEN.x, SCREEN.y, SCREEN.w, SCREEN.h),
  CONN_AT: Object.fromEntries(Object.entries(CONNS).map(([k, v]) => [k, pt(...v)])),
  SCREW_AT: Object.fromEntries(Object.entries(SCREWS).map(([k, v]) => [k, pt(...v)])),
  SPOT_AT: { jack: { front: pt(0, 150), back: pt(300, 150) } },
  JACK: { front: box(-12, 136, 24, 28), back: box(288, 136, 24, 28) },
  BUTTON: { front: box(268, 94, 30, 16), back: null },
  ORDER: { back: ['ram', 'ssd', 'fan', 'battery', 'plugs', 'bottom'], front: ['display', 'keypad'] },
  backBody: (s) => wrap(`<rect class="pr-plastic" x="0" y="0" width="300" height="94" rx="8" fill="url(#pr-g-plastic)"/>
<g class="pr-logo" transform="translate(150 46) scale(0.6) translate(-90 -166)">${logo(s.model.logo)}</g>
<rect class="pr-body" x="0" y="96" width="300" height="84" rx="8"/><rect class="pr-cavity" x="6" y="100" width="288" height="76" rx="5"/>
${pcb(80, 100, 140, 26, 3)}${Object.values(CONNS).map(([x, y]) => socket(x, y)).join('')}${jackMark(300, 150, 4, 14)}`),
  frontBody: () => wrap(`<rect class="pr-plastic" x="0" y="0" width="300" height="94" rx="8" fill="url(#pr-g-plastic)"/><rect class="pr-midframe" x="8" y="4" width="284" height="88" rx="4"/>
<rect class="pr-plastic" x="0" y="96" width="300" height="84" rx="8" fill="url(#pr-g-plastic)"/><rect class="pr-kbd-well" x="18" y="102" width="264" height="52" rx="3"/>
<rect class="pr-touchpad" x="116" y="158" width="68" height="18" rx="4"/><rect class="pr-side-btn" x="276" y="98" width="14" height="6" rx="3"/>${jackMark(0, 150, 4, 14)}`),
  part: (id, s) => wrap({
    display: () => `<rect class="pr-glass" x="8" y="4" width="284" height="88" rx="4" fill="url(#pr-g-glass)"/>
${screenStates(SCREEN, s, `${homeTiles(SCREEN.x, SCREEN.y, SCREEN.w, SCREEN.h, 10)}<rect class="pr-taskbar" x="16" y="78" width="268" height="8"/>`)}
<circle class="pr-front-cam" cx="150" cy="7" r="1.6"/><rect class="pr-heat" x="8" y="4" width="284" height="88" rx="4"/>`,
    keypad: () => `${KEYS.map(([x, y]) => `<rect class="pr-keycap pr-keycap-flat" x="${x}" y="${y}" width="16" height="10" rx="2"/>`).join('')}
${stickyAt('keys', 120, 124, 1)}${s.parts.keypad.broken ? '<path class="pr-key-worn" d="M60 110h8M140 122h8M200 134h8"/>' : ''}`,
    bottom: () => `<rect class="pr-body pr-shell" x="0" y="96" width="300" height="84" rx="8"/>
<g class="pr-vent">${Array.from({ length: 12 }, (_, k) => `<rect x="${40 + k * 8}" y="112" width="4" height="22" rx="2"/>`).join('')}</g>
<rect class="pr-foot" x="20" y="164" width="50" height="8" rx="4"/><rect class="pr-foot" x="230" y="164" width="50" height="8" rx="4"/>
${['h1', 'h2', 'h3', 'h4'].map((k) => hole(...SCREWS[k])).join('')}`,
    battery: () => `${cell(96, 130, 116, 44, s, 'battery', '56 Wh')}<rect class="pr-flex" x="151" y="122" width="14" height="10" rx="1"/>`,
    fan: () => `${fanAt(52, 128, 17, Boolean(s.parts.fan.broken))}<rect class="pr-flex" x="68" y="112" width="8" height="8" rx="1"/>`,
    ram: () => `<rect class="pr-ram" x="226" y="106" width="52" height="22" rx="2"/>${[0, 1, 2].map((k) => `<rect class="pr-chip" x="${230 + k * 16}" y="110" width="12" height="14" rx="1"/>`).join('')}
${s.parts.ram.broken ? '<path class="pr-scorch" d="M234 112c4-4 12-3 12 2s-4 8-8 7-6-6-4-9Z"/>' : ''}`,
    ssd: () => `<rect class="pr-ssd" x="234" y="150" width="52" height="18" rx="2"/><rect class="pr-chip" x="242" y="153" width="16" height="12" rx="1"/>${hole(...SCREWS.d1, 3.5)}
${s.parts.ssd.broken ? '<path class="pr-scorch" d="M246 154c4-4 12-3 12 2s-4 8-8 7-6-6-4-9Z"/>' : ''}`,
  }[id]()),
  plug: (id) => wrap(plugBody(...CONNS[id], id === 'bat' ? 'down' : 'down')),
  screw: (id) => wrap(screwHead(...SCREWS[id])),
};
