// Сцены «Баскетбола»: что за корзинами. У каждой площадки своя — закат над двором, ночной город, арена с
// трибунами, пляж, космос; у площадки «По умолчанию» — город в цветах темы. Сцена — это небо (цвет меняется с
// высотой) и слои с разной глубиной: дальние едут за подъёмом медленно, ближние быстрее — так поднимаешься
// над домами, облаками, выше и выше. Здесь только описание слоёв и их рисунки: холст (render.js) один раз
// рисует каждый слой в заготовку и в кадре только копирует её. Без DOM; цвета — из палитры скина.
//
// Единицы — как в логике (ширина W). Высота слоя отсчитывается от низа экрана в начале партии; rate — какую
// долю подъёма слой «проезжает» (0 — стоит на экране, 1 — едет вместе с корзинами).
// Виды слоёв:
//   band    — картинка во всю ширину высотой h, низ на высоте at; every — повторяется вверх с таким шагом (до until);
//   one     — одна картинка w × h: середина на доле x ширины, низ на высоте at;
//   many    — россыпь картинок от from до to: в среднем одна на every единиц высоты, ширина w[от, до], высота — ratio
//             от ширины, variants — сколько разных, drift — как быстро плывут вбок; dim — [от, до, доля]: на таком
//             подъёме бледнеют до этой доли (облака в сумерках);
//   tile    — картинка во всю ширину, повторяется вверх без шва; fade — на каком подъёме проявляется [от, до];
//   twinkle — мерцающие огоньки (рисуются прямо в кадре): cell — примерно один на клетку такого размера.
// soft — слой далёкий и размытый, рисуется вдвое грубее (меньше памяти).

import { W } from './logic.js';
import { hash2, drawScore, scoreWidth } from './art.js';

const TAU = Math.PI * 2;
const lerp = (a, b, k) => a + (b - a) * k;
const rgbOf = (c) => (String(c).match(/[\d.]+/g) ?? [0, 0, 0]).slice(0, 3).map(Number);
/** Цвет с прозрачностью. */
export const fade = (c, a) => `rgba(${rgbOf(c).map(Math.round).join(',')},${a})`;
/** Смесь двух цветов: t = 0 — первый, 1 — второй. */
export const mix = (a, b, t) => {
  const B = rgbOf(b);
  return `rgb(${rgbOf(a).map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`;
};

// ---------- общие рисунки ----------

function circle(g, x, y, r, color) {
  g.fillStyle = color;
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
}

/** Сияние: мягкий круг, к краю сходит на нет. */
function halo(g, x, y, r, color, strength = 0.5) {
  const grad = g.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, fade(color, strength));
  grad.addColorStop(0.35, fade(color, strength * 0.42));
  grad.addColorStop(1, fade(color, 0));
  g.fillStyle = grad;
  g.fillRect(x - r, y - r, r * 2, r * 2);
}

/** Дымка поверх уже нарисованного: сверху картинки — top, к низу — bottom (доля цвета color). */
function haze(g, w, h, color, top, bottom) {
  g.save();
  g.globalCompositeOperation = 'source-atop';
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, fade(color, top));
  grad.addColorStop(1, fade(color, bottom));
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  g.restore();
}

/**
 * Ряд домов-силуэтов во всю ширину, низом к низу картинки. o: color; bw — ширина дома [от, до]; bh — высота
 * (доля h) [от, до]; gap — просвет между домами; roof — на крышах антенны, будки и баки; beacon — цвет огонька
 * на антенне; win — окна { w, h, gx, gy, share — доля горящих, colors }.
 */
function houses(g, w, h, seed, o) {
  let x = -hash2(seed, 0) * o.bw[0] * 0.7;
  for (let i = 0; x < w; i++) {
    const bw = lerp(o.bw[0], o.bw[1], hash2(seed, i * 9 + 1));
    const bh = Math.round(h * lerp(o.bh[0], o.bh[1], hash2(seed, i * 9 + 2)));
    const top = h - bh;
    g.fillStyle = o.color;
    g.fillRect(x, top, bw, bh);
    const r = hash2(seed, i * 9 + 3);
    if (o.roof && bw > 22) {
      if (r < 0.3) {
        const mast = 9 + bh * 0.1;
        g.fillRect(x + bw * 0.5 - 0.6, top - mast, 1.2, mast);
        g.fillRect(x + bw * 0.5 - 3, top - mast * 0.62, 6, 1);
        if (o.beacon) {
          g.fillStyle = o.beacon;
          g.fillRect(x + bw * 0.5 - 1.3, top - mast - 1.6, 2.6, 2.6);
        }
      } else if (r < 0.52) g.fillRect(x + bw * 0.18, top - 5, bw * 0.3, 5);
      else if (r < 0.66) {
        g.fillRect(x + bw * 0.55, top - 10, 9, 7);
        g.fillRect(x + bw * 0.55 + 1.4, top - 3, 1.2, 3);
        g.fillRect(x + bw * 0.55 + 6.4, top - 3, 1.2, 3);
      } else if (r < 0.8) g.fillRect(x + bw * 0.14, top - bh * 0.07, bw * 0.72, bh * 0.07);
    }
    const win = o.win;
    if (win) {
      for (let wy = top + win.gy * 0.7; wy + win.h < h - 2; wy += win.gy) {
        for (let wx = x + win.gx * 0.45; wx + win.w < x + bw - win.gx * 0.25; wx += win.gx) {
          const t = hash2(seed * 31 + i, Math.round(wx * 7 + wy * 131));
          if (t >= win.share) continue;
          g.fillStyle = win.colors[Math.floor((t / win.share) * win.colors.length)];
          g.fillRect(wx, wy, win.w, win.h);
        }
      }
    }
    x += bw + lerp(o.gap[0], o.gap[1], hash2(seed, i * 9 + 4));
  }
}

/** Облако: гряда кругов с ровным дном; сверху светлее, снизу — в тени. */
function cloud(g, w, h, seed, top, bottom) {
  const n = 4 + Math.floor(hash2(seed, 1) * 3);
  const base = h * 0.86;
  g.save();
  g.beginPath();
  g.rect(0, 0, w, base);
  g.clip();
  const grad = g.createLinearGradient(0, h * 0.1, 0, base);
  grad.addColorStop(0, top);
  grad.addColorStop(1, bottom);
  g.fillStyle = grad;
  g.beginPath();
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    const r = h * (0.22 + 0.25 * Math.sin(u * Math.PI) ** 0.8 + 0.09 * hash2(seed, i + 2));
    const x = lerp(r, w - r, u);
    g.moveTo(x + r, base - r * 0.5);
    g.arc(x, base - r * 0.5, r, 0, TAU);
  }
  g.fill();
  g.restore();
}

/** Звёзды по всей картинке: мелкие — бледнее, изредка — яркие. */
function stars(g, w, h, seed, color, n) {
  for (let i = 0; i < n; i++) {
    const bright = hash2(seed, i * 3) < 0.13;
    circle(g, 4 + hash2(seed + 1, i) * (w - 8), 4 + hash2(seed + 2, i) * (h - 8), bright ? 1.15 : 0.45 + hash2(seed + 3, i) * 0.5,
      fade(color, bright ? 0.95 : 0.3 + hash2(seed, i * 3 + 1) * 0.45));
  }
}

/** Дерево: крона из кругов на коротком стволе. */
function tree(g, x, base, size, color) {
  g.fillStyle = color;
  g.fillRect(x - size * 0.05, base - size * 0.5, size * 0.1, size * 0.5);
  for (const [dx, dy, r] of [[0, -0.72, 0.3], [-0.2, -0.52, 0.24], [0.21, -0.54, 0.25], [0.02, -0.46, 0.26]]) {
    g.beginPath();
    g.arc(x + dx * size, base + dy * size, r * size, 0, TAU);
    g.fill();
  }
}

/** Светило: диск и сияние вокруг — посередине картинки. */
function sun(g, w, h, core, glow, r, strength = 0.7) {
  halo(g, w / 2, h / 2, w / 2, glow, strength);
  circle(g, w / 2, h / 2, r, core);
}

/** Месяц. */
function crescent(g, w, h, core, glow) {
  halo(g, w / 2, h / 2, w / 2, glow, 0.3);
  g.fillStyle = core;
  g.beginPath();
  g.arc(w / 2, h / 2, w * 0.2, 0, TAU);
  g.arc(w / 2 + w * 0.09, h / 2 - w * 0.05, w * 0.17, 0, TAU, true);
  g.fill('evenodd');
}

/** Стая птиц: галочки. */
function birds(g, w, h, seed, color) {
  g.strokeStyle = color;
  g.lineWidth = 1.2;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const n = 3 + Math.floor(hash2(seed, 5) * 3);
  for (let i = 0; i < n; i++) {
    const x = 6 + hash2(seed, i * 2 + 1) * (w - 12);
    const y = 5 + hash2(seed, i * 2 + 2) * (h - 9);
    const s = 2.6 + hash2(seed, i + 30) * 1.6;
    g.beginPath();
    g.moveTo(x - s, y - s * 0.4);
    g.quadraticCurveTo(x - s * 0.4, y - s * 0.7, x, y);
    g.quadraticCurveTo(x + s * 0.4, y - s * 0.7, x + s, y - s * 0.4);
    g.stroke();
  }
}

// ---------- двор на закате ----------

function yardNear(g, p, w, h) {
  const dark = mix(p.near, p.deco, 0.5);
  // два дома по краям
  houses(g, 112, h, 5, { color: p.near, bw: [52, 60], bh: [0.52, 0.7], gap: [2, 4], roof: true, win: { w: 4, h: 5, gx: 9, gy: 11, share: 0.22, colors: [p.lit, p.lit2] } });
  g.save();
  g.translate(192, 0);
  houses(g, 110, h, 8, { color: p.near, bw: [54, 62], bh: [0.66, 0.9], gap: [1, 3], roof: true, win: { w: 4, h: 5, gx: 9, gy: 11, share: 0.26, colors: [p.lit, p.lit] } });
  g.restore();
  // провода с птицами
  g.strokeStyle = fade(p.deco, 0.9);
  g.lineWidth = 0.8;
  for (const [y0, sag] of [[h - 122, 20], [h - 110, 26]]) {
    g.beginPath();
    g.moveTo(104, y0);
    g.quadraticCurveTo(150, y0 + sag, 196, y0 - 26);
    g.stroke();
  }
  for (const [x, y] of [[128, h - 111], [134, h - 109.4], [163, h - 112.6]]) {
    circle(g, x, y - 1.6, 1.7, p.deco);
    g.fillRect(x - 0.4, y - 1, 2.6, 1);
  }
  // деревья во дворе, фонарь
  for (const [x, s] of [[118, 58], [140, 74], [178, 62], [160, 46]]) tree(g, x, h - 26, s, dark);
  halo(g, 152, h - 98, 30, p.lit, 0.55);
  g.fillStyle = p.deco;
  g.fillRect(151.2, h - 96, 1.6, 72);
  g.fillRect(146, h - 97.4, 12, 1.6);
  circle(g, 147, h - 95.4, 2.2, p.lit);
  // кирпичный забор с надписью
  g.fillStyle = p.deco3;
  g.fillRect(0, h - 30, w, 30);
  g.fillStyle = fade(p.deco, 0.3);
  for (let row = 0; row < 5; row++) {
    g.fillRect(0, h - 30 + row * 6, w, 0.7);
    for (let x = row % 2 ? 7 : 0; x < w; x += 14) g.fillRect(x, h - 30 + row * 6, 0.7, 6);
  }
  g.fillStyle = mix(p.deco3, p.deco, 0.45);
  g.fillRect(0, h - 33, w, 3.4);
  g.save();
  g.translate(27, h - 9);
  g.rotate(-0.05);
  g.font = 'italic 900 15px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  g.lineJoin = 'round';
  g.lineWidth = 3;
  g.strokeStyle = fade(p.deco, 0.85);
  g.strokeText('ANYGAME', 0, 0);
  g.fillStyle = p.deco2;
  g.fillText('ANYGAME', 0, 0);
  g.restore();
  g.strokeStyle = p.lit2;
  g.lineWidth = 1.6;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(232, h - 20);
  g.lineTo(239, h - 9);
  g.lineTo(246, h - 20);
  g.lineTo(253, h - 9);
  g.lineTo(260, h - 20);
  g.stroke();
  g.fillStyle = p.deco;
  g.fillRect(0, h - 3, w, 3);
}

// ---------- ночной город ----------

/** Неоновая вывеска: светящаяся рамка с палочками внутри. */
function neonSign(g, x, y, w, h, color) {
  g.save();
  g.shadowColor = color;
  g.shadowBlur = 7;
  g.strokeStyle = color;
  g.lineWidth = 1.5;
  g.lineJoin = 'round';
  g.strokeRect(x, y, w, h);
  g.fillStyle = color;
  if (h > w) for (let i = 0; i < 4; i++) g.fillRect(x + 2.4, y + 3 + i * ((h - 4) / 4), w - 4.8, 1.5);
  else {
    g.beginPath();
    g.moveTo(x + 4, y + h - 4);
    for (let i = 1; i <= 6; i++) g.lineTo(x + 4 + (i * (w - 8)) / 6, y + (i % 2 ? 4 : h - 4));
    g.stroke();
  }
  g.restore();
}

function neonMid(g, p, w, h) {
  houses(g, w, h, 21, {
    color: p.mid, bw: [32, 62], bh: [0.42, 1], gap: [2, 12], roof: true, beacon: p.lit2,
    win: { w: 2.6, h: 3.4, gx: 6.4, gy: 8, share: 0.2, colors: [p.lit, p.lit2, p.deco, p.lit] },
  });
  neonSign(g, 58, h - 150, 9, 40, p.lit2);
  neonSign(g, 171, h - 205, 9, 46, p.lit);
  neonSign(g, 247, h - 118, 9, 34, p.deco);
  haze(g, w, h, p.sky0, 0, 0.5);
}

function neonNear(g, p, w, h) {
  houses(g, w, h, 34, {
    color: p.near, bw: [46, 86], bh: [0.34, 0.86], gap: [6, 22], roof: true, beacon: p.deco2,
    win: { w: 4.4, h: 5.4, gx: 10.5, gy: 12.5, share: 0.14, colors: [p.deco, p.lit, p.deco] },
  });
  neonSign(g, 96, h - 96, 52, 22, p.deco2);
  neonSign(g, 22, h - 132, 10, 44, p.lit);
  // зарево улиц
  const grad = g.createLinearGradient(0, h - 70, 0, h);
  grad.addColorStop(0, fade(p.deco3, 0));
  grad.addColorStop(1, fade(p.deco3, 0.5));
  g.fillStyle = grad;
  g.fillRect(0, h - 70, w, 70);
}

function moon(g, w, h, p) {
  halo(g, w / 2, h / 2, w / 2, p.orb2, 0.42);
  const r = w * 0.14;
  circle(g, w / 2, h / 2, r, p.orb);
  g.save();
  g.beginPath();
  g.arc(w / 2, h / 2, r, 0, TAU);
  g.clip();
  for (const [dx, dy, rr] of [[-0.3, -0.25, 0.26], [0.36, 0.14, 0.2], [-0.12, 0.44, 0.16], [0.24, -0.5, 0.12]]) {
    circle(g, w / 2 + dx * r, h / 2 + dy * r, rr * r, fade(p.orb2, 0.42));
  }
  // тень с правого края — объём
  const grad = g.createLinearGradient(w / 2 - r, 0, w / 2 + r, 0);
  grad.addColorStop(0.45, fade(p.sky2, 0));
  grad.addColorStop(1, fade(p.sky2, 0.55));
  g.fillStyle = grad;
  g.fillRect(w / 2 - r, h / 2 - r, r * 2, r * 2);
  g.restore();
}

// ---------- арена ----------

/** Ярус трибуны: ряды зрителей, проходы между секторами, ограждение со светящейся лентой. */
function tier(g, p, w, h, seed) {
  g.fillStyle = mix(p.mid, p.near, 0.25);
  g.fillRect(0, 0, w, h);
  const rows = 5;
  const rowH = (h - 14) / rows;
  const tones = [mix(p.cloud, p.mid, 0.3), p.cloud2, mix(p.cloud2, p.near, 0.4), mix(p.cloud2, p.deco, 0.4), mix(p.cloud2, p.deco2, 0.4),
    mix(p.cloud2, p.lit2, 0.3)];
  for (let r = 0; r < rows; r++) {
    const y = 4 + r * rowH;
    g.fillStyle = mix(p.mid, p.near, 0.62);
    g.fillRect(0, y + rowH * 0.7, w, rowH * 0.3);
    for (let x = (r % 2) * 3.6 + 3; x < w; x += 7.2) {
      // проход между секторами — каждые сто единиц
      if (Math.abs(((x + 25) % 100) - 50) > 45.5) continue;
      const t = hash2(seed * 13 + r, Math.round(x * 10));
      if (t < 0.1) continue;
      const tone = tones[Math.floor(hash2(seed + 7, Math.round(x * 10) + r * 977) * tones.length)];
      g.fillStyle = tone;
      g.beginPath();
      g.ellipse(x, y + rowH * 0.74, 3.2, rowH * 0.34, 0, 0, TAU);
      g.fill();
      circle(g, x, y + rowH * 0.3, 2.25, mix(tone, p.cloud, 0.45));
    }
  }
  // ступени проходов
  g.fillStyle = mix(p.mid, p.far, 0.5);
  for (let x = 25; x < w + 10; x += 100) {
    g.fillRect(x - 54.5, 0, 9, h - 12);
  }
  // ограждение и лента рекламы на нём
  g.fillStyle = p.far;
  g.fillRect(0, h - 12, w, 12);
  for (let x = 2; x < w; x += 22) {
    g.fillStyle = fade([p.lit, p.deco, p.lit2, p.deco2][Math.floor(hash2(seed, Math.round(x)) * 4)], 0.6);
    g.fillRect(x, h - 8.5, 16, 4);
  }
  g.fillStyle = fade(p.near, 0.7);
  g.fillRect(0, h - 2, w, 2);
  // трибуны в полутьме (свет — на площадке); чем выше ряд, тем дальше и темнее
  haze(g, w, h, p.sky3, 0.62, 0.36);
}

/** Паркет площадки внизу: доски сходятся вдаль, белая разметка, отблеск ламп. */
function court(g, p, w, h) {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, mix(p.deco3, p.near, 0.45));
  grad.addColorStop(1, p.deco3);
  g.fillStyle = grad;
  g.fillRect(0, 10, w, h - 10);
  g.strokeStyle = fade(p.near, 0.22);
  g.lineWidth = 0.8;
  g.beginPath();
  for (let i = -14; i <= 14; i++) {
    g.moveTo(w / 2 + i * 13, 10);
    g.lineTo(w / 2 + i * 34, h);
  }
  g.stroke();
  // разметка: дуга трёхочковой и лицевая линия
  g.strokeStyle = fade(p.cloud, 0.85);
  g.lineWidth = 2;
  g.beginPath();
  g.ellipse(w / 2, h + 26, 132, 62, 0, Math.PI, TAU);
  g.moveTo(0, 16);
  g.lineTo(w, 16);
  g.stroke();
  halo(g, w / 2, h * 0.7, 120, p.lit, 0.22);
  // борт с бегущей рекламой
  g.fillStyle = p.near;
  g.fillRect(0, 0, w, 11);
  for (let x = 4; x < w; x += 37) {
    g.fillStyle = fade([p.deco, p.lit2, p.deco2][Math.floor(hash2(3, x) * 3)], 0.9);
    g.fillRect(x, 2.5, 29, 6);
  }
}

/** Ферма под крышей с прожекторами и столбами света от них. */
function rig(g, p, w, h) {
  // столбы света
  for (const [x, lean] of [[40, 0.34], [110, 0.12], [190, -0.12], [260, -0.34]]) {
    const grad = g.createLinearGradient(0, 22, 0, h);
    grad.addColorStop(0, fade(p.lit2, 0.2));
    grad.addColorStop(1, fade(p.lit2, 0));
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(x - 4, 22);
    g.lineTo(x + 4, 22);
    g.lineTo(x + lean * h + 62, h);
    g.lineTo(x + lean * h - 62, h);
    g.closePath();
    g.fill();
  }
  // ферма: два пояса и раскосы
  g.strokeStyle = p.near;
  g.lineWidth = 1.6;
  g.beginPath();
  g.moveTo(0, 3);
  g.lineTo(w, 3);
  g.moveTo(0, 15);
  g.lineTo(w, 15);
  for (let x = 0; x <= w; x += 15) {
    g.moveTo(x, 3);
    g.lineTo(x + 7.5, 15);
    g.lineTo(x + 15, 3);
  }
  g.stroke();
  for (const x of [40, 110, 190, 260]) {
    g.fillStyle = p.near;
    g.fillRect(x - 6, 15, 12, 7);
    halo(g, x, 23, 22, p.lit, 0.8);
    circle(g, x, 23, 3.4, p.lit);
  }
}

/** Вымпелы под крышей: номера, выведенные из обращения. */
function banners(g, p, w, h) {
  g.fillStyle = p.near;
  g.fillRect(0, 0, w, 2.4);
  const colors = [p.deco, p.deco2, p.lit2, p.deco, p.deco2];
  ['23', '8', '11', '34', '7'].forEach((num, i) => {
    const x = 18 + i * 56;
    g.fillStyle = mix(colors[i], p.sky3, 0.25);
    g.beginPath();
    g.moveTo(x, 2);
    g.lineTo(x + 40, 2);
    g.lineTo(x + 40, h - 12);
    g.lineTo(x + 20, h);
    g.lineTo(x, h - 12);
    g.closePath();
    g.fill();
    g.fillStyle = fade(p.cloud, 0.3);
    g.fillRect(x, 6, 40, 2);
    g.save();
    g.translate(x + 20 - scoreWidth(num, 20) / 2 - 1, 14);
    drawScore(g, num, 20, fade(p.cloud, 0.92));
    g.restore();
  });
}

/** Куб с табло под крышей. */
function jumbotron(g, p, w, h) {
  g.strokeStyle = p.near;
  g.lineWidth = 1.2;
  g.beginPath();
  for (const x of [w * 0.22, w * 0.78]) {
    g.moveTo(x, 0);
    g.lineTo(x, h - 62);
  }
  g.stroke();
  halo(g, w / 2, h - 34, 70, p.orb2, 0.22);
  g.fillStyle = p.near;
  g.beginPath();
  g.moveTo(8, h - 64);
  g.lineTo(w - 8, h - 64);
  g.lineTo(w - 16, h - 6);
  g.lineTo(16, h - 6);
  g.closePath();
  g.fill();
  g.fillStyle = mix(p.near, p.orb2, 0.2);
  g.fillRect(16, h - 58, w - 32, 44);
  g.fillStyle = fade(p.near, 0.85);
  g.fillRect(w / 2 - 1, h - 58, 2, 44);
  for (const [str, x, color] of [['88', 24, p.lit], ['86', w / 2 + 8, p.orb2]]) {
    g.save();
    g.translate(x, h - 50);
    drawScore(g, str, 28, color);
    g.restore();
  }
  g.fillStyle = p.deco;
  g.fillRect(12, h - 12, w - 24, 4);
}

// ---------- пляж ----------

function palmLeaf(g, x, y, ang, len) {
  const ex = x + Math.cos(ang) * len;
  const ey = y + Math.sin(ang) * len + len * 0.42;
  const mx = x + Math.cos(ang) * len * 0.55;
  const my = y + Math.sin(ang) * len * 0.55 - len * 0.1;
  g.beginPath();
  g.moveTo(x, y);
  g.quadraticCurveTo(mx, my - len * 0.14, ex, ey);
  g.quadraticCurveTo(mx, my + len * 0.2, x, y);
  g.fill();
}

/** Пальма: изогнутый ствол, листья веером; lean — куда клонится. */
function palm(g, x, base, height, lean, trunk, leaf) {
  const at = (u) => [x + lean * height * 0.5 * u * u, base - height * u];
  g.strokeStyle = trunk;
  g.lineCap = 'round';
  for (let i = 0; i < 12; i++) {
    g.lineWidth = lerp(7.4, 3.6, i / 12);
    g.beginPath();
    g.moveTo(...at(i / 12));
    g.lineTo(...at((i + 1) / 12));
    g.stroke();
  }
  const [tx, ty] = at(1);
  g.fillStyle = leaf;
  for (const [ang, len] of [[-3.3, 0.3], [-2.85, 0.44], [-2.3, 0.5], [-1.75, 0.44], [-1.3, 0.47], [-0.75, 0.5], [-0.25, 0.44], [0.2, 0.3]]) {
    palmLeaf(g, tx, ty, ang, len * height);
  }
  circle(g, tx - 2, ty + 3, 2.6, trunk);
  circle(g, tx + 3, ty + 4, 2.4, trunk);
}

function sea(g, p, w, h) {
  const horizon = 44;
  // остров и парус на горизонте
  g.fillStyle = p.far;
  g.beginPath();
  g.moveTo(18, horizon);
  g.quadraticCurveTo(46, horizon - 30, 78, horizon - 12);
  g.quadraticCurveTo(100, horizon - 20, 124, horizon);
  g.closePath();
  g.fill();
  g.fillStyle = p.cloud;
  g.beginPath();
  g.moveTo(206, horizon - 3);
  g.lineTo(206, horizon - 24);
  g.lineTo(219, horizon - 3);
  g.closePath();
  g.fill();
  g.fillStyle = p.deco2;
  g.fillRect(200, horizon - 3, 22, 3);
  const grad = g.createLinearGradient(0, horizon, 0, h);
  grad.addColorStop(0, mix(p.mid, p.sky0, 0.5));
  grad.addColorStop(0.3, p.mid);
  grad.addColorStop(1, mix(p.mid, p.sky4, 0.45));
  g.fillStyle = grad;
  g.fillRect(0, horizon, w, h - horizon);
  // волны и дорожка солнца
  g.lineCap = 'round';
  for (let i = 0; i < 46; i++) {
    const u = hash2(51, i);
    const y = horizon + 3 + u * u * (h - horizon - 6);
    const len = 5 + u * 22;
    g.strokeStyle = fade(p.cloud, 0.16 + 0.22 * hash2(52, i));
    g.lineWidth = 0.7 + u;
    g.beginPath();
    g.moveTo(hash2(53, i) * w, y);
    g.lineTo(hash2(53, i) * w + len, y);
    g.stroke();
  }
  for (let i = 0; i < 26; i++) {
    const u = hash2(61, i);
    const y = horizon + 2 + u * (h - horizon - 30);
    const spread = 5 + u * 30;
    g.strokeStyle = fade(p.lit, 0.75 - u * 0.4);
    g.lineWidth = 1 + u * 0.8;
    g.beginPath();
    g.moveTo(w * 0.72 + (hash2(62, i) - 0.5) * spread * 2, y);
    g.lineTo(w * 0.72 + (hash2(62, i) - 0.5) * spread * 2 + 4 + u * 8, y);
    g.stroke();
  }
}

function shore(g, p, w, h) {
  // дюна
  const grad = g.createLinearGradient(0, h - 62, 0, h);
  grad.addColorStop(0, p.near);
  grad.addColorStop(1, mix(p.near, p.deco2, 0.3));
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(0, h);
  g.lineTo(0, h - 50);
  g.bezierCurveTo(70, h - 68, 130, h - 30, 200, h - 40);
  g.bezierCurveTo(240, h - 46, 270, h - 58, w, h - 52);
  g.lineTo(w, h);
  g.closePath();
  g.fill();
  // зонт и полотенце
  g.save();
  g.translate(150, h - 36);
  g.rotate(0.1);
  g.fillStyle = p.deco2;
  g.fillRect(-0.9, -40, 1.8, 46);
  g.scale(1, 0.6);
  for (let i = 0; i < 6; i++) {
    g.fillStyle = i % 2 ? p.cloud : p.deco3;
    g.beginPath();
    g.moveTo(0, -66);
    g.arc(0, -66, 27, Math.PI + (i * Math.PI) / 6, Math.PI + ((i + 1) * Math.PI) / 6 + 0.01);
    g.closePath();
    g.fill();
  }
  g.restore();
  g.save();
  g.translate(170, h - 27);
  g.rotate(-0.07);
  g.fillStyle = p.deco3;
  g.fillRect(0, 0, 26, 9);
  g.fillStyle = p.cloud;
  g.fillRect(0, 3, 26, 3);
  g.restore();
  palm(g, 26, h - 46, 190, 0.5, p.deco2, p.deco);
  palm(g, 286, h - 50, 150, -0.5, p.deco2, mix(p.deco, p.near, 0.14));
  palm(g, 230, h - 42, 84, -0.24, p.deco2, p.deco);
}

/** Воздушный шар: полосатый купол и корзина. */
function balloon(g, p, w, h, seed) {
  const r = w * 0.46;
  const cx = w / 2;
  const cy = r + 1;
  const colors = seed % 2 ? [p.deco3, p.cloud, p.lit2] : [p.lit2, p.deco3, p.cloud];
  g.save();
  g.beginPath();
  g.arc(cx, cy, r, Math.PI * 0.86, Math.PI * 0.14);
  g.lineTo(cx + r * 0.2, h - 13);
  g.lineTo(cx - r * 0.2, h - 13);
  g.closePath();
  g.clip();
  for (let i = 0; i < 6; i++) {
    g.fillStyle = colors[i % 3];
    g.fillRect(cx - r + (i * r) / 3, 0, r / 3 + 0.5, h);
  }
  // объём: справа тень
  const grad = g.createLinearGradient(cx - r, 0, cx + r, 0);
  grad.addColorStop(0, fade(p.cloud, 0.25));
  grad.addColorStop(0.45, fade(p.cloud, 0));
  grad.addColorStop(1, fade(p.sky4, 0.4));
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  g.restore();
  g.strokeStyle = p.deco2;
  g.lineWidth = 0.7;
  g.beginPath();
  g.moveTo(cx - r * 0.2, h - 13);
  g.lineTo(cx - 3.4, h - 7);
  g.moveTo(cx + r * 0.2, h - 13);
  g.lineTo(cx + 3.4, h - 7);
  g.stroke();
  g.fillStyle = p.deco2;
  g.fillRect(cx - 4, h - 7.5, 8, 6.5);
}

function kite(g, p, w, h) {
  g.strokeStyle = fade(p.cloud, 0.9);
  g.lineWidth = 0.9;
  g.beginPath();
  g.moveTo(w * 0.42, h * 0.3);
  g.bezierCurveTo(w * 0.3, h * 0.5, w * 0.7, h * 0.66, w * 0.5, h);
  g.stroke();
  g.save();
  g.translate(w * 0.42, h * 0.18);
  g.rotate(0.5);
  g.fillStyle = p.deco3;
  g.beginPath();
  g.moveTo(0, -13);
  g.lineTo(9, 0);
  g.lineTo(0, 17);
  g.lineTo(-9, 0);
  g.closePath();
  g.fill();
  g.fillStyle = p.lit2;
  g.beginPath();
  g.moveTo(0, -13);
  g.lineTo(9, 0);
  g.lineTo(0, 0);
  g.closePath();
  g.fill();
  g.restore();
}

// ---------- космос ----------

function earth(g, p, w, h) {
  const r = w * 0.2;
  const cx = w / 2;
  const cy = h / 2;
  halo(g, cx, cy, w / 2, p.orb2, 0.5);
  g.save();
  g.beginPath();
  g.arc(cx, cy, r, 0, TAU);
  g.clip();
  const sea0 = g.createRadialGradient(cx - r * 0.4, cy - r * 0.4, 0, cx, cy, r * 1.3);
  sea0.addColorStop(0, mix(p.orb, p.star, 0.3));
  sea0.addColorStop(1, mix(p.orb, p.sky2, 0.3));
  g.fillStyle = sea0;
  g.fillRect(cx - r, cy - r, r * 2, r * 2);
  g.fillStyle = p.deco;
  for (const pts of [
    [[-0.7, -0.5], [-0.2, -0.72], [0.1, -0.4], [-0.1, -0.05], [-0.42, 0.16], [-0.64, -0.1]],
    [[0.24, -0.1], [0.6, -0.3], [0.86, 0.1], [0.56, 0.5], [0.2, 0.34]],
    [[-0.3, 0.46], [0.02, 0.4], [0.1, 0.8], [-0.24, 0.9]],
  ]) {
    g.beginPath();
    pts.forEach(([x, y], i) => {
      const nx = pts[(i + 1) % pts.length];
      if (!i) g.moveTo(cx + ((x + nx[0]) / 2) * r, cy + ((y + nx[1]) / 2) * r);
      const nn = pts[(i + 2) % pts.length];
      g.quadraticCurveTo(cx + nx[0] * r, cy + nx[1] * r, cx + ((nx[0] + nn[0]) / 2) * r, cy + ((nx[1] + nn[1]) / 2) * r);
    });
    g.fill();
  }
  g.strokeStyle = fade(p.star, 0.7);
  g.lineWidth = r * 0.09;
  g.lineCap = 'round';
  for (const [x, y, len, bend] of [[-0.5, -0.2, 0.7, 0.1], [0, 0.22, 0.8, -0.12], [-0.6, 0.6, 0.6, 0.08], [0.2, -0.62, 0.5, -0.06]]) {
    g.beginPath();
    g.moveTo(cx + x * r, cy + y * r);
    g.quadraticCurveTo(cx + (x + len / 2) * r, cy + (y + bend * 2) * r, cx + (x + len) * r, cy + (y + bend) * r);
    g.stroke();
  }
  // ночная сторона
  const night = g.createLinearGradient(cx - r * 0.5, cy - r * 0.6, cx + r, cy + r * 0.9);
  night.addColorStop(0.35, fade(p.sky4, 0));
  night.addColorStop(0.95, fade(p.sky4, 0.9));
  g.fillStyle = night;
  g.fillRect(cx - r, cy - r, r * 2, r * 2);
  g.restore();
}

/** Планета с кольцом (ring) или без: полосы, тень, кольцо спереди и сзади. */
function planet(g, w, h, body, stripe, shade, ring) {
  const r = ring ? w * 0.24 : w * 0.46;
  const cx = w / 2;
  const cy = h / 2;
  const half = (front) => {
    if (!ring) return;
    g.save();
    g.translate(cx, cy);
    g.rotate(-0.36);
    for (const [k, a, lw] of [[1.95, 0.75, r * 0.2], [1.62, 0.45, r * 0.1]]) {
      g.strokeStyle = fade(ring, a);
      g.lineWidth = lw;
      g.beginPath();
      g.ellipse(0, 0, r * k, r * k * 0.3, 0, front ? 0 : Math.PI, front ? Math.PI : TAU);
      g.stroke();
    }
    g.restore();
  };
  half(false);
  g.save();
  g.beginPath();
  g.arc(cx, cy, r, 0, TAU);
  g.clip();
  g.fillStyle = body;
  g.fillRect(cx - r, cy - r, r * 2, r * 2);
  g.translate(cx, cy);
  g.rotate(ring ? -0.36 : -0.18);
  g.fillStyle = stripe;
  for (const [y, t] of [[-0.62, 0.14], [-0.3, 0.1], [0.02, 0.2], [0.44, 0.12], [0.7, 0.2]]) g.fillRect(-r * 1.2, y * r, r * 2.4, t * r);
  if (!ring) {
    g.fillStyle = fade(shade, 0.35);
    g.beginPath();
    g.ellipse(r * 0.3, r * 0.14, r * 0.26, r * 0.13, 0, 0, TAU);
    g.fill();
  }
  g.rotate(ring ? 0.36 : 0.18);
  const grad = g.createLinearGradient(-r * 0.6, -r * 0.6, r, r * 0.8);
  grad.addColorStop(0.3, fade(shade, 0));
  grad.addColorStop(1, fade(shade, 0.85));
  g.fillStyle = grad;
  g.fillRect(-r, -r, r * 2, r * 2);
  g.restore();
  half(true);
}

function lunar(g, p, w, h) {
  const grad = g.createLinearGradient(0, h - 74, 0, h);
  grad.addColorStop(0, mix(p.mid, p.star, 0.18));
  grad.addColorStop(1, mix(p.mid, p.near, 0.7));
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(0, h);
  g.lineTo(0, h - 52);
  g.bezierCurveTo(50, h - 76, 96, h - 44, 150, h - 54);
  g.bezierCurveTo(196, h - 62, 240, h - 80, w, h - 58);
  g.lineTo(w, h);
  g.closePath();
  g.fill();
  for (const [x, y, rx] of [[44, h - 34, 18], [128, h - 22, 26], [214, h - 40, 14], [262, h - 20, 20], [88, h - 12, 12]]) {
    g.fillStyle = mix(p.mid, p.near, 0.62);
    g.beginPath();
    g.ellipse(x, y, rx, rx * 0.3, 0, 0, TAU);
    g.fill();
    g.strokeStyle = fade(p.star, 0.4);
    g.lineWidth = 1;
    g.beginPath();
    g.ellipse(x, y, rx, rx * 0.3, 0, 0.1, Math.PI - 0.1);
    g.stroke();
  }
  // флажок
  g.fillStyle = p.star;
  g.fillRect(176, h - 84, 1.2, 28);
  g.fillStyle = p.lit2;
  g.fillRect(177, h - 84, 14, 9);
}

function ridge(g, p, w, h) {
  g.fillStyle = p.far;
  g.beginPath();
  g.moveTo(0, h);
  let x = 0;
  for (let i = 0; x <= w + 30; i++) {
    g.lineTo(x, h - (i % 2 ? 26 + hash2(71, i) * 52 : 8 + hash2(72, i) * 22));
    x += 16 + hash2(73, i) * 26;
  }
  g.lineTo(w, h);
  g.closePath();
  g.fill();
  haze(g, w, h, p.sky0, 0, 0.6);
}

function nebula(g, p, w, h, seed) {
  halo(g, w * 0.42, h * 0.5, w * 0.42, seed % 2 ? p.cloud : p.cloud2, 0.3);
  halo(g, w * 0.66, h * 0.42, w * 0.3, seed % 2 ? p.cloud2 : p.cloud, 0.22);
}

function rock(g, p, w, h, seed) {
  const cx = w / 2;
  const cy = h / 2;
  g.fillStyle = p.near;
  g.beginPath();
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU;
    const r = w * (0.3 + 0.16 * hash2(seed + 80, i));
    g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.82);
  }
  g.closePath();
  g.fill();
  g.strokeStyle = fade(p.star, 0.35);
  g.lineWidth = 1;
  g.beginPath();
  g.arc(cx, cy, w * 0.34, Math.PI * 1.05, Math.PI * 1.6);
  g.stroke();
  circle(g, cx + w * 0.08, cy + h * 0.06, w * 0.08, fade(p.sky4, 0.5));
}

function comet(g, p, w, h) {
  const grad = g.createLinearGradient(w * 0.8, h * 0.76, 0, 0);
  grad.addColorStop(0, fade(p.star, 0.65));
  grad.addColorStop(1, fade(p.star, 0));
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(w * 0.83, h * 0.7);
  g.lineTo(0, 0);
  g.lineTo(w * 0.76, h * 0.83);
  g.closePath();
  g.fill();
  halo(g, w * 0.8, h * 0.77, 12, p.orb2, 0.8);
  circle(g, w * 0.8, h * 0.77, 2.6, p.star);
}

// ---------- сцены ----------

const CLOUDS = (rate, from, to, every, w, drift, strength = 1, dim = null) => ({
  kind: 'many', rate, from, to, every, w, ratio: 0.36, variants: 3, drift, dim,
  paint: (g, p, cw, ch, seed) => cloud(g, cw, ch, seed, fade(p.cloud, strength), fade(p.cloud2, strength * 0.92)),
});

export const SCENES = {
  // город в цветах темы: спокойные силуэты, редкие огни в окнах
  city: {
    skyRate: 0.3,
    sky: [[0, 'sky0'], [170, 'sky1'], [430, 'sky2'], [900, 'sky3'], [1700, 'sky4']],
    layers: [
      { kind: 'tile', rate: 0.05, h: 420, fade: [500, 2200], paint: (g, p, w, h) => stars(g, w, h, 3, p.star, 70) },
      { kind: 'twinkle', rate: 0.05, fade: [700, 2400], cell: 110, color: 'star', size: 1.5 },
      { kind: 'one', rate: 0.07, x: 0.7, at: 190, w: 250, h: 250, paint: (g, p, w, h) => {
        sun(g, w, h, p.orb, p.orb2, 27, 0.34);
        g.strokeStyle = fade(p.orb2, 0.5);
        g.lineWidth = 1.2;
        g.beginPath();
        g.arc(w / 2, h / 2, 40, 0, TAU);
        g.stroke();
      } },
      { kind: 'band', rate: 0.11, at: 0, h: 190, soft: true, paint: (g, p, w, h) => {
        houses(g, w, h, 2, { color: p.far, bw: [16, 44], bh: [0.3, 1], gap: [0, 9], roof: true });
        haze(g, w, h, p.sky0, 0, 0.6);
      } },
      CLOUDS(0.15, 230, 1700, 150, [100, 170], 2),
      { kind: 'band', rate: 0.2, at: 0, h: 270, paint: (g, p, w, h) => {
        houses(g, w, h, 6, {
          color: p.mid, bw: [30, 64], bh: [0.36, 1], gap: [3, 14], roof: true, beacon: p.lit,
          win: { w: 2.4, h: 3.6, gx: 6.5, gy: 9, share: 0.13, colors: [p.lit, p.lit2] },
        });
        haze(g, w, h, p.sky0, 0, 0.3);
      } },
      { kind: 'band', rate: 0.33, at: 0, h: 190, paint: (g, p, w, h) => {
        houses(g, w, h, 9, {
          color: p.near, bw: [46, 90], bh: [0.3, 0.82], gap: [8, 26], roof: true,
          win: { w: 4, h: 5.4, gx: 10, gy: 13, share: 0.1, colors: [p.lit, p.lit2] },
        });
        for (const [x, s] of [[14, 52], [84, 64], [150, 48], [206, 70], [270, 56]]) tree(g, x, h, s, p.deco3);
        g.fillStyle = p.deco3;
        g.fillRect(0, h - 5, w, 5);
      } },
      CLOUDS(0.3, 460, 3600, 250, [150, 230], 4),
    ],
  },
  // двор на закате: панельные дома, провода с птицами, фонарь, забор с надписью
  sunset: {
    skyRate: 0.3,
    sky: [[0, 'sky0'], [150, 'sky1'], [400, 'sky2'], [880, 'sky3'], [1700, 'sky4']],
    layers: [
      { kind: 'tile', rate: 0.05, h: 420, fade: [1500, 3400], paint: (g, p, w, h) => stars(g, w, h, 11, p.star, 90) },
      { kind: 'twinkle', rate: 0.05, fade: [1700, 3600], cell: 100, color: 'star', size: 1.6 },
      { kind: 'one', rate: 0.07, x: 0.5, at: 8, w: 300, h: 300, paint: (g, p, w, h) => sun(g, w, h, p.orb, p.orb2, 31, 0.8) },
      { kind: 'one', rate: 0.06, x: 0.24, at: 610, w: 70, h: 70, paint: (g, p, w, h) => crescent(g, w, h, p.star, p.star) },
      { kind: 'band', rate: 0.11, at: 0, h: 160, soft: true, paint: (g, p, w, h) => {
        houses(g, w, h, 12, { color: p.far, bw: [22, 56], bh: [0.3, 1], gap: [0, 7], roof: true });
        haze(g, w, h, p.sky0, 0, 0.55);
      } },
      CLOUDS(0.15, 220, 1500, 130, [100, 170], 2, 0.9, [1500, 3200, 0.3]),
      { kind: 'band', rate: 0.21, at: 0, h: 240, paint: (g, p, w, h) => {
        houses(g, w, h, 14, {
          color: p.mid, bw: [64, 112], bh: [0.48, 1], gap: [3, 14], roof: true,
          win: { w: 3, h: 4.2, gx: 7.4, gy: 9.2, share: 0.3, colors: [p.lit, p.lit, p.lit2] },
        });
        haze(g, w, h, p.sky1, 0, 0.32);
      } },
      { kind: 'many', rate: 0.27, from: 280, to: 1000, every: 240, w: [50, 50], ratio: 0.5, variants: 3, drift: 7,
        paint: (g, p, w, h, seed) => birds(g, w, h, seed, p.deco) },
      { kind: 'band', rate: 0.34, at: 0, h: 205, paint: yardNear },
      CLOUDS(0.3, 440, 3400, 230, [150, 240], 4, 0.95, [1500, 3200, 0.3]),
    ],
  },
  // арена: паркет, трибуны с вспышками камер, куб с табло, вымпелы и прожекторы под крышей
  arena: {
    skyRate: 0.22,
    sky: [[0, 'sky0'], [130, 'sky1'], [360, 'sky2'], [760, 'sky3'], [1400, 'sky4']],
    layers: [
      { kind: 'band', rate: 0.22, at: 50, h: 90, every: 90, until: 500, variants: 3, paint: tier },
      { kind: 'twinkle', rate: 0.22, from: 56, to: 500, cell: 42, color: 'star', size: 2.3, quick: true },
      { kind: 'band', rate: 0.22, at: 590, h: 64, paint: banners },
      { kind: 'band', rate: 0.26, at: 400, h: 330, soft: true, paint: rig },
      { kind: 'band', rate: 0.26, at: 1150, h: 330, every: 620, soft: true, paint: rig },
      { kind: 'one', rate: 0.3, x: 0.5, at: 470, w: 150, h: 150, paint: jumbotron },
      { kind: 'band', rate: 0.5, at: 0, h: 62, paint: court },
      { kind: 'twinkle', rate: 0.3, fade: [2600, 3600], cell: 120, color: 'lit', size: 1.2 },
    ],
  },
  // ночной город: неон, вывески, луна
  neon: {
    skyRate: 0.26,
    sky: [[0, 'sky0'], [170, 'sky1'], [460, 'sky2'], [950, 'sky3'], [1700, 'sky4']],
    layers: [
      { kind: 'tile', rate: 0.04, h: 420, fade: null, paint: (g, p, w, h) => stars(g, w, h, 23, p.star, 80) },
      { kind: 'twinkle', rate: 0.04, cell: 100, color: 'star', size: 1.6 },
      { kind: 'one', rate: 0.06, x: 0.27, at: 250, w: 260, h: 260, paint: (g, p, w, h) => moon(g, w, h, p) },
      { kind: 'band', rate: 0.1, at: 0, h: 250, soft: true, paint: (g, p, w, h) => {
        houses(g, w, h, 25, {
          color: p.far, bw: [14, 34], bh: [0.34, 1], gap: [0, 6], roof: true,
          win: { w: 1.4, h: 1.8, gx: 4.6, gy: 6.4, share: 0.2, colors: [fade(p.lit, 0.5), fade(p.lit2, 0.5)] },
        });
        haze(g, w, h, p.sky0, 0, 0.62);
      } },
      { kind: 'band', rate: 0.2, at: 0, h: 320, paint: neonMid },
      CLOUDS(0.26, 520, 3200, 260, [150, 230], 3, 0.82),
      { kind: 'band', rate: 0.34, at: 0, h: 240, paint: neonNear },
    ],
  },
  // пляж: море с дорожкой солнца, пальмы, воздушные шары и змей
  beach: {
    skyRate: 0.3,
    sky: [[0, 'sky0'], [200, 'sky1'], [560, 'sky2'], [1200, 'sky3'], [2100, 'sky4']],
    layers: [
      { kind: 'tile', rate: 0.05, h: 420, fade: [3300, 5200], paint: (g, p, w, h) => stars(g, w, h, 41, p.star, 80) },
      { kind: 'one', rate: 0.05, x: 0.72, at: 300, w: 280, h: 280, paint: (g, p, w, h) => sun(g, w, h, p.orb, p.orb2, 24, 0.85) },
      CLOUDS(0.1, 190, 1500, 120, [70, 120], 1.5, 0.85),
      { kind: 'band', rate: 0.16, at: 0, h: 150, paint: sea },
      { kind: 'many', rate: 0.22, from: 240, to: 1100, every: 230, w: [50, 50], ratio: 0.5, variants: 3, drift: 7,
        paint: (g, p, w, h, seed) => birds(g, w, h, seed, p.cloud) },
      CLOUDS(0.24, 300, 3400, 190, [130, 220], 4, 1, [3000, 5000, 0.35]),
      { kind: 'many', rate: 0.3, from: 520, to: 3000, every: 520, w: [54, 66], ratio: 1.45, variants: 2, drift: 3, paint: balloon },
      { kind: 'one', rate: 0.36, x: 0.2, at: 330, w: 70, h: 130, paint: kite },
      { kind: 'band', rate: 0.42, at: 0, h: 250, paint: shore },
    ],
  },
  // космос: от лунной поверхности — мимо Земли, планет и туманностей
  space: {
    skyRate: 0.2,
    sky: [[0, 'sky0'], [260, 'sky1'], [640, 'sky2'], [1200, 'sky3'], [2000, 'sky4']],
    layers: [
      { kind: 'many', rate: 0.05, from: 120, to: 9000, every: 330, w: [260, 360], ratio: 0.8, variants: 2, drift: 0, paint: nebula },
      { kind: 'tile', rate: 0.03, h: 420, fade: null, paint: (g, p, w, h) => stars(g, w, h, 31, p.star, 110) },
      { kind: 'tile', rate: 0.09, h: 520, fade: null, paint: (g, p, w, h) => stars(g, w, h, 37, p.star, 46) },
      { kind: 'twinkle', rate: 0.03, cell: 80, color: 'star', size: 1.8 },
      { kind: 'one', rate: 0.05, x: 0.27, at: 200, w: 240, h: 240, paint: earth },
      { kind: 'one', rate: 0.11, x: 0.76, at: 620, w: 150, h: 150, paint: (g, p, w, h) => planet(g, w, h, p.deco2, p.deco3, p.sky4, p.lit) },
      { kind: 'one', rate: 0.09, x: 0.2, at: 1020, w: 120, h: 120, paint: (g, p, w, h) => planet(g, w, h, p.lit2, p.deco3, p.sky4, null) },
      { kind: 'one', rate: 0.14, x: 0.6, at: 1500, w: 150, h: 130, paint: comet },
      { kind: 'band', rate: 0.2, at: 0, h: 100, soft: true, paint: ridge },
      { kind: 'many', rate: 0.3, from: 420, to: 9000, every: 250, w: [14, 34], ratio: 1, variants: 4, drift: 5, paint: rock },
      { kind: 'band', rate: 0.46, at: 0, h: 96, paint: lunar },
    ],
  },
};

/**
 * Небо сцены — полоска шириной в одну точку и высотой n: внизу цвет у земли, вверху — на высоте top (выше небо
 * уже не меняется). В кадре из неё вырезается окно и растягивается на весь экран.
 */
export function paintSky(g, scene, pal, n, top) {
  const grad = g.createLinearGradient(0, n, 0, 0);
  for (const [at, key] of scene.sky) grad.addColorStop(Math.min(1, at / top), pal[key]);
  g.fillStyle = grad;
  g.fillRect(0, 0, 1, n);
}

/** Размер заготовки слоя в единицах мира: [ширина, высота] (у россыпи — для картинки номер variant). */
export function layerSize(L, variant = 0) {
  if (L.kind === 'band' || L.kind === 'tile') return [W, L.h];
  if (L.kind === 'one') return [L.w, L.h];
  const w = Math.round(lerp(L.w[0], L.w[1], (variant + 0.5) / L.variants));
  return [w, Math.round(w * L.ratio)];
}
