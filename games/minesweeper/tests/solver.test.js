// Решатель сапёра — зона риска: неверный вывод тихо делает игру нечестной («без угадываний» с угадыванием,
// подсказка на мину). Проверяется перебором: выводы сверяются с настоящим полем на тысячах случайных досок,
// а на маленьких полях — с полным перебором всех расстановок мин (и выводы, и вероятности).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeCtx, numbersOf, deduce, probabilities, solveFrom } from '../solver.js';
import { mulberry32 } from '../logic.js';

/** Знание из строк: '.' закрыта, '*' известная мина, цифра — открыта. */
function knowFrom(rows, total) {
  const h = rows.length;
  const w = rows[0].length;
  const n = w * h;
  const open = new Uint8Array(n);
  const num = new Int8Array(n);
  const mine = new Uint8Array(n);
  rows.join('').split('').forEach((ch, i) => {
    if (ch === '*') mine[i] = 1;
    else if (ch !== '.') {
      open[i] = 1;
      num[i] = Number(ch);
    }
  });
  return { ctx: makeCtx(w, h), know: { open, num, mine, total } };
}

const at = (items, i) => items.find((it) => it.i === i);

test('одиночные выводы: цифра набрала мины — соседи свободны; закрытых столько, сколько мин, — все мины', () => {
  // 1 в углу с одной закрытой — мина; рядом 1, уже касающаяся этой мины, — остальные её соседи свободны
  const { ctx, know } = knowFrom([
    '1.',
    '11',
  ], 1);
  const r = deduce(ctx, know);
  assert.equal(r.level, 'single');
  assert.deepEqual(r.items.map((it) => [it.i, it.mine]), [[1, true]]);
});

test('пара цифр: узор 1-2-1 у стены', () => {
  // нижний ряд открыт: 1 2 1, над ним закрытые; мины — над единицами, над двойкой — свободно
  const { ctx, know } = knowFrom([
    '...',
    '121',
  ], 2);
  const r = deduce(ctx, know, { maxLevel: 2 });
  assert.equal(r?.level, 'pair');
  assert.deepEqual(r.items.filter((it) => it.mine).map((it) => it.i).sort(), [0, 2], 'мины — над единицами');
  assert.ok(!at(r.items, 1)?.mine, 'над двойкой мины нет');
  // мины найдены — дальше простой вывод: над двойкой свободно
  know.mine[0] = know.mine[2] = 1;
  const next = deduce(ctx, know);
  assert.equal(next.level, 'single');
  assert.deepEqual(next.items.map((it) => [it.i, it.mine]), [[1, false]]);
});

test('счётчик мин: все мины найдены — остальное свободно; закрытых столько же, сколько мин, — всё мины', () => {
  let { ctx, know } = knowFrom(['*1.', '11.', '...'], 1);
  // клетки справа и снизу далеки от цифр с закрытыми соседями только через «общий счёт»
  let r = deduce(ctx, know);
  assert.ok(r.items.every((it) => !it.mine), 'мина найдена — всё остальное свободно');
  ({ ctx, know } = knowFrom(['..', '..'], 4));
  r = deduce(ctx, know);
  assert.equal(r.level, 'global');
  assert.ok(r.items.length === 4 && r.items.every((it) => it.mine));
});

// ---------- перебором на маленьких полях ----------

function* combos(n, k, start = 0, acc = []) {
  if (acc.length === k) {
    yield acc;
    return;
  }
  for (let i = start; i <= n - (k - acc.length); i++) {
    acc.push(i);
    yield* combos(n, k, i + 1, acc);
    acc.pop();
  }
}

/** Все расстановки мин, согласные со знанием: для каждой клетки — во скольких она мина. */
function bruteForce(ctx, know) {
  const counts = new Float64Array(ctx.n);
  let total = 0;
  for (const set of combos(ctx.n, know.total)) {
    const mine = new Uint8Array(ctx.n);
    set.forEach((i) => { mine[i] = 1; });
    let ok = true;
    for (let i = 0; i < ctx.n && ok; i++) {
      if (know.mine[i] && !mine[i]) ok = false;
      if (know.open[i]) {
        if (mine[i]) ok = false;
        else {
          let c = 0;
          for (const j of ctx.nb[i]) c += mine[j];
          if (c !== know.num[i]) ok = false;
        }
      }
    }
    if (!ok) continue;
    total++;
    set.forEach((i) => { counts[i]++; });
  }
  return { counts, total };
}

/** Случайная частично открытая позиция маленького поля: настоящие мины и знание о части клеток. */
function randomPosition(rnd, w, h, m) {
  const ctx = makeCtx(w, h);
  const cells = [...Array(ctx.n).keys()];
  for (let k = cells.length - 1; k > 0; k--) {
    const j = Math.floor(rnd() * (k + 1));
    [cells[k], cells[j]] = [cells[j], cells[k]];
  }
  const mine = new Uint8Array(ctx.n);
  cells.slice(0, m).forEach((i) => { mine[i] = 1; });
  const num = numbersOf(ctx, mine);
  const open = new Uint8Array(ctx.n);
  const known = new Uint8Array(ctx.n);
  for (let i = 0; i < ctx.n; i++) {
    if (mine[i]) { if (rnd() < 0.15) known[i] = 1; } else if (rnd() < 0.45) open[i] = 1;
  }
  return { ctx, mine, know: { open, num, mine: known, total: m } };
}

test('на маленьких полях каждый вывод верен во всех согласных расстановках, а если вывод есть — решатель его находит', () => {
  const rnd = mulberry32(11);
  let checked = 0;
  for (let t = 0; t < 400; t++) {
    const w = 4 + Math.floor(rnd() * 2);
    const h = 4;
    const m = 3 + Math.floor(rnd() * 3);
    const { ctx, know } = randomPosition(rnd, w, h, m);
    const { counts, total } = bruteForce(ctx, know);
    assert.ok(total > 0);
    const certain = [];
    for (let i = 0; i < ctx.n; i++) {
      if (know.open[i] || know.mine[i]) continue;
      if (counts[i] === 0 || counts[i] === total) certain.push(i);
    }
    const r = deduce(ctx, know);
    if (certain.length) assert.ok(r, `позиция ${t}: есть верные выводы (${certain}), решатель не нашёл`);
    for (const it of r?.items ?? []) {
      const sure = it.mine ? counts[it.i] === total : counts[it.i] === 0;
      assert.ok(sure, `позиция ${t}: ${it.rule} в клетке ${it.i} — не наверняка`);
      checked++;
    }
  }
  assert.ok(checked > 200, `проверено выводов: ${checked}`);
});

test('вероятности мин совпадают с полным перебором', () => {
  const rnd = mulberry32(5);
  for (let t = 0; t < 150; t++) {
    const { ctx, know } = randomPosition(rnd, 5, 4, 3 + Math.floor(rnd() * 4));
    const { counts, total } = bruteForce(ctx, know);
    const p = probabilities(ctx, know);
    for (let i = 0; i < ctx.n; i++) {
      if (know.open[i] || know.mine[i]) {
        assert.ok(Number.isNaN(p[i]));
        continue;
      }
      assert.ok(Math.abs(p[i] - counts[i] / total) < 1e-9, `позиция ${t}, клетка ${i}: ${p[i]} против ${counts[i] / total}`);
    }
  }
});

test('тысячи случайных досок: решатель не ошибается ни разу (solveFrom сверяет каждый вывод с полем)', () => {
  const rnd = mulberry32(2026);
  const sizes = [[9, 9, 10, 1500], [16, 16, 40, 800], [16, 30, 99, 400], [12, 20, 60, 300]];
  for (const [w, h, m, runs] of sizes) {
    const ctx = makeCtx(w, h);
    let solved = 0;
    for (let t = 0; t < runs; t++) {
      const first = Math.floor(rnd() * ctx.n);
      const zone = new Set([first, ...ctx.nb[first]]);
      const cand = [...Array(ctx.n).keys()].filter((i) => !zone.has(i));
      for (let k = 0; k < m; k++) {
        const j = k + Math.floor(rnd() * (cand.length - k));
        [cand[k], cand[j]] = [cand[j], cand[k]];
      }
      const mine = new Uint8Array(ctx.n);
      cand.slice(0, m).forEach((i) => { mine[i] = 1; });
      if (solveFrom(w, h, mine, first).solved) solved++;
    }
    // доли решаемых без угадывания — как в исследованиях (≈91% / 71% / 16%)
    const share = solved / runs;
    if (w === 9) assert.ok(share > 0.85, `9×9: ${share}`);
    if (w === 16 && h === 16) assert.ok(share > 0.62, `16×16: ${share}`);
    if (h === 30) assert.ok(share > 0.1 && share < 0.25, `16×30: ${share}`);
  }
});
