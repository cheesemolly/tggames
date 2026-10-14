// Диагностика экрана (только ?fhdebug или ссылка t.me/<бот>?startapp=fhdebug): окно, рамка игры, отступы Telegram,
// веб-вида и игры, где лежат HUD и его кнопки — в осях устройства и игры. Окно «Диагностика» (ui.js) показывает это
// текстом поверх игры, чтобы сфотографировать на телефоне; __foxHunt.diag() отдаёт те же числа.
// Без DOM при импорте: collectDiag меряет страницу, diagLines — чистая (её проверяют тесты).

const SIDES = ['top', 'right', 'bottom', 'left'];
const TG_VARS = ['--tg-viewport-height', '--tg-viewport-stable-height'];
// что меряем в HUD: имя → селектор внутри корня игры
const PARTS = [
  ['верхний ряд', '.fh-top'],
  ['правая колонка', '.fh-side--r'],
  ['пауза', '.fh-pause-btn:not(.fh-bag-btn)'],
  ['рюкзак', '.fh-bag-btn'],
  ['карта', '.fh-map'],
  ['левая колонка', '.fh-side--l'],
];

const r0 = (v) => (Number.isFinite(v) ? Math.round(v) : '?');
const r1 = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : '?');
const r2 = (v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : '?');
const px = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

/** Отступы { top, right, bottom, left } → «в0 п0 н0 л76». */
export const sides = (o) => (o ? `в${r0(o.top)} п${r0(o.right)} н${r0(o.bottom)} л${r0(o.left)}` : '—');

/** Прямоугольник { l, t, r, b } → «0,0→393,851». */
export const span = (b) => (b ? `${r0(b.l)},${r0(b.t)}→${r0(b.r)},${r0(b.b)}` : '—');

const box = (r) => ({ l: r.left, t: r.top, r: r.right, b: r.bottom });

/** Отступы из вычисленного стиля: prefix + top/right/bottom/left (или -t/-r/-b/-l), в px; нет ни одного — null. */
function readSides(cs, names) {
  const out = {};
  let any = false;
  SIDES.forEach((side, i) => {
    const v = px(cs.getPropertyValue(names[i]));
    out[side] = v ?? 0;
    any ||= v !== null;
  });
  return any ? out : null;
}

/**
 * Снять числа со страницы. root — корень игры (div.fh), screen — api.screen или null. Возвращает простой объект
 * (его можно отдать как есть: JSON без функций).
 */
export function collectDiag({ root, screen = null }) {
  const doc = root.ownerDocument;
  const win = doc.defaultView;
  const html = doc.documentElement;
  const hs = win.getComputedStyle(html);
  const vv = win.visualViewport;
  const facts = {
    win: { w: win.innerWidth, h: win.innerHeight, dpr: win.devicePixelRatio ?? 1 },
    device: { w: win.screen?.width, h: win.screen?.height, orient: win.screen?.orientation?.type ?? '' },
    vv: vv ? { w: vv.width, h: vv.height, x: vv.offsetLeft, y: vv.offsetTop, k: vv.scale } : null,
    full: html.dataset?.fullscreen ?? '',
    tg: {
      vh: px(hs.getPropertyValue(TG_VARS[0])),
      stable: px(hs.getPropertyValue(TG_VARS[1])),
      safe: readSides(hs, SIDES.map((s) => `--tg-safe-area-inset-${s}`)),
      content: readSides(hs, SIDES.map((s) => `--tg-content-safe-area-inset-${s}`)),
    },
    env: null,
    body: box(doc.body.getBoundingClientRect()),
    frame: null,
    ls: readSides(win.getComputedStyle(root), ['--ls-t', '--ls-r', '--ls-b', '--ls-l']),
    turn: screen ? screen.turn : 0,
    flipped: Boolean(screen?.flipped),
    size: screen ? screen.size() : { w: root.offsetWidth, h: root.offsetHeight },
    insets: screen ? screen.insets() : null,
    root: { w: root.offsetWidth, h: root.offsetHeight },
    zoom: px(win.getComputedStyle(root).getPropertyValue('--fh-hud-zoom')),
    parts: [],
  };
  // env(safe-area-inset-*) — что знает сам веб-вид (пробник на миг)
  const probe = doc.createElement('div');
  for (const [name, value] of [['position', 'fixed'], ['visibility', 'hidden'], ['pointer-events', 'none'], ['width', '0'], ['height', '0'],
    ...SIDES.map((s) => [`padding-${s}`, `env(safe-area-inset-${s}, 0px)`])]) probe.style.setProperty(name, value);
  doc.body.append(probe);
  const ps = win.getComputedStyle(probe);
  facts.env = { top: px(ps.paddingTop) ?? 0, right: px(ps.paddingRight) ?? 0, bottom: px(ps.paddingBottom) ?? 0, left: px(ps.paddingLeft) ?? 0 };
  probe.remove();
  // рамка экрана игры (оси устройства): экран маршрута, который оболочка кладёт набок
  const frameEl = root.closest('.screen-land') ?? root.parentElement ?? root;
  facts.frame = box(frameEl.getBoundingClientRect());
  // части HUD: оси устройства (как на стекле) и оси игры (как их раскладывает игра)
  const rootBox = root.getBoundingClientRect();
  const p = { x: 0, y: 0 };
  const toGame = (x, y) => {
    if (screen) {
      screen.toLocal(x, y, p);
      return { x: p.x, y: p.y };
    }
    return { x: x - rootBox.left, y: y - rootBox.top };
  };
  for (const [name, sel] of PARTS) {
    const node = root.querySelector(sel);
    const r = node?.getBoundingClientRect();
    if (!r || (!r.width && !r.height)) {
      facts.parts.push({ name, none: true });
      continue;
    }
    const a = toGame(r.left, r.top);
    const b = toGame(r.right, r.bottom);
    facts.parts.push({
      name,
      dev: box(r),
      game: { l: Math.min(a.x, b.x), t: Math.min(a.y, b.y), r: Math.max(a.x, b.x), b: Math.max(a.y, b.y) },
    });
  }
  return facts;
}

/** На сколько px прямоугольник b вылезает за рамку { l, t, r, b } (0 — внутри). */
export function overOf(b, zone) {
  return Math.max(0, zone.l - b.l, zone.t - b.t, b.r - zone.r, b.b - zone.b);
}

/** Числа → строки для окна. Строки с «!» в начале — тревога (выделяются). */
export function diagLines(f) {
  if (!f) return ['нет данных'];
  const winZone = { l: 0, t: 0, r: f.win.w, b: f.win.h };
  const ins = f.insets ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const safe = { l: ins.left, t: ins.top, r: f.size.w - ins.right, b: f.size.h - ins.bottom };
  const lines = [
    `окно ${r0(f.win.w)}×${r0(f.win.h)} · экран ${r0(f.device.w)}×${r0(f.device.h)} · dpr ${r2(f.win.dpr)}${f.device.orient ? ` · ${f.device.orient}` : ''}`,
    f.vv ? `visualViewport ${r1(f.vv.w)}×${r1(f.vv.h)} сдвиг ${r1(f.vv.x)},${r1(f.vv.y)} ×${r1(f.vv.k)}` : 'visualViewport нет',
    `полный экран: ${f.full || '—'} · Telegram: высота ${f.tg.vh ?? '—'} · стаб. ${f.tg.stable ?? '—'}`,
    `TG safe ${sides(f.tg.safe)} · content ${sides(f.tg.content)}`,
    `env() ${sides(f.env)}`,
    `body ${span(f.body)} · рамка игры ${span(f.frame)}`,
    `поворот ${f.turn}${f.flipped ? ' (другой бок)' : ''} · игра ${r0(f.size.w)}×${r0(f.size.h)} · корень ${r0(f.root.w)}×${r0(f.root.h)}`,
    `отступы игры ${sides(f.insets)} · --ls ${sides(f.ls)} · zoom HUD ${f.zoom ?? '—'}`,
  ];
  const bodyOver = overOf(f.body, winZone);
  if (bodyOver > 0.5) lines.push(`! body больше окна: вылезает на ${r0(bodyOver)} px`);
  const frameOver = overOf(f.frame, winZone);
  if (frameOver > 0.5) lines.push(`! рамка игры больше окна: вылезает на ${r0(frameOver)} px`);
  for (const part of f.parts) {
    if (part.none) {
      lines.push(`${part.name}: не видно`);
      continue;
    }
    const out = overOf(part.dev, winZone);
    const into = overOf(part.game, safe);
    const tail = `${out > 0.5 ? ` · ЗА ОКНОМ ${r0(out)}` : ''}${into > 0.5 ? ` · в отступе ${r0(into)}` : ''}`;
    lines.push(`${out > 0.5 || into > 0.5 ? '! ' : ''}${part.name}: игра ${span(part.game)} · стекло ${span(part.dev)}${tail}`);
  }
  return lines;
}
