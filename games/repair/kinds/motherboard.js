// Материнская плата 180×300: сокет процессора, слот памяти с планкой, батарейка BIOS, радиатор питания на 2 винтах,
// под ним конденсатор (вздутый — выпуклый). Пролитый кофе — на плате (спирт). Гнездо USB — на левом краю.

import { frame, screwHead, hole, jackMark, corrosion, dustAt, PORTRAIT, trayLayout } from '../scene.js';

const F = frame(90, 70);
const { box, pt, wrap } = F;

const SCREWS = { k1: [38, 26], k2: [38, 112] };

export default {
  kind: 'motherboard',
  origin: [180, 220],
  ...trayLayout(PORTRAIT, { ram: 'L1', heatsink: 'R1', cmos: 'R2', cap: 'R3' }, ['k1', 'k2']),
  BOX: {
    cmos: box(30, 214, 32, 32),
    ram: box(136, 30, 18, 170),
    heatsink: box(20, 16, 36, 104),
    cap: box(26, 50, 24, 24),
    board: box(64, 200, 108, 84),
  },
  CONN_AT: {},
  SCREW_AT: Object.fromEntries(Object.entries(SCREWS).map(([k, v]) => [k, pt(...v)])),
  SPOT_AT: { jack: { front: pt(0, 262), back: pt(180, 262) }, board: pt(118, 246) },
  JACK: { front: box(-12, 246, 24, 32), back: box(168, 246, 24, 32) },
  BUTTON: { front: null, back: null },
  ORDER: { front: ['cap', 'heatsink', 'ram', 'cmos'], back: [] },
  backBody: () => wrap(`<rect class="pr-pcb" x="0" y="0" width="180" height="300" rx="6"/>
${Array.from({ length: 40 }, (_, k) => `<circle class="pr-solder" cx="${12 + (k % 8) * 22}" cy="${16 + Math.floor(k / 8) * 60}" r="2"/>`).join('')}
<rect class="pr-usb" x="168" y="250" width="12" height="24" rx="2"/>`),
  frontBody: () => wrap(`<rect class="pr-pcb" x="0" y="0" width="180" height="300" rx="6"/>
<path class="pr-trace" d="M70 120h50v40M20 150h60v60M100 200v80M140 210h30"/>
<rect class="pr-socket-cpu" x="64" y="30" width="62" height="62" rx="3"/><rect class="pr-chip" x="76" y="42" width="38" height="38" rx="2"/>
<rect class="pr-slot-ram" x="134" y="26" width="22" height="178" rx="3"/><rect class="pr-chip" x="80" y="130" width="30" height="30" rx="2"/>
<rect class="pr-pcie" x="14" y="160" width="110" height="10" rx="2"/><circle class="pr-cmos-holder" cx="46" cy="230" r="17"/>
<rect class="pr-usb" x="0" y="250" width="12" height="24" rx="2"/>${jackMark(6, 262, 6, 18)}
<circle class="pr-cap" cx="38" cy="62" r="10"/>${corrosion(118, 246, 0.9)}`),
  part: (id, s) => wrap({
    cmos: () => `<circle class="pr-coin" cx="46" cy="230" r="15"/><text class="pr-coin-text" x="46" y="234" text-anchor="middle">CR2032</text>
${s.parts.cmos.broken ? '<circle class="pr-worn-ring" cx="46" cy="230" r="12"/>' : ''}`,
    ram: () => `<rect class="pr-ram" x="136" y="30" width="18" height="170" rx="2"/>${[0, 1, 2, 3, 4, 5].map((k) => `<rect class="pr-chip" x="139" y="${38 + k * 26}" width="12" height="18" rx="1"/>`).join('')}
<rect class="pr-gold-strip" x="136" y="196" width="18" height="4"/>${s.parts.ram.broken ? '<path class="pr-scorch" d="M139 92c4-4 12-3 12 2s-4 8-8 7-6-6-4-9Z"/>' : ''}`,
    heatsink: () => `<rect class="pr-metal" x="20" y="16" width="36" height="104" rx="4" fill="url(#pr-g-metal)"/>
${[0, 1, 2, 3, 4, 5, 6, 7].map((k) => `<rect class="pr-fin" x="22" y="${32 + k * 9}" width="32" height="3" rx="1"/>`).join('')}
${hole(...SCREWS.k1, 4)}${hole(...SCREWS.k2, 4)}${dustAt('heatsink', 38, 70, 0.9)}`,
    cap: () => `<circle class="pr-cap" cx="38" cy="62" r="11"/><path class="pr-cap-cross" d="M33 62h10M38 57v10"/>
${s.parts.cap.broken ? '<circle class="pr-cap-bulge" cx="38" cy="62" r="7"/>' : ''}`,
  }[id]()),
  plug: () => '',
  screw: (id) => wrap(screwHead(...SCREWS[id])),
};
