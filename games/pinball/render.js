// Рисунок пинбола на canvas: тёмный «космический» стол, светятся только элементы, в которые можно попасть.
//
// Быстродействие (жалоба владельца, 2026-09-28: «лагает, особенно на платформе, эффекты нагружают»): в кадре нет
// ни градиентов, ни shadowBlur, ни наложения 'lighter' — всё, что светится (огни-вставки, бамперы, лунки, частицы,
// след шарика), нарисовано заранее в маленькие картинки-спрайты (кэш по цвету и размеру), кадр их только копирует.
// Неподвижное (фон, стенки, погасшие огни, стёкла рамп) — в двух закадровых слоях: под шариком — копируется 1:1 без
// масштаба, над шариком — только участки рамп. Колодец со званием перерисовывается, только когда меняется звание
// или огни. Холст непрозрачный (alpha: false). Качество (плотность пикселей) задаёт index.js и снижает, если кадры
// не успевают.
// Координаты стола 1000 × 1810; экран — масштаб s и плотность пикселей dpr (не больше 2).

import { W, H, BALL_R, TOP, PLUNGER_Y, LANE_X } from './table.js';
import { flipperTip } from './physics.js';
import { fuelLights, RANKS, PROGRESS_FULL } from './rules.js';

export const SKINS = {
  nebula: {
    name: 'Туманность', bg0: '#07061a', bg1: '#141033', play: '#0d0a24', nebula: ['#6b3cff', '#ff4fd8', '#1fb6ff'],
    rail: '#7c6bff', guide: '#3de8ff', rubber: '#ff4fd8', gold: '#ffd166', green: '#4dffb5', red: '#ff5a7a',
    violet: '#9b6bff', cyan: '#3de8ff', text: '#eef0ff', flipper: ['#f4f6ff', '#aab2e8'], platform: '#2a1850',
  },
  aurora: {
    name: 'Сияние', bg0: '#03121a', bg1: '#08262e', play: '#061a22', nebula: ['#16d9a0', '#2f8cff', '#9b6bff'],
    rail: '#2fd6c4', guide: '#7cf5ff', rubber: '#b18cff', gold: '#fff08a', green: '#5dffa9', red: '#ff6f91',
    violet: '#8f8cff', cyan: '#7cf5ff', text: '#e8fffb', flipper: ['#f0fffc', '#9ad8d2'], platform: '#0e3a44',
  },
  sunset: {
    name: 'Закат', bg0: '#1a0712', bg1: '#33101f', play: '#22091a', nebula: ['#ff7a3d', '#ff3d8b', '#ffd166'],
    rail: '#ff8a5c', guide: '#ffd166', rubber: '#ff3d8b', gold: '#ffe08a', green: '#9dff7a', red: '#ff4f5a',
    violet: '#ff7ad9', cyan: '#ffb85c', text: '#fff1ea', flipper: ['#fff6ef', '#e8b9a6'], platform: '#4a1430',
  },
  classic: {
    name: 'Классика', bg0: '#040a24', bg1: '#0a1a4a', play: '#07123a', nebula: ['#2548ff', '#00a6ff', '#7a3dff'],
    rail: '#9fb4ff', guide: '#ffd23d', rubber: '#ff3d3d', gold: '#ffd23d', green: '#3dff7a', red: '#ff3d3d',
    violet: '#a58bff', cyan: '#59d9ff', text: '#f2f5ff', flipper: ['#ffffff', '#c4ccee'], platform: '#1a2a6a',
  },
};

const TAU = Math.PI * 2;
const MAX_PARTICLES = 90;
const MAX_RINGS = 14;

/** Детерминированный «случайный» генератор для звёзд (фон не меняется между пересборками). */
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0;
    return s / 4294967296;
  };
}

function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function offscreen(w, h) {
  const c = typeof OffscreenCanvas !== 'undefined' && !globalThis.document ? new OffscreenCanvas(w, h) : document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/** Путь контура стола: левая стенка, верхняя дуга, правая стенка. */
function tableOutline(g) {
  g.beginPath();
  g.moveTo(20, H);
  g.lineTo(20, TOP.cy);
  g.arc(TOP.cx, TOP.cy, TOP.r, Math.PI, TAU);
  g.lineTo(980, H);
  g.closePath();
}

/** Пути рамп → точки со сдвигом вбок (стенки стекла). */
function offsetPath(points, d) {
  return points.map((p, k) => {
    const a = points[Math.max(0, k - 1)];
    const b = points[Math.min(points.length - 1, k + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    return [p[0] - (dy / l) * d, p[1] + (dx / l) * d];
  });
}

function smoothPath(g, pts) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let k = 1; k < pts.length - 1; k++) {
    const mx = (pts[k][0] + pts[k + 1][0]) / 2;
    const my = (pts[k][1] + pts[k + 1][1]) / 2;
    g.quadraticCurveTo(pts[k][0], pts[k][1], mx, my);
  }
  const l = pts[pts.length - 1];
  g.lineTo(l[0], l[1]);
}

export function createRenderer(canvas, table) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const el = table.elements;
  let s = 0.4;                   // css px на единицу стола
  let dpr = 1;
  let pal = SKINS.nebula;
  let under = null;              // слой под шариком
  let over = null;               // слой над шариком (стёкла рамп)
  let overRects = [];            // участки слоя «над», где что-то есть
  let cache = new Map();         // спрайты
  let wellCanvas = null;
  let wellKey = '';
  const particles = [];
  const rings = [];
  const flash = new Map();       // id → время вспышки (с)
  let shakeT = 0;
  let shakeAmp = 0;
  let whiteT = 0;
  let now = 0;

  const px = () => s * dpr;

  // ---------- спрайты ----------

  /** Квадратный спрайт size×size единиц стола; paint рисует вокруг (0, 0). */
  function sprite(key, size, paint) {
    let c = cache.get(key);
    if (c) return c;
    const n = Math.max(2, Math.ceil(size * px()));
    c = offscreen(n, n);
    const g = c.getContext('2d');
    g.scale(n / size, n / size);
    g.translate(size / 2, size / 2);
    paint(g, size / 2);
    cache.set(key, c);
    return c;
  }

  function blit(c, x, y, size, alpha = 1) {
    if (alpha <= 0.02) return;
    if (alpha < 1) ctx.globalAlpha = alpha;
    ctx.drawImage(c, x - size / 2, y - size / 2, size, size);
    if (alpha < 1) ctx.globalAlpha = 1;
  }

  const radial = (g, r, color, stops) => {
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, r);
    for (const [at, a] of stops) grd.addColorStop(at, rgba(color, a));
    return grd;
  };

  /** Свечение цвета color радиусом r. */
  const glow = (color, r) => sprite(`g|${color}|${r}`, r * 2, (g, h) => {
    g.fillStyle = radial(g, h, color, [[0, 0.85], [0.25, 0.5], [0.6, 0.12], [1, 0]]);
    g.fillRect(-h, -h, h * 2, h * 2);
  });

  function drawGlow(color, x, y, r, alpha = 1) {
    blit(glow(color, r), x, y, r * 2, Math.min(1, alpha));
  }

  /** Горящая вставка: свечение + ядро + блик. */
  const lamp = (color, r) => sprite(`l|${color}|${r}`, r * 4.4, (g, h) => {
    g.fillStyle = radial(g, h, color, [[0, 0.8], [0.3, 0.35], [1, 0]]);
    g.fillRect(-h, -h, h * 2, h * 2);
    g.fillStyle = color;
    g.beginPath();
    g.arc(0, 0, r * 0.55, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.65)';
    g.beginPath();
    g.arc(0, 0, r * 0.28, 0, TAU);
    g.fill();
  });

  const chevronPath = (g, size) => {
    g.beginPath();
    g.moveTo(-size, size * 0.5);
    g.lineTo(0, -size * 0.5);
    g.lineTo(size, size * 0.5);
  };

  const chevronLit = (color, size) => sprite(`c|${color}|${size}`, size * 4, (g, h) => {
    g.fillStyle = radial(g, h, color, [[0, 0.45], [1, 0]]);
    g.fillRect(-h, -h, h * 2, h * 2);
    g.strokeStyle = color;
    g.lineWidth = 5;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    chevronPath(g, size);
    g.stroke();
  });

  /** Бампер: свечение, корпус, кольцо, точки прокачки. */
  const bumperSprite = (color, r, level) => sprite(`b|${color}|${r}|${level}`, r * 4.4, (g, h) => {
    g.fillStyle = radial(g, h, color, [[0, 0.5], [0.45, 0.22], [1, 0]]);
    g.fillRect(-h, -h, h * 2, h * 2);
    const body = g.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
    body.addColorStop(0, rgba(color, 0.95));
    body.addColorStop(0.55, rgba(color, 0.7));
    body.addColorStop(1, rgba(pal.bg0, 1));
    g.fillStyle = body;
    g.beginPath();
    g.arc(0, 0, r, 0, TAU);
    g.fill();
    g.strokeStyle = color;
    g.lineWidth = 4;
    g.stroke();
    g.strokeStyle = `rgba(255,255,255,${0.35 + 0.15 * level})`;
    g.lineWidth = 2;
    g.beginPath();
    g.arc(0, 0, r * 0.58, 0, TAU);
    g.stroke();
    g.fillStyle = '#ffffff';
    for (let k = 0; k < level; k++) {
      const a = -Math.PI / 2 + (k - (level - 1) / 2) * 0.55;
      g.beginPath();
      g.arc(Math.cos(a) * r * 0.78, Math.sin(a) * r * 0.78, 3, 0, TAU);
      g.fill();
    }
  });

  const bumperFlash = (r) => sprite(`bf|${r}`, r * 4.4, (g, h) => {
    g.fillStyle = radial(g, h, '#ffffff', [[0, 0.95], [0.35, 0.55], [0.5, 0.2], [1, 0]]);
    g.fillRect(-h, -h, h * 2, h * 2);
  });

  /** Лунка: тёмный диск, кайма, лёгкое свечение. */
  const holeSprite = (color, r) => sprite(`h|${color}|${r}`, r * 4, (g, h) => {
    g.fillStyle = radial(g, h, color, [[0.2, 0.35], [0.5, 0.12], [1, 0]]);
    g.fillRect(-h, -h, h * 2, h * 2);
    g.fillStyle = '#02010a';
    g.beginPath();
    g.arc(0, 0, r, 0, TAU);
    g.fill();
    g.strokeStyle = rgba(color, 0.9);
    g.lineWidth = 3;
    g.stroke();
  });

  const swirlSprite = (color, r) => sprite(`w|${color}|${r}`, r * 2, (g) => {
    g.lineWidth = 3;
    g.strokeStyle = color;
    for (let k = 0; k < 3; k++) {
      g.beginPath();
      g.arc(0, 0, r * (0.45 + k * 0.22), k * 2.1, k * 2.1 + 3.4);
      g.stroke();
    }
  });

  /** Точка частицы и следа. */
  const dot = (color) => sprite(`d|${color}`, 24, (g, h) => {
    g.fillStyle = radial(g, h, color, [[0, 1], [0.3, 0.7], [1, 0]]);
    g.fillRect(-h, -h, h * 2, h * 2);
  });

  function makeBall() {
    return sprite('ball', (BALL_R + 2) * 2, (g) => {
      const body = g.createRadialGradient(-BALL_R * 0.35, -BALL_R * 0.42, BALL_R * 0.05, 0, 0, BALL_R);
      body.addColorStop(0, '#ffffff');
      body.addColorStop(0.22, '#e6eaff');
      body.addColorStop(0.55, '#8f96c4');
      body.addColorStop(0.85, '#3a3d63');
      body.addColorStop(1, '#1b1c35');
      g.fillStyle = body;
      g.beginPath();
      g.arc(0, 0, BALL_R, 0, TAU);
      g.fill();
      g.strokeStyle = rgba(pal.cyan, 0.55);
      g.lineWidth = 2.2;
      g.beginPath();
      g.arc(0, 0, BALL_R - 1.5, 0.15 * Math.PI, 0.75 * Math.PI);
      g.stroke();
      g.strokeStyle = rgba(pal.rubber, 0.45);
      g.beginPath();
      g.arc(0, 0, BALL_R - 1.5, 0.8 * Math.PI, 1.05 * Math.PI);
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.95)';
      g.beginPath();
      g.ellipse(-BALL_R * 0.36, -BALL_R * 0.42, BALL_R * 0.2, BALL_R * 0.13, -0.6, 0, TAU);
      g.fill();
    });
  }

  // ---------- огни-вставки: где стоят, какого цвета, когда горят ----------

  const lit = (on, blink = false) => (on ? (blink ? 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(now * 9)) : 1) : 0);
  const MODE_KEYS = ['flags', 'jackpot', 'bonus', 'hold'];
  const INSERTS = [
    ...el.reentry.map((l, k) => ({ x: l.x, y: l.y, c: 'cyan', r: 16, on: (g) => lit(g.reentryLit[k]) })),
    ...el.launchLanes.map((l, k) => ({ x: l.x, y: l.y, c: 'rubber', r: 13, on: (g) => lit(g.launchLit[k]) })),
    ...el.fuel.map((l, k) => ({
      x: l.x, y: l.y, c: (g) => (fuelLights(g) <= 1 ? 'red' : 'gold'), r: 15,
      on: (g) => { const f = fuelLights(g); return lit(k < f, f <= 1 && Boolean(g.mission)); },
    })),
    ...el.missionTargets.map((m, k) => ({
      x: (m.a[0] + m.b[0]) / 2 + 26, y: (m.a[1] + m.b[1]) / 2, c: 'green', r: 12,
      on: (g) => lit(g.misLit[k], Boolean(g.missionPick && !g.mission)),
    })),
    ...[[238, 420], [262, 440], [286, 460], [310, 480]].map(([x, y], k) => ({ x, y, c: 'cyan', r: 12, on: (g) => lit(g.multLevel > k) })),
    ...[[455, 780], [485, 788], [515, 796]].map(([x, y], k) => ({ x, y, c: 'gold', r: 11, on: (g) => lit(g.medalLevel > k) })),
    ...MODE_KEYS.map((m, k) => ({ x: 738, y: 1118 + k * 32, c: 'rubber', r: 11, on: (g) => lit(g.modes[m] > 0, g.modes[m] > 0 && g.modes[m] < 8) })),
    { x: 57, y: 1510, c: 'green', r: 15, on: (g) => lit(g.kickL) },
    { x: 877, y: 1510, c: 'green', r: 15, on: (g) => lit(g.kickR) },
    { x: 57, y: 1350, c: 'gold', r: 12, on: (g) => lit(g.extraLit > 0, true) },
    { x: 877, y: 1350, c: 'gold', r: 12, on: (g) => lit(g.extraLit > 0, true) },
    { x: 500, y: 1590, c: 'cyan', r: 15, on: (g) => lit(g.ballSave > 0 || (!g.inPlay && !g.over), g.ballSave > 0 && g.ballSave < 3) },
    { x: el.warp.x, y: el.warp.y, c: 'violet', r: 18, on: (g) => lit(g.warpTimer > 0, true) },
    { x: 132, y: 1470, c: 'gold', r: 12, on: (g) => lit(g.bonusLane, true) },
  ];
  const CHEVRONS = [
    ...[0, 1, 2, 3, 4].map((k) => ({ x: 797, y: 950 - k * 40, c: 'cyan', on: (g) => lit(g.hyperLit > k, g.hyperLit === k && k === 1) })),
    ...[0, 1, 2].map((k) => ({
      x: 330, y: 1060 - k * 36, c: 'violet',
      on: (g) => (g.missionPick && !g.mission ? lit(true, true) : lit(g.reflex.ramp > 0)),
    })),
  ];
  const colorOf = (c, g) => pal[typeof c === 'function' ? c(g) : c];

  // ---------- неподвижные слои ----------

  function neonLine(g, pts, color, width = 5, blur = 14) {
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    pts.forEach((p, k) => (k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
    g.shadowColor = color;
    g.shadowBlur = blur * px();
    g.strokeStyle = rgba(color, 0.85);
    g.lineWidth = width;
    g.stroke();
    g.shadowBlur = 0;
    g.strokeStyle = 'rgba(255,255,255,0.75)';
    g.lineWidth = Math.max(1.2, width * 0.28);
    g.stroke();
  }

  function buildUnder() {
    const c = offscreen(canvas.width, canvas.height);
    const g = c.getContext('2d', { alpha: false });
    g.scale(c.width / W, c.height / H);
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, pal.bg1);
    bg.addColorStop(0.55, pal.bg0);
    bg.addColorStop(1, pal.bg1);
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    tableOutline(g);
    g.save();
    g.clip();
    g.fillStyle = pal.play;
    g.fillRect(0, 0, W, H);
    // туманность
    const rnd = seeded(20260928);
    const blobs = [[250, 420, 420, 0], [760, 820, 460, 1], [380, 1250, 420, 2], [700, 260, 300, 1], [180, 900, 300, 2]];
    for (const [x, y, r, k] of blobs) {
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, rgba(pal.nebula[k], 0.2));
      grd.addColorStop(0.5, rgba(pal.nebula[k], 0.07));
      grd.addColorStop(1, rgba(pal.nebula[k], 0));
      g.fillStyle = grd;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // звёзды
    for (let k = 0; k < 260; k++) {
      const x = rnd() * W;
      const y = rnd() * H;
      const r = rnd() < 0.08 ? 2.4 : 0.9 + rnd() * 1.1;
      g.fillStyle = `rgba(255,255,255,${0.25 + rnd() * 0.55})`;
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
    }
    // тонкая сетка «голограммы» в нижней части
    g.strokeStyle = rgba(pal.violet, 0.07);
    g.lineWidth = 1.2;
    for (let y = 1300; y < H; y += 46) {
      g.beginPath();
      g.moveTo(20, y);
      g.lineTo(980, y);
      g.stroke();
    }
    for (let x = 40; x < 980; x += 46) {
      g.beginPath();
      g.moveTo(x, 1300);
      g.lineTo(500 + (x - 500) * 1.35, H);
      g.stroke();
    }
    // гравитационный колодец: кольца с делениями
    const wl = el.well;
    g.strokeStyle = rgba(pal.violet, 0.22);
    for (const [r, lw] of [[wl.r, 2], [wl.r * 0.72, 1.5], [wl.r * 0.42, 1.2]]) {
      g.lineWidth = lw;
      g.beginPath();
      g.arc(wl.x, wl.y, r, 0, TAU);
      g.stroke();
    }
    for (let k = 0; k < 48; k++) {
      const a = (k / 48) * TAU;
      const r0 = wl.r * (k % 4 ? 0.94 : 0.88);
      g.beginPath();
      g.moveTo(wl.x + Math.cos(a) * r0, wl.y + Math.sin(a) * r0);
      g.lineTo(wl.x + Math.cos(a) * wl.r, wl.y + Math.sin(a) * wl.r);
      g.stroke();
    }
    // дорожки: запуска, орбита, топливный канал — чуть светлее
    const lane = (x0, y0, x1, y1, color) => {
      const grd = g.createLinearGradient(x0, 0, x1, 0);
      grd.addColorStop(0, rgba(color, 0.02));
      grd.addColorStop(0.5, rgba(color, 0.08));
      grd.addColorStop(1, rgba(color, 0.02));
      g.fillStyle = grd;
      g.fillRect(x0, y0, x1 - x0, y1 - y0);
    };
    lane(915, TOP.cy, 980, PLUNGER_Y, pal.cyan);
    lane(20, 545, 95, 960, pal.gold);
    lane(852, 402, 915, 1000, pal.cyan);
    g.restore();

    // погасшие огни и шевроны (горящие рисует кадр поверх)
    for (const i of INSERTS) {
      const color = colorOf(i.c, { fuel: 72, mission: null });
      g.fillStyle = rgba(color, 0.14);
      g.strokeStyle = rgba(color, 0.35);
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(i.x, i.y, i.r * 0.55, 0, TAU);
      g.fill();
      g.stroke();
    }
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const ch of CHEVRONS) {
      g.save();
      g.translate(ch.x, ch.y);
      g.strokeStyle = rgba(pal[ch.c], 0.18);
      g.lineWidth = 5;
      chevronPath(g, 17);
      g.stroke();
      g.restore();
    }

    // стенки
    for (const c0 of table.colliders) {
      if (c0.type !== 'seg') continue;
      const k = c0.kind;
      if (k === 'rubber' || k === 'sling' || k === 'target' || k === 'drop' || c0.layer === 1) continue;
      let color = pal.rail;
      let width = 5;
      if (k === 'guide') {
        color = pal.guide;
        width = 4;
      } else if (k === 'gate') {
        color = pal.text;
        width = 2.5;
      } else if (k === 'mouth' || k === 'cup') {
        color = pal.violet;
      } else if (k === 'plunger') continue;
      neonLine(g, [c0.a, c0.b], color, width, k === 'gate' ? 6 : 14);
    }
    // стойки
    for (const c0 of table.colliders) {
      if (c0.type !== 'circle' || c0.kind !== 'post' || c0.id === 'post') continue;
      g.fillStyle = '#1a1540';
      g.beginPath();
      g.arc(c0.x, c0.y, c0.r + 2, 0, TAU);
      g.fill();
      g.shadowColor = pal.guide;
      g.shadowBlur = 10 * px();
      g.strokeStyle = pal.guide;
      g.lineWidth = 2.5;
      g.stroke();
      g.shadowBlur = 0;
    }
    // рогатки: треугольники с градиентом
    for (const [top, bl, br] of [[[258, 1338], [258, 1500], [325, 1542]], [[742, 1338], [742, 1500], [675, 1542]]]) {
      const grd = g.createLinearGradient(top[0], top[1], br[0], br[1]);
      grd.addColorStop(0, rgba(pal.rubber, 0.28));
      grd.addColorStop(1, rgba(pal.violet, 0.1));
      g.fillStyle = grd;
      g.beginPath();
      g.moveTo(...top);
      g.lineTo(...bl);
      g.lineTo(...br);
      g.closePath();
      g.fill();
    }
    // платформа (приподнята): тень, поверхность, дорожки
    const poly = el.block;
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.7)';
    g.shadowBlur = 24 * px();
    g.shadowOffsetY = 10 * px();
    g.beginPath();
    poly.forEach((p, k) => (k ? g.lineTo(...p) : g.moveTo(...p)));
    g.closePath();
    const pg = g.createLinearGradient(105, 1000, 245, 1255);
    pg.addColorStop(0, pal.platform);
    pg.addColorStop(1, rgba(pal.bg0, 1));
    g.fillStyle = pg;
    g.fill();
    g.restore();
    g.strokeStyle = rgba(pal.rubber, 0.25);
    g.lineWidth = 1;
    for (let y = 1085; y < 1212; y += 18) {
      g.beginPath();
      g.moveTo(112, y);
      g.lineTo(238, y);
      g.stroke();
    }
    for (const c0 of table.colliders) {
      if (c0.layer !== 1 || c0.type !== 'seg') continue;
      neonLine(g, [c0.a, c0.b], pal.rubber, c0.kind === 'guide' ? 3 : 4, 12);
    }
    // погасший огонь платформы и тех дорожек — поверх платформы
    for (const i of INSERTS.slice(el.reentry.length, el.reentry.length + el.launchLanes.length)) {
      g.fillStyle = rgba(pal.rubber, 0.14);
      g.beginPath();
      g.arc(i.x, i.y, i.r * 0.55, 0, TAU);
      g.fill();
    }
    // подпись дорожки запуска
    g.save();
    g.translate(LANE_X, 1380);
    g.rotate(-Math.PI / 2);
    g.font = '700 26px system-ui, "Segoe UI", sans-serif';
    g.textAlign = 'center';
    g.fillStyle = rgba(pal.cyan, 0.35);
    g.fillText('З А П У С К', 0, 9);
    g.restore();
    return c;
  }

  function buildOver() {
    const c = offscreen(canvas.width, canvas.height);
    const g = c.getContext('2d');
    g.scale(c.width / W, c.height / H);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    overRects = [];
    for (const [name, p] of Object.entries(table.paths)) {
      const color = name === 'hyper' ? pal.cyan : pal.violet;
      smoothPath(g, p.points);
      g.strokeStyle = rgba(color, 0.1);
      g.lineWidth = 58;
      g.stroke();
      g.strokeStyle = rgba(color, 0.06);
      g.lineWidth = 34;
      g.stroke();
      for (const d of [-29, 29]) {
        smoothPath(g, offsetPath(p.points, d));
        g.shadowColor = color;
        g.shadowBlur = 10 * px();
        g.strokeStyle = rgba(color, 0.7);
        g.lineWidth = 3;
        g.stroke();
        g.shadowBlur = 0;
        g.strokeStyle = 'rgba(255,255,255,0.45)';
        g.lineWidth = 1;
        g.stroke();
      }
      const xs = p.points.map((q) => q[0]);
      const ys = p.points.map((q) => q[1]);
      overRects.push([Math.min(...xs) - 50, Math.min(...ys) - 50, Math.max(...xs) + 50, Math.max(...ys) + 50]);
    }
    const cup = el.cup;
    g.fillStyle = rgba(pal.cyan, 0.08);
    g.fillRect(cup.x0, cup.y0, cup.x1 - cup.x0, cup.y1 - cup.y0);
    overRects.push([cup.x0 - 4, cup.y0 - 4, cup.x1 + 4, cup.y1 + 4]);
    // участки — в пиксели слоя, в пределах холста
    const kx = c.width / W;
    const ky = c.height / H;
    overRects = overRects.map(([x0, y0, x1, y1]) => {
      const a = Math.max(0, Math.floor(x0 * kx));
      const b = Math.max(0, Math.floor(y0 * ky));
      const w = Math.min(c.width, Math.ceil(x1 * kx)) - a;
      const h = Math.min(c.height, Math.ceil(y1 * ky)) - b;
      return [a, b, w, h];
    });
    return c;
  }

  /** Колодец: огни звания (18 долек), «ЗВАНИЕ», название, шевроны — перерисовка при смене звания или огней. */
  function wellLayer(g) {
    const key = `${g.rank}|${g.progress}`;
    if (wellCanvas && key === wellKey) return wellCanvas;
    wellKey = key;
    const wl = el.well;
    const size = wl.r * 2;
    wellCanvas = offscreen(Math.ceil(size * px()), Math.ceil(size * px()));
    const w = wellCanvas.getContext('2d');
    w.scale(wellCanvas.width / size, wellCanvas.height / size);
    w.translate(wl.r, wl.r);
    for (let k = 0; k < PROGRESS_FULL; k++) {
      const a0 = Math.PI * 0.75 + (k / PROGRESS_FULL) * Math.PI * 1.5;
      const a1 = a0 + (Math.PI * 1.5) / PROGRESS_FULL - 0.05;
      const on = k < g.progress;
      if (on) {
        w.shadowColor = pal.gold;
        w.shadowBlur = 8 * px();
      }
      w.strokeStyle = on ? pal.gold : rgba(pal.gold, 0.14);
      w.lineWidth = 9;
      w.beginPath();
      w.arc(0, 0, wl.r * 0.83, a0, a1);
      w.stroke();
      w.shadowBlur = 0;
    }
    w.textAlign = 'center';
    w.font = '600 22px system-ui, "Segoe UI", sans-serif';
    w.fillStyle = rgba(pal.text, 0.45);
    w.fillText('ЗВАНИЕ', 0, -18);
    const rank = RANKS[g.rank].toUpperCase();
    w.font = `800 ${rank.length > 12 ? 28 : 40}px system-ui, "Segoe UI", sans-serif`;
    w.fillStyle = rgba(pal.gold, 0.9);
    w.shadowColor = pal.gold;
    w.shadowBlur = 10 * px();
    w.fillText(rank, 0, 22);
    w.shadowBlur = 0;
    const n = Math.min(8, g.rank);
    w.strokeStyle = rgba(pal.gold, 0.7);
    w.lineWidth = 3;
    w.lineCap = 'round';
    for (let k = 0; k <= n; k++) {
      const cx = (k - n / 2) * 20;
      w.beginPath();
      w.moveTo(cx - 7, 44);
      w.lineTo(cx, 51);
      w.lineTo(cx + 7, 44);
      w.stroke();
    }
    return wellCanvas;
  }

  const spiralSprite = () => sprite('spiral', el.well.r * 2, (g, h) => {
    g.strokeStyle = pal.violet;
    g.lineWidth = 3;
    for (let k = 0; k < 4; k++) {
      g.beginPath();
      for (let q = 0; q <= 28; q++) {
        const t = q / 28;
        const a = k * (TAU / 4) + t * 3.2;
        const r = h * (0.95 - t * 0.8);
        if (q) g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        else g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.stroke();
    }
  });

  // ---------- кадр ----------

  function bar(a, b, color, up, level) {
    if (!up) {
      ctx.strokeStyle = rgba(color, 0.2);
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
      return;
    }
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.55 + 0.45 * level;
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    if (level > 0) drawGlow(color, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 30, 0.55 * level);
  }

  function flashLevel(id, dur = 0.18) {
    const t = flash.get(id);
    if (t == null) return 0;
    const k = 1 - (now - t) / dur;
    if (k <= 0) {
      flash.delete(id);
      return 0;
    }
    return k;
  }

  function drawBumper(b, color, level) {
    const f = flashLevel(b.id);
    const size = b.r * 4.4 * (1 + f * 0.12);
    blit(bumperSprite(color, b.r, level), b.x, b.y, size);
    if (f > 0) blit(bumperFlash(b.r), b.x, b.y, size, f);
  }

  function drawRubber(id, a, b, color) {
    const f = flashLevel(id);
    ctx.strokeStyle = f > 0 ? '#ffffff' : color;
    ctx.lineWidth = 9 + f * 4;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;
    ctx.stroke();
    if (f > 0) drawGlow(color, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 90, f);
  }

  function drawHole(h, color, level, spin, dark = false) {
    blit(holeSprite(color, h.r), h.x, h.y, h.r * 4);
    const sw = swirlSprite(color, h.r);
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.rotate((now * spin) % TAU);
    ctx.globalAlpha = Math.min(1, (dark ? 0.35 : 0.5) + level * 0.4);
    ctx.drawImage(sw, -h.r, -h.r, h.r * 2, h.r * 2);
    ctx.restore();
    if (level > 0) drawGlow(color, h.x, h.y, h.r * 2.4, level * 0.7);
  }

  function drawFlipper(f, tilted) {
    const [tx, ty] = flipperTip(f);
    const ux = (tx - f.x) / f.length;
    const uy = (ty - f.y) / f.length;
    const nx = -uy;
    const ny = ux;
    const a = Math.atan2(ny, nx);
    ctx.beginPath();
    ctx.moveTo(f.x + nx * f.r0, f.y + ny * f.r0);
    ctx.lineTo(tx + nx * f.r1, ty + ny * f.r1);
    ctx.arc(tx, ty, f.r1, a, a + Math.PI, true);
    ctx.lineTo(f.x - nx * f.r0, f.y - ny * f.r0);
    ctx.arc(f.x, f.y, f.r0, a + Math.PI, a, true);
    ctx.closePath();
    ctx.fillStyle = tilted ? '#6a6c82' : pal.flipper[0];
    ctx.fill();
    ctx.strokeStyle = tilted ? '#555' : pal.rubber;
    ctx.lineWidth = 4;
    ctx.stroke();
    // тень нижней кромки — объём без градиента
    ctx.strokeStyle = tilted ? 'rgba(0,0,0,0.2)' : rgba(pal.flipper[1], 0.9);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(f.x - nx * (f.r0 - 5), f.y - ny * (f.r0 - 5));
    ctx.lineTo(tx - nx * (f.r1 - 4), ty - ny * (f.r1 - 4));
    ctx.stroke();
    ctx.fillStyle = pal.bg0;
    ctx.beginPath();
    ctx.arc(f.x, f.y, 6, 0, TAU);
    ctx.fill();
    if (f.pressed && !tilted) drawGlow(pal.cyan, (f.x + tx) / 2, (f.y + ty) / 2, 80, 0.3);
  }

  function drawPlunger(pull) {
    const top = PLUNGER_Y + pull * 55;
    ctx.fillStyle = pal.bg0;
    ctx.fillRect(917, PLUNGER_Y - 2, 61, H - PLUNGER_Y);
    ctx.strokeStyle = rgba(pal.cyan, 0.7);
    ctx.lineWidth = 3;
    ctx.beginPath();
    const coils = 7;
    for (let k = 0; k <= coils * 2; k++) {
      const y = top + 10 + ((1790 - top - 10) * k) / (coils * 2);
      const x = k % 2 ? 935 : 960;
      if (k) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = pal.flipper[0];
    ctx.fillRect(922, top - 4, 51, 16);
    ctx.fillStyle = pal.flipper[1];
    ctx.fillRect(922, top + 6, 51, 6);
    if (pull > 0) drawGlow(pull > 0.97 ? pal.gold : pal.cyan, LANE_X, top, 60, 0.3 + pull * 0.5);
  }

  function drawBall(b) {
    if (b.trail?.length) {
      const d = dot(pal.cyan);
      const n = b.trail.length;
      for (let k = 0; k < n; k++) {
        const p = b.trail[k];
        blit(d, p[0], p[1], BALL_R * 2 * (0.6 + (k / n) * 0.7), ((k + 1) / n) * 0.3);
      }
    }
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(b.x + 5, b.y + 7, BALL_R, BALL_R * 0.8, 0, 0, TAU);
    ctx.fill();
    const r = BALL_R + 2;
    ctx.drawImage(makeBall(), b.x - r, b.y - r, r * 2, r * 2);
  }

  function drawParticles(dt) {
    for (let k = particles.length - 1; k >= 0; k--) {
      const p = particles[k];
      p.life -= dt;
      if (p.life <= 0) {
        particles[k] = particles[particles.length - 1];
        particles.pop();
        continue;
      }
      p.vx *= 1 - 2.2 * dt;
      p.vy = p.vy * (1 - 2.2 * dt) + 600 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const a = p.life / p.max;
      blit(dot(p.color), p.x, p.y, p.size * 2 * (0.6 + a * 0.6), a);
    }
    ctx.lineWidth = 3;
    for (let k = rings.length - 1; k >= 0; k--) {
      const r = rings[k];
      r.t += dt;
      const q = r.t / r.dur;
      if (q >= 1) {
        rings[k] = rings[rings.length - 1];
        rings.pop();
        continue;
      }
      ctx.globalAlpha = (1 - q) * 0.8;
      ctx.strokeStyle = r.color;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * (1 - (1 - q) ** 2), 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** Всё, что меняется: состояние правил g, мир (шарики, флипперы, мишени), пружина, dt. */
  function draw(view, dt) {
    now += dt;
    const g = view.g;
    const tilted = g.tilted;
    let sx = 0;
    let sy = 0;
    if (shakeT > 0) {
      shakeT = Math.max(0, shakeT - dt);
      const k = shakeAmp * (shakeT / 0.35);
      sx = Math.round((Math.random() - 0.5) * k * px());
      sy = Math.round((Math.random() - 0.5) * k * px());
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = pal.bg0;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    // слой под шариком — 1:1, без масштаба (самое дешёвое копирование)
    ctx.setTransform(1, 0, 0, 1, sx, sy);
    ctx.drawImage(under, 0, 0);
    ctx.setTransform(px(), 0, 0, px(), sx, sy);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // колодец: спираль, огни звания
    const wl = el.well;
    ctx.save();
    ctx.translate(wl.x, wl.y);
    ctx.rotate((now * (g.wellActive ? 1.6 : 0.25)) % TAU);
    ctx.globalAlpha = g.wellActive ? 0.6 : 0.17;
    ctx.drawImage(spiralSprite(), -wl.r, -wl.r, wl.r * 2, wl.r * 2);
    ctx.restore();
    if (g.wellActive) drawGlow(pal.violet, wl.x, wl.y, wl.r * 1.1, 0.35 + 0.15 * Math.sin(now * 5));
    ctx.drawImage(wellLayer(g), wl.x - wl.r, wl.y - wl.r, wl.r * 2, wl.r * 2);

    // огни-вставки и шевроны (погасшие — в слое)
    for (const i of INSERTS) {
      const level = i.on(g);
      if (level > 0) blit(lamp(colorOf(i.c, g), i.r), i.x, i.y, i.r * 4.4, level);
    }
    for (const ch of CHEVRONS) {
      const level = ch.on(g);
      if (level > 0) blit(chevronLit(pal[ch.c], 17), ch.x, ch.y, 68, level);
    }

    // лунки
    const holes = el.holes;
    drawHole(holes.hyper, pal.cyan, lit(g.hyperLit > 0), 3);
    drawHole(holes.black, pal.violet, lit(g.mission?.id === 'blackHole'), -1.2, true);
    for (const c of ['G', 'R', 'Y']) {
      const color = c === 'G' ? pal.green : c === 'R' ? pal.red : pal.gold;
      drawHole(holes[`worm${c}`], color, lit(g.wormOpen, g.wormOpen && g.wormExit === c), g.wormOpen ? 4 : 1.2);
    }

    // мишени
    const dropUp = view.dropUp;
    for (const m of el.multTargets) bar(m.a, m.b, pal.cyan, dropUp[m.id], 0);
    for (const m of el.medalTargets) bar(m.a, m.b, pal.gold, dropUp[m.id], 0);
    for (const m of el.boostTargets) bar(m.a, m.b, pal.rubber, dropUp[m.id], 0);
    el.hazL.forEach((m, k) => bar(m.a, m.b, pal.green, true, lit(g.spots.hazL[k])));
    el.hazR.forEach((m, k) => bar(m.a, m.b, pal.red, true, lit(g.spots.hazR[k])));
    el.fuelTargets.forEach((m, k) => bar(m.a, m.b, pal.gold, true, lit(g.spots.fuelT[k])));
    el.missionTargets.forEach((m, k) => bar(m.a, m.b, pal.green, true, lit(g.misLit[k])));
    bar(el.wormT.a, el.wormT.b, pal.violet, true, lit(g.wormOpen));

    // рогатки, резинки, бамперы, стойка
    drawRubber('slingL', [258, 1338], [325, 1542], pal.rubber);
    drawRubber('slingR', [742, 1338], [675, 1542], pal.rubber);
    drawRubber('rebL', [150, 725], [258, 792], pal.rubber);
    drawRubber('rebR', [728, 648], [694, 578], pal.rubber);
    for (const b of el.attackBumpers) drawBumper(b, pal.gold, g.attackLevel);
    drawBumper(el.satellite, pal.cyan, g.mission?.id === 'satelliteRetrieval' ? 2 : 0);
    for (const b of el.launchBumpers) drawBumper(b, pal.rubber, g.launchLevel);
    for (const i of INSERTS.slice(el.reentry.length, el.reentry.length + el.launchLanes.length)) {
      const level = i.on(g);
      if (level > 0) blit(lamp(pal.rubber, i.r), i.x, i.y, i.r * 4.4, level);
    }
    if (view.postUp) {
      drawGlow(pal.cyan, el.post.x, el.post.y, 40, 0.7);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(el.post.x, el.post.y, el.post.r, 0, TAU);
      ctx.fill();
    }
    // спиннер (флажок в топливном канале)
    const sp = el.spinner;
    const w = Math.abs(Math.cos(view.spinAngle || 0));
    ctx.strokeStyle = pal.gold;
    ctx.globalAlpha = 0.5 + 0.5 * (1 - w);
    ctx.lineWidth = 6 + 10 * w;
    ctx.beginPath();
    ctx.moveTo(sp.a[0] + 8, sp.a[1]);
    ctx.lineTo(sp.b[0] - 8, sp.b[1]);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // флипперы, пружина
    for (const f of table.flippers) drawFlipper(f, tilted);
    drawPlunger(view.pull || 0);

    // шарики: на столе — под стёклами рамп, на платформе и на рампе — над
    for (const b of view.balls) if (!b.hidden && b.layer === 0 && !b.riding) drawBall(b);
    ctx.setTransform(1, 0, 0, 1, sx, sy);
    for (const [x, y, rw, rh] of overRects) if (rw > 0 && rh > 0) ctx.drawImage(over, x, y, rw, rh, x, y, rw, rh);
    ctx.setTransform(px(), 0, 0, px(), sx, sy);
    for (const b of view.balls) if (!b.hidden && (b.layer === 1 || b.riding)) drawBall(b);

    drawParticles(dt);

    if (whiteT > 0) {
      whiteT = Math.max(0, whiteT - dt);
      ctx.fillStyle = `rgba(255,255,255,${whiteT * 1.4})`;
      ctx.fillRect(-20, -20, W + 40, H + 40);
    }
  }

  function rebuild() {
    cache = new Map();
    wellCanvas = null;
    wellKey = '';
    under = buildUnder();
    over = buildOver();
  }

  return {
    get scale() {
      return s;
    },
    get dpr() {
      return dpr;
    },
    /** Размер холста в css px (стол вписан целиком), ratio — плотность пикселей (не больше 2). */
    resize(cssW, cssH, ratio) {
      dpr = Math.max(0.75, Math.min(2, ratio || 1));
      s = Math.min(cssW / W, cssH / H);
      canvas.width = Math.round(W * s * dpr);
      canvas.height = Math.round(H * s * dpr);
      canvas.style.width = `${W * s}px`;
      canvas.style.height = `${H * s}px`;
      rebuild();
    },
    setSkin(id) {
      pal = SKINS[id] ?? SKINS.nebula;
      if (under) rebuild();
    },
    draw,
    hit(id) {
      flash.set(id, now);
    },
    burst(x, y, color, n = 8, speed = 500) {
      const c = pal[color] ?? color;
      for (let k = 0; k < n && particles.length < MAX_PARTICLES; k++) {
        const a = Math.random() * TAU;
        const v = speed * (0.35 + Math.random() * 0.8);
        const life = 0.3 + Math.random() * 0.4;
        particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, color: c, size: 7 + Math.random() * 7 });
      }
    },
    ring(x, y, color, r0 = 20, r1 = 90, dur = 0.4) {
      if (rings.length >= MAX_RINGS) rings.shift();
      rings.push({ x, y, color: pal[color] ?? color, r0, r1, dur, t: 0 });
    },
    shake(amp = 10) {
      shakeAmp = shakeT > 0 ? Math.max(shakeAmp, amp) : amp;
      shakeT = 0.35;
    },
    white(a = 0.4) {
      whiteT = Math.max(whiteT, a);
    },
    color: (name) => pal[name],
  };
}
