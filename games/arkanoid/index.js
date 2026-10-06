// Арканоид: платформой отбиваешь шарик и разбиваешь кирпичи. 300 уровней в десяти главах (у главы свой фон и
// свой вид кирпичей), 15 бонусов (три и восемь шариков, огненный шар, пробойник, ловушка, лазер, ракеты, широкая
// и узкая платформа, бомба…), запас — три шарика на уровень.
// Управление: води пальцем по полю или по полосе под ним — платформа едет за пальцем; отпустил — шарик запущен.
// С клавиатуры — стрелки и пробел. Поле рисуется на Canvas: фон и кирпичи — заранее нарисованными слоями (слой
// кирпичей перерисовывается, только когда кирпич задет), шарики, бонусы и платформа — готовыми картинками каждый
// кадр. Сами картинки рисует art.js. Партия, статистика и звук — в api.storage.

import { el } from '../../shared/dom.js';
import { animate, showLayer, hideLayer, shake, pop, reducedMotion } from '../../shared/motion.js';
import { createToast } from '../../shared/toast.js';
import { createFx } from '../../shared/fx.js';
import { createAudio } from '../../shared/sfx.js';
import { pointsInfo } from '../../shared/points-info.js';
import { createSounds } from './sounds.js';
import {
  W, H, BRICK_W, BRICK_H, LEVEL_COUNT, CHAPTER_SIZE, CHAPTERS, TONES, PADDLE_Y, PADDLE_H, BALL_R, DROP_R, WEAR,
  MAX_LIVES, BONUSES, BAD_BONUSES, FIRE_TIME, RAIL_TIME, CATCH_TIME, LASER_TIME, MISSILES, polygon, newGame, step,
  launch, movePaddle, applyBonus, progress, snapshot, restore, isValidState, savedLevel, emptyStats, isValidStats,
  botTarget, ballRadius, paddleW,
} from './logic.js';
import {
  SKINS, TAU, AMBIENT, BONUS_LABELS, shade, alpha, rnd, path, star, paintBrick, paintBonus, bonusGlyph, paintBall,
  paintPaddle, paintBackdrop,
} from './art.js';

const T = {
  title: 'Арканоид',
  level: (n) => `Уровень ${n}`,
  chapters: ['Космос', 'Океан', 'Джунгли', 'Пустыня', 'Льды', 'Вулкан', 'Неон', 'Карамель', 'Завод', 'Кристаллы'],
  chapter: (i) => `Глава ${i + 1} · ${T.chapters[i]}`,
  launchTouch: 'Коснись, чтобы запустить шарик',
  launchHeld: 'Отпусти палец — шарик полетит',
  launchMouse: 'Нажми, чтобы запустить шарик',
  strip: 'Води пальцем здесь',
  help: 'Води пальцем по полю или по полосе под ним — платформа едет за пальцем',
  wonTitle: 'Отлично!',
  completed: (n) => `Уровень ${n} пройден`,
  chapterDone: (i) => `Глава «${T.chapters[i]}» пройдена!`,
  wonInfo: (time, lives) => `Время: ${time} · Шариков в запасе: ${lives}`,
  next: (n) => `Уровень ${n}`,
  nextChapter: (i) => `Дальше — «${T.chapters[i]}»`,
  allDone: 'Все уровни пройдены!',
  allDoneNote: 'Можно переиграть любой уровень.',
  chooseLevel: 'Выбрать уровень',
  loseTitle: 'Шарики кончились',
  loseMessage: (n) => `Уровень ${n} — попробуй ещё раз`,
  restart: 'Заново',
  restartQuestion: 'Начать этот уровень заново?',
  cancelBtn: 'Отмена',
  newLevel: 'Начать уровень заново',
  levels: 'Уровни',
  levelsTitle: 'Выбор уровня',
  levelsNote: 'Открыты пройденные уровни и следующий. Текущая попытка сбросится.',
  passed: (n, of) => `${n} из ${of}`,
  lives: (n) => `Шариков в запасе: ${n}`,
  stats: {
    open: 'Статистика', title: 'Статистика', level: 'Уровень', cleared: 'Пройдено уровней', bestLevel: 'Лучший уровень',
    bricks: 'Разбито кирпичей', bonuses: 'Поймано бонусов', fails: 'Неудач', close: 'Закрыть',
  },
  info: {
    open: 'Справка', title: 'Как играть', bonuses: 'Бонусы', bricks: 'Кирпичи',
    rules: 'Разбей все кирпичи шариком и не дай ему упасть. На уровень — три шарика. Платформу ведёт палец, отпустил — шарик запущен. Чем ближе к краю платформы попал шарик, тем положе он отлетит.',
    brickList: [
      ['n', 'Обычный — один удар. В каждой главе выглядит по-своему.'],
      ['h', 'Крепкий — три удара, точки показывают, сколько осталось.'],
      ['p', 'С бонусом — из него выпадает бонус, лови платформой.'],
      ['e', 'Взрывной — сносит соседей, цепочкой.'],
      ['x', 'Стальной — разбивать не обязательно; ломается взрывом, огнём, ракетой или после десяти ударов.'],
      ['t', 'Запертый шарик — задень его и поймай: будет ещё один.'],
    ],
    stuck: 'Если двадцать секунд ничего не разбито, сверху падает сильный бонус.',
  },
  bonus: {
    split3: ['Три шарика', 'Каждый шарик делится на три.'],
    split8: ['Восемь шариков', 'Каждый шарик разлетается на восемь.'],
    fast: ['Быстрее', 'Шарики летят быстрее.'],
    slow: ['Медленнее', 'Шарики летят медленнее.'],
    fire: ['Огненный шар', `${FIRE_TIME} секунд шарик сносит кирпич и соседние, даже стальные.`],
    rail: ['Пробойник', `${RAIL_TIME} секунд шарик прошивает всё насквозь.`],
    small: ['Мелкий шарик', 'Шарик меньше — попасть труднее.'],
    normal: ['Обычный шарик', 'Шарик снова обычный: размер, скорость, без огня.'],
    catch: ['Ловушка', `${CATCH_TIME} секунд платформа ловит шарик. Отпусти палец — запуск.`],
    laser: ['Лазер', `${LASER_TIME} секунд платформа стреляет сама.`],
    missile: ['Ракеты', `${MISSILES} ракет: взрывают всё вокруг.`],
    expand: ['Шире', 'Платформа шире.'],
    shrink: ['Уже', 'Платформа уже.'],
    bomb: ['Бомба', 'Не лови — взорвёт платформу. Можно сбить шариком.'],
    life: ['Запасной шарик', `Плюс шарик в запас (не больше ${MAX_LIVES}).`],
  },
};

const svgIcon = (body, fill = false) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" `
  + (fill ? 'fill="currentColor">' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">')
  + `${body}</svg>`;
const ICONS = {
  restart: svgIcon('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>'),
  soundOn: svgIcon('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>'),
  soundOff: svgIcon('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 5 6"/><path d="m21 9-5 6"/>'),
  stats: svgIcon('<rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="7" width="4" height="14" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/>', true),
  levels: svgIcon('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'),
  info: svgIcon('<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 1 1 3.6 2.3c-.8.5-1.2 1-1.2 1.9"/><path d="M12 17h.01"/>'),
};

const PAD = 4;                       // поля картинки кирпича (свечение неона выходит за контур), в единицах поля
const PADDLE_PAD = 10;               // поля картинки платформы
const VARIED = new Set(['wood', 'stone', 'magma']);     // у этих видов узор на кирпичах не одинаковый — три варианта
const STRIP_MIN = 64;                // полоса для пальца под полем — не ниже (CSS: .ak-strip min-height)

let api = null;
let host = null;
let root = null;
let ui = null;
let toast = null;
let fx = null;
let game = null;
let pending = null;                  // что сохранять вместо показанного уровня (после победы и проигрыша)
let stats = emptyStats();
let phase = 'play';                  // play | won | lost
let raf = 0;
let rafAt = 0;
let lastFrame = 0;
let scale = 1;                       // CSS-пикселей на единицу поля
let dprNow = 1;
let palette = null;
let brickLayer = null;               // слой кирпичей: перерисовывается, когда кирпич задет
let bricksDirty = true;
let gifts = [];                      // живые кирпичи с бонусом — на них мерцает звёздочка
let bgCache = null;
const sprites = new Map();           // картинки кирпичей, шариков, бонусов и платформы
const flashes = new Map();           // id кирпича → время удара
let ghosts = [];                     // только что разбитые кирпичи: светлый силуэт тает
let rings = [];                      // взрывы: { x, y, r, t }
let popups = [];                     // всплывающие подписи: { text, x, y, t, color }
let ambient = [];                    // живые мелочи главы: звёзды, пузыри, снег…
let intro = 0;                       // время начала появления уровня
let shownW = 0;                      // ширина платформы на экране — догоняет настоящую плавно
let dieAt = 0;                       // когда потерян шарик (платформа мигает)
let lastShake = 0;
let modalActive = false;
let modalToken = 0;
let soundOn = true;
const soundAt = {};
let lastHaptic = 0;
let burstsThisFrame = 0;
let canvasOffset = null;
let pointer = null;                  // id касания, которое ведёт платформу
let touchUsed = false;
let stripUsed = false;
const keys = new Set();
let saveDirty = false;
let saveTimer = 0;
let bot = false;                     // отладка: играет бот
let lastLives = -1;
let lastProgress = -1;
const timers = new Set();
const audio = createAudio(createSounds);

function later(fn, ms) {
  const id = setTimeout(() => {
    timers.delete(id);
    fn();
  }, ms);
  timers.add(id);
  return id;
}

/** gap — не чаще раза в gap мс (ударов за кадр бывают десятки — иначе треск). */
function sfx(name, opts, gap = 0) {
  if (!soundOn) return;
  const t = performance.now();
  if (gap && t - (soundAt[name] ?? -Infinity) < gap) return;
  soundAt[name] = t;
  try {
    audio.get()?.play(name, opts);
  } catch (err) {
    console.warn('звук', name, err);
  }
}

function renderSoundBtn() {
  if (!ui?.soundBtn) return;
  ui.soundBtn.innerHTML = soundOn ? ICONS.soundOn : ICONS.soundOff;
  const label = soundOn ? 'Выключить звук' : 'Включить звук';
  ui.soundBtn.setAttribute('aria-label', label);
  ui.soundBtn.title = label;
  ui.soundBtn.classList.toggle('ak-muted', !soundOn);
}

function toggleSound() {
  soundOn = !soundOn;
  api.storage.set('sound', soundOn);
  renderSoundBtn();
  sfx('click');
}

// В меню показывается уровень, а не число партий.
function save() {
  const state = pending ?? (game ? snapshot(game) : null);
  if (!state || !api) return undefined;
  saveDirty = false;
  api.progress(T.level(state.level));
  return api.storage.set('current', state);
}

// ---------- цвета ----------

function readPalette() {
  // цвет через проверочный элемент: Canvas не понимает var() и color-mix(), а computed color — всегда rgb()
  const probe = el('span', { hidden: true });
  host.append(probe);
  const v = (name) => {
    probe.style.color = `var(${name})`;
    return getComputedStyle(probe).color;
  };
  palette = {
    chapters: Array.from({ length: CHAPTERS }, (_, i) => ({
      bg: v(`--ak-c${i}-bg`), bg2: v(`--ak-c${i}-bg2`), mist: v(`--ak-c${i}-mist`), ink: v(`--ak-c${i}-ink`),
      glow: v(`--ak-c${i}-glow`), hard: v(`--ak-c${i}-hard`),
      tones: Array.from({ length: TONES }, (__, t) => v(`--ak-c${i}-t${t}`)),
    })),
    steel: v('--ak-steel'), boom: v('--ak-boom'), gift: v('--ak-gift'), gift2: v('--ak-gift2'), gift3: v('--ak-gift3'),
    ball: v('--ak-ball'), fire: v('--ak-fire'), rail: v('--ak-rail'), paddle: v('--ak-paddle'), text: v('--ak-field-text'),
    bonus: Object.fromEntries(BONUSES.map((id) => [id, v(`--ak-b-${id}`)])),
  };
  probe.remove();
}

const chapterPal = () => palette.chapters[game.chapter];
const brickColor = (kind, tone) => (kind === 'n' ? chapterPal().tones[tone] : kind === 'h' ? chapterPal().hard
  : kind === 'x' ? palette.steel : kind === 'e' ? palette.boom : kind === 'p' ? palette.gift : palette.ball);

// ---------- картинки ----------

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.ceil(w));
  c.height = Math.max(2, Math.ceil(h));
  return c;
}

/**
 * Картинка кирпича (рисуется один раз на главу, вид, оттенок, форму и состояние) — рамка 32 × 18 с полями PAD.
 * state — оставшаяся прочность (у крепкого — 1…3, у стального — доля). s — пикселей холста на единицу поля
 * (у образцов в справке — свой, с другим prefix).
 */
function brickSprite(chapter, b, state, s = scale * dprNow, prefix = 'b') {
  const skin = SKINS[chapter];
  const variant = VARIED.has(skin) && (b.kind === 'n' || b.kind === 'h') ? b.id % 3 : 0;
  const key = `${prefix}|${chapter}|${b.kind}|${b.tone}|${b.shape}|${state}|${variant}`;
  let img = sprites.get(key);
  if (img) return img;
  img = makeCanvas((BRICK_W + PAD * 2) * s, (BRICK_H + PAD * 2) * s);
  const c = img.getContext('2d');
  c.setTransform(s, 0, 0, s, PAD * s, PAD * s);
  // контур чуть меньше рамки — между кирпичами остаётся зазор
  const kx = (BRICK_W - 1.4) / BRICK_W;
  const ky = (BRICK_H - 1.4) / BRICK_H;
  const pts = polygon(b.shape, 0, 0).map(([x, y]) => [BRICK_W / 2 + (x - BRICK_W / 2) * kx, BRICK_H / 2 + (y - BRICK_H / 2) * ky]);
  const pal = palette.chapters[chapter];
  paintBrick(c, {
    skin, kind: b.kind, shape: b.shape, pts, color: b.kind === 'h' ? pal.hard : pal.tones[b.tone], state, pal: palette,
    px: s, seed: b.tone * 10 + variant + 1,
  });
  sprites.set(key, img);
  return img;
}

const brickState = (b) => (b.kind === 'h' ? b.hp : b.kind === 'x' ? Math.ceil((b.hp / WEAR) * 3) / 3 : 0);

function drawBrick(c, b, chapter) {
  const img = brickSprite(chapter, b, brickState(b));
  const w = BRICK_W + PAD * 2;
  const h = BRICK_H + PAD * 2;
  if (!b.rot && b.scale === 1) {
    c.drawImage(img, b.x - PAD, b.y - PAD, w, h);
    return;
  }
  c.save();
  c.translate(b.cx, b.cy);
  c.rotate((b.rot * Math.PI) / 180);
  c.scale(b.scale, b.scale);
  c.drawImage(img, -w / 2, -h / 2, w, h);
  c.restore();
}

/** Шарик с ореолом: готовая картинка на цвет; ореол — 2.1 радиуса. */
function ballSprite(color) {
  const key = `ball|${color}`;
  let img = sprites.get(key);
  if (img) return img;
  const r = BALL_R * scale * dprNow;
  img = makeCanvas(r * 4.2 + 2, r * 4.2 + 2);
  const c = img.getContext('2d');
  c.translate(img.width / 2, img.height / 2);
  paintBall(c, r, color);
  sprites.set(key, img);
  return img;
}

/** Падающий бонус: готовая картинка радиуса px пикселей холста (со свечением вокруг — холст шире в 3,2 раза). */
function bonusSprite(type, px = DROP_R * 0.94 * scale * dprNow, key = `drop|${type}`) {
  let img = sprites.get(key);
  if (img) return img;
  img = makeCanvas(px * 3.2, px * 3.2);
  const c = img.getContext('2d');
  c.translate(img.width / 2, img.height / 2);
  paintBonus(c, type, px, palette, 1);
  sprites.set(key, img);
  return img;
}

function platformSprite(w, mode) {
  const key = `pad|${w}|${mode}|${game.chapter}`;
  let img = sprites.get(key);
  if (img) return img;
  const s = scale * dprNow;
  img = makeCanvas((w + PADDLE_PAD * 2) * s, (PADDLE_H + PADDLE_PAD * 2) * s);
  const c = img.getContext('2d');
  c.setTransform(s, 0, 0, s, PADDLE_PAD * s, PADDLE_PAD * s);
  paintPaddle(c, w, PADDLE_H, { paddle: palette.paddle, glow: chapterPal().glow, good: palette.bonus.catch, px: s, mode });
  sprites.set(key, img);
  return img;
}

function copyCanvas(src, cssW, cssH, className) {
  const canvas = el('canvas', { class: className });
  canvas.width = src.width;
  canvas.height = src.height;
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  canvas.getContext('2d').drawImage(src, 0, 0);
  return canvas;
}

/** Значок бонуса для справки — отдельный холст нужного размера. */
function bonusIcon(type, size = 40) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const src = bonusSprite(type, (size / 3.2) * dpr, `icon|${type}|${size}`);
  return copyCanvas(src, size, size, 'ak-bonus-icon');
}

/** Образец кирпича для справки — в виде текущей главы. */
function brickIcon(kind) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const b = { id: 0, kind, tone: 0, shape: kind === 't' ? 'C' : 'R' };
  const src = brickSprite(game.chapter, b, kind === 'h' ? 3 : kind === 'x' ? 1 : 0, 1.3 * dpr, 'icon');
  return copyCanvas(src, (BRICK_W + PAD * 2) * 1.3, (BRICK_H + PAD * 2) * 1.3, 'ak-brick-icon');
}

/** Фон поля под главу и уровень — рисуется заранее. */
function background() {
  if (bgCache) return bgCache;
  bgCache = makeCanvas(ui.canvas.width, ui.canvas.height);
  const c = bgCache.getContext('2d');
  const s = scale * dprNow;
  c.setTransform(s, 0, 0, s, 0, 0);
  paintBackdrop(c, game.chapter, chapterPal(), game.level, W, H, PADDLE_Y + PADDLE_H + 12);
  return bgCache;
}

function redrawBricks() {
  if (!brickLayer || brickLayer.width !== ui.canvas.width || brickLayer.height !== ui.canvas.height) {
    brickLayer = makeCanvas(ui.canvas.width, ui.canvas.height);
  }
  const c = brickLayer.getContext('2d');
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, brickLayer.width, brickLayer.height);
  const s = scale * dprNow;
  c.setTransform(s, 0, 0, s, 0, 0);
  gifts = [];
  for (const b of game.bricks) {
    if (b.hp <= 0) continue;
    drawBrick(c, b, game.chapter);
    if (b.kind === 'p') gifts.push(b);
  }
  bricksDirty = false;
}

function makeAmbient() {
  const cfg = AMBIENT[game.chapter];
  const r = rnd(game.level * 131 + 9);
  ambient = reducedMotion() ? [] : Array.from({ length: cfg.n }, (_, i) => ({
    x: r() * W, y: r() * H, s: cfg.size[0] + r() * (cfg.size[1] - cfg.size[0]), ph: r() * TAU, k: r(), i,
  }));
}

// ---------- отрисовка ----------

function resize() {
  const box = ui.stage.getBoundingClientRect();
  if (!box.width || !box.height) return;
  // мышью полоса не нужна — поле занимает всю высоту
  const strip = getComputedStyle(ui.strip).opacity === '0' ? 0 : STRIP_MIN + 6;
  scale = Math.max(0.2, Math.min(box.width / W, (box.height - strip) / H, 1.6));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  dprNow = dpr;
  sprites.clear();
  bgCache = null;
  bricksDirty = true;
  ui.canvas.style.width = `${W * scale}px`;
  ui.canvas.style.height = `${H * scale}px`;
  ui.canvas.width = Math.round(W * scale * dpr);
  ui.canvas.height = Math.round(H * scale * dpr);
  ui.strip.style.width = `${W * scale}px`;
  draw(performance.now(), 0);
}

/**
 * Текст — в пикселях, а не в единицах поля: Safari не рисует шрифт меньше ~1px, даже если холст увеличен масштабом.
 * x, y — в единицах поля, size — в CSS-пикселях.
 */
function text(c, str, x, y, size, color, { align = 'center', weight = 800, a = 1, spacing = 0 } = {}) {
  c.save();
  c.setTransform(dprNow, 0, 0, dprNow, 0, 0);
  c.font = `${weight} ${Math.round(size)}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  if (spacing && 'letterSpacing' in c) c.letterSpacing = `${spacing}px`;
  c.textAlign = align;
  c.textBaseline = 'middle';
  c.globalAlpha = a * 0.55;
  c.fillStyle = '#000000';
  c.fillText(str, x * scale, y * scale + 1.2);
  c.globalAlpha = a;
  c.fillStyle = color;
  c.fillText(str, x * scale, y * scale);
  c.restore();
}

function drawAmbient(c, now, dt) {
  if (!ambient.length) return;
  const cfg = AMBIENT[game.chapter];
  const pal = chapterPal();
  const base = cfg.color === 'white' ? 'rgb(255, 255, 255)' : cfg.color === 'tones' ? null : pal[cfg.color];
  for (const p of ambient) {
    let a = 0.55;
    if (cfg.kind === 'twinkle') a = 0.12 + 0.8 * (0.5 + 0.5 * Math.sin((now / 520) * (0.6 + p.k) + p.ph));
    else if (cfg.kind === 'rise') {
      p.y -= cfg.speed * (0.5 + p.k) * dt;
      p.x += Math.sin(now / 700 + p.ph) * 8 * dt;
      if (p.y < -8) p.y = H + 8;
    } else if (cfg.kind === 'fall') {
      p.y += cfg.speed * (0.5 + p.k) * dt;
      p.x += Math.sin(now / 900 + p.ph) * 10 * dt;
      if (p.y > H + 8) p.y = -8;
    } else {
      p.x += cfg.speed * (0.4 + p.k) * dt;
      p.y += Math.sin(now / 800 + p.ph) * 9 * dt;
      if (p.x > W + 8) p.x = -8;
      a = 0.3 + 0.5 * (0.5 + 0.5 * Math.sin(now / 600 + p.ph));
    }
    c.globalAlpha = a;
    if (cfg.ring) {
      c.strokeStyle = base;
      c.lineWidth = 1;
      c.beginPath();
      c.arc(p.x, p.y, p.s, 0, TAU);
      c.stroke();
    } else {
      c.fillStyle = base ?? pal.tones[p.i % TONES];
      c.beginPath();
      c.arc(p.x, p.y, p.s, 0, TAU);
      c.fill();
    }
  }
  c.globalAlpha = 1;
}

function drawPaddle(c, now) {
  const w = shownW || paddleW(game);
  const fxs = game.fx;
  const mode = fxs.laser > 0 ? 'laser' : fxs.missile > 0 ? 'missile' : fxs.catch > 0 ? 'catch' : '';
  // картинка — на ширину, кратную четырём; пока платформа растёт или сжимается, она растягивается
  const img = platformSprite(Math.round(paddleW(game) / 4) * 4, mode);
  // мигает после потери шарика
  if (now - dieAt < 900) c.globalAlpha = 0.45 + 0.55 * Math.abs(Math.sin((now - dieAt) / 75));
  c.drawImage(img, game.paddle.x - w / 2 - PADDLE_PAD, PADDLE_Y - PADDLE_PAD, w + PADDLE_PAD * 2, PADDLE_H + PADDLE_PAD * 2);
  c.globalAlpha = 1;
}

function drawBalls(c, now) {
  const r = ballRadius(game);
  const fire = game.fx.fire > 0;
  const rail = game.fx.rail > 0;
  const color = fire ? palette.fire : rail ? palette.rail : palette.ball;
  const img = ballSprite(color);
  const size = r * 4.2;
  for (const b of game.balls) {
    if (b.stuck === null) {
      // след по ходу полёта
      const n = fire || rail ? 6 : 3;
      const gap = r * (rail ? 1.7 : fire ? 1.25 : 1.05);
      c.fillStyle = color;
      for (let k = n; k >= 1; k--) {
        c.globalAlpha = (rail ? 0.36 : fire ? 0.3 : 0.2) * (1 - k / (n + 1));
        c.beginPath();
        c.arc(b.x - b.dx * k * gap, b.y - b.dy * k * gap, r * (1 - k * 0.11), 0, TAU);
        c.fill();
      }
      c.globalAlpha = 1;
    }
    const pulse = b.stuck !== null && !reducedMotion() ? 1 + 0.08 * Math.sin(now / 160) : 1;
    c.drawImage(img, b.x - (size * pulse) / 2, b.y - (size * pulse) / 2, size * pulse, size * pulse);
  }
}

function drawChips(c) {
  // сколько осталось у временных бонусов: значок и дуга под платформой (ниже неё — 34 единицы поля)
  const list = [['fire', game.fx.fire / FIRE_TIME], ['rail', game.fx.rail / RAIL_TIME], ['catch', game.fx.catch / CATCH_TIME],
    ['laser', game.fx.laser / LASER_TIME], ['missile', game.fx.missile / MISSILES]].filter((x) => x[1] > 0);
  if (!list.length) return;
  const y = H - 17;
  c.save();
  list.forEach(([type, part], i) => {
    const x = 20 + i * 36;
    c.globalAlpha = 0.92;
    c.fillStyle = 'rgba(0, 0, 0, 0.5)';
    c.beginPath();
    c.arc(x, y, 15, 0, TAU);
    c.fill();
    c.strokeStyle = palette.bonus[type];
    c.lineWidth = 3.2;
    c.beginPath();
    c.arc(x, y, 13.4, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, part));
    c.stroke();
    c.translate(x, y);
    bonusGlyph(c, type, 9);
    c.translate(-x, -y);
  });
  c.restore();
}

function draw(now, dt) {
  const c = ui.ctx;
  if (!game || !palette) return;
  const s = scale * dprNow;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.drawImage(background(), 0, 0);
  c.setTransform(s, 0, 0, s, 0, 0);
  drawAmbient(c, now, dt);
  if (bricksDirty) redrawBricks();
  // появление уровня: кирпичи проявляются и съезжают сверху
  const k = intro ? Math.min(1, (now - intro) / 520) : 1;
  const ease = 1 - (1 - k) ** 3;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = ease;
  c.drawImage(brickLayer, 0, Math.round(-(1 - ease) * 34 * dprNow));
  c.globalAlpha = 1;
  c.setTransform(s, 0, 0, s, 0, 0);

  // на кирпичах с бонусом мерцает искра
  if (k >= 1 && !reducedMotion()) {
    c.fillStyle = '#ffffff';
    for (const b of gifts) {
      if (b.hp <= 0) continue;
      const a = 0.5 + 0.5 * Math.sin(now / 260 + b.id * 1.7);
      c.globalAlpha = a * 0.9;
      star(c, b.cx + 9 * Math.cos(now / 900 + b.id), b.cy - 3 + 2 * Math.sin(now / 700 + b.id), 1.6 + 1.6 * a, 4, 0.3);
      c.fill();
    }
    c.globalAlpha = 1;
  }

  // вспышки ударов и тающие силуэты разбитых кирпичей
  for (const [id, t] of flashes) {
    const a = 1 - (now - t) / 170;
    if (a <= 0) {
      flashes.delete(id);
      continue;
    }
    const b = game.bricks[id];
    if (b.hp <= 0) continue;
    path(c, b.pts);
    c.fillStyle = `rgba(255, 255, 255, ${0.6 * a})`;
    c.fill();
  }
  if (ghosts.length) {
    ghosts = ghosts.filter((g) => now - g.t < 160);
    for (const g of ghosts) {
      const p = (now - g.t) / 160;
      c.globalAlpha = 0.7 * (1 - p);
      c.fillStyle = g.color;
      c.save();
      c.translate(g.cx, g.cy);
      c.scale(1 + p * 0.35, 1 + p * 0.35);
      c.translate(-g.cx, -g.cy);
      path(c, g.pts);
      c.fill();
      c.restore();
    }
    c.globalAlpha = 1;
  }

  // взрывы: вспышка и расходящееся кольцо
  rings = rings.filter((e) => now - e.t < 340);
  for (const e of rings) {
    const p = (now - e.t) / 340;
    c.fillStyle = '#fff3c4';
    c.globalAlpha = 0.6 * (1 - p) * (1 - p);
    c.beginPath();
    c.arc(e.x, e.y, e.r * (0.35 + p * 0.5), 0, TAU);
    c.fill();
    c.globalAlpha = 1 - p;
    c.strokeStyle = e.color ?? '#ffd36b';
    c.lineWidth = 6 * (1 - p) + 1;
    c.beginPath();
    c.arc(e.x, e.y, 6 + (e.r - 4) * (1 - (1 - p) * (1 - p)), 0, TAU);
    c.stroke();
  }
  c.globalAlpha = 1;

  // выстрелы
  for (const sh of game.shots) {
    if (sh.kind === 'laser') {
      c.fillStyle = alpha(palette.bonus.laser, 0.55);
      c.fillRect(sh.x - 3.4, sh.y - 12, 6.8, 16);
      c.fillStyle = '#ffffff';
      c.fillRect(sh.x - 1.6, sh.y - 14, 3.2, 18);
    } else {
      c.fillStyle = palette.fire;
      c.fillRect(sh.x - 2.4, sh.y + 6, 4.8, 10);
      c.fillStyle = '#ffffff';
      path(c, [[sh.x, sh.y - 10], [sh.x + 4.2, sh.y - 2], [sh.x + 4.2, sh.y + 7], [sh.x - 4.2, sh.y + 7], [sh.x - 4.2, sh.y - 2]]);
      c.fill();
    }
  }

  // падающие бонусы (с подписью) и освобождённые шарики
  for (const p of game.drops) {
    const img = bonusSprite(p.type);
    const d = DROP_R * 0.94 * 3.2 * (reducedMotion() ? 1 : 1 + 0.05 * Math.sin(now / 130 + p.id));
    c.drawImage(img, p.x - d / 2, p.y - d / 2, d, d);
    text(c, BONUS_LABELS[p.type], Math.max(40, Math.min(W - 40, p.x)), p.y + DROP_R + 12, 10.5,
      BAD_BONUSES.includes(p.type) ? '#ffc2bd' : '#ffffff', { weight: 800 });
  }
  if (game.loose.length) {
    const img = ballSprite(palette.ball);
    const d = BALL_R * 4.2;
    c.globalAlpha = 0.6 + (reducedMotion() ? 0 : 0.3 * Math.sin(now / 90));
    for (const p of game.loose) c.drawImage(img, p.x - d / 2, p.y - d / 2, d, d);
    c.globalAlpha = 1;
  }

  drawPaddle(c, now);
  drawBalls(c, now);

  // подписи: пойманный бонус, название уровня
  popups = popups.filter((p) => now - p.t < p.life);
  for (const p of popups) {
    const q = (now - p.t) / p.life;
    const a = q < 0.15 ? q / 0.15 : q > 0.7 ? (1 - q) / 0.3 : 1;
    text(c, p.text, p.x, p.y - q * p.rise, p.size, p.color, { a, spacing: p.spacing });
  }
  // подсказка запуска
  if (game.status === 'ready' && phase === 'play' && !modalActive && now - intro > 1900 && now - dieAt > 700) {
    text(c, pointer !== null && touchUsed ? T.launchHeld : touchUsed ? T.launchTouch : T.launchMouse, W / 2, PADDLE_Y - 64, 14, palette.text, { weight: 600, a: 0.85 });
  }
  drawChips(c);
}

// ---------- цикл ----------

const paused = () => modalActive || phase !== 'play' || document.hidden;

function loop(now) {
  raf = 0;
  if (!ui || !game) return;
  // метка rAF бывает раньше performance.now() — время кадра не отрицательное
  const dt = Math.min(1 / 30, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  if (!paused()) {
    if (bot) {
      movePaddle(game, game.paddle.x + Math.max(-40, Math.min(40, botTarget(game) - game.paddle.x)));
      if (game.balls.some((b) => b.stuck !== null)) launch(game);
    } else if (keys.has('ArrowLeft') !== keys.has('ArrowRight')) {
      movePaddle(game, game.paddle.x + (keys.has('ArrowLeft') ? -1 : 1) * 760 * dt);
    }
    step(game, dt);
    handleEvents(now);
  }
  // ширина платформы догоняет настоящую
  const target = paddleW(game);
  shownW = shownW ? shownW + (target - shownW) * Math.min(1, dt * 14) : target;
  if (reducedMotion() || Math.abs(shownW - target) < 0.5) shownW = target;
  draw(now, dt);
  rafAt = now;
  raf = requestAnimationFrame(loop);
}

/** Запустить цикл кадров. Если заказанный кадр не пришёл за 250 мс (браузер придержал), заказываем заново. */
function kick() {
  if (!ui) return;
  const now = performance.now();
  if (raf && now - rafAt < 250) return;
  cancelAnimationFrame(raf);
  lastFrame = now;
  rafAt = now;
  raf = requestAnimationFrame(loop);
}

function burstAt(x, y, color, count = 5) {
  // взрыв может снести десяток кирпичей за кадр — осколки не больше чем от шести
  if (++burstsThisFrame > 6) return;
  if (!canvasOffset) {
    const cr = ui.canvas.getBoundingClientRect();
    const rr = root.getBoundingClientRect();
    canvasOffset = [cr.left - rr.left, cr.top - rr.top];
  }
  fx?.burst(canvasOffset[0] + x * scale, canvasOffset[1] + y * scale, color, count, { speed: 170, size: 4.5 });
}

function popup(str, x, y, color = '#ffffff', { size = 14, life = 1000, rise = 34, spacing = 0 } = {}) {
  const now = performance.now();
  // несколько бонусов подряд — подписи столбиком, а не друг на друге
  const fresh = popups.filter((p) => now - p.t < 500 && p.size === size).length;
  popups.push({ text: str, x: Math.max(70, Math.min(W - 70, x)), y: y - fresh * 30, color, size, life, rise, spacing, t: now });
}

function handleEvents(now) {
  if (!game.events.length) return;
  burstsThisFrame = 0;
  canvasOffset = null;
  for (const e of game.events) {
    if (e.type === 'hit') {
      flashes.set(e.id, now);
      bricksDirty = true;
      sfx(e.kind === 'x' ? 'metal' : 'hit', null, 45);
    } else if (e.type === 'break') {
      flashes.delete(e.id);
      bricksDirty = true;
      saveDirty = true;
      stats.bricks += 1;
      sfx('break', { step: e.tone }, 50);
      const color = brickColor(e.kind, e.tone);
      const b = game.bricks[e.id];
      if (ghosts.length < 40 && !reducedMotion()) ghosts.push({ pts: b.pts, cx: b.cx, cy: b.cy, color: shade(color, 0.6), t: now });
      burstAt(e.x, e.y, color);
      if (now - lastHaptic > 70) {
        api.platform.haptic.impact('light');
        lastHaptic = now;
      }
    } else if (e.type === 'explode') {
      rings.push({ x: e.x, y: e.y, r: e.r, t: now });
      sfx('explode', null, 70);
      if (!reducedMotion() && now - lastShake > 260) {
        lastShake = now;
        shake(ui.canvas, { distance: 3, duration: 180 });
      }
    } else if (e.type === 'paddle') sfx('paddle', null, 40);
    else if (e.type === 'wall') sfx('wall', null, 60);
    else if (e.type === 'launch') sfx('launch');
    else if (e.type === 'catch') sfx('paddle', null, 40);
    else if (e.type === 'shot') sfx(e.kind, null, e.kind === 'laser' ? 140 : 0);
    else if (e.type === 'spark') sfx('metal', null, 90);
    else if (e.type === 'free') sfx('free', null, 80);
    else if (e.type === 'gain') {
      sfx('gain', null, 60);
      popup('+1', game.paddle.x, PADDLE_Y - 18, palette.ball);
    } else if (e.type === 'defuse') {
      rings.push({ x: e.x, y: e.y, r: 30, t: now });
      sfx('explode', null, 70);
    } else if (e.type === 'help') sfx('drop');
    else if (e.type === 'lost') sfx('lost', null, 120);
    else if (e.type === 'bonus') onBonus(e.bonus, now);
    else if (e.type === 'die') onDie(now);
  }
  const ended = game.events.find((e) => e.type === 'win' || e.type === 'lose');
  game.events.length = 0;
  renderHud();
  if (ended?.type === 'win') won();
  else if (ended?.type === 'lose') lost();
}

function onBonus(type, now) {
  stats.bonuses += 1;
  if (type === 'bomb') return;
  const bad = BAD_BONUSES.includes(type);
  const color = palette.bonus[type];
  sfx(type === 'life' ? 'life' : bad ? 'bad' : 'good');
  // кольцо цвета бонуса от платформы и подпись
  rings.push({ x: game.paddle.x, y: PADDLE_Y, r: 46, t: now, color });
  popup(T.bonus[type][0], game.paddle.x, PADDLE_Y - 24, shade(color, 0.45), { size: 15 });
  api.platform.haptic.impact(bad ? 'medium' : 'light');
}

function onDie(now) {
  dieAt = now;
  saveDirty = true;
  rings.push({ x: game.paddle.x, y: PADDLE_Y + PADDLE_H / 2, r: 60, t: now });
  sfx('die');
  api.platform.haptic.notification('error');
  if (!reducedMotion()) shake(ui.canvas, { distance: 6, duration: 360 });
  save();
}

// ---------- ход игры ----------

function renderHud(force = false) {
  if (!ui || !game) return;
  if (game.lives !== lastLives || force) {
    const grew = game.lives > lastLives && lastLives >= 0;
    lastLives = game.lives;
    ui.lives.replaceChildren(...Array.from({ length: MAX_LIVES }, (_, i) => el('span', { class: i < game.lives ? 'ak-life' : 'ak-life ak-life-off' })));
    ui.lives.setAttribute('aria-label', T.lives(game.lives));
    ui.lives.title = T.lives(game.lives);
    if (grew) pop(ui.lives.children[game.lives - 1], { from: 0.3, duration: 320 });
  }
  const p = progress(game);
  if (p !== lastProgress || force) {
    lastProgress = p;
    ui.fill.style.transform = `scaleX(${p})`;
    const pct = p >= 1 - 1e-9 ? 100 : Math.floor(p * 100);
    const str = `${pct}%`;
    if (ui.percent.textContent !== str) {
      const tens = Math.floor(pct / 10) !== Math.floor((parseInt(ui.percent.textContent, 10) || 0) / 10);
      ui.percent.textContent = str;
      if (tens && pct > 0) pop(ui.percent, { from: 0.7, duration: 260 });
    }
  }
}

function startLevel(animateIn) {
  phase = 'play';
  flashes.clear();
  ghosts = [];
  rings = [];
  popups = [];
  bgCache = null;
  bricksDirty = true;
  // картинки кирпичей и платформы — под главу; при смене главы прежние не нужны
  if (host.dataset.chapter !== String(game.chapter)) sprites.clear();
  host.dataset.chapter = String(game.chapter);
  shownW = 0;
  dieAt = 0;
  lastLives = -1;
  lastProgress = -1;
  ui.sub.textContent = `${T.level(game.level)} · ${T.chapters[game.chapter]}`;
  renderHud(true);
  makeAmbient();
  intro = animateIn && !reducedMotion() ? performance.now() : 0;
  if (animateIn) {
    popup(T.chapter(game.chapter).toUpperCase(), W / 2, 536, chapterPal().glow, { size: 12, life: 1700, rise: 14, spacing: 2 });
    popup(T.level(game.level), W / 2, 572, '#ffffff', { size: 28, life: 1700, rise: 14 });
  }
  kick();
}

function playLevel(n) {
  game = newGame(n);
  pending = null;
  save();
  startLevel(true);
}

const clock = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

function won() {
  phase = 'won';
  stats.cleared += 1;
  stats.bestLevel = Math.max(stats.bestLevel, game.level);
  api.storage.set('stats', stats);
  const done = game;
  const last = done.level >= LEVEL_COUNT;
  const chapterEnd = done.level % CHAPTER_SIZE === 0;
  // следующий уровень сохранён сразу, на экране — пройденный
  pending = snapshot(newGame(last ? done.level : done.level + 1));
  save();
  sfx('win');
  api.platform.haptic.notification('success');
  later(() => {
    if (!ui) return;
    const pal = palette.chapters[done.chapter];
    fx?.confetti([...pal.tones, palette.ball, pal.glow], chapterEnd ? 200 : 130);
    const stars = [0, 1, 2].map(() => el('span', { class: 'ak-won-star' }, '★'));
    const title = el('h2', { class: 'ak-won-title' }, last ? T.allDone : T.wonTitle);
    const cardEl = el('div', { class: 'ak-card ak-won', role: 'dialog', 'aria-label': T.wonTitle },
      el('div', { class: 'ak-won-rays', 'aria-hidden': 'true' }),
      el('div', { class: 'ak-won-stars' }, stars),
      title,
      el('div', { class: 'ak-won-badge' }, chapterEnd ? T.chapterDone(done.chapter) : T.completed(done.level)),
      el('div', { class: 'ak-won-info' }, T.wonInfo(clock(done.time), done.lives)),
      last ? el('div', { class: 'ak-won-info' }, T.allDoneNote) : null,
      el('button', {
        class: 'btn',
        onclick: () => {
          game = restore(pending);
          pending = null;
          if (last) {
            startLevel(false);
            showLevels(true);
            return;
          }
          closeModal();
          startLevel(true);
        },
      }, last ? T.chooseLevel : chapterEnd ? T.nextChapter(done.chapter + 1) : T.next(done.level + 1)),
    );
    openModal(cardEl);
    stars.forEach((s, k) => animate(s, [
      { transform: 'scale(0) rotate(-40deg)', opacity: 0 },
      { transform: 'scale(1.35) rotate(8deg)', opacity: 1, offset: 0.6 },
      { transform: 'none', opacity: 1 },
    ], { duration: 420, delay: 250 + k * 160, easing: 'ease-out', fill: 'backwards' }));
    pop(title, { from: 0.5, duration: 420 });
  }, reducedMotion() ? 0 : 600);
}

function lost() {
  phase = 'lost';
  stats.fails += 1;
  api.storage.set('stats', stats);
  const failed = game.level;
  sfx('lose');
  // «Ещё раз» на экране результата начнёт этот же уровень заново
  pending = snapshot(newGame(failed));
  save();
  later(() => {
    if (!api) return;
    api.finish({ outcome: 'lose', title: T.loseTitle, message: T.loseMessage(failed), locale: 'ru' });
  }, reducedMotion() ? 0 : 900);
}

// ---------- управление ----------

function pointerX(e) {
  const r = ui.canvas.getBoundingClientRect();
  return ((e.clientX - r.left) / r.width) * W;
}

function onDown(e) {
  if (phase !== 'play' || modalActive || bot) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  e.preventDefault();
  pointer = e.pointerId;
  if (e.pointerType !== 'mouse') {
    touchUsed = true;
    if (!stripUsed) {
      stripUsed = true;
      ui.strip.classList.add('ak-strip-used');
    }
  }
  try {
    ui.stage.setPointerCapture(e.pointerId);
  } catch {
    // без захвата — движения всё равно придут
  }
  movePaddle(game, pointerX(e));
  kick();
}

function onMove(e) {
  if (phase !== 'play' || modalActive || bot) return;
  // мышь ведёт платформу и без нажатия, палец — пока прижат
  if (e.pointerType !== 'mouse' && e.pointerId !== pointer) return;
  movePaddle(game, pointerX(e));
}

function onUp(e) {
  if (e.pointerId !== pointer) return;
  pointer = null;
  if (phase !== 'play' || modalActive || bot) return;
  if (launch(game)) api.platform.haptic.impact('light');
}

function onKeydown(e) {
  if (e.key === 'Escape' && modalActive && phase !== 'won') {
    closeModal();
    return;
  }
  if (modalActive || phase !== 'play') return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    keys.add(e.key);
    e.preventDefault();
  } else if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'Enter') {
    if (e.target.closest?.('button')) return;
    e.preventDefault();
    launch(game);
  }
}

function onKeyup(e) {
  keys.delete(e.key);
}

// ---------- окна ----------

function openModal(content) {
  if (!modalActive) sfx('click');
  modalToken++;
  keys.clear();
  ui.modal.replaceChildren(content);
  if (!modalActive) showLayer(ui.modal);
  modalActive = true;
}

function closeModal() {
  if (!modalActive) return;
  modalActive = false;
  const token = ++modalToken;
  lastFrame = performance.now();
  hideLayer(ui.modal, () => token === modalToken).then(() => {
    if (ui && token === modalToken) ui.modal.replaceChildren();
  });
}

function card(title, ...children) {
  return el('div', { class: 'ak-card', role: 'dialog', 'aria-label': title },
    el('div', { class: 'ak-card-head' },
      el('h2', {}, title),
      el('button', { class: 'ak-icon-btn', 'aria-label': T.stats.close, title: T.stats.close, onclick: closeModal }, '✕'),
    ),
    ...children,
  );
}

function showStats() {
  if (phase !== 'play') return;
  const item = (value, label) => el('div', { class: 'ak-stat' }, el('div', { class: 'ak-stat-value' }, value), el('div', { class: 'ak-stat-label' }, label));
  openModal(card(T.stats.title, el('div', { class: 'ak-stats-grid' },
    item(game.level, T.stats.level), item(stats.cleared, T.stats.cleared),
    item(stats.bestLevel, T.stats.bestLevel), item(stats.bricks, T.stats.bricks),
    item(stats.bonuses, T.stats.bonuses), item(stats.fails, T.stats.fails),
  )));
}

function showInfo() {
  if (phase !== 'play') return;
  openModal(card(T.info.title,
    el('p', { class: 'ak-note' }, T.info.rules),
    el('h3', { class: 'ak-section' }, T.info.bonuses),
    el('div', { class: 'ak-bonus-list' }, BONUSES.map((id) => el('div', { class: 'ak-bonus-row' },
      bonusIcon(id),
      el('div', {}, el('b', {}, T.bonus[id][0]), el('span', {}, T.bonus[id][1])),
    ))),
    el('h3', { class: 'ak-section' }, T.info.bricks),
    el('div', { class: 'ak-bonus-list' }, T.info.brickList.map(([kind, note]) => el('div', { class: 'ak-bonus-row' },
      brickIcon(kind), el('div', {}, el('span', {}, note)),
    ))),
    el('p', { class: 'ak-note' }, T.info.stuck),
    pointsInfo(api, 'arkanoid'),
  ));
}

/** Выбор уровня по главам: открыты пройденные (stats.bestLevel) и следующий за ними; следующая глава — с замком. */
function showLevels(force = false) {
  if (phase !== 'play' && !force) return;
  const max = Math.min(LEVEL_COUNT, Math.max(stats.bestLevel + 1, game.level));
  const sections = [];
  for (let ch = 0; ch < CHAPTERS; ch++) {
    const first = ch * CHAPTER_SIZE + 1;
    const lastOf = Math.min(LEVEL_COUNT, first + CHAPTER_SIZE - 1);
    const locked = first > max;
    const passed = Math.max(0, Math.min(stats.bestLevel, lastOf) - first + 1);
    const head = el('div', { class: 'ak-chapter-head' },
      el('span', { class: 'ak-chapter-dot', style: `background: var(--ak-c${ch}-glow)` }),
      el('b', {}, locked ? `🔒 ${T.chapter(ch)}` : T.chapter(ch)),
      locked ? null : el('span', { class: 'ak-chapter-count' }, T.passed(passed, lastOf - first + 1)),
    );
    if (locked) {
      sections.push(el('div', { class: 'ak-chapter ak-chapter-locked' }, head));
      break;                                     // дальше — только одна закрытая глава
    }
    const cells = [];
    for (let n = first; n <= Math.min(lastOf, max + 3); n++) {
      const open = n <= max;
      cells.push(el('button', {
        class: `ak-lvl${open ? '' : ' ak-lvl-locked'}${n === game.level ? ' ak-lvl-current' : ''}${n <= stats.bestLevel ? ' ak-lvl-passed' : ''}`,
        disabled: !open,
        onclick: () => {
          closeModal();
          if (n === game.level && game.broken === 0) return;
          playLevel(n);
        },
      }, open ? String(n) : '🔒', n <= stats.bestLevel ? el('span', { class: 'ak-lvl-done' }, '✓') : null));
    }
    sections.push(el('div', { class: 'ak-chapter' }, head, el('div', { class: 'ak-levels' }, cells)));
  }
  openModal(card(T.levelsTitle, el('p', { class: 'ak-note' }, T.levelsNote), sections));
  ui.modal.querySelector('.ak-lvl-current')?.scrollIntoView({ block: 'center' });
}

function askRestart() {
  if (phase !== 'play') return;
  openModal(card(T.newLevel,
    el('p', { class: 'ak-note' }, T.restartQuestion),
    el('div', { class: 'ak-card-actions' },
      el('button', { class: 'btn btn-secondary', onclick: closeModal }, T.cancelBtn),
      el('button', {
        class: 'btn',
        onclick: () => {
          closeModal();
          playLevel(game.level);
        },
      }, T.restart),
    ),
  ));
}

function iconButton(icon, label, onclick) {
  const button = el('button', { class: 'ak-icon-btn', 'aria-label': label, title: label, onclick });
  button.innerHTML = icon;
  return button;
}

/** Отладка (?akdebug): window.__arkanoid — уровень, бонус, бот, победа. */
function debugHook() {
  if (!new URLSearchParams(location.search).has('akdebug')) return;
  window.__arkanoid = {
    game: () => game,
    stats: () => stats,
    level: (n) => playLevel(n),
    bonus: (type) => {
      applyBonus(game, type);
      handleEvents(performance.now());
    },
    drop: (type, x = W / 2, y = 300) => {
      game.drops.push({ id: game.nextId++, type, x, y });
    },
    bot: (on = true) => {
      bot = on;
    },
    win: () => {
      for (const b of game.bricks) if ('nhpe'.includes(b.kind)) b.hp = 0;
      game.left = 0;
      bricksDirty = true;
    },
    unlock: (n) => {
      stats.bestLevel = n;
    },
  };
}

export default {
  id: 'arkanoid',
  title: 'Арканоид',

  async init(container, gameApi) {
    api = gameApi;
    host = container;
    toast = createToast();
    const [saved, savedStats, savedSound] = await Promise.all([
      api.storage.get('current'), api.storage.get('stats'), api.storage.get('sound'),
    ]);
    if (!api) return;
    soundOn = savedSound !== false;
    stats = isValidStats(savedStats) ? savedStats : emptyStats();

    ui = {
      sub: el('div', { class: 'ak-sub' }),
      lives: el('div', { class: 'ak-lives', role: 'img' }),
      fill: el('div', { class: 'ak-progress-fill' }),
      percent: el('div', { class: 'ak-percent' }, '0%'),
      canvas: el('canvas', { class: 'ak-canvas' }),
      strip: el('div', { class: 'ak-strip' }, el('span', {}, T.strip)),
      modal: el('div', { class: 'ak-modal', hidden: true }),
    };
    ui.ctx = ui.canvas.getContext('2d');
    ui.soundBtn = iconButton(ICONS.soundOn, 'Выключить звук', toggleSound);
    ui.wrap = el('div', { class: 'ak-wrap' }, ui.canvas);
    ui.stage = el('div', { class: 'ak-stage' }, ui.wrap, ui.strip);
    ui.stage.addEventListener('pointerdown', onDown);
    ui.stage.addEventListener('pointermove', onMove);
    ui.stage.addEventListener('pointerup', onUp);
    ui.stage.addEventListener('pointercancel', (e) => {
      if (e.pointerId === pointer) pointer = null;
    });

    root = el('div', { class: 'ak' },
      el('div', { class: 'ak-header' },
        el('div', { class: 'ak-titles' }, el('div', { class: 'ak-title' }, T.title), ui.sub),
        el('div', { class: 'ak-actions' },
          ui.soundBtn,
          iconButton(ICONS.levels, T.levels, () => showLevels()),
          iconButton(ICONS.restart, T.newLevel, askRestart),
          iconButton(ICONS.stats, T.stats.open, showStats),
          iconButton(ICONS.info, T.info.open, showInfo),
        ),
      ),
      el('div', { class: 'ak-progress' }, ui.lives, el('div', { class: 'ak-progress-track' }, ui.fill), ui.percent),
      ui.stage,
      ui.modal,
      toast.el,
    );
    container.append(root);
    renderSoundBtn();
    fx = createFx(root, 'ak-fx');
    root.append(fx.canvas);
    document.addEventListener('keydown', onKeydown);
    document.addEventListener('keyup', onKeyup);

    readPalette();
    touchUsed = Boolean(window.matchMedia?.('(pointer: coarse)').matches);
    // сохранение не прошло проверку (раскладки уровней менялись) — тот же уровень, но с начала
    const fresh = !isValidState(saved);
    game = fresh ? newGame(savedLevel(saved) ?? 1) : restore(saved);
    if (fresh) save();
    else api.progress(T.level(game.level));
    ui.resizeObserver = new ResizeObserver(() => resize());
    ui.resizeObserver.observe(ui.stage);
    startLevel(true);
    // партия сохраняется сама раз в несколько секунд, если что-то разбито
    saveTimer = setInterval(() => {
      if (saveDirty && phase === 'play') {
        save();
        api?.storage.set('stats', stats);
      }
    }, 8000);
    if (fresh && stats.bricks === 0) later(() => toast?.show(T.help, 3600), 900);
    debugHook();
  },

  getState() {
    if (!game) return null;
    save();
    api?.storage.set('stats', stats);
    return { level: (pending ?? game).level };
  },

  destroy() {
    save();
    api?.storage.set('stats', stats);
    cancelAnimationFrame(raf);
    raf = 0;
    clearInterval(saveTimer);
    saveTimer = 0;
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
    document.removeEventListener('keydown', onKeydown);
    document.removeEventListener('keyup', onKeyup);
    ui?.resizeObserver?.disconnect();
    fx?.dispose();
    toast?.dispose();
    root?.remove();
    if (host) delete host.dataset.chapter;
    if (window.__arkanoid) delete window.__arkanoid;
    api = host = root = ui = toast = fx = game = pending = palette = brickLayer = bgCache = pointer = canvasOffset = null;
    stats = emptyStats();
    phase = 'play';
    sprites.clear();
    flashes.clear();
    keys.clear();
    gifts = [];
    ghosts = [];
    rings = [];
    popups = [];
    ambient = [];
    intro = 0;
    shownW = 0;
    dieAt = 0;
    lastShake = 0;
    modalActive = false;
    bricksDirty = true;
    saveDirty = false;
    bot = false;
    touchUsed = false;
    stripUsed = false;
    lastLives = -1;
    lastProgress = -1;
  },
};
