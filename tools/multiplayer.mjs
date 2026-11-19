import { randomInt } from 'node:crypto';
import { World } from '../js/sim/world.js';
import { SIM_DT } from '../js/config.js';
import { CARD_BY_ID, isValidDeck } from '../js/data/cards.js';
import { snapshot } from '../js/game/online-world.js';

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const towers = ['tower-princess', 'cannoneer', 'dagger-duchess', 'royal-chef'];
const grace = 45_000;

function fail(status, message) { throw Object.assign(new Error(message), { status }); }

export class MatchService {
  constructor(now = Date.now) {
    this.now = now;
    this.players = new Map();
    this.rooms = new Map();
    this.queue = new Set();
    this.matches = new Set();
  }

  removeWaiting(p) {
    this.queue.delete(p);
    if (p.code) this.rooms.delete(p.code);
    p.code = null;
  }

  pair(a, b) {
    const players = [a, b];
    const world = new World({ seed: randomInt(1, 0x7fffffff), decks: players.map(p => p.deck),
      towerTroops: players.map(p => p.towerTroop) });
    const match = { players, world, cursor: 0, batches: [], start: null, finished: null };
    players.forEach((p, team) => {
      this.removeWaiting(p);
      Object.assign(p, { match, team, ready: false, seq: 0 });
    });
    this.matches.add(match);
  }

  collect(m) {
    const events = m.world.drainEvents();
    if (events.length) {
      m.batches.push({ cursor: ++m.cursor, events });
      if (m.batches.length > 100) m.batches.shift();
    }
    if (m.world.phase === 'ended' && m.finished === null) m.finished = this.now();
  }

  end(m, winner, reason) {
    if (m.world.phase !== 'ended') {
      m.world._end(winner, reason);
      this.collect(m);
    }
  }

  maintain() {
    const now = this.now();
    for (const p of this.players.values()) {
      if (!p.match && now - p.seen >= grace) {
        this.removeWaiting(p);
        this.players.delete(p.token);
      }
    }
    for (const m of this.matches) {
      if (m.finished !== null) {
        if (now - m.finished > 120_000) {
          for (const p of m.players) this.players.delete(p.token);
          this.matches.delete(m);
        }
        continue;
      }
      const missing = m.players.map(p => now - p.seen >= grace);
      if (missing.some(Boolean)) {
        this.end(m, missing.every(Boolean) ? 'draw' : missing[0] ? 1 : 0, 'disconnect');
      } else if (m.start !== null) {
        const until = Math.floor((now - m.start) / (SIM_DT * 1000));
        for (let i = 0; i < 12 && m.world.tick < until && m.world.phase !== 'ended'; i++) m.world.step(SIM_DT);
        this.collect(m);
      }
    }
  }

  request(data) {
    const { op, token } = data ?? {};
    if (typeof token !== 'string' || !/^[a-f0-9]{32}$/.test(token)) fail(400, 'Invalid player session.');
    const now = this.now();
    let p = this.players.get(token);
    if (['create', 'find', 'join'].includes(op)) {
      if (!p) {
        if (!Array.isArray(data.deck) || !data.deck.every(id => typeof id === 'string' && Object.hasOwn(CARD_BY_ID, id))
            || !isValidDeck(data.deck) || !towers.includes(data.towerTroop)) fail(400, 'Choose a valid battle deck and tower troop.');
        if (this.players.size >= 512) fail(503, 'The arena is full. Try again shortly.');
        let other;
        if (op === 'join') {
          other = this.rooms.get(String(data.code).trim().toUpperCase());
          if (!other || now - other.seen >= grace) fail(404, 'Room unavailable. Check the code or ask for a new one.');
        }
        p = { token, deck: data.deck, towerTroop: data.towerTroop, seen: now };
        this.players.set(token, p);
        if (op === 'create') {
          do { p.code = Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join(''); }
          while (this.rooms.has(p.code));
          this.rooms.set(p.code, p);
        } else if (op === 'find') {
          other = [...this.queue].find(peer => now - peer.seen < grace);
          if (!other) this.queue.add(p);
        }
        if (other) this.pair(other, p);
      }
    } else if (!p) {
      if (op === 'leave') return { status: 'left' };
      fail(410, 'Your session expired. Open Multiplayer to play again.');
    }
    p.seen = now;
    const m = p.match;
    if (op === 'leave') {
      if (m) this.end(m, 1 - p.team, 'surrender');
      else { this.removeWaiting(p); this.players.delete(token); }
      return { status: 'left' };
    }
    if (!['create', 'find', 'join', 'sync'].includes(op)) fail(400, 'Unknown arena request.');
    if (!m) return { status: 'waiting', code: p.code ?? null };
    if (op === 'sync' && data.ready === true) {
      p.ready = true;
      if (m.start === null && m.players.every(peer => peer.ready)) m.start = now + 900;
    }
    const command = data.command;
    if (command && Number.isSafeInteger(command.seq) && command.seq === p.seq + 1) {
      p.seq = command.seq;
      p.accepted = false;
      const w = m.world;
      if (command.type === 'surrender') { this.end(m, 1 - p.team, 'surrender'); p.accepted = true; }
      else if (m.start !== null && now >= m.start && w.phase !== 'ended') {
        if (command.type === 'card' && Number.isInteger(command.index) && Number.isFinite(command.x) &&
            Number.isFinite(command.z) && command.card === w.players[p.team].hand[command.index]) {
          p.accepted = w.playCard(p.team, command.index, command.x, command.z);
        } else if (command.type === 'ability') p.accepted = w.activateAbility(p.team, command.id);
      }
      this.collect(m);
    }
    const cursor = Number.isSafeInteger(data.cursor) ? data.cursor : 0;
    return { status: 'match', team: p.team, live: m.start !== null && now >= m.start,
      seq: p.seq, accepted: p.accepted, cursor: m.cursor,
      events: m.batches.filter(b => b.cursor > cursor).flatMap(b => b.events),
      frame: snapshot(m.world, p.team) };
  }
}

export async function serveMatch(req, res, service, pagesOrigin = process.env.PAGES_ORIGIN) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  try {
    const origin = req.headers.origin;
    res.setHeader('Vary', 'Origin');
    if (origin && origin === pagesOrigin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'POST');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Access-Control-Max-Age', '600');
        res.writeHead(204).end();
        return;
      }
    } else if (req.headers['sec-fetch-site'] === 'cross-site' ||
               (origin && !['https://' + req.headers.host, 'http://' + req.headers.host].includes(origin))) {
      fail(403, 'This game website is not connected to the multiplayer server.');
    }
    if (req.method !== 'POST') fail(405, 'Use POST.');
    if (req.headers['content-type']?.split(';')[0] !== 'application/json') fail(415, 'Expected JSON.');
    let body = '';
    for await (const part of req) {
      body += part;
      if (body.length > 4096) fail(413, 'Request too large.');
    }
    let data;
    try { data = JSON.parse(body); } catch { fail(400, 'Invalid request.'); }
    res.end(JSON.stringify(service.request(data)));
  } catch (err) {
    if (!err.status) console.error(err);
    res.statusCode = err.status || 500;
    res.end(JSON.stringify({ error: err.status ? err.message : 'The arena is temporarily unavailable.' }));
  }
}
