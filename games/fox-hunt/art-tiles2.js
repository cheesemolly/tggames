// Болото и зимний бор — второе и третье места мира «Лисьей охоты», нарисованные кодом. Без DOM при импорте.
//
// Комнату по-прежнему собирает art-tiles.js (paintRoom и propsOf); здесь только то, чем эти места отличаются от
// леса: краски, рисунки земли, воды, особых клеток и колючек, свои картинки предметов. Всё записывается через
// addBiome(): чего место не задало, берётся лесное, но в красках места. Тропы, норы, лисью нору, тени под
// преградами, пятна света и подножие стены рисует лесной код — ему достаются только краски.
//
// Болото — приглушённая серо-зелёная земля в моховых подушках и сырых пятнах; тёмная вода под ряской, с
// кувшинками и рогозом по берегу; вместо высокой травы — грязь (блестит и пузырится), колючки — чертополох.
// Растут плакучие ивы с плетями до земли, сухие коряги в бородах лишайника, трухлявые обломки стволов с
// трутовиками, кривые берёзки; понизу — кочки, замшелые брёвна, пни и валуны, вместо куста — рогоз. Над землёй
// стелется туман.
// Зимний бор — снег: не белый лист, а голубоватый, буграми, со следами и сухими травинками; лёд вместо травы
// (в бликах и трещинах), вода — полынья в ледяной кромке, колючки — терновник в инее с ягодами. Ели, сосны и
// скалы под снежными шапками, голые берёзы в инее; понизу — сугробы, снеговик, заснеженные пни, камни и
// брёвна; куст — можжевельник с красными ягодами. Стена — не клубы листвы, а ряды еловых макушек.
// Снег нарочно темнее белого: на нём должны читаться заяц-беляк, светлый ободок красных зон и белые шапки.
//
// Тона листвы (look.tone) месту считает addBiome по его краскам; свои добавки дописываются сразу после него —
// картинки рисуются позже, когда их попросят, и читают уже полный набор.

import { T, TILE } from './tiles.js';
import {
  addBiome, TAU, INK, SHADOW, mix, fade, dim, lift, hashInt, rngOf, spot, disc, oval, blob, solid, puff,
  jitterCircles, limb, leaf, leaves, tinted, contours, regionPath, paintGround, flower, pebble, toadstool,
  lilyPad, reeds, paintThorns, standing, fern, trunk, paintBirch, rock, paintStump, logBody, sparkle,
  paintWallTrunk, paintWallTop, paintWallCap, paintWallSide, paintDoorNorth, paintDoorSouth, paintDoorSide,
} from './art-tiles.js';

// ---------- общее ----------

/** Много дуг одной обводкой: list — подряд x0, y0, рычаг x, y, x1, y1. */
function strokes(g, list, color, width) {
  if (!list.length) return;
  g.strokeStyle = color;
  g.lineWidth = width;
  g.lineCap = 'round';
  g.beginPath();
  for (let i = 0; i < list.length; i += 6) {
    g.moveTo(list[i], list[i + 1]);
    g.quadraticCurveTo(list[i + 2], list[i + 3], list[i + 4], list[i + 5]);
  }
  g.stroke();
}

/** Много овалов одной заливкой: list — подряд x, y, rx, ry. */
function ovals(g, list, color) {
  if (!list.length) return;
  g.fillStyle = color;
  g.beginPath();
  for (let i = 0; i < list.length; i += 4) {
    g.moveTo(list[i] + list[i + 2], list[i + 1]);
    g.ellipse(list[i], list[i + 1], list[i + 2], list[i + 3], 0, 0, TAU);
  }
  g.fill();
}

/** Те же листья, но чуть крупнее — подложка-обводка под лист (list — как у leaves). */
const rimmed = (list, grow = 1) => list.map((n, i) => (i % 5 === 2 ? n + grow : i % 5 === 3 ? n + grow * 0.5 : n));

/**
 * Бугор — кочка или сугроб: купол от земли (cx, base) шириной 2·rx и высотой h, низ чуть выгнут.
 * o: line — обводка, light и dark — сила света и тени, lean — куда съехала макушка, inside(c) — что внутри.
 */
function mound(g, cx, base, rx, h, color, o = {}) {
  const top = cx + (o.lean ?? 0);
  const path = (c) => {
    c.moveTo(cx - rx, base + 0.6);
    c.bezierCurveTo(cx - rx * 1.04, base - h * 0.8, top - rx * 0.55, base - h, top, base - h);
    c.bezierCurveTo(top + rx * 0.55, base - h, cx + rx * 1.04, base - h * 0.8, cx + rx, base + 0.6);
    c.quadraticCurveTo(cx, base + 3, cx - rx, base + 0.6);
    c.closePath();
  };
  solid(g, path, cx, base - h / 2, rx, h / 2, color, { light: o.light ?? 0.5, dark: o.dark ?? 0.5, line: o.line, inside: o.inside });
}

// =====================================================================================================
// БОЛОТО
// =====================================================================================================

// Первые строки — из общей палитры игры; ниже — свои добавки. Чего здесь нет, остаётся лесным (нора, солома).
const SWAMP_PAL = {
  ground: '#6f9a6a', groundLight: '#8db37f', groundDark: '#4f7b58', groundDeep: '#345a48',
  flowers: ['#ffe27a', '#f6d7e8', '#ffffff'], flowerCore: ['#e08a2a', '#f2b632'],
  path: '#958e62', pathDark: '#6e6a46',
  trunk: '#6b5a4a', trunkDark: '#43382f',
  canopy: '#477f56', canopyLight: '#7fb068', canopyDark: '#2f5e48', canopyDeep: '#1f4338',
  stump: '#a08a5e', rock: '#959c9c', rockDark: '#636c70', rockLight: '#cdd4cf',
  bush: '#8a9a48', berry: '#d8574a',
  water: '#3f7f76', waterDeep: '#2a5c5a', shine: '#a8d8c6',

  under: mix('#1f4338', SHADOW, 0.5),    // земля под кронами и глубина чащи
  sun: '#e6f2c2',                        // свет сквозь туман — бледный, зеленоватый
  shore: '#5d5a40', seedHead: '#e9e2b0', toadstool: '#d8574a', moss: '#86ad3e',
  lilyPad: '#5c9c54', lily: '#f6d7e8',
  thorn: '#5e4c3c', thornTip: '#ece4c6', thornLeaf: '#5f7a3c', berryDark: '#7a2a4a',
  birch: '#dfe2d4', birchShade: '#8d9488', birchMark: '#3f3a34', birchLeaf: '#b9c65a',
  mud: '#6a5a3f', mudLight: '#8c7a56', mudDark: '#463a2a', mudShine: '#cfc8a4',
  reed: '#b7a15a', reedDark: '#7c6c36', cattail: '#5c3c28',
  mist: '#d7ecdf', duckweed: '#a5cc5c', duckweedDark: '#6f9c48',
  cotton: '#f7f9f1', cranberry: '#cc3348', thistle: '#b274d2',
  lichen: '#a9c4a2', bracket: '#d7a15c', deadwood: '#8a8478',
};

// ---------- приёмы: осока, мох, лишайник, трутовик, плети ивы ----------

/** Осока пучком: узкие листья веером от (x, y), каждый с тёмной каймой. */
function sedge(g, x, y, size, P, rnd, n = 5) {
  const even = [];
  const odd = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i - (n - 1) / 2) * (1.5 / n) + (rnd() - 0.5) * 0.25;
    (i % 2 ? odd : even).push(x + (i - (n - 1) / 2) * 0.7, y, size * (0.7 + rnd() * 0.45), size * 0.12 + 0.6, a);
  }
  leaves(g, rimmed(even.concat(odd), 1.2), dim(P.canopy, 0.6));
  leaves(g, even, P.canopyLight);
  leaves(g, odd, P.reed);
}

/** Моховая подушка: тёмная кайма, мох и светлая макушка. */
function mossPad(g, x, y, rx, ry, P, seed) {
  g.fillStyle = dim(P.moss, 0.5);
  g.beginPath();
  blob(g, x, y, rx + 0.9, ry + 0.9, seed, 0.16, 8);
  g.fill();
  g.fillStyle = P.moss;
  g.beginPath();
  blob(g, x, y, rx, ry, seed, 0.16, 8);
  g.fill();
  oval(g, x - rx * 0.3, y - ry * 0.35, rx * 0.5, ry * 0.4, fade(lift(P.moss, 0.55), 0.8));
}

/** Борода лишайника: несколько тонких волнистых прядей вниз от (x, y). */
function beard(g, x, y, len, color, rnd) {
  const lines = [];
  for (let i = 0; i < 4; i++) {
    const bx = x + (i - 1.5) * 1.5;
    const l = len * (0.55 + rnd() * 0.45);
    const sway = (rnd() - 0.5) * 3;
    lines.push(bx, y, bx + sway, y + l * 0.5, bx - sway * 0.4, y + l);
  }
  strokes(g, lines, dim(color, 0.55), 2.3);
  strokes(g, lines, color, 1.1);
}

/** Трутовик: полочка на боку ствола — светлая сверху, тёмная снизу. */
function bracket(g, x, y, r, P) {
  oval(g, x, y, r + 0.8, r * 0.5 + 0.8, dim(P.bracket, 0.6));
  oval(g, x, y, r, r * 0.5, P.bracket);
  oval(g, x - r * 0.15, y - r * 0.2, r * 0.7, r * 0.2, fade(lift(P.bracket, 0.6), 0.85));
  oval(g, x, y + r * 0.28, r * 0.8, r * 0.14, fade(dim(P.bracket, 0.4), 0.6));
}

/** Плети ивы: тонкие стебли вниз и узкие листья вдоль них. list — [x, y, длина, на сколько низ унесло вбок]. */
function strands(g, list, tone, seed) {
  const rnd = rngOf(seed);
  const stems = [];
  const all = [];
  const lit = [];
  for (const [x, y, len, sway] of list) {
    stems.push(x, y, x + sway * 0.2, y + len * 0.5, x + sway, y + len);
    const n = Math.max(3, Math.round(len / 3.4));
    for (let k = 1; k <= n; k++) {
      const u = k / n;
      const px = x + 2 * u * (1 - u) * sway * 0.2 + u * u * sway;
      const py = y + len * u - 1.6;
      const long = 3.8 + rnd() * 1.4;
      const a = Math.PI / 2 + (k % 2 ? 0.5 : -0.5) + (rnd() - 0.5) * 0.3;
      all.push(px, py, long, 1.2 + rnd() * 0.4, a);
      if (k % 2) lit.push(px - 0.3, py, long * 0.8, 0.7, a);
    }
  }
  strokes(g, stems, tone.line, 1);
  leaves(g, rimmed(all, 1.1), tone.line);
  leaves(g, all, tone.base);
  leaves(g, lit, fade(tone.light, 0.8));
}

// ---------- земля болота ----------

/** Сырая земля: к лесным пятнам — тёмные мокрые проплешины и жёлто-зелёные наплывы мха. */
function swampGround(g, R, P) {
  paintGround(g, R, P);
  const rnd = rngOf(hashInt(R.seed, 201));
  const area = R.W * R.H;
  for (let i = Math.round(area / 14000); i > 0; i--) {
    const rx = 18 + rnd() * 24;
    spot(g, rnd() * R.W, rnd() * R.H, rx, rx * (0.4 + rnd() * 0.3), P.mud, 0.26, rnd() * Math.PI);
  }
  for (let i = Math.round(area / 11000); i > 0; i--) {
    const rx = 12 + rnd() * 16;
    spot(g, rnd() * R.W, rnd() * R.H, rx, rx * (0.5 + rnd() * 0.3), P.moss, 0.22, rnd() * Math.PI);
  }
}

/**
 * Мелочи болота: моховые подушки с клюквой, осока пучками (у воды и преград — гуще), пушица, лужицы, камешки,
 * калужница полянками. Всё плоское и без обводки — по этому ходят.
 */
function swampDecals(g, R, P) {
  const floor = (x, y) => R.at(x, y) === TILE.FLOOR || R.at(x, y) === TILE.PATH;
  const wet = (x, y) => R.at(x, y) === TILE.WATER || R.at(x, y) === TILE.SPECIAL;
  // цветы — полянками: крупная сетка, в каждой ячейке — может быть одна
  for (let cy = 0; cy * 112 < R.H; cy++) {
    for (let cx = 0; cx * 112 < R.W; cx++) {
      const rnd = rngOf(hashInt(R.seed, cx, cy, 211));
      if (rnd() > 0.55) continue;
      const px = (cx + rnd()) * 112;
      const py = (cy + rnd()) * 112;
      const color = P.flowers[Math.floor(rnd() * P.flowers.length)];
      const rad = 8 + rnd() * 14;
      for (let i = 3 + Math.floor(rnd() * 4); i > 0; i--) {
        const a = rnd() * TAU;
        const d = Math.sqrt(rnd()) * rad;
        const x = px + Math.cos(a) * d;
        const y = py + Math.sin(a) * d * 0.7;
        if (R.under(x, y) === TILE.FLOOR && R.under(x, y - 4) === TILE.FLOOR) flower(g, x, y, color, P, 0.8 + rnd() * 0.3);
      }
    }
  }
  const dark = [];           // осока — тремя проходами на всю комнату: тёмные, светлые и сухие стебли
  const pale = [];
  const dry = [];
  const fluff = [];
  for (let y = 0; y < R.h; y++) {
    for (let x = 0; x < R.w; x++) {
      if (!floor(x, y)) continue;
      const rnd = rngOf(hashInt(R.seed, x, y, 213));
      const bare = R.at(x, y) === TILE.PATH;
      const edgy = R.edgy(x, y);
      const damp = wet(x - 1, y) || wet(x + 1, y) || wet(x, y - 1) || wet(x, y + 1);
      const px = () => (x + 0.08 + rnd() * 0.84) * T;
      const py = () => (y + 0.14 + rnd() * 0.8) * T;
      // моховая подушка, на ней клюква
      if (!bare && rnd() < (edgy ? 0.3 : 0.16)) {
        const mx = px();
        const my = py();
        const r = 5 + rnd() * 4;
        oval(g, mx + 0.8, my + 1, r, r * 0.6, fade(P.groundDeep, 0.45));
        oval(g, mx, my, r, r * 0.6, mix(P.moss, P.ground, 0.25));
        oval(g, mx - r * 0.25, my - r * 0.16, r * 0.55, r * 0.3, fade(lift(P.moss, 0.5), 0.7));
        if (rnd() < 0.6) {
          for (let i = 2 + Math.floor(rnd() * 3); i > 0; i--) {
            const bx = mx + (rnd() - 0.5) * r * 1.3;
            const by = my + (rnd() - 0.5) * r * 0.6;
            disc(g, bx, by, 1.25, dim(P.cranberry, 0.4));
            disc(g, bx, by, 0.95, P.cranberry);
            disc(g, bx - 0.3, by - 0.35, 0.3, '#ffffff');
          }
        }
      }
      // лужица: тёмное зеркальце со светлым краем
      if (!bare && !edgy && rnd() < 0.06) {
        const lx = px();
        const ly = py();
        const r = 3.5 + rnd() * 3;
        oval(g, lx, ly, r + 1.2, r * 0.55 + 0.9, fade(P.groundDeep, 0.6));
        oval(g, lx, ly, r, r * 0.55, P.water);
        oval(g, lx - r * 0.3, ly - r * 0.14, r * 0.4, r * 0.12, fade(P.shine, 0.7));
      }
      for (let i = bare ? (rnd() < 0.3 ? 1 : 0) : edgy || damp ? 2 + Math.floor(rnd() * 3) : Math.floor(rnd() * 2.2); i > 0; i--) {
        const bx = px();
        const by = py();
        const n = 3 + Math.floor(rnd() * 3);
        for (let k = 0; k < n; k++) {
          const off = k - (n - 1) / 2;
          const lean = off * 2.2 + (rnd() - 0.5) * 2;
          const tall = 5 + rnd() * 5;
          const u = rnd();
          (u < 0.4 ? dark : u < 0.8 ? pale : dry).push(bx + off * 0.8, by, bx + lean * 0.3, by - tall * 0.7, bx + lean, by - tall);
        }
      }
      // пушица: белые пушинки на тонких стеблях — у воды и грязи
      if (!bare && rnd() < (damp ? 0.3 : 0.08)) {
        const cx = px();
        const cy = py();
        for (let i = 2 + Math.floor(rnd() * 2); i > 0; i--) {
          const bx = cx + (rnd() - 0.5) * 9;
          const by = cy + (rnd() - 0.5) * 5;
          const tall = 6 + rnd() * 3;
          const lean = (rnd() - 0.5) * 3;
          dry.push(bx, by, bx + lean * 0.3, by - tall * 0.6, bx + lean, by - tall);
          fluff.push(bx + lean, by - tall - 0.8, 1.7, 1.5);
        }
      }
      if (rnd() < (bare ? 0.4 : 0.07)) pebble(g, px(), py(), 1.4 + rnd() * 1.6, P, rnd);
      // поганки — у подножия высокого
      if (!bare && rnd() < 0.3 && (R.at(x - 1, y) === TILE.TALL || R.at(x + 1, y) === TILE.TALL || R.at(x, y - 1) === TILE.TALL)) {
        const mx = px();
        const my = py();
        toadstool(g, mx, my, 0.9 + rnd() * 0.3, P);
        if (rnd() < 0.5) toadstool(g, mx + 4 + rnd() * 2, my + 1.5, 0.65, P);
      }
    }
  }
  strokes(g, dark, P.groundDeep, 1.25);
  strokes(g, pale, lift(P.groundLight, 0.15), 1.2);
  strokes(g, dry, P.reed, 1.1);
  ovals(g, fluff.map((n, i) => (i % 4 === 0 ? n + 0.5 : i % 4 === 1 ? n + 0.7 : n)), fade(SHADOW, 0.25));
  ovals(g, fluff, P.cotton);
}

/**
 * Грязь — особая земля болота: бурая жижа ниже травы — на неё падает тень берега; в ней комья, мокрый блеск и
 * пузыри. По ней ходят (вязнут), поэтому всё плоское и без обводки.
 */
function swampMud(g, R, P) {
  const mud = (x, y) => R.at(x, y) === TILE.SPECIAL;
  const loops = contours(R.w, R.h, mud);
  if (!loops.length) return;
  const s = R.seed + 3;
  const edge = (grow) => regionPath(g, loops, s, 12, 3.6, grow, 2);
  edge(5.5);
  g.fillStyle = fade(P.groundDeep, 0.5);
  g.fill();
  edge(2.8);
  g.fillStyle = P.mudDark;
  g.fill();
  edge(0.8);
  g.fillStyle = P.mud;
  g.fill();
  g.save();
  edge(0.8);
  g.clip();
  edge(-6);
  g.fillStyle = fade(P.mudLight, 0.45);
  g.fill();
  g.lineJoin = 'round';
  g.save();
  g.translate(2.2, 2.8);
  edge(0.8);
  g.strokeStyle = fade(mix(P.mudDark, SHADOW, 0.4), 0.55);
  g.lineWidth = 4;
  g.stroke();
  g.restore();
  const lump = [];
  const lumpLight = [];
  const shine = [];
  const rim = [];
  const bubble = [];
  const glint = [];
  for (let y = 0; y < R.h; y++) {
    for (let x = 0; x < R.w; x++) {
      if (!mud(x, y)) continue;
      const rnd = rngOf(hashInt(R.seed, x, y, 221));
      const px = () => (x + 0.1 + rnd() * 0.8) * T;
      const py = () => (y + 0.12 + rnd() * 0.76) * T;
      for (let i = 2 + Math.floor(rnd() * 2); i > 0; i--) {
        const lx = px();
        const ly = py();
        const r = 2.2 + rnd() * 2.6;
        lump.push(lx, ly, r, r * 0.6);
        lumpLight.push(lx - r * 0.25, ly - r * 0.22, r * 0.5, r * 0.22);
      }
      for (let i = 2 + Math.floor(rnd() * 2); i > 0; i--) {
        const sx = px();
        const sy = py();
        const len = 4 + rnd() * 6;
        shine.push(sx, sy, sx + len * 0.5, sy - 1.6 - rnd(), sx + len, sy);
      }
      if (rnd() < 0.55) {
        const bx = px();
        const by = py();
        const r = 1.5 + rnd() * 1.3;
        rim.push(bx, by, r + 0.6, r + 0.6);
        bubble.push(bx, by, r, r);
        glint.push(bx - r * 0.35, by - r * 0.35, r * 0.35, r * 0.35);
      }
    }
  }
  ovals(g, lump, fade(P.mudDark, 0.5));
  ovals(g, lumpLight, fade(P.mudLight, 0.7));
  strokes(g, shine, fade(P.mudShine, 0.42), 1.1);
  ovals(g, rim, fade(P.mudDark, 0.7));
  ovals(g, bubble, mix(P.mud, P.mudLight, 0.6));
  ovals(g, glint, fade(P.mudShine, 0.9));
  g.restore();
}

/**
 * Болотная вода: тёмная, стоячая, берег — сырой торф. У берега ряска ковром, на середине — островками;
 * кувшинки, пузыри газа, над водой туман. По берегу — рогоз.
 */
function swampWater(g, R, P) {
  const water = (x, y) => R.at(x, y) === TILE.WATER;
  const loops = contours(R.w, R.h, water);
  if (!loops.length) return;
  const s = R.seed + 7;
  const edge = (grow) => regionPath(g, loops, s, 13, 2.6, grow, 2);
  edge(7);
  g.fillStyle = fade(P.groundDeep, 0.5);
  g.fill();
  edge(3.8);
  g.fillStyle = P.shore;
  g.fill();
  edge(0.2);
  g.fillStyle = mix(P.water, P.shine, 0.2);
  g.fill();
  g.save();
  edge(0.2);
  g.clip();
  edge(-4);
  g.fillStyle = P.water;
  g.fill();
  edge(-10);
  g.fillStyle = fade(P.waterDeep, 0.65);
  g.fill();
  edge(-17);
  g.fillStyle = fade(P.waterDeep, 0.8);
  g.fill();
  // берег выше воды: его тень на воде слева сверху, светлая кромка справа снизу
  g.lineJoin = 'round';
  g.save();
  g.translate(2.4, 3);
  edge(0.2);
  g.strokeStyle = fade(mix(P.waterDeep, SHADOW, 0.5), 0.55);
  g.lineWidth = 4.4;
  g.stroke();
  g.restore();
  g.save();
  g.translate(-1.5, -1.9);
  edge(0.2);
  g.strokeStyle = fade(P.shine, 0.55);
  g.lineWidth = 1.5;
  g.stroke();
  g.restore();
  const weed = [];
  const weedDark = [];
  const glint = [];
  for (let y = 0; y < R.h; y++) {
    for (let x = 0; x < R.w; x++) {
      if (!water(x, y)) continue;
      const rnd = rngOf(hashInt(R.seed, x, y, 231));
      const near = !water(x - 1, y) || !water(x + 1, y) || !water(x, y - 1) || !water(x, y + 1);
      for (let i = near ? 3 : rnd() < 0.5 ? 1 : 0; i > 0; i--) {
        const cx = (x + rnd()) * T;
        const cy = (y + rnd()) * T;
        for (let k = 7 + Math.floor(rnd() * 6); k > 0; k--) {
          const a = rnd() * TAU;
          const d = Math.sqrt(rnd()) * 9;
          (rnd() < 0.4 ? weedDark : weed).push(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.6, 1 + rnd() * 0.7, 0.75 + rnd() * 0.4);
        }
      }
      if (rnd() < 0.6) {
        const bx = (x + 0.15 + rnd() * 0.6) * T;
        const by = (y + 0.15 + rnd() * 0.7) * T;
        glint.push(bx, by, bx + 2, by, bx + 3 + rnd() * 5, by);
      }
    }
  }
  strokes(g, glint, fade(P.shine, 0.42), 1);
  ovals(g, weedDark, P.duckweedDark);
  ovals(g, weed, P.duckweed);
  for (let y = 0; y < R.h; y++) {
    for (let x = 0; x < R.w; x++) {
      if (!water(x, y)) continue;
      const rnd = rngOf(hashInt(R.seed, x, y, 233));
      if (rnd() < 0.5) lilyPad(g, (x + 0.25 + rnd() * 0.5) * T, (y + 0.3 + rnd() * 0.45) * T, 3.8 + rnd() * 1.8, P, rnd);
      if (rnd() < 0.25) lilyPad(g, (x + 0.2 + rnd() * 0.6) * T, (y + 0.25 + rnd() * 0.5) * T, 2.6 + rnd(), P, rnd);
      // пузырь болотного газа: колечко с бликом
      if (rnd() < 0.3) {
        const bx = (x + 0.2 + rnd() * 0.6) * T;
        const by = (y + 0.2 + rnd() * 0.6) * T;
        const r = 1.4 + rnd() * 1.2;
        g.strokeStyle = fade(P.shine, 0.75);
        g.lineWidth = 0.8;
        g.beginPath();
        g.arc(bx, by, r, 0, TAU);
        g.stroke();
        disc(g, bx - r * 0.35, by - r * 0.35, r * 0.28, fade('#ffffff', 0.8));
      }
      if (rnd() < 0.35) spot(g, (x + rnd()) * T, (y + rnd()) * T, 20 + rnd() * 14, 6 + rnd() * 3, P.mist, 0.2);
    }
  }
  g.restore();
  for (let y = 0; y < R.h; y++) {
    for (let x = 0; x < R.w; x++) {
      if (!water(x, y)) continue;
      const rnd = rngOf(hashInt(R.seed, x, y, 235));
      if (!water(x, y - 1) && rnd() < 0.7) reeds(g, (x + 0.2 + rnd() * 0.6) * T, y * T + 3, P, rnd);
      if (!water(x - 1, y) && rnd() < 0.4) reeds(g, x * T + 1, (y + 0.3 + rnd() * 0.6) * T, P, rnd);
      if (!water(x + 1, y) && rnd() < 0.4) reeds(g, (x + 1) * T - 1, (y + 0.3 + rnd() * 0.6) * T, P, rnd);
    }
  }
}

/**
 * Колючки болота — чертополох: лесные плети в здешних красках, над ними лиловые головки. Здесь же, последним
 * слоем земли, — туман: бледные полосы стелются над всей комнатой.
 */
function swampThorns(g, R, P) {
  paintThorns(g, R, P);
  for (let y = 0; y < R.h; y++) {
    for (let x = 0; x < R.w; x++) {
      if (R.at(x, y) !== TILE.THORN) continue;
      const rnd = rngOf(hashInt(R.seed, x, y, 241));
      for (let i = 2 + Math.floor(rnd() * 2); i > 0; i--) {
        const hx = x * T + 5 + rnd() * 22;
        const hy = y * T + 6 + rnd() * 21;
        oval(g, hx, hy + 1.5, 2.1, 1.7, dim(P.thornLeaf, 0.45));
        oval(g, hx, hy + 1.3, 1.5, 1.2, P.thornLeaf);
        disc(g, hx, hy - 0.6, 2.3, dim(P.thistle, 0.5));
        disc(g, hx, hy - 0.8, 1.6, P.thistle);
        disc(g, hx - 0.5, hy - 1.3, 0.6, lift(P.thistle, 0.6));
      }
    }
  }
  const rnd = rngOf(hashInt(R.seed, 243));
  for (let i = Math.max(3, Math.round((R.W * R.H) / 45000)); i > 0; i--) {
    spot(g, rnd() * R.W, T + rnd() * (R.H - 2 * T), 60 + rnd() * 50, 8 + rnd() * 6, P.mist, 0.14 + rnd() * 0.06, (rnd() - 0.5) * 0.2);
  }
}

// ---------- картинки болота ----------

/**
 * Плакучая ива: толстый наклонённый ствол, крона-шатёр и плети до самой земли — дальние тёмные, за стволом,
 * ближние светлые, из-под нижних клубов.
 */
function paintWillow(g, look, v) {
  const P = look.pal;
  const t = look.tone;
  const x = 40;
  const base = 89;
  const lean = v === 1 ? -4 : 4;
  const J = (list, salt) => jitterCircles(list, v * 157 + salt, v ? 1.4 : 0.4);
  const rnd = rngOf(2001 + v);
  /** Ряд плетей от x0 до x1 с высоты y: n штук, длина от min до max; к краям кроны их относит наружу. */
  const row = (x0, x1, y, n, min, max) => {
    const list = [];
    for (let i = 0; i < n; i++) {
      const sx = x0 + ((i + 0.5 + (rnd() - 0.5) * 0.5) / n) * (x1 - x0);
      list.push([sx, y, min + rnd() * (max - min), (rnd() - 0.5) * 3 + (sx - x) * 0.04]);
    }
    return list;
  };
  strands(g, row(8, 72, 34, 9, 22, 36), t.mid, 2011 + v);
  trunk(g, x, base, 46, 13, P, 2002 + v, { shade: 18, lean, flare: 5.5 });
  limb(g, [x + lean * 0.6 - 2, base - 30, x - 10, base - 38, x - 17, base - 42], 3.4, P.trunk, dim(P.trunk), 1.3);
  limb(g, [x + lean * 0.6 + 2, base - 32, x + 10, base - 39, x + 17, base - 42], 3, mix(P.trunk, P.trunkDark, 0.5), dim(P.trunk), 1.3);
  puff(g, J([[40, 29, 21], [22, 34, 15], [58, 34, 15], [40, 18, 13], [28, 21, 11.5], [52, 21, 11.5]], 1), t.mid, 2003 + v, { under: 0.35 });
  puff(g, J([[57, 41, 12], [65, 44, 7.5], [49, 45, 8.5]], 2), t.mid, 2004 + v, { under: 0.5, light: 0.28 });
  puff(g, J([[23, 41, 13], [14.5, 44, 8], [32, 45, 9.5]], 3), t.near, 2005 + v, { under: 0.4 });
  strands(g, row(6, 36, 45, 5, 20, 35).concat(row(46, 74, 45, 4, 18, 32)), t.willow, 2012 + v);
  puff(g, J([[33, 25, 14], [22, 29, 10], [44, 20, 10.5], [32, 15, 9]], 4), t.lit, 2006 + v, { dark: 0.3 });
}

/** Сухая коряга: выбеленный ствол с обломанной верхушкой, кривые сучья в бородах лишайника, мох и трутовики. */
function paintSnag(g, look, v) {
  const P = look.pal;
  const m = v ? -1 : 1;
  const x = 30;
  const base = 76;
  const bark = P.deadwood;
  const line = dim(bark, 0.62);
  const at = (list) => list.map((n, i) => (i % 2 ? base + n : x + n * m));
  const rnd = rngOf(2101 + v);
  for (const [pts, width] of [
    [[2, -38, 10, -49, 20, -53, 26, -64], 3.4], [[-2, -45, -11, -55, -19, -58, -24, -69], 3.2],
    [[18, -52, 24, -49, 27, -51], 1.8], [[-16, -57, -22, -53, -26, -55], 1.8], [[22, -58, 21, -66, 23, -71], 1.7], [[-21, -63, -17, -71], 1.6],
  ]) limb(g, at(pts), width, bark, line, 1.2);
  beard(g, x + 21 * m, base - 52, 13, P.lichen, rnd);
  beard(g, x - 20 * m, base - 57, 11, P.lichen, rnd);
  beard(g, x + 11 * m, base - 48, 8, P.lichen, rnd);
  const lean = 2 * m;
  trunk(g, x, base, 60, 12.5, P, 2102 + v, { color: bark, dark: mix(bark, P.trunkDark, 0.75), lean, taper: 0.34, flare: 5.5 });
  // обломанная верхушка: щепа торчит над изломом
  const top = base - 60;
  const w = 12.5 * 0.34;
  g.fillStyle = bark;
  g.strokeStyle = line;
  g.lineWidth = 1.5;
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(x + lean - w, top + 1);
  g.lineTo(x + lean - w * 0.7, top - 9);
  g.lineTo(x + lean - w * 0.1, top - 3);
  g.lineTo(x + lean + w * 0.5, top - 13);
  g.lineTo(x + lean + w, top + 1);
  g.closePath();
  g.fill();
  g.stroke();
  // дупло
  oval(g, x + 0.8 * m, base - 30, 2.5, 3.5, fade(INK, 0.75));
  g.strokeStyle = fade(lift(bark, 0.5), 0.6);
  g.lineWidth = 0.8;
  g.beginPath();
  g.ellipse(x + 0.8 * m, base - 30, 3.1, 4.1, 0, Math.PI * 0.2, Math.PI * 0.9);
  g.stroke();
  mossPad(g, x - 5 * m, base - 2.5, 6.5, 2.6, P, 2103 + v);
  mossPad(g, x + lean * 0.6 + m, base - 41, 4.4, 2, P, 2104 + v);
  bracket(g, x + 6.4 * m, base - 20, 3.4, P);
  bracket(g, x + 6 * m, base - 14, 2.6, P);
}

/**
 * Обломок трухлявого ствола: широкий, с щепой на изломе, дуплом, трутовиками лесенкой и мхом. Во втором
 * из дупла кто-то смотрит.
 */
function paintStub(g, look, v) {
  const P = look.pal;
  const m = v ? -1 : 1;
  const x = 24;
  const base = 57;
  const bark = mix(P.trunk, P.deadwood, 0.35);
  const line = dim(bark, 0.64);
  const tall = v ? 40 : 46;
  const top = base - tall;
  const rnd = rngOf(2201 + v);
  limb(g, [x + 5 * m, base - 26, x + 13 * m, base - 32, x + 18 * m, base - 31], 3, bark, line, 1.2);
  beard(g, x + 15 * m, base - 30, 10, P.lichen, rnd);
  trunk(g, x, base, tall, 19, P, 2202 + v, { color: bark, dark: mix(bark, P.trunkDark, 0.8), taper: 0.42, flare: 6, lean: 1.5 * m });
  const cx = x + 1.5 * m;
  const w = 19 * 0.42;
  g.fillStyle = bark;
  g.strokeStyle = line;
  g.lineWidth = 1.5;
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(cx - w, top + 1);
  g.lineTo(cx - w * 0.75, top - 8);
  g.lineTo(cx - w * 0.3, top - 2);
  g.lineTo(cx + w * 0.1, top - 11);
  g.lineTo(cx + w * 0.5, top - 3);
  g.lineTo(cx + w * 0.8, top - 7);
  g.lineTo(cx + w, top + 1);
  g.closePath();
  g.fill();
  g.stroke();
  const hy = base - tall * 0.52;
  oval(g, cx - 0.5 * m, hy, 4.2, 5.6, mix(P.trunkDark, INK, 0.6));
  g.strokeStyle = fade(lift(bark, 0.5), 0.6);
  g.lineWidth = 0.9;
  g.beginPath();
  g.ellipse(cx - 0.5 * m, hy, 4.9, 6.3, 0, Math.PI * 0.15, Math.PI * 0.9);
  g.stroke();
  if (v) {
    for (const dx of [-1.6, 1.6]) {
      disc(g, cx - 0.5 * m + dx, hy + 0.4, 1.15, P.flowers[0]);
      disc(g, cx - 0.5 * m + dx + 0.2, hy + 0.5, 0.5, INK);
    }
  }
  bracket(g, cx - 8.4 * m, base - 14, 4, P);
  bracket(g, cx - 7.6 * m, base - 21, 3, P);
  if (!v) bracket(g, cx + 8 * m, base - 30, 3.2, P);
  mossPad(g, x + 7 * m, base - 2.5, 7, 2.6, P, 2203 + v);
  mossPad(g, cx - 5 * m, base - (v ? 31 : 36), 3.4, 4.2, P, 2204 + v);
  sedge(g, x - 13 * m, base + 1, 7, P, rnd, 4);
}

/** Кочка: моховой бугор с осокой на макушке; на одной клюква, на другой пушица, на третьей поганки. */
function paintHummock(g, look, v) {
  const P = look.pal;
  const rnd = rngOf(2301 + v);
  const turf = mix(P.moss, P.canopy, 0.25);
  const x = v === 1 ? 20 : 18.5;
  const wide = v === 2 ? 15 : 13.5;
  const tall = v === 2 ? 13 : 15.5;
  sedge(g, x + 1, 25.5 - tall + 3, v === 2 ? 8.5 : 10.5, P, rnd, 6);
  const tufts = [];
  for (let i = 0; i < 9; i++) tufts.push(x + (rnd() - 0.5) * 24, 12 + rnd() * 13, 2 + rnd() * 2);
  mound(g, x, 25.5, wide, tall, turf, {
    line: dim(turf, 0.62),
    inside: (c) => {
      for (let i = 0; i < tufts.length; i += 3) {
        const r = tufts[i + 2];
        oval(c, tufts[i], tufts[i + 1], r, r * 0.7, i % 2 ? fade(lift(P.moss, 0.45), 0.55) : fade(P.canopyDark, 0.4));
      }
    },
  });
  if (v === 0) {
    for (const [bx, by] of [[13, 16], [17.5, 13.5], [22.5, 15.5], [25.5, 19.5], [15.5, 20.5]]) {
      disc(g, bx, by, 1.6, dim(P.cranberry, 0.5));
      disc(g, bx, by, 1.15, P.cranberry);
      disc(g, bx - 0.35, by - 0.4, 0.38, '#ffffff');
    }
  } else if (v === 1) {
    for (const [bx, tip] of [[15, 4.5], [20.5, 2.5], [25.5, 6]]) {
      limb(g, [bx + (20 - bx) * 0.4, 13, bx, tip + 2], 0.9, P.reed, dim(P.reed, 0.5), 0.6);
      disc(g, bx, tip, 2.5, dim(P.cotton, 0.42));
      disc(g, bx, tip, 1.9, P.cotton);
    }
  } else {
    toadstool(g, x + 5.5, 15, 1.15, P);
    toadstool(g, x + 10, 17.5, 0.75, P);
  }
  sedge(g, x - 11, 27, 6, P, rnd, 4);
  sedge(g, x + 11.5, 27.5, 5.5, P, rnd, 4);
}

/** Замшелое бревно: мох наплывами по верху, на одном — поганки, на другом — трутовики. */
function paintMossLog(g, look, v) {
  const P = look.pal;
  logBody(g, 5, 14.5, 30, 7.5, P, 2402 + v);
  mossPad(g, v ? 24 : 16, 8, 8.5, 3, P, 2403 + v);
  mossPad(g, v ? 13 : 28, 9.6, 4, 2, P, 2404 + v);
  if (v) {
    bracket(g, 30, 17, 3, P);
    bracket(g, 26, 19.5, 2.2, P);
  } else {
    toadstool(g, 30, 8, 0.95, P);
    toadstool(g, 33.5, 9.4, 0.7, P);
  }
  sedge(g, v ? 6 : 35, 23, 5.5, P, rngOf(2401 + v), 4);
}

/** Длинное замшелое бревно на две клетки: сук с бородой лишайника, мох, поганки и трутовик. */
function paintBogBigLog(g, look, v) {
  const P = look.pal;
  const rnd = rngOf(2601 + v);
  limb(g, [44, 9, 47.5, 4.5, 52, 2.6], 2.6, P.trunk, dim(P.trunk), 1.2);
  beard(g, 50, 3.5, 8, P.lichen, rnd);
  logBody(g, 5, 15, 62, 8, P, 2602 + v);
  mossPad(g, v ? 46 : 22, 8, 11, 3.2, P, 2603 + v);
  mossPad(g, v ? 18 : 57, 9, 6, 2.4, P, 2604 + v);
  toadstool(g, v ? 30 : 38, 8.4, 1, P);
  toadstool(g, v ? 34.5 : 42.5, 9.2, 0.7, P);
  bracket(g, v ? 56 : 14, 19, 3, P);
  sedge(g, 67, 24.5, 6, P, rnd, 4);
}

/** Трухлявый пень: лесной пень с мхом на спиле и поганкой, по коре — трутовики или мох с осокой у корней. */
function paintBogStump(g, look, v) {
  const P = look.pal;
  paintStump(g, look, 0);
  if (v) {
    bracket(g, 6.6, 19, 3.2, P);
    bracket(g, 7.4, 23.4, 2.4, P);
    mossPad(g, 21, 12.2, 4.6, 1.9, P, 2451);
  } else {
    mossPad(g, 8, 25, 5, 2.2, P, 2452);
    sedge(g, 4.5, 27.5, 5.5, P, rngOf(2453), 4);
  }
}

/** Валун во мху, у подножия осока. */
function paintBogRock(g, look, v) {
  const P = look.pal;
  const rnd = rngOf(2501 + v);
  if (v === 0) rock(g, 18, 25, 29, 19, 2502, P, { moss: 1 });
  else if (v === 1) {
    rock(g, 14.5, 24.5, 22, 16, 2503, P, { moss: 0.8 });
    rock(g, 27.5, 25.5, 13, 9, 2504, P, { cracks: 1, lw: 1.5, moss: 0.6 });
  } else rock(g, 18, 25, 31, 13.5, 2505, P, { moss: 1, cracks: 1 });
  sedge(g, v === 2 ? 31.5 : 5.5, 26.5, 6, P, rnd, 4);
  if (v !== 1) sedge(g, v === 2 ? 5 : 31, 27, 5, P, rnd, 3);
}

/**
 * Рогоз вместо куста: пучок длинных листьев и бурые початки на стеблях. Его ломают рывком, поэтому тень на
 * земле — в самой картинке, а в фоне от него нет ничего.
 */
function paintCattails(g, look, v) {
  const P = look.pal;
  const rnd = rngOf(2701 + v);
  spot(g, 24, 34, 19, 5.4, SHADOW, 0.5);
  oval(g, 23, 33.6, 14.5, 3.6, fade(SHADOW, 0.28));
  sedge(g, 22, 31, 21, P, rnd, 7);
  const heads = v === 1 ? [[14, 8], [22, 3.5], [30, 9.5], [26, 14]]
    : v === 2 ? [[12, 11], [19, 4], [27, 6.5], [33, 12]] : [[13, 7], [20.5, 3], [28, 5.5], [33.5, 11], [17, 13]];
  for (const [hx, hy] of heads) {
    const bx = 22 + (hx - 22) * 0.35;
    limb(g, [bx, 31, (bx + hx) / 2 + (hx - 22) * 0.1, (31 + hy) / 2, hx, hy + 6], 1.2, P.reedDark, dim(P.reedDark, 0.55), 0.8);
    limb(g, [hx, hy + 9, hx, hy + 2.6], 3.3, P.cattail, dim(P.cattail, 0.5), 1);
    g.lineCap = 'round';
    g.strokeStyle = fade(lift(P.cattail, 0.6), 0.75);
    g.lineWidth = 0.9;
    g.beginPath();
    g.moveTo(hx - 0.8, hy + 8);
    g.lineTo(hx - 0.8, hy + 3.6);
    g.stroke();
    g.strokeStyle = P.reedDark;
    g.beginPath();
    g.moveTo(hx, hy + 1.2);
    g.lineTo(hx, hy - 1.4);
    g.stroke();
  }
  puff(g, jitterCircles([[15, 28, 6.5], [23, 27, 7.5], [31, 28.5, 6.5]], v * 211 + 3, 1), look.tone.bush, 2702 + v, { under: 0.45, marks: 5 });
  sedge(g, 12, 33, 9, P, rnd, 4);
  sedge(g, 31, 33.5, 8, P, rnd, 4);
}

/** Ствол в стене: бурый во мху, сухой серый с бородой лишайника, берёзовый, тёмный с папоротником. */
function paintSwampWallTrunk(g, look, v) {
  const P = look.pal;
  const x = 16;
  const base = 53;
  const rnd = rngOf(2801 + v);
  if (v === 0) trunk(g, x, base, 54, 13, P, 2802, { shade: 30, flare: 5 });
  else if (v === 1) trunk(g, x, base, 54, 9, P, 2803, { shade: 30, lean: 3, flare: 3, color: P.deadwood, dark: mix(P.deadwood, P.trunkDark, 0.75) });
  else if (v === 2) trunk(g, x, base, 54, 7.5, P, 2804, { color: P.birch, dark: P.birchShade, marks: P.birchMark, flare: 1.6, lean: -2, taper: 0.32, shade: 32 });
  else trunk(g, x, base, 54, 11, P, 2805, { color: mix(P.trunk, P.trunkDark, 0.35), shade: 30, lean: -1.5, flare: 4.5 });
  if (v !== 2) mossPad(g, x - 3, base - 2, 6, 2.4, P, 2806 + v);
  if (v === 0) {
    bracket(g, x + 6.6, base - 18, 3, P);
    bracket(g, x + 6.2, base - 12.5, 2.3, P);
  } else if (v === 1) beard(g, x + 4, base - 34, 12, P.lichen, rnd);
  else if (v === 3) fern(g, x + 8, base + 1, 7, look.tone.far.base, look.tone.mid.base, rnd);
}

/** Бахрома под лесной кроной: плети ивы от x0 до x1 с высоты y и пара бород лишайника между ними. */
function fringe(g, look, seed, x0, x1, y, n, min, max, beards) {
  const rnd = rngOf(seed);
  const front = [];
  const back = [];
  for (let i = 0; i < n; i++) {
    const sx = x0 + ((i + 0.2 + rnd() * 0.6) / n) * (x1 - x0);
    (i % 2 ? back : front).push([sx, y + rnd() * 3, min + rnd() * (max - min), (rnd() - 0.5) * 2.4]);
  }
  strands(g, back, look.tone.near, seed + 1);
  strands(g, front, look.tone.willow, seed + 2);
  for (let i = 0; i < beards; i++) beard(g, x0 + (0.15 + rnd() * 0.7) * (x1 - x0), y + 4, min, look.pal.lichen, rnd);
}

/** Крона над верхней стеной: лесные ряды клубов в здешних тонах, с ближнего ряда свисают плети и лишайник. */
function paintSwampWallTop(g, look, v) {
  paintWallTop(g, look, v);
  fringe(g, look, 2811 + v * 7, 9, 107, 50, 9, 8, 15, 2);
}

/** То же, но узкое: для стены в одну-две клетки. */
function paintSwampWallCap(g, look, v) {
  paintWallCap(g, look, v);
  fringe(g, look, 2831 + v * 7, 14, 66, 50, 5, 8, 15, 1);
}

/** Клуб кроны сверху — боковые и нижняя стены; по нижнему краю — короткая бахрома плетей. */
function paintSwampWallSide(g, look, v) {
  paintWallSide(g, look, v);
  fringe(g, look, 2851 + v * 7, 21, 55, 53, 4, 4, 6, 0);
}

const SWAMP = addBiome({
  id: 'swamp',
  pal: SWAMP_PAL,
  tall: [['willow', 4], ['snag', 2.6], ['stub', 2.2], ['birch', 1.6]],
  low: [['hummock', 4.5], ['log', 3], ['stump', 2.2], ['rock', 2.4]],
  bush: 'bush',
  ground: swampGround,
  decals: swampDecals,
  special: swampMud,
  water: swampWater,
  thorns: swampThorns,
  sprites: {
    willow: { w: 80, h: 96, ox: 40, oy: 89, variants: 3, paint: paintWillow, foot: [11, 4.6], crown: 27 },
    snag: { w: 60, h: 82, ox: 30, oy: 76, variants: 2, paint: paintSnag, foot: [9, 4], crown: 11 },
    stub: { w: 48, h: 62, ox: 24, oy: 57, variants: 2, paint: paintStub, foot: [13, 4.8], crown: 12 },
    // кривая болотная берёзка — лесная, но листва на ней редкая и желтоватая
    birch: { w: 56, h: 96, ox: 28, oy: 90, variants: 2, paint: (g, look, v) => paintBirch(g, tinted(look, { near: 'willow', birch: 'pale' }), v), foot: [6, 3], crown: 15 },
    hummock: { w: 38, h: 30, ox: 19, oy: 26, variants: 3, paint: paintHummock, foot: [14, 4.4], sit: 8 },
    log: { w: 40, h: 26, ox: 20, oy: 22, variants: 2, paint: paintMossLog, foot: [15, 4.2], sit: 8 },
    stump: { w: 34, h: 30, ox: 17, oy: 26, variants: 2, paint: paintBogStump, foot: [13, 4.4], sit: 8 },
    rock: { w: 36, h: 28, ox: 18, oy: 25, variants: 3, paint: paintBogRock, foot: [14, 4.6] },
    biglog: { w: 72, h: 28, ox: 36, oy: 23, variants: 2, paint: paintBogBigLog, foot: [31, 4.6], sit: 8 },
    bush: { w: 46, h: 40, ox: 22, oy: 34, variants: 3, paint: paintCattails, foot: [15, 5], sit: 10 },
    wtrunk: { w: 32, h: 56, ox: 16, oy: 53, variants: 4, paint: paintSwampWallTrunk },
    wtop: { w: 116, h: 74, ox: 58, oy: 72, variants: 3, paint: paintSwampWallTop },
    wcap: { w: 80, h: 74, ox: 40, oy: 72, variants: 2, paint: paintSwampWallCap },
    wside: { w: 76, h: 66, ox: 38, oy: 62, variants: 4, paint: paintSwampWallSide },
  },
});

// Свои тона листвы: ива — светлая, желтоватая; у берёзки листва ещё бледнее. Двери остаются лесными.
const leafy = (base, light, dark) => ({ base, light, dark, line: dim(base, 0.62) });
Object.assign(SWAMP.tone, {
  willow: leafy('#8fae5a', '#cfe08c', '#5f8246'),
  pale: leafy('#b9c65a', '#e6ec9a', '#84923e'),
});

// =====================================================================================================
// ЗИМНИЙ БОР
// =====================================================================================================

// Снег темнее и синее, чем в общей палитре: белому зайцу, светлому ободку красных зон и снежным шапкам нужен
// фон, на котором они видны.
const TAIGA_PAL = {
  ground: '#cddaea', groundLight: '#f0f5fa', groundDark: '#b4c6dc', groundDeep: '#8ea7c6',
  flowers: ['#ffffff', '#cfe6ff', '#ffffff'], flowerCore: ['#f2b632', '#e08a2a'],
  path: '#b9c8db', pathDark: '#9aaec8',
  trunk: '#6a4a36', trunkDark: '#3f2a20',
  canopy: '#2f6b54', canopyLight: '#4f8f6a', canopyDark: '#1f4a3f', canopyDeep: '#153530',
  stump: '#9a7a5a', rock: '#a9b4c2', rockDark: '#76839a', rockLight: '#dfe6ee',
  bush: '#3f7f5c', berry: '#d8453a',
  water: '#3b6f9a', waterDeep: '#274f78', shine: '#dff3ff',

  under: mix('#153530', SHADOW, 0.5),    // земля под ёлками и глубина бора
  sun: '#fff7e0',                        // низкое зимнее солнце: тёплые блики на холодном снегу
  shore: '#eaf4fb', seedHead: '#d9c9a0',
  moss: '#ffffff',                       // «мох» лесных камней, пней и брёвен здесь — снег
  thorn: '#5a4234', thornTip: '#f4fbff', thornLeaf: '#9fb6cf', berryDark: '#8a2030',
  birch: '#ebe6dc', birchShade: '#8f8a86', birchMark: '#3a3432', birchLeaf: '#cfe3f2', fir: '#2a6a50',
  snow: '#ffffff', snowBody: '#f6f9fc', snowShade: '#c2d2e4', snowDeep: '#93abc6', snowLine: '#7d93b2', snowEdge: '#64799a',
  ice: '#bfe4f6', iceDark: '#8fc8e8', iceDeep: '#6aa9d4', frost: '#f4fbff',
  earth: '#8a7a6a', dry: '#c2a878', dryDark: '#8f7648', cone: '#8a5a36',
  pineBark: '#b0683c', pineBarkDark: '#6a3a22',
  carrot: '#f08a2a', coal: '#2a2a32', scarf: '#d8453a', bucket: '#7a8696',
};

// ---------- приёмы: снег, сосульки, ярус ели ----------

/** Снег по контуру path: белая масса, по нижнему правому краю — голубая тень, обводка — мягкая синева. */
function snowMass(g, path, P, lw = 1.3) {
  g.lineJoin = 'round';
  g.beginPath();
  path(g);
  g.strokeStyle = P.snowLine;
  g.lineWidth = lw * 2;
  g.stroke();
  g.fillStyle = P.snow;
  g.fill();
  g.save();
  g.clip();
  g.translate(-1.3, -1.7);
  g.beginPath();
  path(g);
  g.strokeStyle = P.snowShade;
  g.lineWidth = 3.2;
  g.stroke();
  g.restore();
}

/** Снежная шапка на чём-то: купол шириной 2·rx и высотой h лежит на линии y; низ — волной, со свесами. */
function snowCap(g, x, y, rx, h, P) {
  snowMass(g, (c) => {
    c.moveTo(x - rx, y);
    c.bezierCurveTo(x - rx, y - h * 1.3, x + rx, y - h * 1.3, x + rx, y);
    c.quadraticCurveTo(x + rx * 0.55, y + 1.9, x + rx * 0.1, y + 0.5);
    c.quadraticCurveTo(x - rx * 0.45, y + 2.1, x - rx, y);
    c.closePath();
  }, P, 1.1);
}

/** Снег на земле у подножия: лепёшка неровной формы. */
function snowPad(g, x, y, rx, ry, P, seed) {
  snowMass(g, (c) => blob(c, x, y, rx, ry, seed, 0.1, 8), P, 1);
}

/** Сосульки: ряд ледяных зубцов вниз от линии y между x0 и x1. */
function icicles(g, x0, x1, y, P, rnd, n = 4) {
  g.lineJoin = 'round';
  g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const ix = x0 + ((i + 0.3 + rnd() * 0.4) / n) * (x1 - x0);
    const len = 3 + rnd() * 4.5;
    const w = 1.1 + rnd() * 0.5;
    g.fillStyle = P.ice;
    g.strokeStyle = P.snowLine;
    g.lineWidth = 0.7;
    g.beginPath();
    g.moveTo(ix - w, y);
    g.lineTo(ix + w, y);
    g.lineTo(ix + 0.2, y + len);
    g.closePath();
    g.fill();
    g.stroke();
    g.strokeStyle = '#ffffff';
    g.lineWidth = 0.6;
    g.beginPath();
    g.moveTo(ix - w * 0.4, y + 0.6);
    g.lineTo(ix, y + len * 0.6);
    g.stroke();
  }
}

/**
 * Ярус ели — «юбка» с зубчатым низом: макушка в (x, bottom − tall), низ шириной 2·half. t — тон хвои.
 * o: snow — сколько на ярусе снега, 0…1 (шапкой через макушку); color — своя краска яруса; marks — хвоинок.
 */
function tier(g, x, bottom, half, tall, t, P, seed, o = {}) {
  const top = bottom - tall;
  const rnd = rngOf(seed);
  const teeth = half > 15 ? 5 : 4;
  const jag = [];
  for (let i = 0; i < teeth; i++) jag.push((rnd() - 0.5) * 2, 4 + rnd() * 2.5, i === teeth - 1 ? 0 : rnd() * 1.5);
  const path = (c) => {
    c.moveTo(x, top);
    c.quadraticCurveTo(x - half * 0.3, bottom - tall * 0.4, x - half, bottom - 2);
    for (let i = 0; i < teeth; i++) {
      const x0 = x - half + (i / teeth) * half * 2;
      const x1 = x - half + ((i + 1) / teeth) * half * 2;
      c.quadraticCurveTo((x0 + x1) / 2 + jag[i * 3], bottom + jag[i * 3 + 1], x1, bottom - 2 + jag[i * 3 + 2]);
    }
    c.quadraticCurveTo(x + half * 0.3, bottom - tall * 0.4, x, top);
    c.closePath();
  };
  const marks = [];
  for (let i = o.marks ?? 6; i > 0; i--) marks.push(x + (rnd() - 0.5) * half * 1.5, top + tall * (0.4 + rnd() * 0.55));
  solid(g, path, x, bottom - tall * 0.45, half, tall * 0.6, o.color ?? t.base, {
    light: 0.45, dark: 0.55, line: t.line,
    inside: (c) => {
      c.lineCap = 'round';
      c.lineWidth = 1.1;
      for (let i = 0; i < marks.length; i += 2) {
        const lit = marks[i] < x;
        c.strokeStyle = lit ? fade(t.light, 0.6) : fade(t.dark, 0.6);
        c.beginPath();
        c.moveTo(marks[i], marks[i + 1]);
        c.lineTo(marks[i] + (lit ? -2.4 : 2.4), marks[i + 1] + 3.2);
        c.stroke();
      }
    },
  });
  const k = o.snow ?? 0;
  if (k <= 0) return;
  // снег — шапкой через макушку: по левому (освещённому) скату спускается ниже, чем по правому; нижний край —
  // тремя наплывами, из-под них видна хвоя
  const at = (u) => [
    (1 - u) * (1 - u) * x + 2 * u * (1 - u) * (x - half * 0.3) + u * u * (x - half),
    (1 - u) * (1 - u) * top + 2 * u * (1 - u) * (bottom - tall * 0.4) + u * u * (bottom - 2),
  ];
  // верх яруса закрыт тем, что выше: снег должен спускаться в ту полосу, что видна из-под него
  const ul = 0.55 + 0.4 * Math.min(1, k);
  const ur = 0.45 + 0.35 * Math.min(1, k);
  const [lx, ly] = at(ul);
  const [qx, ry] = at(ur);
  const ex = lx - 0.9;
  const ey = ly - 0.3;
  const rx = 2 * x - qx + 0.9;
  const hang = (u) => [ex + (rx - ex) * u, ey + (ry - ey) * u];
  const [ax, ay] = hang(1 / 3);
  const [bx, by] = hang(2 / 3);
  snowMass(g, (c) => {
    c.moveTo(rx, ry);
    c.quadraticCurveTo(x + half * 0.3 * ur + 0.9, top + tall * 0.6 * ur - 0.8, x, top - 1.6);
    c.quadraticCurveTo(x - half * 0.3 * ul - 0.9, top + tall * 0.6 * ul - 0.8, ex, ey);
    c.quadraticCurveTo((ex + ax) / 2 + 0.6, (ey + ay) / 2 + 3.6, ax, ay);
    c.quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 + 3.4, bx, by);
    c.quadraticCurveTo((bx + rx) / 2, (by + ry) / 2 + 3.2, rx, ry);
    c.closePath();
  }, P, 1.1);
}

/** Ёлка из ярусов снизу вверх: list — [низ, полуширина, высота]; у каждого яруса своя тень на нижнем. */
function firOf(g, x, list, t, P, seed, snow, marks = 6) {
  list.forEach(([bottom, half, tall], k) => {
    if (k) spot(g, x + 2, bottom + 5, half * 0.95, 5, mix(t.dark, SHADOW, 0.4), 0.5);
    const more = typeof snow === 'function' ? snow(k) : snow;
    tier(g, x, bottom, half, tall, t, P, seed + k * 17, { snow: more, marks, color: k % 2 ? t.base : mix(t.base, t.dark, 0.18) });
  });
}

// ---------- земля зимы ----------

/** Снег буграми: к пятнам трёх тонов — белые спины намётов с голубой тенью под ними. Ровного листа нет. */
function taigaGround(g, R, P) {
  paintGround(g, R, P);
  const rnd = rngOf(hashInt(R.seed, 301));
  for (let i = Math.round((R.W * R.H) / 9000); i > 0; i--) {
    const x = rnd() * R.W;
    const y = rnd() * R.H;
    const rx = 22 + rnd() * 30;
    const ry = 5 + rnd() * 5;
    const rot = (rnd() - 0.5) * 0.5;
    spot(g, x + 3, y + ry * 0.9, rx, ry, P.snowDeep, 0.22, rot);
    spot(g, x, y, rx, ry, P.snow, 0.5, rot);
  }
}

/** Шишка на снегу. */
function firCone(g, x, y, a, P) {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  oval(g, 0.5, 0.9, 3.2, 1.7, fade(P.snowDeep, 0.5));
  oval(g, 0, 0, 3, 1.5, P.cone);
  oval(g, -0.4, -0.4, 1.8, 0.6, fade(lift(P.cone, 0.6), 0.7));
  g.strokeStyle = fade(dim(P.cone, 0.5), 0.7);
  g.lineWidth = 0.5;
  g.beginPath();
  for (const dx of [-1.2, 0, 1.2]) {
    g.moveTo(dx, -1.3);
    g.lineTo(dx + 0.5, 1.3);
  }
  g.stroke();
  g.restore();
}

/**
 * Мелочи зимы: цепочки следов, снежные бугорки, сухая трава из-под снега, шишки под ёлками, еловые веточки,
 * проталины с брусникой и блёстки. Всё плоское и без обводки — по этому ходят.
 */
function taigaDecals(g, R, P) {
  const floor = (x, y) => R.at(x, y) === TILE.FLOOR || R.at(x, y) === TILE.PATH;
  // следы: крупная сетка, в ячейке — может быть одна цепочка; шаг за шагом по дуге, пока не упрётся
  const prints = [];
  for (let cy = 0; cy * 144 < R.H; cy++) {
    for (let cx = 0; cx * 144 < R.W; cx++) {
      const rnd = rngOf(hashInt(R.seed, cx, cy, 311));
      if (rnd() < 0.3) continue;
      let px = (cx + rnd()) * 144;
      let py = (cy + rnd()) * 144;
      let a = rnd() * TAU;
      for (let i = 7 + Math.floor(rnd() * 6); i > 0; i--) {
        a += (rnd() - 0.5) * 0.5;
        px += Math.cos(a) * 11;
        py += Math.sin(a) * 11;
        if (R.under(px, py) !== TILE.FLOOR) break;
        const nx = -Math.sin(a) * 2.2;
        const ny = Math.cos(a) * 2.2;
        prints.push(px + nx, py + ny, 1.7, 1.25, px - nx + Math.cos(a) * 3, py - ny + Math.sin(a) * 3, 1.7, 1.25);
      }
    }
  }
  const lumps = [];
  const stalks = [];
  const stalksDark = [];
  const heads = [];
  const stars = [];
  for (let y = 0; y < R.h; y++) {
    for (let x = 0; x < R.w; x++) {
      if (!floor(x, y)) continue;
      const rnd = rngOf(hashInt(R.seed, x, y, 313));
      const bare = R.at(x, y) === TILE.PATH;
      const edgy = R.edgy(x, y);
      const px = () => (x + 0.08 + rnd() * 0.84) * T;
      const py = () => (y + 0.14 + rnd() * 0.8) * T;
      for (let i = bare ? 0 : 1 + Math.floor(rnd() * 2); i > 0; i--) {
        const r = 3 + rnd() * 4;
        lumps.push(px(), py(), r, r * 0.5);
      }
      for (let i = bare ? 0 : edgy ? 1 + Math.floor(rnd() * 2) : rnd() < 0.3 ? 1 : 0; i > 0; i--) {
        const bx = px();
        const by = py();
        const n = 3 + Math.floor(rnd() * 3);
        for (let k = 0; k < n; k++) {
          const off = k - (n - 1) / 2;
          const lean = off * 2 + (rnd() - 0.5) * 2;
          const tall = 4.5 + rnd() * 5;
          (k % 2 ? stalksDark : stalks).push(bx + off * 0.8, by, bx + lean * 0.3, by - tall * 0.7, bx + lean, by - tall);
          if (rnd() < 0.25) heads.push(bx + lean, by - tall - 0.5, 0.9, 1.7);
        }
      }
      if (rnd() < 0.3) stars.push(px(), py(), 1.4 + rnd() * 1.2);
    }
  }
  ovals(g, lumps.map((n, i) => (i % 4 === 0 ? n + 1 : i % 4 === 1 ? n + 1.3 : n)), fade(P.snowDeep, 0.4));
  ovals(g, lumps, fade(P.snow, 0.85));
  // след — вмятина: тёмное донце и светлый дальний край
  ovals(g, prints.map((n, i) => (i % 4 === 0 ? n + 0.6 : i % 4 === 1 ? n + 0.8 : n)), fade(P.snow, 0.9));
  ovals(g, prints, fade(P.snowDeep, 0.6));
  for (let y = 0; y < R.h; y++) {
    for (let x = 0; x < R.w; x++) {
      if (!floor(x, y)) continue;
      const rnd = rngOf(hashInt(R.seed, x, y, 315));
      const bare = R.at(x, y) === TILE.PATH;
      const px = () => (x + 0.1 + rnd() * 0.8) * T;
      const py = () => (y + 0.14 + rnd() * 0.78) * T;
      // проталина: тёмная земля, на ней листики и брусника
      if (!bare && !R.edgy(x, y) && rnd() < 0.05) {
        const ex = px();
        const ey = py();
        const r = 4.5 + rnd() * 3;
        oval(g, ex, ey, r + 1, r * 0.55 + 0.8, fade(P.snowDeep, 0.6));
        oval(g, ex, ey, r, r * 0.55, P.earth);
        for (let i = 3 + Math.floor(rnd() * 3); i > 0; i--) {
          const bx = ex + (rnd() - 0.5) * r * 1.3;
          const by = ey + (rnd() - 0.5) * r * 0.6;
          leaf(g, bx, by, 2.6, 1.1, rnd() * TAU, P.canopyLight);
          disc(g, bx + 0.8, by + 0.4, 1.05, dim(P.berry, 0.45));
          disc(g, bx + 0.8, by + 0.4, 0.8, P.berry);
        }
      }
      // под ёлкой — шишки
      const tree = R.at(x - 1, y) === TILE.TALL || R.at(x + 1, y) === TILE.TALL || R.at(x, y - 1) === TILE.TALL || R.at(x, y + 1) === TILE.TALL;
      if (!bare && rnd() < (tree ? 0.5 : 0.04)) {
        const cx = px();
        const cy = py();
        for (let i = 1 + Math.floor(rnd() * 2); i > 0; i--) firCone(g, cx + (rnd() - 0.5) * 9, cy + (rnd() - 0.5) * 6, rnd() * TAU, P);
      }
      // еловая веточка: стебелёк и хвоинки в обе стороны
      if (!bare && rnd() < 0.07) {
        const tx = px();
        const ty = py();
        const a = rnd() * TAU;
        const co = Math.cos(a);
        const si = Math.sin(a);
        g.strokeStyle = P.canopy;
        g.lineWidth = 1;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(tx, ty);
        g.lineTo(tx + co * 7, ty + si * 7);
        for (let k = 1; k <= 4; k++) {
          const bx = tx + co * k * 1.5;
          const by = ty + si * k * 1.5;
          g.moveTo(bx, by);
          g.lineTo(bx + (co - si) * 1.8, by + (si + co) * 1.8);
          g.moveTo(bx, by);
          g.lineTo(bx + (co + si) * 1.8, by + (si - co) * 1.8);
        }
        g.stroke();
      }
      if (bare && rnd() < 0.3) pebble(g, px(), py(), 1.4 + rnd() * 1.5, P, rnd);
    }
  }
  strokes(g, stalksDark, P.dryDark, 1.1);
  strokes(g, stalks, P.dry, 1.1);
  ovals(g, heads, P.seedHead);
  for (let i = 0; i < stars.length; i += 3) sparkle(g, stars[i], stars[i + 1], stars[i + 2], '#ffffff');
}

/**
 * Лёд — особая земля зимы: замёрзшая лужа в снежном бортике. Бортик выше льда — на лёд падает его тень;
 * по льду косые блики, трещины и намётенный снег. По нему ходят (скользят), поэтому обводки нет.
 */
function taigaIce(g, R, P) {
  const ice = (x, y) => R.at(x, y) === TILE.SPECIAL;
  const loops = contours(R.w, R.h, ice);
  if (!loops.length) return;
  const s = R.seed + 3;
  const edge = (grow) => regionPath(g, loops, s, 13, 3, grow, 2);
  edge(5.5);
  g.fillStyle = fade(P.snowDeep, 0.5);
  g.fill();
  edge(3.4);
  g.fillStyle = P.snow;
  g.fill();
  edge(0.4);
  g.fillStyle = P.ice;
  g.fill();
  g.save();
  edge(0.4);
  g.clip();
  edge(-5);
  g.fillStyle = fade(P.iceDark, 0.55);
  g.fill();
  edge(-12);
  g.fillStyle = fade(P.iceDeep, 0.35);
  g.fill();
  g.lineJoin = 'round';
  g.save();
  g.translate(2.2, 2.8);
  edge(0.4);
  g.strokeStyle = fade(P.iceDeep, 0.6);
  g.lineWidth = 4;
  g.stroke();
  g.restore();
  g.save();
  g.translate(-1.4, -1.8);
  edge(0.4);
  g.strokeStyle = fade(P.snow, 0.85);
  g.lineWidth = 1.6;
  g.stroke();
  g.restore();
  const wide = [];
  const thin = [];
  const crack = [];
  const drift = [];
  for (let y = 0; y < R.h; y++) {
    for (let x = 0; x < R.w; x++) {
      if (!ice(x, y)) continue;
      const rnd = rngOf(hashInt(R.seed, x, y, 321));
      const px = () => (x + 0.1 + rnd() * 0.8) * T;
      const py = () => (y + 0.12 + rnd() * 0.76) * T;
      // блик: две косые полоски рядом — широкая и тонкая
      for (let i = 1 + Math.floor(rnd() * 2); i > 0; i--) {
        const bx = px();
        const by = py();
        const len = 5 + rnd() * 7;
        wide.push(bx, by, bx + len * 0.5, by - len * 0.3, bx + len, by - len * 0.6);
        thin.push(bx + 3, by + 1, bx + 3 + len * 0.3, by + 1 - len * 0.18, bx + 3 + len * 0.6, by + 1 - len * 0.36);
      }
      // трещина: ломаная в два колена
      if (rnd() < 0.55) {
        const cx = px();
        const cy = py();
        const a = rnd() * TAU;
        const len = 6 + rnd() * 8;
        const kx = cx + Math.cos(a) * len * 0.5 + (rnd() - 0.5) * 4;
        const ky = cy + Math.sin(a) * len * 0.5 + (rnd() - 0.5) * 4;
        crack.push(cx, cy, kx, ky, kx, ky, kx, ky, kx, ky, cx + Math.cos(a) * len, cy + Math.sin(a) * len);
      }
      if (rnd() < 0.4) {
        const r = 3 + rnd() * 4;
        drift.push(px(), py(), r, r * 0.4);
      }
    }
  }
  strokes(g, crack.map((n, i) => (i % 2 ? n + 0.9 : n + 0.6)), fade(P.iceDeep, 0.6), 0.9);
  strokes(g, crack, fade(P.frost, 0.85), 0.8);
  strokes(g, wide, fade('#ffffff', 0.6), 1.6);
  strokes(g, thin, fade('#ffffff', 0.5), 0.8);
  ovals(g, drift, fade(P.snow, 0.8));
  g.restore();
}

/**
 * Полынья — вода зимы: тёмная вода в ледяной кромке. Снежный берег, светлая полка льда, её синяя стенка и
 * тень на воде; в воде льдинки и блики. По краю из снега торчит сухая трава.
 */
function taigaWater(g, R, P) {
  const water = (x, y) => R.at(x, y) === TILE.WATER;
  const loops = contours(R.w, R.h, water);
  if (!loops.length) return;
  const s = R.seed + 7;
  const edge = (grow) => regionPath(g, loops, s, 13, 2.6, grow, 2);
  edge(7);
  g.fillStyle = fade(P.snowDeep, 0.5);
  g.fill();
  edge(4.6);
  g.fillStyle = P.snow;
  g.fill();
  edge(1.4);
  g.fillStyle = P.ice;
  g.fill();
  edge(-1.2);
  g.fillStyle = P.iceDeep;
  g.fill();
  g.save();
  edge(-2.8);
  g.clip();
  edge(-2.8);
  g.fillStyle = P.water;
  g.fill();
  edge(-9);
  g.fillStyle = fade(P.waterDeep, 0.7);
  g.fill();
  edge(-16);
  g.fillStyle = fade(P.waterDeep, 0.85);
  g.fill();
  g.lineJoin = 'round';
  g.save();
  g.translate(2.4, 3);
  edge(-2.8);
  g.strokeStyle = fade(mix(P.waterDeep, SHADOW, 0.5), 0.6);
  g.lineWidth = 4.4;
  g.stroke();
  g.restore();
  const glint = [];
  const floe = [];
  for (let y = 0; y < R.h; y++) {
    for (let x = 0; x < R.w; x++) {
      if (!water(x, y)) continue;
      const rnd = rngOf(hashInt(R.seed, x, y, 331));
      for (let i = 1 + Math.floor(rnd() * 2); i > 0; i--) {
        const bx = (x + 0.15 + rnd() * 0.6) * T;
        const by = (y + 0.15 + rnd() * 0.7) * T;
        glint.push(bx, by, bx + 2, by, bx + 3 + rnd() * 5, by);
      }
      // льдинки
      for (let i = rnd() < 0.6 ? 1 + Math.floor(rnd() * 2) : 0; i > 0; i--) {
        const r = 2.2 + rnd() * 2.6;
        floe.push((x + 0.2 + rnd() * 0.6) * T, (y + 0.2 + rnd() * 0.6) * T, r, r * 0.62);
      }
    }
  }
  strokes(g, glint, fade(P.shine, 0.5), 1);
  ovals(g, floe.map((n, i) => (i % 4 === 0 ? n + 0.9 : i % 4 === 1 ? n + 1.4 : n)), fade(mix(P.waterDeep, SHADOW, 0.5), 0.6));
  ovals(g, floe, P.snow);
  ovals(g, floe.map((n, i) => (i % 4 === 0 ? n + 0.5 : i % 4 === 1 ? n + 0.6 : i % 4 === 2 ? n * 0.6 : n * 0.5)), fade(P.snowShade, 0.9));
  g.restore();
  // светлая кромка льда у воды — справа снизу
  g.save();
  g.translate(-1.2, -1.5);
  edge(1.4);
  g.strokeStyle = fade('#ffffff', 0.8);
  g.lineWidth = 1.2;
  g.stroke();
  g.restore();
  const dry = [];
  for (let y = 0; y < R.h; y++) {
    for (let x = 0; x < R.w; x++) {
      if (!water(x, y)) continue;
      const rnd = rngOf(hashInt(R.seed, x, y, 333));
      const tuftAt = (bx, by) => {
        for (let k = 0; k < 4; k++) {
          const lean = (k - 1.5) * 2 + (rnd() - 0.5) * 2;
          const tall = 7 + rnd() * 6;
          dry.push(bx + (k - 1.5) * 0.9, by, bx + lean * 0.3, by - tall * 0.7, bx + lean, by - tall);
        }
      };
      if (!water(x, y - 1) && rnd() < 0.45) tuftAt((x + 0.2 + rnd() * 0.6) * T, y * T - 3);
      if (!water(x - 1, y) && rnd() < 0.25) tuftAt(x * T - 4, (y + 0.3 + rnd() * 0.6) * T);
      if (!water(x + 1, y) && rnd() < 0.25) tuftAt((x + 1) * T + 4, (y + 0.3 + rnd() * 0.6) * T);
    }
  }
  strokes(g, dry, P.dryDark, 1.9);
  strokes(g, dry, P.dry, 1);
}

/**
 * Колючки зимы — терновник в инее: лесные плети в здешних красках, на них снег и красные ягоды. Здесь же,
 * последним слоем земли, — длинные синие тени высокого: солнце зимой низко.
 */
function taigaThorns(g, R, P) {
  paintThorns(g, R, P);
  for (let y = 0; y < R.h; y++) {
    for (let x = 0; x < R.w; x++) {
      if (R.at(x, y) !== TILE.THORN) continue;
      const rnd = rngOf(hashInt(R.seed, x, y, 341));
      for (let i = 3; i > 0; i--) {
        const r = 2 + rnd() * 1.6;
        oval(g, x * T + 5 + rnd() * 22, y * T + 5 + rnd() * 22, r, r * 0.55, fade(P.snow, 0.9));
      }
      for (let i = 3 + Math.floor(rnd() * 2); i > 0; i--) {
        const bx = x * T + 4 + rnd() * 24;
        const by = y * T + 4 + rnd() * 24;
        disc(g, bx, by, 1.9, P.berryDark);
        disc(g, bx, by, 1.35, P.berry);
        disc(g, bx - 0.45, by - 0.5, 0.42, lift(P.berry, 0.75));
      }
    }
  }
  const shade = mix(SHADOW, P.snowDeep, 0.45);
  for (let y = 0; y < R.h; y++) {
    for (let x = 0; x < R.w; x++) {
      if (R.at(x, y) !== TILE.TALL) continue;
      const st = standing(R, TAIGA, x, y);
      if (!st) continue;
      const reach = (st.def.crown ?? 12) * 1.4 + 14;
      spot(g, st.x + reach * 0.82, st.y + reach * 0.36 + 2, reach, 6 + reach * 0.09, shade, 0.26, 0.4);
    }
  }
}

// ---------- картинки зимы ----------

/** Заснеженная ель: ярусы-юбки, на каждом снег по левому скату, на макушке шапка. Третья — вся в снегу. */
function paintSnowFir(g, look, v) {
  const P = look.pal;
  const x = 30;
  const base = 96;
  trunk(g, x, base, 20, 9, P, 3101 + v, { shade: 12 });
  const tiers = v === 1 ? [[85, 21.5, 27], [69, 18, 25], [54, 14.5, 23], [40, 11, 21], [27, 8, 19]]
    : v === 2 ? [[83, 27.5, 30], [64, 22, 28], [46, 16, 26], [30, 10.5, 22]] : [[83, 26.5, 29], [65, 22, 27], [48, 17, 25], [32, 12, 23]];
  firOf(g, x, tiers, look.tone.fir, P, 3110 + v * 100, (k) => (v === 2 ? 0.95 : 0.5 + ((k * 7 + v * 3) % 4) * 0.12));
  const last = tiers[tiers.length - 1];
  snowCap(g, x - 0.5, last[0] - last[2] + 3.5, 4.2, 5, P);
  if (v === 2) snowPad(g, x - 9, base - 0.5, 8, 2.6, P, 3103);
  else snowPad(g, x + 8, base, 6, 2.2, P, 3104 + v);
}

/** Сосна: высокий рыжий ствол с обломками сучьев и плоская крона наверху, на клубах — снег. */
function paintPine(g, look, v) {
  const P = look.pal;
  const t = look.tone;
  const x = 32;
  const base = 94;
  const lean = v ? -2 : 2;
  const J = (list, salt) => jitterCircles(list, v * 163 + salt, v ? 1.2 : 0.4).map(([cx, cy, r]) => [cx + lean, cy, r]);
  puff(g, J([[32, 28, 17], [18.5, 32, 12], [45.5, 32, 12], [32, 18, 11.5]], 1), t.mid, 3201 + v, { under: 0.35 });
  trunk(g, x, base, 66, 9.5, P, 3202 + v, { color: P.pineBark, dark: P.pineBarkDark, lean, taper: 0.3, flare: 3.2, shade: 12 });
  limb(g, [x + lean * 0.45 + 2, base - 36, x + 9, base - 40], 2, P.pineBark, dim(P.pineBark), 1.1);
  limb(g, [x + lean * 0.3 - 2, base - 27, x - 8, base - 30], 1.8, mix(P.pineBark, P.pineBarkDark, 0.4), dim(P.pineBark), 1.1);
  puff(g, J([[19.5, 38, 10.5], [13, 41, 6.5], [27, 42, 7.5]], 2), t.pine, 3203 + v, { under: 0.4 });
  puff(g, J([[45, 36, 10], [51.5, 39, 6.5], [38.5, 40, 7]], 3), t.pine, 3204 + v, { under: 0.5, light: 0.3 });
  puff(g, J([[31, 24, 13], [21, 27, 9], [41, 22, 9], [30, 15, 8]], 4), t.pine, 3205 + v, { dark: 0.36 });
  snowCap(g, 30 + lean, 11.4, 8.5, 4.4, P);
  snowCap(g, 19 + lean, 30, 6.6, 3.2, P);
  snowCap(g, 45.5 + lean, 28, 6.4, 3, P);
  snowPad(g, x - 7, base - 0.5, 6.5, 2.2, P, 3206 + v);
}

/** Снегирь: красная грудка, сизая спинка, чёрная шапочка. m — куда смотрит. */
function bullfinch(g, x, y, m, P) {
  limb(g, [x - 2.4 * m, y + 0.6, x - 5.6 * m, y + 1.8], 1.3, P.coal, dim(P.coal, 0.4), 0.5);
  oval(g, x, y, 3.5, 3, dim(P.berry, 0.6));
  oval(g, x, y, 2.8, 2.3, P.berry);
  oval(g, x - 1.5 * m, y - 0.2, 1.9, 1.9, P.bucket);
  disc(g, x + 1.5 * m, y - 2.3, 2.2, dim(P.coal, 0.4));
  disc(g, x + 1.5 * m, y - 2.3, 1.7, P.coal);
  disc(g, x + 2.1 * m, y - 2.7, 0.4, '#ffffff');
  leaf(g, x + 2.9 * m, y - 2, 1.9, 0.7, m > 0 ? 0.2 : Math.PI - 0.2, P.dry);
}

/** Зимняя берёза: белый ствол в чёрточках, голые сучья в инее, снег в развилках. На второй сидит снегирь. */
function paintFrostBirch(g, look, v) {
  const P = look.pal;
  const m = v ? -1 : 1;
  const x = 28;
  const base = 90;
  const lean = 2.5 * m;
  const twig = mix(P.birchMark, P.birch, 0.3);
  const line = dim(twig, 0.5);
  const at = (list) => list.map((n, i) => (i % 2 ? base + n : x + n * m));
  const boughs = [
    [[1.5, -46, 7, -55, 12, -60, 15, -68], 2.4], [[0.5, -51, -6, -60, -11, -64, -14, -73], 2.3], [[2, -56, 3.5, -65, 1.5, -72, 3, -78], 2.2],
    [[9, -58, 13, -56, 17, -58], 1.4], [[13, -64, 17, -64, 19, -68], 1.3], [[-8, -62, -13, -60, -17, -63], 1.4],
    [[-12, -69, -10, -74, -12, -78], 1.3], [[2.5, -67, 7, -71, 8.5, -77], 1.3], [[1.5, -71, -3, -75, -5, -79], 1.2],
  ];
  // иней: веер тонких светлых веточек на конце каждого сука
  const frost = [];
  const rnd = rngOf(3301 + v);
  for (const [pts] of boughs) {
    const n = pts.length;
    const ex = x + pts[n - 2] * m;
    const ey = base + pts[n - 1];
    const a0 = Math.atan2(pts[n - 1] - pts[n - 3], (pts[n - 2] - pts[n - 4]) * m);
    for (let i = 0; i < 5; i++) {
      const a = a0 + (i - 2) * 0.42 + (rnd() - 0.5) * 0.2;
      const len = 3.5 + rnd() * 3;
      frost.push(ex, ey, ex + Math.cos(a) * len * 0.5, ey + Math.sin(a) * len * 0.5 + 0.6, ex + Math.cos(a) * len, ey + Math.sin(a) * len);
    }
  }
  strokes(g, frost, P.snowLine, 2.2);
  strokes(g, frost, P.frost, 1.1);
  for (const [pts, width] of boughs) limb(g, at(pts), width, twig, line, 1);
  trunk(g, x, base, 62, 8, P, 3302 + v, { color: P.birch, dark: P.birchShade, marks: P.birchMark, flare: 1.8, lean, taper: 0.3 });
  snowCap(g, x + lean * 0.76 + 0.5 * m, base - 49, 4.2, 2.6, P);
  snowCap(g, x + 9.5 * m, base - 58.5, 3.4, 2, P);
  snowCap(g, x - 9 * m, base - 63.5, 3.2, 2, P);
  snowPad(g, x - 5 * m, base - 0.5, 7, 2.4, P, 3303 + v);
  if (v) bullfinch(g, x + 13.5 * m, base - 59.5, -m, P);
}

/** Высокая скала под снегом: шапка на макушке (лесной «мох» здесь белый), намёты у подножия. */
function paintSnowCrag(g, look, v) {
  const P = look.pal;
  if (v === 0) {
    rock(g, 29, 53, 22, 30, 3402, P, { cracks: 1, moss: 0.8 });
    rock(g, 19, 55, 30, 46, 3403, P, { moss: 1, cracks: 3 });
  } else {
    rock(g, 15, 54, 20, 26, 3404, P, { cracks: 1, moss: 0.8 });
    rock(g, 26, 55, 31, 43, 3405, P, { moss: 1, cracks: 3 });
  }
  snowPad(g, v ? 37 : 8, 55.4, 7, 2.6, P, 3406 + v);
  snowPad(g, v ? 9 : 37.5, 56, 5.5, 2.2, P, 3408 + v);
}

/** Сугроб: снежный бугор с голубой тенью; из одного торчит сухая трава, у другого сосед поменьше. */
function paintDrift(g, look, v) {
  const P = look.pal;
  const rnd = rngOf(3501 + v);
  const o = (cx, base, rx, h, lean = 0) => ({
    line: P.snowEdge, light: 0.6, dark: 0.2, lean,
    inside: (c) => spot(c, cx + rx * 0.5, base - h * 0.05, rx * 1.05, h * 0.6, P.snowDeep, 0.5),
  });
  const heap = (cx, base, rx, h, lean) => mound(g, cx, base, rx, h, P.snowBody, o(cx, base, rx, h, lean));
  if (v === 0) {
    const dry = [];
    for (let k = 0; k < 5; k++) {
      const lean = (k - 2) * 2.4 + (rnd() - 0.5) * 2;
      const tall = 8 + rnd() * 5;
      dry.push(23 + (k - 2) * 0.9, 13, 23 + lean * 0.3, 13 - tall * 0.7, 23 + lean, 13 - tall);
    }
    strokes(g, dry, P.dryDark, 2);
    strokes(g, dry, P.dry, 1);
    heap(19, 24, 16, 15, -2);
  } else if (v === 1) {
    heap(26, 23.5, 10, 11, 1);
    heap(15, 24.5, 13.5, 15.5, -1.5);
  } else {
    heap(19, 24, 17, 12.5, 3);
    limb(g, [11, 17, 8, 10, 4.5, 7], 1.3, P.trunk, dim(P.trunk), 0.9);
    limb(g, [8.6, 11.5, 10.5, 7], 1, P.trunk, dim(P.trunk), 0.8);
  }
  sparkle(g, v === 1 ? 12 : 15, v === 2 ? 15.5 : 14, 1.7, '#ffffff');
}

/** Снеговичок: два кома, руки-веточки, морковка, угольки и шарф; у второго на голове ведро. */
function paintSnowman(g, look, v) {
  const P = look.pal;
  const x = 17;
  const hx = x + (v ? 0.8 : -0.5);
  const ball = (cx, cy, r) => solid(g, (c) => c.arc(cx, cy, r, 0, TAU), cx, cy, r, r, P.snowBody, {
    line: P.snowEdge, light: 0.6, dark: 0.2, lw: 1.5,
    inside: (c) => spot(c, cx + r * 0.5, cy + r * 0.55, r * 1.05, r * 0.9, P.snowDeep, 0.5),
  });
  limb(g, [x - 5, 19, x - 10.5, 15, x - 14, 11.5], 1.2, P.trunk, dim(P.trunk), 0.8);
  limb(g, [x - 10.5, 15, x - 14, 16.5], 0.9, P.trunk, dim(P.trunk), 0.7);
  limb(g, [x + 5, 19, x + 10.5, 16, x + 14, 13.5], 1.2, P.trunk, dim(P.trunk), 0.8);
  limb(g, [x + 10.5, 16, x + 12, 12], 0.9, P.trunk, dim(P.trunk), 0.7);
  ball(x, 22.2, 8.4);
  ball(hx, 10.4, 6);
  limb(g, [hx - 5.4, 14.6, hx, 16.4, hx + 5.4, 14.6], 2.4, P.scarf, dim(P.scarf, 0.55), 1);
  limb(g, [hx + 3.4, 15.8, hx + 4.8, 19.5, hx + 4, 22.5], 2.2, P.scarf, dim(P.scarf, 0.55), 1);
  for (const dx of [-2.1, 2.3]) {
    disc(g, hx + dx, 9, 0.95, P.coal);
    disc(g, hx + dx - 0.3, 8.7, 0.3, '#ffffff');
  }
  leaf(g, hx + 0.2, 11, 6.6, 1.6, 0.12, dim(P.carrot, 0.55));
  leaf(g, hx + 0.5, 11, 5.4, 1.1, 0.12, P.carrot);
  disc(g, x - 0.4, 21, 0.9, P.coal);
  disc(g, x - 0.2, 25, 0.9, P.coal);
  if (v) {
    g.fillStyle = P.bucket;
    g.strokeStyle = dim(P.bucket, 0.6);
    g.lineWidth = 1.3;
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(hx - 5, 5.8);
    g.lineTo(hx - 3.6, 0.6);
    g.lineTo(hx + 3.6, 0);
    g.lineTo(hx + 5, 5);
    g.closePath();
    g.fill();
    g.stroke();
    g.strokeStyle = fade(lift(P.bucket, 0.7), 0.8);
    g.lineWidth = 0.9;
    g.beginPath();
    g.moveTo(hx - 2.6, 1.6);
    g.lineTo(hx - 3.4, 4.8);
    g.stroke();
  } else snowCap(g, hx - 0.4, 5.4, 4.2, 2.4, P);
  snowPad(g, x + 9.5, 30, 5, 1.8, P, 3551 + v);
}

/** Валун под снегом, у подножия намело. */
function paintSnowRock(g, look, v) {
  const P = look.pal;
  if (v === 0) rock(g, 18, 25, 29, 19, 3601, P, { moss: 0.9 });
  else if (v === 1) {
    rock(g, 15, 24.5, 23, 17, 3602, P, { moss: 0.8 });
    rock(g, 28, 25.5, 13, 9.5, 3603, P, { cracks: 1, lw: 1.5, moss: 0.7 });
  } else rock(g, 18, 25, 32, 14, 3604, P, { moss: 1, cracks: 1 });
  snowPad(g, v === 2 ? 30 : 6.5, 25.6, 5.5, 2, P, 3605 + v);
}

/** Пень под снегом: лесной пень с веточкой — здесь она сухая; на спиле шапка, у второго с неё свисают сосульки. */
function paintSnowStump(g, look, v) {
  const P = look.pal;
  paintStump(g, { ...look, pal: { ...P, canopy: P.dryDark, canopyLight: P.dry } }, 1);
  if (v) icicles(g, 7.5, 15.5, 14.2, P, rngOf(3652), 3);
  snowCap(g, v ? 17.5 : 15.5, 13.6, v ? 9.4 : 8, v ? 5 : 3.8, P);
  snowPad(g, v ? 5.5 : 28.5, 26.4, 5, 2, P, 3651 + v);
}

/** Бревно под снегом: шапка вдоль всего верха, у торца намело. */
function paintSnowLog(g, look, v) {
  const P = look.pal;
  if (v) limb(g, [25, 8.5, 27, 4.6, 30.5, 2.8], 2.2, P.trunk, dim(P.trunk), 1.1);
  logBody(g, 5, 14.5, 30, 7.5, P, 3701 + v);
  snowCap(g, v ? 17 : 20, 8.2, v ? 9.5 : 12.5, 3.6, P);
  if (v) snowCap(g, 30, 3.4, 2.6, 1.8, P);
  snowPad(g, v ? 34 : 7, 22.4, 5, 1.9, P, 3703 + v);
}

/** Длинное бревно на две клетки: сук с шапочкой снега, снег вдоль верха — в два намёта. */
function paintSnowBigLog(g, look, v) {
  const P = look.pal;
  limb(g, [44, 9, 47.5, 4.5, 52, 2.6], 2.6, P.trunk, dim(P.trunk), 1.2);
  logBody(g, 5, 15, 62, 8, P, 3711 + v);
  snowCap(g, v ? 22 : 25, 8.4, v ? 15 : 18, 4, P);
  snowCap(g, v ? 55 : 57.5, 8.6, v ? 9 : 7, 3, P);
  snowCap(g, 51.5, 3.2, 2.8, 1.8, P);
  snowPad(g, v ? 8 : 64, 24, 6, 2, P, 3713 + v);
}

/**
 * Можжевельник вместо куста: тёмная хвоя под снегом и гроздья красных ягод. Его ломают рывком, поэтому тень
 * на земле — в самой картинке, а в фоне от него нет ничего.
 */
function paintJuniper(g, look, v) {
  const P = look.pal;
  const t = look.tone;
  const J = (list, salt) => jitterCircles(list, v * 211 + salt, v ? 1.3 : 0.3);
  spot(g, 24, 32, 19, 5.4, SHADOW, 0.5);
  oval(g, 23, 31.6, 14.5, 3.6, fade(SHADOW, 0.28));
  puff(g, J([[22, 17.5, 11.5], [12, 21, 8.5], [32, 20, 9.5], [22, 11.5, 6.5]], 1), t.mid, 3801 + v, { under: 0.35 });
  const front = J([[15, 23, 9.5], [28, 24, 10], [22, 18.5, 8.5], [7.5, 26.5, 5.6], [36, 27, 5.6]], 2);
  puff(g, front, t.bush, 3802 + v, { under: 0.45 });
  snowCap(g, 21, 9.6, 8.5, 4.2, P);
  snowCap(g, 10.5, 17.5, 5.2, 2.6, P);
  if (v !== 1) snowCap(g, 33, 16.6, 5.4, 2.6, P);
  const rnd = rngOf(3803 + v);
  for (let i = v === 1 ? 4 : 3; i > 0; i--) {
    const c = front[Math.floor(rnd() * 3)];
    const a = rnd() * TAU;
    const d = Math.sqrt(rnd()) * c[2] * 0.6;
    const bx = c[0] + Math.cos(a) * d;
    const by = c[1] + 2 + Math.abs(Math.sin(a)) * d * 0.7;
    const bunch = [[0, 0], [2.3, 0.8], [1, 2.3]];
    for (const [dx, dy] of bunch) disc(g, bx + dx, by + dy, 1.9, dim(P.berry, 0.55));
    for (const [dx, dy] of bunch) {
      disc(g, bx + dx, by + dy, 1.3, P.berry);
      disc(g, bx + dx - 0.4, by + dy - 0.45, 0.42, lift(P.berry, 0.75));
    }
  }
}

/** Ствол в стене — лесной, у корней намело снега. */
function paintTaigaWallTrunk(g, look, v) {
  paintWallTrunk(g, look, v);
  snowPad(g, 13.5, 49, 9, 2.4, look.pal, 3941 + v);
}

/** Ряд ёлок стены: xs — где стоят, list — ярусы, каждую чуть сносит вбок и вверх-вниз. */
function firRow(g, xs, list, t, P, seed, snow, cap) {
  const rnd = rngOf(seed);
  xs.forEach((fx, i) => {
    const x = fx + (rnd() - 0.5) * 3;
    const dy = (rnd() - 0.5) * 3;
    const tiers = list.map(([bottom, half, tall]) => [bottom + dy, half, tall]);
    firOf(g, x, tiers, t, P, seed + i * 101, snow, 4);
    if (cap) {
      const last = tiers[tiers.length - 1];
      snowCap(g, x - 0.4, last[0] - last[2] + 3.2, 3.4, 4.4, P);
    }
  });
}

/**
 * Край бора над верхней стеной: три ряда еловых макушек — чем ближе ряд, тем светлее хвоя и больше на ней снега.
 * Низ ближнего ряда висит над землёй: под ним видны стволы.
 */
function paintTaigaWallTop(g, look, v) {
  const P = look.pal;
  const t = look.tone;
  firRow(g, [16, 37, 58, 79, 100], [[43, 12.5, 22], [29, 9, 21]], t.far, P, 3901 + v * 11, 0.3, false);
  firRow(g, [27, 48, 69, 90], [[51, 14.5, 23], [37, 10.5, 21]], t.mid, P, 3911 + v * 11, 0.6, false);
  firRow(g, [18, 38, 58, 78, 98], [[56, 15, 19], [45, 11.5, 17], [35, 8, 13]], t.near, P, 3921 + v * 11, 0.85, true);
}

/** То же, но узкое: для стены в одну-две клетки. */
function paintTaigaWallCap(g, look, v) {
  const P = look.pal;
  const t = look.tone;
  firRow(g, [22, 40, 58], [[43, 12.5, 22], [29, 9, 21]], t.far, P, 3931 + v * 11, 0.3, false);
  firRow(g, [30, 51], [[51, 14.5, 23], [37, 10.5, 21]], t.mid, P, 3941 + v * 11, 0.6, false);
  firRow(g, [20, 40, 60], [[56, 15, 19], [45, 11.5, 17], [35, 8, 13]], t.near, P, 3951 + v * 11, 0.85, true);
}

/** Ёлка сверху — боковые и нижняя стены: пушистая, до земли, рядом — поменьше. Нависает над полом. */
function paintTaigaWallSide(g, look, v) {
  const P = look.pal;
  const t = look.tone;
  const m = v % 2 ? -1 : 1;
  const x = 38 + m * 4;
  firOf(g, 38 - m * 20, [[52, 12.5, 19], [40, 9.5, 17], [29, 6.5, 14]], t.mid, P, 3961 + v * 7, 0.55, 4);
  firOf(g, x, [[56, 23, 22], [43, 18.5, 20], [31, 13.5, 18], [20, 8.5, 14]], v > 1 ? t.fir : t.near, P, 3971 + v * 7, v > 1 ? 0.95 : 0.75, 5);
  snowCap(g, x - 0.5, 9.4, 3.6, 4.6, P);
}

/** Дверь верхней стены — лесная арка, на её клубах лежит снег. */
function paintTaigaDoorNorth(g, look, v) {
  paintDoorNorth(g, look, v);
  for (const [x, y, rx, h] of [[14.5, 16.5, 8, 4], [126, 16.5, 8, 4], [46, 9.5, 8.5, 3.6], [94, 9.5, 8.5, 3.6], [69, 5.2, 8, 3.2]]) snowCap(g, x, y, rx, h, look.pal);
}

/** Дверь нижней стены: снег на клубах по краям проёма и на гирлянде. */
function paintTaigaDoorSouth(g, look, v) {
  paintDoorSouth(g, look, v);
  g.save();
  g.translate(6, 5);
  for (const [x, y, rx, h] of [[15, 13.5, 9, 4], [133, 13.5, 9, 4], [36, 50.6, 5, 2.4], [60, 63, 5, 2.4], [84, 63, 5, 2.4], [108, 50.6, 5, 2.4]]) snowCap(g, x, y, rx, h, look.pal);
  g.restore();
}

/** Дверь боковой стены: снег на клубах над и под проёмом и на гирлянде. */
function paintTaigaDoorSide(g, look, v, flip) {
  paintDoorSide(g, look, v, flip);
  const X = (x) => (flip ? 92 - x : x);
  g.save();
  g.translate(0, 3);
  snowCap(g, X(58) - 3, 2.4, 8.5, 3.4, look.pal);
  snowCap(g, X(58) - 5, 118.5, 8, 3.2, look.pal);
  for (const [x, y] of [[40.75, 39], [18.75, 63], [18.75, 87], [40.75, 111]]) snowCap(g, X(x) - 2, y - 6.3, 5, 2.4, look.pal);
  g.restore();
}

const TAIGA = addBiome({
  id: 'taiga',
  pal: TAIGA_PAL,
  tall: [['fir', 5], ['pine', 2.4], ['birch', 1.8], ['crag', 1.6]],
  low: [['drift', 4], ['rock', 3], ['stump', 2.4], ['log', 2.4], ['snowman', 1.2]],
  bush: 'bush',
  ground: taigaGround,
  decals: taigaDecals,
  special: taigaIce,
  water: taigaWater,
  thorns: taigaThorns,
  sprites: {
    fir: { w: 60, h: 102, ox: 30, oy: 96, variants: 3, paint: paintSnowFir, foot: [8, 3.8], crown: 22 },
    pine: { w: 64, h: 100, ox: 32, oy: 94, variants: 2, paint: paintPine, foot: [7, 3.4], crown: 19 },
    birch: { w: 56, h: 96, ox: 28, oy: 90, variants: 2, paint: paintFrostBirch, foot: [6, 3], crown: 11 },
    crag: { w: 46, h: 60, ox: 23, oy: 55, variants: 2, paint: paintSnowCrag, foot: [18, 5.6], crown: 16, sit: 11 },
    drift: { w: 38, h: 28, ox: 19, oy: 24, variants: 3, paint: paintDrift, foot: [15, 4.4] },
    rock: { w: 36, h: 28, ox: 18, oy: 25, variants: 3, paint: paintSnowRock, foot: [14, 4.6] },
    stump: { w: 34, h: 30, ox: 17, oy: 26, variants: 2, paint: paintSnowStump, foot: [13, 4.4], sit: 8 },
    log: { w: 40, h: 26, ox: 20, oy: 22, variants: 2, paint: paintSnowLog, foot: [15, 4.2], sit: 8 },
    snowman: { w: 34, h: 34, ox: 17, oy: 30, variants: 2, paint: paintSnowman, foot: [11, 4], sit: 8 },
    biglog: { w: 72, h: 28, ox: 36, oy: 23, variants: 2, paint: paintSnowBigLog, foot: [31, 4.6], sit: 8 },
    bush: { w: 46, h: 38, ox: 22, oy: 32, variants: 3, paint: paintJuniper, foot: [15, 5], sit: 10 },
    wtrunk: { w: 28, h: 52, ox: 14, oy: 49, variants: 4, paint: paintTaigaWallTrunk },
    wtop: { w: 116, h: 74, ox: 58, oy: 72, variants: 3, paint: paintTaigaWallTop },
    wcap: { w: 80, h: 74, ox: 40, oy: 72, variants: 2, paint: paintTaigaWallCap },
    wside: { w: 76, h: 66, ox: 38, oy: 62, variants: 4, paint: paintTaigaWallSide },
    door: { w: 140, h: 87, ox: 70, oy: 81, variants: 2, paint: paintTaigaDoorNorth },
    'door.s': { w: 160, h: 90, ox: 80, oy: 90, variants: 2, paint: paintTaigaDoorSouth },
    'door.w': { w: 92, h: 156, ox: 48, oy: 156, variants: 2, paint: (g, look, v) => paintTaigaDoorSide(g, look, v, false) },
    'door.e': { w: 92, h: 156, ox: 44, oy: 156, variants: 2, paint: (g, look, v) => paintTaigaDoorSide(g, look, v, true) },
  },
});

// Иней: светлый тон у всей хвои — почти снег; лесные рисунки (клубы у дверей, дальние кроны, глубина бора)
// от этого сами выходят припорошёнными. И свой тон — сосна.
for (const [name, k] of [['near', 0.6], ['mid', 0.55], ['lit', 0.7], ['bush', 0.6], ['fir', 0.6], ['far', 0.5], ['deep', 0.3], ['dusk', 0.2]]) {
  TAIGA.tone[name] = { ...TAIGA.tone[name], light: mix(TAIGA.tone[name].light, TAIGA_PAL.snow, k) };
}
Object.assign(TAIGA.tone, {
  pine: { base: '#3f7a52', light: '#cfe6da', dark: '#24503c', line: dim('#3f7a52', 0.62) },
});
