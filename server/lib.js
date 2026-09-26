// Общие части серверного обработчика: проверка подписи Telegram, разбор данных, лимиты.
// Здесь нет ничего, что есть только в Cloudflare Workers (используется Web Crypto, он есть и в node),
// поэтому этот файл целиком покрывается тестами `node --test`.

export const MAX_STATE_BYTES = 400 * 1024;   // прогресс одного игрока; замер: 100 уровней «Слов» ≈ 64 КБ

// initData живёт сутки: Telegram кладёт в неё auth_date, и старую подпись мы не принимаем —
// чтобы перехваченная строка не работала вечно.
export const INIT_DATA_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const enc = new TextEncoder();

async function hmac(keyBytes, message) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

const toHex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Сравнение за одинаковое время: по времени ответа нельзя подбирать подпись посимвольно. */
export function timingSafeEqual(a, b) {
  const x = String(a);
  const y = String(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/**
 * Строка, которую Telegram подписывает: все поля **кроме hash**, в виде key=value,
 * отсортированные по имени и склеенные переводом строки.
 *
 * Важно: поле `signature` (есть у новых клиентов, нужно для сторонней проверки по Ed25519)
 * в эту строку ВХОДИТ. Если его исключить, подпись не сойдётся — на Telegram Desktop вход
 * падал именно из-за этого (найдено диагностикой /debug/initdata, 2026-09-23).
 */
export function dataCheckString(params) {
  return [...params.entries()]
    .filter(([key]) => key !== 'hash')
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n');
}

/**
 * Проверка initData мини-приложения.
 * Ключ подписи — HMAC-SHA256 от токена бота с ключом «WebAppData»; этим ключом подписана
 * dataCheckString. Токен есть только у сервера, поэтому подделать initData на клиенте нельзя.
 *
 * Возвращает { ok: true, user, authDate } или { ok: false, error }.
 */
export async function checkInitData(initData, botToken, { now = Date.now(), maxAgeMs = INIT_DATA_MAX_AGE_MS } = {}) {
  if (typeof initData !== 'string' || !initData) return { ok: false, error: 'no_init_data' };
  if (!botToken) return { ok: false, error: 'no_bot_token' };

  let params;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return { ok: false, error: 'bad_init_data' };
  }

  const hash = params.get('hash');
  if (!hash) return { ok: false, error: 'bad_init_data' };

  const secret = await hmac(enc.encode('WebAppData'), botToken);
  const expected = toHex(await hmac(secret, dataCheckString(params)));
  if (!timingSafeEqual(expected, hash)) return { ok: false, error: 'bad_signature' };

  const authDate = Number(params.get('auth_date')) * 1000;
  if (!Number.isFinite(authDate) || authDate <= 0) return { ok: false, error: 'bad_init_data' };
  if (now - authDate > maxAgeMs) return { ok: false, error: 'expired' };

  let user;
  try {
    user = JSON.parse(params.get('user') ?? 'null');
  } catch {
    return { ok: false, error: 'bad_user' };
  }
  if (!user || !Number.isFinite(user.id)) return { ok: false, error: 'bad_user' };

  return { ok: true, user, authDate, startParam: params.get('start_param') ?? null };
}

/**
 * Диагностика подписи: считает hash несколькими способами и говорит, какой сошёлся.
 * Нужна, когда вход не проходит, а токен заведомо правильный: сразу видно, дело в способе
 * подсчёта (кодирование значений, лишнее поле signature) или подпись вообще не от этого бота.
 * Наружу отдаёт только имена полей и признаки — ни самих данных, ни токена.
 */
export async function diagnoseInitData(initData, botToken) {
  const out = { ok: false, fields: [], hasSignature: false, hasHash: false, ageSec: null, matches: {} };
  if (typeof initData !== 'string' || !initData) return { ...out, error: 'no_init_data' };
  if (!botToken) return { ...out, error: 'no_bot_token' };

  const params = new URLSearchParams(initData);
  const hash = params.get('hash') ?? '';
  out.fields = [...params.keys()].sort();
  out.hasSignature = params.has('signature');
  out.hasHash = Boolean(hash);
  const authDate = Number(params.get('auth_date')) * 1000;
  if (Number.isFinite(authDate) && authDate > 0) out.ageSec = Math.round((Date.now() - authDate) / 1000);
  if (!hash) return { ...out, error: 'bad_init_data' };

  // Те же пары, но без декодирования — на случай, если значения надо брать «как в строке».
  const rawPairs = initData.split('&').map((part) => {
    const at = part.indexOf('=');
    return [part.slice(0, at), part.slice(at + 1)];
  });
  const build = (pairs, skip) => pairs
    .filter(([key]) => !skip.includes(key))
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n');

  const secret = await hmac(enc.encode('WebAppData'), botToken);
  const variants = {
    standard: build([...params.entries()], ['hash']),                     // так считаем мы
    withoutSignature: build([...params.entries()], ['hash', 'signature']),
    raw: build(rawPairs, ['hash']),
    rawWithoutSignature: build(rawPairs, ['hash', 'signature']),
  };
  for (const [name, text] of Object.entries(variants)) {
    out.matches[name] = timingSafeEqual(toHex(await hmac(secret, text)), hash);
  }
  out.ok = Object.values(out.matches).some(Boolean);
  return out;
}

/** Прогресс приходит строкой JSON: проверяем размер и то, что это вообще объект. */
export function validateState(data) {
  if (typeof data !== 'string') return 'state_type';
  if (enc.encode(data).length > MAX_STATE_BYTES) return 'state_big';
  let parsed;
  try {
    parsed = JSON.parse(data);
  } catch {
    return 'state_json';
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return 'state_shape';
  return null;
}

/** Админы — список Telegram-id в переменной ADMIN_IDS («123,456»). В коде их нет. */
export function parseAdminIds(value) {
  return String(value ?? '')
    .split(/[,\s]+/)
    .map((part) => Number(part))
    .filter((id) => Number.isFinite(id) && id > 0);
}

export const isAdmin = (tgId, adminIds) => adminIds.includes(Number(tgId));

/** Имя игрока для списков: «Маша (@masha)» или просто имя. */
export function displayName(user) {
  const name = [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim() || 'Без имени';
  return user?.username ? `${name} (@${user.username})` : name;
}

// ---------- игры: для инлайн-режима и /me ----------

/**
 * Список игр для бота — сервер не грузит реестр мини-приложения (shell/registry.js), поэтому копия:
 * id, название и строка-описание. Тест сверяет её с реестром — добавил игру и забыл сюда значит красный тест.
 * best — как писать рекорд (как `menu` в реестре): false — не писать (у Wordle важна серия), функция — своя строка.
 */
// beta: true — игра ещё в бете у владельца (shell/beta.js): в инлайн-режиме её нет. Релиз снимает пометку.
export const GAMES = [
  { id: 'words', title: 'Слова из слова', emoji: '🔤', about: 'собери как можно больше слов из букв одного' },
  { id: 'flags', title: 'Флаги', emoji: '🏳️', about: 'угадай страну по флагу' },
  { id: 'checkers', title: 'Шашки', emoji: '⚫', about: 'русские шашки против бота, есть поддавки' },
  { id: 'flappy-burger', title: 'Flappy Burger', emoji: '🍔', about: 'пролети бургером между препятствиями' },
  { id: 'bubble-shooter', title: 'Шарики', emoji: '🫧', about: 'стреляй шариками, собирай по три одного цвета' },
  { id: 'snake', title: 'Змейка', emoji: '🐍', about: 'классика и уровни с препятствиями' },
  { id: 'brick-blast', title: 'Brick Blast', emoji: '🧱', about: 'разбей блоки очередью шариков' },
  { id: 'loop', title: 'Петля', emoji: '➰', about: 'поворачивай плитки, пока все линии не замкнутся' },
  { id: 'connect-dots', title: 'Соедини точки', emoji: '🔴', about: 'соедини пары точек и заполни всё поле', best: (n) => `рекорд: уровень ${n}` },
  { id: 'mahjong', title: 'Маджонг', emoji: '🀄', about: 'пасьянс: снимай одинаковые свободные плитки' },
  { id: '2048', title: '2048', emoji: '🔢', about: 'сдвигай плитки и собери 2048' },
  { id: 'boggle', title: 'Филворд', emoji: '🔠', about: 'найди спрятанные на поле слова' },
  { id: 'block-blast', title: 'Block Blast', emoji: '🟦', about: 'ставь фигуры, собирай линии' },
  { id: 'sudoku', title: 'Судоку', emoji: '🧩', about: 'классика 9×9, четыре сложности и подсказки' },
  { id: 'wordle', title: 'Wordle', emoji: '🟩', about: 'угадай слово из пяти букв: русский, украинский, английский', best: false },
  { id: 'memory', title: 'Мемори', emoji: '🃏', about: 'найди пары одинаковых карточек' },
  { id: 'bongo-cat', title: 'Bongo Cat', emoji: '🐱', about: 'кот играет на инструментах, разучи мелодию' },
];

const fold = (text) => String(text ?? '').toLowerCase().replace(/ё/g, 'е').trim();

/** Игры по запросу из инлайн-режима: совпадение с началом названия, любого его слова или id. */
/** Игры, которые видят все (без беты). */
export const publicGames = () => GAMES.filter((g) => !g.beta);

export function findGames(query) {
  const q = fold(query);
  const list = publicGames();
  if (!q) return list;
  const starts = (g) => fold(g.title).startsWith(q) || g.id.startsWith(q);
  const wordStarts = (g) => fold(g.title).split(/[\s-]+/).some((w) => w.startsWith(q));
  return [...list.filter(starts), ...list.filter((g) => !starts(g) && wordStarts(g))];
}

/** Ссылка, которая открывает главное мини-приложение бота; с param — сразу нужную игру. */
export function startAppLink(botUsername, param = '') {
  return `https://t.me/${botUsername}?startapp${param ? `=${encodeURIComponent(param)}` : ''}`;
}

/**
 * Строки «Судоку: сыграно 3, рекорд 450» из сохранённого прогресса (снимок хранилища игрока).
 * Порядок — как в списке игр; варианты игры (ключи вида `2048:4`) не перечисляются.
 */
export function progressLines(state) {
  const lines = [];
  const known = new Set(GAMES.map((g) => g.id));
  const describe = (id, title, best) => {
    const stats = state?.[`shell:stats:${id}`];
    const line = state?.[`shell:progress:${id}`];
    const parts = [];
    if (stats?.played) {
      const hasBest = best !== false && stats.best !== null && stats.best !== undefined;
      const bestText = hasBest ? `, ${typeof best === 'function' ? best(stats.best) : `рекорд ${stats.best}`}` : '';
      parts.push(`сыграно ${stats.played}${bestText}`);
    }
    if (typeof line === 'string' && line) parts.push(line);
    if (parts.length) lines.push(`${title}: ${parts.join(' · ')}`);
  };
  for (const g of GAMES) describe(g.id, g.title, g.best);
  // игры, которых нет в списке (например, удалённые), — под своим id, чтобы ничего не терялось
  for (const key of Object.keys(state ?? {})) {
    const m = key.match(/^shell:(?:stats|progress):([^:]+)$/);
    if (m && !known.has(m[1])) {
      known.add(m[1]);
      describe(m[1], m[1]);
    }
  }
  return lines;
}

// ---------- бета на сервере ----------

/**
 * Серверная часть функций, которые ещё в бете (id — как в shell/beta.js): пока id здесь, команда бота и запрос
 * сервера работают только для владельца (ADMIN_IDS). Релиз (tools/release.js) убирает выпущенные id из списка —
 * после этого нужно заново вставить worker.bundled.js в Cloudflare. Тест: каждый id есть в BETA.
 */
export const SERVER_BETA = [
  // >>> серверная бета
  'feedback',
  // <<< конец серверной беты
];

// ---------- обратная связь (/report) ----------

export const REPORT_MAX = 1000;        // символов в одном отзыве
export const REPORT_PER_HOUR = 5;      // отзывов в час от одного игрока — защита от спама

const escHtml = (text) => String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Сообщение владельцу об отзыве (HTML). Ник и id — владельцу можно (как в панели): по ним он отвечает через /message.
 */
export function reportMessage({ name, username, tgId, text, source }) {
  const who = `${escHtml(name || 'Без имени')}${username ? ` (@${escHtml(username)})` : ''}, id ${tgId}`;
  const reply = username ? `/message @${escHtml(username)} текст` : `/message ${tgId} текст`;
  return `📝 <b>Отзыв</b> ${source === 'app' ? 'из приложения' : 'в боте'}\n${who}\n\n${escHtml(text)}\n\n`
    + `<i>Ответить: ${reply}</i>`;
}

// ---------- особые скины (перки) ----------

/**
 * Особое, что владелец выдаёт отдельным игрокам из панели (решение владельца, 2026-09-26: фон с картинкой для одного
 * игрока). Кому что выдано — хранится на сервере (таблица user_perks), а не в коде: репозиторий публичный, id игроков
 * в нём быть не должно. Владелец (ADMIN_IDS) видит все перки и так. Список сверяется тестом с shell/perks.js.
 */
export const PERKS = {
  hedgehog: 'Фон «Ёжик в цветах» — судоку и Block Blast',
};

export const isPerk = (id) => Object.prototype.hasOwnProperty.call(PERKS, id);

// ---------- рейтинг (лидерборды) ----------

// Рейтинг считается из того же прогресса, что синхронизируется (снимок хранилища игрока), — игры для него
// ничего не шлют. У каждой игры своя мера успеха (как строка в меню): уровень, рекорд, победы…
// score(state) — число или null (в рейтинг не попадает), text(n) — как это написать.

/** Русское множественное: plural(3, ['очко', 'очка', 'очков']) → 'очка'. */
export function plural(n, [one, few, many]) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

const digits = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
const count = (forms) => (n) => `${digits(n)} ${plural(n, forms)}`;
const levelText = (n) => `уровень ${digits(n)}`;

/** Номер уровня из строки меню («Уровень 14», «Уровень 4 · Рекорд за уровень: 765»). */
export function levelOf(text) {
  const m = typeof text === 'string' ? text.match(/Уровень\s+(\d+)/i) : null;
  return m ? Number(m[1]) : null;
}

const shellStats = (id, field) => (state) => state?.[`shell:stats:${id}`]?.[field];
const menuLevel = (id) => (state) => levelOf(state?.[`shell:progress:${id}`]);
const gameStats = (id, field) => (state) => state?.[`game:${id}:stats`]?.[field];

/**
 * Филворд — все найденные слова (из списка и бонусные): кто-то играет на 5×5, кто-то на 8×8, и уровень у них
 * значит разное (решение владельца, 2026-09-26). Отдельного счётчика в игре нет, но он выводится: на каждом
 * пройденном уровне найдены все слова списка (их число зависит только от размера), бонусные — в статистике,
 * плюс слова начатого уровня. Размеры и число слов — копия WORDS_BY_SIZE из games/boggle/logic.js (тест сверяет).
 */
export const BOGGLE_WORDS_BY_SIZE = { 5: 5, 6: 7, 7: 9, 8: 12 };

export function boggleWords(state) {
  const stats = state?.['game:boggle:stats'];
  let total = 0;
  for (const [size, words] of Object.entries(BOGGLE_WORDS_BY_SIZE)) {
    const s = stats?.[size];
    if (!s) continue;
    const played = Number.isInteger(s.played) && s.played > 0 ? s.played : 0;
    const bonus = Number.isInteger(s.bonus) && s.bonus > 0 ? s.bonus : 0;
    total += played * words + bonus;
  }
  const current = state?.['game:boggle:current'];
  if (Array.isArray(current?.found)) total += current.found.length;
  if (Array.isArray(current?.bonus)) total += current.bonus.length;
  return total;
}

const POINTS = count(['очко', 'очка', 'очков']);
const WINS = count(['победа', 'победы', 'побед']);

export const BOARDS = {
  words: { by: 'уровень', score: menuLevel('words'), text: levelText },
  flags: { by: 'угадано флагов за всё время', score: gameStats('flags', 'correct'), text: count(['флаг', 'флага', 'флагов']) },
  checkers: { by: 'победы над ботом', score: shellStats('checkers', 'wins'), text: WINS },
  'flappy-burger': { by: 'рекорд', score: shellStats('flappy-burger', 'best'), text: POINTS },
  'bubble-shooter': { by: 'уровень', score: menuLevel('bubble-shooter'), text: levelText },
  snake: { by: 'рекорд в классике', score: shellStats('snake', 'best'), text: POINTS },
  'brick-blast': { by: 'уровень', score: menuLevel('brick-blast'), text: levelText },
  loop: { by: 'уровень', score: menuLevel('loop'), text: levelText },
  'connect-dots': { by: 'лучший уровень', score: shellStats('connect-dots', 'best'), text: levelText },
  mahjong: { by: 'разобранные раскладки', score: shellStats('mahjong', 'wins'), text: count(['раскладка', 'раскладки', 'раскладок']) },
  2048: { by: 'лучшая плитка', score: shellStats('2048', 'best'), text: (n) => `плитка ${n}` },
  boggle: { by: 'найденные слова, включая бонусные', score: boggleWords, text: count(['слово', 'слова', 'слов']) },
  'block-blast': { by: 'рекорд', score: shellStats('block-blast', 'best'), text: POINTS },
  sudoku: { by: 'решённые судоку', score: shellStats('sudoku', 'wins'), text: count(['судоку', 'судоку', 'судоку']) },
  wordle: { by: 'угаданные слова', score: shellStats('wordle', 'wins'), text: count(['слово', 'слова', 'слов']) },
  memory: { by: 'уровень', score: menuLevel('memory'), text: levelText },
  'bongo-cat': { by: 'ударов за всё время', score: gameStats('bongo-cat', 'hits'), text: count(['удар', 'удара', 'ударов']) },
};

const MAX_SCORE = 1e9;   // больше — явно испорченные данные

/** Очки игрока по всем играм рейтинга: { gameId: целое > 0 }. Пустое и мусор — пропускаются. */
export function boardScores(state) {
  const out = {};
  for (const [id, board] of Object.entries(BOARDS)) {
    let value;
    try {
      value = board.score(state);
    } catch {
      value = null;
    }
    if (Number.isInteger(value) && value > 0 && value <= MAX_SCORE) out[id] = value;
  }
  return out;
}

/**
 * Имя для рейтинга — только имя из Telegram (без фамилии, ника и id: требование владельца, 2026-09-26).
 * Длинное обрезается, пустое — «Игрок».
 */
export function boardName(firstName) {
  const name = String(firstName ?? '').replace(/\s+/g, ' ').trim();
  return [...name].slice(0, 24).join('') || 'Игрок';
}

// ---------- оформление сообщений (entities) ----------

/**
 * Разметка Telegram (жирный, цитата, сворачиваемая цитата, ссылки…) хранится отдельно от текста — сдвигами
 * в UTF-16 (как индексы строк JS). Когда бот вырезает начало сообщения («/broadcast », «/message @ник »),
 * сдвиги надо уменьшить на длину вырезанного и обрезать по длине оставшегося текста. Команда и ник
 * (что целиком до cut) выбрасываются; разметка, начавшаяся раньше cut, обрезается слева.
 */
export function shiftEntities(entities, cut, textLength) {
  if (!Array.isArray(entities)) return [];
  const out = [];
  for (const e of entities) {
    if (!e || typeof e.offset !== 'number' || typeof e.length !== 'number') continue;
    const start = Math.max(e.offset, cut) - cut;
    const end = Math.min(e.offset + e.length - cut, textLength);
    if (end <= start) continue;
    out.push({ ...e, offset: start, length: end - start });
  }
  return out;
}
