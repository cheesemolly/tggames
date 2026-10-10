// «Логические схемы» — схема на странице: ставит рисунок (art.js) в <svg> и приводит его к состоянию —
// что стоит в гнёздах, под током ли источники, какие лампы должны гореть, где сейчас ток.
// Здесь всё мгновенно: бег тока по проводам и остальные анимации — в index.js поверх этих же классов.
// Этим же модулем рисуется лист всех уровней (tools/logic-gates-sheet.html).

import { board, chip, bead } from './art.js';

/** Поставить схему уровня в svg. → ссылки на её части. */
export function mountBoard(svg, level, lay) {
  svg.setAttribute('viewBox', `${lay.box.x} ${lay.box.y} ${lay.box.w} ${lay.box.h}`);
  svg.innerHTML = board(level, lay);
  const all = (sel) => [...svg.querySelectorAll(sel)];
  const byIndex = (sel, attr) => all(sel).sort((a, b) => Number(a.dataset[attr]) - Number(b.dataset[attr]));
  const lines = (g) => ({
    g, glow: [...g.querySelectorAll('.lg-glow')], live: [...g.querySelectorAll('.lg-live')], sparks: [...g.querySelectorAll('.lg-sparks')],
  });
  return {
    svg, level, lay,
    nets: new Map(all('.lg-net').map((g) => [Number(g.dataset.net), { ...lines(g), dots: [...g.querySelectorAll('.lg-dot')] }])),
    tails: new Map(all('.lg-tail').map((g) => [g.dataset.pin, lines(g)])),
    marks: new Map(all('.lg-mark').map((g) => [g.dataset.pin, g])),
    sockets: byIndex('.lg-socket-slot', 'socket'),
    rings: byIndex('.lg-ring-slot', 'ring'),
    gates: byIndex('.lg-gate', 'gate'),
    sources: byIndex('.lg-src', 'src'),
    lamps: byIndex('.lg-lamp', 'out'),
    washes: byIndex('.lg-wash', 'out'),
  };
}

/** Детали в гнёздах и на колечках. Меняется только то, что изменилось, — стоящие детали не перерисовываются. */
export function paintSetup(refs, setup, locks = { lockK: [], lockR: [] }) {
  refs.sockets.forEach((g, k) => {
    const kind = setup.kinds[k] ?? '';
    const locked = locks.lockK.includes(k);
    if ((g.dataset.kind ?? '') !== kind) {
      g.dataset.kind = kind;
      g.querySelector('.lg-slot').innerHTML = kind ? chip(kind) : '';
    }
    g.classList.toggle('lg-filled', Boolean(kind));
    g.classList.toggle('lg-locked', locked);
  });
  refs.rings.forEach((g, k) => {
    const on = setup.nots[k] ? '1' : '';
    if ((g.dataset.on ?? '') !== on) {
      g.dataset.on = on;
      g.querySelector('.lg-slot').innerHTML = on ? bead() : '';
    }
    g.classList.toggle('lg-filled', Boolean(on));
    g.classList.toggle('lg-locked', locks.lockR.includes(k));
  });
}

/** Положение источников и цель ламп в проверке row. */
export function paintRow(refs, row) {
  refs.sources.forEach((g, i) => g.classList.toggle('lg-on', row.src[i] === 1));
  refs.lamps.forEach((g, i) => g.classList.toggle('lg-want-off', row.want[i] === 0));
}

/** Стоит ли «НЕ» на входе (впаянное или надетое на колечко). */
export function hasBead(refs, key) {
  const mark = refs.marks.get(key);
  if (!mark) return false;
  return !mark.classList.contains('lg-ring-slot') || mark.classList.contains('lg-filled');
}

/** Значение на входе потребителя после «НЕ». */
export function pinValue(level, res, key) {
  if (key[0] === 'o') return res.outs[Number(key.slice(1))];
  const [g, k] = key.slice(1).split(':').map(Number);
  return res.pins[g][k];
}

/**
 * Ток по схеме — сразу весь. res — расчёт (evaluate) или null: всё погасить.
 * row — проверка, с которой сверяются лампы (чтобы отметить загоревшуюся зря и не загоревшуюся).
 */
export function paintSignals(refs, res, row = null) {
  const { level } = refs;
  const S = level.sources.length;
  const lit = (el, on) => el.classList.toggle('lg-lit', Boolean(on));
  for (const [node, net] of refs.nets) {
    const on = res?.nodes[node] === 1;
    [...net.glow, ...net.live, ...net.sparks, ...net.dots].forEach((el) => lit(el, on));
  }
  for (const [key, tail] of refs.tails) {
    const on = res ? pinValue(level, res, key) === 1 : false;
    [...tail.glow, ...tail.live, ...tail.sparks].forEach((el) => lit(el, on));
    refs.marks.get(key)?.classList.toggle('lg-hot', on && hasBead(refs, key));
  }
  refs.gates.forEach((g, i) => g.classList.toggle('lg-hot', res?.nodes[S + i] === 1));
  refs.lamps.forEach((g, i) => {
    const on = res?.outs[i] === 1;
    lit(g, on);
    lit(refs.washes[i], on && (!row || row.want[i] === 1));
    g.classList.toggle('lg-wrong', Boolean(res && row && on && row.want[i] === 0));
    g.classList.toggle('lg-miss', Boolean(res && row && !on && row.want[i] === 1));
  });
}
