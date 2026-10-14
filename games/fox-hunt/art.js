// Рисунки «Лисьей охоты»: реестр картинок и «живых» фигур. Без DOM при импорте — холст создаётся, только когда рисуют.
//
// Картинка (sprite) рисуется один раз в заготовку нужной чёткости и потом только ставится на холст: в заготовке
// можно всё (градиенты, тени, обводки), в кадре — только drawImage.
// Фигура (rig) — существо из нескольких картинок: каждый кадр расставляет их по позе (бег, рывок, удар, испуг).
//
// Размеры — в единицах мира (клетка — 32). Точка привязки (ox, oy) — середина ступней: по ней всё стоит на земле
// и сортируется по глубине. Свет — слева сверху.
//
// Остальные файлы рисунков (art-fox.js, art-tiles.js, art-mobs.js, art-items.js) только записывают сюда свои
// картинки и фигуры (defineSprite / defineRig) — рендер о них не знает и берёт всё по ключу.
//
// Ключи: tile.<место>.<что>, prop.<место>.<что>, mob.<id>.<часть>, item.<id>, pick.<вид>, thing.<вид>, fx.<что>, ui.<что>.

const SPRITES = new Map();   // ключ → { w, h, ox, oy, pad, variants, paint }
const RIGS = new Map();      // id → { draw }

/**
 * Картинка. w, h — рамка в единицах мира; ox, oy — точка привязки внутри рамки; variants — сколько вариантов
 * (paint получает номер 0…variants−1); pad — запас по краям под обводку и сглаживание.
 * paint(g, v) рисует в единицах мира, начало координат — левый верхний угол рамки.
 */
export function defineSprite(key, { w, h, ox = w / 2, oy = h, variants = 1, pad = 1, paint }) {
  if (typeof paint !== 'function' || !(w > 0) || !(h > 0)) throw new Error(`картинка «${key}»: нужны w, h и paint`);
  SPRITES.set(key, { w, h, ox, oy, variants, pad, paint });
}

/**
 * Фигура. draw(kit, ctx, a) расставляет части через kit.part(...) в своих осях: (0, 0) — середина ступней,
 * x — вперёд по взгляду (отражение делает рендер), y — вниз. a — поза: { t, act, k, speed, z, hp, elite, flash, data }.
 */
export function defineRig(id, { draw }) {
  if (typeof draw !== 'function') throw new Error(`фигура «${id}»: нужна draw`);
  RIGS.set(id, { draw });
}

export const spriteKeys = () => [...SPRITES.keys()];
export const rigIds = () => [...RIGS.keys()];
export const hasSprite = (key) => SPRITES.has(key);
export const hasRig = (id) => RIGS.has(id);
export const spriteDef = (key) => SPRITES.get(key) ?? null;

const domCanvas = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

/**
 * Набор заготовок чёткости k (точек холста на единицу мира). makeCanvas(w, h) — откуда брать холсты
 * (в тестах — поддельные). Все координаты у put / rig — в точках холста: рендер сам считает, где что стоит.
 */
export function createArt(k, makeCanvas = domCanvas) {
  const cache = new Map();     // ключ → [заготовка по номеру варианта]
  const white = new Map();     // ключ → [белый силуэт] — вспышка при ударе

  // куда и как рендер поставил фигуру: части считаются от этого
  let cx = 0;
  let cy = 0;
  let face = 1;
  let flash = 0;
  let gx = 1;                               // общий масштаб фигуры (a.sx, a.sy) вокруг ступней: приседание, взлёт
  let gy = 1;

  function bake(key, variant) {
    const def = SPRITES.get(key);
    if (!def) return null;
    const v = ((variant % def.variants) + def.variants) % def.variants;
    const bw = def.w + def.pad * 2;
    const bh = def.h + def.pad * 2;
    const c = makeCanvas(Math.max(1, Math.ceil(bw * k)), Math.max(1, Math.ceil(bh * k)));
    const g = c.getContext('2d');
    g.setTransform(k, 0, 0, k, def.pad * k, def.pad * k);
    def.paint(g, v);
    // w и h — по настоящему размеру холста: тогда drawImage в единицах мира не пересчитывает точки
    return { c, w: c.width / k, h: c.height / k, ox: def.ox + def.pad, oy: def.oy + def.pad };
  }

  /** Заготовка картинки (или null, если такой нет). */
  function sprite(key, variant = 0) {
    let list = cache.get(key);
    if (!list) {
      list = [];
      cache.set(key, list);
    }
    let s = list[variant];
    if (s === undefined) {
      s = bake(key, variant);
      list[variant] = s;
    }
    return s;
  }

  /** Белый силуэт той же картинки — им «вспыхивает» тот, кого ударили. */
  function silhouette(key, variant = 0) {
    let list = white.get(key);
    if (!list) {
      list = [];
      white.set(key, list);
    }
    let s = list[variant];
    if (s === undefined) {
      const src = sprite(key, variant);
      if (!src) {
        list[variant] = null;
        return null;
      }
      const c = makeCanvas(src.c.width, src.c.height);
      const g = c.getContext('2d');
      g.drawImage(src.c, 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = '#fff';
      g.fillRect(0, 0, c.width, c.height);
      s = { c, w: src.w, h: src.h, ox: src.ox, oy: src.oy };
      list[variant] = s;
    }
    return s;
  }

  /**
   * Поставить картинку: (x, y) — точка привязки в точках холста. Без поворота и растяжения — точка в точку.
   */
  function put(ctx, key, x, y, variant = 0, alpha = 1) {
    const s = sprite(key, variant);
    if (!s) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (alpha !== 1) ctx.globalAlpha = alpha;
    ctx.drawImage(s.c, Math.round(x - s.ox * k), Math.round(y - s.oy * k));
    if (alpha !== 1) ctx.globalAlpha = 1;
  }

  /** То же, но с поворотом (радианы), растяжением и отражением вокруг точки привязки. */
  function putX(ctx, key, x, y, rot = 0, sx = 1, sy = 1, alpha = 1, variant = 0) {
    const s = sprite(key, variant);
    if (!s) return;
    const c = Math.cos(rot);
    const n = Math.sin(rot);
    ctx.setTransform(k * c * sx, k * n * sx, -k * n * sy, k * c * sy, x, y);
    if (alpha !== 1) ctx.globalAlpha = alpha;
    ctx.drawImage(s.c, -s.ox, -s.oy, s.w, s.h);
    if (alpha !== 1) ctx.globalAlpha = 1;
  }

  /**
   * Часть фигуры: (x, y) — в осях фигуры (единицы мира от середины ступней, x — вперёд по взгляду).
   * Зовётся только из draw() фигуры.
   */
  function part(ctx, key, x, y, rot = 0, sx = 1, sy = 1, alpha = 1, variant = 0) {
    const s = sprite(key, variant);
    if (!s) return;
    const c = Math.cos(rot);
    const n = Math.sin(rot);
    ctx.setTransform(k * face * c * sx * gx, k * n * sx * gy, -k * face * n * sy * gx, k * c * sy * gy, cx + k * face * x * gx, cy + k * y * gy);
    if (alpha !== 1) ctx.globalAlpha = alpha;
    ctx.drawImage(s.c, -s.ox, -s.oy, s.w, s.h);
    if (flash > 0) {
      const w = silhouette(key, variant);
      if (w) {
        ctx.globalAlpha = alpha * Math.min(1, flash);
        ctx.drawImage(w.c, -w.ox, -w.oy, w.w, w.h);
      }
    }
    if (alpha !== 1 || flash > 0) ctx.globalAlpha = 1;
  }

  /** Оси фигуры на холсте — для простых линий в кадре (лапы, усы): дальше рисовать в единицах мира. */
  function axes(ctx) {
    ctx.setTransform(k * face * gx, 0, 0, k * gy, cx, cy);
  }

  const kit = { k, part, axes, sprite };

  /**
   * Нарисовать фигуру: (x, y) — середина ступней в точках холста, dir — куда смотрит (1 вправо, −1 влево),
   * a — поза. Высота (a.z) — забота рендера: он сам поднимает точку привязки.
   */
  function rig(ctx, id, x, y, dir, a) {
    const def = RIGS.get(id);
    if (!def) return false;
    cx = x;
    cy = y;
    face = dir < 0 ? -1 : 1;
    flash = a.flash > 0 ? a.flash : 0;
    gx = a.sx > 0 ? a.sx : 1;
    gy = a.sy > 0 ? a.sy : 1;
    def.draw(kit, ctx, a);
    flash = 0;
    gx = 1;
    gy = 1;
    return true;
  }

  /** Значок для окон игры: отдельный холст size×size пикселей CSS с картинкой по середине. */
  function icon(key, size, density = 2, variant = 0) {
    const def = SPRITES.get(key);
    const px = Math.max(1, Math.round(size * density));
    const c = makeCanvas(px, px);
    if (c.style) {
      c.style.width = `${size}px`;
      c.style.height = `${size}px`;
    }
    if (!def) return c;
    const g = c.getContext('2d');
    const fit = px / Math.max(def.w, def.h);
    g.setTransform(fit, 0, 0, fit, (px - def.w * fit) / 2, (px - def.h * fit) / 2);
    def.paint(g, ((variant % def.variants) + def.variants) % def.variants);
    return c;
  }

  /** Сбросить заготовки (сменилась чёткость — набор создают заново; этим только освобождают память). */
  function clear() {
    cache.clear();
    white.clear();
  }

  return { k, sprite, put, putX, rig, icon, clear, has: hasSprite, hasRig };
}
