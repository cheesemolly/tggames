// Отрисовка «Змейки» «типа 3D» (не настоящее): стол под наклоном с перспективой. Дальний край стола уже
// ближнего (масштаб ряда растёт от back у дальнего края до 1 у ближнего), ряды к дальнему краю ниже. У предметов
// видна верхняя грань, передняя стенка и боковая, повёрнутая к центру (как если смотреть сверху-спереди).
// Направления на экране совпадают с полем: свайп вверх — змейка вверх.
//
// Всё рисуется через проекцию P(x, y, z): x, y — в клетках (дробные — для плавного движения), z — высота
// в ширинах клетки. Предметы — от дальних рядов к ближним, в ряду — от краёв к центру (так боковые грани
// перекрываются правильно).
//
// Змейка движется плавно: сегмент рисуется между прошлой и нынешней клеткой (t — доля шага), промежутки
// между сегментами заполняют «перемычки» — тело цельное.

import { xy, spikeUp, spikeSoon, moverCell, BONUS_TTL } from './logic.js';

// Два вида (настройка): '3d' — стол с перспективой, '2d' — строго сверху (плоско, без граней и высоты).
const VIEWS = {
  '3d': { row: 0.8, back: 0.8, plinth: 0.45, z: 1 },
  '2d': { row: 1, back: 1, plinth: 0, z: 0 },
};
const WALL_H = 0.5;          // высота стен (в ширинах клетки)
const SNAKE_H = 0.36;
const RIM = 0.26;            // бортик

const PORTAL_COLORS = { a: '#22d3ee', b: '#e879f9', c: '#fb923c' };

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let W = 0;
  let H = 0;
  let dpr = 1;
  let L = null;
  let floorCache = null;
  let floorKey = '';
  let V = VIEWS['3d'];         // row — высота ряда у ближнего края, back — масштаб дальнего края,
                               // plinth — толщина стола спереди, z — множитель высоты (0 — плоско)

  function setView(view) {
    V = VIEWS[view] ?? VIEWS['3d'];
    floorKey = '';
  }
  const flat = () => V.z === 0;

  function resize(width, height) {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = width;
    H = height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    floorKey = '';
  }

  // ---------- проекция ----------

  function layout(cols, rows) {
    // высота стола в клетках: ряды с перспективой + стены у дальнего края + бортик и толщина спереди
    const depthCells = V.row * rows * (1 + V.back) / 2;
    const lift = WALL_H * V.back * V.z;
    const c = Math.min(W / (cols + RIM * 2 + 0.4), H / (depthCells + lift + RIM * 2 + V.plinth + 0.3));
    const rh = c * V.row;
    const total = (depthCells + lift + RIM * 2 + V.plinth) * c;
    const oy = (H - total) / 2 + (lift + RIM) * c;
    return { c, rh, cx: W / 2, oy, cols, rows };
  }

  const sc = (y) => V.back + (1 - V.back) * (y / L.rows);
  const rowY = (y) => L.oy + L.rh * (V.back * y + ((1 - V.back) * y * y) / (2 * L.rows));

  /** Точка поля (x, y в клетках, z — высота в ширинах клетки) на экране. */
  function P(x, y, z = 0) {
    const k = sc(y);
    return { x: L.cx + (x - L.cols / 2) * L.c * k, y: rowY(y) - z * V.z * L.c * k };
  }

  /** Центр клетки (экранные координаты) — для частиц и надписей. */
  function cellCenter(x, y, lift = 0) {
    if (!L) return { x: 0, y: 0 };
    return P(x + 0.5, y + 0.5, lift);
  }

  /** Ширина клетки на экране в ряду y. */
  const unit = (y) => L.c * sc(y);

  // ---------- примитивы ----------

  function poly(points, fill, round = 0) {
    ctx.beginPath();
    points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (round > 0) {
      // скругление: обводка того же цвета со скруглёнными стыками
      ctx.lineJoin = 'round';
      ctx.lineWidth = round;
      ctx.strokeStyle = fill;
      ctx.stroke();
    }
  }

  /**
   * Кубик: верх, передняя стенка и боковая (к центру). x, y — угол в клетках, span — размер в клетках,
   * inset — отступ внутрь, round — скругление (px, за счёт обводки; отступ на него уже учтён).
   */
  function cube(x, y, h, top, front, { inset = 0.04, spanX = 1, spanY = 1, round = 0, sideColor = null } = {}) {
    const k = unit(y + spanY);
    const r = round * k;
    const pad = inset + round / 2;
    const x0 = x + pad;
    const x1 = x + spanX - pad;
    const y0 = y + pad;
    const y1 = y + spanY - pad;
    if (x1 <= x0 || y1 <= y0) return;
    const A = P(x0, y0, h);
    const B = P(x1, y0, h);
    const C = P(x1, y1, h);
    const D = P(x0, y1, h);
    const E = P(x1, y1, 0);
    const F = P(x0, y1, 0);
    const side = sideColor ?? shade(front, 0.1);
    const mid = L.cols / 2;
    if (x1 < mid - 0.01) poly([B, C, E, P(x1, y0, 0)], side, r);            // правая грань смотрит к центру
    else if (x0 > mid + 0.01) poly([A, D, F, P(x0, y0, 0)], side, r);       // левая
    poly([D, C, E, F], front, r);
    poly([A, B, C, D], top, r);
    if (flat()) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(1.5, k * 0.06);
      ctx.strokeStyle = front;
      ctx.beginPath();
      [A, B, C, D].forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
      ctx.closePath();
      ctx.stroke();
    }
  }

  function shadow(x, y, rx, ry, alpha = 0.25) {
    const p = P(x + 0.5, y + 0.58);
    const u = unit(y + 0.5);
    ctx.fillStyle = `rgba(0,0,0,${alpha})`;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, rx * u, ry * u * V.row, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function sphere(x, y, lift, r, color, hi = 'rgba(255,255,255,0.75)') {
    const p = cellCenter(x, y, lift);
    const R = r * unit(y + 0.5);
    const g = ctx.createRadialGradient(p.x - R * 0.35, p.y - R * 0.4, R * 0.1, p.x, p.y, R);
    g.addColorStop(0, hi);
    g.addColorStop(0.25, color);
    g.addColorStop(1, shade(color, -0.35));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, R, 0, Math.PI * 2);
    ctx.fill();
    return { ...p, R };
  }

  // ---------- стол ----------

  function drawFloor(s, pal) {
    const key = `${W}x${H}:${s.cols}x${s.rows}:${Object.values(pal).join()}`;
    if (!(floorCache && floorKey === key)) {
      floorCache ??= document.createElement('canvas');
      floorCache.width = canvas.width;
      floorCache.height = canvas.height;
      const f = floorCache.getContext('2d');
      f.setTransform(dpr, 0, 0, dpr, 0, 0);
      f.clearRect(0, 0, W, H);
      renderFloor(f, s, pal);
      floorKey = key;
    }
    ctx.drawImage(floorCache, 0, 0, W, H);
  }

  /** Стол со всеми клетками — рисуется один раз в кэш (меняется только при смене размера или скина). */
  function renderFloor(f, s, pal) {
    {
      const cols = s.cols;
      const rows = s.rows;
      const rim = RIM;
      const g = (x, y, z = 0) => P(x, y, z);
      // тень под столом
      f.fillStyle = 'rgba(0,0,0,0.25)';
      f.beginPath();
      const s1 = g(-rim, rows + rim);
      const s2 = g(cols + rim, rows + rim);
      f.ellipse((s1.x + s2.x) / 2, s1.y + V.plinth * L.c + 6, (s2.x - s1.x) / 2 + 8, L.c * 0.5, 0, 0, Math.PI * 2);
      f.fill();
      // толщина стола спереди
      const fl = g(-rim, rows + rim);
      const fr = g(cols + rim, rows + rim);
      polyOn(f, [fl, fr, { x: fr.x, y: fr.y + V.plinth * L.c }, { x: fl.x, y: fl.y + V.plinth * L.c }], pal.edge);
      // боковины стола (видны из-за перспективы)
      const bl = g(-rim, -rim);
      const br = g(cols + rim, -rim);
      polyOn(f, [bl, fl, { x: fl.x, y: fl.y + V.plinth * L.c }, { x: bl.x, y: bl.y + V.plinth * L.c * V.back }], shade(pal.edge, -0.15));
      polyOn(f, [br, fr, { x: fr.x, y: fr.y + V.plinth * L.c }, { x: br.x, y: br.y + V.plinth * L.c * V.back }], shade(pal.edge, -0.15));
      // бортик
      polyOn(f, [bl, br, fr, fl], pal.rimTop);
      // клетки
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const q = [g(x, y), g(x + 1, y), g(x + 1, y + 1), g(x, y + 1)];
          polyOn(f, q, (x + y) % 2 ? pal.floor2 : pal.floor1, 0.6);
        }
      }
      // дымка к дальнему краю — глубина
      const top = g(0, 0).y;
      const bottom = g(0, rows).y;
      const grad = f.createLinearGradient(0, top, 0, bottom);
      grad.addColorStop(0, 'rgba(0,0,0,0.16)');
      grad.addColorStop(0.55, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(255,255,255,0.06)');
      polyOn(f, [g(0, 0), g(cols, 0), g(cols, rows), g(0, rows)], grad);
      // внутренняя тень бортика
      f.strokeStyle = 'rgba(0,0,0,0.28)';
      f.lineWidth = Math.max(1, L.c * 0.06);
      f.beginPath();
      [g(0, 0), g(cols, 0), g(cols, rows), g(0, rows)].forEach((p, i) => (i ? f.lineTo(p.x, p.y) : f.moveTo(p.x, p.y)));
      f.closePath();
      f.stroke();
    }
  }

  function polyOn(c2, points, fill, grow = 0) {
    c2.beginPath();
    points.forEach((p, i) => (i ? c2.lineTo(p.x, p.y) : c2.moveTo(p.x, p.y)));
    c2.closePath();
    c2.fillStyle = fill;
    c2.fill();
    if (grow) {
      // клетки чуть внахлёст — без щелей сглаживания
      c2.lineWidth = grow;
      c2.strokeStyle = fill;
      c2.stroke();
    }
  }

  // ---------- предметы ----------

  function drawPortal(p, s, time) {
    for (const cell of [p.a, p.b]) {
      const { x, y } = xy(s, cell);
      const q = cellCenter(x, y);
      const u = unit(y + 0.5);
      const color = PORTAL_COLORS[p.id] ?? '#22d3ee';
      const rx = u * 0.42;
      const ry = u * V.row * 0.42;
      const g = ctx.createRadialGradient(q.x, q.y, 1, q.x, q.y, rx);
      g.addColorStop(0, '#0b1020');
      g.addColorStop(0.7, shade(color, -0.4));
      g.addColorStop(1, color);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(q.x, q.y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1.5, u * 0.07);
      ctx.setLineDash([u * 0.18, u * 0.12]);
      ctx.lineDashOffset = -time * u * 0.8;
      ctx.beginPath();
      ctx.ellipse(q.x, q.y, rx * 0.8, ry * 0.8, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  const SPIKE_SPOTS = [[0.28, 0.3], [0.72, 0.3], [0.28, 0.72], [0.72, 0.72]];

  function drawSpikeFloor(sp, s) {
    const { x, y } = xy(s, sp.idx);
    const u = unit(y + 0.5);
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    for (const [dx, dy] of SPIKE_SPOTS) {
      const q = P(x + dx, y + dy);
      ctx.beginPath();
      ctx.ellipse(q.x, q.y, u * 0.07, u * 0.05, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawSpikes(sp, s, pal, rise) {
    const { x, y } = xy(s, sp.idx);
    const u = unit(y + 0.5);
    for (const [dx, dy] of SPIKE_SPOTS) {
      const b = P(x + dx, y + dy);
      const tip = flat() ? P(x + dx, y + dy - 0.26 * rise) : P(x + dx, y + dy, 0.45 * rise);
      const w = u * 0.13;
      ctx.fillStyle = pal.spikeSide;
      ctx.beginPath();
      ctx.moveTo(b.x - w, b.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.lineTo(b.x + w, b.y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = pal.spike;
      ctx.beginPath();
      ctx.moveTo(b.x - w, b.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.lineTo(b.x, b.y + w * 0.3);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawMover(m, s, pal, time) {
    const cur = xy(s, moverCell(m));
    const bob = Math.sin(time * 6 + m.path[0]) * 0.03;
    shadow(cur.x, cur.y, 0.4, 0.3, 0.3);
    cube(cur.x, cur.y, 0.52 + bob, pal.mover, shade(pal.mover, -0.35), { inset: 0.06, round: 0.14 });
    // сердитые глаза смотрят по ходу — на передней стенке
    const u = unit(cur.y + 1);
    const horiz = m.path.length > 1 && Math.abs(m.path[1] - m.path[0]) === 1;
    const look = m.step;
    const ex = horiz ? look * u * 0.06 : 0;
    const ey = horiz ? 0 : look * u * 0.05;
    for (const side of [-1, 1]) {
      const c = flat() ? P(cur.x + 0.5 + side * 0.17, cur.y + 0.45) : P(cur.x + 0.5 + side * 0.17, cur.y + 0.92, 0.3 + bob);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(c.x, c.y, u * 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.arc(c.x + ex, c.y + ey, u * 0.05, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#111';
      ctx.lineWidth = Math.max(1.5, u * 0.05);
      ctx.beginPath();
      ctx.moveTo(c.x - side * u * 0.12, c.y - u * 0.15);
      ctx.lineTo(c.x + side * u * 0.04, c.y - u * 0.09);
      ctx.stroke();
    }
  }

  /** Где еда сейчас (в клетках, левый верхний угол): у летающей — между прошлой и нынешней точкой. */
  function foodPos(f, s, t) {
    if (f.fx != null) {
      const px = f.px ?? f.fx;
      const py = f.py ?? f.fy;
      return { x: px + (f.fx - px) * t, y: py + (f.fy - py) * t };
    }
    return xy(s, f.idx);
  }

  function drawFood(f, s, pal, time, t) {
    const { x, y } = foodPos(f, s, t);
    const u = unit(y + 0.5);
    const bob = 0.24 + Math.sin(time * 4 + f.idx) * 0.05;
    shadow(x, y, 0.26, 0.22, 0.22);
    if (f.kind === 'apple') {
      drawFruit(f.fruit ?? 'apple', x, y, bob, u, pal, time);
      if (f.pair) {
        const c = cellCenter(x, y, bob);
        ctx.strokeStyle = PORTAL_COLORS.a;
        ctx.lineWidth = Math.max(1.5, u * 0.05);
        ctx.beginPath();
        ctx.arc(c.x, c.y, u * 0.42, 0, Math.PI * 2);
        ctx.stroke();
      }
      return;
    }
    if (f.kind === 'bonus') {
      const q = cellCenter(x, y);
      ctx.strokeStyle = 'rgba(255,215,64,0.9)';
      ctx.lineWidth = Math.max(2, u * 0.07);
      ctx.beginPath();
      ctx.ellipse(q.x, q.y + u * 0.05, u * 0.44, u * V.row * 0.4, 0, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (f.ttl / BONUS_TTL));
      ctx.stroke();
      if (f.ttl < 10 && Math.floor(time * 8) % 2 === 0) return;
      const p = cellCenter(x, y, bob + 0.08);
      if (f.bonus === 'star') starShape(p.x, p.y, u * 0.34, u * 0.15, '#ffd23f', '#e59b00', time);
      else if (f.bonus === 'gem') gemShape(p.x, p.y, u * 0.3);
      else {
        const a = sphere(x - 0.13, y, bob, 0.17, '#e11d48');
        const b = sphere(x + 0.14, y + 0.06, bob - 0.04, 0.17, '#be123c');
        const top = cellCenter(x + 0.05, y - 0.1, bob + 0.55);
        ctx.strokeStyle = '#3f7d2b';
        ctx.lineWidth = Math.max(1.5, u * 0.04);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y - a.R);
        ctx.quadraticCurveTo(top.x - u * 0.05, top.y, top.x, top.y);
        ctx.quadraticCurveTo(top.x + u * 0.02, top.y, b.x, b.y - b.R);
        ctx.stroke();
      }
      return;
    }
    if (f.kind === 'power') {
      if (f.ttl < 12 && Math.floor(time * 8) % 2 === 0) return;
      const colors = { magnet: '#ef4444', slow: '#38bdf8', shield: '#22c55e', double: '#f59e0b' };
      const p = sphere(x, y, bob, 0.32, colors[f.power]);
      powerIcon(f.power, p.x, p.y, u * 0.2);
      return;
    }
    if (f.kind === 'poison') {
      const p = cellCenter(x, y, 0.12);
      ctx.fillStyle = '#e5e7eb';
      ctx.fillRect(p.x - u * 0.08, p.y - u * 0.05, u * 0.16, u * 0.2);
      const cap = ctx.createRadialGradient(p.x - u * 0.08, p.y - u * 0.18, 1, p.x, p.y - u * 0.08, u * 0.3);
      cap.addColorStop(0, '#c4b5fd');
      cap.addColorStop(1, '#6d28d9');
      ctx.fillStyle = cap;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - u * 0.05, u * 0.3, u * 0.21, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#ede9fe';
      for (const [dx, dy] of [[-0.14, -0.13], [0.05, -0.2], [0.16, -0.1]]) {
        ctx.beginPath();
        ctx.arc(p.x + dx * u, p.y + dy * u, u * 0.04, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /** Фрукты и бургер: все — одно и то же «яблоко» по правилам (бургер — ×2 очки и +2 длины). */
  function drawFruit(kind, x, y, bob, u, pal, time) {
    if (kind === 'apple') {
      const p = sphere(x, y, bob, 0.3, pal.apple);
      stem(p.x, p.y - p.R, u, 0.5);
      return;
    }
    if (kind === 'pear') {
      sphere(x, y + 0.06, bob - 0.02, 0.28, '#a3c94a');
      const top = sphere(x, y - 0.1, bob + 0.2, 0.18, '#b8d65a');
      stem(top.x, top.y - top.R, u, -0.3);
      return;
    }
    if (kind === 'orange') {
      const p = sphere(x, y, bob, 0.3, '#fb923c', 'rgba(255,240,210,0.8)');
      ctx.fillStyle = 'rgba(160,70,0,0.35)';
      for (const [dx, dy] of [[-0.12, 0.05], [0.1, 0.12], [0.02, -0.08], [-0.05, 0.16], [0.14, -0.02]]) {
        ctx.beginPath();
        ctx.arc(p.x + dx * u, p.y + dy * u, u * 0.018, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#3fae4a';
      ctx.beginPath();
      ctx.ellipse(p.x + u * 0.06, p.y - p.R + u * 0.02, u * 0.09, u * 0.04, -0.4, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    if (kind === 'banana') {
      const c = cellCenter(x, y, bob);
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(-0.35 + Math.sin(time * 2) * 0.08);
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#d9a400';
      ctx.lineWidth = u * 0.2;
      ctx.beginPath();
      ctx.arc(0, -u * 0.32, u * 0.36, Math.PI * 0.2, Math.PI * 0.8);
      ctx.stroke();
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = u * 0.13;
      ctx.beginPath();
      ctx.arc(0, -u * 0.34, u * 0.36, Math.PI * 0.22, Math.PI * 0.78);
      ctx.stroke();
      ctx.fillStyle = '#5a3a1a';
      const end = { x: Math.cos(Math.PI * 0.2) * u * 0.36, y: -u * 0.32 + Math.sin(Math.PI * 0.2) * u * 0.36 };
      ctx.beginPath();
      ctx.arc(end.x, end.y, u * 0.045, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    if (kind === 'grapes') {
      const spots = [[-0.12, -0.12], [0, -0.14], [0.12, -0.12], [-0.06, 0], [0.06, 0], [0, 0.12]];
      for (const [dx, dy] of spots) sphere(x + dx, y + dy * 0.6, bob - dy * 0.5, 0.1, '#8b5cf6', 'rgba(230,220,255,0.8)');
      const top = cellCenter(x, y - 0.1, bob + 0.3);
      ctx.fillStyle = '#3fae4a';
      ctx.beginPath();
      ctx.ellipse(top.x + u * 0.08, top.y, u * 0.1, u * 0.05, -0.3, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    if (kind === 'strawberry') {
      const c = cellCenter(x, y, bob);
      const r = u * 0.28;
      const g = ctx.createRadialGradient(c.x - r * 0.3, c.y - r * 0.4, 1, c.x, c.y, r * 1.2);
      g.addColorStop(0, '#ff8a8a');
      g.addColorStop(0.35, '#ef233c');
      g.addColorStop(1, '#9b1024');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(c.x - r, c.y - r * 0.4);
      ctx.quadraticCurveTo(c.x, c.y - r * 1.05, c.x + r, c.y - r * 0.4);
      ctx.quadraticCurveTo(c.x + r * 0.8, c.y + r * 0.6, c.x, c.y + r * 1.1);
      ctx.quadraticCurveTo(c.x - r * 0.8, c.y + r * 0.6, c.x - r, c.y - r * 0.4);
      ctx.fill();
      ctx.fillStyle = '#fde68a';
      for (const [dx, dy] of [[-0.4, -0.1], [0, -0.2], [0.4, -0.1], [-0.2, 0.25], [0.2, 0.25], [0, 0.6]]) {
        ctx.beginPath();
        ctx.ellipse(c.x + dx * r, c.y + dy * r, r * 0.05, r * 0.08, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#22a34a';
      ctx.beginPath();
      for (let k = 0; k < 5; k++) {
        const ang = Math.PI + (k / 4) * Math.PI;
        ctx.lineTo(c.x + Math.cos(ang) * r * 0.55, c.y - r * 0.55 + Math.sin(ang) * r * 0.3);
        ctx.lineTo(c.x + Math.cos(ang + 0.3) * r * 0.2, c.y - r * 0.5);
      }
      ctx.fill();
      return;
    }
    if (kind === 'watermelon') {
      const c = cellCenter(x, y, bob);
      const r = u * 0.34;
      ctx.save();
      ctx.translate(c.x, c.y + r * 0.3);
      ctx.fillStyle = '#15803d';
      ctx.beginPath();
      ctx.arc(0, -r * 0.3, r, 0, Math.PI);
      ctx.fill();
      ctx.fillStyle = '#bbf7d0';
      ctx.beginPath();
      ctx.arc(0, -r * 0.3, r * 0.86, 0, Math.PI);
      ctx.fill();
      ctx.fillStyle = '#f43f5e';
      ctx.beginPath();
      ctx.arc(0, -r * 0.3, r * 0.78, 0, Math.PI);
      ctx.fill();
      ctx.fillStyle = '#1f2937';
      for (const [dx, dy] of [[-0.4, 0.05], [0, 0.2], [0.4, 0.05], [-0.18, 0.02], [0.2, 0.02]]) {
        ctx.beginPath();
        ctx.ellipse(dx * r, -r * 0.3 + dy * r + r * 0.1, r * 0.04, r * 0.07, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      return;
    }
    // бургер
    const c = cellCenter(x, y, bob);
    const w = u * 0.36;
    const layer = (dy, h, color, round = h / 2) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(c.x - w, c.y + dy, w * 2, h, round);
      ctx.fill();
    };
    layer(u * 0.1, u * 0.1, '#c98b3c', u * 0.05);            // нижняя булка
    layer(u * 0.02, u * 0.1, '#6b3a1e', u * 0.05);           // котлета
    ctx.fillStyle = '#facc15';                               // сыр
    ctx.beginPath();
    ctx.moveTo(c.x - w * 0.9, c.y + u * 0.01);
    ctx.lineTo(c.x + w * 0.9, c.y + u * 0.01);
    ctx.lineTo(c.x + w * 0.1, c.y + u * 0.09);
    ctx.fill();
    ctx.strokeStyle = '#4ade80';                             // салат волной
    ctx.lineWidth = u * 0.05;
    ctx.beginPath();
    for (let k = 0; k <= 8; k++) {
      const px = c.x - w + (k / 8) * w * 2;
      ctx.lineTo(px, c.y - u * 0.01 + (k % 2 ? u * 0.025 : -u * 0.01));
    }
    ctx.stroke();
    const dome = ctx.createLinearGradient(0, c.y - u * 0.26, 0, c.y);
    dome.addColorStop(0, '#f0b35a');
    dome.addColorStop(1, '#c47b2c');
    ctx.fillStyle = dome;                                    // верхняя булка
    ctx.beginPath();
    ctx.ellipse(c.x, c.y - u * 0.02, w * 1.02, u * 0.24, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = '#fff7e0';                               // кунжут
    for (const [dx, dy] of [[-0.45, -0.1], [-0.1, -0.18], [0.25, -0.12], [0.05, -0.06], [0.5, -0.05], [-0.3, -0.03]]) {
      ctx.beginPath();
      ctx.ellipse(c.x + dx * w, c.y + dy * u, u * 0.025, u * 0.015, 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function stem(x, y, u, tilt) {
    ctx.fillStyle = '#5a3a1a';
    ctx.fillRect(x - u * 0.025, y - u * 0.08, u * 0.05, u * 0.12);
    ctx.fillStyle = '#3fae4a';
    ctx.beginPath();
    ctx.ellipse(x + u * 0.09, y - u * 0.04, u * 0.1, u * 0.05, tilt, 0, Math.PI * 2);
    ctx.fill();
  }

  function starShape(x, y, R, r, fill, edge, time) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin(time * 3) * 0.25);
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      const rad = k % 2 ? r : R;
      ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = edge;
    ctx.lineWidth = Math.max(1.5, R * 0.12);
    ctx.stroke();
    ctx.restore();
  }

  function gemShape(x, y, R) {
    ctx.beginPath();
    ctx.moveTo(x, y - R);
    ctx.lineTo(x + R * 0.85, y - R * 0.2);
    ctx.lineTo(x, y + R);
    ctx.lineTo(x - R * 0.85, y - R * 0.2);
    ctx.closePath();
    ctx.fillStyle = '#38bdf8';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, y - R);
    ctx.lineTo(x + R * 0.85, y - R * 0.2);
    ctx.lineTo(x, y - R * 0.05);
    ctx.lineTo(x - R * 0.85, y - R * 0.2);
    ctx.closePath();
    ctx.fillStyle = '#bae6fd';
    ctx.fill();
  }

  function powerIcon(kind, x, y, r) {
    ctx.strokeStyle = '#fff';
    ctx.fillStyle = '#fff';
    ctx.lineWidth = Math.max(1.5, r * 0.28);
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (kind === 'magnet') {
      ctx.arc(x, y, r * 0.6, Math.PI, 0, true);
      ctx.moveTo(x - r * 0.6, y);
      ctx.lineTo(x - r * 0.6, y - r * 0.6);
      ctx.moveTo(x + r * 0.6, y);
      ctx.lineTo(x + r * 0.6, y - r * 0.6);
      ctx.stroke();
    } else if (kind === 'slow') {
      ctx.arc(x, y, r * 0.7, 0, Math.PI * 2);
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - r * 0.45);
      ctx.moveTo(x, y);
      ctx.lineTo(x + r * 0.35, y + r * 0.2);
      ctx.stroke();
    } else if (kind === 'shield') {
      ctx.moveTo(x, y - r * 0.8);
      ctx.lineTo(x + r * 0.7, y - r * 0.5);
      ctx.quadraticCurveTo(x + r * 0.6, y + r * 0.5, x, y + r * 0.85);
      ctx.quadraticCurveTo(x - r * 0.6, y + r * 0.5, x - r * 0.7, y - r * 0.5);
      ctx.closePath();
      ctx.stroke();
    } else {
      ctx.font = `800 ${Math.round(r * 1.25)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('×2', x, y + r * 0.05);
    }
  }

  // ---------- змейка ----------

  /** Положение сегментов с учётом плавности: от прошлой клетки к нынешней. */
  function segments(s, body, prevBody, t, bump) {
    if (bump) {
      // смерть: голова «доезжает» до препятствия на долю bump.k, тело — следом за ней
      return body.map((cell, k) => {
        const cur = xy(s, cell);
        const to = k === 0 ? bump : xy(s, body[k - 1]);
        return { x: cur.x + (to.x - cur.x) * bump.k, y: cur.y + (to.y - cur.y) * bump.k, jump: false };
      });
    }
    return body.map((cell, k) => {
      const cur = xy(s, cell);
      const prevCell = prevBody?.[k];
      if (prevCell == null) return { x: cur.x, y: cur.y, jump: false };
      const prev = xy(s, prevCell);
      const far = Math.abs(prev.x - cur.x) + Math.abs(prev.y - cur.y) > 1;   // портал — без плавности
      if (far) return { x: cur.x, y: cur.y, jump: true };
      return { x: prev.x + (cur.x - prev.x) * t, y: prev.y + (cur.y - prev.y) * t, jump: false };
    });
  }

  function snakePieces(s, body, prevBody, t, colors, dir, extra, heads, bump) {
    const seg = segments(s, body, prevBody, t, bump);
    const pieces = [];
    const n = seg.length;
    const inset = (k) => 0.08 + Math.min(0.08, (k / Math.max(1, n)) * 0.1);
    for (let k = n - 1; k >= 0; k--) {
      const p = seg[k];
      const color = mix(colors.head, colors.tail, n > 1 ? k / (n - 1) : 0);
      const top = k % 3 === 1 ? shade(color, 0.14) : color;
      pieces.push({ depth: depthKey(p.x, p.y), draw: () => {
        shadow(p.x, p.y, 0.38, 0.3, 0.2);
        cube(p.x, p.y, SNAKE_H, top, shade(color, -0.3), { inset: k === 0 ? 0.04 : inset(k), round: 0.2 });
      } });
      if (k > 0) {
        const q = seg[k - 1];
        if (!q.jump && !p.jump && Math.abs(q.x - p.x) + Math.abs(q.y - p.y) <= 1.01) {
          const mx = Math.min(p.x, q.x);
          const my = Math.min(p.y, q.y);
          const spanX = Math.abs(q.x - p.x) + 1;
          const spanY = Math.abs(q.y - p.y) + 1;
          pieces.push({ depth: depthKey(mx + spanX / 2 - 0.5, Math.max(p.y, q.y)) - 0.001, draw: () => {
            cube(mx, my, SNAKE_H, color, shade(color, -0.3), { inset: inset(k), round: 0.2, spanX, spanY });
          } });
        }
      }
    }
    // глаза, язык, звёздочки — отдельно: рисуются последними, поверх всего
    const h = seg[0];
    heads.push(() => drawHead(h, dir, extra));
    return pieces;
  }

  function drawHead(h, dir, extra) {
    const u = unit(h.y + 0.5);
    const dx = { L: -1, R: 1, U: 0, D: 0 }[dir];
    const dy = { U: -1, D: 1, L: 0, R: 0 }[dir];
    const px = -dy;
    const py = dx;
    for (const side of [-1, 1]) {
      const e = P(h.x + 0.5 + px * side * 0.2 + dx * 0.12, h.y + 0.5 + py * side * 0.2 + dy * 0.12, SNAKE_H + 0.02);
      if (extra.dead) {
        // глаза крестиком
        ctx.strokeStyle = '#111';
        ctx.lineWidth = Math.max(1.5, u * 0.05);
        ctx.lineCap = 'round';
        const r = u * 0.08;
        ctx.beginPath();
        ctx.moveTo(e.x - r, e.y - r);
        ctx.lineTo(e.x + r, e.y + r);
        ctx.moveTo(e.x + r, e.y - r);
        ctx.lineTo(e.x - r, e.y + r);
        ctx.stroke();
        continue;
      }
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(e.x, e.y, u * 0.11, u * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
      const lx = extra.look?.x ?? dx;
      const ly = extra.look?.y ?? dy;
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.arc(e.x + lx * u * 0.035, e.y + ly * u * 0.03, u * 0.055, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(e.x + lx * u * 0.035 + u * 0.02, e.y + ly * u * 0.03 - u * 0.02, u * 0.018, 0, Math.PI * 2);
      ctx.fill();
    }
    if (extra.tongue) {
      const base = P(h.x + 0.5 + dx * 0.34, h.y + 0.5 + dy * 0.34, SNAKE_H * 0.4);
      const tip = P(h.x + 0.5 + dx * 0.62, h.y + 0.5 + dy * 0.62, SNAKE_H * 0.4);
      const f1 = P(h.x + 0.5 + dx * 0.72 + px * 0.08, h.y + 0.5 + dy * 0.72 + py * 0.08, SNAKE_H * 0.4);
      const f2 = P(h.x + 0.5 + dx * 0.72 - px * 0.08, h.y + 0.5 + dy * 0.72 - py * 0.08, SNAKE_H * 0.4);
      ctx.strokeStyle = '#e11d48';
      ctx.lineWidth = Math.max(1.5, u * 0.045);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(base.x, base.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.lineTo(f1.x, f1.y);
      ctx.moveTo(tip.x, tip.y);
      ctx.lineTo(f2.x, f2.y);
      ctx.stroke();
    }
    if (extra.dead) {
      // звёздочки кружат над головой
      const c = flat() ? cellCenter(h.x, h.y - 0.75) : cellCenter(h.x, h.y, SNAKE_H + 0.85);
      for (let k = 0; k < 3; k++) {
        const ang = extra.time * 3.2 + (k * Math.PI * 2) / 3;
        const sx = c.x + Math.cos(ang) * u * 0.5;
        const sy = c.y + Math.sin(ang) * u * 0.17;
        starShape(sx, sy, u * 0.16, u * 0.07, '#ffd23f', '#d69e00', 0);
      }
    }
    if (extra.shield) {
      const c = cellCenter(h.x, h.y, SNAKE_H * 0.5);
      ctx.strokeStyle = 'rgba(34,197,94,0.85)';
      ctx.lineWidth = Math.max(2, u * 0.06);
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, u * 0.62, u * 0.56, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  /** Порядок рисования: дальние ряды раньше, в ряду — края раньше центра. */
  const depthKey = (x, y) => y * 100 - Math.abs(x + 0.5 - L.cols / 2) * 0.01;

  // ---------- кадр ----------

  /** frame: { s, prevSnake, prevTwin, t, time, pal, dying (0..1 или null), blink } */
  function draw(frame) {
    const { s, t, time, pal } = frame;
    L = layout(s.cols, s.rows);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    drawFloor(s, pal);

    for (const p of s.portals) drawPortal(p, s, time);
    for (const sp of s.spikes) if (!spikeUp(sp, s.steps)) drawSpikeFloor(sp, s);
    if (s.effects.magnet > 0) {
      const hd = xy(s, s.snake[0]);
      const c = cellCenter(hd.x, hd.y);
      const u = unit(hd.y + 0.5);
      ctx.strokeStyle = 'rgba(239,68,68,0.35)';
      ctx.lineWidth = Math.max(1, u * 0.05);
      ctx.setLineDash([u * 0.2, u * 0.15]);
      ctx.lineDashOffset = time * u;
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, u * 6, u * 6 * V.row, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const items = [];
    for (let i = 0; i < s.cells.length; i++) {
      if (!s.cells[i]) continue;
      const { x, y } = xy(s, i);
      const brick = s.cells[i] === 2;
      items.push({ depth: depthKey(x, y), draw: () => {
        cube(x, y, WALL_H, brick ? pal.brick : pal.wallTop, brick ? shade(pal.brick, -0.35) : pal.wallSide, { inset: 0.01 });
        if (brick) brickLines(x, y);
      } });
    }
    for (const sp of s.spikes) {
      const up = spikeUp(sp, s.steps);
      const soon = spikeSoon(sp, s.steps);
      if (!up && !soon) continue;
      const { x, y } = xy(s, sp.idx);
      items.push({ depth: depthKey(x, y), draw: () => drawSpikes(sp, s, pal, up ? 1 : (Math.floor(time * 10) % 2 ? 0.35 : 0.15)) });
    }
    for (const m of s.movers) {
      const { x, y } = xy(s, moverCell(m));
      items.push({ depth: depthKey(x, y), draw: () => drawMover(m, s, pal, time) });
    }
    const ft = frame.foodT ?? t;
    for (const f of s.foods) {
      const { x, y } = foodPos(f, s, ft);
      items.push({ depth: depthKey(x, y) + 0.005, draw: () => drawFood(f, s, pal, time, ft) });
    }
    const hidden = frame.blink && Math.floor(time * 10) % 2 === 0;
    const heads = [];
    if (!hidden) {
      const dead = frame.dying != null;
      const who = frame.deadWho;
      const extra = {
        tongue: Math.sin(time * 2.2) > 0.85 && !dead, shield: s.effects.shield > 0, look: frame.look, time,
        dead: dead && who !== 'twin',
      };
      items.push(...snakePieces(s, s.snake, frame.prevSnake, t, { head: pal.snakeHead, tail: pal.snakeTail }, s.dir, extra, heads, frame.bump?.main));
      if (s.twin) {
        items.push(...snakePieces(s, s.twin.snake, frame.prevTwin, t, { head: pal.twinHead, tail: pal.twinTail }, s.twin.dir,
          { time, dead: dead && who !== 'main' }, heads, frame.bump?.twin));
      }
    }
    items.sort((a, b) => a.depth - b.depth);
    for (const it of items) it.draw();
    for (const draw of heads) draw();

    // передний бортик — поверх нижнего ряда
    const fl = P(-RIM, s.rows);
    const fr = P(s.cols + RIM, s.rows);
    const fl2 = P(-RIM, s.rows + RIM);
    const fr2 = P(s.cols + RIM, s.rows + RIM);
    poly([fl, fr, fr2, fl2], pal.rimTop);
  }

  function brickLines(x, y) {
    const top = P(x + 0.01, y + 0.99, WALL_H);
    const bot = P(x + 0.01, y + 0.99, 0);
    const right = P(x + 0.99, y + 0.99, 0);
    const w = right.x - bot.x;
    const h = bot.y - top.y;
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = Math.max(1, unit(y) * 0.03);
    ctx.beginPath();
    for (let k = 1; k < 3; k++) {
      ctx.moveTo(bot.x, top.y + (h * k) / 3);
      ctx.lineTo(bot.x + w, top.y + (h * k) / 3);
    }
    ctx.moveTo(bot.x + w / 2, top.y);
    ctx.lineTo(bot.x + w / 2, top.y + h / 3);
    ctx.moveTo(bot.x + w / 4, top.y + h / 3);
    ctx.lineTo(bot.x + w / 4, top.y + (h * 2) / 3);
    ctx.moveTo(bot.x + (w * 3) / 4, top.y + h / 3);
    ctx.lineTo(bot.x + (w * 3) / 4, top.y + (h * 2) / 3);
    ctx.moveTo(bot.x + w / 2, top.y + (h * 2) / 3);
    ctx.lineTo(bot.x + w / 2, top.y + h);
    ctx.stroke();
  }

  return { resize, draw, cellCenter, setView };
}

// ---------- цвета ----------

function parse(color) {
  const m = color.match(/^#([0-9a-f]{6})$/i);
  if (m) {
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const r = color.match(/rgba?\(([^)]+)\)/);
  if (r) return r[1].split(/[ ,/]+/).slice(0, 3).map(Number);
  return [128, 128, 128];
}

/** Светлее (+) или темнее (−) цвет на долю k. */
export function shade(color, k) {
  const [r, g, b] = parse(color);
  const f = (v) => Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

export function mix(a, b, k) {
  const A = parse(a);
  const B = parse(b);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * k)).join(',')})`;
}
