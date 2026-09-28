// Правила пинбола — как в 3D Pinball Space Cadet (по разбору оригинала): звания, миссии, топливо, множитель поля,
// ускорители, джекпот, бонус, гиперпространство, червоточины, чёрная дыра, гравитационный колодец, откидные спасатели,
// удар умения, сохранение шарика, наклон. Без DOM и физики: index.js сообщает, во что попал шарик (hit), и зовёт tick(dt);
// правила меняют состояние и складывают эффекты в game.fx (звук, сообщение, тряска, команды столу).
//
// Очки как в оригинале; помеченные (U) не умножаются на множитель поля.

export const RANKS = ['Кадет', 'Мичман', 'Лейтенант', 'Капитан', 'Капитан-лейтенант', 'Коммандер', 'Коммодор', 'Адмирал', 'Адмирал флота'];
export const BALLS = 3;
export const FUEL_FULL = 72;                 // с — полный бак
export const PROGRESS_FULL = 18;             // огней до повышения
const MULTS = [1, 2, 3, 5, 10];
const BUMPER_POINTS = [500, 1000, 1500, 2000];
const LAUNCH_BUMPER_POINTS = [1500, 2500, 3500, 4500];
const SKILL = [0, 15000, 30000, 75000, 30000, 15000, 7500];

/** Миссии: название, что сделать (для панели), шаги. Шаг — { on: событие, n: сколько, text }. */
export const MISSIONS = {
  launchTraining: { name: 'Учебный запуск', reward: 500000, lights: 6, steps: [{ on: 'ramp', n: 3, text: 'Рамп запуска осталось' }] },
  reentryTraining: { name: 'Учебное возвращение', reward: 500000, lights: 6, steps: [{ on: 'reentry', n: 3, text: 'Дорожек возврата осталось' }] },
  targetPractice: { name: 'Стрельба по мишеням', reward: 500000, lights: 6, steps: [{ on: 'attackBumper', n: 8, text: 'Ударов по бамперам осталось' }] },
  science: { name: 'Наука', reward: 750000, lights: 9, steps: [{ on: 'drop', n: 9, text: 'Падающих мишеней осталось' }] },
  bugHunt: { name: 'Охота на жуков', reward: 750000, lights: 7, steps: [{ on: 'anyTarget', n: 15, text: 'Мишеней осталось' }] },
  rescue: { name: 'Спасение', reward: 750000, lights: 7, steps: [{ on: 'flagsUpgraded', n: 1, text: 'Прокачай флаги: собери ускорители' }, { on: 'hyperspace', n: 1, text: 'Теперь — в гиперпространство' }] },
  alienMenace: { name: 'Угроза пришельцев', reward: 750000, lights: 7, steps: [{ on: 'attackUpgrade', n: 1, text: 'Прокачай бамперы: три дорожки возврата' }, { on: 'attackBumper', n: 8, text: 'Ударов по бамперам осталось' }] },
  strayComet: { name: 'Блуждающая комета', reward: 1000000, lights: 8, steps: [{ on: 'hazRBank', n: 1, text: 'Сбей три кометы справа' }, { on: 'hyperspace', n: 1, text: 'Теперь — в гиперпространство' }] },
  spaceRadiation: { name: 'Космическая радиация', reward: 1000000, lights: 8, steps: [{ on: 'hazLBank', n: 1, text: 'Сбей три мишени радиации слева' }, { on: 'wormhole', n: 1, text: 'Теперь — в любую червоточину' }] },
  blackHole: { name: 'Чёрная дыра', reward: 1000000, lights: 8, steps: [{ on: 'launchUpgrade', n: 1, text: 'Прокачай бамперы платформы: три её дорожки' }, { on: 'blackHole', n: 1, text: 'Теперь — в чёрную дыру' }] },
  cosmicPlague: { name: 'Космическая чума', reward: 1750000, lights: 11, steps: [{ on: 'spin', n: 75, text: 'Оборотов флагов осталось' }, { on: 'warp', n: 1, text: 'Теперь — через искривление' }] },
  satelliteRetrieval: { name: 'Возврат спутника', reward: 1250000, lights: 9, steps: [{ on: 'satellite', n: 3, text: 'Ударов по спутнику осталось' }] },
  recon: { name: 'Разведка', reward: 1250000, lights: 9, steps: [{ on: 'lane', n: 15, text: 'Дорожек осталось' }] },
  doomsday: { name: 'Машина судного дня', reward: 1250000, lights: 9, steps: [{ on: 'outlane', n: 3, text: 'Внешних дорожек осталось' }] },
  secret: { name: 'Секретная миссия', reward: 1500000, lights: 10, steps: [{ on: 'wormY', n: 1, text: 'Жёлтая червоточина' }, { on: 'wormR', n: 1, text: 'Красная червоточина' }, { on: 'wormG', n: 1, text: 'Зелёная червоточина' }] },
  timeWarp: { name: 'Искривление времени', reward: 2000000, lights: 12, steps: [{ on: 'rebound', n: 25, text: 'Отскоков осталось' }, { on: 'timeWarpExit', n: 1, text: 'Рампа — повышение, гиперпространство — понижение' }] },
  maelstrom: {
    name: 'Мальстрём', reward: 5000000, lights: 18, steps: [
      { on: 'drop', n: 3, text: 'Падающих мишеней' }, { on: 'spot', n: 3, text: 'Неподвижных мишеней' }, { on: 'lane', n: 5, text: 'Дорожек' },
      { on: 'topFuel', n: 1, text: 'Верхняя топливная дорожка' }, { on: 'ramp', n: 1, text: 'Рампа запуска' }, { on: 'spin', n: 1, text: 'Флаги' },
      { on: 'wormhole', n: 1, text: 'Любая червоточина' }, { on: 'hyperspace', n: 1, text: 'Гиперпространство' },
    ],
  },
};

/** Какие миссии дают мишени миссий на каждом звании: [мишень 1, 2, 3, все три]. */
export const TIERS = [
  ['launchTraining', 'reentryTraining', 'targetPractice', 'science'],
  ['bugHunt', 'rescue', 'alienMenace', 'secret'],
  ['strayComet', 'spaceRadiation', 'blackHole', 'cosmicPlague'],
  ['satelliteRetrieval', 'recon', 'doomsday', 'timeWarp'],
  ['cosmicPlague', 'secret', 'timeWarp', 'maelstrom'],
];
export const tierOf = (rank) => (rank === 0 ? 0 : Math.min(4, Math.floor((rank + 1) / 2)));

const DROP_GROUPS = { mult: 3, medal: 3, boost: 3 };
const SPOT_GROUPS = ['fuelT', 'hazL', 'hazR', 'mis'];

export function newGame() {
  return {
    score: 0, ball: 1, extraBalls: 0, rank: 0, progress: 0, over: false,
    fx: [],
    ...freshBall(),
    missionsDone: 0, jackpots: 0, hyperCount: 0,
  };
}

/** Всё, что сбрасывается при новом шарике (звание и прогресс остаются). */
function freshBall() {
  return {
    mission: null, missionPick: null, misLit: [false, false, false],
    fuel: FUEL_FULL, multLevel: 0, multTimer: 0,
    attackLevel: 0, attackTimer: 0, launchLevel: 0, launchTimer: 0,
    reentryLit: [false, false, false], launchLit: [false, false, false],
    hyperLit: 0, hyperTimer: 0,
    wormOpen: false, wormExit: 'Y',
    boostLevel: 0, modes: { flags: 0, jackpot: 0, bonus: 0, hold: 0 },
    medalLevel: 0, medalTimer: 0,
    jackpot: 20000, bonus: 10000, bonusLane: false,
    kickL: true, kickR: true,
    ballSave: 0, inPlay: false,
    extraLit: 0, postTimer: 0, wellActive: false, warpTimer: 0,
    drops: { mult: [true, true, true], medal: [true, true, true], boost: [true, true, true] },
    spots: { fuelT: [false, false, false], hazL: [false, false, false], hazR: [false, false, false] },
    tripMax: 0, launching: true, skillDone: false, reflex: { ramp: 0, hyper: 0 },
    tilt: 0, tilted: false,
  };
}

const fx = (g, e) => g.fx.push(e);
const say = (g, text, big = false) => fx(g, { t: 'msg', text, big });
const sound = (g, name, opts) => fx(g, { t: 'sound', name, opts });

/** Очки: с множителем поля (или без — unmult), и в джекпот/бонус, если включены режимы. */
export function award(g, points, unmult = false) {
  if (g.tilted || !points) return;
  const p = unmult ? points : points * MULTS[g.multLevel];
  g.score += p;
  if (g.modes.jackpot > 0) g.jackpot = Math.min(5000000, g.jackpot + p);
  if (g.modes.bonus > 0) g.bonus = Math.min(5000000, g.bonus + p);
}

// ---------- миссии ----------

function missionEvent(g, on, n = 1) {
  const m = g.mission;
  if (!m) return;
  const def = MISSIONS[m.id];
  const step = def.steps[m.step];
  if (step.on !== on && !(on === 'wormhole' && step.on === 'wormhole')) return;
  m.left = Math.max(0, m.left - n);
  if (m.left > 0) return;
  m.step += 1;
  if (m.step >= def.steps.length) completeMission(g);
  else {
    m.left = def.steps[m.step].n;
    sound(g, 'missionStart');
  }
}

function completeMission(g, { demote = false } = {}) {
  const def = MISSIONS[g.mission.id];
  award(g, def.reward, true);
  g.missionsDone += 1;
  say(g, `Миссия выполнена: ${def.name}`, true);
  sound(g, 'missionComplete');
  fx(g, { t: 'show', kind: 'mission' });
  g.bonusLane = true;
  const id = g.mission.id;
  g.mission = null;
  g.missionPick = null;
  g.misLit = [false, false, false];
  if (id === 'timeWarp') {
    if (demote) {
      g.rank = Math.max(0, g.rank - 1);
      say(g, `Понижение: ${RANKS[g.rank]}`, true);
      return;
    }
    g.rank = Math.min(RANKS.length - 1, g.rank + 1);
    say(g, `Повышение: ${RANKS[g.rank]}`, true);
    sound(g, 'rankUp');
    return;
  }
  if (id === 'maelstrom') maelstromAward(g);
  addProgress(g, def.lights);
}

function addProgress(g, n) {
  g.progress += n;
  while (g.progress >= PROGRESS_FULL) {
    g.progress -= PROGRESS_FULL;
    if (g.rank < RANKS.length - 1) {
      g.rank += 1;
      say(g, `Повышение: ${RANKS[g.rank]}`, true);
      sound(g, 'rankUp');
      fx(g, { t: 'show', kind: 'rank' });
    } else g.progress = PROGRESS_FULL - 1;
  }
}

function maelstromAward(g) {
  g.multLevel = MULTS.length - 1;
  g.multTimer = 30;
  collectJackpot(g);
  g.modes = { flags: 60, jackpot: 60, bonus: 60, hold: 60 };
  g.extraLit = 55;
  g.postTimer = 55;
  g.wellActive = true;
  g.warpTimer = 60;
}

function pickMission(g, k) {
  if (g.mission) return;
  g.misLit[k] = true;
  const tier = TIERS[tierOf(g.rank)];
  const all = g.misLit.every(Boolean);
  g.missionPick = all ? tier[3] : tier[k];
  say(g, `Рампа запуска — начать: ${MISSIONS[g.missionPick].name}`);
}

function acceptMission(g) {
  if (g.mission || !g.missionPick) return;
  if (g.fuel <= 0) {
    say(g, 'Заправь корабль');
    return;
  }
  const id = g.missionPick;
  const def = MISSIONS[id];
  g.mission = { id, step: 0, left: def.steps[0].n };
  if (id === 'science') {
    for (const k of Object.keys(g.drops)) g.drops[k] = [true, true, true];
    fx(g, { t: 'drops', up: true });
  }
  const tier = tierOf(g.rank);
  award(g, [10000, 20000, 30000, 30000, 30000][tier], true);
  say(g, `Миссия принята: ${def.name}`, true);
  sound(g, 'missionStart');
}

// ---------- удары по элементам ----------

/** Шарик попал в элемент id (удар, датчик, лунка). → команды столу в g.fx. */
export function hit(g, id) {
  if (g.over) return;
  if (g.tilted && !id.startsWith('drain')) return;
  // первое касание чего угодно, кроме дорожки запуска, — шарик в игре: включается сохранение шарика
  if (!g.inPlay && !id.startsWith('trip') && !id.startsWith('tube')) {
    g.inPlay = true;
    g.ballSave = 10;
  }
  const m = /^([a-zA-Z]+?)(\d)?$/.exec(id);
  const base = m ? m[1] : id;
  const k = m?.[2] != null ? Number(m[2]) : -1;
  switch (base) {
    case 'bump': {
      award(g, BUMPER_POINTS[g.attackLevel]);
      sound(g, 'bumper');
      missionEvent(g, 'attackBumper');
      break;
    }
    case 'bumpSat': {
      award(g, BUMPER_POINTS[g.attackLevel]);
      sound(g, 'bumper');
      missionEvent(g, 'attackBumper');
      missionEvent(g, 'satellite');
      break;
    }
    case 'lbump': {
      award(g, LAUNCH_BUMPER_POINTS[g.launchLevel]);
      sound(g, 'bumper');
      break;
    }
    case 'sling':
    case 'slingL':
    case 'slingR':
    case 'rebL':
    case 'rebR':
    case 'reb': {
      award(g, 500);
      sound(g, 'sling');
      missionEvent(g, 'rebound');
      break;
    }
    case 'reentry': {
      award(g, 2000);
      g.reentryLit[k] = true;
      sound(g, 'rollover', { lane: k });
      laneEvent(g);
      missionEvent(g, 'reentry');
      if (g.reentryLit.every(Boolean)) {
        g.reentryLit = [false, false, false];
        if (g.attackLevel < 3) {
          g.attackLevel += 1;
          say(g, 'Оружие прокачано');
        }
        g.attackTimer = 60;
        sound(g, 'lanesDone');
        missionEvent(g, 'attackUpgrade');
      }
      break;
    }
    case 'launchLane': {
      award(g, 500);
      g.launchLit[k] = true;
      sound(g, 'rollover', { lane: k + 3 });
      laneEvent(g);
      if (g.launchLit.every(Boolean)) {
        g.launchLit = [false, false, false];
        if (g.launchLevel < 3) {
          g.launchLevel += 1;
          say(g, 'Двигатель прокачан');
        }
        g.launchTimer = 60;
        sound(g, 'lanesDone');
        missionEvent(g, 'launchUpgrade');
      }
      break;
    }
    case 'outL':
    case 'outR': {
      award(g, 20000);
      sound(g, 'rollover', { lane: 0 });
      laneEvent(g);
      missionEvent(g, 'outlane');
      if (g.extraLit > 0) {
        g.extraLit = 0;
        extraBall(g);
      }
      break;
    }
    case 'retL':
    case 'retR': {
      award(g, g.warpTimer > 0 ? 25000 : 5000);
      sound(g, 'rollover', { lane: 2 });
      laneEvent(g);
      break;
    }
    case 'bonusLane': {
      award(g, 10000);
      g.fuel = FUEL_FULL;
      say(g, 'Корабль заправлен');
      sound(g, 'lanesDone');
      laneEvent(g);
      if (g.bonusLane) {
        g.bonusLane = false;
        award(g, g.bonus, true);
        say(g, `Бонус: ${fmt(g.bonus)}`, true);
      }
      break;
    }
    case 'fuel': {
      award(g, 500);
      g.fuel = Math.max(g.fuel, ((k + 1) / 6) * FUEL_FULL);
      sound(g, 'rollover', { lane: k });
      if (k === 5) missionEvent(g, 'topFuel');
      break;
    }
    case 'warp': {
      award(g, 10000);
      g.warpTimer = 30;
      say(g, 'Искривление: возвратные дорожки ×5');
      sound(g, 'hyperspace');
      missionEvent(g, 'warp');
      break;
    }
    case 'spin': {
      const flags = g.modes.flags > 0;
      award(g, flags ? 2500 : 500);
      sound(g, 'spinner', { speed: 0.5 });
      if (k === 1 || k === 2) rotateWorm(g);
      missionEvent(g, 'spin');
      break;
    }
    case 'mult':
    case 'medal':
    case 'boost': {
      if (!g.drops[base][k]) break;
      g.drops[base][k] = false;
      fx(g, { t: 'drop', id, down: true });
      award(g, base === 'medal' ? 1500 : 500);
      sound(g, 'target');
      missionEvent(g, 'drop');
      missionEvent(g, 'anyTarget');
      if (g.drops[base].every((up) => !up)) bankDone(g, base);
      break;
    }
    case 'fuelT':
    case 'hazL':
    case 'hazR':
    case 'mis':
    case 'wormT': {
      award(g, base === 'mis' ? 1000 : 750);
      sound(g, 'target');
      missionEvent(g, 'spot');
      missionEvent(g, 'anyTarget');
      if (base === 'mis') pickMission(g, k);
      else if (base === 'wormT') {
        if (!g.wormOpen) say(g, 'Червоточины открыты');
        g.wormOpen = true;
        rotateWorm(g);
      } else {
        g.spots[base][k] = true;
        if (g.spots[base].every(Boolean)) {
          g.spots[base] = [false, false, false];
          sound(g, 'targetBank');
          if (base === 'fuelT') {
            g.fuel = FUEL_FULL;
            say(g, 'Корабль заправлен');
          } else if (base === 'hazL') {
            g.kickL = true;
            say(g, 'Левый спасатель готов');
            missionEvent(g, 'hazLBank');
          } else {
            g.kickR = true;
            say(g, 'Правый спасатель готов');
            missionEvent(g, 'hazRBank');
          }
        }
      }
      break;
    }
    case 'rampMouth': {
      award(g, 5000);
      sound(g, 'ramp');
      if (g.reflex.ramp > 0) {
        award(g, 25000, true);
        say(g, 'Рефлекс-удар');
      }
      g.reflex.ramp = 5;
      if (g.mission?.id === 'timeWarp' && g.mission.step === 1) completeMission(g);
      else missionEvent(g, 'ramp');
      acceptMission(g);
      break;
    }
    case 'hyperMouth': {
      sound(g, 'hyperspace');
      break;
    }
    case 'post': {
      award(g, 500);
      sound(g, 'sling');
      break;
    }
    default:
  }
}

function laneEvent(g) {
  missionEvent(g, 'lane');
}

function fmt(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function bankDone(g, base) {
  fx(g, { t: 'raise', group: base });
  g.drops[base] = [true, true, true];
  sound(g, 'targetBank');
  if (base === 'mult') {
    award(g, 1500);
    g.multLevel = Math.min(MULTS.length - 1, g.multLevel + 1);
    g.multTimer = 30;
    say(g, `Множитель поля ×${MULTS[g.multLevel]}`, true);
  } else if (base === 'medal') {
    g.medalLevel += 1;
    if (g.medalLevel === 1) award(g, 10000);
    else if (g.medalLevel === 2) award(g, 50000);
    else {
      extraBall(g);
      g.medalLevel = 0;
    }
    g.medalTimer = 30;
    if (g.medalLevel) say(g, `Медаль: ${fmt(g.medalLevel === 1 ? 10000 : 50000)}`);
  } else {
    award(g, 5000);
    const order = ['flags', 'jackpot', 'bonus', 'hold'];
    const mode = order[g.boostLevel % order.length];
    g.boostLevel += 1;
    g.modes[mode] = 60;
    say(g, { flags: 'Флаги прокачаны', jackpot: 'Джекпот копится', bonus: 'Бонус копится', hold: 'Бонус сохранится' }[mode]);
    if (mode === 'flags') missionEvent(g, 'flagsUpgraded');
  }
}

function extraBall(g) {
  g.extraBalls += 1;
  say(g, 'Дополнительный шарик!', true);
  sound(g, 'extraBall');
  fx(g, { t: 'show', kind: 'extra' });
}

function collectJackpot(g) {
  g.jackpots = (g.jackpots ?? 0) + 1;
  award(g, g.jackpot, true);
  say(g, `Джекпот: ${fmt(g.jackpot)}`, true);
  sound(g, 'jackpot');
  fx(g, { t: 'show', kind: 'jackpot' });
  g.jackpot = 20000;
}

function rotateWorm(g) {
  g.wormExit = { Y: 'R', R: 'G', G: 'Y' }[g.wormExit];
}

// ---------- лунки ----------

/**
 * Шарик в лунке id. → { hold: с, exit: id лунки выхода } — index.js держит шарик и выбрасывает из exit.
 * Гиперпространство и чёрная дыра — в своей же лунке; червоточины — из лунки со стрелкой.
 */
export function hole(g, id) {
  if (g.tilted) return { hold: 0.6, exit: id };
  if (id === 'hyper') {
    const lit = g.hyperLit;
    g.hyperCount = (g.hyperCount ?? 0) + 1;
    sound(g, 'catch');
    if (g.reflex.hyper > 0) {
      award(g, 25000, true);
      say(g, 'Рефлекс-удар');
    }
    g.reflex.hyper = 5;
    if (lit === 0) {
      award(g, 10000);
      say(g, 'Гиперпространство');
    } else if (lit === 1) collectJackpot(g);
    else if (lit === 2) {
      award(g, 20000);
      g.postTimer = 55;
      say(g, 'Центральная стойка');
    } else if (lit === 3) {
      award(g, 50000);
      g.extraLit = 55;
      say(g, 'Доп. шарик — во внешних дорожках');
    } else {
      award(g, 150000);
      g.wellActive = true;
      say(g, 'Гравитационный колодец', true);
    }
    g.hyperLit = Math.min(5, lit + 1);
    g.hyperTimer = 60;
    if (g.mission?.id === 'timeWarp' && g.mission.step === 1) completeMission(g, { demote: true });
    else missionEvent(g, 'hyperspace');
    return { hold: 1.2, exit: 'hyper' };
  }
  if (id === 'black') {
    award(g, 20000);
    say(g, 'Чёрная дыра');
    sound(g, 'catch');
    missionEvent(g, 'blackHole');
    return { hold: 1.5, exit: 'black' };
  }
  // червоточины
  const color = id.slice(4);                         // wormG / wormR / wormY → G R Y
  sound(g, 'wormhole');
  missionEvent(g, `worm${color}`);
  missionEvent(g, 'wormhole');
  if (!g.wormOpen) {
    award(g, 2500);
    return { hold: 0.8, exit: id };
  }
  g.wormOpen = false;
  const exit = `worm${g.wormExit}`;
  if (g.wormExit === color) {
    award(g, 5000);
    extraBall(g);
    say(g, 'Повтор шарика');
  } else award(g, 7500);
  return { hold: 2, exit };
}

// ---------- запуск, спасатели, сток ----------

/** Шарик прошёл растяжку удара умения k (0…5). */
export function trip(g, k) {
  if (g.launching) g.tripMax = Math.max(g.tripMax, k + 1);
}

/**
 * Слабый запуск: шарик не дошёл до трубы и скатился обратно на пружину. Удар умения — по высшей пройденной растяжке
 * (15 000 / 30 000 / 75 000 / 30 000 / 15 000 / 7 500), один раз за шарик; потом — запускать снова.
 */
export function fellBack(g) {
  if (!g.launching) return;
  const pts = g.skillDone ? 0 : SKILL[g.tripMax] ?? 0;
  g.tripMax = 0;
  if (!pts) return;
  g.skillDone = true;
  award(g, pts, true);
  say(g, `Удар умения: ${fmt(pts)}`, true);
  sound(g, 'jackpot');
  fx(g, { t: 'show', kind: 'skill' });
}

/** Шарик вышел из трубы на стол — запуск завершён, бак заправлен. */
export function launched(g) {
  if (!g.launching) return;
  g.launching = false;
  g.tripMax = 0;
  g.fuel = FUEL_FULL;
}

/** Флипперы переключают горящие дорожки возврата (как в оригинале): dir = −1 — влево, 1 — вправо. */
export function laneChange(g, dir) {
  if (g.tilted || g.over) return;
  const l = g.reentryLit;
  g.reentryLit = dir < 0 ? [l[1], l[2], l[0]] : [l[2], l[0], l[1]];
}

/** Откидной спасатель во внешней дорожке: готов — выстрелить (true), иначе шарик уходит. */
export function kickback(g, side) {
  const key = side === 'L' ? 'kickL' : 'kickR';
  if (!g[key] || g.tilted) return false;
  g[key] = false;
  sound(g, 'eject');
  say(g, side === 'L' ? 'Спасатель: в топливный канал' : 'Спасатель');
  return true;
}

/** Шарик ушёл в сток. → 'save' (сохранён — вернуть на пружину), 'next' (следующий шарик), 'over'. */
export function drain(g) {
  if (g.ballSave > 0 && !g.tilted) {
    g.ballSave = 0;
    g.inPlay = false;
    g.launching = true;
    g.tripMax = 0;
    g.skillDone = true;
    say(g, 'Шарик сохранён', true);
    sound(g, 'ballSave');
    return 'save';
  }
  if (!g.tilted) {
    award(g, g.bonus, true);
    say(g, `Бонус за вылет: ${fmt(g.bonus)}`);
  }
  sound(g, 'drain');
  const keep = { rank: g.rank, progress: g.progress };
  const hold = g.modes.hold > 0 ? g.bonus : 25000;
  if (g.extraBalls > 0) g.extraBalls -= 1;
  else g.ball += 1;
  if (g.ball > BALLS) {
    g.over = true;
    sound(g, 'gameOver');
    return 'over';
  }
  Object.assign(g, freshBall(), keep, { bonus: hold });
  return 'next';
}

/** Толчок стола: dir — 'L' | 'R' | 'U'. Слишком часто — наклон (флипперы мертвы, шарик уходит). */
export function nudge(g) {
  if (g.tilted) return;
  g.tilt += 0.35;
  if (g.tilt > 1) {
    g.tilted = true;
    say(g, 'НАКЛОН!', true);
    sound(g, 'tilt');
  } else if (g.tilt > 0.5) {
    say(g, 'Осторожно…');
    sound(g, 'tiltWarn');
  }
}

// ---------- время ----------

/** Таймеры: топливо (только в миссии), множитель, прокачки, режимы, огни, сохранение шарика, наклон. */
export function tick(g, dt) {
  if (g.over) return;
  if (g.mission) {
    const before = g.fuel;
    g.fuel = Math.max(0, g.fuel - dt * (0.7 + (0.6 * g.fuel) / FUEL_FULL));
    if (before > FUEL_FULL / 6 && g.fuel <= FUEL_FULL / 6) say(g, 'Мало топлива!');
    if (g.fuel <= 0) {
      say(g, 'Миссия прервана', true);
      sound(g, 'drain');
      g.mission = null;
      g.missionPick = null;
      g.misLit = [false, false, false];
    }
  }
  const down = (key, step) => {
    if (g[key] > 0) {
      g[key] = Math.max(0, g[key] - dt);
      if (g[key] === 0 && step) step();
    }
  };
  down('multTimer', () => {
    if (g.multLevel > 0) {
      g.multLevel -= 1;
      if (g.multLevel > 0) g.multTimer = 30;
    }
  });
  down('attackTimer', () => {
    if (g.attackLevel > 0) {
      g.attackLevel -= 1;
      if (g.attackLevel > 0) g.attackTimer = 60;
    }
  });
  down('launchTimer', () => {
    if (g.launchLevel > 0) {
      g.launchLevel -= 1;
      if (g.launchLevel > 0) g.launchTimer = 60;
    }
  });
  down('hyperTimer', () => {
    if (g.hyperLit > 0) {
      g.hyperLit -= 1;
      if (g.hyperLit > 0) g.hyperTimer = 60;
    }
  });
  down('medalTimer', () => {
    g.medalLevel = 0;
  });
  down('postTimer');
  down('extraLit');
  down('warpTimer');
  if (g.inPlay) down('ballSave');
  for (const k of Object.keys(g.modes)) g.modes[k] = Math.max(0, g.modes[k] - dt);
  g.reflex.ramp = Math.max(0, g.reflex.ramp - dt);
  g.reflex.hyper = Math.max(0, g.reflex.hyper - dt);
  g.tilt = Math.max(0, g.tilt - dt * 0.25);
}

/** Гравитационный колодец поймал шарик: 50 000 и случайный выброс. */
export function gravityWell(g) {
  if (!g.wellActive) return false;
  g.wellActive = false;
  award(g, 50000);
  say(g, 'Гравитация в норме', true);
  sound(g, 'jackpot');
  return true;
}

/** Текст панели миссии. */
export function missionText(g) {
  if (g.mission) {
    const def = MISSIONS[g.mission.id];
    const step = def.steps[g.mission.step];
    return { title: def.name, text: step.n > 1 ? `${step.text}: ${g.mission.left}` : step.text };
  }
  if (g.missionPick) return { title: MISSIONS[g.missionPick].name, text: g.fuel > 0 ? 'Рампа запуска — принять миссию' : 'Заправь корабль' };
  return { title: 'Выбор миссии', text: 'Бей в мишени миссий слева' };
}

export const multiplier = (g) => MULTS[g.multLevel];
export const fuelLights = (g) => Math.ceil((g.fuel / FUEL_FULL) * 6 - 1e-9);
export { DROP_GROUPS, SPOT_GROUPS };

// ---------- сохранение партии и статистика ----------

/** Копия состояния для сохранения (без эффектов кадра). */
export function snapshot(g) {
  const { fx: _fx, ...rest } = g;
  return JSON.parse(JSON.stringify(rest));
}

const isNum = (v, lo = 0, hi = 1e12) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const isBools = (a, n = 3) => Array.isArray(a) && a.length === n && a.every((v) => typeof v === 'boolean');

/** Сохранённая партия годится? Битая — новая игра, а не падение. */
export function isValidGame(g) {
  if (!g || typeof g !== 'object' || g.over) return false;
  if (!isNum(g.score, 0, 1e11) || !isNum(g.ball, 1, BALLS) || !isNum(g.extraBalls, 0, 99)) return false;
  if (!Number.isInteger(g.rank) || g.rank < 0 || g.rank >= RANKS.length || !isNum(g.progress, 0, PROGRESS_FULL)) return false;
  if (!isNum(g.fuel, 0, FUEL_FULL) || !Number.isInteger(g.multLevel) || g.multLevel < 0 || g.multLevel >= MULTS.length) return false;
  for (const k of ['attackLevel', 'launchLevel']) if (!Number.isInteger(g[k]) || g[k] < 0 || g[k] > 3) return false;
  if (!Number.isInteger(g.hyperLit) || g.hyperLit < 0 || g.hyperLit > 5) return false;
  if (!isBools(g.misLit) || !isBools(g.reentryLit) || !isBools(g.launchLit)) return false;
  if (!g.drops || !['mult', 'medal', 'boost'].every((k) => isBools(g.drops[k]))) return false;
  if (!g.spots || !['fuelT', 'hazL', 'hazR'].every((k) => isBools(g.spots[k]))) return false;
  if (!g.modes || !['flags', 'jackpot', 'bonus', 'hold'].every((k) => isNum(g.modes[k], 0, 1000))) return false;
  if (!['Y', 'R', 'G'].includes(g.wormExit)) return false;
  if (g.missionPick != null && !(g.missionPick in MISSIONS)) return false;
  if (g.mission != null) {
    const m = g.mission;
    if (typeof m !== 'object' || !(m.id in MISSIONS) || !Number.isInteger(m.step) || m.step < 0 || m.step >= MISSIONS[m.id].steps.length) return false;
    if (!isNum(m.left, 0, 1000)) return false;
  }
  for (const k of ['multTimer', 'attackTimer', 'launchTimer', 'hyperTimer', 'medalTimer', 'postTimer', 'extraLit', 'warpTimer', 'ballSave', 'jackpot', 'bonus', 'medalLevel', 'boostLevel', 'missionsDone']) {
    if (!isNum(g[k], 0, 1e10)) return false;
  }
  return true;
}

/** Продолжить сохранённую партию: шарик снова на пружине. */
export function resume(saved) {
  const g = { ...newGame(), ...JSON.parse(JSON.stringify(saved)), fx: [] };
  g.inPlay = false;
  g.launching = true;
  g.skillDone = true;
  g.tripMax = 0;
  g.tilt = 0;
  g.tilted = false;
  g.ballSave = 0;
  g.reflex = { ramp: 0, hyper: 0 };
  return g;
}

export const emptyStats = () => ({ played: 0, best: 0, bestRank: 0, missions: 0, jackpots: 0, hyper: 0 });

export function isValidStats(s) {
  return Boolean(s) && typeof s === 'object' && ['played', 'best', 'missions', 'jackpots', 'hyper'].every((k) => isNum(s[k], 0, 1e12))
    && Number.isInteger(s.bestRank) && s.bestRank >= 0 && s.bestRank < RANKS.length;
}

/** Партия окончена — в статистику. */
export function recordGame(stats, g) {
  return {
    played: stats.played + 1,
    best: Math.max(stats.best, g.score),
    bestRank: Math.max(stats.bestRank, g.rank),
    missions: stats.missions + (g.missionsDone ?? 0),
    jackpots: stats.jackpots + (g.jackpots ?? 0),
    hyper: stats.hyper + (g.hyperCount ?? 0),
  };
}
