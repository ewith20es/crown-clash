// Actual Clash Royale card portraits from RoyaleAPI/cr-api-assets.
// Presentation mapping only: Desktop simulation IDs and saved decks stay stable.
export const LEGACY_CARD_ART = Object.freeze({
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
import { COLLECTION_SOURCE } from './collection-source.js';
import { AVAILABLE_ART } from './available-art.js';
const art = {...LEGACY_CARD_ART};
for (const r of COLLECTION_SOURCE) {
  art[r.slug] = AVAILABLE_ART[r.slug] || r.slug;
  for (const title of Object.keys(r.sections)) {
    const variant = title.endsWith('Evolution') ? 'evolution' : 'hero';
    art[`${r.slug}-${variant}`] = AVAILABLE_ART[`${r.slug}-${variant}`] || art[r.slug];
  }
}
export const CARD_ART = Object.freeze(art);
export function cardArtUrl(id) {
  return CARD_ART[id] ? new URL(`../../assets/royale-cards/${CARD_ART[id]}.png`, import.meta.url).href : '';
}
