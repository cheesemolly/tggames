// Го: статистика, настройки и выбор новой партии (без DOM). Правила — rules.js, бот — bot.js.
//
// Статистика: против бота — по размеру доски и уровню { played, wins, losses } (ничьих нет: коми с половинкой),
// серия побед; вдвоём — сколько партий выиграли чёрные и белые.

import { SIZES, maxHandicap } from './rules.js';

export const LEVEL_IDS = [1, 2, 3, 4, 5];
export const SKINS = ['telegram', 'kaya', 'walnut', 'night', 'paper'];
export const CONFIRM = ['big', 'always', 'never'];   // ставить вторым касанием: на 13×13 и 19×19 / всегда / никогда
export const HANDICAPS = [0, 2, 3, 4, 5, 6, 9];

export function defaultSetup() {
  return { size: 9, vs: 'bot', level: 2, side: 'black', handicap: 0 };
}

export function normalizeSetup(s) {
  const d = defaultSetup();
  if (!s || typeof s !== 'object') return d;
  const size = SIZES.includes(s.size) ? s.size : d.size;
  return {
    size,
    vs: ['bot', 'friend'].includes(s.vs) ? s.vs : d.vs,
    level: LEVEL_IDS.includes(s.level) ? s.level : d.level,
    side: ['black', 'white', 'random'].includes(s.side) ? s.side : d.side,
    handicap: HANDICAPS.includes(s.handicap) && s.handicap <= maxHandicap(size) ? s.handicap : 0,
  };
}

export function defaultSettings() {
  return { skin: 'telegram', confirm: 'big', coords: false, atari: true };
}

export function normalizeSettings(s) {
  const d = defaultSettings();
  return {
    skin: SKINS.includes(s?.skin) ? s.skin : d.skin,
    confirm: CONFIRM.includes(s?.confirm) ? s.confirm : d.confirm,
    coords: typeof s?.coords === 'boolean' ? s.coords : d.coords,
    atari: typeof s?.atari === 'boolean' ? s.atari : d.atari,
  };
}

/** Нужно ли подтверждать ход вторым касанием на этой доске. */
export const needConfirm = (settings, size) => settings.confirm === 'always' || (settings.confirm === 'big' && size >= 13);

const row = () => ({ played: 0, wins: 0, losses: 0 });

export function emptyStats() {
  const st = { streak: 0, bestStreak: 0, friend: { played: 0, black: 0, white: 0 } };
  for (const n of SIZES) {
    st[`s${n}`] = {};
    for (const l of LEVEL_IDS) st[`s${n}`][l] = row();
  }
  return st;
}

const count = (x) => Number.isInteger(x) && x >= 0;

export function isValidStats(st) {
  if (!st || !count(st.streak) || !count(st.bestStreak)) return false;
  if (!st.friend || !['played', 'black', 'white'].every((k) => count(st.friend[k]))) return false;
  return SIZES.every((n) => st[`s${n}`] && LEVEL_IDS.every((l) => {
    const r = st[`s${n}`][l];
    return r && ['played', 'wins', 'losses'].every((k) => count(r[k]));
  }));
}

/** Записать партию. vs bot: won — победил ли игрок; вдвоём: winner — 1 (чёрные) / 2 (белые). */
export function recordGame(st, game, { won = false, winner = 1 } = {}) {
  const next = structuredClone(st);
  if (game.vs === 'friend') {
    next.friend.played++;
    if (winner === 1) next.friend.black++;
    else next.friend.white++;
    return next;
  }
  const r = next[`s${game.size}`][game.level];
  r.played++;
  if (won) {
    r.wins++;
    next.streak++;
    next.bestStreak = Math.max(next.bestStreak, next.streak);
  } else {
    r.losses++;
    next.streak = 0;
  }
  return next;
}

/** Счёт для людей: «7,5». */
export const fmtScore = (x) => String(Math.abs(x)).replace('.', ',');
