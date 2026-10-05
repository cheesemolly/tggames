// Геймпад 280×160 (сверху сцены, лотки снизу). Спереди — стики с рифлёным краем, крестовина, цветные кнопки,
// центральная кнопка с огоньком, бамперы. Сзади (зеркально: левый стик справа) — корпус на 4 винтах с текстурой
// рукояток; внутри (всё в пределах корпуса) батарея, модули стиков на винтах, вибромотор в рукоятке, плата;
// липкие кнопки отмывают изнутри — без батареи.

import { frame, screwHead, hole, plugBody, socket, jackMark, pcb, cell, stickyAt, LANDSCAPE, trayLayout } from '../scene.js';

const F = frame(40, 34);
const { box, pt, wrap } = F;

const SHAPE = 'M64 12H216C246 12 266 38 274 78C282 120 270 156 246 156C224 156 212 132 194 122H86C68 132 56 156 34 156C10 156-2 120 6 78C14 38 34 12 64 12Z';
const INNER = 'M68 20H212C238 20 256 44 262 78C268 112 260 144 244 144C228 144 216 122 198 112H82C64 122 52 144 36 144C20 144 12 112 18 78C24 44 42 20 68 20Z';
const SCREWS = { h1: [52, 34], h2: [228, 34], h3: [36, 132], h4: [244, 132], l1: [226, 80], r1: [112, 100] };
const CONNS = { bat: [140, 66], stl: [190, 92], str: [100, 62], rmb: [56, 92] };

function stickModule(x, y, id, s, screw) {
  return `<rect class="pr-stick-module" x="${x}" y="${y}" width="40" height="36" rx="5"/><circle class="pr-stick-base" cx="${x + 20}" cy="${y + 18}" r="12"/><circle class="pr-stick-top" cx="${x + 20}" cy="${y + 18}" r="6.5"/>
${s.parts[id].broken ? `<circle class="pr-worn-ring" cx="${x + 20}" cy="${y + 18}" r="9"/>` : ''}${hole(...screw, 3.6)}`;
}

const stickCap = (x, y) => `<circle class="pr-stick-cap" cx="${x}" cy="${y}" r="16"/><circle class="pr-stick-grip" cx="${x}" cy="${y}" r="13"/><circle class="pr-stick-top" cx="${x}" cy="${y}" r="9"/>`;

export default {
  kind: 'gamepad',
  origin: [180, 117],
  ...trayLayout(LANDSCAPE, { shell: 'A1', battery: 'B1', rumble: 'B2', stickL: 'C1', stickR: 'C2' }, ['h1', 'h2', 'h3', 'h4', 'l1', 'r1']),
  BOX: {
    shell: box(0, 12, 280, 146),
    battery: box(116, 24, 52, 34),
    stickL: box(190, 48, 40, 36),
    stickR: box(78, 70, 40, 36),
    rumble: box(24, 86, 28, 40),
  },
  CONN_AT: Object.fromEntries(Object.entries(CONNS).map(([k, v]) => [k, pt(...v)])),
  SCREW_AT: Object.fromEntries(Object.entries(SCREWS).map(([k, v]) => [k, pt(...v)])),
  SPOT_AT: { jack: pt(140, 12), keys: pt(76, 46) },
  SPOT_BOX: { keys: { back: box(52, 30, 48, 30) } },
  JACK: { front: box(124, 0, 32, 22), back: box(124, 0, 32, 22) },
  BUTTON: { front: box(126, 46, 28, 26), back: null },
  ORDER: { back: ['battery', 'stickL', 'stickR', 'rumble', 'plugs', 'shell'], front: [] },
  backBody: () => wrap(`<path class="pr-dark-plastic" d="${SHAPE}"/><path class="pr-cavity" d="${INNER}"/>
${pcb(94, 22, 92, 82, 4, 6)}${Object.values(CONNS).map(([x, y]) => socket(x, y)).join('')}${stickyAt('keys', 76, 46, 0.7)}
<rect class="pr-bumper" x="40" y="8" width="56" height="8" rx="4"/><rect class="pr-bumper" x="184" y="8" width="56" height="8" rx="4"/>${jackMark(140, 14, 16, 5)}`),
  frontBody: () => wrap(`<rect class="pr-bumper" x="40" y="8" width="56" height="8" rx="4"/><rect class="pr-bumper" x="184" y="8" width="56" height="8" rx="4"/>
<path class="pr-dark-plastic" d="${SHAPE}"/><path class="pr-grip-tex" d="M14 100c4 24 12 40 22 46M266 100c-4 24-12 40-22 46"/>
${stickCap(72, 60)}${stickCap(180, 100)}
<path class="pr-dpad" d="M94 90h10v9h9v10h-9v9H94v-9h-9V99h9Z"/>
<circle class="pr-face-btn pr-btn-y" cx="210" cy="46" r="6.5"/><circle class="pr-face-btn pr-btn-b" cx="223" cy="59" r="6.5"/>
<circle class="pr-face-btn pr-btn-a" cx="210" cy="72" r="6.5"/><circle class="pr-face-btn pr-btn-x" cx="197" cy="59" r="6.5"/>
<rect class="pr-mini-btn" x="118" y="62" width="10" height="5" rx="2.5"/><rect class="pr-mini-btn" x="152" y="62" width="10" height="5" rx="2.5"/>
<circle class="pr-home-btn" cx="140" cy="44" r="8"/><path class="pr-light-bar" d="M120 26h40"/>${jackMark(140, 14, 16, 5)}`),
  part: (id, s) => wrap({
    shell: () => `<path class="pr-dark-plastic pr-shell" d="${SHAPE}"/><path class="pr-grip-tex" d="M18 96c4 26 12 42 22 48M262 96c-4 26-12 42-22 48"/>
<path class="pr-shell-seam" d="${INNER}"/><text class="pr-brand-dark" x="140" y="86" text-anchor="middle">${s.model.code}</text>
${['h1', 'h2', 'h3', 'h4'].map((k) => hole(...SCREWS[k])).join('')}`,
    battery: () => `${cell(116, 24, 52, 34, s, 'battery', '1000 mAh')}<rect class="pr-flex" x="134" y="56" width="12" height="6" rx="1"/>`,
    stickL: () => stickModule(190, 48, 'stickL', s, SCREWS.l1),
    stickR: () => stickModule(78, 70, 'stickR', s, SCREWS.r1),
    rumble: () => `<rect class="pr-motor" x="26" y="88" width="24" height="28" rx="6"/><path class="pr-weight" d="M30 116a9 9 0 0 0 16 0v8H30Z"/>
${s.parts.rumble.broken ? '<path class="pr-scorch" d="M30 96c4-4 12-3 12 2s-4 8-8 7-6-6-4-9Z"/>' : ''}`,
  }[id]()),
  plug: (id) => wrap(plugBody(...CONNS[id], id === 'bat' ? 'up' : id === 'stl' ? 'down' : id === 'rmb' ? 'down' : 'down')),
  screw: (id) => wrap(screwHead(...SCREWS[id])),
};
