// Aether Spires — card and unit data. Pure data (no DOM, no three.js).
//
// Distances are tiles, times are seconds. All distances in the simulation are horizontal
// (x/z) distances between centres; an attacker can hit a target when
//     dist(attacker, target) − target.radius <= attacker.range
// so "melee" units simply have a short range (their own radius plus their reach).
//
// targets: 'ground'    → non-flying units, buildings, towers
//          'both'      → everything
//          'buildings' → buildings and towers only (ignores units)
//
// Ability fields (all optional, null/0/false = absent) — see the comments on `unit()` below.

import { expandCollection } from './collection.js';
import { LEGACY_CARD_ART } from './royale-art.js';
import { MATCH } from '../config.js';
import { level11Units, level11Cards } from './level11.js';

const DEPLOY = MATCH.DEPLOY_TIME;

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const k of Object.keys(o)) deepFreeze(o[k]);
  }
  return o;
}

function unit(o) {
  return {
    kind: 'unit',          // 'unit' | 'building' | 'tower'
    // ── durability ──
    hp: 100,
    shield: 0,             // extra pool that absorbs damage first; overflow from the breaking hit is discarded
    // ── attack ──
    dmg: 0,
    hitSpeed: 1,           // seconds between swings
    windup: 0.3,           // seconds from swing start until the blow lands / the projectile leaves
    range: 1,
    minRange: 0,           // blind spot: cannot target anything closer than this
    sight: 5.5,            // aggro radius
    targets: 'ground',
    splash: 0,             // damage radius around the impact point (0 = single target)
    towerDmgMult: 1,       // damage multiplier against towers
    projectile: null,      // projectile kind (string) or null for instant hits
    projSpeed: 0,
    lob: false,            // true: non-homing arc that lands where the target stood at launch
    attackFx: 'slash',     // visual style of the hit: slash | smash | bite | ram | zap | beam | burst | bolt
    chain: null,           // { count, range }: the hit jumps to up to count−1 further enemies
    onHit: null,           // { slow: { pct, dur } } | { stun: seconds } | { knockback: tiles }
    ramp: null,            // { times: [..], mults: [..] }: damage multiplier grows while locked on one target
    charge: null,          // { dist, speedMult, dmgMult }: after moving `dist` tiles uninterrupted
    pounce: null,          // { min, max, speed, dmgMult }: leaps onto a target inside the [min, max] band
    kamikaze: false,       // dies when its attack lands
    // ── movement / body ──
    speed: 1,
    radius: 0.4,
    mass: 3,
    flying: false,
    leap: false,           // ground unit that can hop the rift anywhere
    // ── lifecycle ──
    deployTime: DEPLOY,
    deployAnywhere: false, // may be deployed anywhere on the map (tunnels there from its own citadel)
    tunnelSpeed: 0,
    landing: null,         // { radius, dmg, knockback }: area hit when deployment completes
    lifetime: 0,           // buildings: seconds until it expires
    spawn: null,           // { unit, count, interval, first }: periodically produces units
    generate: null,        // { amount, interval }: periodically produces aether for its owner
    heal: null,            // { radius, amount, interval }: periodically heals nearby allied units
    deathSpawn: null,      // { unit, count }
    deathBlast: null,      // { radius, dmg, knockback, delay, towerMult }
    // ── presentation ──
    height: 1.4,           // model height (HP-bar placement, projectile aim)
    muzzle: 0.9,           // height projectiles leave from
    ...o,
  };
}

// Desktop mechanics templates; the sourced level 11 snapshot is applied before freezing.
const BASE_UNITS = level11Units({
  goblin: unit({ name: 'Goblin', hp: 190, dmg: 105, hitSpeed: 1.1, windup: .25, range: .9, speed: 1.7, radius: .3, mass: 2, height: 1.05 }),
  speargoblin: unit({ name: 'Spear Goblin', hp: 115, dmg: 70, hitSpeed: 1.5, windup: .3, range: 5, sight: 6, targets: 'both', projectile: 'bolt', projSpeed: 15, speed: 1.7, radius: .3, mass: 2, height: 1.05, muzzle: .8 }),
  barbarian: unit({ name: 'Barbarian', hp: 670, dmg: 180, hitSpeed: 1.3, windup: .35, range: 1, speed: 1, radius: .4, mass: 4, height: 1.55 }),
  minion: unit({ name: 'Minion', hp: 230, dmg: 95, hitSpeed: 1, windup: .25, range: 1.6, targets: 'both', speed: 1.5, radius: .3, mass: 2, flying: true, height: 1.1 }),
  bat: unit({ name: 'Bat', hp: 65, dmg: 65, hitSpeed: 1.2, windup: .2, range: .8, targets: 'both', speed: 1.9, radius: .23, mass: 1, flying: true, height: .65 }),
  wizard: unit({ name: 'Wizard', hp: 720, dmg: 235, hitSpeed: 1.4, windup: .4, range: 5.5, sight: 6, targets: 'both', splash: 1.4, projectile: 'orb', projSpeed: 12, speed: 1, radius: .4, mass: 4, height: 1.7, muzzle: 1.2 }),
  valkyrie: unit({ name: 'Valkyrie', hp: 1800, dmg: 220, hitSpeed: 1.5, windup: .45, range: 1.2, splash: 1.5, speed: 1, radius: .5, mass: 6, height: 1.7, attackFx: 'smash' }),
  royalgiant: unit({ name: 'Royal Giant', hp: 2900, dmg: 250, hitSpeed: 1.7, windup: .5, range: 5, sight: 99, targets: 'buildings', projectile: 'bolt', projSpeed: 12, speed: .7, radius: .7, mass: 12, height: 2.7, muzzle: 1.7 }),
  // ── towers ──────────────────────────────────────────────────────────────
  spire: unit({
    name: 'Princess Tower', kind: 'tower', hp: 2600, dmg: 95, hitSpeed: 0.8, windup: 0.2, range: 7.5, sight: 7.5,
    speed: 0, radius: 1.4, mass: Infinity, targets: 'both', projectile: 'bolt', projSpeed: 15,
    attackFx: 'bolt', height: 4.6, muzzle: 4.0, deployTime: 0,
  }),
  citadel: unit({
    name: 'King Tower', kind: 'tower', hp: 4200, dmg: 105, hitSpeed: 1.0, windup: 0.25, range: 7.0, sight: 7.0,
    speed: 0, radius: 1.9, mass: Infinity, targets: 'both', projectile: 'bolt', projSpeed: 15,
    attackFx: 'bolt', height: 5.6, muzzle: 4.8, deployTime: 0,
  }),

  // ── troops ──────────────────────────────────────────────────────────────
  warden: unit({
    name: 'Knight', hp: 1450, dmg: 160, hitSpeed: 1.2, windup: 0.45, range: 1.2,
    speed: 1.0, radius: 0.5, mass: 6, targets: 'ground', attackFx: 'slash', height: 1.5,
  }),
  scout: unit({
    name: 'Archer', hp: 300, dmg: 95, hitSpeed: 1.1, windup: 0.3, range: 5.0, sight: 6.0,
    speed: 1.0, radius: 0.35, mass: 2, targets: 'both', projectile: 'spark', projSpeed: 13,
    attackFx: 'zap', height: 1.2, muzzle: 0.8,
  }),
  colossus: unit({
    name: 'Giant', hp: 3400, dmg: 210, hitSpeed: 1.5, windup: 0.6, range: 1.6, sight: 99,
    speed: 0.75, radius: 0.9, mass: 20, targets: 'buildings', attackFx: 'smash', height: 2.9,
  }),
  glimmer: unit({
    name: 'Glimmer', hp: 180, dmg: 95, hitSpeed: 1.0, windup: 0.3, range: 0.8,
    speed: 1.8, radius: 0.3, mass: 1.5, targets: 'ground', attackFx: 'bite', height: 0.8,
  }),
  zephyr: unit({
    name: 'Zephyr', hp: 190, dmg: 85, hitSpeed: 1.0, windup: 0.3, range: 0.9,
    speed: 1.6, radius: 0.35, mass: 1.5, flying: true, targets: 'both', attackFx: 'bite', height: 0.7,
  }),
  stormray: unit({
    name: 'Storm Ray', hp: 1000, dmg: 130, hitSpeed: 1.6, windup: 0.5, range: 3.5,
    speed: 1.2, radius: 0.6, mass: 5, flying: true, targets: 'both', splash: 1.3,
    projectile: 'pulse', projSpeed: 9, attackFx: 'zap', height: 0.9, muzzle: 0.2,
  }),
  ramhorn: unit({
    name: 'Ramhorn', hp: 1400, dmg: 250, hitSpeed: 1.6, windup: 0.5, range: 1.4, sight: 99,
    speed: 1.5, radius: 0.6, mass: 8, targets: 'buildings', leap: true, attackFx: 'ram', height: 1.1,
  }),
  sage: unit({
    name: 'Lumen Sage', hp: 600, dmg: 230, hitSpeed: 1.7, windup: 0.6, range: 5.5, sight: 6.5,
    speed: 1.0, radius: 0.45, mass: 3, targets: 'both', splash: 1.5,
    projectile: 'orb', projSpeed: 7.5, attackFx: 'burst', height: 1.7, muzzle: 1.6,
  }),
  breaker: unit({
    name: 'Mini P.E.K.K.A', hp: 1150, dmg: 480, hitSpeed: 1.8, windup: 0.7, range: 1.3,
    speed: 1.2, radius: 0.55, mass: 6, targets: 'ground', attackFx: 'smash', height: 1.9,
  }),
  mite: unit({
    name: 'Skeleton', hp: 65, dmg: 65, hitSpeed: 1.0, windup: 0.3, range: 0.7,
    speed: 1.5, radius: 0.22, mass: 1, targets: 'ground', attackFx: 'bite', height: 0.45,
  }),
  longshot: unit({
    name: 'Musketeer', hp: 560, dmg: 200, hitSpeed: 1.2, windup: 0.4, range: 6.5, sight: 7.0,
    speed: 1.0, radius: 0.4, mass: 3, targets: 'both', projectile: 'tracer', projSpeed: 22,
    attackFx: 'bolt', height: 1.9, muzzle: 1.4,
  }),
  gyrolancer: unit({
    name: 'Gyro Lancer', hp: 1500, dmg: 300, hitSpeed: 1.4, windup: 0.5, range: 1.5,
    speed: 1.0, radius: 0.55, mass: 7, targets: 'ground', attackFx: 'ram', height: 1.8,
    charge: { dist: 2.5, speedMult: 2, dmgMult: 2 },
  }),
  prismguard: unit({
    name: 'Prism Guard', hp: 90, shield: 200, dmg: 95, hitSpeed: 1.1, windup: 0.35, range: 1.3,
    speed: 1.4, radius: 0.32, mass: 2, targets: 'ground', attackFx: 'slash', height: 1.1,
  }),
  sparkwisp: unit({
    name: 'Sparkwisp', hp: 110, dmg: 150, hitSpeed: 1.0, windup: 0.15, range: 0.9,
    speed: 2.0, radius: 0.25, mass: 1, flying: true, targets: 'both', splash: 1.6,
    kamikaze: true, onHit: { stun: 0.5 }, attackFx: 'burst', height: 0.5,
  }),
  boilerback: unit({
    name: 'Boilerback', hp: 2300, dmg: 170, hitSpeed: 1.5, windup: 0.55, range: 1.4,
    speed: 0.9, radius: 0.75, mass: 14, targets: 'ground', attackFx: 'smash', height: 2.1,
    deathBlast: { radius: 2.6, dmg: 700, knockback: 1.6, delay: 1.2, towerMult: 0.5 },
  }),
  podstrider: unit({
    name: 'Pod Strider', hp: 1100, dmg: 140, hitSpeed: 1.2, windup: 0.4, range: 1.3,
    speed: 1.0, radius: 0.55, mass: 6, targets: 'ground', attackFx: 'slash', height: 2.0,
    deathSpawn: { unit: 'sproutling', count: 4 },
  }),
  sproutling: unit({
    name: 'Sproutling', hp: 110, dmg: 55, hitSpeed: 1.0, windup: 0.3, range: 0.7,
    speed: 1.5, radius: 0.24, mass: 1, targets: 'ground', attackFx: 'bite', height: 0.5,
  }),
  thunderhead: unit({
    name: 'Thunderhead', hp: 1500, dmg: 520, hitSpeed: 2.6, windup: 0.8, range: 1.3, sight: 99,
    speed: 0.85, radius: 0.8, mass: 10, flying: true, targets: 'buildings', attackFx: 'zap', height: 1.2,
  }),
  coilcrab: unit({
    name: 'Coil Crab', hp: 900, dmg: 150, hitSpeed: 1.8, windup: 0.5, range: 4.5, sight: 6.0,
    speed: 0.9, radius: 0.55, mass: 5, targets: 'both', attackFx: 'zap', height: 1.2, muzzle: 1.1,
    chain: { count: 3, range: 3.0 }, onHit: { stun: 0.4 },
  }),
  frostsnail: unit({
    name: 'Frost Snail', hp: 780, dmg: 60, hitSpeed: 1.6, windup: 0.5, range: 4.5,
    speed: 0.7, radius: 0.5, mass: 5, targets: 'both', splash: 1.0,
    projectile: 'frost', projSpeed: 9, attackFx: 'burst', height: 0.9, muzzle: 0.7,
    onHit: { slow: { pct: 0.35, dur: 2.5 } },
  }),
  sunlens: unit({
    name: 'Sunlens', hp: 800, dmg: 30, hitSpeed: 0.4, windup: 0.4, range: 4.0,
    speed: 1.0, radius: 0.45, mass: 3, targets: 'both', attackFx: 'beam', height: 1.6, muzzle: 1.3,
    ramp: { times: [0, 2, 4], mults: [1, 3.3, 12] },
  }),
  bloomtender: unit({
    name: 'Bloom Tender', hp: 900, dmg: 55, hitSpeed: 1.3, windup: 0.4, range: 4.5,
    speed: 1.0, radius: 0.45, mass: 3, targets: 'both', projectile: 'petal', projSpeed: 10,
    attackFx: 'burst', height: 1.5, muzzle: 1.2,
    heal: { radius: 3.2, amount: 80, interval: 1.5 },
  }),
  gearwright: unit({
    name: 'Gearwright', hp: 700, dmg: 120, hitSpeed: 1.4, windup: 0.45, range: 5.0, sight: 6.0,
    speed: 1.0, radius: 0.45, mass: 3, targets: 'both', projectile: 'wrench', projSpeed: 11,
    attackFx: 'smash', height: 1.5, muzzle: 1.1,
    spawn: { unit: 'mite', count: 2, interval: 6, first: 1.0 },
  }),
  shardlynx: unit({
    name: 'Shardlynx', hp: 720, dmg: 150, hitSpeed: 1.0, windup: 0.3, range: 1.1,
    speed: 1.6, radius: 0.42, mass: 3.5, targets: 'ground', attackFx: 'slash', height: 1.0,
    pounce: { min: 3.2, max: 5.5, speed: 9, dmgMult: 2 },
  }),
  titan: unit({
    name: 'Skyfall Titan', hp: 3900, dmg: 240, hitSpeed: 1.7, windup: 0.6, range: 1.7,
    speed: 0.9, radius: 0.95, mass: 22, targets: 'ground', splash: 1.4, attackFx: 'smash', height: 3.0,
    landing: { radius: 2.4, dmg: 420, knockback: 1.4 },
  }),
  slingtoad: unit({
    name: 'Slingtoad', hp: 420, dmg: 150, hitSpeed: 1.8, windup: 0.5, range: 5.0,
    speed: 1.0, radius: 0.45, mass: 3, targets: 'ground', splash: 1.5,
    projectile: 'glob', projSpeed: 6.5, lob: true, attackFx: 'burst', height: 0.9, muzzle: 0.8,
  }),
  drillworm: unit({
    name: 'Drillworm', hp: 1000, dmg: 130, hitSpeed: 1.1, windup: 0.35, range: 1.1,
    speed: 1.3, radius: 0.45, mass: 4, targets: 'ground', towerDmgMult: 0.4, attackFx: 'bite', height: 1.3,
    deployAnywhere: true, tunnelSpeed: 9,
  }),

  // ── buildings ───────────────────────────────────────────────────────────
  sentry: unit({
    name: 'Sentry Prism', kind: 'building', hp: 950, dmg: 110, hitSpeed: 0.9, windup: 0.25, range: 6.0,
    sight: 6.0, speed: 0, radius: 0.9, mass: Infinity, targets: 'both', projectile: 'shard',
    projSpeed: 15, attackFx: 'bolt', height: 1.8, muzzle: 1.5, lifetime: 35,
  }),
  nest: unit({
    name: 'Glimmer Nest', kind: 'building', hp: 850, dmg: 0, hitSpeed: 0, windup: 0, range: 0, sight: 0,
    speed: 0, radius: 1.0, mass: Infinity, height: 1.7, lifetime: 36,
    spawn: { unit: 'glimmer', count: 1, interval: 4.5, first: 1.0 },
  }),
  bombard: unit({
    name: 'Skyreach Bombard', kind: 'building', hp: 900, dmg: 170, hitSpeed: 4.5, windup: 1.0, range: 11,
    minRange: 3.5, sight: 11, speed: 0, radius: 0.9, mass: Infinity, targets: 'ground', splash: 1.5,
    projectile: 'shell', projSpeed: 7, lob: true, attackFx: 'burst', height: 1.6, muzzle: 1.4, lifetime: 30,
  }),
  aetherwell: unit({
    name: 'Aether Well', kind: 'building', hp: 750, dmg: 0, hitSpeed: 0, windup: 0, range: 0, sight: 0,
    speed: 0, radius: 0.95, mass: Infinity, height: 1.9, lifetime: 56,
    generate: { amount: 1, interval: 8 },
  }),
});

function card(o) {
  return { count: 1, unit: null, spell: null, tags: [], ...o };
}

/** type: 'troop' | 'building' | 'spell'. `tags` describe the card's role for the AI and the UI. */
const BASE_CARDS = level11Cards([
  card({ id: 'skeletons', name: 'Skeletons', cost: 1, type: 'troop', unit: 'mite', count: 3, rarity: 'common', tags: ['cheap', 'swarm', 'melee'], desc: 'Three fragile skeletons. Distract a heavy hitter and cycle your deck cheaply.' }),
  card({ id: 'goblins', name: 'Goblins', cost: 2, type: 'troop', unit: 'goblin', count: 4, rarity: 'common', tags: ['cheap', 'swarm', 'melee', 'fast'], desc: 'Four fast dagger fighters. Surround isolated ground troops.' }),
  card({ id: 'speargoblins', name: 'Spear Goblins', cost: 2, type: 'troop', unit: 'speargoblin', count: 3, rarity: 'common', tags: ['cheap', 'swarm', 'ranged', 'anti-air'], desc: 'Three fragile ranged goblins that can hit both ground and air.' }),
  card({ id: 'barbarians', name: 'Barbarians', cost: 5, type: 'troop', unit: 'barbarian', count: 5, rarity: 'common', tags: ['swarm', 'melee', 'tank-killer'], desc: 'Five tough swordsmen. A strong ground defense, vulnerable to splash damage.' }),
  card({ id: 'minions', name: 'Minions', cost: 3, type: 'troop', unit: 'minion', count: 3, rarity: 'common', tags: ['air', 'swarm', 'anti-air'], desc: 'Three flying attackers. Cross the river anywhere and punish ground-only troops.' }),
  card({ id: 'minionhorde', name: 'Minion Horde', cost: 5, type: 'troop', unit: 'minion', count: 6, rarity: 'common', tags: ['air', 'swarm', 'anti-air'], desc: 'Six minions bring serious damage. Keep them away from Arrows and Wizards.' }),
  card({ id: 'bats', name: 'Bats', cost: 2, type: 'troop', unit: 'bat', count: 5, rarity: 'common', tags: ['cheap', 'air', 'swarm', 'anti-air'], desc: 'Five tiny flying attackers. Fast and cheap, but a single spell can clear them.' }),
  card({ id: 'wizard', name: 'Wizard', cost: 5, type: 'troop', unit: 'wizard', rarity: 'rare', tags: ['ranged', 'splash', 'anti-air'], desc: 'Fire magic hits ground and air in an area. Place him behind a tank.' }),
  card({ id: 'valkyrie', name: 'Valkyrie', cost: 4, type: 'troop', unit: 'valkyrie', rarity: 'rare', tags: ['melee', 'splash', 'tank'], desc: 'A durable axe fighter whose sweeping attacks clear nearby ground swarms.' }),
  card({ id: 'royalgiant', name: 'Royal Giant', cost: 6, type: 'troop', unit: 'royalgiant', rarity: 'common', tags: ['ranged', 'siege', 'tank'], desc: 'A cannon-carrying giant who targets buildings from a distance.' }),
  // ── troops ──
  card({
    id: 'warden', name: 'Knight', cost: 3, type: 'troop', unit: 'warden', rarity: 'common',
    tags: ['tank', 'melee'],
    desc: 'A brave swordsman in chainmail. Soaks up punishment while your fragile units work behind it.',
  }),
  card({
    id: 'scouts', name: 'Archers', cost: 3, type: 'troop', unit: 'scout', count: 2, rarity: 'common',
    tags: ['ranged', 'anti-air'],
    desc: 'Two pink-haired archers. Their arrows hit targets on the ground and in the air.',
  }),
  card({
    id: 'colossus', name: 'Giant', cost: 5, type: 'troop', unit: 'colossus', rarity: 'rare',
    tags: ['tank', 'siege'],
    desc: 'A walking mountain that only has eyes for buildings. Slow, stubborn and very hard to stop.',
  }),
  card({
    id: 'glimmers', name: 'Glimmers', cost: 2, type: 'troop', unit: 'glimmer', count: 3, rarity: 'common',
    tags: ['swarm', 'cheap', 'melee'],
    desc: 'Three quick crystal imps. Cheap, fast and surprisingly stabby.',
  }),
  card({
    id: 'zephyrs', name: 'Zephyrs', cost: 3, type: 'troop', unit: 'zephyr', count: 3, rarity: 'common',
    tags: ['swarm', 'air', 'anti-air'],
    desc: 'A trio of wind sprites that dive on anything, out of reach of ground-bound brawlers.',
  }),
  card({
    id: 'stormray', name: 'Storm Ray', cost: 4, type: 'troop', unit: 'stormray', rarity: 'epic',
    tags: ['air', 'splash', 'anti-air', 'ranged'],
    desc: 'A gliding sky-ray that spits crackling pulses, shocking everything near the impact.',
  }),
  card({
    id: 'ramhorn', name: 'Ramhorn', cost: 4, type: 'troop', unit: 'ramhorn', rarity: 'rare',
    tags: ['siege', 'fast'],
    desc: 'An armoured beetle that sprints for the nearest building — and wing-hops straight over the rift.',
  }),
  card({
    id: 'sage', name: 'Lumen Sage', cost: 5, type: 'troop', unit: 'sage', rarity: 'epic',
    tags: ['ranged', 'splash', 'anti-air'],
    desc: 'Lobs slow, heavy orbs of light that burst over an area. Keep her protected.',
  }),
  card({
    id: 'breaker', name: 'Mini P.E.K.K.A', cost: 4, type: 'troop', unit: 'breaker', rarity: 'rare',
    tags: ['melee', 'tank-killer'],
    desc: 'One armoured swordsman, one job: flatten whatever is in front of it. Slow swings, huge hits.',
  }),
  card({
    id: 'mites', name: 'Skeleton Army', cost: 3, type: 'troop', unit: 'mite', count: 8, rarity: 'common',
    tags: ['swarm', 'melee'],
    desc: 'Eight sword-wielding skeletons that overwhelm single targets. They hate area damage.',
  }),
  card({
    id: 'longshot', name: 'Musketeer', cost: 4, type: 'troop', unit: 'longshot', rarity: 'rare',
    tags: ['ranged', 'anti-air'],
    desc: 'A sharpshooter with a powerful musket. Protect her while she picks off ground and air targets.',
  }),
  card({
    id: 'gyrolancer', name: 'Gyro Lancer', cost: 5, type: 'troop', unit: 'gyrolancer', rarity: 'epic',
    tags: ['melee', 'charge', 'tank-killer'],
    desc: 'A monowheel jouster. Give it room to build speed and its first strike hits twice as hard.',
  }),
  card({
    id: 'prismguards', name: 'Prism Guards', cost: 3, type: 'troop', unit: 'prismguard', count: 3, rarity: 'rare',
    tags: ['swarm', 'melee', 'shield'],
    desc: 'Three small sentinels behind hard-light shields. A shield soaks one hit of any size.',
  }),
  card({
    id: 'sparkwisp', name: 'Sparkwisp', cost: 1, type: 'troop', unit: 'sparkwisp', rarity: 'common',
    tags: ['cheap', 'air', 'splash', 'stun', 'anti-air'],
    desc: 'A tiny wisp that dives into the first enemy it finds and bursts, stunning everything nearby.',
  }),
  card({
    id: 'boilerback', name: 'Boilerback', cost: 5, type: 'troop', unit: 'boilerback', rarity: 'epic',
    tags: ['tank', 'melee', 'death-blast'],
    desc: 'A waddling steam boiler. When it finally breaks down it overheats and explodes.',
  }),
  card({
    id: 'podstrider', name: 'Pod Strider', cost: 4, type: 'troop', unit: 'podstrider', rarity: 'rare',
    tags: ['melee', 'death-spawn'],
    desc: 'A stilt-legged seed carrier. Knock it down and four hungry Sproutlings tumble out.',
  }),
  card({
    id: 'thunderhead', name: 'Thunderhead', cost: 5, type: 'troop', unit: 'thunderhead', rarity: 'epic',
    tags: ['air', 'siege', 'tank'],
    desc: 'A living storm cloud that drifts toward buildings and hammers them with lightning.',
  }),
  card({
    id: 'coilcrab', name: 'Coil Crab', cost: 5, type: 'troop', unit: 'coilcrab', rarity: 'epic',
    tags: ['ranged', 'chain', 'stun', 'anti-air'],
    desc: 'Its back-mounted coil arcs between up to three enemies and briefly stuns each one.',
  }),
  card({
    id: 'frostsnail', name: 'Frost Snail', cost: 3, type: 'troop', unit: 'frostsnail', rarity: 'rare',
    tags: ['ranged', 'splash', 'slow', 'anti-air'],
    desc: 'Spits globs of rime that chill a small area, slowing movement and attacks.',
  }),
  card({
    id: 'sunlens', name: 'Sunlens', cost: 4, type: 'troop', unit: 'sunlens', rarity: 'epic',
    tags: ['ranged', 'tank-killer', 'anti-air', 'ramp'],
    desc: 'Focuses a beam that burns hotter the longer it stays on one target. Melts giants; stuns reset it.',
  }),
  card({
    id: 'bloomtender', name: 'Bloom Tender', cost: 4, type: 'troop', unit: 'bloomtender', rarity: 'rare',
    tags: ['support', 'heal', 'ranged', 'anti-air'],
    desc: 'A flower spirit that pulses healing to nearby allies while flicking petals at foes.',
  }),
  card({
    id: 'gearwright', name: 'Gearwright', cost: 5, type: 'troop', unit: 'gearwright', rarity: 'epic',
    tags: ['ranged', 'spawner', 'support', 'anti-air'],
    desc: 'Throws wrenches and keeps assembling Tin Mites for as long as she stays alive.',
  }),
  card({
    id: 'shardlynx', name: 'Shardlynx', cost: 3, type: 'troop', unit: 'shardlynx', rarity: 'rare',
    tags: ['melee', 'fast', 'pounce'],
    desc: 'A crystal cat that pounces on distant prey for double damage.',
  }),
  card({
    id: 'titan', name: 'Skyfall Titan', cost: 7, type: 'troop', unit: 'titan', rarity: 'legendary',
    tags: ['tank', 'melee', 'splash', 'landing'],
    desc: 'Crashes down from the clouds, shaking everything nearby, then sweeps crowds aside with every blow.',
  }),
  card({
    id: 'slingtoad', name: 'Slingtoad', cost: 3, type: 'troop', unit: 'slingtoad', rarity: 'common',
    tags: ['ranged', 'splash', 'anti-swarm'],
    desc: 'Lobs mud bombs at where ground enemies are standing. Fast targets can step out of the way.',
  }),
  card({
    id: 'drillworm', name: 'Drillworm', cost: 3, type: 'troop', unit: 'drillworm', rarity: 'legendary',
    tags: ['melee', 'anywhere'],
    desc: 'Tunnels to any spot on the island. Chews towers slowly, but ambushes backline units brilliantly.',
  }),

  // ── buildings ──
  card({
    id: 'sentry', name: 'Sentry Prism', cost: 4, type: 'building', unit: 'sentry', rarity: 'rare',
    tags: ['defense', 'anti-air'],
    desc: 'A floating crystal turret. Guards an area for a while and lures building-hunters.',
  }),
  card({
    id: 'nest', name: 'Glimmer Nest', cost: 5, type: 'building', unit: 'nest', rarity: 'rare',
    tags: ['spawner'],
    desc: 'A geode that hatches a Glimmer every few seconds until it crumbles.',
  }),
  card({
    id: 'bombard', name: 'Skyreach Bombard', cost: 4, type: 'building', unit: 'bombard', rarity: 'epic',
    tags: ['siege-building', 'splash'],
    desc: 'A long-range mortar that can shell towers from across the rift. Blind at close range.',
  }),
  card({
    id: 'aetherwell', name: 'Aether Well', cost: 5, type: 'building', unit: 'aetherwell', rarity: 'rare',
    tags: ['economy'],
    desc: 'Draws extra aether over its lifetime. Pays for itself only if you keep it alive.',
  }),

  // ── spells ──
  card({
    id: 'comet', name: 'Fireball', cost: 4, type: 'spell', rarity: 'rare', tags: ['spell', 'damage'],
    spell: { kind: 'comet', radius: 2.5, damage: 600, towerMult: 0.35, delay: 1.0, knockback: 1.2 },
    desc: 'Launches a blazing fireball onto the target area. Heavy damage and a shove; weaker against towers.',
  }),
  card({
    id: 'shardstorm', name: 'Arrows', cost: 3, type: 'spell', rarity: 'common', tags: ['spell', 'damage', 'anti-swarm'],
    spell: { kind: 'shardstorm', radius: 3.5, damage: 110, waves: 3, waveGap: 0.35, delay: 0.5, towerMult: 0.3 },
    desc: 'Three volleys of arrows rain over a wide area. Shreds swarms.',
  }),
  card({
    id: 'stasis', name: 'Stasis', cost: 4, type: 'spell', rarity: 'epic', tags: ['spell', 'control'],
    spell: { kind: 'stasis', radius: 3.0, duration: 4.0, delay: 0.25 },
    desc: 'Freezes enemy troops and structures in the area for a few seconds.',
  }),
  card({
    id: 'jolt', name: 'Jolt', cost: 2, type: 'spell', rarity: 'common', tags: ['spell', 'damage', 'stun', 'anti-swarm'],
    spell: { kind: 'jolt', radius: 2.5, damage: 150, towerMult: 0.35, stun: 0.5, delay: 0.1 },
    desc: 'An instant shock: light damage and a brief stun that resets charges and ramping beams.',
  }),
  card({
    id: 'overclock', name: 'Overclock', cost: 2, type: 'spell', rarity: 'epic', tags: ['spell', 'buff'],
    spell: { kind: 'overclock', radius: 4.0, duration: 6.0, haste: 0.35, delay: 0.2 },
    desc: 'Your troops and buildings in the zone move and attack 35% faster.',
  }),
  card({
    id: 'blight', name: 'Blight', cost: 4, type: 'spell', rarity: 'epic', tags: ['spell', 'damage', 'anti-swarm'],
    spell: { kind: 'blight', radius: 3.5, duration: 8.0, dps: 70, tick: 0.5, slow: 0.15, towerMult: 0.3, delay: 0.3 },
    desc: 'A lingering cloud of spores that eats away at everything inside and slows it slightly.',
  }),
  card({
    id: 'maelstrom', name: 'Maelstrom', cost: 3, type: 'spell', rarity: 'epic', tags: ['spell', 'control'],
    spell: { kind: 'maelstrom', radius: 5.0, duration: 1.8, pull: 3.4, dps: 60, tick: 0.3, towerMult: 0, delay: 0.2 },
    desc: 'A whirlwind that drags enemy troops toward its centre. Pull them together — or onto your towers.',
  }),
  card({
    id: 'rockslide', name: 'Rockslide', cost: 2, type: 'spell', rarity: 'legendary', tags: ['spell', 'damage', 'anti-swarm', 'knockback'],
    spell: { kind: 'rockslide', halfWidth: 1.9, length: 10, speed: 6.5, damage: 240, knockback: 1.5, towerMult: 0.3, delay: 0.3 },
    desc: 'A boulder rolls away from your side, flattening and shoving back every ground troop in its path.',
  }),
  card({
    id: 'seedpod', name: 'Seed Pod', cost: 3, type: 'spell', rarity: 'epic', tags: ['spell', 'spawn', 'anywhere'],
    spell: { kind: 'seedpod', radius: 1.2, unit: 'sproutling', count: 4, delay: 1.2 },
    desc: 'Lobs a pod anywhere on the island. Four Sproutlings burst out where it lands.',
  }),
  card({
    id: 'skyfork', name: 'Skyfork', cost: 6, type: 'spell', rarity: 'epic', tags: ['spell', 'damage', 'stun'],
    spell: { kind: 'skyfork', radius: 3.5, damage: 660, strikes: 3, strikeGap: 0.15, stun: 0.5, towerMult: 0.35, delay: 0.4 },
    desc: 'Three bolts strike the three toughest enemies in the area, stunning each.',
  }),
]);

const fullCollection = expandCollection(BASE_UNITS, BASE_CARDS, unit, LEGACY_CARD_ART);
export const UNITS = deepFreeze(fullCollection.units);
export const CARDS = deepFreeze(fullCollection.cards);
export const TOWER_CARDS = deepFreeze(fullCollection.towers);

export const CARD_BY_ID = Object.freeze(Object.fromEntries([...CARDS,...TOWER_CARDS].map((c) => [c.id, c])));

export const DEFAULT_DECK = Object.freeze([
  'warden', 'scouts', 'colossus', 'longshot', 'breaker', 'mites', 'comet', 'shardstorm',
]);

/** AI opponents: a name, a flavour title and an 8-card deck. */
export const OPPONENTS = deepFreeze([
  { id: 'royal', name: 'Royal Captain', title: 'Giant Beatdown', deck: ['colossus', 'wizard', 'scouts', 'goblins', 'minions', 'comet', 'shardstorm', 'valkyrie'] },
  { id: 'swarm', name: 'Goblin Chief', title: 'Swarm Rush', deck: ['goblins', 'speargoblins', 'bats', 'barbarians', 'minionhorde', 'warden', 'comet', 'shardstorm'] },
  { id: 'cannon', name: 'Cannon King', title: 'Royal Siege', deck: ['royalgiant', 'longshot', 'valkyrie', 'skeletons', 'minions', 'breaker', 'comet', 'shardstorm'] },
  { id: 'brakka', name: 'Forgemaster Brakka', title: 'Stonewall', deck: ['colossus', 'longshot', 'scouts', 'mites', 'breaker', 'comet', 'warden', 'shardstorm'] },
  { id: 'nimbus', name: 'Captain Nimbus', title: 'Skyfleet', deck: ['thunderhead', 'stormray', 'zephyrs', 'longshot', 'warden', 'shardstorm', 'sparkwisp', 'stasis'] },
  { id: 'tock', name: 'Professor Tock', title: 'Clockwork Rush', deck: ['ramhorn', 'gyrolancer', 'mites', 'gearwright', 'prismguards', 'jolt', 'nest', 'rockslide'] },
  { id: 'verda', name: 'Keeper Verda', title: 'Wild Bloom', deck: ['podstrider', 'bloomtender', 'slingtoad', 'frostsnail', 'breaker', 'seedpod', 'blight', 'glimmers'] },
  { id: 'pell', name: 'Delver Pell', title: 'Deep Delve', deck: ['drillworm', 'titan', 'coilcrab', 'sunlens', 'shardlynx', 'maelstrom', 'aetherwell', 'skyfork'] },
  { id: 'orrin', name: 'Marshal Orrin', title: 'Siegeworks', deck: ['bombard', 'sentry', 'longshot', 'warden', 'frostsnail', 'comet', 'overclock', 'mites'] },
]);

export function isValidDeck(deck) {
  return Array.isArray(deck) && deck.length === MATCH.DECK_SIZE
    && new Set(deck.map(id => CARD_BY_ID[id]?.family)).size === MATCH.DECK_SIZE
    && deck.every((id) => CARD_BY_ID[id] && CARD_BY_ID[id].type !== 'tower');
}

export function averageCost(deck) {
  if (!deck.length) return 0;
  return deck.reduce((s, id) => s + (CARD_BY_ID[id]?.cost ?? 0), 0) / deck.length;
}

function speedLabel(v) {
  if (v <= 0) return '—';
  if (v < 0.9) return 'Slow';
  if (v < 1.15) return 'Medium';
  if (v < 1.65) return 'Fast';
  return 'Very fast';
}

const TARGET_LABEL = { ground: 'Ground', both: 'Air & Ground', buildings: 'Buildings' };

/** Human-readable stat rows for a card: [{ label, value }]. Used by the deck builder. */
export function cardStats(card) {
  const rows = [];
  const add = (label, value) => rows.push({ label, value: String(value) });
  add('Level', card.level);
  if(card.ability){add('Ability cost',card.ability.cost+' elixir');add('Ability uses',card.ability['Ability charges']||'1');}
  if(card.variant==='evolution')add('Evolution cycles',card.cycles);
  if (card.type === 'spell') {
    const s = card.spell;
    if (s.radius) add('Radius', `${s.radius} tiles`);
    if (['comet', 'jolt', 'stasis', 'overclock'].includes(s.kind)) {
      add('Damage', s.damage);
      add('Tower damage', (s.crownDamage ?? Math.round(s.damage * s.towerMult)));
    } else if (s.kind === 'shardstorm') {
      add('Damage', `${s.damage} × ${s.waves}`);
      add('Tower damage', `${(s.crownDamage ?? Math.round(s.damage * s.towerMult))} × ${s.waves}`);
    } else if (s.kind === 'skyfork') {
      add('Damage', `${s.damage} × ${s.strikes}`);
      add('Tower damage', (s.crownDamage ?? Math.round(s.damage * s.towerMult)));
    } else if (s.kind === 'maelstrom') {
      add('Damage', s.tickDamage); add('Tower damage', s.crownTickDamage); add('Duration', `${s.duration} s`);
    } else if (s.kind === 'blight') {
      add('Damage / s', s.dps);
      add('Tower damage / s', s.crownDps);
      add('Duration', `${s.duration} s`);
    } else if (s.kind === 'rockslide') {
      add('Damage', s.damage);
      add('Tower damage', s.crownDamage);
      add('Width', `${s.halfWidth * 2} tiles`);
      add('Rolls', `${s.length} tiles`);
    } else if (s.kind === 'seedpod') {
      add('Spawns', `${UNITS[s.unit].name} × ${s.count}`);
    } else if (s.kind === 'overclock') {
      add('Boost', `+${Math.round(s.haste * 100)}%`);
      add('Duration', `${s.duration} s`);
    }
    if(s.kind==='graveyard'){add('Skeletons',s.count);add('Duration',s.duration+' s');}
    if(s.kind==='void'){add('Damage per wave',s.damageStages.join(' / '));add('Tower damage per wave',s.crownStages.join(' / '));}
    if(s.kind==='vines'){add('Damage / s',s.dps);add('Duration',s.duration+' s');}
    if (s.kind === 'overclock') { add('Boost', `+${Math.round(s.haste * 100)}%`); add('Duration', `${s.duration} s`); }
    if (s.kind === 'stasis') add('Freeze', `${s.duration} s`);
    if (s.stun) add('Stun', `${s.stun} s`);
    return rows;
  }
  const u = UNITS[card.unit];
  if (card.count > 1) add('Count', `× ${card.count}`);
  add('Hit points', u.hp);
  if (u.shield > 0) add('Shield', u.shield);
  if (u.dmg > 0) {
    if (u.ramp) {
      const dps = (m) => Math.round((u.dmg * m) / u.hitSpeed);
      add('Damage stages', u.ramp.mults.map(m => Math.round(u.dmg * m)).join(' / '));
      add('Hit speed', `${u.hitSpeed} s`);
      add('Damage / s', `${dps(u.ramp.mults[0])} → ${dps(u.ramp.mults[u.ramp.mults.length - 1])}`);
    } else {
      add(u.splash > 0 ? 'Area damage' : 'Damage', u.dmg);
      add('Hit speed', `${u.hitSpeed} s`);
    }
    add('Range', u.range >= 2 ? `${u.range} tiles` : 'Melee');
    add('Targets', TARGET_LABEL[u.targets]);
  }
  if (u.returnHit) add('Hits per throw', '2');
  if (u.charge) add('Charge damage', Math.round(u.dmg * u.charge.dmgMult));
  if (u.pounce) add('Jump / dash damage', Math.round(u.dmg * u.pounce.dmgMult));
  if (u.deathBlast) add('Death damage', u.deathBlast.dmg);
  if (u.towerDmgMult !== 1) add('Tower damage', Math.round(u.dmg * u.towerDmgMult));
  if (u.speed > 0) add('Speed', speedLabel(u.speed));
  if (u.flying) add('Movement', 'Flying');
  if (u.spawn) add('Produces', `${UNITS[u.spawn.unit].name}${u.spawn.count > 1 ? ` × ${u.spawn.count}` : ''} / ${u.spawn.interval} s`);
  if (u.generate) add('Elixir', `+${u.generate.amount} / ${u.generate.interval} s`);
  if (u.heal) add('Heals', `${u.heal.amount} / ${u.heal.interval} s`);
  if (u.lifetime > 0) add('Lifetime', `${u.lifetime} s`);
  return rows;
}

/** Short ability sentences for a card (may be empty). Used by the deck builder's detail panel. */
export function cardAbilities(card) {
  const out = [];
  if (card.variant === 'evolution') out.push(`Evolution: activates after ${card.cycles} regular deployments of this card.`);
  if (card.ability) out.push(`Ability: costs ${card.ability.cost} elixir. Use the ability button after deployment.`);
  if (card.type === 'spell') return out;
  const u = UNITS[card.unit];
  if (u.charge) out.push(`Charge: after ${u.charge.dist} tiles of running it moves ${u.charge.speedMult}× as fast and its next hit deals ${Math.round(u.dmg * u.charge.dmgMult)} damage.`);
  if (u.pounce) out.push(`Jump / dash: strikes targets ${u.pounce.min}–${u.pounce.max} tiles away for ${Math.round(u.dmg * u.pounce.dmgMult)} damage.`);
  if (u.leap) out.push('Leap: hops over the rift without needing a bridge.');
  if (u.shield > 0) out.push('Shield: absorbs damage first; a hit that breaks it deals no extra damage.');
  if (u.kamikaze) out.push('Burst: destroys itself when it strikes.');
  if (u.chain) out.push(`Chain: each hit arcs to up to ${u.chain.count} enemies.`);
  if (u.onHit?.stun) out.push(`Stun: hits stun for ${u.onHit.stun} s, resetting charges and beams.`);
  if (u.onHit?.slow) out.push(`Chill: hits slow by ${Math.round(u.onHit.slow.pct * 100)}% for ${u.onHit.slow.dur} s.`);
  if (u.ramp) out.push('Focus: damage ramps up while it stays on the same target.');
  if (u.lob) out.push('Lobbed: shots land where the target was standing — and cannot hit flyers.');
  if (u.minRange > 0) out.push(`Blind spot: cannot hit anything closer than ${u.minRange} tiles.`);
  if (u.heal) out.push(`Mend: heals allies within ${u.heal.radius} tiles.`);
  if (u.landing) out.push(`Impact: lands for ${u.landing.dmg} area damage and a shove.`);
  if (u.deathSpawn) out.push(`Last gift: releases ${u.deathSpawn.count} ${UNITS[u.deathSpawn.unit].name}s when destroyed.`);
  if (u.deathBlast) out.push(`Meltdown: explodes for ${u.deathBlast.dmg} area damage shortly after it is destroyed.`);
  if (u.deployAnywhere) out.push('Tunnel: can be deployed anywhere on the island.');
  if (u.towerDmgMult !== 1) out.push(`Deals ${Math.round(u.towerDmgMult * 100)}% damage to towers.`);
  if (u.targets === 'buildings') out.push('Ignores troops: only attacks buildings and towers.');
  return out;
}
