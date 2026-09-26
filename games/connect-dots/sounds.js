// Звуки «Соедини точки» — игривые «плинь, плиньк, буп» (просьба владельца, 2026-09-26), из shared/sfx.js.
//   у каждого цвета линии свой голос (своя ступень пентатоники): взял точку — «буп» её ноты, линия растёт —
//   тихие «тик» вверх по ступеням, шаг назад — ниже; дошёл до второй точки — «плиньк» (нота цвета + квинта);
//   перерезал чужую линию — смешной «буп» вниз; все пары соединены, а клетки пустые — вопросительное «буп-буп?»;
//   уровень — «плинь» на каждую пару по очереди и аккорд; новое поле — точки впрыгивают со своими «бупами»;
//   последние 5 секунд таймера — тихое тиканье; время вышло — «бу-у-уп» вниз.
// createSounds(ctx) принимает готовый AudioContext — в тестах подставляется поддельный.
// play(name, { color, step }) — color: номер цвета линии (0…9), step: длина линии / номер пары / секунда.

import { createSfx, freqOf, pentaStep } from '../../shared/sfx.js';

export const SOUNDS = [
  'grab', 'step', 'back', 'connect', 'cut', 'unfilled', 'cleared', 'intro', 'tick', 'timeup', 'reset', 'hint', 'click',
];

/** Нота цвета: 10 цветов — 10 разных ступеней пентатоники (две октавы). */
export const colorNote = (color) => pentaStep(((color % 10) + 10) % 10);

export function createSounds(ctx) {
  const { now, bell, plip, bup, swoosh, pad } = createSfx(ctx);
  const base = (color) => freqOf(colorNote(color) - 12);

  const play = {
    // взял точку или линию
    grab: (t, { color = 0 }) => bup(base(color), t, { peak: 0.26 }),
    // линия выросла: «тик» на ступень выше (по кругу через октаву, чтобы длинная линия не улетала в писк)
    step: (t, { color = 0, step: n = 1 }) => plip(base(color) * 2 ** ((pentaStep(n % 6)) / 12), t, { peak: 0.12, decay: 0.05 }),
    back: (t, { color = 0, step: n = 1 }) => plip(base(color) * 2 ** ((pentaStep(n % 6)) / 12), t, { up: false, peak: 0.09, decay: 0.05 }),
    // дошёл до своей второй точки — «плиньк»
    connect: (t, { color = 0 }) => {
      bell(base(color) * 2, t, { peak: 0.24, decay: 0.35 });
      bell(base(color) * 3, t + 0.06, { peak: 0.18, decay: 0.45 });
    },
    // перерезал чужую линию — «буп» вниз
    cut: (t) => bup(freqOf(-17), t, { peak: 0.24, decay: 0.16, drop: 2.6 }),
    // все соединены, а поле не заполнено: «буп-буп?» с подъёмом
    unfilled: (t) => {
      bup(freqOf(-10), t, { peak: 0.22 });
      bup(freqOf(-5), t + 0.14, { peak: 0.22, drop: 0.7 });
    },
    // уровень: мягкие «плинь» вверх (не больше пяти, октавой ниже, тихо) и тёплый аккорд без звона.
    // Первая версия — до десяти колокольчиков и аккорд из четырёх высоких — «ДЗЫНЬ!», било по ушам (владелец).
    cleared: (t, { step: pairs = 5 }) => {
      const n = Math.max(3, Math.min(5, pairs));
      for (let k = 0; k < n; k++) bell(freqOf(colorNote(k) - 12), t + k * 0.08, { peak: 0.08, decay: 0.35 });
      pad([freqOf(-12), freqOf(-5), freqOf(4)], t + n * 0.08, { peak: 0.04, attack: 0.12, decay: 1.4, cutoff: 1300 });
    },
    // новое поле: точка пары впрыгивает (step — номер пары)
    intro: (t, { step: k = 0 }) => bup(base(k), t, { peak: 0.14, decay: 0.08 }),
    // последние секунды: тихое «тик-так» (чётные — выше)
    tick: (t, { step: s = 0 }) => plip(freqOf(s % 2 ? 7 : 12), t, { peak: 0.08, decay: 0.04 }),
    // время вышло: долгий «бу-у-уп» вниз
    timeup: (t) => {
      bup(freqOf(-12), t, { peak: 0.26, decay: 0.3, drop: 2 });
      bup(freqOf(-19), t + 0.25, { peak: 0.24, decay: 0.5, drop: 1.6 });
    },
    // стереть все линии
    reset: (t) => {
      swoosh(t, 2600, 600, 0.22, 0.08);
      bup(freqOf(-12), t + 0.12, { peak: 0.16 });
    },
    // подсказка прокладывает линию: быстрые «плинь» вверх
    hint: (t, { color = 0 }) => {
      [0, 2, 4, 7].forEach((s, k) => plip(base(color) * 2 ** ((s + 12) / 12), t + k * 0.06, { peak: 0.12, decay: 0.07 }));
    },
    click: (t) => plip(freqOf(12), t, { peak: 0.12, decay: 0.05 }),
  };

  return {
    has: (name) => name in play,
    play(name, opts = {}) {
      const fn = play[name];
      if (fn) fn(now(), opts);
    },
  };
}
