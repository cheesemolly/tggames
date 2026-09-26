// Роутинг на hash: работает на любом статическом хостинге и внутри Telegram.
//   #/              — главная: сетка папок
//   #/folder/<id>   — папка: сетка игр внутри неё
//   #/game/<id>     — игра
//   #/admin         — панель владельца (сервер пускает только ADMIN_IDS)
//   #/beta          — вкладка «Бета»: что обкатывается у владельца до релиза (shell/beta.js)

export function currentRoute() {
  const [section, id] = location.hash.replace(/^#\/?/, '').split('/');
  if (section === 'game' && id) return { name: 'game', id: decodeURIComponent(id) };
  if (section === 'folder' && id) return { name: 'folder', id: decodeURIComponent(id) };
  if (section === 'admin') return { name: 'admin' };
  if (section === 'beta') return { name: 'beta' };
  return { name: 'menu' };
}

export function onRouteChange(cb) {
  window.addEventListener('hashchange', () => cb(currentRoute()));
}

// replace, а не push: «Назад» из игры не должен оставлять игру в истории браузера.
export function goToMenu() {
  location.replace('#/');
}

export function goToFolder(id) {
  location.replace(`#/folder/${encodeURIComponent(id)}`);
}
