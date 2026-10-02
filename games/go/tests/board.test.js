// Доска го: быстрые цепи с псевдо-свободами сверяются с наивным подсчётом (обход цепей) на тысячах случайных
// партий — свободы, атари, взятия, ко, самоубийство. Запуск: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Board, EMPTY, BLACK, WHITE } from '../board.js';
import { makeRng } from '../engine.js';

/** Наивно: цепь и её настоящие свободы обходом. */
function naiveChain(b, p) {
  const c = b.color[p];
  const seen = new Set([p]);
  const libs = new Set();
  const stack = [p];
  while (stack.length) {
    const s = stack.pop();
    for (const q of [s - 1, s + 1, s - b.W, s + b.W]) {
      if (b.color[q] === EMPTY) libs.add(q);
      else if (b.color[q] === c && !seen.has(q)) {
        seen.add(q);
        stack.push(q);
      }
    }
  }
  return { stones: seen, libs };
}

/** Наивная законность: пусто, не ко, после хода (со взятиями) у своей цепи есть свобода. */
function naiveLegal(b, p, c) {
  if (b.color[p] !== EMPTY || p === b.ko) return false;
  const t = b.clone();
  t.color[p] = c;
  let took = false;
  for (const q of [p - 1, p + 1, p - b.W, p + b.W]) {
    if (t.color[q] === 3 - c && naiveChain(t, q).libs.size === 0) took = true;
  }
  return took || naiveChain(t, p).libs.size > 0;
}

function check(b) {
  for (let p = 0; p < b.len; p++) {
    const c = b.color[p];
    if (c !== BLACK && c !== WHITE) continue;
    const { stones, libs } = naiveChain(b, p);
    const h = b.head[p];
    assert.equal(b.stones[h], stones.size, 'камней в цепи');
    for (const s of stones) assert.equal(b.head[s], h, 'у всех камней цепи одна голова');
    assert.equal(b.inAtari(h), libs.size === 1, 'атари');
    if (libs.size === 1) assert.equal(b.atariLib(h), [...libs][0], 'свобода в атари');
    assert.ok(libs.size > 0, 'на доске нет цепей без свобод');
    assert.deepEqual(new Set(b.liberties(p)), libs);
  }
  let empties = 0;
  for (let p = 0; p < b.len; p++) if (b.color[p] === EMPTY) empties++;
  assert.equal(b.emptyCount, empties);
}

test('доска сходится с наивным подсчётом на 80 случайных партиях 5×5…13×13', () => {
  const rng = makeRng(7);
  for (let g = 0; g < 80; g++) {
    const n = [5, 7, 9, 13][g % 4];
    const b = new Board(n);
    let c = BLACK;
    for (let k = 0; k < n * n * 2; k++) {
      // сверка законности на всех точках раз в несколько ходов
      if (k % 9 === 0) {
        for (let r = 0; r < n; r++) for (let col = 0; col < n; col++) {
          const p = b.pt(r, col);
          assert.equal(b.isLegal(p, c), naiveLegal(b, p, c), `законность ${r},${col}`);
        }
      }
      const legal = [];
      for (let i = 0; i < b.emptyCount; i++) if (b.isLegal(b.empty[i], c)) legal.push(b.empty[i]);
      if (!legal.length) { b.pass(); c = 3 - c; continue; }
      const p = legal[Math.floor(rng() * legal.length)];
      const before = b.clone();
      const taken = b.play(p, c);
      let expect = 0;
      const gone = new Set();
      for (const q of [p - 1, p + 1, p - b.W, p + b.W]) {
        if (before.color[q] === 3 - c && !gone.has(q)) {
          const t = before.clone();
          t.color[p] = c;
          const ch = naiveChain(t, q);
          if (ch.libs.size === 0) { for (const s of ch.stones) gone.add(s); }
        }
      }
      expect = gone.size;
      assert.equal(taken, expect, 'взято камней');
      check(b);
      c = 3 - c;
    }
  }
});

test('ко: сразу отбить нельзя, после хода в другом месте — можно', () => {
  //  . X O .
  //  X O . O      чёрные берут в (1,2) → белый камень (1,1) снят; белые сразу брать обратно не могут
  //  . X O .
  const b = new Board(5);
  const put = (r, c, who) => b.play(b.pt(r, c), who);
  put(0, 1, BLACK); put(1, 0, BLACK); put(2, 1, BLACK);
  put(0, 2, WHITE); put(1, 3, WHITE); put(2, 2, WHITE); put(1, 1, WHITE);
  assert.equal(b.play(b.pt(1, 2), BLACK), 1);
  assert.equal(b.ko, b.pt(1, 1));
  assert.equal(b.isLegal(b.pt(1, 1), WHITE), false);
  b.play(b.pt(4, 4), WHITE);
  b.play(b.pt(4, 0), BLACK);
  assert.equal(b.isLegal(b.pt(1, 1), WHITE), true);
});

test('самоубийство запрещено, ход со взятием — нет', () => {
  const b = new Board(5);
  b.play(b.pt(0, 1), BLACK);
  b.play(b.pt(1, 0), BLACK);
  assert.equal(b.isLegal(b.pt(0, 0), WHITE), false, 'угол в окружении — самоубийство');
  assert.equal(b.isLegal(b.pt(0, 0), BLACK), true);
});
