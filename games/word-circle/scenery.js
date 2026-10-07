// Пейзажи «Круга слов»: фон игры рисуется кодом — SVG из слоёв (небо, светило, дали, горы, деревья, вода, туман).
// Картинок-файлов нет: пейзаж собирается строкой и ставится фоном как data:-адрес, браузер растрирует его один раз.
// У каждой главы свой пейзаж; номер главы — зерно случайности, поэтому «Горы» третьей и пятнадцатой глав разные.
// Без DOM: sceneSvg() — чистая функция (её проверяет тест).

export const SCENES = [
  { id: 'forest', name: 'Лес' },
  { id: 'sea', name: 'Море' },
  { id: 'mountains', name: 'Горы' },
  { id: 'meadow', name: 'Луг' },
  { id: 'desert', name: 'Пустыня' },
  { id: 'lake', name: 'Закат' },
  { id: 'sakura', name: 'Сакура' },
  { id: 'autumn', name: 'Осень' },
  { id: 'lavender', name: 'Лаванда' },
  { id: 'winter', name: 'Зима' },
  { id: 'aurora', name: 'Сияние' },
  { id: 'stars', name: 'Звёзды' },
];

const W = 400;
const H = 800;
const TAU = Math.PI * 2;

function rngOf(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f = (n) => String(Math.round(n * 10) / 10);
const between = (rng, lo, hi) => lo + rng() * (hi - lo);

/** Вертикальный градиент: stops — [[доля, цвет, непрозрачность?], …]. */
function lin(id, stops, x2 = 0, y2 = 1) {
  return `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a == null ? '' : ` stop-opacity="${a}"`}/>`).join('')}</linearGradient>`;
}
function rad(id, stops) {
  return `<radialGradient id="${id}">${stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a == null ? '' : ` stop-opacity="${a}"`}/>`).join('')}</radialGradient>`;
}
const blur = (id, d) => `<filter id="${id}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${d}"/></filter>`;
const sky = (id) => `<rect width="${W}" height="${H}" fill="url(#${id})"/>`;
const disc = (cx, cy, r, fill, extra = '') => `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${fill}"${extra}/>`;

/** Линия холмов или гор: точки слева направо на высоте y с размахом amp. */
function ridge(rng, y, amp, { step = 20, rough = 0.5, waves = 1 } = {}) {
  const p1 = rng() * TAU;
  const p2 = rng() * TAU;
  const p3 = rng() * TAU;
  const pts = [];
  for (let x = -step; x <= W + step; x += step) {
    const t = (x / W) * waves;
    const v = Math.sin(t * TAU * 0.9 + p1) * 0.5 + Math.sin(t * TAU * 2.1 + p2) * 0.3 + Math.sin(t * TAU * 4.7 + p3) * 0.2 + (rng() - 0.5) * rough;
    pts.push([x, y - v * amp]);
  }
  return pts;
}
/** Высота линии в точке x. */
function heightAt(pts, x) {
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0 || 1);
    }
  }
  return pts[pts.length - 1][1];
}
/** Ломаная (скалы) или плавная (холмы, дюны) заливка от линии до низа. */
const jagged = (pts, fill, extra = '') => `<path d="M${pts.map((p) => `${f(p[0])},${f(p[1])}`).join('L')}L${W + 30},${H}L-30,${H}Z" fill="${fill}"${extra}/>`;
function smooth(pts, fill, extra = '') {
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    d += `Q${f(pts[i][0])},${f(pts[i][1])} ${f(mx)},${f(my)}`;
  }
  return `<path d="${d}L${W + 30},${H}L-30,${H}Z" fill="${fill}"${extra}/>`;
}

/** Ель силуэтом: вершина в (x, y − h), основание на y. */
function pine(x, y, h, fill) {
  const w = h * 0.34;
  const tier = (k) => `${f(x - w * k)},${f(y - h * (1 - k) * 0.92)}`;
  const tierR = (k) => `${f(x + w * k)},${f(y - h * (1 - k) * 0.92)}`;
  return `<path d="M${f(x)},${f(y - h)}L${tierR(0.42)}L${f(x + w * 0.2)},${f(y - h * 0.56)}L${tierR(0.72)}L${f(x + w * 0.36)},${f(y - h * 0.28)}L${tierR(1)}L${f(x + w * 0.12)},${f(y - h * 0.07)}L${f(x + w * 0.12)},${f(y)}L${f(x - w * 0.12)},${f(y)}L${f(x - w * 0.12)},${f(y - h * 0.07)}L${tier(1)}L${f(x - w * 0.36)},${f(y - h * 0.28)}L${tier(0.72)}L${f(x - w * 0.2)},${f(y - h * 0.56)}L${tier(0.42)}Z" fill="${fill}"/>`;
}
/** Ряд елей вдоль линии. */
function pines(rng, line, count, hMin, hMax, fill) {
  let out = '';
  for (let k = 0; k < count; k++) {
    const x = between(rng, -10, W + 10);
    out += pine(x, heightAt(line, x) + 4, between(rng, hMin, hMax), fill);
  }
  return out;
}
/** Облако: несколько кругов и плоское дно. */
function cloud(x, y, s, fill, opacity = 1) {
  return `<g fill="${fill}" opacity="${opacity}"><ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(s * 1.5)}" ry="${f(s * 0.42)}"/>${disc(x - s * 0.6, y - s * 0.22, s * 0.48, fill)}${disc(x, y - s * 0.45, s * 0.62, fill)}${disc(x + s * 0.66, y - s * 0.2, s * 0.44, fill)}</g>`;
}
function stars(rng, count, yMax, color = '#fff') {
  let out = '';
  for (let k = 0; k < count; k++) {
    out += `<circle cx="${f(rng() * W)}" cy="${f(rng() * yMax)}" r="${f(between(rng, 0.4, 1.5))}" fill="${color}" opacity="${f(between(rng, 0.35, 1))}"/>`;
  }
  return out;
}
/** Блики на воде: короткие горизонтальные штрихи. */
function glints(rng, y0, y1, count, color, opacity = 0.5) {
  let out = '';
  for (let k = 0; k < count; k++) {
    const y = between(rng, y0, y1);
    const far = (y - y0) / (y1 - y0);
    const x = rng() * W;
    out += `<rect x="${f(x)}" y="${f(y)}" width="${f(between(rng, 8, 30) * (0.4 + far))}" height="${f(1 + far * 1.5)}" rx="1" fill="${color}" opacity="${f(opacity * between(rng, 0.4, 1))}"/>`;
  }
  return out;
}
/** Дорожка света на воде под светилом. */
function sunPath(rng, cx, y0, y1, color) {
  let out = '';
  for (let y = y0 + 4; y < y1; y += between(rng, 5, 9)) {
    const far = (y - y0) / (y1 - y0);
    const w = (10 + far * 46) * between(rng, 0.6, 1.2);
    out += `<rect x="${f(cx - w / 2 + between(rng, -6, 6) * far)}" y="${f(y)}" width="${f(w)}" height="${f(1.6 + far * 2)}" rx="1.5" fill="${color}" opacity="${f(0.85 - far * 0.45)}"/>`;
  }
  return out;
}
const mist = (id, y, h) => `<rect x="0" y="${y}" width="${W}" height="${h}" fill="url(#${id})"/>`;

// ---------- пейзажи ----------

const PAINT = {
  forest(rng) {
    const defs = lin('a', [[0, '#f6f8c8'], [0.32, '#b9dd8c'], [0.7, '#4f9a5c'], [1, '#17452f']])
      + rad('s', [[0, '#fffbe0', 0.95], [0.4, '#fff7c4', 0.45], [1, '#fff7c4', 0]])
      + lin('r', [[0, '#fffde2', 0.34], [1, '#fffde2', 0]]) + blur('b', 5) + blur('c', 14)
      + lin('m', [[0, '#eaf7d0', 0], [0.5, '#eaf7d0', 0.5], [1, '#eaf7d0', 0]]);
    let g = sky('a') + disc(70, 90, 210, 'url(#s)');
    // дальний лес: бледные стволы и кроны в дымке
    for (let k = 0; k < 26; k++) {
      const x = rng() * W;
      const w = between(rng, 3, 7);
      g += `<rect x="${f(x)}" y="${f(between(rng, 60, 150))}" width="${f(w)}" height="620" fill="#8fc47c" opacity="${f(between(rng, 0.35, 0.6))}"/>`;
    }
    for (let k = 0; k < 22; k++) g += disc(rng() * W, between(rng, 20, 170), between(rng, 30, 62), '#a5d383', ` opacity="${f(between(rng, 0.3, 0.5))}"`);
    g += mist('m', 260, 240);
    // средний план
    for (let k = 0; k < 13; k++) {
      const x = rng() * W;
      const w = between(rng, 8, 15);
      g += `<path d="M${f(x)},-10L${f(x + w)},-10L${f(x + w * 1.25)},700L${f(x - w * 0.25)},700Z" fill="#3c7d50" opacity="${f(between(rng, 0.7, 0.95))}"/>`;
    }
    // лучи сквозь кроны
    let rays = '';
    for (let k = 0; k < 7; k++) {
      const x = between(rng, -80, 260);
      const w = between(rng, 16, 46);
      rays += `<path d="M${f(x)},-20L${f(x + w)},-20L${f(x + w + 330)},640L${f(x + 250)},640Z" fill="url(#r)"/>`;
    }
    g += `<g filter="url(#b)">${rays}</g>`;
    // ближние стволы по краям и земля
    for (const [x, w] of [[-14, between(rng, 40, 56)], [W - between(rng, 30, 44), 60], [between(rng, 60, 90), between(rng, 18, 26)], [between(rng, 300, 330), between(rng, 16, 24)]]) {
      g += `<path d="M${f(x)},-10L${f(x + w)},-10Q${f(x + w * 0.8)},400 ${f(x + w * 1.3)},${H}L${f(x - w * 0.3)},${H}Q${f(x + w * 0.2)},400 ${f(x)},-10Z" fill="#173f2c"/>`;
    }
    g += smooth(ridge(rng, 690, 26, { rough: 0.2 }), '#1d5136') + smooth(ridge(rng, 740, 20, { rough: 0.2 }), '#123524');
    // папоротник и светлячки
    for (let k = 0; k < 16; k++) {
      const x = rng() * W;
      const y = between(rng, 690, 760);
      const s = between(rng, 12, 26);
      g += `<path d="M${f(x)},${f(y)}q${f(-s)},${f(-s * 0.9)} ${f(-s * 1.5)},${f(-s * 0.2)}M${f(x)},${f(y)}q${f(s)},${f(-s * 0.9)} ${f(s * 1.5)},${f(-s * 0.2)}M${f(x)},${f(y)}q0,${f(-s * 1.2)} ${f(s * 0.3)},${f(-s * 1.4)}" stroke="#2f7a4a" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    }
    for (let k = 0; k < 18; k++) g += disc(rng() * W, between(rng, 250, 720), between(rng, 1.2, 2.6), '#fffbd0', ` opacity="${f(between(rng, 0.5, 0.95))}"`);
    return { defs, g };
  },

  sea(rng) {
    const hz = 372;
    const defs = lin('a', [[0, '#4fb2f0'], [0.3, '#9bd8fb'], [0.47, '#ffe9cc']])
      + lin('w', [[0, '#1d9ccc'], [0.5, '#35bfd0'], [1, '#8fe6d6']]) + lin('d', [[0, '#fbe6b4'], [1, '#e3bd7c']])
      + rad('s', [[0, '#fffdf0', 1], [0.25, '#fff3c0', 0.7], [1, '#fff3c0', 0]]) + blur('b', 3);
    let g = sky('a');
    const sx = between(rng, 250, 320);
    g += disc(sx, 250, 130, 'url(#s)') + disc(sx, 250, 30, '#fffbe6');
    for (let k = 0; k < 4; k++) g += cloud(between(rng, 20, 380), between(rng, 70, 270), between(rng, 16, 32), '#fff', f(between(rng, 0.6, 0.9)));
    // дальний берег и парус
    g += smooth(ridge(rng, hz + 2, 12, { rough: 0.2, waves: 0.6 }), '#7cb3c9', ' opacity="0.75"');
    g += `<rect x="0" y="${hz}" width="${W}" height="250" fill="url(#w)"/>`;
    g += glints(rng, hz + 4, hz + 200, 46, '#fff', 0.55) + sunPath(rng, sx, hz, hz + 190, '#fff6cf');
    const bx = between(rng, 60, 180);
    g += `<path d="M${f(bx)},${hz + 6}l0,-34l17,30z" fill="#fff"/><path d="M${f(bx - 2)},${hz + 6}l0,-26l-12,23z" fill="#f2f6fb"/><rect x="${f(bx - 16)}" y="${hz + 4}" width="36" height="4" rx="2" fill="#35526e"/>`;
    // прибой и песок
    const shore = ridge(rng, 600, 16, { rough: 0.15, waves: 0.8 });
    g += smooth(shore.map(([x, y]) => [x, y - 9]), '#ffffff', ' opacity="0.85"') + smooth(shore.map(([x, y]) => [x, y - 3]), '#d8f5ee', ' opacity="0.9"') + smooth(shore, 'url(#d)');
    for (let k = 0; k < 40; k++) g += disc(rng() * W, between(rng, 630, 800), between(rng, 0.8, 2), '#c99c5a', ` opacity="${f(between(rng, 0.25, 0.6))}"`);
    // пальмовые листья в углу
    for (const [ox, dir] of [[-6, 1], [W + 6, -1]]) {
      for (let k = 0; k < 5; k++) {
        const len = between(rng, 110, 170);
        const drop = between(rng, 10, 120);
        g += `<path d="M${ox},-6Q${f(ox + dir * len * 0.55)},${f(drop * 0.1 - 8)} ${f(ox + dir * len)},${f(drop)}Q${f(ox + dir * len * 0.5)},${f(drop * 0.45 + 14)} ${ox},${f(14)}Z" fill="${k % 2 ? '#1f7a4d' : '#176640'}"/>`;
      }
    }
    return { defs, g };
  },

  mountains(rng) {
    const defs = lin('a', [[0, '#27356f'], [0.3, '#7a5fa6'], [0.5, '#f29a7c'], [0.64, '#ffd9a6']])
      + rad('s', [[0, '#fff6d8', 1], [0.3, '#ffe0a8', 0.6], [1, '#ffe0a8', 0]])
      + lin('m', [[0, '#fff1e0', 0], [0.6, '#fff1e0', 0.55], [1, '#fff1e0', 0]]) + lin('f', [[0, '#2a3b74'], [1, '#131b3d']]);
    let g = sky('a') + stars(rng, 40, 190);
    const sx = between(rng, 130, 270);
    g += disc(sx, 400, 150, 'url(#s)') + disc(sx, 400, 34, '#fff3cf');
    const far = ridge(rng, 430, 95, { step: 16, rough: 0.9, waves: 1.3 });
    g += jagged(far, '#c3aedd');
    // снег на вершинах: та же линия, чуть ниже и короче по краям зубцов
    for (let i = 1; i < far.length - 1; i++) {
      const [x, y] = far[i];
      if (y < far[i - 1][1] && y < far[i + 1][1] && y < 400) {
        g += `<path d="M${f(x)},${f(y)}L${f(x + 15)},${f(y + 26)}L${f(x + 6)},${f(y + 20)}L${f(x)},${f(y + 30)}L${f(x - 7)},${f(y + 19)}L${f(x - 15)},${f(y + 26)}Z" fill="#fff" opacity="0.9"/>`;
      }
    }
    g += mist('m', 400, 110) + jagged(ridge(rng, 500, 80, { step: 18, rough: 0.8, waves: 1.1 }), '#8b83c4')
      + mist('m', 470, 110) + jagged(ridge(rng, 570, 62, { step: 20, rough: 0.7 }), '#565a9e')
      + mist('m', 540, 100);
    const near = ridge(rng, 650, 40, { rough: 0.4 });
    g += smooth(near, 'url(#f)') + pines(rng, near, 30, 34, 78, '#121a3a');
    const front = ridge(rng, 740, 22, { rough: 0.3 });
    g += smooth(front, '#0d1430') + pines(rng, front, 12, 60, 120, '#090f26');
    return { defs, g };
  },

  meadow(rng) {
    const defs = lin('a', [[0, '#49a8f2'], [0.5, '#bfe6ff'], [0.62, '#eaf8ff']])
      + rad('s', [[0, '#fffef0', 1], [0.3, '#fff6c0', 0.5], [1, '#fff6c0', 0]])
      + lin('h1', [[0, '#b6e79a'], [1, '#86cf7a']]) + lin('h2', [[0, '#7fd06d'], [1, '#4fae58']]) + lin('h3', [[0, '#4fb45a'], [1, '#237a41']]);
    let g = sky('a');
    const sx = between(rng, 60, 340);
    g += disc(sx, 120, 120, 'url(#s)') + disc(sx, 120, 26, '#fffbe0');
    for (let k = 0; k < 5; k++) g += cloud(between(rng, 0, 400), between(rng, 60, 330), between(rng, 18, 40), '#fff', f(between(rng, 0.75, 0.97)));
    const far = ridge(rng, 470, 34, { rough: 0.15, waves: 0.8 });
    g += smooth(far, '#a9dcb3') + smooth(ridge(rng, 520, 30, { rough: 0.15, waves: 0.9 }), 'url(#h1)');
    const mid = ridge(rng, 590, 34, { rough: 0.15, waves: 0.7 });
    g += smooth(mid, 'url(#h2)');
    // дерево на холме
    const tx = between(rng, 90, 310);
    const ty = heightAt(mid, tx) + 6;
    g += `<rect x="${f(tx - 4)}" y="${f(ty - 62)}" width="8" height="64" rx="3" fill="#6b4a2c"/>` + disc(tx, ty - 86, 34, '#2f8f4b') + disc(tx - 24, ty - 70, 24, '#37a055') + disc(tx + 24, ty - 72, 26, '#2b8646') + disc(tx + 4, ty - 104, 22, '#3fae5e');
    g += smooth(ridge(rng, 680, 30, { rough: 0.12, waves: 0.8 }), 'url(#h3)');
    // цветы
    const colors = ['#fff', '#ffe36b', '#ff9fc0', '#ffffff', '#ffd1e3', '#fff3a8'];
    for (let k = 0; k < 90; k++) {
      const y = between(rng, 670, 800);
      g += disc(rng() * W, y, 1.2 + ((y - 660) / 140) * 2.6, colors[Math.floor(rng() * colors.length)], ` opacity="${f(between(rng, 0.7, 1))}"`);
    }
    return { defs, g };
  },

  desert(rng) {
    const defs = lin('a', [[0, '#f7a55c'], [0.3, '#fcc77e'], [0.55, '#ffe6b0']])
      + rad('s', [[0, '#fffdf2', 1], [0.35, '#fff0c2', 0.6], [1, '#fff0c2', 0]])
      + lin('d1', [[0, '#f0b673'], [1, '#e19a55']]) + lin('d2', [[0, '#e59b52'], [1, '#c9763a']]) + lin('d3', [[0, '#cf7a3b'], [1, '#9c4e25']]);
    let g = sky('a');
    const sx = between(rng, 110, 290);
    g += disc(sx, 250, 190, 'url(#s)') + disc(sx, 250, 48, '#fff6dc');
    // столовые горы вдали
    for (let k = 0; k < 4; k++) {
      const x = between(rng, -30, 330);
      const w = between(rng, 60, 130);
      const h = between(rng, 40, 90);
      g += `<path d="M${f(x)},470L${f(x + 10)},${f(470 - h)}L${f(x + w - 12)},${f(470 - h)}L${f(x + w)},470Z" fill="#dd9566" opacity="0.8"/>`;
    }
    g += smooth(ridge(rng, 480, 22, { rough: 0.1, waves: 0.7 }), 'url(#d1)');
    const mid = ridge(rng, 570, 40, { rough: 0.1, waves: 0.8 });
    g += smooth(mid, 'url(#d2)');
    // кактусы
    for (let k = 0; k < 3; k++) {
      const x = between(rng, 30, 370);
      const y = heightAt(mid, x) + 8;
      const h = between(rng, 46, 78);
      g += `<g fill="none" stroke="#3f6b46" stroke-width="${f(h * 0.2)}" stroke-linecap="round"><path d="M${f(x)},${f(y)}v${f(-h)}"/><path d="M${f(x)},${f(y - h * 0.45)}h${f(-h * 0.3)}v${f(-h * 0.3)}"/><path d="M${f(x)},${f(y - h * 0.3)}h${f(h * 0.3)}v${f(-h * 0.36)}"/></g>`;
    }
    g += smooth(ridge(rng, 680, 44, { rough: 0.1, waves: 0.6 }), 'url(#d3)');
    for (let k = 0; k < 5; k++) {
      const x = between(rng, 40, 360);
      const y = between(rng, 130, 330);
      g += `<path d="M${f(x)},${f(y)}q5,-6 10,0q5,-6 10,0" stroke="#7a4a2a" stroke-width="1.8" fill="none" stroke-linecap="round" opacity="0.7"/>`;
    }
    return { defs, g };
  },

  lake(rng) {
    const hz = 440;
    const defs = lin('a', [[0, '#2c2260'], [0.22, '#8a3f84'], [0.4, '#f0796a'], [0.55, '#ffd08a']])
      + lin('w', [[0, '#ffc27e'], [0.25, '#e07a78'], [0.7, '#5a3a7e'], [1, '#231a4a']])
      + rad('s', [[0, '#fffbe6', 1], [0.3, '#ffd98e', 0.75], [1, '#ffd98e', 0]]);
    let g = sky('a') + stars(rng, 36, 150);
    const sx = between(rng, 150, 250);
    g += disc(sx, hz - 8, 170, 'url(#s)') + disc(sx, hz - 8, 38, '#fff4cf');
    for (let k = 0; k < 4; k++) g += cloud(between(rng, 0, 400), between(rng, 150, 340), between(rng, 20, 40), '#ffb48a', f(between(rng, 0.35, 0.6)));
    g += `<rect x="0" y="${hz}" width="${W}" height="${H - hz}" fill="url(#w)"/>`;
    g += sunPath(rng, sx, hz, hz + 250, '#fff0c0') + glints(rng, hz + 6, hz + 260, 40, '#ffd9a8', 0.4);
    // тёмные берега сходятся к середине
    const left = ridge(rng, hz + 2, 44, { rough: 0.5, waves: 0.8 }).map(([x, y]) => [x, Math.min(hz + 2, y + (x / W) * 70)]);
    const right = ridge(rng, hz + 2, 50, { rough: 0.5, waves: 0.8 }).map(([x, y]) => [x, Math.min(hz + 2, y + ((W - x) / W) * 80)]);
    const shore = (pts) => `<path d="M${pts.map((p) => `${f(p[0])},${f(p[1])}`).join('L')}L${W + 30},${hz + 3}L-30,${hz + 3}Z" fill="#33255c"/>`;
    g += shore(left) + shore(right);
    // лодка
    const bx = between(rng, 70, 300);
    g += `<path d="M${f(bx - 22)},${hz + 96}q22,12 44,0l-5,8h-34z" fill="#1c1436"/><rect x="${f(bx - 1)}" y="${hz + 70}" width="2" height="28" fill="#1c1436"/>`;
    // камыши
    for (const side of [0, 1]) {
      for (let k = 0; k < 14; k++) {
        const x = side ? between(rng, 300, 410) : between(rng, -10, 100);
        const h = between(rng, 90, 210);
        const lean = between(rng, -16, 16);
        g += `<path d="M${f(x)},${H}Q${f(x + lean * 0.3)},${f(H - h * 0.6)} ${f(x + lean)},${f(H - h)}" stroke="#150f2b" stroke-width="2.4" fill="none"/>`;
        if (k % 2 === 0) g += `<rect x="${f(x + lean - 3)}" y="${f(H - h - 4)}" width="6" height="22" rx="3" fill="#150f2b"/>`;
      }
    }
    return { defs, g };
  },

  sakura(rng) {
    const defs = lin('a', [[0, '#ffc9de'], [0.45, '#ffe7ef'], [0.62, '#fff4e4']])
      + lin('w', [[0, '#cfe4f7'], [1, '#f6c6da']]) + lin('f', [[0, '#93a9d9'], [1, '#c2cdea']])
      + rad('s', [[0, '#fff', 0.95], [0.4, '#fff', 0.4], [1, '#fff', 0]]);
    let g = sky('a') + disc(between(rng, 80, 320), 150, 120, 'url(#s)');
    // гора со снежной шапкой
    const mx = between(rng, 150, 250);
    g += `<path d="M${f(mx - 190)},520Q${f(mx - 70)},450 ${f(mx - 26)},312Q${f(mx)},296 ${f(mx + 26)},312Q${f(mx + 70)},450 ${f(mx + 190)},520Z" fill="url(#f)"/>`;
    g += `<path d="M${f(mx - 26)},312Q${f(mx)},296 ${f(mx + 26)},312L${f(mx + 46)},366L${f(mx + 28)},350L${f(mx + 14)},374L${f(mx)},352L${f(mx - 14)},376L${f(mx - 28)},350L${f(mx - 46)},366Z" fill="#fff"/>`;
    g += smooth(ridge(rng, 520, 16, { rough: 0.2, waves: 0.7 }), '#b9c9a9') + `<rect x="0" y="540" width="${W}" height="260" fill="url(#w)"/>`;
    g += glints(rng, 548, 780, 40, '#fff', 0.6);
    // красные ворота в воде
    const tx = between(rng, 120, 280);
    g += `<g fill="#d9483b"><rect x="${f(tx - 24)}" y="566" width="6" height="64"/><rect x="${f(tx + 18)}" y="566" width="6" height="64"/><rect x="${f(tx - 28)}" y="578" width="56" height="5"/><path d="M${f(tx - 38)},560q38,10 76,0l-3,9q-35,8 -70,0z"/></g>`;
    g += `<g fill="#d9483b" opacity="0.28"><rect x="${f(tx - 24)}" y="632" width="6" height="46"/><rect x="${f(tx + 18)}" y="632" width="6" height="46"/></g>`;
    // ветки с цветами из верхних углов
    const pinks = ['#ff8fb7', '#ffb1cd', '#ffd0e0', '#ff7aa8', '#ffc2d8'];
    for (const [ox, dir] of [[-10, 1], [W + 10, -1]]) {
      for (let b = 0; b < 3; b++) {
        const len = between(rng, 150, 240);
        const y0 = between(rng, -10, 70);
        const y1 = y0 + between(rng, 40, 150);
        const cx = ox + dir * len * 0.5;
        const cy = y0 + between(rng, -20, 30);
        g += `<path d="M${ox},${f(y0)}Q${f(cx)},${f(cy)} ${f(ox + dir * len)},${f(y1)}" stroke="#5a3a33" stroke-width="${f(between(rng, 3, 6))}" fill="none" stroke-linecap="round"/>`;
        for (let k = 0; k < 26; k++) {
          const t = rng();
          const px = (1 - t) * (1 - t) * ox + 2 * (1 - t) * t * cx + t * t * (ox + dir * len);
          const py = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * y1;
          g += disc(px + between(rng, -16, 16), py + between(rng, -16, 16), between(rng, 5, 12), pinks[Math.floor(rng() * pinks.length)], ` opacity="${f(between(rng, 0.75, 1))}"`);
        }
      }
    }
    for (let k = 0; k < 34; k++) {
      g += `<ellipse cx="${f(rng() * W)}" cy="${f(between(rng, 120, 790))}" rx="${f(between(rng, 2, 4.5))}" ry="${f(between(rng, 1.2, 2.4))}" fill="${pinks[Math.floor(rng() * pinks.length)]}" opacity="${f(between(rng, 0.6, 0.95))}" transform="rotate(${f(rng() * 180)} ${f(rng() * W)} ${f(rng() * H)})"/>`;
    }
    return { defs, g };
  },

  autumn(rng) {
    const defs = lin('a', [[0, '#ffe7b8'], [0.4, '#ffd08c'], [0.75, '#f0a25a'], [1, '#8a4a22']])
      + rad('s', [[0, '#fffbe6', 0.95], [0.4, '#ffeab0', 0.45], [1, '#ffeab0', 0]])
      + lin('m', [[0, '#fff0d0', 0], [0.5, '#fff0d0', 0.55], [1, '#fff0d0', 0]]) + lin('r', [[0, '#fff6d8', 0.3], [1, '#fff6d8', 0]]) + blur('b', 5);
    let g = sky('a') + disc(between(rng, 240, 340), 110, 200, 'url(#s)');
    const leaves = ['#f6a23c', '#e8742c', '#d9502a', '#f7c14a', '#c8452a', '#f08a2e'];
    for (let k = 0; k < 20; k++) {
      const x = rng() * W;
      g += `<rect x="${f(x)}" y="${f(between(rng, 80, 170))}" width="${f(between(rng, 3, 6))}" height="600" fill="#b9753f" opacity="${f(between(rng, 0.3, 0.5))}"/>`;
    }
    for (let k = 0; k < 30; k++) g += disc(rng() * W, between(rng, 10, 210), between(rng, 26, 56), leaves[Math.floor(rng() * leaves.length)], ` opacity="${f(between(rng, 0.3, 0.5))}"`);
    g += mist('m', 260, 260);
    for (let k = 0; k < 9; k++) {
      const x = rng() * W;
      const w = between(rng, 8, 15);
      g += `<path d="M${f(x)},-10L${f(x + w)},-10L${f(x + w * 1.3)},720L${f(x - w * 0.3)},720Z" fill="#6b3f22" opacity="0.92"/>`;
    }
    let rays = '';
    for (let k = 0; k < 5; k++) {
      const x = between(rng, 150, 420);
      const w = between(rng, 16, 40);
      rays += `<path d="M${f(x)},-20L${f(x + w)},-20L${f(x - 250)},640L${f(x - 320)},640Z" fill="url(#r)"/>`;
    }
    g += `<g filter="url(#b)">${rays}</g>`;
    // кроны по верху и краям
    for (let k = 0; k < 46; k++) {
      const edge = rng() < 0.5;
      const x = edge ? (rng() < 0.5 ? between(rng, -20, 70) : between(rng, 330, 420)) : rng() * W;
      const y = edge ? between(rng, 0, 330) : between(rng, -20, 90);
      g += disc(x, y, between(rng, 22, 48), leaves[Math.floor(rng() * leaves.length)], ` opacity="${f(between(rng, 0.8, 1))}"`);
    }
    for (const [x, w] of [[-12, between(rng, 34, 48)], [W - between(rng, 26, 38), 54]]) {
      g += `<path d="M${f(x)},-10L${f(x + w)},-10Q${f(x + w * 0.8)},400 ${f(x + w * 1.3)},${H}L${f(x - w * 0.3)},${H}Q${f(x + w * 0.2)},400 ${f(x)},-10Z" fill="#4a2a17"/>`;
    }
    g += smooth(ridge(rng, 700, 24, { rough: 0.2 }), '#a3521f') + smooth(ridge(rng, 750, 18, { rough: 0.2 }), '#7a3a16');
    for (let k = 0; k < 60; k++) {
      const x = rng() * W;
      const y = between(rng, 150, 795);
      g += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(between(rng, 3, 6))}" ry="${f(between(rng, 1.6, 3))}" fill="${leaves[Math.floor(rng() * leaves.length)]}" opacity="${f(between(rng, 0.7, 1))}" transform="rotate(${f(rng() * 180)} ${f(x)} ${f(y)})"/>`;
    }
    return { defs, g };
  },

  lavender(rng) {
    const hz = 430;
    const defs = lin('a', [[0, '#6f7fd6'], [0.3, '#f3a6b7'], [0.5, '#ffd9a8']])
      + rad('s', [[0, '#fffbe6', 1], [0.3, '#ffe2a6', 0.7], [1, '#ffe2a6', 0]])
      + lin('p', [[0, '#b39ae6'], [1, '#5b3f9e']]) + lin('q', [[0, '#8f77cf'], [1, '#3f2a7a']]);
    let g = sky('a');
    const sx = between(rng, 120, 280);
    g += disc(sx, hz - 30, 160, 'url(#s)') + disc(sx, hz - 30, 34, '#fff6d6');
    for (let k = 0; k < 3; k++) g += cloud(between(rng, 0, 400), between(rng, 110, 300), between(rng, 20, 38), '#ffd3c4', f(between(rng, 0.5, 0.8)));
    g += smooth(ridge(rng, hz - 6, 36, { rough: 0.2, waves: 0.8 }), '#8f8fd0') + smooth(ridge(rng, hz + 6, 18, { rough: 0.2, waves: 0.9 }), '#6a66b4');
    // кипарисы и домик на горизонте
    for (let k = 0; k < 7; k++) {
      const x = between(rng, 10, 390);
      const h = between(rng, 26, 52);
      g += `<ellipse cx="${f(x)}" cy="${f(hz + 6 - h / 2)}" rx="${f(h * 0.16)}" ry="${f(h / 2)}" fill="#2f2b5c"/>`;
    }
    const hx = between(rng, 60, 320);
    g += `<rect x="${f(hx)}" y="${hz - 14}" width="30" height="20" fill="#f7e3c8"/><path d="M${f(hx - 4)},${hz - 14}l19,-13l19,13z" fill="#c9604a"/>`;
    // ряды лаванды сходятся к точке на горизонте
    g += `<rect x="0" y="${hz + 6}" width="${W}" height="${H - hz}" fill="#4a3488"/>`;
    const vx = W / 2 + between(rng, -40, 40);
    const rows = 13;
    for (let k = 0; k < rows; k++) {
      const a = -260 + (k * (W + 520)) / rows;
      const b = a + ((W + 520) / rows) * 0.62;
      g += `<path d="M${f(vx)},${hz + 6}L${f(a)},${H}L${f(b)},${H}Z" fill="url(#${k % 2 ? 'p' : 'q'})"/>`;
    }
    for (let k = 0; k < 150; k++) {
      const y = between(rng, hz + 30, H);
      const far = (y - hz) / (H - hz);
      g += disc(rng() * W, y, 0.8 + far * 2.4, rng() < 0.5 ? '#d9c8ff' : '#c0a6f5', ` opacity="${f(between(rng, 0.35, 0.8))}"`);
    }
    return { defs, g };
  },

  winter(rng) {
    const defs = lin('a', [[0, '#8fc4ee'], [0.4, '#d6ecfb'], [0.62, '#f8fcff']])
      + rad('s', [[0, '#fff', 1], [0.35, '#fffbe6', 0.55], [1, '#fffbe6', 0]])
      + lin('h1', [[0, '#eef7ff'], [1, '#c9e0f5']]) + lin('h2', [[0, '#ffffff'], [1, '#b9d6f0']]) + lin('h3', [[0, '#ffffff'], [1, '#9fc4e8']]);
    let g = sky('a');
    const sx = between(rng, 70, 330);
    g += disc(sx, 210, 150, 'url(#s)') + disc(sx, 210, 26, '#fffef4');
    g += jagged(ridge(rng, 430, 70, { step: 18, rough: 0.8, waves: 1.2 }), '#c5d9ee') + smooth(ridge(rng, 490, 30, { rough: 0.15 }), 'url(#h1)');
    const mid = ridge(rng, 560, 30, { rough: 0.15, waves: 0.8 });
    g += smooth(mid, 'url(#h2)');
    // ели под снегом
    const firs = [];
    for (let k = 0; k < 12; k++) firs.push([between(rng, -10, W + 10), between(rng, 60, 130)]);
    firs.sort((p, q) => p[1] - q[1]);
    for (const [x, h] of firs) {
      const y = heightAt(mid, x) + 6 + h * 0.35;
      g += pine(x, y, h, '#2f5d63') + `<path d="M${f(x)},${f(y - h)}l${f(h * 0.13)},${f(h * 0.3)}l${f(-h * 0.06)},${f(-h * 0.04)}l${f(-h * 0.07)},${f(h * 0.07)}l${f(-h * 0.05)},${f(-h * 0.06)}l${f(-h * 0.08)},${f(h * 0.03)}z" fill="#fff"/>`;
    }
    g += smooth(ridge(rng, 690, 28, { rough: 0.12, waves: 0.7 }), 'url(#h3)');
    for (let k = 0; k < 110; k++) g += disc(rng() * W, rng() * H, between(rng, 0.8, 2.6), '#fff', ` opacity="${f(between(rng, 0.5, 0.95))}"`);
    return { defs, g };
  },

  aurora(rng) {
    const defs = lin('a', [[0, '#040a22'], [0.5, '#0b2244'], [0.75, '#15406a']])
      + lin('g1', [[0, '#5cffb4', 0], [0.35, '#5cffb4', 0.85], [1, '#2ad0c0', 0]]) + lin('g2', [[0, '#b07cff', 0], [0.4, '#b07cff', 0.6], [1, '#5c8cff', 0]])
      + blur('b', 14) + blur('c', 26) + rad('s', [[0, '#fff', 0.9], [0.3, '#dfeaff', 0.35], [1, '#dfeaff', 0]])
      + lin('h1', [[0, '#bcd6f2'], [1, '#6f98c6']]) + lin('h2', [[0, '#e3f0ff'], [1, '#8fb4dc']]);
    let g = sky('a') + stars(rng, 150, 520);
    // ленты сияния
    const band = (y, amp, h, fill, filter) => {
      const p = rng() * TAU;
      let top = '';
      let bottom = '';
      for (let x = -40; x <= W + 40; x += 20) {
        const yy = y + Math.sin((x / W) * TAU * 0.9 + p) * amp + Math.sin((x / W) * TAU * 2.3 + p * 2) * amp * 0.35;
        top += `${top ? 'L' : 'M'}${f(x)},${f(yy)}`;
        bottom = `L${f(x)},${f(yy + h)}${bottom}`;
      }
      return `<path d="${top}${bottom}Z" fill="url(#${fill})" filter="url(#${filter})"/>`;
    };
    g += band(110, 46, 300, 'g2', 'c') + band(150, 60, 280, 'g1', 'b') + band(230, 40, 220, 'g1', 'c');
    const mx = between(rng, 60, 340);
    g += disc(mx, 110, 60, 'url(#s)') + disc(mx, 110, 15, '#f4f8ff');
    g += jagged(ridge(rng, 520, 60, { step: 18, rough: 0.8, waves: 1.2 }), '#17365e') + smooth(ridge(rng, 580, 26, { rough: 0.15 }), 'url(#h1)');
    const mid = ridge(rng, 640, 26, { rough: 0.15, waves: 0.8 });
    g += smooth(mid, 'url(#h2)') + pines(rng, mid, 14, 50, 110, '#0a1c33');
    // домик с тёплым окном
    const hx = between(rng, 120, 260);
    const hy = heightAt(mid, hx + 16) + 4;
    g += `<rect x="${f(hx)}" y="${f(hy - 24)}" width="34" height="26" fill="#1a2c47"/><path d="M${f(hx - 5)},${f(hy - 24)}l22,-16l22,16z" fill="#e9f3ff"/><rect x="${f(hx + 12)}" y="${f(hy - 17)}" width="10" height="10" fill="#ffd66b"/>` + disc(hx + 17, hy - 12, 16, '#ffd66b', ' opacity="0.25"');
    g += smooth(ridge(rng, 740, 20, { rough: 0.12 }), '#f2f8ff');
    return { defs, g };
  },

  stars(rng) {
    const defs = lin('a', [[0, '#070a26'], [0.5, '#1c1a52'], [0.72, '#4a2f6e'], [0.85, '#8a4a6e']])
      + rad('m', [[0, '#d8c8ff', 0.7], [0.5, '#9f8fe6', 0.3], [1, '#9f8fe6', 0]]) + blur('b', 18)
      + rad('t', [[0, '#ffcf7a', 0.9], [1, '#ffcf7a', 0]]);
    let g = sky('a');
    // Млечный Путь: размытая полоса наискось и густые звёзды вдоль неё
    g += `<g transform="rotate(${f(between(rng, -38, -24))} 200 300)"><ellipse cx="200" cy="300" rx="330" ry="70" fill="url(#m)" filter="url(#b)"/>`;
    for (let k = 0; k < 190; k++) {
      const x = between(rng, -120, 520);
      const y = 300 + (rng() + rng() + rng() - 1.5) * 70;
      g += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(between(rng, 0.3, 1.2))}" fill="#fff" opacity="${f(between(rng, 0.4, 1))}"/>`;
    }
    g += '</g>' + stars(rng, 170, 640);
    // падающая звезда
    const fx = between(rng, 220, 360);
    const fy = between(rng, 60, 170);
    g += `<path d="M${f(fx)},${f(fy)}l-70,34" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity="0.8"/>`;
    g += jagged(ridge(rng, 600, 70, { step: 18, rough: 0.8, waves: 1.2 }), '#231a4a') + jagged(ridge(rng, 660, 46, { step: 20, rough: 0.6 }), '#150f33');
    const near = ridge(rng, 720, 22, { rough: 0.2 });
    g += smooth(near, '#0b0820') + pines(rng, near, 10, 40, 90, '#070516');
    // палатка со светом
    const tx = between(rng, 130, 270);
    const ty = heightAt(near, tx) + 6;
    g += disc(tx, ty - 10, 46, 'url(#t)') + `<path d="M${f(tx - 26)},${f(ty)}l26,-36l26,36z" fill="#ffb347"/><path d="M${f(tx)},${f(ty - 36)}l8,36h-16z" fill="#7a3a12"/>`;
    return { defs, g };
  },
};

/** Готовый SVG пейзажа. seed — зерно (номер главы): тот же пейзаж с другим зерном выглядит иначе. */
export function sceneSvg(id, seed = 1) {
  const paint = PAINT[id] ?? PAINT.forest;
  const index = Math.max(0, SCENES.findIndex((s) => s.id === id));
  const { defs, g } = paint(rngOf(Math.imul((Math.floor(seed) || 0) + 1, 2654435761) ^ ((index + 1) * 97)));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice"><defs>${defs}</defs>${g}</svg>`;
}

/** Пейзаж как значение для background-image. */
export const sceneUrl = (id, seed = 1) => `url("data:image/svg+xml,${encodeURIComponent(sceneSvg(id, seed))}")`;

/** Пейзаж главы: главы идут по кругу списка. */
export const sceneOfChapter = (chapter) => SCENES[((Math.floor(chapter) % SCENES.length) + SCENES.length) % SCENES.length];
