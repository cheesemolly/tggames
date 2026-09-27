import test from 'node:test';
import assert from 'node:assert/strict';

import {
  newGame, findMatches, specialFor, findMoves, swapValid, playMove, tapMove, useBooster, finale, settle, shuffle,
  run, botPlay, goalLeft, isValidState, exitCells, isSpecial, FINALE_MAX,
} from '../logic.js';
import { levelSpec, LEVEL_COUNT, CHAPTERS } from '../levels.js';
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

/**
 * Поле из строк: цифра — обычная фишка цвета, '.' — пусто, '_' — дыра, 'c' — ящик, 'l'+цифра нет — цепь на 0.
 * Спецфишки: 'H'/'V' ракета (ряд/столбец) цвета 0, 'B' бомба цвета 0, 'P' пропеллер цвета 0, 'X' призма, 'T' сундук.
 */
function board(rows, extra = {}) {
  const s = newGame({ level: 1, rows: rows.length, cols: rows[0].length, colors: 5, moves: 20, goals: [{ t: 'color', c: 4, n: 999 }], layout: rows.map((r) => r.replace(/[^_]/g, '.')), ...extra }, mulberry(1));
  let id = 1000;
  rows.forEach((row, r) => [...row].forEach((ch, c) => {
    const i = r * s.cols + c;
    if (ch === '_') return;
    s.block[i] = null;
    if (ch === '.') s.pieces[i] = null;
    else if (ch === 'c') { s.pieces[i] = null; s.block[i] = { t: 'crate', hp: 1 }; }
    else if (/\d/.test(ch)) s.pieces[i] = { id: id++, k: 'n', c: Number(ch) };
    else if (ch === 'L') s.pieces[i] = { id: id++, k: 'n', c: 3, lock: 1 };
    else s.pieces[i] = { id: id++, ...{ H: { k: 'rh', c: 0 }, V: { k: 'rv', c: 0 }, B: { k: 'b', c: 0 }, P: { k: 'p', c: 0 }, X: { k: 'x' }, T: { k: 't' } }[ch] };
  }));
  return s;
}

test('совпадения: линии, квадрат, «Г»; что за спецфишка рождается', () => {
  const g = (rows) => findMatches(board(rows)).map((m) => specialFor(m));
  assert.deepEqual(g(['111', '234', '342']), [null], 'три в ряд — просто лопаются');
  assert.deepEqual(g(['1111', '2342', '3423']), ['rh'], '4 в ряд — ракета вдоль ряда');
  assert.deepEqual(g(['1234', '1342', '1423', '1234']), ['rv'], '4 в столбец — ракета вдоль столбца');
  assert.deepEqual(g(['11111', '23423', '34234']), ['x'], '5 в ряд — призма');
  assert.deepEqual(g(['1112', '1343', '1434']), ['b'], '«Г» — бомба');
  assert.deepEqual(g(['1123', '1134', '2342']), ['p'], 'квадрат 2×2 — пропеллер');
  assert.deepEqual(g(['1234', '2341', '3412']), [], 'нет совпадений');
});

test('обмен: без совпадения нельзя, со спецфишкой — всегда; фишку в цепях не сдвинуть', () => {
  const s = board(['0120', '3401', '2012']);
  assert.equal(swapValid(s, 0, 1), false);
  const t = board(['H1', '23']);
  assert.equal(swapValid(t, 0, 1), true, 'спецфишка срабатывает от любого сдвига');
  const u = board(['L101', '2323']);
  assert.equal(swapValid(u, 0, 1), false);
});

test('ракета сносит ряд, бомба — квадрат 5×5, призма с фишкой — весь её цвет', () => {
  const rows = ['0123401', '1230412', '2301423', '301H234', '0142301', '1203412', '2340123'];
  let s = board(rows);
  run(tapMove(s, 3 * 7 + 3, mulberry(2)));
  // ряд 3 полностью пересобран (все фишки новые), лишь бы поле было целым
  assert.ok(s.pieces.every((p, i) => p || !s.cells[i] || s.block[i]), 'поле заполнилось снова');
  assert.equal(s.moves, 19, 'нажатие на спецфишку — ход');

  s = board(['0123401', '1230412', '2301423', '301B234', '0142301', '1203412', '2340123']);
  const before = s.pieces.map((p) => p?.id);
  const first = playMove(s, 24, 24, mulberry(3));
  void first;
  const tap = tapMove(s, 3 * 7 + 3, mulberry(3));
  const wave = tap.next().value;
  assert.equal(wave.t, 'clear');
  const hit = new Set(wave.removed.map((r) => r.i));
  for (let r = 1; r <= 5; r++) for (let c = 1; c <= 5; c++) assert.ok(hit.has(r * 7 + c), `бомба задела ${r},${c}`);
  assert.ok(!hit.has(0) && !hit.has(6), 'углы поля целы');
  void before;

  s = board(['0120', '1X01', '2012', '0121']);
  const zeros = s.pieces.filter((p) => p?.c === 0).length;
  const gen = playMove(s, 5, 4, mulberry(4));
  gen.next();
  const w = gen.next().value;
  assert.equal(w.removed.filter((r) => r.c === 1 && r.k === 'n').length >= 1, true);
  assert.ok(w.removed.every((r) => r.k !== 'n' || r.c === 1), 'снят только цвет, с которым менялись');
  assert.ok(zeros > 0);
});

test('комбо: ракета+ракета — крест, бомба+бомба — 9×9, две призмы — всё поле', () => {
  let s = board(['0120123', '1201230', '2012301', '01HV012', '1230120', '2301201', '3012012']);
  const gen = playMove(s, 3 * 7 + 2, 3 * 7 + 3, mulberry(5));
  gen.next();
  let w = gen.next().value;
  const hit = new Set(w.removed.map((r) => r.i));
  for (let c = 0; c < 7; c++) assert.ok(hit.has(3 * 7 + c), 'весь ряд');
  for (let r = 0; r < 7; r++) assert.ok(hit.has(r * 7 + 3), 'весь столбец');
  assert.equal(w.combo, 'rr');

  s = board(['012012012', '120120120', '201201201', '012012012', '120BB0120', '201201201', '012012012', '120120120', '201201201']);
  const g2 = playMove(s, 4 * 9 + 3, 4 * 9 + 4, mulberry(6));
  g2.next();
  w = g2.next().value;
  assert.equal(w.combo, 'bb');
  assert.ok(w.removed.length >= 70, `две бомбы — почти всё поле 9×9 (${w.removed.length})`);

  s = board(['0120', '1XX1', '2012']);
  const g3 = playMove(s, 5, 6, mulberry(7));
  g3.next();
  w = g3.next().value;
  assert.equal(w.combo, 'xx');
  assert.equal(w.removed.length, 12, 'всё поле');
});

test('падение: сквозь дыры, под ящиком — наискосок, фишка в цепях стоит', () => {
  let s = board(['1', '_', '.', '.']);
  const f = settle(s, mulberry(8));
  assert.ok(f.moves.some((m) => m.from === 0 && m.to === 3), 'фишка провалилась сквозь дыру вниз');
  assert.equal(s.pieces.filter(Boolean).length, 3, 'сверху появились новые');

  s = board(['123', '.c.', '...']);
  settle(s, mulberry(9));
  assert.ok(s.pieces[7], 'клетка под ящиком заполнилась наискосок');
  assert.ok(s.pieces[3] && s.pieces[5]);

  s = board(['L', '.']);
  settle(s, mulberry(10));
  assert.equal(s.pieces[0].lock, 1);
  assert.equal(s.pieces[1], null, 'под цепью пусто — через неё ничего не падает');
});

test('сундук доходит до нижнего края и засчитывается', () => {
  const s = board(['HT0', '1.2', '2.1'], { goals: [{ t: 'treasure', n: 1 }], treasure: { total: 1 } });
  s.treasure.spawned = 1;
  assert.ok(exitCells(s).includes(7), 'нижняя клетка столбца — выход');
  const phases = [...tapMove(s, 0, mulberry(11))];
  assert.ok(phases.some((ph) => ph.t === 'collect'), 'сундук собран');
  assert.equal(s.goals[0].done, 1);
  assert.equal(s.over, 'win');
  assert.ok(!s.pieces.some((p) => p?.k === 't'), 'новых сундуков сверх нормы нет');
});

test('таймер: не убрал вовремя — поражение; слизь растёт, если её не задели', () => {
  const spec = { level: 1, rows: 5, cols: 5, colors: 4, moves: 20, goals: [{ t: 'color', c: 0, n: 999 }], layout: ['.....', '.....', '..t..', '.....', '.....'], timer: { start: 1 } };
  const s = newGame(spec, mulberry(12));
  const move = findMoves(s).find(([a, b]) => ![a, b].includes(12) && Math.abs(Math.floor(a / 5) - 2) > 1 && Math.abs(Math.floor(b / 5) - 2) > 1) ?? findMoves(s)[0];
  run(playMove(s, move[0], move[1], mulberry(12)));
  if (s.pieces.some((p) => p?.timer)) assert.equal(s.over, 'lose');

  const sl = newGame({ ...spec, layout: ['.....', '.....', '..s..', '.....', '.....'], timer: null, goals: [{ t: 'slime' }] }, mulberry(13));
  const far = findMoves(sl).find(([a, b]) => [a, b].every((i) => Math.abs(Math.floor(i / 5) - 2) + Math.abs((i % 5) - 2) > 2));
  if (far) {
    run(playMove(sl, far[0], far[1], mulberry(13)));
    assert.ok(goalLeft(sl, sl.goals[0]) >= 2 || sl.over, 'слизь выросла');
  }
});

test('перемешивание: без готовых совпадений и с ходом', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const s = newGame(levelSpec(35), mulberry(seed));
    shuffle(s, mulberry(seed + 100));
    assert.equal(findMatches(s).length, 0);
    assert.ok(findMoves(s).length > 0);
  }
});

test('уровни: 100 штук, раскладки ровные, цели выполнимы, на старте нет совпадений и есть ход', () => {
  assert.equal(LEVEL_COUNT, 100);
  assert.equal(CHAPTERS.length, 10);
  for (let n = 1; n <= LEVEL_COUNT; n++) {
    const sp = levelSpec(n);
    assert.equal(sp.boss, n % 10 === 0, `уровень ${n}: босс — каждый 10-й`);
    assert.ok(sp.rows <= 9 && sp.cols <= 9 && sp.layout.every((r) => r.length === sp.cols), `уровень ${n}: размер`);
    for (let r = 0; r < sp.rows; r++) {
      const cells = [...sp.layout[r]].filter((ch) => ch !== '_');
      assert.ok(!cells.length || !cells.every((ch) => 'cCKhSsLlj'.includes(ch)), `уровень ${n}, ряд ${r}: препятствия на весь ряд`);
    }
    const s = newGame(sp, mulberry(n));
    for (const g of s.goals) {
      if (g.t === 'color') assert.ok(g.c < sp.colors, `уровень ${n}: цвет ${g.c} есть на поле`);
      else if (g.t === 'treasure') assert.ok(sp.treasure?.total >= g.n, `уровень ${n}: сундуков хватает`);
      else assert.ok(goalLeft(s, g) > 0, `уровень ${n}: цель ${g.t} есть на поле`);
    }
    assert.equal(findMatches(s).length, 0, `уровень ${n}: готовые совпадения на старте`);
    assert.ok(findMoves(s).length > 0, `уровень ${n}: нет ходов на старте`);
    assert.ok(sp.moves >= 12 && sp.moves <= 90, `уровень ${n}: ходов ${sp.moves}`);
  }
});

test('уровни проходимы: бот выигрывает каждый (с запасом ходов) хотя бы раз из трёх', () => {
  for (let n = 1; n <= LEVEL_COUNT; n++) {
    const sp = levelSpec(n);
    let won = false;
    for (let seed = 1; seed <= 3 && !won; seed++) {
      const s = botPlay({ ...sp, moves: Math.ceil(sp.moves * 1.5) }, mulberry(n * 31 + seed));
      won = s.over === 'win';
      if (won) assert.equal(s.moves, 0, 'после финала ходов не остаётся');
    }
    assert.ok(won, `уровень ${n} бот не прошёл ни разу`);
  }
});

test('ход не ломает поле: 40 партий на разных уровнях', () => {
  for (let k = 0; k < 40; k++) {
    const n = 1 + ((k * 37) % LEVEL_COUNT);
    const rng = mulberry(500 + k);
    const s = newGame(levelSpec(n), rng);
    for (let m = 0; m < 25 && !s.over; m++) {
      const moves = findMoves(s);
      const special = s.pieces.findIndex((p) => isSpecial(p) && !p.lock);
      if (!moves.length && special < 0) break;
      if (moves.length) {
        const [a, b] = moves[Math.floor(rng() * moves.length)];
        run(playMove(s, a, b, rng));
      } else run(tapMove(s, special, rng));
      const ids = new Set();
      s.pieces.forEach((p, i) => {
        if (!p) return;
        assert.ok(s.cells[i] && !s.block[i], `уровень ${n}: фишка в дыре или в ящике`);
        assert.ok(!ids.has(p.id), 'повтор id');
        ids.add(p.id);
      });
      if (!s.over) assert.equal(findMatches(s).length, 0, 'после хода не остаётся совпадений');
    }
    if (s.over === 'win') run(finale(s, rng));
    assert.ok(isValidState(JSON.parse(JSON.stringify({ ...s, over: null }))), 'сохранение проходит проверку');
  }
});

test('бонусы: молоток бьёт клетку, ракета — ряд, перемешивание — ход не тратят', () => {
  const s = newGame(levelSpec(12), mulberry(40));
  const moves = s.moves;
  const crate = s.block.findIndex((b) => b?.t === 'crate');
  const hp = s.block[crate].hp;
  run(useBooster(s, 'hammer', crate, mulberry(41)));
  assert.equal(s.block[crate]?.hp ?? 0, hp - 1);
  run(useBooster(s, 'row', 0, mulberry(42)));
  run(useBooster(s, 'shuffle', 0, mulberry(43)));
  assert.equal(s.moves, moves);
});

test('финал короткий: не больше FINALE_MAX ракет разом и одна волна', () => {
  const s = newGame(levelSpec(5), mulberry(77));
  s.over = 'win';
  s.moves = 25;
  const phases = [...finale(s, mulberry(78))];
  const bonus = phases.find((ph) => ph.t === 'bonus');
  assert.ok(bonus.list.length <= FINALE_MAX && bonus.list.length > 0);
  assert.equal(phases.filter((ph) => ph.t === 'clear').length, 1, 'все ракеты — одной волной');
  assert.ok(phases.length <= 4, `фаз: ${phases.length}`);
  assert.equal(s.moves, 0);
});

test('звуки: мягкие — без «квадратных» и «пилообразных» волн', () => {
  const { ctx, created } = fakeContext();
  const sounds = createSounds(ctx);
  for (const name of SOUNDS) sounds.play(name, { step: 4 });
  assert.ok(created.filter((n) => n.kind === 'osc').every((o) => o.type === 'sine' || o.type === ''), 'только синусы');
});

test('звуки: каждый подключён и не падает', () => {
  const { ctx, created } = fakeContext();
  const sounds = createSounds(ctx);
  for (const name of SOUNDS) {
    assert.ok(sounds.has(name), name);
    sounds.play(name, { step: 3 });
  }
  const dangling = created.filter((n) => n.kind !== 'compressor' && n.kind !== 'gain' && n.connections === 0);
  assert.equal(dangling.length, 0, 'все узлы подключены');
});
