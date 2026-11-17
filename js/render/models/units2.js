// Aether Spires — troop models, batch 2: Storm Ray, Ramhorn, Lumen Sage, Breaker, Tin Mite,
// Longshot, Gyro Lancer, Prism Guard, Sparkwisp, Boilerback, Pod Strider.
// Same recipe as units1.js: defineModel (geometry, cached per team) + unitView + an animate()
// that only writes numbers onto part transforms (closure scalars, no allocations).

import { UNITS } from '../../data/cards.js';
import { registerUnit } from './registry.js';
import {
  PAL, GLOW_BOOST, col, mix, teamPalette, defineModel, unitView,
  swing, pose, buildUp, impact, walkLegs, damp,
} from './kit.js';

const PI = Math.PI, TAU = PI * 2;

function troopView(type, team, def, o) {
  return unitView(type, team, def, { height: UNITS[type].height, ...o });
}

const SKIN = col(0xf0b88e);
const SLATE = col(0x34425e);
const BELLY = col(0xdfe9f4);
const CHITIN = col(0x2c3040);
const CHITIN_DARK = col(0x1b1d28);
const ROBE_SHADE = col(0xbfb49c);
const BARK = col(0x9a6a40);
const POD = col(0x86d456);
const NEEDLE_RED = col(0xe0412c);

// ═════════════════════════════════════ STORM RAY ═════════════════════════════════════
// Flyer. Flat manta body (dark back, pale belly), two-segment team wings that ripple from root
// to tip, glowing spine chevrons, and a tail that arches up over the back to a crackling barb.

const RAY_WING_IN = [[0.14, 0.33], [0.34, 0.31], [0.58, 0.17], [0.58, -0.2], [0.36, -0.3], [0.14, -0.27]];
const RAY_WING_OUT = [[0.56, 0.17], [0.74, 0.05], [0.9, -0.13], [0.93, -0.22], [0.8, -0.25], [0.56, -0.2]];
const RAY_FIN = [[-0.1, 0], [0.1, 0], [0.15, 0.12]];

function stormrayModel(team) {
  return defineModel(`stormray:${team}`, (m) => {
    const pal = teamPalette(team);
    const gc = mix(pal.glow, PAL.white, 0.25);
    const wingBack = mix(pal.main, pal.dark, 0.65);

    const body = m.part('body', { pivot: [0, 0.3, 0], ownGlow: true });
    const P = body.paint, G = body.glow;
    P.ball(0.3, 0.125, 0.44, SLATE, { at: [0, 0.3, 0], c2: BELLY, seg: 12, rings: 6 });
    P.mirrorX((b) => b.limb([0.12, 0.27, 0.36], [0.17, 0.2, 0.56], 0.06, 0.03, SLATE, { seg: 6, rings: 2 }));
    P.extrude(RAY_FIN, 0.035, pal.main, { at: [0, 0.4, -0.2], rot: [0, PI / 2, 0], c2: pal.dark });
    P.torus(0.075, 0.026, pal.trim, { at: [0, 0.3, -0.41], rot: [PI / 2, 0, 0], seg: 8, tube: 3 });
    // spine chevrons, eyes and the emitter between the head lobes
    G.box(0.22, 0.03, 0.05, gc, { at: [0, 0.4, 0.2], bevel: 0 });
    G.box(0.2, 0.03, 0.05, gc, { at: [0, 0.415, 0.06], bevel: 0 });
    G.box(0.15, 0.03, 0.05, gc, { at: [0, 0.41, -0.08], bevel: 0 });
    G.mirrorX((b) => b.sphere(0.042, gc, { at: [0.21, 0.345, 0.26], seg: 6, rings: 4 }));
    G.sphere(0.055, gc, { at: [0, 0.225, 0.44], seg: 8, rings: 4 });

    for (let k = 0; k < 2; k++) {
      const side = k === 0 ? 1 : -1, n = k === 0 ? 'L' : 'R';
      const wing = m.part('wing' + n, { pivot: [0.2 * side, 0.31, 0], parent: 'body' });
      wing.paint.group({ scale: [side, 1, 1] }, (b) => {
        b.extrude(RAY_WING_IN, 0.06, pal.main, { at: [0, 0.3, 0], rot: [PI / 2, 0, 0], c2: wingBack, bevel: 0.02 });
        b.limb([0.16, 0.31, 0.3], [0.58, 0.31, 0.15], 0.045, 0.036, SLATE, { seg: 6, rings: 2 });
      });
      const tip = m.part('tip' + n, { pivot: [0.57 * side, 0.31, -0.02], parent: 'wing' + n, cast: false });
      tip.paint.group({ scale: [side, 1, 1] }, (b) => {
        b.extrude(RAY_WING_OUT, 0.045, pal.light, { at: [0, 0.3, 0], rot: [PI / 2, 0, 0], c2: pal.main, bevel: 0.015 });
        b.limb([0.57, 0.31, 0.15], [0.91, 0.305, -0.15], 0.036, 0.012, SLATE, { seg: 6, rings: 2 });
      });
    }

    const tail = m.part('tail', { pivot: [0, 0.3, -0.4], parent: 'body', ownGlow: true });
    tail.paint.tube([[0, 0.3, -0.36], [0, 0.3, -0.56], [0, 0.35, -0.72], [0, 0.48, -0.84], [0, 0.64, -0.86], [0, 0.76, -0.79]],
      [0.075, 0.06, 0.048, 0.038, 0.03, 0.022], SLATE, { sides: 6 });
    tail.glow.crystal(0.055, 0.22, gc, { at: [0, 0.81, -0.74], rot: [0.75, 0, 0], sides: 4 });
    tail.glow.mirrorX((b) => b.crystal(0.03, 0.14, gc, { at: [0.06, 0.835, -0.73], rot: [0.75, 0, -0.6], sides: 4 }));
  });
}

function stormrayView(team) {
  const v = troopView('stormray', team, stormrayModel(team), { stride: 1.4 });
  const { body, wingL, wingR, tipL, tipR, tail } = v.parts;
  const by = body.userData.home.y, bz = body.userData.home.z;
  const gBody = v.glow.body, gTail = v.glow.tail;
  let flap = 0;
  v.animate = (dt, s, a) => {
    const t = s.time + a.seed, mv = a.move;
    const p = swing(s.attackT, s.windup, s.hitSpeed);
    const ch = buildUp(s.attackT, s.windup), hit = impact(s.attackT, s.windup, 0.3);
    flap += dt * (3.2 + 2.4 * mv + 3 * ch);
    if (flap > TAU) flap -= TAU;
    // the wave runs from the wing root out to the tip
    const f1 = Math.sin(flap), f2 = Math.sin(flap - 0.95);
    const w1 = 0.06 + f1 * 0.3, w2 = f2 * 0.48;
    wingL.rotation.z = w1; wingR.rotation.z = -w1;
    tipL.rotation.z = w2; tipR.rotation.z = -w2;
    // arches nose-up through the windup, snaps down and recoils as the pulse leaves the head
    body.position.y = by + Math.sin(t * 2.1) * 0.05 - f1 * 0.025;
    body.position.z = bz + pose(p, 0.06, 0, -0.16);
    body.rotation.x = 0.07 * mv + pose(p, -0.5, 0, 0.3);
    body.rotation.z = Math.sin(t * 0.9) * 0.06;
    tail.rotation.x = Math.sin(t * 2.7) * 0.1 + pose(p, 0.35, 0, -0.4);
    tail.rotation.y = Math.sin(t * 1.9) * 0.18;
    if (gBody) gBody.color.setScalar(0.8 + 0.15 * Math.sin(t * 5) + 1.6 * ch + 2 * hit);
    if (gTail) {
      const crackle = Math.sin(t * 23) * Math.sin(t * 7.3);
      gTail.color.setScalar(0.7 + 0.5 * (crackle > 0 ? crackle : -crackle) + 2 * ch + 1.5 * hit);
    }
  };
  return v;
}

// ═════════════════════════════════════ RAMHORN ═════════════════════════════════════
// Armoured beetle: dark chitin underbody, team wing-cases, a huge up-curved steel battering
// horn. Six stubby legs as two tripods. The cases swing open and light wings buzz during a hop.

const BEETLE_WING = [[0, 0], [0.12, 0.09], [0.4, 0.13], [0.66, 0.07], [0.74, 0], [0.6, -0.07], [0.3, -0.09], [0.1, -0.05]];
const BEETLE_LEG_Z = [0.3, -0.02, -0.34];

function beetleLeg(b, side, z) {
  const knee = [0.5 * side, 0.4, z * 1.2];
  b.limb([0.26 * side, 0.36, z], knee, 0.085, 0.07, CHITIN, { seg: 6, rings: 2 });
  b.limb(knee, [0.57 * side, 0.07, z * 1.35 + 0.02], 0.07, 0.045, CHITIN_DARK, { seg: 6, rings: 2 });
}

function ramhornModel(team) {
  return defineModel(`ramhorn:${team}`, (m) => {
    const pal = teamPalette(team);
    const gc = mix(pal.glow, PAL.white, 0.25);

    const legsA = m.part('legsA', { pivot: [0, 0.3, 0] });
    beetleLeg(legsA.paint, 1, BEETLE_LEG_Z[0]);
    beetleLeg(legsA.paint, -1, BEETLE_LEG_Z[1]);
    beetleLeg(legsA.paint, 1, BEETLE_LEG_Z[2]);
    const legsB = m.part('legsB', { pivot: [0, 0.3, 0] });
    beetleLeg(legsB.paint, -1, BEETLE_LEG_Z[0]);
    beetleLeg(legsB.paint, 1, BEETLE_LEG_Z[1]);
    beetleLeg(legsB.paint, -1, BEETLE_LEG_Z[2]);

    const body = m.part('body', { pivot: [0, 0.4, 0] });
    const P = body.paint, M = body.metal, G = body.glow;
    P.ball(0.4, 0.26, 0.56, CHITIN, { at: [0, 0.42, -0.08], c2: CHITIN_DARK, seg: 12, rings: 6 });
    P.ball(0.4, 0.25, 0.27, mix(pal.main, pal.dark, 0.45), { at: [0, 0.56, 0.3], c2: pal.dark, seg: 12, rings: 6 });
    P.ball(0.2, 0.16, 0.18, CHITIN, { at: [0, 0.42, 0.52], seg: 10, rings: 5 });
    M.torus(0.365, 0.03, PAL.brass, { at: [0, 0.5, 0.16], rot: [PI / 2, 0, 0], scale: [1, 1, 0.72], seg: 14, tube: 3 });
    // the battering horn: sweeps forward out of the head and curls up
    M.tube([[0, 0.44, 0.6], [0, 0.45, 0.78], [0, 0.55, 0.93], [0, 0.74, 1.0], [0, 0.93, 0.95], [0, 1.06, 0.84]],
      [0.12, 0.115, 0.1, 0.08, 0.055, 0.02], PAL.steel, { sides: 8, c2: PAL.iron });
    M.torus(0.122, 0.026, PAL.brass, { at: [0, 0.447, 0.7], rot: [PI / 2, 0, 0], seg: 10, tube: 3 });
    M.torus(0.092, 0.022, PAL.brass, { at: [0, 0.66, 0.985], rot: [0.25, 0, 0], seg: 10, tube: 3 });
    M.mirrorX((b) => b.limb([0.14, 0.4, 0.62], [0.21, 0.47, 0.84], 0.045, 0.012, PAL.steel, { seg: 6, rings: 2 }));
    G.mirrorX((b) => b.sphere(0.045, gc, { at: [0.15, 0.48, 0.6], seg: 6, rings: 4 }));

    for (let k = 0; k < 2; k++) {
      const side = k === 0 ? 1 : -1;
      const wc = m.part(k === 0 ? 'caseL' : 'caseR', { pivot: [0.05 * side, 0.72, 0.14], parent: 'body' });
      wc.paint.group({ scale: [side, 1, 1] }, (b) => b.group({ at: [0.2, 0.62, -0.2], rot: [0, 0, -0.45] }, (g) => {
        g.ball(0.23, 0.14, 0.45, pal.main, { c2: pal.dark, seg: 10, rings: 6 });
        g.limb([0, 0.125, 0.3], [0, 0.1, -0.34], 0.035, 0.025, pal.light, { seg: 5, rings: 1 });
        g.sphere(0.05, pal.trim, { at: [0.1, 0.105, 0.05], seg: 6, rings: 3 });
        g.sphere(0.04, pal.trim, { at: [0.09, 0.09, -0.2], seg: 6, rings: 3 });
      }));
    }

    const wings = m.part('wings', { pivot: [0, 0.7, 0.05], parent: 'body', cast: false });
    wings.glow.mirrorX((b) => b.group({ at: [0.08, 0.7, 0.02], rot: [0, 0.6, 0.45] }, (g) => {
      g.extrude(BEETLE_WING, 0.014, mix(gc, PAL.white, 0.3), { rot: [-PI / 2, 0, 0], bright: 0.5 });
      g.limb([0.03, 0.008, 0], [0.66, 0.008, 0], 0.012, 0.005, gc, { seg: 4, rings: 1 });
    }));
  });
}

function ramhornView(team) {
  const v = troopView('ramhorn', team, ramhornModel(team), { stride: 0.7, hopHeight: 0.35 });
  const { legsA, legsB, body, caseL, caseR, wings } = v.parts;
  const by = body.userData.home.y, ly = legsA.userData.home.y;
  let spread = 0, buzz = 0;
  wings.visible = false;
  v.animate = (dt, s, a) => {
    const t = s.time + a.seed, mv = a.move, sn = Math.sin(a.walk), cs = Math.cos(a.walk);
    const p = swing(s.attackT, s.windup, s.hitSpeed);
    spread = damp(spread, s.hop > 0 ? 1 : 0, 14, dt);
    // tripod scuttle: each set slides forward while it is lifted
    legsA.position.z = sn * 0.09 * mv;
    legsB.position.z = -sn * 0.09 * mv;
    legsA.position.y = ly + (cs > 0 ? cs : 0) * 0.05 * mv + spread * 0.07;
    legsB.position.y = ly + (cs < 0 ? -cs : 0) * 0.05 * mv + spread * 0.07;
    // rears back, then the whole beetle lunges horn-first
    v.body.position.z = pose(p, -0.2, 0, 0.36);
    body.position.y = by + (cs > 0 ? cs : -cs) * 0.025 * mv + Math.sin(t * 2.2) * 0.008 + pose(p, 0.1, 0, -0.03);
    body.rotation.x = pose(p, -0.38, 0.04 * mv - 0.12 * spread, 0.26);
    body.rotation.z = sn * 0.05 * mv;
    // rift hop: wing-cases swing up and out, the light wings underneath buzz
    caseL.rotation.z = spread * 0.95; caseL.rotation.y = -spread * 0.5;
    caseR.rotation.z = -spread * 0.95; caseR.rotation.y = spread * 0.5;
    const open = spread > 0.03;
    wings.visible = open;
    if (open) {
      buzz += dt * 42;
      if (buzz > TAU) buzz -= TAU;
      wings.scale.set(spread, Math.cos(buzz) * 0.8, spread);
    }
  };
  return v;
}

// ═════════════════════════════════════ LUMEN SAGE ═════════════════════════════════════
// Robed light-mage gliding on a bell skirt: team mantle and tall bent hat, long beard, and a
// staff (right hand, −X) whose crescent head cradles a glowing orb at muzzle height.

const STOLE = [[-0.07, 0.29], [0.07, 0.29], [0.09, -0.24], [0, -0.33], [-0.09, -0.24]];

function sageModel(team) {
  return defineModel(`sage:${team}`, (m) => {
    const pal = teamPalette(team);
    const gc = mix(pal.glow, PAL.white, 0.3);

    const skirt = m.part('skirt', { pivot: [0, 0.72, 0] });
    skirt.paint.lathe([[0.37, 0], [0.38, 0.06], [0.31, 0.3], [0.24, 0.56], [0.21, 0.76]], PAL.cloth, { seg: 12, c2: ROBE_SHADE });
    skirt.paint.torus(0.375, 0.035, pal.main, { at: [0, 0.07, 0], seg: 12, tube: 4 });
    skirt.paint.group({ at: [0, 0.45, 0.3], rot: [-0.233, 0, 0] }, (b) => b.extrude(STOLE, 0.03, pal.main, { c2: pal.dark }));

    const torso = m.part('torso', { pivot: [0, 0.72, 0] });
    const P = torso.paint, M = torso.metal, G = torso.glow;
    P.lathe([[0.2, 0.7], [0.235, 0.9], [0.2, 1.06], [0.1, 1.13]], PAL.cloth, { seg: 10, c2: ROBE_SHADE });
    P.torus(0.215, 0.04, pal.main, { at: [0, 0.76, 0], seg: 12, tube: 4 });
    P.lathe([[0.31, 0.95], [0.29, 1.03], [0.2, 1.11], [0.11, 1.16]], pal.main, { seg: 12, c2: pal.dark });
    P.sphere(0.15, SKIN, { at: [0, 1.25, 0.02], seg: 10, rings: 6 });
    P.sphere(0.035, SKIN, { at: [0, 1.25, 0.17], seg: 6, rings: 3 });
    P.limb([0, 1.19, 0.1], [0, 0.96, 0.31], 0.1, 0.015, PAL.white, { seg: 8, rings: 2 });
    P.ball(0.125, 0.045, 0.07, PAL.white, { at: [0, 1.205, 0.13], seg: 8, rings: 4 });
    // hat: wide brim, tall cone bending back to a point
    P.lathe([[0.3, 1.33], [0.31, 1.345], [0.17, 1.39], [0.16, 1.4]], pal.main, { seg: 12, c2: pal.dark });
    P.tube([[0, 1.37, 0], [0, 1.5, -0.01], [0, 1.6, -0.05], [0, 1.66, -0.12], [0, 1.67, -0.2]],
      [0.165, 0.12, 0.075, 0.04, 0.012], pal.main, { sides: 8 });
    M.torus(0.305, 0.02, PAL.gold, { at: [0, 0.955, 0], seg: 14, tube: 3 });
    M.torus(0.166, 0.026, PAL.gold, { at: [0, 1.415, 0], seg: 12, tube: 3 });
    G.mirrorX((b) => b.sphere(0.028, gc, { at: [0.06, 1.285, 0.15], seg: 6, rings: 3 }));
    G.crystal(0.04, 0.1, gc, { at: [0, 1.44, 0.17], sides: 4 });
    G.sphere(0.03, gc, { at: [0, 1.665, -0.215], seg: 6, rings: 3 });

    const armR = m.part('armR', { pivot: [-0.24, 1.06, 0], parent: 'torso', ownGlow: true });
    armR.paint.limb([-0.24, 1.06, 0], [-0.36, 0.88, 0.16], 0.07, 0.095, PAL.cloth, { rings: 2 });
    armR.paint.sphere(0.055, SKIN, { at: [-0.38, 0.86, 0.2], seg: 8, rings: 4 });
    armR.paint.limb([-0.38, 0.1, 0.22], [-0.38, 1.46, 0.22], 0.03, 0.026, PAL.wood, { seg: 6, rings: 1 });
    armR.metal.cyl(0.045, 0.03, 0.08, PAL.gold, { at: [-0.38, 1.45, 0.22], seg: 8 });
    armR.metal.group({ at: [-0.38, 1.6, 0.22], rot: [PI / 2, 0, 0] }, (b) => {
      b.torus(0.125, 0.024, PAL.gold, { rot: [0, PI + 0.6, 0], arc: TAU - 1.2, seg: 12, tube: 4 });
    });
    armR.glow.sphere(0.085, gc, { at: [-0.38, 1.6, 0.22], seg: 10, rings: 6 });

    const armL = m.part('armL', { pivot: [0.24, 1.06, 0], parent: 'torso' });
    armL.paint.limb([0.24, 1.06, 0], [0.35, 0.86, 0.12], 0.07, 0.095, PAL.cloth, { rings: 2 });
    armL.paint.sphere(0.055, SKIN, { at: [0.37, 0.83, 0.15], seg: 8, rings: 4 });
  });
}

function sageView(team) {
  const v = troopView('sage', team, sageModel(team), { stride: 0.9 });
  const { skirt, torso, armR, armL } = v.parts;
  const ay = armR.userData.home.y;
  const gOrb = v.glow.armR;
  v.animate = (dt, s, a) => {
    const t = s.time + a.seed, mv = a.move, sn = Math.sin(a.walk), cs = Math.cos(a.walk);
    const p = swing(s.attackT, s.windup, s.hitSpeed);
    // glides: the hem trails and swings like a bell
    v.body.position.y = Math.sin(t * 1.8) * 0.015 + (cs > 0 ? cs : -cs) * 0.02 * mv;
    skirt.rotation.x = 0.1 * mv + cs * 0.03 * mv;
    skirt.rotation.z = sn * 0.06 * mv;
    torso.rotation.x = 0.05 * mv + pose(p, -0.14, 0, 0.2);
    torso.rotation.y = pose(p, -0.25, 0, 0.2);
    // staff raised and cocked back, then flung forward: the orb leaves exactly at windup
    armR.rotation.x = pose(p, -0.6, -sn * 0.06 * mv, 0.75);
    armR.position.y = ay + pose(p, 0.14, 0, -0.04);
    armL.rotation.x = pose(p, -1.3, -0.1 + sn * 0.1 * mv, 0.3);
    if (gOrb) {
      gOrb.color.setScalar(0.85 + 0.12 * Math.sin(t * 4) + 2.2 * buildUp(s.attackT, s.windup)
        + 1.8 * impact(s.attackT, s.windup, 0.25));
    }
  };
  return v;
}

// ═════════════════════════════════════ BREAKER ═════════════════════════════════════
// Hulking construct: team barrel chest, tiny head sunk between the shoulders, twin steam stacks,
// a small claw arm (left) and one giant piston arm ending in a hammer-fist (right, −X).

const CHEVRON = [[-0.14, 0.06], [0, -0.02], [0.14, 0.06], [0.14, 0], [0, -0.08], [-0.14, 0]];

function breakerModel(team) {
  return defineModel(`breaker:${team}`, (m) => {
    const pal = teamPalette(team);
    const gc = mix(pal.glow, PAL.white, 0.25);

    const leg = m.part('legL', { pivot: [0.25, 0.62, 0] });
    leg.metal.limb([0.25, 0.62, 0], [0.27, 0.2, 0], 0.14, 0.12, PAL.iron, { rings: 2 });
    leg.metal.torus(0.13, 0.035, PAL.brass, { at: [0.26, 0.42, 0], seg: 10, tube: 3 });
    leg.metal.box(0.32, 0.17, 0.46, PAL.ironDark, { at: [0.27, 0.085, 0.05], bevel: 0.05 });
    m.part('legR', { pivot: [-0.25, 0.62, 0], copy: 'legL' });

    const torso = m.part('torso', { pivot: [0, 0.62, 0], ownGlow: true });
    const P = torso.paint, M = torso.metal, G = torso.glow;
    P.lathe([[0.3, 0.7], [0.46, 0.88], [0.53, 1.18], [0.5, 1.42], [0.36, 1.56], [0.2, 1.6]], pal.main,
      { seg: 12, c2: pal.dark, scale: [1, 1, 0.86] });
    P.ball(0.33, 0.17, 0.27, PAL.iron, { at: [0, 0.68, 0], seg: 10, rings: 5 });
    P.extrude(CHEVRON, 0.03, pal.light, { at: [0, 0.95, 0.425] });
    P.extrude(CHEVRON, 0.03, pal.light, { at: [0, 0.85, 0.4], scale: [0.8, 0.8, 1] });
    // small left arm with a claw
    P.ball(0.17, 0.15, 0.17, pal.main, { at: [0.55, 1.44, 0], c2: pal.dark, seg: 8, rings: 5 });
    P.limb([0.56, 1.38, 0], [0.64, 1.02, 0.1], 0.1, 0.09, PAL.iron, { rings: 2 });
    M.sphere(0.11, PAL.steel, { at: [0.65, 0.95, 0.12], seg: 8, rings: 5 });
    M.limb([0.61, 0.9, 0.14], [0.6, 0.76, 0.26], 0.04, 0.015, PAL.steel, { seg: 5, rings: 1 });
    M.limb([0.7, 0.9, 0.14], [0.71, 0.76, 0.26], 0.04, 0.015, PAL.steel, { seg: 5, rings: 1 });
    M.torus(0.47, 0.035, PAL.brass, { at: [0, 0.9, 0], scale: [1, 1, 0.86], seg: 14, tube: 4 });
    M.torus(0.5, 0.035, PAL.brass, { at: [0, 1.42, 0], scale: [1, 1, 0.86], seg: 14, tube: 4 });
    M.torus(0.2, 0.045, PAL.iron, { at: [0, 1.56, 0.1], seg: 10, tube: 4 });
    M.ball(0.19, 0.17, 0.19, PAL.steel, { at: [0, 1.62, 0.12], seg: 10, rings: 6 });
    M.torus(0.15, 0.035, PAL.brass, { at: [0, 1.17, 0.44], rot: [PI / 2, 0, 0], seg: 12, tube: 4 });
    // steam stacks on the left shoulder blade
    M.cyl(0.075, 0.09, 0.42, PAL.iron, { at: [0.24, 1.66, -0.24], seg: 8 });
    M.torus(0.08, 0.024, PAL.brass, { at: [0.24, 1.86, -0.24], seg: 8, tube: 3 });
    M.cyl(0.065, 0.078, 0.3, PAL.iron, { at: [0.06, 1.63, -0.32], seg: 8 });
    M.torus(0.07, 0.022, PAL.brass, { at: [0.06, 1.77, -0.32], seg: 8, tube: 3 });
    G.box(0.2, 0.045, 0.05, gc, { at: [0, 1.63, 0.3], bevel: 0 });
    G.cyl(0.125, 0.125, 0.04, gc, { at: [0, 1.17, 0.44], rot: [PI / 2, 0, 0], seg: 10 });
    G.cyl(0.06, 0.06, 0.02, gc, { at: [0.24, 1.868, -0.24], seg: 8 });
    G.cyl(0.05, 0.05, 0.02, gc, { at: [0.06, 1.778, -0.32], seg: 8 });

    const armR = m.part('armR', { pivot: [-0.58, 1.42, 0], parent: 'torso' });
    armR.paint.ball(0.25, 0.22, 0.25, pal.main, { at: [-0.6, 1.46, 0], c2: pal.dark, seg: 10, rings: 6 });
    armR.paint.torus(0.2, 0.03, pal.trim, { at: [-0.61, 1.33, 0], seg: 10, tube: 3 });
    armR.paint.limb([-0.62, 1.34, 0], [-0.66, 1.02, 0.03], 0.15, 0.16, PAL.iron, { rings: 2 });
    armR.paint.limb([-0.66, 1.0, 0.03], [-0.69, 0.62, 0.06], 0.075, 0.075, PAL.steel, { seg: 6, rings: 1, bright: 1.15 });

    // the fist slides along the piston: local −Y is "extend"
    const fist = m.part('fist', { pivot: [-0.69, 0.75, 0.06], parent: 'armR' });
    fist.metal.box(0.5, 0.44, 0.54, pal.main, { at: [-0.7, 0.5, 0.08], bevel: 0.07, c2: pal.dark });
    fist.metal.box(0.55, 0.11, 0.59, PAL.steel, { at: [-0.7, 0.3, 0.08], bevel: 0.03 });
    fist.metal.box(0.54, 0.07, 0.58, PAL.brass, { at: [-0.7, 0.68, 0.08], bevel: 0.025 });
    fist.metal.mirrorX((b) => {
      b.sphere(0.05, PAL.brass, { at: [0.12, 0.56, 0.35], seg: 6, rings: 3 });
      b.sphere(0.05, PAL.brass, { at: [0.12, 0.43, 0.35], seg: 6, rings: 3 });
    });

    const steam = m.part('steam', { pivot: [0.16, 1.8, -0.28], parent: 'torso', cast: false });
    steam.paint.sphere(0.08, PAL.white, { at: [0.24, 1.84, -0.24], seg: 7, rings: 4, bright: 1.3 });
    steam.paint.sphere(0.065, PAL.white, { at: [0.06, 1.8, -0.32], seg: 7, rings: 4, bright: 1.3 });
    steam.paint.sphere(0.05, PAL.white, { at: [0.3, 1.89, -0.31], seg: 6, rings: 3, bright: 1.3 });
  });
}

function breakerView(team) {
  const v = troopView('breaker', team, breakerModel(team), { stride: 1.0 });
  const { legL, legR, torso, armR, fist, steam } = v.parts;
  const ty = torso.userData.home.y, fy = fist.userData.home.y, sy = steam.userData.home.y;
  const gT = v.glow.torso;
  steam.visible = false;
  v.animate = (dt, s, a) => {
    const t = s.time + a.seed, mv = a.move, sn = Math.sin(a.walk), cs = Math.cos(a.walk);
    walkLegs(a, legL, legR, 0.45, 0.09);
    const p = swing(s.attackT, s.windup, s.hitSpeed);
    const ch = buildUp(s.attackT, s.windup), hit = impact(s.attackT, s.windup, 0.3);
    torso.position.y = ty + (cs > 0 ? cs : -cs) * 0.04 * mv + Math.sin(t * 1.6) * 0.01 + pose(p, 0.04, 0, -0.08);
    torso.rotation.x = pose(p, -0.22, 0.06 * mv, 0.4);
    torso.rotation.y = pose(p, -0.2, sn * 0.05 * mv, 0.25);
    torso.rotation.z = sn * 0.07 * mv;
    torso.scale.y = 1 + Math.sin(t * 9) * 0.006;
    // long haul overhead (trembling at the top), then the piston fires the fist into the ground
    armR.rotation.x = pose(p, -2.9, -0.1 - sn * 0.25 * mv, -0.75) + Math.sin(t * 41) * 0.025 * ch;
    armR.rotation.z = pose(p, -0.25, 0, 0);
    fist.position.y = fy + pose(p, 0.1, 0, -0.24);
    // steam: a big burst after the slam, small chuffs with every step
    let u = -1, big = 0;
    if (s.attackT >= s.windup && s.attackT < s.windup + 0.6) { u = (s.attackT - s.windup) / 0.6; big = 1.8; }
    else if (mv > 0.3) { u = (a.walk / PI) % 1; big = 0.8; }
    if (u >= 0 && u < 1) {
      const k = Math.sin(PI * u) * big;
      steam.visible = true;
      steam.position.y = sy + u * 0.36 * big;
      steam.scale.setScalar(k > 0.01 ? k : 0.01);
    } else {
      steam.visible = false;
    }
    if (gT) gT.color.setScalar(0.8 + 0.1 * Math.sin(t * 3) + 1.2 * ch + 2 * hit);
  };
  return v;
}

// ═════════════════════════════════════ TIN MITE ═════════════════════════════════════
// Swarm mini (3 draws): team tin shell, dark head with bright bead eyes, six wire legs that
// skitter as one piece, and a brass wind-up key turning on its back.

function miteModel(team) {
  return defineModel(`mite:${team}`, (m) => {
    const pal = teamPalette(team);
    const eyeC = mix(PAL.white, pal.glow, 0.4);

    const legs = m.part('legs', { pivot: [0, 0.1, 0], cast: false });
    for (let k = 0; k < 3; k++) {
      const z = 0.12 - k * 0.14;
      legs.metal.mirrorX((b) => b.limb([0.13, 0.12, z], [0.27, 0.012, z * 1.4 + 0.02], 0.022, 0.014, PAL.brass, { seg: 5, rings: 1 }));
    }

    const body = m.part('body', { pivot: [0, 0.12, 0] });
    const P = body.paint;
    P.ball(0.2, 0.15, 0.24, pal.main, { at: [0, 0.2, -0.03], c2: pal.dark, seg: 10, rings: 5 });
    P.torus(0.2, 0.025, pal.trim, { at: [0, 0.15, -0.03], scale: [1, 1, 1.2], seg: 10, tube: 3 });
    P.ball(0.115, 0.095, 0.1, PAL.ironDark, { at: [0, 0.15, 0.2], seg: 8, rings: 4 });
    P.mirrorX((b) => {
      b.sphere(0.04, eyeC, { at: [0.06, 0.19, 0.27], seg: 6, rings: 3, bright: 1.7 });
      b.cone(0.022, 0.09, PAL.steel, { at: [0.045, 0.1, 0.3], rot: [1.9, 0, 0], seg: 5 });
    });

    const key = m.part('key', { pivot: [0, 0.33, -0.08], parent: 'body', cast: false });
    key.metal.limb([0, 0.33, -0.08], [0, 0.39, -0.08], 0.018, 0.018, PAL.brass, { seg: 5, rings: 1 });
    key.metal.mirrorX((b) => b.torus(0.04, 0.014, PAL.gold, { at: [0.045, 0.41, -0.08], rot: [PI / 2, 0, 0], seg: 8, tube: 3 }));
  });
}

function miteView(team) {
  const v = troopView('mite', team, miteModel(team), { stride: 0.3, hopHeight: 0.5 });
  const { legs, body, key } = v.parts;
  const by = body.userData.home.y;
  let keyA = 0;
  v.animate = (dt, s, a) => {
    const t = s.time + a.seed, mv = a.move, sn = Math.sin(a.walk);
    const p = swing(s.attackT, s.windup, s.hitSpeed);
    legs.rotation.y = sn * 0.35 * mv;
    legs.rotation.z = Math.cos(a.walk) * 0.1 * mv;
    body.position.y = by + (sn > 0 ? sn : -sn) * 0.018 * mv + Math.sin(t * 5) * 0.004;
    body.rotation.z = sn * 0.1 * mv;
    // quick nip: a tiny rear-up, then a snap forward
    body.rotation.x = pose(p, -0.3, 0, 0.35);
    v.body.position.z = pose(p, -0.06, 0, 0.16);
    keyA += dt * (3 + 9 * mv);
    if (keyA > TAU) keyA -= TAU;
    key.rotation.y = keyA;
  };
  return v;
}

// ═════════════════════════════════════ LONGSHOT ═════════════════════════════════════
// Lanky automaton marksman: stilt legs, wasp waist, one big lens eye under a peaked team hood,
// ragged team cape, and a very long prism rifle held at the shoulder (muzzle 1.4).

const CAPE = [[-0.2, 0], [0.2, 0], [0.3, -0.74], [0.14, -0.88], [0, -0.76], [-0.14, -0.88], [-0.3, -0.74]];

function longshotModel(team) {
  return defineModel(`longshot:${team}`, (m) => {
    const pal = teamPalette(team);
    const gc = mix(pal.glow, PAL.white, 0.3);

    const leg = m.part('legL', { pivot: [0.11, 0.86, 0] });
    leg.metal.limb([0.11, 0.86, 0], [0.12, 0.48, 0.04], 0.055, 0.045, PAL.steel, { seg: 6, rings: 2 });
    leg.metal.sphere(0.06, PAL.brass, { at: [0.12, 0.47, 0.04], seg: 6, rings: 4 });
    leg.metal.limb([0.12, 0.46, 0.04], [0.12, 0.1, 0], 0.045, 0.04, PAL.iron, { seg: 6, rings: 2 });
    leg.metal.box(0.13, 0.08, 0.26, PAL.ironDark, { at: [0.12, 0.04, 0.05], bevel: 0.03 });
    m.part('legR', { pivot: [-0.11, 0.86, 0], copy: 'legL' });

    const torso = m.part('torso', { pivot: [0, 0.86, 0] });
    const P = torso.paint, M = torso.metal, G = torso.glow;
    M.ball(0.16, 0.09, 0.13, PAL.iron, { at: [0, 0.88, 0], seg: 8, rings: 4 });
    M.limb([0, 0.9, 0], [0, 1.12, 0], 0.06, 0.07, PAL.brass, { seg: 6, rings: 1 });
    M.lathe([[0.1, 1.08], [0.19, 1.2], [0.21, 1.36], [0.15, 1.46], [0.07, 1.5]], PAL.steel,
      { seg: 10, scale: [1, 1, 0.8], c2: PAL.iron });
    M.cyl(0.05, 0.06, 0.1, PAL.iron, { at: [0, 1.52, 0], seg: 6 });
    M.ball(0.105, 0.13, 0.12, PAL.steel, { at: [0, 1.64, 0.03], seg: 10, rings: 6 });
    M.torus(0.062, 0.018, PAL.brass, { at: [0, 1.65, 0.145], rot: [PI / 2, 0, 0], seg: 10, tube: 3 });
    M.sphere(0.035, PAL.gold, { at: [0, 1.43, 0.19], seg: 6, rings: 3 });
    G.cyl(0.05, 0.05, 0.03, gc, { at: [0, 1.65, 0.15], rot: [PI / 2, 0, 0], seg: 8 });
    // hood with a swept-back peak, and a shoulder mantle
    P.ball(0.15, 0.17, 0.155, pal.main, { at: [0, 1.67, -0.05], c2: pal.dark, seg: 10, rings: 6 });
    P.limb([0, 1.8, -0.06], [0, 1.89, -0.2], 0.07, 0.012, pal.main, { seg: 6, rings: 2 });
    P.lathe([[0.28, 1.3], [0.27, 1.38], [0.15, 1.5], [0.08, 1.53]], pal.main, { seg: 10, c2: pal.dark, scale: [1, 1, 0.85] });

    const cloak = m.part('cloak', { pivot: [0, 1.42, -0.14], parent: 'torso' });
    cloak.paint.extrude(CAPE, 0.035, pal.main, { at: [0, 1.44, -0.2], rot: [0.13, 0, 0], c2: pal.dark });

    // both arms and the rifle move as one piece so the kick stays glued to the hands
    const rifle = m.part('rifle', { pivot: [-0.1, 1.4, 0.1], parent: 'torso', ownGlow: true });
    const R = rifle.metal;
    R.mirrorX((b) => b.sphere(0.06, PAL.brass, { at: [0.21, 1.42, 0], seg: 6, rings: 4 }));
    R.limb([-0.21, 1.42, 0], [-0.25, 1.2, 0.08], 0.045, 0.04, PAL.steel, { seg: 6, rings: 2 });
    R.limb([-0.25, 1.2, 0.08], [-0.12, 1.33, 0.3], 0.04, 0.035, PAL.iron, { seg: 6, rings: 2 });
    R.limb([0.21, 1.42, 0], [0.22, 1.2, 0.26], 0.045, 0.04, PAL.steel, { seg: 6, rings: 2 });
    R.limb([0.22, 1.2, 0.26], [-0.06, 1.36, 0.6], 0.04, 0.035, PAL.iron, { seg: 6, rings: 2 });
    R.box(0.07, 0.13, 0.3, PAL.brass, { at: [-0.1, 1.37, 0.02] });
    R.box(0.085, 0.11, 0.34, PAL.iron, { at: [-0.1, 1.4, 0.33] });
    R.cyl(0.028, 0.032, 0.5, PAL.steel, { at: [-0.1, 1.41, 0.74], rot: [PI / 2, 0, 0], seg: 8 });
    R.torus(0.04, 0.014, PAL.brass, { at: [-0.1, 1.41, 0.6], rot: [PI / 2, 0, 0], seg: 8, tube: 3 });
    R.torus(0.04, 0.014, PAL.brass, { at: [-0.1, 1.41, 0.92], rot: [PI / 2, 0, 0], seg: 8, tube: 3 });
    R.cyl(0.035, 0.035, 0.26, PAL.ironDark, { at: [-0.1, 1.5, 0.34], rot: [PI / 2, 0, 0], seg: 8 });
    rifle.glow.crystal(0.06, 0.24, gc, { at: [-0.1, 1.41, 1.06], rot: [PI / 2, 0, 0], sides: 3 });
    rifle.glow.box(0.095, 0.05, 0.14, gc, { at: [-0.1, 1.41, 0.33], bevel: 0 });
    rifle.glow.cyl(0.028, 0.028, 0.02, gc, { at: [-0.1, 1.5, 0.475], rot: [PI / 2, 0, 0], seg: 8 });
  });
}

function longshotView(team) {
  const v = troopView('longshot', team, longshotModel(team), { stride: 0.95 });
  const { legL, legR, torso, cloak, rifle } = v.parts;
  const ty = torso.userData.home.y, rz = rifle.userData.home.z;
  const gR = v.glow.rifle;
  let brace = 0;
  v.animate = (dt, s, a) => {
    const t = s.time + a.seed, mv = a.move, sn = Math.sin(a.walk), cs = Math.cos(a.walk);
    brace = damp(brace, s.attackT >= 0 ? 1 : 0, 12, dt);
    const kick = impact(s.attackT, s.windup, 0.22);
    const ch = buildUp(s.attackT, s.windup);
    // braces into a split stance, sights, and the rifle kicks back exactly at windup
    walkLegs(a, legL, legR, 0.55, 0.06);
    legL.rotation.x -= 0.3 * brace;
    legR.rotation.x += 0.3 * brace;
    torso.position.y = ty + (cs > 0 ? cs : -cs) * 0.035 * mv + Math.sin(t * 1.9) * 0.008 - 0.07 * brace;
    torso.rotation.x = 0.06 * mv + 0.1 * brace - 0.14 * kick;
    torso.rotation.y = -0.15 * brace;
    torso.rotation.z = sn * 0.04 * mv;
    rifle.rotation.x = 0.3 * mv * (1 - brace) + Math.sin(t * 1.4) * 0.015 - 0.22 * kick;
    rifle.rotation.y = 0.15 * brace;
    rifle.position.z = rz - 0.14 * kick;
    cloak.rotation.x = 0.05 + 0.28 * mv + Math.sin(t * 2.3) * 0.04 + 0.3 * kick;
    cloak.rotation.z = sn * 0.05 * mv;
    if (gR) gR.color.setScalar(0.75 + 0.1 * Math.sin(t * 3.3) + 2.2 * ch + 2.5 * impact(s.attackT, s.windup, 0.15));
  };
  return v;
}

// ═════════════════════════════════════ GYRO LANCER ═════════════════════════════════════
// Knight balancing on one big wheel: iron tyre with glowing side rings, two wobbling gyro
// hoops at the hubs, team tabard / plume / round shield, and a long lance with a light tip.

const DIAMOND = [[0, 0.09], [0.07, 0], [0, -0.09], [-0.07, 0]];
const PENNON = [[0, 0], [0.28, -0.08], [0, -0.16]];
const WHEEL_R = 0.5;

function gyrolancerModel(team) {
  return defineModel(`gyrolancer:${team}`, (m) => {
    const pal = teamPalette(team);
    const gc = mix(pal.glow, PAL.white, 0.25);
    const axle = { at: [0, WHEEL_R, 0], rot: [0, 0, PI / 2] };       // local Y = the axle

    const wheel = m.part('wheel', { pivot: [0, WHEEL_R, 0], ownGlow: true });
    wheel.metal.group(axle, (b) => {
      b.torus(0.43, 0.07, PAL.ironDark, { seg: 18, tube: 6 });
      b.torus(0.34, 0.03, PAL.brass, { seg: 16, tube: 3 });
      b.ring(6, (bb) => bb.box(0.05, 0.05, 0.3, PAL.steel, { at: [0, 0, 0.19], bevel: 0 }));
      b.cyl(0.09, 0.09, 0.62, PAL.brass, { seg: 8 });
    });
    wheel.glow.group(axle, (b) => {
      b.torus(0.41, 0.022, gc, { at: [0, 0.068, 0], seg: 18, tube: 3 });
      b.torus(0.41, 0.022, gc, { at: [0, -0.068, 0], seg: 18, tube: 3 });
      b.cyl(0.05, 0.05, 0.64, gc, { seg: 6 });
    });

    const gyro = m.part('gyro', { pivot: [0, WHEEL_R, 0], cast: false });
    gyro.metal.group(axle, (b) => {
      b.torus(0.15, 0.02, PAL.gold, { at: [0, 0.16, 0], rot: [0.42, 0, 0], seg: 12, tube: 4 });
      b.torus(0.15, 0.02, PAL.gold, { at: [0, -0.16, 0], rot: [-0.42, 0, 0], seg: 12, tube: 4 });
      b.sphere(0.035, PAL.steel, { at: [0, 0.22, 0.137], seg: 6, rings: 3 });
      b.sphere(0.035, PAL.steel, { at: [0, -0.22, -0.137], seg: 6, rings: 3 });
    });

    const torso = m.part('torso', { pivot: [0, 1.08, 0] });
    const P = torso.paint, M = torso.metal, G = torso.glow;
    P.ball(0.2, 0.08, 0.26, PAL.leather, { at: [0, 1.07, -0.02], seg: 8, rings: 4 });
    P.mirrorX((b) => {
      b.limb([0.13, 1.12, 0], [0.27, 0.84, 0.14], 0.085, 0.075, PAL.iron, { seg: 6, rings: 2 });
      b.limb([0.27, 0.84, 0.14], [0.27, 0.54, 0.02], 0.07, 0.06, PAL.iron, { seg: 6, rings: 2 });
      b.sphere(0.08, pal.main, { at: [0.275, 0.84, 0.155], seg: 6, rings: 4 });
      b.ball(0.08, 0.06, 0.12, PAL.ironDark, { at: [0.27, 0.5, 0.05], seg: 6, rings: 4 });
    });
    P.lathe([[0.2, 1.1], [0.26, 1.22], [0.275, 1.36], [0.2, 1.47], [0.1, 1.5]], pal.main,
      { seg: 10, c2: pal.dark, scale: [1, 1, 0.85] });
    P.extrude(DIAMOND, 0.03, pal.light, { at: [0, 1.32, 0.232] });
    P.tube([[0, 1.74, 0.02], [0, 1.77, -0.08], [0, 1.72, -0.24], [0, 1.6, -0.34], [0, 1.48, -0.38]],
      [0.03, 0.065, 0.07, 0.05, 0.015], pal.main, { sides: 6 });
    // shield arm (left)
    P.limb([0.3, 1.42, 0], [0.37, 1.2, 0.12], 0.065, 0.06, PAL.iron, { seg: 6, rings: 2 });
    P.lathe([[0.21, 0], [0.2, 0.03], [0.12, 0.06], [0, 0.07]], pal.main, { at: [0.43, 1.2, 0.14], rot: [0, -0.5, -PI / 2], seg: 10 });
    P.torus(0.2, 0.026, pal.trim, { at: [0.44, 1.2, 0.145], rot: [0, -0.5, -PI / 2], seg: 10, tube: 3 });
    P.sphere(0.055, pal.trim, { at: [0.485, 1.2, 0.17], seg: 6, rings: 3 });
    M.torus(0.215, 0.03, PAL.brass, { at: [0, 1.13, 0], scale: [1, 1, 0.85], seg: 12, tube: 3 });
    M.mirrorX((b) => b.ball(0.12, 0.1, 0.13, PAL.steel, { at: [0.3, 1.44, 0], seg: 8, rings: 5 }));
    M.torus(0.12, 0.04, PAL.steel, { at: [0, 1.5, 0], seg: 10, tube: 4 });
    M.lathe([[0.14, 1.5], [0.17, 1.58], [0.165, 1.68], [0.1, 1.75], [0, 1.77]], PAL.steel, { seg: 10 });
    M.box(0.04, 0.2, 0.05, PAL.brass, { at: [0, 1.65, 0.16], bevel: 0.01 });
    G.box(0.24, 0.035, 0.06, gc, { at: [0, 1.63, 0.145], bevel: 0 });

    const lance = m.part('lance', { pivot: [-0.3, 1.42, 0], parent: 'torso', ownGlow: true });
    const L = lance.paint;
    L.limb([-0.3, 1.42, 0], [-0.36, 1.2, 0.1], 0.065, 0.06, PAL.iron, { seg: 6, rings: 2 });
    L.sphere(0.065, PAL.ironDark, { at: [-0.37, 1.17, 0.14], seg: 6, rings: 4 });
    L.limb([-0.38, 1.13, -0.45], [-0.38, 1.17, 1.0], 0.05, 0.028, PAL.cloth, { seg: 8, rings: 1 });
    L.sphere(0.06, PAL.brass, { at: [-0.38, 1.13, -0.47], seg: 6, rings: 3 });
    L.lathe([[0.03, 0], [0.13, 0.03], [0.11, 0.1], [0.045, 0.2]], pal.main, { at: [-0.38, 1.14, 0.2], rot: [PI / 2, 0, 0], seg: 10 });
    L.torus(0.045, 0.02, pal.main, { at: [-0.38, 1.158, 0.6], rot: [PI / 2, 0, 0], seg: 8, tube: 3 });
    L.torus(0.038, 0.018, pal.main, { at: [-0.38, 1.166, 0.86], rot: [PI / 2, 0, 0], seg: 8, tube: 3 });
    L.extrude(PENNON, 0.02, pal.main, { at: [-0.38, 1.14, 0.9], rot: [0, PI / 2, 0], c2: pal.dark });
    lance.glow.cone(0.05, 0.3, gc, { at: [-0.38, 1.172, 1.14], rot: [PI / 2, 0, 0], seg: 6 });
    lance.glow.torus(0.05, 0.018, gc, { at: [-0.38, 1.17, 0.98], rot: [PI / 2, 0, 0], seg: 8, tube: 3 });
  });
}

function gyrolancerView(team) {
  const v = troopView('gyrolancer', team, gyrolancerModel(team), { stride: TAU * WHEEL_R });
  const { wheel, gyro, torso, lance } = v.parts;
  const ty = torso.userData.home.y, lz = lance.userData.home.z;
  const gW = v.glow.wheel, gL = v.glow.lance;
  let chg = 0, spin = 0;
  v.animate = (dt, s, a) => {
    const t = s.time + a.seed, mv = a.move;
    const p = swing(s.attackT, s.windup, s.hitSpeed);
    const hit = impact(s.attackT, s.windup, 0.25);
    chg = damp(chg, s.charged ? 1 : 0, 10, dt);
    // rolls with distance travelled; at a standstill it rocks to keep its balance
    const rock = Math.sin(t * 1.7) * 0.07 * (1 - mv);
    wheel.rotation.x = a.walk + rock;
    v.body.position.z = rock * WHEEL_R + pose(p, -0.08, 0, 0.14);
    spin += dt * (2.2 + 5 * mv + 6 * chg);
    if (spin > TAU) spin -= TAU;
    gyro.rotation.x = -spin;
    torso.position.y = ty + Math.sin(t * 2.1) * 0.008 + Math.sin(a.walk * 2) * 0.012 * mv;
    torso.rotation.x = 0.07 * mv + 0.2 * chg - rock * 0.9 + pose(p, -0.14, 0, 0.22);
    torso.rotation.z = Math.sin(t * 1.3) * 0.03;
    // couched and levelled while charged; the thrust lands at windup
    lance.rotation.x = -0.13 * (1 - chg) + pose(p, -0.05, 0, 0.05) - 0.2 * chg;
    lance.position.z = lz + 0.1 * chg + pose(p, -0.3, 0, 0.42);
    const fl = Math.sin(t * 26) * 0.25 * chg;
    if (gW) gW.color.setScalar(0.3 + 1.5 * chg + fl);
    if (gL) gL.color.setScalar(0.45 + 1.6 * chg + fl + 1.5 * hit);
  };
  return v;
}

// ═════════════════════════════════════ PRISM GUARD ═════════════════════════════════════
// Small bucket-helmed sentinel in team plate with a crest, a short sword (right, −X), and a
// hexagonal hard-light shield projected from the left bracer while any shield is left.

function prismguardModel(team) {
  return defineModel(`prismguard:${team}`, (m) => {
    const pal = teamPalette(team);
    const gc = mix(pal.glow, PAL.white, 0.25);

    const leg = m.part('legL', { pivot: [0.1, 0.32, 0] });
    leg.paint.limb([0.1, 0.32, 0], [0.1, 0.12, 0], 0.075, 0.065, PAL.iron, { seg: 6, rings: 2 });
    leg.paint.ball(0.08, 0.06, 0.115, PAL.ironDark, { at: [0.1, 0.055, 0.03], seg: 8, rings: 4 });
    m.part('legR', { pivot: [-0.1, 0.32, 0], copy: 'legL' });

    const torso = m.part('torso', { pivot: [0, 0.32, 0] });
    const P = torso.paint, M = torso.metal, G = torso.glow;
    P.lathe([[0.15, 0.3], [0.225, 0.4], [0.245, 0.58], [0.2, 0.7], [0.12, 0.75]], pal.main, { seg: 10, c2: pal.dark });
    const crest = [], crestR = [0.02, 0.04, 0.045, 0.045, 0.04, 0.02];
    for (let k = 0; k < 6; k++) {
      const ang = 0.55 + k * 0.5;
      crest.push([0, 0.9 + 0.15 * Math.sin(ang), 0.15 * Math.cos(ang)]);
    }
    P.tube(crest, crestR, pal.main, { sides: 6 });
    P.limb([0.24, 0.68, 0], [0.3, 0.52, 0.14], 0.06, 0.055, PAL.iron, { seg: 6, rings: 2 });
    M.torus(0.228, 0.028, PAL.brass, { at: [0, 0.42, 0], seg: 12, tube: 3 });
    M.mirrorX((b) => b.ball(0.1, 0.08, 0.1, PAL.steel, { at: [0.24, 0.7, 0], seg: 8, rings: 4 }));
    M.lathe([[0.15, 0.74], [0.185, 0.8], [0.185, 0.94], [0.13, 1.02], [0, 1.05]], PAL.steel, { seg: 10 });
    M.torus(0.066, 0.026, PAL.brass, { at: [0.3, 0.52, 0.16], rot: [PI / 2, 0, 0], seg: 8, tube: 3 });
    G.box(0.24, 0.04, 0.06, gc, { at: [0, 0.88, 0.165], bevel: 0 });
    G.cyl(0.05, 0.05, 0.03, gc, { at: [0, 0.58, 0.24], rot: [PI / 2, 0, 0], seg: 6 });
    G.sphere(0.04, gc, { at: [0.3, 0.52, 0.2], seg: 6, rings: 3 });

    const armR = m.part('armR', { pivot: [-0.24, 0.68, 0], parent: 'torso' });
    const A = armR.metal;
    A.limb([-0.24, 0.68, 0], [-0.3, 0.5, 0.1], 0.06, 0.055, PAL.iron, { seg: 6, rings: 2 });
    A.sphere(0.06, PAL.ironDark, { at: [-0.3, 0.48, 0.13], seg: 6, rings: 4 });
    A.group({ at: [-0.3, 0.48, 0.14], rot: [1.25, 0, 0] }, (b) => {
      b.cyl(0.022, 0.022, 0.12, PAL.brass, { seg: 6 });
      b.sphere(0.03, PAL.gold, { at: [0, -0.08, 0], seg: 6, rings: 3 });
      b.box(0.17, 0.035, 0.06, PAL.gold, { at: [0, 0.07, 0] });
      b.box(0.065, 0.34, 0.022, PAL.steel, { at: [0, 0.26, 0], bevel: 0.008 });
      b.cone(0.033, 0.09, PAL.steel, { at: [0, 0.475, 0], scale: [1, 1, 0.35], seg: 4, phase: PI / 4 });
    });

    // hard-light hexagon: dim panel, bright frame, inner hex and a core stud
    const shield = m.part('shield', { pivot: [0.2, 0.56, 0.36], parent: 'torso', ownGlow: true, cast: false });
    shield.glow.group({ at: [0.2, 0.56, 0.36], rot: [0, 0.3, 0] }, (b) => b.group({ rot: [PI / 2, 0, 0] }, (h) => {
      h.cyl(0.33, 0.33, 0.02, gc, { seg: 6, bright: 0.42 });
      h.ring(6, (e) => e.box(0.36, 0.036, 0.034, gc, { at: [0, 0, 0.286], bevel: 0 }), PI / 6);
      h.ring(6, (e) => e.box(0.17, 0.03, 0.02, gc, { at: [0, 0, 0.147], bevel: 0, bright: 0.8 }), PI / 6);
      h.sphere(0.04, gc, { seg: 6, rings: 3 });
    }));
  });
}

function prismguardView(team) {
  const v = troopView('prismguard', team, prismguardModel(team), { stride: 0.5 });
  const { legL, legR, torso, armR, shield } = v.parts;
  const ty = torso.userData.home.y, az = armR.userData.home.z, shy = shield.userData.home.y;
  const gS = v.glow.shield;
  v.animate = (dt, s, a) => {
    const t = s.time + a.seed, mv = a.move, sn = Math.sin(a.walk), cs = Math.cos(a.walk);
    walkLegs(a, legL, legR, 0.7, 0.05);
    const p = swing(s.attackT, s.windup, s.hitSpeed);
    torso.position.y = ty + (cs > 0 ? cs : -cs) * 0.03 * mv + Math.sin(t * 2.4) * 0.006 * (1 - mv);
    torso.rotation.x = 0.1 * mv + pose(p, -0.12, 0, 0.22);
    torso.rotation.y = pose(p, -0.3, 0, 0.3);
    torso.rotation.z = sn * 0.05 * mv;
    // stab: elbow drawn back, then a straight thrust that lands at windup
    armR.rotation.x = pose(p, 0.35, -sn * 0.25 * mv, -0.12);
    armR.position.z = az + pose(p, -0.12, 0, 0.26);
    // the hexagon shrinks as the shield drains, stutters when nearly gone, and is hidden at 0
    const f = s.shieldFrac > 0 ? (s.shieldFrac < 1 ? s.shieldFrac : 1) : 0;
    if (f > 0) {
      shield.visible = true;
      shield.scale.setScalar((0.4 + 0.6 * f) * (1 + 0.03 * Math.sin(t * 6)));
      shield.position.y = shy + Math.sin(t * 2.4) * 0.015;
      if (gS) gS.color.setScalar(0.6 + 0.5 * f + (f < 0.35 ? 0.3 * Math.sin(t * 31) : 0));
    } else {
      shield.visible = false;
    }
  };
  return v;
}

// ═════════════════════════════════════ SPARKWISP ═════════════════════════════════════
// Mini flyer (3 draws, all unlit): a white-hot core with two dark eyes, a slowly tumbling star
// of faceted team-glow spikes, and three lightning arcs that orbit, jitter and blink.

const ARC = [[-0.1, 0.02, 0.17], [-0.04, -0.03, 0.21], [0, 0.03, 0.2], [0.05, -0.02, 0.22], [0.11, 0.02, 0.17]];
const ARC_R = [0.004, 0.014, 0.016, 0.014, 0.004];
const WISP_Y = 0.25;

function sparkwispModel(team) {
  return defineModel(`sparkwisp:${team}`, (m) => {
    const pal = teamPalette(team);
    const gc = mix(pal.glow, PAL.white, 0.15);
    const spike = { sides: 4, top: 0.72, bottom: 0.14 };

    const core = m.part('core', { pivot: [0, WISP_Y, 0], ownGlow: true });
    core.glow.sphere(0.105, mix(pal.glow, PAL.white, 0.65), { at: [0, WISP_Y, 0], seg: 10, rings: 6 });
    core.glow.mirrorX((b) => b.ball(0.022, 0.032, 0.015, PAL.eye, { at: [0.04, WISP_Y + 0.015, 0.097], seg: 6, rings: 3 }));

    const aura = m.part('aura', { pivot: [0, WISP_Y, 0], cast: false });
    aura.glow.group({ at: [0, WISP_Y, 0], rot: [0.3, 0, 0.2] }, (b) => {
      b.ring(6, (bb, i) => {
        const h = i % 2 ? 0.1 : 0.15;
        bb.crystal(0.042, h, gc, { ...spike, at: [0, 0, 0.1 + h / 2], rot: [PI / 2, 0, 0] });
      });
      b.crystal(0.04, 0.14, gc, { ...spike, at: [0, 0.17, 0] });
      b.crystal(0.04, 0.14, gc, { ...spike, at: [0, -0.17, 0], rot: [PI, 0, 0] });
    });

    const arcs = m.part('arcs', { pivot: [0, WISP_Y, 0], cast: false });
    arcs.glow.group({ at: [0, WISP_Y, 0], rot: [-0.5, 0, 0.4] }, (b) => {
      b.ring(3, (bb) => bb.tube(ARC, ARC_R, mix(pal.main, PAL.white, 0.35), { sides: 3, bright: 0.8 }));
    });
  });
}

function sparkwispView(team) {
  const v = troopView('sparkwisp', team, sparkwispModel(team), { stride: 1 });
  const { core, aura, arcs } = v.parts;
  const gC = v.glow.core;
  let spin = 0;
  v.animate = (dt, s, a) => {
    const t = s.time + a.seed, mv = a.move;
    const p = swing(s.attackT, s.windup, s.hitSpeed);
    const ch = buildUp(s.attackT, s.windup), hit = impact(s.attackT, s.windup, 0.2);
    spin += dt * (2.5 + 2 * mv + 8 * ch);
    if (spin > TAU * 10) spin -= TAU * 10;
    aura.rotation.y = spin;
    aura.rotation.x = Math.sin(t * 1.3) * 0.3;
    aura.scale.setScalar(1 + 0.08 * Math.sin(t * 9) + 0.3 * ch + 0.4 * hit);
    arcs.rotation.y = -spin * 1.7;
    arcs.rotation.z = Math.sin(t * 2.9) * 0.6;
    arcs.scale.setScalar(1 + 0.18 * Math.sin(t * 37) * Math.sin(t * 13.7));
    arcs.visible = Math.sin(t * 29) > -0.55;
    core.scale.setScalar(1 + 0.06 * Math.sin(t * 11) + 0.25 * ch);
    if (gC) gC.color.setScalar(0.85 + 0.15 * Math.sin(t * 11) + 1.5 * ch + 2 * hit);
    // bobs on the spot; tucks up and back, then dives into the target
    v.body.position.y = Math.sin(t * 4.1) * 0.05 + pose(p, 0.07, 0, -0.14);
    v.body.position.z = pose(p, -0.1, 0, 0.36);
    v.body.rotation.x = pose(p, -0.3, 0.1 * mv, 0.5);
  };
  return v;
}

// ═════════════════════════════════════ BOILERBACK ═════════════════════════════════════
// Round steam-boiler walker: iron belly, riveted team jacket, brass hoop, chimney, porthole
// eyes and a pressure gauge whose needle climbs as hp falls. The firebox, side vents and the
// chimney mouth share one material that goes from dull amber to a pulsing red-orange.

const FIRE_ROT = 2.04;      // firebox faces forward and down
const GAUGE_ROT = 0.9;      // gauge faces forward and up

function boilerbackModel(team) {
  return defineModel(`boilerback:${team}`, (m) => {
    const pal = teamPalette(team);
    const eyeC = mix(pal.glow, PAL.white, 0.3);
    const HOT = [1, 1, 1];
    const hot = 1 / GLOW_BOOST;                 // vertex colour 1.0: the material colour IS the output

    const leg = m.part('legL', { pivot: [0.36, 0.46, 0] });
    leg.metal.limb([0.36, 0.46, 0], [0.38, 0.2, 0.02], 0.17, 0.15, PAL.iron, { rings: 2 });
    leg.metal.torus(0.165, 0.035, PAL.brass, { at: [0.37, 0.33, 0.01], seg: 10, tube: 3 });
    leg.metal.ball(0.23, 0.12, 0.3, PAL.ironDark, { at: [0.38, 0.11, 0.07], seg: 10, rings: 5 });
    m.part('legR', { pivot: [-0.36, 0.46, 0], copy: 'legL' });

    const boiler = m.part('boiler', { pivot: [0, 0.46, 0] });
    const P = boiler.paint, M = boiler.metal, G = boiler.glow;
    P.ball(0.72, 0.7, 0.7, PAL.iron, { at: [0, 1.05, 0], c2: PAL.ironDark, seg: 14, rings: 8 });
    P.lathe([[0.75, 1.1], [0.735, 1.26], [0.64, 1.5], [0.46, 1.68], [0.22, 1.77], [0, 1.79]], pal.main,
      { seg: 14, c2: pal.dark, cap: false });
    P.cyl(0.13, 0.13, 0.04, PAL.bone, { at: [0, 1.54, 0.62], rot: [GAUGE_ROT, 0, 0], seg: 12, bright: 1.15 });
    M.torus(0.755, 0.045, PAL.brass, { at: [0, 1.09, 0], seg: 16, tube: 4 });
    // rivet rows: tiny, so low-poly studs read the same as round ones
    M.ring(12, (b) => b.sphere(0.035, PAL.gold, { at: [0, 1.36, 0.705], seg: 5, rings: 2 }), 0.26);
    M.ring(8, (b) => b.sphere(0.03, PAL.gold, { at: [0, 1.62, 0.535], seg: 5, rings: 2 }), 0.39);
    M.cyl(0.15, 0.185, 0.4, PAL.iron, { at: [0, 1.86, -0.26], seg: 10 });
    M.torus(0.16, 0.04, PAL.brass, { at: [0, 2.05, -0.26], seg: 12, tube: 4 });
    M.torus(0.2, 0.03, PAL.brass, { at: [0, 1.71, -0.26], seg: 12, tube: 3 });
    M.torus(0.14, 0.03, PAL.brass, { at: [0, 1.54, 0.62], rot: [GAUGE_ROT, 0, 0], seg: 12, tube: 4 });
    M.torus(0.2, 0.04, PAL.brass, { at: [0, 0.74, 0.63], rot: [FIRE_ROT, 0, 0], seg: 12, tube: 4 });
    M.group({ at: [0, 0.735, 0.645], rot: [FIRE_ROT, 0, 0] }, (b) => {
      b.box(0.035, 0.03, 0.36, PAL.ironDark, { at: [-0.09, 0, 0], bevel: 0 });
      b.box(0.035, 0.03, 0.38, PAL.ironDark, { bevel: 0 });
      b.box(0.035, 0.03, 0.36, PAL.ironDark, { at: [0.09, 0, 0], bevel: 0 });
    });
    M.mirrorX((b) => b.group({ at: [0.27, 1.25, 0.695], rot: [0, 0.38, 0] }, (g) => {
      g.torus(0.095, 0.026, PAL.brass, { rot: [PI / 2, 0, 0], seg: 10, tube: 3 });
    }));
    G.mirrorX((b) => b.sphere(0.085, eyeC, { at: [0.27, 1.25, 0.67], seg: 8, rings: 5 }));

    const core = m.part('core', { pivot: [0, 1.05, 0], parent: 'boiler', ownGlow: true, cast: false });
    const C = core.glow;
    C.cyl(0.19, 0.19, 0.03, HOT, { at: [0, 0.745, 0.62], rot: [FIRE_ROT, 0, 0], seg: 10, bright: hot });
    C.cyl(0.13, 0.13, 0.02, HOT, { at: [0, 2.05, -0.26], seg: 8, bright: hot });
    for (let k = -1; k <= 1; k++) {
      C.mirrorX((b) => b.group({ at: [0, 0.86, 0], rot: [0, PI / 2 + k * 0.3, 0] }, (g) => {
        g.box(0.05, 0.18, 0.05, HOT, { at: [0, 0, 0.675], bevel: 0, bright: hot });
      }));
    }

    // authored flat (needle along +Z, dial normal +Y); the view tilts it onto the gauge
    const needle = m.part('needle', { pivot: [0, 1.555, 0.632], parent: 'boiler', cast: false });
    needle.paint.box(0.03, 0.016, 0.12, NEEDLE_RED, { at: [0, 1.565, 0.677], bevel: 0 });
    needle.paint.sphere(0.025, PAL.ironDark, { at: [0, 1.562, 0.632], seg: 6, rings: 3 });

    const arms = m.part('arms', { pivot: [0, 1.12, 0], parent: 'boiler' });
    arms.metal.mirrorX((b) => {
      b.sphere(0.13, PAL.brass, { at: [0.71, 1.12, 0.05], seg: 8, rings: 5 });
      b.limb([0.73, 1.1, 0.06], [0.82, 0.84, 0.2], 0.09, 0.1, PAL.iron, { rings: 2 });
      b.sphere(0.13, PAL.steel, { at: [0.83, 0.76, 0.24], seg: 8, rings: 5 });
    });
  });
}

function boilerbackView(team) {
  const v = troopView('boilerback', team, boilerbackModel(team), { stride: 1.1, hopHeight: 0.6 });
  const { legL, legR, boiler, needle, arms } = v.parts;
  const by = boiler.userData.home.y;
  const gCore = v.glow.core;
  needle.rotation.x = GAUGE_ROT;
  v.animate = (dt, s, a) => {
    const t = s.time + a.seed, mv = a.move, sn = Math.sin(a.walk), cs = Math.cos(a.walk);
    walkLegs(a, legL, legR, 0.4, 0.1);
    const p = swing(s.attackT, s.windup, s.hitSpeed);
    const hit = impact(s.attackT, s.windup, 0.3);
    let h = 1 - s.hpFrac;                       // 0 = healthy … 1 = about to blow
    h = h > 0 ? (h < 1 ? h : 1) : 0;
    // heavy waddle; leans back, then throws its belly forward
    v.body.position.z = pose(p, -0.18, 0, 0.42);
    boiler.position.y = by + (cs > 0 ? cs : -cs) * 0.05 * mv + Math.sin(t * 1.7) * 0.01 + pose(p, 0.1, 0, -0.06);
    boiler.rotation.x = pose(p, -0.3, 0.04 * mv, 0.26);
    boiler.rotation.z = sn * 0.1 * mv;
    boiler.rotation.y = Math.sin(t * 31) * 0.02 * h * h;          // rattles as the pressure climbs
    const breath = Math.sin(t * (3.2 + 4 * h)) * (0.01 + 0.012 * h);
    boiler.scale.set(1 + breath + 0.05 * hit, 1 - breath - 0.07 * hit, 1 + breath + 0.1 * hit);
    arms.rotation.x = sn * 0.25 * mv + pose(p, -1.0, 0, 0.3);
    needle.rotation.y = PI + 1.0 - 2.0 * h + Math.sin(t * 14) * 0.06 * (0.3 + h);
    if (gCore) {
      const pulse = 0.5 + 0.5 * Math.sin(t * (3 + 9 * h));
      const k = 0.55 + 1.5 * h + (0.15 + 0.5 * h) * pulse + 0.8 * hit;
      gCore.color.setRGB(k, k * (0.42 - 0.22 * h), k * (0.1 - 0.06 * h));
    }
  };
  return v;
}

// ═════════════════════════════════════ POD STRIDER ═════════════════════════════════════
// Stilt-legged bark walker: four high-kneed legs with team knee caps and wraps, a small body
// with leaf ears, and a huge green seed pod strapped on its back — team petals around the base,
// glowing seeds in the skin and sprouts poking out of the top.

function striderLeg(m, name, sx, sz, pal) {
  const hip = [0.26 * sx, 1.02, 0.22 * sz], knee = [0.46 * sx, 1.3, 0.38 * sz], ankle = [0.48 * sx, 0.12, 0.44 * sz];
  const P = m.part(name, { pivot: hip }).paint;
  P.limb(hip, knee, 0.075, 0.06, BARK, { seg: 6, rings: 2 });
  P.sphere(0.085, pal.main, { at: knee, seg: 6, rings: 4 });
  P.limb(knee, ankle, 0.055, 0.04, PAL.woodDark, { seg: 6, rings: 2 });
  P.torus(0.062, 0.026, pal.main, { at: [0.474 * sx, 0.5, 0.42 * sz], seg: 8, tube: 3 });
  P.ball(0.1, 0.06, 0.125, PAL.woodDark, { at: [0.48 * sx, 0.055, 0.44 * sz + 0.02], seg: 8, rings: 4 });
}

function podstriderModel(team) {
  return defineModel(`podstrider:${team}`, (m) => {
    const pal = teamPalette(team);
    const gc = mix(pal.glow, PAL.white, 0.25);

    striderLeg(m, 'legFL', 1, 1, pal);
    striderLeg(m, 'legFR', -1, 1, pal);
    striderLeg(m, 'legRL', 1, -1, pal);
    striderLeg(m, 'legRR', -1, -1, pal);

    const body = m.part('body', { pivot: [0, 1.02, 0] });
    const P = body.paint;
    P.ball(0.34, 0.2, 0.42, BARK, { at: [0, 1.02, 0], c2: PAL.woodDark, seg: 10, rings: 6 });
    P.ball(0.17, 0.15, 0.16, mix(BARK, PAL.sand, 0.35), { at: [0, 1.0, 0.44], seg: 10, rings: 5 });
    P.mirrorX((b) => b.cone(0.05, 0.22, PAL.leaf, { at: [0.11, 1.16, 0.42], rot: [0.4, 0, -0.5], seg: 5 }));
    P.torus(0.3, 0.035, pal.main, { at: [0, 1.04, 0.14], rot: [PI / 2, 0, 0], scale: [1.12, 1, 0.7], seg: 12, tube: 3 });
    P.torus(0.3, 0.035, pal.main, { at: [0, 1.04, -0.18], rot: [PI / 2, 0, 0], scale: [1.08, 1, 0.67], seg: 12, tube: 3 });
    body.glow.mirrorX((b) => b.sphere(0.045, gc, { at: [0.08, 1.03, 0.575], seg: 6, rings: 4 }));

    const pod = m.part('pod', { pivot: [0, 1.16, -0.05], parent: 'body' });
    const Q = pod.paint;
    Q.group({ at: [0, 0, -0.05] }, (b) => {
      b.lathe([[0.16, 1.14], [0.34, 1.24], [0.47, 1.45], [0.44, 1.66], [0.3, 1.83], [0.12, 1.93], [0, 1.95]], POD,
        { seg: 12, c2: PAL.mossDark });
      b.ring(6, (bb) => bb.ball(0.14, 0.2, 0.045, pal.main, { at: [0, 1.33, 0.4], rot: [0.45, 0, 0], c2: pal.dark, seg: 8, rings: 4 }));
      // sprouts: one from the crown, two from the shoulders
      b.tube([[0, 1.9, 0], [0.02, 1.96, 0.01], [0.07, 1.985, 0.02]], [0.03, 0.025, 0.012], PAL.leaf, { sides: 5 });
      b.ball(0.075, 0.02, 0.04, PAL.leaf, { at: [0.13, 1.995, 0.02], rot: [0, 0, 0.25], seg: 6, rings: 3 });
      b.ball(0.06, 0.02, 0.035, PAL.leaf, { at: [-0.03, 1.985, 0.0], rot: [0, 0, -0.5], seg: 6, rings: 3 });
      b.cone(0.045, 0.2, PAL.leaf, { at: [0.36, 1.82, 0.12], rot: [0.3, 0, -0.9], seg: 5 });
      b.cone(0.04, 0.17, PAL.leaf, { at: [-0.3, 1.86, -0.2], rot: [-0.5, 0, 0.8], seg: 5 });
    });
    pod.glow.group({ at: [0, 0, -0.05] }, (b) => {
      b.ring(5, (bb) => bb.ball(0.05, 0.08, 0.03, gc, { at: [0, 1.6, 0.445], seg: 6, rings: 4 }), 0.3);
      b.ring(3, (bb) => bb.ball(0.035, 0.055, 0.025, gc, { at: [0, 1.8, 0.325], rot: [-0.5, 0, 0], seg: 6, rings: 3 }), 1.2);
    });
  });
}

function podstriderView(team) {
  const v = troopView('podstrider', team, podstriderModel(team), { stride: 1.1 });
  const { legFL, legFR, legRL, legRR, body, pod } = v.parts;
  const by = body.userData.home.y;
  const ly = legFL.userData.home.y;             // all four hips sit at the same height
  v.animate = (dt, s, a) => {
    const t = s.time + a.seed, mv = a.move, sn = Math.sin(a.walk), cs = Math.cos(a.walk);
    const p = swing(s.attackT, s.windup, s.hitSpeed);
    const hit = impact(s.attackT, s.windup, 0.35);
    // diagonal-pair stilt gait
    const sw = sn * 0.22 * mv;
    const upA = (cs > 0 ? cs : 0) * 0.1 * mv, upB = (cs < 0 ? -cs : 0) * 0.1 * mv;
    legFL.rotation.x = -sw; legFL.position.y = ly + upA;
    legRR.rotation.x = -sw; legRR.position.y = ly + upA;
    legRL.rotation.x = sw; legRL.position.y = ly + upB;
    // front-right leg: hauled up high, then stamped down at windup
    legFR.rotation.x = pose(p, -0.9, sw, -0.14);
    legFR.position.y = ly + upB + (p < 0 ? -p * 0.2 : 0);
    body.position.y = by + (cs > 0 ? cs : -cs) * 0.04 * mv + Math.sin(t * 1.6) * 0.012 + pose(p, 0.05, 0, -0.09);
    body.rotation.x = pose(p, -0.14, 0.03 * mv, 0.16);
    body.rotation.z = sn * 0.05 * mv;
    // the pod lags behind every step and squashes when the stomp lands
    pod.rotation.z = -sn * 0.07 * mv + Math.sin(t * 1.3) * 0.025;
    pod.rotation.x = cs * 0.04 * mv + pose(p, 0.1, 0, -0.12);
    const breath = Math.sin(t * 2) * 0.015;
    pod.scale.set(1 + breath + 0.1 * hit, 1 - breath - 0.12 * hit, 1 + breath + 0.1 * hit);
  };
  return v;
}

registerUnit('stormray', stormrayView);
registerUnit('ramhorn', ramhornView);
registerUnit('sage', sageView);
registerUnit('breaker', breakerView);
registerUnit('mite', miteView);
registerUnit('longshot', longshotView);
registerUnit('gyrolancer', gyrolancerView);
registerUnit('prismguard', prismguardView);
registerUnit('sparkwisp', sparkwispView);
registerUnit('boilerback', boilerbackView);
registerUnit('podstrider', podstriderView);
