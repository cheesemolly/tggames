// Спутники «Лисьей охоты» (minions.js): данные, наём, поведение каждого — идёт за лисой, дерётся только с врагами,
// не ловит добычу, не уходит далеко, делает своё дело (ёж катится, сова мечет, светлячок даёт ману, белка носит).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REG, T } from '../core.js';
import '../content.js';
import { spawnMob, hireMinion, hurtPal } from '../ai.js';
import { step, drain } from '../logic.js';
import { addPick } from '../world.js';
import { MINIONS } from '../minions.js';
import { arena, dummy, put, makeInput, runSteps, findNaN, findOutside } from './helpers.js';

const IDS = Object.keys(MINIONS);
const CAPS = { mobs: 48, shots: 220, picks: 80, zones: 40, things: 24, pals: 3 };
const POSES = new Set(['idle', 'walk', 'move', 'windup', 'attack', 'recover', 'hurt', 'roll', 'leap', 'carry', '']);
const FOX_SPEED = 132;
const FIGHTERS = ['hedgie', 'owlet', 'cub', 'firefly', 'badger', 'squirrel'];

function team(ids, { floor = 2, seed = 1 } = {}) {
  const G = arena({ seed, floor });
  G.player.st.palSlots = 3;
  for (const id of ids) assert.equal(hireMinion(G, id), true, id);
  drain(G);
  return G;
}

const damageDealt = (m) => m.def.hp * 100 - m.hp;

test('спутники: данные в порядке', () => {
  assert.deepEqual(IDS.slice().sort(), ['badger', 'cub', 'firefly', 'hedgie', 'owlet', 'squirrel']);
  for (const id of IDS) {
    const d = MINIONS[id];
    assert.ok(d.name && d.name.length <= 14, `${id}: название`);
    assert.ok(d.desc && d.desc.length <= 60 && !d.desc.endsWith('!'), `${id}: описание «${d.desc}»`);
    assert.ok(Number.isInteger(d.hp) && d.hp >= 1 && d.hp <= 20, `${id}: здоровье`);
    assert.ok(d.r >= 4 && d.r <= 12, `${id}: радиус`);
    assert.ok(d.speed >= FOX_SPEED && d.speed <= 200, `${id}: скорость ${d.speed} — спутник должен успевать за лисой`);
    assert.ok(d.price >= 20 && d.price <= 60, `${id}: цена`);
    assert.equal(typeof d.think, 'function', id);
    if (d.flying) assert.ok(d.z > 0, `${id}: у летающего есть высота`);
    assert.equal(REG.MINIONS[id], d);
  }
  assert.equal(IDS.filter((id) => MINIONS[id].taunt).join(), 'badger', 'приманка одна');
  // цена соответствует силе: самый крепкий — самый дорогой из ближнего боя
  assert.ok(MINIONS.badger.price >= MINIONS.hedgie.price);
});

test('наём: спутник встаёт рядом с лисой со своим здоровьем; больше мест, чем есть, не нанять; дар «стая» прибавляет здоровье', () => {
  for (const id of IDS) {
    const G = arena();
    assert.equal(hireMinion(G, id), true);
    assert.equal(G.minions.length, 1);
    assert.equal(G.room.pals.length, 1);
    const n = G.room.pals[0];
    assert.equal(n.hp, MINIONS[id].hp);
    assert.ok(Math.hypot(n.x - G.player.x, n.y - G.player.y) < 60, `${id}: рядом с лисой`);
    assert.equal(hireMinion(G, id), true);
    assert.equal(hireMinion(G, id), false, 'мест два');
    assert.equal(G.minions.length, 2);
  }
  assert.equal(hireMinion(arena(), 'nope'), false);
  const G = arena();
  G.player.st.palHp = 1.5;
  hireMinion(G, 'hedgie');
  assert.equal(G.room.pals[0].hp, Math.round(MINIONS.hedgie.hp * 1.5));
});

test('спутник выбывает насовсем, когда кончилось здоровье; передышка после удара', () => {
  const G = team(['badger']);
  const n = G.room.pals[0];
  assert.equal(hurtPal(G, n, 3), true);
  assert.equal(n.hp, MINIONS.badger.hp - 3);
  assert.equal(hurtPal(G, n, 3), false, 'сразу второй раз не бьют');
  assert.equal(G.minions[0].hp, n.hp, 'запись в партии следит за здоровьем');
  runSteps(G, 60);
  hurtPal(G, n, 99);
  assert.equal(n.dead, true);
  assert.equal(G.minions.length, 0);
  runSteps(G, 3);
  assert.equal(G.room.pals.length, 0);
  assert.equal(hurtPal(G, n, 1), false);
  assert.equal(hurtPal(G, arena().room.pals[0] ?? { dead: false, touchT: 0, hp: 1, rec: { hp: 1 }, def: {}, x: 0, y: 0 }, 0), false, 'нулевой урон не бьёт');
});

for (const id of IDS) {
  test(`спутник ${id}: идёт за лисой, не отстаёт и не застревает`, () => {
    for (const seed of [1, 2, 3]) {
      const G = team([id], { seed });
      const n = G.room.pals[0];
      const route = [[2, 2], [14, 2], [14, 8], [3, 8], [8, 5]];
      let worst = 0;
      for (const [cx, cy] of route) {
        put(G, cx * T, cy * T);
        for (let i = 0; i < 4 * 60; i++) {
          step(G, makeInput());
          drain(G);
          if (i > 90) worst = Math.max(worst, Math.hypot(n.x - G.player.x, n.y - G.player.y));
        }
        assert.ok(Math.hypot(n.x - G.player.x, n.y - G.player.y) < 70, `${id}/${seed}: за 4 с не добрался до лисы в (${cx}, ${cy}), расстояние ${Math.hypot(n.x - G.player.x, n.y - G.player.y).toFixed(0)}`);
        assert.ok(POSES.has(n.act), `поза «${n.act}»`);
      }
      assert.equal(findNaN(G), null);
      assert.equal(findOutside(G, CAPS), null);
    }
  });

  test(`спутник ${id}: держится близко, пока врагов нет, и не трогает добычу`, () => {
    const G = team([id]);
    const n = G.room.pals[0];
    const prey = [1, 2, 3].map((i) => spawnMob(G, 'rabbit', G.player.x + 40 * i, G.player.y + 20, { warm: 0 }));
    for (let i = 0; i < 6 * 60; i++) {
      put(G, G.room.center.x, G.room.center.y);
      step(G, makeInput());
      drain(G);
    }
    assert.equal(G.cnt.rabbits, 0, `${id}: поймал добычу вместо лисы`);
    assert.ok(prey.every((m) => !m.dead || m.state === 'dive'), 'кролики целы');
    assert.ok(Math.hypot(n.x - G.player.x, n.y - G.player.y) < 80);
  });

  test(`спутник ${id}: рядом с врагом ведёт себя разумно — не улетает за комнату, не бьёт лису, не застывает в неверной позе`, () => {
    for (const seed of [1, 2]) {
      const G = team([id], { seed });
      const n = G.room.pals[0];
      const foe = dummy(G, G.player.x + 90, G.player.y, { hp: 100000, maxHp: 100000 });
      const hp0 = G.player.hp;
      const states = new Set();
      for (let i = 0; i < 20 * 60; i++) {
        put(G, G.room.center.x, G.room.center.y);
        step(G, makeInput());
        drain(G);
        states.add(n.state);
        assert.ok(POSES.has(n.act), `${id}: поза «${n.act}» (${n.state})`);
        if (n.dead) break;
        if (i % 120 === 0) assert.equal(findOutside(G, CAPS), null, id);
      }
      assert.equal(findNaN(G), null);
      assert.equal(G.player.hp, hp0, 'лису спутник не задевает');
      assert.ok(foe.hp < foe.maxHp, `${id}/${seed}: за 20 с не нанёс ни одного удара (состояния ${[...states]})`);
    }
  });
}

test('бой всей командой слабее лисы: втроём за 20 с наносят меньше, чем обычное оружие за те же 20 с', () => {
  const G = team(['hedgie', 'cub', 'owlet']);
  const foe = dummy(G, G.player.x + 90, G.player.y, { hp: 100000, maxHp: 100000 });
  for (let i = 0; i < 20 * 60; i++) {
    put(G, G.room.center.x, G.room.center.y);
    foe.x = G.player.x + 90;
    foe.y = G.player.y;
    step(G, makeInput());
    drain(G);
  }
  const dealt = foe.maxHp - foe.hp;
  assert.ok(dealt > 0);
  assert.ok(dealt / 20 < 12, `команда бьёт ${(dealt / 20).toFixed(1)} в секунду`);
});

test('далеко от лисы в драку не лезут: враг за пределами поводка остаётся нетронутым', () => {
  for (const id of IDS) {
    const G = team([id]);
    const foe = dummy(G, 22 * T, 10 * T, { hp: 100000, maxHp: 100000 });
    for (let i = 0; i < 6 * 60; i++) {
      put(G, 2 * T, 2 * T);
      step(G, makeInput());
      drain(G);
    }
    assert.equal(foe.hp, foe.maxHp, `${id}: полез в драку за поводком`);
    assert.ok(Math.hypot(G.room.pals[0].x - G.player.x, G.room.pals[0].y - G.player.y) < 80);
  }
});

test('светлячок: возвращает ману по капле, только пока рядом; искра бьёт близкого врага', () => {
  const G = team(['firefly']);
  G.player.mana = 0;
  runSteps(G, 10 * 60, makeInput());
  assert.ok(G.player.mana > 4 && G.player.mana < 6.5, `мана за 10 с: ${G.player.mana.toFixed(2)}`);
  const full = team(['firefly']);
  full.player.mana = full.player.st.maxMana;
  runSteps(full, 60);
  assert.equal(full.player.mana, full.player.st.maxMana, 'выше запаса не льётся');
  const far = team(['firefly']);
  far.player.mana = 0;
  far.room.pals[0].x = 22 * T;
  far.room.pals[0].y = 12 * T;
  runSteps(far, 3);
  assert.ok(far.player.mana < 0.2, 'далеко от лисы маны нет');
});

test('белка: находку, что лежит в стороне, подтягивает к лисе; вещи и предметы задания не трогает', () => {
  const G = team(['squirrel']);
  G.player.hp = 1;
  put(G, G.room.center.x - 100, G.room.center.y);
  const coin = addPick(G, 'coin', G.player.x + 150, G.player.y + 30, 1);
  const item = addPick(G, 'item', G.player.x - 100, G.player.y, 1, Object.keys(REG.ARMOR ?? REG.ITEMS ?? {})[0] ?? 'vest', 0);
  const task = addPick(G, 'berry', G.player.x, G.player.y - 120, 1, null, 0, false);
  if (task) task.tag = 'task';
  G.room.vacuum = false;
  for (let i = 0; i < 8 * 60 && !coin.pull; i++) {
    put(G, G.room.center.x - 100, G.room.center.y);
    step(G, makeInput());
    drain(G);
  }
  assert.equal(coin.pull, true, 'белка добежала до монеты');
  if (item) assert.ok(!item.pull, 'вещь не трогает');
  if (task) assert.ok(!task.pull, 'ягоду задания не трогает');
});

test('барсучонок-приманка: враг, который рядом, выбирает его, а не лису', () => {
  const G = team(['badger']);
  const n = G.room.pals[0];
  const m = spawnMob(G, 'boar', G.player.x + 120, G.player.y, { warm: 0 });
  assert.ok(m);
  let baited = false;
  for (let i = 0; i < 3 * 60; i++) {
    put(G, G.room.center.x, G.room.center.y);
    step(G, makeInput());
    drain(G);
    if (m.target === n) baited = true;
  }
  assert.ok(baited, 'враг ни разу не нацелился на барсучонка');
});

test('спутники в бою с настоящим врагом: двое-трое против кабана и ежа — партия идёт без сбоев', () => {
  for (const ids of [['hedgie', 'cub'], ['owlet', 'firefly', 'squirrel'], ['badger', 'cub', 'hedgie']]) {
    for (const seed of [1, 2]) {
      const G = team(ids, { seed });
      const foes = ['boar', 'hedgehog'].filter((id) => REG.MOBS[id]).map((id, i) => spawnMob(G, id, G.player.x + 140, G.player.y + (i ? 40 : -40), { warm: 0 }));
      for (let i = 0; i < 30 * 60; i++) {
        put(G, G.room.center.x, G.room.center.y);
        G.player.hp = G.player.st.maxHp;
        step(G, makeInput());
        drain(G);
        if (i % 60 === 0) {
          assert.equal(findNaN(G), null, ids.join());
          assert.equal(findOutside(G, CAPS), null, ids.join());
        }
      }
      for (const n of G.room.pals) assert.ok(n.hp >= 0);
      assert.ok(G.minions.length === G.room.pals.filter((p) => !p.dead).length, 'записи и спутники сходятся');
    }
  }
});
