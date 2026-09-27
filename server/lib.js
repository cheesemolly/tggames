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
/**
 * Строку прогресса пишет клиент — в сообщениях бота она не должна становиться ссылкой, упоминанием или простынёй:
 * только буквы, цифры и простая пунктуация (без точек, «/» и @ — из них Telegram делает ссылки), до 60 символов.
 */
export function cleanProgress(text) {
  return String(text ?? '').replace(/[^\p{L}\p{N} :·,()№+×%«»!?-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 60);
}

export function progressLines(state) {
  const lines = [];
  const describe = (id, title, best) => {
    const stats = state?.[`shell:stats:${id}`];
    const raw = state?.[`shell:progress:${id}`];
    const line = typeof raw === 'string' ? cleanProgress(raw) : '';
    const parts = [];
    if (stats?.played) {
      const hasBest = best !== false && stats.best !== null && stats.best !== undefined;
      const bestText = hasBest ? `, ${typeof best === 'function' ? best(stats.best) : `рекорд ${stats.best}`}` : '';
      parts.push(`сыграно ${stats.played}${bestText}`);
    }
    if (typeof line === 'string' && line) parts.push(line);
    if (parts.length) lines.push(`${title}: ${parts.join(' · ')}`);
  };
  // только игры из списка: ключи неизвестных игр пишет клиент — показывать их нельзя (аудит 2026-09-27)
  for (const g of GAMES) describe(g.id, g.title, g.best);
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
  'player-suggest',
  // <<< конец серверной беты
];

// ---------- приветствие (/start) ----------

/** Старое приветствие — у игроков, пока 'welcome' в серверной бете. */
export const START_TEXT = 'Привет! Здесь набор небольших игр: слова, головоломки, аркады.\n'
  + 'Прогресс сохраняется за твоим аккаунтом Telegram — можно играть с любого устройства.';

/** Новое приветствие — подпись к гифке с геймплеем (media/welcome.mp4 на сайте). */
export const WELCOME_TEXT = 'Привет! Это AnyGame — игры прямо в Telegram: слова, головоломки, аркады, шашки, '
  + 'викторина и музыка.\n\n'
  + '🏆 Рейтинг: занимай первые места и бей рекорды друзей.\n'
  + '☁️ Прогресс сохраняется за твоим аккаунтом Telegram — играй с любого устройства.';

/** Путь к гифке приветствия относительно адреса мини-приложения (APP_URL). */
export const WELCOME_MEDIA = 'media/welcome.mp4';

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
  // после экранирования текст длиннее («<» → «&lt;»): 1000 символов могли вырасти за предел Telegram (4096),
  // и отзыв молча не доходил — режем по символам исходника, пока экранированный не влезет
  let body = escHtml(text);
  for (let n = [...String(text)].length; body.length > 3500 && n > 0; n -= 50) body = `${escHtml([...String(text)].slice(0, n).join(''))}…`;
  return `📝 <b>Отзыв</b> ${source === 'app' ? 'из приложения' : 'в боте'}\n${who}\n\n${body}\n\n`
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

/**
 * Правдоподобные потолки (аудит 2026-09-27: прогресс присылает клиент, одним запросом можно было встать первым
 * везде). Выше — очки в рейтинг не идут. Не защита от аккуратной подделки — для неё в панели «убрать из рейтинга».
 */
export const BOARD_LIMITS = {
  words: 100,                 // уровней в игре 100
  flags: 1e6, checkers: 1e5, 'flappy-burger': 1e4, 'bubble-shooter': 1e4, snake: 1e5, 'brick-blast': 1e4,
  loop: 1e5, 'connect-dots': 1e4, mahjong: 1e5, 2048: 131072, boggle: 1e6, 'block-blast': 1e7, sudoku: 1e5,
  wordle: 1e5, memory: 1e4, 'bongo-cat': 1e8,
};
// побед не может быть больше сыгранных партий
const WINS_FROM = { checkers: 'checkers', mahjong: 'mahjong', sudoku: 'sudoku', wordle: 'wordle' };

function plausible(id, value, state) {
  if (value > (BOARD_LIMITS[id] ?? MAX_SCORE)) return false;
  if (id === '2048' && (value < 4 || (value & (value - 1)) !== 0)) return false;   // плитка — степень двойки
  const wins = WINS_FROM[id];
  if (wins) {
    const played = state?.[`shell:stats:${wins}`]?.played;
    if (!Number.isInteger(played) || value > played) return false;
  }
  return true;
}

/** Очки игрока по всем играм рейтинга: { gameId: целое > 0 }. Пустое, мусор и неправдоподобное — пропускаются. */
export function boardScores(state) {
  const out = {};
  for (const [id, board] of Object.entries(BOARDS)) {
    let value;
    try {
      value = board.score(state);
    } catch {
      value = null;
    }
    if (Number.isInteger(value) && value > 0 && value <= MAX_SCORE && plausible(id, value, state)) out[id] = value;
  }
  return out;
}

// ---------- общий рейтинг (в бете: 'leaderboard-overall') ----------

/**
 * Очки общего рейтинга за место в одной игре — как в Формуле-1: 1-е — 100, 2-е — 93, 3-е — 86, 10-е — 52…
 * Любой результат — не меньше 10: выгодно пробовать разные игры. По местам, а не по самим результатам: результаты
 * игр несравнимы (плитка 2048, удары, победы), а накрутка даёт лишь одно первое место, не обнуляя остальных.
 */
export const OVERALL_MIN = 10;
export const overallPoints = (place) => Math.max(OVERALL_MIN, Math.round(100 * 0.93 ** (place - 1)));

/**
 * Общий рейтинг из мест по играм. rows — [{ user_id, game_id, place, name, pid, updated_at }], games — какие игры
 * считать (игры в бете у игроков не считаются). При равенстве очков выше тот, у кого больше первых мест, потом —
 * больше мест в тройке, потом — кто раньше набрал (последнее изменение результатов раньше).
 * → [{ user_id, name, pid, points, firsts, podiums, games, place }] по местам.
 */
export function overallRanking(rows, games) {
  const by = new Map();
  for (const r of rows) {
    if (!games.has(r.game_id)) continue;
    let p = by.get(r.user_id);
    if (!p) by.set(r.user_id, p = { user_id: r.user_id, name: r.name, pid: r.pid, points: 0, firsts: 0, podiums: 0, games: 0, at: 0 });
    p.points += overallPoints(r.place);
    p.games += 1;
    if (r.place === 1) p.firsts += 1;
    if (r.place <= 3) p.podiums += 1;
    p.at = Math.max(p.at, Number(r.updated_at) || 0);
  }
  return [...by.values()]
    .sort((a, b) => b.points - a.points || b.firsts - a.firsts || b.podiums - a.podiums || a.at - b.at || a.user_id - b.user_id)
    .map(({ at, ...p }, i) => ({ ...p, place: i + 1 }));
}

/**
 * Места без части игроков (в бете 'leaderboard-no-admin': разработчик тестирует игры и иначе стоит везде первым).
 * rows — места по играм (как из RANKED); у оставшихся места и total в каждой игре пересчитываются по порядку.
 */
export function withoutUsers(rows, skip) {
  if (!skip.size) return rows;
  const byGame = new Map();
  for (const r of rows) {
    if (skip.has(r.user_id)) continue;
    if (!byGame.has(r.game_id)) byGame.set(r.game_id, []);
    byGame.get(r.game_id).push(r);
  }
  const out = [];
  for (const list of byGame.values()) {
    list.sort((a, b) => a.place - b.place);
    list.forEach((r, i) => out.push({ ...r, place: i + 1, total: list.length }));
  }
  return out;
}

/**
 * Ник для поиска игрока (в бете 'player-search'): «@nick», «nick», «t.me/nick» → «nick» в нижнем регистре, иначе null.
 * У Telegram ник — латиница, цифры и «_», 4–32 символа (старые бывают короче пяти).
 */
export function parseUsername(text) {
  const raw = String(text ?? '').trim().replace(/^(https?:\/\/)?(t\.me|telegram\.me)\//i, '').replace(/^@/, '');
  return /^[a-z0-9_]{4,32}$/i.test(raw) ? raw.toLowerCase() : null;
}

/** Для поиска игроков: нижний регистр любой письменности (кириллица тоже), ё = е, без «@» и лишних пробелов. */
export const foldSearch = (text) => String(text ?? '').normalize('NFKC').toLowerCase().replace(/ё/g, 'е')
  .replace(/\s+/g, ' ').trim().replace(/^@/, '');

/**
 * Подсказки поиска (в бете 'player-suggest'): игроки, у кого @ник или имя (любое его слово) начинается с набранного.
 * Имя — то, что видно в рейтинге (без фамилии: по ней искать нельзя). Порядок: ник или имя совпали целиком, потом
 * начало ника, потом начало имени; внутри — кто заходил недавно. candidates: [{ id, name, username, seen }].
 * SQL тут не годится: lower() и LIKE в SQLite без учёта регистра только для латиницы — «марина» не нашла бы «Марину».
 */
export function matchPlayers(candidates, query, limit = 10) {
  const q = foldSearch(query);
  if (!q || q.length > 32) return [];
  const scored = [];
  for (const c of candidates) {
    const nick = foldSearch(c.username);
    const name = foldSearch(c.name);
    let rank = -1;
    if ((nick && nick === q) || name === q) rank = 0;
    else if (nick.startsWith(q)) rank = 1;
    else if (name.startsWith(q) || name.split(' ').some((w) => w.startsWith(q))) rank = 2;
    if (rank >= 0) scored.push({ c, rank });
  }
  scored.sort((a, b) => a.rank - b.rank || (b.c.seen ?? 0) - (a.c.seen ?? 0) || a.c.id - b.c.id);
  return scored.slice(0, limit).map((x) => x.c);
}

/**
 * Имя для рейтинга — только имя из Telegram (без фамилии, ника и id: требование владельца, 2026-09-26).
 * Длинное обрезается, пустое — «Игрок».
 */
export function boardName(firstName) {
  // без служебных символов (переворот направления текста и т.п. — ими можно «подделать» чужое имя)
  const name = String(firstName ?? '').replace(/[\p{Cc}\p{Cf}]/gu, '').replace(/\s+/g, ' ').trim();
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
