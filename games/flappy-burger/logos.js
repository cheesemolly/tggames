// Заставки Flappy Burger — четыре анимированных пиксельных лого (выбраны владельцем, 2026-09-25): при входе
// в игру показывается случайное. Рисуются в тот же буфер W×H игровых пикселей, что и игра (160×256),
// поэтому увеличиваются так же без сглаживания.
//   0 «Волна на кухне» — буквы бегут волной, бургер летает под надписью, сыплются крошки;
//   1 «Сборка» — буквы падают с неба и пружинят, сверху шлёпается бургер, потом всё разлетается и заново;
//   2 «Неон» — вывеска на ночной улице загорается по буквам, покачивается, «U» барахлит, мимо летит бургер;
//   3 «Хрум» — большой бургер жуёт, на каждый «хрум» буквы подпрыгивают волной и вспыхивают, летит кунжут.
// Логики игры здесь нет: createLogo(variant, art) → draw(ctx, t, dt).

export const LOGO_COUNT = 4;

// ---------- пиксельный шрифт 5×7 (буквы названия) ----------

const GLYPHS = {
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
};
const S = 3;                         // буква 15×21 игровых пикселей
const LW = 5 * S;
const LH = 7 * S;
const GAP = 3;
const lineWidth = (word) => word.length * LW + (word.length - 1) * GAP;

const STYLE = {
  bun: { id: 'bun', fill: '#f0a444', light: '#ffd48a', dark: '#c46f1f', outline: '#3d1f08' },
  ketchup: { id: 'ketchup', fill: '#e8483f', light: '#ff8a6b', dark: '#a82a28', outline: '#3a0d0d' },
  lettuce: { id: 'lettuce', fill: '#58c24a', light: '#9be58a', dark: '#2f8f2f', outline: '#0e3310' },
  white: { id: 'white', fill: '#ffffff', light: '#ffffff', dark: '#ffe9c9', outline: '#3d1f08' },
  neonPink: { id: 'npink', neon: '#ff4fa3', core: '#ffd6ea', glow: '#ff4fa3' },
  neonOrange: { id: 'norange', neon: '#ff8a3d', core: '#ffe0c2', glow: '#ff8a3d' },
  offPink: { id: 'opink', tube: '#43243a' },
  offOrange: { id: 'oorange', tube: '#43302a' },
};

// Спрайты букв — один раз на букву, стиль и «сплющенность» (общие для всех заставок).
const letterCache = new Map();

function glyphMask(ch, sq) {
  // sq > 0 — буква вытянута (выше и уже), sq < 0 — сплющена (ниже и шире)
  const rows = GLYPHS[ch];
  const w = LW - sq;
  const h = LH + sq;
  const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && rows[Math.floor((y * 7) / h)][Math.floor((x * 5) / w)] === '1';
  return { w, h, on };
}

function letterSprite(ch, style, sq = 0) {
  const key = `${ch}|${style.id}|${sq}`;
  if (letterCache.has(key)) return letterCache.get(key);
  const m = glyphMask(ch, sq);
  const pad = 3;
  const c = document.createElement('canvas');
  c.width = m.w + pad * 2;
  c.height = m.h + pad * 2 + 1;
  const x = c.getContext('2d');
  const dot = (px, py, color) => {
    x.fillStyle = color;
    x.fillRect(pad + px, pad + py, 1, 1);
  };
  const near = (px, py, r) => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (m.on(px + dx, py + dy)) return true;
    return false;
  };
  const each = (fn) => {
    for (let py = -pad; py < m.h + pad; py++) for (let px = -pad; px < m.w + pad; px++) fn(px, py);
  };
  if (style.neon) {
    // неон: свечение в два кольца, трубка, светлая «сердцевина» сверху каждого штриха
    each((px, py) => {
      if (m.on(px, py)) return;
      if (near(px, py, 1)) dot(px, py, `${style.glow}99`);
      else if (near(px, py, 2)) dot(px, py, `${style.glow}40`);
    });
    each((px, py) => {
      if (m.on(px, py)) dot(px, py, py % S === 0 && px % S !== S - 1 ? style.core : style.neon);
    });
  } else if (style.tube) {
    each((px, py) => { if (m.on(px, py)) dot(px, py, style.tube); });   // погасшая трубка
  } else {
    // обводка на пиксель и тень снизу ещё на пиксель; заливка — светлый верх, тёмный низ, искорка
    each((px, py) => {
      if (m.on(px, py)) return;
      if (near(px, py, 1) || m.on(px, py - 2) || m.on(px - 1, py - 2) || m.on(px + 1, py - 2)) dot(px, py, style.outline);
    });
    each((px, py) => {
      if (!m.on(px, py)) return;
      dot(px, py, py < m.h * 0.3 ? style.light : py >= m.h * 0.72 ? style.dark : style.fill);
    });
    for (let py = 0; py < m.h; py++) {
      let px = 0;
      while (px < m.w && !m.on(px, py)) px++;
      if (px < m.w) {
        dot(px, py, '#ffffff');
        break;
      }
    }
  }
  const out = { c, pad };
  letterCache.set(key, out);
  return out;
}

/** Слово по центру cx; per(i) → { dx, dy, sq, style } для каждой буквы. */
function word(ctx, text, cx, y, per) {
  let x = Math.round(cx - lineWidth(text) / 2);
  [...text].forEach((ch, i) => {
    const p = per(i);
    const sq = p.sq ?? 0;
    const sp = letterSprite(ch, p.style, sq);
    // низ буквы стоит на месте: сплющивание/вытягивание — вокруг линии строки
    ctx.drawImage(sp.c, Math.round(x + (p.dx ?? 0) + sq / 2 - sp.pad), Math.round(y + (p.dy ?? 0) - sq - sp.pad));
    x += LW + GAP;
  });
}

const rect = (ctx, x, y, w, h, color) => {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
};
const blit = (ctx, img, x, y, k, hk = k) => ctx.drawImage(img, Math.round(x), Math.round(y), img.width * k, Math.round(img.height * hk));
const wingFrame = (t, speed = 10) => Math.floor(t * speed) % 3;

function hash(n) {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

function spriteFrom(rows, pal) {
  const c = document.createElement('canvas');
  c.width = rows[0].length;
  c.height = rows.length;
  const x = c.getContext('2d');
  rows.forEach((row, ry) => [...row].forEach((ch, rx) => {
    if (ch === '.') return;
    x.fillStyle = pal[ch];
    x.fillRect(rx, ry, 1, 1);
  }));
  return c;
}

/**
 * Заставка номер variant. art — спрайты игры: { flying: [3 кадра бургера с крылом 20×12], burger: строки 16×12,
 * pal: палитра }. Размер кадра — ctx.canvas (160×256).
 */
export function createLogo(variant, art) {
  const flying = art.flying;
  const topBun = spriteFrom(art.burger.slice(0, 5), art.pal);
  const bottom = spriteFrom(art.burger.slice(5), art.pal);
  const particles = [];
  const move = (dt, gravity) => {
    for (const p of particles) {
      p.life -= dt;
      p.vy += gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life <= 0) particles.splice(i, 1);
  };

  // ---------- 0. Волна на кухне ----------
  function wave(ctx, t, dt) {
    const { width: W, height: H } = ctx.canvas;
    const floor = H - 28;
    for (let y = 0; y < floor; y += 8) {
      for (let x = 0; x < W; x += 8) {
        rect(ctx, x, y, 8, 8, ((x + y) / 8) % 2 ? '#bfe4de' : '#cdebe6');
        rect(ctx, x, y, 8, 1, '#a8d3cc');
        rect(ctx, x, y, 1, 8, '#a8d3cc');
      }
    }
    rect(ctx, 0, floor, W, 28, '#2a2a33');
    for (let x = 0; x < W; x += 6) {
      rect(ctx, x, floor + 2, 6, 6, (x / 6) % 2 ? '#2a2a33' : '#f1f1f1');
      rect(ctx, x, floor + 8, 6, 6, (x / 6) % 2 ? '#f1f1f1' : '#2a2a33');
    }
    rect(ctx, 0, floor, W, 2, '#6d8f8a');

    const dy = (i, line) => Math.round(Math.sin(t * 6 - (i + line * 6) * 0.55) * 4);
    word(ctx, 'FLAPPY', W / 2, 58, (i) => ({ dy: dy(i, 0), style: STYLE.bun }));
    word(ctx, 'BURGER', W / 2, 90, (i) => ({ dy: dy(i, 1), style: STYLE.ketchup }));

    const bx = W / 2 + Math.sin(t * 1.3) * 46 - 20;
    const by = 140 + Math.sin(t * 2.6) * 6;
    if (Math.random() < dt * 10) {
      particles.push({ x: bx + 14 + Math.random() * 14, y: by + 22, vx: 0, vy: 10, life: 3, c: Math.random() < 0.5 ? '#e89a3c' : '#58c24a' });
    }
    move(dt, 90);
    for (const p of particles) if (p.y < floor) rect(ctx, p.x, p.y, 1, 1, p.c);
    blit(ctx, flying[wingFrame(t)], bx, by, 2);
  }

  // ---------- 1. Сборка ----------
  const PERIOD = 5.4;
  const EXIT = 4.1;
  const landed = new Set();
  let lastCycle = -1;
  function dropY(tt, target, from = -30) {
    // падение с ускорением за 0.32 с, потом отскок на 4 px за 0.22 с
    if (tt < 0) return { y: from, sq: 0, down: false };
    const fall = 0.32;
    if (tt < fall) {
      const k = tt / fall;
      return { y: from + (target - from) * k * k, sq: k > 0.7 ? 1 : 0, down: false };
    }
    const b = tt - fall;
    if (b < 0.06) return { y: target, sq: -3, down: true };
    if (b < 0.28) return { y: target - Math.sin(((b - 0.06) / 0.22) * Math.PI) * 4, sq: 1, down: true };
    return { y: target, sq: 0, down: true };
  }
  function stack(ctx, t, dt) {
    const { width: W, height: H } = ctx.canvas;
    const ground = H - 34;
    ['#56b8f0', '#63c1f4', '#71caf7', '#80d3fa', '#90dcfc', '#9be0fd'].forEach((c, i) => rect(ctx, 0, i * 38, W, 38, c));
    const cloud = (x, y) => {
      rect(ctx, x, y, 22, 5, '#ffffff');
      rect(ctx, x + 4, y - 3, 12, 3, '#ffffff');
      rect(ctx, x + 2, y + 5, 18, 1, '#d9f2ff');
    };
    cloud(((t * 8) % (W + 40)) - 30, 16);
    cloud((((t * 5) + 90) % (W + 40)) - 30, 150);
    rect(ctx, 0, ground, W, H - ground, '#7a4a24');
    rect(ctx, 0, ground - 2, W, 4, '#58c24a');
    for (let x = 0; x < W; x += 4) rect(ctx, x, ground - 3, 2, 1, '#2f8f2f');

    const cycle = Math.floor(t / PERIOD);
    if (cycle !== lastCycle) {
      lastCycle = cycle;
      landed.clear();
    }
    const lt = t - cycle * PERIOD;
    const rows = [[0, 'FLAPPY', 82, STYLE.bun], [1, 'BURGER', 114, STYLE.lettuce]];
    for (const [line, text, target, style] of rows) {
      word(ctx, text, W / 2, target, (i) => {
        const n = line * 6 + i;
        let { y, sq, down } = dropY(lt - (0.15 + n * 0.11), target);
        if (down && !landed.has(n)) {
          landed.add(n);
          const x0 = W / 2 - lineWidth(text) / 2 + i * (LW + GAP);
          for (let k = 0; k < 4; k++) particles.push({ x: x0 + Math.random() * LW, y: target + LH + 1, vx: (Math.random() - 0.5) * 30, vy: -6, life: 0.35, c: '#ffffff' });
        }
        if (lt > EXIT) {
          // прыжок и падение вниз за экран
          const e = lt - EXIT - n * 0.03;
          if (e > 0) {
            y = target - 60 * e + 260 * e * e;
            sq = 0;
          }
        }
        return { dy: y - target, sq, style };
      });
    }
    move(dt, 0);
    for (const p of particles) rect(ctx, p.x, p.y, 2, 2, p.c);

    // бургер шлёпается сверху
    const top = 50;
    const b = dropY(lt - (0.15 + 12 * 0.11 + 0.1), top, -40);
    let by = b.y;
    let hk = 2;
    if (b.sq < 0) {
      hk = 1.75;
      by += 3;
    }
    let frame = b.down ? 0 : 1;
    if (lt > EXIT - 0.2) {
      const e = lt - (EXIT - 0.2);
      by = top - e * e * 160;
      frame = wingFrame(t, 14);
    }
    blit(ctx, flying[frame], W / 2 - 20, by, 2, hk);
  }

  // ---------- 2. Неон на ночной улице ----------
  const stars = Array.from({ length: 40 }, (_, i) => ({ x: Math.floor(hash(i * 3 + 1) * 160), y: Math.floor(hash(i * 3 + 2) * 150), p: hash(i * 3 + 3) * 6 }));
  function neon(ctx, t) {
    const { width: W, height: H } = ctx.canvas;
    rect(ctx, 0, 0, W, H, '#0e0b22');
    for (const s of stars) {
      if (Math.sin(t * 2 + s.p) > -0.3) rect(ctx, s.x, s.y, 1, 1, Math.sin(t * 3 + s.p) > 0.6 ? '#ffffff' : '#8f89c9');
    }
    for (let y = -5; y <= 5; y++) {
      for (let x = -5; x <= 5; x++) {
        if (x * x + y * y <= 25 && (x - 3) * (x - 3) + (y + 2) * (y + 2) > 16) rect(ctx, 134 + x, 22 + y, 1, 1, '#f4efc9');
      }
    }
    // кирпичная стена
    const wall = 176;
    rect(ctx, 0, wall, W, H - wall, '#5a2a24');
    for (let y = wall; y < H; y += 5) {
      rect(ctx, 0, y, W, 1, '#3a1714');
      for (let x = ((y - wall) / 5) % 2 ? 0 : 6; x < W; x += 12) rect(ctx, x, y, 1, 5, '#3a1714');
    }
    // вывеска на цепях
    rect(ctx, 30, 36, 1, 16, '#6b6485');
    rect(ctx, 129, 36, 1, 16, '#6b6485');
    rect(ctx, 12, 52, 136, 84, '#1a1230');
    rect(ctx, 12, 52, 136, 1, '#3b2d5c');
    rect(ctx, 12, 135, 136, 1, '#07050f');

    const lt = t % 7;
    const lit = (n) => {
      const on = 0.25 + n * 0.12;
      if (lt < on) return false;
      if (lt < on + 0.18) return hash(n * 97 + Math.floor(lt * 30)) > 0.5;       // «прогревается»
      if (n === 7 && lt > 4.2 && lt < 5) return hash(Math.floor(lt * 18)) > 0.45; // «U» барахлит
      return true;
    };
    const sway = (i, line) => Math.round(Math.sin(t * 1.8 + i * 0.4 + line) * 1.2);
    word(ctx, 'FLAPPY', W / 2, 64, (i) => ({ dx: sway(i, 0), style: lit(i) ? STYLE.neonPink : STYLE.offPink }));
    word(ctx, 'BURGER', W / 2, 100, (i) => ({ dx: sway(i, 1), style: lit(6 + i) ? STYLE.neonOrange : STYLE.offOrange }));

    const fly = (t % 4.5) / 4.5;
    blit(ctx, flying[wingFrame(t, 12)], -44 + fly * (W + 90), 190 + Math.sin(t * 5) * 4, 2);
  }

  // ---------- 3. Хрум ----------
  let rays = null;
  let lastChomp = -1;
  function chomp(ctx, t, dt) {
    const { width: W, height: H } = ctx.canvas;
    // вращающиеся лучи — через ImageData (буфер кадра маленький)
    rays ??= ctx.createImageData(W, H);
    const cx = W / 2;
    const cy = 74;
    const rot = t * 0.5;
    const d = rays.data;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const ray = Math.floor(((Math.atan2(y - cy, x - cx) + rot) / (Math.PI * 2)) * 16 + 16) % 2;
        const i = (y * W + x) * 4;
        d[i] = 255;
        d[i + 1] = ray ? 196 : 212;
        d[i + 2] = ray ? 72 : 110;
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(rays, 0, 0);

    const BEAT = 0.62;
    const phase = (t % BEAT) / BEAT;
    const open = Math.round(Math.max(0, Math.sin(phase * Math.PI * 2)) * 9);
    const n = Math.floor(t / BEAT);
    if (n !== lastChomp) {
      lastChomp = n;
      for (let k = 0; k < 6; k++) {
        particles.push({ x: cx + (Math.random() - 0.5) * 30, y: 70, vx: (Math.random() - 0.5) * 70, vy: -40 - Math.random() * 40, life: 0.9, c: '#fff3c4' });
      }
    }
    const bx = cx - 24;
    const baseY = 60;
    blit(ctx, bottom, bx, baseY + 15, 3);
    blit(ctx, topBun, bx, baseY - open, 3);
    move(dt, 160);
    for (const p of particles) rect(ctx, p.x, p.y, 2, 1, p.c);

    const since = t % BEAT;
    const per = (line, style) => (i) => {
      const dd = since - 0.06 * (i + line * 3);
      const hop = dd > 0 && dd < 0.3 ? Math.sin((dd / 0.3) * Math.PI) : 0;
      return { dy: -Math.round(hop * 6), sq: hop > 0.6 ? 2 : dd > 0.3 && dd < 0.36 ? -2 : 0, style: hop > 0.75 ? STYLE.white : style };
    };
    word(ctx, 'FLAPPY', cx, 122, per(0, STYLE.bun));
    word(ctx, 'BURGER', cx, 152, per(1, STYLE.ketchup));
  }

  const draw = [wave, stack, neon, chomp][variant] ?? wave;
  return {
    variant,
    draw(ctx, t, dt) {
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      draw(ctx, t, dt);
      ctx.restore();
    },
  };
}
