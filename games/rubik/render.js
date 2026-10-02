// Отрисовка кубика на WebGL — плоскими цветами, без освещения: корпус кубиков одного цвета, наклейки — скруглённые
// квадраты своих цветов. Всё в одном буфере: корпус (единичный куб, общий) и наклейки каждого кубика в его «родных»
// координатах; кубик рисуется своей матрицей (поворот × место), слой в анимации — ещё и поворотом вокруг оси.
// Корпус рисуется со сдвигом глубины (polygonOffset) — наклейки не «мерцают» на его гранях.
//
// Камера смотрит на кубик (−1,5…1,5 по каждой оси) издалека; вид — кватернион поворота кубика. Здесь же:
// луч из точки экрана в координатах кубика (для касаний) и проекция точки кубика на экран (для направления свайпа).

import { HOMES, stickersOf } from './cube.js';

const FOVY = (32 * Math.PI) / 180;
const RADIUS = 2.62;            // шар, в который вписан кубик при любом повороте

const VS = `
attribute vec3 a_pos;
attribute float a_col;
uniform mat4 u_mvp;
uniform vec3 u_pal[8];
varying vec3 v_col;
void main() {
  gl_Position = u_mvp * vec4(a_pos, 1.0);
  v_col = u_pal[int(a_col + 0.5)];
}`;
const FS = `
precision mediump float;
varying vec3 v_col;
void main() { gl_FragColor = vec4(v_col, 1.0); }`;

// ---------- матрицы (столбцами, как в WebGL) ----------

const mat4 = () => new Float32Array(16);
function mul(a, b, out = mat4()) {
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return out;
}
function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  const m = mat4();
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) / (near - far);
  m[11] = -1;
  m[14] = (2 * far * near) / (near - far);
  return m;
}
/** Кватернион [x, y, z, w] → матрица 3×3 (строками). */
export function quatToMat3(q) {
  const [x, y, z, w] = q;
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
    2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
    2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y),
  ];
}
export function quatMul(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}
export function quatAxis(axis, angle) {
  const s = Math.sin(angle / 2);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)];
}
export function quatNorm(q) {
  const l = Math.hypot(...q) || 1;
  return q.map((v) => v / l);
}
export function quatSlerp(a, b, t) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const bb = d < 0 ? b.map((v) => -v) : b;
  d = Math.abs(d);
  if (d > 0.9995) return quatNorm(a.map((v, i) => v + (bb[i] - v) * t));
  const th = Math.acos(d);
  const s = Math.sin(th);
  const wa = Math.sin((1 - t) * th) / s;
  const wb = Math.sin(t * th) / s;
  return a.map((v, i) => v * wa + bb[i] * wb);
}
/** 3×3 (строками) + сдвиг → 4×4 столбцами. */
function from3(m, t = [0, 0, 0]) {
  const o = mat4();
  o[0] = m[0]; o[1] = m[3]; o[2] = m[6];
  o[4] = m[1]; o[5] = m[4]; o[6] = m[7];
  o[8] = m[2]; o[9] = m[5]; o[10] = m[8];
  o[12] = t[0]; o[13] = t[1]; o[14] = t[2]; o[15] = 1;
  return o;
}
function axisRot3(axis, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  if (axis === 0) return [1, 0, 0, 0, c, -s, 0, s, c];
  if (axis === 1) return [c, 0, s, 0, 1, 0, -s, 0, c];
  return [c, -s, 0, s, c, 0, 0, 0, 1];
}
const apply3 = (m, v) => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];
const transpose3 = (m) => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];

// ---------- геометрия ----------

function bodyVerts(out) {
  const h = 0.5;
  const faces = [
    [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
    [[0, 1, 0], [0, 0, 1], [1, 0, 0]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [0, 1, 0], [1, 0, 0]],
  ];
  for (const [n, u, v] of faces) {
    const p = (a, b) => [0, 1, 2].map((i) => n[i] * h + u[i] * a * h + v[i] * b * h);
    const quad = [p(-1, -1), p(1, -1), p(1, 1), p(-1, -1), p(1, 1), p(-1, 1)];
    for (const q of quad) out.push(q[0], q[1], q[2], 6);
  }
}

/** Скруглённый квадрат наклейки на грани с нормалью n (в координатах кубика), цвет — номер грани. */
function stickerVerts(out, n, color, size, radius) {
  const axisN = n.findIndex((v) => v);
  const [ia, ib] = [0, 1, 2].filter((i) => i !== axisN);
  const h = size / 2;
  const r = Math.min(radius, h);
  const seg = 6;
  const ring = [];
  const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  corners.forEach(([sx, sy], k) => {
    const cx = sx * (h - r);
    const cy = sy * (h - r);
    const a0 = (k * Math.PI) / 2;
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      ring.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  });
  const d = 0.5 + 0.002;
  const point = ([a, b]) => {
    const p = [0, 0, 0];
    p[axisN] = n[axisN] * d;
    p[ia] = a;
    p[ib] = b;
    return p;
  };
  // обход против часовой, если смотреть снаружи (иначе грань отбросится): базис (ia, ib) у оси y — «левый»
  const flip = n[axisN] * (axisN === 1 ? -1 : 1) < 0;
  const c = point([0, 0]);
  for (let i = 0; i < ring.length; i++) {
    let p1 = point(ring[i]);
    let p2 = point(ring[(i + 1) % ring.length]);
    if (flip) [p1, p2] = [p2, p1];
    out.push(c[0], c[1], c[2], color, p1[0], p1[1], p1[2], color, p2[0], p2[1], p2[2], color);
  }
}

// ---------- рендерер ----------

export function createRenderer(canvas) {
  const gl = canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: true })
    || canvas.getContext('experimental-webgl', { antialias: true, alpha: true });
  if (!gl) return null;

  const shader = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  const aPos = gl.getAttribLocation(prog, 'a_pos');
  const aCol = gl.getAttribLocation(prog, 'a_col');
  const uMvp = gl.getUniformLocation(prog, 'u_mvp');
  const uPal = gl.getUniformLocation(prog, 'u_pal');
  const buf = gl.createBuffer();

  let ranges = [];
  let bodyCount = 0;
  let width = 1;
  let height = 1;
  let proj = mat4();
  let dist = 10;
  let tanY = Math.tan(FOVY / 2);
  let tanX = tanY;

  function setStyle({ palette, size = 0.86, radius = 0.12 }) {
    const data = [];
    bodyVerts(data);
    bodyCount = data.length / 4;
    ranges = HOMES.map((home) => {
      const first = data.length / 4;
      for (const [n, f] of stickersOf(home)) stickerVerts(data, n, f, size, radius);
      return { first, count: data.length / 4 - first };
    });
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    gl.useProgram(prog);
    const pal = new Float32Array(24);
    palette.forEach((hex, i) => {
      const v = parseInt(hex.slice(1), 16);
      pal[i * 3] = ((v >> 16) & 255) / 255;
      pal[i * 3 + 1] = ((v >> 8) & 255) / 255;
      pal[i * 3 + 2] = (v & 255) / 255;
    });
    gl.uniform3fv(uPal, pal);
  }

  function resize(w, h, dpr) {
    width = w;
    height = h;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    const aspect = w / h;
    tanY = Math.tan(FOVY / 2);
    tanX = tanY * aspect;
    const half = Math.atan(Math.min(tanX, tanY));
    dist = (RADIUS / Math.sin(half)) * 1.03;
    proj = perspective(FOVY, aspect, Math.max(0.5, dist - 4), dist + 4);
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  /** scene: { cubies, view (кватернион), anim: { axis, layer, angle } | null }. */
  function draw(scene) {
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(aPos);
    gl.enableVertexAttribArray(aCol);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 16, 0);
    gl.vertexAttribPointer(aCol, 1, gl.FLOAT, false, 16, 12);
    const viewM = from3(quatToMat3(scene.view), [0, 0, -dist]);
    const pv = mul(proj, viewM);
    const anim = scene.anim;
    const animM = anim ? from3(axisRot3(anim.axis, anim.angle)) : null;
    const tmp = mat4();
    const mvp = mat4();
    scene.cubies.forEach((c, k) => {
      let model = from3(c.rot, c.pos);
      if (anim && (anim.layer === 'all' || c.pos[anim.axis] === anim.layer)) model = mul(animM, model, tmp.slice());
      mul(pv, model, mvp);
      gl.uniformMatrix4fv(uMvp, false, mvp);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(1, 2);
      gl.drawArrays(gl.TRIANGLES, 0, bodyCount);
      gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.drawArrays(gl.TRIANGLES, ranges[k].first, ranges[k].count);
    });
  }

  /** Точка кубика → пиксели экрана (css). */
  function project(view, p) {
    const c = apply3(quatToMat3(view), p);
    const z = dist - c[2];
    const nx = c[0] / z / tanX;
    const ny = c[1] / z / tanY;
    return [((nx + 1) / 2) * width, ((1 - ny) / 2) * height];
  }

  /** Луч из точки экрана (css px) → пересечение с кубиком: { point, normal } или null. */
  function pick(view, x, y) {
    const nx = (x / width) * 2 - 1;
    const ny = 1 - (y / height) * 2;
    const inv = transpose3(quatToMat3(view));
    const o = apply3(inv, [0, 0, dist]);
    const d = apply3(inv, [nx * tanX, ny * tanY, -1]);
    let t0 = -Infinity;
    let t1 = Infinity;
    let axis = -1;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-9) {
        if (o[i] < -1.5 || o[i] > 1.5) return null;
        continue;
      }
      let a = (-1.5 - o[i]) / d[i];
      let b = (1.5 - o[i]) / d[i];
      if (a > b) [a, b] = [b, a];
      if (a > t0) {
        t0 = a;
        axis = i;
      }
      t1 = Math.min(t1, b);
    }
    if (t0 > t1 || t1 < 0 || axis < 0) return null;
    const point = o.map((v, i) => v + d[i] * t0);
    const normal = [0, 0, 0];
    normal[axis] = Math.sign(point[axis]);
    return { point, normal };
  }

  return {
    setStyle, resize, draw, project, pick,
    get lost() { return gl.isContextLost(); },
    dispose() {
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
