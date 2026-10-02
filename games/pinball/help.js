// Подсказка к миссии (бета 'pinball-mission-help', владелец, 2026-10-02: «в миссиях ВООБЩЕ непонятно, что делать —
// возле миссии "?", которая обводит и подсказывает, куда бить»). Без DOM: по состоянию партии и описанию стола —
// заголовок, строки текста и метки на столе в его координатах (1000×1810). Метка — круг { c: [x, y], r } или
// «капсула» вокруг отрезка { a, b, r }; n — номер на метке, tone: 'go' — куда бить, 'fuel' — заправка.

import { MISSIONS, TIERS, tierOf, fuelLights } from './rules.js';

const PAD = 16;                                   // запас вокруг элемента

const fmt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const circle = (x, y, r, extra) => ({ c: [x, y], r, ...extra });
const capsule = (a, b, r, extra) => ({ a, b, r, ...extra });
/** Ряд мишеней одной капсулой: от начала первой до конца последней. */
const bank = (list, extra) => capsule(list[0].a, list[list.length - 1].b, 22, extra);
const dots = (list, r, extra) => list.map((p) => circle(p.x, p.y, r ?? (p.r ?? 14) + PAD, extra));
const mouth = (m, extra) => circle((m.x0 + m.x1) / 2, (m.y0 + m.y1) / 2 + 6, Math.max(m.x1 - m.x0, m.y1 - m.y0) / 2 + 14, extra);
const hole = (h, extra) => circle(h.x, h.y, h.r + PAD, extra);

/** Что делать на шаге миссии: текст и метки. Ключ — событие шага (`on` в MISSIONS). */
export const HOW = {
  ramp: {
    text: 'Рампа запуска — устье в центре слева. Удобнее всего бить правым флиппером наискосок.',
    marks: (e) => [mouth(e.mouths.ramp)],
  },
  reentry: {
    text: 'Дорожки возврата — три дорожки наверху стола. Бей сильно вверх по центру или запускай шарик пружиной.',
    marks: (e) => dots(e.reentry, 30),
  },
  attackUpgrade: {
    text: 'Пройди все три дорожки возврата наверху — каждая зажигается, три горят — бамперы прокачаны.',
    marks: (e) => dots(e.reentry, 30),
  },
  attackBumper: {
    text: 'Большие бамперы в центре сверху и спутник слева — каждый удар считается. Шарик в них прыгает сам.',
    marks: (e) => [...dots(e.attackBumpers), circle(e.satellite.x, e.satellite.y, e.satellite.r + PAD)],
  },
  satellite: {
    text: 'Спутник — бампер слева вверху. Каждый удар по нему считается.',
    marks: (e) => [circle(e.satellite.x, e.satellite.y, e.satellite.r + PAD)],
  },
  drop: {
    text: 'Падающие мишени: множитель — наверху слева, медали — под бамперами, ускорители — справа внизу. Каждая сбитая считается.',
    marks: (e) => [bank(e.multTargets), bank(e.medalTargets), bank(e.boostTargets)],
  },
  anyTarget: {
    text: 'Любые мишени — падающие и неподвижные, по всему столу. Каждая считается.',
    marks: (e) => [bank(e.multTargets), bank(e.medalTargets), bank(e.boostTargets), bank(e.hazL), bank(e.hazR),
      bank(e.missionTargets), bank(e.fuelTargets), capsule(e.wormT.a, e.wormT.b, 22)],
  },
  spot: {
    text: 'Неподвижные мишени: миссий (на платформе), радиации (слева), кометы (справа), заправки (вверху слева).',
    marks: (e) => [bank(e.missionTargets), bank(e.hazL), bank(e.hazR), bank(e.fuelTargets), capsule(e.wormT.a, e.wormT.b, 22)],
  },
  flagsUpgraded: {
    text: 'Сбей все три ускорителя справа. Они прокачивают по кругу: флаги, джекпот, бонус, сохранение бонуса — сбивай набор, пока не появится «Флаги прокачаны».',
    marks: (e) => [bank(e.boostTargets)],
  },
  hyperspace: {
    text: 'Гиперпространство — устье справа, выше середины стола. Удобнее бить левым флиппером наискосок.',
    marks: (e) => [mouth(e.mouths.hyper)],
  },
  hazRBank: {
    text: 'Три мишени-кометы справа вверху — сбей все три.',
    marks: (e) => [bank(e.hazR)],
  },
  hazLBank: {
    text: 'Три мишени радиации слева, на стенке канала, — сбей все три.',
    marks: (e) => [bank(e.hazL)],
  },
  wormhole: {
    text: 'Любая червоточина — цветные воронки: зелёная и красная наверху, жёлтая справа внизу.',
    marks: (e) => [hole(e.holes.wormG), hole(e.holes.wormR), hole(e.holes.wormY)],
  },
  wormG: { text: 'Зелёная червоточина — воронка слева наверху.', marks: (e) => [hole(e.holes.wormG)] },
  wormR: { text: 'Красная червоточина — воронка справа наверху.', marks: (e) => [hole(e.holes.wormR)] },
  wormY: { text: 'Жёлтая червоточина — воронка справа внизу.', marks: (e) => [hole(e.holes.wormY)] },
  launchUpgrade: {
    text: 'Отправь шарик на платформу через рампу запуска (1) и пройди три её дорожки (2) — все три должны загореться.',
    marks: (e) => [mouth(e.mouths.ramp, { n: 1 }), ...dots(e.launchLanes, 26).map((m, k) => (k === 2 ? { ...m, n: 2 } : m))],
  },
  blackHole: {
    text: 'Чёрная дыра — воронка в центре стола, над флипперами.',
    marks: (e) => [hole(e.holes.black)],
  },
  spin: {
    text: 'Флаги — вертушка наверху левого канала. Шарик залетает туда по верхней дуге: полный запуск пружиной или сильный удар вверх.',
    marks: (e) => [capsule(e.spinner.a, e.spinner.b, 26)],
  },
  warp: {
    text: 'Искривление — датчик слева вверху, под спутником.',
    marks: (e) => [circle(e.warp.x, e.warp.y, 18 + PAD)],
  },
  lane: {
    text: 'Любые дорожки: три наверху, нижние у флипперов и дорожки платформы. Каждый проход считается.',
    marks: (e) => [...dots(e.reentry, 30), ...dots(e.bottom, 30), ...dots(e.launchLanes, 26)],
  },
  outlane: {
    text: 'Внешние дорожки — крайние слева и справа внизу. Оттуда шарик уходит в сток, если не горит спасатель.',
    marks: (e) => dots(e.bottom.filter((b) => b.id.startsWith('out')), 32),
  },
  rebound: {
    text: 'Отскоки от резинок: рогатки над флипперами и резинки по бокам стола. Каждый отскок считается.',
    marks: (e) => [capsule([258, 1338], [325, 1542], 30), capsule([742, 1338], [675, 1542], 30),
      capsule([150, 725], [258, 792], 26), capsule([728, 648], [694, 578], 26)],
  },
  topFuel: {
    text: 'Верхний огонь левого топливного канала. Шарик проходит канал сверху: полный запуск пружиной.',
    marks: (e) => [circle(e.fuel[5].x, e.fuel[5].y, 20 + PAD)],
  },
  timeWarpExit: {
    text: 'Рампа запуска — повышение в звании, гиперпространство — понижение. Целься в рампу.',
    marks: (e) => [mouth(e.mouths.ramp, { n: 1 }), mouth(e.mouths.hyper)],
  },
};

/** Где заправиться: бонусная дорожка, мишени заправки, огни левого канала. */
const FUEL_TEXT = 'Заправка: бонусная дорожка слева внизу, три мишени на верхней дуге слева, огни левого канала.';
const fuelMarks = (e) => {
  const lane = e.bottom.find((b) => b.id === 'bonusLane');
  return [circle(lane.x, lane.y, 32, { tone: 'fuel' }), bank(e.fuelTargets, { tone: 'fuel' }),
    capsule([e.fuel[0].x, e.fuel[0].y], [e.fuel[5].x, e.fuel[5].y], 26, { tone: 'fuel' })];
};

/**
 * Подсказка к текущему состоянию: { title, lines: [строка], steps?: [{ text, state: 'done'|'now'|'next' }], marks }.
 * e — table.elements.
 */
export function missionHelp(g, e) {
  if (g.mission) {
    const def = MISSIONS[g.mission.id];
    const step = def.steps[g.mission.step];
    const how = HOW[step.on];
    const marks = how.marks(e).map((m) => ({ tone: 'go', ...m }));
    const lines = [how.text];
    const low = fuelLights(g) <= 2;
    if (low) {
      lines.push(`Топливо кончается — без него миссия прервётся. ${FUEL_TEXT}`);
      marks.push(...fuelMarks(e));
    }
    lines.push(`Награда: ${fmt(def.reward)} очков.${low ? '' : ' Пока идёт миссия, тратится топливо (жёлтые огни на панели).'}`);
    const steps = def.steps.length > 1 ? def.steps.map((s, k) => ({
      text: s.n > 1 ? `${s.text}: ${k === g.mission.step ? g.mission.left : s.n}` : s.text,
      state: k < g.mission.step ? 'done' : k === g.mission.step ? 'now' : 'next',
    })) : null;
    // у миссии из нескольких шагов текущий шаг — жирным в списке, отдельной строкой не повторяется
    const now = steps ? null : step.n > 1 ? `${step.text}: ${g.mission.left}` : step.text;
    return { title: def.name, now, steps, lines, marks };
  }
  if (g.missionPick) {
    const def = MISSIONS[g.missionPick];
    if (g.fuel <= 0) {
      return {
        title: def.name, now: 'Сначала заправь корабль',
        lines: ['Миссию нельзя начать с пустым баком.', FUEL_TEXT, 'Потом — в рампу запуска.'],
        marks: [...fuelMarks(e), mouth(e.mouths.ramp, { tone: 'go', n: 2 })],
      };
    }
    return {
      title: def.name, now: 'Попади в рампу запуска',
      lines: [HOW.ramp.text, 'Как только шарик войдёт в рампу, миссия начнётся.'],
      marks: [mouth(e.mouths.ramp, { tone: 'go' })],
    };
  }
  const tier = TIERS[tierOf(g.rank)];
  const marks = e.missionTargets.map((t, k) => capsule(t.a, t.b, 22, { tone: 'go', n: k + 1 }));
  marks.push(mouth(e.mouths.ramp, { tone: 'go', n: '→' }));
  return {
    title: 'Как начать миссию', now: 'Сбей мишень миссий, потом — рампа запуска',
    lines: [
      'Мишени миссий — на правой стенке платформы слева. Каждая выбирает миссию:',
      ...tier.slice(0, 3).map((id, k) => `${k + 1} — ${MISSIONS[id].name}`),
      `Зажжёшь все три — ${MISSIONS[tier[3]].name}.`,
      'Потом попади в рампу запуска (→) — миссия начнётся. Нужно топливо — жёлтые огни на панели.',
    ],
    marks,
  };
}
