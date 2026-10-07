// Суша для глобуса «Городов» (games/cities/land.js) из контуров Natural Earth (общественное достояние):
//   node tools/cities-land.mjs <путь к ne_110m_land.geojson>
// Глобус рисуется точками: ряды по широте через STEP градусов, в ряду — столько точек, сколько помещается на
// параллели (у полюсов меньше), нечётные ряды сдвинуты на полшага. Про каждую точку решеток хранится один бит —
// суша или вода; биты всех рядов подряд упакованы в base64. Сами контуры в репозиторий не кладём.

import { readFileSync, writeFileSync } from 'node:fs';
import { STEP, rowCount, rowLat, pointLon, ROWS } from '../games/cities/geo.js';

const src = process.argv[2];
if (!src) {
  console.error('node tools/cities-land.mjs <путь к ne_110m_land.geojson>');
  process.exit(1);
}

const geo = JSON.parse(readFileSync(src, 'utf8'));
const polygons = [];
for (const f of geo.features) {
  const g = f.geometry;
  const list = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  for (const rings of list) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [x, y] of rings[0]) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    polygons.push({ rings, minX, maxX, minY, maxY });
  }
}

function inRing(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function isLand(lon, lat) {
  for (const p of polygons) {
    if (lon < p.minX || lon > p.maxX || lat < p.minY || lat > p.maxY) continue;
    if (!inRing(p.rings[0], lon, lat)) continue;
    if (p.rings.slice(1).some((hole) => inRing(hole, lon, lat))) continue;
    return true;
  }
  return false;
}

// точка — суша, если сушей оказалась она сама или хотя бы две из четырёх точек вокруг (на треть шага): так не
// пропадают узкие места вроде Японии и Италии, а одинокие скалы не превращаются в точки
const bits = [];
let land = 0;
for (let r = 0; r < ROWS; r++) {
  const lat = rowLat(r);
  const n = rowCount(r);
  for (let k = 0; k < n; k++) {
    const lon = pointLon(r, k);
    const d = STEP / 3;
    const dl = d / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
    const wrap = (x) => (x > 180 ? x - 360 : x < -180 ? x + 360 : x);
    const around = [[dl, 0], [-dl, 0], [0, d], [0, -d]]
      .filter(([dx, dy]) => isLand(wrap(lon + dx), Math.max(-89.9, Math.min(89.9, lat + dy)))).length;
    const on = isLand(lon, lat) || around >= 2;
    bits.push(on ? 1 : 0);
    if (on) land++;
  }
}

const bytes = new Uint8Array(Math.ceil(bits.length / 8));
bits.forEach((b, i) => {
  if (b) bytes[i >> 3] |= 1 << (i & 7);
});
const b64 = Buffer.from(bytes).toString('base64');

const out = new URL('../games/cities/land.js', import.meta.url);
writeFileSync(out, `// Суша для глобуса: по биту на точку решётки (geo.js: ряды через ${STEP}°), base64. Собрано tools/cities-land.mjs
// из контуров Natural Earth (общественное достояние). Точек: ${bits.length}, суша: ${land}.
export const LAND = '${b64}';
`);
console.log('точек', bits.length, 'суша', land, 'байт', b64.length);
