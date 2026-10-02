// Кубик Рубика: штраф за осмотр по правилам WCA, среднее из 5 и 12 (без лучшей и худшей, DNF — худшая), формат
// времени, рекорды, сохранение партии и звуки (только синусы и треугольники, все узлы подключены).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DNF, penaltyFor, averageOf, fmtTime, emptyStats, isValidStats, isValidHistory, recordSolve, normalizeSettings,
  isValidSave,
} from '../logic.js';
import { newModel, applyMoves, parseMoves, encodeModel } from '../cube.js';
import { createSounds, SOUNDS } from '../sounds.js';
import { fakeContext } from '../../../shared/tests/fake-audio.js';

const solve = (t, p = 0, m = 50) => ({ t, p, m, s: 'R U', d: 1 });

test('осмотр: до 15 с — без штрафа, до 17 — +2 с, дольше — DNF', () => {
  assert.equal(penaltyFor(14999), 0);
  assert.equal(penaltyFor(15000), 0);
  assert.equal(penaltyFor(16500), 2000);
  assert.equal(penaltyFor(17001), DNF);
});

test('среднее из 5: без лучшей и худшей; одна DNF — худшая, две — DNF; мало сборок — нет', () => {
  assert.equal(averageOf([solve(10000), solve(11000)], 5), null);
  const five = [solve(10000), solve(12000), solve(11000), solve(30000), solve(9000)];
  assert.equal(averageOf(five, 5), 11000);
  five[3] = solve(13000, DNF);
  assert.equal(averageOf(five, 5), 11000);
  five[1] = solve(12000, DNF);
  assert.equal(averageOf(five, 5), Infinity);
  const plus2 = [solve(10000, 2000), solve(10000), solve(10000), solve(10000), solve(10000)];
  assert.equal(averageOf(plus2, 5), 10000);
  const twelve = Array.from({ length: 12 }, (_, i) => solve(10000 + i * 1000));
  assert.equal(averageOf(twelve, 12), 15500);
});

test('время: сотые вниз, минуты, DNF', () => {
  assert.equal(fmtTime(12345), '12.34');
  assert.equal(fmtTime(62340), '1:02.34');
  assert.equal(fmtTime(999), '0.99');
  assert.equal(fmtTime(Infinity), 'DNF');
  assert.equal(fmtTime(null), '—');
});

test('рекорды: лучшее время, меньше всего ходов, лучшие средние; DNF — не рекорд', () => {
  let st = emptyStats();
  let h = [];
  let r = recordSolve(st, h, solve(20000, 0, 60));
  assert.equal(r.record, true);
  ({ stats: st, history: h } = r);
  r = recordSolve(st, h, solve(25000, 0, 40));
  assert.equal(r.record, false);
  ({ stats: st, history: h } = r);
  assert.equal(st.best, 20000);
  assert.equal(st.bestMoves, 40);
  r = recordSolve(st, h, solve(1000, DNF, 10));
  assert.equal(r.record, false);
  ({ stats: st, history: h } = r);
  assert.equal(st.dnf, 1);
  assert.equal(st.best, 20000);
  for (const t of [18000, 19000, 21000]) ({ stats: st, history: h } = recordSolve(st, h, solve(t)));
  assert.equal(st.count, 6);
  assert.ok(st.bestAo5 > 0);
  assert.ok(isValidStats(st));
  assert.ok(isValidHistory(h));
  assert.equal(isValidHistory([{ t: -1, p: 0, m: 1, d: 1 }]), false);
});

test('настройки: неизвестное — по умолчанию', () => {
  assert.deepEqual(normalizeSettings({ skin: 'nope', inspection: 'yes', speed: 'warp' }), { skin: 'classic', inspection: false, speed: 'normal' });
  assert.deepEqual(normalizeSettings({ skin: 'neon', inspection: true, speed: 'fast' }), { skin: 'neon', inspection: true, speed: 'fast' });
});

test('сохранение партии: верное принимается, испорченное — нет', () => {
  const model = applyMoves(newModel(), parseMoves("R U F' M2"));
  const good = { v: 1, cubies: encodeModel(model), status: 'running', scramble: "R U F'", moves: 3, time: 5000, inspect: 0, penalty: 0, turns: [[0, 1, -1]] };
  assert.ok(isValidSave(JSON.parse(JSON.stringify(good))));
  assert.equal(isValidSave({ ...good, status: 'flying' }), false);
  assert.equal(isValidSave({ ...good, turns: [[0, 2, 1]] }), false);
  assert.equal(isValidSave({ ...good, cubies: good.cubies.slice(1) }), false);
});

test('звуки кубика: каждый звучит, узлы подключены, только синусы и треугольники', () => {
  const { ctx, created } = fakeContext();
  const sounds = createSounds(ctx);
  for (const name of SOUNDS) {
    const before = created.length;
    sounds.play(name);
    const fresh = created.slice(before);
    assert.ok(fresh.some((n) => n.kind === 'osc' || n.kind === 'buffer'), `${name}: нет источника`);
    for (const n of fresh) assert.ok(n.connections > 0, `${name}: ${n.kind} не подключён`);
    assert.ok(fresh.filter((n) => n.kind === 'osc').every((n) => n.type === 'sine' || n.type === 'triangle'), name);
  }
});
