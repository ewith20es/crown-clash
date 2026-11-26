import { actionFeatures, readBoard } from './action-features.js';
import { applyGradient, embed, emptyHead, HIDDEN, isHead, MODEL_VERSION, MAX_AGE, validUpdate, validReport, score } from './network.js';
import { policy } from './trained-policy.js';
import { multiplayerServer, shareAfterSolo } from '../../multiplayer-config.js';

const KEY = MODEL_VERSION + '-learning';
function learningEndpoint() {
  if (!globalThis.location) return '';
  const local = ['127.0.0.1','localhost','[::1]'].includes(location.hostname);
  return new URL('/api/learning',local ? location.origin : multiplayerServer || location.origin).href;
}

function reportId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
}

// Softmax policy gradient for the actual, accepted human play compared with waiting,
// another affordable card at this tile, or the corresponding play in the opposite lane.
export function describeMove(world, team, index, move, head) {
  const board = readBoard(world, team);
  const describe = m => embed(policy, actionFeatures(board,m.deployment,world.cardCost(team,m.card),m.x,m.z));
  const chosen = describe(move);
  const alternatives = [chosen, embed(policy,actionFeatures(board))];
  if (move.x !== 0) {
    const mirrored = world.canPlay(team,index,-move.x,move.z);
    if (mirrored.ok && mirrored.x !== move.x) alternatives.push(describe(mirrored));
  }
  for (let i=0; i<world.players[team].hand.length; i++) {
    if (i===index) continue;
    const other = world.canPlay(team,i,move.x,move.z);
    if (other.ok) alternatives.push(describe(other));
  }
  const logits = alternatives.map(h => score(policy,h,head));
  const top = Math.max(...logits);
  const weights = logits.map(v => Math.exp(v-top));
  const total = weights.reduce((a,b)=>a+b);
  return chosen.map((v,h) => v-alternatives.reduce((sum,a,i) => sum + a[h]*weights[i]/total,0));
}

export class MatchLearning {
  constructor(head) {
    this.head = head;
    this.total = emptyHead();
    this.count = 0;
  }
  record(signal) {
    if (!signal) return;
    this.count++;
    for (let i=0;i<HIDDEN;i++) this.total[i] += signal[i];
  }
  finish(outcome, reason) {
    if (this.count < 3 || outcome === 'draw' || ['surrender','disconnect'].includes(reason)) return null;
    const reward = outcome === 'win' ? 1 : -.65;
    return this.total.map(v => Math.round(100*Math.max(-1,Math.min(1,v*reward/this.count))));
  }
}

function initial() {
  return {local:emptyHead(), community:emptyHead(), matches:0, communityMatches:0, pending:[]};
}

export class RivalLearning {
  constructor({endpoint=learningEndpoint(), storage, request=globalThis.fetch, enabled=true, syncAfterMatch=shareAfterSolo} = {}) {
    this.endpoint = endpoint;
    this.enabled = enabled;
    this.request = request;
    this.syncAfterMatch = syncAfterMatch;
    this.connected = false;
    this.inSolo = false;
    try { this.storage = storage ?? globalThis.localStorage; } catch { /* private browsing */ }
    this.state = initial();
    this.restore();
  }
  restore() {
    try {
      const s = JSON.parse(this.storage?.getItem(KEY) || 'null');
      if (s && isHead(s.local) && isHead(s.community) && Number.isSafeInteger(s.matches) &&
          s.matches >= 0 && Number.isSafeInteger(s.communityMatches) && s.communityMatches >= 0) {
        this.state = {...s, pending: Array.isArray(s.pending) ? s.pending.filter(r=>validReport(r) && Date.now()-r.time<MAX_AGE).slice(-32) : []};
      }
    } catch { /* continue with the in-memory model */ }
  }
  change(fn) {
    const run = () => {
      this.restore();
      fn(this.state);
      try { this.storage?.setItem(KEY,JSON.stringify(this.state)); } catch { this.storage = null; }
    };
    return globalThis.navigator?.locks ? navigator.locks.request(KEY,run) : Promise.resolve(run());
  }
  head() {
    this.restore();
    const s = this.state;
    if (!s.communityMatches) return s.local.slice();
    const personal = Math.min(.35,s.matches*.035);
    return s.local.map((v,i) => personal*v + (1-personal)*s.community[i]);
  }
  status() {
    this.restore();
    const local = this.state.matches + ' on this device';
    if (!this.endpoint) return local;
    const pending = this.state.pending.length;
    if (pending && !this.connected && !this.syncAfterMatch) return local + ' · ' + pending + ' waiting for Multiplayer';
    return local + ' · ' + this.state.communityMatches + ' in the shared model';
  }
  setEnabled(on) {
    this.enabled = on;
    if (!on) {
      this.wakeAbort?.abort();
      this.cancelSync();
      void this.change(s => { s.pending = []; });
    }
  }
  setSoloServer(on) {
    this.syncAfterMatch = on;
    if (!on) {
      this.wakeAbort?.abort();
      if (!this.connected) this.cancelSync();
    }
  }
  beginSolo(autoplay = false) {
    this.inSolo = true;
    this.connected = false;
    this.cancelSync();
    if (this.enabled && this.syncAfterMatch && this.endpoint && !autoplay) void this.wakeServer();
  }
  endSolo() {
    this.inSolo = false;
    this.wakeAbort?.abort();
  }
  async wakeServer() {
    const abort = this.wakeAbort = new AbortController();
    const timer = setTimeout(() => abort.abort(),75_000);
    try {
      await this.request(this.endpoint,{method:'HEAD',priority:'low',credentials:'omit',cache:'no-store',signal:abort.signal});
    } catch { /* The result upload can retry a sleeping or unreachable host. */ }
    finally {
      clearTimeout(timer);
      if (this.wakeAbort === abort) this.wakeAbort = null;
    }
  }
  cancelSync() {
    clearTimeout(this.retryTimer);
    this.abort?.abort();
    this.abort = null;
    this.busy = null;
    this.failures = 0;
  }
  connect() {
    this.connected = true;
    return this.sync();
  }
  async learn(gradient) {
    if (!this.enabled || !validUpdate(gradient)) return;
    await this.change(s => {
      if (!this.enabled) return;
      s.local = applyGradient(s.local,gradient.map(n=>n/100));
      s.matches++;
      if (this.endpoint) {
        s.pending.push({id:reportId(),version:MODEL_VERSION,time:Date.now(),gradient});
        s.pending = s.pending.slice(-32);
      }
    });
    await this.sync();
  }
  sync() {
    if (this.inSolo || !this.enabled || !(this.connected || this.syncAfterMatch) || !this.endpoint) return Promise.resolve();
    if (this.busy) return this.busy;
    clearTimeout(this.retryTimer);
    const abort = this.abort = new AbortController();
    const timer = setTimeout(() => abort.abort(),75_000);
    this.busy = this.exchange(abort.signal).then(() => {
      if (this.abort === abort) this.failures = 0;
    }).catch(() => {
      if (this.abort !== abort) return;
      this.failures = (this.failures || 0)+1;
      if (this.enabled && this.failures<=3) {
        clearTimeout(this.retryTimer);
        this.retryTimer = setTimeout(()=>this.sync(),this.failures*12_000);
      }
    }).finally(() => {
      clearTimeout(timer);
      if (this.abort === abort) { this.abort = null; this.busy = null; }
    });
    return this.busy;
  }
  async exchange(signal) {
    const url = this.endpoint;
    do {
      this.restore();
      const report = this.state.pending[0];
      const res = await this.request(url,{method:report?'POST':'GET',priority:'low',credentials:'omit',cache:'no-store',
        signal, ...(report ? {headers:{'Content-Type':'application/json'},body:JSON.stringify(report)} : {})});
      if (signal.aborted) return;
      if (!res.ok) {
        if ([400,413].includes(res.status) && report) {
          await this.change(s => { s.pending = s.pending.filter(r=>r.id!==report.id); });
          continue;
        }
        throw Error('Shared learning unavailable');
      }
      const packet = await res.json();
      if (signal.aborted || !this.enabled || packet.version!==MODEL_VERSION || !isHead(packet.head) ||
          !Number.isSafeInteger(packet.matches) || packet.matches<0) return;
      await this.change(s => {
        if (signal.aborted) return;
        if (report) s.pending = s.pending.filter(r=>r.id!==report.id);
        if (packet.matches >= s.communityMatches) { s.community = packet.head; s.communityMatches = packet.matches; }
      });
    } while (!signal.aborted && this.enabled && this.state.pending.length);
  }
}
