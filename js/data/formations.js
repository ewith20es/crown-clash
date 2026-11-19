import { formationOffsets, teamSign } from '../config.js';

// Tile distances from RoyaleSim's measured 16.402 deployments, adapted to our arena axes.
// https://github.com/RoyaleGym/RoyaleSim/blob/main/crates/royalesim/tests/fixtures/formations/measured.json
// Left lane of the bottom player, with negative z pointing toward the river.
const rings = {
  skeletons: [.807, 0, -1], guards: [.923, 0, -1], 'spear-goblins': [.923, 0, -1],
  minions: [.577, 0, -1], zappies: [.92, 0, -1],
  bats: [1.405, 45, 1], barbarians: [1.311, 0, 1],
  'minion-horde': [1.341, 180, 1], goblins: [1.08, 135, 1],
};
const shapes = {
  archers: [[.5, 0], [-.5, 0]], 'wall-breakers': [[.75, 0], [-.75, 0]],
  'skeleton-dragons': [[1.5, 0], [-1.5, 0]],
  'three-musketeers': [[0, -1], [1, 1], [-1, 1]],
  'goblin-gang': [[1, -.577], [0, -1.154], [-1, -.577], [-1, .577], [0, 1.154], [1, .577]],
  rascals: [[0, -1.731], [1.223, 1.223], [-1.223, 1.223]],
  goblinstein: [[.6, .8], [-.6, -.8]],
};

export function cardFormation(card, team, dropX) {
  if ((card.count || 1) === 1 && !card.groups?.length) return [{unit: card.unit, x: 0, z: 0, delay: 0}];
  const units = Array(card.count || 1).fill(card.unit);
  for (const group of card.groups || []) units.push(...Array(group.count).fill(group.unit));
  const sign = teamSign(team), lane = dropX * sign > 0 ? -1 : 1;
  const family = card.family;
  const fallback = formationOffsets(card.count || 1);
  return units.map((unit, i) => {
    let x = 0, z = 0;
    if (family === 'skeleton-army') {
      // Fifteen skeletons wind around the tap at repeating radii.
      if (i < 15) {
        const angle = i * Math.PI * 2 / 15;
        const radius = 2.77 * ((i * 3) % 7) / 6;
        x = -Math.sin(angle) * radius;
        z = Math.cos(angle) * radius;
      } else z = .85; // the evolved General
    } else if (shapes[family]?.[i]) {
      [x, z] = shapes[family][i];
    } else if (rings[family]) {
      const [radius, degrees, direction] = rings[family];
      const angle = (degrees + direction * i * 360 / units.length) * Math.PI / 180;
      x = Math.sin(angle) * radius;
      z = -Math.cos(angle) * radius;
    } else if (family === 'royal-hogs' || family === 'royal-recruits') {
      const width = family === 'royal-hogs' ? 3.5 : 15;
      x = width * (i / (units.length - 1) - .5);
    } else if (fallback[i]) {
      ({x, z} = fallback[i]);
    }
    const stagger = family === 'skeleton-army' || family === 'skeletons' ? 0 : family === 'goblins' ? .2 : .1;
    return { unit, x: x * sign * lane, z: z * sign, delay: i * stagger };
  });
}
