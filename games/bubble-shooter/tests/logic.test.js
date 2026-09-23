// Правила «Шариков»: сетка, прилипание, лопание, падение, конец партии. Запуск: npm test

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COLS, R, ROW_H, WIDTH, MAX_ROWS, DEADLINE_ROW, MATCH,
  rowCols, cellX, cellY, neighbors, emptyGrid, countBubbles, colorsOnField, lowestRow,
  snapCell, fly, cluster, floating, newLevel, shoot, swap, aimPath, angleTo, clampAngle, MAX_ANGLE,
  isValidState, emptyStats, recordGame, isValidStats, paletteFor, rowsFor, shotsFor,
} from '../logic.js';

function seeded(seed) {
  let x = seed;
  return () => {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };
}

test('шестиугольная сетка: нечётные ряды сдвинуты и короче', () => {
  assert.equal(rowCols(0), COLS);
  assert.equal(rowCols(1), COLS - 1);
  assert.equal(cellX(0, 0), R);
  assert.equal(cellX(1, 0), 2 * R, 'нечётный ряд сдвинут на полшара');
  assert.ok(Math.abs(cellY(1) - cellY(0) - ROW_H) < 1e-9);

  // соседние шары действительно касаются: расстояние между центрами — диаметр
  const dist = (r1, c1, r2, c2) => Math.hypot(cellX(r1, c1) - cellX(r2, c2), cellY(r1) - cellY(r2));
  for (const [r, c] of neighbors(2, 3)) assert.ok(Math.abs(dist(2, 3, r, c) - 1) < 1e-9, `${r}:${c}`);
  // у левого верхнего шара соседи только справа и снизу-справа — всего два
  assert.equal(neighbors(0, 0).length, 2, 'в углу соседей меньше');
  assert.equal(neighbors(0, 5).length, 4, 'в верхнем ряду нет соседей сверху');
  assert.equal(neighbors(3, 3).length, 6);
});

test('прилипание: шар встаёт в свободную клетку рядом с занятой', () => {
  const grid = emptyGrid();
  grid[0][5] = 1;
  const [r, c] = snapCell(grid, cellX(1, 5), cellY(1));
  assert.deepEqual([r, c], [1, 5]);
  assert.ok(neighbors(r, c).some(([nr, nc]) => grid[nr][nc] !== null), 'клетка примыкает к шару');

  // в пустое поле шар может встать только в верхний ряд
  const [r2] = snapCell(emptyGrid(), 3, 5);
  assert.equal(r2, 0);
});

test('полёт: отражается от стен, липнет к потолку и к шарам', () => {
  const grid = emptyGrid();
  // без препятствий — вверх до потолка
  const straight = fly(grid, { x: WIDTH / 2, y: 10 }, 0);
  assert.equal(straight.cell[0], 0, 'долетел до потолка');

  // сильно вбок — где-то отразился от стены
  const side = fly(grid, { x: WIDTH / 2, y: 10 }, 1.2);
  assert.ok(side.path.some((p) => p.bounce), 'есть отражение');
  assert.ok(side.path.every((p) => p.x >= R - 1e-9 && p.x <= WIDTH - R + 1e-9), 'не вылетел за стены');

  // упирается в шар
  grid[0][5] = 2;
  const hit = fly(grid, { x: cellX(0, 5), y: 10 }, 0);
  assert.ok(hit.cell[0] >= 1, 'встал под шаром, а не на его место');
  assert.equal(grid[hit.cell[0]][hit.cell[1]], null);
});

test('три одинаковых лопаются, два — нет', () => {
  const state = { grid: emptyGrid(), level: 1, shots: 5, score: 0, combo: 0, current: 0, next: 0, over: null };
  state.grid[0][4] = 0;
  state.grid[0][5] = 0;
  const before = countBubbles(state.grid);

  const res = shoot(state, angleTo(cellX(0, 6), cellY(0)), seeded(1));
  assert.equal(res.popped.length, MATCH, 'лопнули три');
  assert.equal(countBubbles(state.grid), before - 2, 'поле стало пустым: два лежали, третий лопнул вместе с ними');

  // два одинаковых остаются
  const other = { grid: emptyGrid(), level: 1, shots: 5, score: 0, combo: 0, current: 0, next: 0, over: null };
  other.grid[0][4] = 0;
  const res2 = shoot(other, angleTo(cellX(0, 5), cellY(0)), seeded(2));
  assert.equal(res2.popped.length, 0);
  assert.equal(countBubbles(other.grid), 2);
});

test('отцепившиеся шары падают', () => {
  const grid = emptyGrid();
  grid[0][3] = 1;         // держится за потолок
  grid[1][3] = 2;         // висит под ним
  grid[2][3] = 2;         // и ещё ниже
  assert.equal(floating(grid).length, 0);

  grid[0][3] = null;      // убрали опору
  const loose = floating(grid);
  assert.equal(loose.length, 2, 'оба шара повисли в воздухе');
});

test('цепная реакция: лопнувшая тройка роняет висевший хвост', () => {
  const state = { grid: emptyGrid(), level: 1, shots: 5, score: 0, combo: 0, current: 3, next: 3, over: null };
  state.grid[0][4] = 3;
  state.grid[0][5] = 3;
  state.grid[1][4] = 5;   // держится только за верхние
  state.grid[2][4] = 5;

  const res = shoot(state, angleTo(cellX(0, 6), cellY(0)), seeded(3));
  assert.equal(res.popped.length, 3);
  assert.equal(res.dropped.length, 2, 'хвост упал');
  assert.equal(countBubbles(state.grid), 0);
  assert.equal(state.over, 'win', 'поле очищено');
});

test('очки: за лопнувшие, за упавшие и множитель комбо', () => {
  const state = { grid: emptyGrid(), level: 1, shots: 9, score: 0, combo: 0, current: 0, next: 0, over: null };
  state.grid[0][0] = 0;
  state.grid[0][1] = 0;
  state.grid[0][9] = 0;
  state.grid[0][10] = 0;

  const first = shoot(state, angleTo(cellX(0, 2), cellY(0)), seeded(4));
  assert.equal(first.combo, 1);
  assert.equal(first.gained, 3 * 10, 'три шара по 10 очков');

  state.current = 0;
  const second = shoot(state, angleTo(cellX(0, 8), cellY(0)), seeded(5));
  assert.equal(second.combo, 2, 'комбо растёт');
  assert.equal(second.gained, 3 * 10 * 2, 'второй раз подряд — вдвое');

  const idle = { grid: emptyGrid(), level: 1, shots: 3, score: 0, combo: 4, current: 1, next: 1, over: null };
  idle.grid[0][0] = 2;
  shoot(idle, 0, seeded(6));
  assert.equal(idle.combo, 0, 'промах сбрасывает комбо');
});

test('партия кончается: шары внизу или выстрелы кончились', () => {
  const low = { grid: emptyGrid(), level: 1, shots: 5, score: 0, combo: 0, current: 4, next: 4, over: null };
  for (let r = 0; r <= DEADLINE_ROW; r += 1) low.grid[r][2] = 5;
  shoot(low, -1.2, seeded(7));
  assert.equal(low.over, 'lose', 'шары дошли до линии стрелка');

  const empty = { grid: emptyGrid(), level: 1, shots: 1, score: 0, combo: 0, current: 1, next: 1, over: null };
  empty.grid[0][0] = 2;
  shoot(empty, 0, seeded(8));
  assert.equal(empty.shots, 0);
  assert.equal(empty.over, 'lose', 'выстрелы кончились, шары остались');
});

test('стрелок выдаёт только цвета, которые есть на поле', () => {
  const rng = seeded(11);
  const state = newLevel(5, rng);
  for (let i = 0; i < 40 && !state.over; i += 1) {
    const present = colorsOnField(state.grid);
    assert.ok(present.includes(state.current), 'текущий цвет есть на поле');
    shoot(state, (rng() - 0.5) * 2 * MAX_ANGLE, rng);
  }
});

test('любой выстрел заканчивается и не ломает поле (300 случайных)', () => {
  const rng = seeded(21);
  let shots = 0;
  for (let game = 0; game < 12; game += 1) {
    const state = newLevel(1 + game, rng);
    while (!state.over && shots < 300) {
      const res = shoot(state, (rng() - 0.5) * 2 * MAX_ANGLE, rng);
      shots += 1;
      assert.ok(res, 'выстрел отработал');
      assert.ok(res.path.length > 1, 'есть траектория');
      if (res.cell) {
        const [r, c] = res.cell;
        assert.ok(r >= 0 && r < MAX_ROWS && c >= 0 && c < rowCols(r), 'клетка в пределах поля');
      }
      assert.ok(isValidState(JSON.parse(JSON.stringify(state))), 'состояние остаётся корректным');
    }
    if (shots >= 300) break;
  }
  assert.ok(shots >= 100, `сделано выстрелов: ${shots}`);
});

test('генерация уровня: цвета по сложности, без висящих шаров, шары не ниже линии', () => {
  const rng = seeded(31);
  for (let level = 1; level <= 30; level += 1) {
    const state = newLevel(level, rng);
    assert.equal(floating(state.grid).length, 0, `уровень ${level}: нет висящих в воздухе`);
    assert.ok(lowestRow(state.grid) < DEADLINE_ROW, `уровень ${level}: шары выше линии проигрыша`);
    assert.ok(countBubbles(state.grid) > 10, `уровень ${level}: поле не пустое`);
    const palette = paletteFor(level);
    for (const color of colorsOnField(state.grid)) {
      assert.ok(color < palette, `уровень ${level}: цвет ${color} вне палитры`);
    }
    assert.equal(state.shots, shotsFor(level));
    assert.ok(rowsFor(level) >= 4);
    assert.ok(isValidState(state));
  }
  assert.ok(paletteFor(1) < paletteFor(20), 'со временем цветов больше');
});

test('прицел: ограничен по углу, пунктир повторяет полёт', () => {
  assert.equal(clampAngle(3), MAX_ANGLE);
  assert.equal(clampAngle(-3), -MAX_ANGLE);
  assert.ok(Math.abs(angleTo(WIDTH / 2, 0)) < 1e-9, 'точно вверх');
  assert.ok(angleTo(WIDTH, 0) > 0, 'вправо — положительный угол');

  const grid = emptyGrid();
  grid[0][5] = 1;
  const path = aimPath(grid, 0);
  assert.ok(path.length > 2);
  assert.ok(path.at(-1).y < 3, 'пунктир доходит до шаров вверху');
});

test('замена шара местами со следующим', () => {
  const state = newLevel(2, seeded(41));
  const [a, b] = [state.current, state.next];
  assert.equal(swap(state), true);
  assert.equal(state.current, b);
  assert.equal(state.next, a);
  state.over = 'win';
  assert.equal(swap(state), false, 'после конца партии менять нечего');
});

test('сохранение и статистика', () => {
  const state = newLevel(3, seeded(51));
  assert.ok(isValidState(JSON.parse(JSON.stringify(state))));
  assert.equal(isValidState({ ...state, grid: state.grid.slice(1) }), false);
  assert.equal(isValidState({ ...state, current: 99 }), false);
  assert.equal(isValidState(null), false);

  let stats = emptyStats();
  stats = recordGame(stats, { level: 4, score: 1200 }, true);
  stats = recordGame(stats, { level: 5, score: 300 }, false);
  assert.deepEqual(stats, { played: 2, cleared: 1, bestLevel: 4, popped: 0, bestScore: 1200 });
  assert.ok(isValidStats(stats));
});
