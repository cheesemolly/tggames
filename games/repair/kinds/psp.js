// Карманка — карманная приставка 300×120 с дисками (сверху сцены, лотки снизу). Спереди — экран (без клея, держится
// шлейфом), крестовина, аналоговая «шишечка», кнопки. Сзади — дверца батареи и съёмная батарея, корпус на 4 винтах
// (открывается только без батареи — так и правильно), внутри привод дисков, модуль шишечки и плата.

import { frame, screwHead, hole, plugBody, socket, jackMark, corrosion, screenStates, logo } from '../scene.js';

const F = frame(30, 46);
const { box, pt, wrap } = F;

const BODY = 'M60 0H240A60 60 0 0 1 240 120H60A60 60 0 0 1 60 0Z';
const SCREWS = { h1: [36, 26], h2: [264, 26], h3: [36, 94], h4: [264, 94] };
const CONNS = { umd: [148, 30], disp: [196, 20], nub: [262, 60] };
const FLEX = { umd: 'left', disp: 'up', nub: 'down' };
const BAY = 'M156 34h76a4 4 0 0 1 4 4v66a4 4 0 0 1-4 4h-76a4 4 0 0 1-4-4V38a4 4 0 0 1 4-4Z';

const edge = (front) => `${jackMark(150, 118, 16, 5)}<rect class="pr-side-btn" x="${front ? 296 : 0}" y="48" width="4" height="22" rx="2"/>`;

function frontBody() {
  return wrap(`<path class="pr-plastic" d="${BODY}" fill="url(#pr-g-plastic)"/>
<rect class="pr-midframe" x="70" y="10" width="160" height="100" rx="4"/><rect class="pr-slot" x="84" y="54" width="22" height="10" rx="3"/>
<path class="pr-dpad" d="M34 34h10v8h8v10h-8v8H34v-8h-8V42h8Z"/>
<circle class="pr-stick-cap" cx="40" cy="90" r="9"/><circle class="pr-stick-top" cx="40" cy="90" r="6"/>
${[[262, 36], [274, 48], [262, 60], [250, 48]].map(([x, y]) => `<circle class="pr-abxy" cx="${x}" cy="${y}" r="5"/>`).join('')}
<rect class="pr-mini-btn" x="250" y="86" width="10" height="4" rx="2"/><rect class="pr-mini-btn" x="266" y="86" width="10" height="4" rx="2"/>
${edge(true)}`);
}

function backBody() {
  const chips = [[170, 50, 18, 14], [200, 70, 22, 16], [240, 26, 14, 12], [176, 82, 14, 12]]
    .map(([x, y, w, h]) => `<rect class="pr-chip" x="${x}" y="${y}" width="${w}" height="${h}" rx="2"/>`).join('');
  return wrap(`<path class="pr-plastic" d="${BODY}" fill="url(#pr-g-plastic)"/>
<path class="pr-cavity" d="M62 8H238A52 52 0 0 1 238 112H62A52 52 0 0 1 62 8Z"/>
<rect class="pr-pcb" x="140" y="10" width="140" height="100" rx="10"/>
<path class="pr-trace" d="M150 50h20M240 100h20M166 100h30M268 40v20"/>${chips}
${Object.values(CONNS).map(([x, y]) => socket(x, y)).join('')}${corrosion(206, 62, 0.8)}${edge(false)}`);
}

const SCREEN = { x: 78, y: 16, w: 144, h: 82, rx: 2 };

const DRAW = {
  door: () => `<rect class="pr-plastic pr-door" x="148" y="30" width="92" height="82" rx="8" fill="url(#pr-g-plastic)"/>
<path class="pr-door-ridge" d="M160 44h68M160 52h68M160 60h68"/><rect class="pr-latch" x="178" y="98" width="32" height="6" rx="3"/>`,
  battery: (s) => `<rect class="pr-battery" x="156" y="38" width="76" height="66" rx="5"/>
<rect class="pr-battery-label" x="162" y="48" width="64" height="40" rx="3"/>
<text class="pr-battery-text" x="168" y="64">3.6 V</text><text class="pr-battery-text" x="168" y="78">${s.parts.battery.broken === 'worn' ? 'ИЗНОС 64%' : '1200 mAh'}</text>
<rect class="pr-gold" x="184" y="38" width="6" height="6" rx="1"/><rect class="pr-gold" x="196" y="38" width="6" height="6" rx="1"/>`,
  shell: (s) => `<path class="pr-plastic pr-shell" fill="url(#pr-g-plastic)" fill-rule="evenodd" d="${BODY} ${BAY}"/>
<circle class="pr-umd-window" cx="80" cy="60" r="38"/><circle class="pr-umd-hub" cx="80" cy="60" r="8"/>
<g class="pr-logo" transform="translate(80 60) scale(0.5) translate(-90 -166)">${logo(s.model.logo)}</g>
${Object.values(SCREWS).map(([x, y]) => hole(x, y)).join('')}`,
  umd: (s) => `<rect class="pr-umd-tray" x="22" y="12" width="118" height="96" rx="10"/>
<circle class="pr-disc" cx="80" cy="60" r="36"/><circle class="pr-disc-shine" cx="80" cy="60" r="28"/><circle class="pr-umd-hub" cx="80" cy="60" r="7"/>
<rect class="pr-laser-rail" x="112" y="20" width="6" height="80" rx="3"/><rect class="pr-laser" x="108" y="52" width="14" height="14" rx="3"/>
${s.parts.umd.broken ? '<path class="pr-scorch" d="M108 80c4-4 12-3 14 2s-4 9-9 8-8-6-5-10Z"/>' : ''}
<rect class="pr-flex" x="128" y="26" width="10" height="8" rx="1"/>`,
  nub: (s) => `<rect class="pr-stick-module" x="242" y="72" width="40" height="34" rx="5"/><circle class="pr-stick-base" cx="262" cy="89" r="11"/><circle class="pr-stick-top" cx="262" cy="89" r="6"/>
${s.parts.nub.broken ? '<circle class="pr-worn-ring" cx="262" cy="89" r="9"/>' : ''}<rect class="pr-flex" x="257" y="64" width="10" height="9" rx="1"/>`,
  display: (s) => {
    const icons = ['⚙', '🖼', '♪', '🎬', '🎮'].map((t, k) => `<circle class="pr-xmb-dot pr-app-${(k * 3) % 8}" cx="${96 + k * 26}" cy="40" r="7"/>`).join('');
    const home = `<rect x="78" y="16" width="144" height="82" class="pr-xmb-bg"/>
<path class="pr-xmb-wave" d="M78 70c30-16 60 14 90-2s40-10 54-4v34H78Z"/><path class="pr-xmb-wave pr-xmb-wave-2" d="M78 78c40-12 70 10 100-6s30 0 44 4v26H78Z"/>
${icons}<rect class="pr-cursor" x="87" y="31" width="18" height="18" rx="5"/>
<text class="pr-ui-title" x="88" y="62">Игра</text><text class="pr-ui-time" x="214" y="26" text-anchor="end">12:30</text>`;
    return `<rect class="pr-glass" x="70" y="10" width="160" height="100" rx="4" fill="url(#pr-g-glass)"/>
${screenStates(SCREEN, s, home)}
<rect class="pr-flex" x="190" y="104" width="12" height="8" rx="1"/>
<rect class="pr-glass-edge" x="70.5" y="10.5" width="159" height="99" rx="3.5"/>`;
  },
};

const at = (o) => Object.fromEntries(Object.entries(o).map(([k, [x, y]]) => [k, pt(x, y)]));

export default {
  kind: 'psp',
  origin: [180, 106],
  DISHES: [[6, 186, 226, 248], [238, 186, 116, 248]],
  MAT: { x: 242, y: 190, w: 108, h: 62 },
  MAT_CELL: { h1: [270, 207], h2: [322, 207], h3: [270, 235], h4: [322, 235] },
  BOX: {
    door: box(148, 30, 92, 82),
    battery: box(156, 38, 76, 66),
    shell: box(0, 0, 300, 120),
    umd: box(22, 12, 118, 96),
    nub: box(242, 64, 40, 42),
    display: box(70, 10, 160, 100),
    board: box(140, 10, 140, 100),
  },
  SCREEN: box(SCREEN.x, SCREEN.y, SCREEN.w, SCREEN.h),
  TRAY: {
    shell: { cx: 119, cy: 234, w: 200, h: 84 },
    display: { cx: 119, cy: 322, w: 200, h: 70 },
    umd: { cx: 56, cy: 396, w: 80, h: 64 },
    battery: { cx: 140, cy: 396, w: 62, h: 54 },
    door: { cx: 200, cy: 396, w: 50, h: 46 },
    nub: { cx: 296, cy: 330, w: 44, h: 40 },
  },
  SCREW_AT: at(SCREWS),
  CONN_AT: at(CONNS),
  SPOT_AT: { jack: pt(150, 118), board: pt(206, 62) },
  JACK: { back: box(133, 108, 34, 24), front: box(133, 108, 34, 24) },
  BUTTON: { back: box(-14, 44, 24, 30), front: box(290, 44, 24, 30) },
  ORDER: { back: ['umd', 'nub', 'plugs', 'shell', 'battery', 'door'], front: ['display'] },
  backBody,
  frontBody,
  part: (id, s) => wrap(DRAW[id](s)),
  plug: (id) => wrap(plugBody(...CONNS[id], FLEX[id])),
  screw: (id) => wrap(screwHead(...SCREWS[id])),
};
