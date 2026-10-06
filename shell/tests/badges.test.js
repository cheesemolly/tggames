import test from 'node:test';
import assert from 'node:assert/strict';

import { FRAMES, BADGES, BADGE_NOTES, grid, erode, edge, place, path, polygon, hasBadgeArt } from '../badges.js';
import { FRAMES as SERVER_FRAMES, BADGES as SERVER_BADGES, SERVER_BETA, wearOf } from '../../server/lib.js';
import { BETA } from '../beta.js';

test('значки и рамки: список в оболочке тот же, что на сервере; у каждого значка есть картинка', () => {
  assert.deepEqual(FRAMES, SERVER_FRAMES);
  assert.deepEqual(BADGES, SERVER_BADGES);
  for (const id of Object.keys(BADGES)) assert.ok(hasBadgeArt(id), `картинка значка ${id}`);
  // в профиле у значка нет подписи — название и за что он показываются по нажатию
  assert.deepEqual(Object.keys(BADGE_NOTES), Object.keys(BADGES), 'у каждого значка написано, за что он');
  assert.equal(BADGE_NOTES.contributor, 'За помощь проекту');
  assert.equal(hasBadgeArt('__proto__'), false);
  assert.equal(SERVER_BETA.includes('badges'), BETA.some((b) => b.id === 'badges'), 'в бете — и там, и там');
});

test('что надето: не выбирал — первое из своего, снял — ничего, чужое и отобранное не надето', () => {
  const owned = { frames: ['tester'], badges: ['contributor'] };
  assert.deepEqual(wearOf(owned, null), { frame: 'tester', badge: 'contributor' }, 'выданное надето сразу');
  assert.deepEqual(wearOf(owned, { frame: null, badge: null }), { frame: 'tester', badge: 'contributor' });
  assert.deepEqual(wearOf(owned, { frame: '', badge: 'contributor' }), { frame: null, badge: 'contributor' }, 'рамку снял сам');
  assert.deepEqual(wearOf(owned, { frame: 'tester', badge: '' }), { frame: 'tester', badge: null });
  assert.deepEqual(wearOf({ frames: [], badges: [] }, { frame: 'tester', badge: 'contributor' }), { frame: null, badge: null },
    'выбрано то, чего уже нет');
  assert.deepEqual(wearOf({ frames: [], badges: ['contributor'] }, { frame: null, badge: 'gold' }), { frame: null, badge: 'contributor' },
    'выбранный значок забрали — надет тот, что остался');
  assert.deepEqual(wearOf({ frames: [], badges: [] }, null), { frame: null, badge: null });
});

test('картинка значка: обводка в пиксель, грань, символ по центру, контур для clip-path', () => {
  const rows = ['................', ...Array(4).fill('......####......'), ...Array(11).fill('................')];
  const b = grid(rows);                                   // квадрат 4×4: x 6…9, y 1…4
  const inner = erode(b);
  assert.equal(path(b), 'M6 1h4v1h-4zM6 2h4v1h-4zM6 3h4v1h-4zM6 4h4v1h-4z');
  assert.equal(path(inner), 'M7 2h2v1h-2zM7 3h2v1h-2z', 'внутри обводки — 2×2');
  assert.equal(path(edge(inner, -1)), 'M7 2h2v1h-2zM7 3h1v1h-1z', 'свет — сверху и слева');
  assert.equal(path(edge(inner, 1)), 'M8 2h1v1h-1zM7 3h2v1h-2z', 'тень — снизу и справа');
  assert.equal(polygon(b),
    'polygon(37.5% 6.25%,37.5% 12.5%,37.5% 12.5%,37.5% 18.75%,37.5% 18.75%,37.5% 25%,37.5% 25%,37.5% 31.25%,'
    + '62.5% 31.25%,62.5% 25%,62.5% 25%,62.5% 18.75%,62.5% 18.75%,62.5% 12.5%,62.5% 12.5%,62.5% 6.25%)');
  // символ 2×2 встаёт в середину сетки, dy сдвигает по вертикали
  assert.equal(path(place(['##', '##'])), 'M7 7h2v1h-2zM7 8h2v1h-2z');
  assert.equal(path(place(['##', '##'], -1)), 'M7 6h2v1h-2zM7 7h2v1h-2z');
});
