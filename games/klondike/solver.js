// Решатель Косынки: ищет, как собрать все карты в «дома». Нужен, чтобы в игру попадали только решаемые раскладки —
// банк зёрен deals.json собирается заранее (tools/generate-bank.js), в партии решатель не работает.
//
// Поиск в глубину с возвратом (своим стеком). Перед каждым выбором — «безопасные» ходы в «дом», без ветвления:
// туз и двойка всегда, дальше карта, если обе масти другого цвета в «домах» уже дошли до её достоинства − 1
// (такая карта в столбцах больше никому не нужна). Потом ходы по порядку: в «дом» с открытием карты, открыть закрытую
// карту, со сброса в столбец, король в пустой столбец, в «дом», колода (открыть / перевернуть). Из «дома» не берём.
// Уже виденные позиции не повторяются (столбцы отсортированы между собой — от их порядка решаемость не зависит;
// колода и сброс — как есть: при раздаче по три важен порядок). Предел узлов — безнадёжную раскладку не считаем вечно.

import { COLUMNS, isUp, rankOf, suitOf, isRed, canPick, firstUp, canDropOnColumn, foundationFor, move, draw, undo, isWon } from './logic.js';

const keyOf = (s) => `${s.cols.map((c) => c.join(',')).sort().join('|')}#${s.found.map((f) => f.length).join(',')}#${s.stock.join(',')}#${s.waste.join(',')}`;

/** Можно ли отправить карту в «дом», не боясь, что она ещё понадобится в столбцах. */
function safeHome(s, c) {
  const r = rankOf(c);
  if (r <= 2) return true;
  const red = isRed(c);
  let need = 0;
  for (const f of s.found) {
    if (!f.length) continue;
    if (isRed(f[0]) !== red && f.length >= r - 1) need += 1;
  }
  return need >= 2;
}

/** Безопасные ходы в «дом» подряд. → сколько сделано (для отмены). */
function autoHome(s) {
  let n = 0;
  for (let changed = true; changed;) {
    changed = false;
    const sources = [];
    if (s.waste.length) sources.push({ from: { k: 'w' }, index: s.waste.length - 1 });
    for (let i = 0; i < COLUMNS; i++) if (s.cols[i].length) sources.push({ from: { k: 't', i }, index: s.cols[i].length - 1 });
    for (const { from, index } of sources) {
      const list = from.k === 'w' ? s.waste : s.cols[from.i];
      const c = list[list.length - 1];
      if (!safeHome(s, c)) continue;
      const f = foundationFor(s, c);
      if (f < 0) continue;
      move(s, from, index, { k: 'f', i: f });
      n += 1;
      changed = true;
      break;
    }
  }
  return n;
}

/** Ходы для поиска в порядке попытки. */
function searchMoves(s) {
  const home = [];
  const reveal = [];
  const fromWaste = [];
  const king = [];
  const other = [];
  if (s.waste.length) {
    const c = s.waste[s.waste.length - 1];
    const f = foundationFor(s, c);
    if (f >= 0) home.push([{ k: 'w' }, s.waste.length - 1, { k: 'f', i: f }]);
    for (let i = 0; i < COLUMNS; i++) {
      if (canDropOnColumn(s.cols[i], c)) (s.cols[i].length ? fromWaste : king).push([{ k: 'w' }, s.waste.length - 1, { k: 't', i }]);
    }
  }
  for (let from = 0; from < COLUMNS; from++) {
    const col = s.cols[from];
    const start = firstUp(col);
    if (start < 0) continue;
    const c = col[col.length - 1];
    const f = foundationFor(s, c);
    if (f >= 0) (col.length >= 2 && !isUp(col[col.length - 2]) ? home : other).push([{ k: 't', i: from }, col.length - 1, { k: 'f', i: f }]);
    for (let index = start; index < col.length; index++) {
      if (!canPick(col, index)) continue;
      const reveals = index > 0 && !isUp(col[index - 1]);
      const whole = index === 0;
      for (let to = 0; to < COLUMNS; to++) {
        if (to === from || !canDropOnColumn(s.cols[to], col[index])) continue;
        if (whole && !s.cols[to].length) continue;              // король из пустого в пустой
        if (reveals) reveal.push([{ k: 't', i: from }, index, { k: 't', i: to }]);
        else if (index === start && !whole) continue;            // нижняя открытая карта лежит на закрытой — это reveal выше
        else if (!whole && index > start) {
          // часть ряда — только если нижняя карта освободит место для «дома» (кладём ради карты под ней)
          const under = col[index - 1];
          if (foundationFor(s, under) >= 0) other.push([{ k: 't', i: from }, index, { k: 't', i: to }]);
        } else if (whole && s.cols[to].length) other.push([{ k: 't', i: from }, index, { k: 't', i: to }]);
      }
    }
  }
  const list = [...home, ...reveal, ...fromWaste, ...king, ...other];
  if (s.stock.length || s.waste.length) list.push('d');
  return list;
}

/**
 * Решить раскладку (состояние не меняется). → { won, path, nodes }; path — ходы [from, index, to] и 'd' (колода),
 * включая безопасные ходы в «дом».
 */
export function solve(start, { maxNodes = 100000, maxDepth = 1500 } = {}) {
  const s = JSON.parse(JSON.stringify({ ...start, undo: [] }));
  const seen = new Set();
  const path = [];
  const auto = autoHome(s);
  for (let k = 0; k < auto; k++) path.push(s.undo[k]);
  seen.add(keyOf(s));
  const stack = [{ moves: searchMoves(s), next: 0, undoTo: s.undo.length }];
  let nodes = 0;
  if (isWon(s)) return { won: true, path: toPath(s), nodes };
  while (stack.length) {
    const topFrame = stack[stack.length - 1];
    if (topFrame.next >= topFrame.moves.length || nodes > maxNodes || stack.length > maxDepth) {
      stack.pop();
      if (!stack.length) break;
      const back = stack[stack.length - 1].undoTo;
      while (s.undo.length > back) undo(s);
      if (nodes > maxNodes) break;
      continue;
    }
    const m = topFrame.moves[topFrame.next++];
    const res = m === 'd' ? draw(s) : move(s, m[0], m[1], m[2]);
    if (!res.ok) continue;
    autoHome(s);
    const key = keyOf(s);
    if (seen.has(key)) {
      while (s.undo.length > topFrame.undoTo) undo(s);
      continue;
    }
    seen.add(key);
    nodes += 1;
    if (isWon(s)) return { won: true, path: toPath(s), nodes };
    stack.push({ moves: searchMoves(s), next: 0, undoTo: s.undo.length });
  }
  return { won: false, path: [], nodes };
}

/** Путь решения из записей отмены. */
function toPath(s) {
  const out = [];
  let stock = null;
  void stock;
  for (const rec of s.undo) out.push(rec.t === 'm' ? [rec.from, rec.index ?? null, rec.to, rec.n] : 'd');
  return out;
}

/** Проиграть путь решения на копии раскладки (для проверки). → { ok } */
export function replay(start, path) {
  const s = JSON.parse(JSON.stringify({ ...start, undo: [] }));
  for (const m of path) {
    if (m === 'd') {
      if (!draw(s).ok) return { ok: false };
      continue;
    }
    const [from, , to, n] = m;
    const list = from.k === 'w' ? s.waste : from.k === 'f' ? s.found[from.i] : s.cols[from.i];
    if (!move(s, from, list.length - n, to).ok) return { ok: false };
  }
  return { ok: isWon(s) };
}

void suitOf;
