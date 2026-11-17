// Aether Spires — model kit: palette, procedural geometry builder, shared materials, the view
// class every unit / structure is built on, and animation helpers.
//
// ═══════════════════════════════ QUICK REFERENCE ═══════════════════════════════
//
// SPACE      1 unit = 1 tile. A model faces local +Z, stands on y = 0, is centred on the origin.
//            Its own LEFT side is +X, its RIGHT side is −X.
// ROTATIONS  Euler XYZ in radians, exactly like Object3D.rotation.
//              rot.x > 0  pitches forward: the top tips toward +Z (nod, chop, lean in).
//                         A limb that hangs DOWN from its pivot swings BACK with rot.x > 0,
//                         so "raise the arm forward" is rot.x < 0 (−PI/2 = horizontal, −PI = up).
//              rot.y > 0  turns left (+Z toward +X).
//              rot.z > 0  rolls the top toward −X (the model's right).
//
// COLOURS    col(hex) shared THREE.Color (never mutate) · mix(a, b, t) · shade(c, k) → new Color
//            teamPalette(team) → { main, light, dark, glow, trim }      PAL.stone / sand / brass ...
//            Any colour argument may be a THREE.Color, a hex number or [r, g, b] (linear).
//
// MODEL      const def = defineModel(`warden:${team}`, (m) => {       // runs ONCE per key, cached
//              const torso = m.part('torso', { pivot: [0, 0.4, 0] }); // author in MODEL space;
//              torso.paint.sphere(0.3, pal.main, { at: [0, 0.8, 0] }); // geometry is re-based on the pivot
//              torso.metal.torus(0.3, 0.04, PAL.brass, { at: [0, 0.6, 0] });
//              torso.glow.box(0.2, 0.04, 0.05, pal.glow, { at: [0, 0.85, 0.28] });
//            });
//            m.part(name, { pivot, parent, cast, ownGlow, assemble, copy })
//              pivot     [x, y, z] in model space: the point the part rotates / scales about
//              parent    name of an earlier part (the part then follows it)
//              cast      false → the part casts no real shadow (default true)
//              ownGlow   true → the part's glow mesh gets a per-view material: view.glow[name]
//              assemble  [t0, t1] → buildings: the part pops in during that slice of deployFrac
//              copy      name of an earlier part whose geometry is reused (identical twin)
//            A part with no geometry is a pure pivot node. Each part owns up to three builders
//            (.paint / .metal / .glow), each of which becomes ONE mesh = one draw call.
//
// BUILDER    b.<primitive>(dims..., colour, opts)  — returns the builder (chainable)
//              sphere(r) · ball(rx, ry, rz) · box(w, h, d) [bevel] · cyl(rTop, rBottom, h) [seg, cap]
//              cone(r, h) tip up · capsule(r, len) [r2] total height len + 2r · limb(p0, p1, r0, r1)
//              torus(R, r) ring around Y [seg, tube, arc] · lathe([[r, y], ...bottom→top]) [seg, phase]
//              crystal(r, h) [sides, top, bottom, base] · rock(r) [detail, jitter, seed]
//              extrude([[x, y], ...], depth) outline in XY, thickness along Z [bevel]
//              tube([[x, y, z], ...], radius | [radii]) [sides]
//            common opts: at [x, y, z] · rot [rx, ry, rz] · scale n | [sx, sy, sz] · c2 (colour at the
//              primitive's bottom → vertical gradient) · bright (multiplier; > 1 on paint reads as
//              self-lit) · flat (faceted normals) · facet (bake facet shading, for glow crystals)
//            b.group({ at, rot, scale }, (b) => ...) nested transform · b.mirrorX((b, side) => ...)
//            b.ring(n, (b, i) => ..., phase) n copies around Y (author the copy at +Z)
//
// MATERIALS  'paint' matte, 'metal' polished (carries its own small environment map), 'glow' unlit and
//            boosted ×GLOW_BOOST so it blooms. All shared: material(kind). Never create materials
//            per unit; per-view tint / flash clones are pooled inside ModelView.
//
// VIEW       const v = unitView(type, team, def, { stride, deploy, hopHeight, shadow });
//              v.parts.<name>  Object3D at its pivot (rest position in part.userData.home)
//              v.body          Group for whole-body motion (bob, lean, lunge) — yours to animate
//              v.rig / v.root  kit-owned (deploy, hop, stun wobble) / caller-owned: never touch
//              v.glow.<part>   material of an ownGlow part: set .color.setScalar(k) to dim / flare
//              v.shade         1 = normal; < 1 darkens paint + metal (damage states)
//              v.animate = (dt, s, a) => { ... }   s = AnimState, a = v.anim { seed, walk, move }
//                a.walk  walk-cycle phase in radians, advanced by distance (2π per `stride` tiles)
//                a.move  0..1 smoothed "is moving" blend      a.seed  random phase per instance
//            The base handles: blob shadow, deploy ('drop' | 'rise' | 'none'), hop arc, flash(),
//            frozen / slowed / hasted tints, stun wobble, frozen = pose freeze, dispose().
//            update() must not allocate: keep scratch numbers on `a` or in closure variables.
//
// ANIMATION  swing(attackT, windup, hitSpeed) → −1 wind-back … +1 EXACTLY at windup … 0 recovered
//            pose(p, back, rest, strike) maps that onto three key values
//            buildUp(attackT, windup) 0→1 charging · impact(attackT, windup, dur) 1→0 after the hit
//            damp / dampAngle / wrapAngle / lerp / clamp01 / smoothstep / easeOutBack / easeOutCubic
//            walkLegs(a, legL, legR, swing, lift) biped leg cycle · aimLocal(view, s, cur, rate, dt)
//
// EXAMPLE    registerUnit('pebble', (team) => {
//              const def = defineModel(`pebble:${team}`, (m) => {
//                const pal = teamPalette(team);
//                const body = m.part('body', { pivot: [0, 0.3, 0] });
//                body.paint.rock(0.3, PAL.stone, { at: [0, 0.45, 0], seed: 3 });
//                body.paint.torus(0.3, 0.05, pal.main, { at: [0, 0.45, 0] });          // team sash
//                body.glow.sphere(0.05, pal.glow, { at: [0.1, 0.52, 0.26] });
//                body.glow.sphere(0.05, pal.glow, { at: [-0.1, 0.52, 0.26] });
//                const leg = m.part('legL', { pivot: [0.13, 0.3, 0], cast: false });
//                leg.paint.capsule(0.07, 0.16, PAL.rockDark, { at: [0.13, 0.15, 0] });
//                m.part('legR', { pivot: [-0.13, 0.3, 0], cast: false, copy: 'legL' });
//                const arm = m.part('arm', { pivot: [-0.3, 0.5, 0], parent: 'body' });
//                arm.paint.limb([-0.3, 0.5, 0], [-0.34, 0.75, 0.2], 0.07, 0.11, PAL.stoneDark);
//              });
//              const v = unitView('pebble', team, def, { stride: 0.6 });
//              const { body, legL, legR, arm } = v.parts;
//              v.animate = (dt, s, a) => {
//                walkLegs(a, legL, legR, 0.6, 0.05);
//                const p = swing(s.attackT, s.windup, s.hitSpeed);
//                body.position.y = body.userData.home.y + Math.abs(Math.cos(a.walk)) * 0.04 * a.move
//                  + Math.sin(s.time * 2 + a.seed) * 0.01;
//                body.rotation.x = pose(p, -0.15, 0.08 * a.move, 0.3);
//                arm.rotation.x = pose(p, -1.0, 0, 1.1);                 // chop: strike lands at windup
//              };
//              return v;
//            });
// ════════════════════════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { TEAMS } from '../../config.js';
import { UNITS } from '../../data/cards.js';

const TAU = Math.PI * 2;
const EPS = 1e-6;

/** Colour multiplier baked into every 'glow' vertex so glow parts bloom. */
export const GLOW_BOOST = 1.9;
/** Seconds a hit flash lasts. */
export const FLASH_TIME = 0.12;

const SHADOW_Y = 0.03;      // blob shadows hover this far above the ground plane
const DROP_HEIGHT = 3;      // troops drop in from this many tiles up

// ───────────────────────────── scalar helpers ─────────────────────────────

export function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function smoothstep(a, b, x) { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); }
export function easeOutCubic(x) { const u = 1 - clamp01(x); return 1 - u * u * u; }
export function easeInCubic(x) { const u = clamp01(x); return u * u * u; }
export function easeOutBack(x) { const u = clamp01(x) - 1; return 1 + u * u * (2.70158 * u + 1.70158); }
/** Frame-rate independent approach of `cur` toward `target` (rate ≈ 1 / time constant). */
export function damp(cur, target, rate, dt) { return cur + (target - cur) * (1 - Math.exp(-rate * dt)); }
export function wrapAngle(a) { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; }
export function dampAngle(cur, target, rate, dt) { return cur + wrapAngle(target - cur) * (1 - Math.exp(-rate * dt)); }

// ───────────────────────────── animation helpers ─────────────────────────────

/**
 * Attack curve. Returns −1..+1: 0 at rest, sinks to −1 (wind-back) over the first 60% of the
 * windup, then whips to +1 EXACTLY at attackT === windup and eases back to 0 during recovery.
 */
export function swing(attackT, windup, hitSpeed) {
  if (!(attackT >= 0)) return 0;
  const w = windup > 0.04 ? windup : 0.04;
  if (attackT < w) {
    const a = w * 0.6;
    if (attackT < a) { const u = 1 - attackT / a; return u * u - 1; }
    const u = (attackT - a) / (w - a);
    return 2 * u * u * u - 1;
  }
  let rec = ((hitSpeed > 0 ? hitSpeed : 1) - w) * 0.7;
  rec = rec < 0.14 ? 0.14 : rec > 0.5 ? 0.5 : rec;
  const u = (attackT - w) / rec;
  return u >= 1 ? 0 : 1 - u * u * (3 - 2 * u);
}

/** Maps a swing() value onto three key values: `back` at −1, `rest` at 0, `strike` at +1. */
export function pose(p, back, rest, strike) {
  return p < 0 ? rest + (rest - back) * p : rest + (strike - rest) * p;
}

/** 0 → 1 (ease-in) while the attack charges; 0 again once the blow has landed. */
export function buildUp(attackT, windup) {
  if (!(attackT >= 0) || attackT >= windup || !(windup > 0)) return 0;
  const u = attackT / windup;
  return u * u;
}

/** 1 at the moment the blow lands, decaying to 0 over `dur` seconds; 0 before the hit. */
export function impact(attackT, windup, dur = 0.25) {
  if (!(attackT >= windup)) return 0;
  const u = 1 - (attackT - windup) / dur;
  return u > 0 ? u * u : 0;
}

/** Biped leg cycle: swings two hip-pivoted legs in opposition and lifts the one moving forward. */
export function walkLegs(a, legL, legR, amp = 0.6, lift = 0.05) {
  const sn = Math.sin(a.walk), cs = Math.cos(a.walk), m = a.move;
  legL.rotation.x = -sn * amp * m;
  legR.rotation.x = sn * amp * m;
  legL.position.y = legL.userData.home.y + (cs > 0 ? cs : 0) * lift * m;
  legR.position.y = legR.userData.home.y + (cs < 0 ? -cs : 0) * lift * m;
}

/** Turret helper: damps `cur` toward the LOCAL yaw of s.aimYaw (or `rest` when there is no target). */
export function aimLocal(view, s, cur, rate, dt, rest = 0) {
  const target = (s.aimYaw === null || s.aimYaw === undefined || s.aimYaw !== s.aimYaw)
    ? rest : s.aimYaw - view.root.rotation.y;
  return dampAngle(cur, target, rate, dt);
}

/** Neutral AnimState (static poses for ghosts and card art). Treat as read-only. */
export const IDLE_STATE = Object.freeze({
  time: 0, state: 'idle', stateTime: 0, deployFrac: 1, moveSpeed: 0, attackT: -1, windup: 0.3, hitSpeed: 1,
  hpFrac: 1, frozen: false, stunned: false, slowed: false, hasted: false, active: true, aimYaw: null,
  lifeFrac: 1, charged: false, hop: 0, shieldFrac: 1, rampT: 0, beam: false,
});

// ───────────────────────────── colours ─────────────────────────────

const colorCache = new Map();
const WHITE = new THREE.Color(1, 1, 1);

/** Shared THREE.Color for a hex value. Do not mutate the result. */
export function col(hex) {
  let c = colorCache.get(hex);
  if (!c) { c = new THREE.Color(hex); colorCache.set(hex, c); }
  return c;
}

function rgbOf(c) {
  if (c && c.isColor) return c;
  if (typeof c === 'number') return col(c);
  if (Array.isArray(c)) return { r: c[0], g: c[1], b: c[2] };
  return WHITE;
}

/** New colour between a and b. */
export function mix(a, b, t) {
  const A = rgbOf(a), B = rgbOf(b);
  return new THREE.Color(A.r + (B.r - A.r) * t, A.g + (B.g - A.g) * t, A.b + (B.b - A.b) * t);
}

/** New colour scaled by k (k < 1 darker, k > 1 brighter; may exceed 1). */
export function shade(c, k) {
  const A = rgbOf(c);
  return new THREE.Color(A.r * k, A.g * k, A.b * k);
}

/** Shared neutrals. THREE.Color instances — never mutate. */
export const PAL = Object.freeze({
  stone: col(0x9aa0aa), stoneLight: col(0xc5cad2), stoneDark: col(0x626a78),
  sand: col(0xd8c08e), sandLight: col(0xf2e4bc), sandDark: col(0xa3865a),
  rock: col(0x6a6570), rockDark: col(0x3d3a46),
  iron: col(0x4b5060), ironDark: col(0x2b2e3a), steel: col(0xb4bfd0),
  brass: col(0xe0a83c), gold: col(0xffcf5a), copper: col(0xd0763c),
  wood: col(0x8e5c36), woodDark: col(0x5c3b25), leather: col(0x7a4e32),
  bone: col(0xf0e6cf), cloth: col(0xe9e1cf),
  leaf: col(0x6cc04a), moss: col(0x5a9a3c), mossDark: col(0x38672c),
  crystal: col(0xc8f2ff), white: col(0xffffff), black: col(0x14151b), eye: col(0x1b1d27),
});

const teamPalettes = [null, null];

/** { id, main, light, dark, glow, trim } as shared THREE.Colors for team 0 (Azure) / 1 (Ember). */
export function teamPalette(team) {
  const t = team === 1 ? 1 : 0;
  if (!teamPalettes[t]) {
    const T = TEAMS[t];
    teamPalettes[t] = Object.freeze({
      id: t, main: col(T.main), light: col(T.light), dark: col(T.dark), glow: col(T.glow), trim: col(T.trim),
    });
  }
  return teamPalettes[t];
}

// ───────────────────────────── affine maths (build time only) ─────────────────────────────
// 3×4 row-major matrices: [m00 m01 m02 tx  m10 m11 m12 ty  m20 m21 m22 tz]

const IDENT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];

function xfMatrix(o) {
  const at = o.at, rot = o.rot, sc = o.scale;
  let sx = 1, sy = 1, sz = 1;
  if (typeof sc === 'number') { sx = sy = sz = sc; } else if (sc) { sx = sc[0]; sy = sc[1]; sz = sc[2]; }
  let r00 = 1, r01 = 0, r02 = 0, r10 = 0, r11 = 1, r12 = 0, r20 = 0, r21 = 0, r22 = 1;
  if (rot) {
    // identical to THREE.Matrix4.makeRotationFromEuler with order 'XYZ'
    const a = Math.cos(rot[0]), b = Math.sin(rot[0]);
    const c = Math.cos(rot[1]), d = Math.sin(rot[1]);
    const e = Math.cos(rot[2]), f = Math.sin(rot[2]);
    r00 = c * e; r01 = -c * f; r02 = d;
    r10 = a * f + b * e * d; r11 = a * e - b * f * d; r12 = -b * c;
    r20 = b * f - a * e * d; r21 = b * e + a * f * d; r22 = a * c;
  }
  return [
    r00 * sx, r01 * sy, r02 * sz, at ? at[0] : 0,
    r10 * sx, r11 * sy, r12 * sz, at ? at[1] : 0,
    r20 * sx, r21 * sy, r22 * sz, at ? at[2] : 0,
  ];
}

function matMul(a, b) {
  return [
    a[0] * b[0] + a[1] * b[4] + a[2] * b[8], a[0] * b[1] + a[1] * b[5] + a[2] * b[9],
    a[0] * b[2] + a[1] * b[6] + a[2] * b[10], a[0] * b[3] + a[1] * b[7] + a[2] * b[11] + a[3],
    a[4] * b[0] + a[5] * b[4] + a[6] * b[8], a[4] * b[1] + a[5] * b[5] + a[6] * b[9],
    a[4] * b[2] + a[5] * b[6] + a[6] * b[10], a[4] * b[3] + a[5] * b[7] + a[6] * b[11] + a[7],
    a[8] * b[0] + a[9] * b[4] + a[10] * b[8], a[8] * b[1] + a[9] * b[5] + a[10] * b[9],
    a[8] * b[2] + a[9] * b[6] + a[10] * b[10], a[8] * b[3] + a[9] * b[7] + a[10] * b[11] + a[11],
  ];
}

function hasXf(o) { return !!o && (o.at !== undefined || o.rot !== undefined || o.scale !== undefined); }

function hash(i, seed) {
  const x = Math.sin(i * 127.1 + seed * 311.7 + 1.3) * 43758.5453;
  return x - Math.floor(x);
}

// ───────────────────────────── primitive generators ─────────────────────────────
// Each returns { P, N, I }: flat arrays of positions, normals and triangle indices (CCW outside).

/** Closes an existing loop of `n` vertices starting at index `ring` with a flat fan facing (nx, ny, nz). */
function capFan(P, N, I, ring, n, cx, cy, cz, nx, ny, nz) {
  const base = P.length / 3;
  P.push(cx, cy, cz); N.push(nx, ny, nz);
  for (let j = 0; j < n; j++) {
    const k = (ring + j) * 3;
    P.push(P[k], P[k + 1], P[k + 2]); N.push(nx, ny, nz);
  }
  let flip = false;
  for (let j = 0; j < n; j++) {
    const a = (base + 1 + j) * 3, b = (base + 1 + ((j + 1) % n)) * 3;
    const ux = P[a] - cx, uy = P[a + 1] - cy, uz = P[a + 2] - cz;
    const vx = P[b] - cx, vy = P[b + 1] - cy, vz = P[b + 2] - cz;
    const d = (uy * vz - uz * vy) * nx + (uz * vx - ux * vz) * ny + (ux * vy - uy * vx) * nz;
    if (Math.abs(d) > 1e-12) { flip = d < 0; break; }
  }
  for (let j = 0; j < n; j++) {
    const a = base + 1 + j, b = base + 1 + ((j + 1) % n);
    if (flip) I.push(base, b, a); else I.push(base, a, b);
  }
}

/**
 * Surface of revolution around Y. `profile` = [[r, y], ...] walked with the solid on the LEFT
 * (i.e. bottom → top for an ordinary outline). θ = 0 points to +Z. Repeat a point for a crease.
 */
function latheData(profile, seg, phase, caps) {
  const n = profile.length;
  const P = [], N = [], I = [];
  const nr = new Array(n), ny = new Array(n);
  for (let i = 0; i < n; i++) {
    let ax = 0, ay = 0;
    if (i > 0) {
      const dr = profile[i][0] - profile[i - 1][0], dy = profile[i][1] - profile[i - 1][1];
      const l = Math.hypot(dr, dy);
      if (l > 1e-9) { ax += dy / l; ay -= dr / l; }
    }
    if (i < n - 1) {
      const dr = profile[i + 1][0] - profile[i][0], dy = profile[i + 1][1] - profile[i][1];
      const l = Math.hypot(dr, dy);
      if (l > 1e-9) { ax += dy / l; ay -= dr / l; }
    }
    let l = Math.hypot(ax, ay);
    if (l < 1e-9) { ax = 1; ay = 0; l = 1; }
    ax /= l; ay /= l;
    // rounded poles get a clean axial normal; pointed tips (cones, crystals) keep their slope
    if ((i === 0 || i === n - 1) && profile[i][0] < EPS && Math.abs(ay) > 0.8) { ax = 0; ay = ay > 0 ? 1 : -1; }
    nr[i] = ax; ny[i] = ay;
  }
  for (let i = 0; i < n; i++) {
    const r = profile[i][0], y = profile[i][1];
    for (let j = 0; j < seg; j++) {
      const th = phase + (j / seg) * TAU, s = Math.sin(th), c = Math.cos(th);
      P.push(r * s, y, r * c);
      N.push(nr[i] * s, ny[i], nr[i] * c);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    const r0 = profile[i][0], r1 = profile[i + 1][0];
    if (r0 < EPS && r1 < EPS) continue;
    if (Math.abs(r0 - r1) < EPS && Math.abs(profile[i][1] - profile[i + 1][1]) < EPS) continue;
    for (let j = 0; j < seg; j++) {
      const j1 = (j + 1) % seg;
      const a = i * seg + j, b = i * seg + j1, c = (i + 1) * seg + j1, d = (i + 1) * seg + j;
      if (r0 >= EPS) I.push(a, b, c);
      if (r1 >= EPS) I.push(a, c, d);
    }
  }
  if (caps !== false) {
    if (profile[0][0] >= EPS) capFan(P, N, I, 0, seg, 0, profile[0][1], 0, 0, -1, 0);
    if (profile[n - 1][0] >= EPS) capFan(P, N, I, (n - 1) * seg, seg, 0, profile[n - 1][1], 0, 0, 1, 0);
  }
  return { P, N, I };
}

function sphereProfile(r, rings) {
  const p = [];
  for (let k = 0; k <= rings; k++) {
    const a = -Math.PI / 2 + (Math.PI * k) / rings;
    p.push([k === 0 || k === rings ? 0 : r * Math.cos(a), r * Math.sin(a)]);
  }
  return p;
}

function capsuleProfile(r0, r1, len, cs) {
  const p = [], h = len / 2;
  for (let k = 0; k <= cs; k++) {
    const a = -Math.PI / 2 + (Math.PI / 2) * (k / cs);
    p.push([k === 0 ? 0 : r0 * Math.cos(a), -h + r0 * Math.sin(a)]);
  }
  const first = len > EPS || Math.abs(r0 - r1) > EPS ? 0 : 1;
  for (let k = first; k <= cs; k++) {
    const a = (Math.PI / 2) * (k / cs);
    p.push([k === cs ? 0 : r1 * Math.cos(a), h + r1 * Math.sin(a)]);
  }
  return p;
}

const SIGNS = [-1, 1];
const FACE_LOOP = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

/** Box with chamfered edges whose vertex normals stay on the main faces → reads as rounded. */
function boxData(w, h, d, bevel) {
  const half = [w / 2, h / 2, d / 2];
  const bv = Math.max(0, Math.min(bevel, half[0] * 0.95, half[1] * 0.95, half[2] * 0.95));
  const P = new Array(72).fill(0), N = new Array(72).fill(0), I = [];
  const vid = (a, s) => a * 8 + (s[a] > 0 ? 4 : 0) + (s[(a + 1) % 3] > 0 ? 2 : 0) + (s[(a + 2) % 3] > 0 ? 1 : 0);
  for (let a = 0; a < 3; a++) {
    const b = (a + 1) % 3, c = (a + 2) % 3;
    for (const sa of SIGNS) for (const sb of SIGNS) for (const sc of SIGNS) {
      const s = [0, 0, 0]; s[a] = sa; s[b] = sb; s[c] = sc;
      const i = vid(a, s) * 3;
      P[i + a] = sa * half[a]; P[i + b] = sb * (half[b] - bv); P[i + c] = sc * (half[c] - bv);
      N[i + a] = sa;
    }
  }
  // the box is convex and centred: orient every triangle away from the origin
  const tri = (i0, i1, i2) => {
    const ax = P[i0 * 3], ay = P[i0 * 3 + 1], az = P[i0 * 3 + 2];
    const ux = P[i1 * 3] - ax, uy = P[i1 * 3 + 1] - ay, uz = P[i1 * 3 + 2] - az;
    const vx = P[i2 * 3] - ax, vy = P[i2 * 3 + 1] - ay, vz = P[i2 * 3 + 2] - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const out = nx * (ax + (ux + vx) / 3) + ny * (ay + (uy + vy) / 3) + nz * (az + (uz + vz) / 3);
    if (out >= 0) I.push(i0, i1, i2); else I.push(i0, i2, i1);
  };
  for (let a = 0; a < 3; a++) {
    const b = (a + 1) % 3, c = (a + 2) % 3;
    for (const sa of SIGNS) {
      const s = [0, 0, 0]; s[a] = sa;
      const q = [];
      for (const [sb, sc] of FACE_LOOP) { s[b] = sb; s[c] = sc; q.push(vid(a, s)); }
      tri(q[0], q[1], q[2]); tri(q[0], q[2], q[3]);
    }
  }
  if (bv > 0) {
    for (let c = 0; c < 3; c++) {
      const a = (c + 1) % 3, b = (c + 2) % 3;
      for (const sa of SIGNS) for (const sb of SIGNS) {
        const s = [0, 0, 0]; s[a] = sa; s[b] = sb;
        s[c] = -1; const a0 = vid(a, s), b0 = vid(b, s);
        s[c] = 1; const a1 = vid(a, s), b1 = vid(b, s);
        tri(a0, a1, b1); tri(a0, b1, b0);
      }
    }
    for (const sx of SIGNS) for (const sy of SIGNS) for (const sz of SIGNS) {
      const s = [sx, sy, sz];
      tri(vid(0, s), vid(1, s), vid(2, s));
    }
  }
  return { P, N, I };
}

/** Ring around the Y axis (lying in the XZ plane). arc < 2π leaves a capped opening starting at +Z. */
function torusData(R, r, seg, tube, arc) {
  const closed = arc >= TAU - 1e-4;
  const rows = closed ? seg : seg + 1;
  const P = [], N = [], I = [];
  for (let i = 0; i < rows; i++) {
    const th = (i / seg) * arc, sx = Math.sin(th), cz = Math.cos(th);
    for (let j = 0; j < tube; j++) {
      const ph = (j / tube) * TAU, c = Math.cos(ph), s = Math.sin(ph);
      P.push((R + r * c) * sx, r * s, (R + r * c) * cz);
      N.push(c * sx, s, c * cz);
    }
  }
  for (let i = 0; i < seg; i++) {
    const i1 = closed ? (i + 1) % seg : i + 1;
    for (let j = 0; j < tube; j++) {
      const j1 = (j + 1) % tube;
      const a = i * tube + j, b = i * tube + j1, c = i1 * tube + j1, d = i1 * tube + j;
      I.push(a, d, c, a, c, b);
    }
  }
  if (!closed) {
    capFan(P, N, I, 0, tube, 0, 0, R, -1, 0, 0);
    const th = arc;
    capFan(P, N, I, seg * tube, tube, R * Math.sin(th), 0, R * Math.cos(th), Math.cos(th), 0, -Math.sin(th));
  }
  return { P, N, I };
}

/** Circle swept along a polyline with a parallel-transport frame. `radii` = number or one per point. */
function tubeData(pts, radii, sides) {
  const n = pts.length;
  const P = [], N = [], I = [];
  let nx = 0, ny = 1, nz = 0;
  let t0x = 0, t0y = 0, t0z = 1, t1x = 0, t1y = 0, t1z = 1;
  const rad = (k) => (typeof radii === 'number' ? radii : radii[k < radii.length ? k : radii.length - 1]);
  for (let k = 0; k < n; k++) {
    const a = pts[k > 0 ? k - 1 : 0], b = pts[k < n - 1 ? k + 1 : n - 1];
    let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2];
    const tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl; ty /= tl; tz /= tl;
    if (k === 0) {
      if (Math.abs(ty) > 0.9) { nx = 1; ny = 0; nz = 0; } else { nx = 0; ny = 1; nz = 0; }
      t0x = tx; t0y = ty; t0z = tz;
    }
    const d = nx * tx + ny * ty + nz * tz;
    nx -= d * tx; ny -= d * ty; nz -= d * tz;
    let nl = Math.hypot(nx, ny, nz);
    if (nl < 1e-6) {
      // the frame collapsed onto the tangent (a 90° kink): pick any perpendicular
      if (Math.abs(ty) > 0.9) { nx = 1; ny = 0; nz = 0; } else { nx = 0; ny = 1; nz = 0; }
      const d2 = nx * tx + ny * ty + nz * tz;
      nx -= d2 * tx; ny -= d2 * ty; nz -= d2 * tz;
      nl = Math.hypot(nx, ny, nz) || 1;
    }
    nx /= nl; ny /= nl; nz /= nl;
    const bx = ty * nz - tz * ny, by = tz * nx - tx * nz, bz = tx * ny - ty * nx;
    const r = rad(k);
    for (let j = 0; j < sides; j++) {
      const ph = (j / sides) * TAU, c = Math.cos(ph), s = Math.sin(ph);
      const ux = c * nx + s * bx, uy = c * ny + s * by, uz = c * nz + s * bz;
      P.push(pts[k][0] + r * ux, pts[k][1] + r * uy, pts[k][2] + r * uz);
      N.push(ux, uy, uz);
    }
    t1x = tx; t1y = ty; t1z = tz;
  }
  for (let k = 0; k < n - 1; k++) {
    for (let j = 0; j < sides; j++) {
      const j1 = (j + 1) % sides;
      const a = k * sides + j, b = k * sides + j1, c = (k + 1) * sides + j1, d = (k + 1) * sides + j;
      I.push(a, b, c, a, c, d);
    }
  }
  if (rad(0) > EPS) capFan(P, N, I, 0, sides, pts[0][0], pts[0][1], pts[0][2], -t0x, -t0y, -t0z);
  if (rad(n - 1) > EPS) {
    capFan(P, N, I, (n - 1) * sides, sides, pts[n - 1][0], pts[n - 1][1], pts[n - 1][2], t1x, t1y, t1z);
  }
  return { P, N, I };
}

function pointInTri(p, a, b, c) {
  const d1 = (p[0] - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (p[1] - b[1]);
  const d2 = (p[0] - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (p[1] - c[1]);
  const d3 = (p[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (p[1] - a[1]);
  const neg = d1 < 0 || d2 < 0 || d3 < 0, posv = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && posv);
}

/** Ear clipping for a simple CCW polygon. Returns vertex-index triples. */
function triangulate(pts) {
  const idx = pts.map((_, i) => i);
  const out = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < 5000) {
    let clipped = false;
    for (let k = 0; k < idx.length; k++) {
      const i0 = idx[(k + idx.length - 1) % idx.length], i1 = idx[k], i2 = idx[(k + 1) % idx.length];
      const a = pts[i0], b = pts[i1], c = pts[i2];
      if ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) <= 1e-12) continue;
      let ear = true;
      for (let m = 0; m < idx.length; m++) {
        const im = idx[m];
        if (im !== i0 && im !== i1 && im !== i2 && pointInTri(pts[im], a, b, c)) { ear = false; break; }
      }
      if (!ear) continue;
      out.push(i0, i1, i2);
      idx.splice(k, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  for (let k = 1; k < idx.length - 1; k++) out.push(idx[0], idx[k], idx[k + 1]);
  return out;
}

/** 2-D outline in the XY plane, extruded along Z (centred). Optional bevel insets both caps. */
function extrudeData(outline, depth, bevel) {
  let pts = outline;
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  if (area < 0) pts = pts.slice().reverse();
  const n = pts.length, h = depth / 2;
  const tri = triangulate(pts);
  let cx = 0, cy = 0;
  for (let i = 0; i < n; i++) { cx += pts[i][0] / n; cy += pts[i][1] / n; }
  let meanR = 0;
  for (let i = 0; i < n; i++) meanR += Math.hypot(pts[i][0] - cx, pts[i][1] - cy) / n;
  const bv = Math.max(0, Math.min(bevel || 0, h * 0.95, meanR * 0.6));
  const k = bv > 0 && meanR > EPS ? 1 - bv / meanR : 1;
  const hs = h - bv;
  const P = [], N = [], I = [];
  for (let i = 0; i < n; i++) { P.push(cx + (pts[i][0] - cx) * k, cy + (pts[i][1] - cy) * k, h); N.push(0, 0, 1); }
  for (let t = 0; t < tri.length; t += 3) I.push(tri[t], tri[t + 1], tri[t + 2]);
  for (let i = 0; i < n; i++) { P.push(cx + (pts[i][0] - cx) * k, cy + (pts[i][1] - cy) * k, -h); N.push(0, 0, -1); }
  for (let t = 0; t < tri.length; t += 3) I.push(n + tri[t], n + tri[t + 2], n + tri[t + 1]);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    const ex = xj - xi, ey = yj - yi, el = Math.hypot(ex, ey);
    if (el < 1e-9) continue;
    const nx = ey / el, ny = -ex / el;
    let base = P.length / 3;
    P.push(xi, yi, hs, xj, yj, hs, xj, yj, -hs, xi, yi, -hs);
    N.push(nx, ny, 0, nx, ny, 0, nx, ny, 0, nx, ny, 0);
    I.push(base, base + 3, base + 2, base, base + 2, base + 1);
    if (bv > 0) {
      const ixi = cx + (xi - cx) * k, iyi = cy + (yi - cy) * k, ixj = cx + (xj - cx) * k, iyj = cy + (yj - cy) * k;
      // slanted strip normal: halfway between the side normal and the cap normal
      const sl = Math.SQRT1_2;
      base = P.length / 3;
      P.push(xi, yi, hs, xj, yj, hs, ixj, iyj, h, ixi, iyi, h);
      N.push(nx * sl, ny * sl, sl, nx * sl, ny * sl, sl, nx * sl, ny * sl, sl, nx * sl, ny * sl, sl);
      I.push(base, base + 1, base + 2, base, base + 2, base + 3);
      base = P.length / 3;
      P.push(xi, yi, -hs, xj, yj, -hs, ixj, iyj, -h, ixi, iyi, -h);
      N.push(nx * sl, ny * sl, -sl, nx * sl, ny * sl, -sl, nx * sl, ny * sl, -sl, nx * sl, ny * sl, -sl);
      I.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
  }
  return { P, N, I };
}

const icoCache = {};

/** Unit icosphere: detail 0 = 20 faces, 1 = 80, 2 = 320. */
function icoData(detail) {
  if (icoCache[detail]) return icoCache[detail];
  const t = (1 + Math.sqrt(5)) / 2;
  const V = [-1, t, 0, 1, t, 0, -1, -t, 0, 1, -t, 0, 0, -1, t, 0, 1, t, 0, -1, -t, 0, 1, -t,
    t, 0, -1, t, 0, 1, -t, 0, -1, -t, 0, 1];
  let F = [0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8,
    3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1];
  for (let i = 0; i < V.length; i += 3) {
    const l = Math.hypot(V[i], V[i + 1], V[i + 2]);
    V[i] /= l; V[i + 1] /= l; V[i + 2] /= l;
  }
  for (let d = 0; d < detail; d++) {
    const mid = new Map();
    const midpoint = (a, b) => {
      const key = a < b ? a * 65536 + b : b * 65536 + a;
      let m = mid.get(key);
      if (m === undefined) {
        const x = V[a * 3] + V[b * 3], y = V[a * 3 + 1] + V[b * 3 + 1], z = V[a * 3 + 2] + V[b * 3 + 2];
        const l = Math.hypot(x, y, z);
        m = V.length / 3;
        V.push(x / l, y / l, z / l);
        mid.set(key, m);
      }
      return m;
    };
    const F2 = [];
    for (let i = 0; i < F.length; i += 3) {
      const a = F[i], b = F[i + 1], c = F[i + 2];
      const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
      F2.push(a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca);
    }
    F = F2;
  }
  icoCache[detail] = { V, F };
  return icoCache[detail];
}

function rockData(r, detail, jitter, seed) {
  const ico = icoData(detail);
  const P = new Array(ico.V.length);
  for (let i = 0; i < ico.V.length; i += 3) {
    const k = r * (1 + jitter * (hash(i / 3, seed) * 2 - 1));
    P[i] = ico.V[i] * k; P[i + 1] = ico.V[i + 1] * k; P[i + 2] = ico.V[i + 2] * k;
  }
  return { P, N: ico.V, I: ico.F };
}

// ───────────────────────────── PartBuilder ─────────────────────────────

// fixed "studio light" used when baking facet shading into flat primitives
const FACET_LX = 0.34, FACET_LY = 0.78, FACET_LZ = 0.52;

/**
 * Accumulates coloured primitives and bakes them into ONE BufferGeometry (position, normal,
 * color + index). See the reference at the top of this file.
 */
export class PartBuilder {
  constructor(kind = 'paint') {
    this.kind = kind;
    this.pos = [];
    this.nrm = [];
    this.col = [];
    this.idx = [];
    this.m = IDENT;
    this.stack = [];
    this.bright = kind === 'glow' ? GLOW_BOOST : 1;
    /** Baked darkening of downward-facing surfaces (cheap ambient occlusion). */
    this.sky = kind === 'glow' ? 0 : kind === 'metal' ? 0.1 : 0.16;
  }

  get tris() { return this.idx.length / 3; }
  get empty() { return this.idx.length === 0; }

  /** Runs fn(this) with an extra transform { at, rot, scale } applied to everything it adds. */
  group(xf, fn) {
    this.stack.push(this.m);
    this.m = matMul(this.m, xfMatrix(xf || {}));
    fn(this);
    this.m = this.stack.pop();
    return this;
  }

  /** fn(b, +1) builds the +X side, then fn(b, −1) runs mirrored to the −X side. */
  mirrorX(fn) {
    fn(this, 1);
    return this.group({ scale: [-1, 1, 1] }, (b) => fn(b, -1));
  }

  /** n copies around the Y axis: fn(b, i) authors one copy facing +Z. */
  ring(n, fn, phase = 0) {
    for (let i = 0; i < n; i++) this.group({ rot: [0, phase + (i / n) * TAU, 0] }, (b) => fn(b, i));
    return this;
  }

  _emit(d, c, o, pre) {
    let M = hasXf(o) ? matMul(this.m, xfMatrix(o)) : this.m;
    if (pre) M = matMul(M, pre);
    const m00 = M[0], m01 = M[1], m02 = M[2], m03 = M[3];
    const m10 = M[4], m11 = M[5], m12 = M[6], m13 = M[7];
    const m20 = M[8], m21 = M[9], m22 = M[10], m23 = M[11];
    // normals transform with the cofactor matrix (= det · inverse transpose)
    const c00 = m11 * m22 - m12 * m21, c01 = m12 * m20 - m10 * m22, c02 = m10 * m21 - m11 * m20;
    const c10 = m02 * m21 - m01 * m22, c11 = m00 * m22 - m02 * m20, c12 = m01 * m20 - m00 * m21;
    const c20 = m01 * m12 - m02 * m11, c21 = m02 * m10 - m00 * m12, c22 = m00 * m11 - m01 * m10;
    const flip = m00 * c00 + m01 * c01 + m02 * c02 < 0;     // mirrored: reverse the winding
    const sg = flip ? -1 : 1;
    const P = d.P, N = d.N, I = d.I;
    const A = rgbOf(c);
    const B = o && o.c2 !== undefined ? rgbOf(o.c2) : null;
    const k = this.bright * (o && o.bright !== undefined ? o.bright : 1);
    const flat = !!(o && o.flat);
    const facet = flat && o.facet ? o.facet : 0;
    let y0 = 0, yr = 0;
    if (B) {
      let y1 = -Infinity;
      y0 = Infinity;
      for (let i = 1; i < P.length; i += 3) { if (P[i] < y0) y0 = P[i]; if (P[i] > y1) y1 = P[i]; }
      yr = y1 - y0 > 1e-9 ? 1 / (y1 - y0) : 0;
    }
    const pos = this.pos, nrm = this.nrm, colr = this.col, idx = this.idx;
    const nv = P.length / 3;
    const T = new Array(P.length);
    for (let i = 0; i < P.length; i += 3) {
      const x = P[i], y = P[i + 1], z = P[i + 2];
      T[i] = m00 * x + m01 * y + m02 * z + m03;
      T[i + 1] = m10 * x + m11 * y + m12 * z + m13;
      T[i + 2] = m20 * x + m21 * y + m22 * z + m23;
    }
    if (!flat) {
      const base = pos.length / 3;
      for (let i = 0; i < nv; i++) {
        const q = i * 3;
        pos.push(T[q], T[q + 1], T[q + 2]);
        const nx = N[q], ny = N[q + 1], nz = N[q + 2];
        const x = (c00 * nx + c01 * ny + c02 * nz) * sg;
        const y = (c10 * nx + c11 * ny + c12 * nz) * sg;
        const z = (c20 * nx + c21 * ny + c22 * nz) * sg;
        const l = Math.hypot(x, y, z) || 1;
        nrm.push(x / l, y / l, z / l);
        if (B) {
          const t = (P[q + 1] - y0) * yr;
          colr.push((B.r + (A.r - B.r) * t) * k, (B.g + (A.g - B.g) * t) * k, (B.b + (A.b - B.b) * t) * k);
        } else {
          colr.push(A.r * k, A.g * k, A.b * k);
        }
      }
      for (let t = 0; t < I.length; t += 3) {
        if (flip) idx.push(base + I[t], base + I[t + 2], base + I[t + 1]);
        else idx.push(base + I[t], base + I[t + 1], base + I[t + 2]);
      }
    } else {
      for (let t = 0; t < I.length; t += 3) {
        const i0 = I[t] * 3, i1 = (flip ? I[t + 2] : I[t + 1]) * 3, i2 = (flip ? I[t + 1] : I[t + 2]) * 3;
        const ax = T[i0], ay = T[i0 + 1], az = T[i0 + 2];
        const ux = T[i1] - ax, uy = T[i1 + 1] - ay, uz = T[i1 + 2] - az;
        const vx = T[i2] - ax, vy = T[i2 + 1] - ay, vz = T[i2 + 2] - az;
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const l = Math.hypot(nx, ny, nz);
        if (l < 1e-10) continue;
        nx /= l; ny /= l; nz /= l;
        const f = k * (facet ? 1 - facet + facet * (0.5 + 0.5 * (nx * FACET_LX + ny * FACET_LY + nz * FACET_LZ)) * 1.6 : 1);
        const base = pos.length / 3;
        pos.push(ax, ay, az, T[i1], T[i1 + 1], T[i1 + 2], T[i2], T[i2 + 1], T[i2 + 2]);
        nrm.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
        if (B) {
          for (let q = 0; q < 3; q++) {
            const tt = (P[(q === 0 ? i0 : q === 1 ? i1 : i2) + 1] - y0) * yr;
            colr.push((B.r + (A.r - B.r) * tt) * f, (B.g + (A.g - B.g) * tt) * f, (B.b + (A.b - B.b) * tt) * f);
          }
        } else {
          colr.push(A.r * f, A.g * f, A.b * f, A.r * f, A.g * f, A.b * f, A.r * f, A.g * f, A.b * f);
        }
        idx.push(base, base + 1, base + 2);
      }
    }
    return this;
  }

  // ── primitives ──

  sphere(r, c, o = {}) {
    return this._emit(latheData(sphereProfile(r, o.rings || 6), o.seg || 10, 0, false), c, o);
  }

  /** Ellipsoid with radii rx, ry, rz. */
  ball(rx, ry, rz, c, o = {}) {
    const d = latheData(sphereProfile(1, o.rings || 6), o.seg || 10, 0, false);
    return this._emit(d, c, o, [rx, 0, 0, 0, 0, ry, 0, 0, 0, 0, rz, 0]);
  }

  /** Box centred on `at`. bevel defaults to 14% of the smallest side; pass bevel: 0 for sharp edges. */
  box(w, h, d, c, o = {}) {
    const bevel = o.bevel !== undefined ? o.bevel : Math.min(w, h, d) * 0.14;
    return this._emit(boxData(w, h, d, bevel), c, o);
  }

  /** Cylinder / frustum along Y, centred. cap: false leaves it open. */
  cyl(rTop, rBottom, h, c, o = {}) {
    const d = latheData([[rBottom, -h / 2], [rTop, h / 2]], o.seg || 10, o.phase || 0, o.cap !== false);
    return this._emit(d, c, o);
  }

  /** Cone along Y: base (radius r) at −h/2, tip at +h/2. */
  cone(r, h, c, o = {}) { return this.cyl(0, r, h, c, o); }

  /** Capsule along Y, centred; total height = len + 2r. o.r2 = different radius at the top. */
  capsule(r, len, c, o = {}) {
    const r2 = o.r2 !== undefined ? o.r2 : r;
    return this._emit(latheData(capsuleProfile(r, r2, len, o.rings || 3), o.seg || 8, 0, false), c, o);
  }

  /** Tapered capsule from point p0 (radius r0) to point p1 (radius r1): arms, legs, struts. */
  limb(p0, p1, r0, r1, c, o = {}) {
    let dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2];
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-9) return this.sphere(Math.max(r0, r1), c, { ...o, at: p0 });
    dx /= len; dy /= len; dz /= len;
    // basis with +Y along the limb
    let hx = 0, hy = 1, hz = 0;
    if (Math.abs(dy) > 0.95) { hx = 1; hy = 0; }
    let xx = hy * dz - hz * dy, xy = hz * dx - hx * dz, xz = hx * dy - hy * dx;
    const xl = Math.hypot(xx, xy, xz);
    xx /= xl; xy /= xl; xz /= xl;
    const zx = xy * dz - xz * dy, zy = xz * dx - xx * dz, zz = xx * dy - xy * dx;
    const pre = [
      xx, dx, zx, (p0[0] + p1[0]) / 2,
      xy, dy, zy, (p0[1] + p1[1]) / 2,
      xz, dz, zz, (p0[2] + p1[2]) / 2,
    ];
    return this._emit(latheData(capsuleProfile(r0, r1, len, o.rings || 3), o.seg || 8, 0, false), c, o, pre);
  }

  /** Ring around the Y axis: R = ring radius, r = thickness radius. o.arc < 2π leaves a gap. */
  torus(R, r, c, o = {}) {
    return this._emit(torusData(R, r, o.seg || 14, o.tube || 6, o.arc !== undefined ? o.arc : TAU), c, o);
  }

  /** Surface of revolution around Y from [[r, y], ...] listed bottom → top. Open ends are capped. */
  lathe(profile, c, o = {}) {
    return this._emit(latheData(profile, o.seg || 12, o.phase || 0, o.cap !== false), c, o);
  }

  /** Faceted crystal along Y, centred: a girdle with a point at each end. */
  crystal(r, h, c, o = {}) {
    const top = o.top !== undefined ? o.top : 0.34, bottom = o.bottom !== undefined ? o.bottom : 0.22;
    const base = o.base !== undefined ? o.base : 0.82;
    const profile = [[0, -h / 2], [r * base, -h / 2 + bottom * h], [r, h / 2 - top * h], [0, h / 2]];
    const oo = o.flat === undefined ? { facet: 0.3, ...o, flat: true } : o;
    return this._emit(latheData(profile, o.sides || 6, o.phase || 0, false), c, oo);
  }

  /** Lumpy boulder (jittered icosphere). detail 0 / 1 / 2 = 20 / 80 / 320 triangles. */
  rock(r, c, o = {}) {
    const d = rockData(r, o.detail !== undefined ? o.detail : 1, o.jitter !== undefined ? o.jitter : 0.16, o.seed || 0);
    const oo = o.flat === undefined ? { facet: 0.18, ...o, flat: true } : o;
    return this._emit(d, c, oo);
  }

  /** Flat shape: outline [[x, y], ...] in the XY plane, `depth` thick along Z, centred on z = 0. */
  extrude(outline, depth, c, o = {}) {
    return this._emit(extrudeData(outline, depth, o.bevel || 0), c, o);
  }

  /** Round tube through [[x, y, z], ...]. `radii`: one number or one radius per point (0 = pointed). */
  tube(pts, radii, c, o = {}) {
    return this._emit(tubeData(pts, radii, o.sides || 6), c, o);
  }

  /** Bakes everything into a BufferGeometry whose origin is `pivot` (model space). */
  build(pivot) {
    const pos = this.pos, nrm = this.nrm, colr = this.col;
    const n = pos.length / 3;
    const px = pivot ? pivot[0] : 0, py = pivot ? pivot[1] : 0, pz = pivot ? pivot[2] : 0;
    const p = new Float32Array(n * 3), nn = new Float32Array(n * 3), cc = new Float32Array(n * 3);
    const sky = this.sky;
    for (let i = 0; i < n; i++) {
      const q = i * 3;
      p[q] = pos[q] - px; p[q + 1] = pos[q + 1] - py; p[q + 2] = pos[q + 2] - pz;
      nn[q] = nrm[q]; nn[q + 1] = nrm[q + 1]; nn[q + 2] = nrm[q + 2];
      const s = 1 - sky * (0.5 - 0.5 * nrm[q + 1]);
      cc[q] = colr[q] * s; cc[q + 1] = colr[q + 1] * s; cc[q + 2] = colr[q + 2] * s;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nn, 3));
    g.setAttribute('color', new THREE.BufferAttribute(cc, 3));
    g.setIndex(new THREE.BufferAttribute(n > 65535 ? new Uint32Array(this.idx) : new Uint16Array(this.idx), 1));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

// ───────────────────────────── shared textures & materials ─────────────────────────────

let envTex = null;

/**
 * Small procedural studio environment (equirect, half-float HDR). The 'metal' material carries
 * it so polished parts look right whatever the scene lighting is; card art uses it as
 * scene.environment too.
 */
export function envTexture() {
  if (envTex) return envTex;
  const w = 128, h = 64;
  const data = new Uint16Array(w * h * 4);
  const half = THREE.DataUtils.toHalfFloat;
  // two soft boxes: a warm key high on one side, a cool kicker opposite
  const k1 = [-0.48, 0.72, 0.5], k2 = [0.62, 0.42, -0.66];
  for (let j = 0; j < h; j++) {
    const el = ((j + 0.5) / h - 0.5) * Math.PI;
    const sy = Math.sin(el), cy = Math.cos(el);
    for (let i = 0; i < w; i++) {
      const az = ((i + 0.5) / w - 0.5) * TAU;
      const dx = cy * Math.cos(az), dz = cy * Math.sin(az);
      let r, g, b;
      if (sy >= 0) {
        const t = Math.pow(sy, 0.6);
        r = 1.15 + (0.5 - 1.15) * t; g = 1.12 + (0.72 - 1.12) * t; b = 1.05 + (1.1 - 1.05) * t;
      } else {
        const t = Math.pow(-sy, 0.45);
        r = 0.62 + (0.2 - 0.62) * t; g = 0.56 + (0.19 - 0.56) * t; b = 0.5 + (0.22 - 0.5) * t;
      }
      const d1 = smoothstep(0.86, 0.97, dx * k1[0] + sy * k1[1] + dz * k1[2]);
      const d2 = smoothstep(0.9, 0.98, dx * k2[0] + sy * k2[1] + dz * k2[2]);
      r += d1 * 6.5 + d2 * 1.6; g += d1 * 6.0 + d2 * 2.2; b += d1 * 5.2 + d2 * 3.0;
      const q = (j * w + i) * 4;
      data[q] = half(r); data[q + 1] = half(g); data[q + 2] = half(b); data[q + 3] = half(1);
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  envTex = tex;
  return tex;
}

let blobTex = null;

function blobTexture() {
  if (blobTex) return blobTex;
  const n = 64;
  const data = new Uint8Array(n * n * 4);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const d = Math.hypot((i + 0.5) / (n / 2) - 1, (j + 0.5) / (n / 2) - 1);
      const a = 1 - smoothstep(0.2, 1, d);
      data[(j * n + i) * 4 + 3] = Math.round(255 * a * a);
    }
  }
  const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  blobTex = tex;
  return tex;
}

let blobGeo = null;

function blobGeometry() {
  if (blobGeo) return blobGeo;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, 0, -1, -1, 0, 1, 1, 0, 1, 1, 0, -1]), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 1, 1, 1, 0]), 2));
  g.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 1, 2, 0, 2, 3]), 1));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  blobGeo = g;
  return g;
}

const materials = {};

/**
 * Shared materials: 'paint' | 'metal' | 'glow' | 'ghost0' | 'ghost1' | 'shadow' | 'shadowFly'.
 * Never dispose or mutate these.
 */
export function material(kind) {
  let m = materials[kind];
  if (m) return m;
  switch (kind) {
    case 'metal':
      m = new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: 0.34, metalness: 0.85, envMap: envTexture(), envMapIntensity: 1,
      });
      break;
    case 'glow':
      m = new THREE.MeshBasicMaterial({ vertexColors: true });
      break;
    case 'ghost0':
    case 'ghost1': {
      const pal = teamPalette(kind === 'ghost1' ? 1 : 0);
      m = new THREE.MeshLambertMaterial({
        vertexColors: true, transparent: true, opacity: 0.5,
        color: mix(PAL.white, pal.light, 0.55), emissive: shade(pal.main, 0.3),
      });
      break;
    }
    case 'shadow':
    case 'shadowFly':
      m = new THREE.MeshBasicMaterial({
        map: blobTexture(), color: 0x000000, transparent: true, opacity: kind === 'shadow' ? 0.5 : 0.26,
        depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
      });
      break;
    default:
      kind = 'paint';
      m = materials.paint || new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.08 });
  }
  materials[kind] = m;
  return m;
}

// Per-view clones (tint / flash / own glow) are pooled and never disposed: disposing the last
// user of a shader program would make three.js recompile it on the next spawn.
const pools = { paint: [], metal: [], glow: [] };

function takeClone(kind) {
  return pools[kind].pop() || material(kind).clone();
}

function giveBack(kind, m) {
  m.color.setRGB(1, 1, 1);
  if (m.emissive) m.emissive.setRGB(0, 0, 0);
  pools[kind].push(m);
}

// ───────────────────────────── model definitions (cached geometry) ─────────────────────────────

const CLASSES = ['paint', 'metal', 'glow'];

class PartSpec {
  constructor(name, o) {
    this.name = name;
    this.pivot = o.pivot ? [o.pivot[0], o.pivot[1], o.pivot[2]] : [0, 0, 0];
    this.parent = o.parent || null;
    this.cast = o.cast !== false;
    this.ownGlow = !!o.ownGlow;
    this.assemble = o.assemble || null;
    this.copy = o.copy || null;
    this.builders = {};
  }

  get paint() { return this.builders.paint || (this.builders.paint = new PartBuilder('paint')); }
  get metal() { return this.builders.metal || (this.builders.metal = new PartBuilder('metal')); }
  get glow() { return this.builders.glow || (this.builders.glow = new PartBuilder('glow')); }
}

class ModelMaker {
  constructor() { this.specs = []; this.byName = {}; }

  /** Declares (or returns) a part. See the reference at the top of this file. */
  part(name, o = {}) {
    let s = this.byName[name];
    if (!s) { s = new PartSpec(name, o); this.specs.push(s); this.byName[name] = s; }
    return s;
  }

  finish(key) {
    const parts = [], byName = {};
    let height = 0, extent = 0, tris = 0, draws = 0;
    for (const s of this.specs) {
      const geo = {};
      const twin = s.copy ? byName[s.copy] : null;
      for (const cls of CLASSES) {
        let g = null;
        if (twin) g = twin.geo[cls] || null;
        else if (s.builders[cls] && !s.builders[cls].empty) g = s.builders[cls].build(s.pivot);
        if (!g) continue;
        geo[cls] = g;
        draws++;
        tris += g.index.count / 3;
        const bb = g.boundingBox;
        height = Math.max(height, bb.max.y + s.pivot[1]);
        extent = Math.max(extent, Math.abs(bb.min.x + s.pivot[0]), Math.abs(bb.max.x + s.pivot[0]),
          Math.abs(bb.min.z + s.pivot[2]), Math.abs(bb.max.z + s.pivot[2]));
      }
      const p = {
        name: s.name, pivot: s.pivot, parent: s.parent && byName[s.parent] ? s.parent : null, geo,
        cast: s.cast, ownGlow: s.ownGlow, assemble: s.assemble,
      };
      parts.push(p);
      byName[s.name] = p;
    }
    return { key, parts, byName, height, extent, tris, draws };
  }
}

const modelCache = new Map();

/**
 * Builds (once per key) and caches the geometry of a model. `build(m)` declares parts with
 * m.part(...) and fills their builders. Returns a ModelDef:
 * { key, parts, byName, height, extent, tris, draws }.
 */
export function defineModel(key, build) {
  let def = modelCache.get(key);
  if (!def) {
    const m = new ModelMaker();
    build(m);
    def = m.finish(key);
    modelCache.set(key, def);
  }
  return def;
}

/** Static scenery from a ModelDef (ruins, props): a Group of shared-material meshes, no view logic. */
export function staticGroup(def, { cast = true, receive = true } = {}) {
  const root = new THREE.Group();
  for (const p of def.parts) {
    for (const cls of CLASSES) {
      if (!p.geo[cls]) continue;
      const mesh = new THREE.Mesh(p.geo[cls], material(cls));
      mesh.position.set(p.pivot[0], p.pivot[1], p.pivot[2]);
      mesh.castShadow = cast && cls !== 'glow';
      mesh.receiveShadow = receive && cls !== 'glow';
      root.add(mesh);
    }
  }
  return root;
}

// ───────────────────────────── ModelView ─────────────────────────────

/**
 * The EntityView every unit and structure returns: { root, height, update(dt, s), flash(), dispose() }.
 * Hierarchy: root (caller-owned) → rig (kit: deploy / hop / stun) → body (model: whole-body motion)
 * → parts. See the reference at the top of this file.
 */
export class ModelView {
  constructor(def, o = {}) {
    this.def = def;
    this.type = o.type || def.key;
    this.team = o.team === 1 ? 1 : 0;
    this.kind = o.kind || 'unit';
    this.radius = o.radius > 0 ? o.radius : 0.5;
    this.flying = !!o.flying;
    this.height = o.height > 0 ? o.height : def.height;
    this.deployStyle = o.deploy || (this.kind === 'unit' ? 'drop' : 'rise');
    this.hopHeight = o.hopHeight !== undefined ? o.hopHeight : 1.1;
    /** 1 = normal; lower values darken paint and metal (damage states). */
    this.shade = 1;
    /** (dt, s, a) => void — the model's own animation, called every update unless frozen. */
    this.animate = null;
    const seed = Math.random() * TAU;
    this.anim = { seed, walk: seed, move: 0 };
    this.parts = {};
    this.glow = {};

    this._walkK = TAU / (o.stride > 0 ? o.stride : 0.8);
    this._flash = 0;
    this._own = false;
    this._ownPaint = null;
    this._ownMetal = null;
    this._deploying = false;
    this._ghost = false;
    this._disposed = false;
    this._paint = [];
    this._metal = [];
    this._asm = [];

    const root = this.root = new THREE.Group();
    const rig = this.rig = new THREE.Group();
    const body = this.body = new THREE.Group();
    root.add(rig);
    rig.add(body);

    const structure = this.kind !== 'unit';
    for (const p of def.parts) {
      const g = p.geo;
      const count = (g.paint ? 1 : 0) + (g.metal ? 1 : 0) + (g.glow ? 1 : 0);
      let node;
      if (count === 1) {
        node = this._mesh(p, g.paint ? 'paint' : g.metal ? 'metal' : 'glow', structure);
      } else {
        node = new THREE.Group();
        for (const cls of CLASSES) {
          if (!g[cls]) continue;
          const mesh = this._mesh(p, cls, structure);
          mesh.matrixAutoUpdate = false;      // stays at the part's origin
          node.add(mesh);
        }
      }
      const parent = p.parent ? this.parts[p.parent] : body;
      const pp = p.parent ? def.byName[p.parent].pivot : null;
      const x = p.pivot[0] - (pp ? pp[0] : 0), y = p.pivot[1] - (pp ? pp[1] : 0), z = p.pivot[2] - (pp ? pp[2] : 0);
      if (p.assemble) {
        const wrap = new THREE.Group();
        wrap.position.set(x, y, z);
        wrap.add(node);
        parent.add(wrap);
        this._asm.push({ node: wrap, t0: p.assemble[0], t1: Math.max(p.assemble[1], p.assemble[0] + 0.01) });
      } else {
        node.position.set(x, y, z);
        parent.add(node);
      }
      node.userData.home = node.position.clone();
      this.parts[p.name] = node;
    }

    let sr = this.radius * (structure ? 1.25 : 1.35);
    if (typeof o.shadow === 'number') sr = o.shadow;
    this.shadow = null;
    this._shadowR = sr;
    if (o.shadow !== false && sr > 0) {
      const sh = this.shadow = new THREE.Mesh(blobGeometry(), material(this.flying ? 'shadowFly' : 'shadow'));
      sh.position.y = SHADOW_Y;
      sh.scale.set(sr, 1, sr);
      sh.renderOrder = 1;
      sh.userData.noBounds = true;
      root.add(sh);
    }
  }

  _mesh(p, cls, structure) {
    let mat = material(cls);
    if (cls === 'glow' && p.ownGlow) {
      mat = takeClone('glow');
      this.glow[p.name] = mat;
    }
    const mesh = new THREE.Mesh(p.geo[cls], mat);
    mesh.castShadow = p.cast && cls !== 'glow';
    mesh.receiveShadow = structure && cls !== 'glow';
    if (cls === 'paint') this._paint.push(mesh); else if (cls === 'metal') this._metal.push(mesh);
    return mesh;
  }

  /** Brief white hit flash. */
  flash() { this._flash = FLASH_TIME; }

  update(dt, s) {
    if (this._ghost || this._disposed || !s) return;
    if (!(dt >= 0)) dt = 0; else if (dt > 0.1) dt = 0.1;
    const a = this.anim, rig = this.rig;
    const frozen = !!s.frozen;

    // ── deploy / hop / stun: everything the kit does to the rig ──
    let y = 0, sx = 1, sy = 1, shake = 0, shadowK = 1;
    const f = s.deployFrac;
    if (f < 1 && this.deployStyle !== 'none') {
      this._deploying = true;
      const u = f > 0 ? f : 0;
      if (this.deployStyle === 'rise') {
        const k = easeOutCubic(u / 0.72);
        y = -(this.height + 0.2) * (1 - k);
        shake = Math.sin(u * 60) * 0.03 * (1 - u);
        shadowK = 0.3 + 0.7 * k;
        const asm = this._asm;
        for (let i = 0; i < asm.length; i++) {
          const q = asm[i];
          const e = easeOutBack((u - q.t0) / (q.t1 - q.t0));
          q.node.scale.setScalar(e > 0.001 ? e : 0.001);
        }
      } else if (this.flying) {
        const k = easeOutCubic(u);
        y = DROP_HEIGHT * 0.8 * (1 - k);
        sy = 1 + 0.16 * (1 - k);
        shadowK = 0.4 + 0.6 * k;
      } else if (u < 0.5) {                     // fall, stretching
        const v = u / 0.5;
        y = DROP_HEIGHT * (1 - v * v);
        sy = 1 + 0.2 * v;
        shadowK = 0.45 + 0.55 * v;
      } else if (u < 0.68) {                    // impact squash
        const v = (u - 0.5) / 0.18;
        sy = v < 0.35 ? 1.2 - 0.52 * (v / 0.35) : 0.68 + 0.38 * ((v - 0.35) / 0.65);
      } else if (u < 0.9) {                     // small bounce
        const v = (u - 0.68) / 0.22;
        y = 0.22 * 4 * v * (1 - v);
        sy = 1.06 - 0.06 * v;
      } else {                                  // settle
        sy = 1 - 0.07 * Math.sin(((u - 0.9) / 0.1) * Math.PI);
      }
      sx = 1 / Math.sqrt(sy);
    } else if (this._deploying) {
      this._deploying = false;
      const asm = this._asm;
      for (let i = 0; i < asm.length; i++) asm[i].node.scale.setScalar(1);
    }
    if (!this._deploying && s.hop > 0) {
      const hp = Math.sin(Math.PI * (s.hop < 1 ? s.hop : 1));
      y = hp * this.hopHeight;
      shadowK = 1 - 0.3 * hp;
    }
    let wx = 0, wz = 0;
    if (s.stunned && !frozen) {
      wz = Math.sin(s.time * 23 + a.seed) * 0.07;
      wx = Math.sin(s.time * 17 + a.seed) * 0.05;
    }
    rig.position.set(shake, y, 0);
    rig.scale.set(sx, sy, sx);
    rig.rotation.x = wx;
    rig.rotation.z = wz;

    const sh = this.shadow;
    if (sh) {
      const r = this._shadowR * shadowK;
      sh.position.y = SHADOW_Y - this.root.position.y;   // stays on the ground under flyers
      sh.scale.set(r, 1, r);
    }

    this._look(dt, s, frozen);
    if (frozen) return;                                   // the pose freezes

    const speed = s.moveSpeed > 0 ? s.moveSpeed : 0;
    a.walk += speed * dt * this._walkK;
    if (a.walk > 1e4) a.walk -= TAU * 1000;
    a.move += ((speed > 0.03 ? 1 : 0) - a.move) * (1 - Math.exp(-12 * dt));
    if (this.animate) this.animate(dt, s, a);
  }

  /** Hit flash and status tints. Clones of the shared materials are borrowed only while needed. */
  _look(dt, s, frozen) {
    if (this._flash > 0) this._flash = this._flash > dt ? this._flash - dt : 0;
    const slowed = !!s.slowed && !frozen, hasted = !!s.hasted && !frozen;
    const need = this._flash > 0 || frozen || slowed || hasted || this.shade !== 1;
    if (need !== this._own) this._setOwn(need);
    if (!need) return;
    let r = this.shade, g = r, b = r, er = 0, eg = 0, eb = 0;
    if (frozen) { r *= 0.55; g *= 0.8; b *= 1.2; er = 0.03; eg = 0.09; eb = 0.2; }
    else if (slowed) { r *= 0.8; g *= 0.9; b *= 1.1; }
    if (hasted) {
      const p = 0.55 + 0.45 * Math.sin(s.time * 12);
      er += 0.22 * p; eg += 0.11 * p; eb += 0.02 * p;
    }
    if (this._flash > 0) {
      const w = 0.95 * (this._flash / FLASH_TIME);
      er += w; eg += w; eb += w;
    }
    const mp = this._ownPaint, mm = this._ownMetal;
    if (mp) { mp.color.setRGB(r, g, b); mp.emissive.setRGB(er, eg, eb); }
    if (mm) { mm.color.setRGB(r, g, b); mm.emissive.setRGB(er, eg, eb); }
  }

  _setOwn(on) {
    const paint = this._paint, metal = this._metal;
    if (on) {
      if (paint.length) {
        const m = this._ownPaint = takeClone('paint');
        for (let i = 0; i < paint.length; i++) paint[i].material = m;
      }
      if (metal.length) {
        const m = this._ownMetal = takeClone('metal');
        for (let i = 0; i < metal.length; i++) metal[i].material = m;
      }
    } else {
      if (this._ownPaint) {
        const m = material('paint');
        for (let i = 0; i < paint.length; i++) paint[i].material = m;
        giveBack('paint', this._ownPaint);
        this._ownPaint = null;
      }
      if (this._ownMetal) {
        const m = material('metal');
        for (let i = 0; i < metal.length; i++) metal[i].material = m;
        giveBack('metal', this._ownMetal);
        this._ownMetal = null;
      }
    }
    this._own = on;
  }

  /** Turns this view into a static translucent deploy preview and returns its root. */
  toGhost() {
    this._setOwn(false);
    const gm = material(this.team === 1 ? 'ghost1' : 'ghost0');
    if (this.shadow) { this.root.remove(this.shadow); this.shadow = null; }
    this.root.traverse((o) => {
      if (o.isMesh) { o.material = gm; o.castShadow = false; o.receiveShadow = false; }
    });
    for (const k in this.glow) giveBack('glow', this.glow[k]);
    this.glow = {};
    this._ghost = true;
    return this.root;
  }

  /** Frees per-instance resources. Shared geometry and materials stay cached. */
  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this._setOwn(false);
    for (const k in this.glow) giveBack('glow', this.glow[k]);
    this.glow = {};
    this.animate = null;
  }
}

/** ModelView for a UNITS entry: fills kind / radius / flying from the data. */
export function unitView(type, team, def, o = {}) {
  const u = UNITS[type];
  return new ModelView(def, {
    type, team,
    kind: u ? u.kind : 'unit',
    radius: u ? u.radius : 0.45,
    flying: !!(u && u.flying),
    ...o,
  });
}

// ───────────────────────────── placeholder ─────────────────────────────

/**
 * Stand-in for a type that has no real model yet: a team-coloured capsule with a head, sized
 * from the unit data, with a generic walk / attack bob. Never throws.
 */
export function placeholderView(type, team) {
  const u = UNITS[type] || { kind: 'unit', radius: 0.45, height: 1.3, flying: false };
  const r = Math.min(3, Math.max(0.15, u.radius || 0.45));
  const h = Math.min(8, Math.max(0.3, u.height || 1.3));
  const t = team === 1 ? 1 : 0;
  const structure = u.kind !== 'unit';
  const def = defineModel(`placeholder:${type}:${t}`, (m) => {
    const pal = teamPalette(t);
    const body = m.part('body', { pivot: [0, 0, 0] });
    if (structure) {
      body.paint.lathe([[r, 0], [r * 0.9, h * 0.12], [r * 0.7, h * 0.5], [r * 0.78, h * 0.56], [0, h * 0.56]],
        PAL.sand, { seg: 8, flat: true, c2: PAL.sandDark });
      body.paint.torus(r * 0.82, r * 0.08, pal.main, { at: [0, h * 0.3, 0], seg: 8 });
      body.glow.crystal(r * 0.34, h * 0.4, pal.glow, { at: [0, h * 0.8, 0] });
    } else {
      const headR = Math.min(r * 0.62, h * 0.24);
      const br = Math.min(r * 0.82, (h - headR * 1.5) * 0.48);
      const bodyTop = h - headR * 1.55;
      body.paint.capsule(br, Math.max(0, bodyTop - 2 * br), pal.main, { at: [0, bodyTop / 2, 0], c2: pal.dark });
      body.paint.torus(br * 0.96, br * 0.16, pal.trim, { at: [0, bodyTop * 0.5, 0], seg: 10, tube: 5 });
      body.paint.sphere(headR, pal.light, { at: [0, h - headR, 0] });
      body.paint.sphere(headR * 0.2, PAL.eye, { at: [headR * 0.38, h - headR * 0.92, headR * 0.86], seg: 6, rings: 4 });
      body.paint.sphere(headR * 0.2, PAL.eye, { at: [-headR * 0.38, h - headR * 0.92, headR * 0.86], seg: 6, rings: 4 });
      if (u.flying) {
        body.paint.mirrorX((b) => b.ball(r * 0.75, h * 0.05, r * 0.4, pal.light, { at: [r * 0.95, h * 0.55, -r * 0.1], seg: 8, rings: 4 }));
      }
    }
  });
  const v = unitView(type, t, def);
  const body = v.parts.body;
  const flying = !!u.flying;
  v.animate = (dt, s, a) => {
    const time = s.time + a.seed;
    if (structure) {
      const k = 1 + 0.03 * Math.sin(time * 2.4) + 0.12 * impact(s.attackT, s.windup, 0.2);
      body.scale.set(1, k, 1);
      return;
    }
    const p = swing(s.attackT, s.windup, s.hitSpeed);
    let y = flying ? Math.sin(time * 2.6) * 0.06 : 0;
    y += Math.abs(Math.sin(a.walk)) * 0.07 * a.move + Math.sin(time * 2.2) * 0.012 * (1 - a.move);
    body.position.y = y;
    body.position.z = pose(p, -0.12, 0, 0.3) * r;
    body.rotation.x = 0.12 * a.move + pose(p, -0.25, 0, 0.45);
    body.rotation.z = Math.sin(a.walk) * 0.06 * a.move;
  };
  return v;
}
