import test from 'node:test';
import assert from 'node:assert/strict';

import { menuLine, NOT_PLAYED } from '../menu-line.js';
import { games } from '../registry.js';

const stats = (played = 0, wins = 0, best = null) => ({ played, wins, best });

test('по умолчанию — сыграно, побед, рекорд', () => {
  assert.equal(menuLine(stats(5, 2, 900)), 'Сыграно: 5 · Побед: 2 · Рекорд: 900');
  assert.equal(menuLine(stats(0, 0, null)), NOT_PLAYED);
  assert.equal(menuLine(stats(3, 0, null)), 'Сыграно: 3 · Побед: 0', 'рекорда ещё нет');
});

test('бесконечные игры: побед не бывает', () => {
  // Flappy Burger, Block Blast — проиграть можно, выиграть нельзя.
  assert.equal(menuLine(stats(3, 0, 22), { menu: { wins: false } }), 'Сыграно: 3 · Рекорд: 22');
  // Маджонг — нельзя и проиграть: только число партий.
  assert.equal(menuLine(stats(4, 4, 100), { menu: { wins: false, best: false } }), 'Сыграно: 4');
});

test('рекорд может быть уровнем, а не числом очков', () => {
  assert.equal(
    menuLine(stats(2, 0, 7), { menu: { wins: false, bestValue: (n) => `Уровень ${n}` } }),
    'Сыграно: 2 · Рекорд: Уровень 7',
  );
});

test('уровневые игры показывают строку от самой игры', () => {
  const menu = { progress: 'replace' };
  assert.equal(menuLine(stats(0), { menu, progress: 'Уровень 14' }), 'Уровень 14');
  assert.equal(menuLine(stats(9, 9, 900), { menu, progress: 'Уровень 3' }), 'Уровень 3', 'статистика не мешает');
  assert.equal(menuLine(stats(0), { menu }), NOT_PLAYED, 'игра ещё ничего не сообщила');
});

test('Wordle: вместо рекорда — серия побед', () => {
  const menu = { best: false, progress: 'append' };
  assert.equal(menuLine(stats(12, 9, 60), { menu, progress: 'Стрик: 3' }), 'Сыграно: 12 · Побед: 9 · Стрик: 3');
  assert.equal(menuLine(stats(0, 0, null), { menu }), NOT_PLAYED);
});

test('в реестре у каждой игры разумная настройка меню', () => {
  const ids = games.map((g) => g.id);
  assert.equal(new Set(ids).size, ids.length, 'id не повторяются');
  for (const id of ['guess-number', '_stub-a', '_stub-b']) {
    assert.ok(!ids.includes(id), `игра ${id} удалена из проекта`);
  }
  const byId = Object.fromEntries(games.map((g) => [g.id, g.menu ?? {}]));
  for (const id of ['words', 'brick-blast', 'loop', 'boggle']) {
    assert.equal(byId[id].progress, 'replace', `${id}: в меню уровень`);
  }
  assert.equal(byId['connect-dots'].bestValue(7), 'Уровень 7', 'рекорд «Соедини точки» — уровень');
  for (const id of ['flappy-burger', 'block-blast', 'mahjong', 'connect-dots']) {
    assert.equal(byId[id].wins, false, `${id}: побед не бывает`);
  }
  assert.equal(byId.mahjong.best, false, 'в маджонге нет рекорда — только сыгранные партии');
  assert.equal(byId.wordle.progress, 'append', 'Wordle дописывает серию');
  assert.deepEqual(byId['2048'], {}, '2048 — обычная статистика, рекорд = лучшая плитка');
});
