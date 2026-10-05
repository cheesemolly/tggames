// Электронная книга 170×260: спереди экран на клею (электронные чернила — страница текста), сзади крышка на
// защёлках; под ней батарея, плата и шлейфы.

import { frame, plugBody, socket, jackMark, corrosion, pcb, cell, screenStates, logo, PORTRAIT, trayLayout } from '../scene.js';

const F = frame(95, 80);
const { box, pt, wrap } = F;

const CONNS = { bat: [120, 160], disp: [50, 178] };
const SCREEN = { x: 14, y: 14, w: 142, h: 196, rx: 3 };

const page = () => `<rect x="14" y="14" width="142" height="196" class="pr-eink"/>
${Array.from({ length: 14 }, (_, k) => `<rect class="pr-eink-line" x="24" y="${30 + k * 12}" width="${k % 5 === 4 ? 70 : 122}" height="4" rx="2"/>`).join('')}
<text class="pr-eink-page" x="85" y="204" text-anchor="middle">37</text>`;

export default {
  kind: 'ereader',
  origin: [180, 210],
  ...trayLayout(PORTRAIT, { cover: 'L1', display: 'L2', battery: 'R1' }, []),
  BOX: {
    display: box(6, 6, 158, 230),
    cover: box(0, 0, 170, 260),
    battery: box(20, 28, 130, 116),
    board: box(20, 150, 130, 80),
  },
  SCREEN: box(SCREEN.x, SCREEN.y, SCREEN.w, SCREEN.h),
  CONN_AT: Object.fromEntries(Object.entries(CONNS).map(([k, v]) => [k, pt(...v)])),
  SCREW_AT: {},
  SPOT_AT: { jack: pt(85, 260), board: pt(90, 200) },
  JACK: { front: box(66, 248, 38, 24), back: box(66, 248, 38, 24) },
  BUTTON: { front: box(110, 246, 30, 20), back: box(30, 246, 30, 20) },
  ORDER: { front: ['display'], back: ['battery', 'plugs', 'cover'] },
  backBody: () => wrap(`<rect class="pr-body" x="0" y="0" width="170" height="260" rx="14"/><rect class="pr-cavity" x="6" y="6" width="158" height="248" rx="10"/>
${pcb(20, 150, 130, 80, 4)}${Object.values(CONNS).map(([x, y]) => socket(x, y)).join('')}${corrosion(90, 200, 0.7)}${jackMark(85, 258, 18, 5)}`),
  frontBody: () => wrap(`<rect class="pr-plastic" x="0" y="0" width="170" height="260" rx="14" fill="url(#pr-g-plastic)"/><rect class="pr-midframe" x="6" y="6" width="158" height="230" rx="8"/>
<rect class="pr-glue" x="10" y="10" width="150" height="222" rx="6"/><rect class="pr-side-btn" x="116" y="256" width="18" height="5" rx="2"/>${jackMark(85, 258, 18, 5)}`),
  part: (id, s) => wrap({
    display: () => `<rect class="pr-glass pr-eink-glass" x="6" y="6" width="158" height="230" rx="8"/>${screenStates(SCREEN, s, page())}
<rect class="pr-heat" x="6" y="6" width="158" height="230" rx="8"/>`,
    cover: () => `<rect class="pr-plastic pr-shell" x="2" y="2" width="166" height="256" rx="13" fill="url(#pr-g-plastic)"/><path class="pr-sheen" d="M2 100 168 40v24L2 124Z"/>
<g class="pr-logo" transform="translate(85 120) scale(0.6) translate(-90 -166)">${logo(s.model.logo)}</g><text class="pr-model" x="85" y="220" text-anchor="middle">${s.model.name}</text>`,
    battery: () => `${cell(20, 28, 130, 116, s, 'battery', '1500 mAh')}<rect class="pr-flex" x="114" y="142" width="12" height="14" rx="1"/>`,
  }[id]()),
  plug: (id) => wrap(plugBody(...CONNS[id], id === 'bat' ? 'up' : 'up')),
  screw: () => '',
};
