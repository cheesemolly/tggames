// Бот го в отдельном потоке: сильные уровни думают до 2,6 секунды — экран не должен замирать.
// Сообщение: { id, kind: 'move' | 'hint' | 'dead', game, level } → { id, result } или { id, error }.

import { chooseMove, hintMove, estimateDead } from './bot.js';

self.onmessage = (e) => {
  const { id, kind, game, level, ping } = e.data ?? {};
  if (ping) {
    self.postMessage({ pong: true });
    return;
  }
  try {
    const result = kind === 'hint' ? hintMove(game) : kind === 'dead' ? estimateDead(game) : chooseMove(game, level);
    self.postMessage({ id, result });
  } catch (err) {
    self.postMessage({ id, error: String(err?.message ?? err) });
  }
};
