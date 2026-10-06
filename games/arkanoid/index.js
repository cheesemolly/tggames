// Арканоид: платформой отбиваешь шарик и разбиваешь кирпичи. 210 уровней, 15 бонусов (три и восемь шариков,
// огненный шар, пробойник, ловушка, лазер, ракеты, широкая и узкая платформа, бомба…), запас — три шарика на уровень.
// Управление: води пальцем по полю или по полосе под ним — платформа едет за пальцем; отпустил — шарик запущен.
// С клавиатуры — стрелки и пробел. Поле рисуется на Canvas: кирпичи — заранее нарисованным слоем (перерисовывается,
// только когда кирпич задет), шарики, бонусы и платформа — каждый кадр. Партия, статистика и звук — в api.storage.

import { el } from '../../shared/dom.js';
import { animate, showLayer, hideLayer, shake, pop, reducedMotion } from '../../shared/motion.js';
import { createToast } from '../../shared/toast.js';
import { createFx } from '../../shared/fx.js';
import { createAudio } from '../../shared/sfx.js';
import { pointsInfo } from '../../shared/points-info.js';
import { createSounds } from './sounds.js';
import {
  W, H, BRICK_W, BRICK_H, LEVEL_COUNT, PADDLE_Y, PADDLE_H, BALL_R, DROP_R, WEAR, MAX_LIVES, BONUSES, BAD_BONUSES,
  FIRE_TIME, RAIL_TIME, CATCH_TIME, LASER_TIME, MISSILES, polygon, newGame, step, launch, movePaddle, applyBonus,
  progress, snapshot, restore, isValidState, emptyStats, isValidStats, botTarget, ballRadius, paddleW,
} from './logic.js';

const T = {
  title: 'Арканоид',
  level: (n) => `Уровень ${n}`,
  worlds: ['Космос', 'Океан', 'Рубин', 'Вулкан'],
  launchTouch: 'Коснись, чтобы запустить шарик',
  launchHeld: 'Отпусти палец — шарик полетит',
  launchMouse: 'Нажми, чтобы запустить шарик',
  strip: 'Води пальцем здесь',
  help: 'Води пальцем по полю или по полосе под ним — платформа едет за пальцем',
  wonTitle: 'Отлично!',
  completed: (n) => `Уровень ${n} пройден`,
  wonInfo: (time, lives) => `Время: ${time} · Шариков в запасе: ${lives}`,
  next: (n) => `Уровень ${n}`,
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
  lives: (n) => `Шариков в запасе: ${n}`,
  stats: {
    open: 'Статистика', title: 'Статистика', level: 'Уровень', cleared: 'Пройдено уровней', bestLevel: 'Лучший уровень',
    bricks: 'Разбито кирпичей', bonuses: 'Поймано бонусов', fails: 'Неудач', close: 'Закрыть',
  },
  info: {
    open: 'Справка', title: 'Как играть', bonuses: 'Бонусы', bricks: 'Кирпичи',
    rules: 'Разбей все кирпичи шариком и не дай ему упасть. На уровень — три шарика. Платформу ведёт палец, отпустил — шарик запущен. Чем ближе к краю платформы попал шарик, тем положе он отлетит.',
    brickList: [
      ['n', 'Обычный — один удар.'],
      ['h', 'Крепкий — три удара.'],
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
    small: ['Маленький шарик', 'Шарик меньше — попасть труднее.'],
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

const PAD = 2;                       // поля картинки кирпича, в единицах поля
const TAU = Math.PI * 2;

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
let bgCache = null;
const sprites = new Map();           // картинки кирпичей, шариков и бонусов
const flashes = new Map();           // id кирпича → время удара
let rings = [];                      // взрывы: { x, y, r, t }
let popups = [];                     // всплывающие подписи: { text, x, y, t, color }
let intro = 0;                       // время начала появления уровня
let shownW = 0;                      // ширина платформы на экране — догоняет настоящую плавно
let dieAt = 0;                       // когда потерян шарик (платформа мигает)
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
    worlds: [0, 1, 2, 3].map((w) => ({
      bg: v(`--ak-w${w}-bg`), bg2: v(`--ak-w${w}-bg2`), deco: v(`--ak-w${w}-deco`), hard: v(`--ak-w${w}-hard`),
      tones: [0, 1, 2, 3].map((t) => v(`--ak-w${w}-t${t}`)),
    })),
    steel: v('--ak-steel'), boom: v('--ak-boom'), bonus: v('--ak-bonus'), ball: v('--ak-ball'), fire: v('--ak-fire'),
    rail: v('--ak-rail'), paddle: v('--ak-paddle'), good: v('--ak-good'), bad: v('--ak-bad'), neutral: v('--ak-neutral'),
    text: v('--ak-field-text'),
  };
  probe.remove();
}

/** rgb(…) → светлее (k > 0) или темнее (k < 0). */
function shade(rgb, k) {
  const m = rgb.match(/\d+(\.\d+)?/g);
  if (!m) return rgb;
  const [r, g, b] = m.slice(0, 3).map(Number).map((n) => Math.round(k > 0 ? n + (255 - n) * k : n * (1 + k)));
  return `rgb(${r}, ${g}, ${b})`;
}

function alpha(rgb, a) {
  const m = rgb.match(/\d+(\.\d+)?/g);
  return m ? `rgba(${m[0]}, ${m[1]}, ${m[2]}, ${a})` : rgb;
}

const brickColor = (world, kind, tone) => (kind === 'n' ? palette.worlds[world].tones[tone]
  : kind === 'h' ? palette.worlds[world].hard
    : kind === 'x' ? palette.steel : kind === 'e' ? palette.boom : kind === 'p' ? palette.bonus : palette.ball);
const bonusColor = (type) => (BAD_BONUSES.includes(type) ? palette.bad : type === 'normal' ? palette.neutral : palette.good);

// ---------- картинки ----------

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.ceil(w));
  c.height = Math.max(2, Math.ceil(h));
  return c;
}

function path(c, pts) {
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
}

function star(c, x, y, r, rays, inner = 0.42) {
  c.beginPath();
  for (let i = 0; i < rays * 2; i++) {
    const a = (i / (rays * 2)) * TAU - Math.PI / 2;
    const d = i % 2 ? r * inner : r;
    c.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
  }
  c.closePath();
}

/**
 * Картинка кирпича (рисуется один раз на мир, вид, оттенок, форму и состояние): градиент сверху вниз, блик, кромка
 * и значок вида. state — оставшаяся прочность (у крепкого и стального). Картинка — рамка 32 × 18 с полями PAD.
 * s — пикселей холста на единицу поля (у образцов в справке — свой, с другим prefix).
 */
function brickSprite(world, kind, tone, shape, state, s = scale * dprNow, prefix = 'b') {
  const key = `${prefix}|${world}|${kind}|${tone}|${shape}|${state}`;
  let img = sprites.get(key);
  if (img) return img;
  img = makeCanvas((BRICK_W + PAD * 2) * s, (BRICK_H + PAD * 2) * s);
  const c = img.getContext('2d');
  c.setTransform(s, 0, 0, s, PAD * s, PAD * s);
  // контур чуть меньше рамки — между кирпичами остаётся зазор
  const kx = (BRICK_W - 1.6) / BRICK_W;
  const ky = (BRICK_H - 1.6) / BRICK_H;
  const pts = polygon(shape, 0, 0).map(([x, y]) => [BRICK_W / 2 + (x - BRICK_W / 2) * kx, BRICK_H / 2 + (y - BRICK_H / 2) * ky]);
  const cx = pts.reduce((sum, p) => sum + p[0], 0) / pts.length;
  const cy = pts.reduce((sum, p) => sum + p[1], 0) / pts.length;
  let color = brickColor(world, kind, tone);
  if (kind === 'h') color = shade(color, (3 - state) * 0.2);                // чем меньше осталось, тем светлее
  if (kind === 'x') color = shade(color, -(WEAR - state) * 0.035);
  c.lineJoin = 'round';

  if (kind === 't') {
    // запертый шарик: шарик в пузыре
    c.fillStyle = alpha(palette.ball, 0.16);
    c.beginPath();
    c.arc(cx, cy, 8.6, 0, TAU);
    c.fill();
    c.strokeStyle = alpha(palette.ball, 0.75);
    c.lineWidth = 1.1;
    c.stroke();
    const g = c.createRadialGradient(cx - 1.6, cy - 1.8, 0.5, cx, cy, 5.2);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.45, palette.ball);
    g.addColorStop(1, shade(palette.ball, -0.35));
    c.fillStyle = g;
    c.beginPath();
    c.arc(cx, cy, 5, 0, TAU);
    c.fill();
    sprites.set(key, img);
    return img;
  }

  const g = c.createLinearGradient(0, 0, 0, BRICK_H);
  g.addColorStop(0, shade(color, 0.3));
  g.addColorStop(0.5, color);
  g.addColorStop(1, shade(color, -0.28));
  path(c, pts);
  c.fillStyle = g;
  c.strokeStyle = color;
  c.lineWidth = 1.2;
  c.stroke();
  c.fill();
  c.save();
  path(c, pts);
  c.clip();
  // блик сверху
  const gl = c.createLinearGradient(0, 0, 0, BRICK_H * 0.55);
  gl.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
  gl.addColorStop(1, 'rgba(255, 255, 255, 0)');
  c.fillStyle = gl;
  c.fillRect(0, 0, BRICK_W, BRICK_H * 0.55);
  if (kind === 'x') {
    // сталь: тёмная рамка и заклёпки, трещины по мере износа
    c.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    c.lineWidth = 3;
    path(c, pts);
    c.stroke();
    c.fillStyle = 'rgba(255, 255, 255, 0.55)';
    for (const dx of [-6, 6]) {
      c.beginPath();
      c.arc(cx + dx, cy, 1.3, 0, TAU);
      c.fill();
    }
    if (state <= WEAR * 0.6) {
      c.strokeStyle = 'rgba(0, 0, 0, 0.55)';
      c.lineWidth = 0.9;
      c.beginPath();
      c.moveTo(cx - 9, cy - 6);
      c.lineTo(cx - 3, cy);
      c.lineTo(cx - 6, cy + 6);
      if (state <= WEAR * 0.3) {
        c.moveTo(cx + 10, cy - 7);
        c.lineTo(cx + 4, cy + 1);
        c.lineTo(cx + 8, cy + 7);
      }
      c.stroke();
    }
  } else if (kind === 'h') {
    // крепкий: рамка и точки — сколько ударов осталось
    c.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    c.lineWidth = 2.2;
    path(c, pts);
    c.stroke();
    c.fillStyle = 'rgba(255, 255, 255, 0.92)';
    for (let i = 0; i < state; i++) {
      c.beginPath();
      c.arc(cx + (i - (state - 1) / 2) * 5.2, cy + (shape === 'U' ? 2.5 : shape === 'D' ? -2.5 : 0), 1.7, 0, TAU);
      c.fill();
    }
  } else if (kind === 'e') {
    // взрывной: искра
    c.fillStyle = '#ffe36b';
    star(c, cx, cy + (shape === 'U' ? 2 : shape === 'D' ? -2 : 0), 6, 8, 0.5);
    c.fill();
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(cx, cy + (shape === 'U' ? 2 : shape === 'D' ? -2 : 0), 1.8, 0, TAU);
    c.fill();
  } else if (kind === 'p') {
    // с бонусом: звёздочка
    c.fillStyle = '#ffffff';
    star(c, cx, cy + (shape === 'U' ? 2 : shape === 'D' ? -2 : 0), 6.2, 4, 0.34);
    c.fill();
  }
  c.restore();
  // светлая кромка
  c.strokeStyle = 'rgba(255, 255, 255, 0.28)';
  c.lineWidth = 0.6;
  path(c, pts);
  c.stroke();
  sprites.set(key, img);
  return img;
}

function drawBrick(c, b, world) {
  const state = b.kind === 'h' ? b.hp : b.kind === 'x' ? Math.ceil((b.hp / WEAR) * 3) * (WEAR / 3) : 0;
  const img = brickSprite(world, b.kind, b.tone, b.shape, state);
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

/** Шарик: готовая картинка на цвет (объём и блик). */
function ballSprite(color) {
  const key = `ball|${color}`;
  let img = sprites.get(key);
  if (img) return img;
  const r = BALL_R * scale * dprNow;
  img = makeCanvas(r * 2 + 4, r * 2 + 4);
  const c = img.getContext('2d');
  const m = img.width / 2;
  const g = c.createRadialGradient(m - r * 0.35, m - r * 0.4, r * 0.1, m, m, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.4, color);
  g.addColorStop(1, shade(color, -0.4));
  c.fillStyle = g;
  c.beginPath();
  c.arc(m, m, r, 0, TAU);
  c.fill();
  sprites.set(key, img);
  return img;
}

/** Значок бонуса белым, в круге радиуса r с центром в нуле. */
function bonusGlyph(c, type, r) {
  const u = r / 10;
  c.save();
  c.scale(u, u);
  c.fillStyle = '#ffffff';
  c.strokeStyle = '#ffffff';
  c.lineWidth = 1.7;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  const dot = (x, y, d) => {
    c.beginPath();
    c.arc(x, y, d, 0, TAU);
    c.fill();
  };
  const line = (...p) => {
    c.beginPath();
    for (let i = 0; i < p.length; i += 2) (i ? c.lineTo(p[i], p[i + 1]) : c.moveTo(p[i], p[i + 1]));
    c.stroke();
  };
  if (type === 'split3') {
    dot(0, -3.6, 2.2);
    dot(-4, 3, 2.2);
    dot(4, 3, 2.2);
  } else if (type === 'split8') {
    for (let k = 0; k < 8; k++) dot(Math.cos((k / 8) * TAU) * 5, Math.sin((k / 8) * TAU) * 5, 1.5);
  } else if (type === 'fast') {
    line(-5, -4, -1, 0, -5, 4);
    line(1, -4, 5, 0, 1, 4);
  } else if (type === 'slow') {
    line(5, -4, 1, 0, 5, 4);
    line(-1, -4, -5, 0, -1, 4);
  } else if (type === 'fire') {
    c.beginPath();
    c.moveTo(0, -6.5);
    c.bezierCurveTo(5, -1.5, 5.5, 2.5, 3.2, 5);
    c.bezierCurveTo(1.5, 6.6, -1.5, 6.6, -3.2, 5);
    c.bezierCurveTo(-5.5, 2.5, -3, 0, -2.2, -2.4);
    c.bezierCurveTo(-1, -1, 0, -3, 0, -6.5);
    c.fill();
  } else if (type === 'rail') {
    line(0, 6, 0, -6);
    line(-3.6, -2.4, 0, -6, 3.6, -2.4);
    line(-5.5, 2.5, -2.6, 2.5);
    line(2.6, 2.5, 5.5, 2.5);
  } else if (type === 'small') {
    dot(0, 0, 1.9);
    c.lineWidth = 1.3;
    c.setLineDash([2.2, 2.6]);
    c.beginPath();
    c.arc(0, 0, 5.6, 0, TAU);
    c.stroke();
  } else if (type === 'normal') {
    c.beginPath();
    c.arc(0, 0, 4.6, 0, TAU);
    c.stroke();
  } else if (type === 'catch') {
    c.lineWidth = 2.2;
    line(-4.6, -5, -4.6, 0.5);
    c.beginPath();
    c.arc(0, 0.5, 4.6, Math.PI, 0, true);
    c.stroke();
    line(4.6, 0.5, 4.6, -5);
  } else if (type === 'laser') {
    line(-3.2, 6, -3.2, -6);
    line(3.2, 6, 3.2, -6);
  } else if (type === 'missile') {
    c.beginPath();
    c.moveTo(0, -6.8);
    c.lineTo(3, -1.6);
    c.lineTo(3, 3.6);
    c.lineTo(5.2, 6.4);
    c.lineTo(-5.2, 6.4);
    c.lineTo(-3, 3.6);
    c.lineTo(-3, -1.6);
    c.closePath();
    c.fill();
  } else if (type === 'expand') {
    line(-6, 0, 6, 0);
    line(-3, -3, -6, 0, -3, 3);
    line(3, -3, 6, 0, 3, 3);
  } else if (type === 'shrink') {
    line(-6.5, 0, -1.5, 0);
    line(1.5, 0, 6.5, 0);
    line(-4.5, -3, -1.5, 0, -4.5, 3);
    line(4.5, -3, 1.5, 0, 4.5, 3);
  } else if (type === 'bomb') {
    dot(-0.6, 1.4, 4.8);
    line(2.4, -2.4, 4.4, -4.8);
    dot(5.2, -5.6, 1.1);
  } else if (type === 'life') {
    c.lineWidth = 2.4;
    line(0, -5, 0, 5);
    line(-5, 0, 5, 0);
  }
  c.restore();
}

/** Падающий бонус: цветной кружок со значком (зелёный — полезный, красный — вредный). px — радиус в пикселях холста. */
function bonusSprite(type, px = DROP_R * scale * dprNow, key = `drop|${type}`) {
  let img = sprites.get(key);
  if (img) return img;
  img = makeCanvas(px * 2 + 4, px * 2 + 4);
  const c = img.getContext('2d');
  const m = img.width / 2;
  const color = bonusColor(type);
  const g = c.createRadialGradient(m - px * 0.3, m - px * 0.35, px * 0.1, m, m, px);
  g.addColorStop(0, shade(color, 0.45));
  g.addColorStop(0.6, color);
  g.addColorStop(1, shade(color, -0.35));
  c.fillStyle = g;
  c.beginPath();
  c.arc(m, m, px, 0, TAU);
  c.fill();
  c.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  c.lineWidth = Math.max(1, px * 0.1);
  c.beginPath();
  c.arc(m, m, px * 0.92, 0, TAU);
  c.stroke();
  c.translate(m, m);
  bonusGlyph(c, type, px * 0.86);
  sprites.set(key, img);
  return img;
}

/** Значок бонуса для справки — отдельный холст нужного размера. */
function bonusIcon(type, size = 30) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const src = bonusSprite(type, (size / 2 - 2) * dpr, `icon|${type}|${size}`);
  const canvas = el('canvas', { class: 'ak-bonus-icon' });
  canvas.width = src.width;
  canvas.height = src.height;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  canvas.getContext('2d').drawImage(src, 0, 0);
  return canvas;
}

/** Образец кирпича для справки. */
function brickIcon(kind) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const src = brickSprite(game.world, kind, 0, kind === 't' ? 'C' : 'R', kind === 'h' ? 3 : kind === 'x' ? WEAR : 0, 1.2 * dpr, 'icon');
  const canvas = el('canvas', { class: 'ak-brick-icon' });
  canvas.width = src.width;
  canvas.height = src.height;
  canvas.style.width = `${(BRICK_W + PAD * 2) * 1.2}px`;
  canvas.style.height = `${(BRICK_H + PAD * 2) * 1.2}px`;
  canvas.getContext('2d').drawImage(src, 0, 0);
  return canvas;
}

function rnd(seed) {
  let x = seed >>> 0;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

/** Фон поля под мир уровня: градиент и редкий узор (звёзды, пузыри, ромбы, искры) — рисуется заранее. */
function background() {
  if (bgCache) return bgCache;
  const w = palette.worlds[game.world];
  bgCache = makeCanvas(ui.canvas.width, ui.canvas.height);
  const c = bgCache.getContext('2d');
  const s = scale * dprNow;
  c.setTransform(s, 0, 0, s, 0, 0);
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, w.bg);
  g.addColorStop(1, w.bg2);
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  const r = rnd(game.level * 7919 + 17);
  c.fillStyle = w.deco;
  c.strokeStyle = w.deco;
  c.lineWidth = 1;
  for (let i = 0; i < 70; i++) {
    const x = r() * W;
    const y = r() * H;
    const d = 1 + r() * 2.2;
    c.globalAlpha = 0.25 + r() * 0.5;
    if (game.world === 0) {
      c.beginPath();
      c.arc(x, y, d * 0.7, 0, TAU);
      c.fill();
    } else if (game.world === 1) {
      c.beginPath();
      c.arc(x, y, d * 2.4, 0, TAU);
      c.stroke();
    } else if (game.world === 2) {
      path(c, [[x, y - d * 3], [x + d * 2, y], [x, y + d * 3], [x - d * 2, y]]);
      c.stroke();
    } else {
      path(c, [[x, y - d * 2.4], [x + d * 2.2, y + d * 1.6], [x - d * 2.2, y + d * 1.6]]);
      c.fill();
    }
  }
  c.globalAlpha = 1;
  // пол: за эту линию шарик падать не должен
  const fl = c.createLinearGradient(0, PADDLE_Y + PADDLE_H, 0, H);
  fl.addColorStop(0, 'rgba(0, 0, 0, 0)');
  fl.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
  c.fillStyle = fl;
  c.fillRect(0, PADDLE_Y + PADDLE_H, W, H - PADDLE_Y - PADDLE_H);
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
  for (const b of game.bricks) if (b.hp > 0) drawBrick(c, b, game.world);
  bricksDirty = false;
}

// ---------- отрисовка ----------

const STRIP_MIN = 64;                // полоса для пальца под полем — не ниже (CSS: .ak-strip min-height)

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
  draw(performance.now());
}

/**
 * Текст — в пикселях, а не в единицах поля: Safari не рисует шрифт меньше ~1px, даже если холст увеличен масштабом.
 * x, y — в единицах поля, size — в CSS-пикселях.
 */
function text(c, str, x, y, size, color, { align = 'center', weight = 800, a = 1 } = {}) {
  c.save();
  c.setTransform(dprNow, 0, 0, dprNow, 0, 0);
  c.font = `${weight} ${Math.round(size)}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  c.textAlign = align;
  c.textBaseline = 'middle';
  c.globalAlpha = a * 0.4;
  c.fillStyle = '#000000';
  c.fillText(str, x * scale, y * scale + 1.2);
  c.globalAlpha = a;
  c.fillStyle = color;
  c.fillText(str, x * scale, y * scale);
  c.restore();
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function drawPaddle(c, now) {
  const w = shownW || paddleW(game);
  const x = game.paddle.x - w / 2;
  const y = PADDLE_Y;
  // мигает после потери шарика
  const blink = now - dieAt < 900 ? 0.45 + 0.55 * Math.abs(Math.sin((now - dieAt) / 75)) : 1;
  c.globalAlpha = blink;
  const fxs = game.fx;
  if (fxs.laser > 0 || fxs.missile > 0) {
    c.fillStyle = shade(palette.paddle, -0.45);
    if (fxs.laser > 0) {
      c.fillRect(x + 5, y - 6, 6, 8);
      c.fillRect(x + w - 11, y - 6, 6, 8);
    } else c.fillRect(game.paddle.x - 4, y - 8, 8, 10);
  }
  roundRect(c, x, y, w, PADDLE_H, PADDLE_H / 2);
  c.fillStyle = shade(palette.paddle, -0.3);
  c.fill();
  roundRect(c, x + 1.5, y + 1.2, w - 3, PADDLE_H - 5, (PADDLE_H - 5) / 2);
  c.fillStyle = palette.paddle;
  c.fill();
  roundRect(c, x + 6, y + 2.6, w - 12, 2.6, 1.3);
  c.fillStyle = 'rgba(255, 255, 255, 0.55)';
  c.fill();
  if (fxs.catch > 0) {
    roundRect(c, x + 4, y - 2.4, w - 8, 3.4, 1.7);
    c.fillStyle = palette.good;
    c.fill();
  }
  c.globalAlpha = 1;
}

function drawBalls(c, now) {
  const r = ballRadius(game);
  const fire = game.fx.fire > 0;
  const rail = game.fx.rail > 0;
  const color = fire ? palette.fire : rail ? palette.rail : palette.ball;
  const img = ballSprite(color);
  const size = (r * 2 * img.width) / (BALL_R * 2 * scale * dprNow);
  for (const b of game.balls) {
    if (b.stuck === null) {
      // след по ходу полёта
      const n = fire || rail ? 5 : 3;
      c.fillStyle = color;
      for (let k = n; k >= 1; k--) {
        c.globalAlpha = (rail ? 0.34 : 0.2) * (1 - k / (n + 1));
        c.beginPath();
        c.arc(b.x - b.dx * k * r * (rail ? 1.7 : 1.05), b.y - b.dy * k * r * (rail ? 1.7 : 1.05), r * (1 - k * 0.12), 0, TAU);
        c.fill();
      }
      c.globalAlpha = 1;
    }
    const pulse = b.stuck !== null && !reducedMotion() ? 1 + 0.08 * Math.sin(now / 160) : 1;
    c.drawImage(img, b.x - (size * pulse) / 2, b.y - (size * pulse) / 2, size * pulse, size * pulse);
  }
}

function drawChips(c) {
  // сколько осталось у временных бонусов: значок и дуга, слева внизу
  const list = [['fire', game.fx.fire / FIRE_TIME], ['rail', game.fx.rail / RAIL_TIME], ['catch', game.fx.catch / CATCH_TIME],
    ['laser', game.fx.laser / LASER_TIME], ['missile', game.fx.missile / MISSILES]].filter((x) => x[1] > 0);
  if (!list.length) return;
  // под платформой (ниже неё — 34 единицы поля), чтобы она их не закрывала
  const y = H - 17;
  c.save();
  list.forEach(([type, part], i) => {
    const x = 20 + i * 36;
    c.globalAlpha = 0.9;
    c.fillStyle = 'rgba(0, 0, 0, 0.45)';
    c.beginPath();
    c.arc(x, y, 15, 0, TAU);
    c.fill();
    c.strokeStyle = palette.good;
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

function draw(now) {
  const c = ui.ctx;
  if (!game || !palette) return;
  const s = scale * dprNow;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.drawImage(background(), 0, 0);
  if (bricksDirty) redrawBricks();
  // появление уровня: кирпичи проявляются и съезжают сверху
  const k = intro ? Math.min(1, (now - intro) / 480) : 1;
  const ease = 1 - (1 - k) * (1 - k);
  c.globalAlpha = ease;
  c.drawImage(brickLayer, 0, Math.round(-(1 - ease) * 26 * dprNow));
  c.globalAlpha = 1;
  c.setTransform(s, 0, 0, s, 0, 0);

  // вспышки ударов
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

  // взрывы: расходящееся кольцо
  rings = rings.filter((e) => now - e.t < 320);
  for (const e of rings) {
    const p = (now - e.t) / 320;
    c.globalAlpha = 1 - p;
    c.strokeStyle = '#ffd36b';
    c.lineWidth = 5 * (1 - p) + 1;
    c.beginPath();
    c.arc(e.x, e.y, 6 + (e.r - 4) * (1 - (1 - p) * (1 - p)), 0, TAU);
    c.stroke();
    c.fillStyle = '#fff3c4';
    c.globalAlpha = 0.5 * (1 - p) * (1 - p);
    c.beginPath();
    c.arc(e.x, e.y, e.r * 0.6 * (0.4 + p * 0.6), 0, TAU);
    c.fill();
  }
  c.globalAlpha = 1;

  // выстрелы
  for (const sh of game.shots) {
    if (sh.kind === 'laser') {
      c.fillStyle = alpha(palette.good, 0.55);
      c.fillRect(sh.x - 3.4, sh.y - 12, 6.8, 16);
      c.fillStyle = '#ffffff';
      c.fillRect(sh.x - 1.6, sh.y - 14, 3.2, 18);
    } else {
      c.fillStyle = palette.fire;
      c.fillRect(sh.x - 2, sh.y + 6, 4, 9);
      c.fillStyle = '#ffffff';
      path(c, [[sh.x, sh.y - 9], [sh.x + 3.6, sh.y - 2], [sh.x + 3.6, sh.y + 7], [sh.x - 3.6, sh.y + 7], [sh.x - 3.6, sh.y - 2]]);
      c.fill();
    }
  }

  // падающие бонусы и освобождённые шарики
  for (const p of game.drops) {
    const img = bonusSprite(p.type);
    const d = DROP_R * 2 + 4 / (scale * dprNow);
    const sway = reducedMotion() ? 1 : 1 + 0.06 * Math.sin(now / 130 + p.id);
    c.drawImage(img, p.x - (d * sway) / 2, p.y - (d * sway) / 2, d * sway, d * sway);
  }
  if (game.loose.length) {
    const img = ballSprite(palette.ball);
    const d = BALL_R * 2 + 4 / (scale * dprNow);
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
    text(c, p.text, p.x, p.y - q * p.rise, p.size, p.color, { a });
  }
  // подсказка запуска
  if (game.status === 'ready' && phase === 'play' && !modalActive && now - intro > 600 && now - dieAt > 700) {
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
  draw(now);
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

function popup(str, x, y, color = '#ffffff', { size = 14, life = 1000, rise = 34 } = {}) {
  const now = performance.now();
  // несколько бонусов подряд — подписи столбиком, а не друг на друге
  const fresh = popups.filter((p) => now - p.t < 500 && p.size === size).length;
  popups.push({ text: str, x: Math.max(70, Math.min(W - 70, x)), y: y - fresh * 30, color, size, life, rise, t: now });
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
      burstAt(e.x, e.y, brickColor(game.world, e.kind, e.tone));
      if (now - lastHaptic > 70) {
        api.platform.haptic.impact('light');
        lastHaptic = now;
      }
    } else if (e.type === 'explode') {
      rings.push({ x: e.x, y: e.y, r: e.r, t: now });
      sfx('explode', null, 70);
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
      rings.push({ x: e.x, y: e.y, r: 26, t: now });
      sfx('explode', null, 70);
    } else if (e.type === 'help') sfx('drop');
    else if (e.type === 'lost') sfx('lost', null, 120);
    else if (e.type === 'bonus') onBonus(e.bonus);
    else if (e.type === 'die') onDie(now);
  }
  const ended = game.events.find((e) => e.type === 'win' || e.type === 'lose');
  game.events.length = 0;
  renderHud();
  if (ended?.type === 'win') won();
  else if (ended?.type === 'lose') lost();
}

function onBonus(type) {
  stats.bonuses += 1;
  const bad = BAD_BONUSES.includes(type);
  if (type !== 'bomb') {
    sfx(type === 'life' ? 'life' : bad ? 'bad' : 'good');
    popup(T.bonus[type][0], game.paddle.x, PADDLE_Y - 20, bonusColor(type) === palette.neutral ? '#ffffff' : shade(bonusColor(type), 0.35));
    api.platform.haptic.impact(bad ? 'medium' : 'light');
  }
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
  rings = [];
  popups = [];
  bgCache = null;
  bricksDirty = true;
  shownW = 0;
  dieAt = 0;
  lastLives = -1;
  lastProgress = -1;
  ui.sub.textContent = `${T.level(game.level)} · ${T.worlds[game.world]}`;
  renderHud(true);
  intro = animateIn && !reducedMotion() ? performance.now() : 0;
  if (animateIn) popup(T.level(game.level), W / 2, 520, '#ffffff', { size: 26, life: 1400, rise: 20 });
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
  // следующий уровень сохранён сразу, на экране — пройденный
  pending = snapshot(newGame(last ? done.level : done.level + 1));
  save();
  sfx('win');
  api.platform.haptic.notification('success');
  later(() => {
    if (!ui) return;
    const w = palette.worlds[done.world];
    fx?.confetti([...w.tones, palette.ball, palette.bonus], 130);
    const stars = [0, 1, 2].map(() => el('span', { class: 'ak-won-star' }, '★'));
    const title = el('h2', { class: 'ak-won-title' }, last ? T.allDone : T.wonTitle);
    const cardEl = el('div', { class: 'ak-card ak-won', role: 'dialog', 'aria-label': T.wonTitle },
      el('div', { class: 'ak-won-rays', 'aria-hidden': 'true' }),
      el('div', { class: 'ak-won-stars' }, stars),
      title,
      el('div', { class: 'ak-won-badge' }, T.completed(done.level)),
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
      }, last ? T.chooseLevel : T.next(done.level + 1)),
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

/** Выбор уровня: открыты пройденные (stats.bestLevel) и следующий за ними. */
function showLevels(force = false) {
  if (phase !== 'play' && !force) return;
  const max = Math.min(LEVEL_COUNT, Math.max(stats.bestLevel + 1, game.level));
  const cells = [];
  for (let n = 1; n <= Math.min(LEVEL_COUNT, max + 3); n++) {
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
  openModal(card(T.levelsTitle,
    el('p', { class: 'ak-note' }, T.levelsNote),
    el('div', { class: 'ak-levels' }, cells),
  ));
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
    const fresh = !isValidState(saved);
    game = fresh ? newGame(1) : restore(saved);
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
    if (window.__arkanoid) delete window.__arkanoid;
    api = host = root = ui = toast = fx = game = pending = palette = brickLayer = bgCache = pointer = canvasOffset = null;
    stats = emptyStats();
    phase = 'play';
    sprites.clear();
    flashes.clear();
    keys.clear();
    rings = [];
    popups = [];
    intro = 0;
    shownW = 0;
    dieAt = 0;
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
