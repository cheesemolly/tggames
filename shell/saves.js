// Сохранённые незаконченные партии: { state, elapsedMs } по id игры.
// state — то, что вернул game.getState(); пишет и читает только оболочка.

import { createStorage } from '../platform/storage.js';

export const saves = createStorage('shell:saves');
