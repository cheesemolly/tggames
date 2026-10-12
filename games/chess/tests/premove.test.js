// Ход заранее (премув) без экрана: какие ходы можно задать, пока ходит соперник, и что из заданного играется
// после его ответа. Список ходов сверяется с перебором «в лоб» на случайных партиях.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  START_FEN, QUEEN, FLAG, colorOf, fromOf, toOf, promoOf, flagsOf, sqFrom, sqName,
  fromFen, toFen, make, legalMoves, moveFromUci, uci, outcome,
} from '../rules.js';
import { premoveTargets, premoveMove } from '../logic.js';

const pre = (from, to) => ({ from: sqFrom(from), to: sqFrom(to) });
/** Куда фигура с клетки from может пойти заранее в позиции fen (ход соперника). */
const targets = (fen, from) => [...(premoveTargets(fromFen(fen)).get(sqFrom(from)) ?? [])].map(sqName).sort();
/** Позиция после ответа соперника reply (UCI). */
const after = (fen, reply) => {
  const p = fromFen(fen);
  make(p, moveFromUci(p, reply));
  return p;
};

const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

test('заранее можно задать то, что станет законным хотя бы после одного ответа соперника', () => {
  assert.deepEqual(targets(AFTER_E4, 'g1'), ['e2', 'f3', 'h3']);
  assert.deepEqual(targets(AFTER_E4, 'f1'), ['a6', 'b5', 'c4', 'd3', 'e2']);
  assert.deepEqual(targets(AFTER_E4, 'd1'), ['e2', 'f3', 'g4', 'h5']);
  assert.deepEqual(targets(AFTER_E4, 'e1'), ['e2']);
  assert.deepEqual(targets(AFTER_E4, 'd2'), ['d3', 'd4']);
  // пешка: вперёд и взятия туда, куда чёрные могут встать этим ходом (…d5, …f5)
  assert.deepEqual(targets(AFTER_E4, 'e4'), ['d5', 'e5', 'f5']);
  // запертым фигурам идти некуда: свои фигуры с места не сойдут, а побить их за один ход нельзя
  assert.deepEqual(targets(AFTER_E4, 'a1'), []);
  assert.deepEqual(targets(AFTER_E4, 'c1'), []);
  assert.deepEqual(targets(AFTER_E4, 'b1'), ['a3', 'c3']);
  // чужими фигурами и с пустой клетки ход не задать
  assert.deepEqual(targets(AFTER_E4, 'e7'), []);
  assert.deepEqual(targets(AFTER_E4, 'e5'), []);
});

test('ответное взятие: поле своей фигуры годится, только если соперник может её побить', () => {
  // 1.d4 e5 2.dxe5 Кc6 3.Кf3 — пешку e5 чёрные могут побить конём, белый конь заранее бьёт в ответ
  const fen = 'r1bqkbnr/pppp1ppp/2n5/4P3/8/5N2/PPP1PPPP/RNBQKB1R b KQkq - 2 3';
  assert.deepEqual(targets(fen, 'f3'), ['d2', 'd4', 'e5', 'g1', 'g5', 'h4']);
  const took = after(fen, 'c6e5');
  const back = premoveMove(took, pre('f3', 'e5'));
  assert.equal(uci(back), 'f3e5');
  assert.ok(flagsOf(back) & FLAG.capture);
  // чёрные не побили — на своё поле не пойти, ход снимается
  assert.equal(premoveMove(after(fen, 'g8f6'), pre('f3', 'e5')), null);
});

test('взятие на проходе и рокировку можно задать заранее', () => {
  // 1.e4 e6 2.e5: пешка e5 упёрлась, но …d5 и …f5 можно взять на проходе (а …d6 и …f6 — просто взять)
  const fen = 'rnbqkbnr/pppp1ppp/4p3/4P3/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2';
  assert.deepEqual(targets(fen, 'e5'), ['d6', 'f6']);
  const ep = premoveMove(after(fen, 'd7d5'), pre('e5', 'd6'));
  assert.ok(flagsOf(ep) & FLAG.ep, 'после …d5 это взятие на проходе');
  assert.equal(premoveMove(after(fen, 'a7a6'), pre('e5', 'd6')), null, 'брать нечего');

  // 1.e4 e5 2.Кf3 Кc6 3.Сc4 — белые готовы рокировать
  const italian = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3';
  assert.deepEqual(targets(italian, 'e1'), ['e2', 'f1', 'g1']);
  const castle = premoveMove(after(italian, 'g8f6'), pre('e1', 'g1'));
  assert.ok(flagsOf(castle) & FLAG.castle);
});

test('пешка, заданная заранее на последнюю горизонталь, становится ферзём', () => {
  const fen = '8/P6k/8/8/8/8/8/K7 b - - 0 1';
  assert.deepEqual(targets(fen, 'a7'), ['a8']);
  const m = premoveMove(after(fen, 'h7g7'), pre('a7', 'a8'));
  assert.equal(uci(m), 'a7a8q');
  assert.equal(promoOf(m), QUEEN);
});

test('заданный ход играется, только если он по правилам после ответа соперника', () => {
  assert.equal(uci(premoveMove(after(AFTER_E4, 'e7e5'), pre('g1', 'f3'))), 'g1f3');
  assert.equal(premoveMove(after(AFTER_E4, 'e7e5'), pre('e4', 'e5')), null, 'поле заняли');
  assert.equal(premoveMove(after(AFTER_E4, 'e7e5'), pre('e4', 'd5')), null, 'бить нечего');
  assert.equal(uci(premoveMove(after(AFTER_E4, 'd7d5'), pre('e4', 'd5'))), 'e4d5');
  // 1.d4 e6 2.c4 Сb4+ — от шаха спасает только ход, который его закрывает
  const fen = 'rnbqkbnr/pppp1ppp/4p3/8/2PP4/8/PP2PPPP/RNBQKBNR b KQkq - 0 2';
  const check = after(fen, 'f8b4');
  assert.equal(premoveMove(check, pre('g1', 'f3')), null);
  assert.equal(uci(premoveMove(check, pre('b1', 'c3'))), 'b1c3');
  assert.equal(uci(premoveMove(check, pre('c1', 'd2'))), 'c1d2');
  // хода заранее нет — играть нечего
  assert.equal(premoveMove(check, null), null);
});

test('соперник получил мат или пат — задавать нечего', () => {
  const mated = fromFen(START_FEN);
  for (const u of ['f2f3', 'e7e5', 'g2g4', 'd8h4']) make(mated, moveFromUci(mated, u));
  assert.equal(premoveTargets(mated).size, 0);
});

// ---------- сверка с перебором «в лоб» ----------

function rng(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** То же самое по определению: для каждого ответа соперника — отдельная позиция из FEN и её законные ходы. */
function naive(pos) {
  const fen = toFen(pos);
  const out = new Set();
  for (const reply of legalMoves(fromFen(fen)).map(uci)) {
    const p = fromFen(fen);
    make(p, moveFromUci(p, reply));
    for (const m of legalMoves(p)) out.add(`${sqName(fromOf(m))}${sqName(toOf(m))}`);
  }
  return out;
}

test('список ходов заранее совпадает с перебором «в лоб» на случайных партиях, а позиция остаётся прежней', () => {
  const rand = rng(20261012);
  let positions = 0;
  let pairs = 0;
  for (let g = 0; g < 12; g++) {
    const pos = fromFen(START_FEN);
    for (let ply = 0; ply < 60; ply++) {
      const moves = legalMoves(pos);
      if (outcome(pos, moves)) break;
      const fen = toFen(pos);
      const depth = [pos.undo.length, pos.keys.length, pos.lo, pos.hi];
      const map = premoveTargets(pos);
      assert.equal(toFen(pos), fen, 'позиция не изменилась');
      assert.deepEqual([pos.undo.length, pos.keys.length, pos.lo, pos.hi], depth, 'история и хэш не изменились');

      const got = new Set();
      for (const [from, set] of map) {
        // заранее ходит тот, чья очередь следующая, — своими фигурами, которые уже стоят на доске
        assert.ok(pos.board[from] && colorOf(pos.board[from]) !== pos.turn, `${fen}: ${sqName(from)} — не фигура игрока`);
        for (const to of set) got.add(`${sqName(from)}${sqName(to)}`);
      }
      assert.deepEqual([...got].sort(), [...naive(pos)].sort(), fen);

      // всё, что законно после ответа, находится по заданному ходу — и превращение при этом в ферзя
      const reply = moves[Math.floor(rand() * moves.length)];
      make(pos, reply);
      for (const m of legalMoves(pos)) {
        const found = premoveMove(pos, { from: fromOf(m), to: toOf(m) });
        assert.ok(found && fromOf(found) === fromOf(m) && toOf(found) === toOf(m));
        assert.ok(!promoOf(m) || promoOf(found) === QUEEN);
      }
      positions += 1;
      pairs += got.size;
    }
  }
  assert.ok(positions > 500 && pairs > 15000, `мало проверено: позиций ${positions}, ходов ${pairs}`);
});
