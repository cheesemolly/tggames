// СОБРАННЫЙ ФАЙЛ — не редактировать руками.
// Источники: server/worker.js и server/lib.js, пересборка: node server/tools/bundle.js
// Это то, что вставляется в редактор Cloudflare Worker.

// Общие части серверного обработчика: проверка подписи Telegram, разбор данных, лимиты.
// Здесь нет ничего, что есть только в Cloudflare Workers (используется Web Crypto, он есть и в node),
// поэтому этот файл целиком покрывается тестами `node --test`.

const MAX_STATE_BYTES = 400 * 1024;   // прогресс одного игрока; замер: 100 уровней «Слов» ≈ 64 КБ

// initData живёт сутки: Telegram кладёт в неё auth_date, и старую подпись мы не принимаем —
// чтобы перехваченная строка не работала вечно.
const INIT_DATA_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const enc = new TextEncoder();

async function hmac(keyBytes, message) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

const toHex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Сравнение за одинаковое время: по времени ответа нельзя подбирать подпись посимвольно. */
function timingSafeEqual(a, b) {
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
function dataCheckString(params) {
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
async function checkInitData(initData, botToken, { now = Date.now(), maxAgeMs = INIT_DATA_MAX_AGE_MS } = {}) {
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
async function diagnoseInitData(initData, botToken) {
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
function validateState(data) {
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
function parseAdminIds(value) {
  return String(value ?? '')
    .split(/[,\s]+/)
    .map((part) => Number(part))
    .filter((id) => Number.isFinite(id) && id > 0);
}

const isAdmin = (tgId, adminIds) => adminIds.includes(Number(tgId));

/** Имя игрока для списков: «Маша (@masha)» или просто имя. */
function displayName(user) {
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
const GAMES = [
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
const publicGames = () => GAMES.filter((g) => !g.beta);

function findGames(query) {
  const q = fold(query);
  const list = publicGames();
  if (!q) return list;
  const starts = (g) => fold(g.title).startsWith(q) || g.id.startsWith(q);
  const wordStarts = (g) => fold(g.title).split(/[\s-]+/).some((w) => w.startsWith(q));
  return [...list.filter(starts), ...list.filter((g) => !starts(g) && wordStarts(g))];
}

/** Ссылка, которая открывает главное мини-приложение бота; с param — сразу нужную игру. */
function startAppLink(botUsername, param = '') {
  return `https://t.me/${botUsername}?startapp${param ? `=${encodeURIComponent(param)}` : ''}`;
}

/**
 * Строки «Судоку: сыграно 3, рекорд 450» из сохранённого прогресса (снимок хранилища игрока).
 * Порядок — как в списке игр; варианты игры (ключи вида `2048:4`) не перечисляются.
 */
function progressLines(state) {
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
const SERVER_BETA = [
  // >>> серверная бета
  // <<< конец серверной беты
];

// ---------- приветствие (/start) ----------

/** Старое приветствие — у игроков, пока 'welcome' в серверной бете. */
const START_TEXT = 'Привет! Здесь набор небольших игр: слова, головоломки, аркады.\n'
  + 'Прогресс сохраняется за твоим аккаунтом Telegram — можно играть с любого устройства.';

/** Новое приветствие — подпись к гифке с геймплеем (media/welcome.mp4 на сайте). */
const WELCOME_TEXT = 'Привет! Это AnyGame — игры прямо в Telegram: слова, головоломки, аркады, шашки, '
  + 'викторина и музыка.\n\n'
  + '🏆 Рейтинг: занимай первые места и бей рекорды друзей.\n'
  + '☁️ Прогресс сохраняется за твоим аккаунтом Telegram — играй с любого устройства.';

/** Путь к гифке приветствия относительно адреса мини-приложения (APP_URL). */
const WELCOME_MEDIA = 'media/welcome.mp4';

// ---------- обратная связь (/report) ----------

const REPORT_MAX = 1000;        // символов в одном отзыве
const REPORT_PER_HOUR = 5;      // отзывов в час от одного игрока — защита от спама

const escHtml = (text) => String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Сообщение владельцу об отзыве (HTML). Ник и id — владельцу можно (как в панели): по ним он отвечает через /message.
 */
function reportMessage({ name, username, tgId, text, source }) {
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
const PERKS = {
  hedgehog: 'Фон «Ёжик в цветах» — судоку и Block Blast',
};

const isPerk = (id) => Object.prototype.hasOwnProperty.call(PERKS, id);

// ---------- рейтинг (лидерборды) ----------

// Рейтинг считается из того же прогресса, что синхронизируется (снимок хранилища игрока), — игры для него
// ничего не шлют. У каждой игры своя мера успеха (как строка в меню): уровень, рекорд, победы…
// score(state) — число или null (в рейтинг не попадает), text(n) — как это написать.

/** Русское множественное: plural(3, ['очко', 'очка', 'очков']) → 'очка'. */
function plural(n, [one, few, many]) {
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
function levelOf(text) {
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
const BOGGLE_WORDS_BY_SIZE = { 5: 5, 6: 7, 7: 9, 8: 12 };

function boggleWords(state) {
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

const BOARDS = {
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
function boardScores(state) {
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
function boardName(firstName) {
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
function shiftEntities(entities, cut, textLength) {
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

// Обработчик Cloudflare Worker: вход через Telegram, прогресс игроков, панель владельца и сам бот.
// База — Cloudflare D1 (привязка `DB`, схема в schema.sql). Как это выкладывается — в README.md.
//
// Переменные окружения (задаются в настройках воркера, не в коде):
//   BOT_TOKEN       — токен бота от BotFather (секрет);
//   ADMIN_IDS       — Telegram-id владельцев панели через запятую;
//   WEBHOOK_SECRET  — произвольная строка, ею Telegram подписывает вебхук (секрет);
//   APP_URL         — адрес мини-приложения (по умолчанию наш GitHub Pages).
//
// Запросы игры (везде заголовок `Authorization: tma <initData>`):
//   GET  /me                      -> { id, tgId, name, username, isAdmin, banned, perks }
//   GET  /state                   -> { data, updatedAt }
//   PUT  /state  { data, base }   -> { updatedAt }  |  409 с чужим свежим прогрессом
// Рейтинг (в ответах только имя игрока и случайный pid — ни id, ни ника, ни tg_id):
//   GET  /top                     -> { games: [{ game, by, total, leader, me }], mePid } — сводка по всем играм
//   GET  /top/<игра>              -> { game, by, total, rows: [{ place, name, text, pid, me }], me }
//   GET  /top/player/<pid>        -> { name, me, games: [{ game, text, place, total }] } — профиль игрока
// Панель (только для ADMIN_IDS):
//   GET    /admin/players?q=&limit=&offset=
//   GET    /admin/player/<id>
//   PUT    /admin/player/<id>/state  { data }
//   POST   /admin/player/<id>/ban    { banned }
//   POST   /admin/player/<id>/perk   { perk, on } — выдать / забрать особый скин (PERKS в lib.js)
// Обратная связь: POST /report { text } (из приложения) и /report текст в боте — отзыв приходит владельцам.
//   DELETE /admin/player/<id>
//   POST   /admin/broadcast          { text }
// Бот: POST /bot — вебхук Telegram, проверяется заголовком X-Telegram-Bot-Api-Secret-Token.
//   /start, /me — всем; /broadcast и /message @ник — владельцу, через черновик: бот показывает, как
//   сообщение увидят игроки, и отправляет только по кнопке «Разослать/Отправить» (можно с фото и альбомом).
//   Инлайн-режим (включается в @BotFather: /setinline): в любом чате «@бот» — приглашение в игры,
//   «@бот судоку» — конкретная игра, «@бот рекорды» — свой прогресс. Кнопка под сообщением — ссылка
//   t.me/<бот>?startapp=<id игры>: она открывает главное мини-приложение сразу на этой игре.


// Кто может обращаться к обработчику. Свой домен — чтобы чужой сайт не ходил в него от имени игрока.
const ALLOWED_ORIGINS = [
  'https://cheesemolly.github.io',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
];

const DEFAULT_APP_URL = 'https://cheesemolly.github.io/tggames/';
const BROADCAST_LIMIT = 2000;          // предохранитель: больше за один раз не рассылаем
const ALBUM_WAIT_MS = 1500;            // картинки альбома приходят по одной: ждём, пока придут все
const CAPTION_LIMIT = 1024;            // подпись к фото в Telegram
const TEXT_LIMIT = 4096;               // обычное сообщение

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

const json = (body, status, origin) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(origin) },
});

const fail = (error, status, origin) => json({ error }, status, origin);

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') ?? '';
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    try {
      if (path === '/bot' && request.method === 'POST') return await botWebhook(request, env, ctx);
      if (path === '/') return json({ ok: true, service: 'tggames' }, 200, origin);
      // Диагностика: какому боту принадлежит токен в настройках. Сам токен не раскрывается —
      // видно только имя бота. Нужна, когда мини-апп открыт одним ботом, а токен лежит от другого.
      if (path === '/whoami') return await whoami(env, origin);
      // Диагностика входа: почему не сошлась подпись. Данные игрока наружу не отдаёт.
      if (path === '/debug/initdata') {
        const header = request.headers.get('Authorization') ?? '';
        const initData = header.startsWith('tma ') ? header.slice(4).trim() : '';
        return json(await diagnoseInitData(initData, env.BOT_TOKEN), 200, origin);
      }

      // Всё остальное — только для игрока, подтверждённого подписью Telegram.
      const auth = await authorize(request, env);
      if (!auth.ok) return fail(auth.error, auth.error === 'banned' ? 403 : 401, origin);
      const { player, admin, user } = auth;

      if (path === '/me' && request.method === 'GET') {
        return json({
          id: player.id, tgId: player.tg_id, name: player.name, username: player.username,
          isAdmin: admin, banned: Boolean(player.banned),
          // владелец видит все особые скины и так; остальным — выданные в панели
          perks: admin ? Object.keys(PERKS) : await perksOf(env, player.id),
        }, 200, origin);
      }
      if (path === '/state' && request.method === 'GET') return await getState(env, player, origin);
      if (path === '/state' && request.method === 'PUT') return await putState(request, env, player, user, origin);
      if (path === '/top' || path.startsWith('/top/')) return await topRoutes(env, path, player, admin, origin);
      if (path === '/report' && request.method === 'POST') {
        if (!betaOpen('feedback', admin)) return fail('not_found', 404, origin);
        const { text } = await body(request);
        const res = await submitReport(env, { player, user, text, source: 'app' });
        return res.ok ? json({ ok: true }, 200, origin) : fail(res.error, res.error === 'too_many' ? 429 : 400, origin);
      }

      if (path.startsWith('/admin/')) {
        if (!admin) return fail('forbidden', 403, origin);
        return await adminRoutes(request, env, path, url, origin);
      }

      return fail('not_found', 404, origin);
    } catch (err) {
      console.error(err);
      return fail('server', 500, origin);
    }
  },
};

async function body(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

// ---------- вход ----------

/** Проверяет подпись Telegram, заводит игрока при первом заходе и обновляет имя. */
async function authorize(request, env) {
  const header = request.headers.get('Authorization') ?? '';
  const initData = header.startsWith('tma ') ? header.slice(4).trim() : '';
  const checked = await checkInitData(initData, env.BOT_TOKEN);
  if (!checked.ok) return { ok: false, error: checked.error };

  const now = Date.now();
  const { user } = checked;
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || 'Игрок';

  let player = await env.DB.prepare('SELECT * FROM users WHERE tg_id = ?').bind(user.id).first();
  if (!player) {
    player = await env.DB.prepare(
      `INSERT INTO users (tg_id, name, username, created_at, last_seen_at, banned)
       VALUES (?, ?, ?, ?, ?, 0) RETURNING *`,
    ).bind(user.id, name, user.username ?? null, now, now).first();
    // Пустую запись прогресса не заводим: иначе первое же сохранение новичка (он шлёт base = 0)
    // упиралось бы в «конфликт» и лишний раз ходило на сервер.
  } else {
    await env.DB.prepare('UPDATE users SET name = ?, username = ?, last_seen_at = ? WHERE id = ?')
      .bind(name, user.username ?? null, now, player.id).run();
    player = { ...player, name, username: user.username ?? null, last_seen_at: now };
  }

  const admin = isAdmin(user.id, parseAdminIds(env.ADMIN_IDS));
  if (player.banned && !admin) return { ok: false, error: 'banned' };
  return { ok: true, player, admin, user };
}

// ---------- прогресс ----------

async function getState(env, player, origin) {
  const row = await env.DB.prepare('SELECT data, updated_at FROM states WHERE user_id = ?').bind(player.id).first();
  return json({ data: row?.data ?? '{}', updatedAt: row?.updated_at ?? 0 }, 200, origin);
}

async function putState(request, env, player, user, origin) {
  const { data, base } = await body(request);
  const bad = validateState(data);
  if (bad) return fail(bad, 400, origin);

  const row = await env.DB.prepare('SELECT data, updated_at FROM states WHERE user_id = ?').bind(player.id).first();
  const stored = row?.updated_at ?? 0;
  // На другом устройстве уже сохраняли новее — не затираем, отдаём тот прогресс клиенту.
  if (typeof base === 'number' && stored > base) {
    return json({ conflict: true, data: row.data, updatedAt: stored }, 409, origin);
  }

  const stamp = Math.max(Date.now(), stored + 1);
  await saveState(env, player.id, data, stamp);
  await indexBoard(env, player.id, JSON.parse(data), user?.first_name);
  return json({ updatedAt: stamp }, 200, origin);
}

function saveState(env, userId, data, stamp) {
  return env.DB.prepare(
    `INSERT INTO states (user_id, data, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
  ).bind(userId, data, stamp).run();
}

// ---------- рейтинг ----------

// Таблицы рейтинга обработчик заводит сам (как черновики бота) — вручную в D1 ничего выполнять не нужно.
// board_players: у игрока случайный pid (по нему открывают профиль) и имя для рейтинга — только имя из
// Telegram, без фамилии и ника. board_scores: очки по играм (boardScores в lib.js), updated_at — когда
// достигнуто: при равных очках выше тот, кто успел раньше.
const boardReady = new WeakSet();

async function ensureBoardTables(env) {
  if (boardReady.has(env.DB)) return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS board_players (
    user_id INTEGER PRIMARY KEY, pid TEXT NOT NULL UNIQUE, name TEXT NOT NULL)`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS board_scores (
    user_id INTEGER NOT NULL, game_id TEXT NOT NULL, value INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, game_id))`).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS board_scores_game ON board_scores(game_id, value DESC)').run();
  boardReady.add(env.DB);
}

function randomPid() {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return [...bytes].map((b) => (b % 36).toString(36)).join('');
}

/**
 * Пересчитывает очки игрока из его прогресса. Пишет только то, что изменилось: сохранение идёт каждые
 * несколько секунд игры, а запись в D1 ограничена. firstName — из подписи Telegram (только при своём заходе).
 */
async function indexBoard(env, userId, state, firstName = null) {
  await ensureBoardTables(env);
  const known = await env.DB.prepare('SELECT pid, name FROM board_players WHERE user_id = ?').bind(userId).first();
  if (!known) {
    let name = firstName;
    if (name == null) {
      // до рейтинга имя хранилось вместе с фамилией: берём первое слово
      const row = await env.DB.prepare('SELECT name FROM users WHERE id = ?').bind(userId).first();
      name = String(row?.name ?? '').trim().split(/\s+/)[0];
    }
    await env.DB.prepare('INSERT OR IGNORE INTO board_players (user_id, pid, name) VALUES (?, ?, ?)')
      .bind(userId, randomPid(), boardName(name)).run();
  } else if (firstName != null && boardName(firstName) !== known.name) {
    await env.DB.prepare('UPDATE board_players SET name = ? WHERE user_id = ?').bind(boardName(firstName), userId).run();
  }

  const scores = boardScores(state);
  const old = await env.DB.prepare('SELECT game_id, value FROM board_scores WHERE user_id = ?').bind(userId).all();
  const before = Object.fromEntries((old.results ?? []).map((r) => [r.game_id, r.value]));
  const now = Date.now();
  for (const [game, value] of Object.entries(scores)) {
    if (before[game] === value) continue;
    await env.DB.prepare(
      `INSERT INTO board_scores (user_id, game_id, value, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, game_id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    ).bind(userId, game, value, now).run();
  }
  for (const game of Object.keys(before)) {
    if (!(game in scores)) await env.DB.prepare('DELETE FROM board_scores WHERE user_id = ? AND game_id = ?').bind(userId, game).run();
  }
}

/** Прогресс, сохранённый до появления рейтинга, досчитывается понемногу — при просмотре рейтинга. */
async function backfillBoard(env, limit = 8) {
  const rows = await env.DB.prepare(
    `SELECT s.user_id, s.data FROM states s LEFT JOIN board_players b ON b.user_id = s.user_id
     WHERE b.user_id IS NULL LIMIT ?`,
  ).bind(limit).all();
  for (const row of rows.results ?? []) {
    let state = {};
    try {
      state = JSON.parse(row.data);
    } catch {
      // битый прогресс — в рейтинг просто ничего не попадёт
    }
    await indexBoard(env, row.user_id, state);
  }
}

// Места: по очкам, при равенстве — кто раньше. Заблокированных в рейтинге нет.
const RANKED = `SELECT b.user_id, b.game_id, b.value,
    ROW_NUMBER() OVER (PARTITION BY b.game_id ORDER BY b.value DESC, b.updated_at ASC, b.user_id ASC) AS place,
    COUNT(*) OVER (PARTITION BY b.game_id) AS total
  FROM board_scores b JOIN users u ON u.id = b.user_id WHERE u.banned = 0`;

const TOP_LIMIT = 50;

async function topRoutes(env, path, player, admin, origin) {
  await ensureBoardTables(env);
  await backfillBoard(env);
  // игры в бете в рейтинге видит только владелец
  const games = new Set(GAMES.filter((g) => BOARDS[g.id] && (admin || !g.beta)).map((g) => g.id));
  const text = (game, value) => BOARDS[game].text(value);

  if (path === '/top') {
    const rows = await env.DB.prepare(
      `SELECT r.game_id, r.value, r.place, r.total, r.user_id, p.name
       FROM (${RANKED}) r JOIN board_players p ON p.user_id = r.user_id
       WHERE r.place = 1 OR r.user_id = ?`,
    ).bind(player.id).all();
    const byGame = {};
    for (const r of rows.results ?? []) {
      if (!games.has(r.game_id)) continue;
      const item = byGame[r.game_id] ??= { game: r.game_id, by: BOARDS[r.game_id].by, total: r.total, leader: null, me: null };
      if (r.place === 1) item.leader = { name: r.name, text: text(r.game_id, r.value), me: r.user_id === player.id };
      if (r.user_id === player.id) item.me = { place: r.place, text: text(r.game_id, r.value) };
    }
    const list = GAMES.filter((g) => games.has(g.id))
      .map((g) => byGame[g.id] ?? { game: g.id, by: BOARDS[g.id].by, total: 0, leader: null, me: null });
    const mine = await env.DB.prepare('SELECT pid FROM board_players WHERE user_id = ?').bind(player.id).first();
    return json({ games: list, mePid: mine?.pid ?? null }, 200, origin);
  }

  const profile = path.match(/^\/top\/player\/([a-z0-9]{1,32})$/);
  if (profile) {
    const who = await env.DB.prepare('SELECT user_id, name FROM board_players WHERE pid = ?').bind(profile[1]).first();
    if (!who) return fail('no_player', 404, origin);
    const banned = await env.DB.prepare('SELECT banned FROM users WHERE id = ?').bind(who.user_id).first();
    if (!banned || banned.banned) return fail('no_player', 404, origin);
    const rows = await env.DB.prepare(`SELECT game_id, value, place, total FROM (${RANKED}) WHERE user_id = ?`)
      .bind(who.user_id).all();
    const found = Object.fromEntries((rows.results ?? []).map((r) => [r.game_id, r]));
    return json({
      name: who.name,
      me: who.user_id === player.id,
      games: GAMES.filter((g) => games.has(g.id) && found[g.id]).map((g) => ({
        game: g.id, text: text(g.id, found[g.id].value), place: found[g.id].place, total: found[g.id].total,
      })),
    }, 200, origin);
  }

  const one = path.match(/^\/top\/([a-z0-9-]{1,40})$/);
  if (!one || !games.has(one[1])) return fail('not_found', 404, origin);
  const game = one[1];
  const rows = await env.DB.prepare(
    `SELECT r.value, r.place, r.total, r.user_id, p.name, p.pid
     FROM (${RANKED}) r JOIN board_players p ON p.user_id = r.user_id
     WHERE r.game_id = ? AND (r.place <= ? OR r.user_id = ?) ORDER BY r.place`,
  ).bind(game, TOP_LIMIT, player.id).all();
  const list = rows.results ?? [];
  const mine = list.find((r) => r.user_id === player.id);
  return json({
    game,
    by: BOARDS[game].by,
    total: list[0]?.total ?? 0,
    rows: list.filter((r) => r.place <= TOP_LIMIT).map((r) => ({
      place: r.place, name: r.name, text: text(game, r.value), pid: r.pid, me: r.user_id === player.id,
    })),
    me: mine ? { place: mine.place, name: mine.name, text: text(game, mine.value), pid: mine.pid } : null,
  }, 200, origin);
}

// ---------- бета на сервере и обратная связь ----------

/** Функция из серверной беты (SERVER_BETA) доступна только владельцу; после релиза — всем. */
const betaOpen = (id, admin) => admin || !SERVER_BETA.includes(id);

const reportsReady = new WeakSet();

async function ensureReports(env) {
  if (reportsReady.has(env.DB)) return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT, tg_id INTEGER NOT NULL, user_id INTEGER, name TEXT, username TEXT,
    text TEXT NOT NULL, source TEXT NOT NULL, created_at INTEGER NOT NULL)`).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS reports_tg ON reports(tg_id, created_at)').run();
  reportsReady.add(env.DB);
}

/**
 * Отзыв игрока: проверка длины и частоты, запись в reports и сообщение каждому владельцу (ADMIN_IDS).
 * copy — { chat, id }: сообщение с картинкой из бота, его бот копирует владельцу следом за текстом.
 */
async function submitReport(env, { player, user, text, source, copy = null }) {
  const clean = String(text ?? '').trim();
  if (!clean) return { ok: false, error: 'empty_text' };
  if (clean.length > REPORT_MAX) return { ok: false, error: 'too_long' };
  await ensureReports(env);
  const now = Date.now();
  const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM reports WHERE tg_id = ? AND created_at > ?')
    .bind(user.id, now - 60 * 60 * 1000).first();
  if ((recent?.n ?? 0) >= REPORT_PER_HOUR) return { ok: false, error: 'too_many' };
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
  await env.DB.prepare(
    'INSERT INTO reports (tg_id, user_id, name, username, text, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).bind(user.id, player?.id ?? null, name, user.username ?? null, clean, source, now).run();
  const note = reportMessage({ name, username: user.username, tgId: user.id, text: clean, source });
  for (const adminId of parseAdminIds(env.ADMIN_IDS)) {
    await api(env, 'sendMessage', { chat_id: adminId, text: note, parse_mode: 'HTML' });
    if (copy) await api(env, 'copyMessage', { chat_id: adminId, from_chat_id: copy.chat, message_id: copy.id });
  }
  return { ok: true };
}

// ---------- приветствие с гифкой (/start) ----------

const botFilesReady = new WeakSet();

/** Файлы, которые бот уже отправлял: адрес → file_id Telegram (повторно с сайта не скачивается). */
async function ensureBotFiles(env) {
  if (botFilesReady.has(env.DB)) return;
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS bot_files (url TEXT PRIMARY KEY, file_id TEXT NOT NULL)').run();
  botFilesReady.add(env.DB);
}

/**
 * Гифка с геймплеем + приветствие + «Играть». Первый раз Telegram сам скачивает файл с сайта (APP_URL),
 * его file_id запоминается. Не вышло (файла нет, сайт недоступен) — просто текст: приветствие не теряется.
 */
async function sendWelcome(env, chatId) {
  const url = new URL(WELCOME_MEDIA, appUrl(env)).href;
  await ensureBotFiles(env);
  const known = await env.DB.prepare('SELECT file_id FROM bot_files WHERE url = ?').bind(url).first();
  const res = await api(env, 'sendAnimation', {
    chat_id: chatId, animation: known?.file_id ?? url, caption: WELCOME_TEXT, reply_markup: playButton(env),
  });
  const data = await res.json().catch(() => null);
  if (data?.ok) {
    const id = data.result?.animation?.file_id ?? data.result?.document?.file_id;
    if (id && id !== known?.file_id) {
      await env.DB.prepare('INSERT INTO bot_files (url, file_id) VALUES (?, ?) '
        + 'ON CONFLICT(url) DO UPDATE SET file_id = excluded.file_id').bind(url, id).run();
    }
    return;
  }
  if (known) await env.DB.prepare('DELETE FROM bot_files WHERE url = ?').bind(url).run();
  await api(env, 'sendMessage', { chat_id: chatId, text: WELCOME_TEXT, reply_markup: playButton(env) });
}

// ---------- особые скины (перки) ----------

const perksReady = new WeakSet();

async function ensurePerks(env) {
  if (perksReady.has(env.DB)) return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS user_perks (
    user_id INTEGER NOT NULL, perk TEXT NOT NULL, PRIMARY KEY (user_id, perk))`).run();
  perksReady.add(env.DB);
}

async function perksOf(env, userId) {
  await ensurePerks(env);
  const rows = await env.DB.prepare('SELECT perk FROM user_perks WHERE user_id = ?').bind(userId).all();
  return (rows.results ?? []).map((r) => r.perk).filter(isPerk);
}

// ---------- панель владельца ----------

async function adminRoutes(request, env, path, url, origin) {
  if (path === '/admin/players' && request.method === 'GET') {
    const q = (url.searchParams.get('q') ?? '').trim();
    const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 200);
    const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);
    const like = `%${q}%`;
    const rows = q
      ? await env.DB.prepare(
        `SELECT u.*, s.updated_at AS state_at FROM users u LEFT JOIN states s ON s.user_id = u.id
           WHERE u.name LIKE ? OR IFNULL(u.username, '') LIKE ? OR CAST(u.tg_id AS TEXT) LIKE ?
           ORDER BY u.last_seen_at DESC LIMIT ? OFFSET ?`,
      ).bind(like, like, like, limit, offset).all()
      : await env.DB.prepare(
        `SELECT u.*, s.updated_at AS state_at FROM users u LEFT JOIN states s ON s.user_id = u.id
           ORDER BY u.last_seen_at DESC LIMIT ? OFFSET ?`,
      ).bind(limit, offset).all();
    const total = await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first();
    return json({ players: (rows.results ?? []).map(playerRow), total: total?.n ?? 0 }, 200, origin);
  }

  if (path === '/admin/broadcast' && request.method === 'POST') {
    const { text } = await body(request);
    if (typeof text !== 'string' || !text.trim()) return fail('empty_text', 400, origin);
    return json(await broadcast(env, text.trim()), 200, origin);
  }

  const match = path.match(/^\/admin\/player\/(\d+)(\/state|\/ban|\/perk)?$/);
  if (!match) return fail('not_found', 404, origin);
  const id = Number(match[1]);
  const action = match[2] ?? '';

  const player = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
  if (!player) return fail('no_player', 404, origin);

  if (!action && request.method === 'GET') {
    const row = await env.DB.prepare('SELECT data, updated_at FROM states WHERE user_id = ?').bind(id).first();
    return json({
      player: playerRow(player), data: row?.data ?? '{}', updatedAt: row?.updated_at ?? 0,
      perks: await perksOf(env, id), allPerks: PERKS,
    }, 200, origin);
  }

  if (action === '/state' && request.method === 'PUT') {
    const { data } = await body(request);
    const bad = validateState(data);
    if (bad) return fail(bad, 400, origin);
    // Отметка заведомо новее всего, что есть у игрока: его устройство при следующем обмене
    // получит конфликт и применит правку, а не затрёт её своим старым прогрессом.
    const stamp = Date.now() + 1000;
    await saveState(env, id, data, stamp);
    await indexBoard(env, id, JSON.parse(data));
    return json({ ok: true, updatedAt: stamp }, 200, origin);
  }

  if (action === '/perk' && request.method === 'POST') {
    const { perk, on } = await body(request);
    if (!isPerk(perk)) return fail('bad_perk', 400, origin);
    await ensurePerks(env);
    if (on) await env.DB.prepare('INSERT OR IGNORE INTO user_perks (user_id, perk) VALUES (?, ?)').bind(id, perk).run();
    else await env.DB.prepare('DELETE FROM user_perks WHERE user_id = ? AND perk = ?').bind(id, perk).run();
    return json({ ok: true, perks: await perksOf(env, id) }, 200, origin);
  }

  if (action === '/ban' && request.method === 'POST') {
    const { banned } = await body(request);
    await env.DB.prepare('UPDATE users SET banned = ? WHERE id = ?').bind(banned ? 1 : 0, id).run();
    return json({ ok: true, banned: Boolean(banned) }, 200, origin);
  }

  if (!action && request.method === 'DELETE') {
    await ensurePerks(env);
    await env.DB.prepare('DELETE FROM user_perks WHERE user_id = ?').bind(id).run();
    await ensureBoardTables(env);
    await env.DB.prepare('DELETE FROM board_scores WHERE user_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM board_players WHERE user_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM states WHERE user_id = ?').bind(id).run();
    // отзывы тоже: политика конфиденциальности (privacy.html) обещает удалить всё, что связано с игроком
    await ensureReports(env);
    await env.DB.prepare('DELETE FROM reports WHERE tg_id = ?').bind(player.tg_id).run();
    await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
    return json({ ok: true }, 200, origin);
  }

  return fail('not_found', 404, origin);
}

const playerRow = (p) => ({
  id: p.id,
  tgId: p.tg_id,
  name: p.name,
  username: p.username,
  createdAt: p.created_at,
  lastSeenAt: p.last_seen_at,
  banned: Boolean(p.banned),
  stateAt: p.state_at ?? null,
});

/** Спрашивает у Telegram, чей это токен: сверить с тем ботом, который открывает мини-апп. */
async function whoami(env, origin) {
  if (!env.BOT_TOKEN) return json({ ok: false, error: 'no_bot_token' }, 200, origin);
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/getMe`);
    const data = await res.json();
    if (!data.ok) return json({ ok: false, error: data.description ?? 'bad_token' }, 200, origin);
    return json({
      ok: true,
      bot: data.result.username ? `@${data.result.username}` : data.result.first_name,
      tokenLength: env.BOT_TOKEN.length,
      tokenTrimmed: env.BOT_TOKEN === env.BOT_TOKEN.trim(),   // лишние пробелы при вставке ломают подпись
      admins: parseAdminIds(env.ADMIN_IDS).length,
    }, 200, origin);
  } catch {
    return json({ ok: false, error: 'telegram_unreachable' }, 200, origin);
  }
}

// ---------- бот ----------

function api(env, method, payload) {
  return fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

const appUrl = (env) => env.APP_URL || DEFAULT_APP_URL;

const playButton = (env) => ({
  inline_keyboard: [[{ text: '🎮 Играть', web_app: { url: appUrl(env) } }]],
});

async function botWebhook(request, env, ctx) {
  // Telegram шлёт этот заголовок, если вебхук поставлен с secret_token. Так чужой запрос не пройдёт.
  if (env.WEBHOOK_SECRET && request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.WEBHOOK_SECRET) {
    return new Response('forbidden', { status: 403 });
  }
  const update = await body(request);
  if (update.inline_query) {
    await onInline(update.inline_query, env);
    return new Response('ok');
  }
  if (update.callback_query) {
    await onButton(update.callback_query, env, ctx);
    return new Response('ok');
  }
  const message = update.message ?? update.edited_message;
  const chatId = message?.chat?.id;
  const tgId = message?.from?.id;
  const raw = message?.text ?? message?.caption ?? '';
  const text = raw.trim();
  const media = mediaOf(message);
  if (!chatId || (!text && !media.length)) return new Response('ok');

  const command = text.startsWith('/') ? text.split(/\s+/)[0].split('@')[0].toLowerCase() : '';
  const rest = command ? text.slice(text.split(/\s+/)[0].length).trim() : text;
  // где в исходном сообщении начинается rest — от этого места сдвигается разметка (цитаты, жирный…)
  const lead = raw.length - raw.trimStart().length;
  const afterCmd = command ? text.slice(text.split(/\s+/)[0].length) : text;
  const restAt = lead + (text.length - afterCmd.length) + (afterCmd.length - afterCmd.trimStart().length);
  const entities = message?.entities ?? message?.caption_entities ?? [];
  const admin = isAdmin(tgId, parseAdminIds(env.ADMIN_IDS));

  if (command === '/start') {
    if (betaOpen('welcome', admin)) await sendWelcome(env, chatId);
    else await api(env, 'sendMessage', { chat_id: chatId, text: START_TEXT, reply_markup: playButton(env) });
    return new Response('ok');
  }

  if (command === '/report' && betaOpen('feedback', admin)) {
    if (!rest && !media.length) {
      await api(env, 'sendMessage', { chat_id: chatId, text: 'Напиши после команды, что хочешь сказать. Например:\n/report добавьте бильярд' });
      return new Response('ok');
    }
    const player = await env.DB.prepare('SELECT * FROM users WHERE tg_id = ?').bind(tgId).first();
    const res = await submitReport(env, {
      player, user: message.from, text: rest || '(без текста, только картинка)', source: 'bot',
      copy: media.length ? { chat: chatId, id: message.message_id } : null,
    });
    await api(env, 'sendMessage', {
      chat_id: chatId,
      text: res.ok ? 'Спасибо! Передал разработчику 🙌'
        : res.error === 'too_many' ? 'Слишком много отзывов за час — попробуй чуть позже.'
          : 'Отзыв слишком длинный — уложись в 1000 символов.',
    });
    return new Response('ok');
  }

  if (command === '/me') {
    await api(env, 'sendMessage', { chat_id: chatId, text: await meText(env, tgId), parse_mode: 'HTML' });
    return new Response('ok');
  }

  if (command === '/unsend') {
    if (!admin) {
      await api(env, 'sendMessage', { chat_id: chatId, text: 'Эта команда только для владельца.' });
      return new Response('ok');
    }
    await listSent(env, chatId, tgId);
    return new Response('ok');
  }

  if (command === '/broadcast' || command === '/silentbroadcast' || command === '/message') {
    if (!admin) {
      await api(env, 'sendMessage', { chat_id: chatId, text: 'Эта команда только для владельца.' });
      return new Response('ok');
    }
    await collectDraft(env, ctx, message, { command, rest, media, entities, restAt });
    return new Response('ok');
  }

  // картинки альбома без подписи — часть черновика владельца (подпись с командой у одной из них)
  if (admin && media.length && message.media_group_id) {
    await collectDraft(env, ctx, message, { command: '', rest: '', media, entities: [], restAt: 0 });
    return new Response('ok');
  }

  await api(env, 'sendMessage', {
    chat_id: chatId,
    text: admin ? ADMIN_HELP : `Команды: /start — открыть игры, /me — мой прогресс${betaOpen('feedback', false) ? ',\n/report текст — написать разработчику (идея, ошибка, пожелание)' : ''}.`,
    reply_markup: playButton(env),
  });
  return new Response('ok');
}

const ADMIN_HELP = 'Команды: /start — открыть игры, /me — мой прогресс, /report текст — отзыв.\n\n'
  + 'Для владельца:\n'
  + '/broadcast текст — всем игрокам;\n'
  + '/silentbroadcast текст — всем, но без звука уведомления;\n'
  + '/unsend — удалить у всех недавнюю рассылку или сообщение (Telegram даёт 48 часов);\n'
  + '/message @ник текст — одному игроку (можно id вместо ника).\n'
  + 'Можно с фото или альбомом: прикрепи картинки и напиши команду в подписи. '
  + 'Сначала бот покажет, как это увидят, и отправит только по кнопке.';

// ---------- черновики рассылки и личных сообщений ----------
// Картинки альбома Telegram присылает отдельными сообщениями, подпись — только у одной. Поэтому каждая
// часть пишется в черновик (картинки — отдельными строками, без гонок при одновременной записи), а
// предпросмотр показывает тот запрос, после которого за ALBUM_WAIT_MS ничего нового не пришло.

/** Картинки/видео сообщения: [{ type, id }] (у фото берём самый большой размер). */
function mediaOf(message) {
  if (message?.photo?.length) return [{ type: 'photo', id: message.photo[message.photo.length - 1].file_id }];
  if (message?.video) return [{ type: 'video', id: message.video.file_id }];
  return [];
}

async function ensureDraftTables(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS drafts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, admin_id INTEGER NOT NULL, chat_id INTEGER NOT NULL,
    group_key TEXT NOT NULL, kind TEXT, target INTEGER, target_name TEXT, text TEXT,
    stamp TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'new', created_at INTEGER NOT NULL,
    UNIQUE (admin_id, group_key))`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS draft_media (
    admin_id INTEGER NOT NULL, group_key TEXT NOT NULL, message_id INTEGER NOT NULL,
    type TEXT NOT NULL, file_id TEXT NOT NULL, PRIMARY KEY (admin_id, group_key, message_id))`).run();
  // оформление текста (JSON entities) и «без звука» — столбцы добавлены позже: у старой таблицы их может не быть
  for (const column of ['entities TEXT', 'silent INTEGER']) {
    try {
      await env.DB.prepare(`ALTER TABLE drafts ADD COLUMN ${column}`).run();
    } catch {
      // уже есть
    }
  }
  // кому и какие сообщения ушли (номера нужны, чтобы потом удалить — /unsend) и у кого уже удалено
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS sent_messages (
    draft_id INTEGER NOT NULL, chat_id INTEGER NOT NULL, message_ids TEXT NOT NULL, PRIMARY KEY (draft_id, chat_id))`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS unsend_done (
    draft_id INTEGER NOT NULL, chat_id INTEGER NOT NULL, PRIMARY KEY (draft_id, chat_id))`).run();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function collectDraft(env, ctx, message, { command, rest, media, entities = [], restAt = 0 }) {
  await ensureDraftTables(env);
  const adminId = message.from.id;
  const chatId = message.chat.id;
  const key = message.media_group_id ? `g${message.media_group_id}` : `m${message.message_id}`;

  // что написано в команде
  let kind = null;
  let target = null;
  let targetName = null;
  let text = null;
  let textAt = restAt;                     // где текст рассылки начинается в исходном сообщении
  let silent = null;                       // null — часть альбома без подписи: берётся у части с командой
  if (command === '/broadcast' || command === '/silentbroadcast') {
    kind = 'broadcast';
    text = rest;
    silent = command === '/silentbroadcast' ? 1 : 0;
  } else if (command === '/message') {
    const [who, ...words] = rest.split(/\s+/);
    const player = who ? await findPlayer(env, who) : null;
    if (!player) {
      await api(env, 'sendMessage', {
        chat_id: chatId,
        text: who
          ? `Игрок ${who} не найден — он ещё не открывал игры или сменил ник.`
          : 'Напиши так: /message @ник текст (можно id вместо ника).',
      });
      return;
    }
    kind = 'message';
    target = player.tg_id;
    targetName = player.username ? `@${player.username}` : player.name;
    const tail = rest.slice(who.length);
    text = tail.trim();
    textAt = restAt + who.length + (tail.length - tail.trimStart().length);
    void words;
  }
  // оформление (сворачиваемые цитаты, жирный, ссылки) — сдвигается на вырезанную команду и ник
  const format = text ? shiftEntities(entities, textAt, text.length) : [];

  const stamp = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO drafts (admin_id, chat_id, group_key, kind, target, target_name, text, entities, silent, stamp, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (admin_id, group_key) DO UPDATE SET
        kind = COALESCE(excluded.kind, drafts.kind), target = COALESCE(excluded.target, drafts.target),
        target_name = COALESCE(excluded.target_name, drafts.target_name), text = COALESCE(excluded.text, drafts.text),
        entities = COALESCE(excluded.entities, drafts.entities), silent = COALESCE(excluded.silent, drafts.silent),
        stamp = excluded.stamp`)
    .bind(adminId, chatId, key, kind, target, targetName, text, format.length ? JSON.stringify(format) : null, silent, stamp, Date.now()).run();
  for (const m of media) {
    await env.DB.prepare('INSERT OR IGNORE INTO draft_media (admin_id, group_key, message_id, type, file_id) VALUES (?, ?, ?, ?, ?)')
      .bind(adminId, key, message.message_id, m.type, m.id).run();
  }

  const wait = message.media_group_id ? Number(env.ALBUM_WAIT_MS ?? ALBUM_WAIT_MS) : 0;
  const finish = async () => {
    if (wait) await sleep(wait);
    await previewDraft(env, adminId, key, stamp);
  };
  if (wait && ctx?.waitUntil) ctx.waitUntil(finish());
  else await finish();
}

async function findPlayer(env, who) {
  if (/^\d+$/.test(who)) return env.DB.prepare('SELECT tg_id, name, username FROM users WHERE tg_id = ?').bind(Number(who)).first();
  return env.DB.prepare('SELECT tg_id, name, username FROM users WHERE lower(username) = lower(?)')
    .bind(who.replace(/^@/, '')).first();
}

async function loadDraft(env, where, ...args) {
  const draft = await env.DB.prepare(`SELECT * FROM drafts WHERE ${where}`).bind(...args).first();
  if (!draft) return null;
  const rows = await env.DB.prepare('SELECT type, file_id FROM draft_media WHERE admin_id = ? AND group_key = ? ORDER BY message_id')
    .bind(draft.admin_id, draft.group_key).all();
  return { ...draft, media: (rows.results ?? []).map((r) => ({ type: r.type, id: r.file_id })) };
}

/** Предпросмотр: владелец видит ровно то, что получат игроки, и кнопки «Отправить» / «Отмена». */
async function previewDraft(env, adminId, key, stamp) {
  const draft = await loadDraft(env, 'admin_id = ? AND group_key = ?', adminId, key);
  if (!draft || draft.stamp !== stamp || draft.state !== 'new') return;     // пришла ещё часть альбома — покажет она
  const say = (text) => api(env, 'sendMessage', { chat_id: draft.chat_id, text });
  if (!draft.kind) {
    await say('Чтобы разослать картинки, напиши в подписи /broadcast текст или /message @ник текст.');
    return;
  }
  if (!draft.text && !draft.media.length) {
    await say(draft.kind === 'broadcast' ? 'Напиши так: /broadcast текст сообщения' : 'Напиши так: /message @ник текст');
    return;
  }
  const limit = draft.media.length ? CAPTION_LIMIT : TEXT_LIMIT;
  if ((draft.text ?? '').length > limit) {
    await say(`Слишком длинно: ${draft.text.length} символов, можно ${limit}${draft.media.length ? ' (подпись к фото)' : ''}.`);
    return;
  }
  if (draft.media.length > 10) {
    await say('В альбоме не больше 10 картинок.');
    return;
  }

  await env.DB.prepare("UPDATE drafts SET state = 'preview' WHERE id = ?").bind(draft.id).run();
  await say('Так это увидят:');
  await sendDraft(env, draft.chat_id, draft);
  const players = draft.kind === 'broadcast'
    ? (await env.DB.prepare('SELECT COUNT(*) AS n FROM users WHERE banned = 0').first())?.n ?? 0
    : 1;
  await api(env, 'sendMessage', {
    chat_id: draft.chat_id,
    text: draft.kind === 'broadcast'
      ? `Разослать всем игрокам${draft.silent ? ' без звука' : ''} (${players})?`
      : `Отправить ${draft.target_name}?`,
    reply_markup: {
      inline_keyboard: [[
        { text: draft.kind === 'broadcast' ? `${draft.silent ? '🔕' : '📣'} Разослать (${players})` : '✉️ Отправить', callback_data: `d:send:${draft.id}` },
        { text: 'Отмена', callback_data: `d:cancel:${draft.id}` },
      ]],
    },
  });
}

/**
 * Отправить черновик в чат. Текст — сообщением с кнопкой «Играть»; одна картинка — с подписью и кнопкой;
 * альбом — группой (кнопку к альбому Telegram прикрепить не даёт, подпись — у первой картинки).
 */
async function sendDraft(env, chatId, draft) {
  const text = draft.text ?? '';
  const media = draft.media ?? [];
  let format = [];
  try {
    format = draft.entities ? JSON.parse(draft.entities) : [];
  } catch {
    format = [];
  }
  const withText = format.length ? { entities: format } : {};
  const withCaption = text ? { caption: text, ...(format.length ? { caption_entities: format } : {}) } : {};
  const quiet = draft.silent ? { disable_notification: true } : {};
  let res;
  if (!media.length) {
    res = await api(env, 'sendMessage', { chat_id: chatId, text, ...withText, ...quiet, reply_markup: playButton(env) });
  } else if (media.length === 1) {
    const [m] = media;
    res = await api(env, m.type === 'video' ? 'sendVideo' : 'sendPhoto', {
      chat_id: chatId, [m.type]: m.id, ...withCaption, ...quiet, reply_markup: playButton(env),
    });
  } else {
    res = await api(env, 'sendMediaGroup', {
      chat_id: chatId, ...quiet,
      media: media.map((m, i) => ({ type: m.type, media: m.id, ...(i === 0 ? withCaption : {}) })),
    });
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.ok === false) return { ok: false, ids: [] };
  const result = data?.result;
  const ids = (Array.isArray(result) ? result : [result]).map((m) => m?.message_id).filter(Number.isInteger);
  return { ok: true, ids };
}

/** Запомнить, что ушло игроку, — /unsend потом удалит именно эти сообщения. */
async function recordSent(env, draftId, chatId, ids) {
  if (!draftId || !ids.length) return;
  await env.DB.prepare('INSERT OR REPLACE INTO sent_messages (draft_id, chat_id, message_ids) VALUES (?, ?, ?)')
    .bind(draftId, chatId, JSON.stringify(ids)).run();
}

/** Кнопки под предпросмотром. Нажать может только владелец; дважды не отправится. */
async function onButton(query, env, ctx) {
  const answer = (text) => api(env, 'answerCallbackQuery', { callback_query_id: query.id, ...(text ? { text } : {}) });
  const [prefix, action, rawId] = String(query.data ?? '').split(':');
  if (!['d', 'u'].includes(prefix) || !isAdmin(query.from?.id, parseAdminIds(env.ADMIN_IDS))) {
    await answer('Это только для владельца.');
    return;
  }
  await ensureDraftTables(env);
  if (prefix === 'u') {
    await onUnsendButton(query, env, ctx, action, Number(rawId), answer);
    return;
  }
  const draft = await loadDraft(env, 'id = ? AND admin_id = ?', Number(rawId), query.from.id);
  const edit = (text) => query.message && api(env, 'editMessageText', {
    chat_id: query.message.chat.id, message_id: query.message.message_id, text,
  });
  if (!draft) {
    await answer('Черновик не найден.');
    return;
  }
  if (action === 'cancel') {
    const res = await env.DB.prepare("UPDATE drafts SET state = 'cancelled' WHERE id = ? AND state = 'preview'").bind(draft.id).run();
    await answer();
    if (res.meta?.changes) await edit('Отменено — никому не отправлено.');
    return;
  }
  // «send»: переводим в 'sending' только из 'preview' — второе нажатие ничего не сделает
  const res = await env.DB.prepare("UPDATE drafts SET state = 'sending' WHERE id = ? AND state = 'preview'").bind(draft.id).run();
  if (!res.meta?.changes) {
    await answer('Уже отправлено или отменено.');
    return;
  }
  await answer(draft.kind === 'broadcast' ? 'Рассылаю…' : 'Отправляю…');
  const job = async () => {
    if (draft.kind === 'broadcast') {
      const result = await broadcast(env, draft);
      await edit(`Разослано: ${result.sent} из ${result.total}.`
        + (result.failed ? ` Не доставлено: ${result.failed} (заблокировали бота).` : ''));
    } else {
      const sent = await sendDraft(env, draft.target, draft).catch(() => ({ ok: false, ids: [] }));
      await recordSent(env, draft.id, draft.target, sent.ids);
      const { ok } = sent;
      await edit(ok ? `Отправлено ${draft.target_name}.` : `Не доставлено ${draft.target_name}: игрок заблокировал бота или не начинал с ним чат.`);
    }
    await env.DB.prepare("UPDATE drafts SET state = 'sent' WHERE id = ?").bind(draft.id).run();
  };
  if (ctx?.waitUntil) ctx.waitUntil(job());
  else await job();
}

const escapeHtml = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Игрок и его прогресс (строки по играм) по Telegram-id; игрока нет — null. */
async function playerProgress(env, tgId) {
  const player = await env.DB.prepare('SELECT * FROM users WHERE tg_id = ?').bind(tgId).first();
  if (!player) return null;
  const row = await env.DB.prepare('SELECT data FROM states WHERE user_id = ?').bind(player.id).first();
  let state = {};
  try {
    state = JSON.parse(row?.data ?? '{}');
  } catch {
    state = {};
  }
  return { player, lines: progressLines(state) };
}

/** Текст для /me: уровни и рекорды из сохранённого прогресса. */
async function meText(env, tgId) {
  const found = await playerProgress(env, tgId);
  if (!found) return 'Ты ещё не заходил в игры. Нажми «Играть» — и всё появится.';
  if (!found.lines.length) return 'Пока пусто — сыграй партию, и здесь появятся уровни и рекорды.';
  const { player, lines } = found;
  return `<b>${escapeHtml(displayName({ first_name: player.name, username: player.username }))}</b>\n`
    + lines.map((l) => `• ${escapeHtml(l)}`).join('\n');
}

// ---------- инлайн-режим ----------

let cachedUsername = null;

/** Имя бота для ссылок t.me/<бот>: из переменной BOT_USERNAME или один раз у Telegram (getMe). */
async function botUsername(env) {
  if (env.BOT_USERNAME) return env.BOT_USERNAME.replace(/^@/, '');
  if (cachedUsername) return cachedUsername;
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/getMe`);
    const data = await res.json();
    if (data.ok && data.result?.username) cachedUsername = data.result.username;
  } catch {
    // сеть моргнула — ниже запасной вариант
  }
  return cachedUsername;
}

// Слова, по которым вместо игр показывается свой прогресс.
const RECORDS_QUERY = /^(рекорд|мои|мой|прогресс|стат|me|my|score)/;

/**
 * Инлайн-запрос «@бот …» из любого чата. Кнопки web_app в чужих чатах Telegram не разрешает,
 * поэтому кнопка — ссылка на главное мини-приложение (t.me/<бот>?startapp=<игра>).
 */
async function onInline(query, env) {
  const username = await botUsername(env);
  const link = (param) => (username ? startAppLink(username, param) : appUrl(env));
  const button = (text, param) => ({ inline_keyboard: [[{ text, url: link(param) }]] });
  const q = (query.query ?? '').trim().toLowerCase();

  const invite = {
    type: 'article',
    id: 'all',
    title: '🎮 Позвать играть',
    description: `${publicGames().length} игр прямо в Telegram: слова, головоломки, аркады`,
    input_message_content: {
      message_text: `🎮 <b>Игры прямо в Telegram</b>\n${publicGames().map((g) => g.title).join(', ')}.`,
      parse_mode: 'HTML',
    },
    reply_markup: button('🎮 Играть', ''),
  };
  const gameResult = (g) => ({
    type: 'article',
    id: `g:${g.id}`,
    title: `${g.emoji} ${g.title}`,
    description: g.about,
    input_message_content: {
      message_text: `${g.emoji} <b>${escapeHtml(g.title)}</b> — ${escapeHtml(g.about)}.\nСыграем?`,
      parse_mode: 'HTML',
    },
    reply_markup: button(`▶️ Играть в «${g.title}»`, g.id),
  });

  const mine = await playerProgress(env, query.from?.id);
  const records = mine?.lines.length ? {
    type: 'article',
    id: 'me',
    title: '🏆 Мои рекорды',
    description: mine.lines.slice(0, 3).join(' · '),
    input_message_content: {
      message_text: `🏆 <b>Мои игры</b>\n${mine.lines.map((l) => `• ${escapeHtml(l)}`).join('\n')}`,
      parse_mode: 'HTML',
    },
    reply_markup: button('🎮 Попробуй побить', ''),
  } : null;

  const results = [];
  if (!q) {
    results.push(invite);
    if (records) results.push(records);
    results.push(...publicGames().map(gameResult));
  } else if (RECORDS_QUERY.test(q)) {
    if (records) results.push(records);
    results.push(invite);
  } else {
    const games = findGames(q);
    results.push(...games.map(gameResult));
    if (!games.length) results.push(invite);
  }

  await api(env, 'answerInlineQuery', {
    inline_query_id: query.id,
    results: results.slice(0, 50),
    cache_time: 10,
    is_personal: true,          // «Мои рекорды» у каждого свои
  });
}

/**
 * Рассылка всем, кто хоть раз открывал игры. Заблокировавшие бота просто не получат сообщение.
 * content — строка (панель владельца) или черновик { text, media }.
 */
async function broadcast(env, content) {
  const draft = typeof content === 'string' ? { text: content, media: [] } : content;
  const rows = await env.DB.prepare('SELECT tg_id FROM users WHERE banned = 0 LIMIT ?').bind(BROADCAST_LIMIT).all();
  const ids = (rows.results ?? []).map((r) => r.tg_id);
  let sent = 0;
  let failed = 0;
  if (draft.id) await ensureDraftTables(env);
  for (const id of ids) {
    try {
      const res = await sendDraft(env, id, draft);
      if (res.ok) {
        sent += 1;
        await recordSent(env, draft.id, id, res.ids);
      } else failed += 1;
    } catch {
      failed += 1;
    }
  }
  return { total: ids.length, sent, failed };
}

// ---------- /unsend: удалить у всех недавнюю рассылку или сообщение ----------
// Номера отправленных сообщений записываются (sent_messages) — по ним удаление точное. У рассылок, отправленных до
// этого (номеров нет), сообщение ищется по тексту: перед сообщением более поздней рассылки, чей номер известен, бот
// смотрит до UNSEND_PROBE сообщений — пересылает каждое себе (и сразу стирает копию), удаляет только своё с тем же
// текстом. Чужое (например, сообщение самого игрока) не трогается. Telegram даёт удалять только 48 часов.
// Много игроков — Cloudflare может оборвать работу по лимиту запросов: тогда «Продолжить» доделает (unsend_done).

const UNSEND_PROBE = 6;
const clip = (text, n = 40) => {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim() || '(картинка)';
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

async function listSent(env, chatId, adminId) {
  await ensureDraftTables(env);
  const rows = (await env.DB.prepare(`SELECT id, kind, target_name, text FROM drafts
      WHERE admin_id = ? AND state = 'sent' ORDER BY id DESC LIMIT 6`).bind(adminId).all()).results ?? [];
  if (!rows.length) {
    await api(env, 'sendMessage', { chat_id: chatId, text: 'Удалять нечего: рассылок и сообщений ещё не было.' });
    return;
  }
  await api(env, 'sendMessage', {
    chat_id: chatId,
    text: 'Что удалить у всех, кому ушло? Telegram разрешает удалять только сообщения моложе 48 часов.',
    reply_markup: {
      inline_keyboard: rows.map((d) => [{
        text: `🗑 ${d.kind === 'broadcast' ? 'Всем' : d.target_name}: ${clip(d.text, 32)}`,
        callback_data: `u:ask:${d.id}`,
      }]),
    },
  });
}

async function onUnsendButton(query, env, ctx, action, draftId, answer) {
  const chat = query.message?.chat?.id;
  const edit = (text, buttons = null) => query.message && api(env, 'editMessageText', {
    chat_id: chat, message_id: query.message.message_id, text,
    ...(buttons ? { reply_markup: { inline_keyboard: [buttons] } } : {}),
  });
  const draft = await env.DB.prepare("SELECT * FROM drafts WHERE id = ? AND admin_id = ? AND state = 'sent'")
    .bind(draftId, query.from.id).first();
  if (!draft) {
    await answer('Не нашёл такую рассылку.');
    return;
  }
  const who = draft.kind === 'broadcast' ? 'у всех игроков' : `у ${draft.target_name}`;
  if (action === 'ask') {
    await answer();
    await edit(`Удалить «${clip(draft.text, 60)}» ${who}?`, [
      { text: '🗑 Удалить', callback_data: `u:go:${draft.id}` },
      { text: 'Отмена', callback_data: `u:no:${draft.id}` },
    ]);
    return;
  }
  if (action === 'no') {
    await answer();
    await edit('Ничего не удалено.');
    return;
  }
  await answer('Удаляю…');
  const job = async () => {
    const r = await unsendDraft(env, draft, chat);
    const parts = [`Удалено: ${r.deleted}.`];
    if (r.missing) parts.push(`Не нашёл: ${r.missing}${r.searched ? ' — сообщение не нашлось рядом с более поздней рассылкой' : ''}.`);
    if (r.failed) parts.push(`Не удалось: ${r.failed} — старше 48 часов или игрок удалил чат.`);
    if (r.stopped) parts.push('Не успел всех — нажми «Продолжить».');
    await edit(parts.join(' '), r.stopped ? [{ text: 'Продолжить', callback_data: `u:go:${draft.id}` }] : null);
  };
  if (ctx?.waitUntil) ctx.waitUntil(job());
  else await job();
}

async function unsendDraft(env, draft, adminChat) {
  const r = { deleted: 0, missing: 0, failed: 0, stopped: false, searched: false };
  const tg = async (method, payload) => {
    const res = await api(env, method, payload);
    return res.json().catch(() => ({ ok: res.ok }));
  };
  const done = new Set(((await env.DB.prepare('SELECT chat_id FROM unsend_done WHERE draft_id = ?').bind(draft.id).all())
    .results ?? []).map((row) => row.chat_id));
  const mark = (chatId) => env.DB.prepare('INSERT OR IGNORE INTO unsend_done (draft_id, chat_id) VALUES (?, ?)').bind(draft.id, chatId).run();
  const recorded = (await env.DB.prepare('SELECT chat_id, message_ids FROM sent_messages WHERE draft_id = ?').bind(draft.id).all()).results ?? [];
  try {
    if (recorded.length) {
      for (const row of recorded) {
        if (done.has(row.chat_id)) continue;
        const res = await tg('deleteMessages', { chat_id: row.chat_id, message_ids: JSON.parse(row.message_ids) });
        if (res.ok) {
          r.deleted += 1;
          await mark(row.chat_id);
        } else r.failed += 1;
      }
      return r;
    }
    // старая рассылка: номеров нет — ищем по тексту перед сообщением более поздней рассылки
    r.searched = true;
    const norm = (t) => String(t ?? '').replace(/\s+/g, ' ').trim();
    const text = norm(draft.text);
    const anchors = new Map();
    for (const row of (await env.DB.prepare('SELECT chat_id, message_ids FROM sent_messages WHERE draft_id > ?').bind(draft.id).all()).results ?? []) {
      const first = Math.min(...JSON.parse(row.message_ids));
      if (!anchors.has(row.chat_id) || first < anchors.get(row.chat_id)) anchors.set(row.chat_id, first);
    }
    const recipients = draft.kind === 'broadcast'
      ? ((await env.DB.prepare('SELECT tg_id FROM users WHERE banned = 0').all()).results ?? []).map((u) => u.tg_id)
      : [draft.target];
    for (const chatId of recipients) {
      if (done.has(chatId)) continue;
      const anchor = anchors.get(chatId);
      let found = false;
      for (let k = 1; text && anchor && k <= UNSEND_PROBE && anchor - k > 0 && !found; k++) {
        const id = anchor - k;
        const fw = await tg('forwardMessage', { chat_id: adminChat, from_chat_id: chatId, message_id: id, disable_notification: true });
        if (!fw.ok || !fw.result) continue;
        await tg('deleteMessage', { chat_id: adminChat, message_id: fw.result.message_id });
        const byBot = fw.result.forward_origin?.sender_user?.is_bot || fw.result.forward_from?.is_bot;
        if (!byBot || norm(fw.result.text ?? fw.result.caption) !== text) continue;
        found = true;
        const del = await tg('deleteMessage', { chat_id: chatId, message_id: id });
        if (del.ok) {
          r.deleted += 1;
          await mark(chatId);
        } else r.failed += 1;
      }
      if (!found) r.missing += 1;
    }
  } catch (err) {
    console.warn('unsend прерван:', err);
    r.stopped = true;
  }
  return r;
}
