// VR-шлем 280×150 (сверху сцены, лотки снизу). Со стороны лица — накладка с линзами (пыльные — кисточкой), под ней
// экран; снаружи — панель с камерами на 4 винтах, внутри батарея, вентилятор, шлейфы.

import { frame, screwHead, hole, plugBody, socket, jackMark, pcb, cell, fanAt, lensAt, dustAt, screenStates, LANDSCAPE, trayLayout } from '../scene.js';

const F = frame(40, 40);
const { box, pt, wrap } = F;

const BODY = 'M40 0H240A40 40 0 0 1 280 40V110A40 40 0 0 1 240 150H40A40 40 0 0 1 0 110V40A40 40 0 0 1 40 0Z';
const SCREWS = { h1: [24, 24], h2: [256, 24], h3: [24, 126], h4: [256, 126] };
const CONNS = { disp: [110, 40], bat: [160, 90], fan: [210, 40] };
const SCREEN = { x: 44, y: 28, w: 192, h: 84, rx: 6 };

const eyes = () => `<rect x="44" y="28" width="192" height="84" class="pr-ui-dark"/>
<circle class="pr-vr-eye" cx="96" cy="70" r="34"/><circle class="pr-vr-eye" cx="184" cy="70" r="34"/>
<rect class="pr-tile pr-app-1" x="80" y="58" width="32" height="22" rx="3"/><rect class="pr-tile pr-app-1" x="168" y="58" width="32" height="22" rx="3"/>`;

export default {
  kind: 'vr',
  origin: [180, 115],
  ...trayLayout(LANDSCAPE, { shell: 'A1', cushion: 'A2', display: 'C3', battery: 'B1', fan: 'B2' }, ['h1', 'h2', 'h3', 'h4']),
  BOX: {
    cushion: box(6, 6, 268, 138),
    display: box(38, 22, 204, 96),
    shell: box(0, 0, 280, 150),
    battery: box(30, 60, 90, 54),
    fan: box(176, 60, 56, 56),
  },
  SCREEN: box(SCREEN.x, SCREEN.y, SCREEN.w, SCREEN.h),
  CONN_AT: Object.fromEntries(Object.entries(CONNS).map(([k, v]) => [k, pt(...v)])),
  SCREW_AT: Object.fromEntries(Object.entries(SCREWS).map(([k, v]) => [k, pt(...v)])),
  SPOT_AT: { jack: pt(140, 150), lens: pt(96, 70) },
  JACK: { front: box(124, 138, 32, 22), back: box(124, 138, 32, 22) },
  BUTTON: { front: null, back: box(232, -10, 30, 18) },
  ORDER: { front: ['display', 'cushion'], back: ['battery', 'fan', 'plugs', 'shell'] },
  backBody: () => wrap(`<path class="pr-dark-plastic" d="${BODY}"/><rect class="pr-cavity" x="12" y="10" width="256" height="130" rx="30"/>
${pcb(60, 16, 160, 40, 4)}${Object.values(CONNS).map(([x, y]) => socket(x, y)).join('')}${jackMark(140, 148, 16, 5)}<rect class="pr-side-btn" x="236" y="-3" width="22" height="4" rx="2"/>`),
  frontBody: () => wrap(`<path class="pr-dark-plastic" d="${BODY}"/><rect class="pr-midframe" x="30" y="16" width="220" height="108" rx="12"/>${jackMark(140, 148, 16, 5)}`),
  part: (id, s) => wrap({
    cushion: () => `<path class="pr-foam" fill-rule="evenodd" d="M40 6H240A34 34 0 0 1 274 40V110A34 34 0 0 1 240 144H40A34 34 0 0 1 6 110V40A34 34 0 0 1 40 6Z M44 22H236A12 12 0 0 1 248 34V112A12 12 0 0 1 236 124H160C152 104 128 104 120 124H44A12 12 0 0 1 32 112V34A12 12 0 0 1 44 22Z"/>
${lensAt(96, 70, 30)}${lensAt(184, 70, 30)}${dustAt('lens', 96, 66, 1.3)}${s.parts.cushion.broken ? '<path class="pr-crack-dark" d="M20 50l10 6-4 6 10 6M250 100l-8 6 4 4-10 6"/>' : ''}`,
    display: () => `<rect class="pr-glass" x="38" y="22" width="204" height="96" rx="8" fill="url(#pr-g-glass)"/>${screenStates(SCREEN, s, eyes())}`,
    shell: () => `<path class="pr-plastic pr-shell" d="${BODY}" fill="url(#pr-g-plastic)"/>${[[40, 40], [240, 40], [40, 110], [240, 110]].map(([x, y]) => lensAt(x, y, 6)).join('')}
<text class="pr-model" x="140" y="80" text-anchor="middle">${s.model.name}</text>${Object.values(SCREWS).map(([x, y]) => hole(x, y)).join('')}`,
    battery: () => `${cell(30, 60, 90, 54, s, 'battery', '5000 mAh')}<rect class="pr-flex" x="118" y="84" width="40" height="8" rx="1"/>`,
    fan: () => `${fanAt(204, 88, 22, Boolean(s.parts.fan.broken))}<rect class="pr-flex" x="206" y="46" width="8" height="18" rx="1"/>`,
  }[id]()),
  plug: (id) => wrap(plugBody(...CONNS[id], id === 'bat' ? 'left' : 'down')),
  screw: (id) => wrap(screwHead(...SCREWS[id])),
};
