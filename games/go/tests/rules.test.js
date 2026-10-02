// Правила партии го и бот: суперко, подсчёт по площади, фора и коми, проверка сохранения; бот берёт камни,
// пасует в решённой позиции, слабые уровни доигрывают партию; мёртвые камни. Запуск: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newGame, replay, playMove, canPlayAt, scoreArea, chainAt, isValidGame, handicapPoints, starPoints, komiFor, coordName,
  BLACK, WHITE, PASS,
} from '../rules.js';
import { chooseMove, estimateDead, LEVELS } from '../bot.js';
import { makeRng, PAT3 } from '../engine.js';
import { emptyStats, recordGame, isValidStats, normalizeSetup, normalizeSettings } from '../logic.js';

const at = (n, r, c) => r * n + c;
/** Партия из ходов [r, c] или 'pass'. */
function gameOf(size, moves, extra = {}) {
  const s = newGame({ size, vs: 'friend', ...extra });
  const pos = replay(s);
  for (const m of moves) assert.ok(playMove(s, pos, m === 'pass' ? PASS : at(size, ...m)), `ход ${m}`);
  return { s, pos };
}

/** Доска n×n, разделённая стенами: чёрные — столбец 4, белые — столбец 5; оба спасовали. */
function splitBoard() {
  const n = 9;
  const s = newGame({ size: n, vs: 'friend' });
  const pos = replay(s);
  for (let r = 0; r < n; r++) {
    playMove(s, pos, at(n, r, 4));
    playMove(s, pos, at(n, r, 5));
  }
  return { s, pos, n };
}

test('коми и фора: 6,5 на 9×9, 7,5 на больших, при форе 0,5 + камни и первыми — белые', () => {
  assert.equal(komiFor(9), 6.5);
  assert.equal(komiFor(19), 7.5);
  const s = newGame({ size: 19, handicap: 4 });
  assert.equal(s.komi, 4.5);
  const pos = replay(s);
  assert.equal(pos.turn, WHITE);
  for (const i of handicapPoints(19, 4)) assert.equal(pos.board.color[pos.board.fromIndex(i)], BLACK);
  assert.deepEqual(handicapPoints(19, 2).map((i) => coordName(19, i)).sort(), ['D4', 'Q16']);
  assert.equal(handicapPoints(9, 5).length, 5);
  assert.ok(handicapPoints(19, 9).every((i) => starPoints(19).includes(i)));
  assert.equal(starPoints(9).length, 5);
  assert.equal(starPoints(13).length, 9);
});

test('ко и суперко: отбить сразу нельзя, после хода в стороне — можно; испорченный журнал отбраковывается', () => {
  // ко в углу: чёрные (0,1) (1,0) (2,1), белые (0,2) (1,3) (2,2) (1,1); чёрные берут в (1,2)
  const { s, pos } = gameOf(9, [[0, 1], [0, 2], [1, 0], [1, 3], [2, 1], [2, 2], 'pass', [1, 1], [1, 2]]);
  assert.equal(pos.board.color[pos.board.fromIndex(at(9, 1, 1))], 0, 'белый камень взят');
  assert.equal(canPlayAt(pos, at(9, 1, 1)), false, 'сразу отбить ко нельзя');
  assert.equal(playMove(s, pos, at(9, 1, 1)), false);
  assert.ok(playMove(s, pos, at(9, 8, 8)));
  assert.ok(playMove(s, pos, at(9, 8, 0)));
  assert.equal(canPlayAt(pos, at(9, 1, 1)), true, 'после хода в стороне — можно');
  assert.ok(isValidGame(s));
  const bad = structuredClone(s);
  bad.moves.push(at(9, 0, 1));                 // занятая точка
  assert.equal(isValidGame(bad), false);
});

test('подсчёт по площади: камни + окружённая пустота, мёртвые — пленные, даме ничьё', () => {
  const { s, pos, n } = splitBoard();
  playMove(s, pos, PASS);
  playMove(s, pos, at(n, 4, 1));               // белый камень в чёрной территории
  const counted = scoreArea(pos.board, new Set(chainAt(pos.board, at(n, 4, 1))), s.komi);
  assert.equal(counted.black, 45, 'чёрные: 9 камней + 36 точек слева');
  assert.equal(counted.white, 36 + s.komi, 'белые: 9 камней + 27 точек справа');
  const alive = scoreArea(pos.board, new Set(), s.komi);
  assert.equal(alive.owner[at(n, 0, 0)], 0, 'с живым чужим камнем область ничья');
  assert.ok(alive.black < counted.black);
});

test('проверка сохранения отбраковывает испорченное', () => {
  const { s } = gameOf(9, [[2, 2], [6, 6]]);
  assert.ok(isValidGame(JSON.parse(JSON.stringify(s))));
  assert.equal(isValidGame({ ...s, size: 10 }), false);
  assert.equal(isValidGame({ ...s, moves: [999] }), false);
  assert.equal(isValidGame({ ...s, hints: -1 }), false);
  assert.equal(isValidGame({ ...s, scoring: { dead: ['x'] } }), false);
});

test('шаблоны 3×3: хане узнаётся для обоих цветов и при поворотах', () => {
  // код: 8 соседей по 2 бита (СЗ, С, СВ, З, В, ЮЗ, Ю, ЮВ); хане — X O X сверху, остальное пусто
  const code = (cells) => cells.reduce((m, v, k) => m | (v << (2 * k)), 0);
  assert.equal(PAT3[code([1, 2, 1, 0, 0, 0, 0, 0])], 1);
  assert.equal(PAT3[code([2, 1, 2, 0, 0, 0, 0, 0])], 1, 'цвета наоборот');
  assert.equal(PAT3[code([0, 0, 0, 0, 0, 1, 2, 1])], 1, 'повёрнутый');
  assert.equal(PAT3[code([0, 0, 0, 0, 0, 0, 0, 0])], 0, 'пустота — не шаблон');
});

test('бот берёт группу в атари', () => {
  // белые (3,4) (4,4) (5,4) в окружении чёрных, последняя свобода — (6,4)
  const { s } = gameOf(9, [[2, 4], [3, 4], [3, 3], [4, 4], [3, 5], [5, 4], [4, 3], [0, 0], [4, 5], [0, 1], [5, 3], [1, 0], [5, 5], [8, 8]]);
  const pos = replay(s);
  assert.equal(pos.turn, BLACK);
  const r = chooseMove(s, { ...LEVELS[2], timeMs: 1e9 }, makeRng(3));
  assert.equal(r.move, at(9, 6, 4), `взять три камня в ${coordName(9, at(9, 6, 4))}`);
});

test('бот пасует в решённой позиции после паса соперника, когда впереди', () => {
  // чёрные: 45 против 36 + 6,5 у белых — чёрные впереди; белые спасовали
  const { s, pos, n } = splitBoard();
  playMove(s, pos, at(n, 4, 2));
  playMove(s, pos, PASS);
  const r = chooseMove(s, { ...LEVELS[3], playouts: 3000, timeMs: 1e9 }, makeRng(5));
  assert.equal(r.move, PASS);
});

test('мёртвый камень в чужой территории отмечается мёртвым, живые стены — нет', () => {
  const { s, pos, n } = splitBoard();
  playMove(s, pos, PASS);
  playMove(s, pos, at(n, 4, 1));
  const { dead } = estimateDead(s, 400, makeRng(8));
  assert.deepEqual(dead, [at(n, 4, 1)]);
});

test('слабые уровни доигрывают партию 9×9 до двух пасов, только законными ходами', () => {
  const s = newGame({ size: 9, vs: 'friend' });
  const pos = replay(s);
  const rng = makeRng(11);
  for (let k = 0; k < 300 && pos.passes < 2; k++) {
    const r = chooseMove(s, { ...LEVELS[k % 2], timeMs: 1e9 }, rng);
    if (r.move === 'resign') break;
    assert.ok(playMove(s, pos, r.move), 'бот ходит только законно');
  }
  assert.equal(pos.passes, 2, `партия закончилась (ходов ${s.moves.length})`);
  assert.ok(isValidGame(s));
});

test('статистика, выбор партии и настройки', () => {
  let st = emptyStats();
  const g = newGame({ size: 13, level: 3 });
  st = recordGame(st, g, { won: true });
  st = recordGame(st, g, { won: false });
  st = recordGame(st, newGame({ size: 9, vs: 'friend' }), { winner: WHITE });
  assert.deepEqual(st.s13[3], { played: 2, wins: 1, losses: 1 });
  assert.deepEqual([st.streak, st.bestStreak], [0, 1]);
  assert.deepEqual(st.friend, { played: 1, black: 0, white: 1 });
  assert.ok(isValidStats(st));
  assert.equal(normalizeSetup({ size: 9, handicap: 9 }).handicap, 0, 'на 9×9 фора не больше 5');
  assert.equal(normalizeSetup({ size: 7 }).size, 9);
  assert.equal(normalizeSettings({ skin: 'nope' }).skin, 'telegram');
});
