// Подсказка «Очки в рейтинге»: есть у каждой игры рейтинга, подключена в игре, числа — те же, что считает сервер.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { POINTS_INFO, pointsInfo } from '../points-info.js';
import {
  GAMES, BOARDS, BOARDS_V2, WIN_POINTS, WORD_POINTS, BOGGLE_FIELD_POINTS, MEMORY_POINTS, FLAG_POINTS, FLAG_MARATHON,
  LEVEL_PRICES, match3LevelPoints, nonogramLevelPoints, SUBWORDS_STAR_POINTS, LOGIC_GATES, logicGatesStarPoints,
} from '../../server/lib.js';

const text = (id) => POINTS_INFO[id].lines.join(' ');
const nums = (id) => new Set((text(id).match(/\d+/g) ?? []).map(Number));
const has = (id, values) => values.forEach((v) => assert.ok(nums(id).has(v), `${id}: в подсказке нет «${v}»`));

test('подсказка есть у каждой игры рейтинга и подключена в самой игре', () => {
  const rated = GAMES.filter((g) => BOARDS[g.id]).map((g) => g.id);
  assert.deepEqual(Object.keys(POINTS_INFO).sort(), [...rated].sort());
  for (const id of rated) {
    const src = readFileSync(new URL(`../../games/${id}/index.js`, import.meta.url), 'utf8');
    assert.ok(src.includes(`pointsInfo(api, '${id}')`), `${id}: подсказка не подключена`);
    assert.equal(Boolean(POINTS_INFO[id].sum), Boolean(BOARDS_V2[id]), `${id}: «копятся» — только у новых мер`);
  }
});

test('числа в подсказках — те же, что считает сервер', () => {
  for (const [id, table] of Object.entries(WIN_POINTS)) {
    if (id === 'go') continue;                                   // го: цена 9×9 и множители размера
    has(id, Object.values(table.by).length ? Object.values(table.by) : [table.legacy]);
  }
  has('go', Object.entries(WIN_POINTS.go.by).filter(([k]) => k.startsWith('9-')).map(([, v]) => v));
  assert.equal(WIN_POINTS.go.by['13-5'], 2 * WIN_POINTS.go.by['9-5']);
  assert.equal(WIN_POINTS.go.by['19-5'], 4 * WIN_POINTS.go.by['9-5']);
  has('words', Object.values(WORD_POINTS));
  has('boggle', [...Object.values(BOGGLE_FIELD_POINTS), 5]);
  has('memory', Object.values(MEMORY_POINTS));
  has('flags', [...Object.values(FLAG_POINTS), ...Object.values(FLAG_MARATHON)]);
  has('nonogram', [nonogramLevelPoints(25), nonogramLevelPoints(225), nonogramLevelPoints(400)]);
  has('match3', [match3LevelPoints(1), match3LevelPoints(100), 4]);
  has('loop', [LEVEL_PRICES.loop(1), LEVEL_PRICES.loop(25), LEVEL_PRICES.loop(2) - LEVEL_PRICES.loop(1)]);
  has('connect-dots', [LEVEL_PRICES['connect-dots'](1), LEVEL_PRICES['connect-dots'](20), 3]);
  for (const id of ['bubble-shooter', 'brick-blast']) has(id, [LEVEL_PRICES[id](1), LEVEL_PRICES[id](120), 120]);
  assert.equal(LEVEL_PRICES['bubble-shooter'](119), 99, 'со 120-го — по 100');
  has('arkanoid', [LEVEL_PRICES.arkanoid(1), LEVEL_PRICES.arkanoid(180), LEVEL_PRICES.arkanoid(300), 180]);
  assert.equal(LEVEL_PRICES.arkanoid(179), 149, 'со 180-го — по 150');
  has('word-circle', [LEVEL_PRICES['word-circle'](1), LEVEL_PRICES['word-circle'](170), 170]);
  assert.equal(LEVEL_PRICES['word-circle'](169), 99, 'со 170-го — по 100');
  has('crostic', [LEVEL_PRICES.crostic(1), LEVEL_PRICES.crostic(330), 330]);
  assert.equal(LEVEL_PRICES.crostic(329), 149, 'с 330-го — по 150');
  has('subwords', SUBWORDS_STAR_POINTS.slice(1));
  has('logic-gates', [logicGatesStarPoints(1), LOGIC_GATES.step, logicGatesStarPoints(LOGIC_GATES.levels)]);
  has('snake', [LEVEL_PRICES.snake(1), LEVEL_PRICES.snake(2), LEVEL_PRICES.snake(12), LEVEL_PRICES.snake(13) - LEVEL_PRICES.snake(1)]);
});

test('без беты подсказки нет', () => {
  assert.equal(pointsInfo({ feature: () => false }, 'sudoku'), null);
  assert.equal(pointsInfo(null, 'sudoku'), null);
});
