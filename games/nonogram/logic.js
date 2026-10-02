// Правила нонограммы без DOM: партия (клетки игрока, ошибки, подсказки, время, отмена), ход кистью по линии,
// погашенные числа подсказок, автокрестики в решённых линиях, победа, подсказка-линия, сохранение, прогресс.
//
// Клетка игрока: 0 — пусто (не тронута), 1 — закрашена, 2 — крестик (игрок решил, что пусто).
// Режим «Проверять ходы» (по умолчанию): закрашенная не там клетка — ошибка (+1, клетка становится крестиком с
// пометкой), крестик на закрашиваемой — тоже ошибка (клетка закрашивается). Без проверки — как на бумаге: победа,
// когда закрашено ровно то, что задумано (по подсказкам: при единственном решении это одно и то же).

import { cluesOfGrid, cluesOf, solveLine } from './solver.js';

export const EMPTY = 0;
export const FILL = 1;
export const CROSS = 2;
export const HINTS = 3;

/** Маска уровня — что закрашивать: mask ('#'), а если её нет — весь рисунок (символ '.' — пусто). */
export function maskOf(level) {
  if (level.mask) return level.mask.map((row) => [...row].map((ch) => (ch === '#' ? 1 : 0)));
  return level.art.map((row) => [...row].map((ch) => (ch === '.' ? 0 : 1)));
}

const cache = new WeakMap();

/** Решение и подсказки уровня (кэш). */
export function prepare(level) {
  let p = cache.get(level);
  if (!p) {
    const mask = maskOf(level);
    p = { w: mask[0].length, h: mask.length, solution: mask.flat(), clues: cluesOfGrid(mask) };
    cache.set(level, p);
  }
  return p;
}

export function newRun(level, id) {
  const { w, h } = prepare(level);
  return { v: 1, id, cells: new Array(w * h).fill(EMPTY), wrong: [], mistakes: 0, hints: HINTS, time: 0, done: false };
}

const lineIdx = (w, h, kind, k) => (kind === 'row'
  ? Array.from({ length: w }, (_, x) => k * w + x)
  : Array.from({ length: h }, (_, y) => y * w + k));

/**
 * Поставить в клетку i значение value (FILL / CROSS / EMPTY). check — режим проверки ходов.
 * → { i, from, to, mistake } — что произошло (для отмены и анимации); null — ничего не изменилось.
 */
export function setCell(run, level, i, value, { check = true } = {}) {
  if (run.done) return null;
  const { solution } = prepare(level);
  const from = run.cells[i];
  if (from === value) return null;
  if (check && run.wrong.includes(i)) return null;            // ошибка уже показана — клетка закреплена
  if (check && value !== EMPTY) {
    const right = solution[i] === 1 ? FILL : CROSS;
    if (value !== right) {
      run.mistakes++;
      run.wrong.push(i);
      run.cells[i] = right;
      return { i, from, to: right, mistake: true };
    }
  }
  run.cells[i] = value;
  return { i, from, to: value, mistake: false };
}

/** Отменить изменения (в обратном порядке). Ошибки не отменяются — как в Nonogram.com. */
export function undoChanges(run, changes) {
  for (let k = changes.length - 1; k >= 0; k--) {
    const c = changes[k];
    if (c.mistake) continue;
    run.cells[c.i] = c.from;
  }
}

/** Клетки отрезка кисти от a до b: по строке или по столбцу (направление — по большему сдвигу). */
export function strokeCells(w, a, b) {
  const ax = a % w;
  const ay = Math.floor(a / w);
  const bx = b % w;
  const by = Math.floor(b / w);
  const out = [];
  if (Math.abs(bx - ax) >= Math.abs(by - ay)) {
    const step = bx >= ax ? 1 : -1;
    for (let x = ax; x !== bx + step; x += step) out.push(ay * w + x);
  } else {
    const step = by >= ay ? 1 : -1;
    for (let y = ay; y !== by + step; y += step) out.push(y * w + ax);
  }
  return out;
}

/**
 * Что делает кисть, начатая на клетке со значением start инструментом tool: закрашенную кистью «закрасить» —
 * стирает, пустую — закрашивает; крестик — так же. → значение, которое ставится в клетки отрезка.
 */
export function brushValue(start, tool) {
  if (tool === FILL) return start === FILL ? EMPTY : FILL;
  return start === CROSS ? EMPTY : CROSS;
}

/** Кисть меняет только подходящие клетки: ставит в пустые; стирает только такие же (закраску — не крестики). */
export function brushApplies(cell, value, erasing) {
  if (erasing) return cell === erasing;
  return cell === EMPTY && value !== EMPTY;
}

// ---------- подсказки-числа ----------

/** Значения линии игрока: 1 — закрашено, 0 — крестик (известно пусто), -1 — не тронуто. */
function playerLine(run, idx) {
  return idx.map((i) => (run.cells[i] === FILL ? 1 : run.cells[i] === CROSS ? 0 : -1));
}

/**
 * Какие числа подсказки линии уже выполнены (гасятся). Закрашенное совпало с подсказкой целиком — все. Иначе с
 * краёв, пока клетки известны (закраска или крестик): отрезок, закрытый крестиком или краем и равный очередному
 * числу, гасит его; нетронутая клетка останавливает счёт с этой стороны.
 */
export function doneNumbers(line, clue) {
  const n = line.length;
  const done = new Array(clue.length).fill(false);
  const runs = cluesOf(line.map((v) => (v === 1 ? 1 : 0)));
  if (runs.length === clue.length && runs.every((r, k) => r === clue[k])) return done.fill(true);
  let k = 0;
  let i = 0;
  while (i < n && line[i] !== -1 && k < clue.length) {
    if (line[i] === 0) {
      i++;
      continue;
    }
    let e = i;
    while (e < n && line[e] === 1) e++;
    if ((e < n && line[e] === -1) || e - i !== clue[k]) break;
    done[k++] = true;
    i = e;
  }
  let j = clue.length - 1;
  i = n - 1;
  while (i >= 0 && line[i] !== -1 && j >= k) {
    if (line[i] === 0) {
      i--;
      continue;
    }
    let s = i;
    while (s >= 0 && line[s] === 1) s--;
    if ((s >= 0 && line[s] === -1) || i - s !== clue[j]) break;
    done[j--] = true;
    i = s;
  }
  return done;
}

/** Погашенные числа всех строк и столбцов: { rows: [[bool]], cols: [[bool]] }. */
export function doneClues(run, level) {
  const { w, h, clues } = prepare(level);
  return {
    rows: clues.rows.map((c, y) => doneNumbers(playerLine(run, lineIdx(w, h, 'row', y)), c)),
    cols: clues.cols.map((c, x) => doneNumbers(playerLine(run, lineIdx(w, h, 'col', x)), c)),
  };
}

/**
 * Автокрестики: в строках и столбцах, где закрашенное уже совпадает с подсказкой (и, при проверке ходов, с
 * решением), нетронутые клетки становятся крестиками. → индексы новых крестиков.
 */
export function autoCross(run, level, lines, { check = true } = {}) {
  const { w, h, clues, solution } = prepare(level);
  const out = [];
  for (const [kind, k] of lines) {
    const idx = lineIdx(w, h, kind, k);
    const filled = idx.map((i) => (run.cells[i] === FILL ? 1 : 0));
    const clue = kind === 'row' ? clues.rows[k] : clues.cols[k];
    const runs = cluesOf(filled);
    if (runs.length !== clue.length || runs.some((r, q) => r !== clue[q])) continue;
    if (check && idx.some((i) => (run.cells[i] === FILL) !== (solution[i] === 1))) continue;
    for (const i of idx) {
      if (run.cells[i] === EMPTY) {
        run.cells[i] = CROSS;
        out.push(i);
      }
    }
  }
  return out;
}

/** Решено ли: закрашено ровно то, что в решении. */
export function isSolved(run, level) {
  const { solution } = prepare(level);
  return run.cells.every((c, i) => (c === FILL) === (solution[i] === 1));
}

/**
 * Подсказка: линия, в которой по уже известному (закраска и крестики игрока, неверное считается неизвестным)
 * разбор находит новые клетки; из таких — с наибольшим числом новых. → { kind, k, cells: [{ i, v }] } или null.
 * Сначала — неверно закрашенные клетки (без проверки ходов они возможны): { kind: 'wrong', cells }.
 */
export function hintLine(run, level) {
  const { w, h, clues, solution } = prepare(level);
  const bad = [];
  run.cells.forEach((c, i) => {
    if ((c === FILL && solution[i] !== 1) || (c === CROSS && solution[i] === 1)) bad.push(i);
  });
  if (bad.length) return { kind: 'wrong', cells: bad.map((i) => ({ i, v: solution[i] })) };
  let best = null;
  const consider = (kind, k) => {
    const idx = lineIdx(w, h, kind, k);
    const line = playerLine(run, idx);
    const res = solveLine(line, kind === 'row' ? clues.rows[k] : clues.cols[k]);
    if (!res) return;
    const cells = [];
    idx.forEach((i, q) => {
      if (line[q] === -1 && res[q] !== -1) cells.push({ i, v: res[q] });
    });
    if (cells.length && (!best || cells.length > best.cells.length)) best = { kind, k, cells };
  };
  for (let y = 0; y < h; y++) consider('row', y);
  for (let x = 0; x < w; x++) consider('col', x);
  return best;
}

// ---------- сохранение и прогресс ----------

export function serializeRun(run) {
  return { ...run, cells: run.cells.join(''), time: Math.round(run.time) };
}

export function isValidRun(s, levels) {
  if (!s || typeof s !== 'object' || s.v !== 1) return false;
  if (!Number.isInteger(s.id) || s.id < 0 || s.id >= levels.length) return false;
  const { w, h } = prepare(levels[s.id]);
  if (typeof s.cells !== 'string' || s.cells.length !== w * h || !/^[0-2]*$/.test(s.cells)) return false;
  if (!Array.isArray(s.wrong) || !s.wrong.every((i) => Number.isInteger(i) && i >= 0 && i < w * h)) return false;
  return [s.mistakes, s.hints].every((v) => Number.isInteger(v) && v >= 0 && v <= 999)
    && Number.isFinite(s.time) && s.time >= 0 && typeof s.done === 'boolean';
}

export function deserializeRun(s, levels) {
  if (!isValidRun(s, levels)) return null;
  return { ...s, cells: [...s.cells].map(Number), wrong: [...s.wrong] };
}

/**
 * Прогресс: done[k] — 0 не решён, 1 решён, 2 решён чисто (без ошибок и подсказок); best[k] — лучшее время, мс
 * (0 — нет). Слияние между устройствами: done — максимум, best — минимум без нуля.
 */
export const emptyProgress = (n) => ({ v: 1, done: new Array(n).fill(0), best: new Array(n).fill(0) });

export function normalizeProgress(p, n) {
  const out = emptyProgress(n);
  if (!p || typeof p !== 'object') return out;
  for (let k = 0; k < n; k++) {
    const d = p.done?.[k];
    const b = p.best?.[k];
    if (d === 1 || d === 2) out.done[k] = d;
    if (Number.isFinite(b) && b > 0) out.best[k] = Math.round(b);
  }
  return out;
}

export function recordSolve(progress, k, { ms, clean }) {
  progress.done[k] = Math.max(progress.done[k], clean ? 2 : 1);
  if (ms > 0 && (!progress.best[k] || ms < progress.best[k])) progress.best[k] = Math.round(ms);
  return progress;
}

export const solvedCount = (progress) => progress.done.filter((d) => d > 0).length;

/** Уровень открыт: первые OPEN_AHEAD — сразу, дальше — когда решено достаточно предыдущих (не строго по одному). */
export const OPEN_AHEAD = 3;
export function isOpen(progress, k) {
  if (progress.done[k]) return true;
  let solvedBefore = 0;
  for (let q = 0; q < k; q++) if (progress.done[q]) solvedBefore++;
  return k - solvedBefore < OPEN_AHEAD;
}

export const defaultSettings = () => ({ check: true, autoCross: true, skin: 'telegram', highlight: true });
export const SKINS = ['telegram', 'paper', 'night', 'mint', 'sakura', 'classic'];

export function normalizeSettings(s) {
  const d = defaultSettings();
  if (!s || typeof s !== 'object') return d;
  return {
    check: s.check !== false,
    autoCross: s.autoCross !== false,
    highlight: s.highlight !== false,
    skin: SKINS.includes(s.skin) ? s.skin : d.skin,
  };
}

export function fmtTime(ms) {
  const t = Math.floor(ms / 1000);
  const m = Math.floor(t / 60);
  const h = Math.floor(m / 60);
  const s = String(t % 60).padStart(2, '0');
  return h ? `${h}:${String(m % 60).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
