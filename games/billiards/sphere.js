// Шар как настоящий шар, без DOM: у каждого шара есть ориентация (матрица поворота 3×3), она крутится вместе
// с его вращением, а картинка считается по точкам — для каждой точки круга на экране находится точка сферы,
// переводится в «систему шара» и красится по его рисунку: цвет, белый круг с номером, полоса, блик.
// Поэтому видно, как шар катится, скользит с оттяжкой или вертится на месте от бокового вращения.
//
// Оси — как на экране: x вправо, y вниз, z на зрителя. Матрица M (по строкам) переводит из системы шара в экранную.
// Рисунок в системе шара: номера — на концах оси X, полоса полосатого шара опоясывает ось Z.

export const identity = () => [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** Повернуть ориентацию: шар вращается с угловой скоростью (wx, wy, wz) в течение dt. Меняет M на месте. */
export function rotate(M, wx, wy, wz, dt) {
  const w = Math.hypot(wx, wy, wz);
  const angle = w * dt;
  if (angle < 1e-9) return M;
  const ax = wx / w;
  const ay = wy / w;
  const az = wz / w;
  const s = Math.sin(angle);
  const c = 1 - Math.cos(angle);
  // формула Родрига: R = I + s·K + c·K², где K·p = a × p
  const r00 = 1 - c * (ay * ay + az * az);
  const r01 = -s * az + c * ax * ay;
  const r02 = s * ay + c * ax * az;
  const r10 = s * az + c * ax * ay;
  const r11 = 1 - c * (ax * ax + az * az);
  const r12 = -s * ax + c * ay * az;
  const r20 = -s * ay + c * ax * az;
  const r21 = s * ax + c * ay * az;
  const r22 = 1 - c * (ax * ax + ay * ay);
  for (let k = 0; k < 3; k++) {
    const a = M[k];
    const b = M[3 + k];
    const d = M[6 + k];
    M[k] = r00 * a + r01 * b + r02 * d;
    M[3 + k] = r10 * a + r11 * b + r12 * d;
    M[6 + k] = r20 * a + r21 * b + r22 * d;
  }
  return M;
}

/** Выправить матрицу после тысяч поворотов (накапливается погрешность). */
export function orthonormalize(M) {
  // столбцы — оси шара: первый нормируем, второй делаем перпендикулярным, третий — их произведение
  let ax = M[0];
  let ay = M[3];
  let az = M[6];
  let n = Math.hypot(ax, ay, az) || 1;
  ax /= n;
  ay /= n;
  az /= n;
  let bx = M[1];
  let by = M[4];
  let bz = M[7];
  const dot = ax * bx + ay * by + az * bz;
  bx -= dot * ax;
  by -= dot * ay;
  bz -= dot * az;
  n = Math.hypot(bx, by, bz) || 1;
  bx /= n;
  by /= n;
  bz /= n;
  M[0] = ax; M[3] = ay; M[6] = az;
  M[1] = bx; M[4] = by; M[7] = bz;
  M[2] = ay * bz - az * by;
  M[5] = az * bx - ax * bz;
  M[8] = ax * by - ay * bx;
  return M;
}

/** Случайная ориентация — чтобы шары в пирамиде лежали номерами кто куда. */
export function randomOrientation(rng = Math.random) {
  const M = identity();
  rotate(M, rng() - 0.5, rng() - 0.5, rng() - 0.5, 20);
  rotate(M, rng() - 0.5, rng() - 0.5, rng() - 0.5, 20);
  return orthonormalize(M);
}

// цвета шаров: 1 жёлтый, 2 синий, 3 красный, 4 фиолетовый, 5 оранжевый, 6 зелёный, 7 бордовый, 8 чёрный
export const BALL_COLORS = [
  [246, 241, 228], [244, 196, 20], [31, 79, 191], [214, 40, 40], [112, 48, 160], [240, 127, 19], [24, 128, 66], [128, 30, 34], [22, 22, 24],
];
const IVORY = [246, 241, 228];
const DOT = [198, 40, 40];
const INK = [20, 20, 22];

export const colorOf = (id) => BALL_COLORS[id <= 8 ? id : id - 8];

const NUM_COS = Math.cos(0.44);           // угловой размер белого круга с номером
const NUM_SIN = Math.sin(0.44);
const STRIPE = 0.5;                       // полуширина полосы (по оси Z шара)
const DOT_COS = Math.cos(0.17);           // красные точки на битке — по ним видно вращение
// свет — слева сверху и немного от зрителя
const LX = -0.42;
const LY = -0.54;
const LZ = 0.73;
// полувектор между светом и взглядом — для блика
const HN = Math.hypot(LX, LY, LZ + 1);
const HX = LX / HN;
const HY = LY / HN;
const HZ = (LZ + 1) / HN;

/**
 * Цвет точки шара id по её координатам в системе шара (lx, ly, lz) — без света.
 * digits — { size, alpha: Uint8Array } для этого номера или null. → [r, g, b] в out.
 */
export function pattern(id, lx, ly, lz, digits, out) {
  if (id === 0) {
    const m = Math.max(Math.abs(lx), Math.abs(ly), Math.abs(lz));
    const c = m > DOT_COS ? DOT : IVORY;
    out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
    return out;
  }
  const base = colorOf(id);
  let c = id > 8 && Math.abs(lz) > STRIPE ? IVORY : base;
  if (Math.abs(lx) > NUM_COS) {
    c = IVORY;
    if (digits) {
      // круг с номером: с обратной стороны шара зеркалим, чтобы цифра читалась
      const u = (lx > 0 ? ly : -ly) / NUM_SIN;
      const v = lz / NUM_SIN;
      // оси экрана (x вправо, y вниз, z на зрителя) — «левая» тройка, поэтому v идёт вниз без переворота:
      // иначе цифры на шарах вышли бы зеркальными
      const px = Math.floor((u * 0.5 + 0.5) * digits.size);
      const py = Math.floor((v * 0.5 + 0.5) * digits.size);
      if (px >= 0 && py >= 0 && px < digits.size && py < digits.size) {
        const a = digits.alpha[py * digits.size + px] / 255;
        if (a > 0) {
          out[0] = IVORY[0] + (INK[0] - IVORY[0]) * a;
          out[1] = IVORY[1] + (INK[1] - IVORY[1]) * a;
          out[2] = IVORY[2] + (INK[2] - IVORY[2]) * a;
          return out;
        }
      }
    }
  }
  out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
  return out;
}

const rgb = [0, 0, 0];

/**
 * Нарисовать шар в массив RGBA размером size × size (как у ImageData): M — ориентация, id — номер шара,
 * digits — картинка номера или null. Края сглажены прозрачностью.
 */
export function shade(data, size, M, id, digits = null) {
  const c = size / 2;
  const r = size / 2 - 1;
  let o = 0;
  for (let j = 0; j < size; j++) {
    const y = (j + 0.5 - c) / r;
    for (let i = 0; i < size; i++, o += 4) {
      const x = (i + 0.5 - c) / r;
      const d2 = x * x + y * y;
      if (d2 >= 1.02) {
        data[o + 3] = 0;
        continue;
      }
      const z = Math.sqrt(Math.max(0, 1 - d2));
      // точка сферы в системе шара: Mᵀ · (x, y, z)
      const lx = M[0] * x + M[3] * y + M[6] * z;
      const ly = M[1] * x + M[4] * y + M[7] * z;
      const lz = M[2] * x + M[5] * y + M[8] * z;
      pattern(id, lx, ly, lz, digits, rgb);
      const diffuse = Math.max(0, x * LX + y * LY + z * LZ);
      const light = (0.4 + 0.72 * diffuse) * (0.7 + 0.3 * z);
      const h = Math.max(0, x * HX + y * HY + z * HZ);
      const h2 = h * h;
      const h8 = h2 * h2 * h2 * h2;
      const spec = h8 * h8 * h8 * h8 * h8 * h8 * 215;      // h⁴⁸ — маленький резкий блик
      data[o] = Math.min(255, rgb[0] * light + spec);
      data[o + 1] = Math.min(255, rgb[1] * light + spec);
      data[o + 2] = Math.min(255, rgb[2] * light + spec);
      const edge = (1 - Math.sqrt(d2)) * r + 0.5;
      data[o + 3] = edge >= 1 ? 255 : edge <= 0 ? 0 : Math.round(edge * 255);
    }
  }
  return data;
}
