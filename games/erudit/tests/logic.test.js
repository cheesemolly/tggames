// Правила «Эрудита»: набор фишек, премии, проверка раскладки, счёт, мешок, обмен, конец партии, сохранение.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SIZE, CELLS, CENTER, RACK, BINGO, BLANK, BLANKS, LETTERS, TILES, TOTAL_TILES, PREMIUM, LEVEL_IDS, IDLE_LIMIT, EMPTY_BOARD,
  layout, checkMove, hasTiles, newBag, newGame, play, swap, pass, canSwap, ending, finalScores, outcomeOf,
  isValidState, emptyStats, isValidStats, migrateStats, recordGame, valueOf,
} from '../logic.js';

function rngOf(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const at = (row, col) => row * SIZE + col;
/** Фишки слова: с клетки (row, col) вправо ('h') или вниз ('v'); заглавная буква — звёздочка. */
function word(text, row, col, dir = 'h') {
  return [...text].map((ch, k) => ({
    i: dir === 'h' ? at(row, col + k) : at(row + k, col), ch: ch.toLowerCase(), blank: ch !== ch.toLowerCase(),
  }));
}
/** Поле с выложенными словами: [текст, строка, столбец, направление]. */
function boardOf(...words) {
  const cells = [...EMPTY_BOARD];
  for (const [text, row, col, dir] of words) for (const t of word(text, row, col, dir)) cells[t.i] = t.blank ? t.ch.toUpperCase() : t.ch;
  return cells.join('');
}
const any = () => true;

test('набор: 131 фишка — 128 букв и 3 звёздочки, буквы Ё нет', () => {
  assert.equal(TOTAL_TILES, 131);
  assert.equal(LETTERS.length, 32);
  assert.ok(!LETTERS.includes('ё'));
  assert.deepEqual(Object.keys(TILES).sort(), [...LETTERS].sort());
  const bag = newBag(rngOf(1));
  assert.equal(bag.length, 131);
  assert.equal(bag.filter((ch) => ch === BLANK).length, BLANKS);
  assert.equal(bag.filter((ch) => ch === 'о').length, 10);
  assert.equal(bag.filter((ch) => ch === 'ф').length, 1);
  assert.equal(valueOf('а'), 1);
  assert.equal(valueOf('щ'), 10);
  assert.equal(valueOf(BLANK), 0);
  // контрольная сумма таблицы: очки всех фишек набора
  assert.equal(Object.values(TILES).reduce((n, [count, pts]) => n + count * pts, 0), 315);
});

test('премии: поле симметрично, центр — обычная клетка', () => {
  assert.equal(PREMIUM.length, CELLS);
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      assert.equal(PREMIUM[at(r, c)], PREMIUM[at(c, r)], 'по диагонали');
      assert.equal(PREMIUM[at(r, c)], PREMIUM[at(SIZE - 1 - r, c)], 'сверху вниз');
      assert.equal(PREMIUM[at(r, c)], PREMIUM[at(r, SIZE - 1 - c)], 'слева направо');
    }
  }
  const count = (p) => PREMIUM.filter((x) => x === p).length;
  assert.deepEqual([count('3'), count('2'), count('t'), count('d')], [8, 16, 12, 24]);
  assert.equal(PREMIUM[CENTER], '');
  assert.equal(PREMIUM[0], '3');
});

test('первый ход: через центр, не меньше двух букв, в одну линию без разрывов', () => {
  assert.equal(layout(EMPTY_BOARD, []).error, 'empty');
  assert.equal(layout(EMPTY_BOARD, word('кот', 0, 0)).error, 'center');
  assert.equal(layout(EMPTY_BOARD, word('к', 7, 7)).error, 'short');
  assert.equal(layout(EMPTY_BOARD, [{ i: at(7, 7), ch: 'к' }, { i: at(8, 8), ch: 'о' }]).error, 'line');
  assert.equal(layout(EMPTY_BOARD, [{ i: at(7, 7), ch: 'к' }, { i: at(7, 9), ch: 'о' }]).error, 'gap');
  assert.equal(layout(EMPTY_BOARD, [{ i: at(7, 7), ch: 'к' }, { i: at(7, 7), ch: 'о' }]).error, 'occupied');
  assert.equal(layout(EMPTY_BOARD, [{ i: 999, ch: 'к' }]).error, 'occupied');
  const res = layout(EMPTY_BOARD, word('кот', 7, 6));
  assert.equal(res.ok, true);
  assert.equal(res.dir, 'h');
  assert.deepEqual(res.words.map((w) => w.word), ['кот']);
  assert.equal(res.score, 2 + 1 + 2, 'центр ничего не умножает');
  assert.equal(layout(EMPTY_BOARD, word('кот', 6, 7, 'v')).dir, 'v');
});

test('следующие ходы должны касаться выложенного', () => {
  const board = boardOf(['кот', 7, 6]);
  assert.equal(layout(board, word('дом', 0, 0)).error, 'connect');
  assert.equal(layout(board, word('д', 3, 3)).error, 'connect');
  assert.equal(layout(board, word('м', 7, 6)).error, 'occupied');
  // по диагонали — не касание
  assert.equal(layout(board, word('ад', 6, 4)).error, 'connect');
  // разрыв закрывают выложенные буквы: «скот» + буква после — «скоты»
  const res = layout(board, [{ i: at(7, 5), ch: 'с' }, { i: at(7, 9), ch: 'ы' }]);
  assert.equal(res.ok, true);
  assert.deepEqual(res.words.map((w) => w.word), ['скоты']);
  // разрыв с пустой клеткой между своими фишками — нельзя
  assert.equal(layout(board, [{ i: at(7, 5), ch: 'с' }, { i: at(7, 10), ch: 'ы' }]).error, 'gap');
});

test('счёт: премии букв и слов действуют только на новые фишки', () => {
  // «кот» в строке 7: к (7,6), о (7,7), т (7,8)
  const board = boardOf(['кот', 7, 6]);
  // вниз от «о»: новые с (8,7) и а (9,7) — клетки без премий
  let res = layout(board, word('са', 8, 7, 'v'));
  assert.deepEqual(res.words.map((w) => [w.word, w.score]), [['оса', 1 + 2 + 1]]);
  // «р» над «т»: (6,8) — буква ×2
  assert.equal(PREMIUM[at(6, 8)], 'd');
  res = layout(board, word('р', 6, 8, 'v'));
  assert.deepEqual(res.words.map((w) => [w.word, w.score]), [['рт', 2 * 2 + 2]]);
  // «р» уже лежит на премии — второй раз она не действует; новая «ы» на (8,8) — буква ×2
  assert.equal(PREMIUM[at(8, 8)], 'd');
  res = layout(boardOf(['кот', 7, 6], ['р', 6, 8]), word('ы', 8, 8, 'v'));
  assert.deepEqual(res.words.map((w) => [w.word, w.score]), [['рты', 2 + 2 + 5 * 2]]);
});

test('счёт: слово ×3, буква ×2, поперечные слова и премия за семь фишек', () => {
  // шесть фишек по строке 7 от края до лежащего «кот»: (7,0) — слово ×3, (7,3) — буква ×2
  assert.equal(PREMIUM[at(7, 0)], '3');
  assert.equal(PREMIUM[at(7, 3)], 'd');
  const res = layout(boardOf(['кот', 7, 6]), word('автопи', 7, 0));
  assert.equal(res.ok, true);
  assert.deepEqual(res.words.map((w) => w.word), ['автопикот']);
  // а1 в2 т2 о1×2 п2 и1 + к2 о1 т2 = 15, слово ×3
  assert.equal(res.score, 15 * 3);
  assert.equal(res.bingo, false);

  // семь фишек сразу: +15; клетки (7,4)…(7,10) без премий
  const seven = layout(EMPTY_BOARD, word('картина', 7, 4));
  assert.equal(seven.bingo, true);
  assert.equal(seven.score, 2 + 1 + 2 + 2 + 1 + 1 + 1 + BINGO);

  // поперечные слова: «ас» под «ко» — получаются «ас», «ка», «ос»; (8,6) — буква ×2, она считается в обоих словах
  assert.equal(PREMIUM[at(8, 6)], 'd');
  assert.equal(PREMIUM[at(8, 7)], '');
  const cross = layout(boardOf(['кот', 7, 6]), word('ас', 8, 6));
  assert.deepEqual(cross.words.map((w) => [w.word, w.score]), [['ас', 2 + 2], ['ка', 2 + 2], ['ос', 1 + 2]]);
  assert.equal(cross.score, 11);
});

test('два слова ×2 в одном слове — счёт ×4', () => {
  // в столбце 4 слово ×2 на (4,4) и (10,4); в (7,4) уже лежит «с» от «скот»
  assert.equal(PREMIUM[at(4, 4)], '2');
  assert.equal(PREMIUM[at(10, 4)], '2');
  const board = boardOf(['скот', 7, 4]);
  const tiles = word('колокол', 4, 4, 'v').filter((t) => t.i !== at(7, 4));
  // раскладка словарь не смотрит: получается «колскол» — к2 о1 л2 с2 к2 о1 л2 = 12, ×2 ×2
  const res = layout(board, tiles);
  assert.equal(res.ok, true);
  assert.deepEqual(res.words.map((w) => [w.word, w.score]), [['колскол', 12 * 4]]);
});

test('звёздочка: играет за любую букву, очков не даёт — и потом тоже', () => {
  const res = layout(EMPTY_BOARD, word('кОт', 7, 6));
  assert.equal(res.words[0].word, 'кот');
  assert.equal(res.score, 2 + 0 + 2);
  // на поле звёздочка — заглавная буква; слово через неё считает её за ноль
  const board = boardOf(['кОт', 7, 6]);
  assert.equal(board[at(7, 7)], 'О');
  const next = layout(board, word('са', 8, 7, 'v'));
  assert.deepEqual(next.words.map((w) => [w.word, w.score]), [['оса', 0 + 2 + 1]]);
});

test('словарь: неизвестные слова называются, поперечные тоже проверяются', () => {
  const dict = new Set(['кот', 'ас', 'ка', 'ос']);
  const isWord = (w) => dict.has(w);
  assert.equal(checkMove(EMPTY_BOARD, word('кот', 7, 6), isWord).ok, true);
  const bad = checkMove(EMPTY_BOARD, word('ток', 7, 6), isWord);
  assert.equal(bad.error, 'word');
  assert.deepEqual(bad.bad, ['ток']);
  const board = boardOf(['кот', 7, 6]);
  assert.equal(checkMove(board, word('ас', 8, 6), isWord).ok, true);
  const cross = checkMove(board, word('ас', 8, 7), isWord);       // «оа», «тс» — нет таких слов
  assert.equal(cross.error, 'word');
  assert.deepEqual(cross.bad.sort(), ['оа', 'тс']);
  assert.equal(checkMove(board, word('дом', 0, 0), isWord).error, 'connect');
});

test('руки: хватает ли фишек, звёздочка — отдельная фишка', () => {
  assert.equal(hasTiles(['к', 'о', 'т'], word('кот', 7, 6)), true);
  assert.equal(hasTiles(['к', 'о'], word('кот', 7, 6)), false);
  assert.equal(hasTiles(['к', BLANK, 'т'], word('кОт', 7, 6)), true);
  assert.equal(hasTiles(['к', BLANK, 'т'], word('кот', 7, 6)), false, 'обычной «о» на руках нет');
  assert.equal(hasTiles(['о', 'о'], word('оО', 7, 6)), false);
});

test('партия: раздача, ход, добор, очередь', () => {
  const game = newGame('medium', rngOf(7));
  assert.equal(game.racks[0].length, RACK);
  assert.equal(game.racks[1].length, RACK);
  assert.equal(game.bag.length, 131 - 14);
  assert.ok(isValidState(game));
  const who = game.turn;
  const rack = game.racks[who];
  // выкладываем две первые фишки руки как «слово» (словарь — любой)
  const letter = (ch) => (ch === BLANK ? 'а' : ch);
  const tiles = [
    { i: CENTER, ch: letter(rack[0]), blank: rack[0] === BLANK },
    { i: CENTER + 1, ch: letter(rack[1]), blank: rack[1] === BLANK },
  ];
  assert.ok(hasTiles(rack, tiles));
  const res = checkMove(game.board, tiles, any);
  play(game, tiles, res);
  assert.equal(game.turn, 1 - who);
  assert.equal(game.scores[who], res.score);
  assert.equal(game.racks[who].length, RACK, 'добрал до семи');
  assert.equal(game.bag.length, 131 - 16);
  assert.equal(game.last.type, 'play');
  assert.deepEqual(game.last.cells, [CENTER, CENTER + 1]);
  assert.equal(game.moves, 1);
  assert.ok(isValidState(game));
  assert.ok(isValidState(JSON.parse(JSON.stringify(game))), 'переживает JSON');
});

test('жребий первого хода зависит от случая, партии с одним зерном одинаковы', () => {
  const turns = new Set();
  for (let seed = 1; seed <= 20; seed++) turns.add(newGame('easy', rngOf(seed)).turn);
  assert.deepEqual([...turns].sort(), [0, 1]);
  assert.deepEqual(newGame('easy', rngOf(5)), newGame('easy', rngOf(5)));
  assert.equal(newGame('нет такого', rngOf(5)).level, 'easy');
});

test('обмен: фишки уходят в мешок, приходят другие, слов нет — ход без очков', () => {
  const game = newGame('easy', rngOf(3));
  const who = game.turn;
  const before = [...game.racks[who]];
  const bag = game.bag.length;
  assert.equal(swap(game, [0, 2, 2, 99]), true);
  assert.equal(game.racks[who].length, RACK);
  assert.equal(game.bag.length, bag);
  assert.equal(game.turn, 1 - who);
  assert.equal(game.idle, 1);
  assert.equal(game.last.type, 'swap');
  assert.equal(game.last.count, 2);
  // остались фишки 1, 3…6
  for (const k of [1, 3, 4, 5, 6]) assert.ok(game.racks[who].includes(before[k]));
  assert.ok(isValidState(game));
  assert.equal(swap(game, []), false, 'нечего менять');
});

test('обмен нельзя, когда в мешке меньше семи фишек', () => {
  const game = newGame('easy', rngOf(3));
  game.racks[1].push(...game.bag.splice(6));               // лишнее — боту, только для проверки правила
  assert.equal(game.bag.length, 6);
  assert.equal(canSwap(game), false);
  assert.equal(swap(game, [0]), false);
  assert.equal(game.idle, 0);
});

test('конец: два круга без слов', () => {
  const game = newGame('easy', rngOf(3));
  for (let k = 0; k < IDLE_LIMIT - 1; k++) {
    pass(game);
    assert.equal(ending(game), null);
  }
  pass(game);
  assert.equal(ending(game), 'idle');
  assert.equal(isValidState(game), false, 'законченная партия не сохраняется');
});

test('слово обнуляет счётчик ходов без слов', () => {
  const game = newGame('easy', rngOf(3));
  pass(game);
  pass(game);
  const rack = game.racks[game.turn];
  const letter = (ch) => (ch === BLANK ? 'а' : ch);
  const tiles = [0, 1].map((k) => ({ i: CENTER + k, ch: letter(rack[k]), blank: rack[k] === BLANK }));
  play(game, tiles, checkMove(game.board, tiles, any));
  assert.equal(game.idle, 0);
});

test('конец: мешок пуст и кто-то выложил всё — ему очки фишек соперника', () => {
  const game = newGame('easy', rngOf(3));
  game.bag.length = 0;
  game.scores = [100, 90];
  game.racks = [[], ['ф', 'а', BLANK]];
  assert.equal(ending(game), 'out');
  const f = finalScores(game);
  assert.deepEqual(f.left, [0, 11]);
  assert.equal(f.out, 0);
  assert.deepEqual(f.scores, [111, 79]);
  assert.equal(outcomeOf(f.scores), 'win');
});

test('конец без выложившего всё: у каждого минус его фишки, счёт не ниже нуля', () => {
  const game = newGame('easy', rngOf(3));
  game.bag.length = 0;
  game.scores = [5, 40];
  game.racks = [['щ'], ['а', 'о']];
  const f = finalScores(game);
  assert.equal(f.out, null);
  assert.deepEqual(f.scores, [0, 38]);
  assert.equal(outcomeOf(f.scores), 'lose');
  assert.equal(outcomeOf([7, 7]), 'draw');
  // мешок не пуст — пустая рука ничего не значит (так не бывает, но очки соперника не дарим)
  game.bag = ['а'];
  game.racks = [[], ['ф']];
  assert.equal(finalScores(game).out, null);
});

test('сохранение: испорченное не принимается', () => {
  const good = () => newGame('hard', rngOf(11));
  assert.ok(isValidState(good()));
  const broken = [
    null, 5, {},
    { ...good(), v: 2 },
    { ...good(), level: 'бог' },
    { ...good(), board: EMPTY_BOARD.slice(1) },
    { ...good(), board: `q${EMPTY_BOARD.slice(1)}` },
    { ...good(), board: `ё${EMPTY_BOARD.slice(1)}` },
    { ...good(), turn: 2 },
    { ...good(), scores: [1, -1] },
    { ...good(), scores: [1] },
    { ...good(), idle: IDLE_LIMIT },
    { ...good(), racks: [[], []] },
    { ...good(), last: { by: 3, type: 'play', score: 1, words: [], cells: [] } },
    { ...good(), last: { by: 0, type: 'play', score: 1, words: [1], cells: [] } },
    { ...good(), last: { by: 0, type: 'play', score: 1, words: [], cells: [500] } },
  ];
  for (const s of broken) assert.equal(isValidState(s), false, JSON.stringify(s)?.slice(0, 80));
  // лишняя или подменённая фишка
  const extra = good();
  extra.bag.push('а');
  assert.equal(isValidState(extra), false);
  const swapped = good();
  swapped.bag[0] = swapped.bag[0] === 'ф' ? 'щ' : 'ф';
  assert.equal(isValidState(swapped), false);
  const junk = good();
  junk.bag[0] = 'q';
  assert.equal(isValidState(junk), false);
  // слово не через центр
  const off = good();
  const ch = off.bag.pop();
  if (ch !== BLANK) {
    off.board = ch + EMPTY_BOARD.slice(1);
    assert.equal(isValidState(off), false);
  }
});

test('статистика по уровням: запись партии, проверка, восстановление', () => {
  const stats = emptyStats();
  assert.deepEqual(Object.keys(stats), LEVEL_IDS);
  assert.ok(isValidStats(stats));
  recordGame(stats, 'easy', 'win', 250, 40);
  recordGame(stats, 'easy', 'lose', 300, 22);
  recordGame(stats, 'easy', 'draw', 100, 60);
  assert.deepEqual(stats.easy, { played: 3, wins: 1, losses: 1, draws: 1, best: 300, bestMove: 60 });
  assert.ok(isValidStats(stats));
  assert.equal(isValidStats({ easy: {} }), false);
  assert.equal(isValidStats(null), false);
  const fixed = migrateStats({ easy: { played: 2, wins: 'много', best: -5 }, hard: null, master: { played: 1.5 } });
  assert.ok(isValidStats(fixed));
  assert.equal(fixed.easy.played, 2);
  assert.equal(fixed.easy.wins, 0);
  assert.equal(fixed.easy.best, 0);
  assert.equal(fixed.master.played, 0);
  assert.deepEqual(migrateStats(undefined), emptyStats());
});
