// One match: owns the simulation, the AI, and the 3-D views of every entity, and translates
// simulation events into camera shakes, banners, sounds and effects.
import * as THREE from 'three';
import { SIM_DT, MATCH, TEAMS, UNIT_VISUAL_SCALE } from '../config.js';
import { World } from '../sim/world.js';
import { OnlineWorld } from './online-world.js';
import { Bot } from '../ai/bot.js';
import { createEntityView, createRuinView } from '../render/models/index.js';
import { UNITS, CARD_BY_ID } from '../data/cards.js';

// Team-coloured ground ring under every troop: tells the sides apart at a glance in a brawl.
let ringGeo = null;
const ringMats = [];
function teamRing(team, radius) {
  if (!ringGeo) {
    ringGeo = new THREE.RingGeometry(0.78, 1, 32, 1);
    ringGeo.rotateX(-Math.PI / 2);
    for (const t of TEAMS) {
      ringMats.push(new THREE.MeshBasicMaterial({
        color: new THREE.Color(t.glow).multiplyScalar(1.15), transparent: true, opacity: 0.6,
        depthWrite: false, toneMapped: false,
      }));
    }
  }
  const m = new THREE.Mesh(ringGeo, ringMats[team]);
  m.userData.r = Math.max(0.3, radius * UNIT_VISUAL_SCALE * 1.05);
  m.renderOrder = 2;
  // the per-frame scale multiplies this base radius
  const g = new THREE.Group();
  g.add(m);
  m.scale.setScalar(m.userData.r);
  return g;
}

export const PLAYER = 0;
export const ENEMY = 1;

const MAX_STEPS_PER_FRAME = 6;
const INTRO_TIME = 1.6;      // camera glide + "Battle!" banner before the clock starts
const TWO_PI = Math.PI * 2;

function dampAngle(from, to, rate, dt) {
  let d = (to - from) % TWO_PI;
  if (d > Math.PI) d -= TWO_PI;
  else if (d < -Math.PI) d += TWO_PI;
  return from + d * (1 - Math.exp(-rate * dt));
}

export class Battle {
  /**
   * @param ctx { stage, arena, fx, overlay, audio, ui, onEnd(result) }
   */
  constructor(ctx) {
    this.stage = ctx.stage;
    this.arena = ctx.arena;
    this.fx = ctx.fx;
    this.overlay = ctx.overlay;
    this.audio = ctx.audio;
    this.ui = ctx.ui;
    this.onEnd = ctx.onEnd || (() => {});

    this.player = PLAYER;
    this.online = null;
    this.world = null;
    this.bot = null;
    this.autoBot = null;      // debug: an AI playing the local player's hand (?autoplay)
    this.running = false;
    this.ended = false;
    this.speed = 1;
    this.acc = 0;
    this.alpha = 1;
    this.intro = 0;

    this.views = new Map();   // entity id → record
    this.dying = [];
    this.ruins = [];
    this.stamp = 0;
    this.handSig = '';
    this.anim = {
      time: 0, state: 'idle', stateTime: 0, deployFrac: 1, moveSpeed: 0, attackT: -1, windup: 0.3, hitSpeed: 1,
      hpFrac: 1, frozen: false, stunned: false, slowed: false, hasted: false, active: true, aimYaw: null,
      lifeFrac: 1, charged: false, hop: 0, shieldFrac: 0, rampT: 0, beam: false,
    };
  }

  // ───────────────────────── lifecycle ─────────────────────────

  start({ deck, towerTroop, opponent, difficulty, seed, autoplay = false, speed = 1 }) {
    this.cleanup();
    this.world = new World({ seed, decks: [deck, opponent.deck], towerTroops: [towerTroop,'tower-princess'] });
    this.bot = new Bot(this.world, ENEMY, { difficulty, seed: seed + 7 });
    this.autoBot = autoplay ? new Bot(this.world, PLAYER, { difficulty: 'hard', seed: seed + 13 }) : null;
    this.opponent = opponent;
    this.difficulty = difficulty;
    this.speed = speed;
    this.running = false;
    this.ended = false;
    this.acc = 0;
    this.alpha = 1;
    this.intro = INTRO_TIME;
    this.handSig = '';
    this.surrendered = false;
    this.refreshHud(true);
    this.prewarm([deck, opponent.deck]);
  }

  startOnline(packet, online) {
    this.cleanup();
    this.online = online;
    this.player = packet.team;
    this.world = new OnlineWorld();
    this.intro = 0;
    this.ended = false;
    this.surrendered = false;
    this.handSig = '';
    this.prewarm([packet.frame.players[this.player].deck]);
  }

  receive(packet) {
    const world = this.world;
    const elapsed = packet.frame.time - world.time;
    world.apply(packet.frame);
    this.snapshotInterval = Math.min(.5, Math.max(SIM_DT, elapsed));
    this.alpha = 0;
    this.running = packet.live && world.phase !== 'ended';
    this.handleEvents(packet.events);
    this.ui.setStars(world.players[this.player].stars, world.players[1 - this.player].stars);
    if (world.phase === 'ended') this.finish({ winner: world.winner,
      stars: world.players.map(p => p.stars), reason: world.endReason });
    this.refreshHud(false);
  }

  activateAbility(id) {
    if (!this.canPlayerAct()) return;
    if (this.online) this.online.send({ type: 'ability', id });
    else this.world.activateAbility(this.player, id);
  }

  /**
   * Builds every model the two decks can produce (and compiles their shaders) during the intro,
   * so the first appearance of a unit mid-fight doesn't stutter.
   */
  prewarm(decks) {
    const types = new Set(['spire', 'citadel']);
    const addType = (t) => {
      const u = UNITS[t];
      if (!u || types.has(t)) return;
      types.add(t);
      if (u.spawn) addType(u.spawn.unit);
      if (u.deathSpawn) addType(u.deathSpawn.unit);
    };
    for (const deck of decks) {
      for (const id of deck) {
        const c = CARD_BY_ID[id];
        if (!c) continue;
        if (c.baseId && CARD_BY_ID[c.baseId]?.unit) addType(CARD_BY_ID[c.baseId].unit);
        for (const group of c.groups || []) addType(group.unit);
        if (c.unit) addType(c.unit);
        if (c.spell && c.spell.unit) addType(c.spell.unit);
      }
    }
    const scene = this.stage.scene;
    const temp = [];
    try {
      for (const t of types) {
        for (const team of [0, 1]) {
          const v = createEntityView(t, team);
          v.root.position.set(0, -50, 0);       // far below the island: compiled, never seen
          scene.add(v.root);
          temp.push(v);
        }
      }
      this.stage.renderer.compile(scene, this.stage.camera);
    } catch (err) {
      console.warn('[battle] prewarm failed', err);
    }
    for (const v of temp) { scene.remove(v.root); v.dispose(); }
  }

  /** Remove every view and effect. Safe to call at any time. */
  cleanup() {
    const scene = this.stage.scene;
    for (const rec of this.views.values()) {
      scene.remove(rec.view.root);
      if (rec.ring) scene.remove(rec.ring);
      rec.view.dispose();
    }
    this.views.clear();
    for (const rec of this.dying) { scene.remove(rec.view.root); rec.view.dispose(); }
    this.dying.length = 0;
    for (const r of this.ruins) scene.remove(r);
    this.ruins.length = 0;
    this.fx.reset();
    this.overlay.reset();
    this.player = PLAYER;
    this.online = null;
    this.world = null;
    this.bot = null;
    this.autoBot = null;
    this.running = false;
  }

  canPlayerAct() {
    return !!this.world && this.running && !this.ended && !this.autoBot;
  }

  /** Try to play a card for the local player. Gives UI/audio feedback either way. */
  playCard(handIndex, x, z) {
    if (!this.canPlayerAct()) return false;
    const res = this.world.canPlay(this.player, handIndex, x, z);
    if (!res.ok) {
      this.ui.flashCard(handIndex, 'denied');
      this.audio.play('error');
      if (res.reason === 'aether') this.ui.hint('Not enough elixir yet');
      if (res.reason === 'space') this.ui.hint('No free deployment tile');
      return false;
    }
    const ok = this.online
      ? this.online.send({ type: 'card', card: res.card.id, index: handIndex, x, z })
      : this.world.playCard(this.player, handIndex, x, z);
    if (ok) {
      this.ui.flashCard(handIndex, 'played');
      this.ui.hint(null);
    }
    return ok;
  }

  surrender() {
    if (!this.world || this.ended) return;
    if (this.online) { this.online.surrender(); return; }
    this.surrendered = true;
    this.finish({ winner: ENEMY, stars: [this.world.players[0].stars, this.world.players[1].stars], reason: 'surrender' });
  }

  // ───────────────────────── per frame ─────────────────────────

  update(dt, time) {
    const world = this.world;
    if (!world) return;

    if (this.intro > 0) {
      this.intro -= dt;
      if (this.intro <= 0) {
        this.running = true;
        this.ui.banner('BATTLE!', { kind: 'good', duration: 1.2 });
        this.audio.play('start');
      }
    }

    if (this.online) {
      this.alpha = Math.min(1, this.alpha + dt / this.snapshotInterval);
    } else if (this.running) {
      this.acc += dt * this.speed;
      let steps = 0;
      while (this.acc >= SIM_DT && steps < MAX_STEPS_PER_FRAME * Math.max(1, this.speed)) {
        if (world.phase !== 'ended') {
          this.bot.update(SIM_DT);
          if (this.autoBot) this.autoBot.update(SIM_DT);
        }
        world.step(SIM_DT);
        this.acc -= SIM_DT;
        steps++;
      }
      if (this.acc >= SIM_DT) this.acc = 0;   // drop the backlog after a long stall
      const events = world.drainEvents();
      if (events.length) this.handleEvents(events);
      this.alpha = world.phase === 'ended' ? 1 : this.acc / SIM_DT;
    } else {
      this.alpha = 1;
    }

    this.syncViews(dt, time, this.alpha);
    this.fx.sync(world, this.alpha, time);
    this.refreshHud(false);
  }

  refreshHud(force) {
    const world = this.world;
    if (!world) return;
    const p = world.players[this.player];
    this.ui.setAether(p.aether, MATCH.AETHER_MAX);
    this.ui.setAbilities(world.abilities(this.player));
    this.ui.setTimer(world.timeLeft, world.phase);
    const sig = p.hand.join(',') + '|' + p.next;
    if (force || sig !== this.handSig) {
      this.handSig = sig;
      this.ui.setHand(p.hand, p.next);
    }
    const costs = p.hand.map(id => world.cardCost(this.player, CARD_BY_ID[id]));
    const cycles = p.hand.map(id => {
      const card = CARD_BY_ID[id];
      if (card.variant !== 'evolution') return null;
      const played = p.cycles[id] || 0;
      return played >= card.cycles ? 'READY' : `${played}/${card.cycles}`;
    });
    this.ui.setHandCosts(costs, cycles);
    if (force) this.ui.setStars(world.players[this.player].stars, world.players[1 - this.player].stars);
  }

  syncViews(dt, time, alpha) {
    const world = this.world;
    const scene = this.stage.scene;
    const stamp = ++this.stamp;
    const s = this.anim;
    s.time = time;

    const ents = world.entities;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      let rec = this.views.get(e.id);
      if (!rec) {
        const view = createEntityView(e.type, e.team);
        rec = { view, yaw: e.facing, stamp, kind: e.kind, x: e.x, y: e.y, z: e.z, ring: null, base: 1 };
        if (e.kind !== 'unit') {
          view.root.rotation.y = e.team === PLAYER ? Math.PI : 0;
        } else {
          rec.base = UNIT_VISUAL_SCALE;
          view.root.scale.setScalar(UNIT_VISUAL_SCALE);
          rec.ring = teamRing(e.team, e.radius);
          scene.add(rec.ring);
        }
        scene.add(view.root);
        this.views.set(e.id, rec);
      }
      rec.stamp = stamp;

      const x = e.px + (e.x - e.px) * alpha;
      const z = e.pz + (e.z - e.pz) * alpha;
      const y = e.py + (e.y - e.py) * alpha;
      rec.x = x; rec.y = y; rec.z = z;
      const root = rec.view.root;
      root.position.set(x, y, z);
      if (e.kind === 'unit') {
        rec.yaw = dampAngle(rec.yaw, e.facing, 16, dt);
        root.rotation.y = rec.yaw;
        const ring = rec.ring;
        ring.position.set(x, 0.11, z);
        // fade the ring in with deployment; flyers get a fainter ring on the ground below them
        const dep = e.deployTime > 0 ? Math.min(1, Math.max(0, 1 - e.deployLeft / e.deployTime)) : 1;
        ring.visible = dep > 0.05;
        ring.scale.setScalar(0.6 + 0.4 * dep);
      }

      const def = e.def;
      s.state = e.state;
      s.stateTime = e.stateTime;
      s.deployFrac = e.deployTime > 0 ? Math.min(1, Math.max(0, 1 - e.deployLeft / e.deployTime)) : 1;
      s.moveSpeed = e.speedNow || 0;
      s.attackT = e.attackT >= 0 ? e.attackT + alpha * SIM_DT : -1;
      s.windup = def.windup;
      s.hitSpeed = def.hitSpeed || 1;
      s.hpFrac = e.maxHp > 0 ? e.hp / e.maxHp : 1;
      s.frozen = e.frozen > 0;
      s.stunned = e.stunned > 0;
      s.slowed = e.slowT > 0;
      s.hasted = e.hasteT > 0;
      s.active = e.active !== false;
      s.lifeFrac = e.lifeMax > 0 ? Math.max(0, e.lifeLeft / e.lifeMax) : 1;
      s.charged = !!e.charged;
      s.hop = e.hop || 0;
      s.shieldFrac = e.maxShield > 0 ? Math.max(0, e.shield / e.maxShield) : 0;
      s.rampT = e.rampT || 0;
      s.beam = !!e.beam;
      s.aimYaw = null;
      if (e.targetId) {
        const t = world.getEntity(e.targetId);
        if (t) s.aimYaw = Math.atan2(t.x - e.x, t.z - e.z);
      }
      rec.view.update(dt, s);
    }

    // Entities that left the simulation this frame start their exit animation.
    for (const [id, rec] of this.views) {
      if (rec.stamp !== stamp) {
        this.views.delete(id);
        if (rec.ring) { scene.remove(rec.ring); rec.ring = null; }
        rec.t = 0;
        rec.dur = rec.kind === 'tower' ? 0.75 : rec.kind === 'building' ? 0.4 : 0.2;
        this.dying.push(rec);
      }
    }
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const rec = this.dying[i];
      rec.t += dt;
      const k = Math.min(1, rec.t / rec.dur);
      const root = rec.view.root;
      if (rec.kind === 'unit') {
        const sc = (1 - k * k) * rec.base;
        root.scale.setScalar(Math.max(0.001, sc));
      } else {
        // structures sink into the ground with a shudder
        root.position.set(rec.x + Math.sin(rec.t * 70) * 0.05 * (1 - k), rec.y - k * k * 2.2, rec.z);
        root.scale.set(1 + k * 0.08, Math.max(0.001, 1 - k * 0.55), 1 + k * 0.08);
      }
      if (k >= 1) {
        scene.remove(root);
        rec.view.dispose();
        this.dying.splice(i, 1);
      }
    }
  }

  // ───────────────────────── events ─────────────────────────

  handleEvents(events) {
    const world = this.world;
    const { ui, stage, audio } = this;
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      switch (ev.type) {
        case 'damage': {
          const rec = this.views.get(ev.id);
          if (rec) rec.view.flash();
          break;
        }
        case 'towerDown': {
          ui.setStars(world.players[this.player].stars, world.players[1 - this.player].stars);
          stage.shake(ev.slot === 'citadel' ? 1.0 : 0.65, ev.slot === 'citadel' ? 0.9 : 0.6);
          const ruin = createRuinView(ev.slot === 'citadel' ? 'citadel' : 'spire', ev.team);
          ruin.position.set(ev.x, 0, ev.z);
          ruin.rotation.y = ev.team === PLAYER ? Math.PI : 0;
          stage.scene.add(ruin);
          this.ruins.push(ruin);
          if (ev.slot !== 'citadel') {
            if (ev.team !== this.player) ui.banner('TOWER DESTROYED', { kind: 'good', sub: 'You can now deploy on that side of their arena' });
            else ui.banner('TOWER LOST', { kind: 'bad', sub: 'Your King Tower has awakened' });
          }
          break;
        }
        case 'citadelWake':
          if (ev.team !== this.player) ui.banner('ENEMY KING TOWER AWAKENS', { kind: 'info', duration: 1.6 });
          break;
        case 'phase':
          if (ev.phase === 'surge') ui.banner('DOUBLE ELIXIR', { kind: 'surge', sub: 'Elixir flows twice as fast' });
          else if (ev.phase === 'overtime') ui.banner('OVERTIME', { kind: 'overtime', sub: 'Sudden death — next tower wins' });
          audio.music(ev.phase);
          break;
        case 'spellImpact':
          if (ev.kind === 'comet') stage.shake(0.5, 0.4);
          else if (ev.kind === 'skyfork') stage.shake(0.3, 0.25);
          break;
        case 'landing':
          stage.shake(0.55, 0.45);
          break;
        case 'blast':
          stage.shake(0.6, 0.45);
          break;
        case 'end':
          this.finish(ev);
          break;
        default:
          break;
      }
    }
    this.fx.handleEvents(events, world);
    this.overlay.handleEvents(events, world);
    audio.handleEvents(events, world, this.player);
  }

  finish(ev) {
    if (this.ended) return;
    this.ended = true;
    const world = this.world;
    const outcome = ev.winner === this.player ? 'win' : ev.winner === 1 - this.player ? 'lose' : 'draw';
    this.ui.setStars(world.players[this.player].stars, world.players[1 - this.player].stars);
    if (this.surrendered) this.running = false;
    this.onEnd({
      outcome,
      reason: ev.reason,
      stars: [ev.stars[this.player], ev.stars[1 - this.player]],
      stats: world.stats ? { ...world.stats[this.player] } : {},
      surrendered: this.surrendered || ev.reason === 'surrender' || ev.reason === 'disconnect',
    });
  }
}
