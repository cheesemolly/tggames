// Звуки Арканоида — мягкие кирпичики из shared/sfx.js («тук», «поп», «плип», шорох, колокольчик), без квадратной
// волны и резких высоких (тест следит). Частые звуки (удары, разбитые кирпичи, выстрелы) игра прореживает сама.
//   запуск — «плип» и шорох; платформа — глухой «тук»; стена — совсем тихий «тук»; удар по кирпичу — деревянный «тук»,
//   по неразрушаемому — ниже; кирпич разбит — «поп» (высота гуляет по оттенку); взрыв — глухой удар и шорох;
//   бонус пойман: хороший — «плипы» вверх, вредный — «буп» вниз, запасной шарик — колокольчик; бонус выпал — «плип»;
//   лазер — короткий шорох, ракета — шорох длиннее; шарик освобождён — колокольчик, пойман — «плип»;
//   шарик упущен — «буп» вниз; платформа взорвана — удар; уровень пройден — «плипы» и колокольчики; проигрыш — «тук» вниз.
// createSounds(ctx) принимает готовый AudioContext — в тестах подставляется поддельный.
// play(name, { step }) — step: оттенок разбитого кирпича (break).

import { createSfx, freqOf, pentaStep } from '../../shared/sfx.js';

export const SOUNDS = ['launch', 'paddle', 'wall', 'hit', 'metal', 'break', 'explode', 'drop', 'good', 'bad', 'life',
  'laser', 'missile', 'free', 'gain', 'lost', 'die', 'win', 'lose', 'click'];

export function createSounds(ctx) {
  const { now, plip, bup, tock, bell, swoosh, grain, thud } = createSfx(ctx, { volume: 0.55 });

  const play = {
    launch: (t) => {
      plip(freqOf(0), t, { peak: 0.12, decay: 0.07 });
      swoosh(t, 700, 1800, 0.14, 0.035);
    },
    paddle: (t) => tock(190 + Math.random() * 20, t, { peak: 0.13, decay: 0.06 }),
    wall: (t) => tock(240, t, { peak: 0.04, decay: 0.03 }),
    hit: (t) => tock(280 + Math.random() * 100, t, { peak: 0.09, decay: 0.045 }),
    metal: (t) => tock(150 + Math.random() * 30, t, { peak: 0.1, decay: 0.07 }),
    break: (t, { step = 0 }) => bup(freqOf(pentaStep(3 + (step % 4)) - 5) * (0.96 + Math.random() * 0.08), t, { peak: 0.12, decay: 0.07, drop: 1.6 }),
    explode: (t) => {
      thud(95, t, { peak: 0.2, decay: 0.22, slide: 0.6 });
      swoosh(t, 1600, 400, 0.22, 0.05);
    },
    drop: (t) => plip(freqOf(7), t, { peak: 0.07, decay: 0.06 }),
    good: (t) => [0, 4, 7].forEach((s, k) => plip(freqOf(s), t + k * 0.07, { peak: 0.12, decay: 0.07 })),
    bad: (t) => bup(freqOf(-9), t, { peak: 0.15, decay: 0.14, drop: 1.5 }),
    life: (t) => [0, 7, 12].forEach((s, k) => bell(freqOf(s), t + k * 0.09, { peak: 0.09, decay: 0.7 })),
    laser: (t) => swoosh(t, 1500, 700, 0.07, 0.03),
    missile: (t) => swoosh(t, 500, 1700, 0.26, 0.05),
    free: (t) => bell(freqOf(12), t, { peak: 0.08, decay: 0.5 }),
    gain: (t) => plip(freqOf(4), t, { peak: 0.12, decay: 0.08 }),
    lost: (t) => bup(freqOf(-12), t, { peak: 0.14, decay: 0.16, drop: 1.4 }),
    die: (t) => {
      thud(110, t, { peak: 0.2, decay: 0.3, slide: 0.65 });
      bup(freqOf(-14), t + 0.12, { peak: 0.12, decay: 0.2, drop: 1.4 });
    },
    win: (t) => {
      [0, 4, 7].forEach((s, k) => plip(freqOf(s), t + k * 0.08, { peak: 0.12, decay: 0.07 }));
      [0, 4, 7, 12].forEach((s) => bell(freqOf(s), t + 0.3, { peak: 0.09, decay: 1.2 }));
    },
    lose: (t) => {
      for (let k = 0; k < 4; k++) tock(240 - k * 25, t + k * 0.16, { peak: 0.13, decay: 0.09 });
      thud(100, t + 0.7, { peak: 0.18, decay: 0.4, slide: 0.7 });
    },
    click: (t) => {
      tock(300, t, { peak: 0.06, decay: 0.03 });
      grain(t, 0.012, { f0: 2400, q: 0.9, peak: 0.02, attack: 0.002, release: 0.01 });
    },
  };

  return {
    has: (name) => name in play,
    play(name, opts = {}) {
      const fn = play[name];
      if (fn) fn(now(), opts);
    },
  };
}
