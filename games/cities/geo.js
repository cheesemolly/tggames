// География «Городов» без DOM: точки на сфере, расстояния, дуги маршрута, решётка точек суши для глобуса.
// Вектор — [x, y, z] единичной длины: y — к северному полюсу, z — к зрителю при долготе 0, x — вправо (на восток).

const RAD = Math.PI / 180;
export const EARTH_KM = 6371;

export function toVec(lat, lon) {
  const c = Math.cos(lat * RAD);
  return [c * Math.sin(lon * RAD), Math.sin(lat * RAD), c * Math.cos(lon * RAD)];
}

export function toLatLon([x, y, z]) {
  return { lat: Math.asin(Math.max(-1, Math.min(1, y))) / RAD, lon: Math.atan2(x, z) / RAD };
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Угол между двумя точками сферы, радианы. */
export const angle = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(a, b))));

/** Расстояние по дуге большого круга, км (целое). */
export function distanceKm(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * RAD;
  const dLon = (lon2 - lon1) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h))));
}

/** Точка дуги большого круга от a к b, t — от 0 до 1. Для противоположных точек путь идёт через полюс. */
export function slerp(a, b, t) {
  const w = angle(a, b);
  if (w < 1e-6) return [...a];
  let s = Math.sin(w);
  let to = b;
  if (s < 1e-6) {
    // антиподы: любая дуга кратчайшая — берём ту, что через север (или через z, если точки сами на полюсах)
    to = Math.abs(a[1]) < 0.99 ? [0, 1, 0] : [0, 0, 1];
    const half = t < 0.5 ? slerp(a, to, t * 2) : slerp(to, b, t * 2 - 1);
    return half;
  }
  s = 1 / s;
  const ka = Math.sin((1 - t) * w) * s;
  const kb = Math.sin(t * w) * s;
  return [a[0] * ka + to[0] * kb, a[1] * ka + to[1] * kb, a[2] * ka + to[2] * kb];
}

/**
 * Поворот глобуса: точка (lat, lon) оказывается в центре, север — сверху. → функция (вектор, куда) → куда:
 * [x вправо, y вверх, z к зрителю] — видимая половина там, где z > 0.
 */
export function viewOf(lat, lon) {
  const cl = Math.cos(lon * RAD);
  const sl = Math.sin(lon * RAD);
  const cp = Math.cos(lat * RAD);
  const sp = Math.sin(lat * RAD);
  return {
    lat, lon,
    apply(v, out = [0, 0, 0]) {
      const x = v[0] * cl - v[2] * sl;          // вокруг оси Y на −lon
      const z = v[0] * sl + v[2] * cl;
      out[0] = x;
      out[1] = v[1] * cp - z * sp;              // вокруг оси X на lat
      out[2] = v[1] * sp + z * cp;
      return out;
    },
  };
}

// ---------- решётка точек суши ----------

export const STEP = 2;                                       // градусов между рядами и между точками в ряду
export const ROWS = Math.floor(180 / STEP);                  // ряды от южного полюса к северному
export const rowLat = (r) => -90 + STEP * (r + 0.5);
export const rowCount = (r) => Math.max(1, Math.round((360 * Math.cos(rowLat(r) * RAD)) / STEP));
/** Долгота k-й точки ряда r; нечётные ряды сдвинуты на полшага — точки ложатся «кирпичной кладкой». */
export const pointLon = (r, k) => -180 + (360 / rowCount(r)) * (k + (r % 2 ? 0.5 : 0.25));

export const GRID_POINTS = Array.from({ length: ROWS }, (_, r) => rowCount(r)).reduce((a, b) => a + b, 0);

function decode(b64) {
  if (typeof atob === 'function') return Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
  return Uint8Array.from(Buffer.from(b64, 'base64'));
}

/** Точки суши из упакованных битов (land.js) → Float32Array: x, y, z подряд. */
export function landPoints(packed) {
  const bytes = decode(packed);
  const out = [];
  let i = 0;
  for (let r = 0; r < ROWS; r++) {
    const lat = rowLat(r);
    const n = rowCount(r);
    for (let k = 0; k < n; k++, i++) {
      if (!(bytes[i >> 3] & (1 << (i & 7)))) continue;
      const v = toVec(lat, pointLon(r, k));
      out.push(v[0], v[1], v[2]);
    }
  }
  return Float32Array.from(out);
}

/** Суша ли в этой точке — по ближайшей точке решётки (для тестов и отладки). */
export function isLandAt(packed, lat, lon) {
  const bytes = decode(packed);
  const r = Math.max(0, Math.min(ROWS - 1, Math.floor((lat + 90) / STEP)));
  const n = rowCount(r);
  let i = 0;
  for (let q = 0; q < r; q++) i += rowCount(q);
  let best = 0;
  let bestD = Infinity;
  for (let k = 0; k < n; k++) {
    let d = Math.abs(pointLon(r, k) - lon);
    if (d > 180) d = 360 - d;
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  i += best;
  return Boolean(bytes[i >> 3] & (1 << (i & 7)));
}

/**
 * Дуга маршрута между двумя городами: n + 1 точек, приподнятых над поверхностью (дальше лететь — выше дуга).
 * → Float32Array: x, y, z подряд (длина вектора > 1 — это высота).
 */
export function arcPoints(a, b, n = 32) {
  const w = angle(a, b);
  const lift = 0.03 + 0.2 * (w / Math.PI);
  const out = new Float32Array((n + 1) * 3);
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const p = slerp(a, b, t);
    const h = 1 + lift * Math.sin(Math.PI * t);
    out[k * 3] = p[0] * h;
    out[k * 3 + 1] = p[1] * h;
    out[k * 3 + 2] = p[2] * h;
  }
  return out;
}

/** Точка над сферой видна, если она на ближней половине или выглядывает из-за края диска. */
export const isVisible = (p) => p[2] > 0 || p[0] * p[0] + p[1] * p[1] > 1;
