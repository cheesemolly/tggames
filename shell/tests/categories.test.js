import test from 'node:test';
import assert from 'node:assert/strict';

import { categories, findCategory, categoryOfGame, gamesOf, gameWord, visibleCategories } from '../categories.js';
import { games } from '../registry.js';
import { GAME_ICONS, CATEGORY_ICONS } from '../icons.js';

test('каждая игра лежит ровно в одной папке', () => {
  const placed = categories.flatMap((c) => c.games);
  assert.equal(new Set(placed).size, placed.length, 'игра не повторяется в разных папках');
  for (const game of games) {
    assert.ok(placed.includes(game.id), `игра ${game.id} не попала ни в одну папку`);
    assert.equal(categoryOfGame(game.id)?.games.includes(game.id), true);
  }
  for (const id of placed) {
    assert.ok(games.some((g) => g.id === id), `в папке указана несуществующая игра ${id}`);
  }
});

test('у папок есть название, подпись, цвет и иконка', () => {
  for (const c of categories) {
    assert.ok(c.title && c.hint, c.id);
    assert.match(c.color, /^--cat-/, `${c.id}: цвет — переменная темы`);
    assert.ok(CATEGORY_ICONS[c.id]?.startsWith('<svg'), `${c.id}: нет иконки`);
    assert.ok(gamesOf(c, games).length > 0, `${c.id}: пустая папка`);
  }
  assert.equal(findCategory('words')?.title, 'Слова');
  assert.equal(findCategory('нет-такой'), null);
});

test('у каждой игры есть иконка', () => {
  for (const game of games) {
    assert.ok(GAME_ICONS[game.id]?.startsWith('<svg'), `нет иконки для ${game.id}`);
  }
});

test('склонение «игра»', () => {
  assert.equal(gameWord(1), 'игра');
  assert.equal(gameWord(3), 'игры');
  assert.equal(gameWord(5), 'игр');
  assert.equal(gameWord(11), 'игр');
  assert.equal(gameWord(21), 'игра');
});

test('игры в обкатке (admin: true) видны только владельцу', () => {
  // так оболочка отбирает список (shell/app.js, visibleGames)
  const list = [{ id: 'a' }, { id: 'b', admin: true }];
  const visible = (isAdmin) => list.filter((g) => !g.admin || isAdmin).map((g) => g.id);
  assert.deepEqual(visible(false), ['a'], 'игроку — без игры в обкатке');
  assert.deepEqual(visible(true), ['a', 'b'], 'владельцу — все');

  // «Шарики» вышли из обкатки (решение владельца) — видны всем
  const bubble = games.find((g) => g.id === 'bubble-shooter');
  assert.ok(bubble && !bubble.admin, '«Шарики» открыты для всех');
  assert.equal(categoryOfGame('bubble-shooter')?.id, 'arcade');
});

test('Bongo Cat открыт для всех; папка из одних игр в обкатке у игрока пропадает', () => {
  const bongo = games.find((g) => g.id === 'bongo-cat');
  assert.ok(bongo && !bongo.admin, 'Bongo Cat открыт для всех (решение владельца)');
  assert.equal(categoryOfGame('bongo-cat')?.id, 'music');
  const ids = (list) => visibleCategories(list).map((c) => c.id);
  assert.deepEqual(ids(games), categories.map((c) => c.id), 'игроку видны все папки');

  // если единственная игра папки уйдёт в обкатку, папка у игрока пропадёт, а не покажет «0 игр»
  const forPlayer = games.filter((g) => g.id !== 'bongo-cat');
  assert.ok(!ids(forPlayer).includes('music'));
  assert.equal(ids(forPlayer).length, categories.length - 1, 'остальные папки на месте');
});

test('Мемори открыта для всех, лежит в «Головоломках»', () => {
  const memory = games.find((g) => g.id === 'memory');
  assert.ok(memory && !memory.admin, 'Мемори вышла из обкатки (решение владельца)');
  assert.equal(categoryOfGame('memory')?.id, 'puzzles');
});

test('Змейка открыта для всех, лежит в «Аркадах»', () => {
  const snake = games.find((g) => g.id === 'snake');
  assert.ok(snake && !snake.admin, 'Змейка вышла из обкатки (решение владельца)');
  assert.equal(categoryOfGame('snake')?.id, 'arcade');
});
