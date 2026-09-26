// Звуки «Слов из слова» — синтез через Web Audio, без файлов (как в Bongo Cat и Мемори).
// Идея: слово собирается «мелодией» — каждая следующая буква звучит на ступень выше (пентатоника,
// поэтому любое слово звучит складно), найденное слово — аккорд-колокольчик, редкое — с блёстками,
// прохождение уровня — фанфара. Ошибки — мягкие и низкие, чтобы не раздражать при частых промахах.
//
// createSounds(ctx) принимает готовый AudioContext — в тестах подставляется поддельный.
// play(name, { step }) — step: номер буквы (tap), номер звезды (star), длина слова (common/rare).

// пентатоника до мажора от до второй октавы: ступени в полутонах
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
const C5 = 523.25;
const freqOf = (semitones, base = C5) => base * 2 ** (semitones / 12);

export const SOUNDS = ['tap', 'back', 'clear', 'common', 'rare', 'found', 'wrong', 'hint', 'empty', 'star', 'level', 'click'];

export function createSounds(ctx) {
  const master = ctx.createGain();
  master.gain.value = 0.55;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.ratio.value = 5;
  master.connect(comp);
  comp.connect(ctx.destination);

  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  const now = () => ctx.currentTime + 0.005;

  function env(t, peak, decay, attack = 0.004) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }

  function osc(type, freq, t, stopAt) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.start(t);
    o.stop(stopAt);
    return o;
  }

  function filter(type, freq, q = 1) {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  /** Колокольчик: основной тон + негромкие обертоны, мягкая атака, длинный хвост. */
  function bell(freq, t, { peak = 0.3, decay = 0.9 } = {}) {
    [[1, 1], [2, 0.35], [3.01, 0.14], [4.2, 0.06]].forEach(([mult, amp]) => {
      const g = env(t, peak * amp, decay / (mult > 1 ? mult * 0.8 : 1), 0.006);
      osc('sine', freq * mult, t, t + decay + 0.1).connect(g);
      g.connect(master);
    });
  }

  /** «Плип» — пузырёк: синус, тон которого за миг подскакивает вверх (или падает вниз). */
  function plip(freq, t, { up = true, peak = 0.32, decay = 0.13 } = {}) {
    const o = osc('sine', freq * (up ? 0.72 : 1.25), t, t + decay + 0.05);
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.035);
    const g = env(t, peak, decay, 0.003);
    o.connect(g);
    g.connect(master);
    // лёгкий «щелчок» дерева поверх — слышно касание
    const click = osc('triangle', freq * 2, t, t + 0.04);
    const cg = env(t, peak * 0.25, 0.025, 0.001);
    click.connect(cg);
    cg.connect(master);
  }

  /** Шорох: шум через полосовой фильтр, частота которого едет от from к to. */
  function swoosh(t, from, to, dur, peak = 0.12) {
    const s = ctx.createBufferSource();
    s.buffer = noise;
    s.loop = true;
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
    const f = filter('bandpass', from, 1.4);
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = env(t, peak, dur, dur * 0.35);
    s.connect(f);
    f.connect(g);
    g.connect(master);
  }

  /** Мягкий низкий «бум» с подрезанным верхом — для ошибок. */
  function thud(freq, t, { peak = 0.28, decay = 0.18, slide = 0.75 } = {}) {
    const o = osc('triangle', freq, t, t + decay + 0.05);
    o.frequency.exponentialRampToValueAtTime(freq * slide, t + decay);
    const f = filter('lowpass', freq * 3, 0.7);
    const g = env(t, peak, decay, 0.005);
    o.connect(f);
    f.connect(g);
    g.connect(master);
  }

  const step = (n) => PENTA[Math.max(0, Math.min(PENTA.length - 1, n))];

  const play = {
    // буква: ступень по номеру буквы в слове
    tap: (t, { step: n = 0 }) => plip(freqOf(step(n)), t),
    // убрать букву — та же ступень, но пузырёк «сдувается» вниз
    back: (t, { step: n = 0 }) => plip(freqOf(step(n)), t, { up: false, peak: 0.22, decay: 0.1 }),
    clear: (t) => swoosh(t, 2400, 500, 0.22),
    // найдено слово: арпеджио вверх, чем длиннее слово — тем больше нот
    common: (t, { step: n = 3 }) => {
      const notes = [0, 4, 7, 12, 16, 19].slice(0, Math.max(3, Math.min(6, n - 1)));
      notes.forEach((s, k) => bell(freqOf(s), t + k * 0.07, { peak: 0.26, decay: 0.7 }));
    },
    // редкое слово: то же выше и «блёстки» — быстрый каскад высоких нот
    rare: (t, { step: n = 3 }) => {
      play.common(t, { step: n });
      [24, 28, 31, 36, 31, 36].forEach((s, k) => bell(freqOf(s), t + 0.12 + k * 0.045, { peak: 0.09, decay: 0.35 }));
    },
    // уже найдено: два коротких одинаковых тона — «было»
    found: (t) => {
      bell(freqOf(7), t, { peak: 0.16, decay: 0.2 });
      bell(freqOf(7), t + 0.11, { peak: 0.13, decay: 0.25 });
    },
    // нет такого слова: два низких мягких «бума» вниз
    wrong: (t) => {
      thud(220, t);
      thud(165, t + 0.12, { decay: 0.24 });
    },
    // подсказка: шорох вверх + восходящее глиссандо колокольчиков
    hint: (t) => {
      swoosh(t, 600, 5000, 0.35, 0.07);
      [12, 16, 19, 24].forEach((s, k) => bell(freqOf(s), t + 0.08 + k * 0.06, { peak: 0.13, decay: 0.5 }));
    },
    // подсказки кончились
    empty: (t) => thud(180, t, { decay: 0.14, slide: 0.9 }),
    // звезда в окне уровня: каждая следующая выше
    star: (t, { step: n = 0 }) => bell(freqOf([7, 12, 16][Math.max(0, Math.min(2, n))] + 12), t, { peak: 0.22, decay: 0.8 }),
    // уровень пройден: фанфара — аккорд вверх и финальная октава
    level: (t) => {
      [0, 4, 7].forEach((s, k) => bell(freqOf(s), t + k * 0.09, { peak: 0.24, decay: 0.5 }));
      [0, 4, 7, 12].forEach((s) => bell(freqOf(s + 12), t + 0.32, { peak: 0.16, decay: 1.3 }));
      swoosh(t + 0.3, 3000, 9000, 0.5, 0.04);
    },
    // вкладка, выбор уровня
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
