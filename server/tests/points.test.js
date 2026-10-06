// Очки рейтинга (бета 'rating-points'): цены по вариантам, старые победы, подделки, вид рейтинга для беты и игроков.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WIN_POINTS, winPoints, wordsPoints, WORD_POINTS, bogglePoints, BOGGLE_FIELD_POINTS, NONOGRAM_CELLS, nonogramPoints,
  nonogramLevelPoints, match3Points, LEVEL_PRICES, memoryPoints, snakePoints, flagsPoints, BOARDS_V2, BOARDS, boardPoints,
  pointsView, boardFor, POINTS_PREFIX, GAMES,
} from '../lib.js';

const stats = (id, total, variants = {}) => ({
  [`shell:stats:${id}`]: total,
  ...Object.fromEntries(Object.entries(variants).map(([v, row]) => [`shell:stats:${id}:${v}`, row])),
});

test('цены есть у всех настоящих вариантов игр (сложности, размеры, режимы)', async () => {
  const has = (id, keys) => keys.forEach((k) => assert.ok(WIN_POINTS[id].by[k] > 0, `${id}: нет цены у «${k}»`));
  has('sudoku', (await import('../../games/sudoku/logic.js')).DIFFICULTIES);
  has('killer-sudoku', (await import('../../games/killer-sudoku/logic.js')).DIFFICULTIES);
  has('minesweeper', (await import('../../games/minesweeper/logic.js')).DIFF_IDS);
  has('mahjong', (await import('../../games/mahjong/layouts.js')).LAYOUTS.map((l) => l.id));
  has('klondike', (await import('../../games/klondike/logic.js')).MODES.map((n) => `draw-${n}`));
  has('spider', (await import('../../games/spider/logic.js')).MODES.map((n) => `suits-${n}`));
  has('chess', (await import('../../games/chess/engine.js')).LEVELS.map((l) => `level-${l.id}`));
  const ck = await import('../../games/checkers/logic.js');
  has('checkers', ck.MODES.flatMap((m) => ck.LEVEL_IDS.map((l) => `${m}-${l}`)));
  const { SIZES: goSizes } = await import('../../games/go/rules.js');
  const { LEVEL_IDS: goLevels } = await import('../../games/go/logic.js');
  has('go', goSizes.flatMap((n) => goLevels.map((l) => `${n}-${l}`)));
  const tt = await import('../../games/tictactoe/logic.js');
  has('tictactoe', tt.MODES.flatMap((m) => tt.LEVELS.map((l) => `${m}-${l}`)));
  has('fifteen', (await import('../../games/fifteen/logic.js')).SIZES.map(String));
  has('hanoi', (await import('../../games/hanoi/logic.js')).STAT_KEYS);
  // сложнее — дороже
  const up = (id, keys) => keys.reduce((prev, k) => (assert.ok(WIN_POINTS[id].by[k] > prev, `${id}: «${k}» не дороже`), WIN_POINTS[id].by[k]), 0);
  up('sudoku', ['easy', 'medium', 'hard', 'expert']);
  up('killer-sudoku', ['easy', 'medium', 'hard', 'expert']);
  up('spider', ['suits-1', 'suits-2', 'suits-4']);
  up('chess', [1, 2, 3, 4, 5, 6, 7].map((n) => `level-${n}`));
  up('go', ['9-1', '9-5', '13-5', '19-5']);
  up('hanoi', ['3-3', '3-5', '3-8', '3-10']);
  up('fifteen', ['3', '4', '5', '6', '7', '8']);
  // киллер дороже обычного судоку той же сложности
  for (const d of ['easy', 'medium', 'hard', 'expert']) assert.ok(WIN_POINTS['killer-sudoku'].by[d] > WIN_POINTS.sudoku.by[d]);
});

test('победы: по вариантам, старые — по самой дешёвой цене, не больше сыгранных', () => {
  const s = stats('sudoku', { played: 10, wins: 7 }, {
    easy: { played: 2, wins: 2 }, hard: { played: 3, wins: 2 }, expert: { played: 1, wins: 1 },
  });
  // 2 × 50 + 2 × 200 + 1 × 400 + 2 старые × 50
  assert.equal(winPoints(s, 'sudoku'), 100 + 400 + 400 + 100);
  // побед в варианте больше сыгранных — обрезается; сумма вариантов не больше общих побед
  const fake = stats('sudoku', { played: 3, wins: 3 }, { expert: { played: 1, wins: 50 }, hard: { played: 9, wins: 9 } });
  assert.ok(winPoints(fake, 'sudoku') <= 400 + 2 * 200);
  assert.equal(winPoints(stats('sudoku', { played: 0, wins: 99 }), 'sudoku'), 0, 'побед больше сыгранных — ноль');
  assert.equal(winPoints({}, 'sudoku'), 0);
  // Wordle: язык не важен
  assert.equal(winPoints(stats('wordle', { played: 6, wins: 5 }, { en: { played: 3, wins: 3 }, ru: { played: 3, wins: 2 } }), 'wordle'), 250);
  // неизвестный вариант — по legacy
  assert.equal(winPoints(stats('mahjong', { played: 1, wins: 1 }, { star: { played: 1, wins: 1 } }), 'mahjong'), 40);
});

test('Слова из слова: каждое слово по длине, повторы и мусор не считаются', () => {
  assert.deepEqual([3, 4].map((n) => WORD_POINTS[n]), [10, 15], 'как предложил владелец');
  const state = { 'game:words:progress': { levels: {
    0: { found: ['кот', 'кот', 'рост', 'ракета'], hinted: {} },
    1: { found: ['ab', 'дом', 42, 'оченьдлинноеслово'], hinted: {} },
    200: { found: ['мир'], hinted: {} },
  } } };
  assert.equal(wordsPoints(state), 10 + 15 + 30 + 10);
  assert.equal(wordsPoints({}), 0);
});

test('Филворд: поля по размеру, большое дороже, бонусные слова — по 5', async () => {
  const { SIZES } = await import('../../games/boggle/logic.js');
  assert.deepEqual(Object.keys(BOGGLE_FIELD_POINTS).map(Number), SIZES, 'цена у каждого размера поля');
  const state = { 'game:boggle:stats': { 5: { played: 10, best: 3, bonus: 4 }, 8: { played: 2, best: 1, bonus: 0 } } };
  assert.equal(bogglePoints(state), 10 * 25 + 4 * 5 + 2 * 180);
  // фарм маленьких полей: за то же число слов большое поле выгоднее
  const per = (n) => BOGGLE_FIELD_POINTS[n] / { 5: 5, 6: 7, 7: 9, 8: 12 }[n];
  assert.ok(per(5) < per(6) && per(6) < per(7) && per(7) < per(8));
});

test('Японский кроссворд: клетки уровней совпадают с игрой, больше картинка — дороже', async () => {
  const { LEVELS } = await import('../../games/nonogram/levels.js');
  assert.deepEqual(NONOGRAM_CELLS, LEVELS.map((l) => l.art.length * l.art[0].length));
  assert.equal(nonogramLevelPoints(25), 20);
  assert.equal(nonogramLevelPoints(225), 170);
  assert.equal(nonogramLevelPoints(400), 300);
  const done = Array(100).fill(0);
  done[0] = 1;
  done[99] = 2;
  assert.equal(nonogramPoints({ 'game:nonogram:progress': { done } }), 20 + 300);
});

test('уровни: цены растут, у змейки 1-й — 100, 12-й — 1200', async () => {
  const { MAP_COUNT } = await import('../../games/snake/levels.js');
  assert.equal(MAP_COUNT, 12, 'круг карт змейки — 12 уровней');
  assert.equal(LEVEL_PRICES.snake(1), 100);
  assert.equal(LEVEL_PRICES.snake(12), 1200);
  assert.equal(LEVEL_PRICES.snake(13), 400, 'второй круг — дороже первого на тех же картах');
  assert.equal(snakePoints({ 'shell:stats:snake': { played: 3, wins: 0, best: 340 }, 'game:snake:levels': { level: 4, best: 3 } }), 340 + 600);
  const done = Array(100).fill(1);
  assert.equal(match3Points({ 'game:match3:progress': { done } }), 100 * 40 + 4 * 5050);
  assert.equal(match3Points({ 'game:match3:progress': { done: [1, 0, 1] } }), 44 + 52);
  for (const id of ['loop', 'connect-dots', 'bubble-shooter', 'brick-blast']) {
    assert.ok(LEVEL_PRICES[id](1) <= LEVEL_PRICES[id](50), id);
  }
  // уровень из строки меню — текущий: пройдено на один меньше
  const loop = BOARDS_V2.loop.score({ 'shell:progress:loop': 'Уровень 3' });
  assert.equal(loop, LEVEL_PRICES.loop(1) + LEVEL_PRICES.loop(2));
  // соедини точки: прогресс уровней или старый рекорд забега — что больше
  assert.equal(BOARDS_V2['connect-dots'].score({ 'shell:stats:connect-dots': { played: 2, wins: 0, best: 2 } }), 13 + 16);
  assert.equal(BOARDS_V2['connect-dots'].score({ 'game:connect-dots:progress': { level: 4, hints: 3 }, 'shell:stats:connect-dots': { best: 1 } }), 13 + 16 + 19);
});

test('Мемори: «Жизни» и «На время» дороже, уровни до счётчика — как «Спокойно»', () => {
  const s = { 'game:memory:stats': { levelsCleared: 10, byPressure: { calm: 2, lives: 3, time: 1 } } };
  assert.equal(memoryPoints(s), 2 * 25 + 3 * 50 + 75 + 4 * 25);
  assert.equal(memoryPoints({ 'game:memory:stats': { levelsCleared: 1, byPressure: { time: 9 } } }), 75, 'не больше пройденных');
});

test('Флаги: партии по режиму и длине, марафон — рекорд, старые победы — как тест на 10', () => {
  const s = {
    'shell:stats:flags': { played: 12, wins: 9 },
    'game:flags:stats': { won: { 'test-10': 2, 'type-20': 1, 'test-marathon': 1 }, marathon: { test: 30, type: 10 } },
  };
  // 2 × 25 + 110 + 0 (марафон — за рекорд) + 30 × 3 + 10 × 6 + (9 − 4) старых × 25
  assert.equal(flagsPoints(s), 50 + 110 + 90 + 60 + 125);
  assert.equal(flagsPoints({ 'game:flags:stats': { marathon: { type: 5000 } } }), 196 * 6, 'больше флагов, чем есть, не бывает');
});

test('новые меры: у каждой игры рейтинга без новой меры — прежняя; очки пишутся с префиксом', () => {
  for (const id of Object.keys(BOARDS_V2)) assert.ok(BOARDS[id], `${id}: есть в BOARDS`);
  const same = GAMES.filter((g) => BOARDS[g.id] && !BOARDS_V2[g.id]).map((g) => g.id).sort();
  assert.deepEqual(same, ['2048', 'block-blast', 'bongo-cat', 'flappy-burger', 'pinball'], 'без изменений — как решил владелец');
  const pts = boardPoints(stats('chess', { played: 2, wins: 1 }, { 'level-7': { played: 1, wins: 1 } }));
  assert.deepEqual(pts, { [`${POINTS_PREFIX}chess`]: 600 });
  assert.equal(boardFor('chess', true).text(600), '600 очков');
  assert.equal(boardFor('chess', false), BOARDS.chess);
  assert.equal(boardFor('2048', true), BOARDS['2048']);
});

test('вид рейтинга: бета — очки вместо старых строк этих игр, игроки — только старые', () => {
  const rows = [
    { game_id: 'chess', user_id: 1, place: 1 },
    { game_id: 'pts:chess', user_id: 2, place: 1 },
    { game_id: '2048', user_id: 1, place: 1 },
  ];
  assert.deepEqual(pointsView(rows, false).map((r) => r.game_id), ['chess', '2048']);
  assert.deepEqual(pointsView(rows, true).map((r) => [r.game_id, r.user_id]), [['chess', 2], ['2048', 1]]);
});
