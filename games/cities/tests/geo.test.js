// География глобуса: точки на сфере, поворот, дуги маршрута, решётка суши, разбор цветов для холста.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toVec, toLatLon, angle, distanceKm, slerp, viewOf, arcPoints, isVisible,
  STEP, ROWS, GRID_POINTS, rowCount, rowLat, pointLon, landPoints, isLandAt,
} from '../geo.js';
import { LAND } from '../land.js';
import { parseColor, rgba, GLOBE_COLORS } from '../colors.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const len = (v) => Math.hypot(v[0], v[1], v[2]);

test('точка на сфере и обратно', () => {
  for (const [lat, lon] of [[0, 0], [55.75, 37.62], [-33.87, 151.21], [40.71, -74.01], [89, 10], [-89, -170]]) {
    const v = toVec(lat, lon);
    assert.ok(near(len(v), 1));
    const back = toLatLon(v);
    assert.ok(near(back.lat, lat, 1e-6) && near(back.lon, lon, 1e-6), `${lat}, ${lon}`);
  }
  assert.deepEqual(toVec(0, 0).map((x) => Math.round(x)), [0, 0, 1]);
  assert.deepEqual(toVec(90, 0).map((x) => Math.round(x)), [0, 1, 0]);
  assert.deepEqual(toVec(0, 90).map((x) => Math.round(x)), [1, 0, 0]);
});

test('расстояния по дуге большого круга', () => {
  assert.ok(Math.abs(distanceKm(55.75, 37.62, 59.94, 30.31) - 634) < 10);            // Москва — Петербург
  assert.ok(Math.abs(distanceKm(51.51, -0.13, 40.71, -74.01) - 5570) < 40);          // Лондон — Нью-Йорк
  assert.equal(distanceKm(10, 20, 10, 20), 0);
  assert.ok(Math.abs(distanceKm(0, 0, 0, 180) - 20015) < 5);                          // пол-экватора
  assert.ok(near(angle(toVec(0, 0), toVec(0, 90)), Math.PI / 2));
});

test('дуга между городами: концы на месте, середина посередине, точки на сфере', () => {
  const a = toVec(55.75, 37.62);
  const b = toVec(40.71, -74.01);
  assert.ok(near(angle(slerp(a, b, 0), a), 0, 1e-6));
  assert.ok(near(angle(slerp(a, b, 1), b), 0, 1e-6));
  const mid = slerp(a, b, 0.5);
  assert.ok(near(len(mid), 1));
  assert.ok(near(angle(a, mid), angle(mid, b), 1e-9));
  assert.deepEqual(slerp(a, a, 0.3), a);
  // противоположные точки: путь есть, без NaN
  const anti = [toVec(10, 20), toVec(-10, -160)];
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    const p = slerp(anti[0], anti[1], t);
    assert.ok(p.every(Number.isFinite) && near(len(p), 1, 1e-6), `t=${t}`);
  }
});

test('поворот глобуса: выбранная точка — в центре, север — сверху', () => {
  for (const [lat, lon] of [[55.75, 37.62], [-33.87, 151.21], [0, -120], [70, 100]]) {
    const view = viewOf(lat, lon);
    const c = view.apply(toVec(lat, lon));
    assert.ok(near(c[0], 0) && near(c[1], 0) && near(c[2], 1), `центр ${lat}, ${lon}`);
    const north = view.apply(toVec(lat + 5, lon));
    assert.ok(north[1] > 0 && near(north[0], 0), 'севернее — выше');
    const east = view.apply(toVec(lat, lon + 5));
    assert.ok(east[0] > 0, 'восточнее — правее');
    const back = view.apply(toVec(-lat, lon + 180));
    assert.ok(back[2] < 0, 'обратная сторона не видна');
  }
  const out = [0, 0, 0];
  assert.equal(viewOf(1, 2).apply(toVec(3, 4), out), out);
});

test('дуга маршрута приподнята над шаром: дальше лететь — выше', () => {
  const a = toVec(55.75, 37.62);
  const short = arcPoints(a, toVec(59.94, 30.31), 20);
  const long = arcPoints(a, toVec(-33.87, 151.21), 20);
  assert.equal(short.length, 21 * 3);
  const at = (pts, k) => [pts[k * 3], pts[k * 3 + 1], pts[k * 3 + 2]];
  assert.ok(near(len(at(short, 0)), 1) && near(len(at(short, 20)), 1), 'концы — на поверхности');
  assert.ok(near(angle(at(long, 0), a), 0, 1e-6));
  assert.ok(len(at(short, 10)) > 1 && len(at(long, 10)) > len(at(short, 10)));
  assert.ok(len(at(long, 10)) < 1.25);
  // точка над краем диска видна, за шаром — нет
  assert.ok(isVisible([0, 0, 0.5]));
  assert.ok(isVisible([1.05, 0, -0.1]));
  assert.ok(!isVisible([0.5, 0, -0.5]));
});

test('решётка суши: биты по числу точек, знакомые места на месте', () => {
  assert.equal(ROWS, 180 / STEP);
  let total = 0;
  for (let r = 0; r < ROWS; r++) {
    total += rowCount(r);
    assert.ok(rowLat(r) > -90 && rowLat(r) < 90);
    assert.ok(pointLon(r, 0) >= -180 && pointLon(r, rowCount(r) - 1) < 180);
  }
  assert.equal(total, GRID_POINTS);
  assert.ok(rowCount(ROWS / 2) > rowCount(2) * 10, 'у полюсов точек в ряду меньше');
  assert.equal(Buffer.from(LAND, 'base64').length, Math.ceil(GRID_POINTS / 8));

  const pts = landPoints(LAND);
  const count = pts.length / 3;
  assert.ok(count / GRID_POINTS > 0.25 && count / GRID_POINTS < 0.36, `суши ${(count / GRID_POINTS * 100).toFixed(1)}%`);
  for (let i = 0; i < pts.length; i += 3) assert.ok(near(Math.hypot(pts[i], pts[i + 1], pts[i + 2]), 1, 1e-5));

  const land = { Москва: [55.75, 37.6], Токио: [35.7, 139.7], Лондон: [51.5, -0.1], Сидней: [-33.9, 151.2], Каир: [30, 31.2], Сахара: [23, 10], Сибирь: [62, 100], Бразилия: [-10, -55], Антарктида: [-80, 30], Гренландия: [72, -40], Мадагаскар: [-19, 47] };
  const sea = { 'Тихий океан': [0, -140], Атлантика: [30, -40], 'Индийский океан': [-30, 80], 'Южный океан': [-58, -120], 'Северный полюс': [89, 0] };
  for (const [name, [lat, lon]] of Object.entries(land)) assert.ok(isLandAt(LAND, lat, lon), `${name} — суша`);
  for (const [name, [lat, lon]] of Object.entries(sea)) assert.ok(!isLandAt(LAND, lat, lon), `${name} — вода`);
});

test('цвета для холста: rgb(), color(srgb), #hex; непонятное — запасной цвет', () => {
  assert.deepEqual(parseColor('rgb(1, 2, 3)'), [1, 2, 3]);
  assert.deepEqual(parseColor('rgba(10, 20, 30, 0.5)'), [10, 20, 30]);
  assert.deepEqual(parseColor('rgb(10 20 30 / 50%)'), [10, 20, 30]);
  assert.deepEqual(parseColor('color(srgb 1 0.5 0)'), [255, 128, 0]);
  assert.deepEqual(parseColor('color(srgb 0.2 0.4 0.6 / 0.5)'), [51, 102, 153]);
  assert.deepEqual(parseColor('#ff8000'), [255, 128, 0]);
  assert.deepEqual(parseColor('#abc'), [170, 187, 204]);
  assert.deepEqual(parseColor(''), [128, 128, 128]);
  assert.deepEqual(parseColor('var(--нет)', [1, 1, 1]), [1, 1, 1]);
  assert.deepEqual(parseColor(null), [128, 128, 128]);
  assert.equal(rgba([1, 2, 3]), 'rgba(1, 2, 3, 1)');
  assert.equal(rgba([1, 2, 3], 0.25), 'rgba(1, 2, 3, 0.25)');
  assert.equal(new Set(GLOBE_COLORS).size, GLOBE_COLORS.length);
});
