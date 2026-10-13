// Фигуры пещер, зубастый сундук, три хозяина (медведь, лось, паучиха) и две напасти — без браузера. Общие проверки
// (рамки картинок, NaN, зеркало, вспышка) делает art.test.js для всех файлов рисунков разом; здесь — то, что игрок
// читает в позах (06-acts): замах виден и не похож на стойку, медведь встаёт на дыбы с лапой над головой, лось
// опускает рога, крот под землёй — один холмик, спящий сундук — тот самый сундук, лапа бьёт на середине.
// Как всё это выглядит — смотреть глазами: tools/fox-hunt-sheet.html.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../art.js';
import '../art-all.js';
import { RIG_INFO as INFO1 } from '../art-mobs.js';
import { RIG_INFO as INFO2 } from '../art-mobs2.js';
import { fakeCanvas } from './fake-canvas.js';

const RIG_INFO = { ...INFO1, ...INFO2 };
const K = 1;
const AT = [400, 300];
const art = A.createArt(K, fakeCanvas);
const names = new Map();              // холст заготовки → «ключ ·вариант»
for (const key of A.spriteKeys().filter((name) => /^(mob|shot|haz)\.|^thing\.chest$|^fx\.shadow$/.test(name))) {
  for (let v = 0; v < A.spriteDef(key).variants; v++) names.set(art.sprite(key, v).c, `${key} ·${v}`);
}

const POSE = { t: 0.4, act: 'idle', k: 0, speed: 1, vx: 1, vy: 0, z: 0, flash: 0, hp: 1, elite: false, aim: 0, data: null };

/**
 * Нарисовать фигуру в позе и вернуть её части по порядку: name — «ключ ·вариант», x, y — где сустав (единицы мира от
 * точки привязки), rot — поворот, sx, sy — растяжение, alpha, box — рамка закрашенного, m — преобразование.
 */
function pose(id, a = {}, dir = 1) {
  const frame = fakeCanvas(800, 600);
  assert.equal(art.rig(frame.getContext('2d'), id, AT[0], AT[1], dir, { ...POSE, ...a }), true, `нет фигуры «${id}»`);
  return frame.log.images.map((d) => {
    const ink = d.img.log.box;
    const u0 = d.x + (ink[0] / d.img.width) * d.w;
    const u1 = d.x + (ink[2] / d.img.width) * d.w;
    const v0 = d.y + (ink[1] / d.img.height) * d.h;
    const v1 = d.y + (ink[3] / d.img.height) * d.h;
    const p = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map(([x, y]) => [(d.m[0] * x + d.m[2] * y + d.m[4] - AT[0]) / K, (d.m[1] * x + d.m[3] * y + d.m[5] - AT[1]) / K]);
    return {
      name: names.get(d.img) ?? '?',
      m: d.m,
      x: (d.m[4] - AT[0]) / K,
      y: (d.m[5] - AT[1]) / K,
      rot: Math.atan2(d.m[1], d.m[0]),
      sx: Math.hypot(d.m[0], d.m[1]) / K,
      sy: Math.hypot(d.m[2], d.m[3]) / K,
      alpha: d.alpha,
      box: [Math.min(...p.map((q) => q[0])), Math.min(...p.map((q) => q[1])), Math.max(...p.map((q) => q[0])), Math.max(...p.map((q) => q[1]))],
    };
  });
}
const extent = (parts) => [Math.min(...parts.map((p) => p.box[0])), Math.min(...parts.map((p) => p.box[1])),
  Math.max(...parts.map((p) => p.box[2])), Math.max(...parts.map((p) => p.box[3]))];
const all = (parts, name) => parts.filter((p) => p.name.startsWith(name));
const one = (parts, name) => {
  const p = parts.find((q) => q.name.startsWith(name));
  assert.ok(p, `нет части «${name}» среди ${parts.map((q) => q.name).join(', ')}`);
  return p;
};
const has = (parts, name) => parts.some((p) => p.name.startsWith(name));
const keys = (parts) => parts.map((p) => p.name.split(' ')[0]);
/** Точка картинки (в осях её сустава) → где она в осях фигуры. */
const at = (p, lx, ly) => [(p.m[0] * lx + p.m[2] * ly + p.m[4] - AT[0]) / K, (p.m[1] * lx + p.m[3] * ly + p.m[5] - AT[1]) / K];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
/** Та же ли это поза: все части стоят точка в точку. */
function same(a, b, label) {
  assert.deepEqual(a.map((p) => p.name), b.map((p) => p.name), label);
  for (let i = 0; i < a.length; i++) assert.ok(a[i].m.every((v, j) => Math.abs(v - b[i].m[j]) < 1e-6) && a[i].alpha === b[i].alpha, `${label}: ${a[i].name}`);
}

const COMMON = ['spawn', 'idle', 'move', 'windup', 'attack', 'recover', 'stun', 'hurt'];
// размеры из 06-acts (ширина × высота) и позы сверх общих
const SPEC = {
  bat: [20, 14, []], spider: [26, 20, ['leap']], mole: [22, 22, ['burrow', 'emerge', 'dig']], beetle: [30, 22, []], mimic: [34, 30, ['sleep', 'reveal']],
  bear: [86, 78, ['tired', 'dead', 'charge', 'roar']], moose: [100, 92, ['tired', 'dead', 'charge', 'stomp']],
  spiderqueen: [100, 74, ['tired', 'dead', 'cast', 'drop', 'summon']],
};

test('восемь фигур и две напасти на месте: позы — по списку 06-acts, размер — около заданного', () => {
  for (const [id, [w, h, extra]] of Object.entries(SPEC)) {
    assert.ok(A.hasRig(id), `нет фигуры «${id}»`);
    assert.deepEqual([...RIG_INFO[id].acts].sort(), [...COMMON, ...extra].sort(), `${id}: позы`);
    const b = extent(pose(id, { t: 1 }));
    const [gw, gh] = [b[2] - b[0], b[3] - b[1]];
    // высота — близко к заданной; в ширину идут ещё крылья, рога и лапы (медведь на четырёх ниже своей рамки — она с дыбами)
    assert.ok(gh > h * 0.75 && gh < h * 1.3, `${id}: высота ${gh.toFixed(1)} при заданной ${h}`);
    assert.ok(gw > w * 0.8 && gw < w * 1.65, `${id}: ширина ${gw.toFixed(1)} при заданной ${w}`);
    // стоит на земле: низ фигуры — у точки привязки (летучую мышь поднимает рендер; у крота под ней край холмика)
    assert.ok(b[3] > (id === 'bat' ? -4 : -1.5) && b[3] < (id === 'mole' ? 4.6 : 3.8), `${id}: низ фигуры на ${b[3].toFixed(1)}`);
    assert.ok(RIG_INFO[id].shadow > 0 && RIG_INFO[id].w >= gw && RIG_INFO[id].h >= gh, `${id}: рамка в RIG_INFO меньше самой фигуры`);
  }
  assert.deepEqual(RIG_INFO['haz.moose'].acts, ['run']);
  assert.deepEqual(RIG_INFO['haz.paw'].acts, ['strike']);
  assert.equal(RIG_INFO['haz.paw'].shadow, 0, 'тень лапы растёт вместе с ней — её рисует сама фигура');
  const run = extent(pose('haz.moose', { act: 'run', t: 1 }));
  assert.ok(run[2] - run[0] > 84 * 0.8 && run[2] - run[0] < 84 * 1.3 && run[3] - run[1] > 70 * 0.75 && run[3] - run[1] < 70 * 1.3, 'бегущий лось: размер');
});

test('появление из метки: фигура вырастает от точки привязки и проявляется', () => {
  for (const id of Object.keys(SPEC)) {
    const start = pose(id, { act: 'spawn', k: 0 });
    const end = pose(id, { act: 'spawn', k: 1 });
    const idle = pose(id, { act: 'idle' });
    assert.ok(start.every((p) => p.alpha === 0), `${id}: в начале не видна`);
    const [a, b] = [extent(start), extent(idle)];
    assert.ok(a[3] - a[1] < (b[3] - b[1]) * 0.5, `${id}: в начале мала`);
    same(end, idle, `${id}: в конце появления — обычная стойка`);
  }
});

test('летучая мышь: машет крыльями, перед броском вскидывает их и раскрывает пасть, в броске складывает', () => {
  const of = (act, more = {}) => pose('bat', { act, t: 1, ...more });
  assert.deepEqual(keys(of('idle')), ['mob.bat.wing', 'mob.bat.wing', 'mob.bat.body']);
  // взмах: ближнее крыло то выше, то ниже плеча; дальнее — его зеркало
  const tilts = [0, 0.05, 0.1, 0.15, 0.2, 0.25].map((t) => of('idle', { t })[1].rot);
  assert.ok(Math.max(...tilts) > 0.4 && Math.min(...tilts) < -0.4, `крыло не машет: ${tilts.map((r) => r.toFixed(2))}`);
  const idle = of('idle', { t: 0 });
  assert.ok(Math.abs(at(idle[0], 9.8, -1.6)[0] + at(idle[1], 9.8, -1.6)[0]) < 1.5, 'крылья раскинуты в обе стороны');
  // замах: концы крыльев — над головой, пасть раскрыта, сама подалась назад
  for (const t of [0, 0.31, 0.77, 2.2]) {
    const up = of('windup', { k: 1, t });
    const body = one(up, 'mob.bat.body');
    assert.equal(body.name, 'mob.bat.body ·1');
    assert.ok(at(up[1], 9.8, -1.6)[1] < body.y - 4 && at(up[0], 9.8, -1.6)[1] < body.y - 4, `замах t=${t}: крылья не вскинуты`);
    assert.ok(body.x < -1.5, 'замах: не отошла назад');
  }
  // бросок: крылья сложены (уже), тело вытянуто
  const dart = of('attack', { k: 0.4 });
  assert.ok(dart[1].sx < 0.75 && one(dart, 'mob.bat.body').sx > 1.1, 'бросок: крылья не сложены или тело не вытянуто');
  assert.equal(one(of('stun'), 'mob.bat.body').name, 'mob.bat.body ·3');
  assert.equal(one(of('hurt', { k: 0.2 }), 'mob.bat.body').name, 'mob.bat.body ·2');
});

test('паук и королева: восемь лап стоят на земле, перед ударом передние вскинуты; королева — тот же паук вчетверо больше', () => {
  for (const [id, u] of [['spider', 1], ['spiderqueen', 3.7]]) {
    const of = (act, more = {}) => pose(id, { act, t: 1, ...more });
    const idle = of('idle');
    assert.deepEqual(keys(idle), [...Array(4).fill(`mob.${id}.leg`), `mob.${id}.body`, ...Array(4).fill(`mob.${id}.leg`)], `${id}: порядок частей`);
    const legs = all(idle, `mob.${id}.leg`);
    assert.deepEqual(legs.map((p) => p.name.slice(-1)), ['1', '1', '1', '1', '0', '0', '0', '0'], `${id}: дальние лапы — за телом`);
    // стопа — на (10.4, 7) картинки лапы: у всех восьми она у земли, четыре впереди и четыре позади
    const feet = legs.map((p) => at(p, 10.4 * u, 7 * u));
    for (const f of feet) assert.ok(Math.abs(f[1]) < 1.6 * u, `${id}: стопа на высоте ${f[1].toFixed(1)}`);
    assert.equal(feet.filter((f) => f[0] > 0).length, 4);
    assert.equal(feet.filter((f) => f[0] < 0).length, 4);
    // колени — выше спины
    const body = one(idle, `mob.${id}.body`);
    assert.ok(Math.min(...legs.map((p) => at(p, 4.4 * u, -11.2 * u)[1])) < body.box[1] - 0.5 * u, `${id}: колени не выше тела`);
    // идёт: стопы ходят вперёд-назад
    const step = [0, 0.1, 0.2, 0.3].map((t) => at(of('move', { t })[5], 10.4 * u, 7 * u)[0]);
    assert.ok(Math.max(...step) - Math.min(...step) > 1.5 * u, `${id}: лапы не шагают`);
    // замах: тело задрано, передние лапы (две дальние и две ближние) оторваны от земли, жвалы раскрыты
    const up = of('windup', { k: 1 });
    assert.equal(one(up, `mob.${id}.body`).name, `mob.${id}.body ·1`);
    assert.ok(one(up, `mob.${id}.body`).rot < -0.25, `${id}: замах — тело не задрано`);
    for (const i of [0, 1, 5, 6]) assert.ok(at(up[i], 10.4 * u, 7 * u)[1] < -2.5 * u, `${id}: замах — передняя лапа ${i} на земле`);
    for (const i of [2, 3, 7, 8]) assert.ok(Math.abs(at(up[i], 10.4 * u, 7 * u)[1]) < 1.6 * u, `${id}: замах — задняя лапа ${i} не на земле`);
    // удар кончается стойкой
    same(of('attack', { k: 1 }), idle, `${id}: после удара — стойка`);
    assert.equal(one(of('stun'), `mob.${id}.body`).name, `mob.${id}.body ·3`);
  }
  // размер: всё у королевы — в 3,7 раза больше
  const [s, q] = [extent(pose('spider', { t: 1 })), extent(pose('spiderqueen', { t: 1 }))];
  assert.ok(Math.abs((q[2] - q[0]) / (s[2] - s[0]) - 3.7) < 0.25 && Math.abs((q[3] - q[1]) / (s[3] - s[1]) - 3.7) < 0.25);
  // прыжок паука: все лапы оторваны от земли
  const leap = pose('spider', { act: 'leap', k: 0.4, t: 1 });
  for (const p of all(leap, 'mob.spider.leg')) assert.ok(at(p, 10.4, 7)[1] < -1, 'прыжок: лапа на земле');
  // королева: выдохлась — брюхо у земли, к концу поднимается; повержена — лежит, лапы поджаты
  const of = (act, more = {}) => pose('spiderqueen', { act, t: 1, ...more });
  const idle = of('idle');
  const bodyY = (parts) => one(parts, 'mob.spiderqueen.body').y;
  assert.ok(bodyY(of('tired', { k: 0.5 })) > bodyY(idle) + 6, 'выдохлась: тело не осело');
  same(of('tired', { k: 1 }), idle, 'выдохлась: к концу — стойка');
  const dead = of('dead', { k: 1 });
  assert.equal(one(dead, 'mob.spiderqueen.body').name, 'mob.spiderqueen.body ·3');
  assert.ok(bodyY(dead) > bodyY(idle) + 9 && extent(dead)[2] - extent(dead)[0] < (extent(idle)[2] - extent(idle)[0]) * 0.95, 'повержена: не лежит или лапы не поджаты');
  const call = of('summon', { k: 0.5 });
  assert.ok(one(call, 'mob.spiderqueen.body').rot < -0.3 && at(call[5], 10.4 * 3.7, 7 * 3.7)[1] < -20, 'зовёт пауков: не на дыбах');
  same(of('summon', { k: 1 }), idle, 'зовёт пауков: к концу — стойка');
  assert.ok(all(of('drop', { k: 0 }), 'mob.spiderqueen.leg').every((p) => at(p, 10.4 * 3.7, 7 * 3.7)[1] < -10), 'падает: лапы поджаты');
});

test('крот: под землёй — один холмик; вылезает с камнем, замахивается, бросает и зарывается', () => {
  const of = (act, more = {}) => pose('mole', { act, t: 1, ...more });
  assert.deepEqual(of('burrow').map((p) => p.name), ['mob.mole.mound ·0']);
  const idle = of('idle');
  assert.deepEqual(idle.map((p) => p.name), ['mob.mole.mound ·1', 'mob.mole.body ·0', 'mob.mole.paw ·1', 'mob.mole.paw ·0', 'mob.mole.mound ·2']);
  // низ тела спрятан за передним краем норы
  assert.ok(one(idle, 'mob.mole.body').box[3] < one(idle, 'mob.mole.mound ·2').box[3]);
  // вылезает: сначала холмик закрыт и крота почти не видно, в конце — весь наверху, камень — над головой, в лапах
  const start = of('emerge', { k: 0.03 });
  const end = of('emerge', { k: 1 });
  assert.ok(one(start, 'mob.mole.mound ·0').alpha > 0.9 && (!has(start, 'mob.mole.body') || one(start, 'mob.mole.body').sy < 0.25));
  assert.ok(!has(end, 'mob.mole.mound ·0') && Math.abs(one(end, 'mob.mole.body').sy - 1) < 0.05);
  for (const parts of [end, of('windup', { k: 0 }), of('windup', { k: 1 })]) {
    const stone = one(parts, 'shot.stone');
    assert.ok(stone.y < one(parts, 'mob.mole.body').box[1] + 1, 'камень не над головой');
    for (const paw of all(parts, 'mob.mole.paw')) assert.ok(dist([paw.x, paw.y], [stone.x, stone.y]) < 5, 'лапа не у камня');
  }
  // замах: откинулся назад; бросок: подался вперёд, и камня в лапах уже нет
  assert.ok(one(of('windup', { k: 1 }), 'mob.mole.body').rot < -0.15);
  assert.equal(one(of('windup', { k: 1 }), 'mob.mole.body').name, 'mob.mole.body ·1');
  const thrown = of('attack', { k: 0.3 });
  assert.ok(one(thrown, 'mob.mole.body').rot > 0.2 && !has(thrown, 'shot.stone'));
  same(of('attack', { k: 1 }), idle, 'после броска — стойка');
  // зарывается: уходит вниз, холмик смыкается
  const dig = of('dig', { k: 0.5 });
  const gone = of('dig', { k: 1 });
  assert.ok(one(dig, 'mob.mole.body').sy < 0.75 && one(dig, 'mob.mole.body').sy > 0.15);
  assert.ok(!has(gone, 'mob.mole.body') && one(gone, 'mob.mole.mound ·0').alpha === 1 && all(gone, 'mob.mole.paw').every((p) => p.alpha === 0));
});

test('жук: щит с рогом — спереди, мягкая спина — сзади; перед тараном опускает рог', () => {
  const of = (act, more = {}) => pose('beetle', { act, t: 1, ...more });
  const idle = of('idle');
  assert.deepEqual(keys(idle), ['mob.beetle.leg', 'mob.beetle.leg', 'mob.beetle.leg', 'mob.beetle.back', 'mob.beetle.leg', 'mob.beetle.leg', 'mob.beetle.leg', 'mob.beetle.shield']);
  const shield = one(idle, 'mob.beetle.shield');
  const back = one(idle, 'mob.beetle.back');
  // щит закрывает жука спереди во весь рост, спина торчит сзади
  assert.ok(shield.box[2] > back.box[2] + 8 && back.box[0] < shield.box[0] - 8, 'щит не спереди');
  assert.ok(shield.box[1] <= back.box[1] && shield.box[3] >= back.box[3] - 1.5, 'щит ниже спины');
  for (const leg of all(idle, 'mob.beetle.leg')) assert.ok(Math.abs(at(leg, 1.6, 5.6)[1]) < 1, 'лапка не на земле');
  // замах: рог (его кончик — на (13.8, −13) картинки щита) опущен и смотрит вперёд
  const horn = (parts) => at(one(parts, 'mob.beetle.shield'), 13.8, -13);
  for (const k of [0, 1]) {
    const down = of('windup', { k });
    assert.equal(one(down, 'mob.beetle.shield').name, 'mob.beetle.shield ·1');
    assert.ok(one(down, 'mob.beetle.shield').rot > shield.rot + 0.35, 'замах: щит не наклонён');
    assert.ok(horn(down)[1] > horn(idle)[1] + 6, `замах: рог не опущен (${horn(down)[1].toFixed(1)} против ${horn(idle)[1].toFixed(1)})`);
  }
  // таран: лапки мелькают, рог впереди
  const turns = [0, 0.03, 0.06, 0.09].map((t) => of('attack', { k: 0.5, t })[4].rot);
  assert.ok(Math.max(...turns) - Math.min(...turns) > 0.5, 'таран: лапки не бегут');
  assert.ok(horn(of('attack', { k: 0.5 }))[0] > horn(idle)[0] + 2);
  assert.equal(one(of('stun'), 'mob.beetle.shield').name, 'mob.beetle.shield ·3');
});

test('зубастый сундук: спит — тот самый сундук; просыпается — крышка распахивается в пасть; щёлкает', () => {
  const of = (act, more = {}) => pose('mimic', { act, t: 1, ...more });
  // спит: одна картинка — сундук из комнаты, точка в точку там же, где его ставит рендер
  const asleep = of('sleep');
  assert.deepEqual(asleep.map((p) => p.name), ['thing.chest ·0']);
  assert.ok(Math.abs(asleep[0].x) < 1e-9 && Math.abs(asleep[0].y) < 1e-9 && asleep[0].rot === 0 && asleep[0].sx === 1);
  // ящик проснувшегося — того же размера и там же
  const idle = of('idle');
  assert.deepEqual(keys(idle), ['mob.mimic.maw', 'mob.mimic.lid', 'mob.mimic.base']);
  const [chest, awake] = [asleep[0].box, extent(idle)];
  assert.ok(Math.abs(chest[0] - one(idle, 'mob.mimic.base').box[0]) < 1.5 && Math.abs(chest[2] - one(idle, 'mob.mimic.base').box[2]) < 1.5 && Math.abs(chest[3] - awake[3]) < 1.5);
  const gape = (parts) => -one(parts, 'mob.mimic.lid').rot;
  assert.ok(gape(idle) > 0.05 && gape(idle) < 0.3, 'стойка: пасть приоткрыта');
  // нутро пасти не торчит треугольником: его дальние углы лежат на кромке крышки и на краю ящика и до их концов не доходят
  for (const [act, k] of [['windup', 1], ['reveal', 0.4], ['recover', 0.2], ['stun', 0], ['move', 0]]) {
    const parts = of(act, { k });
    const maw = one(parts, 'mob.mimic.maw');
    const lid = one(parts, 'mob.mimic.lid');
    const hinge = [lid.x, lid.y];
    const tip = at(lid, 29.2, 0.6);                              // передний нижний угол крышки
    const [up, down] = [at(maw, 19, -5.35), at(maw, 19, 5.35)];
    assert.ok(dist(up, hinge) < dist(tip, hinge) * 0.85 && dist(down, hinge) < dist(tip, hinge) * 0.85, `${act}: нутро пасти длиннее челюстей`);
    const off = Math.abs((tip[0] - hinge[0]) * (up[1] - hinge[1]) - (tip[1] - hinge[1]) * (up[0] - hinge[0])) / dist(tip, hinge);
    assert.ok(off < 1.5 && Math.abs(down[1] - hinge[1]) < 1.5, `${act}: нутро пасти не по челюстям (${off.toFixed(1)}, ${(down[1] - hinge[1]).toFixed(1)})`);
  }
  // пробуждение: сперва закрыт, потом нараспашку, к концу — стойка
  assert.ok(gape(of('reveal', { k: 0 })) < 0.02);
  assert.ok(gape(of('reveal', { k: 0.4 })) > 0.9);
  same(of('reveal', { k: 1 }), idle, 'пробуждение кончается стойкой');
  // замах: пасть нараспашку, язык наружу; щелчок: захлопнута в первой пятой
  for (const k of [0, 1]) {
    const open = of('windup', { k });
    assert.ok(gape(open) > 0.7 && has(open, 'mob.mimic.tongue') && has(open, 'mob.mimic.maw'), 'замах: пасть не раскрыта');
  }
  const snap = of('attack', { k: 0.2 });
  assert.ok(gape(snap) < 0.03 && !has(snap, 'mob.mimic.maw') && one(snap, 'mob.mimic.base').x > 2, 'щелчок: пасть не захлопнулась');
  same(of('attack', { k: 1 }), idle, 'после щелчка — стойка');
  // скачет
  const hops = [0, 0.1, 0.2, 0.3, 0.4].map((t) => one(of('move', { t }), 'mob.mimic.base').y);
  assert.ok(Math.min(...hops) < -4 && Math.max(...hops) > -1.5, `не скачет: ${hops.map((y) => y.toFixed(1))}`);
  assert.equal(one(of('stun'), 'mob.mimic.lid').name, 'mob.mimic.lid ·2');
});

test('медведь: перед ударом встаёт на дыбы с лапой над головой, бьёт всей тушей вниз; ревёт, бежит, выдыхается', () => {
  const of = (act, more = {}) => pose('bear', { act, t: 1, ...more });
  const idle = of('idle');
  assert.deepEqual(idle.map((p) => p.name), ['mob.bear.tail ·0', 'mob.bear.leg ·1', 'mob.bear.leg ·1', 'mob.bear.body ·0', 'mob.bear.leg ·0', 'mob.bear.leg ·0', 'mob.bear.head ·0']);
  const head = (parts) => one(parts, 'mob.bear.head');
  for (const k of [0, 0.5, 1]) {
    const up = of('windup', { k });
    // на дыбах: туша почти стоймя, голова намного выше, чем на четырёх лапах
    assert.ok(one(up, 'mob.bear.body').rot < -0.6, 'замах: не на дыбах');
    assert.ok(head(up).y < head(idle).y - 20, `замах: голова на ${head(up).y.toFixed(1)}, в стойке — ${head(idle).y.toFixed(1)}`);
    assert.equal(head(up).name, 'mob.bear.head ·1');
    // занесённая лапа рисуется последней — поверх головы — и её когти выше макушки
    const arm = up.at(-1);
    assert.equal(arm.name, 'mob.bear.leg ·0');
    assert.ok(arm.box[1] < head(up).box[1] + 3, `замах: лапа не над головой (${arm.box[1].toFixed(1)} против ${head(up).box[1].toFixed(1)})`);
    // задние лапы стоят на земле
    for (const leg of [up[1], up[4]]) assert.ok(Math.abs(at(leg, 0, 20)[1]) < 3, `замах: задняя лапа на высоте ${at(leg, 0, 20)[1].toFixed(1)}`);
  }
  // удар: к трети — туша внизу и подалась вперёд, пасть раскрыта; в конце — стойка
  const hit = of('attack', { k: 0.32 });
  assert.ok(one(hit, 'mob.bear.body').rot > 0 && head(hit).x > head(idle).x + 4 && head(hit).name === 'mob.bear.head ·2', 'удар: туша не обрушилась');
  same(of('attack', { k: 1 }), idle, 'после удара — стойка');
  // рёв: на дыбах, пасть раскрыта, от неё — дуги; к концу — стойка
  const roar = of('roar', { k: 0.5 });
  assert.ok(one(roar, 'mob.bear.body').rot < -0.5 && head(roar).name === 'mob.bear.head ·2' && all(roar, 'mob.bear.roar').length === 2);
  for (const arc of all(roar, 'mob.bear.roar')) assert.ok(arc.x > head(roar).x + 15, 'рёв: дуги не перед пастью');
  assert.ok(!has(idle, 'mob.bear.roar'));
  same(of('roar', { k: 1 }), idle, 'после рёва — стойка');
  // бежит напролом: лапы мелькают, скалится
  const run = [0, 0.05, 0.1, 0.15].map((t) => of('charge', { t })[4].rot);
  assert.ok(Math.max(...run) - Math.min(...run) > 0.5, 'бег: лапы не бегут');
  assert.equal(head(of('charge')).name, 'mob.bear.head ·1');
  // выдохся: осел, голова висит, язык наружу; к концу поднимается. Повержен — лежит
  const tired = of('tired', { k: 0.5 });
  assert.ok(head(tired).y > head(idle).y + 6 && head(tired).name === 'mob.bear.head ·4');
  same(of('tired', { k: 1 }), idle, 'выдохся: к концу — стойка');
  const dead = of('dead', { k: 1 });
  assert.ok(one(dead, 'mob.bear.body').y > one(idle, 'mob.bear.body').y + 9 && head(dead).name === 'mob.bear.head ·3');
});

test('лось: перед разбегом опускает рога и бьёт копытом, несётся с опущенной головой, топает', () => {
  const of = (act, more = {}) => pose('moose', { act, t: 1, ...more });
  const idle = of('idle');
  assert.deepEqual(idle.map((p) => p.name), ['mob.moose.tail ·0', 'mob.moose.leg ·1', 'mob.moose.leg ·1', 'mob.moose.body ·0', 'mob.moose.leg ·0', 'mob.moose.leg ·0', 'mob.moose.head ·0']);
  const head = (parts) => one(parts, 'mob.moose.head');
  // рога — выше всего остального, ноги — длиннее туловища в высоту
  assert.ok(head(idle).box[1] < one(idle, 'mob.moose.body').box[1] - 15);
  for (const k of [0, 1]) {
    const low = of('windup', { k });
    assert.ok(head(low).y > head(idle).y + 9 && head(low).rot > head(idle).rot + 0.3, 'замах: голова не опущена');
    assert.equal(head(low).name, 'mob.moose.head ·1');
  }
  // бьёт копытом: ближняя передняя нога ходит взад-вперёд
  const paw = [0, 0.1, 0.2, 0.3, 0.4].map((t) => of('windup', { k: 0.5, t })[5].rot);
  assert.ok(Math.max(...paw) - Math.min(...paw) > 0.4, 'замах: не бьёт копытом');
  // разбег: голова опущена, ноги мелькают
  const run = [0, 0.05, 0.1, 0.15].map((t) => of('charge', { t })[5].rot);
  assert.ok(Math.max(...run) - Math.min(...run) > 0.6 && head(of('charge')).rot > head(idle).rot + 0.3, 'разбег: не несётся');
  // взмах рогами: голова взлетает выше стойки; в конце — стойка
  assert.ok(head(of('attack', { k: 0.4 })).y < head(idle).y - 4 && head(of('attack', { k: 0.4 })).rot < -0.2, 'взмах рогами: голова не вскинута');
  same(of('attack', { k: 1 }), idle, 'после взмаха — стойка');
  // топает: копыто поднято до середины и к ней же бьёт оземь
  const hoof = (parts) => at(parts[5], 0, 36)[1];
  assert.ok(hoof(of('stomp', { k: 0.4 })) < -8, `топает: копыто на ${hoof(of('stomp', { k: 0.4 })).toFixed(1)}`);
  assert.ok(Math.abs(hoof(of('stomp', { k: 0.62 }))) < 3, 'топает: копыто не ударило');
  same(of('stomp', { k: 1 }), idle, 'после удара копытом — стойка');
  // запыхался и повержен
  assert.ok(head(of('tired', { k: 0.5 })).y > head(idle).y + 8 && head(of('tired', { k: 0.5 })).name === 'mob.moose.head ·4');
  same(of('tired', { k: 1 }), idle, 'запыхался: к концу — стойка');
  const dead = of('dead', { k: 1 });
  assert.ok(one(dead, 'mob.moose.body').y > one(idle, 'mob.moose.body').y + 18 && head(dead).name === 'mob.moose.head ·3');
  assert.ok(head(dead).box[3] < 9, 'повержен: голова ушла под землю');
});

test('напасти: лось несётся, опустив рога; лапа падает всё быстрее, бьёт на середине и тает', () => {
  // бегущий лось — те же картинки, что у хозяина, только меньше; в любой позе он бежит
  const run = pose('haz.moose', { act: 'run', t: 1 });
  assert.deepEqual(run.map((p) => p.name.split(' ')[0]), ['mob.moose.tail', 'mob.moose.leg', 'mob.moose.leg', 'mob.moose.body', 'mob.moose.leg', 'mob.moose.leg', 'mob.moose.head']);
  assert.ok(one(run, 'mob.moose.body').sx < one(pose('moose', { t: 1 }), 'mob.moose.body').sx * 0.85);
  const legs = [0, 0.05, 0.1, 0.15].map((t) => pose('haz.moose', { act: 'run', t })[5].rot);
  assert.ok(Math.max(...legs) - Math.min(...legs) > 0.6, 'лось не бежит');
  assert.ok(one(run, 'mob.moose.head').rot > 0.35, 'рога не опущены');
  same(pose('haz.moose', { act: 'idle', t: 1 }), run, 'бегущий лось бежит в любой позе');

  const paw = (k) => pose('haz.paw', { act: 'strike', k });
  assert.deepEqual(paw(0.3).map((p) => p.name), ['fx.shadow ·0', 'haz.paw.paw ·0']);
  const [high, mid, hit, held, away, gone] = [paw(0), paw(0.25), paw(0.5), paw(0.58), paw(0.85), paw(1)];
  // сначала её не видно, она высоко, тень мала
  assert.ok(high[1].alpha === 0 && high[1].y < -60 && high[0].sx < 1);
  // падает всё быстрее: за первую половину пути по времени — меньше половины пути по высоте
  assert.ok(mid[1].y < high[1].y * 0.6 && mid[1].y > high[1].y && mid[1].alpha > 0.5);
  // удар — на середине: лапа на земле, видна целиком, тень — больше всего; сразу после — расплющена
  assert.ok(hit[1].y === 0 && hit[1].alpha === 1 && hit[0].sx > 2 && hit[0].sx >= mid[0].sx);
  assert.ok(held[1].y === 0 && held[1].sy < 0.95 && held[1].sx > 1.03);
  // потом поднимается и тает
  assert.ok(away[1].y < -8 && away[1].alpha < 1 && gone[1].alpha === 0 && gone[0].alpha === 0);
  // лапа — на весь красный круг в ширину, с когтями
  const def = A.spriteDef('haz.paw.paw');
  assert.ok(def.w > 60 && def.h > 60);
});
