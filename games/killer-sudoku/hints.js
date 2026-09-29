// Подсказки судоку-киллера — страницами, как в судоку (по образцу sudoku.com): у каждой страницы свой текст и
// своя картинка на доске. На sudoku.com Killer подсказка просто открывает клетку, и игроки называют её
// бесполезной, — здесь каждый приём объясняется: последняя клетка группы, сочетания суммы, правило 45
// (по одной строке/столбцу/блоку, по нескольким линиям, «невидимые» группы), обязательная цифра группы и
// обычные приёмы судоку. Порядок поиска: ошибка на доске → логика (techniques.js; исключения — страницами перед
// расстановкой) → если логики не хватило, просто открываем клетку.
//
// Подсказка: { pages, steps, action, highlight }
//   page  = { title, text: [сегмент], show }
//   сегмент — строка или { t, m } — кусок текста с меткой цвета: key | area | unit | cage | target | elim | wrong
//   show  = { area: Set, key: Set, units: [u], cages: [c], target, reveal, wrong, cands: Map(cell → [d]), elim: Map }
//   steps = [{ title, text }] — те же страницы простым текстом; highlight — подсветка последней страницы.

import { UNITS, ROW_OF, COL_OF, BOX_OF, PEERS, unitKind, digitsOf, popcount, rowUnit, colUnit, boxUnit } from './grid.js';
import { nextHint, candidatesFor, cageState } from './techniques.js';
import { COMBOS } from './cages.js';

// «в этом блоке», «эта строка» — в каком падеже и роде называть группу
const THIS_PREP = { row: 'этой строке', col: 'этом столбце', box: 'этом блоке' };
const THIS_PREP_PLURAL = { row: 'этих строках', col: 'этих столбцах' };
const GEN_PLURAL = { row: 'строк', col: 'столбцов' };
const KIND_PREP = { row: 'одной строке', col: 'одном столбце', box: 'одном блоке' };
const KIND_GEN = { row: 'этой строки', col: 'этого столбца', box: 'этого блока' };

const thisPrep = (u) => THIS_PREP[unitKind(u)];

function list(items, joiner = 'и') {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} ${joiner} ${items.at(-1)}`;
}
const digitList = (mask) => list(digitsOf(mask).map(String));
const plural = (n, one, few, many) => {
  const a = n % 10;
  const b = n % 100;
  if (b >= 11 && b <= 14) return many;
  if (a === 1) return one;
  if (a >= 2 && a <= 4) return few;
  return many;
};
// «из двух разных цифр», «в трёх клетках»
const GEN = ['', 'одной', 'двух', 'трёх', 'четырёх', 'пяти', 'шести', 'семи', 'восьми', 'девяти'];
/** Набор цифр суммой: «1 + 3 + 5». */
const setText = (mask) => digitsOf(mask).join(' + ');
const setsText = (sets) => list(sets.map(setText), 'или');

/** «этой строке», «этих двух строках», «этих трёх столбцах». */
function regionPrep(units) {
  if (units.length === 1) return thisPrep(units[0]);
  const kind = unitKind(units[0]);
  return `этих ${units.length === 2 ? 'двух' : 'трёх'} ${kind === 'row' ? 'строках' : 'столбцах'}`;
}

function emptyShow() {
  return {
    area: new Set(), key: new Set(), units: [], cages: [], target: -1, reveal: 0, wrong: -1,
    cands: new Map(), elim: new Map(),
  };
}

/** Копия картинки страницы — следующая страница дорисовывает поверх предыдущей. */
function copyShow(s) {
  return {
    area: new Set(s.area), key: new Set(s.key), units: [...s.units], cages: [...s.cages], target: s.target,
    reveal: s.reveal, wrong: s.wrong,
    cands: new Map([...s.cands].map(([k, v]) => [k, [...v]])), elim: new Map([...s.elim].map(([k, v]) => [k, [...v]])),
  };
}

/** Картинка «с чистого листа», но вычеркнутое раньше остаётся видно. */
function freshShow(base) {
  const show = copyShow(base);
  show.key = new Set();
  show.area = new Set();
  show.units = [];
  show.cages = [];
  show.cands = new Map();
  show.target = -1;
  return show;
}

const addUnit = (set, u) => UNITS[u].forEach((i) => set.add(i));
const plain = (segments) => segments.map((s) => (typeof s === 'string' ? s : s.t)).join('');

const k = (t) => ({ t, m: 'key' });
const a = (t) => ({ t, m: 'area' });
const u = (t) => ({ t, m: 'unit' });
const g = (t) => ({ t, m: 'cage' });
const tg = (t) => ({ t, m: 'target' });
const x = (t) => ({ t, m: 'elim' });

/** Общая группа двух клеток: строка или столбец важнее блока (их и видно на доске, как в sudoku.com). */
function sharedUnit(p, q) {
  if (ROW_OF[p] === ROW_OF[q]) return rowUnit(ROW_OF[p]);
  if (COL_OF[p] === COL_OF[q]) return colUnit(COL_OF[p]);
  if (BOX_OF[p] === BOX_OF[q]) return boxUnit(BOX_OF[p]);
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
  for (let i = 0; i < 81; i++) if (values[i] === d) all.push(i);
  while (rest.length) {
    let best = -1;
    let bestCover = [];
    for (const h of all) {
      const cover = rest.filter((e) => PEERS[e].includes(h));
      if (cover.length > bestCover.length) {
        best = h;
        bestCover = cover;
      }
    }
    if (best < 0) break;                       // закрыто не цифрой (исключением цепочки или суммой) — не наше дело
    holders.push(best);
    for (const e of bestCover) houses.add(sharedUnit(best, e));
    rest = rest.filter((e) => !bestCover.includes(e));
  }
  return { holders, houses };
}

/** Вычеркнутое шагом — на картинку (красным с чертой). */
function markEliminations(show, step) {
  for (const { cell, digit } of step.eliminations) {
    const list0 = show.elim.get(cell) ?? [];
    if (!list0.includes(digit)) list0.push(digit);
    show.elim.set(cell, list0);
  }
}

/** Сумма группы словами: «группа с суммой 17». */
const cageName = (cage) => `группе с суммой ${cage.sum}`;

// ---------- правило 45: первая страница («сумма области — 45») ----------

function lawPage(title, base, units, parts) {
  const show = freshShow(base);
  show.units = [...units];
  const total = 45 * units.length;
  return {
    title,
    show,
    text: ['В ', u(regionPrep(units)), ` каждая цифра от 1 до 9 стоит по разу${units.length > 1 ? ' в каждой линии' : ''}, `,
      `поэтому их сумма — всегда ${total}.`, ...parts],
  };
}

// ---------- исключения (страницы цепочки) ----------

function eliminationPages(values, step, base, layout) {
  const show = freshShow(base);
  markEliminations(show, step);
  const d = step.digit;
  const n = step.cells?.length ?? 0;
  const theseCells = n === 1 ? 'этой клетке' : 'этих клетках';
  const cand = (cells, digits) => cells.forEach((c) => {
    show.key.add(c);
    show.cands.set(c, digits);
  });

  switch (step.type) {
    case 'cageCombo': {
      const cage = layout.cages[step.cage];
      const { rest, empty } = cageState(values, cage);
      show.cages = [step.cage];
      empty.forEach((c) => {
        show.key.add(c);
        show.cands.set(c, digitsOf(step.allow.get(c)));
      });
      const all = (COMBOS[empty.length]?.[rest] ?? []).filter((m) => !step.sets.some((s) => s === m)
        && !(m & cageState(values, cage).used));
      const union = step.sets.reduce((m, s) => m | s, 0);
      const byNeighbours = step.eliminations.some(({ digit }) => union & (1 << digit));
      const n = empty.length;
      const few = step.sets.length <= 3;
      const sets = few ? `${step.sets.length === 1 ? 'только ' : ''}${setsText(step.sets)}` : '';
      const why = all.length ? [' (остальные наборы не встают из-за цифр рядом)'] : [];
      const head = n < cage.cells.length
        ? ['В ', g(cageName(cage)), ` уже ${cage.cells.length - n === 1 ? 'стоит' : 'стоят'} `
          + `${list(cage.cells.filter((i) => values[i]).map((i) => String(values[i])))} — в ${GEN[n]} пустых `
          + `${n === 1 ? 'клетке' : 'клетках'} нужно добрать ${rest}${few ? `: ${sets}` : ''}`]
        : [g(`Сумму ${cage.sum}`), ` в ${GEN[n]} клетках разными цифрами можно набрать ${few ? sets : `${step.sets.length} способами`}`];
      const tail = byNeighbours
        ? ['. С учётом цифр рядом в ', k(theseCells), ' остаются только ', k('эти варианты'), ' — ', x('лишние'), ' вычёркиваем.']
        : ['. Других цифр в ', k(theseCells), ' быть не может — ', x('лишние варианты'), ' вычёркиваем.'];
      return [{ show, title: 'Сочетания суммы', text: [...head, ...why, ...tail] }];
    }

    case 'cageHouse': {
      const cage = layout.cages[step.cage];
      show.cages = [step.cage];
      show.units = [step.unit];
      cand(step.cells, [d]);
      addUnit(show.area, step.unit);
      step.cells.forEach((c) => show.area.delete(c));
      return [{
        show,
        title: 'Обязательная цифра группы',
        text: [`Цифра ${d} есть в каждом подходящем наборе `, g(`группы с суммой ${cage.sum}`), ` и может стоять в ней только в `,
          k(theseCells), ` — а они в ${KIND_PREP[unitKind(step.unit)]}. Значит, в `, x(`других клетках ${KIND_GEN[unitKind(step.unit)]}`),
          ` цифры ${d} быть не может.`],
      }];
    }

    case 'innieCage':
    case 'outieCage': {
      const inner = step.type === 'innieCage';
      const cages = inner ? step.inside : step.touching;
      const total = 45 * step.units.length;
      const cagesSum = cages.reduce((s, c) => s + layout.cages[c].sum, 0);
      const first = lawPage('Невидимая группа', base, step.units, []);
      first.show.cages = [...cages];
      cages.forEach((c) => layout.cages[c].cells.forEach((i) => first.show.area.add(i)));
      first.text.push(inner
        ? [' Группы, которые целиком лежат внутри, дают вместе ', a(String(cagesSum)), '.']
        : [' Группы, которые её задевают, дают вместе ', a(String(cagesSum)), ` — на ${cagesSum - total} больше.`]);
      first.text = first.text.flat();
      const known = step.virtual.cells.filter((i) => values[i]);
      const cells = step.cells;
      cand(cells, []);
      cells.forEach((c) => show.cands.set(c, digitsOf(step.allow.get(c))));
      show.units = [...step.units];
      const knownText = known.length ? ` (и уже стоящие ${list(known.map((i) => String(values[i])))})` : '';
      const sum = step.virtual.sum;
      return [first, {
        show,
        title: 'Невидимая группа',
        text: [inner ? 'Значит, ' : 'Лишнее приходится на клетки снаружи: ', k(n === 2 ? 'эти две клетки' : `эти ${n === 3 ? 'три' : 'четыре'} клетки`),
          `${knownText} вместе дают ${inner ? `${total} − ${cagesSum}` : `${cagesSum} − ${total}`} = ${sum} и все разные — как невидимая группа. `,
          step.sets.length <= 3 ? `${step.rest} из ${GEN[n]} разных цифр — ${step.sets.length === 1 ? 'только ' : ''}${setsText(step.sets)}. ` : '',
          x('Лишние варианты'), ' вычёркиваем.'],
      }];
    }

    case 'pointing': {
      show.units = [step.unit];
      cand(step.cells, [d]);
      addUnit(show.area, step.line);
      const kind = unitKind(step.line);
      return [{
        show,
        title: n === 2 ? 'Указывающая пара' : 'Указывающая тройка',
        text: ['В ', u(thisPrep(step.unit)), ` цифра ${d} может стоять только в `, k(theseCells), ` — они в ${KIND_PREP[kind]}. `,
          'Значит, в ', x(`других клетках ${KIND_GEN[kind]}`), ` цифры ${d} быть не может.`],
      }];
    }
    case 'boxLine':
      show.units = [step.unit];
      cand(step.cells, [d]);
      addUnit(show.area, step.box);
      return [{
        show,
        title: 'Блок и линия',
        text: ['В ', u(thisPrep(step.unit)), ` цифра ${d} может стоять только в `, k(theseCells), ' — и все они в одном блоке. ',
          'Значит, в ', x('других клетках этого блока'), ` цифры ${d} быть не может.`],
      }];
    case 'nakedPair':
    case 'nakedTriple':
      show.units = [step.unit];
      cand(step.cells, digitsOf(step.digits));
      return [{
        show,
        title: step.type === 'nakedPair' ? 'Открытая пара' : 'Открытая тройка',
        text: [k(n === 2 ? 'Эти две клетки' : 'Эти три клетки'), ' в ', u(thisPrep(step.unit)), ` могут содержать только ${digitList(step.digits)}. `,
          'Эти цифры займут именно их — в ', x('остальных клетках'), ' их быть не может.'],
      }];
    case 'hiddenPair':
    case 'hiddenTriple':
      show.units = [step.unit];
      cand(step.cells, digitsOf(step.digits));
      return [{
        show,
        title: step.type === 'hiddenPair' ? 'Скрытая пара' : 'Скрытая тройка',
        text: [`Цифры ${digitList(step.digits)} в `, u(thisPrep(step.unit)), ' могут стоять только в ', k(theseCells), '. ',
          'Значит, другим цифрам там места нет — ', x('лишние варианты'), ' вычёркиваем.'],
      }];
    case 'xWing': {
      const kind = unitKind(step.lines[0]);
      const cross = unitKind(step.crosses[0]);
      show.units = [...step.lines];
      cand(step.cells, [d]);
      step.crosses.forEach((c) => addUnit(show.area, c));
      return [{
        show,
        title: 'X-крыло',
        text: ['В ', u(THIS_PREP_PLURAL[kind]), ` цифра ${d} может стоять только в `, k('этих четырёх клетках'),
          ` — по две в двух ${GEN_PLURAL[cross]}. Она займёт две из них крест-накрест, поэтому в `,
          x(`других клетках этих ${GEN_PLURAL[cross]}`), ` цифры ${d} быть не может.`],
      }];
    }
    default:
      return [{ show, title: 'Исключение', text: ['Вычёркиваем ', x('лишние варианты'), '.'] }];
  }
}

// ---------- расстановка ----------

function placementPages(values, step, base, afterChain, layout) {
  const d = step.digit;
  const c = step.cell;
  const pages = [];
  const excludedBy = (cell, digit) => (base.elim.get(cell) ?? []).includes(digit);

  if (step.type === 'cageLast') {
    const cage = layout.cages[step.cage];
    const title = 'Последняя клетка группы';
    const s1 = freshShow(base);
    s1.cages = [step.cage];
    s1.target = c;
    if (cage.cells.length === 1) {
      s1.reveal = d;
      return [{ title: 'Группа из одной клетки', show: s1, text: ['В ', g('этой группе'), ' всего одна клетка, и её сумма — ', tg(String(d)), '. Это и есть цифра.'] }];
    }
    const placed = cage.cells.filter((i) => i !== c).map((i) => values[i]);
    s1.key = new Set(cage.cells.filter((i) => i !== c));
    pages.push({ title, show: s1, text: ['В ', g(cageName(cage)), ' пустой осталась только ', tg('одна клетка'), '.'] });
    const s2 = copyShow(s1);
    s2.reveal = d;
    pages.push({ title, show: s2, text: [`${cage.sum} − ${placed.join(' − ')} = ${d} — это цифра для `, tg('этой клетки'), '.'] });
    return pages;
  }

  if (['innie', 'outie', 'innieMulti', 'outieMulti'].includes(step.type)) {
    const inner = step.type.startsWith('innie');
    const cages = inner ? step.inside : step.touching;
    const total = 45 * step.units.length;
    const cagesSum = cages.reduce((s, q) => s + layout.cages[q].sum, 0);
    const title = 'Правило 45';
    const p1 = lawPage(title, base, step.units, []);
    pages.push(p1);
    const s2 = copyShow(p1.show);
    s2.cages = [...cages];
    cages.forEach((q) => layout.cages[q].cells.forEach((i) => s2.area.add(i)));
    pages.push({
      title,
      show: s2,
      text: inner
        ? [`Группы, которые целиком лежат внутри, дают вместе `, a(String(cagesSum)), '.']
        : [`Группы, которые задевают ${step.units.length > 1 ? 'эти линии' : unitKind(step.units[0]) === 'box' ? 'этот блок' : 'эту линию'}, дают вместе `,
          a(String(cagesSum)), ` — на ${cagesSum - total} больше ${total}.`],
    });
    const rest = (inner ? step.innies : step.outies).filter((i) => i !== c);
    const known = rest.filter((i) => values[i]).map((i) => values[i]);
    const s3 = copyShow(s2);
    s3.target = c;
    s3.key = new Set(rest.filter((i) => values[i]));
    const knownSum = known.reduce((s, v) => s + v, 0);
    const knownText = known.length ? [' Рядом с ней ', k(`уже стоят ${list(known.map(String))}`), '.'] : [];
    const formula = inner
      ? `${total} − ${cagesSum}${knownSum ? ` − ${knownSum}` : ''} = ${d}`
      : `${cagesSum} − ${total}${knownSum ? ` − ${knownSum}` : ''} = ${d}`;
    pages.push({
      title,
      show: s3,
      text: inner
        ? ['Вне этих групп осталась ', tg('одна пустая клетка'), '.', ...knownText]
        : ['Эти лишние ', String(cagesSum - total), ' приходятся на клетки снаружи — пустая из них ', tg('одна'), '.', ...knownText],
    });
    const s4 = copyShow(s3);
    s4.reveal = d;
    pages.push({ title, show: s4, text: [`${formula} — это цифра для `, tg('этой клетки'), '.'] });
    return pages;
  }

  if (step.type === 'hiddenSingle') {
    const title = 'Единственное место';
    const need = UNITS[step.unit].filter((e) => !values[e] && e !== c && !excludedBy(e, d));
    const { holders, houses } = blockersOf(values, d, need);
    const s1 = freshShow(base);
    s1.key = new Set(holders);
    houses.forEach((h) => addUnit(s1.area, h));
    const chainNote = afterChain ? [' и ', x('вычеркнутые выше варианты')] : [];
    // все клетки закрыты исключениями цепочки — «мешающих» цифр нет, сразу к группе
    if (holders.length) {
      pages.push({
        title,
        show: s1,
        text: ['Обратите внимание на ', k(holders.length === 1 ? `эту цифру ${d}` : `эти цифры ${d}`), afterChain ? ', ' : ' и ',
          a('выделенные области'), ...chainNote, '.'],
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
    const s1 = freshShow(base);
    s1.target = c;
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
      text: present.length
        ? [`Здесь уже есть ${plural(present.length, 'цифра', 'цифры', 'цифр')} `, k(list(present.map(String))), ...missing,
          ` — для этой клетки из 1–9 осталась только ${d}.`]
        : ['Все другие цифры для этой клетки ', x('вычеркнуты выше'), ` — осталась только ${d}.`],
    });
    const s3 = copyShow(s2);
    s3.reveal = d;
    pages.push({ title, show: s3, text: ['Поэтому в ', tg('этой клетке'), ` должна быть цифра ${d}.`] });
    return pages;
  }

  // lastCell
  const title = 'Последняя свободная клетка';
  const s1 = freshShow(base);
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
 * values — цифры на доске (0 — пусто), solution — решение, layout — { cages, cageOf }.
 */
export function buildHint(values, solution, layout) {
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

  const found = nextHint(values, layout);
  if (found) {
    const pages = [];
    let base = emptyShow();
    for (const s of found.chain) {
      const more = eliminationPages(values, s, base, layout);
      pages.push(...more);
      base = more.at(-1).show;
    }
    pages.push(...placementPages(values, found.step, base, found.chain.length > 0, layout));
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
