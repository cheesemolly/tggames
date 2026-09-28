// Истории на главной нового интерфейса (в бете 'new-ui'): кружки и просмотр на весь экран. Что в них —
// shell/nui/content.js. Просмотренные кружки гаснут и уходят в конец ряда (отметка на этом устройстве).

import { el } from '../../shared/dom.js';
import { animate, reducedMotion } from '../../shared/motion.js';
import { GAME_ICONS } from '../icons.js';
import { UI, icon } from './icons.js';
import { catOf } from './ui.js';

const SEEN_KEY = 'tggames-stories-seen';

export function seenStories() {
  try {
    const list = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function markSeen(id) {
  try {
    const list = [...new Set([...seenStories(), id])].slice(-100);
    localStorage.setItem(SEEN_KEY, JSON.stringify(list));
  } catch {
    // приватный режим — просто не запомнится
  }
}

// ---------- кружки ----------

/** Картинка кружка: значок игры на цвете её папки (у итогов и рейтинга — кубок). */
function storyArt(story) {
  const game = story.games?.[0] ?? story.slides.find((s) => s.game)?.game ?? null;
  const art = el('span', { class: 'nstory-art', 'data-cat': game ? catOf(game) : 'words' });
  art.innerHTML = game && !story.mine ? GAME_ICONS[game] ?? '' : UI.trophy;
  return art;
}

export function storyRow(stories, { onOpen }) {
  return el('div', { class: 'nstories', role: 'list' }, stories.map((s, i) => el('button', {
    class: `nstory${s.seen ? ' seen' : ''}`, role: 'listitem', style: `--i: ${i}`, onclick: () => onOpen(i),
  },
    storyArt(s),
    el('span', { class: 'nstory-label' }, s.label),
  )));
}

// ---------- просмотр ----------

const SLIDE_MS = 6000;

/**
 * Полноэкранный просмотр с полосками сверху: тап справа — дальше, слева — назад, удержание — пауза,
 * карточки листаются сами. После последней карточки — следующая история, после последней истории — закрыть.
 */
export function openStories(stories, start, { titleOf, onClose = () => {}, onPlay }) {
  let si = start;
  let slide = 0;
  let timer = 0;
  let startedAt = 0;
  let left = SLIDE_MS;
  let paused = false;
  const bars = el('div', { class: 'nsv-bars' });
  const label = el('span', { class: 'nsv-label' });
  const body = el('div', { class: 'nsv-body' });
  const art = el('div', { class: 'nsv-art' });
  const action = el('div', { class: 'nsv-action' });
  const layer = el('div', { class: 'nsv', role: 'dialog', 'aria-label': 'История' },
    bars,
    el('div', { class: 'nsv-top' },
      el('span', { class: 'nsv-logo npx' }, 'A'),
      el('b', {}, 'ANYGAME'),
      label,
      el('button', { class: 'nsv-x', 'aria-label': 'Закрыть', onclick: close }, icon('x')),
    ),
    body, art, action,
  );
  document.body.append(layer);
  if (!reducedMotion()) animate(layer, [{ opacity: 0, transform: 'scale(0.96)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'ease-out' });

  // тап по левой трети — назад, по остальному — дальше; удержание — пауза
  let downAt = 0;
  layer.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, a')) return;
    downAt = performance.now();
    pause();
  });
  layer.addEventListener('pointerup', (e) => {
    if (e.target.closest('button, a') || !downAt) return;
    const held = performance.now() - downAt;
    downAt = 0;
    if (held > 350) {
      resume();
      return;
    }
    if (e.clientX < layer.clientWidth / 3) prev();
    else next();
  });
  layer.addEventListener('pointercancel', () => {
    downAt = 0;
    resume();
  });
  const onKey = (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowRight') next();
    if (e.key === 'ArrowLeft') prev();
  };
  document.addEventListener('keydown', onKey);
  render();

  function render() {
    const story = stories[si];
    const s = story.slides[slide];
    markSeen(story.id);
    label.textContent = story.label;
    bars.replaceChildren(...story.slides.map((_, i) => el('i', { class: i < slide ? 'done' : i === slide ? 'cur' : '' }, el('b'))));
    body.replaceChildren(
      el('span', { class: 'nsv-kicker' }, s.kicker),
      el('span', { class: 'nsv-title npx' }, s.title),
      el('span', { class: 'nsv-text' }, s.text),
    );
    const game = s.play ?? s.game ?? story.games?.[0] ?? null;
    const tile = el('span', { class: 'nsv-tile', 'data-cat': game ? catOf(game) : 'words' });
    tile.innerHTML = game && !s.icon ? GAME_ICONS[game] ?? '' : UI[s.icon ?? 'trophy'];
    art.replaceChildren(tile, el('i', { class: 'nsv-dot d1' }), el('i', { class: 'nsv-dot d2' }), el('i', { class: 'nsv-dot d3' }));
    if (!reducedMotion()) animate(tile, [{ transform: 'rotate(-8deg) scale(0.7)', opacity: 0 }, { transform: 'rotate(-8deg) scale(1.06)', opacity: 1, offset: 0.7 }, { transform: 'rotate(-8deg)' }], { duration: 360, easing: 'ease-out' });
    const button = s.play
      ? el('button', { class: 'nsv-btn', onclick: () => { close(); onPlay(s.play); } }, `Играть: ${titleOf(s.play)}`)
      : s.href ? el('button', { class: 'nsv-btn', onclick: () => { close(); location.replace(s.href); } }, s.button ?? 'Открыть')
        : null;
    action.replaceChildren(...(button ? [button] : []));
    left = SLIDE_MS;
    paused = false;
    run();
  }

  function run() {
    clearTimeout(timer);
    startedAt = performance.now();
    const bar = bars.children[slide]?.firstChild;
    if (bar) {
      bar.style.transition = 'none';
      bar.style.width = `${((SLIDE_MS - left) / SLIDE_MS) * 100}%`;
      void bar.offsetWidth;
      bar.style.transition = `width ${left}ms linear`;
      bar.style.width = '100%';
    }
    timer = setTimeout(next, left);
  }

  function pause() {
    if (paused) return;
    paused = true;
    clearTimeout(timer);
    left = Math.max(0, left - (performance.now() - startedAt));
    const bar = bars.children[slide]?.firstChild;
    if (bar) {
      bar.style.width = getComputedStyle(bar).width;
      bar.style.transition = 'none';
    }
  }

  function resume() {
    if (!paused) return;
    paused = false;
    run();
  }

  function next() {
    const story = stories[si];
    if (slide < story.slides.length - 1) slide += 1;
    else if (si < stories.length - 1) {
      si += 1;
      slide = 0;
    } else {
      close();
      return;
    }
    render();
  }

  function prev() {
    if (slide > 0) slide -= 1;
    else if (si > 0) {
      si -= 1;
      slide = stories[si].slides.length - 1;
    }
    render();
  }

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    document.removeEventListener('keydown', onKey);
    animate(layer, [{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: 'ease-in', fill: 'forwards' }).then(() => {
      layer.remove();
      onClose();
    });
  }
  return { close };
}
