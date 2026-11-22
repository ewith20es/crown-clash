import { decodeUpdate } from './match-codec.js';
import { multiplayerServer } from '../../multiplayer-config.js';

const unavailable = 'Could not reach the multiplayer server. Check your connection and try again.';
const MATCH_UPDATE_MS = 100;

function endpoint() {
  if (multiplayerServer) return new URL('/api/match', multiplayerServer);
  if (location.hostname.endsWith('.github.io')) {
    throw Object.assign(new Error('Online play is awaiting setup. The site owner needs to connect the multiplayer server.'), { status: 503 });
  }
  return new URL('./api/match', document.baseURI);
}

function post(data, signal) {
  return fetch(endpoint(), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    cache: 'no-store', credentials: 'omit', signal,
  });
}

async function request(data, abort = new AbortController()) {
  const opening = ['create', 'find', 'join'].includes(data.op);
  const timer = setTimeout(() => abort.abort(), opening ? 90_000 : 8000);
  try {
    const response = await post(data, abort.signal);
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error(unavailable);
    const packet = await response.json();
    if (!response.ok) throw Object.assign(new Error(packet.error || unavailable), { status: response.status });
    if (!['waiting', 'match', 'left', 'ack'].includes(packet.status)) throw new Error(unavailable);
    return packet;
  } finally { clearTimeout(timer); }
}

// A player has one state reader and at most one unacknowledged move.
// Retries keep their original sequence number across transport changes.
export class Multiplayer {
  constructor(callbacks) { this.callbacks = callbacks; }

  wake() {
    if (!multiplayerServer || this.waking) return;
    this.waking = fetch(new URL('/', multiplayerServer), {
      method: 'HEAD', mode: 'no-cors', credentials: 'omit', cache: 'no-store',
    }).catch(() => {}).finally(() => { this.waking = null; });
  }

  start(op, loadout, code) {
    this.stop();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const token = Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('');
    const session = { token, first: { op, ...loadout, code }, active: false, seq: 0, cursor: 0,
      lastOK: Date.now(), busy: false, command: null };
    this.session = session;
    this.callbacks.wait('Connecting to the arena…');
    session.wakeTimer = setTimeout(() => {
      if (this.session === session && session.first) this.callbacks.wait('Waiting for the arena server to wake up…');
    }, 4500);
    this.poll(session);
  }

  stop(leave = true) {
    const s = this.session;
    if (!s) return;
    this.session = null;
    s.readAbort?.abort();
    s.stream?.abort();
    clearTimeout(s.retryMove);
    clearTimeout(s.timer);
    clearTimeout(s.wakeTimer);
    if (leave) request({ op: 'leave', token: s.token }).catch(() => {});
  }

  send(command) {
    const s = this.session;
    if (!s?.active || s.command) return false;
    s.command = { ...command, seq: s.seq + 1 };
    if (s.stream) { this.postMove(s, s.command); return true; }
    // An outstanding state read has no move to acknowledge. Interrupt it so
    // that an input does not have to wait for the remainder of a round trip.
    s.readAbort?.abort();
    if (!s.busy) { clearTimeout(s.timer); this.poll(s); }
    return true;
  }

  surrender() {
    const s = this.session;
    if (!s?.active) return;
    s.quitting = true;
    if (!s.command) this.send({ type: 'surrender' });
  }

  async postMove(s, command) {
    // The stream carries the acknowledgement and updated hand together.
    try {
      await request({ op: 'sync', token: s.token, command, ackOnly: true });
    } catch {
      // The move may already have arrived. Its sequence on the stream decides.
    }
    if (s === this.session && s.stream && command === s.command) {
      s.retryMove = setTimeout(() => {
        if (s.stream && command === s.command) this.postMove(s, command);
      }, 750);
    }
  }

  receive(s, packet) {
    const first = !s.active;
    s.active = true;
    s.cursor = packet.cursor;
    s.seq = packet.seq;
    s.lastOK = Date.now();
    const ack = s.command && packet.seq === s.command.seq ? s.command : null;
    if (ack) { s.command = null; clearTimeout(s.retryMove); }
    this.callbacks.frame(packet, first);
    this.callbacks.connection(packet.live || packet.frame.phase === 'ended' ? '' : 'Waiting for both players to be ready.');
    if (ack && !packet.accepted) this.callbacks.denied(ack);
    if (packet.frame.phase === 'ended') { this.stop(false); return; }
    if (s.quitting && !s.command) this.send({ type: 'surrender' });
  }

  unpack(s, wire) {
    try {
      const { packet, baseline } = decodeUpdate(wire, s.baseline);
      s.baseline = baseline;
      return packet;
    } catch (err) {
      s.baseline = null;
      throw err;
    }
  }

  async watch(s) {
    const abort = s.stream = new AbortController();
    let watchdog;
    const arm = () => {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => abort.abort(), 1800);
    };
    try {
      arm();
      const response = await post({ op: 'watch', v: 1, token: s.token, base: s.baseline.serial, cursor: s.cursor }, abort.signal);
      if (!response.ok || !response.headers.get('content-type')?.includes('application/x-ndjson')) throw new Error(unavailable);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = '', received = false;
      while (s === this.session) {
        const { done, value } = await reader.read();
        if (done) {
          if (!received || pending) throw new Error(unavailable);
          break;
        }
        pending += decoder.decode(value, { stream: true });
        const lines = pending.split('\n');
        pending = lines.pop();
        for (const line of lines) {
          if (s !== this.session) return;
          this.receive(s, this.unpack(s, JSON.parse(line)));
          received = true;
        }
        if (lines.length) arm();
      }
    } catch {
      // Some HTTPS proxies buffer streams. Poll deltas on those connections.
      s.pollOnly = true;
    } finally {
      clearTimeout(watchdog);
      abort.abort();
      s.stream = null;
    }
    if (s === this.session) {
      if (s.pollOnly) this.poll(s);
      else this.watch(s);
    }
  }

  async poll(s) {
    s.busy = true;
    const started = performance.now();
    const abort = new AbortController();
    const reading = s.active && !s.command;
    s.readAbort = reading ? abort : null;
    let delay = MATCH_UPDATE_MS;
    let packet;
    try {
      packet = await request({ token: s.token, ...(s.first || { op: 'sync' }), v: 1, base: s.baseline?.serial,
        ready: s.active || undefined, cursor: s.cursor || undefined, command: s.command || undefined }, abort);
      if (packet.wire) packet = this.unpack(s, packet.wire);
    } catch (err) {
      packet = null;
      if (s !== this.session) return;
      if (reading && s.command) {
        s.readAbort = null;
        return this.poll(s);
      }
      if (s.first || err.status === 410 || Date.now() - s.lastOK > 45_000) {
        this.stop();
        this.callbacks.error(err.status ? err.message : unavailable);
        return;
      }
      const msg = 'Connection interrupted. Reconnecting…';
      if (s.active) this.callbacks.connection(msg);
      else this.callbacks.wait(msg, s.code);
      delay = 900;
    }
    if (s !== this.session) {
      // A create/join response may arrive after the player closed the lobby.
      if (s.first && packet) request({ op: 'leave', token: s.token }).catch(() => {});
      return;
    }
    s.readAbort = null;
    if (packet) {
      clearTimeout(s.wakeTimer);
      s.first = null;
      s.lastOK = Date.now();
      if (packet.status === 'waiting') {
        s.code = packet.code;
        this.callbacks.wait(s.code ? 'Share this code with your opponent.' : 'Looking for another player…', s.code);
        delay = 700;
      } else {
        const first = !s.active;
        this.receive(s, packet);
        if (s !== this.session) return;
        if (s.baseline && !s.pollOnly && !s.command) {
          s.busy = false;
          return this.watch(s);
        }
        // Schedule against the start of the read. On slow networks we request
        // the next frame as soon as this one finishes, without building a queue.
        delay = s.command || first ? 0 : Math.max(0, MATCH_UPDATE_MS - (performance.now() - started));
      }
    }
    s.busy = false;
    if (s === this.session) s.timer = setTimeout(() => this.poll(s), delay);
  }
}
