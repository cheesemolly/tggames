// Сцены и табло «Баскетбола»: у каждой площадки есть сцена, слои описаны верно, каждый рисунок рисуется (на
// поддельном холсте) и берёт только цвета палитры; цифры табло — из правильных палочек.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LOOKS, SEGMENTS, drawScore, scoreWidth, hash2 } from '../art.js';
import { SCENES, paintSky, layerSize, fade, mix } from '../scenes.js';
import { W, VIEW_MAX } from '../logic.js';

const render = readFileSync(new URL('../render.js', import.meta.url), 'utf8');
const KEYS = render.match(/export const PALETTE_KEYS = \[([^\]]*)\]/)[1].split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean);

/** Поддельный холст: считает вызовы и запоминает цвета заливки и линий. */
function fakeCanvas() {
  const calls = {};
  const colors = [];
  const stops = [];
  const gradient = () => ({ addColorStop: (at, color) => stops.push([at, color]) });
  const target = {
    createLinearGradient: gradient,
    createRadialGradient: gradient,
    measureText: (text) => ({ width: String(text).length * 8 }),
  };
  const g = new Proxy(target, {
    get(t, name) {
      if (name in t) return t[name];
      return (...args) => {
        calls[name] = (calls[name] ?? 0) + 1;
        return args;
      };
    },
    set(t, name, value) {
      if (name === 'fillStyle' || name === 'strokeStyle' || name === 'shadowColor') colors.push(value);
      t[name] = value;
      return true;
    },
  });
  return { g, calls, colors, stops, drawn: () => (calls.fill ?? 0) + (calls.stroke ?? 0) + (calls.fillRect ?? 0) + (calls.fillText ?? 0) };
}

/** Палитра, которая не прощает опечаток: неизвестный цвет — ошибка; какие цвета спрашивали — запоминает. */
function strictPalette() {
  const asked = new Set();
  const pal = new Proxy({}, {
    get(_, key) {
      if (typeof key !== 'string') return undefined;
      assert.ok(KEYS.includes(key), `в рисунке цвет «${key}», которого нет в палитре`);
      asked.add(key);
      return `rgb(${10 + KEYS.indexOf(key) * 6},${40 + KEYS.indexOf(key) * 5},${200 - KEYS.indexOf(key) * 4})`;
    },
  });
  return { pal, asked };
}

test('у каждой площадки есть сцена; сцены без площадки нет', () => {
  const used = new Set(Object.values(LOOKS).map((l) => l.scene));
  for (const [skin, look] of Object.entries(LOOKS)) assert.ok(SCENES[look.scene], `${skin}: нет сцены ${look.scene}`);
  assert.deepEqual([...used].sort(), Object.keys(SCENES).sort());
  assert.equal(Object.keys(LOOKS)[0], 'telegram');
});

test('небо: пять цветов снизу вверх, высоты растут, полоска красится вся', () => {
  for (const [name, sc] of Object.entries(SCENES)) {
    assert.deepEqual(sc.sky.map(([, key]) => key), ['sky0', 'sky1', 'sky2', 'sky3', 'sky4'], name);
    assert.equal(sc.sky[0][0], 0);
    for (let i = 1; i < sc.sky.length; i++) assert.ok(sc.sky[i][0] > sc.sky[i - 1][0], `${name}: высоты неба`);
    assert.ok(sc.skyRate > 0 && sc.skyRate <= 0.5, `${name}: небо едет медленнее корзин`);
    const top = sc.sky[4][0] + VIEW_MAX + 40;
    const { g, stops, calls } = fakeCanvas();
    const { pal } = strictPalette();
    paintSky(g, sc, pal, 500, top);
    assert.equal(stops.length, 5);
    for (const [at] of stops) assert.ok(at >= 0 && at <= 1);
    assert.ok(stops[4][0] < 1, 'выше последнего цвета небо одноцветное — запас на экран');
    assert.equal(calls.fillRect, 1);
  }
});

test('слои сцен описаны верно: вид, глубина, размеры', () => {
  for (const [name, sc] of Object.entries(SCENES)) {
    assert.ok(sc.layers.length >= 6, `${name}: слоёв ${sc.layers.length}`);
    sc.layers.forEach((L, i) => {
      const where = `${name}, слой ${i} (${L.kind})`;
      assert.ok(['band', 'one', 'many', 'tile', 'twinkle'].includes(L.kind), where);
      assert.ok(L.rate > 0 && L.rate <= 0.6, `${where}: глубина ${L.rate}`);
      if (L.fade) assert.ok(L.fade[0] >= 0 && L.fade[1] > L.fade[0], where);
      if (L.kind === 'twinkle') {
        assert.ok(L.cell >= 30 && L.size > 0 && KEYS.includes(L.color), where);
        return;
      }
      assert.equal(typeof L.paint, 'function', where);
      if (L.kind === 'band') {
        assert.ok(L.h > 0 && L.at >= 0, where);
        if (L.every) assert.ok(L.every >= L.h * 0.9, `${where}: повторы не налезают`);
        assert.deepEqual(layerSize(L), [W, L.h]);
      } else if (L.kind === 'one') {
        assert.ok(L.x >= 0 && L.x <= 1 && L.w > 0 && L.h > 0, where);
        assert.deepEqual(layerSize(L), [L.w, L.h]);
      } else if (L.kind === 'many') {
        assert.ok(L.to > L.from && L.every > 0 && L.variants >= 1 && L.w[0] <= L.w[1] && L.ratio > 0 && L.drift >= 0, where);
        for (let v = 0; v < L.variants; v++) {
          const [w, h] = layerSize(L, v);
          assert.ok(w >= L.w[0] - 1 && w <= L.w[1] + 1 && Math.abs(h - w * L.ratio) <= 1, where);
        }
        if (L.dim) assert.ok(L.dim[1] > L.dim[0] && L.dim[2] >= 0 && L.dim[2] < 1, where);
      } else assert.ok(L.h > 0, where);
    });
    // ближние слои рисуются поверх дальних: последний слой — из самых близких
    const rates = sc.layers.filter((L) => L.kind === 'band').map((L) => L.rate);
    assert.ok(rates[rates.length - 1] >= Math.max(...rates) - 0.25, `${name}: ближний план — в конце`);
  }
});

test('каждый слой рисуется и берёт только цвета палитры; вместе сцены используют всю палитру сцены', () => {
  const sceneKeys = KEYS.slice(0, KEYS.indexOf('ghost'));
  assert.equal(sceneKeys.length, 18);
  const everything = new Set();
  for (const [name, sc] of Object.entries(SCENES)) {
    const { pal, asked } = strictPalette();
    sc.layers.forEach((L, i) => {
      if (L.kind === 'twinkle') {
        asked.add(L.color);
        return;
      }
      for (let variant = 0; variant < (L.variants ?? 1); variant++) {
        const [w, h] = layerSize(L, variant);
        const { g, drawn } = fakeCanvas();
        L.paint(g, pal, w, h, variant + 1);
        assert.ok(drawn() > 0, `${name}, слой ${i}: ничего не нарисовано`);
      }
    });
    for (const [, key] of sc.sky) asked.add(key);
    for (const key of asked) everything.add(key);
    assert.ok(asked.size >= 10, `${name}: цветов ${asked.size}`);
  }
  for (const key of sceneKeys) assert.ok(everything.has(key), `цвет сцены ${key} никому не нужен`);
  for (const key of everything) assert.ok(sceneKeys.includes(key), `сцены берут цвет игры ${key}`);
});

test('цвета: прозрачность и смесь', () => {
  assert.equal(fade('rgb(10,20,30)', 0.5), 'rgba(10,20,30,0.5)');
  assert.equal(mix('rgb(0,0,0)', 'rgb(200,100,50)', 0.5), 'rgb(100,50,25)');
  assert.equal(mix('rgb(9,9,9)', 'rgb(200,100,50)', 0), 'rgb(9,9,9)');
  assert.equal(mix('rgb(9,9,9)', 'rgb(200,100,50)', 1), 'rgb(200,100,50)');
});

test('рисунок сцены всегда один и тот же: случайность — от зерна', () => {
  assert.equal(hash2(3, 7), hash2(3, 7));
  assert.notEqual(hash2(3, 7), hash2(7, 3));
  const values = Array.from({ length: 400 }, (_, i) => hash2(i, 11));
  assert.ok(values.every((v) => v >= 0 && v < 1));
  assert.ok(values.filter((v) => v < 0.5).length > 150 && values.filter((v) => v < 0.5).length < 250);
});

test('цифры табло: у каждой — свои палочки, как на настоящем табло', () => {
  assert.deepEqual(Object.keys(SEGMENTS), ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
  assert.equal(new Set(Object.values(SEGMENTS).map((s) => [...s].sort().join(''))).size, 10, 'все цифры разные');
  for (const s of Object.values(SEGMENTS)) {
    assert.match(s, /^[a-g]+$/);
    assert.equal(new Set(s).size, s.length);
  }
  assert.deepEqual(Object.values(SEGMENTS).map((s) => s.length), [6, 2, 5, 5, 4, 5, 6, 3, 7, 6]);
  // единица — правые палочки, семёрка — единица с крышей, восьмёрка — все
  assert.equal([...SEGMENTS[1]].sort().join(''), 'bc');
  assert.equal([...SEGMENTS[7]].sort().join(''), 'abc');
  assert.equal([...SEGMENTS[8]].sort().join(''), 'abcdefg');
});

test('табло рисует по палочке на каждый сегмент; ширина строки растёт с числом цифр', () => {
  for (const str of ['0', '7', '18', '304', '9999']) {
    const { g, calls } = fakeCanvas();
    drawScore(g, str, 100, 'rgb(1,2,3)');
    assert.equal(calls.fill, [...str].reduce((sum, ch) => sum + SEGMENTS[ch].length, 0), str);
  }
  assert.ok(scoreWidth('88', 100) > scoreWidth('8', 100) * 2);
  assert.ok(Math.abs(scoreWidth('8', 100) - 56) < 1e-9);
  const { g, calls } = fakeCanvas();
  drawScore(g, 'x', 100, 'rgb(1,2,3)');
  assert.equal(calls.fill ?? 0, 0, 'не цифра — пусто, а не ошибка');
});
