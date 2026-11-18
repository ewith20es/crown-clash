// The reusable card component. One markup for every size so art and frames stay consistent:
//   size: 'hand' | 'next' | 'slot' | 'coll' | 'detail' | 'mini' | 'proxy'
import { cardArtUrl } from '../data/royale-art.js';
import { CARD_BY_ID } from '../data/cards.js';
import { escapeHtml } from './dom.js';
import { cardInitial } from './format.js';

const SHOW_COUNT = new Set(['coll', 'detail', 'slot']);

/** Builds a card element. Unknown ids produce an empty placeholder card (never throws). */
export function createCard(cardId, size = 'coll', thumbs) {
  const card = CARD_BY_ID[cardId];
  const el = document.createElement('div');
  if (!card) {
    el.className = `card card--${size} card--empty`;
    el.innerHTML = '<div class="card__frame"><div class="card__art"></div></div>';
    return el;
  }
  const len = card.name.length;
  const fit = len > 13 ? ' card--xlong' : len > 10 ? ' card--long' : '';
  el.className = `card card--${size} card--${card.type} rarity--${card.rarity}${fit}`;
  el.dataset.card = card.id;
  const count = card.count > 1 && SHOW_COUNT.has(size) ? `<span class="card__count">×${card.count}</span>` : '';
  el.innerHTML = '<div class="card__frame">'
    + `<div class="card__art"><span class="card__initial">${escapeHtml(cardInitial(card))}</span>`
    + '<img class="card__img" alt="" draggable="false" decoding="async"></div>'
    + '<div class="card__shine"></div>'
    + (card.variant && card.variant !== 'base' ? `<span class="card__variant card__variant--${card.variant}">${card.variant === 'evolution' ? 'EVO' : 'HERO'}</span>` : '')
    + `${count}<div class="card__name">${escapeHtml(card.name)}</div>`
    + '</div>'
    + `<div class="card__cost" aria-hidden="true"><span>${card.cost}</span></div>`;
  applyCardArt(el, thumbs);
  return el;
}

/** (Re)apply the rendered thumbnail of a card element, falling back to the initial placeholder. */
export function applyCardArt(el, thumbs) {
  const id = el && el.dataset ? el.dataset.card : null;
  if (!id) return;
  const img = el.querySelector('.card__img');
  const art = el.querySelector('.card__art');
  if (!img || !art) return;
  const fallback = thumbs && typeof thumbs[id] === 'string' ? thumbs[id] : '';
  const url = cardArtUrl(id) || fallback;
  if (url) {
    if (img.getAttribute('src') !== url) {
      img.onerror = () => { if (fallback && img.src !== fallback) { img.src = fallback; } else { art.classList.remove('has-img'); img.removeAttribute('src'); } };
      img.src = url;
    }
    art.classList.add('has-img');
  } else {
    art.classList.remove('has-img');
    if (img.hasAttribute('src')) img.removeAttribute('src');
  }
}

/** Re-apply art to every card element below `root`. */
export function applyArtAll(root, thumbs) {
  if (!root) return;
  const list = root.querySelectorAll('.card[data-card]');
  for (let i = 0; i < list.length; i++) applyCardArt(list[i], thumbs);
}
