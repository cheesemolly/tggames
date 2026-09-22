// Пересборка банка уровней «Соедини точки»: node games/connect-dots/tools/generate-bank.js [на вариант=60]
// Для каждого варианта поля из раундов (размер, стены, тоннели) — уровни с единственным решением.

import { writeFileSync } from 'node:fs';
import { generatePuzzle } from '../generator.js';
import { ALL_TIERS, PAIRS, tierKey, encodeLevel } from '../logic.js';

const perTier = Number(process.argv[2] ?? 60);
const tiers = {};
for (const [size, walls, tunnels] of ALL_TIERS) {
  const key = tierKey(size, walls, tunnels);
  const found = new Set();
  const t0 = Date.now();
  let tries = 0;
  while (found.size < perTier && tries < 20000) {
    tries++;
    const level = generatePuzzle({ size, walls, tunnels, pairs: PAIRS[size] });
    if (level) found.add(encodeLevel(level));
  }
  tiers[key] = [...found];
  console.log(`${key}: ${found.size} уровней, попыток ${tries}, ${((Date.now() - t0) / 1000).toFixed(1)} с`);
}
const out = new URL('../levels.json', import.meta.url);
writeFileSync(out, JSON.stringify({ tiers }));
console.log('Готово:', out.pathname);
