import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SIZES, findSize, fits, newGame, flip, closeOpen, canFlip, magnet, tick, starsFor, levelParams, newLevel, seeded,
  isValidState, emptyStats, isValidStats, recordGame, timeLimit, LIVES, MAX_LIVES, CLOCK_BONUS_MS,
} from '../logic.js';
import { SETS, makeFaces, maxKeys, faceId, EMOJI_THEMES, WORDS, SOUNDS } from '../sets.js';
import { createSounds } from '../sounds.js';

const base = (extra = {}) => ({ cols: 4, rows: 4, group: 2, set: 'monsters', specials: [], pressure: 'calm', ...extra });
const idxOfKey = (s, key) => s.cards.map((c, i) => i).filter((i) => s.cards[i].key === key && !s.cards[i].gone);
const idxOfKind = (s, kind) => s.cards.map((c, i) => i).filter((i) => s.cards[i].kind === kind && !s.cards[i].gone);
const normalKeys = (s) => [...new Set(s.cards.filter((c) => c.kind === 'normal' && !c.gone).map((c) => c.key))];

// ---------- наборы картинок ----------

test('наборы: у разных ключей разные лица, у ключа — группа одинаковых (у слов — картинка и слово)', () => {
  const rng = seeded(1);
  for (const set of SETS) {
    for (const keys of [2, 6, 12, Math.min(18, maxKeys(set.id))]) {
      for (const group of set.pairsOnly ? [2] : [2, 3]) {
        const { faces } = makeFaces(set.id, keys, group, rng);
        assert.equal(faces.length, keys, `${set.id}: ${keys}`);
        const ids = faces.map((list) => faceId(list[0]));
        assert.equal(new Set(ids).size, keys, `${set.id}: лица повторяются`);
        for (const list of faces) {
          assert.equal(list.length, group);
          if (set.id === 'words') {
            assert.equal(list[0].type, 'emoji');
            assert.equal(list[1].type, 'word');
          } else assert.ok(list.every((f) => faceId(f) === faceId(list[0])));
        }
      }
    }
  }
  assert.throws(() => makeFaces('words', 4, 3, rng), /только пары/);
});

test('данные наборов: эмодзи без повторов, слова по-русски, звуков хватает на «Свою игру»', () => {
  for (const t of EMOJI_THEMES) {
    assert.equal(new Set(t.items).size, t.items.length, `${t.id}: повтор`);
    assert.ok(t.items.length >= 18, `${t.id}: мало для 6×6`);
  }
  assert.equal(new Set(WORDS.map((w) => w[0])).size, WORDS.length);
  for (const [, word] of WORDS) assert.match(word, /^[а-яё]+$/);
  assert.ok(SOUNDS.length >= 12, 'на 4×6 (12 пар) звуков хватает');
});

// ---------- раздача ----------

test('раздача: группы по 2/3, джокеров 0 или 2, бонусы по режиму', () => {
  for (const size of SIZES) {
    for (const group of [2, 3]) {
      if (!fits(size, group)) continue;
      const s = newGame(base({ cols: size.cols, rows: size.rows, group, specials: ['gold', 'joker', 'bonus'] }), seeded(size.cols * 10 + group));
      assert.equal(s.cards.length, size.cols * size.rows);
      const byKey = new Map();
      for (const c of s.cards) byKey.set(c.key, (byKey.get(c.key) ?? 0) + 1);
      for (const [key, n] of byKey) assert.equal(n, key === -1 ? 2 : group, `${size.id}/${group}: ключ ${key}`);
      assert.ok(!s.specials.includes('bonus') && !s.specials.includes('clock') && !s.specials.includes('heart'), 'спокойно: bonus = золото');
      assert.ok(isValidState(s));
    }
  }
  const timed = newGame(base({ specials: ['bonus'], pressure: 'time' }), seeded(3));
  assert.deepEqual(timed.specials, ['clock']);
  const lives = newGame(base({ specials: ['bonus', 'clock'], pressure: 'lives' }), seeded(3));
  assert.deepEqual(lives.specials, ['heart'], 'часы без таймера выброшены');
  const noJoker = newGame(base({ cols: 3, rows: 4, group: 3, specials: ['joker'] }), seeded(3));
  assert.deepEqual(noJoker.specials, [], '12 − 2 не делится на 3 — джокера нет');
});

test('«Слово и картинка» в «Тройках» и нехватка звуков — подставляются монстрики', () => {
  assert.equal(newGame(base({ cols: 3, rows: 4, group: 3, set: 'words' }), seeded(1)).set, 'monsters');
  assert.equal(newGame(base({ cols: 6, rows: 6, set: 'sounds' }), seeded(1)).set, 'monsters');
  assert.equal(newGame(base({ set: 'sounds' }), seeded(1)).set, 'sounds');
  assert.equal(newGame(base({ cols: 5, rows: 6, set: 'words' }), seeded(1)).set, 'emoji', 'слова на узких карточках не влезают');
  assert.equal(newGame(base({ cols: 4, rows: 6, set: 'words' }), seeded(1)).set, 'words');
});

// ---------- ход ----------

test('пара: совпала — уходит, не совпала — закрывается; третье нажатие закрывает промах', () => {
  const s = newGame(base(), seeded(5));
  const [a1, a2] = idxOfKey(s, 0);
  const [b1] = idxOfKey(s, 1);
  assert.equal(flip(s, a1).type, 'open');
  assert.equal(flip(s, a1), null, 'ту же карточку второй раз не открыть');
  const m = flip(s, a2);
  assert.equal(m.type, 'match');
  assert.ok(s.cards[a1].gone && s.cards[a2].gone);
  assert.equal(canFlip(s, a1), false);

  flip(s, b1);
  const other = idxOfKey(s, 2)[0];
  const miss = flip(s, other);
  assert.equal(miss.type, 'miss');
  assert.equal(miss.mistake, false, 'промах вслепую — не ошибка');
  assert.equal(s.closePending, true);
  const third = idxOfKey(s, 3)[0];
  const next = flip(s, third);
  assert.deepEqual(next.closed.sort(), [b1, other].sort(), 'не ждал паузы — прошлые закрылись');
  assert.deepEqual(s.open, [third]);
  assert.equal(s.moves, 2);
  assert.equal(closeOpen(s).length, 0, 'закрывать нечего');
});

test('ошибка — только промах, которого можно было избежать; жизни кончаются', () => {
  const s = newGame(base({ pressure: 'lives' }), seeded(8));
  const [a1, a2] = idxOfKey(s, 0);
  const [b1, b2] = idxOfKey(s, 1);
  const [c1] = idxOfKey(s, 2);
  flip(s, a1);
  assert.equal(flip(s, b1).mistake, false, 'обе новые');
  closeOpen(s);
  flip(s, a2);                                         // пара a1 видна — надо было открыть a1
  assert.equal(flip(s, c1).mistake, true);
  assert.equal(s.lives, LIVES - 1);
  closeOpen(s);
  flip(s, b2);
  assert.equal(flip(s, c1).mistake, true, 'c1 уже видели — открывать её незачем');
  closeOpen(s);
  flip(s, a1);
  const last = flip(s, b1);
  assert.equal(last.mistake, true);
  assert.equal(last.fail, true);
  assert.ok(s.failed);
  assert.equal(flip(s, a2), null, 'после поражения ходить нельзя');
});

test('тройки: две одинаковые — ждём третью, третья чужая — промах', () => {
  const s = newGame(base({ cols: 3, rows: 4, group: 3 }), seeded(9));
  const [a1, a2, a3] = idxOfKey(s, 0);
  assert.equal(flip(s, a1).type, 'open');
  assert.equal(flip(s, a2).type, 'open');
  assert.equal(flip(s, a3).type, 'match');
  const [b1, b2] = idxOfKey(s, 1);
  flip(s, b1);
  flip(s, b2);
  assert.equal(flip(s, idxOfKey(s, 2)[0]).type, 'miss');
});

test('джокер: забирает всю группу любой карточки; два джокера — вместе; последние джокеры уходят сами', () => {
  const s = newGame(base({ specials: ['joker'] }), seeded(11));
  const [j1, j2] = idxOfKind(s, 'joker');
  const [a1, a2] = idxOfKey(s, 0);
  flip(s, j1);
  const m = flip(s, a1);
  assert.equal(m.type, 'match');
  assert.deepEqual(m.extra, [a2], 'пару открывать не пришлось');
  assert.ok(s.cards[a2].gone);

  const t = newGame(base({ specials: ['joker'] }), seeded(12));
  const [k1, k2] = idxOfKind(t, 'joker');
  flip(t, k1);
  assert.equal(flip(t, k2).type, 'match');

  // снимаем всё обычное — оставшийся джокер уходит сам и партия выиграна
  const u = newGame(base({ specials: ['joker'] }), seeded(13));
  let last;
  for (const key of normalKeys(u)) {
    for (const i of idxOfKey(u, key)) last = flip(u, i);
  }
  assert.equal(last.win, true);
  assert.ok(u.done);
  assert.ok(u.cards.every((c) => c.gone));
  void j2;
});

test('бонусы: золото ×3, часы +10 с, сердце +1 (не больше 5), глаз, вихрь', () => {
  const gold = newGame(base({ specials: ['gold'] }), seeded(1));
  const g = idxOfKind(gold, 'gold');
  flip(gold, g[0]);
  assert.equal(flip(gold, g[1]).gained, 10 * 2 * 1 * 3);

  const timed = newGame(base({ specials: ['bonus'], pressure: 'time' }), seeded(2));
  assert.equal(timed.timeLeft, timeLimit(16, 2));
  tick(timed, 5000);
  const c = idxOfKind(timed, 'clock');
  flip(timed, c[0]);
  flip(timed, c[1]);
  assert.equal(timed.timeLeft, timeLimit(16, 2) - 5000 + CLOCK_BONUS_MS);

  const lives = newGame(base({ specials: ['bonus'], pressure: 'lives' }), seeded(3));
  lives.lives = MAX_LIVES;
  const h = idxOfKind(lives, 'heart');
  flip(lives, h[0]);
  flip(lives, h[1]);
  assert.equal(lives.lives, MAX_LIVES);

  const eye = newGame(base({ specials: ['eye'] }), seeded(4));
  const e = idxOfKind(eye, 'eye');
  flip(eye, e[0]);
  assert.equal(flip(eye, e[1]).peek, true);

  const vx = newGame(base({ specials: ['vortex'] }), seeded(5));
  for (const card of vx.cards) card.seen = true;
  const before = vx.cards.map((card) => card.key).sort();
  const v = idxOfKind(vx, 'vortex');
  flip(vx, v[0]);
  const ev = flip(vx, v[1]);
  assert.ok(ev.shuffle.length > 0, 'карточки переехали');
  assert.deepEqual(vx.cards.map((card) => card.key).sort(), before, 'набор тот же');
  assert.ok(vx.cards.filter((card) => !card.gone).every((card) => !card.seen), 'запомненное сброшено');
});

test('комбо растит очки, промах его сбрасывает', () => {
  const s = newGame(base(), seeded(21));
  const gains = [];
  for (const key of [0, 1, 2]) {
    const [x, y] = idxOfKey(s, key);
    flip(s, x);
    gains.push(flip(s, y).gained);
  }
  assert.deepEqual(gains, [20, 40, 60]);
  flip(s, idxOfKey(s, 3)[0]);
  flip(s, idxOfKey(s, 4)[0]);
  assert.equal(s.combo, 0);
  assert.equal(s.bestCombo, 3);
});

test('магнит: доводит открытую карточку; иначе снимает уже виденную группу; ходом не считается', () => {
  const s = newGame(base(), seeded(31));
  const [a1, a2] = idxOfKey(s, 0);
  flip(s, a1);
  const m = magnet(s);
  assert.equal(m.type, 'match');
  assert.ok(s.cards[a2].gone);
  assert.equal(s.moves, 0);

  const [b1] = idxOfKey(s, 1);
  const [c1] = idxOfKey(s, 2);
  flip(s, b1);
  flip(s, c1);                                           // промах: видели b и c
  const m2 = magnet(s);
  assert.ok([1, 2].includes(s.cards[m2.cards[0] ?? m2.extra[0]].key), 'снял виденную группу');
});

test('время: кончилось — поражение', () => {
  const s = newGame(base({ pressure: 'time' }), seeded(1));
  assert.equal(tick(s, s.timeLeft - 1), false);
  assert.equal(tick(s, 5), true);
  assert.ok(s.failed);
  const calm = newGame(base(), seeded(1));
  assert.equal(tick(calm, 1e9), false, 'в спокойном режиме времени нет');
});

// ---------- боты ----------

/** Бот с идеальной памятью: помнит всё, что видел (state.seen), и никогда не рискует зря. */
function perfectTurn(s, rng) {
  const alive = s.cards.map((c, i) => i).filter((i) => !s.cards[i].gone);
  const seen = alive.filter((i) => s.cards[i].seen);
  const unseen = alive.filter((i) => !s.cards[i].seen);
  const byKey = new Map();
  for (const i of seen) byKey.set(s.cards[i].key, [...(byKey.get(s.cards[i].key) ?? []), i]);
  const jokers = seen.filter((i) => s.cards[i].kind === 'joker');
  // известная полная группа (или джокер + любая виденная)
  for (const [key, list] of byKey) {
    if (key !== -1 && list.length >= s.group) return list.slice(0, s.group);
  }
  if (jokers.length && seen.some((i) => s.cards[i].kind !== 'joker')) return [jokers[0], seen.find((i) => s.cards[i].kind !== 'joker')];
  if (jokers.length >= 2) return jokers.slice(0, 2);
  // открываем новую; если её группа известна — добираем из известных, иначе — новые
  const pick = () => unseen.splice(Math.floor(rng() * unseen.length), 1)[0];
  const seq = [];
  let first = pick();
  seq.push(first);
  return { seq, pick, first };
}

function playPerfect(s, rng) {
  let guard = 0;
  while (!s.done && !s.failed && guard++ < 2000) {
    closeOpen(s);
    const plan = perfectTurn(s, rng);
    if (Array.isArray(plan)) {
      let ev;
      for (const i of plan) ev = flip(s, i);
      assert.equal(ev.type, 'match', 'известная группа обязана совпасть');
      continue;
    }
    let ev = flip(s, plan.first);
    while (ev?.type === 'open') {
      const card = s.cards[plan.first];
      const known = card.kind === 'joker'
        ? s.cards.map((c, i) => i).find((i) => !s.cards[i].gone && s.cards[i].seen && !s.open.includes(i))
        : s.cards.map((c, i) => i).find((i) => !s.cards[i].gone && s.cards[i].seen && !s.open.includes(i) && s.cards[i].key === card.key);
      const next = known ?? plan.pick();
      if (next == null) break;
      ev = flip(s, next);
    }
    if (ev?.type === 'miss') assert.equal(ev.mistake, false, 'идеальная память не ошибается');
  }
  return guard;
}

test('бот с идеальной памятью никогда не получает ошибку и всегда доигрывает (все уровни 1–40, все режимы)', () => {
  const rng = seeded(99);
  for (const pressure of ['calm', 'lives', 'time']) {
    for (let level = 1; level <= 40; level++) {
      const s = newLevel(level, { set: 'mix', pressure }, rng);
      const guard = playPerfect(s, rng);
      assert.ok(guard < 2000, 'партия закончилась');
      assert.ok(s.done, `уровень ${level} (${pressure}) пройден`);
      assert.equal(s.mistakes, 0);
      assert.equal(starsFor(s), 3);
      if (s.lives != null) assert.ok(s.lives >= 1);
    }
  }
});

test('случайный игрок тоже всегда доигрывает до конца (спокойный режим)', () => {
  const rng = seeded(7);
  for (let n = 0; n < 150; n++) {
    const size = SIZES[n % SIZES.length];
    const group = n % 4 === 0 && fits(size, 3) ? 3 : 2;
    const s = newGame(base({ cols: size.cols, rows: size.rows, group, specials: ['gold', 'eye', 'vortex', 'joker'] }), rng);
    let guard = 0;
    while (!s.done && guard++ < 20000) {
      const alive = s.cards.map((c, i) => i).filter((i) => canFlip(s, i) && !s.open.includes(i));
      flip(s, alive[Math.floor(rng() * alive.length)]);
    }
    assert.ok(s.done, `${size.id}/${group}`);
    assert.ok(s.mistakes <= s.misses);
  }
});

// ---------- уровни ----------

test('уровни: первые — по таблице, дальше — случайные, но у уровня N всегда одни и те же', () => {
  assert.deepEqual([1, 2, 6].map((l) => levelParams(l).size), ['3x4', '4x4', '3x4']);
  assert.equal(levelParams(6).group, 3, '6-й — «Тройки»');
  assert.equal(levelParams(1).mixSet, 'monsters', 'первый — монстрики');
  for (let level = 1; level <= 300; level++) {
    const p = levelParams(level);
    assert.deepEqual(levelParams(level), p, 'детерминированно');
    assert.ok(findSize(p.size) && fits(findSize(p.size), p.group), `уровень ${level}`);
    assert.ok(p.mixSet !== 'sounds', 'звуки — только в «Своей игре»');
    if (p.group === 3) assert.notEqual(p.mixSet, 'words');
    const s = newLevel(level, { set: 'mix', pressure: 'lives' }, seeded(level));
    assert.ok(isValidState(s), `уровень ${level}: состояние`);
  }
  assert.equal(newLevel(3, { set: 'sounds', pressure: 'calm' }).set !== 'sounds', true, 'звуки в уровнях заменяются');
});

test('звёзды по ошибкам', () => {
  const s = newGame(base({ cols: 6, rows: 6 }), seeded(1));      // 18 групп
  s.mistakes = 2;
  assert.equal(starsFor(s), 3);
  s.mistakes = 7;
  assert.equal(starsFor(s), 2);
  s.mistakes = 8;
  assert.equal(starsFor(s), 1);
});

// ---------- сохранение и статистика ----------

test('сохранение переживает JSON, битое — отбраковывается', () => {
  const s = newGame(base({ specials: ['joker', 'gold'], pressure: 'time' }), seeded(4));
  flip(s, 0);
  const copy = JSON.parse(JSON.stringify(s));
  assert.ok(isValidState(copy));
  assert.equal(isValidState({ ...copy, v: 2 }), false);
  assert.equal(isValidState({ ...copy, cards: copy.cards.slice(1) }), false);
  assert.equal(isValidState({ ...copy, pressure: 'hard' }), false);
  assert.equal(isValidState(null), false);
});

test('статистика: уровни, провалы, «Своя игра» по размеру', () => {
  let st = emptyStats();
  assert.ok(isValidStats(st));
  const lv = newLevel(4, { set: 'mix', pressure: 'calm' }, seeded(1));
  lv.done = true;
  st = recordGame(st, lv, 3);
  assert.equal(st.levelsCleared, 1);
  assert.equal(st.bestLevel, 4);
  assert.equal(st.stars, 3);
  assert.equal(st.perfect, 1);
  const free = newGame(base({ mode: 'free' }), seeded(2));
  free.done = true;
  free.moves = 12;
  st = recordGame(st, free, 2);
  free.moves = 10;
  st = recordGame(st, free, 2);
  assert.deepEqual(st.free['4x4:2'], { played: 2, bestMoves: 10 });
  const failed = newGame(base(), seeded(3));
  failed.failed = true;
  st = recordGame(st, failed, 0);
  assert.equal(st.fails, 1);
  assert.ok(isValidStats(st));
});

// ---------- звуки набора «Звуки» на поддельном AudioContext ----------


test('каждый звук набора «Звуки» играется, все узлы подключены', () => {
  const created = [];
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime(v) { assert.ok(v > 0); } });
  const node = (kind, extra = {}) => {
    const n = { kind, connections: 0, connect(t) { assert.ok(t); n.connections++; return t; }, start() {}, stop() {}, ...extra };
    created.push(n);
    return n;
  };
  const ctx = {
    currentTime: 0, sampleRate: 8000, destination: {},
    createGain: () => node('gain', { gain: param() }),
    createDynamicsCompressor: () => node('comp'),
    createBiquadFilter: () => node('filter', { frequency: param(), Q: param() }),
    createOscillator: () => node('osc', { frequency: param() }),
    createBufferSource: () => node('buffer'),
    createBuffer: (c, len) => ({ getChannelData: () => new Float32Array(len) }),
  };
  const sounds = createSounds(ctx);
  for (const s of SOUNDS) {
    assert.ok(sounds.has(s.id), `нет звука ${s.id}`);
    const before = created.length;
    sounds.play(s.id);
    const fresh = created.slice(before);
    assert.ok(fresh.some((n) => n.kind === 'osc' || n.kind === 'buffer'), s.id);
    for (const n of fresh) assert.ok(n.connections > 0, `${s.id}: ${n.kind} не подключён`);
  }
});
