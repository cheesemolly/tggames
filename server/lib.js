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
  { id: 'killer-sudoku', title: 'Судоку-киллер', emoji: '➕', about: 'судоку с суммами: цифры группы складываются в число в её углу' },
  { id: 'nonogram', title: 'Японский кроссворд', emoji: '🖼️', about: 'нонограмма: закрашивай клетки по числам — получится картинка, 100 уровней' },
  { id: 'minesweeper', title: 'Сапёр', emoji: '💣', about: 'открой поле и не наступи на мину: от 9×9 до 16×30, есть режим без угадываний' },
  { id: 'fifteen', title: 'Пятнашки', emoji: '🔀', about: 'собери плитки по порядку: свайпы как в 2048, поля от 3×3 до 8×8' },
  { id: 'rubik', title: 'Кубик Рубика', emoji: '🧊', about: 'собери кубик 3×3 на время: перемешивание как на соревнованиях, среднее из 5' },
  { id: 'hanoi', title: 'Ханойская башня', emoji: '🗼', about: 'перенеси башню дисков на другой стержень: от 3 до 10 дисков, «идеально» — за минимум ходов' },
  { id: 'repair', title: 'Ремонт гаджетов', emoji: '🔧', about: 'мастерская: чини телефоны, приставки, наушники, комплектующие ПК — закупай детали, прошивай с компьютера', beta: true, rating: false },
  { id: 'wordle', title: 'Wordle', emoji: '🟩', about: 'угадай слово из пяти букв: русский, украинский, английский', best: false },
  { id: 'memory', title: 'Мемори', emoji: '🃏', about: 'найди пары одинаковых карточек' },
  { id: 'bongo-cat', title: 'Bongo Cat', emoji: '🐱', about: 'кот играет на инструментах, разучи мелодию' },
  { id: 'tictactoe', title: 'Крестики-нолики', emoji: '❌', about: 'классика 3×3 и гомоку — пять в ряд на большом поле' },
  { id: 'go', title: 'Го', emoji: '⚫', about: 'древняя игра: против бота или вдвоём, доски 9×9, 13×13, 19×19' },
  { id: 'match3', title: 'Три в ряд', emoji: '💎', about: 'меняй фишки местами и собирай по три — 100 уровней с боссами' },
  { id: 'chess', title: 'Шахматы', emoji: '♟️', about: 'против бота: семь уровней, от новичка до полной силы' },
  { id: 'spider', title: 'Паук', emoji: '🕷️', about: 'пасьянс как в Windows: 1, 2 или 4 масти' },
  { id: 'klondike', title: 'Косынка', emoji: '🃏', about: 'пасьянс как в Windows: из колоды по одной или по три' },
  { id: 'pinball', title: 'Пинбол', emoji: '🚀', about: 'как в Windows XP: миссии, звания, гиперпространство' },
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
  'rating-points',
  // <<< конец серверной беты
];

/**
 * Версия синхронизации клиента (shell/sync.js SYNC_PROTOCOL). 2 — клиент перечитывает прогресс при возврате и
 * перезапускает устаревшую игру (бета 'sync-refresh'). Сохранения тех, кому она открыта, принимаются только от
 * такого клиента: старый (закэшированный или висящий в памяти свёрнутого мини-приложения) откатил бы прогресс.
 */
export const SYNC_PROTOCOL = 2;

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

/**
 * Пройденные уровни «Три в ряд» из прогресса игры: game:match3:progress.done — 100 отметок 0/1 (в первой версии
 * были звёзды 0–3 в stars — пройден, если звезда была).
 */
export function match3Levels(state) {
  const p = state?.['game:match3:progress'];
  const list = Array.isArray(p?.done) ? p.done : Array.isArray(p?.stars) ? p.stars : null;
  if (!list) return null;
  return list.slice(0, 100).reduce((sum, v) => sum + (Number(v) > 0 ? 1 : 0), 0);
}

/** Решённые картинки японского кроссворда: game:nonogram:progress.done — 100 отметок 0/1/2 (2 — чисто). */
export function nonogramSolved(state) {
  const list = state?.['game:nonogram:progress']?.done;
  if (!Array.isArray(list)) return null;
  return list.slice(0, 100).reduce((sum, v) => sum + (Number(v) > 0 ? 1 : 0), 0);
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
  'killer-sudoku': { by: 'решённые судоку', score: shellStats('killer-sudoku', 'wins'), text: count(['судоку', 'судоку', 'судоку']) },
  nonogram: { by: 'решённые картинки', score: nonogramSolved, text: count(['картинка', 'картинки', 'картинок']) },
  minesweeper: { by: 'разминированные поля', score: shellStats('minesweeper', 'wins'), text: count(['поле', 'поля', 'полей']) },
  fifteen: { by: 'собранные поля', score: shellStats('fifteen', 'wins'), text: count(['поле', 'поля', 'полей']) },
  rubik: { by: 'собранные кубики', score: shellStats('rubik', 'wins'), text: count(['кубик', 'кубика', 'кубиков']) },
  hanoi: { by: 'собранные башни', score: shellStats('hanoi', 'wins'), text: count(['башня', 'башни', 'башен']) },
  wordle: { by: 'угаданные слова', score: shellStats('wordle', 'wins'), text: count(['слово', 'слова', 'слов']) },
  memory: { by: 'уровень', score: menuLevel('memory'), text: levelText },
  'bongo-cat': { by: 'ударов за всё время', score: gameStats('bongo-cat', 'hits'), text: count(['удар', 'удара', 'ударов']) },
  tictactoe: { by: 'победы над ботом', score: shellStats('tictactoe', 'wins'), text: WINS },
  go: { by: 'победы над ботом', score: shellStats('go', 'wins'), text: WINS },
  // «Три в ряд»: сколько уровней пройдено (звёзд в игре нет)
  match3: { by: 'пройденные уровни', score: match3Levels, text: count(['уровень пройден', 'уровня пройдено', 'уровней пройдено']) },
  chess: { by: 'победы над ботом', score: shellStats('chess', 'wins'), text: WINS },
  spider: { by: 'разложенные пасьянсы', score: shellStats('spider', 'wins'), text: count(['пасьянс', 'пасьянса', 'пасьянсов']) },
  klondike: { by: 'разложенные пасьянсы', score: shellStats('klondike', 'wins'), text: count(['пасьянс', 'пасьянса', 'пасьянсов']) },
  pinball: { by: 'рекорд', score: shellStats('pinball', 'best'), text: POINTS },
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
  match3: 100,                // уровней в игре 100
  tictactoe: 1e5,
  chess: 1e5,
  spider: 1e5,
  klondike: 1e5,
  pinball: 1e9,
  'killer-sudoku': 1e5,
  go: 1e5,
  minesweeper: 1e6,
  fifteen: 1e6,
  rubik: 1e6,
  hanoi: 1e6,
  nonogram: 100,              // уровней в игре 100
};
// побед не может быть больше сыгранных партий
const WINS_FROM = { checkers: 'checkers', mahjong: 'mahjong', sudoku: 'sudoku', wordle: 'wordle', tictactoe: 'tictactoe', chess: 'chess', spider: 'spider', klondike: 'klondike', 'killer-sudoku': 'killer-sudoku', go: 'go', minesweeper: 'minesweeper', fifteen: 'fifteen', rubik: 'rubik', hanoi: 'hanoi' };

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

// ---------- очки рейтинга (в бете: 'rating-points') ----------

/*
 * Вместо «уровня» и «побед» — очки за каждое пройденное (владелец, 2026-10-06: «в зависимости от сложности начисляем
 * очки за кол-во решённых полей и суммируем… ОБЯЗАТЕЛЬНО СБАЛАНСИРУЙ ВСЕ»). Баланс: ≈ 50 очков за минуту обычной игры,
 * сложное — дороже за минуту (умение ценится выше времени), маленькое и лёгкое — дешевле (чтобы его не фармили).
 * Считается из уже синхронизированной статистики: по вариантам оболочки (shell:stats:<игра>:<вариант> — сложность,
 * размер, режим) и прогрессу игр. Победы, записанные до появления вариантов (старые), — по самой дешёвой цене (legacy).
 * Игры, где мера и так честная (рекорд Flappy, Пинбола, Block Blast, плитка 2048, удары Bongo Cat), — без изменений.
 * Общий рейтинг по-прежнему из мест в каждой игре — так что очки разных игр между собой не складываются.
 * Хранятся рядом со старыми (board_scores, game_id «pts:<игра>»); после релиза беты старые для этих игр не нужны.
 */

/** Цены побед по вариантам оболочки. legacy — цена победы без варианта (старые записи и неизвестные варианты). */
const lvl = (base, ids) => Object.fromEntries(ids.map((id, k) => [id, base[k]]));
const CHECKERS_LEVELS = lvl([15, 30, 60, 120, 250], ['novice', 'easy', 'medium', 'hard', 'master']);
const GO_LEVEL = [15, 30, 60, 120, 240];
const GO_SIZE = { 9: 1, 13: 2, 19: 4 };
const HANOI = {
  3: { 3: 5, 4: 10, 5: 20, 6: 40, 7: 80, 8: 160, 9: 320, 10: 640 },     // ходов вдвое больше с каждым диском
  4: { 3: 5, 4: 8, 5: 12, 6: 18, 7: 25, 8: 35, 9: 45, 10: 60 },          // на четырёх стержнях ходов куда меньше
};
export const WIN_POINTS = {
  sudoku: { legacy: 50, by: { easy: 50, medium: 100, hard: 200, expert: 400 } },
  'killer-sudoku': { legacy: 80, by: { easy: 80, medium: 160, hard: 300, expert: 550 } },
  minesweeper: { legacy: 30, by: { easy: 30, medium: 120, hard: 350, custom: 10 } },   // своё поле бывает 5×5 с одной миной
  mahjong: { legacy: 40, by: { kid: 40, butterfly: 70, tower: 75, fortress: 90, pyramid: 120, turtle: 160 } },
  klondike: { legacy: 60, by: { 'draw-1': 60, 'draw-3': 120 } },
  spider: { legacy: 60, by: { 'suits-1': 60, 'suits-2': 180, 'suits-4': 450 } },
  chess: { legacy: 20, by: lvl([20, 40, 80, 150, 250, 400, 600], [1, 2, 3, 4, 5, 6, 7].map((n) => `level-${n}`)) },
  checkers: {
    legacy: 15,
    by: Object.fromEntries(['classic', 'giveaway'].flatMap((m) => Object.entries(CHECKERS_LEVELS).map(([l, p]) => [`${m}-${l}`, p]))),
  },
  go: {
    legacy: 15,
    by: Object.fromEntries(Object.entries(GO_SIZE).flatMap(([size, k]) => GO_LEVEL.map((p, i) => [`${size}-${i + 1}`, p * k]))),
  },
  // против бота; «вдвоём» в статистику оболочки не пишется
  tictactoe: { legacy: 3, by: { 'classic-easy': 3, 'classic-medium': 8, 'classic-hard': 20, 'gomoku-easy': 20, 'gomoku-medium': 50, 'gomoku-hard': 120 } },
  fifteen: { legacy: 20, by: { 3: 20, 4: 60, 5: 150, 6: 300, 7: 500, 8: 800 } },
  hanoi: { legacy: 5, by: Object.fromEntries(Object.entries(HANOI).flatMap(([pegs, row]) => Object.entries(row).map(([n, p]) => [`${pegs}-${n}`, p]))) },
  rubik: { legacy: 200, by: { '3x3': 200 } },
  wordle: { legacy: 50, by: {} },                                        // язык не важен — 50 за слово
};

const nat = (v) => (Number.isInteger(v) && v > 0 ? v : 0);
const MAX_PLAYED = 1e5;

/** Очки за победы по вариантам: Σ цена × победы варианта (не больше сыгранных) + старые победы по legacy. */
export function winPoints(state, id) {
  const table = WIN_POINTS[id];
  const total = state?.[`shell:stats:${id}`];
  if (!table || !total) return 0;
  const played = nat(total.played);
  const wins = Math.min(nat(total.wins), played, MAX_PLAYED);
  let points = 0;
  let counted = 0;
  const prefix = `shell:stats:${id}:`;
  for (const [key, row] of Object.entries(state)) {
    if (!key.startsWith(prefix) || !row || typeof row !== 'object') continue;
    const variant = key.slice(prefix.length);
    const w = Math.min(nat(row.wins), nat(row.played), wins - counted);
    if (w <= 0) continue;
    counted += w;
    points += w * (table.by[variant] ?? table.legacy);
  }
  return points + (wins - counted) * table.legacy;
}

/** Слова из слова: каждое найденное слово по длине (3 буквы — 10, 4 — 15… как предложил владелец). */
export const WORD_POINTS = { 3: 10, 4: 15, 5: 20, 6: 30, 7: 40, 8: 55, 9: 70 };
export function wordsPoints(state) {
  const levels = state?.['game:words:progress']?.levels;
  if (!levels || typeof levels !== 'object') return 0;
  let points = 0;
  for (const [i, lv] of Object.entries(levels)) {
    if (!/^\d+$/.test(i) || Number(i) >= 100 || !Array.isArray(lv?.found)) continue;
    const seen = new Set();
    for (const w of lv.found.slice(0, 400)) {
      if (typeof w !== 'string' || !/^[а-яё]{3,9}$/.test(w) || seen.has(w)) continue;
      seen.add(w);
      points += WORD_POINTS[w.length];
    }
  }
  return points;
}

/** Филворд: пройденные поля по размеру (маленькие дёшевы — их не фармят) + 5 за бонусное слово. */
export const BOGGLE_FIELD_POINTS = { 5: 25, 6: 60, 7: 110, 8: 180 };
export function bogglePoints(state) {
  const stats = state?.['game:boggle:stats'];
  let points = 0;
  for (const [size, p] of Object.entries(BOGGLE_FIELD_POINTS)) {
    const s = stats?.[size];
    points += Math.min(nat(s?.played), MAX_PLAYED) * p + Math.min(nat(s?.bonus), 1e6) * 5;
  }
  return points;
}

/** Японский кроссворд: решённая картинка — ¾ очка за клетку (5×5 — 20, 15×15 — 170, 20×20 — 300). */
// клеток в уровнях games/nonogram/levels.js (тест сверяет)
export const NONOGRAM_CELLS = [
  25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 132, 192, 168, 169, 192, 210, 156, 176, 180, 208,
  224, 225, 130, 208, 210, 224, 168, 196, 169, 196, 196, 240, 256, 240, 256, 256, 156, 208, 208, 224,
  240, 240, 256, 165, 168, 224, 256, 256, 256, 176, 240, 256, 256, 256, 240, 225, 225, 225, 225, 225,
  225, 225, 225, 225, 225, 225, 225, 225, 225, 225, 225, 225, 225, 225, 225, 225, 225, 225, 225, 225,
  400, 400, 400, 400, 400, 400, 400, 400, 400, 400, 400, 400, 400, 400, 400, 400, 400, 400, 400, 400,
];
export const nonogramLevelPoints = (cells) => Math.round((cells * 0.75) / 5) * 5;
export function nonogramPoints(state) {
  const done = state?.['game:nonogram:progress']?.done;
  if (!Array.isArray(done)) return 0;
  return done.slice(0, 100).reduce((sum, v, i) => sum + (Number(v) > 0 ? nonogramLevelPoints(NONOGRAM_CELLS[i]) : 0), 0);
}

/** Три в ряд: уровень k (1–100) — 40 + 4k: дальше — сложнее и дороже (1-й — 44, 100-й — 440). */
export const match3LevelPoints = (k) => 40 + 4 * k;
export function match3Points(state) {
  const p = state?.['game:match3:progress'];
  const list = Array.isArray(p?.done) ? p.done : Array.isArray(p?.stars) ? p.stars : null;
  if (!list) return 0;
  return list.slice(0, 100).reduce((sum, v, i) => sum + (Number(v) > 0 ? match3LevelPoints(i + 1) : 0), 0);
}

/** Сумма цен уровней 1…passed (уровни бесконечные — не больше MAX_LEVELS). */
const MAX_LEVELS = 10000;
function levelsSum(passed, price) {
  let points = 0;
  for (let k = 1; k <= Math.min(passed, MAX_LEVELS); k++) points += price(k);
  return points;
}
const menuPassed = (state, id) => Math.max(0, (levelOf(state?.[`shell:progress:${id}`]) ?? 1) - 1);

// цены уровня k — растут, пока растёт поле, дальше ровные
export const LEVEL_PRICES = {
  loop: (k) => 10 + 2 * Math.min(k, 25),                     // 3×3 — 12, с 25-го (10×10) — 60
  'connect-dots': (k) => 10 + 3 * Math.min(k, 20),           // 3×3 — 13, с 20-го (8×8 с тоннелями) — 70
  'bubble-shooter': (k) => 40 + Math.min(Math.floor(k / 2), 60),
  'brick-blast': (k) => 40 + Math.min(Math.floor(k / 2), 60),
  // змейка: уровни 1–12 — 100…1200 (как предложил владелец), каждый следующий круг карт — ещё +300
  snake: (k) => 100 * (((k - 1) % 12) + 1) + 300 * Math.floor((k - 1) / 12),
};

/** Соедини точки: пройденные уровни — из прогресса уровней (бета), до него — рекорд забега. */
function connectDotsPassed(state) {
  const level = nat(state?.['game:connect-dots:progress']?.level);
  const best = nat(state?.['shell:stats:connect-dots']?.best);
  return Math.max(level - 1, best);
}

/** Мемори: уровень по давлению — «Спокойно» 25, «Жизни» 50, «На время» 75; до счётчика — как «Спокойно». */
export const MEMORY_POINTS = { calm: 25, lives: 50, time: 75 };
export function memoryPoints(state) {
  const s = state?.['game:memory:stats'];
  const cleared = Math.min(nat(s?.levelsCleared), MAX_PLAYED);
  let points = 0;
  let counted = 0;
  for (const [mode, p] of Object.entries(MEMORY_POINTS)) {
    const n = Math.min(nat(s?.byPressure?.[mode]), cleared - counted);
    counted += n;
    points += n * p;
  }
  return points + (cleared - counted) * MEMORY_POINTS.calm;
}

/** Змейка: рекорд классики + уровни. */
export function snakePoints(state) {
  const best = Math.min(nat(state?.['shell:stats:snake']?.best), 1e5);
  return best + levelsSum(nat(state?.['game:snake:levels']?.best), LEVEL_PRICES.snake);
}

/**
 * Флаги: победа (от 70% верных) по режиму и длине — тест 10 — 25, 20 — 55; ввод 10 — 50, 20 — 110; марафон — рекорд
 * верных × 3 (тест) или × 6 (ввод). Победы до счётчика — по цене теста на 10.
 */
export const FLAG_POINTS = { 'test-10': 25, 'test-20': 55, 'type-10': 50, 'type-20': 110 };
export const FLAG_MARATHON = { test: 3, type: 6 };
export function flagsPoints(state) {
  const s = state?.['game:flags:stats'];
  let points = 0;
  let counted = 0;
  for (const [key, n] of Object.entries(s?.won ?? {})) {
    const w = Math.min(nat(n), MAX_PLAYED);
    counted += w;
    points += w * (FLAG_POINTS[key] ?? 0);                 // победы марафона — только для учёта, очки за рекорд
  }
  for (const [mode, k] of Object.entries(FLAG_MARATHON)) points += Math.min(nat(s?.marathon?.[mode]), 196) * k;
  const shellWins = Math.min(nat(state?.['shell:stats:flags']?.wins), nat(state?.['shell:stats:flags']?.played));
  return points + Math.max(0, shellWins - counted) * FLAG_POINTS['test-10'];
}

const wins = (id, by) => ({ by, score: (s) => winPoints(s, id), text: POINTS });
const levels = (id, by, passed) => ({ by, score: (s) => levelsSum(passed(s), LEVEL_PRICES[id]), text: POINTS });

/** Новые меры (бета 'rating-points'); игры, которых тут нет, считаются как в BOARDS. */
export const BOARDS_V2 = {
  words: { by: 'очки за найденные слова (длиннее — дороже)', score: wordsPoints, text: POINTS },
  boggle: { by: 'очки за пройденные поля (больше поле — дороже)', score: bogglePoints, text: POINTS },
  wordle: wins('wordle', 'очки за угаданные слова'),
  rubik: wins('rubik', 'очки за собранные кубики'),
  fifteen: wins('fifteen', 'очки за собранные поля (больше поле — дороже)'),
  hanoi: wins('hanoi', 'очки за собранные башни (больше дисков — дороже)'),
  nonogram: { by: 'очки за решённые картинки (больше — дороже)', score: nonogramPoints, text: POINTS },
  minesweeper: wins('minesweeper', 'очки за разминированные поля (сложнее — дороже)'),
  'killer-sudoku': wins('killer-sudoku', 'очки за решённые судоку (сложнее — дороже)'),
  sudoku: wins('sudoku', 'очки за решённые судоку (сложнее — дороже)'),
  match3: { by: 'очки за пройденные уровни (дальше — дороже)', score: match3Points, text: POINTS },
  loop: levels('loop', 'очки за пройденные уровни', (s) => menuPassed(s, 'loop')),
  'connect-dots': levels('connect-dots', 'очки за пройденные уровни', connectDotsPassed),
  mahjong: wins('mahjong', 'очки за разобранные раскладки (больше плиток — дороже)'),
  klondike: wins('klondike', 'очки за разложенные пасьянсы (по три карты — дороже)'),
  spider: wins('spider', 'очки за разложенные пасьянсы (больше мастей — дороже)'),
  memory: { by: 'очки за уровни («Жизни» и «На время» — дороже)', score: memoryPoints, text: POINTS },
  snake: { by: 'рекорд в классике + очки за уровни', score: snakePoints, text: POINTS },
  'bubble-shooter': levels('bubble-shooter', 'очки за пройденные уровни', (s) => menuPassed(s, 'bubble-shooter')),
  'brick-blast': levels('brick-blast', 'очки за пройденные уровни', (s) => menuPassed(s, 'brick-blast')),
  go: wins('go', 'очки за победы над ботом (сильнее бот и больше доска — дороже)'),
  chess: wins('chess', 'очки за победы над ботом (сильнее — дороже)'),
  checkers: wins('checkers', 'очки за победы над ботом (сильнее — дороже)'),
  tictactoe: wins('tictactoe', 'очки за победы над ботом (гомоку и сильный бот — дороже)'),
  flags: { by: 'очки за партии (ввод и 20 флагов — дороже) + рекорд марафона', score: flagsPoints, text: POINTS },
};

export const POINTS_PREFIX = 'pts:';

/**
 * Версия подсчёта рейтинга: игроки с меньшей (board_players.ver) пересчитываются из сохранённого прогресса при
 * просмотре рейтинга (backfillBoard). Поднять, когда меняются меры, — иначе у тех, кто давно не заходил, останутся
 * старые числа (2026-10-06: новые очки появились только у тех, кто сохранился после обновления, — у владельца
 * в бете таблицы были пустыми). 2 — очки «pts:».
 */
export const BOARD_VERSION = 2;
const MAX_POINTS = 1e8;   // больше — явно испорченные данные

/** Очки по новым мерам: { 'pts:<игра>': целое > 0 } (пишутся в board_scores рядом со старыми). */
export function boardPoints(state) {
  const out = {};
  for (const [id, board] of Object.entries(BOARDS_V2)) {
    let value;
    try {
      value = board.score(state);
    } catch {
      value = null;
    }
    if (Number.isInteger(value) && value > 0 && value <= MAX_POINTS) out[POINTS_PREFIX + id] = value;
  }
  return out;
}

/**
 * Строки рейтинга для смотрящего: с новыми очками — «pts:<игра>» вместо старых строк этих игр, без них — только
 * старые. rows — из RANKED (места уже посчитаны внутри каждого game_id).
 */
export function pointsView(rows, on) {
  if (!on) return rows.filter((r) => !r.game_id.startsWith(POINTS_PREFIX));
  return rows.flatMap((r) => {
    if (r.game_id.startsWith(POINTS_PREFIX)) return [{ ...r, game_id: r.game_id.slice(POINTS_PREFIX.length) }];
    return BOARDS_V2[r.game_id] ? [] : [r];
  });
}

/** Мера игры для смотрящего: новые очки или прежняя. */
export const boardFor = (id, on) => (on && BOARDS_V2[id]) || BOARDS[id];

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
 * Подсказки поиска: игроки, у кого имя (любое его слово) начинается с набранного, или @ник совпал ЦЕЛИКОМ.
 * @ник нигде не показывается и по его началу не ищется (владелец, 2026-09-27: «НЕ ПАЛИ @ ИГРОКА») — иначе ник можно
 * было бы подобрать по буквам. Имя — то, что видно в рейтинге (без фамилии: по ней искать нельзя). Порядок: ник или
 * имя совпали целиком, потом начало имени; внутри — кто заходил недавно. candidates: [{ id, name, username, seen }].
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
    else if (name.startsWith(q) || name.split(' ').some((w) => w.startsWith(q))) rank = 1;
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
