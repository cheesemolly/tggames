// Кнопочный телефон: 130×300. Сзади — крышка на защёлках и съёмная батарея (без шлейфа: вынул — обесточил).
// Спереди — панель на защёлках, под ней резиновая клавиатура, под ней пластина на двух винтах и модуль экрана,
// шлейф экрана — на плате под клавиатурой. Экран — зелёный ЖК.

import { frame, pcb, screwHead, hole, plugBody, socket, jackMark, corrosion, screenStates, logo, esc } from '../scene.js';

const F = frame(115, 70);
const { box, pt, wrap } = F;

const SCREWS = { s1: [20, 124], s2: [110, 124] };
const CONNS = { disp: [65, 150] };
const KEYS = [];
for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) KEYS.push([30 + c * 35, 196 + r * 24]);
const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

const topButton = '<rect class="pr-side-btn" x="52" y="-3" width="26" height="4" rx="2"/>';

function frontBody() {
  return wrap(`<rect class="pr-body" x="0" y="0" width="130" height="300" rx="22"/>
<rect class="pr-cavity" x="6" y="6" width="118" height="288" rx="18"/>
${pcb(10, 112, 110, 178, 4, 10)}
<rect class="pr-chip" x="40" y="236" width="22" height="16" rx="2"/><rect class="pr-chip" x="76" y="210" width="16" height="16" rx="2"/>
${KEYS.map(([x, y]) => `<circle class="pr-dome" cx="${x}" cy="${y}" r="6"/>`).join('')}
${socket(...CONNS.disp)}${corrosion(65, 215, 0.9)}
${jackMark(65, 298, 16, 5)}${topButton}`);
}

function backBody() {
  return wrap(`<rect class="pr-body" x="0" y="0" width="130" height="300" rx="22"/>
<rect class="pr-cavity" x="6" y="6" width="118" height="288" rx="18"/>
<rect class="pr-battery-bay" x="16" y="104" width="98" height="144" rx="8"/>
<rect class="pr-sim" x="38" y="140" width="54" height="40" rx="4"/><text class="pr-sim-text" x="65" y="164" text-anchor="middle">SIM</text>
<rect class="pr-gold" x="52" y="108" width="6" height="10" rx="1"/><rect class="pr-gold" x="62" y="108" width="6" height="10" rx="1"/><rect class="pr-gold" x="72" y="108" width="6" height="10" rx="1"/>
<rect class="pr-label-sticker" x="30" y="196" width="70" height="34" rx="3"/><text class="pr-sticker-text" x="65" y="216" text-anchor="middle">IMEI 3550…</text>
${jackMark(65, 298, 16, 5)}${topButton}`);
}

const LCD = { x: 24, y: 36, w: 82, h: 62, rx: 3 };

const DRAW = {
  cover: (s) => `<rect class="pr-plastic" x="2" y="2" width="126" height="296" rx="20" fill="url(#pr-g-plastic)"/>
<path class="pr-sheen" d="M2 120 128 50v24L2 144Z"/>
<circle class="pr-lens-ring" cx="65" cy="40" r="9"/><circle cx="65" cy="40" r="6" fill="url(#pr-g-lens)"/>
<g class="pr-grille">${[0, 1, 2, 3, 4, 5].map((k) => `<rect x="${44 + k * 7}" y="250" width="3" height="16" rx="1.5"/>`).join('')}</g>
<g class="pr-logo" transform="translate(65 140) scale(0.6) translate(-90 -166)">${logo(s.model.logo)}</g>
<text class="pr-model" x="65" y="200" text-anchor="middle">${esc(s.model.name)}</text>
<rect class="pr-latch" x="50" y="286" width="30" height="5" rx="2.5"/>`,
  battery: (s) => `<rect class="pr-battery" x="18" y="108" width="94" height="136" rx="6"/>
<rect class="pr-battery-label" x="26" y="130" width="78" height="70" rx="4"/>
<text class="pr-battery-text" x="34" y="150">BL-5C</text><text class="pr-battery-text pr-battery-big" x="34" y="170">1020 mAh</text>
<text class="pr-battery-text" x="34" y="188">${s.parts.battery.broken === 'worn' ? 'ИЗНОС 70%' : '3.7 V Li-ion'}</text>
<rect class="pr-gold" x="52" y="110" width="6" height="8" rx="1"/><rect class="pr-gold" x="62" y="110" width="6" height="8" rx="1"/><rect class="pr-gold" x="72" y="110" width="6" height="8" rx="1"/>`,
  fascia: (s) => `<path class="pr-plastic" fill="url(#pr-g-plastic)" fill-rule="evenodd" d="M24 2h82a22 22 0 0 1 22 22v252a22 22 0 0 1-22 22H24A22 22 0 0 1 2 276V24A22 22 0 0 1 24 2Z
 M24 32h82a4 4 0 0 1 4 4v62a4 4 0 0 1-4 4H24a4 4 0 0 1-4-4V36a4 4 0 0 1 4-4Z M18 140h94a6 6 0 0 1 6 6v134a6 6 0 0 1-6 6H18a6 6 0 0 1-6-6V146a6 6 0 0 1 6-6Z"/>
<rect class="pr-earpiece" x="50" y="14" width="30" height="5" rx="2.5"/>
<text class="pr-brand" x="65" y="122" text-anchor="middle">${esc(s.model.name.split(' ')[0].toUpperCase())}</text>`,
  keypad: (s) => {
    const keys = KEYS.map(([x, y], k) => `<rect class="pr-key" x="${x - 14}" y="${y - 9}" width="28" height="18" rx="7"/><text class="pr-key-text" x="${x}" y="${y + 4}" text-anchor="middle">${DIGITS[k]}</text>`).join('');
    const worn = s.parts.keypad.broken ? '<path class="pr-key-worn" d="M58 190l12 10M56 214l14 8"/>' : '';
    return `<rect class="pr-rubber" x="10" y="138" width="110" height="150" rx="10"/>
<circle class="pr-key pr-key-nav" cx="65" cy="162" r="14"/><circle class="pr-key-dot" cx="65" cy="162" r="5"/>
<rect class="pr-key pr-key-soft" x="18" y="150" width="28" height="12" rx="6"/><rect class="pr-key pr-key-soft" x="84" y="150" width="28" height="12" rx="6"/>
<rect class="pr-key pr-key-call" x="18" y="168" width="28" height="12" rx="6"/><rect class="pr-key pr-key-end" x="84" y="168" width="28" height="12" rx="6"/>
${keys}${worn}
<g class="pr-sticky"><ellipse cx="60" cy="214" rx="26" ry="16"/><ellipse cx="86" cy="248" rx="14" ry="9"/><circle cx="40" cy="240" r="6"/></g>`;
  },
  plate: () => `<rect class="pr-metal" x="10" y="112" width="110" height="24" rx="4" fill="url(#pr-g-metal)"/>
<path class="pr-metal-line" d="M32 118h66M32 130h66"/>${hole(...SCREWS.s1)}${hole(...SCREWS.s2)}`,
  display: (s) => {
    const bars = [0, 1, 2, 3].map((k) => `<rect class="pr-lcd-ink" x="${28 + k * 4}" y="${50 - k * 3}" width="2.5" height="${4 + k * 3}"/>`).join('');
    const bat = [0, 1, 2].map((k) => `<rect class="pr-lcd-ink" x="${92}" y="${40 + k * 4}" width="10" height="2.5"/>`).join('');
    const home = `<rect x="24" y="36" width="82" height="62" fill="url(#pr-g-lcd)"/>${bars}${bat}
<text class="pr-lcd-big" x="65" y="72" text-anchor="middle">12:30</text>
<text class="pr-lcd-small" x="65" y="93" text-anchor="middle">Меню</text>`;
    return `<rect class="pr-lcd-frame" x="18" y="26" width="94" height="82" rx="6"/>
${screenStates(LCD, s, home)}
<rect class="pr-flex" x="58" y="106" width="14" height="38" rx="2"/>`;
  },
};

const at = (o) => Object.fromEntries(Object.entries(o).map(([k, [x, y]]) => [k, pt(x, y)]));

export default {
  kind: 'button',
  origin: [180, 220],
  DISHES: [[4, 6, 82, 428], [276, 76, 80, 358]],
  MAT: { x: 278, y: 8, w: 74, h: 60 },
  MAT_CELL: { s1: [298, 38], s2: [332, 38] },
  BOX: {
    cover: box(0, 0, 130, 300),
    battery: box(18, 108, 94, 136),
    fascia: box(0, 0, 130, 300),
    keypad: box(10, 138, 110, 150),
    plate: box(10, 112, 110, 24),
    display: box(18, 26, 94, 82),
    board: box(10, 138, 110, 150),
  },
  SCREEN: box(LCD.x, LCD.y, LCD.w, LCD.h),
  TRAY: {
    cover: { cx: 45, cy: 112, w: 70, h: 196 },
    fascia: { cx: 45, cy: 326, w: 70, h: 196 },
    battery: { cx: 315, cy: 132, w: 66, h: 96 },
    keypad: { cx: 315, cy: 244, w: 70, h: 96 },
    plate: { cx: 315, cy: 312, w: 70, h: 18 },
    display: { cx: 315, cy: 376, w: 70, h: 64 },
  },
  SCREW_AT: at(SCREWS),
  CONN_AT: at(CONNS),
  SPOT_AT: { jack: pt(65, 298), keys: pt(65, 215), board: pt(65, 215) },
  JACK: { back: box(48, 286, 34, 24), front: box(48, 286, 34, 24) },
  BUTTON: { back: box(46, -14, 38, 20), front: box(46, -14, 38, 20) },
  ORDER: { back: ['battery', 'cover'], front: ['display', 'plugs', 'plate', 'keypad', 'fascia'] },
  backBody,
  frontBody,
  part: (id, s) => wrap(DRAW[id](s)),
  plug: (id) => wrap(plugBody(...CONNS[id], 'up')),
  screw: (id) => wrap(screwHead(...SCREWS[id])),
};
