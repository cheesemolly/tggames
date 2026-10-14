// Значки «Лисьей охоты» (art-items2.js) без браузера: украшения, дары леса, значки экрана и карты рисуются на
// поддельном холсте. Проверяется то, что на глаз не поймать, пока не сломается в окне игры: каждый значок есть,
// не пуст, помещается в свою рамку целиком (значок для окон рисуется без полей — что вылезло, то срезано),
// в цвет не попало NaN, пустое сердце — того же силуэта, что полное. Как значки выглядят — смотреть глазами:
// tools/fox-hunt-sheet.html?part=sprites&only=item.,gift.,ui.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as A from '../art.js';

const before = new Set(A.spriteKeys());
const rigsBefore = new Set(A.rigIds());
const MOD = await import('../art-items2.js');
const OWN = A.spriteKeys().filter((key) => !before.has(key));
const SRC = readFileSync(new URL('../art-items2.js', import.meta.url), 'utf8');

// что просили нарисовать (01-design, раздел 6, и список значков экрана)
const ITEMS = ['clover', 'rabbitfoot', 'fang', 'owlfeather', 'heartberry', 'crystal', 'dew', 'magnet', 'twintail', 'firetail', 'icetrail', 'proboscis', 'acornshield', 'pouch', 'owleye',
  'horseshoe', 'collar', 'bell', 'springpaws', 'hushbell', 'carrot', 'mirror', 'honey', 'whetstone', 'quickpaws', 'thrift', 'antler', 'bearcharm', 'phoenix', 'sporecap', 'silk', 'eagleeye',
  'greedacorn', 'goldcarrot', 'pocketwatch', 'glowbug'];
const GIFTS = ['vigor', 'wisdom', 'swift', 'pounce', 'sharp', 'thickfur', 'frugal', 'bargain', 'pack', 'guard', 'bounty', 'fortune', 'antidote', 'surefoot', 'leech', 'tracker', 'spark', 'secondwind'];
const UI = ['heart', 'heart.empty', 'shield', 'shield.empty', 'mana', 'life', 'life.empty', 'coin', 'score', 'dash', 'dash.empty', 'pause', 'play', 'gear', 'bag', 'stats', 'music', 'sound', 'lefty', 'flip',
  'exit', 'restart', 'room.start', 'room.hunt', 'room.boss', 'room.treasure', 'room.shop', 'room.altar', 'room.well', 'room.camp', 'room.forge', 'room.spring', 'room.totem', 'room.gamble',
  'room.raven', 'room.unknown'];
const WANT = [...ITEMS.map((id) => `item.${id}`), ...GIFTS.map((id) => `gift.${id}`), ...UI.map((name) => `ui.${name}`)];

// ---------- поддельный холст ----------
// Тот же приём, что в art.test.js (оттуда его не взять — он не вынесен в общий файл): холст понимает всё, чем рисуют
// картинки, и запоминает рамку закрашенного (с учётом обрезки), цвета и прозрачности. Чего нет на старых
// телефонах (roundRect, filter) — того нет и здесь.

const COLOR = /^(#[0-9a-f]{3,4}|#[0-9a-f]{6}|#[0-9a-f]{8})$/i;
function validColor(c) {
  if (typeof c !== 'string') return false;
  if (COLOR.test(c)) return true;
  const m = /^rgba?\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*(?:,\s*(-?[\d.]+)\s*)?\)$/.exec(c);
  if (!m) return false;
  const v = m.slice(1).filter((x) => x !== undefined).map(Number);
  return v.every(Number.isFinite) && v.slice(0, 3).every((x) => x >= 0 && x <= 255) && (v.length < 4 || (v[3] >= 0 && v[3] <= 1));
}

const BLENDS = new Set(['source-over', 'source-in', 'source-atop', 'destination-over', 'destination-in', 'destination-out']);
const ERASERS = new Set(['destination-in', 'destination-out']);
const PLAIN = ['lineCap', 'lineJoin', 'miterLimit', 'lineDashOffset'];

class Gradient {
  constructor(log, numbers) {
    this.log = log;
    for (const n of numbers) assert.ok(Number.isFinite(n), 'в градиенте не число');
  }

  addColorStop(at, color) {
    assert.ok(Number.isFinite(at) && at >= 0 && at <= 1, `остановка градиента ${at}`);
    this.log.colors.add(color);
  }
}

function fakeCanvas(width, height) {
  const log = { colors: new Set(), paints: 0, box: [Infinity, Infinity, -Infinity, -Infinity], alphas: [], balance: 0, calls: 0 };
  let m = [1, 0, 0, 1, 0, 0];
  let path = [];
  let cur = [0, 0];
  let clip = null;
  let dash = [];
  const stack = [];
  const state = { fillStyle: '#000000', strokeStyle: '#000000', lineWidth: 1, globalAlpha: 1, globalCompositeOperation: 'source-over' };
  for (const name of PLAIN) state[name] = null;

  const finite = (...v) => {
    for (const x of v) assert.ok(typeof x === 'number' && Number.isFinite(x), `в рисунок попало не число: ${x}`);
  };
  const mul = (n) => {
    m = [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
      m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  };
  const dev = (x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  const add = (x, y) => {
    finite(x, y);
    path.push(dev(x, y));
    cur = [x, y];
  };
  const boxOf = (pts, grow = 0) => {
    if (!pts.length) return null;
    let b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, y] of pts) b = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)];
    return [b[0] - grow, b[1] - grow, b[2] + grow, b[3] + grow];
  };
  const cut = (a, b) => (b ? [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])] : a);
  const painted = (b, ink) => {
    log.calls += 1;
    if (!(ink instanceof Gradient)) log.colors.add(ink);
    log.alphas.push(state.globalAlpha);
    if (!b || ERASERS.has(state.globalCompositeOperation)) return;
    const v = cut(b, clip);
    if (v[0] >= v[2] || v[1] >= v[3]) return;
    log.paints += 1;
    log.box = [Math.min(log.box[0], v[0]), Math.min(log.box[1], v[1]), Math.max(log.box[2], v[2]), Math.max(log.box[3], v[3])];
  };
  const scale = () => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
  const arcPoints = (x, y, rx, ry, rot, a0, a1, ccw) => {
    finite(x, y, rx, ry, rot, a0, a1);
    assert.ok(rx >= 0 && ry >= 0, 'отрицательный радиус');
    const full = Math.PI * 2;
    let span = a1 - a0;
    if (ccw) span = span <= -full ? -full : -((((-span) % full) + full) % full || (span ? full : 0));
    else span = span >= full ? full : (((span % full) + full) % full) || (span ? full : 0);
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    for (let i = 0; i <= 32; i++) {
      const a = a0 + (span * i) / 32;
      const px = Math.cos(a) * rx;
      const py = Math.sin(a) * ry;
      add(x + px * c - py * s, y + px * s + py * c);
    }
  };

  const ctx = {
    canvas: null,
    save() {
      stack.push({ m, clip, state: { ...state }, dash });
      log.balance += 1;
    },
    restore() {
      assert.ok(stack.length, 'restore без save');
      const top = stack.pop();
      m = top.m;
      clip = top.clip;
      Object.assign(state, top.state);
      dash = top.dash;
      log.balance -= 1;
    },
    translate(x, y) {
      finite(x, y);
      mul([1, 0, 0, 1, x, y]);
    },
    rotate(a) {
      finite(a);
      mul([Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]);
    },
    scale(x, y) {
      finite(x, y);
      mul([x, 0, 0, y, 0, 0]);
    },
    setTransform(a, b, c, d, e, f) {
      finite(a, b, c, d, e, f);
      m = [a, b, c, d, e, f];
    },
    beginPath() {
      path = [];
    },
    closePath() {},
    moveTo: add,
    lineTo: add,
    quadraticCurveTo(cx, cy, x, y) {
      finite(cx, cy, x, y);
      const [x0, y0] = cur;
      for (let i = 1; i <= 8; i++) {
        const t = i / 8;
        const u = 1 - t;
        add(u * u * x0 + 2 * u * t * cx + t * t * x, u * u * y0 + 2 * u * t * cy + t * t * y);
      }
    },
    bezierCurveTo(ax, ay, bx, by, x, y) {
      finite(ax, ay, bx, by, x, y);
      const [x0, y0] = cur;
      for (let i = 1; i <= 10; i++) {
        const t = i / 10;
        const u = 1 - t;
        add(u * u * u * x0 + 3 * u * u * t * ax + 3 * u * t * t * bx + t * t * t * x, u * u * u * y0 + 3 * u * u * t * ay + 3 * u * t * t * by + t * t * t * y);
      }
    },
    arc(x, y, r, a0, a1, ccw = false) {
      arcPoints(x, y, r, r, 0, a0, a1, ccw);
    },
    ellipse(x, y, rx, ry, rot, a0, a1, ccw = false) {
      arcPoints(x, y, rx, ry, rot, a0, a1, ccw);
    },
    arcTo(x1, y1, x2, y2, r) {
      finite(x2, y2);
      assert.ok(Number.isFinite(r) && r >= 0, 'arcTo: радиус');
      add(x1, y1);                       // угол целиком: рамка — с запасом
    },
    fill(rule) {
      assert.ok(rule === undefined || rule === 'nonzero' || rule === 'evenodd', `правило заливки ${rule}`);
      painted(boxOf(path), state.fillStyle);
    },
    stroke() {
      painted(boxOf(path, (state.lineWidth * scale()) / 2), state.strokeStyle);
    },
    clip() {
      clip = cut(boxOf(path) ?? [0, 0, 0, 0], clip);
    },
    fillRect(x, y, w, h) {
      finite(x, y, w, h);
      painted(boxOf([dev(x, y), dev(x + w, y), dev(x + w, y + h), dev(x, y + h)]), state.fillStyle);
    },
    drawImage(img, ...rest) {
      assert.ok(img && typeof img.width === 'number', 'drawImage: не холст');
      finite(...rest);
      const [x, y, w, h] = rest.length === 2 ? [rest[0], rest[1], img.width, img.height] : rest;
      painted(boxOf([dev(x, y), dev(x + w, y), dev(x + w, y + h), dev(x, y + h)]), '#000000');
    },
    createLinearGradient: (...v) => new Gradient(log, v),
    createRadialGradient(...v) {
      assert.ok(v[2] >= 0 && v[5] >= 0, 'отрицательный радиус градиента');
      return new Gradient(log, v);
    },
    setLineDash(list) {
      finite(...list);
      dash = list.slice();
    },
  };
  const setters = {
    fillStyle: (v) => assert.ok(v instanceof Gradient || validColor(v), `fillStyle: не цвет «${v}»`),
    strokeStyle: (v) => assert.ok(v instanceof Gradient || validColor(v), `strokeStyle: не цвет «${v}»`),
    lineWidth: (v) => assert.ok(Number.isFinite(v) && v >= 0, `lineWidth ${v}`),
    globalAlpha: (v) => assert.ok(Number.isFinite(v) && v >= 0 && v <= 1, `globalAlpha ${v}`),
    globalCompositeOperation: (v) => assert.ok(BLENDS.has(v), `режим наложения «${v}»`),
  };
  const canvas = { width, height, style: {}, log, getContext: () => proxy };
  const proxy = new Proxy(ctx, {
    get(target, key) {
      if (key in target) return target[key];
      if (key in state) return state[key];
      if (typeof key === 'symbol' || key === 'then') return undefined;
      throw new Error(`холст: «${String(key)}» есть не на всех телефонах (или его нет вовсе) — рисовать без него`);
    },
    set(target, key, value) {
      if (key in setters) setters[key](value);
      else if (!(key in state)) throw new Error(`холст: свойство «${String(key)}» есть не на всех телефонах (или его нет вовсе)`);
      state[key] = value;
      return true;
    },
  });
  ctx.canvas = canvas;
  return canvas;
}

const KS = [2.44, 1, 4.88];             // чёткость телефона, самая грубая и крупный план
const SETS = KS.map((k) => ({ k, art: A.createArt(k, fakeCanvas) }));

/** Рамка закрашенного в единицах мира от левого верхнего угла рамки картинки (без полей). */
function inkBox(set, key) {
  const def = A.spriteDef(key);
  const s = set.art.sprite(key, 0);
  return { log: s.c.log, box: s.c.log.box.map((v) => v / set.k - def.pad) };
}

// ---------- проверки ----------

test('файл загружается без браузера: ни DOM, ни случайности, ни своих фигур — только картинки', () => {
  const code = SRC.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  for (const word of ['document', 'window', 'Math.random', 'navigator', 'localStorage', 'requestAnimationFrame', 'performance', 'Date']) {
    assert.ok(!new RegExp(`(^|[^\\w.$])${word.replace('.', '\\.')}\\b`).test(code), `art-items2.js: ${word}`);
  }
  // чужих игр и оболочки не касается
  for (const from of code.matchAll(/from\s+'([^']+)'/g)) assert.ok(['./art.js', './art-kit.js'].includes(from[1]), `подключает ${from[1]}`);
  assert.deepEqual(A.rigIds().filter((id) => !rigsBefore.has(id)), [], 'фигур в этом файле нет');
  assert.equal(MOD.RIG_INFO, undefined);
});

test('все значки на месте: 36 украшений, 18 даров, 36 значков экрана и карты — и ничего лишнего', () => {
  assert.equal(ITEMS.length, 36);
  assert.equal(GIFTS.length, 18);
  assert.equal(UI.length, 36);
  assert.equal(new Set(WANT).size, WANT.length);
  for (const key of WANT) assert.ok(A.hasSprite(key), `нет картинки «${key}»`);
  assert.deepEqual([...OWN].sort(), [...WANT].sort());
});

test('рамка и привязка: украшения и дары — 24×24, значки экрана — 16×16, привязка посередине, вариант один', () => {
  for (const key of WANT) {
    const d = A.spriteDef(key);
    const size = key.startsWith('ui.') ? 16 : 24;
    assert.deepEqual([d.w, d.h, d.ox, d.oy, d.variants], [size, size, size / 2, size / 2, 1], key);
  }
});

test('каждый значок рисуется в любой чёткости: не падает, не пуст, цвета настоящие, после себя не оставляет save', () => {
  const bad = [];
  for (const set of SETS) {
    for (const key of WANT) {
      const name = `${key} (чёткость ${set.k})`;
      let got = null;
      try {
        got = inkBox(set, key);
      } catch (e) {
        bad.push(`${name}: ${e.message}`);
        continue;
      }
      const { log } = got;
      if (!log.paints) bad.push(`${name}: ничего не нарисовано`);
      if (log.balance) bad.push(`${name}: save без restore`);
      for (const c of log.colors) if (!validColor(c)) bad.push(`${name}: не цвет «${c}»`);
      for (const al of log.alphas) if (!(al >= 0 && al <= 1)) bad.push(`${name}: прозрачность ${al}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('значок целиком в своей рамке (и обводка, и сияние) и не теряется в ней', () => {
  const bad = [];
  const set = SETS[0];
  for (const key of WANT) {
    const d = A.spriteDef(key);
    const { box } = inkBox(set, key);
    const [x0, y0, x1, y1] = box;
    // art.icon рисует без полей: всё, что за рамкой, в окне игры срезано
    if (!(x0 >= 0 && y0 >= 0 && x1 <= d.w && y1 <= d.h)) {
      bad.push(`${key}: вылез из рамки — слева, сверху, справа, снизу на ${[-x0, -y0, x1 - d.w, y1 - d.h].map((n) => Math.max(0, n).toFixed(2)).join(', ')} ед.`);
    }
    // значок занимает свою клетку: не меньше двух третей по большей стороне
    const fill = Math.max(x1 - x0, y1 - y0) / d.w;
    if (!(fill >= 0.66)) bad.push(`${key}: мелковат — ${(fill * 100).toFixed(0)} % рамки`);
    // и стоит посередине: середина рисунка не дальше 1,5 единицы (у значков экрана — единицы) от середины рамки
    const off = Math.max(Math.abs((x0 + x1) / 2 - d.w / 2), Math.abs((y0 + y1) / 2 - d.h / 2));
    if (!(off <= (d.w === 16 ? 1 : 1.5))) bad.push(`${key}: сдвинут от середины на ${off.toFixed(2)} ед.`);
  }
  assert.deepEqual(bad, []);
});

test('значок для окон игры (art.icon) рисуется в свой квадрат целиком', () => {
  const { art } = SETS[0];
  for (const key of WANT) {
    for (const [size, density] of [[32, 2], [18, 3], [14, 1]]) {
      const c = art.icon(key, size, density);
      const px = size * density;
      assert.equal(c.width, px, key);
      assert.ok(c.log.paints > 0, key);
      const [x0, y0, x1, y1] = c.log.box;
      assert.ok(x0 >= -0.01 && y0 >= -0.01 && x1 <= px + 0.01 && y1 <= px + 0.01, `${key}: значок ${size} px срезан краем (${[x0, y0, x1, y1].map((v) => v.toFixed(1))})`);
    }
  }
});

test('пустые сердце, щит, жизнь и заряд — того же силуэта, что полные, но другой краски', () => {
  const set = SETS[0];
  for (const name of ['heart', 'shield', 'life', 'dash']) {
    const full = inkBox(set, `ui.${name}`);
    const empty = inkBox(set, `ui.${name}.empty`);
    for (let i = 0; i < 4; i++) assert.ok(Math.abs(full.box[i] - empty.box[i]) < 0.05, `ui.${name}: рамки полного и пустого расходятся`);
    assert.notDeepEqual([...full.log.colors].sort(), [...empty.log.colors].sort(), `ui.${name}.empty той же краски`);
  }
});

test('дары — на одном листе-медальоне, у каждого свой цвет окошка; у вещей и значков экрана листа нет', () => {
  const set = SETS[0];
  const leaf = /const LEAF_LOOK = tone\('(#[0-9a-f]{6})'/.exec(SRC)[1];
  const accents = [...SRC.matchAll(/^gift\('([a-z]+)', '(#[0-9a-f]{6})'/gm)];
  assert.deepEqual(accents.map((m) => m[1]), GIFTS, 'дары записаны в том же порядке, что в списке');
  assert.equal(new Set(accents.map((m) => m[2])).size, GIFTS.length, 'цвет окошка у каждого дара свой');
  const boxes = [];
  for (const id of GIFTS) {
    const { log, box } = inkBox(set, `gift.${id}`);
    assert.ok(log.colors.has(leaf), `gift.${id}: нет листа`);
    boxes.push(box);
  }
  // лист один и тот же: рамка рисунка у всех даров совпадает
  for (const box of boxes) for (let i = 0; i < 4; i++) assert.ok(Math.abs(box[i] - boxes[0][i]) < 0.05, 'листы даров разного размера');
  for (const key of WANT.filter((k) => !k.startsWith('gift.'))) assert.ok(!inkBox(set, key).log.colors.has(leaf), `${key}: краска листа-медальона`);
});

test('значки не одинаковы: у каждого свой набор красок и вызовов', () => {
  const set = SETS[0];
  const seen = new Map();
  for (const key of WANT) {
    if (key.endsWith('.empty')) continue;
    const { log, box } = inkBox(set, key);
    const print = `${[...log.colors].sort().join(' ')} | ${log.calls} | ${box.map((v) => v.toFixed(1)).join(' ')}`;
    assert.ok(!seen.has(print), `${key} нарисован так же, как ${seen.get(print)}`);
    seen.set(print, key);
  }
});

test('каждому украшению и дару из данных игры (items.js) есть значок', async (t) => {
  let data = null;
  try {
    data = await import('../items.js');
  } catch (e) {
    t.skip(`items.js сейчас не загружается: ${String(e.message).split('\n')[0]}`);
    return;
  }
  for (const id of Object.keys(data.ACCESSORIES ?? {})) assert.ok(A.hasSprite(`item.${id}`), `украшение «${id}» без значка`);
  for (const id of Object.keys(data.GIFTS ?? {})) assert.ok(A.hasSprite(`gift.${id}`), `дар «${id}» без значка`);
});
