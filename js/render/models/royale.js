// Royal arena models. The Desktop rig still owns movement, attacks, deployment,
// hit flashes, freeze/haste states, shadows and disposal.
import { registerUnit } from './registry.js';
import { defineModel, unitView, teamPalette, col, walkLegs, swing, pose, aimLocal } from './kit.js';
import { UNITS } from '../../data/cards.js';

const skin = col(0xf6c18b), steel = col(0xaebed0), dark = col(0x23344c);
const gold = col(0xffcc55), leather = col(0x704731), bone = col(0xf4e6c5);
const pink = col(0xe85ba6), purple = col(0x9862cf), ginger = col(0xe78b32);
const profiles = {
  warden: { h: 1.65, w: .35, knight: true },
  scout: { h: 1.4, w: .24, archer: true },
  colossus: { h: 2.7, w: .66, giant: true },
  longshot: { h: 1.75, w: .28, musket: true },
  breaker: { h: 1.7, w: .37, pekka: true },
  mite: { h: .95, w: .16, skeleton: true },
  goblin: { h: 1.1, w: .21, goblin: true },
  speargoblin: { h: 1.1, w: .21, goblin: true, spear: true },
  barbarian: { h: 1.65, w: .34, barbarian: true },
  wizard: { h: 1.75, w: .29, wizard: true },
  valkyrie: { h: 1.75, w: .34, valkyrie: true },
  royalgiant: { h: 2.7, w: .66, giant: true, musket: true },
  glimmer: { h: 1.85, w: .4, barbarian: true, knight: true },
  sage: { h: 1.9, w: .4, executioner: true, valkyrie: true },
  gyrolancer: { h: 2.4, w: .35, knight: true, spear: true, mount: 'horse' },
  ramhorn: { h: 2, w: .35, barbarian: true, mount: 'hog' },
  prismguard: { h: 1.25, w: .22, skeleton: true, spear: true, shield: true },
  boilerback: { h: 2.6, w: .55, skeleton: true, bomb: true },
  frostsnail: { h: 1.7, w: .28, wizard: true, ice: true },
  bloomtender: { h: 1.8, w: .29, healer: true, barbarian: true },
  gearwright: { h: 1.8, w: .29, wizard: true, witch: true },
  shardlynx: { h: 1.6, w: .27, bandit: true },
  titan: { h: 2.8, w: .6, pekka: true, mega: true },
  slingtoad: { h: 1.1, w: .2, skeleton: true, bomb: true },
  drillworm: { h: 1.5, w: .31, knight: true, miner: true },
};

function royalTroop(type, team) {
  const p = profiles[type], { h, w } = p;
  const def = defineModel(`royale:${type}:${team}`, m => {
    const pal = teamPalette(team), face = p.skeleton ? bone : p.goblin ? col(0x7dc94b) : skin;
    const bodyColor = p.pekka ? dark : p.barbarian ? skin : p.giant ? leather : p.skeleton ? bone : p.knight ? steel : pal.main;
    const hip = h * .28, shoulder = h * .64, head = h * .82;
    const legR = m.part('legR', { pivot: [-w * .5, hip, 0] });
    legR.paint.limb([-w * .5, hip, 0], [-w * .6, h * .1, 0], w * .28, w * .26, p.skeleton ? bone : leather);
    legR.paint.box(w * .62, h * .12, w * .95, p.skeleton ? bone : leather, { at: [-w * .6, h * .06, w * .15], bevel: .035 });
    m.part('legL', { pivot: [w * .5, hip, 0], copy: 'legR' });
    const torso = m.part('torso', { pivot: [0, hip, 0] });
    const b = torso.paint;
    if (p.mount) {
      const animal = p.mount === 'hog' ? col(0xb96d54) : leather;
      b.ball(.5, .4, .83, animal, { at: [0, .55, .1] });
      b.ball(.32, p.mount === 'hog' ? .3 : .55, .35, animal, { at: [0, .8, .72] });
      b.ball(.26, .2, .12, p.mount === 'hog' ? pink : dark, { at: [0, .73, 1.05] });
      for (const x of [-1, 1]) {
        b.cone(.13, .3, animal, { at: [x * .22, 1.12, .65], rot: [0, 0, -x * .3] });
        b.sphere(.045, dark, { at: [x * .25, .9, .96] });
        for (const z of [-.4, .55]) b.limb([x * .35, .5, z], [x * .4, .08, z], .1, .07, animal);
      }
    }
    b.ball(w, h * .24, w * .68, bodyColor, { at: [0, h * .48, 0], seg: 16, rings: 10 });
    if (!p.skeleton) {
      b.box(w * 1.8, h * .07, w * 1.4, leather, { at: [0, h * .35, 0], bevel: .03 });
      b.box(w * .4, h * .07, .06, gold, { at: [0, h * .35, w * .74], bevel: .015 });
      b.box(w * 1.6, h * .34, .06, pal.main, { at: [0, h * .51, -w * .65], rot: [-.12, 0, 0], bevel: .025 });
    } else {
      for (let i = 0; i < 3; i++) b.torus(w * .85, .028, bone, { at: [0, h * (.43 + i * .07), 0], scale: [1, 1, .6], seg: 10 });
    }
    b.ball(w * .83, h * .17, w * .8, p.pekka ? steel : face, { at: [0, head, 0], seg: 18, rings: 12 });
    if (p.archer || p.musket || p.giant || p.barbarian || p.valkyrie) {
      const hair = p.archer ? pink : p.barbarian ? gold : p.musket && !p.giant ? purple : ginger;
      b.ball(w * .91, h * .1, w * .87, hair, { at: [0, head + h * .1, -.035], seg: 16 });
      if (!p.giant) for (const x of [-1, 1]) b.ball(w * .25, h * .18, w * .4, hair, { at: [x * w * .72, head - h * .02, 0] });
      if (p.giant) b.ball(w * .7, h * .065, w * .3, ginger, { at: [0, head - h * .12, w * .65] });
    }
    if (p.knight || (p.musket && !p.giant)) {
      b.ball(w * .9, h * .105, w * .87, steel, { at: [0, head + h * .1, -.025], seg: 18 });
      b.box(w * 1.9, .065, w * 1.75, steel, { at: [0, head + h * .04, 0], bevel: .04 });
      if (p.musket) b.ball(.1, .32, .12, purple, { at: [0, h * 1.08, -.05], rot: [-.3, 0, 0] });
      if (p.knight) for (const x of [-1, 1]) b.ball(w * .35, .075, .08, gold, { at: [x * w * .25, head - .065, w * .79] });
    }
    if (p.pekka) {
      b.box(w * 1.5, h * .12, .09, dark, { at: [0, head, w * .78], bevel: .03 });
      for (const x of [-1, 1]) {
        torso.glow.tube([[x * w * .7, head + .08, 0], [x * w * 1.2, head + .23, 0], [x * w * 1.25, head + .48, 0]], [.1, .075, .005], pal.light, { sides: 8 });
        b.ball(w * .55, .17, .23, pal.main, { at: [x * w, shoulder, 0] });
      }
    }
    if (p.goblin) for (const x of [-1, 1]) b.cone(.13, .36, face, { at: [x * w * 1.1, head + .08, 0], rot: [0, 0, -x * 1.1], seg: 5 });
    if (p.wizard) {
      b.ball(w * 1.08, h * .2, w * .95, pal.main, { at: [0, head + .04, -.09] });
      b.ball(w * .65, h * .13, .11, skin, { at: [0, head, w * .8] });
      b.box(.22, .1, .07, dark, { at: [0, head - .13, w * .84], bevel: .035 });
    }
    if (p.bandit || p.executioner) {
      b.ball(w * 1.03, h * .16, w * .87, dark, { at: [0, head + .055, -.06] });
      b.box(w * 1.6, .1, .05, dark, { at: [0, head, w * .83], bevel: .02 });
      b.box(.14, .07, .04, skin, { at: [0, head - .12, w * .84] });
    }
    if (p.witch) {
      b.cone(w * 1.1, .55, purple, { at: [0, h * 1.06, -.04], seg: 10 });
      b.ball(w * 1.15, h * .25, w, purple, { at: [0, h * .45, 0] });
    }
    if (p.miner) torso.glow.sphere(.09, gold, { at: [0, head + .16, w * .85] });
    if (p.healer) for (const x of [-1, 1]) b.extrude([[0, 0], [x * .65, .5], [x * .8, -.2], [x * .2, -.45]], .04, bone, { at: [x * w, h * .65, -.25] });
    for (const x of [-1, 1]) {
      (p.pekka ? torso.glow : b).ball(p.skeleton ? .06 : .035, p.skeleton ? .07 : .04, .028,
        p.pekka ? pal.light : dark, { at: [x * w * .34, head + .015, w * .78] });
      if (!p.skeleton && !p.pekka) b.box(w * .4, .035, .04, p.giant ? ginger : leather, { at: [x * w * .32, head + .075, w * .76], rot: [0, 0, x * -.12] });
    }
    const arm = (name, sign) => {
      const part = m.part(name, { pivot: [sign * w, shoulder, 0], parent: 'torso' });
      part.paint.limb([sign * w, shoulder, 0], [sign * w * 1.15, h * .43, w * .25], w * .3, w * .27, p.pekka ? steel : face);
      part.paint.sphere(w * .31, p.pekka ? dark : face, { at: [sign * w * 1.15, h * .43, w * .25], seg: 12 });
      return part;
    };
    const right = arm('armR', -1), left = arm('armL', 1);
    if (p.shield) left.metal.cyl(.27, .27, .09, steel, { at: [w * 1.2, h * .5, .3], rot: [Math.PI / 2, 0, 0], seg: 12 });
    if (p.bomb) {
      right.paint.sphere(h * .16, dark, { at: [-w * 1.2, h * .48, .35], seg: 16 });
      right.paint.limb([-w * 1.2, h * .63, .35], [-w, h * .7, .35], .025, .02, leather);
      right.glow.sphere(.06, gold, { at: [-w, h * .7, .35] });
    }
    if (p.wizard) {
      right.glow.sphere(.19, p.ice ? col(0x83eaff) : p.witch ? purple : col(0xffa13d), { at: [-w * 1.15, h * .48, .35] });
      right.glow.cone(.12, .4, p.ice ? col(0xc5faff) : p.witch ? purple : col(0xffdd82), { at: [-w * 1.15, h * .65, .35], seg: 9 });
    } else if (p.spear) {
      right.paint.limb([-w * 1.15, .2, .1], [-w * 1.15, h * 1.45, .1], .023, .023, leather);
      right.metal.cone(.065, .23, steel, { at: [-w * 1.15, h * 1.5, .1], seg: 4 });
    } else if (p.valkyrie) {
      right.paint.limb([-w * 1.2, .3, .1], [-w * 1.2, h, .1], .04, .04, leather);
      right.metal.extrude([[-.35, .2], [.3, .3], [.4, -.1], [-.35, -.2]], .1, steel, { at: [-w * 1.2, h * .9, .1] });
    } else if (p.archer) {
      left.paint.tube([[w * 1.3, h * .85, .25], [w * 1.65, h * .65, .38], [w * 1.65, h * .35, .38], [w * 1.3, h * .18, .25]], .035, gold, { sides: 7 });
      left.paint.limb([w * 1.3, h * .85, .25], [w * 1.3, h * .18, .25], .008, .008, bone);
      right.paint.limb([-w, h * .46, .25], [-w, h * .46, 1], .015, .015, leather);
    } else if (p.musket) {
      right.paint.box(.17, .2, .68, leather, { at: [-w, h * .48, .42], bevel: .05 });
      right.metal.cyl(.085, .085, .9, steel, { at: [-w, h * .53, .85], rot: [Math.PI / 2, 0, 0], seg: 14 });
      right.paint.cyl(.062, .062, .012, dark, { at: [-w, h * .53, 1.31], rot: [Math.PI / 2, 0, 0] });
      right.metal.torus(.09, .025, gold, { at: [-w, h * .53, 1.28], rot: [Math.PI / 2, 0, 0] });
    } else if (!p.giant && !p.bomb && !p.mega) {
      right.metal.box(p.pekka ? .22 : .11, h * .58, .055, steel, { at: [-w * 1.15, h * .68, w * .34], bevel: .015 });
      right.paint.box(w * 1.1, .07, .12, gold, { at: [-w * 1.15, h * .43, w * .34], bevel: .025 });
    }
    if (p.mega) for (const [part, sign] of [[right, -1], [left, 1]]) {
      part.metal.sphere(.33, steel, { at: [sign * w * 1.15, h * .43, .28], seg: 10 });
      for (const z of [.1, .4]) part.metal.cone(.07, .22, steel, { at: [sign * w * 1.15, h * .55, z], seg: 4 });
    }
  });
  const v = unitView(type, team, def, { height: UNITS[type].height, stride: p.giant ? 1.1 : .7 });
  v.animate = (dt, s, a) => {
    const { legL, legR, torso, armL, armR } = v.parts;
    walkLegs(a, legL, legR, .55, .035);
    const hit = swing(s.attackT, s.windup, s.hitSpeed);
    torso.position.y = torso.userData.home.y + Math.abs(Math.sin(a.walk)) * .035 * a.move;
    torso.rotation.z = Math.sin(a.walk) * .045 * a.move;
    torso.rotation.y = p.valkyrie && s.attackT >= 0 ? Math.min(1, s.attackT / s.hitSpeed) * Math.PI * 2 : 0;
    armR.rotation.x = p.musket || p.archer ? pose(hit, -.25, -.35, .15) : pose(hit, -2.2, Math.sin(a.walk) * .3 * a.move, .6);
    armL.rotation.x = p.archer ? -.4 : -Math.sin(a.walk) * .3 * a.move;
  };
  return v;
}

function royalTower(type, team) {
  const king = type === 'citadel', w = king ? 3.1 : 2.3, top = king ? 3.5 : 2.8;
  const def = defineModel(`royal-tower:${type}:${team}`, m => {
    const pal = teamPalette(team), stone = col(0xc9c6b9), edge = col(0xece2ca);
    const b = m.part('base').paint;
    b.box(w + .45, .35, w + .4, dark, { at: [0, .175, 0], bevel: .14 });
    b.box(w, top, w * .85, stone, { at: [0, top / 2 + .25, 0], bevel: .12 });
    for (let i = 0; i < 4; i++) b.box(w + .04, .055, w * .87, edge, { at: [0, .6 + i * .6, 0], bevel: .025 });
    for (const x of [-1, 1]) {
      b.box(.25, top + .1, .25, edge, { at: [x * w * .44, top / 2 + .25, w * .44], bevel: .04 });
      b.box(.2, .55, .08, dark, { at: [x * w * .28, top * .57, w * .44], bevel: .07 });
    }
    b.box(w * .4, top * .55, .08, pal.main, { at: [0, top * .46, w * .45], bevel: .03 });
    b.extrude([[-.3, .15], [-.2, -.16], [.2, -.16], [.3, .15], [.1, .02], [0, .23], [-.1, .02]], .06, gold, { at: [0, top * .5, w * .5] });
    b.box(w + .3, .22, w * .95 + .2, pal.main, { at: [0, top + .3, 0], bevel: .065 });
    for (const side of [-1, 1]) for (let i = -1; i <= 1; i++) {
      b.box(.48, .5, .4, edge, { at: [i * w * .38, top + .58, side * w * .45], bevel: .055 });
      b.box(.4, .5, .48, edge, { at: [side * w * .46, top + .58, i * w * .33], bevel: .055 });
    }
    const turret = m.part('turret', { pivot: [0, top + .4, 0] });
    if (king) {
      turret.paint.ball(.5, .5, .37, pal.main, { at: [0, top + .85, 0] });
      turret.paint.sphere(.36, skin, { at: [0, top + 1.4, 0], seg: 16 });
      turret.paint.box(.48, .11, .08, dark, { at: [0, top + 1.3, .32], bevel: .03 });
      turret.paint.cyl(.37, .32, .18, gold, { at: [0, top + 1.7, 0], seg: 10 });
      for (let i = 0; i < 5; i++) turret.paint.cone(.08, .25, gold, { at: [Math.sin(i * Math.PI * .4) * .3, top + 1.9, Math.cos(i * Math.PI * .4) * .3], seg: 5 });
      turret.metal.cyl(.27, .33, 1.25, dark, { at: [0, top + .65, .62], rot: [Math.PI / 2, 0, 0], seg: 16 });
      turret.metal.torus(.28, .055, steel, { at: [0, top + .65, 1.25], rot: [Math.PI / 2, 0, 0] });
    } else {
      turret.paint.ball(.27, .38, .24, pal.main, { at: [0, top + .7, 0] });
      turret.paint.sphere(.25, skin, { at: [0, top + 1.14, 0], seg: 14 });
      turret.paint.ball(.28, .22, .26, purple, { at: [0, top + 1.26, -.07] });
      turret.paint.tube([[-.42, top + 1.1, .35], [0, top + .9, .5], [.42, top + 1.1, .35]], .04, gold);
      turret.paint.box(.06, .06, .9, leather, { at: [0, top + .92, .55] });
    }
  });
  const v = unitView(type, team, def, { height: UNITS[type].height, deploy: 'none' });
  v.animate = (dt, s) => {
    const t = v.parts.turret;
    t.rotation.y = s.aimYaw === null ? 0 : aimLocal(v, s, t.rotation.y, 12, dt);
    t.position.z = s.attackT >= 0 ? -Math.sin(Math.min(1, s.attackT / Math.max(.1, s.hitSpeed)) * Math.PI) * .12 : 0;
    v.shade = s.hpFrac < .3 ? .75 : 1;
  };
  return v;
}

for (const type of Object.keys(profiles)) registerUnit(type, team => royalTroop(type, team));
for (const type of ['spire', 'citadel']) registerUnit(type, team => royalTower(type, team));

for (const type of ['minion', 'bat']) registerUnit(type, team => {
  const bat = type === 'bat', size = bat ? .6 : 1;
  const def = defineModel(`royal-flyer:${type}:${team}`, m => {
    const pal = teamPalette(team), color = bat ? purple : pal.main;
    const b = m.part('body').paint;
    b.ball(.25 * size, .42 * size, .2 * size, color, { at: [0, .42 * size, 0] });
    b.sphere(.28 * size, color, { at: [0, .79 * size, 0], seg: 14 });
    for (const x of [-1, 1]) {
      b.cone(.09 * size, .3 * size, color, { at: [x * .18 * size, 1.05 * size, 0], rot: [0, 0, -x * .2] });
      b.sphere(.045 * size, gold, { at: [x * .1 * size, .82 * size, .25 * size] });
      b.cone(.035 * size, .1 * size, bone, { at: [x * .08 * size, .64 * size, .23 * size], rot: [Math.PI, 0, 0] });
      const wing = m.part(x < 0 ? 'wingL' : 'wingR', { pivot: [x * .2 * size, .6 * size, 0] });
      wing.paint.extrude([[x * .15 * size, .6 * size], [x * 1.1 * size, 1.05 * size], [x * .85 * size, .35 * size], [x * .5 * size, .45 * size], [x * .2 * size, .2 * size]], .035, bat ? dark : purple);
    }
  });
  const v = unitView(type, team, def, { height: UNITS[type].height });
  v.animate = (dt, s, a) => {
    const flap = Math.sin(s.time * 18 + a.seed) * .7;
    v.parts.wingL.rotation.y = flap; v.parts.wingR.rotation.y = -flap;
    v.body.position.y = Math.sin(s.time * 7 + a.seed) * .07;
  };
  return v;
});
