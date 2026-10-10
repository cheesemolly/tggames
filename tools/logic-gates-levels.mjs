// Уровни «Логических схем»: первые уровни глав написаны руками (знакомят с новым), остальные подбираются.
// Подбор: случайный каркас схемы (слои вентилей над источниками, вентиль стоит между своими входами) → раскладка
// проводов без наложений и почти без пересечений → расстановка, у которой из деталей лотка ровно одно решение,
// а каждое гнездо, колечко, источник и проверка на что-то влияют → из запаса берутся самые опрятные схемы,
// от простых к сложным. Зерно постоянное: при повторном запуске уровни те же.
//
//   node tools/logic-gates-levels.mjs            → games/logic-gates/levels.js (около трёх минут)
//   node tools/logic-gates-levels.mjs --stats    → только показать: запас каждой ступени, уровни и число
//                                                  расстановок в каждом, почему каркасы не становились уровнями
// Посмотреть схемы глазами — tools/logic-gates-sheet.html (нужен npm start).

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseLevel, evaluate, solve, MAX_COLUMN } from '../games/logic-gates/logic.js';
import { layout } from '../games/logic-gates/layout.js';

const SEED = 20261010;
export const PER_CHAPTER = 20;
const POOL = 500;               // столько разных уровней набирается на ступень, из них выбираются лучшие
const TRIES = 300000;           // каркасов на ступень
const PER_SKELETON = 60;        // попыток загадки на каркас
const KEEP_PER_SKELETON = 4;

// ---------- главы ----------
// hand — уровни, написанные руками; stages — ступени подбора: сколько уровней и какими им быть.
// Числа-пары — «от и до»; space — сколько расстановок можно собрать из лотка (из них верная одна). mode: on — все лампы должны гореть; mixed — часть ламп гореть не должна;
// table — несколько проверок с разным положением источников.
const SPEC = {
  sources: [2, 3], layers: [1, 2], gates: [1, 3], outs: [1, 1], sockets: [1, 2], nots: [0, 0], rings: [0, 0], beads: [0, 0],
  rows: [1, 1], extra: [0, 0], extraNot: [0, 0], skip: 0, cross: 0, mode: 'on', strict: false, space: [2, 1e9],
};

export const CHAPTERS = [
  {
    title: 'Первый ток',
    hand: ['35;41*AB;41;11=1;100', '35;41*AB;41;10=1;110', '246;31*AB 51+BC 42&12;43;101=1;110'],
    stages: [
      { count: 5, sources: [2, 3], layers: [2, 2], gates: [2, 3], sockets: [1, 2], extra: [0, 1], space: [2, 3] },
      { count: 6, sources: [3, 4], layers: [2, 2], gates: [3, 4], sockets: [2, 3], extra: [0, 1], space: [3, 4] },
      { count: 6, sources: [3, 4], layers: [2, 3], gates: [4, 5], sockets: [3, 5], extra: [0, 1], skip: 0.3, space: [4, 12] },
    ],
  },
  {
    title: 'Наоборот',
    hand: ['35;41*AB~;41;10=1;100', '35;41&ABo;41;10=1;001'],
    stages: [
      { count: 6, sources: [2, 3], layers: [1, 2], gates: [2, 3], sockets: [1, 2], nots: [1, 2], extra: [0, 1], space: [2, 4] },
      { count: 6, sources: [2, 3], layers: [1, 2], gates: [2, 3], sockets: [1, 2], nots: [0, 1], rings: [1, 2], beads: [1, 1], space: [3, 8] },
      { count: 6, sources: [3, 4], layers: [2, 3], gates: [3, 5], sockets: [2, 3], nots: [0, 2], rings: [2, 3], beads: [1, 2], extraNot: [0, 1], skip: 0.3, space: [6, 20] },
    ],
  },
  {
    title: 'Гирлянда',
    hand: ['246;31*AB 51*BC;31 52;110=10;110'],
    stages: [
      { count: 6, sources: [3, 4], layers: [1, 2], gates: [2, 4], outs: [2, 2], sockets: [2, 3], extra: [0, 1], mode: 'mixed', space: [2, 4] },
      { count: 6, sources: [3, 4], layers: [1, 2], gates: [3, 4], outs: [2, 3], sockets: [2, 3], nots: [0, 1], rings: [0, 2], beads: [0, 2], extra: [0, 1], extraNot: [0, 1], mode: 'mixed', cross: 1, space: [4, 10] },
      { count: 7, sources: [3, 4], layers: [2, 3], gates: [4, 6], outs: [2, 3], sockets: [3, 4], nots: [0, 2], rings: [1, 2], beads: [0, 2], extra: [0, 1], mode: 'mixed', skip: 0.3, cross: 1, space: [8, 30] },
    ],
  },
  {
    title: 'Проверки',
    hand: ['35;41*AB;41;10=1 01=1;110', '35;41*AB;41;11=1 10=0;110'],
    stages: [
      { count: 6, sources: [2, 3], layers: [1, 2], gates: [1, 3], sockets: [1, 2], nots: [0, 1], rings: [0, 1], beads: [0, 1], rows: [2, 2], mode: 'table', space: [2, 4] },
      { count: 6, sources: [2, 3], layers: [1, 2], gates: [2, 3], sockets: [2, 2], nots: [0, 1], rings: [1, 2], beads: [1, 2], rows: [2, 3], mode: 'table', space: [4, 10] },
      { count: 6, sources: [3, 3], layers: [2, 2], gates: [3, 4], outs: [1, 2], sockets: [2, 3], nots: [0, 1], rings: [1, 3], beads: [1, 2], rows: [3, 4], mode: 'table', cross: 1, strict: true, space: [9, 30] },
    ],
  },
  {
    title: 'Мастерская',
    hand: [],
    stages: [
      { count: 7, sources: [3, 4], layers: [2, 3], gates: [5, 7], outs: [1, 3], sockets: [4, 5], nots: [0, 2], rings: [2, 3], beads: [1, 2], extra: [0, 1], mode: 'mixed', skip: 0.3, cross: 1, space: [12, 48] },
      { count: 7, sources: [3, 3], layers: [2, 3], gates: [3, 5], outs: [1, 2], sockets: [3, 4], nots: [0, 1], rings: [2, 3], beads: [1, 2], rows: [3, 4], mode: 'table', skip: 0.3, cross: 1, strict: true, space: [16, 60] },
      { count: 6, sources: [3, 4], layers: [2, 3], gates: [4, 6], outs: [2, 3], sockets: [3, 5], nots: [0, 2], rings: [2, 4], beads: [1, 3], extra: [0, 1], rows: [4, 4], mode: 'table', skip: 0.3, cross: 2, strict: true, space: [30, 200] },
    ],
  },
];

// ---------- случай ----------

export function rngFrom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const int = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
const pick = (rng, list) => list[Math.floor(rng() * list.length)];
function shuffle(rng, list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
/** Выбор с весами: items — [{ w, … }]. */
function weighted(rng, items) {
  const total = items.reduce((s, it) => s + it.w, 0);
  let r = rng() * total;
  for (const it of items) {
    r -= it.w;
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

// ---------- запись уровня ----------

const MARK = { not: '~', ring: 'o', '': '' };
const KIND = { and: '&', or: '+' };

/** Схема → строка уровня (формат — в games/logic-gates/logic.js). Узлы: источники 0…S−1, дальше вентили по порядку. */
export function serialize({ sources, gates, outs, rows, tray }) {
  const S = sources.length;
  const ref = (node) => (node < S ? String.fromCharCode(65 + node) : String(node - S + 1));
  const pin = (p) => ref(p.from) + MARK[p.mark ?? ''];
  return [
    sources.join(''),
    gates.map((g) => `${g.x}${g.layer}${g.kind ? KIND[g.kind] : '*'}${pin(g.ins[0])}${pin(g.ins[1])}`).join(' '),
    outs.map((o) => `${o.x}${pin(o)}`).join(' '),
    rows.map((r) => `${r.src.join('')}=${r.want.join('')}`).join(' '),
    `${tray.and}${tray.or}${tray.not}`,
  ].join(';');
}

// ---------- каркас ----------

/**
 * Каркас схемы: источники и слои вентилей; вентиль стоит строго между своими входами (левый вход — от узла левее,
 * правый — от узла правее), поэтому провода сходятся к нему «воронкой». Не получилось — null.
 */
export function skeleton(rng, spec) {
  const S = int(rng, ...spec.sources);
  const step = S === 2 ? pick(rng, [2, 2, 4]) : S === 3 ? pick(rng, [2, 2, 3]) : 2;
  const span = (S - 1) * step;
  if (span > MAX_COLUMN - 1) return null;
  const x0 = 1 + Math.floor((MAX_COLUMN - 1 - span) / 2);
  const nodes = [];                                   // { x, layer }
  for (let i = 0; i < S; i++) nodes.push({ x: x0 + i * step, layer: 0 });
  const L = int(rng, ...spec.layers);
  const want = int(rng, ...spec.gates);
  const gates = [];
  const blocked = (node, upTo) => gates.some((g) => g.x === node.x && g.layer > node.layer && g.layer < upTo);

  for (let l = 1; l <= L; l++) {
    const lower = nodes.filter((n) => n.layer < l);
    const lo = Math.min(...lower.map((n) => n.x));
    const hi = Math.max(...lower.map((n) => n.x));
    const free = [];
    for (let x = lo + 1; x < hi; x++) free.push(x);
    const left = want - gates.length - (L - l);       // сколько вентилей можно отдать этому слою
    if (left < 1 || !free.length) return null;
    const most = Math.min(left, Math.ceil(free.length / 2), 3);
    const count = l === L ? Math.min(most, int(rng, 1, 2)) : int(rng, 1, most);
    const cols = [];
    for (const x of shuffle(rng, free)) {
      if (cols.length < count && cols.every((c) => Math.abs(c - x) >= 2)) cols.push(x);
    }
    cols.sort((a, b) => a - b);
    const layerGates = [];
    for (const x of cols) {
      const side = (dir) => {
        const options = nodes.map((n, i) => ({ n, i }))
          .filter(({ n }) => n.layer < l && Math.sign(n.x - x) === dir && !blocked(n, l))
          .map(({ n, i }) => ({ i, w: (n.layer === l - 1 ? 1 : spec.skip) / Math.abs(n.x - x) ** 2 }))
          .filter((o) => o.w > 0);
        return options.length ? weighted(rng, options).i : -1;
      };
      const a = side(-1);
      const b = side(1);
      if (a < 0 || b < 0) return null;
      layerGates.push({ x, layer: l, ins: [a, b] });
    }
    for (const g of layerGates) {
      gates.push(g);
      nodes.push({ x: g.x, layer: l });
    }
  }
  if (gates.length < spec.gates[0] || gates.length > spec.gates[1]) return null;

  // лампы: над каждым вентилем верхнего слоя и над вентилями ниже, которые больше никуда не ведут
  const used = new Set(gates.flatMap((g) => g.ins));
  for (let i = 0; i < S; i++) if (!used.has(i)) return null;
  const outs = [];
  gates.forEach((g, k) => {
    const node = S + k;
    if (g.layer === L || !used.has(node)) {
      if (blocked(nodes[node], L + 1)) outs.push(null);
      else outs.push({ x: g.x, from: node });
    }
  });
  if (outs.includes(null)) return null;
  // иногда — ещё одна лампа на промежуточный вентиль (видно, что у него на выходе)
  const spare = gates.map((g, k) => ({ g, node: S + k }))
    .filter(({ g, node }) => g.layer < L && used.has(node) && !blocked(nodes[node], L + 1));
  if (spare.length && outs.length < spec.outs[1] && rng() < 0.5) {
    const { g, node } = pick(rng, spare);
    outs.push({ x: g.x, from: node });
  }
  outs.sort((a, b) => a.x - b.x);
  if (outs.length < spec.outs[0] || outs.length > spec.outs[1]) return null;
  for (let k = 1; k < outs.length; k++) if (outs[k].x - outs[k - 1].x < 2) return null;

  return { sources: nodes.slice(0, S).map((n) => n.x), gates, outs };
}

/** Зеркальна ли схема относительно своей середины. */
function isSymmetric(sk) {
  const S = sk.sources.length;
  const xs = [...sk.sources, ...sk.gates.map((g) => g.x)];
  const mid = Math.min(...xs) + Math.max(...xs);
  const pos = (node) => (node < S ? `0:${sk.sources[node]}` : `${sk.gates[node - S].layer}:${sk.gates[node - S].x}`);
  const flip = (p) => {
    const [l, x] = p.split(':').map(Number);
    return `${l}:${mid - x}`;
  };
  const edges = new Set(sk.gates.flatMap((g, k) => g.ins.map((n) => `${pos(n)}>${pos(S + k)}`)));
  const lamps = new Set(sk.outs.map((o) => `${pos(o.from)}>${o.x}`));
  for (const e of edges) {
    const [a, b] = e.split('>');
    if (!edges.has(`${flip(a)}>${flip(b)}`)) return false;
  }
  for (const e of lamps) {
    const [a, x] = e.split('>');
    if (!lamps.has(`${flip(a)}>${mid - Number(x)}`)) return false;
  }
  return true;
}

// ---------- расстановка ----------

/** Сколько расстановок вообще можно собрать из лотка — «пространство поиска» игрока. */
function searchSpace(level) {
  const ns = level.sockets.length;
  const nr = level.rings.length;
  let kinds = 0;
  for (let ors = 0; ors <= ns; ors++) {
    if (ors > level.tray.or || ns - ors > level.tray.and) continue;
    let c = 1;
    for (let i = 0; i < ors; i++) c = (c * (ns - i)) / (i + 1);
    kinds += c;
  }
  let rings = 0;
  for (let on = 0; on <= Math.min(nr, level.tray.not); on++) {
    let c = 1;
    for (let i = 0; i < on; i++) c = (c * (nr - i)) / (i + 1);
    rings += c;
  }
  return kinds * rings;
}

/**
 * Загадка на каркасе: какие вентили — гнёзда, где «НЕ» и колечки, что в лотке, какие проверки.
 * → { text, score, … } или null, если у получившегося не одно решение или что-то в нём ни на что не влияет.
 */
/** Почему каркасы не становились уровнями (для настройки ступеней: печатается с --stats). */
export const REJECTS = {};
const no = (why) => {
  REJECTS[why] = (REJECTS[why] ?? 0) + 1;
  return null;
};

export function puzzle(rng, sk, spec) {
  const S = sk.sources.length;
  const G = sk.gates.length;
  const nSockets = Math.min(G, int(rng, ...spec.sockets));
  const socketSet = new Set(shuffle(rng, sk.gates.map((_, k) => k)).slice(0, nSockets));
  const answer = sk.gates.map(() => pick(rng, ['and', 'or']));   // что на самом деле стоит в каждом вентиле

  const slots = [...sk.gates.flatMap((_, g) => [{ g, k: 0 }, { g, k: 1 }]), ...sk.outs.map((_, o) => ({ o }))];
  const order = shuffle(rng, slots);
  const nNots = int(rng, ...spec.nots);
  const nRings = int(rng, ...spec.rings);
  if (nNots + nRings > order.length) return no('мало входов');
  const markOf = new Map();
  order.slice(0, nNots).forEach((s) => markOf.set(s, 'not'));
  const ringSlots = order.slice(nNots, nNots + nRings);
  ringSlots.forEach((s) => markOf.set(s, 'ring'));
  const nBeads = Math.min(nRings, int(rng, ...spec.beads));
  const beadSet = new Set(shuffle(rng, ringSlots).slice(0, nBeads));

  const gates = sk.gates.map((g, k) => ({
    x: g.x, layer: g.layer, kind: socketSet.has(k) ? null : answer[k],
    ins: g.ins.map((from, i) => ({ from, mark: markOf.get(slots[k * 2 + i]) ?? '' })),
  }));
  const outs = sk.outs.map((o, i) => ({ x: o.x, from: o.from, mark: markOf.get(slots[G * 2 + i]) ?? '' }));

  const R = int(rng, ...spec.rows);
  const all = shuffle(rng, Array.from({ length: 1 << S }, (_, m) => m)).filter((m) => R > 1 || m !== 0);
  if (all.length < R) return no('мало положений');
  const srcs = all.slice(0, R).map((m) => sk.sources.map((_, i) => (m >> i) & 1));

  const extra = int(rng, ...spec.extra);
  const tray = { and: 0, or: 0, not: Math.min(nRings, nBeads + int(rng, ...spec.extraNot)) };
  sk.gates.forEach((_, k) => { if (socketSet.has(k)) tray[answer[k]] += 1; });
  for (let i = 0; i < extra; i++) tray[pick(rng, ['and', 'or'])] += 1;
  if (nRings && !tray.not) return no('колечки без НЕ в лотке');

  // решение — в порядке гнёзд и колечек, как их нумерует parseLevel
  const draft = serialize({ sources: sk.sources, gates, outs, rows: srcs.map((src) => ({ src, want: outs.map(() => 0) })), tray });
  const probe = parseLevel(draft);
  const setup = {
    kinds: probe.sockets.map((g) => answer[g]),
    nots: probe.rings.map((r) => (beadSet.has(r.out === undefined ? slots[r.gate * 2 + r.pin] : slots[G * 2 + r.out]) ? 1 : 0)),
  };
  const rows = srcs.map((src) => ({ src, want: evaluate(probe, setup, src).outs }));
  const wants = rows.flatMap((r) => r.want);
  if (spec.mode === 'on' && wants.includes(0)) return no('не все горят');
  if (spec.mode === 'mixed' && (!wants.includes(0) || !wants.includes(1))) return no('нет смеси');
  if (spec.mode === 'table') {
    if (!wants.includes(0)) return no('таблица: всё горит');
    // каждая лампа хоть в одной проверке горит, и хоть одна лампа ведёт себя по-разному
    if (outs.some((_, i) => rows.every((r) => r.want[i] === 0))) return no('таблица: лампа не горит никогда');
    if (!outs.some((_, i) => new Set(rows.map((r) => r.want[i])).size > 1)) return no('таблица: лампы постоянны');
  }

  const text = serialize({ sources: sk.sources, gates, outs, rows, tray });
  const level = parseLevel(text);
  if (solve(level, { limit: 2 }).length !== 1) return no('решение не одно');

  // каждый источник нужен: переключи его в какой-нибудь проверке — и решение уже не то (или его нет вовсе).
  // Отдельно гнёзда и колечки так не проверить: в схеме без «НЕ» ИЛИ всегда «сильнее» И, и всё решает то,
  // сколько каких вентилей в лотке, — единственность решения уже значит, что каждое место важно.
  const answerKey = JSON.stringify(setup);
  for (let s = 0; s < S; s++) {
    const matters = rows.some((_, r) => {
      const flipped = rows.map((row, i) => (i === r ? { src: row.src.map((v, k) => (k === s ? 1 - v : v)), want: row.want } : row));
      if (new Set(flipped.map((row) => row.src.join(''))).size < flipped.length) return true;
      const found = solve(parseLevel(serialize({ sources: sk.sources, gates, outs, rows: flipped, tray })), { limit: 2 });
      return found.length !== 1 || JSON.stringify(found[0]) !== answerKey;
    });
    if (!matters) return no('источник ни на что не влияет');
  }
  // лишняя проверка — та, без которой решение и так одно; на трудных ступенях таких быть не должно
  let idle = 0;
  if (rows.length > 1) {
    for (let r = 0; r < rows.length; r++) {
      const rest = parseLevel(serialize({ sources: sk.sources, gates, outs, rows: rows.filter((_, i) => i !== r), tray }));
      if (solve(rest, { limit: 2 }).length < 2) idle += 1;
    }
    if (idle && spec.strict) return no('лишняя проверка');
  }

  const space = searchSpace(level);
  if (space < spec.space[0]) return no('выбирать почти не из чего');
  if (space > spec.space[1]) return no('слишком много вариантов');
  const score = Math.log2(space) + 0.2 * G + 0.3 * (R - 1) + 0.2 * nNots + 0.2 * (outs.length - 1) + 0.1 * S;
  return { text, level, score, space, idle };
}

// ---------- подбор ----------

/** Насколько схема неопрятна: пересечения, провода через этаж, длинные горизонтали, несимметричность. */
function mess(sk, lay) {
  const S = sk.sources.length;
  const layerOf = (n) => (n < S ? 0 : sk.gates[n - S].layer);
  const xOf = (n) => (n < S ? sk.sources[n] : sk.gates[n - S].x);
  let skips = 0;
  let reach = 0;
  sk.gates.forEach((g) => g.ins.forEach((n) => {
    if (layerOf(n) < g.layer - 1) skips += 1;
    reach += Math.max(0, Math.abs(xOf(n) - g.x) - 1);
  }));
  return lay.crossings * 3 + skips + reach * 0.7 + (isSymmetric(sk) ? 0 : 0.8);
}

const shapeOf = (sk) => JSON.stringify([sk.sources, sk.gates.map((g) => [g.x, g.layer, g.ins]), sk.outs.map((o) => [o.x, o.from])]);

export function stagePool(rng, stage) {
  const spec = { ...SPEC, ...stage };
  const pool = new Map();
  for (let t = 0; t < TRIES && pool.size < POOL; t++) {
    const sk = skeleton(rng, spec);
    if (!sk) continue;
    // на одном каркасе — несколько загадок, но не слишком много: запасу нужны разные схемы
    let kept = 0;
    for (let k = 0; k < PER_SKELETON && kept < KEEP_PER_SKELETON && pool.size < POOL; k++) {
      const made = puzzle(rng, sk, spec);
      if (!made || pool.has(made.text)) continue;
      let lay;
      try {
        lay = layout(made.level);
      } catch {
        break;
      }
      if (lay.crossings > spec.cross) break;
      pool.set(made.text, { ...made, mess: mess(sk, lay) + made.idle * 1.5, shape: shapeOf(sk), box: lay.box });
      kept += 1;
    }
  }
  return [...pool.values()];
}

/** Из запаса — count уровней: опрятная половина, от простых к сложным, каркасы по возможности не повторяются. */
function choose(pool, count, usedShapes) {
  const neat = [...pool].sort((a, b) => a.mess - b.mess).slice(0, Math.max(count * 4, Math.ceil(pool.length / 2)));
  neat.sort((a, b) => a.score - b.score);
  const out = [];
  for (let k = 0; k < count; k++) {
    const target = Math.round(((k + 0.5) / count) * (neat.length - 1));
    let best = null;
    for (let d = 0; d < neat.length && !best; d++) {
      for (const i of [target + d, target - d]) {
        const c = neat[i];
        if (!c || c.taken) continue;
        if (usedShapes.has(c.shape) && d < neat.length / 4) continue;
        best = c;
        break;
      }
    }
    if (!best) throw new Error('запас уровней слишком мал');
    best.taken = true;
    usedShapes.add(best.shape);
    out.push(best);
  }
  return out.sort((a, b) => a.score - b.score);
}

export function build({ verbose = false } = {}) {
  const rng = rngFrom(SEED);
  const chapters = [];
  const levels = [];
  for (const chapter of CHAPTERS) {
    const from = levels.length + 1;
    const usedShapes = new Set();
    for (const text of chapter.hand) {
      const level = parseLevel(text);
      if (!solve(level, { limit: 1 }).length) throw new Error(`уровень «${text}» не решается`);
      layout(level);
      levels.push(text);
    }
    for (const stage of chapter.stages) {
      const pool = stagePool(rng, stage);
      if (verbose) console.log(`  ${chapter.title}: запас ${pool.length}, разных каркасов ${new Set(pool.map((p) => p.shape)).size}`);
      if (pool.length < stage.count * 3) throw new Error(`«${chapter.title}»: в запасе всего ${pool.length} — ослабить условия ступени`);
      for (const made of choose(pool, stage.count, usedShapes)) levels.push(made.text);
    }
    chapters.push({ title: chapter.title, from, count: levels.length + 1 - from });
    if (levels.length + 1 - from !== PER_CHAPTER) throw new Error(`«${chapter.title}»: уровней ${levels.length + 1 - from}, а нужно ${PER_CHAPTER}`);
  }
  return { chapters, levels };
}

function main() {
  const { chapters, levels } = build({ verbose: process.argv.includes('--stats') });
  if (process.argv.includes('--stats')) {
    chapters.forEach((c) => {
      console.log(`\n${c.title}`);
      levels.slice(c.from - 1, c.from - 1 + c.count).forEach((text, k) => {
        const level = parseLevel(text);
        console.log(`  ${String(c.from + k).padStart(3)}  ${text.padEnd(64)} гнёзд ${level.sockets.length}, колечек ${level.rings.length}, вариантов ${searchSpace(level)}`);
      });
    });
    console.log('отказы:', REJECTS);
    return;
  }
  const file = [
    '// Уровни «Логических схем» — собирает tools/logic-gates-levels.mjs (руками не править: первые уровни глав и условия',
    '// подбора — там). Запись уровня — в logic.js. Глава: название, номер первого уровня, сколько уровней.',
    '',
    'export const CHAPTERS = [',
    ...chapters.map((c) => `  { title: '${c.title}', from: ${c.from}, count: ${c.count} },`),
    '];',
    '',
    'export const LEVELS = [',
    ...levels.map((text) => `  '${text}',`),
    '];',
    '',
  ].join('\n');
  writeFileSync(new URL('../games/logic-gates/levels.js', import.meta.url), file);
  console.log(`уровней: ${levels.length}, глав: ${chapters.length}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
