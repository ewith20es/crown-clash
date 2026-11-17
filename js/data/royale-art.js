// Actual Clash Royale card portraits from RoyaleAPI/cr-api-assets.
// Presentation mapping only: Desktop simulation IDs and saved decks stay stable.
export const CARD_ART = Object.freeze({
  warden: 'knight', scouts: 'archers', colossus: 'giant',
  longshot: 'musketeer', breaker: 'mini-pekka', mites: 'skeleton-army',
  comet: 'fireball', shardstorm: 'arrows',
  skeletons: 'skeletons', goblins: 'goblins', speargoblins: 'spear-goblins',
  barbarians: 'barbarians', minions: 'minions', minionhorde: 'minion-horde',
  bats: 'bats', wizard: 'wizard', valkyrie: 'valkyrie', royalgiant: 'royal-giant',
  glimmers: 'elite-barbarians', zephyrs: 'mega-minion', stormray: 'baby-dragon',
  ramhorn: 'hog-rider', sage: 'executioner', gyrolancer: 'prince',
  prismguards: 'guards', sparkwisp: 'electro-spirit', boilerback: 'giant-skeleton',
  podstrider: 'golem', thunderhead: 'balloon', coilcrab: 'electro-dragon',
  frostsnail: 'ice-wizard', sunlens: 'inferno-dragon', bloomtender: 'battle-healer',
  gearwright: 'witch', shardlynx: 'bandit', titan: 'mega-knight',
  slingtoad: 'bomber', drillworm: 'miner', sentry: 'tesla', nest: 'goblin-hut',
  bombard: 'mortar', aetherwell: 'elixir-collector', stasis: 'freeze', jolt: 'zap',
  overclock: 'rage', blight: 'poison', maelstrom: 'tornado', rockslide: 'the-log',
  seedpod: 'goblin-barrel', skyfork: 'lightning',
});
export function cardArtUrl(id) {
  return CARD_ART[id] ? new URL(`../../assets/royale-cards/${CARD_ART[id]}.png`, import.meta.url).href : '';
}
