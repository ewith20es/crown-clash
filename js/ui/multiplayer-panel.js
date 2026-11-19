import { h } from './dom.js';
import { icon } from './icons.js';

export class MultiplayerPanel {
  constructor(start, close, cancel) {
    const button = (label, color, action) => h('button', { class: 'btn btn--' + color, type: 'button', onclick: action }, h('span', { text: label }));
    this.input = h('input', { id: 'room-code', maxlength: 6, autocomplete: 'off', autocapitalize: 'characters',
      spellcheck: 'false', placeholder: '6-character code', required: true, pattern: '[A-Za-z2-9]{6}' });
    this.choices = h('div', { class: 'online-choices' },
      button('Find a match', 'gold', () => start('find')),
      button('Create private room', 'azure', () => start('create')),
      h('form', { class: 'online-join', onsubmit: ev => { ev.preventDefault(); start('join', this.input.value.trim().toUpperCase()); } },
        h('label', { for: 'room-code', text: 'Join a friend' }), this.input,
        h('button', { class: 'btn btn--steel', type: 'submit' }, h('span', { text: 'Join' }))));
    this.code = h('output', { class: 'online-code', 'aria-label': 'Room code' });
    this.cancel = button('Cancel', 'steel', cancel);
    this.status = h('p', { class: 'online-status', role: 'status' });
    this.el = h('section', { class: 'panel panel--online', 'aria-labelledby': 'online-title' },
      h('header', { class: 'panel__head' }, h('h2', { id: 'online-title', class: 'panel__title', text: 'Multiplayer' }),
        h('button', { class: 'btn-round btn-round--sm', type: 'button', 'aria-label': 'Close multiplayer', html: icon('close'), onclick: close })),
      h('div', { class: 'panel__body' }, this.status, this.code, this.choices, this.cancel));
    this.show();
  }

  show(message = '', code = '', waiting = false) {
    this.status.textContent = message;
    this.code.textContent = code || '';
    this.code.hidden = !code;
    this.choices.hidden = waiting;
    this.cancel.hidden = !waiting;
  }
}
