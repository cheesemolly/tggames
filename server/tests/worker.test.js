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

// Сохранение прогресса, как его шлёт приложение после релиза слияния (sync: 3): ключи прогресса целиком.
let pushSeq = 0;
const snapshotPush = (state) => ({
  sync: 3, device: 'test-device-0', seq: ++pushSeq, base: 0,
  keys: Object.fromEntries(Object.entries(state).map(([k, v]) => [k, { v }])),
});

/** Пока слияние в бете у всех (как до релиза): игрок без беты сохраняет старым обменом — снимком. */
async function beforeMergeRelease(fn) {
  const lib = await import('../lib.js');
  const was = [...lib.SERVER_BETA];
  lib.SERVER_BETA.splice(0, lib.SERVER_BETA.length, 'sync-refresh', 'sync-merge');
  try {
    return await fn();
  } finally {
    lib.SERVER_BETA.splice(0, lib.SERVER_BETA.length, ...was);
  }
}

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
  const put = await call(env, '/state', { method: 'PUT', initData: masha, payload: snapshotPush(JSON.parse(state)) });
  assert.equal(put.status, 200);

  assert.equal((await call(env, '/state', { initData: masha })).data.data, state);
  assert.equal((await call(env, '/state', { initData: petya })).data.data, '{}', 'чужой прогресс не виден');
});

test('старый обмен (до релиза слияния): сохранение с другого устройства не затирается', () => beforeMergeRelease(async () => {
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
}));

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
  await call(env, '/state', { method: 'PUT', initData: masha, payload: snapshotPush({ x: 1 }) });

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
    payload: snapshotPush({
      'shell:progress:words': 'Уровень 14',
      'shell:stats:2048': { played: 5, wins: 1, best: 512 },
      'shell:stats:2048:4': { played: 5, wins: 1, best: 512 },
    }),
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
  assert.equal(games.length, 34);
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
    payload: snapshotPush({ 'shell:stats:sudoku': { played: 3, wins: 2, best: 450 }, 'shell:progress:loop': 'Уровень 14' }),
  });

  const found = await inline(env, USER.id, 'судо');
  assert.deepEqual(found.results.map((r) => r.id), ['g:sudoku', 'g:killer-sudoku']);
  const byWord = await inline(env, USER.id, 'точки');
  assert.deepEqual(byWord.results.map((r) => r.id), ['g:connect-dots'], 'по любому слову названия');
  const none = await inline(env, USER.id, 'абракадабра');
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

test('рассылка с роликом: видео уходит видео, ролик без звука — гифкой, файл — подсказка вместо черновика', async () => {
  const { say, press } = await botEnv();
  const tg = captureTelegram();
  try {
    await say(ADMIN.id, { video: { file_id: 'vid' }, caption: '/broadcast новые игры' });
    const preview = tg.calls.find((c) => c.method === 'sendVideo');
    assert.equal(preview.payload.chat_id, ADMIN.id, 'сначала — владельцу');
    assert.equal(preview.payload.video, 'vid');
    assert.equal(preview.payload.caption, 'новые игры');
    assert.ok(preview.payload.reply_markup, 'с кнопкой «Играть»');
    const [send] = lastButtons(tg);
    tg.calls.length = 0;
    await press(ADMIN.id, send);
    assert.equal(tg.calls.filter((c) => c.method === 'sendVideo' && c.payload.video === 'vid').length, 3, 'видео ушло всем троим');

    // без звуковой дорожки Telegram делает из ролика гифку: animation, а рядом тот же файл в document
    tg.calls.length = 0;
    await say(ADMIN.id, { animation: { file_id: 'gif' }, document: { file_id: 'gif-doc', mime_type: 'video/mp4' }, caption: '/broadcast без звука' });
    const anim = tg.calls.find((c) => c.method === 'sendAnimation');
    assert.equal(anim.payload.animation, 'gif');
    assert.equal(anim.payload.caption, 'без звука');
    assert.ok(anim.payload.reply_markup, 'с кнопкой «Играть»');
    const [sendGif] = lastButtons(tg);
    tg.calls.length = 0;
    await press(ADMIN.id, sendGif);
    assert.equal(tg.calls.filter((c) => c.method === 'sendAnimation').length, 3, 'гифка ушла всем троим');

    // файлом — игроки получили бы один текст: черновика нет, владельцу подсказка
    tg.calls.length = 0;
    await say(ADMIN.id, { document: { file_id: 'file', mime_type: 'video/mp4' }, caption: '/broadcast файлом' });
    assert.equal(tg.calls.length, 1);
    assert.match(tg.calls[0].payload.text, /не файлом/);
    assert.equal(tg.calls[0].payload.reply_markup, undefined, 'кнопки «Разослать» нет');
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

// ---------- защита (аудит 2026-09-27) ----------

test('отладочные адреса убраны: /whoami и /debug/initdata ничего не рассказывают', async () => {
  const env = createEnv();
  for (const path of ['/whoami', '/debug/initdata']) {
    const res = await call(env, path);
    assert.notEqual(res.status, 200);
    assert.equal(res.data.bot, undefined);
    assert.equal(res.data.admins, undefined);
  }
});

test('вебхук: без заданного секрета не принимается ничего', async () => {
  const env = createEnv({ WEBHOOK_SECRET: '' });
  const tg = captureTelegram();
  try {
    const res = await call(env, '/bot', {
      method: 'POST',
      headers: { 'X-Telegram-Bot-Api-Secret-Token': '' },
      payload: { message: { chat: { id: ADMIN.id }, from: { id: ADMIN.id }, text: '/broadcast фишинг' } },
    });
    assert.equal(res.status, 403);
    assert.equal(tg.calls.length, 0);
  } finally {
    tg.restore();
  }
});

test('сохранения прогресса — не чаще раза в пару секунд', async () => {
  const env = createEnv({ STATE_MIN_GAP_MS: '60000' });
  const masha = await asUser(USER);
  const put = () => call(env, '/state', { method: 'PUT', initData: masha, payload: snapshotPush({ a: 1 }) });
  assert.equal((await put()).status, 200);
  const second = await put();
  assert.equal(second.status, 429);
  assert.equal(second.data.error, 'too_many');
});

test('панель владельца — только со свежей подписью (не старше двух часов)', async () => {
  const env = createEnv();
  const stale = await makeInitData(TOKEN, ADMIN, { authDate: Date.now() - 3 * 60 * 60 * 1000 });
  const res = await call(env, '/admin/players', { initData: stale });
  assert.equal(res.status, 401);
  assert.equal(res.data.error, 'expired');
  assert.equal((await call(env, '/admin/players', { initData: await asUser(ADMIN) })).status, 200);
  assert.equal((await call(env, '/me', { initData: stale })).status, 200, 'игроку сутки — как раньше');
});

test('убрать из рейтинга: игрок пропадает из таблиц и профиля, прогресс цел; вернуть — снова там', async () => {
  const env = createEnv();
  const owner = await asUser(ADMIN);
  const masha = await asUser(USER);
  const petya = await asUser({ id: 43, first_name: 'Петя' });
  const state = (...found) => ({ 'game:words:progress': { levels: { 0: { found } } } });
  await call(env, '/state', { method: 'PUT', initData: masha, payload: snapshotPush(state('кот', 'слон')) });
  await call(env, '/state', { method: 'PUT', initData: petya, payload: snapshotPush(state('кот')) });
  const mashaId = (await call(env, '/me', { initData: masha })).data.id;
  let top = await call(env, '/top/words', { initData: petya });
  assert.equal(top.data.rows[0].name, 'Маша');
  const pid = top.data.rows[0].pid;

  const hide = await call(env, `/admin/player/${mashaId}/board`, { method: 'POST', initData: owner, payload: { hidden: true } });
  assert.equal(hide.status, 200);
  top = await call(env, '/top/words', { initData: petya });
  assert.deepEqual(top.data.rows.map((r) => r.name), ['Петя']);
  assert.equal((await call(env, `/top/player/${pid}`, { initData: petya })).status, 404);
  assert.equal((await call(env, `/admin/player/${mashaId}`, { initData: owner })).data.boardHidden, true);
  assert.equal((await call(env, '/state', { initData: masha })).data.data, JSON.stringify(state('кот', 'слон')), 'прогресс не тронут');

  await call(env, `/admin/player/${mashaId}/board`, { method: 'POST', initData: owner, payload: { hidden: false } });
  top = await call(env, '/top/words', { initData: petya });
  assert.deepEqual(top.data.rows.map((r) => r.name), ['Маша', 'Петя']);
  assert.equal((await call(env, '/admin/player/1/board', { method: 'POST', initData: masha, payload: { hidden: true } })).status, 403);
});

test('бот в группе: команды владельца только в личке, обычный текст — без ответа; правки не выполняются', async () => {
  const env = createEnv();
  const tg = captureTelegram();
  try {
    const post = (payload) => call(env, '/bot', { method: 'POST', headers: { 'X-Telegram-Bot-Api-Secret-Token': env.WEBHOOK_SECRET }, payload });
    const group = { id: -100, type: 'supergroup' };
    await post({ message: { message_id: 1, chat: group, from: { id: ADMIN.id }, text: '/broadcast всем' } });
    assert.match(tg.calls.at(-1).payload.text, /только в личке/);
    assert.equal(tg.calls.filter((c) => c.payload.text === 'всем').length, 0, 'предпросмотр в группу не ушёл');

    tg.calls.length = 0;
    await post({ message: { message_id: 2, chat: group, from: { id: USER.id }, text: 'привет всем' } });
    assert.equal(tg.calls.length, 0, 'на обычный текст в группе бот молчит');

    await post({ message: { message_id: 3, chat: group, from: { id: USER.id }, text: '/start' } });
    assert.ok(tg.calls.length > 0, '/start в группе работает');

    tg.calls.length = 0;
    await post({ edited_message: { message_id: 4, chat: { id: USER.id, type: 'private' }, from: { id: USER.id }, text: '/report исправил отзыв' } });
    assert.equal(tg.calls.length, 0, 'правка сообщения — не новая команда');
  } finally {
    tg.restore();
  }
});

test('заблокированный игрок не может писать отзывы; удаление игрока чистит следы рассылок', async () => {
  const { env, say, press } = await botEnv();
  const owner = await asUser(ADMIN);
  const mashaId = (await call(env, '/me', { initData: await asUser(USER) })).data.id;
  const tg = captureTelegram(({ method }) => (method === 'sendMessage' ? { ok: true, result: { message_id: 77 } } : { ok: true }));
  try {
    await call(env, `/admin/player/${mashaId}/ban`, { method: 'POST', initData: owner, payload: { banned: true } });
    await say(USER.id, { text: '/report хочу бильярд' });
    assert.match(tg.calls.at(-1).payload.text, /недоступны/);
    assert.equal(tg.calls.filter((c) => c.payload.chat_id === ADMIN.id).length, 0, 'владельцу ничего не пришло');
    await call(env, `/admin/player/${mashaId}/ban`, { method: 'POST', initData: owner, payload: { banned: false } });

    // рассылка → номера записаны, в том числе у Маши
    await say(ADMIN.id, { text: '/broadcast привет' });
    const [send] = lastButtons(tg);
    await press(ADMIN.id, send);
    const count = async () => (await env.DB.prepare('SELECT COUNT(*) AS n FROM sent_messages WHERE chat_id = ?').bind(USER.id).first()).n;
    assert.equal(await count(), 1);
    assert.equal((await call(env, `/admin/player/${mashaId}`, { method: 'DELETE', initData: owner })).status, 200);
    assert.equal(await count(), 0, 'номера сообщений удалённого игрока стёрты');
  } finally {
    tg.restore();
  }
});

// ---------- рейтинг ----------

// сохраняет новый клиент (слияние, sync: 3) — после релиза беты sync-merge сервер других не принимает.
// Без записей по устройствам (f) значения ложатся как есть: для рейтинга этого достаточно.
let saveSeq = 0;
const save = (env, initData, state) => call(env, '/state', {
  method: 'PUT',
  initData,
  payload: {
    sync: 3, device: 'test-device-1', seq: ++saveSeq, base: 0,
    keys: Object.fromEntries(Object.entries(state).map(([k, v]) => [k, { v }])),
  },
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
  const found = (...words) => ({ levels: { 0: { found: words } } });
  await save(env, masha, { 'game:words:progress': found('кот'), 'game:bongo-cat:stats': { hits: 1500 } });
  await save(env, petya, { 'game:words:progress': found('кот', 'слон'), 'shell:stats:sudoku': { played: 5, wins: 3 } });

  const top = await call(env, '/top', { initData: masha });
  const words = top.data.games.find((g) => g.game === 'words');
  assert.deepEqual(words.leader, { name: 'Петя', text: '25 очков', me: false });
  assert.deepEqual(words.me, { place: 2, text: '10 очков' });
  assert.equal(words.total, 2);
  assert.equal(top.data.games.find((g) => g.game === 'sudoku').me, null, 'в судоку Маша не играла');
  assert.equal(top.data.games.find((g) => g.game === 'bongo-cat').leader.text, '1 500 ударов');

  const pid = (await call(env, '/top/words', { initData: masha })).data.rows.find((r) => r.name === 'Петя').pid;
  const profile = await call(env, `/top/player/${pid}`, { initData: masha });
  assert.equal(profile.status, 200);
  assert.equal(profile.data.name, 'Петя');
  assert.equal(profile.data.me, false);
  assert.deepEqual(profile.data.games.map((g) => [g.game, g.text, g.place, g.total]), [
    ['words', '25 очков', 1, 2],
    ['sudoku', '150 очков', 1, 1],
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

test('общий рейтинг: очки за места во всех играх; пока в бете — только владельцу', async () => {
  const lib = await import('../lib.js');
  const wasBeta = [...lib.SERVER_BETA];
  lib.SERVER_BETA.splice(0, lib.SERVER_BETA.length, 'leaderboard-overall');
  try {
    const env = createEnv();
    const masha = await asUser(USER);
    const petya = await asUser({ id: 43, first_name: 'Петя', username: 'petya_secret' });
    const vasya = await asUser({ id: 44, first_name: 'Вася' });
    const owner = await asUser(ADMIN);
    await save(env, masha, { 'shell:stats:flappy-burger': { played: 1, wins: 0, best: 14 }, 'game:bongo-cat:stats': { hits: 1500 } });
    await save(env, petya, { 'shell:stats:flappy-burger': { played: 1, wins: 0, best: 30 }, 'shell:stats:pinball': { played: 5, wins: 0, best: 3 } });
    await save(env, vasya, { 'shell:stats:flappy-burger': { played: 1, wins: 0, best: 20 } });

    // в бете: у игрока общего рейтинга нет ни в сводке, ни в профиле
    const top = await call(env, '/top', { initData: masha });
    assert.equal(top.data.overall, undefined);
    const pid = top.data.mePid;
    const profile = await call(env, `/top/player/${pid}`, { initData: masha });
    assert.equal(profile.data.overall, undefined);
    assert.ok(profile.data.games.every((g) => g.points === undefined));

    // владелец видит: Flappy — Петя 100, Вася 93, Маша 86; Bongo Cat — Маша 100; Пинбол — Петя 100
    const own = await call(env, '/top', { initData: owner });
    assert.deepEqual(own.data.overall.rows.map((r) => [r.place, r.name, r.points, r.firsts, r.games]), [
      [1, 'Петя', 200, 2, 2],
      [2, 'Маша', 186, 1, 2],
      [3, 'Вася', 93, 0, 1],
    ]);
    assert.equal(own.data.overall.total, 3);
    assert.equal(own.data.overall.me, null, 'у владельца результатов нет');
    const mine = await call(env, `/top/player/${pid}`, { initData: owner });
    assert.deepEqual(mine.data.overall, { place: 2, total: 3, points: 186 });
    assert.deepEqual(mine.data.games.map((g) => [g.game, g.place, g.points]), [['flappy-burger', 3, 86], ['bongo-cat', 1, 100]]);
    assert.ok(!JSON.stringify(own.data).includes('petya_secret'), 'и здесь — без ников');

    // после релиза — всем
    lib.SERVER_BETA.splice(0, lib.SERVER_BETA.length);
    const after = await call(env, '/top', { initData: masha });
    assert.deepEqual(after.data.overall.me, { place: 2, name: 'Маша', pid, points: 186, firsts: 1, games: 2, me: true });
    assert.equal(after.data.overall.rows.find((r) => r.me).name, 'Маша');
  } finally {
    lib.SERVER_BETA.splice(0, lib.SERVER_BETA.length, ...wasBeta);
  }
});

test('рейтинг: разработчик вне мест, профиль с бейджем admin; поиск по нику — только точный, без ника в ответе', async () => {
  const lib = await import('../lib.js');
  const wasBeta = [...lib.SERVER_BETA];
  lib.SERVER_BETA.splice(0, lib.SERVER_BETA.length, 'leaderboard-no-admin', 'player-search', 'leaderboard-overall');
  try {
    const env = createEnv();
    const owner = await asUser(ADMIN);
    const masha = await asUser(USER);
    const petya = await asUser({ id: 43, first_name: 'Петя', username: 'Petya_Secret' });
    const vasya = await asUser({ id: 44, first_name: 'Вася', username: 'vasya_banned' });
    await save(env, owner, { 'shell:stats:flappy-burger': { played: 1, wins: 0, best: 99 }, 'shell:stats:pinball': { played: 9, wins: 0, best: 9 } });
    await save(env, masha, { 'shell:stats:flappy-burger': { played: 1, wins: 0, best: 14 } });
    await save(env, petya, { 'shell:stats:flappy-burger': { played: 1, wins: 0, best: 30 } });
    await save(env, vasya, { 'shell:stats:flappy-burger': { played: 1, wins: 0, best: 5 } });
    const names = async (who, game = 'flappy-burger') => (await call(env, `/top/${game}`, { initData: who })).data.rows.map((r) => [r.place, r.name]);

    // в бете: игроки видят разработчика на месте, поиска у них нет
    assert.deepEqual(await names(masha), [[1, 'Владелец'], [2, 'Петя'], [3, 'Маша'], [4, 'Вася']]);
    assert.equal((await call(env, '/top/find', { method: 'POST', initData: masha, payload: { username: 'petya_secret' } })).status, 404);

    // владелец: себя в местах не видит, места остальных пересчитаны; «ты вне рейтинга»
    assert.deepEqual(await names(owner), [[1, 'Петя'], [2, 'Маша'], [3, 'Вася']]);
    const ownTable = await call(env, '/top/flappy-burger', { initData: owner });
    assert.equal(ownTable.data.total, 3);
    assert.equal(ownTable.data.outside, true);
    assert.equal((await call(env, '/top/pinball', { initData: owner })).data.rows.length, 0, 'в пинбол играл только он');
    const summary = await call(env, '/top', { initData: owner });
    assert.equal(summary.data.outside, true);
    assert.deepEqual(summary.data.games.find((g) => g.game === 'flappy-burger').leader, { name: 'Петя', text: '30 очков', me: false });
    assert.ok(!summary.data.overall.rows.some((r) => r.name === 'Владелец'));
    const ownProfile = await call(env, `/top/player/${summary.data.mePid}`, { initData: owner });
    assert.equal(ownProfile.data.admin, true);
    assert.equal(ownProfile.data.outside, true);
    assert.deepEqual(ownProfile.data.games.map((g) => [g.game, g.text, g.place]), [['flappy-burger', '99 очков', null], ['pinball', '9 очков', null]]);
    assert.equal(ownProfile.data.overall, null);

    // поиск: @ник, в любом регистре, ссылкой t.me; в ответе только pid
    const petyaPid = (await call(env, '/top/flappy-burger', { initData: owner })).data.rows.find((r) => r.name === 'Петя').pid;
    for (const q of ['@petya_secret', 'PETYA_SECRET', 'https://t.me/Petya_Secret', ' petya_secret ']) {
      const found = await call(env, '/top/find', { method: 'POST', initData: owner, payload: { username: q } });
      assert.equal(found.status, 200, q);
      assert.deepEqual(found.data, { pid: petyaPid });
    }
    assert.equal((await call(env, '/top/find', { method: 'POST', initData: owner, payload: { username: 'petya_secre' } })).status, 404, 'только точное совпадение');
    assert.equal((await call(env, '/top/find', { method: 'POST', initData: owner, payload: { username: '<b>x</b>' } })).status, 400);
    assert.equal((await call(env, '/top/find', { initData: owner })).status, 404, 'только POST');

    // заблокированного и убранного из рейтинга не найти
    const vasyaId = (await call(env, '/me', { initData: vasya })).data.id;
    await call(env, `/admin/player/${vasyaId}/ban`, { method: 'POST', initData: owner, payload: { banned: true } });
    assert.equal((await call(env, '/top/find', { method: 'POST', initData: owner, payload: { username: 'vasya_banned' } })).status, 404);

    // после релиза — у всех: разработчика в местах нет, найти его можно, в профиле бейдж
    lib.SERVER_BETA.splice(0, lib.SERVER_BETA.length);
    assert.deepEqual(await names(masha), [[1, 'Петя'], [2, 'Маша']]);
    const ownerFound = await call(env, '/top/find', { method: 'POST', initData: masha, payload: { username: '@owner' } });
    const seen = await call(env, `/top/player/${ownerFound.data.pid}`, { initData: masha });
    assert.equal(seen.data.admin, true);
    assert.equal(seen.data.me, false);
    assert.equal((await call(env, '/top', { initData: masha })).data.outside, undefined);
    const petyaSeen = await call(env, `/top/player/${petyaPid}`, { initData: masha });
    assert.equal(petyaSeen.data.admin, undefined);
    assert.ok(!JSON.stringify(petyaSeen.data).toLowerCase().includes('petya_secret'), 'ника в профиле нет');

    // перебор ников — не чаще 12 в минуту
    const codes = [];
    for (let k = 0; k < 14; k++) codes.push((await call(env, '/top/find', { method: 'POST', initData: petya, payload: { username: `user_${k}` } })).status);
    assert.deepEqual(codes.slice(10), [404, 404, 429, 429]);
  } finally {
    lib.SERVER_BETA.splice(0, lib.SERVER_BETA.length, ...wasBeta);
  }
});

test('поиск игроков: подсказки по имени и по точному @нику, ник не выдаётся; находятся и те, кто ничего не сохранял', async () => {
  const lib = await import('../lib.js');
  const wasBeta = [...lib.SERVER_BETA];
  lib.SERVER_BETA.splice(0, lib.SERVER_BETA.length, 'player-suggest');
  try {
    const env = createEnv();
    const owner = await asUser(ADMIN);
    const masha = await asUser(USER);
    let id = 100;
    const make = async (username, first_name) => {
      const initData = await asUser({ id: id++, first_name, username });
      await call(env, '/me', { initData });   // зашёл — и всё, прогресса нет (как ganj)
      return initData;
    };
    await make('iozh10', 'Марина');
    await make('dasha_1', 'Даша Петрова');
    await make(undefined, 'Ёжик');            // без @ника
    const banned = await make('dark', 'Дарк');
    await make('ganj', 'ganj');
    for (let k = 0; k < 12; k++) await make(`dd${k}xx`, `Дима${k}`);
    const bannedId = (await call(env, '/me', { initData: banned })).data.id;
    await call(env, `/admin/player/${bannedId}/ban`, { method: 'POST', initData: owner, payload: { banned: true } });

    const suggest = async (q, who = owner) => call(env, '/top/suggest', { method: 'POST', initData: who, payload: { q } });
    const names = async (q) => (await suggest(q)).data.players.map((p) => p.name);

    assert.equal((await suggest('м', masha)).status, 404, 'в бете — только владелец');
    assert.deepEqual(await names('мар'), ['Марина']);
    assert.deepEqual(await names('МАРИНА'), ['Марина']);
    assert.deepEqual(await names('еж'), ['Ёжик'], 'ё = е');
    assert.deepEqual(await names('даш'), ['Даша']);
    assert.deepEqual(await names('Петрова'), [], 'по фамилии не ищем');
    assert.equal((await names('дим')).length, 10, 'не больше 10');
    assert.deepEqual(await names('Дар'), [], 'заблокированного нет');
    // @ник: только целиком — по первым буквам ник не подобрать
    assert.deepEqual(await names('iozh'), []);
    assert.deepEqual(await names('@IOZH10'), ['Марина']);
    const raw = JSON.stringify((await suggest('мар')).data);
    assert.ok(!raw.includes('iozh') && !raw.includes('username'), `ника в ответе нет: ${raw}`);

    // у ganj прогресса нет — раньше «Игрок не найден», теперь профиль открывается
    const found = await call(env, '/top/find', { method: 'POST', initData: owner, payload: { username: 'ganj' } });
    assert.equal(found.status, 200);
    const profile = await call(env, `/top/player/${found.data.pid}`, { initData: owner });
    assert.equal(profile.data.name, 'ganj');
    assert.deepEqual(profile.data.games, []);
  } finally {
    lib.SERVER_BETA.splice(0, lib.SERVER_BETA.length, ...wasBeta);
  }
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

// ---------- бета-тестеры ----------

test('бета-тестер: видит бету (игры в рейтинге, серверные функции), но панель ему закрыта; отмечает только владелец', async () => {
  const lib = await import('../lib.js');
  const entry = lib.GAMES.find((g) => g.id === 'memory');
  const wasBeta = [...lib.SERVER_BETA];
  entry.beta = true;
  lib.SERVER_BETA.splice(0, lib.SERVER_BETA.length, 'player-search');
  try {
    const env = createEnv();
    const masha = await asUser(USER);
    const owner = await asUser(ADMIN);
    const me = await call(env, '/me', { initData: masha });
    assert.equal(me.data.beta, false, 'сначала обычный игрок');
    assert.equal((await call(env, '/me', { initData: owner })).data.beta, true, 'владелец видит бету всегда');
    await save(env, masha, { 'shell:progress:memory': 'Уровень 5' });
    assert.equal((await call(env, '/top/memory', { initData: masha })).status, 404);
    await call(env, '/me', { initData: owner });
    assert.equal((await call(env, '/top/find', { method: 'POST', initData: masha, payload: { username: 'owner' } })).status, 404,
      'поиск по нику — в серверной бете, игроку его нет');

    const id = me.data.id;
    assert.equal((await call(env, `/admin/player/${id}/tester`, { method: 'POST', initData: masha, payload: { on: true } })).status, 403,
      'сам себя тестером не сделать');
    const made = await call(env, `/admin/player/${id}/tester`, { method: 'POST', initData: owner, payload: { on: true } });
    assert.equal(made.data.tester, true);
    assert.equal((await call(env, `/admin/player/${id}`, { initData: owner })).data.tester, true, 'в карточке панели');

    const now = await call(env, '/me', { initData: masha });
    assert.equal(now.data.beta, true);
    assert.equal(now.data.isAdmin, false, 'владельцем не стал');
    assert.deepEqual(now.data.perks, [], 'особые скины тестеру сами не выдаются');
    assert.equal((await call(env, '/top/memory', { initData: masha })).status, 200, 'игра в бете — в рейтинге');
    assert.equal((await call(env, '/top/find', { method: 'POST', initData: masha, payload: { username: 'owner' } })).status, 200,
      'функция из серверной беты (поиск по нику) открыта');
    for (const path of ['/admin/players', `/admin/player/${id}`]) {
      assert.equal((await call(env, path, { initData: masha })).status, 403, `панель закрыта: ${path}`);
    }

    await call(env, `/admin/player/${id}/tester`, { method: 'POST', initData: owner, payload: { on: false } });
    assert.equal((await call(env, '/me', { initData: masha })).data.beta, false, 'сняли');
    assert.equal((await call(env, '/top/memory', { initData: masha })).status, 404);

    await call(env, `/admin/player/${id}/tester`, { method: 'POST', initData: owner, payload: { on: true } });
    await call(env, `/admin/player/${id}`, { method: 'DELETE', initData: owner });
    const back = await call(env, '/me', { initData: masha });
    assert.equal(back.data.beta, false, 'удалённый игрок заводится заново — уже не тестер');
  } finally {
    delete entry.beta;
    lib.SERVER_BETA.splice(0, lib.SERVER_BETA.length, ...wasBeta);
  }
});

test('рамка тестера: в профиле рейтинга tester — у бета-тестера и разработчика; в бете — только тем, кто видит бету', async () => {
  const lib = await import('../lib.js');
  const wasBeta = [...lib.SERVER_BETA];
  lib.SERVER_BETA.splice(0, lib.SERVER_BETA.length, 'tester-frame');
  try {
    const env = createEnv();
    const owner = await asUser(ADMIN);
    const masha = await asUser(USER);
    const petya = await asUser({ id: 43, first_name: 'Петя' });
    for (const who of [owner, masha, petya]) await save(env, who, { 'shell:stats:flappy-burger': { played: 1, wins: 0, best: 14 } });
    const pidOf = async (who) => (await call(env, '/top', { initData: who })).data.mePid;
    const [ownerPid, mashaPid, petyaPid] = [await pidOf(owner), await pidOf(masha), await pidOf(petya)];
    const profile = async (pid, who) => (await call(env, `/top/player/${pid}`, { initData: who })).data;
    const mashaId = (await call(env, '/me', { initData: masha })).data.id;
    await call(env, `/admin/player/${mashaId}/tester`, { method: 'POST', initData: owner, payload: { on: true } });

    assert.equal((await profile(mashaPid, owner)).tester, true, 'тестер — с рамкой');
    assert.equal((await profile(mashaPid, masha)).tester, true, 'и сам себя видит с рамкой');
    assert.equal((await profile(ownerPid, masha)).tester, true, 'разработчик — тоже');
    assert.equal('tester' in (await profile(petyaPid, owner)), false, 'обычный игрок — без рамки');
    assert.equal('tester' in (await profile(mashaPid, petya)), false, 'пока в бете — игроку поле не отдаётся');

    lib.SERVER_BETA.splice(0, lib.SERVER_BETA.length);
    assert.equal((await profile(mashaPid, petya)).tester, true, 'после релиза рамку видят все');
    assert.equal('tester' in (await profile(petyaPid, petya)), false);

    await call(env, `/admin/player/${mashaId}/tester`, { method: 'POST', initData: owner, payload: { on: false } });
    assert.equal('tester' in (await profile(mashaPid, petya)), false, 'сняли отметку — рамки нет');
  } finally {
    lib.SERVER_BETA.splice(0, lib.SERVER_BETA.length, ...wasBeta);
  }
});

// ---------- серия дней в профиле ----------

test('серия в профиле: число дней подряд из дней захода игрока; сами дни не отдаются; в бете — только тем, кто видит бету', async () => {
  const lib = await import('../lib.js');
  const DAY = 86400000;
  const now = Date.UTC(2026, 9, 6, 12);                       // 6 октября 2026, полдень по UTC
  const key = (back) => new Date(now - back * DAY).toISOString().slice(0, 10);
  const streak = (backs, at = now) => lib.visitStreak(backs.map(key), at);
  assert.equal(streak([2, 1, 0]), 3, 'сегодня, вчера, позавчера');
  assert.equal(streak([5, 4, 2, 1, 0]), 3, 'пропуск рвёт серию');
  assert.equal(streak([3, 2, 1]), 3, 'сегодня ещё не заходил — серия до вчера горит');
  assert.equal(streak([4, 3, 2]), 3, 'позавчера — ещё горит: у игрока свой часовой пояс');
  assert.equal(streak([5, 4, 3]), 0, 'три дня назад — погасла');
  assert.equal(streak([0, 0, 1]), 2, 'повторы не считаются дважды');
  assert.equal(lib.visitStreak(['2025-12-30', '2025-12-31', '2026-01-01'], Date.UTC(2026, 0, 1, 5)), 3, 'через границу года');
  assert.equal(lib.visitStreak([key(0), 'мусор', 7, null], now), 1, 'мусор отбрасывается');
  for (const bad of [null, undefined, 'x', {}, []]) assert.equal(lib.visitStreak(bad), 0);

  const wasBeta = [...lib.SERVER_BETA];
  lib.SERVER_BETA.splice(0, lib.SERVER_BETA.length, 'profile-streak');
  try {
    const env = createEnv();
    const owner = await asUser(ADMIN);
    const masha = await asUser(USER);
    const petya = await asUser({ id: 43, first_name: 'Петя' });
    const today = (back) => new Date(Date.now() - back * DAY).toISOString().slice(0, 10);
    await save(env, masha, { 'shell:stats:flappy-burger': { played: 1, wins: 0, best: 14 }, 'shell:player:visits': [today(3), today(1), today(0)] });
    await save(env, petya, { 'shell:stats:flappy-burger': { played: 1, wins: 0, best: 9 } });
    const pidOf = async (who) => (await call(env, '/top', { initData: who })).data.mePid;
    const [mashaPid, petyaPid] = [await pidOf(masha), await pidOf(petya)];
    const profile = async (pid, who) => (await call(env, `/top/player/${pid}`, { initData: who })).data;

    assert.equal((await profile(mashaPid, owner)).streak, 2, 'сегодня и вчера');
    assert.equal((await profile(petyaPid, owner)).streak, 0, 'дней захода нет — серия 0');
    assert.equal(JSON.stringify(await profile(mashaPid, owner)).includes(today(0)), false, 'сами дни в ответ не попадают');
    assert.equal('streak' in await profile(mashaPid, petya), false, 'пока в бете — игроку поле не отдаётся');

    lib.SERVER_BETA.splice(0, lib.SERVER_BETA.length);
    assert.equal((await profile(mashaPid, petya)).streak, 2, 'после релиза серию видят все');
    assert.equal((await profile(mashaPid, masha)).streak, 2, 'и сам игрок — в своём профиле');
  } finally {
    lib.SERVER_BETA.splice(0, lib.SERVER_BETA.length, ...wasBeta);
  }
});

// ---------- значки и рамки ----------

test('значки и рамки: выдаёт владелец, надетое видно в таблицах и профиле; носить — одну рамку и один значок из своих', async () => {
  const lib = await import('../lib.js');
  const wasBeta = [...lib.SERVER_BETA];
  lib.SERVER_BETA.splice(0, lib.SERVER_BETA.length);          // как после релиза: видно всем
  try {
    const env = createEnv();
    const owner = await asUser(ADMIN);
    const masha = await asUser(USER);
    const petya = await asUser({ id: 43, first_name: 'Петя' });
    for (const [who, best] of [[owner, 99], [masha, 30], [petya, 20]]) {
      await save(env, who, { 'shell:stats:flappy-burger': { played: 1, wins: 0, best } });
    }
    const cosmetics = async (who) => (await call(env, '/me', { initData: who })).data.cosmetics;
    const mashaId = (await call(env, '/me', { initData: masha })).data.id;
    const grant = (action, payload, by = owner) => call(env, `/admin/player/${mashaId}/${action}`, { method: 'POST', initData: by, payload });
    const wear = (who, payload) => call(env, '/me/wear', { method: 'POST', initData: who, payload });
    // строка Маши в таблице игры и в общем рейтинге — глазами Пети
    const rowOf = async (name = 'Маша') => (await call(env, '/top/flappy-burger', { initData: petya })).data.rows.find((r) => r.name === name);
    const overallOf = async (name = 'Маша') => (await call(env, '/top', { initData: petya })).data.overall.rows.find((r) => r.name === name);
    const looks = (r) => ({ frame: r.frame ?? null, badge: r.badge ?? null });

    assert.deepEqual(await cosmetics(masha), { frames: [], badges: [], frame: null, badge: null }, 'сначала ничего');
    assert.equal('frame' in await rowOf() || 'badge' in await rowOf(), false, 'нечего надеть — в строке нет лишних полей');

    // значок выдаёт только владелец; несуществующего не выдать
    assert.equal((await grant('badge', { badge: 'contributor', on: true }, masha)).status, 403);
    assert.equal((await grant('badge', { badge: 'nope', on: true })).status, 400);
    assert.deepEqual((await grant('badge', { badge: 'contributor', on: true })).data.badges, ['contributor']);
    const card = (await call(env, `/admin/player/${mashaId}`, { initData: owner })).data;
    assert.deepEqual([card.badges, Object.keys(card.allBadges)], [['contributor'], ['contributor']], 'в карточке панели');
    await grant('tester', { on: true });

    // выданное надето сразу: в строке таблицы игры, в общем рейтинге, в профиле
    assert.deepEqual(await cosmetics(masha), { frames: ['tester'], badges: ['contributor'], frame: 'tester', badge: 'contributor' });
    assert.deepEqual(looks(await rowOf()), { frame: 'tester', badge: 'contributor' });
    assert.deepEqual(looks(await overallOf()), { frame: 'tester', badge: 'contributor' });
    assert.deepEqual(looks(await rowOf('Петя')), { frame: null, badge: null }, 'у соседа ничего');
    const mashaPid = (await rowOf()).pid;
    const profile = async (pid = mashaPid) => (await call(env, `/top/player/${pid}`, { initData: petya })).data;
    assert.deepEqual([(await profile()).frame, (await profile()).badge, (await profile()).badges], ['tester', 'contributor', ['contributor']]);
    const petyaProfile = await profile((await rowOf('Петя')).pid);
    assert.deepEqual([petyaProfile.frame, petyaProfile.badge, petyaProfile.badges], [null, null, []]);
    // своя строка «ты» в таблице игры — тоже с надетым
    assert.deepEqual(looks((await call(env, '/top/flappy-burger', { initData: masha })).data.me), { frame: 'tester', badge: 'contributor' });

    // снять значок — рамка остаётся; значок по-прежнему в профиле среди значков
    assert.deepEqual((await wear(masha, { badge: null })).data.cosmetics, { frames: ['tester'], badges: ['contributor'], frame: 'tester', badge: null });
    assert.deepEqual(looks(await rowOf()), { frame: 'tester', badge: null });
    assert.deepEqual([(await profile()).badge, (await profile()).badges], [null, ['contributor']]);
    // надеть значок, снять рамку
    await wear(masha, { badge: 'contributor', frame: null });
    assert.deepEqual(looks(await rowOf()), { frame: null, badge: 'contributor' });
    assert.equal((await profile()).frame, null, 'рамку снял — её нет и в профиле');

    // чужое и несуществующее надеть нельзя
    for (const payload of [{ badge: 'contributor' }, { frame: 'tester' }, { badge: 'nope' }, { frame: 5 }]) {
      assert.equal((await wear(petya, payload)).status, 400, JSON.stringify(payload));
    }
    assert.deepEqual(await cosmetics(petya), { frames: [], badges: [], frame: null, badge: null });

    // забрали значок — его нет нигде, хотя он был выбран
    await grant('badge', { badge: 'contributor', on: false });
    assert.deepEqual(looks(await rowOf()), { frame: null, badge: null });
    assert.deepEqual((await profile()).badges, []);
    // рамку надел обратно; сняли отметку тестера — рамки нет
    await wear(masha, { frame: 'tester' });
    assert.equal((await rowOf()).frame, 'tester');
    await grant('tester', { on: false });
    assert.equal('frame' in await rowOf(), false);

    // разработчик: рамка тестера есть и без отметки
    assert.deepEqual((await cosmetics(owner)).frames, ['tester']);

    // удаление игрока чистит и значки, и выбор
    await grant('badge', { badge: 'contributor', on: true });
    await call(env, `/admin/player/${mashaId}`, { method: 'DELETE', initData: owner });
    assert.deepEqual(await cosmetics(masha), { frames: [], badges: [], frame: null, badge: null });
  } finally {
    lib.SERVER_BETA.splice(0, lib.SERVER_BETA.length, ...wasBeta);
  }
});

test('значки и рамки в бете: поля в таблицах и выбор — только тем, кто видит бету', async () => {
  const lib = await import('../lib.js');
  const wasBeta = [...lib.SERVER_BETA];
  lib.SERVER_BETA.splice(0, lib.SERVER_BETA.length, 'badges');
  try {
    const env = createEnv();
    const owner = await asUser(ADMIN);
    const masha = await asUser(USER);
    const petya = await asUser({ id: 43, first_name: 'Петя' });
    for (const who of [masha, petya]) await save(env, who, { 'shell:stats:flappy-burger': { played: 1, wins: 0, best: 14 } });
    const idOf = async (who) => (await call(env, '/me', { initData: who })).data.id;
    const [mashaId, petyaId] = [await idOf(masha), await idOf(petya)];
    await call(env, `/admin/player/${mashaId}/tester`, { method: 'POST', initData: owner, payload: { on: true } });
    await call(env, `/admin/player/${petyaId}/badge`, { method: 'POST', initData: owner, payload: { badge: 'contributor', on: true } });
    const rows = async (who) => (await call(env, '/top/flappy-burger', { initData: who })).data.rows;

    // Петя (не тестер): значок ему выдан, но пока бета — он его не видит и выбрать не может
    assert.equal('cosmetics' in (await call(env, '/me', { initData: petya })).data, false);
    assert.equal((await call(env, '/me/wear', { method: 'POST', initData: petya, payload: { badge: null } })).status, 404);
    assert.ok((await rows(petya)).every((r) => !('frame' in r) && !('badge' in r)));
    const mashaPid = (await rows(petya)).find((r) => r.name === 'Маша').pid;
    assert.equal('badges' in (await call(env, `/top/player/${mashaPid}`, { initData: petya })).data, false);

    // Маша (тестер) видит: свою рамку и значок Пети
    assert.equal((await rows(masha)).find((r) => r.name === 'Маша').frame, 'tester');
    assert.equal((await rows(masha)).find((r) => r.name === 'Петя').badge, 'contributor');
    assert.deepEqual((await call(env, '/me', { initData: masha })).data.cosmetics, { frames: ['tester'], badges: [], frame: 'tester', badge: null });
  } finally {
    lib.SERVER_BETA.splice(0, lib.SERVER_BETA.length, ...wasBeta);
  }
});

// ---------- бета sync-refresh: сохранения — только от нового клиента ----------

test('старый клиент: у владельца и тестера (бета sync-merge) — только слияние, у игрока — любой; после релиза — у всех', async () => {
  const lib = await import('../lib.js');
  const wasBeta = [...lib.SERVER_BETA];
  lib.SERVER_BETA.splice(0, lib.SERVER_BETA.length, 'sync-refresh', 'sync-merge');
  try {
    const env = createEnv();
    const masha = await asUser(USER);
    const owner = await asUser(ADMIN);
    const put = (initData, data, sync) => call(env, '/state', {
      method: 'PUT', initData, payload: { data: JSON.stringify(data), base: Number.MAX_SAFE_INTEGER, ...(sync ? { sync } : {}) },
    });
    let seq = 0;
    const merged = (initData, keys) => call(env, '/state', {
      method: 'PUT', initData, payload: { sync: 3, device: 'owner-phone-1', seq: ++seq, base: 0, keys },
    });
    const state = async (initData) => JSON.parse((await call(env, '/state', { initData })).data.data);

    assert.equal((await put(masha, { a: 1 })).status, 200, 'игрок без беты — старый клиент, как раньше');
    assert.equal((await put(masha, { a: 2 }, lib.SYNC_PROTOCOL)).status, 200);
    for (const sync of [undefined, lib.SYNC_PROTOCOL]) {
      const old = await put(owner, { level: 35 }, sync);
      assert.equal(old.status, 426, `владелец (видит бету) со старым клиентом (sync: ${sync}) — отказ`);
      assert.equal(old.data.error, 'update_required');
    }
    assert.deepEqual(await state(owner), {}, 'старый клиент ничего не записал');
    assert.equal((await merged(owner, { 'game:loop:current': { v: { level: 60 } } })).status, 200, 'слияние — принято');
    assert.equal((await put(owner, { 'game:loop:current': { level: 35 } }, lib.SYNC_PROTOCOL)).status, 426, 'и потом старый не откатит');
    assert.deepEqual(await state(owner), { 'game:loop:current': { level: 60 } });

    const id = (await call(env, '/me', { initData: masha })).data.id;
    await call(env, `/admin/player/${id}/tester`, { method: 'POST', initData: owner, payload: { on: true } });
    assert.equal((await put(masha, { a: 3 }, lib.SYNC_PROTOCOL)).status, 426, 'тестер со старым клиентом — отказ');
    assert.equal((await merged(masha, { a: { v: 4 } })).status, 200);

    // шаг 1 выпущен, слияние ещё в бете: игроку — хотя бы sync: 2
    lib.SERVER_BETA.splice(0, lib.SERVER_BETA.length, 'sync-merge');
    await call(env, `/admin/player/${id}/tester`, { method: 'POST', initData: owner, payload: { on: false } });
    assert.equal((await put(masha, { a: 5 })).status, 426, 'игроку без sync: 2 — отказ');
    assert.equal((await put(masha, { a: 6 }, lib.SYNC_PROTOCOL)).status, 200);

    lib.SERVER_BETA.splice(0, lib.SERVER_BETA.length);           // релиз всего
    assert.equal((await put(masha, { a: 7 }, lib.SYNC_PROTOCOL)).status, 426, 'после релиза старый клиент не пишет ни у кого');
    assert.equal((await merged(masha, { a: { v: 8 } })).status, 200);
  } finally {
    lib.SERVER_BETA.splice(0, lib.SERVER_BETA.length, ...wasBeta);
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

// ---------- слияние по ключам (бета sync-merge, server/merge.js) ----------

const pushMerged = (env, initData, device, seq, keys, base = 0) => call(env, '/state', {
  method: 'PUT', initData, payload: { sync: 3, device, seq, base, keys },
});

test('слияние: два устройства пишут одновременно — сохраняется и то и другое (запись только поверх прочитанного)', async () => {
  const env = createEnv();
  const masha = await asUser(USER);
  // чтение прогресса «идёт по сети»: оба сохранения успевают прочитать базу до того, как одно из них запишет
  const prepare = env.DB.prepare.bind(env.DB);
  let lost = 0;
  env.DB.prepare = (sql) => {
    const stmt = prepare(sql);
    const slow = (b) => ({
      ...b,
      first: () => {
        const row = b.first();                     // прочитано сейчас, ответ приходит позже
        return new Promise((r) => setTimeout(() => r(row), 5));
      },
      run: () => {
        const res = b.run();
        if (/^UPDATE states/.test(sql) && !res.meta.changes) lost += 1;
        return res;
      },
    });
    if (!/FROM states|UPDATE states/.test(sql)) return stmt;
    return { ...slow(stmt), bind: (...args) => slow(stmt.bind(...args)) };
  };
  await pushMerged(env, masha, 'device-aaaa-01', 1, { 'shell:stats:chess': { v: { played: 1, wins: 0, best: null }, f: { played: { d: { 'device-aaaa-01': 1 } } } } });
  const [a, b] = await Promise.all([
    pushMerged(env, masha, 'device-aaaa-01', 2, { 'game:loop:current': { v: { v: 1, level: 7 } } }),
    pushMerged(env, masha, 'device-bbbb-02', 1, {
      'game:2048:settings': { v: { size: 5, skin: 'neon' } },
      'shell:stats:chess': { v: { played: 1, wins: 1, best: null }, f: { played: { d: { 'device-bbbb-02': 1 } }, wins: { d: { 'device-bbbb-02': 1 } } } },
    }),
  ]);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  const state = JSON.parse((await call(env, '/state', { initData: masha })).data.data);
  assert.equal(state['game:loop:current'].level, 7);
  assert.equal(state['game:2048:settings'].skin, 'neon');
  assert.deepEqual(state['shell:stats:chess'], { played: 2, wins: 1, best: null }, 'партии обоих устройств');
  assert.ok(lost >= 1, 'второе сохранение не записалось поверх первого вслепую, а слилось заново');
});

test('слияние: чтение изменившегося с прошлого обмена и принятая отправка устройства (ack)', async () => {
  const env = createEnv();
  const masha = await asUser(USER);
  const first = await pushMerged(env, masha, 'device-aaaa-01', 5, { 'game:2048:sound': { v: false } });
  const since = first.data.updatedAt;
  await pushMerged(env, masha, 'device-bbbb-02', 1, { 'game:chess:setup': { v: { level: 4, color: 'white' } } });
  const read = await call(env, `/state?sync=3&since=${since}&device=device-aaaa-01`, { initData: masha });
  assert.deepEqual(Object.keys(read.data.keys), ['game:chess:setup'], 'только изменённое другим устройством');
  assert.equal(read.data.ack, 5, 'сервер помнит, какую отправку A уже принял');
  const all = await call(env, '/state?sync=3&since=0&device=device-aaaa-01', { initData: masha });
  assert.equal(all.data.full, true);
  assert.deepEqual(Object.keys(all.data.keys).sort(), ['game:2048:sound', 'game:chess:setup']);
  // и прогресс для старых мест (рейтинг, панель, /me) — обычной строкой
  assert.deepEqual(JSON.parse((await call(env, '/state', { initData: masha })).data.data), {
    'game:2048:sound': false, 'game:chess:setup': { level: 4, color: 'white' },
  });
});

test('слияние: правка владельца в панели — новая эпоха, старые счётчики устройства её не отменяют', async () => {
  const env = createEnv();
  const masha = await asUser(USER);
  const owner = await asUser(ADMIN);
  const id = (await call(env, '/me', { initData: masha })).data.id;
  const words = (hints) => ({ v: 1, levels: {}, current: 0, hints, passedCount: 0 });
  await pushMerged(env, masha, 'device-aaaa-01', 1, { 'game:words:progress': { v: words(9) } });
  const known = (await call(env, '/state?sync=3&since=0&device=device-aaaa-01', { initData: masha })).data.keys['game:words:progress'];
  // владелец ставит 2 подсказки
  const data = JSON.parse((await call(env, `/admin/player/${id}`, { initData: owner })).data.data);
  data['game:words:progress'].hints = 2;
  assert.equal((await call(env, `/admin/player/${id}/state`, { method: 'PUT', initData: owner, payload: { data: JSON.stringify(data) } })).status, 200);
  // устройство, не знающее о правке, тратит подсказку «из своих 9» — со старой эпохой
  const f = { hints: { s: 9, d: { 'device-aaaa-01': [0, 1] } } };
  await pushMerged(env, masha, 'device-aaaa-01', 2, { 'game:words:progress': { v: words(8), f, e: known.e } });
  assert.equal(JSON.parse((await call(env, '/state', { initData: masha })).data.data)['game:words:progress'].hints, 2, 'правка устояла');
});

test('слияние: старый клиент снимком (игрок без беты, до релиза) сбрасывает записи слияния — потом они выводятся заново', () => beforeMergeRelease(async () => {
  const env = createEnv();
  const masha = await asUser(USER);
  await pushMerged(env, masha, 'device-aaaa-01', 1, { 'shell:stats:flags': { v: { played: 3, wins: 1, best: 2 }, f: { played: { d: { 'device-aaaa-01': 3 } }, wins: { d: { 'device-aaaa-01': 1 } } } } });
  const snap = await call(env, '/state', { method: 'PUT', initData: masha, payload: { data: JSON.stringify({ 'shell:stats:flags': { played: 5, wins: 2, best: 2 } }), base: Number.MAX_SAFE_INTEGER } });
  assert.equal(snap.status, 200);
  const read = await call(env, '/state?sync=3&since=0&device=device-aaaa-01', { initData: masha });
  const entry = read.data.keys['shell:stats:flags'];
  assert.deepEqual(entry.v, { played: 5, wins: 2, best: 2 });
  assert.deepEqual(entry.f.played, { l: 5, d: {} }, 'счётчик — заново «перенесённое», без старых записей устройства');
  assert.equal(entry.e, snap.data.updatedAt, 'новая эпоха: старые записи устройства отбросятся');
}));

test('слияние: откат — копия прогресса до перехода (states_premerge) один раз; прогресс, записанный в обход записей слияния, не перекрывается старыми счётчиками', async () => {
  const env = createEnv();
  const masha = await asUser(USER);
  const owner = await asUser(ADMIN);
  const id = (await call(env, '/me', { initData: masha })).data.id;
  const before = { 'shell:stats:flags': { played: 3, wins: 1, best: 2 } };
  env.DB.prepare('INSERT INTO states (user_id, data, updated_at) VALUES (?, ?, 1000)').bind(id, JSON.stringify(before)).run();
  await pushMerged(env, masha, 'device-aaaa-01', 1, { 'game:2048:sound': { v: false } });
  await pushMerged(env, masha, 'device-aaaa-01', 2, { 'game:2048:sound': { v: true } });
  const copy = env.DB.prepare('SELECT data, updated_at FROM states_premerge WHERE user_id = ?').bind(id).first();
  assert.deepEqual(JSON.parse(copy.data), before, 'в копии — прогресс до слияния, и только одна');
  assert.equal(copy.updated_at, 1000);

  // откат обработчика: старый код записал прогресс, не зная о записях слияния (meta осталась прежней)
  env.DB.prepare('UPDATE states SET data = ?, updated_at = updated_at + 5 WHERE user_id = ?')
    .bind(JSON.stringify({ 'shell:stats:flags': { played: 9, wins: 4, best: 2 } }), id).run();
  const read = await call(env, '/state?sync=3&since=0&device=device-aaaa-01', { initData: masha });
  assert.equal(read.data.keys['shell:stats:flags'].v.played, 9, 'прогресс, записанный старым кодом, не перекрыт');
  assert.deepEqual(read.data.keys['shell:stats:flags'].f.played, { l: 9, d: {} });

  assert.equal((await call(env, `/admin/player/${id}`, { method: 'DELETE', initData: owner })).status, 200);
  assert.equal(env.DB.prepare('SELECT 1 FROM states_premerge WHERE user_id = ?').bind(id).first(), null, 'удаление игрока стирает и копию');
});

test('очки рейтинга: в бете владелец видит очки, игрок — прежние уровни и победы; после релиза — все очки', async () => {
  const lib = await import('../lib.js');
  const wasBeta = [...lib.SERVER_BETA];
  lib.SERVER_BETA.splice(0, lib.SERVER_BETA.length, 'rating-points');
  try {
    const env = createEnv();
    const masha = await asUser(USER);
    const petya = await asUser({ id: 43, first_name: 'Петя' });
    const owner = await asUser(ADMIN);
    // Маша: 3 лёгких судоку, Петя: 1 экспертное — по победам Маша выше, по очкам Петя (400 > 150)
    await save(env, masha, { 'shell:stats:sudoku': { played: 3, wins: 3 }, 'shell:stats:sudoku:easy': { played: 3, wins: 3 } });
    await save(env, petya, { 'shell:stats:sudoku': { played: 1, wins: 1 }, 'shell:stats:sudoku:expert': { played: 1, wins: 1 } });
    const rows = async (who) => (await call(env, '/top/sudoku', { initData: who })).data.rows.map((r) => [r.name, r.text]);

    assert.deepEqual(await rows(masha), [['Маша', '3 судоку'], ['Петя', '1 судоку']]);
    assert.deepEqual(await rows(owner), [['Петя', '400 очков'], ['Маша', '150 очков']]);
    assert.match((await call(env, '/top/sudoku', { initData: owner })).data.by, /очки/);

    lib.SERVER_BETA.splice(0, lib.SERVER_BETA.length);
    assert.deepEqual(await rows(masha), [['Петя', '400 очков'], ['Маша', '150 очков']]);
  } finally {
    lib.SERVER_BETA.splice(0, lib.SERVER_BETA.length, ...wasBeta);
  }
});

test('смена мер: игроки, посчитанные старой версией, пересчитываются при просмотре рейтинга', async () => {
  const lib = await import('../lib.js');
  const wasBeta = [...lib.SERVER_BETA];
  lib.SERVER_BETA.splice(0, lib.SERVER_BETA.length, 'rating-points');
  try {
    const env = createEnv();
    const masha = await asUser(USER);
    const owner = await asUser(ADMIN);
    await save(env, masha, { 'shell:stats:sudoku': { played: 2, wins: 2 }, 'shell:stats:sudoku:hard': { played: 2, wins: 2 } });
    // как до обновления: очков «pts:» ещё нет, версия старая
    env.DB.prepare("DELETE FROM board_scores WHERE game_id LIKE 'pts:%'").run();
    env.DB.prepare('UPDATE board_players SET ver = 0').run();
    const rows = (await call(env, '/top/sudoku', { initData: owner })).data.rows.map((r) => [r.name, r.text]);
    assert.deepEqual(rows, [['Маша', '400 очков']]);
    assert.equal(env.DB.prepare('SELECT ver FROM board_players').first().ver, lib.BOARD_VERSION);
  } finally {
    lib.SERVER_BETA.splice(0, lib.SERVER_BETA.length, ...wasBeta);
  }
});
