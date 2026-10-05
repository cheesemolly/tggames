// Наушники-вкладыши: открытый кейс 150×200 — спереди два наушника в гнёздах, сзади половинка кейса на клею,
// под ней плата и батарея кейса со шлейфом. Сера — на сеточке наушника (кисточкой).

import { frame, plugBody, socket, jackMark, pcb, cell, dustAt, logo, PORTRAIT, trayLayout } from '../scene.js';

const F = frame(105, 110);
const { box, pt, wrap } = F;

const CASE = '<rect class="pr-plastic" x="0" y="0" width="150" height="200" rx="52" fill="url(#pr-g-plastic)"/>';
const CONNS = { bat: [75, 66] };

function bud(cx, id, s) {
  const dead = s.parts[id].broken;
  return `<rect class="pr-bud-stem" x="${cx - 7}" y="84" width="14" height="54" rx="7"/>
<circle class="pr-bud-head" cx="${cx}" cy="70" r="22"/><circle class="pr-bud-mesh" cx="${cx}" cy="66" r="10"/>
${dustAt(id === 'budL' ? 'waxL' : 'waxR', cx, 66, 0.55)}
<circle class="pr-bud-led" cx="${cx}" cy="128" r="2.4"/>${dead ? `<path class="pr-tear" d="M${cx - 8} 80l6 4-3 4 8 4"/>` : ''}`;
}

export default {
  kind: 'earbuds',
  origin: [180, 210],
  ...trayLayout(PORTRAIT, { shell: 'L1', battery: 'R1', budL: 'R2', budR: 'R3' }, []),
  BOX: {
    budL: box(16, 46, 48, 94),
    budR: box(86, 46, 48, 94),
    shell: box(0, 0, 150, 200),
    battery: box(35, 80, 80, 60),
  },
  CONN_AT: { bat: pt(...CONNS.bat) },
  SCREW_AT: {},
  SPOT_AT: { jack: pt(75, 200) },
  JACK: { front: box(55, 188, 40, 24), back: box(55, 188, 40, 24) },
  BUTTON: { front: null, back: box(60, 154, 30, 24) },
  ORDER: { back: ['battery', 'plugs', 'shell'], front: ['budL', 'budR'] },
  backBody: () => wrap(`${CASE}<rect class="pr-cavity" x="10" y="10" width="130" height="180" rx="44"/>
${pcb(22, 26, 106, 36, 3)}${socket(...CONNS.bat)}${jackMark(75, 197, 18, 5)}
<circle class="pr-side-btn" cx="75" cy="166" r="6"/>`),
  frontBody: () => wrap(`${CASE}<rect class="pr-case-tray" x="10" y="10" width="130" height="180" rx="44"/>
<circle class="pr-cavity" cx="40" cy="70" r="26"/><circle class="pr-cavity" cx="110" cy="70" r="26"/>
<rect class="pr-cavity" x="31" y="84" width="18" height="58" rx="9"/><rect class="pr-cavity" x="101" y="84" width="18" height="58" rx="9"/>
<circle class="pr-case-led" cx="75" cy="168" r="3"/>${jackMark(75, 197, 18, 5)}`),
  part: (id, s) => wrap({
    budL: () => bud(40, 'budL', s),
    budR: () => bud(110, 'budR', s),
    shell: () => `<rect class="pr-plastic" x="2" y="2" width="146" height="196" rx="50" fill="url(#pr-g-plastic)"/>
<path class="pr-sheen" d="M2 90 148 40v24L2 114Z"/><g class="pr-logo" transform="translate(75 100) scale(0.55) translate(-90 -166)">${logo(s.model.logo)}</g>
<rect class="pr-heat" x="2" y="2" width="146" height="196" rx="50"/>`,
    battery: () => `${cell(35, 80, 80, 60, s, 'battery', '500 mAh')}<rect class="pr-flex" x="69" y="68" width="12" height="14" rx="2"/>`,
  }[id]()),
  plug: (id) => wrap(plugBody(...CONNS[id], 'down')),
  screw: () => '',
};
