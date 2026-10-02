// Звуки нонограммы — тихие, «бумажные» (из shared/sfx.js), без звона:
//   закрасить клетку — мягкий «тк» маркера, при протяжке каждая следующая клетка на ступень пентатоники выше (по
//   кругу в пределах октавы — длинная линия не уходит в писк); крестик — сухой штрих карандаша; стереть — ластик;
//   ошибка — глухой «тук»; линия решена — тихий «плип» (две линии — двузвучие); автокрестики — шорох; подсказка —
//   шелест и два «плипа»; картинка готова — тёплый аккорд и колокольчики снизу вверх; открыть уровень — шелест.
// createSounds(ctx) принимает готовый AudioContext — в тестах подставляется поддельный.

import { createSfx, freqOf, pentaStep } from '../../shared/sfx.js';

export const SOUNDS = ['fill', 'cross', 'erase', 'mistake', 'line', 'auto', 'hint', 'win', 'open', 'undo', 'click', 'tool'];

export function createSounds(ctx) {
  const { now, tock, grain, pencil, rub, plip, thud, pad, bell, rustle, swoosh } = createSfx(ctx, { volume: 0.55 });
  const wobble = (k = 0.06) => 1 + (Math.random() - 0.5) * k;

  const play = {
    fill: (t, { step = 0 }) => {
      const s = pentaStep(step % 6);
      tock(freqOf(s - 12) * wobble(), t, { peak: 0.11, decay: 0.05 });
      grain(t, 0.016, { f0: 2400 * wobble(0.2), q: 1, peak: 0.02, attack: 0.002, release: 0.015 });
    },
    cross: (t) => pencil(t, [0.022, 0.022], { peak: 0.045, gap: 0.012, tone: 3200 }),
    erase: (t) => rub(t, 2, { peak: 0.05, len: 0.05 }),
    mistake: (t) => thud(150, t, { peak: 0.14, decay: 0.14 }),
    line: (t, { count = 1 }) => {
      plip(freqOf(7), t, { peak: 0.06, decay: 0.09 });
      if (count > 1) plip(freqOf(12), t + 0.06, { peak: 0.05, decay: 0.09 });
    },
    auto: (t) => rustle(t, 0.18, { peak: 0.03, from: 2200, to: 3600 }),
    hint: (t) => {
      swoosh(t, 1200, 3000, 0.25, 0.035);
      [0, 7].forEach((s, k) => plip(freqOf(s + 7), t + 0.08 + k * 0.08, { peak: 0.055, decay: 0.08 }));
    },
    win: (t) => {
      pad([freqOf(-12), freqOf(-8), freqOf(-5), freqOf(2)], t, { peak: 0.045, attack: 0.25, decay: 2 });
      [0, 4, 7, 11, 14].forEach((s, k) => bell(freqOf(s), t + 0.1 + k * 0.11, { peak: 0.06, decay: 1 }));
    },
    open: (t) => rustle(t, 0.3, { peak: 0.045, from: 1500, to: 3000 }),
    undo: (t) => swoosh(t, 2600, 900, 0.16, 0.04),
    click: (t) => plip(freqOf(12), t, { peak: 0.06, decay: 0.04 }),
    tool: (t) => tock(880, t, { peak: 0.07, decay: 0.035 }),
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
