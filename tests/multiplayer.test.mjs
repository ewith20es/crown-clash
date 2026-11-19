import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { MatchService, serveMatch } from '../tools/multiplayer.mjs';
import { OnlineWorld } from '../js/game/online-world.js';
import { DEFAULT_DECK } from '../js/data/cards.js';

function arena() {
  let time = 1000;
  const service = new MatchService(() => time);
  return {
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
  const refused = await fetch(url, { ...request, headers: { ...request.headers, Origin: 'https://another.example' } });
  assert.equal(refused.status, 403);
  assert.equal(refused.headers.get('Access-Control-Allow-Origin'), null);
});
