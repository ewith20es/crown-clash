// Aether Spires — troop models, batch 1: Warden, Arc Scout, Colossus, Glimmer, Zephyr.
// These are the reference units for the kit: each one is defineModel (geometry, cached per
// team) + unitView + an animate() that only writes numbers onto part transforms.

import { UNITS } from '../../data/cards.js';
import { registerUnit } from './registry.js';
import {
  PAL, col, mix, teamPalette, defineModel, unitView,
  swing, pose, buildUp, impact, walkLegs,
} from './kit.js';

const PI = Math.PI, TAU = PI * 2;

function troopView(type, team, def, o) {
  return unitView(type, team, def, { height: UNITS[type].height, ...o });
}

const SKIN = col(0xf0b88e);

// ═════════════════════════════════════ WARDEN ═════════════════════════════════════
// Squat clockwork knight: barrel torso, dome helm with a glowing visor, tower shield (left, +X),
// flanged mace (right, −X), a winding key turning on its back.

const SHIELD = [[-0.27, 0.3], [0, 0.36], [0.27, 0.3], [0.27, -0.2], [0.14, -0.4], [0, -0.46], [-0.14, -0.4], [-0.27, -0.2]];
const DIAMOND = [[0, 0.13], [0.09, 0], [0, -0.13], [-0.09, 0]];

function wardenModel(team) {
  return defineModel(`warden:${team}`, (m) => {
    const pal = teamPalette(team);
    const gc = mix(pal.glow, PAL.white, 0.3);

    const leg = m.part('legL', { pivot: [0.16, 0.42, 0] });
    leg.metal.limb([0.16, 0.42, 0], [0.17, 0.15, 0], 0.11, 0.09, PAL.iron, { rings: 2 });
    leg.metal.sphere(0.065, PAL.brass, { at: [0.17, 0.3, 0.075], seg: 6, rings: 3 });
    leg.metal.box(0.2, 0.12, 0.3, PAL.ironDark, { at: [0.17, 0.06, 0.04], bevel: 0.045 });
    m.part('legR', { pivot: [-0.16, 0.42, 0], copy: 'legL' });

    const torso = m.part('torso', { pivot: [0, 0.42, 0] });
    const P = torso.paint, M = torso.metal, G = torso.glow;
    P.lathe([[0.25, 0.36], [0.34, 0.44], [0.39, 0.62], [0.385, 0.84], [0.32, 0.97], [0.18, 1.0]], pal.main,
      { seg: 12, c2: pal.dark });
    P.ball(0.28, 0.13, 0.25, PAL.iron, { at: [0, 0.4, 0], seg: 10, rings: 5 });
    P.mirrorX((b) => {
      b.ball(0.17, 0.12, 0.18, pal.main, { at: [0.37, 0.97, 0], c2: pal.dark, seg: 10, rings: 5 });
      b.torus(0.15, 0.026, pal.trim, { at: [0.37, 0.92, 0], seg: 10, tube: 3 });
    });
    P.torus(0.255, 0.045, PAL.black, { at: [0, 1.15, 0], rot: [0, -0.8, 0], arc: 1.6, seg: 8, tube: 5 });
    P.tube([[0, 1.38, 0.06], [0, 1.48, -0.06], [0, 1.46, -0.22], [0, 1.36, -0.34], [0, 1.24, -0.38]],
      [0.05, 0.08, 0.08, 0.06, 0.03], pal.main, { sides: 7 });
    M.torus(0.348, 0.03, pal.trim, { at: [0, 0.47, 0], seg: 14, tube: 3 });
    M.torus(0.388, 0.03, pal.trim, { at: [0, 0.8, 0], seg: 14, tube: 3 });
    M.torus(0.085, 0.022, PAL.brass, { at: [0, 0.68, 0.385], rot: [PI / 2, 0, 0], seg: 10, tube: 3 });
    M.torus(0.2, 0.05, PAL.iron, { at: [0, 1.0, 0], seg: 12, tube: 4 });
    M.ball(0.27, 0.26, 0.27, PAL.steel, { at: [0, 1.17, 0], seg: 12, rings: 7 });
    M.torus(0.25, 0.03, pal.trim, { at: [0, 1.06, 0], seg: 12, tube: 3 });
    M.cyl(0.05, 0.065, 0.07, pal.trim, { at: [0, 1.42, 0.03], seg: 8 });
    G.torus(0.29, 0.02, gc, { at: [0, 1.15, 0], rot: [0, -0.7, 0], arc: 1.4, seg: 8, tube: 4 });
    G.sphere(0.05, gc, { at: [0, 0.68, 0.39], seg: 8, rings: 4 });

    const armL = m.part('armL', { pivot: [0.4, 0.9, 0], parent: 'torso' });
    armL.paint.limb([0.4, 0.9, 0], [0.47, 0.66, 0.08], 0.085, 0.09, PAL.iron, { rings: 2 });
    armL.paint.sphere(0.1, PAL.ironDark, { at: [0.48, 0.6, 0.12], seg: 8, rings: 5 });
    armL.paint.group({ at: [0.58, 0.64, 0.2], rot: [0, 0.4, 0] }, (b) => {
      b.extrude(SHIELD, 0.05, pal.trim, { scale: [1.1, 1.06, 1] });
      b.extrude(SHIELD, 0.08, pal.main, { c2: pal.dark });
      b.extrude(DIAMOND, 0.03, pal.light, { at: [0, 0.04, 0.045] });
      b.sphere(0.05, pal.trim, { at: [0, 0.04, 0.06], seg: 8, rings: 4 });
    });

    const armR = m.part('armR', { pivot: [-0.4, 0.9, 0], parent: 'torso' });
    const A = armR.metal;
    A.limb([-0.4, 0.9, 0], [-0.47, 0.66, 0.08], 0.085, 0.09, PAL.iron, { rings: 2 });
    A.sphere(0.1, PAL.ironDark, { at: [-0.48, 0.6, 0.12], seg: 8, rings: 5 });
    A.limb([-0.48, 0.56, 0.06], [-0.48, 0.74, 0.58], 0.032, 0.028, PAL.woodDark, { seg: 6, rings: 1 });
    A.group({ at: [-0.48, 0.756, 0.627], rot: [1.24, 0, 0] }, (b) => {
      b.cyl(0.07, 0.07, 0.24, PAL.steel, { seg: 8 });
      b.ring(6, (bb) => bb.box(0.035, 0.22, 0.09, PAL.steel, { at: [0, 0, 0.08], bevel: 0 }));
      b.cone(0.05, 0.1, pal.trim, { at: [0, 0.17, 0], seg: 8 });
      b.sphere(0.05, pal.trim, { at: [0, -0.14, 0], seg: 6, rings: 3 });
    });

    const key = m.part('key', { pivot: [0, 0.74, -0.42], parent: 'torso' });
    key.metal.limb([0, 0.74, -0.37], [0, 0.74, -0.52], 0.028, 0.028, PAL.brass, { seg: 6, rings: 1 });
    key.metal.mirrorX((b) => b.torus(0.075, 0.024, PAL.brass, { at: [0.09, 0.74, -0.55], rot: [PI / 2, 0, 0], seg: 8, tube: 3 }));
    key.metal.sphere(0.04, PAL.gold, { at: [0, 0.74, -0.55], seg: 6, rings: 3 });
  });
}

function wardenView(team) {
  const v = troopView('warden', team, wardenModel(team), { stride: 0.75 });
  const { legL, legR, torso, armL, armR, key } = v.parts;
  const ty = torso.userData.home.y;
  let keyA = 0;
  v.animate = (dt, s, a) => {
    const t = s.time + a.seed, mv = a.move, sn = Math.sin(a.walk);
    walkLegs(a, legL, legR, 0.5, 0.07);
    const p = swing(s.attackT, s.windup, s.hitSpeed);
    // heavy waddle: roll onto the planted leg, bob at each footfall
    torso.position.y = ty + Math.abs(Math.cos(a.walk)) * 0.04 * mv + Math.sin(t * 2) * 0.008 * (1 - mv);
    torso.rotation.z = sn * 0.09 * mv;
    torso.rotation.x = pose(p, -0.16, 0.05 * mv, 0.22);
    torso.rotation.y = pose(p, -0.18, sn * 0.06 * mv, 0.2);
    // overhead mace swing: lands exactly at windup
    armR.rotation.x = pose(p, -2.8, -0.25 - sn * 0.3 * mv, 0.2);
    armL.rotation.x = -0.3 + sn * 0.12 * mv + pose(p, 0.1, 0, -0.15);
    keyA += dt * (1.2 + 2.4 * mv);
    if (keyA > TAU) keyA -= TAU;
    key.rotation.z = keyA;
  };
  return v;
}

// ═════════════════════════════════════ ARC SCOUT ═════════════════════════════════════
// Small goggled tinkerer: oversized battery backpack with antenna, forked spark-rod (right hand).

function scoutModel(team) {
  return defineModel(`scout:${team}`, (m) => {
    const pal = teamPalette(team);
    const gc = mix(pal.glow, PAL.white, 0.25);

    const leg = m.part('legL', { pivot: [0.09, 0.3, 0] });
    leg.paint.limb([0.09, 0.3, 0], [0.095, 0.1, 0], 0.06, 0.05, PAL.leather);
    leg.paint.ball(0.07, 0.055, 0.1, PAL.woodDark, { at: [0.095, 0.055, 0.03], seg: 8, rings: 5 });
    m.part('legR', { pivot: [-0.09, 0.3, 0], copy: 'legL' });

    const torso = m.part('torso', { pivot: [0, 0.3, 0] });
    const P = torso.paint, M = torso.metal, G = torso.glow;
    P.capsule(0.15, 0.14, PAL.sand, { at: [0, 0.5, 0], scale: [1, 1, 0.88], c2: PAL.sandDark });
    P.torus(0.15, 0.028, PAL.leather, { at: [0, 0.4, 0], seg: 10, tube: 3 });
    P.mirrorX((b) => b.limb([0.1, 0.7, 0.1], [0.12, 0.42, 0.125], 0.018, 0.018, PAL.leather, { seg: 5, rings: 2 }));
    P.sphere(0.2, SKIN, { at: [0, 0.86, 0.02], seg: 12, rings: 7 });
    P.sphere(0.05, mix(SKIN, col(0xc86a50), 0.3), { at: [0, 0.8, 0.215], seg: 8, rings: 4 });
    P.mirrorX((b) => b.cone(0.05, 0.14, SKIN, { at: [0.2, 0.86, 0], rot: [0, 0, -1.25], seg: 6 }));
    P.lathe([[0.205, 0.95], [0.19, 1.0], [0.13, 1.05], [0, 1.075]], PAL.leather, { seg: 12 });
    P.torus(0.2, 0.018, PAL.leather, { at: [0, 0.875, 0.02], seg: 10, tube: 3 });
    // team scarf with a trailing tail
    P.torus(0.13, 0.05, pal.main, { at: [0, 0.7, 0], seg: 10, tube: 4 });
    P.tube([[0.05, 0.7, -0.12], [0.08, 0.62, -0.22], [0.12, 0.5, -0.28], [0.16, 0.42, -0.3]],
      [0.05, 0.045, 0.04, 0.025], pal.main, { sides: 5 });
    // left arm resting on the strap
    P.limb([0.16, 0.64, 0], [0.21, 0.46, 0.04], 0.05, 0.042, PAL.sand, { rings: 2 });
    P.sphere(0.05, SKIN, { at: [0.21, 0.43, 0.05], seg: 8, rings: 4 });
    M.mirrorX((b) => b.torus(0.06, 0.018, PAL.brass, { at: [0.075, 0.875, 0.205], rot: [PI / 2, 0, 0], seg: 8, tube: 3 }));
    M.cyl(0.14, 0.14, 0.4, PAL.brass, { at: [0, 0.6, -0.27], seg: 12 });
    M.cyl(0.155, 0.155, 0.05, PAL.iron, { at: [0, 0.81, -0.27], seg: 12 });
    M.cyl(0.155, 0.155, 0.05, PAL.iron, { at: [0, 0.39, -0.27], seg: 12 });
    M.torus(0.145, 0.018, PAL.copper, { at: [0, 0.48, -0.27], seg: 12, tube: 3 });
    M.torus(0.145, 0.018, PAL.copper, { at: [0, 0.72, -0.27], seg: 12, tube: 3 });
    M.sphere(0.03, PAL.iron, { at: [0.06, 0.845, -0.3], seg: 6, rings: 4 });
    M.limb([0.06, 0.84, -0.3], [0.09, 1.12, -0.36], 0.016, 0.01, PAL.steel, { seg: 5, rings: 2 });
    G.mirrorX((b) => b.cyl(0.048, 0.048, 0.02, gc, { at: [0.075, 0.875, 0.21], rot: [PI / 2, 0, 0], seg: 10 }));
    G.torus(0.143, 0.022, gc, { at: [0, 0.6, -0.27], seg: 12, tube: 4 });
    G.sphere(0.042, gc, { at: [0.09, 1.14, -0.36], seg: 8, rings: 5 });

    const arm = m.part('armR', { pivot: [-0.16, 0.64, 0], parent: 'torso', ownGlow: true });
    arm.paint.limb([-0.16, 0.64, 0], [-0.2, 0.47, 0.1], 0.05, 0.042, PAL.sand, { rings: 2 });
    arm.paint.sphere(0.052, SKIN, { at: [-0.2, 0.45, 0.13], seg: 8, rings: 5 });
    arm.paint.limb([-0.2, 0.41, 0.02], [-0.2, 0.6, 0.5], 0.022, 0.02, PAL.woodDark, { seg: 6 });
    arm.paint.torus(0.026, 0.012, PAL.brass, { at: [-0.2, 0.57, 0.42], rot: [-1.2, 0, 0], seg: 8, tube: 3 });
    arm.paint.limb([-0.2, 0.6, 0.5], [-0.165, 0.66, 0.6], 0.016, 0.012, PAL.copper, { seg: 5, rings: 2 });
    arm.paint.limb([-0.2, 0.6, 0.5], [-0.235, 0.66, 0.6], 0.016, 0.012, PAL.copper, { seg: 5, rings: 2 });
    arm.glow.sphere(0.045, gc, { at: [-0.2, 0.655, 0.6], seg: 8, rings: 5 });
  });
}

function scoutView(team) {
  const v = troopView('scout', team, scoutModel(team), { stride: 0.55 });
  const { legL, legR, torso, armR } = v.parts;
  const ty = torso.userData.home.y, az = armR.userData.home.z;
  const gTip = v.glow.armR;
  v.animate = (dt, s, a) => {
    const t = s.time + a.seed, mv = a.move, sn = Math.sin(a.walk);
    walkLegs(a, legL, legR, 0.75, 0.05);
    const p = swing(s.attackT, s.windup, s.hitSpeed);
    torso.position.y = ty + Math.abs(Math.cos(a.walk)) * 0.03 * mv + Math.sin(t * 2.6) * 0.006 * (1 - mv);
    torso.rotation.x = 0.12 * mv + pose(p, -0.08, 0, 0.1);
    torso.rotation.z = sn * 0.05 * mv;
    // thrust the rod forward; the tip charges up through the windup and flares on release
    armR.rotation.x = pose(p, 0.3, -sn * 0.2 * mv, -0.35);
    armR.position.z = az + pose(p, -0.05, 0, 0.1);
    if (gTip) {
      gTip.color.setScalar(0.85 + 0.15 * Math.sin(t * 17) + 2.5 * buildUp(s.attackT, s.windup)
        + 2.5 * impact(s.attackT, s.windup, 0.2));
    }
  };
  return v;
}

// ═════════════════════════════════════ COLOSSUS ═════════════════════════════════════
// Huge mossy stone giant: boulder torso, massive forearms and fists, small head set low between
// the shoulders, glowing team runes and a team crystal in the chest, team loincloth and sash.

function colossusModel(team) {
  return defineModel(`colossus:${team}`, (m) => {
    const pal = teamPalette(team);
    const gc = mix(pal.glow, PAL.white, 0.2);

    const legL = m.part('legL', { pivot: [0.4, 0.75, 0] });
    legL.paint.limb([0.4, 0.75, 0], [0.44, 0.28, 0.02], 0.25, 0.23, PAL.stoneDark);
    legL.paint.rock(0.3, PAL.rockDark, { at: [0.45, 0.17, 0.08], scale: [1, 0.58, 1.25], seed: 2 });
    const legR = m.part('legR', { pivot: [-0.4, 0.75, 0] });
    legR.paint.limb([-0.4, 0.75, 0], [-0.44, 0.28, 0.02], 0.25, 0.23, PAL.stoneDark);
    legR.paint.rock(0.3, PAL.rockDark, { at: [-0.45, 0.17, 0.08], scale: [1, 0.58, 1.25], seed: 4 });

    const torso = m.part('torso', { pivot: [0, 0.75, 0] });
    const P = torso.paint, G = torso.glow;
    P.rock(0.48, PAL.stoneDark, { at: [0, 0.92, 0], scale: [1.25, 0.62, 0.95], seed: 5 });
    P.rock(0.84, PAL.stone, { at: [0, 1.74, -0.02], scale: [1.1, 0.95, 0.86], detail: 2, jitter: 0.1, seed: 11 });
    P.rock(0.44, PAL.stone, { at: [0.84, 2.24, -0.04], seed: 13 });
    P.rock(0.44, PAL.stone, { at: [-0.84, 2.24, -0.04], seed: 17 });
    P.rock(0.27, PAL.stoneLight, { at: [0, 2.5, 0.36], scale: [1.1, 0.92, 1], seed: 21 });
    P.rock(0.2, PAL.stoneDark, { at: [0, 2.62, 0.5], scale: [1.3, 0.35, 0.6], detail: 0, seed: 23 });
    // moss and sprouts
    P.mirrorX((b) => {
      b.ball(0.32, 0.09, 0.3, PAL.moss, { at: [0.84, 2.64, -0.06], seg: 8, rings: 4 });
      b.cone(0.05, 0.2, PAL.leaf, { at: [0.74, 2.8, -0.12], rot: [0.3, 0, -0.35], seg: 5 });
    });
    P.ball(0.55, 0.16, 0.45, PAL.mossDark, { at: [0, 2.42, -0.36], seg: 10, rings: 5 });
    P.ball(0.18, 0.07, 0.16, PAL.moss, { at: [0.04, 2.73, 0.32], seg: 8, rings: 4 });
    // team sash and loincloth
    P.torus(0.6, 0.07, pal.main, { at: [0, 1.05, 0], scale: [1.05, 1, 0.85], seg: 12, tube: 4 });
    P.extrude([[-0.18, 0], [0.18, 0], [0.14, -0.42], [-0.14, -0.42]], 0.04, pal.main,
      { at: [0, 1.02, 0.5], rot: [0.12, 0, 0], c2: pal.dark });
    P.torus(0.17, 0.05, PAL.rockDark, { at: [0, 1.86, 0.69], rot: [PI / 2, 0, 0], seg: 8, tube: 3 });
    // chest crystal, runes, eyes
    G.crystal(0.15, 0.42, gc, { at: [0, 1.86, 0.72], sides: 5, c2: pal.main });
    G.crystal(0.08, 0.22, gc, { at: [0.14, 1.96, 0.67], rot: [0, 0, -0.5], sides: 4 });
    G.mirrorX((b) => {
      b.box(0.05, 0.2, 0.12, gc, { at: [0.33, 1.86, 0.66], rot: [0, 0.45, 0.25], bevel: 0 });
      b.box(0.05, 0.14, 0.12, gc, { at: [0.4, 1.62, 0.6], rot: [0, 0.55, -0.6], bevel: 0 });
      b.box(0.05, 0.2, 0.1, gc, { at: [0.84, 2.26, 0.42], bevel: 0 });
      b.sphere(0.05, gc, { at: [0.1, 2.53, 0.63], seg: 6, rings: 4 });
    });
    G.box(0.05, 0.16, 0.12, gc, { at: [0, 2.15, 0.62], rot: [-0.3, 0, 0], bevel: 0 });
    G.box(0.2, 0.05, 0.12, gc, { at: [0, 1.56, 0.7], bevel: 0 });

    const armL = m.part('armL', { pivot: [0.98, 2.22, 0], parent: 'torso' });
    armL.paint.limb([0.98, 2.22, 0], [1.1, 1.62, 0.04], 0.24, 0.27, PAL.stoneDark);
    armL.paint.limb([1.1, 1.62, 0.04], [1.08, 1.02, 0.16], 0.31, 0.36, PAL.stone);
    armL.paint.rock(0.38, PAL.stoneLight, { at: [1.07, 0.82, 0.2], scale: [1, 0.88, 1.05], seed: 31 });
    armL.paint.ball(0.24, 0.08, 0.22, PAL.moss, { at: [1.14, 1.9, -0.04], rot: [0, 0, -0.3], seg: 8, rings: 4 });
    const armR = m.part('armR', { pivot: [-0.98, 2.22, 0], parent: 'torso' });
    armR.paint.limb([-0.98, 2.22, 0], [-1.1, 1.62, 0.04], 0.24, 0.27, PAL.stoneDark);
    armR.paint.limb([-1.1, 1.62, 0.04], [-1.08, 1.02, 0.16], 0.31, 0.36, PAL.stone);
    armR.paint.rock(0.38, PAL.stoneLight, { at: [-1.07, 0.82, 0.2], scale: [1, 0.88, 1.05], seed: 37 });
    armR.paint.ball(0.24, 0.08, 0.22, PAL.moss, { at: [-1.14, 1.9, -0.04], rot: [0, 0, 0.3], seg: 8, rings: 4 });
  });
}

function colossusView(team) {
  const v = troopView('colossus', team, colossusModel(team), { stride: 1.5, hopHeight: 0.8 });
  const { legL, legR, torso, armL, armR } = v.parts;
  const ty = torso.userData.home.y;
  v.animate = (dt, s, a) => {
    const t = s.time + a.seed, mv = a.move, sn = Math.sin(a.walk);
    walkLegs(a, legL, legR, 0.36, 0.14);
    const p = swing(s.attackT, s.windup, s.hitSpeed);
    // weighty sway: the whole boulder rolls and twists over each stride
    torso.rotation.z = sn * 0.1 * mv;
    torso.rotation.y = sn * 0.07 * mv;
    torso.rotation.x = pose(p, -0.18, 0.06 * mv, 0.36);
    torso.position.y = ty + (Math.abs(Math.cos(a.walk)) * 0.08 - 0.04) * mv + Math.sin(t * 1.5) * 0.012
      + pose(p, 0.05, 0, -0.16);
    torso.scale.y = 1 + Math.sin(t * 1.5) * 0.012;
    // both fists raised overhead, then slammed down in front
    armL.rotation.x = pose(p, -2.75, sn * 0.3 * mv, -0.75);
    armR.rotation.x = pose(p, -2.75, -sn * 0.3 * mv, -0.75);
    armL.rotation.z = pose(p, -0.2, 0, 0.12);
    armR.rotation.z = pose(p, 0.2, 0, -0.12);
  };
  return v;
}

// ═════════════════════════════════════ GLIMMER ═════════════════════════════════════
// Swarm mini (3 draws): faceted gem body with big bright eyes, stubby legs, two crystal daggers.

function glimmerModel(team) {
  return defineModel(`glimmer:${team}`, (m) => {
    const pal = teamPalette(team);
    const eyeC = mix(PAL.white, pal.glow, 0.3);

    const torso = m.part('torso', { pivot: [0, 0.05, 0] });
    const P = torso.paint;
    P.crystal(0.25, 0.62, mix(pal.main, pal.light, 0.35), {
      at: [0, 0.47, 0], sides: 6, top: 0.36, bottom: 0.2, c2: pal.dark, facet: 0.5,
    });
    P.ball(0.13, 0.07, 0.11, pal.dark, { at: [0, 0.22, 0], seg: 8, rings: 4 });
    P.mirrorX((b) => {
      b.capsule(0.055, 0.06, pal.dark, { at: [0.09, 0.12, 0], seg: 6, rings: 2 });
      b.ball(0.065, 0.045, 0.085, pal.dark, { at: [0.09, 0.045, 0.03], seg: 6, rings: 3 });
      b.sphere(0.04, PAL.eye, { at: [0.09, 0.5, 0.255], seg: 6, rings: 4 });
    });
    torso.glow.mirrorX((b) => b.sphere(0.075, eyeC, { at: [0.09, 0.5, 0.2], seg: 8, rings: 4, bright: 0.8 }));

    const arms = m.part('arms', { pivot: [0, 0.42, 0.04], parent: 'torso', cast: false });
    arms.paint.mirrorX((b) => {
      b.limb([0.2, 0.44, 0.02], [0.27, 0.36, 0.12], 0.04, 0.045, pal.dark, { seg: 6, rings: 2 });
      b.sphere(0.05, pal.dark, { at: [0.27, 0.35, 0.14], seg: 6, rings: 3 });
      b.crystal(0.04, 0.26, mix(pal.light, PAL.white, 0.4), { at: [0.27, 0.403, 0.258], rot: [1.15, 0, 0], sides: 4, bright: 1.25 });
    });
  });
}

function glimmerView(team) {
  const v = troopView('glimmer', team, glimmerModel(team), { stride: 0.55, hopHeight: 0.6 });
  const { torso, arms } = v.parts;
  const ty = torso.userData.home.y, az = arms.userData.home.z;
  v.animate = (dt, s, a) => {
    const t = s.time + a.seed, mv = a.move;
    // quick hops: two per stride, with a squash on landing
    const up = Math.abs(Math.sin(a.walk));
    const land = 1 - up, q = land * land * land * land * mv;
    torso.position.y = ty + up * 0.11 * mv + Math.sin(t * 3.4) * 0.012 * (1 - mv);
    torso.scale.set(1 + 0.08 * q, 1 - 0.14 * q, 1 + 0.08 * q);
    // fast double stab: a first jab mid-windup, the real blow at windup
    const p = swing(s.attackT, s.windup, s.hitSpeed);
    let jab = 0;
    if (s.attackT >= 0 && s.attackT < s.windup) {
      const x = (s.attackT / s.windup - 0.45) / 0.13;
      jab = Math.exp(-x * x);
    }
    const pp = p > 0 ? p : 0;
    torso.rotation.x = 0.16 * mv + pose(p, -0.12, 0, 0.22);
    torso.rotation.y = 0.25 * jab - 0.25 * pp;
    arms.position.z = az + 0.09 * jab + pose(p, -0.03, 0, 0.12);
    arms.rotation.y = 0.3 * jab - 0.3 * pp;
    arms.rotation.x = Math.sin(a.walk * 2) * 0.15 * mv;
  };
  return v;
}

// ═════════════════════════════════════ ZEPHYR ═════════════════════════════════════
// Swarm flyer (3 draws): teardrop wind sprite, swirl tail, glowing eyes, two leaf wings in one
// mesh — the wing beat is a scale.y flip of the V (no second wing part needed).

const LEAF = [[0, 0], [0.08, 0.06], [0.2, 0.08], [0.32, 0.04], [0.37, 0], [0.3, -0.035], [0.18, -0.05], [0.07, -0.035]];

function zephyrModel(team) {
  return defineModel(`zephyr:${team}`, (m) => {
    const pal = teamPalette(team);
    const eyeC = mix(PAL.white, pal.glow, 0.35);

    const torso = m.part('torso', { pivot: [0, 0.36, 0] });
    const P = torso.paint;
    P.lathe([[0, -0.3], [0.05, -0.22], [0.12, -0.1], [0.165, 0.02], [0.16, 0.12], [0.11, 0.19], [0, 0.22]],
      mix(pal.light, PAL.white, 0.35), { at: [0, 0.36, 0], rot: [PI / 2, 0, 0], seg: 10, c2: pal.main });
    const swirl = [], radii = [];
    for (let k = 0; k <= 6; k++) {
      const ang = k * 1.0, r = 0.07 * (1 - k / 8);
      swirl.push([Math.cos(ang) * r, 0.36 + Math.sin(ang) * r, -0.27 - k * 0.045]);
      radii.push(0.035 - k * 0.0045);
    }
    P.tube(swirl, radii, pal.main, { sides: 5 });
    P.limb([0, 0.5, 0.08], [0, 0.6, -0.08], 0.035, 0.008, pal.main, { seg: 6, rings: 2 });
    P.limb([0, 0.48, 0.0], [0, 0.55, -0.16], 0.03, 0.006, pal.main, { seg: 6, rings: 2 });
    torso.glow.mirrorX((b) => b.ball(0.045, 0.055, 0.035, eyeC, { at: [0.07, 0.4, 0.19], seg: 8, rings: 5 }));

    const wings = m.part('wings', { pivot: [0, 0.47, -0.02], parent: 'torso', cast: false });
    wings.paint.mirrorX((b) => b.group({ at: [0.06, 0.47, -0.02], rot: [0, 0.25, 0.55] }, (g) => {
      g.extrude(LEAF, 0.016, mix(pal.light, PAL.white, 0.5), { rot: [-PI / 2, 0, 0] });
      g.limb([0.02, 0.01, 0], [0.3, 0.01, 0], 0.008, 0.004, pal.main, { seg: 4, rings: 1 });
    }));
  });
}

function zephyrView(team) {
  const v = troopView('zephyr', team, zephyrModel(team), { stride: 1 });
  const { torso, wings } = v.parts;
  const ty = torso.userData.home.y, tz = torso.userData.home.z;
  let flap = 0;
  v.animate = (dt, s, a) => {
    const t = s.time + a.seed, mv = a.move;
    const p = swing(s.attackT, s.windup, s.hitSpeed);
    flap += dt * (p !== 0 ? 36 : 26);
    if (flap > TAU) flap -= TAU;
    wings.scale.y = Math.cos(flap);
    v.body.position.y = Math.sin(t * 3.1) * 0.06;
    torso.rotation.z = Math.sin(t * 1.7) * 0.1;
    // quick forward dive-peck
    torso.rotation.x = 0.22 * mv + pose(p, -0.4, 0, 0.65);
    torso.position.z = tz + pose(p, -0.1, 0, 0.26);
    torso.position.y = ty + pose(p, 0.08, 0, -0.1);
  };
  return v;
}

registerUnit('warden', wardenView);
registerUnit('scout', scoutView);
registerUnit('colossus', colossusView);
registerUnit('glimmer', glimmerView);
registerUnit('zephyr', zephyrView);
