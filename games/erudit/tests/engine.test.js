// Словарь и бот «Эрудита»: дерево слов против обычного множества, перебор ходов против наивного перебора
// всех раскладок, вежливость бота, уровни.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SIZE, CELLS, CENTER, RACK, BLANK, LETTERS, EMPTY_BOARD, LEVEL_IDS,
  checkMove, hasTiles, newGame, play, swap, pass, ending, finalScores, isValidState,
} from '../logic.js';
import { createDict, generateMoves, botMove, LEVELS } from '../engine.js';

const data = JSON.parse(readFileSync(new URL('../words/ru.json', import.meta.url), 'utf8'));
const dict = createDict(data.words, data.common);

function rngOf(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const keyOf = (tiles) => tiles.map((t) => `${t.i}${t.blank ? t.ch.toUpperCase() : t.ch}`).sort().join(' ');

test('дерево слов: знает все слова словаря и ничего лишнего', () => {
  assert.equal(dict.size, data.words.length);
  const set = new Set(data.words);
  for (const w of data.words) assert.ok(dict.isWord(w), w);
  // начала и «хвосты» слов, слова с лишней буквой — только если они сами есть в словаре
  let checked = 0;
  for (let k = 0; k < data.words.length; k += 7) {
    const w = data.words[k];
    for (const probe of [w.slice(0, -1), w.slice(1), `${w}а`, `${w}ы`, w.slice(0, 2), [...w].reverse().join('')]) {
      assert.equal(dict.isWord(probe), set.has(probe), probe);
      checked++;
    }
  }
  assert.ok(checked > 40000);
  for (const junk of ['', 'а', 'ё', 'кот!', 'cat', 'КОТ', null, undefined, 5]) assert.equal(dict.isWord(junk), false, String(junk));
  for (const w of data.common) assert.ok(dict.isCommon(w), w);
  assert.equal(dict.isCommon('абшид'), false);
  assert.ok(dict.isWord('абшид'));
  assert.ok(dict.nodes < 250000, 'дерево не раздулось');
});

test('несортированный список слов и повторы словарь переваривает', () => {
  const d = createDict(['кот', 'ас', 'кот', 'акт', 'коток'], ['кот', 'нет']);
  assert.equal(d.size, 4);
  for (const w of ['кот', 'ас', 'акт', 'коток']) assert.ok(d.isWord(w));
  assert.equal(d.isWord('ко'), false);
  assert.equal(d.isWord('кото'), false);
  assert.ok(d.isCommon('кот'));
  assert.equal(d.isCommon('нет'), false);
});

/**
 * Наивный перебор: для каждой линии, каждой стартовой клетки и каждого числа фишек — пустые клетки подряд
 * (выложенные пропускаются), на них — все расстановки фишек с руки, звёздочка — каждой буквой.
 */
function naiveMoves(board, rack, isWord) {
  const found = new Map();
  const tilesOf = [];
  const used = rack.map(() => false);
  const arrangements = (cells, k, acc, out) => {
    if (k === cells.length) {
      out.push(acc.map((t) => ({ ...t })));
      return;
    }
    const seen = new Set();
    for (let r = 0; r < rack.length; r++) {
      if (used[r] || seen.has(rack[r])) continue;
      seen.add(rack[r]);
      used[r] = true;
      if (rack[r] === BLANK) {
        for (const ch of LETTERS) {
          acc.push({ i: cells[k], ch, blank: true });
          arrangements(cells, k + 1, acc, out);
          acc.pop();
        }
      } else {
        acc.push({ i: cells[k], ch: rack[r], blank: false });
        arrangements(cells, k + 1, acc, out);
        acc.pop();
      }
      used[r] = false;
    }
  };
  const empty = board === EMPTY_BOARD;
  const touches = (i) => (i % SIZE > 0 && board[i - 1] !== '.') || (i % SIZE < SIZE - 1 && board[i + 1] !== '.')
    || (i >= SIZE && board[i - SIZE] !== '.') || (i < CELLS - SIZE && board[i + SIZE] !== '.');
  for (const step of [1, SIZE]) {
    for (let start = 0; start < CELLS; start++) {
      if (board[start] !== '.') continue;
      const cells = [];
      for (let i = start; i < CELLS && cells.length < rack.length; i += step) {
        if (step === 1 && Math.floor(i / SIZE) !== Math.floor(start / SIZE)) break;
        if (board[i] !== '.') continue;
        cells.push(i);
        // быстрый отсев: раскладка должна касаться выложенного (или центра на пустом поле)
        if (empty ? !cells.includes(CENTER) : !cells.some(touches)) continue;
        const out = [];
        arrangements([...cells], 0, tilesOf, out);
        for (const tiles of out) {
          const res = checkMove(board, tiles, isWord);
          if (res.ok) found.set(keyOf(tiles), res.score);
        }
      }
    }
  }
  return found;
}

/** Поле после нескольких ходов сильного бота. */
function positionAfter(moves, seed) {
  const rng = rngOf(seed);
  const game = newGame('master', rng);
  for (let k = 0; k < moves && !ending(game); k++) {
    const m = botMove(dict, game, 'master', rng);
    if (m.type !== 'play') break;
    play(game, m.tiles, checkMove(game.board, m.tiles, dict.isWord));
  }
  return game;
}

test('перебор ходов совпадает с наивным перебором всех раскладок (очки тоже)', () => {
  const cases = [
    [EMPTY_BOARD, ['к', 'о', 'т', 'а']],
    [EMPTY_BOARD, ['с', BLANK, 'н']],
    [positionAfter(1, 5).board, ['р', 'о', 'к', 'а']],
    [positionAfter(4, 6).board, ['л', 'е', 'с', BLANK]],
    [positionAfter(8, 7).board, ['м', 'а', 'й', 'я']],
    [positionAfter(14, 8).board, ['о', 'д', BLANK, 'ь']],
    [positionAfter(30, 9).board, ['и', 'к', 'с', 'а']],
    [positionAfter(60, 10).board, ['а', 'н', BLANK]],
  ];
  let total = 0;
  for (const [board, rack] of cases) {
    const fast = generateMoves(dict, board, rack);
    const keys = fast.map((m) => keyOf(m.tiles));
    assert.equal(new Set(keys).size, keys.length, 'ход повторился');
    const naive = naiveMoves(board, rack, dict.isWord);
    const missing = [...naive.keys()].filter((k) => !keys.includes(k));
    const extra = keys.filter((k) => !naive.has(k));
    assert.deepEqual(missing, [], `не найдены (рука ${rack.join('')})`);
    assert.deepEqual(extra, [], `лишние (рука ${rack.join('')})`);
    for (const m of fast) assert.equal(m.score, naive.get(keyOf(m.tiles)), `очки ${keyOf(m.tiles)}`);
    total += fast.length;
  }
  assert.ok(total > 500, `ходов проверено: ${total}`);
});

test('каждый найденный ход законен: главное слово названо верно, фишек хватает', () => {
  let total = 0;
  for (const seed of [21, 22, 23, 24]) {
    const game = positionAfter(10 + seed, seed);
    const rack = game.racks[game.turn];
    const moves = generateMoves(dict, game.board, rack);
    total += moves.length;
    for (const m of moves) {
      const res = checkMove(game.board, m.tiles, dict.isWord);
      assert.equal(res.ok, true, keyOf(m.tiles));
      assert.equal(res.score, m.score);
      assert.equal(res.words[0].word, m.word);
      assert.equal(m.common, dict.isCommon(m.word));
      assert.ok(hasTiles(rack, m.tiles));
      assert.ok(m.tiles.length >= 1 && m.tiles.length <= RACK);
    }
  }
  assert.ok(total > 10, `ходов проверено: ${total}`);
});

test('без фишек и без подходящих слов ходов нет', () => {
  assert.deepEqual(generateMoves(dict, EMPTY_BOARD, []), []);
  assert.deepEqual(generateMoves(dict, EMPTY_BOARD, ['ъ', 'ь', 'ы']), []);
  assert.deepEqual(generateMoves(dict, EMPTY_BOARD, ['а']), []);
});

test('первый ход проходит через центр', () => {
  const moves = generateMoves(dict, EMPTY_BOARD, ['к', 'о', 'ш', 'к', 'а', 'д', 'м']);
  assert.ok(moves.some((m) => m.word === 'кошка'));
  for (const m of moves) assert.ok(m.tiles.some((t) => t.i === CENTER), m.word);
});

test('ход семью фишками получает премию', () => {
  const moves = generateMoves(dict, EMPTY_BOARD, [...'картина']);
  const best = moves.filter((m) => m.word === 'картина');
  assert.ok(best.length > 0);
  for (const m of best) assert.equal(m.score, checkMove(EMPTY_BOARD, m.tiles, dict.isWord).score);
  assert.ok(best.every((m) => m.score >= 25));
});

test('бот не выкладывает грубые слова — ни главным, ни поперечным', () => {
  const d = createDict(['сука', 'сук', 'оса', 'ас', 'ус', 'ка']);
  assert.ok(d.isAvoided('сука'));
  assert.equal(d.isAvoided('сук'), false);
  const rack = [...'сука'];
  assert.ok(generateMoves(d, EMPTY_BOARD, rack).some((m) => m.word === 'сука'), 'игроку слово доступно');
  const polite = generateMoves(d, EMPTY_BOARD, rack, { polite: true });
  assert.ok(polite.length > 0);
  assert.ok(polite.every((m) => m.word !== 'сука'));
  // поперёк: на поле «сук», фишка «а» дала бы «сука» — вежливый перебор её не ставит
  const board = [...EMPTY_BOARD];
  [...'сук'].forEach((ch, k) => { board[CENTER - 1 + k] = ch; });
  const cross = generateMoves(d, board.join(''), ['а', 'с'], { polite: true });
  for (const m of cross) {
    const res = checkMove(board.join(''), m.tiles, d.isWord);
    assert.ok(res.words.every((w) => !d.isAvoided(w.word)), res.words.map((w) => w.word).join(','));
  }
  assert.ok(generateMoves(d, board.join(''), ['а', 'с']).some((m) => m.word === 'сука'));
  // в настоящем словаре такие слова помечены
  for (const w of ['сука', 'дерьмо', 'жид']) assert.ok(dict.isAvoided(w), w);
});

test('уровни: описаны все, слабые берут частые слова, сильные — самый дорогой ход', () => {
  assert.deepEqual(Object.keys(LEVELS), LEVEL_IDS);
  const game = positionAfter(6, 31);
  const rack = game.racks[game.turn];
  const all = generateMoves(dict, game.board, rack, { polite: true });
  const top = Math.max(...all.map((m) => m.score));
  const master = botMove(dict, game, 'master', rngOf(1));
  assert.equal(master.type, 'play');
  const stars = (m) => m.tiles.filter((t) => t.blank).length;
  // сильнейший берёт самый дорогой ход; звёздочку на него не тратит, если без неё почти столько же
  assert.ok(master.score === top || stars(master) < Math.max(...all.filter((m) => m.score === top).map(stars)));
  if (all.some((m) => m.common)) {
    for (let seed = 1; seed <= 20; seed++) {
      const m = botMove(dict, game, 'easy', rngOf(seed));
      assert.ok(dict.isCommon(m.word), m.word);
    }
    const medium = botMove(dict, game, 'medium', rngOf(1));
    assert.ok(dict.isCommon(medium.word));
  }
});

test('лёгкий бот без частых слов меняет фишки, а не достаёт редкое слово; остальные — достают', () => {
  // в словаре одно слово, и оно не из частых
  const rare = createDict(['кот'], []);
  const game = newGame('easy', rngOf(4));
  game.turn = 1;
  const pool = [...game.bag, ...game.racks[1]];
  const rack = [...'кот'].map((ch) => pool.splice(pool.indexOf(ch), 1)[0]);
  while (rack.length < RACK) rack.push(pool.pop());
  game.racks[1] = rack;
  game.bag = pool;
  assert.ok(isValidState(game));
  assert.equal(botMove(rare, game, 'easy', rngOf(1)).type, 'swap');
  for (const level of ['medium', 'hard', 'master']) assert.equal(botMove(rare, game, level, rngOf(1)).word, 'кот', level);
  // два хода подряд уже без слов — лёгкий не тянет партию к концу, а выкладывает что есть
  game.idle = 2;
  assert.equal(botMove(rare, game, 'easy', rngOf(1)).word, 'кот');
  game.idle = 0;
  // менять уже нельзя — лёгкий тоже берёт редкое слово, чтобы партия не встала
  game.racks[0].push(...game.bag.splice(3));
  assert.equal(botMove(rare, game, 'easy', rngOf(1)).word, 'кот');
});

test('нет ходов: бот меняет фишки, а при пустом мешке пасует; звёздочки не отдаёт', () => {
  const game = newGame('easy', rngOf(4));
  game.turn = 1;
  // фишки, из которых слова не выходит, возвращаем честно — меняем местами с мешком
  const want = ['ъ', 'ь', 'ы', 'й', BLANK];
  const pool = [...game.bag, ...game.racks[1]];
  const rack = [];
  for (const ch of want) rack.push(pool.splice(pool.indexOf(ch), 1)[0]);
  while (rack.length < RACK) rack.push(pool.splice(pool.findIndex((ch) => 'ъьый'.includes(ch) || ch === 'ц' || ch === 'щ'), 1)[0]);
  game.racks[1] = rack;
  game.bag = pool;
  assert.ok(isValidState(game));
  const none = createDict(['кот']);
  const m = botMove(none, game, 'easy', rngOf(1));
  assert.equal(m.type, 'swap');
  assert.ok(m.picks.length > 0);
  assert.ok(m.picks.every((k) => game.racks[1][k] !== BLANK));
  game.bag.length = 3;
  assert.equal(botMove(none, game, 'easy', rngOf(1)).type, 'pass');
});

test('партии бота с самим собой: все ходы законны, партия кончается, сильный обыгрывает слабого', () => {
  const run = (a, b, seed) => {
    const rng = rngOf(seed);
    const game = newGame('easy', rng);
    let guard = 0;
    while (!ending(game)) {
      assert.ok(guard++ < 400, 'партия не кончается');
      const who = game.turn;
      const m = botMove(dict, game, who === 0 ? a : b, rng);
      if (m.type === 'play') {
        const res = checkMove(game.board, m.tiles, dict.isWord);
        assert.equal(res.ok, true);
        assert.equal(res.score, m.score);
        assert.ok(hasTiles(game.racks[who], m.tiles));
        assert.ok(res.words.every((w) => !dict.isAvoided(w.word)));
        play(game, m.tiles, res);
      } else if (m.type === 'swap') {
        assert.equal(swap(game, m.picks, rng), true);
      } else {
        pass(game);
      }
      if (!ending(game)) assert.ok(isValidState(game));
    }
    return finalScores(game).scores;
  };
  // лестница: каждый уровень набирает больше предыдущего (сумма по трём партиям, по разу с каждой стороны жребия)
  for (let k = 1; k < LEVEL_IDS.length; k++) {
    let strong = 0;
    let weak = 0;
    for (const seed of [41, 42, 43]) {
      const [a, b] = run(LEVEL_IDS[k], LEVEL_IDS[k - 1], seed + k * 10);
      strong += a;
      weak += b;
    }
    assert.ok(strong > weak, `${LEVEL_IDS[k]} (${strong}) против ${LEVEL_IDS[k - 1]} (${weak})`);
  }
});
