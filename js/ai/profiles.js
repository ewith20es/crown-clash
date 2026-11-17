// Difficulty profiles for the opponent AI. All times are seconds, all aether amounts are in
// aether. Ranges are [min, max] and are sampled with the bot's own seeded generator.

export const PROFILES = Object.freeze({
  easy: Object.freeze({
    reaction: Object.freeze([2.0, 3.0]),   // delay before a new enemy unit is noticed
    think: Object.freeze([0.5, 0.85]),     // decision cadence
    gap: Object.freeze([2.8, 4.0]),        // minimum time between two plays
    urgentGap: 1,                          // gap multiplier while a tower is being hit
    horizon: 2.0,                          // reacts to units this many seconds from its bank
    defendAt: 1.0,                         // lane deficit that triggers a defensive play
    pushAt: 9.4,                           // aether at which it starts a push by itself
    supportAt: 6.5,                        // aether at which it reinforces a push in progress
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
    pushAt: 8.0,
    supportAt: 5.0,
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
});
