// Правила сапёра: первый ход, «без угадываний», заливка, флажки, аккорд, победа и поражение, 3BV, подсказка,
// сохранение, статистика, настройки.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CLOSED, OPEN, FLAG, MARK, DIFFS, newGame, placeMines, reveal, chord, toggleFlag, minesLeft, progressOf, bbbv,
  hintFor, serialize, deserialize, isValidState, emptyStats, isValidStats, recordGame, normalizeSetup,
  normalizeSettings, sizeOf, maxMines, mulberry32, numbers, neighborsOf, fmtTime,
} from '../logic.js';
import { solveFrom } from '../solver.js';

/** Партия с заданными минами: строки, '*' — мина. */
function gameFrom(rows) {
  const h = rows.length;
  const w = rows[0].length;
  const mine = rows.join('').split('').map((ch) => (ch === '*' ? 1 : 0));
  const g = newGame({ diff: 'custom', w, h, mines: mine.reduce((a, b) => a + b, 0), noGuess: false });
  g.mine = mine;
  g.first = 0;
  return g;
}

test('первый ход: мины не под ним и не рядом, их ровно сколько надо; с зерном — одинаково', () => {
  for (let seed = 1; seed <= 40; seed++) {
    for (const diff of ['easy', 'medium', 'hard']) {
      const size = sizeOf({ diff });
      const g = newGame({ diff, ...size, noGuess: false });
      const first = Math.floor(mulberry32(seed)() * size.w * size.h);
      placeMines(g, first, mulberry32(seed));
      assert.equal(g.mine.reduce((a, b) => a + b, 0), size.mines);
      assert.equal(g.mine[first], 0);
      for (const j of neighborsOf(g, first)) assert.equal(g.mine[j], 0, 'рядом с первой клеткой мин нет — откроется пустота');
      assert.equal(numbers(g)[first], 0);
    }
  }
  const a = newGame({ diff: 'easy', ...DIFFS.easy });
  const b = newGame({ diff: 'easy', ...DIFFS.easy });
  placeMines(a, 40, mulberry32(9));
  placeMines(b, 40, mulberry32(9));
  assert.deepEqual(a.mine, b.mine);
});

test('«без угадываний»: каждое поле проходится одной логикой от первого хода', () => {
  for (const diff of ['easy', 'medium', 'hard']) {
    for (let seed = 1; seed <= 25; seed++) {
      const size = sizeOf({ diff });
      const g = newGame({ diff, ...size, noGuess: true });
      const first = (seed * 37) % (size.w * size.h);
      const res = placeMines(g, first, mulberry32(seed * 7 + 1));
      assert.ok(res.ng && g.ng, `${diff}/${seed}: не нашлось`);
      assert.ok(solveFrom(g.w, g.h, g.mine, first).solved);
    }
  }
});

test('слишком плотное поле без угадываний: время кончилось — обычное поле, игра не зависает', () => {
  const g = newGame({ diff: 'custom', w: 10, h: 10, mines: maxMines(10, 10), noGuess: true });
  let t = 0;
  const res = placeMines(g, 55, mulberry32(3), () => (t += 100));
  assert.ok(res.tries <= 12, `попыток: ${res.tries}`);
  assert.equal(g.mine.reduce((a, b) => a + b, 0), maxMines(10, 10));
  assert.equal(typeof g.ng, 'boolean');
});

test('заливка: пустота открывает соседей и свою кайму, флажки не трогает', () => {
  const g = gameFrom([
    '.....',
    '.....',
    '...*.',
    '.....',
  ]);
  g.cells[4] = FLAG;                                // флажок в пустоте — остаётся
  const r = reveal(g, 0);
  assert.equal(r.boom, false);
  assert.equal(g.cells[4], FLAG);
  assert.equal(g.cells[13], CLOSED, 'мина закрыта');
  const opened = r.opened.map((o) => o.i);
  assert.ok(opened.includes(0) && opened.includes(8) && opened.includes(17), 'пустоты и их кайма');
  assert.equal(g.cells[19], CLOSED, 'цифра без соседа-пустоты не открывается');
  assert.equal(r.opened[0].d, 0);
  assert.ok(r.opened.every((o, k) => k === 0 || o.d >= r.opened[k - 1].d), 'по расстоянию — для волны');
});

test('аккорд: флажков столько, сколько цифра, — открывает соседей; не столько — нельзя; флажок не там — взрыв', () => {
  let g = gameFrom([
    '*..',
    '...',
    '...',
  ]);
  reveal(g, 4);                                     // центр: 1
  assert.equal(numbers(g)[4], 1);
  assert.equal(chord(g, 4).fail, true, 'флажков нет');
  toggleFlag(g, 0);
  const r = chord(g, 4);
  assert.equal(r.boom, false);
  assert.equal(g.over, 'win');
  g = gameFrom(['*..', '...', '...']);
  reveal(g, 4);
  toggleFlag(g, 2);                                 // флажок не на мине
  const bad = chord(g, 4);
  assert.equal(bad.boom, true);
  assert.equal(g.over, 'lose');
  assert.equal(g.boom, 0);
});

test('флажки: закрытая → флажок → («?») → закрытая; открытую не трогает; счётчик мин может уйти в минус', () => {
  const g = gameFrom(['*.', '..']);
  assert.equal(toggleFlag(g, 1), FLAG);
  assert.equal(toggleFlag(g, 1), CLOSED);
  assert.equal(toggleFlag(g, 1, true), FLAG);
  assert.equal(toggleFlag(g, 1, true), MARK);
  assert.equal(toggleFlag(g, 1, true), CLOSED);
  toggleFlag(g, 1);
  toggleFlag(g, 2);
  assert.equal(minesLeft(g), -1);
  reveal(g, 3);
  assert.equal(toggleFlag(g, 3), null);
  assert.equal(reveal(g, 2).opened.length, 0, 'флажок не открывается');
});

test('победа: открыто всё, кроме мин, — оставшиеся мины под флажками; поражение — мина под клеткой', () => {
  const g = gameFrom(['*.', '..']);
  reveal(g, 1);
  reveal(g, 2);
  assert.equal(g.over, null);
  assert.ok(Math.abs(progressOf(g) - 2 / 3) < 1e-9);
  reveal(g, 3);
  assert.equal(g.over, 'win');
  assert.equal(g.cells[0], FLAG);
  assert.equal(minesLeft(g), 0);
  const h = gameFrom(['*.', '..']);
  assert.equal(reveal(h, 0).boom, true);
  assert.equal(h.over, 'lose');
  assert.equal(reveal(h, 1).opened.length, 0, 'после конца ничего не открывается');
});

test('3BV: пустоты — по одному нажатию, остальные цифры — по одному', () => {
  // пустота слева (с каймой) — 1, мина справа окружена цифрами, у края не тронутыми пустотой — по одному
  const g = gameFrom([
    '.....',
    '.....',
    '....*',
  ]);
  // пустая область с каймой покрывает всё, кроме мины: 3BV = 1
  assert.equal(bbbv(g), 1);
  const g2 = gameFrom(['.*.']);
  assert.equal(bbbv(g2), 2, 'две цифры без пустоты');
});

test('подсказка: до первого хода — «открой любую»; неверный флажок первым; логика; 50/50 — угадывание', () => {
  let g = newGame({ diff: 'easy', ...DIFFS.easy });
  assert.equal(hintFor(g).kind, 'start');
  g = gameFrom([
    '*..',
    '...',
    '..*',
  ]);
  reveal(g, 2);                                     // открылись 1, 2, 4, 5
  assert.equal(g.cells[3], CLOSED);
  toggleFlag(g, 3);                                 // флажок не на мине
  assert.deepEqual(hintFor(g), { kind: 'flag', i: 3 });
  toggleFlag(g, 3);
  const h = hintFor(g, 2);
  assert.ok(['safe', 'mine'].includes(h.kind), h.kind);
  assert.equal(g.mine[h.i], h.kind === 'mine' ? 1 : 0, 'подсказка верна');
  // 50/50: две закрытые клетки за единицей, мина в одной
  g = gameFrom(['*.', '11']);
  g.cells[2] = OPEN;
  g.cells[3] = OPEN;
  const guess = hintFor(g);
  assert.equal(guess.kind, 'guess');
  assert.ok(Math.abs(guess.p - 0.5) < 1e-9);
});

test('сохранение: туда-обратно без потерь; мусор отбраковывается', () => {
  const size = sizeOf({ diff: 'medium' });
  const g = newGame({ diff: 'medium', ...size, noGuess: true });
  placeMines(g, 100, mulberry32(4));
  reveal(g, 100);
  toggleFlag(g, g.mine.indexOf(1));
  g.time = 12345;
  const s = serialize(g);
  assert.ok(isValidState(s));
  const back = deserialize(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(back.cells, g.cells);
  assert.deepEqual(back.mine, g.mine);
  assert.equal(back.time, 12345);
  assert.equal(isValidState({ ...s, cells: s.cells.slice(1) }), false);
  assert.equal(isValidState({ ...s, mine: s.mine.replace('1', '0') }), false, 'мин не столько');
  assert.equal(isValidState({ ...s, w: 99 }), false);
  assert.equal(isValidState({ ...s, cells: s.cells.replace(/^./, '7') }), false);
  assert.equal(isValidState(null), false);
  const fresh = serialize(newGame({ diff: 'easy', ...DIFFS.easy }));
  assert.ok(isValidState(fresh), 'до первого хода мин нет');
  assert.equal(isValidState({ ...fresh, cells: `1${fresh.cells.slice(1)}` }), false, 'открытая клетка без мин');
});

test('статистика: рекорд времени отдельно для «без угадываний», серия, поражение её обрывает', () => {
  const s = emptyStats();
  recordGame(s, 'easy', { win: true, ms: 30000 });
  recordGame(s, 'easy', { win: true, ms: 25000, ng: true });
  recordGame(s, 'easy', { win: true, ms: 40000 });
  assert.equal(s.easy.best, 30000);
  assert.equal(s.easy.bestNg, 25000);
  assert.equal(s.easy.streak, 3);
  recordGame(s, 'easy', { win: false });
  assert.equal(s.easy.streak, 0);
  assert.equal(s.easy.bestStreak, 3);
  assert.equal(s.easy.played, 4);
  recordGame(s, 'custom', { win: true, ms: 1000 });
  assert.equal(s.custom.best, 0, 'у своего поля рекорда времени нет');
  assert.ok(isValidStats(s));
  assert.equal(isValidStats({ ...s, easy: { ...s.easy, best: -1 } }), false);
  assert.equal(isValidStats({ ...s, hard: undefined }), false);
});

test('выбор партии и настройки: по умолчанию, пределы своего поля, «Сложный» лёжа', () => {
  assert.deepEqual(normalizeSetup(null), { diff: 'easy', noGuess: true, custom: { w: 12, h: 16, mines: 30 } });
  const c = normalizeSetup({ diff: 'custom', custom: { w: 99, h: 2, mines: 999 } });
  assert.deepEqual(c.custom, { w: 30, h: 5, mines: maxMines(30, 5) });
  assert.deepEqual(sizeOf({ diff: 'hard' }), { w: 16, h: 30, mines: 99 });
  assert.deepEqual(sizeOf({ diff: 'hard' }, true), { w: 30, h: 16, mines: 99 });
  assert.equal(maxMines(9, 9), 24);
  assert.deepEqual(normalizeSettings({ skin: 'zzz', size: 'big', hold: 'slow', marks: true }),
    { skin: 'telegram', size: 'big', longPress: true, hold: 'slow', chord: true, marks: true });
  assert.equal(fmtTime(42_000), '0:42');
  assert.equal(fmtTime(3_725_000), '1:02:05');
});
