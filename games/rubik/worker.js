// Решатель кубика в отдельном потоке: таблицы строятся ~0,5–2 с — экран не должен замирать.
// Сообщения: { id, kind: 'init' } → таблицы готовы; { id, kind: 'scramble' } → ходы перемешивания;
// { id, kind: 'solve', facelets } → ходы решения (или null). Ответ — { id, result } или { id, error }.

import { buildTables, randomScramble, solveFacelets } from './solver.js';

self.onmessage = (e) => {
  const { id, kind, facelets, ping } = e.data ?? {};
  if (ping) {
    self.postMessage({ pong: true });
    return;
  }
  try {
    let result = null;
    if (kind === 'init') result = buildTables();
    else if (kind === 'scramble') result = randomScramble(Math.random).moves;
    else if (kind === 'solve') result = solveFacelets(facelets, { maxLength: 22, timeLimit: 150 });
    self.postMessage({ id, result });
  } catch (err) {
    self.postMessage({ id, error: String(err?.message ?? err) });
  }
};
