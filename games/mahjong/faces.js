// Рисунки плиток. Вид (kind 0..35) и вариант (face 0..3 — только у «цветов» и «сезонов») → разметка.
// Стили: китайский (рисуем SVG сами: кружки, бамбук, иероглифы), фрукты, животные, карты, разное (эмодзи).
// Эмодзи — только из давно поддерживаемых наборов, чтобы на старых телефонах не было «квадратиков».

export const STYLES = ['chinese', 'fruits', 'animals', 'cards', 'misc'];
export const STYLE_NAMES = { chinese: 'Китайский', fruits: 'Фрукты', animals: 'Животные', cards: 'Карты', misc: 'Разное' };

const EMOJI = {
  fruits: ['🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🍒', '🍑', '🍍', '🥝', '🍅', '🍆', '🥑', '🥕',
    '🌽', '🌶️', '🥒', '🥦', '🍄', '🥜', '🌰', '🍞', '🥐', '🥖', '🧀', '🥚', '🍳', '🥞', '🍔', '🍟', '🍕', '🌭',
    '🍩', '🍪'],
  animals: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔',
    '🐧', '🐦', '🐤', '🦆', '🦅', '🦉', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐢', '🐍', '🐙',
    '🦀', '🐬'],
  misc: ['⭐', '🌙', '☀️', '🌈', '⚡', '❄️', '🔥', '💧', '🌵', '🌸', '🌻', '🍀', '🍁', '🌴', '🎈', '🎁', '🎀',
    '🎨', '🎲', '🎯', '🎸', '🎺', '🥁', '🚗', '🚀', '✈️', '⛵', '🚲', '⚽', '🏀', '🎾', '🏈', '⚾', '🎳', '💎',
    '👑'],
};

const CJK = `font-family="'PingFang SC','Hiragino Sans GB','Microsoft YaHei','Noto Sans CJK SC','Source Han Sans SC',sans-serif"`;
const svg = (body) => `<svg viewBox="0 0 60 80" aria-hidden="true">${body}</svg>`;

// ---------- китайский набор ----------

// Кружки: расположения для 1..9 (центры в координатах 60×80)
const DOT_LAYOUT = [
  [[30, 40]],
  [[30, 22], [30, 58]],
  [[15, 18], [30, 40], [45, 62]],
  [[18, 22], [42, 22], [18, 58], [42, 58]],
  [[18, 20], [42, 20], [30, 40], [18, 60], [42, 60]],
  [[18, 16], [42, 16], [18, 40], [42, 40], [18, 64], [42, 64]],
  [[12, 13], [30, 22], [48, 31], [18, 50], [42, 50], [18, 68], [42, 68]],
  [[18, 12], [42, 12], [18, 31], [42, 31], [18, 50], [42, 50], [18, 69], [42, 69]],
  [[13, 16], [30, 16], [47, 16], [13, 40], [30, 40], [47, 40], [13, 64], [30, 64], [47, 64]],
];
const DOT_COLORS = ['#1f5fbf', '#1d8a46', '#c62828'];

function dots(n) {
  const r = n === 1 ? 16 : n <= 4 ? 10 : n <= 6 ? 8.5 : 7.2;
  return svg(DOT_LAYOUT[n - 1].map(([x, y], k) => {
    const color = n === 1 ? '#c62828' : DOT_COLORS[(k + n) % 3];
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}"/><circle cx="${x}" cy="${y}" r="${r * 0.55}" fill="#fffdf6"/>`
      + `<circle cx="${x}" cy="${y}" r="${r * 0.25}" fill="${color}"/>`;
  }).join(''));
}

// Бамбук: палочки (вертикальные), расположения для 2..9
const STICK_LAYOUT = [
  null,
  [[30, 22], [30, 58]],
  [[30, 22], [18, 58], [42, 58]],
  [[18, 22], [42, 22], [18, 58], [42, 58]],
  [[16, 22], [44, 22], [30, 40], [16, 58], [44, 58]],
  [[13, 22], [30, 22], [47, 22], [13, 58], [30, 58], [47, 58]],
  [[30, 13], [13, 40], [30, 40], [47, 40], [13, 67], [30, 67], [47, 67]],
  [[12, 22], [24, 22], [36, 22], [48, 22], [12, 58], [24, 58], [36, 58], [48, 58]],
  [[13, 13], [30, 13], [47, 13], [13, 40], [30, 40], [47, 40], [13, 67], [30, 67], [47, 67]],
];

function stick(x, y, h, color) {
  const w = 6;
  return `<rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="3" fill="${color}"/>`
    + `<rect x="${x - w / 2 - 1}" y="${y - 1}" width="${w + 2}" height="2.4" rx="1.2" fill="#0d5c2e"/>`
    + `<rect x="${x - 1}" y="${y - h / 2 + 3}" width="2" height="${h - 6}" fill="#ffffff" opacity="0.35"/>`;
}

function bamboo(n) {
  if (n === 1) {
    // единица бамбука — традиционно птица: рисуем стилизованного павлина
    return svg('<ellipse cx="30" cy="44" rx="15" ry="20" fill="#1d8a46"/>'
      + '<ellipse cx="30" cy="44" rx="9" ry="13" fill="#c62828"/>'
      + '<circle cx="30" cy="20" r="8" fill="#1f5fbf"/><circle cx="33" cy="18" r="2" fill="#fffdf6"/>'
      + '<path d="M22 64 L30 76 L38 64 Z" fill="#1d8a46"/>');
  }
  const h = n <= 6 ? 26 : 20;
  return svg(STICK_LAYOUT[n - 1].map(([x, y], k) => stick(x, y, h, n === 9 && k % 3 === 1 ? '#c62828' : '#1d8a46')).join(''));
}

const NUMERALS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

function character(n) {
  return svg(`<text x="30" y="31" text-anchor="middle" font-size="26" font-weight="700" fill="#1a2440" ${CJK}>${NUMERALS[n - 1]}</text>`
    + `<text x="30" y="70" text-anchor="middle" font-size="30" font-weight="700" fill="#c62828" ${CJK}>萬</text>`);
}

function bigChar(ch, color, sub = '') {
  return svg(`<text x="30" y="${sub ? 50 : 54}" text-anchor="middle" font-size="40" font-weight="700" fill="${color}" ${CJK}>${ch}</text>`
    + (sub ? `<text x="52" y="75" text-anchor="end" font-size="12" font-weight="700" fill="${color}">${sub}</text>` : ''));
}

const WINDS = ['東', '南', '西', '北'];
const FLOWERS = [['梅', '#c62828'], ['蘭', '#1f5fbf'], ['菊', '#d98200'], ['竹', '#1d8a46']];
const SEASONS = [['春', '#1d8a46'], ['夏', '#c62828'], ['秋', '#d98200'], ['冬', '#1f5fbf']];

function chinese(kind, face) {
  if (kind < 9) return dots(kind + 1);
  if (kind < 18) return bamboo(kind - 8);
  if (kind < 27) return character(kind - 17);
  if (kind < 31) return bigChar(WINDS[kind - 27], '#1a2440');
  if (kind === 31) return bigChar('中', '#c62828');
  if (kind === 32) return bigChar('發', '#1d8a46');
  if (kind === 33) {
    return svg('<rect x="12" y="14" width="36" height="52" rx="4" fill="none" stroke="#1f5fbf" stroke-width="4"/>'
      + '<rect x="18" y="20" width="24" height="40" rx="2" fill="none" stroke="#1f5fbf" stroke-width="2"/>');
  }
  const [ch, color] = (kind === 34 ? FLOWERS : SEASONS)[face];
  return bigChar(ch, color, String(face + 1));
}

// ---------- карты ----------

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9'];
const SUITS = [['♠', '#1a1a1a'], ['♥', '#d42a2a'], ['♦', '#d42a2a'], ['♣', '#1a1a1a']];

function card(kind) {
  const [suit, color] = SUITS[Math.floor(kind / 9)];
  const rank = RANKS[kind % 9];
  return svg(`<text x="30" y="36" text-anchor="middle" font-size="30" font-weight="800" fill="${color}" font-family="Georgia,serif">${rank}</text>`
    + `<text x="30" y="70" text-anchor="middle" font-size="30" fill="${color}" font-family="'Segoe UI Symbol','Apple Symbols',sans-serif">${suit}</text>`);
}

/** Разметка лицевой стороны плитки. */
export function faceHTML(style, kind, face) {
  if (style === 'chinese') return chinese(kind, face);
  if (style === 'cards') return card(kind);
  const list = EMOJI[style] ?? EMOJI.fruits;
  return `<span class="mj-emoji">${list[kind]}</span>`;
}
