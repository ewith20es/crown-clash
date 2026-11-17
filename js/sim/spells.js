// Spell resolution, lingering zones and rolling boulders. Every function takes the World.

import { ARENA, teamSign } from '../config.js';

const EPS = 1e-9;

function inArea(e, x, z, radius) {
  const dx = e.x - x;
  const dz = e.z - z;
  return Math.sqrt(dx * dx + dz * dz) - e.radius <= radius;
}

function areaDamage(w, p, s, dmg, knockback) {
  const ents = w.entities;
  for (let i = 0; i < ents.length; i++) {
    const e = ents[i];
    if (!e.alive || e.team === p.team) continue;
    const dx = e.x - p.x;
    const dz = e.z - p.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d - e.radius > s.radius) continue;
    w._damage(e, e.kind === 'tower' ? (s.crownDamage ?? dmg * (s.towerMult ?? 1)) : dmg, p.team, p.cardId);
    if (knockback > 0 && e.kind === 'unit' && e.alive) {
      const k = knockback * Math.max(0, 1 - d / s.radius);
      if (k > 0) w._knockback(e, dx, dz, k, p.team);
    }
  }
}

function impactEvent(w, p, s, wave, waves, duration) {
  w._emit({
    type: 'spellImpact', team: p.team, cardId: p.cardId, kind: s.kind,
    x: p.x, z: p.z, radius: s.radius ?? 0, wave, waves, duration,
  });
}

function addZone(w, p, s) {
  const z = {
    id: w._newId(), kind: s.kind, team: p.team, cardId: p.cardId, x: p.x, z: p.z,
    radius: s.radius, timeLeft: s.duration, duration: s.duration, _acc: 0, _spell: s,
  };
  w.zones.push(z);
  w._emit({ type: 'zone', team: p.team, cardId: p.cardId, kind: s.kind, x: p.x, z: p.z, radius: s.radius, duration: s.duration });
  return z;
}

/** Resolves a due spell. Returns true when it is finished, false when it rescheduled itself. */
export function resolveSpell(w, p) {
  const s = p.spell;
  switch (s.kind) {
    case 'comet':
      areaDamage(w, p, s, s.damage, s.knockback || 0);
      impactEvent(w, p, s, 0, 1, 0);
      return true;
    case 'shardstorm': {
      const waves = Math.max(1, s.waves | 0);
      const wave = p.wave | 0;
      areaDamage(w, p, s, s.damage, 0);
      impactEvent(w, p, s, wave, waves, 0);
      p.wave = wave + 1;
      if (p.wave < waves) { p.timeLeft += Math.max(s.waveGap || 0, 0); return false; }
      return true;
    }
    case 'stasis': {
      areaDamage(w, p, s, s.damage || 0, 0);
      const ents = w.entities;
      for (let i = 0; i < ents.length; i++) {
        const e = ents[i];
        if (e.alive && e.team !== p.team && inArea(e, p.x, p.z, s.radius)) w._freeze(e, s.duration);
      }
      impactEvent(w, p, s, 0, 1, s.duration);
      addZone(w, p, s);
      return true;
    }
    case 'jolt': {
      const ents = w.entities;
      for (let i = 0; i < ents.length; i++) {
        const e = ents[i];
        if (!e.alive || e.team === p.team || !inArea(e, p.x, p.z, s.radius)) continue;
        w._damage(e, e.kind === 'tower' ? (s.crownDamage ?? s.damage * (s.towerMult ?? 1)) : s.damage, p.team, p.cardId);
        if (e.alive && s.stun > 0) w._stun(e, s.stun);
      }
      impactEvent(w, p, s, 0, 1, 0);
      return true;
    }
    case 'overclock':
      areaDamage(w, p, s, s.damage || 0, 0);
      impactEvent(w, p, s, 0, 1, s.duration);
      addZone(w, p, s);
      return true;
    case 'blight':
    case 'maelstrom':
      addZone(w, p, s);
      return true;
    case 'rockslide': {
      const dirZ = -teamSign(p.team);
      const r = {
        id: w._newId(), team: p.team, cardId: p.cardId, x: p.x, z: p.z, px: p.x, pz: p.z, dirZ,
        halfWidth: s.halfWidth, traveled: 0, length: s.length, _speed: s.speed, _spell: s, _hit: new Set(),
      };
      w.rollers.push(r);
      w._emit({ type: 'roll', team: p.team, cardId: p.cardId, x: p.x, z: p.z, dirZ, length: s.length, speed: s.speed, halfWidth: s.halfWidth });
      return true;
    }
    case 'seedpod':
      w._spawnGroup(s.unit, p.team, p.x, p.z, s.count, 0.5, p.cardId, false);
      impactEvent(w, p, s, 0, 1, 0);
      return true;
    case 'skyfork': {
      const cands = [];
      const ents = w.entities;
      for (let i = 0; i < ents.length; i++) {
        const e = ents[i];
        if (e.alive && e.team !== p.team && inArea(e, p.x, p.z, s.radius)) cands.push(e);
      }
      cands.sort((a, b) => (b.hp + b.shield) - (a.hp + a.shield) || a.id - b.id);
      const n = Math.min(cands.length, Math.max(0, s.strikes | 0));
      if (n === 0) {
        w._emit({ type: 'spellImpact', team: p.team, cardId: p.cardId, kind: s.kind, x: p.x, z: p.z, cx: p.x, cz: p.z, radius: s.radius, wave: 0, waves: 0, duration: 0 });
      }
      for (let i = 0; i < n; i++) {
        const v = cands[i];
        w.pending.push({
          kind: 'strike', team: p.team, x: v.x, z: v.z, radius: 0.6, timeLeft: i * (s.strikeGap || 0),
          cardId: p.cardId, targetId: v.id, cx: p.x, cz: p.z, wave: i, waves: n, spell: s,
        });
      }
      return true;
    }
    default:
      return true;
  }
}

/** One skyfork bolt. */
export function resolveStrike(w, p) {
  const s = p.spell;
  const v = w.getEntity(p.targetId);
  if (v && v.alive) {
    p.x = v.x; p.z = v.z;
    w._damage(v, v.kind === 'tower' ? (s.crownDamage ?? s.damage * (s.towerMult ?? 1)) : s.damage, p.team, p.cardId);
    if (v.alive && s.stun > 0) w._stun(v, s.stun);
  }
  w._emit({
    type: 'spellImpact', team: p.team, cardId: p.cardId, kind: s.kind, x: p.x, z: p.z,
    cx: p.cx, cz: p.cz, radius: s.radius, wave: p.wave, waves: p.waves, duration: 0,
  });
}

/** A death blast going off. */
export function resolveFuse(w, p) {
  const b = p.blast;
  const ents = w.entities;
  for (let i = 0; i < ents.length; i++) {
    const e = ents[i];
    if (!e.alive || e.team === p.team) continue;
    const dx = e.x - p.x;
    const dz = e.z - p.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d - e.radius > b.radius) continue;
    w._damage(e, e.kind === 'tower' ? b.dmg * (b.towerMult ?? 1) : b.dmg, p.team, p.sourceType);
    if (e.alive && e.kind === 'unit' && b.knockback > 0) w._knockback(e, dx, dz, b.knockback, p.team);
  }
  w._emit({ type: 'blast', team: p.team, sourceType: p.sourceType, x: p.x, z: p.z, radius: b.radius });
}

export function updateZones(w, dt) {
  const zones = w.zones;
  const ents = w.entities;
  let n = 0;
  for (let zi = 0; zi < zones.length; zi++) {
    const zn = zones[zi];
    const s = zn._spell;
    if (zn.kind === 'overclock') {
      for (let i = 0; i < ents.length; i++) {
        const e = ents[i];
        if (!e.alive || e.team !== zn.team || e.kind === 'tower' || !inArea(e, zn.x, zn.z, zn.radius)) continue;
        e.hastePct = Math.max(e.hasteT > 0 ? e.hastePct : 0, s.haste);
        if (e.hasteT < 0.6) e.hasteT = 0.6;
      }
    } else if (zn.kind === 'blight' || zn.kind === 'maelstrom') {
      if (zn.kind === 'maelstrom' && s.pull > 0) {
        for (let i = 0; i < ents.length; i++) {
          const e = ents[i];
          if (!e.alive || e.team === zn.team || e.kind !== 'unit' || e.hop > 0) continue;
          if (!inArea(e, zn.x, zn.z, zn.radius)) continue;
          const f = Math.min(1, Math.max(0.2, 4 / e.def.mass));
          w._pull(e, zn.x, zn.z, s.pull * dt * f);
        }
      }
      const tick = s.tick > 0 ? s.tick : 0.5;
      zn._acc += dt;
      let guard = 0;
      while (zn._acc >= tick - EPS && guard++ < 8) {
        zn._acc -= tick;
        const amount = s.tickDamage ?? s.dps * tick;
        for (let i = 0; i < ents.length; i++) {
          const e = ents[i];
          if (!e.alive || e.team === zn.team || !inArea(e, zn.x, zn.z, zn.radius)) continue;
          if (s.troopsOnly && e.kind === 'building') continue;
          const dmg = e.kind === 'tower' ? (s.crownTickDamage ?? (s.crownDps !== undefined ? s.crownDps * tick : amount * (s.towerMult ?? 1))) : amount;
          if (dmg > 0) w._damage(e, dmg, zn.team, zn.cardId);
          if (zn.kind === 'blight' && e.alive && s.slow > 0) {
            e.slowPct = Math.max(e.slowT > 0 ? e.slowPct : 0, s.slow);
            e.slowT = Math.max(e.slowT, tick + 0.1);
          }
        }
      }
    }
    zn.timeLeft -= dt;
    if (zn.timeLeft > EPS) zones[n++] = zn;
  }
  zones.length = n;
}

export function updateRollers(w, dt) {
  const rollers = w.rollers;
  const ents = w.entities;
  let n = 0;
  for (let ri = 0; ri < rollers.length; ri++) {
    const r = rollers[ri];
    const s = r._spell;
    r.px = r.x; r.pz = r.z;
    const step = Math.min(r._speed * dt, Math.max(0, r.length - r.traveled));
    r.z += r.dirZ * step;
    r.traveled += step;
    const z0 = Math.min(r.pz, r.z);
    const z1 = Math.max(r.pz, r.z);
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (!e.alive || e.team === r.team || e.flying || r._hit.has(e.id)) continue;
      const pad = 0.6 + e.radius;
      if (Math.abs(e.x - r.x) > r.halfWidth + e.radius) continue;
      if (e.z < z0 - pad || e.z > z1 + pad) continue;
      r._hit.add(e.id);
      w._damage(e, e.kind === 'tower' ? (s.crownDamage ?? s.damage * (s.towerMult ?? 1)) : s.damage, r.team, r.cardId);
      if (e.alive && e.kind === 'unit' && s.knockback > 0) w._knockback(e, 0, r.dirZ, s.knockback, r.team);
      w._emit({ type: 'impact', team: r.team, sourceType: r.cardId, projKind: null, attackFx: 'smash', splash: 0, x: e.x, y: e.y, z: e.z });
    }
    const out = r.z < -ARENA.HALF_L - 0.5 || r.z > ARENA.HALF_L + 0.5;
    if (r.traveled < r.length - EPS && !out && step > 0) rollers[n++] = r;
  }
  rollers.length = n;
}
