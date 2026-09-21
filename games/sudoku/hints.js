// Продвинутые подсказки: по позиции на доске — приём, объяснение по-русски и клетки для подсветки.
// Порядок: сначала ошибка на доске (если есть), потом логика (techniques.js), а если логики не хватило —
// просто открыть клетку с наименьшим числом вариантов.
//
// Подсказка: { steps: [{ title, text }], action: { kind: 'place' | 'erase', cell, digit? },
//              highlight: { area: Set, key: Set, elim: Set, target } }

import { UNITS, ROW_OF, COL_OF, unitKind, unitNumber, digitsOf, popcount } from './grid.js';
import { nextHint, candidatesFor } from './techniques.js';

// Клетка — «(строка, столбец)», на доске она подсвечена.
const cellName = (i) => `(${ROW_OF[i] + 1}, ${COL_OF[i] + 1})`;
const cellFull = (i) => `строка ${ROW_OF[i] + 1}, столбец ${COL_OF[i] + 1}`;

const PREP = { row: 'строке', col: 'столбце', box: 'блоке' };
const GEN = { row: 'строки', col: 'столбца', box: 'блока' };
const PLURAL_PREP = { row: 'строках', col: 'столбцах' };
const PLURAL_GEN = { row: 'строк', col: 'столбцов' };

const prep = (u) => `${PREP[unitKind(u)]} ${unitNumber(u)}`;
const gen = (u) => `${GEN[unitKind(u)]} ${unitNumber(u)}`;

function list(items) {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} и ${items.at(-1)}`;
}

const digitList = (mask) => list(digitsOf(mask).map(String));
const cellList = (cells) => list(cells.map(cellName));

/** Шаг-исключение → { title, text } */
function describeElimination(step) {
  const d = step.digit;
  switch (step.type) {
    case 'pointing':
      return {
        title: step.cells.length === 2 ? 'Указывающая пара' : 'Указывающая тройка',
        text: `В ${prep(step.unit)} цифра ${d} может стоять только в ${prep(step.line)}. `
          + `Значит, в других клетках ${gen(step.line)} цифры ${d} быть не может.`,
      };
    case 'boxLine':
      return {
        title: 'Блок и линия',
        text: `В ${prep(step.unit)} цифра ${d} может стоять только внутри ${gen(step.box)}. `
          + `Значит, в других клетках ${gen(step.box)} цифры ${d} быть не может.`,
      };
    case 'nakedPair':
    case 'nakedTriple':
      return {
        title: step.type === 'nakedPair' ? 'Открытая пара' : 'Открытая тройка',
        text: `В ${prep(step.unit)} клетки ${cellList(step.cells)} могут содержать только ${digitList(step.digits)}. `
          + `Эти цифры займут именно их — в других клетках ${gen(step.unit)} их быть не может.`,
      };
    case 'hiddenPair':
    case 'hiddenTriple':
      return {
        title: step.type === 'hiddenPair' ? 'Скрытая пара' : 'Скрытая тройка',
        text: `В ${prep(step.unit)} цифры ${digitList(step.digits)} могут стоять только в клетках ${cellList(step.cells)}. `
          + 'Значит, другим цифрам в этих клетках места нет.',
      };
    case 'xWing': {
      const kind = unitKind(step.lines[0]);
      const cross = unitKind(step.crosses[0]);
      return {
        title: 'X-крыло',
        text: `В ${PLURAL_PREP[kind]} ${list(step.lines.map(unitNumber).map(String))} цифра ${d} может стоять только `
          + `в ${PLURAL_PREP[cross]} ${list(step.crosses.map(unitNumber).map(String))}. Она займёт две из этих четырёх `
          + `клеток крест-накрест, поэтому в других клетках этих ${PLURAL_GEN[cross]} цифры ${d} быть не может.`,
      };
    }
    default:
      return { title: 'Исключение', text: '' };
  }
}

/** Расстановка → { title, text }. afterChain — были ли выводы выше. */
function describePlacement(step, afterChain) {
  const d = step.digit;
  // После цепочки исключений — «Теперь …» и «или исключены выше».
  const now = afterChain ? 'Теперь в' : 'В';
  const excludedOne = afterChain ? ' либо исключена выводом выше' : '';
  const excludedMany = afterChain ? ' либо исключены выводом выше' : '';
  switch (step.type) {
    case 'lastCell':
      return {
        title: 'Последняя свободная клетка',
        text: `В ${prep(step.unit)} осталась одна пустая клетка — в неё идёт ${d}.`,
      };
    case 'hiddenSingle':
      return {
        title: 'Единственное место',
        text: `${now} ${prep(step.unit)} цифру ${d} можно поставить только в клетку ${cellName(step.cell)}: `
          + `в остальных пустых клетках ${gen(step.unit)} она уже есть в той же строке, столбце или блоке${excludedOne}.`,
      };
    default:
      return {
        title: 'Единственная цифра',
        text: `${now} клетку ${cellName(step.cell)} подходит только ${d} — `
          + `остальные цифры уже есть в её строке, столбце или блоке${excludedMany}.`,
      };
  }
}

function emptyHighlight() {
  return { area: new Set(), key: new Set(), elim: new Set(), target: -1 };
}

/**
 * Подсказка для текущей доски.
 * values — цифры на доске (0 — пусто), solution — решение.
 */
export function buildHint(values, solution) {
  const highlight = emptyHighlight();

  const mistake = values.findIndex((v, i) => v && v !== solution[i]);
  if (mistake >= 0) {
    highlight.target = mistake;
    return {
      steps: [{ title: 'Ошибка', text: `В клетке ${cellFull(mistake)} стоит неверная цифра ${values[mistake]}. Сотрём её.` }],
      action: { kind: 'erase', cell: mistake },
      highlight,
    };
  }

  const found = nextHint(values);
  if (found) {
    const steps = [];
    for (const s of found.chain) {
      steps.push(describeElimination(s));
      for (const u of [s.unit, s.line, s.box, ...(s.lines ?? []), ...(s.crosses ?? [])]) {
        if (u !== undefined) UNITS[u].forEach((i) => highlight.area.add(i));
      }
      s.cells.forEach((i) => highlight.key.add(i));
      s.eliminations.forEach(({ cell }) => highlight.elim.add(cell));
    }
    const { step } = found;
    const placement = describePlacement(step, found.chain.length > 0);
    // В «последней клетке» сама клетка ещё не названа — называем.
    const where = step.type === 'lastCell' ? ` Это клетка ${cellName(step.cell)}.` : '';
    steps.push({ ...placement, text: placement.text + where });
    if (step.unit !== undefined) UNITS[step.unit].forEach((i) => highlight.area.add(i));
    highlight.target = step.cell;
    return { steps, action: { kind: 'place', cell: step.cell, digit: step.digit }, highlight };
  }

  // Логики наших приёмов не хватило — открываем клетку, где меньше всего вариантов.
  const cand = candidatesFor(values);
  let cell = -1;
  for (let i = 0; i < 81; i++) {
    if (!values[i] && (cell < 0 || popcount(cand[i]) < popcount(cand[cell]))) cell = i;
  }
  if (cell < 0) return null;
  highlight.target = cell;
  return {
    steps: [{
      title: 'Открываем клетку',
      text: `Здесь нужен приём сложнее доступных подсказок, поэтому просто откроем клетку ${cellFull(cell)}: в ней ${solution[cell]}.`,
    }],
    action: { kind: 'place', cell, digit: solution[cell] },
    highlight,
  };
}
