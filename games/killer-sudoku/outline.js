// Контур группы для пунктира на доске — без DOM, тестируется в Node.
// Границы клеток группы обходятся так, что группа всегда справа (сверху — на восток, справа — на юг, снизу — на
// запад, слева — на север); прямые куски сливаются, каждый угол сдвигается внутрь на inset по обеим сторонам:
// точка угла + inset·(нормаль входящего края + нормаль выходящего). Так же для внешних и внутренних углов.
// Результат — прямые отрезки [x1, y1, x2, y2] в пикселях: каждый рисуется своей линией, чтобы пунктир начинался и
// кончался штрихом в углах (одним путём с общим пунктиром углы выходят рваными).

const normal = ([dx, dy]) => [-dy, dx];    // «справа» от направления (ось y вниз)

/**
 * cells — клетки группы (0..80), xs/ys — 10 координат линий сетки по x и y (в пикселях), inset — отступ внутрь.
 * Возвращает [[x1, y1, x2, y2], …] — по отрезку на каждую сторону контура.
 */
export function cageOutline(cells, xs, ys, inset) {
  const set = new Set(cells);
  const out = new Map();                   // «c,r» начала края → края оттуда
  const add = (c1, r1, c2, r2) => {
    const key = `${c1},${r1}`;
    if (!out.has(key)) out.set(key, []);
    out.get(key).push({ from: [c1, r1], to: [c2, r2], dir: [Math.sign(c2 - c1), Math.sign(r2 - r1)] });
  };
  for (const i of cells) {
    const r = Math.floor(i / 9);
    const c = i % 9;
    if (r === 0 || !set.has(i - 9)) add(c, r, c + 1, r);
    if (c === 8 || !set.has(i + 1)) add(c + 1, r, c + 1, r + 1);
    if (r === 8 || !set.has(i + 9)) add(c + 1, r + 1, c, r + 1);
    if (c === 0 || !set.has(i - 1)) add(c, r + 1, c, r);
  }

  const runs = [];
  const px = ([c, r]) => [xs[c], ys[r]];
  for (;;) {
    const start = [...out.values()].find((list) => list.length)?.[0];
    if (!start) break;
    // обход одной петли
    const loop = [];
    let edge = start;
    do {
      const list = out.get(`${edge.from[0]},${edge.from[1]}`);
      list.splice(list.indexOf(edge), 1);
      loop.push(edge);
      const next = out.get(`${edge.to[0]},${edge.to[1]}`) ?? [];
      // в вершине, где группа касается сама себя углом, — поворот направо (группа справа)
      edge = next.find((e) => e.dir[0] === -edge.dir[1] && e.dir[1] === edge.dir[0]) ?? next[0];
    } while (edge && edge !== start && loop.length < 400);

    // углы — где меняется направление
    const corners = [];
    loop.forEach((e, k) => {
      const prev = loop[(k + loop.length - 1) % loop.length];
      if (prev.dir[0] === e.dir[0] && prev.dir[1] === e.dir[1]) return;
      const [x, y] = px(e.from);
      const n1 = normal(prev.dir);
      const n2 = normal(e.dir);
      corners.push([snap(x + inset * (n1[0] + n2[0])), snap(y + inset * (n1[1] + n2[1]))]);
    });
    corners.forEach((p, k) => {
      const q = corners[(k + 1) % corners.length];
      runs.push([p[0], p[1], q[0], q[1]]);
    });
  }
  return runs;
}

/** К половинке пикселя: линия толщиной в пиксель ложится ровно на пиксели и не мылится. */
const snap = (v) => Math.round(v * 2) / 2;
