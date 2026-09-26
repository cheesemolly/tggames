// Заставка загрузки «Пульс 3D» (выбор владельца, 2026-09-26): змейка гоняется за своим хвостом и то растёт, то
// сжимается, как значок загрузки; над ней собирается по буквам объёмный пиксельный ANYGAME с радугой.
// Показывается поверх всего, пока грузится оболочка и подтягивается прогресс; app.js зовёт finishSplash().
//
// Подключается в index.html отдельным модулем ДО app.js: так заставка на экране раньше, чем Telegram по
// platform.ready() убирает свой экран загрузки (иконка и цвета — в @BotFather, см. server/README.md).
//
// Бета ('splash'): заставка стартует раньше, чем сервер скажет, владелец ли это, поэтому решает отметка
// SEES_BETA_KEY в localStorage — её ставит app.js тому, кто видит бету. У владельца заставка появится со
// второго запуска. После релиза id нет в BETA — заставку видят все.

import { inBeta } from './beta.js';

export const SEES_BETA_KEY = 'tggames-sees-beta';
export const MIN_MS = 1200;    // логотип успевает собраться
export const MAX_MS = 4000;    // сеть медленная — не держим дольше

/** Показывать ли заставку: выпущена — всем; в бете — тому, у кого отметка (или ?owner на localhost). */
export function shouldShow({ released, marked, localOwner }) {
  return released || marked || localOwner;
}

// ---------- рисунок: кадр 45 × 80 клеток ----------

const GW = 45, GH = 80, LY = 21;
const GLYPHS = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
};
const LETTERS = [...'ANYGAME'].map((ch, i) => {
  const cells = [];
  GLYPHS[ch].forEach((row, r) => [...row].forEach((v, c) => { if (v === '1') cells.push([c, r]); }));
  const on = (c, r) => GLYPHS[ch][r]?.[c] === '1';
  const edges = cells.map(([c, r]) => ({ up: !on(c, r - 1), down: !on(c, r + 1), left: !on(c - 1, r), right: !on(c + 1, r) }));
  return { cells, edges, x0: 2 + i * 6 };
});

/** Замкнутое кольцо клеток по кривой: соседние клетки — только по стороне (змейка не ходит по диагонали). */
export function ringCells(cx, cy, r) {
  const out = [];
  const push = (x, y) => {
    const l = out[out.length - 1];
    if (l && l[0] === x && l[1] === y) return;
    if (l && l[0] !== x && l[1] !== y) out.push([x, l[1]]);
    out.push([x, y]);
  };
  const steps = 3000;
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    push(Math.round(cx + r * Math.cos(t)), Math.round(cy + r * Math.sin(t)));
  }
  const f = out[0], l = out[out.length - 1];
  if (l[0] === f[0] && l[1] === f[1]) out.pop();
  else if (l[0] !== f[0] && l[1] !== f[1]) out.push([f[0], l[1]]);
  return out;
}
const RING = ringCells(22, 52, 10);

const W = [255, 255, 255], B = [0, 0, 0];
const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
const css = (c, a = 1) => `rgb(${c[0]} ${c[1]} ${c[2]} / ${a})`;
function hsl(h, s, l) {
  h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
  const f = (n) => { const k = (n + h / 30) % 12; return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255));
}

/** Буква появляется с прыжком по очереди, потом все бегут волной (t — секунды). */
export function letterPose(i, t) {
  const p = t % 4.2, at = i * 0.16;
  if (p < at) return { hide: true };
  if (p < at + 0.4) { const k = (p - at) / 0.4; return { oy: -Math.sin(k * Math.PI) * 3, sy: 0.6 + 0.4 * k }; }
  return { oy: -Math.max(0, Math.sin((p - 1.6) * 4 - i * 0.6)) * (p > 1.6 ? 2.2 : 0) };
}

function createPainter(g) {
  let K = 6, ox = 0, oy = 0, bg;
  const stars = Array.from({ length: 60 }, (_, i) => {
    const r = (n) => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
    return [r(1), r(2), r(3) * 6.3, r(4) < 0.3 ? 2 : 1];
  });

  function block(x, y, w, h, c) {
    x = Math.round(x); y = Math.round(y); w = Math.max(2, Math.round(w)); h = Math.max(2, Math.round(h));
    const e = Math.max(1, Math.round(Math.min(w, h) / 6));
    g.fillStyle = css(mix(c, B, 0.35)); g.fillRect(x, y, w - e, h - e);
    g.fillStyle = css(c); g.fillRect(x, y, w - 2 * e, h - 2 * e);
    g.fillStyle = css(mix(c, W, 0.4)); g.fillRect(x + e, y + e, w - 4 * e, e); g.fillRect(x + e, y + e, e, h - 4 * e);
  }

  // объём: клетка выдавлена вглубь (вниз-вправо), бок темнеет к дальнему краю; сначала бока, потом лица
  function voxels(list, depth) {
    const D = Math.max(2, Math.round(K * depth));
    for (let j = D; j >= 1; j--) {
      const k = j / D;
      for (const b of list) {
        g.fillStyle = css(mix(b.c, B, 0.3 + 0.38 * k));
        g.fillRect(Math.round(b.x + j * 0.7), Math.round(b.y + j), Math.round(b.w), Math.round(b.h));
      }
    }
    for (const b of list) {
      if (!b.edge) { block(b.x, b.y, b.w, b.h, b.c); continue; }
      const x = Math.round(b.x), y = Math.round(b.y), w = Math.round(b.x + b.w) - x, h = Math.round(b.y + b.h) - y;
      const e = Math.max(1, Math.round(K / 7));
      g.fillStyle = css(b.c); g.fillRect(x, y, w, h);
      g.fillStyle = css(mix(b.c, W, 0.5));
      if (b.edge.up) g.fillRect(x, y, w, e);
      if (b.edge.left) g.fillRect(x, y, e, h);
      g.fillStyle = css(mix(b.c, B, 0.22));
      if (b.edge.down) g.fillRect(x, y + h - e, w, e);
      if (b.edge.right) g.fillRect(x + w - e, y, e, h);
    }
  }

  function resize(width, height, dpr) {
    const cw = Math.round(width * dpr), ch = Math.round(height * dpr);
    g.canvas.width = cw; g.canvas.height = ch;
    // целая клетка; на большом экране (компьютер) логотип не шире ~360 css px
    K = Math.max(3, Math.min(Math.floor(cw / GW), Math.floor(ch / GH), Math.floor((360 * dpr) / 41)));
    ox = Math.round((cw - GW * K) / 2); oy = Math.round((ch - GH * K) / 2);
    bg = g.createLinearGradient(0, 0, 0, ch);
    bg.addColorStop(0, '#1c163a'); bg.addColorStop(1, '#0a0a18');
  }

  function draw(t) {
    const cw = g.canvas.width, ch = g.canvas.height;
    g.fillStyle = bg; g.fillRect(0, 0, cw, ch);
    const u = Math.max(1, Math.round(K / 5));
    for (const [x, y, ph, s] of stars) {
      const a = 0.5 + 0.5 * Math.sin(t * 2.2 + ph);
      if (a < 0.3) continue;
      g.fillStyle = `rgb(215 208 255 / ${a * 0.85})`;
      g.fillRect(Math.floor(x * cw), Math.floor(y * ch), s * u, s * u);
    }

    // змейка «дышит»: длина то больше, то меньше, голова всё время бежит за хвостом
    const N = RING.length;
    const head = Math.floor((Math.max(0, t) * 1000) / 45) % N;
    const len = Math.round(N * (0.5 + 0.34 * Math.sin(t * 2.1)));
    const body = [];
    for (let i = len - 1; i >= 0; i--) {
      const [x, y] = RING[(head - i + N * 4) % N];
      const k = i / Math.max(1, len - 1);
      body.push({ x: ox + x * K, y: oy + y * K, w: K, h: K, c: hsl(140 - k * 40, 70, 60 - k * 15) });
    }
    voxels(body, 0.5);
    // глаза и язык
    const [hx, hy] = RING[head];
    const [px, py] = RING[(head - 1 + N) % N];
    const fx = hx - px, fy = hy - py, sx = -fy, sy = fx, q = K / 6;
    const cx = ox + hx * K + K / 2 - q, cy = oy + hy * K + K / 2 - q;
    const dot = (x, y, s) => g.fillRect(Math.round(x - (s * q) / 2), Math.round(y - (s * q) / 2), Math.max(1, Math.round(s * q)), Math.max(1, Math.round(s * q)));
    g.fillStyle = '#ffffff';
    for (const side of [-1, 1]) dot(cx + (fx + sx * side * 1.5) * q, cy + (fy + sy * side * 1.5) * q, 2);
    g.fillStyle = '#10131f';
    for (const side of [-1, 1]) dot(cx + (fx * 1.6 + sx * side * 1.5) * q, cy + (fy * 1.6 + sy * side * 1.5) * q, 1);
    if (Math.floor(t * 1.4) % 3 === 0 && (t * 1.4) % 1 < 0.4) {
      g.fillStyle = '#ff4d6d';
      for (let d = 3; d <= 5; d++) dot(cx + fx * d * q, cy + fy * d * q, 1);
    }

    // объёмные буквы с тенью на «полу»
    const faces = [];
    LETTERS.forEach((L, i) => {
      const pose = letterPose(i, t);
      if (pose.hide) return;
      const syl = pose.sy ?? 1, dy = (pose.oy ?? 0) * K;
      const w = 5 * K, bx = ox + L.x0 * K + w / 2, by = oy + (LY + 7) * K + dy;
      const lift = Math.min(1, -Math.min(0, dy) / (6 * K));
      const sw = w * (1 - 0.45 * lift), gy = oy + (LY + 7) * K + Math.round(K * 0.9) + Math.round(K * 0.9);
      g.fillStyle = `rgb(0 0 0 / ${0.42 - 0.25 * lift})`;
      g.fillRect(Math.round(bx - sw / 2 + K * 0.4), gy, Math.round(sw), Math.max(2, Math.round(K * 0.55)));
      L.cells.forEach(([c, r], n) => {
        const col = mix(hsl((L.x0 + c) * 8 + r * 5 - t * 100, 75, 64), W, Math.max(0, 0.24 - r * 0.06));
        faces.push({ x: bx + c * K - w / 2, y: by - (7 - r) * K * syl, w: K, h: K * syl, c: col, edge: L.edges[n] });
      });
    });
    voxels(faces, 0.9);
  }

  return { resize, draw };
}

// ---------- показ ----------

let finish = () => {};

/** Убрать заставку (не раньше MIN_MS от показа). Без заставки — ничего не делает. */
export function finishSplash() {
  finish();
}

function start() {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const layer = document.createElement('div');
  layer.className = 'splash';
  layer.setAttribute('aria-label', 'Загрузка');
  const canvas = document.createElement('canvas');
  layer.appendChild(canvas);
  document.body.appendChild(layer);
  const painter = createPainter(canvas.getContext('2d'));
  const fit = () => painter.resize(innerWidth, innerHeight, devicePixelRatio || 1);
  fit();
  addEventListener('resize', fit);

  const shownAt = performance.now();
  let running = true;
  // при «уменьшить движение» — один кадр с уже собранным логотипом
  const frame = (now) => {
    if (!running) return;
    // метка кадра бывает чуть раньше момента показа — время не уходит в минус
    painter.draw(reduce ? 2 : Math.max(0, now - shownAt) / 1000);
    if (!reduce) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  painter.draw(reduce ? 2 : 0);

  let done = false;
  finish = () => {
    if (done) return;
    done = true;
    const wait = reduce ? 0 : Math.max(0, MIN_MS - (performance.now() - shownAt));
    setTimeout(() => {
      layer.classList.add('splash-out');
      const remove = () => {
        running = false;
        removeEventListener('resize', fit);
        layer.remove();
      };
      layer.addEventListener('transitionend', remove, { once: true });
      setTimeout(remove, 600);   // страховка: в свёрнутой вкладке переход может не закончиться
    }, wait);
  };
  setTimeout(finish, MAX_MS);
}

if (typeof document !== 'undefined') {
  let marked = false;
  try { marked = localStorage.getItem(SEES_BETA_KEY) === '1'; } catch { /* приватный режим */ }
  const localOwner = ['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).has('owner');
  if (shouldShow({ released: !inBeta('splash'), marked, localOwner })) start();
}
