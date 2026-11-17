// The 3-D stage: renderer, lights, environment map, post-processing, cameras and picking.
// No animation loop of its own: call update(dt, time) then render() once per frame.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { fitBattle, menuDistance } from './env/camfit.js';
import { LIGHT, SKY, SUN_DIR } from './env/palette.js';

export const QUALITY_LEVELS = ['low', 'medium', 'high'];

const QUALITY = {
  low: { cap: 1.0, shadows: false, mapSize: 0, post: false },
  medium: { cap: 1.5, shadows: true, mapSize: 1024, post: false },
  high: { cap: 2.0, shadows: true, mapSize: 2048, post: true },
};

const EXPOSURE = 1.05;
const DEG = Math.PI / 180;
const BATTLE_FOV = 32;
const MENU_FOV = 40;
const MENU_ELEV = 52 * DEG;
const MENU_OFFSET = 0.07;       // fraction of the canvas height the island is lifted in menu mode
const MENU_PERIOD = 60;         // seconds per orbit
const TRANSITION = 1.2;
const INSET_PAD = 8;
const SHADOW_BOX = { x0: -13, x1: 13, y0: -0.7, y1: 7, z0: -19, z1: 19 };
const TWO_PI = Math.PI * 2;

function makePose() {
  return { lx: 0, ly: 0, lz: 0, dist: 60, elev: 0.9, azim: 0, fov: BATTLE_FOV, off: 0 };
}

function copyPose(o, p) {
  o.lx = p.lx; o.ly = p.ly; o.lz = p.lz; o.dist = p.dist; o.elev = p.elev; o.azim = p.azim; o.fov = p.fov; o.off = p.off;
  return o;
}

function wrapAngle(a) {
  a = (a + Math.PI) % TWO_PI;
  if (a < 0) a += TWO_PI;
  return a - Math.PI;
}

function easeInOut(k) {
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
}

function blendPose(o, a, b, k) {
  o.lx = a.lx + (b.lx - a.lx) * k;
  o.ly = a.ly + (b.ly - a.ly) * k;
  o.lz = a.lz + (b.lz - a.lz) * k;
  o.dist = Math.exp(Math.log(a.dist) + (Math.log(b.dist) - Math.log(a.dist)) * k);
  o.elev = a.elev + (b.elev - a.elev) * k;
  o.azim = a.azim + wrapAngle(b.azim - a.azim) * k;
  o.fov = a.fov + (b.fov - a.fov) * k;
  o.off = a.off + (b.off - a.off) * k;
  return o;
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** three.js' ACESFilmicToneMapping, in JS (used to match the fog to the tone-mapped sky). */
function acesTone(c, exposure) {
  const k = exposure / 0.6;
  const r = c.r * k, g = c.g * k, b = c.b * k;
  const ir = 0.59719 * r + 0.35458 * g + 0.04823 * b;
  const ig = 0.076 * r + 0.90834 * g + 0.01566 * b;
  const ib = 0.0284 * r + 0.13383 * g + 0.83777 * b;
  const fit = (v) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081);
  const fr = fit(ir), fg = fit(ig), fb = fit(ib);
  return c.setRGB(
    clamp01(1.60475 * fr - 0.53108 * fg - 0.07367 * fb),
    clamp01(-0.10208 * fr + 1.10813 * fg - 0.00605 * fb),
    clamp01(-0.00327 * fr - 0.07276 * fg + 1.07602 * fb),
  );
}

export class Stage {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    const renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, alpha: false, powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = EXPOSURE;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(SKY.horizon, 1);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(SKY.horizon);
    scene.fog = new THREE.Fog(SKY.horizon, 160, 520);
    this.scene = scene;

    this.camera = new THREE.PerspectiveCamera(BATTLE_FOV, 1, 1.5, 1500);
    this.camera.position.set(0, 50, 40);

    // ── lights ──
    this.sunDir = SUN_DIR.clone();
    const sun = new THREE.DirectionalLight(LIGHT.sun, LIGHT.sunIntensity);
    sun.name = 'stage-sun';
    sun.position.copy(SUN_DIR).multiplyScalar(40);
    sun.target.position.set(0, 0, 0);
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.02;
    scene.add(sun, sun.target);
    this.sun = sun;
    this._fitShadowCamera();

    const hemi = new THREE.HemisphereLight(LIGHT.hemiSky, LIGHT.hemiGround, LIGHT.hemiIntensity);
    hemi.position.set(0, 1, 0);
    scene.add(hemi);
    this.hemi = hemi;

    const fill = new THREE.DirectionalLight(LIGHT.fill, LIGHT.fillIntensity);
    fill.name = 'stage-fill';
    fill.position.set(-SUN_DIR.x, 0.45, -SUN_DIR.z).normalize().multiplyScalar(40);
    fill.castShadow = false;
    scene.add(fill, fill.target);
    this.fill = fill;

    this.envRT = null;
    try { this._buildEnvironment(); } catch (err) { console.warn('[stage] environment map unavailable', err); }

    // ── state ──
    this.width = 1;
    this.height = 1;
    this.pixelRatio = 1;
    this.insets = { top: 0, bottom: 0 };
    this.mode = 'menu';
    this.composer = null;
    this.bloom = null;
    this.contextLost = false;
    this.quality = 'high';

    this._battlePose = makePose();
    this._menuPose = makePose();
    this._cur = makePose();
    this._from = makePose();
    this._trT = TRANSITION;
    this._menuAzim = 0.35;
    this._fit = {};
    this._look = new THREE.Vector3();
    this._v = new THREE.Vector3();
    this._w = new THREE.Vector3();

    this._shakeAmp = 0;
    this._shakeDecay = 0;
    this._shakeTime = 0;

    this.dynScale = 1;
    this._ft = 16.7;
    this._slowT = 0;
    this._fastT = 0;
    this._dynCooldown = 1.5;
    this._clock = 0;
    this._lastUpAt = -1e9;
    this._upBlockedUntil = 0;

    this._onLost = (e) => { e.preventDefault(); this.contextLost = true; };
    this._onRestored = () => {
      this.contextLost = false;
      try { this._buildEnvironment(); } catch (err) { console.warn('[stage] environment rebuild failed', err); }
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
      this.resize();
    };
    canvas.addEventListener('webglcontextlost', this._onLost, false);
    canvas.addEventListener('webglcontextrestored', this._onRestored, false);

    this.setQuality(opts.quality || 'high');
    this.setCameraMode('menu', true);
  }

  // ───────────────────────────── quality ─────────────────────────────

  setQuality(q) {
    if (!QUALITY[q]) q = 'high';
    this.quality = q;
    const Q = QUALITY[q];
    const sun = this.sun;
    sun.castShadow = Q.shadows;
    if (Q.shadows && sun.shadow.mapSize.x !== Q.mapSize) {
      sun.shadow.mapSize.set(Q.mapSize, Q.mapSize);
      sun.shadow.normalBias = Q.mapSize >= 2048 ? 0.02 : 0.035;
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    }
    if (Q.post && !this.composer) this._buildComposer();
    else if (!Q.post && this.composer) this._disposeComposer();
    this.dynScale = 1;
    this._slowT = 0;
    this._fastT = 0;
    this._dynCooldown = 1.5;
    this._upBlockedUntil = 0;
    this._applyFog();
    this.resize();
  }

  _buildComposer() {
    try {
      const ext = this.renderer.extensions;
      if (!ext.has('EXT_color_buffer_float') && !ext.has('EXT_color_buffer_half_float')) {
        throw new Error('float colour buffers not supported');
      }
      const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: 4 });
      rt.texture.name = 'stage.rt';
      const composer = new EffectComposer(this.renderer, rt);
      composer.addPass(new RenderPass(this.scene, this.camera));
      const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.4, 0.6, 0.92);
      composer.addPass(bloom);
      composer.addPass(new OutputPass());
      this.composer = composer;
      this.bloom = bloom;
    } catch (err) {
      console.warn('[stage] post-processing unavailable, rendering directly:', err?.message || err);
      this.composer = null;
      this.bloom = null;
    }
  }

  _disposeComposer() {
    const c = this.composer;
    this.composer = null;
    this.bloom = null;
    if (!c) return;
    try {
      for (const p of c.passes) p.dispose?.();
      c.dispose();
    } catch (err) {
      console.warn('[stage] composer dispose failed', err);
    }
  }

  _applyFog() {
    const fog = this.scene.fog;
    if (!fog) return;
    fog.color.setHex(SKY.horizon);
    // Fog is mixed after tone mapping when drawing straight to the canvas, but before it when
    // drawing through the composer; pre-tone-map the colour in the direct case so the fog
    // always melts into the sky dome.
    if (!this.composer) acesTone(fog.color, EXPOSURE);
  }

  _buildEnvironment() {
    if (this.envRT) { this.envRT.dispose(); this.envRT = null; }
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    const geo = new THREE.SphereGeometry(10, 48, 24);
    const pos = geo.attributes.position;
    const cols = new Float32Array(pos.count * 3);
    const zen = new THREE.Color(SKY.zenith);
    const mid = new THREE.Color(SKY.mid);
    const hor = new THREE.Color(SKY.horizon);
    const ground = new THREE.Color(0x7d8a62);
    const sunC = new THREE.Color(SKY.sun);
    const c = new THREE.Color();
    const sm = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) / 10, y = pos.getY(i) / 10, z = pos.getZ(i) / 10;
      if (y >= 0) {
        c.copy(hor).lerp(mid, sm(0, 0.3, y)).lerp(zen, sm(0.25, 0.9, y));
      } else {
        c.copy(hor).lerp(ground, sm(0, 0.35, -y));
      }
      const s = Math.max(0, x * SUN_DIR.x + y * SUN_DIR.y + z * SUN_DIR.z);
      const k = Math.pow(s, 32) * 6 + Math.pow(s, 4) * 0.35;
      cols[i * 3] = c.r + sunC.r * k;
      cols[i * 3 + 1] = c.g + sunC.g * k;
      cols[i * 3 + 2] = c.b + sunC.b * k;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide });
    envScene.add(new THREE.Mesh(geo, mat));
    try {
      this.envRT = pmrem.fromScene(envScene, 0.02);
      this.scene.environment = this.envRT.texture;
      this.scene.environmentIntensity = LIGHT.envIntensity;
    } finally {
      geo.dispose();
      mat.dispose();
      pmrem.dispose();
    }
  }

  _fitShadowCamera() {
    const sun = this.sun;
    const cam = sun.shadow.camera;
    cam.position.copy(sun.position);
    cam.lookAt(sun.target.position);
    cam.updateMatrixWorld(true);
    const inv = cam.matrixWorldInverse;
    const v = new THREE.Vector3();
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    const B = SHADOW_BOX;
    for (let i = 0; i < 8; i++) {
      v.set(i & 1 ? B.x1 : B.x0, i & 2 ? B.y1 : B.y0, i & 4 ? B.z1 : B.z0).applyMatrix4(inv);
      x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x);
      y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
      z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z);
    }
    cam.left = x0 - 0.25;
    cam.right = x1 + 0.25;
    cam.bottom = y0 - 0.25;
    cam.top = y1 + 0.25;
    cam.near = Math.max(0.1, -z1 - 1);
    cam.far = -z0 + 1;
    cam.updateProjectionMatrix();
  }

  // ───────────────────────────── layout ─────────────────────────────

  resize() {
    const w = Math.max(1, Math.round(this.canvas.clientWidth || this.canvas.width || 1));
    const h = Math.max(1, Math.round(this.canvas.clientHeight || this.canvas.height || 1));
    this.width = w;
    this.height = h;
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    const cap = QUALITY[this.quality].cap;
    const pr = Math.max(0.5, Math.min(dpr, cap) * this.dynScale);
    this.pixelRatio = pr;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    if (this.composer) {
      this.composer.setPixelRatio(pr);
      this.composer.setSize(w, h);
    }
    this.camera.aspect = w / h;
    this._layoutCameras();
    this._applyCamera();
  }

  setInsets(insets) {
    const top = Math.max(0, Number(insets?.top) || 0);
    const bottom = Math.max(0, Number(insets?.bottom) || 0);
    if (top === this.insets.top && bottom === this.insets.bottom) return;
    this.insets.top = top;
    this.insets.bottom = bottom;
    this._layoutCameras();
  }

  _layoutCameras() {
    const W = this.width;
    const H = this.height;
    const f = fitBattle({
      width: W, height: H, top: this.insets.top, bottom: this.insets.bottom,
      pad: INSET_PAD, fovDeg: BATTLE_FOV, out: this._fit,
    });
    const b = this._battlePose;
    b.lx = 0; b.ly = 0; b.lz = 0;
    b.dist = f.dist;
    b.elev = f.elev;
    b.azim = 0;
    b.fov = BATTLE_FOV;
    b.off = f.offsetY / H;

    const m = this._menuPose;
    m.lx = 0; m.ly = -2; m.lz = 0;
    m.dist = menuDistance(W, H, MENU_FOV, 17);
    m.elev = MENU_ELEV;
    m.fov = MENU_FOV;
    m.off = MENU_OFFSET;
  }

  // ───────────────────────────── camera ─────────────────────────────

  setCameraMode(mode, immediate = false) {
    if (mode !== 'menu' && mode !== 'battle') return;
    if (mode === this.mode && !immediate) return;
    if (mode === 'menu' && this.mode !== 'menu') this._menuAzim = wrapAngle(this._cur.azim);
    copyPose(this._from, this._cur);
    this.mode = mode;
    this._trT = immediate ? TRANSITION : 0;
    this._applyCamera();
  }

  update(dt, time) {
    if (!(dt > 0) || !Number.isFinite(dt)) dt = 0;
    if (dt > 0.25) dt = 0.25;
    this._dynamicResolution(dt);
    this._menuAzim = Math.sin(time * .08) * .12;
    if (this._trT < TRANSITION) this._trT = Math.min(TRANSITION, this._trT + dt);
    if (this._shakeAmp > 0) this._shakeAmp = Math.max(0, this._shakeAmp - this._shakeDecay * dt);
    this._shakeTime += dt;
    this._applyCamera();
  }

  _applyCamera() {
    const target = this.mode === 'battle' ? this._battlePose : this._menuPose;
    if (target === this._menuPose) target.azim = this._menuAzim;
    let pose = target;
    if (this._trT < TRANSITION) {
      pose = blendPose(this._cur, this._from, target, easeInOut(this._trT / TRANSITION));
    } else {
      pose = copyPose(this._cur, target);
    }

    const cam = this.camera;
    const ce = Math.cos(pose.elev);
    const se = Math.sin(pose.elev);
    cam.position.set(
      pose.lx + pose.dist * ce * Math.sin(pose.azim),
      pose.ly + pose.dist * se,
      pose.lz + pose.dist * ce * Math.cos(pose.azim),
    );
    this._look.set(pose.lx, pose.ly, pose.lz);
    cam.lookAt(this._look);

    if (this._shakeAmp > 0) {
      // translation-only noise on top of the base pose: recomputed every frame, so no drift
      const s = this._shakeAmp * 0.55;
      const t = this._shakeTime;
      cam.position.x += s * (Math.sin(t * 37.1) * 0.6 + Math.sin(t * 23.3 + 1.3) * 0.4);
      cam.position.y += s * 0.5 * (Math.sin(t * 31.7 + 2.1) * 0.6 + Math.sin(t * 19.9 + 0.4) * 0.4);
      cam.position.z += s * (Math.sin(t * 29.3 + 4.2) * 0.6 + Math.sin(t * 41.9 + 2.7) * 0.4);
    }

    cam.fov = pose.fov;
    const W = this.width;
    const H = this.height;
    cam.aspect = W / H;
    cam.setViewOffset(W, H, 0, pose.off * H, W, H);   // also updates the projection matrix
    cam.updateMatrixWorld();
  }

  shake(strength = 0.3, duration = 0.35) {
    const s = Number(strength);
    if (!(s > 0) || !Number.isFinite(s)) return;
    const d = Number(duration);
    const dur = d > 0.02 && Number.isFinite(d) ? d : 0.35;
    const remaining = this._shakeDecay > 0 ? this._shakeAmp / this._shakeDecay : 0;
    this._shakeAmp = Math.min(1.5, this._shakeAmp + s);
    this._shakeDecay = this._shakeAmp / Math.max(dur, remaining);
  }

  // ───────────────────────────── dynamic resolution ─────────────────────────────

  _dynamicResolution(dt) {
    if (dt <= 0) return;
    this._clock += dt;
    this._ft += (dt * 1000 - this._ft) * Math.min(1, dt * 4);
    if (this._dynCooldown > 0) { this._dynCooldown -= dt; return; }
    if (this._ft > 22) { this._slowT += dt; this._fastT = 0; }
    else if (this._ft < 13) { this._fastT += dt; this._slowT = 0; }
    else { this._slowT = 0; this._fastT = 0; }
    const minScale = 0.6;
    if (this._slowT > 2 && this.dynScale > minScale + 1e-3) {
      this.dynScale = Math.max(minScale, this.dynScale - 0.15);
      // stepped up recently and it is slow again: hold the lower resolution for a while
      if (this._clock - this._lastUpAt < 8) this._upBlockedUntil = this._clock + 30;
      this._afterDynChange();
    } else if (this._fastT > 4 && this.dynScale < 1 - 1e-3 && this._clock >= this._upBlockedUntil) {
      this.dynScale = Math.min(1, this.dynScale + 0.15);
      this._lastUpAt = this._clock;
      this._afterDynChange();
    }
  }

  _afterDynChange() {
    this._slowT = 0;
    this._fastT = 0;
    this._dynCooldown = 1;
    this.resize();
  }

  // ───────────────────────────── drawing / picking ─────────────────────────────

  render() {
    if (this.contextLost) return;
    if (this.composer) {
      try {
        this.composer.render();
        return;
      } catch (err) {
        console.warn('[stage] post-processing failed, falling back to direct rendering', err);
        this._disposeComposer();
        this._applyFog();
      }
    }
    this.renderer.render(this.scene, this.camera);
  }

  screenToGround(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -((clientY - rect.top) / rect.height) * 2 + 1;
    if (!Number.isFinite(nx) || !Number.isFinite(ny)) return null;
    const cam = this.camera;
    const o = cam.position;
    const p = this._v.set(nx, ny, 0.5).unproject(cam);
    const dx = p.x - o.x;
    const dy = p.y - o.y;
    const dz = p.z - o.z;
    if (dy > -1e-6) return null;
    const t = -o.y / dy;
    if (!(t > 0) || !Number.isFinite(t)) return null;
    return { x: o.x + dx * t, z: o.z + dz * t };
  }

  worldToScreen(x, y, z, out = {}) {
    const cam = this.camera;
    const v = this._w.set(x, y, z).applyMatrix4(cam.matrixWorldInverse);
    out.behind = v.z >= -1e-4;
    v.applyMatrix4(cam.projectionMatrix);
    out.x = (v.x + 1) * 0.5 * this.width;
    out.y = (1 - v.y) * 0.5 * this.height;
    return out;
  }

  dispose() {
    this.canvas.removeEventListener('webglcontextlost', this._onLost, false);
    this.canvas.removeEventListener('webglcontextrestored', this._onRestored, false);
    this._disposeComposer();
    if (this.envRT) { this.envRT.dispose(); this.envRT = null; }
    this.scene.environment = null;
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    this.renderer.dispose();
  }
}
