// Накладные наушники 180×260: спереди (со стороны ушей) оголовье и две чашки с амбушюрами; под левой амбушюрой —
// динамик и батарея, под правой — динамик. Сзади — внешние стороны чашек, гнездо и кнопка (зеркально: правая слева).

import { frame, plugBody, socket, jackMark, cell, driverAt, logo, PORTRAIT, trayLayout } from '../scene.js';

const F = frame(90, 90);
const { box, pt, wrap } = F;

const CONNS = { bat: [30, 216], dl: [30, 128], dr: [150, 128] };
const BAND = '<path class="pr-band" d="M18 128C14 40 50 8 90 8s76 32 72 120" fill="none"/>';
const cups = '<ellipse class="pr-cup" cx="30" cy="172" rx="30" ry="52"/><ellipse class="pr-cup" cx="150" cy="172" rx="30" ry="52"/>';

function pad(cx, s, id) {
  const worn = s.parts[id].broken;
  return `<ellipse class="pr-earpad" cx="${cx}" cy="172" rx="29" ry="51"/><ellipse class="pr-earpad-hole" cx="${cx}" cy="172" rx="15" ry="32"/>
${worn ? `<path class="pr-earpad-worn" d="M${cx - 20} 140l6 4 4-3 5 5M${cx + 6} 200l6-3 4 4"/>` : ''}`;
}

export default {
  kind: 'headphones',
  origin: [180, 220],
  ...trayLayout(PORTRAIT, { band: 'L1', padL: 'R1', padR: 'R2', driverL: 'R3', driverR: 'R4', battery: 'R5' }, []),
  BOX: {
    band: box(10, 0, 160, 120),
    padL: box(0, 120, 60, 104),
    padR: box(120, 120, 60, 104),
    driverL: box(8, 136, 44, 44),
    driverR: box(128, 150, 44, 44),
    battery: box(10, 184, 40, 26),
  },
  CONN_AT: Object.fromEntries(Object.entries(CONNS).map(([k, v]) => [k, pt(...v)])),
  SCREW_AT: {},
  SPOT_AT: { jack: { front: pt(150, 224), back: pt(30, 224) } },
  JACK: { front: box(134, 214, 32, 22), back: box(14, 214, 32, 22) },
  BUTTON: { front: null, back: box(14, 150, 32, 30) },
  ORDER: { front: ['battery', 'driverL', 'driverR', 'plugs', 'padL', 'padR', 'band'], back: [] },
  backBody: (s) => wrap(`${BAND}<rect class="pr-band-in" x="40" y="14" width="100" height="8" rx="4"/>
<ellipse class="pr-cup-out" cx="30" cy="172" rx="30" ry="52" fill="url(#pr-g-plastic)"/><ellipse class="pr-cup-out" cx="150" cy="172" rx="30" ry="52" fill="url(#pr-g-plastic)"/>
<g class="pr-logo" transform="translate(150 172) scale(0.4) translate(-90 -166)">${logo(s.model.logo)}</g>
<circle class="pr-side-btn" cx="30" cy="165" r="7"/>${jackMark(30, 222, 12, 4)}`),
  frontBody: () => wrap(`${cups}<ellipse class="pr-cavity" cx="30" cy="172" rx="24" ry="46"/><ellipse class="pr-cavity" cx="150" cy="172" rx="24" ry="46"/>
${socket(...CONNS.bat)}${socket(...CONNS.dl)}${socket(...CONNS.dr)}${jackMark(150, 222, 12, 4)}`),
  part: (id, s) => wrap({
    band: () => `<path class="pr-band" d="M18 128C14 40 50 8 90 8s76 32 72 120" fill="none"/><path class="pr-band-pad" d="M46 30c26-16 62-16 88 0" fill="none"/>
${s.parts.band.broken ? '<path class="pr-crack-dark" d="M86 4l6 6-4 4 6 6"/>' : ''}`,
    padL: () => pad(30, s, 'padL'),
    padR: () => pad(150, s, 'padR'),
    driverL: () => `${driverAt(30, 158, 20, Boolean(s.parts.driverL.broken))}<rect class="pr-flex" x="27" y="132" width="6" height="8"/>`,
    driverR: () => `${driverAt(150, 172, 20, Boolean(s.parts.driverR.broken))}<rect class="pr-flex" x="147" y="132" width="6" height="20"/>`,
    battery: () => cell(10, 184, 40, 26, s, 'battery', '300 mAh'),
  }[id]()),
  plug: (id) => wrap(plugBody(...CONNS[id], id === 'bat' ? 'up' : 'down')),
  screw: () => '',
};
