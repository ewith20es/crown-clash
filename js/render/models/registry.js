// Aether Spires — model registry. Model files register their builders here as a side effect of
// being imported; the factory looks them up by unit type / card id.

/** type → builder(team) → EntityView */
export const UNIT_BUILDERS = {};

export function registerUnit(type, builder) {
  UNIT_BUILDERS[type] = builder;
}

/** cardId → builder(team) → THREE.Object3D posed for a portrait (spell card art) */
export const ICON_BUILDERS = {};

export function registerIcon(cardId, builder) {
  ICON_BUILDERS[cardId] = builder;
}
