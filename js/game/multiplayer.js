import { multiplayerServer } from '../../multiplayer-config.js';

const unavailable = 'Could not reach the multiplayer server. Check your connection and try again.';

function endpoint() {
  if (multiplayerServer) return new URL('/api/match', multiplayerServer);
  if (location.hostname.endsWith('.github.io')) {
    throw Object.assign(new Error('Online play is awaiting setup. The site owner needs to connect the multiplayer server.'), { status: 503 });
  }
  return new URL('./api/match', document.baseURI);
}

async function request(data) {
  const abort = new AbortController();
  const opening = ['create', 'find', 'join'].includes(data.op);
  const timer = setTimeout(() => abort.abort(), opening ? 90_000 : 8000);
  try {
    const response = await fetch(endpoint(), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      cache: 'no-store', credentials: 'omit', signal: abort.signal,
    });
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error(unavailable);
    const packet = await response.json();
    if (!response.ok) throw Object.assign(new Error(packet.error || unavailable), { status: response.status });
    if (!['waiting', 'match', 'left'].includes(packet.status)) throw new Error(unavailable);
    return packet;
  } finally { clearTimeout(timer); }
}

// One in-flight poll per player. A move keeps its sequence number until the
// server acknowledges it, including when the response was lost after delivery.
export class Multiplayer {
  constructor(callbacks) { this.callbacks = callbacks; }

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
    clearTimeout(s.timer);
    clearTimeout(s.wakeTimer);
    if (leave) request({ op: 'leave', token: s.token }).catch(() => {});
  }

  send(command) {
    const s = this.session;
    if (!s?.active || s.command) return false;
    s.command = { ...command, seq: s.seq + 1 };
    if (!s.busy) { clearTimeout(s.timer); this.poll(s); }
    return true;
  }

  surrender() {
    const s = this.session;
    if (!s?.active) return;
    s.quitting = true;
    if (!s.command) this.send({ type: 'surrender' });
  }

  async poll(s) {
    s.busy = true;
    let delay = 150;
    let packet;
    try {
      packet = await request({ token: s.token, ...(s.first || { op: 'sync' }),
        ready: s.active, cursor: s.cursor, command: s.command });
    } catch (err) {
      if (s !== this.session) return;
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
        s.active = true;
        s.cursor = packet.cursor;
        s.seq = packet.seq;
        const ack = s.command && packet.seq === s.command.seq ? s.command : null;
        if (ack) s.command = null;
        this.callbacks.frame(packet, first);
        this.callbacks.connection(packet.live || packet.frame.phase === 'ended' ? '' : 'Waiting for both players to be ready…');
        if (ack && !packet.accepted) this.callbacks.denied(ack);
        if (packet.frame.phase === 'ended') { this.stop(false); return; }
        if (s.quitting && !s.command) this.send({ type: 'surrender' });
        if (s.command || first) delay = 0;
      }
    }
    s.busy = false;
    if (s === this.session) s.timer = setTimeout(() => this.poll(s), delay);
  }
}
