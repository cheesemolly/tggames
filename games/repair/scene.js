// Общие рисунки мастерской — разметка SVG строками: помощники для устройств (рамка координат, винты, штекеры,
// экран со всеми состояниями, трещины, логотипы), клиент и значки инструментов. Сами устройства — kinds/*.js.
// Цвета — только классы и CSS-переменные (game.css); у модели — свой цвет корпуса (.pr-col-* на SVG).
//
// Сцена — viewBox 360×440. Устройство рисуется в своих координатах внутри <g transform="translate(PX PY)">, а рамки
// деталей, места винтов и разъёмов отдаются в координатах сцены — по ним считаются лотки и попадание пальцем.

export const W = 360;
export const H = 440;

/** Рамка координат устройства: box/pt — в координаты сцены, wrap — обернуть разметку. */
export function frame(PX, PY) {
  return {
    PX,
    PY,
    box: (x, y, w, h) => ({ x: PX + x, y: PY + y, w, h }),
    pt: (x, y) => [PX + x, PY + y],
    wrap: (body) => `<g transform="translate(${PX} ${PY})">${body}</g>`,
  };
}

/** Головка винта (крестовая) в координатах устройства. */
export const screwHead = (x, y) => `<g class="pr-screw-head"><circle class="pr-screw" cx="${x}" cy="${y}" r="4.8"/><circle class="pr-screw-hi" cx="${x - 1.3}" cy="${y - 1.3}" r="1.6"/>
<path class="pr-screw-slot" d="M${x - 2.6} ${y}h5.2M${x} ${y - 2.6}v5.2"/></g>`;

export const hole = (x, y, r = 5.2) => `<circle class="pr-hole" cx="${x}" cy="${y}" r="${r}"/>`;

/** Штекер шлейфа над гнездом; flex — куда уходит шлейф (up, down, left, right). */
export function plugBody(x, y, flex = 'up') {
  const f = {
    up: [x - 6, y - 14, 12, 12], down: [x - 6, y + 4, 12, 12], left: [x - 18, y - 5, 12, 10], right: [x + 6, y - 5, 12, 10],
  }[flex];
  return `<g class="pr-plug-body"><rect class="pr-plug-flex" x="${f[0]}" y="${f[1]}" width="${f[2]}" height="${f[3]}" rx="1"/>
<rect class="pr-plug" x="${x - 10}" y="${y - 6.5}" width="20" height="13" rx="2.5"/><rect class="pr-plug-hi" x="${x - 7}" y="${y - 4}" width="14" height="3" rx="1.2"/></g>`;
}

/** Гнездо зарядки (снаружи, на торце): прорезь, пух (если забито) и копоть (если сгорела зарядка). */
export function jackMark(x, y, w = 24, h = 7) {
  const k = w / 24;
  return `<rect class="pr-jack" x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="${h / 2}"/>
<g class="pr-lint" transform="translate(${x} ${y}) scale(${k.toFixed(2)})"><path d="M-10 1.5c3-3 6 1 9-2s6 2 9-1 4 2 3 3"/><circle cx="-5" cy="-0.5" r="1.6"/><circle cx="5" cy="0.5" r="1.4"/></g>
<g class="pr-soot"><ellipse cx="${x}" cy="${y}" rx="${w / 2 + 1}" ry="${h / 2 + 0.5}"/></g>`;
}

/** Окисление на плате вокруг точки (после воды). */
export function corrosion(x, y, k = 1) {
  return `<g class="pr-corrosion" transform="translate(${x} ${y}) scale(${k})"><path d="M-22 -6c6-5 14-2 15 4s-3 12-10 11-11-10-5-15Z"/><path d="M16 2c5-3 12 0 12 6s-6 9-11 7-6-10-1-13Z"/>`
    + '<path d="M0 -24c4-2 8 1 7 5s-5 6-8 4-3-7 1-9Z"/><path d="M28 28c3-3 9-1 9 3s-4 7-8 6-4-6-1-9Z"/><circle cx="-10" cy="24" r="3"/><circle cx="12" cy="-10" r="2.4"/><circle cx="-16" cy="-18" r="2"/></g>';
}

/** Гнездо разъёма на плате. */
export const socket = (x, y) => `<rect class="pr-socket" x="${x - 9}" y="${y - 5}" width="18" height="10" rx="2"/>`;

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
  <linearGradient id="pr-g-plastic" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" style="stop-color: var(--ph-cover-1)"/><stop offset="1" style="stop-color: var(--ph-cover-2)"/>
  </linearGradient>
  <linearGradient id="pr-g-shade" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff" stop-opacity="0.16"/><stop offset="0.45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.22"/>
  </linearGradient>
  <linearGradient id="pr-g-deck" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#000" stop-opacity="0.28"/><stop offset="0.3" stop-color="#000" stop-opacity="0.04"/><stop offset="1" stop-color="#fff" stop-opacity="0.1"/>
  </linearGradient>
  <linearGradient id="pr-g-cyl" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#3a3e47"/><stop offset="0.4" stop-color="#8e96a3"/><stop offset="1" stop-color="#1d2026"/>
  </linearGradient>
  <radialGradient id="pr-g-drop" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="#000" stop-opacity="0.45"/><stop offset="1" stop-color="#000" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="pr-g-lcd" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#b9d98a"/><stop offset="1" stop-color="#8fbf62"/>
  </linearGradient>
</defs>`;
}


// ---------- логотипы, трещины, экран ----------

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


/**
 * Экран со всеми состояниями (по data-screen на узле детали): off, home, logo, flicker, dark, empty, charge, scan,
 * clean, flash, noos; home — разметка самого устройства. r — прямоугольник экрана в координатах устройства.
 * Значки состояний масштабируются под размер экрана; трещины и прогрев — поверх.
 */
export function screenStates(r, s, home) {
  const { x, y, w, h } = r;
  const rx = r.rx ?? 6;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const k = Math.min(w, h * 1.2) / 160;
  const id = `pr-clip-${s.kind}`;
  const bg = (cls) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" class="${cls}"/>`;
  const mid = (body) => `<g transform="translate(${cx.toFixed(1)} ${cy.toFixed(1)}) scale(${k.toFixed(3)})">${body}</g>`;
  const logoAt = (cls) => `<g class="${cls}" transform="translate(-90 -166)">${logo(s.model.logo)}</g>`;
  const crack = s.parts.display.broken
    ? `<g class="pr-cracks"><path class="pr-crack" d="${crackPath(s.crack.x, s.crack.y, s.crack.seed, { x0: x, y0: y, w, h, scale: Math.max(w, h) / 360 })}"/>`
      + `<circle class="pr-impact" cx="${(x + s.crack.x * w).toFixed(1)}" cy="${(y + s.crack.y * h).toFixed(1)}" r="${Math.max(2.5, 5 * k).toFixed(1)}"/></g>`
    : '';
  return `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"/></clipPath>
<g clip-path="url(#${id})">
  ${bg('pr-scr-off')}
  <g class="pr-scr pr-scr-home">${home}</g>
  <g class="pr-scr pr-scr-logo">${bg('pr-scr-black')}${mid(logoAt('pr-boot-logo'))}</g>
  <g class="pr-scr pr-scr-flicker">${bg('pr-scr-black')}
    <rect class="pr-stripe" x="${x}" y="${y + h * 0.3}" width="${w}" height="${h * 0.02}"/><rect class="pr-stripe pr-stripe-2" x="${x}" y="${y + h * 0.55}" width="${w}" height="${h * 0.045}"/><rect class="pr-stripe" x="${x}" y="${y + h * 0.75}" width="${w}" height="${h * 0.012}"/></g>
  <g class="pr-scr pr-scr-dark">${bg('pr-scr-dark-bg')}</g>
  <g class="pr-scr pr-scr-empty">${bg('pr-scr-black')}${mid('<rect class="pr-big-bat" x="-28" y="-14" width="52" height="28" rx="5"/><rect class="pr-big-bat-tip" x="24" y="-6" width="5" height="12" rx="1.5"/><rect class="pr-big-bat-low" x="-24" y="-10" width="6" height="20" rx="1.5"/>')}</g>
  <g class="pr-scr pr-scr-charge">${bg('pr-scr-black')}${mid('<rect class="pr-big-bat pr-big-bat-ok" x="-28" y="-14" width="52" height="28" rx="5"/><rect class="pr-big-bat-tip pr-big-bat-ok" x="24" y="-6" width="5" height="12" rx="1.5"/><rect class="pr-big-bat-fill" x="-24" y="-10" width="30" height="20" rx="1.5"/><path class="pr-bolt" d="M2 -16l-10 18h8l-4 14 12-20h-8l4-12Z"/>')}</g>
  <g class="pr-scr pr-scr-scan">${bg('pr-scan-bg')}${mid('<path class="pr-scan-shield" d="M0 -60l26 10v20c0 18-12 30-26 36-14-6-26-18-26-36v-20Z"/><path class="pr-scan-check" d="M-12 -28l8 8 16-16"/><text class="pr-scan-text" x="0" y="40" text-anchor="middle">Сканирую…</text><rect class="pr-scan-track" x="-50" y="54" width="100" height="6" rx="3"/><rect class="pr-scan-bar" x="-50" y="54" width="100" height="6" rx="3"/>')}
    <rect class="pr-scan-line" x="${x}" y="${y}" width="${w}" height="3"/></g>
  <g class="pr-scr pr-scr-clean">${bg('pr-scan-bg')}${mid('<path class="pr-scan-shield" d="M0 -50l26 10v20c0 18-12 30-26 36-14-6-26-18-26-36v-20Z"/><path class="pr-scan-check pr-scan-ok" d="M-12 -18l8 8 16-16"/><text class="pr-scan-text" x="0" y="50" text-anchor="middle">Угроз нет</text>')}</g>
  <g class="pr-scr pr-scr-flash">${bg('pr-scr-black')}${mid(`${logoAt('pr-boot-logo pr-flash-logo')}<rect class="pr-scan-track" x="-50" y="34" width="100" height="6" rx="3"/><rect class="pr-flash-bar" x="-50" y="34" width="100" height="6" rx="3"/>`)}</g>
  <g class="pr-scr pr-scr-noos">${bg('pr-scr-black')}${mid('<rect class="pr-noos-disk" x="-22" y="-40" width="44" height="30" rx="4"/><path class="pr-noos-x" d="M-8 -33l16 16M8 -33l-16 16"/><text class="pr-noos-text" x="0" y="14" text-anchor="middle">Система не найдена</text><text class="pr-noos-sub" x="0" y="32" text-anchor="middle">установите ОС с компьютера</text>')}</g>
</g>
${crack}`;
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
  // пол клиента (с 2026-10-05): у женщин — волосы и за спиной, ресницы, помада, блузка с вырезом; у мужчин — борода
  const f = c.gender === 'f';
  const back = f && c.hair === 1 ? '<path class="pr-av-hair-back" d="M12.5 21c0 10 2 17 4.5 20h14c2.5-3 4.5-10 4.5-20Z"/>' : '';
  const lashes = f ? '<path class="pr-av-lash" d="M17.6 19.4l-1.4-1.1M18.6 19l-0.6-1.4M30.4 19.4l1.4-1.1M29.4 19l0.6-1.4"/>' : '';
  const beard = c.beard ? '<path class="pr-av-beard" d="M13.6 22c0.6 9 5 14 10.4 14s9.8-5 10.4-14c-1.6 3-4.4 4.6-10.4 4.6S15.2 25 13.6 22Z"/>' : '';
  const shirt = f ? '<path class="pr-av-shirt" d="M8 48c1-9 7-13 16-13s15 4 16 13Z"/><path class="pr-av-neckline" d="M19 35l5 6 5-6"/>'
    : '<path class="pr-av-shirt" d="M8 48c1-9 7-13 16-13s15 4 16 13Z"/><path class="pr-av-collar" d="M19 35l5 4 5-4"/>';
  return `<svg viewBox="0 0 48 48" aria-hidden="true" class="pr-av pr-av-${f ? 'f' : 'm'} pr-av-skin-${c.skin} pr-av-hair-${c.hairColor}">
<circle class="pr-av-bg pr-av-bg-${c.bg}" cx="24" cy="24" r="24"/>${back}
${shirt}
<rect class="pr-av-skin" x="20.5" y="29" width="7" height="8" rx="3"/>
<circle class="pr-av-skin" cx="24" cy="21" r="11"/>${beard}
<g class="pr-av-hair">${HAIR[c.hair % HAIR.length]}</g>
<circle class="pr-av-eye" cx="19.5" cy="21" r="1.4"/><circle class="pr-av-eye" cx="28.5" cy="21" r="1.4"/>${lashes}
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

export const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ---------- набор для устройств: шаблоны лотков и частые детали ----------

/** Лотки «вертикального» устройства (слева большой, справа коврик и мелочь) и «горизонтального» (снизу). */
export const PORTRAIT = {
  DISHES: [[4, 6, 82, 428], [276, 112, 80, 322]],
  MAT: { x: 278, y: 8, w: 74, h: 96 },
  CELLS: [[296, 26], [334, 26], [296, 56], [334, 56], [296, 86], [334, 86]],
  SLOT: {
    L1: { cx: 45, cy: 74, w: 72, h: 128 }, L2: { cx: 45, cy: 214, w: 72, h: 128 }, L3: { cx: 45, cy: 352, w: 74, h: 140 },
    R1: { cx: 315, cy: 156, w: 70, h: 80 }, R2: { cx: 315, cy: 236, w: 60, h: 60 }, R3: { cx: 315, cy: 296, w: 72, h: 44 },
    R4: { cx: 315, cy: 352, w: 66, h: 52 }, R5: { cx: 315, cy: 408, w: 66, h: 44 },
  },
};
export const LANDSCAPE = {
  DISHES: [[6, 206, 226, 228], [238, 206, 116, 228]],
  MAT: { x: 242, y: 210, w: 108, h: 90 },
  CELLS: [[262, 230], [296, 230], [330, 230], [262, 256], [296, 256], [330, 256], [262, 282], [296, 282], [330, 282]],
  SLOT: {
    A1: { cx: 119, cy: 246, w: 210, h: 70 }, A2: { cx: 119, cy: 320, w: 200, h: 62 },
    B1: { cx: 52, cy: 398, w: 84, h: 52 }, B2: { cx: 128, cy: 398, w: 58, h: 52 }, B3: { cx: 194, cy: 398, w: 62, h: 52 },
    C1: { cx: 270, cy: 340, w: 44, h: 56 }, C2: { cx: 322, cy: 340, w: 44, h: 56 }, C3: { cx: 296, cy: 404, w: 100, h: 40 },
  },
};

/** Раскладка лотков: tray — { деталь: имя места шаблона }, винты — по порядку в ячейки коврика. */
export function trayLayout(T, tray, screws) {
  return {
    DISHES: T.DISHES,
    MAT: T.MAT,
    MAT_CELL: Object.fromEntries(screws.map((id, k) => [id, T.CELLS[k]])),
    TRAY: Object.fromEntries(Object.entries(tray).map(([p, slot]) => [p, T.SLOT[slot]])),
  };
}

/** Простой генератор случайных чисел по зерну — у каждой платы свой, но всегда одинаковый рисунок. */
function rnd(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f1 = (v) => +v.toFixed(1);

/** Микросхема: корпус, ножки (пунктир по краю), ключ-точка и маркировка; big — BGA с шариками под углом. */
export function chip(x, y, w, h, label = '', kind = 'qfp') {
  let out = '';
  if (kind === 'qfp') out += `<rect class="pr-chip-pins" x="${f1(x - 1.6)}" y="${f1(y - 1.6)}" width="${f1(w + 3.2)}" height="${f1(h + 3.2)}" rx="1"/>`;
  if (kind === 'soic') {
    out += `<path class="pr-chip-pins-h" d="M${f1(x + 1)} ${f1(y - 1.2)}h${f1(w - 2)}M${f1(x + 1)} ${f1(y + h + 1.2)}h${f1(w - 2)}"/>`;
  }
  out += `<rect class="pr-chip" x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" rx="${kind === 'bga' ? 1.5 : 0.8}"/>`;
  if (kind === 'bga') out += `<rect class="pr-chip-die" x="${f1(x + w * 0.22)}" y="${f1(y + h * 0.22)}" width="${f1(w * 0.56)}" height="${f1(h * 0.56)}" rx="1"/>`;
  out += `<circle class="pr-chip-dot" cx="${f1(x + 2.2)}" cy="${f1(y + 2.2)}" r="0.9"/>`;
  if (label && w >= 12 && h >= 7) out += `<text class="pr-chip-text" x="${f1(x + w / 2)}" y="${f1(y + h / 2 + 1.4)}" text-anchor="middle">${label}</text>`;
  return out;
}

/** Ряд мелких деталей (конденсаторы и резисторы) по оси. */
function passives(r, x, y, n, vertical) {
  let out = '';
  for (let k = 0; k < n; k++) {
    const cap = r() < 0.6;
    const px = vertical ? x : x + k * 4.6;
    const py = vertical ? y + k * 4.6 : y;
    const w = vertical ? 2 : 3.4;
    const h = vertical ? 3.4 : 2;
    out += `<rect class="${cap ? 'pr-smd-cap' : 'pr-smd-res'}" x="${f1(px)}" y="${f1(py)}" width="${w}" height="${h}" rx="0.3"/>`;
  }
  return out;
}

const CHIP_LABELS = ['U1', 'U2', 'PMIC', 'U7', 'SoC', 'EMMC', 'U12', 'CODEC', 'WIFI', 'U3'];

/**
 * Плата: маска, шины дорожек с изломами 45°, переходные отверстия, микросхемы (QFP с ножками, SOIC, BGA), ряды
 * мелких деталей вдоль микросхем, контактные площадки, крепёжные отверстия, белая маркировка. n — сколько микросхем;
 * рисунок зависит от места и размера (зерно), поэтому у каждой платы свой.
 */
export function pcb(x, y, w, h, n = 4, rx = 6, seed = 0) {
  const r = rnd(seed || Math.round(x * 7 + y * 13 + w * 31 + h * 17));
  let out = `<rect class="pr-pcb" x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"/>`;
  if (w > 40 && h > 30) out += `<rect class="pr-silk-line" x="${x + 3}" y="${y + 3}" width="${w - 6}" height="${h - 6}" rx="${Math.max(1, rx - 2)}"/>`;
  // шины дорожек
  const buses = Math.max(1, Math.min(6, Math.round((w * h) / 1800)));
  let tr = '';
  let vias = '';
  for (let b = 0; b < buses; b++) {
    const horiz = r() < 0.55;
    const lines = 2 + Math.floor(r() * 4);
    const sx = x + 6 + r() * (w * 0.5);
    const sy = y + 6 + r() * (h * 0.6);
    let l1 = 8 + r() * (horiz ? w * 0.35 : h * 0.3);
    let l2 = 6 + r() * (horiz ? w * 0.3 : h * 0.3);
    let dd = (r() < 0.5 ? 1 : -1) * (4 + r() * 8);
    // всё в пределах платы: изгиб внутрь, длина — до края
    const lo = (horiz ? y : x) + 4;
    const hi = (horiz ? y + h : x + w) - 4;
    const from = horiz ? sy : sx;
    const span = (lines - 1) * 2.4;
    dd = Math.max(lo - from, Math.min(hi - from - span, dd));
    const room = (horiz ? x + w - sx : y + h - sy) - 6 - Math.abs(dd);
    if (l1 + l2 > room) {
      const q = Math.max(0, room) / (l1 + l2);
      l1 *= q;
      l2 *= q;
    }
    for (let k = 0; k < lines; k++) {
      const o = k * 2.4;
      if (horiz) {
        const yy = Math.min(y + h - 4, sy + o);
        tr += `M${f1(sx)} ${f1(yy)}h${f1(l1)}l${f1(Math.abs(dd))} ${f1(dd)}h${f1(l2)}`;
        vias += `<circle class="pr-via" cx="${f1(sx + l1 + Math.abs(dd) + l2)}" cy="${f1(yy + dd)}" r="1.1"/>`;
      } else {
        const xx = Math.min(x + w - 4, sx + o);
        tr += `M${f1(xx)} ${f1(sy)}v${f1(l1)}l${f1(dd)} ${f1(Math.abs(dd))}v${f1(l2)}`;
        vias += `<circle class="pr-via" cx="${f1(xx + dd)}" cy="${f1(sy + l1 + Math.abs(dd) + l2)}" r="1.1"/>`;
      }
    }
  }
  out += `<g class="pr-traces"><path class="pr-trace" d="${tr}"/></g>${vias}`;
  // микросхемы — по клеткам сетки, чтобы не наползали друг на друга
  const cols = Math.max(1, Math.round(Math.sqrt((n * w) / Math.max(h, 1))));
  const rows = Math.max(1, Math.ceil(n / cols));
  const cw = (w - 8) / cols;
  const ch = (h - 8) / rows;
  for (let k = 0; k < n; k++) {
    const c = k % cols;
    const rr = Math.floor(k / cols);
    const kind = r() < 0.2 && cw > 26 && ch > 26 ? 'bga' : r() < 0.6 ? 'qfp' : 'soic';
    const size = Math.min(cw, ch) * (kind === 'bga' ? 0.62 : 0.45 + r() * 0.15);
    const bw = Math.max(5, kind === 'soic' ? size * 1.3 : size);
    const bh = Math.max(4, kind === 'soic' ? size * 0.6 : size);
    const bx = x + 4 + c * cw + (cw - bw) * (0.25 + r() * 0.5);
    const by = y + 4 + rr * ch + (ch - bh) * (0.2 + r() * 0.4);
    out += chip(bx, by, bw, bh, CHIP_LABELS[(k + Math.floor(r() * 9)) % CHIP_LABELS.length], kind);
    // мелочь вдоль нижнего края микросхемы и маркировка
    const pn = Math.max(0, Math.min(6, Math.floor(bw / 4.6)));
    if (by + bh + 7 < y + h - 2) out += passives(r, bx, by + bh + 3.4, pn, false);
    if (bx + bw + 6 < x + w - 2 && bh > 12) out += passives(r, bx + bw + 3, by, Math.min(4, Math.floor(bh / 4.6)), true);
  }
  // контактные площадки
  for (let k = 0; k < Math.min(5, 1 + Math.floor((w * h) / 2500)); k++) {
    out += `<circle class="pr-testpad" cx="${f1(x + 6 + r() * (w - 12))}" cy="${f1(y + 6 + r() * (h - 12))}" r="1.5"/>`;
  }
  // крепёжные отверстия по углам больших плат
  if (w > 80 && h > 60) {
    for (const [hx, hy] of [[x + 6, y + 6], [x + w - 6, y + 6], [x + 6, y + h - 6], [x + w - 6, y + h - 6]]) {
      out += `<circle class="pr-mount-ring" cx="${hx}" cy="${hy}" r="3.2"/><circle class="pr-mount-hole" cx="${hx}" cy="${hy}" r="1.6"/>`;
    }
  }
  return out;
}

/** Аккумулятор с наклейкой: вздутый — выпуклый, изношенный — с надписью износа. */
export function cell(x, y, w, h, s, part = 'battery', label = 'Li-ion') {
  const b = s.parts[part]?.broken;
  const body = b === 'swollen'
    ? `<rect class="pr-battery" x="${x - 2}" y="${y - 2}" width="${w + 4}" height="${h + 4}" rx="${Math.min(w, h) * 0.3}"/><ellipse class="pr-battery-hi" cx="${x + w * 0.4}" cy="${y + h * 0.4}" rx="${w * 0.3}" ry="${h * 0.22}"/>`
    : `<rect class="pr-battery" x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(6, w * 0.1)}"/>`;
  const lw = w * 0.76;
  const lh = Math.min(h * 0.6, 40);
  const fs = Math.max(5, Math.min(9, lw / 10));
  return `${body}<rect class="pr-battery-label" x="${x + (w - lw) / 2}" y="${y + (h - lh) / 2}" width="${lw}" height="${lh}" rx="3"/>`
    + `<text class="pr-battery-text" style="font-size:${fs}px" x="${x + w / 2}" y="${y + h / 2 - fs * 0.2}" text-anchor="middle">${label}</text>`
    + `<text class="pr-battery-text" style="font-size:${fs}px" x="${x + w / 2}" y="${y + h / 2 + fs * 1.1}" text-anchor="middle">${b === 'worn' ? 'ИЗНОС 60%' : '3.7 V'}</text>`;
}

/** Вентилятор: рамка, кольцо, лопасти (крутятся, когда включено), пыль; сломанный — с трещиной. */
export function fanAt(cx, cy, r, broken = false, spot = 'fan') {
  const blades = [0, 1, 2, 3, 4, 5, 6].map((k) => `<path class="pr-blade" transform="rotate(${k * 51.4} ${cx} ${cy})" d="M${cx} ${cy}c${r * 0.2}-${r * 0.48} ${r * 0.57}-${r * 0.76} ${r * 0.86}-${r * 0.67}-${r * 0.1} ${r * 0.33}-${r * 0.43} ${r * 0.57}-${r * 0.86} ${r * 0.67}Z"/>`).join('');
  return `<rect class="pr-fan-box" x="${cx - r - 4}" y="${cy - r - 4}" width="${2 * r + 8}" height="${2 * r + 8}" rx="${r * 0.3}"/><circle class="pr-fan-ring" cx="${cx}" cy="${cy}" r="${r}"/>
<g class="pr-fan-blades">${blades}</g><circle class="pr-fan-hub" cx="${cx}" cy="${cy}" r="${r * 0.28}"/>
${broken ? `<path class="pr-tear" d="M${cx - r * 0.6} ${cy - r * 0.5}l${r * 0.4} ${r * 0.3}-${r * 0.15} ${r * 0.2} ${r * 0.4} ${r * 0.3}"/>` : ''}
<g class="pr-spot" data-spot="${spot}"><circle cx="${cx - r * 0.5}" cy="${cy - r * 0.4}" r="${r * 0.18}"/><circle cx="${cx + r * 0.5}" cy="${cy + r * 0.4}" r="${r * 0.22}"/><circle cx="${cx - r * 0.2}" cy="${cy + r * 0.6}" r="${r * 0.14}"/><circle cx="${cx + r * 0.55}" cy="${cy - r * 0.5}" r="${r * 0.13}"/></g>`;
}

/** Динамик: диффузор с центром; порванный — с разрывом. */
export function driverAt(cx, cy, r, torn = false) {
  return `<circle class="pr-driver" cx="${cx}" cy="${cy}" r="${r}"/><circle class="pr-cone" cx="${cx}" cy="${cy}" r="${r * 0.72}"/><circle class="pr-cone-cap" cx="${cx}" cy="${cy}" r="${r * 0.28}"/>`
    + (torn ? `<path class="pr-tear" d="M${cx - r * 0.5} ${cy - r * 0.2}l${r * 0.3} ${r * 0.2}-${r * 0.1} ${r * 0.2} ${r * 0.4} ${r * 0.2}"/>` : '');
}

/** Объектив: кольцо и стекло с бликом. */
export const lensAt = (cx, cy, r) => `<circle class="pr-lens-ring" cx="${cx}" cy="${cy}" r="${r + 2}"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#pr-g-lens)"/><circle class="pr-lens-hi" cx="${cx - r * 0.3}" cy="${cy - r * 0.35}" r="${r * 0.22}"/>`;

/** Подгорелое пятно на сломанной детали. */
export const scorch = (cx, cy, k = 1) => `<path class="pr-scorch" transform="translate(${cx} ${cy}) scale(${k})" d="M-8 -2c4-5 14-5 17 0s-3 10-9 10-11-5-8-10Z"/>`;

/** Пыль (видна, когда пятно грязное: .pr-d-<пятно>). */
export const dustAt = (spot, cx, cy, k = 1) => `<g class="pr-spot" data-spot="${spot}" transform="translate(${cx} ${cy}) scale(${k})"><circle cx="-6" cy="-4" r="3.4"/><circle cx="5" cy="3" r="4"/><circle cx="-2" cy="7" r="2.6"/><circle cx="8" cy="-6" r="2.2"/><path d="M-10 2c4-3 8 1 12-2"/></g>`;

/** Липкое пятно (сладкий чай, кофе). */
export const stickyAt = (spot, cx, cy, k = 1) => `<g class="pr-spot pr-spot-sticky" data-spot="${spot}" transform="translate(${cx} ${cy}) scale(${k})"><ellipse cx="0" cy="0" rx="20" ry="12"/><ellipse cx="22" cy="10" rx="9" ry="6"/><circle cx="-18" cy="10" r="4"/></g>`;

/** Домашний экран: обои и плитки (для планшета, ноутбука, часов, шлема…). */
export function homeTiles(x, y, w, h, n = 6, dark = false) {
  const cols = Math.max(2, Math.round(Math.sqrt((n * w) / h)));
  const rows = Math.ceil(n / cols);
  const gw = w / (cols + 1);
  const gh = h / (rows + 1.5);
  const sz = Math.min(gw, gh) * 0.7;
  let tiles = '';
  for (let k = 0; k < n; k++) {
    const c = k % cols;
    const r = Math.floor(k / cols);
    tiles += `<rect class="pr-app pr-app-${(k * 3) % 8}" x="${(x + gw * (c + 1) - sz / 2).toFixed(1)}" y="${(y + gh * (r + 1.2) - sz / 2).toFixed(1)}" width="${sz.toFixed(1)}" height="${sz.toFixed(1)}" rx="${(sz * 0.25).toFixed(1)}"/>`;
  }
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" ${dark ? 'class="pr-ui-dark"' : 'fill="url(#pr-g-wall)"'}/>${tiles}`
    + `<rect class="pr-cursor" x="${(x + gw - sz / 2 - 2).toFixed(1)}" y="${(y + gh * 1.2 - sz / 2 - 2).toFixed(1)}" width="${(sz + 4).toFixed(1)}" height="${(sz + 4).toFixed(1)}" rx="${(sz * 0.3).toFixed(1)}"/>`;
}

/** Термопаста на чипе: свежая — серая «звезда» с бликом, высохшая — бледная, в трещинах. */
export function paste(d, dry) {
  const { x, y, w, h } = d;
  const k = w / 80;
  // слой пасты по кристаллу: края чуть неровные (её выдавило радиатором)
  const edge = `M${x + 6 * k} ${y + 2 * k}Q${x + w / 2} ${y - 2 * k} ${x + w - 6 * k} ${y + 2 * k}Q${x + w + 2 * k} ${y + h / 2} ${x + w - 4 * k} ${y + h - 3 * k}`
    + `Q${x + w / 2} ${y + h + 2 * k} ${x + 5 * k} ${y + h - 2 * k}Q${x - 2 * k} ${y + h / 2} ${x + 6 * k} ${y + 2 * k}Z`;
  return `<path class="pr-paste${dry ? ' pr-paste-dry' : ''}" d="${edge}"/>`
    + (dry ? `<path class="pr-paste-crack" d="M${x + 10 * k} ${y + 30 * k}l${14 * k} ${6 * k} ${10 * k}-${10 * k} ${16 * k} ${8 * k} ${18 * k}-${6 * k}M${x + 40 * k} ${y + 8 * k}l-${4 * k} ${18 * k} ${6 * k} ${14 * k}-${3 * k} ${30 * k}M${x + 16 * k} ${y + 62 * k}l${16 * k}-${8 * k} ${14 * k} ${6 * k}M${x + 56 * k} ${y + 46 * k}l${12 * k} ${16 * k}"/>`
      : `<path class="pr-paste-hi" d="M${x + 12 * k} ${y + 14 * k}q${18 * k}-${6 * k} ${34 * k}-${2 * k}l-${2 * k} ${5 * k}q-${16 * k}-${4 * k}-${30 * k} ${2 * k}Z"/>`);
}
