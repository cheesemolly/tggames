// Банк решаемых раскладок Косынки: перебирает зёрна по порядку, решает каждую раскладку (solver.js) и записывает
// решённые в games/klondike/deals.json — { "1": [зёрна для раздачи по одной], "3": [по три] }.
// Запуск: node games/klondike/tools/generate-bank.js 500   (число раскладок на режим; ~0,5 с на раскладку)

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { newGame } from '../logic.js';
import { solve } from '../solver.js';

const COUNT = Number(process.argv[2] || 500);
const out = {};
for (const draw of [1, 3]) {
  const seeds = [];
  let tried = 0;
  // зёрна — не 1, 2, 3…: так раскладки по одной и по три не повторяют друг друга
  for (let seed = draw * 1000003; seeds.length < COUNT; seed += 7919) {
    tried += 1;
    if (solve(newGame(draw, seed), { maxNodes: 100000 }).won) seeds.push(seed);
    if (tried % 50 === 0) process.stdout.write(`по ${draw}: ${seeds.length}/${COUNT} (проверено ${tried})\r`);
  }
  console.log(`по ${draw}: ${seeds.length} решаемых из ${tried}`);
  out[draw] = seeds;
}
writeFileSync(fileURLToPath(new URL('../deals.json', import.meta.url)), `${JSON.stringify(out)}\n`);
