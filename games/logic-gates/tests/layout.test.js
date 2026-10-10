// Раскладка «Логических схем»: провода не накладываются и не идут сквозь детали, расстояния по проводу верны,
// ток доходит до вентиля раньше, чем тот срабатывает. Геометрия проверяется независимо — по готовым путям.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLevel, layerOf } from '../logic.js';
import { layout, timeline, roundPath, FLOW, GX, CHIP, BEAD, SRC, LAMP } from '../layout.js';
import { board, word, chip, bead } from '../art.js';
import { LEVELS } from '../levels.js';

/** Путь «M… L… Q…» → отрезки по опорным точкам (скругление заменено углом). */
function segmentsOf(d) {
  const nums = d.match(/-?\d+(\.\d+)?/g).map(Number);
  const cmds = d.match(/[MLQ]/g);
  const pts = [];
  let i = 0;
  for (const c of cmds) {
    if (c === 'Q') {
      pts.push([nums[i], nums[i + 1]]);          // вершина угла; точка после неё совпадёт с началом следующего отрезка
      i += 4;
    } else {
      pts.push([nums[i], nums[i + 1]]);
      i += 2;
    }
  }
  // точки подхода к углу и выхода из него лежат на тех же прямых — оставляем только вершины
  const corners = pts.filter((p, k) => k === 0 || k === pts.length - 1
    || !((pts[k - 1][0] === p[0] && p[0] === pts[k + 1][0]) || (pts[k - 1][1] === p[1] && p[1] === pts[k + 1][1])));
  const out = [];
  for (let k = 1; k < corners.length; k++) out.push([...corners[k - 1], ...corners[k]]);
  return out;
}

const netSegments = (lay) => lay.nets.map((net) => net.pieces.flatMap((p) => segmentsOf(p.d)));
const isV = (s) => s[0] === s[2];
const lo = (s, v) => Math.min(s[v], s[v + 2]);
const hi = (s, v) => Math.max(s[v], s[v + 2]);

/** Лежат ли два отрезка разных проводов на одной прямой внахлёст (или ближе шести единиц). */
function overlap(a, b) {
  if (isV(a) !== isV(b)) return false;
  const [along, across] = isV(a) ? [1, 0] : [0, 1];
  if (Math.abs(a[across] - b[across]) >= 6) return false;
  return Math.max(lo(a, along), lo(b, along)) < Math.min(hi(a, along), hi(b, along)) - 0.01;
}

const crosses = (a, b) => {
  if (isV(a) === isV(b)) return false;
  const [v, h] = isV(a) ? [a, b] : [b, a];
  return lo(h, 0) < v[0] && v[0] < hi(h, 0) && lo(v, 1) < h[1] && h[1] < hi(v, 1);
};

test('все отрезки проводов — вертикальные или горизонтальные, каждый провод начинается на выходе своего узла', () => {
  for (const text of LEVELS) {
    const level = parseLevel(text);
    const lay = layout(level);
    netSegments(lay).forEach((segs, node) => {
      assert.ok(segs.length > 0, `${text}: у узла ${node} нет провода`);
      for (const s of segs) assert.ok(s[0] === s[2] || s[1] === s[3], `${text}: косой отрезок ${s}`);
      const p = node < level.sources.length ? lay.sources[node] : lay.gates[node - level.sources.length];
      const top = p.y - (node < level.sources.length ? SRC.h : CHIP.h) / 2;
      assert.deepEqual([segs[0][0], segs[0][1]], [p.x, top], `${text}: провод узла ${node} начинается не на выходе`);
    });
  }
});

test('провода разных узлов нигде не накладываются; пересечений столько, сколько сказала раскладка', () => {
  for (const text of LEVELS) {
    const lay = layout(parseLevel(text));
    const nets = netSegments(lay);
    let crossings = 0;
    for (let a = 0; a < nets.length; a++) {
      for (let b = a + 1; b < nets.length; b++) {
        for (const s of nets[a]) {
          for (const t of nets[b]) {
            assert.ok(!overlap(s, t), `${text}: провода узлов ${a} и ${b} накладываются: ${s} и ${t}`);
            if (crosses(s, t)) crossings += 1;
          }
        }
      }
    }
    assert.equal(crossings, lay.crossings, text);
  }
});

test('провод не проходит сквозь чужой вентиль, источник или лампу', () => {
  for (const text of LEVELS) {
    const level = parseLevel(text);
    const lay = layout(level);
    const boxes = [
      ...lay.sources.map((p) => ({ x0: p.x - SRC.w / 2, x1: p.x + SRC.w / 2, y0: p.y - SRC.h / 2, y1: p.y + SRC.h / 2 })),
      ...lay.gates.map((p) => ({ x0: p.x - CHIP.w / 2, x1: p.x + CHIP.w / 2, y0: p.y - CHIP.h / 2, y1: p.y + CHIP.h / 2 })),
      ...lay.outs.map((p) => ({ x0: p.x - LAMP.r, x1: p.x + LAMP.r, y0: p.y - LAMP.r, y1: p.y + LAMP.r + LAMP.base })),
    ];
    netSegments(lay).forEach((segs, node) => {
      for (const s of segs) {
        for (const box of boxes) {
          // своего узла и потребителей провод касается только кромки — строго внутрь не заходит
          const hit = isV(s)
            ? s[0] > box.x0 && s[0] < box.x1 && Math.max(lo(s, 1), box.y0) < Math.min(hi(s, 1), box.y1) - 0.01
            : s[1] > box.y0 && s[1] < box.y1 && Math.max(lo(s, 0), box.x0) < Math.min(hi(s, 0), box.x1) - 0.01;
          assert.ok(!hit, `${text}: провод узла ${node} идёт сквозь деталь: ${s}`);
        }
      }
    });
  }
});

test('провод не задевает чужую бусину «НЕ» и колечко под неё', () => {
  for (const text of LEVELS) {
    const lay = layout(parseLevel(text));
    const nets = netSegments(lay);
    for (const [key, pin] of lay.pins) {
      if (!pin.bead) continue;
      const box = { x0: pin.bead.x - BEAD.w / 2 - 3, x1: pin.bead.x + BEAD.w / 2 + 3, y0: pin.bead.y - BEAD.h / 2 - 3, y1: pin.bead.y + BEAD.h / 2 + 3 };
      nets.forEach((segs, node) => {
        if (node === pin.net) return;
        for (const s of segs) {
          const hit = isV(s)
            ? s[0] > box.x0 && s[0] < box.x1 && Math.max(lo(s, 1), box.y0) < Math.min(hi(s, 1), box.y1)
            : s[1] > box.y0 && s[1] < box.y1 && Math.max(lo(s, 0), box.x0) < Math.min(hi(s, 0), box.x1);
          assert.ok(!hit, `${text}: провод узла ${node} задевает «НЕ» на входе ${key}`);
        }
      });
    }
  }
});

test('расстояние до входа — длина пути по проводу от выхода узла; хвостик после «НЕ» — до самого входа', () => {
  for (const text of LEVELS) {
    const level = parseLevel(text);
    const lay = layout(level);
    const S = level.sources.length;
    for (const [key, pin] of lay.pins) {
      const from = pin.net < S ? lay.sources[pin.net] : lay.gates[pin.net - S];
      const top = from.y - (pin.net < S ? SRC.h : CHIP.h) / 2;
      const end = pin.bead ? pin.bead.y : pin.y;
      // провод идёт только вверх и вбок: длина — подъём плюс сдвиг по горизонтали
      assert.equal(pin.dist, (top - end) + Math.abs(pin.x - from.x), `${text}: ${key}`);
      assert.equal(Boolean(pin.tail), Boolean(pin.mark), `${text}: ${key}`);
      if (pin.tail) {
        assert.equal(pin.tail.len, BEAD.drop);
        assert.equal(pin.bead.y - pin.y, BEAD.drop);
      }
      const consumer = key[0] === 'o' ? lay.outs[Number(key.slice(1))] : lay.gates[Number(key.slice(1).split(':')[0])];
      assert.equal(pin.y, consumer.y + (key[0] === 'o' ? LAMP.r + LAMP.base : CHIP.h / 2), `${text}: ${key} не на нижней кромке`);
    }
  }
});

test('куски провода: начало куска — расстояние от выхода, развилки отмечены точками', () => {
  const level = parseLevel('246;31*AB 51*BC;31 52;110=10;110');
  const lay = layout(level);
  // B питает оба вентиля: ствол до развилки и две ветки от неё
  const net = lay.nets[1];
  assert.equal(net.pieces.length, 3);
  assert.equal(net.dots.length, 1);
  assert.equal(net.pieces[0].at, 0);
  assert.equal(net.pieces[1].at, net.pieces[0].len);
  assert.equal(net.pieces[2].at, net.pieces[0].len);
  assert.equal(net.dots[0].at, net.pieces[0].len);
  assert.deepEqual([net.dots[0].x, net.dots[0].y], [4 * GX, lay.sources[1].y - SRC.h / 2 - net.pieces[0].len]);
  // у остальных проводов развилок нет
  for (const k of [0, 2, 3, 4]) assert.equal(lay.nets[k].dots.length, 0);
  assert.equal(lay.crossings, 0);
});

test('узлы стоят слоями снизу вверх, рамка охватывает всю схему', () => {
  for (const text of LEVELS) {
    const level = parseLevel(text);
    const lay = layout(level);
    const S = level.sources.length;
    const ys = [];
    for (let node = 0; node < S + level.gates.length; node++) {
      const p = node < S ? lay.sources[node] : lay.gates[node - S];
      ys[layerOf(level, node)] ??= p.y;
      assert.equal(p.y, ys[layerOf(level, node)], `${text}: слой не на одной высоте`);
    }
    for (let l = 1; l < ys.length; l++) assert.ok(ys[l] < ys[l - 1] - CHIP.h, `${text}: слои слиплись`);
    for (const p of lay.outs) assert.ok(p.y < ys[ys.length - 1] - CHIP.h / 2 - LAMP.r, text);
    const { box } = lay;
    for (const p of [...lay.sources, ...lay.gates, ...lay.outs]) {
      assert.ok(p.x - CHIP.w / 2 >= box.x && p.x + CHIP.w / 2 <= box.x + box.w, `${text}: узел за рамкой`);
      assert.ok(p.y > box.y && p.y < box.y + box.h, text);
    }
  }
});

test('ствол, упёршийся в вентиль, — ошибка раскладки', () => {
  // источник B (столбец 4) идёт к вентилю второго слоя сквозь вентиль первого слоя в том же столбце
  assert.throws(() => layout(parseLevel('246;41*AC 52*BC;41 52;111=11;200')), /упирается в вентиль/);
});

test('ток: вентиль срабатывает после обоих входов, лампа — после своего вентиля; «НЕ» задерживает', () => {
  for (const text of LEVELS) {
    const level = parseLevel(text);
    const lay = layout(level);
    const S = level.sources.length;
    const tl = timeline(level, lay, () => true);
    level.gates.forEach((g, i) => {
      for (const k of [0, 1]) {
        const at = tl.pinAt.get(`g${i}:${k}`);
        assert.ok(at.at >= tl.netAt[g.ins[k].from], text);
        assert.ok(tl.gateAt[i] >= at.at + FLOW.gate - 1e-9, text);
      }
      assert.equal(tl.netAt[S + i], tl.gateAt[i]);
    });
    level.outs.forEach((o, i) => assert.ok(tl.outAt[i] > tl.netAt[o.from], text));
    assert.equal(tl.total, Math.max(...tl.outAt));
    // без «НЕ» на входах ток приходит не позже
    const bare = timeline(level, lay, () => false);
    assert.ok(bare.total <= tl.total, text);
  }
  // время бега — расстояние, делённое на скорость
  const level = parseLevel('35;41&AB;41;11=1;000');
  const lay = layout(level);
  const tl = timeline(level, lay, () => false, { speed: 1, gate: 100, bead: 50, lamp: 10 });
  const dist = lay.pins.get('g0:0').dist;
  assert.equal(tl.gateAt[0], dist + 100);
  assert.equal(tl.outAt[0], dist + 100 + lay.pins.get('o0').dist + 10);
});

test('скругление: угол заменяется дугой, короткий отрезок — дугой поменьше', () => {
  assert.equal(roundPath([[0, 0], [0, 20]]), 'M0 0L0 20');
  assert.equal(roundPath([[0, 40], [0, 20], [30, 20]], 7), 'M0 40L0 27Q0 20 7 20L30 20');
  assert.equal(roundPath([[0, 40], [0, 34], [30, 34]], 7), 'M0 40L0 37Q0 34 3 34L30 34');
});

test('рисунок схемы: у каждого гнезда, колечка, входа и провода есть свой узел разметки', () => {
  for (const text of LEVELS) {
    const level = parseLevel(text);
    const lay = layout(level);
    const svg = board(level, lay);
    const count = (re) => (svg.match(re) ?? []).length;
    assert.equal(count(/class="lg-net"/g), level.sources.length + level.gates.length, text);
    assert.equal(count(/class="lg-gate lg-socket-slot"/g), level.sockets.length, text);
    assert.equal(count(/class="lg-mark lg-ring-slot"/g), level.rings.length, text);
    assert.equal(count(/class="lg-lamp"/g), level.outs.length, text);
    assert.equal(count(/class="lg-src"/g), level.sources.length, text);
    const marks = [...lay.pins.values()].filter((p) => p.mark).length;
    assert.equal(count(/class="lg-tail"/g), marks, text);
    assert.equal(count(/class="lg-mark[ "]/g), marks, text);
    const pieces = lay.nets.reduce((sum, net) => sum + net.pieces.length, 0);
    assert.equal(count(/class="lg-live"/g), pieces + marks, text);
    assert.equal(count(/class="lg-glow"/g), pieces + marks, text);
    level.sockets.forEach((g, k) => assert.ok(svg.includes(`data-gate="${g}" data-node="${level.sources.length + g}" data-socket="${k}"`), text));
    level.rings.forEach((_, k) => assert.ok(svg.includes(`data-ring="${k}"`), text));
    assert.ok(!/NaN|undefined/.test(svg), text);
  }
});

test('подписи вентилей — свои буквы из линий: И, ИЛИ, НЕ', () => {
  assert.match(chip('and'), /<path class="lg-word"[^>]* d="M0 0V14L10 0V14"/);
  assert.match(chip('or'), /d="M0 0V14L10 0V14M15 14L20 0L25 14M30 0V14L40 0V14"/);
  assert.match(bead(), /d="M0 0V14M10 0V14M0 7H10M24\.5 0H15V14H24\.5M15 7H22\.5"/);
  // надпись стоит по центру: «ИЛИ» шириной 40 единиц при высоте букв 14
  assert.match(word('ИЛИ', 0, 0, 14, 2), /translate\(-20 -7\) scale\(1\)/);
  assert.match(word('И', 10, 5, 28, 2), /translate\(0 -9\) scale\(2\)" stroke-width="1"/);
});
