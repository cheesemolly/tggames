// «Соедини точки»: каждый уровень решаем (его решение проходит проверку правил), рисование пальцем,
// тоннели, подсказки. Запуск: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_SIZE, levelParams, generateLevel, checkPaths, startAt, stepTo, emptyPaths, newGame, nextRound,
  applyHint, roundPoints, isValidState, emptyStats, recordGame, isValidStats, neighbors,
} from '../logic.js';

function seeded(seed) {
  let x = seed;
  return () => {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };
}

test('раунды: поле растёт и не больше 8×8, стены с 7-го, тоннели с 12-го', () => {
  let prev = 0;
  for (let r = 1; r <= 60; r++) {
    const p = levelParams(r);
    assert.ok(p.size >= prev && p.size <= MAX_SIZE, `раунд ${r}: ${p.size}`);
    prev = p.size;
    assert.equal(p.walls > 0, r >= 7, `стены в раунде ${r}`);
    assert.equal(p.tunnels > 0, r >= 12, `тоннели в раунде ${r}`);
    assert.ok(p.pairs >= 3 && p.timeSec > 0);
  }
  assert.equal(levelParams(1).size, 3);
  assert.equal(levelParams(100).size, MAX_SIZE);
});

test('генерация: 40 раундов × 25 уровней — решение проходит правила, стены и тоннели на месте', () => {
  const rng = seeded(7);
  for (let r = 1; r <= 40; r++) {
    const p = levelParams(r);
    for (let k = 0; k < 25; k++) {
      const level = generateLevel(r, rng);
      assert.equal(level.size, p.size);
      assert.equal(level.dots.length, p.pairs);
      assert.equal(level.walls.length, p.walls, `раунд ${r}: стен ${level.walls.length} вместо ${p.walls}`);
      assert.equal(level.tunnels.length, p.tunnels, `раунд ${r}: тоннелей ${level.tunnels.length}`);
      const check = checkPaths(level, level.solution);
      assert.ok(check.complete, `раунд ${r}: решение не проходит проверку`);
      const dots = level.dots.flat();
      assert.equal(new Set(dots).size, dots.length, 'точки не совпадают');
      for (const t of level.tunnels) {
        assert.ok(level.solution.some((path) => path.slice(1, -1).includes(t.cell)), 'через тоннель никто не проходит');
        assert.ok(!dots.includes(t.cell) && !level.walls.includes(t.cell));
      }
      for (const path of level.solution) assert.ok(path.length >= 3, 'пара вплотную — слишком просто');
    }
  }
});

// Поле 4×4 без стен: красные (0) — 0 и 3, синие (1) — 12 и 15
const L4 = { size: 4, walls: [], tunnels: [], dots: [[0, 3], [12, 15]], solution: [[0, 1, 2, 3], [12, 13, 14, 15]] };

function draw(level, paths, color, cells) {
  let p = startAt(level, paths, cells[0]).paths;
  let event = null;
  for (const cell of cells.slice(1)) ({ paths: p, event } = stepTo(level, p, color, cell));
  return { paths: p, event };
}

test('рисование: линия, соединение, шаг назад, повтор со своей клетки', () => {
  let { paths, event } = draw(L4, emptyPaths(L4), 0, [0, 1, 2, 3]);
  assert.equal(event, 'connect');
  assert.ok(checkPaths(L4, paths).connected[0]);
  assert.equal(stepTo(L4, paths, 0, 7).event, 'blocked', 'после соединения дальше не идём');
  ({ paths } = draw(L4, emptyPaths(L4), 0, [0, 1, 5, 1]));
  assert.deepEqual(paths[0], [0, 1], 'шаг назад');
  ({ paths } = draw(L4, emptyPaths(L4), 0, [0, 1, 5, 6, 2, 1]));
  assert.deepEqual(paths[0], [0, 1], 'вернулся на свою клетку — хвост обрезан');
  const again = startAt(L4, [[0, 1, 5, 6], []], 5);
  assert.deepEqual(again.paths[0], [0, 1, 5], 'начал с середины своей линии — продолжает оттуда');
  assert.equal(stepTo(L4, [[0], []], 0, 5).event, 'blocked', 'по диагонали нельзя');
});

test('рисование: чужая точка и стена не пускают, чужая линия разрезается', () => {
  assert.equal(stepTo(L4, [[0, 4, 8], []], 0, 12).event, 'blocked', 'чужая точка');
  const walled = { ...L4, walls: [5] };
  assert.equal(stepTo(walled, [[0, 1], []], 0, 5).event, 'blocked', 'стена');
  // синяя идёт 12 → 8 → 9, красная проходит через 9 — синяя обрезается до 12 → 8
  const cut = stepTo(L4, [[0, 1, 5], [12, 8, 9]], 0, 9);
  assert.equal(cut.event, 'cut');
  assert.deepEqual(cut.paths[1], [12, 8]);
  assert.deepEqual(cut.paths[0], [0, 1, 5, 9]);
});

test('тоннель: только насквозь; две линии крест-накрест в одной клетке', () => {
  // 3×3, тоннель в центре (4). Красная 3 → 5 (слева направо через центр), синяя 1 → 7 (сверху вниз).
  const T = { size: 3, walls: [], tunnels: [{ cell: 4, axis: 'h' }], dots: [[3, 5], [1, 7]], solution: [[3, 4, 5], [1, 4, 7]] };
  assert.ok(checkPaths(T, T.solution).complete, 'крест в тоннеле — правильное решение');
  let { paths, event } = draw(T, emptyPaths(T), 0, [3, 4, 5]);
  assert.equal(event, 'connect');
  ({ paths, event } = draw(T, paths, 1, [1, 4, 7]));
  assert.equal(event, 'connect', 'синяя проходит поперёк, красную не режет');
  assert.ok(checkPaths(T, paths).complete);
  // повернуть в тоннеле нельзя
  const turn = stepTo(T, [[3, 4], []], 0, 1);
  assert.equal(turn.event, 'blocked');
  assert.equal(checkPaths(T, [[3, 4, 1], []]).valid, false);
  // по одной оси — только одна линия: две горизонтальные через тоннель — нарушение
  const W = { size: 3, walls: [], tunnels: [{ cell: 4, axis: 'h' }], dots: [[3, 5], [0, 2]], solution: [] };
  assert.equal(checkPaths(W, [[3, 4, 5], [0, 3, 4, 5, 2]]).valid, false);
});

test('подсказка прокладывает линию из решения; подсказками можно решить любой уровень', () => {
  const rng = seeded(21);
  for (const round of [1, 5, 9, 13, 18, 25, 33]) {
    const s = newGame(rng);
    while (s.round < round) nextRound(s, rng);
    s.hintsLeft = 99;
    for (let k = 0; k < s.level.dots.length; k++) assert.ok(applyHint(s) >= 0);
    assert.ok(checkPaths(s.level, s.paths).complete, `раунд ${round}`);
    assert.equal(applyHint(s), -1, 'всё соединено — подсказывать нечего');
  }
});

test('очки, сохранение, статистика', () => {
  const s = newGame(seeded(3));
  assert.ok(roundPoints(s.level, 10_000) > roundPoints(s.level, null), 'бонус за оставшееся время');
  assert.ok(isValidState(JSON.parse(JSON.stringify(s))));
  assert.equal(isValidState({ ...s, level: { ...s.level, size: 9 } }), false, 'больше 8×8 не бывает');
  let st = emptyStats();
  st = recordGame(st, { ...s, score: 500 }, 7);
  st = recordGame(st, { ...s, score: 200 }, 3);
  assert.deepEqual(st, { played: 2, bestRound: 7, bestScore: 500, rounds: 10 });
  assert.ok(isValidStats(st));
  assert.equal(neighbors(0, 3).length, 2);
});
