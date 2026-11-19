// Aether Spires — shared constants and pure helpers.
// This module must stay free of DOM and three.js imports: it is shared by the
// simulation, the renderer, the UI and the Node test-suite.

/** Fixed simulation step in seconds. The renderer interpolates between steps. */
export const SIM_DT = 1 / 30;

/**
 * World space: 1 unit = 1 tile. x runs left→right on screen, y is up, z runs toward the
 * player camera. Team 0 (the local player, "Azure") defends the +z half of the island;
 * team 1 ("Ember") defends the −z half.
 */
export const ARENA = Object.freeze({
  HALF_W: 9,            // playable x ∈ [−9, 9]
  HALF_L: 15,           // playable z ∈ [−15, 15]
  RIFT_HALF: 1,         // the aether rift (impassable for ground units) spans |z| < 1
  BRIDGE_X: 5,          // the two bridges are centred on x = −5 and x = +5
  BRIDGE_HALF_W: 1.25,  // walkable half-width of a bridge
  POCKET_DEPTH: 6.5,    // how far past the rift you may deploy once the enemy spire on that side fell
  FLY_HEIGHT: 2.4,      // altitude of flying units
  EDGE_MARGIN: 0.4,     // deploy points keep this distance from the arena edge
});

/**
 * Troops are drawn larger than their physical footprint so characters read clearly from the
 * battle camera. Visual only: the simulation never sees this.
 */
export const UNIT_VISUAL_SCALE = 1.3;

/** Tower slots. 'left' is the x < 0 side and 'right' the x > 0 side for BOTH teams (world sides). */
export const TOWER_SLOTS = Object.freeze(['left', 'right', 'citadel']);

const TOWER_LAYOUT = Object.freeze({
  left: Object.freeze({ x: -5, z: 8.5 }),
  right: Object.freeze({ x: 5, z: 8.5 }),
  citadel: Object.freeze({ x: 0, z: 12 }),
});

/** +1 for team 0 (owns the +z half), −1 for team 1. */
export function teamSign(team) { return team === 0 ? 1 : -1; }

export function enemyOf(team) { return team === 0 ? 1 : 0; }

/** Centre of a tower in world space. */
export function towerPosition(team, slot) {
  const p = TOWER_LAYOUT[slot];
  return { x: p.x, z: p.z * teamSign(team) };
}

export const MATCH = Object.freeze({
  REGULAR_TIME: 180,    // seconds of regulation
  SURGE_TIME: 60,       // the last 60 s of regulation are "Surge": aether flows faster
  OVERTIME: 60,         // sudden-death overtime if stars are tied
  AETHER_START: 5,
  AETHER_MAX: 10,
  AETHER_PERIOD: 2.8,   // seconds per 1 aether at normal rate
  SURGE_MULT: 2,
  OVERTIME_MULT: 2,
  HAND_SIZE: 4,
  DECK_SIZE: 8,
  DEPLOY_SNAP: 1,       // one deployment anchor per tile
  DEPLOY_TIME: 1.0,     // seconds before a deployed troop/building becomes active
  STARS_TO_WIN: 3,
});

/** Team palette (hex ints for three.js, css strings for the DOM). */
export const TEAMS = Object.freeze([
  Object.freeze({
    id: 0, name: 'Azure',
    main: 0x2f8fff, light: 0x9fd6ff, dark: 0x163f86, glow: 0x58d0ff, trim: 0xffcf5a,
    css: '#2f8fff', cssLight: '#9fd6ff', cssDark: '#163f86', cssGlow: '#58d0ff',
  }),
  Object.freeze({
    id: 1, name: 'Ember',
    main: 0xff5533, light: 0xffb48c, dark: 0x8a2412, glow: 0xff9a3d, trim: 0x3a3340,
    css: '#ff5533', cssLight: '#ffb48c', cssDark: '#8a2412', cssGlow: '#ff9a3d',
  }),
]);

// ───────────────────────────── helpers ─────────────────────────────

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

export function snap(v, step = MATCH.DEPLOY_SNAP) { return Math.sign(v) * Math.round(Math.abs(v) / step) * step || 0; }

/** True when a ground unit at this x can stand inside the rift band, i.e. it is on a bridge. */
export function onBridge(x, pad = 0) {
  return Math.abs(Math.abs(x) - ARENA.BRIDGE_X) <= ARENA.BRIDGE_HALF_W - pad;
}

/** True when (x, z) lies in the rift band and is not on a bridge. */
export function inRift(x, z, pad = 0) {
  return Math.abs(z) < ARENA.RIFT_HALF + pad && !onBridge(x);
}

function zRect(x0, x1, za, zb) {
  return { x0, x1, z0: Math.min(za, zb), z1: Math.max(za, zb) };
}

/**
 * Rectangles (world space, {x0, x1, z0, z1} with x0 < x1 and z0 < z1) in which `team` may
 * deploy troops and buildings. `enemySpires` says whether the ENEMY spire on the world-left
 * (x < 0) / world-right (x > 0) side is still standing; each fallen spire opens a forward
 * pocket on that side of the enemy half.
 */
export function deployRects(team, enemySpires = { left: true, right: true }) {
  const s = teamSign(team);
  const { HALF_W, HALF_L, RIFT_HALF, POCKET_DEPTH } = ARENA;
  const rects = [zRect(-HALF_W, HALF_W, s * RIFT_HALF, s * HALF_L)];
  if (!enemySpires.left) rects.push(zRect(-HALF_W, 0, -s * RIFT_HALF, -s * (RIFT_HALF + POCKET_DEPTH)));
  if (!enemySpires.right) rects.push(zRect(0, HALF_W, -s * RIFT_HALF, -s * (RIFT_HALF + POCKET_DEPTH)));
  return rects;
}

export function pointInRects(x, z, rects, margin = 0) {
  for (const r of rects) {
    if (x >= r.x0 + margin && x <= r.x1 - margin && z >= r.z0 + margin && z <= r.z1 - margin) return true;
  }
  return false;
}

/** Nearest point to (x, z) that lies inside one of the rectangles (each shrunk by `margin`). */
export function clampToRects(x, z, rects, margin = 0) {
  let best = null;
  let bestD = Infinity;
  for (const r of rects) {
    const cx = clamp(x, r.x0 + margin, r.x1 - margin);
    const cz = clamp(z, r.z0 + margin, r.z1 - margin);
    const d = (cx - x) * (cx - x) + (cz - z) * (cz - z);
    if (d < bestD) { bestD = d; best = { x: cx, z: cz }; }
  }
  return best ?? { x, z };
}

/**
 * Spawn offsets for a card that deploys `count` units, relative to the deploy point, laid out
 * for team 0 (−z is "forward"). The simulation negates x and z for team 1. The deploy ghost
 * uses the same offsets, so what you see is where units land.
 */
export function formationOffsets(count) {
  if (count <= 1) return [{ x: 0, z: 0 }];
  if (count === 2) return [{ x: -0.6, z: 0 }, { x: 0.6, z: 0 }];
  if (count === 3) return [{ x: 0, z: -0.55 }, { x: -0.62, z: 0.45 }, { x: 0.62, z: 0.45 }];
  const out = [];
  const GOLDEN_ANGLE = 2.399963229728653;
  for (let i = 0; i < count; i++) {
    const r = 0.42 * Math.sqrt(i + 0.35);
    const a = i * GOLDEN_ANGLE;
    out.push({ x: Math.cos(a) * r, z: Math.sin(a) * r });
  }
  return out;
}
