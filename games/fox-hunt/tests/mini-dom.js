import { fakeCanvas } from './fake-canvas.js';

// Совсем маленький DOM для проверки окон ui.js в Node: дерево, классы, атрибуты, слушатели, textContent.
// Не умеет вёрстки — только то, что окна делают со страницей.

function makeClassList(node) {
  const set = () => new Set(String(node.className).split(/\s+/).filter(Boolean));
  const write = (s) => { node.className = [...s].join(' '); };
  return {
    contains: (c) => set().has(c),
    add: (...list) => { const s = set(); list.forEach((c) => s.add(c)); write(s); },
    remove: (...list) => { const s = set(); list.forEach((c) => s.delete(c)); write(s); },
    toggle(c, on) {
      const s = set();
      const want = on === undefined ? !s.has(c) : Boolean(on);
      if (want) s.add(c); else s.delete(c);
      write(s);
      return want;
    },
  };
}

export class MiniNode {
  constructor(tag, doc) {
    this.localName = tag;
    this.tagName = String(tag).toUpperCase();
    this.ownerDocument = doc;
    this.children = [];
    this.parentNode = null;
    this.attrs = {};
    this.className = '';
    this.hidden = false;
    this.disabled = false;
    this.dataset = {};
    this.listeners = new Map();
    this.text = '';
    this.classList = makeClassList(this);
    const vars = {};
    this.style = {
      vars,
      setProperty(k, v) { vars[k] = String(v); },
      removeProperty(k) { delete vars[k]; },
      getPropertyValue: (k) => vars[k] ?? '',
    };
  }

  get firstElementChild() { return this.children.find((c) => c instanceof MiniNode) ?? null; }
  get offsetWidth() { return 568; }
  get offsetHeight() { return 320; }
  set innerHTML(html) { this.children = []; this.text = ''; this.html = String(html); }
  get innerHTML() { return this.html ?? ''; }
  get textContent() { return this.text + this.children.map((c) => (c instanceof MiniNode ? c.textContent : String(c))).join(''); }
  set textContent(v) { this.children = []; this.text = String(v); }

  append(...kids) {
    for (const k of kids) {
      if (k instanceof MiniNode) {
        k.remove();
        k.parentNode = this;
        this.children.push(k);
      } else this.children.push(String(k));
    }
  }
  appendChild(k) { this.append(k); return k; }
  replaceChildren(...kids) {
    for (const c of this.children) if (c instanceof MiniNode) c.parentNode = null;
    this.children = [];
    this.text = '';
    this.append(...kids);
  }
  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((k) => k !== this);
    this.parentNode = null;
  }
  contains(n) {
    for (let x = n; x; x = x.parentNode) if (x === this) return true;
    return false;
  }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'class') this.className = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  removeAttribute(k) { delete this.attrs[k]; }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
  }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  fire(type, props = {}) {
    const e = { type, target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...props };
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn(e);
    return e;
  }
  getContext(kind) {
    if (this.localName !== 'canvas' || kind !== '2d') return null;
    this.ctx ??= fakeCanvas(this.width || 1, this.height || 1).getContext('2d');
    return this.ctx;
  }
  getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
  focus() {}

  /** Все потомки, подходящие под проверку. */
  find(test, out = []) {
    for (const c of this.children) {
      if (!(c instanceof MiniNode)) continue;
      if (test(c)) out.push(c);
      c.find(test, out);
    }
    return out;
  }
  byClass(cls) { return this.find((n) => n.classList.contains(cls)); }
  byText(text) { return this.find((n) => n.localName === 'button' && n.textContent === text); }
}

/** Подставная страница: document, window и всё, что нужно el(). Возвращает { doc, win, root, install() }. */
export function miniPage() {
  const doc = new MiniNode('#document', null);
  const win = new MiniNode('#window', null);
  doc.defaultView = win;
  doc.createElement = (tag) => new MiniNode(tag, doc);
  doc.elementFromPoint = () => null;
  win.devicePixelRatio = 1;
  win.getComputedStyle = () => ({ getPropertyValue: () => '' });
  win.matchMedia = () => ({ matches: false });
  const root = doc.createElement('div');
  root.ownerDocument = doc;
  return { doc, win, root };
}

/** Нажатие пальцем по кнопке: pointerdown + pointerup на ней же (как делает tap). */
export function press(node, id = 1) {
  node.fire('pointerdown', { pointerId: id, pointerType: 'touch', button: 0 });
  node.fire('pointerup', { pointerId: id, pointerType: 'touch', button: 0, clientX: 0, clientY: 0 });
}
