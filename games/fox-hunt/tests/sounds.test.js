// Звуки и музыка «Лисьей охоты» на поддельном AudioContext. Послушать их тест не может — поэтому считает:
// каждый звук звучит и подключён; только синусы и треугольники, шум — через фильтр; тоны не выше 1400 Гц
// (колокольчики — основной тон не выше 1100); ничто не громче 0.3, частые — тише 0.12 и из малого числа узлов;
// частые редеют по часам звука и не копятся, когда часы стоят. Музыка: ноты — чистая функция от места и зерна,
// ставятся только когда часы идут, тише звуков, останавливается начисто — и ни один тест не оставляет таймера.
//
// Таблицу «звук → из чего он сделан» можно напечатать:  FH_SOUNDS=1 node games/fox-hunt/tests/sounds.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createSounds, composeMusic, noteOf, SOUNDS, FREQUENT, MOODS } from '../sounds.js';
import { fakeContext } from '../../../shared/tests/fake-audio.js';

const MASTER = 0.5;            // громкость общей шины звуков: от неё считаем «громкость кирпичика»
const JUNK = [{}, { n: 1 }, { n: 40 }, { n: -3 }, { n: 'мусор' }, { n: NaN, v: 5000, x: 'мусор' }, 7, 'мусор', null, undefined];

/**
 * Поддельный контекст с «прослушкой»: кто к кому подключён, что задано частотам и громкостям, когда источники
 * начинают и перестают звучать. Таймеры тоже поддельные: живого setInterval тест не оставляет.
 */
function studio({ rate = 8000 } = {}) {
  const { ctx, created } = fakeContext();
  ctx.sampleRate = rate;
  ctx.createBuffer = (channels, length) => {
    const data = new Float32Array(length);
    return { length, getChannelData: () => data };
  };
  const listen = (make) => (...args) => {
    const n = make(...args);
    n.outs = [];
    const connect = n.connect;
    n.connect = (target) => {
      n.outs.push(target);
      return connect(target);
    };
    n.disconnect = () => { n.cut = true; };
    for (const key of ['frequency', 'gain']) {
      const p = n[key];
      if (!p) continue;
      p.events = [];
      for (const method of ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime']) {
        const set = p[method];
        p[method] = (v, t) => {
          assert.ok(Number.isFinite(v) && Number.isFinite(t), `${n.kind}.${key}: ${method}(${v}, ${t})`);
          p.events.push({ v, t });
          set.call(p, v, t);
        };
      }
    }
    if (n.start) {
      n.start = (t) => { n.startAt = t; };
      n.stop = (t) => { n.stopAt = t; };
    }
    return n;
  };
  for (const make of ['createGain', 'createOscillator', 'createBiquadFilter', 'createBufferSource', 'createDynamicsCompressor', 'createDelay']) {
    ctx[make] = listen(ctx[make]);
  }
  const live = new Map();
  let ids = 0;
  const timers = {
    live,
    setInterval: (fn, ms) => {
      live.set(++ids, { fn, ms });
      return ids;
    },
    clearInterval: (id) => { live.delete(id); },
  };
  const sounds = createSounds(ctx, timers);
  ctx.currentTime = 5;
  return { ctx, created, sounds, timers };
}

/** Наибольшее значение параметра: из расписания, а если его нет — заданное напрямую. */
const top = (param) => (param.events.length ? Math.max(...param.events.map((e) => e.v)) : param.value);

/** Громкость источника у выхода: произведение громкостей по самому громкому пути (эхо по кругу не считаем). */
function levelOf(source, ctx) {
  const walk = (n, level, seen) => {
    if (n === ctx.destination) return level;
    if (!n.outs || seen.has(n)) return 0;
    seen.add(n);
    const here = n.kind === 'gain' ? level * top(n.gain) : level;
    let best = 0;
    for (const next of n.outs) best = Math.max(best, walk(next, here, seen));
    seen.delete(n);
    return best;
  };
  return walk(source, 1, new Set());
}

/** Проходит ли звук источника через фильтр по дороге к выходу — по любому пути. */
function filtered(source, ctx) {
  const walk = (n, ok, seen) => {
    if (n === ctx.destination) return ok;
    if (!n.outs || !n.outs.length || seen.has(n)) return true;
    seen.add(n);
    return n.outs.every((next) => walk(next, ok || n.kind === 'filter', seen));
  };
  return walk(source, false, new Set());
}

const BELL = [1, 2, 3.01, 4.2];        // обертоны колокольчика из shared/sfx.js

/** Из чего сделан звук: узлы, осцилляторы (вид, частоты, громкость, когда звучит), шум, колокольчики. */
function profile(name, opts, s = studio()) {
  const before = s.created.length;
  const t = s.ctx.currentTime;
  s.sounds.play(name, opts);
  const fresh = s.created.slice(before);
  const oscs = fresh.filter((n) => n.kind === 'osc').map((n) => ({
    type: n.type,
    freqs: n.frequency.events.map((e) => e.v),
    level: levelOf(n, s.ctx) / MASTER,
    from: n.startAt - t,
    to: n.stopAt - t,
    bell: 0,
  }));
  // колокольчик — четыре синуса подряд с частотами 1 : 2 : 3,01 : 4,2
  for (let k = 0; k + 3 < oscs.length; k++) {
    const base = oscs[k].freqs[0];
    if (BELL.every((mult, j) => oscs[k + j].type === 'sine' && Math.abs(oscs[k + j].freqs[0] / base - mult) < 1e-9)) {
      BELL.forEach((mult, j) => { oscs[k + j].bell = j + 1; });
      k += 3;
    }
  }
  const noises = fresh.filter((n) => n.kind === 'buffer').map((n) => ({
    level: levelOf(n, s.ctx) / MASTER,
    freqs: n.outs.flatMap((f) => (f.kind === 'filter' ? [...f.frequency.events.map((e) => e.v), f.frequency.value] : [Infinity])),
    filtered: filtered(n, s.ctx),
    from: n.startAt - t,
    to: n.stopAt - t,
  }));
  const sources = [...oscs, ...noises];
  return {
    name,
    nodes: fresh.length,
    fresh,
    oscs,
    noises,
    types: [...new Set([...oscs.map((o) => o.type), ...(noises.length ? ['шум'] : [])])],
    tone: Math.max(0, ...oscs.filter((o) => o.bell <= 1).flatMap((o) => o.freqs)),            // без обертонов колокольчика
    bells: oscs.filter((o) => o.bell === 1).map((o) => o.freqs[0]),
    noise: Math.max(0, ...noises.flatMap((n) => n.freqs)),
    peak: Math.max(0, ...sources.map((x) => x.level)),
    sum: sources.reduce((acc, x) => acc + x.level, 0),
    dur: Math.max(0, ...sources.map((x) => x.to)),
  };
}

/** То же, но худший случай из нескольких проб: высота частых звуков чуть гуляет. */
function worst(name, opts) {
  const tries = Array.from({ length: 8 }, () => profile(name, opts));
  const most = (key) => Math.max(...tries.map((p) => p[key]));
  return { ...tries[0], tone: most('tone'), noise: most('noise'), peak: most('peak'), sum: most('sum'), nodes: most('nodes') };
}

/** Таблица «звук → чем звучит, верхний тон, верх шума, громкость, сумма громкостей, длительность, узлы». */
function soundTable() {
  const rows = [['звук', 'чем звучит', 'тон до, Гц', 'шум до, Гц', 'громк.', 'сумма', 'длит., с', 'узлов', '']];
  for (const name of SOUNDS) {
    const p = worst(name, { n: 3 });
    rows.push([name, p.types.join('+') + (p.bells.length ? ` (кол. ×${p.bells.length})` : ''), p.tone.toFixed(0), p.noise ? p.noise.toFixed(0) : '—',
      p.peak.toFixed(3), p.sum.toFixed(2), p.dur.toFixed(2), String(p.nodes), FREQUENT.includes(name) ? 'частый' : '']);
  }
  const width = rows[0].map((_, c) => Math.max(...rows.map((r) => r[c].length)));
  return rows.map((r) => r.map((cell, c) => cell.padEnd(width[c])).join(' | ')).join('\n');
}

// ---------- звуки ----------

test('в наборе ровно те звуки, о которых договорились', () => {
  const agreed = ('tap open close equip deny buy coin pick heart mana potion chest banner gift '
    + 'dash land hurt shield die respawn nomana '
    + 'catch escape hit crit kill bush stump spiky '
    + 'shot heavy spread bow magic zap beam lob boom ice fire swing trap '
    + 'warn moose paw growl spit spawn '
    + 'door lock clear task taskok taskfail boss bossdie floor gameover record hire altar well forge heal').split(' ');
  assert.deepEqual([...SOUNDS].sort(), [...agreed].sort());
  assert.equal(new Set(SOUNDS).size, SOUNDS.length, 'повторов нет');
  for (const name of SOUNDS) assert.match(name, /^[a-z]+$/);
  for (const name of FREQUENT) assert.ok(SOUNDS.includes(name), `частый звук «${name}» — не из набора`);
  // то, что в бою звучит чаще всего, обязано быть среди частых — к ним правила строже
  for (const name of ['dash', 'land', 'hit', 'catch', 'shot', 'coin', 'pick', 'tap', 'spawn', 'warn']) {
    assert.ok(FREQUENT.includes(name), `«${name}» должен считаться частым`);
  }
});

test('каждый звук звучит с любыми настройками, все узлы подключены', () => {
  const s = studio();
  for (const name of SOUNDS) {
    assert.ok(s.sounds.has(name), `нет звука ${name}`);
    for (const opts of JUNK) {
      s.ctx.currentTime += 3;                              // не упираться в «не чаще»
      const before = s.created.length;
      s.sounds.play(name, opts);
      const fresh = s.created.slice(before);
      assert.ok(fresh.some((n) => n.kind === 'osc' || n.kind === 'buffer'), `${name}: нет источника звука`);
      for (const n of fresh) assert.ok(n.connections > 0, `${name}: узел ${n.kind} ни к чему не подключён`);
      for (const n of fresh) {
        if (n.kind !== 'osc' && n.kind !== 'buffer') continue;
        assert.ok(n.startAt >= s.ctx.currentTime, `${name}: начинается в прошлом`);
        assert.ok(n.stopAt > n.startAt, `${name}: источник не остановлен`);
        assert.ok(levelOf(n, s.ctx) > 0, `${name}: источник не доходит до выхода`);
      }
    }
  }
  assert.equal(s.sounds.has('нет такого'), false);
  assert.equal(s.sounds.has('toString'), false);
  const before = s.created.length;
  s.sounds.play('нет такого');
  s.sounds.play('toString');
  assert.equal(s.created.length, before);
  assert.equal(s.timers.live.size, 0, 'звуки таймеров не заводят');
});

test('прослушка не врёт: нажатие — «плип» из shared/sfx.js', () => {
  const p = profile('tap');
  assert.equal(p.nodes, 4);
  assert.deepEqual(p.types, ['sine', 'triangle']);
  assert.ok(Math.abs(p.tone - noteOf(17) * 2) < 1e-6, `верхний тон ${p.tone}`);
  assert.ok(Math.abs(p.peak - 0.08) < 1e-9, `громкость ${p.peak}`);
  assert.ok(Math.abs(noteOf(10) - 261.63) < 0.01 && Math.abs(noteOf(14) - 440) < 0.01 && noteOf(15) === noteOf(10) * 2);
});

test('мягко: только синусы и треугольники, шум — только через фильтр', () => {
  for (const name of SOUNDS) {
    const p = profile(name, { n: 3 });
    for (const o of p.oscs) assert.ok(o.type === 'sine' || o.type === 'triangle', `${name}: волна «${o.type}» режет уши`);
    for (const n of p.noises) assert.ok(n.filtered && Number.isFinite(Math.max(...n.freqs)), `${name}: шум без фильтра`);
  }
});

test('мягко: тоны не выше 1400 Гц, основной тон колокольчика — не выше 1100, полоса шума — не выше 1400', () => {
  for (const name of SOUNDS) {
    for (const opts of [{ n: 1 }, { n: 99 }]) {
      const p = worst(name, opts);
      assert.ok(p.tone <= 1400, `${name}: тон ${Math.round(p.tone)} Гц`);
      for (const f of p.bells) assert.ok(f <= 1100, `${name}: колокольчик ${Math.round(f)} Гц`);
      assert.ok(p.noise <= 1400, `${name}: шум до ${Math.round(p.noise)} Гц`);
    }
  }
});

/** Быстрое преобразование Фурье на месте (длина — степень двойки). */
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const wr = Math.cos((-2 * Math.PI) / len);
    const wi = Math.sin((-2 * Math.PI) / len);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
        [cr, ci] = [cr * wr - ci * wi, cr * wi + ci * wr];
      }
    }
  }
}

test('мягко: свой шум заранее смягчён — выше 2 кГц в нём почти ничего нет, по кругу идёт без щелчка', () => {
  const rate = 44100;
  const s = studio({ rate });
  const used = new Set();
  for (const name of SOUNDS) {
    s.ctx.currentTime += 3;
    const before = s.created.length;
    s.sounds.play(name);
    for (const n of s.created.slice(before)) if (n.kind === 'buffer') used.add(n.buffer);
  }
  assert.equal(used.size, 1, 'шум у всех звуков один — смягчённый');
  const data = [...used][0].getChannelData(0);
  assert.equal(data.length, rate);
  assert.ok(Math.abs(Math.max(...data.map(Math.abs)) - 1) < 1e-6, 'шум доведён до полной громкости');
  assert.ok(Math.abs(data[0]) < 1e-3 && Math.abs(data[data.length - 1]) < 1e-3, 'края сведены в ноль');
  const size = 32768;
  const re = Float64Array.from(data.subarray(1000, 1000 + size));
  const im = new Float64Array(size);
  fft(re, im);
  let all = 0;
  let over2k = 0;
  let over4k = 0;
  for (let k = 1; k < size / 2; k++) {
    const power = re[k] * re[k] + im[k] * im[k];
    const f = (k * rate) / size;
    all += power;
    if (f > 2000) over2k += power;
    if (f > 4000) over4k += power;
  }
  assert.ok(over2k / all < 0.03, `выше 2 кГц — ${((100 * over2k) / all).toFixed(2)} % энергии`);
  assert.ok(over4k / all < 0.002, `выше 4 кГц — ${((100 * over4k) / all).toFixed(3)} % энергии`);
});

test('негромко: ничто не громче 0.3, частые — тише 0.12 и не больше восьми узлов', () => {
  for (const name of SOUNDS) {
    for (const opts of [{ n: 1 }, { n: 99 }]) {
      const p = worst(name, opts);
      assert.ok(p.peak <= 0.3 + 1e-9, `${name}: громкость ${p.peak.toFixed(3)}`);
      if (!FREQUENT.includes(name)) continue;
      assert.ok(p.peak < 0.12, `${name}: частый звук громкостью ${p.peak.toFixed(3)}`);
      assert.ok(p.nodes <= 8, `${name}: частый звук из ${p.nodes} узлов`);
      assert.ok(p.dur <= 0.6, `${name}: частый звук длится ${p.dur.toFixed(2)} с`);
    }
  }
});

test('поимка: щипок вверх; чем длиннее цепочка, тем выше нота — до восьмой', () => {
  const noteAt = (n) => Math.max(...profile('catch', { n }).oscs.map((o) => o.freqs[o.freqs.length - 1]));
  for (let n = 2; n <= 8; n++) assert.ok(noteAt(n) > noteAt(n - 1), `цепочка ${n}`);
  assert.equal(noteAt(8), noteAt(30));
  assert.equal(noteAt(1), noteAt(0), 'мусор — как первая');
  assert.equal(noteAt(1), noteAt('мусор'));
  // счёт можно передать и как v — так его несёт событие расчёта { id, x, y, v }
  const last = (opts) => Math.max(...profile('catch', opts).oscs.map((o) => o.freqs[o.freqs.length - 1]));
  assert.equal(last({ id: 'catch', x: 10, y: 20, v: 4 }), noteAt(4));
  assert.equal(last({ n: 2, v: 6 }), noteAt(2), 'n главнее');
  assert.ok(noteAt(8) <= 1100, `верхняя нота ${noteAt(8)}`);
  const p = profile('catch', { n: 1 });
  assert.ok(p.oscs.every((o) => o.type === 'triangle' && o.freqs[1] > o.freqs[0]), 'каждая нота подъезжает снизу');
  assert.ok(p.oscs[1].from > p.oscs[0].from && p.oscs[1].freqs[1] > p.oscs[0].freqs[1], 'две ноты, вторая выше');
});

test('пойманные одним рывком звучат друг за другом, а не разом', () => {
  const s = studio();
  const starts = [];
  for (let n = 1; n <= 3; n++) {
    const before = s.created.length;
    s.sounds.play('catch', { n });
    starts.push(Math.min(...s.created.slice(before).filter((x) => x.kind === 'osc').map((x) => x.startAt)));
  }
  assert.ok(starts[1] - starts[0] > 0.04 && starts[2] - starts[1] > 0.04, `начала: ${starts}`);
});

test('монеты подряд идут вверх по нотам, после паузы — снова с первой', () => {
  const s = studio();
  const note = () => {
    const before = s.created.length;
    s.sounds.play('coin');
    return s.created.slice(before).find((n) => n.kind === 'osc').frequency.events[0].v;
  };
  const first = note();
  s.ctx.currentTime += 0.1;
  const second = note();
  s.ctx.currentTime += 0.1;
  const third = note();
  assert.ok(third > second && second > first);
  for (let k = 0; k < 12; k++) {
    s.ctx.currentTime += 0.1;
    assert.ok(note() <= 1400);
  }
  s.ctx.currentTime += 2;
  assert.equal(note(), first);
});

test('характер: красная зона — два низких толчка, лось — долгий низкий топот, лапа — глубокий удар', () => {
  const warn = profile('warn');
  assert.equal(warn.oscs.length, 2);
  assert.ok(warn.oscs[1].from - warn.oscs[0].from > 0.1, 'два толчка, а не один');
  assert.ok(warn.tone <= 400 && warn.noises.length === 0, `толчки низкие: ${warn.tone}`);
  assert.ok(warn.oscs.every((o) => o.freqs[1] < o.freqs[0]), 'каждый толчок уходит вниз');

  const moose = profile('moose');
  assert.ok(moose.dur >= 0.9, `топот длится ${moose.dur}`);
  assert.ok(moose.tone <= 220 && moose.noise <= 450, `низко: тон ${moose.tone}, шум ${moose.noise}`);
  const roll = moose.fresh.find((n) => n.kind === 'gain' && n.gain.events.length > 12).gain.events.map((e) => e.v);
  let turns = 0;
  for (let k = 2; k < roll.length; k++) if ((roll[k] - roll[k - 1]) * (roll[k - 1] - roll[k - 2]) < 0) turns++;
  assert.ok(turns >= 10, `громкость «катится»: ${turns} поворотов`);

  const paw = profile('paw');
  assert.ok(Math.min(...paw.oscs.flatMap((o) => o.freqs)) < 80, 'удар уходит глубоко вниз');
  assert.ok(paw.sum > profile('hit').sum * 3 && paw.dur < 0.5, 'удар весомее обычного попадания, но короткий');

  const growl = profile('growl');
  assert.ok(growl.tone <= 220 && growl.oscs.every((o) => o.freqs[1] < o.freqs[0]), 'рык низкий и сползает вниз');
});

test('характер: больно — глухой стук, а не гудок; рывок — короткий «вжух»; хозяин — медленно и низко', () => {
  const hurt = profile('hurt');
  assert.ok(hurt.tone <= 400 && hurt.dur < 0.35 && hurt.noises.length === 0, `стук: ${hurt.tone} Гц, ${hurt.dur} с`);
  assert.ok(hurt.oscs.some((o) => o.type === 'triangle' && o.freqs[0] <= 160), 'в основе — низкий удар');
  assert.ok(hurt.oscs.every((o) => o.freqs[o.freqs.length - 1] < o.freqs[0]), 'всё идёт вниз');

  const dash = profile('dash');
  assert.equal(dash.noises.length, 1);
  assert.ok(dash.dur < 0.3, `рывок длится ${dash.dur}`);
  const sweep = dash.noises[0].freqs;
  assert.ok(sweep[1] > sweep[0], 'шорох идёт вверх');

  const boss = profile('boss');
  assert.ok(boss.dur > 1.8 && boss.tone <= 300, `мотив: ${boss.dur} с, до ${boss.tone} Гц`);
  const steps = boss.oscs.filter((o) => o.type === 'triangle').map((o) => o.from);
  assert.ok(steps.length >= 4 && steps[1] - steps[0] > 0.35, 'ноты идут медленно');
});

test('характер: конец охоты — фраза вниз; рекорд и пройденная комната — колокольчики', () => {
  const over = profile('gameover').oscs.filter((o) => o.type === 'triangle');
  assert.ok(over.length >= 4);
  for (let k = 1; k < over.length; k++) {
    assert.ok(over[k].from > over[k - 1].from && over[k].freqs[0] < over[k - 1].freqs[0], 'каждая нота позже и ниже');
  }
  assert.ok(profile('record').bells.length >= 5);
  const clear = profile('clear');
  assert.ok(clear.bells.length >= 2 && clear.bells.length <= 4 && clear.dur < 2.2, 'перезвон маленький');
  for (let k = 1; k < clear.bells.length; k++) assert.ok(clear.bells[k] > clear.bells[k - 1], 'перезвон идёт вверх');
  // двери: открылись — стуки вверх, закрылись — вниз
  const knocks = (name) => profile(name).oscs.map((o) => o.freqs[o.freqs.length - 1]);
  assert.ok(knocks('door')[1] > knocks('door')[0] && knocks('lock')[1] < knocks('lock')[0]);
});

test('ранение, потеря жизни и конец охоты приходят одним кадром — и не слипаются', () => {
  const s = studio();
  const t = s.ctx.currentTime;
  const part = (studioOf, name) => {
    const before = studioOf.created.length;
    studioOf.sounds.play(name);
    return studioOf.created.slice(before).filter((n) => n.kind === 'osc');
  };
  const hurt = part(s, 'hurt');
  const die = part(s, 'die');
  const over = part(s, 'gameover');
  assert.ok(hurt.length && die.length && over.length, 'все три прозвучали');
  const lowest = (oscs) => Math.min(...oscs.map((o) => o.frequency.events[0].v));
  assert.ok(lowest(hurt) < 200 && lowest(die) > 200, 'удар один — от ранения; второй раз он не бьёт');
  const first = Math.min(...over.map((o) => o.startAt));
  assert.ok(first >= t + 0.85, `конец охоты начинается через ${(first - t).toFixed(2)} с`);
  assert.ok(Math.max(...die.map((o) => o.startAt)) < first, 'сначала доигрывает «жизнь потеряна»');
  // поодиночке: у потери жизни свой удар, конец охоты звучит сразу
  const alone = studio();
  assert.ok(lowest(part(alone, 'die')) < 200);
  const late = studio();
  assert.ok(Math.min(...part(late, 'gameover').map((o) => o.startAt)) < late.ctx.currentTime + 0.05);
});

// ---------- прореживание ----------

/** Сколько раз звук действительно прозвучал (по числу созданных источников). */
function count(s, fn) {
  const before = s.created.length;
  fn();
  return s.created.slice(before).filter((n) => n.kind === 'osc' || n.kind === 'buffer').length;
}

test('частый звук — не чаще своего промежутка по часам звука', () => {
  for (const name of FREQUENT.filter((n) => n !== 'catch')) {
    const s = studio();
    const once = count(s, () => s.sounds.play(name));
    assert.ok(once > 0);
    assert.equal(count(s, () => s.sounds.play(name)), 0, `${name}: второй раз в тот же миг — тишина`);
    s.ctx.currentTime += 0.02;
    assert.equal(count(s, () => s.sounds.play(name)), 0, `${name}: через 20 мс — ещё рано`);
    s.ctx.currentTime += 0.5;
    assert.equal(count(s, () => s.sounds.play(name)), once, `${name}: через полсекунды — снова звучит`);
  }
});

test('часы стоят (звук выключен в профиле) — звуки не копятся', () => {
  const s = studio();
  let made = 0;
  for (let round = 0; round < 200; round++) {
    for (const name of SOUNDS) made += count(s, () => s.sounds.play(name, { n: round })) ? 1 : 0;
  }
  assert.ok(made <= 10, `за остановленные часы начато ${made} звуков`);
  // пошли часы — всё звучит снова
  s.ctx.currentTime += 1;
  assert.ok(count(s, () => s.sounds.play('gameover')) > 0);
  assert.ok(count(s, () => s.sounds.play('catch')) > 0);

  // контекст сам говорит, что стоит на паузе, — тогда ставится совсем чуть-чуть
  const held = studio();
  held.ctx.state = 'suspended';
  made = 0;
  for (let round = 0; round < 50; round++) {
    for (const name of SOUNDS) made += count(held, () => held.sounds.play(name)) ? 1 : 0;
  }
  assert.equal(made, 2, 'на паузе — не больше двух звуков');
  held.ctx.state = 'running';
  held.ctx.currentTime += 1;
  for (const name of ['tap', 'hit', 'clear', 'coin']) assert.ok(count(held, () => held.sounds.play(name)) > 0, `${name} после паузы`);
});

test('за один отсчёт часов — не больше шести частых звуков; редкому важному место остаётся', () => {
  const s = studio();
  let made = 0;
  for (const name of FREQUENT) made += count(s, () => s.sounds.play(name)) ? 1 : 0;
  assert.equal(made, 6);
  assert.ok(count(s, () => s.sounds.play('gameover')) > 0, 'конец охоты слышен и в гуще боя');
  assert.ok(count(s, () => s.sounds.play('record')) > 0);
});

// ---------- музыка: ноты ----------

const notesOf = (score) => score.at.flatMap((list, step) => list.map((n) => ({ ...n, step })));

test('музыка — чистая функция: то же место и зерно дают те же ноты, другое зерно — другую мелодию', () => {
  for (const mood of MOODS) {
    const a = composeMusic(mood, 12345);
    assert.deepEqual(a, composeMusic(mood, 12345), mood);
    const lead = (score) => JSON.stringify(notesOf(score).filter((n) => n.kind === 'lead').map((n) => [n.step, n.f]));
    const variants = new Set([1, 2, 3, 4, 5, 6].map((seed) => lead(composeMusic(mood, seed))));
    assert.ok(variants.size >= 5, `${mood}: мелодий на шесть зёрен — ${variants.size}`);
    // подложка от зерна не зависит: место узнаётся по созвучиям
    const pads = (score) => JSON.stringify(notesOf(score).filter((n) => n.kind === 'pad').map((n) => [n.step, n.f]));
    assert.equal(pads(a), pads(composeMusic(mood, 99)));
  }
  assert.equal(composeMusic('нет такого', 1), null);
});

test('музыка: форма 16–32 такта, ноты мягкие — основные тоны от 60 до 900 Гц, громкость до 0.25', () => {
  for (const mood of MOODS) {
    for (const seed of [1, 2, 3, 77, 4000000000]) {
      const score = composeMusic(mood, seed);
      assert.ok(score.bars >= 16 && score.bars <= 32, `${mood}: ${score.bars} тактов`);
      assert.equal(score.at.length, score.steps);
      assert.equal(score.steps, score.bars * score.bar);
      const loop = score.steps * score.stepDur;
      assert.ok(loop >= 30 && loop <= 120, `${mood}: круг ${loop.toFixed(0)} с`);
      const notes = notesOf(score);
      for (const n of notes) {
        assert.ok(['pad', 'arp', 'lead', 'pulse'].includes(n.kind), `${mood}: голос «${n.kind}»`);
        assert.ok(n.f >= 60 && n.f <= 900, `${mood}: нота ${n.f.toFixed(1)} Гц`);
        assert.ok(n.vel > 0.01 && n.vel <= 0.25, `${mood}: громкость ноты ${n.vel}`);
        assert.ok(n.len > 0.15 && n.len < 12, `${mood}: длина ноты ${n.len}`);
      }
      // мелодия — не «четыре ноты по кругу»: нот много, разных высот — не меньше четырёх
      const lead = notes.filter((n) => n.kind === 'lead');
      assert.ok(lead.length >= 12, `${mood}: в мелодии ${lead.length} нот`);
      assert.ok(new Set(lead.map((n) => n.f)).size >= 4, `${mood}: мелодия из ${new Set(lead.map((n) => n.f)).size} нот`);
      // …и не частит: в мелодии остаётся воздух
      const perBar = lead.length / score.bars;
      assert.ok(perBar <= (mood === 'boss' ? 4.5 : 3), `${mood}: ${perBar.toFixed(1)} ноты мелодии на такт`);
      // подложка есть на каждом созвучии
      for (let s = 0; s < score.steps; s += score.unit) {
        assert.ok(score.at[s].filter((n) => n.kind === 'pad').length >= 2, `${mood}: нет подложки на шаге ${s}`);
      }
    }
  }
});

test('музыка: у мест разная опора, темп и тембр; у хозяина — быстрее всех и с низким пульсом', () => {
  const scores = Object.fromEntries(MOODS.map((mood) => [mood, composeMusic(mood, 5)]));
  const places = MOODS.filter((mood) => mood !== 'boss');
  assert.equal(new Set(places.map((mood) => scores[mood].bpm)).size, places.length, 'темп у каждого места свой');
  for (const mood of places) assert.ok(scores.boss.bpm > scores[mood].bpm, `хозяин быстрее, чем ${mood}`);
  const pulse = notesOf(scores.boss).filter((n) => n.kind === 'pulse');
  assert.ok(pulse.length >= scores.boss.bars * 4, 'пульс — на каждую долю');
  assert.ok(pulse.every((n) => n.f < 130), 'пульс низкий');
  for (const mood of places) assert.equal(notesOf(scores[mood]).filter((n) => n.kind === 'pulse').length, 0, `${mood}: пульса нет`);
  // одна пентатоника на всех: любая нота любой музыки — это до, ре, ми, соль или ля (верх подложки чуть расстроен)
  const scale = new Set(Array.from({ length: 25 }, (_, i) => noteOf(i).toFixed(3)));
  for (const mood of MOODS) {
    for (const n of notesOf(scores[mood])) {
      assert.ok(scale.has(n.f.toFixed(3)) || scale.has((n.f / 2 ** (5 / 1200)).toFixed(3)), `${mood}: нота ${n.f} вне пентатоники`);
    }
  }
});

test('музыка недорогая: разом звучит не больше 16 осцилляторов, на шаге — не больше шести новых', () => {
  for (const mood of MOODS) {
    for (const seed of [1, 2, 3]) {
      const score = composeMusic(mood, seed);
      const marks = [];
      for (const n of notesOf(score)) {
        const from = n.step * score.stepDur;
        for (const lap of [0, 1]) marks.push([from + lap * score.steps * score.stepDur, 1], [from + n.len + 0.05 + lap * score.steps * score.stepDur, -1]);
      }
      marks.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      let now = 1;                                         // гул опорной ноты звучит всегда
      let most = 0;
      for (const [, d] of marks) most = Math.max(most, now += d);
      assert.ok(most <= 16, `${mood}: разом ${most} осцилляторов`);
      assert.ok(Math.max(...score.at.map((list) => list.length)) <= 6, `${mood}: слишком много нот на шаге`);
    }
  }
});

// ---------- музыка: расписание ----------

/** Часы идут шагами по 0,2 с, на каждом — шаг расписания (как делал бы таймер). */
function run(s, seconds) {
  for (let k = 0; k < Math.round(seconds / 0.2); k++) {
    s.ctx.currentTime += 0.2;
    s.sounds.tick();
  }
}
const oscsOf = (s, from = 0) => s.created.slice(from).filter((n) => n.kind === 'osc');

test('музыка ставит ноты только пока идут часы — на полсекунды вперёд', () => {
  for (const mood of MOODS) {
    const s = studio();
    const t0 = s.ctx.currentTime;
    s.sounds.music(mood, 3);
    assert.equal(s.sounds.mood, mood);
    assert.equal(s.timers.live.size, 1, 'один таймер');
    assert.equal([...s.timers.live.values()][0].ms, 200);
    const first = s.created.length;
    assert.ok(oscsOf(s).length >= 3, 'гул и первое созвучие поставлены сразу');
    for (const o of oscsOf(s)) assert.ok(o.startAt >= t0 && o.startAt < t0 + 0.5 + 1e-9, `${mood}: нота на ${o.startAt - t0} с вперёд`);
    // часы стоят — сколько ни зови, ничего не ставится
    for (let k = 0; k < 50; k++) s.sounds.tick();
    assert.equal(s.created.length, first, `${mood}: часы стоят, а ноты ставятся`);
    // часы пошли — ноты идут, и каждая не дальше полсекунды от «сейчас»
    let before = s.created.length;
    for (let k = 0; k < 150; k++) {
      s.ctx.currentTime += 0.2;
      before = s.created.length;
      s.sounds.tick();
      for (const o of oscsOf(s, before)) {
        assert.ok(o.startAt >= s.ctx.currentTime && o.startAt < s.ctx.currentTime + 0.5 + 1e-9, `${mood}: нота не вовремя`);
        assert.ok(o.stopAt > o.startAt, `${mood}: нота не остановлена`);
      }
    }
    assert.ok(oscsOf(s, first).length > 15, `${mood}: за полминуты поставлено ${oscsOf(s, first).length} нот`);
    for (const n of s.created) assert.ok(n.connections > 0, `${mood}: узел ${n.kind} ни к чему не подключён`);
    s.sounds.music(null);
    assert.equal(s.timers.live.size, 0);
  }
});

test('музыка: своя шина (громкость → срез верха → выход), только синусы и треугольники, тоны до 900 Гц', () => {
  for (const mood of MOODS) {
    const s = studio();
    const before = s.created.length;
    s.sounds.music(mood, 8);
    run(s, 40);
    const fresh = s.created.slice(before);
    assert.ok(!fresh.some((n) => n.kind === 'buffer' || n.kind === 'compressor'), `${mood}: в музыке нет шума`);
    for (const o of fresh.filter((n) => n.kind === 'osc')) {
      assert.ok(o.type === 'sine' || o.type === 'triangle', `${mood}: волна ${o.type}`);
      for (const e of o.frequency.events) assert.ok(e.v >= 60 && e.v <= 900, `${mood}: тон ${e.v}`);
      assert.ok(filtered(o, s.ctx), `${mood}: нота идёт мимо среза верха`);
      assert.ok(levelOf(o, s.ctx) > 0, `${mood}: нота не доходит до выхода`);
    }
    const lp = fresh.filter((n) => n.kind === 'filter');
    assert.equal(lp.length, 1);
    assert.equal(lp[0].type, 'lowpass');
    assert.ok(lp[0].frequency.value >= 800 && lp[0].frequency.value <= 2000, `${mood}: срез ${lp[0].frequency.value}`);
    assert.deepEqual(lp[0].outs, [s.ctx.destination]);
    s.sounds.music(null);
  }
});

test('музыка заметно тише звуков', () => {
  const loud = (mood) => {
    const s = studio();
    const before = s.created.length;
    s.sounds.music(mood, 4);
    run(s, 60);
    const levels = s.created.slice(before).filter((n) => n.kind === 'osc').map((o) => levelOf(o, s.ctx));
    s.sounds.music(null);
    return Math.max(...levels);
  };
  const effects = SOUNDS.map((name) => profile(name).peak * MASTER).sort((a, b) => a - b);
  const median = effects[Math.floor(effects.length / 2)];
  for (const mood of MOODS) {
    const level = loud(mood);
    assert.ok(level <= 0.025, `${mood}: нота музыки у выхода ${level.toFixed(4)}`);
    assert.ok(level < median * 0.6, `${mood}: ${level.toFixed(4)} против обычного звука ${median.toFixed(4)}`);
  }
});

test('music(null): затухание за 0,6 с, все осцилляторы и таймер остановлены', () => {
  for (const mood of MOODS) {
    const s = studio();
    s.sounds.music(mood, 2);
    run(s, 20);
    const t = s.ctx.currentTime;
    const out = s.created.find((n) => n.kind === 'gain' && n.outs.some((x) => x.kind === 'filter' && x.outs.includes(s.ctx.destination)));
    s.sounds.music(null);
    assert.equal(s.sounds.mood, null);
    assert.equal(s.timers.live.size, 0, 'таймер снят');
    const end = out.gain.events[out.gain.events.length - 1];
    assert.ok(end.v <= 0.0001 && Math.abs(end.t - (t + 0.6)) < 1e-9, `${mood}: затухание до ${end.v} к ${end.t - t} с`);
    const oscs = oscsOf(s);
    assert.ok(oscs.length > 10);
    for (const o of oscs) assert.ok(o.stopAt <= t + 0.7, `${mood}: осциллятор звучит до ${o.stopAt - t} с после остановки`);
    // дальше — тишина: шаг расписания ничего не ставит
    const before = s.created.length;
    run(s, 3);
    assert.equal(s.created.length, before);
    s.sounds.music(null);                                  // повторная остановка — не ошибка
    // отыгравшая дорожка отключена от выхода
    s.sounds.music(mood, 2);
    assert.ok(out.cut, `${mood}: старая дорожка осталась подключённой`);
    s.sounds.music(null);
    assert.equal(s.timers.live.size, 0);
  }
});

test('смена места: плавный переход за полторы секунды, прежняя дорожка останавливается', () => {
  const s = studio();
  s.sounds.music('forest', 1);
  run(s, 10);
  const old = oscsOf(s);
  const outs = () => s.created.filter((n) => n.kind === 'gain' && n.outs.some((x) => x.kind === 'filter'));
  const [forestOut] = outs();
  const t = s.ctx.currentTime;
  s.sounds.music('boss', 1);
  assert.equal(s.sounds.mood, 'boss');
  assert.equal(s.timers.live.size, 1, 'таймер один и тот же');
  const bossOut = outs()[1];
  const fadeOut = forestOut.gain.events[forestOut.gain.events.length - 1];
  const fadeIn = bossOut.gain.events[bossOut.gain.events.length - 1];
  assert.ok(fadeOut.v <= 0.0001 && Math.abs(fadeOut.t - (t + 1.5)) < 1e-9, 'прежняя уходит за 1,5 с');
  assert.ok(fadeIn.v > 0.01 && Math.abs(fadeIn.t - (t + 1.5)) < 1e-9, 'новая входит за 1,5 с');
  for (const o of old) assert.ok(o.stopAt <= t + 1.6, 'нота прежней дорожки звучит дольше перехода');
  // то же место ещё раз — ничего не меняется
  const before = s.created.length;
  s.sounds.music('boss', 2);
  s.sounds.music('нет такого');
  assert.equal(s.created.length, before);
  assert.equal(s.sounds.mood, 'boss');
  run(s, 5);
  assert.ok(forestOut.cut, 'прежняя дорожка отключена');
  assert.ok(oscsOf(s, before).length > 10, 'новая играет');
  // посреди перехода — тишина: обе дорожки уходят за 0,6 с
  s.sounds.music('cave', 1);
  s.ctx.currentTime += 0.3;
  const t2 = s.ctx.currentTime;
  s.sounds.music(null);
  for (const o of oscsOf(s)) assert.ok(o.stopAt <= t2 + 0.7, `звучит до ${o.stopAt - t2} с`);
  assert.equal(s.timers.live.size, 0);
});

test('пауза и продолжение: то же место играет дальше с того же созвучия, а не сначала', () => {
  const s = studio();
  s.sounds.music('forest');
  run(s, 30);                                              // 30 с — это одиннадцатый такт: пятое созвучие позади
  s.sounds.music(null);
  s.ctx.currentTime += 5;
  const before = s.created.length;
  s.sounds.music('forest');
  const first = oscsOf(s, before).map((o) => o.frequency.events[0].v);
  const score = composeMusic('forest', 1);
  const padAt = (unit) => score.at[unit * score.unit].filter((n) => n.kind === 'pad').map((n) => n.f);
  assert.deepEqual(first.slice(1, 4), padAt(5), 'подложка — шестого созвучия');
  assert.notDeepEqual(padAt(5), padAt(0));

  // ушли к хозяину и вернулись — опушка снова продолжает, а не начинает сначала
  const firstPads = (fn) => {
    const from = s.created.length;
    fn();
    return oscsOf(s, from).map((o) => o.frequency.events[0].v).slice(1, 4);
  };
  run(s, 12);                                              // ещё 12 с: идёт восьмое созвучие (седьмое позади)
  s.sounds.music('boss');
  run(s, 6);
  assert.deepEqual(firstPads(() => s.sounds.music('forest')), padAt(7), 'после хозяина — с восьмого созвучия');
  // то же зерно — продолжение; другое зерно — место начинает заново
  const again = studio();
  again.sounds.music('swamp', 11);
  run(again, 12);
  again.sounds.music(null);
  const swamp = composeMusic('swamp', 11);
  const swampPad = (unit) => swamp.at[unit * swamp.unit].filter((n) => n.kind === 'pad').map((n) => n.f);
  const fromOf = (seed) => {
    const from = again.created.length;
    again.sounds.music('swamp', seed);
    const pads = oscsOf(again, from).map((o) => o.frequency.events[0].v).slice(1, 4);
    again.sounds.music(null);
    return pads;
  };
  again.ctx.currentTime += 3;
  assert.notDeepEqual(swampPad(1), swampPad(0));
  assert.deepEqual(fromOf(11), swampPad(1), 'то же зерно — со второго созвучия');
  again.ctx.currentTime += 3;
  assert.deepEqual(fromOf(12), swampPad(0), 'другое зерно — с начала');
  s.sounds.music(null);
  assert.equal(s.timers.live.size, 0);
  assert.equal(again.timers.live.size, 0);
});

test('часы стоят: включить и выключить музыку можно сколько угодно — узлы не копятся', () => {
  const s = studio();
  const cut = () => s.created.filter((n) => n.kind === 'filter' && n.type === 'lowpass' && n.outs.includes(s.ctx.destination) && !n.cut).length;
  for (let k = 0; k < 30; k++) {
    s.sounds.music(k % 2 ? 'forest' : 'swamp');
    for (let j = 0; j < 5; j++) s.sounds.tick();
    s.sounds.music(null);
  }
  assert.equal(cut(), 0, 'все дорожки отключены');
  const t = s.ctx.currentTime;
  for (const o of oscsOf(s)) assert.ok(o.stopAt <= t, 'то, что никто не слышал, не зазвучит и потом');
  assert.equal(s.timers.live.size, 0);
});

test('таймер проспал — пропущенные ноты не играют скопом; круг кончился — музыка идёт дальше', () => {
  const s = studio();
  s.sounds.music('boss', 6);
  run(s, 5);
  s.ctx.currentTime += 30;                                 // вкладку усыпили на полминуты
  let before = s.created.length;
  s.sounds.tick();
  const late = oscsOf(s, before);
  assert.ok(late.length <= 14, `после сна разом поставлено ${late.length} нот`);
  for (const o of late) assert.ok(o.startAt >= s.ctx.currentTime, 'нота в прошлом');
  // круг хозяина — 34 с: за две минуты он сменится трижды, а ноты всё идут
  before = s.created.length;
  run(s, 120);
  const laps = oscsOf(s, before);
  assert.ok(laps.length > 600, `за два круга ${laps.length} нот`);
  const lastStart = Math.max(...laps.map((o) => o.startAt));
  assert.ok(lastStart > s.ctx.currentTime - 0.3, 'музыка не замолчала');
  s.sounds.music(null);
  assert.equal(s.timers.live.size, 0);
});

test('громкость музыки: ноль — тишина, но расписание живо; мусор — тишина', () => {
  const s = studio();
  s.sounds.music('autumn', 1);
  run(s, 4);
  const out = s.created.find((n) => n.kind === 'gain' && n.outs.some((x) => x.kind === 'filter'));
  const lastTarget = () => out.gain.events[out.gain.events.length - 1].v;
  const full = lastTarget();
  s.sounds.setMusicVolume(0.5);
  assert.ok(Math.abs(lastTarget() - full / 2) < 1e-9);
  s.sounds.setMusicVolume(0);
  assert.ok(lastTarget() <= 0.0001);
  s.sounds.setMusicVolume('мусор');
  assert.ok(lastTarget() <= 0.0001);
  s.sounds.setMusicVolume(7);
  assert.ok(Math.abs(lastTarget() - full) < 1e-9);
  s.sounds.music(null);
});

test('долгая беспорядочная игра: ничего не падает, узлы подключены, после остановки — тишина и ни одного таймера', () => {
  const s = studio();
  let seed = 20261013;
  const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const moods = [...MOODS, null, null, 'нет такого', undefined];
  for (let k = 0; k < 20000; k++) {
    const r = rnd();
    if (r < 0.7) s.sounds.play(pick(SOUNDS), pick(JUNK));
    else if (r < 0.9) {
      s.ctx.currentTime += rnd() < 0.05 ? rnd() * 40 : rnd() * 0.3;      // изредка — долгий сон вкладки
      s.sounds.tick();
    } else if (r < 0.97) s.sounds.music(pick(moods), rnd() < 0.5 ? Math.floor(rnd() * 5) : undefined);
    else if (r < 0.985) s.sounds.setMusicVolume(pick([0, 0.3, 1, 'мусор']));
    else s.ctx.state = pick(['running', 'running', 'suspended']);
    assert.ok(s.timers.live.size <= 1, 'таймер музыки — не больше одного');
  }
  for (const n of s.created) assert.ok(n.connections > 0, `узел ${n.kind} ни к чему не подключён`);
  for (const n of s.created) {
    if (n.kind !== 'osc' && n.kind !== 'buffer') continue;
    assert.ok(Number.isFinite(n.startAt), 'источник не запущен');
    if (n.stopAt === undefined) continue;                  // гул играющей дорожки остановят вместе с ней
    assert.ok(n.stopAt >= n.startAt - 1e-9 || n.stopAt <= s.ctx.currentTime, 'источник остановлен раньше, чем начат');
  }
  const t = s.ctx.currentTime;
  s.sounds.music(null);
  assert.equal(s.timers.live.size, 0);
  for (const o of oscsOf(s)) assert.ok(o.stopAt <= t + 4, `осциллятор звучит ещё ${(o.stopAt - t).toFixed(1)} с`);
  const music = oscsOf(s).filter((o) => o.outs.some((g) => g.outs && g.outs.some((x) => x.kind === 'gain' && x.outs.some((y) => y.kind === 'filter' && y.type === 'lowpass'))));
  assert.ok(music.length > 300, `нот музыки за игру — ${music.length}`);
  for (const o of music) assert.ok(o.stopAt <= t + 0.7, `нота музыки звучит ещё ${(o.stopAt - t).toFixed(2)} с после остановки`);
  const before = s.created.length;
  run(s, 5);
  assert.equal(s.created.length, before, 'после остановки ничего не ставится');
});

test('без своих таймеров берутся обычные — и после music(null) ничего не остаётся', () => {
  const { ctx } = fakeContext();
  const seen = [];
  const { setInterval: realSet, clearInterval: realClear } = globalThis;
  globalThis.setInterval = (fn, ms) => {
    seen.push(ms);
    return 77;
  };
  globalThis.clearInterval = (id) => { seen.push(`снят ${id}`); };
  try {
    const sounds = createSounds(ctx);
    sounds.music('taiga');
    sounds.music(null);
  } finally {
    globalThis.setInterval = realSet;
    globalThis.clearInterval = realClear;
  }
  assert.deepEqual(seen, [200, 'снят 77']);
});

// ---------- имена ----------

const HERE = new URL('..', import.meta.url);

/**
 * Имена звуков в тексте программы: вызовы sfx(G, 'имя', …), sfx('имя', …), play('имя', …) — имя может стоять и в
 * выборе (sfx(G, ранен ? 'hurt' : 'shield', …)) — и поле sfx: 'имя' в описаниях (чем стреляет оружие).
 */
function namesIn(js) {
  const names = [];
  for (const m of js.matchAll(/\b(?:sfx|play)\(/g)) {
    // разбираем аргументы вызова: до закрывающей скобки, запятые — только верхнего уровня
    const args = [''];
    let depth = 0;
    for (let i = m.index + m[0].length; i < js.length && args.length < 3; i++) {
      const ch = js[i];
      if ('([{'.includes(ch)) depth++;
      else if (')]}'.includes(ch)) {
        if (depth === 0) break;
        depth--;
      } else if (ch === ',' && depth === 0) {
        args.push('');
        continue;
      }
      args[args.length - 1] += ch;
    }
    // имя — первый аргумент, а если первым передано состояние игры (G) — второй
    const first = /^\s*[A-Za-z_$][\w$.]*\s*$/.test(args[0]) && args.length > 1 ? args[1] : args[0];
    for (const q of first.matchAll(/'([a-z]+)'/g)) names.push(q[1]);
  }
  for (const m of js.matchAll(/\bsfx:\s*'([a-z]+)'/g)) names.push(m[1]);
  return names;
}

test('поиск имён звуков понимает все способы позвать звук', () => {
  assert.deepEqual(namesIn("sfx(G, 'dash', P.x, P.y); sfx(G, left > 0 ? 'hurt' : 'shield', P.x, P.y);"), ['dash', 'hurt', 'shield']);
  assert.deepEqual(namesIn("sfx('tap'); play('open', { n: 1 }); audio.get()?.play(e.id, e); sfx(game, pick(a, b) ? 'coin' : 'pick');"), ['tap', 'open', 'coin', 'pick']);
  assert.deepEqual(namesIn("export function sfx(G, id, x, y, v) { emit(G, { t: 'sfx', id, x, y, v }); }"), []);
  assert.deepEqual(namesIn("bow: { name: 'Лук', pattern: 'pierce', sfx: 'bow' }, sfx(G, w.sfx, x, y, kind === 'zone' ? 1 : 2)"), ['bow']);
});

/** Какие звуки зовёт игра и в каком файле (все games/fox-hunt/*.js). */
function calledSounds() {
  const called = new Map();
  for (const file of readdirSync(HERE)) {
    if (!file.endsWith('.js')) continue;
    for (const name of namesIn(readFileSync(new URL(file, HERE), 'utf8'))) if (!called.has(name)) called.set(name, file);
  }
  return called;
}

test('игра зовёт только те звуки, которые есть', () => {
  for (const [name, file] of calledSounds()) assert.ok(SOUNDS.includes(name), `${file}: звук «${name}», которого нет`);
});

test('каждый звук где-нибудь звучит', { skip: !existsSync(new URL('index.js', HERE)) && 'игра ещё не собрана (нет index.js)' }, () => {
  const called = calledSounds();
  for (const name of SOUNDS) assert.ok(called.has(name), `звук «${name}» нигде не звучит`);
});

if (process.env.FH_SOUNDS) console.log(soundTable());
