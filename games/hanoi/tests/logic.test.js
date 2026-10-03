// Ханойская башня: правила, минимум ходов (2ⁿ − 1 и Фрейм — Стюарт) против поиска в ширину, подсказка из любой
// позиции — по ней башня собирается ровно за минимум, таблица расстояний сверена с наивным перебором,
// сохранение и статистика.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DISKS, PEGS, minMoves, newGame, move, undo, canMove, legalMoves, isSolved, encode, distances, remaining,
  bestMove, isValidGame, emptyStats, isValidStats, recordGame, statKey, biggestTower,
} from '../logic.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('минимум ходов: 2ⁿ − 1 на трёх стержнях, Фрейм — Стюарт на четырёх', () => {
  assert.deepEqual(DISKS.map((n) => minMoves(n, 3)), [7, 15, 31, 63, 127, 255, 511, 1023]);
  assert.deepEqual(DISKS.map((n) => minMoves(n, 4)), [5, 9, 13, 17, 25, 33, 41, 49]);
});

test('поиск в ширину подтверждает минимум для всех размеров', () => {
  for (const p of PEGS) {
    for (const n of DISKS) {
      const g = newGame(n, p);
      assert.equal(encode(g.towers, p), 0);
      assert.equal(remaining(g), minMoves(n, p), `${p} стержня, ${n} дисков`);
    }
  }
});

test('правила: только верхний диск, только на больший или на пустой', () => {
  const g = newGame(3, 3);
  assert.deepEqual(g.towers, [[2, 1, 0], [], []]);
  assert.equal(canMove(g, 1, 0), false, 'с пустого стержня');
  assert.equal(canMove(g, 0, 0), false, 'на тот же стержень');
  assert.deepEqual(move(g, 0, 2), { disk: 0, from: 0, to: 2 });
  assert.equal(canMove(g, 0, 2), false, 'диск 1 на диск 0 — нельзя');
  assert.equal(move(g, 0, 2), null);
  assert.equal(g.moves, 1);
  assert.deepEqual(move(g, 0, 1), { disk: 1, from: 0, to: 1 });
  assert.ok(canMove(g, 2, 1), 'маленький на больший — можно');
  assert.deepEqual(legalMoves(g).sort(), [[1, 0], [2, 0], [2, 1]].sort());
});

test('отмена — тоже ход, и возвращает позицию', () => {
  const g = newGame(4, 3);
  move(g, 0, 1);
  move(g, 0, 2);
  const before = JSON.stringify(g.towers);
  move(g, 1, 2);
  assert.deepEqual(undo(g), { disk: 0, from: 2, to: 1 });
  assert.equal(JSON.stringify(g.towers), before);
  assert.equal(g.moves, 4);
  undo(g);
  undo(g);
  assert.deepEqual(g.towers, newGame(4, 3).towers);
  assert.equal(undo(g), null, 'нечего отменять');
});

test('собрал — партия окончена, больше не ходится', () => {
  const g = newGame(3, 3);
  for (const [a, b] of [[0, 2], [0, 1], [2, 1], [0, 2], [1, 0], [1, 2], [0, 2]]) assert.ok(move(g, a, b));
  assert.ok(isSolved(g) && g.done);
  assert.equal(g.moves, 7);
  assert.equal(move(g, 2, 0), null);
  assert.equal(undo(g), null);
});

test('подсказка из начала собирает башню ровно за минимум', () => {
  for (const p of PEGS) {
    for (const n of DISKS) {
      const g = newGame(n, p);
      while (!g.done) {
        const m = bestMove(g);
        assert.ok(m, 'есть лучший ход');
        assert.ok(move(g, m[0], m[1]));
        assert.ok(g.moves <= minMoves(n, p));
      }
      assert.equal(g.moves, minMoves(n, p), `${p} стержня, ${n} дисков`);
      assert.equal(bestMove(g), null);
    }
  }
});

test('подсказка из случайных позиций: каждый ход на один ближе к цели', () => {
  const r = rng(7);
  for (let round = 0; round < 60; round++) {
    const p = PEGS[round % 2];
    const n = 3 + Math.floor(r() * 6);
    const g = newGame(n, p);
    for (let k = 0; k < 40 + Math.floor(r() * 60); k++) {
      const ms = legalMoves(g);
      const [a, b] = ms[Math.floor(r() * ms.length)];
      move(g, a, b);
      if (g.done) break;
    }
    if (g.done) continue;
    let left = remaining(g);
    while (!g.done) {
      const [a, b] = bestMove(g);
      move(g, a, b);
      const now = isSolved(g) ? 0 : remaining(g);
      assert.equal(now, left - 1);
      left = now;
    }
  }
});

test('таблица расстояний совпадает с наивным перебором позиций', () => {
  // независимый поиск в ширину по позициям-строкам, без кодирования числом
  const naive = (n, p) => {
    const key = (t) => JSON.stringify(t);
    const goal = Array.from({ length: p }, (_, i) => (i === p - 1 ? Array.from({ length: n }, (_, k) => n - 1 - k) : []));
    const dist = new Map([[key(goal), 0]]);
    const queue = [goal];
    while (queue.length) {
      const t = queue.shift();
      const d = dist.get(key(t));
      for (let a = 0; a < p; a++) {
        if (!t[a].length) continue;
        const disk = t[a][t[a].length - 1];
        for (let b = 0; b < p; b++) {
          if (b === a || (t[b].length && t[b][t[b].length - 1] < disk)) continue;
          const next = t.map((s) => s.slice());
          next[b].push(next[a].pop());
          if (!dist.has(key(next))) {
            dist.set(key(next), d + 1);
            queue.push(next);
          }
        }
      }
    }
    return dist;
  };
  for (const [n, p] of [[4, 3], [5, 3], [4, 4], [5, 4]]) {
    const ref = naive(n, p);
    const table = distances(n, p);
    assert.equal(ref.size, p ** n, 'все позиции достижимы');
    for (const [k, d] of ref) assert.equal(table[encode(JSON.parse(k), p)], d);
  }
});

test('проверка сохранения', () => {
  const g = newGame(5, 4);
  move(g, 0, 3);
  move(g, 0, 1);
  assert.ok(isValidGame(g));
  assert.ok(isValidGame(JSON.parse(JSON.stringify(g))));
  const bad = (patch) => assert.equal(isValidGame({ ...JSON.parse(JSON.stringify(g)), ...patch }), false, JSON.stringify(patch));
  bad({ towers: [[4, 3, 2], [1, 1], [], [0]] });       // повтор
  bad({ towers: [[4, 3, 2], [1], []] });               // не хватает стержня
  bad({ towers: [[4, 3], [1], [], [0]] });             // потерян диск
  bad({ towers: [[3, 4, 2], [1], [], [0]] });          // больший на меньшем
  bad({ n: 11 });
  bad({ pegs: 5 });
  bad({ history: [[0, 0]] });
  bad({ history: [[0, 7]] });
  bad({ moves: -1 });
  bad({ hints: 1.5 });
  bad({ v: 2 });
  assert.equal(isValidGame(null), false);
  // случайные партии сохраняются и читаются
  const r = rng(3);
  for (let k = 0; k < 30; k++) {
    const h = newGame(3 + (k % 8), PEGS[k % 2]);
    for (let s = 0; s < 50; s++) {
      const ms = legalMoves(h);
      const [a, b] = ms[Math.floor(r() * ms.length)];
      move(h, a, b);
      if (h.done) break;
      if (s % 7 === 3) undo(h);
    }
    assert.ok(isValidGame(JSON.parse(JSON.stringify(h))));
  }
});

test('статистика: идеально — ровно минимум и без подсказок; брошенная — только «сыграно»', () => {
  let s = emptyStats();
  assert.ok(isValidStats(s));
  const solve = (n, p, extra = 0, hints = 0) => {
    const g = newGame(n, p);
    while (!g.done) {
      const [a, b] = bestMove(g);
      move(g, a, b);
    }
    g.moves += extra;
    g.hints = hints;
    g.time = 30000 + extra * 1000;
    return g;
  };
  s = recordGame(s, solve(4, 3, 6), { win: true });
  s = recordGame(s, solve(4, 3), { win: true });
  s = recordGame(s, solve(4, 3, 0, 2), { win: true });
  s = recordGame(s, newGame(4, 3), { win: false });
  const r = s[statKey(3, 4)];
  assert.deepEqual(r, { played: 4, wins: 3, perfect: 1, bestMoves: 15, bestTime: 30000 });
  assert.equal(biggestTower(s), 4);
  s = recordGame(s, solve(7, 4, 0, 1), { win: true });
  assert.equal(biggestTower(s), 7, 'с подсказкой башня тоже собрана');
  assert.equal(s[statKey(4, 7)].bestMoves, 0, 'но без рекорда');
  assert.ok(isValidStats(JSON.parse(JSON.stringify(s))));
  assert.equal(isValidStats({ ...s, [statKey(3, 5)]: { played: -1 } }), false);
  assert.equal(isValidStats({}), false);
});
