// Правила ремонта на всех устройствах: подсказка из начала любого заказа (и из случайной середины) доводит до сдачи
// без искр и лишних деталей, покупая нужное; правила разборки, искры, склад, прошивка, звёзды, деньги, сохранение.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEVICES, KINDS, FAULTS, FAULT_DEFS, COMPLAINTS, TUTORIAL, UNLOCK, newOrder, act, nextStep, symptoms, assembled,
  isValidState, starsFor, emptyProgress, isValidProgress, normProgress, recordWin, faultsFor, seeded, goodFirmware,
  stockKey, shopParts, earningsFor, START_MONEY,
} from '../logic.js';
import { run } from '../terminal.js';

const wallet = (money = 1e6) => ({ money, stock: {} });

/** Пройти заказ по подсказкам; → число шагов. */
function solve(s, w = wallet(), limit = 400) {
  const sparks = s.sparks;
  const waste = s.waste;
  for (let k = 0; k < limit; k++) {
    const st = nextStep(s, w);
    if (!st) return k;
    const r = act(s, st.tool, st.target, w);
    const where = `${s.kind} №${s.level} (${s.faults})`;
    assert.ok(r.ok, `${where}: шаг ${st.tool} → ${st.target} не вышел: ${r.why} ${r.by ?? ''}`);
    assert.ok(isValidState(s), `${where}: после ${st.tool} → ${st.target} состояние неверное`);
    assert.equal(s.sparks, sparks, `${where}: подсказка ${st.tool} → ${st.target} дала искру`);
    assert.equal(s.waste, waste, `${where}: подсказка ${st.tool} → ${st.target} поставила лишнюю деталь`);
    if (st.tool === 'deliver') {
      assert.equal(r.win, true, `${where}: сдали с ${r.problems}`);
      return k + 1;
    }
  }
  assert.fail(`${s.kind} №${s.level} (${s.faults}): подсказка не довела до конца за ${limit} шагов`);
  return limit;
}

test('описания устройств согласованы: шлейфы, винты, пятна, порядок сборки, поломки', () => {
  for (const kind of KINDS) {
    const d = DEVICES[kind];
    const parts = Object.keys(d.parts);
    assert.ok(d.parts[d.battery], kind);
    assert.ok(d.parts.display, `${kind}: экран`);
    for (const [p, ps] of Object.entries(d.parts)) {
      for (const b of ps.blockers) assert.ok(parts.includes(b), `${kind}.${p}: ${b}`);
      if (ps.conn) assert.ok(d.conns[ps.conn], `${kind}.${p}: шлейф ${ps.conn}`);
    }
    for (const [c, cs] of Object.entries(d.conns)) {
      assert.ok(parts.some((p) => d.parts[p].conn === c), `${kind}: у шлейфа ${c} нет детали`);
      for (const u of cs.under) assert.ok(parts.includes(u));
    }
    for (const h of Object.values(d.screws)) assert.ok(parts.includes(h));
    const items = d.order.map((x) => x.split(':'));
    for (const p of parts) assert.ok(items.some(([t, id]) => t === 'p' && id === p), `${kind}: ${p} нет в порядке сборки`);
    for (const c of Object.keys(d.conns)) assert.ok(items.some(([t, id]) => t === 'c' && id === c), `${kind}: шлейфа ${c} нет в порядке`);
    for (const f of d.faults) {
      const def = FAULT_DEFS[f];
      assert.ok(def, f);
      if (def.part) assert.ok(d.parts[def.part], `${kind}: ${f}`);
      if (def.part) assert.ok(d.parts[def.part].price > 0, `${kind}: ${f} — деталь не продаётся`);
      if (def.conn) assert.ok(d.conns[def.conn], `${kind}: ${f}`);
      if (def.spot) assert.ok(d.spots[def.spot], `${kind}: ${f}`);
    }
    assert.ok(d.models.length && d.models.every((m) => /^[A-Z0-9-]+$/.test(m.code)), kind);
  }
  for (const f of FAULTS) assert.ok(COMPLAINTS[f]?.length >= 2, f);
  for (const [lv, [kind, f]] of Object.entries(TUTORIAL)) {
    assert.ok(DEVICES[kind].faults.includes(f), `${lv}: ${kind} ${f}`);
    assert.ok(UNLOCK[kind] <= Number(lv), `${lv}: ${kind} ещё закрыт`);
  }
});

test('новый заказ: неисправен, собран, сохраняется, всегда один и тот же', () => {
  for (let level = 1; level <= 300; level++) {
    const s = newOrder(level);
    assert.ok(isValidState(s), `заказ ${level}`);
    assert.ok(assembled(s));
    assert.ok(symptoms(s).length > 0, `заказ ${level} (${s.kind} ${s.faults}) исправен с самого начала`);
    assert.deepEqual(newOrder(level), s);
    assert.ok(UNLOCK[s.kind] <= level);
    assert.ok(s.pay > 0);
    assert.ok(s.fw.files.includes(goodFirmware(s)));
  }
});

test('поломки заказа — из разных групп своего устройства', () => {
  for (const kind of KINDS) {
    for (let level = 30; level <= 200; level++) {
      const f = faultsFor(kind, level, seeded(level));
      assert.ok(f.length >= 1);
      assert.equal(new Set(f.map((x) => FAULT_DEFS[x].group)).size, f.length, `${kind} ${f}`);
      assert.ok(f.every((x) => DEVICES[kind].faults.includes(x)));
    }
  }
});

test('подсказка доводит любой заказ до сдачи на 3 звезды на каждом устройстве — с закупкой деталей', () => {
  let longest = 0;
  const seen = new Set();
  for (let level = 1; level <= 400; level++) {
    const s = newOrder(level);
    seen.add(s.kind);
    longest = Math.max(longest, solve(s));
    assert.equal(starsFor(s), 3);
    assert.equal(s.returns, 0);
  }
  for (const kind of KINDS) {
    for (const f of DEVICES[kind].faults) solve(newOrder(100, [f], kind));
  }
  assert.equal(seen.size, KINDS.length);
  assert.ok(longest < 150, `самый длинный заказ — ${longest} шагов`);
});

test('подсказка ведёт и из случайной середины на каждом устройстве', () => {
  const tools = ['flip', 'heat', 'suction', 'screwdriver', 'spudger', 'tweezers', 'parts', 'brush', 'alcohol', 'power'];
  const rng = seeded(7);
  for (const kind of KINDS) {
    const d = DEVICES[kind];
    const targets = [...Object.keys(d.parts), ...Object.keys(d.screws), ...Object.keys(d.conns), ...Object.keys(d.spots), 'jack', 'button', 'screen'];
    for (let k = 0; k < 120; k++) {
      const s = newOrder(30 + Math.floor(rng() * 80), null, kind);
      const w = wallet();
      for (const p of shopParts(kind)) w.stock[stockKey(kind, p)] = 1;
      for (let m = 0; m < 70; m++) {
        act(s, tools[Math.floor(rng() * tools.length)], targets[Math.floor(rng() * targets.length)], w);
        assert.ok(isValidState(s), `${kind}: неверное состояние`);
      }
      solve(s, w);
    }
  }
});

test('смартфон: крышка на клею, винты, батарея — до шлейфов', () => {
  const s = newOrder(4);                           // вздутая батарея
  act(s, 'flip');
  assert.equal(act(s, 'suction', 'cover').why, 'glue');
  assert.deepEqual([act(s, 'tweezers', 'battery').why, act(s, 'tweezers', 'battery').by], ['blocked', 'cover']);
  act(s, 'heat', 'cover');
  assert.equal(act(s, 'tweezers', 'cover').why, 'use-suction');
  assert.ok(act(s, 'suction', 'cover').ok);
  assert.equal(act(s, 'spudger', 'bat').by, 'shield');
  assert.equal(act(s, 'tweezers', 'shield').why, 'screws');
  for (const id of ['s1', 's2', 's3', 's4']) assert.ok(act(s, 'screwdriver', id).ok);
  assert.ok(act(s, 'tweezers', 'shield').ok);
  assert.equal(act(s, 'screwdriver', 's1').why, 'no-holder');
  assert.equal(act(s, 'tweezers', 'battery').why, 'bat-connected');
  assert.equal(act(s, 'spudger', 'disp').spark, true);
  assert.equal(s.sparks, 1);
});

test('съёмная батарея: искра, пока стоит; вынул — без искры', () => {
  const s = newOrder(40, ['screen-crack'], 'button');
  assert.equal(s.view, 'front');
  assert.ok(act(s, 'tweezers', 'fascia').ok);
  assert.ok(act(s, 'tweezers', 'keypad').ok);
  assert.equal(act(s, 'spudger', 'disp').spark, true);
  const t = newOrder(40, ['screen-crack'], 'button');
  act(t, 'flip');
  act(t, 'tweezers', 'cover');
  act(t, 'tweezers', 'battery');
  act(t, 'flip');
  act(t, 'tweezers', 'fascia');
  act(t, 'tweezers', 'keypad');
  assert.equal(act(t, 'spudger', 'disp').spark, false);
  // карманка: корпус открывается только без батареи
  const k = newOrder(40, ['umd-dead'], 'psp');
  act(k, 'flip');
  assert.equal(act(k, 'screwdriver', 'h1').by, 'door');
  act(k, 'tweezers', 'door');
  assert.equal(act(k, 'screwdriver', 'h1').by, 'battery');
});

test('склад: без детали не поставить; покупка — за деньги или предоплатой клиента', () => {
  const s = newOrder(2);                           // разбитый экран смартфона
  const w = wallet(1000);
  for (let k = 0; k < 60; k++) {
    const st = nextStep(s, w);
    if (st.tool === 'buy') break;
    act(s, st.tool, st.target, w);
  }
  assert.deepEqual(nextStep(s, w), { tool: 'buy', target: 'display' });
  assert.equal(act(s, 'parts', 'display', w).why, 'no-stock');
  const r = act(s, 'buy', 'display', w);
  assert.ok(r.prepaid, 'денег 1000, экран 1200 — предоплата');
  assert.equal(w.money, 1000);
  assert.equal(s.prepaid, 1200);
  assert.equal(w.stock['phone-display'], 1);
  assert.ok(act(s, 'parts', 'display', w).ok);
  assert.equal(w.stock['phone-display'], 0);
  solve(s, w);
  assert.equal(earningsFor(s), Math.round((s.pay * 1.15 - 1200) / 10) * 10);
  const w2 = wallet(5000);
  act(newOrder(2), 'buy', 'display', w2);
  assert.equal(w2.money, 3800);
});

test('новая деталь вместо исправной — минус звезда и деталь со склада', () => {
  const s = newOrder(1);
  const w = wallet();
  w.stock['phone-cover'] = 1;
  act(s, 'flip');
  act(s, 'heat', 'cover');
  act(s, 'suction', 'cover');
  assert.equal(act(s, 'parts', 'cover', w).wasted, true);
  assert.equal(s.waste, 1);
  assert.equal(w.stock['phone-cover'], 0);
});

test('сдача: несобранное нельзя, неисправное — возврат', () => {
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
  assert.equal(act(s, 'magnifier', 'jack').find, 'jack-dirty');
  assert.ok(act(s, 'brush', 'jack').ok);
  assert.equal(act(s, 'deliver').win, true);
  assert.equal(starsFor(s), 2);
});

test('прошивка: только своя модель и самая свежая версия; диск — сначала заменить', () => {
  const s = newOrder(9);                           // смартфон висит на логотипе
  const own = s.fw.files.filter((f) => f.startsWith(s.fw.code.toLowerCase()));
  assert.equal(own.length, 3);
  const other = s.fw.files.find((f) => !f.startsWith(s.fw.code.toLowerCase()));
  assert.equal(run(s, `flash ${other}`).out.at(-1).c, 'err');
  assert.equal(act(s, 'flash', other).why, 'wrong-model');
  assert.equal(act(s, 'flash', 'nothing.fw').why, 'no-file');
  assert.equal(act(s, 'flash', `${s.fw.code.toLowerCase()}_v${s.fw.installed}.fw`).why, 'same-version');
  const res = run(s, `FLASH  ${goodFirmware(s).toUpperCase()}`);
  assert.equal(res.flash?.ok, true);
  assert.equal(s.bootloop, false);
  assert.equal(act(s, 'flash', goodFirmware(s)).why, 'no-need');
  // ПарДек: мёртвый диск — новый приходит пустым, систему ставит компьютер
  const d = newOrder(19);
  assert.equal(d.kind, 'deck');
  assert.equal(act(d, 'flash', goodFirmware(d)).why, 'disk-error');
  const w = wallet();
  for (let k = 0; k < 80; k++) {
    const st = nextStep(d, w);
    if (st.tool === 'flash') break;
    act(d, st.tool, st.target, w);
  }
  assert.ok(d.blank);
  assert.deepEqual(symptoms(d), ['no-os']);
  assert.equal(run(d, 'devices').out.at(-1).t.includes('диск пуст'), true);
  assert.ok(act(d, 'flash', goodFirmware(d)).ok);
  assert.deepEqual(symptoms(d), []);
});

test('терминал: команды, неизвестное, без связи', () => {
  const s = newOrder(9);
  assert.ok(run(s, 'help').out.length > 3);
  assert.ok(run(s, 'list').out.some((l) => l.t.includes(goodFirmware(s))));
  assert.equal(run(s, 'clear').clear, true);
  assert.equal(run(s, 'exit').exit, true);
  assert.equal(run(s, 'abracadabra').out.at(-1).c, 'err');
  assert.deepEqual(run(s, '   ').out, []);
  const dead = newOrder(7);                        // отошла батарея — компьютер не видит
  assert.equal(run(dead, 'devices').out.at(-1).c, 'warn');
  assert.equal(act(dead, 'flash', goodFirmware(dead)).why, 'no-link');
});

test('вирусы: антивирус на включённом смартфоне, потом давить жуков', () => {
  const s = newOrder(1);
  assert.equal(act(s, 'antivirus', 'screen').why, 'power-off');
  assert.equal(act(s, 'power', 'button').on, true);
  const n = act(s, 'antivirus', 'screen').bugs;
  for (let k = n - 1; k >= 0; k--) assert.equal(act(s, 'squash', 'bug').left, k);
  assert.equal(act(s, 'deliver').win, true);
});

test('сохранение: битое не принимается', () => {
  const s = newOrder(30);
  assert.ok(isValidState(s));
  for (const broke of [
    (x) => { x.v = 1; },
    (x) => { x.kind = 'toaster'; },
    (x) => { x.parts.display.in = 'да'; },
    (x) => { x.conns.disp = 'maybe'; },
    (x) => { x.faults.push('meteor'); },
    (x) => { x.complaint = [['virus', 99]]; },
    (x) => { x.sparks = -1; },
    (x) => { delete x.fw; },
  ]) {
    const c = structuredClone(s);
    broke(c);
    assert.equal(isValidState(c), false, String(broke));
  }
  const ph = newOrder(4);
  ph.parts.shield.in = false;                      // винты без держателя
  assert.equal(isValidState(ph), false);
});

test('прогресс: уровень, звёзды, деньги; старый прогресс получает деньги и склад', () => {
  const p = emptyProgress();
  assert.ok(isValidProgress(p));
  assert.equal(p.money, START_MONEY);
  const s = newOrder(1);
  s.sparks = 1;
  const r = recordWin(p, s);
  assert.equal(r.stars, 2);
  assert.equal(p.level, 2);
  assert.equal(p.money, START_MONEY + r.earned);
  assert.ok(r.earned > 0);
  const old = normProgress({ level: 7, stars: 12, perfect: 3, sparks: 0 });
  assert.equal(old.level, 7);
  assert.equal(old.money, START_MONEY);
  assert.deepEqual(old.stock, {});
  assert.deepEqual(normProgress({ level: 0 }), emptyProgress());
});
