// Накладные наушники 180×260 (как устроены настоящие: оголовье с мягкой подушкой, выдвижные металлические слайдеры,
// вилки-коромысла на шарнирах, чашки, амбушюры из кожи с прострочкой). Спереди — внутренняя сторона (к ушам):
// амбушюры снимаются руками, под ними ткань с буквами L/R, динамики со шлейфами и батарея в левой чашке.
// Сзади — внешние стороны чашек (зеркально: правая слева) с логотипом, кнопкой, огоньком и гнездом.

import { frame, plugBody, socket, jackMark, cell, driverAt, logo, PORTRAIT, trayLayout } from '../scene.js';

const F = frame(90, 84);
const { box, pt, wrap } = F;

const CONNS = { bat: [32, 214], dl: [32, 140], dr: [148, 140] };
const CUPS = [32, 148];
const CY = 180;

/** Оголовье: внешняя дуга, мягкая подушка снизу с прострочкой, слайдеры с делениями и вилки к чашкам. */
function frame3(back = false) {
  const sliders = CUPS.map((x) => {
    const sx = x < 90 ? 22 : 152;
    return `<rect class="pr-slider" x="${sx}" y="88" width="6" height="40" rx="2"/><path class="pr-slider-ticks" d="M${sx + 1} 96h4M${sx + 1} 104h4M${sx + 1} 112h4M${sx + 1} 120h4"/>`;
  }).join('');
  const yokes = CUPS.map((x) => `<path class="pr-yoke" d="M${x - 33} ${CY - 6}V${CY - 40}Q${x - 33} ${CY - 54} ${x} ${CY - 54}Q${x + 33} ${CY - 54} ${x + 33} ${CY - 40}V${CY - 6}"/>
<circle class="pr-pivot" cx="${x - 33}" cy="${CY - 6}" r="3.2"/><circle class="pr-pivot" cx="${x + 33}" cy="${CY - 6}" r="3.2"/>`).join('');
  // спереди дугу рисует сама деталь «оголовье» (её можно снять), сзади — корпус
  const band = back ? '<path class="pr-band" d="M25 92C25 30 52 6 90 6s65 24 65 86"/><path class="pr-band-cushion pr-band-out" d="M40 74C44 34 62 20 90 20s46 14 50 54"/>' : '';
  return `${band}
<rect class="pr-band-cap" x="19" y="84" width="12" height="10" rx="3"/><rect class="pr-band-cap" x="149" y="84" width="12" height="10" rx="3"/>
${sliders}${yokes}`;
}

function cupIn(x) {
  return `<ellipse class="pr-cup" cx="${x}" cy="${CY}" rx="30" ry="46"/><ellipse class="pr-cup-rim" cx="${x}" cy="${CY}" rx="27" ry="43"/>
<ellipse class="pr-cavity" cx="${x}" cy="${CY}" rx="22" ry="37"/>`;
}

function pad(x, s, id) {
  const worn = s.parts[id].broken;
  return `<ellipse class="pr-earpad" cx="${x}" cy="${CY}" rx="29" ry="45"/><ellipse class="pr-earpad-sheen" cx="${x - 8}" cy="${CY - 20}" rx="8" ry="14"/>
<ellipse class="pr-earpad-stitch" cx="${x}" cy="${CY}" rx="23" ry="38"/>
<ellipse class="pr-earpad-fabric" cx="${x}" cy="${CY}" rx="16" ry="30"/><text class="pr-earpad-letter" x="${x}" y="${CY + 5}" text-anchor="middle">${id === 'padL' ? 'L' : 'R'}</text>
${worn ? `<path class="pr-earpad-worn" d="M${x - 24} ${CY - 26}l5 5 4-3 5 6M${x + 10} ${CY + 30}l6-4 4 5M${x + 20} ${CY - 6}l5 3"/>` : ''}`;
}

export default {
  kind: 'headphones',
  origin: [180, 214],
  ...trayLayout(PORTRAIT, { band: 'L1', padL: 'R1', padR: 'R2', driverL: 'R3', driverR: 'R4', battery: 'R5' }, []),
  BOX: {
    band: box(18, 2, 144, 96),
    padL: box(2, 134, 60, 92),
    padR: box(118, 134, 60, 92),
    driverL: box(12, 152, 40, 40),
    driverR: box(128, 156, 40, 40),
    battery: box(16, 196, 32, 22),
  },
  CONN_AT: Object.fromEntries(Object.entries(CONNS).map(([k, v]) => [k, pt(...v)])),
  SCREW_AT: {},
  SPOT_AT: { jack: { front: pt(148, 226), back: pt(32, 226) } },
  JACK: { front: box(132, 214, 32, 24), back: box(16, 214, 32, 24) },
  BUTTON: { front: null, back: box(12, 158, 40, 26) },
  ORDER: { front: ['battery', 'driverL', 'driverR', 'plugs', 'padL', 'padR', 'band'], back: [] },
  backBody: (s) => wrap(`${frame3(true)}
${CUPS.map((x) => `<ellipse class="pr-cup-out" cx="${x}" cy="${CY}" rx="30" ry="46" fill="url(#pr-g-plastic)"/><ellipse class="pr-cup-trim" cx="${x}" cy="${CY}" rx="24" ry="38"/>`).join('')}
<g class="pr-logo" transform="translate(148 ${CY}) scale(0.36) translate(-90 -166)">${logo(s.model.logo)}</g>
<rect class="pr-side-btn" x="27" y="160" width="10" height="20" rx="5"/><circle class="pr-led-dot" cx="32" cy="188" r="1.6"/>${jackMark(32, 224, 10, 4)}`),
  frontBody: () => wrap(`${frame3(false)}${cupIn(CUPS[0])}${cupIn(CUPS[1])}
${socket(...CONNS.bat)}${socket(...CONNS.dl)}${socket(...CONNS.dr)}${jackMark(148, 224, 10, 4)}`),
  part: (id, s) => wrap({
    band: () => `<path class="pr-band" d="M25 92C25 30 52 6 90 6s65 24 65 86"/><path class="pr-band-cushion" d="M40 74C44 34 62 20 90 20s46 14 50 54"/>
<path class="pr-band-stitch" d="M44 70C48 36 64 25 90 25s42 11 46 45"/><text class="pr-band-text" x="90" y="10.5" text-anchor="middle">${s.model.name.toUpperCase()}</text>
${s.parts.band.broken ? '<path class="pr-crack-dark pr-crack-light" d="M86 2l6 7-4 4 7 6"/>' : ''}`,
    padL: () => pad(CUPS[0], s, 'padL'),
    padR: () => pad(CUPS[1], s, 'padR'),
    driverL: () => `${driverAt(32, 172, 18, Boolean(s.parts.driverL.broken))}<rect class="pr-flex" x="29" y="146" width="6" height="10"/>`,
    driverR: () => `${driverAt(148, 176, 18, Boolean(s.parts.driverR.broken))}<rect class="pr-flex" x="145" y="146" width="6" height="14"/>`,
    battery: () => cell(16, 196, 32, 22, s, 'battery', '500 mAh'),
  }[id]()),
  plug: (id) => wrap(plugBody(...CONNS[id], id === 'bat' ? 'up' : 'down')),
  screw: () => '',
};
