// The collection displays families. Deck IDs record the form activated by each slot.
import { TOWER_CARDS, COLLECTION_CARDS, FAMILY_FORMS, CARD_BY_ID, DECK_SLOTS, SLOT_LABELS, averageCost, cardStats, cardAbilities } from '../data/cards.js';
import { DeckDrag } from './deckdrag.js';
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
    this.drag = new DeckDrag(this);
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
      h('h2', { class: 'panel__title', id: 'ui-deck-title', text: 'Battle Deck' }), avg, done);

    this.slotsEl = h('div', { class: 'deck-slots', role: 'group', 'aria-label': 'Your 8 deck cards' });
    this.slotBtns = [];
    for (let i = 0; i < 8; i++) {
      const b = h('button', { class: `deck-slot slot--${DECK_SLOTS[i]}`, type: 'button', dataset: { i: String(i) } });
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
    this.search = h('input', {type:'search', class:'collection-search', placeholder:`Search ${COLLECTION_CARDS.length} cards…`, 'aria-label':'Search cards', oninput:()=>{this.query=this.search.value;this.renderGrid();}});
    this.resultCount=h('span',{class:'collection-count','aria-live':'polite'});
    const tools = h('div', { class: 'collection-tools' }, h('div',{class:'collection-search-row'},this.search,this.sortBtn,this.resultCount),tabs);
    this.towerSelect=h('select',{'aria-label':'Tower troop',onchange:()=>ctx.setTower(this.towerSelect.value)});
    for(const t of TOWER_CARDS)this.towerSelect.appendChild(h('option',{value:t.id,text:t.name}));
    const towerTools=h('label',{class:'tower-picker'},h('span',{text:'Tower troop'}),this.towerSelect,h('span',{class:'tower-picker__note',text:'Separate from your 8-card deck'}));
    this.wildSwitch = h('button', { type: 'button', class: 'wild-switch', role: 'switch',
      onclick: () => {
        const id = this.deck()[2];
        const mode = CARD_BY_ID[id].variant === 'hero' ? 'evolution' : 'hero';
        this.pick = null;
        this.commit(replaceInDeck(this.deck(), 2, id, mode), 2);
      } }, h('span', {text:'Evo'}), h('span', {text:'Hero'}));
    this.wildControl = h('div', {class:'wild-control'}, h('span',{text:'Wild form'}), this.wildSwitch);

    this.gridEl = h('div', { class: 'coll-grid', id: 'ui-coll-grid', role: 'tabpanel', 'aria-label': 'Card collection' });
    const thumbs = ctx.getThumbs();
    for (const card of COLLECTION_CARDS) {
      const forms = FAMILY_FORMS[card.family];
      const badges = h('span', {class:'family-badges', 'aria-hidden':'true'});
      if (forms.evolution) badges.append(h('b', {class:'family-evo', text:'Evo'}));
      if (forms.hero) badges.append(h('b', {class:'family-hero', text:'Hero'}));
      const btn = h('button', { class: 'coll-item', type: 'button', dataset:{id:card.id}, 'aria-label': `${card.name}, ${card.cost} elixir` },
        createCard(card.id, 'coll', thumbs),
        badges,
        h('span', { class: 'coll-badge' }, h('span', { html: icon('check') }), h('span', { text: 'In deck' })));
      btn.addEventListener('click', () => this.onCollection(card.id));
      this.items.set(card.id, btn);
    }

    this.detailEl = h('div', { class: 'card-detail', role: 'dialog', 'aria-label': 'Card details', 'aria-hidden': 'true' });

    this.el = h('section', { class: 'panel panel--deck', 'aria-labelledby': 'ui-deck-title' },
      head,
      h('div', { class: 'deck-top' },
        h('div', {class:'deck-caption'}, h('b',{text:'YOUR BATTLE DECK'}),h('span',{text:'All cards · Level 11'})),
        this.slotsEl, this.pickBar,
        h('p',{class:'slot-guide'}, h('span',{class:'drag-mouse-hint',text:'Drag a card into a slot or swap two deck cards.'}),
          h('span',{class:'drag-touch-hint',text:'Hold a collection card to drag it. Swipe to browse.'})),
        h('div',{class:'deck-options'}, this.wildControl, towerTools)),
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
        b.replaceChildren(h('span', { class: 'deck-slot__label', text: i < 3 ? SLOT_LABELS[DECK_SLOTS[i]] : `Slot ${i + 1}` }), createCard(id, 'slot', thumbs));
        const c = CARD_BY_ID[id];
        b.setAttribute('aria-label', c ? `${SLOT_LABELS[DECK_SLOTS[i]]} slot ${i + 1}: ${c.name}, ${c.cost} elixir` : `Deck slot ${i + 1}`);
      }
    }
    this.avgVal.textContent = averageCost(deck).toFixed(1);
    const wild = CARD_BY_ID[deck[2]], forms = FAMILY_FORMS[wild.family];
    this.wildControl.hidden = !(forms.evolution && forms.hero);
    this.wildSwitch.setAttribute('aria-label', `Use Hero form for ${forms.base.name} in the Wild slot`);
    this.wildSwitch.setAttribute('aria-checked', String(wild.variant === 'hero'));
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
    const order = filterAndSort(COLLECTION_CARDS, this.filter, this.sort, this.query);
    this.resultCount.textContent = `${order.length} / ${COLLECTION_CARDS.length}`;
    const equipped = new Set(deck.map(id => CARD_BY_ID[id].family));
    this.gridEl.replaceChildren(...order.map(card => {
      const btn = this.items.get(card.id);
      btn.classList.toggle('is-in-deck', equipped.has(card.family));
      return btn;
    }));
  }

  renderPick() {
    const p = this.pick;
    this.el.classList.toggle('is-picking-slot', !!(p && p.card));
    this.el.classList.toggle('is-picking-card', !!(p && p.slot !== undefined));
    this.pickBar.classList.toggle('is-on', !!p);
    for (let i = 0; i < 8; i++) {
      this.slotBtns[i].classList.toggle('is-source', !!(p && p.slot === i));
      const allowed = !p || (p.card ? !!replaceInDeck(this.deck(), i, p.card) : p.slot === i || !!swapSlots(this.deck(), p.slot, i));
      this.slotBtns[i].classList.toggle('is-incompatible', !allowed);
      this.slotBtns[i].setAttribute('aria-disabled', String(!allowed));
    }
    if (!p) return;
    if (p.card) this.pickText.textContent = `Choose a highlighted slot for ${CARD_BY_ID[p.card].name}`;
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
      if (!next) { this.ctx.sound('error'); this.pickText.textContent = 'Choose a highlighted slot. Champions need the Hero or Wild slot.'; return; }
      this.pick = null;
      if (!this.commit(next, i)) this.renderPick();
      return;
    }
    if (p && p.slot !== undefined) {
      if (p.slot === i) { this.ctx.sound('close'); this.setPick(null); return; }
      const next = swapSlots(deck, p.slot, i);
      if (!next) { this.ctx.sound('error'); this.pickText.textContent = 'Both cards must fit their new slots. Choose a highlighted slot.'; return; }
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
      if (!next && deck[slot] !== id) { this.ctx.sound('error'); this.pickText.textContent = `${CARD_BY_ID[id].name} cannot make that swap. Choose a compatible card or cancel.`; return; }
      this.pick = null;
      if (next) { this.commit(next, slot); return; }
      this.renderPick();
    } else if (p) {
      this.pick = null;
      this.renderPick();
    }
    this.ctx.sound('open');
    this.openDetail(deck.find(d => CARD_BY_ID[d].family === CARD_BY_ID[id].family) || id);
  }

  openDetail(id) {
    const card = CARD_BY_ID[id];
    if (!card) return;
    this.detailId = id;
    const deckSlot = this.deck().findIndex(d => CARD_BY_ID[d].family === card.family);
    const inDeck = deckSlot !== -1;
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
            this.closeDetail();
            this.setPick({ slot: deckSlot });
          },
        }, h('span', { class: 'btn__icon', html: icon('swap') }), h('span', { text: 'Swap out' })));
    } else {
      action = h('div', { class: 'detail__actions' },
        h('button', {
          class: 'btn btn--gold', type: 'button', 'aria-label': `Add ${card.name} to the deck`,
          onclick: () => { this.ctx.sound('click'); this.closeDetail(); this.setPick({ card: card.baseId || id }); },
        }, h('span', { class: 'btn__icon', html: icon('plus') }), h('span', { text: 'Add to deck' })));
    }

    const back = h('button', {
      class: 'btn-round btn-round--sm detail__back', type: 'button', 'aria-label': 'Close card details',
      html: icon('close'), onclick: () => { this.ctx.sound('close'); this.closeDetail(); },
    });

    const forms = Object.values(FAMILY_FORMS[card.family]);
    const formButtons = forms.length > 1 ? h('div', {class:'detail__forms', 'aria-label':'Preview form stats'},
      forms.map(c => h('button', {class:`form-button ${c.id === id ? 'is-on' : ''}`, type:'button',
        'aria-label':`Preview ${c.name} stats`, 'aria-pressed': String(c.id === id),
        text:c.variant === 'base' ? 'Regular' : c.variant === 'evolution' ? 'Evolution' : 'Hero',
        onclick: () => this.openDetail(c.id) }))) : null;
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
          h('p',{class:'detail__slot-rule',text:card.rarity === 'champion' ? 'Equip in the Hero / Champion or Wild slot.' : forms.length > 1 ? 'The deck slot activates the form. Preview its stats below.' : 'Fits any deck slot.'}),
          formButtons,
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
    if (this.drag.cancel()) return true;
    if (this.detailId) { this.closeDetail(); return true; }
    if (this.pick) { this.setPick(null); return true; }
    return false;
  }
}
