// Поддельный холст для тестов рисунков «Лисьей охоты»: запоминает, что и где закрашено, — без браузера.

import assert from 'node:assert/strict';

const COLOR = /^(#[0-9a-f]{3,4}|#[0-9a-f]{6}|#[0-9a-f]{8}|transparent)$/i;
/** Цвет годен, если холст его точно поймёт: #hex или rgb()/rgba() с числами в своих пределах. */
export function validColor(c) {
  if (typeof c !== 'string') return false;
  if (COLOR.test(c)) return true;
  const m = /^rgba?\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*(?:,\s*(-?[\d.]+)\s*)?\)$/.exec(c);
  if (!m) return false;
  const v = m.slice(1).filter((x) => x !== undefined).map(Number);
  return v.every(Number.isFinite) && v.slice(0, 3).every((x) => x >= 0 && x <= 255) && (v.length < 4 || (v[3] >= 0 && v[3] <= 1));
}

const BLENDS = new Set(['source-over', 'source-in', 'source-out', 'source-atop', 'destination-over', 'destination-in', 'destination-out',
  'destination-atop', 'lighter', 'copy', 'xor', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'soft-light', 'hard-light']);
const ERASERS = new Set(['destination-in', 'destination-out']);       // ничего не дорисовывают — только стирают
const PLAIN = ['lineCap', 'lineJoin', 'miterLimit', 'lineDashOffset', 'shadowOffsetX', 'shadowOffsetY', 'font', 'textAlign', 'textBaseline',
  'imageSmoothingEnabled', 'imageSmoothingQuality', 'direction'];

class Gradient {
  constructor(log, numbers) {
    this.log = log;
    for (const n of numbers) assert.ok(Number.isFinite(n), 'в градиенте не число');
  }

  addColorStop(at, color) {
    assert.ok(Number.isFinite(at) && at >= 0 && at <= 1, `остановка градиента ${at}`);
    this.log.colors.add(color);
  }
}

/**
 * Поддельный холст. Понимает всё, чем рисуют картинки (пути с кривыми, градиенты, обрезку, сдвиги и повороты,
 * режимы наложения, drawImage), и запоминает: рамку закрашенного (в точках холста, с учётом обрезки), все цвета,
 * каждый drawImage с его преобразованием. Чего у холста нет на старых телефонах (roundRect, filter, конический
 * градиент) — того нет и здесь: картинка с ними упадёт в тесте, а не у игрока.
 */
export function fakeCanvas(width, height) {
  const log = { colors: new Set(), paints: 0, box: [Infinity, Infinity, -Infinity, -Infinity], images: [], alphas: [], balance: 0 };
  let m = [1, 0, 0, 1, 0, 0];
  let path = [];                         // точки текущего пути — уже в точках холста
  let cur = [0, 0];                      // «перо» — в осях рисунка на момент вызова
  let clip = null;                       // рамка обрезки или null
  const stack = [];
  const state = { fillStyle: '#000000', strokeStyle: '#000000', lineWidth: 1, globalAlpha: 1, globalCompositeOperation: 'source-over', shadowBlur: 0, shadowColor: 'rgba(0,0,0,0)' };
  for (const name of PLAIN) state[name] = null;
  let dash = [];

  const finite = (...v) => {
    for (const x of v) assert.ok(typeof x === 'number' && Number.isFinite(x), `в рисунок попало не число: ${x}`);
  };
  const mul = (n) => {
    m = [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
      m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  };
  const dev = (x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  const add = (x, y) => {
    finite(x, y);
    path.push(dev(x, y));
    cur = [x, y];
  };
  const boxOf = (pts, grow = 0) => {
    if (!pts.length) return null;
    let b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, y] of pts) b = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)];
    return [b[0] - grow, b[1] - grow, b[2] + grow, b[3] + grow];
  };
  const cut = (a, b) => (b ? [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])] : a);
  const style = (v) => {
    if (v instanceof Gradient || v?.pattern) return;
    log.colors.add(v);
  };
  /** Что-то закрашено в рамке b (точки холста). */
  const painted = (b, ink) => {
    style(ink);
    log.alphas.push(state.globalAlpha);
    if (!b || ERASERS.has(state.globalCompositeOperation)) return;
    const v = cut(b, clip);
    if (v[0] >= v[2] || v[1] >= v[3]) return;
    log.paints += 1;
    log.box = [Math.min(log.box[0], v[0]), Math.min(log.box[1], v[1]), Math.max(log.box[2], v[2]), Math.max(log.box[3], v[3])];
  };
  const scale = () => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
  const arcPoints = (x, y, rx, ry, rot, a0, a1, ccw) => {
    finite(x, y, rx, ry, rot, a0, a1);
    assert.ok(rx >= 0 && ry >= 0, 'отрицательный радиус');
    let span = a1 - a0;
    if (ccw) span = span <= -Math.PI * 2 ? -Math.PI * 2 : -((((-span) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) || (span ? Math.PI * 2 : 0));
    else span = span >= Math.PI * 2 ? Math.PI * 2 : (((span % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) || (span ? Math.PI * 2 : 0);
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    for (let i = 0; i <= 24; i++) {
      const a = a0 + (span * i) / 24;
      const px = Math.cos(a) * rx;
      const py = Math.sin(a) * ry;
      add(x + px * c - py * s, y + px * s + py * c);
    }
  };

  const ctx = {
    canvas: null,
    save() {
      stack.push({ m, clip, state: { ...state }, dash });
      log.balance += 1;
    },
    restore() {
      assert.ok(stack.length, 'restore без save');
      const top = stack.pop();
      m = top.m;
      clip = top.clip;
      Object.assign(state, top.state);
      dash = top.dash;
      log.balance -= 1;
    },
    translate(x, y) {
      finite(x, y);
      mul([1, 0, 0, 1, x, y]);
    },
    rotate(a) {
      finite(a);
      mul([Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]);
    },
    scale(x, y) {
      finite(x, y);
      mul([x, 0, 0, y, 0, 0]);
    },
    transform(a, b, c, d, e, f) {
      finite(a, b, c, d, e, f);
      mul([a, b, c, d, e, f]);
    },
    setTransform(a, b, c, d, e, f) {
      finite(a, b, c, d, e, f);
      m = [a, b, c, d, e, f];
    },
    resetTransform() {
      m = [1, 0, 0, 1, 0, 0];
    },
    getTransform: () => ({ a: m[0], b: m[1], c: m[2], d: m[3], e: m[4], f: m[5] }),
    beginPath() {
      path = [];
    },
    closePath() {},
    moveTo: add,
    lineTo: add,
    quadraticCurveTo(cx, cy, x, y) {
      finite(cx, cy, x, y);
      const [x0, y0] = cur;
      for (let i = 1; i <= 8; i++) {
        const t = i / 8;
        const u = 1 - t;
        add(u * u * x0 + 2 * u * t * cx + t * t * x, u * u * y0 + 2 * u * t * cy + t * t * y);
      }
    },
    bezierCurveTo(ax, ay, bx, by, x, y) {
      finite(ax, ay, bx, by, x, y);
      const [x0, y0] = cur;
      for (let i = 1; i <= 10; i++) {
        const t = i / 10;
        const u = 1 - t;
        add(u * u * u * x0 + 3 * u * u * t * ax + 3 * u * t * t * bx + t * t * t * x, u * u * u * y0 + 3 * u * u * t * ay + 3 * u * t * t * by + t * t * t * y);
      }
    },
    arc(x, y, r, a0, a1, ccw = false) {
      arcPoints(x, y, r, r, 0, a0, a1, ccw);
    },
    ellipse(x, y, rx, ry, rot, a0, a1, ccw = false) {
      arcPoints(x, y, rx, ry, rot, a0, a1, ccw);
    },
    arcTo(x1, y1, x2, y2, r) {
      finite(r);
      add(x1, y1);
      add(x2, y2);
    },
    rect(x, y, w, h) {
      add(x, y);
      add(x + w, y);
      add(x + w, y + h);
      add(x, y + h);
    },
    fill(rule) {
      assert.ok(rule === undefined || rule === 'nonzero' || rule === 'evenodd', `правило заливки ${rule}`);
      painted(boxOf(path), state.fillStyle);
    },
    stroke() {
      painted(boxOf(path, (state.lineWidth * scale()) / 2), state.strokeStyle);
    },
    clip(rule) {
      assert.ok(rule === undefined || rule === 'nonzero' || rule === 'evenodd', `правило обрезки ${rule}`);
      const b = boxOf(path) ?? [0, 0, 0, 0];
      clip = cut(b, clip);
    },
    fillRect(x, y, w, h) {
      finite(x, y, w, h);
      painted(boxOf([dev(x, y), dev(x + w, y), dev(x + w, y + h), dev(x, y + h)]), state.fillStyle);
    },
    strokeRect(x, y, w, h) {
      finite(x, y, w, h);
      painted(boxOf([dev(x, y), dev(x + w, y), dev(x + w, y + h), dev(x, y + h)], (state.lineWidth * scale()) / 2), state.strokeStyle);
    },
    clearRect(x, y, w, h) {
      finite(x, y, w, h);
    },
    drawImage(img, ...rest) {
      assert.ok(img && typeof img.width === 'number' && typeof img.getContext === 'function', 'drawImage: не холст');
      finite(...rest);
      assert.ok([2, 4, 8].includes(rest.length), 'drawImage: число аргументов');
      const [x, y, w, h] = rest.length === 2 ? [rest[0], rest[1], img.width, img.height] : rest.length === 4 ? rest : rest.slice(4);
      log.images.push({ img, m: m.slice(), x, y, w, h, alpha: state.globalAlpha, blend: state.globalCompositeOperation });
      painted(boxOf([dev(x, y), dev(x + w, y), dev(x + w, y + h), dev(x, y + h)]), '#000000');
    },
    createLinearGradient: (...v) => new Gradient(log, v),
    createRadialGradient(...v) {
      assert.ok(v[2] >= 0 && v[5] >= 0, 'отрицательный радиус градиента');
      return new Gradient(log, v);
    },
    createPattern: () => ({ pattern: true }),
    setLineDash(list) {
      finite(...list);
      dash = list.slice();
    },
    getLineDash: () => dash.slice(),
    fillText(text, x, y) {
      finite(x, y);
      painted(boxOf([dev(x, y)]), state.fillStyle);
    },
    strokeText(text, x, y) {
      finite(x, y);
      painted(boxOf([dev(x, y)]), state.strokeStyle);
    },
    measureText: (text) => ({ width: String(text).length * 6 }),
  };
  const setters = {
    fillStyle: (v) => assert.ok(v instanceof Gradient || v?.pattern || validColor(v), `fillStyle: не цвет «${v}»`),
    strokeStyle: (v) => assert.ok(v instanceof Gradient || v?.pattern || validColor(v), `strokeStyle: не цвет «${v}»`),
    shadowColor: (v) => assert.ok(validColor(v), `shadowColor: не цвет «${v}»`),
    lineWidth: (v) => assert.ok(Number.isFinite(v) && v >= 0, `lineWidth ${v}`),
    shadowBlur: (v) => assert.ok(Number.isFinite(v) && v >= 0, `shadowBlur ${v}`),
    globalAlpha: (v) => assert.ok(Number.isFinite(v) && v >= 0 && v <= 1, `globalAlpha ${v}`),
    globalCompositeOperation: (v) => assert.ok(BLENDS.has(v), `режим наложения «${v}»`),
  };
  const canvas = {
    width,
    height,
    style: {},
    log,
    getContext: (kind) => {
      assert.equal(kind, '2d');
      return proxy;
    },
  };
  const proxy = new Proxy(ctx, {
    get(target, key) {
      if (key in target) return target[key];
      if (key in state) return state[key];
      if (typeof key === 'symbol' || key === 'then') return undefined;
      throw new Error(`холст: «${String(key)}» есть не на всех телефонах (или его нет вовсе) — рисовать без него`);
    },
    set(target, key, value) {
      if (key in setters) setters[key](value);
      else if (!(key in state)) throw new Error(`холст: свойство «${String(key)}» есть не на всех телефонах (или его нет вовсе)`);
      state[key] = value;
      return true;
    },
  });
  ctx.canvas = canvas;
  return canvas;
}
