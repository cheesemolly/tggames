// Геометрия судоку: клетки 0..80, группы (27 штук: строки 0–8, столбцы 9–17, блоки 18–26), соседи.
// Сетка — массив из 81 числа: 0 — пусто, 1..9 — цифра. Кандидаты — битовые маски (бит d = цифра d).

export const ROW_OF = Array.from({ length: 81 }, (_, i) => Math.floor(i / 9));
export const COL_OF = Array.from({ length: 81 }, (_, i) => i % 9);
export const BOX_OF = Array.from({ length: 81 }, (_, i) => Math.floor(ROW_OF[i] / 3) * 3 + Math.floor(COL_OF[i] / 3));

export const UNITS = [
  ...Array.from({ length: 9 }, (_, r) => Array.from({ length: 9 }, (_, c) => r * 9 + c)),
  ...Array.from({ length: 9 }, (_, c) => Array.from({ length: 9 }, (_, r) => r * 9 + c)),
  ...Array.from({ length: 9 }, (_, b) => Array.from({ length: 9 }, (_, k) => {
    const r = Math.floor(b / 3) * 3 + Math.floor(k / 3);
    const c = (b % 3) * 3 + (k % 3);
    return r * 9 + c;
  })),
];

export const rowUnit = (r) => r;
export const colUnit = (c) => 9 + c;
export const boxUnit = (b) => 18 + b;

/** 'row' | 'col' | 'box' */
export function unitKind(u) {
  return u < 9 ? 'row' : u < 18 ? 'col' : 'box';
}

/** Номер группы для человека: 1..9 */
export function unitNumber(u) {
  return (u % 9) + 1;
}

/** Три группы клетки: строка, столбец, блок. */
export const UNITS_OF = Array.from({ length: 81 }, (_, i) => [rowUnit(ROW_OF[i]), colUnit(COL_OF[i]), boxUnit(BOX_OF[i])]);

/** 20 соседей клетки (та же строка, столбец или блок). */
export const PEERS = Array.from({ length: 81 }, (_, i) => {
  const set = new Set(UNITS_OF[i].flatMap((u) => UNITS[u]));
  set.delete(i);
  return [...set];
});

export const ALL_DIGITS = 0x3fe;         // биты 1..9
export const bit = (d) => 1 << d;

export function popcount(mask) {
  let n = 0;
  while (mask) {
    mask &= mask - 1;
    n++;
  }
  return n;
}

export function digitsOf(mask) {
  const out = [];
  for (let d = 1; d <= 9; d++) if (mask & (1 << d)) out.push(d);
  return out;
}

/** '530070000…' (81 символ, 0 или . — пусто) → массив */
export function parseGrid(text) {
  const cells = [...text].filter((ch) => /[0-9.]/.test(ch)).map((ch) => (ch === '.' ? 0 : Number(ch)));
  if (cells.length !== 81) throw new Error(`В сетке ${cells.length} клеток вместо 81`);
  return cells;
}

export function formatGrid(grid) {
  return grid.join('');
}
