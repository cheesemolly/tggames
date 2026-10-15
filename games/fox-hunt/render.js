// Рисование «Лисьей охоты»: холст, камера, слои, частицы. Расчёт сюда не лезет, а рендер ничего не считает в игре —
// он читает состояние G, события и ставит готовые картинки (art.js). Контракт — spec/07-frame.md.
//
// Слои, сзади вперёд: фон комнаты (запечён один раз) → метки на земле (норы, зоны, предупреждения, свечение
// подбираемого) → тени → всё, что стоит на земле, по глубине (y) → то, что летит → то, что над головой (кроны) →
// атмосфера комнаты (туман, ночь — по room.mod) → воздух (пыльца, листья, снег, виньетка) → надписи и стрелка рывка.
// В кадре — только drawImage и простые заливки; надписи и градиенты готовит render-bake.js.

import './art-all.js';
import { createArt, hasSprite, spriteKeys, spriteDef } from './art.js';
import { paintRoom, propsOf, ROOM_MARGIN } from './art-tiles.js';
import { bakeText, bakeVignette, bakeFog, bakePuff, bakeLight } from './render-bake.js';
import { T, TILE, own } from './core.js';
import { DASH } from './balance.js';

export const QUALITY = [2, 1.5, 1.15, 1, 0.85];
// «Графика» в настройках: 0 низкая, 1 средняя (по умолчанию), 2 высокая. step — ступень QUALITY, с которой начинаем
// (она же задаёт потолок частиц PART_CAP и число пылинок воздуха), vig — рисовать ли виньетку, auto — может ли
// игра сама опускать ступень, когда кадры не успевают (lowerQuality), lowest — ниже какой ступени не опускать.
// Выбор игрока автоснижение не меняет и не поднимает.
// puffs — сколько клоков дымки плывёт по туману (0 — туман ровный, без дрейфа). dark — во сколько раз слой темноты
// «Ночи» меньше холста по каждой стороне (темнота мягкая — грубость слоя не видна, а смешивать его дешевле); glow —
// цветные отсветы у светящихся вещей места; flies — сколько светлячков летает ночью.
// Дальше — то, чем низкая отличается от средней и высокой (замер 2026-10-15: прежняя низкая уменьшала лишь число
// точек, а команд рисования было столько же, сколько у средней): air — воздух (пыльца, листья, снег); shade — тени:
// 2 у всех, 1 только у лисы, хозяев и тех, кто в воздухе (по ним видно, куда упадёт); burst — доля частиц во вспышках;
// ghost — как часто остаётся тень рывка, с (каждая — целая лиса из частей); half — на экране 100 Гц и чаще рисовать
// через кадр (createPacer).
export const GRAPHICS = [
  { step: 3, lowest: 4, vig: false, auto: true, puffs: 0, dark: 4, glow: false, flies: 0, air: false, shade: 1, burst: 0.5, ghost: 0.07, half: true },
  { step: 0, lowest: 2, vig: true, auto: true, puffs: 5, dark: 3, glow: true, flies: 4, air: true, shade: 2, burst: 1, ghost: 0.035, half: false },
  { step: 0, lowest: 0, vig: true, auto: false, puffs: 9, dark: 2, glow: true, flies: 7, air: true, shade: 2, burst: 1, ghost: 0.035, half: false },
];
export const GRAPHICS_DEFAULT = 1;
/** Сохранённое положение «Графики»: нет поля или что-то не то — средняя. */
export const readGraphics = (v) => (Number.isInteger(v) && v >= 0 && v < GRAPHICS.length ? v : GRAPHICS_DEFAULT);

// промежуток между кадрами экрана, мс: короче — экран 100 Гц и чаще
const FAST_GAP = 10.5;

/**
 * Через кадр на быстром экране (GRAPHICS[].half). Расчёт идёт шагами по 1/60 с, так что на экране 120 Гц каждый
 * второй кадр лишь сдвигал картинку на полшага, а стоил как настоящий. skip(now, on) — пропустить ли этот вызов
 * requestAnimationFrame; промежуток экрана считается по всем вызовам (и пропущенным), средним за ~10 кадров.
 */
export function createPacer() {
  let gap = 1000 / 60;
  let prev = 0;
  let odd = false;
  return {
    skip(now, on) {
      if (prev && now > prev) gap += (Math.min(50, now - prev) - gap) * 0.1;
      prev = now;
      if (!on || gap > FAST_GAP) {
        odd = false;
        return false;
      }
      odd = !odd;
      return odd;
    },
    get gap() { return gap; },
  };
}

const TAU = Math.PI * 2;
const VIEW_UNITS = 320;            // короткая сторона экрана — столько единиц мира
const K_MAX = 3;
const PART_CAP = [260, 200, 140, 70, 70];  // частиц живьём по ступеням чёткости
const AFTER_LIFE = 0.28;           // сколько живёт тень рывка
const FLASH_TIME = 0.12;
const SHAKE_DECAY = 2.4;

const DEEP_FILL = { forest: '#1f3a22', swamp: '#1d3a3a', taiga: '#26364a', cave: '#1c1a2e', autumn: '#3a2418' };
const GLOW_OF = { coin: 1, heart: 3, mana: 2, berry: 4, item: 0 };
const ZONE_LOOK = {
  red: ['rgba(224,48,47,A)', '#ff9d8a'],
  fire: ['rgba(255,110,30,A)', '#ffd27a'],
  poison: ['rgba(120,190,60,A)', '#e4ff9a'],
  web: ['rgba(235,235,245,A)', '#ffffff'],
  ice: ['rgba(110,190,255,A)', '#e6f6ff'],
};
const BOOM_LOOK = { fire: 1, ice: 2, poison: 3, light: 4, dark: 5 };
// взмах ближнего оружия (рисунок cone): по картинке удара — заливка дуги, край и что вылетает по дуге
const SWING_LOOK = { 'fx.slash': 0, 'fx.ice': 1, 'fx.puff': 2 };
const SWING_INK = [['#ffffff', '#ff9a3c'], ['#e6f6ff', '#6ec0ff'], ['#eef2f8', '#9fb0c8']];
const SWING_FADE = 0.12;           // след дотаивает после взмаха
const ICON_AXIS = -0.8;            // значки оружия нарисованы наискось: рукоять внизу слева, конец вверху справа
const ICON_SIZE = 1.25;            // оружие в лапах чуть крупнее значка в рюкзаке
// туман («Туман», room.mod === 'fog'): вокруг лисы чисто до FOG_CLEAR единиц, к FOG_FAR пелена густеет до потолка
// FOG_MAX — зверь за краем виден силуэтом, не пропадает. Цвет — по месту.
const FOG_CLEAR = 62;
const FOG_FAR = 150;
const FOG_MAX = 0.66;
const FOG_PUFF = 0.24;             // густота клока дымки вдали от лисы
export const FOG_TINT = { forest: '#dfe8d2', swamp: '#c3d8c6', taiga: '#e2ebf5', cave: '#6f6a98', autumn: '#e8d0aa' };
const FOG_PUFFS = 9;
// ночь («Ночь», room.mod === 'night'): комнату накрывает темнота цвета места (не чёрная) густотой NIGHT_MAX — за
// краем света видны очертания. Вокруг лисы пятно света NIGHT_R (сплошное до середины, край мягкий), у светящихся
// вещей места (GLOWS; горячие трещины пещер) и светлячков — свои пятна. Каждый зверь, спутник, вещь и подбираемое
// подсвечены слабым пятном силы NIGHT_SEEN: темнота над ним в 2,5 раза реже, видно и где он, и кто это — сам рисунок, а не
// значок. Красные зоны, выстрелы и знаки появления ложатся поверх темноты (VEILS).
const NIGHT_MAX = 0.8;
const NIGHT_R = 125;
const NIGHT_SEEN = 0.6;
export const NIGHT_TINT = { forest: '#0b1834', swamp: '#0a1b2b', taiga: '#0f1d3d', cave: '#0d0a1f', autumn: '#151233' };
// что светится: ключ картинки → [радиус, сила, высота середины над основанием, цвет, цвет у вариантов 1+]
const GLOWS = {
  'prop.cave.crystal': [72, 0.85, 26, '#7fe0ff', '#c79cff'],
  'prop.cave.shrooms': [46, 0.7, 8, '#8dffb0', '#c8a8ff'],
};
const HOT_GLOW = '#ff8a3c';                  // горячая трещина пещеры: под ногами больно — ночью видна
const NIGHT_LIGHTS = 48;                     // светящихся вещей места в комнате — не больше
const DARK_TILE = 32;                        // плитка слоя темноты, точек слоя (makeDark, layDark)
const FLY_GLOW = '#eaff8c';
const FLY_BIOMES = new Set(['forest', 'swamp', 'autumn']);   // зимой и в пещере светлячков нет
const PREY = new Set(['rabbit', 'hare', 'gold', 'fat']);

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (v) => {
  const x = clamp(v, 0, 1);
  return x * x * (3 - 2 * x);
};
const BOX_SLACK = 3;                        // запас рамки предмета, ед.: заготовка шире на точку, место округляется
const ALOFT = 260;                          // высота «под потолком» у паучьей королевы (bosses.js)
const num = (v, d = 0) => (Number.isFinite(v) ? v : d);

export function createRenderer({ canvas, probe }) {
  const ctx = canvas.getContext('2d', { alpha: false }) ?? canvas.getContext('2d');
  const dpr = () => Math.max(1, Math.min(3, (typeof window !== 'undefined' && window.devicePixelRatio) || 1));

  let cssW = 320;
  let cssH = 180;
  let scale = 1;
  let qi = 0;
  let gfx = GRAPHICS[GRAPHICS_DEFAULT];
  let k = 1;
  let art = createArt(1);
  let warmed = null;          // заготовка заранее: { list: [[ключ, вариант]…], at } — что и докуда дошли (warm)
  let vig = null;
  let room = null;            // комната, фон которой запечён
  let bg = null;              // { c, ox, oy } запечённый фон
  let props = [];
  let over = [];
  let deepKey = '';
  let t = 0;                  // свободные часы рисования
  let camX = 0;
  let camY = 0;
  let snap = true;
  let trauma = 0;
  let flashA = 0;
  let flashC = '255,60,60';
  const view = { x: 0, y: 0, w: VIEW_UNITS, h: VIEW_UNITS };
  let camPx = 0;
  let camPy = 0;

  // ---------- частицы и надписи ----------

  const parts = [];           // живые частицы
  const spare = [];
  const texts = [];           // всплывающие надписи
  const marks = [];           // предупреждения о появлении
  const rings = [];           // расходящиеся кольца
  const afters = [];          // тени рывка
  const air = [];             // воздух: пыльца, листья, снег — в координатах экрана
  let afterT = 0;
  let airFor = '';
  // взмах ближнего оружия: один на лису, новый удар сменяет старый; dir — в какую сторону ведёт дугу (через раз)
  const swing = { on: false, key: '', icon: false, look: 0, a: 0, r: 0, arc: 0, dir: -1, t: 0, life: 0.2 };
  let calmNow = false;
  let fogT = 0;               // часы дрейфа тумана: при «уменьшить движение» стоят
  // клоки дымки: доли экрана, скорость, размер — готовые числа, в кадре ничего не создаётся
  const puffs = [];
  for (let i = 0; i < FOG_PUFFS; i++) {
    puffs.push({ x: (i * 0.618) % 1, y: (i * 0.382 + 0.13) % 1, sx: 0.006 + (i % 3) * 0.004, ph: i * 1.7, s: 0.8 + (i % 4) * 0.25 });
  }
  // ночь: слой темноты { c, g, w, h, d } — меньше холста в d раз, заготавливается в setScale; светящиеся вещи комнаты
  // (takeLights, при входе); светлячки — места в комнате и где они сейчас (X, Y, a — пишутся в кадре, не создаются)
  let dark = null;
  let nightT = 0;             // часы мерцания и полёта светлячков: при «уменьшить движение» стоят
  // что нарисовано в прошлом кадре (для проверки): предметы, плитки и заливки земли за краем комнаты, тени
  const drawn = { props: 0, tiles: 0, fills: 0, shadows: 0 };
  let cuts = 0;               // сколько пятен вырезано и сколько отсветов нарисовано в прошлом кадре (для проверки)
  let glows = 0;
  let spot = null;
  let flyImg = null;
  const lights = [];
  const flies = [];
  for (let i = 0; i < GRAPHICS[2].flies; i++) flies.push({ x: 0, y: 0, ph: i * 2.3, sp: 0.6 + (i % 3) * 0.2, X: 0, Y: 0, a: 0 });

  const partCap = () => PART_CAP[qi] ?? 140;

  function spawn(key, x, y, o = {}) {
    if (parts.length >= partCap()) return null;
    const p = spare.pop() ?? {};
    p.key = key;
    p.v = o.v ?? 0;
    p.x = x;
    p.y = y;
    p.z = o.z ?? 0;
    p.vx = o.vx ?? 0;
    p.vy = o.vy ?? 0;
    p.vz = o.vz ?? 0;
    p.g = o.g ?? 0;
    p.drag = o.drag ?? 0;
    p.life = o.life ?? 0.5;
    p.t = 0;
    p.rot = o.rot ?? 0;
    p.vr = o.vr ?? 0;
    p.s0 = o.s0 ?? 1;
    p.s1 = o.s1 ?? 1;
    p.a0 = o.a0 ?? 1;
    p.a1 = o.a1 ?? 0;
    parts.push(p);
    return p;
  }

  function burst(key, x, y, n, o = {}) {
    const sp = o.speed ?? 60;
    if (gfx.burst < 1) n = Math.ceil(n * gfx.burst);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const s = sp * (0.4 + Math.random() * 0.6);
      spawn(key, x + Math.cos(a) * (o.spread ?? 2), y + Math.sin(a) * (o.spread ?? 2), {
        v: o.v ?? i, z: o.z ?? 6, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.7, vz: o.vz ?? 40 + Math.random() * 40,
        g: o.g ?? 160, drag: o.drag ?? 2, life: (o.life ?? 0.5) * (0.7 + Math.random() * 0.6),
        rot: o.rot ? Math.random() * TAU : 0, vr: o.rot ? (Math.random() - 0.5) * 10 : 0,
        s0: o.s0 ?? 1, s1: o.s1 ?? 0.6, a0: o.a0 ?? 1, a1: o.a1 ?? 0,
      });
    }
  }

  function startSwing(e) {
    const s = swing;
    s.on = true;
    s.t = 0;
    s.life = clamp(num(e.cd, 0.4) * 0.5, 0.12, 0.22);
    s.a = num(e.a);
    s.r = num(e.r);
    s.arc = clamp(num(e.arc, 1.5), 0.3, 3);
    s.look = SWING_LOOK[e.look] ?? 0;
    s.key = `item.${e.id}`;
    s.icon = s.look === 0 && hasSprite(s.key);
    s.dir = -s.dir;
    if (s.look === 0) return;
    // дыхание и рёв: облачка разлетаются по дуге до края удара
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = s.a + s.arc * ((i + 0.5) / n - 0.5) + (Math.random() - 0.5) * 0.15;
      const v = s.r * (3.6 + Math.random() * 1);   // с торможением drag 4 за 0,32 с пролетит ~0,7 дальности
      spawn(e.look, num(e.x) + Math.cos(a) * 8, num(e.y) + Math.sin(a) * 8, {
        v: s.look === 2 ? i % 3 : 0, z: 8, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 0, drag: 4, life: 0.32,
        rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 6, s0: 0.6, s1: 1.3, a0: 0.9,
      });
    }
  }

  function ring(x, y, r, color = 0, life = 0.4) {
    if (rings.length >= 12) rings.shift();
    rings.push({ x, y, r, v: color, t: 0, life });
  }

  function addText(x, y, s, c) {
    if (texts.length >= 24) texts.shift();
    texts.push({ x, y, s: String(s), c: typeof c === 'string' ? c : '#ffffff', t: 0 });
  }

  // ---------- размеры ----------

  function setScale() {
    scale = Math.max(0.2, Math.min(cssW, cssH) / VIEW_UNITS);
    const density = Math.min(QUALITY[qi], dpr());
    k = Math.min(K_MAX, scale * density);
    const rate = k / scale;
    canvas.width = Math.max(1, Math.round(cssW * rate));
    canvas.height = Math.max(1, Math.round(cssH * rate));
    view.w = cssW / scale;
    view.h = cssH / scale;
    art = createArt(k);
    warmed = null;
    vig = gfx.vig ? bakeVignette(0.5) : null;
    makeDark();
    if (room) bake();
  }

  /**
   * Слой темноты «Ночи» под нынешний холст (один холст на всё время, меняется только размер). Слой режется на плитки
   * DARK_TILE точек: lit — до каких плиток в этом кадре дотянулся свет (остальные на кадре — сплошной заливкой).
   */
  function makeDark() {
    if (!dark) {
      const c = document.createElement('canvas');
      dark = { c, g: c.getContext('2d'), w: 1, h: 1, d: 1, cols: 0, rows: 0, lit: null };
    }
    const d = gfx.dark;
    const cols = Math.max(1, Math.ceil(canvas.width / d / DARK_TILE));
    const rows = Math.max(1, Math.ceil(canvas.height / d / DARK_TILE));
    dark.d = d;
    dark.w = dark.c.width = cols * DARK_TILE;
    dark.h = dark.c.height = rows * DARK_TILE;
    if (!dark.lit || dark.lit.length < cols * rows) dark.lit = new Uint8Array(cols * rows);
    dark.cols = cols;
    dark.rows = rows;
    spot = bakeLight();
  }

  function resize(w, h) {
    cssW = Math.max(1, num(w, 320));
    cssH = Math.max(1, num(h, 180));
    setScale();
  }

  // ---------- заготовка заранее ----------

  // Пока игру закрывает заставка (loader.js), картинки комнаты, лисы, добычи и эффектов заготавливаются кусками —
  // иначе их рисуют первые кадры, и начало игры дёргается. Враги и другие места — как раньше, по ходу.

  /** Заготовить ещё картинок, пока не выйдет budget мс; вернуть долю готового (1 — всё). */
  function warm(budget = 8) {
    if (!warmed) {
      const biome = room?.biome ?? 'forest';
      const heads = [`prop.${biome}.`, `tile.${biome}.`, 'mob.fox.', 'mob.prey.', ...[...PREY].map((id) => `mob.${id}.`),
        'fx.', 'pick.', 'shot.', 'thing.'];
      const list = [];
      for (const key of spriteKeys()) {
        if (!heads.some((h) => key.startsWith(h))) continue;
        for (let v = 0; v < spriteDef(key).variants; v++) list.push([key, v]);
      }
      warmed = { list, at: 0 };
    }
    const { list } = warmed;
    const until = performance.now() + budget;
    while (warmed.at < list.length && performance.now() < until) {
      const [key, v] = list[warmed.at++];
      art.sprite(key, v);
    }
    return list.length ? warmed.at / list.length : 1;
  }

  // ---------- комната ----------

  function bake() {
    const M = ROOM_MARGIN;
    const w = Math.ceil((room.w * T + M * 2) * k);
    const h = Math.ceil((room.h * T + M * 2) * k);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    g.setTransform(k, 0, 0, k, M * k, M * k);
    try {
      paintRoom(g, room);
    } catch (e) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = DEEP_FILL[room.biome] ?? '#1f3a22';
      g.fillRect(0, 0, w, h);
    }
    bg = { c, M };
    deepKey = `tile.${room.biome}.deep`;
  }

  function takeProps() {
    const all = propsOf(room);
    for (let i = 0; i < all.length; i++) boxOf(all[i]);
    props = all.filter((p) => !p.over).sort((a, b) => a.y - b.y);
    over = all.filter((p) => p.over).sort((a, b) => a.y - b.y);
  }

  /**
   * Рамка картинки предмета в единицах мира (x0, y0, x1, y1) — по её записи в art.js с запасом на обводку и
   * округление; предмет за экраном не рисуется вовсе. Прежде отсекали по точке привязки с полем 70 единиц — и на
   * экран шла половина предметов, которых на нём нет (стволы верхней стены, когда камера ниже).
   */
  function boxOf(p) {
    const d = spriteDef(p.key);
    if (!d) {
      p.x0 = p.x - 70;
      p.x1 = p.x + 70;
      p.y0 = p.y - 70;
      p.y1 = p.y + 70;
      return;
    }
    p.x0 = p.x - d.ox - d.pad - BOX_SLACK;
    p.x1 = p.x - d.ox + d.w + d.pad + BOX_SLACK;
    p.y0 = p.y - d.oy - d.pad - BOX_SLACK;
    p.y1 = p.y - d.oy + d.h + d.pad + BOX_SLACK;
  }

  const onView = (p) => p.x1 > view.x && p.x0 < view.x + view.w && p.y1 > view.y && p.y0 < view.y + view.h;

  /** Что светится в комнате сама по себе (для «Ночи»): кристаллы и грибы пещер, горячие трещины. */
  function takeLights() {
    lights.length = 0;
    const add = (x, y, gl, v) => {
      if (lights.length >= NIGHT_LIGHTS) return;
      const c = v > 0 && gl[4] ? gl[4] : gl[3];
      lights.push({ x, y: y - gl[2], r: gl[0], a: gl[1], img: bakePuff(c), ph: (x * 0.013 + y * 0.029) % TAU });
    };
    for (let i = 0; i < props.length; i++) {
      const p = props[i];
      if (GLOWS[p.key]) add(p.x, p.y, GLOWS[p.key], p.v ?? 0);
    }
    if (room.special === 'hot' && room.tiles) {
      const hot = [30, 0.5, 0, HOT_GLOW];
      for (let i = 0; i < room.tiles.length; i++) {
        if (room.tiles[i] === TILE.SPECIAL) add(((i % room.w) + 0.5) * T, (Math.floor(i / room.w) + 0.5) * T, hot, 0);
      }
    }
    // светлячки — где попало по комнате, подальше от стен
    for (let i = 0; i < flies.length; i++) {
      flies[i].x = (1.5 + Math.random() * (room.w - 3)) * T;
      flies[i].y = (1.5 + Math.random() * (room.h - 3)) * T;
    }
    flyImg = bakePuff(FLY_GLOW);
  }

  function enterRoom(G) {
    room = G.room;
    bake();
    takeProps();
    takeLights();
    parts.length = 0;
    marks.length = 0;
    rings.length = 0;
    afters.length = 0;
    texts.length = 0;
    swing.on = false;
    snap = true;
    trauma = 0;
  }

  function refreshProps(G) {
    if (!G.room || G.room !== room) return;
    takeProps();
  }

  function reset() {
    parts.length = 0;
    marks.length = 0;
    rings.length = 0;
    afters.length = 0;
    texts.length = 0;
    swing.on = false;
    air.length = 0;
    airFor = '';
    room = null;
    bg = null;
    props = [];
    over = [];
    trauma = 0;
    flashA = 0;
    snap = true;
  }

  // ---------- события ----------

  function onEvent(e, G) {
    switch (e.t) {
      case 'hit': {
        burst(e.crit ? 'fx.star' : 'fx.spark', e.x, e.y, e.crit ? 4 : 3, { speed: 70, z: 8, life: 0.3 });
        if (e.crit) ring(e.x, e.y, 14, 1, 0.25);
        break;
      }
      case 'die':
        burst('fx.puff', e.x, e.y, 3, { v: 0, speed: 40, z: 4, vz: 20, g: 0, drag: 3, life: 0.5, s0: 0.7, s1: 1.4, a0: 0.8 });
        burst('fx.spark', e.x, e.y, e.elite ? 8 : 4, { speed: 90, z: 8, life: 0.4 });
        break;
      case 'catch':
        burst('fx.star', e.x, e.y, 5, { speed: 80, z: 8, life: 0.45 });
        burst('fx.puff', e.x, e.y, 2, { speed: 30, z: 4, g: 0, vz: 15, life: 0.4, s0: 0.6, s1: 1.2, a0: 0.7 });
        break;
      case 'escape':
        burst('fx.puff', e.x, e.y, 3, { speed: 30, z: 4, g: 0, vz: 10, life: 0.45, s0: 0.6, s1: 1.2, a0: 0.6 });
        break;
      case 'score':
        if (e.n) addText(e.x, e.y - 18, `+${e.n}`, '#ffe27a');
        break;
      case 'text':
        addText(e.x, e.y - 14, e.s, e.c);
        break;
      case 'pick':
        burst('fx.spark', e.x, e.y, 3, { speed: 45, z: 10, life: 0.3 });
        break;
      case 'hurt':
        flashA = 0.4;
        flashC = '255,50,50';
        break;
      case 'block':
        if (G?.player) ring(G.player.x, G.player.y, 18, 2, 0.3);
        break;
      case 'respawn':
        ring(e.x, e.y, 24, 1, 0.5);
        burst('fx.spark', e.x, e.y, 6, { speed: 60, z: 10, life: 0.5 });
        break;
      case 'dash':
        burst('fx.dust', e.x1, e.y1, 4, { speed: 50, z: 2, vz: 12, g: 0, drag: 4, life: 0.4, s0: 0.8, s1: 1.4, a0: 0.8 });
        break;
      case 'land':
        burst('fx.dust', e.x, e.y, 5, { speed: 70, z: 2, vz: 14, g: 0, drag: 5, life: 0.4, s0: 0.8, s1: 1.5, a0: 0.8 });
        ring(e.x, e.y, 16, 0, 0.25);
        break;
      case 'boom': {
        const look = BOOM_LOOK[e.look] ?? 0;
        ring(e.x, e.y, num(e.r, 30), look, 0.4);
        burst('fx.puff', e.x, e.y, 4, { speed: num(e.r, 30) * 1.6, z: 6, g: 0, vz: 10, life: 0.5, s0: 0.8, s1: 1.6, a0: 0.8 });
        burst(look === 1 ? 'fx.flame' : 'fx.spark', e.x, e.y, 5, { speed: 70, z: 6, life: 0.45 });
        break;
      }
      case 'shot':
        if (num(e.r) > 0) startSwing(e);
        else burst('fx.spark', e.x, e.y, 1, { speed: 20, z: 8, life: 0.15 });
        break;
      case 'strike': {
        const z = e.zone;
        if (z) {
          ring(z.x, z.y, Math.max(20, z.r || z.w || 20), 3, 0.35);
          burst('fx.dust', z.x, z.y, 4, { speed: 60, z: 2, vz: 14, g: 0, drag: 4, life: 0.4, s0: 0.8, s1: 1.4, a0: 0.8 });
        }
        break;
      }
      case 'spawn':
        if (marks.length >= 16) marks.shift();
        marks.push({ x: e.x, y: e.y, t: 0, life: 0.8 });
        break;
      case 'break':
        burst('fx.leaf', e.x, e.y, 6, { speed: 60, z: 10, life: 0.6, rot: true });
        break;
      case 'clear':
        if (G?.player) burst('fx.star', G.player.x, G.player.y, 6, { speed: 70, z: 14, life: 0.7 });
        break;
      case 'shake':
        trauma = Math.max(trauma, clamp(num(e.a), 0, 1));
        break;
      default:
    }
  }

  // ---------- координаты ----------

  const px = (wx) => wx * k - camPx;
  const py = (wy) => wy * k - camPy;

  function toWorld(x, y, out = {}) {
    out.x = view.x + x / scale;
    out.y = view.y + y / scale;
    return out;
  }

  function toScreen(wx, wy, out = {}) {
    out.x = (wx - view.x) * scale;
    out.y = (wy - view.y) * scale;
    return out;
  }

  // ---------- камера ----------

  function camera(G, dt, alpha, calm) {
    const P = G.player;
    const fx = P.px + (P.x - P.px) * alpha;
    const fy = P.py + (P.y - P.py) * alpha;
    let lx = 0;
    let ly = 0;
    if (P.aim) {
      lx = num(P.aim.x) * 26;
      ly = num(P.aim.y) * 26;
    } else {
      const sp = Math.hypot(P.vx, P.vy);
      if (sp > 5) {
        const top = Math.max(60, num(P.st?.speed, 130));
        const f = Math.min(1, sp / top) * 22 / sp;
        lx = P.vx * f;
        ly = P.vy * f;
      }
    }
    const tx = fx + lx;
    const ty = fy + ly;
    if (snap) {
      camX = tx;
      camY = ty;
      snap = false;
    } else {
      const f = 1 - Math.exp(-dt * 7);
      camX += (tx - camX) * f;
      camY += (ty - camY) * f;
    }
    const rw = room.w * T;
    const rh = room.h * T;
    let x = camX - view.w / 2;
    let y = camY - view.h / 2;
    x = view.w >= rw ? (rw - view.w) / 2 : clamp(x, 0, rw - view.w);
    y = view.h >= rh ? (rh - view.h) / 2 : clamp(y, 0, rh - view.h);
    if (!calm && trauma > 0) {
      const a = trauma * trauma * 7;
      x += Math.sin(t * 61) * a;
      y += Math.cos(t * 53) * a;
    }
    view.x = x;
    view.y = y;
    camPx = Math.round(x * k);
    camPy = Math.round(y * k);
  }

  // ---------- рисование ----------

  const POSE = {
    t: 0, act: 'idle', k: 0, speed: 0, vx: 0, vy: 0, z: 0, flash: 0, hp: 1, elite: false, aim: 0, data: null,
  };

  function pose(act, kk, speed, vx, vy, z, flash, hp, elite, aim, data) {
    POSE.t = t;
    POSE.act = act ?? 'idle';
    POSE.k = num(kk);
    POSE.speed = clamp(num(speed), 0, 1);
    POSE.vx = num(vx);
    POSE.vy = num(vy);
    POSE.z = num(z);
    POSE.flash = flash > 0 ? Math.min(1, flash / FLASH_TIME) : 0;
    POSE.hp = clamp(num(hp, 1), 0, 1);
    POSE.elite = Boolean(elite);
    POSE.aim = num(aim);
    POSE.data = data ?? null;
    POSE.sx = 1;
    POSE.sy = 1;
    return POSE;
  }

  function shadow(x, y, r, a = 1) {
    drawn.shadows += 1;
    const sx = (r * 2) / 32;
    art.putX(ctx, 'fx.shadow', px(x), py(y), 0, sx, sx * 1.1, a);
  }

  // существо без рисунка: шарик с глазами
  function blobFor(x, y, r, z, face, color) {
    const X = px(x);
    const Y = py(y - z);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(X, Y - r * k, r * k, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#fff';
    const ex = r * 0.35 * face * k;
    ctx.beginPath();
    ctx.arc(X + ex - r * 0.28 * k, Y - r * 1.15 * k, r * 0.22 * k, 0, TAU);
    ctx.arc(X + ex + r * 0.28 * k, Y - r * 1.15 * k, r * 0.22 * k, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#241a26';
    ctx.beginPath();
    ctx.arc(X + ex - r * 0.24 * k + face * r * 0.06 * k, Y - r * 1.15 * k, r * 0.1 * k, 0, TAU);
    ctx.arc(X + ex + r * 0.32 * k + face * r * 0.06 * k, Y - r * 1.15 * k, r * 0.1 * k, 0, TAU);
    ctx.fill();
  }

  // Хозяева в прыжке, под потолком и в вихре: расчёт ставит им hide (не задеть), но рисовать их надо — иначе пропадут
  // за один кадр. Здесь — как они выглядят в это время: прозрачность, масштаб, тень, нить.
  const LOOK = { a: 1, sx: 1, sy: 1, sh: 1, sa: 1, th: 0 };
  const hidAct = new WeakMap();              // хозяин → поза, в которой он спрятался (для пыли при приземлении)

  const boss = (m) => m.def?.kind === 'boss';

  function look(m, calm) {
    LOOK.a = 1;
    LOOK.sx = 1;
    LOOK.sy = 1;
    LOOK.sh = 1;
    LOOK.sa = 1;
    LOOK.th = 0;
    if (!m.hide) return LOOK;
    const z = num(m.z);
    switch (m.act) {
      case 'hop': {
        // жаба в прыжке: тень на земле сжимается, пока она взлетает, и растёт к месту приземления
        const h = clamp(z / Math.max(20, num(m.leapH, 60)), 0, 1);
        LOOK.sh = 1 - 0.4 * h;
        LOOK.sa = 1 - 0.3 * h;
        if (!calm) LOOK.sx = LOOK.sy = 1 + 0.1 * h;
        break;
      }
      case 'drop': {
        // королева лезет по нити под потолок и падает обратно: чем выше, тем меньше и прозрачнее
        const h = clamp(z / ALOFT, 0, 1);
        LOOK.a = 1 - smooth((z - 30) / 150);
        LOOK.sh = 1 - 0.65 * h;
        LOOK.sa = 1 - 0.65 * h;
        LOOK.th = z > 3 ? 1 : 0;
        // место падения меняется, пока её не видно: тень старого места гаснет на подъёме, нового — проступает
        if (m.state === 'climb') LOOK.sa *= 1 - smooth((h - 0.7) / 0.3);
        else if (m.state === 'aloft') LOOK.sa *= smooth(num(m.t) / 0.15);
        if (!calm) {
          LOOK.sx = LOOK.sy = 1 - 0.3 * h;
          if (m.state === 'climb' && m.t < 0.14) {
            const q = Math.sin((Math.PI * m.t) / 0.14);
            LOOK.sx *= 1 + 0.08 * q;
            LOOK.sy *= 1 - 0.14 * q;
          }
        }
        break;
      }
      case 'teleport': {
        // филин в вихре перьев: сам рисунок тает и возвращается, тень — вместе с ним
        const kk = clamp(num(m.k), 0, 1);
        const gone = kk < 0.5 ? smooth(kk / 0.4) : 1 - smooth((kk - 0.6) / 0.4);
        LOOK.sa = 1 - gone;
        LOOK.sh = 1 - 0.4 * gone;
        break;
      }
      default:
    }
    return LOOK;
  }

  function drawCreature(id, m, x, y, aim, sx = 1, sy = 1) {
    const def = m.def;
    const top = def?.speed || 100;
    const a = pose(m.act, m.k, Math.hypot(m.vx, m.vy) / top, m.vx, m.vy, m.z, m.flash,
      m.maxHp > 0 ? m.hp / m.maxHp : 1, m.elite, aim, m.data);
    a.sx = sx;
    a.sy = sy;
    const dir = m.face < 0 ? -1 : 1;
    if (art.hasRig(id)) {
      art.rig(ctx, id, px(x), py(y - num(m.z)), dir, a);
    } else {
      const col = m.kind === 0 ? '#d9a35b' : m.kind === 2 ? '#5a3a6a' : '#a23c4a';
      blobFor(x, y, m.r ?? 10, num(m.z), dir, col);
    }
  }

  // ---- очередь «по глубине»

  const QUEUE = [];
  let qn = 0;
  const QPOOL = [];

  function enqueue(y, kind, ref, x = 0) {
    let q = QPOOL[qn];
    if (!q) {
      q = {};
      QPOOL[qn] = q;
    }
    q.y = y;
    q.kind = kind;
    q.ref = ref;
    q.x = x;
    QUEUE[qn++] = q;
  }

  const byY = (a, b) => a.y - b.y;

  function visible(x, y, pad) {
    return x > view.x - pad && x < view.x + view.w + pad && y > view.y - pad && y < view.y + view.h + pad;
  }

  function putProp(p) {
    if (!onView(p)) return;
    drawn.props += 1;
    art.put(ctx, p.key, px(p.x), py(p.y), p.v ?? 0);
  }

  function drawFox(G, alpha) {
    const P = G.player;
    const x = P.px + (P.x - P.px) * alpha;
    const y = P.py + (P.y - P.py) * alpha;
    const flick = P.inv > 0 && P.act !== 'dash' && P.act !== 'down' && Math.floor(t * 14) % 2 === 0;
    const top = Math.max(60, num(P.st?.speed, 130));
    const a = pose(P.act, P.k, Math.hypot(P.vx, P.vy) / top, P.vx, P.vy, P.z, 0, 1, false, P.dir, null);
    const dir = P.face < 0 ? -1 : 1;
    // удар вверх — оружие за лисой, вниз и вбок — перед ней
    const back = swing.on && Math.sin(swingHead()) < -0.3;
    if (back) drawSwing(x, y - num(P.z));
    if (flick) ctx.globalAlpha = 0.55;
    if (art.hasRig('fox')) art.rig(ctx, 'fox', px(x), py(y - num(P.z)), dir, a);
    else blobFor(x, y, 9, num(P.z), dir, '#e8832a');
    if (flick) ctx.globalAlpha = 1;
    if (swing.on && !back) drawSwing(x, y - num(P.z));
    if (P.shield > 0) {
      art.putX(ctx, 'fx.ring', px(x), py(y - 8), 0, 0.55, 0.55, 0.35 + 0.1 * Math.sin(t * 6), 0);
    }
  }

  // доля пройденного: быстро в начале, мягко в конце; при «уменьшить движении» — сразу всё
  const swingDone = () => (calmNow ? 1 : 1 - (1 - clamp(swing.t / swing.life, 0, 1)) ** 3);
  // где сейчас оружие (угол); дыхание и рёв не ведут дугу — бьют сразу всем веером
  const swingHead = () => (swing.look === 0 ? swing.a + swing.dir * swing.arc * (swingDone() - 0.5) : swing.a);

  /**
   * Взмах ближнего оружия вокруг лисы (x, y — её ноги на земле). Когти и дубина: след-серп по дуге (внешний край —
   * ровно дальность удара, к хвосту сужается) и само оружие на конце. Дыхание и рёв: весь веер сразу, расходится
   * от лисы до края удара.
   */
  function drawSwing(x, y) {
    const s = swing;
    const cy = y - 8;                                  // от груди, а не от лап
    const e = swingDone();
    const g = clamp((s.t - s.life) / SWING_FADE, 0, 1);
    const fade = 1 - g;
    if (fade <= 0.01) return;
    const slash = s.look === 0;
    const from = s.a - s.dir * s.arc * 0.5;
    let u0 = 0;
    let u1 = 1;
    let outer = s.r * (0.35 + 0.65 * e);
    let wide = outer * 0.6;
    if (slash) {
      u1 = e;
      u0 = Math.max(0, e - 0.7) + (1 - Math.max(0, e - 0.7)) * g;
      outer = s.r;
      wide = clamp(s.r * 0.32, 9, 24);
    }
    const [fill, edge] = SWING_INK[s.look] ?? SWING_INK[0];
    const N = 10;
    const ang = (i) => from + s.dir * s.arc * (u0 + ((u1 - u0) * i) / N);
    const rim = () => {
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const f = ang(i);
        const X = px(x + Math.cos(f) * outer);
        const Y = py(cy + Math.sin(f) * outer);
        if (i === 0) ctx.moveTo(X, Y);
        else ctx.lineTo(X, Y);
      }
    };
    if (u1 - u0 > 0.01) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      rim();
      for (let i = N; i >= 0; i--) {
        const f = ang(i);
        const R = outer - wide * (slash ? 0.15 + 0.85 * (i / N) : 1);
        ctx.lineTo(px(x + Math.cos(f) * R), py(cy + Math.sin(f) * R));
      }
      ctx.closePath();
      ctx.globalAlpha = (slash ? 0.7 : 0.35) * fade;
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.globalAlpha = 0.9 * fade;
      ctx.strokeStyle = edge;
      ctx.lineWidth = Math.max(1, 1.3 * k);
      rim();
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (!s.icon) return;
    // само оружие: рукоять у лисы, конец смотрит наружу, ведёт дугу
    const head = swingHead();
    const d = clamp(s.r * 0.6, 18, 40);
    const flip = s.dir;
    art.putX(ctx, s.key, px(x + Math.cos(head) * d), py(cy + Math.sin(head) * d), head - flip * ICON_AXIS, ICON_SIZE, ICON_SIZE * flip, fade);
  }

  function drawThing(th) {
    if (th.broken && th.kind === 'target') return;
    const bob = Math.sin(t * 3 + th.uid) * 1.2;
    if (th.rig && art.hasRig(th.rig)) {
      const a = pose(th.act, th.k, 0, 0, 0, th.z, th.flash, 1, false, 0, th.data);
      art.rig(ctx, th.rig, px(th.x), py(th.y), th.face < 0 ? -1 : 1, a);
    } else {
      const key = `thing.${th.kind}`;
      // то, что летает (бабочка задания): поднято на свою высоту и смотрит, куда летит
      if (hasSprite(key) && (th.z > 0 || th.face < 0)) art.putX(ctx, key, px(th.x), py(th.y - num(th.z)), 0, th.face < 0 ? -1 : 1, 1, 1, th.v);
      else if (hasSprite(key)) art.put(ctx, key, px(th.x), py(th.y), th.v);
      else {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = '#7a5a3a';
        ctx.fillRect(px(th.x - th.r), py(th.y - th.r * 1.6), th.r * 2 * k, th.r * 1.6 * k);
      }
    }
    const iconKey = th.item ? `item.${th.item.id}` : th.icon;
    if (iconKey && hasSprite(iconKey)) {
      art.put(ctx, iconKey, px(th.x), py(th.y - 30 + bob), 0);
    }
  }

  function drawPick(p) {
    const lift = num(p.z) + (p.z < 0.5 ? Math.sin(t * 4 + p.x) * 1.5 + 2 : 0);
    if (p.kind === 'item') {
      const key = `item.${p.id}`;
      if (hasSprite(key)) art.put(ctx, key, px(p.x), py(p.y - lift - 4), 0);
      else art.put(ctx, 'fx.star', px(p.x), py(p.y - lift - 8), 0);
    } else {
      art.put(ctx, `pick.${p.kind}`, px(p.x), py(p.y - lift), 0);
    }
  }

  function drawShot(s) {
    const key = hasSprite(s.look) ? s.look : 'shot.orb';
    const rot = s.spin ? t * 18 : s.a;
    art.putX(ctx, key, px(s.x), py(s.y - num(s.z, 8)), rot, 1, 1, 1, s.v);
  }

  function drawActor(a) {
    const p = pose(a.act, a.k, 0, a.vx, a.vy, a.z, a.flash, 1, false, 0, null);
    if (art.hasRig(a.rig)) art.rig(ctx, a.rig, px(a.x), py(a.y), a.face < 0 ? -1 : 1, p);
  }

  function drawZones(G) {
    const zs = room.zones;
    const zb = veil?.zoneA ?? 1;      // ночью под зоной тёмная земля — заливка гуще, чтобы зона не темнела
    for (let i = 0; i < zs.length; i++) {
      const z = zs[i];
      if (z.wait > 0) continue;
      const look = ZONE_LOOK[z.look] ?? ZONE_LOOK.red;
      const foe = z.from === 1;
      const prog = z.phase === 0 ? clamp(z.t / z.total, 0, 1) : 1;
      const baseA = (foe ? 0.2 : 0.12) * zb;
      const hotA = (z.phase === 1 ? 0.5 + 0.12 * Math.sin(t * 20) : 0.15 + 0.25 * prog) * zb;
      const fill = (a) => look[0].replace('A', clamp(a, 0, 1).toFixed(2));
      ctx.setTransform(k, 0, 0, k, -camPx, -camPy);
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = look[1];
      ctx.globalAlpha = Math.min(1, (foe ? 0.9 : 0.6) * zb);
      if (z.sh === 0) {
        ctx.fillStyle = fill(baseA);
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.r, 0, TAU);
        ctx.fill();
        if (z.phase === 0) {
          ctx.fillStyle = fill(hotA);
          ctx.beginPath();
          ctx.arc(z.x, z.y, Math.max(0.1, z.r * prog), 0, TAU);
          ctx.fill();
        } else {
          ctx.fillStyle = fill(hotA);
          ctx.fill();
        }
        ctx.stroke();
      } else if (z.sh === 1) {
        const len = Math.hypot(z.x2 - z.x, z.y2 - z.y);
        ctx.translate(z.x, z.y);
        ctx.rotate(z.a);
        ctx.fillStyle = fill(baseA);
        ctx.fillRect(0, -z.w / 2, len, z.w);
        ctx.fillStyle = fill(hotA);
        ctx.fillRect(0, -z.w / 2, z.phase === 0 ? len * prog : len, z.w);
        ctx.strokeRect(0, -z.w / 2, len, z.w);
        // бегущие шевроны: куда ударит
        ctx.strokeStyle = look[1];
        ctx.globalAlpha = 0.55;
        const step = 22;
        const off = (t * 70) % step;
        for (let d = off; d < len - 4; d += step) {
          ctx.beginPath();
          ctx.moveTo(d, -z.w * 0.28);
          ctx.lineTo(d + 6, 0);
          ctx.lineTo(d, z.w * 0.28);
          ctx.stroke();
        }
      } else if (z.sh === 2) {
        ctx.fillStyle = fill(baseA);
        ctx.beginPath();
        ctx.moveTo(z.x, z.y);
        ctx.arc(z.x, z.y, z.r, z.a - z.arc / 2, z.a + z.arc / 2);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = fill(hotA);
        ctx.beginPath();
        ctx.moveTo(z.x, z.y);
        ctx.arc(z.x, z.y, Math.max(0.1, z.r * prog), z.a - z.arc / 2, z.a + z.arc / 2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.lineWidth = Math.max(1.4, z.w);
        ctx.strokeStyle = fill(hotA);
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.r, 0, TAU);
        ctx.stroke();
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = look[1];
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.r + z.w / 2, 0, TAU);
        ctx.arc(z.x, z.y, Math.max(0, z.r - z.w / 2), 0, TAU);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawGround(G, alpha) {
    // норы и логова
    for (let i = 0; i < room.burrows.length; i++) {
      const b = room.burrows[i];
      if (!visible(b.x, b.y, 30)) continue;
      ctx.setTransform(k, 0, 0, k, -camPx, -camPy);
      ctx.fillStyle = 'rgba(30,18,24,0.5)';
      ctx.beginPath();
      ctx.ellipse(b.x, b.y, 11, 6.5, 0, 0, TAU);
      ctx.fill();
    }
    if (!veil?.marks) drawMarks();
    if (!veil) drawZones(G);     // при пелене атмосферы зоны рисуются поверх неё (drawAbove)
    // свечение подбираемого
    for (let i = 0; i < room.picks.length; i++) {
      const p = room.picks[i];
      if (!visible(p.x, p.y, 30)) continue;
      const g = p.kind === 'item' ? 1 : GLOW_OF[p.kind] ?? 0;
      const s = 0.55 + 0.08 * Math.sin(t * 5 + p.x);
      art.putX(ctx, 'fx.glow', px(p.x), py(p.y - 4), 0, s, s, 0.55, g);
    }
    // кольца
    for (let i = 0; i < rings.length; i++) {
      const r = rings[i];
      const f = r.t / r.life;
      const s = (r.r * (0.35 + 0.65 * f)) / 20;
      art.putX(ctx, 'fx.ring', px(r.x), py(r.y), 0, s, s * 0.7, 1 - f, 0);
    }
  }

  /** Знаки появления зверей (пульсирующий «!» на земле). */
  function drawMarks() {
    for (let i = 0; i < marks.length; i++) {
      const m = marks[i];
      const f = m.t / m.life;
      const s = 0.8 + 0.25 * Math.sin(m.t * 18);
      art.putX(ctx, 'fx.warn', px(m.x), py(m.y), 0, s, s, 1 - f * 0.4);
    }
  }

  // ---------- атмосфера комнаты (room.mod) ----------

  // Пелена условия комнаты ложится поверх всего, что стоит на земле (шаг 7 кадра). Чего она прятать не должна, рисуется
  // после неё (drawAbove): красные зоны и выстрелы, ночью ещё и знаки появления (marks); воздух (листья, снег) ночью
  // уходит под темноту (airUnder); zoneA — во сколько раз гуще заливка зон. Новое условие — строка здесь и своя draw
  // рядом с drawFog / drawNight.
  const VEILS = {
    fog: { draw: drawFog, marks: false, airUnder: false, zoneA: 1 },
    night: { draw: drawNight, marks: true, airUnder: true, zoneA: 1.5 },
  };
  let veil = null;            // пелена этого кадра или null
  let ia = 1;                 // доля между шагами расчёта для lerp (как alpha кадра)
  const lerp = (a, b) => a + (b - a) * ia;

  /** Поверх пелены: то, что игрок должен видеть всегда. */
  function drawAbove(G, v) {
    if (v.marks) drawMarks();
    drawZones(G);
    for (let i = 0; i < room.shots.length; i++) {
      const s = room.shots[i];
      if (s.on && visible(s.x, s.y, 40)) drawShot(s);
    }
  }

  /**
   * Туман: пелена с чистым кругом вокруг лисы, поверх — клоки дымки (дальше от лисы гуще); красные зоны и выстрелы
   * туман не прячет (drawAbove). Лиса стоит в чистом круге, ей отдельно ничего не нужно.
   */
  function drawFog(G, alpha) {
    const P = G.player;
    const col = FOG_TINT[room.biome] ?? FOG_TINT.forest;
    const W = canvas.width;
    const H = canvas.height;
    const fx = px(P.px + (P.x - P.px) * alpha);
    const fy = py(P.py + (P.y - P.py) * alpha);
    const R = FOG_FAR * k;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = FOG_MAX;
    ctx.fillStyle = col;
    const x0 = Math.round(fx - R);
    const x1 = Math.round(fx + R);
    const y0 = Math.round(fy - R);
    const y1 = Math.round(fy + R);
    if (y0 > 0) ctx.fillRect(0, 0, W, Math.min(H, y0));
    if (y1 < H) ctx.fillRect(0, Math.max(0, y1), W, H - Math.max(0, y1));
    const top = Math.max(0, y0);
    const bot = Math.min(H, y1);
    if (bot > top) {
      if (x0 > 0) ctx.fillRect(0, top, Math.min(W, x0), bot - top);
      if (x1 < W) ctx.fillRect(Math.max(0, x1), top, W - Math.max(0, x1), bot - top);
    }
    ctx.drawImage(bakeFog(col), x0, y0, x1 - x0, y1 - y0);
    // клоки дымки: плывут по экрану, возле лисы тают
    const n = Math.min(gfx.puffs, puffs.length);
    if (n > 0) {
      const pf = bakePuff(col);
      for (let i = 0; i < n; i++) {
        const p = puffs[i];
        const X = ((((p.x + fogT * p.sx) % 1.4) + 1.4) % 1.4 - 0.2) * W;
        const Y = (p.y + Math.sin(fogT * 0.12 + p.ph) * 0.04) * H;
        const f = smooth((Math.hypot(X - fx, Y - fy) / k - FOG_CLEAR) / (FOG_FAR - FOG_CLEAR));
        if (f <= 0.01) continue;
        const s = 110 * p.s * k;
        ctx.globalAlpha = FOG_PUFF * f;
        ctx.drawImage(pf, X - s / 2, Y - s * 0.35, s, s * 0.7);
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Вырезать в слое темноты пятно света: (x, y) — середина в единицах мира, r — радиус, a — сколько темноты снять. */
  function cut(g, x, y, r, a) {
    if (a <= 0.01 || !visible(x, y, r)) return;
    const R = r * k;
    const X = px(x);
    const Y = py(y);
    g.globalAlpha = a > 1 ? 1 : a;
    g.drawImage(spot, X - R, Y - R, R * 2, R * 2);
    cuts += 1;
    // отметить плитки, которых коснулось пятно (за его квадратом свет уже ноль)
    const D = dark;
    const s = DARK_TILE * D.d;
    const i0 = clamp(Math.floor((X - R) / s), 0, D.cols - 1);
    const i1 = clamp(Math.floor((X + R) / s), 0, D.cols - 1);
    const j0 = clamp(Math.floor((Y - R) / s), 0, D.rows - 1);
    const j1 = clamp(Math.floor((Y + R) / s), 0, D.rows - 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) D.lit[j * D.cols + i] = 1;
  }

  /**
   * Положить темноту на кадр: по рядам плиток — куски, где есть свет, из слоя (растянуты в D.d раз), а сплошь тёмные —
   * одной заливкой тем же цветом и той же густотой (выходит то же самое, но заливка в разы дешевле растянутой картинки).
   * Соседние одинаковые плитки идут одним вызовом.
   */
  function layDark(D, tint) {
    const S = DARK_TILE;
    const s = S * D.d;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = NIGHT_MAX;
    ctx.fillStyle = tint;
    for (let j = 0; j < D.rows; j++) {
      const row = j * D.cols;
      let i = 0;
      while (i < D.cols) {
        const on = D.lit[row + i];
        let e = i + 1;
        while (e < D.cols && D.lit[row + e] === on) e += 1;
        if (on) ctx.drawImage(D.c, i * S, j * S, (e - i) * S, S, i * s, j * s, (e - i) * s, s);
        else ctx.fillRect(i * s, j * s, (e - i) * s, s);
        i = e;
      }
    }
  }

  /**
   * Ночь: слой темноты (меньше холста в gfx.dark раз) заливается цветом места, в нём вырезаются пятна света
   * (bakeLight, destination-out), и он ложится на кадр (layDark). Поверх — цветные отсветы светящихся вещей и
   * точки светлячков, если позволяет «Графика». Свет у лисы чуть дышит, вещи места мерцают — при calm всё ровное.
   */
  function drawNight(G, alpha) {
    if (!dark) makeDark();
    const D = dark;
    const g = D.g;
    const P = G.player;
    const live = !calmNow;
    ia = alpha;
    const tint = NIGHT_TINT[room.biome] ?? NIGHT_TINT.forest;
    cuts = 0;
    glows = 0;
    D.lit.fill(0);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.fillStyle = tint;
    g.fillRect(0, 0, D.w, D.h);
    g.globalCompositeOperation = 'destination-out';
    g.setTransform(1 / D.d, 0, 0, 1 / D.d, 0, 0);    // дальше — в точках кадра
    const breath = live ? 1 + 0.035 * Math.sin(nightT * 7.3) + 0.02 * Math.sin(nightT * 12.9 + 1) : 1;
    cut(g, lerp(P.px, P.x), lerp(P.py, P.y) - 8, NIGHT_R * breath, 1);
    for (let i = 0; i < lights.length; i++) {
      const s = lights[i];
      cut(g, s.x, s.y, s.r * (live ? 1 + 0.07 * Math.sin(nightT * 1.7 + s.ph) : 1), s.a);
    }
    // звери, спутники, вещи, подбираемое, напасти: слабое пятно на каждом (светлячок-спутник светит сам)
    const mobs = room.mobs;
    for (let i = 0; i < mobs.length; i++) {
      const m = mobs[i];
      if (m.dead || (m.hide && !boss(m))) continue;
      const r = num(m.r, 10);
      cut(g, lerp(m.px, m.x), lerp(m.py, m.y) - num(m.z) - r * 0.9, Math.max(18, r * 2.4), NIGHT_SEEN * look(m, calmNow).a);
    }
    for (let i = 0; i < room.pals.length; i++) {
      const n = room.pals[i];
      const r = num(n.r, 8);
      if (n.id === 'firefly') cut(g, lerp(n.px, n.x), lerp(n.py, n.y) - num(n.z), 70, 0.9);
      else cut(g, lerp(n.px, n.x), lerp(n.py, n.y) - num(n.z) - r * 0.9, Math.max(18, r * 2.4), NIGHT_SEEN);
    }
    for (let i = 0; i < room.things.length; i++) {
      const th = room.things[i];
      if (!(th.broken && th.kind === 'target')) cut(g, th.x, th.y - num(th.z) - th.r, Math.max(18, th.r * 2.2), NIGHT_SEEN);
    }
    for (let i = 0; i < room.picks.length; i++) {
      const p = room.picks[i];
      if (p.on) cut(g, p.x, p.y - 6, 18, NIGHT_SEEN);
    }
    for (let i = 0; i < room.actors.length; i++) cut(g, room.actors[i].x, room.actors[i].y - 20, 48, NIGHT_SEEN);
    const nf = FLY_BIOMES.has(room.biome) ? Math.min(gfx.flies, flies.length) : 0;
    for (let i = 0; i < nf; i++) {
      const f = flies[i];
      f.X = f.x + Math.sin(nightT * 0.5 * f.sp + f.ph) * 30;
      f.Y = f.y + Math.sin(nightT * 0.37 * f.sp + f.ph * 1.7) * 20 - 14;
      f.a = live ? 0.55 + 0.45 * Math.sin(nightT * 2.1 * f.sp + f.ph) : 1;
      cut(g, f.X, f.Y, 34, 0.45 * f.a);
    }
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.setTransform(1, 0, 0, 1, 0, 0);
    layDark(D, tint);
    // цветные отсветы и светлячки — поверх темноты
    if (gfx.glow) {
      for (let i = 0; i < lights.length; i++) {
        const s = lights[i];
        if (!visible(s.x, s.y, s.r)) continue;
        const R = s.r * k * (live ? 1 + 0.07 * Math.sin(nightT * 1.7 + s.ph) : 1);
        ctx.globalAlpha = 0.22 * s.a;
        ctx.drawImage(s.img, px(s.x) - R, py(s.y) - R * 0.8, R * 2, R * 1.6);
        glows += 1;
      }
    }
    for (let i = 0; i < nf; i++) {
      const f = flies[i];
      if (!visible(f.X, f.Y, 20)) continue;
      const s = 3.2 * k;
      ctx.globalAlpha = 0.9 * f.a;
      ctx.drawImage(flyImg, px(f.X) - s, py(f.Y) - s, s * 2, s * 2);
      ctx.globalAlpha = 0.16 * f.a;
      ctx.drawImage(flyImg, px(f.X) - s * 5, py(f.Y) - s * 5, s * 10, s * 10);
      glows += 1;
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Земля за краем комнаты — только там, куда не достаёт запечённый фон. Фон непрозрачен (кроме крайней точки по
   * краю), так что под ним заливать и класть плитки незачем. Прежде каждый кадр заливался весь экран, а когда комната
   * уже экрана — ещё и плитками по всему экрану (~80 картинок), и всё это закрывал фон: выходило три слоя на месте одного.
   */
  function deepFill() {
    const W = canvas.width;
    const H = canvas.height;
    // где ляжет фон (так же, как в кадре), без двух крайних точек
    let x0 = 0;
    let y0 = 0;
    let x1 = 0;
    let y1 = 0;
    if (bg) {
      x0 = Math.round(-camPx - bg.M * k) + 2;
      y0 = Math.round(-camPy - bg.M * k) + 2;
      x1 = x0 + bg.c.width - 4;
      y1 = y0 + bg.c.height - 4;
    }
    if (bg && x0 <= 0 && y0 <= 0 && x1 >= W && y1 >= H) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = DEEP_FILL[room.biome] ?? '#1f3a22';
    if (!bg || x1 <= x0 || y1 <= y0) {
      ctx.fillRect(0, 0, W, H);
      drawn.fills += 1;
      x0 = y0 = x1 = y1 = 0;
    } else {
      const l = clamp(x0, 0, W);
      const r = clamp(x1, 0, W);
      const t = clamp(y0, 0, H);
      const b = clamp(y1, 0, H);
      if (t > 0) fillOut(0, 0, W, t);
      if (b < H) fillOut(0, b, W, H - b);
      if (b > t && l > 0) fillOut(0, t, l, b - t);
      if (b > t && r < W) fillOut(r, t, W - r, b - t);
    }
    const rw = room.w * T;
    const rh = room.h * T;
    const M = ROOM_MARGIN;
    const outside = view.x < -M || view.y < -M || view.x + view.w > rw + M || view.y + view.h > rh + M;
    if (!outside || !hasSprite(deepKey)) return;
    const s = art.sprite(deepKey);
    if (!s) return;
    const step = 64;
    const tx0 = Math.floor(view.x / step);
    const tx1 = Math.ceil((view.x + view.w) / step);
    const ty0 = Math.floor(view.y / step);
    const ty1 = Math.ceil((view.y + view.h) / step);
    const size = Math.ceil(step * k) + 1;
    for (let gy = ty0; gy < ty1; gy++) {
      for (let gx = tx0; gx < tx1; gx++) {
        const X = Math.round(gx * step * k - camPx);
        const Y = Math.round(gy * step * k - camPy);
        if (X >= x0 && Y >= y0 && X + size <= x1 && Y + size <= y1) continue;     // целиком под фоном
        ctx.drawImage(s.c, X, Y, size, size);
        drawn.tiles += 1;
      }
    }
  }

  function fillOut(x, y, w, h) {
    ctx.fillRect(x, y, w, h);
    drawn.fills += 1;
  }

  function drawAim(G) {
    const P = G.player;
    if (!P.aim) return;
    const p = clamp(num(P.aim.p), 0, 1);
    const len = num(P.st?.dashDist, 120) * (DASH.minPower + (1 - DASH.minPower) * p);
    const x = P.x;
    const y = P.y;
    const dx = num(P.aim.x);
    const dy = num(P.aim.y);
    const n = Math.max(2, Math.floor(len / 14));
    for (let i = 1; i < n; i++) {
      const f = i / n;
      art.put(ctx, 'fx.aim.dot', px(x + dx * len * f), py(y + dy * len * f - 2), 0, 0.35 + 0.5 * f);
    }
    art.putX(ctx, 'fx.aim.head', px(x + dx * len), py(y + dy * len - 2), Math.atan2(dy, dx), 1, 1, 0.95);
  }

  function drawParts() {
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      const f = p.t / p.life;
      const s = p.s0 + (p.s1 - p.s0) * f;
      const a = p.a0 + (p.a1 - p.a0) * f;
      if (a <= 0.01) continue;
      art.putX(ctx, p.key, px(p.x), py(p.y - p.z), p.rot, s, s, a, p.v);
    }
  }

  function drawTexts() {
    for (let i = 0; i < texts.length; i++) {
      const x = texts[i];
      const f = x.t / 0.9;
      const pop = x.t < 0.1 ? 0.6 + 4 * x.t : 1;
      const b = bakeText(x.s, x.c, k);
      const X = px(x.x);
      const Y = py(x.y - f * 22);
      ctx.setTransform(pop, 0, 0, pop, X, Y);
      ctx.globalAlpha = f > 0.7 ? 1 - (f - 0.7) / 0.3 : 1;
      ctx.drawImage(b.c, -b.ox, -b.oy);
    }
    ctx.globalAlpha = 1;
  }

  // воздух: пылинки, листья, снег — на экране, медленно плывут
  function airKey(biome) {
    return biome === 'taiga' ? 'snow' : biome === 'cave' ? 'dust' : biome === 'swamp' ? 'mist' : 'leaf';
  }

  function stepAir(dt) {
    const key = room.biome;
    if (airFor !== key) {
      airFor = key;
      air.length = 0;
      const n = qi === 0 ? 28 : qi === 1 ? 20 : 12;
      for (let i = 0; i < n; i++) {
        air.push({ x: Math.random(), y: Math.random(), s: 0.5 + Math.random() * 0.8, ph: Math.random() * TAU, v: i });
      }
    }
    const sx = key === 'taiga' ? -0.02 : 0.03;
    const sy = key === 'taiga' ? 0.07 : key === 'autumn' || key === 'forest' ? 0.025 : -0.01;
    for (let i = 0; i < air.length; i++) {
      const a = air[i];
      a.x += (sx + Math.sin(t * 0.7 + a.ph) * 0.02) * dt * a.s;
      a.y += sy * dt * a.s;
      if (a.x > 1.05) a.x = -0.05;
      else if (a.x < -0.05) a.x = 1.05;
      if (a.y > 1.05) a.y = -0.05;
      else if (a.y < -0.05) a.y = 1.05;
    }
  }

  function drawAir() {
    const key = airKey(room.biome);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (let i = 0; i < air.length; i++) {
      const a = air[i];
      const X = a.x * canvas.width;
      const Y = a.y * canvas.height;
      if (key === 'snow') {
        ctx.fillStyle = 'rgba(240,248,255,0.8)';
        ctx.beginPath();
        ctx.arc(X, Y, 1.1 * k * a.s, 0, TAU);
        ctx.fill();
      } else if (key === 'dust') {
        ctx.fillStyle = 'rgba(190,170,255,0.5)';
        ctx.beginPath();
        ctx.arc(X, Y, 0.9 * k * a.s, 0, TAU);
        ctx.fill();
      } else if (key === 'mist') {
        art.putX(ctx, 'fx.puff', X, Y, 0, 2.2 * a.s, 1.6 * a.s, 0.12, 0);
      } else if (room.biome === 'autumn') {
        art.putX(ctx, 'fx.leaf', X, Y, t * a.s + a.ph, 1, 1, 0.8, a.v);
      } else {
        ctx.fillStyle = 'rgba(255,240,170,0.65)';
        ctx.beginPath();
        ctx.arc(X, Y, 0.9 * k * a.s * (0.7 + 0.3 * Math.sin(t * 3 + a.ph)), 0, TAU);
        ctx.fill();
      }
    }
  }

  // ---------- кадр ----------

  function stepFx(dt, calm) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.t += dt;
      if (p.t >= p.life) {
        spare.push(p);
        parts[i] = parts[parts.length - 1];
        parts.pop();
        continue;
      }
      const d = Math.exp(-p.drag * dt);
      p.vx *= d;
      p.vy *= d;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vz -= p.g * dt;
      p.z += p.vz * dt;
      if (p.z < 0) {
        p.z = 0;
        p.vz *= -0.3;
      }
      p.rot += p.vr * dt;
    }
    for (let i = texts.length - 1; i >= 0; i--) {
      texts[i].t += dt;
      if (texts[i].t >= 0.9) texts.splice(i, 1);
    }
    for (let i = marks.length - 1; i >= 0; i--) {
      marks[i].t += dt;
      if (marks[i].t >= marks[i].life) marks.splice(i, 1);
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      rings[i].t += dt;
      if (rings[i].t >= rings[i].life) rings.splice(i, 1);
    }
    for (let i = afters.length - 1; i >= 0; i--) {
      afters[i].t += dt;
      if (afters[i].t >= AFTER_LIFE) afters.splice(i, 1);
    }
    if (swing.on) {
      swing.t += dt;
      if (swing.t >= swing.life + SWING_FADE) swing.on = false;
    }
    trauma = Math.max(0, trauma - SHAKE_DECAY * dt);
    flashA = Math.max(0, flashA - dt * 2.2);
  }

  function frame(G, dt, opts = {}) {
    dt = clamp(num(dt), 0, 0.1);
    t += dt;
    const calm = Boolean(opts.calm);
    calmNow = calm;
    const alpha = clamp(num(opts.alpha, 1), 0, 1);
    if (!calm) {
      fogT += dt;
      nightT += dt;
    }
    if (!G || !G.room) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#1f3a22';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }
    if (room !== G.room) enterRoom(G);
    drawn.props = drawn.tiles = drawn.fills = drawn.shadows = 0;
    veil = own(VEILS, room.mod) ? VEILS[room.mod] : null;
    stepFx(dt, calm);
    const P = G.player;

    // тени рывка
    if (P.dash && !calm) {
      afterT -= dt;
      if (afterT <= 0) {
        afterT = gfx.ghost;
        if (afters.length < 10) afters.push({ x: P.x, y: P.y, z: P.z, face: P.face, k: P.k, vx: P.vx, vy: P.vy, dir: P.dir, t: 0 });
      }
    } else afterT = 0;
    if (!calm && P.dash && P.dash.t < 0.2 && Math.random() < dt * 40) {
      spawn('fx.dust', P.x, P.y, { z: 2, life: 0.3, s0: 0.7, s1: 1.2, a0: 0.6, vz: 6 });
    }

    camera(G, dt, alpha, calm);
    const airOn = !calm && gfx.air;
    if (airOn) stepAir(dt);

    // 1. фон
    deepFill();
    if (bg) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(bg.c, Math.round(-camPx - bg.M * k), Math.round(-camPy - bg.M * k));
    }

    // 2. метки на земле
    drawGround(G, alpha);

    // 3. тени
    const mobs = room.mobs;
    for (let i = 0; i < mobs.length; i++) {
      // хозяин ушёл в прыжок или под потолок — пыль из-под лап; вернулся — пыль и кольцо удара
      const m = mobs[i];
      if (m.dead || !boss(m)) continue;
      const was = hidAct.get(m);
      if (m.hide && was === undefined) {
        hidAct.set(m, m.act);
        if (!calm && !m.flying && m.leapT > 0) {
          burst('fx.dust', m.x, m.y, 4, { speed: 50, z: 2, vz: 12, g: 0, drag: 4, life: 0.4, s0: 0.8, s1: 1.4, a0: 0.8 });
        }
      } else if (!m.hide && was !== undefined) {
        hidAct.delete(m);
        if (!calm && (was === 'hop' || was === 'drop' || m.act === 'recover')) {
          burst('fx.dust', m.x, m.y, 7, { speed: 90, z: 2, vz: 14, g: 0, drag: 5, life: 0.45, s0: 0.9, s1: 1.7, a0: 0.8 });
          ring(m.x, m.y, (m.r ?? 20) * 1.2, 0, 0.3);
        }
      }
    }
    // низкая «Графика»: тени только у лисы, хозяев и тех, кто в воздухе — по ним видно, где он и куда упадёт
    const shadeAll = gfx.shade > 1;
    for (let i = 0; i < mobs.length; i++) {
      const m = mobs[i];
      if (m.dead || (m.hide && !boss(m)) || !visible(m.x, m.y, 60)) continue;
      if (!shadeAll && !m.flying && num(m.z) < 2 && !boss(m)) continue;
      if (m.hide) {
        const L = look(m, calm);
        shadow(m.px + (m.x - m.px) * alpha, m.py + (m.y - m.py) * alpha, (m.r ?? 10) * 1.1 * L.sh, (m.flying ? 0.5 : 1) * L.sa);
        continue;
      }
      shadow(m.x, m.y, (m.r ?? 10) * 1.1, m.flying ? 0.5 : 1);
    }
    for (let i = 0; i < room.pals.length; i++) {
      const n = room.pals[i];
      if (shadeAll || num(n.z) >= 2) shadow(n.x, n.y, (n.r ?? 8) * 1.1);
    }
    {
      const fx = P.px + (P.x - P.px) * alpha;
      const fy = P.py + (P.y - P.py) * alpha;
      const h = clamp(1 - num(P.z) / 60, 0.4, 1);
      if (P.act !== 'down') shadow(fx, fy, 11 * h);
    }
    for (let i = 0; i < room.things.length; i++) {
      const th = room.things[i];
      if (th.solid && !th.broken && shadeAll && visible(th.x, th.y, 60)) shadow(th.x, th.y, th.r * 1.2, 0.8);
      else if (th.z > 0 && visible(th.x, th.y, 60)) shadow(th.x, th.y, th.r * 0.9, 0.5);
    }
    for (let i = 0; i < room.shots.length; i++) {
      const s = room.shots[i];
      if (s.on && shadeAll && num(s.z, 8) > 3 && visible(s.x, s.y, 30)) shadow(s.x, s.y, 4, 0.5);
    }
    for (let i = 0; i < room.actors.length; i++) {
      const a = room.actors[i];
      // бегущий лось; лапа свою тень рисует сама — она растёт, пока лапа падает
      if (a.rig === 'haz.moose' && visible(a.x, a.y, 80)) shadow(a.x, a.y, 28);
    }

    // 4. по глубине
    qn = 0;
    for (let i = 0; i < props.length; i++) {
      const p = props[i];
      if (onView(p)) enqueue(p.y, 0, p);
    }
    for (let i = 0; i < afters.length; i++) enqueue(afters[i].y - 0.2, 7, afters[i]);
    for (let i = 0; i < mobs.length; i++) {
      const m = mobs[i];
      if (m.dead || !visible(m.x, m.y, 60)) continue;
      if (!m.hide) enqueue(m.y, 1, m);
      else if (boss(m)) {
        // прыжок и уход с поля: рисуем, пока не растаял
        if (look(m, calm).a > 0.02) enqueue(m.y, 1, m);
      }
    }
    for (let i = 0; i < room.pals.length; i++) enqueue(room.pals[i].y, 1, room.pals[i]);
    for (let i = 0; i < room.things.length; i++) {
      const th = room.things[i];
      if (visible(th.x, th.y, 60)) enqueue(th.y, 2, th);
    }
    for (let i = 0; i < room.picks.length; i++) {
      const p = room.picks[i];
      if (p.on && visible(p.x, p.y, 30)) enqueue(p.y, 3, p);
    }
    for (let i = 0; i < room.shots.length; i++) {
      const s = room.shots[i];
      if (s.on && visible(s.x, s.y, 40)) enqueue(s.y, 4, s);
    }
    for (let i = 0; i < room.actors.length; i++) enqueue(room.actors[i].y, 5, room.actors[i]);
    enqueue(P.py + (P.y - P.py) * alpha, 6, P);
    for (let i = qn; i < QUEUE.length; i++) QUEUE[i] = undefined;
    QUEUE.length = qn;
    QUEUE.sort(byY);
    for (let i = 0; i < qn; i++) {
      const q = QUEUE[i];
      switch (q.kind) {
        case 0: putProp(q.ref); break;
        case 1: {
          const m = q.ref;
          const a = Math.atan2(P.y - m.y, P.x - m.x);
          const mx = m.px + (m.x - m.px) * alpha;
          const my = m.py + (m.y - m.py) * alpha;
          if (!m.hide) {
            drawCreature(m.id, m, mx, my, a);
            break;
          }
          const L = look(m, calm);
          if (L.th > 0) {
            // нить, по которой королева ушла под потолок
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.globalAlpha = 0.5 * (0.35 + 0.65 * L.a);
            ctx.fillStyle = '#e6e2f0';
            const top = Math.round(py(my - num(m.z)) - 8 * k);
            if (top > 0) ctx.fillRect(Math.round(px(mx) - 0.8 * k), 0, Math.max(1, Math.round(1.6 * k)), top);
          }
          ctx.globalAlpha = L.a;
          drawCreature(m.id, m, mx, my, a, L.sx, L.sy);
          ctx.globalAlpha = 1;
          break;
        }
        case 2: drawThing(q.ref); break;
        case 3: drawPick(q.ref); break;
        case 4: drawShot(q.ref); break;
        case 5: drawActor(q.ref); break;
        case 6: drawFox(G, alpha); break;
        default: {
          const a = q.ref;
          const f = a.t / AFTER_LIFE;
          ctx.globalAlpha = 0.45 * (1 - f);
          const top = Math.max(60, num(P.st?.speed, 130));
          const p = pose('dash', a.k, Math.hypot(a.vx, a.vy) / top, a.vx, a.vy, a.z, 0, 1, false, a.dir, null);
          if (art.hasRig('fox')) art.rig(ctx, 'fox', px(a.x), py(a.y - num(a.z)), a.face < 0 ? -1 : 1, p);
          ctx.globalAlpha = 1;
        }
      }
    }
    ctx.globalAlpha = 1;

    // 5. частицы и то, что летит
    drawParts();

    // 6. над головой
    for (let i = 0; i < over.length; i++) putProp(over[i]);

    // 7. атмосфера комнаты (туман, ночь) и то, что поверх неё; воздух, виньетка
    if (veil?.airUnder && airOn) drawAir();
    if (veil) {
      veil.draw(G, alpha);
      drawAbove(G, veil);
    }
    if (!veil?.airUnder && airOn) drawAir();
    if (vig) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(vig, 0, 0, canvas.width, canvas.height);
    }

    // 8. надписи, стрелка рывка, вспышка урона
    drawAim(G);
    drawTexts();
    if (flashA > 0.01 && !calm) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = `rgba(${flashC},${(flashA * 0.35).toFixed(3)})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** Положение «Графики»: ступень чёткости, воздух и виньетка — заново; частицы сверх потолка убираются. */
  function setGraphics(level) {
    const g = GRAPHICS[level] ?? GRAPHICS[GRAPHICS_DEFAULT];
    if (g === gfx && qi === g.step) return;
    gfx = g;
    qi = g.step;
    airFor = '';
    while (parts.length > partCap()) spare.push(parts.pop());
    setScale();
  }

  function lowerQuality() {
    if (!gfx.auto) return false;
    const now = Math.min(QUALITY[qi], dpr());
    const last = Math.min(gfx.lowest, QUALITY.length - 1);
    let next = qi + 1;
    while (next <= last && Math.min(QUALITY[next], dpr()) >= now) next += 1;
    if (next > last) return false;
    qi = next;
    while (parts.length > partCap()) spare.push(parts.pop());
    setScale();
    return true;
  }

  function destroy() {
    reset();
    art.clear();
    bg = null;
    vig = null;
    dark = null;
    lights.length = 0;
  }

  void probe;

  return {
    resize, enterRoom, refreshProps, onEvent, frame, toWorld, toScreen, lowerQuality, setGraphics, reset, destroy, warm,
    /** Как рисуется хозяин сейчас (прозрачность, масштаб, тень, нить) — для проверки; копия. */
    bossLook: (m, calm = false) => ({ ...look(m, calm) }),
    get quality() { return qi; },
    /** Часы дрейфа тумана (для проверки): при calm стоят. */
    get fogTime() { return fogT; },
    /** Ночь (для проверки): размер слоя темноты, во сколько раз он меньше холста, плитки (сколько из них со светом),
     * сколько пятен вырезано и отсветов нарисовано в прошлом кадре, светящихся вещей в комнате, часы мерцания. */
    get nightInfo() {
      if (!dark) return null;
      let lit = 0;
      for (let i = 0; i < dark.cols * dark.rows; i++) lit += dark.lit[i];
      return {
        w: dark.w, h: dark.h, d: dark.d, tile: DARK_TILE * dark.d, cols: dark.cols, rows: dark.rows, lit,
        cuts, glows, lights: lights.length, t: nightT, layer: dark.c,
      };
    },
    get graphics() { return GRAPHICS.indexOf(gfx); },
    /** Что нарисовано в прошлом кадре: предметы, плитки и заливки земли за краем комнаты, тени; копия. */
    get frameInfo() { return { ...drawn, parts: parts.length }; },
    /** Рисовать через кадр на быстром экране (низкая «Графика», createPacer). */
    get half() { return gfx.half; },
    get scale() { return scale; },
    get view() { return view; },
  };
}
