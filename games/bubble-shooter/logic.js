// «Шарики» (bubble shooter) по видео владельца (Shoot Bubble). Логика чистая: без DOM, случайность —
// параметром.
//
// Шары висят шестиугольной сеткой. Уровень выше экрана: видна только нижняя часть, и по мере того как
// её расчищаешь, всё поле сползает вниз (как в видео — сверху торчат обрезанные шары). Выстрелов
// ограниченное число. Три и больше одного цвета лопаются, всё, что после этого повисло, падает.
// Серые камни цветом не собираются — только падают или взрываются. Шар в цепях с первого совпадения
// теряет цепь, со второго лопается. Бонусы: бомба, радуга (подходит к любому цвету), огненный шар
// (прожигает насквозь).
//
// Координаты — в диаметрах шара, ряды считаются от верха уровня. Чётные ряды — COLS шаров, нечётные —
// на один меньше и сдвинуты на полшара.

export const COLS = 11;
export const R = 0.5;
export const ROW_H = Math.sqrt(3) / 2;
export const WIDTH = COLS;

export const VIEW_ROWS = 13;                      // сколько рядов видно над стрелком
export const ANCHOR = 8;                          // камера держит нижний шар на этом ряду экрана
export const FIELD_H = VIEW_ROWS * ROW_H + R;     // высота видимого поля
export const SHOOTER_DY = FIELD_H + 1.25;         // стрелок — ниже поля, от верха экрана

export const COLORS = 6;
export const STONE = 6;                           // серый камень: цветом не собирается
export const LOCK = 10;                           // значение + 10 — шар этого цвета в цепях
export const MATCH = 3;
export const SPEED = 22;                          // полёт, диаметров в секунду
export const STEP = 0.05;                         // шаг проверки столкновений

export const POP_POINTS = 10;
export const DROP_POINTS = 20;                    // как в видео: упавший дороже
export const BLAST_POINTS = 10;                   // взорванный бомбой или сожжённый
export const SHOT_BONUS = 50;                     // за каждый неистраченный выстрел при победе
export const BONUS_KINDS = ['bomb', 'rainbow', 'fire'];
export const BONUS_MAX = 3;

// ---------- значения клеток ----------

export const isStone = (v) => v === STONE;
export const isLocked = (v) => v !== null && v >= LOCK;
export const colorOf = (v) => (v === null ? null : v >= LOCK ? v - LOCK : v);
export const isColored = (v) => v !== null && !isStone(v);

// ---------- сетка ----------

export const rowCols = (r) => (r % 2 === 0 ? COLS : COLS - 1);
export const cellX = (r, c) => c + R + (r % 2 === 0 ? 0 : R);
export const cellY = (r) => r * ROW_H + R;

export const inGrid = (grid, r, c) => r >= 0 && r < grid.length && c >= 0 && c < rowCols(r);
export const at = (grid, r, c) => (inGrid(grid, r, c) ? grid[r][c] : null);

export function neighbors(grid, r, c) {
  const odd = r % 2 !== 0;
  return [
    [r, c - 1], [r, c + 1],
    [r - 1, odd ? c : c - 1], [r - 1, odd ? c + 1 : c],
    [r + 1, odd ? c : c - 1], [r + 1, odd ? c + 1 : c],
  ].filter(([rr, cc]) => inGrid(grid, rr, cc));
}

export const emptyGrid = (rows) => Array.from({ length: rows }, (_, r) => Array(rowCols(r)).fill(null));
export const cloneGrid = (grid) => grid.map((row) => [...row]);

export function* filled(grid) {
  for (let r = 0; r < grid.length; r += 1) {
    for (let c = 0; c < rowCols(r); c += 1) {
      if (grid[r][c] !== null) yield [r, c, grid[r][c]];
    }
  }
}

export const countBubbles = (grid) => [...filled(grid)].length;
export const countColored = (grid) => [...filled(grid)].filter(([, , v]) => isColored(v)).length;

export function colorsOnField(grid) {
  const set = new Set();
  for (const [, , v] of filled(grid)) if (isColored(v)) set.add(colorOf(v));
  return [...set].sort((a, b) => a - b);
}

export function lowestRow(grid) {
  let low = -1;
  for (const [r] of filled(grid)) low = Math.max(low, r);
  return low;
}

// ---------- камера ----------

/** Сколько верхних рядов уровня спрятано над экраном: нижний шар держится на ряду ANCHOR. */
export const scrollFor = (grid) => Math.max(0, lowestRow(grid) - ANCHOR);

/** Где стрелок в координатах уровня. */
export const shooterPos = (scroll) => ({ x: WIDTH / 2, y: scroll * ROW_H + SHOOTER_DY });

/** Верх видимой части: выше него шар не улетает (там спрятанные ряды, как в видео). */
export const ceilingY = (scroll) => scroll * ROW_H + R;

// ---------- полёт ----------

/** Свободная клетка ближе всего к точке, у которой есть занятый сосед (или это верхний ряд уровня). */
export function snapCell(grid, x, y) {
  let best = null;
  let bestDist = Infinity;
  const r0 = Math.max(0, Math.round((y - R) / ROW_H) - 2);
  const r1 = Math.min(grid.length - 1, r0 + 4);
  for (let r = r0; r <= r1; r += 1) {
    for (let c = 0; c < rowCols(r); c += 1) {
      if (grid[r][c] !== null) continue;
      const attached = r === 0 || neighbors(grid, r, c).some(([rr, cc]) => grid[rr][cc] !== null);
      if (!attached) continue;
      const d = (cellX(r, c) - x) ** 2 + (cellY(r) - y) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = [r, c];
      }
    }
  }
  return best;
}

function* nearbyCells(grid, x, y) {
  const r0 = Math.round((y - R) / ROW_H);
  for (let r = r0 - 1; r <= r0 + 1; r += 1) {
    if (r < 0 || r >= grid.length) continue;
    const c0 = Math.round(x - R - (r % 2 === 0 ? 0 : R));
    for (let c = c0 - 1; c <= c0 + 1; c += 1) {
      if (c >= 0 && c < rowCols(r)) yield [r, c];
    }
  }
}

function touching(grid, x, y, reach = 0.9) {
  for (const [r, c] of nearbyCells(grid, x, y)) {
    if (grid[r][c] === null) continue;
    if ((cellX(r, c) - x) ** 2 + (cellY(r) - y) ** 2 < reach * reach) return [r, c];
  }
  return null;
}

/**
 * Полёт шара от стрелка. Отражение от стен меняет **направление скорости**, а не только позицию —
 * иначе шар «прилипал» к стене и полз по ней вверх (баг первой версии, найден владельцем).
 *
 * fire: огненный шар не останавливается о шары, а сжигает их (burned) и летит до верха экрана.
 * Возвращает { path, cell, burned }: path — точки для анимации, cell — куда шар встал.
 */
export function fly(grid, start, angle, { ceiling = R, fire = false, maxSteps = 8000 } = {}) {
  let x = start.x;
  let y = start.y;
  let vx = Math.sin(angle);
  const vy = -Math.cos(angle);
  const path = [{ x, y }];
  const burned = [];
  const seen = new Set();

  for (let i = 0; i < maxSteps; i += 1) {
    x += vx * STEP;
    y += vy * STEP;

    let bounce = false;
    if (x < R) {
      x = 2 * R - x;
      vx = -vx;
      bounce = true;
    } else if (x > WIDTH - R) {
      x = 2 * (WIDTH - R) - x;
      vx = -vx;
      bounce = true;
    }

    if (y <= ceiling) {
      y = ceiling;
      path.push({ x, y, bounce });
      return { path, cell: fire ? null : snapCell(grid, x, y), burned };
    }

    if (fire) {
      for (const [r, c] of nearbyCells(grid, x, y)) {
        const key = `${r}:${c}`;
        if (seen.has(key) || grid[r][c] === null) continue;
        if ((cellX(r, c) - x) ** 2 + (cellY(r) - y) ** 2 < 0.85) {
          seen.add(key);
          burned.push([r, c]);
        }
      }
    } else if (touching(grid, x, y)) {
      path.push({ x, y, bounce });
      return { path, cell: snapCell(grid, x, y), burned };
    }
    path.push({ x, y, bounce });
  }
  return { path, cell: null, burned };
}

// ---------- лопание и падение ----------

/** Связная область одного цвета (шары в цепях — того же цвета, камни не считаются). */
export function cluster(grid, r, c) {
  const color = colorOf(at(grid, r, c));
  if (color === null || isStone(at(grid, r, c))) return [];
  const seen = new Set([`${r}:${c}`]);
  const stack = [[r, c]];
  const out = [];
  while (stack.length) {
    const [cr, cc] = stack.pop();
    out.push([cr, cc]);
    for (const [nr, nc] of neighbors(grid, cr, cc)) {
      const key = `${nr}:${nc}`;
      const v = grid[nr][nc];
      if (seen.has(key) || v === null || isStone(v) || colorOf(v) !== color) continue;
      seen.add(key);
      stack.push([nr, nc]);
    }
  }
  return out;
}

/** Шары, потерявшие связь с верхним рядом уровня. */
export function floating(grid) {
  const attached = new Set();
  const stack = [];
  for (let c = 0; c < rowCols(0); c += 1) {
    if (grid[0][c] !== null) {
      attached.add(`0:${c}`);
      stack.push([0, c]);
    }
  }
  while (stack.length) {
    const [r, c] = stack.pop();
    for (const [nr, nc] of neighbors(grid, r, c)) {
      const key = `${nr}:${nc}`;
      if (attached.has(key) || grid[nr][nc] === null) continue;
      attached.add(key);
      stack.push([nr, nc]);
    }
  }
  const out = [];
  for (const [r, c] of filled(grid)) if (!attached.has(`${r}:${c}`)) out.push([r, c]);
  return out;
}

/** Клетки в радиусе взрыва бомбы: два кольца вокруг точки попадания. */
export function blastArea(grid, r, c, radius = 1.9) {
  const out = [];
  for (let rr = Math.max(0, r - 3); rr <= Math.min(grid.length - 1, r + 3); rr += 1) {
    for (let cc = 0; cc < rowCols(rr); cc += 1) {
      if (grid[rr][cc] === null) continue;
      if (Math.hypot(cellX(rr, cc) - cellX(r, c), cellY(rr) - cellY(r)) <= radius + 1e-9) out.push([rr, cc]);
    }
  }
  return out;
}

// ---------- уровни ----------

// Сложность растёт плавно (подобрано ботом, см. тест «баланс»): цветов — +1 каждые три уровня,
// поле выше на полтора ряда за уровень, камни с 4-го уровня, цепи с 3-го.
export const levelRows = (level) => Math.min(8 + Math.floor(level * 1.5), 40);
export const paletteFor = (level) => Math.min(3 + Math.floor((level - 1) / 3), COLORS);
export const stoneChance = (level) => (level < 4 ? 0 : Math.min(0.02 + level * 0.006, 0.12));
export const lockChance = (level) => (level < 3 ? 0 : Math.min(0.02 + level * 0.008, 0.14));

/** Цвет для стрелка — только тот, что есть на поле, иначе выстрел заведомо бесполезен. */
export function pickColor(grid, palette, rng = Math.random) {
  const present = colorsOnField(grid);
  const pool = present.length ? present : Array.from({ length: palette }, (_, i) => i);
  return pool[Math.floor(rng() * pool.length)];
}

/**
 * Новый уровень. Цвета идут пятнами (соседи часто повторяют цвет) — как в видео, где лопаются
 * целые гроздья, а не одиночки. Выстрелов — по числу шаров с запасом, запас тает с уровнем.
 */
export function newLevel(level, rng = Math.random) {
  const rows = levelRows(level);
  const grid = emptyGrid(rows + VIEW_ROWS + 4);    // снизу — место, куда шары могут прирастать
  const palette = paletteFor(level);
  const stones = stoneChance(level);
  const locks = lockChance(level);

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < rowCols(r); c += 1) {
      if (r >= rows - 2 && rng() < 0.3) continue;  // нижний край рваный
      if (rng() < stones) {
        grid[r][c] = STONE;
        continue;
      }
      const around = neighbors(grid, r, c).map(([rr, cc]) => grid[rr][cc]).filter(isColored);
      const color = around.length && rng() < 0.55
        ? colorOf(around[Math.floor(rng() * around.length)])
        : Math.floor(rng() * palette);
      grid[r][c] = rng() < locks ? color + LOCK : color;
    }
  }
  for (const [r, c] of floating(grid)) grid[r][c] = null;

  const colored = countColored(grid);
  // Выстрелов впритык: на первых уровнях с запасом, дальше каждый выстрел должен что-то снимать
  // (владелец: «сложности нет»). Подобрано ботом — см. тест «баланс».
  const perShot = Math.min(2.6 + level * 0.06, 3.4);
  const slack = Math.max(3, 10 - Math.floor(level / 2));
  const state = {
    level,
    grid,
    scroll: scrollFor(grid),
    shots: Math.ceil(colored / perShot) + slack,
    score: 0,
    combo: 0,
    target: Math.max(300, colored * POP_POINTS * 2),
    current: pickColor(grid, palette, rng),
    next: pickColor(grid, palette, rng),
    bonuses: { bomb: 1, rainbow: 1, fire: 1 },
    armed: null,
    over: null,
  };
  return state;
}

// ---------- выстрел ----------

/**
 * Выстрел. Меняет state и возвращает всё, что нужно для анимации:
 * { path, cell, placed, popped, unlocked, burned, blasted, dropped, gained, combo, reward, over,
 *   scrollBefore, scrollAfter, kind }.
 */
export function shoot(state, angle, rng = Math.random) {
  if (state.over) return null;
  const kind = state.armed ?? 'ball';
  const scrollBefore = state.scroll;
  const start = shooterPos(scrollBefore);
  const { path, cell, burned } = fly(state.grid, start, angle, { ceiling: ceilingY(scrollBefore), fire: kind === 'fire' });

  let placed = null;
  let popped = [];
  let unlocked = [];
  let blasted = [];

  if (kind === 'fire') {
    blasted = burned;
    for (const [r, c] of burned) state.grid[r][c] = null;
  } else if (cell) {
    const [r, c] = cell;
    if (kind === 'bomb') {
      state.grid[r][c] = STONE;               // место взрыва — и оно уходит вместе с остальными
      blasted = blastArea(state.grid, r, c);
      for (const [br, bc] of blasted) state.grid[br][bc] = null;
    } else {
      placed = kind === 'rainbow' ? null : state.current;
      const groups = kind === 'rainbow' ? rainbowGroups(state.grid, r, c) : [];
      if (kind === 'rainbow') {
        state.grid[r][c] = null;
        const all = new Map();
        for (const group of groups) for (const [gr, gc] of group) all.set(`${gr}:${gc}`, [gr, gc]);
        ({ popped, unlocked } = resolveMatch(state.grid, [...all.values()]));
      } else {
        state.grid[r][c] = state.current;
        const group = cluster(state.grid, r, c);
        if (group.length >= MATCH) ({ popped, unlocked } = resolveMatch(state.grid, group));
      }
    }
  }

  const dropped = floating(state.grid);
  for (const [r, c] of dropped) state.grid[r][c] = null;

  const hit = popped.length + blasted.length > 0;
  if (kind === 'ball') state.shots -= 1;       // бонусы выстрелов не тратят
  else state.bonuses[kind] -= 1;
  state.armed = null;

  state.combo = hit ? state.combo + 1 : 0;
  const multiplier = Math.max(1, state.combo);
  const gained = (popped.length * POP_POINTS + blasted.length * BLAST_POINTS + dropped.length * DROP_POINTS) * multiplier;
  state.score += gained;

  // Серия из трёх попаданий подряд — случайный бонус в копилку (не больше BONUS_MAX каждого).
  let reward = null;
  if (state.combo > 0 && state.combo % 3 === 0) {
    const open = BONUS_KINDS.filter((k) => state.bonuses[k] < BONUS_MAX);
    if (open.length) {
      reward = open[Math.floor(rng() * open.length)];
      state.bonuses[reward] += 1;
    }
  }

  // Поле сползает вниз, когда нижние ряды расчищены.
  state.scroll = scrollFor(state.grid);

  if (countColored(state.grid) === 0) {
    // остались одни камни — они осыпаются, уровень пройден
    for (const [r, c] of filled(state.grid)) {
      dropped.push([r, c]);
      state.grid[r][c] = null;
    }
    state.score += state.shots * SHOT_BONUS;
    state.over = 'win';
  } else if (state.shots <= 0) {
    state.over = 'lose';
  }

  const palette = paletteFor(state.level);
  if (kind === 'ball') {
    state.current = state.next;
    state.next = pickColor(state.grid, palette, rng);
  }
  // Цвет стрелка мог исчезнуть с поля — заменяем, чтобы выстрел не был заведомо пустым.
  const present = colorsOnField(state.grid);
  if (present.length && !present.includes(state.current)) state.current = pickColor(state.grid, palette, rng);
  if (present.length && !present.includes(state.next)) state.next = pickColor(state.grid, palette, rng);

  return {
    kind, path, cell, placed, popped, unlocked, blasted, dropped, gained, combo: state.combo,
    reward, over: state.over, scrollBefore, scrollAfter: state.scroll,
  };
}

/** Совпадение: шары без цепей лопаются, у шаров в цепях слетает цепь. */
function resolveMatch(grid, group) {
  const popped = [];
  const unlocked = [];
  for (const [r, c] of group) {
    const v = grid[r][c];
    if (isLocked(v)) {
      grid[r][c] = colorOf(v);
      unlocked.push([r, c]);
    } else {
      grid[r][c] = null;
      popped.push([r, c]);
    }
  }
  return { popped, unlocked };
}

/** Радуга подходит к любому цвету: для каждого цвета-соседа — своя гроздь, если набирается тройка. */
function rainbowGroups(grid, r, c) {
  const colors = new Set();
  for (const [nr, nc] of neighbors(grid, r, c)) if (isColored(grid[nr][nc])) colors.add(colorOf(grid[nr][nc]));
  const groups = [];
  for (const color of colors) {
    grid[r][c] = color;
    const group = cluster(grid, r, c);
    if (group.length >= MATCH) groups.push(group);
  }
  grid[r][c] = null;
  return groups;
}

// ---------- ход игрока вне выстрела ----------

export function swap(state) {
  if (state.over) return false;
  [state.current, state.next] = [state.next, state.current];
  return true;
}

/** Взвести бонус (или снять, если он уже взведён). */
export function arm(state, kind) {
  if (state.over || !BONUS_KINDS.includes(kind)) return false;
  if (state.armed === kind) {
    state.armed = null;
    return true;
  }
  if (state.bonuses[kind] <= 0) return false;
  state.armed = kind;
  return true;
}

// ---------- прицел ----------

export const MAX_ANGLE = 1.38;
export const clampAngle = (a) => Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, a));

/** Угол на точку экрана (координаты уровня): 0 — вверх, вправо — положительный. */
export function angleTo(scroll, x, y) {
  const s = shooterPos(scroll);
  return clampAngle(Math.atan2(x - s.x, s.y - y));
}

/** Пунктир прицела: полный путь до шара или потолка, с отражениями от стен. */
export function aimPath(state, angle) {
  return fly(state.grid, shooterPos(state.scroll), angle, {
    ceiling: ceilingY(state.scroll), fire: state.armed === 'fire',
  }).path;
}

// ---------- звёзды ----------

export function starsFor(state) {
  const k = state.score / state.target;
  return k >= 1 ? 3 : k >= 0.6 ? 2 : k >= 0.3 ? 1 : 0;
}

// ---------- сохранение ----------

export function isValidState(s) {
  if (!s || !Array.isArray(s.grid) || s.grid.length < VIEW_ROWS) return false;
  for (let r = 0; r < s.grid.length; r += 1) {
    const row = s.grid[r];
    if (!Array.isArray(row) || row.length !== rowCols(r)) return false;
    const ok = row.every((v) => v === null || (Number.isInteger(v)
      && ((v >= 0 && v < COLORS) || v === STONE || (v >= LOCK && v < LOCK + COLORS))));
    if (!ok) return false;
  }
  const b = s.bonuses;
  return Number.isInteger(s.level) && s.level >= 1
    && [s.shots, s.score, s.combo, s.scroll, s.target].every((n) => Number.isInteger(n) && n >= 0)
    && [s.current, s.next].every((v) => Number.isInteger(v) && v >= 0 && v < COLORS)
    && Boolean(b) && BONUS_KINDS.every((k) => Number.isInteger(b[k]) && b[k] >= 0)
    && (s.armed === null || BONUS_KINDS.includes(s.armed))
    && (s.over === null || s.over === 'win' || s.over === 'lose');
}

// ---------- статистика ----------

export const emptyStats = () => ({ played: 0, cleared: 0, bestLevel: 0, bestScore: 0 });

export function recordGame(stats, state, won) {
  return {
    played: stats.played + 1,
    cleared: stats.cleared + (won ? 1 : 0),
    bestLevel: Math.max(stats.bestLevel, won ? state.level : 0),
    bestScore: Math.max(stats.bestScore, state.score),
  };
}

export const isValidStats = (s) => Boolean(s)
  && ['played', 'cleared', 'bestLevel', 'bestScore'].every((k) => Number.isInteger(s[k]) && s[k] >= 0);
