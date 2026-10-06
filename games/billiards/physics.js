// Физика бильярда (пул) без DOM: стол, шары, удар кием, трение о сукно, столкновения, борта, лузы.
//
// Единицы — сантиметры, секунды, радианы. Стол «семифутовый»: игровое поле 99 × 198 см, шар 57,15 мм.
// Оси как на экране: x вправо, y вниз, z — на зрителя; ближний к игроку короткий борт — y = L.
//
// Шар — это скорость центра (vx, vy) и вращение (wx, wy, wz). От вращения зависит всё «бильярдное»:
//   • точка касания с сукном движется со скоростью u = v + ω × (0, 0, −R). Пока u ≠ 0, шар СКОЛЬЗИТ: трение
//     скольжения тормозит u и заодно меняет скорость центра — так работают накат (биток после удара катится
//     дальше), оттяжка (возвращается) и «стоп»; когда u = 0, шар КАТИТСЯ и теряет скорость на трении качения;
//   • боковое вращение wz на ход по сукну не влияет, но меняет отскок от борта (борт трёт шар вдоль себя);
//   • шары между собой упруго и без трения: прицельный шар уходит строго по линии центров.
//
// Шаг моделирования: внутри шага ищется самое раннее касание (шар — шар, шар — борт, шар — губка лузы) по точной
// формуле для прямолинейного движения, все шары доводятся до этого момента, касание разрешается — и дальше до конца
// шага. Поэтому быстрый шар не «проскакивает» и не «влипает», а результат один и тот же на любом устройстве:
// тот же удар из той же расстановки всегда даёт то же самое (на этом держатся сохранение и расчёты бота).

export const W = 99;
export const L = 198;
export const R = 2.8575;
export const D = 2 * R;

const G = 980;
const MU_SLIDE = 0.2;                 // трение скольжения шара о сукно
const MU_ROLL = 0.013;                // трение качения
const MU_SPIN = 0.022;                // затухание бокового вращения
const E_BALL = 0.95;                  // упругость удара шар — шар
const E_CUSHION_SLOW = 0.86;          // упругость борта на тихом ходу…
const E_CUSHION_FAST = 0.68;          // …и на сильном ударе (резина «съедает» больше)
const CUSHION_ROLL = 0.6;             // какую долю качения «от борта» шар получает сразу при отскоке
const MU_CUSHION = 0.14;              // трение шара о борт
const V_STOP = 0.6;                   // см/с — медленнее шар считается остановившимся
const SLOW_V = 25;                    // см/с — ниже этой скорости качение тормозится сильнее
const SLIDE_A = MU_SLIDE * G;
const ROLL_A = MU_ROLL * G;
const SPIN_A = (5 * MU_SPIN * G) / (2 * R);

export const STEP = 1 / 300;
export const V_MIN = 25;
export const V_MAX = 780;             // см/с — самый сильный удар (разбой)
export const MAX_OFFSET = 0.5;        // доля радиуса: дальше от центра кий «срывается» (кикс)

/** Скорость битка по силе удара 0…1: внизу шкала растянута — тихие удары точнее. */
export const powerToSpeed = (p) => V_MIN + (V_MAX - V_MIN) * Math.max(0, Math.min(1, p)) ** 1.4;

export const HEAD_Y = L * 0.75;       // линия «дома»: с руки при разбое биток ставится не выше неё
export const HEAD_SPOT = [W / 2, HEAD_Y];
export const FOOT_SPOT = [W / 2, L * 0.25];

// ---------- стол: борта и лузы ----------

const CORNER_CUT = 8.6;               // от угла до губки угловой лузы вдоль борта (створ ≈ 12,2 см)
const SIDE_CUT = 6.6;                 // от середины длинного борта до губки средней лузы (створ 13,2 см)
const CORNER_JAW = (38 * Math.PI) / 180;   // скос губки угловой лузы от линии борта
const SIDE_JAW = (76 * Math.PI) / 180;     // скос губки средней лузы
const CORNER_DEPTH = 6;
const SIDE_DEPTH = 4;

/** Лузы: круг, над которым шар падает (центр шара внутри круга). 0–3 — угловые, 4–5 — средние. */
export const POCKETS = [
  { x: -0.5, y: -0.5, r: 6.3, corner: true },
  { x: W + 0.5, y: -0.5, r: 6.3, corner: true },
  { x: -0.5, y: L + 0.5, r: 6.3, corner: true },
  { x: W + 0.5, y: L + 0.5, r: 6.3, corner: true },
  { x: -2.4, y: L / 2, r: 5.2, corner: false },
  { x: W + 2.4, y: L / 2, r: 5.2, corner: false },
];

/** Точка, в которую целят прицельный шар, чтобы он упал в лузу. */
export const POCKET_AIM = [
  [2.6, 2.6], [W - 2.6, 2.6], [2.6, L - 2.6], [W - 2.6, L - 2.6], [-0.4, L / 2], [W + 0.4, L / 2],
];

function segment(ax, ay, bx, by, nx, ny) {
  const len = Math.hypot(bx - ax, by - ay);
  return { ax, ay, bx, by, sx: (bx - ax) / len, sy: (by - ay) / len, len, nx, ny };
}

/** Резина бортов: шесть отрезков между лузами и по две губки у каждой лузы. Нормаль смотрит на сукно. */
function buildCushions() {
  const rails = [
    segment(CORNER_CUT, 0, W - CORNER_CUT, 0, 0, 1),
    segment(CORNER_CUT, L, W - CORNER_CUT, L, 0, -1),
    segment(0, CORNER_CUT, 0, L / 2 - SIDE_CUT, 1, 0),
    segment(0, L / 2 + SIDE_CUT, 0, L - CORNER_CUT, 1, 0),
    segment(W, CORNER_CUT, W, L / 2 - SIDE_CUT, -1, 0),
    segment(W, L / 2 + SIDE_CUT, W, L - CORNER_CUT, -1, 0),
  ];
  const jaws = [];
  const tips = [];
  for (const rail of rails) {
    for (const end of [0, 1]) {
      const ex = end ? rail.bx : rail.ax;
      const ey = end ? rail.by : rail.ay;
      // вдоль борта к лузе и наружу от сукна
      const rx = end ? rail.sx : -rail.sx;
      const ry = end ? rail.sy : -rail.sy;
      const side = Math.abs(ey - L / 2) < SIDE_CUT + 1;
      const angle = side ? SIDE_JAW : CORNER_JAW;
      const depth = side ? SIDE_DEPTH : CORNER_DEPTH;
      const fx = Math.cos(angle) * rx - Math.sin(angle) * rail.nx;
      const fy = Math.cos(angle) * ry - Math.sin(angle) * rail.ny;
      // нормаль губки — в канал лузы: та из двух, что смотрит вдоль борта к лузе
      let nx = -fy;
      let ny = fx;
      if (nx * rx + ny * ry < 0) {
        nx = -nx;
        ny = -ny;
      }
      jaws.push(segment(ex, ey, ex + fx * depth, ey + fy * depth, nx, ny));
      tips.push([ex, ey]);
    }
  }
  return { rails, jaws, tips };
}

const CUSHIONS = buildCushions();
export const RAILS = CUSHIONS.rails;
export const JAWS = CUSHIONS.jaws;
export const TIPS = CUSHIONS.tips;
const SEGMENTS = [...RAILS, ...JAWS];

// ---------- расстановка ----------

/**
 * Пирамида «восьмёрки»: вершина на дальней отметке, восьмёрка в середине третьего ряда, в задних углах —
 * сплошной и полосатый, остальные как попало. Между шарами волосок зазора — разбой каждый раз немного другой.
 * → 16 мест [x, y]: номер места — номер шара (0 — биток).
 */
export function rack(rng = Math.random) {
  const gap = 0.02;
  const spots = [];
  for (let row = 0; row < 5; row++) {
    for (let k = 0; k <= row; k++) {
      spots.push([
        FOOT_SPOT[0] + (k - row / 2) * (D + gap) + (rng() - 0.5) * 0.01,
        FOOT_SPOT[1] - row * (Math.sqrt(3) * R + gap) + (rng() - 0.5) * 0.01,
      ]);
    }
  }
  const shuffle = (list) => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  };
  const solids = shuffle([1, 2, 3, 4, 5, 6, 7]);
  const stripes = shuffle([9, 10, 11, 12, 13, 14, 15]);
  const order = new Array(15);
  order[4] = 8;
  const flip = rng() < 0.5;
  order[10] = flip ? solids.pop() : stripes.pop();
  order[14] = flip ? stripes.pop() : solids.pop();
  const rest = shuffle([...solids, ...stripes]);
  for (let k = 0; k < 15; k++) if (order[k] === undefined) order[k] = rest.pop();
  const balls = new Array(16);
  balls[0] = [...HEAD_SPOT];
  order.forEach((id, k) => { balls[id] = spots[k]; });
  return balls;
}

// ---------- моделирование ----------

/**
 * Состояние стола для расчёта: balls — 16 мест [x, y] или null (шар в лузе).
 * record — собирать ли события для звука (ботам при переборе не нужно).
 */
export function createSim(balls, { record = true } = {}) {
  const n = balls.length;
  const sim = {
    n,
    x: new Float64Array(n), y: new Float64Array(n),
    vx: new Float64Array(n), vy: new Float64Array(n),
    wx: new Float64Array(n), wy: new Float64Array(n), wz: new Float64Array(n),
    on: new Uint8Array(n),
    t: 0,
    moving: false,
    firstHit: -1,                  // первый шар, которого коснулся биток
    potted: [],                    // [{ id, pocket, t }] по порядку
    cushions: 0,                   // касаний бортов после первого соударения (любым шаром)
    events: record ? [] : null,    // [{ t, type: 'ball' | 'cushion' | 'pocket', id, speed, pocket }]
  };
  for (let i = 0; i < n; i++) {
    if (!balls[i]) continue;
    sim.on[i] = 1;
    sim.x[i] = balls[i][0];
    sim.y[i] = balls[i][1];
  }
  return sim;
}

/**
 * Удар кием по битку: angle — направление, power — 0…1, spin = [вправо, вверх] в долях −1…1 (точка удара на
 * шаре: вверх — накат, вниз — оттяжка, вбок — боковое вращение).
 */
export function strike(sim, { angle, power, spin = [0, 0] }) {
  const v = powerToSpeed(power);
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let a = spin[0] || 0;
  let b = spin[1] || 0;
  const m = Math.hypot(a, b);
  if (m > 1) {
    a /= m;
    b /= m;
  }
  a *= MAX_OFFSET;
  b *= MAX_OFFSET;
  const k = (5 * v) / (2 * R);
  sim.vx[0] = v * dx;
  sim.vy[0] = v * dy;
  // ω = (5v / 2R) · (b · «вправо» − a · z): b = 0,4 — шар сразу катится без проскальзывания
  sim.wx[0] = k * b * -dy;
  sim.wy[0] = k * b * dx;
  sim.wz[0] = -k * a;
  sim.moving = true;
}

function note(sim, type, id, speed, pocket = -1) {
  if (sim.events) sim.events.push({ t: sim.t, type, id, speed, pocket });
}

/** Сдвинуть шары на dt с прежними скоростями и применить трение о сукно за это время. */
function advance(sim, dt) {
  if (dt <= 0) return;
  const { x, y, vx, vy, wx, wy, wz, on, n } = sim;
  for (let i = 0; i < n; i++) {
    if (!on[i]) continue;
    x[i] += vx[i] * dt;
    y[i] += vy[i] * dt;
    // проскальзывание точки касания
    let ux = vx[i] - R * wy[i];
    let uy = vy[i] + R * wx[i];
    let u = Math.hypot(ux, uy);
    let left = dt;
    if (u > 1e-6) {
      const slide = u / (3.5 * SLIDE_A);          // столько ещё скользить
      const part = Math.min(left, slide);
      ux /= u;
      uy /= u;
      vx[i] -= SLIDE_A * ux * part;
      vy[i] -= SLIDE_A * uy * part;
      wx[i] -= ((2.5 * SLIDE_A) / R) * uy * part;
      wy[i] += ((2.5 * SLIDE_A) / R) * ux * part;
      left -= part;
      if (part >= slide) {
        // скольжение кончилось: вращение — ровно под качение
        wx[i] = -vy[i] / R;
        wy[i] = vx[i] / R;
      }
    }
    if (left > 0) {
      const v = Math.hypot(vx[i], vy[i]);
      if (v > 0) {
        // на самом тихом ходу шар тормозит сильнее — иначе последние сантиметры он полз бы секундами
        const drag = ROLL_A * (1 + 1.5 * Math.max(0, 1 - v / SLOW_V));
        const k = Math.max(0, v - drag * left) / v;
        vx[i] *= k;
        vy[i] *= k;
        wx[i] = -vy[i] / R;
        wy[i] = vx[i] / R;
      }
    }
    if (wz[i] !== 0) {
      const s = Math.abs(wz[i]) - SPIN_A * dt;
      wz[i] = s > 0 ? Math.sign(wz[i]) * s : 0;
    }
  }
}

const TOUCH = 0.05;                    // см — шары ближе этого считаются касающимися одновременно

/** Шары, в которые шар i упирается прямо сейчас (вплотную и сближаясь): [{ k, nx, ny, u }]. */
function contacts(sim, i) {
  const { x, y, vx, vy, on, n } = sim;
  const list = [];
  for (let k = 0; k < n; k++) {
    if (k === i || !on[k]) continue;
    const dx = x[k] - x[i];
    const dy = y[k] - y[i];
    const d2 = dx * dx + dy * dy;
    if (d2 > (D + TOUCH) * (D + TOUCH)) continue;
    const d = Math.sqrt(d2) || 1;
    const nx = dx / d;
    const ny = dy / d;
    const u = (vx[i] - vx[k]) * nx + (vy[i] - vy[k]) * ny;
    if (u > 1e-9) list.push({ k, nx, ny, u });
  }
  return list;
}

/**
 * Соударение шаров i и j. Обычно это двое, но в пирамиде шар упирается сразу в двух-трёх соседей — тогда удар
 * делится между ними одновременно (решается маленькая система: после удара каждая пара расходится со скоростью
 * e × скорость сближения). Если раздавать по очереди, вся сила уходит по одной цепочке, как в «колыбели Ньютона»,
 * и пирамида почти не разлетается.
 */
function hitBalls(sim, i, j) {
  const { vx, vy } = sim;
  const si = contacts(sim, i);
  const sj = contacts(sim, j);
  if (!si.length && !sj.length) return;
  const centre = sj.length > si.length ? j : i;
  const set = centre === i ? si : sj;
  const m = set.length;
  const p = new Array(m).fill(0);
  if (m === 1) {
    p[0] = ((1 + E_BALL) / 2) * set[0].u;
  } else {
    for (let iter = 0; iter < 30; iter++) {
      for (let a = 0; a < m; a++) {
        let sum = 0;
        for (let b = 0; b < m; b++) sum += p[b] * (set[a].nx * set[b].nx + set[a].ny * set[b].ny);
        p[a] = Math.max(0, p[a] + ((1 + E_BALL) * set[a].u - sum - p[a]) / 2);
      }
    }
  }
  for (let a = 0; a < m; a++) {
    if (p[a] <= 0) continue;
    const c = set[a];
    vx[centre] -= p[a] * c.nx;
    vy[centre] -= p[a] * c.ny;
    vx[c.k] += p[a] * c.nx;
    vy[c.k] += p[a] * c.ny;
    note(sim, 'ball', c.k, c.u);
  }
  if (sim.firstHit < 0 && (i === 0 || j === 0)) sim.firstHit = i === 0 ? j : i;
}

/** Отскок от резины с нормалью (nx, ny): упругость падает с силой удара, трение закручивает и уводит шар. */
function hitCushion(sim, i, nx, ny) {
  const { vx, vy, wz } = sim;
  const vn = vx[i] * nx + vy[i] * ny;
  if (vn >= 0) return;
  const hard = Math.min(1, -vn / 500);
  const e = E_CUSHION_SLOW + (E_CUSHION_FAST - E_CUSHION_SLOW) * hard;
  const tx = -ny;
  const ty = nx;
  const vt = vx[i] * tx + vy[i] * ty;
  const slip = vt - R * wz[i];
  const limit = MU_CUSHION * (1 + e) * -vn;
  const jt = Math.max(-limit, Math.min(limit, -slip / 3.5));
  const vnNew = -e * vn;
  const vtNew = vt + jt;
  vx[i] = vnNew * nx + vtNew * tx;
  vy[i] = vnNew * ny + vtNew * ty;
  wz[i] -= (2.5 * jt) / R;
  // Резина выше центра шара: прежнее качение «в борт» она гасит и частью переворачивает под новое направление.
  // Без этого шар после каждого борта долго скользил бы против собственного вращения и терял больше половины хода.
  const wn = sim.wx[i] * nx + sim.wy[i] * ny;
  const wt = (CUSHION_ROLL * vnNew) / R;
  sim.wx[i] = wt * tx + wn * nx;
  sim.wy[i] = wt * ty + wn * ny;
  if (sim.firstHit >= 0) sim.cushions += 1;
  note(sim, 'cushion', i, -vn);
}

/** Шаг моделирования на h секунд. */
export function step(sim, h = STEP) {
  const { x, y, vx, vy, on, n } = sim;
  let left = h;
  for (let guard = 0; guard < 48 && left > 1e-10; guard++) {
    let best = left;
    let kind = 0;                 // 1 — шар о шар, 2 — шар о борт
    let bi = -1;
    let bj = -1;
    let bnx = 0;
    let bny = 0;

    for (let i = 0; i < n; i++) {
      if (!on[i]) continue;
      const iMoves = vx[i] !== 0 || vy[i] !== 0;
      for (let j = i + 1; j < n; j++) {
        if (!on[j]) continue;
        if (!iMoves && vx[j] === 0 && vy[j] === 0) continue;
        const dx = x[j] - x[i];
        const dy = y[j] - y[i];
        const dvx = vx[j] - vx[i];
        const dvy = vy[j] - vy[i];
        const b = dx * dvx + dy * dvy;
        if (b >= 0) continue;                       // расходятся
        const c = dx * dx + dy * dy - D * D;
        let t;
        if (c <= 0) {
          t = 0;
        } else {
          const a = dvx * dvx + dvy * dvy;
          const disc = b * b - a * c;
          if (disc < 0) continue;
          t = (-b - Math.sqrt(disc)) / a;
        }
        if (t < best) {
          best = t;
          kind = 1;
          bi = i;
          bj = j;
        }
      }
      if (!iMoves) continue;
      // до резины не достанет — не проверяем
      const fx = x[i] + vx[i] * best;
      const fy = y[i] + vy[i] * best;
      if (Math.min(x[i], fx) > R + 0.01 && Math.max(x[i], fx) < W - R - 0.01
        && Math.min(y[i], fy) > R + 0.01 && Math.max(y[i], fy) < L - R - 0.01) continue;
      for (let k = 0; k < SEGMENTS.length; k++) {
        const s = SEGMENTS[k];
        const vn = vx[i] * s.nx + vy[i] * s.ny;
        if (vn >= 0) continue;
        const dist = (x[i] - s.ax) * s.nx + (y[i] - s.ay) * s.ny;
        if (dist < -R * 0.5) continue;              // шар за этой линией — она не про него
        const t = dist <= R ? 0 : (dist - R) / -vn;
        if (t >= best) continue;
        const q = (x[i] + vx[i] * t - s.ax) * s.sx + (y[i] + vy[i] * t - s.ay) * s.sy;
        if (q < 0 || q > s.len) continue;
        best = t;
        kind = 2;
        bi = i;
        bnx = s.nx;
        bny = s.ny;
      }
      for (let k = 0; k < TIPS.length; k++) {
        const dx = x[i] - TIPS[k][0];
        const dy = y[i] - TIPS[k][1];
        const b = dx * vx[i] + dy * vy[i];
        if (b >= 0) continue;
        const c = dx * dx + dy * dy - R * R;
        let t;
        if (c <= 0) {
          t = 0;
        } else {
          const a = vx[i] * vx[i] + vy[i] * vy[i];
          const disc = b * b - a * c;
          if (disc < 0) continue;
          t = (-b - Math.sqrt(disc)) / a;
        }
        if (t >= best) continue;
        const hx = x[i] + vx[i] * t - TIPS[k][0];
        const hy = y[i] + vy[i] * t - TIPS[k][1];
        const d = Math.hypot(hx, hy) || 1;
        best = t;
        kind = 2;
        bi = i;
        bnx = hx / d;
        bny = hy / d;
      }
    }

    advance(sim, best);
    left -= best;
    if (kind === 1) hitBalls(sim, bi, bj);
    else if (kind === 2) hitCushion(sim, bi, bnx, bny);
    else break;
  }
  sim.t += h;

  // лузы и остановка
  let moving = false;
  for (let i = 0; i < n; i++) {
    if (!on[i]) continue;
    let pocket = -1;
    for (let k = 0; k < POCKETS.length; k++) {
      const p = POCKETS[k];
      const dx = x[i] - p.x;
      const dy = y[i] - p.y;
      if (dx * dx + dy * dy < p.r * p.r) pocket = k;
    }
    // страховка: шар за пределами сукна — в ближайшую лузу
    if (pocket < 0 && (x[i] < -R || x[i] > W + R || y[i] < -R || y[i] > L + R)) pocket = nearestPocket(x[i], y[i]);
    if (pocket >= 0) {
      const speed = Math.hypot(vx[i], vy[i]);
      on[i] = 0;
      vx[i] = 0;
      vy[i] = 0;
      sim.wx[i] = 0;
      sim.wy[i] = 0;
      sim.wz[i] = 0;
      sim.potted.push({ id: i, pocket, t: sim.t });
      note(sim, 'pocket', i, speed, pocket);
      continue;
    }
    const v = Math.hypot(vx[i], vy[i]);
    const slip = Math.hypot(vx[i] - R * sim.wy[i], vy[i] + R * sim.wx[i]);
    if (v < V_STOP && slip < V_STOP) {
      vx[i] = 0;
      vy[i] = 0;
      sim.wx[i] = 0;
      sim.wy[i] = 0;
    } else {
      moving = true;
    }
  }
  sim.moving = moving;
  return moving;
}

export function nearestPocket(px, py) {
  let best = 0;
  let bestD = Infinity;
  POCKETS.forEach((p, k) => {
    const d = (p.x - px) ** 2 + (p.y - py) ** 2;
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  });
  return best;
}

/** Довести до остановки всех шаров (не дольше maxTime секунд игрового времени). → sim */
export function run(sim, maxTime = 60) {
  while (sim.moving && sim.t < maxTime) step(sim);
  if (sim.moving) {
    sim.vx.fill(0);
    sim.vy.fill(0);
    sim.moving = false;
  }
  sim.wx.fill(0);
  sim.wy.fill(0);
  sim.wz.fill(0);
  return sim;
}

/** Места шаров после расчёта: [x, y] с точностью до микрона или null — как в сохранении. */
export function positions(sim) {
  const out = new Array(sim.n);
  for (let i = 0; i < sim.n; i++) out[i] = sim.on[i] ? [Math.round(sim.x[i] * 1e4) / 1e4, Math.round(sim.y[i] * 1e4) / 1e4] : null;
  return out;
}

// ---------- прицел ----------

/**
 * Куда придёт биток из (px, py) по направлению angle, если ничего не двигать: первое касание шара, борта или
 * падение в лузу. → { type: 'ball' | 'cushion' | 'pocket' | 'none', dist, x, y (центр битка в момент касания),
 * ball (номер шара), nx, ny (линия центров — туда уйдёт прицельный шар), cut (косинус угла резки) }.
 */
export function aimRay(balls, px, py, angle, skip = 0) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let best = Infinity;
  let hit = { type: 'none', dist: 0, x: px, y: py, ball: -1, nx: 0, ny: 0, cut: 0 };
  for (let j = 0; j < balls.length; j++) {
    if (j === skip || !balls[j]) continue;
    const rx = balls[j][0] - px;
    const ry = balls[j][1] - py;
    const along = rx * dx + ry * dy;
    if (along <= 0) continue;
    const perp2 = rx * rx + ry * ry - along * along;
    if (perp2 >= D * D) continue;
    const t = along - Math.sqrt(D * D - perp2);
    if (t < best && t >= -1e-6) {
      best = t;
      const gx = px + dx * t;
      const gy = py + dy * t;
      const nx = (balls[j][0] - gx) / D;
      const ny = (balls[j][1] - gy) / D;
      hit = { type: 'ball', dist: t, x: gx, y: gy, ball: j, nx, ny, cut: dx * nx + dy * ny };
    }
  }
  for (const s of SEGMENTS) {
    const vn = dx * s.nx + dy * s.ny;
    if (vn >= 0) continue;
    const dist = (px - s.ax) * s.nx + (py - s.ay) * s.ny;
    if (dist < R) continue;
    const t = (dist - R) / -vn;
    if (t >= best) continue;
    const q = (px + dx * t - s.ax) * s.sx + (py + dy * t - s.ay) * s.sy;
    if (q < 0 || q > s.len) continue;
    best = t;
    hit = { type: 'cushion', dist: t, x: px + dx * t, y: py + dy * t, ball: -1, nx: s.nx, ny: s.ny, cut: 0 };
  }
  for (const tip of TIPS) {
    const rx = px - tip[0];
    const ry = py - tip[1];
    const b = rx * dx + ry * dy;
    if (b >= 0) continue;
    const c = rx * rx + ry * ry - R * R;
    const disc = b * b - c;
    if (c <= 0 || disc < 0) continue;
    const t = -b - Math.sqrt(disc);
    if (t >= best) continue;
    best = t;
    const hx = px + dx * t - tip[0];
    const hy = py + dy * t - tip[1];
    hit = { type: 'cushion', dist: t, x: px + dx * t, y: py + dy * t, ball: -1, nx: hx / R, ny: hy / R, cut: 0 };
  }
  POCKETS.forEach((p, k) => {
    const rx = px - p.x;
    const ry = py - p.y;
    const b = rx * dx + ry * dy;
    const c = rx * rx + ry * ry - p.r * p.r;
    const disc = b * b - c;
    if (b >= 0 || c <= 0 || disc < 0) return;
    const t = -b - Math.sqrt(disc);
    if (t >= best) return;
    best = t;
    hit = { type: 'pocket', dist: t, x: px + dx * t, y: py + dy * t, ball: -1, nx: 0, ny: 0, cut: 0, pocket: k };
  });
  return hit;
}

/** Свободна ли полоса шириной в шар от (ax, ay) до (bx, by): ни один шар, кроме skip, её не задевает. */
export function laneClear(balls, ax, ay, bx, by, skip = []) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return true;
  const ux = dx / len;
  const uy = dy / len;
  for (let j = 0; j < balls.length; j++) {
    if (!balls[j] || skip.includes(j)) continue;
    const rx = balls[j][0] - ax;
    const ry = balls[j][1] - ay;
    const along = Math.max(0, Math.min(len, rx * ux + ry * uy));
    const ex = rx - ux * along;
    const ey = ry - uy * along;
    if (ex * ex + ey * ey < D * D - 1e-6) return false;
  }
  return true;
}

/** Можно ли поставить шар с центром в (px, py): на сукне, не в створе лузы, не вплотную к другим шарам. */
export function spotFree(balls, px, py, skip = 0) {
  if (px < R || px > W - R || py < R || py > L - R) return false;
  for (const p of POCKETS) if ((px - p.x) ** 2 + (py - p.y) ** 2 < (p.r + R) ** 2) return false;
  for (let j = 0; j < balls.length; j++) {
    if (j === skip || !balls[j]) continue;
    if ((balls[j][0] - px) ** 2 + (balls[j][1] - py) ** 2 < (D + 0.05) ** 2) return false;
  }
  return true;
}

/** Ближайшее к (px, py) свободное место — поиск кругами (для возврата восьмёрки и битка на стол). */
export function nearestFree(balls, px, py, skip = -1, allow = () => true) {
  if (spotFree(balls, px, py, skip) && allow(px, py)) return [px, py];
  for (let ring = 1; ring < 200; ring++) {
    const rad = ring * 0.8;
    const count = Math.max(8, Math.round((2 * Math.PI * rad) / 1.2));
    for (let k = 0; k < count; k++) {
      const a = -Math.PI / 2 + (2 * Math.PI * k) / count;
      const qx = px + Math.cos(a) * rad;
      const qy = py + Math.sin(a) * rad;
      if (spotFree(balls, qx, qy, skip) && allow(qx, qy)) return [Math.round(qx * 1e4) / 1e4, Math.round(qy * 1e4) / 1e4];
    }
  }
  return [px, py];
}
