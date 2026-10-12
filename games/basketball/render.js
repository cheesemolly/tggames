// Холст «Баскетбола»: сцена за корзинами (небо и слои с глубиной — scenes.js), корзины (кольцо и сетка, которая
// тянется за мячом и качается), мяч-шар (ball.js), пунктир прицела, огонь серии, искры и надписи.
// Всё неподвижное (слои сцены, цифры табло, надписи) один раз рисуется в заготовки и в кадре только копируется;
// живое — линиями и кружками, без теней и градиентов. Мяч считается по точкам: он вертится в объёме.
// Цвета — переменные --bk-* скина, читаются через пробный элемент (color-mix → rgb).
//
// Единицы — как в логике: ширина W, высота растёт вверх; на экране y = viewH − (y − view).

import { W, R, RIM, NET_H, NET_W, SEAT, CAM_AT, VIEW_MAX, PULL_MIN, heatOf } from './logic.js';
import { LOOKS, hash2, drawScore, scoreWidth } from './art.js';
import { SCENES, paintSky, layerSize } from './scenes.js';
import { createBall, identity, rotate, settle as tidy } from './ball.js';

export const PALETTE_KEYS = ['sky0', 'sky1', 'sky2', 'sky3', 'sky4', 'far', 'mid', 'near', 'lit', 'lit2', 'orb', 'orb2', 'cloud',
  'cloud2', 'star', 'deco', 'deco2', 'deco3', 'ghost', 'rail', 'rim', 'rim2', 'net', 'net2', 'ball', 'ball2', 'ball3', 'ball4', 'gloss',
  'aim', 'ink', 'ink2', 'fire1', 'fire2', 'fire3', 'hot1', 'hot2', 'hot3', 'smoke', 'spark'];

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

/** Цвета скина для холста: { sky0: 'rgb(…)', … } — probe должен стоять внутри корня игры. */
export function readPalette(probe) {
  const out = {};
  for (const key of PALETTE_KEYS) {
    probe.style.color = `var(--bk-${key})`;
    out[key] = normalizeColor(getComputedStyle(probe).color);
  }
  return out;
}

const TAU = Math.PI * 2;
// Чёткость холста: точек на пиксель CSS — не больше этого. На слабом телефоне игра сама спускается на ступень
// ниже (lowerQuality) — картинка чуть мягче, зато плавно.
export const QUALITY = [2, 1.5, 1.15];
const FONT = (size) => `800 ${size}px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
const RY = 8.5;                             // «высота» кольца на экране: смотрим на него чуть сверху
const NCOL = 10;                            // узлов сетки по кругу
const NROW = 3;                             // и рядов сверху вниз
const STRETCH = 24;                         // на сколько сетка оттягивается при полной силе
const POP_IN = 0.3;                         // корзина появляется
const POP_OUT = 0.3;                        // и убирается
const SKY_STEP = 2;                         // точка полоски неба — столько единиц высоты
const BACK_FPS = 15;                        // столько раз в секунду обновляется сцена, пока экран стоит
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, k) => a + (b - a) * k;
const rand = (a, b) => a + Math.random() * (b - a);
const backOut = (u) => 1 + 2.4 * (u - 1) ** 3 + 1.4 * (u - 1) ** 2;

export function createRenderer({ canvas, probe }) {
  const ctx = canvas.getContext('2d');
  let pal = readPalette(probe);
  let look = LOOKS.telegram;
  let scale = 1;                            // пикселей CSS в единице мира
  let k = 1;                                // пикселей холста в единице мира
  let viewH = 640;
  let cssW = W;
  let cssH = 640;
  let quality = 0;                          // ступень чёткости: номер в QUALITY
  let clock = 0;                            // время рисовальщика (в паузе стоит)
  let wave = 0;                             // время «живых» мелочей: при «уменьшить движение» стоит
  let view = 0;                             // нижний край экрана в мире
  let lastGame = null;
  const cache = new Map();
  const vis = new Map();                    // корзины на экране: id → то, что живёт между кадрами
  // мяч: где он, как повёрнут (матрица) и как вертится (ось × скорость, рад/с; оси экрана: x вправо, y вниз, z к нам)
  const ball = { x: 0, y: 0, vx: 0, vy: 0, turn: identity(), spin: [0, 0, 0], drawn: '', sq: 0, sqV: 0, axis: 0, heat: 0, held: true, hold: null };
  let flames = [];                          // язычки пламени
  let puffs = [];                           // дым
  let parts = [];                           // искры и чёрточки
  let pops = [];                            // надписи над корзиной
  let debt = 0;                             // сколько язычков пора добавить
  let smoke = 0;
  let frames = 0;
  const board = { str: '', at: -9 };        // счёт на табло и когда он сменился
  const back = { c: null, g: null, climb: NaN, at: -9, stale: true };   // сцена на своём холсте

  let Y = (y) => viewH - (y - view);

  // ---------- заготовки ----------

  /** Картинка w × h единиц: paint рисует в ней от левого верхнего угла. res — доля чёткости (далёкое — грубее). */
  function bake(w, h, paint, res = 1) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w * k * res));
    c.height = Math.max(1, Math.ceil(h * k * res));
    const g = c.getContext('2d');
    g.scale(c.width / w, c.height / h);
    paint(g);
    return { c, w, h };
  }

  function cached(key, make) {
    let s = cache.get(key);
    if (!s) {
      s = make();
      cache.set(key, s);
    }
    return s;
  }

  function scoreSprite(str, h) {
    return cached(`score|${str}|${h}`, () => {
      const w = scoreWidth(str, h) + h * 0.09;
      return bake(w + 4, h + 4, (g) => {
        g.translate(2, 2);
        drawScore(g, str, h, pal.ghost);
      });
    });
  }

  /** Надпись: заливка fill, контур edge — картинкой под нужный размер. */
  function label(text, size, fill, edge) {
    return cached(`text|${text}|${size}|${fill}`, () => {
      ctx.save();
      ctx.font = FONT(size);
      const tw = ctx.measureText(text).width;
      ctx.restore();
      const pad = size * 0.3;
      const s = bake(tw + pad * 2, size * 1.25 + pad * 2, (g) => {
        g.translate(pad, pad);
        g.font = FONT(size);
        g.textBaseline = 'top';
        g.lineJoin = 'round';
        g.lineWidth = size * 0.26;
        g.strokeStyle = edge;
        g.strokeText(text, 0, size * 0.1);
        g.fillStyle = fill;
        g.fillText(text, 0, size * 0.1);
      });
      // надписей и счёта набирается много — старые не копим
      if (cache.size > 200) {
        for (const old of cache.keys()) {
          if (old.startsWith('text|') || old.startsWith('score|')) {
            cache.delete(old);
            break;
          }
        }
      }
      return s;
    });
  }

  function stroke(color, width, alpha = 1) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = alpha;
  }

  // ---------- сцена ----------
  // Сцена (небо и все слои) рисуется не прямо в кадр, а на свой холст — и перерисовывается, только когда экран
  // едет вверх; пока он стоит, её живые мелочи (облака, птицы, огоньки) обновляются BACK_FPS раз в секунду.
  // В кадре сцена — одна готовая картинка.

  const scene = () => SCENES[look.scene];

  /** Небо: цвет зависит от высоты — чем выше поднялся, тем ближе ночь (или космос). */
  function sky(g, climb) {
    const sc = scene();
    const top = sc.sky[sc.sky.length - 1][0] + VIEW_MAX + 40;
    const strip = cached('sky', () => {
      const c = document.createElement('canvas');
      c.width = 1;
      c.height = Math.ceil(top / SKY_STEP);
      paintSky(c.getContext('2d'), sc, pal, c.height, top);
      return { c };
    });
    const from = clamp(climb * sc.skyRate, 0, top - viewH);
    const n = strip.c.height;
    g.drawImage(strip.c, 0, (1 - (from + viewH) / top) * n, 1, (viewH / top) * n, 0, 0, W, viewH);
  }

  const layerSprite = (L, i, variant = 0) => cached(`layer|${i}|${variant}`, () => {
    const [w, h] = layerSize(L, variant);
    return bake(w, h, (g) => L.paint(g, pal, w, h, variant + 1), L.soft ? 0.5 : 1);
  });
  /** Насколько слой проявился на этом подъёме (fade: [от, до]). */
  const shown = (L, climb) => (L.fade ? clamp((climb - L.fade[0]) / (L.fade[1] - L.fade[0]), 0, 1) : 1);

  function layer(g, L, i, climb) {
    const lift = climb * L.rate;            // на сколько слой уже уехал вниз
    if (L.kind === 'band') {
      const step = L.every ?? 0;
      const last = step ? Math.floor(((L.until ?? Infinity) - L.at) / step) : 0;
      const lo = step ? Math.max(0, Math.ceil((lift - L.at - L.h) / step)) : 0;
      const hi = step ? Math.min(last, Math.floor((lift + viewH - L.at) / step)) : 0;
      for (let n = lo; n <= hi; n++) {
        const bottom = L.at + n * step - lift;
        if (bottom > viewH || bottom + L.h < 0) continue;
        const s = layerSprite(L, i, L.variants ? n % L.variants : 0);
        g.drawImage(s.c, 0, viewH - bottom - L.h, W, L.h);
      }
    } else if (L.kind === 'one') {
      const bottom = L.at - lift;
      if (bottom > viewH || bottom + L.h < 0) return;
      const s = layerSprite(L, i);
      g.drawImage(s.c, L.x * W - L.w / 2, viewH - bottom - L.h, L.w, L.h);
    } else if (L.kind === 'many') {
      const tall = L.w[1] * L.ratio;
      const lo = Math.max(0, Math.floor((lift - tall - L.from) / L.every) - 1);
      const hi = Math.floor((lift + viewH - L.from) / L.every);
      if (L.dim) g.globalAlpha = lerp(1, L.dim[2], clamp((climb - L.dim[0]) / (L.dim[1] - L.dim[0]), 0, 1));
      for (let n = lo; n <= hi; n++) {
        const at = L.from + (n + hash2(n, i * 17 + 1)) * L.every;
        if (at > L.to) break;
        const variant = Math.floor(hash2(n, i * 17 + 2) * L.variants);
        const [w, h] = layerSize(L, variant);
        const bottom = at - lift;
        if (bottom > viewH || bottom + h < 0) continue;
        // плывёт вбок и, уйдя за край, возвращается с другой стороны
        const span = W + w;
        const dir = hash2(n, i * 17 + 4) < 0.5 ? -1 : 1;
        const x = ((((hash2(n, i * 17 + 3) * span + wave * L.drift * dir) % span) + span) % span) - w;
        g.drawImage(layerSprite(L, i, variant).c, x, viewH - bottom - h, w, h);
      }
      g.globalAlpha = 1;
    } else if (L.kind === 'tile') {
      const alpha = shown(L, climb);
      if (alpha <= 0) return;
      const s = layerSprite(L, i);
      g.globalAlpha = alpha;
      for (let y = viewH + (lift % L.h) - L.h; y > -L.h; y -= L.h) g.drawImage(s.c, 0, y, W, L.h);
      g.globalAlpha = 1;
    } else if (L.kind === 'twinkle') {
      const alpha = shown(L, climb);
      if (alpha <= 0) return;
      const lo = Math.max(lift, L.from ?? -Infinity);
      const hi = Math.min(lift + viewH, L.to ?? Infinity);
      g.fillStyle = pal[L.color];
      for (let row = Math.floor(lo / L.cell); row * L.cell < hi; row++) {
        for (let col = 0; col * L.cell < W; col++) {
          const seed = hash2(row * 131 + col, i + 5);
          // вспышка камеры — редкая и короткая, звезда — мерцает плавно
          const beat = Math.sin(wave * (L.quick ? 1.3 + seed * 2.4 : 0.9 + seed * 1.6) + seed * 40);
          const glow = L.quick ? Math.max(0, beat) ** 30 : 0.35 + 0.65 * Math.max(0, beat);
          if (glow < 0.06) continue;
          const at = (row + hash2(row, col * 7 + i)) * L.cell;
          if (at < lo || at > hi) continue;
          const x = (col + hash2(col, row * 5 + i + 1)) * L.cell;
          const r = L.size * (0.5 + 0.5 * glow);
          const y = viewH - (at - lift);
          g.globalAlpha = alpha * glow;
          g.beginPath();
          // четырёхлучевая искорка
          g.moveTo(x - r * 1.7, y);
          g.quadraticCurveTo(x, y, x, y - r * 1.7);
          g.quadraticCurveTo(x, y, x + r * 1.7, y);
          g.quadraticCurveTo(x, y, x, y + r * 1.7);
          g.quadraticCurveTo(x, y, x - r * 1.7, y);
          g.fill();
        }
      }
      g.globalAlpha = 1;
    }
  }

  function scenery(calm) {
    // сколько поднялись: в начале партии низ экрана — это «земля» сцены
    const climb = Math.max(0, view + viewH * CAM_AT);
    if (!back.c) {
      back.c = document.createElement('canvas');
      back.g = back.c.getContext('2d');
    }
    const resized = back.c.width !== canvas.width || back.c.height !== canvas.height;
    const moved = Math.abs(climb - back.climb) > 0.03;
    const due = !calm && clock - back.at >= 1 / BACK_FPS;
    if (resized || moved || due || back.stale) {
      if (resized) {
        back.c.width = canvas.width;
        back.c.height = canvas.height;
      }
      back.g.setTransform(k, 0, 0, k, 0, 0);
      sky(back.g, climb);
      scene().layers.forEach((L, i) => layer(back.g, L, i, climb));
      Object.assign(back, { climb, at: clock, stale: false });
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(back.c, 0, 0);
    ctx.setTransform(k, 0, 0, k, 0, 0);
  }

  // ---------- корзины: что живёт между кадрами ----------

  /** Запись о корзине (заводится, когда корзина впервые попадает в кадр). */
  function seen(b, born = clock) {
    let v = vis.get(b.id);
    if (!v) {
      v = { id: b.id, ang: b.a, angV: 0, nx: 0, ny: 0, nvx: 0, nvy: 0, born, gone: -1, flash: -9, path: null };
      vis.set(b.id, v);
    }
    v.x = b.x;
    v.y = b.y;
    v.a = b.a;
    // путь ездящей корзины виден, пока она ездит
    v.path = b.mv ? { ...b.mv, bx: b.bx, by: b.by } : null;
    return v;
  }

  function reset(s) {
    vis.clear();
    flames = [];
    puffs = [];
    parts = [];
    pops = [];
    debt = smoke = 0;
    Object.assign(ball, { turn: rotate(rotate(identity(), 1, 0, 0, -0.5), 0, 1, 0, 0.6), spin: [0, 0, 0], drawn: '', sq: 0, sqV: 0, axis: 0, heat: 0, held: true });
    board.str = '';
    board.at = -9;
    if (!s) return;
    view = s.from.y - viewH * CAM_AT;
    seen(s.from, -9);
    seen(s.to, -9);
  }

  /** Пружина: значение key тянется к target (K — жёсткость, D — затухание). */
  function spring(v, key, vel, target, K, D, h) {
    v[vel] += (-(v[key] - target) * K - v[vel] * D) * h;
    v[key] += v[vel] * h;
  }

  /** Качание корзин: кольцо поворачивается за прицелом и выпрямляется, сетка тянется за мячом и болтается. */
  function sway(s, dt, o) {
    const pull = s.phase === 'aim' ? o.pull : null;
    for (const v of vis.values()) {
      let ang = v.a ?? 0;
      let ny = 0;
      const held = pull && v.id === s.from.id;
      if (held && o.aim) {
        ang = Math.atan2(-o.aim.dx, o.aim.dy);
        ny = -(5 + o.aim.power * STRETCH);
      } else if (held) ny = -5 * Math.min(1, Math.hypot(pull.px, pull.py) / PULL_MIN);
      if (o.calm) {
        Object.assign(v, { ang, angV: 0, nx: 0, ny, nvx: 0, nvy: 0 });
        continue;
      }
      // под пальцем корзина слушается сразу, без него — качается
      const [ka, da, kn, dn] = held ? [1100, 62, 1100, 62] : [260, 12, 430, 17];
      const n = Math.max(1, Math.ceil(dt * 120));
      for (let i = 0; i < n; i++) {
        spring(v, 'ang', 'angV', ang, ka, da, dt / n);
        spring(v, 'nx', 'nvx', 0, kn, dn, dt / n);
        spring(v, 'ny', 'nvy', ny, kn, dn, dt / n);
      }
      v.ang = clamp(v.ang, -1.6, 1.6);
      v.nx = clamp(v.nx, -34, 34);
      v.ny = clamp(v.ny, -40, 70);
    }
  }

  /** Куда попал мяч в координатах корзины (x вдоль кольца, y вверх) и с какой скоростью. */
  function inBasket(v, e, tilt) {
    const ca = Math.cos(tilt);
    const sa = Math.sin(tilt);
    const dx = e.x - v.x;
    const dy = e.y - v.y;
    return { lx: dx * ca + dy * sa, ly: dy * ca - dx * sa, vx: e.vx * ca + e.vy * sa, vy: e.vy * ca - e.vx * sa };
  }

  // ---------- события игры → эффекты ----------

  function spray(n, make) {
    for (let i = 0; i < n; i++) parts.push({ kind: 'tick', t: 0, g: 900, rot: 0, vr: 0, size: 3, ...make(i) });
    if (parts.length > 120) parts.splice(0, parts.length - 120);
  }

  function puff(x, y, n, speed = 60) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      puffs.push({ x: x + Math.cos(a) * 6, y: y + Math.sin(a) * 6, vx: Math.cos(a) * rand(10, speed), vy: Math.sin(a) * rand(10, speed) + 40, t: 0, life: rand(0.45, 0.8), size: rand(4, 7) });
    }
    if (puffs.length > 60) puffs.splice(0, puffs.length - 60);
  }

  /** Удар закручивает мяч: к его вращению добавляется случайное, тем сильнее, чем сильнее удар. */
  function knock(v) {
    const kick = clamp(v / 500, 0.2, 1.4);
    for (let i = 0; i < 3; i++) ball.spin[i] += rand(-5, 5) * kick;
  }

  /** Мяч лёг в сетку: она провисает под ним и качается. */
  function settle(v, e, tilt) {
    const hit = inBasket(v, e, tilt);
    v.ang = tilt;
    v.nx = clamp(hit.lx / 0.6, -30, 30);
    v.ny = clamp((hit.ly + SEAT) / 0.72, -10, 14);
    v.nvx = clamp(hit.vx * 0.3, -260, 260);
    v.nvy = clamp(hit.vy * 0.42, -520, 0);
    v.angV += clamp(-hit.vx * 0.004 - hit.lx * 0.06, -3, 3);
    ball.sq = -0.16;
    ball.axis = Math.PI / 2;
  }

  /**
   * Событие игры. text — что написать над корзиной после попадания: { main: '+3', note: 'Чисто ×2' }.
   */
  function onEvent(e, s, text = null) {
    if (e.type === 'shoot') {
      const v = vis.get(s.from.id);
      if (v) v.nvy += 420 + 560 * e.power;
      ball.spin = flightSpin(s.ball.vx, s.ball.vy);
    } else if (e.type === 'wall') {
      ball.sqV = -9 * clamp(e.v / 600, 0.3, 1);
      ball.axis = 0;
      knock(e.v);
      spray(4, () => ({
        x: e.side < 0 ? 1 : W - 1, y: e.y + rand(-8, 8), vx: -e.side * rand(30, 110), vy: rand(-40, 120), g: 500,
        life: rand(0.2, 0.34), size: rand(3, 5), color: pal.gloss, rot: Math.random() * 3,
      }));
    } else if (e.type === 'rim') {
      const v = vis.get(e.id);
      if (v) v.angV -= e.side * clamp(e.v / 380, 0.2, 2.6);
      ball.sqV = -7 * clamp(e.v / 600, 0.2, 1);
      ball.axis = Math.atan2(-(s.ball.y - e.y), s.ball.x - e.x);
      knock(e.v);
      if (e.v > 120) {
        spray(3, () => ({
          x: e.x, y: e.y, vx: rand(-120, 120), vy: rand(40, 190), g: 700, life: rand(0.16, 0.3), size: rand(2.5, 4.5),
          color: pal.spark, rot: Math.random() * 3,
        }));
      }
    } else if (e.type === 'net') {
      const v = vis.get(e.id);
      if (v) v.nvx += (v.x > e.x ? 1 : -1) * clamp(e.v * 0.25, 20, 160);
    } else if (e.type === 'back') {
      const v = vis.get(e.id);
      if (v) settle(v, e, 0);
      if (e.was >= 1) puff(e.x, e.y + 8, 7);
    } else if (e.type === 'miss') {
      if (e.was >= 1) puff(e.x, e.y, 8);
    } else if (e.type === 'score') {
      const v = vis.get(e.id);
      if (v) {
        settle(v, e, e.tilt);
        v.flash = clock;
      }
      const old = vis.get(e.old);
      if (old) old.gone = clock;
      seen(s.to, clock + 0.14);
      board.at = clock;
      // серия оборвалась — огонь гаснет
      if (e.was >= 1 && e.heat === 0) puff(e.x, e.y + 10, 8);
      const hot = e.heat >= 2;
      const colors = e.heat === 3 ? [pal.hot2, pal.hot3] : hot ? [pal.fire2, pal.fire3] : [pal.spark, pal.gloss];
      if (e.clean) {
        spray(hot ? 16 : 9, (i) => {
          const a = Math.PI * (0.12 + 0.76 * Math.random());
          const v0 = rand(120, hot ? 330 : 250);
          return {
            kind: i % 3 ? 'dot' : 'star', x: e.x + rand(-RIM, RIM), y: s.from.y + 2, vx: Math.cos(a) * v0, vy: Math.sin(a) * v0, g: 520,
            life: rand(0.4, 0.75), size: rand(2, 4.2), color: colors[i % 2], rot: Math.random() * 3, vr: rand(-6, 6),
          };
        });
      } else {
        spray(5, () => ({
          x: e.x + rand(-RIM, RIM), y: s.from.y, vx: rand(-90, 90), vy: rand(60, 170), g: 600, life: rand(0.2, 0.36),
          size: rand(3, 5), color: pal.net, rot: Math.random() * 3,
        }));
      }
      if (text) {
        const big = e.heat >= 2 || e.pts >= 4;
        const fill = e.heat === 3 ? pal.hot2 : e.heat === 2 ? pal.fire2 : e.clean ? pal.spark : pal.ink;
        pops.push({ text: text.main, size: big ? 34 : 28, fill, x: s.from.x, y: s.from.y + 52, t: 0, life: 1.05 });
        if (text.note) pops.push({ text: text.note, size: 15, fill: pal.ink, x: s.from.x, y: s.from.y + 34, t: -0.06, life: 1.05 });
        if (pops.length > 8) pops.splice(0, pops.length - 8);
      }
    }
  }

  /** Новый рекорд: искры от табло. */
  function recordBurst() {
    spray(18, (i) => ({
      kind: i % 2 ? 'star' : 'dot', x: W / 2 + rand(-90, 90), y: view + viewH * 0.82 + rand(-30, 30), vx: rand(-120, 120), vy: rand(20, 220),
      g: 380, life: rand(0.7, 1.2), size: rand(2.5, 5), color: i % 3 ? pal.spark : pal.gloss, rot: Math.random() * 3, vr: rand(-5, 5),
    }));
  }

  // ---------- кадр ----------

  /** Счёт — большими цифрами табло, полупрозрачными, за корзинами. */
  function scoreboard(score, calm) {
    const str = String(score);
    if (str !== board.str) {
      if (board.str === '') board.at = -9;
      board.str = str;
    }
    let h = Math.round(clamp(viewH * 0.2, 80, 124));
    while (h > 40 && scoreWidth(str, h) > W - 60) h -= 6;
    const s = scoreSprite(str, h);
    const bump = calm ? 0 : Math.max(0, 1 - (clock - board.at) / 0.3);
    const size = 1 + 0.14 * bump * bump;
    ctx.save();
    ctx.translate(W / 2, clamp(viewH * 0.085, 30, 70) + h / 2);
    ctx.scale(size, size);
    ctx.globalAlpha = 0.2 + 0.25 * bump;
    ctx.drawImage(s.c, -s.w / 2, -s.h / 2, s.w, s.h);
    ctx.restore();
  }

  /** Насколько корзина «есть»: 0 — ещё нет или уже убрана, 1 — стоит. Заодно размер при появлении и уходе. */
  function presence(v, calm) {
    if (v.gone >= 0) {
      const u = calm ? 1 : (clock - v.gone) / POP_OUT;
      return u >= 1 ? null : { alpha: 1 - u, size: 1 - 0.3 * u };
    }
    const u = calm ? 1 : (clock - v.born) / POP_IN;
    if (u <= 0) return null;
    return u >= 1 ? { alpha: 1, size: 1 } : { alpha: Math.min(1, u * 2.5), size: Math.max(0.05, backOut(u)) };
  }

  /** Путь ездящей корзины — пунктир из точек. */
  function paths() {
    ctx.setLineDash([0.1, 7.5]);
    for (const v of vis.values()) {
      const m = v.path;
      if (!m || !v.show) continue;
      stroke(pal.rail, 2.7, v.show.alpha * 0.5);
      ctx.beginPath();
      if (m.sh) ctx.ellipse(m.bx, Y(m.by), Math.abs(m.rx), Math.abs(m.ry), 0, 0, TAU);
      else {
        ctx.moveTo(m.bx - m.rx, Y(m.by - m.ry));
        ctx.lineTo(m.bx + m.rx, Y(m.by + m.ry));
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  /** Кольца сетки сверху вниз: [x, y, полуширина, «высота»] в координатах корзины (y вниз). hold — мяч в сетке. */
  function rings(v, hold) {
    const bx = v.nx;
    const by = NET_H - v.ny;
    const out = [];
    for (let j = 0; j <= NROW; j++) {
      const t = j / NROW;
      const x = bx * t * t;                 // низ сетки уходит вбок сильнее верха
      const y = by * t;
      let rx = RIM - 1.5 - (RIM - 1.5 - NET_W) * t ** 0.85;
      if (hold) {
        // сетка облегает мяч
        const dy = y - hold[1];
        if (Math.abs(dy) < R) rx = Math.max(rx, Math.abs(hold[0] - x) + Math.sqrt(R * R - dy * dy) + 1.4);
      }
      out.push([x, y, rx, rx * (RY / RIM) * (1 - 0.3 * t)]);
    }
    return out;
  }

  function netPath(net, front) {
    ctx.beginPath();
    for (let j = 0; j < NROW; j++) {
      const a = net[j];
      const b = net[j + 1];
      for (let i = 0; i < NCOL; i++) {
        const th0 = ((i + (j % 2) * 0.5) / NCOL) * TAU;
        for (const d of [-0.5, 0.5]) {
          const th1 = th0 + (d / NCOL) * TAU;
          // ближняя половина сетки (на экране — нижняя) рисуется поверх мяча, дальняя — под ним
          if ((Math.sin((th0 + th1) / 2) >= 0) !== front) continue;
          ctx.moveTo(a[0] + a[2] * Math.cos(th0), a[1] + a[3] * Math.sin(th0));
          ctx.lineTo(b[0] + b[2] * Math.cos(th1), b[1] + b[3] * Math.sin(th1));
        }
      }
    }
    const z = net[NROW];
    ctx.moveTo(z[0] + (front ? z[2] : -z[2]), z[1]);
    ctx.ellipse(z[0], z[1], z[2], z[3], 0, front ? 0 : Math.PI, front ? Math.PI : TAU);
  }

  /** Половина корзины: дальняя (под мячом) — задняя дужка и задняя сетка; ближняя — поверх мяча. */
  function basket(v, front, hold) {
    const p = v.show;
    if (!p) return;
    ctx.save();
    ctx.translate(v.x, Y(v.y));
    ctx.rotate(-v.ang);
    ctx.scale(p.size, p.size);
    const net = rings(v, hold);
    if (!front) {
      stroke(pal.net2, 1.2, p.alpha);
      netPath(net, false);
      ctx.stroke();
      // дальняя дужка: тёмная, с бликом по верхней кромке
      stroke(pal.rim2, 5.4, p.alpha);
      ctx.beginPath();
      ctx.ellipse(0, 0, RIM + 1, RY, 0, Math.PI, TAU);
      ctx.stroke();
      stroke(pal.rim, 1.6, p.alpha * 0.8);
      ctx.beginPath();
      ctx.ellipse(0, -1.3, RIM + 0.4, RY - 0.4, 0, Math.PI * 1.08, Math.PI * 1.92);
      ctx.stroke();
    } else {
      // нити сетки — с тёмной подложкой: видны и на светлом небе
      stroke(pal.ink2, 2.6, p.alpha * 0.28);
      netPath(net, true);
      ctx.stroke();
      stroke(pal.net, 1.4, p.alpha);
      ctx.stroke();
      // ближняя дужка — круглая труба: тёмный низ, цвет, блик сверху
      stroke(pal.rim2, 7.6, p.alpha);
      ctx.beginPath();
      ctx.ellipse(0, 0, RIM + 1, RY, 0, 0, Math.PI);
      ctx.stroke();
      stroke(pal.rim, 4.8, p.alpha);
      ctx.beginPath();
      ctx.ellipse(0, -0.5, RIM + 1, RY, 0, 0, Math.PI);
      ctx.stroke();
      stroke(pal.gloss, 1.3, p.alpha * 0.6);
      ctx.beginPath();
      ctx.ellipse(0, -1.7, RIM + 0.6, RY - 0.2, 0, Math.PI * 0.12, Math.PI * 0.88);
      ctx.stroke();
      // попадание: кольцо на миг вспыхивает
      const flash = 1 - (clock - v.flash) / 0.32;
      if (flash > 0) {
        stroke(pal.gloss, 4.8, p.alpha * flash * 0.85);
        ctx.beginPath();
        ctx.ellipse(0, -0.5, RIM + 1, RY, 0, 0, Math.PI);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /** Пунктир прицела: кружки всё мельче и бледнее; у каждого тонкий контур — виден на любом небе. */
  function dots(list) {
    const n = list.length;
    for (let i = 0; i < n; i++) {
      const u = n > 1 ? i / (n - 1) : 0;
      const r = lerp(4.3, 1.9, u);
      const y = Y(list[i][1]);
      ctx.globalAlpha = lerp(0.5, 0.14, u);
      ctx.fillStyle = pal.ink2;
      ctx.beginPath();
      ctx.arc(list[i][0], y, r + 1.3, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = lerp(1, 0.42, u);
      ctx.fillStyle = pal.aim;
      ctx.beginPath();
      ctx.arc(list[i][0], y, r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ---------- мяч и огонь ----------

  /**
   * Как мяч вертится в полёте со скоростью (vx, vy): катится «вперёд» по ходу — рисунок бежит по нему туда,
   * куда он летит, — и немного вокруг оси, которая смотрит на нас (как колесо).
   */
  function flightSpin(vx, vy) {
    const roll = 0.42 / R;
    // скорость на экране — (vx, −vy); ось качения — поперёк неё, в плоскости экрана
    return [vy * roll, vx * roll, (vx / R) * 0.22];
  }

  /** Где мяч на экране: в корзине он лежит на дне сетки и ездит вместе с ней, в полёте — там, где его считает игра. */
  function placeBall(s, dt, calm) {
    const v = vis.get(s.from.id);
    ball.held = s.phase === 'aim' && Boolean(v);
    if (ball.held) {
      const lx = v.nx * 0.6;
      const ly = -SEAT + v.ny * 0.72;
      const ca = Math.cos(v.ang);
      const sa = Math.sin(v.ang);
      ball.x = v.x + lx * ca - ly * sa;
      ball.y = v.y + lx * sa + ly * ca;
      ball.vx = ball.vy = 0;
      const stop = Math.max(0, 1 - dt * 5);
      for (let i = 0; i < 3; i++) ball.spin[i] *= stop;
      ball.hold = [lx, -ly];
    } else {
      Object.assign(ball, { x: s.ball.x, y: s.ball.y, vx: s.ball.vx, vy: s.ball.vy, hold: null });
      const want = flightSpin(ball.vx, ball.vy);
      const pace = Math.min(1, dt * 2.2);
      for (let i = 0; i < 3; i++) ball.spin[i] += (want[i] - ball.spin[i]) * pace;
    }
    ball.heat = s.phase === 'lost' || s.phase === 'over' ? 0 : heatOf(s.streak);
    const speed = Math.hypot(...ball.spin);
    if (speed * dt > 1e-5) rotate(ball.turn, ball.spin[0], ball.spin[1], ball.spin[2], speed * dt);
    frames += 1;
    if (frames % 240 === 0) tidy(ball.turn);
    if (calm) ball.sq = ball.sqV = 0;
    else {
      const n = Math.max(1, Math.ceil(dt * 120));
      for (let i = 0; i < n; i++) spring(ball, 'sq', 'sqV', 0, 700, 24, dt / n);
      ball.sq = clamp(ball.sq, -0.3, 0.24);
    }
  }

  function burn(dt) {
    if (ball.heat >= 2) {
      debt += dt * (ball.held ? 44 : 68);
      const speed = Math.hypot(ball.vx, ball.vy) || 1;
      while (debt >= 1) {
        debt -= 1;
        flames.push(ball.held
          ? { x: ball.x + rand(-8, 8), y: ball.y + rand(2, 9), vx: rand(-20, 20), vy: rand(95, 170), t: 0, life: rand(0.3, 0.5), size: rand(8, 12.5), front: Math.random() < 0.2 }
          : {
            x: ball.x - (ball.vx / speed) * R * 0.3 + rand(-6, 6), y: ball.y - (ball.vy / speed) * R * 0.3 + rand(-6, 6),
            vx: -ball.vx * 0.12 + rand(-35, 35), vy: -ball.vy * 0.12 + rand(40, 120), t: 0, life: rand(0.26, 0.44), size: rand(10, 15),
            front: Math.random() < 0.16,
          });
      }
      if (flames.length > 90) flames.splice(0, flames.length - 90);
    } else debt = 0;
    if (ball.heat === 1) {
      smoke += dt * (ball.held ? 8 : 24);
      while (smoke >= 1) {
        smoke -= 1;
        puffs.push({ x: ball.x + rand(-6, 6), y: ball.y + rand(4, 12), vx: rand(-14, 14) - ball.vx * 0.05, vy: rand(26, 60), t: 0, life: rand(0.5, 0.85), size: rand(3.5, 6) });
      }
    } else smoke = 0;
    for (const f of flames) {
      f.t += dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.vx *= 1 - Math.min(1, dt * 3);
    }
    flames = flames.filter((f) => f.t < f.life);
    for (const q of puffs) {
      q.t += dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
    }
    puffs = puffs.filter((q) => q.t < q.life);
  }

  const flameColors = () => (ball.heat === 3 ? [pal.hot1, pal.hot2, pal.hot3] : [pal.fire1, pal.fire2, pal.fire3]);

  /**
   * Пламя — три слоя язычков: снаружи тёмный, внутри светлый. Язычок — капля, острым концом туда, куда его несёт;
   * капли сливаются в один огонь.
   */
  function fire(front) {
    if (!flames.length) return;
    const colors = flameColors();
    const layers = [[1, 1], [0.7, 0.66], [0.42, 0.38]];
    for (let i = 0; i < 3; i++) {
      const [until, part] = layers[i];
      ctx.fillStyle = colors[i];
      ctx.beginPath();
      for (const f of flames) {
        const u = f.t / f.life;
        if (f.front !== front || u >= until) continue;
        const r = f.size * (front ? 0.55 : 1) * (1 - u) ** 0.8 * part;
        const y = Y(f.y);
        const dir = Math.atan2(-f.vy, f.vx);
        const tip = r * (1.7 + u * 1.3);
        ctx.moveTo(f.x + Math.cos(dir) * tip, y + Math.sin(dir) * tip);
        ctx.arc(f.x, y, r, dir + 1.12, dir - 1.12 + TAU);
        ctx.closePath();
      }
      ctx.fill();
    }
  }

  /** Жар вокруг горящего мяча — два бледных круга, чуть дышат. */
  function glow() {
    if (ball.heat < 2) return;
    const y = Y(ball.y);
    ctx.fillStyle = flameColors()[1];
    for (const [size, alpha] of [[2.5, 0.1], [1.75, 0.16]]) {
      ctx.globalAlpha = alpha + 0.03 * Math.sin(wave * 9);
      ctx.beginPath();
      ctx.arc(ball.x, y, R * (size + 0.06 * Math.sin(wave * 13)), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** «Уменьшить движение»: огонь не пляшет, но виден — неподвижный язык над мячом. */
  function stillFire() {
    if (ball.heat < 2) return;
    const colors = flameColors();
    const x = ball.x;
    const y = Y(ball.y);
    for (const [i, w, h] of [[0, 15, 44], [1, 10.5, 32], [2, 6, 20]]) {
      ctx.fillStyle = colors[i];
      ctx.beginPath();
      ctx.moveTo(x - w, y - 2);
      ctx.bezierCurveTo(x - w, y - h * 0.5, x - 2, y - h * 0.62, x + 3, y - h);
      ctx.bezierCurveTo(x + 5, y - h * 0.6, x + w, y - h * 0.5, x + w, y - 2);
      ctx.closePath();
      ctx.fill();
    }
  }

  function smokePuffs() {
    if (!puffs.length) return;
    ctx.fillStyle = pal.smoke;
    for (const q of puffs) {
      const u = q.t / q.life;
      ctx.globalAlpha = 0.5 * (1 - u);
      ctx.beginPath();
      ctx.arc(q.x, Y(q.y), q.size * (1 + u * 1.3), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** Мяч-шар под нынешний размер холста: своя маленькая картинка, в которую он пересчитывается при повороте. */
  const sphere = () => cached('ball', () => {
    const size = Math.ceil((R * 2 + 2) * k);
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const image = g.createImageData(size, size);
    ball.drawn = '';
    return { c, g, image, body: createBall({ kind: look.ball, colors: pal, size, radius: R * k, data: image.data }), w: size / k };
  });

  function drawBall() {
    const s = sphere();
    // пересчитывается, только когда мяч повернулся
    const pose = ball.turn.map((v) => Math.round(v * 500)).join();
    if (pose !== ball.drawn) {
      s.body.paint(ball.turn);
      s.g.putImageData(s.image, 0, 0);
      ball.drawn = pose;
    }
    ctx.save();
    ctx.translate(ball.x, Y(ball.y));
    if (ball.sq) {
      // сплющивание об стену или дужку — вдоль удара
      ctx.rotate(ball.axis);
      ctx.scale(1 + ball.sq, 1 - ball.sq * 0.8);
      ctx.rotate(-ball.axis);
    }
    ctx.drawImage(s.c, -s.w / 2, -s.w / 2, s.w, s.w);
    if (ball.heat >= 2) {
      // раскалённый ободок
      stroke(flameColors()[2], 1.5, 0.85);
      ctx.beginPath();
      ctx.arc(0, 0, R + 0.4, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function particles(dt) {
    const keep = [];
    for (const q of parts) {
      q.t += dt;
      if (q.t >= q.life) continue;
      q.vy -= q.g * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.rot += q.vr * dt;
      keep.push(q);
      const u = q.t / q.life;
      const fade = u < 0.55 ? 1 : 1 - (u - 0.55) / 0.45;
      const y = Y(q.y);
      if (q.kind === 'dot') {
        ctx.fillStyle = q.color;
        ctx.globalAlpha = fade;
        ctx.beginPath();
        ctx.arc(q.x, y, q.size * 0.6, 0, TAU);
        ctx.fill();
      } else {
        stroke(q.color, 1.7, fade);
        ctx.beginPath();
        const arms = q.kind === 'star' ? 2 : 1;
        for (let i = 0; i < arms; i++) {
          const a = q.rot + (i * Math.PI) / 2;
          ctx.moveTo(q.x - Math.cos(a) * q.size, y - Math.sin(a) * q.size);
          ctx.lineTo(q.x + Math.cos(a) * q.size, y + Math.sin(a) * q.size);
        }
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    parts = keep;
  }

  function popups(dt, calm) {
    const keep = [];
    for (const p of pops) {
      p.t += dt;
      if (p.t >= p.life) continue;
      keep.push(p);
      if (p.t < 0) continue;
      const u = p.t / p.life;
      const s = label(p.text, p.size, p.fill, pal.ink2);
      const size = calm ? 1 : u < 0.16 ? backOut(u / 0.16) : 1;
      const x = clamp(p.x, s.w / 2 + 4, W - s.w / 2 - 4);
      const y = Y(p.y) - (calm ? 0 : 26 * (1 - (1 - u) ** 2));
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(size, size);
      ctx.globalAlpha = calm ? 1 : u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3;
      ctx.drawImage(s.c, -s.w / 2, -s.h / 2, s.w, s.h);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    pops = keep;
  }

  /**
   * Нарисовать кадр. dt — сколько прошло (0 — стоим: открыто окно). o: pull — натяжение под пальцем { px, py },
   * aim — бросок, который оно даёт ({ dx, dy, power, dots: [[x, y], …] } или null), calm — «уменьшить движение».
   */
  function frame(s, dt, o = {}) {
    if (s !== lastGame) {
      lastGame = s;
      reset(s);
    }
    const calm = Boolean(o.calm);
    clock += dt;
    if (!calm) wave += dt;
    seen(s.from);
    seen(s.to);
    // камера: стартовая корзина — внизу экрана; за высоко улетевшим мячом экран приподнимается
    let target = s.from.y - viewH * CAM_AT;
    if (s.phase === 'fly') target = Math.max(target, s.ball.y + R + 44 - viewH);
    view += (target - view) * (calm ? 1 : Math.min(1, dt * 6.5));
    Y = (y) => viewH - (y - view);
    sway(s, dt, o);
    for (const v of [...vis.values()]) {
      v.show = presence(v, calm);
      if (!v.show && v.gone >= 0) vis.delete(v.id);
    }
    placeBall(s, dt, calm);
    if (calm) flames = puffs = parts = [];
    else burn(dt);

    scenery(calm);
    scoreboard(s.score, calm);
    paths();
    if (o.aim?.dots) dots(o.aim.dots);
    for (const v of vis.values()) basket(v, false, ball.held && v.id === s.from.id ? ball.hold : null);
    smokePuffs();
    glow();
    if (calm) stillFire();
    else fire(false);
    drawBall();
    for (const v of vis.values()) basket(v, true, ball.held && v.id === s.from.id ? ball.hold : null);
    if (!calm) {
      fire(true);
      particles(dt);
    }
    popups(dt, calm);
  }

  const density = () => Math.min(QUALITY[quality], window.devicePixelRatio || 1);

  /** Размер холста под место width × height (пиксели CSS); возвращает высоту экрана в единицах мира. */
  function resize(width, height) {
    cssW = Math.max(1, width);
    cssH = Math.max(1, height);
    scale = cssW / W;
    const dpr = density();
    const next = scale * dpr;
    // заготовки зависят только от чёткости: высота экрана их не трогает
    if (Math.abs(next - k) > 1e-6) cache.clear();
    back.stale = true;
    k = next;
    const before = viewH;
    viewH = cssH / scale;
    // экран стал другой высоты — стартовая корзина остаётся на своей доле от низа
    view -= (viewH - before) * CAM_AT;
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

  return {
    frame,
    resize,
    onEvent,
    recordBurst,
    reset,
    lowerQuality,
    get quality() { return quality; },
    get scale() { return scale; },
    get viewH() { return viewH; },
    get view() { return view; },
    get wave() { return wave; },
    get palette() { return pal; },
    setSkin(id) {
      look = LOOKS[id] ?? LOOKS.telegram;
      pal = readPalette(probe);
      cache.clear();
      back.stale = true;
    },
  };
}
