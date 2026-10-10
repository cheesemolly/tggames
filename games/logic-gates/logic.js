// «Логические схемы» — чистая логика без DOM: разбор уровня, расчёт тока, проверки, решатель, подсказка, звёзды,
// прогресс и статистика.
//
// Схема читается снизу вверх: внизу источники (под током или нет), выше — слои вентилей, наверху лампы.
// У вентиля два входа и один выход. Часть вентилей впаяна, остальные — пустые гнёзда: туда игрок ставит «И» или
// «ИЛИ» из лотка. «НЕ» — бусина на входе: впаянная или пустое колечко, куда её можно надеть.
// У уровня одна или несколько проверок: положение источников и какие лампы при нём должны гореть, а какие нет.
//
// Запись уровня — строка из пяти частей через «;»:
//   «135;21*AB 41*BC 32&1~2o;33;101=1;211»
//   1) столбцы источников (сетка 1…7), слева направо — A, B, C…;
//   2) вентили: столбец, слой, вид («*» — гнездо, «&» — впаянное И, «+» — впаянное ИЛИ), левый и правый вход:
//      буква — источник, цифра — номер вентиля (с единицы); после входа «~» — впаянное НЕ, «o» — колечко под НЕ;
//   3) лампы: столбец, вход (с той же пометкой НЕ);
//   4) проверки: источники=лампы, по биту на каждый;
//   5) лоток: сколько в нём И, ИЛИ и НЕ.

export const GATE_KINDS = ['and', 'or'];
export const KIND_TITLES = { and: 'И', or: 'ИЛИ', not: 'НЕ' };
export const MAX_COLUMN = 7;
export const MAX_SOURCES = 5;
export const MAX_GATES = 9;
export const MAX_ROWS = 4;

const GATE_FN = { and: (a, b) => a & b, or: (a, b) => a | b };
const KIND_OF = { '*': null, '&': 'and', '+': 'or' };
const MARK_OF = { '~': 'not', o: 'ring' };

function fail(text, why) {
  throw new Error(`уровень «${text}»: ${why}`);
}

/** Строка уровня → схема. Ошибка записи — исключение (уровни проверяются тестом). */
export function parseLevel(text) {
  const parts = String(text).split(';');
  if (parts.length !== 5) fail(text, 'нужно пять частей');
  const [srcPart, gatePart, outPart, rowPart, trayPart] = parts.map((p) => p.trim());

  if (!/^[1-7]+$/.test(srcPart) || srcPart.length > MAX_SOURCES) fail(text, 'источники');
  const sources = [...srcPart].map((ch) => ({ x: Number(ch) }));
  for (let k = 1; k < sources.length; k++) if (sources[k].x <= sources[k - 1].x) fail(text, 'источники идут слева направо');

  const gates = [];
  const ref = (ch, layer) => {
    if (/[A-E]/.test(ch)) {
      const i = ch.charCodeAt(0) - 65;
      if (i >= sources.length) fail(text, `нет источника ${ch}`);
      return i;
    }
    const g = Number(ch) - 1;
    if (!(g >= 0 && g < gates.length)) fail(text, `нет вентиля ${ch}`);
    if (gates[g].layer >= layer) fail(text, `вход ${ch} не ниже своего вентиля`);
    return sources.length + g;
  };
  const input = (m, layer) => ({ from: ref(m[1], layer), mark: MARK_OF[m[2]] ?? '' });

  for (const token of gatePart.split(/\s+/).filter(Boolean)) {
    const m = /^([1-7])([1-9])([*&+])([A-E1-9][~o]?)([A-E1-9][~o]?)$/.exec(token);
    if (!m) fail(text, `вентиль «${token}»`);
    const layer = Number(m[2]);
    if (gates.length && layer < gates[gates.length - 1].layer) fail(text, 'вентили идут по слоям снизу вверх');
    const ins = [m[4], m[5]].map((s) => input(/^(.)(.?)$/.exec(s), layer));
    if (ins[0].from === ins[1].from) fail(text, `оба входа «${token}» от одного узла`);
    gates.push({ x: Number(m[1]), layer, kind: KIND_OF[m[3]], ins });
  }
  if (!gates.length || gates.length > MAX_GATES) fail(text, 'число вентилей');
  const layers = gates[gates.length - 1].layer;
  for (let l = 1; l <= layers; l++) if (!gates.some((g) => g.layer === l)) fail(text, `пустой слой ${l}`);

  const outs = [];
  for (const token of outPart.split(/\s+/).filter(Boolean)) {
    const m = /^([1-7])([A-E1-9])([~o]?)$/.exec(token);
    if (!m) fail(text, `лампа «${token}»`);
    outs.push({ x: Number(m[1]), ...input(m.slice(1), layers + 1) });
  }
  if (!outs.length) fail(text, 'нет ламп');
  for (let k = 1; k < outs.length; k++) if (outs[k].x <= outs[k - 1].x) fail(text, 'лампы идут слева направо');

  const rows = [];
  for (const token of rowPart.split(/\s+/).filter(Boolean)) {
    const m = /^([01]+)=([01]+)$/.exec(token);
    if (!m || m[1].length !== sources.length || m[2].length !== outs.length) fail(text, `проверка «${token}»`);
    rows.push({ src: [...m[1]].map(Number), want: [...m[2]].map(Number) });
  }
  if (!rows.length || rows.length > MAX_ROWS) fail(text, 'число проверок');

  if (!/^\d{3}$/.test(trayPart)) fail(text, 'лоток');
  const tray = { and: Number(trayPart[0]), or: Number(trayPart[1]), not: Number(trayPart[2]) };

  // гнёзда и колечки — по порядку записи: так на них ссылается расстановка игрока
  const sockets = [];
  const rings = [];
  gates.forEach((g, i) => {
    if (!g.kind) sockets.push(i);
    g.ins.forEach((pin, k) => {
      if (pin.mark === 'ring') rings.push({ gate: i, pin: k });
    });
  });
  outs.forEach((o, i) => {
    if (o.mark === 'ring') rings.push({ out: i });
  });
  if (tray.and + tray.or < sockets.length) fail(text, 'в лотке меньше вентилей, чем гнёзд');
  if (tray.not > rings.length) fail(text, 'в лотке больше НЕ, чем колечек');

  // у каждого узла есть потребитель — иначе его провод никуда не ведёт
  const used = new Set([...gates.flatMap((g) => g.ins.map((p) => p.from)), ...outs.map((o) => o.from)]);
  for (let n = 0; n < sources.length + gates.length; n++) if (!used.has(n)) fail(text, `узел ${n} ни к чему не подключён`);

  return { text: String(text), sources, gates, outs, rows, tray, sockets, rings, layers };
}

/** Слой узла: источники — 0, вентили — свой, лампы — выше всех. */
export const layerOf = (level, node) => (node < level.sources.length ? 0 : level.gates[node - level.sources.length].layer);
export const columnOf = (level, node) => (node < level.sources.length ? level.sources[node].x : level.gates[node - level.sources.length].x);

// ---------- расстановка игрока ----------

/** Пустая расстановка: kinds — что стоит в гнёздах (по порядку level.sockets), nots — надето ли НЕ на колечки. */
export const emptySetup = (level) => ({ kinds: level.sockets.map(() => null), nots: level.rings.map(() => 0) });

/** Сколько деталей осталось в лотке. */
export function trayLeft(level, setup) {
  const left = { ...level.tray };
  for (const kind of setup.kinds) if (kind) left[kind] -= 1;
  for (const on of setup.nots) if (on) left.not -= 1;
  return left;
}

export const isComplete = (setup) => setup.kinds.every(Boolean);

/** Помещается ли расстановка в лоток. */
export function fitsTray(level, setup) {
  const left = trayLeft(level, setup);
  return left.and >= 0 && left.or >= 0 && left.not >= 0;
}

// ---------- расчёт ----------

/**
 * Ток в схеме при положении источников src. Все гнёзда должны быть заполнены.
 * → { nodes: значение на выходе каждого узла, pins: [[лев, прав], …] — что приходит на входы вентилей (после НЕ),
 *     outs: что приходит на лампы }.
 */
export function evaluate(level, setup, src) {
  const S = level.sources.length;
  const nodes = src.slice(0, S);
  const kindAt = new Map(level.sockets.map((g, k) => [g, setup.kinds[k]]));
  const ringAt = new Map(level.rings.map((r, k) => [r.out === undefined ? `g${r.gate}:${r.pin}` : `o${r.out}`, setup.nots[k]]));
  const through = (pin, key) => {
    const flip = pin.mark === 'not' || (pin.mark === 'ring' && ringAt.get(key));
    return flip ? 1 - nodes[pin.from] : nodes[pin.from];
  };
  const pins = [];
  level.gates.forEach((g, i) => {
    const a = through(g.ins[0], `g${i}:0`);
    const b = through(g.ins[1], `g${i}:1`);
    pins.push([a, b]);
    const kind = g.kind ?? kindAt.get(i);
    nodes.push(kind ? GATE_FN[kind](a, b) : 0);
  });
  const outs = level.outs.map((o, i) => through(o, `o${i}`));
  return { nodes, pins, outs };
}

/** Проверки расстановки: по каждой — что на лампах и сошлось ли. */
export function check(level, setup) {
  const rows = level.rows.map((row) => {
    const res = evaluate(level, setup, row.src);
    return { ...res, ok: res.outs.every((v, i) => v === row.want[i]) };
  });
  return { rows, ok: rows.every((r) => r.ok), firstBad: rows.findIndex((r) => !r.ok) };
}

// ---------- решатель ----------

/**
 * Все расстановки из деталей лотка, которые проходят все проверки (перебор: гнёзд и колечек немного).
 * limit — остановиться, набрав столько.
 */
export function solve(level, { limit = Infinity } = {}) {
  const found = [];
  const ns = level.sockets.length;
  const nr = level.rings.length;
  for (let km = 0; km < 1 << ns && found.length < limit; km++) {
    const kinds = level.sockets.map((_, k) => ((km >> k) & 1 ? 'or' : 'and'));
    const ors = kinds.filter((k) => k === 'or').length;
    if (ors > level.tray.or || ns - ors > level.tray.and) continue;
    for (let rm = 0; rm < 1 << nr && found.length < limit; rm++) {
      const nots = level.rings.map((_, k) => (rm >> k) & 1);
      if (nots.reduce((a, b) => a + b, 0) > level.tray.not) continue;
      const setup = { kinds, nots };
      if (check(level, setup).ok) found.push({ kinds: [...kinds], nots });
    }
  }
  return found;
}

/** Сколько мест в расстановке a отличается от b. */
export function distance(a, b) {
  let d = 0;
  a.kinds.forEach((k, i) => { if (k !== b.kinds[i]) d += 1; });
  a.nots.forEach((n, i) => { if (Boolean(n) !== Boolean(b.nots[i])) d += 1; });
  return d;
}

/**
 * Ближайшее к расстановке решение — из тех, что не спорят с закреплённым подсказками (lockK, lockR).
 * Решений нет — null.
 */
export function nearestSolution(setup, solutions) {
  const lockK = setup.lockK ?? [];
  const lockR = setup.lockR ?? [];
  const fits = solutions.filter((sol) => lockK.every((i) => sol.kinds[i] === setup.kinds[i])
    && lockR.every((i) => Boolean(sol.nots[i]) === Boolean(setup.nots[i])));
  if (!fits.length) return null;
  return fits.reduce((a, b) => (distance(setup, b) < distance(setup, a) ? b : a));
}

/**
 * Подсказка: одно место, где расстановка расходится с ближайшим решением.
 * → { socket, kind } | { ring, on } | null (уже решено или решений нет).
 * Сначала гнёзда (пустые — первыми), потом колечки.
 */
export function hintFor(level, setup, solutions = solve(level)) {
  const best = nearestSolution(setup, solutions);
  if (!best) return null;
  const empty = setup.kinds.findIndex((k) => !k);
  if (empty >= 0) return { socket: empty, kind: best.kinds[empty] };
  const wrong = setup.kinds.findIndex((k, i) => k !== best.kinds[i]);
  if (wrong >= 0) return { socket: wrong, kind: best.kinds[wrong] };
  const ring = setup.nots.findIndex((n, i) => Boolean(n) !== Boolean(best.nots[i]));
  if (ring >= 0) return { ring, on: best.nots[ring] ? 1 : 0 };
  return null;
}

// ---------- партия ----------

/** Начатый уровень: расстановка, сколько раз включали ток впустую, сколько взято подсказок, что закреплено подсказкой. */
export const newState = (n, level) => ({ v: 1, level: n, ...emptySetup(level), fails: 0, hints: 0, lockK: [], lockR: [] });

const isIndexList = (list, size) => Array.isArray(list) && list.length <= size
  && list.every((i) => Number.isInteger(i) && i >= 0 && i < size) && new Set(list).size === list.length;

export function isValidState(state, level, n) {
  if (!state || typeof state !== 'object' || state.v !== 1 || state.level !== n) return false;
  if (!Array.isArray(state.kinds) || state.kinds.length !== level.sockets.length) return false;
  if (!state.kinds.every((k) => k === null || GATE_KINDS.includes(k))) return false;
  if (!Array.isArray(state.nots) || state.nots.length !== level.rings.length) return false;
  if (!state.nots.every((v) => v === 0 || v === 1)) return false;
  if (!Number.isInteger(state.fails) || state.fails < 0 || !Number.isInteger(state.hints) || state.hints < 0) return false;
  if (!isIndexList(state.lockK, level.sockets.length) || !isIndexList(state.lockR, level.rings.length)) return false;
  return fitsTray(level, state);
}

/** Сделано ли в уровне хоть что-то (иначе сохранять нечего). */
export const isTouched = (state) => state.kinds.some(Boolean) || state.nots.some(Boolean) || state.fails > 0 || state.hints > 0;

/**
 * Поставить вентиль kind в гнездо (kind = null — вынуть). Нет такого в лотке или гнездо закреплено — false.
 * То, что стояло, возвращается в лоток.
 */
export function placeGate(level, state, socket, kind) {
  if (!(socket >= 0 && socket < state.kinds.length) || state.lockK.includes(socket)) return false;
  if (kind !== null && !GATE_KINDS.includes(kind)) return false;
  if (state.kinds[socket] === kind) return false;
  if (kind && trayLeft(level, state)[kind] < 1) return false;
  state.kinds[socket] = kind;
  return true;
}

/** Надеть или снять НЕ на колечке. */
export function placeNot(level, state, ring, on) {
  if (!(ring >= 0 && ring < state.nots.length) || state.lockR.includes(ring)) return false;
  const value = on ? 1 : 0;
  if (state.nots[ring] === value) return false;
  if (value && trayLeft(level, state).not < 1) return false;
  state.nots[ring] = value;
  return true;
}

/** Поменять местами содержимое двух гнёзд (перетаскивание с гнезда на гнездо). */
export function swapGates(state, a, b) {
  if (a === b || state.lockK.includes(a) || state.lockK.includes(b)) return false;
  if (state.kinds[a] === state.kinds[b]) return false;
  [state.kinds[a], state.kinds[b]] = [state.kinds[b], state.kinds[a]];
  return true;
}

/** Перенести НЕ с колечка на колечко. */
export function moveNot(state, from, to) {
  if (from === to || state.lockR.includes(from) || state.lockR.includes(to)) return false;
  if (!state.nots[from] || state.nots[to]) return false;
  state.nots[from] = 0;
  state.nots[to] = 1;
  return true;
}

/**
 * Применить подсказку: деталь встаёт на место и закрепляется. Если такой в лотке не осталось — она снимается
 * с места, где стоит зря. → подсказка или null.
 */
export function applyHint(level, state, solutions = solve(level)) {
  const hint = hintFor(level, state, solutions);
  if (!hint) return null;
  const best = nearestSolution(state, solutions);
  if (hint.socket !== undefined) {
    state.kinds[hint.socket] = null;
    if (trayLeft(level, state)[hint.kind] < 1) {
      const spare = state.kinds.findIndex((k, i) => k === hint.kind && best.kinds[i] !== k && !state.lockK.includes(i));
      if (spare >= 0) state.kinds[spare] = null;
    }
    state.kinds[hint.socket] = hint.kind;
    state.lockK.push(hint.socket);
  } else {
    if (hint.on && trayLeft(level, state).not < 1) {
      const spare = state.nots.findIndex((v, i) => v && !best.nots[i] && !state.lockR.includes(i));
      if (spare >= 0) state.nots[spare] = 0;
    }
    state.nots[hint.ring] = hint.on;
    state.lockR.push(hint.ring);
  }
  state.hints += 1;
  return hint;
}

/** Звёзды: с первого включения и без подсказок — три; каждое включение впустую и каждая подсказка — минус одна. */
export const starsFor = (fails, hints) => Math.max(1, 3 - fails - hints);

// ---------- прогресс и статистика ----------

const nat = (v) => (Number.isInteger(v) && v > 0 ? v : 0);

/** stars — лучшие звёзды по уровням: { номер уровня: 1…3 }. */
export const emptyProgress = () => ({ stars: {} });

export function migrateProgress(raw, total = 1e4) {
  const progress = emptyProgress();
  const stars = raw?.stars;
  if (!stars || typeof stars !== 'object' || Array.isArray(stars)) return progress;
  for (const [key, value] of Object.entries(stars)) {
    const n = Number(key);
    if (String(n) === key && Number.isInteger(n) && n >= 1 && n <= total && nat(value)) progress.stars[n] = Math.min(3, value);
  }
  return progress;
}

export const isValidProgress = (raw) => JSON.stringify(migrateProgress(raw)) === JSON.stringify(raw);

export const starsOf = (progress, n) => progress.stars[n] ?? 0;
export const totalStars = (progress) => Object.values(progress.stars).reduce((a, b) => a + b, 0);
export const passedCount = (progress) => Object.keys(progress.stars).length;

/** Уровень открыт: первый или следующий за пройденным. */
export const isOpen = (progress, n) => n === 1 || starsOf(progress, n - 1) > 0;

/** Куда вести игрока: первый непройденный из открытых; всё пройдено — последний. */
export function nextLevel(progress, total) {
  for (let n = 1; n <= total; n++) if (!starsOf(progress, n)) return n;
  return total;
}

/** Записать результат уровня. → стало ли звёзд больше. */
export function recordStars(progress, n, stars) {
  if (stars <= starsOf(progress, n)) return false;
  progress.stars[n] = stars;
  return true;
}

/** solved — пройдено уровней (считая повторы), perfect — из них на три звезды, launches — включений тока, hints — подсказок. */
export const emptyStats = () => ({ solved: 0, perfect: 0, launches: 0, hints: 0 });

export function migrateStats(raw) {
  const stats = emptyStats();
  if (!raw || typeof raw !== 'object') return stats;
  for (const k of Object.keys(stats)) stats[k] = nat(raw[k]);
  return stats;
}

export const isValidStats = (raw) => JSON.stringify(migrateStats(raw)) === JSON.stringify(raw);

export function plural(n, forms) {
  const last = n % 10;
  const tens = n % 100;
  if (tens >= 11 && tens <= 14) return forms[2];
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
}
