// Значки вещей и предметы особых комнат «Лисьей охоты» (art-items.js) без браузера — на поддельном холсте.
// Проверяется то, что на глаз не поймать, пока не сломается у игрока: у каждой вещи из списка игры есть значок,
// значок не вылез из своего квадрата (в окне рюкзака поля обрезаются), в цвет не попало NaN, предмет комнаты
// стоит на земле в своей точке привязки. Как это выглядит — смотреть глазами: tools/fox-hunt-sheet.html
// (?part=sprites&only=item.,thing.).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as A from '../art.js';
import { ICONS, PLACE_THINGS } from '../art-items.js';

const SRC = readFileSync(new URL('../art-items.js', import.meta.url), 'utf8');

// Вещи по описанию игры (01-design, «Content roster») — id окончательные, на них ссылаются логика и окна.
const WEAPONS = ['pinecone', 'sling', 'thorns', 'acorngun', 'claws', 'club', 'bow', 'boomerang', 'icicle', 'fireacorn', 'shroombomb', 'bouncenut', 'wasps',
  'venom', 'lightning', 'firefly', 'leaves', 'frostbreath', 'thornring', 'beartrap', 'spores', 'starstaff', 'stormroar', 'meteor', 'crescent', 'sunray'];
const ARMOR = ['vest', 'bark', 'thornmail', 'fur', 'shadowcloak', 'shell', 'feathers', 'silkmail', 'moonrobe'];
const POTIONS = ['heal', 'manapot', 'haste', 'rage', 'stone', 'mapscroll'];
const ITEMS = [...WEAPONS, ...ARMOR, ...POTIONS];
// предметы комнат: вид → примерный размер рамки (ширина, высота)
const THINGS = { altar: [40, 34], well: [44, 52], forge: [44, 36], spring: [44, 30], totem: [30, 56], gamble: [40, 30], tent: [56, 44] };

// ---------- поддельный холст ----------
// Тот же, что в art.test.js (оттуда его не взять — он не вынесен), плюс отдельная рамка «твёрдого»: всего, что
// закрашено цветом, а не переходом. Сияние (переход к прозрачному) может уходить на поля, твёрдое — нет.

const COLOR = /^(#[0-9a-f]{3,4}|#[0-9a-f]{6}|#[0-9a-f]{8}|transparent)$/i;
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
  const none = () => [Infinity, Infinity, -Infinity, -Infinity];
  const log = { colors: new Set(), paints: 0, box: none(), hard: none(), balance: 0, alphas: [] };
  let m = [1, 0, 0, 1, 0, 0];
  let path = [];
  let cur = [0, 0];
  let clip = null;
  const stack = [];
  const state = { fillStyle: '#000000', strokeStyle: '#000000', lineWidth: 1, globalAlpha: 1, globalCompositeOperation: 'source-over' };
  for (const name of PLAIN) state[name] = null;
  let dash = [];

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
    let b = none();
    for (const [x, y] of pts) b = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)];
    return [b[0] - grow, b[1] - grow, b[2] + grow, b[3] + grow];
  };
  const cut = (a, b) => (b ? [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])] : a);
  const grown = (a, v) => [Math.min(a[0], v[0]), Math.min(a[1], v[1]), Math.max(a[2], v[2]), Math.max(a[3], v[3])];
  const painted = (b, ink) => {
    const soft = ink instanceof Gradient;
    if (!soft) log.colors.add(ink);
    log.alphas.push(state.globalAlpha);
    if (!b || ERASERS.has(state.globalCompositeOperation)) return;
    const v = cut(b, clip);
    if (v[0] >= v[2] || v[1] >= v[3]) return;
    log.paints += 1;
    log.box = grown(log.box, v);
    if (!soft) log.hard = grown(log.hard, v);
  };
  const scale = () => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
  const arcPoints = (x, y, rx, ry, rot, a0, a1, ccw) => {
    finite(x, y, rx, ry, rot, a0, a1);
    assert.ok(rx >= 0 && ry >= 0, 'отрицательный радиус');
    let span = a1 - a0;
    if (ccw) span = span <= -Math.PI * 2 ? -Math.PI * 2 : -((((-span) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) || (span ? Math.PI * 2 : 0));
    else span = span >= Math.PI * 2 ? Math.PI * 2 : (((span % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) || (span ? Math.PI * 2 : 0);
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    for (let i = 0; i <= 24; i++) {
      const a = a0 + (span * i) / 24;
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
    fill(rule) {
      assert.ok(rule === undefined || rule === 'nonzero' || rule === 'evenodd', `правило заливки ${rule}`);
      painted(boxOf(path), state.fillStyle);
    },
    stroke() {
      painted(boxOf(path, (state.lineWidth * scale()) / 2), state.strokeStyle);
    },
    clip(rule) {
      assert.ok(rule === undefined || rule === 'nonzero' || rule === 'evenodd', `правило обрезки ${rule}`);
      clip = cut(boxOf(path) ?? [0, 0, 0, 0], clip);
    },
    fillRect(x, y, w, h) {
      finite(x, y, w, h);
      painted(boxOf([dev(x, y), dev(x + w, y), dev(x + w, y + h), dev(x, y + h)]), state.fillStyle);
    },
    strokeRect(x, y, w, h) {
      finite(x, y, w, h);
      painted(boxOf([dev(x, y), dev(x + w, y), dev(x + w, y + h), dev(x, y + h)], (state.lineWidth * scale()) / 2), state.strokeStyle);
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
    getLineDash: () => dash.slice(),
  };
  const setters = {
    fillStyle: (v) => assert.ok(v instanceof Gradient || validColor(v), `fillStyle: не цвет «${v}»`),
    strokeStyle: (v) => assert.ok(v instanceof Gradient || validColor(v), `strokeStyle: не цвет «${v}»`),
    lineWidth: (v) => assert.ok(Number.isFinite(v) && v >= 0, `lineWidth ${v}`),
    globalAlpha: (v) => assert.ok(Number.isFinite(v) && v >= 0 && v <= 1, `globalAlpha ${v}`),
    globalCompositeOperation: (v) => assert.ok(BLENDS.has(v), `режим наложения «${v}»`),
  };
  const canvas = {
    width,
    height,
    style: {},
    log,
    dashed: () => dash.length > 0,
    getContext: (kind) => {
      assert.equal(kind, '2d');
      return proxy;
    },
  };
  // чего здесь нет (roundRect, filter, тени, текст) — того нет и на старых телефонах или оно запрещено рисункам
  const proxy = new Proxy(ctx, {
    get(target, key) {
      if (key in target) return target[key];
      if (key in state) return state[key];
      if (typeof key === 'symbol' || key === 'then') return undefined;
      throw new Error(`холст: «${String(key)}» — рисовать без него`);
    },
    set(target, key, value) {
      if (key in setters) setters[key](value);
      else if (!(key in state)) throw new Error(`холст: свойство «${String(key)}» — рисовать без него`);
      state[key] = value;
      return true;
    },
  });
  ctx.canvas = canvas;
  return canvas;
}

// ---------- заготовки ----------

const KS = [2.44, 1];                   // чёткость телефона и самая грубая
const SETS = KS.map((k) => ({ k, art: A.createArt(k, fakeCanvas) }));

/** Запечь картинку и вернуть её рамки в единицах мира от левого верхнего угла рамки (без полей). */
function baked(set, key) {
  const def = A.spriteDef(key);
  const s = set.art.sprite(key, 0);
  assert.ok(s, `нет картинки «${key}»`);
  const { log } = s.c;
  const world = (b) => b.map((v) => v / set.k - def.pad);
  return { def, canvas: s.c, log, box: world(log.box), hard: world(log.hard) };
}

const itemKeys = () => A.spriteKeys().filter((key) => key.startsWith('item.') && ITEMS.includes(key.slice(5)));

// ---------- проверки ----------

test('файл загружается без браузера: ни DOM, ни случайности, ни чужих файлов', () => {
  const code = SRC.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  for (const word of ['document', 'window', 'Math.random', 'navigator', 'localStorage', 'requestAnimationFrame', 'Date', 'performance']) {
    assert.ok(!new RegExp(`(^|[^\\w.$])${word.replace('.', '\\.')}\\b`).test(code), `${word} — рисунок должен быть один и тот же, без DOM`);
  }
  const imports = [...code.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(imports, ['./art-kit.js', './art.js'], 'рисунки вещей берут только реестр и набор художника');
  for (const banned of ['roundRect', 'shadowBlur', 'fillText', 'filter']) assert.ok(!code.includes(banned), `в рисунках нельзя ${banned}`);
});

test('есть всё, что заказано: 26 оружий, 9 броней, 6 зелий и 7 предметов комнат — под своими id', () => {
  assert.deepEqual(ICONS.weapons, WEAPONS);
  assert.deepEqual(ICONS.armor, ARMOR);
  assert.deepEqual(ICONS.potions, POTIONS);
  assert.deepEqual(PLACE_THINGS, Object.keys(THINGS));
  assert.equal(new Set(ITEMS).size, 41, 'id вещей не повторяются');
  for (const id of ITEMS) assert.ok(A.hasSprite(`item.${id}`), `нет значка «item.${id}»`);
  for (const kind of Object.keys(THINGS)) assert.ok(A.hasSprite(`thing.${kind}`), `нет предмета «thing.${kind}»`);
  // и ничего лишнего: каждая картинка этого файла — из списка
  const mine = [...SRC.matchAll(/^(?:icon|thing)\('([a-z]+)'/gm)].map((m) => m[1]);
  assert.deepEqual(mine.sort(), [...ITEMS, ...Object.keys(THINGS)].sort());
});

test('значки: квадрат 24×24 с привязкой посередине; рисуются без ошибок, цвета настоящие, save и restore сходятся', () => {
  assert.equal(itemKeys().length, 41);
  for (const set of SETS) {
    for (const key of itemKeys()) {
      const { def, log } = baked(set, key);
      assert.deepEqual([def.w, def.h, def.ox, def.oy, def.variants], [24, 24, 12, 12, 1], `${key}: рамка значка`);
      assert.ok(def.pad <= 1, `${key}: поля`);
      assert.ok(log.paints > 4, `${key}: почти ничего не нарисовано`);
      assert.equal(log.balance, 0, `${key}: save без restore`);
      for (const c of log.colors) assert.ok(validColor(c), `${key}: не цвет «${c}»`);
      for (const al of log.alphas) assert.ok(al >= 0 && al <= 1, `${key}: прозрачность ${al}`);
    }
  }
});

test('значок целиком в своём квадрате: твёрдое — внутри 24×24 (в окне поля обрезаются), сияние — не дальше полей', () => {
  const bad = [];
  for (const set of SETS) {
    for (const key of itemKeys()) {
      const { hard, box } = baked(set, key);
      const out = [-hard[0], -hard[1], hard[2] - 24, hard[3] - 24].map((v) => Math.max(0, v));
      if (Math.max(...out) > 0.3) bad.push(`${key} (чёткость ${set.k}): вылез из квадрата — слева, сверху, справа, снизу на ${out.map((v) => v.toFixed(2)).join(', ')}`);
      if (!(box[0] >= -1 && box[1] >= -1 && box[2] <= 25 && box[3] <= 25)) bad.push(`${key}: сияние дальше полей (${box.map((v) => v.toFixed(1))})`);
      // и не теряется в квадрате: предмет занимает его большую часть
      const size = Math.max(hard[2] - hard[0], hard[3] - hard[1]);
      if (size < 17) bad.push(`${key}: мелковат — ${size.toFixed(1)} из 24`);
      // стоит посередине, а не жмётся к краю
      const cx = (hard[0] + hard[2]) / 2 - 12;
      const cy = (hard[1] + hard[3]) / 2 - 12;
      if (Math.abs(cx) > 2.2 || Math.abs(cy) > 2.2) bad.push(`${key}: не посередине (${cx.toFixed(1)}, ${cy.toFixed(1)})`);
    }
  }
  assert.deepEqual(bad, []);
});

test('значок для окон игры (art.icon) рисуется в свой холст и не обрезается', () => {
  const art = SETS[0].art;
  for (const key of itemKeys()) {
    const c = art.icon(key, 36, 2);
    assert.equal(c.width, 72);
    assert.equal(c.height, 72);
    assert.ok(c.log.paints > 4, key);
    const [x0, y0, x1, y1] = c.log.hard;
    assert.ok(x0 >= -1 && y0 >= -1 && x1 <= 73 && y1 <= 73, `${key}: значок обрезан краем окна (${[x0, y0, x1, y1].map((v) => v.toFixed(1))})`);
  }
});

test('у каждой вещи свой рисунок: двух одинаковых значков нет', () => {
  const seen = new Map();
  for (const key of itemKeys()) {
    const { log, hard } = baked(SETS[1], key);
    const sign = `${log.paints}|${[...log.colors].sort().join(',')}|${hard.map((v) => v.toFixed(1)).join(',')}`;
    assert.ok(!seen.has(sign), `${key} нарисован так же, как ${seen.get(sign)}`);
    seen.set(sign, key);
  }
  assert.equal(seen.size, 41);
});

test('предметы комнат: привязка — низ посередине, размер как заказано, стоят на земле и не вылезают из рамки', () => {
  for (const set of SETS) {
    for (const [kind, [w, h]] of Object.entries(THINGS)) {
      const key = `thing.${kind}`;
      const { def, log, box } = baked(set, key);
      assert.equal(def.variants, 1, key);
      assert.ok(Math.abs(def.w - w) <= 6 && Math.abs(def.h - h) <= 6, `${key}: рамка ${def.w}×${def.h}, заказано около ${w}×${h}`);
      assert.equal(def.ox, def.w / 2, `${key}: привязка не посередине`);
      assert.ok(def.oy >= def.h - 6 && def.oy <= def.h, `${key}: привязка не у низа (${def.oy} из ${def.h})`);
      assert.ok(log.paints > 20, `${key}: почти ничего не нарисовано`);
      assert.equal(log.balance, 0, `${key}: save без restore`);
      for (const c of log.colors) assert.ok(validColor(c), `${key}: не цвет «${c}»`);
      // в рамке с полями (запас — полторы точки холста на сглаживание)
      const slack = def.pad + 1.5 / set.k;
      assert.ok(box[0] >= -slack && box[1] >= -slack && box[2] <= def.w + slack && box[3] <= def.h + slack,
        `${key}: рисунок вылез из рамки ${def.w}×${def.h} (${box.map((v) => v.toFixed(1))})`);
      // основание — у точки привязки и чуть ниже, верх — у верха рамки: предмет занимает свою рамку
      assert.ok(box[3] >= def.oy + 1 && box[3] <= def.h + slack, `${key}: не стоит на земле (низ ${box[3].toFixed(1)}, привязка ${def.oy})`);
      assert.ok(box[1] < def.h * 0.2, `${key}: гораздо ниже своей рамки (верх ${box[1].toFixed(1)})`);
      assert.ok(box[2] - box[0] > def.w * 0.75, `${key}: гораздо уже своей рамки`);
      // по обе стороны от привязки — поровну: предмет не съезжает вбок, когда его ставят в середину клетки
      assert.ok(Math.abs((box[0] + box[2]) / 2 - def.ox) < def.w * 0.12, `${key}: стоит не по середине своей привязки`);
    }
  }
});

test('картинка одна и та же при каждом запекании: случайность только от зерна', () => {
  for (const key of ['thing.altar', 'thing.spring', 'thing.totem', 'item.pinecone', 'item.thornring']) {
    const one = A.createArt(1.7, fakeCanvas).sprite(key, 0).c.log;
    const two = A.createArt(1.7, fakeCanvas).sprite(key, 0).c.log;
    assert.deepEqual(one.box, two.box, key);
    assert.equal(one.paints, two.paints, key);
  }
});

test('вещи из описаний игры: у каждого оружия, брони и зелья, что уже записаны в логике, есть значок', async (t) => {
  let weapons = null;
  let items = null;
  try {
    weapons = await import('../weapons.js');
    items = await import('../items.js');
  } catch (e) {
    t.skip(`описания вещей сейчас не загружаются (${String(e.message).split('\n')[0]}) — проверено по списку из описания игры`);
    return;
  }
  const ids = [...Object.keys(weapons.WEAPONS ?? {}), ...Object.keys(items.ARMOR ?? {}), ...Object.keys(items.POTIONS ?? {})];
  for (const id of ids) assert.ok(A.hasSprite(`item.${id}`), `у вещи «${id}» из описаний игры нет значка item.${id}`);
});
