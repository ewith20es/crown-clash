import { writeFile } from 'node:fs/promises';
import { CARDS, TOWER_CARDS, UNITS } from '../js/data/cards.js';
import { CARD_ART } from '../js/data/royale-art.js';
let text = `# Level 11 stat snapshot\n\n123 regular cards, 45 Evolutions, 18 Heroes and 4 tower troops. The original 50-card overrides were checked 2026-11-15; the complete public reference was collected 2026-11-17. Applied by js/data/level11.js and js/data/collection.js. See COLLECTION-NOTES.md for ability adaptations. HP and damage are per individual troop. Internal IDs retain Desktop names for saved-deck compatibility.\n\n| Card | Elixir | Count | HP | Damage per hit | Source |\n|---|---:|---:|---:|---:|---|\n`;
for (const c of [...CARDS,...TOWER_CARDS].filter(c => c.unit)) {
  const u = UNITS[c.unit];
  const damage = u.ramp ? u.ramp.mults.map(m => Math.round(u.dmg * m)).join(' / ') : u.dmg;
  text += `| ${c.name} | ${c.cost} | ${c.count} | ${u.hp} | ${damage} | [${c.name}](${c.reference}) |\n`;
}
text += `\n| Spell | Troop/building damage | Crown Tower damage | Source |\n|---|---|---|---|\n`;
for (const c of CARDS.filter(c => c.spell)) {
  const s = c.spell;
  let damage = s.damage ?? '0 (utility/spawn)', crown = s.crownDamage ?? '0 (utility/spawn)';
  if (s.waves) { damage = `${s.damage} x ${s.waves}`; crown = `${s.crownDamage} x ${s.waves}`; }
  if (s.dps) { damage = s.tickDamage ?? `${s.dps}/second for ${s.duration}s`; crown = s.crownTickDamage ?? `${s.crownDps}/second for ${s.duration}s`; }
  if (s.strikes) damage = `${s.damage} per target, up to ${s.strikes} different targets`;
  text += `| ${c.name} | ${damage} | ${crown} | [${c.name}](${c.reference}) |\n`;
}
text += `\n## Other health and damage\n\n- Princess Tower: 3,052 HP, 109 damage; King Tower: 4,824 HP, 109 damage. [Tower Princess](https://liquipedia.net/clashroyale/Tower_Princess), [King Tower](https://liquipedia.net/clashroyale/King_Tower).\n- Guards: 256 shield HP per Guard, separate from 81 body HP.\n- Prince charge: 783; Bandit dash: 389; Mega Knight jump: 537 and deployment: 430.\n- Giant Skeleton death bomb: 688 to troops and Crown Towers. The equal tower multiplier follows the [May 2026 rework](https://supercell.com/en/games/clashroyale/blog/release-notes/may-balance-changes-2026/); the current level 11 amount follows the card table.\n- Golem death: 225; spawns two Golemites, each 1,039 HP / 84 attack / 99 death damage.\n- Balloon death: 240. Ice Wizard deployment: 84. Miner Crown Tower hit: 39.\n- Executioner: 179 per outward/return hit (358 if both connect). Inferno Dragon: 35 / 120 / 422 per beam tick.\n- Witch and Skeleton Army/Skeletons share 81 HP / 81 damage Skeletons. Goblin Hut uses 133 HP / 81 damage Spear Goblins. Goblin Barrel uses three 202 HP / 125 damage Goblins.\n- Battle Healer: 102 healing per attack and 202 on deployment.\n- Tornado uses one 84-damage pulse over its 1.05-second zone.\n\n## Scope\n\nThis is a dated community-source balance snapshot, not an automatically updated Supercell data feed. RoyaleTools is the consistent source for card values, including its displayed rounded Crown Tower damage; other sites may show different rounding or older balance snapshots. Tower values were cross-checked separately. The same integer values drive UI and simulation.\n\nThe Desktop engine is preserved for movement/collision/navigation and general match flow. Ability behavior has been adapted to the counterparts, but hitboxes, timing, Tesla hiding, Bandit dash invulnerability, building HP decay, some healing details and other live-game mechanics are not exact replicas.\n`;
await writeFile(new URL('../LEVEL11-STATS.md', import.meta.url), text);
