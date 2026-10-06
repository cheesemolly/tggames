// Игра с другом по сети (в бете 'chess-online') — то, что оболочка даёт игре как api.online.
//
// Сервер (server/worker.js, «комнаты») постоянных соединений не держит, поэтому приложение само спрашивает комнату,
// пока ждёт соперника: первый раз через 10 секунд, потом раз в 8–15, чем дольше ждём — тем реже, а через 10 минут
// опрос останавливается (дальше — кнопка «проверить» или возвращение в приложение). На своём ходу опроса нет.
// Свернули приложение — опроса нет, вернулись — сразу один запрос. Так на ход уходит 3–4 запроса (отправить и
// несколько раз спросить); меньше двух не бывает. Бот о ходах не пишет (решение владельца): игрок узнаёт о ходе,
// когда открывает игру.
// Правила игры сервер не проверяет: ход, присланный соперником, проверяет сама игра.

import { BOT_USERNAME } from './config.js';

/** Игры, где есть партии по сети (как ROOM_GAMES в server/lib.js — тест сверяет); функция беты — «<игра>-online». */
export const ONLINE_GAMES = ['chess'];
export const onlineFeature = (gameId) => `${gameId}-online`;

export const ROOM_CODE_RE = /^[a-z0-9]{10}$/;
const PARAM_RE = /^([a-z0-9][a-z0-9-]{0,39})_([a-z0-9]{10})$/;

/** Параметр запуска из ссылки-приглашения («chess_k3f9x2ab1c») → { game, code }; не приглашение — null. */
export function parseRoomParam(param) {
  const m = typeof param === 'string' ? param.match(PARAM_RE) : null;
  return m ? { game: m[1], code: m[2] } : null;
}

/** Ссылка-приглашение: открывает мини-приложение бота сразу в этой партии. */
export const roomLink = (gameId, code, bot = BOT_USERNAME) => `https://t.me/${bot}?startapp=${gameId}_${code}`;

// ---------- опрос ----------

/**
 * Паузы между опросами, пока ждём соперника (секунды); последняя повторяется. Первый раз спрашиваем не сразу:
 * сопернику ещё нужно узнать о нашем ходе и подумать — ранний запрос почти всегда впустую. Подобрано замером на
 * партиях через настоящий сервер (shell/tests/online.test.js): 110–130 запросов на 10 минут обычной игры (3–3,5 на
 * ход), ход виден сопернику в среднем через 4–5 с, в девяти случаях из десяти — не позже 8, самое большее — 15
 * (когда он думал дольше полуминуты). Чаще — быстрее, но дороже: 8, 6, 6, 8, 8, 10, 10, 12, 15 — это 3–3,5 с и
 * 130–150 запросов; реже — 15 — это 7 с и 83–92.
 */
export const POLL_STEPS = [10, 8, 8, 10, 12, 15];
/** Пока ждём друга по ссылке — чаще: это один раз за партию, а пришедший сразу видит, что его заметили. */
export const LOBBY_STEPS = [5, 5, 5, 5, 5, 5, 6, 8, 10, 12, 15];
export const POLL_SLOW_AFTER_MS = 3 * 60 * 1000;      // ждём дольше — раз в полминуты
export const POLL_SLOW_MS = 30 * 1000;
export const POLL_STOP_AFTER_MS = 10 * 60 * 1000;     // ещё дольше — опрос останавливается: дальше — «проверить»
/** Паузы между повторами отправки хода, когда нет связи (секунды); последняя повторяется. */
export const RETRY_STEPS = [2, 4, 8, 15, 30];
const OFFLINE_AFTER = 2;                               // столько опросов подряд без ответа — «нет связи»

/**
 * Через сколько мс спросить снова: waitedMs — сколько уже ждём, polls — сколько раз спросили за это ожидание,
 * lobby — ждём второго игрока, а не хода. null — хватит ждать.
 */
export function pollDelay(waitedMs, polls, lobby = false) {
  if (waitedMs >= POLL_STOP_AFTER_MS) return null;
  if (waitedMs >= POLL_SLOW_AFTER_MS) return POLL_SLOW_MS;
  const steps = lobby ? LOBBY_STEPS : POLL_STEPS;
  return steps[Math.min(polls, steps.length - 1)] * 1000;
}

/** Ждём ли соперника: второго игрока или его хода. Пока ждём — комната опрашивается. */
export const awaiting = (room) => room.status === 'wait' || (room.status === 'play' && room.turn !== room.you);

/**
 * Открытая партия: держит последнее известное состояние комнаты и сама опрашивает сервер, пока ждём соперника.
 *   request(tail, { method, payload }) — запрос к /rooms<tail> (platform/account.js roomRequest);
 *   onRoom(room, was) — комната изменилась (пришёл соперник, его ход, он сдался);
 *   onGone(error)     — комнаты больше нет (приглашение отменено, партия удалена) — опрос прекращён;
 *   onState(state)    — 'idle' — ждать нечего (свой ход, конец) · 'live' — опрашиваем · 'paused' — ждём давно,
 *                       опрос остановлен (check() — спросить ещё раз) · 'offline' — сервер не отвечает, повторяем.
 * Возвращает { room, state, move(text, over?), resign(), check(), close() }. move и resign сами повторяют отправку,
 * пока нет связи, и отвечают { ok, room? , error? }: при отказе сервера с комнатой (409 — состояние уже другое)
 * комната в ответе — та, что на сервере, по ней игра перерисовывается.
 */
export function openRoom(room, {
  request, onRoom = () => {}, onGone = () => {}, onState = () => {},
  doc = globalThis.document, schedule = setTimeout, cancel = clearTimeout, now = Date.now,
}) {
  let current = room;
  let closed = false;
  let timer = null;
  let polls = 0;            // сколько раз спросили за это ожидание
  let since = now();        // когда начали ждать
  let asking = null;        // идущий опрос
  let fails = 0;            // опросов подряд без ответа
  let sending = 0;          // отправок (ход, сдача) в пути
  let offline = false;      // отправка не проходит — повторяем
  let wake = null;          // разбудить повтор отправки раньше срока (вернулись в приложение, закрыли партию)
  let state = null;         // до конца открытия обработчики не зовутся: состояние — в session.state
  const path = `/${room.code}`;
  const hidden = () => doc?.visibilityState === 'hidden';
  const delayNow = () => pollDelay(now() - since, polls, current.status === 'wait');

  function stateNow() {
    if (offline) return 'offline';
    if (!awaiting(current)) return 'idle';
    if (delayNow() == null) return 'paused';
    return fails >= OFFLINE_AFTER ? 'offline' : 'live';
  }

  function report() {
    const next = stateNow();
    if (next === state) return;
    state = next;
    onState(next);
  }

  /** Следующий опрос по расписанию (или остановка: свой ход, конец партии, ждём слишком долго). */
  function plan() {
    cancel(timer);
    timer = null;
    if (closed) return;
    if (awaiting(current) && !hidden()) {
      const delay = delayNow();
      // последний таймер — не опрос, а «хватит ждать»: ровно через POLL_STOP_AFTER_MS состояние станет 'paused'
      if (delay != null) timer = schedule(tick, Math.min(delay, POLL_STOP_AFTER_MS - (now() - since)));
    }
    report();
  }

  function tick() {
    timer = null;
    if (delayNow() == null) report();
    else ask();
  }

  function adopt(next) {
    const was = current;
    current = next;
    // новое ожидание (сделал ход, пришёл второй игрок) — расписание с начала
    if (next.seq !== was.seq || awaiting(next) !== awaiting(was)) {
      since = now();
      polls = 0;
    }
    fails = 0;
    plan();
    return was;
  }

  async function ask() {
    cancel(timer);
    timer = null;
    if (closed || asking || sending) return;
    const { seq } = current;
    asking = request(`${path}?seq=${seq}`);
    const res = await asking;
    asking = null;
    if (closed || current.seq !== seq) return;        // пока спрашивали, комната сменилась (пришёл ответ на ход)
    polls += 1;
    if (res.ok && res.data?.room) {
      const was = adopt(res.data.room);
      onRoom(current, was);
      return;
    }
    if (!res.ok && (res.status === 404 || res.status === 403)) {
      close();
      onGone(res.error);
      return;
    }
    fails = res.ok ? 0 : fails + 1;                    // «ничего нового» или нет связи — дальше по расписанию
    plan();
  }

  const pause = (ms) => new Promise((resolve) => {
    const id = schedule(() => {
      wake = null;
      resolve();
    }, ms);
    wake = () => {
      cancel(id);
      wake = null;
      resolve();
    };
  });

  /** Отправка с повторами, пока нет связи: ход не должен потеряться из-за моргнувшей сети. */
  async function send(tail, payload) {
    sending += 1;
    cancel(timer);
    timer = null;
    try {
      for (let attempt = 0; ; attempt += 1) {
        const res = await request(`${path}${tail}`, { method: 'POST', payload });
        if (closed) return { ok: false, error: 'closed' };
        const again = !res.ok && (res.error === 'network' || res.error === 'too_many' || (res.status ?? 0) >= 500);
        if (!again) {
          offline = false;
          return res;
        }
        offline = true;
        report();
        await pause(RETRY_STEPS[Math.min(attempt, RETRY_STEPS.length - 1)] * 1000);
        if (closed) return { ok: false, error: 'closed' };
      }
    } finally {
      sending -= 1;
    }
  }

  /** Ответ на отправку: комната из ответа (и при отказе 409 тоже) становится текущей. */
  function settle(res) {
    const fresh = res.data?.room ?? null;
    const gone = Boolean(res.ok && res.data?.gone);       // своё приглашение отменено — комнаты больше нет
    if (gone) close();
    else if (fresh && !closed) adopt(fresh);
    else if (!closed) plan();
    return res.ok ? { ok: true, room: fresh, gone } : { ok: false, error: res.error, room: fresh };
  }

  function onVisibility() {
    if (closed) return;
    if (hidden()) {
      cancel(timer);
      timer = null;
      return;
    }
    wake?.();
    check();
  }

  /** Спросить сейчас (вернулись в приложение, кнопка «Проверить»): и на своём ходу — вдруг соперник сдался. */
  function check() {
    if (closed) return;
    since = now();
    polls = 0;
    ask();
  }

  function close() {
    if (closed) return;
    closed = true;
    cancel(timer);
    timer = null;
    wake?.();
    doc?.removeEventListener?.('visibilitychange', onVisibility);
  }

  doc?.addEventListener?.('visibilitychange', onVisibility);
  state = stateNow();
  plan();

  return {
    get room() { return current; },
    get state() { return state; },
    /** Сделать ход; over — чем партия этим ходом кончилась (как в ROOM_GAMES на сервере) или ничего. */
    async move(text, over = null) {
      const payload = { seq: current.seq, move: text };
      if (over) payload.over = over;
      return settle(await send('/move', payload));
    },
    async resign() {
      return settle(await send('/resign', null));
    },
    check,
    close,
  };
}

// ---------- api.online ----------

/**
 * Доступ игры к партиям по сети. account — platform/account.js, platform — адаптер Telegram, gameId — чья это игра,
 * takeInvite() — код комнаты из ссылки-приглашения, если приложение открыли по ней (отдаётся один раз).
 */
export function createOnline({ account, platform, gameId, takeInvite = () => null }) {
  const request = (tail, opts) => account.roomRequest(tail, opts);
  const known = (code) => ROOM_CODE_RE.test(String(code));
  // комната другой игры (чужая ссылка) — как будто её нет
  const unwrap = (res) => {
    if (!res.ok) return { ok: false, error: res.error };
    return res.data?.room?.game === gameId ? { ok: true, room: res.data.room } : { ok: false, error: 'no_room' };
  };
  const missing = async () => ({ ok: false, error: 'no_room' });

  return {
    takeInvite,
    /** Новое приглашение. first — кто ходит первым: 'me' | 'them' | 'random'. */
    create: async ({ first = 'random' } = {}) => unwrap(await request('', { method: 'POST', payload: { game: gameId, first } })),
    /** Войти в партию по коду из ссылки (участнику — просто получить её). */
    join: async (code) => (known(code) ? unwrap(await request(`/${code}/join`, { method: 'POST' })) : missing()),
    /** Состояние своей партии — вернуться в начатую. */
    load: async (code) => (known(code) ? unwrap(await request(`/${code}`)) : missing()),
    open: (room, handlers = {}) => openRoom(room, { request, ...handlers }),
    link: (code) => roomLink(gameId, code),
    /** Окно Telegram «переслать»: ссылка с подписью уходит в выбранный чат. */
    share(code, text) {
      const url = `https://t.me/share/url?url=${encodeURIComponent(roomLink(gameId, code))}&text=${encodeURIComponent(text)}`;
      platform.openTelegramLink(url);
    },
    async copy(code) {
      try {
        await navigator.clipboard.writeText(roomLink(gameId, code));
        return true;
      } catch {
        return false;
      }
    },
  };
}
