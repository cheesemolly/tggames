// Болото и зимний бор без браузера: фон комнаты и предметы этих мест на поддельном холсте.
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
import '../art-tiles2.js';
import { fakeCanvas, validColor } from './room-canvas.js';

const SRC = readFileSync(new URL('../art-tiles2.js', import.meta.url), 'utf8');
const PAGE = readFileSync(new URL('../../../tools/fox-hunt-rooms.html', import.meta.url), 'utf8');
const SAMPLES = JSON.parse(/<script type="application\/json" id="samples">([\s\S]*?)<\/script>/.exec(PAGE)[1]);
const M = ROOM_MARGIN;
const PLACES = ['swamp', 'taiga'];

// ---------- комнаты ----------

/** Комната из букв — как её соберёт игра: двери посередине сторон (doors — строка сторон), зерно, место. */
function roomOf(rows, { doors = '', open = true, seed = 7, biome = 'swamp' } = {}) {
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
    // высокое выше низкого: по росту видно, через что перелетит выстрел
    const lowest = Math.min(...look.tall.map(([name]) => look.sprites[name].oy));
    const highest = Math.max(...look.low.map(([name]) => look.sprites[name].oy));
    assert.ok(lowest > highest + 15, `${id}: высокое (${lowest}) почти не выше низкого (${highest})`);
    const bush = look.sprites[look.bush];
    assert.ok(bush?.foot && bush.variants >= 2 && A.hasSprite(`prop.${id}.${look.bush}`), `${id}: куст`);
    assert.notEqual(bush.paint, BIOME_LOOK.forest.sprites.bush.paint, `${id}: куст лесной`);
    // длинное «низкое» на две клетки — тоже своё
    assert.ok(look.sprites.biglog?.foot && A.hasSprite(`prop.${id}.biglog`));
    assert.notEqual(look.sprites.biglog.paint, BIOME_LOOK.forest.sprites.biglog.paint, `${id}: длинное бревно лесное`);
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
  // болото: ива и берёзка красятся своими тонами; зима: сосна — своим, а светлый тон хвои — иней, почти снег
  for (const name of ['willow', 'pale']) assert.ok(BIOME_LOOK.swamp.tone[name], `болото: нет тона ${name}`);
  assert.ok(BIOME_LOOK.taiga.tone.pine);
  const rgb = (c) => c.match(/\d+/g).slice(0, 3).map(Number);
  for (const name of ['near', 'mid', 'lit', 'fir']) assert.ok(Math.min(...rgb(BIOME_LOOK.taiga.tone[name].light)) > 150, `зима: тон ${name} без инея`);
  // стена зимы — ёлки, а не клубы листвы; у болота — лесные клубы с бахромой
  for (const name of ['wtop', 'wcap', 'wside']) {
    for (const id of PLACES) assert.notEqual(BIOME_LOOK[id].sprites[name].paint, BIOME_LOOK.forest.sprites[name].paint, `${id}.${name}`);
  }
  // лес остался лесом
  assert.equal(BIOME_LOOK.forest.pal.ground, '#7cc45a');
  assert.equal(BIOME_LOOK.forest.pal.moss, '#6fae4a');
});

test('краски: болото глуше лягушки и темнее кролика; снег светлый, но темнее зайца-беляка и ободка красной зоны', () => {
  const fox = tint('#f0862b');
  const rabbit = tint('#b8a48f');
  const hare = tint('#f3f6fa');
  const frog = tint('#8fc43c');
  const rim = tint('#ffe1dc');
  const swamp = BIOME_LOOK.swamp.pal;
  const taiga = BIOME_LOOK.taiga.pal;
  for (const key of ['ground', 'groundLight', 'groundDark']) {
    const s = tint(swamp[key]);
    assert.ok(s.rich < 0.4 && frog.rich - s.rich > 0.3, `болото ${key}: насыщенность ${s.rich.toFixed(2)} — лягушка сольётся`);
    assert.ok(fox.rich - s.rich > 0.4, `болото ${key}: лиса не ярче земли`);
  }
  assert.ok(rabbit.light - tint(swamp.ground).light > 25, 'болото: кролик не светлее земли');
  assert.ok(frog.light - tint(swamp.ground).light > 20, 'болото: лягушка не светлее земли');
  // грязь и вода темнее земли, грязь — бурая, а не зелёная
  assert.ok(tint(swamp.mud).light < tint(swamp.ground).light - 30 && tint(swamp.water).light < tint(swamp.ground).light - 20);
  const mud = [1, 3, 5].map((i) => parseInt(swamp.mud.slice(i, i + 2), 16));
  assert.ok(mud[0] > mud[1] && mud[1] > mud[2], 'болото: грязь не бурая');
  const snow = tint(taiga.ground);
  assert.ok(snow.light > 200, `зима: снег тёмный (${snow.light.toFixed(0)})`);
  assert.ok(hare.light - snow.light > 25, `зима: заяц-беляк не светлее снега (${(hare.light - snow.light).toFixed(0)})`);
  assert.ok(rim.light - snow.light > 12, 'зима: ободок красной зоны не светлее снега');
  assert.ok(snow.light - fox.light > 50 && snow.light - rabbit.light > 40, 'зима: лиса и кролик не темнее снега');
  // снег холодный: синего в нём больше, чем красного
  const g = [1, 3, 5].map((i) => parseInt(taiga.ground.slice(i, i + 2), 16));
  assert.ok(g[2] > g[0] + 15, 'зима: снег не голубой');
  // шапки и сугробы белее снега под ногами; полынья — самое тёмное на полу, лёд светлее её и синее снега
  assert.ok(tint(taiga.snowBody).light > snow.light + 15 && tint(taiga.snow).light > snow.light + 25);
  assert.ok(tint(taiga.water).light < 110 && tint(taiga.ice).light > tint(taiga.water).light + 80);
  assert.ok(tint(taiga.ice).rich > snow.rich + 0.05, 'зима: лёд не отличить от снега');
  // обводка сугроба заметна на снегу
  assert.ok(snow.light - tint(taiga.snowEdge).light > 80);
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
  assert.notDeepEqual(shape(logs.swamp), shape(logs.forest));
  assert.notDeepEqual(shape(logs.taiga), shape(logs.forest));
  assert.notDeepEqual(shape(logs.swamp), shape(logs.taiga));
  // и картинки предметов — тоже: одна и та же картинка рисуется одинаково, сколько бы раз её ни готовили
  for (const key of ['prop.swamp.willow', 'prop.taiga.fir', 'prop.taiga.wtop', 'prop.swamp.bush']) {
    const one = A.createArt(2, (w, h) => fakeCanvas(w, h, true)).sprite(key, 1).c.log.calls;
    const two = A.createArt(2, (w, h) => fakeCanvas(w, h, true)).sprite(key, 1).c.log.calls;
    assert.deepEqual(one, two, `${key}: рисуется по-разному`);
    assert.notDeepEqual(A.createArt(2, (w, h) => fakeCanvas(w, h, true)).sprite(key, 0).c.log.calls, one, `${key}: варианты одинаковые`);
  }
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
  const lone = { swamp: ['door', 'door.e', 'door.s', 'door.w'], taiga: [] };      // что болото сознательно берёт у леса
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
      assert.equal(same, lone[biome].includes(name), `${biome}.${name}: ${same ? 'лесной рисунок' : 'свой рисунок'}`);
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
