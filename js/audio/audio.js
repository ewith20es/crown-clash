// Procedural audio: every sound is synthesised with WebAudio at play time — no audio files.
// The engine stays silent (and allocates nothing) until unlock() is called from a user gesture.

const AC = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;

const MAX_VOICES = 26;

// Minimum seconds between two plays of the same cue (keeps big fights from turning into noise).
const MIN_GAP = {
  hit: 0.05, hitHeavy: 0.08, hitLight: 0.05, zap: 0.07, shoot: 0.07, shot: 0.07, orb: 0.09, thump: 0.1,
  pop: 0.06, crumble: 0.2, heal: 0.6, whoosh: 0.12, burst: 0.08, frost: 0.1, explosion: 0.12, tick: 0.2,
  shieldBreak: 0.08, cardSelect: 0.04, click: 0.04, charge: 0.3,
};

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);   // MIDI note → Hz

// Chord progressions (MIDI roots + chord tones) per music mode.
const MUSIC = {
  menu: { bpm: 76, chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], drive: 0, arp: 0.35 },
  battle: { bpm: 104, chords: [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]], drive: 0.6, arp: 0.5 },
  surge: { bpm: 122, chords: [[50, 53, 57], [48, 52, 55], [46, 50, 53], [57, 60, 64]], drive: 0.9, arp: 0.7 },
  overtime: { bpm: 138, chords: [[52, 55, 59], [52, 55, 60], [50, 53, 57], [51, 54, 59]], drive: 1.0, arp: 0.8 },
};

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.sfxOn = true;
    this.musicOn = true;
    this.voices = 0;
    this.lastAt = new Map();
    this.musicMode = null;
    this.wantMusic = null;
    this.musicTimer = 0;
    this.step = 0;
    this.nextStepAt = 0;
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (!this.ctx) return;
        if (document.hidden) this.ctx.suspend?.();
        else this.ctx.resume?.();
      });
    }
  }

  /** Call from the first user gesture (browsers keep audio suspended until then). */
  unlock() {
    if (!AC) return;
    try {
      if (!this.ctx) {
        this.ctx = new AC({ latencyHint: 'interactive' });
        this.build();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      if (this.wantMusic !== this.musicMode) this.music(this.wantMusic);
    } catch (err) {
      console.warn('Audio unavailable', err);
      this.ctx = null;
    }
  }

  build() {
    const ctx = this.ctx;
    this.master = ctx.createDynamicsCompressor();
    this.master.threshold.value = -16;
    this.master.knee.value = 18;
    this.master.ratio.value = 5;
    this.master.attack.value = 0.004;
    this.master.release.value = 0.2;
    this.master.connect(ctx.destination);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.sfxOn ? 0.85 : 0;
    this.sfxBus.connect(this.master);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicOn ? 0.5 : 0;
    this.musicBus.connect(this.master);

    // A soft echo gives the music some space without a convolution reverb.
    this.echo = ctx.createDelay(1);
    this.echo.delayTime.value = 0.31;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 2200;
    this.echo.connect(damp); damp.connect(fb); fb.connect(this.echo);
    damp.connect(this.musicBus);

    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    let seed = 22222;
    for (let i = 0; i < len; i++) {
      seed = (seed * 16807) % 2147483647;
      data[i] = (seed / 2147483647) * 2 - 1;
    }
  }

  setEnabled({ sfx, music } = {}) {
    if (typeof sfx === 'boolean') this.sfxOn = sfx;
    if (typeof music === 'boolean') this.musicOn = music;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sfxBus.gain.setTargetAtTime(this.sfxOn ? 0.85 : 0, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.musicOn ? 0.5 : 0, t, 0.2);
  }

  // ───────────────────────── synthesis primitives ─────────────────────────

  out(node, pan, bus) {
    const ctx = this.ctx;
    const dest = bus || this.sfxBus;
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      node.connect(p);
      p.connect(dest);
    } else {
      node.connect(dest);
    }
  }

  track(src) {
    this.voices++;
    src.onended = () => { this.voices--; };
  }

  /** Oscillator with a pitch glide and a percussive envelope. */
  tone(o) {
    const ctx = this.ctx;
    const t0 = ctx.currentTime + (o.delay || 0);
    const dur = o.dur || 0.1;
    const osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(Math.max(20, o.freq), t0);
    if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.freqEnd), t0 + dur);
    const g = ctx.createGain();
    const peak = Math.max(0.0002, o.gain ?? 0.2);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + (o.attack ?? 0.006));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node = osc;
    if (o.lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.lowpass;
      osc.connect(f);
      node = f;
    }
    node.connect(g);
    this.out(g, o.pan, o.bus);
    if (o.echo) g.connect(this.echo);
    this.track(osc);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  /** Filtered noise burst with an optional filter sweep. */
  noise(o) {
    const ctx = this.ctx;
    const t0 = ctx.currentTime + (o.delay || 0);
    const dur = o.dur || 0.15;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.loopStart = 0;
    const f = ctx.createBiquadFilter();
    f.type = o.filter || 'lowpass';
    f.Q.value = o.q ?? 0.8;
    f.frequency.setValueAtTime(Math.max(30, o.freq || 1000), t0);
    if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(Math.max(30, o.freqEnd), t0 + dur);
    const g = ctx.createGain();
    const peak = Math.max(0.0002, o.gain ?? 0.2);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + (o.attack ?? 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    this.out(g, o.pan, o.bus);
    this.track(src);
    src.start(t0, (o.offset ?? Math.random()) * 1.5);
    src.stop(t0 + dur + 0.03);
  }

  // ───────────────────────── cues ─────────────────────────

  /**
   * One-shot cue by name. opts: { pan (−1..1), gain (multiplier), important (bypass voice cap) }.
   * Unknown names are ignored, so callers never need to guard.
   */
  play(name, opts = {}) {
    if (!this.ctx || !this.sfxOn || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const gap = MIN_GAP[name];
    if (gap) {
      const prev = this.lastAt.get(name) || -1;
      if (now - prev < gap) return;
      this.lastAt.set(name, now);
    }
    if (this.voices >= MAX_VOICES && !opts.important) return;
    const fn = CUES[name];
    if (fn) fn(this, opts.pan || 0, opts.gain ?? 1);
  }

  /** Map simulation events to sounds. Positions pan across the stereo field. */
  handleEvents(events, _world, player = 0) {
    if (!this.ctx || !this.sfxOn) return;
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      const pan = typeof ev.x === 'number' ? (ev.x / 9) * (player === 0 ? 0.6 : -0.6) : 0;
      switch (ev.type) {
        case 'cardPlayed': this.play('deploy', { pan, gain: ev.team === player ? 1 : 0.7, important: true }); break;
        case 'spellCast': this.play('spellCast', { pan }); break;
        case 'shoot': {
          const k = ev.projKind;
          this.play(k === 'bolt' ? 'bolt' : k === 'shell' || k === 'glob' ? 'thump' : k === 'tracer' ? 'shot'
            : k === 'orb' || k === 'pulse' ? 'orb' : k === 'frost' ? 'frost' : 'shoot', { pan });
          break;
        }
        case 'impact': {
          const fx = ev.attackFx;
          if (ev.projKind === 'shell' || ev.projKind === 'glob') this.play('burst', { pan });
          else if (fx === 'smash' || fx === 'ram') this.play('hitHeavy', { pan });
          else if (fx === 'zap') this.play('zap', { pan });
          else if (fx === 'burst') this.play('burst', { pan });
          else if (fx === 'bolt') this.play('hitLight', { pan });
          else this.play('hit', { pan });
          break;
        }
        case 'chain': this.play('zap', { pan: 0 }); break;
        case 'shieldBreak': this.play('shieldBreak', { pan }); break;
        case 'death': this.play(ev.kind === 'unit' ? 'pop' : 'crumble', { pan }); break;
        case 'heal': if (ev.healed > 0) this.play('heal', { pan }); break;
        case 'aether': if (ev.team === player) this.play('aether', { pan }); break;
        case 'charge': this.play('charge', {}); break;
        case 'pounce': case 'hop': this.play('whoosh', {}); break;
        case 'landing': case 'blast': this.play('explosion', { pan, important: true }); break;
        case 'fuse': this.play('fuse', { pan }); break;
        case 'tunnel': case 'roll': this.play('rumble', { pan }); break;
        case 'zone':
          this.play(ev.kind === 'overclock' ? 'buff' : ev.kind === 'blight' ? 'hiss' : ev.kind === 'maelstrom' ? 'wind' : 'freeze', { pan });
          break;
        case 'spellImpact':
          if (ev.kind === 'comet') this.play('explosionBig', { pan, important: true });
          else if (ev.kind === 'shardstorm') this.play('shards', { pan });
          else if (ev.kind === 'jolt') this.play('zapBig', { pan });
          else if (ev.kind === 'skyfork') this.play('thunder', { pan, important: true });
          else if (ev.kind === 'seedpod') this.play('burst', { pan });
          break;
        case 'citadelWake': this.play('horn', { important: true }); break;
        case 'towerDown': this.play('towerDown', { pan, important: true }); break;
        case 'phase': this.play(ev.phase === 'overtime' ? 'overtime' : 'surge', { important: true }); break;
        default: break;
      }
    }
  }

  // ───────────────────────── music ─────────────────────────

  /** 'menu' | 'battle' | 'surge' | 'overtime' | null (stop). Safe to call before unlock(). */
  music(mode) {
    this.wantMusic = MUSIC[mode] ? mode : null;
    if (!this.ctx) return;
    if (this.wantMusic === this.musicMode) return;
    this.musicMode = this.wantMusic;
    clearInterval(this.musicTimer);
    this.musicTimer = 0;
    if (!this.musicMode) return;
    this.step = 0;
    this.nextStepAt = this.ctx.currentTime + 0.08;
    this.musicTimer = setInterval(() => this.schedule(), 90);
  }

  schedule() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || !this.musicMode) return;
    const m = MUSIC[this.musicMode];
    const stepDur = 60 / m.bpm / 4;                // sixteenth notes
    if (this.nextStepAt < ctx.currentTime - 0.5) this.nextStepAt = ctx.currentTime + 0.05;   // resumed from a pause
    while (this.nextStepAt < ctx.currentTime + 0.25) {
      if (this.musicOn) this.playStep(m, this.step, this.nextStepAt - ctx.currentTime, stepDur);
      this.step++;
      this.nextStepAt += stepDur;
    }
  }

  playStep(m, step, delay, stepDur) {
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const chord = m.chords[bar % m.chords.length];
    const bus = this.musicBus;
    delay = Math.max(0, delay);

    if (s === 0) {
      // pad: the chord, held for the bar
      for (let i = 0; i < chord.length; i++) {
        this.tone({ type: 'triangle', freq: NOTE(chord[i] + 12), dur: stepDur * 16, gain: 0.035, attack: stepDur * 3, delay, bus, lowpass: 1400 });
      }
    }
    if (s % 8 === 0 || (m.drive > 0.5 && s % 4 === 0)) {
      // bass
      this.tone({ type: 'sawtooth', freq: NOTE(chord[0] - 12), dur: stepDur * 3.5, gain: 0.07, delay, bus, lowpass: 420 });
    }
    // arpeggio: a fixed pattern over the chord tones, sparser when calm
    const pattern = [0, 2, 1, 2, 0, 2, 1, 3];
    const on = m.arp >= 0.6 ? s % 2 === 0 : s % 4 === 0 || s === 6 || s === 14;
    if (on) {
      const idx = pattern[(s >> 1) % pattern.length];
      const note = idx === 3 ? chord[0] + 24 : chord[idx] + 12 + (bar % 2 === 1 && s >= 8 ? 12 : 0);
      this.tone({ type: 'triangle', freq: NOTE(note), dur: stepDur * 2.4, gain: 0.05 + m.arp * 0.02, delay, bus, echo: true });
    }
    if (m.drive > 0) {
      if (s % 4 === 0) this.tone({ type: 'sine', freq: 120, freqEnd: 42, dur: 0.16, gain: 0.16 * m.drive, delay, bus });
      if (s % 4 === 2) this.noise({ filter: 'highpass', freq: 6500, dur: 0.035, gain: 0.03 * m.drive, delay, bus });
      if (m.drive > 0.8 && s % 8 === 4) this.noise({ filter: 'bandpass', freq: 1800, q: 0.7, dur: 0.11, gain: 0.07, delay, bus });
    }
  }
}

// Each cue: (engine, pan, gainMultiplier) → schedules its oscillators / noise bursts.
const CUES = {
  click: (a, p, g) => a.tone({ type: 'triangle', freq: 660, freqEnd: 940, dur: 0.06, gain: 0.12 * g, pan: p }),
  tab: (a, p, g) => a.tone({ type: 'triangle', freq: 520, freqEnd: 620, dur: 0.05, gain: 0.1 * g, pan: p }),
  open: (a, p, g) => a.noise({ filter: 'bandpass', freq: 500, freqEnd: 2400, q: 1.2, dur: 0.16, gain: 0.08 * g }),
  close: (a, p, g) => a.noise({ filter: 'bandpass', freq: 2200, freqEnd: 450, q: 1.2, dur: 0.14, gain: 0.07 * g }),
  equip: (a, p, g) => {
    a.tone({ type: 'triangle', freq: NOTE(72), dur: 0.09, gain: 0.13 * g });
    a.tone({ type: 'triangle', freq: NOTE(79), dur: 0.16, gain: 0.13 * g, delay: 0.07 });
  },
  error: (a, p, g) => {
    a.tone({ type: 'square', freq: 170, dur: 0.09, gain: 0.07 * g, lowpass: 900 });
    a.tone({ type: 'square', freq: 140, dur: 0.12, gain: 0.07 * g, delay: 0.1, lowpass: 900 });
  },
  cardSelect: (a, p, g) => a.tone({ type: 'triangle', freq: 880, freqEnd: 1180, dur: 0.045, gain: 0.08 * g }),
  tick: (a, p, g) => a.tone({ type: 'square', freq: 1500, dur: 0.03, gain: 0.04 * g, lowpass: 3000 }),

  deploy: (a, p, g) => {
    a.tone({ type: 'sine', freq: 170, freqEnd: 58, dur: 0.22, gain: 0.3 * g, pan: p });
    a.noise({ filter: 'lowpass', freq: 2600, freqEnd: 500, dur: 0.2, gain: 0.1 * g, pan: p });
  },
  spellCast: (a, p, g) => a.noise({ filter: 'bandpass', freq: 2600, freqEnd: 380, q: 2.2, dur: 0.55, gain: 0.12 * g, pan: p, attack: 0.08 }),

  hit: (a, p, g) => {
    a.noise({ filter: 'lowpass', freq: 2200, freqEnd: 700, dur: 0.07, gain: 0.13 * g, pan: p });
    a.tone({ type: 'sine', freq: 240, freqEnd: 120, dur: 0.07, gain: 0.1 * g, pan: p });
  },
  hitLight: (a, p, g) => a.noise({ filter: 'bandpass', freq: 3200, q: 1.5, dur: 0.045, gain: 0.07 * g, pan: p }),
  hitHeavy: (a, p, g) => {
    a.tone({ type: 'sine', freq: 150, freqEnd: 48, dur: 0.2, gain: 0.3 * g, pan: p });
    a.noise({ filter: 'lowpass', freq: 1300, freqEnd: 260, dur: 0.16, gain: 0.17 * g, pan: p });
  },
  zap: (a, p, g) => {
    a.tone({ type: 'sawtooth', freq: 1900, freqEnd: 260, dur: 0.09, gain: 0.07 * g, pan: p });
    a.noise({ filter: 'highpass', freq: 4200, dur: 0.07, gain: 0.07 * g, pan: p });
  },
  zapBig: (a, p, g) => {
    a.tone({ type: 'sawtooth', freq: 2400, freqEnd: 140, dur: 0.24, gain: 0.12 * g, pan: p });
    a.noise({ filter: 'highpass', freq: 3000, dur: 0.2, gain: 0.12 * g, pan: p });
  },
  thunder: (a, p, g) => {
    a.noise({ filter: 'highpass', freq: 2500, dur: 0.12, gain: 0.2 * g, pan: p });
    a.noise({ filter: 'lowpass', freq: 900, freqEnd: 70, dur: 0.9, gain: 0.3 * g, pan: p, attack: 0.02 });
    a.tone({ type: 'sine', freq: 95, freqEnd: 34, dur: 0.7, gain: 0.28 * g, pan: p });
  },
  shoot: (a, p, g) => a.tone({ type: 'triangle', freq: 980, freqEnd: 460, dur: 0.07, gain: 0.06 * g, pan: p }),
  shot: (a, p, g) => {
    a.noise({ filter: 'bandpass', freq: 1800, q: 0.9, dur: 0.06, gain: 0.12 * g, pan: p });
    a.tone({ type: 'square', freq: 520, freqEnd: 150, dur: 0.07, gain: 0.05 * g, pan: p, lowpass: 2400 });
  },
  bolt: (a, p, g) => a.tone({ type: 'sine', freq: 1400, freqEnd: 520, dur: 0.11, gain: 0.07 * g, pan: p }),
  orb: (a, p, g) => a.tone({ type: 'sine', freq: 420, freqEnd: 760, dur: 0.18, gain: 0.08 * g, pan: p, attack: 0.03 }),
  frost: (a, p, g) => {
    a.tone({ type: 'sine', freq: 2100, freqEnd: 2900, dur: 0.12, gain: 0.04 * g, pan: p });
    a.noise({ filter: 'highpass', freq: 6000, dur: 0.1, gain: 0.04 * g, pan: p });
  },
  thump: (a, p, g) => {
    a.tone({ type: 'sine', freq: 120, freqEnd: 50, dur: 0.18, gain: 0.25 * g, pan: p });
    a.noise({ filter: 'lowpass', freq: 800, dur: 0.1, gain: 0.1 * g, pan: p });
  },
  burst: (a, p, g) => {
    a.noise({ filter: 'lowpass', freq: 3000, freqEnd: 300, dur: 0.22, gain: 0.18 * g, pan: p });
    a.tone({ type: 'sine', freq: 190, freqEnd: 60, dur: 0.2, gain: 0.16 * g, pan: p });
  },
  explosion: (a, p, g) => {
    a.noise({ filter: 'lowpass', freq: 1800, freqEnd: 90, dur: 0.6, gain: 0.3 * g, pan: p });
    a.tone({ type: 'sine', freq: 105, freqEnd: 34, dur: 0.5, gain: 0.32 * g, pan: p });
  },
  explosionBig: (a, p, g) => {
    a.noise({ filter: 'lowpass', freq: 2600, freqEnd: 60, dur: 0.95, gain: 0.36 * g, pan: p });
    a.tone({ type: 'sine', freq: 90, freqEnd: 28, dur: 0.8, gain: 0.38 * g, pan: p });
    a.noise({ filter: 'highpass', freq: 3500, dur: 0.18, gain: 0.1 * g, pan: p });
  },
  shards: (a, p, g) => {
    for (let i = 0; i < 5; i++) {
      a.tone({ type: 'sine', freq: 2200 + i * 430, freqEnd: 1500 + i * 300, dur: 0.09, gain: 0.035 * g, pan: p, delay: i * 0.028 });
    }
    a.noise({ filter: 'highpass', freq: 5000, dur: 0.16, gain: 0.07 * g, pan: p });
  },
  freeze: (a, p, g) => {
    for (let i = 0; i < 4; i++) {
      a.tone({ type: 'sine', freq: 1300 * Math.pow(1.26, i), dur: 0.7, gain: 0.035 * g, pan: p, delay: i * 0.05, attack: 0.03 });
    }
    a.noise({ filter: 'highpass', freq: 7000, dur: 0.35, gain: 0.05 * g, pan: p, attack: 0.05 });
  },
  buff: (a, p, g) => {
    a.tone({ type: 'sawtooth', freq: 220, freqEnd: 660, dur: 0.4, gain: 0.07 * g, pan: p, lowpass: 2600, attack: 0.05 });
    a.tone({ type: 'triangle', freq: 660, freqEnd: 990, dur: 0.3, gain: 0.06 * g, pan: p, delay: 0.18 });
  },
  hiss: (a, p, g) => a.noise({ filter: 'bandpass', freq: 3800, freqEnd: 1400, q: 1.4, dur: 0.8, gain: 0.08 * g, pan: p, attack: 0.1 }),
  wind: (a, p, g) => a.noise({ filter: 'bandpass', freq: 300, freqEnd: 1500, q: 1.8, dur: 1.5, gain: 0.16 * g, pan: p, attack: 0.3 }),
  rumble: (a, p, g) => {
    a.noise({ filter: 'lowpass', freq: 260, freqEnd: 120, dur: 1.4, gain: 0.3 * g, pan: p, attack: 0.1 });
    a.tone({ type: 'sine', freq: 62, freqEnd: 44, dur: 1.2, gain: 0.2 * g, pan: p, attack: 0.1 });
  },
  fuse: (a, p, g) => a.noise({ filter: 'highpass', freq: 5200, dur: 1.0, gain: 0.05 * g, pan: p, attack: 0.05 }),
  whoosh: (a, p, g) => a.noise({ filter: 'bandpass', freq: 700, freqEnd: 2600, q: 1.6, dur: 0.22, gain: 0.1 * g, pan: p, attack: 0.05 }),
  charge: (a, p, g) => a.tone({ type: 'sawtooth', freq: 140, freqEnd: 520, dur: 0.4, gain: 0.06 * g, pan: p, lowpass: 1800, attack: 0.1 }),
  pop: (a, p, g) => {
    a.tone({ type: 'sine', freq: 330, freqEnd: 110, dur: 0.08, gain: 0.12 * g, pan: p });
    a.noise({ filter: 'lowpass', freq: 1500, dur: 0.06, gain: 0.06 * g, pan: p });
  },
  crumble: (a, p, g) => {
    a.noise({ filter: 'lowpass', freq: 1100, freqEnd: 160, dur: 0.6, gain: 0.25 * g, pan: p });
    a.tone({ type: 'sine', freq: 130, freqEnd: 45, dur: 0.4, gain: 0.2 * g, pan: p });
  },
  shieldBreak: (a, p, g) => {
    a.noise({ filter: 'highpass', freq: 4500, dur: 0.12, gain: 0.12 * g, pan: p });
    a.tone({ type: 'sine', freq: 3100, freqEnd: 1700, dur: 0.1, gain: 0.05 * g, pan: p });
  },
  heal: (a, p, g) => {
    a.tone({ type: 'triangle', freq: NOTE(76), dur: 0.3, gain: 0.05 * g, pan: p, attack: 0.03 });
    a.tone({ type: 'triangle', freq: NOTE(80), dur: 0.34, gain: 0.05 * g, pan: p, delay: 0.07, attack: 0.03 });
  },
  aether: (a, p, g) => a.tone({ type: 'sine', freq: 1150, freqEnd: 1900, dur: 0.1, gain: 0.08 * g, pan: p }),
  horn: (a, p, g) => {
    a.tone({ type: 'sawtooth', freq: NOTE(45), freqEnd: NOTE(52), dur: 0.75, gain: 0.13 * g, lowpass: 900, attack: 0.12 });
    a.tone({ type: 'sawtooth', freq: NOTE(57), freqEnd: NOTE(64), dur: 0.75, gain: 0.07 * g, lowpass: 1400, attack: 0.12 });
  },
  towerDown: (a, p, g) => {
    CUES.explosionBig(a, p, g);
    a.tone({ type: 'sawtooth', freq: NOTE(57), freqEnd: NOTE(40), dur: 0.9, gain: 0.1 * g, lowpass: 1000, delay: 0.1 });
    a.noise({ filter: 'lowpass', freq: 700, freqEnd: 120, dur: 1.2, gain: 0.2 * g, pan: p, delay: 0.25, attack: 0.1 });
  },
  start: (a, p, g) => {
    [62, 69, 74].forEach((n, i) => a.tone({ type: 'triangle', freq: NOTE(n), dur: 0.22, gain: 0.12 * g, delay: i * 0.1 }));
  },
  surge: (a, p, g) => {
    [57, 62, 66, 69, 74].forEach((n, i) => a.tone({ type: 'triangle', freq: NOTE(n), dur: 0.2, gain: 0.11 * g, delay: i * 0.07 }));
  },
  overtime: (a, p, g) => {
    for (let i = 0; i < 3; i++) {
      a.tone({ type: 'square', freq: NOTE(76), dur: 0.14, gain: 0.07 * g, delay: i * 0.3, lowpass: 2200 });
      a.tone({ type: 'square', freq: NOTE(70), dur: 0.14, gain: 0.07 * g, delay: i * 0.3 + 0.15, lowpass: 2200 });
    }
  },
  victory: (a, p, g) => {
    [60, 64, 67, 72, 76, 79].forEach((n, i) => a.tone({ type: 'triangle', freq: NOTE(n), dur: 0.36, gain: 0.13 * g, delay: i * 0.11 }));
    [60, 64, 67, 72].forEach((n) => a.tone({ type: 'sawtooth', freq: NOTE(n), dur: 1.3, gain: 0.05 * g, delay: 0.7, lowpass: 2000, attack: 0.05 }));
  },
  defeat: (a, p, g) => {
    [69, 65, 62, 57].forEach((n, i) => a.tone({ type: 'triangle', freq: NOTE(n), dur: 0.5, gain: 0.12 * g, delay: i * 0.24 }));
    a.tone({ type: 'sawtooth', freq: NOTE(45), dur: 1.4, gain: 0.07 * g, delay: 0.95, lowpass: 700, attack: 0.08 });
  },
  draw: (a, p, g) => {
    [64, 62, 64].forEach((n, i) => a.tone({ type: 'triangle', freq: NOTE(n), dur: 0.4, gain: 0.11 * g, delay: i * 0.2 }));
  },
};
