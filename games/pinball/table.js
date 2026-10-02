// Стол пинбола — по устройству как в 3D Pinball для Windows XP (Space Cadet): те же элементы и их роли, но геометрия
// и рисунок свои. Координаты: ширина 1000, высота 1810 (пропорции оригинала 16 × 29), шарик r = 19.
//
// Потоки шарика:
// • пружина справа → дорожка запуска с шестью растяжками удара умения → труба над верхом → выход (одностороние ворота)
//   → верхние дорожки возврата. Слабый запуск скатывается обратно на пружину (удар умения — по высшей растяжке).
//   Полный запуск проходит дугу целиком и уходит в левый топливный канал (дозаправка, флаги);
// • правая орбита: шарик, скатившийся по верху направо, едет вниз вдоль дорожки запуска и выходит влево на стол
//   (а не в правую внешнюю дорожку);
// • левый канал: сверху вниз — ворота выводят шарик на крышу платформы; снизу вверх (левый спасатель) — проходит;
// • рампа запуска (устье в центре слева) везёт шарик на платформу — слой 1: три дорожки, три бампера, выход — лунка,
//   из неё шарик падает под платформу в бонусную дорожку;
// • гиперпространство (устье справа) — труба вверх в закрытую лунку.
// Слой 0 — стол, слой 1 — платформа. Рампы — «трубы»: шарик, влетевший в устье снизу, едет по пути (paths) без физики.

import { arcPoints, polyline, makeFlipper } from './physics.js';

export const W = 1000;
export const H = 1810;
export const BALL_R = 19;
export const TOP = { cx: 500, cy: 490, r: 480, rIn: 415, exit: (-57 * Math.PI) / 180 };   // верхняя дуга и труба запуска
export const PLUNGER_Y = 1700;                     // пружина (шарик лежит на ней)
export const LANE_X = 947;                         // середина дорожки запуска
export const FLIP = { l: [352, 1632], r: [648, 1632], r0: 18 };
// точка, где пол возвратной дорожки касается основания флиппера (пол от x = 95, y = 1560 под уклоном ~11,8°)
const FLOOR_DIR = [250, 52];
const floorTouch = ([px, py], side) => {
  const l = Math.hypot(FLOOR_DIR[0], FLOOR_DIR[1]);
  const n = [FLOOR_DIR[1] / l, -FLOOR_DIR[0] / l];                 // нормаль пола вверх
  return [px + side * n[0] * FLIP.r0, py + n[1] * FLIP.r0];
};
const FLOOR_L = floorTouch(FLIP.l, 1);
const FLOOR_R = floorTouch(FLIP.r, -1);

const WALL = { restitution: 0.45, falloff: 0.1, friction: 0.03 };
const RUBBER = { restitution: 0.8, falloff: 0.3, friction: 0.1 };
const TARGET = { restitution: 0.45, falloff: 0.2, friction: 0.05 };

let colliders;
const wall = (pts, extra = {}) => colliders.push(...polyline(pts, { kind: 'wall', ...WALL, enabled: true, layer: 0, ...extra }));
const rubber = (id, pts, extra = {}) => colliders.push(...polyline(pts, { id, kind: 'rubber', ...RUBBER, enabled: true, layer: 0, ...extra }));
const post = (x, y, r, extra = {}) => colliders.push({ type: 'circle', kind: 'post', x, y, r, ...RUBBER, enabled: true, layer: 0, ...extra });
const seg = (id, a, b, extra = {}) => colliders.push({ id, type: 'seg', kind: 'target', a, b, ...TARGET, enabled: true, layer: 0, ...extra });
const gate = (id, a, b) => colliders.push({ id, type: 'seg', kind: 'gate', a, b, ...WALL, oneway: true, enabled: true, layer: 0 });
const sensorC = (id, x, y, r, extra = {}) => colliders.push({ id, type: 'sensor', shape: 'circle', x, y, r, enabled: true, layer: 0, ...extra });
const sensorL = (id, a, b, extra = {}) => colliders.push({ id, type: 'sensor', shape: 'line', a, b, enabled: true, layer: 0, ...extra });
const sensorR = (id, x0, y0, x1, y1, extra = {}) => colliders.push({ id, type: 'sensor', x0, y0, x1, y1, enabled: true, layer: 0, ...extra });

/** Мишени в ряд: n отрезков от a до b (с зазорами), id = prefix + номер. Нормаль — слева по ходу a→b (к шарику). */
function bank(prefix, a, b, n, extra = {}) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const t0 = (k + 0.1) / n;
    const t1 = (k + 0.9) / n;
    const p = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0];
    const q = [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1];
    seg(`${prefix}${k}`, p, q, extra);
    out.push({ id: `${prefix}${k}`, a: p, b: q });
  }
  return out;
}

const bumper = (id, x, y, r, extra = {}) => {
  post(x, y, r, { id, kind: 'bumper', restitution: 0.45, kick: 900, falloff: 0, kickAlways: true, ...extra });
  return { id, x, y, r };
};

/** Собрать стол: препятствия для physics.js и описание элементов для правил и рисования. */
/**
 * fixPlatform — платформа без ловушек (бета 'pinball-unstick', видео владельца 2026-10-02: шарик застревал в верхней
 * дорожке платформы навсегда): верхние бамперы раздвинуты к стенкам, разделители дорожек короче, у поп-бамперов толчок
 * с отклонением. false — как было (у игроков до релиза).
 */
export function buildTable({ fixPlatform = true } = {}) {
  colliders = [];
  const { cx, cy, r, rIn, exit } = TOP;
  const at = (rad, deg) => [cx + Math.cos((deg * Math.PI) / 180) * rad, cy + Math.sin((deg * Math.PI) / 180) * rad];

  // ---------- внешняя граница ----------
  wall([[20, 1810], [20, cy]]);
  wall(arcPoints(cx, cy, r, Math.PI, 2 * Math.PI, 48));
  wall([[980, cy], [980, 1810]]);

  // ---------- дорожка запуска и труба ----------
  wall([[915, 1760], [915, cy]]);
  wall(arcPoints(cx, cy, rIn, 2 * Math.PI, 2 * Math.PI + exit, 14));
  const trips = [1100, 1010, 920, 830, 740, 650];
  trips.forEach((y, k) => sensorL(`trip${k}`, [918, y], [977, y]));
  wall([[915, PLUNGER_Y], [980, PLUNGER_Y]], { restitution: 0.05, falloff: 0, kind: 'plunger' });
  // выход трубы: ворота не пускают шарик со стола обратно в трубу
  const tubeIn = at(rIn, (exit * 180) / Math.PI);
  const tubeOut = at(r, (exit * 180) / Math.PI);
  gate('tubeGate', tubeOut, tubeIn);
  sensorL('tubeExit', at(rIn + 8, -62), at(r - 8, -62));

  // ---------- правая орбита: вниз вдоль дорожки запуска, внизу — скат влево на стол ----------
  wall([[852, 402], [852, 930]], { kind: 'guide' });
  wall([[915, 948], [852, 1004]]);

  // ---------- левый топливный канал ----------
  wall([[95, 545], [95, 900]]);
  gate('chuteGate', [112, 994], [20, 902]);
  const fuel = [940, 875, 810, 745, 680, 615].map((y, k) => {
    sensorC(`fuel${k}`, 57, y, 20);
    return { id: `fuel${k}`, x: 57, y };
  });
  sensorL('spin1', [22, 575], [93, 575]);

  // ---------- платформа запуска: блок (слой 0) и она сама (слой 1) ----------
  const block = [[105, 1000], [245, 1030], [245, 1255], [105, 1255]];
  wall([...block, block[0]], { kind: 'block' });
  const missionTargets = bank('mis', [249, 1190], [249, 1060], 3);
  const L1 = { layer: 1 };
  wall([...block, block[0]], { ...L1, kind: 'platform' });
  // разделители дорожек — без стоек на концах: со стойками проход между ними был уже шарика, и он застревал
  const laneGuides = [[150, 1010], [200, 1021]].map(([x, y]) => {
    const len = fixPlatform ? 30 : 46;
    wall([[x, y], [x, y + len]], { ...L1, kind: 'guide' });
    return { x, y0: y, y1: y + len };
  });
  const launchLanes = [[128, 1052], [175, 1060], [221, 1068]].map(([x, y], k) => {
    sensorC(`launchLane${k}`, x, y, 14, L1);
    return { id: `launchLane${k}`, x, y };
  });
  // бамперы треугольником остриём вниз: между верхними и под ними шарик проходит (зазоры шире шарика)
  // fixPlatform: верхние бамперы у стенок (под дорожками нет «кармана»: проход посередине широкий)
  const lb = fixPlatform ? [[128, 1108], [222, 1108], [175, 1170]] : [[140, 1108], [210, 1108], [175, 1170]];
  const launchBumpers = lb.map(([x, y], k) => bumper(`lbump${k}`, x, y, 15, { kick: 480, ...L1 }));
  // пол платформы — воронка к лунке выхода
  wall([[105, 1215], [164, 1247]], { ...L1, kind: 'platform' });
  wall([[245, 1215], [188, 1247]], { ...L1, kind: 'platform' });
  sensorC('platExit', 176, 1231, 12, L1);

  // ---------- нижние дорожки, рогатки, флипперы ----------
  // слева: внешняя (20–95) — к откидному спасателю и стоку; бонусная (95–170) и возвратная (170–258) — к флипперу
  // пол возвратных дорожек касается основания флиппера (иначе шарик застревал на стыке)
  wall([[95, 1330], [95, 1560], FLOOR_L]);
  post(95, 1330, 9, { kind: 'post' });
  wall([[170, 1340], [170, 1470]], { kind: 'guide' });
  post(170, 1340, 8, { kind: 'post' });
  wall([[258, 1338], [258, 1500], [325, 1542]], { kind: 'slingBack' });
  rubber('slingL', [[258, 1338], [325, 1542]], { kind: 'sling', kick: 850, restitution: 0.55 });
  sensorC('outL', 57, 1400, 20);
  sensorC('bonusLane', 132, 1400, 20);
  sensorC('retL', 214, 1400, 20);
  sensorC('kickL', 57, 1640, 22);
  // справа: внешняя (840–915), возвратная (742–840)
  wall([[840, 1330], [840, 1560], FLOOR_R]);
  post(840, 1330, 9, { kind: 'post' });
  wall([[742, 1338], [742, 1500], [675, 1542]], { kind: 'slingBack' });
  rubber('slingR', [[675, 1542], [742, 1338]], { kind: 'sling', kick: 850, restitution: 0.55 });
  sensorC('retR', 791, 1400, 20);
  sensorC('outR', 877, 1400, 20);
  sensorC('kickR', 877, 1640, 22);
  post(500, 1722, 12, { id: 'post', enabled: false, restitution: 0.55 });
  sensorR('drain', 0, 1775, 1000, 1900);

  // ---------- верх: дорожки возврата, бамперы, спутник ----------
  const reentryX = [380, 460, 540, 620];
  reentryX.forEach((x) => {
    wall([[x, 232], [x, 318]], { kind: 'guide', restitution: 0.55 });
    post(x, 318, 7, { kind: 'guide' });
  });
  const reentry = [0, 1, 2].map((k) => {
    sensorC(`reentry${k}`, 420 + k * 80, 285, 16);
    return { id: `reentry${k}`, x: 420 + k * 80, y: 285 };
  });
  const attackBumpers = [[598, 468], [418, 505], [515, 612]].map(([x, y], k) => bumper(`bump${k}`, x, y, 40));
  const satellite = bumper('bumpSat', 205, 330, 32, { kick: 850 });
  // мишени заправки — на верхней левой дуге, лицом внутрь
  const fuelTargets = [202, 215, 228].map((deg, k) => {
    const [x, y] = at(r - 1, deg);          // вровень со стенкой: шарик по орбите лишь чиркает (слабый удар не считается)
    const a = (deg * Math.PI) / 180;
    const tx = -Math.sin(a) * 24;
    const ty = Math.cos(a) * 24;
    // нормаль — к центру стола: слева по ходу a→b
    seg(`fuelT${k}`, [x + tx, y + ty], [x - tx, y - ty]);
    return { id: `fuelT${k}`, x, y, a: [x + tx, y + ty], b: [x - tx, y - ty] };
  });
  // множитель поля — падающие мишени наискосок, лицом к правому флипперу
  const multTargets = bank('mult', [292, 350], [372, 410], 3, { kind: 'drop' });
  sensorC('warp', 190, 470, 18);
  // левые «радиационные» мишени — на правой грани стенки канала; под ними резинка
  const hazL = bank('hazL', [99, 700], [99, 585], 3);
  rubber('rebL', [[150, 725], [258, 792]]);
  // правые «кометы» и резинка под ними
  const hazR = bank('hazR', [714, 435], [714, 545], 3);
  rubber('rebR', [[728, 648], [694, 578]]);
  // медали — падающие мишени под бамперами
  const medalTargets = bank('medal', [540, 748], [430, 722], 3, { kind: 'drop' });

  // ---------- гиперпространство ----------
  // крыши устьев и лунки — скатом: на плоской крыше шарик мог бы остановиться (у гиперпространства — влево, иначе
  // шарик скатывался к стенке правой орбиты и застревал в щели)
  wall([[757, 760], [757, 712], [837, 690], [837, 760]], { kind: 'mouth' });
  sensorL('hyperMouth', [761, 728], [833, 728]);
  seg('wormT', [757, 764], [726, 795]);
  // лунка гиперпространства — закрыта со всех сторон, попасть можно только по трубе
  wall([[778, 340], [778, 402], [846, 402], [846, 340], [812, 322], [778, 340]], { kind: 'cup' });

  // ---------- рампа запуска: устье в центре слева ----------
  wall([[285, 960], [285, 892], [330, 872], [375, 892], [375, 960]], { kind: 'mouth' });
  sensorL('rampMouth', [289, 915], [371, 915]);

  // ---------- ускорители (падающие мишени справа, лицом влево) ----------
  const boostTargets = bank('boost', [772, 1225], [772, 1110], 3, { kind: 'drop' });

  // ---------- лунки (датчики; захват — в index.js, очки — в правилах) ----------
  const holes = {
    hyper: { x: 812, y: 371, r: 24, out: [812, 290], v: [-430, -120] },
    wormG: { x: 298, y: 272, r: 24, out: [298, 272], v: [260, 260] },
    wormR: { x: 672, y: 352, r: 24, out: [672, 352], v: [-300, 240] },
    wormY: { x: 705, y: 1072, r: 24, out: [705, 1072], v: [-380, 200] },
    black: { x: 452, y: 868, r: 26, out: [452, 868], v: [60, 360] },
  };
  for (const [id, h] of Object.entries(holes)) sensorC(id, h.x, h.y, h.r - 6);
  holes.platExit = { x: 176, y: 1231, r: 14, out: [168, 1290], v: [-30, 160], layer: 0, hidden: true };
  const well = { x: 500, y: 1195, r: 170 };

  // ---------- флипперы ----------
  const swing = (34 * Math.PI) / 180;
  const flip = { length: 135, r0: 18, r1: 10, speed: 30, restitution: 0.5 };
  const flipL = makeFlipper({ id: 'flipL', x: FLIP.l[0], y: FLIP.l[1], rest: swing, up: -swing, ...flip });
  const flipR = makeFlipper({ id: 'flipR', x: FLIP.r[0], y: FLIP.r[1], rest: Math.PI - swing, up: Math.PI + swing, ...flip });
  flipL.downSpeed = 15;
  flipR.downSpeed = 15;
  flipL.friction = 0.12;
  flipR.friction = 0.12;
  colliders.push(flipL, flipR);

  // ---------- пути рамп (шарик едет без физики) ----------
  const paths = {
    // рампа запуска: от устья вверх, дугой влево и вниз — на платформу (слой 1)
    ramp: {
      points: [[330, 915], [328, 830], [305, 760], [255, 716], [190, 718], [150, 772], [138, 860], [150, 950], [176, 1045]],
      speed: 1300, layer: 1, exitV: [0, 260], spread: 160,
    },
    // гиперпространство: от устья вверх к закрытой лунке
    hyper: { points: [[797, 722], [803, 620], [812, 520], [814, 440], [812, 371]], speed: 1500, layer: 0, exitV: [0, 0], hole: 'hyper' },
  };

  const elements = {
    attackBumpers, launchBumpers, satellite, missionTargets, fuelTargets, multTargets, hazL, hazR, medalTargets, boostTargets,
    holes, well, fuel, reentry, launchLanes, laneGuides, trips,
    bottom: [{ id: 'outL', x: 57, y: 1400 }, { id: 'bonusLane', x: 132, y: 1400 }, { id: 'retL', x: 214, y: 1400 },
      { id: 'retR', x: 791, y: 1400 }, { id: 'outR', x: 877, y: 1400 }],
    kickers: { kickL: { x: 57, y: 1640 }, kickR: { x: 877, y: 1640 } },
    warp: { x: 190, y: 470 },
    spinner: { id: 'spin1', a: [22, 575], b: [93, 575] },
    block,
    platform: { poly: block, exit: { x: 176, y: 1231 } },
    wormT: { a: [757, 764], b: [726, 795] },
    mouths: { ramp: { x0: 285, x1: 375, y0: 892, y1: 960, roof: [[285, 892], [330, 872], [375, 892]] },
      hyper: { x0: 757, x1: 837, y0: 712, y1: 760, roof: [[757, 712], [837, 690]] } },
    cup: { x0: 778, x1: 846, y0: 340, y1: 402 },
    plungerLane: { x0: 915, x1: 980, top: 490, bottom: PLUNGER_Y },
    orbit: { x0: 852, x1: 915, y0: 402, y1: 1004 },
    post: { x: 500, y: 1722, r: 12 },
  };
  // платформа наклонена к лунке выхода (fixPlatform): шарик слегка тянет к её середине
  const slopes = fixPlatform ? [{ layer: 1, x: 176, accel: 700 }] : [];
  const out = { colliders, flippers: [flipL, flipR], paths, elements, slopes };
  // поп-бамперы: толчок с отклонением от точки удара (не подбрасывают шарик строго вверх-вниз бесконечно)
  if (fixPlatform) for (const c of colliders) if (c.kickAlways) c.kickTwist = 0.35;
  colliders = null;
  return out;
}
