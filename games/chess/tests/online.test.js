// Партия с другом по сети без экрана: сервер правил не знает, поэтому присланные ходы проверяет игра; итог и
// статистика таких партий. Комната — как её отдаёт сервер (roomView в server/lib.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WHITE, BLACK } from '../rules.js';
import {
  onlineColor, rivalName, checkLine, onlineResult, onlineStats, recordOnline, emptyOnline, isValidOnline,
  emptyStats, isValidStats, recordGame,
} from '../logic.js';
import { kindAt, ruleFor } from '../../../server/merge.js';
import { ROOM_GAMES } from '../../../server/lib.js';

const room = (extra = {}) => ({
  code: 'abcdefghij', game: 'chess', status: 'play', seq: 2, you: 0, first: 0, turn: 0, moves: [],
  players: [{ name: 'Маша' }, { name: 'Петя' }], result: null, at: 0, ...extra,
});
const MATE = ['f2f3', 'e7e5', 'g2g4', 'd8h4'];          // «дурацкий мат»: белые получили мат

test('цвет: белыми играет тот, кто ходит первым; имя соперника', () => {
  assert.equal(onlineColor(room({ you: 0, first: 0 })), WHITE);
  assert.equal(onlineColor(room({ you: 1, first: 0 })), BLACK);
  assert.equal(onlineColor(room({ you: 0, first: 1 })), BLACK);
  assert.equal(onlineColor(room({ you: 1, first: 1 })), WHITE);
  assert.equal(rivalName(room({ you: 0 })), 'Петя');
  assert.equal(rivalName(room({ you: 1 })), 'Маша');
  assert.equal(rivalName(room({ players: [{ name: 'Маша' }, null] })), null, 'друг ещё не пришёл');
});

test('присланные ходы проверяются по правилам: незаконный ход, мусор и ход после мата не проходят', () => {
  assert.deepEqual(checkLine([]), { ok: true, over: null });
  assert.deepEqual(checkLine(['e2e4', 'e7e5', 'g1f3']), { ok: true, over: null });
  const mate = checkLine(MATE);
  assert.equal(mate.ok, true);
  assert.deepEqual(mate.over, { result: 'checkmate', winner: BLACK });

  assert.equal(checkLine(['e2e5']).ok, false, 'пешка так не ходит');
  assert.equal(checkLine(['e2e4', 'e2e4']).ok, false, 'ход не в свою очередь');
  assert.equal(checkLine(['e2e4', 'e7e5', 'e1e2', 'e8e7', 'e2e1', 'e7e8', 'e1g1']).ok, false, 'рокировка после хода королём');
  assert.equal(checkLine([...MATE, 'e2e4']).ok, false, 'ход после мата');
  for (const junk of [null, undefined, 'e2e4', [42], [null], ['e2e4', { move: 'e7e5' }], ['zzzz']]) {
    assert.equal(checkLine(junk).ok, false, JSON.stringify(junk));
  }
});

test('итог партии: мат и ничья — по правилам, сдача — из комнаты; сдача до первых ходов — партия не состоялась', () => {
  assert.equal(onlineResult(room(), null), null, 'партия идёт');
  // я белыми, мне мат
  const lost = onlineResult(room({ moves: MATE, status: 'over', result: { by: 'checkmate', winner: 1 } }), checkLine(MATE).over);
  assert.deepEqual(lost, { result: 'lose', reason: 'checkmate' });
  // я чёрными, мат поставил я
  const won = onlineResult(room({ you: 1, moves: MATE, status: 'over', result: { by: 'checkmate', winner: 1 } }), checkLine(MATE).over);
  assert.deepEqual(won, { result: 'win', reason: 'checkmate' });
  // правила важнее того, что записано в комнате: соперник «объявил» себе победу, а на доске — ничья
  assert.deepEqual(onlineResult(room({ status: 'over', result: { by: 'checkmate', winner: 1 } }), { result: 'stalemate' }),
    { result: 'draw', reason: 'stalemate' });

  const moves = ['e2e4', 'e7e5'];
  assert.deepEqual(onlineResult(room({ moves, status: 'over', result: { by: 'resign', winner: 0 } }), null), { result: 'win', reason: 'resign' });
  assert.deepEqual(onlineResult(room({ moves, status: 'over', result: { by: 'resign', winner: 1 } }), null), { result: 'lose', reason: 'resign' });
  assert.deepEqual(onlineResult(room({ moves: ['e2e4'], status: 'over', result: { by: 'resign', winner: 1 } }), null), { result: 'void', reason: 'resign' });
  assert.deepEqual(onlineResult(room({ moves: [], status: 'over', result: { by: 'resign', winner: 0 } }), null), { result: 'void', reason: 'resign' });
  // партию закрыл сервер, а по правилам она не окончена (такого быть не должно) — итог как в комнате
  assert.deepEqual(onlineResult(room({ moves, status: 'over', result: { by: 'fifty', winner: null } }), null), { result: 'draw', reason: 'ended' });
});

test('причины конца партии, которые шлёт игра, сервер знает — и наоборот', () => {
  const reasons = ['checkmate', 'stalemate', 'repetition', 'fifty', 'material'];       // rules.js outcome().result
  assert.deepEqual(Object.keys(ROOM_GAMES.chess.ends).sort(), [...reasons].sort());
  assert.equal(ROOM_GAMES.chess.ends.checkmate, 'win');
  for (const draw of reasons.slice(1)) assert.equal(ROOM_GAMES.chess.ends[draw], 'draw');
  // ходы уходят на сервер в том же виде, в каком лежат в партии (UCI)
  for (const u of [...MATE, 'e7e8q', 'a2a1n']) assert.ok(ROOM_GAMES.chess.move.test(u), u);
});

test('статистика партий с другом — отдельная строка, старым сохранениям не мешает и складывается между устройствами', () => {
  const stats = emptyStats();
  assert.deepEqual(onlineStats(stats), emptyOnline(), 'у старого сохранения строки нет — нули');
  assert.equal(stats.online, undefined, 'чтение ничего не добавляет');
  recordOnline(stats, 'win');
  recordOnline(stats, 'lose');
  recordOnline(stats, 'draw');
  recordOnline(stats, 'win');
  recordOnline(stats, 'void');
  assert.deepEqual(stats.online, { played: 4, wins: 2, losses: 1, draws: 1 }, 'несостоявшаяся партия не считается');
  assert.ok(isValidStats(stats), 'статистика с новой строкой проходит прежнюю проверку');
  recordGame(stats, 3, 'win');
  assert.deepEqual(stats[3], { played: 1, wins: 1, losses: 0, draws: 0 }, 'уровни бота — как раньше');

  // битая строка — считаем заново, а не падаем
  const broken = { ...emptyStats(), online: { played: 'много' } };
  assert.deepEqual(onlineStats(broken), emptyOnline());
  assert.deepEqual(recordOnline(broken, 'win').online, { played: 1, wins: 1, losses: 0, draws: 0 });

  // слияние: счётчики партий с другом — по устройствам, как у уровней бота
  for (const field of ['played', 'wins', 'losses', 'draws']) assert.equal(kindAt('game:chess:stats', `online.${field}`), 'count', field);
  assert.equal(ruleFor('game:chess:online').type, 'lww', 'запись о начатой партии — от записанного позже');
});

test('запись о начатой партии с другом: код комнаты, имя и «открывать её»', () => {
  assert.ok(isValidOnline({ code: 'abcdefghij', name: 'Петя', on: true }));
  assert.ok(isValidOnline({ code: '0123456789', name: null, on: false }), 'друг ещё не пришёл');
  for (const bad of [null, {}, { code: 'short', name: null, on: true }, { code: 'ABCDEFGHIJ', name: null, on: true },
    { code: 'abcdefghij', name: 5, on: true }, { code: 'abcdefghij', name: null }, { code: '../../admin', name: null, on: true }]) {
    assert.ok(!isValidOnline(bad), JSON.stringify(bad));
  }
});
