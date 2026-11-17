// DOM-free helpers for the UI: formatting, deck editing, sorting and state normalisation.
// Kept free of `document` so they can be exercised from Node.
import { MATCH } from '../config.js';
import { CARDS, CARD_BY_ID, DEFAULT_DECK, isValidDeck } from '../data/cards.js';

export const TYPE_LABEL = Object.freeze({ troop: 'Troop', spell: 'Spell', building: 'Building' });
export const RARITY_LABEL = Object.freeze({ common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' });
export const RARITY_ORDER = Object.freeze({ common: 0, rare: 1, epic: 2, legendary: 3 });
export const DIFFICULTIES = Object.freeze(['easy', 'normal', 'hard']);
export const QUALITIES = Object.freeze(['low', 'medium', 'high']);
export const PHASES = Object.freeze(['regular', 'surge', 'overtime', 'ended']);
export const FILTERS = Object.freeze(['all', 'troop', 'spell', 'building']);

export function clampNum(v, lo, hi) {
  const n = Number(v);
  if (!Number.isFinite(n)) return lo;
  return n < lo ? lo : n > hi ? hi : n;
}

/** m:ss for a number of seconds (rounded up so "0:00" only shows when time is really up). */
export function formatClock(seconds) {
  const n = Number(seconds);
  const s = Number.isFinite(n) && n > 0 ? Math.ceil(n - 1e-6) : 0;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m + (r < 10 ? ':0' : ':') + r;
}

export function formatNumber(v) {
  const n = Math.round(Number(v) || 0);
  const sign = n < 0 ? '-' : '';
  return sign + String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function formatDelta(v) {
  const n = Math.round(Number(v) || 0);
  return (n > 0 ? '+' : n < 0 ? '−' : '±') + formatNumber(Math.abs(n));
}

export function cardInitial(card) {
  const name = (card && card.name) || '?';
  return name.trim().charAt(0).toUpperCase() || '?';
}

/** Collection order for the deck builder. `filter`: all | troop | spell | building; `sort`: cost-asc | cost-desc. */
export function filterAndSort(cards, filter = 'all', sort = 'cost-asc') {
  const list = (cards || CARDS).filter((c) => filter === 'all' || c.type === filter);
  const dir = sort === 'cost-desc' ? -1 : 1;
  const index = new Map(list.map((c, i) => [c.id, i]));
  list.sort((a, b) => (a.cost - b.cost) * dir
    || (RARITY_ORDER[a.rarity] ?? 0) - (RARITY_ORDER[b.rarity] ?? 0)
    || index.get(a.id) - index.get(b.id));
  return list;
}

/**
 * Put `cardId` into deck slot `slot`. When the card already sits in another slot the two slots
 * swap, so the deck always stays 8 distinct cards. Returns the new deck, or null for no-ops and
 * anything that would not be a valid deck.
 */
export function replaceInDeck(deck, slot, cardId) {
  if (!Array.isArray(deck) || !CARD_BY_ID[cardId]) return null;
  if (!Number.isInteger(slot) || slot < 0 || slot >= deck.length) return null;
  const cur = deck.indexOf(cardId);
  if (cur === slot) return null;
  const next = deck.slice();
  if (cur >= 0) next[cur] = next[slot];
  next[slot] = cardId;
  return isValidDeck(next) ? next : null;
}

export function swapSlots(deck, a, b) {
  if (!Array.isArray(deck) || a === b) return null;
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a >= deck.length || b >= deck.length) return null;
  const next = deck.slice();
  next[a] = deck[b];
  next[b] = deck[a];
  return isValidDeck(next) ? next : null;
}

export function normalizeSettings(s, base) {
  const out = { quality: 'medium', sfx: true, music: true, ...(base || {}) };
  if (s && typeof s === 'object') {
    if (QUALITIES.includes(s.quality)) out.quality = s.quality;
    if (typeof s.sfx === 'boolean') out.sfx = s.sfx;
    if (typeof s.music === 'boolean') out.music = s.music;
  }
  return out;
}

/** A defensive copy of the UI-relevant part of the game state. */
export function normalizeState(s, base) {
  const prev = base || {
    deck: [...DEFAULT_DECK], trophies: 0, difficulty: 'normal',
    settings: normalizeSettings(null), firstRun: false,
  };
  const out = { ...prev, deck: prev.deck.slice(), settings: { ...prev.settings } };
  if (!s || typeof s !== 'object') return out;
  if (isValidDeck(s.deck)) out.deck = s.deck.slice();
  if (Number.isFinite(Number(s.trophies)) && s.trophies !== null && s.trophies !== '') out.trophies = Math.max(0, Math.round(Number(s.trophies)));
  if (DIFFICULTIES.includes(s.difficulty)) out.difficulty = s.difficulty;
  if (s.settings) out.settings = normalizeSettings(s.settings, out.settings);
  if (typeof s.firstRun === 'boolean') out.firstRun = s.firstRun;
  return out;
}

const REASONS = {
  citadel: { win: 'Their King Tower has fallen', lose: 'Your King Tower has fallen', draw: 'Both King Towers fell' },
  surrender: { win: 'Your rival withdrew', lose: 'You left the battle', draw: 'The battle was abandoned' },
  stars: { win: 'More Princess Towers toppled at the bell', lose: 'They toppled more Princess Towers', draw: 'Neither side broke through' },
  time: { win: 'More Princess Towers toppled at the bell', lose: 'They toppled more Princess Towers', draw: 'Neither side broke through' },
  timeout: { win: 'More Princess Towers toppled at the bell', lose: 'They toppled more Princess Towers', draw: 'Neither side broke through' },
  overtime: { win: 'Sudden-death strike!', lose: 'Struck down in overtime', draw: 'Overtime ran dry' },
  suddenDeath: { win: 'Sudden-death strike!', lose: 'Struck down in overtime', draw: 'Overtime ran dry' },
  health: { win: 'Your towers stood stronger', lose: 'Their towers stood stronger', draw: 'Perfectly matched' },
  tiebreak: { win: 'Your towers stood stronger', lose: 'Their towers stood stronger', draw: 'Perfectly matched' },
};
const DEFAULT_REASON = { win: 'The skies are yours, commander', lose: 'Regroup and fly again', draw: 'An even match' };

/** A short human sentence for the result screen. Unknown codes fall back to a generic line. */
export function reasonText(reason, outcome) {
  const o = outcome === 'win' || outcome === 'lose' ? outcome : 'draw';
  if (typeof reason === 'string' && REASONS[reason]) return REASONS[reason][o];
  if (typeof reason === 'string' && /\s/.test(reason.trim()) && reason.length <= 80) return reason.trim();
  return DEFAULT_REASON[o];
}

const STAT_ROWS = [
  ['damageDealt', 'Damage dealt'],
  ['towerDamage', 'Tower damage'],
  ['cardsPlayed', 'Cards played'],
  ['aetherSpent', 'Elixir spent'],
];

export function resultStatRows(stats) {
  const s = stats && typeof stats === 'object' ? stats : {};
  return STAT_ROWS.map(([key, label]) => ({ key, label, value: formatNumber(Number.isFinite(Number(s[key])) ? s[key] : 0) }));
}

/** Splits "Charge: after 2.5 tiles ..." into { head: 'Charge', body: 'after 2.5 tiles ...' }. */
export function splitAbility(sentence) {
  const s = String(sentence || '');
  const i = s.indexOf(':');
  if (i > 0 && i < 18) return { head: s.slice(0, i), body: s.slice(i + 1).trim() };
  return { head: '', body: s };
}

export const HAND_SIZE = MATCH.HAND_SIZE;
export const DECK_SIZE = MATCH.DECK_SIZE;
