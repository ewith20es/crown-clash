// Remaining Royal counterparts, sharing Desktop's animation and physics rigs.
import { registerUnit, registerIcon } from './registry.js';
import { defineModel, unitView, staticGroup, teamPalette, col } from './kit.js';
import { UNITS } from '../../data/cards.js';

const steel = col(0xaabaca), dark = col(0x253044), wood = col(0x95623b);
const gold = col(0xffcc55), bone = col(0xf4e6c5), green = col(0x78bd49);
const violet = col(0xc46bea), cyan = col(0x77dfff);

for (const type of ['stormray', 'coilcrab', 'sunlens', 'zephyr']) registerUnit(type, team => {
  const armored = type === 'zephyr', inferno = type === 'sunlens';
  const color = armored ? steel : type === 'coilcrab' ? cyan : inferno ? col(0xd9a745) : green;
  const def = defineModel(`royal-dragon:${type}:${team}`, m => {
    const pal = teamPalette(team), body = m.part('body');
    body.paint.ball(.48, .58, .45, color, { at: [0, .65, 0] });
    body.paint.ball(.42, .36, .42, color, { at: [0, 1.23, .1] });
    body.paint.ball(.33, .2, .4, armored ? dark : color, { at: [0, 1.11, .42] });
    body.paint.ball(.31, .4, .12, armored ? pal.main : gold, { at: [0, .66, .4] });
    body.paint.tube([[0, .5, -.3], [0, .3, -.8], [0, .5, -1.1]], [.22, .12, .005], color);
    for (const x of [-1, 1]) {
      body.paint.sphere(.1, bone, { at: [x * .25, 1.3, .43] });
      body.paint.sphere(.05, dark, { at: [x * .25, 1.3, .51] });
      body.paint.cone(.1, .28, bone, { at: [x * .3, 1.61, .03], rot: [0, 0, -x * .3] });
      body.paint.cone(.045, .14, bone, { at: [x * .16, 1, .73], rot: [Math.PI, 0, 0] });
      body.paint.ball(.2, .13, .28, color, { at: [x * .35, .2, .25] });
      const wing = m.part(x < 0 ? 'wingL' : 'wingR', { pivot: [x * .35, .92, -.15] });
      wing.paint.extrude([[x * .3, .85], [x * 1.5, 1.6], [x * 1.2, .4], [x * .8, .6], [x * .4, .35]], .05, armored ? dark : col(0x6a559c));
      wing.paint.limb([x * .35, .9, 0], [x * 1.5, 1.6, 0], .06, .03, color);
    }
    if (inferno) {
      body.metal.cyl(.32, .4, .3, steel, { at: [0, 1.5, .05], seg: 12 });
      body.glow.sphere(.14, col(0xff8f37), { at: [0, 1.2, .78] });
    }
  });
  const v = unitView(type, team, def, { height: UNITS[type].height });
  v.animate = (dt, s, a) => {
    const flap = Math.sin(s.time * 10 + a.seed) * .55;
    v.parts.wingL.rotation.y = flap; v.parts.wingR.rotation.y = -flap;
    v.body.position.y = Math.sin(s.time * 4 + a.seed) * .08;
  };
  return v;
});

for (const type of ['podstrider', 'sproutling']) registerUnit(type, team => {
  const size = type === 'podstrider' ? 1 : .48;
  const def = defineModel(`royal-golem:${type}:${team}`, m => {
    const pal = teamPalette(team), rock = col(0x7e9299), b = m.part('body').paint;
    b.rock(.85 * size, rock, { at: [0, 1.2 * size, 0], scale: [1, 1.3, .7], seed: 4 });
    b.rock(.5 * size, rock, { at: [0, 2.35 * size, .1], seed: 2 });
    for (const x of [-1, 1]) {
      b.rock(.43 * size, rock, { at: [x * .42 * size, .4 * size, 0], seed: 3 });
      b.rock(.55 * size, rock, { at: [x * .9 * size, 1.4 * size, 0], scale: [.8, 1.2, .8], seed: 5 });
      m.part('body').glow.sphere(.07 * size, pal.light, { at: [x * .2 * size, 2.4 * size, .48 * size] });
    }
    b.crystal(.2 * size, .55 * size, violet, { at: [.5 * size, 2 * size, -.2 * size], rot: [0, 0, -.5] });
  });
  const v = unitView(type, team, def, { height: UNITS[type].height });
  v.animate = (dt, s, a) => { v.body.rotation.z = Math.sin(a.walk) * .06 * a.move; v.body.position.y = Math.abs(Math.sin(a.walk)) * .08 * a.move; };
  return v;
});

registerUnit('thunderhead', team => {
  const def = defineModel(`royal-balloon:${team}`, m => {
    const pal = teamPalette(team), b = m.part('body').paint;
    b.ball(.85, 1.05, .85, pal.main, { at: [0, 1.9, 0], seg: 20, rings: 16 });
    b.box(.75, .48, .7, wood, { at: [0, .3, 0], bevel: .08 });
    for (const x of [-1, 1]) for (const z of [-1, 1]) b.limb([x * .3, .45, z * .3], [x * .55, 1.3, z * .55], .025, .025, gold);
    b.sphere(.22, bone, { at: [0, .8, .2] });
    for (const x of [-1, 1]) b.sphere(.055, dark, { at: [x * .08, .82, .4] });
    b.sphere(.3, dark, { at: [0, .32, .62] });
    b.extrude([[-.3, .15], [-.2, -.16], [.2, -.16], [.3, .15], [.1, .02], [0, .23], [-.1, .02]], .05, gold, { at: [0, 2, .83] });
  });
  const v = unitView('thunderhead', team, def, { height: 2.8 });
  v.animate = (dt, s, a) => { v.body.rotation.z = Math.sin(s.time * 2 + a.seed) * .06; };
  return v;
});

registerUnit('sparkwisp', team => {
  const def = defineModel(`royal-spirit:${team}`, m => {
    const b = m.part('body');
    b.glow.ball(.28, .36, .24, cyan, { at: [0, .35, 0] });
    b.glow.cone(.2, .5, cyan, { at: [0, .72, -.05], rot: [-.4, 0, 0] });
    for (const x of [-1, 1]) b.paint.sphere(.055, dark, { at: [x * .1, .4, .22] });
  });
  const v = unitView('sparkwisp', team, def, { height: .8 });
  v.animate = (dt, s, a) => { v.body.position.y = Math.abs(Math.sin(s.time * 8 + a.seed)) * .18; };
  return v;
});

for (const type of ['sentry', 'nest', 'bombard', 'aetherwell']) registerUnit(type, team => {
  const def = defineModel(`royal-building:${type}:${team}`, m => {
    const pal = teamPalette(team), b = m.part('body').paint;
    b.box(1.8, .25, 1.7, dark, { at: [0, .125, 0], bevel: .1 });
    if (type === 'sentry') {
      b.box(1.2, .7, 1.2, wood, { at: [0, .55, 0], bevel: .08 });
      b.cyl(.16, .2, 1.25, steel, { at: [0, 1.2, 0] });
      for (let i = 0; i < 4; i++) b.torus(.36, .07, gold, { at: [0, .9 + i * .23, 0] });
      m.part('body').glow.sphere(.21, cyan, { at: [0, 1.95, 0] });
    } else if (type === 'bombard') {
      b.box(1.5, .45, 1.4, wood, { at: [0, .4, 0], bevel: .08 });
      b.cyl(.45, .5, 1.3, steel, { at: [0, 1.1, .1], rot: [.45, 0, 0], seg: 16 });
      b.cyl(.35, .35, .02, dark, { at: [0, 1.68, .38], rot: [.45, 0, 0], seg: 16 });
    } else if (type === 'nest') {
      b.box(1.45, 1.25, 1.25, wood, { at: [0, .85, 0], bevel: .06 });
      b.cone(1.15, .9, gold, { at: [0, 1.85, 0], seg: 4, rot: [0, Math.PI / 4, 0] });
      b.box(.55, .9, .04, dark, { at: [0, .7, .65], bevel: .06 });
      b.ball(.24, .23, .2, green, { at: [0, 1.04, .67] });
      b.box(.7, .15, .07, pal.main, { at: [0, 1.45, .65] });
    } else {
      b.cyl(.6, .6, 1.4, violet, { at: [0, 1.05, 0], seg: 16 });
      for (const y of [.38, 1.72]) b.cyl(.67, .67, .18, gold, { at: [0, y, 0], seg: 16 });
      for (const x of [-1, 1]) b.box(.16, 1.35, .15, steel, { at: [x * .58, 1, .25] });
      b.tube([[.4, 1.65, 0], [.9, 1.65, 0], [.9, .55, 0]], .1, steel);
      m.part('body').glow.sphere(.18, violet, { at: [0, 1.95, 0] });
    }
  });
  return unitView(type, team, def, { height: UNITS[type].height });
});

for (const id of ['stasis', 'jolt', 'overclock', 'blight', 'maelstrom', 'rockslide', 'seedpod', 'skyfork']) registerIcon(id, () => {
  const def = defineModel(`royal-spell:${id}`, m => {
    const b = m.part('body'), hue = id === 'blight' ? col(0xf0a93f) : id === 'overclock' ? violet : cyan;
    if (id === 'rockslide' || id === 'seedpod') {
      const log = id === 'rockslide';
      b.paint.cyl(.48, .48, log ? 1.7 : 1.1, wood, { at: [0, .8, 0], rot: log ? [0, 0, Math.PI / 2] : [0, 0, -.3], seg: 14 });
      for (const y of [-.4, .4]) b.metal.torus(.49, .06, steel, { at: log ? [y, .8, 0] : [0, .8 + y, 0], rot: log ? [0, 0, Math.PI / 2] : [0, 0, -.3] });
      if (log) for (let x = -.6; x <= .6; x += .3) b.metal.cone(.08, .3, steel, { at: [x, 1.36, 0], seg: 4 });
      else { b.paint.sphere(.24, green, { at: [0, 1.5, 0] }); for (const x of [-1, 1]) b.paint.cone(.1, .3, green, { at: [x * .24, 1.6, 0], rot: [0, 0, x * -1] }); }
    } else if (id === 'jolt' || id === 'skyfork') {
      b.glow.extrude([[.15, 1.8], [-.42, .8], [-.05, .8], [-.2, 0], [.5, 1.05], [.1, 1.05]], .13, id === 'jolt' ? gold : cyan);
    } else if (id === 'maelstrom') {
      for (let i = 0; i < 7; i++) b.paint.torus(.12 + i * .09, .07, col(0xa7b9cb), { at: [Math.sin(i) * .08, .2 + i * .2, 0], seg: 18 });
    } else {
      b.paint.ball(.48, .55, .48, hue, { at: [0, .7, 0] });
      b.paint.cyl(.18, .23, .35, steel, { at: [0, 1.28, 0], seg: 12 });
      b.paint.cyl(.2, .2, .15, wood, { at: [0, 1.48, 0], seg: 12 });
      b.glow.sphere(.14, hue, { at: [.15, .8, .42] });
    }
  });
  return staticGroup(def, { cast: false, receive: false });
});
