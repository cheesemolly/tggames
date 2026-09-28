// Физика пинбола: вид сверху, шарик — круг, стол наклонён (гравитация вниз по экрану).
// Без библиотек, без DOM — только числа (проверяется тестами).
//
// Препятствия (colliders):
//   seg     — отрезок a→b (стенка, резинка, мишень); oneway — отталкивает только с одной стороны (слева по ходу a→b);
//   circle  — круг (стойка, бампер);
//   flipper — флиппер: капсула, вращается вокруг pivot; скорость точки касания передаётся шарику;
//   sensor  — область без удара (дорожка, датчик): событие при входе шарика.
// У препятствия: restitution (упругость), friction, kick (толчок активных элементов: бампер, рогатка — добавка скорости
// по нормали; kickAlways — от любого касания, как у поп-бампера: иначе шарик мог бы застыть в ложбинке между ними),
// enabled (выключенные — упавшие мишени), layer (слой: шарик на рампе не видит стол и наоборот).
//
// Шаг: фиксированный подшаг (SUB) — при скорости до MAX_SPEED шарик за подшаг сдвигается меньше своего радиуса,
// поэтому тонкие стенки не «пробиваются»; столкновения разбираются в несколько проходов (углы).

export const SUB = 1 / 480;          // подшаг, с
export const MAX_SPEED = 4200;       // ед/с — быстрее шарик не летит (иначе пробивал бы стенки и глаз не успевал)
const PASSES = 3;

const len = (x, y) => Math.hypot(x, y);

/** Ближайшая точка отрезка ab к точке p и параметр t ∈ [0,1]. */
export function closestOnSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return { x: ax + dx * t, y: ay + dy * t, t };
}

/** Дуга из отрезков: центр, радиус, углы (рад, по часовой в экранных координатах), число кусков. */
export function arcPoints(cx, cy, r, from, to, pieces = 12) {
  const pts = [];
  for (let k = 0; k <= pieces; k++) {
    const a = from + ((to - from) * k) / pieces;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

/** Ломаная → отрезки с общими свойствами. */
export function polyline(points, props = {}) {
  const out = [];
  for (let k = 1; k < points.length; k++) {
    out.push({ type: 'seg', a: points[k - 1], b: points[k], ...props });
  }
  return out;
}

/** Флиппер: pivot, длина, радиусы у оси и на конце, угол покоя и поднятый, сторона (1 — левый, −1 — правый). */
export function makeFlipper({ id, x, y, length, r0, r1, rest, up, speed = 26, restitution = 0.55 }) {
  return {
    id, type: 'flipper', x, y, length, r0, r1, rest, up, angle: rest, omega: 0, pressed: false,
    speed, restitution, friction: 0.2, falloff: 0.15, enabled: true, layer: 0,
  };
}

/** Конец флиппера при текущем угле. */
export const flipperTip = (f) => [f.x + Math.cos(f.angle) * f.length, f.y + Math.sin(f.angle) * f.length];

function moveFlipper(f, dt) {
  const target = f.pressed ? f.up : f.rest;
  const diff = target - f.angle;
  const speed = f.pressed ? f.speed : (f.downSpeed ?? f.speed);     // вниз — медленнее (в оригинале вдвое)
  const maxStep = speed * dt;
  if (Math.abs(diff) <= maxStep) {
    f.omega = diff / dt;
    f.angle = target;
  } else {
    f.omega = Math.sign(diff) * speed;
    f.angle += f.omega * dt;
  }
  if (f.angle === target) f.omega = 0;
}

const REST_SPEED = 60;         // медленнее — касание без отскока (иначе шарик дрожит в покое)
const KICK_THRESHOLD = 120;    // толчок бампера и рогатки — только от настоящего удара (как в оригинале: threshold/boost)

/**
 * Удар шарика о поверхность: нормаль n (от поверхности к шарику), скорость поверхности в точке касания (sx, sy).
 * Упругость падает со скоростью удара (резина пружинит на медленном ударе и гасит быстрый — как в Visual Pinball):
 * e = e0 / (1 + falloff · |vn| / 1000). Трение — ограниченный импульс (не больше μ от нормального).
 * kick — толчок активного элемента по нормали. → скорость удара (для звука и очков) или 0, если шарик уже отлетал.
 */
function bounce(ball, nx, ny, e0, friction, kick = 0, sx = 0, sy = 0, falloff = 0, always = false) {
  const rvx = ball.vx - sx;
  const rvy = ball.vy - sy;
  const vn = rvx * nx + rvy * ny;
  if (vn >= 0) return 0;
  const speed = -vn;
  const e = speed < REST_SPEED ? 0 : e0 / (1 + (falloff * speed) / 1000);
  const jn = (1 + e) * speed;
  let tx = rvx - vn * nx;
  let ty = rvy - vn * ny;
  const vt = Math.hypot(tx, ty);
  if (vt > 0) {
    const cut = Math.min(vt, friction * jn) / vt;
    tx *= 1 - cut;
    ty *= 1 - cut;
  }
  let nvx = tx + e * speed * nx;
  let nvy = ty + e * speed * ny;
  if (kick && (always || speed > KICK_THRESHOLD)) {
    nvx += nx * kick;
    nvy += ny * kick;
  }
  ball.vx = nvx + sx;
  ball.vy = nvy + sy;
  return speed;
}

/** Мир: шарики, препятствия, гравитация. */
export function createWorld({ gravity = 1900, colliders = [] } = {}) {
  const world = {
    gravity,
    colliders,
    balls: [],
    /** Сделать шаг dt (с): подшаги, события [{ type: 'hit'|'enter'|'leave', id, ball, speed }]. */
    step(dt) {
      const events = [];
      const steps = Math.max(1, Math.min(40, Math.round(dt / SUB)));
      const h = dt / steps;
      for (let k = 0; k < steps; k++) substep(world, h, events);
      return events;
    },
    addBall(x, y, vx = 0, vy = 0, r = 22) {
      const ball = { x, y, vx, vy, r, layer: 0, inside: new Set(), frozen: false, id: world.balls.length + 1 };
      world.balls.push(ball);
      return ball;
    },
    find: (id) => colliders.find((c) => c.id === id),
  };
  return world;
}

function substep(world, h, events) {
  for (const c of world.colliders) if (c.type === 'flipper') moveFlipper(c, h);
  for (const ball of world.balls) {
    if (ball.frozen) continue;
    ball.vy += world.gravity * h;
    const sp = len(ball.vx, ball.vy);
    if (sp > MAX_SPEED) {
      ball.vx *= MAX_SPEED / sp;
      ball.vy *= MAX_SPEED / sp;
    }
    ball.x += ball.vx * h;
    ball.y += ball.vy * h;
    for (let pass = 0; pass < PASSES; pass++) {
      let touched = false;
      for (const c of world.colliders) {
        if (!c.enabled || (c.layer ?? 0) !== ball.layer) continue;
        if (c.type === 'sensor') continue;
        const hit = collide(ball, c);
        if (hit) {
          touched = true;
          if (hit > 0 && pass === 0) events.push({ type: 'hit', id: c.id, ball, speed: hit });
        }
      }
      if (!touched) break;
    }
    // датчики: вход и выход
    for (const c of world.colliders) {
      if (c.type !== 'sensor' || !c.enabled || (c.layer ?? 0) !== ball.layer) continue;
      const inside = insideSensor(ball, c);
      const was = ball.inside.has(c.id);
      if (inside && !was) {
        ball.inside.add(c.id);
        events.push({ type: 'enter', id: c.id, ball, speed: len(ball.vx, ball.vy) });
      } else if (!inside && was) {
        ball.inside.delete(c.id);
        events.push({ type: 'leave', id: c.id, ball });
      }
    }
  }
}

function insideSensor(ball, c) {
  if (c.shape === 'circle') return len(ball.x - c.x, ball.y - c.y) < c.r;
  if (c.shape === 'line') {
    // «ворота»: шарик касается отрезка
    const p = closestOnSegment(ball.x, ball.y, c.a[0], c.a[1], c.b[0], c.b[1]);
    return len(ball.x - p.x, ball.y - p.y) < ball.r;
  }
  return ball.x > c.x0 && ball.x < c.x1 && ball.y > c.y0 && ball.y < c.y1;
}

/** Столкновение шарика с препятствием: выталкивание + отскок. → скорость удара, −1 (касание без удара) или 0. */
function collide(ball, c) {
  if (c.type === 'circle') {
    const dx = ball.x - c.x;
    const dy = ball.y - c.y;
    const d = len(dx, dy);
    const min = c.r + ball.r;
    if (d >= min || d === 0) return 0;
    const nx = dx / d;
    const ny = dy / d;
    ball.x = c.x + nx * min;
    ball.y = c.y + ny * min;
    return bounce(ball, nx, ny, c.restitution ?? 0.5, c.friction ?? 0.1, c.kick ?? 0, 0, 0, c.falloff ?? 0, c.kickAlways) || -1;
  }
  if (c.type === 'seg') {
    const p = closestOnSegment(ball.x, ball.y, c.a[0], c.a[1], c.b[0], c.b[1]);
    let dx = ball.x - p.x;
    let dy = ball.y - p.y;
    const d = len(dx, dy);
    if (d >= ball.r) return 0;
    let nx;
    let ny;
    if (d > 1e-6) {
      nx = dx / d;
      ny = dy / d;
    } else {
      // центр ровно на отрезке — нормаль по левую руку от a→b
      const sx = c.b[0] - c.a[0];
      const sy = c.b[1] - c.a[1];
      const l = len(sx, sy) || 1;
      nx = sy / l;
      ny = -sx / l;
    }
    if (c.oneway) {
      // пропускает шарик с одной стороны: отталкивает, только если он слева по ходу a→b и летит в стенку
      const sx = c.b[0] - c.a[0];
      const sy = c.b[1] - c.a[1];
      const side = (ball.x - c.a[0]) * sy - (ball.y - c.a[1]) * sx;
      if (side > 0) return 0;
      const l = len(sx, sy) || 1;
      nx = -sy / l;
      ny = sx / l;
      // шарик, который только что прошёл насквозь, уходит от ворот — его не трогаем (иначе ворота сдвигали бы его вбок)
      if (ball.vx * nx + ball.vy * ny >= 0) return 0;
      dx = nx * d;
      dy = ny * d;
    }
    ball.x = p.x + nx * ball.r;
    ball.y = p.y + ny * ball.r;
    return bounce(ball, nx, ny, c.restitution ?? 0.5, c.friction ?? 0.1, c.kick ?? 0, 0, 0, c.falloff ?? 0) || -1;
  }
  if (c.type === 'flipper') {
    const [tx, ty] = flipperTip(c);
    const p = closestOnSegment(ball.x, ball.y, c.x, c.y, tx, ty);
    const r = c.r0 + (c.r1 - c.r0) * p.t;
    const dx = ball.x - p.x;
    const dy = ball.y - p.y;
    const d = len(dx, dy);
    const min = r + ball.r;
    if (d >= min || d === 0) return 0;
    const nx = dx / d;
    const ny = dy / d;
    const cxp = p.x + nx * r;         // точка касания на поверхности флиппера
    const cyp = p.y + ny * r;
    // скорость точки флиппера: ω × (точка − ось)
    const sx = -c.omega * (cyp - c.y);
    const sy = c.omega * (cxp - c.x);
    ball.x = p.x + nx * min;
    ball.y = p.y + ny * min;
    return bounce(ball, nx, ny, c.restitution, c.friction, 0, sx, sy, c.falloff ?? 0) || -1;
  }
  return 0;
}
