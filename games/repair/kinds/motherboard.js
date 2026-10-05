// Материнская плата 180×300 — подробно с обеих сторон. Лицо: кожух задних разъёмов, радиатор питания на 2 винтах
// (под ним конденсатор), дроссели и транзисторы питания, сокет с ножками и прижимом, два слота памяти (в одном —
// планка), 24-контактный разъём питания, 8-контактный питания процессора, слоты PCIe x16 и x1, M.2, радиатор чипсета,
// SATA, звуковая часть с золотыми конденсаторами, батарейка BIOS, разъёмы вентиляторов и передней панели, маркировка.
// Изнанка: пайка под сокетом и слотами, пластина сокета на винтах, дорожки, наклейка со штрихкодом.

import { frame, screwHead, hole, jackMark, corrosion, dustAt, chip, PORTRAIT, trayLayout } from '../scene.js';

const F = frame(90, 70);
const { box, pt, wrap } = F;

const SCREWS = { k1: [38, 15], k2: [112, 15] };
const MOUNTS = [[8, 8], [172, 8], [8, 150], [172, 150], [8, 292], [172, 292]];
const silk = (x, y, t, a = 'start') => `<text class="pr-silk" x="${x}" y="${y}" text-anchor="${a}">${t}</text>`;
const dots = (x, y, cols, rows, step, cls = 'pr-pinfield') => {
  let d = '';
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) d += `M${x + c * step} ${y + r * step}h0.01`;
  return `<path class="${cls}" d="${d}"/>`;
};

function front() {
  const chokes = [0, 1, 2, 3, 4].map((k) => `<rect class="pr-choke" x="${32 + k * 16}" y="30" width="11" height="9" rx="1"/><text class="pr-choke-text" x="${37.5 + k * 16}" y="36.5" text-anchor="middle">R22</text>`).join('');
  const fets = [0, 1, 2, 3, 4].map((k) => `<rect class="pr-chip" x="${33 + k * 16}" y="41" width="9" height="4" rx="0.5"/>`).join('');
  const audioCaps = [[10, 246], [20, 252], [10, 262], [22, 266], [12, 278]].map(([x, y]) => `<circle class="pr-gold-cap" cx="${x}" cy="${y}" r="4"/><circle class="pr-gold-cap-top" cx="${x}" cy="${y}" r="2.2"/>`).join('');
  const sata = [0, 1, 2, 3].map((k) => `<rect class="pr-sata-port" x="164" y="${206 + k * 10}" width="14" height="7" rx="1"/>`).join('');
  const caps = [[124, 52], [124, 62], [124, 72], [124, 82]].map(([x, y]) => `<circle class="pr-elcap" cx="${x}" cy="${y}" r="3.4"/><path class="pr-elcap-cross" d="M${x - 2} ${y}h4M${x} ${y - 2}v4"/>`).join('');
  return `<rect class="pr-pcb pr-pcb-dark" x="0" y="0" width="180" height="300" rx="4"/>
<path class="pr-trace pr-trace-dark" d="M60 108v20h40l8 8v40M110 110h12v80M30 130h20l6 6v30M140 186v30h-30M80 150h40M90 200v40M40 230h50l6 6v20"/>
${MOUNTS.map(([x, y]) => `<circle class="pr-mount-ring" cx="${x}" cy="${y}" r="3.6"/><circle class="pr-mount-hole" cx="${x}" cy="${y}" r="1.8"/>`).join('')}
<rect class="pr-io-cover" x="2" y="12" width="24" height="118" rx="4"/><path class="pr-io-stripe" d="M6 30l16-8M6 50l16-8M6 70l16-8M6 90l16-8"/>
<text class="pr-io-text" x="14" y="120" text-anchor="middle" transform="rotate(-90 14 120)">MAT-Z90</text>
${chokes}${fets}<rect class="pr-eps" x="128" y="4" width="22" height="10" rx="1.5"/>${dots(131, 7, 4, 2, 4.6, 'pr-pinfield-light')}${silk(128, 22, 'CPU_PWR')}
<rect class="pr-socket-frame" x="44" y="50" width="64" height="64" rx="3"/><rect class="pr-socket-bed" x="50" y="56" width="52" height="52" rx="1.5"/>${dots(53, 59, 12, 12, 4.1)}
<path class="pr-socket-lever" d="M110 54v54h4"/>${silk(50, 122, 'LGA1700')}
<rect class="pr-fan-header" x="112" y="38" width="10" height="5" rx="0.5"/>${silk(108, 34, 'CPU_FAN')}
${caps}<rect class="pr-slot-ram" x="130" y="28" width="11" height="160" rx="2"/><rect class="pr-slot-ram" x="146" y="28" width="11" height="160" rx="2"/>
<rect class="pr-ram-latch" x="129" y="24" width="13" height="5" rx="1"/><rect class="pr-ram-latch" x="145" y="24" width="13" height="5" rx="1"/>
${silk(130, 196, 'DIMM_A1')}<rect class="pr-atx" x="164" y="60" width="14" height="66" rx="2"/>${dots(167, 64, 2, 12, 5.2, 'pr-pinfield-light')}${silk(160, 134, 'ATX')}
<rect class="pr-pcie" x="8" y="140" width="122" height="9" rx="1.5"/><rect class="pr-pcie-latch" x="126" y="138" width="8" height="13" rx="1"/>${silk(10, 158, 'PCIEX16_1')}
<rect class="pr-m2" x="30" y="166" width="78" height="11" rx="1"/><rect class="pr-m2-key" x="30" y="166" width="6" height="11"/><circle class="pr-standoff" cx="104" cy="171.5" r="2.4"/>${silk(40, 186, 'M.2_1')}
<rect class="pr-pcie" x="8" y="198" width="56" height="7" rx="1.5"/>${silk(10, 214, 'PCIEX1')}
<rect class="pr-chipset-hs" x="106" y="196" width="46" height="40" rx="5"/><path class="pr-chipset-line" d="M110 206h38M110 216h38M110 226h38"/>
<g class="pr-logo-small" transform="translate(129 216) scale(0.32) translate(-90 -166)"><path d="M90 148l6 13 14 2-10 10 2.5 14L90 180l-12.5 7 2.5-14-10-10 14-2Z"/></g>
${sata}${silk(150, 202, 'SATA6G')}<path class="pr-audio-line" d="M4 232h40v66"/>${audioCaps}${chip(26, 272, 12, 12, '', 'qfp')}${silk(6, 240, 'AUDIO')}
<circle class="pr-cmos-holder" cx="104" cy="254" r="15"/>${silk(90, 276, 'BAT')}${chip(128, 250, 14, 14, 'BIOS', 'soic')}
<rect class="pr-header" x="120" y="282" width="40" height="10" rx="1"/>${dots(123, 285, 8, 2, 4.6, 'pr-pinfield-light')}${silk(120, 279, 'F_PANEL')}
<rect class="pr-usb" x="-3" y="72" width="10" height="22" rx="2"/><rect class="pr-usb" x="-3" y="98" width="10" height="22" rx="2"/>
${jackMark(2, 83, 4, 14)}${corrosion(80, 200, 0.9)}`;
}

function back() {
  return `<rect class="pr-pcb pr-pcb-dark" x="0" y="0" width="180" height="300" rx="4"/>
<path class="pr-trace pr-trace-dark" d="M10 40h60l10 10v40M20 120h40v30h60M100 30v40h30M30 200h100l10 10v60M150 150v30M60 240h50"/>
${MOUNTS.map(([x, y]) => `<circle class="pr-mount-ring" cx="${180 - x}" cy="${y}" r="3.6"/><circle class="pr-mount-hole" cx="${180 - x}" cy="${y}" r="1.8"/>`).join('')}
<rect class="pr-backplate-sock" x="68" y="46" width="72" height="72" rx="4"/>${['70 48', '138 48', '70 116', '138 116'].map((p) => { const [x, y] = p.split(' ').map(Number); return `<circle class="pr-screw" cx="${x}" cy="${y}" r="3"/>`; }).join('')}
${dots(76, 56, 14, 14, 3.9, 'pr-solder-field')}
${dots(26, 34, 2, 30, 5.2, 'pr-solder-field')}${dots(42, 34, 2, 30, 5.2, 'pr-solder-field')}
${dots(54, 144, 24, 1, 5, 'pr-solder-field')}${dots(6, 64, 2, 12, 5.2, 'pr-solder-field')}
${dots(130, 172, 14, 1, 3.2, 'pr-solder-field')}${dots(118, 256, 8, 2, 4.6, 'pr-solder-field')}
<rect class="pr-sticker-white" x="70" y="210" width="70" height="34" rx="2"/>${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((k) => `<rect class="pr-barcode" x="${74 + k * 4.2}" y="214" width="${k % 3 ? 1.2 : 2.2}" height="16"/>`).join('')}
<text class="pr-silk pr-silk-dark" x="105" y="240" text-anchor="middle">S/N MZ90-04172</text>${silk(14, 290, 'MADE IN ПЛАТАГРАД')}
<rect class="pr-usb" x="173" y="72" width="10" height="22" rx="2"/><rect class="pr-usb" x="173" y="98" width="10" height="22" rx="2"/>`;
}

export default {
  kind: 'motherboard',
  origin: [180, 220],
  ...trayLayout(PORTRAIT, { ram: 'L1', heatsink: 'R1', cmos: 'R2', cap: 'R3' }, ['k1', 'k2']),
  BOX: {
    cmos: box(90, 240, 28, 28),
    ram: box(146, 30, 11, 156),
    heatsink: box(28, 4, 94, 24),
    cap: box(64, 7, 18, 18),
    board: box(56, 180, 50, 50),
  },
  CONN_AT: {},
  SCREW_AT: Object.fromEntries(Object.entries(SCREWS).map(([k, v]) => [k, pt(...v)])),
  SPOT_AT: { jack: { front: pt(2, 96), back: pt(178, 96) }, board: pt(80, 200) },
  JACK: { front: box(-12, 70, 24, 52), back: box(168, 70, 24, 52) },
  BUTTON: { front: null, back: null },
  ORDER: { front: ['cap', 'heatsink', 'ram', 'cmos'], back: [] },
  backBody: () => wrap(back()),
  frontBody: () => wrap(front()),
  part: (id, s) => wrap({
    cmos: () => `<circle class="pr-coin" cx="104" cy="254" r="13"/><text class="pr-coin-text" x="104" y="256" text-anchor="middle">CR2032</text><text class="pr-coin-text" x="104" y="262" text-anchor="middle">+</text>
${s.parts.cmos.broken ? '<circle class="pr-worn-ring" cx="104" cy="254" r="10"/>' : ''}`,
    ram: () => `<rect class="pr-ram" x="146" y="30" width="11" height="156" rx="1.5"/><rect class="pr-ram-sink" x="146" y="30" width="11" height="156" rx="1.5"/>
${[0, 1, 2, 3, 4, 5, 6, 7].map((k) => `<rect class="pr-chip" x="148" y="${36 + k * 18.5}" width="7" height="13" rx="0.6"/>`).join('')}
<text class="pr-ram-text" x="151.5" y="108" text-anchor="middle" transform="rotate(-90 151.5 108)">DDR5 16GB</text>
${s.parts.ram.broken ? '<path class="pr-scorch" d="M148 92c3-3 8-2 8 2s-3 6-6 5-4-4-2-7Z"/>' : ''}`,
    heatsink: () => `<rect class="pr-metal pr-vrm-hs" x="28" y="4" width="94" height="24" rx="4" fill="url(#pr-g-metal)"/>
${Array.from({ length: 14 }, (_, k) => `<rect class="pr-fin" x="${44 + k * 4.4}" y="7" width="2" height="18" rx="1"/>`).join('')}
${hole(...SCREWS.k1, 3.6)}${hole(...SCREWS.k2, 3.6)}${dustAt('heatsink', 75, 16, 0.9)}`,
    cap: () => `<circle class="pr-elcap pr-elcap-big" cx="73" cy="16" r="8"/><path class="pr-elcap-cross" d="M69 16h8M73 12v8"/>
${s.parts.cap.broken ? '<circle class="pr-cap-bulge" cx="73" cy="16" r="5"/><path class="pr-cap-leak" d="M66 22c2 2 4 3 7 3"/>' : ''}`,
  }[id]()),
  plug: () => '',
  screw: (id) => wrap(screwHead(...SCREWS[id])),
};
