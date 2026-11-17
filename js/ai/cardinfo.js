// Static knowledge the opponent AI has about cards and units, derived once from the card data
// so balance changes flow through without touching the AI. Pure data, no DOM, no three.js.

import { CARDS, UNITS } from '../data/cards.js';

/** Aether worth of one unit that never appears on a card of its own. */
const SPAWNED_VALUE = { sproutling: 0.7, mite: 0.375 };

function has(card, tag) { return card.tags.indexOf(tag) >= 0; }

function traitsOf(type, def, value) {
  const ramp = def.ramp ? (def.ramp.mults[1] ?? 1) : 1;
  const dps = def.hitSpeed > 0 ? (def.dmg * ramp) / def.hitSpeed : 0;
  const hp = def.hp + (def.shield || 0);
  const ranged = def.range >= 3;
  return {
    type,
    value,                                   // aether worth of ONE of these at full health
    dps,
    hp,
    speed: def.speed,
    kind: def.kind,
    flying: !!def.flying,
    siege: def.targets === 'buildings',      // ignores troops
    hitsAir: def.dmg > 0 && def.targets === 'both' && !def.lob,
    splash: def.splash > 0 || !!def.chain,
    ranged,
    light: hp <= 320,                        // dies to small area damage
    heavy: def.hp >= 1400,
    squishyRanged: def.kind === 'unit' && ranged && def.hp <= 800,
    attacksUnits: def.dmg > 0 && def.targets !== 'buildings',
    blind: def.minRange > 0,
  };
}

const unitValue = {};
for (const c of CARDS) {
  if (c.unit && unitValue[c.unit] === undefined) unitValue[c.unit] = c.cost / Math.max(1, c.count);
}

/** Per unit type: derived combat traits (see traitsOf). */
export const UNIT_TRAITS = {};
for (const type of Object.keys(UNITS)) {
  const def = UNITS[type];
  const value = def.kind === 'tower' ? 0 : (unitValue[type] ?? SPAWNED_VALUE[type] ?? 0.5);
  UNIT_TRAITS[type] = Object.freeze(traitsOf(type, def, value));
}
Object.freeze(UNIT_TRAITS);

function cardInfo(card) {
  const spell = card.spell || null;
  const pod = !!spell && spell.kind === 'seedpod';
  const unitType = card.unit || (pod ? spell.unit : null);
  const def = unitType ? UNITS[unitType] : null;
  const T = unitType ? UNIT_TRAITS[unitType] : null;
  const count = card.unit ? card.count : pod ? spell.count : 0;
  const building = !!def && def.kind === 'building';
  const dpsPerCost = T ? (T.dps * Math.max(1, count)) / card.cost : 0;
  const splash = !!T && T.splash;
  const ranged = !!T && T.ranged;
  const siege = !!T && T.siege;
  const anywhere = pod || (!!def && def.deployAnywhere);
  const swarm = count >= 3;
  let baseDef = 1;                           // how good the card is as a defender, before match-ups
  if (building) baseDef = def.dmg > 0 ? (def.minRange > 0 ? 0.45 : 0.95) : (def.spawn ? 0.55 : 0);
  if (pod) baseDef = 0.85;
  return Object.freeze({
    id: card.id,
    cost: card.cost,
    type: card.type,                         // 'troop' | 'building' | 'spell'
    spell: pod ? null : spell,               // area spells only; a Seed Pod behaves like a troop drop
    spellDelay: spell ? (spell.delay || 0) : 0,
    pod,
    unitType,
    def,
    T,
    count,
    building,
    flying: !!T && T.flying,
    hitsAir: !!T && T.hitsAir,
    splash,
    ranged,
    siege,
    fastSiege: siege && def.speed >= 1.4,
    swarm,
    tank: has(card, 'tank'),
    frontliner: !!def && !building && !ranged && !anywhere && count === 1 && def.hp >= 1000,
    tankKiller: has(card, 'tank-killer'),
    slowHitter: !!def && count === 1 && !splash && !def.ramp && def.hitSpeed >= 1.4,
    lowDps: dpsPerCost < 35,
    fragile: !!T && T.light,
    diver: has(card, 'fast') || has(card, 'pounce') || anywhere || (!!T && T.flying && swarm),
    healer: !!def && !!def.heal,
    kamikaze: !!def && !!def.kamikaze,
    anywhere,
    economy: !!def && !!def.generate,
    spawnerBuilding: building && !!def.spawn,
    turret: building && def.dmg > 0 && !(def.minRange > 0),
    bombard: building && def.dmg > 0 && def.minRange > 0,
    range: def ? def.range : 0,
    speed: def ? def.speed : 0,
    baseDef,
  });
}

/** Per card id: everything the AI needs to judge and place a card. */
export const CARD_INFO = {};
for (const c of CARDS) CARD_INFO[c.id] = cardInfo(c);
Object.freeze(CARD_INFO);
