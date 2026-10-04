// Правила ремонта: подсказка из начала любого заказа доводит до сдачи без искр и лишних деталей; правила разборки,
// искры, лишние детали, возвраты, звёзды; сохранение и прогресс.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FAULTS, GROUPS, TUTORIAL, COMPLAINTS, newOrder, act, nextStep, symptoms, assembled, isValidState, starsFor,
  emptyProgress, isValidProgress, recordWin, faultsFor, seeded, inspect,
} from '../logic.js';

/** Пройти заказ по подсказкам; → число шагов. Каждое действие подсказки должно получаться. */
function solve(s, limit = 300) {
  const sparks = s.sparks;
  const waste = s.waste;
  for (let k = 0; k < limit; k++) {
    const st = nextStep(s);
    if (!st) return k;
    const r = act(s, st.tool, st.target);
    assert.ok(r.ok, `заказ ${s.level} (${s.faults}): шаг ${st.tool} → ${st.target} не вышел: ${r.why}`);
    assert.ok(isValidState(s), `заказ ${s.level}: после ${st.tool} → ${st.target} состояние неверное`);
    assert.equal(s.sparks, sparks, `заказ ${s.level}: подсказка ${st.tool} → ${st.target} дала искру`);
    assert.equal(s.waste, waste, `заказ ${s.level}: подсказка ${st.tool} → ${st.target} поставила лишнюю деталь`);
    if (st.tool === 'deliver') {
      assert.equal(r.win, true, `заказ ${s.level} (${s.faults}): сдали с ${r.problems}`);
      return k + 1;
    }
  }
  assert.fail(`заказ ${s.level} (${s.faults}): подсказка не довела до конца за ${limit} шагов`);
  return limit;
}

test('у каждой поломки есть жалобы, группы покрывают все поломки, обучение — все по разу', () => {
  for (const f of FAULTS) assert.ok(COMPLAINTS[f]?.length >= 2, f);
  assert.deepEqual([...Object.values(GROUPS).flat()].sort(), [...FAULTS].sort());
  assert.deepEqual([...TUTORIAL].sort(), [...FAULTS].sort());
});

test('новый заказ: неисправен, собран, сохраняется', () => {
  for (let level = 1; level <= 300; level++) {
    const s = newOrder(level);
    assert.ok(isValidState(s), `заказ ${level}`);
    assert.ok(assembled(s));
    assert.ok(symptoms(s).length > 0, `заказ ${level} (${s.faults}) исправен с самого начала`);
    assert.deepEqual(newOrder(level), s, 'заказ по номеру всегда один и тот же');
    assert.ok(isValidState(JSON.parse(JSON.stringify(s))));
  }
});

test('поломки заказа — из разных групп; дальше заказы сложнее', () => {
  const groupOf = (f) => Object.keys(GROUPS).find((g) => GROUPS[g].includes(f));
  let many = 0;
  for (let level = 1; level <= 400; level++) {
    const f = faultsFor(level, seeded(level));
    assert.equal(new Set(f.map(groupOf)).size, f.length, `заказ ${level}: ${f}`);
    if (level <= TUTORIAL.length) assert.deepEqual(f, [TUTORIAL[level - 1]]);
    if (level > 50 && f.length > 1) many++;
  }
  assert.ok(many > 100);
});

test('подсказка доводит любой заказ до сдачи на 3 звезды — без искр, лишних деталей и возвратов', () => {
  let longest = 0;
  for (let level = 1; level <= 400; level++) {
    const s = newOrder(level);
    longest = Math.max(longest, solve(s));
    assert.equal(s.sparks, 0, `заказ ${level}: искры`);
    assert.equal(s.waste, 0, `заказ ${level}: лишние детали`);
    assert.equal(s.returns, 0);
    assert.equal(starsFor(s), 3);
    assert.ok(s.done);
  }
  assert.ok(longest < 120, `самый длинный заказ — ${longest} шагов`);
});

test('подсказка ведёт и из любой середины: случайные действия, потом подсказки', () => {
  const tools = ['flip', 'heat', 'suction', 'screwdriver', 'spudger', 'tweezers', 'parts', 'brush', 'alcohol', 'power'];
  const targets = ['cover', 'display', 'shield', 'bracket', 'battery', 'camera', 'speaker', 'port', 's1', 's2', 's3', 's4', 's5', 's6',
    'bat', 'disp', 'cam', 'usb', 'jack', 'board', 'button', 'screen'];
  const rng = seeded(7);
  for (let k = 0; k < 400; k++) {
    const s = newOrder(1 + Math.floor(rng() * 120));
    for (let m = 0; m < 60; m++) {
      const tool = tools[Math.floor(rng() * tools.length)];
      act(s, tool, targets[Math.floor(rng() * targets.length)]);
      assert.ok(isValidState(s), `${tool}: неверное состояние`);
    }
    solve(s);
  }
});

test('крышка на клею: без фена не снять, после — присоской', () => {
  const s = newOrder(4);                           // вздутая батарея
  act(s, 'flip');
  assert.equal(act(s, 'suction', 'cover').why, 'glue');
  assert.equal(act(s, 'tweezers', 'battery').why, 'cover');
  assert.ok(act(s, 'heat', 'cover').ok);
  assert.equal(act(s, 'tweezers', 'cover').why, 'use-suction');
  assert.ok(act(s, 'suction', 'cover').ok);
  assert.equal(act(s, 'spudger', 'bat').why, 'shield');
  assert.equal(act(s, 'tweezers', 'shield').why, 'screws');
  for (const id of ['s1', 's2', 's3', 's4']) assert.ok(act(s, 'screwdriver', id).ok);
  assert.ok(act(s, 'tweezers', 'shield').ok);
  assert.equal(act(s, 'screwdriver', 's1').why, 'no-holder');
  assert.equal(act(s, 'tweezers', 'battery').why, 'bat-connected');
});

test('шлейф при подключённой батарее — искра; батарея отключена — без искры', () => {
  const open = () => {
    const s = newOrder(2);
    act(s, 'flip');
    act(s, 'heat', 'cover');
    act(s, 'suction', 'cover');
    for (const id of ['s1', 's2', 's3', 's4']) act(s, 'screwdriver', id);
    act(s, 'tweezers', 'shield');
    return s;
  };
  const a = open();
  assert.equal(act(a, 'spudger', 'disp').spark, true);
  assert.equal(a.sparks, 1);
  assert.equal(starsFor(a), 2);
  const b = open();
  assert.equal(act(b, 'spudger', 'bat').spark, false);
  assert.equal(act(b, 'spudger', 'disp').spark, false);
  assert.equal(b.sparks, 0);
  // экран: шлейф отключён — можно снимать спереди
  assert.equal(act(b, 'heat', 'display').why, 'flip');
  act(b, 'flip');
  assert.equal(act(b, 'suction', 'display').why, 'glue');
  act(b, 'heat', 'display');
  assert.ok(act(b, 'suction', 'display').ok);
  assert.equal(act(b, 'parts', 'display').wasted, false);
});

test('новая деталь вместо исправной — минус звезда; своя обратно — без штрафа', () => {
  const s = newOrder(1);                           // вирусы: железо исправно
  act(s, 'flip');
  act(s, 'heat', 'cover');
  act(s, 'suction', 'cover');
  assert.equal(act(s, 'parts', 'cover').wasted, true);
  assert.equal(s.waste, 1);
  assert.equal(act(s, 'parts', 'cover').why, 'remove-first');
  const t = newOrder(1);
  act(t, 'flip');
  act(t, 'heat', 'cover');
  act(t, 'suction', 'cover');
  assert.equal(act(t, 'tweezers', 'cover').wasted, false);
  assert.equal(t.waste, 0);
});

test('крышку не закрыть над разобранным; сдать несобранный нельзя, неисправный — возврат', () => {
  const s = newOrder(3);                           // забито гнездо
  act(s, 'flip');
  act(s, 'heat', 'cover');
  act(s, 'suction', 'cover');
  act(s, 'screwdriver', 's5');
  assert.equal(act(s, 'tweezers', 'cover').why, 'inside-missing');
  assert.equal(act(s, 'deliver').why, 'assemble');
  act(s, 'screwdriver', 's5');
  act(s, 'tweezers', 'cover');
  const r = act(s, 'deliver');
  assert.equal(r.win, false);
  assert.deepEqual(r.problems, ['no-charge']);
  assert.equal(s.returns, 1);
  assert.equal(act(s, 'charger', 'jack').charge, false);
  assert.equal(act(s, 'magnifier', 'jack').find, 'jack-lint');
  assert.ok(act(s, 'brush', 'jack').ok);
  assert.equal(act(s, 'charger', 'jack').charge, true);
  assert.equal(act(s, 'deliver').win, true);
  assert.equal(starsFor(s), 2);
});

test('вирусы: антивирус на включённом телефоне, потом давить жуков; прошивка лечит зависание и вирусы', () => {
  const s = newOrder(1);
  assert.equal(act(s, 'antivirus', 'screen').why, 'power-off');
  assert.equal(act(s, 'power', 'button').on, true);
  const n = act(s, 'antivirus', 'screen').bugs;
  assert.ok(n >= 3);
  for (let k = n - 1; k >= 0; k--) assert.equal(act(s, 'squash', 'bug').left, k);
  assert.equal(act(s, 'squash', 'bug').ok, false);
  assert.equal(act(s, 'deliver').win, true);
  const b = newOrder(9);                           // завис на логотипе
  b.virus = 4;
  act(b, 'power', 'button');
  assert.equal(act(b, 'antivirus', 'screen').why, 'no-screen');
  assert.ok(act(b, 'flash', 'jack').ok);
  assert.equal(b.virus, 0);
  assert.deepEqual(symptoms(b), []);
});

test('лупа находит поломку, исправное — «в порядке»', () => {
  const s = newOrder(13);                          // изношенная батарея
  assert.equal(act(s, 'power', 'button').blink, true);
  act(s, 'flip');
  assert.equal(inspect(s, 'cover'), 'cover-ok');
  act(s, 'heat', 'cover');
  act(s, 'suction', 'cover');
  assert.equal(act(s, 'magnifier', 'battery').find, 'battery-worn');
  assert.equal(act(s, 'magnifier', 'indicator').find, 'indicator-ok');
  assert.ok(s.notes.includes('battery-worn'));
  const w = newOrder(11);                          // вода
  act(w, 'flip');
  act(w, 'heat', 'cover');
  act(w, 'suction', 'cover');
  assert.equal(act(w, 'magnifier', 'indicator').find, 'indicator-red');
  assert.equal(act(w, 'magnifier', 'board').why, 'shield');
});

test('сохранение: битое не принимается', () => {
  const s = newOrder(20);
  assert.ok(isValidState(s));
  for (const broke of [
    (x) => { x.v = 2; },
    (x) => { x.parts.cover.in = 'да'; },
    (x) => { x.conns.bat = 'maybe'; },
    (x) => { x.faults.push('meteor'); },
    (x) => { x.parts.shield.in = false; },                         // винты без держателя
    (x) => { x.screws.s5 = false; },                               // крышка закрыта, винта нет
    (x) => { x.complaint = [['virus', 99]]; },
    (x) => { x.sparks = -1; },
  ]) {
    const c = structuredClone(s);
    broke(c);
    assert.equal(isValidState(c), false, String(broke));
  }
  assert.equal(isValidState(null), false);
});

test('прогресс: уровень растёт, звёзды и идеальные копятся', () => {
  const p = emptyProgress();
  assert.ok(isValidProgress(p));
  const s = newOrder(1);
  s.sparks = 1;
  assert.equal(recordWin(p, s), 2);
  assert.deepEqual(p, { level: 2, stars: 2, perfect: 0, sparks: 1 });
  assert.equal(recordWin(p, newOrder(2)), 3);
  assert.deepEqual(p, { level: 3, stars: 5, perfect: 1, sparks: 1 });
  assert.equal(isValidProgress({ level: 0, stars: 0, perfect: 0, sparks: 0 }), false);
});
