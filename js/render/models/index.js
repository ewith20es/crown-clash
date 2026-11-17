// Aether Spires — model factory: the public API of js/render/models/.
// Importing the model files registers their builders (side effects); everything without a real
// model falls back to kit.placeholderView().

import * as THREE from 'three';
import { ARENA, formationOffsets } from '../../config.js';
import { UNITS, CARD_BY_ID } from '../../data/cards.js';
import { UNIT_BUILDERS } from './registry.js';
import { placeholderView, material, IDLE_STATE } from './kit.js';
import { ruinView } from './structures.js';
import './units1.js';
import './units2.js';
import './units3.js';
import './royale.js';
import './royale-extra.js';

export { renderCardThumbs } from './thumbs.js';

/** EntityView for any UNITS type (placeholder when the type has no model). Never throws. */
export function createEntityView(type, team) {
  const t = team === 1 ? 1 : 0;
  const b = Object.prototype.hasOwnProperty.call(UNIT_BUILDERS, type) ? UNIT_BUILDERS[type] : null;
  if (b) {
    try {
      const v = b(t);
      if (v && v.root && typeof v.update === 'function') return v;
    } catch (e) {
      console.warn(`[models] ${type} failed to build; using a placeholder`, e);
    }
  }
  return placeholderView(type, t);
}

function ghostRoot(v, team) {
  if (typeof v.toGhost === 'function') return v.toGhost();
  const gm = material(team === 1 ? 'ghost1' : 'ghost0');
  v.root.traverse((o) => {
    if (o.isMesh) { o.material = gm; o.castShadow = false; o.receiveShadow = false; }
  });
  return v.root;
}

/** Translucent, static deploy preview of a card (an empty Group for spells or unknown ids). */
export function createGhostView(cardId, team) {
  const group = new THREE.Group();
  const card = CARD_BY_ID[cardId];
  if (!card || card.type === 'spell' || !card.unit) return group;
  const t = team === 1 ? 1 : 0;
  const sgn = t === 1 ? -1 : 1;
  const u = UNITS[card.unit];
  const offsets = card.type === 'building' ? [{ x: 0, z: 0 }] : formationOffsets(card.count || 1);
  for (const o of offsets) {
    try {
      const v = createEntityView(card.unit, t);
      v.update(0, IDLE_STATE);
      const root = ghostRoot(v, t);
      root.position.set(o.x * sgn, u && u.flying ? ARENA.FLY_HEIGHT : 0, o.z * sgn);
      root.rotation.y = t === 0 ? Math.PI : 0;
      group.add(root);
    } catch (e) {
      console.warn(`[models] ghost for ${cardId} failed`, e);
    }
  }
  return group;
}

/** Rubble left where a tower fell: type 'spire' | 'citadel'. */
export function createRuinView(type, team) {
  try {
    return ruinView(type === 'citadel' ? 'citadel' : 'spire', team === 1 ? 1 : 0);
  } catch (e) {
    console.warn('[models] ruin failed', e);
    return new THREE.Group();
  }
}

/** Types that have a real (non-placeholder) model. */
export function listModelTypes() {
  return Object.keys(UNIT_BUILDERS).filter((k) => Object.prototype.hasOwnProperty.call(UNITS, k));
}
