// Bongo Cat по мотивам bongo.cat (Externalizable, MIT): кот бьёт лапой по инструменту на каждое нажатие.
// Здесь — только данные и чистые функции: инструменты, клавиши, ноты, мелодии, статистика. Без DOM и звука.
//
// Клавиши — как на bongo.cat: A/D — бонго, 1…0 — пианино, Q…P — маримба, C — тарелка, B — бубен,
// F — колокольчик, пробел — «мяу». Ищем по e.code (физическое место клавиши), поэтому работает
// и в русской раскладке: «ф» — это та же клавиша, что A.

/** Десять нот подряд по полутонам от до первой октавы: 1 — до, 2 — до-диез, … 0 — ля (как на bongo.cat). */
export const NOTE_COUNT = 10;
const BLACK = new Set([1, 3, 6, 8]);             // до-диез, ре-диез, фа-диез, соль-диез
const NOTE_NAMES = ['до', 'до♯', 'ре', 'ре♯', 'ми', 'фа', 'фа♯', 'соль', 'соль♯', 'ля'];

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
const LETTERS = ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'];

/** Десять клавиш-нот: нижняя половина — левой лапой, верхняя — правой. extra — запасные клавиши. */
function notePads(labels, codes, extra = []) {
  return labels.map((label, i) => ({
    id: `n${i}`,
    label,
    code: codes[i],
    ...(extra[i] ? { alt: extra[i] } : {}),
    note: i,
    name: NOTE_NAMES[i],
    black: BLACK.has(i),
    paw: i < 5 ? 'left' : 'right',
  }));
}

export const INSTRUMENTS = [
  {
    id: 'bongo',
    title: 'Бонго',
    pads: [
      { id: 'low', label: 'A', code: 'KeyA', note: 0, name: 'Левый', paw: 'left' },
      { id: 'high', label: 'D', code: 'KeyD', note: 1, name: 'Правый', paw: 'right' },
    ],
  },
  { id: 'keyboard', title: 'Пианино', pads: notePads(DIGITS, DIGITS.map((d) => `Digit${d}`), DIGITS.map((d) => `Numpad${d}`)) },
  { id: 'marimba', title: 'Маримба', pads: notePads(LETTERS, LETTERS.map((l) => `Key${l}`)) },
  { id: 'cymbal', title: 'Тарелка', pads: [{ id: 'hit', label: 'C', code: 'KeyC', note: 0, name: 'Тарелка', paw: 'right' }] },
  { id: 'tambourine', title: 'Бубен', pads: [{ id: 'hit', label: 'B', code: 'KeyB', note: 0, name: 'Бубен', paw: 'right' }] },
  { id: 'cowbell', title: 'Колокольчик', pads: [{ id: 'hit', label: 'F', code: 'KeyF', note: 0, name: 'Колокольчик', paw: 'right' }] },
  // «Мяу» — не инструмент на столе: кот открывает рот, а на столе остаётся то, что было.
  { id: 'meow', title: 'Мяу', voice: true, pads: [{ id: 'meow', label: 'Пробел', code: 'Space', note: 0, name: 'Мяу', paw: 'mouth' }] },
];

export const findInstrument = (id) => INSTRUMENTS.find((i) => i.id === id) ?? null;

const BY_CODE = new Map();
const BY_ALT = new Map();
for (const instrument of INSTRUMENTS) {
  for (const pad of instrument.pads) {
    BY_CODE.set(pad.code, { instrument: instrument.id, pad });
    if (pad.alt) BY_ALT.set(pad.alt, { instrument: instrument.id, pad });
  }
}

/**
 * Клавиша физической клавиатуры → { instrument, pad } или null.
 * Запасные клавиши тоже считаются: цифры цифрового блока (Numpad) играют пианино.
 */
export const padForCode = (code) => BY_CODE.get(code) ?? BY_ALT.get(code) ?? null;

// ---------- две октавы (в бете 'bongo-octaves'; просьба игрока-музыканта, 2026-09-26) ----------
// Пианино и маримба: полная октава — 12 клавиш до «си» (на bongo.cat их 10, до «ля»), по желанию — две.
// С клавиатуры: ряд цифр (или Q…P) + «-» «=» (или «[» «]») — первая октава, с Shift — вторая.

const NAMES_12 = ['до', 'до♯', 'ре', 'ре♯', 'ми', 'фа', 'фа♯', 'соль', 'соль♯', 'ля', 'ля♯', 'си'];
const BLACK_12 = new Set([1, 3, 6, 8, 10]);
const ROW_KEYS = {
  keyboard: { labels: [...DIGITS, '-', '='], codes: [...DIGITS.map((d) => `Digit${d}`), 'Minus', 'Equal'] },
  marimba: { labels: [...LETTERS, '[', ']'], codes: [...LETTERS.map((l) => `Key${l}`), 'BracketLeft', 'BracketRight'] },
};

/**
 * Клавиши пианино или маримбы на 1 или 2 октавы: ноты 0…11 (…23), id — n<нота> (как у обычных, чтобы
 * подсказка мелодии находила клавишу). Лапа — по месту клавиши на экране (левая половина ряда — левой лапой):
 * в ряду из одной октавы (7 белых) до…фа — левой (фа — ровно посередине, её центр чуть левее), фа♯…си — правой; две октавы одной строкой (oneRow, альбомный
 * вид) — нижняя октава левой, верхняя правой. Раньше при двух рядах лапа шла по октаве, и левые клавиши верхнего
 * ряда били правой лапой (видео владельца, 2026-09-26).
 */
export function octavePads(instrumentId, octaves = 1, oneRow = false) {
  const row = ROW_KEYS[instrumentId];
  if (!row) return null;
  return Array.from({ length: 12 * octaves }, (_, note) => {
    const k = note % 12, up = note >= 12;
    return {
      id: `n${note}`,
      label: up ? `⇧${row.labels[k]}` : row.labels[k],
      code: row.codes[k],
      shift: up,
      note,
      name: NAMES_12[k],
      black: BLACK_12.has(k),
      paw: (octaves === 2 && oneRow ? note < 12 : k < 6) ? 'left' : 'right',
    };
  });
}

/** Клавиша компьютера → { instrument, note } для пианино и маримбы в режиме октав (Shift — октавой выше). */
export function octaveKey(code, shift) {
  for (const [instrument, row] of Object.entries(ROW_KEYS)) {
    let k = row.codes.indexOf(code);
    if (k < 0 && instrument === 'keyboard' && code.startsWith('Numpad')) k = DIGITS.indexOf(code.slice(6));
    if (k >= 0) return { instrument, note: k + (shift ? 12 : 0) };
  }
  return null;
}

/** Частота ноты: 0 — до первой октавы (C4), дальше по полутонам. */
export const noteFreq = (semitone, octave = 0) => 261.6256 * 2 ** (semitone / 12 + octave);

// ---------- мелодии ----------
// Запись — как в README bongo.cat: номера клавиш пианино через пробел, «/» — конец фразы.
// Только народные и давно общественные мелодии.
export const SONGS = [
  { id: 'birthday', title: 'С днём рождения', notes: '1 1 3 1 6 5 / 1 1 3 1 8 6' },
  {
    id: 'ode',
    title: 'Ода к радости',
    notes: '5 5 6 8 8 6 5 3 1 1 3 5 5 3 3 / 5 5 6 8 8 6 5 3 1 1 3 5 3 1 1',
  },
  {
    id: 'twinkle',
    title: 'Twinkle, Twinkle, Little Star',
    notes: '1 1 8 8 0 0 8 / 6 6 5 5 3 3 1 / 8 8 6 6 5 5 3 / 8 8 6 6 5 5 3 / 1 1 8 8 0 0 8 / 6 6 5 5 3 3 1',
  },
  {
    id: 'jingle',
    title: 'Jingle Bells',
    notes: '5 5 5 / 5 5 5 / 5 8 1 3 5 / 6 6 6 6 6 5 5 5 5 3 3 5 3 8',
  },
];

/** Ноты мелодии списком подписей клавиш (без «/»). */
export const songKeys = (song) => song.notes.split(/\s+/).filter((t) => t && t !== '/');

/** Фразы мелодии — для показа нот строчками. */
export const songPhrases = (song) => song.notes.split('/').map((p) => p.trim().split(/\s+/).filter(Boolean));

/**
 * Разучивание мелодии: pos — сколько нот уже сыграно. Нажата подпись label (на пианино или маримбе —
 * номер ноты одинаковый). Верная нота двигает дальше, неверная оставляет на месте.
 * Возвращает { pos, hit, done }.
 */
export function followSong(song, pos, noteIndex) {
  const keys = songKeys(song);
  if (pos >= keys.length) return { pos, hit: false, done: true };
  const expected = DIGITS.indexOf(keys[pos]);
  if (noteIndex !== expected) return { pos, hit: false, done: false };
  return { pos: pos + 1, hit: true, done: pos + 1 >= keys.length };
}

/** Номер ноты, которую ждёт мелодия, или null. */
export function expectedNote(song, pos) {
  const keys = songKeys(song);
  return pos < keys.length ? DIGITS.indexOf(keys[pos]) : null;
}

// ---------- статистика ----------

export const emptyStats = () => ({ hits: 0, meows: 0, songs: 0, by: {} });

export function isValidStats(s) {
  return Boolean(s) && typeof s === 'object'
    && Number.isInteger(s.hits) && s.hits >= 0
    && Number.isInteger(s.meows) && s.meows >= 0
    && Number.isInteger(s.songs ?? 0)
    && s.by && typeof s.by === 'object';
}

export function recordHit(stats, instrumentId) {
  const by = { ...stats.by, [instrumentId]: (stats.by[instrumentId] ?? 0) + 1 };
  return {
    ...stats,
    hits: stats.hits + 1,
    meows: stats.meows + (instrumentId === 'meow' ? 1 : 0),
    by,
  };
}

/** Строка для меню: «Ударов: 1 234». */
export const progressLine = (stats) => `Ударов: ${stats.hits.toLocaleString('ru-RU')}`;
