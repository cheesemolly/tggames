// Проверка уровней: каждый решается одной логикой по линиям (значит, и решение единственное), сложность —
// число проходов разбора. node games/nonogram/tools/check-levels.js [--fix]
// --fix: для нерешаемых — жадно меняет по одной клетке (из тех, что разбор не определил), пока не решится, и
// печатает исправленный рисунок (новая закрашенная клетка берёт цвет самого частого соседа).

import { LEVELS } from '../levels.js';
import { cluesOfGrid, lineSolve } from '../solver.js';
import { maskOf } from '../logic.js';

const fix = process.argv.includes('--fix');

function check(mask) {
  // mask — массив строк из 0/1
  const w = mask[0].length;
  const h = mask.length;
  return { ...lineSolve(w, h, cluesOfGrid(mask)), w, h };
}

/** Жадная правка: на каждом шаге — клетка, после смены которой неизвестных меньше всего. */
export function autofix(art, maxFlips = 12) {
  let rows = art.map((r) => [...r]);
  const flips = [];
  for (let step = 0; step < maxFlips; step++) {
    const mask = rows.map((r) => r.map((ch) => (ch === '.' ? 0 : 1)));
    const res = check(mask);
    if (res.solved) return { art: rows.map((r) => r.join('')), flips };
    const { w, h } = res;
    let best = null;
    for (let i = 0; i < w * h; i++) {
      if (res.grid[i] !== -1) continue;
      const x = i % w;
      const y = Math.floor(i / w);
      const m2 = mask.map((r) => r.slice());
      m2[y][x] = 1 - m2[y][x];
      const r2 = check(m2);
      const score = r2.solved ? -1 : r2.unknown;
      if (!best || score < best.score) best = { score, x, y };
    }
    if (!best) break;
    const { x, y } = best;
    if (rows[y][x] === '.') {
      const counts = {};
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ch = rows[y + dy]?.[x + dx];
        if (ch && ch !== '.') counts[ch] = (counts[ch] ?? 0) + 1;
      }
      rows[y][x] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? Object.keys(counts)[0] ?? 'k';
      flips.push(`+(${x},${y})`);
    } else {
      rows[y][x] = '.';
      flips.push(`-(${x},${y})`);
    }
  }
  const mask = rows.map((r) => r.map((ch) => (ch === '.' ? 0 : 1)));
  return check(mask).solved ? { art: rows.map((r) => r.join('')), flips } : null;
}

if (process.argv[1]?.endsWith('check-levels.js')) {
  let bad = 0;
  LEVELS.forEach((lvl, k) => {
    const mask = maskOf(lvl);
    const res = check(mask);
    const filled = mask.flat().filter(Boolean).length / (res.w * res.h);
    const line = `${String(k + 1).padStart(3)} ${lvl.title.padEnd(18)} ${res.w}×${res.h} проходов ${String(res.passes).padStart(2)} закрашено ${Math.round(filled * 100)}%`;
    if (res.solved) {
      console.log(line);
      return;
    }
    bad++;
    console.log(`${line}  НЕ РЕШАЕТСЯ (неизвестных ${res.unknown})`);
    if (fix) {
      const f = autofix(lvl.art);
      if (f) console.log(`    правка ${f.flips.join(' ')}:\n${f.art.map((r) => `      '${r}',`).join('\n')}`);
      else console.log('    не исправить автоматически');
    }
  });
  console.log(bad ? `не решаются: ${bad}` : 'все уровни решаются логикой');
}
