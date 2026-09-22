// Flappy Burger: бургер машет листом салата и пролетает в проёмы между препятствиями. Кухня: сверху вытяжки,
// снизу плиты. Время от времени — дверь «ВЫХОД» на ночную улицу (там препятствия — мусорные баки), потом дверь
// обратно на кухню. Без DOM, тестируется в Node. Физика по мотивам Flappy Bird (FlapPyBird): постоянная
// гравитация, взмах задаёт скорость вверх, скорость падения ограничена.
//
// Мир — в игровых пикселях: экран W×H, пол высотой GROUND. dist — сколько мир прокрутился; у препятствия x —
// мировая координата левого края, на экране — x − dist. Проём — [gapY − GAP/2, gapY + GAP/2].
//
// Проходимость: проём всегда GAP; центр соседнего проёма сдвигается не больше чем на MAX_UP вверх / MAX_DOWN вниз —
// с запасом меньше, чем бургер успевает подняться/опуститься за время между препятствиями (тест: бот пролетает
// сотни препятствий на разных зёрнах).

export const W = 160;
export const H = 256;
export const GROUND = 28;
export const PLAY_H = H - GROUND;          // низ игровой области — пол
export const BURGER_X = 42;                // левый край хитбокса бургера (он не двигается по x)
export const BURGER_W = 13;
export const BURGER_H = 10;
export const GRAVITY = 560;                // px/с²
export const FLAP = -165;                  // px/с — скорость сразу после взмаха
export const MAX_FALL = 230;
export const SPEED = 64;                   // px/с — скорость прокрутки
export const OB_W = 28;
export const SPACING = 92;                 // между левыми краями соседних препятствий
export const GAP = 64;
export const MAX_UP = 48;                  // насколько следующий проём может быть выше
export const MAX_DOWN = 64;                // и ниже
export const EDGE = 26;                    // проём не ближе к потолку/полу (до края проёма)
export const FIRST_X = W + 40;             // первое препятствие (мировая x)
export const SCENE_MIN = 6;                // препятствий в сцене
export const SCENE_MAX = 11;
export const STEP = 1 / 120;               // шаг физики

// ---------- форма препятствий (хитбоксы = то, что нарисовано) ----------

/**
 * Прямоугольники препятствия в координатах относительно его левого края x: { x, y, w, h }.
 * Кухня: сверху — воздуховод и колпак вытяжки, снизу — плита. Улица: баки стопкой снизу и перевёрнутые сверху.
 */
export function obstacleRects(ob) {
  const top = ob.gapY - GAP / 2;
  const bottom = ob.gapY + GAP / 2;
  if (ob.scene === 'kitchen') {
    return [
      { part: 'duct', x: 8, y: 0, w: 12, h: Math.max(0, top - 16) },
      { part: 'hood-top', x: 4, y: top - 16, w: 20, h: 6 },
      { part: 'hood', x: 0, y: top - 10, w: OB_W, h: 10 },
      { part: 'stove', x: 0, y: bottom, w: OB_W, h: PLAY_H - bottom },
    ];
  }
  // улица: баки высотой 18 (крышка 3 — во всю ширину, корпус 24 — уже)
  const rects = [];
  for (let y = bottom, k = 0; y < PLAY_H; y += 18, k++) {
    rects.push({ part: 'lid', x: 0, y, w: OB_W, h: 3, k });
    rects.push({ part: 'bin', x: 2, y: y + 3, w: OB_W - 4, h: Math.min(15, PLAY_H - y - 3), k });
  }
  for (let y = top, k = 0; y > 0; y -= 18, k++) {
    rects.push({ part: 'lid-down', x: 0, y: y - 3, w: OB_W, h: 3, k });
    rects.push({ part: 'bin-down', x: 2, y: Math.max(0, y - 18), w: OB_W - 4, h: Math.min(15, y - 3), k });
  }
  return rects.filter((r) => r.h > 0);
}

// ---------- мир ----------

function randInt(rng, a, b) {
  return a + Math.floor(rng() * (b - a + 1));
}

export function newGame(rng = Math.random) {
  const s = {
    y: PLAY_H * 0.42, vy: 0, dist: 0, idle: 0, t: 0, score: 0, phase: 'ready', flapT: -1,
    obstacles: [], gates: [], scene: 'kitchen', sceneLeft: randInt(rng, SCENE_MIN, SCENE_MAX),
    nextX: FIRST_X, lastGapY: PLAY_H / 2, visits: { kitchen: 1, street: 0 },
  };
  fillAhead(s, rng);
  return s;
}

/** Достроить препятствия (и двери между сценами) на экран вперёд. */
export function fillAhead(s, rng = Math.random) {
  while (s.nextX < s.dist + W + OB_W + 8) {
    if (s.sceneLeft <= 0) {
      // дверь: на её месте препятствия нет — воздух, за ней другая сцена
      const to = s.scene === 'kitchen' ? 'street' : 'kitchen';
      // x — левый косяк двери (граница сцен): в проёме уже видна новая сцена
      s.gates.push({ x: s.nextX + OB_W / 2 - 13, from: s.scene, to });
      s.scene = to;
      s.sceneLeft = randInt(rng, SCENE_MIN, SCENE_MAX);
      s.nextX += SPACING;
      continue;
    }
    const lo = Math.max(EDGE + GAP / 2, s.lastGapY - MAX_UP);
    const hi = Math.min(PLAY_H - EDGE - GAP / 2, s.lastGapY + MAX_DOWN);
    const gapY = Math.round(lo + rng() * (hi - lo));
    s.obstacles.push({ x: s.nextX, gapY, scene: s.scene, passed: false });
    s.lastGapY = gapY;
    s.sceneLeft -= 1;
    s.nextX += SPACING;
  }
  // ушедшее за левый край — выбросить
  s.obstacles = s.obstacles.filter((o) => o.x + OB_W > s.dist - 4);
  s.gates = s.gates.filter((g) => g.x > s.dist - W);
}

/** Сцена в мировой точке x (для фона): до первой двери правее — сцена «откуда», за ней — «куда». */
export function sceneAt(s, x) {
  let scene = null;
  for (const g of s.gates) {
    if (x < g.x) return scene ?? g.from;
    scene = g.to;
  }
  return scene ?? s.scene;
}

// ---------- ход игры ----------

export function flap(s) {
  if (s.phase === 'dead' || s.phase === 'over') return false;
  if (s.phase === 'ready') s.phase = 'play';
  s.vy = FLAP;
  s.flapT = s.t;
  return true;
}

function hits(s) {
  const bx = BURGER_X;
  const by = s.y;
  if (by + BURGER_H >= PLAY_H) return 'ground';
  for (const o of s.obstacles) {
    const sx = o.x - s.dist;
    if (sx > bx + BURGER_W || sx + OB_W < bx) continue;
    for (const r of obstacleRects(o)) {
      if (bx < sx + r.x + r.w && bx + BURGER_W > sx + r.x && by < r.y + r.h && by + BURGER_H > r.y) return 'obstacle';
    }
  }
  return null;
}

/**
 * Продвинуть игру на dt секунд (внутри — шаги STEP). Возвращает события: 'score', 'gate' (сцена сменилась под
 * бургером), 'hit' (удар), 'over' (упал на пол после удара).
 */
export function step(s, dt, rng = Math.random) {
  const events = [];
  let left = dt;
  while (left > 1e-9) {
    const h = Math.min(STEP, left);
    left -= h;
    s.t += h;
    if (s.phase === 'ready') {
      // ожидание старта: бургер покачивается, препятствия стоят (прокручивается только фон — s.idle)
      s.y = PLAY_H * 0.42 + Math.sin(s.t * 5) * 3;
      s.idle += SPEED * h;
      continue;
    }
    if (s.phase === 'over') break;
    s.vy = Math.min(MAX_FALL, s.vy + GRAVITY * h);
    s.y += s.vy * h;
    if (s.y < 0) {
      s.y = 0;
      s.vy = Math.max(0, s.vy);
    }
    if (s.phase === 'dead') {
      if (s.y + BURGER_H >= PLAY_H) {
        s.y = PLAY_H - BURGER_H;
        s.phase = 'over';
        events.push('over');
      }
      continue;
    }
    const before = sceneAt(s, s.dist + BURGER_X);
    s.dist += SPEED * h;
    fillAhead(s, rng);
    const now = sceneAt(s, s.dist + BURGER_X);
    if (now !== before) {
      s.visits[now] = (s.visits[now] ?? 0) + 1;
      events.push('gate');
    }
    for (const o of s.obstacles) {
      if (!o.passed && o.x - s.dist + OB_W < BURGER_X) {
        o.passed = true;
        s.score += 1;
        events.push('score');
      }
    }
    const hit = hits(s);
    if (hit) {
      s.phase = 'dead';
      s.vy = hit === 'ground' ? 0 : Math.min(s.vy, -60);     // от удара о препятствие чуть подскакивает
      events.push('hit');
      if (hit === 'ground') {
        s.y = PLAY_H - BURGER_H;
        s.phase = 'over';
        events.push('over');
      }
    }
  }
  return events;
}

/** Следующее препятствие перед бургером (для бота и подсказок). */
export function nextObstacle(s) {
  return s.obstacles.find((o) => o.x - s.dist + OB_W >= BURGER_X) ?? null;
}

// ---------- статистика ----------

export function emptyStats() {
  return { games: 0, best: 0, total: 0, streets: 0 };
}

export function recordGame(stats, s) {
  return {
    games: stats.games + 1,
    best: Math.max(stats.best, s.score),
    total: stats.total + s.score,
    streets: stats.streets + (s.visits.street ?? 0),
  };
}

export function isValidStats(s) {
  return Boolean(s) && Object.keys(emptyStats()).every((k) => Number.isInteger(s[k]) && s[k] >= 0);
}
