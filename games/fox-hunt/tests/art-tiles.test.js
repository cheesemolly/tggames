// Мир «Лисьей охоты» без браузера: фон комнаты (paintRoom) и её предметы (propsOf) на поддельном холсте.
// Проверяется то, что на глаз не поймать: комната с любыми дверями рисуется и не выходит за свои поля, одно зерно
// даёт одну картинку, сломанный куст не шевелит остальное, у каждой двери рамка на своей стороне, каждый код
// клетки чем-то нарисован, ключи предметов есть в реестре. Как это выглядит — смотреть глазами:
// tools/fox-hunt-rooms.html (образцы комнат для проверок берутся оттуда же).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { T, TILE, CHAR, SIZES, BIOMES } from '../tiles.js';
import * as A from '../art.js';
import { paintRoom, propsOf, ROOM_MARGIN, BIOME_LOOK } from '../art-tiles.js';

const SRC = readFileSync(new URL('../art-tiles.js', import.meta.url), 'utf8');
const PAGE = readFileSync(new URL('../../../tools/fox-hunt-rooms.html', import.meta.url), 'utf8');
const SAMPLES = JSON.parse(/<script type="application\/json" id="samples">([\s\S]*?)<\/script>/.exec(PAGE)[1]);
const M = ROOM_MARGIN;

// ---------- поддельный холст ----------

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
/** Цвет годен, если холст его точно поймёт: #hex или rgb()/rgba() с числами в своих пределах. */
function validColor(c) {
  if (typeof c !== 'string') return false;
  if (HEX.test(c)) return true;
  const m = /^rgba?\((-?[\d.]+),(-?[\d.]+),(-?[\d.]+)(?:,(-?[\d.]+))?\)$/.exec(c);
  if (!m) return false;
  const v = m.slice(1).filter((x) => x !== undefined).map(Number);
  return v.every(Number.isFinite) && v.slice(0, 3).every((x) => x >= 0 && x <= 255 && Number.isInteger(x)) && (v.length < 4 || (v[3] >= 0 && v[3] <= 1));
}

/**
 * Поддельный холст: понимает то, чем рисует мир (пути с кривыми, градиенты, обрезку, сдвиги), и запоминает
 * журнал вызовов (для сравнения картинок), рамку закрашенного с учётом обрезки, число вызовов и градиентов.
 * Рамка считается с запасом: у кривой — по её узлам, у дуги — по всему кругу. Чего у холста нет на старых
 * телефонах (roundRect, filter) — того нет и здесь.
 */
function fakeCanvas(width = 0, height = 0, keep = true) {
  const log = { calls: [], box: [Infinity, Infinity, -Infinity, -Infinity], n: 0, grads: 0, depth: 0 };
  let m = [1, 0, 0, 1, 0, 0];
  let path = [];
  let clip = null;
  const stack = [];
  const state = { fillStyle: '#000000', strokeStyle: '#000000', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter', globalAlpha: 1, globalCompositeOperation: 'source-over' };
  const num = (v) => {
    assert.ok(typeof v === 'number' && Number.isFinite(v), `в рисунок попало не число: ${v}`);
    return Math.round(v * 100) / 100;
  };
  const note = (name, args) => {
    log.n += 1;
    if (keep) log.calls.push(`${name}(${args.map((v) => (typeof v === 'number' ? num(v) : String(v))).join(',')})`);
    else for (const v of args) if (typeof v === 'number') num(v);
  };
  const mul = (k) => {
    m = [m[0] * k[0] + m[2] * k[1], m[1] * k[0] + m[3] * k[1], m[0] * k[2] + m[2] * k[3], m[1] * k[2] + m[3] * k[3],
      m[0] * k[4] + m[2] * k[5] + m[4], m[1] * k[4] + m[3] * k[5] + m[5]];
  };
  const dev = (x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  const add = (x, y) => path.push(dev(x, y));
  const round = (x, y, rx, ry) => {
    add(x - rx, y - ry);
    add(x + rx, y - ry);
    add(x + rx, y + ry);
    add(x - rx, y + ry);
  };
  const boxOf = (pts, grow = 0) => {
    let b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, y] of pts) b = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)];
    return [b[0] - grow, b[1] - grow, b[2] + grow, b[3] + grow];
  };
  const cut = (a, b) => (b ? [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])] : a);
  const painted = (b) => {
    const v = cut(b, clip);
    if (v[0] >= v[2] || v[1] >= v[3]) return;
    log.box = [Math.min(log.box[0], v[0]), Math.min(log.box[1], v[1]), Math.max(log.box[2], v[2]), Math.max(log.box[3], v[3])];
  };
  const scale = () => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
  const gradient = (kind, v) => {
    v.forEach(num);
    log.grads += 1;
    const id = `${kind}#${log.grads}`;
    note(kind, v);
    return {
      gradient: id,
      addColorStop(at, color) {
        assert.ok(Number.isFinite(at) && at >= 0 && at <= 1, `остановка градиента ${at}`);
        assert.ok(validColor(color), `градиент: не цвет «${color}»`);
        note('stop', [at, color]);
      },
    };
  };
  const ctx = {
    save() {
      stack.push({ m, clip, state: { ...state } });
      log.depth += 1;
      note('save', []);
    },
    restore() {
      assert.ok(stack.length, 'restore без save');
      const top = stack.pop();
      m = top.m;
      clip = top.clip;
      Object.assign(state, top.state);
      log.depth -= 1;
      note('restore', []);
    },
    translate(x, y) {
      note('translate', [x, y]);
      mul([1, 0, 0, 1, x, y]);
    },
    rotate(a) {
      note('rotate', [a]);
      mul([Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]);
    },
    scale(x, y) {
      note('scale', [x, y]);
      mul([x, 0, 0, y, 0, 0]);
    },
    setTransform(a, b, c, d, e, f) {
      note('setTransform', [a, b, c, d, e, f]);
      m = [a, b, c, d, e, f];
    },
    beginPath() {
      path = [];
      note('beginPath', []);
    },
    closePath() {
      note('closePath', []);
    },
    moveTo(x, y) {
      note('moveTo', [x, y]);
      add(x, y);
    },
    lineTo(x, y) {
      note('lineTo', [x, y]);
      add(x, y);
    },
    quadraticCurveTo(cx, cy, x, y) {
      note('quadraticCurveTo', [cx, cy, x, y]);
      add(cx, cy);
      add(x, y);
    },
    bezierCurveTo(ax, ay, bx, by, x, y) {
      note('bezierCurveTo', [ax, ay, bx, by, x, y]);
      add(ax, ay);
      add(bx, by);
      add(x, y);
    },
    arc(x, y, r, a0, a1, ccw = false) {
      note('arc', [x, y, r, a0, a1, ccw]);
      assert.ok(r >= 0, 'отрицательный радиус');
      round(x, y, r, r);
    },
    ellipse(x, y, rx, ry, rot, a0, a1, ccw = false) {
      note('ellipse', [x, y, rx, ry, rot, a0, a1, ccw]);
      assert.ok(rx >= 0 && ry >= 0, 'отрицательный радиус');
      const r = Math.max(rx, ry);
      round(x, y, rot ? r : rx, rot ? r : ry);
    },
    rect(x, y, w, h) {
      note('rect', [x, y, w, h]);
      add(x, y);
      add(x + w, y + h);
      add(x + w, y);
      add(x, y + h);
    },
    fill(rule) {
      assert.ok(rule === undefined || rule === 'evenodd' || rule === 'nonzero', `правило заливки ${rule}`);
      note('fill', [rule ?? '']);
      if (path.length) painted(boxOf(path));
    },
    stroke() {
      note('stroke', []);
      if (path.length) painted(boxOf(path, (state.lineWidth * scale()) / 2));
    },
    clip(rule) {
      assert.ok(rule === undefined || rule === 'evenodd' || rule === 'nonzero', `правило обрезки ${rule}`);
      note('clip', [rule ?? '']);
      clip = cut(path.length ? boxOf(path) : [0, 0, 0, 0], clip);
    },
    fillRect(x, y, w, h) {
      note('fillRect', [x, y, w, h]);
      painted(boxOf([dev(x, y), dev(x + w, y), dev(x + w, y + h), dev(x, y + h)]));
    },
    strokeRect(x, y, w, h) {
      note('strokeRect', [x, y, w, h]);
      painted(boxOf([dev(x, y), dev(x + w, y), dev(x + w, y + h), dev(x, y + h)], (state.lineWidth * scale()) / 2));
    },
    drawImage(img, x, y) {
      note('drawImage', [x, y]);
    },
    createLinearGradient: (...v) => gradient('linear', v),
    createRadialGradient(...v) {
      assert.ok(v[2] >= 0 && v[5] >= 0, 'отрицательный радиус градиента');
      return gradient('radial', v);
    },
  };
  const proxy = new Proxy(ctx, {
    get(target, key) {
      if (key in target) return target[key];
      if (key in state) return state[key];
      if (typeof key === 'symbol' || key === 'then') return undefined;
      throw new Error(`холст: «${String(key)}» есть не на всех телефонах (или его нет вовсе)`);
    },
    set(target, key, value) {
      if (!(key in state)) throw new Error(`холст: свойство «${String(key)}» рисунку не положено`);
      if (key === 'fillStyle' || key === 'strokeStyle') {
        assert.ok(value?.gradient || validColor(value), `${key}: не цвет «${value}»`);
        note(key, [value?.gradient ?? value]);
      } else if (key === 'lineWidth') {
        assert.ok(Number.isFinite(value) && value > 0, `lineWidth ${value}`);
        note(key, [value]);
      } else if (key === 'globalAlpha') assert.ok(value >= 0 && value <= 1, `globalAlpha ${value}`);
      state[key] = value;
      return true;
    },
  });
  return { width, height, log, style: {}, getContext: () => proxy };
}

// ---------- комнаты ----------

/** Комната из букв — как её соберёт игра: двери посередине сторон (doors — строка сторон), зерно, место. */
function roomOf(rows, { doors = '', open = true, seed = 7, biome = 'forest' } = {}) {
  const h = rows.length;
  const w = rows[0].length;
  const tiles = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) tiles[y * w + x] = CHAR[rows[y][x]];
  const list = { n: null, e: null, s: null, w: null };
  const mx = w >> 1;
  const my = h >> 1;
  for (const side of doors) {
    for (let i = -1; i <= 1; i++) {
      if (side === 'n') tiles[mx + i] = TILE.DOOR;
      else if (side === 's') tiles[(h - 1) * w + mx + i] = TILE.DOOR;
      else if (side === 'w') tiles[(my + i) * w] = TILE.DOOR;
      else tiles[(my + i) * w + w - 1] = TILE.DOOR;
    }
    list[side] = { side, open, to: 1 };
  }
  return { w, h, tiles, biome, seed, doors: list };
}

/** Нарисовать фон и вернуть записи холста. */
function painted(room, keep = true) {
  const c = fakeCanvas(0, 0, keep);
  paintRoom(c.getContext('2d'), room);
  return c.log;
}

const ALL = Object.entries(SAMPLES).flatMap(([size, list]) => list.map((rows, i) => ({ size, i, rows })));
const DOORS = ['', 'n', 'e', 's', 'w', 'ns', 'ew', 'nesw'];
const KEYS = { n: 'door', e: 'door.e', s: 'door.s', w: 'door.w' };

// ---------- проверки ----------

test('рисунки мира загружаются без браузера и не тянутся ни к DOM, ни к случайности', () => {
  const code = SRC.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  for (const word of ['document', 'window', 'Math.random', 'performance', 'Date', 'navigator', 'requestAnimationFrame', 'getImageData']) {
    assert.ok(!new RegExp(`(^|[^\\w.$])${word.replace('.', '\\.')}\\b`).test(code), `${word} — рисунок должен быть один и тот же, без DOM`);
  }
  const imports = [...code.matchAll(/from\s+'([^']+)'/g)].map((x) => x[1]).sort();
  assert.deepEqual(imports, ['./art.js', './tiles.js'], 'мир рисуется сам: только клетки и реестр картинок');
});

test('образцы комнат на странице: размер, стена по краю, знакомые буквы, перед дверями свободно; в каждом размере есть всё', () => {
  assert.deepEqual(Object.keys(SAMPLES).sort(), ['L', 'M', 'S']);
  for (const [size, list] of Object.entries(SAMPLES)) {
    const [w, h] = SIZES[size];
    assert.equal(list.length, 3, `${size}: образцов`);
    const seen = new Set();
    list.forEach((rows, i) => {
      const name = `${size}${i}`;
      assert.equal(rows.length, h, `${name}: строк`);
      rows.forEach((row, y) => {
        assert.equal(row.length, w, `${name}: длина строки ${y}`);
        for (const ch of row) {
          assert.ok(Object.prototype.hasOwnProperty.call(CHAR, ch), `${name}: буква «${ch}»`);
          seen.add(CHAR[ch]);
        }
        assert.ok(row[0] === '#' && row[w - 1] === '#', `${name}: стена по бокам, строка ${y}`);
      });
      assert.ok(/^#+$/.test(rows[0]) && /^#+$/.test(rows[h - 1]), `${name}: стена сверху и снизу`);
      const free = (x, y) => '.,=SC12345'.includes(rows[y][x]);
      for (let d = -1; d <= 1; d++) {
        assert.ok(free((w >> 1) + d, 1) && free((w >> 1) + d, h - 2), `${name}: перед верхней и нижней дверью занято`);
        assert.ok(free(1, (h >> 1) + d) && free(w - 2, (h >> 1) + d), `${name}: перед боковой дверью занято`);
      }
      assert.ok(rows.some((row) => row.includes('R')), `${name}: нет лисьей норы`);
    });
    for (const code of [TILE.FLOOR, TILE.PATH, TILE.WALL, TILE.TALL, TILE.LOW, TILE.BUSH, TILE.WATER, TILE.THORN, TILE.SPECIAL, TILE.BURROW, TILE.DEN]) {
      assert.ok(seen.has(code), `${size}: ни в одном образце нет клетки с кодом ${code}`);
    }
  }
});

test('фон и предметы рисуются для каждого образца, зерна и набора дверей: цвета настоящие, за поля ничего не выходит', () => {
  let runs = 0;
  for (const { size, i, rows } of ALL) {
    for (const doors of DOORS) {
      for (const seed of [1, 0xfeedbeef]) {
        const room = roomOf(rows, { doors, seed, open: (seed + doors.length) % 2 === 0 });
        const name = `${size}${i} двери «${doors}» зерно ${seed}`;
        const log = painted(room, false);
        assert.equal(log.depth, 0, `${name}: save без restore`);
        assert.ok(log.n > 2000, `${name}: фон подозрительно пуст (${log.n} вызовов)`);
        const [x0, y0, x1, y1] = log.box;
        // запас в единицу — на обводки
        assert.ok(x0 >= -M - 1 && y0 >= -M - 1 && x1 <= room.w * T + M + 1 && y1 <= room.h * T + M + 1,
          `${name}: рисунок вышел за поля: ${[x0, y0, x1, y1].map((v) => v.toFixed(1)).join(' ')}`);
        // и доходит до самого их края: дальше рендер кладёт глубокий лес встык
        assert.ok(x0 <= -M + 1 && y0 <= -M + 1 && x1 >= room.w * T + M - 1 && y1 >= room.h * T + M - 1, `${name}: поля закрашены не до края`);
        assert.ok(propsOf(room).length > 20, name);
        runs += 1;
      }
    }
  }
  assert.equal(runs, 9 * 8 * 2);
});

test('то же зерно — та же картинка и те же предметы, другое зерно — другие', () => {
  for (const { size, i, rows } of ALL) {
    const a = roomOf(rows, { doors: 'nesw', seed: 12345 });
    const b = roomOf(rows, { doors: 'nesw', seed: 12345 });
    const c = roomOf(rows, { doors: 'nesw', seed: 12346 });
    const la = painted(a).calls;
    assert.deepEqual(la, painted(b).calls, `${size}${i}: одно зерно — разные картинки`);
    assert.notDeepEqual(la, painted(c).calls, `${size}${i}: разные зёрна — одна картинка`);
    assert.deepEqual(propsOf(a), propsOf(b));
    assert.notDeepEqual(propsOf(a), propsOf(c));
    // повторный вызов ничего не копит: рисунок не зависит от того, что рисовали до него
    assert.deepEqual(painted(a).calls, la);
  }
  // зерно — любое число: ноль, отрицательное, дробное, огромное; без зерна — как с единицей
  const rows = SAMPLES.S[0];
  for (const seed of [0, -5, 3.7, 2 ** 40, undefined]) {
    const room = roomOf(rows, { doors: 'ns', seed });
    assert.equal(painted(room).depth, 0);
    assert.ok(propsOf(room).every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)), `зерно ${seed}`);
  }
});

test('каждый код клетки чем-то нарисован, а её сосед от неё не зависит: сломанный куст убирает только себя', () => {
  const rows = ['###########', '#.........#', '#.........#', '#....?....#', '#.........#', '#.........#', '###########'];
  const base = roomOf(rows.map((r) => r.replace('?', '.')), { seed: 99 });
  const plain = painted(base).calls;
  const plainProps = propsOf(base);
  const at = 3 * 11 + 5;
  assert.equal(Object.keys(TILE).length, 12, 'появился новый код клетки — научить его рисовать и дописать сюда');
  for (const [name, code] of Object.entries(TILE)) {
    if (code === TILE.FLOOR) continue;
    const room = roomOf(rows.map((r) => r.replace('?', '.')), { seed: 99 });
    room.tiles[at] = code;
    const log = painted(room);
    assert.equal(log.depth, 0, name);
    assert.notDeepEqual(log.calls, plain, `${name}: клетка нарисована как простая земля`);
    const props = propsOf(room);
    const extra = props.filter((p) => !plainProps.some((q) => q.key === p.key && q.x === p.x && q.y === p.y));
    if ([TILE.TALL, TILE.LOW, TILE.BUSH, TILE.WALL].includes(code)) {
      assert.ok(extra.length >= 1, `${name}: у клетки нет предмета`);
      for (const p of extra) assert.ok(Math.abs(p.x - 5.5 * T) <= T && Math.abs(p.y - 3.5 * T) <= 1.6 * T, `${name}: предмет далеко от своей клетки`);
    } else assert.deepEqual(props, plainProps, `${name}: плоской клетке предмет не положен`);
  }
  // незнакомый код (клетка из будущего) комнату не роняет
  const odd = roomOf(rows.map((r) => r.replace('?', '.')), { seed: 99 });
  odd.tiles[at] = 200;
  assert.equal(painted(odd).depth, 0);
  propsOf(odd);

  // куст сломали: клетка стала землёй — список предметов тот же, но без него
  const room = roomOf(SAMPLES.M[0], { doors: 'nesw', seed: 31 });
  const before = propsOf(room);
  const bush = room.tiles.indexOf(TILE.BUSH);
  room.tiles[bush] = TILE.FLOOR;
  const after = propsOf(room);
  assert.equal(after.length, before.length - 1);
  const gone = before.filter((p) => !after.some((q) => q.key === p.key && q.x === p.x && q.y === p.y && q.v === p.v));
  assert.equal(gone.length, 1);
  assert.equal(gone[0].key, 'prop.forest.bush');
  assert.ok(Math.abs(gone[0].x - ((bush % room.w) + 0.5) * T) < 6, 'убрался не тот куст');
});

test('фон не зависит от того, что меняется посреди боя: открыты ли двери и цел ли куст', () => {
  // двери: фон один и тот же — открылись, закрылись, готовить его заново не надо
  for (const { size, i, rows } of ALL.filter((s) => s.i === 0)) {
    const open = painted(roomOf(rows, { doors: 'nesw', open: true, seed: 6 })).calls;
    assert.deepEqual(painted(roomOf(rows, { doors: 'nesw', open: false, seed: 6 })).calls, open, `${size}${i}: фон зависит от дверей`);
  }
  // куст: в фоне от него нет ничего (тень — в его картинке). Проверка: вместо куста — незнакомая клетка, по которой
  // тоже не ходят, и фон тот же. Значит, сломанный куст можно просто перестать рисовать.
  const room = roomOf(SAMPLES.M[0], { doors: 'nesw', seed: 31 });
  const withBush = painted(room).calls;
  for (let k = 0; k < room.tiles.length; k++) if (room.tiles[k] === TILE.BUSH) room.tiles[k] = 200;
  assert.deepEqual(painted(room).calls, withBush, 'куст оставляет след в фоне — после поломки пришлось бы готовить фон заново');
  // а у остальных преград тень в земле есть: они никуда не денутся
  for (const code of [TILE.TALL, TILE.LOW]) {
    const solid = roomOf(SAMPLES.M[0], { doors: 'nesw', seed: 31 });
    const before = painted(solid).calls;
    solid.tiles[solid.tiles.indexOf(code)] = 200;
    assert.notDeepEqual(painted(solid).calls, before);
  }
});

test('предметы: ключ записан в реестр, вариант существует, картинка целиком на полях комнаты; нависающая листва — в конце списка', () => {
  let total = 0;
  for (const { size, i, rows } of ALL) {
    for (const doors of ['', 'nesw']) {
      for (const open of [true, false]) {
        const room = roomOf(rows, { doors, open, seed: 5 + i });
        const props = propsOf(room);
        const name = `${size}${i} «${doors}»`;
        let over = false;
        let lastY = -Infinity;
        for (const p of props) {
          assert.deepEqual(Object.keys(p).sort(), ['key', 'over', 'v', 'x', 'y'], name);
          const def = A.spriteDef(p.key);
          assert.ok(def, `${name}: нет картинки «${p.key}»`);
          assert.ok(Number.isInteger(p.v) && p.v >= 0 && p.v < def.variants, `${name}: ${p.key} вариант ${p.v}`);
          assert.equal(typeof p.over, 'boolean');
          assert.ok(/^prop\.forest\./.test(p.key), p.key);
          // рамка картинки — в пределах полей фона: за ними рендер ничего не готовит
          const x0 = p.x - def.ox;
          const y0 = p.y - def.oy;
          assert.ok(x0 >= -M - 2 && y0 >= -M - 2 && x0 + def.w <= room.w * T + M + 2 && y0 + def.h <= room.h * T + M + 2,
            `${name}: ${p.key} в (${p.x.toFixed(0)}, ${p.y.toFixed(0)}) торчит за поля`);
          if (p.over) {
            assert.ok(/\.(wside|door\.[esw])$/.test(p.key), `${p.key}: поверх существ рисуется только листва`);
            assert.ok(p.y >= lastY, `${name}: нависающая листва не по порядку сверху вниз`);
            lastY = p.y;
            over = true;
          } else assert.ok(!over, `${name}: ${p.key} стоит в списке после нависающей листвы`);
        }
        // комнату не заваливает: рендер рисует всё это каждый кадр
        assert.ok(props.length <= { S: 90, M: 125, L: 165 }[size], `${name}: предметов ${props.length}`);
        total += props.length;
      }
    }
  }
  assert.ok(total > 2000);
});

test('у каждой двери — рамка на своей стороне: вариант 0 открыта, 1 закрыта; нет двери — нет рамки', () => {
  for (const { size, i, rows } of ALL) {
    for (const doors of DOORS) {
      for (const open of [true, false]) {
        const room = roomOf(rows, { doors, open, seed: 3 });
        const W = room.w * T;
        const H = room.h * T;
        const frames = propsOf(room).filter((p) => /\.door(\.[esw])?$/.test(p.key));
        const name = `${size}${i} «${doors}»`;
        assert.equal(frames.length, doors.length, `${name}: рамок`);
        for (const side of doors) {
          const f = frames.filter((p) => p.key === `prop.forest.${KEYS[side]}`);
          assert.equal(f.length, 1, `${name}: рамка стороны ${side}`);
          assert.equal(f[0].v, open ? 0 : 1, `${name}: вариант рамки ${side}`);
          const def = A.spriteDef(f[0].key);
          const cx = f[0].x - def.ox + def.w / 2;          // середина картинки
          const cy = f[0].y - def.oy + def.h / 2;
          if (side === 'n') assert.ok(Math.abs(cx - W / 2) < 1 && f[0].y > 0 && f[0].y <= T && !f[0].over, `${name}: верхняя`);
          if (side === 's') assert.ok(Math.abs(cx - W / 2) < 1 && cy > H - T && f[0].over, `${name}: нижняя`);
          if (side === 'w') assert.ok(Math.abs(cy - H / 2) < 1 && cx < T && f[0].over, `${name}: левая`);
          if (side === 'e') assert.ok(Math.abs(cy - H / 2) < 1 && cx > W - T && f[0].over, `${name}: правая`);
        }
        // у проёма нет ни стволов, ни крон стены: клетки двери — не стена
        for (const p of propsOf(room)) {
          if (!/\.(wtrunk|wside)$/.test(p.key)) continue;
          const tx = Math.floor(p.x / T);
          const ty = Math.floor((p.y - (p.over ? 30 : 4)) / T);
          assert.notEqual(room.tiles[ty * room.w + tx], TILE.DOOR, `${name}: ${p.key} стоит в проёме`);
        }
      }
    }
  }
  // открылась дверь — сменилась только её рамка
  const shut = roomOf(SAMPLES.S[0], { doors: 'nesw', open: false, seed: 8 });
  const mixed = roomOf(SAMPLES.S[0], { doors: 'nesw', open: false, seed: 8 });
  mixed.doors.e.open = true;
  const a = propsOf(shut);
  const b = propsOf(mixed);
  assert.equal(a.length, b.length);
  const diff = a.filter((p, k) => JSON.stringify(p) !== JSON.stringify(b[k]));
  assert.deepEqual(diff.map((p) => p.key), ['prop.forest.door.e']);
  // клетки двери есть, а записи о ней нет (или вовсе нет room.doors) — рамка всё равно стоит, закрытая
  const lost = roomOf(SAMPLES.S[0], { doors: 'n', seed: 8 });
  lost.doors = undefined;
  assert.deepEqual(propsOf(lost).filter((p) => p.key === 'prop.forest.door').map((p) => p.v), [1]);
  assert.equal(painted(lost).depth, 0);
  // запись есть, а клеток нет — проём посередине стороны
  const bare = roomOf(SAMPLES.S[0], { seed: 8 });
  bare.doors = { n: null, e: null, s: { open: true }, w: null };
  const south = propsOf(bare).filter((p) => p.key === 'prop.forest.door.s');
  assert.equal(south.length, 1);
  assert.equal(south[0].x, (bare.w * T) / 2);
  assert.equal(painted(bare).depth, 0);
});

test('имена, на которые рассчитывают рендер и логика: картинки мира, двери, глубокий лес, вещи', () => {
  assert.equal(ROOM_MARGIN, 48);
  const want = {
    'prop.forest.door': 2, 'prop.forest.door.e': 2, 'prop.forest.door.s': 2, 'prop.forest.door.w': 2, 'tile.forest.deep': 1,
    'thing.chest': 2, 'thing.pedestal': 1, 'thing.portal': 1, 'thing.stump': 2, 'thing.target': 1, 'thing.sign': 1,
    // вещи заданий: гриб ведьмина круга (три разных) и бабочка (крылья раскрыты и подняты)
    'thing.toadstool': 3, 'thing.butterfly': 2,
  };
  for (const [key, variants] of Object.entries(want)) {
    assert.ok(A.hasSprite(key), `нет картинки «${key}»`);
    assert.equal(A.spriteDef(key).variants, variants, `${key}: вариантов`);
  }
  for (const name of ['oak', 'birch', 'fir', 'sapling', 'crag', 'rock', 'stump', 'log', 'biglog', 'bush', 'wtrunk', 'wtop', 'wcap', 'wside']) {
    assert.ok(A.hasSprite(`prop.forest.${name}`), name);
  }
  // глубокий лес: клетка 64×64 без запаса по краям, привязка — левый верхний угол; рисунок уходит за каждый край
  const deep = A.spriteDef('tile.forest.deep');
  assert.deepEqual([deep.w, deep.h, deep.ox, deep.oy, deep.pad], [64, 64, 0, 0, 0]);
  const c = fakeCanvas();
  deep.paint(c.getContext('2d'), 0);
  assert.ok(c.log.box[0] < 0 && c.log.box[1] < 0 && c.log.box[2] > 64 && c.log.box[3] > 64, 'клетка глубокого леса не доходит до края — будет шов');
  // вещи стоят на земле: привязка — внизу посередине
  for (const key of Object.keys(want).filter((k) => k.startsWith('thing.'))) {
    const d = A.spriteDef(key);
    assert.ok(Math.abs(d.ox - d.w / 2) < 1e-9 && d.oy > d.h * 0.7 && d.oy <= d.h, `${key}: привязка`);
  }
});

test('картинки мира рисуются во всех вариантах, не вылезая из своей рамки', () => {
  const art = A.createArt(2, fakeCanvas);
  let n = 0;
  for (const key of A.spriteKeys().filter((k) => /^(prop\.forest|thing\.(chest|pedestal|portal|stump|target|sign|toadstool|butterfly)$)/.test(k))) {
    const def = A.spriteDef(key);
    for (let v = 0; v < def.variants; v++) {
      const s = art.sprite(key, v);
      const { log } = s.c;
      assert.equal(log.depth, 0, `${key} ·${v}: save без restore`);
      const [x0, y0, x1, y1] = log.box;
      assert.ok(x0 >= -2 && y0 >= -2 && x1 <= s.c.width + 2 && y1 <= s.c.height + 2,
        `${key} ·${v}: вылезла из рамки: ${[x0 / 2 - def.pad, y0 / 2 - def.pad, x1 / 2 - def.pad, y1 / 2 - def.pad].map((t) => t.toFixed(1)).join(' ')} при ${def.w}×${def.h}`);
      assert.ok(Math.max((x1 - x0) / s.c.width, (y1 - y0) / s.c.height) > 0.6, `${key} ·${v}: гораздо меньше своей рамки`);
      n += 1;
    }
  }
  assert.ok(n >= 50, `картинок ${n}`);
});

test('таблица мест: у каждого есть всё нужное, деревья и камни — из своих картинок; незнакомое место рисуется как лес', () => {
  assert.ok(BIOME_LOOK.forest);
  for (const [id, look] of Object.entries(BIOME_LOOK)) {
    assert.ok(BIOMES.includes(id), `место «${id}» не из списка игры`);
    assert.equal(look.id, id);
    for (const fn of ['ground', 'decals', 'special', 'water', 'thorns']) assert.equal(typeof look[fn], 'function', `${id}.${fn}`);
    for (const table of [look.tall, look.low]) {
      assert.ok(table.length >= 2);
      for (const [name, weight] of table) {
        assert.ok(look.sprites[name], `${id}: нет картинки «${name}»`);
        assert.ok(look.sprites[name].foot?.length === 2, `${id}.${name}: нет следа на земле`);
        assert.ok(weight > 0);
      }
    }
    assert.ok(look.sprites[look.bush]?.foot, `${id}: куст`);
    for (const name of ['wtrunk', 'wtop', 'wcap', 'wside', 'door', 'door.e', 'door.s', 'door.w']) assert.ok(A.hasSprite(`prop.${id}.${name}`), `${id}: ${name}`);
    assert.ok(A.hasSprite(`tile.${id}.deep`));
    for (const c of Object.values(look.pal).flat()) assert.ok(validColor(c), `${id}: краска «${c}»`);
  }
  const forest = roomOf(SAMPLES.M[1], { doors: 'nesw', seed: 4 });
  const want = painted(forest).calls;
  for (const biome of ['swamp', 'taiga', 'cave', 'autumn', 'луна', '', undefined, null, 7, 'constructor', '__proto__', 'toString']) {
    if (typeof biome === 'string' && BIOME_LOOK[biome] && Object.prototype.hasOwnProperty.call(BIOME_LOOK, biome)) continue;   // место уже нарисовано — у него свой вид
    const room = roomOf(SAMPLES.M[1], { doors: 'nesw', seed: 4, biome });
    assert.deepEqual(painted(room).calls, want, `место «${String(biome)}»`);
    assert.deepEqual(propsOf(room), propsOf(forest));
    for (const p of propsOf(room)) assert.ok(A.hasSprite(p.key));
  }
});

test('фон комнаты готовится за разумное число команд, предметы считаются мгновенно', () => {
  // фон готовится при входе в комнату: тысячи градиентов и десятки тысяч команд — это заметная заминка на телефоне
  const room = roomOf(SAMPLES.L[1], { doors: 'nesw', seed: 2 });
  const log = painted(room);
  assert.ok(log.n < 60000, `команд ${log.n}`);
  assert.ok(log.grads < 1500, `градиентов ${log.grads}`);
  const t0 = process.hrtime.bigint();
  for (let k = 0; k < 50; k++) propsOf(room);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 50;
  assert.ok(ms < 5, `propsOf: ${ms.toFixed(2)} мс`);
});
