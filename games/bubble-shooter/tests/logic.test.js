// Правила «Шариков». Запуск: npm test

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COLS, R, ROW_H, WIDTH, VIEW_ROWS, ANCHOR, MATCH, STONE, LOCK, BONUS_MAX,
  rowCols, cellX, cellY, neighbors, emptyGrid, cloneGrid, countBubbles, countColored, colorsOnField, lowestRow,
  scrollFor, shooterPos, ceilingY, snapCell, fly, cluster, floating, blastArea,
  newLevel, shoot, swap, arm, aimPath, angleTo, clampAngle, MAX_ANGLE, starsFor, levelRows, paletteFor,
  isValidState, emptyStats, recordGame, isValidStats,
} from '../logic.js';

function seeded(seed) {
  let x = seed;
  return () => {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };
}

/** Состояние с пустым полем нужной высоты — для точечных проверок. */
function blank(rows = 20, extra = {}) {
  return {
    level: 1, grid: emptyGrid(rows), scroll: 0, shots: 20, score: 0, combo: 0, target: 1000,
    current: 0, next: 0, bonuses: { bomb: 1, rainbow: 1, fire: 1 }, armed: null, over: null, ...extra,
  };
}

test('шестиугольная сетка: соседи касаются, нечётные ряды сдвинуты', () => {
  const grid = emptyGrid(10);
  assert.equal(rowCols(0), COLS);
  assert.equal(rowCols(1), COLS - 1);
  assert.equal(cellX(1, 0), 2 * R);
  for (const [r, c] of neighbors(grid, 4, 5)) {
    assert.ok(Math.abs(Math.hypot(cellX(4, 5) - cellX(r, c), cellY(4) - cellY(r)) - 1) < 1e-9);
  }
  assert.equal(neighbors(grid, 0, 0).length, 2, 'у углового шара два соседа');
  assert.equal(neighbors(grid, 4, 5).length, 6);
});

test('отскок от стены: шар разворачивается, а не ползёт по стене', () => {
  // Баг первой версии (найден владельцем): отражалась позиция, но не скорость — шар лип к стене
  // и полз вверх. Здесь проверяется, что после каждого удара шар уходит от стены.
  const grid = emptyGrid(30);
  for (const angle of [-1.3, -1.1, -0.9, 0.9, 1.1, 1.3]) {
    const { path } = fly(grid, { x: WIDTH / 2, y: 20 }, angle);
    const bounces = path.map((p, i) => (p.bounce ? i : -1)).filter((i) => i >= 0);
    assert.ok(bounces.length >= 1, `угол ${angle}: был удар о стену`);
    for (const i of bounces) {
      const wallLeft = path[i].x < WIDTH / 2;
      const after = path.slice(i + 1, i + 8);
      assert.ok(after.every((p, k) => (wallLeft ? p.x > (k ? after[k - 1].x : path[i].x) : p.x < (k ? after[k - 1].x : path[i].x))),
        `угол ${angle}: после удара шар уходит от стены`);
    }
    // шар не «прилипает»: точек вплотную к стене очень мало
    const hugging = path.filter((p) => p.x < R + 0.02 || p.x > WIDTH - R - 0.02).length;
    assert.ok(hugging <= bounces.length * 2, `угол ${angle}: не ползёт по стене (${hugging} точек у стены)`);
  }
});

test('отражённый полёт летит по «зеркальной» прямой', () => {
  const grid = emptyGrid(30);
  const angle = 1.0;
  const { path } = fly(grid, { x: WIDTH / 2, y: 20 }, angle);
  const i = path.findIndex((p) => p.bounce);
  const a = path[i + 5];
  const b = path[i + 25];
  const slope = (b.x - a.x) / (a.y - b.y);        // dx на единицу подъёма
  assert.ok(Math.abs(slope + Math.tan(angle)) < 0.02, 'после удара наклон тот же, но в другую сторону');
});

test('прилипание: к соседу или к верхнему ряду', () => {
  const grid = emptyGrid(10);
  grid[0][5] = 1;
  assert.deepEqual(snapCell(grid, cellX(1, 5), cellY(1)), [1, 5]);
  assert.equal(snapCell(emptyGrid(10), 3, 0.6)[0], 0, 'в пустом поле — только верхний ряд');
});

test('три одинаковых лопаются, две — остаются', () => {
  const s = blank();
  s.grid[0][4] = 0;
  s.grid[0][5] = 0;
  const res = shoot(s, angleTo(0, cellX(0, 6), cellY(0)), seeded(1));
  assert.equal(res.popped.length, MATCH);
  assert.equal(countBubbles(s.grid), 0);

  const t = blank();
  t.grid[0][4] = 0;
  const res2 = shoot(t, angleTo(0, cellX(0, 5), cellY(0)), seeded(2));
  assert.equal(res2.popped.length, 0);
  assert.equal(countBubbles(t.grid), 2);
});

test('отцепившиеся падают, лопнувшая тройка роняет хвост', () => {
  const s = blank(20, { current: 3 });
  s.grid[0][4] = 3;
  s.grid[0][5] = 3;
  s.grid[1][4] = 5;
  s.grid[2][4] = 5;
  const res = shoot(s, angleTo(0, cellX(0, 6), cellY(0)), seeded(3));
  assert.equal(res.popped.length, 3);
  assert.equal(res.dropped.length, 2);
  assert.equal(s.over, 'win');
});

test('шар в цепях: первое совпадение снимает цепь, второе — лопает', () => {
  const s = blank(20, { current: 2, next: 2 });
  s.grid[0][3] = 2;
  s.grid[0][4] = 2 + LOCK;                           // в цепях
  const first = shoot(s, angleTo(0, cellX(0, 5), cellY(0)), seeded(4));
  assert.equal(first.unlocked.length, 1, 'цепь слетела');
  assert.equal(first.popped.length, 2, 'лопнули свободные');
  assert.equal(s.grid[0][4], 2, 'шар остался, уже без цепи');
});

test('камни: цветом не собираются, падают вместе с опорой, взрываются бомбой', () => {
  const s = blank(20, { current: 1 });
  s.grid[0][4] = 1;
  s.grid[0][5] = 1;
  s.grid[1][4] = STONE;                              // висит на синих
  s.grid[0][9] = 4;                                  // чтобы поле не очистилось
  assert.deepEqual(cluster(s.grid, 1, 4), [], 'камень не образует гроздь');
  const res = shoot(s, angleTo(0, cellX(0, 6), cellY(0)), seeded(5));
  assert.equal(res.popped.length, 3);
  assert.ok(res.dropped.some(([r, c]) => r === 1 && c === 4), 'камень упал вместе с опорой');

  const b = blank(20);
  b.grid[0][5] = STONE;
  b.grid[0][6] = STONE;
  b.grid[0][0] = 3;
  assert.equal(arm(b, 'bomb'), true);
  const boom = shoot(b, angleTo(0, cellX(1, 5), cellY(1)), seeded(6));
  assert.ok(boom.blasted.length >= 2, 'бомба разнесла камни');
  assert.equal(b.bonuses.bomb, 0);
  assert.equal(b.shots, 20, 'бонус не тратит выстрел');
});

test('радуга подходит к любому цвету', () => {
  // Верхний ряд — камни (держат всё и цветом не собираются). Во втором ряду по бокам от клетки (1,5)
  // красная и зелёная пары; радуга, встав в (1,5), дополняет до тройки обе.
  const s = blank(20);
  for (let c = 0; c < COLS; c += 1) s.grid[0][c] = STONE;
  s.grid[1][3] = 1;
  s.grid[1][4] = 1;
  s.grid[1][6] = 4;
  s.grid[1][7] = 4;
  s.grid[1][0] = 5;
  arm(s, 'rainbow');
  const res = shoot(s, angleTo(0, cellX(1, 5), cellY(1)), seeded(7));
  assert.deepEqual(res.cell, [1, 5], 'радуга встала между парами');
  assert.ok(res.popped.length >= 4, `лопнули обе пары: ${res.popped.length}`);
  assert.equal(s.grid[1][3], null);
  assert.equal(s.grid[1][7], null);
  assert.equal(s.bonuses.rainbow, 0);
});

test('огненный шар прожигает насквозь и не прилипает', () => {
  const s = blank(20);
  for (let r = 0; r < 6; r += 1) s.grid[r][5 - (r % 2)] = r % 3;
  s.grid[0][0] = 3;
  arm(s, 'fire');
  const res = shoot(s, 0, seeded(8));
  assert.equal(res.cell, null, 'огонь не встаёт в сетку');
  assert.ok(res.blasted.length >= 4, `сожжено ${res.blasted.length}`);
  assert.equal(s.shots, 20, 'бонус не тратит выстрел');
  assert.equal(s.armed, null);
});

test('бонус можно взвести и снять; без запаса — нельзя', () => {
  const s = blank();
  assert.equal(arm(s, 'fire'), true);
  assert.equal(s.armed, 'fire');
  assert.equal(arm(s, 'fire'), true, 'повторное нажатие снимает');
  assert.equal(s.armed, null);
  s.bonuses.bomb = 0;
  assert.equal(arm(s, 'bomb'), false);
  assert.equal(arm(s, 'нет-такого'), false);
});

test('серия из трёх попаданий дарит бонус', () => {
  const s = blank(20, { combo: 2, current: 0, bonuses: { bomb: 0, rainbow: 0, fire: 0 } });
  s.grid[0][4] = 0;
  s.grid[0][5] = 0;
  s.grid[0][9] = 2;
  const res = shoot(s, angleTo(0, cellX(0, 6), cellY(0)), seeded(9));
  assert.equal(res.combo, 3);
  assert.ok(res.reward, 'бонус выдан');
  assert.equal(s.bonuses[res.reward], 1);

  const full = blank(20, { combo: 2, current: 0, bonuses: { bomb: BONUS_MAX, rainbow: BONUS_MAX, fire: BONUS_MAX } });
  full.grid[0][4] = 0;
  full.grid[0][5] = 0;
  full.grid[0][9] = 2;
  assert.equal(shoot(full, angleTo(0, cellX(0, 6), cellY(0)), seeded(9)).reward, null, 'копилка полна');
});

test('поле выше экрана и сползает вниз по мере расчистки', () => {
  const s = newLevel(8, seeded(10));
  assert.ok(levelRows(8) > VIEW_ROWS, 'уровень выше экрана');
  assert.ok(s.scroll > 0, 'сверху спрятаны ряды');
  assert.equal(lowestRow(s.grid) - s.scroll, ANCHOR, 'нижний шар на опорном ряду экрана');

  // убираем нижние ряды — камера опускает поле
  const before = s.scroll;
  const low = lowestRow(s.grid);
  for (let r = low - 2; r <= low; r += 1) for (let c = 0; c < rowCols(r); c += 1) s.grid[r][c] = null;
  assert.ok(scrollFor(s.grid) < before, 'поле сползло вниз');
});

test('шар не улетает в спрятанную часть уровня', () => {
  const s = newLevel(10, seeded(11));
  const ceil = ceilingY(s.scroll);
  for (const angle of [-1.2, -0.5, 0, 0.5, 1.2]) {
    const { path } = fly(s.grid, shooterPos(s.scroll), angle, { ceiling: ceil });
    assert.ok(path.every((p) => p.y >= ceil - 1e-9), `угол ${angle}`);
  }
});

test('конец партии: выстрелы кончились — проигрыш, остались только камни — победа', () => {
  const s = blank(20, { shots: 1, current: 1 });
  s.grid[0][0] = 2;
  shoot(s, 0.3, seeded(12));
  assert.equal(s.over, 'lose');

  const w = blank(20, { current: 1 });
  w.grid[0][4] = 1;
  w.grid[0][5] = 1;
  w.grid[0][9] = STONE;                                // висит сам по себе на потолке
  const res = shoot(w, angleTo(0, cellX(0, 6), cellY(0)), seeded(13));
  assert.equal(w.over, 'win', 'цветных не осталось');
  assert.ok(res.dropped.some(([r, c]) => r === 0 && c === 9), 'камень осыпался');
  assert.equal(countBubbles(w.grid), 0);
  assert.ok(w.score >= 3 * 10 + 19 * 50, 'бонус за оставшиеся выстрелы');
});

test('стрелок держит только цвета, которые есть на поле', () => {
  const rng = seeded(14);
  const s = newLevel(6, rng);
  for (let i = 0; i < 40 && !s.over; i += 1) {
    const present = colorsOnField(s.grid);
    assert.ok(present.includes(s.current), `текущий ${s.current} есть на поле`);
    shoot(s, (rng() - 0.5) * 2 * MAX_ANGLE, rng);
  }
});

test('300 случайных выстрелов (с бонусами) не ломают поле', () => {
  const rng = seeded(21);
  let shots = 0;
  for (let game = 0; game < 30 && shots < 300; game += 1) {
    const s = newLevel(1 + (game % 12), rng);
    while (!s.over && shots < 300) {
      if (rng() < 0.1) arm(s, ['bomb', 'rainbow', 'fire'][Math.floor(rng() * 3)]);
      const res = shoot(s, (rng() - 0.5) * 2 * MAX_ANGLE, rng);
      shots += 1;
      assert.ok(res && res.path.length > 1);
      assert.equal(floating(s.grid).length, 0, 'висящих в воздухе не остаётся');
      assert.ok(isValidState(JSON.parse(JSON.stringify(s))));
    }
  }
  assert.equal(shots, 300);
});

test('генерация: палитра по сложности, пятна цветов, камни и цепи с ростом уровня', () => {
  const rng = seeded(31);
  for (let level = 1; level <= 30; level += 1) {
    const s = newLevel(level, rng);
    assert.equal(floating(s.grid).length, 0, `уровень ${level}`);
    for (const color of colorsOnField(s.grid)) assert.ok(color < paletteFor(level));
    assert.ok(countColored(s.grid) > 20);
    assert.ok(isValidState(s));
  }
  const values = (level) => [...Array(6)].flatMap((_, i) => newLevel(level, seeded(40 + i)).grid.flat());
  assert.equal(values(1).filter((v) => v === STONE).length, 0, 'на первом уровне камней нет');
  assert.ok(values(15).filter((v) => v === STONE).length > 0, 'дальше камни есть');
  assert.ok(values(15).filter((v) => v !== null && v >= LOCK).length > 0, 'и цепи');
});

/**
 * Бот, похожий на человека: перебирает 61 угол, умеет менять шар местами, при промахе ставит шар
 * к своему цвету (готовит тройку). Бонусами не пользуется — значит, у игрока запас ещё больше.
 * Грубый бот (41 угол, без смены шара) застревал в концовке, когда у потолка оставалось несколько
 * шаров: мазал, каждый промах добавлял шар — и баланс по нему ничего не говорил.
 */
function botPlays(level, seed) {
  const rng = seeded(seed);
  const s = newLevel(level, rng);
  while (!s.over) {
    let best = { v: -Infinity, a: 0, swap: false };
    for (const swapped of [false, true]) {
      const base = swapped ? { ...s, current: s.next, next: s.current } : s;
      for (let k = -30; k <= 30; k += 1) {
        const a = (k / 30) * MAX_ANGLE;
        const trial = { ...base, grid: cloneGrid(s.grid), bonuses: { ...s.bonuses } };
        const res = shoot(trial, a, seeded(1));
        let v = res.gained;
        if (!v && res.cell) {
          const same = neighbors(trial.grid, res.cell[0], res.cell[1])
            .filter(([r, c]) => trial.grid[r][c] !== null && trial.grid[r][c] % 10 === base.current).length;
          v = same * 2 - res.cell[0] * 0.01;
        }
        if (v > best.v) best = { v, a, swap: swapped };
      }
    }
    if (best.swap) swap(s);
    shoot(s, best.a, rng);
  }
  return s.over === 'win';
}

test('баланс: первые уровни проходимы, дальше — заметно труднее', () => {
  const wins = (level, n = 3) => Array.from({ length: n }, (_, i) => botPlays(level, 700 + i)).filter(Boolean).length;
  const easy = wins(1);
  const hard = wins(14);
  assert.ok(easy >= 2, `1-й уровень бот проходит: ${easy}/3`);
  assert.ok(hard < easy, `14-й уровень труднее: ${hard}/3 против ${easy}/3`);
});

test('прицел, замена шара, звёзды, сохранение, статистика', () => {
  assert.equal(clampAngle(3), MAX_ANGLE);
  assert.ok(Math.abs(angleTo(0, WIDTH / 2, 0)) < 1e-9);
  const s = newLevel(3, seeded(51));
  assert.ok(aimPath(s, 0.4).length > 2);

  const [a, b] = [s.current, s.next];
  swap(s);
  assert.deepEqual([s.current, s.next], [b, a]);

  assert.equal(starsFor({ score: 0, target: 100 }), 0);
  assert.equal(starsFor({ score: 30, target: 100 }), 1);
  assert.equal(starsFor({ score: 60, target: 100 }), 2);
  assert.equal(starsFor({ score: 100, target: 100 }), 3);

  assert.ok(isValidState(JSON.parse(JSON.stringify(s))));
  assert.equal(isValidState({ ...s, armed: 'нет' }), false);
  assert.equal(isValidState({ ...s, bonuses: null }), false);

  let st = emptyStats();
  st = recordGame(st, { level: 4, score: 900 }, true);
  st = recordGame(st, { level: 5, score: 300 }, false);
  assert.deepEqual(st, { played: 2, cleared: 1, bestLevel: 4, bestScore: 900 });
  assert.ok(isValidStats(st));
});
