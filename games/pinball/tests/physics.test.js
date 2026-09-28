// Физика пинбола: отскок, стенки не пробиваются на любой скорости, флиппер бьёт по шарику, бампер толкает,
// стенка в одну сторону, датчики, шарик катится по наклонной без дрожания.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, makeFlipper, flipperTip, polyline, arcPoints, closestOnSegment, MAX_SPEED } from '../physics.js';

const run = (world, seconds) => {
  const events = [];
  for (let t = 0; t < seconds; t += 1 / 60) events.push(...world.step(1 / 60));
  return events;
};

test('падает и отскакивает от пола, с каждым разом ниже', () => {
  const world = createWorld({ colliders: [{ id: 'floor', type: 'seg', a: [0, 1000], b: [1000, 1000], restitution: 0.6, enabled: true }] });
  const ball = world.addBall(500, 500);
  const events = run(world, 3);
  assert.ok(events.some((e) => e.id === 'floor' && e.type === 'hit'));
  assert.ok(ball.y <= 1000 - ball.r + 0.5, 'не провалился');
  assert.ok(Math.abs(ball.vy) < 400, 'почти успокоился');
});

test('тонкая стенка не пробивается даже на предельной скорости', () => {
  for (const angle of [0, 0.3, 1.2, Math.PI / 2, 2.4]) {
    const world = createWorld({ gravity: 0, colliders: [{ id: 'w', type: 'seg', a: [500, 0], b: [500, 2000], restitution: 0.5, enabled: true }] });
    const ball = world.addBall(300, 1000, Math.cos(angle) * MAX_SPEED * 1.5, Math.sin(angle - Math.PI / 2) * 200);
    if (Math.cos(angle) <= 0.05) continue;
    run(world, 1);
    assert.ok(ball.x < 500, `угол ${angle}: шарик за стенкой (${ball.x})`);
  }
});

test('флиппер бьёт по падающему на него шарику — тот летит вверх быстро', () => {
  const f = makeFlipper({ id: 'L', x: 300, y: 1500, length: 150, r0: 18, r1: 10, rest: 0.5, up: -0.45 });
  const world = createWorld({ colliders: [f] });
  const [tx, ty] = flipperTip(f);
  const ball = world.addBall(tx - 45, ty - 70, 0, 200);
  for (let k = 0; k < 5; k++) world.step(1 / 60);       // шарик почти на флиппере
  f.pressed = true;
  let best = 0;
  for (let k = 0; k < 20; k++) {
    world.step(1 / 60);
    best = Math.min(best, ball.vy);
  }
  assert.ok(best < -1500, `вверх быстро (${Math.round(best)})`);
});

test('бампер отталкивает с толчком', () => {
  const world = createWorld({ gravity: 0, colliders: [{ id: 'b', type: 'circle', x: 500, y: 500, r: 40, restitution: 0.4, kick: 900, enabled: true }] });
  const ball = world.addBall(500, 300, 0, 600);
  const events = run(world, 0.8);
  assert.ok(events.some((e) => e.id === 'b'));
  assert.ok(ball.vy < -800, `отлетел с толчком (${Math.round(ball.vy)})`);
});

test('стенка в одну сторону: пропускает с одной, отталкивает с другой', () => {
  const gate = { id: 'g', type: 'seg', a: [0, 500], b: [1000, 500], oneway: true, restitution: 0.3, enabled: true };
  const down = createWorld({ gravity: 0, colliders: [gate] });
  const b1 = down.addBall(500, 300, 0, 800);            // сверху вниз: слева по ходу a→b — это «верх»? проверяем обе стороны
  run(down, 1);
  const up = createWorld({ gravity: 0, colliders: [{ ...gate }] });
  const b2 = up.addBall(500, 700, 0, -800);
  run(up, 1);
  const passedDown = b1.y > 500;
  const passedUp = b2.y < 500;
  assert.notEqual(passedDown, passedUp, 'ровно в одну сторону');
});

test('датчики: событие входа и выхода', () => {
  const world = createWorld({ gravity: 0, colliders: [{ id: 's', type: 'sensor', shape: 'circle', x: 500, y: 500, r: 30, enabled: true }] });
  world.addBall(500, 300, 0, 600);
  const events = run(world, 1);
  assert.ok(events.some((e) => e.type === 'enter' && e.id === 's'));
  assert.ok(events.some((e) => e.type === 'leave' && e.id === 's'));
});

test('по наклонной скатывается, не дрожит и не проваливается', () => {
  const world = createWorld({ colliders: [{ id: 'ramp', type: 'seg', a: [0, 800], b: [1000, 1100], restitution: 0.4, enabled: true }] });
  const ball = world.addBall(100, 780);
  run(world, 1.2);
  const p = closestOnSegment(ball.x, ball.y, 0, 800, 1000, 1100);
  const dist = Math.hypot(ball.x - p.x, ball.y - p.y);
  assert.ok(Math.abs(dist - ball.r) < 1.5, `лежит на стенке (${dist.toFixed(2)})`);
  assert.ok(ball.x > 300, 'скатился');
  const pts = arcPoints(0, 0, 10, 0, Math.PI, 4);
  assert.equal(polyline(pts).length, 4);
});
