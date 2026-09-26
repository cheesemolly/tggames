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

  return { now, bell, plip, swoosh, thud };
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
