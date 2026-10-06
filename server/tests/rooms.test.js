// Партии с другом по сети: настоящий worker.js поверх SQLite и подменённого Bot API. Сервер правил игры не знает —
// здесь проверяется то, за что он отвечает: кто участник, чья очередь, номер состояния, итог, сообщения бота, бета.

import test from 'node:test';
import assert from 'node:assert/strict';

import worker from '../worker.js';
import { ROOM_GAMES, ROOM_CODE_RE, ROOM_AWAY_MS, ROOM_SEEN_EVERY_MS, roomParam, roomSeat, roomTurn, roomView } from '../lib.js';
import { makeInitData, createEnv, captureTelegram, TOKEN, ADMIN } from './helpers.js';

const ORIGIN = 'https://cheesemolly.github.io';

async function call(env, path, { method = 'GET', payload, initData } = {}) {
  const headers = { Origin: ORIGIN };
  if (payload !== undefined) headers['Content-Type'] = 'application/json';
  if (initData) headers.Authorization = `tma ${initData}`;
  const res = await worker.fetch(new Request(`https://api.test${path}`, {
    method, headers, body: payload === undefined ? undefined : JSON.stringify(payload),
  }), env);
  return { status: res.status, data: await res.json() };
}

// частота приглашений и опросов считается по Telegram-id в памяти обработчика — у каждого теста свои игроки
let nextTgId = 5000;
const person = (firstName, extra = {}) => ({ id: nextTgId++, first_name: firstName, ...extra });

/** Игрок: его запросы к серверу с подписью Telegram. */
async function player(env, user) {
  const initData = await makeInitData(TOKEN, user);
  const send = (path, opts = {}) => call(env, path, { ...opts, initData });
  return {
    user,
    get: send,
    post: (path, payload = {}) => send(path, { method: 'POST', payload }),
  };
}

/** Комнаты открыты всем, как после релиза: настоящий список серверной беты на время теста пуст. */
async function released(fn) {
  const lib = await import('../lib.js');
  const was = [...lib.SERVER_BETA];
  lib.SERVER_BETA.splice(0, lib.SERVER_BETA.length);
  try {
    return await fn();
  } finally {
    lib.SERVER_BETA.splice(0, lib.SERVER_BETA.length, ...was);
  }
}

/** Двое в начатой партии: создатель ходит первым (в шахматах — белыми). */
async function started(env, first = 'me') {
  const host = await player(env, person('Маша', { last_name: 'Иванова', username: 'masha_secret' }));
  const guest = await player(env, person('Петя', { last_name: 'Сидоров', username: 'petya_secret' }));
  const made = await host.post('/rooms', { game: 'chess', first });
  assert.equal(made.status, 200);
  const { code } = made.data.room;
  const joined = await guest.post(`/rooms/${code}/join`);
  assert.equal(joined.status, 200);
  return { host, guest, code, room: joined.data.room };
}

test('правила комнаты: чья очередь, место игрока, что видит игрок', () => {
  const room = {
    code: 'abcdefghij', game: 'chess', host: 3, guest: 9, first: 1, moves: [], seq: 2, status: 'play', result: null,
    name0: 'Маша', name1: 'Петя', updated_at: 100, seen0: 1, seen1: 2,
  };
  assert.equal(roomSeat(room, 3), 0);
  assert.equal(roomSeat(room, 9), 1);
  assert.equal(roomSeat(room, 4), -1, 'посторонний');
  assert.equal(roomTurn(room), 1, 'первым ходит гость');
  assert.equal(roomTurn({ ...room, moves: ['e2e4'] }), 0);
  assert.equal(roomTurn({ ...room, status: 'wait' }), null);
  assert.equal(roomTurn({ ...room, status: 'over' }), null);

  const view = roomView(room, 1);
  assert.deepEqual(Object.keys(view).sort(), ['at', 'code', 'first', 'game', 'moves', 'players', 'result', 'seq', 'status', 'turn', 'you']);
  assert.deepEqual(view.players, [{ name: 'Маша' }, { name: 'Петя' }]);
  assert.equal(view.you, 1);
  assert.equal(roomView({ ...room, guest: null, status: 'wait' }, 0).players[1], null, 'второй игрок ещё не пришёл');

  const { move } = ROOM_GAMES.chess;
  for (const ok of ['e2e4', 'a7a8q', 'h2h1n', 'e1g1']) assert.ok(move.test(ok), ok);
  for (const bad of ['e2', 'e2e9', 'i2i4', 'e2-e4', 'e7e8k', 'E2E4', 'e2e4 ', 'e2e4q1']) assert.ok(!move.test(bad), bad);
  assert.equal(roomParam('chess', 'abcdefghij'), 'chess_abcdefghij');
});

test('партия с другом: приглашение, вход по ссылке, ходы по очереди, мат', () => released(async () => {
  const env = createEnv();
  const masha = await player(env, person('Маша', { last_name: 'Иванова', username: 'masha_secret' }));
  const petya = await player(env, person('Петя', { last_name: 'Сидоров' }));

  const made = await masha.post('/rooms', { game: 'chess', first: 'me' });
  assert.equal(made.status, 200);
  const { code } = made.data.room;
  assert.match(code, ROOM_CODE_RE);
  assert.equal(made.data.room.status, 'wait');
  assert.equal(made.data.room.you, 0);
  assert.equal(made.data.room.turn, null, 'пока второго нет — никто не ходит');
  assert.deepEqual(made.data.room.players, [{ name: 'Маша' }, null]);

  // создатель ждёт: «ничего нового» — одна короткая строка
  const waiting = await masha.get(`/rooms/${code}?seq=${made.data.room.seq}`);
  assert.deepEqual(waiting.data, { same: true });

  const joined = await petya.post(`/rooms/${code}/join`);
  assert.equal(joined.status, 200);
  assert.equal(joined.data.room.status, 'play');
  assert.equal(joined.data.room.you, 1);
  assert.equal(joined.data.room.first, 0);
  assert.equal(joined.data.room.turn, 0, 'первой ходит создатель');
  assert.deepEqual(joined.data.room.players, [{ name: 'Маша' }, { name: 'Петя' }], 'только имена — без фамилий и ников');
  assert.ok(!JSON.stringify(joined.data).includes('masha_secret'));

  // создатель узнаёт о госте опросом
  const seen = await masha.get(`/rooms/${code}?seq=${made.data.room.seq}`);
  assert.equal(seen.data.room.status, 'play');
  let seq = seen.data.room.seq;

  // «дурацкий мат»: f3 e5 g4 Qh4#
  const plies = [[masha, 'f2f3'], [petya, 'e7e5'], [masha, 'g2g4']];
  for (const [who, move] of plies) {
    const res = await who.post(`/rooms/${code}/move`, { seq, move });
    assert.equal(res.status, 200, move);
    assert.equal(res.data.room.seq, seq + 1);
    seq = res.data.room.seq;
  }
  const mate = await petya.post(`/rooms/${code}/move`, { seq, move: 'd8h4', over: 'checkmate' });
  assert.equal(mate.status, 200);
  assert.equal(mate.data.room.status, 'over');
  assert.deepEqual(mate.data.room.result, { by: 'checkmate', winner: 1 });
  assert.deepEqual(mate.data.room.moves, ['f2f3', 'e7e5', 'g2g4', 'd8h4']);
  assert.equal(mate.data.room.turn, null);

  // проигравшая узнаёт итог опросом; ходить после конца нельзя
  const final = await masha.get(`/rooms/${code}?seq=${seq}`);
  assert.equal(final.data.room.status, 'over');
  assert.equal(final.data.room.result.winner, 1);
  const late = await masha.post(`/rooms/${code}/move`, { seq: final.data.room.seq, move: 'e2e4' });
  assert.equal(late.status, 409);
  assert.equal(late.data.error, 'not_playing');
}));

test('ход: не в свою очередь, с устаревшим состоянием, не похожий на ход — не принимается', () => released(async () => {
  const env = createEnv();
  const { host, guest, code, room } = await started(env);

  const early = await guest.post(`/rooms/${code}/move`, { seq: room.seq, move: 'e7e5' });
  assert.equal(early.status, 409);
  assert.equal(early.data.error, 'not_your_turn');
  assert.equal(early.data.room.seq, room.seq, 'в ответе — комната как есть: приложение перерисуется по ней');

  const old = await host.post(`/rooms/${code}/move`, { seq: room.seq - 1, move: 'e2e4' });
  assert.equal(old.status, 409);
  assert.equal(old.data.error, 'stale');

  for (const move of ['e2', 'e2-e4', 'DROP TABLE', 42, null]) {
    const bad = await host.post(`/rooms/${code}/move`, { seq: room.seq, move });
    assert.equal(bad.status, 400, String(move));
    assert.equal(bad.data.error, 'bad_move');
  }
  const badEnd = await host.post(`/rooms/${code}/move`, { seq: room.seq, move: 'e2e4', over: 'i-win' });
  assert.equal(badEnd.status, 400, 'итог — только из известных');

  // ничья своим ходом (пат): победителя нет
  const first = await host.post(`/rooms/${code}/move`, { seq: room.seq, move: 'e2e4' });
  const draw = await guest.post(`/rooms/${code}/move`, { seq: first.data.room.seq, move: 'e7e5', over: 'stalemate' });
  assert.deepEqual(draw.data.room.result, { by: 'stalemate', winner: null });

  // один и тот же ход, отправленный повторно (ответ потерялся в сети): второй раз — 409 и комната с уже принятым ходом
  const again = await started(env);
  const sent = await again.host.post(`/rooms/${again.code}/move`, { seq: again.room.seq, move: 'd2d4' });
  const repeat = await again.host.post(`/rooms/${again.code}/move`, { seq: again.room.seq, move: 'd2d4' });
  assert.equal(sent.status, 200);
  assert.equal(repeat.status, 409);
  assert.deepEqual(repeat.data.room.moves, ['d2d4'], 'ход не удвоился');
}));

test('чужие в партию не попадают: третий игрок, незнакомый код', () => released(async () => {
  const env = createEnv();
  const { host, code, room } = await started(env);
  const kolya = await player(env, person('Коля'));

  assert.equal((await kolya.post(`/rooms/${code}/join`)).data.error, 'room_full');
  const peek = await kolya.get(`/rooms/${code}`);
  assert.equal(peek.status, 403);
  assert.equal(peek.data.error, 'not_member');
  assert.equal(peek.data.room, undefined, 'ходы чужой партии не отдаются');
  assert.equal((await kolya.post(`/rooms/${code}/move`, { seq: room.seq, move: 'e2e4' })).status, 403);
  assert.equal((await kolya.post(`/rooms/${code}/resign`)).status, 403);

  assert.equal((await host.get('/rooms/zzzzzzzzzz')).data.error, 'no_room');
  assert.equal((await host.post('/rooms/zzzzzzzzzz/join')).status, 404);
  assert.equal((await host.get('/rooms/КОД')).status, 404);
  assert.equal((await host.post('/rooms', { game: 'tetris' })).status, 404, 'игры без комнат');
  assert.equal((await call(env, `/rooms/${code}`)).status, 401, 'без подписи Telegram');

  // участник «входит» повторно (открыл ссылку ещё раз) — просто получает комнату
  const back = await host.post(`/rooms/${code}/join`);
  assert.equal(back.status, 200);
  assert.equal(back.data.room.you, 0);
}));

test('кто ходит первым: я, соперник или жребий', () => released(async () => {
  const env = createEnv();
  const mine = await started(env, 'me');
  assert.equal(mine.room.first, 0);
  const theirs = await started(env, 'them');
  assert.equal(theirs.room.first, 1);
  assert.equal(theirs.room.turn, 1, 'первым ходит гость');
  assert.equal((await theirs.host.post(`/rooms/${theirs.code}/move`, { seq: theirs.room.seq, move: 'e2e4' })).data.error, 'not_your_turn');
  assert.equal((await theirs.guest.post(`/rooms/${theirs.code}/move`, { seq: theirs.room.seq, move: 'e2e4' })).status, 200);

  const seen = new Set();
  for (let i = 0; i < 5; i += 1) seen.add((await started(env, 'random')).room.first);
  for (const first of seen) assert.ok(first === 0 || first === 1);
}));

test('сдача и отмена приглашения; новое приглашение заменяет прежнее без ответа', () => released(async () => {
  const env = createEnv();
  const { host, guest, code, room } = await started(env);
  const gone = await guest.post(`/rooms/${code}/resign`);
  assert.equal(gone.status, 200);
  assert.equal(gone.data.room.status, 'over');
  assert.deepEqual(gone.data.room.result, { by: 'resign', winner: 0 });
  assert.equal(gone.data.room.seq, room.seq + 1);
  // второй раз сдаться нельзя — итог прежний
  assert.deepEqual((await host.post(`/rooms/${code}/resign`)).data.room.result, { by: 'resign', winner: 0 });

  const masha = await player(env, person('Маша'));
  const one = (await masha.post('/rooms', { game: 'chess' })).data.room.code;
  const two = (await masha.post('/rooms', { game: 'chess' })).data.room.code;
  assert.notEqual(one, two);
  assert.equal((await masha.get(`/rooms/${one}`)).status, 404, 'старая ссылка больше не работает');
  assert.equal((await masha.get(`/rooms/${two}`)).status, 200);

  const cancelled = await masha.post(`/rooms/${two}/resign`);
  assert.deepEqual(cancelled.data, { gone: true });
  assert.equal((await masha.get(`/rooms/${two}`)).status, 404);

  // начатую партию новое приглашение не трогает
  const live = await started(env);
  await live.host.post('/rooms', { game: 'chess' });
  assert.equal((await live.host.get(`/rooms/${live.code}`)).data.room.status, 'play');
}));

test('бот пишет о ходе, только когда соперник партию не смотрит; в сообщении — кнопка в эту партию', () => released(async () => {
  const env = createEnv();
  const tg = captureTelegram();
  try {
    const { host, guest, code, room } = await started(env);
    // создатель только что создал комнату — он «в партии», о приходе гостя бот не пишет
    assert.equal(tg.calls.length, 0);

    // гость ждёт хода и опрашивает — о ходе бот не пишет
    const first = await host.post(`/rooms/${code}/move`, { seq: room.seq, move: 'e2e4' });
    assert.equal(tg.calls.length, 0);

    // создатель ушёл из приложения (давно не спрашивал партию) — о ходе гостя бот напишет
    const away = Date.now() - ROOM_AWAY_MS - 1000;
    env.DB.prepare('UPDATE rooms SET seen0 = ? WHERE code = ?').bind(away, code).run();
    const reply = await guest.post(`/rooms/${code}/move`, { seq: first.data.room.seq, move: 'e7e5' });
    assert.equal(reply.status, 200);
    assert.equal(tg.calls.length, 1);
    const note = tg.calls[0];
    assert.equal(note.method, 'sendMessage');
    assert.equal(note.payload.chat_id, host.user.id);
    assert.match(note.payload.text, /Шахматы/);
    assert.match(note.payload.text, /Петя/);
    assert.match(note.payload.text, /e7–e5/);
    assert.match(note.payload.text, /Твоя очередь/);
    assert.ok(!/Сидоров|petya_secret/.test(note.payload.text), 'ни фамилии, ни ника соперника');
    const button = note.payload.reply_markup.inline_keyboard[0][0];
    assert.equal(button.web_app.url, `https://example.test/tggames/?startapp=${roomParam('chess', code)}`);

    // создатель вернулся и опросил партию — следующий ход гостя снова без сообщения
    const back = await host.get(`/rooms/${code}?seq=0`);
    const third = await host.post(`/rooms/${code}/move`, { seq: back.data.room.seq, move: 'g1f3' });
    await guest.post(`/rooms/${code}/move`, { seq: third.data.room.seq, move: 'b8c6' });
    assert.equal(tg.calls.length, 1);

    // сдача: соперника нет — узнает от бота
    env.DB.prepare('UPDATE rooms SET seen1 = ? WHERE code = ?').bind(away, code).run();
    await host.post(`/rooms/${code}/resign`);
    assert.equal(tg.calls.length, 2);
    assert.equal(tg.calls[1].payload.chat_id, guest.user.id);
    assert.match(tg.calls[1].payload.text, /сдался/);

    // друг пришёл по ссылке, когда создателя уже нет в приложении
    const masha = await player(env, person('Маша'));
    const kolya = await player(env, person('<b>Коля</b>'));
    const invite = (await masha.post('/rooms', { game: 'chess', first: 'me' })).data.room.code;
    env.DB.prepare('UPDATE rooms SET seen0 = ? WHERE code = ?').bind(away, invite).run();
    await kolya.post(`/rooms/${invite}/join`);
    assert.equal(tg.calls.length, 3);
    assert.equal(tg.calls[2].payload.chat_id, masha.user.id);
    assert.match(tg.calls[2].payload.text, /партия началась\. Твой ход/);
    assert.ok(tg.calls[2].payload.text.includes('&lt;b&gt;Коля&lt;/b&gt;'), 'имя соперника не становится разметкой');
  } finally {
    tg.restore();
  }
}));

test('«смотрит партию» пишется в базу не на каждый опрос', () => released(async () => {
  const env = createEnv();
  const { host, code, room } = await started(env);
  const seen = () => env.DB.prepare('SELECT seen0 FROM rooms WHERE code = ?').bind(code).first().seen0;
  const before = seen();
  for (let i = 0; i < 3; i += 1) await host.get(`/rooms/${code}?seq=${room.seq}`);
  assert.equal(seen(), before, 'только что отмечался — запись не нужна');
  env.DB.prepare('UPDATE rooms SET seen0 = ? WHERE code = ?').bind(before - ROOM_SEEN_EVERY_MS - 5, code).run();
  await host.get(`/rooms/${code}?seq=${room.seq}`);
  assert.ok(seen() >= before, 'давно не отмечался — записано');
}));

test('приглашений — не больше шести в минуту от игрока', () => released(async () => {
  const env = createEnv();
  const masha = await player(env, person('Маша'));
  const statuses = [];
  for (let i = 0; i < 8; i += 1) statuses.push((await masha.post('/rooms', { game: 'chess' })).status);
  assert.deepEqual(statuses, [200, 200, 200, 200, 200, 200, 429, 429]);
}));

test('бета: пока игра по сети в серверной бете, комнаты — только владельцу и бета-тестерам', async () => {
  const lib = await import('../lib.js');
  const was = [...lib.SERVER_BETA];
  lib.SERVER_BETA.splice(0, lib.SERVER_BETA.length, 'chess-online');
  try {
    const env = createEnv();
    const owner = await player(env, ADMIN);
    const masha = await player(env, person('Маша'));
    const tester = await player(env, person('Тестер'));
    await masha.get('/me');
    const testerId = (await tester.get('/me')).data.id;

    assert.equal((await masha.post('/rooms', { game: 'chess' })).status, 404, 'игроку комнат нет');
    const made = await owner.post('/rooms', { game: 'chess', first: 'me' });
    assert.equal(made.status, 200);
    const { code } = made.data.room;
    assert.equal((await masha.post(`/rooms/${code}/join`)).status, 404, 'и по ссылке владельца игрок не войдёт');
    assert.equal((await tester.post(`/rooms/${code}/join`)).status, 404, 'пока не отмечен тестером');

    assert.equal((await owner.post(`/admin/player/${testerId}/tester`, { on: true })).status, 200);
    const joined = await tester.post(`/rooms/${code}/join`);
    assert.equal(joined.status, 200);
    assert.equal(joined.data.room.status, 'play');
    assert.equal((await owner.post(`/rooms/${code}/move`, { seq: joined.data.room.seq, move: 'e2e4' })).status, 200);
  } finally {
    lib.SERVER_BETA.splice(0, lib.SERVER_BETA.length, ...was);
  }
});

test('удаление игрока в панели убирает и его партии', () => released(async () => {
  const env = createEnv();
  const { host, guest, code } = await started(env);
  const hostId = (await host.get('/me')).data.id;
  const res = await call(env, `/admin/player/${hostId}`, { method: 'DELETE', initData: await makeInitData(TOKEN, ADMIN) });
  assert.equal(res.status, 200);
  assert.equal((await guest.get(`/rooms/${code}`)).data.error, 'no_room');
}));

test('старые партии удаляются сами при новом приглашении', () => released(async () => {
  const env = createEnv({ ROOM_SWEEP_EVERY_MS: '0' });      // обычно уборка — не чаще раза в час
  const { host, code } = await started(env);
  const over = await started(env);
  await over.host.post(`/rooms/${over.code}/resign`);
  const day = 24 * 60 * 60 * 1000;
  env.DB.prepare('UPDATE rooms SET updated_at = ? WHERE code = ?').bind(Date.now() - 31 * day, code).run();
  env.DB.prepare('UPDATE rooms SET updated_at = ? WHERE code = ?').bind(Date.now() - 4 * day, over.code).run();
  const fresh = await started(env);       // новое приглашение — заодно уборка
  const left = env.DB.prepare('SELECT code FROM rooms').all().results.map((r) => r.code);
  assert.ok(!left.includes(code), 'месяц без ходов');
  assert.ok(!left.includes(over.code), 'оконченная — через три дня');
  assert.ok(left.includes(fresh.code));
  assert.equal((await host.get(`/rooms/${code}`)).status, 404);
}));
