// Звуки «Три в ряд» — из общих кирпичиков shared/sfx.js, мягкие и «сочные».
//   выбор фишки — тихий «плип»; обмен — шорох; неудачный обмен — два глухих «бупа»;
//   фишки лопаются — «поп», с каждым звеном каскада выше по пентатонике; новая спецфишка — перелив;
//   ракета — «вжух»; бомба — «бум» и треск; пропеллер — жужжание вверх; призма — искристое арпеджио;
//   комбо — всё вместе и ниже; лёд — хрусткий щелчок; ящик — деревянный «тук»; сейф — металлический «дзинь»;
//   цепь — звяк; слизь — «чавк»; сундук — монетки; таймер — «тик»; слизь выросла — «бульк»;
//   приземление — тихий «тук»; перемешивание — шорох; финал — звон по ракете на ход;
//   победа — фанфара, звёзды — «динь» по очереди; поражение — ноты вниз.
// createSounds(ctx) принимает готовый AudioContext — в тестах подставляется поддельный.

import { createSfx, freqOf, pentaStep } from '../../shared/sfx.js';

export const SOUNDS = [
  'select', 'swap', 'bad', 'pop', 'create', 'rocket', 'bomb', 'propeller', 'prism', 'combo', 'ice', 'crate', 'steel',
  'chain', 'slime', 'grow', 'treasure', 'tick', 'land', 'shuffle', 'bonus', 'win', 'star', 'lose', 'click', 'booster', 'unlock',
];

export function createSounds(ctx) {
  const { now, plip, bup, tock, chip, bell, swoosh, grain, thud, pad } = createSfx(ctx, { volume: 0.5 });

  const play = {
    select: (t) => plip(freqOf(7), t, { peak: 0.12, decay: 0.06 }),
    swap: (t) => swoosh(t, 1400, 3200, 0.12, 0.05),
    bad: (t) => {
      bup(freqOf(-12), t, { peak: 0.14, decay: 0.08, drop: 1.3 });
      bup(freqOf(-14), t + 0.1, { peak: 0.12, decay: 0.08, drop: 1.3 });
    },
    pop: (t, { step = 1 }) => {
      const base = pentaStep(Math.min(10, step - 1));
      bup(freqOf(base), t, { peak: 0.2, decay: 0.09, drop: 1.5 });
      bup(freqOf(base + 7), t + 0.03, { peak: 0.1, decay: 0.07, drop: 1.4 });
      grain(t, 0.03, { f0: 3500, q: 1, peak: 0.04, attack: 0.002, release: 0.02 });
    },
    create: (t) => [0, 4, 7, 12].forEach((s, k) => bell(freqOf(s), t + k * 0.05, { peak: 0.09, decay: 0.35 })),
    rocket: (t) => {
      swoosh(t, 600, 6000, 0.3, 0.09);
      bup(freqOf(-5), t + 0.02, { peak: 0.14, decay: 0.12, drop: 2 });
    },
    bomb: (t) => {
      thud(95, t, { peak: 0.34, decay: 0.45, slide: 0.55 });
      grain(t, 0.25, { f0: 1800, f1: 400, q: 0.5, peak: 0.14, attack: 0.002, release: 0.2 });
    },
    propeller: (t) => {
      for (let k = 0; k < 6; k++) grain(t + k * 0.04, 0.035, { f0: 900 + k * 250, q: 3, peak: 0.05, attack: 0.004, release: 0.02 });
      swoosh(t, 800, 3000, 0.35, 0.05);
    },
    prism: (t) => [0, 4, 7, 12, 16, 19, 24].forEach((s, k) => chip(freqOf(s + 12), t + k * 0.035, { dur: 0.06, type: 'triangle', peak: 0.05 })),
    combo: (t) => {
      thud(70, t, { peak: 0.38, decay: 0.6, slide: 0.5 });
      swoosh(t, 400, 7000, 0.45, 0.1);
      [0, 7, 12, 16].forEach((s) => bell(freqOf(s - 12), t + 0.08, { peak: 0.08, decay: 1 }));
    },
    ice: (t) => {
      grain(t, 0.05, { f0: 6000, q: 2, peak: 0.07, attack: 0.001, release: 0.04 });
      chip(freqOf(19), t, { dur: 0.04, type: 'triangle', peak: 0.03 });
    },
    crate: (t) => {
      tock(230, t, { peak: 0.2, decay: 0.08 });
      grain(t + 0.01, 0.06, { f0: 1500, q: 0.7, peak: 0.06, attack: 0.002, release: 0.05 });
    },
    steel: (t) => {
      bell(1320, t, { peak: 0.1, decay: 0.35 });
      bell(1870, t, { peak: 0.06, decay: 0.3 });
    },
    chain: (t) => [0, 0.05].forEach((d, k) => chip(2200 + k * 400, t + d, { dur: 0.03, type: 'square', peak: 0.03, cutoff: 6000 })),
    slime: (t) => bup(freqOf(-9), t, { peak: 0.2, decay: 0.16, drop: 2.2 }),
    grow: (t) => {
      bup(freqOf(-16), t, { peak: 0.14, decay: 0.2, drop: 0.6 });
      bup(freqOf(-12), t + 0.08, { peak: 0.1, decay: 0.15, drop: 0.7 });
    },
    treasure: (t) => [0, 4, 7, 12, 16].forEach((s, k) => bell(freqOf(s + 7), t + k * 0.06, { peak: 0.1, decay: 0.5 })),
    tick: (t) => chip(1800, t, { dur: 0.03, type: 'square', peak: 0.04, cutoff: 5000 }),
    land: (t, { step = 1 }) => tock(260 - step * 8, t, { peak: 0.06, decay: 0.05 }),
    shuffle: (t) => {
      swoosh(t, 700, 4000, 0.4, 0.07);
      swoosh(t + 0.2, 4000, 900, 0.35, 0.06);
    },
    bonus: (t, { step = 0 }) => chip(freqOf(pentaStep(Math.max(0, 12 - Math.min(12, step)))), t, { dur: 0.07, type: 'triangle', peak: 0.06 }),
    win: (t) => {
      [0, 4, 7, 12].forEach((s, k) => chip(freqOf(s), t + k * 0.09, { dur: 0.1, type: 'triangle', peak: 0.08 }));
      [0, 4, 7, 12, 16].forEach((s) => bell(freqOf(s), t + 0.42, { peak: 0.09, decay: 1.6 }));
    },
    star: (t, { step = 0 }) => bell(freqOf(12 + step * 4), t, { peak: 0.14, decay: 0.8 }),
    lose: (t) => {
      [7, 4, 0, -5].forEach((s, k) => bell(freqOf(s), t + k * 0.16, { peak: 0.08, decay: 0.5 }));
      pad([freqOf(-24), freqOf(-17)], t + 0.5, { peak: 0.04, attack: 0.2, decay: 1.2 });
    },
    click: (t) => plip(freqOf(12), t, { peak: 0.08, decay: 0.04 }),
    booster: (t) => {
      swoosh(t, 2000, 600, 0.15, 0.06);
      thud(160, t + 0.08, { peak: 0.2, decay: 0.2 });
    },
    unlock: (t) => [0, 7, 12].forEach((s, k) => bell(freqOf(s + 5), t + k * 0.08, { peak: 0.1, decay: 0.6 })),
  };

  return {
    has: (name) => name in play,
    play(name, opts = {}) {
      const fn = play[name];
      if (!fn) return;
      fn(now(), opts);
    },
  };
}
