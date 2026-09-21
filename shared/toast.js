// Всплывающее сообщение («Нет в словаре», «Нечего отменять»): плавно появляется и затухает.
// Стили — .toast в styles/app.css; игра может сдвинуть его (--toast-top) и перекрасить (--toast-bg/--toast-fg).

export function createToast() {
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  let timer = null;

  return {
    el,
    show(text, ms = 1600) {
      el.textContent = text;
      el.classList.add('toast-show');
      clearTimeout(timer);
      timer = setTimeout(() => el.classList.remove('toast-show'), ms);
    },
    dispose() {
      clearTimeout(timer);
      el.remove();
    },
  };
}
