// Мелочи «Лисьей охоты»: тени, пыль, искры и вспышки (fx.*), то, что подбирают с земли (pick.*), и всё, что
// летит (shot.*). Маленькие картинки, которые должны читаться на телефоне на любой земле — от снега до осенней
// рыжей листвы: у каждой яркая середина и тёмный (или светящийся) край. Без DOM.
//
// Привязка: у вспышек и снарядов — середина картинки (их вертят и растягивают), у того, что стоит на земле
// (подбираемое, пламя), — низ посередине. Снаряд смотрит вправо (+x): рендер поворачивает его по полёту.
// Размеры — в единицах мира; на телефоне единица — чуть больше пикселя, поэтому линий тоньше 0,7 здесь нет.

import { defineSprite } from './art.js';
import {
  TAU, COLORS, INK, alpha, mix, tone, radial, linear, glow, speck, shine, sparkle,
  solid, blob, ball, capsule, leaf, stroke, pathBlob, pathStar, pathEllipse, pathPoly,
} from './art-kit.js';

/** Картинка с привязкой посередине: paint(g, v) рисует вокруг нуля. */
function centered(key, w, h, paint, variants = 1, pad = 1) {
  defineSprite(key, {
    w, h, ox: w / 2, oy: h / 2, variants, pad,
    paint(g, v) {
      g.translate(w / 2, h / 2);
      paint(g, v);
    },
  });
}

/** Картинка, стоящая на земле: привязка — низ посередине; paint(g, v) рисует вверх от нуля. */
function standing(key, w, h, paint, variants = 1, pad = 1) {
  defineSprite(key, {
    w, h, ox: w / 2, oy: h, variants, pad,
    paint(g, v) {
      g.translate(w / 2, h);
      paint(g, v);
    },
  });
}

const soft = (c, a = 0.45) => alpha(mix(c, INK, 0.5), a);       // мягкий тёмный край — чтобы светлое читалось на снегу

// ---------- тень, пыль, дым ----------

// тень под всем, что стоит на земле: мягкий овал во всю рамку 32×12 — рендер растягивает его под размер существа
centered('fx.shadow', 32, 12, (g) => {
  g.scale(1, 6 / 16);
  g.fillStyle = radial(g, 0, 0, 16, [[0, COLORS.shadow], [0.55, COLORS.shadow], [1, alpha(COLORS.shadow, 0)]]);
  g.beginPath();
  g.arc(0, 0, 16, 0, TAU);
  g.fill();
}, 1, 0);

// клуб из нескольких шаров внахлёст: lobes — [[x, y, r], …]
function cloud(g, lobes, look) {
  solid(g, (c) => {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const [x, y, r] of lobes) {
      c.moveTo(x + r, y);
      c.arc(x, y, r, 0, TAU);
      x0 = Math.min(x0, x - r);
      y0 = Math.min(y0, y - r);
      x1 = Math.max(x1, x + r);
      y1 = Math.max(y1, y + r);
    }
    return [x0, y0, x1, y1];
  }, look, { union: true });
}

// пыль из-под лап: три клубка разного размера
const DUST = [
  [[-2.6, 0.8, 3], [1.4, -0.6, 3.6], [4, 1.4, 2.4]],
  [[-1.8, 0.4, 2.8], [1.8, 0, 3]],
  [[0, 0, 2.6], [2.2, 1, 1.6]],
];
centered('fx.dust', 16, 11, (g, v) => {
  cloud(g, DUST[v], tone('#efe4cb', { light: '#fffaf0', dark: '#bfae8c', line: soft('#8a7a5a', 0.5), lw: 0.5, rim: 0.7, shade: 0.8 }));
}, 3);

// облачко «пуф»: кто-то появился или исчез
const PUFF = [
  [[-4.6, 1.4, 3.8], [-1.6, -2.2, 4.4], [3, -1.2, 4.2], [5.4, 2, 3], [0.6, 2.4, 4]],
  [[-3, 0.8, 3.4], [0.6, -1.6, 3.8], [3.6, 1, 3]],
  [[-1.4, 0.2, 2.8], [1.8, -0.6, 2.4]],
];
centered('fx.puff', 22, 16, (g, v) => {
  cloud(g, PUFF[v], tone('#ffffff', { light: '#ffffff', dark: '#b9c6d8', line: soft('#6f7f96', 0.6), lw: 0.55, rim: 0, shade: 1.1 }));
}, 3);

// ---------- искры и знаки ----------

// искорка: четыре луча в тёплом ореоле
centered('fx.spark', 12, 12, (g) => {
  glow(g, 0, 0, 6, '#ffd24a', 0.75);
  sparkle(g, 0, 0, 5.6, alpha('#d98a1c', 0.9), 0.36);
  sparkle(g, 0, 0, 4.8, '#ffffff', 0.22);
});

// звезда: награда, удар в цель
centered('fx.star', 14, 14, (g) => {
  solid(g, (c) => pathStar(c, 0, 0.4, 5.8, 5, 0.52), tone(COLORS.coin, { light: COLORS.coinLight, dark: COLORS.coinDark, lw: 1.1 }));
  speck(g, -1.4, -1.2, 0.9, 0.9);
});

// звёздочки над оглушённым
centered('fx.stun', 11, 11, (g) => {
  solid(g, (c) => pathStar(c, 0, 0, 4.4, 4, 0.42, 0.3), tone('#fff3a0', { light: '#ffffff', dark: '#e0a82e', line: '#a8741c', lw: 0.9 }));
});

// кольцо удара о землю: радиус 17 — рендер растягивает его до нужного
centered('fx.ring', 40, 40, (g) => {
  g.lineWidth = 3.8;
  g.strokeStyle = soft('#4a5a78', 0.55);
  g.beginPath();
  g.arc(0, 0, 17, 0, TAU);
  g.stroke();
  g.lineWidth = 2.2;
  g.strokeStyle = 'rgba(255,255,255,0.92)';
  g.beginPath();
  g.arc(0, 0, 17, 0, TAU);
  g.stroke();
});

// серп: выпуклой стороной вправо; тело — от прозрачного у вогнутого края до цвета у выпуклого
function crescent(g, R, half, d, core, edge) {
  const px = R * Math.cos(half);
  const py = R * Math.sin(half);
  const r2 = Math.hypot(px + d, py);
  const a2 = Math.atan2(py, px + d);
  g.save();
  g.translate(-(px + R) / 2, 0);                 // серп — посередине своей картинки
  g.beginPath();
  g.arc(0, 0, R, -half, half);
  g.arc(-d, 0, r2, a2, -a2, true);
  g.closePath();
  g.fillStyle = linear(g, r2 - d, 0, R, 0, [[0, alpha(core, 0.45)], [1, core]]);
  g.fill();
  g.lineJoin = 'round';
  g.lineWidth = 0.9;
  g.strokeStyle = edge;
  g.beginPath();
  g.arc(0, 0, R, -half, half);
  g.stroke();
  g.restore();
}

// взмах когтей, укус: белая дуга с рыжим краем, выпуклой стороной вперёд (+x), высотой 32
centered('fx.slash', 12, 36, (g) => crescent(g, 18, 1.12, 11, '#ffffff', '#ff9a3c'));

// штрих скорости: от прозрачного хвоста к яркой голове
centered('fx.speed', 24, 5, (g) => {
  // под белым — сизая тень потолще: на снегу штрих виден по ней
  for (const [h, from, to] of [[2.5, 'rgba(70,90,130,0)', 'rgba(70,90,130,0.5)'], [1.5, 'rgba(255,255,255,0)', 'rgba(255,255,255,0.96)']]) {
    g.fillStyle = linear(g, -11, 0, 11, 0, [[0, from], [1, to]]);
    g.beginPath();
    g.moveTo(-11.6, 0);
    g.quadraticCurveTo(4, -h, 11.4, 0);
    g.quadraticCurveTo(4, h, -11.6, 0);
    g.fill();
  }
});

// лист: 0 — зелёный, 1 — осенний
centered('fx.leaf', 11, 8, (g, v) => {
  g.rotate(-0.35);
  leaf(g, -4.2, 0.4, 4.4, -0.2, 3.6, v
    ? tone('#f08a2e', { light: '#ffc45a', dark: '#b8431e', lw: 0.8 })
    : tone('#58b84e', { light: '#9ee27a', dark: '#2f7f3a', lw: 0.8 }), 0.08, v ? '#a03a18' : '#2f7f3a');
}, 2);

// пламя: три языка — рендер меняет их по очереди, и огонь «живёт»
const FLAME = [
  [[-3.6, -1], [-3.4, -5], [-1.2, -8.6], [0.4, -13.4, 1], [1.6, -8.4], [3.6, -5.2], [3.6, -1.2], [0, 0.4]],
  [[-3.8, -1], [-3.2, -5.6], [-2.4, -9.8, 1], [-0.6, -7.4], [1.8, -12, 1], [2.4, -7], [3.8, -4.4], [3.4, -1], [0, 0.4]],
  [[-3.4, -1.2], [-3.8, -5.4], [-1.6, -7.6], [-0.4, -11.6, 1], [0.8, -8], [2.8, -10, 1], [3.4, -5.6], [3.6, -1.2], [0, 0.4]],
];
standing('fx.flame', 12, 15, (g, v) => {
  glow(g, 0, -6.5, 6.5, COLORS.fire, 0.35);
  blob(g, FLAME[v], tone(COLORS.fire, { light: '#ffb04a', dark: '#e2491c', line: '#b8361a', lw: 0.8, rim: 0 }), {
    over(c) {
      // жёлтая сердцевина — тот же язык, только меньше и ниже
      c.save();
      c.translate(0, -0.6);
      c.scale(0.58, 0.62);
      c.fillStyle = COLORS.fireLight;
      c.beginPath();
      pathBlob(c, FLAME[v]);
      c.fill();
      c.scale(0.55, 0.56);
      c.fillStyle = '#fffbe6';
      c.beginPath();
      pathBlob(c, FLAME[v]);
      c.fill();
      c.restore();
    },
  });
}, 3);

// льдинки: кто-то заморожен
centered('fx.ice', 14, 14, (g) => {
  const look = tone(COLORS.ice, { light: '#ffffff', dark: '#5fb4e2', line: '#3b82b8', lw: 0.8 });
  for (const [pts, shineAt] of [
    [[[-4.8, 5.2], [-5.4, 0.2], [-3.4, -3.4], [-1.2, 0.6], [-1, 5.2]], [-3.8, -0.4]],
    [[[1, 5.4], [0.6, -0.6], [2.8, -2.2], [5.2, 1], [4.8, 5.4]], [2.2, 0]],
    [[[-2.4, 5.6], [-2.8, -1.6], [0, -6.2], [2.6, -1.4], [2.4, 5.6]], [-0.8, -2.4]],
  ]) {
    solid(g, (c) => pathPoly(c, pts), look);
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = 0.7;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(shineAt[0], shineAt[1]);
    g.lineTo(shineAt[0] - 0.2, shineAt[1] + 3);
    g.stroke();
  }
});

// пузырь: вода, болото
function bubble(g, r, color, rim) {
  g.fillStyle = radial(g, -r * 0.2, -r * 0.2, r, [[0, alpha(color, 0.12)], [0.7, alpha(color, 0.34)], [1, alpha(color, 0.72)]]);
  g.beginPath();
  g.arc(0, 0, r, 0, TAU);
  g.fill();
  g.strokeStyle = rim;
  g.lineWidth = 0.8;
  g.stroke();
  shine(g, 0, 0, r, 0.95);
  g.strokeStyle = 'rgba(255,255,255,0.5)';
  g.lineWidth = 0.6;
  g.lineCap = 'round';
  g.beginPath();
  g.arc(0, 0, r * 0.66, 0.5, 1.5);
  g.stroke();
}
centered('fx.bubble', 10, 10, (g) => bubble(g, 4, '#dff4ff', soft('#3b6f9a', 0.75)));

// молния: зигзаг вдоль +x длиной 34 (рендер тянет её от точки до точки); светлая сердцевина в сиреневом ореоле —
// видна и на снегу
centered('fx.bolt', 36, 14, (g) => {
  const pts = [[-17, 1], [-10, -4], [-6, 2.4], [1, -3.6], [5, 3.4], [11, -2], [17, 0.6]];
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const [color, lw] of [[alpha('#8a6cff', 0.4), 5.2], [alpha('#b9a4ff', 0.8), 3], [COLORS.lightning, 1.9], ['#ffffff', 0.9]]) {
    g.strokeStyle = color;
    g.lineWidth = lw;
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.stroke();
  }
});

// отметка на земле «здесь сейчас появится враг»: красное кольцо 26×11 со светлой каймой, лежит на земле (сплюснуто)
centered('fx.warn', 30, 15, (g) => {
  g.scale(1, 0.44);
  g.fillStyle = alpha(COLORS.danger, 0.26);
  g.beginPath();
  g.arc(0, 0, 13, 0, TAU);
  g.fill();
  g.setLineDash([5.2, 3]);
  g.lineCap = 'round';
  g.lineWidth = 3.2;
  g.strokeStyle = COLORS.dangerRim;
  g.beginPath();
  g.arc(0, 0, 12.4, 0, TAU);
  g.stroke();
  g.lineWidth = 1.9;
  g.strokeStyle = COLORS.danger;
  g.stroke();
  g.setLineDash([]);
  g.fillStyle = COLORS.dangerRim;
  g.beginPath();
  g.arc(0, 0, 4.4, 0, TAU);
  g.fill();
  g.fillStyle = COLORS.danger;
  g.beginPath();
  g.arc(0, 0, 3, 0, TAU);
  g.fill();
});

// стрелка рывка: наконечник и точки пути — светлые, с тёмным краем, чтобы читались на любой земле
const AIM = tone('#fff6e2', { light: '#ffffff', dark: '#f2c98a', line: alpha(INK, 0.6), lw: 1.1, rim: 0 });
centered('fx.aim.head', 14, 14, (g) => {
  blob(g, [[5.8, 0, 1], [-3.4, 5.4, 1], [-1.6, 0], [-3.4, -5.4, 1]], AIM);
});
centered('fx.aim.dot', 6, 6, (g) => ball(g, 0, 0, 2.1, 2.1, AIM));

// сияние (радиус 24): 0 белое, 1 золотое, 2 синее, 3 красное, 4 зелёное
const GLOW = ['#ffffff', COLORS.coin, COLORS.mana, COLORS.danger, COLORS.poison];
centered('fx.glow', 48, 48, (g, v) => glow(g, 0, 0, 24, GLOW[v], 0.7), GLOW.length, 0);

// ---------- подбираемое ----------

// монета: золотой кружок с отпечатком лапы
standing('pick.coin', 12, 12, (g) => {
  g.scale(1.18, 1.18);
  const gold = tone(COLORS.coin, { light: COLORS.coinLight, dark: COLORS.coinDark, lw: 1 });
  ball(g, 0, -5, 4.4, 4.4, gold, {
    over(c) {
      c.strokeStyle = alpha(COLORS.coinDark, 0.75);
      c.lineWidth = 0.7;
      c.beginPath();
      c.arc(0, -5, 3.1, 0, TAU);
      c.stroke();
      c.fillStyle = alpha(COLORS.coinDark, 0.9);
      c.beginPath();
      c.ellipse(0, -4.2, 1.25, 1, 0, 0, TAU);
      for (const [x, y] of [[-1.3, -5.9], [0, -6.5], [1.3, -5.9]]) {
        c.moveTo(x + 0.55, y);
        c.arc(x, y, 0.55, 0, TAU);
      }
      c.fill();
    },
  });
  speck(g, -1.9, -7, 0.8, 0.9);
});

// сердце: лечит
standing('pick.heart', 14, 13, (g) => {
  g.scale(1.18, 1.18);
  blob(g, [[0, -0.6, 1], [-4.6, -4.8], [-4.8, -8.4], [-2.4, -9.8], [0, -8, 1], [2.4, -9.8], [4.8, -8.4], [4.6, -4.8]],
    tone(COLORS.heart, { light: COLORS.heartLight, dark: COLORS.heartDark, lw: 1 }));
  speck(g, -2.4, -7.6, 1, 0.9);
  speck(g, -3.3, -5.8, 0.4, 0.7);
});

// капля маны
standing('pick.mana', 12, 14, (g) => {
  g.scale(1.14, 1.14);
  glow(g, 0, -5, 6, COLORS.mana, 0.3);
  blob(g, [[0, -11, 1], [2.6, -6.6], [3.8, -3.6], [2.6, -0.8], [0, 0], [-2.6, -0.8], [-3.8, -3.6], [-2.6, -6.6]],
    tone(COLORS.mana, { light: COLORS.manaLight, dark: COLORS.manaDark, lw: 1 }));
  speck(g, -1.3, -4.6, 0.9, 0.9);
  speck(g, -1.9, -2.8, 0.4, 0.7);
});

// ягода: две на веточке с листком
standing('pick.berry', 14, 14, (g) => {
  g.scale(1.14, 1.14);
  const red = tone('#e4473c', { light: '#ff8a78', dark: '#a8242c', lw: 0.9 });
  stroke(g, [[-2.2, -5], [-0.6, -8.6], [1.6, -10.4]], '#5a7a34', 0.9);
  stroke(g, [[2.6, -4.4], [1.4, -8], [1.6, -10.4]], '#5a7a34', 0.9);
  leaf(g, 1.4, -10.2, 5.4, -9.4, 2.8, tone('#58b84e', { light: '#9ee27a', dark: '#2f7f3a', lw: 0.8 }), -0.1, '#2f7f3a');
  ball(g, 2.6, -3.2, 2.9, 2.9, red);
  speck(g, 1.7, -4.2, 0.6, 0.9);
  ball(g, -2.2, -3.6, 3.3, 3.3, red);
  speck(g, -3.3, -4.8, 0.7, 0.9);
});

// ---------- снаряды ----------
// Смотрят вправо. Твёрдые — с обводкой, волшебные — со светящимся ореолом вместо неё.

// шишка: чешуйки рядами, острым концом вперёд
centered('shot.cone', 14, 9, (g) => {
  blob(g, [[-5.4, 0], [-4, -3], [0, -3.6], [4, -2], [6, 0, 1], [4, 2], [0, 3.6], [-4, 3]], tone('#9a6a3c', { light: '#cf9a5c', dark: '#5e3a20', lw: 0.9 }), {
    over(c) {
      // чешуйки — косая клетка
      c.strokeStyle = alpha('#4a2a16', 0.7);
      c.lineWidth = 0.55;
      c.beginPath();
      for (let x = -9; x < 9; x += 2.4) {
        c.moveTo(x, -4);
        c.lineTo(x + 4.6, 4);
        c.moveTo(x + 4.6, -4);
        c.lineTo(x, 4);
      }
      c.stroke();
      c.fillStyle = alpha('#f6d79a', 0.55);
      for (const [x, y] of [[-2.9, -1.7], [-0.5, -1.7], [1.9, -1.5], [-1.7, 0.3], [0.7, 0.3]]) {
        c.beginPath();
        c.arc(x, y, 0.5, 0, TAU);
        c.fill();
      }
    },
  });
});

// камень
centered('shot.stone', 9, 8, (g) => {
  blob(g, [[-3.4, 0.6], [-2.6, -2.4], [0.4, -3], [3.2, -1.4], [3.4, 1.4], [1, 3], [-2, 2.6]], tone('#9aa3ad', { light: '#dfe5ea', dark: '#5f6975', lw: 0.9 }), {
    over(c) {
      stroke(c, [[-0.6, -0.4], [0.8, 0.6], [0.4, 2]], alpha('#4a5562', 0.6), 0.6);
    },
  });
  speck(g, -1.2, -1.4, 0.7, 0.75);
});

// жёлудь: шляпка сзади, острый носик вперёд
centered('shot.acorn', 12, 8, (g) => {
  blob(g, [[-2.4, -3], [1.6, -2.8], [4.2, -1.2], [5.4, 0, 1], [4.2, 1.2], [1.6, 2.8], [-2.4, 3]], tone('#d9a85a', { light: '#f6d79a', dark: '#a8742c', lw: 0.9 }));
  blob(g, [[-4.6, 0], [-4, -2.8], [-1.8, -3.5], [-1, 0], [-1.8, 3.5], [-4, 2.8]], tone('#7a4a28', { light: '#a8743c', dark: '#4a2a16', lw: 0.9 }), {
    over(c) {
      c.strokeStyle = alpha('#3a2010', 0.7);
      c.lineWidth = 0.5;
      for (const y of [-1.6, 0, 1.6]) {
        c.beginPath();
        c.moveTo(-4.6, y);
        c.lineTo(-1.2, y + 0.3);
        c.stroke();
      }
    },
  });
  capsule(g, -5.6, 0, 0.5, -4.6, 0, 0.5, tone('#5a3a20', { lw: 0.5, flat: true }));
  speck(g, 1.2, -1.4, 0.7, 0.8);
});

// стрела: стальной наконечник, древко, красное оперение
centered('shot.arrow', 20, 7, (g) => {
  capsule(g, -7, 0, 0.55, 5, 0, 0.55, tone('#c9a06a', { light: '#efd3a0', dark: '#8a6238', lw: 0.7 }));
  for (const s of [-1, 1]) {
    solid(g, (c) => pathPoly(c, [[-8.6, 0], [-9.4, s * 2.6], [-6.2, s * 2.6], [-4.4, 0]]), tone('#e4473c', { light: '#ff8a78', dark: '#a8242c', lw: 0.7 }));
  }
  solid(g, (c) => pathPoly(c, [[9.4, 0], [4.6, -2.6], [5.6, 0], [4.6, 2.6]]), tone('#cfd6de', { light: '#ffffff', dark: '#7a8696', lw: 0.8 }));
});

// шип: тонкий и острый
centered('shot.thorn', 13, 5, (g) => {
  blob(g, [[-5.4, 0], [-4, -1.7], [0.6, -1.1], [5.8, 0, 1], [0.6, 1.1], [-4, 1.7]], tone('#8fb04a', { light: '#e2f29a', dark: '#4f6f24', lw: 0.8 }));
  stroke(g, [[-3.6, -0.5], [2.6, -0.2]], 'rgba(255,255,255,0.7)', 0.5);
});

// орех: круглый, скачет
centered('shot.nut', 9, 9, (g) => {
  ball(g, 0, 0, 3.4, 3.4, tone('#b9783c', { light: '#e6b072', dark: '#7a4a20', lw: 0.9 }), {
    over(c, patch) {
      patch((p) => pathEllipse(p, -3.2, 0, 2.4, 3.2), tone('#e9cfa0', { dark: '#b89460' }));
    },
  });
  speck(g, 0.2, -1.4, 0.7, 0.85);
});

// перо: очин вперёд, тёмный кончик опахала сзади
centered('shot.feather', 16, 7, (g) => {
  blob(g, [[-6.6, 0.4, 1], [-4.6, -2.4], [0.6, -2.6], [4.2, -0.9], [5, 0], [4.2, 0.9], [0.6, 2.4], [-3, 1.4, 1], [-3.6, 2.6]], tone('#f1f4f8', { light: '#ffffff', dark: '#b4c0d0', line: '#4a5568', lw: 0.8 }), {
    over(c, patch) {
      patch([[-9, -4], [-4.4, -4], [-3.2, 0], [-4.4, 4], [-9, 4]], tone('#5a6274', { light: '#8a93a6', dark: '#33394a' }));
      stroke(c, [[-5.6, 0.2], [4.6, 0]], alpha('#6f7a8c', 0.9), 0.5);
    },
  });
  capsule(g, 4.6, 0, 0.4, 7.2, 0, 0.3, tone('#d8c9a0', { line: '#6a5a3a', lw: 0.5, flat: true }));
});

// лист-лезвие
centered('shot.leaf', 14, 8, (g) => {
  leaf(g, -5.6, 0.6, 6, -0.4, 5.2, tone('#6cc45a', { light: '#c2f29a', dark: '#2f7f3a', lw: 0.9 }), 0.05, '#2f7f3a');
  stroke(g, [[-1.6, -1.2], [2.8, -0.9]], 'rgba(255,255,255,0.6)', 0.5);
});

// звезда посоха: светится сама
centered('shot.star', 14, 14, (g) => {
  glow(g, 0, 0, 7, '#ffe58a', 0.75);
  solid(g, (c) => pathStar(c, 0, 0.2, 4.8, 5, 0.5), tone('#fff0a8', { light: '#ffffff', dark: '#ffc93c', line: '#d9901c', lw: 0.8 }));
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(0, 0.2, 1.3, 0, TAU);
  g.fill();
});

// волна-серп: широкая, режет всё на пути
centered('shot.wave', 16, 34, (g) => {
  glow(g, 0, 0, 8.6, '#9fd0ff', 0.35);
  crescent(g, 17, 1.1, 9, '#eaf6ff', '#5aa8f0');
});

// паутина: комок с нитями
centered('shot.web', 12, 11, (g) => {
  g.strokeStyle = 'rgba(240,244,250,0.9)';
  g.lineWidth = 0.6;
  g.lineCap = 'round';
  for (const [x, y] of [[-5.4, -2.6], [-5.6, 0.4], [-5, 3]]) {
    g.beginPath();
    g.moveTo(-1, y * 0.4);
    g.lineTo(x, y);
    g.stroke();
  }
  ball(g, 1, 0, 3.6, 3.6, tone('#eef1f6', { light: '#ffffff', dark: '#a9b4c6', line: '#5a6478', lw: 0.8 }), {
    over(c) {
      c.strokeStyle = alpha('#7f8aa0', 0.7);
      c.lineWidth = 0.5;
      for (const r of [1.4, 2.6]) {
        c.beginPath();
        c.arc(1, 0, r, 0, TAU);
        c.stroke();
      }
      c.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI) / 3 + 0.3;
        c.moveTo(1 - Math.cos(a) * 3.6, -Math.sin(a) * 3.6);
        c.lineTo(1 + Math.cos(a) * 3.6, Math.sin(a) * 3.6);
      }
      c.stroke();
    },
  });
});

// тыква с рожицей
centered('shot.pumpkin', 12, 11, (g) => {
  capsule(g, 0.2, -4.6, 0.7, 0.9, -3.4, 0.9, tone('#5f8f3a', { dark: '#34561e', lw: 0.6 }));
  const look = tone('#f08a24', { light: '#ffc060', dark: '#b8541c', lw: 0.9 });
  ball(g, 0, 0.8, 4.9, 4, look, {
    over(c) {
      c.strokeStyle = alpha('#a8481a', 0.7);
      c.lineWidth = 0.6;
      for (const x of [-2.2, 2.2]) {
        c.beginPath();
        c.ellipse(x * 0.2, 0.8, Math.abs(x) + 0.4, 4, 0, 0, TAU);
        c.stroke();
      }
      c.fillStyle = '#4a2010';
      c.beginPath();
      c.moveTo(-2.6, 0.4);
      c.lineTo(-1.6, -1.4);
      c.lineTo(-0.6, 0.4);
      c.moveTo(0.6, 0.4);
      c.lineTo(1.6, -1.4);
      c.lineTo(2.6, 0.4);
      c.fill();
      c.beginPath();
      c.moveTo(-2.4, 1.8);
      c.lineTo(-1.2, 2.2);
      c.lineTo(0, 1.6);
      c.lineTo(1.2, 2.2);
      c.lineTo(2.4, 1.8);
      c.lineTo(1.2, 3.4);
      c.lineTo(-1.2, 3.4);
      c.closePath();
      c.fill();
    },
  });
});

// ядовитый пузырь
centered('shot.bubble', 12, 12, (g) => {
  glow(g, 0, 0, 6, COLORS.poison, 0.3);
  bubble(g, 4.6, '#a8e86a', '#4f8f24');
  g.fillStyle = alpha('#e9ffc0', 0.7);
  for (const [x, y, r] of [[1.6, 1.8, 0.8], [-0.4, 2.8, 0.5], [2.6, -0.4, 0.5]]) {
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
  }
});

// спора: пушистый светящийся шарик
centered('shot.spore', 10, 10, (g) => {
  glow(g, 0, 0, 5, COLORS.poison, 0.55);
  g.strokeStyle = alpha('#5a9a2c', 0.9);
  g.lineWidth = 0.6;
  g.lineCap = 'round';
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    g.moveTo(Math.cos(a) * 2, Math.sin(a) * 2);
    g.lineTo(Math.cos(a) * 3.7, Math.sin(a) * 3.7);
  }
  g.stroke();
  ball(g, 0, 0, 2.5, 2.5, tone('#d9f77a', { light: '#fbffd6', dark: '#8fc23c', line: '#4f8f24', lw: 0.7 }));
});

// бумеранг: уголок, рендер крутит его в полёте
centered('shot.boomerang', 14, 16, (g) => {
  blob(g, [[1.4, -6.6], [3.3, -5.4], [-0.4, -0.9], [-0.9, 0], [-0.4, 0.9], [3.3, 5.4], [1.4, 6.6], [-3.6, 1.6], [-4.6, 0], [-3.6, -1.6]],
    tone('#d9a85a', { light: '#f6d79a', dark: '#a06a2c', lw: 0.9 }), {
      over(c) {
        c.strokeStyle = '#d8453a';
        c.lineWidth = 1.3;
        c.beginPath();
        c.moveTo(-1.6, -5.4);
        c.lineTo(3.4, -2.6);
        c.moveTo(-1.6, 5.4);
        c.lineTo(3.4, 2.6);
        c.stroke();
      },
    });
});

// оса: летит головой вперёд
centered('shot.wasp', 12, 9, (g) => {
  for (const [x, y, rot] of [[-0.6, -2.6, -0.5], [1.4, -2.8, 0.3]]) {
    g.fillStyle = 'rgba(235,246,255,0.82)';
    g.strokeStyle = soft('#5a6a80', 0.7);
    g.lineWidth = 0.5;
    g.beginPath();
    g.ellipse(x, y, 2.6, 1.3, rot, 0, TAU);
    g.fill();
    g.stroke();
  }
  blob(g, [[-5.6, 0.4, 1], [-3, -1.8], [0, -2], [1.6, -1.2], [1.6, 2], [0, 2.6], [-3, 2.2]], tone('#ffcf3a', { light: '#fff0a8', dark: '#d99a1c', line: '#3a2a1a', lw: 0.8 }), {
    over(c) {
      c.fillStyle = '#33261a';
      c.fillRect(-3.4, -3, 1.2, 6);
      c.fillRect(-1.2, -3, 1.2, 6);
    },
  });
  ball(g, 3, 0.2, 1.8, 1.8, tone('#4a3a26', { light: '#7a6444', dark: '#2a1e12', lw: 0.7 }));
  speck(g, 3.5, -0.3, 0.45, 0.95);
});

// капкан: стальные зубья вокруг пластины; лежит на земле
centered('shot.trap', 16, 10, (g) => {
  const steel = tone('#aab3bd', { light: '#eef2f6', dark: '#5f6975', lw: 0.8 });
  const teeth = (y, s) => {
    const pts = [[-7, y]];
    for (let i = 0; i < 6; i++) pts.push([-5.8 + i * 2.3, y - s * 2.6], [-4.6 + i * 2.3, y]);
    pts.push([7, y], [7, y + s * 1.1], [-7, y + s * 1.1]);
    solid(g, (c) => pathPoly(c, pts), steel);
  };
  teeth(-0.6, 1);
  ball(g, 0, 1.2, 6.6, 2.6, tone('#6f7783', { light: '#aab3bd', dark: '#3f4752', lw: 0.8 }), {
    over(c) {
      c.fillStyle = '#d8453a';
      c.beginPath();
      c.ellipse(0, 1.2, 2.4, 1, 0, 0, TAU);
      c.fill();
    },
  });
  teeth(3.2, 1);
});

// шар-комета: яркая середина, цветной ореол и хвост назад. 0 простой, 1 огонь, 2 лёд, 3 яд, 4 свет, 5 тьма
const ORB = [
  ['#7fc0ff', '#eaf6ff', '#2f6fd0'],
  [COLORS.fire, '#fff3c0', '#c8401c'],
  [COLORS.ice, '#ffffff', '#3b8fc8'],
  [COLORS.poison, '#f0ffc8', '#4f8f24'],
  ['#ffe98a', '#ffffff', '#d99a1c'],
  ['#8a5ae0', '#e6d2ff', '#3a1f7a'],
];
centered('shot.orb', 18, 11, (g, v) => {
  const [color, core, rim] = ORB[v];
  glow(g, 2.4, 0, 5.4, color, 0.6);
  // хвост: сужается и гаснет назад
  g.fillStyle = linear(g, -8.4, 0, 2, 0, [[0, alpha(color, 0)], [1, alpha(color, 0.9)]]);
  g.beginPath();
  g.moveTo(2.6, -3);
  g.quadraticCurveTo(-3, -1.8, -8.6, 0);
  g.quadraticCurveTo(-3, 1.8, 2.6, 3);
  g.closePath();
  g.fill();
  ball(g, 2.8, 0, 3.3, 3.3, tone(color, { light: core, dark: mix(color, rim, 0.6), line: rim, lw: 0.8, rim: 0 }));
  g.fillStyle = radial(g, 2.2, -0.5, 2.2, [[0, core], [0.55, alpha(core, 0.85)], [1, alpha(core, 0)]]);
  g.beginPath();
  g.arc(2.2, -0.5, 2.2, 0, TAU);
  g.fill();
}, ORB.length);
