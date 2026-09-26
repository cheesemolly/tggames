// Звуки Brick Blast — в духе Block Blast (владелец, 2026-09-26: «brick blast — говно, надо сделать как в block blast,
// лазеры звучат ужасно»). Первая версия была на 8-битных «чипах» (квадратная волна) — писклявая, лазер «пью»
// резал уши. Теперь те же мягкие кирпичики, что у Block Blast (shared/sfx.js): «тук», «поп», «плип», шорох, колокольчик —
// и ни одной квадратной волны (тест следит).
//   бросок — «плип» и шорох; удар о блок — тихий деревянный «тук» (высота гуляет; в игре — не чаще раза в 45 мс);
//   блок разбит — «поп», крепкий блок ниже и сочнее; лазер — мягкий «вжух» и глухой «поп»; «×3» — три «плипа» вверх;
//   «разброс» — «буп» вверх; «вернуть шарики» — шорох вниз; ряд сдвинулся — глухой «тук»; блоки у дна — два низких «бупа»;
//   уровень пройден — «плипы» и колокольчики; проигрыш — глухие «тук» вниз.
// createSounds(ctx) принимает готовый AudioContext — в тестах подставляется поддельный.
// play(name, { step }) — step: прочность разбитого блока (break).

import { createSfx, freqOf, pentaStep } from '../../shared/sfx.js';

export const SOUNDS = ['shoot', 'hit', 'break', 'laser', 'triple', 'scatter', 'recall', 'shift', 'danger', 'win', 'lose', 'click'];

export function createSounds(ctx) {
  const { now, plip, bup, tock, bell, swoosh, grain, thud } = createSfx(ctx, { volume: 0.55 });

  const play = {
    shoot: (t) => {
      plip(freqOf(0), t, { peak: 0.12, decay: 0.07 });
      swoosh(t, 700, 2200, 0.16, 0.04);
    },
    // удар о блок: тихий деревянный «тук»
    hit: (t) => tock(260 + Math.random() * 120, t, { peak: 0.09, decay: 0.045 }),
    // разбит: «поп», крепче блок — ниже и сочнее
    break: (t, { step: hp = 10 }) => {
      const tier = Math.max(0, Math.min(4, Math.floor(hp / 40)));
      bup(freqOf(pentaStep(6 - tier) - 5) * (0.95 + Math.random() * 0.1), t, { peak: 0.12 + tier * 0.02, decay: 0.07 + tier * 0.015, drop: 1.6 });
    },
    // лазер: мягкий «вжух» по линии и глухой «поп»
    laser: (t) => {
      swoosh(t, 600, 2400, 0.2, 0.05);
      bup(freqOf(-7), t + 0.05, { peak: 0.1, decay: 0.08, drop: 1.5 });
    },
    triple: (t) => [0, 4, 7].forEach((s, k) => plip(freqOf(s), t + k * 0.08, { peak: 0.12, decay: 0.07 })),
    scatter: (t) => bup(freqOf(-5), t, { peak: 0.14, decay: 0.1, drop: 0.6 }),
    recall: (t) => swoosh(t, 2200, 600, 0.24, 0.06),
    shift: (t) => tock(170, t, { peak: 0.14, decay: 0.09 }),
    danger: (t) => {
      bup(freqOf(-12), t, { peak: 0.16, decay: 0.12, drop: 1.3 });
      bup(freqOf(-12), t + 0.18, { peak: 0.14, decay: 0.12, drop: 1.3 });
    },
    win: (t) => {
      [0, 4, 7].forEach((s, k) => plip(freqOf(s), t + k * 0.08, { peak: 0.12, decay: 0.07 }));
      [0, 4, 7, 12].forEach((s) => bell(freqOf(s), t + 0.3, { peak: 0.09, decay: 1.2 }));
    },
    lose: (t) => {
      for (let k = 0; k < 5; k++) tock(250 - k * 25, t + k * 0.16, { peak: 0.13, decay: 0.09 });
      thud(100, t + 0.85, { peak: 0.18, decay: 0.4, slide: 0.7 });
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
