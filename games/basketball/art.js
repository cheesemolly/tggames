// Мелкие рисунки «Баскетбола», которые не меняются от кадра к кадру: цифры табло — и список площадок: какая
// сцена за корзинами (scenes.js) и какой мяч (ball.js) у каждого скина. Без DOM.

/** Площадки: сцена и мяч скина. */
export const LOOKS = {
  telegram: { scene: 'city', ball: 'classic' },
  yard: { scene: 'sunset', ball: 'street' },
  arena: { scene: 'arena', ball: 'classic' },
  night: { scene: 'neon', ball: 'neon' },
  beach: { scene: 'beach', ball: 'beach' },
  space: { scene: 'space', ball: 'moon' },
};

/** Случайное число 0…1 от пары целых — рисунок сцены всегда один и тот же. */
export function hash2(a, b) {
  let x = Math.imul(a * 374761393 + b * 668265263, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

// ---------- табло ----------
// Счёт — большими цифрами из семи палочек, как на табло в спортзале (и на табло самой арены).

/** Какие палочки горят у цифры: a — верх, b и c — правые, d — низ, e и f — левые, g — середина. */
export const SEGMENTS = {
  0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
};

/** Ширина строки цифр высотой h. */
export const scoreWidth = (str, h) => str.length * h * 0.56 + (str.length - 1) * h * 0.16;

/** Строка цифр: левый верхний угол в (0, 0), высота h; с лёгким наклоном, как у настоящих табло. */
export function drawScore(g, str, h, color) {
  const w = h * 0.56;
  const t = h * 0.135;                      // толщина палочки
  const gap = t * 0.14;
  const half = h / 2;
  const bar = (x0, y0, x1, y1) => {
    // палочка — шестиугольник с острыми концами
    const horizontal = y0 === y1;
    g.beginPath();
    if (horizontal) {
      g.moveTo(x0 + gap, y0);
      g.lineTo(x0 + gap + t / 2, y0 - t / 2);
      g.lineTo(x1 - gap - t / 2, y0 - t / 2);
      g.lineTo(x1 - gap, y0);
      g.lineTo(x1 - gap - t / 2, y0 + t / 2);
      g.lineTo(x0 + gap + t / 2, y0 + t / 2);
    } else {
      g.moveTo(x0, y0 + gap);
      g.lineTo(x0 + t / 2, y0 + gap + t / 2);
      g.lineTo(x0 + t / 2, y1 - gap - t / 2);
      g.lineTo(x0, y1 - gap);
      g.lineTo(x0 - t / 2, y1 - gap - t / 2);
      g.lineTo(x0 - t / 2, y0 + gap + t / 2);
    }
    g.closePath();
    g.fill();
  };
  const l = t / 2;
  const r = w - t / 2;
  const top = t / 2;
  const bottom = h - t / 2;
  const BARS = {
    a: [l, top, r, top], b: [r, top, r, half], c: [r, half, r, bottom], d: [l, bottom, r, bottom],
    e: [l, half, l, bottom], f: [l, top, l, half], g: [l, half, r, half],
  };
  g.save();
  g.transform(1, 0, -0.09, 1, h * 0.09, 0);
  g.fillStyle = color;
  for (const ch of str) {
    for (const seg of SEGMENTS[ch] ?? '') bar(...BARS[seg]);
    g.translate(w + h * 0.16, 0);
  }
  g.restore();
}
