// Поддельный холст для тестов комнат «Лисьей охоты» (фон места и его предметы): считает то, что на глаз не поймать.

import assert from 'node:assert/strict';

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
/** Цвет годен, если холст его точно поймёт: #hex или rgb()/rgba() с числами в своих пределах. */
export function validColor(c) {
  if (typeof c !== 'string') return false;
  if (HEX.test(c)) return true;
  const m = /^rgba?\((-?[\d.]+),(-?[\d.]+),(-?[\d.]+)(?:,(-?[\d.]+))?\)$/.exec(c);
  if (!m) return false;
  const v = m.slice(1).filter((x) => x !== undefined).map(Number);
  return v.every(Number.isFinite) && v.slice(0, 3).every((x) => x >= 0 && x <= 255 && Number.isInteger(x)) && (v.length < 4 || (v[3] >= 0 && v[3] <= 1));
}

/**
 * Поддельный холст: понимает то, чем рисует мир (пути с кривыми, градиенты, обрезку, сдвиги), и запоминает
 * рамку закрашенного с учётом обрезки, число вызовов и градиентов, а при keep — и журнал вызовов (сравнивать
 * картинки). Кривые и дуги считаются по точкам самой линии, а не по рычагам: рамка выходит настоящей.
 * Чего у холста нет на старых телефонах (roundRect, filter) — того нет и здесь.
 */
export function fakeCanvas(width = 0, height = 0, keep = false) {
  const log = { calls: [], box: [Infinity, Infinity, -Infinity, -Infinity], n: 0, grads: 0, depth: 0, paints: 0 };
  let m = [1, 0, 0, 1, 0, 0];
  let path = [];
  let cur = [0, 0];
  let clip = null;
  const stack = [];
  const state = { fillStyle: '#000000', strokeStyle: '#000000', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter', globalAlpha: 1, globalCompositeOperation: 'source-over' };
  const num = (v) => {
    assert.ok(typeof v === 'number' && Number.isFinite(v), `в рисунок попало не число: ${v}`);
    return Math.round(v * 100) / 100;
  };
  const note = (name, args) => {
    log.n += 1;
    if (keep) log.calls.push(`${name}(${args.map((v) => (typeof v === 'number' ? num(v) : String(v))).join(',')})`);
    else for (const v of args) if (typeof v === 'number') num(v);
  };
  const mul = (k) => {
    m = [m[0] * k[0] + m[2] * k[1], m[1] * k[0] + m[3] * k[1], m[0] * k[2] + m[2] * k[3], m[1] * k[2] + m[3] * k[3],
      m[0] * k[4] + m[2] * k[5] + m[4], m[1] * k[4] + m[3] * k[5] + m[5]];
  };
  const dev = (x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  const add = (x, y) => {
    path.push(dev(x, y));
    cur = [x, y];
  };
  const boxOf = (pts, grow = 0) => {
    let b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, y] of pts) b = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)];
    return [b[0] - grow, b[1] - grow, b[2] + grow, b[3] + grow];
  };
  const cut = (a, b) => (b ? [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])] : a);
  const painted = (b) => {
    const v = cut(b, clip);
    if (v[0] >= v[2] || v[1] >= v[3]) return;
    log.paints += 1;
    log.box = [Math.min(log.box[0], v[0]), Math.min(log.box[1], v[1]), Math.max(log.box[2], v[2]), Math.max(log.box[3], v[3])];
  };
  const scale = () => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
  const arcPoints = (x, y, rx, ry, rot, a0, a1, ccw) => {
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
  const gradient = (kind, v) => {
    v.forEach(num);
    log.grads += 1;
    const id = `${kind}#${log.grads}`;
    note(kind, v);
    return {
      gradient: id,
      addColorStop(at, color) {
        assert.ok(Number.isFinite(at) && at >= 0 && at <= 1, `остановка градиента ${at}`);
        assert.ok(validColor(color), `градиент: не цвет «${color}»`);
        note('stop', [at, color]);
      },
    };
  };
  const ctx = {
    save() {
      stack.push({ m, clip, state: { ...state } });
      log.depth += 1;
      note('save', []);
    },
    restore() {
      assert.ok(stack.length, 'restore без save');
      const top = stack.pop();
      m = top.m;
      clip = top.clip;
      Object.assign(state, top.state);
      log.depth -= 1;
      note('restore', []);
    },
    translate(x, y) {
      note('translate', [x, y]);
      mul([1, 0, 0, 1, x, y]);
    },
    rotate(a) {
      note('rotate', [a]);
      mul([Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]);
    },
    scale(x, y) {
      note('scale', [x, y]);
      mul([x, 0, 0, y, 0, 0]);
    },
    setTransform(a, b, c, d, e, f) {
      note('setTransform', [a, b, c, d, e, f]);
      m = [a, b, c, d, e, f];
    },
    beginPath() {
      path = [];
      note('beginPath', []);
    },
    closePath() {
      note('closePath', []);
    },
    moveTo(x, y) {
      note('moveTo', [x, y]);
      add(x, y);
    },
    lineTo(x, y) {
      note('lineTo', [x, y]);
      add(x, y);
    },
    quadraticCurveTo(cx, cy, x, y) {
      note('quadraticCurveTo', [cx, cy, x, y]);
      const [x0, y0] = cur;
      for (let i = 1; i <= 8; i++) {
        const t = i / 8;
        const u = 1 - t;
        add(u * u * x0 + 2 * u * t * cx + t * t * x, u * u * y0 + 2 * u * t * cy + t * t * y);
      }
    },
    bezierCurveTo(ax, ay, bx, by, x, y) {
      note('bezierCurveTo', [ax, ay, bx, by, x, y]);
      const [x0, y0] = cur;
      for (let i = 1; i <= 10; i++) {
        const t = i / 10;
        const u = 1 - t;
        add(u * u * u * x0 + 3 * u * u * t * ax + 3 * u * t * t * bx + t * t * t * x, u * u * u * y0 + 3 * u * u * t * ay + 3 * u * t * t * by + t * t * t * y);
      }
    },
    arc(x, y, r, a0, a1, ccw = false) {
      note('arc', [x, y, r, a0, a1, ccw]);
      arcPoints(x, y, r, r, 0, a0, a1, ccw);
    },
    ellipse(x, y, rx, ry, rot, a0, a1, ccw = false) {
      note('ellipse', [x, y, rx, ry, rot, a0, a1, ccw]);
      arcPoints(x, y, rx, ry, rot, a0, a1, ccw);
    },
    rect(x, y, w, h) {
      note('rect', [x, y, w, h]);
      add(x, y);
      add(x + w, y);
      add(x + w, y + h);
      add(x, y + h);
    },
    fill(rule) {
      assert.ok(rule === undefined || rule === 'evenodd' || rule === 'nonzero', `правило заливки ${rule}`);
      note('fill', [rule ?? '']);
      if (path.length) painted(boxOf(path));
    },
    stroke() {
      note('stroke', []);
      if (path.length) painted(boxOf(path, (state.lineWidth * scale()) / 2));
    },
    clip(rule) {
      assert.ok(rule === undefined || rule === 'evenodd' || rule === 'nonzero', `правило обрезки ${rule}`);
      note('clip', [rule ?? '']);
      clip = cut(path.length ? boxOf(path) : [0, 0, 0, 0], clip);
    },
    fillRect(x, y, w, h) {
      note('fillRect', [x, y, w, h]);
      painted(boxOf([dev(x, y), dev(x + w, y), dev(x + w, y + h), dev(x, y + h)]));
    },
    strokeRect(x, y, w, h) {
      note('strokeRect', [x, y, w, h]);
      painted(boxOf([dev(x, y), dev(x + w, y), dev(x + w, y + h), dev(x, y + h)], (state.lineWidth * scale()) / 2));
    },
    drawImage(img, x, y) {
      note('drawImage', [x, y]);
    },
    createLinearGradient: (...v) => gradient('linear', v),
    createRadialGradient(...v) {
      assert.ok(v[2] >= 0 && v[5] >= 0, 'отрицательный радиус градиента');
      return gradient('radial', v);
    },
  };
  const proxy = new Proxy(ctx, {
    get(target, key) {
      if (key in target) return target[key];
      if (key in state) return state[key];
      if (typeof key === 'symbol' || key === 'then') return undefined;
      throw new Error(`холст: «${String(key)}» есть не на всех телефонах (или его нет вовсе)`);
    },
    set(target, key, value) {
      if (!(key in state)) throw new Error(`холст: свойство «${String(key)}» рисунку не положено`);
      if (key === 'fillStyle' || key === 'strokeStyle') {
        assert.ok(value?.gradient || validColor(value), `${key}: не цвет «${value}»`);
        note(key, [value?.gradient ?? value]);
      } else if (key === 'lineWidth') {
        assert.ok(Number.isFinite(value) && value > 0, `lineWidth ${value}`);
        note(key, [value]);
      } else if (key === 'globalAlpha') assert.ok(value >= 0 && value <= 1, `globalAlpha ${value}`);
      state[key] = value;
      return true;
    },
  });
  return { width, height, log, style: {}, getContext: () => proxy };
}
