// Баскетбол: мяч лежит в корзине, игрок оттягивает его, как рогатку, и бросает в следующую корзину — выше и в
// стороне. Попал — эта корзина становится стартовой, появляется новая; мяч улетел вниз — конец. Без DOM,
// тестируется в Node. Образец — Dunk Shot: один промах кончает партию, «чистое» попадание (кольцо не задето)
// копит серию, с третьего подряд мяч горит, отскок от стены удваивает очки броска.
//
// Мир — стена шириной W, высота y растёт вверх. Корзина — кольцо (две дужки по краям, кружки радиусом TUBE) и
// сетка-мешок под ним: снаружи сетка мягко отбивает, внутрь мяч попадает только сверху, через кольцо. Целевая
// корзина бывает наклонена (a) и ездит (mv) — по прямой или по кругу; поймав мяч, она останавливается и
// выпрямляется. Свободный полёт считается точно (парабола, отскок от стены — в миг касания), поэтому пунктир
// прицела совпадает с настоящим полётом. Случайность — от зерна в состоянии (s.rs): партию можно сохранить и
// продолжить с того же места.

export const VERSION = 1;
export const W = 300;
export const VIEW_MIN = 366;                // высота экрана в единицах мира (зависит от телефона) — нужна холсту
export const VIEW_MAX = 716;
export const CAM_AT = 0.24;                 // стартовая корзина стоит на этой доле экрана от низа
export const STEP = 1 / 120;                // шаг расчёта

export const R = 15;                        // радиус мяча
export const GRAVITY = 1500;
export const RIM = 31;                      // полуширина кольца: от середины до середины дужки
export const TUBE = 3;                      // радиус дужки
export const NET_H = 44;                    // глубина сетки
export const NET_W = 17;                    // её полуширина внизу
export const SEAT = 12;                     // пойманный мяч лежит на столько ниже кольца
export const CATCH = 9;                     // опустился в кольцо на столько — пойман
const NET_PAD = 1.5;                        // «толщина» сетки снаружи
export const E_WALL = 0.74;                 // сколько скорости остаётся после стены,
export const E_RIM = 0.5;                   // дужки
export const E_NET = 0.25;                  // и сетки
const RIM_GRIP = 0.12;                      // дужка и сетка притормаживают мяч вдоль себя
const NET_GRIP = 0.3;
const DEAD_V = 45;                          // медленнее этого мяч не отскакивает, а скатывается
const ARM = RIM + R + TUBE + 4;             // отлетел от своей корзины на столько — она снова ловит и отбивает

// Натяжение: тянешь назад — мяч летит в обратную сторону; чем дальше оттянул, тем сильнее.
export const PULL_MIN = 14;                 // короче — не бросок (палец дрогнул)
export const PULL_MAX = 110;                // дальше сила не растёт
export const V_MIN = 340;
export const V_MAX = 1050;
export const AIM_MAX = (78 * Math.PI) / 180; // бросок — не положе этого угла от вертикали
export const AIM_LONG = 0.8;                // на сколько секунд полёта виден пунктир: сначала почти до корзины,
export const AIM_SHORT = 0.46;              // к AIM_EASE-й корзине — только начало дуги
export const AIM_EASE = 12;

export const CLEAN_MAX = 10;                // больше за один чистый бросок не дают
export const FIRE_AT = 3;                   // столько чистых подряд — мяч горит,
export const BLUE_AT = 7;                   // а столько — синим пламенем
export const BANK = 2;                      // попал с отскоком от стены — очки броска ×2
export const LOST_TIME = 0.7;               // сколько мяч ещё падает после промаха до итогов
export const AIR_MAX = 9;                   // дольше мяч не летает (страховка от застревания)

// Где бывают корзины
export const EDGE = 70;                     // середина кольца не ближе к стене: мяч проходит между ними
export const RISE_MIN = 46;                 // следующая корзина всегда выше стартовой — хотя бы на столько,
export const RISE_MAX = 215;                // но не выше: она должна быть видна и на самом низком экране
export const APART = 100;                   // и не ближе этого к стартовой
const REACH = 0.9;                          // до корзины хватает такой доли полной силы,
const ENTER = 0.67;                         // мяч входит в кольцо не положе 42° к нему
const CLEAR = RIM + TUBE + R + 6;           // и по дороге вверх проходит в стороне от корзины, а не сквозь неё
const OPEN_PART = 0.6;                      // ездящую корзину можно забить хотя бы на такой доле её пути

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, k) => a + (b - a) * k;
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const nat = (v) => Number.isInteger(v) && v >= 0;

/** Жар мяча по серии чистых: 0 — нет, 1 — дымится, 2 — горит, 3 — синее пламя. */
export const heatOf = (streak) => (streak >= BLUE_AT ? 3 : streak >= FIRE_AT ? 2 : streak === FIRE_AT - 1 ? 1 : 0);
/** Сколько секунд полёта показывает пунктир прицела перед корзиной номер made. */
export const aimTime = (made) => lerp(AIM_LONG, AIM_SHORT, clamp(made / AIM_EASE, 0, 1));
export const clampView = (h) => clamp(Number.isFinite(h) ? h : 640, VIEW_MIN, VIEW_MAX);

// ---------- случайность ----------

function rnd(s) {
  s.rs = (s.rs + 0x6d2b79f5) >>> 0;
  let x = s.rs;
  x = Math.imul(x ^ (x >>> 15), x | 1);
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
}
const pick = (s, a, b) => a + (b - a) * rnd(s);
const chance = (s, p) => rnd(s) < p;

function weighted(s, table) {
  const keys = Object.keys(table);
  let total = 0;
  for (const k of keys) total += table[k];
  let r = rnd(s) * total;
  for (const k of keys) {
    r -= table[k];
    if (r < 0) return k;
  }
  return keys[0];
}

// ---------- натяжение и прицел ----------

/**
 * Бросок по натяжению (px, py) — на сколько и куда оттянут мяч (y вверх). Возвращает { vx, vy, power, dx, dy }
 * или null: оттянуто слишком мало либо вверх (бросать вниз нельзя). Слишком пологий бросок приподнимается до AIM_MAX.
 */
export function aim(px, py) {
  const len = Math.hypot(px, py);
  if (!(len >= PULL_MIN)) return null;
  let dx = -px / len;
  let dy = -py / len;
  if (dy < -0.25) return null;
  const low = Math.cos(AIM_MAX);
  if (dy < low) {
    dy = low;
    dx = (dx < 0 ? -1 : 1) * Math.sin(AIM_MAX);
  }
  const power = clamp((len - PULL_MIN) / (PULL_MAX - PULL_MIN), 0, 1);
  const v = V_MIN + (V_MAX - V_MIN) * power;
  return { vx: dx * v, vy: dy * v, power, dx, dy };
}

/** Натяжение, которое даёт бросок со скоростью (vx, vy), — обратное к aim(). */
export function pullFor(vx, vy) {
  const v = Math.hypot(vx, vy) || 1;
  const len = PULL_MIN + (PULL_MAX - PULL_MIN) * clamp((v - V_MIN) / (V_MAX - V_MIN), 0, 1);
  return { px: (-vx / v) * len, py: (-vy / v) * len };
}

/**
 * Свободный полёт за время h: парабола — точно; стена отбивает в тот миг, когда мяч её коснулся.
 * Возвращает 0 или скорость удара о стену со знаком стороны (− слева, + справа).
 */
function fly(b, h) {
  b.y += b.vy * h - 0.5 * GRAVITY * h * h;
  b.vy -= GRAVITY * h;
  let left = h;
  let hit = 0;
  for (let i = 0; i < 4 && left > 0; i++) {
    const nx = b.x + b.vx * left;
    if (nx < R && b.vx < 0) {
      left -= Math.max(0, (b.x - R) / -b.vx);
      hit = b.vx;
      b.x = R;
      b.vx = -b.vx * E_WALL;
    } else if (nx > W - R && b.vx > 0) {
      left -= Math.max(0, (W - R - b.x) / b.vx);
      hit = b.vx;
      b.x = W - R;
      b.vx = -b.vx * E_WALL;
    } else {
      b.x = nx;
      left = 0;
    }
  }
  b.x = clamp(b.x, R, W - R);
  return hit;
}

/** Откуда мяч вылетает: он лежит на дне сетки, а сетка оттянута против броска. */
function startOf(k, vx, vy) {
  const v = Math.hypot(vx, vy) || 1;
  return { x: k.x - (vx / v) * SEAT, y: k.y - (vy / v) * SEAT, vx, vy };
}

/**
 * Пунктир прицела: где мяч будет через first, first + every… секунд после броска (vx, vy) — time секунд полёта.
 * Стены учтены, отскоки от корзин — нет: у целевой корзины (там, где она сейчас) пунктир просто кончается.
 * Возвращает [[x, y], …].
 */
export function preview(s, vx, vy, time = aimTime(s.made), every = 0.05, first = every) {
  const b = startOf(s.from, vx, vy);
  const k = s.to;
  const ca = Math.cos(k.a);
  const sa = Math.sin(k.a);
  const out = [];
  let step = clamp(first, 1e-4, every);
  for (let t = step; t <= time + 1e-9; t += every) {
    fly(b, step);
    step = every;
    const lx = (b.x - k.x) * ca + (b.y - k.y) * sa;
    const ly = (b.y - k.y) * ca - (b.x - k.x) * sa;
    if (ly < 0 && ly > -NET_H - R && Math.abs(lx) < RIM + R * 0.6) break;
    out.push([b.x, b.y]);
  }
  return out;
}

// ---------- корзины ----------

/** Поставить ездящую корзину туда, где она в момент t (и записать её скорость). */
export function placeAt(k, t) {
  const m = k.mv;
  if (!m) return k;
  const th = TAU * (t / m.per + m.ph);
  const w = TAU / m.per;
  k.x = k.bx + m.rx * Math.sin(th);
  k.y = k.by + m.ry * Math.sin(th + m.sh);
  k.vx = m.rx * w * Math.cos(th);
  k.vy = m.ry * w * Math.cos(th + m.sh);
  return k;
}

/** Точки корзины: дужки (l, r) и нижние углы сетки (bl, br) — [x, y]. */
export function shapeOf(k) {
  const ca = Math.cos(k.a);
  const sa = Math.sin(k.a);
  const at = (lx, ly) => [k.x + lx * ca - ly * sa, k.y + lx * sa + ly * ca];
  return { l: at(-RIM, 0), r: at(RIM, 0), bl: at(-NET_W, -NET_H), br: at(NET_W, -NET_H) };
}

/**
 * Сложность: что бывает у корзины номер n (первая — 0). Первые две и каждая шестая — «передышка»: стоят ровно.
 * Ездить начинают с третьей (влево-вправо), с десятой — вверх-вниз, потом наискосок и по кругу; наклон — с седьмой.
 * Чем дальше, тем корзины дальше друг от друга, размах шире, а ход быстрее.
 */
export function levelOf(n) {
  const k = clamp(n / 36, 0, 1);
  const rest = n < 2 || n % 6 === 5;
  return {
    rest,
    dx: n < 2 ? [96, 132] : [lerp(88, 64, k), lerp(142, 160, k)],
    dy: n < 2 ? [62, 96] : [lerp(56, RISE_MIN, k), lerp(126, 186, k)],
    tilt: rest || n < 6 ? 0 : Math.min(0.66, (n - 5) * 0.05),
    move: rest ? 0 : Math.min(0.88, 0.4 + (n - 2) * 0.035),
    kinds: { h: 1, v: n >= 9 ? 0.7 : 0, d: n >= 15 ? 0.5 : 0, o: n >= 22 ? 0.45 : 0 },
    rx: lerp(28, 62, k),
    ry: lerp(20, 42, k),
    per: lerp(3.9, 2.25, k),
  };
}

/** Как ездит корзина вида kind: h — влево-вправо, v — вверх-вниз, d — наискосок, o — по кругу. size — доля размаха. */
function motion(s, L, kind, size) {
  const per = L.per * pick(s, 0.88, 1.16);
  const ph = rnd(s);
  const rx = L.rx * pick(s, 0.7, 1) * size;
  const ry = L.ry * pick(s, 0.7, 1) * size;
  if (kind === 'h') return { rx, ry: 0, per, ph, sh: 0 };
  if (kind === 'v') return { rx: 0, ry, per, ph, sh: 0 };
  if (kind === 'd') return { rx: rx * 0.8, ry: ry * (chance(s, 0.5) ? 1 : -1), per, ph, sh: 0 };
  return { rx: rx * 0.75, ry: ry * 0.9, per: per * 1.25, ph, sh: (chance(s, 0.5) ? 1 : -1) * (Math.PI / 2) };
}

function candidate(s, L, src, kind, size) {
  const mv = kind ? motion(s, L, kind, size) : null;
  // чаще — на другую половину стены
  let dir = src.x < W / 2 ? 1 : -1;
  if (!L.rest && chance(s, 0.14)) dir = -dir;
  const span = mv ? Math.abs(mv.rx) : 0;
  const far = pick(s, L.dx[0], L.dx[1]);
  let x = clamp(src.x + dir * far, EDGE + span, W - EDGE - span);
  // у стены места не хватило — корзина встанет с другой стороны от стартовой
  if (Math.abs(x - src.x) < L.dx[0] - 1) x = clamp(src.x - dir * far, EDGE + span, W - EDGE - span);
  const y = src.y + pick(s, L.dy[0], L.dy[1]) + (mv ? Math.abs(mv.ry) : 0);
  let a = 0;
  if (L.tilt > 0 && chance(s, 0.72)) {
    // обычно кольцо повёрнуто к стартовой корзине (правое — наклонено влево, a > 0), иногда — от неё
    const toward = x > src.x ? 1 : -1;
    a = chance(s, 0.78) ? toward * pick(s, 0.3, 1) * L.tilt : -toward * pick(s, 0.2, 0.55) * L.tilt;
  }
  return { id: 0, x, y, a, bx: x, by: y, vx: 0, vy: 0, mv };
}

/**
 * Есть ли с места (sx, sy) бросок в кольцо (x, y, наклон a) с запасом: не на пределе силы, не слишком полого, и
 * мяч сначала поднимается в стороне от корзины, а потом опускается в неё (снизу сквозь сетку не пройти).
 */
export function canReach(sx, sy, x, y, a) {
  const ux = -Math.sin(a);
  const uy = Math.cos(a);
  for (let T = 0.45; T <= 1.61; T += 0.05) {
    const vx = (x - sx) / T;
    const vy = (y - sy) / T + 0.5 * GRAVITY * T;
    const v = Math.hypot(vx, vy);
    if (v > V_MAX * REACH || v < V_MIN || vy / v < Math.cos(AIM_MAX - 0.1)) continue;
    const wy = vy - GRAVITY * T;                                  // скорость у кольца
    if (-(vx * ux + wy * uy) / Math.hypot(vx, wy) < ENTER) continue;
    // на высоте кольца мяч бывает дважды: по дороге вверх и на входе; между этими точками — не меньше CLEAR
    if (Math.abs(vx) * 2 * (T - vy / GRAVITY) >= CLEAR) return true;
  }
  return false;
}

/**
 * Годится ли корзина k после стартовой src. На всём пути она в пределах стены, выше стартовой и не вплотную к ней.
 * Стоячую должно быть можно забить; ездящую — на большей части пути (она может проезжать и прямо над стартовой:
 * тогда бросок надо подгадать).
 */
export function fits(k, src) {
  const probe = { ...k };
  const n = k.mv ? 24 : 1;
  let open = 0;
  for (let i = 0; i < n; i++) {
    // точки пути — от его начала, а не от случайной фазы: крайние положения попадают в проверку точно
    if (k.mv) placeAt(probe, (i / n - k.mv.ph) * k.mv.per);
    const { x, y } = probe;
    if (x < EDGE - 1e-6 || x > W - EDGE + 1e-6 || y < src.y + RISE_MIN - 1e-6 || y > src.y + RISE_MAX + 1e-6) return false;
    // между точками проверки корзина успевает немного подъехать — отсюда запас
    if (Math.hypot(x - src.x, y - src.y) < APART + (k.mv ? 3 : 0)) return false;
    if (canReach(src.x, src.y - SEAT, x, y, k.a)) open += 1;
  }
  return open >= n * OPEN_PART;
}

/**
 * Можно ли забить корзину k чисто, не задев кольца: проверяется настоящим броском (бот). Стоячую — сейчас,
 * ездящую — хотя бы в половине мест её пути. Без этого серия чистых обрывалась бы не по вине игрока.
 */
function cleanable(s, k) {
  const probe = { ...s, phase: 'aim', dry: true, to: { ...k }, ball: { ...s.ball }, run: { ...s.run } };
  if (!k.mv) return Boolean(solve(probe, { careful: false })?.clean);
  let clean = 0;
  for (let i = 0; i < 4; i++) {
    probe.t = s.t + (i / 4) * k.mv.per;
    placeAt(probe.to, probe.t);
    if (solve(probe, { careful: false })?.clean) clean += 1;
    if (clean >= 2) return true;
  }
  return false;
}

function nextBasket(s) {
  const src = s.from;
  const L = levelOf(s.made);
  // вид корзины выбирается один раз; если такая не встаёт — размах её пути понемногу уменьшается
  const kind = chance(s, L.move) ? weighted(s, L.kinds) : null;
  let k = null;
  for (let i = 0; i < 60 && !k; i++) {
    const c = candidate(s, L, src, kind, 1 - 0.6 * (i / 60));
    if (fits(c, src) && cleanable(s, c)) k = c;
  }
  if (!k) {
    // запасная: рядом, ровная и неподвижная — такая годится всегда
    const x = clamp(src.x + (src.x < W / 2 ? 1 : -1) * 112, EDGE, W - EDGE);
    k = { id: 0, x, y: src.y + 84, a: 0, bx: x, by: src.y + 84, vx: 0, vy: 0, mv: null };
  }
  k.id = s.nid;
  s.nid += 1;
  return placeAt(k, s.t);
}

// ---------- партия ----------

function hold(s) {
  Object.assign(s.ball, { x: s.from.x, y: s.from.y - SEAT, vx: 0, vy: 0, walls: 0, rim: false, armed: false, air: 0 });
}

export function newGame({ seed = 1 } = {}) {
  const s = {
    v: VERSION,
    rs: (seed >>> 0) || 1,
    t: 0,
    phase: 'aim',                           // aim — мяч в корзине | fly — летит | lost — промах, падает | over
    score: 0,
    made: 0,                                // забито корзин
    streak: 0,                              // чистых подряд
    shots: 0,
    lostT: 0,
    nid: 2,
    run: { clean: 0, banks: 0, streak: 0, fires: 0 },
    from: null,                             // корзина с мячом
    to: null,                               // куда бросать
    ball: { x: 0, y: 0, vx: 0, vy: 0, walls: 0, rim: false, armed: false, air: 0 },
  };
  const x = W / 2 + (chance(s, 0.5) ? -1 : 1) * pick(s, 52, 70);
  s.from = { id: 1, x, y: 0, a: 0, bx: x, by: 0, vx: 0, vy: 0, mv: null };
  s.to = nextBasket(s);
  hold(s);
  return s;
}

/**
 * Бросить мяч со скоростью (vx, vy) — её даёт aim(). Возвращает события ([{ type: 'shoot', … }]) или null,
 * если бросать нельзя: мяч не в корзине, скорость не из допустимых.
 */
export function shoot(s, vx, vy) {
  if (!s || s.phase !== 'aim' || !num(vx) || !num(vy)) return null;
  const v = Math.hypot(vx, vy);
  if (v < V_MIN - 0.5 || v > V_MAX + 0.5 || vy / v < Math.cos(AIM_MAX) - 1e-6) return null;
  Object.assign(s.ball, startOf(s.from, vx, vy), { walls: 0, rim: false, armed: false, air: 0 });
  s.phase = 'fly';
  s.shots += 1;
  return [{ type: 'shoot', v, power: (v - V_MIN) / (V_MAX - V_MIN), heat: heatOf(s.streak) }];
}

/**
 * Мяч и кружок радиусом rr в точке (cx, cy), который едет со скоростью (kvx, kvy): если задел — вытолкнуть и
 * отбить. Возвращает −1 (не задел) или скорость удара (0 — просто опирается).
 */
function bounce(b, cx, cy, rr, kvx, kvy, e, grip) {
  const dx = b.x - cx;
  const dy = b.y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr) return -1;
  const d = Math.sqrt(d2);
  const nx = d > 1e-6 ? dx / d : 0;
  const ny = d > 1e-6 ? dy / d : 1;
  b.x = cx + nx * rr;
  b.y = cy + ny * rr;
  const rvx = b.vx - kvx;
  const rvy = b.vy - kvy;
  const vn = rvx * nx + rvy * ny;
  if (vn >= 0) return 0;
  const vt = (rvy * nx - rvx * ny) * (1 - grip);
  const out = -vn > DEAD_V ? -vn * e : 0;
  b.vx = kvx + nx * out - ny * vt;
  b.vy = kvy + ny * out + nx * vt;
  return -vn;
}

/** То же для отрезка (стенка сетки): отбивает ближайшая к мячу точка. */
function bounceSeg(b, ax, ay, bx, by, k) {
  const ex = bx - ax;
  const ey = by - ay;
  const u = clamp(((b.x - ax) * ex + (b.y - ay) * ey) / (ex * ex + ey * ey), 0, 1);
  return bounce(b, ax + ex * u, ay + ey * u, R + NET_PAD, k.vx, k.vy, E_NET, NET_GRIP);
}

/** Мяч и корзина k: дужки отбивают, сетка снаружи — тоже; опустился в кольцо — пойман. true — пойман. */
function meet(s, k, ev) {
  const b = s.ball;
  const ca = Math.cos(k.a);
  const sa = Math.sin(k.a);
  for (const side of [-1, 1]) {
    const cx = k.x + side * RIM * ca;
    const cy = k.y + side * RIM * sa;
    const v = bounce(b, cx, cy, R + TUBE, k.vx, k.vy, E_RIM, RIM_GRIP);
    if (v < 0) continue;
    b.rim = true;
    if (v > 0) ev.push({ type: 'rim', id: k.id, side, x: cx, y: cy, v });
  }
  const lx = (b.x - k.x) * ca + (b.y - k.y) * sa;
  const ly = (b.y - k.y) * ca - (b.x - k.x) * sa;
  if (ly < 0 && ly > -NET_H && Math.abs(lx) < RIM + (NET_W - RIM) * (-ly / NET_H)) {
    // внутри сетки: сюда попадают только сверху, через кольцо
    if (ly > -CATCH) return false;
    caught(s, k, ev);
    return true;
  }
  const p = shapeOf(k);
  for (const [a, c] of [[p.l, p.bl], [p.bl, p.br], [p.br, p.r]]) {
    const v = bounceSeg(b, a[0], a[1], c[0], c[1], k);
    if (v < 0) continue;
    b.rim = true;
    if (v > 0) ev.push({ type: 'net', id: k.id, x: b.x, y: b.y, v });
  }
  return false;
}

function caught(s, k, ev) {
  const b = s.ball;
  const hit = { x: b.x, y: b.y, vx: b.vx - k.vx, vy: b.vy - k.vy };
  const was = heatOf(s.streak);
  if (k === s.from) {
    // вернулся в свою корзину: очков нет, серия кончилась, бросай снова
    s.streak = 0;
    hold(s);
    s.phase = 'aim';
    ev.push({ type: 'back', id: k.id, was, ...hit });
    return;
  }
  const clean = !b.rim;
  const bank = b.walls > 0;
  s.streak = clean ? s.streak + 1 : 0;
  const pts = (clean ? Math.min(1 + s.streak, CLEAN_MAX) : 1) * (bank ? BANK : 1);
  const heat = heatOf(s.streak);
  s.score += pts;
  s.made += 1;
  if (clean) s.run.clean += 1;
  if (bank) s.run.banks += 1;
  if (heat >= 2 && was < 2) s.run.fires += 1;
  s.run.streak = Math.max(s.run.streak, s.streak);
  const old = s.from;
  const tilt = k.a;
  Object.assign(k, { a: 0, mv: null, bx: k.x, by: k.y, vx: 0, vy: 0 });
  s.from = k;
  // на пробной копии партии (бот примеряет бросок) следующая корзина не нужна
  if (!s.dry) s.to = nextBasket(s);
  hold(s);
  s.phase = 'aim';
  ev.push({ type: 'score', id: k.id, old: old.id, next: s.to.id, pts, clean, bank, streak: s.streak, heat, was, tilt, ...hit });
}

function sub(s, h, ev) {
  s.t += h;
  placeAt(s.to, s.t);
  if (s.phase === 'aim') return;
  const b = s.ball;
  const wall = fly(b, h);
  if (wall) {
    if (s.phase === 'fly') b.walls += 1;
    ev.push({ type: 'wall', side: wall < 0 ? -1 : 1, x: b.x, y: b.y, v: Math.abs(wall) });
  }
  if (s.phase === 'lost') {
    s.lostT += h;
    if (s.lostT >= LOST_TIME) {
      s.phase = 'over';
      ev.push({ type: 'over' });
    }
    return;
  }
  b.air += h;
  const f = s.from;
  if (!b.armed) {
    // своя корзина не мешает, пока мяч из неё вылетает; целиком над кольцом или в стороне — снова ловит
    const dx = b.x - f.x;
    const dy = b.y - f.y;
    if (dy > R + TUBE + 1 || dx * dx + dy * dy > ARM * ARM) b.armed = true;
  }
  if (meet(s, s.to, ev)) return;
  if (b.armed && meet(s, f, ev)) return;
  // ниже стартовой корзины забить уже нельзя (целевая всегда выше)
  if ((b.y < f.y - NET_H - R - 4 && b.vy < 0) || b.air > AIR_MAX) {
    s.phase = 'lost';
    s.lostT = 0;
    ev.push({ type: 'miss', x: b.x, y: b.y, was: heatOf(s.streak) });
  }
}

/**
 * Продвинуть мир на dt секунд. Возвращает события: { type: 'wall' | 'rim' | 'net' | 'score' | 'back' | 'miss' |
 * 'over', … } — score: pts, clean, bank, streak, heat (жар мяча после броска), was (до), old / next (корзины).
 */
export function step(s, dt) {
  const ev = [];
  if (!s || s.phase === 'over' || !(dt > 0) || !Number.isFinite(dt)) return ev;
  const n = Math.max(1, Math.ceil(dt / STEP - 1e-9));
  const h = dt / n;
  for (let k = 0; k < n && s.phase !== 'over'; k++) sub(s, h, ev);
  return ev;
}

// ---------- бот ----------

function copy(s) {
  return {
    ...s,
    dry: true,
    run: { ...s.run },
    from: { ...s.from },
    to: { ...s.to, mv: s.to.mv && { ...s.to.mv } },
    ball: { ...s.ball },
  };
}

/** Что выйдет из броска (vx, vy): { scored, clean, pts, back, time } — на копии партии, сама партия не меняется. */
export function trial(s, vx, vy) {
  const c = copy(s);
  const out = { scored: false, clean: false, pts: 0, back: false, time: 0 };
  if (!shoot(c, vx, vy)) return out;
  const ev = [];
  const low = c.to.by - Math.abs(c.to.mv?.ry ?? 0) - NET_H - R - 8;
  while (c.phase === 'fly') {
    sub(c, STEP, ev);
    out.time += STEP;
    // ниже целевой корзины и падает — в неё уже не попасть
    if (c.phase === 'fly' && c.ball.vy < 0 && c.ball.y < low) break;
  }
  out.scored = c.made > s.made;
  out.clean = out.scored && ev.some((e) => e.type === 'score' && e.clean);
  out.pts = c.score - s.score;
  out.back = ev.some((e) => e.type === 'back');
  return out;
}

/** Бросок из стартовой корзины, который через T секунд приходит в точку (x, y), или null — так бросить нельзя. */
function shotTo(src, x, y, T) {
  let dx = 0;
  let dy = 1;
  let vx = 0;
  let vy = 0;
  // место вылета зависит от направления броска — пара уточнений
  for (let i = 0; i < 3; i++) {
    vx = (x - (src.x - dx * SEAT)) / T;
    vy = (y - (src.y - dy * SEAT)) / T + 0.5 * GRAVITY * T;
    const v = Math.hypot(vx, vy);
    dx = vx / v;
    dy = vy / v;
  }
  const v = Math.hypot(vx, vy);
  if (v < V_MIN || v > V_MAX || dy < Math.cos(AIM_MAX)) return null;
  return { vx, vy };
}

/**
 * Бот: каким броском попасть в корзину. Перебирает время полёта (корзина к этому времени уедет — целится туда,
 * где она будет), проверяет каждый бросок настоящим расчётом и выбирает самый надёжный: чистый и такой, что
 * небольшая ошибка в угле и силе его не портит. Возвращает { vx, vy, px, py, clean, time } или null.
 * careful: false — первый же чистый бросок (быстрее, для проверки «добросить можно»).
 */
export function solve(s, { careful = true } = {}) {
  if (!s || s.phase !== 'aim') return null;
  let best = null;
  const k = { ...s.to };
  for (let T = 0.46; T <= 1.8; T += 0.04) {
    placeAt(k, s.t + T);
    const shot = shotTo(s.from, k.x, k.y, T);
    if (!shot) continue;
    const res = trial(s, shot.vx, shot.vy);
    if (!res.scored) continue;
    let q = res.clean ? 100 : 0;
    if (careful) {
      const v = Math.hypot(shot.vx, shot.vy);
      const ang = Math.atan2(shot.vy, shot.vx);
      for (const [da, dv] of [[0.022, 1], [-0.022, 1], [0, 1.016], [0, 0.984]]) {
        const w = clamp(v * dv, V_MIN, V_MAX);
        const r = trial(s, Math.cos(ang + da) * w, Math.sin(ang + da) * w);
        q += r.scored ? (r.clean ? 14 : 5) : 0;
      }
    }
    if (!best || q > best.q) best = { ...shot, ...pullFor(shot.vx, shot.vy), clean: res.clean, time: res.time, q };
    if (!careful && res.clean) break;
  }
  return best;
}

// ---------- сохранение ----------

function validBasket(k) {
  if (!k || !nat(k.id) || !num(k.x) || !num(k.y) || !num(k.bx) || !num(k.by) || !num(k.a) || Math.abs(k.a) > 1) return false;
  if (k.x < 0 || k.x > W || k.bx < 0 || k.bx > W || !num(k.vx) || !num(k.vy)) return false;
  const m = k.mv;
  if (m === null) return true;
  return Boolean(m) && num(m.rx) && num(m.ry) && Math.abs(m.rx) <= W / 2 && Math.abs(m.ry) <= RISE_MAX
    && num(m.per) && m.per >= 0.5 && num(m.ph) && num(m.sh);
}

/** Годится ли сохранённая партия, чтобы её продолжить. */
export function isValidState(d) {
  if (!d || typeof d !== 'object' || d.v !== VERSION || !['aim', 'fly', 'lost'].includes(d.phase)) return false;
  if (!nat(d.rs) || d.rs > 0xffffffff || !num(d.t) || d.t < 0 || !num(d.lostT) || d.lostT < 0 || !nat(d.nid)) return false;
  if (!nat(d.score) || !nat(d.made) || !nat(d.streak) || !nat(d.shots)) return false;
  if (d.made > d.shots || d.streak > d.made || d.score < d.made || d.score > d.made * CLEAN_MAX * BANK) return false;
  if (!validBasket(d.from) || !validBasket(d.to) || d.from.mv !== null || d.from.a !== 0 || d.to.by < d.from.y + RISE_MIN - 1) return false;
  if (d.from.id === d.to.id || d.nid <= d.from.id || d.nid <= d.to.id) return false;
  const b = d.ball;
  if (!b || !num(b.x) || !num(b.y) || !num(b.vx) || !num(b.vy) || !num(b.air) || b.air < 0 || !nat(b.walls)) return false;
  if (b.x < -1 || b.x > W + 1 || Math.abs(b.vx) > 5000 || Math.abs(b.vy) > 20000) return false;
  if (typeof b.rim !== 'boolean' || typeof b.armed !== 'boolean') return false;
  const r = d.run;
  return Boolean(r) && ['clean', 'banks', 'streak', 'fires'].every((key) => nat(r[key])) && r.clean <= d.made && r.banks <= d.made
    && r.streak >= d.streak && r.streak <= d.made;
}

/** Снимок идущей партии (или null — сохранять нечего: бросков ещё не было или партия кончилась). */
export function snapshot(s) {
  if (!s || s.phase === 'over' || s.shots <= 0) return null;
  return JSON.parse(JSON.stringify(s));
}

/** Партия из снимка или null, если снимок не годится. */
export function restore(data) {
  if (!isValidState(data)) return null;
  const s = JSON.parse(JSON.stringify(data));
  placeAt(s.to, s.t);
  if (s.phase === 'aim') hold(s);
  return s;
}

// ---------- статистика ----------

export const emptyStats = () => ({ games: 0, best: 0, baskets: 0, clean: 0, banks: 0, streak: 0, fires: 0 });

export function isValidStats(v) {
  return Boolean(v) && typeof v === 'object' && Object.keys(emptyStats()).every((k) => nat(v[k]));
}

/** Статистика после партии. */
export function recordGame(stats, s) {
  return {
    games: stats.games + 1,
    best: Math.max(stats.best, s.score),
    baskets: stats.baskets + s.made,
    clean: stats.clean + s.run.clean,
    banks: stats.banks + s.run.banks,
    streak: Math.max(stats.streak, s.run.streak),
    fires: stats.fires + s.run.fires,
  };
}
