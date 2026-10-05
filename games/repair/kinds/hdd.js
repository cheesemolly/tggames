// Жёсткий диск 260×170 (сверху сцены, лотки снизу). Сверху — крышка на 4 винтах, под ней блок головок (шлейф)
// и пластина; снизу — плата контроллера на 3 винтах. SATA-разъём — на правом торце (сзади — слева).

import { frame, screwHead, hole, plugBody, socket, pcb, scorch, LANDSCAPE, trayLayout } from '../scene.js';

const F = frame(50, 30);
const { box, pt, wrap } = F;

const SCREWS = { h1: [14, 14], h2: [246, 14], h3: [14, 156], h4: [246, 156], p1: [30, 52], p2: [230, 52], p3: [130, 142] };
const CONNS = { arm: [222, 40] };
const sata = (x) => `<rect class="pr-sata" x="${x}" y="70" width="10" height="34" rx="2"/><g class="pr-lint"><path d="M${x + 2} 76l4 6-3 6 4 6"/></g>`;

export default {
  kind: 'hdd',
  origin: [180, 115],
  ...trayLayout(LANDSCAPE, { lid: 'A1', pcb: 'A2', platter: 'B1', heads: 'B2' }, ['h1', 'h2', 'h3', 'h4', 'p1', 'p2', 'p3']),
  BOX: {
    lid: box(0, 0, 260, 170),
    platter: box(22, 12, 146, 146),
    heads: box(118, 50, 120, 96),
    pcb: box(16, 36, 228, 118),
  },
  CONN_AT: { arm: pt(...CONNS.arm) },
  SCREW_AT: Object.fromEntries(Object.entries(SCREWS).map(([k, v]) => [k, pt(...v)])),
  SPOT_AT: { jack: { front: pt(255, 87), back: pt(5, 87) } },
  JACK: { front: box(244, 64, 26, 46), back: box(-10, 64, 26, 46) },
  BUTTON: { front: null, back: null },
  ORDER: { front: ['platter', 'heads', 'plugs', 'lid'], back: ['pcb'] },
  backBody: () => wrap(`<rect class="pr-metal-casting" x="0" y="0" width="260" height="170" rx="8"/><rect class="pr-cavity" x="12" y="30" width="236" height="130" rx="4"/>${sata(0)}`),
  frontBody: () => wrap(`<rect class="pr-metal-casting" x="0" y="0" width="260" height="170" rx="8"/><rect class="pr-hdd-well" x="10" y="8" width="240" height="154" rx="70"/>
<circle class="pr-spindle" cx="95" cy="85" r="10"/>${socket(...CONNS.arm)}${sata(250)}`),
  part: (id, s) => wrap({
    lid: () => `<rect class="pr-metal pr-lid" x="2" y="2" width="256" height="166" rx="7" fill="url(#pr-g-metal)"/>
<rect class="pr-hdd-label" x="40" y="40" width="150" height="90" rx="4"/><text class="pr-hdd-text" x="56" y="66">${s.model.name}</text><text class="pr-hdd-text pr-hdd-small" x="56" y="84">${s.model.code}</text>
<text class="pr-hdd-text pr-hdd-small" x="56" y="100">7200 RPM · SATA</text>${['h1', 'h2', 'h3', 'h4'].map((k) => hole(...SCREWS[k])).join('')}`,
    platter: () => `<circle class="pr-platter" cx="95" cy="85" r="72"/><circle class="pr-disc-shine" cx="95" cy="85" r="52"/><circle class="pr-umd-hub" cx="95" cy="85" r="12"/>
${s.parts.platter.broken ? '<path class="pr-scratch" d="M60 50a50 50 0 0 1 60-8M50 100a50 50 0 0 0 30 40"/>' : ''}`,
    heads: () => `<circle class="pr-actuator" cx="208" cy="128" r="16"/><path class="pr-arm" d="M208 128L132 70l-4 6 72 58Z"/><rect class="pr-head" x="124" y="64" width="10" height="8" rx="2"/>
<rect class="pr-flex" x="206" y="44" width="10" height="70" rx="2"/>${s.parts.heads.broken ? scorch(140, 74, 0.6) : ''}`,
    pcb: () => `${pcb(16, 36, 228, 118, 6)}${['p1', 'p2', 'p3'].map((k) => hole(...SCREWS[k], 4)).join('')}${s.parts.pcb.broken ? scorch(120, 90, 1.2) : ''}`,
  }[id]()),
  plug: (id) => wrap(plugBody(...CONNS[id], 'down')),
  screw: (id) => wrap(screwHead(...SCREWS[id])),
};
