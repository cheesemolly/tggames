// Логика «Логических схем»: запись уровня, расчёт тока, решатель (сверка с независимым перебором), лоток,
// подсказки, звёзды, прогресс и сохранение.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseLevel, emptySetup, trayLeft, isComplete, fitsTray, evaluate, check, solve, distance, nearestSolution, hintFor,
  newState, isValidState, isTouched, placeGate, placeNot, swapGates, moveNot, applyHint, starsFor,
  emptyProgress, migrateProgress, isValidProgress, starsOf, totalStars, passedCount, isOpen, nextLevel, recordStars,
  emptyStats, migrateStats, isValidStats, plural, layerOf, columnOf,
} from '../logic.js';

// пирамида: A, B, C → два гнезда → впаянное И → лампа; колечко на правом входе верхнего вентиля
const PYRAMID = '246;31*AB 51*BC 42&12o;43;110=1;111';

function rngFrom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('запись уровня: источники, вентили, лампы, проверки, лоток', () => {
  const level = parseLevel(PYRAMID);
  assert.deepEqual(level.sources, [{ x: 2 }, { x: 4 }, { x: 6 }]);
  assert.equal(level.gates.length, 3);
  assert.deepEqual(level.gates[0], { x: 3, layer: 1, kind: null, ins: [{ from: 0, mark: '' }, { from: 1, mark: '' }] });
  assert.deepEqual(level.gates[2], { x: 4, layer: 2, kind: 'and', ins: [{ from: 3, mark: '' }, { from: 4, mark: 'ring' }] });
  assert.deepEqual(level.outs, [{ x: 4, from: 5, mark: '' }]);
  assert.deepEqual(level.rows, [{ src: [1, 1, 0], want: [1] }]);
  assert.deepEqual(level.tray, { and: 1, or: 1, not: 1 });
  assert.deepEqual(level.sockets, [0, 1]);
  assert.deepEqual(level.rings, [{ gate: 2, pin: 1 }]);
  assert.equal(level.layers, 2);
  assert.equal(layerOf(level, 1), 0);
  assert.equal(layerOf(level, 5), 2);
  assert.equal(columnOf(level, 4), 5);
});

test('запись уровня: «НЕ» и колечко на лампе, впаянное ИЛИ, несколько проверок', () => {
  const level = parseLevel('35;41+A~B;41o;10=1 01=0 11=1;001');
  assert.equal(level.gates[0].kind, 'or');
  assert.equal(level.gates[0].ins[0].mark, 'not');
  assert.deepEqual(level.rings, [{ out: 0 }]);
  assert.equal(level.rows.length, 3);
  assert.deepEqual(level.sockets, []);
});

test('ошибки записи — исключение с самой записью уровня', () => {
  const bad = [
    '35;41*AB;41;11=1',                      // нет лотка
    '53;41*AB;41;11=1;100',                  // источники не слева направо
    '35;41*AC;41;11=1;100',                  // нет источника C
    '35;41*AA;41;11=1;100',                  // оба входа от одного узла
    '35;41*AB 42*1B 31*AB;42;11=1;300',      // слои не по порядку
    '35;41*AB 43*1B;42;11=1;200',            // пустой слой
    '35;41*A2;41;11=1;100',                  // вход от самого себя (вентиля 2 нет)
    '35;41*AB;41;1=1;100',                   // в проверке не хватает источника
    '35;41*AB;41;11=11;100',                 // в проверке лишняя лампа
    '35;41*AB;41 41;11=11;100',              // две лампы в одном столбце
    '35;41*AB;41;11=1;000',                  // в лотке меньше вентилей, чем гнёзд
    '35;41&AB;41;11=1;001',                  // НЕ в лотке больше, чем колечек
    '246;31*AB;31;110=1;100',                // источник C никуда не подключён
    '35;41*AB 61*AB;41;11=1;200',            // вентиль 2 никуда не ведёт
    '35;41?AB;41;11=1;100',                  // неизвестный вид вентиля
  ];
  for (const text of bad) assert.throws(() => parseLevel(text), /уровень «/, text);
});

test('И, ИЛИ и НЕ считают как положено', () => {
  const and = parseLevel('35;41&AB;41;11=1;000');
  const or = parseLevel('35;41+AB;41;11=1;000');
  const nand = parseLevel('35;41&AB;41~;11=0;000');
  for (const [a, b] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
    assert.deepEqual(evaluate(and, emptySetup(and), [a, b]).outs, [a & b]);
    assert.deepEqual(evaluate(or, emptySetup(or), [a, b]).outs, [a | b]);
    assert.deepEqual(evaluate(nand, emptySetup(nand), [a, b]).outs, [1 - (a & b)]);
  }
  // НЕ на входе вентиля: И(НЕ A, B)
  const mix = parseLevel('35;41&A~B;41;01=1;000');
  assert.deepEqual(evaluate(mix, emptySetup(mix), [0, 1]).outs, [1]);
  assert.deepEqual(evaluate(mix, emptySetup(mix), [1, 1]).outs, [0]);
  assert.deepEqual(evaluate(mix, emptySetup(mix), [0, 1]).pins, [[1, 1]]);
});

test('расчёт: значения узлов, входов после «НЕ» и ламп; колечко без бусины ничего не меняет', () => {
  const level = parseLevel(PYRAMID);
  const setup = { kinds: ['and', 'or'], nots: [0] };
  const res = evaluate(level, setup, [1, 1, 0]);
  assert.deepEqual(res.nodes, [1, 1, 0, 1, 1, 1]);
  assert.deepEqual(res.pins, [[1, 1], [1, 0], [1, 1]]);
  assert.deepEqual(res.outs, [1]);
  const flipped = evaluate(level, { kinds: ['and', 'or'], nots: [1] }, [1, 1, 0]);
  assert.deepEqual(flipped.pins[2], [1, 0]);
  assert.deepEqual(flipped.outs, [0]);
  // пустое гнездо тока не даёт
  assert.equal(evaluate(level, emptySetup(level), [1, 1, 1]).nodes[3], 0);
});

test('проверки: по каждой — сошлось ли, и первая несошедшаяся', () => {
  const level = parseLevel('35;41*AB;41;11=1 10=0 01=0;110');
  const and = check(level, { kinds: ['and'], nots: [] });
  assert.equal(and.ok, true);
  assert.equal(and.firstBad, -1);
  const or = check(level, { kinds: ['or'], nots: [] });
  assert.equal(or.ok, false);
  assert.deepEqual(or.rows.map((r) => r.ok), [true, false, false]);
  assert.equal(or.firstBad, 1);
});

/** Независимый перебор: каждому гнезду — вид, каждому колечку — да/нет; считает своим расчётом, не evaluate(). */
function naiveSolve(level) {
  const out = [];
  const S = level.sources.length;
  const ns = level.sockets.length;
  const nr = level.rings.length;
  for (let km = 0; km < 2 ** ns; km++) {
    for (let rm = 0; rm < 2 ** nr; rm++) {
      const kinds = level.sockets.map((_, k) => (Math.floor(km / 2 ** k) % 2 ? 'or' : 'and'));
      const nots = level.rings.map((_, k) => Math.floor(rm / 2 ** k) % 2);
      if (kinds.filter((k) => k === 'and').length > level.tray.and) continue;
      if (kinds.filter((k) => k === 'or').length > level.tray.or) continue;
      if (nots.filter(Boolean).length > level.tray.not) continue;
      const flip = (mark, gate, pin, outIndex) => {
        if (mark === 'not') return true;
        if (mark !== 'ring') return false;
        const at = level.rings.findIndex((r) => (outIndex === undefined ? r.gate === gate && r.pin === pin : r.out === outIndex));
        return nots[at] === 1;
      };
      const ok = level.rows.every((row) => {
        const value = [...row.src];
        level.gates.forEach((g, i) => {
          const [a, b] = g.ins.map((p, k) => (flip(p.mark, i, k) ? !value[p.from] : Boolean(value[p.from])));
          const kind = g.kind ?? kinds[level.sockets.indexOf(i)];
          value[S + i] = (kind === 'and' ? a && b : a || b) ? 1 : 0;
        });
        return level.outs.every((o, i) => (flip(o.mark, null, null, i) ? 1 - value[o.from] : value[o.from]) === row.want[i]);
      });
      if (ok) out.push({ kinds, nots });
    }
  }
  return out;
}

/** Случайная небольшая схема в записи уровня (не обязательно решаемая). */
function randomLevel(rng) {
  const pick = (list) => list[Math.floor(rng() * list.length)];
  const mark = () => pick(['', '', '', '~', 'o']);
  const kind = () => pick(['*', '*', '&', '+']);
  const three = rng() < 0.6;
  const gates = three
    ? [`31${kind()}A${mark()}B${mark()}`, `51${kind()}B${mark()}C${mark()}`, `42${kind()}1${mark()}2${mark()}`]
    : [`41${kind()}A${mark()}B${mark()}`];
  const outs = three ? `43${mark()}` : `41${mark()}`;
  const S = three ? 3 : 2;
  const rows = [];
  const used = new Set();
  for (let r = 0; r < 1 + Math.floor(rng() * 3); r++) {
    const src = Array.from({ length: S }, () => (rng() < 0.5 ? 1 : 0)).join('');
    if (used.has(src)) continue;
    used.add(src);
    rows.push(`${src}=${rng() < 0.5 ? 1 : 0}`);
  }
  const text = `${three ? '246' : '35'};${gates.join(' ')};${outs};${rows.join(' ')};`;
  const sockets = (gates.join('').match(/\*/g) ?? []).length;
  const rings = ((gates.join('') + outs).match(/o/g) ?? []).length;
  const and = Math.floor(rng() * (sockets + 1));
  const or = sockets - and + Math.floor(rng() * 2);
  return `${text}${and}${or}${Math.floor(rng() * (rings + 1))}`;
}

test('решатель сверен с независимым перебором на случайных схемах', () => {
  const rng = rngFrom(11);
  let solvable = 0;
  for (let i = 0; i < 400; i++) {
    const text = randomLevel(rng);
    const level = parseLevel(text);
    const mine = solve(level).map((s) => JSON.stringify(s)).sort();
    const naive = naiveSolve(level).map((s) => JSON.stringify(s)).sort();
    assert.deepEqual(mine, naive, text);
    if (mine.length) solvable += 1;
    for (const s of solve(level)) {
      assert.ok(fitsTray(level, s), text);
      assert.ok(check(level, s).ok, text);
    }
    assert.equal(solve(level, { limit: 1 }).length, Math.min(1, mine.length), text);
  }
  assert.ok(solvable > 100, `решаемых схем: ${solvable}`);
});

test('лоток: сколько деталей осталось, полна ли расстановка, помещается ли она', () => {
  const level = parseLevel(PYRAMID);
  const setup = emptySetup(level);
  assert.deepEqual(setup, { kinds: [null, null], nots: [0] });
  assert.deepEqual(trayLeft(level, setup), { and: 1, or: 1, not: 1 });
  assert.equal(isComplete(setup), false);
  assert.deepEqual(trayLeft(level, { kinds: ['and', 'or'], nots: [1] }), { and: 0, or: 0, not: 0 });
  assert.equal(isComplete({ kinds: ['and', 'or'], nots: [0] }), true);
  assert.equal(fitsTray(level, { kinds: ['and', 'and'], nots: [0] }), false);
});

test('детали ставятся только из того, что есть в лотке; стоявшее возвращается', () => {
  const level = parseLevel(PYRAMID);
  const state = newState(7, level);
  assert.equal(isTouched(state), false);
  assert.equal(placeGate(level, state, 0, 'and'), true);
  assert.equal(isTouched(state), true);
  assert.equal(placeGate(level, state, 1, 'and'), false, 'второго И в лотке нет');
  assert.equal(placeGate(level, state, 0, 'and'), false, 'то же самое — не ход');
  assert.equal(placeGate(level, state, 0, 'or'), true, 'замена: И вернулось в лоток');
  assert.deepEqual(trayLeft(level, state), { and: 1, or: 0, not: 1 });
  assert.equal(placeGate(level, state, 1, 'and'), true);
  assert.equal(placeGate(level, state, 5, 'and'), false);
  assert.equal(placeGate(level, state, 0, 'xor'), false);
  assert.equal(swapGates(state, 0, 1), true);
  assert.deepEqual(state.kinds, ['and', 'or']);
  assert.equal(swapGates(state, 0, 0), false);
  assert.equal(placeGate(level, state, 0, null), true);
  assert.equal(swapGates(state, 0, 1), true, 'перенос в пустое гнездо');
  assert.deepEqual(state.kinds, ['or', null]);
  assert.equal(placeNot(level, state, 0, 1), true);
  assert.equal(placeNot(level, state, 0, 1), false);
  assert.equal(placeNot(level, state, 3, 1), false);
  assert.equal(placeNot(level, state, 0, 0), true);
});

test('«НЕ» переносится с колечка на свободное колечко', () => {
  const level = parseLevel('35;41&AoBo;41o;10=1;001');
  const state = newState(1, level);
  assert.equal(placeNot(level, state, 0, 1), true);
  assert.equal(placeNot(level, state, 1, 1), false, 'второго НЕ в лотке нет');
  assert.equal(moveNot(state, 0, 2), true);
  assert.deepEqual(state.nots, [0, 0, 1]);
  assert.equal(moveNot(state, 0, 1), false, 'переносить нечего');
  assert.equal(moveNot(state, 2, 2), false);
});

test('подсказки доводят любую расстановку до решения, не выходя за лоток, и закрепляют поставленное', () => {
  const rng = rngFrom(5);
  let checked = 0;
  for (let i = 0; i < 600 && checked < 120; i++) {
    const text = randomLevel(rng);
    const level = parseLevel(text);
    const solutions = solve(level);
    if (!solutions.length) {
      assert.equal(hintFor(level, emptySetup(level), solutions), null);
      continue;
    }
    checked += 1;
    // начало — случайная расстановка из лотка
    const state = newState(1, level);
    for (let k = 0; k < state.kinds.length; k++) placeGate(level, state, k, rng() < 0.5 ? 'and' : 'or');
    for (let k = 0; k < state.nots.length; k++) if (rng() < 0.4) placeNot(level, state, k, 1);
    let steps = 0;
    while (applyHint(level, state, solutions)) {
      steps += 1;
      assert.ok(fitsTray(level, state), `${text}: подсказка вышла за лоток`);
      assert.ok(steps <= state.kinds.length + state.nots.length, `${text}: подсказки не кончаются`);
    }
    assert.equal(state.hints, steps);
    assert.ok(isComplete(state) && check(level, state).ok, `${text}: после подсказок не решено`);
    assert.equal(new Set(state.lockK).size, state.lockK.length);
    // закреплённое не снять и не заменить
    for (const k of state.lockK) {
      assert.equal(placeGate(level, state, k, null), false);
      assert.equal(swapGates(state, k, (k + 1) % Math.max(2, state.kinds.length)), false);
    }
    for (const k of state.lockR) assert.equal(placeNot(level, state, k, state.nots[k] ? 0 : 1), false);
  }
  assert.ok(checked >= 100);
});

test('подсказка: сначала пустое гнездо, потом неверный вентиль, потом колечки; решено — подсказывать нечего', () => {
  const level = parseLevel('246;31*AB 51*BC 42&12o;43;100=1;111');
  const solutions = solve(level);
  assert.deepEqual(solutions, [{ kinds: ['or', 'and'], nots: [1] }]);
  const [answer] = solutions;
  assert.deepEqual(hintFor(level, { kinds: ['or', null], nots: [0] }), { socket: 1, kind: 'and' });
  assert.deepEqual(hintFor(level, { kinds: ['and', 'or'], nots: [0] }), { socket: 0, kind: 'or' });
  assert.deepEqual(hintFor(level, { kinds: ['or', 'and'], nots: [0] }), { ring: 0, on: 1 });
  assert.equal(hintFor(level, answer), null);
  assert.equal(distance({ kinds: ['and', 'or'], nots: [0] }, answer), 3);
  assert.equal(nearestSolution({ kinds: ['and', 'or'], nots: [0], lockK: [0], lockR: [] }, solutions), null, 'закреплено не то, что в решении');
  // нужного вентиля в лотке нет — он снимается оттуда, где стоит зря
  const state = { ...newState(1, level), kinds: ['and', 'or'] };
  assert.deepEqual(applyHint(level, state), { socket: 0, kind: 'or' });
  assert.deepEqual(state.kinds, ['or', null]);
  assert.deepEqual(state.lockK, [0]);
  assert.equal(state.hints, 1);
});

test('звёзды: с первого включения — три, каждое включение впустую и подсказка — минус одна, но не меньше одной', () => {
  assert.equal(starsFor(0, 0), 3);
  assert.equal(starsFor(1, 0), 2);
  assert.equal(starsFor(0, 1), 2);
  assert.equal(starsFor(1, 1), 1);
  assert.equal(starsFor(7, 4), 1);
});

test('сохранённый уровень проверяется: битое — значит уровень с начала', () => {
  const level = parseLevel(PYRAMID);
  const good = { ...newState(7, level), kinds: ['and', null], nots: [1], fails: 2, hints: 1, lockK: [0] };
  assert.equal(isValidState(good, level, 7), true);
  assert.equal(isValidState(newState(7, level), level, 7), true);
  const broken = [
    null, 'строка', {}, { ...good, v: 2 }, { ...good, level: 8 }, { ...good, kinds: ['and'] }, { ...good, kinds: ['and', 'xor'] },
    { ...good, kinds: ['and', 'and'] }, { ...good, nots: [2] }, { ...good, nots: [] }, { ...good, fails: -1 }, { ...good, hints: 1.5 },
    { ...good, lockK: [0, 0] }, { ...good, lockK: [5] }, { ...good, lockR: 'да' }, { ...good, lockK: undefined },
  ];
  for (const state of broken) assert.equal(isValidState(state, level, 7), false, JSON.stringify(state));
});

test('прогресс: звёзды по уровням, открытые уровни, следующий уровень', () => {
  const progress = emptyProgress();
  assert.equal(isOpen(progress, 1), true);
  assert.equal(isOpen(progress, 2), false);
  assert.equal(nextLevel(progress, 100), 1);
  assert.equal(recordStars(progress, 1, 2), true);
  assert.equal(recordStars(progress, 1, 1), false, 'хуже прежнего — не записывается');
  assert.equal(recordStars(progress, 1, 3), true);
  assert.equal(recordStars(progress, 2, 1), true);
  assert.equal(starsOf(progress, 1), 3);
  assert.equal(starsOf(progress, 9), 0);
  assert.equal(totalStars(progress), 4);
  assert.equal(passedCount(progress), 2);
  assert.equal(isOpen(progress, 3), true);
  assert.equal(isOpen(progress, 4), false);
  assert.equal(nextLevel(progress, 100), 3);
  assert.equal(nextLevel({ stars: { 1: 1, 2: 1 } }, 2), 2, 'всё пройдено — последний');
  assert.equal(isValidProgress(progress), true);
});

test('прогресс: мусор отбрасывается, звёзд не больше трёх, уровней — не больше, чем в игре', () => {
  assert.deepEqual(migrateProgress(null), emptyProgress());
  assert.deepEqual(migrateProgress({ stars: [3, 3] }), emptyProgress());
  assert.deepEqual(migrateProgress({ stars: { 1: 3, 2: 9, 3: 0, 4: -1, 5: 1.5, x: 2, '01': 3, 101: 2, 100: 1 } }, 100), { stars: { 1: 3, 2: 3, 100: 1 } });
  assert.equal(isValidProgress({ stars: { 1: 5 } }), false);
  assert.equal(isValidProgress({ stars: {}, extra: 1 }), false);
});

test('статистика и склонение', () => {
  assert.deepEqual(emptyStats(), { solved: 0, perfect: 0, launches: 0, hints: 0 });
  assert.deepEqual(migrateStats({ solved: 4, perfect: 'много', launches: -2, hints: 1, чужое: 9 }), { solved: 4, perfect: 0, launches: 0, hints: 1 });
  assert.equal(isValidStats(emptyStats()), true);
  assert.equal(isValidStats({ solved: 1 }), false);
  assert.equal(plural(1, ['включение', 'включения', 'включений']), 'включение');
  assert.equal(plural(3, ['включение', 'включения', 'включений']), 'включения');
  assert.equal(plural(12, ['включение', 'включения', 'включений']), 'включений');
});
