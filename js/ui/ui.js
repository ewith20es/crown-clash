// Aether Spires — the DOM user interface: menu, deck builder, settings, how-to-play, battle HUD
// and result screen. Everything lives inside #ui-root; only interactive elements take pointer
// events, so taps and drags on empty areas fall through to the arena canvas.
import { MATCH, TEAMS } from '../config.js';
import { CARD_BY_ID, averageCost, isValidDeck } from '../data/cards.js';
import { h, retrigger } from './dom.js';
import { icon, EMBLEM } from './icons.js';
import { createCard, applyArtAll } from './card.js';
import { cardArtUrl } from '../data/royale-art.js';
import { DeckBuilder } from './deckbuilder.js';
import { SettingsPanel, HowToPanel } from './panels.js';
import {
  formatClock, formatNumber, formatDelta, normalizeState, normalizeSettings, reasonText, resultStatRows,
  DIFFICULTIES, PHASES,
} from './format.js';

const HAND = MATCH.HAND_SIZE || 4;
const SEGMENTS = 10;
const FILL_STEPS = 400;
const CHARGE_STEPS = 48;
// Precomputed transforms so the per-frame aether updates never build strings.
const FILL_TF = Array.from({ length: FILL_STEPS + 1 }, (_, i) => `scaleX(${(i / FILL_STEPS).toFixed(4)})`);
const CHARGE_TF = Array.from({ length: CHARGE_STEPS + 1 }, (_, i) => `scaleY(${(i / CHARGE_STEPS).toFixed(4)})`);

const BANNER_KINDS = new Set(['info', 'surge', 'overtime', 'good', 'bad']);
const PHASE_LABEL = { regular: 'Time left', surge: 'Double elixir', overtime: 'Overtime', ended: 'Time' };
const OUTCOME_TITLE = { win: 'Victory', lose: 'Defeat', draw: 'Draw' };
const SCREENS = ['menu', 'battle', 'result'];

function str(v, fallback) {
  return typeof v === 'string' && v.trim() ? v.trim() : fallback;
}

function toIndex(i) {
  return Number.isInteger(i) && i >= 0 && i < HAND ? i : null;
}

function starCount(v) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(0, Math.min(3, n)) : 0;
}

function sanitizeThumbs(t) {
  const out = {};
  if (t && typeof t === 'object') {
    for (const k of Object.keys(t)) if (typeof t[k] === 'string' && t[k]) out[k] = t[k];
  }
  return out;
}

function reducedMotion() {
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

export class UI {
  constructor(root, opts) {
    const o = opts && typeof opts === 'object' ? opts : {};
    this.root = root || document.getElementById('ui-root');
    this.on = o.on && typeof o.on === 'object' ? o.on : {};
    this.thumbs = sanitizeThumbs(o.thumbs);
    this.state = normalizeState(o.state);

    this._screen = 'menu';
    this._howtoDone = false;
    this.panelName = null;
    this.modalOpen = false;
    this.info = { playerName: 'You', enemyName: 'Rival', enemyTitle: '' };
    this._handRect = null;
    this._playLock = 0;
    this._trophyToken = 0;
    this._bannerQueue = [];
    this._bannerCur = null;
    this._bannerGap = 0;
    this._hintText = '';
    this._proxyId = null;
    this._proxyOn = false;
    this._peekSig = '';

    this.root.classList.add('ui');
    this._buildMenu();
    this._buildBattle();
    this._buildResult();
    this._buildPanels();
    this._buildModal();
    this.elProxy = h('div', { class: 'drag-proxy', 'aria-hidden': 'true' });
    this.root.append(this.elMenu, this.elBattle, this.elResult, this.elPanels, this.elModal, this.elProxy);

    this._resetBattleState();
    this._refreshMenu();
    this.settingsPanel.refresh();
    for (const name of SCREENS) this._screenEl(name).setAttribute('aria-hidden', 'true');

    this._onKey = this._onKey.bind(this);
    window.addEventListener('keydown', this._onKey);
    const invalidate = () => { this._handRect = null; };
    window.addEventListener('resize', invalidate);
    window.addEventListener('orientationchange', invalidate);
    if (typeof ResizeObserver === 'function') {
      try {
        this._ro = new ResizeObserver(invalidate);
        this._ro.observe(this.elBottom);
        this._ro.observe(this.root);
      } catch { /* layout will simply be re-measured on resize */ }
    }
  }

  get screen() { return this._screen; }

  // ───────────────────────────── callbacks ─────────────────────────────

  _emit(name, ...args) {
    const fn = this.on[name];
    if (typeof fn !== 'function') return undefined;
    try { return fn(...args); } catch (err) { console.error(`[ui] on.${name} failed`, err); return undefined; }
  }

  _sound(name) { this._emit('sound', name); }

  // ───────────────────────────── building ─────────────────────────────

  _buildMenu() {
    this.trophyVal = h('b', { class: 'chip__value', text: '0' });
    const trophy = h('div', { class: 'chip chip--trophy', role: 'status', 'aria-label': 'Trophies' },
      h('span', { class: 'chip__icon', html: icon('trophy') }), this.trophyVal);

    const howBtn = h('button', {
      class: 'btn-round', type: 'button', 'aria-label': 'How to play', html: icon('help'),
      onclick: (ev) => this.openPanel('howto', ev),
    });
    const setBtn = h('button', {
      class: 'btn-round', type: 'button', 'aria-label': 'Settings', html: icon('gear'),
      onclick: (ev) => this.openPanel('settings', ev),
    });

    const logo = h('div', { class: 'logo' },
      h('div', { class: 'logo__emblem', html: EMBLEM }),
      h('h1', { class: 'logo__text', 'aria-label': 'Crown Clash' },
        h('span', { class: 'logo__l1', text: 'CROWN' }), h('span', { class: 'logo__l2', text: 'CLASH' })),
      h('div', { class: 'logo__tag', text: 'Royal Arena · Battle for the crown' }));

    this.diffBtns = {};
    this.diffSeg = h('div', { class: 'seg seg--diff', role: 'radiogroup', 'aria-label': 'Rival difficulty',
      style: `--segments:${DIFFICULTIES.length}` },
      h('span', { class: 'seg__thumb', 'aria-hidden': 'true' }));
    DIFFICULTIES.forEach((d, i) => {
      const b = h('button', {
        class: `seg__btn diff--${d}`, type: 'button', role: 'radio', 'aria-checked': 'false',
        onclick: () => this._setDifficulty(d),
        onkeydown: event => {
          const last = DIFFICULTIES.length - 1;
          const next = { ArrowLeft: i ? i - 1 : last, ArrowRight: i === last ? 0 : i + 1, Home: 0, End: last }[event.key];
          if (next === undefined) return;
          event.preventDefault();
          this._setDifficulty(DIFFICULTIES[next]);
          this.diffBtns[DIFFICULTIES[next]].focus();
        },
      }, h('span', { text: d[0].toUpperCase() + d.slice(1) }));
      this.diffBtns[d] = b;
      this.diffSeg.appendChild(b);
    });

    this.peekCards = h('div', { class: 'deck-peek__cards' });
    const peek = h('button', {
      class: 'deck-peek', type: 'button', 'aria-label': 'Your battle deck: tap to edit',
      onclick: (ev) => this.openPanel('deck', ev),
    }, h('div',{class:'deck-peek__heading'},h('b',{text:'BATTLE DECK'}),h('span',{text:'Tap to edit'})), this.peekCards);

    this.peekAvg = h('span', { text: '0.0' });
    const deckBtn = h('button', {
      class: 'btn btn--azure btn--deck', type: 'button', 'aria-label': 'Edit deck',
      onclick: (ev) => this.openPanel('deck', ev),
    },
    h('span', { class: 'btn__icon', html: icon('cards') }),
    h('span', { class: 'btn__stack' }, h('span', { class: 'btn__label', text: 'Deck' }),
      h('small', { class: 'btn__sub' }, h('span', { class: 'mini-gem', html: icon('aether') }), this.peekAvg)));

    this.battleBtn = h('button', {
      class: 'btn btn--gold btn--battle', type: 'button', 'aria-label': 'Battle',
      onclick: () => this._onPlay(),
    },
    h('span', { class: 'btn__glow', 'aria-hidden': 'true' }),
    h('span', { class: 'btn__icon', html: icon('swords') }),
    h('span', { class: 'btn__label', text: 'Battle' }));

    this.elMenu = h('div', { class: 'scr scr-menu', id: 'ui-menu' },
      h('img', { class: 'royal-hero royal-hero--left', src: 'assets/chr/knight.png', alt: '', draggable: 'false' }),
      h('img', { class: 'royal-hero royal-hero--right', src: 'assets/chr/giant.png', alt: '', draggable: 'false' }),
      h('div', { class: 'menu-top' },
        h('div',{class:'player-badge'},h('span',{class:'player-badge__shield',text:'11'}),h('div',null,h('b',{text:'Royal Challenger'}),h('small',{text:'CROWN CLASH'}))),
        trophy, h('div', { class: 'menu-top__btns' }, howBtn, setBtn)),
      logo,
      h('div', { class: 'menu-fill' },
        h('div',{class:'arena-plaque'},h('span',{html:icon('trophy')}),h('div',null,h('b',{text:'Royal Arena'}),h('small',{text:'1v1 · Classic Battle'})))),
      h('div', { class: 'menu-bottom' },
        peek,
        h('div', { class: 'menu-diff' }, h('span', { class: 'menu-diff__label', text: 'Rival' }), this.diffSeg),
        h('div', { class: 'menu-actions' }, deckBtn, this.battleBtn)),
      h('nav',{class:'royal-nav','aria-label':'Game navigation'},
        h('button',{type:'button',onclick:ev=>this.openPanel('deck',ev)},h('span',{html:icon('cards')}),h('b',{text:'Cards'})),
        h('button',{type:'button',class:'is-current','aria-current':'page',onclick:()=>this._onPlay()},h('span',{html:icon('swords')}),h('b',{text:'Battle'})),
        h('button',{type:'button',onclick:ev=>this.openPanel('howto',ev)},h('span',{html:icon('help')}),h('b',{text:'Training'})),
        h('button',{type:'button',onclick:ev=>this.openPanel('settings',ev)},h('span',{html:icon('gear')}),h('b',{text:'Settings'}))));
  }

  _starRow(cls) {
    const el = h('div', { class: cls, role: 'img', 'aria-label': '0 of 3 crowns' });
    const stars = [];
    for (let i = 0; i < 3; i++) {
      const s = h('span', { class: 'star', style: `--i:${i}`, html: icon('star') });
      stars.push(s);
      el.appendChild(s);
    }
    return { el, stars, n: -1 };
  }

  _setStarRow(row, value, animate) {
    const n = starCount(value);
    if (n === row.n) return;
    const prev = row.n < 0 ? 0 : row.n;
    for (let i = 0; i < 3; i++) {
      const s = row.stars[i];
      const on = i < n;
      s.classList.toggle('is-on', on);
      if (animate && on && i >= prev) retrigger(s, 'is-new');
      else if (!on) s.classList.remove('is-new');
    }
    row.n = n;
    row.el.setAttribute('aria-label', `${n} of 3 crowns`);
  }

  _buildBattle() {
    this.quitBtn = h('button', {
      class: 'btn-round btn-round--sm btn-quit', type: 'button', 'aria-label': 'Leave battle', html: icon('flag'),
      onclick: (ev) => this._openQuit(ev),
    });
    this.enemyNameEl = h('div', { class: 'hud-name' });
    this.enemyTitleEl = h('div', { class: 'hud-title' });
    this.youNameEl = h('div', { class: 'hud-name', text: 'You' });
    this.enemyStars = this._starRow('hud-crowns hud-crowns--enemy');
    this.youStars = this._starRow('hud-crowns hud-crowns--you');

    this.timerLabel = h('div', { class: 'timer__label', text: PHASE_LABEL.regular });
    this.timerValue = h('div', { class: 'timer__value', text: '0:00' });
    this.timerTag = h('div', { class: 'timer__tag' },
      h('span', { class: 'timer__tag-icon', html: icon('aether') }), h('span', { text: '×2 elixir' }));
    this.timerEl = h('div', { class: 'hud-timer phase--regular', role: 'timer' }, this.timerLabel, this.timerValue, this.timerTag);

    this.elTop = h('div', { class: 'hud-top' },
      h('div', { class: 'hud-side hud-side--enemy' }, this.quitBtn,
        h('div', { class: 'hud-who' }, this.enemyNameEl,
          h('div', { class: 'hud-meta' }, this.enemyStars.el, this.enemyTitleEl))),
      h('div', { class: 'hud-center' }, this.timerEl),
      h('div', { class: 'hud-side hud-side--you' },
        h('div', { class: 'hud-who' }, this.youNameEl,
          h('div', { class: 'hud-meta' }, h('div', { class: 'hud-title', text: TEAMS[0].name }), this.youStars.el))));

    this.elHint = h('div', { class: 'hud-hint', role: 'status', 'aria-live': 'polite' });
    this.nextWrap = h('div', { class: 'hud-next__card' });
    const next = h('div', { class: 'hud-next' }, h('span', { class: 'hud-next__label', text: 'Next' }), this.nextWrap);

    this.slots = [];
    const hand = h('div', { class: 'hud-hand', role: 'group', 'aria-label': 'Your hand' });
    for (let i = 0; i < HAND; i++) {
      const fill = h('div', { class: 'hand-charge__fill' });
      const charge = h('div', { class: 'hand-charge', 'aria-hidden': 'true' }, fill);
      const lift = h('div', { class: 'hand-slot__lift' });
      const btn = h('button', { class: 'hand-slot is-empty', type: 'button', 'aria-label': `Card ${i + 1}`, dataset: { i: String(i) } },
        lift, h('span', { class: 'hand-slot__key', 'aria-hidden': 'true', text: String(i + 1) }));
      btn.addEventListener('pointerdown', (ev) => this._onCardDown(i, ev));
      btn.addEventListener('contextmenu', (ev) => ev.preventDefault());
      this.slots.push({ btn, lift, charge, fill, cardEl: null, id: null, cost: 0, poor: null, fq: -1, timers: {} });
      hand.appendChild(btn);
    }

    this.aeFill = h('div', { class: 'aether__fill' });
    this.aeSegs = [];
    const segs = h('div', { class: 'aether__segs' });
    for (let i = 0; i < SEGMENTS; i++) {
      const s = h('span', { class: 'aether__seg' });
      this.aeSegs.push(s);
      segs.appendChild(s);
    }
    this.aeNum = h('span', { class: 'aether__num', text: '0' });
    this.aeBar = h('div', {
      class: 'aether', role: 'meter', 'aria-label': 'Elixir', 'aria-valuemin': '0', 'aria-valuemax': String(MATCH.AETHER_MAX), 'aria-valuenow': '0',
    },
    h('div', { class: 'aether__gem' }, h('span', { class: 'aether__gem-icon', html: icon('aether') }), this.aeNum),
    h('div', { class: 'aether__track' }, this.aeFill, segs));

    this.abilityBar=h('div',{class:'ability-bar','aria-label':'Champion and Hero abilities'});
    this.elBottom = h('div', { class: 'hud-bottom' },
      this.abilityBar,
      this.elHint,
      h('div', { class: 'hud-row' }, next, hand),
      this.aeBar);

    this.bannerLayer = h('div', { class: 'banner-layer', 'aria-live': 'assertive' });
    this.elBattle = h('div', { class: 'scr scr-battle', id: 'ui-battle' }, this.elTop, this.bannerLayer, this.elBottom);
  }

  setAbilities(abilities) {
    const signature=abilities.map(a=>`${a.id}:${a.remaining}:${Math.ceil(a.cooldown)}:${a.ready}`).join('|');
    if(signature===this.abilitySignature)return;
    this.abilitySignature=signature;
    this.abilityBar.replaceChildren(...abilities.map(a=>h('button',{
      class:'btn btn--gold btn--xs ability-button',type:'button',disabled:!a.ready,
      'aria-label':`Activate ${a.name} ability`,onclick:()=>this._emit('ability',a.id),
    },h('img',{src:cardArtUrl(a.cardId),alt:'',class:'ability-portrait'}),
      h('span',{class:'ability-copy'},h('b',{text:a.name.replace(' Hero','')}),h('small',{text:a.remaining<=0?'Used this deployment':a.cooldown>0?`Ready in ${Math.ceil(a.cooldown)}s`:`${a.cost} elixir · ${a.remaining} use${a.remaining===1?'':'s'}`})))));
  }

  _buildResult() {
    this.resTitle = h('h2', { class: 'result__title', id: 'ui-result-title' });
    this.resReason = h('p', { class: 'result__reason' });
    this.resYouStars = this._starRow('result-stars');
    this.resEnemyStars = this._starRow('result-stars');
    this.resEnemyName = h('span', { class: 'result-side__name' });
    this.resTrophyDelta = h('span', { class: 'result-trophy__delta' });
    this.resTrophyTotal = h('b', { class: 'result-trophy__total' });
    this.resStats = h('dl', { class: 'result-stats' });
    this.resAgain = h('button', {
      class: 'btn btn--gold', type: 'button', 'aria-label': 'Battle again',
      onclick: () => { if (this._screen !== 'result') return; this._sound('click'); this._emit('rematch'); },
    }, h('span', { class: 'btn__icon', html: icon('swords') }), h('span', { text: 'Battle again' }));
    const menuBtn = h('button', {
      class: 'btn btn--steel', type: 'button', 'aria-label': 'Back to menu',
      onclick: () => { if (this._screen !== 'result') return; this._sound('click'); this._emit('exitToMenu'); },
    }, h('span', { text: 'Menu' }));

    this.elResultCard = h('div', { class: 'result', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ui-result-title' },
      h('div', { class: 'result__crest', 'aria-hidden': 'true', html: icon('star') }),
      this.resTitle,
      this.resReason,
      h('div', { class: 'result-sides' },
        h('div', { class: 'result-side result-side--you' }, h('span', { class: 'result-side__name', text: 'You' }), this.resYouStars.el),
        h('div', { class: 'result-side__vs', text: 'vs' }),
        h('div', { class: 'result-side result-side--enemy' }, this.resEnemyName, this.resEnemyStars.el)),
      h('div', { class: 'result-trophy' },
        h('span', { class: 'result-trophy__icon', html: icon('trophy') }), this.resTrophyDelta, this.resTrophyTotal),
      this.resStats,
      h('div', { class: 'result__actions' }, menuBtn, this.resAgain));

    this.elResult = h('div', { class: 'scr scr-result', id: 'ui-result' },
      h('div', { class: 'result__rays', 'aria-hidden': 'true' }), this.elResultCard);
  }

  _buildPanels() {
    const base = { sound: (n) => this._sound(n), close: () => this.closePanel() };
    this.deckBuilder = new DeckBuilder({
      ...base,
      getDeck: () => this.state.deck,
      getTower: () => this.state.towerTroop || 'tower-princess',
      setTower: id => { this.state.towerTroop=id; this._emit('towerChange',id); },
      setDeck: (d) => this._setDeck(d),
      getThumbs: () => this.thumbs,
    });
    this.settingsPanel = new SettingsPanel({
      ...base,
      getSettings: () => this.state.settings,
      change: (s) => this._setSettings(s),
    });
    this.howtoPanel = new HowToPanel(base);
    this.panels = { deck: this.deckBuilder.el, settings: this.settingsPanel.el, howto: this.howtoPanel.el };
    const backdrop = h('div', {
      class: 'panel-backdrop',
      onclick: () => {
        if (!this.panelName || this.panelName === 'deck') return;
        this._sound('close');
        this.closePanel();
      },
    });
    this.elPanels = h('div', { class: 'panel-layer', 'aria-hidden': 'true' },
      backdrop, this.panels.deck, this.panels.settings, this.panels.howto);
  }

  _buildModal() {
    this._quitCancel = h('button', {
      class: 'btn btn--steel', type: 'button', 'aria-label': 'Keep fighting',
      onclick: () => { this._sound('close'); this._closeQuit(); },
    }, h('span', { text: 'Keep fighting' }));
    const ok = h('button', {
      class: 'btn btn--danger', type: 'button', 'aria-label': 'Surrender and leave the battle',
      onclick: () => {
        if (!this.modalOpen) return;
        this._sound('click');
        this._closeQuit();
        if (this._screen === 'battle') this._emit('surrender');
      },
    }, h('span', { class: 'btn__icon', html: icon('flag') }), h('span', { text: 'Surrender' }));
    this.elModal = h('div', { class: 'modal-layer', 'aria-hidden': 'true' },
      h('div', { class: 'modal-backdrop', onclick: () => { this._sound('close'); this._closeQuit(); } }),
      h('div', { class: 'modal', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'ui-quit-title', 'aria-describedby': 'ui-quit-desc' },
        h('div', { class: 'modal__icon', html: icon('flag') }),
        h('h2', { class: 'modal__title', id: 'ui-quit-title', text: 'Leave the battle?' }),
        h('p', { class: 'modal__text', id: 'ui-quit-desc', text: 'Surrendering counts as a defeat.' }),
        h('div', { class: 'modal__actions' }, this._quitCancel, ok)));
  }

  // ───────────────────────────── state ─────────────────────────────

  setThumbs(thumbs) {
    this.thumbs = sanitizeThumbs(thumbs);
    applyArtAll(this.root, this.thumbs);
  }

  setState(partial) {
    if (!partial || typeof partial !== 'object') return;
    const prevDeck = this.state.deck.join(',');
    this.state = normalizeState(partial, this.state);
    this._refreshMenu();
    this.settingsPanel.refresh();
    if (this.state.deck.join(',') !== prevDeck && this.panelName === 'deck') this.deckBuilder.render();
  }

  _setDeck(deck) {
    if (!isValidDeck(deck)) return false;
    this.state.deck = deck.slice();
    this._refreshMenu();
    this._emit('deckChange', deck.slice());
    return true;
  }

  _setSettings(s) {
    this.state.settings = normalizeSettings(s, this.state.settings);
    this.settingsPanel.refresh();
    this._emit('settingsChange', { ...this.state.settings });
  }

  _setDifficulty(d) {
    if (!DIFFICULTIES.includes(d) || d === this.state.difficulty) return;
    this.state.difficulty = d;
    this._sound('tab');
    this._refreshMenu();
    this._emit('difficultyChange', d);
  }

  _refreshMenu() {
    const s = this.state;
    this.trophyVal.textContent = formatNumber(s.trophies);
    DIFFICULTIES.forEach((d, i) => {
      const on = d === s.difficulty;
      this.diffBtns[d].classList.toggle('is-on', on);
      this.diffBtns[d].setAttribute('aria-checked', on ? 'true' : 'false');
      this.diffBtns[d].tabIndex = on ? 0 : -1;
      if (on) {
        this.diffSeg.style.setProperty('--i', String(i));
        this.diffSeg.dataset.value = d;
      }
    });
    const sig = s.deck.join(',');
    if (sig !== this._peekSig) {
      this._peekSig = sig;
      this.peekCards.replaceChildren(...s.deck.map((id) => createCard(id, 'mini', this.thumbs)));
      this.peekAvg.textContent = averageCost(s.deck).toFixed(1);
    }
  }

  // ───────────────────────────── screens ─────────────────────────────

  _screenEl(name) {
    return name === 'battle' ? this.elBattle : name === 'result' ? this.elResult : this.elMenu;
  }

  _setScreen(name) {
    if (name !== 'menu') this.closePanel();
    if (name !== 'battle') {
      this._closeQuit();
      this.clearBanners();
      this.hint(null);
    }
    if (name !== 'result') this._trophyToken++;
    this._screen = name;
    for (const n of SCREENS) {
      const el = this._screenEl(n);
      el.classList.toggle('is-active', n === name);
      el.setAttribute('aria-hidden', n === name ? 'false' : 'true');
    }
    this.moveDragProxy(null, 0, 0);
    this.root.dataset.screen = name;
    this._handRect = null;
  }

  hideBoot() {
    const boot = document.getElementById('boot');
    if (!boot || boot.dataset.hiding) return;
    boot.dataset.hiding = '1';
    boot.classList.add('hide');
    setTimeout(() => { try { boot.remove(); } catch { /* already gone */ } }, 650);
  }

  showMenu() {
    this._setScreen('menu');
    this._refreshMenu();
    if (this.state.firstRun && !this._howtoDone) {
      this._howtoDone = true;
      this.openPanel('howto');
    }
  }

  showBattle(info) {
    const i = info && typeof info === 'object' ? info : {};
    this.info = {
      playerName: str(i.playerName, 'You'),
      enemyName: str(i.enemyName, 'Rival'),
      enemyTitle: str(i.enemyTitle, ''),
    };
    this.enemyNameEl.textContent = this.info.enemyName;
    this.enemyTitleEl.textContent = this.info.enemyTitle;
    this.enemyTitleEl.hidden = !this.info.enemyTitle;
    this.youNameEl.textContent = this.info.playerName;
    this._resetBattleState();
    this._setScreen('battle');
  }

  showResult(res) {
    const r = res && typeof res === 'object' ? res : {};
    const outcome = r.outcome === 'win' || r.outcome === 'lose' ? r.outcome : 'draw';
    const stars = Array.isArray(r.stars) ? r.stars : [0, 0];

    for (const k of ['win', 'lose', 'draw']) this.elResult.classList.toggle(`outcome--${k}`, k === outcome);
    this.resTitle.textContent = OUTCOME_TITLE[outcome];
    this.resReason.textContent = reasonText(r.reason, outcome);
    this.resEnemyName.textContent = this.info.enemyName;
    this.resYouStars.n = -1;
    this.resEnemyStars.n = -1;
    this._setStarRow(this.resYouStars, stars[0], false);
    this._setStarRow(this.resEnemyStars, stars[1], false);

    const delta = Math.round(Number(r.trophiesDelta) || 0);
    const endRaw = Number(r.trophies);
    const end = Number.isFinite(endRaw) ? Math.max(0, Math.round(endRaw)) : this.state.trophies;
    this.state.trophies = end;
    this._refreshMenu();
    this.resTrophyDelta.textContent = formatDelta(delta);
    this.resTrophyDelta.classList.toggle('is-up', delta > 0);
    this.resTrophyDelta.classList.toggle('is-down', delta < 0);

    this.resStats.replaceChildren(...resultStatRows(r.stats).map((row) =>
      h('div', { class: `result-stat result-stat--${row.key}` }, h('dt', { text: row.label }), h('dd', { text: row.value }))));

    this._setScreen('result');
    this._countTrophies(Math.max(0, end - delta), end);
  }

  _countTrophies(from, to) {
    const token = ++this._trophyToken;
    const el = this.resTrophyTotal;
    if (from === to || reducedMotion() || typeof requestAnimationFrame !== 'function') {
      el.textContent = formatNumber(to);
      return;
    }
    el.textContent = formatNumber(from);
    const t0 = performance.now() + 900;
    const step = (now) => {
      if (token !== this._trophyToken) return;
      const k = Math.min(1, Math.max(0, (now - t0) / 800));
      const e = 1 - (1 - k) * (1 - k) * (1 - k);
      el.textContent = formatNumber(Math.round(from + (to - from) * e));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ───────────────────────────── panels ─────────────────────────────

  /** `ev` (optional): the click that opened it; keyboard activations move focus into the panel. */
  openPanel(name, ev) {
    if (!this.panels[name] || this._screen !== 'menu' || this.panelName === name) return;
    if (this.panelName) this.closePanel(true);
    this._sound('open');
    if (name === 'deck') this.deckBuilder.open();
    else if (name === 'settings') this.settingsPanel.refresh();
    for (const k of Object.keys(this.panels)) this.panels[k].classList.toggle('is-current', k === name);
    this.panelName = name;
    this.elPanels.dataset.panel = name;
    this.elPanels.classList.add('is-open');
    this.elPanels.setAttribute('aria-hidden', 'false');
    this.elMenu.classList.add('is-covered');
    if (ev && ev.detail === 0) {
      const first = this.panels[name].querySelector('.panel__head button');
      try { if (first) first.focus({ preventScroll: true }); } catch { /* ignore */ }
    }
  }

  closePanel(keepCover) {
    if (!this.panelName) return;
    if (this.panelName === 'deck') { this.deckBuilder.drag.cancel(); this.deckBuilder.closeDetail(true); this.deckBuilder.setPick(null); }
    this.panelName = null;
    this.elPanels.classList.remove('is-open');
    this.elPanels.setAttribute('aria-hidden', 'true');
    if (!keepCover) this.elMenu.classList.remove('is-covered');
    const active = document.activeElement;
    if (active && this.elPanels.contains(active)) { try { active.blur(); } catch { /* ignore */ } }
  }

  _openQuit(ev) {
    if (this._screen !== 'battle' || this.modalOpen) return;
    this.modalOpen = true;
    this._sound('open');
    this.elModal.classList.add('is-open');
    this.elModal.setAttribute('aria-hidden', 'false');
    if (ev && ev.detail === 0) { try { this._quitCancel.focus({ preventScroll: true }); } catch { /* ignore */ } }
  }

  _closeQuit() {
    if (!this.modalOpen) return;
    this.modalOpen = false;
    this.elModal.classList.remove('is-open');
    this.elModal.setAttribute('aria-hidden', 'true');
    const active = document.activeElement;
    if (active && this.elModal.contains(active)) { try { active.blur(); } catch { /* ignore */ } }
  }

  _onKey(ev) {
    if (ev.key !== 'Escape') return;
    if (this.modalOpen) { this._sound('close'); this._closeQuit(); return; }
    if (this.panelName) {
      if (this.panelName === 'deck' && this.deckBuilder.back()) return;
      this._sound('close');
      this.closePanel();
    }
  }

  _onPlay() {
    if (this._screen !== 'menu' || this.panelName) return;
    const now = performance.now();
    if (now < this._playLock) return;
    this._playLock = now + 800;
    this._sound('click');
    this._emit('play');
  }

  // ───────────────────────────── battle HUD ─────────────────────────────

  _resetBattleState() {
    for (const slot of this.slots) {
      if (slot.cardEl) slot.cardEl.remove();
      slot.cardEl = null;
      slot.id = null;
      slot.cost = 0;
      slot.poor = null;
      slot.fq = -1;
      for (const k of Object.keys(slot.timers)) clearTimeout(slot.timers[k]);
      slot.btn.className = 'hand-slot is-empty';
      slot.btn.setAttribute('aria-label', `Card ${this.slots.indexOf(slot) + 1}`);
    }
    this.nextWrap.replaceChildren();
    this._nextId = null;
    this._dealPending = true;
    this._aeVal = 0;
    this._aeQ = -1;
    this._aeN = -1;
    this._aeLit = -1;
    this._aeFull = null;
    this._tWhole = -1;
    this._tPhase = null;
    this._tUrgent = false;
    this.timerEl.className = 'hud-timer';
    this.timerEl.classList.remove('is-urgent');
    this.youStars.n = -1;
    this.enemyStars.n = -1;
    this._setStarRow(this.youStars, 0, false);
    this._setStarRow(this.enemyStars, 0, false);
    this._sel = null;
    this._drag = null;
    this.elBottom.classList.remove('has-selection');
    this.clearBanners();
    this.hint(null);
    this._closeQuit();
    this._handRect = null;
    this.setAether(0, MATCH.AETHER_MAX);
    this.setTimer(MATCH.REGULAR_TIME, 'regular');
  }

  _onCardDown(i, ev) {
    if (this._screen !== 'battle' || this.modalOpen || !this.slots[i].id) return;
    if (ev.cancelable) ev.preventDefault();
    const t = ev.currentTarget;
    try {
      if (t && t.hasPointerCapture && t.hasPointerCapture(ev.pointerId)) t.releasePointerCapture(ev.pointerId);
    } catch { /* not captured */ }
    this._emit('cardPointerDown', i, ev);
  }

  setHandCosts(costs, cycles) {
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      if (!slot.cardEl || (slot.cost === costs[i] && slot.cycle === cycles[i])) continue;
      if (slot.cost !== costs[i]) {
        slot.cost = costs[i];
        slot.cardEl.querySelector('.card__cost span').textContent = slot.cost;
        this._applyAfford(slot, false);
      }
      slot.cycle = cycles[i];
      let label = `Card ${i + 1}: ${CARD_BY_ID[slot.id].name}, ${slot.cost} elixir`;
      if (slot.cycle) {
        const ready = slot.cycle === 'READY';
        slot.cardEl.querySelector('.card__variant--evolution').textContent = ready ? '◆ EVOLVED' : `◇ ${slot.cycle}`;
        slot.cardEl.classList.toggle('is-evo-ready', ready);
        label += ready ? ', evolution ready' : `, ${slot.cycle} evolution cycles`;
      }
      slot.btn.setAttribute('aria-label', label);
    }
  }

  setHand(hand, next) {
    const arr = Array.isArray(hand) ? hand : [];
    const deal = this._dealPending;
    let dealt = 0;
    for (let i = 0; i < HAND; i++) {
      const slot = this.slots[i];
      const id = CARD_BY_ID[arr[i]] ? arr[i] : null;
      if (id === slot.id) continue;
      slot.id = id;
      slot.cycle = null;
      if (slot.cardEl) slot.cardEl.remove();
      slot.cardEl = null;
      slot.poor = null;
      slot.fq = -1;
      if (id) {
        const card = CARD_BY_ID[id];
        slot.cost = card.cost;
        slot.cardEl = createCard(id, 'hand', this.thumbs);
        // The charge overlay lives inside the frame so the cost gem stays readable above it.
        slot.cardEl.firstChild.appendChild(slot.charge);
        slot.lift.appendChild(slot.cardEl);
        slot.btn.classList.remove('is-empty');
        slot.btn.setAttribute('aria-label', `Card ${i + 1}: ${card.name}, ${card.cost} elixir`);
        if (deal) {
          slot.cardEl.style.setProperty('--d', String(dealt++));
          slot.cardEl.classList.add('is-dealt');
        } else {
          this._slideFromNext(slot);
        }
      } else {
        slot.cost = 0;
        slot.btn.classList.add('is-empty');
        slot.btn.classList.remove('is-poor');
        slot.btn.setAttribute('aria-label', `Card ${i + 1}: empty`);
      }
      this._applyAfford(slot, false);
    }
    this._dealPending = false;

    const nid = CARD_BY_ID[next] ? next : null;
    if (nid !== this._nextId) {
      this._nextId = nid;
      if (nid) {
        this.nextWrap.replaceChildren(createCard(nid, 'next', this.thumbs));
        if (!deal) retrigger(this.nextWrap, 'is-pop');
      } else {
        this.nextWrap.replaceChildren();
      }
    }
  }

  _slideFromNext(slot) {
    const el = slot.cardEl;
    const a = this.nextWrap.getBoundingClientRect();
    const b = slot.btn.getBoundingClientRect();
    if (!a.width || !b.width) return;
    const dx = (a.left + a.width / 2) - (b.left + b.width / 2);
    const dy = (a.top + a.height / 2) - (b.top + b.height / 2);
    el.style.setProperty('--fx', `${dx.toFixed(1)}px`);
    el.style.setProperty('--fy', `${dy.toFixed(1)}px`);
    el.style.setProperty('--fs', (a.width / b.width).toFixed(3));
    el.classList.add('is-entering');
  }

  _applyAfford(slot, glint) {
    if (!slot.id) {
      slot.poor = false;
      return;
    }
    const v = this._aeVal;
    const poor = v < slot.cost - 1e-6;
    if (poor !== slot.poor) {
      const wasPoor = slot.poor === true;
      slot.poor = poor;
      slot.btn.classList.toggle('is-poor', poor);
      if (!poor && wasPoor && glint) retrigger(slot.btn, 'is-ready');
      if (!poor) slot.fq = -1;
    }
    if (poor) {
      let fq = Math.floor((v / slot.cost) * CHARGE_STEPS);
      fq = fq < 0 ? 0 : fq > CHARGE_STEPS ? CHARGE_STEPS : fq;
      if (fq !== slot.fq) {
        slot.fq = fq;
        slot.fill.style.transform = CHARGE_TF[fq];
      }
    }
  }

  setAether(value, max) {
    const m = Number.isFinite(max) && max > 0 ? max : MATCH.AETHER_MAX;
    let v = Number(value);
    if (!Number.isFinite(v)) v = 0;
    v = v < 0 ? 0 : v > m ? m : v;
    this._aeVal = v;
    const q = Math.round((v / m) * FILL_STEPS);
    if (q !== this._aeQ) {
      this._aeQ = q;
      this.aeFill.style.transform = FILL_TF[q];
    }
    const n = Math.floor(v + 1e-6);
    if (n !== this._aeN) {
      this._aeN = n;
      this.aeNum.textContent = String(n);
      this.aeBar.setAttribute('aria-valuenow', String(n));
    }
    const lit = Math.min(SEGMENTS, Math.floor((v / m) * SEGMENTS + 1e-6));
    if (lit !== this._aeLit) {
      const prev = this._aeLit < 0 ? 0 : this._aeLit;
      for (let i = 0; i < SEGMENTS; i++) this.aeSegs[i].classList.toggle('is-lit', i < lit);
      if (lit > prev && this._aeLit >= 0 && lit > 0) retrigger(this.aeSegs[lit - 1], 'is-new');
      this._aeLit = lit;
    }
    const full = v >= m - 1e-6;
    if (full !== this._aeFull) {
      this._aeFull = full;
      this.aeBar.classList.toggle('is-full', full);
    }
    for (let i = 0; i < HAND; i++) this._applyAfford(this.slots[i], true);
  }

  setTimer(secondsLeft, phase) {
    const ph = PHASES.includes(phase) ? phase : 'regular';
    const n = Number(secondsLeft);
    const whole = Number.isFinite(n) && n > 0 ? Math.ceil(n - 1e-6) : 0;
    let dirty = false;
    if (whole !== this._tWhole) {
      this._tWhole = whole;
      this.timerValue.textContent = formatClock(whole);
      dirty = true;
    }
    if (ph !== this._tPhase) {
      const el = this.timerEl;
      if (this._tPhase) el.classList.remove(`phase--${this._tPhase}`);
      el.classList.add(`phase--${ph}`);
      this._tPhase = ph;
      this.timerLabel.textContent = PHASE_LABEL[ph];
      dirty = true;
    }
    if (dirty) {
      const urgent = whole <= 10 && (ph === 'surge' || ph === 'overtime');
      if (urgent !== this._tUrgent) {
        this._tUrgent = urgent;
        this.timerEl.classList.toggle('is-urgent', urgent);
      }
    }
  }

  setStars(you, enemy) {
    this._setStarRow(this.youStars, you, true);
    this._setStarRow(this.enemyStars, enemy, true);
  }

  setSelected(index) {
    const idx = toIndex(index);
    if (idx === this._sel) return;
    this._sel = idx;
    for (let i = 0; i < HAND; i++) this.slots[i].btn.classList.toggle('is-selected', i === idx);
    this.elBottom.classList.toggle('has-selection', idx !== null);
  }

  setDragging(index) {
    const idx = toIndex(index);
    if (idx === this._drag) return;
    this._drag = idx;
    for (let i = 0; i < HAND; i++) this.slots[i].btn.classList.toggle('is-dragging', i === idx);
  }

  moveDragProxy(cardId, clientX, clientY) {
    if (!cardId || !CARD_BY_ID[cardId] || this._screen !== 'battle') {
      if (this._proxyOn) {
        this._proxyOn = false;
        this.elProxy.classList.remove('is-on');
      }
      return;
    }
    if (cardId !== this._proxyId) {
      this._proxyId = cardId;
      this.elProxy.replaceChildren(createCard(cardId, 'proxy', this.thumbs));
    }
    const x = Number.isFinite(clientX) ? clientX : 0;
    const y = Number.isFinite(clientY) ? clientY : 0;
    this.elProxy.style.transform = `translate3d(${x}px,${y}px,0)`;
    if (!this._proxyOn) {
      this._proxyOn = true;
      this.elProxy.classList.add('is-on');
    }
  }

  flashCard(handIndex, kind) {
    const i = toIndex(handIndex);
    if (i === null) return;
    const slot = this.slots[i];
    const cls = kind === 'denied' ? 'is-denied' : kind === 'played' ? 'is-played' : null;
    if (!cls) return;
    retrigger(slot.btn, cls);
    clearTimeout(slot.timers[cls]);
    slot.timers[cls] = setTimeout(() => slot.btn.classList.remove(cls), cls === 'is-denied' ? 520 : 600);
  }

  // ───────────────────────────── banners & hints ─────────────────────────────

  banner(text, opts) {
    if (text === null || text === undefined || text === '') return;
    const o = opts && typeof opts === 'object' ? opts : {};
    const dur = Number(o.duration);
    const item = {
      text: String(text),
      sub: o.sub ? String(o.sub) : '',
      kind: BANNER_KINDS.has(o.kind) ? o.kind : 'info',
      duration: Number.isFinite(dur) && dur > 0 ? Math.min(8, Math.max(0.6, dur)) : 2.2,
    };
    this._bannerQueue.push(item);
    if (this._bannerQueue.length > 3) this._bannerQueue.splice(0, this._bannerQueue.length - 3);
    if (!this._bannerCur && !this._bannerGap) this._nextBanner();
    else if (this._bannerCur) this._hurryBanner();
  }

  _nextBanner() {
    this._bannerGap = 0;
    const item = this._bannerQueue.shift();
    if (!item) { this._bannerCur = null; return; }
    const el = h('div', { class: `banner banner--${item.kind}` },
      h('div', { class: 'banner__ribbon' },
        h('div', { class: 'banner__text', text: item.text }),
        item.sub ? h('div', { class: 'banner__sub', text: item.sub }) : null));
    this.bannerLayer.appendChild(el);
    const cur = { el, start: performance.now(), timer: 0 };
    cur.timer = setTimeout(() => this._endBanner(cur), item.duration * 1000);
    this._bannerCur = cur;
    if (this._bannerQueue.length) this._hurryBanner();
  }

  _hurryBanner() {
    const cur = this._bannerCur;
    if (!cur) return;
    const shown = performance.now() - cur.start;
    clearTimeout(cur.timer);
    cur.timer = setTimeout(() => this._endBanner(cur), Math.max(0, 800 - shown));
  }

  _endBanner(cur) {
    if (this._bannerCur !== cur) return;
    clearTimeout(cur.timer);
    this._bannerCur = null;
    cur.el.classList.add('is-out');
    setTimeout(() => cur.el.remove(), 280);
    this._bannerGap = setTimeout(() => this._nextBanner(), 140);
  }

  clearBanners() {
    if (this._bannerCur) clearTimeout(this._bannerCur.timer);
    clearTimeout(this._bannerGap);
    this._bannerGap = 0;
    this._bannerCur = null;
    this._bannerQueue.length = 0;
    if (this.bannerLayer) this.bannerLayer.replaceChildren();
  }

  hint(text) {
    const t = text === null || text === undefined ? '' : String(text);
    if (t === this._hintText) return;
    this._hintText = t;
    if (t) this.elHint.textContent = t;
    this.elHint.classList.toggle('is-on', !!t);
  }

  // ───────────────────────────── layout queries ─────────────────────────────

  getInsets() {
    if (this._screen !== 'battle') return { top: 0, bottom: 0 };
    const H = this.root.clientHeight || window.innerHeight || 0;
    const top = this.elTop.offsetTop + this.elTop.offsetHeight;
    const bottom = this.elBottom.offsetHeight > 0 ? H - this.elBottom.offsetTop : 0;
    return { top: Math.max(0, Math.round(top)), bottom: Math.max(0, Math.round(bottom)) };
  }

  getHandRect() {
    if (this._handRect) return this._handRect;
    const el = this.elBottom;
    const base = this.root.getBoundingClientRect();
    const x = base.left + el.offsetLeft;
    const y = base.top + el.offsetTop;
    const w = el.offsetWidth;
    const hgt = el.offsetHeight;
    let rect;
    if (typeof DOMRect === 'function') rect = new DOMRect(x, y, w, hgt);
    else rect = { x, y, width: w, height: hgt, left: x, top: y, right: x + w, bottom: y + hgt };
    if (this._screen === 'battle' && hgt > 0) this._handRect = rect;
    return rect;
  }
}
