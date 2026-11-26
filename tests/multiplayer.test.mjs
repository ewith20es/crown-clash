import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { MatchService, serveMatch } from '../tools/multiplayer.mjs';
import { OnlineWorld, snapshot } from '../js/game/online-world.js';
import { World } from '../js/sim/world.js';
import { decodeUpdate, encodeUpdate, entityFields } from '../js/game/match-codec.js';
import { Multiplayer } from '../js/game/multiplayer.js';
import { MATCH, SIM_DT } from '../js/config.js';
import { CARD_BY_ID, DEFAULT_DECK } from '../js/data/cards.js';

function arena() {
  let time = 1000;
  const service = new MatchService(() => time);
  return {
    service,
    ask(player, op, fields = {}) {
      const data = { token: player.toString(16).padStart(32, '0'), op, deck: DEFAULT_DECK,
        towerTroop: player === 2 ? 'cannoneer' : 'tower-princess', ...fields };
      return JSON.parse(JSON.stringify(service.request(data)));
    },
    advance(ms) { time += ms; service.maintain(); },
  };
}

test('private codes and public opponents stay separate, with cancellation and one guest per room', () => {
  const { ask } = arena();
  const room = ask(1, 'create');
  assert.match(room.code, /^[A-Z2-9]{6}$/);
  assert.equal(ask(1, 'create').code, room.code);
  assert.equal(ask(2, 'find').status, 'waiting');
  assert.equal(ask(3, 'join', { code: room.code.toLowerCase() }).team, 1);
  assert.equal(ask(1, 'sync').team, 0);
  assert.throws(() => ask(4, 'join', { code: room.code }), /unavailable/);
  assert.equal(ask(4, 'find').team, 1);
  assert.equal(ask(2, 'sync').team, 0);
  ask(5, 'find');
  ask(5, 'leave');
  assert.equal(ask(6, 'find').status, 'waiting');
  const canceled = ask(7, 'create');
  ask(7, 'leave');
  assert.throws(() => ask(8, 'join', { code: canceled.code }), /unavailable/);
});

test('both players see, deploy, and finish the same authoritative battle; retries do not double-spend', () => {
  const { ask, advance } = arena();
  ask(1, 'find');
  ask(2, 'find');
  ask(1, 'sync', { ready: true });
  advance(1500);
  assert.equal(ask(1, 'sync').frame.tick, 0);
  ask(2, 'sync', { ready: true });
  advance(1050);
  const worlds = [new OnlineWorld(), new OnlineWorld()];
  for (let team = 0; team <= 1; team++) {
    const p = team + 1;
    const packet = ask(p, 'sync');
    assert.equal(packet.live, true);
    assert.deepEqual(Object.keys(packet.frame.players[1-team]), ['stars']);
    const w = worlds[team];
    w.apply(packet.frame);
    assert.equal(w.towers[1].left.type, 'cannoneer');
    const x = 4, z = team === 0 ? 5 : -5;
    const hand = w.players[team].hand;
    const index = hand.findIndex((_, i) => w.canPlay(team, i, x, z).ok);
    const command = { seq: 1, type: 'card', index, card: hand[index], x, z };
    assert.equal(ask(p, 'sync', { command }).accepted, true);
    assert.equal(ask(p, 'sync', { command }).frame.stats[team].cardsPlayed, 1);
    assert.equal(ask(p, 'sync', { command: { ...command, seq: 2 } }).accepted, false);
  }
  advance(200);
  const frames = [ask(1, 'sync'), ask(2, 'sync')];
  assert.deepEqual(frames[0].frame.entities, frames[1].frame.entities);
  assert.deepEqual(frames[0].frame.stats.map(s => s.cardsPlayed), [1, 1]);
  assert.deepEqual(ask(1, 'sync', { cursor: frames[0].cursor }).events, []);
  ask(2, 'sync', { command: { seq: 3, type: 'surrender' } });
  for (const p of [1, 2]) {
    const result = ask(p, 'sync').frame;
    assert.equal(result.winner, 0);
    assert.equal(result.endReason, 'surrender');
  }
});

test('a placement is sent to both streams before the next tick and a retry sends it only once', () => {
  const { service, ask, advance } = arena();
  ask(1, 'find'); ask(2, 'find');
  ask(1, 'sync', { ready: true }); ask(2, 'sync', { ready: true });
  advance(1000);
  const match = [...service.matches][0];
  const delivered = [[], []];
  for (const p of match.players) {
    p.flushStream = () => delivered[p.team].push(service.update(p, { cursor: 0 }));
  }
  const world = match.world, tick = world.tick, x = 4, z = 6;
  const index = world.players[0].hand.findIndex((_, i) => {
    const move = world.canPlay(0, i, x, z);
    return move.ok && move.deployment.type === 'troop';
  });
  const command = { type: 'card', seq: 1, card: world.players[0].hand[index], index, x, z };
  assert.ok(ask(1, 'sync', { command, ackOnly: true }).accepted);
  ask(1, 'sync', { command, ackOnly: true });
  for (const packets of delivered) {
    assert.equal(packets.length, 1);
    assert.equal(packets[0].frame.tick, tick);
    assert.equal(packets[0].events.filter(e => e.type === 'cardPlayed').length, 1);
    assert.ok(packets[0].events.some(e => e.type === 'spawn'));
  }
  assert.equal(ask(1, 'sync', { command: { ...command, seq: 2 }, ackOnly: true }).accepted, false);
  assert.deepEqual(delivered.map(packets => packets.length), [2, 1]);
});

test('online cards use the paid form even when the server balance crosses its threshold', () => {
  const { service, ask, advance } = arena();
  ask(1, 'find', { localElixir: true }); ask(2, 'find');
  ask(1, 'sync', { ready: true }); ask(2, 'sync', { ready: true });
  advance(1000);
  const w = [...service.matches][0].world;
  const card = CARD_BY_ID['spirit-empress'];
  const p = w.players[0];
  for (const [i, boosted] of [true, false].entries()) {
    p.hand[0] = card.id;
    p.aether = boosted ? 0 : 10;
    if (boosted) assert.equal(w.canPlay(0, 0, 3, 5).reason, 'aether');
    const command = { seq: i + 1, type: 'card', card: card.id, index: 0, x: 3, z: 5, boosted };
    const result = ask(1, 'sync', { command });
    assert.equal(result.accepted, true);
    assert.equal(result.events.filter(e => e.type === 'spawn').at(-1).entType,
      boosted ? card.dualForm.unit : card.dualForm.ground);
    const replay = ask(1, 'sync', { command });
    assert.equal(replay.frame.stats[0].cardsPlayed, i + 1);
    assert.deepEqual(ask(2, 'sync').frame.entities, replay.frame.entities);
  }
  assert.equal(w.stats[0].aetherSpent, card.dualForm.cost + card.cost);
});

test('local elixir funds consecutive drops, reconciles grants and refunds, and keeps stale deltas immutable', () => {
  const w = new World(), view = new OnlineWorld();
  const p = w.players[0];
  Object.assign(p, { aether: 5, hand: ['skeletons', 'scouts', 'comet', 'colossus'], next: 'warden',
    queue: ['longshot', 'breaker', 'shardstorm'] });
  const meta = { localElixir: true, live: true, seq: 0, accepted: false, cursor: 0, events: [] };
  let server, client, serial = 0;
  const pending = [];
  function sync(rejected = false) {
    const encoded = encodeUpdate(w, 0, meta, ++serial, server);
    const { packet, baseline } = decodeUpdate(JSON.parse(JSON.stringify(encoded.wire)), client);
    server = encoded.baseline;
    client = baseline;
    view.apply(packet.frame);
    view.syncElixir(packet, pending, rejected);
    return encoded.wire;
  }
  function drop(index) {
    const res = view.canPlay(0, index, 3, 5);
    assert.ok(res.ok);
    const move = { handIndex: index, card: res.card, cost: res.cost };
    pending.push(move);
    view.spend(0, move);
    return move.cost;
  }
  sync();
  const paid = drop(0) + drop(1);
  assert.equal(view.players[0].aether, 5 - paid);
  assert.deepEqual(view.players[0].hand.slice(0, 2), ['warden', 'longshot']);
  assert.equal(view.canPlay(0, 2, 3, 5).reason, 'aether');
  assert.deepEqual(client.parts[10][0], p.hand);
  const wire = sync();
  assert.equal(wire[4], 0);
  assert.equal(view.players[0].aether, 5 - paid);
  view.updateMovement(.28);
  view.refillElixir(0);
  assert.ok(Math.abs(view.players[0].aether - (5 - paid + .1)) < 1e-8);
  w.step();
  assert.equal(sync()[4] & (1 << 11), 0, 'passive refill uses zero payload fields');
  assert.ok(w.playCard(0, 0, 3, 5, { checkElixir: false }));
  meta.seq++; meta.accepted = true;
  pending.shift();
  sync();
  assert.ok(Math.abs(view.players[0].aether - (p.aether - pending[0].cost)) < 1e-8);
  p.aether += 1; // collector or death grant while the second card is in flight
  assert.ok(sync()[4] & (1 << 11));
  const withGrant = view.players[0].aether;
  sync();
  assert.equal(view.players[0].aether, withGrant);
  meta.seq++; meta.accepted = false;
  pending.length = 0;
  sync(true);
  assert.deepEqual(view.players[0], p);
  for (const phase of ['surge', 'overtime']) {
    w.phase = phase;
    sync();
    view.updateMovement(.28);
    view.refillElixir(0);
    assert.ok(Math.abs(view.players[0].aether - (p.aether + .2)) < 1e-8);
    for (let i = 0; i < 9; i++) w.step();
    sync();
  }
  p.aether = MATCH.AETHER_MAX - .05;
  sync();
  view.updateMovement(.5); view.refillElixir(0);
  assert.equal(view.players[0].aether, MATCH.AETHER_MAX);
});

test('queued drops retain their order and a rejected drop cancels dependent commands', () => {
  const sent = [], denied = [];
  const net = new Multiplayer({ frame() {}, connection() {}, denied: m => denied.push(m.seq) });
  const s = net.session = { active: true, seq: 0, queue: [], stream: {} };
  net.postMove = (_, m) => sent.push(m.seq);
  const drop = () => net.send({ type: 'card' });
  const reply = (seq, accepted) => net.receive(s, { seq, accepted, live: true, frame: { phase: 'regular' } });
  assert.deepEqual([drop(), drop(), drop()], [1, 2, 3]);
  assert.deepEqual(sent, [1]);
  reply(1, true); reply(1, true);
  assert.deepEqual(sent, [1, 2]);
  reply(2, false);
  assert.equal(s.command, null);
  assert.deepEqual(denied, [2]);
  assert.equal(drop(), 3);
  reply(2, false); reply(3, true);
  assert.deepEqual(sent, [1, 2, 3]);
  assert.deepEqual(denied, [2]);
});

test('disconnect grace, expired rooms and finished match cleanup', () => {
  const { ask, advance } = arena();
  const room = ask(3, 'create');
  ask(1, 'find'); ask(2, 'find');
  advance(44_000);
  assert.equal(ask(1, 'sync').frame.phase, 'regular');
  advance(1100);
  assert.equal(ask(1, 'sync').frame.endReason, 'disconnect');
  assert.equal(ask(2, 'sync').frame.winner, 0);
  assert.throws(() => ask(4, 'join', { code: room.code }), /unavailable/);
  advance(121_000);
  assert.throws(() => ask(1, 'sync'), /expired/);
});

test('early snapshots resume from the displayed positions of troops and projectiles', () => {
  const server = new World();
  const troop = server.addEntity('mite', 0, 2, 6);
  const bolt = { id: 99, x: 2, y: 1, z: 6, px: 2, py: 1, pz: 6 };
  server.projectiles.push(bolt);
  const view = new OnlineWorld();
  view.apply(snapshot(server, 0));
  troop.x = bolt.x = 4;
  bolt.px = 3.9;
  view.apply(snapshot(server, 0));
  troop.x = bolt.x = 5;
  bolt.px = 4.9;
  view.apply(snapshot(server, 0), .25);
  assert.equal(view.getEntity(troop.id).px, 2.5);
  assert.equal(view.projectiles[0].px, 2.5);
  assert.equal(view.getEntity(troop.id).x, 5);
});

test('a walking troop keeps moving through jitter while its authoritative position updates immediately', () => {
  const server = new World();
  const troop = server.addEntity('mite', 0, 0, 6);
  const view = new OnlineWorld();
  let next = 0, lastX = 0;
  // A 60 Hz display, 10 Hz snapshots, and an extra four display frames of
  // network delay on alternate replies. Walk one tile per second.
  for (let frame = 0; frame <= 300; frame++) {
    if (frame >= next * 6 + (next % 2 ? 4 : 0)) {
      server.time = next++ / 10;
      troop.x = server.time;
      view.apply(snapshot(server, 0));
      assert.equal(view.getEntity(troop.id).x, troop.x);
    }
    view.updateMovement(1 / 60);
    const x = view.getEntity(troop.id).drawX;
    if (frame > 60) assert.ok(x > lastX && x - lastX <= 1.11 / 60);
    lastX = x;
  }
  server.time += 2;
  troop.x = 7;
  view.apply(snapshot(server, 0));
  view.updateMovement(1 / 60);
  assert.equal(view.getEntity(troop.id).drawX, 7);
});

test('Pages origin can preflight and create a room on the separately hosted API', async t => {
  const pages = 'https://ewith20es.github.io';
  const service = new MatchService();
  const server = http.createServer((req, res) => serveMatch(req, res, service, pages));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = 'http://127.0.0.1:' + server.address().port + '/api/match';
  const preflight = await fetch(url, { method: 'OPTIONS', headers: { Origin: pages,
    'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), pages);
  const request = { method: 'POST', headers: { Origin: pages, 'Content-Type': 'application/json' },
    body: JSON.stringify({ op: 'create', token: 'a'.repeat(32), deck: DEFAULT_DECK, towerTroop: 'tower-princess' }) };
  const room = await fetch(url, request);
  assert.equal(room.headers.get('Access-Control-Allow-Origin'), pages);
  assert.match((await room.json()).code, /^[A-Z2-9]{6}$/);
  const joiner = { ...JSON.parse(request.body), token: 'b'.repeat(32), op: 'find' };
  service.request(joiner);
  service.request({ ...joiner, token: 'c'.repeat(32) });
  const sync = { ...request, body: JSON.stringify({ token: joiner.token, op: 'sync' }) };
  const zipped = await fetch(url, { ...sync, headers: { ...sync.headers, 'Accept-Encoding': 'gzip' } });
  assert.equal(zipped.headers.get('Content-Encoding'), 'gzip');
  const plain = await fetch(url, { ...sync, headers: { ...sync.headers, 'Accept-Encoding': 'gzip;q=0' } });
  assert.equal(plain.headers.get('Content-Encoding'), null);
  assert.deepEqual(await zipped.json(), await plain.json());
  const refused = await fetch(url, { ...request, headers: { ...request.headers, Origin: 'https://another.example' } });
  assert.equal(refused.status, 403);
  assert.equal(refused.headers.get('Access-Control-Allow-Origin'), null);
});

test('compact frames recover lost updates and retain exact game state for each team', () => {
  const { ask, advance } = arena();
  ask(1, 'find'); ask(2, 'find');
  const clients = [{}, {}];
  function sync(team, fields = {}) {
    const client = clients[team];
    const { wire } = ask(team + 1, 'sync', { v: 1, base: client.serial, cursor: client.cursor, ...fields });
    const { packet, baseline } = decodeUpdate(wire, client.baseline);
    Object.assign(client, { baseline, serial: baseline.serial, cursor: packet.cursor });
    return { packet, wire };
  }
  for (let t = 0; t < 2; t++) sync(t, { ready: true });
  advance(1000);
  for (let t = 0; t < 2; t++) {
    const { packet } = sync(t);
    const w = new OnlineWorld();
    w.apply(packet.frame);
    const index = w.players[t].hand.findIndex((_, i) => w.canPlay(t, i, 4, t ? -5 : 5).ok);
    const command = { seq: 1, type: 'card', index, card: w.players[t].hand[index], x: 4, z: t ? -5 : 5 };
    const { wire: lost } = ask(t + 1, 'sync', { v: 1, base: clients[t].serial, command });
    assert.equal(lost[0], clients[t].serial);
    // Repeat after losing the response, including when multiple actions share a sim tick.
    const recovered = sync(t, { command });
    assert.equal(recovered.wire[0], 0);
    assert.equal(recovered.packet.frame.stats[t].cardsPlayed, 1);
    assert.ok(recovered.packet.events.some(e => e.type === 'cardPlayed' && e.team === t));
  }
  for (let n = 0; n < 280; n++) {
    advance(100);
    const frames = clients.map((_, t) => {
      const { packet, wire } = sync(t);
      assert.ok(wire[0] > 0);
      const actual = ask(t + 1, 'sync', { cursor: packet.cursor }).frame;
      const f = packet.frame;
      assert.deepEqual(f.players, actual.players);
      assert.deepEqual(f.stats, actual.stats);
      assert.deepEqual(f.abilities, actual.abilities);
      assert.equal(f.phase, actual.phase);
      assert.equal(f.winner, actual.winner);
      assert.deepEqual(f.entities.map(e => e[0]), actual.entities.map(e => e[0]));
      for (let i = 0; i < f.entities.length; i++) {
        for (const [k, key] of entityFields.entries()) {
          const v = f.entities[i][k], expected = actual.entities[i][k];
          if (v !== expected) {
            assert.ok(['x','y','z','facing','stateTime','attackT','deployLeft','lifeLeft','speedNow','rampT','hop'].includes(key), key);
            assert.ok(Math.abs(v - expected) <= .001, key);
          }
        }
      }
      return f;
    });
    assert.deepEqual(frames[0].entities, frames[1].entities);
    assert.deepEqual(frames[0].projectiles, frames[1].projectiles);
  }
});

test('delta size depends on what moved, and expired entities disappear from the client', () => {
  const w = new World();
  const troop = w.addEntity('mite', 0, 4, 6);
  const meta = { live: true, seq: 0, cursor: 0, events: [] };
  let server, client, serial = 0;
  const next = () => {
    const result = encodeUpdate(w, 0, meta, ++serial, server);
    const wire = JSON.parse(JSON.stringify(result.wire));
    const decoded = decodeUpdate(wire, client);
    server = result.baseline;
    client = decoded.baseline;
    return { wire, frame: decoded.packet.frame };
  };
  next();
  assert.ok(JSON.stringify(next().wire).length < 20);
  troop.z -= .05;
  const move = next();
  assert.ok(JSON.stringify(move.wire).length < 40);
  assert.equal(move.wire[3].length, 1);
  assert.throws(() => decodeUpdate(move.wire, null), /Missing arena update/);
  w._kill(troop);
  w.step();
  const removed = next();
  assert.ok(removed.wire[3].includes(-troop.id));
  assert.ok(!removed.frame.entities.some(e => e[0] === troop.id));
});

test('steady walks continue through a delayed stream update and stop on a prolonged outage', () => {
  const server = new World(), view = new OnlineWorld();
  const troop = server.addEntity('mite', 0, 0, 6);
  Object.assign(troop, { state: 'move', speedNow: 1 });
  let last = 0;
  for (let frame = 0; frame < 180; frame++) {
    if (frame % 4 === 0 && (frame < 112 || frame >= 122)) {
      server.time = frame / 60;
      troop.x = server.time;
      view.apply(snapshot(server, 0));
    }
    view.updateMovement(1 / 60);
    const now = view.getEntity(troop.id).drawX;
    if (frame > 60) assert.ok(now > last && now - last < .024, 'abrupt stride at frame ' + frame);
    last = now;
  }
  for (let i = 0; i < 90; i++) view.updateMovement(1 / 60);
  const e = view.getEntity(troop.id);
  assert.ok(e.drawX <= e.x + .171);
  assert.ok(e.drawSpeed < 1e-9);
  server.time += 2;
  troop.x = 4;
  view.apply(snapshot(server, 0));
  view.updateMovement(1 / 60);
  assert.equal(e.drawX, 4);
});

test('two clients stream a match and recover a broken stream and lost move reply', async t => {
  const service = new MatchService();
  const streams = new Map();
  const server = http.createServer((req, res) => serveMatch(req, res, service));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port + '/api/match';
  const ticker = setInterval(() => service.maintain(), 1000 * SIM_DT);
  const fetchLocal = globalThis.fetch;
  let dropAck = true;
  t.mock.method(globalThis, 'fetch', async (_endpoint, options) => {
    const data = JSON.parse(options.body);
    const response = await fetchLocal(url, options);
    if (data.op === 'watch') streams.set(data.token, response.headers.get('content-encoding'));
    if (data.ackOnly && dropAck) {
      dropAck = false;
      await response.text();
      throw Error('Lost response');
    }
    return response;
  });
  const views = [new OnlineWorld(), new OnlineWorld()];
  const frames = [], errors = [];
  const clients = views.map((view, i) => new Multiplayer({
    wait() {}, connection() {}, denied() { errors.push('move denied'); }, error(e) { errors.push(e); },
    frame(packet) { view.apply(packet.frame); frames[i] = packet; },
  }));
  t.after(() => {
    for (const c of clients) c.stop(false);
    clearInterval(ticker);
    server.closeAllConnections();
    return new Promise(resolve => server.close(resolve));
  });
  async function until(fn) {
    const deadline = Date.now() + 6000;
    while (!fn()) {
      assert.deepEqual(errors, []);
      assert.ok(Date.now() < deadline, 'timed out waiting for match');
      await new Promise(resolve => setTimeout(resolve, 15));
    }
  }
  for (const client of clients) client.start('find', { deck: DEFAULT_DECK, towerTroop: 'tower-princess' });
  await until(() => frames[0]?.live && frames[1]?.live);
  assert.deepEqual([...streams.values()], ['gzip', 'gzip']);
  const team = frames[0].team, z = team ? -6 : 6;
  const hand = views[0].players[team].hand;
  const index = hand.findIndex((_, i) => views[0].canPlay(team, i, 4, z).ok);
  assert.ok(clients[0].send({ type: 'card', index, card: hand[index], x: 4, z }));
  await until(() => views.every(v => v.stats[team].cardsPlayed === 1) && !clients[0].session.command);
  assert.equal(dropAck, false);
  clients[1].session.stream.abort(); // proxy disconnects mid-match
  await until(() => clients[1].session.pollOnly && !clients[1].session.stream);
  clients[1].surrender();
  await until(() => views.every(v => v.phase === 'ended'));
  assert.deepEqual(views.map(v => [v.winner, v.endReason, v.stats[team].cardsPlayed]),
    [[team, 'surrender', 1], [team, 'surrender', 1]]);
  assert.deepEqual(errors, []);
});
