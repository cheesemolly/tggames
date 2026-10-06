// Арканоид — графика, которая рисуется заранее в картинки: кирпичи десяти видов (у каждой главы свой), фон главы,
// бонусы, шарик, платформа. Функции получают контекст Canvas и цвета (их читает из CSS index.js) и ничего не знают
// об игре. Градиенты, тени и свечение здесь можно — в кадре игра только копирует готовые картинки.
//
// Виды кирпичей по главам (SKINS): 0 «Космос» — глянцевый гель, 1 «Океан» — морское стекло, 2 «Джунгли» — дерево,
// 3 «Пустыня» — тёсаный камень, 4 «Льды» — лёд, 5 «Вулкан» — магма в трещинах, 6 «Неон» — светящаяся трубка,
// 7 «Карамель» — леденец в полоску, 8 «Завод» — металл с заклёпками, 9 «Кристаллы» — огранка.
// Особые кирпичи (с бонусом, взрывной, стальной, запертый шарик) во всех главах одинаковые — их надо узнавать сразу.

import { BAD_BONUSES, BRICK_W, BRICK_H, WEAR } from './logic.js';

export const SKINS = ['gel', 'glass', 'wood', 'stone', 'ice', 'magma', 'neon', 'candy', 'metal', 'gem'];
export const TAU = Math.PI * 2;

// ---------- цвет ----------

const parse = (rgb) => (rgb.match(/\d+(\.\d+)?/g) ?? [0, 0, 0]).slice(0, 3).map(Number);

/** rgb(…) → светлее (k > 0) или темнее (k < 0). */
export function shade(rgb, k) {
  const [r, g, b] = parse(rgb).map((n) => Math.round(k > 0 ? n + (255 - n) * k : n * (1 + k)));
  return `rgb(${r}, ${g}, ${b})`;
}

export function alpha(rgb, a) {
  const [r, g, b] = parse(rgb);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function mix(a, b, k) {
  const p = parse(a);
  const q = parse(b);
  return `rgb(${p.map((v, i) => Math.round(v + (q[i] - v) * k)).join(', ')})`;
}

const luma = (rgb) => {
  const [r, g, b] = parse(rgb);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
};

export function rnd(seed) {
  let x = seed >>> 0;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

// ---------- контуры ----------

export function path(c, pts) {
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
}

/** Многоугольник со скруглёнными углами. */
export function rounded(c, pts, r) {
  const n = pts.length;
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const m0 = mid(pts[n - 1], pts[0]);
  c.beginPath();
  c.moveTo(m0[0], m0[1]);
  for (let i = 0; i < n; i++) {
    const m = mid(pts[i], pts[(i + 1) % n]);
    c.arcTo(pts[i][0], pts[i][1], m[0], m[1], r);
  }
  c.closePath();
}

const centroid = (pts) => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
const inset = (pts, k, [cx, cy] = centroid(pts)) => pts.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]);

export function star(c, x, y, r, rays, inner = 0.42, turn = -Math.PI / 2) {
  c.beginPath();
  for (let i = 0; i < rays * 2; i++) {
    const a = (i / (rays * 2)) * TAU + turn;
    const d = i % 2 ? r * inner : r;
    c.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
  }
  c.closePath();
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/** Грани: полоски между контуром и уменьшенным контуром, светлее сверху-слева и темнее снизу-справа. */
function bevel(c, pts, inner, col, depth) {
  const [cx, cy] = centroid(pts);
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    let nx = q[1] - p[1];
    let ny = p[0] - q[0];
    const len = Math.hypot(nx, ny) || 1;
    if (nx * ((p[0] + q[0]) / 2 - cx) + ny * ((p[1] + q[1]) / 2 - cy) < 0) {
      nx = -nx;
      ny = -ny;
    }
    const light = (nx * -0.45 + ny * -0.89) / len;
    c.fillStyle = shade(col, light > 0 ? light * depth : light * depth * 0.9);
    path(c, [p, q, inner[(i + 1) % pts.length], inner[i]]);
    c.fill();
    c.strokeStyle = c.fillStyle;
    c.lineWidth = 0.25;
    c.stroke();
  }
}

// ---------- виды кирпичей ----------
// (c, pts — контур в единицах кирпича 32 × 18, col — цвет, px — пикселей холста на единицу, seed — номер для узора)

const BODY = {
  // гель: градиент сверху вниз, блик, светлая кромка
  gel(c, pts, col) {
    const g = c.createLinearGradient(0, 0, 0, BRICK_H);
    g.addColorStop(0, shade(col, 0.34));
    g.addColorStop(0.5, col);
    g.addColorStop(1, shade(col, -0.3));
    rounded(c, pts, 2.2);
    c.fillStyle = g;
    c.fill();
    c.save();
    c.clip();
    const gl = c.createLinearGradient(0, 0, 0, BRICK_H * 0.52);
    gl.addColorStop(0, 'rgba(255, 255, 255, 0.5)');
    gl.addColorStop(1, 'rgba(255, 255, 255, 0)');
    c.fillStyle = gl;
    c.fillRect(0, 0, BRICK_W, BRICK_H * 0.52);
    c.restore();
    c.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    c.lineWidth = 0.6;
    c.stroke();
  },

  // морское стекло: полупрозрачное, со светлой внутренней кромкой и бликом
  glass(c, pts, col) {
    const [cx, cy] = centroid(pts);
    const g = c.createLinearGradient(0, 0, 0, BRICK_H);
    g.addColorStop(0, alpha(shade(col, 0.2), 0.9));
    g.addColorStop(1, alpha(shade(col, -0.3), 0.66));
    rounded(c, pts, 3);
    c.fillStyle = g;
    c.fill();
    c.save();
    c.clip();
    c.strokeStyle = alpha(shade(col, 0.65), 0.7);
    c.lineWidth = 2.6;
    c.stroke();
    c.fillStyle = 'rgba(255, 255, 255, 0.75)';
    c.beginPath();
    c.ellipse(cx - 6, cy - 3.6, 5.2, 1.5, -0.12, 0, TAU);
    c.fill();
    c.fillStyle = 'rgba(255, 255, 255, 0.35)';
    c.beginPath();
    c.ellipse(cx + 7, cy + 4, 2.4, 0.9, -0.12, 0, TAU);
    c.fill();
    c.restore();
    c.strokeStyle = alpha(shade(col, -0.45), 0.8);
    c.lineWidth = 0.5;
    c.stroke();
  },

  // дерево: волокна и тёмные торцы
  wood(c, pts, col, px, seed) {
    const r = rnd(seed * 31 + 7);
    const g = c.createLinearGradient(0, 0, 0, BRICK_H);
    g.addColorStop(0, shade(col, 0.16));
    g.addColorStop(1, shade(col, -0.2));
    rounded(c, pts, 1.6);
    c.fillStyle = g;
    c.fill();
    c.save();
    c.clip();
    c.strokeStyle = alpha(shade(col, -0.55), 0.38);
    c.lineWidth = 0.55;
    for (let k = 0; k < 4; k++) {
      const y = 3 + k * 4 + r() * 1.4;
      c.beginPath();
      c.moveTo(-1, y);
      c.bezierCurveTo(9, y - 1.4 + r() * 2.8, 22, y - 1.4 + r() * 2.8, 33, y + r() * 1.2 - 0.6);
      c.stroke();
    }
    c.fillStyle = alpha(shade(col, -0.6), 0.3);
    c.fillRect(0, 0, 3.2, BRICK_H);
    c.fillRect(BRICK_W - 3.2, 0, 3.2, BRICK_H);
    c.fillStyle = 'rgba(255, 255, 255, 0.22)';
    c.fillRect(0, 0, BRICK_W, 1.7);
    c.restore();
    c.strokeStyle = alpha(shade(col, -0.6), 0.7);
    c.lineWidth = 0.6;
    c.stroke();
  },

  // тёсаный камень: фаска и крапинки
  stone(c, pts, col, px, seed) {
    const r = rnd(seed * 17 + 3);
    const inner = inset(pts, 0.74);
    bevel(c, pts, inner, col, 0.42);
    path(c, inner);
    c.fillStyle = col;
    c.fill();
    c.save();
    c.clip();
    for (let k = 0; k < 9; k++) {
      c.fillStyle = k % 2 ? 'rgba(255, 255, 255, 0.22)' : 'rgba(0, 0, 0, 0.16)';
      c.fillRect(r() * BRICK_W, r() * BRICK_H, 0.9 + r() * 1.3, 0.8 + r());
    }
    c.restore();
  },

  // лёд: косой блеск и белая кромка
  ice(c, pts, col) {
    const [cx, cy] = centroid(pts);
    const g = c.createLinearGradient(0, 0, BRICK_W, BRICK_H);
    g.addColorStop(0, shade(col, 0.6));
    g.addColorStop(0.5, shade(col, 0.1));
    g.addColorStop(1, shade(col, -0.28));
    rounded(c, pts, 1);
    c.fillStyle = g;
    c.fill();
    c.save();
    c.clip();
    c.fillStyle = 'rgba(255, 255, 255, 0.42)';
    path(c, [[cx - 9, -1], [cx - 4, -1], [cx - 12, 19], [cx - 17, 19]]);
    c.fill();
    c.fillStyle = 'rgba(255, 255, 255, 0.22)';
    path(c, [[cx + 1, -1], [cx + 3, -1], [cx - 5, 19], [cx - 7, 19]]);
    c.fill();
    c.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    c.lineWidth = 0.45;
    c.beginPath();
    c.moveTo(cx + 3, cy + 1);
    c.lineTo(cx + 11, cy - 5);
    c.moveTo(cx + 3, cy + 1);
    c.lineTo(cx + 9, cy + 6);
    c.stroke();
    c.restore();
    c.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    c.lineWidth = 0.75;
    c.stroke();
  },

  // магма: тёмная порода, в трещинах светится цвет кирпича
  magma(c, pts, col, px, seed) {
    const r = rnd(seed * 13 + 5);
    const g = c.createLinearGradient(0, 0, 0, BRICK_H);
    g.addColorStop(0, mix(col, 'rgb(40, 24, 22)', 0.74));
    g.addColorStop(1, mix(col, 'rgb(12, 6, 6)', 0.86));
    rounded(c, pts, 1.8);
    c.fillStyle = g;
    c.fill();
    c.save();
    c.clip();
    const lava = c.createLinearGradient(0, BRICK_H * 0.45, 0, BRICK_H);
    lava.addColorStop(0, alpha(col, 0));
    lava.addColorStop(1, alpha(col, 0.75));
    c.fillStyle = lava;
    c.fillRect(0, 0, BRICK_W, BRICK_H);
    c.shadowColor = col;
    c.shadowBlur = 2.4 * px;
    c.strokeStyle = shade(col, 0.35);
    c.lineWidth = 0.9;
    c.lineJoin = 'round';
    for (let k = 0; k < 2; k++) {
      let x = k ? 19 + r() * 4 : 4 + r() * 4;
      c.beginPath();
      c.moveTo(x, -1);
      for (let y = 3; y <= 19; y += 4) {
        x += (r() - 0.5) * 7;
        c.lineTo(x, y + r() * 2);
      }
      c.stroke();
    }
    c.restore();
    c.strokeStyle = alpha(shade(col, 0.2), 0.75);
    c.lineWidth = 0.6;
    c.stroke();
  },

  // неон: тёмное стекло и светящаяся трубка по контуру
  neon(c, pts, col, px) {
    const tube = inset(pts, 0.9);
    rounded(c, pts, 2.6);
    c.fillStyle = alpha(col, 0.17);
    c.fill();
    c.save();
    c.shadowColor = col;
    c.shadowBlur = 3.2 * px;
    c.strokeStyle = col;
    c.lineWidth = 1.8;
    rounded(c, tube, 2.4);
    c.stroke();
    c.stroke();
    c.restore();
    c.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    c.lineWidth = 0.55;
    c.stroke();
  },

  // леденец: пилюля в косую белую полоску
  candy(c, pts, col) {
    const g = c.createLinearGradient(0, 0, 0, BRICK_H);
    g.addColorStop(0, shade(col, 0.28));
    g.addColorStop(1, shade(col, -0.18));
    rounded(c, pts, 6);
    c.fillStyle = g;
    c.fill();
    c.save();
    c.clip();
    c.fillStyle = 'rgba(255, 255, 255, 0.42)';
    for (let x = -14; x < BRICK_W + 6; x += 9) {
      path(c, [[x, BRICK_H + 1], [x + 3.4, BRICK_H + 1], [x + 13.4, -1], [x + 10, -1]]);
      c.fill();
    }
    const gl = c.createLinearGradient(0, 0, 0, BRICK_H * 0.5);
    gl.addColorStop(0, 'rgba(255, 255, 255, 0.5)');
    gl.addColorStop(1, 'rgba(255, 255, 255, 0)');
    c.fillStyle = gl;
    c.fillRect(0, 0, BRICK_W, BRICK_H * 0.5);
    c.restore();
    c.strokeStyle = alpha(shade(col, -0.4), 0.75);
    c.lineWidth = 0.7;
    c.stroke();
  },

  // металл: фаска, полированная середина, заклёпки
  metal(c, pts, col) {
    const [cx, cy] = centroid(pts);
    const inner = inset(pts, 0.8);
    bevel(c, pts, inner, col, 0.5);
    const g = c.createLinearGradient(0, 2, 0, BRICK_H - 2);
    g.addColorStop(0, shade(col, 0.3));
    g.addColorStop(0.45, col);
    g.addColorStop(0.55, shade(col, -0.2));
    g.addColorStop(1, shade(col, 0.08));
    path(c, inner);
    c.fillStyle = g;
    c.fill();
    c.fillStyle = 'rgba(0, 0, 0, 0.4)';
    for (const p of inset(pts, 0.6)) {
      c.beginPath();
      c.arc(p[0] + (cx - p[0]) * 0.08, p[1] + (cy - p[1]) * 0.08, 0.95, 0, TAU);
      c.fill();
    }
    c.strokeStyle = 'rgba(0, 0, 0, 0.45)';
    c.lineWidth = 0.45;
    path(c, pts);
    c.stroke();
  },

  // огранка: глубокие грани и искра
  gem(c, pts, col) {
    const [cx, cy] = centroid(pts);
    const inner = inset(pts, 0.5);
    bevel(c, pts, inner, col, 0.62);
    path(c, inner);
    c.fillStyle = shade(col, 0.3);
    c.fill();
    c.fillStyle = 'rgba(255, 255, 255, 0.95)';
    star(c, cx - 3.4, cy - 1.6, 2.6, 4, 0.28);
    c.fill();
    c.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    c.lineWidth = 0.4;
    path(c, pts);
    c.stroke();
  },
};

/** Центр значка: у треугольников — ближе к широкой части. */
const mark = (pts, shape) => {
  const [cx, cy] = centroid(pts);
  return [cx, cy + (shape === 'U' ? 1.2 : shape === 'D' ? -1.2 : 0)];
};

/**
 * Кирпич в рамке 32 × 18 (начало координат — её левый верхний угол). kind — вид, shape — форма, pts — контур,
 * color — цвет обычного или крепкого кирпича, state — оставшаяся прочность (h: 1–3, x: доля 0–1), pal — цвета игры.
 */
export function paintBrick(c, { skin, kind, shape, pts, color, state, pal, px, seed = 1 }) {
  const [cx, cy] = mark(pts, shape);
  c.lineJoin = 'round';
  if (kind === 't') {
    // запертый шарик: шарик в пузыре
    c.fillStyle = alpha(pal.ball, 0.14);
    c.beginPath();
    c.arc(cx, cy, 8.6, 0, TAU);
    c.fill();
    c.strokeStyle = alpha(pal.ball, 0.8);
    c.lineWidth = 1.1;
    c.setLineDash([2.6, 1.6]);
    c.stroke();
    c.setLineDash([]);
    const g = c.createRadialGradient(cx - 1.6, cy - 1.8, 0.5, cx, cy, 5.2);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.45, pal.ball);
    g.addColorStop(1, shade(pal.ball, -0.4));
    c.fillStyle = g;
    c.beginPath();
    c.arc(cx, cy, 5, 0, TAU);
    c.fill();
    return;
  }
  if (kind === 'x') {
    // сталь: фаска, насечка крест-накрест, трещины по мере износа
    const inner = inset(pts, 0.78);
    bevel(c, pts, inner, pal.steel, 0.55);
    path(c, inner);
    c.fillStyle = shade(pal.steel, -0.12);
    c.fill();
    c.save();
    c.clip();
    c.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    c.lineWidth = 0.7;
    for (let x = -18; x < BRICK_W + 18; x += 6) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x + 18, 18);
      c.moveTo(x + 18, 0);
      c.lineTo(x, 18);
      c.stroke();
    }
    if (state < 0.67) {
      c.strokeStyle = 'rgba(0, 0, 0, 0.7)';
      c.lineWidth = 0.9;
      c.beginPath();
      c.moveTo(cx - 9, cy - 7);
      c.lineTo(cx - 3, cy);
      c.lineTo(cx - 6, cy + 7);
      if (state < 0.34) {
        c.moveTo(cx + 10, cy - 7);
        c.lineTo(cx + 4, cy + 1);
        c.lineTo(cx + 8, cy + 7);
      }
      c.stroke();
    }
    c.restore();
    c.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    c.lineWidth = 0.5;
    path(c, pts);
    c.stroke();
    return;
  }
  if (kind === 'e') {
    // взрывной: тёмный корпус, раскалённая кромка и искра
    rounded(c, pts, 2);
    c.fillStyle = 'rgb(38, 20, 26)';
    c.fill();
    c.save();
    c.clip();
    const g = c.createRadialGradient(cx, cy, 1, cx, cy, 15);
    g.addColorStop(0, alpha(pal.boom, 0.95));
    g.addColorStop(1, alpha(pal.boom, 0));
    c.fillStyle = g;
    c.fillRect(0, 0, BRICK_W, BRICK_H);
    c.restore();
    c.strokeStyle = pal.boom;
    c.lineWidth = 1.1;
    c.stroke();
    c.fillStyle = '#ffe36b';
    star(c, cx, cy, 6.4, 8, 0.5);
    c.fill();
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(cx, cy, 2, 0, TAU);
    c.fill();
    return;
  }
  if (kind === 'p') {
    // с бонусом: переливается и несёт звёздочку
    const g = c.createLinearGradient(0, 0, BRICK_W, BRICK_H);
    g.addColorStop(0, pal.gift);
    g.addColorStop(0.55, pal.gift2);
    g.addColorStop(1, pal.gift3);
    rounded(c, pts, 2.4);
    c.fillStyle = g;
    c.fill();
    c.save();
    c.clip();
    const gl = c.createLinearGradient(0, 0, 0, BRICK_H * 0.55);
    gl.addColorStop(0, 'rgba(255, 255, 255, 0.5)');
    gl.addColorStop(1, 'rgba(255, 255, 255, 0)');
    c.fillStyle = gl;
    c.fillRect(0, 0, BRICK_W, BRICK_H * 0.55);
    c.restore();
    c.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    c.lineWidth = 0.8;
    c.stroke();
    c.fillStyle = '#ffffff';
    star(c, cx, cy, 6.4, 4, 0.32);
    c.fill();
    return;
  }
  // обычный и крепкий — в виде главы
  const col = kind === 'h' ? shade(color, (3 - state) * 0.17) : color;
  BODY[skin](c, pts, col, px, seed);
  if (kind === 'h') {
    // броня: двойная рамка и точки — сколько ударов осталось
    c.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    c.lineWidth = 1.1;
    rounded(c, inset(pts, 0.8), 1.4);
    c.stroke();
    c.fillStyle = 'rgba(0, 0, 0, 0.35)';
    for (let i = 0; i < state; i++) {
      c.beginPath();
      c.arc(cx + (i - (state - 1) / 2) * 5.2, cy + 0.5, 2.2, 0, TAU);
      c.fill();
    }
    c.fillStyle = '#ffffff';
    for (let i = 0; i < state; i++) {
      c.beginPath();
      c.arc(cx + (i - (state - 1) / 2) * 5.2, cy, 1.7, 0, TAU);
      c.fill();
    }
  }
}

// ---------- бонусы ----------

/** Короткая подпись под падающим бонусом. */
export const BONUS_LABELS = {
  split3: 'три шарика', split8: 'восемь', fast: 'быстрее', slow: 'медленнее', fire: 'огонь', rail: 'пробойник',
  small: 'мелкий', normal: 'обычный', catch: 'ловушка', laser: 'лазер', missile: 'ракеты', expand: 'шире',
  shrink: 'уже', bomb: 'бомба', life: '+1 шарик',
};

/** Значок бонуса в круге радиуса r с центром в нуле. */
export function bonusGlyph(c, type, r, color = '#ffffff') {
  const u = r / 10;
  c.save();
  c.scale(u, u);
  c.fillStyle = color;
  c.strokeStyle = color;
  c.lineWidth = 2.2;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  const dot = (x, y, d) => {
    c.beginPath();
    c.arc(x, y, d, 0, TAU);
    c.fill();
  };
  const line = (...p) => {
    c.beginPath();
    for (let i = 0; i < p.length; i += 2) (i ? c.lineTo(p[i], p[i + 1]) : c.moveTo(p[i], p[i + 1]));
    c.stroke();
  };
  const word = (str, size) => {
    c.font = `900 ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(str, 0, 0.8);
  };
  if (type === 'split3') word('×3', 15.5);
  else if (type === 'split8') word('×8', 15.5);
  else if (type === 'life') word('+1', 15.5);
  else if (type === 'fast') {
    c.lineWidth = 2.8;
    line(-6.5, -5, -1.5, 0, -6.5, 5);
    line(0.5, -5, 5.5, 0, 0.5, 5);
  } else if (type === 'slow') {
    c.lineWidth = 2.8;
    line(6.5, -5, 1.5, 0, 6.5, 5);
    line(-0.5, -5, -5.5, 0, -0.5, 5);
  } else if (type === 'fire') {
    c.beginPath();
    c.moveTo(0.4, -8);
    c.bezierCurveTo(6.5, -2, 7, 3, 4, 6.2);
    c.bezierCurveTo(1.8, 8.3, -2, 8.3, -4.2, 6.2);
    c.bezierCurveTo(-7, 3.2, -4, 0, -3, -3);
    c.bezierCurveTo(-1.4, -1.2, 0.2, -3.6, 0.4, -8);
    c.fill();
  } else if (type === 'rail') {
    c.lineWidth = 2.6;
    line(0, 7.5, 0, -6.5);
    line(-4.6, -2.4, 0, -7.2, 4.6, -2.4);
    c.lineWidth = 2;
    line(-7.5, 3, -3.4, 3);
    line(3.4, 3, 7.5, 3);
  } else if (type === 'small') {
    dot(0, 0, 2.3);
    c.lineWidth = 2;
    line(-8, 0, -5, 0);
    line(8, 0, 5, 0);
    line(0, -8, 0, -5);
    line(0, 8, 0, 5);
  } else if (type === 'normal') {
    c.lineWidth = 2.4;
    c.beginPath();
    c.arc(0, 0, 5.6, 0, TAU);
    c.stroke();
    dot(0, 0, 1.8);
  } else if (type === 'catch') {
    c.lineWidth = 3.4;
    c.lineCap = 'butt';
    c.beginPath();
    c.moveTo(-5.4, -6.5);
    c.lineTo(-5.4, 0.5);
    c.arc(0, 0.5, 5.4, Math.PI, 0, true);
    c.lineTo(5.4, -6.5);
    c.stroke();
  } else if (type === 'laser') {
    c.lineWidth = 2.8;
    line(-4.2, 7.5, -4.2, -7.5);
    line(4.2, 7.5, 4.2, -7.5);
  } else if (type === 'missile') {
    c.beginPath();
    c.moveTo(0, -8.5);
    c.lineTo(3.6, -2.2);
    c.lineTo(3.6, 4);
    c.lineTo(6.4, 7.6);
    c.lineTo(-6.4, 7.6);
    c.lineTo(-3.6, 4);
    c.lineTo(-3.6, -2.2);
    c.closePath();
    c.fill();
  } else if (type === 'expand') {
    c.lineWidth = 2.6;
    line(-7.5, 0, 7.5, 0);
    line(-4, -3.8, -7.8, 0, -4, 3.8);
    line(4, -3.8, 7.8, 0, 4, 3.8);
  } else if (type === 'shrink') {
    c.lineWidth = 2.6;
    line(-8, 0, -2, 0);
    line(2, 0, 8, 0);
    line(-5.6, -3.8, -1.8, 0, -5.6, 3.8);
    line(5.6, -3.8, 1.8, 0, 5.6, 3.8);
  } else if (type === 'bomb') {
    dot(-0.8, 1.8, 5.8);
    c.lineWidth = 2;
    line(2.6, -2.8, 5, -5.6);
    c.fillStyle = '#ffd23d';
    star(c, 6.2, -6.6, 2.6, 4, 0.4);
    c.fill();
  }
  c.restore();
}

/**
 * Падающий бонус радиуса r с центром в нуле: у каждого свой цвет и значок. Полезный — скруглённый квадрат,
 * вредный — красная «колючка», «обычный шарик» — круг. px — пикселей холста на единицу (для свечения).
 */
export function paintBonus(c, type, r, pal, px = 1) {
  const col = pal.bonus[type];
  const bad = BAD_BONUSES.includes(type);
  const shape = () => {
    if (bad) star(c, 0, 0, r, 9, 0.8);
    else if (type === 'normal') {
      c.beginPath();
      c.arc(0, 0, r * 0.94, 0, TAU);
    } else roundRect(c, -r * 0.9, -r * 0.9, r * 1.8, r * 1.8, r * 0.48);
  };
  c.save();
  c.shadowColor = col;
  c.shadowBlur = r * 0.55 * px;
  shape();
  c.fillStyle = col;
  c.fill();
  c.restore();
  const g = c.createLinearGradient(0, -r, 0, r);
  g.addColorStop(0, shade(col, bad ? 0.2 : 0.4));
  g.addColorStop(0.5, col);
  g.addColorStop(1, shade(col, bad ? -0.55 : -0.35));
  shape();
  c.fillStyle = g;
  c.fill();
  c.strokeStyle = 'rgba(0, 0, 0, 0.5)';
  c.lineWidth = r * 0.1;
  c.lineJoin = 'round';
  c.stroke();
  c.save();
  c.scale(0.86, 0.86);
  shape();
  c.restore();
  c.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  c.lineWidth = r * 0.075;
  c.stroke();
  const light = luma(col) > 0.72;
  bonusGlyph(c, type, r * 0.6, light ? 'rgb(30, 30, 40)' : '#ffffff');
}

// ---------- шарик и платформа ----------

/** Шарик радиуса r с центром в нуле и ореолом радиуса 2.1r. */
export function paintBall(c, r, color) {
  const halo = c.createRadialGradient(0, 0, r * 0.6, 0, 0, r * 2.1);
  halo.addColorStop(0, alpha(color, 0.42));
  halo.addColorStop(1, alpha(color, 0));
  c.fillStyle = halo;
  c.beginPath();
  c.arc(0, 0, r * 2.1, 0, TAU);
  c.fill();
  const g = c.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.42, color);
  g.addColorStop(1, shade(color, -0.42));
  c.fillStyle = g;
  c.beginPath();
  c.arc(0, 0, r, 0, TAU);
  c.fill();
  // тёмный ободок — шарик виден и на светлом месте фона (солнце, сияние)
  c.strokeStyle = 'rgba(0, 0, 0, 0.42)';
  c.lineWidth = r * 0.14;
  c.stroke();
}

/**
 * Платформа w × h (левый верхний угол — в нуле): металлический корпус, светящаяся сердцевина цвета кнопки темы,
 * торцы цвета главы. mode: '' | 'catch' | 'laser' | 'missile'.
 */
export function paintPaddle(c, w, h, { paddle, glow, good, px = 1, mode = '' }) {
  if (mode === 'laser' || mode === 'missile') {
    c.fillStyle = 'rgb(70, 78, 92)';
    if (mode === 'laser') {
      roundRect(c, 4.5, -7, 7, 10, 2);
      c.fill();
      roundRect(c, w - 11.5, -7, 7, 10, 2);
      c.fill();
      c.fillStyle = good;
      c.fillRect(6.5, -7, 3, 2.4);
      c.fillRect(w - 9.5, -7, 3, 2.4);
    } else {
      roundRect(c, w / 2 - 5, -9, 10, 12, 2.4);
      c.fill();
      c.fillStyle = 'rgb(255, 120, 60)';
      c.fillRect(w / 2 - 2, -9, 4, 2.6);
    }
  }
  c.save();
  c.shadowColor = glow;
  c.shadowBlur = 4 * px;
  roundRect(c, 0, 0, w, h, h / 2);
  const body = c.createLinearGradient(0, 0, 0, h);
  body.addColorStop(0, 'rgb(246, 249, 253)');
  body.addColorStop(0.45, 'rgb(170, 180, 198)');
  body.addColorStop(1, 'rgb(88, 98, 118)');
  c.fillStyle = body;
  c.fill();
  c.restore();
  // сердцевина
  const core = c.createLinearGradient(0, h * 0.24, 0, h * 0.76);
  core.addColorStop(0, shade(paddle, 0.45));
  core.addColorStop(0.5, paddle);
  core.addColorStop(1, shade(paddle, -0.3));
  roundRect(c, h * 0.95, h * 0.26, w - h * 1.9, h * 0.48, h * 0.24);
  c.fillStyle = core;
  c.fill();
  // торцы
  for (const x of [h / 2, w - h / 2]) {
    const g = c.createRadialGradient(x - h * 0.12, h * 0.38, h * 0.04, x, h / 2, h * 0.36);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.5, glow);
    g.addColorStop(1, shade(glow, -0.45));
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, h / 2, h * 0.32, 0, TAU);
    c.fill();
  }
  c.strokeStyle = 'rgba(255, 255, 255, 0.7)';
  c.lineWidth = 0.7;
  c.beginPath();
  c.moveTo(h * 0.6, 1.2);
  c.lineTo(w - h * 0.6, 1.2);
  c.stroke();
  if (mode === 'catch') {
    roundRect(c, 3, -2.6, w - 6, 3.8, 1.9);
    c.fillStyle = good;
    c.fill();
    c.fillStyle = 'rgba(255, 255, 255, 0.6)';
    roundRect(c, 6, -2, w - 12, 1.1, 0.5);
    c.fill();
  }
}

// ---------- фон главы ----------

function blob(c, x, y, r, col, a) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, alpha(col, a));
  g.addColorStop(1, alpha(col, 0));
  c.fillStyle = g;
  c.fillRect(x - r, y - r, r * 2, r * 2);
}

function glint(c, x, y, r, col) {
  c.fillStyle = col;
  star(c, x, y, r, 4, 0.14);
  c.fill();
}

/** Волнистый холм от левого до правого края: вершины на высоте y ± amp. */
function ridge(c, W, H, y, amp, r, step = 44) {
  c.beginPath();
  c.moveTo(0, H);
  c.lineTo(0, y + (r() - 0.5) * amp);
  for (let x = step; x <= W + step; x += step) {
    c.quadraticCurveTo(x - step / 2, y + (r() - 0.5) * amp * 2, x, y + (r() - 0.5) * amp);
  }
  c.lineTo(W, H);
  c.closePath();
}

const BACKDROP = [
  // Космос: туманности, звёзды, планета с кольцом
  (c, W, H, p, r) => {
    for (let i = 0; i < 4; i++) blob(c, r() * W, r() * H * 0.9, 140 + r() * 140, i % 2 ? p.glow : p.mist, 0.16 + r() * 0.14);
    for (let i = 0; i < 150; i++) {
      c.fillStyle = `rgba(255, 255, 255, ${0.25 + r() * 0.65})`;
      const s = 0.6 + r() * 1.5;
      c.fillRect(r() * W, r() * H, s, s);
    }
    for (let i = 0; i < 9; i++) glint(c, r() * W, r() * H, 4 + r() * 5, 'rgba(255, 255, 255, 0.85)');
    const x = r() < 0.5 ? 70 + r() * 80 : W - 70 - r() * 80;
    const y = 500 + r() * 90;
    const R = 44 + r() * 22;
    const g = c.createRadialGradient(x - R * 0.4, y - R * 0.4, R * 0.1, x, y, R);
    g.addColorStop(0, shade(p.ink, 0.45));
    g.addColorStop(1, shade(p.ink, -0.5));
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, R, 0, TAU);
    c.fill();
    c.strokeStyle = alpha(p.glow, 0.55);
    c.lineWidth = 5;
    c.beginPath();
    c.ellipse(x, y, R * 1.75, R * 0.4, -0.35, 0.12 * Math.PI, 0.88 * Math.PI);
    c.stroke();
    c.lineWidth = 1.6;
    c.strokeStyle = alpha(p.glow, 0.35);
    c.beginPath();
    c.ellipse(x, y, R * 2.05, R * 0.5, -0.35, 0.1 * Math.PI, 0.9 * Math.PI);
    c.stroke();
  },
  // Океан: лучи света, пузыри, дно с водорослями
  (c, W, H, p, r) => {
    for (let i = 0; i < 6; i++) {
      const x = r() * W;
      const w = 30 + r() * 60;
      const g = c.createLinearGradient(0, 0, 0, H * 0.8);
      g.addColorStop(0, alpha(p.mist, 0.16));
      g.addColorStop(1, alpha(p.mist, 0));
      c.fillStyle = g;
      path(c, [[x, 0], [x + w, 0], [x + w * 1.6 - 120, H * 0.8], [x - w * 0.6 - 120, H * 0.8]]);
      c.fill();
    }
    for (let i = 0; i < 46; i++) {
      const x = r() * W;
      const y = r() * H;
      const R = 2 + r() * 7;
      c.strokeStyle = alpha(p.mist, 0.14 + r() * 0.22);
      c.lineWidth = 1;
      c.beginPath();
      c.arc(x, y, R, 0, TAU);
      c.stroke();
      c.fillStyle = 'rgba(255, 255, 255, 0.3)';
      c.fillRect(x - R * 0.45, y - R * 0.5, 1.2, 1.2);
    }
    for (let i = 0; i < 5; i++) {
      const x = r() * W;
      const y = 480 + r() * 150;
      const s = (10 + r() * 12) * (r() < 0.5 ? 1 : -1);
      c.fillStyle = alpha(p.ink, 0.5);
      c.beginPath();
      c.ellipse(x, y, Math.abs(s), Math.abs(s) * 0.42, 0, 0, TAU);
      c.fill();
      path(c, [[x - s * 0.8, y], [x - s * 1.7, y - Math.abs(s) * 0.5], [x - s * 1.7, y + Math.abs(s) * 0.5]]);
      c.fill();
    }
    c.lineCap = 'round';
    for (let i = 0; i < 16; i++) {
      const x = r() * W;
      const h = 50 + r() * 110;
      c.strokeStyle = mix(p.ink, p.mist, 0.12 + r() * 0.14);
      c.lineWidth = 3 + r() * 4;
      c.beginPath();
      c.moveTo(x, H);
      c.bezierCurveTo(x - 18, H - h * 0.35, x + 18, H - h * 0.7, x - 6 + r() * 12, H - h);
      c.stroke();
    }
    c.fillStyle = p.ink;
    ridge(c, W, H, H - 26, 16, r);
    c.fill();
  },
  // Джунгли: косые лучи, стволы, листья по краям, лианы
  (c, W, H, p, r) => {
    for (let i = 0; i < 5; i++) {
      const x = r() * W * 1.2;
      c.fillStyle = alpha(p.mist, 0.05 + r() * 0.05);
      path(c, [[x, 0], [x + 50 + r() * 40, 0], [x - 220, H], [x - 300, H]]);
      c.fill();
    }
    for (let i = 0; i < 7; i++) {
      c.fillStyle = alpha(p.ink, 0.35);
      c.fillRect(r() * W, 0, 10 + r() * 26, H);
    }
    const leaf = (x, y, len, ang, col) => {
      c.save();
      c.translate(x, y);
      c.rotate(ang);
      c.fillStyle = col;
      c.beginPath();
      c.moveTo(0, 0);
      c.bezierCurveTo(len * 0.3, -len * 0.3, len * 0.8, -len * 0.22, len, 0);
      c.bezierCurveTo(len * 0.8, len * 0.22, len * 0.3, len * 0.3, 0, 0);
      c.fill();
      c.strokeStyle = alpha(p.mist, 0.18);
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(len * 0.95, 0);
      c.stroke();
      c.restore();
    };
    for (let i = 0; i < 9; i++) {
      const x = r() * W;
      const h = 60 + r() * 200;
      c.strokeStyle = mix(p.ink, p.mist, 0.12);
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(x, 0);
      c.bezierCurveTo(x + 14, h * 0.4, x - 14, h * 0.7, x + 4, h);
      c.stroke();
      for (let k = 0.25; k < 1; k += 0.25) leaf(x, h * k, 14, (k * 8) % 2 ? 0.5 : Math.PI - 0.5, mix(p.ink, p.mist, 0.2));
    }
    for (let i = 0; i < 14; i++) {
      const left = i % 2 === 0;
      leaf(left ? -8 : W + 8, 380 + r() * 340, 70 + r() * 80, left ? -0.6 + r() * 1.1 : Math.PI + 0.6 - r() * 1.1, mix(p.ink, p.mist, 0.06 + r() * 0.12));
    }
    for (let i = 0; i < 16; i++) {
      const x = r() * W;
      const y = 200 + r() * 480;
      blob(c, x, y, 9, p.glow, 0.5);
      c.fillStyle = p.glow;
      c.fillRect(x - 0.8, y - 0.8, 1.6, 1.6);
    }
  },
  // Пустыня: закат, солнце, барханы, пирамиды
  (c, W, H, p, r) => {
    for (let i = 0; i < 40; i++) {
      c.fillStyle = `rgba(255, 255, 255, ${0.2 + r() * 0.5})`;
      c.fillRect(r() * W, r() * 240, 1.2, 1.2);
    }
    const sx = 150 + r() * 320;
    blob(c, sx, 560, 250, p.mist, 0.5);
    // солнце — у самых барханов и не белое: над ним летает светлый шарик
    const sun = c.createLinearGradient(0, 500, 0, 620);
    sun.addColorStop(0, mix(p.glow, p.mist, 0.45));
    sun.addColorStop(1, mix(p.mist, p.bg2, 0.4));
    c.fillStyle = sun;
    c.beginPath();
    c.arc(sx, 566, 58, 0, TAU);
    c.fill();
    const far = mix(p.ink, p.mist, 0.3);
    for (const [x, s] of [[sx - 190 + r() * 40, 70], [sx + 150 + r() * 60, 52], [sx + 230, 34]]) {
      c.fillStyle = far;
      path(c, [[x - s, 590], [x, 590 - s * 0.95], [x + s, 590]]);
      c.fill();
      c.fillStyle = 'rgba(0, 0, 0, 0.3)';
      path(c, [[x, 590 - s * 0.95], [x + s, 590], [x + s * 0.25, 590]]);
      c.fill();
    }
    [[578, 22, 0.24], [612, 26, 0.12], [654, 30, 0]].forEach(([y, amp, k]) => {
      c.fillStyle = mix(p.ink, p.mist, k);
      ridge(c, W, H, y, amp, r, 120);
      c.fill();
    });
  },
  // Льды: северное сияние, звёзды, горы со снежными шапками
  (c, W, H, p, r) => {
    for (let i = 0; i < 70; i++) {
      c.fillStyle = `rgba(255, 255, 255, ${0.2 + r() * 0.6})`;
      c.fillRect(r() * W, r() * H * 0.8, 1.2, 1.2);
    }
    for (let k = 0; k < 3; k++) {
      const col = k === 1 ? p.glow : p.mist;
      const y0 = 60 + k * 90 + r() * 60;
      const f = 0.008 + r() * 0.008;
      const ph = r() * 6;
      for (let x = 0; x < W; x += 5) {
        const y = y0 + Math.sin(x * f + ph) * 46 + Math.sin(x * f * 2.7 + ph) * 14;
        const h = 110 + Math.sin(x * 0.05 + ph) * 36;
        const g = c.createLinearGradient(0, y, 0, y + h);
        g.addColorStop(0, alpha(col, 0));
        g.addColorStop(0.25, alpha(col, 0.2));
        g.addColorStop(1, alpha(col, 0));
        c.fillStyle = g;
        c.fillRect(x, y, 5.5, h);
      }
    }
    [[600, 0.34], [640, 0.16], [676, 0]].forEach(([base, k], layer) => {
      const pts = [[0, H]];
      let x = -30;
      while (x < W + 60) {
        const h = 40 + r() * (90 - layer * 22);
        pts.push([x, base], [x + 34 + r() * 20, base - h]);
        x += 70 + r() * 50;
      }
      pts.push([W + 60, base], [W, H]);
      c.fillStyle = mix(p.ink, p.glow, k * 0.5);
      path(c, pts);
      c.fill();
      c.fillStyle = alpha('rgb(255, 255, 255)', 0.5 - layer * 0.14);
      for (let i = 2; i < pts.length - 2; i += 2) {
        const [tx, ty] = pts[i];
        path(c, [[tx, ty], [tx - 12, ty + 20], [tx - 4, ty + 15], [tx + 2, ty + 22], [tx + 8, ty + 14], [tx + 14, ty + 20]]);
        c.fill();
      }
    });
  },
  // Вулкан: зарево, конус с лавой, дым, искры
  (c, W, H, p, r) => {
    blob(c, W / 2, H + 40, 420, p.mist, 0.6);
    for (let i = 0; i < 9; i++) blob(c, r() * W, 80 + r() * 380, 60 + r() * 90, 'rgb(120, 110, 110)', 0.07);
    const vx = 140 + r() * 340;
    c.fillStyle = p.ink;
    path(c, [[vx - 250, H], [vx - 46, 470], [vx - 22, 482], [vx, 474], [vx + 24, 484], [vx + 44, 470], [vx + 250, H]]);
    c.fill();
    blob(c, vx, 474, 70, p.glow, 0.7);
    c.strokeStyle = p.mist;
    c.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      c.lineWidth = 2 + r() * 3;
      const dx = -30 + i * 20;
      c.beginPath();
      c.moveTo(vx + dx, 482);
      c.bezierCurveTo(vx + dx * 2.2, 560, vx + dx * 2.6 - 20, 620, vx + dx * 4, H);
      c.stroke();
    }
    c.fillStyle = mix(p.ink, p.mist, 0.1);
    ridge(c, W, H, 690, 18, r, 70);
    c.fill();
    for (let i = 0; i < 50; i++) {
      c.fillStyle = alpha(i % 3 ? p.mist : p.glow, 0.3 + r() * 0.6);
      const s = 1 + r() * 1.8;
      c.fillRect(r() * W, 120 + r() * 580, s, s);
    }
  },
  // Неон: звёзды, полосатое солнце, силуэт города, сетка до горизонта
  (c, W, H, p, r) => {
    for (let i = 0; i < 60; i++) {
      c.fillStyle = alpha(i % 2 ? p.glow : p.mist, 0.25 + r() * 0.5);
      c.fillRect(r() * W, r() * 430, 1.3, 1.3);
    }
    const hy = 590;
    blob(c, W / 2, hy, 300, p.mist, 0.3);
    c.save();
    c.beginPath();
    c.rect(0, 0, W, hy);
    c.clip();
    const sun = c.createLinearGradient(0, hy - 150, 0, hy);
    sun.addColorStop(0, 'rgb(255, 232, 110)');
    sun.addColorStop(1, p.mist);
    c.fillStyle = sun;
    c.beginPath();
    c.arc(W / 2, hy - 10, 118, 0, TAU);
    c.fill();
    // прорези — только по самому солнцу
    c.clip();
    c.fillStyle = mix(p.bg, p.bg2, 0.5);
    for (let k = 0; k < 6; k++) c.fillRect(W / 2 - 130, hy - 18 - k * 19, 260, 3 + (5 - k) * 1.3);
    c.restore();
    c.fillStyle = p.ink;
    let x = 0;
    while (x < W) {
      const w = 16 + r() * 34;
      const h = 14 + r() * 70 * (Math.abs(x - W / 2) > 110 ? 1 : 0.35);
      c.fillRect(x, hy - h, w + 1, h);
      c.fillStyle = alpha(p.glow, 0.55);
      for (let k = 0; k < 3; k++) c.fillRect(x + 3 + r() * (w - 6), hy - h + 4 + r() * Math.max(1, h - 10), 1.6, 1.6);
      c.fillStyle = p.ink;
      x += w;
    }
    c.fillStyle = mix(p.bg, p.ink, 0.6);
    c.fillRect(0, hy, W, H - hy);
    c.strokeStyle = alpha(p.mist, 0.75);
    c.lineWidth = 1.2;
    for (let k = 0; k < 8; k++) {
      const y = hy + ((k / 7) ** 2.2) * (H - hy);
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(W, y);
      c.stroke();
    }
    for (let k = -12; k <= 12; k++) {
      c.beginPath();
      c.moveTo(W / 2 + k * 14, hy);
      c.lineTo(W / 2 + k * 120, H);
      c.stroke();
    }
    c.strokeStyle = alpha(p.glow, 0.9);
    c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(0, hy);
    c.lineTo(W, hy);
    c.stroke();
  },
  // Карамель: косые полосы, посыпка, спирали леденцов, глазурь внизу
  (c, W, H, p, r) => {
    for (let x = -H; x < W; x += 110) {
      c.fillStyle = alpha(p.mist, 0.055);
      path(c, [[x, H], [x + 55, H], [x + 55 + H * 0.6, 0], [x + H * 0.6, 0]]);
      c.fill();
    }
    for (let i = 0; i < 4; i++) {
      const x = r() * W;
      const y = 430 + r() * 230;
      const R = 34 + r() * 30;
      c.strokeStyle = alpha(i % 2 ? p.mist : p.glow, 0.16);
      c.lineWidth = 6;
      c.lineCap = 'round';
      c.beginPath();
      for (let a = 0; a < TAU * 2.6; a += 0.2) c.lineTo(x + Math.cos(a) * (a / (TAU * 2.6)) * R, y + Math.sin(a) * (a / (TAU * 2.6)) * R);
      c.stroke();
    }
    for (let i = 0; i < 80; i++) {
      c.save();
      c.translate(r() * W, r() * H);
      c.rotate(r() * TAU);
      c.fillStyle = alpha(p.tones[i % p.tones.length], 0.28 + r() * 0.25);
      roundRect(c, -4, -1.3, 8, 2.6, 1.3);
      c.fill();
      c.restore();
    }
    c.fillStyle = mix(p.ink, p.mist, 0.22);
    c.beginPath();
    c.moveTo(0, H);
    for (let x = 0; x <= W; x += 44) c.arc(x + 22, 706, 22, Math.PI, 0);
    c.lineTo(W, H);
    c.closePath();
    c.fill();
  },
  // Завод: чертёжная сетка, шестерни, трубы, предупреждающая полоса
  (c, W, H, p, r) => {
    for (let x = 0; x <= W; x += 22) {
      c.fillStyle = alpha(p.mist, x % 88 ? 0.05 : 0.13);
      c.fillRect(x, 0, 1, H);
    }
    for (let y = 0; y <= H; y += 22) {
      c.fillStyle = alpha(p.mist, y % 88 ? 0.05 : 0.13);
      c.fillRect(0, y, W, 1);
    }
    const gear = (x, y, R, teeth, a0) => {
      c.beginPath();
      for (let i = 0; i < teeth * 4; i++) {
        const a = a0 + (i / (teeth * 4)) * TAU;
        const d = i % 4 < 2 ? R : R * 0.82;
        c.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
      }
      c.closePath();
      c.moveTo(x + R * 0.36, y);
      c.arc(x, y, R * 0.36, 0, TAU, true);
      c.fill('evenodd');
    };
    c.fillStyle = alpha(p.mist, 0.14);
    gear(40 + r() * 60, 560 + r() * 60, 96, 12, r());
    gear(W - 60 - r() * 60, 470 + r() * 70, 70, 10, r());
    gear(W - 150 - r() * 60, 630, 46, 8, r());
    gear(200 + r() * 160, 250 + r() * 120, 58, 9, r());
    // трубы — выше платформы, чтобы она с ними не сливалась
    for (const y of [574, 600]) {
      const g = c.createLinearGradient(0, y, 0, y + 14);
      g.addColorStop(0, mix(p.ink, p.mist, 0.3));
      g.addColorStop(1, p.ink);
      c.fillStyle = g;
      c.fillRect(0, y, W, 14);
      c.fillStyle = mix(p.ink, p.mist, 0.38);
      for (let x = 30 + r() * 60; x < W; x += 130 + r() * 60) c.fillRect(x, y - 2, 8, 18);
    }
    c.save();
    c.beginPath();
    c.rect(0, 706, W, 14);
    c.clip();
    c.fillStyle = alpha(p.glow, 0.75);
    c.fillRect(0, 706, W, 14);
    c.fillStyle = 'rgba(0, 0, 0, 0.75)';
    for (let x = -20; x < W + 20; x += 28) {
      path(c, [[x, 720], [x + 14, 720], [x + 28, 706], [x + 14, 706]]);
      c.fill();
    }
    c.restore();
  },
  // Кристаллы: свечение, друзы по углам, искры
  (c, W, H, p, r) => {
    for (let i = 0; i < 5; i++) blob(c, r() * W, r() * H, 130 + r() * 130, i % 2 ? p.glow : p.mist, 0.14 + r() * 0.12);
    const shard = (x, y, len, w, ang, col) => {
      c.save();
      c.translate(x, y);
      c.rotate(ang);
      c.fillStyle = shade(col, 0.16);
      path(c, [[-w, 0], [0, -len], [0, 0]]);
      c.fill();
      c.fillStyle = shade(col, -0.3);
      path(c, [[w, 0], [0, -len], [0, 0]]);
      c.fill();
      c.strokeStyle = alpha(p.glow, 0.4);
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(-w, 0);
      c.lineTo(0, -len);
      c.stroke();
      c.restore();
    };
    for (let i = 0; i < 16; i++) {
      const left = i % 2 === 0;
      const x = left ? r() * 190 : W - r() * 190;
      shard(x, H + 4, 70 + r() * 170, 14 + r() * 18, (left ? 1 : -1) * (r() * 0.5 - 0.1), mix(p.ink, p.mist, 0.22 + r() * 0.3));
    }
    for (let i = 0; i < 8; i++) shard(r() * W, -4, 30 + r() * 60, 8 + r() * 10, Math.PI + (r() - 0.5) * 0.5, mix(p.ink, p.mist, 0.2));
    for (let i = 0; i < 22; i++) glint(c, r() * W, r() * H, 3 + r() * 6, alpha(i % 2 ? p.glow : 'rgb(255, 255, 255)', 0.5 + r() * 0.4));
  },
];

/** Фон поля W × H для главы: p — её цвета ({ bg, bg2, mist, ink, glow, tones }), level — номер уровня (узор свой). */
export function paintBackdrop(c, chapter, p, level, W, H, floorY) {
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, p.bg);
  g.addColorStop(1, p.bg2);
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  c.save();
  BACKDROP[chapter % BACKDROP.length](c, W, H, p, rnd(level * 7919 + 17));
  c.restore();
  // кирпичам нужен спокойный фон: верх слегка притушен, края затемнены
  const calm = c.createLinearGradient(0, 0, 0, H * 0.72);
  calm.addColorStop(0, 'rgba(0, 0, 0, 0.26)');
  calm.addColorStop(1, 'rgba(0, 0, 0, 0)');
  c.fillStyle = calm;
  c.fillRect(0, 0, W, H * 0.72);
  const v = c.createRadialGradient(W / 2, H * 0.45, H * 0.3, W / 2, H * 0.45, H * 0.8);
  v.addColorStop(0, 'rgba(0, 0, 0, 0)');
  v.addColorStop(1, 'rgba(0, 0, 0, 0.42)');
  c.fillStyle = v;
  c.fillRect(0, 0, W, H);
  // черта, за которой шарик потерян
  const fl = c.createLinearGradient(0, floorY - 10, 0, floorY + 12);
  fl.addColorStop(0, alpha(p.glow, 0));
  fl.addColorStop(0.45, alpha(p.glow, 0.3));
  fl.addColorStop(0.5, alpha(p.glow, 0.85));
  fl.addColorStop(0.55, alpha(p.glow, 0.3));
  fl.addColorStop(1, alpha(p.glow, 0));
  c.fillStyle = fl;
  c.fillRect(0, floorY - 10, W, 22);
  c.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  c.lineWidth = 1.5;
  c.strokeRect(0.75, 0.75, W - 1.5, H - 1.5);
}

/**
 * Живые мелочи поверх фона (рисуются каждый кадр простыми точками): что летает в главе.
 * kind: twinkle — мерцают на месте, rise — всплывают, fall — падают, drift — плывут вбок.
 */
export const AMBIENT = [
  { kind: 'twinkle', n: 16, size: [1.4, 2.6], color: 'white' },
  { kind: 'rise', n: 12, size: [2.2, 5], color: 'mist', ring: true, speed: 26 },
  { kind: 'drift', n: 11, size: [1.6, 2.6], color: 'glow', speed: 12 },
  { kind: 'drift', n: 16, size: [0.9, 1.6], color: 'glow', speed: 46 },
  { kind: 'fall', n: 24, size: [1.2, 2.6], color: 'white', speed: 34 },
  { kind: 'rise', n: 18, size: [1.1, 2.4], color: 'glow', speed: 44 },
  { kind: 'twinkle', n: 12, size: [1.4, 2.4], color: 'glow' },
  { kind: 'fall', n: 12, size: [1.6, 2.8], color: 'tones', speed: 18 },
  { kind: 'rise', n: 10, size: [1, 2], color: 'glow', speed: 60 },
  { kind: 'twinkle', n: 16, size: [1.6, 3], color: 'glow' },
];
