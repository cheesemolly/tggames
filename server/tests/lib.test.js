import test from 'node:test';
import assert from 'node:assert/strict';

import {
  checkInitData, diagnoseInitData, dataCheckString, validateState, parseAdminIds, isAdmin, displayName,
  timingSafeEqual, MAX_STATE_BYTES, INIT_DATA_MAX_AGE_MS,
  GAMES, findGames, startAppLink, progressLines, shiftEntities, boardScores, boardName, reportMessage,
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
  ], 'неизвестные игры (ключи пишет клиент) не показываются');
  assert.deepEqual(progressLines({}), []);
  // строка прогресса от клиента не становится ссылкой, упоминанием или простынёй
  const [evil] = progressLines({ 'shell:progress:words': 'Уровень 5 заходи на evil.com @scam https://x.y/z' + 'а'.repeat(100) });
  assert.doesNotMatch(evil, /[.@/]/, 'ни точки, ни @, ни / — ссылкой это не станет');
  assert.ok(evil.length <= 'Слова из слова: '.length + 60);
});

test('рейтинг: неправдоподобные очки не попадают, побед не больше сыгранных, 2048 — степень двойки', () => {
  const ok = boardScores({
    'shell:progress:words': 'Уровень 40',
    'shell:stats:2048': { played: 3, best: 1024 },
    'shell:stats:sudoku': { played: 10, wins: 7 },
  });
  assert.deepEqual(ok, { words: 40, 2048: 1024, sudoku: 7 });
  const fake = boardScores({
    'shell:progress:words': 'Уровень 99999',
    'shell:stats:2048': { played: 3, best: 1000 },
    'shell:stats:sudoku': { played: 2, wins: 50 },
    'shell:stats:snake': { played: 1, best: 999999999 },
  });
  assert.deepEqual(fake, {});
  assert.equal(boardName('Ма‮ша​'), 'Маша', 'служебные символы направления текста вырезаны');
});

test('отзыв владельцу: после экранирования влезает в сообщение Telegram', () => {
  const note = reportMessage({ name: 'Маша', username: 'masha', tgId: 42, text: '<'.repeat(1000), source: 'bot' });
  assert.ok(note.length < 4096, `длина ${note.length}`);
  assert.match(note, /&lt;/);
});

test('оформление: сдвиг разметки на вырезанную команду', () => {
  const raw = '/broadcast девлог\nобщее\n- пункт';
  const cut = '/broadcast '.length;
  const text = raw.slice(cut);
  const ents = [
    { type: 'bot_command', offset: 0, length: 10 },
    { type: 'bold', offset: cut, length: 6 },
    { type: 'expandable_blockquote', offset: cut + 7, length: text.length - 7 },
  ];
  const out = shiftEntities(ents, cut, text.length);
  assert.deepEqual(out.map((e) => e.type), ['bold', 'expandable_blockquote'], 'команда выброшена');
  assert.equal(text.slice(out[0].offset, out[0].offset + out[0].length), 'девлог');
  assert.equal(text.slice(out[1].offset, out[1].offset + out[1].length), 'общее\n- пункт');
  // разметка, начатая до cut, обрезается слева; выходящая за текст — справа
  assert.deepEqual(shiftEntities([{ type: 'italic', offset: 2, length: 20 }], 5, 10), [{ type: 'italic', offset: 0, length: 10 }]);
  // эмодзи — 2 единицы UTF-16, как и в Telegram
  const emoji = '/b \u{1F354} бургер';
  assert.deepEqual(shiftEntities([{ type: 'bold', offset: 6, length: 6 }], 3, emoji.length - 3), [{ type: 'bold', offset: 3, length: 6 }]);
  assert.deepEqual(shiftEntities(null, 3, 10), []);
});

test('рейтинг Филворда — все найденные слова: пройденные уровни × слов по размеру + бонусные + начатый уровень', async () => {
  const { boggleWords, BOGGLE_WORDS_BY_SIZE, BOARDS } = await import('../lib.js');
  const { WORDS_BY_SIZE, SIZES } = await import('../../games/boggle/logic.js');
  assert.deepEqual(BOGGLE_WORDS_BY_SIZE, Object.fromEntries(SIZES.map((n) => [n, WORDS_BY_SIZE[n]])),
    'число слов по размерам — как в игре');
  const state = {
    'game:boggle:stats': {
      5: { played: 3, best: 200, bonus: 4 },      // 3 × 5 + 4 = 19
      8: { played: 2, best: 900, bonus: 10 },     // 2 × 12 + 10 = 34
      12: { played: 50, best: 1, bonus: 50 },     // старый размер — не считается
    },
    'game:boggle:current': { size: 8, found: [{ word: 'кот' }, { word: 'нос' }], bonus: ['сон'] },   // + 3
  };
  assert.equal(boggleWords(state), 56);
  assert.equal(BOARDS.boggle.text(56), '56 слов');
  assert.equal(boggleWords({}), 0);
  assert.equal(boggleWords({ 'game:boggle:stats': { 5: { played: -3, bonus: 'x' } } }), 0);
});

test('рейтинг: у каждой игры своя мера, мусор и нули не попадают', async () => {
  const { BOARDS, boardScores, boardName, plural, levelOf } = await import('../lib.js');
  assert.deepEqual(Object.keys(BOARDS).sort(), GAMES.map((g) => g.id).sort(), 'у каждой игры есть рейтинг');
  for (const [id, b] of Object.entries(BOARDS)) assert.ok(b.by && typeof b.text(5) === 'string', id);
  assert.deepEqual(boardScores({
    'shell:progress:words': 'Уровень 4',
    'shell:stats:block-blast': { played: 3, best: 1520 },
    'shell:stats:sudoku': { played: 3, wins: 0 },           // ноль — не в рейтинге
    'shell:stats:2048': { best: 'много' },                  // мусор
    'game:flags:stats': { correct: 1e12 },                  // явно испорчено
  }), { words: 4, 'block-blast': 1520 });
  assert.deepEqual(boardScores(null), {});
  assert.equal(levelOf('Уровень 14'), 14);
  assert.equal(levelOf('Стрик: 3'), null);
  assert.deepEqual([1, 2, 5, 11, 21, 104, 112].map((n) => plural(n, ['очко', 'очка', 'очков'])),
    ['очко', 'очка', 'очков', 'очков', 'очко', 'очка', 'очков']);
  assert.equal(boardName('   '), 'Игрок');
  assert.equal(boardName('Очень-очень-длинное-имя-игрока-тут'), 'Очень-очень-длинное-имя-');
});

test('общий рейтинг: очки за места и порядок при равенстве', async () => {
  const { overallPoints, overallRanking, OVERALL_MIN } = await import('../lib.js');
  assert.deepEqual([1, 2, 3, 5, 10, 20].map(overallPoints), [100, 93, 86, 75, 52, 25]);
  assert.equal(overallPoints(500), OVERALL_MIN, 'любой результат — не меньше 10');
  for (let p = 1; p < 60; p++) assert.ok(overallPoints(p) >= overallPoints(p + 1), 'дальше место — не больше очков');

  const row = (user_id, game_id, place, updated_at = 1) => ({ user_id, game_id, place, name: `И${user_id}`, pid: `p${user_id}`, updated_at });
  const games = new Set(['a', 'b', 'c', 'd']);
  const list = overallRanking([
    row(1, 'a', 1), row(1, 'b', 3),         // 100 + 86 = 186, одно первое
    row(2, 'a', 3), row(2, 'b', 1),         // 186, одно первое, но позже
    row(2, 'c', 99, 5),                     // …и ещё 10 за любой результат — выше
    row(3, 'a', 2), row(3, 'b', 2),         // 186, первых нет
    row(4, 'c', 1, 2), row(4, 'd', 5, 2),   // 175
    row(5, 'secret', 1),                    // игра не считается (например, в бете)
  ], games);
  assert.deepEqual(list.map((p) => [p.place, p.user_id, p.points, p.firsts, p.podiums, p.games]), [
    [1, 2, 196, 1, 2, 3],
    [2, 1, 186, 1, 2, 2],
    [3, 3, 186, 0, 2, 2],
    [4, 4, 175, 1, 1, 2],
  ]);
  const tie = overallRanking([row(1, 'a', 2, 9), row(2, 'b', 2, 3)], games);
  assert.deepEqual(tie.map((p) => p.user_id), [2, 1], 'при полном равенстве выше тот, кто набрал раньше');
});

test('рейтинг без разработчика: места пересчитаны; ник для поиска', async () => {
  const { withoutUsers, parseUsername } = await import('../lib.js');
  const rows = [
    { user_id: 7, game_id: 'a', place: 1, total: 3 }, { user_id: 1, game_id: 'a', place: 2, total: 3 },
    { user_id: 2, game_id: 'a', place: 3, total: 3 }, { user_id: 7, game_id: 'b', place: 1, total: 1 },
  ];
  assert.deepEqual(withoutUsers(rows, new Set([7])).map((r) => [r.user_id, r.game_id, r.place, r.total]), [[1, 'a', 1, 2], [2, 'a', 2, 2]]);
  assert.equal(withoutUsers(rows, new Set()), rows);
  assert.equal(parseUsername('@Cheese_Molly'), 'cheese_molly');
  assert.equal(parseUsername('https://t.me/abcd'), 'abcd');
  assert.equal(parseUsername('t.me/abcd'), 'abcd');
  for (const bad of ['', '@', 'abc', 'a b c d', '<script>', 'x'.repeat(33), 'имя_игрока']) assert.equal(parseUsername(bad), null, bad);
});

test('поиск игроков: имя и ник, кириллица, ё = е, порядок', async () => {
  const { matchPlayers, foldSearch } = await import('../lib.js');
  assert.equal(foldSearch('  @ЁЖИК  Иван '), 'ежик иван');
  const c = [
    { id: 1, name: 'Марина', username: 'mrn', seen: 1 },
    { id: 2, name: 'Мария', username: null, seen: 5 },
    { id: 3, name: 'Ann', username: 'marik', seen: 9 },
    { id: 4, name: 'Анна Мария', username: 'anna', seen: 2 },
    { id: 5, name: 'мар', username: 'x_y', seen: 0 },
  ];
  const ids = (q) => matchPlayers(c, q).map((p) => p.id);
  assert.deepEqual(ids('мар'), [5, 2, 4, 1], 'имя целиком — первым, дальше начало имени (любого слова) по свежести');
  assert.deepEqual(ids('mar'), [3], 'латиница — по нику');
  assert.deepEqual(ids('@MRN'), [1]);
  assert.deepEqual(ids(''), []);
  assert.equal(matchPlayers(Array.from({ length: 30 }, (_, i) => ({ id: i, name: 'Дима', username: null })), 'д').length, 10);
});
