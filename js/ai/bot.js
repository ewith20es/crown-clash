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
const TOWER_ABILITIES = new Set(['archer-queen', 'golden-knight', 'skeleton-king', 'knight', 'mini-pekka', 'musketeer', 'monk', 'goblins', 'berserker']);

function newLaneStat() {
  return { threat: 0, defense: 0, airDefense: 0, commitment: 0, air: 0, swarm: 0, heavy: 0,
    siege: 0, ground: 0, front: null, frontDepth: -99, units: [] };
}

function uncovered(lane) {
  if (lane.coveredByTower) return 0;
  return Math.max(0, lane.threat - lane.defense * .85, lane.air - lane.airDefense * .85);
}

function towerCanStop(tower, enemy) {
  if (!tower?.alive || tower.frozen || tower.stunned || (tower.targetId && tower.targetId !== enemy.id)) return false;
  if (!enemy.def.speed || enemy.def.kamikaze || enemy.def.pounce || enemy.def.charge) return false;
  const gap = Math.hypot(tower.x - enemy.x, tower.z - enemy.z) - tower.radius - enemy.radius;
  const approach = Math.max(0, Math.min(gap, tower.def.range) - enemy.def.range) / enemy.def.speed;
  const shots = Math.ceil(enemy.hp / tower.def.dmg) + Math.ceil(enemy.shield / tower.def.dmg);
  const travel = Math.max(0, gap) / (tower.def.projSpeed || Infinity);
  return shots > 0 && tower.cooldown + tower.def.windup + (shots - 1) * tower.def.hitSpeed + travel + .35 < approach;
}

function crownDamage(spell) {
  return (spell.crownDamage ?? (spell.damage || 0) * (spell.towerMult || 0)) * (spell.waves || 1);
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
    this.towerAttackers = new Map();
  }

  range(r) { return r[0] + (r[1] - r[0]) * this.rand(); }

  /** Called once per simulation step, before world.step. */
  update(dt) {
    const w = this.world;
    if (!w || w.phase === 'ended') return;
    this.thinkT -= dt;
    if (this.thinkT > 0) return;
    this.thinkT = this.range(this.p.think);
    for (const ability of w.abilities(this.team)) {
      if (!ability.ready) continue;
      const hero = w.getEntity(ability.id);
      const towerHit = this.p.counterpush && hero.state === 'attack' && w.getEntity(hero.targetId)?.kind === 'tower'
        && TOWER_ABILITIES.has(hero.def.ability.family);
      const engaged = w.entities.some(e => e.alive && e.team === this.foe && e.kind === 'unit' && Math.hypot(e.x - hero.x, e.z - hero.z) < 6);
      if ((towerHit || engaged) && w.activateAbility(this.team, ability.id)) break;
    }
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
    this.towerAttackers.clear();
    for (const l of L) {
      l.threat = 0; l.defense = 0; l.air = 0; l.swarm = 0; l.heavy = 0; l.siege = 0; l.ground = 0;
      l.front = null; l.frontDepth = -99; l.units.length = 0; l.airDefense = 0; l.commitment = 0;
    }
    const alive = new Set();
    for (const e of w.entities) {
      if (!e.alive || e.kind === 'tower') continue;
      const T = UNIT_TRAITS[e.type];
      if (!T) continue;
      const lane = e.x < 0 ? L[0] : L[1];
      const hpf = e.maxHp > 0 ? (e.hp + (e.shield || 0)) / (e.maxHp + (e.maxShield || 0)) : 1;
      const d = this.depth(e.z);
      const v = T.value * hpf;
      if (e.team === this.team) {
        if (e.kind === 'unit' && T.attacksUnits && d > -3) {
          lane.defense += v;
          if (T.hitsAir) lane.airDefense += v;
        }
        if (e.kind === 'building' && e.def.dmg > 0) {
          for (const [i, side] of L.entries()) {
            if (Math.abs(e.x - LANES[i] * ARENA.BRIDGE_X) > e.def.range + 1) continue;
            side.defense += v * .65;
            if (T.hitsAir) side.airDefense += v * .65;
          }
        }
        if (this.p.offensiveSpells && e.state === 'attack' && w.getEntity(e.targetId)?.kind === 'tower') {
          this.towerAttackers.set(e.targetId, (this.towerAttackers.get(e.targetId) || 0) + v);
        }
        continue;
      }
      alive.add(e.id);
      if (!this.seen.has(e.id)) this.seen.set(e.id, now + this.range(this.p.reaction));
      if (now < this.seen.get(e.id)) continue;
      lane.commitment += v;
      // incoming if on my half or close enough to reach it soon
      const reach = 1 + (e.def.speed || 0) * this.p.horizon;
      const bombardThreat = e.kind === 'building' && e.def.minRange > 0;
      if (d < -reach && !bombardThreat) continue;
      lane.threat += v;
      lane.units.push(e);
      if (T.flying) lane.air += v; else lane.ground += v;
      if (T.light) lane.swarm += v;
      if (T.heavy) lane.heavy += v;
      if (T.siege) lane.siege += v;
      if (d > lane.frontDepth) { lane.frontDepth = d; lane.front = e; }
    }
    for (const id of this.seen.keys()) if (!alive.has(id)) this.seen.delete(id);
    for (const [i, lane] of L.entries()) {
      lane.coveredByTower = this.p.towerCover && lane.units.length === 1
        && towerCanStop(w.towers[this.team][i === 0 ? 'left' : 'right'], lane.front);
    }
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
      const deficit = uncovered(l) * (l.frontDepth > 4 ? 1.4 : 1);
      if (deficit > worstDef) { worstDef = deficit; worst = i; }
    }
    if (worst >= 0 && this.p.offensiveSpells && this.finisher(hand, aether, true)) return;
    if (worst >= 0 && this.rand() < (this.p.defendChance ?? 1) && this.defend(worst, hand, aether)) return;

    // 2. finish a low tower with a spell
    if (this.finisher(hand, aether)) return;

    // 3. value spells on enemy clusters anywhere
    if (this.valueSpell(hand, aether, this.p.spellValue)) return;

    // 4. offence: support a push in progress, start one, or spend before leaking
    const leaking = aether >= this.p.leakAt;
    const surge = w.phase !== 'regular';
    const reserve = leaking ? 0 : Math.min(4, this.p.reserveK * Math.max(uncovered(this.lanes[0]), uncovered(this.lanes[1])));
    const foeAether = this.p.tracksAether ? w.players[this.foe].aether : 5;
    const punish = foeAether < 3 && aether >= (this.p.punishAt ?? 6) && worst < 0;
    if (punish && this.attack(hand, aether - reserve, true)) return;
    if (aether >= this.p.supportAt && this.support(hand, aether - reserve, leaking)) return;
    if (aether >= this.p.pushAt - (surge ? 1.5 : 0) * this.p.aggression || leaking) {
      this.attack(hand, aether - reserve);
    }
  }

  affordable(hand, aether) {
    const out = [];
    for (let i = 0; i < hand.length; i++) {
      const c = CARD_BY_ID[hand[i]];
      if (c && this.world.cardCost(this.team, c) <= aether + 1e-6) out.push(i);
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
    if (info.swarm && lane.units.some(e => UNIT_TRAITS[e.type].splash)) sc -= 1.1;
    if (lane.air > lane.airDefense && info.hitsAir) sc += .6;
    if (info.T && info.T.attacksUnits) sc += Math.min(.7, info.T.dps * info.count / (100 * info.cost));
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
    if (this.p.towerCover && !info.ranged && f.def.targets !== 'buildings' && d >= -1) {
      // Intercept ranged support directly. Draw melee attackers toward the middle under tower fire.
      const backline = lane.units.find(e => !e.flying && e.def.range >= 4 && this.depth(e.z) >= 2);
      if (backline) return {x: backline.x, z: backline.z};
      if (f.def.range < 3 && d <= 8) return {x: f.x - Math.sign(f.x) * Math.min(2.5, Math.abs(f.x)), z: s * clamp(d + .5, 2, 7)};
    }
    if (info.ranged) {
      // behind the line of contact, inside tower cover
      const dz = Math.min(12, Math.max(d + Math.min(info.range - .5, 4), 5));
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
    const aims = enemies.filter(c => c.e.kind !== 'tower' && (!lane || lane.units.includes(c.e)));
    if (this.p.offensiveSpells && !spell.ownSide && spell.kind !== 'rockslide') {
      for (const t of enemies.filter(c => c.e.kind === 'tower' && c.e.active)) {
        if (!lane && this.towerAttackers.has(t.e.id)) aims.push(t);
        for (const defender of enemies) {
          if (defender.e.kind === 'tower' || (lane && !lane.units.includes(defender.e))) continue;
          const dx = defender.x - t.x, dz = defender.z - t.z;
          const distance = Math.hypot(dx,dz);
          if (distance > 2*r + t.e.radius + defender.e.radius || distance < .01) continue;
          const shift = Math.min(r + t.e.radius - .65, distance / 2);
          aims.push({x: t.x + dx * shift / distance, z: t.z + dz * shift / distance});
        }
      }
    }
    for (const c of aims) {
      if (spell.ownSide && this.depth(c.z) < 1) continue;
      const cx = clamp(snap(c.x), 1 - ARENA.HALF_W, ARENA.HALF_W - 1);
      const cz = clamp(snap(c.z), 1 - ARENA.HALF_L, ARENA.HALF_L - 1);
      let val = 0, n = 0, push = 0;
      for (const target of enemies) {
        const e = target.e;
        const dx = target.x - cx, dz = target.z - cz;
        if (Math.hypot(dx, dz) - e.radius > r) continue;
        const T = UNIT_TRAITS[e.type];
        if (e.kind === 'tower') {
          val += this.towerValue(info, e);
          if (!lane && !e.frozen) push = Math.max(push, this.towerAttackers.get(e.id) || 0);
          continue;
        }
        if (!T) continue;
        if ((spell.kind === 'rockslide' || spell.groundOnly) && e.flying) continue;
        const hpf = e.maxHp > 0 ? e.hp / e.maxHp : 1;
        const dmg = (spell.damage || (spell.dps || 0) * (spell.duration || 0)) * (spell.waves || spell.strikes || 1);
        // value = share of the unit's worth this spell removes (control spells count half)
        const share = dmg > 0 ? Math.min(1, dmg / Math.max(1, e.hp + (e.shield || 0))) : 0.5;
        val += T.value * hpf * share;
        n++;
      }
      if (n === 0 && !(push && spell.kind === 'stasis')) continue;
      if (push) val += Math.min(6, push) * (spell.kind === 'stasis' ? 1 : .35);
      if (val > bestVal) { bestVal = val; best = { x: cx, z: cz, value: val }; }
    }
    return best;
  }

  towerValue(info, tower) {
    if (this.p.offensiveSpells) {
      if (tower.slot === 'citadel' && !tower.active) return -3;
      return crownDamage(info.spell) / 95;
    }
    // chip damage on a healthy tower is a waste early on; it matters once a tower is low or late
    const late = this.world.phase !== 'regular';
    if (!late && tower.hp > tower.maxHp * 0.45) return 0;
    const s = info.spell;
    const dmg = crownDamage(s);
    return tower.maxHp > 0 ? (dmg / tower.maxHp) * 5 : 0;
  }

  valueSpell(hand, aether, need, lane) {
    let best = null;
    for (const i of this.affordable(hand, aether)) {
      const info = CARD_INFO[hand[i]];
      if (!info || !info.spell) continue;
      const k = info.spell.kind;
      if (k === 'overclock' || k === 'clone' || k === 'mirror' || k === 'graveyard') continue;
      if (!lane && (k === 'maelstrom' || (k === 'stasis' && !this.towerAttackers.size))) continue;
      const t = this.bestSpellTarget(info, lane);
      if (!t) continue;
      if (t.value / info.cost >= need) {
        const z = k === 'rockslide' ? this.s * Math.min(14, Math.max(2, this.depth(t.z) + 3)) : t.z;
        if (!this.p.offensiveSpells) return this.play(i, t.x, z);
        const surplus = t.value - info.cost;
        if (!best || surplus > best.surplus) best = {i, x:t.x, z, surplus};
      }
    }
    return best ? this.play(best.i, best.x, best.z) : false;
  }

  finisher(hand, aether, winningOnly = false) {
    const w = this.world;
    const spells = this.affordable(hand, aether).filter(i => {
      const s = CARD_INFO[hand[i]].spell;
      return s && !s.ownSide && crownDamage(s) > 0;
    });
    if (!spells.length) return false;
    const towers = [];
    for (const slot of ['citadel','left','right']) {
      if (winningOnly && w.phase !== 'overtime' && slot !== 'citadel') continue;
      const target = w.towers[this.foe][slot];
      if (!target?.alive) continue;
      let hp = target.hp;
      for (const p of w.pending) {
        if (p.team !== this.team || (p.kind !== 'comet' && p.kind !== 'shardstorm' && p.kind !== 'jolt' && p.kind !== 'stasis')) continue;
        if (Math.hypot(p.x - target.x, p.z - target.z) <= p.radius + target.radius) {
          const wavesLeft = (p.spell.waves || 1) - (p.wave || 0);
          hp -= crownDamage(p.spell) * wavesLeft / (p.spell.waves || 1);
        }
      }
      if (hp > 0) towers.push({target, hp});
    }
    if (!towers.length) return false;
    for (const t of towers) {
      for (const i of spells) {
        if (t.hp <= crownDamage(CARD_INFO[hand[i]].spell)) return this.play(i, t.target.x, t.target.z);
      }
    }
    if (!this.p.offensiveSpells) return false;
    const weakest = towers.reduce((a,b) => a.hp <= b.hp ? a : b);
    const ownLowest = Math.min(...Object.values(w.towers[this.team]).filter(t => t.alive).map(t => t.hp));
    const racing = w.phase === 'overtime' && weakest.hp >= ownLowest;
    // Late in a close match, chip the weakest tower while keeping a response in hand.
    const safeChip = w.phase !== 'regular' && !this.lanes.some(lane => uncovered(lane) > this.p.defendAt)
      && (weakest.hp < weakest.target.maxHp * .45 || racing);
    spells.sort((a,b) => crownDamage(CARD_INFO[hand[b]].spell) / CARD_INFO[hand[b]].cost
      - crownDamage(CARD_INFO[hand[a]].spell) / CARD_INFO[hand[a]].cost);
    for (const i of spells) {
      const first = CARD_INFO[hand[i]];
      // Commit to a two-spell finish only with enough elixir to pay for both casts.
      const combo = spells.some(j => j !== i && first.cost + CARD_INFO[hand[j]].cost <= aether
        && crownDamage(first.spell) + crownDamage(CARD_INFO[hand[j]].spell) >= weakest.hp);
      const lastShot = racing && w.timeLeft < 10 && first.spellDelay < w.timeLeft;
      if (combo || (!winningOnly && (lastShot || (safeChip && aether >= first.cost + 4)))) {
        return this.play(i, weakest.target.x, weakest.target.z);
      }
    }
    return false;
  }

  // ── offence ──

  chooseLane(pressure) {
    const w = this.world;
    const foe = this.foe;
    const hl = this.towerHp(foe, 'left'), hr = this.towerHp(foe, 'right');
    if (this.p.offensiveSpells && (hl === 0) !== (hr === 0)) {
      // Compare the surviving Princess Tower with the King accessible through the open lane.
      const king = this.towerHp(foe, 'citadel');
      const openLane = hl === 0 ? -1 : 1;
      return Math.max(hl, hr) < king * .65 ? -openLane : openLane;
    }
    if (pressure) {
      const [left, right] = this.lanes;
      if (Math.abs(left.commitment - right.commitment) >= 2) return left.commitment > right.commitment ? 1 : -1;
    }
    // a fallen spire opens the way to the citadel on that side
    if (hl <= 0 && hr > 0) return -1;
    if (hr <= 0 && hl > 0) return 1;
    // otherwise the lane with the weaker spire, with a little noise
    const noise = (this.rand() - 0.5) * 2000 * this.p.laneNoise;
    const lane = hl + noise === hr ? this.pushLane : hl + noise < hr ? -1 : 1;
    // avoid a lane the enemy is massing defenders on
    const mine = this.lanes[lane < 0 ? 0 : 1];
    if (mine.threat > 6 && w.time > 5) return -lane;
    return lane;
  }

  support(hand, aether, leaking) {
    // A tank needs an escort. A surviving ranged defender near the bridge needs a frontliner.
    let tank = null, survivor = null;
    for (const e of this.world.entities) {
      if (!e.alive || e.team !== this.team || e.kind !== 'unit' || e.state === 'deploy') continue;
      const T = UNIT_TRAITS[e.type];
      if (!T) continue;
      const d = this.depth(e.z);
      if (d < -6 || d > 13) continue;
      if (T.heavy || T.siege) {
        if (!tank || d < this.depth(tank.z)) tank = e;
      } else if (this.p.counterpush && T.ranged && T.value >= 1 && d >= 2 && d <= 5 && e.hp >= e.maxHp * .4) {
        if (!survivor || d < this.depth(survivor.z)) survivor = e;
      }
    }
    if (survivor && (!tank || tank.x * survivor.x < 0 || this.depth(tank.z) > this.depth(survivor.z) + 2)) {
      const front = this.affordable(hand, aether)
        .filter(i => CARD_INFO[hand[i]].frontliner || CARD_INFO[hand[i]].tank)
        .sort((a,b) => CARD_INFO[hand[b]].T.hp - CARD_INFO[hand[a]].T.hp)[0];
      if (front !== undefined) return this.play(front, (Math.sign(survivor.x) || this.pushLane) * ARENA.BRIDGE_X, this.s * 2);
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

  attack(hand, aether, pressure = false) {
    const opts = this.affordable(hand, aether);
    if (!opts.length) return false;
    const laneSign = this.chooseLane(pressure);
    const foeLane = this.lanes[laneSign < 0 ? 0 : 1];
    const escort = this.p.offensiveSpells ? opts.filter(i => {
      const c = CARD_INFO[hand[i]];
      return c.type === 'troop' && c.ranged && c.T.attacksUnits;
    }) : [];

    let best = -1, bestScore = -9, pairedPush = false;
    for (const i of opts) {
      const info = CARD_INFO[hand[i]];
      if (!info) continue;
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
      if (pressure && (info.fastSiege || info.anywhere || info.diver)) sc += 1.4;
      const canPair = (info.tank || info.siege) && !info.building && foeLane.threat < 1
        && escort.some(j => j !== i && info.cost + CARD_INFO[hand[j]].cost <= aether);
      if (canPair) sc += info.siege ? 1.4 : .6;
      sc += this.rand() * 0.4;
      if (sc > bestScore) { bestScore = sc; best = i; pairedPush = canPair; }
    }
    if (best < 0) return false;
    const info = CARD_INFO[hand[best]];
    const closing = this.p.offensiveSpells && this.world.phase !== 'regular' && this.world.timeLeft < 35
      && this.world.players[this.team].stars <= this.world.players[this.foe].stars;
    const pos = this.attackPos(info, laneSign, pressure || pairedPush || closing);
    return this.play(best, pos.x, pos.z);
  }

  attackPos(info, laneSign, pressure) {
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
    if (pressure && info.type === 'troop') return {x: laneSign * ARENA.BRIDGE_X, z: s * 2};
    if (info.tank || info.siege) return { x: laneSign * 5.5, z: s * 13.5 };   // from the back: time to build
    if (info.building) return { x: laneSign * 1.5, z: s * 5.5 };
    return { x: laneSign * 5, z: s * 11 };
  }
}

