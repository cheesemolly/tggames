// Подсказка миссии (help.js): для каждого шага каждой миссии есть текст и метки, метки на столе; как начать
// миссию и заправиться — тоже.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MISSIONS, TIERS, newGame } from '../rules.js';
import { HOW, missionHelp } from '../help.js';
import { buildTable, W, H } from '../table.js';

const e = buildTable().elements;

function onTable(m) {
  const pts = m.c ? [m.c] : [m.a, m.b];
  return m.r > 0 && pts.every(([x, y]) => x - m.r > -40 && x + m.r < W + 40 && y - m.r > -40 && y + m.r < H + 40);
}

test('подсказка: у каждого шага каждой миссии — текст и метки на столе', () => {
  for (const [id, def] of Object.entries(MISSIONS)) {
    def.steps.forEach((step, k) => {
      assert.ok(HOW[step.on], `${id}: шаг «${step.on}» без подсказки`);
      const g = newGame();
      g.fuel = 72;
      g.mission = { id, step: k, left: step.n };
      const h = missionHelp(g, e);
      assert.equal(h.title, def.name);
      assert.ok(h.lines.length >= 2 && h.lines.every((l) => typeof l === 'string' && l.length > 5));
      assert.ok(h.marks.length > 0, `${id}/${step.on}: нет меток`);
      for (const m of h.marks) assert.ok(onTable(m), `${id}/${step.on}: метка вне стола ${JSON.stringify(m)}`);
      if (def.steps.length > 1) assert.deepEqual(h.steps.map((s) => s.state), def.steps.map((_, j) => (j < k ? 'done' : j === k ? 'now' : 'next')));
      else assert.equal(h.steps, null);
    });
  }
});

test('подсказка: как начать миссию — мишени по номерам и рампа; топливо', () => {
  const g = newGame();
  const h = missionHelp(g, e);
  assert.deepEqual(h.marks.filter((m) => typeof m.n === 'number').map((m) => m.n), [1, 2, 3]);
  assert.ok(h.lines.some((l) => l.includes(MISSIONS[TIERS[0][3]].name)), 'сказано, что даст все три мишени');
  g.missionPick = 'science';
  g.fuel = 30;
  assert.equal(missionHelp(g, e).marks.length, 1, 'выбрана — только рампа');
  g.fuel = 0;
  assert.ok(missionHelp(g, e).marks.some((m) => m.tone === 'fuel'), 'бак пуст — где заправиться');
  g.missionPick = null;
  g.mission = { id: 'launchTraining', step: 0, left: 3 };
  g.fuel = 5;
  const low = missionHelp(g, e);
  assert.ok(low.marks.some((m) => m.tone === 'fuel') && low.lines.some((l) => l.includes('Топливо кончается')));
  g.fuel = 72;
  assert.ok(!missionHelp(g, e).marks.some((m) => m.tone === 'fuel'));
});
