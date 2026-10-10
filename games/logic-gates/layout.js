// «Логические схемы» — геометрия схемы без DOM: где стоят источники, вентили и лампы, как идут провода.
//
// Узлы стоят на сетке столбцов (шаг GX), слоями снизу вверх: источники, вентили, лампы. Между соседними слоями —
// канал: из узла провод идёт вертикально вверх (ствол), в канале под потребителем сворачивает на свою дорожку и по ней
// доходит до входа. Провода разных узлов, которые в канале перекрываются по горизонтали, идут по разным дорожкам;
// раскладка по дорожкам перебирается целиком и берётся та, где меньше пересечений. Ствол может пройти сквозь слой
// (провод «через этаж») — только если в его столбце там нет вентиля.
//
// Провод узла — дерево отрезков от его выхода; оно режется на куски (от развилки до развилки): у куска есть путь
// со скруглёнными углами и расстояние от выхода узла — по нему ток «добегает» до куска в анимации.

import { layerOf, columnOf } from './logic.js';

export const GX = 40;                               // шаг сетки столбцов
export const CHIP = { w: 68, h: 40, pin: 18 };      // вентиль; pin — отступ входов от середины
export const BEAD = { w: 30, h: 19, drop: 17 };     // «НЕ» на входе; drop — от входа вниз до середины бусины
export const SRC = { w: 30, h: 30 };
export const LAMP = { r: 17, base: 9 };             // колба и цоколь под ней (вход лампы — низ цоколя)
export const TRACK = 9;                             // шаг дорожек в канале
const STUB_OUT = 11;                                // от выхода узла до нижней дорожки
const STUB_IN = 13;                                 // от верхней дорожки до входа
const STUB_BEAD = Math.ceil(BEAD.drop + BEAD.h / 2 + 9);   // то же, когда на входах слоя есть место под «НЕ»
const CORNER = 7;                                   // радиус скругления
const GAP = 12;                                     // зазор между проводами на одной дорожке
const PAD = { top: 16, bottom: 12, side: 22 };
const MAX_BRUTE = 6;                                // до стольких проводов в канале раскладка перебирается целиком

const pinKey = (pin) => (pin.out === undefined ? `g${pin.gate}:${pin.pin}` : `o${pin.out}`);

/** Входы потребителей слоя layer: вентилей (по два) или ламп. */
function pinsOfLayer(level, layer) {
  const pins = [];
  if (layer === level.layers + 1) {
    level.outs.forEach((o, i) => pins.push({ out: i, x: o.x * GX, net: o.from, mark: o.mark }));
    return pins;
  }
  level.gates.forEach((g, i) => {
    if (g.layer !== layer) return;
    g.ins.forEach((p, k) => pins.push({ gate: i, pin: k, x: g.x * GX + (k ? CHIP.pin : -CHIP.pin), net: p.from, mark: p.mark }));
  });
  return pins;
}

/**
 * Раскладка проводов канала по дорожкам. runs — провода с горизонтальным участком { net, lo, hi },
 * verts(track) — вертикали канала при данной раскладке. Дорожка 0 — верхняя (у потребителей).
 * → { track: Map(net → дорожка), count, crossings } или null, если без наложений не разложить.
 */
function assignTracks(runs, vertsFor) {
  const n = runs.length;
  if (!n) {
    const verts = vertsFor(new Map(), 0);
    return clash(verts) ? null : { track: new Map(), count: 0, crossings: 0 };
  }
  let best = null;
  const tracks = new Array(n).fill(0);
  const consider = () => {
    const count = Math.max(...tracks) + 1;
    for (let t = 0; t < count; t++) if (!tracks.includes(t)) return;        // без пустых дорожек
    for (let a = 0; a < n; a++) {
      for (let b = a + 1; b < n; b++) {
        if (tracks[a] === tracks[b] && runs[a].lo < runs[b].hi + GAP && runs[b].lo < runs[a].hi + GAP) return;
      }
    }
    const track = new Map(runs.map((r, k) => [r.net, tracks[k]]));
    const verts = vertsFor(track, count);
    if (clash(verts)) return;
    let crossings = 0;
    let length = 0;
    for (const v of verts) {
      length += v.b - v.a;
      for (let k = 0; k < n; k++) {
        if (runs[k].net !== v.net && runs[k].lo < v.x && v.x < runs[k].hi && v.a < tracks[k] && tracks[k] < v.b) crossings += 1;
      }
    }
    const score = [crossings, count, length];
    if (!best || score[0] < best.score[0] || (score[0] === best.score[0] && (score[1] < best.score[1]
      || (score[1] === best.score[1] && score[2] < best.score[2])))) {
      best = { track, count, crossings, score };
    }
  };
  if (n <= MAX_BRUTE) {
    const walk = (k) => {
      if (k === n) return consider();
      for (let t = 0; t < n; t++) {
        tracks[k] = t;
        walk(k + 1);
      }
      return null;
    };
    walk(0);
  } else {
    // много проводов — каждому своя дорожка, слева направо
    [...runs.keys()].sort((a, b) => runs[a].lo - runs[b].lo).forEach((k, t) => { tracks[k] = t; });
    consider();
  }
  return best && { track: best.track, count: best.count, crossings: best.crossings };
}

/** Накладываются ли вертикали разных проводов друг на друга. */
function clash(verts) {
  for (let i = 0; i < verts.length; i++) {
    for (let j = i + 1; j < verts.length; j++) {
      const a = verts[i];
      const b = verts[j];
      if (a.net !== b.net && Math.abs(a.x - b.x) < 8 && Math.max(a.a, b.a) < Math.min(a.b, b.b)) return true;
    }
  }
  return false;
}

/** Путь по точкам со скруглёнными углами. */
export function roundPath(pts, radius = CORNER) {
  const f = (v) => Math.round(v * 100) / 100;
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) {
    const [x, y] = pts[i];
    if (i === pts.length - 1) {
      d += `L${f(x)} ${f(y)}`;
      break;
    }
    const [px, py] = pts[i - 1];
    const [nx, ny] = pts[i + 1];
    const inLen = Math.hypot(x - px, y - py);
    const outLen = Math.hypot(nx - x, ny - y);
    const r = Math.min(radius, inLen / 2, outLen / 2);
    const ax = x - ((x - px) / inLen) * r;
    const ay = y - ((y - py) / inLen) * r;
    const bx = x + ((nx - x) / outLen) * r;
    const by = y + ((ny - y) / outLen) * r;
    d += `L${f(ax)} ${f(ay)}Q${f(x)} ${f(y)} ${f(bx)} ${f(by)}`;
  }
  return d;
}

/**
 * Геометрия уровня. Ошибка раскладки (вентиль на пути ствола, провода накладываются) — исключение.
 * → {
 *   box: { x, y, w, h } — рамка схемы (viewBox),
 *   sources: [{ x, y }], gates: [{ x, y }], outs: [{ x, y }] — середины,
 *   nets: [{ node, pieces: [{ d, at, len }], dots: [{ x, y, at }] }] — провод каждого узла (at — расстояние от выхода),
 *   pins: Map(ключ входа → { x, y, mark, net, dist, bead: { x, y } | null, tail: { d, len } | null }),
 *   crossings — сколько пересечений проводов,
 * }
 */
export function layout(level) {
  const S = level.sources.length;
  const L = level.layers;
  const N = S + level.gates.length;
  const xOf = (node) => columnOf(level, node) * GX;

  // потребители каждого узла по слоям
  const channels = [];
  for (let c = 0; c <= L; c++) channels.push({ pins: pinsOfLayer(level, c + 1) });
  const topLayer = new Array(N).fill(0);        // самый высокий слой, где у узла есть потребитель
  channels.forEach((ch, c) => ch.pins.forEach((pin) => { topLayer[pin.net] = Math.max(topLayer[pin.net], c + 1); }));

  // ствол не должен упираться в вентиль
  for (let node = 0; node < N; node++) {
    for (let l = layerOf(level, node) + 1; l < topLayer[node]; l++) {
      if (level.gates.some((g) => g.layer === l && g.x === columnOf(level, node))) {
        throw new Error(`раскладка «${level.text}»: провод узла ${node} упирается в вентиль слоя ${l}`);
      }
    }
  }

  let crossings = 0;
  channels.forEach((ch, c) => {
    const here = [];                            // узлы, чьи провода есть в канале
    for (let node = 0; node < N; node++) if (layerOf(level, node) <= c && topLayer[node] > c) here.push(node);
    const tops = (node) => ch.pins.filter((pin) => pin.net === node).map((pin) => pin.x);
    const runs = [];
    for (const node of here) {
      const xs = tops(node);
      const px = xOf(node);
      if (xs.some((x) => x !== px)) runs.push({ net: node, lo: Math.min(px, ...xs), hi: Math.max(px, ...xs) });
    }
    // вертикали канала в «уровнях»: −1 — верх (входы), count — низ (выходы), между ними дорожки
    const vertsFor = (track, count) => {
      const verts = [];
      for (const node of here) {
        const px = xOf(node);
        const xs = tops(node);
        const t = track.get(node);
        const through = topLayer[node] > c + 1 || xs.includes(px);
        verts.push({ net: node, x: px, a: t === undefined || through ? -1 : t, b: count });
        if (t !== undefined) for (const x of xs) if (x !== px) verts.push({ net: node, x, a: -1, b: t });
      }
      return verts;
    };
    const plan = assignTracks(runs, vertsFor);
    if (!plan) throw new Error(`раскладка «${level.text}»: провода накладываются в канале ${c}`);
    ch.track = plan.track;
    ch.count = plan.count;
    ch.stub = ch.pins.some((pin) => pin.mark) ? STUB_BEAD : STUB_IN;
    crossings += plan.crossings;
  });

  // высоты — сверху вниз
  const outY = PAD.top + LAMP.r;
  const layerY = new Array(L + 2).fill(0);      // середины узлов слоя
  layerY[L + 1] = outY;
  let pinY = outY + LAMP.r + LAMP.base;         // низ потребителей слоя над каналом
  for (let c = L; c >= 0; c--) {
    const ch = channels[c];
    ch.top = pinY;
    ch.trackY = (t) => ch.top + ch.stub + t * TRACK;
    ch.bottom = ch.top + ch.stub + Math.max(0, ch.count - 1) * TRACK + STUB_OUT;
    const h = c === 0 ? SRC.h : CHIP.h;
    layerY[c] = ch.bottom + h / 2;
    pinY = ch.bottom + h;
  }
  const height = pinY + PAD.bottom;

  const sources = level.sources.map((s) => ({ x: s.x * GX, y: layerY[0] }));
  const gates = level.gates.map((g) => ({ x: g.x * GX, y: layerY[g.layer] }));
  const outs = level.outs.map((o) => ({ x: o.x * GX, y: outY }));

  // входы: где кончается провод узла и начинается хвостик после «НЕ»
  const pins = new Map();
  channels.forEach((ch) => ch.pins.forEach((pin) => {
    const bead = pin.mark ? { x: pin.x, y: ch.top + BEAD.drop } : null;
    pins.set(pinKey(pin), {
      x: pin.x, y: ch.top, mark: pin.mark, net: pin.net, dist: 0, bead,
      tail: bead ? { d: `M${pin.x} ${bead.y}L${pin.x} ${ch.top}`, len: BEAD.drop } : null,
    });
  }));

  // провода: дерево от выхода узла
  const nets = [];
  for (let node = 0; node < N; node++) {
    const px = xOf(node);
    const l0 = layerOf(level, node);
    const point = (x, y, pin = null) => ({ x, y, pin, kids: [] });
    const root = point(px, channels[l0].bottom);
    let cur = root;
    for (let c = l0; c < topLayer[node]; c++) {
      const ch = channels[c];
      const mine = ch.pins.filter((pin) => pin.net === node);
      const end = (pin) => {
        const rec = pins.get(pinKey(pin));
        return point(pin.x, rec.bead ? rec.bead.y : rec.y, rec);
      };
      const side = mine.filter((pin) => pin.x !== px);
      if (side.length) {
        const y = ch.trackY(ch.track.get(node));
        const joint = point(px, y);
        cur.kids.push(joint);
        cur = joint;
        for (const dir of [-1, 1]) {
          const list = side.filter((pin) => Math.sign(pin.x - px) === dir).sort((a, b) => dir * (a.x - b.x));
          let prev = joint;
          for (const pin of list) {
            const turn = point(pin.x, y);
            prev.kids.push(turn);
            turn.kids.push(end(pin));
            prev = turn;
          }
        }
      }
      const straight = mine.find((pin) => pin.x === px);
      if (straight) cur.kids.push(end(straight));
    }

    const pieces = [];
    const dots = [];
    const emit = (from, first, at) => {
      const pts = [[from.x, from.y], [first.x, first.y]];
      let len = Math.abs(first.x - from.x) + Math.abs(first.y - from.y);
      let n = first;
      while (n.kids.length === 1) {
        const k = n.kids[0];
        len += Math.abs(k.x - n.x) + Math.abs(k.y - n.y);
        pts.push([k.x, k.y]);
        n = k;
      }
      // лишние точки на прямой не нужны
      const clean = pts.filter((p, i) => i === 0 || i === pts.length - 1
        || !((pts[i - 1][0] === p[0] && p[0] === pts[i + 1][0]) || (pts[i - 1][1] === p[1] && p[1] === pts[i + 1][1])));
      pieces.push({ d: roundPath(clean), at, len });
      if (n.pin) n.pin.dist = at + len;
      if (n.kids.length > 1) {
        dots.push({ x: n.x, y: n.y, at: at + len });
        for (const k of n.kids) emit(n, k, at + len);
      }
    };
    for (const k of root.kids) emit(root, k, 0);
    nets.push({ node, pieces, dots });
  }

  // рамка: по содержимому, с полями
  const xs = [
    ...sources.flatMap((p) => [p.x - SRC.w / 2, p.x + SRC.w / 2]),
    ...gates.flatMap((p) => [p.x - CHIP.w / 2, p.x + CHIP.w / 2]),
    ...outs.flatMap((p) => [p.x - LAMP.r - 12, p.x + LAMP.r + 12]),
  ];
  const x0 = Math.min(...xs) - PAD.side;
  const x1 = Math.max(...xs) + PAD.side;

  return { box: { x: x0, y: 0, w: x1 - x0, h: height }, sources, gates, outs, nets, pins, crossings };
}

// ---------- как ток бежит по схеме ----------

export const FLOW = { speed: 0.34, gate: 120, bead: 80, lamp: 70 };   // speed — единиц схемы в миллисекунду

/**
 * Когда что загорается при включении тока (мс от включения): провод узла начинает светиться в netAt[узел],
 * до входа ток добегает в pinAt.get(ключ) (bead — когда доходит до «НЕ»), вентиль срабатывает в gateAt[i],
 * лампа — в outAt[i]. Провод без тока «бежит» так же — просто его не видно.
 * hasBead(ключ входа) — стоит ли на входе «НЕ».
 */
export function timeline(level, lay, hasBead, flow = FLOW) {
  const S = level.sources.length;
  const netAt = new Array(S + level.gates.length).fill(0);
  const pinAt = new Map();
  const arrive = (key) => {
    const pin = lay.pins.get(key);
    const bead = netAt[pin.net] + pin.dist / flow.speed;
    const at = bead + (pin.tail ? (hasBead(key) ? flow.bead : 0) + pin.tail.len / flow.speed : 0);
    pinAt.set(key, { bead, at });
    return at;
  };
  const gateAt = level.gates.map((g, i) => {
    const at = Math.max(arrive(`g${i}:0`), arrive(`g${i}:1`)) + flow.gate;
    netAt[S + i] = at;
    return at;
  });
  const outAt = level.outs.map((o, i) => arrive(`o${i}`) + flow.lamp);
  return { netAt, pinAt, gateAt, outAt, total: Math.max(...outAt) };
}
