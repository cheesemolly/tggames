// Звуки «Слогов» — из shared/sfx.js, мягкие, «пузырьковые»:
//   слог выбран — «плип», каждый следующий на ступень пентатоники выше; снят — «плип» вниз;
//   слово собрано — колокольчики вверх (длиннее слово — больше нот), кружки лопаются — круглые «бупы»;
//   так слово не собрать — два мягких «бума»; подсказка — шорох и «блёстка»; звезда — «динь» (каждая выше);
//   тема открылась — два колокольчика; тик последних секунд — «плип»; время вышло — три ноты вниз;
//   уровень пройден — аккорд и фанфара; «клик» — кнопки и окна.
// createSounds(ctx) принимает готовый AudioContext — в тестах подставляется поддельный.
// play(name, { step }) — step: номер слога (pick, pop), число слогов слова (word), номер звезды (star).

import { createSfx, freqOf, pentaStep } from '../../shared/sfx.js';

export const SOUNDS = ['pick', 'unpick', 'word', 'pop', 'none', 'hint', 'star', 'open', 'tick', 'timeup', 'win', 'click'];

export function createSounds(ctx) {
  const { now, tock, grain, bell, plip, bup, swoosh, thud, pad } = createSfx(ctx, { volume: 0.5 });
  const int = (n, lo, hi) => Math.max(lo, Math.min(hi, Math.round(n) || 0));
  const knock = (t, freq, peak = 0.07) => {
    tock(freq, t, { peak, decay: 0.05 });
    grain(t, 0.01, { f0: 1500, q: 0.8, peak: peak * 0.2, attack: 0.002, release: 0.008 });
  };

  const play = {
    pick: (t, { step = 0 }) => plip(freqOf(pentaStep(int(step, 0, 7))), t, { peak: 0.13, decay: 0.11 }),
    unpick: (t, { step = 0 }) => plip(freqOf(pentaStep(int(step, 0, 7)) - 7), t, { up: false, peak: 0.09, decay: 0.09 }),
    word: (t, { step = 2 }) => {
      const notes = int(step, 1, 5) + 2;
      for (let k = 0; k < notes; k++) bell(freqOf(pentaStep(k + 2)), t + k * 0.07, { peak: 0.12, decay: 0.6 });
    },
    pop: (t, { step = 0 }) => bup(freqOf(pentaStep(int(step, 0, 7)) - 12), t, { peak: 0.14, decay: 0.1 }),
    none: (t) => {
      thud(170, t, { peak: 0.14, decay: 0.12, slide: 0.85 });
      thud(150, t + 0.13, { peak: 0.12, decay: 0.14, slide: 0.85 });
    },
    hint: (t) => {
      swoosh(t, 700, 2200, 0.25, 0.04);
      bell(freqOf(16), t + 0.2, { peak: 0.11, decay: 0.6 });
    },
    star: (t, { step = 0 }) => bell(freqOf([7, 12, 16][int(step, 0, 2)]), t, { peak: 0.14, decay: 0.7 }),
    open: (t) => {
      bell(freqOf(12), t, { peak: 0.1, decay: 0.4 });
      bell(freqOf(19), t + 0.1, { peak: 0.11, decay: 0.6 });
    },
    tick: (t, { step = 5 }) => plip(freqOf(int(step, 0, 60) <= 3 ? 7 : 0), t, { peak: 0.07, decay: 0.06 }),
    timeup: (t) => [7, 3, 0].forEach((s, k) => bell(freqOf(s - 12), t + k * 0.18, { peak: 0.13, decay: 0.6 })),
    win: (t) => {
      pad([freqOf(-12), freqOf(-5), freqOf(0), freqOf(4)], t, { peak: 0.05, attack: 0.1, decay: 1.5 });
      [0, 4, 7, 12, 16].forEach((s, k) => bell(freqOf(s), t + k * 0.09, { peak: 0.12, decay: 0.8 }));
    },
    click: (t) => knock(t, 320, 0.06),
  };

  return {
    has: (name) => name in play,
    play(name, opts = {}) {
      const fn = play[name];
      if (fn) fn(now(), opts ?? {});
    },
  };
}
