// Aether Spires — entry point: boots the renderer, UI and audio, runs the frame loop and
// drives the menu → battle → result flow.
//
// Debug query parameters:
//   ?gallery        model gallery (see js/debug/gallery.js)
//   ?autostart      jump straight into a battle
//   ?autoplay       an AI plays your hand too (hands-free match, handy for soak tests)
//   ?speed=4        simulation speed multiplier
//   ?seed=123       fixed match seed       ?opp=tock   fixed opponent id
//   ?quality=low    override the graphics preset for this session
//   ?fps            show a frame-time readout
import { CARDS, OPPONENTS } from './data/cards.js';
import { cardArtUrl } from './data/royale-art.js';
import { loadState, saveState } from './game/store.js';

const params = new URLSearchParams(location.search);

const TROPHIES = {
  easy: { win: 20, lose: -8 },
  normal: { win: 30, lose: -15 },
  hard: { win: 40, lose: -12 },
};

function bootMessage(text) {
  const el = document.getElementById('boot-msg');
  if (el) el.textContent = text;
}

class Game {
  async boot() {
    const [
      { Stage }, { ArenaView }, { Fx }, { Overlay }, models, { UI }, { AudioEngine }, { Battle }, { CardInput },
    ] = await Promise.all([
      import('./render/stage.js'), import('./render/arena.js'), import('./render/fx.js'),
      import('./render/overlay.js'), import('./render/models/index.js'), import('./ui/ui.js'),
      import('./audio/audio.js'), import('./game/battle.js'), import('./game/input.js'),
    ]);

    const canvas = document.getElementById('game-canvas');
    const overlayCanvas = document.getElementById('overlay-canvas');
    this.canvas = canvas;
    this.state = loadState();
    const q = params.get('quality');
    if (q === 'low' || q === 'medium' || q === 'high') this.state.settings.quality = q;

    this.stage = new Stage(canvas, { quality: this.state.settings.quality });
    this.arena = new ArenaView(this.stage);
    this.fx = new Fx(this.stage);
    this.overlay = new Overlay(overlayCanvas, this.stage);
    this.audio = new AudioEngine();
    this.audio.setEnabled({ sfx: this.state.settings.sfx, music: this.state.settings.music });

    this.ui = new UI(document.getElementById('ui-root'), {
      thumbs: {},
      state: this.state,
      on: {
        play: () => this.startMatch(),
        towerChange: (id) => {this.state.towerTroop=id;saveState(this.state);},
        ability: (id) => {if(this.battle.canPlayerAct())this.battle.world.activateAbility(0,id);},
        deckChange: (deck) => { this.state.deck = [...deck]; saveState(this.state); },
        difficultyChange: (d) => { this.state.difficulty = d; saveState(this.state); },
        settingsChange: (s) => this.applySettings(s),
        cardPointerDown: (i, ev) => this.input.onCardDown(i, ev),
        surrender: () => this.battle.surrender(),
        rematch: () => this.startMatch(),
        exitToMenu: () => this.toMenu(),
        sound: (name) => this.audio.play(name),
      },
    });

    this.battle = new Battle({
      stage: this.stage, arena: this.arena, fx: this.fx, overlay: this.overlay, audio: this.audio, ui: this.ui,
      onEnd: (result) => this.onBattleEnd(result),
    });
    this.input = new CardInput({
      stage: this.stage, arena: this.arena, ui: this.ui, audio: this.audio, battle: this.battle, canvas,
    });

    this.stage.setCameraMode('menu', true);
    this.ui.showMenu();
    this.onResize();
    const onResize = () => this.onResize();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);

    // Focus changes must never scroll the fixed game layers (older engines ignore overflow: clip).
    for (const el of [document.getElementById('app'), document.getElementById('ui-root')]) {
      el.addEventListener('scroll', () => { if (el.scrollTop || el.scrollLeft) el.scrollTo(0, 0); });
    }

    const unlock = () => {
      this.audio.unlock();
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);

    if (params.has('fps')) this.fpsEl = this.makeFpsReadout();

    this.time = 0;
    this.last = performance.now();
    this.failures = 0;
    this.frame = this.frame.bind(this);
    requestAnimationFrame(this.frame);

    bootMessage('Loading card portraits…');
    try {
      const thumbs = Object.fromEntries(CARDS.map(c => [c.id, cardArtUrl(c.id)]));
      await Promise.all(CARDS.map(c => new Promise(resolve => {
        const img = new Image();
        img.onload = resolve;
        img.onerror = () => { console.warn(`Card portrait failed: ${c.name}`); resolve(); };
        img.src = thumbs[c.id];
      })));
      this.ui.setThumbs(thumbs);
    } catch (err) {
      console.warn('Card portraits could not be loaded', err);
    }
    this.ui.hideBoot();
    this.audio.music('menu');
    if (params.has('autostart') || params.has('autoplay')) this.startMatch();
  }

  frame(now) {
    requestAnimationFrame(this.frame);
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (!(dt > 0)) return;
    if (dt > 0.1) dt = 0.1;          // tab was in the background: do not fast-forward
    this.time += dt;
    if (this.fpsEl) this.stage.renderer.info.reset();
    try {
      this.battle.update(dt, this.time);
      this.stage.update(dt, this.time);
      this.arena.update(dt, this.time);
      this.fx.update(dt, this.time);
      this.stage.render();
      this.overlay.draw(this.battle.world, this.battle.alpha, this.time);
      this.failures = 0;
    } catch (err) {
      if (this.failures++ === 0) console.error(err);
      if (this.failures === 30) window.__bootError?.('Something went wrong: ' + (err?.message || err));
    }
    if (this.fpsEl) this.updateFps(dt);
  }

  onResize() {
    this.stage.resize();
    this.overlay.resize();
    this.syncInsets();
  }

  syncInsets() {
    const inBattle = this.ui.screen === 'battle' || this.ui.screen === 'result';
    this.stage.setInsets(inBattle ? this.ui.getInsets() : { top: 0, bottom: 0 });
  }

  applySettings(settings) {
    const prev = this.state.settings;
    this.state.settings = { ...prev, ...settings };
    if (this.state.settings.quality !== prev.quality) {
      this.stage.setQuality(this.state.settings.quality);
      this.onResize();
    }
    this.audio.setEnabled({ sfx: this.state.settings.sfx, music: this.state.settings.music });
    saveState(this.state);
  }

  pickOpponent() {
    const forced = OPPONENTS.find((o) => o.id === params.get('opp'));
    if (forced) return forced;
    const pool = OPPONENTS.filter((o) => o.id !== this.lastOpponentId);
    const opponent = pool[Math.floor(Math.random() * pool.length)];
    this.lastOpponentId = opponent.id;
    return opponent;
  }

  startMatch() {
    clearTimeout(this.resultTimer);
    this.input.reset();
    const opponent = this.pickOpponent();
    const seed = Number(params.get('seed')) || ((Math.random() * 0x7fffffff) | 0) || 1;
    this.ui.showBattle({ playerName: 'You', enemyName: opponent.name, enemyTitle: opponent.title });
    this.battle.start({
      deck: this.state.deck, towerTroop: this.state.towerTroop, opponent, difficulty: this.state.difficulty, seed,
      autoplay: params.has('autoplay'), speed: Math.max(0.25, Number(params.get('speed')) || 1),
    });
    this.stage.setCameraMode('battle');
    this.syncInsets();
    requestAnimationFrame(() => this.syncInsets());   // once the HUD has been laid out
    this.audio.music('battle');
    if (this.state.firstRun) {
      this.ui.hint('Drag a card onto your half of the island');
      this.state.firstRun = false;
      saveState(this.state);
    }
  }

  onBattleEnd(result) {
    this.input.reset();
    const table = TROPHIES[this.state.difficulty] || TROPHIES.normal;
    let delta = 0;
    if (result.outcome === 'win') delta = table.win + result.stars[0] * 2;
    else if (result.outcome === 'lose') delta = table.lose;
    if (this.state.trophies + delta < 0) delta = -this.state.trophies;
    this.state.trophies += delta;
    const key = result.outcome === 'win' ? 'wins' : result.outcome === 'lose' ? 'losses' : 'draws';
    this.state.record[key]++;
    saveState(this.state);

    this.audio.music(null);
    this.audio.play(result.outcome === 'win' ? 'victory' : result.outcome === 'lose' ? 'defeat' : 'draw');
    clearTimeout(this.resultTimer);
    this.resultTimer = setTimeout(() => {
      this.ui.setState({ trophies: this.state.trophies });
      this.ui.showResult({
        outcome: result.outcome, stars: result.stars, trophiesDelta: delta, trophies: this.state.trophies,
        stats: result.stats, reason: result.reason,
      });
    }, result.surrendered ? 250 : 2600);
  }

  toMenu() {
    clearTimeout(this.resultTimer);
    this.input.reset();
    this.battle.cleanup();
    this.ui.showMenu();
    this.stage.setCameraMode('menu');
    this.syncInsets();
    this.audio.music('menu');
  }

  makeFpsReadout() {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:6px;bottom:6px;z-index:999;font:11px/1.2 monospace;color:#9f9;'
      + 'background:#000a;padding:3px 6px;border-radius:4px;pointer-events:none';
    document.body.appendChild(el);
    this.stage.renderer.info.autoReset = false;   // count every pass of the composer, reset per frame
    this.fpsAcc = 0; this.fpsN = 0; this.fpsWorst = 0;
    return el;
  }

  updateFps(dt) {
    this.fpsAcc += dt; this.fpsN++;
    if (dt > this.fpsWorst) this.fpsWorst = dt;
    if (this.fpsAcc >= 0.5) {
      const info = this.stage.renderer.info;
      this.fpsEl.textContent = `${(this.fpsN / this.fpsAcc).toFixed(0)} fps · worst ${(this.fpsWorst * 1000).toFixed(0)} ms`
        + ` · ${info.render.calls} calls · ${(info.render.triangles / 1000).toFixed(0)}k tris`;
      this.fpsAcc = 0; this.fpsN = 0; this.fpsWorst = 0;
    }
  }
}

async function main() {
  if (params.has('gallery')) {
    const { runGallery } = await import('./debug/gallery.js');
    await runGallery(params);
    return;
  }
  const game = new Game();
  window.__game = game;     // handy in the dev console
  await game.boot();
}

main().catch((err) => {
  console.error(err);
  const msg = /webgl/i.test(String(err?.message)) ? 'This device or browser cannot start WebGL.' : (err?.message || String(err));
  window.__bootError?.('Could not start: ' + msg);
});
