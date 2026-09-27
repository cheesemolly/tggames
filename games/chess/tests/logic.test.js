// Партия без экрана: сохранение, статистика, съеденные фигуры, запись по-русски; звуки.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { START_FEN, WHITE, BLACK, PAWN, QUEEN, ROOK, fromFen } from '../rules.js';
import { isValidGame, isValidStats, emptyStats, capturedOf, ruSan, recordGame, HINTS_PER_GAME } from '../logic.js';
import { createSounds, SOUNDS } from '../sounds.js';
import { fakeContext } from '../../../shared/tests/fake-audio.js';

const game = (moves, extra = {}) => ({ v: 1, startFen: START_FEN, moves, level: 3, player: WHITE, hints: HINTS_PER_GAME, ...extra });

test('сохранение: законные ходы — да; мусор, незаконный ход и оконченная партия — нет', () => {
  assert.ok(isValidGame(game([])));
  assert.ok(isValidGame(game(['e2e4', 'e7e5', 'g1f3'])));
  assert.ok(isValidGame(game(['e2e4'], { player: BLACK, level: 7, hints: 0 })));
  assert.ok(!isValidGame(game(['e2e5'])));
  assert.ok(!isValidGame(game([42])));
  assert.ok(!isValidGame(game(['f2f3', 'e7e5', 'g2g4', 'd8h4'])), 'мат — партия окончена');
  assert.ok(!isValidGame(game([], { level: 99 })));
  assert.ok(!isValidGame(game([], { player: 3 })));
  assert.ok(!isValidGame(game([], { hints: 7 })));
  assert.ok(!isValidGame(game([], { startFen: 'мусор' })));
  assert.ok(!isValidGame(null));
});

test('статистика по уровням', () => {
  const s = emptyStats();
  assert.ok(isValidStats(s));
  recordGame(s, 3, 'win');
  recordGame(s, 3, 'draw');
  recordGame(s, 5, 'lose');
  assert.deepEqual(s[3], { played: 2, wins: 1, losses: 0, draws: 1 });
  assert.deepEqual(s[5], { played: 1, wins: 0, losses: 1, draws: 0 });
  assert.ok(!isValidStats({ 1: { played: -1 } }));
  assert.ok(!isValidStats(null));
});

test('съеденные фигуры и перевес; превращённая пешка — не съеденная', () => {
  const start = capturedOf(fromFen(START_FEN).board, WHITE);
  assert.equal(start.material, 39);
  assert.ok(start.out.every((n) => n === 0));
  // у белых нет ладьи a1 и пешки a2, зато два ферзя (пешка превратилась)
  const w = capturedOf(fromFen('rnbqkbnr/pppppppp/8/8/8/8/1PPPPPPP/QNBQKBNR w Kkq - 0 1').board, WHITE);
  assert.equal(w.out[ROOK], 1);
  assert.equal(w.out[PAWN], 0, 'пешка стала ферзём');
  assert.equal(w.out[QUEEN], 0);
  assert.equal(w.material, 39 - 5 - 1 + 9);
});

test('запись по-русски', () => {
  assert.equal(ruSan('Nf3'), 'Кf3');
  assert.equal(ruSan('Kxe2'), 'Крxe2');
  assert.equal(ruSan('Qh4#'), 'Фh4#');
  assert.equal(ruSan('Rad1'), 'Лad1');
  assert.equal(ruSan('Bb5+'), 'Сb5+');
  assert.equal(ruSan('exd8=Q+'), 'exd8=Ф+');
  assert.equal(ruSan('O-O-O'), 'O-O-O');
  assert.equal(ruSan('e4'), 'e4');
});

test('каждый звук шахмат звучит, все узлы подключены', () => {
  const { ctx, created } = fakeContext();
  const sounds = createSounds(ctx);
  for (const name of SOUNDS) {
    assert.ok(sounds.has(name), `нет звука ${name}`);
    for (const opts of [{}, { opponent: true }]) {
      const before = created.length;
      sounds.play(name, opts);
      const fresh = created.slice(before);
      assert.ok(fresh.some((n) => n.kind === 'osc' || n.kind === 'buffer'), `${name}: нет источника звука`);
      for (const n of fresh) assert.ok(n.connections > 0, `${name}: узел ${n.kind} ни к чему не подключён`);
    }
  }
});
