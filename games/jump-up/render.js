// Холст «Прыгалки вверх»: тетрадный лист, платформы, каракуля, враги и всё, что летит и сыплется.
// Рисунки — в art.js; здесь они один раз рисуются в картинки нужного размера (sprite), а в кадре только
// копируются. Живое (ноги, руки, глаза каракули, зрачки врагов, искры) дорисовывается линиями.
// Цвета — переменные --ju-* скина, читаются через пробный элемент (color-mix → rgb).
//
// Единицы — как в логике: лист шириной W, высота растёт вверх; на экране y = viewH − (y − камера).

import { W, CELL, JUMP, BODY_H, HOLE_TIME, score, wrapDist } from './logic.js';
import * as A from './art.js';

export const PALETTE_KEYS = ['paper', 'grid', 'margin', 'ink', 'dark', 'pencil', 'hero', 'doodle', 'white', 'blot', 'red', 'red2',
  'green', 'green2', 'blue', 'violet', 'yellow', 'pink', 'wood', 'metal', 'hole', 'eye', 'pupil'];

/** «rgb(r,g,b)» из того, что отдаёт браузер (результат color-mix он пишет как color(srgb r g b)). */
export function normalizeColor(c) {
  const m = String(c).match(/rgba?\(([^)]+)\)/);
  if (!m) {
    const s = String(c).match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)/);
    return s ? `rgb(${s.slice(1, 4).map((v) => Math.round(Number(v) * 255)).join(',')})` : String(c);
  }
  const [r, g, b] = m[1].split(/[ ,/]+/).map(Number);
  return `rgb(${r},${g},${b})`;
}

/** Цвета скина для холста: { paper: 'rgb(…)', … } — probe должен стоять внутри корня игры. */
export function readPalette(probe) {
  const out = {};
  for (const key of PALETTE_KEYS) {
    probe.style.color = `var(--ju-${key})`;
    out[key] = normalizeColor(getComputedStyle(probe).color);
  }
  return out;
}

const TAU = Math.PI * 2;
// Чёткость холста: точек на пиксель CSS — не больше этого (рисунок от руки от большего не выигрывает, а кадр
// дешевле). На слабом телефоне игра сама спускается на ступень ниже (lowerQuality) — картинка чуть мягче, зато плавно.
export const QUALITY = [2, 1.5, 1.15];
const BOIL = 0.15;                          // с: как часто «живая» линия меняет вариант
const MARK_EVERY = 50;                      // отметка высоты на полях — каждые столько клеток
const DOODLE_STEP = 230;                    // каракули на полях — примерно через столько единиц высоты
const ROCKET_SIZE = 1.5;                    // карандаш в полёте крупнее, чем лежит на платформе
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, k) => a + (b - a) * k;

function hash(n) {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

// Картинки: имя → [ширина, высота, якорь x, якорь y, вариантов, рисунок(перо, зерно)]. Якорь — точка рисунка (0, 0).
const SPRITES = {
  'plat-solid': [72, 22, 36, 4, 3, (g, v) => A.PLATFORMS.solid(g, v)],
  'plat-move': [88, 22, 44, 4, 3, (g, v) => A.PLATFORMS.move(g, v)],
  'plat-vert': [88, 22, 44, 4, 3, (g, v) => A.PLATFORMS.vert(g, v)],
  'plat-once': [72, 22, 36, 4, 2, (g, v) => A.PLATFORMS.once(g, v)],
  'plat-crumble': [72, 24, 36, 5, 2, (g, v) => A.PLATFORMS.crumble(g, v)],
  'crumb-0': [72, 24, 36, 5, 1, (g) => A.crumbleHalf(g, A.crumbleHalves()[0], 1)],
  'crumb-1': [72, 24, 36, 5, 1, (g) => A.crumbleHalf(g, A.crumbleHalves()[1], 1)],
  ground: [W + 16, 32, W / 2 + 8, 12, 1, (g) => A.ground(g, W)],
  spring0: [24, 20, 12, 17, 1, (g) => A.ITEMS.spring(g, 1, false)],
  spring1: [24, 36, 12, 33, 1, (g) => A.ITEMS.spring(g, 1, true)],
  eraser: [50, 20, 25, 16, 1, (g) => A.ITEMS.eraser(g)],
  plane: [52, 32, 26, 16, 1, (g) => A.ITEMS.plane(g)],
  rocket: [18, 56, 9, 29, 1, (g) => A.ITEMS.rocket(g)],
  star: [32, 32, 16, 28, 1, (g) => A.ITEMS.star(g)],
  hero: [52, 46, 26, 23, 3, (g, v) => A.heroBody(g, v)],
  blot: [72, 68, 36, 28, 2, (g, v) => A.blot(g, v)],
  two: [42, 52, 22, 27, 2, (g, v) => A.two(g, v)],
  hole: [74, 66, 37, 33, 1, (g) => A.hole(g, 1)],
  swirl: [92, 82, 46, 41, 1, (g) => A.swirl(g)],
  shield: [76, 76, 38, 38, 2, (g) => {
    g.oval(0, 0, 30, 31, { color: g.pal.yellow, w: 2.4, amp: 1 });
    g.oval(0, 0, 32, 30, { color: g.pal.yellow, w: 1.3, amp: 1.4 });
  }],
  flag: [26, 30, 5, 27, 1, (g) => {
    g.line(0, 0, 0.6, -24, { color: g.pal.red, w: 1.8 });
    g.fill([0.6, -24, 17, -19.5, 0.8, -13.5], g.pal.red, { smooth: false, amp: 0.3 });
  }],
};

export function createRenderer({ canvas, probe }) {
  const ctx = canvas.getContext('2d');
  let pal = readPalette(probe);
  let scale = 1;                            // пикселей CSS в единице мира
  let k = 1;                                // пикселей холста в единице мира
  let viewH = 640;
  let cssW = W;
  let cssH = 640;
  let quality = 0;                          // ступень чёткости: номер в QUALITY
  let clock = 0;                            // своё время рисовальщика (в паузе стоит)
  let view = 0;                             // камера на экране: обычно s.cam, после гибели едет вниз за каракулей
  let lastGame = null;
  const cache = new Map();

  // каракуля: то, что живёт между кадрами
  const hero = { sq: 0, sqV: 0, tilt: 0, face: 1, hairX: 0, hairY: 0, blink: 2, look: [0, 0] };
  let parts = [];                           // искры, крошки, капли, обломки
  let trail = [];                           // след самолётика / ракеты: [x, y]
  let trailAt = 0;
  const lastX = new Map();                  // где была двойка в прошлом кадре — куда она смотрит

  function reset() {
    Object.assign(hero, { sq: 0, sqV: 0, tilt: 0, face: 1, hairX: 0, hairY: 0, blink: 2, look: [0, 0] });
    parts = [];
    trail = [];
    lastX.clear();
    view = 0;
  }

  // ---------- картинки ----------

  function bake(w, h, ax, ay, paint, seed, colors = pal) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w * k));
    c.height = Math.max(1, Math.ceil(h * k));
    const x = c.getContext('2d');
    x.scale(k, k);
    x.translate(ax, ay);
    paint(A.createPen(x, colors, seed));
    return { c, w: c.width / k, h: c.height / k, ax, ay };
  }

  function sprite(name, variant = 0) {
    const spec = SPRITES[name];
    const v = variant % spec[4];
    const key = `${name}|${v}`;
    let s = cache.get(key);
    if (!s) {
      s = bake(spec[0], spec[1], spec[2], spec[3], (g) => spec[5](g, v + 1), v + 1);
      cache.set(key, s);
    }
    return s;
  }

  // каракуля на полях: тем же пером, но бледным цветом
  function doodle(name) {
    const key = `doodle|${name}`;
    let s = cache.get(key);
    if (!s) {
      s = bake(84, 84, 7, 7, (g) => A.DOODLES[name](g), name.length * 7 + name.charCodeAt(0), { ...pal, ink: pal.doodle });
      cache.set(key, s);
    }
    return s;
  }

  function startArrow() {
    let s = cache.get('start-arrow');
    if (!s) {
      s = bake(84, 84, 7, 7, (g) => A.startArrow(g), 5, { ...pal, ink: pal.doodle });
      cache.set('start-arrow', s);
    }
    return s;
  }

  // надпись почерком (цифры): картинка под нужную высоту строки и цвет
  function label(str, h, color, w = 1.9) {
    const key = `text|${str}|${h}|${color}`;
    let s = cache.get(key);
    if (!s) {
      s = bake(A.textWidth(str, h) + 8, h + 8, 4, 4, (g) => g.text(str, 0, 0, h, { color, w }), str.length * 31 + h);
      s.tw = A.textWidth(str, h);
      cache.set(key, s);
      // отметок высоты и счёта набирается много — старые не копим
      if (cache.size > 220) for (const old of cache.keys()) if (old.startsWith('text|') && old !== key) { cache.delete(old); break; }
    }
    return s;
  }

  const snap = (v) => Math.round(v * k) / k;
  /** Нарисовать картинку якорем в точку экрана (x, y); по желанию — с поворотом, растяжением и прозрачностью. */
  function put(s, x, y, { rot = 0, sx = 1, sy = 1, alpha = 1, crisp = false } = {}) {
    if (alpha <= 0) return;
    if (alpha < 1) ctx.globalAlpha = alpha;
    if (rot || sx !== 1 || sy !== 1) {
      ctx.save();
      ctx.translate(x, y);
      if (rot) ctx.rotate(rot);
      ctx.scale(sx, sy);
      ctx.drawImage(s.c, -s.ax, -s.ay, s.w, s.h);
      ctx.restore();
    } else if (crisp) ctx.drawImage(s.c, snap(x - s.ax), snap(y - s.ay), s.w, s.h);
    else ctx.drawImage(s.c, x - s.ax, y - s.ay, s.w, s.h);
    if (alpha < 1) ctx.globalAlpha = 1;
  }

  function stroke(color, width, alpha = 1) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = alpha;
  }

  // ---------- события игры → эффекты ----------

  function spray(n, make) {
    for (let i = 0; i < n; i++) parts.push({ t: 0, rot: 0, vr: 0, g: 900, size: 2, alpha: 1, ...make(i) });
    if (parts.length > 140) parts.splice(0, parts.length - 140);
  }

  function onEvent(e, s) {
    const p = s.p;
    if (e.type === 'jump' || e.type === 'spring' || e.type === 'eraser' || e.type === 'stomp') {
      hero.sqV = e.type === 'jump' ? -7.5 : -10;
      if (e.type === 'stomp') return stomped(e);
      // пыль из-под ног: пара чёрточек в стороны
      spray(e.type === 'jump' ? 4 : 7, (i) => {
        const dir = i % 2 ? 1 : -1;
        return {
          kind: 'tick', x: p.x + dir * (6 + Math.random() * 8), y: e.y + 1, vx: dir * (40 + Math.random() * 70), vy: 30 + Math.random() * 60,
          g: 260, life: 0.24 + Math.random() * 0.12, size: 3 + Math.random() * 2.5, color: pal.ink, rot: dir * 0.5,
        };
      });
      if (e.type === 'eraser') {
        spray(9, () => ({
          kind: 'crumb', x: p.x + (Math.random() - 0.5) * 30, y: e.y + 6, vx: (Math.random() - 0.5) * 220, vy: 80 + Math.random() * 200,
          life: 0.6, size: 1.6 + Math.random() * 1.6, color: Math.random() < 0.5 ? pal.pink : pal.blue,
        }));
      }
      if (e.type === 'spring') {
        spray(3, (i) => ({
          kind: 'arc', x: p.x, y: e.y + 6 + i * 7, vx: 0, vy: 40, g: 0, life: 0.3 + i * 0.05, size: 9 + i * 3, color: pal.dark,
        }));
      }
    } else if (e.type === 'crumble') {
      for (const half of [0, 1]) {
        parts.push({
          kind: 'sprite', name: `crumb-${half}`, x: e.x, y: e.y, vx: (half ? 1 : -1) * (30 + Math.random() * 30), vy: -40, g: 1500,
          t: 0, life: 0.9, rot: 0, vr: (half ? 1 : -1) * (1.5 + Math.random() * 2), size: 1, alpha: 1,
        });
      }
      spray(6, () => ({
        kind: 'crumb', x: e.x + (Math.random() - 0.5) * 40, y: e.y - 4, vx: (Math.random() - 0.5) * 120, vy: Math.random() * 60,
        life: 0.5, size: 1 + Math.random() * 1.4, color: pal.pencil,
      }));
    } else if (e.type === 'bump') stomped(e);
    else if (e.type === 'fly') {
      trail = [];
      spray(8, () => ({
        kind: 'tick', x: e.x + (Math.random() - 0.5) * 20, y: e.y + 10, vx: (Math.random() - 0.5) * 200, vy: -Math.random() * 120,
        g: 300, life: 0.4, size: 4, color: pal.pencil, rot: Math.random() * 3,
      }));
    } else if (e.type === 'flyend') {
      // самолётик улетает дальше сам, карандаш падает
      const plane = e.kind === 'plane';
      parts.push({
        kind: 'sprite', name: e.kind, x: p.x, y: p.y + (plane ? BODY_H + 14 : 20), vx: plane ? p.face * 260 : -p.face * 60, vy: plane ? 520 : 240,
        g: plane ? 120 : 1700, t: 0, life: 1.6, rot: plane ? -Math.PI / 2 : 0, vr: plane ? p.face * 1.1 : p.face * 5, size: 1, alpha: 1,
      });
    } else if (e.type === 'shield') {
      spray(8, (i) => {
        const a = (i / 8) * TAU;
        return { kind: 'tick', x: p.x + Math.cos(a) * 22, y: p.y + 18 + Math.sin(a) * 22, vx: Math.cos(a) * 130, vy: Math.sin(a) * 130, g: 0, life: 0.35, size: 5, color: pal.yellow, rot: a };
      });
    } else if (e.type === 'die' && e.cause !== 'fall' && e.cause !== 'hole') {
      spray(3, (i) => ({ kind: 'spin', x: 0, y: 0, vx: 0, vy: 0, g: 0, life: 1.6, size: 5, color: pal.yellow, rot: (i / 3) * TAU }));
    }
  }

  function stomped(e) {
    const color = e.kind === 'two' ? pal.red : pal.blot;
    parts.push({
      kind: 'squash', name: e.kind, x: e.x, y: e.y, vx: 0, vy: 60, g: 1500, t: 0, life: 0.55, rot: 0, vr: e.kind === 'two' ? 5 : 0, size: 1, alpha: 1,
    });
    spray(10, () => ({
      kind: 'crumb', x: e.x + (Math.random() - 0.5) * 30, y: e.y + (Math.random() - 0.5) * 16, vx: (Math.random() - 0.5) * 320,
      vy: 60 + Math.random() * 260, g: 1100, life: 0.7, size: 1.6 + Math.random() * 2.4, color,
    }));
  }

  /** Новый рекорд пройден: красные галочки от линии рекорда. */
  function recordBurst(s) {
    spray(12, () => ({
      kind: 'check', x: Math.random() * W, y: s.p.y + (Math.random() - 0.3) * 60, vx: (Math.random() - 0.5) * 80, vy: 60 + Math.random() * 120,
      g: 200, life: 1 + Math.random() * 0.5, size: 6 + Math.random() * 5, color: pal.red, rot: (Math.random() - 0.5) * 0.6,
    }));
  }

  // ---------- кадр ----------

  let Y = (y) => viewH - (y - view);

  function paper() {
    ctx.fillStyle = pal.paper;
    ctx.fillRect(0, 0, W, viewH);
    const px = 1 / scale;
    ctx.fillStyle = pal.grid;
    for (let x = 0; x <= W; x += CELL) ctx.fillRect(snap(x), 0, px, viewH);
    for (let y = Math.floor(view / CELL) * CELL; y <= view + viewH + CELL; y += CELL) ctx.fillRect(0, snap(Y(y)), W, px);
    ctx.fillStyle = pal.margin;
    ctx.fillRect(snap(W - 4 * CELL), 0, px * 1.5, viewH);
  }

  function doodles() {
    // у старта — стрелка вверх: куда прыгать
    const arrowY = Y(190);
    if (arrowY > -90 && arrowY < viewH + 90) put(startArrow(), W - 96, arrowY, { rot: 0.12, alpha: 0.9 });
    const first = Math.floor((view - 100) / DOODLE_STEP);
    const last = Math.ceil((view + viewH + 100) / DOODLE_STEP);
    for (let i = Math.max(1, first); i <= last; i++) {
      if (hash(i * 7 + 1) > 0.74) continue;
      const zone = A.zoneAt((i * DOODLE_STEP) / CELL);
      const name = zone.list[Math.floor(hash(i * 13 + 5) * zone.list.length)];
      const side = hash(i * 3 + 9);
      const size = 0.8 + hash(i * 11) * 0.45;
      const half = 39 * size;
      const x = side < 0.44 ? half + 4 + hash(i * 5) * 50 : side < 0.88 ? W - half - 4 - hash(i * 5) * 50 : 130 + hash(i * 5) * 100;
      put(doodle(name), x - 35 * size, Y(i * DOODLE_STEP + hash(i * 17) * 120) - 35 * size, { rot: (hash(i * 19) - 0.5) * 0.5, sx: size, sy: size, alpha: 0.85 });
    }
  }

  // отметки высоты на полях и линия рекорда
  function marks(best, top) {
    const first = Math.max(1, Math.floor(view / CELL / MARK_EVERY));
    const last = Math.ceil((view + viewH) / CELL / MARK_EVERY);
    for (let i = first; i <= last; i++) {
      const y = Y(i * MARK_EVERY * CELL);
      stroke(pal.pencil, 1.1, 0.7);
      ctx.beginPath();
      ctx.moveTo(W - 4 * CELL - 5, y + 0.6);
      ctx.lineTo(W - 4 * CELL + 9, y - 0.5);
      ctx.stroke();
      ctx.globalAlpha = 1;
      put(label(String(i * MARK_EVERY), 10, pal.pencil, 1.3), W - 4 * CELL + 14, y - 13, { alpha: 0.85 });
    }
    if (best >= 20) {
      const y = Y(best * CELL);
      if (y > -30 && y < viewH + 30) {
        const passed = top >= best * CELL;
        stroke(pal.red, 1.5, passed ? 0.3 : 0.75);
        ctx.setLineDash([7, 6]);
        ctx.beginPath();
        ctx.moveTo(26, y);
        ctx.lineTo(W - 4, y - 1);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        put(sprite('flag'), 12, y, { alpha: passed ? 0.4 : 1 });
        put(label(String(best), 10, pal.red, 1.3), 32, y - 15, { alpha: passed ? 0.4 : 0.9 });
      }
    }
  }

  const bump = (age, len) => (age >= 0 && age < len ? Math.sin((age / len) * Math.PI) : 0);

  function platforms(s) {
    for (const a of s.plats) {
      const y = Y(a.y);
      if (y < -40 || y > viewH + 60) continue;
      if (a.type === 'ground') {
        put(sprite('ground'), W / 2, y, { crisp: true });
        continue;
      }
      // по чему ездит: карандашный пунктир
      if (a.type === 'move' || a.type === 'vert') {
        stroke(pal.pencil, 1, 0.38);
        ctx.setLineDash([3, 5]);
        ctx.beginPath();
        if (a.type === 'move') {
          ctx.moveTo(a.bx - a.range - 31, y + 6.5);
          ctx.lineTo(a.bx + a.range + 31, y + 6.5);
        } else {
          ctx.moveTo(a.x, Y(a.by + a.range) - 4);
          ctx.lineTo(a.x, Y(a.by - a.range) + 17);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
      let alpha = 1;
      let size = 1;
      if (a.gone >= 0) {
        if (a.type === 'crumble') continue;               // обломки падают частицами
        const u = (s.t - a.gone) / 0.2;
        if (u >= 1) continue;
        alpha = 1 - u;
        size = 1 + u * 0.12;
      } else if (a.back >= 0 && s.t - a.back < 0.3) alpha = (s.t - a.back) / 0.3;
      const sink = bump(s.t - a.hit, 0.16) * 3;
      const still = a.type !== 'move' && a.type !== 'vert';
      put(sprite(`plat-${a.type}`, a.id), a.x, y + sink, { alpha, sx: size, sy: size, crisp: still && !sink && size === 1 });
      const it = a.item;
      if (!it || it.taken || a.gone >= 0) continue;
      const ix = a.x + it.ox;
      if (it.kind === 'spring') put(sprite(s.t - it.hit < 0.3 && it.hit >= 0 ? 'spring1' : 'spring0'), ix, y + sink + 1);
      else if (it.kind === 'eraser') put(sprite('eraser'), ix, y + sink + 1, { sy: 1 - bump(s.t - it.hit, 0.22) * 0.45 });
      else if (it.kind === 'star') put(sprite('star'), ix, y - 2 + Math.sin(clock * 3 + a.id) * 1.5, { rot: Math.sin(clock * 2 + a.id) * 0.12 });
      else if (it.kind === 'plane') put(sprite('plane'), ix, y - 14 + Math.sin(clock * 2.4 + a.id) * 1.6, { rot: -0.5 + Math.sin(clock * 1.7) * 0.05 });
      else if (it.kind === 'rocket') put(sprite('rocket'), ix, y - 26 + Math.sin(clock * 2.4 + a.id) * 1.2, { rot: 0.1 });
    }
  }

  function pupil(x, y, r, tx, ty, reach, color) {
    const d = Math.hypot(tx, ty) || 1;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + (tx / d) * Math.min(reach, d * 0.02 + reach * 0.6), y + (ty / d) * Math.min(reach, d * 0.02 + reach * 0.6), r, 0, TAU);
    ctx.fill();
  }

  function foes(s) {
    const frame = Math.floor(clock / BOIL);
    const hx = s.p.x;
    const hy = Y(s.p.y + BODY_H / 2);
    for (const f of s.foes) {
      const y0 = Y(f.y);
      if (y0 < -80 || y0 > viewH + 80 || f.dead >= 0) continue;
      const tx = wrapDist(f.x, hx);
      if (f.kind === 'hole') {
        const pulse = 1 + Math.sin(clock * 3) * 0.03;
        put(sprite('swirl'), f.x, y0, { rot: -clock * 1.5 });
        put(sprite('hole'), f.x, y0, { sx: pulse, sy: pulse });
        continue;
      }
      if (f.kind === 'blot') {
        const y = y0 + Math.sin(clock * 2.3 + f.id) * 2.6;
        put(sprite('blot', frame + f.id), f.x, y);
        for (const [ex, ey] of A.BLOT_EYES) pupil(f.x + ex, y + ey + 0.6, 2.2, tx - ex, hy - y - ey, 1.9, pal.blot);
        continue;
      }
      const before = lastX.get(f.id) ?? f.x;
      const dir = f.x > before + 0.01 ? -1 : f.x < before - 0.01 ? 1 : (lastX.get(-f.id) ?? 1);
      lastX.set(f.id, f.x);
      lastX.set(-f.id, dir);
      const y = y0 + Math.abs(Math.sin(clock * 6 + f.id)) * -3;
      put(sprite('two', frame + f.id), f.x, y, { sx: dir, rot: Math.sin(clock * 6 + f.id) * 0.07 * dir });
      pupil(f.x + A.TWO_EYE[0] * dir, y + A.TWO_EYE[1], 1.5, tx, hy - y, 1.2, pal.pupil);
    }
  }

  // ---------- каракуля ----------

  function limb(x0, y0, x1, y1, bend, width, color) {
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    const d = Math.hypot(x1 - x0, y1 - y0) || 1;
    stroke(color, width);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(mx - ((y1 - y0) / d) * bend, my + ((x1 - x0) / d) * bend, x1, y1);
    ctx.stroke();
  }

  function drawHero(s, dt, cx, feetY, o) {
    const p = s.p;
    const dying = s.phase !== 'play';
    const frame = Math.floor(clock / BOIL);
    const v = clamp(p.vy / JUMP, -1.6, 2.1);
    const fly = p.fly?.kind ?? null;

    // пружинка сжатия: приземлился — сплющило, потом вытянуло
    if (o.calm) hero.sq = hero.sqV = 0;
    else {
      hero.sqV += (-hero.sq * 260 - hero.sqV * 17) * dt;
      hero.sq = clamp(hero.sq + hero.sqV * dt, -0.34, 0.3);
    }
    const sy = 1 + hero.sq + (fly ? 0.06 : Math.abs(v) * 0.07);
    const sx = 1 - (sy - 1) * 0.75;
    const lean = clamp(p.mv / 1300, -0.32, 0.32);
    hero.tilt += (lean - hero.tilt) * Math.min(1, dt * 14);
    // лицо поворачивается плавно: палец то и дело дёргается туда-сюда, а глаза скакать не должны
    hero.face += (p.face - hero.face) * Math.min(1, dt * 11);
    hero.hairX += (-p.mv / 900 - hero.hairX) * Math.min(1, dt * 9);
    hero.hairY += (clamp(-v, -1, 1) - hero.hairY) * Math.min(1, dt * 9);
    hero.blink -= dt;
    if (hero.blink < -0.11) hero.blink = 2.2 + Math.random() * 2.6;

    const rx = A.HERO.w / 2;
    const ry = A.HERO.h / 2;
    const tuck = fly ? 0.2 : 1 - clamp(Math.abs(p.vy) / 520, 0, 1);       // у вершины прыжка ноги поджаты
    const leg = 8.5 - 3.2 * tuck + Math.max(0, hero.sq) * 3;
    const by = feetY - leg - ry * sy;                                      // середина тела
    let spin = hero.tilt + (p.flip > 0 ? (1 - p.flip) * TAU * p.face : 0);
    let size = 1;
    if (dying && s.cause === 'hole') {
      const u = clamp(s.dieT / HOLE_TIME, 0, 1);
      spin += u * u * 14;
      size = 1 - u * 0.92;
    } else if (dying && s.cause !== 'fall') spin += s.dieT * 7 * p.face;

    ctx.save();
    ctx.translate(cx, by);
    ctx.rotate(spin);
    ctx.scale(size, size);

    // след щита — под каракулей
    if (p.shield > 0 && (p.shield > 2.5 || Math.floor(clock * 7) % 2)) put(sprite('shield', frame), 0, 2, { alpha: 0.9 });
    // полёт кончается — самолётик трясёт, у карандаша пропадает пламя: пора смотреть, куда приземляться
    const ending = p.fly && p.fly.left < 0.7;
    if (fly === 'rocket') {
      // карандаш за спиной: остриё над головой, из-под ластика пламя — два неровных языка
      const rx0 = -p.face * 11;
      const tail = 2 + 23.6 * ROCKET_SIZE;
      if (!ending || Math.floor(clock * 14) % 2) {
        const fl = 20 + Math.sin(clock * 47) * 5 + Math.random() * 5;
        for (const [col, w, len] of [[pal.red, 7.5, fl], [pal.yellow, 4, fl * 0.62]]) {
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.moveTo(rx0 - w, tail - 2);
          ctx.quadraticCurveTo(rx0 - w * 0.6, tail + len * 0.5, rx0 + (Math.random() - 0.5) * 4, tail + len);
          ctx.quadraticCurveTo(rx0 + w * 0.6, tail + len * 0.5, rx0 + w, tail - 2);
          ctx.fill();
        }
      }
      put(sprite('rocket'), rx0, 2, { sx: ROCKET_SIZE, sy: ROCKET_SIZE, rot: ending ? Math.sin(clock * 40) * 0.06 : 0 });
    }

    // ноги
    const c = pal.hero;
    const spread = fly ? 5 : 6.5 + tuck * 2.5 - Math.max(0, v) * 1.2;
    const trailX = -hero.tilt * 9;
    for (const side of [-1, 1]) {
      const hipX = side * 6 * sx;
      const hipY = ry * sy - 3;
      const footX = side * spread + trailX;
      const footY = ry * sy + leg;
      limb(hipX, hipY, footX, footY, side * (2 + tuck * 3.5), 2, c);
      stroke(c, 2.1);
      ctx.beginPath();
      ctx.moveTo(footX, footY);
      ctx.lineTo(footX + (hero.face * 3.6 + side * 0.8), footY + (v > 0.4 ? 1.6 : 0));
      ctx.stroke();
    }

    put(sprite('hero', frame), 0, 0, { sx, sy });

    // руки: вверх, когда падает; вниз, когда взлетает; держат самолётик или обнимают карандаш
    for (const side of [-1, 1]) {
      const shX = side * (rx - 3) * sx;
      const shY = -1;
      let hx;
      let hy;
      if (fly === 'plane') {
        hx = side * 5;
        hy = -ry * sy - 13;
      } else if (fly === 'rocket') {
        // одна рука держит карандаш за спиной, другая — вперёд, как у супергероя
        hx = side === -p.face ? side * (rx + 1) : side * (rx + 6);
        hy = side === -p.face ? -7 : -15;
      } else if (dying && s.cause !== 'hole') {
        hx = side * (rx + 8);
        hy = -13 + Math.sin(clock * 24 + side) * 3;
      } else {
        const up = clamp((1 - v) / 2, 0, 1);                               // 0 — летит вверх, 1 — падает
        hx = side * (rx + 5 + up * 3);
        hy = lerp(8, -12, up) + (up > 0.7 ? Math.sin(clock * 20 + side * 2) * 2 : 0);
      }
      limb(shX, shY, hx, hy, side * (fly ? 2 : 3), 1.9, c);
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(hx, hy, 1.9, 0, TAU);
      ctx.fill();
    }

    // хохолок: завиток, который отстаёт от движения
    stroke(c, 1.7);
    ctx.beginPath();
    const topY = -ry * sy + 1.5;
    const hxk = hero.hairX * 9;
    const hyk = hero.hairY * 3;
    ctx.moveTo(-1, topY);
    ctx.bezierCurveTo(-3 + hxk * 0.5, topY - 7 + hyk, 5 + hxk, topY - 12 + hyk, 6 + hxk, topY - 6 + hyk);
    ctx.bezierCurveTo(6.5 + hxk, topY - 2.5 + hyk, 1.5 + hxk, topY - 3 + hyk, 3 + hxk, topY - 6.5 + hyk);
    ctx.stroke();

    // глаза
    const face = hero.face;
    const scared = !fly && (p.vy < -1050 || (dying && s.cause === 'fall'));
    const er = (scared ? 6.5 : 5.7) * (0.96 + sy * 0.04);
    const lookX = clamp(face * 0.55 + p.mv / 900, -1, 1);
    const lookY = fly ? -0.8 : clamp(-v * 0.8, -1, 1);
    hero.look[0] += (lookX - hero.look[0]) * Math.min(1, dt * 12);
    hero.look[1] += (lookY - hero.look[1]) * Math.min(1, dt * 12);
    const eyeY = -3.2 * sy;
    for (const side of [-1, 1]) {
      const ex = side * 6.4 * sx + face * 2.4;
      if (dying && s.cause !== 'fall' && s.cause !== 'hole') {
        // крестики
        stroke(pal.eye, 2.2);
        ctx.beginPath();
        ctx.moveTo(ex - 3.4, eyeY - 3.4);
        ctx.lineTo(ex + 3.4, eyeY + 3.4);
        ctx.moveTo(ex + 3.4, eyeY - 3.4);
        ctx.lineTo(ex - 3.4, eyeY + 3.4);
        ctx.stroke();
        continue;
      }
      if (hero.blink < 0 && !scared) {
        stroke(pal.eye, 1.9);
        ctx.beginPath();
        ctx.moveTo(ex - 4.4, eyeY + 0.5);
        ctx.quadraticCurveTo(ex, eyeY + 3, ex + 4.4, eyeY + 0.5);
        ctx.stroke();
        continue;
      }
      ctx.fillStyle = pal.eye;
      ctx.beginPath();
      ctx.ellipse(ex, eyeY, er * (1 - 0.03 * (side * face + 1)), er * 1.05, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = pal.pupil;
      ctx.beginPath();
      ctx.arc(ex + hero.look[0] * 2.5, eyeY + hero.look[1] * 2.6, scared ? 1.7 : 2.5, 0, TAU);
      ctx.fill();
    }
    // рот: улыбка, «о» в падении, до ушей — на пружинке и в полёте
    const mx = face * 2.6;
    const my = 6.3 * sy;
    if (scared || (dying && s.cause === 'hole')) {
      ctx.fillStyle = pal.eye;
      ctx.beginPath();
      ctx.ellipse(mx, my + 0.6, 2.3, 2.9, 0, 0, TAU);
      ctx.fill();
    } else if (fly || v > 1.15) {
      ctx.fillStyle = pal.eye;
      ctx.beginPath();
      ctx.moveTo(mx - 4.6, my - 0.8);
      ctx.quadraticCurveTo(mx, my + 6.4, mx + 4.6, my - 0.8);
      ctx.closePath();
      ctx.fill();
    } else if (!dying) {
      stroke(pal.eye, 1.6);
      ctx.beginPath();
      ctx.moveTo(mx - 3.4, my);
      ctx.quadraticCurveTo(mx, my + 2.8, mx + 3.4, my);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    if (fly === 'plane') {
      put(sprite('plane'), 0, -ry * sy - 27, { rot: -Math.PI / 2 + Math.sin(clock * (ending ? 38 : 5)) * (ending ? 0.22 : 0.1), sx: 1.2, sy: 1.2 });
    }
    ctx.restore();
  }

  function heroAt(s, dt, o) {
    const p = s.p;
    const y = Y(p.y);
    if (y < -90 || y > viewH + 90) return;
    drawHero(s, dt, p.x, y, o);
    // у края листа каракуля видна и с другой стороны
    if (p.x < 34) drawHero(s, 0, p.x + W, y, o);
    else if (p.x > W - 34) drawHero(s, 0, p.x - W, y, o);
  }

  function flightTrail(s, dt) {
    const p = s.p;
    if (p.fly) {
      trailAt -= dt;
      if (trailAt <= 0) {
        trailAt = 0.028;
        trail.push([p.x - (p.fly.kind === 'rocket' ? p.face * 11 : 0), p.y + (p.fly.kind === 'plane' ? 4 : -22)]);
        if (trail.length > 26) trail.shift();
      }
    } else if (trail.length) trail.splice(0, Math.max(1, Math.ceil(dt * 70)));
    if (trail.length < 2) return;
    stroke(pal.pencil, 1.5, 0.75);
    ctx.beginPath();
    for (let i = 1; i < trail.length; i += 2) {
      const a = trail[i - 1];
      const b = trail[i];
      if (Math.abs(a[0] - b[0]) > W / 2) continue;
      ctx.moveTo(a[0], Y(a[1]));
      ctx.lineTo(b[0], Y(b[1]));
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function particles(s, dt) {
    const keep = [];
    for (const q of parts) {
      q.t += dt;
      if (q.t >= q.life) continue;
      q.vy -= q.g * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.rot += q.vr * dt;
      const u = q.t / q.life;
      const fade = u < 0.6 ? 1 : 1 - (u - 0.6) / 0.4;
      const y = Y(q.y);
      keep.push(q);
      if (q.kind === 'sprite') put(sprite(q.name), q.x, y, { rot: q.rot, alpha: fade });
      else if (q.kind === 'squash') put(sprite(q.name), q.x, y, { rot: q.rot, sy: Math.max(0.15, 1 - u * 1.6), sx: 1 + u * 0.5, alpha: fade });
      else if (q.kind === 'crumb') {
        ctx.fillStyle = q.color;
        ctx.globalAlpha = fade;
        ctx.beginPath();
        ctx.ellipse(q.x, y, q.size, q.size * 0.8, q.t * 5, 0, TAU);
        ctx.fill();
      } else if (q.kind === 'tick') {
        stroke(q.color, 1.5, fade * 0.9);
        ctx.beginPath();
        ctx.moveTo(q.x - Math.cos(q.rot) * q.size * 0.5, y - Math.sin(q.rot) * q.size * 0.5);
        ctx.lineTo(q.x + Math.cos(q.rot) * q.size * 0.5, y + Math.sin(q.rot) * q.size * 0.5);
        ctx.stroke();
      } else if (q.kind === 'arc') {
        stroke(q.color, 1.6, fade);
        ctx.beginPath();
        ctx.arc(q.x, y + q.size * 0.9, q.size, Math.PI * 1.22, Math.PI * 1.78);
        ctx.stroke();
      } else if (q.kind === 'check') {
        stroke(q.color, 2, fade);
        ctx.beginPath();
        ctx.moveTo(q.x - q.size * 0.5, y);
        ctx.lineTo(q.x - q.size * 0.15, y + q.size * 0.45);
        ctx.lineTo(q.x + q.size * 0.6, y - q.size * 0.6);
        ctx.stroke();
      } else if (q.kind === 'spin') {
        // звёздочки над оглушённой каракулей
        const a = q.rot + q.t * 6;
        const sx0 = s.p.x + Math.cos(a) * 17;
        const sy0 = Y(s.p.y + BODY_H + 9) + Math.sin(a) * 5;
        stroke(q.color, 1.8, fade);
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const b = (i / 4) * Math.PI;
          ctx.moveTo(sx0 - Math.cos(b) * q.size * 0.6, sy0 - Math.sin(b) * q.size * 0.6);
          ctx.lineTo(sx0 + Math.cos(b) * q.size * 0.6, sy0 + Math.sin(b) * q.size * 0.6);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    parts = keep;
  }

  // скруглённый прямоугольник (ctx.roundRect есть не на всех телефонах)
  function rounded(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // счёт — наклейкой в углу: цифры своим почерком
  function hud(s) {
    const str = String(score(s));
    const text = label(str, 22, pal.ink, 2.2);
    const w = text.tw + 18;
    ctx.fillStyle = pal.paper;
    ctx.globalAlpha = 0.92;
    rounded(8, 8, w, 32, 9);
    ctx.fill();
    ctx.globalAlpha = 1;
    stroke(pal.ink, 1.6);
    rounded(8, 8, w, 32, 9);
    ctx.stroke();
    put(text, 17, 13);
  }

  function countdown(n) {
    ctx.fillStyle = pal.paper;
    ctx.globalAlpha = 0.6;
    ctx.fillRect(0, 0, W, viewH);
    ctx.globalAlpha = 1;
    const into = n - Math.floor(n);                       // 1 → 0 за секунду
    const size = 1 + Math.max(0, into - 0.86) * 1.6;
    const text = label(String(Math.max(1, Math.ceil(n))), 84, pal.red, 6);
    put(text, W / 2 - (text.tw / 2) * size, viewH * 0.4 - 42 * size, { sx: size, sy: size });
  }

  /**
   * Нарисовать кадр. dt — сколько прошло (0 — стоим: пауза, окно). o: best — рекорд в клетках (линия на листе),
   * count — отсчёт после паузы (секунды или −1), calm — «уменьшить движение».
   */
  function frame(s, dt, o = {}) {
    if (s !== lastGame) {
      lastGame = s;
      reset();
      view = s.cam;
    }
    clock += o.calm ? 0 : dt;
    // камера: за живой каракулей — жёстко; за упавшей — догоняет вниз, платформы уезжают вверх
    if (s.phase === 'play' || s.cause === 'hole') view = s.cam;
    else {
      const target = Math.min(s.cam, s.p.y - viewH * 0.62);
      view += (target - view) * (o.calm ? 1 : Math.min(1, dt * 7));
    }
    Y = (y) => viewH - (y - view);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    paper();
    doodles();
    marks(o.best ?? 0, s.top);
    platforms(s);
    foes(s);
    flightTrail(s, dt);
    heroAt(s, dt, o);
    if (o.calm) parts = [];
    else particles(s, dt);
    hud(s);
    if (o.count > 0) countdown(o.count);
  }

  const density = () => Math.min(QUALITY[quality], window.devicePixelRatio || 1);

  /** Размер холста под место width × height (пиксели CSS); возвращает высоту экрана в единицах мира. */
  function resize(width, height) {
    cssW = Math.max(1, width);
    cssH = Math.max(1, height);
    scale = cssW / W;
    const dpr = density();
    const next = scale * dpr;
    if (Math.abs(next - k) > 1e-6) cache.clear();
    k = next;
    viewH = cssH / scale;
    canvas.width = Math.max(1, Math.round(cssW * dpr));
    canvas.height = Math.max(1, Math.round(cssH * dpr));
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    return viewH;
  }

  /** Кадры не успевают — холст на ступень грубее. false — грубее некуда (или экран и так не чётче). */
  function lowerQuality() {
    const before = density();
    while (quality < QUALITY.length - 1) {
      quality += 1;
      if (density() < before - 0.01) {
        resize(cssW, cssH);
        return true;
      }
    }
    return false;
  }

  /** Картинка одной вещи для справки: имя из списка картинок → холст size×size (CSS-пикселей). */
  function icon(name, size = 44) {
    const spec = SPRITES[name];
    const dpr = Math.min(QUALITY[0], window.devicePixelRatio || 1);
    const fit = Math.min(size / spec[0], size / spec[1]);
    const c = document.createElement('canvas');
    c.width = Math.round(size * dpr);
    c.height = Math.round(size * dpr);
    c.style.width = `${size}px`;
    c.style.height = `${size}px`;
    const x = c.getContext('2d');
    x.scale(dpr, dpr);
    x.translate((size - spec[0] * fit) / 2, (size - spec[1] * fit) / 2);
    x.scale(fit, fit);
    x.translate(spec[2], spec[3]);
    spec[5](A.createPen(x, pal, 1), 1);
    return c;
  }

  return {
    frame,
    resize,
    onEvent,
    recordBurst,
    icon,
    reset,
    lowerQuality,
    get quality() { return quality; },
    get scale() { return scale; },
    get viewH() { return viewH; },
    get palette() { return pal; },
    setSkin() {
      pal = readPalette(probe);
      cache.clear();
    },
  };
}
