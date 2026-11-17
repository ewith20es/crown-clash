// Pure camera-fit maths (no three.js import, so it can be unit-checked in Node).
// Camera model: orbit around `look` at elevation `elev` (radians above the horizon) and
// azimuth 0, i.e. the camera sits on the +z side and looks toward −z.

export const BATTLE_FIT_BOX = Object.freeze({ x0: -12.5, x1: 12.5, y0: 0, y1: 5.6, z0: -16.5, z1: 16.2 });

const DEG = Math.PI / 180;

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Steeper on tall (portrait) bands, shallower on wide ones. */
export function battleElevation(bandAspect) {
  const t = smoothstep(0.55, 1.45, bandAspect);
  return (68 + (60 - 68) * t) * DEG;
}

const _box = { minX: 0, maxX: 0, minY: 0, maxY: 0, behind: false };

/**
 * Projects the 8 corners of `box` and returns their NDC bounds (shared scratch object).
 * `behind` is true when any corner is at or behind the near plane.
 */
export function projectBox(box, elev, dist, look, fovY, aspect, near = 0.5) {
  const se = Math.sin(elev);
  const ce = Math.cos(elev);
  const cx = look.x;
  const cy = look.y + dist * se;
  const cz = look.z + dist * ce;
  const ty = Math.tan(fovY / 2);
  const tx = ty * aspect;
  _box.minX = Infinity; _box.maxX = -Infinity; _box.minY = Infinity; _box.maxY = -Infinity; _box.behind = false;
  for (let i = 0; i < 8; i++) {
    const px = (i & 1) ? box.x1 : box.x0;
    const py = (i & 2) ? box.y1 : box.y0;
    const pz = (i & 4) ? box.z1 : box.z0;
    const vx = px - cx;
    const vy = py - cy;
    const vz = pz - cz;
    // right = (1,0,0), up = (0, ce, −se), forward = (0, −se, −ce)
    const xc = vx;
    const yc = vy * ce - vz * se;
    const zc = -vy * se - vz * ce;
    if (zc <= near) { _box.behind = true; continue; }
    const nx = xc / (zc * tx);
    const ny = yc / (zc * ty);
    if (nx < _box.minX) _box.minX = nx;
    if (nx > _box.maxX) _box.maxX = nx;
    if (ny < _box.minY) _box.minY = ny;
    if (ny > _box.maxY) _box.maxY = ny;
  }
  return _box;
}

/**
 * Battle camera fit. Returns { elev, dist, offsetY, bandW, bandH, fillW, fillH }:
 * place the camera at look + dist·(0, sin elev, cos elev) and apply
 * camera.setViewOffset(W, H, 0, offsetY, W, H) to centre the board in the band.
 */
export function fitBattle({
  width, height, top = 0, bottom = 0, pad = 8, fovDeg = 32,
  box = BATTLE_FIT_BOX, look = { x: 0, y: 0, z: 0 }, out = {},
}) {
  const W = Math.max(1, width || 1);
  const H = Math.max(1, height || 1);
  let t = Math.max(0, Number(top) || 0);
  let b = Math.max(0, Number(bottom) || 0);
  // Insets that leave (almost) nothing of the canvas are ignored rather than producing a
  // degenerate camera.
  if (H - t - b < Math.min(120, H * 0.35)) { t = 0; b = 0; }
  const bandW = Math.max(16, W - 2 * pad);
  const bandH = Math.max(16, H - t - b - 2 * pad);
  const elev = battleElevation(bandW / bandH);
  const fovY = fovDeg * DEG;
  const aspect = W / H;

  let lo = 2;
  let hi = 2000;
  for (let i = 0; i < 48; i++) {
    const mid = 0.5 * (lo + hi);
    const r = projectBox(box, elev, mid, look, fovY, aspect);
    const fits = !r.behind && (r.maxX - r.minX) * 0.5 * W <= bandW && (r.maxY - r.minY) * 0.5 * H <= bandH;
    if (fits) hi = mid; else lo = mid;
  }
  const dist = hi;
  const r = projectBox(box, elev, dist, look, fovY, aspect);
  const imgCenter = (1 - (r.maxY + r.minY) * 0.5) * 0.5 * H;  // px from the top
  const bandCenter = t + (H - t - b) * 0.5;
  out.elev = elev;
  out.dist = dist;
  out.offsetY = imgCenter - bandCenter;
  out.bandW = bandW;
  out.bandH = bandH;
  out.fillW = ((r.maxX - r.minX) * 0.5 * W) / bandW;
  out.fillH = ((r.maxY - r.minY) * 0.5 * H) / bandH;
  return out;
}

/** Menu orbit distance so a sphere of radius `r` stays roughly in frame. */
export function menuDistance(width, height, fovDeg, r = 17) {
  const aspect = Math.max(0.05, (width || 1) / Math.max(1, height || 1));
  const vHalf = (fovDeg * DEG) / 2;
  const hHalf = Math.atan(Math.tan(vHalf) * aspect);
  const d = r / Math.sin(Math.min(vHalf, hHalf));
  return Math.min(105, Math.max(42, d));
}
