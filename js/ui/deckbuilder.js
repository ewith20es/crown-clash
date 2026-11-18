// Deck builder panel: 8 deck slots, the 50-card collection (filter + sort), and a detail view.
//
// Editing flows (the deck always stays 8 distinct cards):
//   collection card -> detail -> "Add to deck" -> tap the deck slot to replace
//   deck slot       -> detail -> "Swap out"    -> tap a collection card to put in its place
import { TOWER_CARDS, CARDS, CARD_BY_ID, averageCost, cardStats, cardAbilities } from '../data/cards.js';
import { h } from './dom.js';
import { icon } from './icons.js';
import { createCard, applyArtAll } from './card.js';
import { filterAndSort, replaceInDeck, swapSlots, splitAbility, TYPE_LABEL, RARITY_LABEL, FILTERS } from './format.js';

const FILTER_LABEL = { all: 'All', troop: 'Troops', spell: 'Spells', building: 'Buildings', evolution:'Evolutions', hero:'Heroes', champion:'Champions' };

export class DeckBuilder {
  /**
   * @param ctx { getDeck(): string[], setDeck(deck): boolean, getThumbs(): object, sound(name), close() }
   */
  constructor(ctx) {
    this.ctx = ctx;
    this.filter = 'all';
    this.query = '';
    this.sort = 'cost-asc';
    this.pick = null;          // { card: id } | { slot: index }
    this.detailId = null;
    this.slotIds = new Array(8).fill(null);
    this.items = new Map();
    this.build();
  }

  build() {
    const ctx = this.ctx;
    this.avgVal = h('b', { text: '0.0' });
    const avg = h('div', { class: 'chip chip--aether chip--sm', title: 'Average elixir cost' },
      h('span', { class: 'chip__icon', html: icon('aether') }), h('span', { class: 'chip__label', text: 'Avg' }), this.avgVal);
    const done = h('button', {
      class: 'btn btn--gold btn--sm', type: 'button', 'aria-label': 'Done, back to the menu',
      onclick: () => { ctx.sound('close'); ctx.close(); },
    }, h('span', { text: 'Done' }));
    const head = h('header', { class: 'panel__head' },
      h('h2', { class: 'panel__title', id: 'ui-deck-title', text: 'Battle Deck - Level 11' }), avg, done);

    this.slotsEl = h('div', { class: 'deck-slots', role: 'group', 'aria-label': 'Your 8 deck cards' });
    this.slotBtns = [];
    for (let i = 0; i < 8; i++) {
      const b = h('button', { class: 'deck-slot', type: 'button', dataset: { i: String(i) } });
      b.addEventListener('click', () => this.onSlot(i));
      this.slotBtns.push(b);
      this.slotsEl.appendChild(b);
    }

    this.pickText = h('span', { class: 'pick-bar__text' });
    this.pickBar = h('div', { class: 'pick-bar', 'aria-live': 'polite' },
      h('span', { class: 'pick-bar__icon', html: icon('swap') }), this.pickText,
      h('button', {
        class: 'btn btn--steel btn--xs', type: 'button', 'aria-label': 'Cancel swap',
        onclick: () => { ctx.sound('close'); this.setPick(null); },
      }, h('span', { text: 'Cancel' })));

    this.tabBtns = {};
    const tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Filter cards' });
    for (const f of FILTERS) {
      const b = h('button', {
        class: 'tab', type: 'button', role: 'tab', 'aria-selected': 'false', 'aria-controls': 'ui-coll-grid',
        onclick: () => { if (this.filter !== f) { ctx.sound('tab'); this.filter = f; this.renderGrid(); } },
      }, h('span', { text: FILTER_LABEL[f] }));
      this.tabBtns[f] = b;
      tabs.appendChild(b);
    }
    this.sortLabel = h('span', { text: 'Cost ↑' });
    this.sortBtn = h('button', {
      class: 'btn btn--steel btn--xs sort-btn', type: 'button', 'aria-label': 'Sort by cost',
      onclick: () => { ctx.sound('tab'); this.sort = this.sort === 'cost-asc' ? 'cost-desc' : 'cost-asc'; this.renderGrid(); },
    }, h('span', { class: 'btn__icon', html: icon('sort') }), this.sortLabel);
    this.search = h('input', {type:'search', class:'collection-search', placeholder:'Search all 186 cards...', 'aria-label':'Search cards', oninput:()=>{this.query=this.search.value.trim().toLowerCase();this.renderGrid();}});
    this.resultCount=h('span',{class:'collection-count','aria-live':'polite'});
    const tools = h('div', { class: 'collection-tools' }, h('div',{class:'collection-search-row'},this.search,this.sortBtn,this.resultCount),tabs);
    this.towerSelect=h('select',{'aria-label':'Tower troop',onchange:()=>ctx.setTower(this.towerSelect.value)});
    for(const t of TOWER_CARDS)this.towerSelect.appendChild(h('option',{value:t.id,text:t.name}));
    const towerTools=h('label',{class:'tower-picker'},h('span',{text:'Tower troop'}),this.towerSelect,h('span',{class:'tower-picker__note',text:'Separate from your 8-card deck'}));

    this.gridEl = h('div', { class: 'coll-grid', id: 'ui-coll-grid', role: 'tabpanel', 'aria-label': 'Card collection' });
    const thumbs = ctx.getThumbs();
    for (const card of CARDS) {
      const btn = h('button', { class: 'coll-item', type: 'button', 'aria-label': `${card.name}, ${card.cost} elixir` },
        createCard(card.id, 'coll', thumbs),
        h('span', { class: 'coll-badge' }, h('span', { html: icon('check') }), h('span', { text: 'In deck' })));
      btn.addEventListener('click', () => this.onCollection(card.id));
      this.items.set(card.id, btn);
    }

    this.detailEl = h('div', { class: 'card-detail', role: 'dialog', 'aria-label': 'Card details', 'aria-hidden': 'true' });

    this.el = h('section', { class: 'panel panel--deck', 'aria-labelledby': 'ui-deck-title' },
      head,
      h('div', { class: 'deck-top' }, this.slotsEl, this.pickBar, towerTools),
      tools,
      this.scrollEl = h('div', { class: 'coll-scroll' }, this.gridEl),
      this.detailEl);
  }

  deck() { return this.ctx.getDeck(); }

  /** Called when the panel opens. */
  open() {
    this.pick = null;
    this.towerSelect.value=this.ctx.getTower() || 'tower-princess';
    this.closeDetail(true);
    this.render();
    // Collection buttons are detached until first open, so boot's global art pass
    // cannot reach them. Also refresh after opening with a filter active.
    this.applyThumbs(this.ctx.getThumbs());
    this.scrollEl.scrollTop = 0;
  }

  render() {
    this.renderSlots();
    this.renderGrid();
    this.renderPick();
  }

  applyThumbs(thumbs) { applyArtAll(this.el, thumbs); }

  renderSlots() {
    const deck = this.deck();
    const thumbs = this.ctx.getThumbs();
    for (let i = 0; i < 8; i++) {
      const id = deck[i];
      const b = this.slotBtns[i];
      if (this.slotIds[i] !== id) {
        this.slotIds[i] = id;
        b.replaceChildren(createCard(id, 'slot', thumbs));
        const c = CARD_BY_ID[id];
        b.setAttribute('aria-label', c ? `Deck slot ${i + 1}: ${c.name}, ${c.cost} elixir` : `Deck slot ${i + 1}`);
      }
    }
    this.avgVal.textContent = averageCost(deck).toFixed(1);
  }

  renderGrid() {
    const deck = this.deck();
    for (const f of FILTERS) {
      const on = f === this.filter;
      this.tabBtns[f].classList.toggle('is-on', on);
      this.tabBtns[f].setAttribute('aria-selected', on ? 'true' : 'false');
    }
    this.sortLabel.textContent = this.sort === 'cost-asc' ? 'Cost ↑' : 'Cost ↓';
    this.sortBtn.setAttribute('aria-label', this.sort === 'cost-asc' ? 'Sorted by cost, cheapest first' : 'Sorted by cost, most expensive first');
    const visible = new Set(filterAndSort(CARDS, this.filter, this.sort).filter(c=>!this.query || (c.name+' '+c.rarity+' '+c.type).toLowerCase().includes(this.query)).map((c) => c.id));
    this.resultCount.textContent=`${visible.size} / ${CARDS.length}`;
    const order = filterAndSort(CARDS, 'all', this.sort);
    const frag = document.createDocumentFragment();
    for (const card of order) {
      const btn = this.items.get(card.id);
      btn.hidden = !visible.has(card.id);
      btn.classList.toggle('is-in-deck', deck.includes(card.id));
      frag.appendChild(btn);
    }
    this.gridEl.appendChild(frag);
  }

  renderPick() {
    const p = this.pick;
    this.el.classList.toggle('is-picking-slot', !!(p && p.card));
    this.el.classList.toggle('is-picking-card', !!(p && p.slot !== undefined));
    this.pickBar.classList.toggle('is-on', !!p);
    for (let i = 0; i < 8; i++) this.slotBtns[i].classList.toggle('is-source', !!(p && p.slot === i));
    if (!p) return;
    if (p.card) this.pickText.textContent = `Tap a deck card to replace it with ${CARD_BY_ID[p.card].name}`;
    else this.pickText.textContent = `Pick a card to take ${CARD_BY_ID[this.deck()[p.slot]]?.name || 'its'} place`;
  }

  setPick(p) {
    this.pick = p;
    this.renderPick();
  }

  commit(next, slot) {
    if (!next) return false;
    if (!this.ctx.setDeck(next)) { this.ctx.sound('error'); return false; }
    this.ctx.sound('equip');
    this.render();
    const b = this.slotBtns[slot];
    if (b) {
      b.classList.remove('is-equipped');
      void b.offsetWidth;
      b.classList.add('is-equipped');
      clearTimeout(b._eqT);
      b._eqT = setTimeout(() => b.classList.remove('is-equipped'), 650);
    }
    return true;
  }

  onSlot(i) {
    const p = this.pick;
    const deck = this.deck();
    if (p && p.card) {
      const next = replaceInDeck(deck, i, p.card);
      this.pick = null;
      if (!this.commit(next, i)) this.renderPick();
      return;
    }
    if (p && p.slot !== undefined) {
      if (p.slot === i) { this.ctx.sound('close'); this.setPick(null); return; }
      const next = swapSlots(deck, p.slot, i);
      this.pick = null;
      if (!this.commit(next, i)) this.renderPick();
      return;
    }
    this.ctx.sound('open');
    this.openDetail(deck[i]);
  }

  onCollection(id) {
    const p = this.pick;
    const deck = this.deck();
    if (p && p.slot !== undefined) {
      const slot = p.slot;
      const next = replaceInDeck(deck, slot, id);
      this.pick = null;
      if (next) { this.commit(next, slot); return; }
      this.renderPick();
    } else if (p) {
      this.pick = null;
      this.renderPick();
    }
    this.ctx.sound('open');
    this.openDetail(id);
  }

  openDetail(id) {
    const card = CARD_BY_ID[id];
    if (!card) return;
    this.detailId = id;
    const inDeck = this.deck().includes(id);
    const thumbs = this.ctx.getThumbs();

    const stats = h('dl', { class: 'detail__stats' });
    for (const row of cardStats(card)) {
      stats.appendChild(h('div', { class: 'stat' }, h('dt', { text: row.label }), h('dd', { text: row.value })));
    }
    const abilities = cardAbilities(card);
    const abil = abilities.length
      ? h('ul', { class: 'detail__abilities' }, abilities.map((s) => {
        const { head, body } = splitAbility(s);
        return h('li', null, head ? h('b', { text: head + ' ' }) : null, body);
      }))
      : null;

    let action;
    if (inDeck) {
      action = h('div', { class: 'detail__actions' },
        h('span', { class: 'pill pill--ok' }, h('span', { html: icon('check') }), h('span', { text: 'In deck' })),
        h('button', {
          class: 'btn btn--azure', type: 'button', 'aria-label': `Swap ${card.name} out of the deck`,
          onclick: () => {
            this.ctx.sound('click');
            const s = this.deck().indexOf(id);
            this.closeDetail();
            if (s >= 0) this.setPick({ slot: s });
          },
        }, h('span', { class: 'btn__icon', html: icon('swap') }), h('span', { text: 'Swap out' })));
    } else {
      action = h('div', { class: 'detail__actions' },
        h('button', {
          class: 'btn btn--gold', type: 'button', 'aria-label': `Add ${card.name} to the deck`,
          onclick: () => { this.ctx.sound('click'); this.closeDetail(); this.setPick({ card: id }); },
        }, h('span', { class: 'btn__icon', html: icon('plus') }), h('span', { text: 'Add to deck' })));
    }

    const back = h('button', {
      class: 'btn-round btn-round--sm detail__back', type: 'button', 'aria-label': 'Close card details',
      html: icon('close'), onclick: () => { this.ctx.sound('close'); this.closeDetail(); },
    });

    const inner = h('div', { class: `detail__inner detail--${card.type}` },
      back,
      h('div', { class: 'detail__body' },
        h('div', { class: 'detail__art' }, createCard(id, 'detail', thumbs)),
        h('div', { class: 'detail__info' },
          h('h3', { class: 'detail__name', text: card.name }),
          h('div', { class: 'detail__meta' },
            h('span', { class: `tag tag--${card.type}`, text: TYPE_LABEL[card.type] || card.type }),
            h('span', { class: `tag tag--rarity rarity-text--${card.rarity}`, text: RARITY_LABEL[card.rarity] || card.rarity }),
            h('span', { class: 'tag tag--cost' }, h('span', { class: 'tag__icon', html: icon('aether') }), `${card.cost}`)),
          h('p', { class: 'detail__desc', text: card.desc || '' }),
          stats,
          abil)),
      action);

    this.detailEl.replaceChildren(h('div', {
      class: 'card-detail__backdrop',
      onclick: () => { this.ctx.sound('close'); this.closeDetail(); },
    }), inner);
    this.detailEl.classList.add('is-open');
    this.detailEl.setAttribute('aria-hidden', 'false');
  }

  closeDetail(silent) {
    if (!this.detailEl) return;
    this.detailId = null;
    this.detailEl.classList.remove('is-open');
    this.detailEl.setAttribute('aria-hidden', 'true');
    if (silent) this.detailEl.replaceChildren();
  }

  /** Escape / back handling. Returns true when something inside the panel was dismissed. */
  back() {
    if (this.detailId) { this.closeDetail(); return true; }
    if (this.pick) { this.setPick(null); return true; }
    return false;
  }
}
