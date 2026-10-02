// Доска го для правил и бота — быстрая, без DOM. Точка — индекс на доске с рамкой: p = (r + 1)·W + (c + 1),
// W = n + 2; цвет: 0 — пусто, 1 — чёрные, 2 — белые, 3 — край. Камни одного цвета, соседние по стороне, — цепь:
// у каждой цепи «голова» (head), кольцевой список камней (next) и «псевдо-свободы»: каждая пара «камень — пустой
// сосед» считается отдельно (libs), вместе с суммой и суммой квадратов номеров этих пустых точек. Тогда цепь в
// атари (у неё ровно одна настоящая свобода), когда все псевдо-свободы — одна и та же точка: sum² = libs·sumSq,
// а сама свобода — sum / libs. Так ход, взятие и проверка атари — без обхода цепи (приём из Fuego/Pachi).
// Пустые точки — в списке с удалением за O(1): из него бот берёт случайные ходы в розыгрышах.

export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;
export const EDGE = 3;
export const PASS = -1;

// Зобрист: два 32-битных числа на точку и цвет (до 21×21 с рамкой); детерминированно — одинаково везде
const ZMAX = 21 * 21;
const Z1 = new Int32Array(ZMAX * 3);
const Z2 = new Int32Array(ZMAX * 3);
{
  let x = 0x9e3779b9 | 0;
  const next = () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return x | 0;
  };
  for (let k = 0; k < Z1.length; k++) {
    Z1[k] = next();
    Z2[k] = next();
  }
}

export class Board {
  constructor(n) {
    this.n = n;
    const W = n + 2;
    this.W = W;
    const len = W * W;
    this.len = len;
    this.color = new Uint8Array(len);
    this.head = new Int16Array(len);
    this.next = new Int16Array(len);
    this.stones = new Int16Array(len);
    this.libs = new Int16Array(len);
    this.libSum = new Int32Array(len);
    this.libSq = new Float64Array(len);
    this.empty = new Int16Array(n * n);
    this.emptyAt = new Int16Array(len).fill(-1);
    this.emptyCount = 0;
    this.ko = 0;
    this.h1 = 0;
    this.h2 = 0;
    this.captured = [0, 0, 0];        // сколько камней этого цвета взято соперником
    this.lastCaptured = 0;
    this.lastCapturedAt = [];
    for (let p = 0; p < len; p++) {
      const r = Math.floor(p / W);
      const c = p % W;
      if (r === 0 || c === 0 || r === W - 1 || c === W - 1) this.color[p] = EDGE;
      else this.addEmpty(p);
    }
  }

  clone() {
    const b = Object.create(Board.prototype);
    b.n = this.n;
    b.W = this.W;
    b.len = this.len;
    b.color = this.color.slice();
    b.head = this.head.slice();
    b.next = this.next.slice();
    b.stones = this.stones.slice();
    b.libs = this.libs.slice();
    b.libSum = this.libSum.slice();
    b.libSq = this.libSq.slice();
    b.empty = this.empty.slice();
    b.emptyAt = this.emptyAt.slice();
    b.emptyCount = this.emptyCount;
    b.ko = this.ko;
    b.h1 = this.h1;
    b.h2 = this.h2;
    b.captured = [...this.captured];
    b.lastCaptured = 0;
    b.lastCapturedAt = [];
    return b;
  }

  /** Скопировать доску other того же размера на место этой (без новых массивов — для розыгрышей). */
  copyFrom(o) {
    this.color.set(o.color);
    this.head.set(o.head);
    this.next.set(o.next);
    this.stones.set(o.stones);
    this.libs.set(o.libs);
    this.libSum.set(o.libSum);
    this.libSq.set(o.libSq);
    this.empty.set(o.empty);
    this.emptyAt.set(o.emptyAt);
    this.emptyCount = o.emptyCount;
    this.ko = o.ko;
    this.h1 = o.h1;
    this.h2 = o.h2;
    this.captured[1] = o.captured[1];
    this.captured[2] = o.captured[2];
  }

  pt(r, c) { return (r + 1) * this.W + c + 1; }
  rowOf(p) { return Math.floor(p / this.W) - 1; }
  colOf(p) { return (p % this.W) - 1; }
  /** Точка с рамкой ↔ индекс без рамки (r·n + c) — им пользуются сохранение и экран. */
  toIndex(p) { return this.rowOf(p) * this.n + this.colOf(p); }
  fromIndex(i) { return this.pt(Math.floor(i / this.n), i % this.n); }

  addEmpty(p) {
    this.emptyAt[p] = this.emptyCount;
    this.empty[this.emptyCount++] = p;
  }

  removeEmpty(p) {
    const k = this.emptyAt[p];
    const last = this.empty[--this.emptyCount];
    this.empty[k] = last;
    this.emptyAt[last] = k;
    this.emptyAt[p] = -1;
  }

  addLib(h, q) {
    this.libs[h]++;
    this.libSum[h] += q;
    this.libSq[h] += q * q;
  }

  removeLib(h, q) {
    this.libs[h]--;
    this.libSum[h] -= q;
    this.libSq[h] -= q * q;
  }

  /** Цепь h в атари (одна свобода). */
  inAtari(h) {
    const n = this.libs[h];
    const s = this.libSum[h];
    return n > 0 && s * s === n * this.libSq[h];
  }

  /** Единственная свобода цепи в атари. */
  atariLib(h) { return this.libSum[h] / this.libs[h]; }

  /** Все псевдо-свободы цепи h — точка q (значит, ход в q для неё последний вдох). */
  onlyLib(h, q) { return this.libSum[h] === this.libs[h] * q && this.libSq[h] === this.libs[h] * q * q; }

  /** Можно ли поставить камень c в p: пусто, не ко, не самоубийство. Позиционное суперко — в rules.js. */
  isLegal(p, c) {
    const col = this.color;
    if (col[p] !== EMPTY || p === this.ko) return false;
    const W = this.W;
    const nb = [p - 1, p + 1, p - W, p + W];
    for (let k = 0; k < 4; k++) {
      const q = nb[k];
      const v = col[q];
      if (v === EMPTY) return true;
      if (v === EDGE) continue;
      const h = this.head[q];
      if (v === c) {
        if (!this.onlyLib(h, p)) return true;   // у своей цепи останется другая свобода
      } else if (this.onlyLib(h, p)) return true;  // взятие
    }
    return false;
  }

  /** Поставить камень (ход уже проверен isLegal). Возвращает число взятых камней. */
  play(p, c) {
    const W = this.W;
    const col = this.color;
    const head = this.head;
    const o = 3 - c;
    this.removeEmpty(p);
    col[p] = c;
    this.h1 ^= Z1[p * 3 + c];
    this.h2 ^= Z2[p * 3 + c];
    head[p] = p;
    this.next[p] = p;
    this.stones[p] = 1;
    this.libs[p] = 0;
    this.libSum[p] = 0;
    this.libSq[p] = 0;
    const n0 = p - 1;
    const n1 = p + 1;
    const n2 = p - W;
    const n3 = p + W;
    for (const q of [n0, n1, n2, n3]) {
      const v = col[q];
      if (v === EMPTY) this.addLib(p, q);
      else if (v !== EDGE) this.removeLib(head[q], p);
    }
    let taken = 0;
    let at = 0;
    this.lastCapturedAt.length = 0;
    for (const q of [n0, n1, n2, n3]) {
      if (col[q] === o && this.libs[head[q]] === 0) {
        taken += this.stones[head[q]];
        at = q;
        this.capture(head[q]);
      }
    }
    for (const q of [n0, n1, n2, n3]) {
      if (col[q] === c && head[q] !== head[p]) this.merge(head[p], head[q]);
    }
    const h = head[p];
    this.ko = taken === 1 && this.stones[h] === 1 && this.libs[h] === 1 ? at : 0;
    this.captured[o] += taken;
    this.lastCaptured = taken;
    return taken;
  }

  /** Пас: снимает ко. */
  pass() {
    this.ko = 0;
    this.lastCaptured = 0;
    this.lastCapturedAt.length = 0;
  }

  capture(h) {
    const W = this.W;
    const col = this.color;
    const head = this.head;
    let s = h;
    do {
      const c = col[s];
      col[s] = EMPTY;
      this.h1 ^= Z1[s * 3 + c];
      this.h2 ^= Z2[s * 3 + c];
      this.addEmpty(s);
      this.lastCapturedAt.push(s);
      s = this.next[s];
    } while (s !== h);
    s = h;
    do {
      for (const q of [s - 1, s + 1, s - W, s + W]) {
        const v = col[q];
        if (v === BLACK || v === WHITE) this.addLib(head[q], s);
      }
      s = this.next[s];
    } while (s !== h);
  }

  merge(a, b) {
    // меньшая цепь вливается в большую
    if (this.stones[a] < this.stones[b]) {
      const t = a;
      a = b;
      b = t;
    }
    const head = this.head;
    let s = b;
    do {
      head[s] = a;
      s = this.next[s];
    } while (s !== b);
    const t = this.next[a];
    this.next[a] = this.next[b];
    this.next[b] = t;
    this.stones[a] += this.stones[b];
    this.libs[a] += this.libs[b];
    this.libSum[a] += this.libSum[b];
    this.libSq[a] += this.libSq[b];
  }

  /** Камни цепи, где стоит p. */
  chain(p) {
    const out = [];
    let s = this.head[p];
    const h = s;
    do {
      out.push(s);
      s = this.next[s];
    } while (s !== h);
    return out;
  }

  /** Настоящие свободы цепи (без повторов). */
  liberties(p) {
    const set = new Set();
    const W = this.W;
    for (const s of this.chain(p)) {
      for (const q of [s - 1, s + 1, s - W, s + W]) if (this.color[q] === EMPTY) set.add(q);
    }
    return [...set];
  }

  /**
   * «Глаз» цвета c в p (для розыгрышей: свой глаз не заполняют): все соседи свои или край, а из диагоналей
   * чужих не больше одной (у края — ни одной).
   */
  isEye(p, c) {
    const col = this.color;
    const W = this.W;
    if (col[p] !== EMPTY) return false;
    for (const q of [p - 1, p + 1, p - W, p + W]) {
      const v = col[q];
      if (v !== c && v !== EDGE) return false;
    }
    let bad = 0;
    let edge = 0;
    for (const q of [p - W - 1, p - W + 1, p + W - 1, p + W + 1]) {
      const v = col[q];
      if (v === EDGE) edge = 1;
      else if (v === 3 - c) bad++;
    }
    return bad + edge < 2;
  }

  /** Ключ позиции (для суперко) — строкой из двух половин хэша. */
  key() { return `${this.h1 >>> 0}:${this.h2 >>> 0}`; }
}
