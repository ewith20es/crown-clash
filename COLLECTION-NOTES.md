# Full collection update — 2026-11-17

The collection contains 123 base cards, 45 Evolutions, 18 Heroes and four separately selected tower troops. Each eight-card deck holds one card per family. Slot 1 accepts Evolutions, slot 2 accepts Heroes and Champions, and the Wild slot accepts either kind. Regular cards fit anywhere. Older decks migrate when loaded. Extra special forms revert to their base card when available, and excess Champions are replaced by unused starter cards.

The collection shows one card per family. Its filters find every family with the selected form. Dropping a card equips the form supported by its slot, and the Wild slot saves the player's Evo or Hero choice. Hero and Champion abilities appear above the hand after deployment. Each Evolution tracks its own cycle. Mirror and Spirit Empress show their current cost in the hand.

Each deployment targets a whole tile. Skeleton Army, Bats and other swarms use card-specific offsets and deployment timing adapted from [RoyaleSim's replay measurements](https://github.com/RoyaleGym/RoyaleSim/blob/main/crates/royalesim/tests/fixtures/formations/measured.json). The preview and battle share the same formation and terrain limits.

## Data and art

Reference: https://www.royaletools.com/cards (retrieved 2026-11-17; pages show level 11). The normalized, grouped tables are bundled in `js/data/collection-source.js`; `tools/sync-collection.py` reproduces them. Separate child tables prevent, for example, Fire Spirit HP from replacing Furnace HP. Health and ordinary attack damage use the source snapshot. Runtime data and source links are listed in LEVEL11-STATS.md. This is a dated community reference, not a live Supercell API integration.

176 verified official PNG files cover all collection portraits and towers. Sources and checksums are in `assets/royale-cards/manifest.json`. Fourteen variants use their actual base-card portrait plus an EVO/HERO badge because their separate portrait was absent from the public asset mirror: Berserker Hero, Minion Horde Evolution, Elite Barbarians Evolution, Tombstone Hero, Valkyrie Hero, Giant Evolution, Dark Prince Hero, Balloon Hero, Bowler Hero, Electro Giant Evolution, Mirror Evolution, Ice Wizard Hero, Princess Evolution and Electro Wizard Hero. Newly released Ronin and Minion Giant portraits come from the same public stat reference. Other portraits come from RoyaleAPI/cr-api-assets.

## Battle adaptations

All selections can enter battle. Added behaviors include mixed groups, spawned children, Elixir Golem splitting/refunds, Phoenix hatching, contact bursts, secondary attacks, curses, hooks, stealth, piercing shots, Clone, Mirror, Graveyard, Earthquake, Void, Vines, Royal Delivery, abilities and Evolution cycles. Cannoneer, Dagger Duchess and Royal Chef use their own HP/attack values, ammunition/cooking behavior. Existing Desktop movement, collision and timing remain the foundation.

This is not an exact implementation of the live game. Some advanced effects use simplified approximations: shotgun spread uses distance scaling; line effects and Goblinstein's link use local hit areas; Valkyrie Hero's spin stays at its cast point; summons and dives do not reproduce every special animation. Hero Mini P.E.K.K.A uses one temporary level boost rather than the full cooking ladder. Evolved Cannon uses an area barrage; Bomber uses a piercing shot; Electro Dragon uses a bounded chain; some on-hit effects trigger when the attack is launched. Ice Spirit's repeated freezes are represented by an extended freeze, and Evolution Skeleton Army adds a shielded General without its full live-game protection rules. Familiar 3D royal rigs are reused for some creatures and buildings, with new human/Champion profiles and variant accents.

The reference has **no Mirror Evolution stats or ability definition**. That selection currently repeats cards like regular Mirror and states this in its description. Mirror copies stay at level 11 to honor this game's fixed-level setup. These limits are explicit rather than presenting invented values as official behavior.

## Verification

The Node suite covers original regressions, troop navigation from eight deployment points, 40 randomized full matches, roster and art checks, Evolution cycling, all 26 Hero/Champion abilities, legal deck edits, saved-deck migration, mixed groups, Mirror, Clone, Graveyard, Earthquake and tower stats.

## GitHub Pages

Changes are local. Commit and push the updated `js`, `css`, `assets` and documentation to the existing repository to update Pages. No build step or server-side API is required. The new portraits add about 16 MB compared with the original 50-card collection; the bundled portrait set totals about 23 MB.
