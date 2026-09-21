// Спецэффекты на холсте поверх игры: частицы, лучи, молнии, конфетти (Block Blast, Маджонг).
// Холст не ловит нажатия; цикл отрисовки крутится, только пока есть что рисовать.
// При «уменьшить движение» эффекты не рисуются вовсе.

import { reducedMotion } from './motion.js';

/** host — элемент, поверх которого рисуем; className — класс холста (позиционирование — в CSS игры). */
export function createFx(host, className = 'fx') {
  const canvas = document.createElement('canvas');
  canvas.className = className;
  const ctx = canvas.getContext('2d');
  let items = [];
  let raf = 0;
  let last = 0;
  let dpr = 1;

  function resize() {
    const rect = host.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);

  function add(item) {
    if (reducedMotion()) return;
    items.push(item);
    if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    items = items.filter((it) => {
      it.t += dt;
      if (it.t >= it.life) return false;
      it.draw(ctx, it.t / it.life, dt);
      return true;
    });
    raf = items.length ? requestAnimationFrame(frame) : 0;
    if (!raf) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  // ---------- эффекты ----------

  /** Осколки блока разлетаются из точки. */
  function burst(x, y, color, count = 8, { speed = 260, size = 7 } = {}) {
    for (let k = 0; k < count; k++) {
      const angle = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      const p = {
        x, y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v - speed * 0.4,
        size: size * (0.5 + Math.random() * 0.7), rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12,
        t: 0, life: 0.5 + Math.random() * 0.4,
        draw(c, k2, dt) {
          p.vy += 900 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.rot += p.vr * dt;
          c.save();
          c.globalAlpha = 1 - k2;
          c.translate(p.x, p.y);
          c.rotate(p.rot);
          c.fillStyle = color;
          const s = p.size * (1 - k2 * 0.5);
          c.fillRect(-s / 2, -s / 2, s, s);
          c.restore();
        },
      };
      add(p);
    }
  }

  /** Луч света вдоль сгорающей линии: вспыхивает по центру и расходится к краям. */
  function beam(rect, color, { vertical = false, life = 0.45 } = {}) {
    add({
      t: 0, life,
      draw(c, k) {
        const grow = Math.min(1, k * 3);
        const alpha = k < 0.3 ? 1 : 1 - (k - 0.3) / 0.7;
        const cx = rect.x + rect.w / 2;
        const cy = rect.y + rect.h / 2;
        const w = vertical ? rect.w * (1 + 0.6 * (1 - k)) : rect.w * grow;
        const h = vertical ? rect.h * grow : rect.h * (1 + 0.6 * (1 - k));
        c.save();
        c.globalAlpha = alpha;
        c.shadowColor = color;
        c.shadowBlur = 24;
        const g = vertical
          ? c.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0)
          : c.createLinearGradient(0, cy - h / 2, 0, cy + h / 2);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(0.5, '#ffffff');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = color;
        c.globalAlpha = alpha * 0.55;
        c.fillRect(cx - w / 2, cy - h / 2, w, h);
        c.globalAlpha = alpha;
        c.fillStyle = g;
        c.fillRect(cx - w / 2, cy - h / 2, w, h);
        c.restore();
      },
    });
  }

  /** Ломаная молния между двумя точками; каждые пару кадров «перещёлкивает». */
  function lightning(x1, y1, x2, y2, color, { life = 0.5, width = 3 } = {}) {
    let points = [];
    let flicker = 0;
    const regen = () => {
      const n = 10;
      const len = Math.hypot(x2 - x1, y2 - y1);
      const nx = -(y2 - y1) / len;
      const ny = (x2 - x1) / len;
      points = [[x1, y1]];
      for (let k = 1; k < n; k++) {
        const off = (Math.random() - 0.5) * len * 0.18;
        points.push([x1 + (x2 - x1) * (k / n) + nx * off, y1 + (y2 - y1) * (k / n) + ny * off]);
      }
      points.push([x2, y2]);
    };
    regen();
    add({
      t: 0, life,
      draw(c, k, dt) {
        flicker += dt;
        if (flicker > 0.05) {
          flicker = 0;
          regen();
        }
        c.save();
        c.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
        c.lineJoin = 'round';
        c.shadowColor = color;
        c.shadowBlur = 18;
        for (const [stroke, w] of [[color, width * 2.5], ['#ffffff', width]]) {
          c.strokeStyle = stroke;
          c.lineWidth = w;
          c.beginPath();
          points.forEach(([px, py], i) => (i ? c.lineTo(px, py) : c.moveTo(px, py)));
          c.stroke();
        }
        c.restore();
      },
    });
  }

  /** Конфетти сверху. colors — массив цветов. */
  function confetti(colors, count = 70) {
    const rect = host.getBoundingClientRect();
    for (let k = 0; k < count; k++) {
      const p = {
        x: Math.random() * rect.width, y: -20 - Math.random() * rect.height * 0.3,
        vx: (Math.random() - 0.5) * 120, vy: 150 + Math.random() * 250,
        w: 6 + Math.random() * 6, h: 3 + Math.random() * 4,
        rot: Math.random() * 6, vr: (Math.random() - 0.5) * 10,
        color: colors[k % colors.length],
        t: 0, life: 1.6 + Math.random() * 0.8,
        draw(c, k2, dt) {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.rot += p.vr * dt;
          c.save();
          c.globalAlpha = k2 < 0.8 ? 1 : 1 - (k2 - 0.8) / 0.2;
          c.translate(p.x, p.y);
          c.rotate(p.rot);
          c.scale(1, Math.cos(p.rot * 2));
          c.fillStyle = p.color;
          c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
          c.restore();
        },
      };
      add(p);
    }
  }

  return {
    canvas,
    burst,
    beam,
    lightning,
    confetti,
    dispose() {
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.remove();
      items = [];
    },
  };
}
