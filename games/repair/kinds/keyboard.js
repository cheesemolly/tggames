// Механическая клавиатура 330×120 (сверху сцены, лотки снизу). Сверху — колпачки (снимаются), под ними свитчи,
// крошки и липкий чай; снизу дно на 4 винтах, внутри плата и шлейф USB-платы. Гнездо — на заднем торце.

import { frame, screwHead, hole, plugBody, socket, jackMark, pcb, dustAt, stickyAt, LANDSCAPE, trayLayout } from '../scene.js';

const F = frame(15, 50);
const { box, pt, wrap } = F;

const SCREWS = { h1: [12, 12], h2: [318, 12], h3: [12, 108], h4: [318, 108] };
const CONNS = { cab: [165, 40] };
const KEYS = [];
for (let r = 0; r < 4; r++) for (let c = 0; c < 14; c++) KEYS.push([12 + c * 22.5 + (r % 2) * 5, 10 + r * 22]);

export default {
  kind: 'keyboard',
  origin: [180, 110],
  ...trayLayout(LANDSCAPE, { case: 'A1', keycaps: 'A2', pcb: 'C3', cable: 'B1', switch: 'B2' }, ['h1', 'h2', 'h3', 'h4']),
  BOX: {
    keycaps: box(6, 6, 318, 112),
    switch: box(54, 30, 22, 22),
    case: box(0, 0, 330, 120),
    cable: box(150, 0, 30, 34),
    pcb: box(20, 50, 290, 64),
  },
  CONN_AT: { cab: pt(...CONNS.cab) },
  SCREW_AT: Object.fromEntries(Object.entries(SCREWS).map(([k, v]) => [k, pt(...v)])),
  SPOT_AT: { jack: pt(165, 0), crumbs: pt(170, 64), keys: pt(96, 96) },
  SPOT_BOX: { crumbs: { front: box(146, 44, 48, 40) }, keys: { front: box(70, 80, 52, 32) } },
  JACK: { front: box(148, -12, 34, 22), back: box(148, -12, 34, 22) },
  BUTTON: { front: null, back: null },
  ORDER: { back: ['pcb', 'cable', 'plugs', 'case'], front: ['switch', 'keycaps'] },
  backBody: () => wrap(`<rect class="pr-dark-plastic" x="0" y="0" width="330" height="120" rx="10"/><rect class="pr-cavity" x="8" y="8" width="314" height="104" rx="6"/>
${socket(...CONNS.cab)}${jackMark(165, 2, 18, 5)}`),
  frontBody: () => wrap(`<rect class="pr-dark-plastic" x="0" y="0" width="330" height="120" rx="10"/><rect class="pr-plate" x="6" y="6" width="318" height="108" rx="6"/>
${KEYS.map(([x, y]) => `<rect class="pr-switch-stem" x="${x + 5}" y="${y + 5}" width="10" height="10" rx="1.5"/>`).join('')}
${dustAt('crumbs', 170, 64, 1.2)}${stickyAt('keys', 96, 96, 0.9)}${jackMark(165, 2, 18, 5)}`),
  part: (id, s) => wrap({
    keycaps: () => KEYS.map(([x, y], k) => `<rect class="pr-keycap${k % 9 === 4 ? ' pr-keycap-acc' : ''}" x="${x}" y="${y}" width="20" height="20" rx="3.5"/>`).join('')
      + `<rect class="pr-keycap" x="90" y="98" width="150" height="18" rx="3.5"/>${s.parts.keycaps.broken ? '<path class="pr-key-worn" d="M40 20h8M110 42h8M200 64h8"/>' : ''}`,
    switch: () => `<rect class="pr-switch-body" x="54" y="30" width="22" height="22" rx="3"/><rect class="pr-switch-top" x="58" y="34" width="14" height="14" rx="2"/><path class="pr-switch-cross" d="M65 37v8M61 41h8"/>
${s.parts.switch.broken ? '<path class="pr-tear" d="M57 33l6 6-3 3 8 6"/>' : ''}`,
    case: () => `<rect class="pr-dark-plastic pr-shell" x="0" y="0" width="330" height="120" rx="10"/>
<rect class="pr-foot" x="30" y="14" width="40" height="10" rx="5"/><rect class="pr-foot" x="260" y="14" width="40" height="10" rx="5"/><rect class="pr-foot" x="30" y="96" width="40" height="10" rx="5"/><rect class="pr-foot" x="260" y="96" width="40" height="10" rx="5"/>
<rect class="pr-sticker" x="128" y="46" width="74" height="30" rx="4"/><text class="pr-sticker-text" x="165" y="65" text-anchor="middle">${s.model.code}</text>
${Object.values(SCREWS).map(([x, y]) => hole(x, y)).join('')}`,
    cable: () => `<rect class="pr-usb" x="155" y="0" width="20" height="16" rx="4"/><rect class="pr-flex" x="159" y="14" width="12" height="20" rx="2"/>
${s.parts.cable.broken ? '<path class="pr-tear" d="M158 20l8 4-4 3 8 4"/>' : ''}`,
    pcb: () => `${pcb(20, 50, 290, 64, 7)}${s.parts.pcb.broken ? '<path class="pr-scorch" d="M150 72c6-6 18-4 20 4s-6 14-14 12-12-10-6-16Z"/>' : ''}`,
  }[id]()),
  plug: (id) => wrap(plugBody(...CONNS[id], 'up')),
  screw: (id) => wrap(screwHead(...SCREWS[id])),
};
