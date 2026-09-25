import test from 'node:test';
import assert from 'node:assert/strict';

import {
  checkInitData, diagnoseInitData, dataCheckString, validateState, parseAdminIds, isAdmin, displayName,
  timingSafeEqual, MAX_STATE_BYTES, INIT_DATA_MAX_AGE_MS,
  GAMES, findGames, startAppLink, progressLines,
} from '../lib.js';
import { makeInitData, TOKEN, USER } from './helpers.js';

test('подпись Telegram: своя проходит, чужая — нет', async () => {
  const initData = await makeInitData(TOKEN, USER);
  const good = await checkInitData(initData, TOKEN);
  assert.equal(good.ok, true);
  assert.equal(good.user.id, USER.id);
  assert.equal(good.user.first_name, USER.first_name);

  const otherToken = await checkInitData(initData, '999:another-token');
  assert.equal(otherToken.ok, false);
  assert.equal(otherToken.error, 'bad_signature', 'подпись сделана ключом от токена бота');
});

test('подменить данные в initData нельзя', async () => {
  const initData = await makeInitData(TOKEN, USER);
  // пытаемся стать другим игроком, не трогая hash
  const tampered = initData.replace(encodeURIComponent(String(USER.id)), encodeURIComponent('777'));
  assert.notEqual(tampered, initData);
  const res = await checkInitData(tampered, TOKEN);
  assert.equal(res.ok, false);
  assert.equal(res.error, 'bad_signature');
});

test('поле signature от новых клиентов входит в подпись', async () => {
  // На Telegram Desktop вход падал, пока signature исключалось из подписываемой строки.
  const initData = await makeInitData(TOKEN, USER, { signature: 'abcDEF-123_xyz' });
  assert.match(initData, /signature=/);
  assert.equal((await checkInitData(initData, TOKEN)).ok, true, 'строка с signature проходит проверку');

  const tampered = initData.replace('signature=abcDEF-123_xyz', 'signature=podmena');
  assert.equal((await checkInitData(tampered, TOKEN)).error, 'bad_signature', 'подменить signature нельзя');
});

test('старая подпись не принимается', async () => {
  const old = Date.now() - INIT_DATA_MAX_AGE_MS - 1000;
  const initData = await makeInitData(TOKEN, USER, { authDate: old });
  assert.equal((await checkInitData(initData, TOKEN)).error, 'expired');
  // но в пределах срока — годится
  const fresh = await makeInitData(TOKEN, USER, { authDate: Date.now() - 60_000 });
  assert.equal((await checkInitData(fresh, TOKEN)).ok, true);
});

test('пустые и битые данные', async () => {
  assert.equal((await checkInitData('', TOKEN)).error, 'no_init_data');
  assert.equal((await checkInitData(null, TOKEN)).error, 'no_init_data');
  assert.equal((await checkInitData('user=x&hash=y', '')).error, 'no_bot_token');
  assert.equal((await checkInitData('нет-подписи', TOKEN)).error, 'bad_init_data');
  const noUser = await makeInitData(TOKEN, null);
  assert.equal((await checkInitData(noUser, TOKEN)).error, 'bad_user');
});

test('подписываемая строка: без hash, но с signature, по алфавиту', () => {
  const params = new URLSearchParams('hash=zzz&user=%7B%7D&auth_date=5&query_id=q&signature=s');
  assert.equal(dataCheckString(params), 'auth_date=5\nquery_id=q\nsignature=s\nuser={}');
});

test('сравнение за постоянное время', () => {
  assert.equal(timingSafeEqual('abc', 'abc'), true);
  assert.equal(timingSafeEqual('abc', 'abd'), false);
  assert.equal(timingSafeEqual('abc', 'abcd'), false);
});

test('админы — из переменной окружения, а не из кода', () => {
  assert.deepEqual(parseAdminIds('111, 222 333'), [111, 222, 333]);
  assert.deepEqual(parseAdminIds(''), []);
  assert.deepEqual(parseAdminIds(undefined), []);
  assert.equal(isAdmin(111, [111, 222]), true);
  assert.equal(isAdmin('111', [111]), true, 'id может прийти строкой');
  assert.equal(isAdmin(333, [111, 222]), false);
});

test('прогресс: что сервер принимает', () => {
  assert.equal(validateState('{"shell:stats:2048":{"played":3}}'), null);
  assert.equal(validateState('{}'), null);
  assert.equal(validateState({ notAString: true }), 'state_type');
  assert.equal(validateState('не json'), 'state_json');
  assert.equal(validateState('[1,2,3]'), 'state_shape');
  assert.equal(validateState(`{"k":"${'x'.repeat(MAX_STATE_BYTES)}"}`), 'state_big');
});

test('имя игрока для списков', () => {
  assert.equal(displayName({ first_name: 'Маша', username: 'masha' }), 'Маша (@masha)');
  assert.equal(displayName({ first_name: 'Маша', last_name: 'Иванова' }), 'Маша Иванова');
  assert.equal(displayName({}), 'Без имени');
});

test('диагностика подписи говорит, какой способ подсчёта подходит', async () => {
  const initData = await makeInitData(TOKEN, USER);
  const good = await diagnoseInitData(initData, TOKEN);
  assert.equal(good.ok, true);
  assert.equal(good.matches.standard, true, 'наш способ: декодированные значения, исключается только hash');
  assert.equal(good.matches.raw, false);
  assert.ok(good.fields.includes('user') && good.fields.includes('hash'));
  assert.ok(good.ageSec >= 0);

  const alien = await diagnoseInitData(initData, '999:another-token');
  assert.equal(alien.ok, false, 'чужой токен — не подходит ни один способ');
  assert.equal(Object.values(alien.matches).some(Boolean), false);
  assert.doesNotMatch(JSON.stringify(alien), /Маша/, 'данные игрока наружу не отдаются');
});

test('список игр бота совпадает с реестром мини-приложения', async () => {
  const { games } = await import('../../shell/registry.js');
  assert.deepEqual(GAMES.map((g) => [g.id, g.title]), games.map((g) => [g.id, g.title]),
    'добавил игру в реестр — добавь её и в GAMES (server/lib.js)');
  for (const g of GAMES) assert.ok(g.emoji && g.about, `${g.id}: нужны значок и описание`);
});

test('поиск игр: начало названия, слово названия, ё = е', () => {
  assert.deepEqual(findGames('суд').map((g) => g.id), ['sudoku']);
  assert.deepEqual(findGames('СЛОВ').map((g) => g.id), ['words'], 'регистр не важен');
  assert.deepEqual(findGames('blast').map((g) => g.id), ['brick-blast', 'block-blast'], 'второе слово');
  assert.equal(findGames('').length, GAMES.length);
  assert.deepEqual(findGames('шахматы'), []);
});

test('ссылка на мини-приложение и строки прогресса', () => {
  assert.equal(startAppLink('bot'), 'https://t.me/bot?startapp');
  assert.equal(startAppLink('bot', 'connect-dots'), 'https://t.me/bot?startapp=connect-dots');
  const lines = progressLines({
    'shell:stats:2048': { played: 5, wins: 1, best: 512 },
    'shell:stats:2048:4': { played: 5, wins: 1, best: 512 },
    'shell:stats:mahjong': { played: 2, wins: 2, best: null },
    'shell:stats:connect-dots': { played: 4, wins: 0, best: 9 },
    'shell:progress:words': 'Уровень 14',
    'shell:stats:wordle': { played: 12, wins: 9, best: 60 },
    'shell:progress:wordle': 'Стрик: 3',
    'shell:stats:old-game': { played: 1, wins: 0, best: null },
  });
  assert.deepEqual(lines, [
    'Слова из слова: Уровень 14',
    'Соедини точки: сыграно 4, рекорд: уровень 9',
    'Маджонг: сыграно 2',
    '2048: сыграно 5, рекорд 512',
    'Wordle: сыграно 12 · Стрик: 3',
    'old-game: сыграно 1',
  ]);
  assert.deepEqual(progressLines({}), []);
});
