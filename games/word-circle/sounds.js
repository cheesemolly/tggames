// Звуки «Круга слов» — из shared/sfx.js, мягкие:
//   буква в круге — «плип», каждая следующая на ступень пентатоники выше (слово звучит мелодией), шаг назад — ниже;
//   слово встало в кроссворд — колокольчики вверх (длиннее слово — больше нот), буква легла в клетку — тихий «ток»;
//   слово уже есть — два одинаковых тона; бонусное — россыпь и «монетка»; такого слова нет — два мягких «бума»;
//   подсказка — шорох вверх и «блёстка»; не хватает монет — глухой удар; перемешивание — шелест;
//   монета — «дзинь»; уровень пройден — аккорд и фанфара; «клик» — кнопки и окна.
// createSounds(ctx) принимает готовый AudioContext — в тестах подставляется поддельный.
// play(name, { step }) — step: номер буквы в слове (letter, drop) или длина слова (found).

import { createSfx, freqOf, pentaStep } from '../../shared/sfx.js';

export const SOUNDS = ['letter', 'back', 'drop', 'found', 'again', 'bonus', 'none', 'hint', 'poor', 'shuffle', 'coin', 'win', 'click', 'pick'];

export function createSounds(ctx) {
  const { now, tock, grain, bell, plip, swoosh, thud, rustle, pad } = createSfx(ctx, { volume: 0.5 });
  const int = (n, lo, hi) => Math.max(lo, Math.min(hi, Math.round(n) || 0));
  const knock = (t, freq, peak = 0.08) => {
    tock(freq, t, { peak, decay: 0.05 });
    grain(t, 0.01, { f0: 1500, q: 0.8, peak: peak * 0.2, attack: 0.002, release: 0.008 });
  };

  const play = {
    letter: (t, { step = 0 }) => plip(freqOf(pentaStep(int(step, 0, 8))), t, { peak: 0.12, decay: 0.1 }),
    back: (t, { step = 0 }) => plip(freqOf(pentaStep(int(step, 0, 8)) - 5), t, { up: false, peak: 0.09, decay: 0.09 }),
    drop: (t, { step = 0 }) => knock(t, 240 + int(step, 0, 8) * 16),
    found: (t, { step = 3 }) => {
      const notes = int(step, 3, 7);
      for (let k = 0; k < notes; k++) bell(freqOf(pentaStep(k + 2)), t + k * 0.07, { peak: 0.12, decay: 0.6 });
    },
    again: (t) => {
      bell(freqOf(-5), t, { peak: 0.09, decay: 0.3 });
      bell(freqOf(-5), t + 0.14, { peak: 0.08, decay: 0.35 });
    },
    bonus: (t) => {
      [4, 6, 8, 9].forEach((s, k) => bell(freqOf(pentaStep(s)), t + k * 0.05, { peak: 0.08, decay: 0.4 }));
      bell(freqOf(19), t + 0.26, { peak: 0.1, decay: 0.5 });
    },
    none: (t) => {
      thud(170, t, { peak: 0.14, decay: 0.12, slide: 0.85 });
      thud(150, t + 0.13, { peak: 0.12, decay: 0.14, slide: 0.85 });
    },
    hint: (t) => {
      swoosh(t, 700, 2200, 0.25, 0.04);
      bell(freqOf(16), t + 0.2, { peak: 0.11, decay: 0.6 });
    },
    poor: (t) => thud(120, t, { peak: 0.16, decay: 0.16, slide: 0.8 }),
    shuffle: (t) => rustle(t, 0.3, { peak: 0.06, from: 1800, to: 3600 }),
    coin: (t) => {
      bell(freqOf(12), t, { peak: 0.1, decay: 0.25 });
      bell(freqOf(19), t + 0.07, { peak: 0.11, decay: 0.5 });
    },
    win: (t) => {
      pad([freqOf(-12), freqOf(-5), freqOf(0), freqOf(4)], t, { peak: 0.05, attack: 0.1, decay: 1.5 });
      [0, 4, 7, 12, 16, 19].forEach((s, k) => bell(freqOf(s), t + k * 0.09, { peak: 0.12, decay: 0.8 }));
    },
    click: (t) => knock(t, 320, 0.06),
    pick: (t) => knock(t, 360, 0.07),
  };

  return {
    has: (name) => name in play,
    play(name, opts = {}) {
      const fn = play[name];
      if (fn) fn(now(), opts ?? {});
    },
  };
}
