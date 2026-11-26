import { World, cycleHand } from '../sim/world.js';
import { UNITS } from '../data/cards.js';
import { MATCH, elixirGain } from '../config.js';

import { entityFields } from './match-codec.js';

// Cover a single late update during a steady walk. Combat and placement always
// use x/y/z from the server; only the renderer reads drawX/drawY/drawZ.
const walkAhead = .10;
const brakeTime = .14;

function walkFraction(time, a, span, walking) {
  if (!span || time <= a.time) return 0;
  const ahead = time - a.time - span;
  if (ahead <= 0) return (time - a.time) / span;
  if (!walking) return 1;
  // Coast briefly, then ease to a stop if the connection stays quiet.
  const brake = Math.max(0, Math.min(brakeTime, ahead - walkAhead));
  const travel = Math.min(walkAhead, ahead) + brake * (1 - brake / (2 * brakeTime));
  return 1 + travel / span;
}

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
  abilities(team) {
    return this.onlineAbilities.map(a => a.ready && this.players[team].aether < a.cost ? { ...a, ready: false } : a);
  }

  spend(team, move) {
    const p = this.players[team];
    this.balance = p.aether = Math.max(0, this.balance - move.cost);
    if (move.card) cycleHand(p, move.handIndex, move.card);
  }

  advanceElixir(time) {
    if (time <= this.elixirTime) return;
    this.balance = Math.min(MATCH.AETHER_MAX, this.balance + elixirGain(time - this.elixirTime, this.elixirPhase));
    this.elixirTime = time;
  }

  syncElixir(packet, pending, rejected) {
    const { team, frame } = packet;
    const raw = frame.players[team];
    // Hand arrays in an unchanged delta still belong to the decoder's baseline.
    const p = { ...raw, hand: raw.hand.slice(), queue: raw.queue.slice(), cycles: { ...raw.cycles } };
    this.players = this.players.slice();
    this.players[team] = p;
    // An acknowledgement includes the paid card. Earlier frames still need
    // every outstanding local spend applied to the server's checkpoint.
    const checkpoint = frame.elixirCheckpoint;
    const reset = !checkpoint || checkpoint !== this.lastCheckpoint || rejected ||
      this.lastSeq !== packet.seq || frame.phase === 'ended' || Math.abs(frame.time - this.elixirTime) > 2;
    if (reset) {
      this.balance = raw.aether;
      this.elixirTime = frame.time;
    } else {
      this.advanceElixir(frame.time);
    }
    this.lastCheckpoint = checkpoint;
    this.lastSeq = packet.seq;
    this.elixirPhase = frame.phase;
    for (const move of pending) {
      if (reset) this.balance = Math.max(0, this.balance - move.cost);
      if (move.card) cycleHand(p, move.handIndex, move.card);
    }
    p.aether = this.balance;
  }

  refillElixir(team) {
    this.advanceElixir(this.time + this.elapsedSinceFrame);
    this.players[team].aether = this.balance;
  }

  apply(frame, alpha = 1) {
    const gap = frame.time - this.time;
    const resetMotion = this.motionTime === undefined || gap > .5 || frame.time - this.motionTime > .65;
    if (resetMotion) {
      this.motionDelay = .12;
      this.motionTime = frame.time - this.motionDelay;
      this.motionRate = 1;
    } else if (gap > 0) {
      // Keep about one or two movement updates in reserve. Absorb late packets
      // by adjusting playback speed gradually, never rewinding a walking troop.
      this.motionDelay = Math.min(.32, Math.max(.085, gap * 1.35, this.elapsedSinceFrame * 1.1, this.motionDelay * .97));
      const error = frame.time - this.motionDelay - this.motionTime;
      this.motionRate = Math.max(.9, Math.min(1.1, 1 + error));
    }
    if (resetMotion || gap > 0 || frame.time === 0) this.elapsedSinceFrame = 0;
    const previous = this._map;
    const { entities, abilities, elixirCheckpoint, ...state } = frame;
    for (const field of ['projectiles', 'rollers']) {
      if (!this[field].length || !state[field].length) continue;
      const byId = new Map(this[field].map(effect => [effect.id, effect]));
      // Decoded deltas may share unchanged effects with the network baseline.
      state[field] = state[field].map(effect => ({ ...effect }));
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
        if (resetMotion) {
          path.length = 0;
          e.correctX = e.correctZ = 0;
          e.reconcile = false;
        } else if (path.length && this.motionTime > path[path.length - 1].time && e.drawX !== undefined) {
          e.reconcile = true;
        }
        const pose = { time: frame.time, x: e.x, y: e.y, z: e.z, facing: e.facing, speed: e.speedNow, walking: e.state === 'move' };
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
    this.elapsedSinceFrame += dt;
    const previousTime = this.motionTime;
    if (this.time > 0) this.motionTime = Math.min(this.time + walkAhead + brakeTime, this.motionTime + dt * this.motionRate);
    if (this.phase === 'ended') this.motionTime = this.time;
    const decay = this.phase === 'ended' ? 0 : Math.exp(-dt * 12);
    for (const e of this.entities) {
      const path = e.motionPath;
      if (!path?.length) continue;
      while (path.length > 2 && path[1].time <= this.motionTime) path.shift();
      const a = path[0], b = path[1] ?? a;
      const span = b.time - a.time;
      const dx = b.x - a.x, dz = b.z - a.z;
      const steadyWalk = span > 0 && a.walking && b.walking && b.speed > 0 &&
        dx * dx + dz * dz <= (span * b.speed * 1.5 + .005) ** 2;
      const fraction = walkFraction(this.motionTime, a, span, steadyWalk);
      const blend = Math.min(1, fraction);
      if (e.reconcile && span) {
        const prev = walkFraction(previousTime, a, span, steadyWalk);
        e.correctX = e.drawX - (a.x + dx * prev);
        e.correctZ = e.drawZ - (a.z + dz * prev);
        e.reconcile = false;
      }
      e.correctX = (e.correctX || 0) * decay;
      e.correctZ = (e.correctZ || 0) * decay;
      e.drawX = a.x + dx * fraction + e.correctX;
      e.drawZ = a.z + dz * fraction + e.correctZ;
      e.drawY = a.y + (b.y - a.y) * blend;
      const stride = a.speed + (b.speed - a.speed) * blend;
      const coast = steadyWalk ? Math.max(0, 1 - Math.max(0, this.motionTime - b.time - walkAhead) / brakeTime) : 0;
      e.drawSpeed = stride * (this.motionTime > b.time ? coast : 1);
      const turn = b.facing - a.facing;
      const arc = Math.abs(turn) > Math.PI ? turn - Math.sign(turn) * Math.PI * 2 : turn;
      e.drawFacing = a.facing + arc * blend;
    }
  }
}
