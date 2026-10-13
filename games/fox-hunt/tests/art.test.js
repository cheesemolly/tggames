// Рисунки «Лисьей охоты» без браузера: всё, что записано в реестр (art.js), рисуется на поддельном холсте.
// Проверяется то, что на глаз не поймать, пока не сломается на телефоне: картинка не вылезла из своей рамки,
// в цвет не попало NaN, поза не унесла лапу на другой конец комнаты, файл рисунков не полез в DOM при загрузке.
// Как рисунки выглядят — смотреть глазами: tools/fox-hunt-sheet.html.
//
// Файлы рисунков (art-*.js) подключаются сами — новый файл попадает под те же проверки без правки теста.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as A from '../art.js';
import * as K from '../art-kit.js';
import { fakeCanvas, validColor } from './fake-canvas.js';

const DIR = fileURLToPath(new URL('../', import.meta.url));
const FILES = readdirSync(DIR).filter((name) => /^art-.+\.js$/.test(name)).sort();
const INFO = {};                       // что фигуры сказали о себе: RIG_INFO из каждого файла
const broken = [];
for (const file of FILES) {
  try {
    const mod = await import(new URL(`../${file}`, import.meta.url));
    Object.assign(INFO, mod.RIG_INFO ?? {});
  } catch (e) {
    broken.push(`${file}: ${e.message}`);
  }
}

// ---------- набор заготовок на поддельных холстах ----------

const KS = [2.44, 1];                   // чёткость телефона и самая грубая
const SETS = KS.map((k) => {
  const names = new Map();              // холст заготовки → «ключ ·вариант»
  const art = A.createArt(k, fakeCanvas);
  return { k, art, names };
});

/** Запечь картинку и вернуть её холст с записями (и запомнить, чей он). */
function bake(set, key, v) {
  const s = set.art.sprite(key, v);
  assert.ok(s, `нет картинки «${key}»`);
  set.names.set(s.c, `${key} ·${v}`);
  return s;
}
for (const set of SETS) for (const key of A.spriteKeys()) for (let v = 0; v < A.spriteDef(key).variants; v++) {
  try {
    bake(set, key, v);
  } catch { /* упадёт ещё раз в своём тесте — с именем картинки */ }
}

/**
 * Нарисовать фигуру в позе и вернуть её части: [{ name, m, box, alpha }]. box — рамка закрашенного в части
 * (не всей её картинки с пустыми полями) в единицах мира от точки привязки фигуры.
 */
function pose(set, id, a, dir = 1, at = [300, 200]) {
  const frame = fakeCanvas(600, 400);
  const ctx = frame.getContext('2d');
  assert.equal(set.art.rig(ctx, id, at[0], at[1], dir, a), true, `нет фигуры «${id}»`);
  return frame.log.images.map((d) => {
    const ink = d.img.log.paints ? d.img.log.box : [0, 0, d.img.width, d.img.height];
    const u0 = d.x + (Math.max(0, ink[0]) / d.img.width) * d.w;
    const u1 = d.x + (Math.min(d.img.width, ink[2]) / d.img.width) * d.w;
    const v0 = d.y + (Math.max(0, ink[1]) / d.img.height) * d.h;
    const v1 = d.y + (Math.min(d.img.height, ink[3]) / d.img.height) * d.h;
    const p = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map(([x, y]) => [
      (d.m[0] * x + d.m[2] * y + d.m[4] - at[0]) / set.k, (d.m[1] * x + d.m[3] * y + d.m[5] - at[1]) / set.k]);
    return {
      name: set.names.get(d.img) ?? 'вспышка',
      m: d.m,
      alpha: d.alpha,
      box: [Math.min(...p.map((q) => q[0])), Math.min(...p.map((q) => q[1])), Math.max(...p.map((q) => q[0])), Math.max(...p.map((q) => q[1]))],
    };
  });
}
/** Рамка всей фигуры в единицах мира от точки привязки. */
const extent = (parts) => [Math.min(...parts.map((p) => p.box[0])), Math.min(...parts.map((p) => p.box[1])),
  Math.max(...parts.map((p) => p.box[2])), Math.max(...parts.map((p) => p.box[3]))];
const part = (parts, name) => parts.find((p) => p.name.startsWith(name));
const POSE = { t: 0.4, act: 'idle', k: 0, speed: 1, vx: 1, vy: 0, z: 0, flash: 0, hp: 1, elite: false, aim: 0, data: null };

// Кому положено обрезаться краем своей рамки: бесшовная плитка рисует с запасом за край, чтобы не было шва.
// Всё остальное за рамку не выходит — иначе у картинки на экране будет срезанный бок.
const CUT_BY_FRAME = [/^tile\./];

const COMMON_ACTS = ['spawn', 'idle', 'move', 'windup', 'attack', 'recover', 'stun', 'hurt'];
const actsOf = (id) => INFO[id]?.acts ?? COMMON_ACTS;

// ---------- проверки ----------

test('файлы рисунков загружаются без браузера и не тянутся ни к DOM, ни к случайности', () => {
  assert.deepEqual(broken, [], 'файл рисунков упал при загрузке');
  assert.ok(FILES.includes('art-kit.js') && FILES.includes('art-fox.js') && FILES.includes('art-fx.js'));
  for (const file of FILES) {
    const src = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    for (const word of ['document', 'window', 'Math.random', 'navigator', 'localStorage', 'requestAnimationFrame']) {
      assert.ok(!new RegExp(`(^|[^\\w.$])${word.replace('.', '\\.')}\\b`).test(src), `${file}: ${word} — рисунок должен быть один и тот же, без DOM`);
    }
  }
});

/** Запечь каждую картинку из тех, что подошли, во всех вариантах и вернуть всё, что с ними не так. */
function flaws(fits) {
  const bad = [];                        // собираем всё сразу: одна кривая картинка не прячет остальные
  for (const set of SETS) {
    for (const key of A.spriteKeys().filter(fits)) {
      const def = A.spriteDef(key);
      if (!(def.variants >= 1 && Number.isInteger(def.variants))) bad.push(`${key}: число вариантов ${def.variants}`);
      if (!(def.ox >= -def.pad && def.ox <= def.w + def.pad && def.oy >= -def.pad && def.oy <= def.h + def.pad)) bad.push(`${key}: точка привязки вне рамки`);
      for (let v = 0; v < def.variants; v++) {
        const name = `${key} ·${v} (чёткость ${set.k})`;
        let s = null;
        try {
          s = bake(set, key, v);
        } catch (e) {
          bad.push(`${name}: ${e.message}`);
          continue;
        }
        const { log } = s.c;
        if (!log.paints) bad.push(`${name}: ничего не нарисовано`);
        if (log.balance) bad.push(`${name}: save без restore`);
        // запас — полторы точки холста на сглаживание
        const [x0, y0, x1, y1] = log.box;
        if (!CUT_BY_FRAME.some((re) => re.test(key)) && !(x0 >= -1.5 && y0 >= -1.5 && x1 <= s.c.width + 1.5 && y1 <= s.c.height + 1.5)) {
          const out = [-x0, -y0, x1 - s.c.width, y1 - s.c.height].map((n) => Math.max(0, n / set.k).toFixed(1));
          bad.push(`${name}: рисунок вылез из рамки ${def.w}×${def.h} (+${def.pad}) — слева, сверху, справа, снизу на ${out.join(', ')} ед.`);
        }
        // и не теряется в ней: занимает хотя бы треть по большей стороне
        if (!(Math.max((x1 - x0) / s.c.width, (y1 - y0) / s.c.height) > 0.33)) bad.push(`${name}: рисунок гораздо меньше своей рамки`);
        for (const c of log.colors) if (!validColor(c)) bad.push(`${name}: не цвет «${c}»`);
        for (const al of log.alphas) if (!(al >= 0 && al <= 1)) bad.push(`${name}: прозрачность ${al}`);
      }
    }
  }
  return bad;
}

// мир (земля, стены, деревья, вещи) и всё остальное проверяются порознь: видно, где именно непорядок
const WORLD = /^(tile|prop|thing)\./;

test('существа, эффекты, снаряды, значки: каждая картинка во всех вариантах не падает, не пуста, не вылезает из рамки, цвета — настоящие', () => {
  assert.ok(A.spriteKeys().filter((key) => !WORLD.test(key)).length > 60);
  assert.deepEqual(flaws((key) => !WORLD.test(key)), []);
});

test('мир — земля, стены, деревья, вещи: то же самое', () => {
  assert.deepEqual(flaws((key) => WORLD.test(key)), []);
});

test('значок картинки (для окон игры) рисуется в свой квадрат', () => {
  for (const key of ['pick.coin', 'pick.heart', 'shot.orb', 'fx.star', 'mob.fox.head']) {
    const c = SETS[0].art.icon(key, 32, 2, 1);
    assert.equal(c.width, 64);
    assert.ok(c.log.paints > 0, key);
    assert.ok(c.log.box[0] >= -3 && c.log.box[2] <= 67 && c.log.box[1] >= -3 && c.log.box[3] <= 67, `${key}: значок вылез из квадрата`);
  }
});

test('имена, на которые рассчитывают рендер и логика: эффекты, подбираемое, снаряды', () => {
  const want = {
    'fx.shadow': 1, 'fx.dust': 3, 'fx.puff': 3, 'fx.spark': 1, 'fx.star': 1, 'fx.ring': 1, 'fx.slash': 1, 'fx.speed': 1, 'fx.stun': 1, 'fx.leaf': 2,
    'fx.flame': 3, 'fx.ice': 1, 'fx.bubble': 1, 'fx.bolt': 1, 'fx.warn': 1, 'fx.aim.head': 1, 'fx.aim.dot': 1, 'fx.glow': 5,
    'pick.coin': 1, 'pick.heart': 1, 'pick.mana': 1, 'pick.berry': 1,
    'shot.cone': 1, 'shot.stone': 1, 'shot.acorn': 1, 'shot.arrow': 1, 'shot.thorn': 1, 'shot.nut': 1, 'shot.feather': 1, 'shot.leaf': 1, 'shot.star': 1,
    'shot.wave': 1, 'shot.web': 1, 'shot.pumpkin': 1, 'shot.bubble': 1, 'shot.spore': 1, 'shot.boomerang': 1, 'shot.wasp': 1, 'shot.trap': 1, 'shot.orb': 6,
  };
  for (const [key, variants] of Object.entries(want)) {
    assert.ok(A.hasSprite(key), `нет картинки «${key}»`);
    assert.equal(A.spriteDef(key).variants, variants, `${key}: вариантов`);
  }
  // привязка: вспышки и снаряды — за середину (их вертят и растягивают), то, что стоит на земле, — за низ
  for (const key of A.spriteKeys()) {
    const d = A.spriteDef(key);
    if (key.startsWith('shot.') || (key.startsWith('fx.') && key !== 'fx.flame')) {
      assert.ok(Math.abs(d.ox - d.w / 2) < 1e-9 && Math.abs(d.oy - d.h / 2) < 1e-9, `${key}: привязка не посередине`);
    }
    if (key.startsWith('pick.') || key === 'fx.flame') assert.ok(Math.abs(d.ox - d.w / 2) < 1e-9 && d.oy === d.h, `${key}: привязка не снизу посередине`);
    if (key.startsWith('shot.')) assert.ok(d.w <= 20 && d.h <= 36, `${key}: снаряд слишком велик`);
  }
  // тень — мягкий овал ровно во всю рамку: рендер растягивает её, зная этот размер
  const shadow = A.spriteDef('fx.shadow');
  assert.deepEqual([shadow.w, shadow.h, shadow.pad], [32, 12, 0]);
  for (const id of ['fox', 'rabbit', 'hare', 'gold', 'fat']) assert.ok(A.hasRig(id), `нет фигуры «${id}»`);
});

test('каждая фигура рисует все свои позы и незнакомые тоже: без NaN, части — рядом с точкой привязки', () => {
  assert.ok(A.rigIds().length >= 5);
  const junk = [{}, { act: 'idle' }, { t: NaN, k: NaN, speed: NaN, aim: NaN, vx: NaN, vy: NaN, flash: NaN }, { t: -5, k: -1, speed: -3 },
    { t: 1e6, k: 2, speed: 9, aim: 40, vx: 0, vy: 0 }, { t: 'x', k: 'y', act: 7, speed: null, aim: undefined }];
  for (const set of SETS) {
    for (const id of A.rigIds()) {
      const info = INFO[id] ?? {};
      const reach = Math.max(info.w ?? 150, info.h ?? 150);
      const check = (a, dir, label) => {
        const parts = pose(set, id, a, dir);
        for (const p of parts) {
          assert.ok(p.m.every(Number.isFinite), `${id} ${label}: NaN в преобразовании части ${p.name}`);
          assert.ok(Number.isFinite(p.alpha) && p.alpha >= 0 && p.alpha <= 1, `${id} ${label}: прозрачность ${p.alpha}`);
          const far = Math.max(Math.abs(p.box[0]), Math.abs(p.box[1]), Math.abs(p.box[2]), Math.abs(p.box[3]));
          assert.ok(far <= reach, `${id} ${label}: часть ${p.name} улетела на ${far.toFixed(0)} ед. от точки привязки (рамка фигуры ${reach})`);
        }
        return parts;
      };
      for (const act of [...actsOf(id), 'нет такой позы', '', undefined]) {
        for (const t of [0, 0.37, 3.31, 9.72, 1234.5]) {
          for (const k of [0, 0.25, 0.5, 0.75, 1]) {
            for (const aim of [0, -1.2, 2.6]) {
              const a = { ...POSE, act, t, k, aim, vx: Math.cos(aim), vy: Math.sin(aim), speed: (k * 7) % 1.01 };
              const parts = check(a, aim > 1.6 ? -1 : 1, `${act} t=${t} k=${k}`);
              assert.ok(parts.length > 0, `${id} ${act}: ничего не нарисовано`);
            }
          }
        }
      }
      for (const a of junk) check({ ...a }, 1, `с мусором ${JSON.stringify(a)}`);
      // вспышка от удара: поверх каждой части — её белый силуэт
      const calm = pose(set, id, { ...POSE, act: actsOf(id)[0] });
      const flash = pose(set, id, { ...POSE, act: actsOf(id)[0], flash: 0.6 });
      assert.equal(flash.length, calm.length * 2, `${id}: вспышка`);
    }
  }
});

test('фигура в кадре: без градиентов, теней и текста, после себя не оставляет ни прозрачности, ни save', () => {
  const set = SETS[0];
  for (const id of A.rigIds()) {
    for (const act of actsOf(id)) {
      const frame = fakeCanvas(600, 400);
      const ctx = frame.getContext('2d');
      // запрещённое в кадре (то же, что у рендера): фигура — это готовые картинки и, самое большее, простые линии
      const banned = new Proxy(ctx, {
        get(target, key) {
          if (['createLinearGradient', 'createRadialGradient', 'fillText', 'strokeText', 'clip'].includes(key)) throw new Error(`${id} ${act}: в кадре нельзя ${key}`);
          return target[key];
        },
        set(target, key, value) {
          if (key === 'shadowBlur' && value > 0) throw new Error(`${id} ${act}: в кадре нельзя shadowBlur`);
          if (key === 'globalCompositeOperation' && value !== 'source-over') throw new Error(`${id} ${act}: в кадре нельзя ${value}`);
          target[key] = value;
          return true;
        },
      });
      set.art.rig(banned, id, 300, 200, 1, { ...POSE, act, k: 0.4, t: 2.2 });
      assert.equal(ctx.globalAlpha, 1, `${id} ${act}: после фигуры осталась прозрачность`);
      assert.equal(frame.log.balance, 0, `${id} ${act}: save без restore`);
      assert.ok(frame.log.images.length > 0, `${id} ${act}: ни одной картинки`);
      // лиса и добыча — только из картинок: ни одной линии в кадре
      if (['fox', 'rabbit', 'hare', 'gold', 'fat'].includes(id)) assert.equal(frame.log.paints, frame.log.images.length, `${id} ${act}: в кадре — только drawImage`);
    }
  }
});

test('отражение: фигура, смотрящая влево, — зеркало той, что смотрит вправо', () => {
  const set = SETS[1];
  for (const id of A.rigIds()) {
    const a = { ...POSE, act: actsOf(id)[1] ?? actsOf(id)[0], k: 0.3, t: 1.9 };
    const right = pose(set, id, a, 1);
    const left = pose(set, id, a, -1);
    assert.equal(left.length, right.length);
    for (let i = 0; i < right.length; i++) {
      assert.ok(Math.abs(left[i].box[0] + right[i].box[2]) < 1e-6 && Math.abs(left[i].box[1] - right[i].box[1]) < 1e-6, `${id}: часть ${right[i].name}`);
    }
  }
});

/** Середина части и её растяжение (вдоль и поперёк) — по ним видно позу, даже когда часть повёрнута. */
const mid = (p) => [(p.box[0] + p.box[2]) / 2, (p.box[1] + p.box[3]) / 2];
const stretch = (set, p) => [Math.hypot(p.m[0], p.m[1]) / set.k, Math.hypot(p.m[2], p.m[3]) / set.k];
const turn = (p) => Math.atan2(p.m[1], p.m[0]);

test('лиса: все части на месте, позы отличаются так, как их читает игрок', () => {
  const set = SETS[1];
  const fox = (act, more = {}) => pose(set, 'fox', { ...POSE, act, t: 1, ...more });
  const idle = fox('idle');
  const names = idle.map((p) => p.name.split(' ')[0]).sort();
  assert.deepEqual(names, ['mob.fox.body', 'mob.fox.chest', 'mob.fox.ear', 'mob.fox.ear', 'mob.fox.eye', 'mob.fox.eye', 'mob.fox.head',
    'mob.fox.leg', 'mob.fox.leg', 'mob.fox.leg', 'mob.fox.leg', 'mob.fox.tail1', 'mob.fox.tail2', 'mob.fox.tail3']);
  for (const act of INFO.fox.acts) assert.equal(fox(act, { k: 0.5 }).length, 14, act);
  // размер героя: около 34×30 без хвоста (с ушами чуть выше); ступни — на земле
  const b = extent(idle.filter((p) => !p.name.startsWith('mob.fox.tail')));
  assert.ok(b[2] - b[0] > 30 && b[2] - b[0] < 42 && b[3] - b[1] > 28 && b[3] - b[1] < 38, `лиса ${(b[2] - b[0]).toFixed(1)}×${(b[3] - b[1]).toFixed(1)}`);
  for (const act of ['idle', 'aim', 'land']) {
    for (const t of [0.2, 1, 2.3]) {
      const low = Math.max(...fox(act, { t, k: 0.3 }).filter((p) => p.name.startsWith('mob.fox.leg')).map((p) => p.box[3]));
      // лапа под углом — её рамка чуть ниже самой лапы, отсюда запас
      assert.ok(low > -1.2 && low < (act === 'idle' ? 1.2 : 2.4), `${act}: ступни не на земле (${low.toFixed(2)})`);
    }
  }
  // хвост — сзади и заметный
  const tail = extent(idle.filter((p) => p.name.startsWith('mob.fox.tail')));
  assert.ok(tail[0] < -24 && tail[2] < 2, 'хвост сзади');
  const head = (parts) => mid(part(parts, 'mob.fox.head'));
  const body = (parts) => part(parts, 'mob.fox.body');
  // рывок: тело вытянуто в длину и сплющено, голова далеко впереди хвоста
  const dash = fox('dash', { k: 0.5, vx: 1, vy: 0 });
  const [sx, sy] = stretch(set, body(dash));
  assert.ok(sx > 1.25 && sy < 0.9, `рывок: тело ${sx.toFixed(2)}×${sy.toFixed(2)}`);
  const span = (parts) => head(parts)[0] - mid(part(parts, 'mob.fox.tail3'))[0];
  assert.ok(span(dash) > span(idle) * 1.2, 'в рывке лиса длиннее');
  // целится — присела; сбита — лежит: голова и тело у самой земли
  assert.ok(mid(body(fox('aim')))[1] > mid(body(idle))[1] + 2, 'перед рывком лиса приседает');
  const down = fox('down');
  assert.ok(head(down)[1] > head(idle)[1] + 5 && mid(body(down))[1] > mid(body(idle))[1] + 4, 'сбитая лиса лежит');
  // приземление: сначала сплющена, к концу — как обычно
  assert.ok(stretch(set, body(fox('land', { k: 0 })))[1] < 0.85 && Math.abs(stretch(set, body(fox('land', { k: 1 })))[1] - 1) < 0.04, 'приземление сплющивает');
  // встаёт: из «лежит» в «стоит»
  assert.ok(Math.abs(head(fox('rise', { k: 0 }))[1] - head(down)[1]) < 0.5);
  assert.ok(Math.abs(head(fox('rise', { k: 1 }))[1] - head(idle)[1]) < 0.5);
  // бег: лапы ходят; в стойке — стоят
  const legs = (parts) => parts.filter((p) => p.name.startsWith('mob.fox.leg')).map(turn);
  const one = legs(fox('run', { t: 1 }));
  const two = legs(fox('run', { t: 1.1 }));
  assert.ok(one.some((v, i) => Math.abs(v - two[i]) > 0.3), 'лапы в беге не двигаются');
  assert.ok(legs(idle).every((v) => Math.abs(v) < 0.05), 'в стойке лапы стоят');
  // взгляд: моргает иногда, а не всегда; сбитая — с крестиками, от боли — «>», прицел — прищур
  const eyes = (act, more) => part(fox(act, more), 'mob.fox.eye').name;
  const seen = new Set();
  for (let t = 0; t < 12; t += 0.05) seen.add(eyes('idle', { t }));
  assert.deepEqual([...seen].sort(), ['mob.fox.eye ·0', 'mob.fox.eye ·2']);
  assert.equal(eyes('down'), 'mob.fox.eye ·4');
  assert.equal(eyes('hurt', { k: 0.1 }), 'mob.fox.eye ·5');
  assert.equal(eyes('aim'), 'mob.fox.eye ·1');
  assert.equal(eyes('dash', { k: 0.5 }), 'mob.fox.eye ·1');
  // укус: пасть открыта в начале
  assert.equal(part(fox('bite', { k: 0.1 }), 'mob.fox.head').name, 'mob.fox.head ·1');
  assert.equal(part(fox('bite', { k: 0.8 }), 'mob.fox.head').name, 'mob.fox.head ·0');
  // рывок вверх и вниз наклоняет тело, но не переворачивает; прицел вверх поднимает голову
  const tilt = (vy) => turn(body(fox('dash', { k: 0.5, vx: 0.2, vy })));
  assert.ok(tilt(-1) < -0.4 && tilt(1) > 0.4 && Math.abs(tilt(-1)) < 1.2 && Math.abs(tilt(1)) < 1.2);
  const look = (aim) => turn(part(fox('aim', { aim }), 'mob.fox.head'));
  assert.ok(look(-1) < look(0) - 0.2 && look(1) > look(0) + 0.2 && Math.abs(look(Math.PI - 1) - look(1)) < 1e-6, 'голова — туда, куда целится');
});

test('добыча: одна фигура на четверых, позы читаются', () => {
  const set = SETS[1];
  const sizes = {};
  for (const id of ['rabbit', 'hare', 'gold', 'fat']) {
    const of = (act, more = {}) => pose(set, id, { ...POSE, act, t: 1, ...more });
    const get = (parts, name) => part(parts, `mob.${id}.${name}`);
    assert.deepEqual(INFO[id].acts, ['graze', 'alert', 'flee', 'tired', 'hop', 'freeze', 'dive']);
    const sit = of('сидит');
    const b = extent(sit);
    sizes[id] = b[2] - b[0];
    assert.ok(b[2] - b[0] > 14 && b[2] - b[0] < 27 && b[3] - b[1] > 14 && b[3] - b[1] < 30, `${id}: ${(b[2] - b[0]).toFixed(1)}×${(b[3] - b[1]).toFixed(1)}`);
    for (const act of ['сидит', 'graze', 'alert', 'tired', 'freeze']) {
      const low = get(of(act), 'foot').box[3];
      assert.ok(Math.abs(low) < 1, `${id} ${act}: ступни не на земле (${low.toFixed(2)})`);
    }
    const rest = mid(get(sit, 'body'))[1];
    // щиплет траву — голова у земли; насторожился — столбиком: голова высоко
    assert.ok(mid(get(of('graze'), 'head'))[1] > mid(get(sit, 'head'))[1] + 1.5, `${id}: щиплет траву`);
    assert.ok(mid(get(of('alert'), 'head'))[1] < mid(get(sit, 'head'))[1] - 2, `${id}: столбиком`);
    // удирает прыжками: то в воздухе, то на земле
    let air = 0;
    let ground = 0;
    for (let t = 0; t < 1; t += 0.02) {
      const y = mid(get(of('flee', { t }), 'body'))[1];
      if (y < rest - 2) air += 1;
      if (y > rest - 0.6) ground += 1;
    }
    assert.ok(air > 8 && ground > 8, `${id}: прыжки (в воздухе ${air}, на земле ${ground})`);
    // прыжок в сторону — дугой
    const hop = (k) => mid(get(of('hop', { k }), 'body'))[1];
    assert.ok(hop(0.5) < rest - 5 && Math.abs(hop(0) - rest) < 1.5 && Math.abs(hop(1) - rest) < 1.5, `${id}: дуга`);
    // ныряет в нору: к концу — крошечный и у самой точки привязки
    const end = of('dive', { k: 1 });
    assert.ok(stretch(set, get(end, 'body'))[0] < 0.3, `${id}: в нору`);
    assert.ok(Math.max(...extent(end).map(Math.abs)) < 9, `${id}: нора — в точке привязки`);
    // дрожит от страха
    assert.notDeepEqual(get(of('freeze', { t: 1 }), 'body').box, get(of('freeze', { t: 1.02 }), 'body').box);
    // взгляд: от страха — вытаращен, выдохся — прикрыт
    assert.equal(part(of('freeze'), 'mob.prey.eye').name, 'mob.prey.eye ·2');
    assert.equal(part(of('tired'), 'mob.prey.eye').name, 'mob.prey.eye ·3');
  }
  // заяц — длинноухий, толстяк — шире и с короткими ушами
  const ear = (id) => A.spriteDef(`mob.${id}.ear`).h;
  assert.ok(ear('hare') > ear('rabbit') * 1.2 && ear('fat') < ear('rabbit') * 0.8);
  assert.ok(A.spriteDef('mob.fat.body').w > A.spriteDef('mob.rabbit.body').w * 1.2);
  assert.ok(sizes.fat > sizes.rabbit);
});

test('набор художника: цвет, случайность, контуры', () => {
  assert.deepEqual(K.rgb('#fa3'), [255, 170, 51, 1]);
  assert.deepEqual(K.rgb('#ff8040'), [255, 128, 64, 1]);
  assert.deepEqual(K.rgb('#ff804080').map((v) => Number(v.toFixed(2))), [255, 128, 64, 0.5]);
  assert.deepEqual(K.rgb('rgba(1, 2, 3, 0.25)'), [1, 2, 3, 0.25]);
  for (const bad of ['', 'red', '#12', '#xyzxyz', 'rgb(1,2)', null, undefined, NaN]) assert.throws(() => K.rgb(bad), /не цвет/);
  assert.equal(K.mix('#000000', '#ffffff', 0.5), '#808080');
  assert.equal(K.mix('#102030', '#ffffff', 0), '#102030');
  assert.equal(K.mix('#102030', '#ffffff', 7), '#ffffff', 'доля смеси не выходит за 0…1');
  assert.ok(validColor(K.mix('rgba(0,0,0,0.5)', '#ffffff', 0.5)));
  assert.equal(K.alpha('#ff0000', 0.5), 'rgba(255,0,0,0.5)');
  assert.equal(K.alpha('rgba(10,20,30,0.5)', 0.5), 'rgba(10,20,30,0.25)');
  const lum = (c) => K.rgb(c).slice(0, 3).reduce((s, v) => s + v, 0);
  for (const c of ['#f0862b', '#7cc45a', '#b8a48f', '#4aa3ff', '#fff1dc', '#4a2a1c']) {
    assert.ok(lum(K.lighten(c)) > lum(c) && lum(K.darken(c)) < lum(c), c);
    // обводка — тёмный тон той же краски: темнее заливки, но не чёрная
    const line = K.outline(c);
    assert.ok(lum(line) < lum(c) && lum(line) > lum(K.INK) && validColor(line), c);
    const look = K.tone(c);
    for (const key of ['fill', 'light', 'dark', 'line']) assert.ok(validColor(look[key]), `${c}: ${key}`);
    assert.ok(look.lw > 0 && lum(look.light) > lum(look.dark));
  }
  assert.equal(K.tone('#123456', { line: '#000000', lw: 0 }).lw, 0);
  // свет — слева сверху
  assert.ok(K.LIGHT[0] < 0 && K.LIGHT[1] < 0 && Math.abs(Math.hypot(...K.LIGHT) - 1) < 0.01);

  const a = K.rand(7);
  const b = K.rand(7);
  const c = K.rand(8);
  const xs = [a(), a(), a()];
  assert.deepEqual(xs, [b(), b(), b()]);
  assert.notDeepEqual(xs, [c(), c(), c()]);
  for (const v of xs) assert.ok(v >= 0 && v < 1);
  assert.equal(K.hash2(3, 9), K.hash2(3, 9));
  assert.notEqual(K.hash2(3, 9), K.hash2(9, 3));

  assert.equal(K.num(NaN, 5), 5);
  assert.equal(K.num('7', 5), 5);
  assert.equal(K.num(-0.5, 5), -0.5);
  assert.equal(K.smooth(-1), 0);
  assert.equal(K.smooth(2), 1);
  assert.ok(K.backOut(0.7) > 1 && Math.abs(K.backOut(1) - 1) < 1e-9 && Math.abs(K.bump(0.5) - 1) < 1e-9 && K.bump(3) < 1e-9);

  // контуры возвращают рамку, в которую попадает всё нарисованное
  const within = (name, draw, box) => {
    const canvas = fakeCanvas(200, 200);
    const g = canvas.getContext('2d');
    g.translate(100, 100);
    g.beginPath();
    const got = draw(g);
    g.fill();
    assert.ok(got.every(Number.isFinite), name);
    const [x0, y0, x1, y1] = canvas.log.box.map((v) => v - 100);
    assert.ok(x0 >= got[0] - 1.2 && y0 >= got[1] - 1.2 && x1 <= got[2] + 1.2 && y1 <= got[3] + 1.2, `${name}: контур шире своей рамки`);
    if (box) assert.ok(Math.abs(x0 - box[0]) < 0.8 && Math.abs(y0 - box[1]) < 0.8 && Math.abs(x1 - box[2]) < 0.8 && Math.abs(y1 - box[3]) < 0.8, `${name}: ${[x0, y0, x1, y1].map((v) => v.toFixed(1))}`);
  };
  within('эллипс', (g) => K.pathEllipse(g, 2, 3, 10, 6), [-8, -3, 12, 9]);
  within('яйцо', (g) => K.pathEgg(g, 0, 0, 10, 6, 0, 0.2), [-10, -6.6, 10, 6.6]);
  within('капсула', (g) => K.pathCapsule(g, -10, 0, 4, 10, 2, 2), [-14, -4, 12, 4]);
  within('капсула-круг', (g) => K.pathCapsule(g, 0, 0, 6, 1, 0, 2), [-6, -6, 6, 6]);
  within('лист', (g) => K.pathLeaf(g, -8, 0, 8, 0, 6));
  within('звезда', (g) => K.pathStar(g, 0, 0, 9), [-8.6, -9, 8.6, 7.3]);
  within('клякса', (g) => K.pathBlob(g, [[-8, 0], [0, -6], [8, 0, 1], [0, 6]]));
  // клочья меха: n зубцов, острия — снаружи (слева от хода)
  const fur = K.tufts(0, 0, 12, 0, 3, 2);
  assert.equal(fur.filter((p) => p[2]).length, 5, 'три острия и две впадины');
  assert.ok(Math.min(...fur.map((p) => p[1])) < -1.9 && Math.max(...fur.map((p) => p[1])) <= 0);
  const ring = K.tuftsArc(0, 0, 10, 0, Math.PI, 4, 2);
  assert.ok(Math.max(...ring.map((p) => Math.hypot(p[0], p[1]))) > 11.9);
});

test('объём: форма красится основой, светом и тенью, обводка — последней; пятно не вылезает за форму', () => {
  const canvas = fakeCanvas(120, 120);
  const g = canvas.getContext('2d');
  g.translate(60, 60);
  const look = K.tone('#f0862b', { light: '#ffb057', dark: '#c4601a' });
  K.blob(g, [[-20, 0], [0, -14], [20, 0], [0, 14]], look, {
    over(c, patch) {
      patch([[-40, 4], [40, 4], [40, 40], [-40, 40]], '#fff1dc');
      K.blush(c, 0, 0, 5);
    },
  });
  const { log } = canvas;
  assert.equal(log.balance, 0);
  for (const c of log.colors) assert.ok(validColor(c), c);
  assert.ok(log.colors.has('#f0862b') && log.colors.has(look.line) && log.colors.has('#fff1dc'));
  // всё закрашенное — в пределах формы и её обводки
  const [x0, y0, x1, y1] = log.box.map((v) => v - 60);
  assert.ok(x0 > -23 && x1 < 23 && y0 > -17 && y1 < 17, `${[x0, y0, x1, y1].map((v) => v.toFixed(1))}`);
  // составная форма: линия идёт первой и вдвое толще
  const widths = [];
  const two = fakeCanvas(120, 120);
  const g2 = new Proxy(two.getContext('2d'), {
    set(target, key, value) {
      if (key === 'lineWidth') widths.push(value);
      target[key] = value;
      return true;
    },
  });
  K.solid(g2, (c) => {
    c.moveTo(34, 30);
    c.arc(30, 30, 4, 0, K.TAU);
    c.moveTo(40, 30);
    c.arc(36, 30, 4, 0, K.TAU);
    return [26, 26, 40, 34];
  }, K.tone('#58b84e', { lw: 1 }), { union: true });
  assert.deepEqual(widths, [2]);
  // глаза всех видов рисуются
  const eyes = fakeCanvas(200, 40);
  const ge = eyes.getContext('2d');
  ['round', 'prey', 'narrow', 'closed', 'happy', 'cross', 'squint', 'wide'].forEach((kind, i) => K.eye(ge, 12 + i * 22, 20, 5, { kind, brow: '#221613', lid: 0.4, slant: 0.2 }));
  assert.ok(eyes.log.paints >= 16);
  assert.ok(eyes.log.box[0] >= 0 && eyes.log.box[2] <= 200 && eyes.log.box[1] >= 8 && eyes.log.box[3] <= 32);
});
