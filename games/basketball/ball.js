// Мяч «Баскетбола» — настоящий шар, а не кружок с картинкой. Для каждой точки диска заранее известна нормаль к
// шару и свет в ней (тень, блик, затемнение к краю); в кадре нормаль поворачивается вместе с мячом, и по ней
// считается цвет рисунка — швы, дольки, кратеры. Мяч вертится в трёх измерениях: рисунок уходит за край и
// возвращается. Это несколько тысяч точек на кадр. Без DOM: пишет прямо в массив точек (ImageData.data).

export const BALL_KINDS = ['classic', 'street', 'neon', 'beach', 'moon'];

/** Материалы: amb — сколько света в тени, spec и shine — сила и резкость блика, limb — затемнение к краю. */
const MATERIAL = {
  classic: { amb: 0.46, spec: 0.3, shine: 13, limb: 0.5 },
  street: { amb: 0.5, spec: 0.36, shine: 18, limb: 0.46 },
  neon: { amb: 0.7, spec: 0.6, shine: 30, limb: 0.34 },
  beach: { amb: 0.58, spec: 0.78, shine: 40, limb: 0.36 },
  moon: { amb: 0.3, spec: 0.04, shine: 5, limb: 0.62 },
};

const TAU = Math.PI * 2;
const SIDE = 0.62;                          // боковые швы — круги на таком расстоянии от середины
const SEAM = 0.05;                          // полуширина шва
// свет — слева сверху и немного спереди (y на экране — вниз)
const LIGHT = (() => {
  const v = [-0.5, -0.62, 0.6];
  const n = Math.hypot(...v);
  return v.map((c) => c / n);
})();

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const rgbOf = (c) => (String(c).match(/[\d.]+/g) ?? [0, 0, 0]).slice(0, 3).map(Number);

/** Случайное 0…1 от трёх целых — «зерно» кожи мяча. */
function hash3(a, b, c) {
  let x = Math.imul(a * 73856093 ^ b * 19349663 ^ c * 83492791, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

// кратеры луны: направление на середину и размер (хорда на единичном шаре)
const CRATERS = [
  [0.1, -0.2, 0.97, 0.3], [-0.62, 0.3, 0.72, 0.2], [0.58, 0.46, 0.67, 0.24], [0.3, -0.84, 0.45, 0.17],
  [-0.4, -0.66, 0.64, 0.14], [0.9, -0.1, 0.42, 0.2], [-0.88, -0.3, -0.36, 0.26], [0.2, 0.7, -0.68, 0.3],
  [-0.2, -0.3, -0.93, 0.22], [0.66, -0.5, -0.56, 0.18], [-0.5, 0.82, -0.26, 0.2], [0.05, 0.98, 0.2, 0.15],
  [-0.96, 0.24, 0.14, 0.13], [0.74, 0.62, -0.26, 0.15],
].map(([x, y, z, r]) => {
  const n = Math.hypot(x, y, z);
  return [x / n, y / n, z / n, r];
});
// «моря» — тёмные пятна
const SEAS = [[0.5, -0.3, 0.81, 0.78], [-0.7, 0.5, -0.5, 0.7], [-0.1, 0.5, 0.86, 0.9]].map(([x, y, z, t]) => {
  const n = Math.hypot(x, y, z);
  return [x / n, y / n, z / n, t];
});

/**
 * Рисунок мяча: функция (x, y, z, aa) — цвет точки шара с единичной нормалью (x, y, z) в координатах мяча;
 * aa — размер точки экрана в тех же единицах (края швов сглаживаются на эту ширину). Цвет кладётся в out[0…2].
 * colors — { ball, ball2, ball3, ball4 } как [r, g, b].
 */
export function texture(kind, colors, out) {
  const [A, B, C, D] = [colors.ball, colors.ball2, colors.ball3, colors.ball4];
  const put = (c, k = 1) => {
    out[0] = c[0] * k;
    out[1] = c[1] * k;
    out[2] = c[2] * k;
  };
  const blend = (c, t) => {
    out[0] += (c[0] - out[0]) * t;
    out[1] += (c[1] - out[1]) * t;
    out[2] += (c[2] - out[2]) * t;
  };
  /** Насколько точка на шве (0…1): два больших круга крест-накрест и два малых по бокам. */
  const seam = (x, y, aa) => {
    const ax = Math.abs(x);
    const d = Math.min(ax, Math.abs(y), Math.abs(ax - SIDE));
    return d <= SEAM ? 1 : d >= SEAM + aa ? 0 : 1 - (d - SEAM) / aa;
  };

  if (kind === 'street') {
    // трёхцветный уличный: восемь долек, соседние — разного цвета
    const PANELS = [A, C, D, A, D, D, C, C];
    return (x, y, z, aa) => {
      put(PANELS[(x > 0 ? 1 : 0) + (y > 0 ? 2 : 0) + (Math.abs(x) > SIDE ? 4 : 0)]);
      const s = seam(x, y, aa);
      if (s > 0) blend(B, s);
    };
  }
  if (kind === 'beach') {
    // надувной: шесть долек вокруг оси и белые «шапочки» с клапаном
    const WEDGES = [A, C, D, C, B, C];
    const span = TAU / 6;
    return (x, y, z, aa) => {
      if (Math.abs(z) > 0.93) {
        put(C);
        return;
      }
      const k = Math.atan2(y, x) / span + 6;
      const i = Math.floor(k);
      const f = k - i;
      put(WEDGES[i % 6]);
      // на стыке долек цвета плавно переходят — без «лесенки»
      const edge = Math.min(f, 1 - f) * span * Math.hypot(x, y);
      if (edge < aa) blend(WEDGES[(i + (f < 0.5 ? 5 : 1)) % 6], 0.5 * (1 - edge / aa));
      if (Math.abs(z) > 0.93 - aa) blend(C, (Math.abs(z) - 0.93 + aa) / aa);
    };
  }
  if (kind === 'moon') {
    return (x, y, z, aa) => {
      put(A);
      for (const m of SEAS) {
        const d = x * m[0] + y * m[1] + z * m[2] - m[3];
        if (d > -0.06) blend(C, 0.5 * clamp01((d + 0.06) / 0.1));
      }
      for (const c of CRATERS) {
        const dot = x * c[0] + y * c[1] + z * c[2];
        if (dot < 0.9) continue;
        const u = Math.sqrt(Math.max(0, 2 - 2 * dot)) / c[3];
        if (u > 1.2) continue;
        if (u < 0.78) blend(C, 0.8);                               // дно
        else blend(D, clamp01(1 - Math.abs(u - 0.98) / (0.2 + aa / c[3])));   // светлый вал
      }
    };
  }
  // обычный баскетбольный (и неоновый): кожа с зерном и тёмные швы
  const grain = kind === 'neon' ? 0 : 0.09;
  return (x, y, z, aa) => {
    put(A, grain ? 1 - grain / 2 + grain * hash3(Math.floor(x * 17), Math.floor(y * 17), Math.floor(z * 17)) : 1);
    const s = seam(x, y, aa);
    if (s > 0) blend(B, s);
  };
}

/** Единичная матрица поворота (по строкам): мяч лежит так, как нарисован. */
export const identity = () => [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** Повернуть мяч вокруг оси (ax, ay, az) экрана на angle радиан: m ← R · m. Оси экрана: x вправо, y вниз, z к зрителю. */
export function rotate(m, ax, ay, az, angle) {
  const len = Math.hypot(ax, ay, az);
  if (!(len > 1e-9) || !angle) return m;
  const x = ax / len;
  const y = ay / len;
  const z = az / len;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const t = 1 - c;
  const r = [
    t * x * x + c, t * x * y - s * z, t * x * z + s * y,
    t * x * y + s * z, t * y * y + c, t * y * z - s * x,
    t * x * z - s * y, t * y * z + s * x, t * z * z + c,
  ];
  const o = m.slice();
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) m[i * 3 + j] = r[i * 3] * o[j] + r[i * 3 + 1] * o[3 + j] + r[i * 3 + 2] * o[6 + j];
  }
  return m;
}

/** Убрать накопившуюся погрешность: строки матрицы снова единичные и перпендикулярные. */
export function settle(m) {
  const n0 = Math.hypot(m[0], m[1], m[2]) || 1;
  for (let j = 0; j < 3; j++) m[j] /= n0;
  const d = m[0] * m[3] + m[1] * m[4] + m[2] * m[5];
  for (let j = 0; j < 3; j++) m[3 + j] -= d * m[j];
  const n1 = Math.hypot(m[3], m[4], m[5]) || 1;
  for (let j = 0; j < 3; j++) m[3 + j] /= n1;
  m[6] = m[1] * m[5] - m[2] * m[4];
  m[7] = m[2] * m[3] - m[0] * m[5];
  m[8] = m[0] * m[4] - m[1] * m[3];
  return m;
}

/**
 * Мяч под размер холста: size — сторона картинки в точках, radius — радиус мяча в точках (мяч — посередине).
 * data — массив точек RGBA (size × size × 4; у ImageData — её data). Возвращает { paint(m) }: нарисовать мяч,
 * повёрнутый матрицей m.
 */
export function createBall({ kind, colors, size, radius, data }) {
  const mat = MATERIAL[kind] ?? MATERIAL.classic;
  const rgb = { ball: rgbOf(colors.ball), ball2: rgbOf(colors.ball2), ball3: rgbOf(colors.ball3), ball4: rgbOf(colors.ball4) };
  const out = [0, 0, 0];
  const tex = texture(kind, rgb, out);
  const aa = 1.2 / radius;
  const mid = size / 2;
  const hx = LIGHT[0];
  const hy = LIGHT[1];
  const hz = LIGHT[2] + 1;
  const hn = Math.hypot(hx, hy, hz);
  // точки диска: где в массиве, нормаль, свет и блик
  const at = [];
  const nrm = [];
  const lit = [];
  const gleam = [];
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const x = (px + 0.5 - mid) / radius;
      const y = (py + 0.5 - mid) / radius;
      const d = Math.hypot(x, y);
      const o = (py * size + px) * 4;
      const cover = clamp01((1 - d) * radius + 0.5);              // край диска сглажен
      data[o] = data[o + 1] = data[o + 2] = 0;
      data[o + 3] = Math.round(cover * 255);
      if (cover <= 0) continue;
      const k = d > 1 ? 1 / d : 1;
      const nx = x * k;
      const ny = y * k;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const ndl = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2];
      const diff = clamp01((ndl + 0.3) / 1.3) ** 1.15;
      const ndh = Math.max(0, (nx * hx + ny * hy + nz * hz) / hn);
      at.push(o);
      nrm.push(nx, ny, nz);
      lit.push((mat.amb + (1 - mat.amb) * diff) * (1 - mat.limb * (1 - nz) ** 2.4));
      gleam.push(255 * mat.spec * ndh ** mat.shine);
    }
  }
  const count = at.length;
  const OFF = Int32Array.from(at);
  const N = Float32Array.from(nrm);
  const LIT = Float32Array.from(lit);
  const GLEAM = Float32Array.from(gleam);

  return {
    count,
    paint(m) {
      for (let i = 0; i < count; i++) {
        const nx = N[i * 3];
        const ny = N[i * 3 + 1];
        const nz = N[i * 3 + 2];
        // нормаль — в координаты мяча (обратный поворот — транспонированная матрица)
        tex(m[0] * nx + m[3] * ny + m[6] * nz, m[1] * nx + m[4] * ny + m[7] * nz, m[2] * nx + m[5] * ny + m[8] * nz, aa);
        const o = OFF[i];
        const l = LIT[i];
        const g = GLEAM[i];
        data[o] = out[0] * l + g;
        data[o + 1] = out[1] * l + g;
        data[o + 2] = out[2] * l + g;
      }
    },
  };
}
