// Общие «кирпичики» звуковых эффектов игр — синтез через Web Audio, без файлов.
// Игры собирают из них свои звуки («Слова из слова», Филворд): колокольчик, «плип»-пузырёк, шорох, мягкий удар.
//
// createSfx(ctx) принимает готовый AudioContext — в тестах подставляется поддельный.
// createAudio(make) — ленивый AudioContext: заводится при первом звуке (браузер разрешает звук только после
// нажатия), один на всю жизнь страницы — iOS ограничивает число контекстов.

// пентатоника до мажора: ступени в полутонах — любая последовательность звучит складно
export const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33, 36];
export const C5 = 523.25;
export const freqOf = (semitones, base = C5) => base * 2 ** (semitones / 12);
/** Ступень пентатоники по номеру (за краями — крайняя). */
export const pentaStep = (n) => PENTA[Math.max(0, Math.min(PENTA.length - 1, n))];

export function createSfx(ctx, { volume = 0.55 } = {}) {
  const master = ctx.createGain();
  master.gain.value = volume;
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

  /** «Плип» — пузырёк: синус, тон которого за миг подскакивает вверх (или падает вниз), и щелчок касания. */
  function plip(freq, t, { up = true, peak = 0.32, decay = 0.13 } = {}) {
    const o = osc('sine', freq * (up ? 0.72 : 1.25), t, t + decay + 0.05);
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.035);
    const g = env(t, peak, decay, 0.003);
    o.connect(g);
    g.connect(master);
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

  /** «Буп» — круглый пузырёк: тон быстро падает сверху к freq, верх подрезан (мультяшно и мягко). */
  function bup(freq, t, { peak = 0.3, decay = 0.12, drop = 1.9 } = {}) {
    const o = osc('sine', freq * drop, t, t + decay + 0.06);
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.05);
    const f = filter('lowpass', freq * 4, 0.7);
    const g = env(t, peak, decay, 0.004);
    o.connect(f);
    f.connect(g);
    g.connect(master);
  }

  /**
   * 8-битный «чип», как в аркадных автоматах: квадратная (или треугольная) волна, по желанию — скольжение тона
   * к slideTo. Верх слегка подрезан, чтобы не резало уши.
   */
  function chip(freq, t, { dur = 0.08, slideTo = null, type = 'square', peak = 0.08, cutoff = 4000 } = {}) {
    const o = osc(type, freq, t, t + dur + 0.03);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const f = filter('lowpass', cutoff, 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.004);
    g.gain.setValueAtTime(peak, t + Math.max(0.005, dur - 0.02));
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(f);
    f.connect(g);
    g.connect(master);
  }

  /**
   * Голос: «гласная» — пила через два полосовых фильтра-форманты, частоты которых меняются по ключевым точкам.
   * pitch — [в начале, в конце] (Гц); marks — [[время от начала, F1, F2], …] (закрытый рот — «м», «н» — это
   * низкие F1 и F2 в начале или в конце). Так змейка говорит «ням» и «юк».
   */
  function voice(t, { dur = 0.22, pitch = [260, 240], marks, peak = 0.22, attack = 0.02, release = 0.05 } = {}) {
    const o = osc('sawtooth', pitch[0], t, t + dur + 0.05);
    o.frequency.exponentialRampToValueAtTime(pitch[1], t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, t + Math.max(attack, dur - release));
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    [1, 2].forEach((n) => {
      const f = filter('bandpass', marks[0][n], n === 1 ? 6 : 9);
      f.frequency.setValueAtTime(marks[0][n], t);
      for (const m of marks) f.frequency.linearRampToValueAtTime(m[n], t + m[0]);
      const fg = ctx.createGain();
      fg.gain.value = n === 1 ? 1 : 0.6;
      o.connect(f);
      f.connect(fg);
      fg.connect(g);
    });
    g.connect(master);
  }

  // ---------- тихие «дзен»-звуки (судоку, Петля): бумага, карандаш, камень, тёплые аккорды — без звона ----------

  /**
   * Отрезок шума с плавной огибающей: полосовой фильтр с частотой, которая едет от f0 к f1 (направление штриха).
   * Основа карандаша, ластика и шелеста.
   */
  function grain(t, dur, { f0 = 3000, f1 = f0, q = 1.2, peak = 0.1, attack = 0.008, release = 0.02 } = {}) {
    const s = ctx.createBufferSource();
    s.buffer = noise;
    s.loop = true;
    s.start(t, Math.random() * 0.8);
    s.stop(t + dur + release + 0.02);
    const f = filter('bandpass', f0, q);
    f.frequency.setValueAtTime(f0, t);
    f.frequency.linearRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, t + Math.max(attack, dur - release));
    g.gain.linearRampToValueAtTime(0.0001, t + dur + release);
    s.connect(f);
    f.connect(g);
    g.connect(master);
  }

  /**
   * Карандаш по бумаге: штрихи грифеля (strokes — длительности в секундах, между ними — отрыв), у каждого
   * штриха своя высота «шипения» — как будто линия идёт в другую сторону.
   */
  function pencil(t, strokes, { peak = 0.09, gap = 0.03, tone = 3400 } = {}) {
    let at = t;
    strokes.forEach((dur, k) => {
      const f0 = tone * (0.85 + Math.random() * 0.3);
      grain(at, dur, { f0, f1: f0 * (k % 2 ? 0.8 : 1.2), q: 1.6, peak: peak * (0.8 + Math.random() * 0.3), attack: 0.006, release: 0.015 });
      at += dur + gap;
    });
    return at - t;
  }

  /** Ластик: несколько мягких проходов туда-обратно, ниже и глуше карандаша. */
  function rub(t, passes = 3, { peak = 0.08, len = 0.07 } = {}) {
    for (let k = 0; k < passes; k++) {
      grain(t + k * (len + 0.015), len, { f0: k % 2 ? 1500 : 1100, f1: k % 2 ? 1100 : 1500, q: 0.9, peak, attack: 0.015, release: 0.02 });
    }
  }

  /** Шелест листа: широкая полоса шума, медленно нарастает и уходит. */
  function rustle(t, dur = 0.35, { peak = 0.07, from = 2500, to = 5000 } = {}) {
    grain(t, dur, { f0: from, f1: to, q: 0.6, peak, attack: dur * 0.3, release: dur * 0.4 });
  }

  /** Мягкий «ток» — камень или дерево, глухо, без звона (низкий тон с быстрым спадом и подрезанным верхом). */
  function tock(freq, t, { peak = 0.16, decay = 0.09 } = {}) {
    const o = osc('sine', freq * 1.4, t, t + decay + 0.05);
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.03);
    const f = filter('lowpass', freq * 2.5, 0.5);
    const g = env(t, peak, decay, 0.004);
    o.connect(f);
    f.connect(g);
    g.connect(master);
  }

  /**
   * Тёплый аккорд: синусы с лёгкой расстройкой, медленная атака и долгое затухание через мягкий фильтр —
   * «вдох», а не удар. freqs — частоты нот.
   */
  function pad(freqs, t, { peak = 0.06, attack = 0.35, decay = 2.2, cutoff = 1400 } = {}) {
    const f = filter('lowpass', cutoff, 0.4);
    f.connect(master);
    for (const freq of freqs) {
      for (const detune of [1, 1.0035]) {
        const o = osc('sine', freq * detune, t, t + attack + decay + 0.1);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(peak, t + attack);
        g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
        o.connect(g);
        g.connect(f);
      }
    }
  }

  return { now, bell, plip, bup, chip, voice, swoosh, thud, grain, pencil, rub, rustle, tock, pad };
}

/**
 * Ленивый AudioContext для игры: make(ctx) строит её набор звуков один раз.
 * get() — набор звуков или null (нет Web Audio); контекст «будится», если браузер его усыпил.
 */
export function createAudio(make) {
  let audio = null;
  return {
    get() {
      if (audio) {
        if (audio.ctx.state === 'suspended') audio.ctx.resume().catch(() => {});
        return audio.sounds;
      }
      const Ctx = globalThis.AudioContext ?? globalThis.webkitAudioContext;
      if (!Ctx) return null;
      try {
        const ctx = new Ctx({ latencyHint: 'interactive' });
        audio = { ctx, sounds: make(ctx) };
      } catch {
        return null;
      }
      return audio.sounds;
    },
  };
}
