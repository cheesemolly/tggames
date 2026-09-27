// Бот: находит мат, не отдаёт фигуры даром, у каждого уровня законный ход, книга — из законных ходов,
// уровни сильнее случайных ходов и друг друга.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { START_FEN, WHITE, fromFen, legalMoves, make, moveFromUci, outcome, uci } from '../rules.js';
import { LEVELS, BOOK, bestMove, chooseMove, bookMove, evaluate, clearTable } from '../engine.js';

const rng = (seed) => () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x80000000;
};

test('дебютная книга: каждая линия — законные ходы, книга ведёт по ним', () => {
  for (const line of BOOK) {
    const pos = fromFen(START_FEN);
    const played = [];
    for (const u of line.split(' ')) {
      assert.ok(moveFromUci(pos, u), `${line}: ход ${u}`);
      assert.ok(bookMove(pos, played, () => 0), `${line}: книга молчит после «${played.join(' ')}»`);
      make(pos, moveFromUci(pos, u));
      played.push(u);
    }
  }
  assert.equal(bookMove(fromFen(START_FEN), ['a2a3'], Math.random), 0, 'вне книги — пусто');
});

test('находит мат в 1 и в 2', () => {
  clearTable();
  const scholar = fromFen('r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4');
  assert.equal(uci(bestMove(scholar, { timeMs: 500 }).move), 'h5f7');
  const two = fromFen('r2qkb1r/pp2nppp/3p4/2pNN1B1/2BnP3/3P4/PPP2PPP/R2bK2R w KQkq - 1 1');
  assert.equal(uci(bestMove(two, { timeMs: 1500 }).move), 'd5f6');
});

test('забирает незащищённого ферзя и не ставит своего под пешку', () => {
  const free = fromFen('4k3/8/8/3q4/8/8/3R4/4K3 w - - 0 1');
  for (const lv of [3, 4, 5]) assert.equal(uci(chooseMove(free, lv, ['x'], rng(lv)).move), 'd2d5', `уровень ${lv}`);
  const pos = fromFen('4k3/8/8/2p5/8/8/8/3QK3 w - - 0 1');
  for (let k = 0; k < 5; k++) assert.notEqual(uci(chooseMove(pos, 4, ['x'], rng(k)).move), 'd1d4', 'ферзь под пешку');
});

test('каждый уровень делает законный ход, пока партия не кончилась', () => {
  for (const lv of LEVELS) {
    if (lv.timeMs) continue;          // верхние — тот же поиск, что в «мат в 2», только дольше
    const pos = fromFen(START_FEN);
    const history = [];
    const random = rng(lv.id);
    for (let ply = 0; ply < 30 && !outcome(pos); ply++) {
      const r = chooseMove(pos, lv.id, history, random);
      assert.ok(legalMoves(pos).includes(r.move), `уровень ${lv.id}, полуход ${ply}`);
      history.push(uci(r.move));
      make(pos, r.move);
    }
  }
});

test('оценка симметрична: зеркальная позиция с другим ходом — та же оценка', () => {
  const a = fromFen('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3');
  const b = fromFen('rnbqkb1r/pppp1ppp/5n2/4p3/4P3/2N5/PPPP1PPP/R1BQKBNR b KQkq - 2 3');
  assert.ok(evaluate(a) === evaluate(b), `${evaluate(a)} и ${evaluate(b)}`);
});

/** Партия двух ботов (или 'random'); → 1 белые, 0 чёрные, 0.5 ничья; лимит ходов — по оценке. */
function duel(white, black, random, maxPly = 160) {
  const pos = fromFen(START_FEN);
  const history = [];
  for (let ply = 0; ply < maxPly; ply++) {
    const end = outcome(pos);
    if (end) return end.winner === undefined ? 0.5 : end.winner === WHITE ? 1 : 0;
    const who = pos.turn === WHITE ? white : black;
    const moves = legalMoves(pos);
    const move = who === 'random' ? moves[Math.floor(random() * moves.length)] : chooseMove(pos, who, history, random).move;
    history.push(uci(move));
    make(pos, move);
  }
  const e = evaluate(pos) * (pos.turn === WHITE ? 1 : -1);
  return e > 200 ? 1 : e < -200 ? 0 : 0.5;
}

test('«Новичок» обыгрывает случайные ходы, «Любитель» — «Новичка»', () => {
  const random = rng(7);
  let score = 0;
  for (let g = 0; g < 4; g++) score += g % 2 ? 1 - duel('random', 1, random) : duel(1, 'random', random);
  assert.ok(score >= 3, `Новичок против случайных: ${score} из 4`);
  score = 0;
  for (let g = 0; g < 4; g++) score += g % 2 ? 1 - duel(1, 3, random) : duel(3, 1, random);
  assert.ok(score >= 3, `Любитель против Новичка: ${score} из 4`);
});
