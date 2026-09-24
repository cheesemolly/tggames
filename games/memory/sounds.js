// Звуки набора «Звуки» — синтез Web Audio, без файлов. Двенадцать нарочно непохожих друг на друга
// звуков (разные тембр, высота и движение тона), чтобы пару можно было узнать на слух.
// createSounds(ctx) принимает готовый AudioContext — в тестах подставляется поддельный.

export function createSounds(ctx) {
  const out = ctx.createGain();
  out.gain.value = 0.7;
  const comp = ctx.createDynamicsCompressor();
  out.connect(comp);
  comp.connect(ctx.destination);

  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  const t0 = () => ctx.currentTime + 0.01;

  function env(t, peak, decay, attack = 0.005) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(out);
    return g;
  }

  function tone(type, freq, t, dur, gain) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.start(t);
    o.stop(t + dur + 0.05);
    o.connect(gain);
    return o;
  }

  function noiseBurst(t, dur, filterType, freq, gain) {
    const s = ctx.createBufferSource();
    s.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    s.connect(f);
    f.connect(gain);
    s.start(t);
    s.stop(t + dur);
    return s;
  }

  const SOUNDS = {
    drum(t) {
      const o = tone('sine', 150, t, 0.4, env(t, 1, 0.35));
      o.frequency.exponentialRampToValueAtTime(50, t + 0.25);
      noiseBurst(t, 0.05, 'lowpass', 1200, env(t, 0.3, 0.04, 0.001));
    },
    bell(t) {
      for (const [m, a, d] of [[1, 0.5, 1.4], [2.76, 0.25, 0.9], [5.4, 0.12, 0.5]]) tone('sine', 880 * m, t, d, env(t, a, d, 0.002));
    },
    major(t) {
      [261.6, 329.6, 392].forEach((f) => tone('triangle', f, t, 0.9, env(t, 0.3, 0.9)));
    },
    minor(t) {
      [220, 261.6, 329.6].forEach((f) => tone('sawtooth', f, t, 0.9, (() => {
        const g = env(t, 0.12, 0.9, 0.08);
        return g;
      })()));
    },
    up(t) {
      const o = tone('square', 200, t, 0.5, env(t, 0.18, 0.5, 0.01));
      o.frequency.exponentialRampToValueAtTime(1400, t + 0.45);
    },
    down(t) {
      const o = tone('sine', 1300, t, 0.6, env(t, 0.4, 0.6, 0.01));
      o.frequency.exponentialRampToValueAtTime(150, t + 0.55);
    },
    meow(t) {
      const g = env(t, 0.45, 0.55, 0.05);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.setValueAtTime(900, t);
      f.frequency.linearRampToValueAtTime(1500, t + 0.2);
      f.frequency.linearRampToValueAtTime(700, t + 0.55);
      f.Q.value = 4;
      f.connect(g);
      const o = tone('sawtooth', 500, t, 0.6, f);
      o.frequency.linearRampToValueAtTime(760, t + 0.18);
      o.frequency.linearRampToValueAtTime(430, t + 0.55);
    },
    bird(t) {
      for (let k = 0; k < 3; k++) {
        const s = t + k * 0.11;
        const o = tone('sine', 2200, s, 0.08, env(s, 0.3, 0.07, 0.003));
        o.frequency.exponentialRampToValueAtTime(3600, s + 0.06);
      }
    },
    laser(t) {
      const o = tone('sawtooth', 2000, t, 0.3, env(t, 0.2, 0.28, 0.002));
      o.frequency.exponentialRampToValueAtTime(120, t + 0.28);
    },
    coin(t) {
      tone('square', 988, t, 0.08, env(t, 0.15, 0.08, 0.002));
      tone('square', 1319, t + 0.08, 0.4, env(t + 0.08, 0.15, 0.4, 0.002));
    },
    boing(t) {
      const o = tone('triangle', 120, t, 0.7, env(t, 0.5, 0.7, 0.005));
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 14;
      const depth = ctx.createGain();
      depth.gain.value = 60;
      lfo.connect(depth);
      depth.connect(o.frequency);
      lfo.start(t);
      lfo.stop(t + 0.75);
      o.frequency.exponentialRampToValueAtTime(300, t + 0.6);
    },
    bubble(t) {
      for (let k = 0; k < 2; k++) {
        const s = t + k * 0.14;
        const o = tone('sine', 400, s, 0.12, env(s, 0.45, 0.1, 0.002));
        o.frequency.exponentialRampToValueAtTime(1100, s + 0.1);
      }
    },
  };

  return {
    play(id) {
      SOUNDS[id]?.(t0());
    },
    has: (id) => id in SOUNDS,
  };
}
