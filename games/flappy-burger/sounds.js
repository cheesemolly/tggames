// Звуки Flappy Burger — всё аркадное, 8-битное (просьба владельца, 2026-09-26), из shared/sfx.js (`chip`).
//   старт — «пиу-пиу-ПИУ»; взмах — короткий «фьюп» вверх (высота чуть гуляет, чтобы частые взмахи не звенели
//   одинаково); препятствие пройдено — монетка, каждое десятое — перелив вверх; переход на улицу — ночной
//   мотив (минор), обратно на кухню — бодрый (мажор); удар — треск и писк вниз; падение — «бум» и «ва-ваа»;
//   новый рекорд — короткая фанфара.
// createSounds(ctx) принимает готовый AudioContext — в тестах подставляется поддельный.
// play(name, { step }) — step: счёт (score: каждое десятое — перелив).

import { createSfx, freqOf } from '../../shared/sfx.js';

export const SOUNDS = ['start', 'flap', 'score', 'street', 'kitchen', 'hit', 'over', 'best', 'click'];

export function createSounds(ctx) {
  const { now, chip, grain, thud } = createSfx(ctx, { volume: 0.55 });

  const play = {
    start: (t) => {
      chip(freqOf(0), t, { dur: 0.07, peak: 0.06 });
      chip(freqOf(7), t + 0.1, { dur: 0.07, peak: 0.06 });
      chip(freqOf(12), t + 0.2, { dur: 0.16, slideTo: freqOf(19), peak: 0.07 });
    },
    // взмах: треугольная волна (мягче квадрата — взмахов много), быстро вверх
    flap: (t) => {
      const base = freqOf(-5) * (0.95 + Math.random() * 0.1);
      chip(base, t, { dur: 0.07, slideTo: base * 1.9, type: 'triangle', peak: 0.09 });
    },
    // очко: монетка; каждое десятое — перелив вверх
    score: (t, { step: n = 1 }) => {
      if (n > 0 && n % 10 === 0) {
        [12, 16, 19, 24].forEach((s, k) => chip(freqOf(s), t + k * 0.06, { dur: 0.07, peak: 0.055 }));
        return;
      }
      chip(freqOf(19), t, { dur: 0.05, peak: 0.045 });
      chip(freqOf(24), t + 0.05, { dur: 0.1, peak: 0.045 });
    },
    // на улицу — ночной минорный мотив
    street: (t) => [0, 3, 7, 10].forEach((s, k) => chip(freqOf(s - 5), t + k * 0.09, { dur: 0.08, type: 'triangle', peak: 0.08 })),
    // обратно на кухню — бодрый мажор
    kitchen: (t) => [0, 4, 7, 12].forEach((s, k) => chip(freqOf(s), t + k * 0.08, { dur: 0.07, peak: 0.055 })),
    // удар: треск и писк вниз
    hit: (t) => {
      grain(t, 0.14, { f0: 1800, f1: 400, q: 0.6, peak: 0.14, attack: 0.002, release: 0.1 });
      chip(freqOf(12), t, { dur: 0.25, slideTo: freqOf(-12), peak: 0.08 });
    },
    // упал на пол: «бум» и «ва-ваа»
    over: (t) => {
      thud(120, t, { peak: 0.26, decay: 0.22, slide: 0.6 });
      chip(freqOf(3), t + 0.25, { dur: 0.18, slideTo: freqOf(2), peak: 0.06 });
      chip(freqOf(0), t + 0.45, { dur: 0.4, slideTo: freqOf(-7), peak: 0.06 });
    },
    // новый рекорд — фанфара
    best: (t) => {
      [0, 4, 7, 12, 7, 12].forEach((s, k) => chip(freqOf(s + 7), t + k * 0.08, { dur: 0.07, peak: 0.06 }));
      chip(freqOf(23), t + 0.5, { dur: 0.3, peak: 0.07 });
      chip(freqOf(11), t + 0.5, { dur: 0.3, type: 'triangle', peak: 0.07 });
    },
    click: (t) => chip(freqOf(12), t, { dur: 0.03, peak: 0.04 }),
  };

  return {
    has: (name) => name in play,
    play(name, opts = {}) {
      const fn = play[name];
      if (fn) fn(now(), opts);
    },
  };
}
