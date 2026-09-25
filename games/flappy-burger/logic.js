// Flappy Burger: бургер машет листом салата и пролетает в проёмы между препятствиями. Кухня ↔ ночная улица через
// стены с открытыми дверями. Без DOM, тестируется в Node. Физика по мотивам Flappy Bird (FlapPyBird): постоянная
// гравитация, взмах задаёт скорость вверх, скорость падения ограничена.
//
// Мир — в игровых пикселях: экран W×H, пол высотой GROUND. dist — сколько мир прокрутился; у препятствия x —
// мировая координата левого края, w — ширина, на экране — x − dist. Проём: центр gapY у левого края, высота gap;
// у диагонального (slope ≠ 0) центр проёма смещается на slope пикселей на каждый пиксель вправо («лесенкой» по 4 px).
//
// Разнообразие: у каждого вида своя случайная ширина, свободное место между препятствиями — FREE_MIN…FREE_MAX.
// Проходимость: сдвиг центра проёма относительно предыдущего (его правого края) ограничен MAX_UP/MAX_DOWN на
// каждые 64 px свободного места — меньше, чем бургер успевает подняться/опуститься (тест: автопилот пролетает
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
export const OB_W = 28;                    // обычная ширина (стена с дверью — всегда такая)
export const FREE_MIN = 56;                // свободного места между препятствиями
export const FREE_MAX = 88;
export const GAP = 64;
export const DIAG_GAP = 70;                // у диагонального проём чуть выше
export const MAX_UP = 48;                  // на 64 px свободного места следующий проём может быть выше на столько
export const MAX_DOWN = 64;                // и ниже на столько
export const EDGE = 26;                    // проём не ближе к потолку/полу (до края проёма)
export const FIRST_X = W + 40;             // первое препятствие (мировая x)
export const HOVER_Y = PLAY_H * 0.42;      // высота бургера до старта и в «планировании» (верх хитбокса)
export const SCENE_MIN = 6;                // препятствий в сцене
export const SCENE_MAX = 11;
export const STEP = 1 / 120;               // шаг физики
export const DOOR_H = 100;                 // дверной проём между сценами — от пола, выше обычного проёма
export const SLICE = 4;                    // ширина «ступеньки» диагонального препятствия
/** Виды препятствий по сценам (идут вперемешку, один вид дважды подряд не встречается) и их ширины. */
export const TYPES = {
  kitchen: ['hood', 'fridge', 'buns', 'chute'],     // вытяжка+плита, шкафчик+холодильник, лампа+булки, наклонный короб
  street: ['bins', 'tower', 'pole', 'stairs'],      // баки, щит+небоскрёб, светофор+фонарь, пожарная лестница
};
export const WIDTHS = {
  hood: [24, 28, 36], fridge: [28, 34], buns: [24, 28, 34], chute: [40, 48, 56],
  bins: [24, 28, 36], tower: [28, 36, 44], pole: [24, 28], stairs: [40, 48, 56],
  door: [OB_W],
};
export const DIAGONAL = new Set(['chute', 'stairs']);

// ---------- форма препятствий (хитбоксы = то, что нарисовано) ----------

/** Центр проёма препятствия в мировой точке x (у диагонального — со сдвигом по ступенькам). */
export function gapCenterAt(ob, worldX) {
  if (!ob.slope) return ob.gapY;
  const dx = Math.max(0, Math.min(ob.w - 1, worldX - ob.x));
  return ob.gapY + ob.slope * (Math.floor(dx / SLICE) * SLICE + SLICE / 2);
}

/** Центр проёма на выходе (у правого края). */
export const exitGapY = (ob) => gapCenterAt(ob, ob.x + ob.w - 1);

/**
 * Прямоугольники препятствия в координатах относительно его левого края x: { part, x, y, w, h } — хитбоксы
 * совпадают с нарисованным.
 */
export function obstacleRects(ob) {
  const w = ob.w ?? OB_W;
  const gap = ob.gap ?? GAP;
  const top = ob.gapY - gap / 2;
  const bottom = ob.gapY + gap / 2;
  const mid = w / 2;
  const floor = (rect) => ({ ...rect, h: PLAY_H - rect.y });
  let rects;
  switch (ob.type) {
    case 'door':
      rects = [{ part: 'wall', x: 0, y: 0, w, h: top }];              // стена до верха проёма, проём — до пола
      break;
    case 'chute':
    case 'stairs':
      // ступеньки по SLICE px: у каждой свой проём
      rects = [];
      for (let i = 0; i * SLICE < w; i++) {
        const c = gapCenterAt(ob, ob.x + i * SLICE);
        const t = Math.round(c - gap / 2);
        const b = Math.round(c + gap / 2);
        rects.push({ part: 'diag-top', x: i * SLICE, y: 0, w: SLICE, h: t, i });
        rects.push({ part: 'diag-bottom', x: i * SLICE, y: b, w: SLICE, h: PLAY_H - b, i });
      }
      break;
    case 'fridge':
      rects = [
        { part: 'rod', x: mid - 2, y: 0, w: 4, h: top - 20 },
        { part: 'cabinet', x: 0, y: top - 20, w, h: 20 },
        floor({ part: 'fridge', x: 1, y: bottom, w: w - 2 }),
      ];
      break;
    case 'buns':
      rects = [
        { part: 'rod', x: mid - 2, y: 0, w: 4, h: top - 10 },
        { part: 'lamp', x: 3, y: top - 10, w: w - 6, h: 10 },
        floor({ part: 'rack', x: 0, y: bottom, w }),
      ];
      break;
    case 'tower':
      rects = [
        { part: 'rope', x: 5, y: 0, w: 2, h: top - 22 },
        { part: 'rope', x: w - 7, y: 0, w: 2, h: top - 22 },
        { part: 'billboard', x: 0, y: top - 22, w, h: 22 },
        floor({ part: 'tower', x: 0, y: bottom, w }),
      ];
      break;
    case 'pole':
      rects = [
        { part: 'pole-top', x: mid - 3, y: 0, w: 6, h: top - 26 },
        { part: 'traffic', x: mid - 7, y: top - 26, w: 14, h: 26 },
        { part: 'lamp-head', x: 2, y: bottom, w: w - 4, h: 5 },
        floor({ part: 'pole', x: mid - 4, y: bottom + 5, w: 8 }),
      ];
      break;
    case 'bins': {
      // баки высотой 18 (крышка 3 — во всю ширину, корпус — уже): стопкой снизу и перевёрнутые сверху
      rects = [];
      for (let y = bottom, k = 0; y < PLAY_H; y += 18, k++) {
        rects.push({ part: 'lid', x: 0, y, w, h: 3, k });
        rects.push({ part: 'bin', x: 2, y: y + 3, w: w - 4, h: Math.min(15, PLAY_H - y - 3), k });
      }
      for (let y = top, k = 0; y > 0; y -= 18, k++) {
        rects.push({ part: 'lid-down', x: 0, y: y - 3, w, h: 3, k });
        rects.push({ part: 'bin-down', x: 2, y: Math.max(0, y - 18), w: w - 4, h: Math.min(15, y - 3), k });
      }
      break;
    }
    default:                                // 'hood': воздуховод и колпак вытяжки сверху, плита снизу
      rects = [
        { part: 'duct', x: mid - 6, y: 0, w: 12, h: top - 16 },
        { part: 'hood-top', x: 4, y: top - 16, w: w - 8, h: 6 },
        { part: 'hood', x: 0, y: top - 10, w, h: 10 },
        floor({ part: 'stove', x: 0, y: bottom, w }),
      ];
  }
  return rects.filter((r) => r.h > 0);
}

// ---------- мир ----------

function randInt(rng, a, b) {
  return a + Math.floor(rng() * (b - a + 1));
}

const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

export function newGame(rng = Math.random) {
  const s = {
    y: HOVER_Y, vy: 0, dist: 0, idle: 0, t: 0, score: 0, phase: 'ready', flapT: -1,
    obstacles: [], gates: [], scene: 'kitchen', sceneLeft: randInt(rng, SCENE_MIN, SCENE_MAX),
    nextX: FIRST_X, free: FREE_MAX, lastGapY: HOVER_Y + BURGER_H / 2, lastType: null, visits: { kitchen: 1, street: 0 },
    // первый проём — прямой и ровно на высоте, где бургер «планирует»: после заставки игрок не разобьётся,
    // пока не начал нажимать (замечание владельца: не умирать на переходе от лого к игре)
    alignFirst: true,
  };
  fillAhead(s, rng);
  return s;
}

/** Достроить препятствия (и стены с дверями между сценами) на экран вперёд. */
export function fillAhead(s, rng = Math.random) {
  while (s.nextX < s.dist + W + 64) {
    const x = s.nextX;
    if (s.sceneLeft <= 0) {
      // стена с дверью; граница сцен — её левый край (фон за проёмом — фасад здания)
      const to = s.scene === 'kitchen' ? 'street' : 'kitchen';
      s.obstacles.push({ x, w: OB_W, gapY: PLAY_H - DOOR_H / 2, gap: DOOR_H, slope: 0, scene: s.scene, to, type: 'door', passed: false });
      s.gates.push({ x, from: s.scene, to });
      s.scene = to;
      s.sceneLeft = randInt(rng, SCENE_MIN, SCENE_MAX);
      s.lastGapY = Math.min(PLAY_H - EDGE - GAP / 2, PLAY_H - DOOR_H / 2);
      s.lastType = null;
      s.lastSlope = 0;
      s.free = randInt(rng, FREE_MIN, FREE_MAX);
      s.nextX = x + OB_W + s.free;
      continue;
    }
    const type = pick(TYPES[s.scene].filter((t) => t !== s.lastType && !(s.alignFirst && DIAGONAL.has(t))), rng);
    const w = pick(WIDTHS[type], rng);
    const diag = DIAGONAL.has(type);
    const gap = diag ? DIAG_GAP : GAP;
    // вход проёма — в пределах досягаемости от выхода предыдущего (пропорционально свободному месту)
    const k = s.free / 64;
    const lo0 = Math.max(EDGE + gap / 2, s.lastGapY - MAX_UP * k);
    // после диагонали вверх бургер ещё летит вверх — резко нырнуть он не успевает: спуск меньше
    const downK = s.lastSlope < 0 ? 0.6 : 1;
    const hi0 = Math.min(PLAY_H - EDGE - gap / 2, s.lastGapY + MAX_DOWN * k * downK);
    let slope = 0;
    let lo = lo0;
    let hi = hi0;
    if (diag) {
      // наклон — туда, где выход проёма останется в границах
      const steps = Math.ceil(w / SLICE);
      const shiftPer = pick([0.35, 0.45], rng);
      const shift = (s2) => s2 * (steps - 0.5) * SLICE;
      const down = Math.min(hi, PLAY_H - EDGE - gap / 2 - shift(shiftPer));
      const up = Math.max(lo, EDGE + gap / 2 + shift(shiftPer));
      const canDown = down >= lo;
      const canUp = up <= hi;
      if (canDown && (!canUp || rng() < 0.5)) {
        slope = shiftPer;
        hi = down;
      } else if (canUp) {
        slope = -shiftPer;
        lo = up;
      }
    }
    // перед дверью выход проёма — не выше, чем позволяет спуститься под её притолоку (центр бургера ниже на 12 px)
    const needLow = PLAY_H - DOOR_H + 12 - MAX_DOWN * (FREE_MIN / 64);
    let gapY = s.alignFirst ? Math.round(Math.min(hi0, Math.max(lo0, s.lastGapY))) : Math.round(lo + rng() * (hi - lo));
    if (s.alignFirst) slope = 0;
    s.alignFirst = false;
    const ob = { x, w, gapY, gap, slope, scene: s.scene, type, passed: false };
    if (s.sceneLeft === 1 && exitGapY(ob) < needLow) {
      ob.slope = 0;
      ob.gapY = gapY = Math.round(Math.min(hi0, Math.max(lo0, needLow)));
      if (diag) {
        ob.type = TYPES[s.scene][0];
        ob.w = WIDTHS[ob.type][0];
        ob.gap = GAP;
      }
    }
    s.obstacles.push(ob);
    s.lastType = ob.type;
    s.lastGapY = exitGapY(ob);
    s.lastSlope = ob.slope;
    s.sceneLeft -= 1;
    s.free = randInt(rng, FREE_MIN, FREE_MAX);
    // перед дверью — самое большое свободное место: нырнуть под притолоку после взмаха. С минимальным
    // зазором бургер (и автопилот тестов — 3 зерна из 60) не успевал опуститься
    if (s.sceneLeft === 0) s.free = FREE_MAX;
    s.nextX = x + ob.w + s.free;
  }
  // ушедшее за левый край — выбросить
  // у стены с дверью фасад и створка — правее стены (ещё 34 px): не выбрасывать, пока не уйдут за экран
  s.obstacles = s.obstacles.filter((o) => o.x + o.w + (o.type === 'door' ? 40 : 0) > s.dist - 4);
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

/**
 * Старт после заставки: мир едет, а бургер «планирует» на высоте HOVER_Y без гравитации — до первого взмаха.
 * Первый проём как раз на этой высоте, так что переход от лого к игре безопасен.
 */
export function launch(s) {
  if (s.phase === 'ready') s.phase = 'glide';
}

export function flap(s) {
  if (s.phase === 'dead' || s.phase === 'over') return false;
  if (s.phase === 'ready' || s.phase === 'glide') s.phase = 'play';
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
    if (sx > bx + BURGER_W || sx + o.w < bx) continue;
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
      s.y = HOVER_Y + Math.sin(s.t * 5) * 3;
      s.idle += SPEED * h;
      continue;
    }
    if (s.phase === 'over') break;
    if (s.phase === 'glide') {
      // «планирование»: высота держится сама, мир едет
      s.y = HOVER_Y + Math.sin(s.t * 5) * 3;
      s.vy = 0;
    } else {
      s.vy = Math.min(MAX_FALL, s.vy + GRAVITY * h);
      s.y += s.vy * h;
    }
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
      if (!o.passed && o.x - s.dist + o.w < BURGER_X) {
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
  return s.obstacles.find((o) => o.x - s.dist + o.w >= BURGER_X) ?? null;
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
