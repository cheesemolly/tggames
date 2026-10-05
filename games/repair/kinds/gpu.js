// Видеокарта 320×130 (сверху сцены, лотки снизу). Спереди — кожух на 4 винтах, под ним вентиляторы (шлейф),
// радиатор на 2 винтах, под ним чип с термопастой и память. Сзади — пластина. Контакты PCIe — на нижнем крае.

import { frame, screwHead, hole, plugBody, socket, fanAt, dustAt, stickyAt, scorch, LANDSCAPE, trayLayout } from '../scene.js';

const F = frame(20, 40);
const { box, pt, wrap } = F;

const SCREWS = { g1: [10, 10], g2: [310, 10], g3: [10, 110], g4: [310, 110], k1: [60, 60], k2: [260, 60] };
const CONNS = { fan: [160, 16] };
const fingers = (x0) => `<rect class="pr-gold-strip" x="${x0}" y="120" width="160" height="10" rx="1"/>`
  + `<g class="pr-spot" data-spot="jack"><rect class="pr-oxide" x="${x0 + 30}" y="121" width="60" height="8"/></g>`;

export default {
  kind: 'gpu',
  origin: [180, 105],
  ...trayLayout(LANDSCAPE, { shroud: 'A1', heatsink: 'A2', fan: 'C3', vram: 'B2' }, ['g1', 'g2', 'g3', 'g4', 'k1', 'k2']),
  BOX: {
    shroud: box(0, 0, 320, 120),
    fan: box(46, 12, 228, 96),
    heatsink: box(10, 10, 300, 100),
    vram: box(112, 28, 96, 64),
  },
  CONN_AT: { fan: pt(...CONNS.fan) },
  SCREW_AT: Object.fromEntries(Object.entries(SCREWS).map(([k, v]) => [k, pt(...v)])),
  SPOT_AT: { jack: { front: pt(100, 125), back: pt(220, 125) }, paste: pt(160, 60) },
  SPOT_BOX: { paste: { front: box(138, 38, 44, 44) } },
  JACK: { front: box(20, 114, 160, 24), back: box(140, 114, 160, 24) },
  BUTTON: { front: null, back: null },
  ORDER: { front: ['vram', 'heatsink', 'fan', 'plugs', 'shroud'], back: [] },
  backBody: () => wrap(`<rect class="pr-pcb" x="0" y="0" width="320" height="122" rx="4"/><rect class="pr-metal" x="6" y="4" width="308" height="112" rx="4" fill="url(#pr-g-metal)"/>
<text class="pr-stamp" x="160" y="66" text-anchor="middle">BACKPLATE</text>${fingers(140)}`),
  frontBody: () => wrap(`<rect class="pr-pcb" x="0" y="0" width="320" height="122" rx="4"/><path class="pr-trace" d="M20 30h60v20M240 90h60M30 100h80"/>
${[[118, 32], [118, 66], [190, 32], [190, 66]].map(([x, y]) => `<rect class="pr-vram-pad" x="${x}" y="${y}" width="16" height="22" rx="1"/>`).join('')}
<rect class="pr-die" x="144" y="42" width="32" height="32" rx="2"/>${stickyAt('paste', 160, 58, 0.7)}${socket(...CONNS.fan)}${fingers(20)}`),
  part: (id, s) => wrap({
    shroud: () => `<rect class="pr-dark-plastic pr-shell" x="0" y="0" width="320" height="120" rx="8"/>
<circle class="pr-shroud-hole" cx="100" cy="60" r="46"/><circle class="pr-shroud-hole" cx="220" cy="60" r="46"/>
${fanAt(100, 60, 38, false, 'none')}${fanAt(220, 60, 38, false, 'none')}
<path class="pr-shroud-line" d="M156 10l8 100"/><text class="pr-brand-dark" x="290" y="64" text-anchor="middle">GPU</text>
${Object.entries(SCREWS).filter(([k]) => k.startsWith('g')).map(([, [x, y]]) => hole(x, y)).join('')}`,
    fan: () => `${fanAt(100, 60, 40, Boolean(s.parts.fan.broken))}${fanAt(220, 60, 40, false)}<rect class="pr-flex" x="150" y="14" width="20" height="8" rx="2"/>`,
    heatsink: () => `<rect class="pr-heatsink" x="10" y="10" width="300" height="100" rx="4"/>
${Array.from({ length: 28 }, (_, k) => `<rect class="pr-fin" x="${16 + k * 10.6}" y="14" width="4" height="92" rx="1"/>`).join('')}
<rect class="pr-heatpipe" x="20" y="54" width="280" height="10" rx="5"/>${hole(...SCREWS.k1, 4)}${hole(...SCREWS.k2, 4)}${dustAt('heatsink', 160, 30, 1.2)}`,
    vram: () => `${[[118, 32], [118, 66], [190, 32], [190, 66]].map(([x, y]) => `<rect class="pr-chip" x="${x}" y="${y}" width="16" height="22" rx="1"/>`).join('')}
${s.parts.vram.broken ? scorch(126, 76, 0.7) : ''}`,
  }[id]()),
  plug: (id) => wrap(plugBody(...CONNS[id], 'down')),
  screw: (id) => wrap(screwHead(...SCREWS[id])),
};
