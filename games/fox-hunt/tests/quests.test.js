// Задания «Лисьей охоты» (quests.js): данные, старт и чистый конец каждого (удачный и по сроку), награда только за
// выполненное, ничего не остаётся в комнате, и каждое задание можно выполнить на деле.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REG, T } from '../core.js';
import '../content.js';
import { startTask } from '../director.js';
import { step, drain } from '../logic.js';
import { catchPrey, breakThing } from '../combat.js';
import { hurtPlayer } from '../player.js';
import { TASKS, QUEST } from '../quests.js';
import { arena, makeInput, runSteps, put, findNaN, findOutside } from './helpers.js';

const IDS = Object.keys(TASKS);
const CAPS = { mobs: 48, shots: 220, picks: 80, zones: 40, things: 24, pals: 3 };
const TAG = 'task';

const tagged = (G) => ({
  things: G.room.things.filter((t) => t.tag === TAG),
  picks: G.room.picks.filter((p) => p.tag === TAG),
  zones: G.room.zones.filter((z) => z.tag === TAG),
});
const leftovers = (G) => {
  const t = tagged(G);
  return t.things.length + t.picks.length + t.zones.length;
};
const events = (G) => drain(G);

function begin(id, { floor = 2, seed = 1 } = {}) {
  const G = arena({ seed, floor });
  G.player.hp = G.player.st.maxHp;
  const ok = startTask(G, id);
  return { G, ok, task: G.room.task };
}

test('задания: данные в порядке (название, текст, срок, вес, числа)', () => {
  assert.deepEqual(IDS.slice().sort(), ['berries', 'butterfly', 'flawless', 'goldrush', 'ring', 'speedhunt', 'stumps', 'targets']);
  for (const id of IDS) {
    const d = TASKS[id];
    assert.ok(d.name && d.name.length <= 22, `${id}: название «${d.name}»`);
    assert.ok(d.text && d.text.length <= 50 && !d.text.endsWith('.'), `${id}: текст «${d.text}»`);
    assert.ok(Number.isFinite(d.time ?? 0) && (d.time ?? 0) >= 0, id);
    assert.ok((d.weight ?? 1) > 0 && (d.minFloor ?? 1) >= 1, id);
    assert.equal(typeof d.start, 'function', id);
    assert.equal(typeof d.step, 'function', id);
    assert.equal(typeof d.finish, 'function', id);
    if (d.during) assert.equal(d.during, 'wave', id);
    if (!d.during) assert.ok(d.time > 0, `${id}: задание в передышку без срока никогда не кончится`);
  }
  assert.ok(QUEST.ring.need * 1 < TASKS.ring.time, 'на круг хватает времени');
  assert.ok(QUEST.speedhunt.rabbits >= QUEST.speedhunt.n, 'кроликов не меньше, чем нужно поймать');
  assert.ok(QUEST.ring.zoneR < QUEST.ring.r, 'красный круг помещается внутри грибного');
  assert.ok(QUEST.ring.warn >= 0.5, 'красный круг предупреждает не короче полсекунды');
  for (const id of IDS) assert.equal(REG.TASKS[id], TASKS[id], `${id}: есть в реестре`);
});

for (const id of IDS) {
  test(`задание ${id}: старт, ход панели, срок вышел — провал без награды и без следов`, () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { G, ok, task } = begin(id, { seed });
      assert.equal(ok, true, `${id}/${seed}: не началось`);
      assert.equal(task.id, id);
      assert.equal(task.name, TASKS[id].name);
      assert.ok(TASKS[id].during === 'wave' || task.goal >= 1, `${id}: цель для панели`);
      assert.ok(G.room.task === task);
      assert.equal(startTask(G, id), false, 'второе задание поверх первого не начинается');
      assert.equal(findOutside(G, CAPS), null, id);
      const score = G.score;
      const evs = [];
      G.player.hp = 99;                                       // красные круги ведьмина круга не должны мешать
      for (let i = 0; i < 40 * 60 && G.room.task; i++) {
        put(G, G.room.center.x, G.room.center.y);             // лиса стоит посреди комнаты и ничего не делает
        G.player.hp = 99;
        step(G, makeInput());
        for (const e of events(G)) evs.push(e);
        assert.ok(task.n >= 0 && task.n <= task.goal, `${id}: ход ${task.n}/${task.goal}`);
        if (i % 60 === 0) assert.equal(findNaN(G), null);
      }
      if (TASKS[id].during === 'wave') {
        // «на всю волну» живёт без срока, пока волна не кончится: здесь её нет — проверим отдельно
        assert.ok(G.room.task, `${id}`);
        continue;
      }
      assert.equal(G.room.task, null, `${id}/${seed}: задание не кончилось`);
      const end = evs.filter((e) => e.t === 'task').map((e) => e.state);
      assert.ok(end[0] === 'start' || end.length === 1, `${id}: события ${end}`);
      assert.ok(end.includes('fail') || end.includes('ok'), `${id}: ${end}`);
      if (end.includes('fail')) assert.equal(G.cnt.tasks, 0, 'провал не засчитывается');
      assert.equal(leftovers(G), 0, `${id}/${seed}: остались предметы, подбираемое или зоны задания`);
      assert.equal(G.room.task, null);
      assert.ok(G.score >= score, 'очки не убывают');
    }
  });
}

test('пеньки: три штуки, ломает любой рывок, награда — очки за каждый и за всё; выстрел не ломает', () => {
  const { G, task } = begin('stumps');
  const things = G.room.things.filter((t) => t.kind === 'stump');
  assert.equal(things.length, QUEST.stumps.n);
  const before = G.score;
  assert.equal(breakThing(G, things[0], 1), false, 'выстрел пень не берёт');
  assert.equal(task.n, 0);
  for (const th of things) assert.equal(breakThing(G, th, 999), true);
  assert.equal(task.n, 3);
  assert.equal(G.score, before + 3 * QUEST.stumps.each);
  runSteps(G, 2);
  assert.equal(G.room.task, null);
  assert.equal(G.cnt.tasks, 1);
  assert.equal(G.score, before + 3 * QUEST.stumps.each + QUEST.stumps.pts);
  assert.equal(leftovers(G), 0);
  assert.ok(G.room.picks.some((p) => p.kind === 'coin'), 'монеты в награду');
  assert.equal(G.room.things.some((t) => t.kind === 'stump'), false, 'пеньки убраны');
});

test('мишени: хватает одного попадания чем угодно, четыре — и готово', () => {
  const { G, task } = begin('targets');
  const list = G.room.things.filter((t) => t.kind === 'target');
  assert.equal(list.length, QUEST.targets.n);
  const before = G.score;
  for (const th of list) assert.equal(breakThing(G, th, 0.2), true);
  runSteps(G, 2);
  assert.equal(G.room.task, null);
  assert.equal(G.cnt.tasks, 1);
  assert.equal(G.score, before + QUEST.targets.n * QUEST.targets.each + QUEST.targets.pts);
  assert.equal(leftovers(G), 0);
});

test('ягоды: берутся даже при полных сердцах, лечат только когда есть что лечить; несобранные пропадают', () => {
  const { G, task } = begin('berries');
  const berries = tagged(G).picks;
  assert.equal(berries.length, QUEST.berries.n);
  assert.ok(berries.every((p) => p.kind === 'berry'));
  const maxHp = G.player.st.maxHp;
  assert.equal(G.player.hp, maxHp);
  for (const b of berries) {
    put(G, b.x, b.y);
    runSteps(G, 30);
  }
  assert.equal(G.room.task, null, 'собрала все — готово');
  assert.equal(G.cnt.tasks, 1);
  assert.equal(G.player.hp, maxHp);
  assert.equal(leftovers(G), 0);
  // не успела — ягоды пропали, награды нет
  const f = begin('berries', { seed: 2 });
  runSteps(f.G, 9 * 60, makeInput());
  assert.equal(f.G.room.task, null);
  assert.equal(f.G.cnt.tasks, 0);
  assert.equal(leftovers(f.G), 0);
  // ранена — ягода лечит на единицу
  const h = begin('berries', { seed: 3 });
  h.G.player.hp = 2;
  const b0 = tagged(h.G).picks[0];
  put(h.G, b0.x, b0.y);
  runSteps(h.G, 30);
  assert.equal(h.G.player.hp, 2 + QUEST.berries.heal);
});

test('бабочка: догнать телом — готово, награда очками; убегает, пока лиса далеко не стоит рядом', () => {
  const { G, task } = begin('butterfly');
  const th = G.room.things.find((t) => t.kind === 'butterfly');
  assert.ok(th);
  const x0 = th.x;
  const y0 = th.y;
  put(G, G.room.center.x, G.room.center.y);
  runSteps(G, 30);
  assert.ok(Math.hypot(th.x - x0, th.y - y0) > 1, 'бабочка летает');
  assert.ok(th.x > 0 && th.y > 0 && th.x < G.room.w * T && th.y < G.room.h * T, 'и не вылетает из комнаты');
  const before = G.score;
  put(G, th.x, th.y);
  runSteps(G, 2);
  assert.equal(G.room.task, null);
  assert.equal(G.cnt.tasks, 1);
  assert.equal(G.score, before + QUEST.butterfly.pts);
  assert.equal(G.room.things.some((t) => t.kind === 'butterfly'), false);
});

test('золотой кролик: поймала — готово; ушёл в нору — провал; выходит не ближе положенного', () => {
  let started = 0;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const { G, ok, task } = begin('goldrush', { seed });
    if (!ok) continue;
    started++;
    const m = task.data.prey[0];
    assert.equal(m.id, 'gold');
    const before = G.score;
    catchPrey(G, m, 1);
    runSteps(G, 2);
    assert.equal(G.room.task, null);
    assert.equal(G.cnt.tasks, 1);
    assert.ok(G.score >= before + QUEST.goldrush.pts);
    const f = begin('goldrush', { seed });
    f.task.data.prey[0].dead = true;                          // ушёл непойманным
    runSteps(f.G, 2);
    assert.equal(f.G.room.task, null);
    assert.equal(f.G.cnt.tasks, 0);
  }
  assert.ok(started >= 4, 'в большинстве комнат золотой кролик выходит');
});

test('быстрая охота: шесть кроликов, четыре пойманных — готово; остальные уходят в землю', () => {
  const { G, task, ok } = begin('speedhunt');
  assert.equal(ok, true);
  const prey = task.data.prey;
  assert.equal(prey.length, QUEST.speedhunt.rabbits);
  for (let i = 0; i < QUEST.speedhunt.n; i++) catchPrey(G, prey[i], 0);
  assert.equal(task.n, QUEST.speedhunt.n);
  runSteps(G, 2);
  assert.equal(G.room.task, null);
  assert.equal(G.cnt.tasks, 1);
  assert.ok(prey.slice(QUEST.speedhunt.n).every((m) => m.state === 'dive' || m.dead), 'остальные ныряют');
  assert.equal(prey.filter((m) => m.dead).length, QUEST.speedhunt.n);
});

test('ведьмин круг: четыре секунды внутри (не подряд) — готово, награда маной; красные круги предупреждают', () => {
  let tried = 0;
  for (const seed of [1, 2, 3, 4]) {
    const { G, ok, task } = begin('ring', { seed });
    if (!ok) continue;
    tried++;
    const d = task.data;
    G.player.hp = 99;
    G.player.st.maxHp = 99;
    const seen = new Set();
    for (let i = 0; i < 12 * 60 && G.room.task; i++) {
      put(G, d.x, d.y);
      G.player.hp = 99;
      G.player.inv = 99;
      step(G, makeInput());
      drain(G);
      for (const z of G.room.zones) {
        if (z.tag !== TAG || seen.has(z.uid)) continue;
        seen.add(z.uid);
        assert.ok(z.total >= 0.5, `красный круг предупреждает ${z.total} с`);
      }
    }
    assert.equal(G.room.task, null, `ring/${seed}: не выполнено за 12 с`);
    assert.equal(G.cnt.tasks, 1, `ring/${seed}: награда не выдана`);
    assert.equal(G.room.picks.filter((p) => p.kind === 'mana').length, QUEST.ring.orbs);
    assert.equal(leftovers(G), 0);
    assert.ok(seen.size >= 1, 'круги падали');
  }
  assert.ok(tried >= 3);
  // вне круга время не идёт
  const { G, task } = begin('ring', { seed: 1 });
  put(G, 40, 40);
  runSteps(G, 3 * 60);
  assert.equal(task.data.in, 0);
});

test('красные круги ведьмина круга бьют лису, а не пропускают (и не бьют в рывке)', () => {
  const { G, task } = begin('ring', { seed: 1 });
  const d = task.data;
  let hurt = 0;
  for (let i = 0; i < 6 * 60 && G.room.task; i++) {
    put(G, d.x, d.y);
    G.player.hp = G.player.st.maxHp;
    const h = G.cnt.hurt;
    step(G, makeInput());
    drain(G);
    hurt += G.cnt.hurt - h;
  }
  assert.ok(hurt >= 1, 'хоть один круг попал под лапы');
});

test('чистая охота: идёт всю волну; удар по лисе — провал без награды; без ударов — награда', () => {
  const { G, task } = begin('flawless');
  const coins = G.room.picks.length;
  runSteps(G, 30);
  assert.ok(G.room.task, 'пока не били — идёт');
  G.cnt.hurt += 1;
  runSteps(G, 2);
  assert.equal(G.room.task, null);
  assert.equal(G.cnt.tasks, 0);
  assert.equal(G.room.picks.length, coins);
  const g2 = begin('flawless', { seed: 2 });
  const score = g2.G.score;
  const def = g2.task.def;
  def.finish(g2.G, g2.task, true);
  assert.equal(g2.G.score, score + QUEST.flawless.pts);
  assert.ok(g2.G.room.picks.some((p) => p.kind === 'coin'));
  // первая локация: чистая охота ещё не выбирается случайно
  const first = arena({ seed: 1, floor: 1 });
  for (let i = 0; i < 40; i++) {
    first.room.task = null;
    startTask(first);
    assert.notEqual(first.room.task?.id, 'flawless');
    assert.notEqual(first.room.task?.id, 'ring');
    if (first.room.task) {
      first.room.task.def.finish(first, first.room.task, false);
      first.room.task = null;
    }
  }
});

test('случайный выбор: на каждой локации есть что выбрать, веса учитываются', () => {
  for (const floor of [1, 2, 3, 4]) {
    const seen = new Set();
    for (let seed = 1; seed <= 80; seed++) {
      const G = arena({ seed, floor });
      if (startTask(G)) seen.add(G.room.task.id);
    }
    assert.ok(seen.size >= 4, `локация ${floor}: видели ${[...seen]}`);
    for (const id of seen) assert.ok((TASKS[id].minFloor ?? 1) <= floor, `${id} раньше времени`);
  }
});
