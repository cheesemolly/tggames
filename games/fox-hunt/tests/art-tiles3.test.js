// Пещеры и осенняя чаща без браузера: фон комнаты и предметы этих мест на поддельном холсте.
// Проверяется то, что на глаз не поймать: у места есть всё, на что рассчитывают рендер и сборка комнаты (ключи
// картинок, двери на четыре стороны, глубина за краем), картинки не вылезают из рамок и не дают NaN, комната с
// любыми дверями рисуется и не выходит за свои поля, одно зерно — одна картинка, куст и двери не оставляют следа
// в фоне, фон готовится за разумное число команд. Как это выглядит — смотреть глазами: tools/fox-hunt-rooms.html.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { T, TILE, CHAR, BIOMES } from '../tiles.js';
import * as A from '../art.js';
import { paintRoom, propsOf, ROOM_MARGIN, BIOME_LOOK } from '../art-tiles.js';
import '../art-tiles3.js';

const SRC = readFileSync(new URL('../art-tiles3.js', import.meta.url), 'utf8');
const PAGE = readFileSync(new URL('../../../tools/fox-hunt-rooms.html', import.meta.url), 'utf8');
const SAMPLES = JSON.parse(/<script type="application\/json" id="samples">([\s\S]*?)<\/script>/.exec(PAGE)[1]);
const M = ROOM_MARGIN;
const PLACES = ['cave', 'autumn'];

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
 * рамку закрашенного с учётом обрезки, число вызовов и градиентов, а при keep — и журнал вызовов (сравнивать
 * картинки). Кривые и дуги считаются по точкам самой линии, а не по рычагам: рамка выходит настоящей.
 * Чего у холста нет на старых телефонах (roundRect, filter) — того нет и здесь.
 */
function fakeCanvas(width = 0, height = 0, keep = false) {
  const log = { calls: [], box: [Infinity, Infinity, -Infinity, -Infinity], n: 0, grads: 0, depth: 0, paints: 0 };
  let m = [1, 0, 0, 1, 0, 0];
  let path = [];
  let cur = [0, 0];
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
  const add = (x, y) => {
    path.push(dev(x, y));
    cur = [x, y];
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
    log.paints += 1;
    log.box = [Math.min(log.box[0], v[0]), Math.min(log.box[1], v[1]), Math.max(log.box[2], v[2]), Math.max(log.box[3], v[3])];
  };
  const scale = () => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
  const arcPoints = (x, y, rx, ry, rot, a0, a1, ccw) => {
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
      const [x0, y0] = cur;
      for (let i = 1; i <= 8; i++) {
        const t = i / 8;
        const u = 1 - t;
        add(u * u * x0 + 2 * u * t * cx + t * t * x, u * u * y0 + 2 * u * t * cy + t * t * y);
      }
    },
    bezierCurveTo(ax, ay, bx, by, x, y) {
      note('bezierCurveTo', [ax, ay, bx, by, x, y]);
      const [x0, y0] = cur;
      for (let i = 1; i <= 10; i++) {
        const t = i / 10;
        const u = 1 - t;
        add(u * u * u * x0 + 3 * u * u * t * ax + 3 * u * t * t * bx + t * t * t * x, u * u * u * y0 + 3 * u * u * t * ay + 3 * u * t * t * by + t * t * t * y);
      }
    },
    arc(x, y, r, a0, a1, ccw = false) {
      note('arc', [x, y, r, a0, a1, ccw]);
      arcPoints(x, y, r, r, 0, a0, a1, ccw);
    },
    ellipse(x, y, rx, ry, rot, a0, a1, ccw = false) {
      note('ellipse', [x, y, rx, ry, rot, a0, a1, ccw]);
      arcPoints(x, y, rx, ry, rot, a0, a1, ccw);
    },
    rect(x, y, w, h) {
      note('rect', [x, y, w, h]);
      add(x, y);
      add(x + w, y);
      add(x + w, y + h);
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
function roomOf(rows, { doors = '', open = true, seed = 7, biome = 'cave' } = {}) {
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
function painted(room, keep = false) {
  const c = fakeCanvas(0, 0, keep);
  paintRoom(c.getContext('2d'), room);
  return c.log;
}

const ALL = Object.entries(SAMPLES).flatMap(([size, list]) => list.map((rows, i) => ({ size, i, rows })));
const KEYS = { n: 'door', e: 'door.e', s: 'door.s', w: 'door.w' };
const WALL = ['wtrunk', 'wtop', 'wcap', 'wside', 'door', 'door.e', 'door.s', 'door.w'];

/** Яркость и насыщенность цвета #rrggbb: 0…255 и 0…1. */
function tint(hex) {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const max = Math.max(...v);
  const min = Math.min(...v);
  return { light: 0.299 * v[0] + 0.587 * v[1] + 0.114 * v[2], rich: max ? (max - min) / max : 0 };
}

// ---------- проверки ----------

test('файл мест загружается без браузера и не тянется ни к DOM, ни к случайности', () => {
  const code = SRC.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  for (const word of ['document', 'window', 'Math.random', 'performance', 'Date', 'navigator', 'requestAnimationFrame', 'getImageData']) {
    assert.ok(!new RegExp(`(^|[^\\w.$])${word.replace('.', '\\.')}\\b`).test(code), `${word} — рисунок должен быть один и тот же, без DOM`);
  }
  const imports = [...code.matchAll(/from\s+'([^']+)'/g)].map((x) => x[1]).sort();
  assert.deepEqual(imports, ['./art-tiles.js', './tiles.js'], 'места рисуются лесными приёмами: только клетки и рисунки леса');
});

test('у каждого места есть всё, на что рассчитывают рендер и сборка комнаты', () => {
  for (const id of PLACES) {
    assert.ok(BIOMES.includes(id));
    const look = BIOME_LOOK[id];
    assert.ok(look && Object.prototype.hasOwnProperty.call(BIOME_LOOK, id), `места «${id}» нет`);
    assert.equal(look.id, id);
    // своя земля, вода, особая клетка и колючки — не лесные
    for (const fn of ['ground', 'decals', 'special', 'water', 'thorns']) {
      assert.equal(typeof look[fn], 'function', `${id}.${fn}`);
      assert.notEqual(look[fn], BIOME_LOOK.forest[fn], `${id}.${fn}: место рисует это лесным рисунком`);
    }
    for (const table of [look.tall, look.low]) {
      assert.ok(table.length >= 3, `${id}: мало разных предметов`);
      for (const [name, weight] of table) {
        const def = look.sprites[name];
        assert.ok(def, `${id}: нет картинки «${name}»`);
        assert.ok(def.foot?.length === 2 && def.foot.every((n) => n > 0), `${id}.${name}: нет следа на земле`);
        assert.ok(Number.isInteger(def.variants) && def.variants >= 2, `${id}.${name}: вариантов ${def.variants}`);
        assert.ok(weight > 0);
        assert.ok(A.hasSprite(`prop.${id}.${name}`), `${id}: «${name}» нет в реестре`);
        assert.equal(A.spriteDef(`prop.${id}.${name}`).variants, def.variants);
      }
    }
    const bush = look.sprites[look.bush];
    assert.ok(bush?.foot && bush.variants >= 2 && A.hasSprite(`prop.${id}.${look.bush}`), `${id}: куст`);
    assert.notEqual(bush.paint, BIOME_LOOK.forest.sprites.bush.paint, `${id}: куст лесной`);
    // длинное «низкое» на две клетки — тоже своё или подходящее месту
    assert.ok(look.sprites.biglog?.foot && A.hasSprite(`prop.${id}.biglog`));
    for (const name of WALL) {
      assert.ok(A.hasSprite(`prop.${id}.${name}`), `${id}: ${name}`);
      // рамка и привязка — как у леса: по ним propsOf ставит стену и двери
      const mine = A.spriteDef(`prop.${id}.${name}`);
      const wood = A.spriteDef(`prop.forest.${name}`);
      if (name !== 'wtrunk') assert.deepEqual([mine.w, mine.h, mine.ox, mine.oy], [wood.w, wood.h, wood.ox, wood.oy], `${id}.${name}: рамка`);
      assert.equal(mine.variants, wood.variants, `${id}.${name}: вариантов`);
    }
    const deep = A.spriteDef(`tile.${id}.deep`);
    assert.deepEqual([deep.w, deep.h, deep.ox, deep.oy, deep.pad], [64, 64, 0, 0, 0]);
    for (const c of Object.values(look.pal).flat()) assert.ok(validColor(c), `${id}: краска «${c}»`);
    for (const [name, t] of Object.entries(look.tone)) {
      for (const key of ['base', 'light', 'dark', 'line']) assert.ok(validColor(t[key]), `${id}: тон ${name}.${key} — «${t[key]}»`);
    }
  }
  // пещера: стену держат свои столбы; осень: клёны и берёзы красятся своими тонами
  assert.notEqual(BIOME_LOOK.cave.sprites.wtrunk.paint, BIOME_LOOK.forest.sprites.wtrunk.paint);
  for (const name of ['wine', 'crimson', 'rust', 'orange', 'gold']) assert.ok(BIOME_LOOK.autumn.tone[name], `осень: нет тона ${name}`);
  // лес остался лесом
  assert.equal(BIOME_LOOK.forest.pal.ground, '#7cc45a');
});

test('краски: пол пещеры тёмный, но не чёрный; осенняя земля глуше и темнее лисы и темнее кролика', () => {
  const fox = tint('#f0862b');
  const rabbit = tint('#b8a48f');
  const cave = BIOME_LOOK.cave.pal;
  const autumn = BIOME_LOOK.autumn.pal;
  for (const key of ['ground', 'groundLight', 'groundDark']) {
    const c = tint(cave[key]);
    assert.ok(c.light > 60 && c.light < 125, `пещера ${key}: яркость ${c.light.toFixed(0)}`);
    assert.ok(fox.light - c.light > 30 && rabbit.light - c.light > 40, `пещера ${key}: зверьки не выделяются`);
    const a = tint(autumn[key]);
    assert.ok(a.rich < fox.rich - 0.15, `осень ${key}: насыщенность ${a.rich.toFixed(2)} — как у лисы (${fox.rich.toFixed(2)})`);
    assert.ok(a.light < rabbit.light - 15, `осень ${key}: кролик не светлее земли`);
  }
  assert.ok(fox.light - tint(autumn.ground).light > 25, 'осень: лиса не светлее земли');
  // провал — самое тёмное на полу, кромка у него светлая
  assert.ok(tint(cave.water).light < 30 && tint(cave.groundDeep).light > tint(cave.water).light + 15);
  // пещера темнее остальных мест
  assert.ok(tint(cave.ground).light < tint(autumn.ground).light - 20 && tint(cave.ground).light < tint(BIOME_LOOK.forest.pal.ground).light - 40);
});

test('каждая картинка мест рисуется во всех вариантах: без NaN, с настоящими цветами, не пуста и не вылезает из рамки', () => {
  const bad = [];
  let n = 0;
  for (const k of [2.44, 1]) {
    const art = A.createArt(k, fakeCanvas);
    for (const key of A.spriteKeys().filter((s) => PLACES.some((id) => s.startsWith(`prop.${id}.`) || s === `tile.${id}.deep`))) {
      const def = A.spriteDef(key);
      for (let v = 0; v < def.variants; v++) {
        const name = `${key} ·${v} (чёткость ${k})`;
        let s = null;
        try {
          s = art.sprite(key, v);
        } catch (e) {
          bad.push(`${name}: ${e.message}`);
          continue;
        }
        const { log } = s.c;
        n += 1;
        if (!log.paints) bad.push(`${name}: ничего не нарисовано`);
        if (log.depth) bad.push(`${name}: save без restore`);
        const [x0, y0, x1, y1] = log.box;
        if (key.startsWith('tile.')) {
          // клетка глубины рисует с запасом за край: шва нет
          if (!(x0 < 0 && y0 < 0 && x1 > s.c.width && y1 > s.c.height)) bad.push(`${name}: не доходит до края — будет шов`);
          continue;
        }
        // запас — полторы точки холста на сглаживание
        if (!(x0 >= -1.5 && y0 >= -1.5 && x1 <= s.c.width + 1.5 && y1 <= s.c.height + 1.5)) {
          const out = [-x0, -y0, x1 - s.c.width, y1 - s.c.height].map((t) => Math.max(0, t / k).toFixed(1));
          bad.push(`${name}: вылезла из рамки ${def.w}×${def.h} — слева, сверху, справа, снизу на ${out.join(', ')} ед.`);
        }
        if (!(Math.max((x1 - x0) / s.c.width, (y1 - y0) / s.c.height) > 0.6)) bad.push(`${name}: гораздо меньше своей рамки`);
      }
    }
  }
  assert.deepEqual(bad, []);
  assert.ok(n >= 2 * 2 * 40, `картинок ${n}`);
});

test('фон и предметы рисуются для каждого образца, зерна и набора дверей: за поля ничего не выходит, ключи есть в реестре', () => {
  let runs = 0;
  for (const biome of PLACES) {
    for (const { size, i, rows } of ALL) {
      for (const doors of ['', 'n', 'ew', 'nesw']) {
        for (const seed of [1, 0xfeedbeef]) {
          const open = (seed + doors.length) % 2 === 0;
          const room = roomOf(rows, { doors, seed, open, biome });
          const name = `${biome} ${size}${i} двери «${doors}» зерно ${seed}`;
          const log = painted(room);
          assert.equal(log.depth, 0, `${name}: save без restore`);
          assert.ok(log.n > 2000, `${name}: фон подозрительно пуст (${log.n} вызовов)`);
          const [x0, y0, x1, y1] = log.box;
          assert.ok(x0 >= -M - 1 && y0 >= -M - 1 && x1 <= room.w * T + M + 1 && y1 <= room.h * T + M + 1,
            `${name}: рисунок вышел за поля: ${[x0, y0, x1, y1].map((v) => v.toFixed(1)).join(' ')}`);
          assert.ok(x0 <= -M + 1 && y0 <= -M + 1 && x1 >= room.w * T + M - 1 && y1 >= room.h * T + M - 1, `${name}: поля закрашены не до края`);
          const props = propsOf(room);
          assert.ok(props.length > 20 && props.length <= { S: 90, M: 125, L: 165 }[size], `${name}: предметов ${props.length}`);
          let over = false;
          for (const p of props) {
            const def = A.spriteDef(p.key);
            assert.ok(def, `${name}: нет картинки «${p.key}»`);
            assert.ok(p.key.startsWith(`prop.${biome}.`), `${name}: чужая картинка ${p.key}`);
            assert.ok(Number.isInteger(p.v) && p.v >= 0 && p.v < def.variants, `${name}: ${p.key} вариант ${p.v}`);
            assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
            // рамка картинки — в пределах полей фона: за ними рендер ничего не готовит
            const px = p.x - def.ox;
            const py = p.y - def.oy;
            assert.ok(px >= -M - 2 && py >= -M - 2 && px + def.w <= room.w * T + M + 2 && py + def.h <= room.h * T + M + 2,
              `${name}: ${p.key} в (${p.x.toFixed(0)}, ${p.y.toFixed(0)}) торчит за поля`);
            if (p.over) over = true;
            else assert.ok(!over, `${name}: ${p.key} стоит в списке после нависающего`);
          }
          const frames = props.filter((p) => /\.door(\.[esw])?$/.test(p.key));
          assert.equal(frames.length, doors.length, `${name}: рамок дверей`);
          for (const side of doors) {
            const f = frames.filter((p) => p.key === `prop.${biome}.${KEYS[side]}`);
            assert.equal(f.length, 1, `${name}: рамка стороны ${side}`);
            assert.equal(f[0].v, open ? 0 : 1, `${name}: вариант рамки ${side}`);
          }
          runs += 1;
        }
      }
    }
  }
  assert.equal(runs, 2 * 9 * 4 * 2);
});

test('то же зерно — та же картинка, другое зерно — другая; место рисуется не так, как лес и не так, как соседнее', () => {
  const logs = {};
  for (const biome of ['forest', ...PLACES]) {
    for (const { size, i, rows } of ALL.filter((s) => s.i === 0)) {
      const a = roomOf(rows, { doors: 'nesw', seed: 12345, biome });
      const la = painted(a, true).calls;
      assert.deepEqual(painted(roomOf(rows, { doors: 'nesw', seed: 12345, biome }), true).calls, la, `${biome} ${size}${i}: одно зерно — разные картинки`);
      assert.notDeepEqual(painted(roomOf(rows, { doors: 'nesw', seed: 12346, biome }), true).calls, la, `${biome} ${size}${i}: разные зёрна — одна картинка`);
      assert.deepEqual(propsOf(a), propsOf(roomOf(rows, { doors: 'nesw', seed: 12345, biome })));
      // повторный вызов ничего не копит
      assert.deepEqual(painted(a, true).calls, la);
      if (size === 'S') logs[biome] = la;
    }
  }
  // не перекрашенный лес: команды рисунка другие, а не только цвета в них
  const shape = (calls) => calls.filter((c) => !/^(fillStyle|strokeStyle|stop)\(/.test(c));
  assert.notDeepEqual(shape(logs.cave), shape(logs.forest));
  assert.notDeepEqual(shape(logs.autumn), shape(logs.forest));
  assert.notDeepEqual(shape(logs.cave), shape(logs.autumn));
  // зерно — любое число
  for (const biome of PLACES) {
    for (const seed of [0, -5, 3.7, 2 ** 40, undefined]) {
      const room = roomOf(SAMPLES.S[0], { doors: 'ns', seed, biome });
      assert.equal(painted(room).depth, 0);
      assert.ok(propsOf(room).every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)), `зерно ${seed}`);
    }
  }
});

test('каждый код клетки чем-то нарисован; плоской клетке предмет не положен, преграде — положен', () => {
  const rows = ['###########', '#.........#', '#.........#', '#....?....#', '#.........#', '#.........#', '###########'];
  const at = 3 * 11 + 5;
  for (const biome of PLACES) {
    const base = roomOf(rows.map((r) => r.replace('?', '.')), { seed: 99, biome });
    const plain = painted(base, true).calls;
    const plainProps = propsOf(base);
    for (const [name, code] of Object.entries(TILE)) {
      if (code === TILE.FLOOR) continue;
      const room = roomOf(rows.map((r) => r.replace('?', '.')), { seed: 99, biome });
      room.tiles[at] = code;
      const log = painted(room, true);
      assert.equal(log.depth, 0, `${biome} ${name}`);
      // проём посреди комнаты не бывает: дверь — это клетка стены, её рисуют рамка двери и тропа от неё
      if (code !== TILE.DOOR) assert.notDeepEqual(log.calls, plain, `${biome} ${name}: клетка нарисована как простая земля`);
      const props = propsOf(room);
      const extra = props.filter((p) => !plainProps.some((q) => q.key === p.key && q.x === p.x && q.y === p.y));
      if ([TILE.TALL, TILE.LOW, TILE.BUSH, TILE.WALL].includes(code)) {
        assert.ok(extra.length >= 1, `${biome} ${name}: у клетки нет предмета`);
        for (const p of extra) assert.ok(Math.abs(p.x - 5.5 * T) <= T && Math.abs(p.y - 3.5 * T) <= 1.6 * T, `${biome} ${name}: предмет далеко от своей клетки`);
      } else assert.deepEqual(props, plainProps, `${biome} ${name}: плоской клетке предмет не положен`);
    }
    // две низкие клетки рядом — иногда одно длинное: оно своё и стоит между клетками
    let long = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const room = roomOf(rows.map((r) => r.replace('.?', 'oo')), { seed, biome });
      long += propsOf(room).filter((p) => p.key === `prop.${biome}.biglog`).length;
    }
    assert.ok(long >= 3 && long <= 11, `${biome}: длинных предметов ${long} из 12`);
    // незнакомый код (клетка из будущего) комнату не роняет
    const odd = roomOf(rows.map((r) => r.replace('?', '.')), { seed: 99, biome });
    odd.tiles[at] = 200;
    assert.equal(painted(odd).depth, 0);
    propsOf(odd);
  }
});

test('фон не зависит от того, что меняется посреди боя: открыты ли двери и цел ли куст', () => {
  for (const biome of PLACES) {
    for (const { size, i, rows } of ALL.filter((s) => s.i === 0)) {
      const open = painted(roomOf(rows, { doors: 'nesw', open: true, seed: 6, biome }), true).calls;
      assert.deepEqual(painted(roomOf(rows, { doors: 'nesw', open: false, seed: 6, biome }), true).calls, open, `${biome} ${size}${i}: фон зависит от дверей`);
    }
    // вместо куста — незнакомая клетка, по которой тоже не ходят: фон тот же, значит сломанный куст можно просто
    // перестать рисовать
    const room = roomOf(SAMPLES.M[0], { doors: 'nesw', seed: 31, biome });
    const withBush = painted(room, true).calls;
    const before = propsOf(room);
    for (let k = 0; k < room.tiles.length; k++) if (room.tiles[k] === TILE.BUSH) room.tiles[k] = 200;
    assert.deepEqual(painted(room, true).calls, withBush, `${biome}: куст оставляет след в фоне`);
    // а из предметов пропадают только кусты
    const after = propsOf(room);
    const gone = before.filter((p) => !after.some((q) => q.key === p.key && q.x === p.x && q.y === p.y && q.v === p.v));
    assert.ok(gone.length >= 2 && gone.every((p) => p.key === `prop.${biome}.bush`), `${biome}: вместе с кустами пропало что-то ещё`);
    assert.equal(after.length, before.length - gone.length);
    // у остальных преград тень в земле есть: они никуда не денутся
    for (const code of [TILE.TALL, TILE.LOW]) {
      const solid = roomOf(SAMPLES.M[0], { doors: 'nesw', seed: 31, biome });
      const was = painted(solid, true).calls;
      solid.tiles[solid.tiles.indexOf(code)] = 200;
      assert.notDeepEqual(painted(solid, true).calls, was);
    }
  }
});

test('в комнатах встречаются все свои предметы места, а лесных деревьев среди них нет', () => {
  const lone = { cave: [], autumn: ['log', 'wtrunk'] };            // что осень сознательно берёт у леса
  for (const biome of PLACES) {
    const look = BIOME_LOOK[biome];
    const seen = new Set();
    for (const { rows } of ALL) {
      for (let seed = 1; seed <= 6; seed++) for (const p of propsOf(roomOf(rows, { doors: 'nesw', seed, biome }))) seen.add(p.key.split('.').slice(2).join('.'));
    }
    const want = [...look.tall, ...look.low].map((row) => row[0]).concat([look.bush, 'biglog'], WALL);
    for (const name of want) assert.ok(seen.has(name), `${biome}: «${name}» ни разу не встретился`);
    for (const name of seen) {
      assert.ok(want.includes(name), `${biome}: в комнате лишний предмет «${name}»`);
      const same = look.sprites[name].paint === BIOME_LOOK.forest.sprites[name]?.paint;
      assert.equal(same, lone[biome].includes(name) || (biome === 'autumn' && name === 'biglog'), `${biome}.${name}: ${same ? 'лесной рисунок' : 'свой рисунок'}`);
    }
  }
});

test('фон комнаты готовится за разумное число команд, предметы считаются мгновенно', () => {
  // те же пределы, что у леса: фон готовится при входе в комнату, тысячи градиентов — заметная заминка на телефоне
  for (const biome of PLACES) {
    for (const rows of [SAMPLES.L[1], SAMPLES.L[0]]) {
      const room = roomOf(rows, { doors: 'nesw', seed: 2, biome });
      const log = painted(room);
      assert.ok(log.n < 60000, `${biome}: команд ${log.n}`);
      assert.ok(log.grads < 1500, `${biome}: градиентов ${log.grads}`);
      const t0 = process.hrtime.bigint();
      for (let k = 0; k < 50; k++) propsOf(room);
      const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 50;
      assert.ok(ms < 5, `${biome} propsOf: ${ms.toFixed(2)} мс`);
    }
  }
});
