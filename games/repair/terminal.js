// Терминал компьютера мастерской: устройство подключено кабелем, команды набираются на своей клавиатуре.
//   help — команды; devices — что подключено (модель, версия, состояние); list — файлы прошивок в папке;
//   flash <файл> — прошить; clear — очистить; exit — отключить кабель.
// Прошивка подходит только своей модели и только самая свежая версия (сломанная уже стоит). Без DOM — для тестов.

import { act, linked, DEVICES } from './logic.js';

export const PROMPT = 'C:\\МАСТЕРСКАЯ>';

const HELP = [
  'Команды:',
  '  devices        — что подключено',
  '  list           — файлы прошивок',
  '  flash <файл>   — прошить устройство',
  '  clear          — очистить экран',
  '  exit           — отключить кабель',
];

/** Приветствие при подключении. */
export function greet(s) {
  return [
    { t: 'ПРОШИВАТОР 3.2 — мастерская', c: 'head' },
    linked(s) ? { t: 'Подключено устройство. Набери devices', c: 'ok' } : { t: 'Устройство не отвечает. Набери devices', c: 'warn' },
    { t: 'help — список команд', c: 'dim' },
  ];
}

function status(s) {
  if (s.parts.ssd && (!s.parts.ssd.in || s.parts.ssd.broken)) return 'диск не отвечает';
  if (s.blank) return 'диск пуст — системы нет';
  if (s.bootloop) return 'зависает при загрузке';
  return 'работает';
}

const MESSAGES = {
  'no-link': ['Устройство не найдено.', 'Проверь гнездо, батарею и шлейфы.'],
  'no-file': ['Нет такого файла. Набери list и перепиши имя точно.'],
  'wrong-model': ['Ошибка: прошивка от другой модели.', 'Сверь код модели (devices) с именем файла.'],
  'no-need': ['Прошивка не нужна: система работает.'],
  'disk-error': ['Ошибка записи: диск не отвечает.', 'Сначала замени диск.'],
  'same-version': ['Эта версия уже стоит — с ней и зависает.', 'Нужна версия новее.'],
  'old-version': ['Версия устарела — загрузчик её не примет.', 'Нужна самая свежая.'],
};

/**
 * Выполнить строку. → { out: [{ t, c }], clear?, exit?, flash? } — flash: { ok, file } (прошивка уже сделана,
 * интерфейс показывает полосу и перезагрузку).
 */
export function run(s, line) {
  const text = String(line ?? '').trim();
  const out = [{ t: `${PROMPT} ${text}`, c: 'cmd' }];
  if (!text) return { out: [] };
  const [cmd, ...rest] = text.split(/\s+/);
  const arg = rest.join(' ');
  switch (cmd.toLowerCase()) {
    case 'help':
    case '?':
      return { out: [...out, ...HELP.map((t) => ({ t, c: 'dim' }))] };
    case 'clear':
    case 'cls':
      return { out: [], clear: true };
    case 'exit':
    case 'quit':
      return { out, exit: true };
    case 'devices':
    case 'dev':
      if (!linked(s)) return { out: [...out, ...MESSAGES['no-link'].map((t) => ({ t, c: 'warn' }))] };
      return {
        out: [...out,
          { t: `[USB] ${s.fw.code}   ${DEVICES[s.kind].name}`, c: 'ok' },
          { t: `      прошивка ${s.blank || s.parts.ssd?.broken ? '—' : s.fw.installed}   ${status(s)}`, c: 'ok' }],
      };
    case 'list':
    case 'ls':
    case 'dir':
      return { out: [...out, { t: 'Папка FIRMWARE:', c: 'dim' }, ...s.fw.files.map((t) => ({ t: `  ${t}`, c: 'file' }))] };
    case 'flash': {
      if (!arg) return { out: [...out, { t: 'Укажи файл: flash <имя файла>', c: 'warn' }] };
      const r = act(s, 'flash', arg);
      if (r.ok) return { out: [...out, { t: `Пишу ${r.flashed}…`, c: 'dim' }], flash: { ok: true, file: r.flashed } };
      return { out: [...out, ...(MESSAGES[r.why] ?? ['Ошибка.']).map((t) => ({ t, c: 'err' }))] };
    }
    default:
      return { out: [...out, { t: `Неизвестная команда: ${cmd}. Набери help`, c: 'err' }] };
  }
}
