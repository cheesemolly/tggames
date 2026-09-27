// Правила шахмат: perft (число позиций на глубину — эталоны chessprogramming.org), особые ходы, конец партии,
// запись ходов. Ошибка генератора ходов не падает, а тихо делает игру неправильной — поэтому перебор.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  START_FEN, fromFen, toFen, perft, legalMoves, make, unmake, outcome, san, uci, moveFromUci, inCheck, key,
} from '../rules.js';

const PERFT = [
  ['начальная', START_FEN, [20, 400, 8902, 197281]],
  ['Kiwipete', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862]],
  ['позиция 3', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238]],
  ['позиция 4', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
  ['позиция 4 зеркально', 'r2q1rk1/pP1p2pp/Q4n2/bbp1p3/Np6/1B3NBn/pPPP1PPP/R3K2R b KQ - 0 1', [6, 264, 9467]],
  ['позиция 5', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]],
  ['позиция 6', 'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10', [46, 2079, 89890]],
];

for (const [name, fen, counts] of PERFT) {
  test(`perft: ${name}`, () => {
    const pos = fromFen(fen);
    counts.forEach((n, k) => assert.equal(perft(pos, k + 1), n, `глубина ${k + 1}`));
    assert.equal(toFen(pos), fen, 'после перебора позиция вернулась в исходную');
  });
}

const play = (fen, moves) => {
  const pos = fromFen(fen);
  for (const u of moves.split(' ').filter(Boolean)) {
    const m = moveFromUci(pos, u);
    assert.ok(m, `ход ${u} должен быть возможен`);
    make(pos, m);
  }
  return pos;
};
const has = (pos, u) => legalMoves(pos).some((m) => uci(m) === u);

test('FEN туда и обратно, хэш не зависит от пути к позиции', () => {
  for (const [, fen] of PERFT) assert.equal(toFen(fromFen(fen)), fen);
  const a = play(START_FEN, 'g1f3 g8f6 b1c3 b8c6');
  const b = play(START_FEN, 'b1c3 b8c6 g1f3 g8f6');
  assert.equal(key(a), key(b));
  assert.equal(key(a), key(fromFen(toFen(a))));
});

test('рокировка: нельзя через битое поле, под шахом и после хода короля или ладьи', () => {
  const free = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
  assert.ok(has(fromFen(free), 'e1g1') && has(fromFen(free), 'e1c1'));
  assert.ok(!has(fromFen('r3k2r/8/8/8/8/8/8/R3K2R w - - 0 1'), 'e1g1'), 'без права рокировки');
  assert.ok(!has(fromFen('r3k2r/8/8/8/8/5r2/8/R3K2R w KQkq - 0 1'), 'e1g1'), 'f1 под боем');
  assert.ok(!has(fromFen('r3k2r/8/8/8/8/4r3/8/R3K2R w KQkq - 0 1'), 'e1g1'), 'король под шахом');
  assert.ok(has(fromFen('r3k2r/8/8/8/8/1r6/8/R3K2R w KQkq - 0 1'), 'e1c1'), 'b1 под боем — длинной можно');
  assert.ok(!has(fromFen('r3k2r/8/8/8/8/8/8/RN2K2R w KQkq - 0 1'), 'e1c1'), 'b1 занято — нельзя');
  const moved = play(free, 'h1h2 a8a7 h2h1 a7a8');
  assert.ok(!has(moved, 'e1g1') && has(moved, 'e1c1'), 'ладья h1 ходила');
  const kingMoved = play(free, 'e1e2 a8a7 e2e1 a7a8');
  assert.ok(!has(kingMoved, 'e1g1') && !has(kingMoved, 'e1c1'), 'король ходил');
  const rookTaken = play('r3k2r/8/8/8/8/8/8/R3K1NR b KQkq - 0 1', 'h8h1');
  assert.ok(!has(rookTaken, 'e1g1'), 'ладья h1 съедена');
});

test('взятие на проходе — только сразу, и не если открывает шах своему королю', () => {
  const pos = play(START_FEN, 'e2e4 a7a6 e4e5 d7d5');
  assert.ok(has(pos, 'e5d6'));
  make(pos, moveFromUci(pos, 'e5d6'));
  assert.equal(pos.board[0x43], 0, 'пешка d5 снята');
  unmake(pos);
  const late = play(START_FEN, 'e2e4 a7a6 e4e5 d7d5 b1c3 a6a5');
  assert.ok(!has(late, 'e5d6'), 'через ход — уже нельзя');
  // король a5 и ладья h5: после взятия обе пешки уходят с 5-й горизонтали — шах своему королю
  assert.ok(!has(fromFen('8/8/8/K2pP2r/8/8/8/7k w - d6 0 1'), 'e5d6'));
});

test('превращение — в четыре фигуры, и со взятием', () => {
  const pos = fromFen('1r5k/P7/8/8/8/8/8/K7 w - - 0 1');
  const promos = legalMoves(pos).map(uci).filter((u) => u.startsWith('a7')).sort();
  assert.deepEqual(promos, ['a7a8b', 'a7a8n', 'a7a8q', 'a7a8r', 'a7b8b', 'a7b8n', 'a7b8q', 'a7b8r']);
});

test('конец партии: мат, пат, мало фигур, 50 ходов, троекратное повторение', () => {
  const mate = play(START_FEN, 'f2f3 e7e5 g2g4 d8h4');
  assert.deepEqual(outcome(mate), { result: 'checkmate', winner: 8 });
  assert.ok(inCheck(mate));
  assert.equal(outcome(fromFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'))?.result, 'stalemate');
  assert.equal(outcome(fromFen('8/8/4k3/8/8/3K4/8/8 w - - 0 1'))?.result, 'material');
  assert.equal(outcome(fromFen('8/8/4k3/8/8/3KB3/8/8 w - - 0 1'))?.result, 'material', 'король и слон');
  assert.equal(outcome(fromFen('8/8/4k3/8/8/3KN3/8/8 w - - 0 1'))?.result, 'material', 'король и конь');
  assert.equal(outcome(fromFen('8/8/3bk3/8/8/3KB3/8/8 w - - 0 1'))?.result, 'material', 'слоны одного цвета (d6 и e3)');
  assert.equal(outcome(fromFen('8/8/2b1k3/8/8/3KB3/8/8 w - - 0 1')), null, 'слоны разного цвета (c6 и e3) — мат возможен');
  assert.equal(outcome(fromFen('8/8/4k3/8/8/3KP3/8/8 w - - 0 1')), null, 'пешка — не ничья');
  assert.equal(outcome(fromFen('8/8/4k3/8/8/3KR3/8/8 w - - 99 80')), null);
  assert.equal(outcome(fromFen('8/8/4k3/8/8/3KR3/8/8 w - - 100 80'))?.result, 'fifty');
  const shuffle = 'g1f3 g8f6 f3g1 f6g8';
  assert.equal(outcome(play(START_FEN, shuffle)), null, 'дважды — ещё не ничья');
  assert.equal(outcome(play(START_FEN, `${shuffle} ${shuffle}`))?.result, 'repetition');
});

test('запись ходов (SAN): рокировки, взятия, уточнение, превращение, шах и мат', () => {
  const sanOf = (fen, u) => {
    const pos = fromFen(fen);
    return san(pos, moveFromUci(pos, u));
  };
  assert.equal(sanOf(START_FEN, 'g1f3'), 'Nf3');
  assert.equal(sanOf(START_FEN, 'e2e4'), 'e4');
  assert.equal(sanOf('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'e1g1'), 'O-O');
  assert.equal(sanOf('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'e1c1'), 'O-O-O');
  assert.equal(sanOf('4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1', 'e4d5'), 'exd5');
  assert.equal(sanOf('4k3/8/8/8/8/8/8/1N2KN2 w - - 0 1', 'b1d2'), 'Nbd2');
  assert.equal(sanOf('4k3/8/8/8/8/8/8/1N2KN2 w - - 0 1', 'f1d2'), 'Nfd2');
  assert.equal(sanOf('4k3/8/8/8/R7/8/8/R3K3 w - - 0 1', 'a1a2'), 'R1a2');
  assert.equal(sanOf('7k/P7/8/8/8/8/8/K7 w - - 0 1', 'a7a8q'), 'a8=Q+');
  assert.equal(sanOf('rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2', 'd8h4'), 'Qh4#');
});
