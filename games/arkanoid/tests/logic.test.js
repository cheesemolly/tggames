// Арканоид: разбор уровней, столкновения и отскоки, виды кирпичей, все 15 бонусов, запас шариков, сохранение,
// бот проходит уровни. Запуск: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  W, H, BRICK_W, BRICK_H, LEVEL_COUNT, PADDLE_Y, PADDLE_WIDTHS, BALL_R, SMALL_R, BALL_SPEED, SPEED_K, MAX_BALLS, LIVES,
  MAX_LIVES, WEAR, BONUSES, BONUS_WEIGHTS, FIRE_TIME, RAIL_TIME, CATCH_TIME, LASER_TIME, MISSILES, MAX_ANGLE, HELP_AFTER,
  HELP_BONUSES,
  parseLevel, polygon, closestPoint, newGame, step, launch, movePaddle, applyBonus, progress, snapshot, restore,
  isValidState, emptyStats, isValidStats, botTarget, ballRadius, ballSpeed, paddleW,
} from '../logic.js';
import { ALPHABET, CODES, LEVELS } from '../levels.js';

function seeded(seed) {
  let x = seed;
  return () => {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };
}

/** Партия на пустом поле с заданными кирпичами (вид, координаты левого верхнего угла). */
function field(list) {
  const g = newGame(1);
  for (const b of g.bricks) b.hp = 0;
  const made = list.map((src, i) => {
    const b = g.bricks[i];
    const hp = { n: 1, h: 3, p: 1, e: 1, x: WEAR, t: 1 }[src.kind];
    const pts = polygon(src.shape ?? 'R', src.x, src.y);
    Object.assign(b, {
      kind: src.kind, tone: 0, shape: src.shape ?? 'R', bonus: src.bonus ?? null, x: src.x, y: src.y, pts,
      cx: src.x + BRICK_W / 2, cy: src.y + BRICK_H / 2, rad: 20, hp, max: hp,
      minX: Math.min(...pts.map((p) => p[0])), maxX: Math.max(...pts.map((p) => p[0])),
      minY: Math.min(...pts.map((p) => p[1])), maxY: Math.max(...pts.map((p) => p[1])),
    });
    return b;
  });
  // сетка столкновений — заново под новые места
  for (const cell of g.grid) cell.length = 0;
  for (const b of made) {
    for (let y = Math.floor(b.minY / 40); y <= Math.floor(b.maxY / 40); y++) {
      for (let x = Math.floor(b.minX / 40); x <= Math.floor(b.maxX / 40); x++) g.grid[y * Math.ceil(W / 40) + x].push(b);
    }
  }
  g.total = made.filter((b) => 'nhpe'.includes(b.kind)).length;
  g.left = g.total;
  return { g, bricks: made };
}

/** Шарик в полёте из точки в направлении (dx, dy). */
function fly(g, x, y, dx, dy) {
  const len = Math.hypot(dx, dy);
  g.balls = [{ x, y, dx: dx / len, dy: dy / len, stuck: null, idle: 0 }];
  g.status = 'play';
  return g.balls[0];
}

function run(g, seconds, rng = seeded(1), until = () => false) {
  for (let t = 0; t < seconds && g.status !== 'won' && g.status !== 'lost' && !until(); t += 1 / 120) step(g, 1 / 120, rng);
}

const types = (g) => g.events.map((e) => e.type);

test('все 210 уровней разбираются: кирпичи в поле, есть что разбивать, виды известны', () => {
  assert.equal(LEVEL_COUNT, 210);
  assert.equal(LEVELS.length, 210);
  assert.equal(new Set(CODES).size, CODES.length);
  assert.ok(CODES.length <= ALPHABET.length);
  for (let n = 1; n <= LEVEL_COUNT; n++) {
    const { world, bricks } = parseLevel(n);
    assert.ok(world >= 0 && world <= 3, `уровень ${n}: мир`);
    assert.ok(bricks.some((b) => 'nhpe'.includes(b.kind)), `уровень ${n}: нечего разбивать`);
    for (const b of bricks) {
      assert.ok('nhpext'.includes(b.kind) && 'RabcdUDC'.includes(b.shape), `уровень ${n}: вид кирпича`);
      assert.ok(b.bonus === null || BONUSES.includes(b.bonus), `уровень ${n}: бонус ${b.bonus}`);
      assert.ok(b.x >= 0 && b.x <= W - BRICK_W && b.y >= 0 && b.y + BRICK_H <= PADDLE_Y - 150, `уровень ${n}: кирпич вне поля (${b.x}, ${b.y})`);
      assert.ok(b.scale > 0.3 && b.scale <= 1.5, `уровень ${n}: размер`);
    }
  }
  assert.throws(() => parseLevel(0));
  assert.throws(() => parseLevel(211));
});

test('контуры: прямоугольник, треугольники, поворот вокруг центра', () => {
  assert.deepEqual(polygon('R', 10, 20), [[10, 20], [42, 20], [42, 38], [10, 38]]);
  assert.deepEqual(polygon('U', 0, 0), [[0, 18], [16, 0], [32, 18]]);
  assert.deepEqual(polygon('a', 0, 0), [[32, 0], [32, 18], [0, 18]], 'срезан левый верхний угол');
  const turned = polygon('R', 0, 0, 90).map(([x, y]) => [Math.round(x), Math.round(y)]);
  assert.deepEqual(turned, [[25, -7], [25, 25], [7, 25], [7, -7]], 'повёрнутый на 90° — 18 × 32 с тем же центром');
  const small = polygon('R', 0, 0, 0, 0.5);
  assert.deepEqual(small, [[8, 4.5], [24, 4.5], [24, 13.5], [8, 13.5]]);
});

test('ближайшая точка контура: снаружи, у угла, внутри', () => {
  const sq = polygon('R', 100, 100);
  let p = closestPoint(sq, 116, 90);
  assert.deepEqual([p.x, p.y, p.d2, p.inside], [116, 100, 100, false]);
  p = closestPoint(sq, 97, 96);
  assert.deepEqual([p.x, p.y, p.d2, p.inside], [100, 100, 25, false], 'угол');
  p = closestPoint(sq, 116, 103);
  assert.equal(p.inside, true);
  assert.deepEqual([p.x, p.y], [116, 100], 'изнутри — до ближайшей стороны');
  const tri = polygon('U', 0, 0);
  assert.equal(closestPoint(tri, 16, 12).inside, true);
  assert.equal(closestPoint(tri, 2, 2).inside, false, 'вне треугольника, хотя в его рамке');
});

test('новая партия: шарик лежит на платформе и едет с ней, запуск — вверх', () => {
  const g = newGame(1);
  assert.equal(g.status, 'ready');
  assert.equal(g.lives, LIVES);
  assert.equal(g.balls.length, 1);
  assert.equal(g.left, g.total);
  assert.equal(progress(g), 0);
  step(g, 1, seeded(1));
  assert.equal(g.balls[0].y, PADDLE_Y - BALL_R, 'до запуска шарик не летит');
  movePaddle(g, 100);
  assert.ok(Math.abs(g.balls[0].x - 100) < 20);
  movePaddle(g, -500);
  assert.equal(g.paddle.x, PADDLE_WIDTHS[1] / 2, 'платформа не выходит за поле');
  assert.equal(launch(g), true);
  assert.equal(g.status, 'play');
  assert.ok(g.balls[0].dy < 0 && g.balls[0].stuck === null);
  assert.equal(launch(g), false, 'запускать больше нечего');
});

test('стены и потолок отражают, шарик не покидает поле', () => {
  const { g } = field([{ kind: 'n', x: 300, y: 10 }]);
  const ball = fly(g, 50, 400, -1, -0.5);
  run(g, 1, seeded(1), () => g.events.length > 0);
  assert.deepEqual(types(g), ['wall']);
  assert.ok(ball.dx > 0 && ball.dy < 0, 'отразился от левой стены');
  run(g, 2, seeded(1), () => ball.dy > 0);
  assert.ok(ball.y < 30 && ball.dy > 0, 'отразился от потолка');
  for (let i = 0; i < 200 && ball.y < 400; i++) {
    step(g, 1 / 120, seeded(1));
    assert.ok(ball.x >= BALL_R - 1e-9 && ball.x <= W - BALL_R + 1e-9 && ball.y >= BALL_R - 1e-9, `шарик в поле (${ball.x}, ${ball.y})`);
  }
});

test('отскок от платформы: по центру — вверх, с краю — под углом; мимо — шарик потерян', () => {
  let { g } = field([{ kind: 'n', x: 0, y: 0 }]);
  movePaddle(g, 300);
  let ball = fly(g, 300, PADDLE_Y - 40, 0, 1);
  run(g, 0.3);
  assert.ok(Math.abs(ball.dx) < 1e-9 && ball.dy < 0, 'по центру — прямо вверх');
  ({ g } = field([{ kind: 'n', x: 0, y: 0 }]));
  movePaddle(g, 300);
  ball = fly(g, 300 + PADDLE_WIDTHS[1] / 2, PADDLE_Y - 40, 0, 1);
  run(g, 0.3);
  assert.ok(Math.abs(Math.atan2(ball.dx, -ball.dy) - MAX_ANGLE) < 1e-6, 'с правого края — вправо под наибольшим углом');
  ({ g } = field([{ kind: 'n', x: 0, y: 0 }]));
  movePaddle(g, 100);
  fly(g, 400, PADDLE_Y - 40, 0, 1);
  run(g, 1);
  assert.equal(g.lives, LIVES - 1, 'мимо платформы — минус шарик из запаса');
  assert.equal(g.status, 'ready');
  assert.equal(g.balls.length, 1);
  assert.ok(g.balls[0].stuck !== null, 'новый шарик ждёт на платформе');
  assert.ok(types(g).includes('lost') && types(g).includes('die'));
});

test('обычный кирпич — один удар, шарик отскакивает; последний кирпич — победа', () => {
  const { g, bricks } = field([{ kind: 'n', x: 284, y: 200 }]);
  const ball = fly(g, 300, 300, 0, -1);
  run(g, 0.5);
  assert.equal(bricks[0].hp, 0);
  assert.ok(ball.dy > 0, 'отскочил вниз');
  assert.equal(g.status, 'won');
  assert.equal(progress(g), 1);
  assert.deepEqual(types(g).filter((t) => t !== 'wall'), ['break', 'win']);
  const before = ball.y;
  step(g, 1, seeded(1));
  assert.equal(ball.y, before, 'после победы ничего не движется');
});

test('кирпич на три удара', () => {
  const { g, bricks } = field([{ kind: 'h', x: 284, y: 200 }, { kind: 'n', x: 0, y: 0 }]);
  for (let hit = 1; hit <= 3; hit++) {
    fly(g, 300, 260, 0, -1);
    run(g, 0.3);
    assert.equal(bricks[0].hp, 3 - hit, `после удара ${hit}`);
  }
  assert.equal(g.left, 1);
  assert.equal(types(g).filter((t) => t === 'hit').length, 2);
});

test('треугольный кирпич отражает по наклонной стороне', () => {
  // срезан левый нижний угол: шарик, летящий снизу вверх в гипотенузу, уходит влево-вниз
  const { g } = field([{ kind: 'h', shape: 'c', x: 284, y: 200 }, { kind: 'n', x: 0, y: 0 }]);
  const ball = fly(g, 296, 250, 0, -1);
  run(g, 0.2, seeded(1), () => ball.dy > 0);
  assert.ok(ball.dx < -0.5 && ball.dy > 0, `отскок от наклонной (${ball.dx}, ${ball.dy})`);
});

test('неразрушаемый кирпич: для победы не нужен, ломается после WEAR ударов', () => {
  const { g, bricks } = field([{ kind: 'x', x: 284, y: 200 }, { kind: 'n', x: 0, y: 0 }]);
  assert.equal(g.total, 1, 'в счёт уровня не идёт');
  for (let hit = 1; hit < WEAR; hit++) {
    fly(g, 300, 250, 0, -1);
    run(g, 0.2);
    assert.equal(bricks[0].hp, WEAR - hit);
  }
  fly(g, 300, 250, 0, -1);
  run(g, 0.2);
  assert.equal(bricks[0].hp, 0, 'сломался');
  assert.equal(g.left, 1);
});

test('взрывной кирпич сносит соседей (и неразрушаемых), взрывы идут цепочкой', () => {
  const { g, bricks } = field([
    { kind: 'e', x: 284, y: 200 }, { kind: 'x', x: 316, y: 200 }, { kind: 'h', x: 252, y: 200 }, { kind: 'n', x: 284, y: 182 },
    { kind: 'e', x: 316, y: 182 }, { kind: 'n', x: 348, y: 164 },          // второй взрывной достаёт дальний кирпич
    { kind: 'n', x: 500, y: 200 },                                          // далеко — уцелеет
  ]);
  fly(g, 300, 260, 0, -1);
  run(g, 0.5);
  assert.deepEqual(bricks.map((b) => b.hp > 0), [false, false, false, false, false, false, true]);
  assert.equal(g.left, 1);
  assert.equal(types(g).filter((t) => t === 'explode').length, 2);
});

test('кирпич с бонусом: бонус падает, платформа ловит', () => {
  const { g } = field([{ kind: 'p', bonus: 'expand', x: 284, y: 500 }, { kind: 'n', x: 0, y: 0 }]);
  movePaddle(g, 300);
  fly(g, 300, 560, 0, -1);
  run(g, 0.2);
  assert.equal(g.drops.length, 1);
  assert.equal(g.drops[0].type, 'expand');
  run(g, 3, seeded(1), () => !g.drops.length);
  assert.equal(g.paddle.size, 2, 'платформа стала шире');
  assert.ok(types(g).includes('bonus'));
  // без заданного бонуса — случайный из пятнадцати, мимо платформы — пропадает
  const next = field([{ kind: 'p', x: 284, y: 500 }, { kind: 'n', x: 0, y: 0 }]).g;
  movePaddle(next, 40);
  fly(next, 300, 560, 0, -1);
  run(next, 0.2);
  assert.ok(BONUSES.includes(next.drops[0].type));
  next.balls[0].dy = -1;
  next.balls[0].dx = 0;
  next.balls[0].y = 100;
  run(next, 1.5, seeded(1), () => !next.drops.length);
  assert.equal(next.drops.length, 0);
  assert.equal(next.paddle.size, 1);
});

test('запертый шарик: задел — падает, поймал — летает ещё один', () => {
  const { g, bricks } = field([{ kind: 't', shape: 'C', x: 284, y: 500 }, { kind: 'n', x: 0, y: 0 }]);
  assert.equal(g.total, 1, 'в счёт уровня не идёт');
  movePaddle(g, 300);
  const ball = fly(g, 300, 560, 0, -1);
  run(g, 0.2);
  assert.equal(bricks[0].hp, 0);
  assert.equal(g.loose.length, 1);
  ball.y = 50;
  ball.dy = -1;
  run(g, 1.2, seeded(1), () => !g.loose.length);
  assert.equal(g.balls.length, 2);
  assert.ok(types(g).includes('free') && types(g).includes('gain'));
});

test('бонусы шарика: ×3, ×8, быстро, медленно, маленький, обычный', () => {
  const { g } = field([{ kind: 'n', x: 0, y: 0 }]);
  fly(g, 300, 500, 0, -1);
  applyBonus(g, 'split3');
  assert.equal(g.balls.length, 3);
  assert.equal(new Set(g.balls.map((b) => b.dx.toFixed(3))).size, 3, 'веером');
  applyBonus(g, 'split8');
  assert.equal(g.balls.length, 24);
  for (const b of g.balls) assert.ok(Math.abs(Math.hypot(b.dx, b.dy) - 1) < 1e-9 && Math.abs(b.dy) >= 0.2 - 1e-9, 'не горизонтально');
  applyBonus(g, 'split8');
  assert.equal(g.balls.length, MAX_BALLS, 'больше не бывает');
  applyBonus(g, 'split3');
  assert.equal(g.balls.length, MAX_BALLS);

  assert.equal(ballSpeed(g), BALL_SPEED);
  applyBonus(g, 'fast');
  applyBonus(g, 'fast');
  assert.equal(ballSpeed(g), BALL_SPEED * SPEED_K[2]);
  applyBonus(g, 'slow');
  assert.equal(ballSpeed(g), BALL_SPEED, 'быстро + медленно = обычно');
  applyBonus(g, 'slow');
  assert.equal(ballSpeed(g), BALL_SPEED * SPEED_K[0]);
  applyBonus(g, 'small');
  assert.equal(ballRadius(g), SMALL_R);
  applyBonus(g, 'fire');
  applyBonus(g, 'normal');
  assert.deepEqual([ballRadius(g), ballSpeed(g), g.fx.fire, g.fx.rail], [BALL_R, BALL_SPEED, 0, 0], '«обычный шарик» снимает всё');
});

test('огненный шар сносит кирпич и соседей, рельса проходит насквозь; оба — на время', () => {
  let { g, bricks } = field([{ kind: 'x', x: 284, y: 200 }, { kind: 'h', x: 316, y: 200 }, { kind: 'h', x: 284, y: 182 }, { kind: 'n', x: 500, y: 20 }]);
  applyBonus(g, 'fire');
  assert.equal(g.fx.fire, FIRE_TIME);
  let ball = fly(g, 300, 260, 0, -1);
  run(g, 0.2);
  assert.deepEqual(bricks.map((b) => b.hp > 0), [false, false, false, true]);
  assert.ok(ball.dy > 0, 'огненный шар отскакивает');
  g.fx.fire = 0.02;
  fly(g, 300, 600, 0, -1);
  step(g, 0.05, seeded(1));
  assert.equal(g.fx.fire, 0);
  assert.ok(g.events.some((e) => e.type === 'expire' && e.bonus === 'fire'), 'огонь — на время');

  ({ g, bricks } = field([{ kind: 'x', x: 284, y: 200 }, { kind: 'h', x: 284, y: 182 }, { kind: 'h', x: 284, y: 164 }, { kind: 'n', x: 500, y: 20 }]));
  applyBonus(g, 'fire');
  applyBonus(g, 'rail');
  assert.deepEqual([g.fx.rail, g.fx.fire], [RAIL_TIME, 0], 'рельса сменяет огонь');
  ball = fly(g, 300, 260, 0, -1);
  run(g, 0.25);
  assert.deepEqual(bricks.map((b) => b.hp > 0), [false, false, false, true]);
  assert.ok(ball.dy < 0 && ball.y < 164, 'прошла насквозь, не отскочив');
});

test('ловушка держит шарик на платформе до запуска', () => {
  const { g } = field([{ kind: 'n', x: 0, y: 0 }]);
  movePaddle(g, 300);
  applyBonus(g, 'catch');
  assert.equal(g.fx.catch, CATCH_TIME);
  const ball = fly(g, 320, PADDLE_Y - 30, 0, 1);
  run(g, 0.3);
  assert.equal(ball.stuck, 20);
  movePaddle(g, 200);
  assert.equal(ball.x, 220, 'едет с платформой');
  assert.equal(launch(g), true);
  assert.ok(ball.dy < 0 && ball.dx > 0);
});

test('лазер стреляет сам и снимает по удару, но не берёт взрывные и неразрушаемые; ракеты взрывают', () => {
  let { g, bricks } = field([{ kind: 'h', x: 250, y: 400 }, { kind: 'e', x: 318, y: 400 }, { kind: 'x', x: 318, y: 440 }, { kind: 'n', x: 580, y: 0 }]);
  movePaddle(g, 300);
  fly(g, 20, 100, 0, -1);
  g.balls[0].dx = 0;
  applyBonus(g, 'laser');
  assert.equal(g.fx.laser, LASER_TIME);
  run(g, 1.6, seeded(1), () => bricks[0].hp === 0);
  assert.equal(bricks[0].hp, 0, 'три выстрела левого ствола');
  assert.equal(bricks[1].hp, 1, 'взрывной цел');
  assert.equal(bricks[2].hp, WEAR, 'неразрушаемый цел');
  assert.ok(types(g).includes('shot') && types(g).includes('spark'));

  ({ g, bricks } = field([{ kind: 'x', x: 284, y: 400 }, { kind: 'h', x: 316, y: 400 }, { kind: 'n', x: 580, y: 0 }]));
  movePaddle(g, 300);
  fly(g, 20, 100, 0, -1);
  applyBonus(g, 'laser');
  applyBonus(g, 'missile');
  assert.deepEqual([g.fx.missile, g.fx.laser], [MISSILES, 0], 'ракеты сменяют лазер');
  run(g, 1.5, seeded(1), () => bricks[0].hp === 0);
  assert.deepEqual(bricks.map((b) => b.hp > 0), [false, false, true], 'ракета сносит и неразрушаемый, и соседа');
  assert.equal(g.fx.missile, MISSILES - 1);
});

test('платформа: шире, уже, границы размеров', () => {
  const { g } = field([{ kind: 'n', x: 0, y: 0 }]);
  for (let i = 0; i < 5; i++) applyBonus(g, 'expand');
  assert.equal(paddleW(g), PADDLE_WIDTHS[PADDLE_WIDTHS.length - 1]);
  for (let i = 0; i < 6; i++) applyBonus(g, 'shrink');
  assert.equal(paddleW(g), PADDLE_WIDTHS[0]);
  movePaddle(g, 0);
  assert.equal(g.paddle.x, PADDLE_WIDTHS[0] / 2);
});

test('бомба: поймал — минус шарик и всё сброшено; шариком её можно сбить; жизнь — плюс шарик, не больше MAX_LIVES', () => {
  let { g } = field([{ kind: 'n', x: 0, y: 0 }]);
  movePaddle(g, 300);
  fly(g, 20, 100, 0, -1);
  applyBonus(g, 'expand');
  applyBonus(g, 'fast');
  g.drops.push({ id: 99, type: 'bomb', x: 300, y: PADDLE_Y - 30 });
  run(g, 0.5, seeded(1), () => g.lives < LIVES);
  assert.equal(g.lives, LIVES - 1);
  assert.deepEqual([g.paddle.size, g.fx.speed, g.status, g.balls.length], [1, 0, 'ready', 1]);

  ({ g } = field([{ kind: 'n', x: 0, y: 0 }]));
  movePaddle(g, 300);
  fly(g, 300, 500, 0, -1);
  g.drops.push({ id: 99, type: 'bomb', x: 300, y: 400 });
  run(g, 0.3, seeded(1), () => !g.drops.length);
  assert.equal(g.drops.length, 0);
  assert.ok(types(g).includes('defuse'));
  assert.equal(g.lives, LIVES);

  for (let i = 0; i < 5; i++) applyBonus(g, 'life');
  assert.equal(g.lives, MAX_LIVES);
});

test('шарики кончились — уровень проигран', () => {
  const { g } = field([{ kind: 'n', x: 0, y: 0 }]);
  movePaddle(g, 60);
  for (let life = LIVES; life > 0; life--) {
    assert.equal(g.lives, life);
    fly(g, 500, PADDLE_Y, 0, 1);
    run(g, 1, seeded(1), () => g.lives < life);
  }
  assert.equal(g.status, 'lost');
  assert.ok(types(g).includes('lose'));
  assert.equal(launch(g), false);
});

test('давно ничего не разбито — сверху падает сильный бонус', () => {
  const { g } = field([{ kind: 'n', x: 580, y: 0 }]);
  movePaddle(g, 300);
  const ball = fly(g, 300, 400, 0, -1);
  const rng = seeded(3);
  for (let t = 0; t < HELP_AFTER + 0.5 && !g.drops.length; t += 1 / 60) {
    step(g, 1 / 60, rng);
    ball.x = 300;                       // шарик ходит по вертикали над платформой и ничего не задевает
    ball.dx = 0;
    ball.dy = Math.sign(ball.dy);
  }
  assert.equal(g.drops.length, 1);
  assert.ok(HELP_BONUSES.includes(g.drops[0].type));
  assert.ok(g.time > HELP_AFTER - 0.1, 'не раньше срока');
  assert.ok(types(g).includes('help'));
  for (const id of HELP_BONUSES) assert.ok(BONUSES.includes(id));
});

test('у каждого бонуса есть вес', () => {
  assert.equal(BONUSES.length, 15);
  assert.deepEqual(Object.keys(BONUS_WEIGHTS).sort(), [...BONUSES].sort());
  for (const id of BONUSES) assert.ok(BONUS_WEIGHTS[id] > 0);
});

test('сохранение: прочность кирпичей и запас возвращаются, битое не принимается', () => {
  const g = newGame(11);
  launch(g);
  const rng = seeded(7);
  for (let i = 0; i < 1500 && g.broken < 5; i++) {
    movePaddle(g, botTarget(g));
    step(g, 1 / 60, rng);
  }
  assert.ok(g.broken >= 5);
  const saved = JSON.parse(JSON.stringify(snapshot(g)));
  assert.equal(isValidState(saved), true);
  const back = restore(saved);
  assert.deepEqual(back.bricks.map((b) => b.hp), g.bricks.map((b) => b.hp));
  assert.deepEqual([back.level, back.lives, back.left, back.status], [11, g.lives, g.left, 'ready']);
  assert.equal(back.balls.length, 1, 'шарик снова на платформе');

  for (const bad of [null, {}, { ...saved, v: 2 }, { ...saved, level: 0 }, { ...saved, level: 211 }, { ...saved, lives: 0 },
    { ...saved, lives: 9 }, { ...saved, hp: saved.hp.slice(1) }, { ...saved, hp: saved.hp.map(() => 99) },
    { ...saved, hp: saved.hp.map(() => 0) }, { ...saved, hp: 'x' }, { ...saved, time: -1 }]) {
    assert.equal(isValidState(bad), false);
  }
  assert.equal(isValidStats(emptyStats()), true);
  assert.equal(isValidStats({ ...emptyStats(), bricks: -1 }), false);
  assert.equal(isValidStats(null), false);
});

/** Бот играет уровень (запас шариков не кончается). → секунд игры до победы или Infinity. */
function botPlays(n, seed, limit = 900) {
  const g = newGame(n);
  const rng = seeded(seed);
  for (let t = 0; t < limit; t += 1 / 60) {
    if (g.status === 'won') return t;
    g.lives = LIVES;
    if (g.balls.some((b) => b.stuck !== null)) launch(g);
    // платформа едет не мгновенно — как палец
    const target = botTarget(g);
    movePaddle(g, g.paddle.x + Math.max(-30, Math.min(30, target - g.paddle.x)));
    step(g, 1 / 60, rng);
    g.events.length = 0;
    for (const b of g.balls) assert.ok(Number.isFinite(b.x) && Number.isFinite(b.y) && b.x >= 0 && b.x <= W && b.y >= 0 && b.y <= H + 20, `уровень ${n}: шарик вне поля`);
    assert.ok(g.balls.length <= MAX_BALLS);
  }
  return Infinity;
}

test('бот проходит уровни: первый, с «дверями», из одних взрывных, лабиринт и каждый десятый', () => {
  const list = new Set([1, 2, 17, 54, 67, 112]);
  for (let n = 10; n <= LEVEL_COUNT; n += 10) list.add(n);
  for (const n of list) {
    const t = botPlays(n, n);
    assert.ok(t < Infinity, `уровень ${n} не пройден за 15 минут игры`);
  }
});
