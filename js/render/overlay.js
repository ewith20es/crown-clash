// Aether Spires — the 2-D HUD overlay drawn on canvas#overlay-canvas above the 3-D scene.
//
// Draws, in CSS pixels at devicePixelRatio (capped at 2):
//   • tower health bars (always): crystal badge, bold outlined HP number, dimmed while the
//     Citadel is dormant. Enemy towers carry theirs above the roof, the player's own towers
//     below the base, so the bars never cover the lanes where the fighting happens;
//   • unit / building health bars once damaged or shielded, with a white "recent damage" chip
//     that holds for 0.4 s and then drains, and a pale shield bar above;
//   • a draining lifetime ring on buildings and a filling pie clock on deploying entities;
//   • a countdown above every pending death-blast fuse;
//   • floating "+1" aether popups (local player only) and "×2" text when a charge or pounce lands.
//
// Per-frame code allocates nothing: bars are gathered into typed arrays and painted in a
// handful of batched paths (one per fill style); per-entity trackers and floating texts are
// pooled; every string drawn per frame is cached.
import { SIM_DT, TEAMS, UNIT_VISUAL_SCALE } from '../config.js';

const TAU = Math.PI * 2;
const TOP = -Math.PI / 2;
const DPR_CAP = 2;
const FONT = '"Trebuchet MS", "Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif';

const C_BACK = 'rgba(7,11,22,0.88)';
const C_INK = '#070b16';
const C_CHIP = '#ffffff';
const C_SHIELD = '#d8f2ff';
const C_GLOSS = 'rgba(255,255,255,0.32)';
const C_SHADE = 'rgba(0,0,24,0.24)';
const C_WARN = '#ffd24a';
const C_TRIM = '#ffcf5a';
const C_FACET = 'rgba(255,255,255,0.34)';
const C_FUSE_TEXT = '#fff3d0';
const C_AETHER = '#aef1ff';
const C_AETHER_GEM = '#8f7dff';
const TEAM_FILL = [TEAMS[0].css, TEAMS[1].css];
const TEAM_LIGHT = [TEAMS[0].cssLight, TEAMS[1].cssLight];
const TEAM_GLOW = [TEAMS[0].cssGlow, TEAMS[1].cssGlow];
const NUM_FILL = ['#cfe9ff', '#ffd9c6'];
const CRIT_FILL = ['#ffe98a', '#ffb693'];

const CHIP_HOLD = 0.4;        // seconds the white chip waits before draining
const LIFE_WARN = 5;          // seconds of building lifetime left at which the ring blinks
const BS = 8;                 // bar stride:  left, top, w, h, fillW, chipW, shieldW (−1 = none), team
const DS = 5;                 // dot stride:  x, y, frac, team, radius          (deploy clocks)
const RS = 4;                 // ring stride: x, y, frac, style (0/1 team, 2 warn)  (lifetime)
const MAX_TOWERS = 8;
const MAX_TEXTS = 20;
const MAX_POUNCES = 8;
const T_AETHER = 0;
const T_CRIT = 1;

/** '0.0' … '9.9' so the fuse countdown never builds a string per frame. */
const DEC = [];
for (let i = 0; i < 100; i++) DEC.push((i / 10).toFixed(1));

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

/** Rounded bar outline with separate left / right corner radii (no allocations). */
function pillPath(ctx, x, y, w, h, rl, rr) {
  ctx.moveTo(x + rl, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rl);
  ctx.arcTo(x, y, x + w, y, rl);
  ctx.closePath();
}

function makeRec() {
  return { frac: 1, chip: 1, hold: 0, vis: 0, stamp: 0, hpInt: -1, hpText: '' };
}

function makeText() {
  return { on: false, kind: 0, text: '', x: 0, y: 0, z: 0, t: 0, dur: 1, rise: 0, scale: 1, fill: '#fff', tw: 0 };
}

export class Overlay {
  constructor(canvas, stage) {
    this.canvas = canvas;
    this.stage = stage;
    this.ctx = canvas.getContext('2d');
    this.p = { x: 0, y: 0, behind: false };
    this.dpr = 1;
    this.inv = 1;
    this.cssW = 1;
    this.cssH = 1;
    this.k = 1;
    this._hasRR = !!this.ctx && typeof this.ctx.roundRect === 'function';

    this._world = null;
    this._time = 0;
    this._stamp = 0;
    this._dirty = true;
    this._warned = false;
    this._sw = -1;
    this._sh = -1;

    // per-entity trackers (recent-damage chip, cached tower HP text), pooled
    this._recs = new Map();
    this._free = [];
    this._pruneFn = (rec, id) => {
      if (this._stamp - rec.stamp > 150) {
        this._recs.delete(id);
        this._free.push(rec);
      }
    };

    // frame batches
    this._cap = 0;
    this._bars = null;
    this._dots = null;
    this._rings = null;
    this._nb = 0;
    this._nd = 0;
    this._nr = 0;
    this._ensure(96);
    this._towers = new Array(MAX_TOWERS).fill(null);
    this._towerRecs = new Array(MAX_TOWERS).fill(null);
    this._nt = 0;

    // floating texts
    this._texts = [];
    for (let i = 0; i < MAX_TEXTS; i++) this._texts.push(makeText());
    this._textsOn = 0;
    this._multText = new Map();

    // crit detection: chargers that are wound up, and pounces in flight
    this._charged = new Map();                       // attacker id → unit def
    this._pId = new Int32Array(MAX_POUNCES);         // attacker id (0 = free slot)
    this._pTarget = new Int32Array(MAX_POUNCES);
    this._pExpire = new Float64Array(MAX_POUNCES);
    this._pDef = new Array(MAX_POUNCES).fill(null);
    this._pounces = 0;

    this.resize();
  }

  // ───────────────────────────── layout ─────────────────────────────

  resize() {
    const c = this.canvas;
    const dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, DPR_CAP);
    const w = Math.max(1, Math.round(c.clientWidth || (this.stage && this.stage.width) || 1));
    const h = Math.max(1, Math.round(c.clientHeight || (this.stage && this.stage.height) || 1));
    const pw = Math.max(1, Math.round(w * dpr));
    const ph = Math.max(1, Math.round(h * dpr));
    if (c.width !== pw) c.width = pw;
    if (c.height !== ph) c.height = ph;
    this.dpr = dpr;
    this.inv = 1 / dpr;
    this.cssW = w;
    this.cssH = h;

    // 390×844 is the reference phone (k = 1); larger canvases grow the HUD gently.
    const k = clamp(Math.pow(Math.min(w, h * 0.5) / 390, 0.6), 0.85, 1.6);
    this.k = k;
    const sz = (v) => Math.max(1, Math.round(v * k * dpr)) / dpr;   // whole device pixels
    this.m = Math.max(1, Math.round(dpr * Math.min(k, 1.25))) / dpr; // dark outline
    this.uw = sz(26);          // unit bar
    this.uh = sz(4);
    this.bw = sz(34);          // building bar
    this.bh = sz(5);
    this.sh = sz(3);           // shield row
    this.tw = sz(54);          // spire bar
    this.th = sz(6);
    this.cw = sz(62);          // citadel bar
    this.ch = sz(7);
    this.gloss = Math.max(1, Math.round(dpr * k * 0.5)) / dpr;
    this.ringR = sz(6.5);      // lifetime ring: backing disc radius
    this.ringLW = 2.2 * k;
    this.gemW = 11 * k;        // tower badge
    this.gemH = 16 * k;
    this.fuseR = 10.5 * k;
    this.towerPx = Math.round(11.5 * k * 2) / 2;
    this.citPx = Math.round(13 * k * 2) / 2;
    this.popPx = Math.round(14 * k * 2) / 2;
    this.fusePx = Math.round(11 * k * 2) / 2;
    this.fontTower = `800 ${this.towerPx}px ${FONT}`;
    this.fontCit = `800 ${this.citPx}px ${FONT}`;
    this.fontPop = `900 ${this.popPx}px ${FONT}`;
    this.fontFuse = `800 ${this.fusePx}px ${FONT}`;
    this._dirty = true;        // resizing a canvas clears it, but be safe
  }

  reset() {
    this._forget();
    this._world = null;
    this.clear();
    this._dirty = false;
  }

  clear() {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  _forget() {
    const free = this._free;
    this._recs.forEach((rec) => { free.push(rec); });
    this._recs.clear();
    const T = this._texts;
    for (let i = 0; i < T.length; i++) T[i].on = false;
    this._textsOn = 0;
    this._charged.clear();
    this._pId.fill(0);
    this._pDef.fill(null);
    this._pounces = 0;
    this._towers.fill(null);
    this._towerRecs.fill(null);
    this._nt = 0;
    this._nb = 0;
    this._nd = 0;
    this._nr = 0;
  }

  _ensure(n) {
    if (n <= this._cap) return;
    let cap = Math.max(96, this._cap);
    while (cap < n) cap *= 2;
    this._cap = cap;
    this._bars = new Float32Array(cap * BS);
    this._dots = new Float32Array(cap * DS);
    this._rings = new Float32Array(cap * RS);
  }

  // ───────────────────────────── events ─────────────────────────────

  handleEvents(events, world) {
    if (!events || !world) return;
    try {
      for (let i = 0; i < events.length; i++) {
        const ev = events[i];
        switch (ev.type) {
          case 'damage':
            if (this._pounces > 0) this._pounceHit(ev, world);
            break;
          case 'aether':
            if (ev.team === this.stage.playerTeam) {
              const src = world.getEntity(ev.id);
              const top = src ? src.y + (src.def.height || 1.4) + 1.0 : 2.8;
              this._spawnText(T_AETHER, this._amountText(ev.amount), ev.x, top, ev.z, 0);
            }
            break;
          case 'charge': {
            const e = world.getEntity(ev.id);
            if (e && e.def.charge) this._charged.set(ev.id, e.def);
            break;
          }
          case 'attack': {
            // A wound-up charger swings: the blow lands in the same step, so its damage event
            // follows immediately (a normal swing only starts its wind-up here).
            const def = this._charged.get(ev.id);
            if (def !== undefined) {
              this._charged.delete(ev.id);
              this._chargeHit(events, i, ev, def, world);
            }
            break;
          }
          case 'pounce':
            this._armPounce(ev, world);
            break;
          case 'death': {
            const rec = this._recs.get(ev.id);
            if (rec !== undefined) {
              this._recs.delete(ev.id);
              this._free.push(rec);
            }
            this._charged.delete(ev.id);
            break;
          }
          default:
            break;
        }
      }
    } catch (err) {
      this._warn(err);
    }
  }

  _amountText(amount) {
    const a = Number.isFinite(amount) ? Math.round(amount * 10) / 10 : 1;
    return this._cachedText(a, '+');
  }

  _cachedText(value, prefix) {
    const key = prefix === '+' ? value + 1e6 : value;
    let s = this._multText.get(key);
    if (s === undefined) {
      if (this._multText.size > 64) this._multText.clear();
      s = prefix + (Number.isInteger(value) ? value : value.toFixed(1));
      this._multText.set(key, s);
    }
    return s;
  }

  _crit(ev, mult, world) {
    const victim = world.getEntity(ev.id);
    const h = victim ? victim.def.height || 1.4 : 1.4;
    const team = ev.team === 0 ? 1 : 0;          // the attacker's team
    this._spawnText(T_CRIT, this._cachedText(mult > 0 ? mult : 2, '×'), ev.x, (ev.y || 0) + h + 0.7, ev.z, team);
  }

  /** True when a damage event is clearly more than one plain swing of `def` (or it killed). */
  _isBigHit(ev, def) {
    const base = def.dmg * (ev.kind === 'tower' ? def.towerDmgMult : 1);
    return ev.fatal === true || ev.amount > base * 1.05;
  }

  _chargeHit(events, i, atk, def, world) {
    const end = Math.min(events.length, i + 24);
    for (let j = i + 1; j < end; j++) {
      const d = events[j];
      if (d.type === 'shieldBreak' || d.type === 'citadelWake') continue;
      if (d.type !== 'damage') return;
      if (d.id === atk.targetId && d.source === atk.entType) {
        if (this._isBigHit(d, def)) this._crit(d, def.charge.dmgMult, world);
        return;
      }
    }
  }

  _armPounce(ev, world) {
    const e = world.getEntity(ev.id);
    if (!e || !e.def.pounce) return;
    const ids = this._pId;
    let slot = -1;
    let oldest = 0;
    for (let s = 0; s < MAX_POUNCES; s++) {
      if (ids[s] === ev.id) { slot = s; break; }
      if (ids[s] === 0) { if (slot < 0) slot = s; } else if (this._pExpire[s] < this._pExpire[oldest]) oldest = s;
    }
    if (slot < 0) slot = oldest;
    if (ids[slot] === 0) this._pounces++;
    ids[slot] = ev.id;
    this._pTarget[slot] = ev.targetId;
    this._pExpire[slot] = world.time + 1.7;     // a dash never lasts longer than 1.5 s
    this._pDef[slot] = e.def;
  }

  _pounceHit(ev, world) {
    const ids = this._pId;
    for (let s = 0; s < MAX_POUNCES; s++) {
      if (ids[s] === 0) continue;
      const def = this._pDef[s];
      if (world.time > this._pExpire[s]) {
        ids[s] = 0; this._pDef[s] = null; this._pounces--;
        continue;
      }
      if (ev.id !== this._pTarget[s] || ev.source == null) continue;
      const src = world.getEntity(ids[s]);
      if (src ? src.type !== ev.source || src.team === ev.team : def.pounce == null) continue;
      if (this._isBigHit(ev, def)) {
        this._crit(ev, def.pounce.dmgMult, world);
        ids[s] = 0; this._pDef[s] = null; this._pounces--;
        return;
      }
    }
  }

  _spawnText(kind, text, x, y, z, team) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
    const T = this._texts;
    let best = 0;
    let bestU = -1;
    for (let i = 0; i < T.length; i++) {
      const f = T[i];
      if (!f.on) { best = i; bestU = -2; break; }
      const u = f.t / f.dur;
      if (u > bestU) { bestU = u; best = i; }
    }
    const f = T[best];
    if (!f.on) this._textsOn++;
    f.on = true;
    f.kind = kind;
    f.text = text;
    f.x = x; f.y = y; f.z = z;
    f.t = 0;
    if (kind === T_AETHER) {
      f.dur = 1.25; f.rise = 30; f.scale = 1; f.fill = C_AETHER;
    } else {
      f.dur = 0.85; f.rise = 20; f.scale = 1.15; f.fill = CRIT_FILL[team === 1 ? 1 : 0];
    }
    f.tw = text.length * this.popPx * 0.58;
    const ctx = this.ctx;
    if (ctx && typeof ctx.measureText === 'function') {
      ctx.font = this.fontPop;
      const mw = ctx.measureText(text);
      if (mw && mw.width > 0) f.tw = mw.width;
    }
  }

  // ───────────────────────────── frame ─────────────────────────────

  draw(world, alpha, time) {
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      this._draw(ctx, world, alpha, time);
    } catch (err) {
      this._warn(err);
    }
  }

  _warn(err) {
    if (this._warned) return;
    this._warned = true;
    console.warn('[overlay] HUD overlay error', err);
  }

  _draw(ctx, world, alpha, time) {
    const t = Number.isFinite(time) ? time : this._time;
    let dt = t - this._time;
    this._time = t;
    if (!(dt > 0)) dt = 0; else if (dt > 0.1) dt = 0.1;

    if (!world) {
      if (this._dirty) { this.clear(); this._dirty = false; }
      return;
    }
    if (world !== this._world) { this._forget(); this._world = world; }
    const stage = this.stage;
    if (stage.width !== this._sw || stage.height !== this._sh) {
      this._sw = stage.width;
      this._sh = stage.height;
      this.resize();
    }
    const a = alpha >= 0 && alpha <= 1 ? alpha : 1;
    this._stamp++;

    this.clear();
    this._dirty = true;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1;

    this._gather(world, a, dt, t);
    this._drawBars(ctx);
    this._drawTowers(ctx);
    this._drawFuses(ctx, world, a);
    if (this._textsOn > 0) this._drawTexts(ctx, dt);

    if ((this._stamp & 63) === 0 && this._recs.size > 0) this._recs.forEach(this._pruneFn);
  }

  _track(id, frac, dt) {
    let r = this._recs.get(id);
    if (r === undefined) {
      r = this._free.length > 0 ? this._free.pop() : makeRec();
      r.frac = 1; r.chip = 1; r.hold = 0; r.vis = 0; r.hpInt = -1; r.hpText = '';
      this._recs.set(id, r);
    }
    r.stamp = this._stamp;
    if (frac < r.frac - 1e-4) r.hold = CHIP_HOLD;
    r.frac = frac;
    if (r.chip <= frac) r.chip = frac;
    else if (r.hold > 0) r.hold -= dt;
    else {
      r.chip -= dt * ((r.chip - frac) * 9 + 0.35);
      if (r.chip < frac) r.chip = frac;
    }
    return r;
  }

  /** Projects every entity that needs a HUD element into the frame batches. */
  _gather(world, alpha, dt, time) {
    const E = world.entities;
    const n = E.length;
    this._ensure(n);
    const B = this._bars;
    const D = this._dots;
    const R = this._rings;
    const stage = this.stage;
    const p = this.p;
    const dpr = this.dpr;
    const inv = this.inv;
    const W = this.cssW;
    const H = this.cssH;
    const k = this.k;
    const lag = (1 - alpha) * SIM_DT;       // the drawn pose trails the simulation by this much
    const warnOn = (time * 3) % 1 < 0.5;
    const ringR = this.ringR;
    let nb = 0;
    let nd = 0;
    let nr = 0;
    let nt = 0;

    for (let i = 0; i < n; i++) {
      const e = E[i];
      if (!e || e.alive === false) continue;
      const def = e.def;
      if (!def) continue;
      const maxHp = e.maxHp > 0 ? e.maxHp : 1;
      let frac = e.hp / maxHp;
      frac = frac > 0 ? (frac < 1 ? frac : 1) : 0;
      const isTower = e.kind === 'tower';
      const shield = e.maxShield > 0;
      const deploying = e.state === 'deploy' && e.deployTime > 0;
      const timed = e.lifeMax > 0 && !deploying && !isTower;
      const showBar = isTower || shield || e.hp < maxHp;
      if (!showBar && !deploying && !timed) continue;

      const rec = showBar ? this._track(e.id, frac, dt) : null;
      if (isTower) {
        if (nt < MAX_TOWERS) { this._towers[nt] = e; this._towerRecs[nt] = rec; nt++; }
        continue;
      }

      const x = e.px + (e.x - e.px) * alpha;
      const y = e.py + (e.y - e.py) * alpha;
      const z = e.pz + (e.z - e.pz) * alpha;
      const vh = (def.height || 1.4) * (e.kind === 'unit' ? UNIT_VISUAL_SCALE : 1);
      stage.worldToScreen(x, y + vh + 0.35, z, p);
      if (p.behind) continue;
      const sx = p.x;
      const sy = p.y;
      if (!(sx > -60 && sx < W + 60 && sy > -40 && sy < H + 40)) continue;   // also rejects NaN

      let w;
      let h;
      if (e.kind === 'building') {
        w = this.bw; h = this.bh;
      } else {
        w = Math.round(this.uw * clamp(0.82 + e.radius * 0.45, 0.9, 1.3) * dpr) * inv;
        h = this.uh;
      }
      const top = Math.round((sy - h) * dpr) * inv;
      let left = sx - w * 0.5;

      if (timed) {
        // The ring sits alone above an undamaged building and slides to the left end of the
        // bar (like the towers' badge) once the bar appears.
        let vis = 0;
        if (rec !== null) {
          if (rec.vis < 1) { rec.vis += dt * 9; if (rec.vis > 1) rec.vis = 1; }
          vis = rec.vis;
        }
        left += (ringR - this.m) * vis;
        let lf = (e.lifeLeft + lag) / e.lifeMax;
        lf = lf > 0 ? (lf < 1 ? lf : 1) : 0;
        const o = nr * RS;
        R[o] = Math.round((sx - w * 0.5 * vis) * dpr) * inv;
        R[o + 1] = top + h * 0.5;
        R[o + 2] = lf;
        R[o + 3] = e.lifeLeft < LIFE_WARN && warnOn ? 2 : e.team;
        nr++;
      }

      let sw = -1;
      if (showBar) {
        if (shield && e.shield > 0) sw = w * Math.min(1, e.shield / e.maxShield);
        const o = nb * BS;
        B[o] = Math.round(left * dpr) * inv;
        B[o + 1] = top;
        B[o + 2] = w;
        B[o + 3] = h;
        B[o + 4] = w * frac;
        B[o + 5] = w * rec.chip;
        B[o + 6] = sw;
        B[o + 7] = e.team;
        nb++;
      }

      if (deploying) {
        const r = k * (3.5 + 5 * Math.min(e.radius, 0.7));
        const held = e.frozen > 0 || e.stunned > 0;
        let df = 1 - (e.deployLeft + (held ? 0 : lag)) / e.deployTime;
        df = df > 0 ? (df < 1 ? df : 1) : 0;
        let cy = sy - r - this.m;
        if (showBar) cy = top - r - this.m * 2 - 1 - (sw >= 0 ? this.sh + this.m : 0);
        const o = nd * DS;
        D[o] = sx;
        D[o + 1] = cy;
        D[o + 2] = df;
        D[o + 3] = e.team;
        D[o + 4] = r;
        nd++;
      }
    }
    for (let i = nt; i < this._nt; i++) { this._towers[i] = null; this._towerRecs[i] = null; }
    this._nb = nb;
    this._nd = nd;
    this._nr = nr;
    this._nt = nt;
  }

  /** Unit / building bars, deploy clocks and lifetime rings: one path per fill style. */
  _drawBars(ctx) {
    const nb = this._nb;
    const nd = this._nd;
    const nr = this._nr;
    if (nb + nd + nr === 0) return;
    const B = this._bars;
    const D = this._dots;
    const R = this._rings;
    const m = this.m;
    const sh = this.sh;
    const hasRR = this._hasRR;
    const ringR = this.ringR;

    // 1. dark backing of everything (overlaps merge: a single fill never double-darkens)
    ctx.fillStyle = C_BACK;
    ctx.beginPath();
    for (let i = 0; i < nb; i++) {
      const o = i * BS;
      const h = B[o + 3];
      const x = B[o] - m;
      let y = B[o + 1] - m;
      const w = B[o + 2] + m * 2;
      let bh = h + m * 2;
      const r = (h + m * 2) * 0.5;
      if (B[o + 6] >= 0) { y -= sh + m; bh += sh + m; }
      if (hasRR) ctx.roundRect(x, y, w, bh, r);
      else pillPath(ctx, x, y, w, bh, r, r);
    }
    for (let i = 0; i < nd; i++) {
      const o = i * DS;
      const r = D[o + 4] + m;
      ctx.moveTo(D[o] + r, D[o + 1]);
      ctx.arc(D[o], D[o + 1], r, 0, TAU);
    }
    for (let i = 0; i < nr; i++) {
      const o = i * RS;
      ctx.moveTo(R[o] + ringR, R[o + 1]);
      ctx.arc(R[o], R[o + 1], ringR, 0, TAU);
    }
    ctx.fill();

    // 2. team-coloured health and deploy pies
    for (let team = 0; team < 2; team++) {
      let any = false;
      ctx.beginPath();
      for (let i = 0; i < nb; i++) {
        const o = i * BS;
        if (B[o + 7] !== team || B[o + 4] < 0.2) continue;
        ctx.rect(B[o], B[o + 1], B[o + 4], B[o + 3]);
        any = true;
      }
      for (let i = 0; i < nd; i++) {
        const o = i * DS;
        if (D[o + 3] !== team) continue;
        const x = D[o];
        const y = D[o + 1];
        ctx.moveTo(x, y);
        ctx.arc(x, y, D[o + 4], TOP, TOP + D[o + 2] * TAU);
        ctx.closePath();
        any = true;
      }
      if (any) {
        ctx.fillStyle = TEAM_FILL[team];
        ctx.fill();
      }
    }

    if (nb > 0) {
      // 3. recent-damage chips
      let any = false;
      ctx.beginPath();
      for (let i = 0; i < nb; i++) {
        const o = i * BS;
        const d = B[o + 5] - B[o + 4];
        if (d < 0.3) continue;
        ctx.rect(B[o] + B[o + 4], B[o + 1], d, B[o + 3]);
        any = true;
      }
      if (any) { ctx.fillStyle = C_CHIP; ctx.fill(); }

      // 4. shields
      any = false;
      ctx.beginPath();
      for (let i = 0; i < nb; i++) {
        const o = i * BS;
        if (B[o + 6] < 0.2) continue;
        ctx.rect(B[o], B[o + 1] - sh - m, B[o + 6], sh);
        any = true;
      }
      if (any) { ctx.fillStyle = C_SHIELD; ctx.fill(); }

      // 5. gloss along the top edge, shade along the bottom edge of every health fill
      const g = this.gloss;
      ctx.beginPath();
      for (let i = 0; i < nb; i++) {
        const o = i * BS;
        if (B[o + 4] >= 1) ctx.rect(B[o], B[o + 1], B[o + 4], g);
      }
      ctx.fillStyle = C_GLOSS;
      ctx.fill();
      ctx.beginPath();
      for (let i = 0; i < nb; i++) {
        const o = i * BS;
        if (B[o + 4] >= 1) ctx.rect(B[o], B[o + 1] + B[o + 3] - g, B[o + 4], g);
      }
      ctx.fillStyle = C_SHADE;
      ctx.fill();
    }

    // 6. lifetime rings (drain like a clock hand sweeping clockwise)
    if (nr > 0) {
      const rr = ringR - m - this.ringLW * 0.5;
      ctx.lineWidth = this.ringLW;
      ctx.lineCap = 'butt';
      for (let style = 0; style < 3; style++) {
        let any = false;
        ctx.beginPath();
        for (let i = 0; i < nr; i++) {
          const o = i * RS;
          if (R[o + 3] !== style || R[o + 2] <= 0.004) continue;
          ctx.moveTo(R[o], R[o + 1] - rr);
          ctx.arc(R[o], R[o + 1], rr, TOP, TOP - R[o + 2] * TAU, true);
          any = true;
        }
        if (any) {
          ctx.strokeStyle = style === 2 ? C_WARN : TEAM_LIGHT[style];
          ctx.stroke();
        }
      }
    }
  }

  /** At most six towers: drawn one by one so the dormant Citadel can be dimmed as a whole. */
  _drawTowers(ctx) {
    const nt = this._nt;
    if (nt === 0) return;
    const stage = this.stage;
    const p = this.p;
    const dpr = this.dpr;
    const inv = this.inv;
    const m = this.m;
    const k = this.k;
    const W = this.cssW;
    const H = this.cssH;
    const insets = stage.insets;
    const insetTop = insets && insets.top > 0 ? insets.top : 0;
    const insetBottom = insets && insets.bottom > 0 ? insets.bottom : 0;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';

    for (let i = 0; i < nt; i++) {
      const e = this._towers[i];
      const rec = this._towerRecs[i];
      const def = e.def;
      const team = e.team === 1 ? 1 : 0;
      const cit = e.slot === 'citadel' || e.type === 'citadel';
      const w = cit ? this.cw : this.tw;
      const h = cit ? this.ch : this.th;
      const px = cit ? this.citPx : this.towerPx;
      const gh = this.gemH * (cit ? 1.15 : 1);
      const gw = this.gemW * (cit ? 1.15 : 1);

      // enemy towers: above the roof; own towers: below the base (toward the camera)
      let top;
      if (team === stage.playerTeam) {
        const forward = team === 0 ? 1 : -1;
        stage.worldToScreen(e.x, 0, e.z + forward * (e.radius + 0.55), p);
        top = p.y + px * 0.8 + 4 * k;
      } else {
        stage.worldToScreen(e.x, (def.height || 4.6) + 0.4, e.z, p);
        top = p.y - h - m;
      }
      if (p.behind || !(p.x > -80 && p.x < W + 80 && p.y > -80 && p.y < H + 80)) continue;
      const lo = insetTop + px + 5 * k;
      const hi = H - insetBottom - h - gh * 0.5 - 2;
      if (top > hi) top = hi;
      if (top < lo) top = lo;
      top = Math.round(top * dpr) * inv;
      const left = Math.round((p.x - w * 0.5 + gw * 0.25) * dpr) * inv;

      ctx.globalAlpha = e.active === false ? 0.58 : 1;

      // track
      const r = h * 0.5;
      ctx.fillStyle = C_BACK;
      ctx.beginPath();
      pillPath(ctx, left - m, top - m, w + m * 2, h + m * 2, r + m, r + m);
      ctx.fill();

      // recent-damage chip, then health
      const fw = w * rec.frac;
      const cw = w * rec.chip;
      if (cw - fw > 0.3) {
        ctx.fillStyle = C_CHIP;
        ctx.beginPath();
        this._fillPill(ctx, left, top, cw, w, h, r);
        ctx.fill();
      }
      if (fw > 0.3) {
        ctx.fillStyle = TEAM_FILL[team];
        ctx.beginPath();
        this._fillPill(ctx, left, top, fw, w, h, r);
        ctx.fill();
        const gx0 = left + r * 0.7;
        const gx1 = Math.min(left + fw, left + w - r * 0.7);
        if (gx1 - gx0 > 1) {
          ctx.fillStyle = C_GLOSS;
          ctx.fillRect(gx0, top + this.gloss, gx1 - gx0, Math.max(this.gloss, h * 0.26));
        }
      }

      // crystal badge on the left end
      const gx = left - m;
      const gy = top + h * 0.5;
      const sx = gw * 0.5;
      const sy = gh * 0.5;
      const sh = gh * 0.2;
      ctx.beginPath();
      ctx.moveTo(gx, gy - sy);
      ctx.lineTo(gx + sx, gy - sh);
      ctx.lineTo(gx + sx, gy + sh);
      ctx.lineTo(gx, gy + sy);
      ctx.lineTo(gx - sx, gy + sh);
      ctx.lineTo(gx - sx, gy - sh);
      ctx.closePath();
      ctx.strokeStyle = C_INK;
      ctx.lineWidth = (cit ? 4.4 : 2.8) * k;
      ctx.stroke();
      if (cit) {
        ctx.strokeStyle = C_TRIM;
        ctx.lineWidth = 2 * k;
        ctx.stroke();
      }
      ctx.fillStyle = TEAM_FILL[team];
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(gx, gy - sy);
      ctx.lineTo(gx, gy + sh * 0.4);
      ctx.lineTo(gx - sx, gy + sh);
      ctx.lineTo(gx - sx, gy - sh);
      ctx.closePath();
      ctx.fillStyle = C_FACET;
      ctx.fill();

      // HP number
      const hp = Math.ceil(e.hp);
      if (hp !== rec.hpInt) { rec.hpInt = hp; rec.hpText = String(hp > 0 ? hp : 0); }
      const tx = left + w * 0.5 + gw * 0.1;
      const ty = top - m - 2.5 * k;
      ctx.font = cit ? this.fontCit : this.fontTower;
      ctx.lineWidth = 3 * k;
      ctx.strokeStyle = C_INK;
      ctx.strokeText(rec.hpText, tx, ty);
      ctx.fillStyle = NUM_FILL[team];
      ctx.fillText(rec.hpText, tx, ty);
    }
    ctx.globalAlpha = 1;
  }

  /** Path of a health fill `fw` wide inside a pill track `w` wide: round left end, flat cut. */
  _fillPill(ctx, x, y, fw, w, h, r) {
    const half = fw * 0.5;
    const rl = r < half ? r : half;
    let rr = fw - (w - r);
    rr = rr > 0 ? (rr < rl ? rr : rl) : 0;
    pillPath(ctx, x, y, fw, h, rl, rr);
  }

  /** Countdown above each pending death blast. */
  _drawFuses(ctx, world, alpha) {
    const P = world.pending;
    if (!P || P.length === 0) return;
    const stage = this.stage;
    const p = this.p;
    const lag = (1 - alpha) * SIM_DT;
    const R = this.fuseR;
    const lw = 2.6 * this.k;
    let ready = false;
    for (let i = 0; i < P.length; i++) {
      const q = P[i];
      if (q.kind !== 'fuse') continue;
      const total = q.blast && q.blast.delay > 0 ? q.blast.delay : 1;
      let t = q.timeLeft + lag;
      t = t > 0 ? (t < total ? t : total) : 0;
      stage.worldToScreen(q.x, 1.7, q.z, p);
      if (p.behind || !(p.x > -40 && p.x < this.cssW + 40 && p.y > -40 && p.y < this.cssH + 40)) continue;
      if (!ready) {
        ready = true;
        ctx.font = this.fontFuse;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineCap = 'butt';
        ctx.lineWidth = lw;
      }
      const x = p.x;
      const y = p.y;
      ctx.fillStyle = C_BACK;
      ctx.beginPath();
      ctx.arc(x, y, R, 0, TAU);
      ctx.fill();
      const f = t / total;
      if (f > 0.004) {
        ctx.strokeStyle = TEAM_GLOW[q.team === 1 ? 1 : 0];
        ctx.beginPath();
        ctx.arc(x, y, R - lw * 0.5 - 1, TOP, TOP - f * TAU, true);
        ctx.stroke();
      }
      let idx = Math.ceil(t * 10 - 1e-6);
      idx = idx > 0 ? (idx < 99 ? idx : 99) : 0;
      ctx.fillStyle = C_FUSE_TEXT;
      ctx.fillText(DEC[idx], x, y + 0.5);
    }
  }

  _drawTexts(ctx, dt) {
    const T = this._texts;
    const stage = this.stage;
    const p = this.p;
    const dpr = this.dpr;
    const k = this.k;
    ctx.font = this.fontPop;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3.2 * k;
    ctx.strokeStyle = C_INK;
    let live = 0;
    for (let i = 0; i < T.length; i++) {
      const f = T[i];
      if (!f.on) continue;
      f.t += dt;
      if (f.t >= f.dur) { f.on = false; continue; }
      live++;
      stage.worldToScreen(f.x, f.y, f.z, p);
      if (p.behind || !(p.x > -60 && p.x < this.cssW + 60 && p.y > -60 && p.y < this.cssH + 60)) continue;
      const u = f.t / f.dur;
      const q = 1 - u;
      const rise = f.rise * k * (1 - q * q * q);
      // pop in (0.6 → 1.3 → 1), hold, fade out over the last 30 %
      let s = 1;
      if (u < 0.12) s = 0.6 + (u / 0.12) * 0.7;
      else if (u < 0.26) s = 1.3 - ((u - 0.12) / 0.14) * 0.3;
      s *= f.scale;
      ctx.globalAlpha = u < 0.7 ? 1 : q / 0.3;
      ctx.setTransform(dpr * s, 0, 0, dpr * s, p.x * dpr, (p.y - rise) * dpr);
      if (f.kind === T_AETHER) {
        // a little aether gem left of the number; the pair is centred on the anchor
        const gw = 3.6 * k;
        const gh = 5.4 * k;
        const off = gw + 1.5 * k;
        const gx = -f.tw * 0.5 - 1.5 * k;
        ctx.strokeText(f.text, off, 0.5);
        ctx.fillStyle = f.fill;
        ctx.fillText(f.text, off, 0.5);
        ctx.beginPath();
        ctx.moveTo(gx, -gh);
        ctx.lineTo(gx + gw, 0);
        ctx.lineTo(gx, gh);
        ctx.lineTo(gx - gw, 0);
        ctx.closePath();
        ctx.stroke();
        ctx.fillStyle = C_AETHER_GEM;
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(gx, -gh);
        ctx.lineTo(gx, gh * 0.25);
        ctx.lineTo(gx - gw, 0);
        ctx.closePath();
        ctx.fillStyle = C_FACET;
        ctx.fill();
      } else {
        ctx.strokeText(f.text, 0, 0.5);
        ctx.fillStyle = f.fill;
        ctx.fillText(f.text, 0, 0.5);
      }
    }
    this._textsOn = live;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
  }
}
