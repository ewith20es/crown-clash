# Crown Clash

A local 3D card battler combining the Desktop Clash simulation and menu with Crown Clash's arena illustration, card portraits and menu character artwork.

## Play

Requires Node.js and an internet connection for the existing Three.js CDN dependency. No install or build step.

Double-click **Play Crown Clash.cmd**, or run `npm start` from this folder and open the printed local URL. ES modules require HTTP; opening index.html directly does not work.

Pick eight different cards in **Deck**. Select a collection card, choose **Add to deck**, then select the slot to replace. The deck, tower troop, difficulty, settings and record save locally. Only one form of the same card can occupy the deck. Tap a card and then your side of the arena, or drag a card to deploy. Keys 1–4 select cards; Esc cancels. Spells target either side. Destroying a Princess Tower opens its lane's forward deployment pocket. The King Tower awards three crowns.

## What's included

- Desktop's physics, bridge navigation, collisions, mass/pushing, AI, abilities, card cycling, elixir and match rules.
- Desktop's menu, eight-card deck builder, card details, filters, cost sorting, difficulty, settings and results.
- **186 deck cards: 123 regular cards (including 8 Champions), 45 Evolutions and 18 Heroes**, plus **4 tower troops** selected separately. Search by name and filter Evolutions, Heroes or Champions.
- Level 11 health, shields, attack damage and special damage, including spells, spawned units, Princess Towers and King Towers. The deck builder displays the same values used in battle. See [the sourced stat snapshot](LEVEL11-STATS.md).
- The starter deck is Knight, Archers, Giant, Musketeer, Mini P.E.K.K.A, Skeleton Army, Fireball and Arrows. Stable internal Desktop IDs preserve saved decks.
- Crown Clash arena illustration and menu character art, animated royal troop and castle models, blue/red teams, crowns and purple elixir.
- **Actual Clash Royale portraits throughout the collection**, bundled locally from RoyaleAPI and used in every card view. Startup preloads the PNGs instead of generating replacement portraits.
- Nine AI opponent decks, including three new opponents using the added cards.

This is a local fan game. Health and damage use the referenced level 11 snapshot; the Desktop engine still determines navigation, collisions, targeting, timing and many ability details. It does not reproduce the complete live game's mechanics or online play. In particular, Tesla hiding, Bandit dash immunity, some projectile timings, hitboxes and match overtime differ. Heroes and Champions have ability buttons, and selected Evolutions cycle through regular deployments before evolving. Special mechanics are adaptations; see [collection notes](COLLECTION-NOTES.md), including the pending Mirror Evolution data and shared artwork for 14 variants.

## Sources and maintenance

This project lives in `C:\Users\hankw\Documents\ChatGPT\clash`. The original Desktop and Crown Clash folders were read and copied, not modified.

Simulation: `js/sim/`. Complete roster/reference: `js/data/collection-source.js`, adapted by `js/data/collection.js`. Additional combat effects: `js/sim/collection-mechanics.js`. Authoritative original level 11 overrides: `js/data/level11.js`; Desktop templates and UI stat formatting: `js/data/cards.js`. Models: `js/render/models/royale.js` and `royale-extra.js`. Arena: `js/render/arena.js`. UI: `js/ui/`, `css/style.css`, `css/royale.css`. Artwork mapping: `js/data/royale-art.js`. Asset sources/hashes: `assets/royale-cards/manifest.json`.

Bundled Crown Clash media retains `assets/LICENSE`. This content is not affiliated with, endorsed, sponsored, or specifically approved by Supercell, and Supercell is not responsible for it.

## Validation

Run `npm test` for 297 simulation, AI, collection, portrait and ability checks. Debug URLs support `?autoplay&speed=8&opp=cannon&seed=77`, `?autostart`, `?gallery`, and `?quality=low`.

See `HANDOFF.md` for validation results and remaining limits.
