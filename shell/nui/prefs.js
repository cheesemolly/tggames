// Настройки из шторки профиля (новый интерфейс, в бете 'new-ui'): звук во всех играх, вибрация, анимации.
// Хранятся на этом устройстве (localStorage вне пространства tggames: — с сервером не синхронизируются):
// телефон и компьютер могут хотеть разного.
//
// Звук у каждой игры свой (кнопка 🔊 в игре) — здесь общий выключатель поверх: все AudioContext, которые
// создают игры, заводятся через подмену ниже и при выключении стоят на паузе (suspend).

const KEY = 'tggames-prefs';
export const DEFAULT_PREFS = { sound: true, haptics: true, motion: true };

export function getPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return { ...DEFAULT_PREFS, ...(raw && typeof raw === 'object' ? raw : {}) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function setPref(name, value) {
  const next = { ...getPrefs(), [name]: Boolean(value) };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // приватный режим — настройка действует до закрытия
  }
  return next;
}

// ---------- общий выключатель звука ----------

let muted = false;
let Native = null;
const contexts = new Set();        // WeakRef на созданные играми AudioContext

/** Подменить AudioContext до того, как игры начнут его создавать (один раз, при старте нового интерфейса). */
export function installAudioGate() {
  Native = globalThis.AudioContext ?? globalThis.webkitAudioContext ?? null;
  if (!Native || Native.gated || typeof WeakRef === 'undefined') return;
  const Base = Native;
  class GatedAudioContext extends Base {
    constructor(...args) {
      super(...args);
      contexts.add(new WeakRef(this));
      if (muted) Base.prototype.suspend.call(this).catch(() => {});
    }

    // игры будят звук по нажатию — пока звук выключен, будить нечего
    resume() {
      return muted ? Promise.resolve() : super.resume();
    }
  }
  GatedAudioContext.gated = true;
  globalThis.AudioContext = GatedAudioContext;
  if (globalThis.webkitAudioContext) globalThis.webkitAudioContext = GatedAudioContext;
  Native = Base;
}

function setMuted(on) {
  muted = on;
  if (!Native) return;
  for (const ref of contexts) {
    const ctx = ref.deref();
    if (!ctx || ctx.state === 'closed') {
      contexts.delete(ref);
      continue;
    }
    (on ? Native.prototype.suspend : Native.prototype.resume).call(ctx).catch(() => {});
  }
}

/** Применить настройки: звук, вибрация (platform.setHaptics), меньше анимаций (класс на <html>). */
export function applyPrefs(platform, prefs = getPrefs()) {
  setMuted(!prefs.sound);
  platform.setHaptics?.(prefs.haptics);
  document.documentElement.classList.toggle('reduce-motion', !prefs.motion);
}
