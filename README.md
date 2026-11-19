# Crown Clash

A local 3D card battler combining the Desktop Clash simulation and menu with Crown Clash's arena illustration, card portraits and menu character artwork.

## Play

Requires Node.js and an internet connection for the existing Three.js CDN dependency. No install or build step.

Double-click **Play Crown Clash.cmd**, or run `npm start` from this folder and open the printed local URL. ES modules require HTTP; opening index.html directly does not work.

Pick eight of the 123 cards in **Deck**. Drag from the collection into a highlighted slot, or drag two deck cards over each other to swap. On a touchscreen, hold a collection card to lift it. Slot 1 equips an available Evolution, slot 2 equips a Hero or Champion, and slot 3 is Wild. When a Wild card has both forms, use the **Evo / Hero** switch. The deck, Wild choice, tower troop, settings and record save locally.

Tap a card and then a tile, or drag it into place. The outlined square marks the deployment tile and the preview shows each swarm member's starting position. Keys 1–4 select cards and Esc cancels. An Evolution's hand badge counts regular plays until the next deployment evolves. Deploy a Hero or Champion to reveal its ability button above the hand. Destroying a Princess Tower opens its lane's forward deployment pocket. The King Tower awards three crowns.

Choose **Easy**, **Normal**, **Hard**, **Expert** or **Master** under **Rival** before battle. Hard and above can rush the opposite bridge when you spend heavily in one lane. Expert saves elixir when a Princess Tower can handle a lone attacker and sends tanks ahead of surviving ranged defenders. Master also looks for spells that hit a defender and tower together and can combine two spells to finish a tower. Every difficulty uses the same card costs, tower stats and elixir regeneration.

## What's included

- Desktop's physics, bridge navigation, collisions, mass/pushing, AI, abilities, card cycling, elixir and match rules.
- A royal arena lobby with a battle deck preview, eight-card deck builder, card details, filters, cost sorting, difficulty, settings and results.
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

Run `npm test` for simulation, AI, collection, portrait, ability and special-slot checks. Debug URLs support `?autoplay&speed=8&opp=cannon&seed=77`, `?autostart`, `?gallery`, and `?quality=low`.

See `HANDOFF.md` for validation results and remaining limits.
