// Рисунок сцены Bongo Cat — свой SVG. Картинки bongo.cat не копируем: кот там — рисунок StrayRogue,
// разрешение на него дано лично автору сайта, а инструменты — фотографии товаров.
//
// Координаты — как у bongo.cat: кадр 800×450, стол — линия под наклоном 13,5°, кот сидит за ним,
// видны голова и лапы. У каждой лапы две позы: поднята (подушечки) и бьёт (со «звёздочкой» удара).
// Инструменты стоят на столе под лапами: левая лапа бьёт около (370, 155), правая — около (575, 215).
// Цвета — CSS-переменные игры (game.css), линии кота — цвет текста темы.

/** Высота стола в точке x (линия под 13,5° через (400, 142), как <hr> у bongo.cat). */
export const tableY = (x) => 142 + Math.tan((13.5 * Math.PI) / 180) * (x - 400);

export const VIEWBOX = '285 0 430 345';

const cat = `
<g class="bc-cat">
  <path class="bc-stroke" d="M428 57 Q452 43 469 37 L492 15 L516 41 Q578 52 626 86 L659 73 Q657 112 659 151 Q667 180 677 208"/>
  <circle class="bc-ink" cx="451" cy="110" r="7"/>
  <circle class="bc-ink" cx="548" cy="139" r="6"/>
  <path class="bc-stroke bc-thin bc-mouth-closed" d="M470 117 q5 7 11 3 q6 8 15 4"/>
  <ellipse class="bc-ink bc-mouth-open" cx="488" cy="125" rx="6" ry="7"/>
</g>`;

const paws = `
<g class="bc-paws">
  <g class="bc-paw bc-paw-left" data-paw="left">
    <g class="bc-up">
      <path class="bc-stroke" d="M428 57 Q407 70 399 97"/>
      <path class="bc-stroke bc-fill" d="M347 131 L347 101 Q346 74 368 72 Q389 71 399 97"/>
      <g class="bc-pads"><circle cx="366" cy="88" r="4.5"/><circle cx="380" cy="92" r="4.5"/><circle cx="359" cy="99" r="3.8"/><ellipse cx="373" cy="106" rx="7" ry="8.5"/></g>
    </g>
    <g class="bc-down">
      <path class="bc-stroke bc-fill" d="M428 57 Q385 86 356 122 Q338 146 350 156 Q364 166 400 157 Q418 152 430 146"/>
      <g class="bc-impact"><path d="M326 142 h13"/><path d="M330 172 l10 -8"/><path d="M357 176 l-2 12"/></g>
    </g>
  </g>

  <g class="bc-paw bc-paw-right" data-paw="right">
    <g class="bc-up">
      <path class="bc-stroke bc-fill" d="M566 183 L566 150 Q567 121 591 121 Q611 122 617 146"/>
      <g class="bc-pads"><circle cx="584" cy="137" r="4.5"/><circle cx="598" cy="141" r="4.5"/><circle cx="577" cy="148" r="3.8"/><ellipse cx="590" cy="155" rx="7" ry="8.5"/></g>
    </g>
    <g class="bc-down">
      <path class="bc-stroke bc-fill" d="M562 158 Q543 176 540 196 Q540 214 566 216 Q604 214 638 196"/>
      <g class="bc-impact"><path d="M509 200 h13"/><path d="M513 230 l10 -8"/><path d="M544 234 l-2 12"/></g>
    </g>
  </g>
</g>`;

// ---------- инструменты ----------

const bongo = `
<g class="bc-inst" data-inst="bongo">
  <path class="bc-wood-dark" d="M440 222 L505 238 L505 262 L440 246 Z"/>
  <g class="bc-drum" data-pad="low">
    <path class="bc-wood" d="M296 176 L312 286 Q375 306 438 286 L454 176 Z"/>
    <path class="bc-grain" d="M330 196 L338 290 M375 200 L375 296 M420 196 L412 290"/>
    <ellipse class="bc-rim" cx="375" cy="286" rx="63" ry="16"/>
    <ellipse class="bc-rim" cx="375" cy="178" rx="81" ry="25"/>
    <ellipse class="bc-skin" cx="375" cy="174" rx="74" ry="21"/>
  </g>
  <g class="bc-drum" data-pad="high">
    <path class="bc-wood" d="M503 226 L516 318 Q568 334 620 318 L633 226 Z"/>
    <path class="bc-grain" d="M532 244 L538 322 M568 248 L568 328 M604 244 L598 322"/>
    <ellipse class="bc-rim" cx="568" cy="318" rx="52" ry="13"/>
    <ellipse class="bc-rim" cx="568" cy="228" rx="67" ry="21"/>
    <ellipse class="bc-skin" cx="568" cy="224" rx="61" ry="17"/>
  </g>
</g>`;

const keyboard = `
<g class="bc-inst" data-inst="keyboard" transform="rotate(13.5 470 205)">
  <rect class="bc-case" x="296" y="150" width="364" height="104" rx="12"/>
  <rect class="bc-panel" x="306" y="156" width="344" height="16" rx="5"/>
  <circle class="bc-knob" cx="322" cy="164" r="4"/><circle class="bc-knob" cx="336" cy="164" r="4"/>
  <rect class="bc-screen" x="590" y="159" width="48" height="10" rx="2"/>
  ${keyRects({ white: 'bc-white', black: 'bc-black', x0: 312, w: 56, y: 178, wh: 68, bh: 40 })}
</g>`;

const marimba = `
<g class="bc-inst" data-inst="marimba" transform="rotate(13.5 470 205)">
  ${marimbaBars()}
</g>`;

function keyRects({ white, black, x0, w, y, wh, bh }) {
  const whiteNotes = [0, 2, 4, 5, 7, 9];
  const blackNotes = [[1, 1], [3, 2], [6, 4], [8, 5]];          // [нота, перед какой белой клавишей]
  let out = '';
  whiteNotes.forEach((note, i) => {
    out += `<rect class="bc-key ${white}" data-note="${note}" x="${x0 + i * w}" y="${y}" width="${w - 4}" height="${wh}" rx="5"/>`;
  });
  for (const [note, before] of blackNotes) {
    out += `<rect class="bc-key ${black}" data-note="${note}" x="${x0 + before * w - w * 0.3 - 2}" y="${y}" width="${w * 0.56}" height="${bh}" rx="4"/>`;
  }
  return out;
}

/** Маримба: ближний ряд — 6 брусков натуральных нот, дальний — 4 бруска диезов; чем выше нота, тем короче. */
function marimbaBars() {
  const near = [0, 2, 4, 5, 7, 9];
  const far = [[1, 1], [3, 2], [6, 4], [8, 5]];                 // [нота, перед какой нижней]
  const w = 54;
  const x0 = 318;
  let out = '<path class="bc-frame" d="M306 176 L652 176 M306 226 L652 226"/>';
  near.forEach((note, i) => {
    const h = 64 - i * 4;
    const x = x0 + i * w;
    out += `<rect class="bc-tube" x="${x + 14}" y="${196 + h - 4}" width="${w - 36}" height="${34 - i * 3}" rx="4"/>`;
    out += `<rect class="bc-key bc-bar" data-note="${note}" x="${x}" y="196" width="${w - 8}" height="${h}" rx="6"/>`;
  });
  far.forEach(([note, before], i) => {
    const h = 38 - i * 3;
    const x = x0 + before * w - w / 2;
    out += `<rect class="bc-key bc-bar bc-bar-far" data-note="${note}" x="${x + 2}" y="${188 - h}" width="${w - 12}" height="${h}" rx="6"/>`;
  });
  return out;
}

const cymbal = `
<g class="bc-inst" data-inst="cymbal">
  <path class="bc-stand" d="M600 214 L600 340 M600 300 L560 340 M600 300 L640 340"/>
  <g class="bc-swing">
    <ellipse class="bc-brass" cx="598" cy="210" rx="104" ry="24" transform="rotate(-7 598 210)"/>
    <ellipse class="bc-brass-ring" cx="598" cy="210" rx="70" ry="15" transform="rotate(-7 598 210)"/>
    <ellipse class="bc-brass-ring" cx="598" cy="210" rx="36" ry="8" transform="rotate(-7 598 210)"/>
    <ellipse class="bc-bell" cx="598" cy="206" rx="15" ry="6" transform="rotate(-7 598 206)"/>
  </g>
</g>`;

const tambourine = `
<g class="bc-inst" data-inst="tambourine">
  <g class="bc-swing">
    <ellipse class="bc-rimwood" cx="590" cy="232" rx="86" ry="30"/>
    <ellipse class="bc-skin" cx="590" cy="224" rx="78" ry="24"/>
    ${[-62, -30, 6, 40, 70].map((dx) => {
      const y = 232 + 26 * Math.sqrt(Math.max(0, 1 - (dx / 86) ** 2));
      return `<rect class="bc-slot" x="${590 + dx - 11}" y="${y - 9}" width="22" height="12" rx="3"/>`
        + `<ellipse class="bc-jingle" cx="${590 + dx}" cy="${y - 3}" rx="8" ry="4"/>`;
    }).join('')}
  </g>
</g>`;

const cowbell = `
<g class="bc-inst" data-inst="cowbell">
  <path class="bc-stand" d="M592 176 L592 150 M592 262 L592 345"/>
  <g class="bc-swing">
    <path class="bc-metal" d="M566 176 L618 176 L644 262 L540 262 Z"/>
    <path class="bc-metal-hi" d="M574 184 L590 184 L582 254 L556 254 Z"/>
    <ellipse class="bc-mouth" cx="592" cy="262" rx="52" ry="11"/>
    <rect class="bc-metal" x="582" y="164" width="20" height="14" rx="3"/>
  </g>
</g>`;

/** Весь SVG сцены. Стол — длинная линия: при вписывании кадра в экран её видно от края до края. */
export function sceneMarkup() {
  return `<svg class="bc-scene" viewBox="${VIEWBOX}" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
  <line class="bc-table" x1="-1200" y1="${tableY(-1200)}" x2="2000" y2="${tableY(2000)}"/>
  ${cat}
  <g class="bc-instruments">${bongo}${keyboard}${marimba}${cymbal}${tambourine}${cowbell}</g>
  ${paws}
  <g class="bc-notes"></g>
</svg>`;
}

/** Где лапа касается инструмента — отсюда вылетают нотки. */
export const HIT_POINT = { left: [372, 150], right: [578, 210], mouth: [488, 118] };
