import test from 'node:test';
import assert from 'node:assert/strict';

import {
  newGame, play, undo, lineThrough, botMove, findVcf, isValidState, emptyStats, isValidStats, recordGame,
} from '../logic.js';
import { createSounds, SOUNDS } from '../sounds.js';
import { fakeContext } from '../../../shared/tests/fake-audio.js';

function mulberry(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Поставить фишки: xs — крестики, os — нолики (номера клеток); ход — за тем, кому положено. */
function position(setup, xs, os) {
  const s = newGame(setup);
  for (const i of xs) s.cells[i] = 1;
  for (const i of os) s.cells[i] = 2;
  s.history = [...xs, ...os];
  s.turn = xs.length > os.length ? 2 : 1;
  return s;
}

test('3×3: три в ряд по строке, столбцу и диагонали; ничья на полном поле', () => {
  for (const line of [[0, 1, 2], [2, 5, 8], [0, 4, 8], [2, 4, 6]]) {
    const s = newGame({ mode: 'classic', vs: 'friend' });
    const others = [0, 1, 2, 3, 4, 5, 6, 7, 8].filter((i) => !line.includes(i));
    play(s, line[0]);
    play(s, others[0]);
    play(s, line[1]);
    play(s, others[1]);
    play(s, line[2]);
    assert.equal(s.over.winner, 1);
    assert.deepEqual(s.over.line, line);
  }
  const d = newGame({ mode: 'classic', vs: 'friend' });
  for (const i of [0, 1, 2, 4, 3, 5, 7, 6, 8]) play(d, i);
  assert.deepEqual(d.over, { draw: true });
  assert.equal(play(d, 0), false, 'после конца партии ходить нельзя');
});

test('гомоку: пять в ряд — победа, шесть тоже; четыре — нет; линия целиком', () => {
  const s = newGame({ mode: 'gomoku', size: 15, vs: 'friend' });
  const row = [93, 94, 95, 96];          // строка 6, столбцы 3–6
  for (const i of row) {
    play(s, i);
    play(s, i + 30);
  }
  assert.equal(s.over, null);
  play(s, 98);                         // пропуск — не пятёрка
  assert.equal(s.over, null);
  play(s, 140);
  play(s, 97);                         // 93–98: шесть подряд
  assert.equal(s.over.winner, 1);
  assert.deepEqual(s.over.line, [93, 94, 95, 96, 97, 98]);
  const diag = position({ mode: 'gomoku', size: 10, vs: 'friend' }, [0, 11, 22, 33, 44], [9, 19, 29, 39]);
  assert.deepEqual(lineThrough(diag, 22), [0, 11, 22, 33, 44]);
});

test('отмена: ход убирается, очередь возвращается', () => {
  const s = newGame({ mode: 'classic', vs: 'friend' });
  play(s, 4);
  play(s, 0);
  undo(s, 1);
  assert.equal(s.cells[0], 0);
  assert.equal(s.turn, 2);
  undo(s, 1);
  assert.equal(s.turn, 1);
  assert.deepEqual(s.history, []);
});

test('3×3 «Сложный» не проигрывает никогда — ни случайным ходам, ни себе', () => {
  for (let g = 0; g < 300; g++) {
    const rng = mulberry(g + 1);
    const botSide = g % 2 ? 1 : 2;
    const s = newGame({ mode: 'classic', level: 'hard', vs: 'bot', player: 3 - botSide });
    while (!s.over) {
      let i;
      if (s.turn === botSide) i = botMove(s, rng);
      else {
        const empty = s.cells.map((v, k) => (v ? -1 : k)).filter((k) => k >= 0);
        i = empty[Math.floor(rng() * empty.length)];
      }
      play(s, i);
    }
    assert.ok(s.over.draw || s.over.winner === botSide, `партия ${g}: бот проиграл`);
  }
  const self = newGame({ mode: 'classic', level: 'hard', vs: 'bot', player: 1 });
  while (!self.over) play(self, botMove(self, mulberry(9)));
  assert.ok(self.over.draw, 'два идеальных игрока — ничья');
});

test('гомоку: бот ставит пятую и закрывает чужую четвёрку (на любом уровне, кроме лёгкого)', () => {
  for (const level of ['medium', 'hard']) {
    // своя четвёрка (крестики ходят) — ставит пятую
    let s = position({ mode: 'gomoku', size: 15, level, vs: 'bot', player: 2 }, [60, 61, 62, 63], [75, 76, 77]);
    s.turn = 1;
    const w = botMove(s, mulberry(1));
    assert.ok([59, 64].includes(w), `${level}: пятая — ${w}`);
    // чужая четвёрка с одним концом — закрывает
    s = position({ mode: 'gomoku', size: 15, level, vs: 'bot', player: 1 }, [60, 61, 62, 63, 120], [59, 100, 101]);
    s.turn = 2;
    assert.equal(botMove(s, mulberry(2)), 64, `${level}: закрыл четвёрку`);
  }
});

test('гомоку «Сложный»: находит победу четвёрками (VCF)', () => {
  // крестики: две «тройки» с общей клеткой — ход в неё даёт двойную четвёрку
  const s = position({ mode: 'gomoku', size: 15, level: 'hard', vs: 'bot', player: 2 },
    [16 * 1 + 2 * 15, 3 + 2 * 15, 4 + 2 * 15, 6 + 5 * 15, 6 + 6 * 15, 6 + 7 * 15], [200, 201, 202, 180, 181, 182]);
  s.turn = 1;
  assert.ok(findVcf(s, 1) >= 0, 'цепочка четвёрок найдена');
  const move = botMove(s, mulberry(3));
  s.cells[move] = 1;
  s.history.push(move);
  s.turn = 2;
  // после его хода у соперника нет способа остановить выигрыш четвёрками
  assert.ok(findVcf(s, 1) >= 0 || lineThrough({ ...s }, move), 'угроза сохранилась');
});

test('гомоку: уровни по силе — средний обыгрывает лёгкого, сложный — среднего', () => {
  const match = (a, b, games) => {
    let wa = 0;
    let wb = 0;
    for (let g = 0; g < games; g++) {
      const rng = mulberry(100 + g);
      const s = newGame({ mode: 'gomoku', size: 15, level: a, vs: 'bot', player: 1 });
      const aSide = g % 2 ? 1 : 2;
      while (!s.over) {
        s.level = s.turn === aSide ? a : b;
        play(s, botMove(s, rng));
      }
      if (s.over.winner === aSide) wa++;
      else if (s.over.winner) wb++;
    }
    return [wa, wb];
  };
  const [m, e] = match('medium', 'easy', 10);
  assert.ok(m >= 8 && m > e, `средний против лёгкого ${m}:${e}`);
  const [h, md] = match('hard', 'medium', 16);
  assert.ok(h > md * 1.5, `сложный против среднего ${h}:${md}`);
});

test('сохранение и статистика', () => {
  const s = newGame({ mode: 'gomoku', size: 13, level: 'easy', vs: 'bot', player: 1 });
  play(s, 84);
  assert.ok(isValidState(JSON.parse(JSON.stringify(s))));
  assert.equal(isValidState({ ...s, size: 12 }), false);
  assert.equal(isValidState({ ...s, history: [1] }), false);
  let st = emptyStats();
  assert.ok(isValidStats(st));
  const won = { ...s, over: { winner: 1, line: [] } };
  st = recordGame(st, won);
  st = recordGame(st, won);
  st = recordGame(st, { ...s, over: { winner: 2, line: [] } });
  assert.equal(st.gomoku.easy.wins, 2);
  assert.equal(st.gomoku.easy.losses, 1);
  assert.equal(st.bestStreak, 2);
  assert.equal(st.streak, 0);
  st = recordGame(st, { ...newGame({ mode: 'classic', vs: 'friend' }), over: { draw: true } });
  assert.equal(st.friend.draws, 1);
  assert.ok(isValidStats(st));
});

test('звуки подключены', () => {
  const { ctx, created } = fakeContext();
  const sounds = createSounds(ctx);
  for (const name of SOUNDS) {
    assert.ok(sounds.has(name));
    sounds.play(name);
  }
  assert.equal(created.filter((n) => n.kind !== 'compressor' && n.kind !== 'gain' && n.connections === 0).length, 0);
});
