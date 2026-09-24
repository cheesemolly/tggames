// «Змейка»: ползает по полю, ест — растёт; стены и собственное тело — смерть. Правила без DOM и без времени:
// время — в шагах, экран сам решает, как часто делать шаг (tickMs). rng передаётся параметром.
//
// Режим «Классика» — бесконечно, на рекорд; к ней можно включить режимы из Google Snake (вместе — как «Блендер»):
//   walls   — каждое яблоко ставит кирпич;
//   portal  — яблоки парами: съел одно — голова выныривает у второго;
//   winged  — яблоки летают и отскакивают;
//   poison  — на поле ядовитый гриб: съел — змейка короче на 3 и минус очки;
//   twin    — «Инь-ян»: вторая змейка повторяет ходы зеркально (влево ↔ вправо), врезалась она — конец.
// Режим «Уровни» — карты с препятствиями (levels.js): стены, порталы, патрульные блоки, шипы; съешь N — дальше.
//
// Везде: бонусная еда (как в Nokia Snake II: после каждых 5 яблок, на время, чем быстрее — тем больше очков,
// змейка от неё не растёт) и усилители: магнит, замедление, щит (прощает один удар), ×2 очки.
//
// Повороты — очередью (до 3): каждый проверяется по последнему запрошенному направлению, а не по текущему,
// иначе два быстрых свайпа за один шаг разворачивают змейку в собственную шею (известная ошибка змеек).

export const DIRS = {
  U: { dx: 0, dy: -1 },
  D: { dx: 0, dy: 1 },
  L: { dx: -1, dy: 0 },
  R: { dx: 1, dy: 0 },
};
const OPPOSITE = { U: 'D', D: 'U', L: 'R', R: 'L' };
const MIRROR = { U: 'U', D: 'D', L: 'R', R: 'L' };

export const SPEEDS = {
  turtle: { title: 'Черепаха', ms: 190, mult: 1 },
  snake: { title: 'Змея', ms: 135, mult: 2 },
  rabbit: { title: 'Кролик', ms: 92, mult: 3 },
};
export const SIZES = {
  small: { title: 'Маленькое', cols: 11, rows: 14 },
  medium: { title: 'Среднее', cols: 13, rows: 17 },
  large: { title: 'Большое', cols: 15, rows: 20 },
};
export const MODES = ['walls', 'portal', 'winged', 'poison', 'twin'];
export const POWERS = ['magnet', 'slow', 'shield', 'double'];

export const QUEUE_MAX = 3;
export const BONUS_EVERY = 5;          // яблок до бонусной еды
export const BONUS_TTL = 40;           // шагов живёт бонус
export const POWER_EVERY = 7;          // яблок до возможного усилителя
export const POWER_TTL = 60;           // шагов лежит усилитель
export const POWER_TIME = { magnet: 80, slow: 60, double: 80 };
export const SHIELD_FREEZE = 3;        // шагов стоим после удара со щитом — успеть повернуть
export const WINGED_EVERY = 3;         // яблоко-летун двигается раз в столько шагов
export const POISON_MOVE = 60;         // гриб перебирается на новое место
export const START_LEN = 4;

// ---------- поле ----------

export const idx = (s, x, y) => y * s.cols + x;
export const xy = (s, i) => ({ x: i % s.cols, y: Math.floor(i / s.cols) });
const inside = (s, x, y) => x >= 0 && y >= 0 && x < s.cols && y < s.rows;

/** Шипы подняты на этом шаге? (цикл period шагов, из них on — подняты; offset — сдвиг фазы) */
export function spikeUp(spike, step) {
  return ((step + spike.offset) % spike.period) < spike.on;
}

/** Поднимутся ли шипы через 1–2 шага (для предупреждения на экране). */
export function spikeSoon(spike, step) {
  return !spikeUp(spike, step) && (spikeUp(spike, step + 1) || spikeUp(spike, step + 2));
}

/** Клетка патрульного блока сейчас. */
export const moverCell = (m) => m.path[m.pos];

function blocked(s, i, { forFood = false } = {}) {
  if (s.cells[i]) return true;
  if (s.spikes.some((sp) => sp.idx === i && (forFood || spikeUp(sp, s.steps)))) return true;
  if (forFood && s.movers.some((m) => m.path.includes(i))) return true;
  if (s.movers.some((m) => moverCell(m) === i)) return true;
  if (forFood && s.portals.some((p) => p.a === i || p.b === i)) return true;
  return false;
}

const occupiedBySnake = (s, i) => s.snake.includes(i) || Boolean(s.twin?.snake.includes(i));
const foodAt = (s, i) => s.foods.findIndex((f) => f.idx === i);

/** Свободные клетки для еды и кирпичей: не стена, не шипы, не путь патруля, не змейка, не еда, не у самой головы. */
export function freeCells(s, { awayFromHead = 2 } = {}) {
  const head = xy(s, s.snake[0]);
  const out = [];
  for (let i = 0; i < s.cols * s.rows; i++) {
    if (blocked(s, i, { forFood: true }) || occupiedBySnake(s, i) || foodAt(s, i) >= 0) continue;
    const p = xy(s, i);
    if (Math.abs(p.x - head.x) + Math.abs(p.y - head.y) <= awayFromHead) continue;
    out.push(i);
  }
  return out;
}

const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

// ---------- новая партия ----------

/**
 * cfg: { mode: 'classic'|'levels', speed, size?, modes?, level?, map? }
 * map (для уровней, из levels.js): { cols, rows, walls, start: { x, y, dir }, portals, spikes, movers, goal, pace }
 */
export function newGame(cfg, rng = Math.random) {
  const speed = SPEEDS[cfg.speed] ? cfg.speed : 'snake';
  const mode = cfg.mode === 'levels' ? 'levels' : 'classic';
  const map = mode === 'levels' ? cfg.map : null;
  const size = SIZES[cfg.size] ?? SIZES.medium;
  const cols = map?.cols ?? size.cols;
  const rows = map?.rows ?? size.rows;
  const modes = mode === 'classic' ? MODES.filter((m) => (cfg.modes ?? []).includes(m)) : [];

  const s = {
    v: 1,
    mode,
    level: cfg.level ?? 0,
    speed,
    size: mode === 'classic' ? (SIZES[cfg.size] ? cfg.size : 'medium') : null,
    modes,
    cols,
    rows,
    cells: new Array(cols * rows).fill(0),      // 0 пусто, 1 стена, 2 кирпич (режим «Стены»)
    portals: [],
    spikes: [],
    movers: [],
    snake: [],
    dir: 'R',
    queue: [],
    grow: 0,
    twin: null,
    foods: [],
    effects: { magnet: 0, slow: 0, double: 0, shield: 0 },
    score: 0,
    eaten: 0,
    bonusCount: 0,
    powerCount: 0,
    steps: 0,
    freeze: 0,
    goal: map?.goal ?? 0,
    pace: map?.pace ?? 1,
    started: false,
    dead: false,
    won: false,
  };

  if (map) {
    for (const w of map.walls) s.cells[w] = 1;
    s.portals = map.portals.map((p) => ({ ...p }));
    s.spikes = map.spikes.map((sp) => ({ ...sp }));
    s.movers = map.movers.map((m) => ({ ...m, path: m.path.slice() }));
  }

  // змейка: голова в старте, тело — позади по направлению
  // С близнецом старт вертикальный: иначе зеркальные змейки ползли бы навстречу друг другу.
  const start = map?.start ?? (modes.includes('twin')
    ? { x: Math.floor(cols / 4), y: rows - START_LEN - 1, dir: 'U' }
    : { x: Math.floor(cols / 4) + START_LEN - 1, y: Math.floor(rows / 2), dir: 'R' });
  s.dir = start.dir;
  const back = DIRS[OPPOSITE[start.dir]];
  for (let k = 0; k < START_LEN; k++) s.snake.push(idx(s, start.x + back.dx * k, start.y + back.dy * k));
  if (modes.includes('twin')) {
    const tx = cols - 1 - start.x;
    const tdir = MIRROR[start.dir];
    const tback = DIRS[OPPOSITE[tdir]];
    s.twin = { dir: tdir, grow: 0, snake: Array.from({ length: START_LEN }, (_, k) => idx(s, tx + tback.dx * k, start.y + tback.dy * k)) };
  }

  spawnApples(s, rng);
  if (modes.includes('poison')) spawnFood(s, { kind: 'poison', ttl: POISON_MOVE }, rng);
  return s;
}

// ---------- еда ----------

function spawnFood(s, food, rng, opts) {
  const free = freeCells(s, opts);
  if (!free.length) return null;
  const f = { ...food, idx: pick(free, rng) };
  if (f.kind === 'apple' && s.modes.includes('winged')) f.wing = pick([[1, 1], [1, -1], [-1, 1], [-1, -1]], rng);
  s.foods.push(f);
  return f;
}

/** Обычные яблоки: одно (или пара в режиме «Порталы»). Нет места — поле заполнено, победа. */
function spawnApples(s, rng) {
  if (s.foods.some((f) => f.kind === 'apple')) return;
  if (s.modes.includes('portal')) {
    const a = spawnFood(s, { kind: 'apple', pair: 1 }, rng);
    const b = a && spawnFood(s, { kind: 'apple', pair: 1 }, rng, { awayFromHead: 4 });
    if (!b) {
      s.foods = s.foods.filter((f) => f.kind !== 'apple');
      if (!spawnFood(s, { kind: 'apple' }, rng, { awayFromHead: 0 })) s.won = true;
    }
    return;
  }
  if (!spawnFood(s, { kind: 'apple' }, rng) && !spawnFood(s, { kind: 'apple' }, rng, { awayFromHead: 0 })) s.won = true;
}

// ---------- управление ----------

/** Запросить поворот. Возвращает true, если принят (не разворот назад и не то же направление). */
export function turn(s, dir) {
  if (!DIRS[dir] || s.dead || s.won) return false;
  const last = s.queue.length ? s.queue[s.queue.length - 1] : s.dir;
  if (dir === last || dir === OPPOSITE[last]) {
    s.started = true;           // первый свайп вдоль направления тоже запускает игру
    return false;
  }
  if (s.queue.length >= QUEUE_MAX) return false;
  s.queue.push(dir);
  s.started = true;
  return true;
}

/** Сколько миллисекунд между шагами сейчас. */
export function tickMs(s) {
  const base = SPEEDS[s.speed].ms;
  // классика ускоряется по мере еды (до 60% от начального), уровни — по своему темпу
  const progress = s.mode === 'classic' ? Math.max(0.6, 1 - 0.02 * Math.floor(s.eaten / 3)) : 1 / s.pace;
  return Math.round(base * progress * (s.effects.slow > 0 ? 1.6 : 1));
}

export const scoreMult = (s) => SPEEDS[s.speed].mult * (s.effects.double > 0 ? 2 : 1);

// ---------- шаг ----------

function nextCell(s, from, dir) {
  const p = xy(s, from);
  const d = DIRS[dir];
  const nx = p.x + d.dx;
  const ny = p.y + d.dy;
  if (!inside(s, nx, ny)) return { cell: -1, portal: null };
  let cell = idx(s, nx, ny);
  const portal = s.portals.find((pt) => pt.a === cell || pt.b === cell);
  if (portal) cell = portal.a === cell ? portal.b : portal.a;          // вход — выход у парного
  return { cell, portal };
}

/** Что мешает голове встать в клетку (или null). tailFree — хвост на этом шаге уйдёт. */
function collision(s, cell, body, tailFree) {
  if (cell < 0) return 'wall';
  if (s.cells[cell] === 1) return 'wall';
  if (s.cells[cell] === 2) return 'brick';
  if (s.spikes.some((sp) => sp.idx === cell && spikeUp(sp, s.steps))) return 'spike';
  if (s.movers.some((m) => moverCell(m) === cell)) return 'mover';
  const own = tailFree ? body.slice(0, -1) : body;
  if (own.includes(cell)) return 'self';
  const other = body === s.snake ? s.twin?.snake : s.snake;
  if (other?.includes(cell)) return 'twin';
  return null;
}

/**
 * Один шаг. Возвращает список событий для экрана:
 *   { type: 'eat', kind, idx, points, who }   { type: 'power', power }   { type: 'teleport', from, to }
 *   { type: 'shield' }   { type: 'die', reason, idx }   { type: 'win' }   { type: 'spawn', kind, idx }
 *   { type: 'poison', removed }   { type: 'brick', idx }
 */
export function step(s, rng = Math.random) {
  const events = [];
  if (s.dead || s.won || !s.started) return events;

  if (s.freeze > 0) {
    // после удара со щитом змейка стоит, но повороты уже принимаются
    s.freeze--;
    if (s.queue.length) s.dir = s.queue.shift();
    tickTimers(s, rng, events);
    s.steps++;
    return events;
  }

  if (s.queue.length) s.dir = s.queue.shift();
  const twinDir = s.twin ? MIRROR[s.dir] : null;

  // куда пойдут голова (и близнец)
  const main = nextCell(s, s.snake[0], s.dir);
  const grows = s.grow > 0 || foodGrows(s, main.cell);
  let hit = collision(s, main.cell, s.snake, !grows);
  let twinMove = null;
  if (s.twin) {
    twinMove = nextCell(s, s.twin.snake[0], twinDir);
    const tGrows = s.twin.grow > 0 || foodGrows(s, twinMove.cell);
    const tHit = collision(s, twinMove.cell, s.twin.snake, !tGrows) ?? (twinMove.cell === main.cell ? 'twin' : null);
    if (!hit && tHit) hit = `twin-${tHit}`;
  }

  if (hit) {
    if (s.effects.shield > 0) {
      s.effects.shield = 0;
      s.freeze = SHIELD_FREEZE;
      s.queue = [];
      events.push({ type: 'shield', reason: hit });
      s.steps++;
      return events;
    }
    s.dead = true;
    events.push({ type: 'die', reason: hit, idx: main.cell });
    return events;
  }

  moveBody(s, s.snake, main.cell, 'grow', s);
  if (main.portal) events.push({ type: 'teleport', from: main.portal.a === main.cell ? main.portal.b : main.portal.a, to: main.cell });
  eatAt(s, main.cell, 'main', rng, events);
  if (s.twin) {
    s.twin.dir = twinDir;
    moveBody(s, s.twin.snake, twinMove.cell, 'grow', s.twin);
    eatAt(s, twinMove.cell, 'twin', rng, events);
  }

  moveMovers(s);
  moveFoods(s, rng);
  tickTimers(s, rng, events);
  spawnApples(s, rng);
  if (s.mode === 'levels' && s.eaten >= s.goal) s.won = true;
  if (s.won) events.push({ type: 'win' });
  s.steps++;
  return events;
}

const foodGrows = (s, cell) => s.foods.some((f) => f.idx === cell && f.kind === 'apple');

function moveBody(s, body, cell, key, owner) {
  body.unshift(cell);
  if (owner[key] > 0) owner[key]--;
  else body.pop();
}

function eatAt(s, cell, who, rng, events) {
  const k = foodAt(s, cell);
  if (k < 0) return;
  const f = s.foods[k];
  s.foods.splice(k, 1);
  const owner = who === 'twin' ? s.twin : s;
  const mult = scoreMult(s);

  if (f.kind === 'apple') {
    owner.grow += 1;
    s.eaten++;
    s.bonusCount++;
    s.powerCount++;
    const points = 10 * mult;
    s.score += points;
    events.push({ type: 'eat', kind: 'apple', idx: cell, points, who });
    if (f.pair) {
      // «Порталы»: голова выныривает у парного яблока, оно тоже съедено
      const j = s.foods.findIndex((o) => o.pair === f.pair && o.kind === 'apple');
      if (j >= 0) {
        const other = s.foods[j];
        s.foods.splice(j, 1);
        const body = who === 'twin' ? s.twin.snake : s.snake;
        body[0] = other.idx;                       // клетка яблока всегда свободна
        events.push({ type: 'teleport', from: cell, to: other.idx, who });
      }
    }
    if (s.modes.includes('walls')) {
      const spot = freeCells(s, { awayFromHead: 3 });
      if (spot.length) {
        const brick = pick(spot, rng);
        s.cells[brick] = 2;
        events.push({ type: 'brick', idx: brick });
      }
    }
    if (s.bonusCount >= BONUS_EVERY && !s.foods.some((o) => o.kind === 'bonus')) {
      s.bonusCount = 0;
      const b = spawnFood(s, { kind: 'bonus', ttl: BONUS_TTL, bonus: pick(['cherry', 'star', 'gem'], rng) }, rng, { awayFromHead: 3 });
      if (b) events.push({ type: 'spawn', kind: 'bonus', idx: b.idx });
    }
    if (s.powerCount >= POWER_EVERY && !s.foods.some((o) => o.kind === 'power')) {
      s.powerCount = 0;
      if (rng() < 0.6) {
        const p = spawnFood(s, { kind: 'power', ttl: POWER_TTL, power: pick(POWERS, rng) }, rng, { awayFromHead: 3 });
        if (p) events.push({ type: 'spawn', kind: 'power', idx: p.idx, power: p.power });
      }
    }
    return;
  }
  if (f.kind === 'bonus') {
    const points = (20 + f.ttl * 2) * mult;
    s.score += points;
    events.push({ type: 'eat', kind: 'bonus', idx: cell, points, who, bonus: f.bonus });
    return;
  }
  if (f.kind === 'power') {
    if (f.power === 'shield') s.effects.shield = 1;
    else s.effects[f.power] = POWER_TIME[f.power];
    events.push({ type: 'power', power: f.power, idx: cell, who });
    return;
  }
  if (f.kind === 'poison') {
    const body = who === 'twin' ? s.twin.snake : s.snake;
    const removed = [];
    for (let n = 0; n < 3 && body.length > 2; n++) removed.push(body.pop());
    s.score = Math.max(0, s.score - 20);
    events.push({ type: 'poison', idx: cell, removed, who });
    spawnFood(s, { kind: 'poison', ttl: POISON_MOVE }, rng, { awayFromHead: 4 });
  }
}

/** Патрульные блоки ходят туда-обратно по своему пути; в змейку не наезжают — ждут. */
function moveMovers(s) {
  for (const m of s.movers) {
    if ((s.steps + 1) % m.every !== 0) continue;
    let next = m.pos + m.step;
    if (next < 0 || next >= m.path.length) {
      m.step = -m.step;
      next = m.pos + m.step;
    }
    const cell = m.path[next];
    if (cell == null || occupiedBySnake(s, cell)) continue;
    m.pos = next;
  }
}

/** Летающие яблоки и магнит. */
function moveFoods(s, rng) {
  const head = xy(s, s.snake[0]);
  for (const f of s.foods) {
    if (f.kind !== 'apple' && f.kind !== 'bonus') continue;
    let target = null;
    if (s.effects.magnet > 0 && s.steps % 2 === 0) {
      const p = xy(s, f.idx);
      const dist = Math.abs(p.x - head.x) + Math.abs(p.y - head.y);
      if (dist > 1 && dist <= 6) {
        const dx = Math.sign(head.x - p.x);
        const dy = Math.sign(head.y - p.y);
        const opts = [];
        if (dx) opts.push(idx(s, p.x + dx, p.y));
        if (dy) opts.push(idx(s, p.x, p.y + dy));
        target = opts.find((c) => canHoldFood(s, c)) ?? null;
      }
    } else if (f.wing && s.steps % WINGED_EVERY === 0) {
      const p = xy(s, f.idx);
      for (let tries = 0; tries < 4 && !target; tries++) {
        const nx = p.x + f.wing[0];
        const ny = p.y + f.wing[1];
        if (inside(s, nx, ny) && canHoldFood(s, idx(s, nx, ny))) target = idx(s, nx, ny);
        else f.wing = tries % 2 === 0 ? [-f.wing[0], f.wing[1]] : [f.wing[0], -f.wing[1]];
      }
    }
    if (target != null) f.idx = target;
  }
  void rng;
}

const canHoldFood = (s, c) => !blocked(s, c, { forFood: true }) && !occupiedBySnake(s, c) && foodAt(s, c) < 0;

function tickTimers(s, rng, events) {
  for (const k of ['magnet', 'slow', 'double']) if (s.effects[k] > 0) s.effects[k]--;
  for (const f of s.foods.slice()) {
    if (f.ttl == null) continue;
    f.ttl--;
    if (f.ttl > 0) continue;
    s.foods.splice(s.foods.indexOf(f), 1);
    if (f.kind === 'poison') spawnFood(s, { kind: 'poison', ttl: POISON_MOVE }, rng, { awayFromHead: 4 });
    else events.push({ type: 'expire', kind: f.kind, idx: f.idx });
  }
}

// ---------- сохранение и статистика ----------

export function isValidState(s) {
  if (!s || typeof s !== 'object' || s.v !== 1) return false;
  if (!['classic', 'levels'].includes(s.mode) || !SPEEDS[s.speed]) return false;
  if (!Number.isInteger(s.cols) || !Number.isInteger(s.rows) || s.cols < 5 || s.rows < 5) return false;
  if (!Array.isArray(s.cells) || s.cells.length !== s.cols * s.rows) return false;
  const inRange = (i) => Number.isInteger(i) && i >= 0 && i < s.cols * s.rows;
  if (!Array.isArray(s.snake) || s.snake.length < 2 || !s.snake.every(inRange)) return false;
  if (!DIRS[s.dir] || !Array.isArray(s.queue) || !Array.isArray(s.foods)) return false;
  if (!s.foods.every((f) => f && inRange(f.idx))) return false;
  return Number.isInteger(s.score) && Number.isInteger(s.eaten) && Boolean(s.effects);
}

export const emptyStats = () => ({ games: 0, best: {}, bestLength: 0, apples: 0, levelsCleared: 0, bestLevel: 0 });

export function isValidStats(st) {
  return Boolean(st) && typeof st === 'object' && Number.isInteger(st.games) && st.best && typeof st.best === 'object'
    && Number.isInteger(st.apples) && Number.isInteger(st.levelsCleared) && Number.isInteger(st.bestLevel);
}

/** Ключ рекорда классики: скорость, поле и режимы — рекорды на разных условиях не смешиваются. */
export const bestKey = (s) => `${s.speed}:${s.size}:${s.modes.slice().sort().join('+') || 'classic'}`;

export function recordRun(stats, s) {
  const out = { ...stats, best: { ...stats.best }, games: stats.games + 1, apples: stats.apples + s.eaten };
  out.bestLength = Math.max(stats.bestLength, s.snake.length);
  if (s.mode === 'classic') {
    const key = bestKey(s);
    out.best[key] = Math.max(out.best[key] ?? 0, s.score);
  } else if (s.won) {
    out.levelsCleared++;
    out.bestLevel = Math.max(out.bestLevel, s.level);
  }
  return out;
}
