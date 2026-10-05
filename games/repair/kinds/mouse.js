// Мышь 120×200. Сверху — кнопки и колёсико. Снизу (зеркально: левая кнопка справа) — ножки, дверца батарейки,
// линза сенсора; корпус на 2 винтах под ножками — открывается без батарейки; внутри микрики и энкодер колёсика.

import { frame, screwHead, hole, pcb, dustAt, PORTRAIT, trayLayout } from '../scene.js';

const F = frame(120, 110);
const { box, pt, wrap } = F;

const SHAPE = 'M60 0C96 0 118 30 118 80v40c0 50-26 80-58 80S2 170 2 120V80C2 30 24 0 60 0Z';
const SCREWS = { h1: [60, 24], h2: [60, 176] };

export default {
  kind: 'mouse',
  origin: [180, 210],
  ...trayLayout(PORTRAIT, { shell: 'L1', feet: 'L2', door: 'R1', battery: 'R2', switchL: 'R3', switchR: 'R4', wheel: 'R5' }, ['h1', 'h2']),
  BOX: {
    door: box(32, 72, 56, 44),
    battery: box(36, 76, 48, 36),
    feet: box(40, 12, 40, 180),
    shell: box(0, 0, 120, 200),
    switchL: box(70, 18, 26, 18),
    switchR: box(24, 18, 26, 18),
    wheel: box(52, 30, 16, 30),
  },
  CONN_AT: {},
  SCREW_AT: { h1: pt(...SCREWS.h1), h2: pt(...SCREWS.h2) },
  SPOT_AT: { lens: pt(60, 138) },
  SPOT_BOX: { lens: { back: box(42, 122, 36, 32) } },
  BUTTON: { front: null, back: box(46, 156, 28, 18) },
  ORDER: { back: ['switchL', 'switchR', 'wheel', 'shell', 'battery', 'door', 'feet'], front: [] },
  backBody: () => wrap(`<path class="pr-mouse-body" d="${SHAPE}"/><path class="pr-cavity" d="M60 8c30 0 50 26 50 72v40c0 44-22 72-50 72S10 164 10 120V80C10 34 30 8 60 8Z"/>
${pcb(18, 40, 84, 120, 4)}<circle class="pr-sensor" cx="60" cy="138" r="9"/>${dustAt('lens', 60, 138, 0.7)}`),
  frontBody: () => wrap(`<path class="pr-mouse-body" d="${SHAPE}" fill="url(#pr-g-plastic)"/><path class="pr-mouse-split" d="M60 2v64M8 66c30 8 74 8 104 0"/>
<rect class="pr-wheel-cap" x="54" y="26" width="12" height="28" rx="6"/><path class="pr-sheen" d="M20 120c20 30 60 40 90 20" fill="none"/>`),
  part: (id, s) => wrap({
    shell: () => `<path class="pr-plastic pr-shell" d="${SHAPE}" fill="url(#pr-g-plastic)"/><circle class="pr-sensor-hole" cx="60" cy="138" r="13"/>
${hole(...SCREWS.h1, 4)}${hole(...SCREWS.h2, 4)}<rect class="pr-side-btn" x="52" y="160" width="16" height="9" rx="4.5"/>
<text class="pr-sticker-text pr-dark-text" x="60" y="66" text-anchor="middle">${s.model.code}</text>`,
    feet: () => `<rect class="pr-feet${s.parts.feet.broken ? ' pr-worn' : ''}" x="40" y="12" width="40" height="18" rx="9"/><rect class="pr-feet${s.parts.feet.broken ? ' pr-worn' : ''}" x="40" y="174" width="40" height="18" rx="9"/>`,
    door: () => '<rect class="pr-plastic pr-door" x="32" y="72" width="56" height="44" rx="8" fill="url(#pr-g-plastic)"/><path class="pr-door-ridge" d="M42 108h36"/>',
    battery: () => `<rect class="pr-aa" x="36" y="80" width="48" height="28" rx="6"/><rect class="pr-aa-band" x="36" y="80" width="14" height="28" rx="6"/><rect class="pr-gold" x="84" y="88" width="4" height="12" rx="1"/>
<text class="pr-battery-text" x="66" y="98" text-anchor="middle" style="font-size:8px">${s.parts.battery.broken === 'worn' ? '0.9 V' : 'AA'}</text>`,
    switchL: () => microswitch(70, s.parts.switchL.broken),
    switchR: () => microswitch(24, s.parts.switchR.broken),
    wheel: () => `<rect class="pr-wheel" x="52" y="30" width="16" height="30" rx="8"/><path class="pr-wheel-grip" d="M54 36h12M54 42h12M54 48h12M54 54h12"/>
${dustAt('wheel', 60, 45, 0.5)}${s.parts.wheel.broken ? '<path class="pr-tear" d="M54 34l8 10-4 2 6 10"/>' : ''}`,
  }[id]()),
  plug: () => '',
  screw: (id) => wrap(screwHead(...SCREWS[id])),
};

function microswitch(x, broken) {
  return `<rect class="pr-micro" x="${x}" y="18" width="26" height="18" rx="2"/><rect class="pr-micro-btn" x="${x + 10}" y="14" width="6" height="5" rx="1"/>
${broken ? `<path class="pr-tear" d="M${x + 4} 24l6 4-3 3 8 3"/>` : ''}`;
}
