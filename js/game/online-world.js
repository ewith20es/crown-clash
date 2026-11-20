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

  apply(frame, alpha = 1) {
    const gap = frame.time - this.time;
    const resetMotion = this.motionTime === undefined || gap > .5 || frame.time - this.motionTime > .65;
    if (resetMotion) {
      this.motionDelay = .15;
      this.motionTime = frame.time - this.motionDelay;
      this.motionRate = 1;
    } else if (gap > 0) {
      // Keep about one or two movement updates in reserve. Absorb late packets
      // by adjusting playback speed gradually, never rewinding a walking troop.
      this.motionDelay = Math.min(.32, Math.max(.15, gap * 1.25, this.motionDelay * .97));
      const error = frame.time - this.motionDelay - this.motionTime;
      this.motionRate = Math.max(.9, Math.min(1.1, 1 + error));
    }
    const previous = this._map;
    const { entities, abilities, ...state } = frame;
    for (const field of ['projectiles', 'rollers']) {
      if (!this[field].length || !state[field].length) continue;
      const byId = new Map(this[field].map(effect => [effect.id, effect]));
      for (const effect of state[field]) {
        const old = byId.get(effect.id);
        if (!old) continue;
        effect.px = old.px + (old.x - old.px) * alpha;
        effect.pz = old.pz + (old.z - old.pz) * alpha;
        if (field === 'projectiles') effect.py = old.py + (old.y - old.py) * alpha;
      }
    }
    Object.assign(this, state);
    this.onlineAbilities = abilities;
    this._map = new Map();
    this._structs.length = 0;
    for (const towers of this.towers) for (const tower of Object.values(towers)) tower.alive = false;
    this.entities = entities.map(row => {
      const old = previous.get(row[0]);
      const e = old || {};
      const px = old && old.px + (old.x - old.px) * alpha;
      const py = old && old.py + (old.y - old.py) * alpha;
      const pz = old && old.pz + (old.z - old.pz) * alpha;
      for (let i = 0; i < entityFields.length; i++) e[entityFields[i]] = row[i];
      e.def = UNITS[e.type];
      e.kind = e.def.kind;
      e.radius = e.def.radius;
      e.alive = true;
      e.px = px ?? e.x;
      e.py = py ?? e.y;
      e.pz = pz ?? e.z;
      if (e.kind === 'unit') {
        const path = e.motionPath ??= [];
        if (resetMotion) path.length = 0;
        const pose = { time: frame.time, x: e.x, y: e.y, z: e.z, facing: e.facing };
        if (path.length && path[path.length - 1].time === frame.time) path[path.length - 1] = pose;
        else path.push(pose);
        // Bound storage even if the tab keeps receiving updates while hidden.
        if (path.length > 16) path.shift();
      }
      this._map.set(e.id, e);
      if (e.kind !== 'unit') this._structs.push(e);
      if (e.slot) this.towers[e.team][e.slot] = e;
      return e;
    });
  }

  updateMovement(dt) {
    if (this.motionTime === undefined) return;
    if (this.time > 0) this.motionTime = Math.min(this.time, this.motionTime + dt * this.motionRate);
    if (this.phase === 'ended') this.motionTime = this.time;
    for (const e of this.entities) {
      const path = e.motionPath;
      if (!path?.length) continue;
      while (path.length > 1 && path[1].time <= this.motionTime) path.shift();
      const a = path[0], b = path[1] ?? a;
      const fraction = b === a ? 0 : Math.max(0, (this.motionTime - a.time) / (b.time - a.time));
      e.drawX = a.x + (b.x - a.x) * fraction;
      e.drawY = a.y + (b.y - a.y) * fraction;
      e.drawZ = a.z + (b.z - a.z) * fraction;
      const turn = b.facing - a.facing;
      const arc = Math.abs(turn) > Math.PI ? turn - Math.sign(turn) * Math.PI * 2 : turn;
      e.drawFacing = a.facing + arc * fraction;
    }
  }
}
