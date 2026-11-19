// Aether Spires — deterministic battle simulation (rules + physics). No DOM, no three.js.

import {
  SIM_DT, ARENA, MATCH, teamSign, enemyOf, towerPosition, deployRects as configDeployRects,
  pointInRects, clampToRects, onBridge, inRift, formationOffsets, clamp, snap,
} from '../config.js';
import { UNITS, CARD_BY_ID, normalizeDeck, specialKind, cardFitsSlot } from '../data/cards.js';
import { cardFormation } from '../data/formations.js';
import { abilityList, activateAbility, updateExtra, beforeAttack, afterHit, extraDeath, damageMultiplier } from './collection-mechanics.js';
import { Rng } from './rng.js';
import { RH, laneHalf, bridgeX, inBand, onLane, sideOf, segmentCrossesRift, angleDiff, wrapAngle } from './nav.js';
import { resolveSpell, resolveStrike, resolveFuse, updateZones, updateRollers } from './spells.js';

const EPS = 1e-9;
const T_EPS = 1e-6;            // tolerance for countdown timers (accumulated float error)
const TURN_RATE = 10;          // rad/s
const POUNCE_REST = 0.8;
const KNOCK_TIME = 0.25;
const HOP_PEAK = 1.1;
const POUNCE_PEAK = 0.9;
const MAX_DASH_TIME = 1.5;
const SLIDE_RANGE = 0.5;       // structures start deflecting walkers this far from contact
const SEP_K = 0.6;             // fraction of an overlap resolved per step
const MOUTH = RH + 0.5;        // bridge waypoints sit this far from the rift centre line
const HW = ARENA.HALF_W;
const HL = ARENA.HALF_L;
const BX = ARENA.BRIDGE_X;
const TWO_PI = Math.PI * 2;
const EMPTY = Object.freeze([]);

function canHit(def, team, t) {
  if (!t.alive || t.team === team || t.invisibleUntil > 0) return false;
  if (def.targets === 'buildings') return t.kind !== 'unit';
  if (def.targets === 'both') return !(def.lob && t.flying);
  return !t.flying;
}

function dist(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

function reach(a, t) { return dist(a, t) - t.radius; }

function aimY(t) { return t.y + t.def.height * 0.55; }

function baseY(e) { return e.flying ? ARENA.FLY_HEIGHT : 0; }

function mkStats() {
  return { damageDealt: 0, aetherSpent: 0, cardsPlayed: 0, unitsLost: 0, towerDamage: 0 };
}

export class World {
  constructor(opts = {}) {
    const o = opts && typeof opts === 'object' ? opts : {};
    this.seed = Number.isFinite(o.seed) ? o.seed : 1;
    this.rng = new Rng(this.seed);

    this.time = 0;
    this.tick = 0;
    this.phase = 'regular';
    this.timeLeft = MATCH.REGULAR_TIME;
    this.winner = null;
    this.endReason = null;

    this.entities = [];
    this.projectiles = [];
    this.zones = [];
    this.rollers = [];
    this.pending = [];
    this.stats = [mkStats(), mkStats()];

    this._map = new Map();
    this._events = [];
    this._nextId = 1;
    this._structs = [];
    this._dead = [];
    this._fallen = [];
    this._struck = [];
    this._wp = { x: 0, z: 0, final: true };
    this._v = { x: 0, z: 0 };
    this._pt = { x: 0, z: 0 };

    const decks = Array.isArray(o.decks) ? o.decks : [];
    this.players = [0, 1].map((team) => {
      const deck = normalizeDeck(decks[team]);
      const order = this.rng.shuffle(deck.slice());
      return {
        team, aether: MATCH.AETHER_START, deck, cycles: {}, lastCard: null,
        hand: order.slice(0, MATCH.HAND_SIZE), next: order[MATCH.HAND_SIZE], queue: order.slice(MATCH.HAND_SIZE + 1), stars: 0,
      };
    });

    this.towers = [0, 1].map((team) => {
      const out = {};
      for (const slot of ['left', 'right', 'citadel']) {
        const p = towerPosition(team, slot);
        const e = this._create(slot === 'citadel' ? 'citadel' : (UNITS[o.towerTroops?.[team]]?.kind === 'tower' ? o.towerTroops[team] : 'spire'), team, p.x, p.z, 0, null, slot);
        if (slot === 'citadel') e.active = false;
        out[slot] = e;
      }
      return out;
    });
  }

  // ───────────────────────────── public API ─────────────────────────────

  getEntity(id) { return this._map.get(id); }

  drainEvents() {
    const ev = this._events;
    this._events = [];
    return ev;
  }

  deployRects(team) {
    const t = team === 1 ? 1 : 0;
    const enemy = this.towers[enemyOf(t)];
    return configDeployRects(t, { left: enemy.left.alive, right: enemy.right.alive });
  }

  abilities(team) { return abilityList(this, team); }
  activateAbility(team, id) { return activateAbility(this, team, id); }
  cardCost(team, card) {
    if (card?.family === 'mirror') return Math.min(10, (CARD_BY_ID[this.players[team].lastCard]?.cost || 0) + 1);
    if (card?.dualForm && this.players[team].aether >= 6) return 6;
    return card?.cost || 0;
  }

  canPlay(team, handIndex, x, z) {
    const res = { ok: false, reason: null, x: 0, z: 0, clamped: false, card: null };
    let rx = Number(x);
    let rz = Number(z);
    if (!Number.isFinite(rx)) rx = 0;
    if (!Number.isFinite(rz)) rz = 0;
    const player = team === 0 || team === 1 ? this.players[team] : null;
    const id = player && Number.isInteger(handIndex) && handIndex >= 0 && handIndex < player.hand.length
      ? player.hand[handIndex] : null;
    const card = (id && CARD_BY_ID[id]) || null;
    res.card = card;
    if (card) {
      let deployment = card;
      if (card.family === 'mirror' && player.lastCard) {
        const previous = CARD_BY_ID[player.lastCard];
        deployment = CARD_BY_ID[previous.baseId || previous.id];
      } else if (card.variant === 'evolution' && (player.cycles[id] || 0) < card.cycles) {
        deployment = CARD_BY_ID[card.baseId];
      }
      if (deployment.dualForm) {
        const form = deployment.dualForm;
        deployment = {...deployment, unit: this.cardCost(team, card) >= 6 ? form.unit : form.ground};
      }
      res.deployment = deployment;
      this._resolveDeployPoint(team, deployment, rx, rz, res);
    } else {
      res.x = clamp(snap(rx), -HW, HW);
      res.z = clamp(snap(rz), -HL, HL);
    }
    if (this.phase === 'ended') res.reason = 'ended';
    else if (!card) res.reason = 'card';
    else if (specialKind(card) !== 'regular' && !cardFitsSlot(id, player.deck.indexOf(id))) res.reason = 'slot';
    else if (card.family === 'mirror' && !player.lastCard) res.reason = 'mirror';
    else if (player.aether + EPS < this.cardCost(team, card)) res.reason = 'aether';
    res.ok = res.reason === null;
    return res;
  }

  playCard(team, handIndex, x, z) {
    const res = this.canPlay(team, handIndex, x, z);
    if (!res.ok) return false;
    const selected = res.card;
    const card = res.deployment;
    const p = this.players[team];
    const cost = this.cardCost(team, selected);
    p.aether = Math.max(0, p.aether - cost);
    if (selected.family !== 'mirror' && selected.rarity !== 'champion') p.lastCard = selected.id;
    if (selected.variant === 'evolution') {
      const count = p.cycles[selected.id] || 0;
      p.cycles[selected.id] = count >= selected.cycles ? 0 : count + 1;
    }
    const played = p.hand[handIndex];
    p.hand[handIndex] = p.next;
    p.next = p.queue.shift();
    p.queue.push(played);
    const st = this.stats[team];
    st.aetherSpent += cost;
    st.cardsPlayed += 1;
    this._emit({ type: 'cardPlayed', team, cardId: card.id, handIndex, x: res.x, z: res.z });

    if (card.type === 'spell') {
      const s = card.spell;
      const delay = Math.max(0, s.delay || 0);
      const radius = s.radius ?? s.halfWidth ?? 0;
      this.pending.push({ kind: s.kind, team, x: res.x, z: res.z, radius, timeLeft: delay, cardId: card.id, delay, spell: s, wave: 0 });
      this._emit({ type: 'spellCast', team, cardId: card.id, kind: s.kind, x: res.x, z: res.z, radius, delay });
      return true;
    }
    const def = UNITS[card.unit];
    if (def.deployAnywhere) {
      const from = towerPosition(team, 'citadel');
      const d = Math.sqrt((res.x - from.x) ** 2 + (res.z - from.z) ** 2);
      const duration = def.tunnelSpeed > 0 ? d / def.tunnelSpeed : 0;
      this.pending.push({
        kind: 'tunnel', team, x: res.x, z: res.z, radius: def.radius, timeLeft: duration, cardId: card.id,
        unit: card.unit, count: card.count, duration, fromX: from.x, fromZ: from.z,
      });
      this._emit({ type: 'tunnel', team, cardId: card.id, fromX: from.x, fromZ: from.z, toX: res.x, toZ: res.z, duration });
      return true;
    }
    for (const member of this.deploymentPositions(card, team, res.x, res.z)) {
      this._spawnAt(member.unit, team, member.x, member.z, UNITS[member.unit].deployTime + member.delay, card.id);
    }
    return true;
  }

  /**
   * Places an entity directly (debug views, tests). deployTime 0 = active at once.
   * Position is clamped into the arena only.
   */
  addEntity(type, team, x, z, opts = {}) {
    if (!UNITS[type]) return null;
    const t = team === 1 ? 1 : 0;
    const def = UNITS[type];
    const r = def.radius;
    const px = clamp(Number.isFinite(x) ? x : 0, -HW + r, HW - r);
    const pz = clamp(Number.isFinite(z) ? z : 0, -HL + r, HL - r);
    const e = this._create(type, t, px, pz, opts.deployTime ?? 0, opts.cardId ?? null, null);
    this._emit({ type: 'spawn', id: e.id, entType: e.type, kind: e.kind, team: t, x: e.x, z: e.z });
    return e;
  }

  step(dt = SIM_DT) {
    if (this.phase === 'ended') return;
    if (!(dt > 0) || !Number.isFinite(dt)) dt = SIM_DT;
    const E = this.entities;

    // 1. previous positions + structure list
    const S = this._structs;
    S.length = 0;
    for (let i = 0; i < E.length; i++) {
      const e = E[i];
      e.px = e.x; e.pz = e.z; e.py = e.y;
      if (e.kind !== 'unit') S.push(e);
    }

    // 2. clocks, aether, phase
    this.time += dt;
    this.tick += 1;
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    if (this.phase === 'regular' && this.timeLeft <= MATCH.SURGE_TIME + T_EPS) {
      this.phase = 'surge';
      this._emit({ type: 'phase', phase: 'surge' });
    }
    const mult = this.phase === 'surge' ? MATCH.SURGE_MULT : this.phase === 'overtime' ? MATCH.OVERTIME_MULT : 1;
    const gain = (dt / MATCH.AETHER_PERIOD) * mult;
    for (let t = 0; t < 2; t++) {
      const p = this.players[t];
      p.aether = Math.min(MATCH.AETHER_MAX, p.aether + gain);
    }

    // 3. pending actions
    this._updatePending(dt);

    // 4. zones and rollers
    updateZones(this, dt);
    updateRollers(this, dt);

    // 5. entities (newborns wait until the next step)
    const n = E.length;
    for (let i = 0; i < n; i++) {
      const e = E[i];
      if (e.alive) this._updateEntity(e, dt);
    }

    // 6. physics
    this._physics(dt);

    // 7. projectiles
    this._updateProjectiles(dt);

    // 8. deaths
    this._cleanup();

    // 9. towers and match flow
    this._matchFlow();
  }

  // ───────────────────────────── internals: creation ─────────────────────────────

  _newId() { return this._nextId++; }

  _emit(ev) { this._events.push(ev); }

  _create(type, team, x, z, deployTime, cardId, slot) {
    const def = UNITS[type];
    const y = def.flying ? ARENA.FLY_HEIGHT : 0;
    const dep = deployTime > 0 ? deployTime : 0;
    const e = {
      bornAt: this.time, id: this._newId(), kind: def.kind, type, def, team, slot: slot ?? null, cardId: cardId ?? null,
      x, z, y, px: x, pz: z, py: y,
      facing: team === 0 ? Math.PI : 0, radius: def.radius, flying: !!def.flying,
      hp: def.hp, maxHp: def.hp, shield: def.shield || 0, maxShield: def.shield || 0, alive: true, active: true,
      state: dep > 0 ? 'deploy' : 'idle', stateTime: 0, deployLeft: dep, deployTime: dep,
      attackT: -1, cooldown: 0, targetId: 0,
      frozen: 0, stunned: 0, slowT: 0, slowPct: 0, hasteT: 0, hastePct: 0,
      lifeLeft: def.lifetime > 0 ? def.lifetime : 0, lifeMax: def.lifetime > 0 ? def.lifetime : 0,
      speedNow: 0, charged: false, chargeDist: 0, rampT: 0, beam: false, hop: 0,
      // internal state (not part of the public contract)
      _kbx: 0, _kbz: 0, _kbT: 0, _bx: x, _bz: z,
      _spawnT: 0, _healT: 0, _genT: 0,
      _pounceT: 99, _dashT: 0, _dash0: 0, _hopZ0: 0, _hopZ1: 0, _bridge: 0, _rampTarget: 0,
      _slideSide: 0, _slideT: 0, _stall: 0, _stallFlip: 0, _ghostT: 0,
    };
    this.entities.push(e);
    this._map.set(e.id, e);
    if (e.kind !== 'unit') this._structs.push(e);
    if (dep <= 0) this._finishDeploy(e);
    return e;
  }

  /** Writes the nearest legal standing point for a body of radius r into this._pt. */
  _legalize(x, z, r, flying, team) {
    const m = Math.max(r, ARENA.EDGE_MARGIN);
    for (let k = 0; k < 4; k++) {
      x = clamp(x, -HW + m, HW - m);
      z = clamp(z, -HL + m, HL - m);
      if (flying) break;
      if (inRift(x, z)) z = (z > 0 ? 1 : z < 0 ? -1 : teamSign(team)) * (RH + 0.02);
      if (!this._pushOut(x, z, r + 0.1)) break;
      x = this._pt.x; z = this._pt.z;
    }
    x = clamp(x, -HW + m, HW - m);
    z = clamp(z, -HL + m, HL - m);
    if (!flying && inRift(x, z)) z = (z > 0 ? 1 : z < 0 ? -1 : teamSign(team)) * (RH + 0.02);
    this._pt.x = x;
    this._pt.z = z;
    return this._pt;
  }

  /** Pushes (x, z) out of every alive structure footprint (+pad). Result in this._pt; returns true if moved. */
  _pushOut(x, z, pad) {
    let moved = false;
    const S = this._structs;
    for (let i = 0; i < S.length; i++) {
      const s = S[i];
      if (!s.alive) continue;
      let dx = x - s.x;
      let dz = z - s.z;
      const min = s.radius + pad;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min) continue;
      let d = Math.sqrt(d2);
      if (d < 1e-6) { dx = 0; dz = s.z > 0 ? -1 : 1; d = 1; }
      x = s.x + (dx / d) * min;
      z = s.z + (dz / d) * min;
      moved = true;
    }
    this._pt.x = x;
    this._pt.z = z;
    return moved;
  }

  _resolveDeployPoint(team, card, rx, rz, res) {
    const def = card.type === 'spell' ? null : UNITS[card.unit];
    const rects = (def ? !def.deployAnywhere : card.spell.ownSide) ? this.deployRects(team) : null;
    const margin = Math.max(.5, def?.radius || 0);
    const maxX = Math.floor(HW - margin), maxZ = Math.floor(HL - margin);
    const sx = snap(rx), sz = snap(rz);
    res.x = clamp(sx, -maxX, maxX);
    res.z = clamp(sz, -maxZ, maxZ);
    const legal = (x, z) => {
      if (rects && !pointInRects(x, z, rects, .5)) return false;
      if (!def) return true;
      if (inRift(x, z) || (def.kind === 'building' && Math.abs(z) < RH + def.radius + .1)) return false;
      return !this._pushOut(x, z, def.radius + .1);
    };
    if (!legal(res.x, res.z)) {
      // Search tile centres, so pushing out of a tower or pocket never leaves a fractional anchor.
      let best = Infinity;
      const tx = clamp(rx, -HW, HW), tz = clamp(rz, -HL, HL);
      const sign = teamSign(team);
      for (let row = -maxZ; row <= maxZ; row++) {
        const z = row * sign || 0;
        for (let col = -maxX; col <= maxX; col++) {
          const x = col * (Math.sign(tx) || sign) || 0;
          const distance = (x - tx) ** 2 + (z - tz) ** 2;
          if (distance < best && legal(x, z)) { best = distance; res.x = x; res.z = z; }
        }
      }
      if (!Number.isFinite(best)) res.reason = 'space';
    }
    res.clamped = res.x !== sx || res.z !== sz;
  }

  deploymentPositions(card, team, x, z) {
    const members = cardFormation(card, team, x);
    const rects = members.length > 1 ? this.deployRects(team) : null;
    for (const member of members) {
      const def = UNITS[member.unit];
      let px = x + member.x, pz = z + member.z;
      if (rects && !def.flying && !def.deployAnywhere && !pointInRects(px, pz, rects)) {
        ({x: px, z: pz} = clampToRects(px, pz, rects));
      }
      const legal = this._legalize(px, pz, def.radius, def.flying, team);
      member.x = legal.x;
      member.z = legal.z;
    }
    return members;
  }

  _spawnAt(type, team, x, z, deployTime, cardId) {
    const e = this._create(type, team, x, z, deployTime, cardId, null);
    this._emit({ type: 'spawn', id: e.id, entType: type, kind: e.kind, team, x: e.x, z: e.z });
    return e;
  }

  _spawnGroup(type, team, x, z, count, deployTime, cardId) {
    const def = UNITS[type];
    if (!def) return [];
    const offs = formationOffsets(Math.max(1, count | 0));
    const sg = team === 0 ? 1 : -1;
    const out = [];
    for (let i = 0; i < offs.length; i++) {
      const p = this._legalize(x + offs[i].x * sg, z + offs[i].z * sg, def.radius, def.flying, team);
      out.push(this._spawnAt(type, team, p.x, p.z, deployTime, cardId));
    }
    return out;
  }

  // ───────────────────────────── internals: pending ─────────────────────────────

  _updatePending(dt) {
    const P = this.pending;
    const n0 = P.length;
    for (let i = 0; i < n0; i++) P[i].timeLeft -= dt;
    let w = 0;
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      let keep = true;
      if (p.timeLeft <= T_EPS && this.phase !== 'ended') {
        if (p.kind === 'tunnel') { this._spawnGroup(p.unit, p.team, p.x, p.z, p.count, 0.5, p.cardId); keep = false; }
        else if (p.kind === 'fuse') { resolveFuse(this, p); keep = false; }
        else if (p.kind === 'strike') { resolveStrike(this, p); keep = false; }
        else keep = !resolveSpell(this, p);
      }
      if (keep) P[w++] = p;
    }
    P.length = w;
  }

  // ───────────────────────────── internals: damage & status ─────────────────────────────

  _damage(v, amount, srcTeam, sourceType) {
    if (!v.alive || !(amount > 0)) return 0;
    amount *= damageMultiplier(this, v);
    if (v.immortalUntil > this.time) amount = Math.min(amount, Math.max(0, v.hp - 1));
    if (!(amount > 0)) return 0;
    let applied;
    if (v.shield > 0) {
      applied = Math.min(amount, v.shield);
      v.shield -= amount;
      if (v.shield <= 0) {
        v.shield = 0;
        if (v.def.shieldBlast) this.pending.push({kind:'fuse',team:v.team,x:v.x,z:v.z,timeLeft:0,blast:v.def.shieldBlast,sourceType:v.type});
        this._emit({ type: 'shieldBreak', id: v.id, team: v.team, x: v.x, y: v.y, z: v.z });
      }
    } else {
      applied = Math.min(amount, v.hp);
      v.hp -= amount;
      if (v.hp < 0) v.hp = 0;
    }
    if (srcTeam === 0 || srcTeam === 1) {
      const st = this.stats[srcTeam];
      st.damageDealt += applied;
      if (v.kind === 'tower') st.towerDamage += applied;
    }
    const fatal = v.hp <= 0;
    this._emit({
      type: 'damage', id: v.id, entType: v.type, kind: v.kind, team: v.team, amount: applied,
      hp: v.hp, shield: v.shield, fatal, x: v.x, y: v.y, z: v.z, source: sourceType ?? null,
    });
    if (v.kind === 'tower' && !v.active) this._wake(v);
    if (fatal) this._kill(v);
    else if (v.def.landOnHit && v.flying) {
      const landing=v.def.landOnHit;
      v.flying=false;v.y=0;v.def={...v.def,flying:false,landing,landOnHit:null};
      const pt=this._legalize(v.x,v.z,v.radius,false,v.team);v.x=pt.x;v.z=pt.z;
      this._landing(v);
    }
    return applied;
  }

  _kill(e) {
    if (!e.alive) return;
    e.alive = false;
    e.hp = 0;
    e.attackT = -1;
    e.beam = false;
  }

  _wake(c) {
    if (c && c.alive && !c.active) {
      c.active = true;
      this._emit({ type: 'citadelWake', team: c.team });
    }
  }

  _disableNow(v) {
    v.attackT = -1;
    v.rampT = 0;
    v.beam = false;
    v._rampTarget = 0;
    v.charged = false;
    v.chargeDist = 0;
    if (v.state === 'dash') this._endDash(v);
  }

  _freeze(v, s) {
    if (!v.alive || !(s > 0)) return;
    v.frozen = Math.max(v.frozen, s);
    this._disableNow(v);
  }

  _stun(v, s) {
    if (!v.alive || !(s > 0)) return;
    v.stunned = Math.max(v.stunned, s);
    this._disableNow(v);
  }

  _slow(v, pct, dur) {
    if (!v.alive || !(dur > 0)) return;
    v.slowPct = Math.max(v.slowT > 0 ? v.slowPct : 0, clamp(pct, 0, 0.95));
    v.slowT = Math.max(v.slowT, dur);
  }

  _knockback(v, dx, dz, D, srcTeam) {
    if (!v.alive || v.kind !== 'unit' || v.hop > 0 || !(D > 0)) return;
    let d = Math.sqrt(dx * dx + dz * dz);
    if (d < 1e-6) { dx = 0; dz = teamSign(v.team); d = 1; }
    const s = clamp(4 / Math.max(0.1, v.def.mass), 0.15, 1);
    v._kbx += (dx / d) * D * s;
    v._kbz += (dz / d) * D * s;
    v._kbT = KNOCK_TIME;
    v.attackT = -1;
    v.chargeDist = 0;
    v.charged = false;
    if (v.state === 'dash') this._endDash(v);
  }

  _pull(e, cx, cz, amount) {
    const dx = cx - e.x;
    const dz = cz - e.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < 1e-6 || !(amount > 0)) return;
    const step = Math.min(amount, d);
    const ox = e.x;
    const oz = e.z;
    e.x += (dx / d) * step;
    e.z += (dz / d) * step;
    this._constrain(e, ox, oz);
  }

  _onHit(v, onHit, fromX, fromZ, srcTeam) {
    if (!onHit || !v.alive) return;
    if (onHit.slow) this._slow(v, onHit.slow.pct, onHit.slow.dur);
    if (onHit.stun) this._stun(v, onHit.stun);
    if (onHit.knockback) this._knockback(v, v.x - fromX, v.z - fromZ, onHit.knockback, srcTeam);
  }

  _hitOne(def, team, v, dmg, fromX, fromZ, sourceType) {
    const amount = Math.round(v.kind === 'tower' ? dmg * def.towerDmgMult : dmg);
    this._damage(v, amount, team, sourceType);
    this._onHit(v, def.onHit, fromX, fromZ, team);
    afterHit(this, def, team, v, sourceType, fromX, fromZ);
  }

  _areaHit(def, team, cx, cz, radius, dmg, fromX, fromZ, sourceType) {
    const E = this.entities;
    for (let i = 0; i < E.length; i++) {
      const c = E[i];
      if (!canHit(def, team, c)) continue;
      const dx = c.x - cx;
      const dz = c.z - cz;
      if (Math.sqrt(dx * dx + dz * dz) - c.radius <= radius) this._hitOne(def, team, c, dmg, fromX, fromZ, sourceType);
    }
  }

  // ───────────────────────────── internals: entity update ─────────────────────────────

  _setState(e, s) {
    if (e.state === s) return;
    if (e.state === 'move' && e.def.charge) { e.chargeDist = 0; e.charged = false; }
    e.state = s;
    e.stateTime = 0;
  }

  _finishDeploy(e) {
    const def = e.def;
    e.deployLeft = 0;
    e.state = 'idle';
    e.stateTime = 0;
    if (def.spawn) e._spawnT = def.spawn.first ?? def.spawn.interval;
    if (def.heal) e._healT = def.heal.interval;
    if (def.generate) e._genT = def.generate.interval;
    if (def.landing) this._landing(e);
    if (def.heal?.spawn) this._healPulse(e, def.heal.spawn);
  }

  _landing(e) {
    const L = e.def.landing;
    const E = this.entities;
    for (let i = 0; i < E.length; i++) {
      const v = E[i];
      if (!v.alive || v.team === e.team || (v.flying && L.targets !== 'both')) continue;
      const dx = v.x - e.x;
      const dz = v.z - e.z;
      if (Math.sqrt(dx * dx + dz * dz) - v.radius > L.radius) continue;
      this._damage(v, v.kind === 'tower' ? L.dmg * e.def.towerDmgMult : L.dmg, e.team, e.type);
      if (v.alive && L.slow) this._slow(v, L.slow.pct, L.slow.dur);
      if (v.alive && v.kind === 'unit' && L.knockback > 0) this._knockback(v, dx, dz, L.knockback, e.team);
    }
    this._emit({ type: 'landing', id: e.id, team: e.team, x: e.x, z: e.z, radius: L.radius });
  }

  _updateEntity(e, dt) {
    updateExtra(this, e, dt);
    if (!e.alive) return;
    const def = e.def;
    e.stateTime += dt;
    if (e.frozen > 0) { e.frozen -= dt; if (e.frozen < 0) e.frozen = 0; }
    if (e.stunned > 0) { e.stunned -= dt; if (e.stunned < 0) e.stunned = 0; }
    if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) { e.slowT = 0; e.slowPct = 0; } }
    if (e.hasteT > 0) { e.hasteT -= dt; if (e.hasteT <= 0) { e.hasteT = 0; e.hastePct = 0; } }
    e._pounceT += dt;
    if (e._ghostT > 0) {
      e._ghostT -= dt;
      if (e._ghostT < 3.7 && !this._touchingStruct(e, null, -0.02)) e._ghostT = 0;
    }
    const disabled = e.frozen > 0 || e.stunned > 0;

    if (e.state === 'deploy') {
      if (!disabled) {
        e.deployLeft -= dt;
        if (e.deployLeft <= T_EPS) this._finishDeploy(e);
      }
      return;
    }
    if (e.lifeMax > 0) {
      e.lifeLeft -= dt;
      if (e.lifeLeft <= T_EPS) { e.lifeLeft = 0; this._kill(e); return; }
    }
    if (disabled) {
      if (e.hop > 0) return;
      if (e.state !== 'idle') this._setState(e, 'idle');
      return;
    }
    if (e.kind === 'tower' && !e.active) return;

    const rate = (e.slowT > 0 ? 1 - e.slowPct : 1) * (e.hasteT > 0 ? 1 + e.hastePct : 1);

    if (def.spawn && (!def.spawn.below || e.hp/e.maxHp <= def.spawn.below) && (!def.spawn.enemyRange || this.entities.some(v => v.alive && v.team !== e.team && Math.hypot(v.x - e.x, v.z - e.z) - v.radius <= def.spawn.enemyRange))) {
      e._spawnT -= dt;
      if (e._spawnT <= T_EPS) {
        this._produce(e);
        e._spawnT += Math.max(0.1, def.spawn.interval);
      }
    }
    if (def.heal && !def.heal.onAttack) {
      e._healT -= dt;
      if (e._healT <= T_EPS) {
        this._healPulse(e);
        e._healT += Math.max(0.1, def.heal.interval);
      }
    }
    if (def.generate) {
      e._genT -= dt;
      if (e._genT <= T_EPS) {
        const p = this.players[e.team];
        p.aether = Math.min(MATCH.AETHER_MAX, p.aether + def.generate.amount);
        this._emit({ type: 'aether', team: e.team, amount: def.generate.amount, x: e.x, z: e.z, id: e.id });
        e._genT += Math.max(0.1, def.generate.interval);
      }
    }

    if (e.kind === 'unit') this._updateUnit(e, dt, rate);
    else this._updateStatic(e, dt, rate);
  }

  _produce(e) {
    const sp = e.def.spawn;
    const ud = UNITS[sp.unit];
    if (!ud) return;
    const count = Math.max(1, sp.count | 0);
    const fwd = -teamSign(e.team);
    const d0 = e.radius + ud.radius + 0.15;
    const gap = ud.radius * 2 + 0.12;
    for (let i = 0; i < count; i++) {
      const lat = (i - (count - 1) / 2) * gap;
      const p = this._legalize(e.x + lat, e.z + fwd * d0, ud.radius, ud.flying, e.team);
      const c = this._create(sp.unit, e.team, p.x, p.z, 0.5, e.cardId, null);
      this._emit({ type: 'spawn', id: c.id, entType: c.type, kind: c.kind, team: c.team, x: c.x, z: c.z });
    }
  }

  _healPulse(e, amount = e.def.heal.amount) {
    const h = e.def.heal;
    const E = this.entities;
    const r2 = h.radius * h.radius;
    let healed = 0;
    for (let i = 0; i < E.length; i++) {
      const a = E[i];
      if ((!e.def.heal.onAttack && a === e) || !a.alive || a.team !== e.team || a.kind !== 'unit') continue;
      const dx = a.x - e.x;
      const dz = a.z - e.z;
      if (dx * dx + dz * dz > r2) continue;
      if (a.hp < a.maxHp) {
        a.hp = Math.min(a.maxHp, a.hp + amount);
        healed++;
      }
    }
    this._emit({ type: 'heal', id: e.id, team: e.team, x: e.x, z: e.z, radius: h.radius, healed });
  }

  _turn(e, vx, vz, dt) {
    if (vx * vx + vz * vz < 1e-12) return;
    const target = Math.atan2(vx, vz);
    const d = angleDiff(e.facing, target);
    const m = TURN_RATE * dt;
    e.facing = wrapAngle(e.facing + (d > m ? m : d < -m ? -m : d));
  }

  _nearest(e, def, unitsOnly, maxReach) {
    const E = this.entities;
    let best = null;
    let bd = Infinity;
    const minR = def.minRange - EPS;
    for (let i = 0; i < E.length; i++) {
      const c = E[i];
      if (unitsOnly && c.kind !== 'unit') continue;
      if (!canHit(def, e.team, c)) continue;
      const r = reach(e, c);
      if (r > maxReach || r < minR) continue;
      if (r < bd) { bd = r; best = c; }
    }
    return best;
  }

  _updateStatic(e, dt, rate) {
    const def = e.def;
    if (!(def.dmg > 0) || !(def.range > 0)) {
      if (e.state !== 'idle') this._setState(e, 'idle');
      return;
    }
    e.cooldown = Math.max(0, e.cooldown - dt * rate);
    let t = e.targetId ? this._map.get(e.targetId) : undefined;
    if (t) {
      if (!canHit(def, e.team, t)) t = undefined;
      else {
        const r = reach(e, t);
        const maxR = e.attackT >= 0 ? def.range * 1.15 : def.range;
        if (r > maxR + EPS || (e.attackT < 0 && r < def.minRange - EPS)) t = undefined;
      }
    }
    if (!t) t = this._nearest(e, def, false, def.range + EPS);
    if (!t) {
      e.targetId = 0;
      e.attackT = -1;
      if (e.state !== 'idle') this._setState(e, 'idle');
      return;
    }
    if (t.id !== e.targetId) { e.targetId = t.id; e.attackT = -1; }
    this._turn(e, t.x - e.x, t.z - e.z, dt);
    this._setState(e, 'attack');
    this._swing(e, t, dt, rate);
  }

  _swing(e, t, dt, rate) {
    const def = e.def;
    if (e.attackT >= 0) {
      e.attackT += dt * rate;
      if (e.attackT >= def.windup - EPS) this._land(e, t);
    } else if (e.cooldown <= EPS) {
      e.attackT = 0;
      this._emit({ type: 'attack', id: e.id, entType: e.type, team: e.team, targetId: t.id, x: e.x, z: e.z });
      if (def.windup <= EPS) this._land(e, t);
    }
  }

  _land(e, t) {
    e.cooldown = Math.max(0, e.def.hitSpeed - e.attackT);
    e.attackT = -1;
    this._landBlow(e, t, 1, false);
  }

  _landBlow(e, t, mult, instant) {
    const def = e.def;
    const extra = beforeAttack(this, e, t, Math.round(def.dmg * mult));
    if (extra.handled) return;
    const dmg = extra.damage;
    if (def.heal?.onAttack) this._healPulse(e);
    if (def.projectile && !instant) { this._shoot(e, t, dmg); return; }
    if (def.kamikaze) {
      if (def.chain) this._chainHit(e, t, dmg);
      else if (def.splash > 0) this._areaHit(def, e.team, t.x, t.z, def.splash, dmg, e.x, e.z, e.type);
      else this._hitOne(def, e.team, t, dmg, e.x, e.z, e.type);
      this._emit({ type: 'impact', team: e.team, sourceType: e.type, projKind: null, attackFx: def.attackFx, splash: def.splash, x: e.x, y: e.y, z: e.z });
      this._kill(e);
      return;
    }
    if (def.chain) { this._chainHit(e, t, dmg); return; }
    if (def.splash > 0) this._areaHit(def, e.team, t.x, t.z, def.splash, dmg, e.x, e.z, e.type);
    else this._hitOne(def, e.team, t, dmg, e.x, e.z, e.type);
    this._emit({
      type: 'impact', team: e.team, sourceType: e.type, projKind: null, attackFx: def.attackFx,
      splash: def.splash, x: t.x, y: t.y + t.def.height * 0.5, z: t.z,
    });
  }

  _chainHit(e, t, dmg) {
    const def = e.def;
    const S = this._struck;
    S.length = 0;
    const points = [{ x: e.x, y: e.y + def.muzzle, z: e.z }];
    const count = Math.max(1, def.chain.count | 0);
    let cur = t;
    for (;;) {
      this._hitOne(def, e.team, cur, dmg, e.x, e.z, e.type);
      S.push(cur);
      points.push({ x: cur.x, y: aimY(cur), z: cur.z });
      this._emit({ type: 'impact', team: e.team, sourceType: e.type, projKind: null, attackFx: def.attackFx, splash: 0, x: cur.x, y: aimY(cur), z: cur.z });
      if (S.length >= count) break;
      const E = this.entities;
      let best = null;
      let bd = Infinity;
      for (let i = 0; i < E.length; i++) {
        const c = E[i];
        if (!canHit(def, e.team, c) || S.indexOf(c) >= 0) continue;
        const d = dist(cur, c) - c.radius;
        if (d <= def.chain.range && d < bd) { bd = d; best = c; }
      }
      if (!best) break;
      cur = best;
    }
    S.length = 0;
    this._emit({ type: 'chain', team: e.team, sourceType: e.type, points });
  }

  _shoot(e, t, dmg) {
    const def = e.def;
    const sy = e.y + def.muzzle;
    const lob = !!def.lob;
    const hd = Math.max(0.1, dist(e, t));
    const p = {
      id: this._newId(), kind: def.projectile, team: e.team, sourceType: e.type,
      x: e.x, y: sy, z: e.z, px: e.x, py: sy, pz: e.z,
      targetId: t.id, tx: t.x, ty: lob ? t.y : aimY(t), tz: t.z, sx: e.x, sy, sz: e.z,
      speed: def.projSpeed, splash: def.splash, lob, progress: 0, alive: true,
      _dmg: dmg, _def: def, _dist: hd, _trav: 0, _arc: lob ? Math.max(1.2, hd * 0.32) : 0,
    };
    if (def.returnHit) {
      const d = Math.hypot(t.x - e.x, t.z - e.z) || 1;
      p.tx = e.x + (t.x - e.x) / d * 7; p.tz = e.z + (t.z - e.z) / d * 7;
      p.ty = sy; p._returning = false; p._struck = new Set();
    }
    this.projectiles.push(p);
    this._emit({ type: 'shoot', id: e.id, entType: e.type, team: e.team, projKind: def.projectile, x: e.x, y: sy, z: e.z, targetId: t.id, projId: p.id });
  }

  _beam(e, t, dt, rate) {
    const def = e.def;
    if (e._rampTarget !== t.id) {
      e.beam = false; e.rampT = 0; e.attackT = -1; e._rampTarget = t.id;
    }
    if (!e.beam) {
      if (e.attackT < 0) {
        e.attackT = 0;
        this._emit({ type: 'attack', id: e.id, entType: e.type, team: e.team, targetId: t.id, x: e.x, z: e.z });
      } else {
        e.attackT += dt * rate;
      }
      if (e.attackT >= def.windup - EPS) {
        e.attackT = -1;
        e.beam = true;
        e.rampT = 0;
        e.cooldown = def.hitSpeed;
        this._beamTick(e, t);
      }
      return;
    }
    e.rampT += dt;
    e.cooldown -= dt * rate;
    if (e.cooldown <= EPS) {
      e.cooldown += def.hitSpeed;
      if (e.cooldown < 0) e.cooldown = 0;
      this._beamTick(e, t);
    }
  }

  _beamTick(e, t) {
    const def = e.def;
    const R = def.ramp;
    let m = 1;
    if (R && R.times && R.mults) {
      for (let i = 0; i < R.times.length; i++) if (e.rampT >= R.times[i] - EPS) m = R.mults[i] ?? m;
    }
    this._hitOne(def, e.team, t, def.dmg * m, e.x, e.z, e.type);
  }

  _resetBeam(e) {
    e.beam = false;
    e.rampT = 0;
    e._rampTarget = 0;
    if (e.attackT >= 0) e.attackT = -1;
  }

  _unitTarget(e) {
    const def = e.def;
    const taunt=this._map.get(e.tauntId);
    if(e.tauntUntil>this.time&&taunt?.alive){e.targetId=taunt.id;return taunt;}
    let cur = e.targetId ? this._map.get(e.targetId) : undefined;
    if (cur && !canHit(def, e.team, cur)) cur = undefined;
    let next = null;
    if (def.targets === 'buildings') {
      if (cur) {
        const r = reach(e, cur);
        if ((r <= def.range + EPS && r >= def.minRange - EPS) || (e.attackT >= 0 && r <= def.range * 1.15)) next = cur;
      }
      if (!next) next = this._nearest(e, def, false, Infinity);
    } else {
      if (cur) {
        const r = reach(e, cur);
        if (r <= def.sight * 1.25) {
          next = cur;
          const engaged = e.attackT >= 0 || e.beam || (r <= def.range + EPS && r >= def.minRange - EPS);
          if (cur.kind !== 'unit' && !engaged) {
            const u = this._nearest(e, def, true, def.sight);
            if (u) next = u;
          }
        }
      }
      if (!next) next = this._nearest(e, def, false, def.sight);
    }
    const id = next ? next.id : 0;
    if (id !== e.targetId) {
      e.targetId = id;
      e.attackT = -1;
    }
    return next;
  }

  _updateUnit(e, dt, rate) {
    const def = e.def;
    if (e.hop > 0) { this._advanceHop(e, dt); return; }
    if (e.state === 'dash') { this._advanceDash(e, dt); return; }
    if (!def.ramp) e.cooldown = Math.max(0, e.cooldown - dt * rate);

    const t = def.dmg > 0 && def.range > 0 ? this._unitTarget(e) : null;
    if (!t) {
      e.targetId = 0;
      e.attackT = -1;
      if (def.ramp) this._resetBeam(e);
      this._march(e, dt, rate);
      return;
    }
    const r = reach(e, t);
    if (!def.ramp && e.attackT >= 0) {
      if (r <= def.range * 1.15 + EPS) {
        this._setState(e, 'attack');
        this._turn(e, t.x - e.x, t.z - e.z, dt);
        this._swing(e, t, dt, rate);
        return;
      }
      e.attackT = -1;
    }
    const keep = def.ramp && (e.beam || e.attackT >= 0) && e._rampTarget === t.id ? 1.15 : 1;
    const inRange = r <= def.range * keep + EPS && r >= def.minRange - EPS;
    if (inRange) {
      if (e.charged && def.charge) {
        e.charged = false;
        e.chargeDist = 0;
        this._emit({ type: 'attack', id: e.id, entType: e.type, team: e.team, targetId: t.id, x: e.x, z: e.z });
        this._setState(e, 'attack');
        this._turn(e, t.x - e.x, t.z - e.z, dt);
        e.attackT = -1;
        e.cooldown = def.hitSpeed;
        this._landBlow(e, t, def.charge.dmgMult, false);
        return;
      }
      this._setState(e, 'attack');
      this._turn(e, t.x - e.x, t.z - e.z, dt);
      if (def.ramp) this._beam(e, t, dt, rate);
      else this._swing(e, t, dt, rate);
      return;
    }
    if (def.ramp) this._resetBeam(e);
    if (def.pounce && this._tryPounce(e, t, r)) return;
    this._moveTo(e, t.x, t.z, t, dt, rate);
  }

  _march(e, dt, rate) {
    const T = this.towers[enemyOf(e.team)];
    let side;
    if (e.x < 0) side = 'left';
    else if (e.x > 0) side = 'right';
    else side = dist(e, T.left) <= dist(e, T.right) ? 'left' : 'right';
    let g = T[side];
    if (!g.alive) g = T.citadel;
    if (!g.alive) { this._setState(e, 'idle'); return; }
    this._moveTo(e, g.x, g.z, g, dt, rate);
  }

  _tryPounce(e, t, r) {
    const pc = e.def.pounce;
    if (e._pounceT < POUNCE_REST || r < pc.min || r > pc.max) return false;
    if (!e.flying && segmentCrossesRift(e.x, e.z, t.x, t.z)) return false;
    this._setState(e, 'dash');
    e._pounceT = 0;
    e._dashT = 0;
    e._dash0 = r;
    e.attackT = -1;
    this._emit({ type: 'pounce', id: e.id, targetId: t.id });
    return true;
  }

  _endDash(e) {
    e.y = baseY(e);
    e.state = 'idle';
    e.stateTime = 0;
  }

  _advanceDash(e, dt) {
    const def = e.def;
    const pc = def.pounce;
    const t = this._map.get(e.targetId);
    e._dashT += dt;
    if (!t || !canHit(def, e.team, t) || e._dashT > MAX_DASH_TIME) { this._endDash(e); return; }
    const r = reach(e, t);
    if (r <= def.range + EPS) {
      this._endDash(e);
      this._setState(e, 'attack');
      e.attackT = -1;
      e.cooldown = def.hitSpeed;
      this._landBlow(e, t, pc.dmgMult, true);
      return;
    }
    const dx = t.x - e.x;
    const dz = t.z - e.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < 1e-6) { this._endDash(e); return; }
    const step = Math.min(pc.speed * dt, Math.max(0.02, r - def.range * 0.6));
    const ox = e.x;
    const oz = e.z;
    e.x += (dx / d) * step;
    e.z += (dz / d) * step;
    this._constrain(e, ox, oz);
    const mx = e.x - ox;
    const mz = e.z - oz;
    if (mx * mx + mz * mz < step * step * 0.09) { this._endDash(e); return; }
    const span = Math.max(0.05, e._dash0 - def.range);
    const p = clamp(1 - (reach(e, t) - def.range) / span, 0, 1);
    e.y = baseY(e) + POUNCE_PEAK * Math.sin(Math.PI * p);
    this._turn(e, dx, dz, dt);
  }

  _startHop(e) {
    const s = sideOf(e.z);
    e.hop = 0.001;
    e._hopZ0 = e.z;
    e._hopZ1 = -s * (RH + 0.05);
    this._setState(e, 'move');
    this._emit({ type: 'hop', id: e.id });
  }

  _advanceHop(e, dt) {
    const sp = Math.max(e.def.speed * 1.6, 3);
    const z0 = e._hopZ0;
    const z1 = e._hopZ1;
    const dir = z1 > z0 ? 1 : -1;
    const total = Math.abs(z1 - z0);
    e.z += dir * sp * dt;
    const done = dir > 0 ? e.z >= z1 : e.z <= z1;
    if (done || total < 1e-6) {
      e.z = z1;
      e.hop = 0;
      e.y = baseY(e);
    } else {
      e.hop = clamp(Math.abs(e.z - z0) / total, 0.001, 0.999);
      e.y = baseY(e) + HOP_PEAK * Math.sin(Math.PI * e.hop);
    }
    if (e.state !== 'move') { e.state = 'move'; e.stateTime = 0; }
    this._turn(e, 0, dir, dt);
  }

  _pickBridge(e, gx, gz, su) {
    const nz = su * MOUTH;
    const fz = -su * MOUTH;
    let cl = Math.hypot(e.x + BX, e.z - nz) + Math.hypot(gx + BX, gz - fz);
    let cr = Math.hypot(e.x - BX, e.z - nz) + Math.hypot(gx - BX, gz - fz);
    if (e._bridge === -BX) cl -= 0.3;
    else if (e._bridge === BX) cr -= 0.3;
    e._bridge = cl <= cr ? -BX : BX;
    return e._bridge;
  }

  /** Next waypoint toward (gx, gz) for e, written into this._wp. */
  _route(e, gx, gz) {
    const wp = this._wp;
    wp.x = gx; wp.z = gz; wp.final = true;
    if (e.flying || e.def.leap) return wp;
    const su = sideOf(e.z);
    const sg = sideOf(gz);
    const w = laneHalf(e.radius);
    if (su === 0) {
      const bx = bridgeX(e.x);
      if (sg === 0) {
        if (Math.abs(gx - bx) <= 2.5) return wp;
        wp.x = bx; wp.z = (e.z >= 0 ? 1 : -1) * MOUTH; wp.final = false;
        return wp;
      }
      const zExit = sg * RH;
      const tt = (zExit - e.z) / (gz - e.z);
      const xExit = e.x + (gx - e.x) * tt;
      if (Math.abs(xExit - bx) <= w) return wp;
      wp.x = bx; wp.z = sg * MOUTH; wp.final = false;
      return wp;
    }
    if (sg === su) return wp;
    if (sg === 0) {
      if (!onBridge(gx)) return wp;
      const bx = bridgeX(gx);
      if (Math.abs(e.x - bx) <= w && Math.abs(e.z) <= MOUTH + 0.4) return wp;
      wp.x = bx; wp.z = su * MOUTH; wp.final = false;
      return wp;
    }
    const b = this._pickBridge(e, gx, gz, su);
    const nearZ = su * MOUTH;
    const ddx = e.x - b;
    const ddz = e.z - nearZ;
    wp.x = b;
    wp.final = false;
    if ((Math.abs(ddx) <= w && Math.abs(e.z) <= MOUTH + 0.4) || ddx * ddx + ddz * ddz < 0.36) wp.z = -su * MOUTH;
    else wp.z = nearZ;
    return wp;
  }

  /** True when e is within pad of an alive structure other than `except`. */
  _touchingStruct(e, except, pad = 0.15) {
    const S = this._structs;
    for (let i = 0; i < S.length; i++) {
      const s = S[i];
      if (!s.alive || s === except) continue;
      const dx = s.x - e.x;
      const dz = s.z - e.z;
      const m = s.radius + e.radius + pad;
      if (dx * dx + dz * dz < m * m) return true;
    }
    return false;
  }

  /** True when stepping from e along (tx, tz) runs into the rift bank or the arena edge. */
  _blockedDir(e, tx, tz) {
    const r = e.radius;
    const px = e.x + tx * (r + 0.5);
    const pz = e.z + tz * (r + 0.5);
    if (inBand(pz) && !onLane(px, r)) return true;
    return px < -HW + r || px > HW - r || pz < -HL + r || pz > HL - r;
  }

  /**
   * Steers (vx, vz) around structures; result in this._v. While sliding, a unit keeps one
   * rotational sense (e._slideSide) so it follows the outline of touching structures instead of
   * oscillating in the notch between them; the sense flips when it would run into the bank or
   * the arena edge, or when the unit stalls (see _moveTo).
   */
  _avoid(e, vx, vz, goal) {
    const S = this._structs;
    let ax = vx;
    let az = vz;
    for (let i = 0; i < S.length; i++) {
      const s = S[i];
      if (!s.alive || s === goal) continue;
      const dx = s.x - e.x;
      const dz = s.z - e.z;
      const lim = s.radius + e.radius + SLIDE_RANGE;
      const d2 = dx * dx + dz * dz;
      if (d2 >= lim * lim || d2 < 1e-12) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const nz = dz / d;
      const dot = ax * nx + az * nz;
      if (dot <= 0) continue;
      if (e._slideSide === 0) {
        const sg = (ax - dot * nx) * -nz + (az - dot * nz) * nx;
        e._slideSide = sg > 1e-3 ? 1 : sg < -1e-3 ? -1 : (e.id & 1 ? -1 : 1);
      }
      let tx = -nz * e._slideSide;
      let tz = nx * e._slideSide;
      if (this._blockedDir(e, tx, tz) && !this._blockedDir(e, -tx, -tz)) {
        e._slideSide = -e._slideSide;
        tx = -tx; tz = -tz;
      }
      e._slideT = 0;
      const k = clamp((lim - d) / SLIDE_RANGE, 0, 1);
      ax = ax * (1 - k) + tx * k;
      az = az * (1 - k) + tz * k;
      const al = Math.sqrt(ax * ax + az * az);
      if (al < 1e-6) { ax = tx; az = tz; } else { ax /= al; az /= al; }
    }
    this._v.x = ax;
    this._v.z = az;
  }

  _moveTo(e, gx, gz, goal, dt, rate) {
    const def = e.def;
    const speed = def.speed * rate * (e.charged && def.charge ? def.charge.speedMult : 1);
    if (!(speed > 0)) { this._setState(e, 'idle'); return; }
    const wp = this._route(e, gx, gz);
    const dx = wp.x - e.x;
    const dz = wp.z - e.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < 1e-6) { this._setState(e, 'idle'); return; }
    let vx = dx / d;
    let vz = dz / d;
    if (!e.flying && e._ghostT <= 0) {
      e._slideT += dt;
      if (e._slideT > 0.6) e._slideSide = 0;
      this._avoid(e, vx, vz, goal);
      vx = this._v.x; vz = this._v.z;
    }
    let step = speed * dt;
    if (wp.final && step > d) step = d;
    const nx = e.x + vx * step;
    const nz = e.z + vz * step;
    if (def.leap && !e.flying) {
      const su = sideOf(e.z);
      if (su !== 0 && sideOf(gz) === -su && inBand(nz) && !onLane(nx, e.radius)) { this._startHop(e); return; }
    }
    const ox = e.x;
    const oz = e.z;
    const wasMoving = e.state === 'move' && e.stateTime > 0.2 && step >= speed * dt * 0.99;
    e.x = nx;
    e.z = nz;
    this._constrain(e, ox, oz);
    this._setState(e, 'move');
    this._turn(e, vx, vz, dt);
    const mx = e.x - ox;
    const mz = e.z - oz;
    const moved = Math.sqrt(mx * mx + mz * mz);
    // Stall handling: first try the other way around the obstacle; a unit still wedged against
    // a structure after that (enclosed pocket) briefly walks through structures to escape.
    if (moved < step * 0.25 || (wasMoving && e.speedNow < speed * 0.25)) {
      e._stall += dt;
      if (e._stall > 1.6 && !e.flying && e._ghostT <= 0 && this._touchingStruct(e, goal)) {
        e._ghostT = 4;
        e._stall = 0;
        e._stallFlip = 0;
      } else if (e._stall - e._stallFlip > 0.5) {
        e._stallFlip = e._stall;
        if (e._slideSide !== 0) { e._slideSide = -e._slideSide; e._slideT = 0; }
      }
    } else {
      e._stall = 0;
      e._stallFlip = 0;
    }
    if (def.charge) {
      e.chargeDist += moved;
      if (!e.charged && e.chargeDist >= def.charge.dist) {
        e.charged = true;
        this._emit({ type: 'charge', id: e.id });
      }
    }
  }

  // ───────────────────────────── internals: physics ─────────────────────────────

  _riftFix(e, ox, oz) {
    if (inBand(e.z)) {
      if (inBand(oz)) {
        const bx = bridgeX(ox);
        const w = laneHalf(e.radius);
        if (Math.abs(ox - bx) <= w + 0.6) e.x = clamp(e.x, bx - w, bx + w);
        else e.z = oz >= 0 ? RH : -RH;
      } else if (!onLane(e.x, e.radius)) {
        e.z = oz > 0 ? RH : -RH;
      }
    } else if (!onLane(e.x, e.radius) && ((oz >= RH && e.z <= -RH) || (oz <= -RH && e.z >= RH))) {
      e.z = oz > 0 ? RH : -RH;
    }
  }

  /** Enforces structures, rift and arena on e after a displacement from (ox, oz). */
  _constrain(e, ox, oz) {
    const r = e.radius;
    if (!e.flying && e.hop === 0) {
      const S = e._ghostT > 0 ? EMPTY : this._structs;
      for (let i = 0; i < S.length; i++) {
        const s = S[i];
        if (!s.alive) continue;
        let dx = e.x - s.x;
        let dz = e.z - s.z;
        const min = s.radius + r;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min) continue;
        let d = Math.sqrt(d2);
        if (d < 1e-6) {
          dx = ox - s.x; dz = oz - s.z;
          d = Math.sqrt(dx * dx + dz * dz);
          if (d < 1e-6) { dx = 0; dz = s.z > 0 ? -1 : 1; d = 1; }
        }
        e.x = s.x + (dx / d) * min;
        e.z = s.z + (dz / d) * min;
      }
      this._riftFix(e, ox, oz);
    }
    const hx = HW - r;
    const hz = HL - r;
    if (e.x < -hx) e.x = -hx; else if (e.x > hx) e.x = hx;
    if (e.z < -hz) e.z = -hz; else if (e.z > hz) e.z = hz;
  }

  _physics(dt) {
    const E = this.entities;
    const n = E.length;
    for (let i = 0; i < n; i++) {
      const e = E[i];
      if (!e.alive || e.kind !== 'unit') continue;
      e._bx = e.x;
      e._bz = e.z;
      if (e._kbT > 0) {
        if (e.hop > 0) { e._kbT = 0; e._kbx = 0; e._kbz = 0; continue; }
        const f = Math.min(1, dt / e._kbT);
        e.x += e._kbx * f;
        e.z += e._kbz * f;
        e._kbx *= 1 - f;
        e._kbz *= 1 - f;
        e._kbT -= dt;
        if (e._kbT <= EPS) { e._kbT = 0; e._kbx = 0; e._kbz = 0; }
      }
    }
    for (let i = 0; i < n; i++) {
      const a = E[i];
      if (!a.alive || a.kind !== 'unit' || a.hop > 0 || a.state === 'dash') continue;
      const ra = a.radius;
      const fa = a.flying;
      const ma = Math.max(0.1, a.def.mass) * (a.attackT >= 0 || a.beam ? 4 : 1);
      for (let j = i + 1; j < n; j++) {
        const b = E[j];
        if (!b.alive || b.kind !== 'unit' || b.flying !== fa || b.hop > 0 || b.state === 'dash') continue;
        let dx = b.x - a.x;
        let dz = b.z - a.z;
        const min = ra + b.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min) continue;
        let d = Math.sqrt(d2);
        if (d < 1e-6) {
          const ang = this.rng.next() * TWO_PI;
          dx = Math.sin(ang); dz = Math.cos(ang); d = 0;
        } else {
          dx /= d; dz /= d;
        }
        const mb = Math.max(0.1, b.def.mass) * (b.attackT >= 0 || b.beam ? 4 : 1);
        const ia = 1 / ma;
        const ib = 1 / mb;
        const push = (min - d) * SEP_K / (ia + ib);
        a.x -= dx * push * ia;
        a.z -= dz * push * ia;
        b.x += dx * push * ib;
        b.z += dz * push * ib;
      }
    }
    const inv = dt > 0 ? 1 / dt : 0;
    for (let i = 0; i < n; i++) {
      const e = E[i];
      if (!e.alive || e.kind !== 'unit') continue;
      if (e.x !== e._bx || e.z !== e._bz) this._constrain(e, e._bx, e._bz);
      const mx = e.x - e.px;
      const mz = e.z - e.pz;
      e.speedNow = Math.sqrt(mx * mx + mz * mz) * inv;
    }
  }

  // ───────────────────────────── internals: projectiles ─────────────────────────────

  _updateProjectiles(dt) {
    const P = this.projectiles;
    let w = 0;
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      p.px = p.x; p.py = p.y; p.pz = p.z;
      if (p._def.returnHit) {
        this._updateReturningProjectile(p, dt);
        if (p.alive) P[w++] = p;
        continue;
      }
      if (p.lob) {
        p.progress += p.speed > 0 ? (p.speed * dt) / p._dist : 1;
        if (p.progress >= 1 - EPS) {
          p.progress = 1;
          p.x = p.tx; p.y = p.ty; p.z = p.tz;
          this._projHit(p);
          p.alive = false;
        } else {
          const q = p.progress;
          p.x = p.sx + (p.tx - p.sx) * q;
          p.z = p.sz + (p.tz - p.sz) * q;
          p.y = p.sy + (p.ty - p.sy) * q + p._arc * 4 * q * (1 - q);
        }
      } else {
        const t = this._map.get(p.targetId);
        if (t && t.alive) { p.tx = t.x; p.ty = aimY(t); p.tz = t.z; }
        const dx = p.tx - p.x;
        const dy = p.ty - p.y;
        const dz = p.tz - p.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const step = p.speed * dt;
        if (!(p.speed > 0) || d <= step) {
          p.x = p.tx; p.y = p.ty; p.z = p.tz;
          p.progress = 1;
          this._projHit(p);
          p.alive = false;
        } else {
          p.x += (dx / d) * step;
          p.y += (dy / d) * step;
          p.z += (dz / d) * step;
          p._trav += step;
          p.progress = p._trav / (p._trav + d - step);
        }
      }
      if (p.alive) P[w++] = p;
    }
    P.length = w;
  }

  // Executioner's axe sweeps each enemy once on each leg, including air units.
  _updateReturningProjectile(p, dt) {
    const dx = p.tx - p.x, dz = p.tz - p.z;
    const d = Math.hypot(dx, dz), step = Math.min(d, p.speed * dt);
    const ox = p.x, oz = p.z;
    if (d > EPS) { p.x += dx / d * step; p.z += dz / d * step; }
    const vx = p.x - ox, vz = p.z - oz, len2 = vx * vx + vz * vz;
    for (const e of this.entities) {
      if (!canHit(p._def, p.team, e) || p._struck.has(e.id)) continue;
      const q = len2 > EPS ? Math.max(0, Math.min(1, ((e.x - ox) * vx + (e.z - oz) * vz) / len2)) : 0;
      if (Math.hypot(e.x - ox - vx * q, e.z - oz - vz * q) > p.splash + e.radius) continue;
      p._struck.add(e.id);
      this._hitOne(p._def, p.team, e, p._dmg, p.sx, p.sz, p.sourceType);
      this._emit({ type: 'impact', team: p.team, sourceType: p.sourceType, projKind: p.kind, attackFx: p._def.attackFx, splash: 0, x: e.x, y: e.y, z: e.z });
    }
    if (d <= step + EPS) {
      if (p._returning) p.alive = false;
      else { p._returning = true; p._struck.clear(); p.tx = p.sx; p.tz = p.sz; }
    }
  }

  _projHit(p) {
    const def = p._def;
    if (p.splash > 0 || p.lob) {
      this._areaHit(def, p.team, p.tx, p.tz, Math.max(p.splash, 0.3), p._dmg, p.sx, p.sz, p.sourceType);
    } else {
      const t = this._map.get(p.targetId);
      if (t && t.alive && t.team !== p.team) this._hitOne(def, p.team, t, p._dmg, p.sx, p.sz, p.sourceType);
    }
    this._emit({
      type: 'impact', team: p.team, sourceType: p.sourceType, projKind: p.kind, attackFx: def.attackFx,
      splash: p.splash, x: p.x, y: p.y, z: p.z,
    });
  }

  // ───────────────────────────── internals: deaths & match flow ─────────────────────────────

  _cleanup() {
    const E = this.entities;
    const dead = this._dead;
    dead.length = 0;
    let w = 0;
    for (let i = 0; i < E.length; i++) {
      const e = E[i];
      if (e.alive) E[w++] = e;
      else dead.push(e);
    }
    E.length = w;
    for (let i = 0; i < dead.length; i++) {
      const e = dead[i];
      const def = e.def;
      this._map.delete(e.id);
      e.speedNow = 0;
      this._emit({ type: 'death', id: e.id, entType: e.type, kind: e.kind, team: e.team, x: e.x, y: e.y, z: e.z, radius: e.radius });
      extraDeath(this, e);
      if (e.kind === 'unit') this.stats[e.team].unitsLost += 1;
      if (e.kind === 'tower') this._fallen.push(e);
      if (def.deathSpawn && def.deathSpawn.count > 0) {
        this._spawnGroup(def.deathSpawn.unit, e.team, e.x, e.z, def.deathSpawn.count, 0.4, e.cardId);
      }
      if (def.deathBlast) {
        const b = def.deathBlast;
        this.pending.push({
          kind: 'fuse', team: e.team, x: e.x, z: e.z, radius: b.radius, timeLeft: Math.max(0, b.delay || 0),
          cardId: e.cardId, sourceType: e.type, blast: b,
        });
        this._emit({ type: 'fuse', team: e.team, sourceType: e.type, x: e.x, z: e.z, radius: b.radius, delay: b.delay || 0 });
      }
    }
    dead.length = 0;
  }

  _end(winner, reason) {
    this.phase = 'ended';
    this.winner = winner;
    this.endReason = reason;
    this._emit({ type: 'end', winner, stars: [this.players[0].stars, this.players[1].stars], reason });
  }

  _matchFlow() {
    const F = this._fallen;
    const P = this.players;
    for (let i = 0; i < F.length && this.phase !== 'ended'; i++) {
      const t = F[i];
      const owner = t.team;
      const atk = enemyOf(owner);
      if (t.slot === 'citadel') P[atk].stars = MATCH.STARS_TO_WIN;
      else {
        P[atk].stars = Math.min(MATCH.STARS_TO_WIN, P[atk].stars + 1);
        this._wake(this.towers[owner].citadel);
      }
      this._emit({ type: 'towerDown', team: owner, slot: t.slot, id: t.id, x: t.x, z: t.z, stars: [P[0].stars, P[1].stars] });
      if (this.phase === 'overtime') this._end(atk, 'suddenDeath');
      else if (t.slot === 'citadel') this._end(atk, 'citadel');
    }
    F.length = 0;
    if (this.phase === 'ended') return;
    if (this.timeLeft <= T_EPS) {
      if (this.phase === 'overtime') {
        const m0 = this._lowestTowerHp(0);
        const m1 = this._lowestTowerHp(1);
        if (m0 < m1) this._end(1, 'tiebreak');
        else if (m1 < m0) this._end(0, 'tiebreak');
        else this._end('draw', 'draw');
      } else if (P[0].stars !== P[1].stars) {
        this._end(P[0].stars > P[1].stars ? 0 : 1, 'stars');
      } else {
        this.phase = 'overtime';
        this.timeLeft = MATCH.OVERTIME;
        this._emit({ type: 'phase', phase: 'overtime' });
      }
    }
  }

  _lowestTowerHp(team) {
    let m = Infinity;
    const T = this.towers[team];
    for (const slot of ['left', 'right', 'citadel']) {
      const t = T[slot];
      if (t.alive && t.hp < m) m = t.hp;
    }
    return m === Infinity ? 0 : m;
  }
}
