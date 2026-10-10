// Рисунки «Прыгалки вверх» — всё нарисовано «от руки» шариковой ручкой, маркером и карандашом на тетрадном листе.
// Без DOM: функции получают контекст Canvas и рисуют в единицах мира (y вниз), масштаб задаёт вызывающий.
//
// Как получается рука, а не чертёж:
//   • линия идёт через точки с плавным уходом в сторону (shaky) — рука не держит прямую; частой дрожи нет;
//   • нажим меняется по ходу (толщина), начало и конец штриха тоньше;
//   • ломаная рисуется отрезками с захлёстом на углах, замкнутый контур не сходится точка в точку;
//   • заливка маркером чуть сдвинута от контура и лежит полосами — как закрашивают на самом деле.
// Случайность — от зерна: рисунок всегда один и тот же, а «живая» линия получается сменой зерна (два-три
// варианта картинки по очереди, как в рисованной мультипликации).

const TAU = Math.PI * 2;

export function rand(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Плавная волна −1…1 от пути: три синуса со случайными фазами. */
function wave(seed) {
  const r = rand(seed);
  const ph = [r() * TAU, r() * TAU, r() * TAU];
  const fr = [0.75 + r() * 0.5, 1.7 + r() * 0.8, 3.3 + r()];
  return (u) => Math.sin(u * fr[0] + ph[0]) * 0.6 + Math.sin(u * fr[1] + ph[1]) * 0.3 + Math.sin(u * fr[2] + ph[2]) * 0.1;
}

const pairs = (flat) => {
  const out = [];
  for (let i = 0; i + 1 < flat.length; i += 2) out.push([flat[i], flat[i + 1]]);
  return out;
};

/** Точки вдоль отрезка a→b через step единиц. */
function along(a, b, step) {
  const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
  const out = [];
  for (let i = 0; i <= n; i++) out.push([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);
  return out;
}

/** Гладкая линия через узлы (сплайн Катмулла — Рома), точки через step единиц. */
export function spline(nodes, closed = false, step = 1.5) {
  const n = nodes.length;
  if (n < 3) return n === 2 ? along(nodes[0], nodes[1], step) : nodes.slice();
  const at = (i) => (closed ? nodes[((i % n) + n) % n] : nodes[Math.max(0, Math.min(n - 1, i))]);
  const out = [];
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const m = Math.max(2, Math.round(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 0; k < m; k++) {
      const t = k / m;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (p2[0] - p0[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (3 * p1[0] - p0[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (p2[1] - p0[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (3 * p1[1] - p0[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push(closed ? out[0].slice() : nodes[n - 1].slice());
  return out;
}

/** Рука уводит линию в сторону: плавное смещение точек поперёк пути (amp — насколько). */
export function shaky(pts, amp, seed) {
  if (!amp || pts.length < 2) return pts;
  const side = wave(seed);
  const fwd = wave(seed + 31);
  const out = [];
  let len = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    if (i) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const tx = (b[0] - a[0]) / d;
    const ty = (b[1] - a[1]) / d;
    const s = amp * side(len / 21);
    const f = amp * 0.35 * fwd(len / 14);
    out.push([pts[i][0] - ty * s + tx * f, pts[i][1] + tx * s + ty * f]);
  }
  return out;
}

/** Штрих ручкой: толщина гуляет от нажима, концы тоньше. alpha < 1 — карандаш (ровная линия одним проходом). */
export function inkLine(ctx, pts, { color, w = 1.8, seed = 1, press = 0.22, alpha = 1 } = {}) {
  if (pts.length < 2) return;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (alpha < 1) {
    ctx.globalAlpha = alpha;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
    ctx.globalAlpha = 1;
    return;
  }
  const len = [0];
  for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = len[len.length - 1];
  const push = wave(seed + 7);
  for (let i = 0; i < pts.length - 1;) {
    const j = Math.min(pts.length - 1, i + 3);
    const edge = Math.min(len[i], total - len[j]);
    const taper = edge < 2.4 ? 0.7 + (0.3 * Math.max(0, edge)) / 2.4 : 1;
    ctx.lineWidth = Math.max(0.3, w * (1 + press * push(len[i] / 15)) * taper);
    ctx.beginPath();
    ctx.moveTo(pts[i][0], pts[i][1]);
    for (let k = i + 1; k <= j; k++) ctx.lineTo(pts[k][0], pts[k][1]);
    ctx.stroke();
    i = j;
  }
}

function polygon(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

function bounds(pts) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of pts) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// почерк: цифры и знаки в клетке 10×16 — штрихи как пишут в тетради (семёрка с перекладиной, четвёрка открытая)
const GLYPHS = {
  0: [['~', 5.4, 0.6, 1.6, 3.6, 0.9, 10, 4.6, 15.5, 8.7, 11.6, 9, 5, 6.2, 0.9, 4, 1.5]],
  1: [['-', 1.4, 5.2, 6, 0.6, 6.2, 15.7]],
  2: [['~', 1.3, 4, 4.8, 0.7, 8.6, 3.6, 6.2, 8.6, 1, 15.3], ['-', 1, 15.3, 9.4, 14.9]],
  3: [['~', 1.5, 2, 5.3, 0.6, 8.3, 3.6, 4.6, 7.4], ['~', 4.6, 7.4, 8.9, 10.6, 5.5, 15.5, 1, 13.5]],
  4: [['-', 6.4, 0.7, 0.9, 10.6, 9.6, 10.3], ['-', 7, 5.4, 7.1, 15.7]],
  5: [['-', 8.6, 0.9, 2.5, 1.1, 1.9, 7.2], ['~', 1.9, 7.2, 5.6, 5.9, 8.9, 9.7, 5.9, 15.3, 1, 13.7]],
  6: [['~', 8.2, 1.1, 3.6, 4.9, 1.3, 10.6, 4.6, 15.5, 8.5, 11.7, 5.3, 8.1, 1.7, 10.4]],
  7: [['-', 0.9, 1.1, 9, 0.8, 3.8, 15.7], ['-', 3.2, 8.3, 8.4, 7.9]],
  8: [['~', 5.2, 7.5, 1.9, 3.8, 5, 0.6, 8.2, 3.6, 5, 7.6, 1.2, 11.7, 5, 15.5, 8.8, 11.6, 4.8, 7.4]],
  9: [['~', 8.6, 5.3, 5, 8.3, 1.5, 4.9, 5, 0.7, 8.7, 4.6, 8.2, 11, 4, 15.6]],
  '+': [['-', 1.4, 8.4, 8.8, 8.1], ['-', 5.1, 4.4, 5.2, 12.2]],
  '-': [['-', 1.6, 8.4, 8.6, 8.1]],
  '=': [['-', 1.4, 6.6, 8.8, 6.3], ['-', 1.5, 10.4, 8.9, 10.1]],
  x: [['-', 1.6, 5, 8.4, 12], ['-', 8.2, 4.8, 1.8, 12.2]],
  '!': [['-', 5, 0.8, 5.1, 10.8], ['.', 5.1, 14.6, 0.9]],
  '?': [['~', 1.8, 3.6, 5, 0.7, 8.4, 3.6, 5.2, 7.6, 5, 10.8], ['.', 5.1, 14.6, 0.9]],
};
export const GLYPH_W = 10;
export const GLYPH_H = 16;
/** Ширина надписи высотой h. */
export const textWidth = (str, h) => String(str).length * (GLYPH_W + 1.6) * (h / GLYPH_H) - 1.6 * (h / GLYPH_H);

/**
 * Перо для одного рисунка: каждая линия берёт своё зерно. pal — цвета ({ ink, dark, red, pencil, … }),
 * seed — вариант рисунка (смена даёт «живую» линию).
 */
export function createPen(ctx, pal, seed = 1) {
  let n = seed * 7919 + 13;
  const next = () => (n += 271);
  const opt = (o) => ({ color: pal.ink, w: 1.9, amp: 0.7, press: 0.22, alpha: 1, again: false, ...o });

  function draw(pts, o) {
    const q = opt(o);
    inkLine(ctx, shaky(pts, q.amp, next()), { ...q, seed: next() });
    // второй проход — как обводят линию ещё раз, не попадая в первую
    if (q.again) inkLine(ctx, shaky(pts, q.amp * 1.5, next()), { ...q, w: q.w * 0.62, seed: next() });
  }

  const pen = {
    ctx,
    pal,
    /** Ломаная: отрезки с захлёстом на углах. */
    path(flat, o) {
      const p = pairs(flat);
      const r = rand(next());
      for (let i = 0; i + 1 < p.length; i++) {
        const a = p[i];
        const b = p[i + 1];
        const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const over = Math.min(1.3, d * 0.12);
        const s = i ? r() * over : 0;
        const e = i + 2 < p.length ? r() * over : 0;
        const ux = (b[0] - a[0]) / d;
        const uy = (b[1] - a[1]) / d;
        draw(along([a[0] - ux * s, a[1] - uy * s], [b[0] + ux * e, b[1] + uy * e], 1.6), o);
      }
    },
    line(x1, y1, x2, y2, o) {
      draw(along([x1, y1], [x2, y2], 1.6), o);
    },
    /** Замкнутая ломаная. */
    poly(flat, o) {
      pen.path([...flat, flat[0], flat[1]], o);
    },
    /** Гладкая линия через узлы. */
    curve(flat, o) {
      draw(spline(pairs(flat)), o);
    },
    /** Гладкий замкнутый контур: начало и конец перекрываются, но не сходятся. */
    loop(flat, o) {
      const pts = spline(pairs(flat), true);
      const r = rand(next());
      const cut = Math.floor(r() * (pts.length - 1));
      const turn = [...pts.slice(cut, -1), ...pts.slice(0, cut)];
      const over = Math.max(2, Math.round(turn.length * 0.07));
      draw([...turn, ...turn.slice(0, over).map(([x, y], i) => [x + (i * 0.9) / over, y - (i * 0.8) / over])], o);
    },
    /** Дуга окружности (эллипса) от a0 до a1. */
    arc(cx, cy, rx, ry, a0, a1, o) {
      const steps = Math.max(4, Math.round((Math.abs(a1 - a0) * Math.max(rx, ry)) / 1.6));
      const pts = [];
      for (let i = 0; i <= steps; i++) {
        const a = a0 + ((a1 - a0) * i) / steps;
        pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
      }
      draw(pts, o);
    },
    /** Кружок от руки: чуть больше оборота, конец уходит внутрь. */
    oval(cx, cy, rx, ry = rx, o) {
      const r = rand(next());
      const a0 = r() * TAU;
      const steps = Math.max(10, Math.round((TAU * Math.max(rx, ry)) / 1.5));
      const pts = [];
      const extra = 0.5 + r() * 0.5;
      for (let i = 0; i <= steps; i++) {
        const u = i / steps;
        const a = a0 + u * (TAU + extra);
        const k = 1 - 0.07 * Math.max(0, u - 0.8) * 5;
        pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
      }
      draw(pts, o);
    },
    /** Точка: жирная клякса от ручки. */
    dot(x, y, r = 1.2, o) {
      const q = opt(o);
      ctx.fillStyle = q.color;
      ctx.globalAlpha = q.alpha;
      ctx.beginPath();
      ctx.ellipse(x, y, r * 1.08, r * 0.94, 0.5, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    },
    /** Сплошная заливка фигуры (узлы — гладкий замкнутый контур или ломаная). */
    fill(flat, color, { smooth = true, alpha = 1, amp = 0.5 } = {}) {
      const pts = shaky(smooth ? spline(pairs(flat), true) : pairs(flat), amp, next());
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha;
      polygon(ctx, pts);
      ctx.fill();
      ctx.globalAlpha = 1;
    },
    /** Заливка маркером: чуть мимо контура, полосами. */
    marker(flat, color, { smooth = true, alpha = 0.8, dx = -0.8, dy = 0.7, grow = 0 } = {}) {
      const pts = smooth ? spline(pairs(flat), true) : pairs(flat);
      const box = bounds(pts);
      const r = rand(next());
      ctx.save();
      ctx.translate(dx, dy);
      if (grow) {
        ctx.translate(box.x + box.w / 2, box.y + box.h / 2);
        ctx.scale(1 + grow / box.w, 1 + grow / box.h);
        ctx.translate(-box.x - box.w / 2, -box.y - box.h / 2);
      }
      polygon(ctx, shaky(pts, 0.5, next()));
      ctx.clip();
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha;
      ctx.fillRect(box.x - 2, box.y - 2, box.w + 4, box.h + 4);
      ctx.globalAlpha = alpha * 0.24;
      for (let k = 0; k < 3; k++) ctx.fillRect(box.x - 2, box.y + r() * box.h, box.w + 4, box.h * (0.1 + r() * 0.16));
      ctx.restore();
      ctx.globalAlpha = 1;
    },
    /** Штриховка внутри фигуры. */
    hatch(flat, o = {}) {
      const { smooth = false, gap = 3.4, angle = -0.9, ...rest } = o;
      const pts = smooth ? spline(pairs(flat), true) : pairs(flat);
      const box = bounds(pts);
      const cx = box.x + box.w / 2;
      const cy = box.y + box.h / 2;
      const reach = Math.hypot(box.w, box.h) / 2 + 2;
      const r = rand(next());
      ctx.save();
      polygon(ctx, pts);
      ctx.clip();
      const ux = Math.cos(angle);
      const uy = Math.sin(angle);
      for (let d = -reach; d <= reach; d += gap * (0.8 + r() * 0.4)) {
        const ox = cx - uy * d;
        const oy = cy + ux * d;
        const k = 0.86 + r() * 0.14;
        draw(along([ox - ux * reach * k, oy - uy * reach * k], [ox + ux * reach * k, oy + uy * reach * k], 2.2), { w: 1.1, amp: 0.5, press: 0.3, ...rest });
      }
      ctx.restore();
    },
    /** Надпись своим почерком: цифры и знаки. x — левый край, y — верх, h — высота строки. */
    text(str, x, y, h = 16, o) {
      const k = h / GLYPH_H;
      const r = rand(next());
      let cx = x;
      for (const ch of String(str)) {
        const glyph = GLYPHS[ch];
        const jy = (r() - 0.5) * 1.2 * k;
        const lean = (r() - 0.5) * 0.5;
        if (glyph) {
          for (const [kind, ...v] of glyph) {
            const at = (i) => [cx + (v[i] + (GLYPH_H - v[i + 1]) * 0.06 * (1 + lean)) * k, y + v[i + 1] * k + jy];
            if (kind === '.') pen.dot(...at(0), v[2] * k * 1.1, o);
            else {
              const flat = [];
              for (let i = 0; i + 1 < v.length; i += 2) flat.push(...at(i));
              if (kind === '~') pen.curve(flat, { amp: 0.35 * k, ...o });
              else pen.path(flat, { amp: 0.3 * k, ...o });
            }
          }
        }
        cx += (GLYPH_W + 1.6) * k;
      }
    },
  };
  return pen;
}

// ---------- платформы ----------

export const PLAT = { w: 62, h: 13 };

/** Контур платформы-«колбаски»: узлы гладкой замкнутой линии; верх — на y = 0. */
function pill(w = PLAT.w, h = PLAT.h, sag = 0.5) {
  const a = w / 2;
  return [
    -a + 5, 0.4, -a * 0.3, -0.2 + sag, a * 0.35, 0.3, a - 5, 0, a - 0.6, h * 0.28, a - 0.8, h * 0.74, a - 5.5, h,
    a * 0.3, h - sag, -a * 0.35, h + 0.2, -a + 5.5, h - 0.2, -a + 0.7, h * 0.72, -a + 0.5, h * 0.3,
  ];
}

function platBody(g, color, seed) {
  const shape = pill(PLAT.w, PLAT.h, seed % 2 ? 0.6 : -0.3);
  g.marker(shape, color, { alpha: 0.86 });
  // блик: недокрашенная полоска под верхним краем
  g.curve([-21, 3.4, -9, 3, 3, 3.5], { color: '#ffffff', w: 1.7, amp: 0.3, alpha: 0.5 });
  g.loop(shape, { w: 2.1, amp: 0.55 });
}

// маленькие стрелки-уголки по краям ездящей платформы
function chevron(g, x, y, dir, vertical, o) {
  if (vertical) g.path([x - 3.4, y - dir * 2.6, x, y + dir * 2.6, x + 3.4, y - dir * 2.6], o);
  else g.path([x - dir * 2.6, y - 3.4, x + dir * 2.6, y, x - dir * 2.6, y + 3.4], o);
}

export const PLATFORMS = {
  solid(g, seed) {
    platBody(g, g.pal.green, seed);
  },
  move(g, seed) {
    platBody(g, g.pal.blue, seed);
    chevron(g, -37, 6.5, -1, false, { w: 1.7, amp: 0.2 });
    chevron(g, 37, 6.5, 1, false, { w: 1.7, amp: 0.2 });
  },
  vert(g, seed) {
    platBody(g, g.pal.violet, seed);
    chevron(g, -37, 3.6, -1, true, { w: 1.7, amp: 0.2 });
    chevron(g, 37, 9.6, 1, true, { w: 1.7, amp: 0.2 });
  },
  // одноразовая: пунктиром, без заливки — «намечена», а не нарисована
  once(g) {
    const pts = spline(pairs(pill()), true, 1.2);
    g.fill(pill(), g.pal.paper, { alpha: 0.9 });
    const o = { w: 1.9, amp: 0.25 };
    for (let i = 0; i < pts.length - 4; i += 9) {
      const piece = pts.slice(i, i + 6);
      inkLine(g.ctx, piece, { color: g.pal.ink, w: o.w, seed: i + 3, press: 0.25 });
    }
  },
  // карандашная обманка: две половинки с трещиной, штриховка
  crumble(g, seed) {
    for (const half of crumbleHalves()) crumbleHalf(g, half, seed);
  },
};

/** Половинки обманки: левая и правая (ломаные), трещина зигзагом посередине. */
export function crumbleHalves() {
  const a = PLAT.w / 2;
  const h = PLAT.h;
  const crack = [-2.5, -0.6, 2, 3.2, -1.8, 6.6, 2.4, 9.6, -0.6, h + 0.6];
  const shift = (flat, dx) => flat.map((v, i) => (i % 2 ? v : v + dx));
  const back = (flat) => {
    const out = [];
    for (let i = flat.length - 2; i >= 0; i -= 2) out.push(flat[i], flat[i + 1]);
    return out;
  };
  return [
    [-a + 4, 0.4, ...shift(crack, -1.2), -a + 5, h, -a + 0.5, h * 0.5],
    [...back(shift(crack, 1.2)), a - 5, 0, a - 0.5, h * 0.5, a - 4, h],
  ];
}

export function crumbleHalf(g, half, seed = 1) {
  const o = { color: g.pal.pencil, alpha: 0.9 };
  g.fill(half, g.pal.paper, { smooth: false, alpha: 0.85, amp: 0 });
  g.hatch(half, { ...o, w: 0.9, gap: 3.1, angle: seed % 2 ? -0.95 : -0.7, alpha: 0.6 });
  g.poly(half, { ...o, w: 1.5, amp: 0.45, again: true });
}

/** Земля у старта: длинная линия во весь лист, травинки, штриховка под ней. */
export function ground(g, width) {
  const half = width / 2;
  g.curve([-half - 4, 0.6, -half * 0.5, -0.4, 0, 0.5, half * 0.5, -0.2, half + 4, 0.4], { w: 2.3, amp: 0.8, again: true });
  const r = rand(77);
  for (let x = -half + 6; x < half; x += 9 + r() * 6) {
    g.line(x, 3 + r() * 2, x - 5 - r() * 3, 12 + r() * 5, { w: 1.1, amp: 0.4, alpha: 0.55 });
  }
  for (let x = -half + 14; x < half - 8; x += 26 + r() * 34) {
    const h = 5 + r() * 5;
    g.path([x - 4, -h * 0.7, x - 1, 0, x, -h, x + 1.5, 0, x + 5, -h * 0.8], { w: 1.4, amp: 0.3, color: g.pal.green2 });
  }
}

// ---------- предметы ----------

export const ITEMS = {
  // пружинка: основание, витки, шляпка; stretched — распрямилась
  spring(g, seed, stretched = false) {
    const h = stretched ? 27 : 12;
    const o = { color: g.pal.dark, w: stretched ? 1.7 : 1.5, amp: 0.2 };
    const turns = stretched ? 4 : 3;
    const flat = [-6, -0.6];
    for (let k = 0; k < turns; k++) {
      flat.push(6, -1 - (h - 2) * ((k + 0.5) / turns), -6, -1 - (h - 2) * ((k + 1) / turns));
    }
    g.path(flat, o);
    g.line(-8.5, 0.2, 8.5, -0.2, { ...o, w: 2.3 });
    g.line(-8, -h - 0.4, 8, -h - 0.8, { ...o, w: 2.5 });
  },
  // ластик: косой брусок, синяя и розовая половины
  eraser(g) {
    const body = [-20, -11.5, 16.5, -12, 20.5, -0.4, -16.5, 0.2];
    const blue = [-20, -11.5, -4.6, -11.8, -0.8, -0.1, -16.5, 0.2];
    g.marker(body, g.pal.pink, { smooth: false, alpha: 0.92, dx: -0.5, dy: 0.4 });
    g.marker(blue, g.pal.blue, { smooth: false, alpha: 0.92, dx: -0.5, dy: 0.4 });
    g.poly(body, { w: 1.9, amp: 0.35 });
    g.line(-4.6, -11.8, -0.8, -0.1, { w: 1.5, amp: 0.2 });
    g.line(4, -8.6, 12, -8.8, { color: '#ffffff', w: 1.4, amp: 0.2, alpha: 0.55 });
  },
  // бумажный самолётик: крыло и киль, сгиб посередине
  plane(g) {
    const wing = [-21, -9.5, 22, 1.5, -7, 3.6];
    const keel = [-7, 3.6, 22, 1.5, -12.5, 11.5];
    g.fill(wing, g.pal.white, { smooth: false, amp: 0 });
    g.fill(keel, g.pal.white, { smooth: false, amp: 0 });
    g.hatch(keel, { color: g.pal.pencil, w: 0.8, gap: 2.8, angle: 0.2, alpha: 0.55 });
    g.poly(wing, { w: 1.8, amp: 0.3 });
    g.path([-7, 3.6, -12.5, 11.5, 22, 1.5], { w: 1.8, amp: 0.3 });
    g.line(-17, -4.4, 9, 0.6, { color: g.pal.pencil, w: 0.9, amp: 0.2, alpha: 0.7 });
  },
  // карандаш-ракета: остриём вверх, сзади ластик
  rocket(g) {
    const body = [-5.4, -13.5, 5.4, -13.5, 5.4, 14, -5.4, 14];
    const wood = [-5.4, -13.5, 0, -24.5, 5.4, -13.5];
    g.marker(body, g.pal.yellow, { smooth: false, alpha: 0.95, dx: -0.3, dy: 0.2 });
    g.fill(wood, g.pal.wood, { smooth: false, amp: 0 });
    g.fill([-1.9, -20.6, 0, -24.8, 1.9, -20.6], g.pal.dark, { smooth: false, amp: 0 });
    g.fill([-5.4, 14, 5.4, 14, 5.4, 18, -5.4, 18], g.pal.metal, { smooth: false, amp: 0 });
    g.marker([-5, 18, 5, 18, 5.2, 21.6, 2.6, 23.6, -2.6, 23.6, -5.2, 21.6], g.pal.pink, { smooth: false, alpha: 0.95, dx: 0, dy: 0 });
    const o = { w: 1.6, amp: 0.2 };
    g.path([-5.4, 18, -5.4, -13.5, 0, -24.5, 5.4, -13.5, 5.4, 18], o);
    g.path([-5.4, -13.5, -2.7, -11.6, 0, -13.6, 2.7, -11.6, 5.4, -13.5], { ...o, w: 1.2 });
    g.line(-1.8, -11.4, -1.8, 13.6, { ...o, w: 0.9, alpha: 0.5 });
    g.line(1.9, -11.4, 1.9, 13.6, { ...o, w: 0.9, alpha: 0.5 });
    g.line(-5.4, 14, 5.4, 14, { ...o, w: 1.2 });
    g.line(-5.4, 18, 5.4, 18, { ...o, w: 1.2 });
    g.curve([-5.2, 18, -5.3, 21.8, -2.4, 23.8, 2.4, 23.8, 5.3, 21.8, 5.2, 18], o);
  },
  // наклейка-звёздочка
  star(g) {
    const pts = [];
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * TAU) / 10 + 0.12;
      const r = k % 2 ? 5.2 : 12;
      pts.push(Math.cos(a) * r, -12 + Math.sin(a) * r);
    }
    g.marker(pts, g.pal.yellow, { smooth: false, alpha: 0.95, dx: -0.4, dy: 0.4 });
    g.poly(pts, { w: 1.7, amp: 0.25 });
    g.line(-3.4, -15.4, -1.2, -17, { color: '#ffffff', w: 1.3, amp: 0, alpha: 0.7 });
  },
};

// ---------- каракуля ----------

export const HERO = { w: 39, h: 34 };

/**
 * Тело каракули: клубок — ручку расписывали, а он ожил. Середина клубка — (0, 0).
 * Плотное пятно, по краю линия проходит в несколько кругов (край «лохматый»), а внутри видны витки —
 * светлее, как блестят свежие чернила.
 */
export function heroBody(g, seed) {
  const r = rand(seed * 131 + 5);
  const rx = HERO.w / 2;
  const ry = HERO.h / 2;
  const c = g.pal.hero;
  const core = [];
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * TAU;
    const d = 0.88 + r() * 0.1;
    core.push(Math.cos(a) * rx * d, Math.sin(a) * ry * d);
  }
  g.fill(core, c, { amp: 0.5 });
  // круги по краю: каждый чуть другого размера и в стороне от прошлого
  const ring = (turns, lo, hi, per = 28) => {
    const pts = [];
    let ox = 0;
    let oy = 0;
    let d = (lo + hi) / 2;
    let nx = 0;
    let ny = 0;
    let nd = d;
    const start = r() * TAU;
    for (let i = 0; i <= turns * per; i++) {
      if (i % per === 0) {
        ox = nx;
        oy = ny;
        d = nd;
        nd = lo + r() * (hi - lo);
        const a = r() * TAU;
        const room = Math.max(0, 1.05 - nd) * r();
        nx = Math.cos(a) * rx * room;
        ny = Math.sin(a) * ry * room;
      }
      const u = (i % per) / per;
      const a = start + (i / per) * TAU;
      const k = d + (nd - d) * u;
      pts.push([ox + (nx - ox) * u + Math.cos(a) * rx * k, oy + (ny - oy) * u + Math.sin(a) * ry * k]);
    }
    return pts;
  };
  inkLine(g.ctx, ring(4, 0.9, 1.04), { color: c, w: 1.5, seed: seed + 3, press: 0.3 });
  inkLine(g.ctx, ring(6, 0.3, 0.84, 22), { color: g.pal.paper, w: 1.05, seed: seed + 9, alpha: 0.26 });
}

// ---------- враги ----------

/** Клякса: растёкшееся пятно с каплями. Глаза и зубы — из цвета бумаги, зрачки дорисовываются в кадре. */
export function blot(g, seed) {
  const r = rand(seed * 53 + 11);
  const c = g.pal.blot;
  const body = [];
  const lobes = 11;
  for (let k = 0; k < lobes; k++) {
    const a = (k / lobes) * TAU + 0.2;
    const d = k % 2 ? 0.78 + r() * 0.12 : 1 + r() * 0.16;
    body.push(Math.cos(a) * 21 * d, Math.sin(a) * 16.5 * d);
  }
  g.fill(body, c, { amp: 0.6 });
  // брызги вокруг и потёки вниз
  for (let k = 0; k < 5; k++) {
    const a = r() * TAU;
    g.dot(Math.cos(a) * (25 + r() * 5), Math.sin(a) * (19 + r() * 4), 1 + r() * 1.5, { color: c });
  }
  for (const x of [-9 + r() * 3, 6 + r() * 4]) {
    const len = 6 + r() * 6;
    g.fill([x - 2, 10, x + 2, 10, x + 1.6, 14 + len, x, 16 + len, x - 1.6, 14 + len], c, { amp: 0.2 });
  }
  // глаза и оскал
  const eye = g.pal.paper;
  g.ctx.fillStyle = eye;
  for (const [x, rr] of [[-7.5, 5.6], [7.5, 5]]) {
    g.ctx.beginPath();
    g.ctx.ellipse(x, -3.5, rr, rr * 1.06, 0, 0, TAU);
    g.ctx.fill();
  }
  g.path([-13.5, -10.5, -4.5, -7], { color: c, w: 2.6, amp: 0.2 });
  g.path([13.5, -10, 4.5, -6.8], { color: c, w: 2.6, amp: 0.2 });
  g.fill([-8, 5.6, -5, 9.6, -2.6, 5.8, 0, 9.8, 2.6, 5.8, 5, 9.6, 8, 5.6, 6, 4.6, -6, 4.6], eye, { smooth: false, amp: 0.2 });
}
/** Где у кляксы зрачки (середины глаз) и насколько они могут сдвинуться. */
export const BLOT_EYES = [[-7.5, -3.5], [7.5, -3.5]];

/** Двойка красной учительской ручкой — с глазом и клювом, как лебедь. Смотрит влево. */
export function two(g) {
  const c = g.pal.red;
  const neck = [-6.5, -12, -3, -20, 7, -19, 9.5, -9, -1, 3, -11.5, 17.5];
  g.curve(neck, { color: c, w: 5.6, amp: 0.5, press: 0.16 });
  g.curve([-11.5, 17.5, -3, 15.6, 5, 17.4, 13.5, 14.6], { color: c, w: 5.4, amp: 0.4, press: 0.16 });
  // голова: утолщение в начале штриха, клюв
  g.fill([-8, -17.5, -1, -21.5, 4, -17, 1, -11.5, -7, -11], c, { amp: 0.3 });
  g.fill([-7.6, -16, -16.5, -11.4, -7, -10.6], c, { smooth: false, amp: 0.2 });
  g.curve(neck, { color: g.pal.red2, w: 1.1, amp: 1.1, alpha: 0.55 });
  g.ctx.fillStyle = g.pal.paper;
  g.ctx.beginPath();
  g.ctx.ellipse(TWO_EYE[0], TWO_EYE[1], 3.3, 3.5, 0, 0, TAU);
  g.ctx.fill();
}
export const TWO_EYE = [-2.6, -16.2];

/**
 * Дырка в листе: рваный край, под листом темно. Край — мелкие неровные зубцы, а не звезда; сверху-слева тень
 * от листа (он толстый), снизу-справа видно, что под ним.
 */
export function hole(g, seed) {
  const r = rand(seed * 17 + 3);
  const edge = [];
  const teeth = 26;
  for (let k = 0; k < teeth; k++) {
    const a = (k / teeth) * TAU;
    const d = 0.86 + r() * 0.2 + (k % 2 ? -0.08 : 0.06) + 0.1 * Math.sin(a * 3 + seed);
    edge.push(Math.cos(a) * 22 * d, Math.sin(a) * 18.5 * d);
  }
  g.fill(edge, g.pal.hole, { smooth: false, amp: 0.3 });
  // глубина: тень от края листа
  g.ctx.save();
  polygon(g.ctx, pairs(edge));
  g.ctx.clip();
  g.ctx.fillStyle = g.pal.paper;
  g.ctx.globalAlpha = 0.16;
  g.ctx.beginPath();
  g.ctx.ellipse(5, 6, 17, 13, 0, 0, TAU);
  g.ctx.fill();
  g.ctx.globalAlpha = 1;
  g.ctx.restore();
  g.poly(edge, { w: 1.5, amp: 0.25 });
  // отогнутые клочки
  for (const k of [3, 11, 19]) {
    const x = edge[k * 2];
    const y = edge[k * 2 + 1];
    const a = Math.atan2(y, x) + (r() - 0.5) * 0.5;
    const tip = [x + Math.cos(a) * 8.5, y + Math.sin(a) * 8.5];
    const flap = [x - Math.sin(a) * 3.8, y + Math.cos(a) * 3.8, ...tip, x + Math.sin(a) * 3.8, y - Math.cos(a) * 3.8];
    g.fill(flap, g.pal.paper, { smooth: false, amp: 0 });
    g.hatch(flap, { color: g.pal.pencil, w: 0.7, gap: 2.2, alpha: 0.5 });
    g.poly(flap, { w: 1.2, amp: 0.2 });
  }
  // трещины от дырки
  for (const k of [7, 15, 23]) {
    const x = edge[k * 2];
    const y = edge[k * 2 + 1];
    const a = Math.atan2(y, x);
    g.path([x, y, x + Math.cos(a + 0.3) * 5, y + Math.sin(a + 0.3) * 5, x + Math.cos(a - 0.1) * 9, y + Math.sin(a - 0.1) * 9], { w: 1, amp: 0.2 });
  }
}

/** Вихрь вокруг дырки (крутится в кадре): карандашные дуги. */
export function swirl(g) {
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU;
    g.arc(0, 0, 30 + k * 2.5, 26 + k * 2, a, a + 1.25, { color: g.pal.pencil, w: 1.2, amp: 0.3, alpha: 0.7 });
    g.arc(0, 0, 38 - k * 1.5, 33 - k, a + 2, a + 2.7, { color: g.pal.pencil, w: 1, amp: 0.3, alpha: 0.45 });
  }
}

// ---------- каракули на полях ----------

const ray = (g, cx, cy, a, r0, r1, o) => g.line(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, o);

function cloudShape(g, x, y, k = 1) {
  g.loop([x - 26 * k, y + 8 * k, x - 28 * k, y - 1 * k, x - 19 * k, y - 7 * k, x - 12 * k, y - 4 * k, x - 9 * k, y - 15 * k, x + 4 * k, y - 18 * k,
    x + 12 * k, y - 9 * k, x + 21 * k, y - 12 * k, x + 28 * k, y - 3 * k, x + 24 * k, y + 5 * k, x + 30 * k, y + 9 * k, x + 22 * k, y + 13 * k, x - 18 * k, y + 13 * k]);
}

/** Каракули, которые рисуют на полях, пока скучно на уроке. Рисунок — в рамке примерно 70×70. */
export const DOODLES = {
  // двор
  sun(g) {
    g.oval(35, 35, 12.5);
    for (let k = 0; k < 9; k++) ray(g, 35, 35, k * 0.698 + 0.25, 17, k % 2 ? 23 : 27);
    g.dot(31, 32, 1.2);
    g.dot(39, 32, 1.2);
    g.arc(35, 35, 6, 5, 0.4, 2.7);
  },
  cloud(g) {
    cloudShape(g, 35, 34);
  },
  house(g) {
    g.poly([16, 62, 16, 36, 52, 36, 52, 62]);
    g.path([10, 38, 34, 15, 58, 38]);
    g.path([29, 62, 29, 48, 38, 48, 38, 62]);
    g.poly([20, 41, 27, 41, 27, 47, 20, 47]);
    g.line(23.5, 41, 23.5, 47);
    g.path([44, 25, 44, 15, 49, 15, 49, 30]);
    g.curve([47, 12, 43, 8, 48, 4, 52, 7, 49, 10, 53, 1]);
  },
  tree(g) {
    g.path([31, 66, 32, 44]);
    g.path([38, 66, 37, 44]);
    g.loop([18, 40, 12, 30, 18, 20, 26, 20, 30, 10, 42, 10, 46, 20, 54, 22, 58, 32, 52, 42, 40, 46, 28, 46]);
    g.oval(27, 30, 2.2);
    g.oval(41, 25, 2.2);
    g.oval(44, 37, 2.2);
  },
  flower(g) {
    g.curve([33, 68, 31, 54, 34, 40]);
    g.loop([32, 56, 24, 52, 20, 44, 28, 47]);
    for (let k = 0; k < 6; k++) g.oval(34 + Math.cos(k * 1.047) * 9.5, 28 + Math.sin(k * 1.047) * 9.5, 5.6, 5);
    g.oval(34, 28, 3.6);
  },
  cat(g) {
    g.oval(34, 27, 12, 10.5);
    g.path([24, 22, 23, 11, 30, 18]);
    g.path([38, 18, 45, 11, 44, 22]);
    g.loop([24, 37, 20, 50, 22, 62, 46, 62, 48, 50, 44, 37]);
    g.curve([46, 58, 56, 58, 58, 46, 53, 40]);
    g.dot(30, 26, 1.2);
    g.dot(38, 26, 1.2);
    g.path([33, 30, 35, 30, 34, 31.6]);
    g.line(22, 29, 12, 27);
    g.line(22, 31, 12, 33);
    g.line(46, 29, 56, 27);
    g.line(46, 31, 56, 33);
  },
  birds(g) {
    for (const [x, y, k] of [[20, 24, 1], [44, 16, 0.8], [50, 38, 1.1]]) {
      g.curve([x - 9 * k, y - 2 * k, x - 4 * k, y - 7 * k, x, y, x + 4 * k, y - 7 * k, x + 9 * k, y - 2 * k]);
    }
  },
  snail(g) {
    const sp = [];
    for (let i = 0; i <= 26; i++) {
      const a = i * 0.52;
      const r = 1.5 + i * 0.5;
      sp.push(36 + Math.cos(a) * r, 40 + Math.sin(a) * r);
    }
    g.curve(sp);
    g.curve([18, 56, 30, 58, 50, 56, 60, 54, 63, 46, 58, 44]);
    g.line(60, 45, 64, 36);
    g.line(57, 45, 57, 36);
    g.dot(64, 35, 1.3);
    g.dot(57, 35, 1.3);
  },
  butterfly(g) {
    g.line(35, 24, 35, 46);
    g.loop([35, 30, 22, 14, 12, 22, 20, 34]);
    g.loop([35, 30, 48, 14, 58, 22, 50, 34]);
    g.loop([35, 38, 24, 38, 18, 48, 28, 50]);
    g.loop([35, 38, 46, 38, 52, 48, 42, 50]);
    g.curve([35, 24, 31, 16, 27, 14]);
    g.curve([35, 24, 39, 16, 43, 14]);
  },
  mushroom(g) {
    g.arc(35, 36, 20, 17, Math.PI, TAU);
    g.line(15, 36, 55, 36);
    g.path([29, 36, 28, 58, 42, 58, 41, 36]);
    g.oval(27, 28, 3);
    g.oval(40, 25, 3.6);
    g.oval(47, 32, 2.2);
  },
  boat(g) {
    g.poly([12, 46, 58, 46, 50, 58, 20, 58]);
    g.line(35, 46, 35, 10);
    g.poly([35, 12, 54, 40, 35, 40]);
    g.poly([32, 18, 32, 40, 18, 40]);
    g.curve([4, 62, 12, 59, 20, 63, 28, 60, 36, 63, 44, 60, 52, 63, 60, 60, 66, 62]);
  },
  // небо
  airliner(g) {
    g.loop([8, 36, 20, 30, 50, 30, 62, 34, 52, 39, 20, 40]);
    g.poly([30, 31, 24, 14, 32, 14, 42, 31]);
    g.poly([32, 39, 28, 54, 35, 54, 44, 39]);
    g.poly([12, 33, 6, 20, 13, 20, 20, 32]);
    for (const x of [28, 36, 44, 52]) g.dot(x, 34.5, 1);
  },
  kite(g) {
    g.poly([34, 6, 52, 26, 34, 52, 16, 26]);
    g.line(34, 6, 34, 52);
    g.line(16, 26, 52, 26);
    g.curve([34, 52, 30, 58, 37, 62, 32, 68]);
    g.poly([27, 56, 33, 58, 28, 61]);
    g.poly([40, 60, 35, 63, 40, 66]);
  },
  balloon(g) {
    g.loop([34, 6, 18, 12, 14, 28, 22, 42, 30, 48, 38, 48, 46, 42, 54, 28, 50, 12]);
    g.curve([34, 6, 26, 20, 28, 40, 31, 48]);
    g.curve([34, 6, 42, 20, 40, 40, 37, 48]);
    g.poly([29, 57, 39, 57, 38, 65, 30, 65]);
    g.line(31, 48, 30, 57);
    g.line(37, 48, 38, 57);
  },
  rain(g) {
    cloudShape(g, 35, 24, 0.9);
    for (const x of [18, 28, 38, 48]) g.line(x, 42, x - 4, 52);
    for (const x of [24, 34, 44]) g.line(x, 54, x - 4, 64);
  },
  rainbow(g) {
    for (const r of [28, 22, 16]) g.arc(35, 50, r, r * 0.95, Math.PI, TAU);
    g.loop([4, 52, 3, 46, 9, 44, 14, 47, 15, 53]);
    g.loop([55, 53, 56, 47, 61, 44, 67, 46, 66, 52]);
  },
  parachute(g) {
    g.arc(35, 28, 24, 20, Math.PI, TAU);
    g.curve([11, 28, 17, 24, 23, 28, 29, 24, 35, 28, 41, 24, 47, 28, 53, 24, 59, 28]);
    g.line(11, 28, 33, 56);
    g.line(59, 28, 37, 56);
    g.line(35, 28, 35, 54);
    g.poly([30, 56, 40, 56, 40, 65, 30, 65]);
  },
  // урок
  triangle(g) {
    g.poly([12, 60, 60, 60, 12, 20]);
    g.path([12, 53, 19, 53, 19, 60]);
    g.arc(60, 60, 12, 12, Math.PI, Math.PI * 1.22);
    g.text('3', 2, 34, 9);
    g.text('4', 32, 62, 9);
    g.text('5', 40, 28, 9);
  },
  // учительница исправила: 2+2=5 — пятёрка зачёркнута, красным дописано 4
  sum(g) {
    g.text('2+2=5', 2, 26, 15);
    g.line(47, 44, 60, 24, { color: g.pal.red, w: 1.6 });
    g.text('4', 58, 10, 14, { color: g.pal.red });
  },
  graph(g) {
    g.path([14, 62, 14, 8]);
    g.path([10, 14, 14, 7, 18, 14]);
    g.path([8, 56, 64, 56]);
    g.path([58, 52, 65, 56, 58, 60]);
    g.curve([20, 12, 28, 40, 38, 52, 48, 40, 56, 12]);
  },
  cube(g) {
    g.poly([12, 28, 42, 28, 42, 58, 12, 58]);
    g.poly([26, 14, 56, 14, 56, 44, 26, 44]);
    g.line(12, 28, 26, 14);
    g.line(42, 28, 56, 14);
    g.line(42, 58, 56, 44);
    g.line(12, 58, 26, 44);
  },
  tictactoe(g) {
    g.line(26, 12, 27, 60);
    g.line(44, 12, 43, 60);
    g.line(10, 28, 60, 27);
    g.line(10, 44, 60, 45);
    g.line(13, 15, 22, 24);
    g.line(22, 15, 13, 24);
    g.oval(35, 20, 5);
    g.line(30, 31, 40, 41);
    g.line(40, 31, 30, 41);
    g.oval(18, 52, 5);
    g.line(47, 48, 57, 57);
    g.line(57, 48, 47, 57);
    g.line(11, 13, 59, 59, { w: 2.4 });
  },
  seabattle(g) {
    for (let k = 0; k <= 5; k++) {
      g.line(10 + k * 10, 10, 10 + k * 10, 60, { w: 1.2 });
      g.line(10, 10 + k * 10, 60, 10 + k * 10, { w: 1.2 });
    }
    g.hatch([20, 10, 50, 10, 50, 20, 20, 20], { gap: 2.6 });
    g.hatch([10, 40, 20, 40, 20, 60, 10, 60], { gap: 2.6 });
    g.line(42, 32, 48, 38);
    g.line(48, 32, 42, 38);
    g.dot(35, 45, 1.3);
    g.dot(55, 55, 1.3);
    g.dot(25, 35, 1.3);
  },
  hangman(g) {
    g.line(12, 64, 46, 64);
    g.path([22, 64, 22, 10, 46, 10, 46, 18]);
    g.line(22, 20, 32, 10);
    g.oval(46, 24, 6);
    g.line(46, 30, 46, 46);
    g.path([38, 34, 46, 38, 54, 34]);
    g.path([40, 56, 46, 46, 52, 56]);
  },
  clock(g) {
    g.oval(35, 35, 22);
    for (let k = 0; k < 12; k++) ray(g, 35, 35, k * 0.5236, k % 3 ? 19 : 17, 21.5);
    g.line(35, 35, 35, 21);
    g.line(35, 35, 44, 40);
    g.dot(35, 35, 1.5);
  },
  bulb(g) {
    g.arc(35, 28, 14, 14, Math.PI * 0.75, Math.PI * 2.25);
    g.path([25, 38, 29, 46, 41, 46, 45, 38]);
    g.line(30, 50, 40, 50);
    g.line(31, 54, 39, 54);
    g.curve([31, 46, 29, 34, 33, 28, 35, 34, 37, 28, 41, 34, 39, 46]);
    for (const a of [-2.6, -2.05, -1.57, -1.1, -0.55]) ray(g, 35, 28, a, 19, 25);
  },
  // космос
  star(g) {
    const v = [];
    for (const k of [0, 2, 4, 1, 3]) v.push(35 + Math.cos(-Math.PI / 2 + k * 1.2566) * 22, 36 + Math.sin(-Math.PI / 2 + k * 1.2566) * 22);
    g.poly(v);
  },
  sparkles(g) {
    for (const [x, y, r] of [[22, 22, 9], [48, 34, 12], [26, 52, 6]]) {
      g.curve([x, y - r, x + r * 0.2, y - r * 0.2, x + r, y, x + r * 0.2, y + r * 0.2, x, y + r, x - r * 0.2, y + r * 0.2, x - r, y, x - r * 0.2, y - r * 0.2, x, y - r]);
    }
    g.dot(56, 14, 1.2);
    g.dot(12, 40, 1);
    g.dot(44, 58, 1.2);
  },
  saturn(g) {
    g.oval(35, 35, 14);
    g.ctx.save();
    g.ctx.translate(35, 35);
    g.ctx.rotate(-0.38);
    g.arc(0, 0, 27, 7.5, -0.15, Math.PI + 0.15);
    g.arc(0, 0, 27, 7.5, Math.PI + 0.75, TAU - 0.75);
    g.ctx.restore();
    g.curve([24, 30, 32, 27, 42, 28]);
    g.curve([27, 42, 36, 40, 46, 41]);
  },
  spaceship(g) {
    g.loop([35, 4, 26, 18, 25, 44, 45, 44, 44, 18]);
    g.oval(35, 24, 5);
    g.poly([25, 34, 14, 48, 25, 46]);
    g.poly([45, 34, 56, 48, 45, 46]);
    g.path([28, 46, 31, 56, 35, 49, 39, 60, 42, 46]);
  },
  moon(g) {
    g.arc(34, 35, 21, 21, 0.9, 5.4);
    g.arc(46, 35, 18, 17, 1.75, 4.55);
    g.oval(22, 30, 2.4);
    g.oval(26, 44, 3.2);
  },
  comet(g) {
    g.oval(50, 20, 7);
    g.curve([44, 24, 30, 34, 12, 40]);
    g.curve([47, 27, 34, 42, 18, 54]);
    g.curve([51, 28, 42, 44, 30, 60]);
  },
  alien(g) {
    g.loop([35, 8, 18, 14, 14, 30, 26, 46, 35, 50, 44, 46, 56, 30, 52, 14]);
    g.oval(27, 28, 5, 7);
    g.oval(43, 28, 5, 7);
    g.curve([30, 41, 35, 43, 40, 41]);
    g.line(28, 10, 22, 1);
    g.line(42, 10, 48, 1);
    g.dot(22, 1, 1.6);
    g.dot(48, 1, 1.6);
    g.path([30, 50, 28, 64]);
    g.path([40, 50, 42, 64]);
  },
  dipper(g) {
    const p = [[8, 22], [20, 18], [32, 22], [42, 30], [44, 44], [60, 46], [62, 32]];
    for (let k = 0; k + 1 < p.length; k++) g.line(...p[k], ...p[k + 1], { w: 1.1 });
    g.line(...p[6], ...p[3], { w: 1.1 });
    for (const [x, y] of p) g.dot(x, y, 2);
  },
  ufo(g) {
    g.arc(35, 28, 12, 12, Math.PI, TAU);
    g.loop([8, 32, 20, 26, 50, 26, 62, 32, 50, 38, 20, 38]);
    for (const x of [22, 35, 48]) g.dot(x, 32, 1.4);
    g.line(26, 40, 18, 62);
    g.line(44, 40, 52, 62);
    g.line(35, 41, 35, 58);
  },
  // просто так
  spiral(g) {
    const sp = [];
    for (let i = 0; i <= 44; i++) {
      const a = i * 0.45;
      const r = 1 + i * 0.52;
      sp.push(35 + Math.cos(a) * r, 35 + Math.sin(a) * r);
    }
    g.curve(sp);
  },
  heart(g) {
    g.loop([35, 22, 26, 12, 14, 18, 14, 32, 24, 46, 35, 56, 46, 46, 56, 32, 56, 18, 44, 12]);
    g.line(8, 52, 62, 16);
    g.path([54, 15, 63, 15, 62, 24]);
    g.line(8, 52, 5, 45);
    g.line(8, 52, 15, 54);
  },
  bolt(g) {
    g.poly([40, 6, 18, 38, 32, 38, 24, 64, 52, 28, 38, 28]);
  },
  eye(g) {
    g.curve([8, 35, 22, 20, 48, 20, 62, 35]);
    g.curve([8, 35, 22, 48, 48, 48, 62, 35]);
    g.oval(35, 34, 9);
    g.dot(35, 34, 3.4);
    for (const [x, a] of [[18, -2.2], [28, -1.8], [42, -1.3], [52, -0.95]]) ray(g, x, 23, a, 0, 7);
  },
  crown(g) {
    g.poly([12, 52, 10, 22, 24, 36, 35, 14, 46, 36, 60, 22, 58, 52]);
    g.line(12, 46, 58, 46);
    g.dot(10, 20, 2);
    g.dot(35, 12, 2);
    g.dot(60, 20, 2);
  },
  notes(g) {
    g.oval(20, 54, 6, 4.6);
    g.oval(48, 48, 6, 4.6);
    g.line(26, 54, 26, 18);
    g.line(54, 48, 54, 12);
    g.line(26, 18, 54, 12, { w: 3 });
  },
  smiley(g) {
    g.oval(35, 35, 22);
    g.oval(27, 29, 2.6, 3.6);
    g.oval(43, 29, 2.6, 3.6);
    g.arc(35, 36, 13, 11, 0.25, Math.PI - 0.25);
  },
  // ручку расписывали: строчка петель, как в прописях
  loops(g) {
    const sp = [];
    for (let i = 0; i <= 70; i++) {
      const u = i / 70;
      const a = u * TAU * 6;
      sp.push(6 + u * 50 + Math.sin(a) * 6, 34 - Math.cos(a) * 11 + 11);
    }
    g.curve(sp, { w: 1.5 });
    g.curve([6, 58, 14, 54, 22, 60, 30, 55, 38, 60, 46, 55, 54, 60, 62, 56], { w: 1.5 });
  },
  boxes(g) {
    for (const [x, y] of [[14, 40], [34, 40], [24, 20]]) {
      g.poly([x, y + 8, x + 18, y + 8, x + 18, y + 24, x, y + 24]);
      g.path([x, y + 8, x + 6, y, x + 24, y, x + 18, y + 8]);
      g.path([x + 24, y, x + 24, y + 16, x + 18, y + 24]);
    }
  },
  arrow(g) {
    g.curve([8, 50, 24, 56, 40, 46, 42, 30, 32, 22, 24, 30, 30, 42, 46, 40, 60, 20]);
    g.path([50, 20, 61, 18, 60, 29]);
  },
};

/** Стрелка «вверх» у старта — нарисована размашисто, с завитком. Рамка — как у каракулей. */
export function startArrow(g) {
  g.curve([40, 70, 46, 56, 30, 48, 26, 38, 36, 32, 42, 40, 36, 46, 30, 30, 36, 6], { w: 2.2, again: true });
  g.path([26, 17, 36.5, 5, 45, 18], { w: 2.2 });
}

/** Какие каракули на какой высоте: зоны сменяются (числа — с какой клетки начинается зона). */
export const ZONES = [
  { from: 0, name: 'двор', list: ['sun', 'cloud', 'house', 'tree', 'flower', 'cat', 'birds', 'snail', 'butterfly', 'mushroom', 'boat'] },
  { from: 250, name: 'небо', list: ['cloud', 'airliner', 'kite', 'balloon', 'birds', 'rain', 'rainbow', 'parachute', 'sun'] },
  { from: 600, name: 'урок', list: ['triangle', 'sum', 'graph', 'cube', 'tictactoe', 'seabattle', 'hangman', 'clock', 'bulb', 'loops'] },
  { from: 1100, name: 'космос', list: ['star', 'sparkles', 'saturn', 'spaceship', 'moon', 'comet', 'alien', 'dipper', 'ufo'] },
  { from: 1700, name: 'каракули', list: ['spiral', 'heart', 'bolt', 'eye', 'crown', 'notes', 'smiley', 'loops', 'boxes', 'arrow', 'star'] },
];
export const ZONE_LOOP = 2300;              // выше — зоны идут снова, начиная со второй

export function zoneAt(cells) {
  let c = cells;
  if (c >= ZONE_LOOP) c = ZONES[1].from + ((c - ZONE_LOOP) % (ZONE_LOOP - ZONES[1].from));
  let zone = ZONES[0];
  for (const z of ZONES) if (c >= z.from) zone = z;
  return zone;
}
