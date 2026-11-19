// Settings and How-to-play panels.
import { h } from './dom.js';
import { icon } from './icons.js';
import { QUALITIES } from './format.js';

const QUALITY_LABEL = { low: 'Low', medium: 'Medium', high: 'High' };

function panelHead(title, id, onClose) {
  return h('header', { class: 'panel__head' },
    h('h2', { class: 'panel__title', id, text: title }),
    h('button', { class: 'btn-round btn-round--sm', type: 'button', 'aria-label': `Close ${title}`, html: icon('close'), onclick: onClose }));
}

export class SettingsPanel {
  /** @param ctx { getSettings(), change(settings), close(), sound(name) } */
  constructor(ctx) {
    this.ctx = ctx;
    const close = () => { ctx.sound('close'); ctx.close(); };

    this.qBtns = {};
    const seg = h('div', { class: 'seg seg--3', role: 'radiogroup', 'aria-label': 'Graphics quality' },
      h('span', { class: 'seg__thumb', 'aria-hidden': 'true' }));
    QUALITIES.forEach((q, i) => {
      const b = h('button', {
        class: 'seg__btn', type: 'button', role: 'radio', 'aria-checked': 'false', dataset: { i: String(i) },
        onclick: () => this.set({ quality: q }, 'tab'),
      }, h('span', { text: QUALITY_LABEL[q] }));
      this.qBtns[q] = b;
      seg.appendChild(b);
    });
    this.qSeg = seg;

    this.sfxSw = this.toggle('Sound effects', () => this.set({ sfx: !this.ctx.getSettings().sfx }, 'click'));
    this.musicSw = this.toggle('Music', () => this.set({ music: !this.ctx.getSettings().music }, 'click'));

    this.el = h('section', { class: 'panel panel--settings', 'aria-labelledby': 'ui-settings-title' },
      panelHead('Settings', 'ui-settings-title', close),
      h('div', { class: 'panel__body' },
        h('div', { class: 'set-row set-row--stack' },
          h('div', { class: 'set-row__label' }, h('span', { class: 'set-row__icon', html: icon('sparkle') }),
            h('span', null, h('b', { text: 'Graphics quality' }), h('small', { text: 'Lower it if the battle stutters' }))),
          seg),
        h('div', { class: 'set-row' },
          h('div', { class: 'set-row__label' }, h('span', { class: 'set-row__icon', html: icon('sound') }), h('b', { text: 'Sound effects' })),
          this.sfxSw),
        h('div', { class: 'set-row' },
          h('div', { class: 'set-row__label' }, h('span', { class: 'set-row__icon', html: icon('music') }), h('b', { text: 'Music' })),
          this.musicSw),
        h('p', { class: 'fan-notice', text: 'Unofficial fan game. Not affiliated with or endorsed by Supercell. Arena art from Crown Clash; Clash Royale card portraits via RoyaleAPI. See assets/LICENSE and assets/royale-cards/README.md.' })),
      h('footer', { class: 'panel__foot' },
        h('button', { class: 'btn btn--gold', type: 'button', 'aria-label': 'Done', onclick: close }, h('span', { text: 'Done' }))));
  }

  toggle(label, onClick) {
    return h('button', {
      class: 'switch', type: 'button', role: 'switch', 'aria-checked': 'false', 'aria-label': label, onclick: onClick,
    }, h('span', { class: 'switch__on', text: 'ON' }), h('span', { class: 'switch__off', text: 'OFF' }), h('span', { class: 'switch__knob' }));
  }

  set(partial, sound) {
    const next = { ...this.ctx.getSettings(), ...partial };
    this.ctx.sound(sound);
    this.ctx.change(next);
    this.refresh();
  }

  refresh() {
    const s = this.ctx.getSettings();
    QUALITIES.forEach((q, i) => {
      const on = s.quality === q;
      this.qBtns[q].classList.toggle('is-on', on);
      this.qBtns[q].setAttribute('aria-checked', on ? 'true' : 'false');
      if (on) this.qSeg.style.setProperty('--i', String(i));
    });
    for (const [sw, on] of [[this.sfxSw, s.sfx], [this.musicSw, s.music]]) {
      sw.classList.toggle('is-on', !!on);
      sw.setAttribute('aria-checked', on ? 'true' : 'false');
    }
  }
}

const HOWTO = [
  { icon: 'cards', tone: 'surge', title: 'Build with special slots',
    text: 'Drag a card into Evolution, Hero / Champion, or Wild to equip its available form. Hold a collection card to drag on touchscreens. In Wild, use the switch when a card has both forms.' },
  { icon: 'bolt', tone: 'gold', title: 'Evolve and activate abilities',
    text: 'Play an Evolution card to fill its purple cycle markers. The ready deployment evolves. Heroes and Champions have an ability button with an elixir cost and limited uses.' },
  { icon: 'aether', tone: 'aether', title: 'Spend elixir',
    text: 'Elixir refills over time. Drag a card onto your half of the arena. The outlined tile shows where it will land.' },
  { icon: 'boot', tone: 'troop', title: 'Troops fight on their own',
    text: 'Units march down their lane, cross the bridges and attack whatever they meet.' },
  { icon: 'spire', tone: 'gold', title: 'Topple Princess Towers for crowns',
    text: 'Each enemy Princess Tower you destroy is a crown. Destroy the King Tower for an instant victory.' },
  { icon: 'pocket', tone: 'azure', title: 'Push forward',
    text: 'Once an enemy Princess Tower falls, you may deploy in a forward pocket on that side.' },
  { icon: 'bolt', tone: 'surge', title: 'Double elixir & overtime',
    text: 'The last minute is Double elixir: elixir flows twice as fast. Tied games go to sudden-death overtime.' },
  { icon: 'wand', tone: 'spell', title: 'Spells strike anywhere',
    text: 'Troops and buildings deploy on your side, but spells can be cast anywhere on the arena.' },
];

export class HowToPanel {
  /** @param ctx { close(), sound(name) } */
  constructor(ctx) {
    const close = () => { ctx.sound('close'); ctx.close(); };
    this.el = h('section', { class: 'panel panel--howto', 'aria-labelledby': 'ui-howto-title' },
      panelHead('How to play', 'ui-howto-title', close),
      h('div', { class: 'panel__body' },
        h('ol', { class: 'howto' }, HOWTO.map((it, i) => h('li', { class: `howto__item tone--${it.tone}`, style: `--d:${i}` },
          h('span', { class: 'howto__art', 'aria-hidden': 'true' },
            h('span', { class: 'howto__num', text: String(i + 1) }), h('span', { class: 'howto__icon', html: icon(it.icon) })),
          h('span', { class: 'howto__text' }, h('b', { text: it.title }), h('span', { text: it.text })))))),
      h('footer', { class: 'panel__foot' },
        h('button', { class: 'btn btn--gold', type: 'button', 'aria-label': 'Got it', onclick: close }, h('span', { text: 'Got it' }))));
  }
}
