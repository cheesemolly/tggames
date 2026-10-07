// Глобус «Городов» на Canvas: суша — точками, маршрут — дугами от города к городу. После каждого хода глобус
// поворачивается к названному городу, а дуга к нему дорисовывается на лету. Пальцем глобус можно крутить.
// Кадры идут только во время полёта, вращения и перетаскивания — в покое ничего не перерисовывается.
// В кадре нет градиентов и теней: шар с бликом и ореолом — готовая картинка (спрайт), пересобирается при смене
// размера или скина. Подпись и «пульс» у последнего города — DOM поверх холста (их положение отдаёт onPin).

import { toVec, toLatLon, slerp, angle, landPoints, arcPoints } from './geo.js';
import { LAND } from './land.js';
import { reducedMotion } from '../../shared/motion.js';
import { rgba, GLOBE_COLORS } from './colors.js';

const TAU = Math.PI * 2;
const RAD = Math.PI / 180;
const MAX_LEGS = 18;               // сколько последних перелётов видно (старые бледнее)
const MAX_STOPS = 60;
const ARC_STEPS = 36;
const SPIN = 7;                    // градусов в секунду, пока городов нет
const TILT = 12;                   // город встаёт чуть выше центра: под ним подпись

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * wrap — блок, который глобус заполняет целиком. onPin({ x, y, visible }) — где на экране последний город
 * (в пикселях блока), зовётся после каждого кадра.
 */
export function createGlobe(wrap, { onPin = () => {} } = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'ct-canvas';
  wrap.append(canvas);
  const ctx = canvas.getContext('2d');
  const land = landPoints(LAND);
  const bands = [[], [], []];

  let colors = Object.fromEntries(GLOBE_COLORS.map((k) => [k, [128, 128, 128]]));
  let width = 0;
  let height = 0;
  let dpr = 1;
  let radius = 0;
  let sprite = null;
  let spritePad = 0;
  let view = { lat: 20, lon: 40 };           // что в центре диска
  let zoom = 1;
  let stops = [];                            // { lat, lon, by, vec }
  let legs = [];                             // { pts, by } — перелёт к городу с тем же номером
  let legShown = 1;                          // какая часть последнего перелёта нарисована
  let flight = null;                         // { from, to, start, duration, resolve }
  let spinning = false;
  let drag = null;
  let frame = 0;
  let last = 0;
  let alive = true;

  // ---------- картинка шара ----------

  function buildSprite() {
    if (!radius) return;
    spritePad = Math.ceil(radius * 0.24);
    const size = Math.ceil((radius + spritePad) * 2);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(size * dpr));
    c.height = c.width;
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const mid = size / 2;
    // ореол атмосферы
    const halo = g.createRadialGradient(mid, mid, radius * 0.9, mid, mid, radius + spritePad);
    halo.addColorStop(0, rgba(colors.halo, 0.42));
    halo.addColorStop(0.35, rgba(colors.halo, 0.16));
    halo.addColorStop(1, rgba(colors.halo, 0));
    g.fillStyle = halo;
    g.beginPath();
    g.arc(mid, mid, radius + spritePad, 0, TAU);
    g.fill();
    // шар: свет сверху слева
    const body = g.createRadialGradient(mid - radius * 0.38, mid - radius * 0.42, radius * 0.05, mid, mid, radius);
    body.addColorStop(0, rgba(colors.light));
    body.addColorStop(0.55, rgba(colors.base));
    body.addColorStop(1, rgba(colors.edge));
    g.fillStyle = body;
    g.beginPath();
    g.arc(mid, mid, radius, 0, TAU);
    g.fill();
    // тонкий светлый кант по краю
    g.strokeStyle = rgba(colors.halo, 0.5);
    g.lineWidth = 1;
    g.beginPath();
    g.arc(mid, mid, radius - 0.5, 0, TAU);
    g.stroke();
    sprite = c;
  }

  function resize() {
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    if (!w || !h) return;
    const ratio = Math.min(3, globalThis.devicePixelRatio || 1);
    if (w === width && h === height && ratio === dpr) return;
    width = w;
    height = h;
    dpr = ratio;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    // шар вписан в блок с запасом на ореол; в низком и широком блоке (маленький телефон) он крупнее блока и обрезан
    // сверху и снизу — иначе суша превращается в горстку точек
    radius = Math.max(20, Math.min(w, h) / 2 / 1.16, Math.min(w / 2 / 1.16, h * 0.72));
    buildSprite();
    draw();
  }

  // ---------- кадр ----------

  function draw() {
    if (!alive || !radius) return;
    const r = radius * zoom;
    const cx = width / 2;
    const cy = height / 2;
    const cl = Math.cos(view.lon * RAD);
    const sl = Math.sin(view.lon * RAD);
    const cp = Math.cos(view.lat * RAD);
    const sp = Math.sin(view.lat * RAD);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (sprite) {
      const size = (radius + spritePad) * 2 * zoom;
      ctx.drawImage(sprite, cx - size / 2, cy - size / 2, size, size);
    }

    // суша: три пояса по удалению от центра — у края точки мельче и бледнее
    bands[0].length = 0;
    bands[1].length = 0;
    bands[2].length = 0;
    for (let i = 0; i < land.length; i += 3) {
      const x0 = land[i];
      const y0 = land[i + 1];
      const z0 = land[i + 2];
      const zz = x0 * sl + z0 * cl;
      const z = y0 * sp + zz * cp;
      if (z < 0.04) continue;
      const band = z > 0.6 ? bands[0] : z > 0.3 ? bands[1] : bands[2];
      band.push(cx + (x0 * cl - z0 * sl) * r, cy - (y0 * cp - zz * sp) * r);
    }
    const dotR = Math.max(0.8, r * 0.0115);
    const sizes = [dotR, dotR * 0.85, dotR * 0.6];
    const alphas = [1, 0.8, 0.5];
    for (let b = 0; b < 3; b++) {
      const list = bands[b];
      const rr = sizes[b];
      ctx.fillStyle = rgba(colors.land, alphas[b]);
      ctx.beginPath();
      for (let k = 0; k < list.length; k += 2) {
        ctx.moveTo(list[k] + rr, list[k + 1]);
        ctx.arc(list[k], list[k + 1], rr, 0, TAU);
      }
      ctx.fill();
    }

    // маршрут: дуги приподняты над шаром, поэтому видны и там, где выглядывают из-за края
    const firstLeg = Math.max(0, legs.length - MAX_LEGS);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    let tip = null;
    for (let n = firstLeg; n < legs.length; n++) {
      const leg = legs[n];
      const newest = n === legs.length - 1;
      const age = legs.length - 1 - n;
      const shown = newest ? legShown : 1;
      if (shown <= 0) continue;
      const pts = leg.pts;
      const upto = shown * ARC_STEPS;
      ctx.strokeStyle = rgba(leg.by ? colors.bot : colors.me, newest ? 1 : Math.max(0.16, 0.75 - age * 0.04));
      ctx.lineWidth = newest ? 2.4 : 1.6;
      ctx.beginPath();
      let pen = false;
      for (let k = 0; k <= Math.ceil(upto) && k <= ARC_STEPS; k++) {
        let x0 = pts[k * 3];
        let y0 = pts[k * 3 + 1];
        let z0 = pts[k * 3 + 2];
        if (k > upto) {
          // последний отрезок недорисован — до нужной доли
          const f = upto - (k - 1);
          x0 = pts[k * 3 - 3] + (x0 - pts[k * 3 - 3]) * f;
          y0 = pts[k * 3 - 2] + (y0 - pts[k * 3 - 2]) * f;
          z0 = pts[k * 3 - 1] + (z0 - pts[k * 3 - 1]) * f;
        }
        const zz = x0 * sl + z0 * cl;
        const x = x0 * cl - z0 * sl;
        const y = y0 * cp - zz * sp;
        const z = y0 * sp + zz * cp;
        if (z > 0 || x * x + y * y > 1) {
          const px = cx + x * r;
          const py = cy - y * r;
          if (pen) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
          pen = true;
          if (newest && shown < 1) tip = [px, py];
        } else {
          pen = false;
          if (newest) tip = null;
        }
      }
      ctx.stroke();
    }

    // города: точки по цвету того, кто назвал; последний — крупнее
    const firstStop = Math.max(0, stops.length - MAX_STOPS);
    let pin = { x: cx, y: cy, visible: false };
    for (let n = firstStop; n < stops.length; n++) {
      const s = stops[n];
      const v = s.vec;
      const zz = v[0] * sl + v[2] * cl;
      const z = v[1] * sp + zz * cp;
      const newest = n === stops.length - 1;
      const px = cx + (v[0] * cl - v[2] * sl) * r;
      const py = cy - (v[1] * cp - zz * sp) * r;
      if (newest) pin = { x: px, y: py, visible: z > 0.05 && legShown >= 1 };
      if (z <= 0.02 || (newest && legShown < 1)) continue;
      const age = stops.length - 1 - n;
      const color = s.by ? colors.bot : colors.me;
      if (newest) {
        ctx.fillStyle = rgba(color);
        ctx.beginPath();
        ctx.arc(px, py, 5, 0, TAU);
        ctx.fill();
        ctx.fillStyle = rgba(colors.core);
        ctx.beginPath();
        ctx.arc(px, py, 2, 0, TAU);
        ctx.fill();
      } else {
        ctx.fillStyle = rgba(color, Math.max(0.3, 0.95 - age * 0.02));
        ctx.beginPath();
        ctx.arc(px, py, age < 2 ? 3 : 2.3, 0, TAU);
        ctx.fill();
      }
    }
    // «комета» на конце дорисовываемой дуги
    if (tip) {
      const by = legs[legs.length - 1].by;
      ctx.fillStyle = rgba(by ? colors.bot : colors.me);
      ctx.beginPath();
      ctx.arc(tip[0], tip[1], 4, 0, TAU);
      ctx.fill();
      ctx.fillStyle = rgba(colors.core);
      ctx.beginPath();
      ctx.arc(tip[0], tip[1], 1.6, 0, TAU);
      ctx.fill();
    }
    onPin(pin);
  }

  function tick(now) {
    frame = 0;
    if (!alive) return;
    const dt = Math.max(0, now - last);       // метка rAF бывает раньше performance.now()
    last = now;
    let more = false;
    if (flight) {
      const t = clamp((now - flight.start) / flight.duration, 0, 1);
      const k = ease(t);
      const at = toLatLon(slerp(flight.from, flight.to, k));
      view = { lat: clamp(at.lat, -80, 80), lon: at.lon };
      zoom = 1 - flight.dip * Math.sin(Math.PI * t);
      legShown = flight.leg ? clamp((t - 0.08) / 0.84, 0, 1) : 1;
      if (t >= 1) {
        const done = flight.resolve;
        flight = null;
        zoom = 1;
        legShown = 1;
        done();
      } else {
        more = true;
      }
    } else if (spinning && !drag) {
      view = { lat: view.lat, lon: view.lon + (SPIN * Math.min(dt, 100)) / 1000 };
      more = true;
    }
    draw();
    if (more) schedule();
  }

  function schedule() {
    if (frame || !alive) return;
    frame = requestAnimationFrame(tick);
  }

  function stopFlight() {
    if (!flight) return;
    const done = flight.resolve;
    flight = null;
    zoom = 1;
    legShown = 1;
    done();
  }

  const centerFor = (stop) => ({ lat: clamp(stop.lat - TILT, -70, 70), lon: stop.lon });
  const makeStop = (s) => ({ lat: s.lat, lon: s.lon, by: s.by ? 1 : 0, vec: toVec(s.lat, s.lon) });

  // ---------- перетаскивание ----------

  function onDown(e) {
    if (flight) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    canvas.setPointerCapture?.(e.pointerId);
  }
  function onMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const k = 1 / (radius * RAD);
    view = {
      lat: clamp(view.lat + (e.clientY - drag.y) * k, -80, 80),
      lon: view.lon - (e.clientX - drag.x) * k,
    };
    drag.x = e.clientX;
    drag.y = e.clientY;
    schedule();
  }
  function onUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    last = performance.now();
    if (spinning) schedule();
  }
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);

  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => resize()) : null;
  observer?.observe(wrap);

  return {
    el: canvas,
    resize,
    redraw: draw,

    /** Цвета скина: { light, base, edge — шар; land — суша; halo — ореол; me, bot — маршрут; core — сердцевина точки }. */
    setColors(next) {
      colors = { ...colors, ...next };
      buildSprite();
      draw();
    },

    /** Весь маршрут разом, без полёта (при возвращении в партию). */
    setStops(list) {
      stopFlight();
      stops = list.map(makeStop);
      legs = stops.slice(1).map((s, k) => ({ pts: arcPoints(stops[k].vec, s.vec, ARC_STEPS), by: s.by }));
      legShown = 1;
      if (stops.length) view = centerFor(stops[stops.length - 1]);
      draw();
    },

    /** Новый город: глобус летит к нему, дуга от прошлого города дорисовывается по дороге. → Promise (долетели). */
    addStop(s) {
      stopFlight();
      const stop = makeStop(s);
      const prev = stops[stops.length - 1];
      stops.push(stop);
      if (prev) legs.push({ pts: arcPoints(prev.vec, stop.vec, ARC_STEPS), by: stop.by });
      const target = centerFor(stop);
      if (reducedMotion() || !radius) {
        view = target;
        legShown = 1;
        draw();
        return Promise.resolve();
      }
      const from = toVec(view.lat, view.lon);
      const to = toVec(target.lat, target.lon);
      const w = angle(from, to);
      legShown = prev ? 0 : 1;
      return new Promise((resolve) => {
        flight = {
          from, to, resolve, leg: Boolean(prev), start: performance.now(),
          duration: 750 + 650 * (w / Math.PI), dip: 0.03 + 0.07 * (w / Math.PI),
        };
        last = flight.start;
        schedule();
      });
    },

    /** Медленное вращение, пока городов нет. */
    spin(on) {
      spinning = Boolean(on) && !reducedMotion();
      last = performance.now();
      if (spinning) schedule();
    },

    get busy() {
      return Boolean(flight);
    },

    destroy() {
      alive = false;
      stopFlight();
      if (frame) cancelAnimationFrame(frame);
      observer?.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.remove();
    },
  };
}
