// Звуки Block Blast — аркадные (просьба владельца, 2026-09-26), из shared/sfx.js.
//   взял фигуру — «плип» вверх; отпустил мимо — шорох назад в лоток; поставил — сочный «тук» блоков
//   (крупная фигура — ниже); новая тройка — три «плипа» по очереди.
//   Сгорание — по тем же уровням, что и эффекты (1 — луч, 2 — комбо, 3 — радуга, 4 — молнии):
//   1 — «вжух» по линии и россыпь «попов»; 2 — плюс двузвучие (выше с номером комбо); 3 — плюс радужное
//   арпеджио; 4 — плюс треск молний и большой аккорд. Чистое поле — фанфара.
//   Конец игры — блоки гаснут глухими «тук» вниз.
// createSounds(ctx) принимает готовый AudioContext — в тестах подставляется поддельный.
// play(name, { step, level, lines }) — step: клеток в фигуре (place) / номер комбо (clear).

import { createSfx, freqOf, pentaStep } from '../../shared/sfx.js';

export const SOUNDS = ['pick', 'back', 'place', 'deal', 'clear', 'allclear', 'over', 'click'];

export function createSounds(ctx) {
  const { now, plip, bup, tock, chip, bell, swoosh, grain, thud } = createSfx(ctx, { volume: 0.55 });

  const play = {
    pick: (t) => plip(freqOf(0), t, { peak: 0.14, decay: 0.07 }),
    back: (t) => swoosh(t, 2200, 700, 0.16, 0.05),
    // поставил: «тук» блоков (крупная фигура — ниже) и сухой щелчок
    place: (t, { step: cells = 3 }) => {
      const f = 330 - Math.min(9, cells) * 18;
      tock(f, t, { peak: 0.2, decay: 0.07 });
      grain(t, 0.015, { f0: 2400, q: 0.9, peak: 0.05, attack: 0.002, release: 0.012 });
    },
    deal: (t) => [0, 4, 7].forEach((s, k) => plip(freqOf(s), t + k * 0.08, { peak: 0.1, decay: 0.06 })),
    // сгорание линий по уровню эффекта
    clear: (t, { step: combo = 1, level = 1, lines = 1 }) => {
      swoosh(t, 700, 4200, 0.25, 0.06);
      const pops = Math.min(8, 3 + lines * 2);
      for (let k = 0; k < pops; k++) bup(freqOf(pentaStep(k % 8) - 5), t + 0.04 + k * 0.035, { peak: 0.1, decay: 0.07, drop: 1.6 });
      const c = pentaStep(Math.max(0, Math.min(8, combo - 1)));
      if (level >= 2) {
        bell(freqOf(c), t + 0.12, { peak: 0.14, decay: 0.5 });
        bell(freqOf(c + 7), t + 0.18, { peak: 0.12, decay: 0.6 });
      }
      if (level >= 3) [0, 2, 4, 7, 9, 12].forEach((s, k) => chip(freqOf(s + 12), t + 0.2 + k * 0.045, { dur: 0.05, type: 'triangle', peak: 0.05 }));
      if (level >= 4) {
        for (let k = 0; k < 3; k++) grain(t + 0.1 + k * 0.09, 0.08, { f0: 5000, f1: 1500, q: 0.5, peak: 0.07, attack: 0.001, release: 0.06 });
        [0, 4, 7, 12].forEach((s) => bell(freqOf(s + 12), t + 0.45, { peak: 0.09, decay: 1.2 }));
      }
    },
    // чистое поле — фанфара
    allclear: (t) => {
      [0, 4, 7, 12, 16].forEach((s, k) => chip(freqOf(s + 7), t + k * 0.07, { dur: 0.08, peak: 0.06 }));
      [0, 4, 7, 12].forEach((s) => bell(freqOf(s + 19), t + 0.4, { peak: 0.1, decay: 1.4 }));
    },
    // конец: блоки гаснут — глухие «тук» вниз
    over: (t) => {
      for (let k = 0; k < 6; k++) tock(260 - k * 25, t + k * 0.18, { peak: 0.14, decay: 0.09 });
      thud(100, t + 1.1, { peak: 0.2, decay: 0.4, slide: 0.7 });
    },
    click: (t) => plip(freqOf(12), t, { peak: 0.1, decay: 0.04 }),
  };

  return {
    has: (name) => name in play,
    play(name, opts = {}) {
      const fn = play[name];
      if (fn) fn(now(), opts);
    },
  };
}
