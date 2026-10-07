// Куча кружков «Слогов» без DOM: кружки тянет к середине поля, они расталкивают друг друга и стенки и быстро
// успокаиваются. Когда кружки лопаются или прилетают новые, куча мягко перестраивается.
// Тело: { id, x, y, vx, vy, r, tilt — наклон надписи в покое (градусы), angle — наклон сейчас, spin }.
// Скорость после каждого шага считается по пройденному пути — зажатые кружки не дрожат, и куча засыпает.

const PULL = 16;              // притяжение к середине, 1/с²
const DRAG = 3.2;             // затухание скорости, 1/с
const TURN_BACK = 22;         // возврат надписи к своему наклону, 1/с²
const TURN_DRAG = 6;
const REST_SPEED = 4;         // тише этого (px/с) куча считается спокойной
const STEP = 1 / 60;          // шаг расчёта, с
const MAX_SPEED = 1400;       // px/с — быстрее кружки не летают
const MAX_SPIN = 240;         // градусов в секунду

/** Радиус кружка для слога: длиннее слог — больше кружок. unit — радиус самого маленького. */
export const radiusOf = (text, unit) => unit * (0.84 + 0.17 * Math.min(6, [...text].length));

/** Какой unit взять, чтобы кружки заняли долю fill поля width × height (и не вышли за пределы min…max). */
export function unitFor(texts, width, height, { fill = 0.44, min = 13, max = 27 } = {}) {
  const area = texts.reduce((sum, t) => sum + Math.PI * radiusOf(t, 1) ** 2, 0);
  if (!area) return max;
  return Math.max(min, Math.min(max, Math.sqrt((fill * width * height) / area)));
}

export function createWorld(width, height) {
  const bodies = [];
  let w = width;
  let h = height;
  let calm = 0;                // сколько секунд подряд всё спокойно
  let pending = 0;             // недосчитанное время (меньше шага)

  function collide() {
    let deepest = 0;
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i];
      for (let j = i + 1; j < bodies.length; j++) {
        const b = bodies[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const min = a.r + b.r;
        let d2 = dx * dx + dy * dy;
        if (d2 >= min * min) continue;
        if (d2 < 1e-6) {
          // точно один на другом — разводим в стороны по номерам, чтобы не делить на ноль
          dx = (i % 2 ? 1 : -1) * 0.01;
          dy = 0.01;
          d2 = dx * dx + dy * dy;
        }
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const ny = dy / d;
        const over = min - d;
        deepest = Math.max(deepest, over);
        const ma = a.r * a.r;
        const mb = b.r * b.r;
        const ka = mb / (ma + mb);
        const kb = ma / (ma + mb);
        a.x -= nx * over * ka;
        a.y -= ny * over * ka;
        b.x += nx * over * kb;
        b.y += ny * over * kb;
        // касательное движение слегка закручивает надписи
        const vt = (b.vx - a.vx) * -ny + (b.vy - a.vy) * nx;
        a.spin += (vt / a.r) * 0.5 * ka;
        b.spin += (vt / b.r) * 0.5 * kb;
      }
    }
    return deepest;
  }

  function walls() {
    for (const b of bodies) {
      b.x = Math.max(b.r, Math.min(w - b.r, b.x));
      b.y = Math.max(b.r, Math.min(h - b.r, b.y));
    }
  }

  const world = {
    bodies,
    get width() { return w; },
    get height() { return h; },
    get asleep() { return calm > 0.35; },

    add(body) {
      bodies.push({ vx: 0, vy: 0, px: body.x, py: body.y, tilt: 0, angle: body.tilt ?? 0, spin: 0, ...body });
      calm = 0;
      return bodies[bodies.length - 1];
    },
    remove(id) {
      const at = bodies.findIndex((b) => b.id === id);
      if (at >= 0) bodies.splice(at, 1);
      calm = 0;
    },
    get: (id) => bodies.find((b) => b.id === id) ?? null,
    wake() {
      calm = 0;
    },
    resize(width2, height2) {
      w = width2;
      h = height2;
      calm = 0;
    },

    /**
     * Прошло dt секунд. Расчёт идёт ровными шагами по 1/60 с, остаток копится до следующего вызова: скорость
     * считается как «сдвиг / шаг», и на огрызке шага в полмиллисекунды обычный сдвиг дал бы бешеную скорость.
     */
    step(dt) {
      pending = Math.min(pending + Math.max(0, dt), 0.1);
      while (pending >= STEP) {
        const t = STEP;
        pending -= STEP;
        const cx = w / 2;
        const cy = h / 2;
        const drag = Math.exp(-DRAG * t);
        const turnDrag = Math.exp(-TURN_DRAG * t);
        for (const b of bodies) {
          b.vx = (b.vx + (cx - b.x) * PULL * t) * drag;
          b.vy = (b.vy + (cy - b.y) * PULL * t) * drag;
          b.px = b.x;
          b.py = b.y;
          b.x += b.vx * t;
          b.y += b.vy * t;
          b.spin = (b.spin + (b.tilt - b.angle) * TURN_BACK * t) * turnDrag;
          b.angle += b.spin * t;
        }
        for (let k = 0; k < 5; k++) {
          collide();
          walls();
        }
        // скорость — по тому, куда кружок на самом деле сдвинулся: зажатый соседями не «дрожит» на месте
        let fastest = 0;
        for (const b of bodies) {
          b.vx = (b.x - b.px) / t;
          b.vy = (b.y - b.py) / t;
          const speed = Math.hypot(b.vx, b.vy);
          if (speed > MAX_SPEED) {
            b.vx *= MAX_SPEED / speed;
            b.vy *= MAX_SPEED / speed;
          }
          b.spin = Math.max(-MAX_SPIN, Math.min(MAX_SPIN, b.spin));
          fastest = Math.max(fastest, Math.min(speed, MAX_SPEED), Math.abs(b.spin) * 0.3);
        }
        calm = fastest < REST_SPEED ? calm + t : 0;
      }
      return world.asleep;
    },

    /** Доиграть до покоя без показа (для «уменьшить движение» и тестов). → сколько секунд ушло. */
    settle(limit = 12) {
      let spent = 0;
      calm = 0;
      while (!world.asleep && spent < limit) {
        world.step(STEP);
        spent += STEP;
      }
      for (const b of bodies) {
        b.vx = 0;
        b.vy = 0;
        b.spin = 0;
        b.angle = b.tilt;
      }
      return spent;
    },

    /** Самое глубокое наложение кружков сейчас, px (0 — никто никого не задевает). */
    overlap() {
      let deepest = 0;
      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          const d = Math.hypot(bodies[j].x - bodies[i].x, bodies[j].y - bodies[i].y);
          deepest = Math.max(deepest, bodies[i].r + bodies[j].r - d);
        }
      }
      return deepest;
    },
  };
  return world;
}

/** Где появиться новому кружку: по краю поля вокруг середины (k-й из count) — оттуда его притянет в кучу. */
export function spawnPoint(k, count, width, height, rng = Math.random) {
  const a = ((k + rng() * 0.6) / Math.max(1, count)) * Math.PI * 2;
  const rx = width * 0.42;
  const ry = height * 0.42;
  return { x: width / 2 + Math.cos(a) * rx, y: height / 2 + Math.sin(a) * ry };
}
