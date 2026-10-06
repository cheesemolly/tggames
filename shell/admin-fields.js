// Раздел «Игры и подсказки» в карточке игрока (панель владельца, в бете 'admin-game-fields'): понятные поля
// вместо правки сырого JSON — подсказки, бонусы, уровни, счётчики рейтинга. Каждое поле — число по пути внутри
// сохранения игры (`game:<id>:<ключ>` в прогрессе игрока).
//
// Важно: игры проверяют свои сохранения целиком (isValidState / isValidStats…) и при одной ошибке выбрасывают
// ВСЁ сохранение молча. Поэтому здесь только целые числа в заданных пределах, а сами пределы сверены тестом
// с проверками игр. run — поле начатой партии: показывается, только если партия есть (новая начнётся заново).
// Отдельный модуль без DOM — чтобы проверять тестами.

export const GAME_FIELDS = [
  { game: 'words', key: 'progress', path: ['hints'], label: 'Подсказки', min: 0, max: 9999 },

  { game: 'memory', key: 'boosters', path: ['peek'], label: 'Помощник «Подглядеть»', min: 0, max: 99 },
  { game: 'memory', key: 'boosters', path: ['magnet'], label: 'Помощник «Магнит»', min: 0, max: 99 },
  { game: 'memory', key: 'progress', path: ['level'], label: 'Уровень', min: 1, max: 100000, note: 'в меню и рейтинге — после захода игрока в игру' },

  { game: 'snake', key: 'levels', path: ['level'], label: 'Текущий уровень', min: 1, max: 9999 },
  { game: 'snake', key: 'levels', path: ['best'], label: 'Пройдено уровней', min: 0, max: 9999, note: 'открыты уровни до этого числа + 1' },

  { game: 'brick-blast', key: 'stats', path: ['bestLevel'], label: 'Пройдено уровней', min: 0, max: 100000, note: 'открывает выбор уровня до этого числа + 1' },
  { game: 'brick-blast', key: 'current', path: ['balls'], label: 'Шариков', min: 1, max: 999, run: true },

  { game: 'arkanoid', key: 'stats', path: ['bestLevel'], label: 'Пройдено уровней', min: 0, max: 210, note: 'открывает выбор уровня до этого числа + 1' },
  { game: 'arkanoid', key: 'current', path: ['lives'], label: 'Шариков в запасе', min: 1, max: 5, run: true },

  { game: 'bubble-shooter', key: 'current', path: ['level'], label: 'Уровень', min: 1, max: 100000, run: true, note: 'поле остаётся прежним, дальше — следующий номер' },
  { game: 'bubble-shooter', key: 'current', path: ['shots'], label: 'Выстрелов', min: 0, max: 999, run: true },
  { game: 'bubble-shooter', key: 'current', path: ['bonuses', 'bomb'], label: 'Бонус «Бомба»', min: 0, max: 99, run: true },
  { game: 'bubble-shooter', key: 'current', path: ['bonuses', 'rainbow'], label: 'Бонус «Радуга»', min: 0, max: 99, run: true },
  { game: 'bubble-shooter', key: 'current', path: ['bonuses', 'fire'], label: 'Бонус «Огонь»', min: 0, max: 99, run: true },

  { game: 'repair', key: 'progress', path: ['level'], label: 'Следующий заказ', min: 1, max: 100000, note: 'починено = номер − 1' },
  { game: 'repair', key: 'progress', path: ['money'], label: 'Деньги, $', min: 0, max: 1000000 },

  { game: 'loop', key: 'current', path: ['level'], label: 'Уровень', min: 1, max: 100000, run: true, note: 'поле остаётся прежним, дальше — следующий номер' },
  { game: 'boggle', key: 'current', path: ['level'], label: 'Уровень', min: 1, max: 100000, run: true, note: 'поле остаётся прежним, дальше — следующий номер' },

  { game: 'connect-dots', key: 'current', path: ['hintsLeft'], label: 'Подсказки', min: 0, max: 99, run: true },
  { game: 'sudoku', key: 'current', path: ['hintsLeft'], label: 'Подсказки', min: 0, max: 99, run: true },
  { game: 'sudoku', key: 'current', path: ['mistakes'], label: 'Ошибки', min: 0, max: 99, run: true },
  { game: 'killer-sudoku', key: 'current', path: ['hintsLeft'], label: 'Подсказки', min: 0, max: 99, run: true },
  { game: 'killer-sudoku', key: 'current', path: ['mistakes'], label: 'Ошибки', min: 0, max: 99, run: true },
  { game: 'go', key: 'current', path: ['hints'], label: 'Подсказки', min: 0, max: 99, run: true },
  { game: 'nonogram', key: 'run', path: ['hints'], label: 'Подсказки', min: 0, max: 99, run: true },
  { game: 'minesweeper', key: 'current', path: ['hints'], label: 'Подсказки', min: 0, max: 99, run: true },
  { game: '2048', key: 'current', path: ['undoLeft'], label: 'Отмены хода', min: 0, max: 99, run: true },

  { game: 'flags', key: 'stats', path: ['correct'], label: 'Угадано флагов всего', min: 0, max: 1e9, note: 'по нему место в рейтинге' },
  { game: 'flags', key: 'stats', path: ['bestStreak'], label: 'Лучшая серия', min: 0, max: 1e9 },
  { game: 'bongo-cat', key: 'stats', path: ['hits'], label: 'Ударов', min: 0, max: 1e9, note: 'по ним место в рейтинге' },
];

export const fieldId = (f) => `${f.game}:${f.key}:${f.path.join('.')}`;
const storageKey = (f) => `game:${f.game}:${f.key}`;

function read(data, f) {
  let v = data?.[storageKey(f)];
  for (const part of f.path) v = v && typeof v === 'object' ? v[part] : undefined;
  return v;
}

/**
 * Поля, которые есть в прогрессе игрока, по играм (порядок — как в GAME_FIELDS):
 * [{ game, fields: [{ id, label, value, min, max, run, note }] }]. Поля без сохранения или не числа — пропускаются.
 */
export function gameFieldsOf(data) {
  const out = [];
  for (const f of GAME_FIELDS) {
    const value = read(data, f);
    if (!Number.isInteger(value)) continue;
    let group = out.find((g) => g.game === f.game);
    if (!group) out.push(group = { game: f.game, fields: [] });
    group.fields.push({ id: fieldId(f), label: f.label, value, min: f.min, max: f.max, run: Boolean(f.run), note: f.note ?? null });
  }
  return out;
}

/**
 * Применяет правки { id: 'текст из поля' } к копии прогресса. Меняются только поля из GAME_FIELDS, которые
 * уже есть в прогрессе. Не целое или вне пределов — { ok: false, label, min, max }; иначе { ok: true, data }.
 */
export function applyGameFields(data, edits) {
  const next = { ...data };
  for (const [id, raw] of Object.entries(edits)) {
    const f = GAME_FIELDS.find((x) => fieldId(x) === id);
    if (!f || !Number.isInteger(read(data, f))) continue;
    const text = String(raw ?? '').trim();
    const value = Number(text);
    if (!/^-?\d+$/.test(text) || !Number.isSafeInteger(value) || value < f.min || value > f.max) {
      return { ok: false, label: f.label, game: f.game, min: f.min, max: f.max };
    }
    // копии по пути: исходный прогресс не трогаем
    const key = storageKey(f);
    const root = { ...next[key] };
    next[key] = root;
    let obj = root;
    for (const part of f.path.slice(0, -1)) {
      obj[part] = { ...obj[part] };
      obj = obj[part];
    }
    obj[f.path.at(-1)] = value;
  }
  return { ok: true, data: next };
}
