import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../js/sim/world.js';
import { Rng } from '../js/sim/rng.js';
import { cardFormation } from '../js/data/formations.js';
import { ARENA, MATCH, SIM_DT, towerPosition, inRift } from '../js/config.js';
import { UNITS, CARDS, CARD_BY_ID, DEFAULT_DECK, OPPONENTS, normalizeDeck } from '../js/data/cards.js';

// ───────────────────────────── helpers ─────────────────────────────

const steps = (s) => Math.round(s / SIM_DT);

/** Steps for `seconds` (or until the match ends); returns every event emitted. */
function run(w, seconds, each) {
  const out = [];
  const n = steps(seconds);
  for (let i = 0; i < n && w.phase !== 'ended'; i++) {
    w.step();
    const ev = w.drainEvents();
    for (const e of ev) out.push(e);
    if (each) each(w, ev);
  }
  return out;
}

/** Steps until pred(w, events) is true; returns the step count or -1. */
function until(w, pred, maxSeconds = 30) {
  const n = steps(maxSeconds);
  for (let i = 0; i < n && w.phase !== 'ended'; i++) {
    w.step();
    if (pred(w, w.drainEvents())) return i + 1;
  }
  return -1;
}

function quietTowers(w, team) {
  const teams = team === undefined ? [0, 1] : [team];
  for (const t of teams) for (const s of ['left', 'right', 'citadel']) w.towers[t][s].stunned = 1e9;
}

function dummy(w, type, team, x, z) {
  const e = w.addEntity(type, team, x, z);
  e.stunned = 1e9;
  return e;
}

function giveCard(w, team, cardId) {
  const p = w.players[team];
  p.deck = normalizeDeck([cardId, ...DEFAULT_DECK.filter(id => CARD_BY_ID[id].family !== CARD_BY_ID[cardId].family)].slice(0, 8));
  p.hand[0] = cardId;
  p.aether = MATCH.AETHER_MAX;
  return 0;
}

function assertNoRift(w) {
  for (const e of w.entities) {
    if (e.kind === 'unit' && !e.flying && e.hop === 0 && inRift(e.x, e.z)) {
      assert.fail(`ground unit ${e.type}#${e.id} in the rift at (${e.x.toFixed(3)}, ${e.z.toFixed(3)}) tick ${w.tick}`);
    }
  }
}

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

function damageTo(events, id, source) {
  return events.filter((e) => e.type === 'damage' && e.id === id && (source === undefined || e.source === source));
}

// ───────────────────────────── construction ─────────────────────────────

test('construction: towers, hands and aether', () => {
  const w = new World({ seed: 3 });
  assert.equal(w.entities.length, 6);
  for (const team of [0, 1]) {
    for (const slot of ['left', 'right', 'citadel']) {
      const t = w.towers[team][slot];
      const p = towerPosition(team, slot);
      assert.equal(t.kind, 'tower');
      assert.equal(t.slot, slot);
      assert.equal(t.team, team);
      assert.equal(t.x, p.x);
      assert.equal(t.z, p.z);
      assert.equal(t.alive, true);
      assert.equal(t.active, slot !== 'citadel');
      assert.equal(w.getEntity(t.id), t);
    }
    const pl = w.players[team];
    assert.equal(pl.aether, MATCH.AETHER_START);
    assert.equal(pl.hand.length, 4);
    assert.equal(pl.queue.length, 3);
    assert.deepEqual([...pl.hand, pl.next, ...pl.queue].sort(), [...DEFAULT_DECK].sort());
    assert.equal(pl.stars, 0);
  }
  assert.equal(w.phase, 'regular');
  assert.equal(w.timeLeft, MATCH.REGULAR_TIME);
  assert.equal(w.winner, null);
  const ids = new Set(w.entities.map((e) => e.id));
  assert.equal(ids.size, 6);
});

test('construction: custom decks and invalid decks', () => {
  const deck = OPPONENTS[2].deck;
  const w = new World({ seed: 5, decks: [deck, ['nope']] });
  assert.deepEqual([...w.players[0].hand, w.players[0].next, ...w.players[0].queue].sort(), [...deck].sort());
  assert.deepEqual([...w.players[1].deck].sort(), [...DEFAULT_DECK].sort());
});

// ───────────────────────────── aether ─────────────────────────────

test('aether: regular, surge, overtime rates and cap', () => {
  const w = new World({ seed: 1 });
  run(w, MATCH.AETHER_PERIOD);
  assert.ok(near(w.players[0].aether, MATCH.AETHER_START + 1, 1e-6));
  run(w, 30);
  assert.equal(w.players[0].aether, MATCH.AETHER_MAX);

  const s = new World({ seed: 1 });
  s.timeLeft = MATCH.SURGE_TIME + 0.5;
  let ev = run(s, 0.6);
  assert.equal(s.phase, 'surge');
  assert.ok(ev.some((e) => e.type === 'phase' && e.phase === 'surge'));
  s.players[0].aether = 0;
  run(s, MATCH.AETHER_PERIOD / 2);
  assert.ok(near(s.players[0].aether, MATCH.SURGE_MULT * 0.5, 1e-3), `surge aether ${s.players[0].aether}`);

  const o = new World({ seed: 1 });
  o.timeLeft = 0.05;
  ev = run(o, 0.1);
  assert.equal(o.phase, 'overtime');
  assert.ok(ev.some((e) => e.type === 'phase' && e.phase === 'overtime'));
  assert.ok(near(o.timeLeft, MATCH.OVERTIME - (0.1 - 0.05), 0.05));
  o.players[1].aether = 0;
  run(o, MATCH.AETHER_PERIOD / 2);
  assert.ok(near(o.players[1].aether, MATCH.OVERTIME_MULT * 0.5, 1e-3));
});

test('elixir: Elixir Collector income', () => {
  const w = new World({ seed: 1 });
  w.addEntity('aetherwell', 0, 0, 6);
  w.players[0].aether = 0;
  w.players[1].aether = 0;
  const ev = run(w, 15.05);
  const gains = ev.filter((e) => e.type === 'aether');
  assert.equal(gains.length, 1);
  assert.equal(gains[0].team, 0);
  assert.ok(near(w.players[0].aether - w.players[1].aether, 1, 1e-6));
});

// ───────────────────────────── deployment ─────────────────────────────

test('playCard: pays aether and cycles the hand', () => {
  const w = new World({ seed: 9 });
  const p = w.players[0];
  p.aether = 10;
  const played = p.hand[0];
  const next = p.next;
  const q = [...p.queue];
  const cost = CARD_BY_ID[played].cost;
  assert.equal(w.playCard(0, 0, -5, 5), true);
  assert.ok(near(p.aether, 10 - cost));
  assert.equal(p.hand[0], next);
  assert.equal(p.next, q[0]);
  assert.deepEqual(p.queue, [q[1], q[2], played]);
  assert.deepEqual([...p.hand, p.next, ...p.queue].sort(), [...p.deck].sort());
  const ev = w.drainEvents();
  assert.ok(ev.some((e) => e.type === 'cardPlayed' && e.cardId === played));
  assert.equal(w.stats[0].cardsPlayed, 1);
  assert.equal(w.stats[0].aetherSpent, cost);
});

test('canPlay: aether rejection still resolves a legal point; clamping', () => {
  const w = new World({ seed: 1 });
  giveCard(w, 0, 'warden');
  w.players[0].aether = 0;
  const r = w.canPlay(0, 0, 3, -6);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'aether');
  assert.equal(r.clamped, true);
  assert.equal(r.x, 3);
  assert.equal(r.z, Math.ceil(ARENA.RIFT_HALF + .5));
  assert.equal(w.playCard(0, 0, 3, 5), false);

  w.players[0].aether = 10;
  const ok = w.canPlay(0, 0, 3.1, 5.2);
  assert.equal(ok.ok, true);
  assert.equal(ok.reason, null);
  assert.equal(ok.x, 3);
  assert.equal(ok.z, 5);
  assert.equal(ok.clamped, false);
  assert.equal(ok.card, CARD_BY_ID.warden);

  const team1 = w.canPlay(1, 0, 0, 7);
  assert.ok(team1.z <= -(ARENA.RIFT_HALF + ARENA.EDGE_MARGIN) + 1e-9);

  const edge = w.canPlay(0, 0, 50, 50);
  assert.ok(edge.x <= ARENA.HALF_W - ARENA.EDGE_MARGIN + 1e-9);
  assert.ok(edge.z <= ARENA.HALF_L - ARENA.EDGE_MARGIN + 1e-9);

  assert.equal(w.canPlay(0, 7, 0, 5).reason, 'card');
  assert.equal(w.canPlay(0, -1, 0, 5).reason, 'card');
  assert.equal(w.canPlay(2, 0, 0, 5).reason, 'card');
  const nan = w.canPlay(0, 0, NaN, undefined);
  assert.ok(Number.isFinite(nan.x) && Number.isFinite(nan.z));
});

test('canPlay: pocket opens after an enemy spire falls', () => {
  const w = new World({ seed: 1 });
  giveCard(w, 0, 'warden');
  assert.equal(w.deployRects(0).length, 1);
  assert.equal(w.canPlay(0, 0, -4, -4).clamped, true);
  w._damage(w.towers[1].left, 1e9, 0);
  const ev = run(w, SIM_DT);
  assert.ok(ev.some((e) => e.type === 'towerDown' && e.team === 1 && e.slot === 'left'));
  assert.equal(w.deployRects(0).length, 2);
  const r = w.canPlay(0, 0, -4, -4);
  assert.equal(r.clamped, false);
  assert.equal(r.z, -4);
  assert.equal(w.canPlay(0, 0, 4, -4).clamped, true);
});

test('canPlay: spells anywhere, deployAnywhere units anywhere outside the rift', () => {
  const w = new World({ seed: 1 });
  giveCard(w, 0, 'comet');
  const s = w.canPlay(0, 0, -3, -12);
  assert.equal(s.ok, true);
  assert.equal(s.clamped, false);
  assert.deepEqual([s.x, s.z], [-3, -12]);
  const far = w.canPlay(0, 0, -30, 40);
  assert.deepEqual([far.x, far.z], [1 - ARENA.HALF_W, ARENA.HALF_L - 1]);

  giveCard(w, 0, 'drillworm');
  const d = w.canPlay(0, 0, 2, -10);
  assert.equal(d.clamped, false);
  const rift = w.canPlay(0, 0, 2, 0.3);
  assert.ok(!inRift(rift.x, rift.z));
  assert.equal(rift.clamped, true);
  const bridge = w.canPlay(0, 0, 5, 0);
  assert.equal(bridge.clamped, false);
});

test('canPlay: structures push deploy points out', () => {
  const w = new World({ seed: 1 });
  giveCard(w, 0, 'warden');
  const spire = w.towers[0].left;
  const r = w.canPlay(0, 0, spire.x, spire.z);
  assert.equal(r.clamped, true);
  assert.ok(Math.hypot(r.x - spire.x, r.z - spire.z) >= spire.radius + UNITS.warden.radius + 0.1 - 1e-6);
  const enemy = w.towers[1].right;
  giveCard(w, 0, 'drillworm');
  const d = w.canPlay(0, 0, enemy.x, enemy.z);
  assert.ok(Math.hypot(d.x - enemy.x, d.z - enemy.z) >= enemy.radius + UNITS.drillworm.radius + 0.1 - 1e-6);

  // buildings keep clear of other buildings
  const b = w.addEntity('sentry', 0, 2, 6);
  giveCard(w, 0, 'nest');
  const n = w.canPlay(0, 0, 2, 6);
  assert.ok(Math.hypot(n.x - b.x, n.z - b.z) >= b.radius + UNITS.nest.radius + 0.1 - 1e-6);
});

test('playCard: multi-unit cards spawn their formation in deploy state', () => {
  const w = new World({ seed: 1 });
  giveCard(w, 1, 'mites');
  assert.equal(w.playCard(1, 0, 3, -6), true);
  const mites = w.entities.filter((e) => e.type === 'mite');
  assert.equal(mites.length, 15);
  for (const m of mites) {
    assert.equal(m.state, 'deploy');
    assert.equal(m.team, 1);
    assert.equal(m.deployLeft, UNITS.mite.deployTime);
    assert.equal(m.cardId, 'mites');
  }
  const ev = w.drainEvents();
  assert.equal(ev.filter((e) => e.type === 'spawn').length, 15);
  // Overlapping skeletons separate on contact during deployment, without marching or attacking.
  const before = mites.map((m) => [m.x, m.z]);
  run(w, 0.9);
  for (let i = 0; i < mites.length; i++) assert.equal(mites[i].state, 'deploy');
  assert.ok(mites.every((m, i) => Math.hypot(m.x - before[i][0], m.z - before[i][1]) <= 2 * m.radius));
  assert.ok(mites.every(m => !m.attacks));
  run(w, 0.2);
  assert.ok(mites.every((m) => m.state !== 'deploy'));
});

// ───────────────────────────── every troop reaches a tower ─────────────────────────────

test('deployment previews and committed card anchors occupy whole tiles on both sides', () => {
  for (const team of [0, 1]) {
    const sign = team === 0 ? 1 : -1;
    for (const id of ['warden','mites','bats','sentry','drillworm','comet','royal-delivery']) {
      for (const [x,z] of [[2.5,5.5],[5,8.5],[-5,-8.5],[0,.5],[-3,-3.5],[20,40]]) {
        const w = new World();
        w.towers[1-team].left.alive = false;
        giveCard(w,team,id);
        const r = w.canPlay(team,0,x,z*sign);
        assert.ok(r.ok && Number.isInteger(r.x) && Number.isInteger(r.z), id);
        assert.ok(Math.abs(r.x) + .5 <= ARENA.HALF_W && Math.abs(r.z) + .5 <= ARENA.HALF_L);
        const positions = r.deployment.unit && w.deploymentPositions(r.deployment,team,r.x,r.z);
        assert.ok(w.playCard(team,0,x,z*sign));
        const events = w.drainEvents(), cast = events.find(e=>e.type==='cardPlayed');
        assert.deepEqual([cast.x,cast.z],[r.x,r.z]);
        if (!positions || UNITS[r.deployment.unit].deployAnywhere) continue;
        assert.deepEqual(events.filter(e=>e.type==='spawn').map(e=>[e.entType,e.x,e.z]),
          positions.map(m=>[m.unit,m.x,m.z]));
      }
    }
  }
});

test('Bats form a staggered pentagon and Skeleton Army deploys all fifteen together', () => {
  const bats = cardFormation(CARD_BY_ID.bats,0,-3);
  assert.equal(bats.length,5);
  const side = 2 * 1.405 * Math.sin(Math.PI/5);
  for (const [i,bat] of bats.entries()) {
    const next = bats[(i+1)%5];
    assert.ok(near(Math.hypot(bat.x,bat.z),1.405) && near(Math.hypot(bat.x-next.x,bat.z-next.z),side));
    assert.ok(near(bat.delay,i*.1));
  }
  const army = cardFormation(CARD_BY_ID.mites,0,-3);
  assert.equal(army.length,15);
  assert.ok(army.every(m=>m.delay===0));
  assert.ok(near(Math.max(...army.map(m=>Math.hypot(m.x,m.z))),2.77));
  for (const id of ['bats','mites','goblin-gang','royal-recruits','skeleton-army-evolution']) {
    const base = cardFormation(CARD_BY_ID[id],0,-3);
    const rotated = cardFormation(CARD_BY_ID[id],1,3);
    const oppositeLane = cardFormation(CARD_BY_ID[id],0,3);
    for (const [i,m] of base.entries()) {
      assert.ok(near(m.x,-rotated[i].x) && near(m.z,-rotated[i].z),id);
      assert.ok(near(m.x,-oppositeLane[i].x) && near(m.z,oppositeLane[i].z),id);
    }
  }
});

test('either Wall Breaker connects alone from either bridge after three Princess Tower shots', () => {
  for (const team of [0,1]) for (const lane of [-1,1]) for (const survivor of [0,1]) {
    const w = new World(), id = 'wall-breakers';
    giveCard(w,team,id);
    assert.ok(w.playCard(team,0,lane*ARENA.BRIDGE_X,team===0?2:-2));
    const pair = w.entities.filter(e=>e.cardId===id);
    w._kill(pair[1-survivor]);
    const runner = pair[survivor];
    const tower = w.towers[1-team][lane<0?'left':'right'];
    const events = run(w,9);
    assert.deepEqual(damageTo(events,runner.id,tower.type).map(e=>e.hp),[221,112,3]);
    assert.equal(tower.maxHp-tower.hp,302);
    assert.ok(events.some(e=>e.type==='impact' && e.sourceType===id && e.attackFx==='burst'));
    assert.equal(runner.alive,false);
  }
});

const TROOPS = CARDS.filter((c) => c.type === 'troop');
const POINTS0 = [[-6, 4], [6, 4], [0, 5], [-8.6, 14.6], [8.6, 14.6], [0, 1.4]];

for (const card of TROOPS) {
  test(`troop ${card.id}: reaches and damages an enemy tower from every deploy point`, () => {
    const cases = [...POINTS0.map(([x, z]) => [0, x, z]), [1, 6, -4], [1, -8.6, -14.6]];
    for (const [team, x, z] of cases) {
      const w = new World({ seed: 11 });
      quietTowers(w, 1 - team);
      giveCard(w, team, card.id);
      assert.equal(w.playCard(team, 0, x, z), true);
      const enemy = 1 - team;
      const towerIds = new Set(Object.values(w.towers[enemy]).map((t) => t.id));
      let hit = false;
      const n = steps(80);
      for (let i = 0; i < n && !hit; i++) {
        w.step();
        assertNoRift(w);
        for (const e of w.drainEvents()) if (e.type === 'damage' && towerIds.has(e.id)) hit = true;
      }
      assert.ok(hit, `${card.id} (team ${team}) from (${x}, ${z}) never damaged an enemy tower`);
    }
  });
}

// ───────────────────────────── targeting ─────────────────────────────

test('targeting: building hunters ignore units and get pulled by a new building', () => {
  const w = new World({ seed: 1 });
  quietTowers(w);
  const col = w.addEntity('colossus', 0, 5, 4);
  const blocker = dummy(w, 'warden', 1, 5, 2.4);
  run(w, 3, () => {
    const t = w.getEntity(col.targetId);
    assert.ok(t, 'colossus has a target');
    assert.notEqual(t.kind, 'unit');
    assert.notEqual(t.id, blocker.id);
  });
  const sentry = w.addEntity('sentry', 1, 3, -3);
  sentry.stunned = 1e9;
  run(w, SIM_DT);
  assert.equal(col.targetId, sentry.id);
});

test('targeting: ground attackers never target flyers; anti-air does', () => {
  const w = new World({ seed: 1 });
  quietTowers(w);
  const war = w.addEntity('warden', 0, 0, 6);
  const zep = dummy(w, 'zephyr', 1, 0, 4.5);
  run(w, 2, () => assert.notEqual(war.targetId, zep.id));

  const w2 = new World({ seed: 1 });
  quietTowers(w2);
  const sc = w2.addEntity('scout', 0, 0, 7);
  const z2 = dummy(w2, 'zephyr', 1, 0, 4.5);
  const ev = run(w2, 2);
  assert.equal(sc.targetId === z2.id || !z2.alive, true);
  assert.ok(damageTo(ev, z2.id).length > 0);
});

test('targeting: minRange blind spot', () => {
  const w = new World({ seed: 1 });
  quietTowers(w);
  const b = w.addEntity('bombard', 0, 0, 6);
  const close = dummy(w, 'warden', 1, 0, 4);
  let ev = run(w, 3);
  assert.equal(b.targetId, 0);
  assert.equal(damageTo(ev, close.id).length, 0);
  const far = dummy(w, 'warden', 1, 0, -1.5);
  ev = run(w, 0.2);
  assert.equal(b.targetId, far.id);
});

test('targeting: hysteresis keeps a target out to sight * 1.25', () => {
  const w = new World({ seed: 1 });
  quietTowers(w);
  const war = w.addEntity('warden', 0, 0, 10);
  war.stunned = 0;
  const sc = dummy(w, 'scout', 1, -3, 7);
  run(w, SIM_DT);
  assert.equal(war.targetId, sc.id);
  war.stunned = 0;
  // teleport the scout to reach 6.6 (> sight, < sight * 1.25)
  sc.x = war.x; sc.z = war.z - (6.6 + sc.radius);
  run(w, SIM_DT);
  assert.equal(war.targetId, sc.id);
  sc.x = war.x; sc.z = war.z - (7.2 + sc.radius);
  run(w, SIM_DT);
  assert.notEqual(war.targetId, sc.id);
  // a fresh unit does not acquire at reach 6.6
  const w2 = new World({ seed: 1 });
  quietTowers(w2);
  const a = w2.addEntity('warden', 0, 0, 10);
  const b = dummy(w2, 'scout', 1, 0, 10 - (6.6 + UNITS.scout.radius));
  run(w2, SIM_DT);
  assert.notEqual(a.targetId, b.id);
});

test('targeting: a unit walking to a tower switches to an enemy unit in sight', () => {
  const w = new World({ seed: 1 });
  quietTowers(w);
  const war = w.addEntity('warden', 0, -5, -3);
  run(w, 0.3);
  assert.equal(w.getEntity(war.targetId)?.kind, 'tower');
  const foe = dummy(w, 'glimmer', 1, -3, -4);
  run(w, SIM_DT);
  assert.equal(war.targetId, foe.id);
});

// ───────────────────────────── attacks ─────────────────────────────

test('attacks: swing windup and hitSpeed period', () => {
  const w = new World({ seed: 1 });
  quietTowers(w);
  const war = w.addEntity('warden', 0, 0, 6);
  const tgt = dummy(w, 'colossus', 1, 0, 4.4);
  const attacks = [];
  const hits = [];
  run(w, 6, (ww, ev) => {
    for (const e of ev) {
      if (e.type === 'attack' && e.id === war.id) attacks.push(ww.time);
      if (e.type === 'damage' && e.id === tgt.id) hits.push(ww.time);
    }
  });
  const d = UNITS.warden;
  assert.ok(attacks.length >= 4);
  assert.ok(hits.length >= 4);
  const firstDelay = hits[0] - attacks[0];
  assert.ok(firstDelay >= d.windup - 1e-9 && firstDelay <= d.windup + SIM_DT + 1e-9, `windup ${firstDelay}`);
  for (let i = 1; i < attacks.length; i++) {
    assert.ok(Math.abs(attacks[i] - attacks[i - 1] - d.hitSpeed) <= SIM_DT + 1e-9, `period ${attacks[i] - attacks[i - 1]}`);
  }
  assert.ok(near(tgt.hp, tgt.maxHp - hits.length * d.dmg, 1e-6));
});

test('attacks: homing projectile hits its target', () => {
  const w = new World({ seed: 1 });
  quietTowers(w);
  const sc = w.addEntity('scout', 0, 0, 6);
  const tgt = dummy(w, 'warden', 1, 0, 2.5);
  let shot = null;
  until(w, (ww, ev) => { shot = ev.find((e) => e.type === 'shoot' && e.id === sc.id); return !!shot; }, 3);
  assert.ok(shot);
  assert.equal(w.projectiles.length, 1);
  const p = w.projectiles[0];
  assert.equal(p.lob, false);
  assert.equal(p.targetId, tgt.id);
  const ev = run(w, 1);
  assert.ok(ev.some((e) => e.type === 'impact' && e.projKind === 'spark'));
  assert.ok(damageTo(ev, tgt.id).some((e) => e.amount === UNITS.scout.dmg));
});

test('attacks: lobbed shots miss a target that moved away; splash hits clusters', () => {
  const w = new World({ seed: 1 });
  quietTowers(w);
  w.addEntity('slingtoad', 0, 0, 8);
  const g = dummy(w, 'warden', 1, 0, 4);
  let shot = false;
  until(w, (ww, ev) => (shot = ev.some((e) => e.type === 'shoot' && e.entType === 'slingtoad')), 4);
  assert.ok(shot);
  g.x = 4.5; g.z = 4;
  let landed = [];
  until(w, (ww, ev) => { landed = ev; return ww.projectiles.length === 0; }, 4);
  assert.ok(landed.some((e) => e.type === 'impact' && e.sourceType === 'slingtoad'));
  assert.equal(g.hp, g.maxHp);

  const w2 = new World({ seed: 1 });
  quietTowers(w2);
  w2.addEntity('wizard', 0, 0, 9);
  const cl = [dummy(w2, 'goblin', 1, 0, 4.5), dummy(w2, 'goblin', 1, 0.7, 4.8), dummy(w2, 'goblin', 1, -0.7, 4.8)];
  let impact = false;
  until(w2, (ww, ev) => (impact = ev.some((e) => e.type === 'impact' && e.sourceType === 'wizard')), 5);
  assert.ok(impact);
  assert.ok(cl.every((g2) => !g2.alive), 'all clustered Goblins died to one Wizard fireball');
});

test('attacks: towerDmgMult scales damage to towers', () => {
  const w = new World({ seed: 1 });
  quietTowers(w);
  const spire = w.towers[1].right;
  w.addEntity('drillworm', 0, spire.x, spire.z + 2.2);
  const ev = run(w, 3);
  const hits = damageTo(ev, spire.id, 'drillworm');
  assert.ok(hits.length > 0);
  assert.ok(near(hits[0].amount, UNITS.drillworm.dmg * UNITS.drillworm.towerDmgMult));
});

// ───────────────────────────── abilities ─────────────────────────────

test('ability: shield absorbs the breaking hit entirely', () => {
  const w = new World({ seed: 1 });
  quietTowers(w);
  w.addEntity('breaker', 0, 0, 6);
  const pg = dummy(w, 'prismguard', 1, 0, 4.9);
  let ev = [];
  until(w, (ww, e) => (ev = e).some((x) => x.type === 'damage' && x.id === pg.id), 3);
  assert.equal(pg.shield, 0);
  assert.equal(pg.hp, UNITS.prismguard.hp);
  assert.ok(ev.some((e) => e.type === 'shieldBreak' && e.id === pg.id));
  w._damage(pg, 50, 0);
  assert.equal(pg.hp, UNITS.prismguard.hp - 50);
});

test('ability: slow reduces movement and attack rate', () => {
  const w = new World({ seed: 1 });
  quietTowers(w);
  w.addEntity('frostsnail', 0, 0, 9);
  const war = dummy(w, 'warden', 1, 0, 5.2);
  until(w, () => war.slowT > 0, 4);
  assert.ok(near(war.slowPct, 0.30));
  assert.ok(war.slowT > 2);
  war.stunned = 0;
  run(w, 0.3);
  assert.ok(war.state === 'move');
  assert.ok(near(war.speedNow, UNITS.warden.speed * 0.70, 0.06), `slowed speed ${war.speedNow}`);

  // attack rate: a permanently half-slowed warden swings every hitSpeed / 0.5 seconds
  const w2 = new World({ seed: 1 });
  quietTowers(w2);
  const att = w2.addEntity('warden', 0, 0, 6);
  dummy(w2, 'colossus', 1, 0, 4.4);
  const starts = [];
  run(w2, 8, (ww, ev) => {
    att.slowPct = 0.5; att.slowT = 1;
    for (const e of ev) if (e.type === 'attack' && e.id === att.id) starts.push(ww.time);
  });
  assert.ok(starts.length >= 3);
  for (let i = 1; i < starts.length; i++) {
    assert.ok(Math.abs(starts[i] - starts[i - 1] - UNITS.warden.hitSpeed * 2) <= SIM_DT * 2 + 1e-9);
  }
});

test('ability: stun cancels the swing and resets ramp and charge', () => {
  const w = new World({ seed: 1 });
  quietTowers(w);
  const sun = w.addEntity('sunlens', 1, 5, -4.6);
  const big = dummy(w, 'colossus', 0, 5, -1.6);
  big.hp = big.maxHp = 1e6;
  run(w, 3);
  assert.equal(sun.beam, true);
  assert.ok(sun.rampT > 2);
  const war = w.addEntity('warden', 1, -5, -3);
  const tgt = dummy(w, 'colossus', 0, -5, -4.9);
  assert.ok(until(w, () => war.attackT > 0.1, 3) > 0, 'warden mid-swing');
  const hpBefore = tgt.hp;
  w._stun(war, 0.5);
  assert.equal(war.attackT, -1);
  run(w, 0.45);
  assert.equal(tgt.hp, hpBefore, 'the cancelled blow never landed');
  const gyro = w.addEntity('gyrolancer', 1, -7.5, -14.4);
  assert.ok(until(w, () => gyro.charged, 6) > 0, 'gyrolancer charged');
  assert.equal(gyro.charged, true);
  assert.equal(sun.beam, true);
  for (const e of [sun, gyro]) w._stun(e, 0.5);
  assert.equal(sun.beam, false);
  assert.equal(sun.rampT, 0);
  assert.equal(gyro.charged, false);
  assert.equal(gyro.chargeDist, 0);
  const pos = [gyro.x, gyro.z];
  run(w, 0.4);
  assert.deepEqual([gyro.x, gyro.z], pos);
  assert.ok(tgt.alive);
});

test('ability: chain lightning hits up to count distinct targets', () => {
  const w = new World({ seed: 1 });
  quietTowers(w);
  w.addEntity('coilcrab', 0, 0, 8);
  const ws = [dummy(w, 'warden', 1, 0, 4), dummy(w, 'warden', 1, 1.6, 4), dummy(w, 'warden', 1, 3.2, 4), dummy(w, 'warden', 1, 4.8, 4)];
  let chain = null;
  let evs = [];
  until(w, (ww, ev) => { evs = ev; chain = ev.find((e) => e.type === 'chain'); return !!chain; }, 3);
  assert.ok(chain);
  assert.equal(chain.points.length, 1 + UNITS.coilcrab.chain.count);
  const hit = new Set(evs.filter((e) => e.type === 'damage').map((e) => e.id));
  assert.equal(hit.size, 3);
  assert.ok(hit.has(ws[0].id) && hit.has(ws[1].id) && hit.has(ws[2].id));
  assert.equal(ws[3].hp, ws[3].maxHp);
  for (let i = 0; i < 3; i++) assert.ok(ws[i].stunned >= 0.39);
});

test('ability: ramp multipliers grow over time and reset on retarget', () => {
  const w = new World({ seed: 1 });
  quietTowers(w);
  const sun = w.addEntity('sunlens', 0, 0, 8);
  const a = dummy(w, 'colossus', 1, 0, 5);
  const amounts = [];
  run(w, 5.2, (ww, ev) => { for (const e of damageTo(ev, a.id, 'sunlens')) amounts.push([ww.time, e.amount]); });
  const d = UNITS.sunlens;
  assert.ok(near(amounts[0][1], d.dmg));
  const t0 = amounts[0][0];
  for (const [t, amt] of amounts) {
    const rt = t - t0;
    const expect = rt >= 4 - 1e-6 + SIM_DT ? 422 : rt >= 2 + SIM_DT && rt < 4 - SIM_DT ? 120 : null;
    if (expect !== null) assert.ok(near(amt, expect, 1e-6), `t=${rt.toFixed(2)} amount ${amt}`);
  }
  assert.ok(amounts.some(([, x]) => near(x, 422)));
  // retarget: kill a, a new target starts at the base multiplier
  w._damage(a, 1e9, 0);
  const b = dummy(w, 'colossus', 1, 1.5, 5.2);
  const evs = run(w, 1.5);
  const nb = damageTo(evs, b.id, 'sunlens');
  assert.ok(nb.length > 0);
  assert.ok(near(nb[0].amount, d.dmg));
  assert.equal(sun.targetId, b.id);
});

test('ability: charge doubles speed and the first hit', () => {
  const w = new World({ seed: 1 });
  quietTowers(w);
  const g = w.addEntity('gyrolancer', 0, -7.5, 14.4);
  const tgt = dummy(w, 'breaker', 1, -7.5, 8.5);
  const speeds = [];
  let charged = false;
  const ev = run(w, 5, (ww, e) => {
    if (e.some((x) => x.type === 'charge' && x.id === g.id)) charged = true;
    if (g.state === 'move') speeds.push([g.charged, g.speedNow]);
  });
  assert.ok(charged);
  const plain = speeds.filter(([c]) => !c).map(([, s]) => s);
  const fast = speeds.filter(([c]) => c).map(([, s]) => s);
  assert.ok(plain.length && fast.length);
  assert.ok(near(Math.max(...plain), UNITS.gyrolancer.speed, 0.05));
  assert.ok(near(Math.max(...fast), UNITS.gyrolancer.speed * 2, 0.08));
  const hits = damageTo(ev, tgt.id, 'gyrolancer');
  assert.ok(hits.length >= 1);
  assert.ok(near(hits[0].amount, 783));
  if (hits.length > 1) assert.ok(near(hits[1].amount, UNITS.gyrolancer.dmg));
});

test('ability: pounce leaps onto a distant target for bonus damage', () => {
  const w = new World({ seed: 1 });
  quietTowers(w);
  const lynx = w.addEntity('shardlynx', 0, -7.5, 14.4);
  const tgt = dummy(w, 'warden', 1, -7.5, 10.0);
  let pounced = false;
  let maxY = 0;
  const ev = run(w, 2, (ww, e) => {
    if (e.some((x) => x.type === 'pounce' && x.id === lynx.id && x.targetId === tgt.id)) pounced = true;
    maxY = Math.max(maxY, lynx.y);
  });
  assert.ok(pounced);
  assert.ok(maxY > 0.3);
  const hits = damageTo(ev, tgt.id, 'shardlynx');
  assert.ok(near(hits[0].amount, 389));
  assert.equal(lynx.y, 0);
});

test('ability: leap hops the rift off-bridge while normal units take a bridge', () => {
  const w = new World({ seed: 1 });
  quietTowers(w);
  const ram = w.addEntity('ramhorn', 0, 0, 5);
  const war = w.addEntity('warden', 0, -1, 6);
  let hopped = false;
  let hoppingInRift = false;
  let wardenOnBridge = false;
  run(w, 14, (ww, ev) => {
    if (ev.some((e) => e.type === 'hop' && e.id === ram.id)) hopped = true;
    if (ram.alive && ram.hop > 0 && inRift(ram.x, ram.z)) hoppingInRift = true;
    if (war.alive && Math.abs(war.z) < ARENA.RIFT_HALF) wardenOnBridge = true;
    assertNoRift(ww);
  });
  assert.ok(hopped);
  assert.ok(hoppingInRift);
  assert.ok(wardenOnBridge);
  assert.ok(ram.z < 0, 'ramhorn crossed');
  assert.ok(war.z < 0, 'warden crossed');
});

test('ability: kamikaze dies when its blow lands', () => {
  const w = new World({ seed: 1 });
  quietTowers(w);
  const wisp = w.addEntity('sparkwisp', 0, 0, 6);
  const a = dummy(w, 'warden', 1, 0, 4);
  const b = dummy(w, 'warden', 1, 1.2, 4);
  const ev = run(w, 2);
  assert.equal(wisp.alive, false);
  assert.equal(w.getEntity(wisp.id), undefined);
  assert.ok(ev.some((e) => e.type === 'death' && e.id === wisp.id));
  assert.equal(a.hp, a.maxHp - UNITS.sparkwisp.dmg);
  assert.equal(b.hp, b.maxHp - UNITS.sparkwisp.dmg);
});

test('ability: heal pulses restore allies only', () => {
  const w = new World({ seed: 1 });
  quietTowers(w);
  const bt = w.addEntity('bloomtender', 0, -7, 13);
  bt.stunned = 0;
  const ally = dummy(w, 'warden', 0, -6, 13);
  ally.hp = 500;
  const foe = dummy(w, 'warden', 1, -8, 12);
  foe.hp = 500;
  const ev = run(w, 1.55);
  assert.ok(ev.some((e) => e.type === 'heal' && e.id === bt.id && e.healed === 1));
  assert.equal(ally.hp, 500 + UNITS.bloomtender.heal.amount);
  assert.ok(foe.hp <= 500);
  ally.hp = ally.maxHp - 10;
  run(w, 1.5);
  assert.equal(ally.hp, ally.maxHp);
});

test('ability: spawners (troop and building)', () => {
  const w = new World({ seed: 1 });
  quietTowers(w);
  const gw = w.addEntity('gearwright', 0, -7, 13);
  const nest = w.addEntity('nest', 0, 3, 6);
  dummy(w, 'colossus', 1, 3, 3); // Goblin Hut activates when enemies enter range.
  let ev = run(w, 1.05);
  const s1 = ev.filter((e) => e.type === 'spawn');
  assert.equal(s1.filter((e) => e.entType === 'mite').length, 4);
  assert.equal(s1.filter((e) => e.entType === 'speargoblin').length, 1);
  const glim = w.getEntity(s1.find((e) => e.entType === 'speargoblin').id);
  assert.ok(glim.z < nest.z, 'spawned on the enemy-facing side');
  assert.equal(glim.state, 'deploy');
  ev = run(w, 2.2);
  assert.equal(ev.filter((e) => e.type === 'spawn' && e.entType === 'speargoblin').length, 1);
  gw.stunned = 10;
  ev = run(w, 6);
  assert.equal(ev.filter((e) => e.type === 'spawn' && e.entType === 'mite').length, 0, 'paused while stunned');
});

test('ability: landing damages and shoves ground enemies', () => {
  const w = new World({ seed: 1 });
  quietTowers(w);
  giveCard(w, 0, 'titan');
  const a = dummy(w, 'warden', 1, -3, 5);
  const z = dummy(w, 'zephyr', 1, -5, 4);
  w.playCard(0, 0, -5, 5);
  const titan = w.entities.find((e) => e.type === 'titan');
  assert.equal(titan.state, 'deploy');
  let landing = null;
  until(w, (ww, ev) => !!(landing = ev.find((e) => e.type === 'landing')), 2);
  assert.ok(landing);
  assert.equal(landing.id, titan.id);
  assert.equal(a.hp, a.maxHp - UNITS.titan.landing.dmg);
  assert.equal(z.hp, z.maxHp);
  run(w, 0.3);
  assert.ok(a.x > -3 + 0.2, 'knocked away from the landing');
});

test('ability: deathSpawn and deathBlast', () => {
  const w = new World({ seed: 1 });
  quietTowers(w);
  const pod = dummy(w, 'podstrider', 1, 3, -5);
  w._damage(pod, 1e9, 0);
  let ev = run(w, SIM_DT);
  const sprouts = ev.filter((e) => e.type === 'spawn' && e.entType === 'sproutling');
  assert.equal(sprouts.length, UNITS.podstrider.deathSpawn.count);
  for (const s of sprouts) {
    const e = w.getEntity(s.id);
    assert.equal(e.team, 1);
    assert.equal(e.state, 'deploy');
    assert.ok(near(e.deployLeft, 0.4));
  }

  const w2 = new World({ seed: 1 });
  quietTowers(w2);
  const boil = dummy(w2, 'boilerback', 1, 0, 5);
  const vic = dummy(w2, 'warden', 0, 0, 6.6);
  w2._damage(boil, 1e9, 0);
  ev = run(w2, SIM_DT);
  assert.ok(ev.some((e) => e.type === 'fuse' && e.team === 1));
  assert.equal(w2.pending.filter((p) => p.kind === 'fuse').length, 1);
  ev = run(w2, UNITS.boilerback.deathBlast.delay - 0.1);
  assert.equal(vic.hp, vic.maxHp);
  ev = run(w2, 0.15);
  assert.ok(ev.some((e) => e.type === 'blast'));
  assert.equal(vic.hp, vic.maxHp - UNITS.boilerback.deathBlast.dmg);
});

test('ability: building lifetime expiry', () => {
  const w = new World({ seed: 1 });
  quietTowers(w);
  const s = w.addEntity('sentry', 0, 0, 6);
  assert.equal(s.lifeMax, UNITS.sentry.lifetime);
  run(w, UNITS.sentry.lifetime - 0.1);
  assert.ok(s.alive);
  assert.ok(s.lifeLeft > 0 && s.lifeLeft < 0.2);
  const ev = run(w, 0.2);
  assert.equal(s.alive, false);
  assert.ok(ev.some((e) => e.type === 'death' && e.id === s.id));
});

test('ability: tunnel delay then deploy, reduced tower damage', () => {
  const w = new World({ seed: 1 });
  quietTowers(w);
  giveCard(w, 0, 'drillworm');
  const r = w.canPlay(0, 0, 5, -6.5);
  assert.equal(w.playCard(0, 0, 5, -6.5), true);
  const ev0 = w.drainEvents();
  const tun = ev0.find((e) => e.type === 'tunnel');
  assert.ok(tun);
  const from = towerPosition(0, 'citadel');
  const dur = Math.hypot(r.x - from.x, r.z - from.z) / UNITS.drillworm.tunnelSpeed;
  assert.ok(near(tun.duration, dur));
  assert.equal(w.pending.filter((p) => p.kind === 'tunnel').length, 1);
  run(w, dur - 0.1);
  assert.equal(w.entities.filter((e) => e.type === 'drillworm').length, 0);
  run(w, 0.15);
  const dw = w.entities.find((e) => e.type === 'drillworm');
  assert.ok(dw);
  assert.equal(dw.state, 'deploy');
  const ev = run(w, 3);
  const spire = w.towers[1].right;
  const hits = damageTo(ev, spire.id, 'drillworm');
  assert.ok(hits.length > 0);
  assert.ok(near(hits[0].amount, UNITS.drillworm.dmg * UNITS.drillworm.towerDmgMult));
});

// ───────────────────────────── spells ─────────────────────────────

function cast(w, team, cardId, x, z) {
  giveCard(w, team, cardId);
  assert.equal(w.playCard(team, 0, x, z), true);
  return CARD_BY_ID[cardId].spell;
}

test('spell: comet damage, tower multiplier and knockback direction', () => {
  const w = new World({ seed: 1 });
  quietTowers(w);
  const a = dummy(w, 'warden', 1, 0, -4);
  const b = dummy(w, 'warden', 1, 1.5, -4);
  const far = dummy(w, 'warden', 1, 4, -4);
  const s = cast(w, 0, 'comet', 0, -4);
  run(w, s.delay - 0.1);
  assert.equal(a.hp, a.maxHp);
  const ev = run(w, 0.5);
  assert.ok(ev.some((e) => e.type === 'spellImpact' && e.kind === 'comet'));
  assert.equal(a.hp, a.maxHp - s.damage);
  assert.equal(b.hp, b.maxHp - s.damage);
  assert.equal(far.hp, far.maxHp);
  assert.ok(b.x > 1.5 + 0.2, `knocked +x: ${b.x}`);

  const spire = w.towers[1].right;
  cast(w, 0, 'comet', spire.x, spire.z);
  run(w, s.delay + 0.1);
  assert.ok(near(spire.hp, spire.maxHp - s.damage * s.towerMult));
});

test('spell: shardstorm waves', () => {
  const w = new World({ seed: 1 });
  quietTowers(w);
  const a = dummy(w, 'warden', 1, 0, -4);
  const s = cast(w, 0, 'shardstorm', 0, -4);
  const times = [];
  run(w, 2, (ww, ev) => { for (const e of ev) if (e.type === 'spellImpact') times.push([ww.time, e.wave, e.waves]); });
  assert.equal(times.length, s.waves);
  assert.deepEqual(times.map((t) => t[1]), [0, 1, 2]);
  assert.ok(times.every((t) => t[2] === s.waves));
  assert.ok(near(times[0][0], s.delay, SIM_DT + 1e-9));
  assert.ok(near(times[1][0] - times[0][0], s.waveGap, SIM_DT + 1e-9));
  assert.equal(a.hp, a.maxHp - s.damage * s.waves);
});

test('spell: stasis freezes enemies and expires', () => {
  const w = new World({ seed: 1 });
  quietTowers(w);
  const a = w.addEntity('warden', 1, 3, -4);
  const own = w.addEntity('warden', 0, 3.5, 5);
  const s = cast(w, 0, 'stasis', 3, -4);
  const ev = run(w, s.delay + 0.05);
  assert.ok(ev.some((e) => e.type === 'zone' && e.kind === 'stasis'));
  assert.ok(a.frozen > 3.0 && a.frozen <= 3.5);
  assert.equal(own.frozen, 0);
  assert.equal(w.zones.length, 1);
  const p = [a.x, a.z];
  run(w, 3.0);
  assert.deepEqual([a.x, a.z], p);
  run(w, 0.6);
  assert.equal(a.frozen, 0);
  assert.equal(w.zones.length, 0);
});

test('spell: jolt damages and stuns', () => {
  const w = new World({ seed: 1 });
  quietTowers(w);
  const a = w.addEntity('warden', 1, 3, -4);
  const s = cast(w, 0, 'jolt', 3, -4);
  run(w, s.delay + 0.02);
  assert.equal(a.hp, a.maxHp - s.damage);
  assert.ok(a.stunned > 0.4);
});

test('spell: overclock hastes allies only', () => {
  const w = new World({ seed: 1 });
  quietTowers(w);
  const ally = dummy(w, 'warden', 0, 3, 5);
  const foe = dummy(w, 'warden', 1, 3.5, 6);
  const s = cast(w, 0, 'overclock', 3, 5);
  const ev = run(w, s.delay + 0.1);
  assert.ok(ev.some((e) => e.type === 'zone' && e.kind === 'overclock'));
  assert.ok(near(ally.hastePct, s.haste));
  assert.ok(ally.hasteT > 0);
  assert.equal(foe.hasteT, 0);
  assert.equal(w.towers[0].right.hasteT, 0);
  run(w, s.duration + 1);
  assert.equal(ally.hasteT, 0);
  assert.equal(ally.hastePct, 0);
});

test('spell: blight damage over time and slow', () => {
  const w = new World({ seed: 1 });
  quietTowers(w);
  const a = dummy(w, 'warden', 1, 3, -4);
  const s = cast(w, 0, 'blight', 3, -4);
  run(w, s.delay + 2 + 0.02);
  assert.ok(near(a.hp, a.maxHp - 2 * 92, 1e-6), `hp ${a.hp}`);
  assert.ok(near(a.slowPct, s.slow));
  run(w, s.duration);
  assert.ok(near(a.hp, a.maxHp - (s.duration / s.tick) * s.dps * s.tick, 1e-6));
  assert.equal(w.zones.length, 0);
});

test('spell: maelstrom pulls toward the centre, heavy units less', () => {
  const w = new World({ seed: 1 });
  quietTowers(w);
  const mite = dummy(w, 'mite', 1, -3, -4);
  const col = dummy(w, 'colossus', 1, 3, -4);
  const s = cast(w, 0, 'maelstrom', 0, -4);
  run(w, s.delay + 1);
  const dm = 3 - Math.abs(mite.x);
  const dc = 3 - Math.abs(col.x);
  assert.ok(dm > 1.5, `mite pulled ${dm}`);
  assert.ok(dc > 0 && dc < dm * 0.5, `colossus pulled ${dc}`);
  assert.ok(mite.x <= 0 + 1e-9);
  run(w, s.duration);
  assert.ok(mite.x <= 1e-9 && mite.x >= -3);
  assert.ok(mite.hp < mite.maxHp);
});

test('spell: rockslide hits ground enemies once and shoves them along its direction', () => {
  const w = new World({ seed: 1 });
  quietTowers(w);
  const a = dummy(w, 'warden', 1, -5, 3);
  const b = dummy(w, 'warden', 1, -4, -3);
  const z = dummy(w, 'zephyr', 1, -5, 2);
  const s = cast(w, 0, 'rockslide', -5, 6);
  let roll = null;
  const ev = run(w, 3, (ww, e) => { roll = roll || e.find((x) => x.type === 'roll'); });
  assert.ok(roll);
  assert.equal(roll.dirZ, -1);
  assert.equal(damageTo(ev, a.id).length, 1);
  assert.equal(damageTo(ev, b.id).length, 1);
  assert.equal(damageTo(ev, z.id).length, 0);
  assert.equal(a.hp, a.maxHp - s.damage);
  assert.ok(a.z < 3 - 0.2, 'shoved along -z');
  assert.equal(w.rollers.length, 0);
  assertNoRift(w);
});

test('spell: Goblin Barrel spawns Goblins for the caster', () => {
  const w = new World({ seed: 1 });
  const s = cast(w, 1, 'seedpod', 2, 6);
  run(w, s.delay - 0.1);
  assert.equal(w.entities.filter((e) => e.type === 'goblin').length, 0);
  const ev = run(w, 0.15);
  const sp = w.entities.filter((e) => e.type === 'goblin');
  assert.equal(sp.length, s.count);
  assert.ok(sp.every((e) => e.team === 1 && e.state === 'deploy'));
  assert.ok(ev.some((e) => e.type === 'spellImpact' && e.kind === 'seedpod'));
});

test('spell: skyfork strikes the toughest enemies', () => {
  const w = new World({ seed: 1 });
  quietTowers(w);
  const col = dummy(w, 'colossus', 1, 0, -4);
  const war = dummy(w, 'warden', 1, 2, -4);
  const brk = dummy(w, 'breaker', 1, -2, -4);
  const mite = dummy(w, 'mite', 1, 0, -2);
  const s = cast(w, 0, 'skyfork', 0, -4);
  const ev = run(w, s.delay + 1);
  const imp = ev.filter((e) => e.type === 'spellImpact' && e.kind === 'skyfork');
  assert.equal(imp.length, 3);
  assert.equal(col.hp, col.maxHp - s.damage);
  assert.equal(war.hp, war.maxHp - s.damage);
  assert.equal(brk.hp, brk.maxHp - s.damage);
  assert.equal(mite.hp, mite.maxHp);
  assert.ok(imp.every((e) => e.cx === 0 && e.cz === -4));
});

// ───────────────────────────── physics ─────────────────────────────

test('physics: heavy units shove light ones', () => {
  const w = new World({ seed: 1 });
  const col = dummy(w, 'colossus', 0, 0, 6);
  const mite = dummy(w, 'mite', 0, 0.3, 6.2);
  const c0 = [col.x, col.z];
  const m0 = [mite.x, mite.z];
  run(w, 0.5);
  const dc = Math.hypot(col.x - c0[0], col.z - c0[1]);
  const dm = Math.hypot(mite.x - m0[0], mite.z - m0[1]);
  assert.ok(dm > 10 * dc, `mite ${dm} colossus ${dc}`);
  assert.ok(Math.hypot(col.x - mite.x, col.z - mite.z) >= (col.radius + mite.radius) * 0.95);
});

test('physics: a long brawl leaves no heavily overlapped ground units', () => {
  const w = new World({ seed: 21 });
  quietTowers(w);
  const plays = [[0, 'mites', -5, 3], [0, 'warden', -5, 4], [1, 'glimmers', -5, -3], [1, 'breaker', -5, -4],
    [1, 'prismguards', -4, -3], [0, 'podstrider', -6, 4]];
  for (const [t, c, x, z] of plays) cast(w, t, c, x, z);
  run(w, 25, (ww) => assertNoRift(ww));
  const g = w.entities.filter((e) => e.kind === 'unit' && !e.flying);
  for (let i = 0; i < g.length; i++) {
    for (let j = i + 1; j < g.length; j++) {
      const d = Math.hypot(g[i].x - g[j].x, g[i].z - g[j].z);
      assert.ok(d > (g[i].radius + g[j].radius) * 0.5, `${g[i].type} and ${g[j].type} overlap`);
    }
  }
});

test('physics: knockback respects the rift bank and the arena edge', () => {
  const w = new World({ seed: 1 });
  quietTowers(w);
  const bank = dummy(w, 'mite', 1, -2, 1.3);
  const edge = dummy(w, 'mite', 1, 8.6, 5);
  const s = cast(w, 0, 'comet', -2, 2.5);
  cast(w, 0, 'comet', 7.2, 5);
  run(w, s.delay + 0.5, (ww) => {
    assertNoRift(ww);
    for (const e of ww.entities) {
      assert.ok(Math.abs(e.x) <= ARENA.HALF_W && Math.abs(e.z) <= ARENA.HALF_L);
    }
  });
  // mites die to comet; use sturdier victims
  const w2 = new World({ seed: 1 });
  quietTowers(w2);
  const v1 = dummy(w2, 'warden', 1, -2, 1.3);
  const v2 = dummy(w2, 'warden', 1, 8.4, 5);
  cast(w2, 0, 'comet', -2, 2.8);
  cast(w2, 0, 'comet', 7.0, 5);
  run(w2, 1.6, (ww) => assertNoRift(ww));
  assert.ok(v1.z >= ARENA.RIFT_HALF - 1e-9, `bank z ${v1.z}`);
  assert.ok(v1.hp < v1.maxHp);
  assert.ok(v2.x <= ARENA.HALF_W - v2.radius + 1e-9);
  assert.ok(bank.alive === false || !inRift(bank.x, bank.z));
  assert.ok(edge.alive === false || edge.x <= ARENA.HALF_W - edge.radius + 1e-9);
});

test('physics: ground units slide around structures instead of sticking', () => {
  const w = new World({ seed: 1 });
  quietTowers(w);
  // directly behind its own spire, heading for the left bridge
  const war = w.addEntity('warden', 0, -5, 11.2);
  const ev = run(w, 20, (ww) => assertNoRift(ww));
  assert.ok(war.z < 0, `warden stuck at ${war.x}, ${war.z}`);
  assert.ok(damageTo(ev, w.towers[1].left.id).length > 0);
});

// ───────────────────────────── towers and match flow ─────────────────────────────

test('citadel: dormant until damaged; wakes when a spire falls', () => {
  const w = new World({ seed: 1 });
  const cit = w.towers[1].citadel;
  const foe = dummy(w, 'colossus', 0, 0, -8.5);
  foe.hp = foe.maxHp = 1e6;
  let ev = run(w, 3);
  assert.equal(cit.active, false);
  assert.equal(ev.filter((e) => e.type === 'attack' && e.id === cit.id).length, 0);
  w._damage(cit, 1, 0);
  assert.equal(cit.active, true);
  ev = w.drainEvents();
  assert.equal(ev.filter((e) => e.type === 'citadelWake').length, 1);
  ev = run(w, 3);
  assert.ok(ev.some((e) => e.type === 'attack' && e.id === cit.id));

  const w2 = new World({ seed: 1 });
  w2._damage(w2.towers[0].right, 1e9, 1);
  ev = run(w2, SIM_DT);
  const down = ev.find((e) => e.type === 'towerDown');
  assert.equal(down.team, 0);
  assert.equal(down.slot, 'right');
  assert.deepEqual(down.stars, [0, 1]);
  assert.equal(w2.players[1].stars, 1);
  assert.equal(w2.towers[0].citadel.active, true);
  assert.ok(ev.some((e) => e.type === 'citadelWake' && e.team === 0));
  assert.equal(w2.towers[0].right.alive, false);
  assert.ok(!w2.entities.includes(w2.towers[0].right));
});

test('match: citadel kill ends the match with 3 stars', () => {
  const w = new World({ seed: 1 });
  w._damage(w.towers[1].citadel, 1e9, 0);
  const ev = run(w, SIM_DT);
  assert.equal(w.phase, 'ended');
  assert.equal(w.winner, 0);
  assert.equal(w.players[0].stars, 3);
  const end = ev.find((e) => e.type === 'end');
  assert.deepEqual(end, { type: 'end', winner: 0, stars: [3, 0], reason: 'citadel' });
  const t = w.tick;
  w.step();
  assert.equal(w.tick, t, 'step is a no-op once ended');
  assert.equal(w.playCard(0, 0, 0, 5), false);
  assert.equal(w.canPlay(0, 0, 0, 5).reason, 'ended');
});

test('match: regulation timeout with a star lead', () => {
  const w = new World({ seed: 1 });
  w._damage(w.towers[0].left, 1e9, 1);
  run(w, SIM_DT);
  w.timeLeft = 0.05;
  const ev = run(w, 0.2);
  assert.equal(w.phase, 'ended');
  assert.equal(w.winner, 1);
  assert.equal(ev.find((e) => e.type === 'end').reason, 'stars');
});

test('match: full regulation with no plays goes to overtime then draws', () => {
  const w = new World({ seed: 1 });
  const ev = run(w, MATCH.REGULAR_TIME + MATCH.OVERTIME + 1);
  const phases = ev.filter((e) => e.type === 'phase').map((e) => e.phase);
  assert.deepEqual(phases, ['surge', 'overtime']);
  assert.equal(w.phase, 'ended');
  assert.equal(w.winner, 'draw');
  assert.equal(ev.find((e) => e.type === 'end').reason, 'draw');
  assert.ok(near(w.time, MATCH.REGULAR_TIME + MATCH.OVERTIME, SIM_DT * 1.5));
});

test('match: overtime sudden death and tiebreak', () => {
  const w = new World({ seed: 1 });
  w.timeLeft = 0.05;
  run(w, 0.1);
  assert.equal(w.phase, 'overtime');
  w._damage(w.towers[1].right, 1e9, 0);
  const ev = run(w, SIM_DT);
  assert.equal(w.phase, 'ended');
  assert.equal(w.winner, 0);
  assert.equal(ev.find((e) => e.type === 'end').reason, 'suddenDeath');

  const t = new World({ seed: 1 });
  t.timeLeft = 0.05;
  run(t, 0.1);
  t.towers[0].left.hp = 1000;
  t.timeLeft = 0.05;
  const ev2 = run(t, 0.1);
  assert.equal(t.winner, 1);
  assert.equal(ev2.find((e) => e.type === 'end').reason, 'tiebreak');
});

// ───────────────────────────── determinism ─────────────────────────────

function hashWorld(w) {
  let s = `${w.tick}|${w.phase}|${w.winner}|`;
  for (const e of w.entities) s += `${e.id}:${e.type}:${e.x.toFixed(6)},${e.z.toFixed(6)},${e.y.toFixed(4)}:${e.hp.toFixed(4)}:${e.shield.toFixed(3)};`;
  for (const p of w.players) s += `${p.aether.toFixed(6)}/${p.hand.join(',')}/${p.next}/${p.stars};`;
  for (const p of w.projectiles) s += `${p.id}:${p.x.toFixed(5)},${p.z.toFixed(5)};`;
  return s;
}

function scripted(seed, decks) {
  const w = new World({ seed, decks });
  const rng = new Rng(seed * 7 + 1);
  for (let i = 0; i < steps(90) && w.phase !== 'ended'; i++) {
    for (const team of [0, 1]) {
      if (rng.next() < 0.03) w.playCard(team, rng.int(4), rng.range(-9, 9), rng.range(-15, 15));
    }
    w.step();
    w.drainEvents();
  }
  return w;
}

test('determinism: same seed and plays give identical state', () => {
  const decks = [OPPONENTS[4].deck, OPPONENTS[2].deck];
  const a = scripted(42, decks);
  const b = scripted(42, decks);
  assert.ok(a.entities.length > 6);
  assert.equal(hashWorld(a), hashWorld(b));
  const c = scripted(43, decks);
  assert.notEqual(hashWorld(a), hashWorld(c));
});

test('rng: deterministic, ranges, shuffle is a permutation', () => {
  const a = new Rng(5);
  const b = new Rng(5);
  for (let i = 0; i < 100; i++) {
    const x = a.next();
    assert.equal(x, b.next());
    assert.ok(x >= 0 && x < 1);
  }
  for (let i = 0; i < 100; i++) {
    const n = a.int(7);
    assert.ok(Number.isInteger(n) && n >= 0 && n < 7);
    const r = a.range(-2, 3);
    assert.ok(r >= -2 && r < 3);
  }
  const arr = [1, 2, 3, 4, 5, 6];
  assert.equal(a.shuffle(arr), arr);
  assert.deepEqual([...arr].sort(), [1, 2, 3, 4, 5, 6]);
  assert.ok([1, 2, 3].includes(a.pick([1, 2, 3])));
  assert.equal(a.pick([]), undefined);
});

// ───────────────────────────── fuzz ─────────────────────────────

function checkInvariants(w) {
  for (const p of w.players) {
    assert.ok(Number.isFinite(p.aether) && p.aether >= 0 && p.aether <= MATCH.AETHER_MAX + 1e-9, `aether ${p.aether}`);
  }
  for (const e of w.entities) {
    assert.ok(e.alive, `dead ${e.type} left in entities`);
    for (const k of ['x', 'y', 'z', 'px', 'pz', 'hp', 'shield', 'facing', 'speedNow', 'cooldown', 'attackT', 'frozen', 'stunned', 'slowT', 'hasteT', 'rampT', 'chargeDist', 'hop']) {
      if (!Number.isFinite(e[k])) assert.fail(`${e.type}.${k} = ${e[k]} at tick ${w.tick}`);
    }
    assert.ok(Math.abs(e.x) <= ARENA.HALF_W + 1e-9 && Math.abs(e.z) <= ARENA.HALF_L + 1e-9, `${e.type} outside the arena`);
    assert.ok(e.hp >= 0 && e.hp <= e.maxHp + 1e-9, `${e.type} hp ${e.hp}`);
    if (e.kind === 'unit' && !e.flying && e.hop === 0 && inRift(e.x, e.z)) {
      assert.fail(`${e.type}#${e.id} in the rift at (${e.x}, ${e.z}) tick ${w.tick}`);
    }
  }
  for (const p of w.projectiles) {
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
  }
}

test('fuzz: 40 random matches keep every invariant and finish', () => {
  const allIds = CARDS.map((c) => c.id);
  const limit = steps(MATCH.REGULAR_TIME + MATCH.OVERTIME) + 5;
  for (let m = 0; m < 40; m++) {
    const rng = new Rng(1000 + m);
    const deckFor = (k) => (k < OPPONENTS.length ? OPPONENTS[k].deck.slice() : rng.shuffle(allIds.slice()).slice(0, 8));
    const decks = [deckFor(m % (OPPONENTS.length + 2)), deckFor((m + 3) % (OPPONENTS.length + 2))];
    const w = new World({ seed: m + 1, decks });
    const rate = 0.02 + 0.03 * rng.next();
    let n = 0;
    while (w.phase !== 'ended') {
      for (const team of [0, 1]) {
        if (rng.next() < rate) {
          const p = w.players[team];
          const afford = [];
          for (let i = 0; i < 4; i++) if (w.canPlay(team,i,0,team===0?5:-5).ok) afford.push(i);
          if (afford.length) {
            const i = rng.pick(afford);
            assert.equal(w.playCard(team, i, rng.range(-10, 10), rng.range(-16, 16)), true);
          }
        }
      }
      w.step();
      w.drainEvents();
      checkInvariants(w);
      n++;
      assert.ok(n <= limit, `match ${m} did not end`);
    }
    assert.ok(w.winner === 0 || w.winner === 1 || w.winner === 'draw');
  }
});
