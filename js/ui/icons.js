// Inline SVG icons (static strings, DOM-free). Solid shapes use currentColor via CSS `fill`.
// No gradient ids: duplicated ids inside hidden screens render unreliably.

const S = (body, vb = '0 0 24 24') => `<svg viewBox="${vb}" aria-hidden="true" focusable="false">${body}</svg>`;
const ST = 'fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';

const gearTeeth = Array.from({ length: 8 }, (_, i) =>
  `<rect x="10.1" y="1.3" width="3.8" height="5.2" rx="1.1" transform="rotate(${i * 45} 12 12)"/>`).join('');

export const ICONS = Object.freeze({
  star: S('<path d="M2 5l5 4 5-7 5 7 5-4-3 14H5z"/><path d="M5 20h14v2H5z"/><path d="M5 7l2 9h5V5L8 11z" fill="#fff" opacity=".3"/>'),
  aether: S('<path d="M12 1C10 6 4 10 4 15a8 8 0 0 0 16 0C20 10 14 6 12 1z"/><path d="M8 11c-3 4-1 7 1 7" fill="none" stroke="white" stroke-width="2" opacity=".6"/>'),
  trophy: S('<path d="M6.5 2.5h11V4H21v3.2a4.3 4.3 0 0 1-4.1 4.3 5.6 5.6 0 0 1-3.6 3.4V17h3.2v4.5H7.5V17h3.2v-2.1a5.6 5.6 0 0 1-3.6-3.4A4.3 4.3 0 0 1 3 7.2V4h3.5zM5 6v1.2a2.3 2.3 0 0 0 1.6 2.2A9 9 0 0 1 6.5 8V6zm12.5 0v2c0 .5 0 1-.1 1.4A2.3 2.3 0 0 0 19 7.2V6z"/>'
    + '<path d="M9 4.2h2v6.5a3 3 0 0 1-2-2.8z" fill="#fff" opacity=".35"/>'),
  gear: S(gearTeeth + '<circle cx="12" cy="12" r="6.2" fill="none" stroke="currentColor" stroke-width="3.8"/>'),
  help: S(`<path d="M8.6 8.9a3.5 3.5 0 1 1 5 3.2c-1 .5-1.6 1.2-1.6 2.3v.6" ${ST} stroke-width="2.8"/><circle cx="12" cy="19.2" r="1.8"/>`),
  close: S(`<path d="M6 6l12 12M18 6L6 18" ${ST} stroke-width="3"/>`),
  back: S(`<path d="M15 5l-7 7 7 7" ${ST} stroke-width="3"/>`),
  flag: S(`<path d="M5.5 22V3" ${ST} stroke-width="2.6"/><path d="M6.5 3.5h12l-3 4.5 3 4.5h-12z"/>`),
  cards: S('<rect x="3" y="5" width="11" height="15" rx="2" transform="rotate(-10 8.5 12.5)" opacity=".55"/>'
    + '<rect x="9" y="3.5" width="11.5" height="16" rx="2.2"/>'
    + '<path d="M14.75 8l2.2 3.5-2.2 3.5-2.2-3.5z" fill="#fff" opacity=".55"/>'),
  swords: S(`<path d="M4 3.5l10.5 10.5M20 3.5L9.5 14" ${ST} stroke-width="2.8"/>`
    + `<path d="M5.5 14.5l4 4M18.5 14.5l-4 4M7.2 19.2l-2.4 2.3M16.8 19.2l2.4 2.3" ${ST} stroke-width="2.8"/>`),
  sort: S(`<path d="M7 4v15M3.5 15.5L7 19l3.5-3.5M17 20V5M13.5 8.5L17 5l3.5 3.5" ${ST} stroke-width="2.4"/>`),
  check: S(`<path d="M4.5 12.5l5 5 10-11" ${ST} stroke-width="3.2"/>`),
  plus: S(`<path d="M12 5v14M5 12h14" ${ST} stroke-width="3.2"/>`),
  swap: S(`<path d="M4 8h14M14.5 4.5L18 8l-3.5 3.5M20 16H6M9.5 12.5L6 16l3.5 3.5" ${ST} stroke-width="2.4"/>`),
  sound: S('<path d="M3 9h4l5-4.5v15L7 15H3z"/>'
    + `<path d="M15.5 8.5a5 5 0 0 1 0 7M18.3 5.8a9 9 0 0 1 0 12.4" ${ST} stroke-width="2.2"/>`),
  music: S('<path d="M9 17.5V5.2l11-2.2v12.3"/><circle cx="6.5" cy="17.8" r="3.2"/><circle cx="17.5" cy="15.5" r="3.2"/>'
    + `<path d="M9 5.2l11-2.2" ${ST} stroke-width="2.4"/>`),
  sparkle: S('<path d="M12 2l2.2 6.8L21 11l-6.8 2.2L12 20l-2.2-6.8L3 11l6.8-2.2z"/><path d="M19 15.5l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9z"/>'),
  bolt: S('<path d="M13.5 1.5L4.5 13.5h6l-1.5 9 9.5-12.5h-6.2z"/>'),
  hourglass: S('<path d="M5 2h14v2.5h-1.5c0 3.3-2.2 5.6-4 7.5 1.8 1.9 4 4.2 4 7.5H19V22H5v-2.5h1.5c0-3.3 2.2-5.6 4-7.5-1.8-1.9-4-4.2-4-7.5H5z"/>'
    + '<path d="M9 18.5c.8-1.9 2-2.9 3-3.9 1 1 2.2 2 3 3.9z" fill="#fff" opacity=".5"/>'),
  shield: S('<path d="M12 1.8l8.5 3.2v6.2c0 5.3-3.6 9.4-8.5 11.3C7.1 20.6 3.5 16.5 3.5 11.2V5z"/>'
    + '<path d="M12 4.3v15.6c-3.6-1.6-6-4.8-6-8.7V6.7z" fill="#fff" opacity=".3"/>'),
  spire: S('<path d="M12 1.5l3.2 6.5V20H8.8V8z"/><path d="M5 20.5h14V23H5z"/><path d="M12 1.5V20H8.8V8z" fill="#fff" opacity=".32"/>'
    + '<circle cx="12" cy="9.5" r="1.6" fill="#fff" opacity=".85"/>'),
  citadel: S('<path d="M3 22V10h3V7h2.5v3H11V4.5h2V10h2.5V7H18v3h3v12h-6.5v-4.5a2.5 2.5 0 0 0-5 0V22z"/>'
    + '<path d="M12 1.2l1.4 2H10.6z"/>'),
  pocket: S(`<rect x="3" y="3" width="18" height="18" rx="3" ${ST} stroke-width="2" stroke-dasharray="3 3"/>`
    + '<path d="M12 6l5 6h-3v6h-4v-6H7z"/>'),
  wand: S(`<path d="M4 20L14.5 9.5" ${ST} stroke-width="3"/>`
    + '<path d="M17 2l1.1 3.4L21.5 6.5l-3.4 1.1L17 11l-1.1-3.4-3.4-1.1 3.4-1.1z"/><circle cx="20.2" cy="13.3" r="1.3"/><circle cx="10.8" cy="3.4" r="1.1"/>'),
  boot: S('<path d="M6 2.5h7v9.2l6.6 3.1c1.2.6 1.9 1.8 1.9 3.1V20H3.5v-4.5L6 13z"/><path d="M3.5 20h18v2h-18z" opacity=".55"/>'),
});

/** Inline SVG markup for an icon name (empty string for unknown names). */
export function icon(name) {
  return ICONS[name] || '';
}

/** The game emblem: a faceted sky crystal in a brass halo (fixed colours, used once in the menu). */
export const EMBLEM = S('<path d="M8 19l19 15L40 8l13 26 19-15-9 45H17z" fill="#ffce55" stroke="#8a4d1d" stroke-width="4"/><path d="M17 67h46v13H17z" fill="#e6a82f" stroke="#8a4d1d" stroke-width="3"/><path d="M18 29l8 28h14V18L29 42z" fill="#fff2ab"/><path d="M34 49l6-8 6 8-6 9z" fill="#2786f3"/>', '0 0 80 88');
