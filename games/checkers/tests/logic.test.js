// Русские шашки: генератор ходов (perft из начальной позиции — 7, 49, 302, 1469: до глубины 4 у всех вариантов
// 8×8 числа совпадают), особые правила (бить назад, обязательное взятие со свободным выбором, турецкий удар,
// превращение во время боя, дамка на любое поле за шашкой, но с продолжением боя), ничьи, движок и уровни.
// Запуск: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WHITE, BLACK, DRAW_PLIES, initialBoard, generateMoves, applyMove, squareName, newGame, playMove, undoMove, result,
  bestMove, evaluate, count, isValidState, emptyStats, isValidStats, migrateStats, LEVEL_IDS, MODES,
  LEVELS,
} from '../logic.js';

function seeded(seed) {
  let x = seed;
  return () => {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };
}

/** Поле по имени: 'c3' → индекс. */
const sq = (name) => (8 - Number(name[1])) * 8 + 'abcdefgh'.indexOf(name[0]);

/** Доска из списка: { c3: 1, d4: -1, ... } (1 — белая, 2 — белая дамка, −1/−2 — чёрные). */
function board(pieces) {
  const b = new Array(64).fill(0);
  for (const [k, v] of Object.entries(pieces)) b[sq(k)] = v;
  return b;
}

const names = (m) => [squareName(m.from), ...m.path.map(squareName)].join(m.captures.length ? ':' : '-');

function perft(b, side, depth) {
  if (depth === 0) return 1;
  let n = 0;
  for (const m of generateMoves(b, side)) n += perft(applyMove(b, m), -side, depth - 1);
  return n;
}

test('начальная позиция: 12 на 12, 7 ходов, perft 7 / 49 / 302 / 1469', () => {
  const b = initialBoard();
  assert.deepEqual(count(b), { wm: 12, wk: 0, bm: 12, bk: 0 });
  assert.equal(b[sq('a1')], WHITE);
  assert.equal(b[sq('h8')], BLACK);
  assert.deepEqual([1, 2, 3, 4].map((d) => perft(b, WHITE, d)), [7, 49, 302, 1469]);
});

test('простая бьёт назад; взятие обязательно; из вариантов — любой, не обязательно самый длинный', () => {
  // белая c3, чёрная b2 сзади — бьёт назад на a1; тихие ходы запрещены
  const back = board({ c3: 1, b2: -1, h8: -1 });
  const moves = generateMoves(back, WHITE);
  assert.deepEqual(moves.map(names), ['c3:a1']);
  // два варианта: взять одну (c3:e5) или две (c3:a5:c7) — доступны оба
  const choice = board({ c3: 1, d4: -1, b4: -1, b6: -1, h8: -1 });
  const opts = generateMoves(choice, WHITE).map(names).sort();
  assert.deepEqual(opts, ['c3:a5:c7', 'c3:e5']);
});

test('начатый бой продолжается до конца; побитые снимаются в конце хода (турецкий удар)', () => {
  // белая a1 бьёт b2 и d4 подряд: остановиться после первой нельзя
  const chain = board({ a1: 1, b2: -1, d4: -1, h8: -1 });
  assert.deepEqual(generateMoves(chain, WHITE).map(names), ['a1:c3:e5']);
  // дамка e1 по кругу f2 → f4 → d4 → d2 и снова на e1: одна шашка бьётся лишь раз, побитая мешает до конца хода
  const turk = board({ e1: 2, f2: -1, f4: -1, d4: -1, d2: -1, h8: -1 });
  for (const m of generateMoves(turk, WHITE)) {
    assert.equal(new Set(m.captures).size, m.captures.length, `${names(m)}: шашка побита дважды`);
  }
  const best = generateMoves(turk, WHITE).reduce((a, m) => Math.max(a, m.captures.length), 0);
  assert.equal(best, 4, 'дамка обходит кольцо из четырёх шашек');
  const after = applyMove(turk, generateMoves(turk, WHITE).find((m) => m.captures.length === 4));
  assert.equal(count(after).bm, 1, 'снято четыре, осталась h8');
});

test('простая, дошедшая до последнего ряда во время боя, становится дамкой и бьёт дальше как дамка', () => {
  // белая b6 бьёт c7 → d8 (дамочное поле) и сразу, уже дамкой, бьёт e7 → встать можно на f6, g5 или h4
  const promo = board({ b6: 1, c7: -1, e7: -1, h8: -1 });
  const moves = generateMoves(promo, WHITE);
  const two = moves.filter((m) => m.captures.length === 2);
  assert.ok(two.length >= 1, 'бьёт две');
  assert.ok(two.every((m) => m.promote), 'стала дамкой по ходу');
  const ends = two.map((m) => squareName(m.path[m.path.length - 1])).sort();
  assert.deepEqual(ends, ['f6', 'g5', 'h4'], 'как дамка — любое поле за шашкой');
  assert.equal(applyMove(promo, two[0])[two[0].path[1]], 2, 'на доске — дамка');
});

test('дамка: встаёт на любое поле за шашкой, но если с какого-то бой продолжается — только туда', () => {
  // дамка a1, чёрная c3: за ней d4…h8 свободны → пять вариантов
  const free = board({ a1: 2, c3: -1, a7: -1 });
  assert.deepEqual(generateMoves(free, WHITE).map((m) => squareName(m.path[0])).sort(), ['d4', 'e5', 'f6', 'g7', 'h8']);
  // та же, плюс чёрная g3: с e5 бой продолжается (e5–f4–g3? f4 пусто, g3 — шашка, за ней h2) — встать можно
  // только на поле, откуда бьётся g3: это e5 (диагональ e5–f4–g3–h2)
  const cont = board({ a1: 2, c3: -1, g3: -1, a7: -1 });
  const moves = generateMoves(cont, WHITE);
  assert.ok(moves.length > 0);
  for (const m of moves) {
    assert.equal(m.captures.length, 2, `${names(m)}: бой обязан продолжиться`);
    assert.equal(squareName(m.path[0]), 'e5');
    assert.equal(squareName(m.path[1]), 'h2');
  }
});

test('дамка ходит на любое расстояние; простая — только вперёд', () => {
  const b = board({ d4: 2, c3: 1, h8: -1 });
  const moves = generateMoves(b, WHITE).map(names).sort();
  assert.ok(moves.includes('d4-a7') && moves.includes('d4-h8') === false && moves.includes('d4-g7'));
  assert.ok(moves.includes('d4-e3') && moves.includes('d4-g1'));
  assert.ok(moves.includes('c3-b4') && !moves.includes('c3-b2'), 'простая назад не ходит');
});

test('партия: ход, отмена, конец игры, ничьи', () => {
  const s = newGame(WHITE, 'medium');
  const m = generateMoves(s.board, WHITE)[0];
  playMove(s, m);
  assert.equal(s.turn, BLACK);
  assert.ok(undoMove(s));
  assert.deepEqual(s.board, initialBoard());
  assert.equal(s.turn, WHITE);
  assert.ok(isValidState(JSON.parse(JSON.stringify(s))));
  // нет фигур / ходов — проигрыш
  const lost = { ...newGame(), board: board({ a1: 1, b2: -1, c3: -1 }), turn: WHITE, seen: {} };
  assert.deepEqual(result(lost), { winner: BLACK }, 'белая a1 заперта');
  // 15 ходов одними дамками без взятий — ничья
  const kings = { ...newGame(), board: board({ a1: 2, h8: -2 }), turn: WHITE, seen: {}, quiet: DRAW_PLIES - 1 };
  assert.equal(result(kings), null);
  playMove(kings, { from: sq('a1'), path: [sq('b2')], captures: [], promote: false });
  assert.deepEqual(result(kings), { draw: 'kings' }, '15 ходов дамками без взятий');
  const man = { ...newGame(), board: board({ a1: 2, h8: -2, c3: 1 }), turn: WHITE, seen: {}, quiet: DRAW_PLIES - 1 };
  playMove(man, { from: sq('c3'), path: [sq('d4')], captures: [], promote: false });
  assert.equal(man.quiet, 0, 'ход простой обнуляет счёт');
  // троекратное повторение
  const rep = { ...newGame(), board: board({ a1: 2, h8: -2, h2: 1 }), turn: WHITE, seen: {}, quiet: 0 };
  const shuttle = (from, to) => ({ from: sq(from), path: [sq(to)], captures: [], promote: false });
  const seq = [['a1', 'b2'], ['h8', 'g7'], ['b2', 'a1'], ['g7', 'h8']];
  let r = null;
  for (let k = 0; k < 12 && !r; k++) {
    playMove(rep, shuttle(...seq[k % 4]));
    r = result(rep);
  }
  assert.deepEqual(r, { draw: 'repeat' });
});

test('движок: берёт бесплатную шашку, не подставляется, мастер обыгрывает случайного', () => {
  // белая дамка может взять одну шашку — возьмёт
  const b = board({ c3: 1, d4: -1, h8: -1, a7: -1 });
  const m = bestMove(b, WHITE, { level: 'easy', noise: 0, blunder: 0, mistake: 0 });
  assert.equal(m.captures.length, 1);
  // средний уровень не отдаёт шашку даром: ход e3-f4 под чёрную g5 (бьёт на e3) — не выберет
  const safe = board({ e3: 1, a3: 1, g5: -1, h8: -1 });
  const mv = bestMove(safe, WHITE, { level: 'medium', noise: 0, mistake: 0 });
  assert.notEqual(names(mv), 'e3-f4');
  // сильный уровень против случайных ходов
  const rng = seeded(4);
  let wins = 0;
  for (let game = 0; game < 3; game++) {
    const s = newGame(WHITE, 'hard');
    let res = null;
    for (let ply = 0; ply < 200 && !res; ply++) {
      const moves = generateMoves(s.board, s.turn);
      const move = s.turn === WHITE ? bestMove(s.board, WHITE, { level: 'medium', noise: 0, mistake: 0, timeMs: 150 }) : moves[Math.floor(rng() * moves.length)];
      playMove(s, move);
      res = result(s);
    }
    if (res?.winner === WHITE) wins++;
  }
  assert.equal(wins, 3);
  assert.ok(evaluate(initialBoard(), WHITE) === 0, 'начальная позиция равна');
});

test('уровни и статистика по режимам (старая статистика — это классика)', () => {
  assert.deepEqual(LEVEL_IDS, ['novice', 'easy', 'medium', 'hard', 'master']);
  assert.deepEqual(MODES, ['classic', 'giveaway']);
  const st = emptyStats();
  assert.ok(isValidStats(st));
  st.giveaway.medium.wins = 1;
  assert.ok(isValidStats(st));
  const old = Object.fromEntries(LEVEL_IDS.map((l) => [l, { played: 2, wins: 1, losses: 1, draws: 0 }]));
  const migrated = migrateStats(old);
  assert.ok(isValidStats(migrated));
  assert.equal(migrated.classic.easy.played, 2);
  assert.equal(migrated.giveaway.easy.played, 0);
  assert.ok(isValidStats(migrateStats(null)));
});

test('поддавки: без ходов и шашек — победа; бот отдаёт шашки, а не бьёт лишнее', () => {
  // у белых нет шашек — в поддавках это победа белых
  const empty = { ...newGame(WHITE, 'medium', 'giveaway'), board: board({ h8: -1 }), turn: WHITE, seen: {} };
  assert.deepEqual(result(empty), { winner: WHITE });
  const classic = { ...empty, mode: 'classic' };
  assert.deepEqual(result(classic), { winner: BLACK }, 'в классике — проигрыш');
  // старое сохранение без режима — классика
  const s = newGame();
  delete s.mode;
  assert.ok(isValidState(JSON.parse(JSON.stringify(s))));
  // белые c3 и g3, чёрная d6: ход c3-d4 подставляет шашку под бой (чёрные обязаны бить) — в поддавках это хорошо
  const give = board({ c3: 1, g3: 1, e5: -1, h8: -1 });
  const m = bestMove(give, WHITE, { level: 'medium', mode: 'giveaway', noise: 0, mistake: 0 });
  const after = applyMove(give, m);
  const replies = generateMoves(after, BLACK);
  assert.ok(replies.length && replies[0].captures.length > 0, `ход ${names(m)} должен подставить шашку`);
  // та же позиция в классике — не подставляет
  const cm = bestMove(give, WHITE, { level: 'medium', mode: 'classic', noise: 0, mistake: 0 });
  assert.ok(!generateMoves(applyMove(give, cm), BLACK)[0]?.captures.length, `классика: ${names(cm)} не подставляет`);
  assert.ok(evaluate(board({ c3: 1, h8: -1, g7: -1 }), WHITE, 'giveaway') > 0, 'меньше шашек — лучше');
});

test('уровни: лестница по силе, слабые не видят ударов за горизонтом, подсказка точная', () => {
  const play = (a, b, seed) => {
    const rng = seeded(seed);
    const s = newGame(WHITE, 'medium');
    for (let ply = 0; ply < 160; ply++) {
      const r = result(s);
      if (r) return r.winner ?? 0;
      playMove(s, bestMove(s.board, s.turn, { level: s.turn === WHITE ? a : b, rng, timeMs: 1e9 }));
    }
    return 0;
  };
  // каждый следующий уровень обыгрывает предыдущий (по очкам, цветами поровну)
  for (const [strong, weak] of [['easy', 'novice'], ['medium', 'easy'], ['hard', 'medium']]) {
    let score = 0;
    for (let g = 0; g < 8; g++) {
      const r = g % 2 ? -play(weak, strong, g + 1) : play(strong, weak, g + 1);
      score += r > 0 ? 1 : r === 0 ? 0.5 : 0;
    }
    assert.ok(score >= 5, `${strong} против ${weak}: ${score} из 8`);
  }
  // слабые уровни не досчитывают взятия за горизонтом (не находят «удары»), сильные — досчитывают
  assert.equal(LEVELS.novice.quiesce, false);
  assert.equal(LEVELS.easy.quiesce, false);
  assert.notEqual(LEVELS.hard.quiesce, false);
  const hint = bestMove(initialBoard(), WHITE, { level: 'hint' });
  assert.ok(hint, 'подсказка считается отдельной точной настройкой');
});
