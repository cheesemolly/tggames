// Фотоаппарат 260×170 (сверху сцены, лотки снизу). Спереди — объектив (снимается, мутное стекло — кисточкой),
// под ним затвор. Сзади (зеркально: рукоятка слева) — экран на клею, дверца батареи; под дверцей батарея,
// шлейф экрана и слот карты памяти.

import { frame, plugBody, socket, jackMark, lensAt, dustAt, screenStates, cell, LANDSCAPE, trayLayout } from '../scene.js';

const F = frame(50, 30);
const { box, pt, wrap } = F;

const BODY = 'M14 40H70L84 16H150L164 40H246A12 12 0 0 1 258 52V158A12 12 0 0 1 246 170H14A12 12 0 0 1 2 158V52A12 12 0 0 1 14 40Z';
const CONNS = { disp: [46, 100] };
const SCREEN = { x: 96, y: 66, w: 140, h: 88, rx: 3 };

const photo = `<rect x="96" y="66" width="140" height="88" fill="url(#pr-g-wall)"/><circle class="pr-wall-blob" cx="200" cy="90" r="16"/>
<path class="pr-photo-hill" d="M96 154l40-40 30 26 24-18 46 32Z"/><rect class="pr-cursor" x="100" y="70" width="132" height="80" rx="2"/>`;

export default {
  kind: 'camera',
  origin: [180, 115],
  ...trayLayout(LANDSCAPE, { lens: 'A1', display: 'A2', door: 'B1', shutter: 'B2', battery: 'B3' }, []),
  BOX: {
    lens: box(84, 50, 112, 112),
    shutter: box(110, 76, 60, 60),
    display: box(90, 60, 152, 100),
    door: box(14, 84, 62, 80),
    battery: box(20, 112, 50, 46),
  },
  SCREEN: box(SCREEN.x, SCREEN.y, SCREEN.w, SCREEN.h),
  CONN_AT: { disp: pt(...CONNS.disp) },
  SCREW_AT: {},
  SPOT_AT: { jack: { front: pt(2, 100), back: pt(258, 100) }, slot: pt(60, 136) },
  SPOT_BOX: { slot: { back: box(56, 118, 18, 40) } },
  JACK: { front: box(-10, 86, 22, 28), back: box(248, 86, 22, 28) },
  BUTTON: { front: box(186, 18, 30, 22), back: box(44, 18, 30, 22) },
  ORDER: { front: ['shutter', 'lens'], back: ['battery', 'plugs', 'display', 'door'] },
  backBody: () => wrap(`<path class="pr-dark-plastic" d="${BODY}"/><rect class="pr-cavity" x="16" y="88" width="58" height="72" rx="6"/>
${socket(...CONNS.disp)}<rect class="pr-sd-slot" x="60" y="120" width="10" height="36" rx="2"/><g class="pr-spot" data-spot="slot"><path class="pr-slot-dust-path" d="M62 124v28"/></g>
<rect class="pr-midframe" x="90" y="60" width="152" height="100" rx="6"/><rect class="pr-side-btn" x="48" y="26" width="22" height="6" rx="3"/>${jackMark(258, 100, 4, 14)}`),
  frontBody: () => wrap(`<path class="pr-dark-plastic" d="${BODY}"/><rect class="pr-grip" x="196" y="44" width="58" height="122" rx="10"/>
<circle class="pr-mount" cx="140" cy="106" r="54"/><rect class="pr-sensor-plate" x="118" y="86" width="44" height="40" rx="3"/><circle class="pr-flash" cx="40" cy="62" r="8"/>
<rect class="pr-side-btn" x="192" y="26" width="18" height="10" rx="4"/><text class="pr-brand-dark" x="117" y="34" text-anchor="middle">ЗЕРКАЛКА</text>${jackMark(2, 100, 4, 14)}`),
  part: (id, s) => wrap({
    lens: () => `<circle class="pr-lens-barrel" cx="140" cy="106" r="56"/><circle class="pr-lens-ring2" cx="140" cy="106" r="46"/>${lensAt(140, 106, 34)}
${dustAt('glass', 136, 100, 1.4)}${s.parts.lens.broken ? '<path class="pr-crack-dark" d="M96 96l10 6-4 6 10 4"/>' : ''}`,
    shutter: () => `<rect class="pr-shutter" x="110" y="76" width="60" height="60" rx="3"/>${[0, 1, 2, 3, 4].map((k) => `<rect class="pr-shutter-blade" x="112" y="${78 + k * 11.5}" width="56" height="9"/>`).join('')}
${s.parts.shutter.broken ? '<path class="pr-tear" d="M116 84l12 6-6 4 14 6"/>' : ''}`,
    display: () => `<rect class="pr-glass" x="90" y="60" width="152" height="100" rx="6" fill="url(#pr-g-glass)"/>${screenStates(SCREEN, s, photo)}
<rect class="pr-heat" x="90" y="60" width="152" height="100" rx="6"/>`,
    door: () => '<rect class="pr-plastic pr-dark-plastic pr-door" x="14" y="84" width="62" height="80" rx="8"/><path class="pr-door-ridge" d="M24 96h42M24 104h42"/><rect class="pr-latch" x="30" y="150" width="30" height="6" rx="3"/>',
    battery: () => `${cell(20, 112, 36, 46, s, 'battery', 'EN-EL')}<rect class="pr-flex" x="40" y="104" width="12" height="10" rx="1"/>`,
  }[id]()),
  plug: (id) => wrap(plugBody(...CONNS[id], 'down')),
  screw: () => '',
};
