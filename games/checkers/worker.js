// Бот думает в отдельном потоке, чтобы интерфейс не замирал: { board, side, level, seed } → { move }.

import { bestMove } from './logic.js';

self.onmessage = (e) => {
  if (e.data.ping) {
    self.postMessage({ pong: true });
    return;
  }
  const { id, board, side, level } = e.data;
  const move = bestMove(board, side, { level });
  self.postMessage({ id, move });
};
