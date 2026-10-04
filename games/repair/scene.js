// Рисунки мастерской — разметка SVG строками: телефон (корпус, крышка, плата, детали, шлейфы, винты, экран),
// лотки, клиент и значки инструментов. Цвета — только классы и CSS-переменные (game.css): у модели свой цвет
// крышки (.pr-col-*), физические детали (плата, батарея, металл) — переменные оформления.
//
// Сцена — viewBox 360×440: телефон 180×380 в точке (PX, PY), слева и справа лотки. Детали рисуются в координатах
// телефона внутри <g transform="translate(PX PY)">, а их рамки (BOX) — в координатах сцены: по ним считается, куда
// и в каком масштабе деталь ляжет в лоток.

export const W = 360;
export const H = 440;
export const PX = 90;
export const PY = 30;

const box = (x, y, w, h) => ({ x: PX + x, y: PY + y, w, h });

/** Рамки деталей на телефоне (координаты сцены). */
export const BOX = {
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
  screen: box(10, 10, 160, 360),
};

/** Места в лотках: центр и наибольший размер. */
export const TRAY = {
  cover: { cx: 45, cy: 74, w: 72, h: 128 },
  display: { cx: 45, cy: 214, w: 72, h: 128 },
  battery: { cx: 45, cy: 352, w: 74, h: 140 },
  shield: { cx: 315, cy: 156, w: 70, h: 80 },
  camera: { cx: 315, cy: 236, w: 56, h: 56 },
  bracket: { cx: 315, cy: 290, w: 72, h: 30 },
  speaker: { cx: 296, cy: 340, w: 34, h: 34 },
  port: { cx: 336, cy: 342, w: 34, h: 40 },
};

/** Винты: место на телефоне и ячейка на магнитном коврике. */
export const SCREW_AT = {
  s1: [84, 26], s2: [158, 26], s3: [84, 140], s4: [158, 140], s5: [50, 344], s6: [130, 344],
};
export const MAT = { x: 278, y: 8, w: 74, h: 96 };
export const MAT_CELL = {
  s1: [296, 26], s2: [334, 26], s3: [296, 56], s4: [334, 56], s5: [296, 86], s6: [334, 86],
};

/** Разъёмы на плате (координаты телефона). */
export const CONN_AT = { cam: [92, 58], disp: [146, 58], bat: [118, 126], usb: [90, 344] };

/** Гнездо зарядки и кнопка питания (сзади кнопка слева, спереди — справа). */
export const JACK = box(66, 362, 48, 30);
export const BUTTON = { back: box(-14, 88, 22, 70), front: box(172, 88, 22, 70) };

export const abs = ([x, y]) => [PX + x, PY + y];
const inPhone = (body) => `<g transform="translate(${PX} ${PY})">${body}</g>`;

// ---------- общие определения ----------

export function defs() {
  return `<defs>
  <linearGradient id="pr-g-cover" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" style="stop-color: var(--ph-cover-1)"/><stop offset="1" style="stop-color: var(--ph-cover-2)"/>
  </linearGradient>
  <linearGradient id="pr-g-metal" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" style="stop-color: var(--metal-1)"/><stop offset="0.55" style="stop-color: var(--metal-2)"/><stop offset="1" style="stop-color: var(--metal-3)"/>
  </linearGradient>
  <radialGradient id="pr-g-lens" cx="0.35" cy="0.3" r="0.8">
    <stop offset="0" stop-color="#5b6b8c"/><stop offset="0.35" stop-color="#1c2233"/><stop offset="1" stop-color="#05070c"/>
  </radialGradient>
  <linearGradient id="pr-g-wall" x1="0" y1="0" x2="0.4" y2="1">
    <stop offset="0" style="stop-color: var(--wall-1)"/><stop offset="1" style="stop-color: var(--wall-2)"/>
  </linearGradient>
  <linearGradient id="pr-g-glass" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#1b1e26"/><stop offset="1" stop-color="#07080b"/>
  </linearGradient>
  <clipPath id="pr-clip-screen"><rect x="10" y="10" width="160" height="360" rx="17"/></clipPath>
  <clipPath id="pr-clip-phone"><rect x="0" y="0" width="180" height="380" rx="26"/></clipPath>
</defs>`;
}

// ---------- лотки ----------

export function trays() {
  const dish = (x, y, w, h) => `<rect class="pr-dish" x="${x}" y="${y}" width="${w}" height="${h}" rx="14"/>`;
  const cells = Object.values(MAT_CELL).map(([x, y]) => `<circle class="pr-mat-cell" cx="${x}" cy="${y}" r="11"/>`).join('');
  return `${dish(4, 6, 82, 428)}${dish(276, 112, 80, 322)}
<rect class="pr-mat" x="${MAT.x}" y="${MAT.y}" width="${MAT.w}" height="${MAT.h}" rx="10"/>${cells}`;
}

// ---------- корпус ----------

/** Корпус сзади: рамка, внутренность, плата с чипами, коррозия, разъёмы-гнёзда, индикатор влаги, гнездо, кнопки. */
export function backBody() {
  const chips = [
    [86, 74, 26, 22], [118, 92, 30, 18], [90, 104, 20, 14], [150, 104, 12, 26], [122, 72, 14, 12], [100, 26, 40, 12],
  ].map(([x, y, w, h]) => `<rect class="pr-chip" x="${x}" y="${y}" width="${w}" height="${h}" rx="2"/>`).join('');
  const traces = '<path class="pr-trace" d="M78 40h20v14M150 40h14M78 120h26l8 -8M140 130h24M160 80v20M110 150v-10"/>';
  const sockets = Object.entries(CONN_AT).map(([id, [x, y]]) => `<rect class="pr-socket" data-socket="${id}" x="${x - 9}" y="${y - 5}" width="18" height="10" rx="2"/>`).join('');
  const corrosion = '<g class="pr-corrosion">'
    + '<path d="M96 88c6-5 14-2 15 4s-3 12-10 11-11-10-5-15Z"/><path d="M134 96c5-3 12 0 12 6s-6 9-11 7-6-10-1-13Z"/>'
    + '<path d="M118 70c4-2 8 1 7 5s-5 6-8 4-3-7 1-9Z"/><path d="M146 122c3-3 9-1 9 3s-4 7-8 6-4-6-1-9Z"/>'
    + '<circle cx="108" cy="118" r="3"/><circle cx="130" cy="84" r="2.4"/><circle cx="102" cy="76" r="2"/></g>';
  return inPhone(`
<rect class="pr-body" x="0" y="0" width="180" height="380" rx="26"/>
<rect class="pr-cavity" x="7" y="7" width="166" height="366" rx="20"/>
<path class="pr-flexline" d="M66 342h-46v-196h22"/>
<rect class="pr-pcb" x="12" y="12" width="156" height="142" rx="12"/>
${traces}${chips}${sockets}${corrosion}
<rect class="pr-indicator" x="20" y="334" width="16" height="14" rx="2"/>
<path class="pr-indicator-x" d="M23 337l10 8M33 337l-10 8"/>
<rect class="pr-cavity-line" x="16" y="156" width="148" height="166" rx="10"/>
${jack()}
<rect class="pr-side-btn" x="-3" y="96" width="4" height="52" rx="2"/>
<rect class="pr-side-btn" x="179" y="80" width="4" height="34" rx="2"/><rect class="pr-side-btn" x="179" y="120" width="4" height="34" rx="2"/>`);
}

/** Корпус спереди без экрана: рамка, клеевой контур, прорезь для шлейфа. */
export function frontBody() {
  return inPhone(`
<rect class="pr-body" x="0" y="0" width="180" height="380" rx="26"/>
<rect class="pr-midframe" x="6" y="6" width="168" height="368" rx="21"/>
<rect class="pr-glue" x="11" y="11" width="158" height="358" rx="17"/>
<rect class="pr-slot" x="${180 - 160}" y="46" width="22" height="10" rx="3"/>
<rect class="pr-midframe-plate" x="30" y="90" width="120" height="200" rx="10"/>
${jack()}
<rect class="pr-side-btn" x="179" y="96" width="4" height="52" rx="2"/>
<rect class="pr-side-btn" x="-3" y="80" width="4" height="34" rx="2"/><rect class="pr-side-btn" x="-3" y="120" width="4" height="34" rx="2"/>`);
}

/** Гнездо зарядки на нижнем торце и пух в нём (виден, если гнездо забито). */
function jack() {
  return `<rect class="pr-jack" x="78" y="372" width="24" height="7" rx="3.5"/>
<g class="pr-lint"><path d="M80 377c3-3 6 1 9-2s6 2 9-1 4 2 3 3" /><circle cx="85" cy="375" r="1.6"/><circle cx="95" cy="376" r="1.4"/></g>
<g class="pr-soot"><ellipse cx="90" cy="375.5" rx="13" ry="4"/></g>
<g class="pr-grille">${[0, 1, 2, 3, 4].map((k) => `<circle cx="${120 + k * 7}" cy="376" r="1.6"/><circle cx="${60 - k * 7}" cy="376" r="1.6"/>`).join('')}</g>`;
}

// ---------- детали ----------

const LENSES = {
  2: [[30, 33, 10], [30, 61, 10]],
  3: [[29, 31, 9], [29, 59, 9], [55, 45, 9]],
};

const LOGOS = {
  pear: '<path d="M90 150c-4 0-6 4-6 8 0 4-8 8-8 18a14 14 0 0 0 28 0c0-10-8-14-8-18 0-4-2-8-6-8Z"/><path d="M90 150c1-5 4-7 8-8" fill="none" stroke-width="2.5"/>',
  star: '<path d="M90 148l6 13 14 2-10 10 2.5 14L90 180l-12.5 7 2.5-14-10-10 14-2Z"/>',
  cloud: '<path d="M76 182a10 10 0 0 1 2-20 13 13 0 0 1 25-2 10 10 0 0 1 3 22Z"/>',
  dot: '<circle cx="90" cy="166" r="13"/>',
  ring: '<circle cx="90" cy="166" r="13" fill="none" stroke-width="5"/>',
  leaf: '<path d="M78 180c0-20 14-30 26-30 0 18-10 32-26 30Z"/><path d="M78 180l14-14" fill="none" stroke-width="2"/>',
  drop: '<path d="M90 148c8 12 12 18 12 24a12 12 0 0 1-24 0c0-6 4-12 12-24Z"/>',
};

export function logo(id) {
  return LOGOS[id] ?? LOGOS.dot;
}

/** Трещины от точки удара: лучи с изломами и паутинка — по зерну. */
export function crackPath(cx, cy, seed, { x0 = 10, y0 = 10, w = 160, h = 360, rays = 9, scale = 1 } = {}) {
  let a = seed >>> 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const x = x0 + cx * w;
  const y = y0 + cy * h;
  let d = '';
  const ends = [];
  for (let k = 0; k < rays; k++) {
    const ang = (k / rays) * Math.PI * 2 + rnd() * 0.5;
    const len = (60 + rnd() * 140) * scale;
    let px = x;
    let py = y;
    d += `M${px.toFixed(1)} ${py.toFixed(1)}`;
    const pts = [];
    for (let s = 1; s <= 4; s++) {
      const r = (len * s) / 4;
      const j = (rnd() - 0.5) * 0.35;
      px = Math.min(x0 + w, Math.max(x0, x + Math.cos(ang + j) * r));
      py = Math.min(y0 + h, Math.max(y0, y + Math.sin(ang + j) * r));
      d += `L${px.toFixed(1)} ${py.toFixed(1)}`;
      pts.push([px, py]);
    }
    ends.push(pts);
  }
  // паутинка: дуги между соседними лучами на двух радиусах
  for (const ring of [0, 1]) {
    for (let k = 0; k < rays; k++) {
      if (rnd() < 0.35) continue;
      const p = ends[k][ring];
      const q = ends[(k + 1) % rays][ring];
      d += `M${p[0].toFixed(1)} ${p[1].toFixed(1)}L${q[0].toFixed(1)} ${q[1].toFixed(1)}`;
    }
  }
  return d;
}

function cover(s) {
  const lens = (LENSES[s.model.cams] ?? LENSES[2]).map(([x, y, r]) => `<circle class="pr-lens-ring" cx="${x}" cy="${y}" r="${r + 2}"/>`
    + `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#pr-g-lens)"/><circle class="pr-lens-hi" cx="${x - r * 0.3}" cy="${y - r * 0.35}" r="${r * 0.22}"/>`).join('');
  const flash = s.model.cams === 3 ? '<circle class="pr-flash" cx="55" cy="22" r="3.2"/>' : '<circle class="pr-flash" cx="58" cy="33" r="4"/><circle class="pr-mic" cx="58" cy="61" r="1.8"/>';
  const glass = s.parts.cover.broken
    ? `<path class="pr-crack pr-crack-small" d="${crackPath(0.5, 0.3, s.crack.seed, { x0: 18, y0: 21, w: 24, h: 22, rays: 6, scale: 0.09 })}"/>`
    : '';
  return `
<rect class="pr-cover" x="3" y="3" width="174" height="374" rx="23" fill="url(#pr-g-cover)"/>
<path class="pr-sheen" d="M3 150 177 40v34L3 184Z"/>
<rect class="pr-bump" x="12" y="12" width="62" height="70" rx="17"/>${lens}${flash}${glass}
<g class="pr-logo">${logo(s.model.logo)}</g>
<text class="pr-model" x="90" y="350" text-anchor="middle">${esc(s.model.name)}</text>
<rect class="pr-cover-gap" x="174" y="40" width="5" height="300" rx="2.5"/>
<ellipse class="pr-bulge" cx="90" cy="240" rx="60" ry="70"/>
<rect class="pr-heat" x="3" y="3" width="174" height="374" rx="23"/>`;
}

function shield() {
  const holes = ['s1', 's2', 's3', 's4'].map((id) => SCREW_AT[id]).map(([x, y]) => `<circle class="pr-hole" cx="${x}" cy="${y}" r="5.2"/>`).join('');
  return `<path class="pr-metal" d="M80 16h82a6 6 0 0 1 6 6v122a6 6 0 0 1-6 6H80a6 6 0 0 1-6-6V22a6 6 0 0 1 6-6Z" fill="url(#pr-g-metal)"/>
<path class="pr-metal-line" d="M84 44h74M84 122h74M96 36v94"/>
<rect class="pr-metal-dent" x="104" y="56" width="48" height="52" rx="4"/>
<text class="pr-stamp" x="128" y="86" text-anchor="middle">EMI</text>${holes}`;
}

function bracket() {
  const holes = ['s5', 's6'].map((id) => SCREW_AT[id]).map(([x, y]) => `<circle class="pr-hole" cx="${x}" cy="${y}" r="5.2"/>`).join('');
  return `<rect class="pr-metal" x="40" y="326" width="100" height="36" rx="6" fill="url(#pr-g-metal)"/>
<path class="pr-metal-line" d="M62 334h56M62 354h56"/>${holes}`;
}

function battery(s) {
  const swollen = s.parts.battery.broken === 'swollen';
  const body = swollen
    ? '<path class="pr-battery" d="M28 160h124c8 0 12 4 13 12 4 40 4 100 0 136-1 8-5 12-13 12H28c-8 0-12-4-13-12-4-36-4-96 0-136 1-8 5-12 13-12Z"/>'
      + '<ellipse class="pr-battery-hi" cx="78" cy="214" rx="40" ry="26"/>'
    : '<rect class="pr-battery" x="16" y="158" width="148" height="162" rx="9"/>';
  const worn = s.parts.battery.broken === 'worn';
  return `${body}
<rect class="pr-battery-label" x="30" y="188" width="120" height="74" rx="5"/>
<text class="pr-battery-text" x="42" y="210">Li-ion 3.87 V</text>
<text class="pr-battery-text pr-battery-big" x="42" y="232">4500 mAh</text>
<text class="pr-battery-text" x="42" y="250">${worn ? 'ИЗНОС 62%' : 'Только оригинал'}</text>
<path class="pr-battery-icon" d="M122 228h18v26h-18Z M127 224h8v4h-8Z"/>
<path class="pr-tab" d="M40 316h22l4 18H44Z"/><path class="pr-tab" d="M118 316h22l-4 18h-22Z"/>
<rect class="pr-flex" x="111" y="130" width="14" height="30" rx="2"/>`;
}

function camera(s) {
  const lens = (LENSES[s.model.cams] ?? LENSES[2]).map(([x, y, r]) => `<circle class="pr-cam-ring" cx="${x}" cy="${y}" r="${r + 1}"/>`
    + `<circle cx="${x}" cy="${y}" r="${r - 1.5}" fill="url(#pr-g-lens)"/><circle class="pr-lens-hi" cx="${x - r * 0.3}" cy="${y - r * 0.35}" r="${r * 0.2}"/>`).join('');
  const dead = s.parts.camera.broken ? '<path class="pr-scorch" d="M40 64c6-6 18-4 20 4s-6 14-14 12-12-10-6-16Z"/>' : '';
  return `<rect class="pr-cam-body" x="14" y="14" width="54" height="64" rx="10"/>${lens}${dead}
<path class="pr-flex" d="M66 42h14l8 10v6h-6v-4l-6-6h-10Z"/>`;
}

function speaker(s) {
  const holes = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) holes.push(`<circle cx="${132 + c * 8}" cy="${340 + r * 8}" r="1.7"/>`);
  const torn = s.parts.speaker.broken ? '<path class="pr-tear" d="M134 344l8 6-4 4 10 8"/>' : '';
  return `<rect class="pr-speaker" x="124" y="330" width="40" height="40" rx="6"/>
<g class="pr-mesh">${holes.join('')}</g>${torn}
<g class="pr-dust"><circle cx="134" cy="342" r="3.2"/><circle cx="148" cy="350" r="4"/><circle cx="140" cy="360" r="2.8"/><circle cx="156" cy="340" r="2.2"/><circle cx="153" cy="362" r="3"/><path d="M128 352c4-3 8 1 12-2"/></g>`;
}

function port(s) {
  const burnt = s.parts.port.broken ? '<path class="pr-scorch" d="M82 358c4-5 14-5 17 0s-3 10-9 10-11-5-8-10Z"/>' : '';
  return `<rect class="pr-pcb pr-port-board" x="62" y="330" width="56" height="40" rx="4"/>
<rect class="pr-chip" x="68" y="352" width="12" height="10" rx="1.5"/><rect class="pr-chip" x="100" y="352" width="12" height="10" rx="1.5"/>
<rect class="pr-usb" x="77" y="366" width="26" height="12" rx="5"/><rect class="pr-usb-in" x="81" y="369" width="18" height="5" rx="2.5"/>${burnt}`;
}

/** Дисплей: стекло, экран (состояния — по data-screen на узле детали), трещины, прогрев. */
function display(s) {
  const crack = s.parts.display.broken
    ? `<g class="pr-cracks"><path class="pr-crack" d="${crackPath(s.crack.x, s.crack.y, s.crack.seed)}"/><circle class="pr-impact" cx="${(10 + s.crack.x * 160).toFixed(1)}" cy="${(10 + s.crack.y * 360).toFixed(1)}" r="5"/></g>`
    : '';
  const apps = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) apps.push(`<rect class="pr-app pr-app-${(r * 4 + c) % 8}" x="${22 + c * 37}" y="${136 + r * 44}" width="25" height="25" rx="7"/>`);
  const dock = [0, 1, 2, 3].map((c) => `<rect class="pr-app pr-app-${(c + 5) % 8}" x="${30 + c * 33}" y="${330}" width="22" height="22" rx="6"/>`).join('');
  const ads = `<g class="pr-ads">
  <g class="pr-ad" data-ad="0"><rect x="24" y="150" width="112" height="70" rx="8" class="pr-ad-box"/><text class="pr-ad-title" x="80" y="176" text-anchor="middle">ВЫ ВЫИГРАЛИ!</text><text class="pr-ad-sub" x="80" y="194" text-anchor="middle">Жми скорее 🎁</text><circle class="pr-ad-x" cx="130" cy="156" r="8"/><path class="pr-ad-xx" d="M126.5 152.5l7 7M133.5 152.5l-7 7"/></g>
  <g class="pr-ad" data-ad="1"><rect x="44" y="246" width="112" height="62" rx="8" class="pr-ad-box pr-ad-box-2"/><text class="pr-ad-title" x="100" y="270" text-anchor="middle">ТЕЛЕФОН ЗАРАЖЁН</text><text class="pr-ad-sub" x="100" y="288" text-anchor="middle">Скачай очистку!</text><circle class="pr-ad-x" cx="150" cy="252" r="8"/><path class="pr-ad-xx" d="M146.5 248.5l7 7M153.5 248.5l-7 7"/></g>
</g>`;
  return `<rect class="pr-glass" x="2" y="2" width="176" height="376" rx="24" fill="url(#pr-g-glass)"/>
<g clip-path="url(#pr-clip-screen)">
  <rect class="pr-scr-off" x="10" y="10" width="160" height="360"/>
  <g class="pr-scr pr-scr-home">
    <rect x="10" y="10" width="160" height="360" fill="url(#pr-g-wall)"/>
    <circle class="pr-wall-blob" cx="150" cy="70" r="70"/><circle class="pr-wall-blob" cx="30" cy="300" r="90"/>
    <text class="pr-status" x="24" y="27">9:41</text>
    <rect class="pr-status-bat" x="140" y="19" width="18" height="9" rx="2.5"/><rect class="pr-status-bat-in" x="142" y="21" width="12" height="5" rx="1.2"/>
    <text class="pr-clock" x="90" y="92" text-anchor="middle">12:30</text>
    <text class="pr-date" x="90" y="110" text-anchor="middle">вторник, 5 октября</text>
    ${apps.join('')}
    <rect class="pr-dock" x="20" y="322" width="140" height="38" rx="14"/>${dock}
    ${ads}
  </g>
  <g class="pr-scr pr-scr-logo"><rect x="10" y="10" width="160" height="360" class="pr-scr-black"/><g class="pr-boot-logo">${logo(s.model.logo)}</g></g>
  <g class="pr-scr pr-scr-flicker"><rect x="10" y="10" width="160" height="360" class="pr-scr-black"/>
    <rect class="pr-stripe" x="10" y="120" width="160" height="6"/><rect class="pr-stripe pr-stripe-2" x="10" y="210" width="160" height="14"/><rect class="pr-stripe" x="10" y="280" width="160" height="3"/></g>
  <g class="pr-scr pr-scr-dark"><rect x="10" y="10" width="160" height="360" class="pr-scr-dark-bg"/></g>
  <g class="pr-scr pr-scr-empty"><rect x="10" y="10" width="160" height="360" class="pr-scr-black"/>
    <rect class="pr-big-bat" x="62" y="168" width="52" height="28" rx="5"/><rect class="pr-big-bat-tip" x="114" y="176" width="5" height="12" rx="1.5"/><rect class="pr-big-bat-low" x="66" y="172" width="6" height="20" rx="1.5"/></g>
  <g class="pr-scr pr-scr-charge"><rect x="10" y="10" width="160" height="360" class="pr-scr-black"/>
    <rect class="pr-big-bat pr-big-bat-ok" x="62" y="168" width="52" height="28" rx="5"/><rect class="pr-big-bat-tip pr-big-bat-ok" x="114" y="176" width="5" height="12" rx="1.5"/><rect class="pr-big-bat-fill" x="66" y="172" width="30" height="20" rx="1.5"/><path class="pr-bolt" d="M92 166l-10 18h8l-4 14 12-20h-8l4-12Z"/></g>
  <g class="pr-scr pr-scr-scan"><rect x="10" y="10" width="160" height="360" class="pr-scan-bg"/>
    <path class="pr-scan-shield" d="M90 130l26 10v20c0 18-12 30-26 36-14-6-26-18-26-36v-20Z"/><path class="pr-scan-check" d="M78 162l8 8 16-16"/>
    <text class="pr-scan-text" x="90" y="230" text-anchor="middle">Сканирую…</text>
    <rect class="pr-scan-track" x="40" y="244" width="100" height="6" rx="3"/><rect class="pr-scan-bar" x="40" y="244" width="100" height="6" rx="3"/>
    <rect class="pr-scan-line" x="10" y="10" width="160" height="3"/></g>
  <g class="pr-scr pr-scr-clean"><rect x="10" y="10" width="160" height="360" class="pr-scan-bg"/>
    <path class="pr-scan-shield" d="M90 140l26 10v20c0 18-12 30-26 36-14-6-26-18-26-36v-20Z"/><path class="pr-scan-check pr-scan-ok" d="M78 172l8 8 16-16"/>
    <text class="pr-scan-text" x="90" y="240" text-anchor="middle">Угроз нет</text></g>
  <g class="pr-scr pr-scr-flash"><rect x="10" y="10" width="160" height="360" class="pr-scr-black"/>
    <g class="pr-boot-logo pr-flash-logo">${logo(s.model.logo)}</g>
    <rect class="pr-scan-track" x="40" y="220" width="100" height="6" rx="3"/><rect class="pr-flash-bar" x="40" y="220" width="100" height="6" rx="3"/></g>
</g>
<circle class="pr-front-cam" cx="90" cy="22" r="4.5"/>
${crack}
<rect class="pr-glass-edge" x="2.5" y="2.5" width="175" height="375" rx="23.5"/>
<rect class="pr-heat" x="2" y="2" width="176" height="376" rx="24"/>`;
}

const DRAW = { cover, shield, bracket, battery, camera, speaker, port, display };

/** Разметка детали (внутри узла детали). */
export function partMarkup(id, s) {
  return inPhone(DRAW[id](s));
}

/** Штекер шлейфа над гнездом: состояние (on/off/loose) — data-state у узла. */
export function plugMarkup(id) {
  const [x, y] = CONN_AT[id];
  return inPhone(`<g class="pr-plug-body"><rect class="pr-plug-flex" x="${x - 6}" y="${y - (id === 'bat' ? -4 : 14)}" width="12" height="12" rx="1"/>
<rect class="pr-plug" x="${x - 10}" y="${y - 6.5}" width="20" height="13" rx="2.5"/><rect class="pr-plug-hi" x="${x - 7}" y="${y - 4}" width="14" height="3" rx="1.2"/></g>`);
}

export function screwMarkup(id) {
  const [x, y] = SCREW_AT[id];
  return inPhone(`<g class="pr-screw-head"><circle class="pr-screw" cx="${x}" cy="${y}" r="4.8"/><circle class="pr-screw-hi" cx="${x - 1.3}" cy="${y - 1.3}" r="1.6"/>
<path class="pr-screw-slot" d="M${x - 2.6} ${y}h5.2M${x} ${y - 2.6}v5.2"/></g>`);
}

// ---------- клиент ----------

const HAIR = [
  '<path d="M13 20c0-8 5-12 11-12s11 4 11 12c-2-4-6-6-11-6s-9 2-11 6Z"/>',                                   // коротко
  '<path d="M12 22c0-9 5-14 12-14s12 5 12 14v12c-2 0-3-2-3-4V20c-2-3-5-5-9-5s-7 2-9 5v10c0 2-1 4-3 4Z"/>',          // длинные
  '<path d="M13 20c0-8 5-12 11-12s11 4 11 12c-2-4-6-6-11-6s-9 2-11 6Z"/><circle cx="24" cy="6" r="5"/>',          // пучок
  '<path d="M12.5 19c0-6 5-10 11.5-10S35.5 13 35.5 19c-3-1-7-2-11.5-2s-8.5 1-11.5 2Z"/><path d="M11 19h26v3H11Z"/>', // кепка
  '<path d="M14 16c1-3 3-5 5-5M34 16c-1-3-3-5-5-5"/>',                                                         // почти лысый
];

const MOUTH = {
  calm: '<path d="M20.5 27.5c2 1.2 5 1.2 7 0" fill="none"/>',
  happy: '<path d="M19.5 26c2.2 3.5 6.8 3.5 9 0Z" class="pr-av-mouth-open"/>',
  sad: '<path d="M20.5 29c2-1.6 5-1.6 7 0" fill="none"/>',
  shock: '<ellipse cx="24" cy="28" rx="2.2" ry="2.8" class="pr-av-mouth-open"/>',
};

/** Аватар клиента (viewBox 0 0 48 48); mood: calm | happy | sad | shock. */
export function avatar(c, mood = 'calm') {
  const glasses = c.glasses ? '<g class="pr-av-glasses"><circle cx="19.5" cy="21" r="3.6"/><circle cx="28.5" cy="21" r="3.6"/><path d="M23 21h2"/></g>' : '';
  const brows = mood === 'sad' || mood === 'shock' ? '<path class="pr-av-brow" d="M17 16.5l4-1M31 16.5l-4-1"/>' : '<path class="pr-av-brow" d="M17 16l4-0.6M31 16l-4-0.6"/>';
  return `<svg viewBox="0 0 48 48" aria-hidden="true" class="pr-av pr-av-skin-${c.skin} pr-av-hair-${c.hairColor}">
<circle class="pr-av-bg pr-av-bg-${c.bg}" cx="24" cy="24" r="24"/>
<path class="pr-av-shirt" d="M8 48c1-9 7-13 16-13s15 4 16 13Z"/>
<rect class="pr-av-skin" x="20.5" y="29" width="7" height="8" rx="3"/>
<circle class="pr-av-skin" cx="24" cy="21" r="11"/>
<g class="pr-av-hair">${HAIR[c.hair % HAIR.length]}</g>
<circle class="pr-av-eye" cx="19.5" cy="21" r="1.4"/><circle class="pr-av-eye" cx="28.5" cy="21" r="1.4"/>
${brows}<g class="pr-av-mouth">${MOUTH[mood] ?? MOUTH.calm}</g>${glasses}
<circle class="pr-av-cheek" cx="16.5" cy="25" r="2"/><circle class="pr-av-cheek" cx="31.5" cy="25" r="2"/>
</svg>`;
}

// ---------- значки инструментов (цветные, 32×32) ----------

const icon = (body) => `<svg viewBox="0 0 32 32" aria-hidden="true">${body}</svg>`;

export const TOOL_ICONS = {
  heat: icon('<path d="M4 9h15l5 3v4l-5 3H4a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2Z" fill="#ff7a45"/><path d="M8 19h7l1 9H9Z" fill="#3a3f4a"/>'
    + '<rect x="24" y="11.5" width="4" height="5" rx="1" fill="#9aa3ae"/><path d="M27 6c1.5 2-1.5 3 0 5M30 6c1.5 2-1.5 3 0 5" stroke="#ffb547" stroke-width="1.5" fill="none" stroke-linecap="round"/>'
    + '<rect x="5" y="11" width="9" height="2.4" rx="1.2" fill="#fff" opacity="0.45"/>'),
  suction: icon('<path d="M5 24c0-6 5-10 11-10s11 4 11 10Z" fill="#3d8bfd"/><ellipse cx="16" cy="24" rx="11" ry="2.6" fill="#2a6fd6"/>'
    + '<rect x="14" y="7" width="4" height="8" rx="1.5" fill="#5a6270"/><circle cx="16" cy="6.5" r="3.6" fill="none" stroke="#5a6270" stroke-width="2"/>'
    + '<path d="M9 19c2-2 4-3 6-3" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round" opacity="0.5"/>'),
  screwdriver: icon('<rect x="3" y="12" width="13" height="8" rx="3.5" fill="#e5484d"/><path d="M6 13v6M9 13v6M12 13v6" stroke="#b62d33" stroke-width="1.2"/>'
    + '<rect x="16" y="14.6" width="10" height="2.8" fill="#aab2bd"/><path d="M26 14.6l3.5 1.4-3.5 1.4Z" fill="#7f8894"/>'),
  spudger: icon('<path d="M4 26 22 8l4-1-1 4L7 29Z" fill="#2b2e35"/><path d="M22 8l4-1-1 4" fill="#4a505b"/>'
    + '<path d="M18 23c3-7 7-11 11-12l-1 5c-4 1-7 4-10 7Z" fill="#4dc3a0"/>'),
  tweezers: icon('<path d="M6 4l10 22 10-22" fill="none" stroke="#9aa3ae" stroke-width="3" stroke-linejoin="round"/>'
    + '<path d="M6 4l10 22" stroke="#d9dee5" stroke-width="1.2" fill="none"/><rect x="13" y="25" width="6" height="3" rx="1.5" fill="#7f8894"/>'),
  parts: icon('<path d="M4 11l12-5 12 5v13l-12 5-12-5Z" fill="#d9a066"/><path d="M4 11l12 5 12-5M16 16v13" stroke="#b07a42" stroke-width="1.3" fill="none"/>'
    + '<path d="M10 8.5l12 5" stroke="#f3d29c" stroke-width="2.4"/><path d="M24 2.5l1 2.2 2.3.4-1.7 1.6.4 2.3-2-1.1-2 1.1.4-2.3-1.7-1.6 2.3-.4Z" fill="#ffd23d"/>'),
  brush: icon('<path d="M3 29l12-12 3 3L6 32Z" fill="#c98f58"/><path d="M15 17l3 3 3-3-3-3Z" fill="#aab2bd"/>'
    + '<path d="M18 14l3 3 8-8c-2-3-4-4-6-4Z" fill="#f2d16b"/><path d="M21 11l4-4M23 13l4-4" stroke="#cfa940" stroke-width="1"/>'),
  alcohol: icon('<rect x="9" y="11" width="14" height="18" rx="4" fill="#e9f4ff" stroke="#9cc4ec" stroke-width="1.2"/>'
    + '<path d="M10 19h12v6a3 3 0 0 1-3 3h-6a3 3 0 0 1-3-3Z" fill="#4aa8ff"/><rect x="12.5" y="5" width="7" height="6" rx="1.5" fill="#3d8bfd"/>'
    + '<rect x="14" y="2" width="4" height="3" rx="1" fill="#2a6fd6"/><text x="16" y="17.5" text-anchor="middle" font-size="5.5" font-weight="800" fill="#2a6fd6">IPA</text>'),
  magnifier: icon('<circle cx="13" cy="13" r="8.5" fill="#cfe8ff" stroke="#5a6270" stroke-width="3"/><path d="M19.5 19.5 28 28" stroke="#c98f58" stroke-width="4.5" stroke-linecap="round"/>'
    + '<path d="M9 10a5 5 0 0 1 4-3" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round"/>'),
  charger: icon('<rect x="8" y="3" width="16" height="15" rx="3" fill="#f4f6f8" stroke="#c4cbd4" stroke-width="1.2"/>'
    + '<path d="M17 6l-4 6h3l-1 4 4-6h-3Z" fill="#ffc533"/><path d="M16 18v4c0 4 4 4 8 6" stroke="#c4cbd4" stroke-width="2.4" fill="none" stroke-linecap="round"/>'),
  antivirus: icon('<path d="M16 3l11 4v8c0 7-5 12-11 14C10 27 5 22 5 15V7Z" fill="#33c27f"/><path d="M16 3l11 4v8c0 7-5 12-11 14Z" fill="#26a56a"/>'
    + '<path d="M10.5 15.5l4 4 7-8" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
  flash: icon('<rect x="4" y="6" width="24" height="15" rx="2" fill="#3a3f4a"/><rect x="6" y="8" width="20" height="11" rx="1" fill="#4dc3ff"/>'
    + '<path d="M2 23h28l-2 3H4Z" fill="#9aa3ae"/><rect x="8" y="15" width="16" height="2" rx="1" fill="#1d6fa0"/><rect x="8" y="15" width="9" height="2" rx="1" fill="#fff"/>'
    + '<path d="M16 9.5v4M14 11.5l2 2 2-2" stroke="#fff" stroke-width="1.4" fill="none" stroke-linecap="round"/>'),
};

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
