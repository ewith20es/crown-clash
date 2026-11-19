// Aether Spires — model factory: the public API of js/render/models/.
// Importing the model files registers their builders (side effects); everything without a real
// model falls back to kit.placeholderView().

import * as THREE from 'three';
import { ARENA } from '../../config.js';
import { cardFormation } from '../../data/formations.js';
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

// Shared geometry keeps the special-form marker inexpensive, including on flying units
// and buildings that reuse a base rig. Ghost conversion also visits these meshes.
let specialRing, specialShard;
const specialMaterials = new Map();
function markSpecial(view, type) {
  const unit = UNITS[type];
  const kind = unit?.variant || (unit?.ability ? 'hero' : null);
  if (!kind) return view;
  if (!specialRing) {
    specialRing = new THREE.TorusGeometry(1, .025, 5, 32);
    specialRing.rotateX(Math.PI / 2);
    specialShard = new THREE.OctahedronGeometry(.08);
  }
  if (!specialMaterials.has(kind)) {
    const color = kind === 'evolution' ? 0xd879ff : 0xffd16a;
    specialMaterials.set(kind, new THREE.MeshBasicMaterial({ color, toneMapped: false }));
  }
  const aura = new THREE.Group(), mat = specialMaterials.get(kind);
  const radius = Math.max(.35, unit.radius * 1.15);
  const ring = new THREE.Mesh(specialRing, mat);
  ring.scale.setScalar(radius);
  ring.position.y = .08;
  aura.add(ring);
  for (let i = 0; i < 3; i++) {
    const shard = new THREE.Mesh(specialShard, mat);
    const angle = i * Math.PI * 2 / 3;
    shard.position.set(Math.cos(angle) * radius, .19, Math.sin(angle) * radius);
    shard.scale.y = 1.6;
    aura.add(shard);
  }
  view.root.add(aura);
  const update = view.update.bind(view);
  view.update = (dt, state = IDLE_STATE) => {
    update(dt, state);
    aura.rotation.y = state.time * .65;
    aura.position.y = Math.sin(state.time * 3) * .025;
  };
  return view;
}

/** EntityView for any UNITS type (placeholder when the type has no model). Never throws. */
export function createEntityView(type, team) {
  const t = team === 1 ? 1 : 0;
  const key = UNIT_BUILDERS[type] ? type : UNITS[type]?.model;
  const b = UNIT_BUILDERS[key];
  if (b) {
    try {
      const v = b(t);
      if (v && v.root && typeof v.update === 'function') return markSpecial(v, type);
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
export function createGhostView(cardOrId, team) {
  const group = new THREE.Group();
  const card = typeof cardOrId === 'string' ? CARD_BY_ID[cardOrId] : cardOrId;
  if (!card || card.type === 'spell' || !card.unit) return group;
  const t = team === 1 ? 1 : 0;
  for (const o of cardFormation(card, t, 0)) {
    try {
      const v = createEntityView(o.unit, t);
      v.update(0, IDLE_STATE);
      const root = ghostRoot(v, t);
      root.position.set(o.x, UNITS[o.unit].flying ? ARENA.FLY_HEIGHT : 0, o.z);
      root.rotation.y = t === 0 ? Math.PI : 0;
      group.add(root);
    } catch (e) {
      console.warn(`[models] ghost for ${card.id} failed`, e);
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
