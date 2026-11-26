import { teamSign, clamp } from '../config.js';
import { CARD_INFO, UNIT_TRAITS } from './cardinfo.js';

// The same player-relative encoding is used for the rival, headless games and human moves.
// Only visible pieces and the acting player's resources are read.
export function readBoard(world, team) {
  const sign = teamSign(team);
  const lanes = [-1, 1].map(side => {
    const slot = side < 0 ? 'left' : 'right';
    const health = t => {
      const tower = world.towers[t][slot];
      return tower.alive ? tower.hp / tower.maxHp : 0;
    };
    return { own: health(team), enemy: health(1-team), push: 0, threat: 0, air: 0, back: 0 };
  });
  for (const e of world.entities) {
    if (!e.alive || e.kind === 'tower') continue;
    const lane = lanes[Number(e.x >= 0)];
    const worth = (UNIT_TRAITS[e.type]?.value ?? .5) * Math.min(1, e.hp / e.maxHp) / 8;
    if (e.team === team) lane.push += worth * clamp(1 - sign*e.z/18, .2, 1);
    else {
      const near = clamp(1 + sign*e.z/9, 0, 1);
      lane.threat += worth * near;
      lane.back += worth * (1-near);
      if (e.flying) lane.air += worth * near;
    }
  }
  return { lanes, sign, elixir: world.players[team].aether/10, late: Number(world.phase !== 'regular') };
}

export const INPUTS = 27;
export function actionFeatures(board, card, cost = 0, x = 0, z = 0) {
  const info = CARD_INFO[card?.id];
  const side = Number(x >= 0);
  const lane = board.lanes[side], other = board.lanes[1-side];
  const depth = z * board.sign / 15;
  const wait = !info;
  const threat = wait ? Math.max(lane.threat, other.threat) : lane.threat;
  return [Number(wait), board.elixir, board.late, cost/10, depth, Math.abs(x)/9,
    Number(!!info?.spell), Number(!!info?.tank), Number(!!info?.siege), Number(!!info?.ranged),
    Number(!!info?.hitsAir), Number(!!info?.splash), Number(!!info?.swarm), Number(!!info?.building),
    Number(!!info?.anywhere), Math.min(1, threat), Math.min(1, lane.air), Math.min(1, lane.push),
    Math.min(1, other.threat), Math.min(1, lane.back), Math.min(1, other.back),
    lane.enemy, lane.own, other.enemy, Number(!!info?.tankKiller),
    Number(!!info?.fastSiege), Math.min(1, (info?.T?.dps || 0) * (info?.count || 1) / 500)];
}
