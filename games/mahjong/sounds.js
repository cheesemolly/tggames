// Звуки маджонга — «дзен» (просьба владельца, 2026-09-26: «тоже дзен», как судоку и «Петля»): без звона.
//   выбрал плитку — мягкий костяной «тк» (глухой тон + короткое касание), снял выбор — тише и ниже;
//   закрытая плитка — глухой низкий «ток»; пара снята — плитки касаются «тк-тк», шорох воздуха, пока летят,
//   и тихий тёплый тон, когда рассыпаются (серия — тон выше по пентатонике, с 3-й — мягкое двузвучие);
//   подсказка — лёгкий ветер; перемешать — шорох и россыпь тихих касаний (плитки перебирают);
//   раздача — плитки ложатся слой за слоем; ходов нет — тихий низкий аккорд; победа — долгий тёплый аккорд и ветер.
// Из «дзен»-кирпичиков shared/sfx.js. createSounds(ctx) принимает готовый AudioContext — в тестах поддельный.
// play(name, { step }) — step: номер серии (match), число слоёв (deal).

import { createSfx, freqOf, pentaStep } from '../../shared/sfx.js';

export const SOUNDS = ['select', 'deselect', 'blocked', 'match', 'undo', 'hint', 'shuffle', 'deal', 'stuck', 'win', 'click'];

const chord = (...semitones) => semitones.map((s) => freqOf(s - 12));

export function createSounds(ctx) {
  const { now, grain, rustle, tock, pad } = createSfx(ctx, { volume: 0.6 });

  /** Касание плитки: глухой короткий тон и сухой щелчок кости — мягко, без звона. */
  const tap = (t, { freq = 380, peak = 0.12 } = {}) => {
    tock(freq, t, { peak, decay: 0.05 });
    grain(t, 0.012, { f0: 2600, q: 0.9, peak: peak * 0.35, attack: 0.002, release: 0.012 });
  };

  const play = {
    select: (t) => tap(t),
    deselect: (t) => tap(t, { freq: 300, peak: 0.07 }),
    blocked: (t) => tock(150, t, { peak: 0.13, decay: 0.1 }),
    // пара: касаются, летят (шорох), рассыпаются — тёплый тон (к моменту искр — 0,33 с)
    match: (t, { step: streak = 1 }) => {
      tap(t, { freq: 400, peak: 0.1 });
      tap(t + 0.06, { freq: 360, peak: 0.1 });
      grain(t + 0.08, 0.3, { f0: 700, f1: 1500, q: 0.6, peak: 0.03, attack: 0.12, release: 0.12 });
      const s = pentaStep(Math.max(0, Math.min(8, streak - 1)));
      pad(streak >= 3 ? chord(s, s + 7) : chord(s), t + 0.33, { peak: 0.035, attack: 0.05, decay: 1.3, cutoff: 1300 });
    },
    // отмена: воздух обратно и плитки ложатся на место
    undo: (t) => {
      grain(t, 0.22, { f0: 1500, f1: 700, q: 0.6, peak: 0.03, attack: 0.08, release: 0.1 });
      tap(t + 0.22, { freq: 340, peak: 0.08 });
    },
    hint: (t) => rustle(t, 0.6, { peak: 0.035, from: 600, to: 1800 }),
    // перемешать: плитки собираются (шорох) и перебираются — россыпь тихих касаний
    shuffle: (t) => {
      rustle(t, 0.3, { peak: 0.04, from: 1800, to: 700 });
      for (let k = 0; k < 10; k++) tap(t + 0.22 + Math.random() * 0.35, { freq: 300 + Math.random() * 160, peak: 0.035 + Math.random() * 0.03 });
    },
    // раздача: плитки ложатся слой за слоем (слой — 0,18 с, как в анимации)
    deal: (t, { step: layers = 3 }) => {
      const n = Math.max(1, Math.min(6, layers));
      for (let z = 0; z < n; z++) {
        for (let k = 0; k < 4; k++) tap(t + 0.25 + z * 0.18 + k * 0.04 + Math.random() * 0.03, { freq: 320 + z * 20, peak: 0.04 });
      }
    },
    stuck: (t) => pad(chord(-3, 0, 4), t, { peak: 0.035, attack: 0.3, decay: 2, cutoff: 900 }),
    win: (t) => {
      pad(chord(0, 7, 14, 16), t, { peak: 0.045, attack: 0.8, decay: 3.5, cutoff: 1500 });
      rustle(t + 0.2, 1.4, { peak: 0.035, from: 400, to: 1400 });
    },
    click: (t) => grain(t, 0.03, { f0: 1800, q: 0.7, peak: 0.035, attack: 0.004, release: 0.02 }),
  };

  return {
    has: (name) => name in play,
    play(name, opts = {}) {
      const fn = play[name];
      if (fn) fn(now(), opts);
    },
  };
}
