// Звуки судоку — «дзен» (решение владельца, 2026-09-26: «без всяких плиньк, расслабляюще, шорохи карандаша»):
// ни одного звона и «плипа», только бумага и грифель, а большие события — тёплый аккорд с медленным вдохом.
//   цифра — штрихи карандаша, у каждой цифры свой рисунок (1 — один штрих, 4 — три коротких, 8 — долгая петля…);
//   заметка — те же штрихи, мельче и тише; ластик — мягкие проходы туда-обратно; подсказка — шелест листа;
//   заполнена строка/столбец/блок — тихий тёплый аккорд; победа — долгий аккорд и «выдох» бумаги.
// Из общих кирпичиков shared/sfx.js. createSounds(ctx) принимает готовый AudioContext — в тестах поддельный.
// play(name, { step }) — step: цифра 1…9 (digit, note, done), число заполненных групп (unit).

import { createSfx, freqOf } from '../../shared/sfx.js';

export const SOUNDS = [
  'select', 'digit', 'wrong', 'note', 'erase', 'undo', 'unit', 'done',
  'hint', 'page', 'apply', 'empty', 'pause', 'resume', 'fresh', 'win', 'lose', 'click',
];

/** Как пишется цифра: длительности штрихов в секундах (примерно по тому, как её ведёт рука). */
export const DIGIT_STROKES = {
  1: [0.09],
  2: [0.07, 0.06],
  3: [0.05, 0.05],
  4: [0.05, 0.04, 0.06],
  5: [0.04, 0.05, 0.06],
  6: [0.12],
  7: [0.05, 0.08],
  8: [0.15],
  9: [0.07, 0.08],
};

// ноты тёплых аккордов (до мажор с добавленными: спокойно, без напряжения)
const C3 = freqOf(-12);
const chord = (...semitones) => semitones.map((s) => freqOf(s - 12));

export function createSounds(ctx) {
  const { now, grain, pencil, rub, rustle, tock, pad } = createSfx(ctx, { volume: 0.6 });
  const strokes = (d) => DIGIT_STROKES[Math.max(1, Math.min(9, d))] ?? DIGIT_STROKES[1];

  const play = {
    // выбор клетки — едва слышное касание бумаги
    select: (t) => grain(t, 0.018, { f0: 2200, q: 0.8, peak: 0.025, attack: 0.003, release: 0.01 }),
    // цифра — карандашом
    digit: (t, { step: d = 5 }) => pencil(t, strokes(d)),
    // неверная цифра — написана, а под ней глухой низкий «ток» и тихий тёмный аккорд
    wrong: (t, { step: d = 5 }) => {
      const len = pencil(t, strokes(d));
      tock(C3 * 0.75, t + len + 0.04, { peak: 0.14, decay: 0.14 });
      pad(chord(-3, 0), t + len + 0.04, { peak: 0.03, attack: 0.08, decay: 0.8, cutoff: 700 });
    },
    // заметка — мелко и тише
    note: (t, { step: d = 5 }) => pencil(t, strokes(d).map((s) => s * 0.55), { peak: 0.055, gap: 0.02, tone: 4300 }),
    erase: (t) => rub(t, 3),
    undo: (t) => rub(t, 2, { peak: 0.06, len: 0.06 }),
    // группа заполнена — тихий тёплый аккорд (две группы разом — полнее)
    unit: (t, { step: n = 1 }) => pad(n > 1 ? chord(0, 7, 16, 19) : chord(0, 7, 16), t, { peak: 0.035, attack: 0.25, decay: 1.8 }),
    // цифра закончена — одна мягкая высокая нота
    done: (t) => pad(chord(24), t, { peak: 0.03, attack: 0.2, decay: 1.4, cutoff: 1800 }),
    // подсказка — открываем лист
    hint: (t) => rustle(t, 0.45, { peak: 0.06 }),
    page: (t) => rustle(t, 0.22, { peak: 0.045, from: 3500, to: 2200 }),
    // «Готово» в подсказке — цифру вписали
    apply: (t) => pencil(t, [0.07, 0.06]),
    // подсказок нет — глухо
    empty: (t) => tock(C3, t, { peak: 0.12, decay: 0.12 }),
    pause: (t) => rustle(t, 0.35, { peak: 0.05, from: 4000, to: 1800 }),
    resume: (t) => rustle(t, 0.35, { peak: 0.05, from: 1800, to: 4000 }),
    // новая партия — чистый лист
    fresh: (t) => rustle(t, 0.6, { peak: 0.07, from: 1500, to: 5000 }),
    // победа — долгий тёплый аккорд и выдох бумаги
    win: (t) => {
      pad(chord(0, 4, 7, 11, 14), t, { peak: 0.045, attack: 0.8, decay: 3.5, cutoff: 1600 });
      rustle(t + 0.2, 1.2, { peak: 0.04, from: 1200, to: 3000 });
    },
    // поражение — низкий тихий аккорд вниз
    lose: (t) => pad(chord(-3, 0, 4), t, { peak: 0.04, attack: 0.4, decay: 2.4, cutoff: 900 }),
    // окна
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
