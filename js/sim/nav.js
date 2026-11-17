// Pure geometry helpers for ground navigation around the aether rift.

import { ARENA, inRift } from '../config.js';

export const RH = ARENA.RIFT_HALF;
const BX = ARENA.BRIDGE_X;

/** Lateral play a ground unit of radius r gets on a bridge (always <= BRIDGE_HALF_W). */
export function laneHalf(r) {
  const w = ARENA.BRIDGE_HALF_W - 0.6 * r;
  return w > 0.25 ? w : 0.25;
}

/** Centre x of the bridge nearest to x. */
export function bridgeX(x) { return x < 0 ? -BX : BX; }

/** z strictly inside the rift band. */
export function inBand(z) { return z > -RH && z < RH; }

/** x lies on a bridge's walkable lane for a unit of radius r. */
export function onLane(x, r) {
  const d = Math.abs(x) - BX;
  return (d < 0 ? -d : d) <= laneHalf(r);
}

/** +1 north bank (team 0 half), -1 south bank, 0 inside the band. */
export function sideOf(z) { return z >= RH ? 1 : z <= -RH ? -1 : 0; }

/** True when the straight segment crosses the rift band off a bridge. */
export function segmentCrossesRift(x0, z0, x1, z1) {
  const s0 = sideOf(z0);
  const s1 = sideOf(z1);
  if (s0 !== 0 && s0 === s1) return false;
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len = Math.sqrt(dx * dx + dz * dz);
  const n = Math.max(2, Math.ceil(len / 0.2));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (inRift(x0 + dx * t, z0 + dz * t)) return true;
  }
  return false;
}

/** Shortest signed angle from a to b in (-PI, PI]. */
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  else if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

export function wrapAngle(a) {
  a %= Math.PI * 2;
  if (a > Math.PI) a -= Math.PI * 2;
  else if (a <= -Math.PI) a += Math.PI * 2;
  return a;
}
