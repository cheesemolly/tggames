// Пауэрбанк 140×250. Спереди — индикатор заряда и кнопка; сзади — корпус на 2 винтах, внутри банки аккумулятора
// (вздутые — пухлые) со шлейфом и плата; гнёзда — на нижнем торце.

import { frame, screwHead, hole, plugBody, socket, jackMark, pcb, PORTRAIT, trayLayout } from '../scene.js';

const F = frame(110, 90);
const { box, pt, wrap } = F;

const SCREWS = { h1: [20, 18], h2: [120, 232] };
const CONNS = { bat: [70, 188] };

function cells(s) {
  const b = s.parts.battery.broken;
  const out = [0, 1, 2].map((k) => {
    const x = 18 + k * 36;
    return b === 'swollen'
      ? `<rect class="pr-cell18650" x="${x - 3}" y="30" width="34" height="146" rx="14"/>`
      : `<rect class="pr-cell18650" x="${x}" y="32" width="30" height="142" rx="10"/><rect class="pr-cell-top" x="${x + 8}" y="32" width="14" height="6" rx="2"/>`;
  }).join('');
  return `${out}<rect class="pr-cell-wrap" x="16" y="88" width="108" height="26" rx="3"/>
<text class="pr-battery-text" x="70" y="105" text-anchor="middle" style="font-size:9px">${b === 'worn' ? 'ИЗНОС 55%' : '3 × 3400 mAh'}</text>`;
}

export default {
  kind: 'powerbank',
  origin: [180, 215],
  ...trayLayout(PORTRAIT, { shell: 'L1', battery: 'L2', pcb: 'R1' }, ['h1', 'h2']),
  BOX: {
    shell: box(0, 0, 140, 250),
    battery: box(14, 28, 112, 150),
    pcb: box(14, 196, 112, 44),
  },
  CONN_AT: { bat: pt(...CONNS.bat) },
  SCREW_AT: Object.fromEntries(Object.entries(SCREWS).map(([k, v]) => [k, pt(...v)])),
  SPOT_AT: { jack: pt(70, 250) },
  JACK: { front: box(48, 238, 44, 24), back: box(48, 238, 44, 24) },
  BUTTON: { front: box(118, 30, 26, 30), back: null },
  ORDER: { back: ['pcb', 'battery', 'plugs', 'shell'], front: [] },
  backBody: () => wrap(`<rect class="pr-body" x="0" y="0" width="140" height="250" rx="16"/><rect class="pr-cavity" x="6" y="6" width="128" height="238" rx="12"/>
${socket(...CONNS.bat)}${jackMark(70, 248, 22, 6)}`),
  frontBody: (s) => wrap(`<rect class="pr-plastic" x="0" y="0" width="140" height="250" rx="16" fill="url(#pr-g-plastic)"/><path class="pr-sheen" d="M0 100 140 40v26L0 126Z"/>
${[0, 1, 2, 3].map((k) => `<circle class="pr-pb-led${k < 3 ? ' on' : ''}" cx="${46 + k * 16}" cy="210" r="4"/>`).join('')}
<text class="pr-model" x="70" y="130" text-anchor="middle">${s.model.name}</text><rect class="pr-side-btn" x="136" y="36" width="5" height="18" rx="2"/>${jackMark(70, 248, 22, 6)}`),
  part: (id, s) => wrap({
    shell: () => `<rect class="pr-plastic pr-shell" x="2" y="2" width="136" height="246" rx="15" fill="url(#pr-g-plastic)"/>
<rect class="pr-sticker" x="30" y="90" width="80" height="60" rx="4"/><text class="pr-sticker-text pr-dark-text" x="70" y="118" text-anchor="middle">5V ⎓ 3A</text>
<text class="pr-sticker-text pr-dark-text" x="70" y="134" text-anchor="middle">${s.model.code}</text>${hole(...SCREWS.h1)}${hole(...SCREWS.h2)}
<rect class="pr-cover-gap" x="134" y="40" width="5" height="160" rx="2.5"/><ellipse class="pr-bulge" cx="70" cy="110" rx="50" ry="70"/>`,
    battery: () => `${cells(s)}<rect class="pr-flex" x="64" y="174" width="12" height="12" rx="1"/>`,
    pcb: () => `${pcb(14, 196, 112, 44, 4)}${s.parts.pcb.broken ? '<path class="pr-scorch" d="M60 210c4-5 14-5 17 0s-3 10-9 10-11-5-8-10Z"/>' : ''}`,
  }[id]()),
  plug: (id) => wrap(plugBody(...CONNS[id], 'up')),
  screw: (id) => wrap(screwHead(...SCREWS[id])),
};
