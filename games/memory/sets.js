// Наборы картинок «Мемори» — пять вариаций. Здесь только данные (что нарисовать), без DOM:
// рисует art.js, звуки играет sounds.js.
//
//   monsters — монстрики: каждый раз новые, собираются из тела, цвета, глаз, рта и «украшения»;
//   emoji    — эмодзи одной темы (животные, еда, транспорт…), тема — случайная на партию;
//   words    — «слово и картинка»: пара — это эмодзи и его название, карточки разные, смысл один;
//   patterns — узоры: фигура × цвет × заливка, нарочно похожие друг на друга — для внимательных;
//   sounds   — звуки: на карточке только динамик, пару узнаёшь на слух (только в «Своей игре»).
//
// makeFaces(setId, keys, group, rng) → массив из keys наборов лиц: faces[k] — лица карточек k-го ключа
// (у обычных наборов все group лиц одинаковые, у words — эмодзи и слово).

export const SETS = [
  { id: 'monsters', title: 'Монстрики', hint: 'Каждый раз новые — не запомнишь заранее' },
  { id: 'emoji', title: 'Эмодзи', hint: 'Животные, еда, транспорт — тема на каждую партию своя' },
  { id: 'words', title: 'Слово и картинка', hint: 'Пара — картинка и её название', pairsOnly: true },
  { id: 'patterns', title: 'Узоры', hint: 'Похожие фигуры — будь внимателен', hard: true },
  { id: 'sounds', title: 'Звуки', hint: 'Пару узнаёшь на слух — включи звук', freeOnly: true },
];

export const findSet = (id) => SETS.find((s) => s.id === id) ?? null;

// ---------- монстрики ----------

export const MONSTER = {
  bodies: 6,          // клякса, квадратик, привидение, круглый на ножках, треугольник, облачко
  colors: 9,
  eyes: 4,            // один большой, два, три, два сонных
  mouths: 4,          // улыбка, «о», зубки, язык
  extras: 5,          // нет, рожки, антенна, ушки, чубчик
};

/** Отличаются ли монстрики хотя бы двумя чертами (чтобы пары не путались из-за одной мелочи). */
const monsterFar = (a, b) => ['body', 'color', 'eyes', 'mouth', 'extra'].filter((k) => a[k] !== b[k]).length >= 2;

function monsters(count, rng) {
  const out = [];
  let guard = 0;
  while (out.length < count && guard++ < 5000) {
    const m = {
      type: 'monster',
      body: Math.floor(rng() * MONSTER.bodies),
      color: Math.floor(rng() * MONSTER.colors),
      eyes: Math.floor(rng() * MONSTER.eyes),
      mouth: Math.floor(rng() * MONSTER.mouths),
      extra: Math.floor(rng() * MONSTER.extras),
    };
    // тело или цвет должны отличаться от большинства — иначе поле из одинаковых клякс
    if (out.some((o) => !monsterFar(o, m))) continue;
    if (out.filter((o) => o.body === m.body && o.color === m.color).length >= 1) continue;
    out.push(m);
  }
  return out;
}

// ---------- эмодзи ----------
// Только давно поддерживаемые эмодзи (Unicode ≤ 11) — иначе на старых телефонах квадратики.

export const EMOJI_THEMES = [
  { id: 'animals', title: 'Животные', items: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🦉', '🐴', '🦄', '🐝', '🐢', '🐙', '🐬', '🐳', '🦀', '🐘'] },
  { id: 'food', title: 'Еда', items: ['🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🍒', '🍑', '🍍', '🥝', '🥑', '🍆', '🥕', '🌽', '🥐', '🍞', '🧀', '🍕', '🍔', '🌭', '🍟', '🍩', '🍪', '🎂', '🍦', '🍭'] },
  { id: 'transport', title: 'Транспорт', items: ['🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚐', '🚚', '🚜', '🛴', '🚲', '🛵', '🏍️', '🚂', '🚆', '🚇', '🚊', '🚁', '🛩️', '✈️', '🚀', '🛸', '⛵', '🚤', '🛳'] },
  { id: 'sport', title: 'Спорт и игры', items: ['⚽', '🏀', '🏈', '⚾', '🎾', '🏐', '🏉', '🎱', '🏓', '🏸', '🥊', '🥋', '⛳', '🏹', '🎣', '🛹', '⛸', '🎿', '🏆', '🥇', '🎯', '🎳', '🎮', '🎲', '🧩', '♟️', '🏒', '🎨'] },
  { id: 'nature', title: 'Природа и погода', items: ['🌸', '🌼', '🌻', '🌹', '🌷', '🌵', '🌲', '🌴', '🍀', '🍁', '🍄', '🌰', '🐚', '🌙', '⭐', '☀️', '⛅', '🌈', '❄️', '🔥', '💧', '🌊', '⚡', '☔', '⛄', '🌋', '🌍', '☄️'] },
  { id: 'things', title: 'Вещи', items: ['⏰', '📷', '💡', '🔑', '🔒', '✂️', '📌', '📎', '✏️', '🖍️', '📚', '🎁', '🎈', '🎀', '🔔', '🎸', '🎺', '🥁', '🎻', '👓', '🎩', '👑', '💎', '🧲', '🔭', '⚓', '⛺', '☂️'] },
];

function emoji(count, rng) {
  const theme = EMOJI_THEMES[Math.floor(rng() * EMOJI_THEMES.length)];
  return { theme: theme.id, faces: shuffle(theme.items.slice(), rng).slice(0, count).map((ch) => ({ type: 'emoji', ch })) };
}

// ---------- слово и картинка ----------

export const WORDS = [
  ['🍎', 'яблоко'], ['🐱', 'кот'], ['🐶', 'собака'], ['🚗', 'машина'], ['⚽', 'мяч'], ['🌙', 'луна'],
  ['🏠', 'дом'], ['🌲', 'ёлка'], ['🍌', 'банан'], ['🐟', 'рыба'], ['🐸', 'лягушка'], ['🎈', 'шарик'],
  ['🔑', 'ключ'], ['⏰', 'будильник'], ['🎸', 'гитара'], ['🚀', 'ракета'], ['🌈', 'радуга'], ['🍕', 'пицца'],
  ['🐝', 'пчела'], ['🦋', 'бабочка'], ['🍄', 'гриб'], ['🐢', 'черепаха'], ['🚲', 'велосипед'], ['✏️', 'карандаш'],
  ['🎁', 'подарок'], ['🐧', 'пингвин'], ['🦁', 'лев'], ['🐘', 'слон'], ['🍉', 'арбуз'], ['🍓', 'клубника'],
  ['🌻', 'подсолнух'], ['⛄', 'снеговик'], ['🔔', 'колокол'], ['🧀', 'сыр'], ['🥕', 'морковь'], ['🐌', 'улитка'],
  ['🦊', 'лиса'], ['🐻', 'медведь'], ['🐰', 'заяц'], ['🦉', 'сова'], ['🐙', 'осьминог'], ['🍋', 'лимон'],
  ['🍒', 'вишня'], ['🎩', 'шляпа'], ['👓', 'очки'], ['☂️', 'зонт'], ['⚓', 'якорь'], ['👑', 'корона'],
];

function words(count, rng) {
  return shuffle(WORDS.slice(), rng).slice(0, count).map(([ch, word]) => [{ type: 'emoji', ch }, { type: 'word', word }]);
}

// ---------- узоры ----------

export const PATTERN = {
  shapes: ['circle', 'square', 'triangle', 'diamond', 'star', 'hexagon'],
  colors: 6,
  fills: ['solid', 'stripes', 'dots', 'ring'],
};

/**
 * Узоры нарочно из небольшого «словаря»: берём мало фигур и цветов, чтобы карточки были похожи.
 * Чем больше ключей, тем шире словарь — но хотя бы два признака всегда общие у многих карточек.
 */
function patterns(count, rng) {
  const nShapes = count <= 6 ? 2 : count <= 10 ? 3 : 4;
  const nColors = count <= 6 ? 2 : count <= 12 ? 3 : 4;
  const shapes = shuffle(PATTERN.shapes.slice(), rng).slice(0, nShapes);
  const colors = shuffle([...Array(PATTERN.colors).keys()], rng).slice(0, nColors);
  const all = [];
  for (const shape of shapes) for (const color of colors) for (const fill of PATTERN.fills) all.push({ type: 'pattern', shape, color, fill });
  return shuffle(all, rng).slice(0, count);
}

// ---------- звуки ----------

export const SOUNDS = [
  { id: 'drum', icon: '🥁', title: 'Барабан' },
  { id: 'bell', icon: '🔔', title: 'Колокольчик' },
  { id: 'major', icon: '🎹', title: 'Весёлый аккорд' },
  { id: 'minor', icon: '🎻', title: 'Грустный аккорд' },
  { id: 'up', icon: '🚀', title: 'Взлёт' },
  { id: 'down', icon: '🍂', title: 'Падение' },
  { id: 'meow', icon: '🐱', title: 'Мяу' },
  { id: 'bird', icon: '🐦', title: 'Птичка' },
  { id: 'laser', icon: '🔫', title: 'Лазер' },
  { id: 'coin', icon: '💰', title: 'Монетка' },
  { id: 'boing', icon: '🦘', title: 'Пружинка' },
  { id: 'bubble', icon: '🎈', title: 'Пузырь' },
];

function sounds(count, rng) {
  return shuffle(SOUNDS.slice(), rng).slice(0, count).map((s) => ({ type: 'sound', sound: s.id }));
}

// ---------- общее ----------

/** Сколько разных ключей набор может дать. */
export function maxKeys(setId) {
  return {
    monsters: 40, emoji: Math.min(...EMOJI_THEMES.map((t) => t.items.length)), words: WORDS.length,
    patterns: PATTERN.shapes.length * PATTERN.colors * PATTERN.fills.length, sounds: SOUNDS.length,
  }[setId] ?? 0;
}

export function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Лица для keys ключей по group карточек. Возвращает { faces, theme }: faces[k] — массив из group лиц.
 */
export function makeFaces(setId, keys, group, rng) {
  if (keys > maxKeys(setId)) throw new Error(`набор ${setId}: нужно ${keys} ключей, есть ${maxKeys(setId)}`);
  const same = (face) => Array.from({ length: group }, () => face);
  switch (setId) {
    case 'monsters': return { faces: monsters(keys, rng).map(same), theme: null };
    case 'emoji': {
      const { theme, faces } = emoji(keys, rng);
      return { faces: faces.map(same), theme };
    }
    case 'words':
      if (group !== 2) throw new Error('«Слово и картинка» — только пары');
      return { faces: words(keys, rng), theme: null };
    case 'patterns': return { faces: patterns(keys, rng).map(same), theme: null };
    case 'sounds': return { faces: sounds(keys, rng).map(same), theme: null };
    default: throw new Error(`неизвестный набор ${setId}`);
  }
}

/** Одинаковы ли два лица (для проверок: у разных ключей лица не должны совпадать). */
export const faceId = (f) => JSON.stringify(f);
