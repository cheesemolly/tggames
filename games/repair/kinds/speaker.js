// Умная колонка 160×240. Спереди — тканевая сетка на защёлках (пыльная — кисточкой), под ней динамик со шлейфом;
// сверху кольцо подсветки и кнопка. Сзади — дно на 4 винтах, внутри плата микрофонов; пролитое — на плате.

import { frame, screwHead, hole, plugBody, socket, jackMark, corrosion, pcb, driverAt, dustAt, PORTRAIT, trayLayout } from '../scene.js';

const F = frame(100, 100);
const { box, pt, wrap } = F;

const SCREWS = { h1: [18, 20], h2: [142, 20], h3: [18, 220], h4: [142, 220] };
const CONNS = { drv: [80, 214] };
const BODY = '<rect class="pr-plastic" x="0" y="0" width="160" height="240" rx="34" fill="url(#pr-g-plastic)"/>';

export default {
  kind: 'speaker',
  origin: [180, 220],
  ...trayLayout(PORTRAIT, { grille: 'L1', base: 'L2', speaker: 'R1', mic: 'R3' }, ['h1', 'h2', 'h3', 'h4']),
  BOX: {
    grille: box(8, 36, 144, 196),
    speaker: box(26, 76, 108, 108),
    base: box(0, 0, 160, 240),
    mic: box(40, 16, 80, 30),
    board: box(30, 60, 100, 140),
  },
  CONN_AT: { drv: pt(...CONNS.drv) },
  SCREW_AT: Object.fromEntries(Object.entries(SCREWS).map(([k, v]) => [k, pt(...v)])),
  SPOT_AT: { jack: pt(80, 240), board: pt(80, 130) },
  JACK: { front: box(60, 228, 40, 24), back: box(60, 228, 40, 24) },
  BUTTON: { front: box(64, 4, 32, 26), back: null },
  ORDER: { front: ['speaker', 'plugs', 'grille'], back: ['mic', 'base'] },
  backBody: () => wrap(`${BODY}<rect class="pr-cavity" x="8" y="8" width="144" height="224" rx="28"/>${pcb(30, 60, 100, 140, 5)}${corrosion(80, 130, 0.9)}${jackMark(80, 236, 18, 5)}`),
  frontBody: () => wrap(`${BODY}<rect class="pr-cavity" x="10" y="38" width="140" height="192" rx="26"/>${socket(...CONNS.drv)}
<ellipse class="pr-light-ring" cx="80" cy="18" rx="44" ry="7"/><circle class="pr-side-btn" cx="80" cy="18" r="5"/>${jackMark(80, 236, 18, 5)}`),
  part: (id, s) => wrap({
    grille: () => {
      let dots = '';
      for (let r = 0; r < 14; r++) for (let c = 0; c < 10; c++) dots += `<circle cx="${20 + c * 13 + (r % 2) * 6}" cy="${48 + r * 13}" r="1.6"/>`;
      return `<rect class="pr-fabric" x="8" y="36" width="144" height="196" rx="28"/><g class="pr-fabric-dots">${dots}</g>${dustAt('grille', 80, 130, 2)}`;
    },
    speaker: () => `${driverAt(80, 130, 52, Boolean(s.parts.speaker.broken))}<rect class="pr-flex" x="75" y="182" width="10" height="26" rx="1"/>`,
    base: () => `<rect class="pr-plastic pr-shell" x="2" y="2" width="156" height="236" rx="32" fill="url(#pr-g-plastic)"/><circle class="pr-rubber-foot" cx="80" cy="120" r="56"/>
<text class="pr-brand-dark pr-dark-text" x="80" y="124" text-anchor="middle">${s.model.code}</text>${Object.values(SCREWS).map(([x, y]) => hole(x, y)).join('')}`,
    mic: () => `<rect class="pr-pcb" x="40" y="16" width="80" height="30" rx="5"/>${[0, 1, 2, 3].map((k) => `<circle class="pr-mic-hole" cx="${52 + k * 19}" cy="31" r="4"/>`).join('')}
${s.parts.mic.broken ? '<path class="pr-scorch" d="M66 24c4-4 12-3 12 2s-4 8-8 7-6-6-4-9Z"/>' : ''}`,
  }[id]()),
  plug: (id) => wrap(plugBody(...CONNS[id], 'up')),
  screw: (id) => wrap(screwHead(...SCREWS[id])),
};
