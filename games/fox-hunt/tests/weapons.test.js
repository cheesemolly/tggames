// Оружие «Лисьей охоты»: все 26 описаны полностью, у каждого рисунка выстрела есть исполнитель, звук и значок готовы;
// таблица «урон в минуту» и «урон на ману» держит оружие в вилке своей редкости; каждое стреляет вживую без сбоев.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REG } from '../core.js';
import '../content.js';
import { WEAPONS } from '../weapons.js';
import { PATTERNS, weaponCost, fireWeapon } from '../patterns.js';
import { SOUNDS } from '../sounds.js';
import '../art-all.js';
import { hasSprite } from '../art.js';
import { arena, put, dummy, runSteps, makeInput, findNaN } from './helpers.js';

const ROSTER = ['pinecone', 'sling', 'thorns', 'acorngun', 'claws', 'club', 'bow', 'boomerang', 'icicle', 'fireacorn', 'shroombomb', 'bouncenut', 'wasps',
  'venom', 'lightning', 'firefly', 'leaves', 'frostbreath', 'thornring', 'beartrap', 'spores', 'starstaff', 'stormroar', 'meteor', 'crescent', 'sunray'];
const SFX = ['shot', 'heavy', 'spread', 'bow', 'magic', 'zap', 'beam', 'lob', 'boom', 'ice', 'fire', 'swing', 'trap'];

/**
 * Прикидка «сколько урона даёт оружие, если враги стоят кучно и все выстрелы попали»: за один выстрел —
 * сколько целей в среднем заденет рисунок, плюс довесок за огонь/яд/сквозь/взрыв. Не точная, а для сравнения.
 */
function volley(w) {
  const sh = w.shot ?? {};
  const n = sh.n ?? 1;
  let hits = 1;
  switch (w.pattern) {
    case 'spread': case 'rain': hits = 0.6 * n; break;
    case 'nova': hits = n / 3; break;
    case 'burst': case 'homing': hits = n; break;
    case 'boomerang': hits = 1.5; break;
    case 'chain': hits = 1 + (sh.chain ?? 3) / 2; break;
    case 'cone': hits = 1.3; break;
    case 'wave': case 'ray': hits = 1.5; break;
    case 'lob': hits = 2; break;
    default: hits = 1;
  }
  if (sh.pierce > 0) hits *= 1 + 0.3 * sh.pierce;
  let dmg = w.dmg * hits;
  if (w.pattern === 'cloud') dmg += (sh.zoneDmg ?? 1) * (sh.linger ?? 4);
  if (sh.burn > 0 || sh.poison > 0) dmg *= 1.5;
  return dmg;
}
const perMin = (w) => (w.pattern === 'beam' ? w.dmg * 60 : (volley(w) / w.cd) * 60);
const manaMin = (w) => (w.pattern === 'beam' ? w.mana * 60 : (weaponCost(w) / w.cd) * 60);

test('оружие: все 26 на месте, описаны, в реестре', () => {
  assert.deepEqual(Object.keys(WEAPONS).sort(), [...ROSTER].sort());
  for (const id of ROSTER) {
    const w = WEAPONS[id];
    assert.equal(REG.WEAPONS[id], w, `${id}: в реестре`);
    assert.ok(w.name && w.desc.length > 8, `${id}: имя и описание`);
    assert.ok(w.rarity >= 0 && w.rarity <= 3, `${id}: редкость`);
    assert.ok(w.dmg > 0 && w.cd > 0 && w.range > 0 && w.mana >= 0, `${id}: числа`);
    assert.ok(typeof PATTERNS[w.pattern] === 'function', `${id}: рисунок «${w.pattern}»`);
    assert.ok(SFX.includes(w.sfx), `${id}: звук «${w.sfx}»`);
    assert.ok(w.shot && w.shot.look, `${id}: снаряд`);
    assert.ok(hasSprite(w.shot.look), `${id}: картинка снаряда ${w.shot.look}`);
    assert.ok(hasSprite(`item.${id}`), `${id}: значок`);
    if (w.mana === 0) assert.equal(w.pattern, 'cone', `${id}: бесплатное — только ближний бой`);
  }
  const count = [0, 0, 0, 0];
  for (const id of ROSTER) count[WEAPONS[id].rarity] += 1;
  assert.deepEqual(count, [6, 8, 7, 5], 'по редкостям: 6 / 8 / 7 / 5');
});

test('оружие: звуки выстрелов существуют', () => {
  const ids = new Set(SOUNDS);
  for (const id of ROSTER) assert.ok(ids.has(WEAPONS[id].sfx), `${id}: звука «${WEAPONS[id].sfx}» нет`);
});

test('оружие: таблица урона в минуту и на ману — внутри вилки своей редкости', (t) => {
  const rows = ROSTER.map((id) => {
    const w = WEAPONS[id];
    const dpm = perMin(w);
    const mpm = manaMin(w);
    return { id, r: w.rarity, dpm: Math.round(dpm), mana: Math.round(mpm), perMana: mpm > 0 ? +(dpm / mpm).toFixed(2) : Infinity };
  });
  t.diagnostic('\n' + rows.map((r) => `${r.id.padEnd(11)} r${r.r}  урон/мин ${String(r.dpm).padStart(5)}  мана/мин ${String(r.mana).padStart(4)}  урон/ману ${r.perMana}`).join('\n'));
  const DPM = [[350, 650], [550, 900], [900, 1350], [1350, 2100]];      // урон в минуту по редкостям
  for (const r of rows) {
    const [lo, hi] = DPM[r.r];
    assert.ok(r.dpm >= lo && r.dpm <= hi, `${r.id}: урон в минуту ${r.dpm} вне ${lo}–${hi} для редкости ${r.r}`);
    if (r.mana > 0) assert.ok(r.perMana >= 1.3 && r.perMana <= 3.8, `${r.id}: урон на ману ${r.perMana} вне 1,3–3,8`);
    assert.ok(r.mana <= 620, `${r.id}: ${r.mana} маны в минуту — сотня кончится за ${(6000 / r.mana).toFixed(0)} с`);
  }
  // чем реже оружие, тем выгоднее в среднем
  const avg = (k) => {
    const list = rows.filter((r) => r.r === k && r.mana > 0);
    return list.reduce((s, r) => s + r.dpm, 0) / list.length;
  };
  assert.ok(avg(0) < avg(1) && avg(1) < avg(2) && avg(2) < avg(3), 'средний урон растёт с редкостью');
});

test('оружие: каждое стреляет вживую — без сбоев, мана и перезарядка идут, враг получает урон', () => {
  for (const id of ROSTER) {
    const G = arena();
    put(G, 160, 240);
    G.inv.weapon = { id, lvl: 0 };
    G.player.mana = 100;
    const w = WEAPONS[id];
    const m = dummy(G, 160 + Math.min(80, w.range * 0.6), 240);
    runSteps(G, 90, makeInput({ fire: true, hasT: true, tx: m.x, ty: m.y }));
    runSteps(G, 120);
    assert.ok(!findNaN(G), `${id}: числа целы`);
    assert.ok(m.hp < 1000, `${id}: попало`);
    if (w.mana > 0) assert.ok(G.player.mana < 100, `${id}: мана тратится`);
    else assert.equal(G.player.mana, 100, `${id}: мана не тратится`);
  }
});

test('оружие: кузница прибавляет по 25 % за уровень, fireWeapon знает каждое', () => {
  for (const id of ROSTER) {
    const G = arena();
    put(G, 160, 240);
    assert.equal(fireWeapon(G, { id, lvl: 2 }, 160, 240, 0, 260, 240), true, id);
  }
});
