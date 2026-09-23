// «Соедини точки»: у каждого уровня банка ровно одно решение (перебором), оно заполняет всё поле и проходит
// каждый тоннель в обе стороны; повороты/отражения это сохраняют; рисование пальцем, тоннели, подсказки.
// Запуск: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MAX_SIZE, ALL_TIERS, PAIRS, tierKey, levelParams, decodeLevel, encodeLevel, transformLevel, pickLevel,
  checkPaths, startAt, stepTo, emptyPaths, newGame, nextRound, applyHint, isValidState,
  emptyStats, recordGame, isValidStats, neighbors,
} from '../logic.js';
import { solve, buildGraph } from '../solver.js';
import { generatePuzzle, randomLevel } from '../generator.js';

const bank = JSON.parse(readFileSync(new URL('../levels.json', import.meta.url), 'utf8'));

function seeded(seed) {
  let x = seed;
  return () => {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };
}

test('раунды: поле растёт и не больше 8×8, стены с 6-го, тоннели с 10-го, все варианты есть в банке', () => {
  let prev = 0;
  for (let r = 1; r <= 60; r++) {
    const p = levelParams(r);
    assert.ok(p.size >= prev && p.size <= MAX_SIZE, `раунд ${r}: ${p.size}`);
    prev = p.size;
    if (r < 6) assert.equal(p.walls, 0);
    if (r < 10) assert.equal(p.tunnels, 0);
    assert.ok(p.timeSec > 0);
    assert.ok(bank.tiers[p.key]?.length >= 20, `в банке мало уровней ${p.key}`);
  }
  assert.equal(levelParams(1).size, 3);
  assert.equal(levelParams(100).size, MAX_SIZE);
  assert.ok(levelParams(10).tunnels > 0 && levelParams(6).walls > 0);
});

test('банк: у каждого уровня одно решение, оно заполняет всё поле, тоннели пройдены в обе стороны', () => {
  let total = 0;
  for (const [size, walls, tunnels] of ALL_TIERS) {
    const key = tierKey(size, walls, tunnels);
    for (const str of bank.tiers[key]) {
      const level = decodeLevel(str);
      total++;
      assert.equal(encodeLevel(level), str);
      assert.equal(level.size, size);
      assert.equal(level.walls.length, walls, key);
      assert.equal(level.tunnels.length, tunnels, key);
      const [lo, hi] = PAIRS[size];
      assert.ok(level.dots.length >= lo && level.dots.length <= hi, `${key}: пар ${level.dots.length}`);
      assert.ok(checkPaths(level, level.solution).complete, `${key}: решение не заполняет поле`);
      for (const t of level.tunnels) {
        const through = level.solution.filter((p) => p.slice(1, -1).includes(t.cell));
        assert.equal(through.length, 2, `${key}: тоннель пройден не в обе стороны`);
        assert.ok(!level.dots.flat().includes(t.cell));
      }
      for (const path of level.solution) assert.ok(path.length >= 3, 'пара вплотную — слишком просто');
      const { solutions, aborted } = solve(level);
      assert.ok(!aborted, `${key}: перебор не уложился`);
      assert.equal(solutions.length, 1, `${key}: решений ${solutions.length}\n${str}`);
    }
  }
  assert.ok(total >= 23 * 20);
});

test('повороты и отражения: решение остаётся единственным и правильным', () => {
  const rng = seeded(11);
  for (const key of ['5:1:0', '7:2:1', '8:1:3', '8:0:2']) {
    for (const str of bank.tiers[key].slice(0, 3)) {
      for (let t = 0; t < 8; t++) {
        const order = bank.tiers[key].length ? decodeLevel(str).solution.map((_, k) => k).sort(() => rng() - 0.5) : null;
        const level = transformLevel(decodeLevel(str), t, order);
        assert.ok(checkPaths(level, level.solution).complete, `${key} t=${t}`);
        assert.equal(solve(level).solutions.length, 1, `${key} t=${t}`);
      }
    }
  }
});

test('решатель: находит второе решение, если оно есть; генератор даёт единственные', () => {
  // 3×3: красная 0 → 8, синяя 6 → 7 — синяя идёт напрямую или в обход через 3 и 4
  const L = { size: 3, walls: [], tunnels: [], dots: [[0, 8], [6, 7]], solution: [] };
  assert.equal(solve(L).solutions.length, 2);
  // 0 → 2 и 6 → 8 — не заполнить (чётность): решений нет
  assert.equal(solve({ ...L, dots: [[0, 2], [6, 8]] }).solutions.length, 0);
  const rng = seeded(5);
  let made = 0;
  for (let k = 0; k < 60 && made < 5; k++) {
    const level = generatePuzzle({ size: 6, walls: 1, tunnels: 1, pairs: PAIRS[6] }, rng);
    if (!level) continue;
    made++;
    assert.equal(solve(level).solutions.length, 1);
  }
  assert.ok(made > 0);
});

/** Наивный перебор без отсечений (для сверки с решателем): число различных раскрасок, заполняющих поле. */
function naiveCount(level) {
  const g = buildGraph(level);
  const owner = new Array(g.total).fill(-1);
  for (let x = 0; x < g.total; x++) if (!g.exists[x]) owner[x] = -2;
  level.dots.forEach(([a, b], c) => { owner[a] = c; owner[b] = c; });
  const found = new Set();
  const run = (c, head) => {
    if (c === level.dots.length) {
      if (owner.every((o) => o !== -1)) found.add(owner.join());
      return;
    }
    const [, target] = level.dots[c];
    for (const x of g.adj[head]) {
      if (x === target) run(c + 1, level.dots[c + 1]?.[0]);
      else if (owner[x] === -1 && !(g.partner[x] >= 0 && owner[g.partner[x]] === c)) {
        owner[x] = c;
        run(c, x);
        owner[x] = -1;
      }
    }
  };
  run(0, level.dots[0][0]);
  return found.size;
}

test('решатель сверен с наивным перебором на малых полях (в т.ч. с тоннелем)', () => {
  for (const key of ['3:0:0', '4:0:0', '5:0:0', '5:1:0']) {
    for (const str of bank.tiers[key].slice(0, 15)) assert.equal(naiveCount(decodeLevel(str)), 1, `${key}\n${str}`);
  }
  // случайные решаемые расстановки (часто неоднозначные), в т.ч. с тоннелем и стеной
  const rng = seeded(9);
  let checked = 0;
  let ambiguous = 0;
  for (let k = 0; k < 400 && checked < 60; k++) {
    const level = randomLevel({ size: k % 2 ? 4 : 5, walls: k % 3 === 0 ? 1 : 0, tunnels: 1, pairs: 3 }, rng);
    if (!level) continue;
    const naive = naiveCount(level);
    assert.ok(naive >= 1, 'расстановка из разбиения решаема');
    assert.equal(solve(level, { limit: 50 }).solutions.length, Math.min(naive, 50), JSON.stringify(level));
    checked++;
    if (naive > 1) ambiguous++;
  }
  assert.ok(checked >= 30 && ambiguous >= 5, `проверено ${checked}, неоднозначных ${ambiguous}`);
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

test('заполнение: соединить пары мало — все клетки должны быть заняты', () => {
  const both = checkPaths(L4, L4.solution);
  assert.ok(both.valid && both.connected.every(Boolean));
  assert.equal(both.complete, false, 'средние ряды пустые');
  assert.equal(both.filled, 8);
  assert.equal(both.total, 16);
  const full = checkPaths(L4, [[0, 4, 5, 1, 2, 6, 7, 3], [12, 8, 9, 13, 14, 10, 11, 15]]);
  assert.ok(full.complete);
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

test('тоннель: только насквозь, крест двух линий, по одной оси — одна линия, с собой не пересечься', () => {
  // 3×3, тоннель в центре (4). Красная 3 → 5 (слева направо через центр), синяя 1 → 7 (сверху вниз).
  const T = { size: 3, walls: [], tunnels: [{ cell: 4, axis: 'h' }], dots: [[3, 5], [1, 7]], solution: [] };
  let { paths, event } = draw(T, emptyPaths(T), 0, [3, 4, 5]);
  assert.equal(event, 'connect');
  ({ paths, event } = draw(T, paths, 1, [1, 4, 7]));
  assert.equal(event, 'connect', 'синяя проходит поперёк, красную не режет');
  const check = checkPaths(T, paths);
  assert.ok(check.valid && check.connected.every(Boolean));
  assert.equal(check.total, 10, 'тоннель — два места');
  assert.equal(check.filled, 6);
  // повернуть в тоннеле нельзя
  assert.equal(stepTo(T, [[3, 4], []], 0, 1).event, 'blocked');
  assert.equal(checkPaths(T, [[3, 4, 1], []]).valid, false);
  // две горизонтальные через тоннель — нарушение
  const W = { size: 3, walls: [], tunnels: [{ cell: 4, axis: 'h' }], dots: [[3, 5], [0, 2]], solution: [] };
  assert.equal(checkPaths(W, [[3, 4, 5], [0, 3, 4, 5, 2]]).valid, false);
  // одна линия крест-накрест сама с собой — нельзя (так же, как в решателе)
  const S = { size: 3, walls: [], tunnels: [{ cell: 4, axis: 'h' }], dots: [[3, 7], [0, 6]], solution: [] };
  assert.equal(checkPaths(S, [[3, 4, 5, 2, 1, 4, 7], []]).valid, false);
  assert.equal(stepTo(S, [[3, 4, 5, 2, 1], []], 0, 4).event, 'blocked');
});

test('подсказка прокладывает линию из решения; подсказками решается любой уровень', () => {
  const rng = seeded(21);
  for (const round of [1, 4, 8, 10, 15, 20, 27]) {
    const s = newGame(bank, rng);
    while (s.round < round) nextRound(s, bank, rng);
    assert.equal(s.level.size, levelParams(round).size);
    s.hintsLeft = 99;
    for (let k = 0; k < s.level.dots.length; k++) assert.ok(applyHint(s) >= 0);
    assert.ok(checkPaths(s.level, s.paths).complete, `раунд ${round}`);
    assert.equal(applyHint(s), -1, 'всё решено — подсказывать нечего');
  }
});

test('сохранение и статистика (очков в игре нет)', () => {
  const s = newGame(bank, seeded(3));
  assert.ok(isValidState(JSON.parse(JSON.stringify(s))));
  assert.equal(isValidState({ ...s, level: { ...s.level, size: 9 } }), false, 'больше 8×8 не бывает');
  assert.equal(isValidState({ ...s, v: undefined }), false, 'сохранение старых правил — новая партия');
  const level = pickLevel(bank, 12, seeded(4));
  assert.equal(level.tunnels.length, levelParams(12).tunnels);
  let st = emptyStats();
  st = recordGame(st, 7);
  st = recordGame(st, 3);
  assert.deepEqual(st, { played: 2, bestRound: 7, rounds: 10 }, 'очков нет — считаем пройденные раунды');
  assert.ok(isValidStats(st));
  assert.equal(neighbors(0, 3).length, 2);
});
