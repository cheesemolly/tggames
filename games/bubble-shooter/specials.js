// Бонусные шары «Шариков» — рисуются каждый кадр (анимированы) и на поле, и в панели бонусов
// (просьба владельца, 2026-09-25: «реально шарик-бомба с анимированным фитилём и дымом, радужный — переливание
// и rgb-след, огненный — горящий огонь и огненный след; анимации — и в хотбаре»).
//   drawSpecial(g, kind, x, y, rad, t) — шар радиусом rad px с центром (x, y), t — время в секундах;
//   createTrail() — частицы следа: дым бомбы, радужные точки, пламя; координаты — в единицах вызывающего.

const TAU = Math.PI * 2;

/** Детерминированный «случайный» номер: искры и языки пламени не дёргаются хаотично между кадрами. */
function hash(n) {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

export function drawSpecial(g, kind, x, y, rad, t) {
  g.save();
  if (kind === 'bomb') bomb(g, x, y, rad, t);
  else if (kind === 'rainbow') rainbow(g, x, y, rad, t);
  else fire(g, x, y, rad, t);
  g.restore();
}

function gloss(g, x, y, r, alpha = 0.7) {
  g.fillStyle = `rgba(255,255,255,${alpha})`;
  g.beginPath();
  g.ellipse(x - r * 0.33, y - r * 0.42, r * 0.28, r * 0.15, -0.6, 0, TAU);
  g.fill();
  g.fillStyle = `rgba(255,255,255,${Math.min(1, alpha + 0.2)})`;
  g.beginPath();
  g.arc(x + r * 0.1, y - r * 0.56, r * 0.06, 0, TAU);
  g.fill();
}

// ---------- бомба: чугунный шар, латунный колпачок, фитиль с искрой ----------

function bomb(g, x, y, rad, t) {
  const r = rad * 0.88;
  const cy = y + rad * 0.08;
  const body = g.createRadialGradient(x - r * 0.35, cy - r * 0.4, r * 0.05, x, cy, r);
  body.addColorStop(0, '#7b8396');
  body.addColorStop(0.4, '#30343f');
  body.addColorStop(1, '#0c0e13');
  g.fillStyle = body;
  g.beginPath();
  g.arc(x, cy, r, 0, TAU);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.18)';
  g.lineWidth = Math.max(1, r * 0.08);
  g.beginPath();
  g.arc(x, cy, r * 0.82, Math.PI * 0.15, Math.PI * 0.85);
  g.stroke();
  gloss(g, x, cy, r, 0.5);

  // колпачок сверху справа
  const ca = -Math.PI / 4;
  const kx = x + Math.cos(ca) * r * 0.86;
  const ky = cy + Math.sin(ca) * r * 0.86;
  g.save();
  g.translate(kx, ky);
  g.rotate(ca + Math.PI / 2);
  const cap = g.createLinearGradient(-r * 0.24, 0, r * 0.24, 0);
  cap.addColorStop(0, '#6b5a2e');
  cap.addColorStop(0.5, '#e0c374');
  cap.addColorStop(1, '#6b5a2e');
  g.fillStyle = cap;
  g.fillRect(-r * 0.24, -r * 0.2, r * 0.48, r * 0.26);
  g.restore();

  // фитиль качается
  const sx = kx + r * 0.1;
  const sy = ky - r * 0.12;
  const tipX = sx + r * 0.42 + Math.sin(t * 3.1) * r * 0.05;
  const tipY = sy - r * 0.42 + Math.cos(t * 2.7) * r * 0.04;
  g.lineCap = 'round';
  g.strokeStyle = '#5a4424';
  g.lineWidth = Math.max(1.5, r * 0.16);
  g.beginPath();
  g.moveTo(sx, sy);
  g.quadraticCurveTo(sx + r * 0.05, sy - r * 0.38, tipX, tipY);
  g.stroke();
  g.strokeStyle = '#c9a36a';
  g.lineWidth = Math.max(1, r * 0.09);
  g.stroke();

  // искра: свечение, лучики и ядро
  const frame = Math.floor(t * 24);
  const glow = g.createRadialGradient(tipX, tipY, 0, tipX, tipY, r * 0.55);
  glow.addColorStop(0, 'rgba(255,230,140,0.95)');
  glow.addColorStop(0.4, 'rgba(255,150,40,0.45)');
  glow.addColorStop(1, 'rgba(255,120,20,0)');
  g.fillStyle = glow;
  g.beginPath();
  g.arc(tipX, tipY, r * 0.55, 0, TAU);
  g.fill();
  g.strokeStyle = '#fff6b0';
  g.lineWidth = Math.max(1, r * 0.06);
  for (let i = 0; i < 7; i++) {
    const a = hash(frame * 13 + i) * TAU;
    const len = r * (0.18 + hash(frame * 7 + i * 3) * 0.32);
    g.beginPath();
    g.moveTo(tipX + Math.cos(a) * r * 0.08, tipY + Math.sin(a) * r * 0.08);
    g.lineTo(tipX + Math.cos(a) * len, tipY + Math.sin(a) * len);
    g.stroke();
  }
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(tipX, tipY, r * (0.08 + 0.03 * Math.sin(t * 40)), 0, TAU);
  g.fill();
}

// ---------- радуга: переливающийся перламутровый шар ----------

function rainbow(g, x, y, rad, t) {
  const r = rad * 0.96;
  // свечение цветом, который сейчас «на поверхности»
  const hue = (t * 120) % 360;
  const halo = g.createRadialGradient(x, y, r * 0.8, x, y, r * 1.35);
  halo.addColorStop(0, `hsla(${hue}, 100%, 65%, 0.55)`);
  halo.addColorStop(1, `hsla(${hue}, 100%, 65%, 0)`);
  g.fillStyle = halo;
  g.beginPath();
  g.arc(x, y, r * 1.35, 0, TAU);
  g.fill();

  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  if (g.createConicGradient) {
    const cg = g.createConicGradient(t * 2.4, x, y);
    for (let i = 0; i <= 6; i++) cg.addColorStop(i / 6, `hsl(${(i * 60 + t * 90) % 360}, 95%, 58%)`);
    g.fillStyle = cg;
    g.fill();
  } else {
    for (let i = 0; i < 12; i++) {
      g.fillStyle = `hsl(${(i * 30 + t * 90) % 360}, 95%, 58%)`;
      g.beginPath();
      g.moveTo(x, y);
      g.arc(x, y, r, t * 2.4 + (i / 12) * TAU, t * 2.4 + ((i + 1.05) / 12) * TAU);
      g.closePath();
      g.fill();
    }
  }
  // перламутр: светлая середина и объём
  const pearl = g.createRadialGradient(x - r * 0.2, y - r * 0.25, 0, x, y, r);
  pearl.addColorStop(0, 'rgba(255,255,255,0.75)');
  pearl.addColorStop(0.45, 'rgba(255,255,255,0.12)');
  pearl.addColorStop(0.85, 'rgba(0,0,0,0.05)');
  pearl.addColorStop(1, 'rgba(0,0,0,0.3)');
  g.fillStyle = pearl;
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.6)';
  g.lineWidth = Math.max(1, r * 0.07);
  g.stroke();
  gloss(g, x, y, r, 0.8);
  // искорка бегает по краю
  const a = t * 3.3;
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(x + Math.cos(a) * r * 0.78, y + Math.sin(a) * r * 0.78, r * 0.07, 0, TAU);
  g.fill();
}

// ---------- огонь: раскалённое ядро и языки пламени ----------

function flameTongue(g, bx, by, tipX, tipY, w, color) {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(bx - w, by);
  g.quadraticCurveTo(bx - w * 0.9, (by + tipY) / 2, tipX, tipY);
  g.quadraticCurveTo(bx + w * 0.9, (by + tipY) / 2, bx + w, by);
  g.closePath();
  g.fill();
}

function fire(g, x, y, rad, t) {
  const r = rad * 0.82;
  const cy = y + rad * 0.12;
  g.globalCompositeOperation = 'lighter';
  const glow = g.createRadialGradient(x, cy, r * 0.3, x, cy, r * 1.7);
  glow.addColorStop(0, 'rgba(255,150,40,0.5)');
  glow.addColorStop(1, 'rgba(255,90,20,0)');
  g.fillStyle = glow;
  g.beginPath();
  g.arc(x, cy, r * 1.7, 0, TAU);
  g.fill();
  g.globalCompositeOperation = 'source-over';

  // языки пламени — по верхней половине шара, пляшут
  const N = 7;
  const tongues = [];
  for (let i = 0; i < N; i++) {
    const a = Math.PI + (i + 0.5) * (Math.PI / N);           // от левого края через верх к правому
    const bx = x + Math.cos(a) * r * 0.8;
    const by = cy + Math.sin(a) * r * 0.8;
    const len = r * (0.55 + 0.28 * Math.sin(t * 11 + i * 2.1) + 0.14 * Math.sin(t * 23 + i * 5.3))
      * (1 - Math.abs(i - (N - 1) / 2) / N);
    const sway = Math.sin(t * 7 + i * 1.3) * r * 0.12;
    tongues.push({ bx, by, tipX: bx + sway + Math.cos(a) * r * 0.15, tipY: by - len - r * 0.2, w: r * 0.26 });
  }
  for (const f of tongues) flameTongue(g, f.bx, f.by, f.tipX, f.tipY, f.w, '#ff4a12');
  for (const f of tongues) flameTongue(g, f.bx, f.by + r * 0.05, (f.bx + f.tipX) / 2, f.by - (f.by - f.tipY) * 0.62, f.w * 0.6, '#ffc93a');

  const core = g.createRadialGradient(x, cy - r * 0.25, r * 0.05, x, cy, r);
  core.addColorStop(0, '#fffbe0');
  core.addColorStop(0.35, '#ffd44d');
  core.addColorStop(0.7, '#ff7a1f');
  core.addColorStop(1, '#c2261a');
  g.fillStyle = core;
  g.beginPath();
  g.arc(x, cy, r, 0, TAU);
  g.fill();
  // «кипение» — светлые пятна бегают по ядру
  g.fillStyle = 'rgba(255,255,220,0.55)';
  for (let i = 0; i < 3; i++) {
    const a = t * (2 + i) + i * 2.1;
    g.beginPath();
    g.arc(x + Math.cos(a) * r * 0.4, cy + Math.sin(a * 1.3) * r * 0.35, r * (0.12 + 0.05 * Math.sin(t * 9 + i)), 0, TAU);
    g.fill();
  }
}

// ---------- следы ----------

/**
 * Частицы следа. emit(kind, x0, y0, x1, y1, t) — вдоль отрезка (с шагом, чтобы след был сплошным при любой
 * скорости), update(dt), draw(g, toX, toY, unit) — unit: пикселей в единице координат.
 */
export function createTrail() {
  let parts = [];
  let seq = 0;
  const add = (p) => { parts.push(p); if (parts.length > 500) parts.shift(); };
  return {
    emit(kind, x0, y0, x1, y1, t, { spacing = 0.12, extra = {} } = {}) {
      const len = Math.hypot(x1 - x0, y1 - y0);
      const n = Math.max(1, Math.ceil(len / spacing));
      for (let k = 1; k <= n; k++) {
        const x = x0 + ((x1 - x0) * k) / n;
        const y = y0 + ((y1 - y0) * k) / n;
        seq++;
        const j = (hash(seq) - 0.5) * 0.18;
        if (kind === 'bomb') {
          add({ kind, x: x + j, y: y + (hash(seq * 3) - 0.5) * 0.12, r: 0.13, grow: 0.55, vx: 0, vy: -0.35, life: 0.9, age: 0, ...extra });
          if (hash(seq * 7) < 0.18) add({ kind: 'ember', x, y, r: 0.05, grow: 0, vx: (hash(seq * 5) - 0.5) * 1.2, vy: -0.6, life: 0.35, age: 0, ...extra });
        } else if (kind === 'rainbow') {
          add({ kind, x, y, r: 0.3, grow: -0.45, vx: 0, vy: 0, life: 0.5, age: 0, hue: (t * 360 + seq * 14) % 360, ...extra });
        } else {
          add({ kind, x: x + j, y: y + j, r: 0.3 + hash(seq * 11) * 0.12, grow: -0.35, vx: (hash(seq * 13) - 0.5) * 0.5, vy: -0.9, life: 0.5, age: 0, ...extra });
          if (hash(seq * 17) < 0.25) add({ kind: 'ember', x, y, r: 0.05, grow: 0, vx: (hash(seq * 19) - 0.5) * 1.6, vy: -1.2, life: 0.45, age: 0, ...extra });
        }
      }
    },
    update(dt) {
      for (const p of parts) {
        p.age += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.r = Math.max(0.01, p.r + p.grow * dt);
      }
      parts = parts.filter((p) => p.age < p.life);
    },
    draw(g, toX, toY, unit) {
      g.save();
      for (const p of parts) {
        const k = p.age / p.life;
        const X = toX(p);
        const Y = toY(p);
        const R = p.r * unit;
        if (p.kind === 'bomb') {
          const shade = Math.round(70 + k * 80);
          g.fillStyle = `rgba(${shade},${shade + 4},${shade + 14},${0.5 * (1 - k)})`;
        } else if (p.kind === 'rainbow') {
          g.fillStyle = `hsla(${p.hue}, 100%, 62%, ${0.8 * (1 - k)})`;
        } else if (p.kind === 'ember') {
          g.fillStyle = `rgba(255,${Math.round(220 - k * 120)},80,${1 - k})`;
        } else {
          // пламя: жёлтое → оранжевое → красное → дымок
          const c = k < 0.3 ? [255, 214, 80] : k < 0.6 ? [255, 130, 30] : k < 0.85 ? [220, 50, 20] : [90, 70, 70];
          g.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${0.85 * (1 - k * 0.8)})`;
        }
        g.beginPath();
        g.arc(X, Y, Math.max(0.5, R), 0, TAU);
        g.fill();
      }
      g.restore();
    },
    clear() { parts = []; },
    get size() { return parts.length; },
  };
}
