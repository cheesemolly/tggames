// Шахматный бот в отдельном потоке: на верхних уровнях он думает до 2,5 секунды — экран не должен замирать.
// Сообщение: { id, fen, moves: [UCI с начальной позиции], level } → { id, move: UCI | '', score }.
// fen — начальная позиция партии; ходы переигрываются, чтобы у движка были ключи повторений и счётчик 50 ходов.

import { fromFen, make, moveFromUci, uci } from './rules.js';
import { chooseMove } from './engine.js';

self.onmessage = (e) => {
  const { id, fen, moves, level, ping } = e.data ?? {};
  if (ping) {
    self.postMessage({ pong: true });
    return;
  }
  try {
    const pos = fromFen(fen);
    for (const u of moves) {
      const m = moveFromUci(pos, u);
      if (!m) throw new Error(`ход ${u}`);
      make(pos, m);
    }
    const r = chooseMove(pos, level, moves);
    self.postMessage({ id, move: r.move ? uci(r.move) : '', score: r.score ?? 0 });
  } catch (err) {
    self.postMessage({ id, error: String(err?.message ?? err) });
  }
};
