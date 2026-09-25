// Проверка обработчика целиком: настоящий worker.js поверх SQLite вместо Cloudflare D1
// и подменённого fetch вместо Bot API. Запросов по сети нет.

import test from 'node:test';
import assert from 'node:assert/strict';

import worker from '../worker.js';
import { makeInitData, createEnv, captureTelegram, TOKEN, USER, ADMIN } from './helpers.js';

const ORIGIN = 'https://cheesemolly.github.io';

async function call(env, path, { method = 'GET', payload, initData, headers = {} } = {}) {
  const head = { Origin: ORIGIN, ...headers };
  if (payload !== undefined) head['Content-Type'] = 'application/json';
  if (initData) head.Authorization = `tma ${initData}`;
  const res = await worker.fetch(new Request(`https://api.test${path}`, {
    method, headers: head, body: payload === undefined ? undefined : JSON.stringify(payload),
  }), env);
  const text = await res.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { status: res.status, data };
}

const asUser = (user) => makeInitData(TOKEN, user);

test('первый заход заводит игрока, следующий — обновляет имя', async () => {
  const env = createEnv();
  const first = await call(env, '/me', { initData: await asUser(USER) });
  assert.equal(first.status, 200);
  assert.equal(first.data.tgId, USER.id);
  assert.equal(first.data.name, 'Маша');
  assert.equal(first.data.isAdmin, false);

  const renamed = await call(env, '/me', { initData: await asUser({ ...USER, first_name: 'Мария' }) });
  assert.equal(renamed.data.id, first.data.id, 'тот же игрок, а не новый');
  assert.equal(renamed.data.name, 'Мария');
});

test('без подписи Telegram внутрь не пускают', async () => {
  const env = createEnv();
  assert.equal((await call(env, '/me')).status, 401);
  assert.equal((await call(env, '/state', { initData: 'poddelka' })).status, 401);
  const alien = await makeInitData('999:another-token', USER);
  assert.equal((await call(env, '/me', { initData: alien })).data.error, 'bad_signature');
});

test('прогресс: сохраняется, читается и не виден чужим', async () => {
  const env = createEnv();
  const masha = await asUser(USER);
  const petya = await asUser({ id: 43, first_name: 'Петя' });
  await call(env, '/me', { initData: masha });
  await call(env, '/me', { initData: petya });

  const state = JSON.stringify({ 'shell:progress:words': 'Уровень 14' });
  const put = await call(env, '/state', { method: 'PUT', initData: masha, payload: { data: state, base: 0 } });
  assert.equal(put.status, 200);

  assert.equal((await call(env, '/state', { initData: masha })).data.data, state);
  assert.equal((await call(env, '/state', { initData: petya })).data.data, '{}', 'чужой прогресс не виден');
});

test('сохранение с другого устройства не затирается', async () => {
  const env = createEnv();
  const masha = await asUser(USER);
  await call(env, '/me', { initData: masha });

  const phone = await call(env, '/state', { method: 'PUT', initData: masha, payload: { data: '{"a":1}', base: 0 } });
  assert.equal(phone.status, 200);

  const desktop = await call(env, '/state', { method: 'PUT', initData: masha, payload: { data: '{"b":2}', base: 0 } });
  assert.equal(desktop.status, 409);
  assert.equal(desktop.data.data, '{"a":1}');

  const retry = await call(env, '/state', {
    method: 'PUT', initData: masha, payload: { data: '{"b":2}', base: desktop.data.updatedAt },
  });
  assert.equal(retry.status, 200);
});

test('панель: только для владельца', async () => {
  const env = createEnv();
  const masha = await asUser(USER);
  await call(env, '/me', { initData: masha });

  assert.equal((await call(env, '/admin/players', { initData: masha })).status, 403);

  const owner = await asUser(ADMIN);
  const me = await call(env, '/me', { initData: owner });
  assert.equal(me.data.isAdmin, true);
  const list = await call(env, '/admin/players', { initData: owner });
  assert.equal(list.status, 200);
  assert.equal(list.data.total, 2);
  assert.ok(list.data.players.some((p) => p.tgId === USER.id));
});

test('панель: поиск, правка прогресса, блокировка, удаление', async () => {
  const env = createEnv();
  const masha = await asUser(USER);
  const owner = await asUser(ADMIN);
  await call(env, '/me', { initData: masha });
  await call(env, '/me', { initData: owner });
  await call(env, '/state', { method: 'PUT', initData: masha, payload: { data: '{"x":1}', base: 0 } });

  const found = await call(env, '/admin/players?q=masha', { initData: owner });
  assert.equal(found.data.players.length, 1);
  const id = found.data.players[0].id;

  const card = await call(env, `/admin/player/${id}`, { initData: owner });
  assert.equal(card.data.data, '{"x":1}');

  // откат игрока на 14-й уровень «Слов»
  const fixed = JSON.stringify({ 'shell:progress:words': 'Уровень 14' });
  const saved = await call(env, `/admin/player/${id}/state`, { method: 'PUT', initData: owner, payload: { data: fixed } });
  assert.equal(saved.status, 200);
  assert.equal((await call(env, `/admin/player/${id}`, { initData: owner })).data.data, fixed);
  assert.ok(saved.data.updatedAt > Date.now(), 'отметка заведомо новее — устройство игрока применит правку');

  // блокировка закрывает вход, разблокировка возвращает
  await call(env, `/admin/player/${id}/ban`, { method: 'POST', initData: owner, payload: { banned: true } });
  const blocked = await call(env, '/state', { initData: masha });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.data.error, 'banned');
  await call(env, `/admin/player/${id}/ban`, { method: 'POST', initData: owner, payload: { banned: false } });
  assert.equal((await call(env, '/state', { initData: masha })).status, 200);

  // удаление
  assert.equal((await call(env, `/admin/player/${id}`, { method: 'DELETE', initData: owner })).status, 200);
  assert.equal((await call(env, `/admin/player/${id}`, { initData: owner })).status, 404);
  assert.equal((await call(env, '/admin/players', { initData: owner })).data.total, 1);
});

test('панель не принимает мусор вместо прогресса', async () => {
  const env = createEnv();
  const owner = await asUser(ADMIN);
  const me = await call(env, '/me', { initData: owner });
  const bad = await call(env, `/admin/player/${me.data.id}/state`, {
    method: 'PUT', initData: owner, payload: { data: 'не json' },
  });
  assert.equal(bad.status, 400);
  assert.equal(bad.data.error, 'state_json');
});

test('бот: /start и подсказка отвечают кнопкой «Играть»', async () => {
  const env = createEnv();
  const tg = captureTelegram();
  try {
    const update = (text) => call(env, '/bot', {
      method: 'POST',
      headers: { 'X-Telegram-Bot-Api-Secret-Token': env.WEBHOOK_SECRET },
      payload: { message: { chat: { id: 500 }, from: { id: USER.id }, text } },
    });

    await update('/start');
    const start = tg.calls.at(-1);
    assert.equal(start.method, 'sendMessage');
    assert.equal(start.payload.chat_id, 500);
    assert.equal(start.payload.reply_markup.inline_keyboard[0][0].web_app.url, env.APP_URL);

    await update('привет');
    assert.match(tg.calls.at(-1).payload.text, /\/me/, 'непонятный текст — показываем команды');
  } finally {
    tg.restore();
  }
});

test('бот: /me рассказывает прогресс', async () => {
  const env = createEnv();
  const masha = await asUser(USER);
  await call(env, '/me', { initData: masha });
  await call(env, '/state', {
    method: 'PUT',
    initData: masha,
    payload: {
      data: JSON.stringify({
        'shell:progress:words': 'Уровень 14',
        'shell:stats:2048': { played: 5, wins: 1, best: 512 },
        'shell:stats:2048:4': { played: 5, wins: 1, best: 512 },
      }),
      base: 0,
    },
  });

  const tg = captureTelegram();
  try {
    await call(env, '/bot', {
      method: 'POST',
      headers: { 'X-Telegram-Bot-Api-Secret-Token': env.WEBHOOK_SECRET },
      payload: { message: { chat: { id: 1 }, from: { id: USER.id }, text: '/me' } },
    });
    const text = tg.calls.at(-1).payload.text;
    assert.match(text, /Слова из слова: Уровень 14/, 'названия игр, а не id');
    assert.match(text, /2048: сыграно 5, рекорд 512/);
    assert.doesNotMatch(text, /2048:4/, 'варианты игры не перечисляем');
  } finally {
    tg.restore();
  }
});

// ---------- инлайн-режим ----------

async function inline(env, from, query) {
  const tg = captureTelegram();
  try {
    await call(env, '/bot', {
      method: 'POST',
      headers: { 'X-Telegram-Bot-Api-Secret-Token': env.WEBHOOK_SECRET },
      payload: { inline_query: { id: 'iq1', from: { id: from }, query, offset: '' } },
    });
    const answer = tg.calls.find((c) => c.method === 'answerInlineQuery');
    assert.ok(answer, 'бот ответил на инлайн-запрос');
    assert.equal(answer.payload.inline_query_id, 'iq1');
    return answer.payload;
  } finally {
    tg.restore();
  }
}

test('инлайн: пустой запрос — приглашение и все игры, кнопки — ссылки на мини-приложение', async () => {
  const env = createEnv({ BOT_USERNAME: '@anygametg_bot' });
  const res = await inline(env, 999, '');
  assert.equal(res.is_personal, true);
  assert.equal(res.results[0].id, 'all', 'первым — «позвать играть»');
  const games = res.results.filter((r) => r.id.startsWith('g:'));
  assert.equal(games.length, 17);
  for (const r of res.results) {
    const btn = r.reply_markup.inline_keyboard[0][0];
    assert.equal(btn.web_app, undefined, 'web_app в чужих чатах запрещён');
    assert.match(btn.url, /^https:\/\/t\.me\/anygametg_bot\?startapp/);
  }
  const sudoku = games.find((r) => r.id === 'g:sudoku');
  assert.equal(sudoku.reply_markup.inline_keyboard[0][0].url, 'https://t.me/anygametg_bot?startapp=sudoku');
  assert.match(sudoku.input_message_content.message_text, /Судоку/);
  assert.ok(!res.results.some((r) => r.id === 'me'), 'у незнакомого игрока рекордов нет');
});

test('инлайн: поиск игры по названию и свои рекорды', async () => {
  const env = createEnv({ BOT_USERNAME: 'anygametg_bot' });
  const masha = await asUser(USER);
  await call(env, '/me', { initData: masha });
  await call(env, '/state', {
    method: 'PUT',
    initData: masha,
    payload: { data: JSON.stringify({ 'shell:stats:sudoku': { played: 3, wins: 2, best: 450 }, 'shell:progress:loop': 'Уровень 14' }), base: 0 },
  });

  const found = await inline(env, USER.id, 'судо');
  assert.deepEqual(found.results.map((r) => r.id), ['g:sudoku']);
  const byWord = await inline(env, USER.id, 'точки');
  assert.deepEqual(byWord.results.map((r) => r.id), ['g:connect-dots'], 'по любому слову названия');
  const none = await inline(env, USER.id, 'шахматы');
  assert.deepEqual(none.results.map((r) => r.id), ['all'], 'не нашлось — хотя бы приглашение');

  const mine = await inline(env, USER.id, 'рекорды');
  assert.equal(mine.results[0].id, 'me');
  const text = mine.results[0].input_message_content.message_text;
  assert.match(text, /Петля: Уровень 14/);
  assert.match(text, /Судоку: сыграно 3, рекорд 450/);
  // без запроса рекорды — вторыми, после приглашения
  assert.deepEqual((await inline(env, USER.id, '')).results.slice(0, 2).map((r) => r.id), ['all', 'me']);
});

test('инлайн: имя бота берётся у Telegram, если не задано', async () => {
  const env = createEnv();
  const tg = captureTelegram();
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const method = String(url).split('/').pop();
    calls.push({ method, payload: init?.body ? JSON.parse(init.body) : null });
    const result = method === 'getMe' ? { username: 'anygametg_bot' } : true;
    return new Response(JSON.stringify({ ok: true, result }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    await call(env, '/bot', {
      method: 'POST',
      headers: { 'X-Telegram-Bot-Api-Secret-Token': env.WEBHOOK_SECRET },
      payload: { inline_query: { id: 'iq2', from: { id: 5 }, query: '2048' } },
    });
    const answer = calls.find((c) => c.method === 'answerInlineQuery').payload;
    assert.equal(answer.results[0].reply_markup.inline_keyboard[0][0].url, 'https://t.me/anygametg_bot?startapp=2048');
  } finally {
    tg.restore();
  }
});

// ---------- рассылка и личные сообщения через черновик ----------

async function botEnv() {
  const env = createEnv({ ALBUM_WAIT_MS: '0' });
  await call(env, '/me', { initData: await asUser(USER) });
  await call(env, '/me', { initData: await asUser({ id: 43, first_name: 'Петя' }) });
  await call(env, '/me', { initData: await asUser(ADMIN) });
  const post = (payload) => call(env, '/bot', {
    method: 'POST', headers: { 'X-Telegram-Bot-Api-Secret-Token': env.WEBHOOK_SECRET }, payload,
  });
  let messageId = 100;
  const say = (from, fields) => post({ message: { message_id: ++messageId, chat: { id: from }, from: { id: from }, ...fields } });
  const press = (from, data) => post({ callback_query: { id: 'q1', from: { id: from }, data, message: { chat: { id: from }, message_id: 999 } } });
  return { env, say, press };
}

/** Кнопка под предпросмотром (callback_data), которую бот прислал последней. */
const lastButtons = (tg) => tg.calls.findLast((c) => c.payload.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data)
  ?.payload.reply_markup.inline_keyboard[0].map((b) => b.callback_data);

test('рассылка: только владельцу; сначала предпросмотр, всем — только по кнопке', async () => {
  const { say, press } = await botEnv();
  const tg = captureTelegram();
  try {
    await say(USER.id, { text: '/broadcast всем привет' });
    assert.equal(tg.calls.length, 1);
    assert.match(tg.calls[0].payload.text, /только для владельца/);

    tg.calls.length = 0;
    await say(ADMIN.id, { text: '/broadcast Добавил новую игру!' });
    const shown = tg.calls.filter((c) => c.payload.text === 'Добавил новую игру!');
    assert.equal(shown.length, 1, 'пока только предпросмотр владельцу');
    assert.equal(shown[0].payload.chat_id, ADMIN.id);
    const [send, cancel] = lastButtons(tg);
    assert.match(send, /^d:send:\d+$/);
    assert.match(cancel, /^d:cancel:\d+$/);

    await press(USER.id, send);
    assert.match(tg.calls.at(-1).payload.text, /только для владельца/, 'чужой не может нажать');

    tg.calls.length = 0;
    await press(ADMIN.id, send);
    const sent = tg.calls.filter((c) => c.method === 'sendMessage' && c.payload.text === 'Добавил новую игру!');
    assert.equal(sent.length, 3, 'ушло всем троим');
    assert.ok(sent.every((c) => c.payload.reply_markup.inline_keyboard[0][0].web_app), 'с кнопкой «Играть»');
    assert.match(tg.calls.find((c) => c.method === 'editMessageText').payload.text, /Разослано: 3 из 3/);

    tg.calls.length = 0;
    await press(ADMIN.id, send);
    assert.equal(tg.calls.filter((c) => c.method === 'sendMessage').length, 0, 'второе нажатие ничего не шлёт');
    assert.match(tg.calls.find((c) => c.method === 'answerCallbackQuery').payload.text, /Уже отправлено/);
  } finally {
    tg.restore();
  }
});

test('рассылка: «Отмена» — никому не уходит', async () => {
  const { say, press } = await botEnv();
  const tg = captureTelegram();
  try {
    await say(ADMIN.id, { text: '/broadcast не надо' });
    const [send, cancel] = lastButtons(tg);
    tg.calls.length = 0;
    await press(ADMIN.id, cancel);
    assert.match(tg.calls.find((c) => c.method === 'editMessageText').payload.text, /Отменено/);
    tg.calls.length = 0;
    await press(ADMIN.id, send);
    assert.equal(tg.calls.filter((c) => c.method === 'sendMessage').length, 0, 'после отмены отправить нельзя');
  } finally {
    tg.restore();
  }
});

test('рассылка с альбомом: две картинки (подпись у одной) — одним альбомом, подпись у первой', async () => {
  const { say, press } = await botEnv();
  const tg = captureTelegram();
  try {
    const photo = (id) => [{ file_id: `${id}-small` }, { file_id: id }];
    await say(ADMIN.id, { media_group_id: 'A1', photo: photo('pic1') });
    assert.equal(tg.calls.length, 1, 'альбом без команды пока — подсказка, как подписать');
    tg.calls.length = 0;
    await say(ADMIN.id, { media_group_id: 'A1', photo: photo('pic2'), caption: '/broadcast Смотрите, новая игра!' });
    const album = tg.calls.find((c) => c.method === 'sendMediaGroup');
    assert.ok(album, 'предпросмотр — альбомом');
    assert.deepEqual(album.payload.media.map((m) => m.media), ['pic1', 'pic2'], 'по порядку, самый большой размер');
    assert.equal(album.payload.media[0].caption, 'Смотрите, новая игра!');
    assert.equal(album.payload.media[1].caption, undefined);

    const [send] = lastButtons(tg);
    tg.calls.length = 0;
    await press(ADMIN.id, send);
    const albums = tg.calls.filter((c) => c.method === 'sendMediaGroup');
    assert.equal(albums.length, 3, 'альбом ушёл всем троим');
  } finally {
    tg.restore();
  }
});

test('/message @ник: одно фото с подписью — только этому игроку', async () => {
  const { say, press } = await botEnv();
  const tg = captureTelegram();
  try {
    await say(ADMIN.id, { photo: [{ file_id: 'shot' }], caption: '/message @MASHA Привет от бота!' });
    const preview = tg.calls.find((c) => c.method === 'sendPhoto');
    assert.equal(preview.payload.chat_id, ADMIN.id, 'сначала — владельцу');
    assert.equal(preview.payload.photo, 'shot');
    assert.equal(preview.payload.caption, 'Привет от бота!');
    assert.match(tg.calls.at(-1).payload.text, /Отправить @masha/);

    const [send] = lastButtons(tg);
    tg.calls.length = 0;
    await press(ADMIN.id, send);
    const sent = tg.calls.filter((c) => c.method === 'sendPhoto');
    assert.equal(sent.length, 1);
    assert.equal(sent[0].payload.chat_id, USER.id);
    assert.match(tg.calls.find((c) => c.method === 'editMessageText').payload.text, /Отправлено @masha/);

    tg.calls.length = 0;
    await say(ADMIN.id, { text: '/message 43 Петя, привет' });
    assert.match(tg.calls.at(-1).payload.text, /Отправить Петя/, 'можно по id');

    tg.calls.length = 0;
    await say(ADMIN.id, { text: '/message @nobody привет' });
    assert.match(tg.calls.at(-1).payload.text, /не найден/);

    tg.calls.length = 0;
    await say(USER.id, { text: '/message @masha привет' });
    assert.match(tg.calls.at(-1).payload.text, /только для владельца/);
  } finally {
    tg.restore();
  }
});

test('вебхук без секретного заголовка не принимается', async () => {
  const env = createEnv();
  const tg = captureTelegram();
  try {
    const res = await call(env, '/bot', {
      method: 'POST',
      payload: { message: { chat: { id: 1 }, from: { id: USER.id }, text: '/start' } },
    });
    assert.equal(res.status, 403);
    assert.equal(tg.calls.length, 0, 'чужой запрос ничего не отправляет');
  } finally {
    tg.restore();
  }
});

test('проверка живости и неизвестный путь', async () => {
  const env = createEnv();
  assert.equal((await call(env, '/')).data.ok, true);
  assert.equal((await call(env, '/нет-такого', { initData: await asUser(USER) })).status, 404);
});

test('диагностика токена не раскрывает сам токен', async () => {
  const env = createEnv();
  const tg = captureTelegram();
  globalThis.fetch = async () => new Response(
    JSON.stringify({ ok: true, result: { username: 'anygametg_bot', first_name: 'AnyGame' } }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
  try {
    const res = await call(env, '/whoami');
    assert.equal(res.status, 200);
    assert.equal(res.data.bot, '@anygametg_bot');
    assert.equal(res.data.tokenTrimmed, true);
    assert.equal(res.data.admins, 1);
    assert.doesNotMatch(JSON.stringify(res.data), /TEST-TOKEN/, 'сам токен наружу не уходит');
  } finally {
    tg.restore();
  }
});
