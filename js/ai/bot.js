// Aether Spires — the opponent AI. Reads only the public World API, decides on a seeded schedule
// with a human-like reaction delay, and plays through world.playCard like a player would.
//
//   defence   per lane, weighs the incoming threat (air / swarm / heavy / building-hunters)
//             against its own defenders and answers with the best-fitting card in hand
//   offence   builds pushes from the back when it has aether to spare, supports its tank as it
//             nears the bridge, sends fast siege units at an undefended lane, finishes low towers
//             with spells and drops deploy-anywhere cards on the enemy backline
//   economy   never sits at full aether for long; keeps a reserve against the opponent's push
import { CARD_BY_ID } from '../data/cards.js';
import { ARENA, SIM_DT, teamSign, towerPosition, enemyOf, snap, clamp } from '../config.js';
import { CARD_INFO, UNIT_TRAITS } from './cardinfo.js';
import { PROFILES } from './profiles.js';

function mulberry32(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LANES = [-1, 1];

function newLaneStat() {
  return { threat: 0, defense: 0, air: 0, swarm: 0, heavy: 0, siege: 0, ground: 0, front: null, frontDepth: -99, units: [] };
}

export class Bot {
  constructor(world, team, opts = {}) {
    this.world = world;
    this.team = team;
    this.foe = enemyOf(team);
    this.s = teamSign(team);              // +1: my half is +z
    this.p = PROFILES[opts.difficulty] || PROFILES.normal;
    this.rand = mulberry32((opts.seed | 0) * 2654435761 + team * 97 + 13);
    this.thinkT = 1.2 + this.rand();       // a beat before the first decision
    this.lastPlay = -99;
    this.seen = new Map();                 // enemy entity id → time it becomes "noticed"
    this.lanes = [newLaneStat(), newLaneStat()];
    this.pushLane = this.rand() < 0.5 ? -1 : 1;
  }

  range(r) { return r[0] + (r[1] - r[0]) * this.rand(); }

  /** Called once per simulation step, before world.step. */
  update(dt) {
    const w = this.world;
    if (!w || w.phase === 'ended') return;
    this.thinkT -= dt;
    if (this.thinkT > 0) return;
    this.thinkT = this.range(this.p.think);
    for(const a of w.abilities(this.team))if(a.ready&&w.entities.some(e=>e.alive&&e.team!==this.team&&e.kind==='unit'&&Math.hypot(e.x-w.getEntity(a.id).x,e.z-w.getEntity(a.id).z)<6)) {w.activateAbility(this.team,a.id);break;}
    try { this.think(); } catch (err) {
      if (!this.warned) { this.warned = true; console.warn('[bot] think failed', err); }
    }
  }

  // ───────────────────────────── perception ─────────────────────────────

  depth(z) { return z * this.s; }                 // > 0 on my half, larger = closer to my citadel

  perceive() {
    const w = this.world;
    const now = w.time;
    const L = this.lanes;
    for (const l of L) {
      l.threat = 0; l.defense = 0; l.air = 0; l.swarm = 0; l.heavy = 0; l.siege = 0; l.ground = 0;
      l.front = null; l.frontDepth = -99; l.units.length = 0;
    }
    const alive = new Set();
    for (const e of w.entities) {
      if (e.kind === 'tower') continue;
      const T = UNIT_TRAITS[e.type];
      if (!T) continue;
      const lane = e.x < 0 ? L[0] : L[1];
      const hpf = e.maxHp > 0 ? (e.hp + (e.shield || 0)) / (e.maxHp + (e.maxShield || 0)) : 1;
      const d = this.depth(e.z);
      if (e.team === this.team) {
        if (e.kind === 'unit' && T.attacksUnits && d > -3) lane.defense += T.value * hpf;
        if (e.kind === 'building' && e.def.dmg > 0) { L[0].defense += T.value * 0.5 * hpf; L[1].defense += T.value * 0.5 * hpf; }
        continue;
      }
      alive.add(e.id);
      if (!this.seen.has(e.id)) this.seen.set(e.id, now + this.range(this.p.reaction));
      if (now < this.seen.get(e.id)) continue;
      // incoming if on my half or close enough to reach it soon
      const reach = 1 + (e.def.speed || 0) * this.p.horizon;
      const bombardThreat = e.kind === 'building' && e.def.minRange > 0;
      if (d < -reach && !bombardThreat) continue;
      const v = T.value * hpf;
      lane.threat += v;
      lane.units.push(e);
      if (T.flying) lane.air += v; else lane.ground += v;
      if (T.light) lane.swarm += v;
      if (T.heavy) lane.heavy += v;
      if (T.siege) lane.siege += v;
      if (d > lane.frontDepth) { lane.frontDepth = d; lane.front = e; }
    }
    for (const id of this.seen.keys()) if (!alive.has(id)) this.seen.delete(id);
  }

  towerHp(team, slot) {
    const t = this.world.towers[team][slot];
    return t && t.alive !== false ? t.hp : 0;
  }

  // ───────────────────────────── decisions ─────────────────────────────

  think() {
    const w = this.world;
    const me = w.players[this.team];
    const now = w.time;
    this.perceive();

    const urgent = this.lanes.some((l) => l.frontDepth > 5 && l.threat > 0.5);
    let gap = this.range(this.p.gap) * (urgent ? this.p.urgentGap : 1);
    if (w.phase !== 'regular') gap *= 0.8;
    if (now - this.lastPlay < gap) return;

    const aether = me.aether;
    const hand = me.hand;

    // 1. defence: the lane with the worst deficit
    let worst = -1, worstDef = this.p.defendAt;
    for (let i = 0; i < 2; i++) {
      const l = this.lanes[i];
      const deficit = l.threat - l.defense * 0.85;
      if (deficit > worstDef) { worstDef = deficit; worst = i; }
    }
    if (worst >= 0 && this.rand() < (this.p.defendChance ?? 1) && this.defend(worst, hand, aether)) return;

    // 2. finish a low tower with a spell
    if (this.finisher(hand, aether)) return;

    // 3. value spells on enemy clusters anywhere
    if (this.valueSpell(hand, aether, this.p.spellValue)) return;

    // 4. offence: support a push in progress, start one, or spend before leaking
    const leaking = aether >= this.p.leakAt;
    const surge = w.phase !== 'regular';
    if (this.support(hand, aether, leaking)) return;
    // hard reads the opponent's aether: punish an over-commitment with a push on the other lane
    const foeAether = this.p.tracksAether ? w.players[this.foe].aether : 5;
    const punish = foeAether < 3 && aether >= 6;
    if (aether >= this.p.pushAt - (surge ? 1.5 : 0) * this.p.aggression || leaking || punish) {
      this.attack(hand, aether, leaking);
    }
  }

  affordable(hand, aether) {
    const out = [];
    for (let i = 0; i < hand.length; i++) {
      const c = CARD_BY_ID[hand[i]];
      if (c && c.cost <= aether + 1e-6) out.push(i);
    }
    return out;
  }

  play(index, x, z) {
    const w = this.world;
    const jit = this.p.jitter;
    if (jit > 0) { x += (this.rand() * 2 - 1) * jit; z += (this.rand() * 2 - 1) * jit; }
    const ok = w.playCard(this.team, index, x, z);
    if (ok) this.lastPlay = w.time;
    return ok;
  }

  // ── defence ──

  defend(laneIdx, hand, aether) {
    const lane = this.lanes[laneIdx];
    const laneSign = LANES[laneIdx];
    const opts = this.affordable(hand, aether);
    if (!opts.length) return false;

    // a spell may be the best answer to a cluster
    if (this.valueSpell(hand, aether, this.p.spellDef, lane)) return true;

    let best = -1, bestScore = 0.4;
    for (const i of opts) {
      const info = CARD_INFO[hand[i]];
      if (!info || info.type === 'spell' || info.pod) continue;
      let sc = this.defenseScore(info, lane);
      if (this.rand() < this.p.wrongCard) sc = this.rand() * 2;
      if (sc > bestScore) { bestScore = sc; best = i; }
    }
    if (best < 0) return false;
    const info = CARD_INFO[hand[best]];
    const pos = this.defensePos(info, lane, laneSign);
    return this.play(best, pos.x, pos.z);
  }

  defenseScore(info, lane) {
    if (info.siege || info.economy || info.anywhere) return -1;
    const t = lane.threat || 1;
    let sc = info.baseDef;
    const airShare = lane.air / t, swarmShare = lane.swarm / t, heavyShare = lane.heavy / t, siegeShare = lane.siege / t;
    if (airShare > 0.3) sc += info.hitsAir ? 1.4 * airShare : -2.5 * airShare;
    if (swarmShare > 0.3) sc += info.splash ? 1.2 * swarmShare : (info.fragile ? -0.4 : 0);
    if (heavyShare > 0.3) sc += (info.tankKiller ? 1.3 : 0) + (info.swarm && !info.flying ? 0.6 : 0) + (info.lowDps ? -0.6 : 0);
    if (siegeShare > 0.3 && info.building && this.p.pull) sc += 1.1 * siegeShare;
    if (info.kamikaze) sc += swarmShare * 0.5 + 0.2;
    // cost should roughly match the threat; overpaying a lot is poor value
    sc -= Math.max(0, info.cost - t - 1.5) * 0.25;
    if (info.tank && heavyShare < 0.2) sc -= 0.4;
    return sc;
  }

  defensePos(info, lane, laneSign) {
    const s = this.s;
    const f = lane.front;
    if (info.building) {
      // between the lanes, in front of the citadel: lures building-hunters into tower range
      return { x: laneSign * 1.5, z: s * 5.5 };
    }
    if (!f) return { x: laneSign * 5, z: s * 7 };
    const d = this.depth(f.z);
    if (info.ranged) {
      // behind the line of contact, inside tower cover
      const dz = Math.min(11, Math.max(d + 3, 6.5));
      return { x: f.x * 0.6 + laneSign * 1.5, z: s * dz };
    }
    // melee: straight into the path, between the attacker and my towers
    const dz = Math.min(10.5, Math.max(d + 1.2, 2));
    return { x: f.x, z: s * dz };
  }

  // ── spells ──

  /** Best spell target among enemy entities (optionally a single lane's threat). */
  bestSpellTarget(info, lane) {
    const w = this.world;
    const spell = info.spell;
    if (!spell) return null;
    const r = spell.radius || spell.halfWidth || 2;
    let best = null, bestVal = 0;
    const lead = this.p.lead * (spell.delay || 0);
    const enemies = w.entities.filter(e => e.alive && e.team === this.foe).map(e => {
      const dt = e.state === 'move' ? lead / SIM_DT : 0;
      return {e, x: e.x + (e.x - e.px) * dt, z: e.z + (e.z - e.pz) * dt};
    });
    for (const c of enemies) {
      if (c.e.kind === 'tower' || (lane && !lane.units.includes(c.e))) continue;
      const cx = clamp(snap(c.x), 1 - ARENA.HALF_W, ARENA.HALF_W - 1);
      const cz = clamp(snap(c.z), 1 - ARENA.HALF_L, ARENA.HALF_L - 1);
      let val = 0, n = 0;
      for (const target of enemies) {
        const e = target.e;
        const dx = target.x - cx, dz = target.z - cz;
        if (Math.hypot(dx, dz) - e.radius > r) continue;
        const T = UNIT_TRAITS[e.type];
        if (e.kind === 'tower') { val += this.towerValue(info, e); continue; }
        if (!T) continue;
        if (spell.kind === 'rockslide' && T.flying) continue;
        const hpf = e.maxHp > 0 ? e.hp / e.maxHp : 1;
        const dmg = (spell.damage || (spell.dps || 0) * (spell.duration || 0)) * (spell.waves || spell.strikes || 1);
        // value = share of the unit's worth this spell removes (control spells count half)
        const share = dmg > 0 ? Math.min(1, dmg / Math.max(1, e.hp + (e.shield || 0))) : 0.5;
        val += T.value * hpf * share;
        n++;
      }
      if (n === 0) continue;
      if (val > bestVal) { bestVal = val; best = { x: cx, z: cz, value: val }; }
    }
    return best;
  }

  towerValue(info, tower) {
    // chip damage on a healthy tower is a waste early on; it matters once a tower is low or late
    const late = this.world.phase !== 'regular';
    if (!late && tower.hp > tower.maxHp * 0.45) return 0;
    const s = info.spell;
    const dmg = (s.damage || 0) * (s.towerMult || 0) * (s.waves || 1);
    return tower.maxHp > 0 ? (dmg / tower.maxHp) * 5 : 0;
  }

  valueSpell(hand, aether, need, lane) {
    for (const i of this.affordable(hand, aether)) {
      const info = CARD_INFO[hand[i]];
      if (!info || !info.spell) continue;
      const k = info.spell.kind;
      if (k === 'overclock') continue;             // buffs are played with pushes
      if ((k === 'stasis' || k === 'maelstrom') && !lane) continue;
      const t = this.bestSpellTarget(info, lane);
      if (!t) continue;
      if (t.value / info.cost >= need) {
        if (k === 'rockslide') return this.play(i, t.x, this.s * Math.min(14, Math.max(2, this.depth(t.z) + 3)));
        return this.play(i, t.x, t.z);
      }
    }
    return false;
  }

  finisher(hand, aether) {
    for (const i of this.affordable(hand, aether)) {
      const info = CARD_INFO[hand[i]];
      if (!info || !info.spell || !info.spell.damage) continue;
      const s = info.spell;
      const dmg = s.damage * (s.towerMult || 0) * (s.waves || 1);
      for (const slot of ['left', 'right', 'citadel']) {
        const t = this.world.towers[this.foe][slot];
        if (!t || t.alive === false) continue;
        if (t.hp <= dmg) return this.play(i, t.x, t.z);
      }
    }
    return false;
  }

  // ── offence ──

  chooseLane() {
    const w = this.world;
    const foe = this.foe;
    const hl = this.towerHp(foe, 'left'), hr = this.towerHp(foe, 'right');
    // a fallen spire opens the way to the citadel on that side
    if (hl <= 0 && hr > 0) return -1;
    if (hr <= 0 && hl > 0) return 1;
    // otherwise the lane with the weaker spire, with a little noise
    const noise = (this.rand() - 0.5) * 2000 * this.p.laneNoise;
    const lane = hl + noise < hr ? -1 : 1;
    // avoid a lane the enemy is massing defenders on
    const mine = this.lanes[lane < 0 ? 0 : 1];
    if (mine.threat > 6 && w.time > 5) return -lane;
    return lane;
  }

  support(hand, aether, leaking) {
    if (aether < this.p.supportAt && !leaking) return false;
    // find my lead tank walking up a lane
    let tank = null;
    for (const e of this.world.entities) {
      if (e.team !== this.team || e.kind !== 'unit' || e.state === 'deploy') continue;
      const T = UNIT_TRAITS[e.type];
      if (!T || !(T.heavy || T.siege)) continue;
      const d = this.depth(e.z);
      if (d < -6 || d > 13) continue;
      if (!tank || d < this.depth(tank.z)) tank = e;
    }
    if (!tank) return false;
    const d = this.depth(tank.z);
    if (this.p.supportTiming && d > 5 && !leaking) return false;    // wait until it nears the bridge
    let best = -1, bestScore = 0;
    for (const i of this.affordable(hand, aether)) {
      const info = CARD_INFO[hand[i]];
      if (!info || info.type !== 'troop' || info.anywhere) continue;
      let sc = 0;
      if (info.ranged) sc += 1.2;
      if (info.splash) sc += 0.6;
      if (info.healer) sc += 0.9;
      if (info.tank) sc -= 0.8;
      if (info.cost > aether - 1) sc -= 0.3;
      if (sc > bestScore) { bestScore = sc; best = i; }
    }
    // an overclock on a big push is worth it
    for (const i of this.affordable(hand, aether)) {
      if (hand[i] === 'overclock' && d < 1 && this.ownNear(tank.x, tank.z, 4) >= 3) return this.play(i, tank.x, tank.z);
    }
    if (best < 0) return false;
    return this.play(best, tank.x, this.s * Math.min(14, d + 2.2));
  }

  ownNear(x, z, r) {
    let n = 0;
    for (const e of this.world.entities) {
      if (e.team === this.team && e.kind === 'unit' && Math.hypot(e.x - x, e.z - z) < r) n++;
    }
    return n;
  }

  attack(hand, aether, leaking) {
    const opts = this.affordable(hand, aether);
    if (!opts.length) return false;
    const laneSign = this.chooseLane();
    const s = this.s;
    const foeLane = this.lanes[laneSign < 0 ? 0 : 1];
    const reserve = this.p.reserveK * Math.max(this.lanes[0].threat, this.lanes[1].threat);

    let best = -1, bestScore = -9;
    for (const i of opts) {
      const info = CARD_INFO[hand[i]];
      if (!info) continue;
      if (aether - info.cost < reserve && !leaking) continue;
      let sc = 0;
      if (info.type === 'spell') {
        if (info.pod) sc = 0.6;
        else continue;
      } else if (info.economy) {
        sc = this.world.timeLeft > 60 && aether >= 8 ? 1.0 : -1;
      } else if (info.tank) sc = 1.6;
      else if (info.siege) sc = info.fastSiege ? (foeLane.threat < 1 ? 1.8 : 0.7) : 1.4;
      else if (info.anywhere) sc = 1.1;
      else if (info.bombard) sc = 1.0;
      else if (info.building) sc = -0.5;
      else sc = 0.5 + (info.ranged ? 0.2 : 0);
      sc += this.rand() * 0.4;
      if (sc > bestScore) { bestScore = sc; best = i; }
    }
    if (best < 0) return false;
    const info = CARD_INFO[hand[best]];
    const pos = this.attackPos(info, laneSign);
    return this.play(best, pos.x, pos.z);
  }

  attackPos(info, laneSign) {
    const s = this.s;
    const foe = this.foe;
    const spireDown = this.towerHp(foe, laneSign < 0 ? 'left' : 'right') <= 0;
    if (info.anywhere || info.pod) {
      // drop behind the enemy spire (or onto the citadel once the spire is down)
      const tgt = spireDown ? towerPosition(foe, 'citadel') : towerPosition(foe, laneSign < 0 ? 'left' : 'right');
      return { x: tgt.x + laneSign * 0.5, z: tgt.z - s * 1.8 };
    }
    if (info.bombard) return { x: laneSign * 4.5, z: s * 3.5 };
    if (info.fastSiege) return { x: laneSign * ARENA.BRIDGE_X, z: s * 1.6 };
    if (info.economy) return { x: 0, z: s * 13.5 };
    if (spireDown) return { x: laneSign * 4, z: -s * 2.5 };          // into the forward pocket
    if (info.tank || info.siege) return { x: laneSign * 5.5, z: s * 13.5 };   // from the back: time to build
    if (info.building) return { x: laneSign * 1.5, z: s * 5.5 };
    return { x: laneSign * 5, z: s * 11 };
  }
}

