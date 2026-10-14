// Заставка «Лисьей охоты»: опушка леса, вывеска на двух столбах и доска с полосой загрузки, по которой бежит лиса.
// Оболочка грузит этот лёгкий модуль раньше игры (loader в реестре) и показывает его вместо «Загрузка…»
// (контракт — CLAUDE.md §5); убирает заставку сама игра, в конце init.
//
// Полоса честная. Первые FILES_PART — файлы игры: все сразу просим через modulepreload (параллельно, а не лесенкой
// по import — так ещё и быстрее), каждый пришедший двигает полосу. Остаток — подготовка в init: index.js зовёт
// loading.step(доля) (комната, заготовка картинок) и в конце await loading.done() — полоса доходит до конца,
// заставка тает.
//
// Без DOM при импорте (тесты в Node). Рисунок — SVG и CSS (стили — блок «заставка» в game.css): двигается только
// transform и opacity — такие анимации идут и тогда, когда init занимает поток.

import { reducedMotion } from '../../shared/motion.js';

/** Все модули игры, кроме этого, — тест сверяет со списком import'ов от index.js. */
export const FILES = [
  'index.js', 'sounds.js', 'render.js', 'ui.js', 'input.js', 'fullscreen.js', 'core.js', 'balance.js', 'world.js',
  'logic.js', 'art-all.js', 'art.js', 'art-kit.js', 'art-fox.js', 'art-fx.js', 'art-tiles.js', 'art-tiles2.js',
  'art-tiles3.js', 'art-mobs.js', 'art-mobs2.js', 'art-mobs3.js', 'art-items.js', 'art-items2.js', 'render-bake.js',
  'content.js', 'tiles.js', 'player.js', 'inventory.js', 'ai.js', 'combat.js', 'director.js', 'floor.js', 'mobs.js',
  'mobs2.js', 'mobs3.js', 'bosses.js', 'hazards.js', 'weapons.js', 'items.js', 'rooms.js', 'quests.js', 'places.js',
  'minions.js', 'patterns.js',
];

/** Сколько полосы — файлы; остальное — подготовка в init. */
export const FILES_PART = 0.8;
const BAR_MS = 450;          // столько полоса доезжает до нового места (transition в game.css)
const OUT_MS = 420;          // столько заставка тает
const FONT_WAIT_MS = 900;    // шрифт вывески не пришёл — надписи всё равно появляются

const SAYS = [
  [0, 'Протаптываем тропинки…'],
  [0.28, 'Будим кроликов…'],
  [0.56, 'Раскладываем ягоды…'],
  [FILES_PART, 'Лиса выходит на охоту…'],
  [1, 'Вперёд!'],
];

const clamp01 = (v) => (v > 0 ? (v < 1 ? v : 1) : 0);

/** Доля полосы: files — доля пришедших файлов, prep — подготовка в init (null — ещё не началась). */
export function barOf(files, prep = null) {
  if (prep === null) return FILES_PART * clamp01(files);
  return FILES_PART + (1 - FILES_PART) * clamp01(prep);
}

/** Подпись на записке под полосой. */
export function sayOf(p) {
  let say = SAYS[0][1];
  for (const [from, text] of SAYS) if (p >= from) say = text;
  return say;
}

// ---------- файлы игры ----------

let got = 0;                 // сколько файлов уже пришло (на всю жизнь страницы: второй раз игра грузится мгновенно)
let asked = false;
const listeners = new Set();

function preload() {
  if (asked) return;
  asked = true;
  const link0 = document.createElement('link');
  // старый Safari не знает modulepreload — тогда обычный preload того же запроса (браузер возьмёт его для import)
  const rel = link0.relList?.supports?.('modulepreload') ? 'modulepreload' : 'preload';
  for (const file of FILES) {
    const link = document.createElement('link');
    link.rel = rel;
    if (rel === 'preload') {
      link.as = 'script';
      link.crossOrigin = 'anonymous';
    }
    link.href = new URL(file, import.meta.url).href;
    link.onload = link.onerror = () => {
      link.remove();
      got += 1;
      listeners.forEach((fn) => fn());
    };
    document.head.append(link);
  }
}

// ---------- рисунок ----------

const n = (v) => Math.round(v * 10) / 10;

/** Повторяемая случайность: опушка у всех одна и та же. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Обводка по краю группы фигур, а не у каждой: сначала все фигуры толстой линией цвета обводки, сверху — заливки.
const outlined = (shapes, line, width, fills = shapes) =>
  `<g fill="${line}" stroke="${line}" stroke-width="${width}" stroke-linejoin="round">${shapes}</g>${fills}`;

const circle = (x, y, r, fill = '') => `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}"${fill && ` fill="${fill}"`}/>`;

/** Ель ярусами: x — середина, base — земля, h — высота, w — полуширина нижнего яруса. */
function fir(x, base, h, w) {
  const trunkH = h * 0.07;
  const top = base - h;
  const bot = base - trunkH;
  const tiers = 5;
  let d = '';
  for (let i = 0; i < tiers; i++) {
    const yt = top + (bot - top) * (i / tiers) * 0.8;
    const yb = top + (bot - top) * ((i + 1) / tiers);
    const wi = w * (0.32 + 0.68 * ((i + 1) / tiers));
    const ym = (yt + yb) / 2;
    d += `M${n(x)} ${n(yt)}Q${n(x + wi * 0.42)} ${n(ym)} ${n(x + wi)} ${n(yb)}Q${n(x + wi * 0.5)} ${n(yb - 9)} ${n(x)} ${n(yb - 3)}`
      + `Q${n(x - wi * 0.5)} ${n(yb - 9)} ${n(x - wi)} ${n(yb)}Q${n(x - wi * 0.42)} ${n(ym)} ${n(x)} ${n(yt)}Z`;
  }
  const tw = w * 0.1;
  const trunk = `M${n(x - tw)} ${n(base)}L${n(x - tw * 0.8)} ${n(bot - 14)}L${n(x + tw * 0.8)} ${n(bot - 14)}L${n(x + tw)} ${n(base)}Z`;
  return outlined(`<path d="${trunk}"/><path d="${d}"/>`, '#173f26', 6,
    `<path d="${trunk}" fill="url(#fhl-trunk)"/><path d="${d}" fill="url(#fhl-fir)"/>`);
}

/** Лиственное дерево: ствол и крона из шаров, свет слева сверху у каждого шара. */
function leafy(x, base, cy, R) {
  const tw = R * 0.15;
  const trunk = `<path d="M${n(x - tw * 1.5)} ${n(base)}Q${n(x - tw)} ${n(base - 12)} ${n(x - tw * 0.7)} ${n(cy + R * 0.3)}`
    + `L${n(x + tw * 0.7)} ${n(cy + R * 0.3)}Q${n(x + tw)} ${n(base - 12)} ${n(x + tw * 1.6)} ${n(base)}Z"/>`;
  // от нижних правых к верхним левым: освещённые шары лежат сверху
  const balls = [
    [0.52, 0.34, 0.46], [-0.24, 0.42, 0.5], [-0.7, 0.3, 0.36], [0.58, -0.08, 0.5], [-0.56, -0.02, 0.5],
    [0.18, 0.12, 0.56], [0.12, -0.42, 0.52], [-0.3, -0.36, 0.5],
  ].map(([dx, dy, r]) => circle(x + dx * R, cy + dy * R, r * R)).join('');
  return outlined(trunk + balls, '#1d5230', 6,
    `<g fill="url(#fhl-trunk)">${trunk}</g><g fill="url(#fhl-leaf)">${balls}</g>`);
}

/** Куст с ягодами. */
function bush(x, base, r, rnd) {
  const balls = [[-0.55, -0.55, 0.62], [0.5, -0.5, 0.66], [0, -0.95, 0.72]]
    .map(([dx, dy, k]) => circle(x + dx * r, base + dy * r, k * r)).join('');
  let berries = '';
  for (let i = 0; i < 4; i++) {
    const bx = x + (rnd() - 0.5) * r * 1.5;
    const by = base - r * (0.45 + rnd() * 0.8);
    berries += `${circle(bx, by, 4.2, '#e4473c')}${circle(bx - 1.3, by - 1.4, 1.3, '#ffd2c8')}`;
  }
  return outlined(balls, '#1d5230', 5, `<g fill="url(#fhl-bush)">${balls}</g>`) + berries;
}

/** Пень с кольцами. */
function stump(x, base, w, h) {
  const body = `<path d="M${n(x - w - 8)} ${n(base)}Q${n(x - w)} ${n(base - 6)} ${n(x - w)} ${n(base - h)}L${n(x + w)} ${n(base - h)}`
    + `Q${n(x + w)} ${n(base - 6)} ${n(x + w + 10)} ${n(base)}Q${n(x)} ${n(base + 8)} ${n(x - w - 8)} ${n(base)}Z"/>`;
  const top = `<ellipse cx="${n(x)}" cy="${n(base - h)}" rx="${n(w)}" ry="${n(w * 0.28)}"/>`;
  return outlined(body + top, '#4e3426', 5,
    `<g fill="url(#fhl-stump)">${body}</g><g fill="#e7c48e">${top}</g>`
    + `<ellipse cx="${n(x)}" cy="${n(base - h)}" rx="${n(w * 0.66)}" ry="${n(w * 0.18)}" fill="none" stroke="#c99a62" stroke-width="2.4"/>`
    + `<ellipse cx="${n(x)}" cy="${n(base - h)}" rx="${n(w * 0.32)}" ry="${n(w * 0.09)}" fill="none" stroke="#c99a62" stroke-width="2.4"/>`);
}

/** Мухомор: ножка и красная шляпка в белых точках. */
function toadstool(x, base, s) {
  const stem = `<path d="M${n(x - 4 * s)} ${n(base)}Q${n(x - 5 * s)} ${n(base - 9 * s)} ${n(x - 3 * s)} ${n(base - 15 * s)}`
    + `L${n(x + 3 * s)} ${n(base - 15 * s)}Q${n(x + 5 * s)} ${n(base - 9 * s)} ${n(x + 4 * s)} ${n(base)}Z"/>`;
  const cap = `<path d="M${n(x - 13 * s)} ${n(base - 13 * s)}Q${n(x - 12 * s)} ${n(base - 28 * s)} ${n(x)} ${n(base - 28 * s)}`
    + `Q${n(x + 12 * s)} ${n(base - 28 * s)} ${n(x + 13 * s)} ${n(base - 13 * s)}Q${n(x)} ${n(base - 10 * s)} ${n(x - 13 * s)} ${n(base - 13 * s)}Z"/>`;
  const dots = [[-6, -20, 2.4], [2, -24, 2.1], [7, -17, 1.8], [-1, -16, 1.5]]
    .map(([dx, dy, r]) => circle(x + dx * s, base + dy * s, r * s)).join('');
  return outlined(stem + cap, '#5c2a22', 4, `<g fill="#fff3e0">${stem}</g><g fill="url(#fhl-cap)">${cap}</g><g fill="#fffaf0">${dots}</g>`);
}

/** Камень. */
function rock(x, base, s) {
  const d = `M${n(x - 30 * s)} ${n(base)}Q${n(x - 34 * s)} ${n(base - 22 * s)} ${n(x - 14 * s)} ${n(base - 30 * s)}`
    + `Q${n(x + 6 * s)} ${n(base - 38 * s)} ${n(x + 24 * s)} ${n(base - 24 * s)}Q${n(x + 36 * s)} ${n(base - 12 * s)} ${n(x + 32 * s)} ${n(base)}Z`;
  return outlined(`<path d="${d}"/>`, '#4a5260', 5, `<path d="${d}" fill="url(#fhl-rock)"/>`
    + `<path d="M${n(x - 20 * s)} ${n(base - 22 * s)}Q${n(x - 10 * s)} ${n(base - 31 * s)} ${n(x + 4 * s)} ${n(base - 30 * s)}" fill="none" stroke="#dfe6ec" stroke-width="${n(3 * s)}" stroke-linecap="round"/>`);
}

/** Кролик сидит на поляне, смотрит влево. */
function rabbit(x, base, s) {
  const p = (dx, dy) => `${n(x + dx * s)} ${n(base + dy * s)}`;
  const shapes = `<ellipse cx="${n(x + 2 * s)}" cy="${n(base - 11 * s)}" rx="${n(13 * s)}" ry="${n(11 * s)}"/>`
    + `<ellipse cx="${n(x - 9 * s)}" cy="${n(base - 33 * s)}" rx="${n(3.2 * s)}" ry="${n(10 * s)}" transform="rotate(-12 ${p(-9, -33)})"/>`
    + `<ellipse cx="${n(x - 3 * s)}" cy="${n(base - 32 * s)}" rx="${n(3.2 * s)}" ry="${n(10 * s)}" transform="rotate(14 ${p(-3, -32)})"/>`
    + circle(x - 8 * s, base - 21 * s, 8 * s)
    + circle(x + 14 * s, base - 11 * s, 4.5 * s);
  return outlined(shapes, '#6a5848', 4, `<g fill="url(#fhl-bunny)">${shapes}</g>`
    + circle(x + 14 * s, base - 11 * s, 4 * s, '#f4ebdf')
    + `<ellipse cx="${n(x - 2 * s)}" cy="${n(base - 6 * s)}" rx="${n(7 * s)}" ry="${n(4 * s)}" fill="#d9c8b4"/>`
    + `<ellipse cx="${n(x - 9 * s)}" cy="${n(base - 32 * s)}" rx="${n(1.3 * s)}" ry="${n(6.5 * s)}" fill="#f2b8a8" transform="rotate(-12 ${p(-9, -33)})"/>`
    + circle(x - 12 * s, base - 22 * s, 1.8 * s, '#221613')
    + circle(x - 12.6 * s, base - 22.7 * s, 0.6 * s, '#ffffff')
    + circle(x - 15.6 * s, base - 19 * s, 1.2 * s, '#c97a6a'));
}

const SCENE_DEFS = `<defs>
<linearGradient id="fhl-meadow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a6dd78"/><stop offset=".35" stop-color="#8dcf63"/><stop offset="1" stop-color="#5ea646"/></linearGradient>
<linearGradient id="fhl-fir" x1="0" y1="0" x2="1" y2=".25"><stop offset="0" stop-color="#4f9a5e"/><stop offset=".5" stop-color="#2f7a48"/><stop offset="1" stop-color="#1d5230"/></linearGradient>
<linearGradient id="fhl-trunk" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#a8744a"/><stop offset=".45" stop-color="#8a5a34"/><stop offset="1" stop-color="#5e3a20"/></linearGradient>
<radialGradient id="fhl-leaf" cx=".36" cy=".3" r=".75"><stop offset="0" stop-color="#86d36a"/><stop offset=".5" stop-color="#3f9a45"/><stop offset="1" stop-color="#2b7238"/></radialGradient>
<radialGradient id="fhl-bush" cx=".36" cy=".3" r=".75"><stop offset="0" stop-color="#86d36a"/><stop offset=".55" stop-color="#4fae4c"/><stop offset="1" stop-color="#2f7a36"/></radialGradient>
<linearGradient id="fhl-stump" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#d0a06a"/><stop offset=".5" stop-color="#b98a56"/><stop offset="1" stop-color="#8a6038"/></linearGradient>
<radialGradient id="fhl-cap" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ff8a74"/><stop offset=".6" stop-color="#d8574a"/><stop offset="1" stop-color="#a8352c"/></radialGradient>
<radialGradient id="fhl-rock" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#c6ced6"/><stop offset=".55" stop-color="#9aa3ad"/><stop offset="1" stop-color="#6d7783"/></radialGradient>
<radialGradient id="fhl-bunny" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#d9c8b4"/><stop offset=".6" stop-color="#b8a48f"/><stop offset="1" stop-color="#8c7763"/></radialGradient>
<linearGradient id="fhl-path" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ddc08a"/><stop offset="1" stop-color="#c9a56b"/></linearGradient>
</defs>`;

const HORIZON = 466;

/** Тропинка: середина и полуширина на высоте y (от края поляны до низа). */
function pathAt(y) {
  const t = clamp01((y - HORIZON) / (720 - HORIZON));
  return { x: 1250 - 250 * t - 60 * Math.sin(t * Math.PI), half: 8 + 105 * t * t };
}

function sceneSvg() {
  const r = rng(7);
  let s = SCENE_DEFS;
  // дальние холмы в дымке
  s += '<path d="M0 420C180 370 360 392 520 404C700 418 820 362 1010 372C1180 380 1300 404 1460 386C1530 378 1570 382 1600 388L1600 480L0 480Z" fill="#b8ddc6"/>';
  s += '<path d="M0 440C160 412 300 424 470 430C640 436 760 410 930 418C1110 426 1260 434 1420 422C1500 416 1560 420 1600 424L1600 480L0 480Z" fill="#a2d1ae"/>';
  // дальний край леса за поляной
  let far = '';
  let farLit = '';
  for (let x = -10; x < 1620; x += 24 + r() * 20) {
    const h = 52 + r() * 46;
    const base = HORIZON + 4 + r() * 4;
    if (r() < 0.45) {
      const w = h * 0.34;
      far += `<path d="M${n(x)} ${n(base - h)}L${n(x + w)} ${n(base)}L${n(x - w)} ${n(base)}Z"/>`;
      farLit += `<path d="M${n(x)} ${n(base - h)}L${n(x - w * 0.55)} ${n(base - h * 0.42)}L${n(x - w * 0.1)} ${n(base - h * 0.5)}Z"/>`;
    } else {
      const rr = h * 0.4;
      far += circle(x, base - rr * 1.15, rr) + `<rect x="${n(x - 3)}" y="${n(base - rr)}" width="6" height="${n(rr)}"/>`;
      farLit += circle(x - rr * 0.28, base - rr * 1.4, rr * 0.5);
    }
  }
  far += `<rect x="-20" y="${HORIZON - 14}" width="1640" height="22"/>`;
  s += outlined(far, '#4f8f5a', 5, `<g fill="#6fae6c">${far}</g><g fill="#86c27d">${farLit}</g>`);
  // поляна
  s += `<path d="M0 ${HORIZON + 2}C300 ${HORIZON - 6} 520 ${HORIZON + 6} 800 ${HORIZON}C1080 ${HORIZON - 6} 1300 ${HORIZON + 4} 1600 ${HORIZON - 2}L1600 720L0 720Z" fill="url(#fhl-meadow)"/>`;
  s += `<path d="M0 ${HORIZON + 2}C300 ${HORIZON - 6} 520 ${HORIZON + 6} 800 ${HORIZON}C1080 ${HORIZON - 6} 1300 ${HORIZON + 4} 1600 ${HORIZON - 2}L1600 ${HORIZON + 16}L0 ${HORIZON + 16}Z" fill="#4f8f3e" opacity=".35"/>`;
  // пятна травы — дальше мельче и площе
  for (let i = 0; i < 28; i++) {
    const y = HORIZON + 16 + r() ** 1.3 * 230;
    const k = (y - HORIZON) / 254;
    const rx = (34 + r() * 50) * (0.4 + k);
    s += `<ellipse cx="${n(r() * 1600)}" cy="${n(y)}" rx="${n(rx)}" ry="${n(rx * 0.2)}" fill="${r() < 0.5 ? '#b5e589' : '#6cb54f'}" opacity=".5"/>`;
  }
  // тропинка к лесу
  let left = '';
  let right = '';
  for (let y = HORIZON + 2; y <= 724; y += 8) {
    const { x, half } = pathAt(y);
    left += `${left ? 'L' : 'M'}${n(x - half)} ${n(y)}`;
    right = `L${n(x + half)} ${n(y)}${right}`;
  }
  s += `<path d="${left}${right}Z" fill="url(#fhl-path)" stroke="#a9844f" stroke-width="3" stroke-linejoin="round"/>`;
  for (let i = 0; i < 10; i++) {
    const y = HORIZON + 30 + r() * 220;
    const { x, half } = pathAt(y);
    const k = (y - HORIZON) / 254;
    s += `<ellipse cx="${n(x + (r() - 0.5) * half * 1.2)}" cy="${n(y)}" rx="${n(3 + 6 * k)}" ry="${n(1.6 + 3 * k)}" fill="${r() < 0.5 ? '#b39260' : '#ead3a2'}"/>`;
  }
  // цветы на поляне
  const flowers = [['#fff3a0', '#c9a43a'], ['#ff9fb5', '#c45a74'], ['#ffffff', '#9aa8b8']];
  for (let i = 0; i < 80; i++) {
    const y = HORIZON + 14 + r() ** 0.8 * 236;
    const x = r() * 1600;
    const p = pathAt(y);
    if (Math.abs(x - p.x) < p.half + 10) continue;
    const [fill, line] = flowers[Math.floor(r() * flowers.length)];
    const rad = 2 + ((y - HORIZON) / 254) * 5;
    s += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(rad)}" fill="${fill}" stroke="${line}" stroke-width="1.2"/>${circle(x, y, rad * 0.38, '#f2b632')}`;
  }
  // края леса: слева и справа густо, тень чащи за стволами
  s += '<path d="M-30 90C60 70 170 96 260 140C350 186 410 270 450 360C470 420 478 470 482 506Q420 530 360 512Q280 532 200 516Q100 534 -30 518Z" fill="#1f5a32"/>';
  s += '<path d="M1630 80C1540 66 1430 96 1340 140C1250 186 1190 270 1150 360C1130 420 1122 470 1118 506Q1180 530 1240 512Q1320 532 1400 516Q1500 534 1630 518Z" fill="#1f5a32"/>';
  s += fir(1310, 504, 350, 92) + fir(300, 504, 370, 96);
  s += leafy(1222, 508, 372, 70) + leafy(392, 508, 362, 72);
  s += fir(40, 512, 500, 130) + fir(1566, 512, 490, 126);
  s += leafy(178, 516, 236, 124) + leafy(1436, 516, 246, 128);
  s += bush(352, 530, 44, r) + bush(452, 524, 34, r) + bush(1168, 524, 36, r) + bush(1262, 532, 46, r);
  // ближние вещи: пень с мухоморами, камень, кролик
  // (низ кадра закрывает трава — всё ближнее стоит не ниже ~620)
  s += stump(236, 604, 34, 52) + toadstool(296, 616, 1.25) + toadstool(318, 620, 0.85);
  s += rock(1470, 650, 1.5) + rabbit(1330, 556, 1.15);
  return `<svg class="fh-load-scene" viewBox="0 0 1600 720" preserveAspectRatio="xMidYMax slice" aria-hidden="true">${s}</svg>`;
}

/** Полоса травы у нижнего края; front — ближняя (выше и темнее). */
function grassSvg(front) {
  const r = rng(front ? 23 : 11);
  const H = 158.4;
  const colors = front ? ['#4f9a3e', '#3f8238', '#5ea646'] : ['#6fbb52', '#5ea646', '#7cc45a'];
  let blades = '';
  const fills = colors.map(() => []);
  for (let x = -12; x < 1612; x += front ? 10 + r() * 14 : 7 + r() * 8) {
    const h = front ? 34 + r() * 70 : 28 + r() * 52;
    const lean = (r() - 0.5) * (front ? 34 : 24);
    const w = front ? 8 + r() * 6 : 6 + r() * 5;
    const d = `M${n(x)} ${H + 2}Q${n(x + lean * 0.3)} ${n(H - h * 0.55)} ${n(x + lean + w * 0.4)} ${n(H - h)}`
      + `Q${n(x + w * 0.6 + lean * 0.35)} ${n(H - h * 0.5)} ${n(x + w)} ${H + 2}Z`;
    blades += `<path d="${d}"/>`;
    fills[Math.floor(r() * colors.length)].push(`<path d="${d}"/>`);
  }
  let extra = '';
  if (front) {
    // несколько цветков на стебельках
    for (const [x, h, c] of [[140, 92, '#fff3a0'], [610, 80, '#ff9fb5'], [1030, 96, '#ffffff'], [1470, 86, '#fff3a0']]) {
      extra += `<path d="M${x} ${H}Q${x - 6} ${n(H - h * 0.5)} ${x + 2} ${n(H - h)}" fill="none" stroke="#2f6a2c" stroke-width="5"/>`
        + `<path d="M${x} ${H}Q${x - 6} ${n(H - h * 0.5)} ${x + 2} ${n(H - h)}" fill="none" stroke="#5ea646" stroke-width="2.4"/>`;
      for (let a = 0; a < 5; a++) {
        const ang = (a / 5) * Math.PI * 2 - Math.PI / 2;
        extra += `<circle cx="${n(x + 2 + Math.cos(ang) * 6)}" cy="${n(H - h + Math.sin(ang) * 6)}" r="5.2" fill="${c}" stroke="#7a5a3a" stroke-width="1.4"/>`;
      }
      extra += circle(x + 2, H - h, 3.6, '#f2b632');
    }
  }
  const body = fills.map((list, i) => `<g fill="${colors[i]}">${list.join('')}</g>`).join('');
  return `<svg class="fh-load-grass${front ? ' fh-load-grass--front' : ''}" viewBox="0 0 1600 ${H}" preserveAspectRatio="xMidYMax slice" aria-hidden="true">`
    + `${outlined(blades, '#2f6a2c', 3.4, body)}${extra}</svg>`;
}

function cloudSvg(defs) {
  const balls = [[40, 60, 24], [76, 44, 32], [120, 38, 37], [160, 52, 28], [190, 63, 18]]
    .map(([x, y, rr]) => circle(x, y, rr)).join('') + '<rect x="30" y="56" width="168" height="26" rx="13"/>';
  // краска облака одна на все три (id в документе не повторяется)
  const grad = defs ? '<defs><linearGradient id="fhl-cloud" gradientUnits="userSpaceOnUse" x1="0" y1="10" x2="0" y2="84">'
    + '<stop offset="0" stop-color="#ffffff"/><stop offset=".62" stop-color="#ffffff"/><stop offset="1" stop-color="#d7eaf4"/></linearGradient></defs>' : '';
  return `<svg viewBox="0 0 220 90" aria-hidden="true">${grad}${outlined(balls, '#b4d3e4', 5, `<g fill="url(#fhl-cloud)">${balls}</g>`)}</svg>`;
}

/** Мордочка лисы на конце полосы (краски — 05-palette: шерсть, светлое, тёмные кончики ушей). */
const FOX_SVG = '<svg class="fh-load-fox" viewBox="-20 -22 40 40" aria-hidden="true"><defs>'
  + '<radialGradient id="fhl-fur" cx=".34" cy=".26" r=".85"><stop offset="0" stop-color="#ffb057"/><stop offset=".55" stop-color="#f0862b"/><stop offset="1" stop-color="#c4601a"/></radialGradient>'
  + '<linearGradient id="fhl-ear" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a2a1c"/><stop offset=".34" stop-color="#4a2a1c"/><stop offset=".35" stop-color="#f0862b"/><stop offset="1" stop-color="#e07624"/></linearGradient>'
  + '<linearGradient id="fhl-cream" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff1dc"/><stop offset="1" stop-color="#e8cfae"/></linearGradient></defs>'
  + '<g stroke="#6e3412" stroke-width="1.8" stroke-linejoin="round">'
  + '<path d="M-15.5 -5C-17.5 -12 -16.5 -18 -13.5 -20.5C-9.5 -18.5 -5.5 -14.5 -3.5 -11.5Z" fill="url(#fhl-ear)"/>'
  + '<path d="M15.5 -5C17.5 -12 16.5 -18 13.5 -20.5C9.5 -18.5 5.5 -14.5 3.5 -11.5Z" fill="url(#fhl-ear)"/>'
  + '<path d="M-16 -5C-16 -11.5 -10 -13 0 -13C10 -13 16 -11.5 16 -5C16 2.5 9 9 0 15C-9 9 -16 2.5 -16 -5Z" fill="url(#fhl-fur)"/></g>'
  + '<path d="M-12.5 -9C-13 -12 -12.6 -14.5 -12 -16C-9.8 -14.5 -8.2 -13 -7.4 -11.5Z" fill="#f6a98a"/>'
  + '<path d="M12.5 -9C13 -12 12.6 -14.5 12 -16C9.8 -14.5 8.2 -13 7.4 -11.5Z" fill="#f6a98a"/>'
  + '<path d="M-15.6 -2.5Q-8 0.5 -3 1.2Q0 -0.8 3 1.2Q8 0.5 15.6 -2.5C14.6 4 8.8 9.6 0 15C-8.8 9.6 -14.6 4 -15.6 -2.5Z" fill="url(#fhl-cream)"/>'
  + '<path d="M-16 -5C-16 -11.5 -10 -13 0 -13C10 -13 16 -11.5 16 -5C16 2.5 9 9 0 15C-9 9 -16 2.5 -16 -5Z" fill="none" stroke="#6e3412" stroke-width="1.8" stroke-linejoin="round"/>'
  + '<ellipse cx="-6.4" cy="-4.2" rx="2.3" ry="2.9" fill="#221613"/><ellipse cx="6.4" cy="-4.2" rx="2.3" ry="2.9" fill="#221613"/>'
  + '<circle cx="-7.2" cy="-5.3" r=".9" fill="#ffffff"/><circle cx="5.6" cy="-5.3" r=".9" fill="#ffffff"/>'
  + '<ellipse cx="-10" cy="1.6" rx="2.2" ry="1.2" fill="#f6a98a" opacity=".55"/><ellipse cx="10" cy="1.6" rx="2.2" ry="1.2" fill="#f6a98a" opacity=".55"/>'
  + '<path d="M-2.7 9.6Q0 8.6 2.7 9.6Q1.7 12.8 0 13.2Q-1.7 12.8 -2.7 9.6Z" fill="#2a1a16"/>'
  + '<ellipse cx="-.8" cy="10" rx=".9" ry=".5" fill="#ffffff" opacity=".7"/></svg>';

// бабочка: два крыла (каждое машет само), тельце рисует CSS
const WING = '<svg viewBox="0 0 10 16" aria-hidden="true"><g stroke="#5a3a1e" stroke-width=".9" stroke-linejoin="round">'
  + '<path d="M10 7.4C6 -.5 -.4 .2 .8 5.2C1.4 8 6 8.6 10 8.2Z"/><path d="M10 8.8C6.4 9.2 2.6 11.6 4 14.6C5.4 16.2 8.6 13.2 10 9.6Z"/></g>'
  + '<circle cx="4.2" cy="4.6" r="1.3" fill="#ffffff" opacity=".75"/></svg>';

let scene = null;            // разметка опушки собирается один раз
function sceneMarkup() {
  if (scene) return scene;
  // облака: верх и ширина (доли экрана), с какого места пути (задержка) и сколько идут через весь экран
  const clouds = [[5, 21, -60, 150], [14, 16, -18, 120], [24, 12, -72, 100]]
    .map(([top, w, delay, time], i) => `<div class="fh-load-cloud" style="--y:${top}%;--w:${w}%;--span:${n((100 / w) * 100)}%;--t:${time}s;--d:${delay}s">${cloudSvg(i === 0)}</div>`)
    .join('');
  const r = rng(31);
  let air = '';
  for (let i = 0; i < 12; i++) {
    air += `<i style="--x:${n(6 + r() * 88)}%;--y:${n(40 + r() * 50)}%;--t:${n(7 + r() * 6)}s;--d:${n(-r() * 12)}s"></i>`;
  }
  const flies = [['#ffd24a', 7, 64, 13, -2], ['#ff9fb5', 86, 58, 16, -9]]
    .map(([c, x, y, t, d]) => `<div class="fh-load-bfly" style="--c:${c};--x:${x}%;--y:${y}%;--t:${t}s;--d:${d}s"><i>${WING}</i><i>${WING}</i></div>`)
    .join('');
  scene = '<div class="fh-load-sky"></div><div class="fh-load-sun"><i></i></div>'
    + clouds + sceneSvg() + '<div class="fh-load-light"></div>'
    + `<div class="fh-load-air">${air}</div>${flies}`
    + '<div class="fh-load-stand"><i class="fh-load-pole"></i><i class="fh-load-pole fh-load-pole--r"></i>'
    + '<div class="fh-load-sign"><span class="fh-load-word">Лисья охота</span></div>'
    + '<div class="fh-load-plank"><div class="fh-load-groove"><i class="fh-load-fill"></i></div>'
    + `<div class="fh-load-run">${FOX_SVG}</div><b class="fh-load-pct">0%</b></div>`
    + '<p class="fh-load-say"></p></div>'
    + grassSvg(false) + grassSvg(true);
  return scene;
}

// ---------- заставка ----------

let cur = null;              // показанная сейчас заставка

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// кадр с новой полосой успел нарисоваться: requestAnimationFrame, потом задача после отрисовки (свёрнутое окно
// кадров не даёт — страхует таймер)
const afterPaint = () => new Promise((resolve) => {
  const t = setTimeout(resolve, 100);
  requestAnimationFrame(() => setTimeout(() => {
    clearTimeout(t);
    resolve();
  }, 0));
});

function cover() {
  const root = document.createElement('div');
  root.className = 'fh-load';
  root.dataset.game = 'fox-hunt';
  root.setAttribute('role', 'progressbar');
  root.setAttribute('aria-label', 'Загрузка');
  root.setAttribute('aria-valuemin', '0');
  root.setAttribute('aria-valuemax', '100');
  root.innerHTML = sceneMarkup();
  const fill = root.querySelector('.fh-load-fill');
  const run = root.querySelector('.fh-load-run');
  const pct = root.querySelector('.fh-load-pct');
  const say = root.querySelector('.fh-load-say');

  let prep = null;
  let shown = -1;
  let gone = false;

  function paint() {
    const p = barOf(got / FILES.length, prep);
    if (gone || p <= shown) return;
    shown = p;
    const move = `translateX(${n((p - 1) * 100)}%)`;
    fill.style.transform = move;
    run.style.transform = move;
    const percent = `${Math.round(p * 100)}%`;
    if (pct.textContent !== percent) pct.textContent = percent;
    const text = sayOf(p);
    if (say.textContent !== text) say.textContent = text;
    root.setAttribute('aria-valuenow', String(Math.round(p * 100)));
  }

  // солнце стоит в точке опушки (1300, 130), а опушка вписана «по низу» — где оно на экране, считаем по размеру;
  // там же — масштаб вывески (--fh-lz): вывеска свёрстана под экран ~640×330
  function place(w, h) {
    if (!(w > 0) || !(h > 0)) return;
    const s = Math.max(w / 1600, h / 720);
    root.style.setProperty('--fh-ls', String(n(s * 100) / 100));
    root.style.setProperty('--fh-sun-x', `${n(w / 2 + (1300 - 800) * s)}px`);
    root.style.setProperty('--fh-sun-y', `${n(h - (720 - 130) * s)}px`);
    const z = Math.min(1.6, Math.max(0.7, Math.min(h / 330, w / 640)));
    root.style.setProperty('--fh-lz', String(Math.round(z * 100) / 100));
  }
  const watch = typeof ResizeObserver === 'function'
    ? new ResizeObserver(([e]) => place(e.contentRect.width, e.contentRect.height))
    : null;
  watch?.observe(root);
  if (!watch) requestAnimationFrame(() => place(root.clientWidth, root.clientHeight));

  // буквы вывески — шрифтом игры: пока он не пришёл, надписи не видны (без прыжка с запасного шрифта)
  let fontDone = false;
  const fontReady = () => {
    if (fontDone || gone) return;
    fontDone = true;
    root.classList.add('fh-load--font');
  };
  setTimeout(fontReady, FONT_WAIT_MS);
  Promise.resolve(document.fonts?.load?.('800 34px Podkova', 'Лисья охота 0%')).then(fontReady, fontReady);

  const onFile = () => paint();
  listeners.add(onFile);
  paint();
  preload();

  function stop() {
    gone = true;
    listeners.delete(onFile);
    watch?.disconnect();
  }

  return {
    root,
    stop,
    live: () => !gone && root.isConnected,
    step(f) {
      prep = Math.max(prep ?? 0, clamp01(f));
      paint();
    },
    async done() {
      prep = 1;
      paint();
      if (reducedMotion()) {
        stop();
        root.remove();
        return;
      }
      await wait(BAR_MS + 80);
      if (gone) return;
      root.classList.add('fh-load--out');
      await wait(OUT_MS);
      stop();
      root.remove();
    },
  };
}

/** Показать заставку (зовёт оболочка): элемент, который она кладёт в экран игры. */
export function show() {
  cur?.stop();
  cur = cover();
  return cur.root;
}

/** Полоса для init игры. Без заставки (страницы проверки, тесты) всё сразу и молча. */
export const loading = {
  /** Подготовка дошла до доли f (0…1); ждёт, пока кадр с полосой нарисуется. */
  step(f) {
    if (!cur?.live()) return Promise.resolve();
    cur.step(f);
    return afterPaint();
  },
  /** Полоса до конца, заставка тает и уходит; промис — когда её уже нет. */
  async done() {
    const c = cur;
    if (!c?.live()) return;
    await c.done();
    if (cur === c) cur = null;
  },
};

export default { show };
