// Рисунок пинбола на canvas: тёмный «космический» стол, светятся только элементы, в которые можно попасть.
// Всё неподвижное (фон, туманность, звёзды, стенки-«неон», платформа, стёкла рамп) рисуется один раз в два
// закадровых слоя (под шариком и над ним) и пересобирается только при смене размера или скина. Свечение — готовые
// спрайты радиального градиента, наложение 'lighter'; shadowBlur — только в закадровых слоях, не в кадре.
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

export function createRenderer(canvas, table) {
  const ctx = canvas.getContext('2d');
  const el = table.elements;
  let s = 0.4;                   // css px на единицу стола
  let dpr = 1;
  let pal = SKINS.nebula;
  let under = null;              // слой под шариком
  let over = null;               // слой над шариком (стёкла рамп)
  let glowCache = new Map();
  let ballSprite = null;
  const particles = [];
  const rings = [];
  const flash = new Map();       // id → время вспышки (с)
  let shakeT = 0;
  let shakeAmp = 0;
  let whiteT = 0;
  let now = 0;

  const px = () => s * dpr;

  // ---------- спрайты ----------

  /** Свечение: радиальный градиент цвета color радиусом r (единицы стола). */
  function glow(color, r) {
    const key = `${color}|${r}`;
    let sp = glowCache.get(key);
    if (sp) return sp;
    const size = Math.max(4, Math.ceil(r * 2 * px()));
    sp = offscreen(size, size);
    const g = sp.getContext('2d');
    const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grd.addColorStop(0, rgba(color, 0.95));
    grd.addColorStop(0.25, rgba(color, 0.55));
    grd.addColorStop(0.6, rgba(color, 0.14));
    grd.addColorStop(1, rgba(color, 0));
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
    glowCache.set(key, sp);
    return sp;
  }

  function drawGlow(color, x, y, r, alpha = 1) {
    if (alpha <= 0.01) return;
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.drawImage(glow(color, r), x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
  }

  function makeBall() {
    const r = BALL_R + 2;
    const size = Math.ceil(r * 2 * px());
    const c = offscreen(size, size);
    const g = c.getContext('2d');
    const k = size / (r * 2);
    g.scale(k, k);
    g.translate(r, r);
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
    // отражение неона снизу и блик
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
    return c;
  }

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
    const c = offscreen(W * px(), H * px());
    const g = c.getContext('2d');
    g.scale(px(), px());
    // фон
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, pal.bg1);
    bg.addColorStop(0.55, pal.bg0);
    bg.addColorStop(1, pal.bg1);
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    // стол
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
    // стрелки-вставки к главным выстрелам (гаснущие силуэты; горящие — в кадре)
    g.restore();

    // стенки
    for (const c0 of table.colliders) {
      if (c0.type !== 'seg') continue;
      const k = c0.kind;
      if (k === 'rubber' || k === 'sling' || k === 'target' || k === 'drop') continue;
      let color = pal.rail;
      let width = 5;
      if (k === 'guide') {
        color = pal.guide;
        width = 4;
      } else if (k === 'gate') {
        color = pal.text;
        width = 2.5;
      } else if (k === 'platform') {
        color = pal.rubber;
        width = 4;
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
    // дорожка запуска: пружина — в кадре; подпись
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

  function buildOver() {
    const c = offscreen(W * px(), H * px());
    const g = c.getContext('2d');
    g.scale(px(), px());
    g.lineCap = 'round';
    g.lineJoin = 'round';
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
    }
    // крыша лунки гиперпространства — «станция»
    const cup = el.cup;
    g.fillStyle = rgba(pal.cyan, 0.08);
    g.fillRect(cup.x0, cup.y0, cup.x1 - cup.x0, cup.y1 - cup.y0);
    return c;
  }

  // ---------- кадр ----------

  const lit = (on, blink = false) => (on ? (blink ? 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(now * 9)) : 1) : 0);

  function insert(x, y, color, level, r = 16) {
    // гаснущая «лампа»: тёмный кружок с каймой
    ctx.fillStyle = rgba(color, 0.12 + level * 0.25);
    ctx.beginPath();
    ctx.arc(x, y, r * 0.55, 0, TAU);
    ctx.fill();
    if (level > 0) {
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(color, x, y, r * 2.1, level * 0.9);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = rgba('#ffffff', 0.5 * level);
      ctx.beginPath();
      ctx.arc(x, y, r * 0.28, 0, TAU);
      ctx.fill();
    }
  }

  function chevron(x, y, color, level, size = 16, dir = -1) {
    ctx.strokeStyle = rgba(color, 0.18 + level * 0.8);
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - size, y - dir * size * 0.5);
    ctx.lineTo(x, y + dir * size * 0.5);
    ctx.lineTo(x + size, y - dir * size * 0.5);
    ctx.stroke();
    if (level > 0) {
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(color, x, y, size * 2, level * 0.6);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  function bar(a, b, color, up, level) {
    ctx.lineCap = 'round';
    if (!up) {
      ctx.strokeStyle = rgba(color, 0.2);
      ctx.lineWidth = 4;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(...a);
      ctx.lineTo(...b);
      ctx.stroke();
      ctx.setLineDash([]);
      return;
    }
    ctx.strokeStyle = rgba(color, 0.55 + 0.45 * level);
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(...a);
    ctx.lineTo(...b);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    if (level > 0) {
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(color, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 30, 0.55 * level);
      ctx.globalCompositeOperation = 'source-over';
    }
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

  function drawBumper(b, color, level, layerAlpha = 1) {
    const f = flashLevel(b.id);
    const r = b.r * (1 + f * 0.12);
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(color, b.x, b.y, r * 2.2, (0.35 + level * 0.18 + f) * layerAlpha);
    ctx.globalCompositeOperation = 'source-over';
    const grd = ctx.createRadialGradient(b.x - r * 0.3, b.y - r * 0.35, r * 0.1, b.x, b.y, r);
    grd.addColorStop(0, f > 0.2 ? '#ffffff' : rgba(color, 0.95));
    grd.addColorStop(0.55, rgba(color, 0.7));
    grd.addColorStop(1, rgba(pal.bg0, 1));
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(b.x, b.y, r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = f > 0 ? '#ffffff' : rgba(color, 0.95);
    ctx.lineWidth = 4;
    ctx.stroke();
    // кольцо «уровня прокачки»
    ctx.strokeStyle = rgba('#ffffff', 0.35 + 0.15 * level);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(b.x, b.y, r * 0.58, 0, TAU);
    ctx.stroke();
    for (let k = 0; k < level; k++) {
      const a = -Math.PI / 2 + (k - (level - 1) / 2) * 0.55;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(b.x + Math.cos(a) * r * 0.78, b.y + Math.sin(a) * r * 0.78, 3, 0, TAU);
      ctx.fill();
    }
  }

  function drawRubber(id, a, b, color) {
    const f = flashLevel(id);
    ctx.lineCap = 'round';
    ctx.strokeStyle = f > 0 ? '#ffffff' : rgba(color, 0.9);
    ctx.lineWidth = 9 + f * 4;
    ctx.beginPath();
    ctx.moveTo(...a);
    ctx.lineTo(...b);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;
    ctx.stroke();
    if (f > 0) {
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(color, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 90, f);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  function drawHole(h, color, level, spin, dark = false) {
    const r = h.r;
    ctx.fillStyle = '#02010a';
    ctx.beginPath();
    ctx.arc(h.x, h.y, r, 0, TAU);
    ctx.fill();
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.rotate(now * spin);
    ctx.lineWidth = 3;
    for (let k = 0; k < 3; k++) {
      ctx.strokeStyle = rgba(color, (dark ? 0.35 : 0.5) + level * 0.4);
      ctx.beginPath();
      ctx.arc(0, 0, r * (0.45 + k * 0.22), k * 2.1, k * 2.1 + 3.4);
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = rgba(color, 0.85);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(h.x, h.y, r, 0, TAU);
    ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(color, h.x, h.y, r * 2.4, 0.3 + level * 0.7);
    ctx.globalCompositeOperation = 'source-over';
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
    const grd = ctx.createLinearGradient(f.x - nx * f.r0, f.y - ny * f.r0, f.x + nx * f.r0, f.y + ny * f.r0);
    grd.addColorStop(0, tilted ? '#55586e' : pal.flipper[1]);
    grd.addColorStop(1, tilted ? '#8a8ca3' : pal.flipper[0]);
    ctx.fillStyle = grd;
    ctx.fill();
    ctx.strokeStyle = tilted ? '#555' : rgba(pal.rubber, 0.95);
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = rgba(pal.bg0, 0.9);
    ctx.beginPath();
    ctx.arc(f.x, f.y, 6, 0, TAU);
    ctx.fill();
    if (f.pressed && !tilted) {
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(pal.cyan, (f.x + tx) / 2, (f.y + ty) / 2, 80, 0.35);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  function drawPlunger(pull) {
    const top = PLUNGER_Y + pull * 55;
    ctx.fillStyle = rgba(pal.bg0, 0.8);
    ctx.fillRect(917, PLUNGER_Y - 2, 61, H - PLUNGER_Y);
    // пружина
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
    const grd = ctx.createLinearGradient(0, top - 6, 0, top + 12);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(1, pal.flipper[1]);
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(922, top - 4, 51, 16, 6) : ctx.rect(922, top - 4, 51, 16);
    ctx.fill();
    if (pull > 0) {
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(pull > 0.97 ? pal.gold : pal.cyan, LANE_X, top, 60, 0.3 + pull * 0.5);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  function drawBall(b) {
    // след
    if (b.trail?.length) {
      ctx.globalCompositeOperation = 'lighter';
      const n = b.trail.length;
      for (let k = 0; k < n; k++) {
        const p = b.trail[k];
        const a = ((k + 1) / n) * 0.22;
        drawGlow(pal.cyan, p[0], p[1], BALL_R * (0.6 + (k / n) * 0.9), a);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    // тень
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(b.x + 5, b.y + 7, BALL_R, BALL_R * 0.8, 0, 0, TAU);
    ctx.fill();
    const r = BALL_R + 2;
    ctx.drawImage(ballSprite, b.x - r, b.y - r, r * 2, r * 2);
  }

  function drawParticles(dt) {
    ctx.globalCompositeOperation = 'lighter';
    for (let k = particles.length - 1; k >= 0; k--) {
      const p = particles[k];
      p.life -= dt;
      if (p.life <= 0) {
        particles.splice(k, 1);
        continue;
      }
      p.vx *= 1 - 2.2 * dt;
      p.vy = p.vy * (1 - 2.2 * dt) + 600 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const a = p.life / p.max;
      drawGlow(p.color, p.x, p.y, p.size * (0.6 + a * 0.6), a);
    }
    for (let k = rings.length - 1; k >= 0; k--) {
      const r = rings[k];
      r.t += dt;
      const q = r.t / r.dur;
      if (q >= 1) {
        rings.splice(k, 1);
        continue;
      }
      ctx.strokeStyle = rgba(r.color, (1 - q) * 0.8);
      ctx.lineWidth = 5 * (1 - q) + 1;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * (1 - (1 - q) ** 2), 0, TAU);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Всё, что меняется: состояние правил g, мир (шарики, флипперы, мишени), пружина, dt. */
  function draw(view, dt) {
    now += dt;
    const g = view.g;
    const tilted = g.tilted;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let sx = 0;
    let sy = 0;
    if (shakeT > 0) {
      shakeT = Math.max(0, shakeT - dt);
      const k = shakeAmp * (shakeT / 0.35);
      sx = (Math.random() - 0.5) * k;
      sy = (Math.random() - 0.5) * k;
    }
    ctx.setTransform(px(), 0, 0, px(), sx * px(), sy * px());
    ctx.drawImage(under, 0, 0, W, H);

    // ----- колодец: спираль, огни звания, название звания -----
    const wl = el.well;
    ctx.save();
    ctx.translate(wl.x, wl.y);
    ctx.rotate(now * (g.wellActive ? 1.6 : 0.25));
    ctx.strokeStyle = rgba(pal.violet, g.wellActive ? 0.55 : 0.16);
    ctx.lineWidth = 3;
    for (let k = 0; k < 4; k++) {
      ctx.beginPath();
      for (let q = 0; q <= 28; q++) {
        const t = q / 28;
        const a = k * (TAU / 4) + t * 3.2;
        const r = wl.r * (0.95 - t * 0.8);
        if (q) ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        else ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.stroke();
    }
    ctx.restore();
    if (g.wellActive) {
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(pal.violet, wl.x, wl.y, wl.r * 1.1, 0.35 + 0.15 * Math.sin(now * 5));
      ctx.globalCompositeOperation = 'source-over';
    }
    // огни прогресса звания — дуга из 18 долек
    for (let k = 0; k < PROGRESS_FULL; k++) {
      const a0 = Math.PI * 0.75 + (k / PROGRESS_FULL) * Math.PI * 1.5;
      const a1 = a0 + (Math.PI * 1.5) / PROGRESS_FULL - 0.05;
      const on = k < g.progress;
      ctx.strokeStyle = on ? pal.gold : rgba(pal.gold, 0.14);
      ctx.lineWidth = 9;
      ctx.lineCap = 'butt';
      ctx.beginPath();
      ctx.arc(wl.x, wl.y, wl.r * 0.83, a0, a1);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'lighter';
    if (g.progress > 0) drawGlow(pal.gold, wl.x, wl.y - wl.r * 0.83, 50, 0.2);
    ctx.globalCompositeOperation = 'source-over';
    ctx.textAlign = 'center';
    ctx.font = '600 22px system-ui, "Segoe UI", sans-serif';
    ctx.fillStyle = rgba(pal.text, 0.45);
    ctx.fillText('ЗВАНИЕ', wl.x, wl.y - 18);
    ctx.font = '800 40px system-ui, "Segoe UI", sans-serif';
    ctx.fillStyle = rgba(pal.gold, 0.9);
    const rank = RANKS[g.rank].toUpperCase();
    ctx.font = `800 ${rank.length > 12 ? 28 : 40}px system-ui, "Segoe UI", sans-serif`;
    ctx.fillText(rank, wl.x, wl.y + 22);
    // шевроны звания
    for (let k = 0; k <= Math.min(8, g.rank); k++) {
      const cxk = wl.x + (k - Math.min(8, g.rank) / 2) * 20;
      ctx.strokeStyle = rgba(pal.gold, 0.7);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cxk - 7, wl.y + 44);
      ctx.lineTo(cxk, wl.y + 51);
      ctx.lineTo(cxk + 7, wl.y + 44);
      ctx.stroke();
    }

    // ----- вставки-огни -----
    el.reentry.forEach((l, k) => insert(l.x, l.y, pal.cyan, lit(g.reentryLit[k])));
    el.launchLanes.forEach((l, k) => insert(l.x, l.y, pal.rubber, lit(g.launchLit[k]), 13));
    const fl = fuelLights(g);
    el.fuel.forEach((l, k) => insert(l.x, l.y, fl <= 1 ? pal.red : pal.gold, lit(k < fl, fl <= 1 && g.mission), 15));
    el.missionTargets.forEach((m, k) => {
      const [x, y] = [(m.a[0] + m.b[0]) / 2 + 26, (m.a[1] + m.b[1]) / 2];
      insert(x, y, pal.green, lit(g.misLit[k], Boolean(g.missionPick && !g.mission)), 12);
    });
    // множитель поля ×2 ×3 ×5 ×10
    [[238, 420], [262, 440], [286, 460], [310, 480]].forEach(([x, y], k) => insert(x, y, pal.cyan, lit(g.multLevel > k), 12));
    // гиперпространство: 5 шевронов к устью
    for (let k = 0; k < 5; k++) chevron(797, 950 - k * 40, pal.cyan, lit(g.hyperLit > k, g.hyperLit === k && k === 1), 17);
    // рампа: шевроны к устью — мигают, когда можно принять миссию
    for (let k = 0; k < 3; k++) {
      const on = g.missionPick && !g.mission ? lit(true, true) : lit(g.reflex.ramp > 0);
      chevron(330, 1060 - k * 36, pal.violet, on, 17);
    }
    // медали, режимы ускорителей
    [[455, 780], [485, 788], [515, 796]].forEach(([x, y], k) => insert(x, y, pal.gold, lit(g.medalLevel > k), 11));
    ['flags', 'jackpot', 'bonus', 'hold'].forEach((m, k) => insert(738, 1118 + k * 32, pal.rubber, lit(g.modes[m] > 0, g.modes[m] > 0 && g.modes[m] < 8), 11));
    // спасатели, доп. шарик, сохранение шарика, искривление
    insert(57, 1510, pal.green, lit(g.kickL), 15);
    insert(877, 1510, pal.green, lit(g.kickR), 15);
    insert(57, 1350, pal.gold, lit(g.extraLit > 0, true), 12);
    insert(877, 1350, pal.gold, lit(g.extraLit > 0, true), 12);
    insert(500, 1590, pal.cyan, lit(g.ballSave > 0 || (!g.inPlay && !g.over), g.ballSave > 0 && g.ballSave < 3), 15);
    insert(el.warp.x, el.warp.y, pal.violet, lit(g.warpTimer > 0, true), 18);
    insert(132, 1470, pal.gold, lit(g.bonusLane, true), 12);

    // ----- лунки -----
    const holes = el.holes;
    drawHole(holes.hyper, pal.cyan, lit(g.hyperLit > 0), 3);
    drawHole(holes.black, pal.violet, lit(g.mission?.id === 'blackHole'), -1.2, true);
    for (const c of ['G', 'R', 'Y']) {
      const color = c === 'G' ? pal.green : c === 'R' ? pal.red : pal.gold;
      drawHole(holes[`worm${c}`], color, lit(g.wormOpen, g.wormOpen && g.wormExit === c), g.wormOpen ? 4 : 1.2);
    }

    // ----- мишени -----
    const dropUp = view.dropUp;
    el.multTargets.forEach((m, k) => bar(m.a, m.b, pal.cyan, dropUp[m.id], 0.4));
    el.medalTargets.forEach((m) => bar(m.a, m.b, pal.gold, dropUp[m.id], 0.4));
    el.boostTargets.forEach((m) => bar(m.a, m.b, pal.rubber, dropUp[m.id], 0.4));
    el.hazL.forEach((m, k) => bar(m.a, m.b, pal.green, true, lit(g.spots.hazL[k])));
    el.hazR.forEach((m, k) => bar(m.a, m.b, pal.red, true, lit(g.spots.hazR[k])));
    el.fuelTargets.forEach((m, k) => bar(m.a, m.b, pal.gold, true, lit(g.spots.fuelT[k])));
    el.missionTargets.forEach((m, k) => bar(m.a, m.b, pal.green, true, lit(g.misLit[k])));
    bar(el.wormT.a, el.wormT.b, pal.violet, true, lit(g.wormOpen));

    // ----- рогатки, резинки, бамперы, стойка -----
    drawRubber('slingL', [258, 1338], [325, 1542], pal.rubber);
    drawRubber('slingR', [742, 1338], [675, 1542], pal.rubber);
    drawRubber('rebL', [150, 725], [258, 792], pal.rubber);
    drawRubber('rebR', [728, 648], [694, 578], pal.rubber);
    el.attackBumpers.forEach((b) => drawBumper(b, pal.gold, g.attackLevel));
    drawBumper(el.satellite, pal.cyan, g.mission?.id === 'satelliteRetrieval' ? 2 : 0);
    el.launchBumpers.forEach((b) => drawBumper(b, pal.rubber, g.launchLevel));
    if (view.postUp) {
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(pal.cyan, el.post.x, el.post.y, 40, 0.7);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(el.post.x, el.post.y, el.post.r, 0, TAU);
      ctx.fill();
    }
    // спиннер (флажок в топливном канале)
    const sp = el.spinner;
    const w = Math.abs(Math.cos(view.spinAngle || 0));
    ctx.strokeStyle = rgba(pal.gold, 0.5 + 0.5 * (1 - w));
    ctx.lineWidth = 6 + 10 * w;
    ctx.beginPath();
    ctx.moveTo(sp.a[0] + 8, sp.a[1]);
    ctx.lineTo(sp.b[0] - 8, sp.b[1]);
    ctx.stroke();

    // ----- флипперы, пружина -----
    for (const f of table.flippers) drawFlipper(f, tilted);
    drawPlunger(view.pull || 0);

    // ----- шарики -----
    for (const b of view.balls) if (!b.hidden && b.layer === 0 && !b.riding) drawBall(b);
    ctx.drawImage(over, 0, 0, W, H);
    for (const b of view.balls) if (!b.hidden && (b.layer === 1 || b.riding)) drawBall(b);

    drawParticles(dt);

    if (whiteT > 0) {
      whiteT = Math.max(0, whiteT - dt);
      ctx.fillStyle = `rgba(255,255,255,${whiteT * 1.4})`;
      ctx.fillRect(-20, -20, W + 40, H + 40);
    }
  }

  return {
    get scale() {
      return s;
    },
    /** Размер холста в css px (стол вписан целиком), dpr — плотность пикселей. */
    resize(cssW, cssH, ratio) {
      dpr = Math.min(2, ratio || 1);
      s = Math.min(cssW / W, cssH / H);
      canvas.width = Math.round(W * s * dpr);
      canvas.height = Math.round(H * s * dpr);
      canvas.style.width = `${W * s}px`;
      canvas.style.height = `${H * s}px`;
      glowCache = new Map();
      under = buildUnder();
      over = buildOver();
      ballSprite = makeBall();
    },
    setSkin(id) {
      pal = SKINS[id] ?? SKINS.nebula;
      glowCache = new Map();
      if (under) {
        under = buildUnder();
        over = buildOver();
        ballSprite = makeBall();
      }
    },
    draw,
    hit(id) {
      flash.set(id, now);
    },
    burst(x, y, color, n = 12, speed = 500) {
      const c = pal[color] ?? color;
      for (let k = 0; k < n && particles.length < 240; k++) {
        const a = Math.random() * TAU;
        const v = speed * (0.35 + Math.random() * 0.8);
        const life = 0.35 + Math.random() * 0.45;
        particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, color: c, size: 7 + Math.random() * 8 });
      }
    },
    ring(x, y, color, r0 = 20, r1 = 90, dur = 0.4) {
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
