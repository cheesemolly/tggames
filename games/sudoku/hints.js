// Продвинутые подсказки (по образцу sudoku.com): подсказка — несколько страниц, у каждой свой текст и своя
// картинка на доске. Пример «единственного места»:
//   1) «Обратите внимание на эти цифры и выделенные области» — доска затемнена, цифры, которые мешают, —
//      зелёные, строки/столбцы/блоки, которые они перекрывают, — голубые;
//   2) «В этом блоке цифру 2 можно поставить только в одну клетку» — блок обведён, нужная клетка светлая;
//   3) «Поэтому в этой клетке должна быть 2» — цифра показывается в клетке, «Готово» её ставит.
// Порядок поиска: ошибка на доске → логика (techniques.js; исключения — отдельными страницами перед
// расстановкой) → если логики не хватило, просто открываем клетку.
//
// Подсказка: { pages, steps, action, highlight }
//   page  = { title, text: [сегмент], show }
//   сегмент — строка или { t, m } — кусок текста с меткой цвета: key | area | unit | target | elim | wrong
//   show  = { area: Set, key: Set, units: [u], target, reveal, wrong, cands: Map(cell → [d]), elim: Map(cell → [d]) }
//   steps = [{ title, text }] — те же страницы простым текстом; highlight — подсветка последней страницы.

import { UNITS, ROW_OF, COL_OF, BOX_OF, PEERS, unitKind, digitsOf, popcount, rowUnit, colUnit, boxUnit } from './grid.js';
import { nextHint, candidatesFor } from './techniques.js';

// «в этом блоке», «эта строка» — в каком падеже и роде называть группу
const THIS_PREP = { row: 'этой строке', col: 'этом столбце', box: 'этом блоке' };
const THIS_PREP_PLURAL = { row: 'этих строках', col: 'этих столбцах' };
const GEN_PLURAL = { row: 'строк', col: 'столбцов' };

const thisPrep = (u) => THIS_PREP[unitKind(u)];

function list(items) {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} и ${items.at(-1)}`;
}
const digitList = (mask) => list(digitsOf(mask).map(String));
const ord = (n, one, few, many) => {
  const a = n % 10;
  const b = n % 100;
  if (b >= 11 && b <= 14) return many;
  if (a === 1) return one;
  if (a >= 2 && a <= 4) return few;
  return many;
};

function emptyShow() {
  return { area: new Set(), key: new Set(), units: [], target: -1, reveal: 0, wrong: -1, cands: new Map(), elim: new Map() };
}

/** Копия картинки страницы — следующая страница дорисовывает поверх предыдущей. */
function copyShow(s) {
  return {
    area: new Set(s.area), key: new Set(s.key), units: [...s.units], target: s.target, reveal: s.reveal, wrong: s.wrong,
    cands: new Map([...s.cands].map(([k, v]) => [k, [...v]])), elim: new Map([...s.elim].map(([k, v]) => [k, [...v]])),
  };
}

const addUnit = (set, u) => UNITS[u].forEach((i) => set.add(i));
const plain = (segments) => segments.map((s) => (typeof s === 'string' ? s : s.t)).join('');

/** Общая группа двух клеток: строка или столбец важнее блока (их и видно на доске, как в sudoku.com). */
function sharedUnit(a, b) {
  if (ROW_OF[a] === ROW_OF[b]) return rowUnit(ROW_OF[a]);
  if (COL_OF[a] === COL_OF[b]) return colUnit(COL_OF[a]);
  if (BOX_OF[a] === BOX_OF[b]) return boxUnit(BOX_OF[a]);
  return -1;
}

/**
 * Какие цифры d на доске закрывают клетки need (жадно — поменьше цифр). Возвращает
 * { holders: [клетки с цифрой], houses: Set(групп, через которые они закрывают) }.
 */
function blockersOf(values, d, need) {
  const holders = [];
  const houses = new Set();
  let rest = [...need];
  const all = [];
  for (let k = 0; k < 81; k++) if (values[k] === d) all.push(k);
  while (rest.length) {
    let best = -1;
    let bestCover = [];
    for (const k of all) {
      const cover = rest.filter((e) => PEERS[e].includes(k));
      if (cover.length > bestCover.length) {
        best = k;
        bestCover = cover;
      }
    }
    if (best < 0) break;                       // закрыто не цифрой (исключением цепочки) — не наше дело
    holders.push(best);
    for (const e of bestCover) houses.add(sharedUnit(best, e));
    rest = rest.filter((e) => !bestCover.includes(e));
  }
  return { holders, houses };
}

// ---------- исключения (страницы цепочки) ----------

function eliminationPage(step, base) {
  const show = copyShow(base);
  show.key = new Set();
  show.area = new Set();
  show.units = [];
  const d = step.digit;
  for (const { cell, digit } of step.eliminations) {
    const list0 = show.elim.get(cell) ?? [];
    if (!list0.includes(digit)) list0.push(digit);
    show.elim.set(cell, list0);
  }
  const candDigits = step.digits ? digitsOf(step.digits) : [d];
  for (const c of step.cells) {
    show.key.add(c);
    show.cands.set(c, candDigits);
  }
  const k = (t) => ({ t, m: 'key' });
  const u = (t) => ({ t, m: 'unit' });
  const x = (t) => ({ t, m: 'elim' });
  const n = step.cells.length;
  const theseCells = n === 1 ? 'этой клетке' : 'этих клетках';
  switch (step.type) {
    case 'pointing': {
      show.units = [step.unit];
      addUnit(show.area, step.line);
      const line = unitKind(step.line) === 'row' ? 'строке' : 'столбце';
      const lineGen = unitKind(step.line) === 'row' ? 'строки' : 'столбца';
      return {
        show,
        title: n === 2 ? 'Указывающая пара' : 'Указывающая тройка',
        text: ['В ', u(thisPrep(step.unit)), ` цифра ${d} может стоять только в `, k(theseCells), ` — они в одной ${line}. `,
          'Значит, в ', x(`других клетках этой ${lineGen}`), ` цифры ${d} быть не может.`],
      };
    }
    case 'boxLine':
      show.units = [step.unit];
      addUnit(show.area, step.box);
      return {
        show,
        title: 'Блок и линия',
        text: ['В ', u(thisPrep(step.unit)), ` цифра ${d} может стоять только в `, k(theseCells), ' — и все они в одном блоке. ',
          'Значит, в ', x('других клетках этого блока'), ` цифры ${d} быть не может.`],
      };
    case 'nakedPair':
    case 'nakedTriple':
      show.units = [step.unit];
      return {
        show,
        title: step.type === 'nakedPair' ? 'Открытая пара' : 'Открытая тройка',
        text: [k(n === 2 ? 'Эти две клетки' : 'Эти три клетки'), ' в ', u(thisPrep(step.unit)), ` могут содержать только ${digitList(step.digits)}. `,
          'Эти цифры займут именно их — в ', x('остальных клетках'), ' их быть не может.'],
      };
    case 'hiddenPair':
    case 'hiddenTriple':
      show.units = [step.unit];
      return {
        show,
        title: step.type === 'hiddenPair' ? 'Скрытая пара' : 'Скрытая тройка',
        text: [`Цифры ${digitList(step.digits)} в `, u(thisPrep(step.unit)), ' могут стоять только в ', k(theseCells), '. ',
          'Значит, другим цифрам там места нет — ', x('лишние варианты'), ' вычёркиваем.'],
      };
    case 'xWing': {
      const kind = unitKind(step.lines[0]);
      const cross = unitKind(step.crosses[0]);
      show.units = [...step.lines];
      step.crosses.forEach((c) => addUnit(show.area, c));
      return {
        show,
        title: 'X-крыло',
        text: ['В ', u(THIS_PREP_PLURAL[kind]), ` цифра ${d} может стоять только в `, k('этих четырёх клетках'),
          ` — по две в двух ${GEN_PLURAL[cross]}. Она займёт две из них крест-накрест, поэтому в `,
          x(`других клетках этих ${GEN_PLURAL[cross]}`), ` цифры ${d} быть не может.`],
      };
    }
    default:
      return { show, title: 'Исключение', text: ['Вычёркиваем ', x('лишние варианты'), '.'] };
  }
}

// ---------- расстановка ----------

function placementPages(values, step, base, afterChain) {
  const d = step.digit;
  const c = step.cell;
  const pages = [];
  const k = (t) => ({ t, m: 'key' });
  const a = (t) => ({ t, m: 'area' });
  const u = (t) => ({ t, m: 'unit' });
  const tg = (t) => ({ t, m: 'target' });
  const x = (t) => ({ t, m: 'elim' });
  const excludedBy = (cell, digit) => (base.elim.get(cell) ?? []).includes(digit);

  if (step.type === 'hiddenSingle') {
    const title = 'Единственное место';
    const need = UNITS[step.unit].filter((e) => !values[e] && e !== c && !excludedBy(e, d));
    const { holders, houses } = blockersOf(values, d, need);
    const s1 = copyShow(base);
    s1.key = new Set(holders);
    s1.area = new Set();
    s1.units = [];
    s1.cands = new Map();
    houses.forEach((h) => addUnit(s1.area, h));
    const chainNote = afterChain ? [' и ', x('вычеркнутые выше варианты')] : [];
    // все клетки закрыты исключениями цепочки — «мешающих» цифр нет, сразу к группе
    if (holders.length) {
      pages.push({
        title,
        show: s1,
        text: ['Обратите внимание на ', k(holders.length === 1 ? `эту цифру ${d}` : `эти цифры ${d}`), ' и ', a('выделенные области'), ...chainNote, '.'],
      });
    }
    const s2 = copyShow(s1);
    s2.units = [step.unit];
    s2.target = c;
    pages.push({
      title,
      show: s2,
      text: holders.length
        ? ['В ', u(thisPrep(step.unit)), ` цифру ${d} можно поставить только в одну клетку — остальные закрыты.`]
        : ['С ', x('вычеркнутыми вариантами'), ' в ', u(thisPrep(step.unit)), ` для цифры ${d} осталась только одна клетка.`],
    });
    const s3 = copyShow(s2);
    s3.reveal = d;
    pages.push({ title, show: s3, text: ['Поэтому в ', tg('этой клетке'), ` должна быть цифра ${d}.`] });
    return pages;
  }

  if (step.type === 'nakedSingle') {
    const title = 'Единственная цифра';
    const s1 = copyShow(base);
    s1.key = new Set();
    s1.cands = new Map();
    s1.units = [];
    s1.target = c;
    s1.area = new Set();
    [rowUnit(ROW_OF[c]), colUnit(COL_OF[c]), boxUnit(BOX_OF[c])].forEach((h) => addUnit(s1.area, h));
    pages.push({ title, show: s1, text: ['Посмотрите на ', tg('эту клетку'), ' и ', a('её строку, столбец и блок'), '.'] });
    // по одной «мешающей» цифре каждого значения: сначала из строки, потом столбца, потом блока
    const present = [];
    const s2 = copyShow(s1);
    for (let digit = 1; digit <= 9; digit++) {
      if (digit === d || excludedBy(c, digit)) continue;
      const holder = [rowUnit(ROW_OF[c]), colUnit(COL_OF[c]), boxUnit(BOX_OF[c])]
        .flatMap((h) => UNITS[h]).find((i) => values[i] === digit);
      if (holder !== undefined) {
        s2.key.add(holder);
        present.push(digit);
      }
    }
    const missing = afterChain ? [' (остальные ', x('вычеркнуты выше'), ')'] : [];
    pages.push({
      title,
      show: s2,
      text: [`Здесь уже есть ${ord(present.length, 'цифра', 'цифры', 'цифр')} `, k(list(present.map(String))), ...missing,
        ` — для этой клетки из 1–9 осталась только ${d}.`],
    });
    const s3 = copyShow(s2);
    s3.reveal = d;
    pages.push({ title, show: s3, text: ['Поэтому в ', tg('этой клетке'), ` должна быть цифра ${d}.`] });
    return pages;
  }

  // lastCell
  const title = 'Последняя свободная клетка';
  const s1 = copyShow(base);
  s1.key = new Set();
  s1.cands = new Map();
  s1.area = new Set();
  s1.units = [step.unit];
  s1.target = c;
  pages.push({ title, show: s1, text: ['В ', u(thisPrep(step.unit)), ' пустой осталась только ', tg('одна клетка'), '.'] });
  const s2 = copyShow(s1);
  s2.reveal = d;
  pages.push({ title, show: s2, text: [`Из цифр 1–9 здесь не хватает только ${d} — она и встанет в `, tg('эту клетку'), '.'] });
  return pages;
}

// ---------- сборка ----------

function finish(pages, action) {
  const last = pages.at(-1).show;
  return {
    pages,
    steps: pages.map((p) => ({ title: p.title, text: plain(p.text) })),
    action,
    highlight: { area: last.area, key: last.key, elim: new Set(last.elim.keys()), target: last.target },
  };
}

/**
 * Подсказка для текущей доски.
 * values — цифры на доске (0 — пусто), solution — решение.
 */
export function buildHint(values, solution) {
  const mistake = values.findIndex((v, i) => v && v !== solution[i]);
  if (mistake >= 0) {
    const show = emptyShow();
    show.target = mistake;
    show.wrong = mistake;
    return finish([{
      title: 'Ошибка',
      show,
      text: ['В ', { t: 'этой клетке', m: 'wrong' }, ` стоит неверная цифра ${values[mistake]} — её нужно стереть.`],
    }], { kind: 'erase', cell: mistake });
  }

  const found = nextHint(values);
  if (found) {
    const pages = [];
    let base = emptyShow();
    for (const s of found.chain) {
      const page = eliminationPage(s, base);
      pages.push(page);
      base = page.show;
    }
    pages.push(...placementPages(values, found.step, base, found.chain.length > 0));
    return finish(pages, { kind: 'place', cell: found.step.cell, digit: found.step.digit });
  }

  // Логики наших приёмов не хватило — открываем клетку, где меньше всего вариантов.
  const cand = candidatesFor(values);
  let cell = -1;
  for (let i = 0; i < 81; i++) {
    if (!values[i] && (cell < 0 || popcount(cand[i]) < popcount(cand[cell]))) cell = i;
  }
  if (cell < 0) return null;
  const show = emptyShow();
  show.target = cell;
  show.reveal = solution[cell];
  return finish([{
    title: 'Открываем клетку',
    show,
    text: ['Здесь нужен приём сложнее доступных подсказок, поэтому просто откроем ', { t: 'эту клетку', m: 'target' },
      `: в ней ${solution[cell]}.`],
  }], { kind: 'place', cell, digit: solution[cell] });
}
