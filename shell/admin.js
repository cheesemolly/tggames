// Панель владельца: список игроков, карточка игрока с правкой прогресса, блокировка, удаление,
// рассылка всем. Экран виден только тем, чей Telegram-id указан в ADMIN_IDS на сервере —
// проверяет это сервер, клиент лишь не рисует кнопку (доступ закрыт на сервере, а не в интерфейсе).
//
// Правки прогресса сохраняются с заведомо новой отметкой времени, поэтому устройство игрока
// при следующем обмене получит их, а не затрёт своим старым прогрессом.

import { feature } from './beta.js';
import { el } from '../shared/dom.js';
import { showLayer, hideLayer, shake } from '../shared/motion.js';
import { account } from '../platform/account.js';
import { message } from '../platform/errors.js';

const STATS_PREFIX = 'shell:stats:';
const PROGRESS_PREFIX = 'shell:progress:';

const date = (ms) => (ms ? new Date(ms).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : '—');

/** Разбирает прогресс игрока на понятные части: статистика по играм, строки уровней, остальное. */
export function splitState(text) {
  let data = {};
  try {
    data = JSON.parse(text || '{}');
  } catch {
    return { broken: true, stats: [], progress: [], data: {} };
  }
  const stats = [];
  const progress = [];
  for (const [key, value] of Object.entries(data)) {
    if (key.startsWith(STATS_PREFIX) && value && typeof value === 'object') {
      stats.push({ key, game: key.slice(STATS_PREFIX.length), value });
    } else if (key.startsWith(PROGRESS_PREFIX) && typeof value === 'string') {
      progress.push({ key, game: key.slice(PROGRESS_PREFIX.length), value });
    }
  }
  stats.sort((a, b) => a.game.localeCompare(b.game, 'ru'));
  progress.sort((a, b) => a.game.localeCompare(b.game, 'ru'));
  return { broken: false, stats, progress, data };
}

// api — по умолчанию настоящий аккаунт; параметром он передаётся только в проверках интерфейса.
export function renderAdmin(container, { onBack, toast, api = account }) {
  let list = [];
  let query = '';

  const search = el('input', {
    class: 'field', type: 'search', placeholder: 'Имя, @username или id', value: '',
  });
  const listBox = el('div', { class: 'adm-list' });
  const totalLine = el('p', { class: 'hint' }, 'Загрузка…');

  container.replaceChildren(el('div', { class: 'scroll adm' },
    el('button', { class: 'back-chip', onclick: onBack }, '‹ В меню'),
    el('h1', {}, 'Панель'),
    el('div', { class: 'title-rule' }),
    totalLine,
    el('div', { class: 'adm-search' }, search, el('button', { class: 'account-btn', onclick: () => load(search.value) }, 'Найти')),
    el('div', { class: 'adm-tools' },
      el('button', { class: 'btn btn-secondary', onclick: askBroadcast }, '✉️ Рассылка всем'),
    ),
    listBox,
  ));

  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') load(search.value);
  });

  load('');

  async function load(q) {
    query = q.trim();
    totalLine.textContent = 'Загрузка…';
    const res = await api.players(query);
    if (!res.ok) {
      totalLine.textContent = message(res.error);
      return;
    }
    list = res.data.players;
    totalLine.textContent = query
      ? `Найдено: ${list.length}`
      : `Игроков всего: ${res.data.total}`;
    renderList();
  }

  function renderList() {
    if (!list.length) {
      listBox.replaceChildren(el('p', { class: 'hint' }, 'Никого не нашлось.'));
      return;
    }
    listBox.replaceChildren(...list.map((p) => el('button', {
      class: `adm-row${p.banned ? ' adm-row-banned' : ''}`,
      onclick: () => openPlayer(p.id),
    },
      el('span', { class: 'adm-row-name' }, p.username ? `${p.name} (@${p.username})` : p.name),
      el('span', { class: 'adm-row-meta' },
        `id ${p.tgId} · заходил ${date(p.lastSeenAt)}${p.banned ? ' · заблокирован' : ''}`),
    )));
  }

  // ---------- карточка игрока ----------

  async function openPlayer(id) {
    const res = await api.player(id);
    if (!res.ok) {
      toast.show(message(res.error));
      return;
    }
    showCard(res.data);
  }

  function showCard({ player, data, updatedAt, perks = [], allPerks = null }) {
    const parts = splitState(data);
    const jsonBox = el('textarea', { class: 'adm-json', spellcheck: 'false', value: pretty(data) });

    // Поля статистики: сыграно / побед / рекорд по каждой игре.
    const statFields = parts.stats.map(({ game, value }) => {
      const inputs = ['played', 'wins', 'best'].map((field) => el('input', {
        class: 'adm-num', type: 'number', inputmode: 'numeric', 'data-field': field,
        value: value[field] === null || value[field] === undefined ? '' : String(value[field]),
        placeholder: { played: 'сыграно', wins: 'побед', best: 'рекорд' }[field],
      }));
      return { game, inputs, node: el('div', { class: 'adm-field' }, el('span', { class: 'adm-field-name' }, game), el('div', { class: 'adm-nums' }, inputs)) };
    });

    // Строки уровней («Уровень 14») — их показывает меню.
    const progressFields = parts.progress.map(({ game, value }) => {
      const input = el('input', { class: 'field', type: 'text', value });
      return { game, input, node: el('div', { class: 'adm-field' }, el('span', { class: 'adm-field-name' }, game), input) };
    });

    const card = el('div', { class: 'adm-card' },
      el('button', { class: 'overlay-close', onclick: close, 'aria-label': 'Закрыть' }, '✕'),
      el('h2', { class: 'overlay-title' }, player.username ? `${player.name} (@${player.username})` : player.name),
      el('p', { class: 'hint' },
        `Telegram id ${player.tgId} · первый заход ${date(player.createdAt)} · последний ${date(player.lastSeenAt)}`
        + `\nПрогресс сохранён: ${date(updatedAt)}`),

      statFields.length && el('h3', { class: 'adm-h3' }, 'Статистика по играм'),
      ...statFields.map((f) => f.node),

      progressFields.length && el('h3', { class: 'adm-h3' }, 'Строки уровней'),
      ...progressFields.map((f) => f.node),

      // особые скины (в бете: perks) — выдать / забрать; список приходит с сервера (старый воркер его не отдаёт)
      allPerks && feature('perks') && el('h3', { class: 'adm-h3' }, 'Особые скины'),
      ...(allPerks && feature('perks') ? Object.entries(allPerks).map(([perk, title]) => perkRow(perk, title)) : []),

      el('h3', { class: 'adm-h3' }, 'Весь прогресс (JSON)'),
      parts.broken && el('p', { class: 'error-line' }, 'Прогресс не разобрался как JSON — правь осторожно.'),
      jsonBox,

      el('div', { class: 'adm-actions' },
        el('button', { class: 'btn', onclick: saveFields }, 'Сохранить поля'),
        el('button', { class: 'btn btn-secondary', onclick: saveJson }, 'Сохранить JSON'),
      ),
      el('div', { class: 'adm-actions' },
        el('button', { class: 'btn btn-secondary', onclick: toggleBan }, player.banned ? 'Разблокировать' : 'Заблокировать'),
        el('button', { class: 'btn btn-danger', onclick: removePlayer }, 'Удалить'),
      ),
    );

    const layer = el('div', { class: 'overlay' }, card);
    document.body.appendChild(layer);
    showLayer(layer);

    function close() {
      hideLayer(layer).then(() => layer.remove());
    }

    /** Собрать правки полей обратно в прогресс и отправить. */
    async function saveFields() {
      const next = { ...parts.data };
      for (const { game, inputs } of statFields) {
        const stats = { ...next[STATS_PREFIX + game] };
        for (const input of inputs) {
          const raw = input.value.trim();
          stats[input.dataset.field] = raw === '' ? null : Number(raw);
        }
        if (Number.isNaN(stats.played) || Number.isNaN(stats.wins) || Number.isNaN(stats.best)) {
          shake(card);
          toast.show('В статистике должны быть числа');
          return;
        }
        next[STATS_PREFIX + game] = stats;
      }
      for (const { game, input } of progressFields) {
        const value = input.value.trim();
        if (value) next[PROGRESS_PREFIX + game] = value;
        else delete next[PROGRESS_PREFIX + game];
      }
      await send(JSON.stringify(next));
    }

    async function saveJson() {
      try {
        JSON.parse(jsonBox.value);
      } catch {
        shake(card);
        toast.show('Это не JSON — проверь скобки и кавычки');
        return;
      }
      await send(jsonBox.value);
    }

    function perkRow(perk, title) {
      let on = perks.includes(perk);
      const button = el('button', { class: 'account-btn', onclick: toggle });
      const paint = () => {
        button.textContent = on ? 'Забрать' : 'Выдать';
        button.classList.toggle('adm-perk-on', on);
      };
      async function toggle() {
        const res = await api.setPerk(player.id, perk, !on);
        if (!res.ok) {
          toast.show(message(res.error));
          return;
        }
        on = res.data.perks.includes(perk);
        paint();
        toast.show(on ? 'Выдано — появится у игрока при следующем запуске' : 'Забрано');
      }
      paint();
      return el('div', { class: 'adm-perk' }, el('span', {}, title), button);
    }

    async function send(text) {
      const res = await api.savePlayerState(player.id, text);
      toast.show(res.ok ? 'Прогресс игрока сохранён' : message(res.error));
      if (res.ok) close();
    }

    async function toggleBan() {
      const res = await api.banPlayer(player.id, !player.banned);
      if (!res.ok) {
        toast.show(message(res.error));
        return;
      }
      toast.show(player.banned ? 'Разблокирован' : 'Заблокирован');
      close();
      load(query);
    }

    async function removePlayer() {
      if (!confirm(`Удалить ${player.name} и весь его прогресс? Это навсегда.`)) return;
      const res = await api.deletePlayer(player.id);
      toast.show(res.ok ? 'Игрок удалён' : message(res.error));
      if (res.ok) {
        close();
        load(query);
      }
    }
  }

  // ---------- рассылка ----------

  function askBroadcast() {
    const field = el('textarea', { class: 'adm-json adm-broadcast', placeholder: 'Текст сообщения всем игрокам' });
    const card = el('div', { class: 'adm-card' },
      el('button', { class: 'overlay-close', onclick: close, 'aria-label': 'Закрыть' }, '✕'),
      el('h2', { class: 'overlay-title' }, 'Рассылка'),
      el('p', { class: 'hint' }, 'Сообщение уйдёт в личку каждому, кто открывал игры через бота.'),
      field,
      el('div', { class: 'adm-actions' },
        el('button', { class: 'btn', onclick: send }, 'Разослать'),
        el('button', { class: 'btn btn-secondary', onclick: close }, 'Отмена'),
      ),
    );
    const layer = el('div', { class: 'overlay' }, card);
    document.body.appendChild(layer);
    showLayer(layer);

    function close() {
      hideLayer(layer).then(() => layer.remove());
    }

    async function send() {
      const text = field.value.trim();
      if (!text) {
        shake(card);
        return;
      }
      toast.show('Рассылаю…', 4000);
      const res = await api.broadcast(text);
      toast.show(res.ok ? `Разослано: ${res.data.sent} из ${res.data.total}` : message(res.error), 3000);
      if (res.ok) close();
    }
  }
}

const pretty = (text) => {
  try {
    return JSON.stringify(JSON.parse(text || '{}'), null, 2);
  } catch {
    return text;
  }
};
