// Умные часы 120×220 (с ремешком). Спереди — ремешок и экран на клею; сзади — крышка с датчиком пульса на клею
// (грязная — кисточкой), под ней батарея и шлейфы; контакты зарядки — сзади.

import { frame, plugBody, socket, corrosion, screenStates, cell, PORTRAIT, trayLayout } from '../scene.js';

const F = frame(120, 110);
const { box, pt, wrap } = F;

const CONNS = { disp: [34, 150], bat: [86, 150] };
const SCREEN = { x: 20, y: 62, w: 80, h: 96, rx: 16 };

function face() {
  return `<rect x="20" y="62" width="80" height="96" class="pr-ui-dark"/><circle class="pr-ring-a" cx="60" cy="110" r="32"/><circle class="pr-ring-b" cx="60" cy="110" r="24"/>
<text class="pr-watch-time" x="60" y="114" text-anchor="middle">12:30</text><text class="pr-watch-sub" x="60" y="128" text-anchor="middle">♥ 72</text>`;
}

export default {
  kind: 'watch',
  origin: [180, 220],
  ...trayLayout(PORTRAIT, { strap: 'L1', display: 'R1', sensor: 'R2', battery: 'R3' }, []),
  BOX: {
    strap: box(30, 0, 60, 220),
    display: box(14, 54, 92, 112),
    sensor: box(20, 70, 80, 80),
    battery: box(36, 84, 48, 46),
    board: box(20, 70, 80, 80),
  },
  SCREEN: box(SCREEN.x, SCREEN.y, SCREEN.w, SCREEN.h),
  CONN_AT: Object.fromEntries(Object.entries(CONNS).map(([k, v]) => [k, pt(...v)])),
  SCREW_AT: {},
  SPOT_AT: { jack: pt(60, 160), board: pt(60, 110) },
  JACK: { front: null, back: box(44, 150, 32, 20) },
  BUTTON: { front: box(104, 80, 22, 30), back: box(-6, 80, 22, 30) },
  ORDER: { front: ['strap', 'display'], back: ['battery', 'plugs', 'sensor'] },
  backBody: () => wrap(`<rect class="pr-body" x="10" y="50" width="100" height="120" rx="26"/><rect class="pr-cavity" x="16" y="56" width="88" height="108" rx="22"/>
${socket(...CONNS.disp)}${socket(...CONNS.bat)}${corrosion(60, 110, 0.6)}<circle class="pr-gold" cx="54" cy="160" r="3"/><circle class="pr-gold" cx="66" cy="160" r="3"/>
<g class="pr-lint"><path d="M50 162c4-2 8 1 12-1s6 1 8 0"/></g><rect class="pr-side-btn" x="7" y="86" width="4" height="18" rx="2"/>`),
  frontBody: () => wrap(`<rect class="pr-body" x="10" y="50" width="100" height="120" rx="26"/><rect class="pr-midframe" x="16" y="56" width="88" height="108" rx="22"/>
<rect class="pr-side-btn" x="109" y="86" width="5" height="18" rx="2"/>`),
  part: (id, s) => wrap({
    strap: () => `<rect class="pr-strap" x="34" y="0" width="52" height="60" rx="8"/><rect class="pr-strap" x="34" y="160" width="52" height="60" rx="8"/>
${[0, 1, 2].map((k) => `<circle class="pr-strap-hole" cx="60" cy="${182 + k * 12}" r="2.4"/>`).join('')}
${s.parts.strap.broken ? '<path class="pr-crack-dark" d="M34 196l14 4-6 4 16 4"/>' : ''}`,
    display: () => `<rect class="pr-glass" x="14" y="54" width="92" height="112" rx="22" fill="url(#pr-g-glass)"/>${screenStates(SCREEN, s, face())}
<rect class="pr-heat" x="14" y="54" width="92" height="112" rx="22"/>`,
    sensor: () => `<rect class="pr-plastic" x="14" y="56" width="92" height="108" rx="24" fill="url(#pr-g-plastic)"/><circle class="pr-sensor-glass" cx="60" cy="110" r="34"/>
<circle class="pr-sensor-led" cx="50" cy="104" r="4"/><circle class="pr-sensor-led" cx="70" cy="104" r="4"/><circle class="pr-sensor-pd" cx="60" cy="120" r="5"/>
<g class="pr-spot" data-spot="sensor"><circle cx="48" cy="114" r="6"/><circle cx="70" cy="122" r="5"/><circle cx="62" cy="98" r="4"/></g>
${s.parts.sensor.broken ? '<path class="pr-crack-dark" d="M40 96l10 8-4 6 12 8"/>' : ''}<rect class="pr-heat" x="14" y="56" width="92" height="108" rx="24"/>`,
    battery: () => cell(36, 84, 48, 46, s, 'battery', '300 mAh'),
  }[id]()),
  plug: (id) => wrap(plugBody(...CONNS[id], 'up')),
  screw: () => '',
};
