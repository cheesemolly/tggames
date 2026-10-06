// Уровни Арканоида: levels.js собран генератором (tools/arkanoid-levels.mjs) и не правился руками; в каждом уровне
// кирпичи не налезают друг на друга, объём в пределах, бонусов хватает, а до каждого кирпича шарик может добраться,
// не проходя сквозь сталь.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildAll, LEVELS_TOTAL, CHAPTER_SIZE as GEN_CHAPTER, CHAPTER_NAMES } from '../../../tools/arkanoid-levels.mjs';
import { W, BALL_R, BONUSES, BAD_BONUSES, LEVEL_COUNT, CHAPTER_SIZE, CHAPTERS, PADDLE_Y, parseLevel, polygon } from '../logic.js';

const built = buildAll();
const HITS = { n: 1, p: 1, e: 1, h: 3 };

test('levels.js — ровно то, что выдаёт генератор', () => {
  const file = readFileSync(new URL('../levels.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(file, built.text, 'перегенерируй: node tools/arkanoid-levels.mjs');
  assert.equal(LEVELS_TOTAL, LEVEL_COUNT);
  assert.equal(GEN_CHAPTER, CHAPTER_SIZE);
  assert.equal(CHAPTER_NAMES.length, CHAPTERS);
});

test('в каждой главе 30 уровней, из них пять картинок; подряд один узор не идёт', () => {
  for (let ch = 0; ch < CHAPTERS; ch++) {
    const list = built.levels.slice(ch * CHAPTER_SIZE, (ch + 1) * CHAPTER_SIZE);
    assert.equal(list.length, CHAPTER_SIZE);
    assert.ok(list.every((l) => l.chapter === ch));
    assert.equal(list.filter((l) => l.picture).length, 5, `глава ${ch}: картинок`);
    assert.ok(list[0].picture && list[CHAPTER_SIZE - 1].picture, `глава ${ch}: открывается и закрывается картинкой`);
    for (let i = 1; i < list.length; i++) assert.notEqual(list[i].name, list[i - 1].name, `уровень ${list[i].n}: тот же узор, что и перед ним`);
  }
  assert.equal(new Set(built.levels.filter((l) => l.picture).map((l) => l.name)).size, 50, 'картинки не повторяются');
});

test('объём уровня растёт, но в пределах; бонусы есть, в первых уровнях — без вредных', () => {
  const work = built.levels.map((l) => l.bricks.reduce((sum, b) => sum + (HITS[b.k] ?? 0), 0));
  for (const l of built.levels) {
    const w = work[l.n - 1];
    assert.ok(w >= 20 && w <= 200, `уровень ${l.n} (${l.name}): объём ${w}`);
    const gifts = l.bricks.filter((b) => b.k === 'p');
    assert.ok(gifts.length >= 1, `уровень ${l.n}: нет кирпичей с бонусом`);
    for (const b of gifts) assert.ok(b.b === null || BONUSES.includes(b.b), `уровень ${l.n}: бонус ${b.b}`);
    if (l.n <= 6) assert.ok(gifts.every((b) => b.b && !BAD_BONUSES.includes(b.b)), `уровень ${l.n}: вредный или случайный бонус`);
    if (l.n <= 20) assert.ok(!l.bricks.some((b) => b.k === 'x'), `уровень ${l.n}: сталь слишком рано`);
  }
  const avg = (from, to) => work.slice(from, to).reduce((a, b) => a + b, 0) / (to - from);
  assert.ok(avg(0, 30) < avg(120, 150) && avg(120, 150) < avg(270, 300), 'первая глава легче пятой, пятая — десятой');
  const forced = new Set(built.levels.flatMap((l) => l.bricks.map((b) => b.b)).filter(Boolean));
  assert.deepEqual([...forced].sort(), [...BONUSES].sort(), 'каждый из 15 бонусов где-то задан уровнем');
});

/** Пересекаются ли выпуклые многоугольники (теорема о разделяющей оси). */
function overlap(a, b) {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const nx = q[1] - p[1];
      const ny = p[0] - q[0];
      let minA = Infinity;
      let maxA = -Infinity;
      let minB = Infinity;
      let maxB = -Infinity;
      for (const [x, y] of a) {
        minA = Math.min(minA, x * nx + y * ny);
        maxA = Math.max(maxA, x * nx + y * ny);
      }
      for (const [x, y] of b) {
        minB = Math.min(minB, x * nx + y * ny);
        maxB = Math.max(maxB, x * nx + y * ny);
      }
      if (maxA <= minB || maxB <= minA) return false;
    }
  }
  return true;
}

const shrink = (pts, d) => {
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return pts.map(([x, y]) => {
    const len = Math.hypot(x - cx, y - cy) || 1;
    return [x - ((x - cx) / len) * d, y - ((y - cy) / len) * d];
  });
};

test('кирпичи не налезают друг на друга и не выходят за поле', () => {
  for (let n = 1; n <= LEVEL_COUNT; n++) {
    const polys = parseLevel(n).bricks.map((b) => polygon(b.shape, b.x, b.y, b.rot, b.scale));
    const small = polys.map((p) => shrink(p, 2.5));
    for (const p of polys) {
      for (const [x, y] of p) assert.ok(x >= -1 && x <= W + 1 && y >= 0 && y <= PADDLE_Y - 150, `уровень ${n}: кирпич вне поля (${x}, ${y})`);
    }
    for (let i = 0; i < small.length; i++) {
      for (let j = i + 1; j < small.length; j++) {
        if (Math.abs(polys[i][0][0] - polys[j][0][0]) > 70 || Math.abs(polys[i][0][1] - polys[j][0][1]) > 70) continue;
        assert.ok(!overlap(small[i], small[j]), `уровень ${n}: кирпичи ${i} и ${j} налезают`);
      }
    }
  }
});

test('до каждого разрушаемого кирпича шарик добирается, не проходя сквозь сталь', () => {
  const G = 4;                                     // сетка 4 × 4 единицы
  const cols = Math.ceil(W / G);
  const rows = Math.ceil(PADDLE_Y / G);
  const inside = (pts, x, y) => {
    let sign = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % pts.length];
      const cross = (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]);
      if (cross === 0) continue;
      if (sign && Math.sign(cross) !== sign) return false;
      sign = Math.sign(cross);
    }
    return true;
  };
  for (let n = 1; n <= LEVEL_COUNT; n++) {
    const bricks = parseLevel(n).bricks.map((b) => ({ ...b, pts: polygon(b.shape, b.x, b.y, b.rot, b.scale) }));
    const steel = bricks.filter((b) => b.kind === 'x');
    if (!steel.length) continue;
    // клетка занята, если её центр ближе радиуса шарика к стальному кирпичу (сталь «раздута» на радиус)
    const blocked = new Uint8Array(cols * rows);
    for (const b of steel) {
      const big = b.pts.map(([x, y]) => [x, y]);
      const cx = big.reduce((s, p) => s + p[0], 0) / big.length;
      const cy = big.reduce((s, p) => s + p[1], 0) / big.length;
      const grown = big.map(([x, y]) => [x + Math.sign(x - cx) * (BALL_R + 1), y + Math.sign(y - cy) * (BALL_R + 1)]);
      const x0 = Math.max(0, Math.floor((Math.min(...grown.map((p) => p[0]))) / G));
      const x1 = Math.min(cols - 1, Math.floor((Math.max(...grown.map((p) => p[0]))) / G));
      const y0 = Math.max(0, Math.floor((Math.min(...grown.map((p) => p[1]))) / G));
      const y1 = Math.min(rows - 1, Math.floor((Math.max(...grown.map((p) => p[1]))) / G));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inside(grown, x * G + G / 2, y * G + G / 2)) blocked[y * cols + x] = 1;
    }
    // заливка от платформы
    const free = new Uint8Array(cols * rows);
    const queue = [(rows - 1) * cols + (cols >> 1)];
    free[queue[0]] = 1;
    while (queue.length) {
      const k = queue.pop();
      const x = k % cols;
      const y = (k - x) / cols;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) continue;
        const kk = yy * cols + xx;
        if (blocked[kk] || free[kk]) continue;
        free[kk] = 1;
        queue.push(kk);
      }
    }
    for (const b of bricks) {
      if (!HITS[b.kind]) continue;
      // рядом с кирпичом (в пределах радиуса шарика и запаса) есть свободная клетка
      const x0 = Math.max(0, Math.floor((b.x - 12) / G));
      const x1 = Math.min(cols - 1, Math.floor((b.x + 44) / G));
      const y0 = Math.max(0, Math.floor((b.y - 12) / G));
      const y1 = Math.min(rows - 1, Math.floor((b.y + 30) / G));
      let ok = false;
      for (let y = y0; y <= y1 && !ok; y++) for (let x = x0; x <= x1 && !ok; x++) if (free[y * cols + x]) ok = true;
      assert.ok(ok, `уровень ${n}: кирпич (${b.x}, ${b.y}) заперт сталью`);
    }
  }
});
