// Звуки «Логических схем» — из shared/sfx.js, мягкие и глуховатые, «щёлкающие», как детали в пальцах:
//   pick — взял деталь из лотка; place — вентиль встал в гнездо; bead — «НЕ» наделось на провод; remove — деталь снята;
//   deny — так нельзя; power — щёлкнул выключатель; gate — вентиль сработал: пропустил ток — «плип» (чем дальше по
//   схеме, тем выше), не пропустил — глухой «тк»; lamp — лампа загорелась (каждая следующая выше); wrong — загорелась
//   та, что не должна; trip — ток выбило; pass — проверка пройдена; star — звезда; win — уровень пройден;
//   hint — подсказка; click — кнопки и окна.
// createSounds(ctx) принимает готовый AudioContext — в тестах подставляется поддельный.
// play(name, { step, on }) — step: какой по счёту вентиль, лампа или звезда; on: пропустил ли вентиль ток.

import { createSfx, freqOf, pentaStep } from '../../shared/sfx.js';

export const SOUNDS = ['pick', 'place', 'bead', 'remove', 'deny', 'power', 'gate', 'lamp', 'wrong', 'trip', 'pass', 'star', 'win', 'hint', 'click'];

export function createSounds(ctx) {
  const { now, tock, grain, bell, plip, bup, swoosh, thud, pad } = createSfx(ctx, { volume: 0.5 });
  const int = (n, lo, hi) => Math.max(lo, Math.min(hi, Math.round(n) || 0));
  const knock = (t, freq, peak = 0.07) => {
    tock(freq, t, { peak, decay: 0.05 });
    grain(t, 0.01, { f0: 1400, q: 0.8, peak: peak * 0.2, attack: 0.002, release: 0.008 });
  };

  const play = {
    pick: (t) => tock(440, t, { peak: 0.04, decay: 0.04 }),
    place: (t) => {
      knock(t, 250, 0.11);
      tock(380, t + 0.035, { peak: 0.05, decay: 0.05 });
    },
    bead: (t) => {
      knock(t, 520, 0.07);
      plip(freqOf(7), t + 0.02, { peak: 0.05, decay: 0.07 });
    },
    remove: (t) => {
      tock(300, t, { peak: 0.07, decay: 0.05 });
      tock(210, t + 0.05, { peak: 0.05, decay: 0.06 });
    },
    deny: (t) => thud(150, t, { peak: 0.12, decay: 0.12, slide: 0.85 }),
    power: (t) => {
      knock(t, 170, 0.14);
      tock(120, t + 0.04, { peak: 0.1, decay: 0.12 });
      swoosh(t + 0.05, 300, 900, 0.3, 0.025);
    },
    gate: (t, { step = 0, on = true }) => {
      if (on) plip(freqOf(pentaStep(int(step, 0, 9) + 2), 261.63), t, { peak: 0.1, decay: 0.1 });
      else tock(150, t, { peak: 0.06, decay: 0.07 });
    },
    lamp: (t, { step = 0 }) => {
      const base = [0, 4, 7][int(step, 0, 2)];
      bell(freqOf(base), t, { peak: 0.12, decay: 0.9 });
      bell(freqOf(base + 7), t + 0.05, { peak: 0.07, decay: 0.9 });
      pad([freqOf(base - 12), freqOf(base - 5)], t, { peak: 0.04, attack: 0.08, decay: 1.1 });
    },
    wrong: (t) => {
      bup(190, t, { peak: 0.13, decay: 0.16, drop: 1.5 });
      thud(120, t + 0.1, { peak: 0.1, decay: 0.16, slide: 0.8 });
    },
    trip: (t) => {
      knock(t, 150, 0.14);
      thud(130, t + 0.06, { peak: 0.12, decay: 0.2, slide: 0.7 });
    },
    pass: (t, { step = 0 }) => bell(freqOf([7, 9, 12, 14][int(step, 0, 3)]), t, { peak: 0.09, decay: 0.5 }),
    star: (t, { step = 0 }) => bell(freqOf([7, 12, 16][int(step, 0, 2)]), t, { peak: 0.13, decay: 0.7 }),
    win: (t) => {
      pad([freqOf(-12), freqOf(-5), freqOf(0), freqOf(4)], t, { peak: 0.05, attack: 0.1, decay: 1.5 });
      [0, 4, 7, 12].forEach((s, k) => bell(freqOf(s), t + k * 0.09, { peak: 0.1, decay: 0.8 }));
    },
    hint: (t) => {
      swoosh(t, 700, 2000, 0.22, 0.035);
      bell(freqOf(12), t + 0.18, { peak: 0.1, decay: 0.6 });
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
