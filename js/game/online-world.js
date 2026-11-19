import { World } from '../sim/world.js';
import { UNITS } from '../data/cards.js';

// Only the server advances the simulation. The browser reuses World's deployment
// geometry for previews and interpolates between the last two authoritative poses.
const entityFields = ('id type team slot cardId x y z facing hp maxHp shield maxShield active flying state stateTime '
  + 'deployTime deployLeft attackT targetId frozen stunned slowT hasteT lifeLeft lifeMax speedNow charged rampT beam hop').split(' ');

function effectView(effect) {
  return Object.fromEntries(Object.entries(effect).filter(([key]) => !key.startsWith('_') && key !== 'spell'));
}

export function snapshot(world, team) {
  return {
    tick: world.tick, time: world.time, timeLeft: world.timeLeft, phase: world.phase,
    winner: world.winner, endReason: world.endReason,
    players: world.players.map((p, i) => i === team ? p : { stars: p.stars }),
    stats: world.stats, abilities: world.abilities(team),
    entities: world.entities.map(e => entityFields.map(key => e[key])),
    projectiles: world.projectiles.map(effectView), rollers: world.rollers.map(effectView),
    zones: world.zones.map(effectView), pending: world.pending.map(effectView),
  };
}

export class OnlineWorld extends World {
  abilities() { return this.onlineAbilities; }

  apply(frame) {
    const previous = this._map;
    const { entities, abilities, ...state } = frame;
    Object.assign(this, state);
    this.onlineAbilities = abilities;
    this._map = new Map();
    this._structs = [];
    for (const towers of this.towers) for (const tower of Object.values(towers)) tower.alive = false;
    this.entities = entities.map(row => {
      const e = Object.fromEntries(entityFields.map((key, i) => [key, row[i]]));
      e.def = UNITS[e.type];
      e.kind = e.def.kind;
      e.radius = e.def.radius;
      e.alive = true;
      const old = previous.get(e.id);
      e.px = old?.x ?? e.x;
      e.py = old?.y ?? e.y;
      e.pz = old?.z ?? e.z;
      this._map.set(e.id, e);
      if (e.kind !== 'unit') this._structs.push(e);
      if (e.slot) this.towers[e.team][e.slot] = e;
      return e;
    });
  }
}
