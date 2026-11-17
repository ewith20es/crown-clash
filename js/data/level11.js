// Standard (non-Hero, non-Evolution) level 11 snapshot, checked 2026-11-15.
// Sources and special-damage definitions: ../../LEVEL11-STATS.md.
// Legacy IDs keep saved decks and Desktop animation/physics hooks compatible.
export const BALANCE_DATE = '2026-11-15';
export const LEVEL = 11;
export const UNIT_STATS = {
  spire: { name: 'Princess Tower', hp: 3052, dmg: 109 },
  citadel: { name: 'King Tower', hp: 4824, dmg: 109 },
  warden: { name: 'Knight', hp: 1766, dmg: 202, hitSpeed: 1.2 },
  scout: { name: 'Archer', hp: 304, dmg: 112, hitSpeed: .9 },
  colossus: { name: 'Giant', hp: 3968, dmg: 253, hitSpeed: 1.5 },
  breaker: { name: 'Mini P.E.K.K.A', hp: 1390, dmg: 755, hitSpeed: 1.6, speed: 1.5 },
  longshot: { name: 'Musketeer', hp: 721, dmg: 217, hitSpeed: 1, range: 6 },
  mite: { name: 'Skeleton', hp: 81, dmg: 81, hitSpeed: 1.1 },
  goblin: { name: 'Goblin', hp: 202, dmg: 125, hitSpeed: 1.1, speed: 2 },
  speargoblin: { name: 'Spear Goblin', hp: 133, dmg: 81, hitSpeed: 1.6, speed: 2 },
  barbarian: { name: 'Barbarian', hp: 716, dmg: 192, hitSpeed: 1.4 },
  minion: { name: 'Minion', hp: 230, dmg: 107, hitSpeed: 1.2, range: 2.5 },
  bat: { name: 'Bat', hp: 81, dmg: 81, hitSpeed: 1.2, speed: 2 },
  wizard: { name: 'Wizard', hp: 755, dmg: 304, hitSpeed: 1.4 },
  valkyrie: { name: 'Valkyrie', hp: 1907, dmg: 266, hitSpeed: 1.5, splash: 2 },
  royalgiant: { name: 'Royal Giant', hp: 3164, dmg: 307, hitSpeed: 1.8 },
  glimmer: { name: 'Elite Barbarian', hp: 1341, dmg: 384, hitSpeed: 1.4, speed: 1.5, radius: .45, mass: 4, height: 1.8 },
  zephyr: { name: 'Mega Minion', hp: 837, dmg: 312, hitSpeed: 1.5, speed: 1, radius: .5, mass: 6, range: 1.6, height: 1.5 },
  stormray: { name: 'Baby Dragon', hp: 1152, dmg: 168, hitSpeed: 1.5, speed: 1.5, height: 1.4 },
  ramhorn: { name: 'Hog Rider', hp: 1697, dmg: 317, hitSpeed: 1.6, speed: 2, height: 1.9 },
  sage: { name: 'Executioner', hp: 1280, dmg: 179, hitSpeed: 2.4, range: 4.5, returnHit: true, splash: 1 },
  gyrolancer: { name: 'Prince', hp: 1920, dmg: 391, hitSpeed: 1.4, charge: { dist: 2.5, speedMult: 2, dmgMult: 783 / 391 }, height: 2.4 },
  prismguard: { name: 'Guard', hp: 81, shield: 256, dmg: 117, hitSpeed: 1, range: 1.6, speed: 1.5 },
  sparkwisp: { name: 'Electro Spirit', hp: 215, dmg: 99, flying: false, splash: 0, range: 2.5, chain: { count: 9, range: 3 }, onHit: { stun: .5 } },
  boilerback: { name: 'Giant Skeleton', hp: 3361, dmg: 276, hitSpeed: 1.3, speed: 1, deathBlast: { radius: 3, dmg: 688, knockback: 0, delay: 3, towerMult: 1 }, height: 2.7 },
  podstrider: { name: 'Golem', hp: 5120, dmg: 312, hitSpeed: 2.5, windup: 1, speed: .75, targets: 'buildings', sight: 99, mass: 20, radius: .8, height: 2.8, deployTime: 3, deathSpawn: { unit: 'sproutling', count: 2 }, deathBlast: { radius: 2, dmg: 225, knockback: 0, delay: 0, towerMult: 1 } },
  sproutling: { name: 'Golemite', hp: 1039, dmg: 84, hitSpeed: 2.5, speed: .75, targets: 'buildings', sight: 99, mass: 6, radius: .45, height: 1.25, deathBlast: { radius: 1.5, dmg: 99, knockback: 0, delay: 0, towerMult: 1 } },
  thunderhead: { name: 'Balloon', hp: 1676, dmg: 640, hitSpeed: 2, windup: .2, speed: 1, deathBlast: { radius: 3, dmg: 240, knockback: 0, delay: 3, towerMult: 1 }, height: 2.8 },
  coilcrab: { name: 'Electro Dragon', hp: 1049, dmg: 192, hitSpeed: 2.1, flying: true, speed: 1, range: 3.5, chain: { count: 3, range: 4 }, onHit: { stun: .5 }, height: 1.6 },
  frostsnail: { name: 'Ice Wizard', hp: 688, dmg: 89, hitSpeed: 1.7, speed: 1, range: 5.5, splash: 1.5, onHit: { slow: { pct: .3, dur: 2.5 } }, landing: { radius: 3, dmg: 84, knockback: 0, targets: 'both', slow: { pct: .3, dur: 2.5 } }, height: 1.7 },
  sunlens: { name: 'Inferno Dragon', hp: 1295, dmg: 35, hitSpeed: .4, flying: true, range: 3.5, ramp: { times: [0, 2, 4], mults: [1, 120 / 35, 422 / 35] }, height: 1.6 },
  bloomtender: { name: 'Battle Healer', hp: 1920, dmg: 268, hitSpeed: 2, range: 1.6, targets: 'ground', projectile: null, attackFx: 'slash', heal: { radius: 3, amount: 102, interval: 2, onAttack: true, spawn: 202 } },
  gearwright: { name: 'Witch', hp: 839, dmg: 135, hitSpeed: 1.1, range: 5.5, splash: 1.5, spawn: { unit: 'mite', count: 4, interval: 7, first: 1 } },
  shardlynx: { name: 'Bandit', hp: 906, dmg: 194, hitSpeed: 1, speed: 1.5, pounce: { min: 3.5, max: 6, speed: 9, dmgMult: 389 / 194 }, height: 1.6 },
  titan: { name: 'Mega Knight', hp: 3993, dmg: 268, hitSpeed: 1.7, speed: 1, landing: { radius: 2.2, dmg: 430, knockback: 1 }, pounce: { min: 3.5, max: 5, speed: 7, dmgMult: 537 / 268 } },
  slingtoad: { name: 'Bomber', hp: 304, dmg: 212, hitSpeed: 1.8, range: 4.5, height: 1.1 },
  drillworm: { name: 'Miner', hp: 1210, dmg: 194, hitSpeed: 1.3, speed: 1.5, towerDmgMult: 39 / 194, height: 1.5 },
  sentry: { name: 'Tesla', hp: 1182, dmg: 220, hitSpeed: 1.1, range: 5.5, lifetime: 25 },
  nest: { name: 'Goblin Hut', hp: 1180, dmg: 0, lifetime: 30, spawn: { unit: 'speargoblin', count: 1, interval: 2.2, first: 1, enemyRange: 6 }, deathSpawn: { unit: 'speargoblin', count: 1 } },
  bombard: { name: 'Mortar', hp: 1369, dmg: 266, hitSpeed: 4.7, range: 11.5, sight: 11.5, splash: 2, deployTime: 3.5 },
  aetherwell: { name: 'Elixir Collector', hp: 1070, dmg: 0, lifetime: 110, generate: { amount: 1, interval: 15 } },
};

// name, elixir, count, rarity; internal IDs intentionally stable.
export const CARD_STATS = {
  glimmers: ['Elite Barbarians', 6, 2, 'common'], zephyrs: ['Mega Minion', 3, 1, 'rare'],
  stormray: ['Baby Dragon', 4, 1, 'epic'], ramhorn: ['Hog Rider', 4, 1, 'rare'],
  sage: ['Executioner', 5, 1, 'epic'], mites: ['Skeleton Army', 3, 15, 'epic'],
  gyrolancer: ['Prince', 5, 1, 'epic'], prismguards: ['Guards', 3, 3, 'epic'],
  sparkwisp: ['Electro Spirit', 1, 1, 'common'], boilerback: ['Giant Skeleton', 6, 1, 'epic'],
  podstrider: ['Golem', 8, 1, 'epic'], thunderhead: ['Balloon', 5, 1, 'epic'],
  coilcrab: ['Electro Dragon', 5, 1, 'epic'], frostsnail: ['Ice Wizard', 3, 1, 'legendary'],
  sunlens: ['Inferno Dragon', 4, 1, 'legendary'], bloomtender: ['Battle Healer', 4, 1, 'rare'],
  gearwright: ['Witch', 5, 1, 'epic'], shardlynx: ['Bandit', 3, 1, 'legendary'],
  titan: ['Mega Knight', 7, 1, 'legendary'], slingtoad: ['Bomber', 2, 1, 'common'],
  drillworm: ['Miner', 3, 1, 'legendary'], sentry: ['Tesla', 4, 1, 'common'],
  nest: ['Goblin Hut', 4, 1, 'rare'], bombard: ['Mortar', 4, 1, 'common'],
  aetherwell: ['Elixir Collector', 6, 1, 'rare'], stasis: ['Freeze', 4, 1, 'epic'],
  jolt: ['Zap', 2, 1, 'common'], overclock: ['Rage', 2, 1, 'epic'],
  blight: ['Poison', 4, 1, 'epic'], maelstrom: ['Tornado', 3, 1, 'epic'],
  rockslide: ['The Log', 2, 1, 'legendary'], seedpod: ['Goblin Barrel', 3, 1, 'epic'],
  skyfork: ['Lightning', 6, 1, 'epic'],
};
export const SPELL_STATS = {
  comet: { damage: 688, crownDamage: 159, knockback: 1 },
  shardstorm: { damage: 122, crownDamage: 25, waves: 3 },
  stasis: { damage: 148, crownDamage: 38, duration: 3.5, radius: 3 },
  jolt: { damage: 192, crownDamage: 48 },
  overclock: { damage: 179, crownDamage: 46, radius: 3, duration: 4.5, haste: .3 },
  blight: { dps: 92, crownDps: 21, tick: 1, duration: 8 },
  maelstrom: { dps: 84 / 1.05, crownDps: 26 / 1.05, tickDamage: 84, crownTickDamage: 26, tick: 1.05, duration: 1.05, radius: 5.5 },
  rockslide: { damage: 268, crownDamage: 35, halfWidth: 1.95, length: 10.1, knockback: .7 },
  seedpod: { unit: 'goblin', count: 3, radius: 1.5 },
  skyfork: { damage: 1057, crownDamage: 265 },
};

const DESCRIPTIONS = {
  glimmers: 'Two fast, tough sword fighters that punish an undefended lane.', zephyrs: 'An armored flying fighter with a heavy single-target attack.',
  stormray: 'A flying dragon that breathes splash damage onto ground and air troops.', ramhorn: 'A fast rider who leaps the river and heads straight for buildings.',
  sage: 'Throws an axe that deals damage on its outward and return hits.', mites: 'Fifteen fragile skeletons surround ground targets.',
  gyrolancer: 'A mounted lancer who charges for a powerful first strike.', prismguards: 'Three spear-wielding skeletons protected by shields.',
  sparkwisp: 'Jumps into battle and chains a stunning shock through up to nine enemies.', boilerback: 'A huge skeleton that leaves a delayed bomb when defeated.',
  podstrider: 'A slow stone tank that splits into two Golemites when destroyed.', thunderhead: 'A skeleton-piloted balloon that bombs buildings and drops a death bomb.',
  coilcrab: 'A flying dragon whose lightning jumps between three enemies.', frostsnail: 'Chilling splash attacks slow ground and air troops.',
  sunlens: 'A flying inferno beam that grows stronger while locked onto one target.', bloomtender: 'A sword fighter who heals nearby allies with each attack.',
  gearwright: 'Summons four Skeletons and fires splash attacks at ground and air.', shardlynx: 'A masked fighter who dashes into distant ground targets.',
  titan: 'An armored brawler with a damaging landing and powerful jumps.', slingtoad: 'A fragile skeleton that throws splash-damage bombs at ground troops.',
  drillworm: 'Tunnels anywhere in the arena. Deals reduced damage to Crown Towers.', sentry: 'An electric defensive building that attacks ground and air.',
  nest: 'Produces Spear Goblins when enemies approach, and one more when destroyed.', bombard: 'Long-range ground artillery with a close-range blind spot.',
  aetherwell: 'Produces extra elixir over its lifetime. Protect it behind your defenses.', stasis: 'Damages and freezes enemies in the target area.',
  jolt: 'Damages and briefly stuns enemies, resetting charges and inferno beams.', overclock: 'Damages enemies on impact and speeds up your nearby army.',
  blight: 'Damages enemies each second for eight seconds and slows troops.', maelstrom: 'Pulls enemy troops together and deals a single pulse of area damage.',
  rockslide: 'A spiked log rolls through ground enemies, damaging and pushing them back.', seedpod: 'Launches three Goblins anywhere in the arena.',
  skyfork: 'Strikes up to three different enemies with the most health inside its radius.',
};

export function level11Units(units) {
  return Object.fromEntries(Object.entries(units).map(([id, u]) => {
    if (!UNIT_STATS[id]) throw new Error(`Missing level 11 stats: ${id}`);
    return [id, { ...u, ...UNIT_STATS[id], level: LEVEL }];
  }));
}
export function level11Cards(cards) {
  return cards.map(c => {
    const r = CARD_STATS[c.id];
    const out = { ...c, level: LEVEL, ...(r ? { name: r[0], cost: r[1], count: r[2], rarity: r[3], desc: DESCRIPTIONS[c.id] } : {}) };
    if (c.spell) {
      out.spell = { ...c.spell, ...SPELL_STATS[c.id] };
      // Compatibility with Desktop AI's spell valuation. Combat uses exact integers.
      out.spell.towerMult = out.spell.damage ? out.spell.crownDamage / out.spell.damage : out.spell.dps ? out.spell.crownDps / out.spell.dps : 0;
    }
    return out;
  });
}
