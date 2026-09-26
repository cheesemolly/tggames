import test from 'node:test';
import assert from 'node:assert/strict';

import { BETA, KINDS, inBeta, betaGames, feature, seesBeta, setBetaViewer } from '../beta.js';
import { games } from '../registry.js';
import { categoryOfGame } from '../categories.js';
import { GAMES } from '../../server/lib.js';

test('список беты: записи в порядке — id уникальны, вид известен, есть название и описание', () => {
  const ids = BETA.map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length, 'id не повторяются');
  for (const b of BETA) {
    assert.ok(KINDS.includes(b.kind), `${b.id}: вид ${b.kind}`);
    assert.ok(b.title && b.note, `${b.id}: нужны title и note — они идут во вкладку «Бета» и в девлог`);
    if (b.since) assert.match(b.since, /^\d{4}-\d{2}-\d{2}$/, `${b.id}: since — ГГГГ-ММ-ДД`);
  }
});

test('игра в бете есть в реестре, лежит в папке, а у бота помечена beta: true (в инлайн-режиме её нет)', () => {
  for (const id of betaGames()) {
    assert.ok(games.some((g) => g.id === id), `${id}: есть в shell/registry.js`);
    assert.ok(categoryOfGame(id), `${id}: лежит в папке`);
    assert.equal(GAMES.find((g) => g.id === id)?.beta, true, `${id}: в server/lib.js помечена beta: true`);
  }
  // и наоборот: у бота нет пометки beta у игр, которых в бете уже нет (забыли снять при релизе)
  for (const g of GAMES.filter((x) => x.beta)) assert.ok(betaGames().includes(g.id), `${g.id}: beta у бота, но не в бете`);
});

test('видимость: вне беты — у всех, в бете — только у того, кто видит бету', () => {
  const inList = BETA[0]?.id;
  setBetaViewer(() => false);
  assert.equal(seesBeta(), false);
  assert.equal(feature('нет-такой-функции'), true, 'всё, чего нет в бете, включено у всех');
  if (inList) assert.equal(feature(inList), false, 'игрок бету не видит');
  setBetaViewer(() => true);
  assert.equal(seesBeta(), true);
  if (inList) assert.equal(feature(inList), true, 'владелец видит');
  assert.equal(inBeta('нет-такой-функции'), false);
  setBetaViewer(() => false);
});
