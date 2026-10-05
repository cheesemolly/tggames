// Планшет 180×280: как большой смартфон. Сзади — крышка на клею, экран платы на 4 винтах (под ним разъёмы батареи
// и экрана), батарея, динамик, плата зарядки со шлейфом; спереди — экран на клею.

import { frame, screwHead, hole, plugBody, socket, jackMark, corrosion, screenStates, homeTiles, pcb, cell, logo, esc, PORTRAIT, trayLayout } from '../scene.js';

const F = frame(90, 80);
const { box, pt, wrap } = F;

const SCREWS = { s1: [70, 26], s2: [160, 26], s3: [70, 112], s4: [160, 112] };
const CONNS = { disp: [90, 60], bat: [140, 96], usb: [90, 236] };
const SCREEN = { x: 10, y: 10, w: 160, h: 260, rx: 10 };
const sideBtn = (left) => `<rect class="pr-side-btn" x="${left ? -3 : 179}" y="40" width="4" height="30" rx="2"/>`;

export default {
  kind: 'tablet',
  origin: [180, 220],
  ...trayLayout(PORTRAIT, { cover: 'L1', display: 'L2', battery: 'L3', shield: 'R1', port: 'R3', speaker: 'R4' }, ['s1', 's2', 's3', 's4']),
  BOX: {
    cover: box(0, 0, 180, 280),
    display: box(0, 0, 180, 280),
    shield: box(60, 16, 110, 108),
    battery: box(14, 130, 152, 92),
    speaker: box(128, 238, 40, 30),
    port: box(68, 226, 44, 46),
    board: box(60, 16, 110, 108),
  },
  SCREEN: box(SCREEN.x, SCREEN.y, SCREEN.w, SCREEN.h),
  CONN_AT: Object.fromEntries(Object.entries(CONNS).map(([k, v]) => [k, pt(...v)])),
  SCREW_AT: Object.fromEntries(Object.entries(SCREWS).map(([k, v]) => [k, pt(...v)])),
  SPOT_AT: { jack: pt(90, 277), speaker: pt(148, 253), board: pt(115, 70) },
  JACK: { front: box(70, 266, 40, 24), back: box(70, 266, 40, 24) },
  BUTTON: { front: box(172, 34, 22, 42), back: box(-14, 34, 22, 42) },
  ORDER: { back: ['battery', 'port', 'speaker', 'plugs', 'shield', 'cover'], front: ['display'] },
  backBody: () => wrap(`<rect class="pr-body" x="0" y="0" width="180" height="280" rx="18"/><rect class="pr-cavity" x="7" y="7" width="166" height="266" rx="13"/>
${pcb(12, 14, 156, 112, 6)}${Object.values(CONNS).map(([x, y]) => socket(x, y)).join('')}${corrosion(115, 70, 0.8)}${jackMark(90, 276)}${sideBtn(true)}`),
  frontBody: () => wrap(`<rect class="pr-body" x="0" y="0" width="180" height="280" rx="18"/><rect class="pr-midframe" x="6" y="6" width="168" height="268" rx="14"/>
<rect class="pr-glue" x="11" y="11" width="158" height="258" rx="10"/><rect class="pr-slot" x="80" y="56" width="22" height="10" rx="3"/>${jackMark(90, 276)}${sideBtn(false)}`),
  part: (id, s) => wrap({
    cover: () => `<rect class="pr-cover" x="3" y="3" width="174" height="274" rx="16" fill="url(#pr-g-cover)"/><path class="pr-sheen" d="M3 120 177 40v30L3 150Z"/>
<rect class="pr-bump" x="12" y="12" width="34" height="34" rx="10"/><circle class="pr-lens-ring" cx="29" cy="29" r="10"/><circle cx="29" cy="29" r="7" fill="url(#pr-g-lens)"/>
<g class="pr-logo" transform="translate(90 140) scale(0.8) translate(-90 -166)">${logo(s.model.logo)}</g>
<text class="pr-model" x="90" y="250" text-anchor="middle">${esc(s.model.name)}</text>
<rect class="pr-cover-gap" x="174" y="40" width="5" height="200" rx="2.5"/><ellipse class="pr-bulge" cx="90" cy="170" rx="60" ry="60"/><rect class="pr-heat" x="3" y="3" width="174" height="274" rx="16"/>`,
    shield: () => `<rect class="pr-metal" x="60" y="16" width="110" height="108" rx="6" fill="url(#pr-g-metal)"/><path class="pr-metal-line" d="M66 44h98M66 98h98"/>
<text class="pr-stamp" x="115" y="74" text-anchor="middle">EMI</text>${Object.values(SCREWS).map(([x, y]) => hole(x, y)).join('')}`,
    battery: () => `${cell(14, 130, 152, 92, s, 'battery', '8000 mAh')}<rect class="pr-flex" x="133" y="100" width="14" height="32" rx="2"/>`,
    speaker: () => {
      const holes = [];
      for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) holes.push(`<circle cx="${136 + c * 8}" cy="${248 + r * 9}" r="1.7"/>`);
      return `<rect class="pr-speaker" x="128" y="238" width="40" height="30" rx="5"/><g class="pr-mesh">${holes.join('')}</g>
${s.parts.speaker.broken ? '<path class="pr-tear" d="M134 244l8 6-4 4 10 6"/>' : ''}<g class="pr-dust"><circle cx="138" cy="250" r="3"/><circle cx="154" cy="256" r="3.5"/></g>`;
    },
    port: () => `<rect class="pr-pcb pr-port-board" x="68" y="226" width="44" height="42" rx="4"/><rect class="pr-usb" x="77" y="262" width="26" height="12" rx="5"/>
<rect class="pr-usb-in" x="81" y="265" width="18" height="5" rx="2.5"/>${s.parts.port.broken ? '<path class="pr-scorch" d="M80 250c4-5 14-5 17 0s-3 10-9 10-11-5-8-10Z"/>' : ''}`,
    display: () => `<rect class="pr-glass" x="2" y="2" width="176" height="276" rx="16" fill="url(#pr-g-glass)"/>
${screenStates(SCREEN, s, `${homeTiles(SCREEN.x, SCREEN.y, SCREEN.w, SCREEN.h, 12)}<text class="pr-status" x="20" y="24">9:41</text>`)}
<circle class="pr-front-cam" cx="90" cy="6" r="2.5"/><rect class="pr-glass-edge" x="2.5" y="2.5" width="175" height="275" rx="15.5"/><rect class="pr-heat" x="2" y="2" width="176" height="276" rx="16"/>`,
  }[id]()),
  plug: (id) => wrap(plugBody(...CONNS[id], id === 'bat' ? 'down' : id === 'usb' ? 'down' : 'up')),
  screw: (id) => wrap(screwHead(...SCREWS[id])),
};
