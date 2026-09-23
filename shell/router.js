// Роутинг на hash: работает на любом статическом хостинге и внутри Telegram.
//   #/              — главная: сетка папок
//   #/folder/<id>   — папка: сетка игр внутри неё
//   #/game/<id>     — игра

export function currentRoute() {
  const [section, id] = location.hash.replace(/^#\/?/, '').split('/');
  if (section === 'game' && id) return { name: 'game', id: decodeURIComponent(id) };
  if (section === 'folder' && id) return { name: 'folder', id: decodeURIComponent(id) };
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
