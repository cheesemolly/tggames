// Геймпад 280×160 (сверху сцены, лотки снизу). Спереди — стики, крестовина, кнопки. Сзади (зеркально: левый стик
// справа) — корпус на 4 винтах; внутри батарея, модули стиков на винтах, вибромотор, липкие кнопки изнутри.

import { frame, screwHead, hole, plugBody, socket, jackMark, pcb, cell, stickyAt, LANDSCAPE, trayLayout } from '../scene.js';

const F = frame(40, 34);
const { box, pt, wrap } = F;

const SHAPE = 'M60 10H220C252 10 270 40 276 80C282 122 270 156 246 156C226 156 214 130 196 120H84C66 130 54 156 34 156C10 156-2 122 4 80C10 40 28 10 60 10Z';
const SCREWS = { h1: [44, 36], h2: [236, 36], h3: [44, 136], h4: [236, 136], l1: [228, 78], r1: [118, 132] };
const CONNS = { bat: [150, 84], stl: [192, 104], str: [104, 80], rmb: [60, 96] };

function stickModule(x, y, id, s, screw) {
  return `<rect class="pr-stick-module" x="${x}" y="${y}" width="44" height="40" rx="5"/><circle class="pr-stick-base" cx="${x + 22}" cy="${y + 20}" r="13"/><circle class="pr-stick-top" cx="${x + 22}" cy="${y + 20}" r="7"/>
${s.parts[id].broken ? `<circle class="pr-worn-ring" cx="${x + 22}" cy="${y + 20}" r="10"/>` : ''}${hole(...screw, 4)}`;
}

export default {
  kind: 'gamepad',
  origin: [180, 117],
  ...trayLayout(LANDSCAPE, { shell: 'A1', battery: 'B1', rumble: 'B2', stickL: 'C1', stickR: 'C2' }, ['h1', 'h2', 'h3', 'h4', 'l1', 'r1']),
  BOX: {
    shell: box(0, 10, 280, 148),
    battery: box(118, 30, 60, 42),
    stickL: box(186, 40, 44, 40),
    stickR: box(76, 94, 44, 40),
    rumble: box(22, 84, 30, 44),
  },
  CONN_AT: Object.fromEntries(Object.entries(CONNS).map(([k, v]) => [k, pt(...v)])),
  SCREW_AT: Object.fromEntries(Object.entries(SCREWS).map(([k, v]) => [k, pt(...v)])),
  SPOT_AT: { jack: pt(140, 10), keys: pt(84, 52) },
  SPOT_BOX: { keys: { back: box(60, 34, 50, 36) } },
  JACK: { front: box(124, -2, 32, 22), back: box(124, -2, 32, 22) },
  BUTTON: { front: box(126, 44, 28, 26), back: null },
  ORDER: { back: ['battery', 'stickL', 'stickR', 'rumble', 'plugs', 'shell'], front: [] },
  backBody: () => wrap(`<path class="pr-dark-plastic" d="${SHAPE}"/><path class="pr-cavity" d="M64 18H216C244 18 260 44 266 80C270 116 262 146 246 146C230 146 218 124 200 112H80C62 124 50 146 34 146C18 146 10 116 14 80C20 44 36 18 64 18Z"/>
${pcb(90, 22, 110, 70, 4)}${Object.values(CONNS).map(([x, y]) => socket(x, y)).join('')}${stickyAt('keys', 84, 52, 0.8)}${jackMark(140, 12, 16, 5)}`),
  frontBody: () => wrap(`<path class="pr-dark-plastic" d="${SHAPE}"/>
<circle class="pr-stick-cap" cx="70" cy="58" r="16"/><circle class="pr-stick-top" cx="70" cy="58" r="10"/><circle class="pr-stick-cap" cx="180" cy="98" r="16"/><circle class="pr-stick-top" cx="180" cy="98" r="10"/>
<path class="pr-dpad" d="M95 88h10v8h8v10h-8v8H95v-8h-8V96h8Z"/>${[[210, 46], [222, 58], [210, 70], [198, 58]].map(([x, y]) => `<circle class="pr-abxy" cx="${x}" cy="${y}" r="6"/>`).join('')}
<circle class="pr-home-btn" cx="140" cy="56" r="8"/>${jackMark(140, 12, 16, 5)}`),
  part: (id, s) => wrap({
    shell: () => `<path class="pr-dark-plastic pr-shell" d="${SHAPE}"/><path class="pr-shell-grip" d="M20 90c4 30 12 54 24 56"/><path class="pr-shell-grip" d="M260 90c-4 30-12 54-24 56"/>
<text class="pr-brand-dark" x="140" y="90" text-anchor="middle">${s.model.code}</text>${['h1', 'h2', 'h3', 'h4'].map((k) => hole(...SCREWS[k])).join('')}`,
    battery: () => `${cell(118, 30, 60, 42, s, 'battery', '1000 mAh')}<rect class="pr-flex" x="144" y="70" width="12" height="10" rx="1"/>`,
    stickL: () => stickModule(186, 40, 'stickL', s, SCREWS.l1),
    stickR: () => stickModule(76, 94, 'stickR', s, SCREWS.r1),
    rumble: () => `<rect class="pr-motor" x="24" y="88" width="26" height="30" rx="6"/><path class="pr-weight" d="M30 118a10 10 0 0 0 14 0v8H30Z"/>
${s.parts.rumble.broken ? '<path class="pr-scorch" d="M28 96c4-4 12-3 12 2s-4 8-8 7-6-6-4-9Z"/>' : ''}`,
  }[id]()),
  plug: (id) => wrap(plugBody(...CONNS[id], id === 'bat' ? 'up' : id === 'stl' ? 'right' : 'left')),
  screw: (id) => wrap(screwHead(...SCREWS[id])),
};
