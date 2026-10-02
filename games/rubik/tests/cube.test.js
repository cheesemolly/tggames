// Кубик Рубика: модель (кубики с поворотами) сходится с «кубиками» решателя на любых ходах, наклейки ↔ кубики туда и
// обратно, координаты, решатель (решение собирает кубик, длина ≤ 22), перемешивание из случайного положения,
// средние слои и сохранение.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import {
  newModel, cloneModel, turnModel, applyMoves, parseMoves, formatMove, invertMoves, moveToTurn, turnToMove,
  faceletsOf, relativeFacelets, isSolvedModel, encodeModel, decodeModel, ROTATIONS,
} from '../cube.js';
import {
  MOVES, solvedCubie, multiply, applyCubie, moveIndex, moveName, cubieToFacelets, faceletsToCubie, buildTables,
  solveCubie, solveFacelets, randomCubie, randomScramble, randomMoveScramble, getTwist, getFlip, getSlice,
  SOLVED_SLICE,
} from '../solver.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

before(() => {
  const ms = buildTables();
  console.log(`таблицы решателя: ${ms} мс`);
});

test('24 поворота куба, у каждого хода порядок 4', () => {
  assert.equal(ROTATIONS.length, 24);
  for (const m of MOVES.filter((_, i) => i % 3 === 0)) {
    let c = solvedCubie();
    for (let k = 0; k < 4; k++) c = multiply(c, m);
    assert.ok(same(c, solvedCubie()));
  }
});

test('модель с кубиками в пространстве и «кубики» решателя дают одинаковые наклейки на любых ходах', () => {
  const r = rng(1);
  for (let t = 0; t < 300; t++) {
    const names = Array.from({ length: 1 + Math.floor(r() * 30) }, () => moveName(Math.floor(r() * 18)));
    const model = applyMoves(newModel(), parseMoves(names.join(' ')));
    const viaModel = faceletsOf(model);
    const viaCubie = cubieToFacelets(applyCubie(solvedCubie(), names.map(moveIndex)));
    assert.deepEqual(viaModel, viaCubie, names.join(' '));
    assert.ok(same(faceletsToCubie(viaModel), applyCubie(solvedCubie(), names.map(moveIndex))));
  }
});

test('наклейки: собранный кубик, нерешаемые (перекрученный угол, перевёрнутое ребро, обмен двух рёбер) — нет', () => {
  const f = faceletsOf(newModel());
  assert.ok(isSolvedModel(newModel()));
  assert.ok(same(faceletsToCubie(f), solvedCubie()));
  const twisted = f.slice();
  // угол URF: U9, R1, F3 — повернуть наклейки по кругу
  [twisted[8], twisted[9], twisted[20]] = [twisted[9], twisted[20], twisted[8]];
  assert.equal(faceletsToCubie(twisted), null);
  const flipped = f.slice();
  [flipped[5], flipped[10]] = [flipped[10], flipped[5]];
  assert.equal(faceletsToCubie(flipped), null);
  const swapped = f.slice();
  [swapped[5], swapped[7]] = [swapped[7], swapped[5]];
  [swapped[10], swapped[19]] = [swapped[19], swapped[10]];
  assert.equal(faceletsToCubie(swapped), null);
});

test('нотация: разбор, запись, обратная последовательность, поворот слоя ↔ ход', () => {
  const moves = parseMoves("R U2 F' M E' S2");
  assert.deepEqual(moves.map(formatMove), ['R', 'U2', "F'", 'M', "E'", 'S2']);
  const model = applyMoves(newModel(), moves);
  applyMoves(model, invertMoves(moves));
  assert.ok(isSolvedModel(model));
  for (const mv of moves) {
    const t = moveToTurn(mv);
    assert.deepEqual(turnToMove(t.axis, t.layer, t.q), mv);
  }
  assert.equal(turnToMove(0, 1, 4), null);
  // R по часовой, если смотреть на правую грань: угол спереди сверху уходит назад
  const m = applyMoves(newModel(), parseMoves('R'));
  const urf = m.cubies.find((c) => c.home.join() === '1,1,1');
  assert.deepEqual(urf.pos, [1, 1, -1]);
});

test('средние слои: M = L′R x′ — кубик с переставленными серединами решается относительно середин', () => {
  const model = applyMoves(newModel(), parseMoves("M E S M' R U"));
  const rel = relativeFacelets(model);
  const sol = solveFacelets(rel);
  assert.ok(sol);
  applyMoves(model, parseMoves(sol.join(' ')));
  assert.ok(isSolvedModel(model), 'собран (на каждой грани один цвет)');
});

test('координаты решателя на собранном кубике — нулевые', () => {
  const c = solvedCubie();
  assert.equal(getTwist(c.co), 0);
  assert.equal(getFlip(c.eo), 0);
  assert.equal(getSlice(c.ep), SOLVED_SLICE);
});

test('решатель: 30 случайных положений — решение собирает кубик, не длиннее 22 ходов', () => {
  const r = rng(7);
  const lens = [];
  const t0 = Date.now();
  for (let t = 0; t < 30; t++) {
    const c = randomCubie(r);
    const sol = solveCubie(c, { maxLength: 22, timeLimit: 40 });
    assert.ok(sol, 'нашёл');
    assert.ok(sol.length <= 22, `длина ${sol.length}`);
    assert.ok(same(applyCubie(c, sol), solvedCubie()), 'собирает');
    lens.push(sol.length);
  }
  console.log(`решения: средняя длина ${(lens.reduce((a, b) => a + b, 0) / lens.length).toFixed(1)}, ${((Date.now() - t0) / 30).toFixed(0)} мс на кубик`);
  assert.deepEqual(solveCubie(solvedCubie()), []);
});

test('перемешивание из случайного положения: приводит ровно к загаданному кубику; запасное — без повторов грани', () => {
  const r = rng(3);
  for (let t = 0; t < 8; t++) {
    const { moves, cube } = randomScramble(r);
    assert.ok(moves.length >= 2 && moves.length <= 22);
    const model = applyMoves(newModel(), parseMoves(moves.join(' ')));
    assert.ok(same(faceletsToCubie(faceletsOf(model)), cube));
    for (let i = 1; i < moves.length; i++) assert.notEqual(moves[i][0], moves[i - 1][0], 'грань подряд');
  }
  const rm = randomMoveScramble(rng(5), 25);
  assert.equal(rm.length, 25);
  for (let i = 1; i < rm.length; i++) assert.notEqual(rm[i][0], rm[i - 1][0]);
});

test('сохранение модели: туда и обратно; испорченная запись отвергается', () => {
  const model = applyMoves(newModel(), parseMoves("R U F' M2 E S' L D2 B"));
  const enc = encodeModel(model);
  const dec = decodeModel(JSON.parse(JSON.stringify(enc)));
  assert.deepEqual(faceletsOf(dec), faceletsOf(model));
  const bad = enc.slice();
  [bad[0], bad[2]] = [bad[2], bad[0]];                       // угол и ребро поменялись местами
  assert.equal(decodeModel(bad), null);
  const twisted = enc.slice();
  twisted[1] = (twisted[1] + 1) % 24;                         // наклейка смотрит внутрь
  assert.equal(decodeModel(twisted), null);
  assert.equal(decodeModel(enc.slice(2)), null);
  const copy = cloneModel(model);
  turnModel(copy, 1, 'all', 1);
  assert.ok(!same(faceletsOf(copy), faceletsOf(model)));
});
