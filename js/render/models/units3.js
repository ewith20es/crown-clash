// Aether Spires — troop models, batch 3 (Sproutling, Thunderhead, Coil Crab, Frost Snail, Sunlens,
// Bloom Tender, Gearwright, Shardlynx, Skyfall Titan, Slingtoad, Drillworm) and the spell card icons.
// Same patterns as units1.js: defineModel (geometry cached per team) + unitView + an animate() that
// only writes numbers onto part transforms and ownGlow colours.

import { UNITS } from '../../data/cards.js';
import { registerUnit, registerIcon } from './registry.js';
import {
  PAL, col, mix, shade, teamPalette, defineModel, unitView, staticGroup,
  swing, pose, buildUp, impact, walkLegs,
} from './kit.js';

const PI = Math.PI, TAU = PI * 2;

function troopView(type, team, def, o) {
  return unitView(type, team, def, { height: UNITS[type].height, ...o });
}

const LEAF = [[0, 0], [0.06, 0.05], [0.15, 0.07], [0.25, 0.04], [0.3, 0], [0.24, -0.035], [0.14, -0.05], [0.05, -0.035]];
const BOLT = [[-0.05, 0.5], [0.14, 0.5], [0.04, 0.12], [0.2, 0.12], [-0.12, -0.5], [-0.02, -0.06], [-0.18, -0.06]];

// ═════════════════════════════════════ SPROUTLING (mini) ═════════════════════════════════════
// A seed-bodied sprout with a leaf on its head and a team-coloured bud. 2 meshes.

function sproutlingModel(team) {
  return defineModel(`sproutling:${team}`, (m) => {
    const pal = teamPalette(team);
    const bark = col(0x8a6a3e), barkDark = col(0x5e4426);
    const torso = m.part('torso', { pivot: [0, 0.04, 0] });
    const P = torso.paint;
    P.ball(0.16, 0.18, 0.15, bark, { at: [0, 0.22, 0], c2: barkDark, seg: 10, rings: 6 });
    P.ball(0.1, 0.11, 0.04, col(0xd9b77a), { at: [0, 0.2, 0.12], seg: 8, rings: 4 });
    P.mirrorX((b) => {
      b.ball(0.06, 0.04, 0.08, barkDark, { at: [0.08, 0.04, 0.02], seg: 6, rings: 3 });
      b.sphere(0.035, PAL.eye, { at: [0.06, 0.29, 0.13], seg: 6, rings: 4 });
      b.limb([0.14, 0.24, 0], [0.2, 0.15, 0.05], 0.025, 0.02, barkDark, { seg: 5, rings: 1 });
    });
    P.limb([0, 0.38, 0], [0.02, 0.5, -0.02], 0.018, 0.014, PAL.moss, { seg: 5, rings: 1 });
    P.group({ at: [0.02, 0.5, -0.02], rot: [0, 0.4, 0.5] }, (g) => g.extrude(LEAF, 0.012, PAL.leaf, { rot: [-PI / 2, 0, 0] }));
    P.group({ at: [0.0, 0.48, -0.02], rot: [0, -2.4, 0.4] }, (g) => g.extrude(LEAF, 0.012, PAL.moss, { rot: [-PI / 2, 0, 0], scale: 0.7 }));
    P.torus(0.13, 0.025, pal.main, { at: [0, 0.12, 0], seg: 10, tube: 3 });
    torso.glow.sphere(0.045, mix(pal.glow, PAL.white, 0.3), { at: [0.0, 0.5, -0.02], seg: 6, rings: 4 });
    torso.glow.mirrorX((b) => b.sphere(0.014, PAL.white, { at: [0.07, 0.3, 0.155], seg: 4, rings: 3 }));
  });
}

function sproutlingView(team) {
  const v = troopView('sproutling', team, sproutlingModel(team), { stride: 0.45, hopHeight: 0.5 });
  const { torso } = v.parts;
  const ty = torso.userData.home.y, tz = torso.userData.home.z;
  v.animate = (dt, s, a) => {
    const t = s.time + a.seed, mv = a.move;
    const up = Math.abs(Math.sin(a.walk));
    const land = 1 - up, q = land * land * land * mv;
    const p = swing(s.attackT, s.windup, s.hitSpeed);
    torso.position.y = ty + up * 0.08 * mv + Math.sin(t * 3) * 0.01 * (1 - mv);
    torso.scale.set(1 + 0.1 * q, 1 - 0.16 * q, 1 + 0.1 * q);
    torso.rotation.x = 0.12 * mv + pose(p, -0.45, 0, 0.6);
    torso.position.z = tz + pose(p, -0.06, 0, 0.12);
    torso.rotation.z = Math.sin(a.walk) * 0.12 * mv;
  };
  return v;
}

// ═════════════════════════════════════ THUNDERHEAD (flyer) ═════════════════════════════════════
// A grumpy living storm cloud with team-tinted lightning veins and rain streaks underneath.

function thunderheadModel(team) {
  return defineModel(`thunderhead:${team}`, (m) => {
    const pal = teamPalette(team);
    const cloud = col(0x8e94a8), cloudLight = col(0xd2d6e2), cloudDark = col(0x555b70);
    const vein = mix(pal.glow, PAL.white, 0.35);
    const body = m.part('cloud', { pivot: [0, 0.6, 0], ownGlow: true });
    const P = body.paint, G = body.glow;
    P.sphere(0.48, cloud, { at: [0, 0.62, 0], c2: cloudDark, seg: 12, rings: 8 });
    P.sphere(0.36, cloudLight, { at: [0.42, 0.72, -0.05], c2: cloud, seg: 10, rings: 6 });
    P.sphere(0.34, cloudLight, { at: [-0.44, 0.68, 0.0], c2: cloud, seg: 10, rings: 6 });
    P.sphere(0.32, cloud, { at: [0.15, 0.95, -0.12], seg: 10, rings: 6 });
    P.sphere(0.28, cloudLight, { at: [-0.2, 1.0, -0.05], seg: 10, rings: 6 });
    P.sphere(0.26, cloudDark, { at: [0.0, 0.55, -0.4], seg: 8, rings: 5 });
    P.ball(0.62, 0.16, 0.42, cloudDark, { at: [0, 0.32, 0], seg: 12, rings: 4 });
    // grumpy face: heavy brows over glowing eyes, a scowl
    P.mirrorX((b) => b.box(0.17, 0.045, 0.06, cloudDark, { at: [0.13, 0.78, 0.44], rot: [0, 0, 0.35], bevel: 0.02 }));
    P.box(0.16, 0.035, 0.05, cloudDark, { at: [0, 0.54, 0.46], rot: [0, 0, 0], bevel: 0.015 });
    G.mirrorX((b) => b.ball(0.06, 0.045, 0.03, vein, { at: [0.13, 0.7, 0.45], seg: 8, rings: 4 }));
    // lightning veins
    G.group({ at: [0.32, 0.75, 0.25], rot: [0, 0.6, 0.2], scale: 0.42 }, (g) => g.extrude(BOLT, 0.05, vein));
    G.group({ at: [-0.35, 0.82, 0.18], rot: [0, -0.6, -0.4], scale: 0.36 }, (g) => g.extrude(BOLT, 0.05, vein));
    G.group({ at: [0.05, 1.05, 0.2], rot: [0, 0, 1.2], scale: 0.3 }, (g) => g.extrude(BOLT, 0.05, vein));
    G.torus(0.5, 0.025, pal.glow, { at: [0, 0.4, 0], seg: 16, tube: 3 });

    const rain = m.part('rain', { pivot: [0, 0.3, 0], cast: false });
    const drop = mix(PAL.crystal, pal.light, 0.3);
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4, r = 0.12 + (i % 3) * 0.14;
      const x = Math.cos(a) * r, z = Math.sin(a) * r * 0.7;
      rain.paint.limb([x, 0.28, z], [x, 0.0 - (i % 2) * 0.1, z], 0.012, 0.008, drop, { seg: 4, rings: 1 });
    }
  });
}

function thunderheadView(team) {
  const v = troopView('thunderhead', team, thunderheadModel(team), { stride: 1.2 });
  const { cloud, rain } = v.parts;
  const g = v.glow.cloud;
  const cy = cloud.userData.home.y;
  v.animate = (dt, s, a) => {
    const t = s.time + a.seed;
    const p = swing(s.attackT, s.windup, s.hitSpeed);
    const charge = buildUp(s.attackT, s.windup), hit = impact(s.attackT, s.windup, 0.3);
    v.body.position.y = Math.sin(t * 1.6) * 0.08;
    const breathe = 1 + Math.sin(t * 2.1) * 0.03 + charge * 0.12 - hit * 0.08;
    cloud.scale.set(breathe, 1 + Math.sin(t * 2.1 + 1) * 0.03 + charge * 0.08, breathe);
    cloud.rotation.z = Math.sin(t * 0.9) * 0.06;
    cloud.rotation.x = pose(p, -0.18, 0.05 * a.move, 0.25);
    cloud.position.y = cy + pose(p, 0.08, 0, -0.1);
    rain.position.y = rain.userData.home.y - ((t * 1.6) % 0.25);
    if (g) g.color.setScalar(0.8 + 0.25 * Math.sin(t * 7) * Math.sin(t * 3.3) + 2.6 * charge + 3.5 * hit);
  };
  return v;
}

// ═════════════════════════════════════ COIL CRAB ═════════════════════════════════════
// A stout crab with a brass tesla coil on its back (glowing tip = muzzle, y ≈ 1.1) and big claws.

function coilcrabModel(team) {
  return defineModel(`coilcrab:${team}`, (m) => {
    const pal = teamPalette(team);
    const shell = mix(pal.main, col(0xd86a40), 0.25);
    const gc = mix(pal.glow, PAL.white, 0.35);

    const legsL = m.part('legsL', { pivot: [0.3, 0.32, 0], cast: false });
    for (let i = 0; i < 3; i++) {
      const z = 0.2 - i * 0.2;
      legsL.paint.limb([0.3, 0.32, z], [0.55, 0.3, z * 1.2], 0.04, 0.035, pal.dark, { seg: 5, rings: 1 });
      legsL.paint.limb([0.55, 0.3, z * 1.2], [0.62, 0.0, z * 1.3], 0.035, 0.015, pal.dark, { seg: 5, rings: 1 });
    }
    const legsR = m.part('legsR', { pivot: [-0.3, 0.32, 0], cast: false });
    for (let i = 0; i < 3; i++) {
      const z = 0.2 - i * 0.2;
      legsR.paint.limb([-0.3, 0.32, z], [-0.55, 0.3, z * 1.2], 0.04, 0.035, pal.dark, { seg: 5, rings: 1 });
      legsR.paint.limb([-0.55, 0.3, z * 1.2], [-0.62, 0.0, z * 1.3], 0.035, 0.015, pal.dark, { seg: 5, rings: 1 });
    }

    const body = m.part('body', { pivot: [0, 0.35, 0], ownGlow: true });
    const P = body.paint, M = body.metal, G = body.glow;
    P.ball(0.48, 0.2, 0.4, shell, { at: [0, 0.4, 0], c2: pal.dark, seg: 14, rings: 7 });
    P.ball(0.42, 0.08, 0.34, mix(shell, PAL.white, 0.25), { at: [0, 0.27, 0.02], seg: 12, rings: 4 });
    P.mirrorX((b) => {
      b.limb([0.1, 0.5, 0.32], [0.13, 0.66, 0.36], 0.02, 0.018, pal.dark, { seg: 5, rings: 1 });
      b.sphere(0.055, PAL.white, { at: [0.13, 0.69, 0.37], seg: 8, rings: 5 });
      b.sphere(0.03, PAL.eye, { at: [0.135, 0.7, 0.415], seg: 6, rings: 4 });
    });
    P.ring(5, (b) => b.cone(0.05, 0.1, pal.trim, { at: [0, 0.55, 0.3], rot: [0.5, 0, 0], seg: 5 }), 0.3);
    // the coil: brass housing, copper windings, crown ring and glowing orb tip
    M.cyl(0.14, 0.18, 0.12, PAL.ironDark, { at: [0, 0.6, -0.08], seg: 10 });
    M.cyl(0.07, 0.09, 0.32, PAL.brass, { at: [0, 0.82, -0.08], seg: 10 });
    for (let i = 0; i < 4; i++) M.torus(0.095 - i * 0.006, 0.022, PAL.copper, { at: [0, 0.71 + i * 0.07, -0.08], seg: 10, tube: 3 });
    M.torus(0.13, 0.022, PAL.brass, { at: [0, 1.0, -0.08], seg: 12, tube: 3 });
    G.sphere(0.09, gc, { at: [0, 1.1, -0.08], seg: 10, rings: 6 });
    G.torus(0.13, 0.012, gc, { at: [0, 1.0, -0.08], seg: 12, tube: 3 });

    const claws = m.part('claws', { pivot: [0, 0.38, 0.3], parent: 'body' });
    claws.paint.mirrorX((b) => {
      b.limb([0.32, 0.38, 0.22], [0.4, 0.38, 0.45], 0.06, 0.07, shell, { seg: 6, rings: 1 });
      b.ball(0.13, 0.1, 0.15, shell, { at: [0.4, 0.4, 0.56], c2: pal.dark, seg: 8, rings: 5 });
      b.ball(0.05, 0.035, 0.12, pal.trim, { at: [0.36, 0.35, 0.68], rot: [0.2, 0.2, 0], seg: 6, rings: 3 });
      b.ball(0.05, 0.035, 0.11, shade(shell, 0.8), { at: [0.45, 0.46, 0.67], rot: [-0.2, -0.2, 0], seg: 6, rings: 3 });
    });
  });
}

function coilcrabView(team) {
  const v = troopView('coilcrab', team, coilcrabModel(team), { stride: 0.5 });
  const { legsL, legsR, body, claws } = v.parts;
  const g = v.glow.body;
  const by = body.userData.home.y;
  v.animate = (dt, s, a) => {
    const t = s.time + a.seed, mv = a.move, sn = Math.sin(a.walk * 2);
    const p = swing(s.attackT, s.windup, s.hitSpeed);
    legsL.rotation.z = sn * 0.25 * mv;
    legsR.rotation.z = sn * 0.25 * mv;
    legsL.rotation.y = Math.cos(a.walk * 2) * 0.2 * mv;
    legsR.rotation.y = -Math.cos(a.walk * 2) * 0.2 * mv;
    body.position.y = by + Math.abs(sn) * 0.03 * mv + Math.sin(t * 2) * 0.01;
    body.rotation.z = sn * 0.05 * mv;
    body.rotation.x = pose(p, 0.12, 0, -0.1);
    claws.rotation.x = pose(p, -0.6, Math.sin(t * 1.8) * 0.05, 0.2);
    if (g) g.color.setScalar(0.9 + 0.2 * Math.sin(t * 13) + 2.8 * buildUp(s.attackT, s.windup) + 3 * impact(s.attackT, s.windup, 0.25));
  };
  return v;
}

// ═════════════════════════════════════ FROST SNAIL ═════════════════════════════════════
// A soft snail carrying a shell of ice crystals; the head rears up and spits rime (muzzle ≈ 0.7).

function frostsnailModel(team) {
  return defineModel(`frostsnail:${team}`, (m) => {
    const pal = teamPalette(team);
    const skin = col(0xb9c9e0), skinDark = col(0x7d8fb0);
    const ice = mix(PAL.crystal, pal.light, 0.3);
    const gc = mix(pal.glow, PAL.white, 0.4);

    const foot = m.part('foot', { pivot: [0, 0.1, 0] });
    foot.paint.capsule(0.17, 0.62, skin, { at: [0, 0.14, -0.05], rot: [PI / 2, 0, 0], scale: [1.25, 1, 0.55], c2: skinDark, seg: 10, rings: 3 });
    foot.paint.torus(0.2, 0.03, pal.main, { at: [0, 0.16, 0.18], rot: [PI / 2, 0, 0], scale: [1.1, 0.6, 1], seg: 10, tube: 3 });

    const shell = m.part('shell', { pivot: [0, 0.25, -0.15], parent: 'foot', ownGlow: true });
    shell.paint.sphere(0.27, skinDark, { at: [0, 0.42, -0.15], scale: [0.85, 1, 1], seg: 10, rings: 7 });
    shell.paint.torus(0.2, 0.06, mix(ice, skinDark, 0.4), { at: [0.0, 0.44, -0.15], rot: [0, PI / 2, 0], seg: 12, tube: 4 });
    shell.glow.crystal(0.1, 0.42, ice, { at: [0, 0.62, -0.18], sides: 5, c2: pal.glow, facet: 0.5 });
    shell.glow.crystal(0.07, 0.3, ice, { at: [0.15, 0.56, -0.1], rot: [0.2, 0, -0.5], sides: 4, facet: 0.5 });
    shell.glow.crystal(0.07, 0.28, ice, { at: [-0.15, 0.55, -0.2], rot: [-0.2, 0, 0.55], sides: 4, facet: 0.5 });
    shell.glow.crystal(0.06, 0.24, gc, { at: [0.02, 0.5, -0.38], rot: [-0.9, 0, 0], sides: 4 });

    const head = m.part('head', { pivot: [0, 0.2, 0.28], parent: 'foot' });
    head.paint.limb([0, 0.18, 0.28], [0, 0.55, 0.38], 0.12, 0.1, skin, { seg: 8, rings: 2 });
    head.paint.sphere(0.13, skin, { at: [0, 0.6, 0.4], seg: 10, rings: 6 });
    head.paint.mirrorX((b) => {
      b.limb([0.06, 0.68, 0.38], [0.11, 0.86, 0.36], 0.018, 0.014, skinDark, { seg: 5, rings: 1 });
      b.sphere(0.04, PAL.white, { at: [0.11, 0.88, 0.36], seg: 6, rings: 4 });
      b.sphere(0.022, PAL.eye, { at: [0.115, 0.885, 0.395], seg: 5, rings: 3 });
    });
    head.paint.torus(0.045, 0.014, skinDark, { at: [0, 0.58, 0.525], seg: 8, tube: 3 });
    head.glow.sphere(0.03, gc, { at: [0, 0.58, 0.53], seg: 6, rings: 3 });
  });
}

function frostsnailView(team) {
  const v = troopView('frostsnail', team, frostsnailModel(team), { stride: 0.7 });
  const { foot, shell, head } = v.parts;
  const g = v.glow.shell;
  v.animate = (dt, s, a) => {
    const t = s.time + a.seed, mv = a.move;
    const p = swing(s.attackT, s.windup, s.hitSpeed);
    const wave = Math.sin(a.walk);
    foot.scale.set(1, 1, 1 + 0.08 * wave * mv);
    shell.rotation.x = 0.05 * wave * mv;
    shell.position.y = shell.userData.home.y + Math.sin(t * 1.4) * 0.01;
    head.rotation.x = pose(p, -0.55, Math.sin(t * 1.7) * 0.05, 0.4);
    head.position.z = head.userData.home.z + pose(p, -0.04, 0, 0.08);
    if (g) g.color.setScalar(0.9 + 0.1 * Math.sin(t * 2.3) + 1.6 * buildUp(s.attackT, s.windup));
  };
  return v;
}

// ═════════════════════════════════════ SUNLENS ═════════════════════════════════════
// A brass tripod lantern creature with one great lens eye (muzzle ≈ 1.3). The lens burns brighter
// the longer its beam stays on a target.

function sunlensModel(team) {
  return defineModel(`sunlens:${team}`, (m) => {
    const pal = teamPalette(team);
    const legs = m.part('legs', { pivot: [0, 0.9, 0] });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + PI / 3;
      const x = Math.sin(a), z = Math.cos(a);
      legs.metal.limb([x * 0.12, 0.92, z * 0.12], [x * 0.38, 0.45, z * 0.38], 0.045, 0.04, PAL.brass, { seg: 6, rings: 1 });
      legs.metal.limb([x * 0.38, 0.45, z * 0.38], [x * 0.46, 0.04, z * 0.46], 0.04, 0.03, PAL.iron, { seg: 6, rings: 1 });
      legs.metal.sphere(0.055, PAL.copper, { at: [x * 0.38, 0.45, z * 0.38], seg: 6, rings: 4 });
      legs.metal.ball(0.07, 0.03, 0.09, PAL.ironDark, { at: [x * 0.47, 0.02, z * 0.47], rot: [0, a, 0], seg: 6, rings: 3 });
    }

    const head = m.part('head', { pivot: [0, 0.95, 0], ownGlow: true });
    const P = head.paint, M = head.metal, G = head.glow;
    M.cyl(0.24, 0.2, 0.42, PAL.brass, { at: [0, 1.25, -0.05], rot: [PI / 2 - 0.2, 0, 0], seg: 12 });
    M.cyl(0.28, 0.28, 0.06, PAL.gold, { at: [0, 1.31, 0.17], rot: [PI / 2 - 0.2, 0, 0], seg: 14 });
    M.sphere(0.12, PAL.ironDark, { at: [0, 0.98, 0], seg: 8, rings: 5 });
    M.cone(0.1, 0.2, PAL.brass, { at: [0, 1.48, -0.14], seg: 8 });
    M.sphere(0.04, PAL.gold, { at: [0, 1.62, -0.15], seg: 6, rings: 4 });
    // team cowl and pennant
    P.lathe([[0.27, 0], [0.3, 0.08], [0.26, 0.2], [0.14, 0.3], [0, 0.32]], pal.main,
      { at: [0, 1.2, -0.12], rot: [-0.25, 0, 0], seg: 12, c2: pal.dark });
    P.extrude([[0, 0], [0.22, -0.04], [0.14, -0.12], [0.22, -0.22], [0, -0.18]], 0.02, pal.main,
      { at: [0.0, 1.1, -0.3], rot: [0, PI / 2, 0] });
    P.mirrorX((b) => b.extrude([[0, 0], [0.16, 0.05], [0.14, -0.03]], 0.02, pal.trim, { at: [0.25, 1.24, -0.05], rot: [0, -0.3, 0] }));
    // the lens (bright disc) and its inner iris
    G.cyl(0.21, 0.21, 0.03, col(0xfff1b0), { at: [0, 1.33, 0.2], rot: [PI / 2 - 0.2, 0, 0], seg: 16 });
    G.cyl(0.09, 0.09, 0.035, mix(pal.glow, PAL.white, 0.5), { at: [0, 1.335, 0.215], rot: [PI / 2 - 0.2, 0, 0], seg: 12 });
  });
}

function sunlensView(team) {
  const v = troopView('sunlens', team, sunlensModel(team), { stride: 0.9 });
  const { legs, head } = v.parts;
  const g = v.glow.head;
  const hy = head.userData.home.y;
  v.animate = (dt, s, a) => {
    const t = s.time + a.seed, mv = a.move, sn = Math.sin(a.walk);
    legs.rotation.y = sn * 0.35 * mv;
    legs.rotation.z = Math.cos(a.walk) * 0.06 * mv;
    head.position.y = hy + Math.abs(sn) * 0.05 * mv + Math.sin(t * 1.8) * 0.012;
    head.rotation.z = sn * 0.06 * mv;
    const heat = s.beam ? Math.min(1, s.rampT / 4) : 0;
    const brace = s.attackT >= 0 || s.beam ? 1 : 0;
    head.rotation.x = -0.05 * brace + Math.sin(t * 30) * 0.008 * heat;
    if (g) g.color.setScalar(0.9 + 0.15 * Math.sin(t * 2.5) + 1.6 * buildUp(s.attackT, s.windup) + (s.beam ? 1.2 + 2.4 * heat : 0));
  };
  return v;
}

// ═════════════════════════════════════ BLOOM TENDER ═════════════════════════════════════
// A gliding flower spirit: leaf skirt, a face framed by big petals in team colours, a glowing
// pollen heart that pulses with her healing.

function bloomtenderModel(team) {
  return defineModel(`bloomtender:${team}`, (m) => {
    const pal = teamPalette(team);
    const petal = mix(pal.light, col(0xffc6dc), 0.45);
    const petalDeep = mix(pal.main, col(0xe2648e), 0.4);
    const skin = col(0xf6e2c6);

    const skirt = m.part('skirt', { pivot: [0, 0.5, 0] });
    skirt.paint.ring(7, (b) => b.extrude(LEAF, 0.02, PAL.leaf, { at: [0, 0.55, 0.02], rot: [PI / 2 - 0.5, -PI / 2, 0], scale: 1.6, c2: PAL.mossDark }));
    skirt.paint.ring(6, (b) => b.extrude(LEAF, 0.02, PAL.moss, { at: [0, 0.4, 0.04], rot: [PI / 2 - 0.25, -PI / 2, 0], scale: 1.5 }), 0.45);
    skirt.paint.cone(0.18, 0.5, PAL.mossDark, { at: [0, 0.18, 0], rot: [PI, 0, 0], seg: 8 });

    const torso = m.part('torso', { pivot: [0, 0.6, 0], ownGlow: true });
    const P = torso.paint, G = torso.glow;
    P.capsule(0.13, 0.22, PAL.leaf, { at: [0, 0.78, 0], scale: [1, 1, 0.85], c2: PAL.moss, seg: 10, rings: 3 });
    P.torus(0.13, 0.03, pal.main, { at: [0, 0.68, 0], seg: 10, tube: 3 });
    P.sphere(0.2, skin, { at: [0, 1.15, 0.02], seg: 12, rings: 8 });
    P.mirrorX((b) => {
      b.sphere(0.035, PAL.eye, { at: [0.075, 1.17, 0.19], seg: 6, rings: 4 });
      b.sphere(0.03, col(0xf59aa8), { at: [0.12, 1.09, 0.16], seg: 6, rings: 3 });
      b.limb([0.12, 0.92, 0], [0.24, 0.78, 0.05], 0.035, 0.03, PAL.leaf, { seg: 5, rings: 1 });
    });
    P.ring(8, (b) => b.ball(0.13, 0.05, 0.2, petal, { at: [0, 1.15, 0.24], rot: [0.0, 0, 0], c2: petalDeep, seg: 8, rings: 4 }), 0);
    P.ring(8, (b) => b.ball(0.1, 0.04, 0.17, petalDeep, { at: [0, 1.15, 0.17], seg: 6, rings: 3 }), 0.39);
    G.sphere(0.07, mix(col(0xfff3a0), pal.glow, 0.25), { at: [0, 0.82, 0.12], seg: 8, rings: 5 });
    G.sphere(0.035, col(0xfff3a0), { at: [0, 1.36, 0.0], seg: 6, rings: 4 });

    const arm = m.part('armR', { pivot: [-0.12, 0.92, 0], parent: 'torso' });
    arm.paint.limb([-0.12, 0.92, 0], [-0.26, 0.8, 0.12], 0.035, 0.03, PAL.leaf, { seg: 5, rings: 1 });
    arm.paint.group({ at: [-0.28, 0.79, 0.16], rot: [0, 0.6, -0.5] }, (g) => g.extrude(LEAF, 0.015, petal, { rot: [-PI / 2, 0, 0], scale: 0.7 }));
  });
}

function bloomtenderView(team) {
  const v = troopView('bloomtender', team, bloomtenderModel(team), { stride: 1 });
  const { skirt, torso, armR } = v.parts;
  const g = v.glow.torso;
  const ty = torso.userData.home.y;
  v.animate = (dt, s, a) => {
    const t = s.time + a.seed, mv = a.move;
    const p = swing(s.attackT, s.windup, s.hitSpeed);
    const bob = Math.sin(t * 2.2) * 0.04;
    v.body.position.y = 0.04 + bob;
    skirt.rotation.y = t * 0.6;
    skirt.rotation.x = 0.12 * mv;
    skirt.scale.set(1 + Math.sin(t * 2.2) * 0.04, 1, 1 + Math.sin(t * 2.2) * 0.04);
    torso.rotation.x = 0.1 * mv + pose(p, -0.12, 0, 0.15);
    torso.position.y = ty + bob * 0.3;
    torso.rotation.z = Math.sin(t * 1.3) * 0.05;
    armR.rotation.x = pose(p, -2.2, Math.sin(t * 2) * 0.1, 0.5);
    if (g) g.color.setScalar(1 + 0.6 * Math.max(0, Math.sin(t * 4.2)));
  };
  return v;
}

// ═════════════════════════════════════ GEARWRIGHT ═════════════════════════════════════
// A tinkerer in team overalls with goggles, a spinning gear backpack and a throwing wrench
// (muzzle ≈ 1.1).

function gearwrightModel(team) {
  return defineModel(`gearwright:${team}`, (m) => {
    const pal = teamPalette(team);
    const skin = col(0xd99c72);
    const hair = col(0x6a3b2a);

    const leg = m.part('legL', { pivot: [0.1, 0.42, 0] });
    leg.paint.limb([0.1, 0.42, 0], [0.11, 0.12, 0], 0.075, 0.065, pal.dark, { seg: 7, rings: 1 });
    leg.paint.ball(0.08, 0.06, 0.12, PAL.woodDark, { at: [0.11, 0.06, 0.03], seg: 8, rings: 4 });
    m.part('legR', { pivot: [-0.1, 0.42, 0], copy: 'legL' });

    const torso = m.part('torso', { pivot: [0, 0.42, 0] });
    const P = torso.paint, M = torso.metal, G = torso.glow;
    P.capsule(0.19, 0.2, pal.main, { at: [0, 0.68, 0], scale: [1, 1, 0.85], c2: pal.dark, seg: 10, rings: 3 });
    P.box(0.22, 0.18, 0.06, mix(pal.main, PAL.white, 0.2), { at: [0, 0.74, 0.15], bevel: 0.03 });
    P.mirrorX((b) => b.limb([0.08, 0.86, 0.13], [0.09, 0.62, 0.17], 0.018, 0.018, PAL.leather, { seg: 5, rings: 1 }));
    P.torus(0.18, 0.035, PAL.leather, { at: [0, 0.52, 0], seg: 10, tube: 3 });
    P.sphere(0.2, skin, { at: [0, 1.08, 0.02], seg: 12, rings: 7 });
    P.sphere(0.05, shade(skin, 0.9), { at: [0, 1.04, 0.21], seg: 6, rings: 4 });
    P.lathe([[0.21, 1.1], [0.2, 1.17], [0.14, 1.24], [0, 1.27]], hair, { seg: 12 });
    P.torus(0.2, 0.035, pal.trim, { at: [0, 1.13, 0.01], seg: 12, tube: 3 });
    P.tube([[0.0, 1.13, -0.2], [0.06, 1.05, -0.28], [0.08, 0.95, -0.3]], [0.035, 0.03, 0.015], pal.trim, { sides: 5 });
    P.limb([0.17, 0.86, 0], [0.24, 0.62, 0.05], 0.05, 0.045, pal.main, { seg: 6, rings: 1 });
    P.sphere(0.055, skin, { at: [0.25, 0.58, 0.06], seg: 6, rings: 4 });
    M.mirrorX((b) => b.torus(0.06, 0.02, PAL.brass, { at: [0.075, 1.12, 0.19], rot: [PI / 2, 0, 0], seg: 8, tube: 3 }));
    M.box(0.32, 0.36, 0.14, PAL.iron, { at: [0, 0.78, -0.24], bevel: 0.04 });
    M.cyl(0.03, 0.03, 0.2, PAL.copper, { at: [0.12, 1.04, -0.26], seg: 6 });
    G.mirrorX((b) => b.cyl(0.045, 0.045, 0.02, mix(pal.glow, PAL.white, 0.3), { at: [0.075, 1.12, 0.2], rot: [PI / 2, 0, 0], seg: 10 }));
    G.sphere(0.035, mix(pal.glow, PAL.white, 0.3), { at: [0.12, 1.16, -0.26], seg: 6, rings: 4 });

    const gear = m.part('gear', { pivot: [0, 0.86, -0.36], parent: 'torso' });
    gear.metal.torus(0.22, 0.05, PAL.brass, { at: [0, 0.86, -0.36], rot: [PI / 2, 0, 0], seg: 16, tube: 4 });
    gear.metal.group({ at: [0, 0.86, -0.36], rot: [PI / 2, 0, 0] }, (g) => {
      g.ring(10, (b) => b.box(0.07, 0.05, 0.08, PAL.brass, { at: [0, 0, 0.27], bevel: 0.01 }));
      g.cyl(0.07, 0.07, 0.06, PAL.copper, { seg: 8 });
      g.ring(3, (b) => b.box(0.03, 0.03, 0.2, PAL.brass, { at: [0, 0, 0.12], bevel: 0 }));
    });

    const arm = m.part('armR', { pivot: [-0.17, 0.86, 0], parent: 'torso' });
    arm.paint.limb([-0.17, 0.86, 0], [-0.24, 0.64, 0.08], 0.05, 0.045, pal.main, { seg: 6, rings: 1 });
    arm.paint.sphere(0.055, skin, { at: [-0.25, 0.6, 0.1], seg: 6, rings: 4 });
    arm.metal.limb([-0.25, 0.56, 0.1], [-0.25, 0.86, 0.28], 0.025, 0.025, PAL.steel, { seg: 6, rings: 1 });
    arm.metal.group({ at: [-0.25, 0.9, 0.31], rot: [0.9, 0, 0] }, (g) => {
      g.torus(0.06, 0.022, PAL.steel, { arc: 4.6, rot: [PI / 2, 0, 0.8], seg: 10, tube: 3 });
    });
  });
}

function gearwrightView(team) {
  const v = troopView('gearwright', team, gearwrightModel(team), { stride: 0.6 });
  const { legL, legR, torso, gear, armR } = v.parts;
  const ty = torso.userData.home.y;
  let spin = 0;
  v.animate = (dt, s, a) => {
    const t = s.time + a.seed, mv = a.move, sn = Math.sin(a.walk);
    walkLegs(a, legL, legR, 0.65, 0.05);
    const p = swing(s.attackT, s.windup, s.hitSpeed);
    torso.position.y = ty + Math.abs(Math.cos(a.walk)) * 0.03 * mv + Math.sin(t * 2.4) * 0.006;
    torso.rotation.z = sn * 0.05 * mv;
    torso.rotation.x = 0.06 * mv + pose(p, -0.12, 0, 0.18);
    armR.rotation.x = pose(p, -2.7, -sn * 0.25 * mv, 0.35);
    spin += dt * (1.5 + 4 * mv);
    if (spin > TAU) spin -= TAU;
    gear.rotation.z = spin;
  };
  return v;
}

// ═════════════════════════════════════ SHARDLYNX ═════════════════════════════════════
// A sleek crystal cat: team crystal spines along its back, glowing eyes, a crystal-tipped tail.
// State 'dash' is the pounce: stretched out, front paws reaching.

function shardlynxModel(team) {
  return defineModel(`shardlynx:${team}`, (m) => {
    const pal = teamPalette(team);
    const fur = mix(PAL.stoneLight, pal.light, 0.25), furDark = mix(PAL.stoneDark, pal.dark, 0.3);
    const crys = mix(pal.glow, PAL.white, 0.3);

    const legsB = m.part('legsB', { pivot: [0, 0.42, -0.25] });
    legsB.paint.mirrorX((b) => {
      b.limb([0.13, 0.45, -0.28], [0.15, 0.2, -0.36], 0.075, 0.05, fur, { seg: 6, rings: 1 });
      b.limb([0.15, 0.2, -0.36], [0.15, 0.03, -0.3], 0.045, 0.04, furDark, { seg: 6, rings: 1 });
      b.ball(0.05, 0.03, 0.07, furDark, { at: [0.15, 0.025, -0.27], seg: 6, rings: 3 });
    });
    const legsF = m.part('legsF', { pivot: [0, 0.42, 0.22] });
    legsF.paint.mirrorX((b) => {
      b.limb([0.12, 0.42, 0.24], [0.13, 0.03, 0.28], 0.06, 0.04, fur, { seg: 6, rings: 1 });
      b.ball(0.055, 0.03, 0.075, furDark, { at: [0.13, 0.025, 0.31], seg: 6, rings: 3 });
    });

    const body = m.part('body', { pivot: [0, 0.45, 0] });
    const P = body.paint, G = body.glow;
    P.capsule(0.17, 0.45, fur, { at: [0, 0.48, -0.02], rot: [PI / 2, 0, 0], scale: [1, 1, 0.95], c2: furDark, seg: 10, rings: 3 });
    P.torus(0.16, 0.035, pal.main, { at: [0, 0.55, 0.22], rot: [PI / 2 - 0.3, 0, 0], seg: 10, tube: 3 });
    P.tube([[0, 0.5, -0.3], [0, 0.62, -0.5], [0, 0.82, -0.58], [0, 0.94, -0.52]], [0.05, 0.045, 0.035, 0.025], fur, { sides: 6 });
    // head
    P.sphere(0.17, fur, { at: [0, 0.72, 0.36], scale: [1.05, 0.92, 1], seg: 10, rings: 7 });
    P.ball(0.08, 0.06, 0.07, mix(fur, PAL.white, 0.4), { at: [0, 0.66, 0.5], seg: 8, rings: 4 });
    P.sphere(0.02, PAL.black, { at: [0, 0.69, 0.565], seg: 5, rings: 3 });
    P.mirrorX((b) => b.cone(0.07, 0.17, furDark, { at: [0.1, 0.89, 0.34], rot: [-0.2, 0, -0.35], seg: 4 }));
    G.mirrorX((b) => b.ball(0.035, 0.03, 0.02, crys, { at: [0.07, 0.75, 0.5], rot: [0, 0, 0.3], seg: 6, rings: 4 }));
    // crystal spines and tail tip
    for (let i = 0; i < 4; i++) {
      G.crystal(0.045, 0.2 - i * 0.025, crys, { at: [0, 0.64 - i * 0.015, 0.18 - i * 0.15], rot: [-0.5, 0, (i % 2 ? 0.25 : -0.25)], sides: 4, c2: pal.main });
    }
    G.crystal(0.05, 0.18, crys, { at: [0, 0.97, -0.5], rot: [0.5, 0, 0], sides: 4, c2: pal.main });
  });
}

function shardlynxView(team) {
  const v = troopView('shardlynx', team, shardlynxModel(team), { stride: 0.8 });
  const { legsF, legsB, body } = v.parts;
  const by = body.userData.home.y;
  v.animate = (dt, s, a) => {
    const t = s.time + a.seed, mv = a.move, sn = Math.sin(a.walk);
    const p = swing(s.attackT, s.windup, s.hitSpeed);
    if (s.state === 'dash') {
      // pounce: stretched leap, front paws reaching forward
      body.rotation.x = -0.25;
      legsF.rotation.x = -1.1;
      legsB.rotation.x = 0.9;
      body.position.y = by + 0.05;
      return;
    }
    legsF.rotation.x = sn * 0.55 * mv + pose(p, 0.3, 0, -1.3);
    legsB.rotation.x = -sn * 0.55 * mv;
    body.position.y = by + Math.abs(Math.cos(a.walk)) * 0.04 * mv + Math.sin(t * 2) * 0.008 + pose(p, -0.05, 0, 0.04);
    body.rotation.x = Math.cos(a.walk) * 0.06 * mv + pose(p, 0.18, 0, -0.22);
    body.rotation.z = Math.sin(t * 1.1) * 0.02;
  };
  return v;
}

// ═════════════════════════════════════ SKYFALL TITAN ═════════════════════════════════════
// A basalt-and-crystal giant: crystal pauldrons, a crown of shards, glowing eyes and a huge
// crystal-studded club that sweeps through crowds.

function titanModel(team) {
  return defineModel(`titan:${team}`, (m) => {
    const pal = teamPalette(team);
    const basalt = col(0x4a4656), basaltLight = col(0x6d6878), basaltDark = col(0x2c2a36);
    const crys = mix(pal.glow, PAL.white, 0.25);

    const legL = m.part('legL', { pivot: [0.42, 0.85, 0] });
    legL.paint.limb([0.42, 0.85, 0], [0.46, 0.3, 0.02], 0.27, 0.24, basalt, { seg: 8, rings: 1 });
    legL.paint.rock(0.3, basaltDark, { at: [0.47, 0.17, 0.08], scale: [1, 0.55, 1.3], detail: 0, seed: 3 });
    const legR = m.part('legR', { pivot: [-0.42, 0.85, 0] });
    legR.paint.limb([-0.42, 0.85, 0], [-0.46, 0.3, 0.02], 0.27, 0.24, basalt, { seg: 8, rings: 1 });
    legR.paint.rock(0.3, basaltDark, { at: [-0.47, 0.17, 0.08], scale: [1, 0.55, 1.3], detail: 0, seed: 5 });

    const torso = m.part('torso', { pivot: [0, 0.85, 0], ownGlow: true });
    const P = torso.paint, G = torso.glow;
    P.rock(0.55, basaltDark, { at: [0, 1.05, 0], scale: [1.2, 0.6, 0.95], detail: 1, seed: 7 });
    P.rock(0.85, basalt, { at: [0, 1.85, 0], scale: [1.15, 0.9, 0.85], detail: 1, jitter: 0.08, seed: 9 });
    P.rock(0.32, basaltLight, { at: [0, 2.62, 0.25], scale: [1.1, 0.95, 1], detail: 1, seed: 11 });
    P.torus(0.62, 0.08, pal.main, { at: [0, 1.15, 0], scale: [1.05, 1, 0.85], seg: 12, tube: 4 });
    P.extrude([[-0.22, 0], [0.22, 0], [0.16, -0.5], [-0.16, -0.5]], 0.05, pal.main, { at: [0, 1.12, 0.55], rot: [0.1, 0, 0], c2: pal.dark });
    P.extrude([[-0.08, 0], [0.08, 0], [0, -0.14]], 0.03, pal.trim, { at: [0, 0.98, 0.6], rot: [0.1, 0, 0] });
    P.mirrorX((b) => b.rock(0.36, basaltLight, { at: [0.88, 2.35, 0], seed: 13 }));
    G.mirrorX((b) => {
      b.crystal(0.13, 0.55, crys, { at: [0.95, 2.62, -0.05], rot: [0, 0, -0.45], sides: 5, c2: pal.main });
      b.crystal(0.09, 0.36, crys, { at: [0.8, 2.6, -0.2], rot: [-0.4, 0, -0.2], sides: 4, c2: pal.main });
      b.ball(0.06, 0.035, 0.03, crys, { at: [0.11, 2.66, 0.55], seg: 6, rings: 4 });
    });
    G.crystal(0.1, 0.42, crys, { at: [0, 2.95, 0.15], sides: 5, c2: pal.main });
    G.crystal(0.07, 0.3, crys, { at: [0.16, 2.88, 0.1], rot: [0, 0, -0.4], sides: 4 });
    G.crystal(0.07, 0.3, crys, { at: [-0.16, 2.88, 0.1], rot: [0, 0, 0.4], sides: 4 });
    G.crystal(0.16, 0.5, crys, { at: [0, 1.85, 0.68], rot: [PI / 2, 0, 0], sides: 6, c2: pal.main });

    const armL = m.part('armL', { pivot: [1.0, 2.25, 0], parent: 'torso' });
    armL.paint.limb([1.0, 2.25, 0], [1.14, 1.6, 0.05], 0.25, 0.28, basalt, { seg: 8, rings: 1 });
    armL.paint.limb([1.14, 1.6, 0.05], [1.12, 1.0, 0.18], 0.3, 0.34, basaltLight, { seg: 8, rings: 1 });
    armL.paint.rock(0.36, basaltDark, { at: [1.11, 0.82, 0.22], detail: 0, seed: 17 });

    const armR = m.part('armR', { pivot: [-1.0, 2.25, 0], parent: 'torso' });
    armR.paint.limb([-1.0, 2.25, 0], [-1.14, 1.6, 0.05], 0.25, 0.28, basalt, { seg: 8, rings: 1 });
    armR.paint.limb([-1.14, 1.6, 0.05], [-1.12, 1.05, 0.2], 0.3, 0.32, basaltLight, { seg: 8, rings: 1 });
    armR.paint.rock(0.3, basaltDark, { at: [-1.12, 0.9, 0.25], detail: 0, seed: 19 });
    // the club: a stone haft and a crystal-studded head, held forward-down
    armR.paint.limb([-1.12, 0.92, 0.25], [-1.12, 0.62, 1.1], 0.09, 0.12, PAL.woodDark, { seg: 7, rings: 1 });
    armR.paint.rock(0.38, basalt, { at: [-1.12, 0.52, 1.35], scale: [1, 1, 1.25], detail: 1, seed: 23 });
    armR.glow.group({ at: [-1.12, 0.52, 1.35] }, (g) => {
      g.crystal(0.08, 0.36, crys, { at: [0.25, 0.15, 0.1], rot: [0, 0, -1.1], sides: 4 });
      g.crystal(0.08, 0.36, crys, { at: [-0.25, 0.18, 0.0], rot: [0, 0, 1.1], sides: 4 });
      g.crystal(0.09, 0.4, crys, { at: [0, 0.3, 0.2], rot: [0.4, 0, 0], sides: 4 });
      g.crystal(0.07, 0.3, crys, { at: [0, 0.0, 0.45], rot: [1.4, 0, 0], sides: 4 });
    });
  });
}

function titanView(team) {
  const v = troopView('titan', team, titanModel(team), { stride: 1.6, hopHeight: 0.8 });
  const { legL, legR, torso, armL, armR } = v.parts;
  const g = v.glow.torso;
  const ty = torso.userData.home.y;
  v.animate = (dt, s, a) => {
    const t = s.time + a.seed, mv = a.move, sn = Math.sin(a.walk);
    walkLegs(a, legL, legR, 0.34, 0.14);
    const p = swing(s.attackT, s.windup, s.hitSpeed);
    torso.rotation.z = sn * 0.09 * mv;
    torso.rotation.y = sn * 0.06 * mv + pose(p, 0.45, 0, -0.35);
    torso.rotation.x = pose(p, -0.12, 0.05 * mv, 0.28);
    torso.position.y = ty + (Math.abs(Math.cos(a.walk)) * 0.08 - 0.04) * mv + Math.sin(t * 1.3) * 0.012;
    // a sweeping slam: the club winds up high and to the side, then smashes across the front
    armR.rotation.x = pose(p, -2.3, sn * 0.25 * mv, 0.35);
    armR.rotation.z = pose(p, 0.5, 0, -0.25);
    armL.rotation.x = pose(p, 0.3, -sn * 0.25 * mv, -0.4);
    if (g) g.color.setScalar(0.95 + 0.12 * Math.sin(t * 1.7) + 1.4 * buildUp(s.attackT, s.windup) + 2 * impact(s.attackT, s.windup, 0.3));
  };
  return v;
}

// ═════════════════════════════════════ SLINGTOAD ═════════════════════════════════════
// A chunky toad with a wooden sling arm on its back that lobs mud bombs (muzzle ≈ 0.8).

function slingtoadModel(team) {
  return defineModel(`slingtoad:${team}`, (m) => {
    const pal = teamPalette(team);
    const skin = col(0x6f9a46), skinDark = col(0x46682c), belly = col(0xe6d39a);

    const body = m.part('body', { pivot: [0, 0.1, 0] });
    const P = body.paint;
    P.ball(0.36, 0.26, 0.36, skin, { at: [0, 0.32, -0.02], c2: skinDark, seg: 12, rings: 7 });
    P.ball(0.27, 0.16, 0.2, belly, { at: [0, 0.24, 0.16], seg: 10, rings: 5 });
    P.mirrorX((b) => {
      b.sphere(0.11, skin, { at: [0.15, 0.56, 0.18], seg: 10, rings: 6 });
      b.sphere(0.08, PAL.white, { at: [0.16, 0.6, 0.24], seg: 8, rings: 5 });
      b.sphere(0.045, PAL.eye, { at: [0.17, 0.61, 0.305], seg: 6, rings: 4 });
      b.ball(0.12, 0.07, 0.17, skinDark, { at: [0.28, 0.1, -0.12], seg: 8, rings: 4 });
      b.limb([0.22, 0.24, 0.2], [0.26, 0.04, 0.28], 0.045, 0.04, skin, { seg: 6, rings: 1 });
      b.ball(0.06, 0.025, 0.07, skinDark, { at: [0.27, 0.02, 0.31], seg: 6, rings: 3 });
      b.sphere(0.045, pal.main, { at: [0.25, 0.4, -0.18], seg: 6, rings: 3 });
    });
    P.torus(0.14, 0.012, skinDark, { at: [0, 0.42, 0.27], rot: [PI / 2 + 0.3, 0, 0], arc: PI, seg: 10, tube: 3 });
    // team saddle + strap
    P.ball(0.26, 0.06, 0.22, pal.main, { at: [0, 0.55, -0.1], c2: pal.dark, seg: 10, rings: 4 });
    P.torus(0.33, 0.025, PAL.leather, { at: [0, 0.38, -0.05], rot: [0, 0, PI / 2], scale: [1, 0.9, 1], seg: 12, tube: 3 });
    body.metal.cyl(0.06, 0.07, 0.12, PAL.brass, { at: [0, 0.62, -0.1], seg: 8 });

    const sling = m.part('sling', { pivot: [0, 0.66, -0.1], parent: 'body' });
    sling.paint.limb([0, 0.66, -0.1], [0, 0.95, -0.35], 0.035, 0.03, PAL.wood, { seg: 6, rings: 1 });
    sling.paint.ball(0.1, 0.04, 0.1, PAL.leather, { at: [0, 0.98, -0.38], seg: 8, rings: 3 });
    sling.paint.sphere(0.085, col(0x6b4a2c), { at: [0, 1.04, -0.38], seg: 8, rings: 5 });
  });
}

function slingtoadView(team) {
  const v = troopView('slingtoad', team, slingtoadModel(team), { stride: 0.9 });
  const { body, sling } = v.parts;
  const by = body.userData.home.y;
  v.animate = (dt, s, a) => {
    const t = s.time + a.seed, mv = a.move;
    const hop = Math.abs(Math.sin(a.walk));
    const land = 1 - hop, q = land * land * land * mv;
    body.position.y = by + hop * 0.12 * mv;
    body.scale.set(1 + 0.08 * q, 1 - 0.12 * q + Math.sin(t * 3.5) * 0.015, 1 + 0.08 * q);
    body.rotation.x = -0.15 * hop * mv;
    const p = swing(s.attackT, s.windup, s.hitSpeed);
    // the sling cocks back over the tail, then whips forward to release at windup
    sling.rotation.x = pose(p, -0.7, 0, 2.3);
    sling.visible = true;
  };
  return v;
}

// ═════════════════════════════════════ DRILLWORM ═════════════════════════════════════
// A segmented burrowing worm reared up out of the ground, team bands on its body and a spinning
// steel drill for a head. It rises out of the earth when deployed.

function drillwormModel(team) {
  return defineModel(`drillworm:${team}`, (m) => {
    const pal = teamPalette(team);
    const flesh = col(0xc98a74), fleshDark = col(0x8e5a4c);

    const body = m.part('body', { pivot: [0, 0.0, 0] });
    const P = body.paint;
    const segs = [[0, 0.12, -0.18, 0.26], [0, 0.34, -0.12, 0.25], [0, 0.56, -0.04, 0.23], [0, 0.76, 0.04, 0.21], [0, 0.94, 0.1, 0.19]];
    for (let i = 0; i < segs.length; i++) {
      const [x, y, z, r] = segs[i];
      P.sphere(r, i % 2 ? flesh : fleshDark, { at: [x, y, z], seg: 10, rings: 6 });
      if (i % 2 === 0) P.torus(r * 0.98, 0.035, pal.main, { at: [x, y, z], rot: [0.3, 0, 0], seg: 12, tube: 3 });
    }
    P.ball(0.42, 0.06, 0.42, col(0x6a5238), { at: [0, 0.02, -0.15], seg: 10, rings: 3 });
    P.mirrorX((b) => {
      b.sphere(0.045, PAL.white, { at: [0.1, 1.02, 0.25], seg: 6, rings: 4 });
      b.sphere(0.025, PAL.eye, { at: [0.105, 1.025, 0.29], seg: 5, rings: 3 });
      b.rock(0.08, col(0x7a6044), { at: [0.3, 0.05, 0.05], seed: 4, detail: 0 });
    });
    body.metal.torus(0.18, 0.04, pal.trim, { at: [0, 1.05, 0.12], rot: [0.5, 0, 0], seg: 12, tube: 3 });

    const drill = m.part('drill', { pivot: [0, 1.08, 0.14], parent: 'body', ownGlow: true });
    drill.metal.group({ at: [0, 1.08, 0.14], rot: [0.5, 0, 0] }, (g) => {
      g.cone(0.17, 0.42, PAL.steel, { at: [0, 0.0, 0], seg: 10 });
      for (let i = 0; i < 3; i++) g.torus(0.13 - i * 0.04, 0.018, PAL.iron, { at: [0, 0.08 + i * 0.1, 0], rot: [0.2, i, 0], seg: 10, tube: 3 });
    });
    drill.glow.group({ at: [0, 1.08, 0.14], rot: [0.5, 0, 0] }, (g) => g.sphere(0.03, mix(pal.glow, PAL.white, 0.3), { at: [0, 0.42, 0], seg: 6, rings: 4 }));
  });
}

function drillwormView(team) {
  const v = troopView('drillworm', team, drillwormModel(team), { stride: 0.8, deploy: 'rise' });
  const { body, drill } = v.parts;
  const g = v.glow.drill;
  let spin = 0;
  v.animate = (dt, s, a) => {
    const t = s.time + a.seed, mv = a.move;
    const p = swing(s.attackT, s.windup, s.hitSpeed);
    body.rotation.z = Math.sin(a.walk) * 0.12 * mv + Math.sin(t * 1.6) * 0.04;
    body.rotation.x = pose(p, -0.3, 0.1 * mv, 0.45);
    body.scale.y = 1 + Math.sin(a.walk * 2) * 0.05 * mv;
    spin += dt * (8 + 30 * (s.attackT >= 0 ? 1 : 0) + 10 * mv);
    if (spin > TAU) spin -= TAU;
    drill.rotation.y = spin;
    if (g) g.color.setScalar(1 + 2 * impact(s.attackT, s.windup, 0.25));
  };
  return v;
}

registerUnit('sproutling', sproutlingView);
registerUnit('thunderhead', thunderheadView);
registerUnit('coilcrab', coilcrabView);
registerUnit('frostsnail', frostsnailView);
registerUnit('sunlens', sunlensView);
registerUnit('bloomtender', bloomtenderView);
registerUnit('gearwright', gearwrightView);
registerUnit('shardlynx', shardlynxView);
registerUnit('titan', titanView);
registerUnit('slingtoad', slingtoadView);
registerUnit('drillworm', drillwormView);

// ═════════════════════════════════════ SPELL ICONS ═════════════════════════════════════
// Static emblems for the spell cards, rendered once into card art by thumbs.js.

function icon(cardId, build) {
  registerIcon(cardId, (team) => staticGroup(defineModel(`icon:${cardId}:${team}`, (m) => build(m, teamPalette(team))),
    { cast: false, receive: false }));
}

icon('comet', (m) => {
  const b = m.part('body');
  const fire = col(0xff8a3d), core = col(0xffe2a0);
  b.paint.rock(0.42, PAL.rockDark, { at: [0, 0.45, 0], seed: 5 });
  b.glow.rock(0.3, col(0xff5a1e), { at: [0.05, 0.47, 0.18], scale: 0.9, seed: 6, detail: 0 });
  b.glow.group({ at: [0, 0.45, 0], rot: [0.9, 0, 0.5] }, (g) => {
    g.cone(0.42, 1.4, fire, { at: [0, -0.85, 0], rot: [PI, 0, 0], seg: 10 });
    g.cone(0.26, 1.0, core, { at: [0, -0.65, 0], rot: [PI, 0, 0], seg: 8 });
    g.cone(0.15, 0.7, col(0xff5a1e), { at: [0.3, -0.7, 0.1], rot: [PI, 0, 0.2], seg: 6 });
    g.cone(0.15, 0.7, col(0xff5a1e), { at: [-0.28, -0.75, -0.05], rot: [PI, 0, -0.2], seg: 6 });
  });
});

icon('shardstorm', (m) => {
  const b = m.part('body');
  const ice = col(0xbfefff), deep = col(0x5fb8ff);
  b.paint.sphere(0.32, col(0x9aa4bc), { at: [0, 1.25, 0], scale: [1.6, 0.6, 1], seg: 10, rings: 6 });
  b.paint.sphere(0.24, col(0xc6cede), { at: [0.35, 1.32, 0.05], seg: 8, rings: 5 });
  b.paint.sphere(0.22, col(0xc6cede), { at: [-0.38, 1.28, 0], seg: 8, rings: 5 });
  const spots = [[0, 0.55, 0.1, 0.12], [0.38, 0.75, 0, -0.2], [-0.36, 0.7, 0.05, 0.25], [0.18, 0.25, 0.2, -0.1], [-0.15, 0.3, -0.1, 0.15]];
  for (const [x, y, z, r] of spots) b.glow.crystal(0.08, 0.42, ice, { at: [x, y, z], rot: [PI + 0.2, 0, r], sides: 4, c2: deep });
});

icon('stasis', (m, pal) => {
  const b = m.part('body');
  const ice = col(0xd6f6ff), deep = col(0x6fc8ff);
  b.glow.torus(0.62, 0.035, deep, { at: [0, 0.1, 0], seg: 24, tube: 4 });
  b.glow.crystal(0.22, 1.1, ice, { at: [0, 0.6, 0], sides: 6, c2: deep, facet: 0.5 });
  b.glow.crystal(0.13, 0.65, ice, { at: [0.3, 0.38, 0.05], rot: [0, 0, -0.45], sides: 5, c2: deep, facet: 0.5 });
  b.glow.crystal(0.13, 0.6, ice, { at: [-0.3, 0.36, 0], rot: [0, 0, 0.5], sides: 5, c2: deep, facet: 0.5 });
  b.glow.crystal(0.1, 0.45, ice, { at: [0.05, 0.3, 0.3], rot: [0.5, 0, 0], sides: 4, c2: deep });
  b.paint.lathe([[0.68, 0], [0.7, 0.05], [0.6, 0.1], [0, 0.1]], mix(PAL.stoneLight, pal.light, 0.3), { seg: 20 });
});

icon('jolt', (m) => {
  const b = m.part('body');
  const y = col(0xfff27a), w = col(0xffffff);
  b.glow.group({ at: [0, 0.6, 0.05], scale: 1.4 }, (g) => g.extrude(BOLT, 0.1, y));
  b.glow.group({ at: [0, 0.6, 0.11], scale: 0.9 }, (g) => g.extrude(BOLT, 0.05, w));
  b.glow.ring(8, (g) => g.box(0.05, 0.05, 0.25, y, { at: [0, 0.6, 0.65], bevel: 0 }));
});

icon('overclock', (m, pal) => {
  const b = m.part('body');
  const gold = col(0xffc94a);
  b.metal.group({ at: [0, 0.6, 0], rot: [PI / 2, 0, 0] }, (g) => {
    g.torus(0.42, 0.1, PAL.brass, { seg: 20, tube: 5 });
    g.ring(12, (r) => r.box(0.13, 0.12, 0.14, PAL.brass, { at: [0, 0, 0.55], bevel: 0.02 }));
    g.cyl(0.15, 0.15, 0.14, PAL.copper, { seg: 10 });
  });
  b.glow.group({ at: [0, 0.6, 0.12] }, (g) => {
    for (let i = 0; i < 2; i++) {
      g.extrude([[0, 0.18], [0.16, 0], [0, -0.18], [-0.06, -0.18], [0.1, 0], [-0.06, 0.18]], 0.05, i ? gold : mix(gold, pal.glow, 0.4),
        { at: [-0.12 + i * 0.2, 0, 0] });
    }
  });
});

icon('blight', (m) => {
  const b = m.part('body');
  const green = col(0x8ee04a), violet = col(0x8a4ab0), dark = col(0x4a2a5a);
  b.paint.cyl(0.1, 0.14, 0.4, col(0xe8dcc0), { at: [0, 0.2, 0], seg: 8 });
  b.paint.sphere(0.42, violet, { at: [0, 0.45, 0], scale: [1, 0.5, 1], c2: dark, seg: 12, rings: 6 });
  b.glow.ring(6, (g) => g.sphere(0.05, green, { at: [0, 0.6, 0.3], seg: 6, rings: 4 }));
  b.glow.sphere(0.2, green, { at: [0.35, 0.95, 0.05], seg: 8, rings: 5 });
  b.glow.sphere(0.15, mix(green, violet, 0.4), { at: [-0.3, 1.05, 0.1], seg: 8, rings: 5 });
  b.glow.sphere(0.1, green, { at: [0.05, 1.25, -0.05], seg: 6, rings: 4 });
});

icon('maelstrom', (m) => {
  const b = m.part('body');
  const teal = col(0x7fe8d8), grey = col(0xb8c2c8);
  for (let i = 0; i < 6; i++) {
    const r = 0.12 + i * 0.1, y = 0.1 + i * 0.22;
    (i % 2 ? b.paint : b.glow).torus(r, 0.045 + i * 0.006, i % 2 ? grey : teal, { at: [Math.sin(i * 1.3) * 0.06, y, 0], rot: [0.15, 0, 0.1 * (i % 2 ? 1 : -1)], seg: 16, tube: 4 });
  }
  b.paint.rock(0.08, PAL.rock, { at: [0.6, 1.0, 0.1], seed: 3 });
  b.paint.rock(0.06, PAL.rock, { at: [-0.55, 0.7, 0.05], seed: 4 });
});

icon('rockslide', (m) => {
  const b = m.part('body');
  b.paint.rock(0.5, col(0x9a8a74), { at: [0.15, 0.5, 0], detail: 1, seed: 8 });
  b.paint.rock(0.2, col(0x6c5f50), { at: [-0.45, 0.2, 0.2], seed: 9 });
  b.paint.sphere(0.22, col(0xc9b28a), { at: [-0.5, 0.35, -0.2], seg: 8, rings: 5 });
  b.paint.sphere(0.16, col(0xd9c8a4), { at: [-0.7, 0.25, 0.05], seg: 8, rings: 5 });
  b.glow.group({ at: [-0.3, 0.5, 0.4] }, (g) => {
    for (let i = 0; i < 3; i++) g.box(0.5 - i * 0.1, 0.03, 0.03, col(0xfff1c8), { at: [-0.2, -0.15 + i * 0.15, 0], bevel: 0 });
  });
});

icon('seedpod', (m, pal) => {
  const b = m.part('body');
  const pod = col(0x6fbf4a), podDark = col(0x3f7a2a);
  b.paint.ball(0.38, 0.5, 0.38, pod, { at: [0, 0.5, 0], c2: podDark, seg: 12, rings: 8 });
  b.paint.ring(5, (g) => g.box(0.03, 0.8, 0.04, podDark, { at: [0, 0.5, 0.36], bevel: 0 }));
  b.paint.group({ at: [0.05, 1.0, 0] }, (g) => {
    g.extrude(LEAF, 0.02, PAL.leaf, { rot: [-PI / 2, 0, 0.6], scale: 1.6 });
    g.extrude(LEAF, 0.02, PAL.moss, { rot: [-PI / 2, PI, 0.5], scale: 1.4 });
  });
  b.glow.sphere(0.1, mix(col(0xfff3a0), pal.glow, 0.3), { at: [0, 0.55, 0.33], seg: 8, rings: 5 });
});

icon('skyfork', (m) => {
  const b = m.part('body');
  const violet = col(0xc9b6ff), w = col(0xffffff);
  b.paint.sphere(0.34, col(0x6a6e88), { at: [0, 1.25, 0], scale: [1.7, 0.6, 1], seg: 12, rings: 6 });
  b.paint.sphere(0.26, col(0x8a8ea8), { at: [0.38, 1.32, 0.05], seg: 8, rings: 5 });
  b.paint.sphere(0.24, col(0x8a8ea8), { at: [-0.4, 1.3, 0], seg: 8, rings: 5 });
  b.glow.group({ at: [0, 0.6, 0.1], scale: 1.1 }, (g) => g.extrude(BOLT, 0.08, violet));
  b.glow.group({ at: [0.42, 0.55, 0.05], scale: 0.7, rot: [0, 0, 0.25] }, (g) => g.extrude(BOLT, 0.06, violet));
  b.glow.group({ at: [-0.42, 0.55, 0.05], scale: 0.7, rot: [0, 0, -0.25] }, (g) => g.extrude(BOLT, 0.06, w));
});
