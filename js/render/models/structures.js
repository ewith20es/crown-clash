// Aether Spires — structures: Spire, Citadel, their ruins, and the four buildings
// (Sentry Prism, Glimmer Nest, Skyreach Bombard, Aether Well).
//
// Structure views: the caller sets root.rotation.y once (PI for team 0, 0 for team 1) so local +Z
// faces the enemy; turrets turn by s.aimYaw through aimLocal(). Towers never deploy ('none');
// buildings rise out of the ground and assemble (part.assemble slices of deployFrac).

import { UNITS } from '../../data/cards.js';
import { registerUnit } from './registry.js';
import {
  PAL, mix, teamPalette, defineModel, unitView, staticGroup,
  buildUp, impact, damp, aimLocal, clamp01, smoothstep,
} from './kit.js';

const PI = Math.PI;

function rnd(i, seed) {
  const x = Math.sin(i * 127.1 + seed * 311.7 + 1.3) * 43758.5453;
  return x - Math.floor(x);
}

/** Radius of a lathe profile ([[r, y], ...] bottom → top) at height y. */
function profR(prof, y) {
  if (y <= prof[0][1]) return prof[0][0];
  for (let i = 1; i < prof.length; i++) {
    const a = prof[i - 1], b = prof[i];
    if (y <= b[1]) return a[0] + (b[0] - a[0]) * ((y - a[1]) / (b[1] - a[1] || 1));
  }
  return prof[prof.length - 1][0];
}

/** Semicircle-topped arch outline in XY: width 2w, height h, standing on y = 0. */
function arch(w, h, n = 6) {
  const pts = [[-w, 0], [w, 0]];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * PI;
    pts.push([w * Math.cos(a), h - w + w * Math.sin(a)]);
  }
  return pts;
}

/** The same arch as an open 3-D path (for a tube frame) at depth z, lifted by y0. */
function archPath(w, h, y0, z, n = 6) {
  const pts = [[w, y0, z]];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * PI;
    pts.push([w * Math.cos(a), y0 + h - w + w * Math.sin(a), z]);
  }
  pts.push([-w, y0, z]);
  return pts;
}

const BANNER = [[-0.25, 0], [-0.25, -0.86], [0, -0.7], [0.25, -0.86], [0.25, 0]];
const DIAMOND = [[0, 0.15], [0.11, 0], [0, -0.15], [-0.11, 0]];
const FLAG = [[0, 0], [0.34, -0.08], [0, -0.2]];

function glowOf(pal) { return mix(pal.glow, PAL.white, 0.22); }

function structView(type, team, def, o) {
  return unitView(type, team, def, { height: UNITS[type].height, ...o });
}

function damageLevel(hp) { return hp < 0.25 ? 2 : hp < 0.5 ? 1 : 0; }

/** Shows the right crown / debris parts for a damage level and darkens the stone. */
function applyDamage(v, lvl) {
  const p = v.parts;
  p.crown.visible = lvl === 0;
  p.crownBroken.visible = lvl > 0;
  p.debris1.visible = lvl > 0;
  p.debris2.visible = lvl > 1;
  v.shade = lvl === 0 ? 1 : lvl === 1 ? 0.84 : 0.7;
}

// ═════════════════════════════════════ SPIRE ═════════════════════════════════════

const SPIRE_PLINTH = [[1.36, 0], [1.36, 0.2], [1.22, 0.26], [1.14, 0.62], [1.0, 0.7]];
const SPIRE_SHAFT = [[0.99, 0.68], [0.92, 1.6], [0.8, 2.5], [0.74, 2.86]];

function spirePlinth(P) {
  P.lathe(SPIRE_PLINTH, PAL.sand, { seg: 8, phase: PI / 8, flat: true, c2: PAL.sandDark });
  // buttresses on the diagonals, leaving the front (door, banner) and back clear
  P.ring(4, (b) => b.extrude([[0.78, 0.2], [1.38, 0.2], [1.38, 0.44], [0.86, 1.9], [0.7, 1.9]], 0.26,
    PAL.sandLight, { rot: [0, -PI / 2, 0], bevel: 0.04 }), PI / 4);
}

/** A spot on the shaft surface: [x, y, z] at angle a (0 = front) and height y, pushed out by `out`. */
function onShaft(a, y, out = 0) {
  const r = profR(SPIRE_SHAFT, y) + out;
  return [Math.sin(a) * r, y, Math.cos(a) * r];
}

function spireModel(team) {
  return defineModel(`spire:${team}`, (m) => {
    const pal = teamPalette(team);
    const gc = glowOf(pal);

    const base = m.part('base');
    const P = base.paint, M = base.metal, G = base.glow;
    spirePlinth(P);
    P.lathe(SPIRE_SHAFT, PAL.sand, { seg: 12, c2: PAL.sandDark, cap: false });
    P.torus(profR(SPIRE_SHAFT, 1.5) + 0.01, 0.045, PAL.sandLight, { at: [0, 1.5, 0], seg: 16, tube: 5 });
    P.torus(profR(SPIRE_SHAFT, 2.3) + 0.01, 0.04, PAL.sandLight, { at: [0, 2.3, 0], seg: 16, tube: 5 });
    // balcony corbel and floor
    P.lathe([[0.74, 2.7], [1.0, 2.9], [1.04, 2.98], [0.6, 3.0]], PAL.sandLight, { seg: 12 });
    // door: wooden arch, stone frame, iron bands, two lanterns
    P.extrude(arch(0.2, 0.56), 0.1, PAL.woodDark, { at: [0, 0.7, 0.93] });
    P.tube(archPath(0.21, 0.57, 0.7, 0.985), 0.045, PAL.sandLight, { sides: 5 });
    M.box(0.36, 0.035, 0.03, PAL.iron, { at: [0, 0.86, 0.985], bevel: 0.01 });
    M.box(0.36, 0.035, 0.03, PAL.iron, { at: [0, 1.06, 0.985], bevel: 0.01 });
    M.mirrorX((b) => {
      b.limb([0.3, 1.18, 0.9], [0.36, 1.22, 1.0], 0.016, 0.016, PAL.iron);
      b.cyl(0.05, 0.035, 0.05, PAL.iron, { at: [0.36, 1.29, 1.0], seg: 6 });
    });
    G.mirrorX((b) => b.sphere(0.045, gc, { at: [0.36, 1.23, 1.0], seg: 6, rings: 4 }));
    // arrow-slit windows on the sides and back (the banner covers the front)
    G.ring(4, (b, i) => {
      if (i === 0) return;
      b.box(0.07, 0.24, 0.05, gc, { at: onShaft(0, 1.95, -0.01), bevel: 0.01 });
      b.box(0.06, 0.18, 0.05, gc, { at: onShaft(0, 2.48, -0.01), bevel: 0.01 });
    });

    // merlons under the roof skirt — intact and broken variants
    const crown = m.part('crown');
    crown.paint.ring(8, (b) => b.box(0.22, 0.15, 0.14, PAL.sandLight, { at: [0, 3.075, 0.94] }), PI / 8);
    const crownB = m.part('crownBroken');
    crownB.paint.ring(8, (b, i) => {
      if (i === 1 || i === 4 || i === 6) return;
      const h = i === 2 || i === 7 ? 0.08 : 0.15;
      b.box(0.22, h, 0.14, PAL.sandDark, { at: [0, 3.0 + h / 2, 0.94], rot: i === 2 ? [0.25, 0, 0.3] : undefined });
    }, PI / 8);

    // tiled team roof skirt, hinged at its +X eave so damage makes it sag
    const roof = m.part('roof', { pivot: [1.0, 3.17, 0] });
    roof.paint.lathe([[1.14, 3.15], [1.16, 3.2], [0.8, 3.35], [0.42, 3.46]], pal.main,
      { seg: 8, flat: true, c2: pal.dark });
    roof.paint.torus(1.06, 0.022, pal.dark, { at: [0, 3.245, 0], seg: 8, tube: 4 });
    roof.paint.torus(0.84, 0.02, pal.dark, { at: [0, 3.335, 0], seg: 8, tube: 4 });
    roof.paint.cyl(0.44, 0.46, 0.05, PAL.sandLight, { at: [0, 3.485, 0], seg: 12 });
    roof.metal.ring(8, (b) => b.limb([0, 3.21, 1.165], [0, 3.47, 0.43], 0.022, 0.018, pal.trim, { seg: 5, rings: 2 }));
    roof.metal.ring(3, (b) => {
      b.tube([[0, 3.49, 0.36], [0, 3.58, 0.42], [0, 3.68, 0.38], [0, 3.74, 0.3]], [0.04, 0.035, 0.028, 0.014],
        pal.trim, { sides: 5 });
    }, PI / 3);

    // hanging banner on the front
    const ban = m.part('banner', { pivot: [0, 2.87, 0.97] });
    ban.paint.extrude(BANNER, 0.04, pal.main, { at: [0, 2.86, 0.97], c2: pal.dark });
    ban.paint.extrude(DIAMOND, 0.02, pal.trim, { at: [0, 2.42, 0.99] });
    ban.paint.cyl(0.028, 0.028, 0.62, PAL.woodDark, { at: [0, 2.875, 0.97], rot: [0, 0, PI / 2], seg: 6 });
    ban.paint.mirrorX((b) => b.sphere(0.04, pal.trim, { at: [0.31, 2.875, 0.97], seg: 6, rings: 4 }));

    // the floating crystal: 'aim' turns toward the target, 'crystal' leans and spins inside it
    m.part('aim', { pivot: [0, 4.0, 0] });
    const cr = m.part('crystal', { pivot: [0, 4.0, 0], parent: 'aim', ownGlow: true, cast: false });
    cr.glow.crystal(0.34, 0.76, gc, { at: [0, 4.0, 0], sides: 6, top: 0.42, bottom: 0.42, c2: pal.main });
    cr.glow.crystal(0.22, 0.84, mix(gc, PAL.white, 0.45), { at: [0, 4.0, 0], sides: 6, phase: PI / 6, top: 0.4, bottom: 0.4 });
    const sh = m.part('shards', { pivot: [0, 4.0, 0], ownGlow: true, cast: false });
    sh.glow.ring(3, (b, i) => b.crystal(0.075, 0.24, gc, { at: [0, 4.0 + (i - 1) * 0.09, 0.64], rot: [0.3, 0, 0], sides: 4 }));

    // damage: chipped holes and fallen stone (≥ 50% lost), then more holes and aether leaking cracks
    const d1 = m.part('debris1');
    d1.paint.ball(0.17, 0.21, 0.07, PAL.rockDark, { at: onShaft(2.3, 1.95), rot: [0, 2.3, 0] });
    d1.paint.ball(0.13, 0.15, 0.06, PAL.rockDark, { at: onShaft(-0.95, 2.5), rot: [0, -0.95, 0] });
    for (let i = 0; i < 5; i++) {
      const a = 0.4 + i * 1.3, r = 1.5 + rnd(i, 3) * 0.4;
      d1.paint.rock(0.1 + rnd(i, 4) * 0.08, i % 2 ? PAL.sandLight : PAL.sand,
        { at: [Math.sin(a) * r, 0.06, Math.cos(a) * r], detail: 0, seed: i + 3 });
    }
    const d2 = m.part('debris2');
    d2.paint.ball(0.2, 0.25, 0.08, PAL.rockDark, { at: onShaft(0.62, 1.35), rot: [0, 0.62, 0] });
    d2.paint.ball(0.15, 0.2, 0.07, PAL.rockDark, { at: onShaft(3.7, 2.2), rot: [0, 3.7, 0] });
    d2.paint.ball(0.12, 0.13, 0.06, PAL.rockDark, { at: onShaft(-2.0, 1.25), rot: [0, -2.0, 0] });
    for (let i = 0; i < 6; i++) {
      const a = 1.1 + i * 1.05, r = 1.45 + rnd(i, 7) * 0.55;
      d2.paint.rock(0.12 + rnd(i, 8) * 0.12, i % 3 ? PAL.sand : PAL.sandDark,
        { at: [Math.sin(a) * r, 0.08, Math.cos(a) * r], detail: 0, seed: i + 11 });
    }
    d2.glow.tube([onShaft(0.62, 1.55, 0.005), onShaft(0.5, 1.8, 0.005), onShaft(0.64, 2.05, 0.005), onShaft(0.55, 2.3, 0.005)],
      [0.022, 0.016, 0.014, 0.004], gc, { sides: 4 });
    d2.glow.tube([onShaft(3.7, 1.95, 0.005), onShaft(3.85, 1.7, 0.005), onShaft(3.75, 1.45, 0.005)],
      [0.02, 0.014, 0.004], gc, { sides: 4 });
  });
}

function spireView(team) {
  const def = spireModel(team);
  const v = structView('spire', team, def, { deploy: 'none' });
  const { aim, crystal, shards, roof, banner } = v.parts;
  const gC = v.glow.crystal, gS = v.glow.shards;
  const shY = shards.userData.home.y;
  let lvl = -1, spin = 0, orbit = 0, tilt = 0;
  applyDamage(v, 0);
  v.animate = (dt, s, a) => {
    const L = damageLevel(s.hpFrac);
    if (L !== lvl) { lvl = L; applyDamage(v, L); banner.scale.y = L > 1 ? 0.72 : 1; }
    tilt = damp(tilt, L === 0 ? 0 : L === 1 ? 0.07 : 0.16, 3, dt);
    roof.rotation.z = tilt;

    const t = s.time + a.seed;
    const b = buildUp(s.attackT, s.windup), hit = impact(s.attackT, s.windup, 0.3);
    spin += dt * (0.5 + 3 * b);
    orbit += dt * (1.1 + 3.5 * b);
    if (spin > 1e4) spin -= 2 * PI * 1000;
    if (orbit > 1e4) orbit -= 2 * PI * 1000;
    const hasT = s.aimYaw !== null && s.aimYaw !== undefined;
    aim.rotation.y = aimLocal(v, s, aim.rotation.y, 5, dt);
    crystal.rotation.x = damp(crystal.rotation.x, hasT ? 0.2 + 0.12 * b : 0, 6, dt);
    crystal.rotation.y = spin;
    crystal.position.y = Math.sin(t * 1.6) * 0.03;
    crystal.scale.setScalar(1 + 0.24 * b - 0.1 * hit);
    if (gC) gC.color.setScalar(1 + 1.1 * b + 0.9 * hit + 0.06 * Math.sin(t * 2.3));
    shards.rotation.y = orbit;
    shards.position.y = shY + Math.sin(t * 1.2) * 0.05;
    if (gS) gS.color.setScalar(0.9 + 0.7 * b + 0.6 * hit);
    banner.rotation.x = -0.03 + Math.sin(t * 1.3) * 0.04;
  };
  return v;
}

// ═════════════════════════════════════ CITADEL ═════════════════════════════════════

const CIT_PLINTH = [[1.92, 0], [1.92, 0.12], [1.8, 0.18], [1.78, 0.26], [0, 0.26]];
const CIT_TURRET = [[0.46, 0.26], [0.44, 1.62], [0.53, 1.68], [0.53, 1.86], [0.45, 1.86]];
const CIT_ROOF = [[0.6, 1.84], [0.58, 1.92], [0.3, 2.24], [0, 2.6]];
const CIT_DRUM = [[1.1, 1.3], [1.06, 3.12]];
const TURRET_R = 1.56;   // turrets sit on the diagonals at (±1.1, ±1.1)

function citadelModel(team) {
  return defineModel(`citadel:${team}`, (m) => {
    const pal = teamPalette(team);
    const gc = glowOf(pal);

    const base = m.part('base');
    const P = base.paint, M = base.metal, G = base.glow;
    P.lathe(CIT_PLINTH, PAL.stone, { seg: 8, phase: PI / 8, flat: true, c2: PAL.stoneDark });
    P.box(2.36, 1.1, 2.36, PAL.sand, { at: [0, 0.81, 0], bevel: 0.06, c2: PAL.sandDark });
    P.box(2.46, 0.08, 2.46, PAL.sandLight, { at: [0, 1.33, 0], bevel: 0.03 });
    P.ring(4, (b) => {
      for (let k = -1; k <= 1; k++) b.box(0.26, 0.2, 0.14, PAL.sandLight, { at: [k * 0.5, 1.47, 1.14], bevel: 0.025 });
    });
    // corner turrets with tiled team roofs (the front-left roof is its own part)
    P.ring(4, (b, i) => b.group({ at: [0, 0, TURRET_R] }, (g) => {
      g.lathe(CIT_TURRET, PAL.sandLight, { seg: 10, c2: PAL.sand });
      if (i !== 0) g.lathe(CIT_ROOF, pal.main, { seg: 8, flat: true, c2: pal.dark });
    }), PI / 4);
    M.ring(4, (b, i) => {
      if (i !== 0) b.sphere(0.07, pal.trim, { at: [0, 2.62, TURRET_R], seg: 8, rings: 4 });
    }, PI / 4);
    G.ring(4, (b) => b.box(0.06, 0.2, 0.05, gc, { at: [0, 1.15, TURRET_R + 0.43], bevel: 0.01 }), PI / 4);
    // central drum with corbelled top and a glowing rune band
    P.lathe(CIT_DRUM, PAL.sand, { seg: 16, cap: false, c2: PAL.sandDark });
    P.torus(profR(CIT_DRUM, 1.75) + 0.01, 0.04, PAL.sandLight, { at: [0, 1.75, 0], seg: 20, tube: 5 });
    P.lathe([[1.0, 3.05], [1.2, 3.28], [1.2, 3.42], [0, 3.42]], PAL.sandLight, { seg: 16 });
    G.torus(1.205, 0.022, gc, { at: [0, 3.35, 0], seg: 24, tube: 4 });
    G.ring(6, (b, i) => {
      if (i !== 0) b.box(0.08, 0.26, 0.05, gc, { at: [0, 2.6, profR(CIT_DRUM, 2.6) - 0.01], bevel: 0.01 });
    });
    // gate
    P.extrude(arch(0.4, 0.95), 0.08, PAL.woodDark, { at: [0, 0.26, 1.16] });
    P.tube(archPath(0.42, 0.97, 0.26, 1.2), 0.065, PAL.sandLight, { sides: 5 });
    M.box(0.78, 0.045, 0.03, PAL.iron, { at: [0, 0.5, 1.205], bevel: 0.01 });
    M.box(0.78, 0.045, 0.03, PAL.iron, { at: [0, 0.8, 1.205], bevel: 0.01 });
    M.box(0.04, 0.9, 0.03, PAL.iron, { at: [0, 0.71, 1.205], bevel: 0.01 });
    M.mirrorX((b) => {
      b.limb([0.6, 0.98, 1.17], [0.66, 1.02, 1.28], 0.018, 0.018, PAL.iron);
      b.cyl(0.06, 0.04, 0.06, PAL.iron, { at: [0.66, 1.1, 1.28], seg: 6 });
    });
    G.mirrorX((b) => b.sphere(0.05, gc, { at: [0.66, 1.03, 1.28], seg: 6, rings: 4 }));
    // side banners on the keep walls
    P.mirrorX((b) => b.group({ at: [1.215, 1.28, 0], rot: [0, PI / 2, 0] }, (g) => {
      g.extrude(BANNER, 0.04, pal.main, { c2: pal.dark });
      g.extrude(DIAMOND, 0.02, pal.trim, { at: [0, -0.34, 0.025] });
    }));

    const crown = m.part('crown');
    crown.paint.ring(10, (b) => b.box(0.3, 0.32, 0.16, PAL.sandLight, { at: [0, 3.58, 1.1] }), PI / 10);
    const crownB = m.part('crownBroken');
    crownB.paint.ring(10, (b, i) => {
      if (i === 2 || i === 5 || i === 6 || i === 9) return;
      const h = i === 3 || i === 8 ? 0.15 : 0.32;
      b.box(0.3, h, 0.16, PAL.sandDark, { at: [0, 3.42 + h / 2, 1.1], rot: i === 3 ? [0.3, 0, 0.2] : undefined });
    }, PI / 10);

    // front-left turret roof, hinged on its inner edge so it sags outward when damaged
    const tx = TURRET_R * Math.SQRT1_2;
    const roof1 = m.part('roof1', { pivot: [tx - 0.55, 1.86, tx] });
    roof1.paint.lathe(CIT_ROOF, pal.main, { at: [tx, 0, tx], seg: 8, flat: true, c2: pal.dark });
    roof1.paint.sphere(0.07, pal.trim, { at: [tx, 2.62, tx], seg: 8, rings: 4 });

    const ban = m.part('banner', { pivot: [0, 3.03, 1.11] });
    ban.paint.extrude([[-0.3, 0], [-0.3, -0.95], [0, -0.78], [0.3, -0.95], [0.3, 0]], 0.04, pal.main,
      { at: [0, 3.02, 1.11], c2: pal.dark });
    ban.paint.extrude(DIAMOND, 0.02, pal.trim, { at: [0, 2.6, 1.135], scale: 1.3 });
    ban.paint.cyl(0.03, 0.03, 0.72, PAL.woodDark, { at: [0, 3.03, 1.11], rot: [0, 0, PI / 2], seg: 6 });
    ban.paint.mirrorX((b) => b.sphere(0.045, pal.trim, { at: [0.36, 3.03, 1.11], seg: 6, rings: 4 }));

    m.part('aim', { pivot: [0, 4.8, 0] });
    const core = m.part('core', { pivot: [0, 4.8, 0], parent: 'aim', ownGlow: true, cast: false });
    core.glow.crystal(0.46, 1.12, gc, { at: [0, 4.8, 0], sides: 8, top: 0.4, bottom: 0.4, c2: pal.main });
    core.glow.crystal(0.3, 1.24, mix(gc, PAL.white, 0.45), { at: [0, 4.8, 0], sides: 4, phase: PI / 8, top: 0.4, bottom: 0.4 });
    const halo = m.part('halo', { pivot: [0, 4.8, 0], parent: 'aim', cast: false });
    halo.metal.torus(0.74, 0.035, pal.trim, { at: [0, 4.8, 0], seg: 24, tube: 5 });
    halo.metal.ring(4, (b) => b.sphere(0.065, PAL.gold, { at: [0, 4.8, 0.74], seg: 8, rings: 4 }));
    const sh = m.part('shards', { pivot: [0, 4.8, 0], ownGlow: true, cast: false });
    sh.glow.ring(4, (b, i) => b.crystal(0.09, 0.3, gc, { at: [0, 4.8 + (i % 2 ? 0.1 : -0.1), 1.02], rot: [0.25, 0, 0], sides: 4 }));

    const drumAt = (a, y, out = 0) => {
      const r = profR(CIT_DRUM, y) + out;
      return [Math.sin(a) * r, y, Math.cos(a) * r];
    };
    const d1 = m.part('debris1');
    d1.paint.ball(0.2, 0.24, 0.08, PAL.rockDark, { at: drumAt(2.2, 2.3), rot: [0, 2.2, 0] });
    d1.paint.ball(0.16, 0.2, 0.07, PAL.rockDark, { at: drumAt(-0.8, 2.95), rot: [0, -0.8, 0] });
    d1.paint.ball(0.18, 0.12, 0.06, PAL.rockDark, { at: [-0.7, 0.95, 1.185] });
    for (let i = 0; i < 6; i++) {
      const a = 0.3 + i * 1.1, r = 2.0 + rnd(i, 5) * 0.4;
      d1.paint.rock(0.12 + rnd(i, 6) * 0.1, i % 2 ? PAL.sandLight : PAL.sand,
        { at: [Math.sin(a) * r, 0.07, Math.cos(a) * r], detail: 0, seed: i + 21 });
    }
    const d2 = m.part('debris2');
    d2.paint.ball(0.24, 0.3, 0.09, PAL.rockDark, { at: drumAt(0.55, 2.0), rot: [0, 0.55, 0] });
    d2.paint.ball(0.18, 0.22, 0.08, PAL.rockDark, { at: drumAt(3.5, 2.7), rot: [0, 3.5, 0] });
    d2.paint.ball(0.2, 0.14, 0.07, PAL.rockDark, { at: [1.185, 0.85, -0.4], rot: [0, PI / 2, 0] });
    for (let i = 0; i < 8; i++) {
      const a = 0.9 + i * 0.8, r = 1.95 + rnd(i, 9) * 0.5;
      d2.paint.rock(0.14 + rnd(i, 10) * 0.14, i % 3 ? PAL.sand : PAL.sandDark,
        { at: [Math.sin(a) * r, 0.09, Math.cos(a) * r], detail: 0, seed: i + 31 });
    }
    d2.glow.tube([drumAt(0.55, 2.25, 0.005), drumAt(0.42, 2.5, 0.005), drumAt(0.58, 2.75, 0.005), drumAt(0.48, 3.0, 0.005)],
      [0.025, 0.018, 0.015, 0.004], gc, { sides: 4 });
    d2.glow.tube([drumAt(3.5, 2.45, 0.005), drumAt(3.66, 2.2, 0.005), drumAt(3.55, 1.9, 0.005)],
      [0.022, 0.016, 0.004], gc, { sides: 4 });
  });
}

function citadelView(team) {
  const def = citadelModel(team);
  const v = structView('citadel', team, def, { deploy: 'none' });
  const { aim, core, halo, shards, roof1, banner } = v.parts;
  const gCore = v.glow.core, gS = v.glow.shards;
  const aimY = aim.userData.home.y, shY = shards.userData.home.y, roofY = roof1.userData.home.y;
  let lvl = -1, spin = 0, orbit = 0, act = -1, sag = 0;
  applyDamage(v, 0);
  v.animate = (dt, s, a) => {
    const L = damageLevel(s.hpFrac);
    if (L !== lvl) { lvl = L; applyDamage(v, L); banner.scale.y = L > 1 ? 0.7 : 1; }
    sag = damp(sag, L === 0 ? 0 : L === 1 ? 0.22 : 0.48, 3, dt);
    roof1.rotation.z = -sag;
    roof1.position.y = roofY - (sag > 0.3 ? (sag - 0.3) * 0.5 : 0);

    const on = s.active !== false;
    act = act < 0 ? (on ? 1 : 0) : damp(act, on ? 1 : 0, 1.6, dt);
    const t = s.time + a.seed;
    const b = buildUp(s.attackT, s.windup), hit = impact(s.attackT, s.windup, 0.3);
    spin += dt * (0.15 + 0.85 * act + 2.4 * b);
    orbit += dt * (0.3 + 0.9 * act + 2.6 * b);
    if (spin > 1e4) spin -= 2 * PI * 1000;
    if (orbit > 1e4) orbit -= 2 * PI * 1000;
    const hasT = s.aimYaw !== null && s.aimYaw !== undefined;
    aim.rotation.y = aimLocal(v, s, aim.rotation.y, 4, dt);
    const lift = -0.78 * (1 - act) + Math.sin(t * 1.4) * 0.05 * act;
    aim.position.y = aimY + lift;
    core.rotation.x = damp(core.rotation.x, hasT ? 0.14 * act + 0.1 * b : 0, 5, dt);
    core.rotation.y = spin;
    core.scale.setScalar(1 + 0.18 * b - 0.08 * hit);
    halo.rotation.set(0.05 + 0.25 * act, -spin * 0.7, 0);
    const dorm = 0.3 + 0.12 * Math.sin(t * 0.9);
    const live = 1 + 0.07 * Math.sin(t * 2.3) + 1.0 * b + 0.8 * hit;
    if (gCore) gCore.color.setScalar(dorm + (live - dorm) * act);
    shards.visible = act > 0.03;
    shards.scale.setScalar(act > 0.001 ? act : 0.001);
    shards.rotation.y = orbit;
    shards.position.y = shY + lift + Math.sin(t * 1.1) * 0.06;
    if (gS) gS.color.setScalar(0.9 + 0.6 * b + 0.5 * hit);
    banner.rotation.x = -0.03 + Math.sin(t * 1.1) * 0.035;
  };
  return v;
}

// ═════════════════════════════════════ RUINS ═════════════════════════════════════

function ruinModel(kind, team) {
  return defineModel(`ruin:${kind}:${team}`, (m) => {
    const pal = teamPalette(team);
    const dim = mix(pal.glow, PAL.rockDark, 0.35);
    const body = m.part('body');
    const P = body.paint, M = body.metal, G = body.glow;
    const rubble = (n, r0, r1, y, size, seed) => {
      for (let i = 0; i < n; i++) {
        const a = rnd(i, seed) * 2 * PI, r = r0 + rnd(i, seed + 1) * (r1 - r0);
        const c = i % 3 === 0 ? PAL.sandDark : i % 3 === 1 ? PAL.sand : PAL.stone;
        P.rock(size * (0.6 + rnd(i, seed + 2) * 0.8), c,
          { at: [Math.sin(a) * r, y, Math.cos(a) * r], detail: 0, seed: i + seed, scale: [1, 0.7, 1] });
      }
    };
    if (kind === 'citadel') {
      P.lathe(CIT_PLINTH, PAL.stone, { seg: 8, phase: PI / 8, flat: true, c2: PAL.stoneDark });
      // broken keep walls: uneven blocks along each side, some missing
      P.ring(4, (b, side) => {
        for (let k = -2; k <= 2; k++) {
          const q = side * 5 + k + 2;
          if (rnd(q, 41) < 0.22) continue;
          const h = 0.2 + rnd(q, 42) * 0.7;
          b.box(0.44, h, 0.26, rnd(q, 43) < 0.5 ? PAL.sand : PAL.sandDark,
            { at: [k * 0.46, 0.26 + h / 2, 1.06], rot: [0, 0, (rnd(q, 44) - 0.5) * 0.2] });
        }
      });
      // turret stumps
      P.ring(4, (b, i) => {
        const h = 0.5 + rnd(i, 45) * 0.6;
        b.cyl(0.42, 0.46, h, PAL.sandLight, { at: [0, 0.26 + h / 2, TURRET_R], seg: 10, c2: PAL.sand });
      }, PI / 4);
      // drum stump with a jagged crown of blocks and a dark hollow
      P.lathe([[1.1, 0.26], [1.08, 1.2]], PAL.sand, { seg: 16, c2: PAL.sandDark });
      P.cyl(0.92, 0.92, 0.04, PAL.rockDark, { at: [0, 1.21, 0], seg: 16 });
      P.ring(11, (b, i) => {
        if (rnd(i, 46) < 0.25) return;
        const h = 0.15 + rnd(i, 47) * 0.55;
        b.box(0.48, h, 0.22, i % 2 ? PAL.sand : PAL.sandLight,
          { at: [0, 1.2 + h / 2, 0.98], rot: [(rnd(i, 48) - 0.5) * 0.2, 0, (rnd(i, 49) - 0.5) * 0.3] });
      });
      P.tube(archPath(0.42, 0.97, 0.26, 1.2).slice(0, 6), 0.065, PAL.sandLight, { sides: 5 });
      rubble(18, 1.3, 2.4, 0.1, 0.2, 50);
      // a fallen turret roof and draped banners
      P.lathe(CIT_ROOF, pal.main, { at: [1.75, 0.3, -1.25], rot: [1.2, 0.6, 0.3], seg: 8, flat: true, c2: pal.dark });
      P.extrude(BANNER, 0.03, pal.main, { at: [-1.05, 1.3, 1.2], rot: [-0.35, 0.2, 0.15], c2: pal.dark });
      P.extrude(BANNER, 0.03, pal.main, { at: [0.6, 0.3, -1.6], rot: [-1.35, 0.9, 0], c2: pal.dark });
      // the shattered core
      G.crystal(0.42, 0.75, dim, { at: [0.25, 1.42, 0.1], rot: [1.2, 0.4, 0.3], sides: 8, bright: 0.3 });
      G.crystal(0.3, 0.6, dim, { at: [-0.35, 1.35, -0.25], rot: [-1.0, 0.2, 0.6], sides: 8, bright: 0.25 });
      G.crystal(0.1, 0.3, dim, { at: [1.6, 0.12, 0.9], rot: [1.4, 0, 0.3], sides: 4, bright: 0.3 });
      M.torus(0.74, 0.035, pal.trim, { at: [-0.9, 0.3, -1.65], rot: [1.3, 0, 0.2], seg: 20, tube: 5 });
    } else {
      spirePlinth(P);
      P.lathe([[0.99, 0.68], [0.96, 1.0]], PAL.sand, { seg: 12, c2: PAL.sandDark });
      P.cyl(0.8, 0.8, 0.04, PAL.rockDark, { at: [0, 1.0, 0], seg: 12 });
      P.ring(10, (b, i) => {
        if (rnd(i, 2) < 0.25) return;
        const h = 0.15 + rnd(i, 1) * 0.6;
        b.box(0.36, h, 0.24, i % 2 ? PAL.sand : PAL.sandLight,
          { at: [0, 1.0 + h / 2, 0.86], rot: [(rnd(i, 3) - 0.5) * 0.2, 0, (rnd(i, 4) - 0.5) * 0.3] });
      });
      rubble(12, 1.1, 1.9, 0.08, 0.17, 10);
      P.box(0.5, 0.06, 0.4, pal.main, { at: [1.25, 0.28, -0.75], rot: [0.3, 0.5, 0.25] });
      P.box(0.42, 0.06, 0.34, pal.dark, { at: [-1.4, 0.12, -0.6], rot: [-0.2, 1.1, 0.15] });
      P.extrude(BANNER, 0.03, pal.main, { at: [-0.75, 0.62, 1.15], rot: [-1.05, 0.35, 0.1], c2: pal.dark });
      P.extrude(DIAMOND, 0.02, pal.trim, { at: [-0.75, 0.42, 1.38], rot: [-1.05, 0.35, 0.1] });
      G.crystal(0.2, 0.45, dim, { at: [0.15, 1.2, 0.1], rot: [1.1, 0.3, 0.2], sides: 6, bright: 0.32 });
      G.crystal(0.12, 0.3, dim, { at: [-0.3, 1.12, -0.25], rot: [-0.9, 0.2, 0.7], sides: 6, bright: 0.28 });
      G.crystal(0.07, 0.2, dim, { at: [1.3, 0.1, 0.6], rot: [1.4, 0, 0.3], sides: 4, bright: 0.3 });
      M.tube([[0.9, 0.08, -1.3], [1.15, 0.12, -1.2], [1.3, 0.1, -0.95]], 0.03, pal.trim, { sides: 5 });
    }
  });
}

/** Static rubble left where a tower fell. Shares cached geometry; nothing to dispose. */
export function ruinView(kind, team) {
  const t = team === 1 ? 1 : 0;
  return staticGroup(ruinModel(kind === 'citadel' ? 'citadel' : 'spire', t), { cast: true, receive: true });
}

// ═════════════════════════════════════ SENTRY PRISM ═════════════════════════════════════

function sentryModel(team) {
  return defineModel(`sentry:${team}`, (m) => {
    const pal = teamPalette(team);
    const gc = glowOf(pal);
    const base = m.part('base', { assemble: [0, 0.5], ownGlow: true });
    const P = base.paint, M = base.metal, G = base.glow;
    P.lathe([[0.72, 0], [0.74, 0.1], [0.66, 0.16], [0.6, 0.5], [0.67, 0.56], [0.67, 0.64], [0.52, 0.68]],
      PAL.stone, { seg: 8, flat: true, c2: PAL.stoneDark });
    P.torus(0.675, 0.035, pal.main, { at: [0, 0.6, 0], seg: 8, tube: 5 });
    P.cyl(0.5, 0.52, 0.06, PAL.stoneLight, { at: [0, 0.7, 0], seg: 12 });
    // rune glyphs carved into four faces
    G.ring(4, (b) => b.group({ at: [0, 0.33, 0.585], rot: [-0.16, 0, 0] }, (g) => {
      g.box(0.045, 0.2, 0.03, gc, { bevel: 0 });
      g.box(0.15, 0.04, 0.03, gc, { at: [0, 0.05, 0], bevel: 0 });
      g.box(0.04, 0.1, 0.03, gc, { at: [0.06, -0.06, 0], rot: [0, 0, 0.6], bevel: 0 });
    }), PI / 8);
    G.sphere(0.08, gc, { at: [0, 0.78, 0], seg: 8, rings: 5 });
    M.torus(0.14, 0.03, PAL.brass, { at: [0, 0.74, 0], seg: 10, tube: 4 });
    // three brass prongs reaching up to cradle the crystal
    M.ring(3, (b) => {
      b.tube([[0, 0.64, 0.5], [0, 0.95, 0.56], [0, 1.25, 0.5], [0, 1.44, 0.38]], [0.065, 0.055, 0.045, 0.028],
        PAL.brass, { sides: 6 });
      b.sphere(0.045, PAL.gold, { at: [0, 1.46, 0.36], seg: 6, rings: 4 });
      b.torus(0.075, 0.025, PAL.iron, { at: [0, 0.68, 0.5], seg: 8, tube: 4 });
    }, PI);
    P.ring(3, (b) => b.box(0.16, 0.1, 0.06, pal.main, { at: [0, 0.82, 0.57], bevel: 0.02 }), PI);

    const tur = m.part('turret', { pivot: [0, 1.52, 0], assemble: [0.5, 1], ownGlow: true, cast: false });
    tur.glow.crystal(0.24, 0.66, gc, { at: [0, 1.52, 0], rot: [PI / 2, 0, 0], sides: 6, top: 0.38, bottom: 0.3, c2: pal.main });
    tur.metal.torus(0.235, 0.03, pal.trim, { at: [0, 1.52, -0.04], rot: [PI / 2, 0, 0], seg: 12, tube: 4 });
    tur.metal.mirrorX((b) => b.box(0.14, 0.03, 0.12, PAL.brass, { at: [0.3, 1.52, -0.05], bevel: 0.01 }));
  });
}

function sentryView(team) {
  const def = sentryModel(team);
  const v = structView('sentry', team, def);
  const tur = v.parts.turret;
  const home = tur.userData.home;
  const gT = v.glow.turret, gB = v.glow.base;
  let spin = 0;
  v.animate = (dt, s, a) => {
    const t = s.time + a.seed;
    const life = 0.4 + 0.6 * clamp01(s.lifeFrac);
    const b = buildUp(s.attackT, s.windup), hit = impact(s.attackT, s.windup, 0.22);
    const yaw = aimLocal(v, s, tur.rotation.y, 7, dt);
    spin += dt * (0.8 + 7 * b);
    if (spin > 1e4) spin -= 2 * PI * 1000;
    tur.rotation.y = yaw;
    tur.rotation.z = spin;                 // Euler XYZ: rolls about the crystal's own axis, then aims
    const kick = 0.13 * hit;
    tur.position.set(home.x - Math.sin(yaw) * kick, home.y + Math.sin(t * 2.1) * 0.035, home.z - Math.cos(yaw) * kick);
    if (gT) gT.color.setScalar(life * (1 + 1.4 * b + 1.1 * hit));
    if (gB) gB.color.setScalar(life * (0.85 + 0.15 * Math.sin(t * 2.4)));
  };
  return v;
}

// ═════════════════════════════════════ GLIMMER NEST ═════════════════════════════════════

function nestModel(team) {
  return defineModel(`nest:${team}`, (m) => {
    const pal = teamPalette(team);
    const gc = glowOf(pal);
    const shell = m.part('shell', { assemble: [0, 0.6], ownGlow: true });
    const P = shell.paint;
    P.lathe([[0.78, 0], [0.96, 0.2], [0.98, 0.46], [0.86, 0.66], [0.7, 0.72], [0.6, 0.6], [0, 0.5]],
      PAL.rock, { seg: 9, flat: true, c2: PAL.rockDark });
    P.lathe([[0.68, 0.735], [0.58, 0.615], [0, 0.515]], pal.dark, { seg: 9, flat: true, cap: false });
    // broken shell petals leaning outward, with a gap at the front where it cracked open
    P.ring(7, (b, i) => {
      if (i === 0) return;
      const hs = 0.85 + rnd(i, 61) * 0.55;
      b.rock(0.32, i % 2 ? PAL.rock : PAL.rockDark,
        { at: [0, 0.7 + 0.28 * hs, 0.79], scale: [0.72, hs, 0.34], rot: [0.32, 0, 0], detail: 0, jitter: 0.25, seed: i + 60 });
    });
    // aether leaking through cracks in the rock
    shell.glow.ring(3, (b) => b.tube([[0, 0.08, 0.83], [0.08, 0.22, 0.95], [0.02, 0.36, 0.99], [0.1, 0.5, 0.95]],
      [0.018, 0.02, 0.016, 0.004], gc, { sides: 4 }));   // phase 0: on the shell's lathe vertices

    const cr = m.part('crystals', { pivot: [0, 0.5, 0], assemble: [0.35, 1], ownGlow: true, cast: false });
    cr.glow.crystal(0.27, 1.15, gc, { at: [0, 1.07, 0], sides: 6, top: 0.3, bottom: 0.18, c2: pal.dark });
    cr.glow.ring(6, (b, i) => {
      const r = 0.12 + rnd(i, 63) * 0.05, h = 0.5 + rnd(i, 64) * 0.25;
      b.crystal(r, h, gc, { at: [0, 0.82, 0.34], rot: [0.55 + rnd(i, 65) * 0.2, 0, 0], sides: 5, c2: pal.main });
    }, 0.4);
  });
}

function nestView(team) {
  const def = nestModel(team);
  const v = structView('nest', team, def);
  const { shell, crystals } = v.parts;
  const gC = v.glow.crystals, gS = v.glow.shell;
  const period = UNITS.nest.spawn ? UNITS.nest.spawn.interval : 4.5;
  let turn = 0;
  v.animate = (dt, s, a) => {
    const t = s.time + a.seed;
    const life = 0.45 + 0.55 * clamp01(s.lifeFrac);
    const st = s.stateTime > 0 ? s.stateTime : 0;
    const ph = (st + period - 1.2) % period;          // peaks just before each hatch
    const bul = smoothstep(period - 1.1, period - 0.4, ph) * (1 - smoothstep(period - 0.4, period, ph));
    crystals.scale.set(1 + 0.1 * bul, 1 + 0.16 * bul, 1 + 0.1 * bul);
    shell.scale.set(1 + 0.05 * bul, 1 - 0.03 * bul, 1 + 0.05 * bul);
    turn += dt * 0.15;
    if (turn > 1e4) turn -= 2 * PI * 1000;
    crystals.rotation.y = turn;
    const pulse = Math.sin(t * 3.2);
    if (gC) gC.color.setScalar(life * (1 + 0.15 * pulse + 0.9 * bul));
    if (gS) gS.color.setScalar(life * (0.8 + 0.2 * pulse + 0.6 * bul));
  };
  return v;
}

// ═════════════════════════════════════ SKYREACH BOMBARD ═════════════════════════════════════

const BARREL_ELEV = PI / 6;      // tilt from vertical: the barrel points 60° above the horizon
const BARREL_DY = Math.cos(BARREL_ELEV), BARREL_DZ = Math.sin(BARREL_ELEV);

function bombardModel(team) {
  return defineModel(`bombard:${team}`, (m) => {
    const pal = teamPalette(team);
    const gc = glowOf(pal);
    const base = m.part('base', { assemble: [0, 0.45] });
    base.paint.lathe([[0.84, 0], [0.86, 0.1], [0.78, 0.16], [0.76, 0.3], [0.62, 0.32]], PAL.stone,
      { seg: 8, flat: true, c2: PAL.stoneDark });
    base.metal.torus(0.77, 0.035, PAL.brass, { at: [0, 0.3, 0], seg: 16, tube: 5 });

    const plat = m.part('platform', { pivot: [0, 0.32, 0], assemble: [0.3, 0.75] });
    const P = plat.paint, M = plat.metal;
    P.cyl(0.68, 0.7, 0.1, PAL.wood, { at: [0, 0.37, 0], seg: 14 });
    for (let k = -2; k <= 2; k++) {
      const z = k * 0.22, w = 2 * Math.sqrt(Math.max(0.01, 0.66 * 0.66 - z * z));
      P.box(w, 0.014, 0.025, PAL.woodDark, { at: [0, 0.423, z], bevel: 0 });
    }
    P.mirrorX((b) => {
      b.extrude([[-0.36, 0.42], [0.34, 0.42], [0.18, 0.92], [-0.12, 0.92]], 0.12, PAL.woodDark,
        { at: [0.3, 0, 0], rot: [0, PI / 2, 0], bevel: 0.02 });
      b.extrude([[-0.1, 0.1], [0.1, 0.1], [0.1, -0.04], [0, -0.12], [-0.1, -0.04]], 0.03, pal.main,
        { at: [0.375, 0.6, 0.06], rot: [0, PI / 2, 0] });
      b.extrude(DIAMOND, 0.02, pal.trim, { at: [0.392, 0.6, 0.06], rot: [0, PI / 2, 0], scale: 0.4 });
    });
    // team pennant at the back
    P.cyl(0.02, 0.025, 1.0, PAL.woodDark, { at: [-0.5, 0.92, -0.42], seg: 6 });
    P.extrude(FLAG, 0.02, pal.main, { at: [-0.5, 1.4, -0.42], c2: pal.dark });
    P.sphere(0.035, pal.trim, { at: [-0.5, 1.44, -0.42], seg: 6, rings: 4 });
    M.torus(0.68, 0.03, PAL.brass, { at: [0, 0.33, 0], seg: 16, tube: 4 });
    M.ring(16, (b) => b.box(0.05, 0.07, 0.06, PAL.brass, { at: [0, 0.35, 0.71], bevel: 0 }));
    M.cyl(0.07, 0.07, 0.8, PAL.iron, { at: [0, 0.76, 0], rot: [0, 0, PI / 2], seg: 8 });
    M.mirrorX((b) => b.cyl(0.1, 0.1, 0.04, PAL.brass, { at: [0.4, 0.76, 0], rot: [0, 0, PI / 2], seg: 10 }));

    const brl = m.part('barrel', { pivot: [0, 0.76, 0], parent: 'platform', ownGlow: true });
    const frame = { at: [0, 0.76, 0], rot: [BARREL_ELEV, 0, 0] };
    brl.metal.group(frame, (b) => {
      b.lathe([[0, -0.3], [0.18, -0.28], [0.25, -0.16], [0.27, 0.06], [0.21, 0.3], [0.21, 0.5], [0.28, 0.56],
        [0.29, 0.66], [0.2, 0.66], [0.17, 0.4]], PAL.brass, { seg: 14 });
      b.torus(0.258, 0.03, PAL.iron, { at: [0, -0.08, 0], seg: 14, tube: 4 });
      b.torus(0.215, 0.025, PAL.iron, { at: [0, 0.44, 0], seg: 14, tube: 4 });
    });
    brl.paint.group(frame, (b) => b.torus(0.236, 0.035, pal.main, { at: [0, 0.2, 0], seg: 14, tube: 5 }));
    brl.glow.group(frame, (b) => b.cyl(0.165, 0.165, 0.02, gc, { at: [0, 0.42, 0], seg: 12 }));
  });
}

function bombardView(team) {
  const def = bombardModel(team);
  const v = structView('bombard', team, def);
  const { platform, barrel } = v.parts;
  const home = barrel.userData.home;
  const gB = v.glow.barrel;
  v.animate = (dt, s, a) => {
    const t = s.time + a.seed;
    const life = 0.5 + 0.5 * clamp01(s.lifeFrac);
    const b = buildUp(s.attackT, s.windup), hit = impact(s.attackT, s.windup, 0.45);
    platform.rotation.y = aimLocal(v, s, platform.rotation.y, 2.5, dt);
    const rec = 0.16 * hit;
    barrel.position.set(home.x, home.y - BARREL_DY * rec, home.z - BARREL_DZ * rec);
    barrel.rotation.x = -0.1 * hit + 0.025 * b * Math.sin(t * 47);
    const puff = 0.1 * hit;
    barrel.scale.set(1 + puff, 1 - puff + 0.05 * b, 1 + puff);
    v.body.scale.set(1 + 0.03 * hit, 1 - 0.05 * hit, 1 + 0.03 * hit);
    if (gB) gB.color.setScalar(life * (0.3 + 0.05 * Math.sin(t * 3)) + 2.6 * b + 1.6 * hit);
  };
  return v;
}

// ═════════════════════════════════════ AETHER WELL ═════════════════════════════════════

function aetherwellModel(team) {
  return defineModel(`aetherwell:${team}`, (m) => {
    const pal = teamPalette(team);
    const gc = glowOf(pal);
    const base = m.part('base', { assemble: [0, 0.55], ownGlow: true });
    const P = base.paint, M = base.metal, G = base.glow;
    P.lathe([[0.8, 0], [0.84, 0.08], [0.8, 0.5], [0.84, 0.56], [0.82, 0.62], [0.62, 0.62], [0.6, 0.42], [0, 0.42]],
      PAL.stone, { seg: 12, flat: true, c2: PAL.stoneDark });
    P.ring(12, (b, i) => b.box(0.34, 0.15, 0.08, i % 2 ? PAL.stoneLight : PAL.stone,
      { at: [0, 0.27, 0.8], bevel: 0.025 }), PI / 12);
    P.torus(0.835, 0.035, pal.main, { at: [0, 0.53, 0], seg: 12, tube: 5 });
    // pump post with a team pennant
    P.cyl(0.06, 0.075, 0.95, PAL.wood, { at: [-0.74, 0.97, 0], seg: 8 });
    P.limb([-0.74, 0.75, 0], [-0.6, 0.6, 0], 0.03, 0.03, PAL.woodDark);
    P.extrude(FLAG, 0.02, pal.main, { at: [-0.74, 1.6, 0], rot: [0, PI / 2, 0], c2: pal.dark });
    P.cyl(0.018, 0.018, 0.26, PAL.woodDark, { at: [-0.74, 1.55, 0], seg: 5 });
    P.sphere(0.035, pal.trim, { at: [-0.74, 1.69, 0], seg: 6, rings: 4 });
    M.torus(0.72, 0.025, PAL.brass, { at: [0, 0.625, 0], seg: 12, tube: 4 });
    M.tube([[-0.67, 0.6, 0.32], [-0.64, 0.86, 0.32], [-0.55, 0.94, 0.3], [-0.45, 0.9, 0.27]], 0.035, PAL.brass, { sides: 6 });
    M.cyl(0.05, 0.04, 0.05, PAL.copper, { at: [-0.44, 0.88, 0.27], seg: 8 });
    G.cyl(0.6, 0.6, 0.02, gc, { at: [0, 0.43, 0], seg: 12 });
    G.ring(4, (b) => b.sphere(0.035, gc, { at: [0, 0.64, 0.73], seg: 6, rings: 4 }), PI / 4);

    const arm = m.part('arm', { pivot: [-0.74, 1.36, 0], assemble: [0.45, 0.8] });
    arm.metal.limb([-1.08, 1.33, 0], [-0.34, 1.38, 0], 0.035, 0.03, PAL.brass);
    arm.metal.sphere(0.07, PAL.iron, { at: [-0.74, 1.36, 0], seg: 8, rings: 5 });
    arm.metal.limb([-0.38, 1.38, 0], [-0.38, 1.0, 0], 0.022, 0.022, PAL.iron);
    arm.paint.capsule(0.045, 0.14, PAL.woodDark, { at: [-1.13, 1.33, 0], rot: [0, 0, PI / 2] });
    arm.paint.sphere(0.06, pal.main, { at: [-1.26, 1.33, 0], seg: 8, rings: 5 });

    const orb = m.part('orb', { pivot: [0, 1.42, 0], assemble: [0.6, 1], ownGlow: true, cast: false });
    orb.glow.sphere(0.2, gc, { at: [0, 1.42, 0], seg: 12, rings: 8 });
    orb.glow.ring(3, (b, i) => b.sphere(0.035, gc, { at: [0, 1.42 + (i - 1) * 0.06, 0.28], seg: 6, rings: 4 }));
  });
}

function aetherwellView(team) {
  const def = aetherwellModel(team);
  const v = structView('aetherwell', team, def);
  const { arm, orb } = v.parts;
  const oy = orb.userData.home.y;
  const gO = v.glow.orb, gB = v.glow.base;
  const period = UNITS.aetherwell.generate ? UNITS.aetherwell.generate.interval : 8;
  let spin = 0;
  v.animate = (dt, s, a) => {
    const t = s.time + a.seed;
    const life = 0.4 + 0.6 * clamp01(s.lifeFrac);
    const ph = t * 1.9;
    arm.rotation.z = 0.26 * Math.sin(ph);
    orb.position.y = oy + 0.12 * Math.sin(ph - 0.9);
    spin += dt * 1.2;
    if (spin > 1e4) spin -= 2 * PI * 1000;
    orb.rotation.y = spin;
    const st = s.stateTime > 0 ? s.stateTime % period : 1;
    const flare = st < 0.6 ? (1 - st / 0.6) * (1 - st / 0.6) : 0;
    orb.scale.setScalar(1 + 0.15 * flare);
    if (gO) gO.color.setScalar(life * (1 + 0.12 * Math.sin(t * 3.1)) + 1.2 * flare);
    if (gB) gB.color.setScalar(life * (0.8 + 0.2 * Math.sin(ph)) + 0.6 * flare);
  };
  return v;
}

registerUnit('spire', spireView);
registerUnit('citadel', citadelView);
registerUnit('sentry', sentryView);
registerUnit('nest', nestView);
registerUnit('bombard', bombardView);
registerUnit('aetherwell', aetherwellView);
