// Партии с другом по сети со стороны приложения (shell/online.js): ссылка-приглашение, расписание опроса, повторы
// отправки хода — и целая партия двух приложений через настоящий обработчик сервера с подсчётом запросов.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ONLINE_GAMES, onlineFeature, ROOM_CODE_RE, parseRoomParam, roomLink, pollDelay, awaiting, openRoom, createOnline,
  POLL_STEPS, LOBBY_STEPS, POLL_SLOW_AFTER_MS, POLL_SLOW_MS, POLL_STOP_AFTER_MS, RETRY_STEPS,
} from '../online.js';
import { BOT_USERNAME } from '../config.js';
import { inBeta } from '../beta.js';
import worker from '../../server/worker.js';
import * as lib from '../../server/lib.js';
import { makeInitData, createEnv, captureTelegram, TOKEN } from '../../server/tests/helpers.js';

const flush = async () => {
  for (let i = 0; i < 40; i += 1) await Promise.resolve();
};

/** Часы и таймеры под управлением теста; idle() — дождаться, пока улягутся запросы после сработавшего таймера. */
function fakeClock(start = 0, idle = flush) {
  let t = start;
  let ids = 0;
  const timers = new Map();
  return {
    now: () => t,
    schedule(fn, ms) {
      ids += 1;
      timers.set(ids, { at: t + ms, fn });
      return ids;
    },
    cancel: (id) => timers.delete(id),
    get pending() { return timers.size; },
    /** Прокрутить время на ms, выполняя таймеры по порядку (и те, что они заведут). */
    async advance(ms) {
      const end = t + ms;
      for (;;) {
        let next = null;
        for (const [id, timer] of timers) {
          if (timer.at <= end && (!next || timer.at < next.timer.at)) next = { id, timer };
        }
        if (!next) break;
        timers.delete(next.id);
        t = next.timer.at;
        next.timer.fn();
        await idle();
      }
      t = end;
      await idle();
    },
  };
}

function fakeDoc() {
  const listeners = new Set();
  return {
    visibilityState: 'visible',
    addEventListener: (type, fn) => type === 'visibilitychange' && listeners.add(fn),
    removeEventListener: (type, fn) => listeners.delete(fn),
    set(state) {
      this.visibilityState = state;
      listeners.forEach((fn) => fn());
    },
    get listeners() { return listeners.size; },
  };
}

const roomOf = (extra = {}) => ({
  code: 'abcdefghij', game: 'chess', status: 'play', seq: 2, you: 0, first: 0, turn: 1, moves: [],
  players: [{ name: 'Маша' }, { name: 'Петя' }], result: null, at: 0, ...extra,
});
const same = { ok: true, data: { same: true } };

/** Партия с подставным сервером: reply(tail, opts) решает, что ответить; все запросы — в calls. */
function scripted(room, reply = () => same) {
  const clock = fakeClock();
  const doc = fakeDoc();
  const calls = [];
  const events = [];
  const session = openRoom(room, {
    request: async (tail, opts = {}) => {
      calls.push({ at: clock.now(), tail, ...opts });
      return reply(tail, opts, calls.length);
    },
    onRoom: (next, was) => events.push({ room: next, was }),
    onGone: (error) => events.push({ gone: error }),
    onState: (state) => events.push({ state }),
    doc,
    schedule: clock.schedule,
    cancel: clock.cancel,
    now: clock.now,
  });
  return { clock, doc, calls, events, session };
}

test('ссылка-приглашение: приложение разбирает то, что собирает сервер', () => {
  assert.deepEqual(parseRoomParam(lib.roomParam('chess', 'k3f9x2ab1c')), { game: 'chess', code: 'k3f9x2ab1c' });
  assert.deepEqual(parseRoomParam('killer-sudoku_0000000000'), { game: 'killer-sudoku', code: '0000000000' }, 'id игры с дефисом');
  for (const junk of [null, undefined, '', 'chess', 'sudoku', 'chess_', 'chess_short', 'chess_ABCDEFGHIJ', 'chess_abcdefghijk', '_abcdefghij', '../x_abcdefghij', 'chess_abc/efghij']) {
    assert.equal(parseRoomParam(junk), null, String(junk));
  }
  assert.equal(roomLink('chess', 'k3f9x2ab1c'), `https://t.me/${BOT_USERNAME}?startapp=chess_k3f9x2ab1c`);
  assert.equal(ROOM_CODE_RE.source, lib.ROOM_CODE_RE.source, 'код комнаты — один и тот же вид на сервере и в приложении');
});

test('игры с комнатами в приложении и на сервере — одни и те же; функция беты — «<игра>-online»', () => {
  assert.deepEqual([...ONLINE_GAMES].sort(), Object.keys(lib.ROOM_GAMES).sort());
  for (const id of ONLINE_GAMES) {
    assert.equal(onlineFeature(id), lib.ROOM_GAMES[id].beta);
    // пока функция в бете у приложения — она в бете и на сервере, и наоборот (иначе игрок увидит кнопку, а сервер откажет)
    assert.equal(lib.SERVER_BETA.includes(lib.ROOM_GAMES[id].beta), inBeta(onlineFeature(id)), id);
  }
});

test('расписание опроса: первый раз через 10 с, дальше раз в 8–15 с, через 3 минуты — раз в 30 с, через 10 — стоп', () => {
  assert.deepEqual(POLL_STEPS, [10, 8, 8, 10, 12, 15]);
  assert.equal(pollDelay(0, 0), 10000);
  assert.equal(pollDelay(10000, 1), 8000);
  assert.equal(pollDelay(60000, 99), 15000, 'последняя пауза повторяется');
  assert.equal(pollDelay(POLL_SLOW_AFTER_MS, 3), POLL_SLOW_MS);
  assert.equal(pollDelay(POLL_STOP_AFTER_MS, 3), null);
  // ждём друга по ссылке — чаще, но тоже затухает и останавливается
  assert.equal(pollDelay(0, 0, true), 5000);
  assert.equal(pollDelay(60000, 99, true), LOBBY_STEPS.at(-1) * 1000);
  assert.equal(pollDelay(POLL_STOP_AFTER_MS, 3, true), null);
  for (const steps of [POLL_STEPS, LOBBY_STEPS]) assert.ok(Math.min(...steps) >= 5, 'чаще раза в 5 с не спрашиваем');
  // игрок, который ещё опрашивает партию, для сервера «в игре»: бот ему о ходе не пишет
  assert.ok(POLL_SLOW_MS + lib.ROOM_SEEN_EVERY_MS < lib.ROOM_AWAY_MS);
});

test('кого ждём: второго игрока или хода соперника', () => {
  assert.equal(awaiting(roomOf({ status: 'wait', turn: null })), true);
  assert.equal(awaiting(roomOf({ turn: 1, you: 0 })), true);
  assert.equal(awaiting(roomOf({ turn: 0, you: 0 })), false, 'свой ход');
  assert.equal(awaiting(roomOf({ status: 'over', turn: null })), false);
});

test('пока ждём хода — опрос по расписанию; пришёл ход — игра узнаёт, на своём ходу опроса нет', async () => {
  const moved = roomOf({ seq: 3, turn: 0, moves: ['e7e5'] });
  const { clock, calls, events, session } = scripted(roomOf(), (tail, opts, n) => (n < 4 ? same : { ok: true, data: { room: moved } }));
  assert.equal(session.state, 'live');
  await clock.advance(9999);
  assert.equal(calls.length, 0);
  await clock.advance(1);
  assert.deepEqual(calls.map((c) => c.tail), ['/abcdefghij?seq=2']);
  await clock.advance(26000);
  assert.deepEqual(calls.map((c) => c.at), [10000, 18000, 26000, 36000]);
  assert.equal(session.room.seq, 3);
  assert.deepEqual(events.filter((e) => e.room).map((e) => [e.room.seq, e.was.seq]), [[3, 2]]);
  assert.equal(session.state, 'idle', 'свой ход — ждать нечего');
  await clock.advance(30 * 60 * 1000);
  assert.equal(calls.length, 4, 'на своём ходу — ни одного запроса');
  session.close();
});

test('соперник думает долго: опрос редеет и через 10 минут останавливается; «Проверить» запускает снова', async () => {
  const { clock, calls, events, session } = scripted(roomOf());
  await clock.advance(60 * 1000);
  assert.equal(calls.length, 5, 'за первую минуту');
  await clock.advance(2 * 60 * 1000);
  assert.equal(calls.length, 13, 'за три минуты');
  await clock.advance(7 * 60 * 1000);
  assert.equal(calls.length, 27, 'за десять минут');
  assert.equal(session.state, 'paused');
  assert.deepEqual(events.filter((e) => e.state).map((e) => e.state), ['paused'], 'при открытии обработчики не зовутся');
  await clock.advance(60 * 60 * 1000);
  assert.equal(calls.length, 27, 'дальше — тишина: о ходе напишет бот');
  assert.equal(clock.pending, 0);

  session.check();
  await flush();
  assert.equal(calls.length, 28);
  assert.equal(session.state, 'live');
  await clock.advance(10000);
  assert.equal(calls.length, 29, 'расписание — с начала');
  session.close();
});

test('приложение свёрнуто — опроса нет; вернулись — один запрос сразу, даже на своём ходу', async () => {
  const { clock, doc, calls, session } = scripted(roomOf());
  await clock.advance(10000);
  assert.equal(calls.length, 1);
  doc.set('hidden');
  await clock.advance(5 * 60 * 1000);
  assert.equal(calls.length, 1, 'свёрнуто — молчим');
  doc.set('visible');
  await flush();
  assert.equal(calls.length, 2, 'вернулись — спросили сразу');
  await clock.advance(10000);
  assert.equal(calls.length, 3);
  session.close();
  assert.equal(doc.listeners, 0);

  // свой ход: опроса нет, но при возврате — один запрос (вдруг соперник сдался)
  const resigned = roomOf({ seq: 9, status: 'over', turn: null, result: { by: 'resign', winner: 0 } });
  const mine = scripted(roomOf({ turn: 0 }), () => ({ ok: true, data: { room: resigned } }));
  await mine.clock.advance(10 * 60 * 1000);
  assert.equal(mine.calls.length, 0);
  mine.doc.set('hidden');
  mine.doc.set('visible');
  await flush();
  assert.equal(mine.calls.length, 1);
  assert.equal(mine.session.room.status, 'over');
  assert.equal(mine.events.filter((e) => e.room).length, 1);
  await mine.clock.advance(10 * 60 * 1000);
  assert.equal(mine.calls.length, 1, 'партия окончена — больше не спрашиваем');
  mine.session.close();
});

test('комнаты больше нет — опрос прекращается; нет связи — «нет связи» и опрос продолжается', async () => {
  // ждём друга по ссылке — первый опрос уже через 5 с
  const gone = scripted(roomOf({ status: 'wait', turn: null }), () => ({ ok: false, error: 'no_room', status: 404, data: {} }));
  await gone.clock.advance(5000);
  assert.deepEqual(gone.events.filter((e) => 'gone' in e), [{ gone: 'no_room' }]);
  await gone.clock.advance(60 * 1000);
  assert.equal(gone.calls.length, 1);

  let down = true;
  const net = scripted(roomOf(), () => (down ? { ok: false, error: 'network' } : same));
  await net.clock.advance(10000);
  assert.equal(net.session.state, 'live', 'один сбой — ещё не повод');
  await net.clock.advance(8000);
  assert.equal(net.session.state, 'offline');
  down = false;
  await net.clock.advance(8000);
  assert.equal(net.session.state, 'live');
  assert.equal(net.calls.length, 3);
  net.session.close();
});

test('ход: уходит с номером состояния, после ответа начинается ожидание; отказ сервера отдаёт его комнату', async () => {
  const afterMove = roomOf({ seq: 3, turn: 1, moves: ['e2e4'] });
  const ok = scripted(roomOf({ turn: 0 }), (tail) => (tail.endsWith('/move') ? { ok: true, data: { room: afterMove } } : same));
  const res = await ok.session.move('e2e4');
  assert.deepEqual(res, { ok: true, room: afterMove, gone: false });
  assert.deepEqual(ok.calls[0], { at: 0, tail: '/abcdefghij/move', method: 'POST', payload: { seq: 2, move: 'e2e4' } });
  assert.equal(ok.session.state, 'live');
  assert.equal(ok.events.filter((e) => e.room).length, 0, 'ответ на свой ход — не «комната изменилась»');
  await ok.clock.advance(10000);
  assert.equal(ok.calls[1].tail, '/abcdefghij?seq=3', 'опрос — уже с новым номером');
  ok.session.close();

  // конец партии своим ходом — причина уходит вместе с ходом
  const mate = scripted(roomOf({ turn: 0 }), () => ({ ok: true, data: { room: roomOf({ seq: 3, status: 'over', turn: null }) } }));
  await mate.session.move('d8h4', 'checkmate');
  assert.deepEqual(mate.calls[0].payload, { seq: 2, move: 'd8h4', over: 'checkmate' });
  assert.equal(mate.session.state, 'idle');

  // сервер ход не принял: соперник уже сдался
  const over = roomOf({ seq: 5, status: 'over', turn: null, result: { by: 'resign', winner: 0 } });
  const late = scripted(roomOf({ turn: 0 }), () => ({ ok: false, error: 'not_playing', status: 409, data: { error: 'not_playing', room: over } }));
  assert.deepEqual(await late.session.move('e2e4'), { ok: false, error: 'not_playing', room: over });
  assert.equal(late.session.room.seq, 5);
  await late.clock.advance(60 * 1000);
  assert.equal(late.calls.length, 1);
});

test('ход без связи не теряется: отправка повторяется, пока не дойдёт', async () => {
  const afterMove = roomOf({ seq: 3, turn: 1, moves: ['e2e4'] });
  let fails = 3;
  const { clock, doc, calls, events, session } = scripted(roomOf({ turn: 0 }), (tail) => {
    if (!tail.endsWith('/move')) return same;
    fails -= 1;
    return fails >= 0 ? { ok: false, error: 'network' } : { ok: true, data: { room: afterMove } };
  });
  let done = null;
  session.move('e2e4').then((res) => { done = res; });
  await flush();
  assert.equal(calls.length, 1);
  assert.equal(session.state, 'offline');
  await clock.advance(RETRY_STEPS[0] * 1000);
  assert.equal(calls.length, 2);
  // вернулись в приложение — повтор сразу, не дожидаясь паузы
  doc.set('hidden');
  doc.set('visible');
  await flush();
  assert.equal(calls.filter((c) => c.tail.endsWith('/move')).length, 3);
  assert.equal(done, null);
  await clock.advance(RETRY_STEPS[2] * 1000);
  assert.deepEqual(done, { ok: true, room: afterMove, gone: false });
  assert.deepEqual(calls.filter((c) => c.tail.endsWith('/move')).map((c) => c.payload), Array(4).fill({ seq: 2, move: 'e2e4' }));
  assert.equal(session.state, 'live');
  assert.deepEqual(events.filter((e) => e.state).map((e) => e.state), ['offline', 'live']);
  session.close();

  // партию закрыли, пока ход не ушёл, — повторы прекращаются
  const stuck = scripted(roomOf({ turn: 0 }), () => ({ ok: false, error: 'network' }));
  let res = null;
  stuck.session.move('e2e4').then((r) => { res = r; });
  await flush();
  stuck.session.close();
  await flush();
  assert.deepEqual(res, { ok: false, error: 'closed', room: null });
  await stuck.clock.advance(60 * 1000);
  assert.equal(stuck.calls.length, 1);
});

test('своё приглашение отменено — комната закрыта, опроса больше нет', async () => {
  const { clock, calls, session } = scripted(roomOf({ status: 'wait', turn: null }), (tail) => (tail.endsWith('/resign') ? { ok: true, data: { gone: true } } : same));
  assert.deepEqual(await session.resign(), { ok: true, room: null, gone: true });
  await clock.advance(60 * 1000);
  assert.equal(calls.length, 1);
});

test('api.online: чужая игра и кривой код — как будто комнаты нет; «переслать» открывает окно Telegram', async () => {
  const requests = [];
  const opened = [];
  const account = {
    roomRequest: async (tail, opts = {}) => {
      requests.push({ tail, ...opts });
      return { ok: true, data: { room: roomOf({ game: tail.includes('zzzzzzzzzz') ? 'go' : 'chess' }) } };
    },
  };
  let invite = 'abcdefghij';
  const online = createOnline({
    account,
    platform: { openTelegramLink: (url) => opened.push(url) },
    gameId: 'chess',
    takeInvite: () => {
      const code = invite;
      invite = null;
      return code;
    },
  });
  assert.equal(online.takeInvite(), 'abcdefghij');
  assert.equal(online.takeInvite(), null, 'приглашение отдаётся один раз');

  assert.equal((await online.create({ first: 'me' })).ok, true);
  assert.deepEqual(requests[0], { tail: '', method: 'POST', payload: { game: 'chess', first: 'me' } });
  assert.equal((await online.join('abcdefghij')).ok, true);
  assert.deepEqual(requests[1], { tail: '/abcdefghij/join', method: 'POST' });
  assert.deepEqual(await online.join('zzzzzzzzzz'), { ok: false, error: 'no_room' }, 'комната другой игры');
  for (const bad of ['', '../admin', 'ABCDEFGHIJ', 'abc', null]) {
    assert.deepEqual(await online.load(bad), { ok: false, error: 'no_room' });
    assert.deepEqual(await online.join(bad), { ok: false, error: 'no_room' });
  }
  assert.equal(requests.length, 3, 'с кривым кодом на сервер не ходим');

  assert.equal(online.link('abcdefghij'), `https://t.me/${BOT_USERNAME}?startapp=chess_abcdefghij`);
  online.share('abcdefghij', 'Сыграем в шахматы?');
  const shared = new URL(opened[0]);
  assert.equal(shared.origin + shared.pathname, 'https://t.me/share/url');
  assert.equal(shared.searchParams.get('url'), online.link('abcdefghij'));
  assert.equal(shared.searchParams.get('text'), 'Сыграем в шахматы?');
});

// ---------- целая партия через настоящий сервер ----------

/** Игрок: запросы приложения к настоящему обработчику (как platform/account.js roomRequest). */
async function client(env, user, clock, counter) {
  const initData = await makeInitData(TOKEN, user, { authDate: clock.now() });
  const request = async (tail, { method = 'GET', payload = null } = {}) => {
    counter.total += 1;
    counter[method === 'GET' ? 'polls' : 'posts'] += 1;
    counter.flying += 1;
    try {
      const headers = { Origin: 'https://cheesemolly.github.io', Authorization: `tma ${initData}` };
      if (payload) headers['Content-Type'] = 'application/json';
      const res = await worker.fetch(new Request(`https://api.test/rooms${tail}`, {
        method, headers, body: payload ? JSON.stringify(payload) : undefined,
      }), env);
      const data = await res.json();
      return res.ok ? { ok: true, data } : { ok: false, error: data.error ?? 'server', status: res.status, data };
    } finally {
      counter.flying -= 1;
    }
  };
  return { user, doc: fakeDoc(), online: createOnline({ account: { roomRequest: request }, platform: {}, gameId: 'chess' }) };
}

/**
 * Партия двух приложений через настоящий сервер: каждый думает над ходом thinks[k] секунд (по кругу), всего plies
 * ходов; afterMove(игрок, сколько ходов сделано) — что игрок делает после своего хода (например, сворачивает
 * приложение). → { counter, minutes, notes, lags, lag } — запросы, длительность, сообщения бота, через сколько
 * секунд ход появился у соперника.
 */
async function playGame({ plies, thinks, afterMove = () => {}, tail = 60 }) {
  const realNow = Date.now;
  const counter = { total: 0, polls: 0, posts: 0, flying: 0 };
  // сервер проверяет подпись Telegram не мгновенно — тестовые часы ждут, пока запросы долетят
  const clock = fakeClock(realNow(), async () => {
    do {
      await new Promise((resolve) => { setImmediate(resolve); });
      await flush();
    } while (counter.flying);
  });
  Date.now = clock.now;                      // сервер живёт по тем же часам: «смотрит партию», частота опросов
  const tg = captureTelegram();
  const was = [...lib.SERVER_BETA];
  lib.SERVER_BETA.splice(0, lib.SERVER_BETA.length);
  try {
    const env = createEnv();
    const base = 700000 + Math.floor(Math.random() * 100000);
    const host = await client(env, { id: base, first_name: 'Маша' }, clock, counter);
    const guest = await client(env, { id: base + 1, first_name: 'Петя' }, clock, counter);
    const lags = [];
    let sentAt = 0;
    let made = 0;
    let firstAt = 0;

    /** Мой ход — подумать и походить (один раз на состояние комнаты). */
    const think = (who) => {
      const { room } = who.session;
      if (made >= plies || room.status !== 'play' || room.turn !== room.you || who.planned === room.seq) return;
      who.planned = room.seq;
      clock.schedule(async () => {
        const last = made + 1 === plies;
        sentAt = clock.now();
        if (!made) firstAt = sentAt;
        const res = await who.session.move(made % 2 ? 'e7e5' : 'e2e4', last ? 'stalemate' : null);
        assert.equal(res.ok, true, res.error);
        made += 1;
        afterMove(who, made);
      }, thinks[made % thinks.length] * 1000);
    };
    const attach = (who, room) => {
      who.session = who.online.open(room, {
        doc: who.doc,
        schedule: clock.schedule,
        cancel: clock.cancel,
        now: clock.now,
        onRoom: (next, prev) => {
          if (next.moves.length > prev.moves.length) lags.push((clock.now() - sentAt) / 1000);
          think(who);
        },
      });
      think(who);
    };

    const created = await host.online.create({ first: 'me' });
    attach(host, created.room);
    await clock.advance(20 * 1000);                                    // друг открывает ссылку через 20 с
    const joined = await guest.online.join(created.room.code);
    attach(guest, joined.room);
    for (let minute = 0; made < plies && minute < 120; minute += 1) await clock.advance(60 * 1000);
    await clock.advance(tail * 1000);
    host.session.close();
    guest.session.close();
    const mean = lags.reduce((a, b) => a + b, 0) / (lags.length || 1);
    return {
      counter, notes: tg.calls, lags, made, host, guest,
      minutes: (sentAt - firstAt) / 60000,                 // от первого хода до последнего
      lag: { mean, max: Math.max(0, ...lags) },
    };
  } finally {
    Date.now = realNow;
    tg.restore();
    lib.SERVER_BETA.splice(0, lib.SERVER_BETA.length, ...was);
  }
}

test('целая партия через сервер: 110–130 запросов на 10 минут игры, ход виден сопернику за секунды, бот молчит', async () => {
  const thinks = [4, 7, 12, 3, 20, 9, 6, 15, 5, 30, 8, 11];          // думают в среднем 10,8 с на ход
  const { counter, notes, lags, lag, made, minutes } = await playGame({ plies: 60, thinks });
  assert.equal(made, 60);
  assert.equal(counter.posts, 62, 'приглашение, вход и 60 ходов');
  assert.equal(notes.length, 0, 'оба в игре — бот не пишет');
  assert.equal(lags.length, 60);
  const perTen = (counter.total / minutes) * 10;
  console.log(`  60 ходов за ${minutes.toFixed(1)} мин: ${counter.total} запросов (${counter.posts} — ходы и вход, ${counter.polls} — опрос), `
    + `на 10 минут — ${Math.round(perTen)}; ход виден сопернику в среднем через ${lag.mean.toFixed(1)} с, не позже ${lag.max.toFixed(1)} с`);
  assert.ok(perTen <= 135, `на 10 минут игры: ${Math.round(perTen)}`);
  assert.ok(counter.total <= 60 * 3.6, `на партию: ${counter.total} — не больше 3,6 запроса на ход`);
  assert.ok(counter.total >= 60 * 2, 'меньше двух на ход не бывает: отправить и узнать');
  assert.ok(lag.mean <= 5, `в среднем ${lag.mean.toFixed(1)} с`);
  assert.ok(lag.max <= 15, `не позже ${lag.max.toFixed(1)} с`);
});

test('быстрая и вдумчивая партии: запросов — по числу ходов, долгое обдумывание стоит немного', async () => {
  const blitz = await playGame({ plies: 40, thinks: [3, 4, 2, 5] });
  const slow = await playGame({ plies: 40, thinks: [45, 90, 30, 60] });
  console.log(`  40 ходов по 2–5 с: ${blitz.counter.total} запросов за ${blitz.minutes.toFixed(1)} мин, ход виден через ${blitz.lag.mean.toFixed(1)} с; `
    + `40 ходов по 30–90 с: ${slow.counter.total} за ${slow.minutes.toFixed(1)} мин, через ${slow.lag.mean.toFixed(1)} с`);
  assert.ok(blitz.counter.total <= 40 * 2.8, `быстрая: ${blitz.counter.total}`);
  assert.ok(blitz.lag.max <= 10, 'быстрый ответ виден первым же опросом');
  assert.ok(slow.counter.total <= 40 * 8, `вдумчивая: ${slow.counter.total}`);
  assert.ok((slow.counter.total / slow.minutes) * 10 <= 80, 'на 10 минут вдумчивой игры — меньше, чем обычной');
  assert.ok(slow.lag.max <= 15);
});

test('соперник свернул приложение: о ходе ему пишет бот, а ждущий опрашивает всё реже и замолкает', async () => {
  const { counter, notes, made, host, guest } = await playGame({
    plies: 6,
    thinks: [60],
    afterMove: (who, n) => {
      if (n === 4) who.doc.set('hidden');           // гость сделал 4-й ход и ушёл из приложения
    },
  });
  assert.equal(made, 5, 'шестого хода нет: гость не вернулся');
  // 5-й ход создательница сделала через минуту — гость к тому времени партию уже не смотрел
  assert.equal(notes.length, 1);
  assert.equal(notes[0].payload.chat_id, guest.user.id);
  assert.match(notes[0].payload.text, /Твоя очередь/);
  assert.equal(host.session.state, 'paused');
  // создательница ждёт 6-го хода: 27 опросов за 10 минут — и тишина, сколько бы ни прошло (в тесте — два часа)
  assert.ok(counter.polls <= 27 + 5 * 8 + 6, `опросов: ${counter.polls}`);
});
