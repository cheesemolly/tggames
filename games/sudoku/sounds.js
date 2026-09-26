// Звуки судоку — из общих кирпичиков shared/sfx.js (синтез Web Audio, без файлов).
// Идея: у каждой цифры своя нота (1 — низкая, 9 — высокая, по пентатонике — любые соседние цифры звучат
// складно); заполнил строку, столбец или блок — каскад колокольчиков вслед за волной подсветки; цифра
// закончена (все девять) — «динь» её нотой октавой выше; победа — большая волна и фанфара. Ошибка — мягкие
// «бумы», заметка — шорох карандаша, ластик — шорох вниз. Всё тихое: судоку — игра спокойная.
//
// createSounds(ctx) принимает готовый AudioContext — в тестах подставляется поддельный.
// play(name, { step }) — step: цифра 1…9 (digit, done, note), число заполненных групп (unit).

import { createSfx, freqOf, pentaStep } from '../../shared/sfx.js';

export const SOUNDS = [
  'select', 'digit', 'wrong', 'note', 'erase', 'undo', 'unit', 'done',
  'hint', 'page', 'apply', 'empty', 'pause', 'resume', 'fresh', 'win', 'lose', 'click',
];

// нота цифры: пентатоника от ля малой октавы — 1 низко, 9 высоко
const digitFreq = (d) => freqOf(pentaStep(Math.max(1, Math.min(9, d)) - 1) - 3);

export function createSounds(ctx) {
  const { now, bell, plip, swoosh, thud } = createSfx(ctx, { volume: 0.5 });

  const play = {
    // выбор клетки — едва слышный щелчок
    select: (t) => plip(freqOf(19), t, { peak: 0.07, decay: 0.04 }),
    // верная цифра — её нота
    digit: (t, { step: d = 5 }) => bell(digitFreq(d), t, { peak: 0.22, decay: 0.55 }),
    wrong: (t) => {
      thud(220, t);
      thud(165, t + 0.12, { decay: 0.24 });
    },
    // заметка карандашом: короткий шорох и тихая нота цифры
    note: (t, { step: d = 5 }) => {
      swoosh(t, 4000, 6000, 0.05, 0.05);
      plip(digitFreq(d) * 2, t + 0.02, { peak: 0.08, decay: 0.06 });
    },
    erase: (t) => swoosh(t, 2200, 500, 0.18, 0.09),
    undo: (t) => plip(freqOf(7), t, { up: false, peak: 0.16, decay: 0.1 }),
    // группа заполнена: каскад вверх (две группы разом — длиннее и выше)
    unit: (t, { step: n = 1 }) => {
      const notes = n > 1 ? [0, 4, 7, 12, 16, 19, 24] : [0, 4, 7, 12, 16];
      notes.forEach((s, k) => bell(freqOf(s), t + k * 0.06, { peak: 0.16, decay: 0.6 }));
    },
    // цифра закончена — её нота октавой выше и «блёстка»
    done: (t, { step: d = 5 }) => {
      bell(digitFreq(d) * 2, t, { peak: 0.2, decay: 0.9 });
      bell(digitFreq(d) * 3, t + 0.08, { peak: 0.08, decay: 0.6 });
    },
    // подсказка открылась: шорох вверх и глиссандо
    hint: (t) => {
      swoosh(t, 600, 5000, 0.35, 0.06);
      [12, 16, 19, 24].forEach((s, k) => bell(freqOf(s), t + 0.08 + k * 0.06, { peak: 0.12, decay: 0.5 }));
    },
    // страница подсказки
    page: (t) => plip(freqOf(14), t, { peak: 0.12, decay: 0.06 }),
    // «Готово» в подсказке — цифра встала
    apply: (t) => {
      bell(freqOf(12), t, { peak: 0.2, decay: 0.6 });
      bell(freqOf(19), t + 0.08, { peak: 0.14, decay: 0.7 });
    },
    // подсказок нет
    empty: (t) => thud(180, t, { decay: 0.14, slide: 0.9 }),
    pause: (t) => swoosh(t, 2400, 700, 0.22, 0.06),
    resume: (t) => swoosh(t, 700, 2400, 0.22, 0.06),
    // новая партия: цифры появляются волной
    fresh: (t) => {
      swoosh(t, 3000, 800, 0.3, 0.06);
      [0, 7, 12].forEach((s, k) => bell(freqOf(s), t + 0.1 + k * 0.08, { peak: 0.1, decay: 0.4 }));
    },
    // победа: длинная волна по всей доске и фанфара
    win: (t) => {
      for (let k = 0; k < 12; k++) bell(freqOf(pentaStep(k)), t + k * 0.06, { peak: 0.1, decay: 0.5 });
      [0, 4, 7].forEach((s, k) => bell(freqOf(s + 12), t + 0.75 + k * 0.09, { peak: 0.2, decay: 0.5 }));
      [0, 4, 7, 12].forEach((s) => bell(freqOf(s + 24), t + 1.05, { peak: 0.13, decay: 1.4 }));
    },
    // поражение: три ноты вниз и «бум»
    lose: (t) => {
      [7, 3, 0].forEach((s, k) => bell(freqOf(s - 12), t + k * 0.22, { peak: 0.2, decay: 0.5 }));
      thud(130, t + 0.66, { peak: 0.22, decay: 0.4, slide: 0.7 });
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
