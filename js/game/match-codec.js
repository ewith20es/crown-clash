import { SIM_DT } from '../config.js';

// Shared with the original full-snapshot format.
export const entityFields = ('id type team slot cardId x y z facing hp maxHp shield maxShield active flying state stateTime '
  + 'deployTime deployLeft attackT targetId frozen stunned slowT hasteT lifeLeft lifeMax speedNow charged rampT beam hop').split(' ');
const x = entityFields.indexOf('x'), facing = entityFields.indexOf('facing');
const stateTime = entityFields.indexOf('stateTime');
const poseScale = 512;
const visualTimers = new Set(['attackT', 'deployLeft', 'lifeLeft', 'speedNow', 'rampT', 'hop'].map(k => entityFields.indexOf(k)));

// Combat payloads, projectile hit lists and spell definitions stay on the server.
const effectFields = {
  projectiles: 'id kind team x y z px py pz alive'.split(' '),
  rollers: 'id x z px pz halfWidth traveled dirZ'.split(' '),
  zones: 'kind team x z radius duration timeLeft'.split(' '),
  pending: 'kind team x z radius duration delay timeLeft fromX fromZ targetId cardId'.split(' '),
};

function effects(world, key) {
  return world[key].map(effect => {
    const view = {};
    for (const name of effectFields[key]) {
      const v = effect[name];
      if (v !== undefined) view[name] = typeof v === 'number' ? Math.round(v * 1000) / 1000 : v;
    }
    if (effect.blast) view.blast = { delay: effect.blast.delay };
    if (effect.spell?.evolution) view.spell = { evolution: effect.spell.evolution };
    return view;
  });
}

// Impact, spawn and trail coordinates are display-only. Keep damage, health,
// command IDs and results at their original precision.
function eventView(event) {
  const copy = { ...event };
  for (const key of ['x', 'y', 'z', 'cx', 'cz', 'fromX', 'fromZ', 'toX', 'toZ']) {
    if (typeof copy[key] === 'number') copy[key] = Math.round(copy[key] * 1000) / 1000;
  }
  if (copy.points) copy.points = copy.points.map(eventView);
  return copy;
}

function encodeEntity(e, tick) {
  return entityFields.map((key, i) => {
    const value = e[key] ?? null;
    if (i >= x && i <= facing) return Math.round(value * poseScale);
    // The start tick stays constant while a troop walks or a tower idles.
    if (i === stateTime) return tick - Math.round(value / SIM_DT);
    if (visualTimers.has(i)) return Math.round(value * 1000);
    return value;
  });
}

function decodeEntity(row, tick) {
  const result = row.slice();
  for (let i = x; i <= facing; i++) result[i] /= poseScale;
  result[stateTime] = (tick - row[stateTime]) * SIM_DT;
  for (const i of visualTimers) result[i] /= 1000;
  return result;
}

// A zero baseline carries a complete replacement. Positive IDs carry a field
// mask (zero for a spawn), negative IDs remove an entity.
export function encodeUpdate(world, team, meta, serial, before) {
  const tick = world.tick;
  const rows = new Map();
  const changes = [];
  for (const e of world.entities) {
    const row = encodeEntity(e, tick);
    rows.set(e.id, row);
    const old = before?.rows.get(e.id);
    if (!old) {
      changes.push([e.id, 0, ...row.slice(1)]);
      continue;
    }
    let mask = 0;
    const values = [];
    for (let i = 1; i < row.length; i++) {
      if (old[i] === row[i]) continue;
      mask |= 1 << (i - 1);
      values.push(i >= x && i <= facing ? row[i] - old[i] : row[i]);
    }
    if (mask) changes.push([e.id, mask, ...values]);
  }
  if (before) for (const id of before.rows.keys()) if (!rows.has(id)) changes.push(-id);

  const p = world.players[team];
  const parts = [team, meta.live, meta.seq, meta.accepted ?? false, meta.cursor,
    world.phase, world.winner, world.endReason, tick + Math.round(world.timeLeft / SIM_DT),
    p.deck, [p.hand, p.next, p.queue, p.lastCard, p.cycles], p.aether, world.players.map(v => v.stars),
    world.stats, world.abilities(team), ...Object.keys(effectFields).map(key => effects(world, key))];
  // Mutable world objects must never become the baseline by reference.
  const signatures = parts.map(v => typeof v === 'object' && v !== null ? JSON.stringify(v) : v);
  let mask = 0;
  const values = [];
  for (let i = 0; i < parts.length; i++) {
    if (before && signatures[i] === before.signatures[i]) continue;
    mask |= 1 << i;
    values.push(parts[i]);
  }
  const wire = [before?.serial ?? 0, serial, tick, changes, mask, ...values];
  if (meta.events.length) wire.push(meta.events.map(eventView));
  return { wire, baseline: { serial, rows, signatures } };
}

export function decodeUpdate(wire, before) {
  const [base, serial, tick, changes, mask] = wire;
  if (base && base !== before?.serial) throw new Error('Missing arena update.');
  const rows = base ? new Map(before.rows) : new Map();
  for (const patch of changes) {
    if (typeof patch === 'number') { rows.delete(-patch); continue; }
    const [id, fields] = patch;
    if (!fields) { rows.set(id, [id, ...patch.slice(2)]); continue; }
    const row = rows.get(id).slice();
    let at = 2;
    for (let i = 1; i < row.length; i++) {
      if (fields & (1 << (i - 1))) {
        const v = patch[at++];
        row[i] = i >= x && i <= facing ? row[i] + v : v;
      }
    }
    rows.set(id, row);
  }
  const parts = base ? before.parts.slice() : [];
  let at = 5;
  for (let bits = mask, i = 0; bits; bits >>>= 1, i++) {
    if (bits & 1) parts[i] = wire[at++];
  }
  const [team, live, seq, accepted, cursor, phase, winner, endReason, endTick, deck,
    [hand, next, queue, lastCard, cycles], aether, stars, stats, abilities, projectiles, rollers, zones, pending] = parts;
  const players = stars.map(s => ({ stars: s }));
  Object.assign(players[team], { team, deck, hand, next, queue, lastCard, cycles, aether });
  const frame = { tick, time: tick * SIM_DT, timeLeft: (endTick - tick) * SIM_DT, phase, winner, endReason,
    entities: Array.from(rows.values(), row => decodeEntity(row, tick)), players, stats, abilities,
    projectiles, rollers, zones, pending };
  return { packet: { status: 'match', team, live, seq, accepted, cursor, events: wire[at] ?? [], frame },
    baseline: { serial, rows, parts } };
}
