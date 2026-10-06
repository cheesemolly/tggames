// Отрисовка бильярда на Canvas.
// Стол рисуется один раз в закадровый холст (дерево с волокнами, сукно с ворсом и светом лампы, резина бортов,
// лузы, «бриллианты» на бортах) и в кадре кладётся одной картинкой. Шары — «настоящие»: у каждого своя маленькая
// картинка, которая пересчитывается по точкам (sphere.js), когда шар поворачивается, — видно, как он катится
// и вертится. В кадре — только готовые картинки и линии: без теней-размытий и градиентов.

import { W, L, R, D, POCKETS, RAILS, JAWS, HEAD_Y, HEAD_SPOT, FOOT_SPOT } from './physics.js';
import { shade } from './sphere.js';

const CUSHION = 4.4;                 // см: от кромки резины до дерева
const WOOD = 6.4;                    // см: ширина деревянного борта
export const BORDER = CUSHION + WOOD;
const CUE_LEN = 118;                 // см: видимая длина кия
const TIP_GAP = 0.9;                 // см: от наклейки до шара в покое

/**
 * Скины стола: сукно, резина (то же сукно темнее), дерево, окантовка луз, «бриллианты», линии прицела.
 * telegram — цвета подставляются из темы (fromTheme).
 */
export const SKINS = {
  green: { cloth: '#1f7a4d', cushion: '#17603c', wood: '#7a4a25', woodDark: '#4e2d14', liner: '#2a1d14', sight: '#f1e3c0', guide: '#ffffff', glow: '#fff2b8' },
  blue: { cloth: '#1f5fa8', cushion: '#184b86', wood: '#3a3a40', woodDark: '#1e1e22', liner: '#111114', sight: '#e9edf5', guide: '#ffffff', glow: '#cfe3ff' },
  wine: { cloth: '#8c2637', cushion: '#6f1d2b', wood: '#5a3018', woodDark: '#34190b', liner: '#1f120b', sight: '#f3dfb2', guide: '#ffffff', glow: '#ffd9c2' },
  night: { cloth: '#39424f', cushion: '#2b323c', wood: '#17191d', woodDark: '#08090b', liner: '#000000', sight: '#7fd6ff', guide: '#9fe3ff', glow: '#7fd6ff' },
  telegram: null,
};
export const SKIN_IDS = Object.keys(SKINS);

function hex(c) {
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
  if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
  const rgb = /rgba?\(([^)]+)\)/.exec(c);
  if (rgb) return rgb[1].split(',').slice(0, 3).map((v) => Number.parseFloat(v));
  return [128, 128, 128];
}
const css = (c) => `rgb(${c.map((v) => Math.round(Math.max(0, Math.min(255, v)))).join(',')})`;
const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
/** Затемнить (k < 0) или осветлить (k > 0) цвет. */
const tone = (c, k) => css(mix(hex(c), k < 0 ? [0, 0, 0] : [255, 255, 255], Math.abs(k)));
const alpha = (c, a) => `rgba(${hex(c).map((v) => Math.round(v)).join(',')},${a})`;

/** Скин «Как в Telegram»: сукно — цвет кнопок темы, приглушённый фоном; дерево — из фона и текста. */
export function fromTheme(el) {
  const st = getComputedStyle(el);
  const v = (name, fallback) => st.getPropertyValue(name).trim() || fallback;
  const button = hex(v('--tg-theme-button-color', '#2481cc'));
  const bg = hex(v('--tg-theme-bg-color', '#ffffff'));
  const text = hex(v('--tg-theme-text-color', '#000000'));
  const second = hex(v('--tg-theme-secondary-bg-color', '#efeff3'));
  const cloth = mix(mix(button, [40, 40, 40], 0.35), bg, 0.12);
  return {
    cloth: css(cloth), cushion: css(mix(cloth, [0, 0, 0], 0.22)),
    wood: css(mix(second, text, 0.35)), woodDark: css(mix(second, text, 0.6)),
    liner: css(mix(text, [0, 0, 0], 0.6)), sight: css(mix(bg, [255, 255, 255], 0.5)), guide: '#ffffff', glow: css(mix(button, [255, 255, 255], 0.5)),
  };
}

/** Генератор для волокон дерева и ворса: стол на вид всегда один и тот же. */
function noise(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let pal = SKINS.green;
  let cw = 0;
  let ch = 0;
  let dpr = 1;
  let scale = 1;                     // пикселей CSS на сантиметр
  let ox = 0;                        // левый верхний угол сукна в пикселях CSS
  let oy = 0;
  let tableSprite = null;
  let shadowSprite = null;
  let cueSprite = null;
  let digits = null;
  const balls = [];                  // { canvas, ctx, image, key }

  const sprite = (w, h) => {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
  };

  /** Картинки номеров 1–15: прозрачность цифры по точкам (для sphere.js). */
  function buildDigits() {
    const size = 44;
    const c = sprite(size, size);
    const g = c.getContext('2d', { willReadFrequently: true });
    digits = [null];
    for (let id = 1; id <= 15; id++) {
      g.clearRect(0, 0, size, size);
      g.fillStyle = '#000';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `900 ${id > 9 ? 22 : 27}px "Arial Black", Arial, Helvetica, sans-serif`;
      g.fillText(String(id), size / 2, size / 2 + 2);
      // шестёрку и девятку различают чертой снизу
      if (id === 6 || id === 9) g.fillRect(size / 2 - 7, size - 8, 14, 3);
      const px = g.getImageData(0, 0, size, size).data;
      const a = new Uint8Array(size * size);
      for (let k = 0; k < a.length; k++) a[k] = px[k * 4 + 3];
      digits.push({ size, alpha: a });
    }
  }

  // ---------- стол ----------

  function buildTable() {
    tableSprite = sprite(cw * dpr, ch * dpr);
    const g = tableSprite.getContext('2d');
    // дальше — в сантиметрах стола
    g.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);
    const rnd = noise(7);
    const B = BORDER;

    // тень стола на полу
    g.fillStyle = 'rgba(0,0,0,0.28)';
    roundRect(g, -B + 1.2, -B + 2, W + 2 * B, L + 2 * B, 8);
    g.fill();

    // дерево
    const wood = g.createLinearGradient(-B, 0, W + B, 0);
    wood.addColorStop(0, tone(pal.wood, 0.1));
    wood.addColorStop(0.5, pal.wood);
    wood.addColorStop(1, tone(pal.wood, -0.18));
    g.fillStyle = wood;
    roundRect(g, -B, -B, W + 2 * B, L + 2 * B, 7);
    g.fill();
    g.save();
    g.clip();
    // волокна: длинные тонкие штрихи вдоль каждого борта
    g.lineCap = 'round';
    for (let k = 0; k < 420; k++) {
      const vertical = k % 2 === 0;
      const dark = rnd() < 0.6;
      g.strokeStyle = dark ? alpha(pal.woodDark, 0.1 + rnd() * 0.22) : `rgba(255,255,255,${0.03 + rnd() * 0.07})`;
      g.lineWidth = 0.08 + rnd() * 0.3;
      const len = 14 + rnd() * 70;
      g.beginPath();
      if (vertical) {
        const x = (rnd() < 0.5 ? -B : W + CUSHION) + rnd() * WOOD;
        const y = -B + rnd() * (L + 2 * B);
        g.moveTo(x, y);
        g.bezierCurveTo(x + (rnd() - 0.5) * 0.8, y + len / 3, x + (rnd() - 0.5) * 0.8, y + (2 * len) / 3, x + (rnd() - 0.5) * 0.5, y + len);
      } else {
        const y = (rnd() < 0.5 ? -B : L + CUSHION) + rnd() * WOOD;
        const x = -B + rnd() * (W + 2 * B);
        g.moveTo(x, y);
        g.bezierCurveTo(x + len / 3, y + (rnd() - 0.5) * 0.8, x + (2 * len) / 3, y + (rnd() - 0.5) * 0.8, x + len, y + (rnd() - 0.5) * 0.5);
      }
      g.stroke();
    }
    g.restore();
    // фаска: свет сверху слева, тень снизу справа
    g.lineWidth = 0.5;
    g.strokeStyle = 'rgba(255,255,255,0.22)';
    roundRect(g, -B + 0.4, -B + 0.4, W + 2 * B - 0.8, L + 2 * B - 0.8, 6.6);
    g.stroke();
    g.strokeStyle = alpha(pal.woodDark, 0.9);
    g.lineWidth = 0.7;
    roundRect(g, -B, -B, W + 2 * B, L + 2 * B, 7);
    g.stroke();

    // окантовка луз — тёмные «чашки» в дереве
    for (const p of POCKETS) {
      const out = p.corner ? 1.6 : 2.2;
      const cx = p.x + Math.sign(p.x - W / 2) * (p.corner ? out : out);
      const cy = p.corner ? p.y + Math.sign(p.y - L / 2) * out : p.y;
      const cup = g.createRadialGradient(cx, cy, p.r * 0.5, cx, cy, p.r + 3.4);
      cup.addColorStop(0, pal.liner);
      cup.addColorStop(0.8, tone(pal.liner, 0.12));
      cup.addColorStop(1, tone(pal.liner, -0.3));
      g.fillStyle = cup;
      g.beginPath();
      g.arc(cx, cy, p.r + 3.2, 0, Math.PI * 2);
      g.fill();
    }

    // сукно: под резиной тоже
    g.fillStyle = pal.cloth;
    g.fillRect(-CUSHION, -CUSHION, W + 2 * CUSHION, L + 2 * CUSHION);
    // свет лампы над серединой и тень по краям
    const lamp = g.createRadialGradient(W / 2, L / 2, 10, W / 2, L / 2, L * 0.62);
    lamp.addColorStop(0, 'rgba(255,255,255,0.13)');
    lamp.addColorStop(0.55, 'rgba(255,255,255,0.02)');
    lamp.addColorStop(1, 'rgba(0,0,0,0.3)');
    g.fillStyle = lamp;
    g.fillRect(-CUSHION, -CUSHION, W + 2 * CUSHION, L + 2 * CUSHION);
    // ворс
    for (let k = 0; k < 9000; k++) {
      g.fillStyle = rnd() < 0.5 ? `rgba(255,255,255,${0.02 + rnd() * 0.035})` : `rgba(0,0,0,${0.03 + rnd() * 0.05})`;
      const s = 0.1 + rnd() * 0.22;
      g.fillRect(rnd() * W, rnd() * L, s, s * (0.6 + rnd()));
    }

    // разметка: линия «дома» и отметки
    g.strokeStyle = 'rgba(255,255,255,0.13)';
    g.lineWidth = 0.22;
    g.beginPath();
    g.moveTo(0, HEAD_Y);
    g.lineTo(W, HEAD_Y);
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.3)';
    for (const [sx, sy] of [HEAD_SPOT, FOOT_SPOT, [W / 2, L / 2]]) {
      g.beginPath();
      g.arc(sx, sy, 0.45, 0, Math.PI * 2);
      g.fill();
    }

    // тень резины на сукне — узкая полоска вдоль каждого борта
    for (const s of RAILS) {
      const shade = g.createLinearGradient(s.ax, s.ay, s.ax + s.nx * 2.2, s.ay + s.ny * 2.2);
      shade.addColorStop(0, 'rgba(0,0,0,0.34)');
      shade.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = shade;
      g.beginPath();
      g.moveTo(s.ax, s.ay);
      g.lineTo(s.bx, s.by);
      g.lineTo(s.bx + s.nx * 2.2, s.by + s.ny * 2.2);
      g.lineTo(s.ax + s.nx * 2.2, s.ay + s.ny * 2.2);
      g.closePath();
      g.fill();
    }

    // резина: от кромки до дерева, со скосами губок у луз
    RAILS.forEach((s, k) => {
      const back = (jaw) => {
        const t = CUSHION / -(jaw.sx * s.nx + jaw.sy * s.ny);
        return [jaw.ax + jaw.sx * t, jaw.ay + jaw.sy * t];
      };
      const a = back(JAWS[k * 2]);
      const b = back(JAWS[k * 2 + 1]);
      const body = g.createLinearGradient(s.ax, s.ay, s.ax - s.nx * CUSHION, s.ay - s.ny * CUSHION);
      body.addColorStop(0, tone(pal.cushion, 0.16));
      body.addColorStop(0.25, pal.cushion);
      body.addColorStop(1, tone(pal.cushion, -0.28));
      g.fillStyle = body;
      g.beginPath();
      g.moveTo(s.ax, s.ay);
      g.lineTo(s.bx, s.by);
      g.lineTo(b[0], b[1]);
      g.lineTo(a[0], a[1]);
      g.closePath();
      g.fill();
      // блик по кромке
      g.strokeStyle = 'rgba(255,255,255,0.2)';
      g.lineWidth = 0.28;
      g.beginPath();
      g.moveTo(s.ax, s.ay);
      g.lineTo(s.bx, s.by);
      g.stroke();
      // стык с деревом
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.lineWidth = 0.3;
      g.beginPath();
      g.moveTo(a[0], a[1]);
      g.lineTo(b[0], b[1]);
      g.stroke();
    });

    // сами лузы — чёрные, с едва заметным дном
    for (const p of POCKETS) {
      const hole = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      hole.addColorStop(0, '#000');
      hole.addColorStop(0.7, '#050505');
      hole.addColorStop(1, '#1b1b1b');
      g.fillStyle = hole;
      g.beginPath();
      g.arc(p.x, p.y, p.r - 0.15, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.55)';
      g.lineWidth = 0.5;
      g.stroke();
    }

    // «бриллианты» — отметки на бортах
    const sight = (x, y, vertical) => {
      g.save();
      g.translate(x, y);
      if (vertical) g.rotate(Math.PI / 2);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.beginPath();
      g.moveTo(0.15, -0.95);
      g.lineTo(1.75, 0.2);
      g.lineTo(0.15, 1.35);
      g.lineTo(-1.45, 0.2);
      g.closePath();
      g.fill();
      g.fillStyle = pal.sight;
      g.beginPath();
      g.moveTo(0, -1.1);
      g.lineTo(1.6, 0);
      g.lineTo(0, 1.1);
      g.lineTo(-1.6, 0);
      g.closePath();
      g.fill();
      g.restore();
    };
    const mid = CUSHION + WOOD / 2;
    for (let k = 1; k <= 7; k++) {
      if (k === 4) continue;
      sight(-mid, (L * k) / 8, true);
      sight(W + mid, (L * k) / 8, true);
    }
    for (let k = 1; k <= 3; k++) {
      sight((W * k) / 4, -mid, false);
      sight((W * k) / 4, L + mid, false);
    }
  }

  function buildShadow() {
    const size = Math.ceil(R * scale * dpr * 3.4);
    shadowSprite = sprite(size, size);
    const g = shadowSprite.getContext('2d');
    const grad = g.createRadialGradient(size / 2, size / 2, size * 0.12, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(0.55, 'rgba(0,0,0,0.28)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  }

  /** Кий: наклейка, белый наконечник, светлый клён, латунное кольцо, тёмный турняк с обмоткой и вставками. */
  function buildCue() {
    const k = scale * dpr;
    const len = CUE_LEN * k;
    const h = Math.max(6, 3.4 * k);
    cueSprite = sprite(len, h);
    const g = cueSprite.getContext('2d');
    // кий сужается к наклейке: левый край — турняк, правый — наклейка
    const half = (x) => (0.62 + (1 - x / len) * 0.95) * k * 0.5 + 0.2 * k;
    const shape = () => {
      g.beginPath();
      g.moveTo(0, h / 2 - half(0));
      g.lineTo(len, h / 2 - half(len));
      g.lineTo(len, h / 2 + half(len));
      g.lineTo(0, h / 2 + half(0));
      g.closePath();
    };
    shape();
    g.save();
    g.clip();
    const part = (from, to, color) => {
      g.fillStyle = color;
      g.fillRect(len - to * k, 0, (to - from) * k + 1, h);
    };
    part(0, 0.7, '#2f6fb0');                 // наклейка в мелу
    part(0.7, 2.6, '#f2efe6');               // наконечник
    part(2.6, 68, '#e3c58c');                // клён
    part(68, 69.4, '#c9a24a');               // кольцо
    part(69.4, 88, '#3a2314');               // турняк
    part(88, 106, '#151515');                // обмотка
    part(106, 116.6, '#3a2314');
    part(116.6, CUE_LEN, '#111');            // бампер
    // вставки-«короны» на турняке
    g.fillStyle = '#d9b46a';
    for (let i = 0; i < 4; i++) {
      const x = len - (71 + i * 0.01) * k;
      g.beginPath();
      g.moveTo(x, h / 2 + (i - 1.5) * h * 0.22);
      g.lineTo(x - 13 * k, h / 2 + (i - 1.5) * h * 0.05);
      g.lineTo(x, h / 2 + (i - 1.5) * h * 0.22 + h * 0.07);
      g.closePath();
      g.fill();
    }
    // объём: свет сверху, тень снизу
    const gloss = g.createLinearGradient(0, 0, 0, h);
    gloss.addColorStop(0, 'rgba(255,255,255,0.38)');
    gloss.addColorStop(0.35, 'rgba(255,255,255,0.05)');
    gloss.addColorStop(0.7, 'rgba(0,0,0,0.12)');
    gloss.addColorStop(1, 'rgba(0,0,0,0.5)');
    g.fillStyle = gloss;
    g.fillRect(0, 0, len, h);
    g.restore();
  }

  function buildBalls() {
    const size = Math.ceil(D * scale * dpr) + 4;
    balls.length = 0;
    for (let id = 0; id < 16; id++) {
      const c = sprite(size, size);
      const g = c.getContext('2d');
      balls.push({ canvas: c, ctx: g, image: g.createImageData(size, size), key: '', size });
    }
  }

  function ballSprite(id, M) {
    const b = balls[id];
    // картинка зависит только от ориентации: шар, который не вращается, заново не считается
    const key = `${M[0].toFixed(3)},${M[1].toFixed(3)},${M[2].toFixed(3)},${M[3].toFixed(3)},${M[4].toFixed(3)},${M[5].toFixed(3)}`;
    if (key !== b.key) {
      shade(b.image.data, b.size, M, id, digits[id]);
      b.ctx.putImageData(b.image, 0, 0);
      b.key = key;
    }
    return b;
  }

  function rebuild() {
    if (!cw || !ch) return;
    buildTable();
    buildShadow();
    buildCue();
    buildBalls();
  }

  const X = (x) => ox + x * scale;
  const Y = (y) => oy + y * scale;

  // ---------- кадр ----------

  /**
   * scene: { balls: [{ x, y, on, M, drop: { pocket, k } | null, fade }], cue: { x, y, angle, pull, alpha } | null,
   *   guide: { x, y, angle, hit, level } | null, hand: { x, y, ok, t } | null, mark: [номера шаров] | null }
   */
  function draw(scene) {
    if (!tableSprite) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(tableSprite, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const rpx = R * scale;
    // тени шаров: свет слева сверху — тень вправо вниз
    const ss = rpx * 3.1;
    for (const b of scene.balls) {
      if (!b.on || b.drop) continue;
      ctx.drawImage(shadowSprite, X(b.x) + rpx * 0.28 - ss / 2, Y(b.y) + rpx * 0.36 - ss / 2, ss, ss);
    }

    // свои шары бьющего — тонким кольцом (пока целится человек)
    if (scene.mark) {
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = alpha(pal.glow, 0.55);
      for (const id of scene.mark) {
        const b = scene.balls[id];
        if (!b?.on) continue;
        ctx.beginPath();
        ctx.arc(X(b.x), Y(b.y), rpx + 2.5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    if (scene.guide) {
      // линии прицела — только по сукну: за борт не выходят
      ctx.save();
      ctx.beginPath();
      ctx.rect(X(0), Y(0), W * scale, L * scale);
      ctx.clip();
      drawGuide(scene.guide, rpx);
      ctx.restore();
    }

    for (let id = 0; id < scene.balls.length; id++) {
      const b = scene.balls[id];
      if (!b.on && !b.drop) continue;
      const s = ballSprite(id, b.M);
      const size = s.size / dpr;
      if (b.drop) {
        // шар уходит в лузу: скатывается к её центру, уменьшается и темнеет
        const p = POCKETS[b.drop.pocket];
        const k = Math.min(1, b.drop.k);
        const x = b.x + (p.x - b.x) * k;
        const y = b.y + (p.y - b.y) * k;
        const z = size * (1 - 0.4 * k);
        ctx.globalAlpha = 1 - k * k;
        ctx.drawImage(s.canvas, X(x) - z / 2, Y(y) - z / 2, z, z);
        ctx.globalAlpha = 1;
        continue;
      }
      if (b.fade != null && b.fade < 1) ctx.globalAlpha = Math.max(0, b.fade);
      ctx.drawImage(s.canvas, X(b.x) - size / 2, Y(b.y) - size / 2, size, size);
      ctx.globalAlpha = 1;
    }

    if (scene.hand) {
      // биток с руки: вращающееся пунктирное кольцо; красное — сюда ставить нельзя
      const h = scene.hand;
      ctx.save();
      ctx.translate(X(h.x), Y(h.y));
      ctx.rotate(h.t * 1.4);
      ctx.setLineDash([rpx * 0.7, rpx * 0.5]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = h.ok ? alpha(pal.glow, 0.95) : 'rgba(255,90,80,0.95)';
      ctx.beginPath();
      ctx.arc(0, 0, rpx * (1.75 + 0.12 * Math.sin(h.t * 4)), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (scene.cue) drawCue(scene.cue, rpx);
  }

  function drawGuide(gd, rpx) {
    const { hit } = gd;
    const dx = Math.cos(gd.angle);
    const dy = Math.sin(gd.angle);
    const far = hit.type === 'none' ? 400 : hit.dist;
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = alpha(pal.guide, 0.85);
    ctx.beginPath();
    ctx.moveTo(X(gd.x + dx * (R + 0.4)), Y(gd.y + dy * (R + 0.4)));
    ctx.lineTo(X(gd.x + dx * far), Y(gd.y + dy * far));
    ctx.stroke();
    if (hit.type === 'none') return;
    // «шар-призрак»: где окажется биток в момент касания
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(X(hit.x), Y(hit.y), rpx - 0.6, 0, Math.PI * 2);
    ctx.stroke();
    if (gd.level !== 'full') return;
    if (hit.type === 'ball') {
      // куда уйдёт прицельный шар (по линии центров) и куда — биток
      const cut = Math.max(0, Math.min(1, hit.cut));
      const bx = hit.x + hit.nx * D;
      const by = hit.y + hit.ny * D;
      const lo = (5 + 20 * cut) * R;
      ctx.strokeStyle = alpha(pal.guide, 0.7);
      ctx.beginPath();
      ctx.moveTo(X(bx + hit.nx * R), Y(by + hit.ny * R));
      ctx.lineTo(X(bx + hit.nx * (R + lo)), Y(by + hit.ny * (R + lo)));
      ctx.stroke();
      let tx = dx - cut * hit.nx;
      let ty = dy - cut * hit.ny;
      const tl = Math.hypot(tx, ty);
      if (tl > 0.03) {
        tx /= tl;
        ty /= tl;
        const lc = (3 + 12 * tl) * R;
        ctx.strokeStyle = alpha(pal.guide, 0.42);
        ctx.beginPath();
        ctx.moveTo(X(hit.x + tx * R), Y(hit.y + ty * R));
        ctx.lineTo(X(hit.x + tx * (R + lc)), Y(hit.y + ty * (R + lc)));
        ctx.stroke();
      }
    } else if (hit.type === 'cushion') {
      // отскок от борта — зеркально
      const dot = dx * hit.nx + dy * hit.ny;
      const rx = dx - 2 * dot * hit.nx;
      const ry = dy - 2 * dot * hit.ny;
      ctx.strokeStyle = alpha(pal.guide, 0.4);
      ctx.beginPath();
      ctx.moveTo(X(hit.x), Y(hit.y));
      ctx.lineTo(X(hit.x + rx * 9 * R), Y(hit.y + ry * 9 * R));
      ctx.stroke();
    }
  }

  function drawCue(c, rpx) {
    const h = cueSprite.height / dpr;
    const len = cueSprite.width / dpr;
    const gap = rpx + (TIP_GAP + c.pull) * scale;
    ctx.save();
    ctx.globalAlpha = c.alpha ?? 1;
    // тень кия на сукне
    ctx.translate(X(c.x) + 3, Y(c.y) + 4);
    ctx.rotate(c.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(-gap - len, -h * 0.3, len, h * 0.6);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(X(c.x), Y(c.y));
    ctx.rotate(c.angle);
    ctx.drawImage(cueSprite, -gap - len, -h / 2, len, h);
    ctx.restore();
  }

  buildDigits();

  return {
    draw,
    /** Размер холста в пикселях CSS и плотность экрана: стол вписывается целиком, с бортами. */
    resize(width, height, ratio) {
      cw = Math.max(1, Math.round(width));
      ch = Math.max(1, Math.round(height));
      dpr = ratio;
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
      scale = Math.min(cw / (W + 2 * BORDER + 2), ch / (L + 2 * BORDER + 2));
      ox = (cw - W * scale) / 2;
      oy = (ch - L * scale) / 2;
      rebuild();
    },
    setSkin(palette) {
      pal = palette;
      rebuild();
    },
    /** Точка экрана (пиксели CSS внутри холста) → сантиметры стола. */
    toTable: (px, py) => [(px - ox) / scale, (py - oy) / scale],
    toScreen: (x, y) => [X(x), Y(y)],
    get scale() { return scale; },
    get ready() { return Boolean(tableSprite); },
  };
}
