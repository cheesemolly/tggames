// Видеокарта 320×130 (сверху сцены, лотки снизу) — подробно с обеих сторон. Лицо: кожух на 4 винтах с вырезами под
// вентиляторы → вентиляторы (шлейф) → радиатор с тепловыми трубками на 2 винтах → термопаста (стереть спиртом, нанести
// новую) на чипе, вокруг — восемь чипов памяти, справа — дроссели и конденсаторы питания, разъём питания сверху,
// слева — планка с портами. Изнанка: пластина с прорезями, крестовина на винтах вокруг чипа, наклейка.
// Контакты PCIe — на нижнем крае (окисленные — спиртом).

import { frame, screwHead, hole, plugBody, socket, fanAt, dustAt, scorch, chip, paste, LANDSCAPE, trayLayout } from '../scene.js';

const F = frame(20, 40);
const { box, pt, wrap } = F;

const SCREWS = { g1: [16, 10], g2: [304, 10], g3: [16, 110], g4: [304, 110], k1: [110, 60], k2: [210, 60] };
const CONNS = { fan: [160, 16] };
const DIE = { x: 144, y: 44, w: 32, h: 32 };
const VRAM = [[118, 30], [118, 52], [118, 74], [186, 30], [186, 52], [186, 74], [141, 20], [163, 20]];
const fingers = (x0) => `<rect class="pr-gold-strip" x="${x0}" y="120" width="160" height="10" rx="1"/>`
  + `<path class="pr-finger-gaps" d="${Array.from({ length: 30 }, (_, k) => `M${x0 + 4 + k * 5.2} 121v8`).join('')}"/>`
  + `<g class="pr-spot" data-spot="jack"><rect class="pr-oxide" x="${x0 + 30}" y="121" width="60" height="8"/></g>`;
const SHROUD = 'M8 0H312L320 8V112L312 120H8L0 112V8Z';

function bracket(x) {
  return `<rect class="pr-io-bracket" x="${x}" y="-6" width="10" height="132" rx="1"/>
${[10, 34, 58, 82].map((y) => `<rect class="pr-port-hole" x="${x + 2.5}" y="${y}" width="5" height="16" rx="1.5"/>`).join('')}
<path class="pr-bracket-vent" d="${[104, 110, 116].map((y) => `M${x + 2} ${y}h6`).join('')}"/>`;
}

function front() {
  const chokes = [0, 1, 2, 3, 4, 5].map((k) => `<rect class="pr-choke" x="${240 + (k % 3) * 18}" y="${30 + Math.floor(k / 3) * 30}" width="13" height="12" rx="1"/><text class="pr-choke-text" x="${246.5 + (k % 3) * 18}" y="${38 + Math.floor(k / 3) * 30}" text-anchor="middle">R15</text>`).join('');
  const caps = [0, 1, 2, 3, 4, 5].map((k) => `<rect class="pr-polycap" x="${242 + k * 9}" y="88" width="6" height="8" rx="1"/>`).join('');
  return `<rect class="pr-pcb pr-pcb-dark" x="0" y="0" width="320" height="122" rx="4"/>
<path class="pr-trace pr-trace-dark" d="M176 58h50l8 -8h30M176 66h50l8 8h30M144 58h-40l-8 -8h-60M144 66h-40l-8 8h-60M160 76v30h-40"/>
${VRAM.map(([x, y]) => `<rect class="pr-vram-pad" x="${x}" y="${y}" width="16" height="16" rx="1"/>`).join('')}
<rect class="pr-die-sub" x="${DIE.x - 6}" y="${DIE.y - 6}" width="${DIE.w + 12}" height="${DIE.h + 12}" rx="2"/>
<rect class="pr-die" x="${DIE.x}" y="${DIE.y}" width="${DIE.w}" height="${DIE.h}" rx="1.5"/><text class="pr-die-text" x="160" y="62" text-anchor="middle">GPU</text>
${chokes}${caps}<rect class="pr-pcie-power" x="268" y="-4" width="34" height="12" rx="2"/>${[0, 1, 2, 3].map((k) => `<rect class="pr-pin-sq" x="${271 + k * 7.5}" y="-1" width="5" height="5" rx="0.6"/>`).join('')}
${chip(30, 34, 22, 22, 'VRM', 'qfp')}${chip(30, 76, 18, 9, 'BIOS', 'soic')}${socket(...CONNS.fan)}${bracket(-10)}${fingers(20)}`;
}

function back(s) {
  const vents = Array.from({ length: 7 }, (_, k) => `<rect class="pr-plate-vent" x="${24 + k * 12}" y="28" width="6" height="64" rx="3"/>`).join('');
  return `<rect class="pr-pcb pr-pcb-dark" x="0" y="0" width="320" height="122" rx="4"/>
<rect class="pr-backplate" x="4" y="2" width="312" height="116" rx="5"/><rect class="pr-backplate-edge" x="8" y="6" width="304" height="108" rx="4"/>
${vents}<path class="pr-plate-ridge" d="M120 10l20 14h60l20-14M120 110l20-14h60l20 14"/>
<rect class="pr-xbracket" x="142" y="40" width="36" height="40" rx="4"/><path class="pr-xbracket-arms" d="M146 44l-14-14M174 44l14-14M146 76l-14 14M174 76l14 14"/>
${[[132, 30], [188, 30], [132, 90], [188, 90]].map(([x, y]) => `<circle class="pr-screw" cx="${x}" cy="${y}" r="3.2"/>`).join('')}
<g class="pr-plate-logo" transform="translate(262 58) scale(0.42) translate(-90 -166)"><path d="M90 148l6 13 14 2-10 10 2.5 14L90 180l-12.5 7 2.5-14-10-10 14-2Z"/></g>
<text class="pr-plate-name" x="262" y="92" text-anchor="middle">${s.model.name.toUpperCase()}</text>
<rect class="pr-sticker-white" x="232" y="100" width="56" height="12" rx="1.5"/>${Array.from({ length: 12 }, (_, k) => `<rect class="pr-barcode" x="${236 + k * 4}" y="102" width="${k % 3 ? 1 : 2}" height="8"/>`).join('')}
${bracket(320)}${fingers(140)}`;
}

export default {
  kind: 'gpu',
  origin: [180, 105],
  ...trayLayout(LANDSCAPE, { shroud: 'A1', heatsink: 'A2', fan: 'C3', vram: 'B2' }, ['g1', 'g2', 'g3', 'g4', 'k1', 'k2']),
  BOX: {
    shroud: box(0, 0, 320, 120),
    fan: box(46, 12, 228, 96),
    heatsink: box(10, 10, 300, 100),
    vram: box(118, 18, 84, 92),
    paste: box(DIE.x - 2, DIE.y - 2, DIE.w + 4, DIE.h + 4),
  },
  CONN_AT: { fan: pt(...CONNS.fan) },
  SCREW_AT: Object.fromEntries(Object.entries(SCREWS).map(([k, v]) => [k, pt(...v)])),
  SPOT_AT: { jack: { front: pt(100, 125), back: pt(220, 125) } },
  JACK: { front: box(20, 114, 160, 24), back: box(140, 114, 160, 24) },
  BUTTON: { front: null, back: null },
  ORDER: { front: ['vram', 'paste', 'heatsink', 'fan', 'plugs', 'shroud'], back: [] },
  backBody: (s) => wrap(back(s)),
  frontBody: () => wrap(front()),
  part: (id, s) => wrap({
    shroud: () => `<path class="pr-shroud" fill-rule="evenodd" d="${SHROUD} M100 14a46 46 0 1 0 0.1 0Z M220 14a46 46 0 1 0 0.1 0Z"/>
<path class="pr-shroud-accent" d="M12 112L40 84M280 8l28 28M150 4l20 0"/><path class="pr-shroud-plate" d="M146 10h28l6 100h-40Z"/>
<rect class="pr-rgb" x="148" y="16" width="24" height="4" rx="2"/><text class="pr-brand-dark" x="160" y="66" text-anchor="middle">${s.model.code.split('-')[0]}</text>
${Object.entries(SCREWS).filter(([k]) => k.startsWith('g')).map(([, [x, y]]) => hole(x, y)).join('')}`,
    fan: () => `${fanAt(100, 60, 42, Boolean(s.parts.fan.broken))}${fanAt(220, 60, 42, false, 'fan')}
<circle class="pr-fan-sticker" cx="100" cy="60" r="10"/><circle class="pr-fan-sticker" cx="220" cy="60" r="10"/><rect class="pr-flex" x="150" y="14" width="20" height="8" rx="2"/>`,
    heatsink: () => `<rect class="pr-heatsink" x="10" y="10" width="300" height="100" rx="4"/>
${Array.from({ length: 36 }, (_, k) => `<rect class="pr-fin" x="${14 + k * 8.2}" y="14" width="3" height="92" rx="1"/>`).join('')}
<path class="pr-heatpipe-path" d="M20 46H140M20 56H140M20 66H140M180 46H300M180 56H300M180 66H300"/>
<rect class="pr-coldplate" x="${DIE.x - 10}" y="${DIE.y - 10}" width="${DIE.w + 20}" height="${DIE.h + 20}" rx="3"/>
${hole(...SCREWS.k1, 4)}${hole(...SCREWS.k2, 4)}${dustAt('heatsink', 60, 30, 1.2)}${dustAt('heatsink', 250, 86, 1)}`,
    vram: () => `${VRAM.map(([x, y]) => chip(x, y, 16, 16, '', 'bga')).join('')}<text class="pr-chip-text" x="160" y="98" text-anchor="middle">GDDR6</text>
${s.parts.vram.broken ? scorch(126, 72, 0.6) : ''}`,
    paste: () => paste(DIE, s.parts.paste.broken === 'dry'),
  }[id]()),
  plug: (id) => wrap(plugBody(...CONNS[id], 'down')),
  screw: (id) => wrap(screwHead(...SCREWS[id])),
};
