# Latest update: complete collection (2026-11-17)

186 deck selections (123 base, 45 Evolution, 18 Hero) and four tower troops are implemented locally. 297 automated checks pass. Browser checks confirmed search, all 186 portrait loads, Hero deck replacement/persistence, Cannoneer tower HP and Knight Hero activation. New Champion/Hero models were checked in the gallery without browser warnings or errors. The original saved deck/tower choice was restored after QA.

See COLLECTION-NOTES.md for implementation scope, 14 variant portrait fallbacks and Mirror Evolution's missing reference data. No GitHub commit/push was performed. New runtime modules and PNG files are untracked until the user stages the update; include all of js/, css/ and assets/. Raw downloaded source HTML is ignored; the auditable normalized data ships in js/data/collection-source.js.

---

# Crown Clash handoff

Completed 2026-11-16 in `C:\Users\hankw\Documents\ChatGPT\clash`. The Desktop Clash and source Crown Clash folders were read and copied; they were not edited.

## Delivered

- Desktop movement, collision, bridge navigation, targeting foundation, menus, deck editor, local saving, AI and battle flow.
- 50 real Clash Royale cards with the sourced standard level 11 health/damage snapshot, including shields, towers, spawned units and special attacks.
- Crown Clash arena/menu artwork and royal character/building models.
- Actual Clash Royale card portraits for every card, bundled locally. All 50 images were verified as PNGs; their source URLs and hashes are recorded in `assets/royale-cards/manifest.json`.
- A double-click launcher, `Play Crown Clash.cmd`; alternatively run `npm start`. The live preview used port 5188. Node.js and internet access for the existing Three.js CDN import are required.

## Validation

- `npm test`: 116 passing tests, zero failures. Includes all-card navigation, collision/bridge scenarios, targeting, card cycling, AI fuzz/performance and 20 new level 11 combat checks.
- New combat checks exercise exact Crown Tower damage for all nine damage spells; Fireball/Ice Wizard/Musketeer, Zap/Goblins, Arrows/Guards, Executioner's two hits, Electro Spirit chain count, Battle Healer healing and Golem/Goblin Barrel spawn values.
- Browser: all 50 collection images loaded from `/assets/royale-cards/`; confirmed Knight/Archers/Arrows and the extended collection visually. No console warnings or errors.
- Browser: Knight detail showed level 11, 1,766 HP and 202 damage. Deck swaps and persistence worked. Test deck restored to the starter deck.
- Browser: completed `?autoplay&speed=8&opp=pell&seed=101` after the final stats/art changes: victory 1-0, 24 cards played, 87 elixir spent, no console warnings/errors.
- Earlier browser checks covered narrow/mobile and desktop layouts, manual deployment, hand cycling and another complete match.
- Artwork proof: `screenshots/card-collection.jpg`.

## Maintenance and limits

Balance overrides: `js/data/level11.js`. Source table: `LEVEL11-STATS.md` (regenerate with `node tools/write-stat-reference.mjs`). Original Desktop defaults remain as templates in `js/data/cards.js`; all runtime units are overlaid before freezing. Stable internal IDs preserve saves and animation hooks.

The engine preserves Desktop navigation/collisions and match rules. Full Clash Royale parity is not claimed: Tesla hiding, Bandit dash immunity, building health decay, some healing/projectile timing, hitboxes and overtime differ. The snapshot covers standard cards, not Heroes/Evolutions. Battle models are local approximations; card portraits are the actual game artwork.

The balance snapshot is dated 2026-11-15 and does not update automatically. Community sources can differ on rounding; spell Crown Tower integers follow the documented RoyaleTools snapshot. Check source links before future balance updates.
