// Маджонг — зона риска из CLAUDE.md: раскладка должна быть ГАРАНТИРОВАННО разбираемой до конца.
// Каждая раздача проверяется проигрыванием её решения по правилам (каждая пара свободна в свой момент
// и одного вида), по 200 раздач на раскладку; то же — для перемешивания посреди партии. Запуск: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUTS } from '../layouts.js';
import {
  relations, isFree, deal, reshuffle, freeTiles, availablePairs, removePair, undo, tilesLeft, isWon, isStuck,
  newGame, isValidState, emptyStats, recordGame, isValidStats, KINDS, GROUP_KINDS,
} from '../logic.js';

function seeded(seed) {
  let x = seed;
  return () => {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };
}

/** Проиграть решение: каждая пара свободна в свой момент и одного вида; в конце поле пусто. */
function assertSolution(layoutId, tiles, order, aliveStart) {
  const rel = relations(layoutId);
  const alive = aliveStart ? [...aliveStart] : tiles.map(() => true);
  for (const [a, b] of order) {
    assert.ok(alive[a] && alive[b], 'пара снимается дважды');
    assert.ok(isFree(rel, a, alive) && isFree(rel, b, alive), 'в решении — несвободная плитка');
    assert.equal(tiles[a].kind, tiles[b].kind, 'в решении — плитки разных видов');
    alive[a] = false;
    alive[b] = false;
  }
  assert.ok(alive.every((v) => !v), 'после решения на поле остались плитки');
}

test('раскладки: чётное число плиток (не больше 144), без наложений, всё лежит на опоре', () => {
  for (const { id, tiles } of LAYOUTS) {
    assert.ok(tiles.length % 2 === 0 && tiles.length <= 144, `${id}: ${tiles.length}`);
    for (let i = 0; i < tiles.length; i++) {
      const a = tiles[i];
      for (let j = i + 1; j < tiles.length; j++) {
        const b = tiles[j];
        assert.ok(!(a.z === b.z && Math.abs(a.x - b.x) < 2 && Math.abs(a.y - b.y) < 2), `${id}: плитки ${i} и ${j} наложены`);
      }
      if (a.z > 0) {
        assert.ok(tiles.some((b) => b.z === a.z - 1 && Math.abs(a.x - b.x) < 2 && Math.abs(a.y - b.y) < 2), `${id}: плитка ${i} висит в воздухе`);
      }
    }
  }
  assert.equal(LAYOUTS.find((l) => l.id === 'turtle').tiles.length, 144, 'классическая «Черепаха» — 144');
});

test('свободная плитка: сверху пусто и открыт хотя бы один бок', () => {
  const rel = relations('kid');
  const alive = LAYOUTS.find((l) => l.id === 'kid').tiles.map(() => true);
  const free = alive.map((_, i) => isFree(rel, i, alive));
  // «Малыш»: 6×6 внизу, 4×4 сверху. Свободны: верхний слой по краям (8 угловых и боковых столбцов) и
  // нижние крайние столбцы в тех строках, где верх их не накрывает.
  const tiles = LAYOUTS.find((l) => l.id === 'kid').tiles;
  tiles.forEach((t, i) => {
    if (t.z === 1) assert.equal(free[i], t.x === 2 || t.x === 8, `верх (${t.x},${t.y})`);
    if (t.z === 0) assert.equal(free[i], t.x === 0 || t.x === 10, `низ (${t.x},${t.y})`);
  });
});

for (const { id, tiles } of LAYOUTS) {
  test(`${id}: 200 раздач — у каждой есть решение, виды по 2/4 плитки, цветы и сезоны с разными рисунками`, () => {
    const rng = seeded(id.length * 97);
    for (let k = 0; k < 200; k++) {
      const d = deal(id, rng);
      assert.equal(d.tiles.length, tiles.length);
      const counts = new Map();
      for (const t of d.tiles) counts.set(t.kind, (counts.get(t.kind) ?? 0) + 1);
      assert.ok([...counts.values()].every((c) => c === 2 || c === 4));
      assert.ok([...counts.values()].filter((c) => c === 2).length <= 1, 'неполный вид — не больше одного');
      for (const g of GROUP_KINDS) {
        const faces = d.tiles.filter((t) => t.kind === g).map((t) => t.face);
        assert.equal(new Set(faces).size, faces.length, 'у цветов/сезонов рисунки не повторяются');
      }
      assertSolution(id, d.tiles, d.solution);
    }
  });
}

test('перемешивание посреди партии — снова разбирается до конца (по 100 партий на раскладку)', () => {
  const rng = seeded(5);
  for (const { id } of LAYOUTS) {
    for (let k = 0; k < 100; k++) {
      const s = newGame(id, rng);
      // случайные ходы, пока есть и пока не сняли треть
      const stop = Math.floor(s.tiles.length / 3);
      while (s.tiles.length - tilesLeft(s) < stop) {
        const pairs = availablePairs(s);
        if (!pairs.length) break;
        const [a, b] = pairs[Math.floor(rng() * pairs.length)];
        assert.ok(removePair(s, a, b));
      }
      const before = s.tiles.map((t) => ({ ...t }));
      const order = reshuffle(s, rng);
      assert.ok(order, 'перемешать не удалось');
      // набор плиток тот же, снятые не тронуты
      const kinds = (arr) => arr.filter((t) => t.alive).map((t) => `${t.kind}:${t.face}`).sort();
      assert.deepEqual(kinds(s.tiles), kinds(before));
      s.tiles.forEach((t, i) => assert.equal(t.alive, before[i].alive));
      assertSolution(id, s.tiles, order, s.tiles.map((t) => t.alive));
      assert.equal(s.history.length, 0);
    }
  }
});

test('ходы: только свободные плитки одного вида; отмена; победа; тупик', () => {
  const rng = seeded(11);
  const s = newGame('kid', rng);
  const free = new Set(freeTiles(s));
  const blocked = s.tiles.findIndex((_, i) => !free.has(i));
  const [a, b] = availablePairs(s)[0] ?? [];
  if (a !== undefined) {
    assert.equal(removePair(s, a, blocked), false, 'несвободную не снять');
    assert.ok(removePair(s, a, b));
    assert.equal(s.moves, 1);
    assert.deepEqual(undo(s), [a, b]);
    assert.ok(s.tiles[a].alive && s.tiles[b].alive);
  }
  // доиграть: помогает перемешивание, если тупик
  let guard = 0;
  while (!isWon(s) && guard++ < 500) {
    if (isStuck(s)) reshuffle(s, rng);
    const [x, y] = availablePairs(s)[0];
    removePair(s, x, y);
  }
  assert.ok(isWon(s));
  assert.equal(undo(s) !== null, true);
});

test('сохранение и статистика', () => {
  const s = newGame('pyramid', seeded(3));
  assert.ok(isValidState(JSON.parse(JSON.stringify(s))));
  assert.equal(isValidState({ ...s, layout: 'nope' }), false);
  const broken = JSON.parse(JSON.stringify(s));
  broken.tiles[0].kind = KINDS;
  assert.equal(isValidState(broken), false);
  let st = emptyStats();
  st = recordGame(st, { ...s, hints: 0, shuffles: 0 }, true);
  st = recordGame(st, { ...s, hints: 2, shuffles: 0 }, true);
  st = recordGame(st, s, false);
  assert.deepEqual(st, { played: 3, wins: 2, clean: 1 });
  assert.ok(isValidStats(st));
});
