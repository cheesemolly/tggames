// Подбор ходов и порогов звёзд для 100 уровней ботом: node games/match3/tools/tune.js [с уровня] [по уровень]
// Для каждого уровня — наименьшее число ходов, при котором жадный бот (logic.js: botMove) выигрывает не реже
// целевой доли (пилой: начало главы легче, к боссу сложнее; босс — примерно половина). Пороги звёзд — по
// очкам бота на победах: 2 звезды — медиана, 3 — верхние 20%. Результат — tuning.js рядом.
import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { levelSpec, LEVEL_COUNT } from '../levels.js';
import { botPlay } from '../logic.js';

const SEEDS = Number(process.env.SEEDS ?? 40);
const [from = 1, to = LEVEL_COUNT] = process.argv.slice(2).map(Number);
const out = fileURLToPath(new URL('../tuning.js', import.meta.url));

function mulberry(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Целевая доля побед бота: пила внутри главы, главы постепенно строже. */
export function target(n) {
  const pos = (n - 1) % 10;
  const chapter = Math.floor((n - 1) / 10);
  if (n <= 3) return 0.97;
  if (pos === 9) return Math.max(0.35, 0.5 - chapter * 0.015);
  const saw = [0.9, 0.86, 0.82, 0.8, 0.78, 0.75, 0.72, 0.7, 0.66][pos];
  return Math.max(0.5, saw - chapter * 0.015);
}

function trial(n, moves) {
  const spec = { ...levelSpec(n), moves };
  const wins = [];
  for (let seed = 1; seed <= SEEDS; seed++) {
    const s = botPlay(spec, mulberry(n * 1000 + seed));
    if (s.over === 'win') wins.push(s.score);
  }
  return wins;
}

let current = [];
try {
  const text = readFileSync(out, 'utf8');
  const json = text.slice(text.indexOf('['), text.lastIndexOf(']') + 1);
  current = JSON.parse(json);
} catch {
  current = [];
}

for (let n = from; n <= to; n++) {
  const t0 = Date.now();
  const need = target(n);
  let lo = 6;
  let hi = 90;
  let best = null;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const wins = trial(n, mid);
    if (wins.length / SEEDS >= need) {
      best = { moves: mid, wins };
      hi = mid - 1;
    } else lo = mid + 1;
  }
  if (!best) {
    console.log(`уровень ${n}: бот не проходит даже за 90 ходов!`);
    current[n - 1] = { moves: 90, stars: [0, 20000, 40000] };
    continue;
  }
  // первым уровням — с запасом: игрок только знакомится с правилами
  const floor = n <= 10 ? 15 : 12;
  if (best.moves < floor) best = { moves: floor, wins: trial(n, floor) };
  const sorted = best.wins.slice().sort((a, b) => a - b);
  const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  const round = (v) => Math.round(v / 100) * 100;
  current[n - 1] = { moves: best.moves, stars: [0, round(q(0.5)), round(Math.max(q(0.8), q(0.5) * 1.15))] };
  console.log(`уровень ${n}: ходов ${best.moves}, побед ${best.wins.length}/${SEEDS} (цель ${Math.round(need * 100)}%), звёзды ${current[n - 1].stars.slice(1).join(' / ')} — ${Date.now() - t0} мс`);
  writeFileSync(out, `// Подобрано ботом (tools/tune.js): ходы и пороги звёзд [1, 2, 3] по уровням. Не править руками.\nexport const TUNING = ${JSON.stringify(current)};\n`);
}
