// Фигуры из art-mobs3.js без браузера: охотник, гончая, чёрный лис, пугало, филин-чародей, хозяева комнат и
// спутники лисы. Общие проверки (рамки картинок, NaN, зеркало, вспышка) делает art.test.js для всех файлов рисунков
// разом; здесь — то, что игрок читает в позах (06-acts): замах виден и не похож на стойку, ружьё смотрит туда,
// куда полетит пуля, рука охотника лежит на ружье, ступни стоят на земле, свой не выглядит врагом.
// Как всё это выглядит — смотреть глазами: tools/fox-hunt-sheet.html.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../art.js';
import '../art-all.js';
import { RIG_INFO } from '../art-mobs3.js';
import { fakeCanvas } from './fake-canvas.js';

const K = 1;
const AT = [400, 300];
const art = A.createArt(K, fakeCanvas);
const names = new Map();              // холст заготовки → «ключ ·вариант»
for (const key of A.spriteKeys().filter((name) => /^(mob|shot)\./.test(name))) {
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
/** Точка картинки (в осях её сустава) → где она в осях фигуры. */
const at = (p, lx, ly) => [(p.m[0] * lx + p.m[2] * ly + p.m[4] - AT[0]) / K, (p.m[1] * lx + p.m[3] * ly + p.m[5] - AT[1]) / K];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const colors = (key, v = 0) => art.sprite(key, v).c.log.colors;

const COMMON = ['spawn', 'idle', 'move', 'windup', 'attack', 'recover', 'stun', 'hurt'];
// размеры из 06-acts (ширина × высота) и позы сверх общих
const SPEC = {
  hunter: [26, 40, []], hound: [30, 22, ['leap']], darkfox: [34, 30, ['dash']], scarecrow: [30, 48, []],
  owl: [84, 80, ['tired', 'dead', 'cast', 'teleport', 'dive']],
  hedgie: [16, 12, ['roll']], owlet: [16, 16, []], cub: [22, 16, ['leap']], firefly: [10, 10, []], badger: [22, 16, []], squirrel: [16, 16, ['carry']],
};
const KEEPERS = { trader: [34, 36, ['idle', 'talk', 'happy']], raven: [30, 40, ['idle', 'talk', 'happy']], beaver: [36, 34, ['idle', 'talk', 'happy', 'work']] };

test('все четырнадцать фигур на месте: позы — по списку 06-acts, размер — около заданного', () => {
  for (const [id, [w, h, extra]] of Object.entries(SPEC)) {
    assert.ok(A.hasRig(id), `нет фигуры «${id}»`);
    assert.deepEqual([...RIG_INFO[id].acts].sort(), [...COMMON, ...extra].sort(), `${id}: позы`);
  }
  for (const [id, [, , acts]] of Object.entries(KEEPERS)) {
    assert.ok(A.hasRig(id), `нет фигуры «${id}»`);
    assert.deepEqual(RIG_INFO[id].acts, acts, `${id}: позы`);
  }
  for (const [id, [w, h]] of Object.entries({ ...SPEC, ...KEEPERS })) {
    // чёрный лис — «того же сложения», что лиса, а её размер задан без хвоста
    // и светлячок — без своего мягкого ореола
    const b = extent(pose(id, { t: 1 }).filter((p) => (id !== 'darkfox' || !p.name.includes('.tail')) && !p.name.startsWith('mob.firefly.glow')));
    const [gw, gh] = [b[2] - b[0], b[3] - b[1]];
    // высота — близко к заданной; в ширину идут ещё хвост, ружьё, крылья и рюкзак
    assert.ok(gh > h * 0.75 && gh < h * 1.3, `${id}: высота ${gh.toFixed(1)} при заданной ${h}`);
    assert.ok(gw > w * 0.8 && gw < w * 1.65, `${id}: ширина ${gw.toFixed(1)} при заданной ${w}`);
    // стоит на земле: низ фигуры — у точки привязки (летающих поднимает рендер; светлячок и сам висит над ней)
    assert.ok(b[3] > (id === 'firefly' ? -4 : -1.5) && b[3] < 3.8, `${id}: низ фигуры на ${b[3].toFixed(1)}`);
    assert.ok(RIG_INFO[id].shadow > 0 && RIG_INFO[id].w >= gw && RIG_INFO[id].h >= gh, `${id}: рамка в RIG_INFO меньше самой фигуры`);
  }
});

test('появление из метки: фигура вырастает от точки привязки и проявляется', () => {
  for (const id of Object.keys(SPEC)) {
    const start = pose(id, { act: 'spawn', k: 0 });
    const end = pose(id, { act: 'spawn', k: 1 });
    const idle = pose(id, { act: 'idle' });
    assert.ok(start.every((p) => p.alpha === 0), `${id}: в начале не видна`);
    const [a, b] = [extent(start), extent(idle)];
    assert.ok(a[3] - a[1] < (b[3] - b[1]) * 0.5, `${id}: в начале мала`);
    assert.equal(end.length, idle.length);
    for (let i = 0; i < end.length; i++) {
      assert.ok(end[i].m.every((v, j) => Math.abs(v - idle[i].m[j]) < 1e-6) && end[i].alpha === idle[i].alpha, `${id}: в конце появления — обычная стойка (${end[i].name})`);
    }
  }
});

test('охотник: несёт ружьё стволом вверх, целится по красной линии, руки — на ружье', () => {
  const of = (act, more = {}) => pose('hunter', { act, t: 1, ...more });
  const idle = of('idle');
  assert.deepEqual(idle.map((p) => p.name.split(' ')[0]), ['mob.hunter.leg', 'mob.hunter.arm', 'mob.hunter.leg', 'mob.hunter.body', 'mob.hunter.head', 'mob.hunter.gun', 'mob.hunter.arm']);
  assert.ok(one(idle, 'mob.hunter.gun').rot < -0.7, 'в стойке ствол смотрит вверх');
  // ближняя кисть — на рукояти, дальняя — на деревянном цевье (оно тянется на 11,6 вперёд от рукояти), в любой позе
  for (const [act, more] of [['idle', {}], ['move', {}], ['windup', { k: 0.5, aim: 0.7 }], ['attack', { k: 0.1, aim: -0.4 }], ['recover', { k: 0.2 }], ['stun', {}], ['hurt', { k: 0.1 }]]) {
    const parts = of(act, more);
    const gun = one(parts, 'mob.hunter.gun');
    const near = at(one(parts, 'mob.hunter.arm ·0'), 0.2, 8);
    const far = at(one(parts, 'mob.hunter.arm ·1'), 0.2, 8);
    assert.ok(dist(near, [gun.x, gun.y]) < 1.2, `${act}: ближняя рука мимо рукояти на ${dist(near, [gun.x, gun.y]).toFixed(1)}`);
    const c = Math.cos(gun.rot);
    const s = Math.sin(gun.rot);
    const along = (far[0] - gun.x) * c + (far[1] - gun.y) * s;          // где кисть в осях ружья: вдоль ствола и поперёк
    const across = -(far[0] - gun.x) * s + (far[1] - gun.y) * c;
    assert.ok(along > 2 && along < 11 && Math.abs(across) < 1.6, `${act}: дальняя рука мимо цевья (${along.toFixed(1)}, ${across.toFixed(1)})`);
    const low = Math.max(...all(parts, 'mob.hunter.leg').map((p) => p.box[3]));
    assert.ok(low > -1 && low < 2.6, `${act}: ступни не на земле (${low.toFixed(2)})`);
  }
  // замах: ствол — по углу удара (вид сбоку: от угла остаётся доля «вверх-вниз»), к выстрелу не ходит
  const barrel = (more) => one(of('windup', { k: 1, ...more }), 'mob.hunter.gun').rot;
  assert.ok(Math.abs(barrel({ aim: 0 })) < 1e-9 && Math.abs(barrel({ aim: 0.6 }) - 0.6) < 1e-9 && Math.abs(barrel({ aim: -0.6 }) + 0.6) < 1e-9);
  assert.ok(Math.abs(barrel({ aim: Math.PI - 0.6 }) - 0.6) < 1e-9, 'влево целится так же: отражение — забота рендера');
  assert.ok(Math.abs(barrel({ aim: 0.2, data: { a: -0.5 } }) + 0.5) < 1e-9, 'запомненный угол удара главнее того, что дал рендер');
  assert.ok(Math.abs(barrel({ aim: 1.5 })) <= 1.1 + 1e-9, 'ружьё не задирается выше головы');
  assert.equal(one(of('windup', { k: 0.5 }), 'mob.hunter.head').name, 'mob.hunter.head ·1', 'целится — один глаз закрыт');
  // приклад — у ближнего плеча
  const aim = of('windup', { k: 1, aim: 0.3 });
  assert.ok(dist(at(one(aim, 'mob.hunter.gun'), -7.6, 0), [one(aim, 'mob.hunter.arm ·0').x, one(aim, 'mob.hunter.arm ·0').y]) < 3, 'приклад у плеча');
  // огонёк на мушке разгорается только к выстрелу
  assert.ok(!has(of('windup', { k: 0.3 }), 'mob.hunter.glint') && has(of('windup', { k: 0.95 }), 'mob.hunter.glint'));
  // выстрел: вспышка у дула и отдача — ствол подбросило; к концу ружьё снова в руках, как в стойке
  const shot = of('attack', { k: 0.05, aim: 0.3 });
  const gun = one(shot, 'mob.hunter.gun');
  assert.ok(gun.rot < 0.3 - 0.2, 'отдача');
  assert.ok(dist([one(shot, 'mob.hunter.flash').x, one(shot, 'mob.hunter.flash').y], at(gun, 22.4, -1.1)) < 1e-6, 'вспышка — у дула');
  assert.ok(!has(of('attack', { k: 0.5 }), 'mob.hunter.flash'));
  for (const [act, k] of [['attack', 1], ['windup', 0], ['recover', 1]]) {
    const end = of(act, { k, aim: 0.3 });
    for (let i = 0; i < idle.length; i++) assert.ok(end[i].m.every((v, j) => Math.abs(v - idle[i].m[j]) < 1e-6), `${act} k=${k}: ${idle[i].name} не там, где в стойке, — поза дёрнется`);
  }
  // сбили прицел или оглушили — ружьё стволом вниз, в глазах крестики; больно — зажмурился
  assert.ok(one(of('recover', { k: 0.1 }), 'mob.hunter.gun').rot > 0.5 && one(of('stun'), 'mob.hunter.gun').rot > 0.5);
  assert.equal(one(of('stun'), 'mob.hunter.head').name, 'mob.hunter.head ·2');
  assert.equal(one(of('hurt', { k: 0.1 }), 'mob.hunter.head').name, 'mob.hunter.head ·3');
  // идёт: ноги ходят в противоход
  const legs = (t) => all(of('move', { t }), 'mob.hunter.leg').map((p) => p.rot);
  assert.ok(legs(1).some((v, i) => Math.abs(v - legs(1.12)[i]) > 0.2) && Math.abs(legs(1)[0] + legs(1)[1]) < 1e-9);
});

test('гончая: бежит на длинных лапах, припадает перед броском, в броске вытянута', () => {
  const of = (act, more = {}) => pose('hound', { act, t: 1, ...more });
  const idle = of('idle');
  assert.equal(idle.length, 7);
  const body = (parts) => one(parts, 'mob.hound.body');
  const head = (parts) => one(parts, 'mob.hound.head');
  const feet = (parts) => Math.max(...all(parts, 'mob.hound.leg').map((p) => p.box[3]));
  assert.ok(Math.abs(feet(idle)) < 1, `стоит на земле (${feet(idle).toFixed(2)})`);
  assert.ok(extent(all(idle, 'mob.hound.tail'))[1] < body(idle).y - 3, 'хвост прутом кверху');
  // замах: грудь у земли, голова ниже, оскал — и так всё время предупреждения
  for (const k of [0, 0.5, 1]) {
    const wind = of('windup', { k });
    assert.ok(body(wind).y > body(idle).y + 1.8 && body(wind).rot > 0.15, `замах k=${k}: припала на грудь`);
    assert.ok(head(wind).y > head(idle).y + 3, 'голова ниже');
    assert.equal(head(wind).name, 'mob.hound.head ·1');
  }
  // бросок: вытянута, лапы врозь, пасть раскрыта
  const leap = of('leap', { k: 0.4 });
  assert.ok(body(leap).sx > 1.15 && body(leap).sy < 0.92, `бросок: тело ${body(leap).sx.toFixed(2)}×${body(leap).sy.toFixed(2)}`);
  const turns = all(leap, 'mob.hound.leg').map((p) => p.rot);
  assert.ok(Math.min(...turns) < -0.6 && Math.max(...turns) > 0.6, 'лапы — вперёд и назад');
  assert.equal(head(leap).name, 'mob.hound.head ·2');
  // укус на месте — голова вперёд; отдых — язык наружу
  assert.ok(head(of('attack', { k: 0.3 })).x > head(idle).x + 3 && head(of('attack', { k: 0.1 })).name === 'mob.hound.head ·2');
  assert.equal(head(of('recover', { k: 0.3 })).name, 'mob.hound.head ·5');
  assert.equal(head(of('stun')).name, 'mob.hound.head ·3');
  assert.equal(head(of('hurt', { k: 0.1 })).name, 'mob.hound.head ·4');
  const run = (t) => all(of('move', { t }), 'mob.hound.leg').map((p) => p.rot);
  assert.ok(run(1).some((v, i) => Math.abs(v - run(1.08)[i]) > 0.3), 'в беге лапы ходят');
  // пятно, по которому её узнают: красный ошейник
  assert.ok(colors('mob.hound.body').has('#d8453a'));
});

test('чёрный лис: та же лиса в других красках — те же части и те же позы', () => {
  const same = (dark, fox, more = {}) => {
    const a = pose('darkfox', { act: dark, t: 1, ...more });
    const b = pose('fox', { act: fox, t: 1, ...more });
    assert.equal(a.length, 14);
    assert.deepEqual(a.map((p) => p.name.replace('darkfox', 'fox').split(' ')[0]), b.map((p) => p.name.split(' ')[0]));
    for (let i = 0; i < a.length; i++) assert.ok(a[i].m.every((v, j) => Math.abs(v - b[i].m[j]) < 1e-9), `${dark}: часть ${a[i].name} стоит не так, как у лисы в «${fox}»`);
  };
  same('idle', 'idle');
  same('move', 'run');
  same('dash', 'dash', { k: 0.5, vx: 0.6, vy: -0.8 });
  for (const aim of [0, 0.8, -0.8, 2.6]) same('windup', 'aim', { k: 0, aim });       // замах — лисья «пружина» перед рывком
  const of = (act, more = {}) => pose('darkfox', { act, t: 1, ...more });
  const body = (parts) => one(parts, 'mob.darkfox.body');
  assert.ok(body(of('windup', { k: 1 })).y > body(of('idle')).y + 2, 'перед рывком сжался');
  // чем ближе рывок, тем сильнее дрожит
  const shake = (k) => Math.max(...[1, 1.03, 1.06, 1.09].map((t) => body(of('windup', { k, t })).x)) - Math.min(...[1, 1.03, 1.06, 1.09].map((t) => body(of('windup', { k, t })).x));
  assert.ok(shake(0) < 1e-9 && shake(1) > 0.2);
  // запомненный угол рывка главнее угла от рендера
  assert.ok(Math.abs(one(of('windup', { aim: 0, data: { a: -0.9 } }), 'mob.darkfox.head').rot - one(of('windup', { aim: -0.9 }), 'mob.darkfox.head').rot) < 1e-9);
  const eyes = (act, more) => one(of(act, more), 'mob.darkfox.eye').name;
  assert.equal(eyes('windup'), 'mob.darkfox.eye ·1');
  assert.equal(eyes('dash', { k: 0.5 }), 'mob.darkfox.eye ·1');
  assert.equal(eyes('stun'), 'mob.darkfox.eye ·4');
  assert.equal(eyes('hurt', { k: 0.1 }), 'mob.darkfox.eye ·5');
  assert.equal(one(of('attack', { k: 0.1 }), 'mob.darkfox.head').name, 'mob.darkfox.head ·1', 'кусает — пасть раскрыта');
  // оглушён — осел: тело ниже, чем в стойке, но не лежит пластом
  assert.ok(body(of('stun')).y > body(of('idle')).y + 1 && body(of('stun')).y < body(pose('fox', { act: 'down', t: 1 }).map((p) => ({ ...p, name: p.name.replace('fox', 'darkfox') }))).y);
  // краски свои: шкура чёрно-лиловая, глаза жёлтые; у лисы — рыжая
  assert.ok(colors('mob.darkfox.body').has('#40365c') && !colors('mob.darkfox.body').has('#f0862b'));
  assert.ok(colors('mob.fox.body').has('#f0862b') && !colors('mob.fox.body').has('#40365c'));
  assert.ok(colors('mob.darkfox.eye', 0).has('#ffd23f') && colors('mob.darkfox.eye', 1).has('#ffd23f'));
});

test('пугало: вкопано, перед броском загораются глаза и рука с тыквой уходит назад', () => {
  const of = (act, more = {}) => pose('scarecrow', { act, t: 1, ...more });
  const idle = of('idle');
  assert.deepEqual(idle.map((p) => p.name), ['mob.scarecrow.post ·0', 'mob.scarecrow.arm ·1', 'mob.scarecrow.arm ·0', 'mob.scarecrow.body ·0', 'mob.scarecrow.head ·0']);
  // шест не сходит с места ни в одной позе, кроме «вернуться на место»
  for (const act of ['idle', 'windup', 'attack', 'recover', 'stun', 'hurt']) {
    for (const t of [0.3, 1, 2.7]) {
      const post = one(of(act, { t, k: 0.4 }), 'mob.scarecrow.post');
      assert.ok(Math.abs(post.x) < 1e-9 && Math.abs(post.y) < 1e-9, `${act}: шест сдвинулся`);
    }
  }
  assert.ok([0.1, 0.2, 0.3].some((t) => one(of('move', { t }), 'mob.scarecrow.post').y < -0.5), 'возвращается на место прыжками');
  const back = (parts) => one(parts, 'mob.scarecrow.arm ·1');
  // замах держится всё время предупреждения: рука вверх-назад, прорези горят, в руке тыква
  for (const k of [0.3, 0.6, 1]) {
    const wind = of('windup', { k });
    assert.ok(back(wind).rot > 0.6 && back(wind).rot < 1.3, `замах k=${k}: рука ${back(wind).rot.toFixed(2)}`);
    assert.equal(one(wind, 'mob.scarecrow.head').name, 'mob.scarecrow.head ·1');
    const pumpkin = one(wind, 'shot.pumpkin');
    assert.ok(pumpkin.sx > 0.99 && dist([pumpkin.x, pumpkin.y], at(back(wind), -12.6, 0)) < 2.5, 'тыква — в конце руки');
    assert.ok(pumpkin.y < one(wind, 'mob.scarecrow.body').y - 6 && pumpkin.x < -6, 'тыква — сзади и выше плеч');
  }
  assert.ok(one(of('windup', { k: 0.05 }), 'shot.pumpkin').sx < 0.3, 'тыква появляется в руке, а не возникает сразу');
  assert.ok(Math.abs(back(idle).rot) < 0.3 && !has(idle, 'shot.pumpkin'));
  // бросок: рука идёт через верх вперёд и возвращается; тыква уже летит (её рисует рендер)
  // поворот считается от −π/2: рука проходит через «прямо вперёд» (π), и угол не должен перескочить в минус
  const swing = [0, 0.1, 0.2, 0.3, 0.45].map((k) => (back(of('attack', { k })).rot + Math.PI * 2.5) % (Math.PI * 2) - Math.PI / 2);
  for (let i = 1; i < swing.length; i++) assert.ok(swing[i] >= swing[i - 1] - 1e-9, 'рука идёт вперёд без рывков назад');
  assert.ok(swing[0] > 0.9 && swing[3] > 2.9, `бросок: ${swing.map((v) => v.toFixed(2))}`);
  assert.ok(Math.abs(back(of('attack', { k: 1 })).rot - back(idle).rot) < 1e-9, 'к концу рука на месте');
  assert.ok(!has(of('attack', { k: 0.2 }), 'shot.pumpkin'));
  assert.equal(one(of('attack', { k: 0.2 }), 'mob.scarecrow.head').name, 'mob.scarecrow.head ·1');
  assert.equal(one(of('stun'), 'mob.scarecrow.head').name, 'mob.scarecrow.head ·2');
  assert.equal(one(of('hurt', { k: 0.1 }), 'mob.scarecrow.head').name, 'mob.scarecrow.head ·3');
  // горящие прорези — другая картинка, а не та же самая
  assert.ok(colors('mob.scarecrow.head', 1).has('#ffe98a') && !colors('mob.scarecrow.head', 0).has('#ffe98a'));
});

test('филин-чародей: машет крыльями, перед ударом вскидывает их, в пике складывает, исчезает в вихре перьев', () => {
  const of = (act, more = {}) => pose('owl', { act, t: 1, ...more });
  const wings = (parts) => [one(parts, 'mob.owl.wing ·0'), one(parts, 'mob.owl.wing ·1')];
  const head = (parts) => one(parts, 'mob.owl.head');
  const body = (parts) => one(parts, 'mob.owl.body');
  const idle = of('idle');
  assert.deepEqual(idle.map((p) => p.name.split(' ')[0]), ['mob.owl.wing', 'mob.owl.wing', 'mob.owl.body', 'mob.owl.staff', 'mob.owl.foot', 'mob.owl.foot', 'mob.owl.head', 'mob.owl.glow']);
  // крылья — зеркально, и машут
  const beat = [];
  for (let t = 0; t < 1; t += 0.05) {
    const [f, b] = wings(of('idle', { t }));
    assert.ok(Math.abs(f.rot + b.rot) < 1e-9, 'крылья машут зеркально');
    beat.push(f.rot);
  }
  assert.ok(Math.max(...beat) - Math.min(...beat) > 0.8, 'взмах заметен');
  // когти держат посох: он под самым брюхом
  const staff = one(idle, 'mob.owl.staff');
  assert.ok(all(idle, 'mob.owl.foot').every((f) => f.box[3] > staff.y && f.y < staff.y), 'лапы обхватывают посох');
  // замах: крылья вскинуты и почти не машут, камень разгорается, взгляд сердитый
  for (const k of [0, 0.5, 1]) {
    const wind = of('windup', { k });
    assert.ok(wings(wind)[0].rot < -0.5, `замах k=${k}: крылья вверх (${wings(wind)[0].rot.toFixed(2)})`);
    assert.equal(head(wind).name, 'mob.owl.head ·1');
    assert.ok(one(wind, 'mob.owl.staff').rot < -0.6, 'посох поднят камнем вверх');
  }
  const shine = (k) => one(of('windup', { k }), 'mob.owl.glow');
  assert.ok(shine(1).alpha > shine(0).alpha + 0.4 && shine(1).sx > shine(0).sx + 0.3, 'камень разгорается к удару');
  // сияние — на камне: в 25 единицах от хвата вдоль посоха
  for (const act of ['idle', 'windup', 'cast', 'attack']) {
    const parts = of(act, { k: 0.3 });
    assert.ok(dist([one(parts, 'mob.owl.glow').x, one(parts, 'mob.owl.glow').y], at(one(parts, 'mob.owl.staff'), 25, 0)) < 1e-6, `${act}: сияние не на камне`);
  }
  // веер перьев: крылья с размаху вниз
  assert.ok(wings(of('attack', { k: 0.3 }))[0].rot > 0.5 && wings(of('attack', { k: 0 }))[0].rot < -0.5);
  // колдует: звёзды у камня, глаза светятся
  const cast = of('cast', { k: 0.5 });
  assert.equal(all(cast, 'mob.owl.star').length, 3);
  assert.equal(head(cast).name, 'mob.owl.head ·2');
  assert.ok(!has(of('cast', { k: 0 }), 'mob.owl.star'));
  // исчезает и появляется: в середине филина нет, а вихрь перьев — есть
  const gone = of('teleport', { k: 0.5 });
  assert.ok(body(gone).alpha < 0.01 && body(gone).sx < 0.2);
  assert.equal(all(gone, 'mob.owl.feather').length, 8);
  assert.ok(all(gone, 'mob.owl.feather').every((f) => f.alpha > 0.9 && dist([f.x, f.y], [body(idle).x, body(idle).y]) > 12));
  for (const k of [0, 1]) assert.ok(body(of('teleport', { k })).alpha > 0.99 && body(of('teleport', { k })).sx > 0.9, 'до и после — на месте');
  // пике: головой вперёд, крылья сложены
  const dive = of('dive', { k: 0.5 });
  assert.ok(body(dive).rot > 0.9 && head(dive).x > body(dive).x + 10, 'в пике — головой вперёд');
  assert.ok(wings(dive).every((w) => w.sy < 0.75), 'крылья сложены');
  assert.ok(dist([body(dive).x, body(dive).y], [body(idle).x, body(idle).y]) < 3, 'поворот — вокруг середины тела, а не когтей');
  assert.ok(all(of('dive', { k: 1 }), 'mob.owl.foot').every((f) => f.rot < 0), 'к концу — когтями вперёд');
  // оглушён: сидит на земле, крылья повисли, в глазах крестики
  const stun = of('stun');
  assert.ok(wings(stun)[0].rot > 0.6 && head(stun).name === 'mob.owl.head ·3');
  const claws = Math.max(...all(stun, 'mob.owl.foot').map((f) => f.box[3]));
  assert.ok(claws > -1 && claws < 2.5, `оглушён — когти на земле (${claws.toFixed(2)})`);
  assert.equal(head(of('hurt', { k: 0.1 })).name, 'mob.owl.head ·4');
  assert.equal(head(of('tired', { k: 0.5 })).name, 'mob.owl.head ·5');
  assert.ok(head(of('tired', { k: 0.5 })).y > head(idle).y + 2, 'устал — висит ниже, голова опущена');
  for (const k of [0, 1]) assert.ok(Math.abs(body(of('tired', { k })).y - body(idle).y) < 1e-9, 'опускается и поднимается плавно');
  // повержен: заваливается, тает, перья разлетаются
  const dead = of('dead', { k: 0.6 });
  assert.ok(body(dead).rot < -0.8 && head(dead).name === 'mob.owl.head ·6' && all(dead, 'mob.owl.feather').length === 5);
  assert.ok(body(of('dead', { k: 1 })).alpha < 0.01 && body(of('dead', { k: 0 })).alpha === 1);
});

test('хозяева комнат: стоят на месте, кивают лисе, радуются сделке; бобёр куёт', () => {
  // барсук-торговец: барсучья голова в шапке, машет лапой
  const trader = (act, more = {}) => pose('trader', { act, t: 1, ...more });
  const idle = trader('idle');
  assert.deepEqual(idle.map((p) => p.name.split(' ')[0]), ['mob.trader.pack', 'mob.trader.arm', 'mob.trader.body', 'mob.badger.head', 'mob.trader.cap', 'mob.trader.arm']);
  const cap = one(idle, 'mob.trader.cap');
  const face = one(idle, 'mob.badger.head');
  assert.ok(cap.y < face.y - 4 && cap.box[3] > face.box[1] + 1 && Math.abs(cap.x - (face.box[0] + face.box[2]) / 2) < 6, 'шапка сидит на макушке');
  assert.ok(one(idle, 'mob.trader.pack').x < one(idle, 'mob.trader.body').x - 5, 'рюкзак — за спиной');
  const paw = (parts) => one(parts, 'mob.trader.arm ·0').rot;
  assert.ok(paw(trader('talk', { k: 0.5 })) < -1.5 && Math.abs(paw(trader('talk', { k: 0 })) - paw(idle)) < 1e-9 && Math.abs(paw(trader('talk', { k: 1 })) - paw(idle)) < 1e-9, 'машет лапой и опускает её');
  assert.equal(one(trader('talk', { k: 0.5 }), 'mob.badger.head').name, 'mob.badger.head ·5');
  const glad = trader('happy', { k: 0.25 });
  assert.ok(one(glad, 'mob.trader.body').y < one(idle, 'mob.trader.body').y - 1.5, 'радуется — подпрыгивает');
  assert.ok(all(glad, 'mob.trader.arm').every((p) => p.rot < -1), 'обе лапы вверх');
  // ворон: сидит на жёрдочке, каркает, хлопает крыльями
  const raven = (act, more = {}) => pose('raven', { act, t: 1, ...more });
  const sit = raven('idle');
  const perch = one(sit, 'mob.raven.perch');
  assert.ok(perch.x === 0 && perch.y === 0 && one(sit, 'mob.raven.body').box[3] > perch.box[1] - 0.5 && one(sit, 'mob.raven.body').box[3] < perch.box[1] + 5, 'сидит на жёрдочке');
  assert.ok(!has(sit, 'mob.raven.wing ·1'), 'дальнего крыла не видно, пока не машет');
  const caw = new Set();
  for (let k = 0; k <= 1; k += 0.05) caw.add(one(raven('talk', { k }), 'mob.raven.head').name);
  assert.deepEqual([...caw].sort(), ['mob.raven.head ·0', 'mob.raven.head ·1'], 'каркает: клюв раскрывается и закрывается');
  const flap = raven('happy', { k: 0.5 });
  assert.ok(has(flap, 'mob.raven.wing ·1') && one(flap, 'mob.raven.head').name === 'mob.raven.head ·2' && all(flap, 'mob.raven.spark').length === 2);
  assert.ok([0.1, 0.17, 0.5].some((k) => one(raven('happy', { k }), 'mob.raven.body').y < one(sit, 'mob.raven.body').y - 1), 'подпрыгивает');
  assert.ok(one(raven('happy', { k: 0.5 }), 'mob.raven.perch').y === 0, 'жёрдочка при этом стоит');
  // бобёр: молоток лежит на наковальне; за работой — три удара с искрами
  const beaver = (act, more = {}) => pose('beaver', { act, t: 1, ...more });
  const rest = beaver('idle');
  assert.deepEqual(rest.map((p) => p.name.split(' ')[0]), ['mob.beaver.stump', 'mob.beaver.tail', 'mob.beaver.body', 'mob.beaver.head', 'mob.beaver.hammer']);
  const stump = one(rest, 'mob.beaver.stump');
  const anvil = stump.box[1];
  const head = (parts) => at(one(parts, 'mob.beaver.hammer'), 0, 11.4);       // середина бойка
  assert.ok(Math.abs(head(rest)[0] - stump.x) < 2 && head(rest)[1] < anvil && head(rest)[1] > anvil - 5, `молоток лежит на наковальне (${head(rest).map((v) => v.toFixed(1))}, наковальня на ${anvil.toFixed(1)})`);
  let strikes = 0;
  let sparks = 0;
  let was = -9;
  for (let k = 0; k < 1; k += 0.01) {
    const parts = beaver('work', { k });
    const rot = one(parts, 'mob.beaver.hammer').rot;
    if (was > 1 && rot < 0) strikes += 1;                                    // был занесён — ударил
    was = rot > 1 ? rot : rot < 0 ? -9 : was;
    if (has(parts, 'mob.beaver.spark')) {
      sparks += 1;
      assert.ok(rot < -1.2, 'искры — только когда боёк на наковальне');
      assert.ok(dist([one(parts, 'mob.beaver.spark').x, one(parts, 'mob.beaver.spark').y], [stump.x, anvil]) < 2.5, 'искры — на наковальне');
    }
    assert.ok(Math.abs(one(parts, 'mob.beaver.stump').x - stump.x) < 1e-9, 'пень стоит');
  }
  assert.equal(strikes, 3, 'три удара');
  assert.ok(sparks > 20 && sparks < 50);
  assert.equal(one(beaver('happy', { k: 0.3 }), 'mob.beaver.head').name, 'mob.beaver.head ·5');
  assert.ok(one(beaver('talk', { k: 0.35 }), 'mob.beaver.tail').rot > one(rest, 'mob.beaver.tail').rot + 0.2, 'шлёпает хвостом');
  // незнакомая поза и «появление» хозяевам не страшны: стоят как обычно
  for (const id of ['trader', 'raven', 'beaver']) {
    const a = pose(id, { act: 'spawn', k: 0, t: 1 });
    const b = pose(id, { act: 'idle', t: 1 });
    assert.deepEqual(a.map((p) => [p.name, p.alpha]), b.map((p) => [p.name, p.alpha]), id);
  }
});

test('спутники лисы: маленькие, не похожи на врагов, у каждого — своё умение', () => {
  // платок — у тех, кого можно спутать с врагом
  for (const key of ['mob.hedgie.body', 'mob.cub.body', 'mob.badger.body', 'mob.squirrel.body', 'mob.hedgie.ball']) assert.ok(colors(key).has('#4aa3ff'), `${key}: нет голубого платка`);
  // и не крупнее врага того же вида
  const span = (id) => {
    const b = extent(pose(id, { t: 1 }));
    return b[2] - b[0];
  };
  assert.ok(span('cub') < span('wolf') * 0.7 && span('hedgie') < span('hedgehog') && span('owlet') < span('owl') * 0.4);

  // ёжик: катится клубком — одна картинка, и она вертится
  const roll = (t) => pose('hedgie', { act: 'roll', t });
  assert.deepEqual(roll(1).map((p) => p.name), ['mob.hedgie.ball ·0']);
  assert.ok(Math.abs(roll(1).at(0).rot - roll(1.05).at(0).rot) > 0.5 && Math.abs(roll(1).at(0).x) < 1e-9);
  const hog = pose('hedgie', { t: 1 });
  assert.equal(hog.length, 6);
  const paws = Math.max(...all(hog, 'mob.hedgie.foot').map((p) => p.box[3]));
  assert.ok(paws > -0.6 && paws < 1.2, `ёжик стоит на земле (${paws.toFixed(2)})`);
  const patter = (t) => all(pose('hedgie', { act: 'move', t }), 'mob.hedgie.foot').map((p) => p.x);
  assert.ok(patter(1).some((v, i) => Math.abs(v - patter(1.15)[i]) > 0.6), 'семенит');

  // совёнок: машет крыльями; бросает перо — переднее крыло идёт сверху вниз
  const owlet = (act, more = {}) => pose('owlet', { act, t: 1, ...more });
  assert.equal(owlet('idle').length, 5);
  const front = (parts) => one(parts, 'mob.owlet.wing ·0').rot;
  assert.ok(Math.abs(front(owlet('idle', { t: 1 })) - front(owlet('idle', { t: 1.08 }))) > 0.4, 'крылышки машут');
  assert.ok(front(owlet('windup', { k: 1 })) < -0.6 && front(owlet('attack', { k: 0.35 })) > 0.6, 'бросок: крыло сверху вниз');
  assert.equal(one(owlet('stun'), 'mob.owlet.body').name, 'mob.owlet.body ·3');

  // волчонок: моргает, перед прыжком припадает, в прыжке вытянут и с раскрытой пастью
  const cub = (act, more = {}) => pose('cub', { act, t: 1, ...more });
  const faces = new Set();
  for (let t = 0; t < 12; t += 0.05) faces.add(one(cub('idle', { t }), 'mob.cub.head').name);
  assert.deepEqual([...faces].sort(), ['mob.cub.head ·0', 'mob.cub.head ·6'], 'в стойке — спокоен и иногда моргает');
  assert.ok(one(cub('windup', { k: 1 }), 'mob.cub.body').y > one(cub('idle'), 'mob.cub.body').y + 1);
  const leap = cub('leap', { k: 0.4 });
  assert.ok(one(leap, 'mob.cub.body').sx > one(cub('idle'), 'mob.cub.body').sx * 1.15 && one(leap, 'mob.cub.head').name === 'mob.cub.head ·2');
  assert.ok(Math.abs(Math.max(...all(cub('idle'), 'mob.cub.leg').map((p) => p.box[3]))) < 1, 'волчонок стоит на земле');

  // светлячок: светится и мерцает; перед разрядом свет сжимается, в разряде — вспышка; оглушён — гаснет
  const fly = (act, more = {}) => pose('firefly', { act, t: 1, ...more });
  const lamp = (parts) => one(parts, 'mob.firefly.glow');
  const glows = [];
  for (let t = 0; t < 2; t += 0.1) glows.push(lamp(fly('idle', { t })).alpha);
  assert.ok(Math.min(...glows) > 0.25 && Math.max(...glows) - Math.min(...glows) > 0.3, 'свет мерцает, но не гаснет');
  assert.ok(lamp(fly('windup', { k: 1 })).sx < lamp(fly('windup', { k: 0 })).sx - 0.3 && lamp(fly('windup', { k: 1 })).alpha > 0.95);
  const zap = one(fly('attack', { k: 0.2 }), 'mob.firefly.zap');
  assert.ok(zap.alpha > 0.5 && zap.sx > 0.9 && !has(fly('idle'), 'mob.firefly.zap') && !has(fly('attack', { k: 1 }), 'mob.firefly.zap'));
  assert.ok(lamp(fly('stun')).alpha < 0.2);

  // барсучонок: бьёт когтями — лапа занесена над головой и идёт вниз
  const badger = (act, more = {}) => pose('badger', { act, t: 1, ...more });
  // где когти относительно плеча: выше него — лапа занесена
  const claw = (parts) => {
    const leg = all(parts, 'mob.badger.leg ·0').at(-1);
    return at(leg, 0, 7)[1] - leg.y;
  };
  assert.ok(claw(badger('windup', { k: 1 })) < -3, `лапа занесена (${claw(badger('windup', { k: 1 })).toFixed(1)})`);
  assert.ok(claw(badger('attack', { k: 0.3 })) > 2 && claw(badger('attack', { k: 1 })) > 3 && claw(badger('idle')) > 3, 'удар сверху вниз, потом лапа на земле');
  assert.equal(badger('windup', { k: 1 }).at(-1).name, 'mob.badger.leg ·0', 'занесённая лапа — поверх головы');

  // белка: сидит столбиком, скачет лёжа вперёд, орех — в лапках перед броском и в зубах, когда несёт
  const sq = (act, more = {}) => pose('squirrel', { act, t: 1, ...more });
  const sits = sq('idle');
  assert.ok(Math.abs(one(sits, 'mob.squirrel.body').rot) < 0.05 && one(sits, 'mob.squirrel.tail').box[1] < one(sits, 'mob.squirrel.body').y - 6, 'сидит столбиком, хвост — над спиной');
  const runs = sq('move');
  assert.ok(one(runs, 'mob.squirrel.body').rot > 0.7 && one(runs, 'mob.squirrel.tail').box[0] < one(sits, 'mob.squirrel.tail').box[0] - 3, 'скачет: тело вперёд, хвост стелется сзади');
  const hops = [];
  for (let t = 0; t < 0.8; t += 0.02) hops.push(one(sq('move', { t }), 'mob.squirrel.body').y);
  assert.ok(Math.max(...hops) - Math.min(...hops) > 1.5, 'скачками');
  assert.ok(!has(runs, 'mob.squirrel.nut') && !has(sits, 'mob.squirrel.nut'));
  const carry = sq('carry');
  const nut = one(carry, 'mob.squirrel.nut');
  const muzzle = one(carry, 'mob.squirrel.head');
  assert.ok(nut.x > muzzle.x + 2 && nut.x <= muzzle.box[2] + 2 && nut.y > muzzle.box[1] && nut.y < muzzle.box[3] + 2, 'несёт орех в зубах');
  assert.deepEqual(carry.filter((p) => !p.name.startsWith('mob.squirrel.nut')).map((p) => p.m), runs.map((p) => p.m), 'несёт — бежит так же, только с орехом');
  const wind = sq('windup', { k: 1 });
  assert.ok(dist([one(wind, 'mob.squirrel.nut').x, one(wind, 'mob.squirrel.nut').y], at(one(wind, 'mob.squirrel.arm ·0'), 0, 3.4)) < 0.6, 'перед броском орех в лапке');
  assert.ok(one(wind, 'mob.squirrel.nut').y < one(wind, 'mob.squirrel.body').y - 2, 'и поднят');
  assert.ok(has(sq('attack', { k: 0.05 }), 'mob.squirrel.nut') && !has(sq('attack', { k: 0.3 }), 'mob.squirrel.nut'), 'бросила — ореха в лапке нет');
});
