// Процессор с кулером 160×160. Спереди — кулер на 4 винтах (пыль, скрежет), под ним крышка процессора и
// термопаста (спирт). Сзади — ножки: погнутые выпрямляют пинцетом.

import { frame, screwHead, hole, fanAt, stickyAt, PORTRAIT, trayLayout } from '../scene.js';

const F = frame(100, 140);
const { box, pt, wrap } = F;

const SCREWS = { c1: [12, 12], c2: [148, 12], c3: [12, 148], c4: [148, 148] };
const pins = () => {
  let out = '';
  for (let r = 0; r < 12; r++) for (let c = 0; c < 12; c++) out += `<circle class="pr-pin" cx="${26 + c * 10}" cy="${26 + r * 10}" r="2"/>`;
  return out;
};

export default {
  kind: 'cpu',
  origin: [180, 220],
  ...trayLayout(PORTRAIT, { cooler: 'L1' }, ['c1', 'c2', 'c3', 'c4']),
  BOX: { cooler: box(0, 0, 160, 160) },
  CONN_AT: {},
  SCREW_AT: Object.fromEntries(Object.entries(SCREWS).map(([k, v]) => [k, pt(...v)])),
  SPOT_AT: { paste: pt(80, 80), pins: pt(80, 80) },
  SPOT_BOX: { paste: { front: box(40, 40, 80, 80) }, pins: { back: box(20, 20, 120, 120) } },
  BUTTON: { front: null, back: null },
  ORDER: { front: ['cooler'], back: [] },
  backBody: () => wrap(`<rect class="pr-cpu-sub" x="10" y="10" width="140" height="140" rx="6"/>${pins()}
<g class="pr-spot" data-spot="pins"><path class="pr-bent" d="M64 66l6-4M74 66l-2-6M84 76l6 2M94 86l-4 5"/></g>
<path class="pr-cpu-mark" d="M14 140l10 0-10-10Z"/>`),
  frontBody: (s) => wrap(`<rect class="pr-cpu-sub" x="10" y="10" width="140" height="140" rx="6"/><rect class="pr-ihs" x="30" y="30" width="100" height="100" rx="8"/>
<text class="pr-ihs-text" x="80" y="74" text-anchor="middle">${s.model.name}</text><text class="pr-ihs-text pr-ihs-small" x="80" y="92" text-anchor="middle">${s.model.code}</text>
${stickyAt('paste', 80, 80, 1.3)}`),
  part: (id, s) => wrap({
    cooler: () => `<rect class="pr-heatsink" x="0" y="0" width="160" height="160" rx="10"/>${fanAt(80, 80, 62, Boolean(s.parts.cooler.broken), 'cooler')}
${Object.values(SCREWS).map(([x, y]) => hole(x, y)).join('')}`,
  }[id]()),
  plug: () => '',
  screw: (id) => wrap(screwHead(...SCREWS[id])),
};
