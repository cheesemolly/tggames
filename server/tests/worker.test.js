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
    // приветствие — гифка с подписью (если 'welcome' в серверной бете, у игрока — текст; тест ниже)
    assert.ok(['sendAnimation', 'sendMessage'].includes(start.method));
    assert.equal(start.payload.chat_id, 500);
    assert.equal(start.payload.reply_markup.inline_keyboard[0][0].web_app.url, env.APP_URL);

    await update('привет');
    assert.match(tg.calls.at(-1).payload.text, /\/me/, 'непонятный текст — показываем команды');
  } finally {
    tg.restore();
  }
});

test('бот: приветствие с гифкой — в бете только владельцу, file_id запоминается, без гифки — текст', async () => {
  // серверная бета задаётся тут же: после релиза 'welcome' в SERVER_BETA нет, а проверить бету всё равно нужно
  const lib = await import('../lib.js');
  const wasBeta = [...lib.SERVER_BETA];
  lib.SERVER_BETA.splice(0, lib.SERVER_BETA.length, 'welcome');
  const env = createEnv();
  let fail = false;
  const tg = captureTelegram(({ method }) => (method === 'sendAnimation'
    ? (fail ? { ok: false, description: 'wrong file' } : { ok: true, result: { animation: { file_id: 'GIF1' } } })
    : { ok: true }));
  try {
    const start = (who) => call(env, '/bot', {
      method: 'POST',
      headers: { 'X-Telegram-Bot-Api-Secret-Token': env.WEBHOOK_SECRET },
      payload: { message: { chat: { id: who.id }, from: { id: who.id }, text: '/start' } },
    });

    // игрок, пока 'welcome' в серверной бете, — старый текст
    await start(USER);
    assert.equal(tg.calls.at(-1).method, 'sendMessage');
    assert.doesNotMatch(tg.calls.at(-1).payload.text, /Рейтинг/);

    // владелец — гифка с сайта, подпись про рейтинг, кнопка «Играть»
    await start(ADMIN);
    const first = tg.calls.at(-1);
    assert.equal(first.method, 'sendAnimation');
    assert.equal(first.payload.animation, new URL('media/welcome.mp4', env.APP_URL).href);
    assert.match(first.payload.caption, /Рейтинг/);
    assert.equal(first.payload.reply_markup.inline_keyboard[0][0].web_app.url, env.APP_URL);

    // второй раз — уже по file_id, без скачивания
    await start(ADMIN);
    assert.equal(tg.calls.at(-1).payload.animation, 'GIF1');

    // Telegram не принял файл — приветствие уходит текстом, запомненный file_id забывается
    fail = true;
    await start(ADMIN);
    assert.equal(tg.calls.at(-1).method, 'sendMessage');
    assert.match(tg.calls.at(-1).payload.text, /Рейтинг/);
    fail = false;
    await start(ADMIN);
    assert.equal(tg.calls.at(-1).payload.animation, new URL('media/welcome.mp4', env.APP_URL).href);
  } finally {
    lib.SERVER_BETA.splice(0, lib.SERVER_BETA.length, ...wasBeta);
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

test('рассылка и /message сохраняют оформление: сворачиваемая цитата, жирный', async () => {
  const { say, press } = await botEnv();
  const tg = captureTelegram();
  try {
    const raw = '/broadcast девлог\nобщее\n- пункт';
    const cut = '/broadcast '.length;
    await say(ADMIN.id, {
      text: raw,
      entities: [
        { type: 'bot_command', offset: 0, length: 10 },
        { type: 'bold', offset: cut, length: 6 },
        { type: 'expandable_blockquote', offset: cut + 7, length: raw.length - cut - 7 },
      ],
    });
    const preview = tg.calls.find((c) => c.method === 'sendMessage' && c.payload.text?.startsWith('девлог'));
    assert.ok(preview, 'предпросмотр');
    assert.deepEqual(preview.payload.entities, [
      { type: 'bold', offset: 0, length: 6 },
      { type: 'expandable_blockquote', offset: 7, length: raw.length - cut - 7 },
    ]);
    const [send] = lastButtons(tg);
    tg.calls.length = 0;
    await press(ADMIN.id, send);
    const sent = tg.calls.filter((c) => c.method === 'sendMessage' && c.payload.text?.startsWith('девлог'));
    assert.equal(sent.length, 3);
    assert.ok(sent.every((c) => c.payload.entities?.[1]?.type === 'expandable_blockquote'), 'всем — с цитатой');

    // /message @ник: сдвиг ещё и на ник; подпись к фото — caption_entities
    tg.calls.length = 0;
    const cap = '/message @masha  Привет, жирный';
    await say(ADMIN.id, { photo: [{ file_id: 'p1' }], caption: cap, caption_entities: [{ type: 'bold', offset: cap.indexOf('жирный'), length: 6 }] });
    const photo = tg.calls.find((c) => c.method === 'sendPhoto');
    assert.equal(photo.payload.caption, 'Привет, жирный');
    assert.deepEqual(photo.payload.caption_entities, [{ type: 'bold', offset: 8, length: 6 }]);
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

// ---------- рейтинг ----------

const save = (env, initData, state) => call(env, '/state', {
  method: 'PUT', initData, payload: { data: JSON.stringify(state), base: Number.MAX_SAFE_INTEGER },
});

test('рейтинг: места по очкам, при равенстве — кто раньше; в ответе только имя, без id и ника', async () => {
  const env = createEnv();
  const masha = await asUser({ ...USER, last_name: 'Иванова' });
  const petya = await asUser({ id: 43, first_name: 'Петя', username: 'petya_secret' });
  const vasya = await asUser({ id: 44, first_name: 'Вася' });
  await save(env, masha, { 'shell:stats:2048': { played: 3, wins: 0, best: 512 } });
  await save(env, petya, { 'shell:stats:2048': { played: 9, wins: 1, best: 2048 } });
  await new Promise((r) => setTimeout(r, 5));
  await save(env, vasya, { 'shell:stats:2048': { played: 1, wins: 0, best: 512 } });

  const res = await call(env, '/top/2048', { initData: vasya });
  assert.equal(res.status, 200);
  assert.deepEqual(res.data.rows.map((r) => [r.place, r.name, r.text, r.me]), [
    [1, 'Петя', 'плитка 2048', false],
    [2, 'Маша', 'плитка 512', false],     // 512 у Маши раньше, чем у Васи
    [3, 'Вася', 'плитка 512', true],
  ]);
  assert.equal(res.data.total, 3);
  assert.deepEqual({ place: res.data.me.place, name: res.data.me.name, text: res.data.me.text }, { place: 3, name: 'Вася', text: 'плитка 512' });

  const raw = JSON.stringify(res.data);
  for (const secret of ['petya_secret', 'masha', 'Иванова', ':43', ':42', ':44', 'tgId', 'user_id', 'username']) {
    assert.ok(!raw.includes(secret), `в рейтинге не должно быть «${secret}»`);
  }
});

test('рейтинг: сводка по играм и профиль игрока по pid — без чужих данных', async () => {
  const env = createEnv();
  const masha = await asUser(USER);
  const petya = await asUser({ id: 43, first_name: 'Петя', username: 'petya_secret' });
  await save(env, masha, { 'shell:progress:words': 'Уровень 14', 'game:bongo-cat:stats': { hits: 1500 } });
  await save(env, petya, { 'shell:progress:words': 'Уровень 30', 'shell:stats:sudoku': { played: 5, wins: 3 } });

  const top = await call(env, '/top', { initData: masha });
  const words = top.data.games.find((g) => g.game === 'words');
  assert.deepEqual(words.leader, { name: 'Петя', text: 'уровень 30', me: false });
  assert.deepEqual(words.me, { place: 2, text: 'уровень 14' });
  assert.equal(words.total, 2);
  assert.equal(top.data.games.find((g) => g.game === 'sudoku').me, null, 'в судоку Маша не играла');
  assert.equal(top.data.games.find((g) => g.game === 'bongo-cat').leader.text, '1 500 ударов');

  const pid = (await call(env, '/top/words', { initData: masha })).data.rows.find((r) => r.name === 'Петя').pid;
  const profile = await call(env, `/top/player/${pid}`, { initData: masha });
  assert.equal(profile.status, 200);
  assert.equal(profile.data.name, 'Петя');
  assert.equal(profile.data.me, false);
  assert.deepEqual(profile.data.games.map((g) => [g.game, g.text, g.place, g.total]), [
    ['words', 'уровень 30', 1, 2],
    ['sudoku', '3 судоку', 1, 1],
  ]);
  assert.ok(!JSON.stringify(profile.data).includes('petya_secret'));
  assert.equal((await call(env, '/top/player/nope', { initData: masha })).status, 404);
  assert.equal((await call(env, '/top/no-such-game', { initData: masha })).status, 404);
  assert.equal((await call(env, '/top/words')).status, 401, 'без подписи Telegram — нельзя');
});

test('рейтинг: заблокированных нет, прогресс до рейтинга досчитывается, правка панели пересчитывает', async () => {
  const env = createEnv();
  const masha = await asUser(USER);
  const petya = await asUser({ id: 43, first_name: 'Петя' });
  const owner = await asUser(ADMIN);
  // прогресс, сохранённый до появления рейтинга (в обход /state): рейтинг его досчитает сам
  const petyaId = (await call(env, '/me', { initData: petya })).data.id;
  env.DB.prepare('INSERT INTO states (user_id, data, updated_at) VALUES (?, ?, ?)')
    .bind(petyaId, JSON.stringify({ 'shell:stats:flappy-burger': { played: 4, best: 37 } }), 1).run();
  await save(env, masha, { 'shell:stats:flappy-burger': { played: 2, best: 12 } });

  let rows = (await call(env, '/top/flappy-burger', { initData: masha })).data.rows;
  assert.deepEqual(rows.map((r) => [r.name, r.text]), [['Петя', '37 очков'], ['Маша', '12 очков']]);

  await call(env, `/admin/player/${petyaId}/ban`, { method: 'POST', initData: owner, payload: { banned: true } });
  rows = (await call(env, '/top/flappy-burger', { initData: masha })).data.rows;
  assert.deepEqual(rows.map((r) => [r.place, r.name]), [[1, 'Маша']], 'заблокированный пропал, Маша первая');
  await call(env, `/admin/player/${petyaId}/ban`, { method: 'POST', initData: owner, payload: { banned: false } });

  const mashaId = (await call(env, '/me', { initData: masha })).data.id;
  await call(env, `/admin/player/${mashaId}/state`, {
    method: 'PUT', initData: owner, payload: { data: JSON.stringify({ 'shell:stats:flappy-burger': { played: 2, best: 99 } }) },
  });
  rows = (await call(env, '/top/flappy-burger', { initData: masha })).data.rows;
  assert.deepEqual(rows.map((r) => [r.name, r.text]), [['Маша', '99 очков'], ['Петя', '37 очков']]);

  await call(env, `/admin/player/${mashaId}`, { method: 'DELETE', initData: owner });
  rows = (await call(env, '/top/flappy-burger', { initData: petya })).data.rows;
  assert.deepEqual(rows.map((r) => r.name), ['Петя'], 'удалённый игрок ушёл и из рейтинга');
});

test('рейтинг: игру в бете видит только владелец', async () => {
  const lib = await import('../lib.js');
  const entry = lib.GAMES.find((g) => g.id === 'memory');
  entry.beta = true;
  try {
    const env = createEnv();
    const masha = await asUser(USER);
    const owner = await asUser(ADMIN);
    await save(env, masha, { 'shell:progress:memory': 'Уровень 5' });
    assert.equal((await call(env, '/top/memory', { initData: masha })).status, 404);
    assert.ok(!(await call(env, '/top', { initData: masha })).data.games.some((g) => g.game === 'memory'));
    assert.equal((await call(env, '/top/memory', { initData: owner })).status, 200);
  } finally {
    delete entry.beta;
  }
});

// ---------- особые скины (перки) ----------

test('особые скины: игрок видит только выданные, владелец — все; выдаёт и забирает только владелец', async () => {
  const env = createEnv();
  const masha = await asUser(USER);
  const owner = await asUser(ADMIN);
  const me = await call(env, '/me', { initData: masha });
  assert.deepEqual(me.data.perks, [], 'сначала ничего');
  assert.deepEqual((await call(env, '/me', { initData: owner })).data.perks, ['hedgehog'], 'владельцу — все');

  const id = me.data.id;
  const denied = await call(env, `/admin/player/${id}/perk`, { method: 'POST', initData: masha, payload: { perk: 'hedgehog', on: true } });
  assert.equal(denied.status, 403, 'сам себе выдать нельзя');

  const given = await call(env, `/admin/player/${id}/perk`, { method: 'POST', initData: owner, payload: { perk: 'hedgehog', on: true } });
  assert.deepEqual(given.data.perks, ['hedgehog']);
  assert.deepEqual((await call(env, '/me', { initData: masha })).data.perks, ['hedgehog']);
  const card = await call(env, `/admin/player/${id}`, { initData: owner });
  assert.deepEqual(card.data.perks, ['hedgehog']);
  assert.ok(card.data.allPerks.hedgehog, 'панели отдаётся список всех перков с названиями');

  assert.equal((await call(env, `/admin/player/${id}/perk`, { method: 'POST', initData: owner, payload: { perk: 'нет-такого', on: true } })).status, 400);

  await call(env, `/admin/player/${id}/perk`, { method: 'POST', initData: owner, payload: { perk: 'hedgehog', on: false } });
  assert.deepEqual((await call(env, '/me', { initData: masha })).data.perks, [], 'забрали');
});

// ---------- обратная связь (/report) ----------

test('обратная связь: /report в боте приходит владельцу, пустой — подсказка, больше 5 в час — отказ; в бете — только владельцу', async () => {
  const lib = await import('../lib.js');
  const env = createEnv();
  const tg = captureTelegram();
  const say = (from, text) => call(env, '/bot', {
    method: 'POST',
    headers: { 'X-Telegram-Bot-Api-Secret-Token': env.WEBHOOK_SECRET },
    payload: { message: { chat: { id: from.id }, from, text, message_id: 1 } },
  });
  const wasBeta = [...lib.SERVER_BETA];
  try {
    // в бете игрок команды не видит — получает обычную справку, владельцам ничего не уходит
    lib.SERVER_BETA.splice(0, lib.SERVER_BETA.length, 'feedback');
    await say(USER, '/report добавьте бильярд');
    assert.ok(!tg.calls.some((c) => c.payload.chat_id === ADMIN.id), 'пока в бете — игроку недоступно');
    tg.calls.length = 0;

    // после релиза — всем
    lib.SERVER_BETA.splice(0, lib.SERVER_BETA.length);
    await say(USER, '/report добавьте бильярд');
    const toOwner = tg.calls.find((c) => c.payload.chat_id === ADMIN.id);
    assert.ok(toOwner, 'отзыв ушёл владельцу');
    assert.match(toOwner.payload.text, /добавьте бильярд/);
    assert.match(toOwner.payload.text, /@masha/);
    assert.match(tg.calls.at(-1).payload.text, /Спасибо/);

    tg.calls.length = 0;
    await say(USER, '/report');
    assert.match(tg.calls.at(-1).payload.text, /Напиши после команды/);

    for (let k = 0; k < 4; k++) await say(USER, `/report идея ${k}`);
    tg.calls.length = 0;
    await say(USER, '/report ещё одна');
    assert.match(tg.calls.at(-1).payload.text, /Слишком много/);
    assert.ok(!tg.calls.some((c) => c.payload.chat_id === ADMIN.id), 'шестой за час владельцу не уходит');
  } finally {
    lib.SERVER_BETA.splice(0, lib.SERVER_BETA.length, ...wasBeta);
    tg.restore();
  }
});

test('обратная связь из приложения: POST /report — владельцу; в бете игроку 404, владельцу можно', async () => {
  const lib = await import('../lib.js');
  const env = createEnv();
  const tg = captureTelegram();
  const wasBeta = [...lib.SERVER_BETA];
  try {
    lib.SERVER_BETA.splice(0, lib.SERVER_BETA.length, 'feedback');
    const masha = await asUser(USER);
    const owner = await asUser(ADMIN);
    assert.equal((await call(env, '/report', { method: 'POST', initData: masha, payload: { text: 'хочу бильярд' } })).status, 404);
    const mine = await call(env, '/report', { method: 'POST', initData: owner, payload: { text: 'проверка' } });
    assert.equal(mine.status, 200);

    lib.SERVER_BETA.splice(0, lib.SERVER_BETA.length);
    tg.calls.length = 0;
    assert.equal((await call(env, '/report', { method: 'POST', initData: masha, payload: { text: 'хочу бильярд' } })).status, 200);
    assert.match(tg.calls.find((c) => c.payload.chat_id === ADMIN.id).payload.text, /из приложения[\s\S]*хочу бильярд/);
    assert.equal((await call(env, '/report', { method: 'POST', initData: masha, payload: { text: '   ' } })).status, 400);
    assert.equal((await call(env, '/report', { method: 'POST', initData: masha, payload: { text: 'я'.repeat(1001) } })).status, 400);

    // удаление игрока из панели стирает и его отзывы (так обещает privacy.html), чужие остаются
    const count = async (tgId) => (await env.DB.prepare('SELECT COUNT(*) AS n FROM reports WHERE tg_id = ?').bind(tgId).first()).n;
    assert.equal(await count(USER.id), 1);
    const mashaId = (await call(env, '/me', { initData: masha })).data.id;
    assert.equal((await call(env, `/admin/player/${mashaId}`, { method: 'DELETE', initData: owner })).status, 200);
    assert.equal(await count(USER.id), 0);
    assert.equal(await count(ADMIN.id), 1);
  } finally {
    lib.SERVER_BETA.splice(0, lib.SERVER_BETA.length, ...wasBeta);
    tg.restore();
  }
});


/**
 * Подделка Telegram для рассылок: у бота ОДИН общий счётчик номеров сообщений на все чаты (как в настоящем Telegram),
 * forwardMessage отдаёт сообщение только из того чата, где оно лежит.
 */
function fakeChats() {
  let counter = 1000;
  const chats = new Map();                   // chat → Map(номер → текст); «игрок:» в начале — написал игрок
  const put = (chat, text) => {
    if (!chats.has(chat)) chats.set(chat, new Map());
    const id = ++counter;
    chats.get(chat).set(id, text);
    return id;
  };
  const tg = captureTelegram(({ method, payload }) => {
    if (method === 'sendMessage') return { ok: true, result: { message_id: put(payload.chat_id, payload.text) } };
    if (method === 'forwardMessage') {
      const text = chats.get(payload.from_chat_id)?.get(payload.message_id);
      if (text == null) return { ok: false, description: 'Bad Request: message to forward not found' };
      const copy = put(payload.chat_id, text);
      const fromBot = !text.startsWith('игрок:');
      return { ok: true, result: { message_id: copy, text: text.replace(/^игрок:/, ''), forward_origin: { type: 'user', sender_user: { id: fromBot ? 1 : 2, is_bot: fromBot } } } };
    }
    if (method === 'deleteMessage') return { ok: Boolean(chats.get(payload.chat_id)?.delete(payload.message_id)) };
    if (method === 'deleteMessages') {
      for (const id of payload.message_ids) chats.get(payload.chat_id)?.delete(id);
      return { ok: true };
    }
    if (method === 'editMessageText') {
      if (!chats.get(payload.chat_id)?.has(payload.message_id)) return { ok: false, description: 'Bad Request: message to edit not found' };
      chats.get(payload.chat_id).set(payload.message_id, payload.text);
      return { ok: true };
    }
    return { ok: true };
  });
  const texts = (chat) => [...(chats.get(chat)?.values() ?? [])];
  return { tg, put, texts };
}

test('тихая рассылка без звука, номера записываются, /unsend удаляет точно по ним', async () => {
  const { say, press } = await botEnv();
  const { tg, texts } = fakeChats();
  try {
    await say(ADMIN.id, { text: '/silentbroadcast исправленный пост' });
    assert.match(tg.calls.findLast((c) => c.payload.reply_markup?.inline_keyboard).payload.text, /без звука/);
    const [send] = lastButtons(tg);
    tg.calls.length = 0;
    await press(ADMIN.id, send);
    const sent = tg.calls.filter((c) => c.method === 'sendMessage' && c.payload.text === 'исправленный пост');
    assert.equal(sent.length, 3);
    assert.ok(sent.every((c) => c.payload.disable_notification === true), 'без звука');

    const id = Number(send.split(':')[2]);
    tg.calls.length = 0;
    await say(ADMIN.id, { text: '/unsend' });
    assert.ok(tg.calls.at(-1).payload.reply_markup.inline_keyboard.some((row) => row[0].callback_data === `u:ask:${id}`));
    await press(ADMIN.id, `u:ask:${id}`);
    assert.deepEqual(lastButtons(tg), [`u:go:${id}`, `u:no:${id}`]);
    tg.calls.length = 0;
    await press(ADMIN.id, `u:go:${id}`);
    assert.equal(tg.calls.filter((c) => c.method === 'deleteMessages').length, 3);
    assert.equal(tg.calls.filter((c) => c.method === 'forwardMessage').length, 0, 'номера известны — искать не нужно');
    for (const chat of [USER.id, 43]) assert.ok(!texts(chat).includes('исправленный пост'));

    await press(USER.id, `u:go:${id}`);
    assert.match(tg.calls.at(-1).payload.text, /только для владельца/);
    await say(USER.id, { text: '/unsend' });
    assert.match(tg.calls.at(-1).payload.text, /только для владельца/);
  } finally {
    tg.restore();
  }
});

test('старая рассылка без номеров: ответ командой на свою копию — номера у остальных находятся по порядку', async () => {
  const { env, say, press } = await botEnv();
  const { tg, put, texts } = fakeChats();
  try {
    await say(ADMIN.id, { text: '/broadcast' });                       // таблицы черновиков
    const addOld = async (text) => (await env.DB.prepare(`INSERT INTO drafts (admin_id, chat_id, group_key, kind, text, stamp, state, created_at)
      VALUES (?, ?, ?, 'broadcast', ?, 's', 'sent', 0)`).bind(ADMIN.id, ADMIN.id, `old-${text}`, text).run()).meta.last_row_id;
    const postId = await addOld('пост с опечаткой');
    const oopsId = await addOld('обратная* :)');
    // как ушло тогда: по порядку игроков (id), общий счётчик; между ними — чужие сообщения
    const order = [USER.id, 43, ADMIN.id];
    const postAt = new Map();
    for (const chat of order) {
      postAt.set(chat, put(chat, 'пост с опечаткой'));
      if (chat === USER.id) put(USER.id, 'игрок:пост с опечаткой');     // игрок написал то же самое — не трогать
    }
    const oopsAt = new Map();
    for (const chat of order) oopsAt.set(chat, put(chat, 'обратная* :)'));
    for (let i = 0; i < 40; i++) put(999, 'чужой чат');                   // бот успел много написать другим

    // без ответа — бот просит ответить на сообщение
    await say(ADMIN.id, { text: '/unsend' });
    await press(ADMIN.id, `u:ask:${oopsId}`);
    assert.match(tg.calls.findLast((c) => c.method === 'editMessageText').payload.text, /ответь на неё командой/);

    // ответ /unsend на свою копию «обратная*»
    await say(ADMIN.id, { text: '/unsend', reply_to_message: { message_id: oopsAt.get(ADMIN.id), from: { id: 1, is_bot: true }, text: 'обратная* :)' } });
    assert.deepEqual(lastButtons(tg), [`u:go:${oopsId}`, `u:no:${oopsId}`]);
    tg.calls.length = 0;
    await press(ADMIN.id, `u:go:${oopsId}`);
    for (const chat of order) assert.ok(!texts(chat).includes('обратная* :)'), `удалено у ${chat}`);
    assert.match(tg.calls.findLast((c) => c.method === 'editMessageText').payload.text, /Удалено: 3/);
    assert.equal(tg.calls.filter((c) => c.method === 'sendMessage' && c.payload.chat_id !== ADMIN.id).length, 0, 'игрокам ничего не пришло');

    // ответ /edit на свою копию старого поста
    await say(ADMIN.id, { text: '/edit', reply_to_message: { message_id: postAt.get(ADMIN.id), from: { id: 1, is_bot: true }, text: 'пост с опечаткой' } });
    assert.match(tg.calls.at(-1).payload.text, /Пришли одним сообщением новый текст/);
    await say(ADMIN.id, { text: 'исправленный пост', entities: [{ type: 'bold', offset: 0, length: 11 }] });
    assert.deepEqual(lastButtons(tg), [`e:go:${postId}`, `e:no:${postId}`]);
    tg.calls.length = 0;
    await press(ADMIN.id, `e:go:${postId}`);
    const edits = tg.calls.filter((c) => c.method === 'editMessageText' && c.payload.text === 'исправленный пост');
    assert.equal(edits.length, 3);
    for (const e of edits) {
      assert.equal(e.payload.message_id, postAt.get(e.payload.chat_id), 'правится именно старый пост');
      assert.equal(e.payload.entities[0].type, 'bold');
      assert.ok(e.payload.reply_markup.inline_keyboard[0][0].web_app, 'кнопка «Играть» осталась');
    }
    assert.ok(texts(USER.id).includes('игрок:пост с опечаткой'), 'сообщение игрока цело');
    assert.equal((await env.DB.prepare('SELECT text FROM drafts WHERE id = ?').bind(postId).first()).text, 'исправленный пост');

    // /cancel — обычное сообщение владельца снова просто сообщение
    await say(ADMIN.id, { text: '/edit', reply_to_message: { message_id: postAt.get(ADMIN.id), from: { id: 1, is_bot: true }, text: 'исправленный пост' } });
    await say(ADMIN.id, { text: '/cancel' });
    assert.equal(tg.calls.at(-1).payload.text, 'Отменено.');
    await say(ADMIN.id, { text: 'привет' });
    assert.match(tg.calls.at(-1).payload.text, /Для владельца/);
  } finally {
    tg.restore();
  }
});
