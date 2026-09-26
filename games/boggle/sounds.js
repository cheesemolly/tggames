// Звуки Филворда — из общих кирпичиков shared/sfx.js (синтез Web Audio, без файлов).
// Идея: палец ведёт линию — каждая новая буква звучит на ступень пентатоники выше, отпускание назад — ниже,
// так что протяжка слова звучит «гаммой». Слово из списка — колокольчики и «росчерк» капсулы, бонусное —
// буквы «Бонус!» подпрыгивают со своими нотами и звенит «монетка». Уровень — волна колокольчиков по полю.
//
// createSounds(ctx) принимает готовый AudioContext — в тестах подставляется поддельный.
// play(name, { step }) — step: длина линии (drag), номер буквы баннера (hop), длина слова (bank).

import { createSfx, freqOf, pentaStep } from '../../shared/sfx.js';

export const SOUNDS = ['grab', 'drag', 'undrag', 'bank', 'bonus', 'hop', 'coin', 'repeat', 'unknown', 'level', 'fresh', 'click'];

export function createSounds(ctx) {
  const { now, bell, plip, swoosh, thud } = createSfx(ctx);

  const play = {
    // палец коснулся буквы
    grab: (t) => plip(freqOf(pentaStep(0)), t, { peak: 0.26 }),
    // линия выросла до step букв — нота на ступень выше
    drag: (t, { step: n = 1 }) => plip(freqOf(pentaStep(n - 1)), t, { peak: 0.24, decay: 0.1 }),
    // линия укоротилась — та же нота «сдувается»
    undrag: (t, { step: n = 1 }) => plip(freqOf(pentaStep(n - 1)), t, { up: false, peak: 0.16, decay: 0.08 }),
    // слово из списка: росчерк капсулы и колокольчики вверх (длиннее слово — больше нот)
    bank: (t, { step: n = 3 }) => {
      swoosh(t, 900, 3200, 0.18, 0.06);
      const notes = [0, 4, 7, 12, 16, 19].slice(0, Math.max(3, Math.min(6, n - 1)));
      notes.forEach((s, k) => bell(freqOf(s), t + 0.04 + k * 0.07, { peak: 0.26, decay: 0.7 }));
    },
    // бонусное слово — вступление; дальше буквы баннера зовут hop, в конце coin
    bonus: (t) => swoosh(t, 500, 4000, 0.25, 0.06),
    // буква «Бонус!» подпрыгнула: ноты вверх по мажорному аккорду
    hop: (t, { step: n = 0 }) => plip(freqOf([0, 4, 7, 12, 16, 24][Math.max(0, Math.min(5, n))] + 12), t, { peak: 0.2, decay: 0.12 }),
    // «монетка» под словом бонуса: две быстрые высокие ноты
    coin: (t) => {
      bell(freqOf(31), t, { peak: 0.14, decay: 0.12 });
      bell(freqOf(36), t + 0.07, { peak: 0.16, decay: 0.5 });
    },
    // уже найдено: два одинаковых тона — «было»
    repeat: (t) => {
      bell(freqOf(7), t, { peak: 0.16, decay: 0.2 });
      bell(freqOf(7), t + 0.11, { peak: 0.13, decay: 0.25 });
    },
    // нет в словаре: два мягких низких «бума»
    unknown: (t) => {
      thud(220, t);
      thud(165, t + 0.12, { decay: 0.24 });
    },
    // уровень пройден: волна колокольчиков по диагонали поля (как волна по буквам) и финальный аккорд
    level: (t, { step: n = 8 }) => {
      const waves = Math.max(5, Math.min(15, 2 * n - 1));
      for (let k = 0; k < waves; k++) bell(freqOf(pentaStep(k)), t + k * 0.05, { peak: 0.12, decay: 0.4 });
      [0, 4, 7, 12].forEach((s) => bell(freqOf(s + 12), t + waves * 0.05 + 0.08, { peak: 0.15, decay: 1.3 }));
    },
    // новое поле появилось
    fresh: (t) => swoosh(t, 3000, 700, 0.3, 0.07),
    // кнопки, окна
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
