// Difficulty profiles for the opponent AI. All times are seconds, all aether amounts are in
// aether. Ranges are [min, max] and are sampled with the bot's own seeded generator.

const standard = {
  easy: Object.freeze({
    reaction: Object.freeze([2.0, 3.0]),   // delay before a new enemy unit is noticed
    think: Object.freeze([0.5, 0.85]),     // decision cadence
    gap: Object.freeze([2.8, 4.0]),        // minimum time between two plays
    urgentGap: 1,                          // gap multiplier while a tower is being hit
    horizon: 2.0,                          // reacts to units this many seconds from its bank
    defendAt: 1.0,                         // lane deficit that triggers a defensive play
    pushAt: 9.4,                           // elixir at which it starts a push by itself
    supportAt: 6.5,                        // elixir at which it reinforces a push in progress
    leakAt: 9.9,                           // aether at which it must spend
    reserveK: 0,                           // share of the incoming threat kept back when attacking
    lead: 0,                               // how well spells lead moving targets (0..1)
    jitter: 2.0,                           // random placement error in tiles
    wrongCard: 0.4,                        // chance of answering with a random card
    spellValue: 1.6,                       // value-per-cost a spell needs outside emergencies
    spellDef: 1.25,                        // ... and when defending
    laneNoise: 0.6,                        // randomness in lane choice
    tracksAether: false,                   // counts the opponent's aether
    pull: false,                           // places buildings to lure building-hunters
    supportTiming: false,                  // waits for the tank to reach the bridge before supporting
    aggression: 0.8,
    defendChance: 0.5,                     // chance it bothers answering a push at all
  }),
  normal: Object.freeze({
    reaction: Object.freeze([0.8, 1.2]),
    think: Object.freeze([0.3, 0.45]),
    gap: Object.freeze([1.4, 2.0]),
    urgentGap: 0.75,
    horizon: 3.0,
    defendAt: 0.6,
    pushAt: 8.6,
    supportAt: 5.5,
    leakAt: 9.5,
    reserveK: 0.5,
    lead: 0.6,
    jitter: 0.45,
    wrongCard: 0.06,
    spellValue: 1.3,
    spellDef: 1.0,
    laneNoise: 0.2,
    tracksAether: false,
    pull: true,
    supportTiming: true,
    aggression: 1,
    defendChance: 0.9,
  }),
  hard: Object.freeze({
    reaction: Object.freeze([0.35, 0.6]),
    think: Object.freeze([0.18, 0.26]),
    gap: Object.freeze([0.8, 1.2]),
    urgentGap: 0.55,
    horizon: 3.4,
    defendAt: 0.4,
    pushAt: 8,
    supportAt: 5,
    leakAt: 9.4,
    reserveK: 0.8,
    lead: 1,
    jitter: 0,
    wrongCard: 0,
    spellValue: 1.1,
    spellDef: 0.9,
    laneNoise: 0,
    tracksAether: true,
    pull: true,
    supportTiming: true,
    aggression: 1.1,
    defendChance: 1,
  }),
};

const expert = Object.freeze({
  ...standard.hard,
  reaction: Object.freeze([.23, .42]),
  think: Object.freeze([.15, .22]),
  gap: Object.freeze([.65, .95]),
  horizon: 3.3, defendAt: .75, pushAt: 8.8, supportAt: 4,
  punishAt: 5,             // minimum elixir to pressure an opponent who just overspent
  counterpush: true,        // send a frontliner ahead of surviving ranged defenders
  towerCover: true,         // save elixir when the Princess Tower can finish a lone attacker
});

export const PROFILES = Object.freeze({
  ...standard,
  expert,
  master: Object.freeze({
    ...expert,
    reaction: Object.freeze([.14, .28]),
    think: Object.freeze([.12, .18]),
    gap: Object.freeze([.5, .8]),
    horizon: 3.2, defendAt: 1.1, pushAt: 9, supportAt: 3, punishAt: 5.5,
    spellValue: 1.15, spellDef: .85,
    offensiveSpells: true,  // clear defenders or freeze a tower while allies are in range
  }),
});

export const DIFFICULTIES = Object.freeze(Object.keys(PROFILES));
