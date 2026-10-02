// Картинки для оформлений «Закат» и «Море» — SVG прямо в коде (без файлов и чужих рисунков). Картинка режется на
// плитки фоном: у плитки background-size n×100% и сдвиг по её родному месту (--hx, --hy) — см. game.css.
// Сцены нарочно разные по всей площади (звёзды, облака, горы, лодка, маяк), чтобы куски было легко отличить.

const SUNSET = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
<defs>
<linearGradient id="k" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#140f3a"/><stop offset=".38" stop-color="#5b2a78"/><stop offset=".6" stop-color="#d4486f"/><stop offset=".74" stop-color="#ff9a5a"/></linearGradient>
<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff1a1"/><stop offset=".55" stop-color="#ffb057"/><stop offset="1" stop-color="#ff5e78"/></linearGradient>
<linearGradient id="w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6b2d71"/><stop offset=".5" stop-color="#2f1650"/><stop offset="1" stop-color="#120b2c"/></linearGradient>
<mask id="m"><rect width="120" height="120" fill="#fff"/><rect y="66" width="120" height="1.6" fill="#000"/><rect y="71" width="120" height="2.2" fill="#000"/><rect y="76.5" width="120" height="2.8" fill="#000"/><rect y="82" width="120" height="3.4" fill="#000"/></mask>
</defs>
<rect width="120" height="120" fill="url(#k)"/>
<g fill="#fff"><circle cx="9" cy="7" r=".9"/><circle cx="23" cy="15" r=".6"/><circle cx="37" cy="5" r=".8"/><circle cx="52" cy="13" r=".5"/><circle cx="67" cy="6" r=".9"/><circle cx="83" cy="12" r=".6"/><circle cx="97" cy="4" r=".7"/><circle cx="112" cy="14" r=".9"/><circle cx="15" cy="27" r=".5"/><circle cx="44" cy="24" r=".7"/><circle cx="74" cy="22" r=".5"/><circle cx="104" cy="28" r=".6"/><circle cx="30" cy="36" r=".4"/><circle cx="90" cy="36" r=".4"/></g>
<path d="M98 10a7 7 0 1 0 6 11 6 6 0 1 1-6-11Z" fill="#ffe9b0"/>
<circle cx="60" cy="68" r="27" fill="url(#s)" mask="url(#m)"/>
<g fill="#ff8fb0" opacity=".55"><rect x="6" y="44" width="30" height="2.4" rx="1.2"/><rect x="14" y="49" width="18" height="1.8" rx=".9"/><rect x="84" y="40" width="28" height="2.4" rx="1.2"/><rect x="90" y="45" width="16" height="1.8" rx=".9"/></g>
<path d="M0 86V64l9-7 7 5 10-12 9 10 6-4 9 12 4 18Z" fill="#43205f"/>
<path d="M120 86V60l-8-6-8 8-8-9-10 13-6-3-8 9-2 14Z" fill="#43205f"/>
<path d="M0 86V73l12-6 9 5 11-6 13 14Z" fill="#2c1347"/>
<path d="M120 86V71l-10-5-12 7-9-3-12 16Z" fill="#2c1347"/>
<rect y="86" width="120" height="34" fill="url(#w)"/>
<g fill="#ffb36b"><rect x="38" y="88" width="44" height="1.6" rx=".8" opacity=".9"/><rect x="43" y="92" width="34" height="1.6" rx=".8" opacity=".8"/><rect x="47" y="97" width="26" height="1.6" rx=".8" opacity=".65"/><rect x="51" y="103" width="18" height="1.6" rx=".8" opacity=".5"/><rect x="55" y="110" width="10" height="1.6" rx=".8" opacity=".35"/></g>
<g fill="none" stroke="#b9648f" stroke-width=".9" stroke-linecap="round" opacity=".6"><path d="M6 96h14M24 106h12M92 94h16M84 112h20M8 115h10"/></g>
<g fill="none" stroke="#2a1240" stroke-width="1.1" stroke-linecap="round"><path d="M27 33l2.5 2 2.5-2M34 29l2 1.6 2-1.6M80 27l2.5 2 2.5-2"/></g>
<path d="M104 120c0-14 1-26-4-38" fill="none" stroke="#1a0c2e" stroke-width="2.6" stroke-linecap="round"/>
<g fill="#1a0c2e"><path d="M100 82c-6-6-14-6-20-2 8-1 13 0 20 2Z"/><path d="M100 82c3-8 11-11 18-9-7 2-12 4-18 9Z"/><path d="M100 82c-2-8-8-12-15-12 6 3 10 6 15 12Z"/><path d="M100 82c6-3 13-1 17 4-6-2-11-3-17-4Z"/><path d="M100 82c1-7 5-12 10-14-4 4-7 8-10 14Z"/></g>
<path d="M0 120v-6c8-3 18-3 26 0 6 2 10 2 14 6Z" fill="#0d0820"/>
</svg>`;

const SEA = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
<defs>
<linearGradient id="k" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3fb4ec"/><stop offset=".35" stop-color="#8fd6f7"/><stop offset=".52" stop-color="#e9f7ff"/></linearGradient>
<linearGradient id="w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#36b3d9"/><stop offset=".45" stop-color="#1678b8"/><stop offset="1" stop-color="#0a3f74"/></linearGradient>
<radialGradient id="s"><stop offset="0" stop-color="#fff6c4"/><stop offset=".55" stop-color="#ffd75e"/><stop offset="1" stop-color="#ffd75e" stop-opacity="0"/></radialGradient>
</defs>
<rect width="120" height="120" fill="url(#k)"/>
<circle cx="94" cy="22" r="18" fill="url(#s)"/>
<circle cx="94" cy="22" r="8.5" fill="#ffe680"/>
<g fill="#fff"><circle cx="18" cy="24" r="6"/><circle cx="26" cy="20" r="8"/><circle cx="35" cy="24" r="6"/><rect x="12" y="24" width="29" height="6" rx="3"/></g>
<g fill="#fff" opacity=".85"><circle cx="58" cy="38" r="4"/><circle cx="64" cy="35" r="5.5"/><circle cx="71" cy="38" r="4"/><rect x="54" y="38" width="21" height="4" rx="2"/></g>
<g fill="none" stroke="#2c3e50" stroke-width="1.1" stroke-linecap="round"><path d="M46 14l2.4 2 2.4-2M54 9l2 1.6 2-1.6M76 18l2 1.6 2-1.6"/></g>
<path d="M0 62v-5c6-4 12-6 18-3 5-4 12-4 18 1 4 3 6 5 8 7Z" fill="#5d9e7e"/>
<path d="M14 62c4-2 10-3 14 0Z" fill="#4a8668"/>
<rect y="62" width="120" height="58" fill="url(#w)"/>
<g fill="none" stroke="#fff" stroke-linecap="round" opacity=".55" stroke-width="1.1"><path d="M4 70q4-2 8 0t8 0M64 68q4-2 8 0t8 0M86 76q4-2 8 0t8 0"/></g>
<g fill="none" stroke="#fff" stroke-linecap="round" opacity=".45" stroke-width="1.3"><path d="M8 84q5-3 10 0t10 0M58 88q5-3 10 0t10 0M70 100q5-3 10 0t10 0"/></g>
<g fill="none" stroke="#bfe9ff" stroke-linecap="round" opacity=".4" stroke-width="1.6"><path d="M2 104q6-3 12 0t12 0M30 114q6-3 12 0t12 0M86 114q6-3 12 0t12 0"/></g>
<path d="M40 61v27" stroke="#4a2a17" stroke-width="1.2"/>
<path d="M41 62l18 24H41Z" fill="#fff"/>
<path d="M39 66v20H27Z" fill="#ffcf8a"/>
<path d="M40 61l6 2-6 2Z" fill="#e74c3c"/>
<path d="M25 88h31l-5 7H31Z" fill="#a0522d"/>
<path d="M27 91h27" stroke="#ffd28a" stroke-width=".8"/>
<path d="M28 97q12 3 25 0" fill="none" stroke="#0d4a7e" stroke-width="1.4" opacity=".5"/>
<path d="M84 120V99q6-9 14-6 8-6 14 0 6 0 8 4v23Z" fill="#4b4f5c"/>
<path d="M90 120v-12q8-6 16-2 7-2 14 4v10Z" fill="#363944"/>
<path d="M96 95l2.6-31h7.8l2.6 31Z" fill="#f7f7f7"/>
<path d="M97.2 81l.8-9h10l.8 9ZM96.4 91l.4-5h12.4l.4 5Z" fill="#d83a35"/>
<rect x="98" y="57" width="10" height="7" rx="1" fill="#ffe27a"/>
<path d="M98 57v7M103 57v7M108 57v7" stroke="#34495e" stroke-width=".9"/>
<path d="M97 57l6-6 6 6Z" fill="#c0392b"/>
<path d="M98 59L60 50v18Z" fill="#fff4b0" opacity=".35"/>
<path d="M96 95h13" stroke="#363944" stroke-width="1"/>
</svg>`;

export const PICTURES = { sunset: SUNSET, sea: SEA };

/** CSS-значение для background-image. */
export const pictureUrl = (id) => (PICTURES[id] ? `url("data:image/svg+xml,${encodeURIComponent(PICTURES[id])}")` : 'none');
