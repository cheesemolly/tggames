// Квадрокоптер 300×170 (вид сверху; лотки снизу). Сверху — пропеллеры, камера на подвесе (шлейф), крышка на
// 4 винтах (только без пропеллеров) — под ней мотор, плата и шлейфы. Снизу — съёмная батарея: вынул — обесточил.

import { frame, screwHead, hole, plugBody, socket, jackMark, corrosion, pcb, cell, lensAt, LANDSCAPE, trayLayout } from '../scene.js';

const F = frame(30, 26);
const { box, pt, wrap } = F;

const SCREWS = { h1: [104, 52], h2: [196, 52], h3: [104, 118], h4: [196, 118] };
const CONNS = { mot: [126, 74], gim: [176, 100] };
const MOTORS = [[44, 36], [256, 36], [44, 134], [256, 134]];

const frameArms = `<path class="pr-arm-frame" d="M44 36L150 85L256 36M44 134L150 85L256 134"/>${MOTORS.map(([x, y]) => `<circle class="pr-motor-mount" cx="${x}" cy="${y}" r="14"/>`).join('')}`;

export default {
  kind: 'drone',
  origin: [180, 111],
  ...trayLayout(LANDSCAPE, { props: 'A1', battery: 'A2', shell: 'B1', gimbal: 'B2', motor: 'C1' }, ['h1', 'h2', 'h3', 'h4']),
  BOX: {
    props: box(0, 0, 300, 170),
    gimbal: box(130, 134, 40, 34),
    shell: box(96, 44, 108, 82),
    motor: box(28, 20, 32, 32),
    battery: box(100, 46, 100, 78),
    board: box(104, 56, 92, 58),
  },
  CONN_AT: Object.fromEntries(Object.entries(CONNS).map(([k, v]) => [k, pt(...v)])),
  SCREW_AT: Object.fromEntries(Object.entries(SCREWS).map(([k, v]) => [k, pt(...v)])),
  SPOT_AT: { jack: pt(150, 44), board: pt(150, 85) },
  JACK: { front: box(134, 30, 32, 20), back: box(134, 30, 32, 20) },
  BUTTON: { front: null, back: box(136, 96, 28, 24) },
  ORDER: { front: ['motor', 'plugs', 'shell', 'props', 'gimbal'], back: ['battery'] },
  backBody: () => wrap(`${frameArms}<rect class="pr-dark-plastic" x="96" y="44" width="108" height="82" rx="14"/><rect class="pr-cavity" x="104" y="50" width="92" height="70" rx="8"/>
${[[60, 60], [240, 60], [60, 110], [240, 110]].map(([x, y]) => `<rect class="pr-leg" x="${x - 4}" y="${y - 10}" width="8" height="20" rx="3"/>`).join('')}`),
  frontBody: () => wrap(`${frameArms}<rect class="pr-dark-plastic" x="96" y="44" width="108" height="82" rx="14"/>${pcb(104, 56, 92, 58, 4)}
${socket(...CONNS.mot)}${socket(...CONNS.gim)}${corrosion(150, 85, 0.7)}${jackMark(150, 46, 16, 5)}`),
  part: (id, s) => wrap({
    props: () => MOTORS.map(([x, y], k) => `<ellipse class="pr-prop" cx="${x}" cy="${y}" rx="36" ry="6" transform="rotate(${k * 37 + 15} ${x} ${y})"/><circle class="pr-prop-hub" cx="${x}" cy="${y}" r="5"/>`).join('')
      + (s.parts.props.broken ? '<path class="pr-crack-dark" d="M20 30l12 4-4 4 10 2M270 130l10 4-4 4 8 2"/>' : ''),
    gimbal: () => `<rect class="pr-gimbal" x="132" y="134" width="36" height="30" rx="8"/>${lensAt(150, 150, 9)}<rect class="pr-flex" x="146" y="118" width="8" height="18" rx="1"/>
${s.parts.gimbal.broken ? '<path class="pr-crack" d="M142 144l6 4-3 4 8 4"/>' : ''}`,
    shell: () => `<rect class="pr-plastic pr-shell" x="96" y="44" width="108" height="82" rx="14" fill="url(#pr-g-plastic)"/><rect class="pr-led-strip" x="120" y="50" width="60" height="4" rx="2"/>
<text class="pr-model" x="150" y="92" text-anchor="middle">${s.model.code}</text>${Object.values(SCREWS).map(([x, y]) => hole(x, y)).join('')}`,
    motor: () => `<circle class="pr-motor-can" cx="44" cy="36" r="14"/><circle class="pr-motor-top" cx="44" cy="36" r="6"/>
${s.parts.motor.broken ? '<path class="pr-scorch" d="M36 30c4-4 12-3 12 2s-4 8-8 7-6-6-4-9Z"/>' : ''}`,
    battery: () => cell(100, 46, 100, 78, s, 'battery', '2400 mAh'),
  }[id]()),
  plug: (id) => wrap(plugBody(...CONNS[id], id === 'mot' ? 'left' : 'down')),
  screw: (id) => wrap(screwHead(...SCREWS[id])),
};
