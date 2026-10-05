// Смартфон: 180×380, слева лоток для крышки, экрана и батареи, справа магнитный коврик и мелкие детали.
// Сзади — стеклянная крышка на клею с блоком камер, под ней плата под металлическим экраном (4 винта), батарея,
// внизу планка (2 винта) над динамиком и платой зарядки. Спереди — дисплей на клею.

import { frame, pcb, screwHead, hole, plugBody, socket, jackMark, corrosion, screenStates, crackPath, logo, esc } from '../scene.js';

const F = frame(90, 30);
const { box, pt, wrap } = F;

const SCREWS = { s1: [84, 26], s2: [158, 26], s3: [84, 140], s4: [158, 140], s5: [50, 344], s6: [130, 344] };
const CONNS = { cam: [92, 58], disp: [146, 58], bat: [118, 126], usb: [90, 344] };
const FLEX = { cam: 'left', disp: 'right', bat: 'down', usb: 'down' };
const LENSES = {
  2: [[30, 33, 10], [30, 61, 10]],
  3: [[29, 31, 9], [29, 59, 9], [55, 45, 9]],
};

const sideButtons = (left) => (left
  ? '<rect class="pr-side-btn" x="-3" y="96" width="4" height="52" rx="2"/><rect class="pr-side-btn" x="179" y="80" width="4" height="34" rx="2"/><rect class="pr-side-btn" x="179" y="120" width="4" height="34" rx="2"/>'
  : '<rect class="pr-side-btn" x="179" y="96" width="4" height="52" rx="2"/><rect class="pr-side-btn" x="-3" y="80" width="4" height="34" rx="2"/><rect class="pr-side-btn" x="-3" y="120" width="4" height="34" rx="2"/>');
const grille = `<g class="pr-grille">${[0, 1, 2, 3, 4].map((k) => `<circle cx="${120 + k * 7}" cy="376" r="1.6"/><circle cx="${60 - k * 7}" cy="376" r="1.6"/>`).join('')}</g>`;

function backBody() {
  return wrap(`<rect class="pr-body" x="0" y="0" width="180" height="380" rx="26"/>
<rect class="pr-cavity" x="7" y="7" width="166" height="366" rx="20"/>
<path class="pr-flexline" d="M66 342h-46v-196h22"/>
${pcb(12, 12, 156, 142, 6, 12)}
${Object.values(CONNS).map(([x, y]) => socket(x, y)).join('')}${corrosion(122, 98)}
<rect class="pr-indicator" x="20" y="334" width="16" height="14" rx="2"/><path class="pr-indicator-x" d="M23 337l10 8M33 337l-10 8"/>
<rect class="pr-cavity-line" x="16" y="156" width="148" height="166" rx="10"/>
${jackMark(90, 375.5)}${grille}${sideButtons(true)}`);
}

function frontBody() {
  return wrap(`<rect class="pr-body" x="0" y="0" width="180" height="380" rx="26"/>
<rect class="pr-midframe" x="6" y="6" width="168" height="368" rx="21"/>
<rect class="pr-glue" x="11" y="11" width="158" height="358" rx="17"/>
<rect class="pr-slot" x="20" y="46" width="22" height="10" rx="3"/>
<rect class="pr-midframe-plate" x="30" y="90" width="120" height="200" rx="10"/>
${jackMark(90, 375.5)}${grille}${sideButtons(false)}`);
}

const lensMarkup = (s, ring, inset) => (LENSES[s.model.cams] ?? LENSES[2]).map(([x, y, r]) => `<circle class="${ring}" cx="${x}" cy="${y}" r="${r + 2 - inset}"/>`
  + `<circle cx="${x}" cy="${y}" r="${r - inset * 1.5}" fill="url(#pr-g-lens)"/><circle class="pr-lens-hi" cx="${x - r * 0.3}" cy="${y - r * 0.35}" r="${r * 0.22}"/>`).join('');

const DRAW = {
  cover: (s) => {
    const flash = s.model.cams === 3 ? '<circle class="pr-flash" cx="55" cy="22" r="3.2"/>' : '<circle class="pr-flash" cx="58" cy="33" r="4"/><circle class="pr-mic" cx="58" cy="61" r="1.8"/>';
    const glass = s.parts.cover.broken
      ? `<path class="pr-crack pr-crack-small" d="${crackPath(0.5, 0.3, s.crack.seed, { x0: 18, y0: 21, w: 24, h: 22, rays: 6, scale: 0.09 })}"/>` : '';
    return `<rect class="pr-cover" x="3" y="3" width="174" height="374" rx="23" fill="url(#pr-g-cover)"/>
<path class="pr-sheen" d="M3 150 177 40v34L3 184Z"/>
<rect class="pr-bump" x="12" y="12" width="62" height="70" rx="17"/>${lensMarkup(s, 'pr-lens-ring', 0)}${flash}${glass}
<g class="pr-logo">${logo(s.model.logo)}</g>
<text class="pr-model" x="90" y="350" text-anchor="middle">${esc(s.model.name)}</text>
<rect class="pr-cover-gap" x="174" y="40" width="5" height="300" rx="2.5"/>
<ellipse class="pr-bulge" cx="90" cy="240" rx="60" ry="70"/>
<rect class="pr-heat" x="3" y="3" width="174" height="374" rx="23"/>`;
  },
  shield: () => `<path class="pr-metal" d="M80 16h82a6 6 0 0 1 6 6v122a6 6 0 0 1-6 6H80a6 6 0 0 1-6-6V22a6 6 0 0 1 6-6Z" fill="url(#pr-g-metal)"/>
<path class="pr-metal-line" d="M84 44h74M84 122h74M96 36v94"/><rect class="pr-metal-dent" x="104" y="56" width="48" height="52" rx="4"/>
<text class="pr-stamp" x="128" y="86" text-anchor="middle">EMI</text>${['s1', 's2', 's3', 's4'].map((id) => hole(...SCREWS[id])).join('')}`,
  bracket: () => `<rect class="pr-metal" x="40" y="326" width="100" height="36" rx="6" fill="url(#pr-g-metal)"/>
<path class="pr-metal-line" d="M62 334h56M62 354h56"/>${hole(...SCREWS.s5)}${hole(...SCREWS.s6)}`,
  battery: (s) => {
    const swollen = s.parts.battery.broken === 'swollen';
    const body = swollen
      ? '<path class="pr-battery" d="M28 160h124c8 0 12 4 13 12 4 40 4 100 0 136-1 8-5 12-13 12H28c-8 0-12-4-13-12-4-36-4-96 0-136 1-8 5-12 13-12Z"/><ellipse class="pr-battery-hi" cx="78" cy="214" rx="40" ry="26"/>'
      : '<rect class="pr-battery" x="16" y="158" width="148" height="162" rx="9"/>';
    return `${body}
<rect class="pr-battery-label" x="30" y="188" width="120" height="74" rx="5"/>
<text class="pr-battery-text" x="42" y="210">Li-ion 3.87 V</text>
<text class="pr-battery-text pr-battery-big" x="42" y="232">4500 mAh</text>
<text class="pr-battery-text" x="42" y="250">${s.parts.battery.broken === 'worn' ? 'ИЗНОС 62%' : 'Только оригинал'}</text>
<path class="pr-battery-icon" d="M122 228h18v26h-18Z M127 224h8v4h-8Z"/>
<path class="pr-tab" d="M40 316h22l4 18H44Z"/><path class="pr-tab" d="M118 316h22l-4 18h-22Z"/>
<rect class="pr-flex" x="111" y="130" width="14" height="30" rx="2"/>`;
  },
  camera: (s) => `<rect class="pr-cam-body" x="14" y="14" width="54" height="64" rx="10"/>${lensMarkup(s, 'pr-cam-ring', 1)}
${s.parts.camera.broken ? '<path class="pr-scorch" d="M40 64c6-6 18-4 20 4s-6 14-14 12-12-10-6-16Z"/>' : ''}
<path class="pr-flex" d="M66 42h14l8 10v6h-6v-4l-6-6h-10Z"/>`,
  speaker: (s) => {
    const holes = [];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) holes.push(`<circle cx="${132 + c * 8}" cy="${340 + r * 8}" r="1.7"/>`);
    return `<rect class="pr-speaker" x="124" y="330" width="40" height="40" rx="6"/><g class="pr-mesh">${holes.join('')}</g>
${s.parts.speaker.broken ? '<path class="pr-tear" d="M134 344l8 6-4 4 10 8"/>' : ''}
<g class="pr-dust"><circle cx="134" cy="342" r="3.2"/><circle cx="148" cy="350" r="4"/><circle cx="140" cy="360" r="2.8"/><circle cx="156" cy="340" r="2.2"/><circle cx="153" cy="362" r="3"/><path d="M128 352c4-3 8 1 12-2"/></g>`;
  },
  port: (s) => `<rect class="pr-pcb pr-port-board" x="62" y="330" width="56" height="40" rx="4"/>
<rect class="pr-chip" x="68" y="352" width="12" height="10" rx="1.5"/><rect class="pr-chip" x="100" y="352" width="12" height="10" rx="1.5"/>
<rect class="pr-usb" x="77" y="366" width="26" height="12" rx="5"/><rect class="pr-usb-in" x="81" y="369" width="18" height="5" rx="2.5"/>
${s.parts.port.broken ? '<path class="pr-scorch" d="M82 358c4-5 14-5 17 0s-3 10-9 10-11-5-8-10Z"/>' : ''}`,
  display: (s) => {
    const apps = [];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) apps.push(`<rect class="pr-app pr-app-${(r * 4 + c) % 8}" x="${22 + c * 37}" y="${136 + r * 44}" width="25" height="25" rx="7"/>`);
    const dock = [0, 1, 2, 3].map((c) => `<rect class="pr-app pr-app-${(c + 5) % 8}" x="${30 + c * 33}" y="330" width="22" height="22" rx="6"/>`).join('');
    const ads = `<g class="pr-ads">
  <g class="pr-ad" data-ad="0"><rect x="24" y="150" width="112" height="70" rx="8" class="pr-ad-box"/><text class="pr-ad-title" x="80" y="176" text-anchor="middle">ВЫ ВЫИГРАЛИ!</text><text class="pr-ad-sub" x="80" y="194" text-anchor="middle">Жми скорее 🎁</text><circle class="pr-ad-x" cx="130" cy="156" r="8"/><path class="pr-ad-xx" d="M126.5 152.5l7 7M133.5 152.5l-7 7"/></g>
  <g class="pr-ad" data-ad="1"><rect x="44" y="246" width="112" height="62" rx="8" class="pr-ad-box pr-ad-box-2"/><text class="pr-ad-title" x="100" y="270" text-anchor="middle">ТЕЛЕФОН ЗАРАЖЁН</text><text class="pr-ad-sub" x="100" y="288" text-anchor="middle">Скачай очистку!</text><circle class="pr-ad-x" cx="150" cy="252" r="8"/><path class="pr-ad-xx" d="M146.5 248.5l7 7M153.5 248.5l-7 7"/></g>
</g>`;
    const home = `<rect x="10" y="10" width="160" height="360" fill="url(#pr-g-wall)"/>
<circle class="pr-wall-blob" cx="150" cy="70" r="70"/><circle class="pr-wall-blob" cx="30" cy="300" r="90"/>
<text class="pr-status" x="24" y="27">9:41</text>
<rect class="pr-status-bat" x="140" y="19" width="18" height="9" rx="2.5"/><rect class="pr-status-bat-in" x="142" y="21" width="12" height="5" rx="1.2"/>
<text class="pr-clock" x="90" y="92" text-anchor="middle">12:30</text><text class="pr-date" x="90" y="110" text-anchor="middle">вторник, 5 октября</text>
${apps.join('')}<rect class="pr-dock" x="20" y="322" width="140" height="38" rx="14"/>${dock}${ads}`;
    return `<rect class="pr-glass" x="2" y="2" width="176" height="376" rx="24" fill="url(#pr-g-glass)"/>
${screenStates({ x: 10, y: 10, w: 160, h: 360, rx: 17 }, s, home)}
<circle class="pr-front-cam" cx="90" cy="22" r="4.5"/>
<rect class="pr-glass-edge" x="2.5" y="2.5" width="175" height="375" rx="23.5"/>
<rect class="pr-heat" x="2" y="2" width="176" height="376" rx="24"/>`;
  },
};

const at = (o) => Object.fromEntries(Object.entries(o).map(([k, [x, y]]) => [k, pt(x, y)]));

export default {
  kind: 'phone',
  origin: [180, 220],
  DISHES: [[4, 6, 82, 428], [276, 112, 80, 322]],
  MAT: { x: 278, y: 8, w: 74, h: 96 },
  MAT_CELL: { s1: [296, 26], s2: [334, 26], s3: [296, 56], s4: [334, 56], s5: [296, 86], s6: [334, 86] },
  BOX: {
    cover: box(0, 0, 180, 380),
    display: box(0, 0, 180, 380),
    shield: box(74, 16, 94, 134),
    bracket: box(40, 326, 100, 36),
    battery: box(16, 158, 148, 162),
    camera: box(14, 14, 54, 64),
    speaker: box(124, 330, 40, 40),
    port: box(62, 330, 56, 48),
    board: box(74, 16, 94, 134),
    indicator: box(18, 332, 20, 18),
  },
  SCREEN: box(10, 10, 160, 360),
  ADS: [pt(130, 156), pt(150, 252)],
  TRAY: {
    cover: { cx: 45, cy: 74, w: 72, h: 128 },
    display: { cx: 45, cy: 214, w: 72, h: 128 },
    battery: { cx: 45, cy: 352, w: 74, h: 140 },
    shield: { cx: 315, cy: 156, w: 70, h: 80 },
    camera: { cx: 315, cy: 236, w: 56, h: 56 },
    bracket: { cx: 315, cy: 290, w: 72, h: 30 },
    speaker: { cx: 296, cy: 340, w: 34, h: 34 },
    port: { cx: 336, cy: 342, w: 34, h: 40 },
  },
  SCREW_AT: at(SCREWS),
  CONN_AT: at(CONNS),
  SPOT_AT: { jack: pt(90, 376), speaker: pt(144, 350), board: pt(121, 83) },
  JACK: { back: box(66, 362, 48, 30), front: box(66, 362, 48, 30) },
  BUTTON: { back: box(-14, 88, 22, 70), front: box(172, 88, 22, 70) },
  ORDER: { back: ['camera', 'battery', 'port', 'speaker', 'plugs', 'shield', 'bracket', 'cover'], front: ['display'] },
  backBody,
  frontBody,
  part: (id, s) => wrap(DRAW[id](s)),
  plug: (id) => wrap(plugBody(...CONNS[id], FLEX[id])),
  screw: (id) => wrap(screwHead(...SCREWS[id])),
};
