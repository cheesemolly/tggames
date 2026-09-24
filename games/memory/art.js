// Рисунки лицевой стороны карточек «Мемори» — SVG-строки, без файлов.
// Монстрики и узоры собираются из описаний sets.js; бонусные карточки — свои значки.
// Цвета монстриков и узоров — игровые переменные (--mm-c0…c8), заданы в game.css для обеих тем.

const svg = (body, vb = '0 0 100 100') => `<svg viewBox="${vb}" aria-hidden="true">${body}</svg>`;

// ---------- монстрики ----------

const BODIES = [
  // клякса
  'M50 12 C72 10 88 28 86 50 C88 70 76 90 52 88 C28 90 12 74 14 50 C12 28 28 14 50 12 Z',
  // квадратик со скруглениями
  'M22 18 H78 Q88 18 88 28 V80 Q88 90 78 90 H22 Q12 90 12 80 V28 Q12 18 22 18 Z',
  // привидение
  'M16 88 V46 C16 24 32 10 50 10 C68 10 84 24 84 46 V88 L73 80 L62 88 L50 80 L38 88 L27 80 Z',
  // круглый на ножках
  'M50 14 C72 14 86 30 86 50 C86 68 74 80 60 82 L60 92 L52 92 L52 84 L48 84 L48 92 L40 92 L40 82 C26 80 14 68 14 50 C14 30 28 14 50 14 Z',
  // треугольник
  'M50 10 L90 86 Q92 92 84 92 H16 Q8 92 10 86 Z',
  // облачко
  'M28 88 C14 88 8 76 14 66 C6 58 12 42 26 44 C24 28 40 18 52 26 C62 14 82 20 80 38 C94 40 96 60 84 66 C92 78 82 90 70 88 Z',
];

/** Где у тела лицо: центр глаз (y) и рта (y), ширина — чтобы на треугольнике всё влезло. */
const FACE = [
  { eyeY: 44, mouthY: 64, spread: 14 },
  { eyeY: 44, mouthY: 66, spread: 16 },
  { eyeY: 40, mouthY: 60, spread: 14 },
  { eyeY: 42, mouthY: 62, spread: 14 },
  { eyeY: 58, mouthY: 76, spread: 10 },
  { eyeY: 52, mouthY: 70, spread: 15 },
];

const eye = (x, y, r = 7) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" stroke="#1c1c1c" stroke-width="2.5"/>`
  + `<circle cx="${x + r * 0.25}" cy="${y + r * 0.15}" r="${r * 0.45}" fill="#1c1c1c"/>`
  + `<circle cx="${x + r * 0.45}" cy="${y - r * 0.2}" r="${r * 0.16}" fill="#fff"/>`;

function eyes(kind, f) {
  const { eyeY: y, spread: s } = f;
  switch (kind) {
    case 0: return eye(50, y, 11);                                             // один большой
    case 1: return eye(50 - s, y) + eye(50 + s, y);                            // два
    case 2: return eye(50 - s - 3, y + 2, 6) + eye(50, y - 5, 6) + eye(50 + s + 3, y + 2, 6);   // три
    default: return `<path d="M${50 - s - 7} ${y} q7 6 14 0 M${50 + s - 7} ${y} q7 6 14 0" stroke="#1c1c1c" stroke-width="3" fill="none" stroke-linecap="round"/>`;   // сонные
  }
}

function mouth(kind, f) {
  const y = f.mouthY;
  switch (kind) {
    case 0: return `<path d="M40 ${y} q10 10 20 0" stroke="#1c1c1c" stroke-width="3.2" fill="none" stroke-linecap="round"/>`;
    case 1: return `<ellipse cx="50" cy="${y + 2}" rx="6" ry="7" fill="#1c1c1c"/><ellipse cx="50" cy="${y + 5}" rx="3.5" ry="3" fill="#ff7a8a"/>`;
    case 2: return `<path d="M37 ${y} h26 q-2 11 -13 11 q-11 0 -13 -11 Z" fill="#1c1c1c"/>`
      + `<path d="M42 ${y} v4 h5 v-4 M53 ${y} v4 h5 v-4" fill="#fff"/>`;
    default: return `<path d="M40 ${y} q10 8 20 0" stroke="#1c1c1c" stroke-width="3.2" fill="none" stroke-linecap="round"/>`
      + `<path d="M48 ${y + 3} q2 9 7 2" fill="#ff7a8a" stroke="#1c1c1c" stroke-width="2"/>`;
  }
}

function extra(kind, color, body) {
  const top = body === 4 ? 14 : body === 5 ? 22 : 16;
  switch (kind) {
    case 1: return `<path d="M34 ${top + 8} L28 ${top - 8} L42 ${top + 4} Z M66 ${top + 8} L72 ${top - 8} L58 ${top + 4} Z" fill="#fff4d6" stroke="#1c1c1c" stroke-width="2.5" stroke-linejoin="round"/>`;
    case 2: return `<path d="M50 ${top + 2} Q48 ${top - 8} 56 ${top - 12}" stroke="#1c1c1c" stroke-width="2.5" fill="none"/><circle cx="57" cy="${top - 13}" r="4.5" fill="var(${color})" stroke="#1c1c1c" stroke-width="2.5"/>`;
    case 3: return `<circle cx="27" cy="${top + 6}" r="9" fill="var(${color})" stroke="#1c1c1c" stroke-width="2.5"/><circle cx="73" cy="${top + 6}" r="9" fill="var(${color})" stroke="#1c1c1c" stroke-width="2.5"/>`;
    case 4: return `<path d="M42 ${top + 4} q2 -14 8 -12 q6 -2 8 12" fill="var(${color})" stroke="#1c1c1c" stroke-width="2.5"/>`;
    default: return '';
  }
}

export function monsterSvg(m) {
  const color = `--mm-c${m.color}`;
  const f = FACE[m.body];
  const cheeks = m.mouth !== 2 ? `<circle cx="${50 - f.spread - 8}" cy="${f.mouthY - 4}" r="4" fill="#ff7a8a" opacity="0.45"/><circle cx="${50 + f.spread + 8}" cy="${f.mouthY - 4}" r="4" fill="#ff7a8a" opacity="0.45"/>` : '';
  return svg(
    extra(m.extra, color, m.body)
    + `<path d="${BODIES[m.body]}" fill="var(${color})" stroke="#1c1c1c" stroke-width="3" stroke-linejoin="round"/>`
    + `<path d="${BODIES[m.body]}" fill="url(#mm-shine)" opacity="0.5"/>`
    + eyes(m.eyes, f) + cheeks + mouth(m.mouth, f),
  );
}

// ---------- узоры ----------

const SHAPES = {
  circle: '<circle cx="50" cy="50" r="34"/>',
  square: '<rect x="18" y="18" width="64" height="64" rx="6"/>',
  triangle: '<path d="M50 14 L88 82 H12 Z"/>',
  diamond: '<path d="M50 10 L88 50 L50 90 L12 50 Z"/>',
  star: '<path d="M50 10 L61 38 L91 39 L67 58 L76 88 L50 70 L24 88 L33 58 L9 39 L39 38 Z"/>',
  hexagon: '<path d="M50 12 L84 31 V69 L50 88 L16 69 V31 Z"/>',
};

export function patternSvg(p, uid) {
  const color = `var(--mm-p${p.color})`;
  const shape = SHAPES[p.shape];
  const clip = `mmclip-${uid}`;
  let fill = '';
  if (p.fill === 'solid') fill = `<g fill="${color}">${shape}</g>`;
  else if (p.fill === 'stripes') {
    fill = `<clipPath id="${clip}">${shape}</clipPath><g clip-path="url(#${clip})" stroke="${color}" stroke-width="6">`
      + Array.from({ length: 12 }, (_, k) => `<path d="M${k * 12 - 40} 100 L${k * 12 + 60} 0"/>`).join('') + '</g>';
  } else if (p.fill === 'dots') {
    let dots = '';
    for (let y = 14; y < 96; y += 12) for (let x = 14 + ((y / 12) % 2) * 6; x < 96; x += 12) dots += `<circle cx="${x}" cy="${y}" r="3.6"/>`;
    fill = `<clipPath id="${clip}">${shape}</clipPath><g clip-path="url(#${clip})" fill="${color}">${dots}</g>`;
  } else {
    fill = `<g fill="none" stroke="${color}" stroke-width="6" transform="translate(50 50) scale(0.55) translate(-50 -50)">${shape}</g>`;
  }
  return svg(`${fill}<g fill="none" stroke="${color}" stroke-width="5" stroke-linejoin="round">${shape}</g>`);
}

// ---------- бонусные карточки и звук ----------

export const SPECIAL_INFO = {
  gold: { title: 'Золото', text: 'Очки за эту пару ×3' },
  eye: { title: 'Глаз', text: 'На мгновение показывает все карточки' },
  vortex: { title: 'Вихрь', text: 'Перемешивает оставшиеся карточки' },
  clock: { title: 'Часы', text: '+10 секунд' },
  heart: { title: 'Сердце', text: '+1 жизнь' },
  joker: { title: 'Джокер', text: 'Подходит к любой карточке' },
};

const SPECIAL_ART = {
  gold: '<circle cx="50" cy="50" r="30" fill="#f5c542" stroke="#b7862a" stroke-width="5"/>'
    + '<circle cx="50" cy="50" r="21" fill="none" stroke="#fff3c4" stroke-width="3" opacity="0.8"/>'
    + '<path d="M50 34 L55 46 L68 46 L58 54 L62 67 L50 59 L38 67 L42 54 L32 46 L45 46 Z" fill="#fff3c4"/>',
  eye: '<path d="M10 50 Q50 12 90 50 Q50 88 10 50 Z" fill="#fff" stroke="#2b6cb0" stroke-width="5"/>'
    + '<circle cx="50" cy="50" r="15" fill="#3b82f6"/><circle cx="50" cy="50" r="7" fill="#0f172a"/><circle cx="55" cy="45" r="3" fill="#fff"/>',
  vortex: '<g fill="none" stroke="#8b5cf6" stroke-width="6" stroke-linecap="round">'
    + '<path d="M50 50 m0 -6 a6 6 0 1 1 -6 6 a12 12 0 0 1 12 -12 a18 18 0 0 1 18 18 a24 24 0 0 1 -24 24 a30 30 0 0 1 -30 -30"/></g>',
  clock: '<circle cx="50" cy="52" r="32" fill="#fff" stroke="#16a34a" stroke-width="6"/>'
    + '<path d="M50 52 V32 M50 52 L64 60" stroke="#15803d" stroke-width="6" stroke-linecap="round"/>'
    + '<path d="M40 14 H60" stroke="#16a34a" stroke-width="6" stroke-linecap="round"/>'
    + '<text x="82" y="26" font-size="20" font-weight="800" fill="#16a34a" text-anchor="middle">+10</text>',
  heart: '<path d="M50 84 C20 64 12 48 14 36 C16 22 34 16 50 32 C66 16 84 22 86 36 C88 48 80 64 50 84 Z" fill="#ef4444" stroke="#b91c1c" stroke-width="4"/>'
    + '<path d="M30 36 q4 -8 12 -6" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" opacity="0.7"/>',
  joker: '<path d="M20 40 L32 18 L44 38 L50 14 L56 38 L68 18 L80 40 L74 58 H26 Z" fill="#ec4899" stroke="#9d174d" stroke-width="4" stroke-linejoin="round"/>'
    + '<circle cx="32" cy="18" r="5" fill="#fde047"/><circle cx="50" cy="14" r="5" fill="#fde047"/><circle cx="68" cy="18" r="5" fill="#fde047"/>'
    + '<circle cx="50" cy="70" r="16" fill="#fff" stroke="#9d174d" stroke-width="4"/>'
    + '<circle cx="44" cy="68" r="2.5" fill="#1c1c1c"/><circle cx="56" cy="68" r="2.5" fill="#1c1c1c"/>'
    + '<path d="M43 75 q7 6 14 0" stroke="#1c1c1c" stroke-width="2.5" fill="none" stroke-linecap="round"/>',
};

export const specialSvg = (kind) => svg(SPECIAL_ART[kind] ?? '');

export const speakerSvg = () => svg(
  '<path d="M18 40 H34 L54 22 V78 L34 60 H18 Z" fill="currentColor"/>'
  + '<g fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" class="mm-waves">'
  + '<path d="M64 38 q8 12 0 24"/><path d="M74 28 q16 22 0 44"/></g>',
);

/** Общие определения (блик монстриков) — один раз на поле. */
export const DEFS = '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>'
  + '<radialGradient id="mm-shine" cx="0.35" cy="0.25" r="0.6"><stop offset="0" stop-color="#fff" stop-opacity="0.9"/>'
  + '<stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs></svg>';
