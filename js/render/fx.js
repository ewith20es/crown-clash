// Aether Spires — battle effects: particles, projectiles, impacts, beams, lightning, spell
// telegraphs and zones, status looks (frozen / stunned / slowed / hasted / charged) and debris.
//
// Everything is pooled and instanced. Draw calls: glow particles, smoke particles, additive
// decals, blended decals, light segments (beams + lightning), rock solids, gem solids, ice.
// Nothing allocates per frame after construction.
//
// Contract (driven by js/game/battle.js):
//   handleEvents(events, world)  every simulation event drained this frame
//   sync(world, alpha, time)     mirror the live world (projectiles, zones, rollers, pending, beams,
//                                statuses) with alpha interpolation
//   update(dt, time)             advance particles and upload instance buffers
//   reset()                      clear everything between matches
import * as THREE from 'three';
import { TEAMS, UNIT_VISUAL_SCALE, towerPosition, teamSign } from '../config.js';

const GLOW_CAP = 2200;
const SMOKE_CAP = 800;
const HEAD_CAP = 500;          // per-frame sprites (projectile heads, stun stars) share the glow mesh
const DECAL_CAP = 200;
const SEG_CAP = 360;
const ROCK_CAP = 180;
const GEM_CAP = 200;
const ICE_CAP = 40;

const TAU = Math.PI * 2;
const GROUND = 0.12;           // decals sit above the arena's own ground decals

const DECAL_KEYS = ['x', 'y', 'z', 'r0', 'r1', 'life', 'max', 'r', 'g', 'b', 'a', 'kind', 'th', 'spin', 'spinV', 'fill', 'mix', 'fadeIn'];
const SEG_KEYS = ['ax', 'ay', 'az', 'bx', 'by', 'bz', 'w', 'r', 'g', 'b', 'life', 'max'];
const SOLID_KEYS = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'rx', 'ry', 'rz', 'wx', 'wy', 'wz', 'sx', 'sy', 'sz', 'r', 'g', 'b', 'life', 'max', 'grav'];

// Decal kinds (shader branch)
const D_RING = 0, D_DISC = 1, D_DASH = 2, D_SWIRL = 3, D_SPLAT = 4;

function rgb(hex, k = 1) {
  const c = new THREE.Color(hex);
  return [c.r * k, c.g * k, c.b * k];
}

const TEAM_GLOW = TEAMS.map((t) => rgb(t.glow, 1.7));
const TEAM_MAIN = TEAMS.map((t) => rgb(t.main, 1.3));
const TEAM_LIGHT = TEAMS.map((t) => rgb(t.light, 1.5));

const COL = {
  white: rgb(0xffffff, 2.2),
  warm: rgb(0xffd27a, 2.0),
  fire: rgb(0xff7a2a, 2.4),
  fireCore: rgb(0xffe2a0, 2.6),
  ember: rgb(0xff5a1e, 1.8),
  cyan: rgb(0x7ff2ff, 2.2),
  electric: rgb(0xb6f4ff, 2.6),
  yellow: rgb(0xfff27a, 2.4),
  violet: rgb(0xc69bff, 2.2),
  ice: rgb(0xc8f2ff, 2.0),
  iceDeep: rgb(0x6fc8ff, 1.6),
  heal: rgb(0x8dff9a, 2.0),
  gold: rgb(0xffc94a, 2.2),
  pink: rgb(0xff9ec8, 2.0),
  spore: rgb(0x9be05a, 1.6),
  sporeDark: rgb(0x6a3a8a, 1.0),
  teal: rgb(0x7fe8d8, 1.8),
  aether: rgb(0x8ff0ff, 2.4),
  // blended (non-additive) colours
  dust: rgb(0xc9b28a),
  dustDark: rgb(0x8a7558),
  smoke: rgb(0x55505a),
  smokeLight: rgb(0xb8b2b8),
  steam: rgb(0xe8eef4),
  mud: rgb(0x6b4a2c),
  scorch: rgb(0x1c1612),
  mist: rgb(0xd6f1ff),
  sporeCloud: rgb(0x6f8f3a),
  rock: rgb(0x9a8a74),
  rockDark: rgb(0x6c5f50),
  stone: rgb(0xd6c29a),
  metal: rgb(0x8c8c96),
  podGreen: rgb(0x6fbf4a),
};

// ───────────────────────────── shaders ─────────────────────────────

const SPRITE_VERT = /* glsl */`
attribute vec3 iPos;
attribute vec4 iCol;
attribute vec2 iSz;
varying vec2 vUv;
varying vec4 vCol;
varying float vSeed;
void main() {
  vUv = position.xy;
  vCol = iCol;
  vSeed = iSz.y;
  vec4 mv = viewMatrix * vec4(iPos, 1.0);
  mv.xy += position.xy * iSz.x;
  gl_Position = projectionMatrix * mv;
}`;

const GLOW_FRAG = /* glsl */`
varying vec2 vUv;
varying vec4 vCol;
varying float vSeed;
void main() {
  float r2 = dot(vUv, vUv);
  if (r2 > 1.0) discard;
  float f = 1.0 - r2;
  f *= f;
  float core = smoothstep(0.22, 0.0, r2);
  gl_FragColor = vec4(vCol.rgb * (f + core * 0.8), vCol.a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const SMOKE_FRAG = /* glsl */`
varying vec2 vUv;
varying vec4 vCol;
varying float vSeed;
void main() {
  float r2 = dot(vUv, vUv);
  if (r2 > 1.0) discard;
  float f = smoothstep(1.0, 0.05, r2);
  float n = 0.82 + 0.18 * sin(vUv.x * 6.0 + vSeed * 13.0) * sin(vUv.y * 5.0 - vSeed * 7.0);
  float shade = 0.82 + 0.18 * (vUv.y * 0.5 + 0.5);
  gl_FragColor = vec4(vCol.rgb * shade, vCol.a * f * n);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const DECAL_VERT = /* glsl */`
attribute vec4 iPosR;
attribute vec4 iCol;
attribute vec4 iPar;
varying vec2 vUv;
varying vec4 vCol;
varying vec4 vPar;
void main() {
  vUv = position.xz;
  vCol = iCol;
  vPar = iPar;
  vec3 wp = vec3(iPosR.x + position.x * iPosR.w, iPosR.y, iPosR.z + position.z * iPosR.w);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;

const DECAL_FRAG = /* glsl */`
varying vec2 vUv;
varying vec4 vCol;
varying vec4 vPar;   // kind, thickness, spin (turns), inner fill
void main() {
  float d = length(vUv);
  if (d > 1.0) discard;
  float kind = vPar.x;
  float th = max(vPar.y, 0.01);
  float ring = 1.0 - smoothstep(0.0, th, abs(d - (1.0 - th)));
  float a = 0.0;
  if (kind < 0.5) {
    a = ring + vPar.w * (1.0 - d * d) * 0.6;
  } else if (kind < 1.5) {
    a = 1.0 - d * d;
    a *= a;
  } else if (kind < 2.5) {
    float ang = atan(vUv.y, vUv.x) / 6.2831853 + vPar.z;
    a = ring * step(0.42, fract(ang * 22.0)) + vPar.w * (1.0 - d) * 0.45;
  } else if (kind < 3.5) {
    float ang = atan(vUv.y, vUv.x);
    float s = sin(ang * 3.0 + d * 9.0 - vPar.z * 6.2831853);
    a = smoothstep(0.15, 1.0, s) * (1.0 - d) * smoothstep(0.0, 0.3, d) + ring * 0.7;
  } else {
    float ang = atan(vUv.y, vUv.x);
    float edge = 0.78 + 0.1 * sin(ang * 7.0 + vPar.z * 20.0) + 0.07 * sin(ang * 13.0 - vPar.z * 9.0);
    a = 1.0 - smoothstep(edge - 0.3, edge, d);
  }
  gl_FragColor = vec4(vCol.rgb, vCol.a * clamp(a, 0.0, 1.0));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ───────────────────────────── particle pool ─────────────────────────────

class ParticlePool {
  constructor(cap) {
    this.cap = cap;
    this.n = 0;
    this.cursor = 0;
    const f = () => new Float32Array(cap);
    this.x = f(); this.y = f(); this.z = f();
    this.vx = f(); this.vy = f(); this.vz = f();
    this.life = f(); this.max = f();
    this.s0 = f(); this.s1 = f();
    this.r = f(); this.g = f(); this.b = f(); this.a = f();
    this.grav = f(); this.drag = f(); this.seed = f();
    this.arrs = [this.x, this.y, this.z, this.vx, this.vy, this.vz, this.life, this.max, this.s0, this.s1,
      this.r, this.g, this.b, this.a, this.grav, this.drag, this.seed];
  }

  add(x, y, z, vx, vy, vz, life, s0, s1, c, a, grav, drag) {
    let i;
    if (this.n < this.cap) i = this.n++;
    else { i = this.cursor; this.cursor = (this.cursor + 1) % this.cap; }
    this.x[i] = x; this.y[i] = y; this.z[i] = z;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.life[i] = 0; this.max[i] = life > 0.01 ? life : 0.01;
    this.s0[i] = s0; this.s1[i] = s1;
    this.r[i] = c[0]; this.g[i] = c[1]; this.b[i] = c[2]; this.a[i] = a;
    this.grav[i] = grav; this.drag[i] = drag; this.seed[i] = Math.random() * 10;
  }

  step(dt) {
    let i = 0;
    while (i < this.n) {
      this.life[i] += dt;
      if (this.life[i] >= this.max[i]) {
        this.n--;
        if (i !== this.n) this.move(this.n, i);
        continue;
      }
      const k = Math.max(0, 1 - this.drag[i] * dt);
      this.vx[i] *= k; this.vz[i] *= k;
      this.vy[i] = this.vy[i] * k - this.grav[i] * dt;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      this.z[i] += this.vz[i] * dt;
      if (this.y[i] < 0.05 && this.grav[i] > 0) { this.y[i] = 0.05; this.vy[i] *= -0.3; this.vx[i] *= 0.6; this.vz[i] *= 0.6; }
      i++;
    }
    if (this.cursor >= this.n) this.cursor = 0;
  }

  move(from, to) {
    const arrs = this.arrs;
    for (let k = 0; k < arrs.length; k++) arrs[k][to] = arrs[k][from];
  }

  clear() { this.n = 0; this.cursor = 0; }
}

function spriteMesh(cap, frag, blending) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const mk = (n) => {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * n), n);
    a.setUsage(THREE.DynamicDrawUsage);
    return a;
  };
  g.setAttribute('iPos', mk(3));
  g.setAttribute('iCol', mk(4));
  g.setAttribute('iSz', mk(2));
  g.instanceCount = 0;
  const m = new THREE.ShaderMaterial({
    vertexShader: SPRITE_VERT, fragmentShader: frag,
    transparent: true, depthWrite: false, blending,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  return mesh;
}

function decalMesh(cap, blending) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1]), 3));
  g.setIndex([0, 2, 1, 0, 3, 2]);
  const mk = (n) => {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * n), n);
    a.setUsage(THREE.DynamicDrawUsage);
    return a;
  };
  g.setAttribute('iPosR', mk(4));
  g.setAttribute('iCol', mk(4));
  g.setAttribute('iPar', mk(4));
  g.instanceCount = 0;
  const m = new THREE.ShaderMaterial({
    vertexShader: DECAL_VERT, fragmentShader: DECAL_FRAG,
    transparent: true, depthWrite: false, blending, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  return mesh;
}

function instanced(geo, mat, cap) {
  const mesh = new THREE.InstancedMesh(geo, mat, cap);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  mesh.frustumCulled = false;
  return mesh;
}

function upload(attr, n) {
  attr.clearUpdateRanges();
  attr.addUpdateRange(0, Math.max(1, n) * attr.itemSize);
  attr.needsUpdate = true;
}

// scratch
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _d = new THREE.Vector3();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const JAG = new Float32Array(3 * 16);

function rand(a, b) { return a + Math.random() * (b - a); }

export class Fx {
  constructor(stage) {
    this.stage = stage;
    this.root = new THREE.Group();
    this.root.name = 'fx';
    stage.scene.add(this.root);

    this.glowP = new ParticlePool(GLOW_CAP);
    this.smokeP = new ParticlePool(SMOKE_CAP);
    this.glowMesh = spriteMesh(GLOW_CAP + HEAD_CAP, GLOW_FRAG, THREE.AdditiveBlending);
    this.smokeMesh = spriteMesh(SMOKE_CAP, SMOKE_FRAG, THREE.NormalBlending);
    this.glowMesh.renderOrder = 6;
    this.smokeMesh.renderOrder = 5;

    // per-frame head sprites (written in sync, drawn until the next sync)
    this.hN = 0;
    this.hx = new Float32Array(HEAD_CAP); this.hy = new Float32Array(HEAD_CAP); this.hz = new Float32Array(HEAD_CAP);
    this.hs = new Float32Array(HEAD_CAP); this.hc = new Float32Array(HEAD_CAP * 4);

    // decals: timed (from events) + per-frame (from sync), two blend modes
    this.decalAdd = decalMesh(DECAL_CAP, THREE.AdditiveBlending);
    this.decalMix = decalMesh(DECAL_CAP / 2, THREE.NormalBlending);
    this.decalMix.renderOrder = 2;
    this.dT = this.makeDecalStore(DECAL_CAP);
    this.dF = this.makeDecalStore(DECAL_CAP);

    // light segments: beams, lightning, slash streaks
    const segGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
    segGeo.translate(0, 0.5, 0);
    this.segMesh = instanced(segGeo, new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }), SEG_CAP);
    this.segMesh.renderOrder = 7;
    this.sT = this.makeSegStore(SEG_CAP);
    this.sF = this.makeSegStore(SEG_CAP);

    // solids: rock-like (debris, mud bombs, shells, boulders) and gem-like (shards, glowing crystals)
    const rockGeo = new THREE.IcosahedronGeometry(1, 0);
    this.rockMesh = instanced(rockGeo, new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.85, metalness: 0.05 }), ROCK_CAP);
    this.rockMesh.castShadow = true;
    const gemGeo = new THREE.OctahedronGeometry(1, 0);
    gemGeo.scale(0.6, 1.25, 0.6);
    this.gemMesh = instanced(gemGeo, new THREE.MeshBasicMaterial({ toneMapped: false }), GEM_CAP);
    this.rT = this.makeSolidStore(ROCK_CAP);
    this.rF = this.makeSolidStore(ROCK_CAP);
    this.gT = this.makeSolidStore(GEM_CAP);
    this.gF = this.makeSolidStore(GEM_CAP);

    // ice shells on frozen entities
    const iceGeo = new THREE.IcosahedronGeometry(1, 1);
    this.iceMesh = instanced(iceGeo, new THREE.MeshStandardMaterial({
      color: 0xd8f4ff, emissive: 0x3a7fb0, emissiveIntensity: 0.55, roughness: 0.08, metalness: 0.1,
      transparent: true, opacity: 0.55, depthWrite: false, flatShading: true,
    }), ICE_CAP);
    this.iceMesh.renderOrder = 4;
    this.iceN = 0;

    this.root.add(this.decalMix, this.decalAdd, this.smokeMesh, this.rockMesh, this.gemMesh, this.iceMesh,
      this.segMesh, this.glowMesh);

    this.time = 0;
    this.lastSync = -1;
    this.q = 1;
  }

  // ───────────────────────────── stores ─────────────────────────────

  makeDecalStore(cap) {
    const f = () => new Float32Array(cap);
    return {
      cap, n: 0, x: f(), y: f(), z: f(), r0: f(), r1: f(), life: f(), max: f(),
      r: f(), g: f(), b: f(), a: f(), kind: f(), th: f(), spin: f(), spinV: f(), fill: f(), mix: new Uint8Array(cap),
      fadeIn: f(),
    };
  }

  makeSegStore(cap) {
    const f = () => new Float32Array(cap);
    return { cap, n: 0, ax: f(), ay: f(), az: f(), bx: f(), by: f(), bz: f(), w: f(), r: f(), g: f(), b: f(), life: f(), max: f() };
  }

  makeSolidStore(cap) {
    const f = () => new Float32Array(cap);
    return {
      cap, n: 0, x: f(), y: f(), z: f(), vx: f(), vy: f(), vz: f(), rx: f(), ry: f(), rz: f(), wx: f(), wy: f(), wz: f(),
      sx: f(), sy: f(), sz: f(), r: f(), g: f(), b: f(), life: f(), max: f(), grav: f(),
    };
  }

  // ───────────────────────────── primitives ─────────────────────────────

  glow(x, y, z, vx, vy, vz, life, s0, s1, c, a = 1, grav = 0, drag = 0) {
    this.glowP.add(x, y, z, vx, vy, vz, life, s0, s1, c, a, grav, drag);
  }

  smoke(x, y, z, vx, vy, vz, life, s0, s1, c, a = 0.7, grav = 0, drag = 1.5) {
    this.smokeP.add(x, y, z, vx, vy, vz, life, s0, s1, c, a, grav, drag);
  }

  head(x, y, z, size, c, a = 1) {
    const i = this.hN;
    if (i >= HEAD_CAP) return;
    this.hN++;
    this.hx[i] = x; this.hy[i] = y; this.hz[i] = z; this.hs[i] = size;
    this.hc[i * 4] = c[0]; this.hc[i * 4 + 1] = c[1]; this.hc[i * 4 + 2] = c[2]; this.hc[i * 4 + 3] = a;
  }

  decal(store, x, z, r0, r1, life, c, a, kind, th = 0.1, fill = 0, spin = 0, spinV = 0, mixBlend = 0, y = GROUND, fadeIn = 0) {
    let i = store.n;
    if (i >= store.cap) {
      if (store === this.dF) return;
      i = (Math.random() * store.cap) | 0;          // timed store full: replace a random one
    } else store.n++;
    store.x[i] = x; store.y[i] = y; store.z[i] = z; store.r0[i] = r0; store.r1[i] = r1;
    store.life[i] = 0; store.max[i] = life; store.r[i] = c[0]; store.g[i] = c[1]; store.b[i] = c[2]; store.a[i] = a;
    store.kind[i] = kind; store.th[i] = th; store.fill[i] = fill; store.spin[i] = spin; store.spinV[i] = spinV;
    store.mix[i] = mixBlend; store.fadeIn[i] = fadeIn;
  }

  seg(store, ax, ay, az, bx, by, bz, w, c, k, life = 0) {
    let i = store.n;
    if (i >= store.cap) return;
    store.n++;
    store.ax[i] = ax; store.ay[i] = ay; store.az[i] = az; store.bx[i] = bx; store.by[i] = by; store.bz[i] = bz;
    store.w[i] = w; store.r[i] = c[0] * k; store.g[i] = c[1] * k; store.b[i] = c[2] * k;
    store.life[i] = 0; store.max[i] = life;
  }

  solid(store, x, y, z, vx, vy, vz, sx, sy, sz, c, life, grav = 0, spin = 0) {
    let i = store.n;
    if (i >= store.cap) {
      if (store === this.rF || store === this.gF) return;
      i = (Math.random() * store.cap) | 0;
    } else store.n++;
    store.x[i] = x; store.y[i] = y; store.z[i] = z; store.vx[i] = vx; store.vy[i] = vy; store.vz[i] = vz;
    store.rx[i] = Math.random() * TAU; store.ry[i] = Math.random() * TAU; store.rz[i] = Math.random() * TAU;
    store.wx[i] = rand(-spin, spin); store.wy[i] = rand(-spin, spin); store.wz[i] = rand(-spin, spin);
    store.sx[i] = sx; store.sy[i] = sy; store.sz[i] = sz;
    store.r[i] = c[0]; store.g[i] = c[1]; store.b[i] = c[2];
    store.life[i] = 0; store.max[i] = life; store.grav[i] = grav;
    return i;
  }

  /** A solid drawn this frame only, with an explicit orientation. */
  frameSolid(store, x, y, z, rx, ry, rz, sx, sy, sz, c) {
    const i = this.solid(store, x, y, z, 0, 0, 0, sx, sy, sz, c, 0, 0, 0);
    if (i === undefined) return;
    store.rx[i] = rx; store.ry[i] = ry; store.rz[i] = rz;
  }

  /** Jagged lightning from a to b, made of `n` light segments (timed when life > 0). */
  bolt(store, ax, ay, az, bx, by, bz, n, jitter, w, c, k, life) {
    n = Math.min(15, Math.max(1, n));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const j = i === 0 || i === n ? 0 : jitter * Math.sin(t * Math.PI);
      JAG[i * 3] = ax + (bx - ax) * t + rand(-j, j);
      JAG[i * 3 + 1] = ay + (by - ay) * t + rand(-j, j) * 0.6;
      JAG[i * 3 + 2] = az + (bz - az) * t + rand(-j, j);
    }
    for (let i = 0; i < n; i++) {
      const o = i * 3;
      this.seg(store, JAG[o], JAG[o + 1], JAG[o + 2], JAG[o + 3], JAG[o + 4], JAG[o + 5], w * 2.6, c, k * 0.35, life);
      this.seg(store, JAG[o], JAG[o + 1], JAG[o + 2], JAG[o + 3], JAG[o + 4], JAG[o + 5], w, COL.white, k * 0.6, life);
    }
  }

  // ───────────────────────────── composite effects ─────────────────────────────

  burst(x, y, z, n, speed, up, life, size, c, grav = 0, drag = 2) {
    n = Math.max(1, Math.round(n * this.q));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const s = speed * rand(0.4, 1);
      this.glow(x, y, z, Math.cos(a) * s, up * rand(0.3, 1) + rand(-0.3, 0.3) * speed, Math.sin(a) * s,
        life * rand(0.6, 1.2), size * rand(0.7, 1.2), size * 0.15, c, 1, grav, drag);
    }
  }

  puff(x, y, z, n, radius, rise, life, size, c, a = 0.6) {
    n = Math.max(1, Math.round(n * this.q));
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * TAU;
      const r = radius * Math.sqrt(Math.random());
      this.smoke(x + Math.cos(ang) * r, y + rand(0, 0.3), z + Math.sin(ang) * r,
        Math.cos(ang) * rand(0.3, 1.2) * (radius + 0.5), rise * rand(0.5, 1.2), Math.sin(ang) * rand(0.3, 1.2) * (radius + 0.5),
        life * rand(0.7, 1.3), size * rand(0.6, 1), size * rand(1.3, 2), c, a, 0, 2.4);
    }
  }

  debris(x, y, z, n, speed, size, c, life = 1.6) {
    n = Math.max(1, Math.round(n * this.q));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const s = speed * rand(0.3, 1);
      const sc = size * rand(0.5, 1.2);
      this.solid(this.rT, x + rand(-0.2, 0.2), y + rand(0, 0.3), z + rand(-0.2, 0.2),
        Math.cos(a) * s, rand(3, 7) * (speed / 4 + 0.5), Math.sin(a) * s, sc, sc * rand(0.6, 1), sc, c, life * rand(0.7, 1.2), 18, 9);
    }
  }

  shards(x, y, z, n, speed, size, c, life = 0.9) {
    n = Math.max(1, Math.round(n * this.q));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const s = speed * rand(0.4, 1);
      const sc = size * rand(0.6, 1.2);
      this.solid(this.gT, x, y, z, Math.cos(a) * s, rand(2, 6), Math.sin(a) * s, sc, sc, sc, c, life * rand(0.7, 1.2), 14, 14);
    }
  }

  shockwave(x, z, r, c, life = 0.45, th = 0.12, a = 1) {
    this.decal(this.dT, x, z, r * 0.25, r, life, c, a, D_RING, th, 0.15);
  }

  explosion(x, y, z, r, c, core) {
    this.glow(x, y + 0.3, z, 0, 0.5, 0, 0.28, r * 1.6, r * 2.4, core, 1);
    this.burst(x, y + 0.3, z, 14 + r * 10, 4 + r * 2, 3, 0.55, 0.35, c, 4, 2.2);
    this.burst(x, y + 0.2, z, 8 + r * 6, 2 + r, 4, 0.8, 0.22, core, 6, 1.5);
    this.puff(x, y + 0.2, z, 6 + r * 4, r * 0.6, 1.6, 1.1, 0.6 + r * 0.25, COL.smoke, 0.55);
    this.shockwave(x, z, r * 1.15, c, 0.5, 0.14);
  }

  // ───────────────────────────── events ─────────────────────────────

  handleEvents(events, world) {
    if (!events || !events.length) return;
    this.q = this.stage.quality === 'low' ? 0.5 : 1;
    for (let i = 0; i < events.length; i++) {
      try { this.onEvent(events[i], world); } catch (err) {
        if (!this.warned) { this.warned = true; console.warn('[fx] event failed', events[i]?.type, err); }
      }
    }
  }

  onEvent(ev, world) {
    const tg = TEAM_GLOW[ev.team === 1 ? 1 : 0];
    switch (ev.type) {
      case 'spawn': {
        const def = world.getEntity(ev.id)?.def;
        const r = def ? def.radius : 0.5;
        if (ev.kind === 'building') {
          this.shockwave(ev.x, ev.z, r * 2.2, tg, 0.6, 0.1);
          this.puff(ev.x, 0, ev.z, 8, r, 0.8, 0.9, 0.55, COL.dust, 0.5);
        } else {
          this.decal(this.dT, ev.x, ev.z, r * 0.6, r * 2.0, 0.55, tg, 0.9, D_RING, 0.18, 0.25);
          this.puff(ev.x, 0, ev.z, 3 + r * 4, r * 0.8, 0.5, 0.7, 0.35 + r * 0.3, COL.dust, 0.45);
        }
        break;
      }
      case 'shoot': {
        const c = ev.projKind === 'frost' ? COL.ice : ev.projKind === 'orb' ? COL.warm
          : ev.projKind === 'pulse' ? COL.violet : ev.projKind === 'spark' ? COL.cyan
            : ev.projKind === 'shell' || ev.projKind === 'tracer' ? COL.fireCore : tg;
        this.glow(ev.x, ev.y, ev.z, 0, 0.3, 0, 0.14, 0.55, 0.9, c, 1);
        if (ev.projKind === 'shell') this.puff(ev.x, ev.y, ev.z, 5, 0.2, 1.5, 0.9, 0.35, COL.smoke, 0.6);
        break;
      }
      case 'impact': this.impact(ev, tg); break;
      case 'chain': {
        const pts = ev.points || [];
        for (let k = 0; k + 1 < pts.length; k++) {
          const a = pts[k], b = pts[k + 1];
          this.bolt(this.sT, a.x, a.y, a.z, b.x, b.y, b.z, 7, 0.35, 0.035, COL.electric, 1.2, 0.28);
          this.burst(b.x, b.y, b.z, 8, 3.5, 2, 0.35, 0.16, COL.electric, 0, 3);
        }
        break;
      }
      case 'shieldBreak':
        this.shards(ev.x, (ev.y || 0) + 0.6, ev.z, 10, 3.5, 0.09, COL.ice, 0.8);
        this.glow(ev.x, (ev.y || 0) + 0.6, ev.z, 0, 0, 0, 0.2, 0.6, 1.1, COL.ice, 1);
        break;
      case 'death': this.death(ev, world); break;
      case 'heal': {
        this.decal(this.dT, ev.x, ev.z, ev.radius * 0.4, ev.radius, 0.7, COL.heal, 0.7, D_RING, 0.08, 0.2);
        for (let k = 0; k < 10 * this.q; k++) {
          const a = Math.random() * TAU, r = ev.radius * Math.sqrt(Math.random());
          this.glow(ev.x + Math.cos(a) * r, 0.3, ev.z + Math.sin(a) * r, 0, rand(1, 2), 0, rand(0.6, 1), 0.16, 0.05, COL.heal, 1);
        }
        break;
      }
      case 'aether':
        for (let k = 0; k < 6; k++) this.glow(ev.x + rand(-0.2, 0.2), 1.6, ev.z + rand(-0.2, 0.2), 0, rand(1.5, 2.6), 0, 0.9, 0.22, 0.06, COL.aether, 1);
        this.glow(ev.x, 1.8, ev.z, 0, 1.2, 0, 0.6, 0.5, 0.2, COL.aether, 1);
        break;
      case 'charge': {
        const e = world.getEntity(ev.id);
        if (e) this.burst(e.x, 0.6, e.z, 10, 3, 1, 0.4, 0.2, tg, 0, 3);
        break;
      }
      case 'pounce': case 'hop': {
        const e = world.getEntity(ev.id);
        if (e) this.puff(e.x, 0, e.z, 6, 0.4, 0.8, 0.6, 0.35, COL.dust, 0.5);
        break;
      }
      case 'landing':
        this.glow(ev.x, 0.4, ev.z, 0, 0, 0, 0.3, ev.radius * 1.2, ev.radius * 1.8, COL.warm, 0.9);
        this.shockwave(ev.x, ev.z, ev.radius * 1.2, COL.warm, 0.6, 0.16);
        this.shockwave(ev.x, ev.z, ev.radius * 0.8, tg, 0.45, 0.1);
        this.puff(ev.x, 0, ev.z, 18, ev.radius * 0.8, 1.2, 1.3, 0.7, COL.dust, 0.6);
        this.debris(ev.x, 0.1, ev.z, 12, 4, 0.13, COL.rock);
        this.decal(this.dT, ev.x, ev.z, ev.radius * 0.8, ev.radius * 0.9, 4, COL.scorch, 0.45, D_SPLAT, 0.1, 0, Math.random(), 0, 1);
        break;
      case 'blast':
        this.explosion(ev.x, 0.3, ev.z, ev.radius, COL.fire, COL.fireCore);
        this.puff(ev.x, 0.5, ev.z, 10, ev.radius * 0.5, 2.2, 1.5, 0.7, COL.steam, 0.55);
        this.debris(ev.x, 0.4, ev.z, 10, 5, 0.1, COL.metal);
        this.decal(this.dT, ev.x, ev.z, ev.radius * 0.7, ev.radius * 0.8, 4, COL.scorch, 0.55, D_SPLAT, 0.1, 0, Math.random(), 0, 1);
        break;
      case 'tunnel':
        this.puff(ev.toX, 0, ev.toZ, 4, 0.5, 0.4, 0.6, 0.35, COL.dustDark, 0.4);
        break;
      case 'spellImpact': this.spellImpact(ev, world, tg); break;
      case 'zone':
        this.shockwave(ev.x, ev.z, ev.radius, this.zoneColor(ev.kind, ev.team), 0.5, 0.1);
        break;
      case 'roll':
        this.puff(ev.x, 0, ev.z, 10, 1.2, 0.8, 1, 0.6, COL.dust, 0.6);
        break;
      case 'citadelWake': {
        const p = towerPosition(ev.team, 'citadel');
        this.shockwave(p.x, p.z, 3.5, tg, 0.8, 0.12);
        for (let k = 0; k < 24 * this.q; k++) {
          const a = Math.random() * TAU;
          this.glow(p.x + Math.cos(a) * 1.2, rand(1, 4.5), p.z + Math.sin(a) * 1.2, 0, rand(1.5, 3), 0, rand(0.6, 1.1), 0.22, 0.05, tg, 1);
        }
        break;
      }
      case 'towerDown':
        this.shards(ev.x, 4, ev.z, 26, 6, 0.22, TEAM_GLOW[ev.team === 1 ? 1 : 0], 1.6);
        this.glow(ev.x, 4, ev.z, 0, 0, 0, 0.45, 3, 5, COL.white, 1);
        break;
      default: break;
    }
  }

  impact(ev, tg) {
    const x = ev.x, y = ev.y || 0, z = ev.z;
    const sp = ev.splash || 0;
    switch (ev.projKind) {
      case 'frost':
        this.burst(x, y, z, 14, 3, 2, 0.5, 0.2, COL.ice, 4, 2.5);
        this.puff(x, y, z, 6, sp * 0.6, 0.4, 1.0, 0.45, COL.mist, 0.55);
        this.shockwave(x, z, Math.max(0.6, sp), COL.iceDeep, 0.5, 0.15);
        this.shards(x, y, z, 5, 2.5, 0.07, COL.ice);
        return;
      case 'glob':
        this.puff(x, 0.1, z, 10, sp * 0.5, 0.8, 0.9, 0.45, COL.mud, 0.7);
        this.debris(x, 0.2, z, 6, 3, 0.07, COL.mud, 1);
        this.decal(this.dT, x, z, sp * 0.8, sp, 3, COL.mud, 0.55, D_SPLAT, 0.1, 0, Math.random(), 0, 1);
        this.shockwave(x, z, sp, COL.warm, 0.35, 0.08, 0.6);
        return;
      case 'shell':
        this.explosion(x, 0.2, z, Math.max(1, sp), COL.fire, COL.fireCore);
        this.decal(this.dT, x, z, sp * 0.7, sp * 0.8, 3.5, COL.scorch, 0.5, D_SPLAT, 0.1, 0, Math.random(), 0, 1);
        this.debris(x, 0.2, z, 6, 3.5, 0.08, COL.rock);
        return;
      case 'orb':
        this.glow(x, y, z, 0, 0, 0, 0.3, sp * 1.1, sp * 1.7, COL.warm, 1);
        this.burst(x, y, z, 22, 5, 2, 0.6, 0.24, COL.warm, 3, 2.4);
        this.shockwave(x, z, sp, COL.warm, 0.5, 0.12);
        return;
      case 'pulse':
        this.glow(x, y, z, 0, 0, 0, 0.25, sp, sp * 1.5, COL.violet, 1);
        this.burst(x, y, z, 14, 4, 1, 0.45, 0.18, COL.violet, 0, 3);
        this.shockwave(x, z, sp, COL.violet, 0.4, 0.12);
        for (let k = 0; k < 3; k++) {
          const a = Math.random() * TAU;
          this.bolt(this.sT, x, y, z, x + Math.cos(a) * sp, Math.max(0.1, y - 0.3), z + Math.sin(a) * sp, 4, 0.2, 0.025, COL.violet, 1, 0.18);
        }
        return;
      case 'petal':
        for (let k = 0; k < 8 * this.q; k++) this.glow(x, y, z, rand(-1.5, 1.5), rand(0.5, 2), rand(-1.5, 1.5), 0.7, 0.14, 0.05, COL.pink, 1, 3, 1.5);
        return;
      case 'spark':
        this.burst(x, y, z, 10, 3, 1.5, 0.3, 0.14, COL.cyan, 0, 3);
        this.glow(x, y, z, 0, 0, 0, 0.12, 0.4, 0.7, COL.electric, 1);
        return;
      case 'tracer':
        this.burst(x, y, z, 8, 3, 1, 0.25, 0.12, COL.fireCore, 6, 2);
        this.glow(x, y, z, 0, 0, 0, 0.1, 0.35, 0.6, COL.white, 1);
        return;
      case 'shard':
      case 'bolt':
        this.glow(x, y, z, 0, 0, 0, 0.14, 0.5, 0.9, tg, 1);
        this.shards(x, y, z, 4, 2.5, 0.06, tg, 0.5);
        return;
      case 'wrench':
        this.burst(x, y, z, 10, 3, 2, 0.3, 0.12, COL.warm, 8, 2);
        return;
      default: break;
    }
    // melee / instant hits by attack style
    switch (ev.attackFx) {
      case 'smash': {
        const r = Math.max(0.9, sp || 0.9);
        this.shockwave(x, z, r * 1.2, COL.warm, 0.4, 0.14);
        this.puff(x, 0, z, 8, r * 0.6, 0.9, 0.8, 0.45, COL.dust, 0.55);
        this.burst(x, Math.max(0.3, y), z, 10, 3.5, 2.5, 0.35, 0.16, COL.warm, 8, 2);
        if (ev.sourceType !== 'rockslide') this.debris(x, 0.1, z, 4, 3, 0.07, COL.rock, 1);
        break;
      }
      case 'ram':
        this.puff(x, 0, z, 8, 0.5, 0.8, 0.8, 0.45, COL.dust, 0.55);
        this.burst(x, Math.max(0.4, y), z, 12, 4, 2, 0.35, 0.18, COL.warm, 6, 2);
        this.shockwave(x, z, 1.1, tg, 0.35, 0.12);
        break;
      case 'zap':
        this.burst(x, y, z, 12, 4, 2, 0.3, 0.15, COL.electric, 0, 3);
        this.glow(x, y, z, 0, 0, 0, 0.12, 0.5, 0.9, COL.electric, 1);
        for (let k = 0; k < 3; k++) {
          const a = Math.random() * TAU;
          this.bolt(this.sT, x, y, z, x + Math.cos(a) * 0.9, y + rand(-0.4, 0.4), z + Math.sin(a) * 0.9, 3, 0.15, 0.02, COL.electric, 1, 0.15);
        }
        if (sp > 0) this.shockwave(x, z, sp, COL.electric, 0.35, 0.1);
        break;
      case 'burst':
        this.explosion(x, Math.max(0.2, y - 0.2), z, Math.max(0.8, sp), tg, COL.white);
        break;
      case 'bite':
        this.burst(x, y, z, 6, 2.5, 1.5, 0.22, 0.12, COL.white, 6, 3);
        break;
      default: {   // slash
        this.burst(x, y, z, 8, 3, 1.5, 0.25, 0.13, COL.white, 6, 3);
        const a = Math.random() * TAU;
        const ca = Math.cos(a) * 0.45, sa = Math.sin(a) * 0.45;
        this.seg(this.sT, x - ca, y + 0.25, z - sa, x + ca, y - 0.2, z + sa, 0.03, COL.white, 1.4, 0.12);
        if (sp > 0) this.shockwave(x, z, sp, COL.white, 0.3, 0.1, 0.7);
        break;
      }
    }
  }

  death(ev, world) {
    const tg = TEAM_GLOW[ev.team === 1 ? 1 : 0];
    const r = ev.radius || 0.5;
    const y = ev.y || 0;
    if (ev.kind === 'tower') {
      this.glow(ev.x, 2, ev.z, 0, 0, 0, 0.5, 4, 6, COL.warm, 1);
      this.puff(ev.x, 0.5, ev.z, 26, r, 2.2, 2.2, 1.2, COL.dust, 0.65);
      this.puff(ev.x, 1.5, ev.z, 10, r * 0.6, 3.5, 2.5, 1.0, COL.smoke, 0.5);
      this.debris(ev.x, 1.5, ev.z, 34, 6, 0.22, COL.stone, 2.4);
      this.shockwave(ev.x, ev.z, r * 3, COL.warm, 0.8, 0.14);
      this.decal(this.dT, ev.x, ev.z, r * 1.6, r * 1.8, 8, COL.scorch, 0.4, D_SPLAT, 0.1, 0, Math.random(), 0, 1);
    } else if (ev.kind === 'building') {
      this.puff(ev.x, 0.3, ev.z, 14, r, 1.6, 1.4, 0.7, COL.dust, 0.6);
      this.debris(ev.x, 0.8, ev.z, 14, 4, 0.12, COL.stone, 1.6);
      this.shards(ev.x, 1, ev.z, 8, 3, 0.1, tg, 0.9);
      this.shockwave(ev.x, ev.z, r * 2, tg, 0.5, 0.1);
    } else {
      const big = r > 0.7 ? 1.6 : 1;
      this.burst(ev.x, y + 0.5 * big, ev.z, 10 * big, 2.6 * big, 2.5, 0.55, 0.2 * big, tg, 3, 2);
      this.puff(ev.x, y + 0.2, ev.z, 4 * big, r, 1.2, 0.9, 0.35 + r * 0.4, ev.y > 1 ? COL.smokeLight : COL.dust, 0.5);
      this.glow(ev.x, y + 0.5, ev.z, 0, 0.5, 0, 0.18, 0.5 * big, 0.9 * big, tg, 0.9);
      if (r > 0.7) this.debris(ev.x, 0.5, ev.z, 6, 3, 0.1, COL.rock, 1.2);
    }
  }

  spellImpact(ev, world, tg) {
    const x = ev.x, z = ev.z, r = ev.radius || 2;
    switch (ev.kind) {
      case 'comet':
        this.explosion(x, 0.2, z, r, COL.fire, COL.fireCore);
        this.glow(x, 1, z, 0, 0, 0, 0.35, r * 2, r * 3, COL.fireCore, 1);
        this.burst(x, 0.5, z, 30, 7, 5, 0.9, 0.22, COL.ember, 9, 1.2);
        this.debris(x, 0.3, z, 14, 5, 0.14, COL.rockDark, 1.8);
        this.puff(x, 0.3, z, 16, r * 0.7, 2.5, 1.8, 0.9, COL.smoke, 0.6);
        this.decal(this.dT, x, z, r * 0.95, r, 6, COL.scorch, 0.6, D_SPLAT, 0.1, 0, Math.random(), 0, 1);
        this.shockwave(x, z, r * 1.6, COL.warm, 0.7, 0.1, 0.8);
        break;
      case 'shardstorm':
        for (let k = 0; k < 12 * this.q; k++) {
          const a = Math.random() * TAU, d = r * Math.sqrt(Math.random());
          const sx = x + Math.cos(a) * d, sz = z + Math.sin(a) * d;
          this.solid(this.gT, sx, rand(2.5, 4.5), sz, 0, -22, 0, 0.12, 0.26, 0.12, COL.ice, 0.18, 0, 0);
          this.burst(sx, 0.2, sz, 3, 2, 1.5, 0.3, 0.12, COL.cyan, 6, 2);
        }
        this.decal(this.dT, x, z, r, r, 0.4, COL.cyan, 0.5, D_RING, 0.05, 0.25);
        break;
      case 'stasis':
        this.glow(x, 0.5, z, 0, 0, 0, 0.35, r * 1.2, r * 1.6, COL.ice, 1);
        for (let k = 0; k < 14 * this.q; k++) {
          const a = Math.random() * TAU, d = r * Math.sqrt(Math.random());
          this.solid(this.gT, x + Math.cos(a) * d, 0.2, z + Math.sin(a) * d, 0, 0, 0, rand(0.15, 0.3), rand(0.4, 0.8), rand(0.15, 0.3),
            COL.ice, ev.duration || 3, 0, 0);
        }
        this.burst(x, 0.4, z, 24, 4, 3, 0.7, 0.2, COL.ice, 2, 2);
        this.puff(x, 0.2, z, 12, r * 0.8, 0.4, 1.4, 0.6, COL.mist, 0.5);
        break;
      case 'jolt':
        this.glow(x, 0.6, z, 0, 0, 0, 0.18, r * 1.1, r * 1.5, COL.yellow, 1);
        for (let k = 0; k < 7; k++) {
          const a = (k / 7) * TAU + rand(-0.3, 0.3);
          this.bolt(this.sT, x, 0.6, z, x + Math.cos(a) * r, 0.2, z + Math.sin(a) * r, 5, 0.3, 0.03, COL.yellow, 1.3, 0.22);
        }
        this.burst(x, 0.5, z, 20, 5, 2, 0.4, 0.16, COL.electric, 0, 3);
        this.shockwave(x, z, r, COL.yellow, 0.35, 0.1);
        break;
      case 'skyfork':
        if (ev.waves === 0) break;
        this.bolt(this.sT, x + rand(-1, 1), 15, z + rand(-1, 1), x, 0.4, z, 12, 0.7, 0.06, COL.violet, 1.6, 0.3);
        this.glow(x, 0.8, z, 0, 0, 0, 0.25, 1.4, 2.2, COL.white, 1);
        this.burst(x, 0.5, z, 16, 5, 3, 0.45, 0.18, COL.electric, 4, 2.5);
        this.shockwave(x, z, 1.4, COL.violet, 0.4, 0.12);
        this.decal(this.dT, x, z, 0.8, 0.9, 3, COL.scorch, 0.45, D_SPLAT, 0.1, 0, Math.random(), 0, 1);
        break;
      case 'seedpod':
        this.burst(x, 0.4, z, 18, 3.5, 3, 0.7, 0.16, COL.heal, 5, 2);
        this.puff(x, 0.1, z, 8, 0.8, 0.8, 0.9, 0.45, COL.dust, 0.5);
        this.shockwave(x, z, 1.4, COL.heal, 0.45, 0.12);
        for (let k = 0; k < 6; k++) this.solid(this.gT, x, 0.4, z, rand(-2, 2), rand(2, 4), rand(-2, 2), 0.06, 0.14, 0.06, COL.podGreen, 0.8, 10, 10);
        break;
      default: break;
    }
  }

  zoneColor(kind, team) {
    switch (kind) {
      case 'stasis': return COL.ice;
      case 'overclock': return COL.gold;
      case 'blight': return COL.spore;
      case 'maelstrom': return COL.teal;
      default: return TEAM_GLOW[team === 1 ? 1 : 0];
    }
  }

  // ───────────────────────────── per-frame mirror of the world ─────────────────────────────

  sync(world, alpha, time) {
    this.hN = 0;
    this.dF.n = 0; this.sF.n = 0; this.rF.n = 0; this.gF.n = 0;
    this.iceN = 0;
    if (!world) return;
    let dt = this.lastSync < 0 ? 0 : time - this.lastSync;
    if (!(dt >= 0) || dt > 0.1) dt = 0.016;
    this.lastSync = time;
    this.q = this.stage.quality === 'low' ? 0.5 : 1;
    try {
      this.syncProjectiles(world, alpha, time);
      this.syncEntities(world, alpha, time, dt);
      this.syncZones(world, time, dt);
      this.syncRollers(world, alpha, time, dt);
      this.syncPending(world, time, dt);
    } catch (err) {
      if (!this.warnedSync) { this.warnedSync = true; console.warn('[fx] sync failed', err); }
    }
  }

  syncProjectiles(world, alpha, time) {
    const list = world.projectiles;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (p.alive === false) continue;
      const x = p.px + (p.x - p.px) * alpha, y = p.py + (p.y - p.py) * alpha, z = p.pz + (p.z - p.pz) * alpha;
      const tg = TEAM_GLOW[p.team === 1 ? 1 : 0];
      const dx = p.x - p.px, dy = p.y - p.py, dz = p.z - p.pz;
      switch (p.kind) {
        case 'spark':
          this.head(x, y, z, 0.24, COL.cyan);
          this.glow(x + rand(-0.06, 0.06), y + rand(-0.06, 0.06), z + rand(-0.06, 0.06), rand(-0.6, 0.6), rand(-0.6, 0.6), rand(-0.6, 0.6), 0.16, 0.12, 0.02, COL.electric);
          break;
        case 'pulse':
          this.head(x, y, z, 0.42, COL.violet);
          this.head(x, y, z, 0.18, COL.white);
          this.glow(x, y, z, 0, 0, 0, 0.22, 0.3, 0.05, COL.violet, 0.8);
          break;
        case 'orb':
          this.head(x, y, z, 0.62, COL.warm);
          this.head(x, y, z, 0.28, COL.white);
          this.glow(x, y, z, rand(-0.3, 0.3), rand(-0.3, 0.3), rand(-0.3, 0.3), 0.35, 0.36, 0.05, COL.gold, 0.9);
          break;
        case 'tracer': {
          const len = Math.hypot(dx, dy, dz) || 1;
          const k = 1.3 / len;
          this.seg(this.sF, x - dx * k, y - dy * k, z - dz * k, x, y, z, 0.035, COL.fireCore, 1.2);
          this.head(x, y, z, 0.2, COL.white);
          break;
        }
        case 'frost':
          this.head(x, y, z, 0.34, COL.ice);
          this.smoke(x, y, z, rand(-0.2, 0.2), rand(-0.1, 0.2), rand(-0.2, 0.2), 0.5, 0.15, 0.32, COL.mist, 0.5, 0, 2);
          break;
        case 'petal':
          this.head(x, y, z, 0.2, COL.pink);
          this.glow(x, y, z, 0, -0.3, 0, 0.3, 0.1, 0.03, COL.pink, 0.8);
          break;
        case 'wrench':
          this.frameSolid(this.rF, x, y, z, time * 14, time * 3, time * 9, 0.06, 0.2, 0.06, COL.metal);
          break;
        case 'glob':
          this.frameSolid(this.rF, x, y, z, time * 5, time * 4, 0, 0.2, 0.18, 0.2, COL.mud);
          if (Math.random() < 0.5) this.smoke(x, y, z, 0, 0, 0, 0.4, 0.12, 0.22, COL.mud, 0.5, 0, 2);
          break;
        case 'shell':
          this.frameSolid(this.rF, x, y, z, time * 6, 0, time * 4, 0.2, 0.22, 0.2, COL.rockDark);
          this.head(x, y, z, 0.18, COL.fire, 0.8);
          this.smoke(x, y, z, 0, 0.2, 0, 0.8, 0.14, 0.4, COL.smoke, 0.5, 0, 1.5);
          break;
        case 'shard': {
          const yaw = Math.atan2(dx, dz);
          this.frameSolid(this.gF, x, y, z, Math.PI / 2, yaw, 0, 0.09, 0.22, 0.09, tg);
          this.glow(x, y, z, 0, 0, 0, 0.18, 0.16, 0.02, tg, 0.8);
          break;
        }
        default:   // bolt and anything unknown: a team crystal bolt with a trail
          this.head(x, y, z, 0.4, tg);
          this.head(x, y, z, 0.17, COL.white);
          this.glow(x, y, z, 0, 0, 0, 0.25, 0.26, 0.04, tg, 0.9);
          break;
      }
    }
  }

  syncEntities(world, alpha, time, dt) {
    const ents = world.entities;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      const unit = e.kind === 'unit';
      const vs = unit ? UNIT_VISUAL_SCALE : 1;
      const x = e.px + (e.x - e.px) * alpha, y = e.py + (e.y - e.py) * alpha, z = e.pz + (e.z - e.pz) * alpha;
      const h = (e.def.height || 1.4) * vs;
      const r = (e.radius || 0.5) * vs;

      if (e.frozen > 0) {
        if (e.kind !== 'tower' && this.iceN < ICE_CAP) {
          const k = this.iceN++;
          const melt = Math.min(1, e.frozen / 0.3);
          _p.set(x, y + h * 0.42, z);
          _e.set(0.3, k * 1.7, 0.2);
          _q.setFromEuler(_e);
          _s.set(r * 1.25 * melt, h * 0.62 * melt, r * 1.25 * melt);
          _m.compose(_p, _q, _s);
          this.iceMesh.setMatrixAt(k, _m);
          this.iceMesh.setColorAt(k, _c.setRGB(1, 1, 1));
        } else if (Math.random() < dt * 10) {
          this.smoke(x + rand(-r, r), y + rand(0.5, h), z + rand(-r, r), 0, 0.3, 0, 0.8, 0.3, 0.6, COL.mist, 0.4, 0, 1);
        }
      } else if (e.stunned > 0) {
        const n = e.kind === 'tower' ? 5 : 3;
        const rr = Math.max(0.3, r * 0.8);
        for (let k = 0; k < n; k++) {
          const a = time * 6 + (k * TAU) / n;
          this.head(x + Math.cos(a) * rr, y + h + 0.15 + Math.sin(time * 9 + k) * 0.05, z + Math.sin(a) * rr, 0.13, COL.yellow);
        }
      }
      if (e.slowT > 0 && !(e.frozen > 0) && Math.random() < dt * 8 * this.q) {
        this.smoke(x + rand(-r, r), y + 0.1, z + rand(-r, r), 0, 0.25, 0, 0.7, 0.2, 0.45, COL.mist, 0.45, 0, 1);
        if (Math.random() < 0.5) this.glow(x + rand(-r, r), y + rand(0.2, h), z + rand(-r, r), 0, -0.2, 0, 0.5, 0.08, 0.02, COL.ice, 0.8);
      }
      if (e.hasteT > 0 && Math.random() < dt * 14 * this.q) {
        this.glow(x + rand(-r, r), y + rand(0.1, h * 0.8), z + rand(-r, r), 0, rand(0.8, 1.6), 0, 0.5, 0.11, 0.02, COL.gold, 1);
      }
      if (e.charged) {
        const tg = TEAM_GLOW[e.team === 1 ? 1 : 0];
        this.glow(x + rand(-r, r) * 0.6, y + rand(0.2, h * 0.7), z + rand(-r, r) * 0.6, -Math.sin(e.facing) * 2.5, 0, -Math.cos(e.facing) * 2.5,
          0.25, 0.16, 0.03, tg, 1);
        if (Math.random() < dt * 12) this.puff(x, 0, z, 1, 0.2, 0.3, 0.5, 0.3, COL.dust, 0.4);
      }
      if (e.beam && e.targetId) {
        const t = world.getEntity(e.targetId);
        if (t) {
          const tx = t.px + (t.x - t.px) * alpha, ty = t.py + (t.y - t.py) * alpha, tz = t.pz + (t.z - t.pz) * alpha;
          const th = (t.def.height || 1.4) * (t.kind === 'unit' ? UNIT_VISUAL_SCALE : 1);
          const heat = Math.min(1, (e.rampT || 0) / 4);
          const ax = x + Math.sin(e.facing) * r * 0.5, ay = y + (e.def.muzzle || 1) * vs, az = z + Math.cos(e.facing) * r * 0.5;
          const by = ty + Math.min(th * 0.5, 2.5);
          const flick = 0.85 + 0.15 * Math.sin(time * 40 + i);
          const c = heat < 0.5 ? COL.warm : COL.fireCore;
          this.seg(this.sF, ax, ay, az, tx, by, tz, (0.07 + heat * 0.14) * flick, c, 0.35 + heat * 0.3);
          this.seg(this.sF, ax, ay, az, tx, by, tz, (0.025 + heat * 0.05) * flick, COL.white, 0.8 + heat * 0.6);
          this.head(ax, ay, az, 0.25 + heat * 0.25, c);
          this.head(tx, by, tz, 0.35 + heat * 0.5, c, 0.9);
          if (Math.random() < dt * (10 + heat * 30)) this.glow(tx, by, tz, rand(-2, 2), rand(0.5, 3), rand(-2, 2), 0.35, 0.1, 0.02, c, 1, 6, 1);
        }
      }
    }
  }

  syncZones(world, time, dt) {
    const zones = world.zones;
    for (let i = 0; i < zones.length; i++) {
      const zn = zones[i];
      const r = zn.radius;
      const life = zn.duration > 0 ? zn.timeLeft / zn.duration : 1;
      const fade = Math.min(1, zn.timeLeft / 0.4, (zn.duration - zn.timeLeft) / 0.2 + 0.2);
      const c = this.zoneColor(zn.kind, zn.team);
      switch (zn.kind) {
        case 'overclock':
          this.decal(this.dF, zn.x, zn.z, r, r, 0, c, 0.65 * fade, D_DASH, 0.06, 0.18, time * 0.15);
          if (Math.random() < dt * 40 * this.q) {
            const a = Math.random() * TAU, d = r * Math.sqrt(Math.random());
            this.glow(zn.x + Math.cos(a) * d, 0.2, zn.z + Math.sin(a) * d, 0, rand(1.5, 2.5), 0, 0.7, 0.12, 0.03, c, 1);
          }
          break;
        case 'blight':
          this.decal(this.dF, zn.x, zn.z, r, r, 0, COL.sporeDark, 0.35 * fade, D_DISC, 0.1, 0, 0, 0, 1);
          this.decal(this.dF, zn.x, zn.z, r, r, 0, c, 0.4 * fade, D_RING, 0.05, 0.1);
          if (Math.random() < dt * 30 * this.q) {
            const a = Math.random() * TAU, d = r * Math.sqrt(Math.random());
            this.smoke(zn.x + Math.cos(a) * d, rand(0.1, 0.8), zn.z + Math.sin(a) * d, rand(-0.2, 0.2), rand(0.1, 0.4), rand(-0.2, 0.2),
              rand(1.2, 2), 0.5, 1.1, Math.random() < 0.5 ? COL.sporeCloud : COL.sporeDark, 0.45 * fade, 0, 0.5);
          }
          if (Math.random() < dt * 12 * this.q) {
            const a = Math.random() * TAU, d = r * Math.random();
            this.glow(zn.x + Math.cos(a) * d, 0.3, zn.z + Math.sin(a) * d, 0, 0.6, 0, 0.9, 0.09, 0.02, COL.spore, 1);
          }
          break;
        case 'maelstrom': {
          this.decal(this.dF, zn.x, zn.z, r, r, 0, c, 0.6 * fade, D_SWIRL, 0.04, 0, time * 1.2);
          const n = (dt * 50 * this.q) | 0;
          for (let k = 0; k < n + (Math.random() < (dt * 50 * this.q) % 1 ? 1 : 0); k++) {
            const a = Math.random() * TAU, d = r * rand(0.6, 1);
            const px = zn.x + Math.cos(a) * d, pz = zn.z + Math.sin(a) * d;
            const tx = -Math.sin(a) * 6, tz = Math.cos(a) * 6;
            const ix = (zn.x - px) * 1.6, iz = (zn.z - pz) * 1.6;
            this.smoke(px, rand(0.1, 1.2), pz, tx + ix, rand(0.5, 1.5), tz + iz, 0.6, 0.25, 0.5, COL.dust, 0.45, 0, 0.3);
          }
          if (Math.random() < dt * 20) {
            const a = Math.random() * TAU;
            this.glow(zn.x + Math.cos(a) * r * 0.8, 0.5, zn.z + Math.sin(a) * r * 0.8, -Math.sin(a) * 7, 2, Math.cos(a) * 7, 0.4, 0.12, 0.03, c, 1);
          }
          break;
        }
        case 'stasis':
          this.decal(this.dF, zn.x, zn.z, r, r, 0, c, 0.55 * fade, D_RING, 0.06, 0.35 * life);
          break;
        default:
          this.decal(this.dF, zn.x, zn.z, r, r, 0, c, 0.5 * fade, D_RING, 0.06, 0.2);
          break;
      }
    }
  }

  syncRollers(world, alpha, time, dt) {
    const list = world.rollers;
    for (let i = 0; i < list.length; i++) {
      const ro = list[i];
      const z = ro.pz + (ro.z - ro.pz) * alpha;
      const x = ro.px !== undefined ? ro.px + (ro.x - ro.px) * alpha : ro.x;
      const rad = Math.min(1.1, (ro.halfWidth || 1.5) * 0.55);
      const roll = (ro.traveled || 0) / rad * (ro.dirZ || 1);
      this.frameSolid(this.rF, x, rad * 0.9, z, roll, 0, 0, ro.halfWidth * 0.95, rad, rad, COL.rock);
      this.frameSolid(this.rF, x + ro.halfWidth * 0.5, rad * 0.6, z, roll * 1.3, 1, 0, rad * 0.6, rad * 0.6, rad * 0.6, COL.rockDark);
      this.frameSolid(this.rF, x - ro.halfWidth * 0.5, rad * 0.6, z, roll * 1.2, 2, 0, rad * 0.6, rad * 0.6, rad * 0.6, COL.rockDark);
      if (Math.random() < dt * 30 * this.q) {
        this.smoke(x + rand(-ro.halfWidth, ro.halfWidth), 0.2, z - (ro.dirZ || 1) * rad, rand(-0.5, 0.5), rand(0.4, 1), -(ro.dirZ || 1) * rand(0.5, 1.5),
          rand(0.7, 1.1), 0.4, 0.9, COL.dust, 0.55, 0, 1.2);
      }
    }
  }

  syncPending(world, time, dt) {
    const list = world.pending;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      const tg = TEAM_GLOW[p.team === 1 ? 1 : 0];
      switch (p.kind) {
        case 'tunnel': {
          const dur = p.duration || 1;
          const t = Math.max(0, Math.min(1, 1 - p.timeLeft / dur));
          const x = p.fromX + (p.x - p.fromX) * t, z = p.fromZ + (p.z - p.fromZ) * t;
          this.frameSolid(this.rF, x, 0.02, z, 0, time * 2, 0, 0.42, 0.2 + 0.05 * Math.sin(time * 18), 0.42, COL.mud);
          if (Math.random() < dt * 25 * this.q) this.smoke(x, 0.15, z, rand(-0.6, 0.6), rand(0.5, 1), rand(-0.6, 0.6), 0.7, 0.25, 0.5, COL.dustDark, 0.5, 0, 1.5);
          if (Math.random() < dt * 10 * this.q) this.solid(this.rT, x, 0.2, z, rand(-1.5, 1.5), rand(2, 3.5), rand(-1.5, 1.5), 0.05, 0.05, 0.05, COL.mud, 0.7, 14, 8);
          this.decal(this.dF, p.x, p.z, 0.8, 0.8, 0, tg, 0.5, D_DASH, 0.12, 0.15, time * 0.3);
          break;
        }
        case 'fuse': {
          const pulse = 0.5 + 0.5 * Math.sin(time * (8 + 20 / Math.max(0.2, p.timeLeft)));
          this.decal(this.dF, p.x, p.z, p.radius, p.radius, 0, COL.fire, 0.35 + 0.4 * pulse, D_DASH, 0.06, 0.12 + 0.12 * pulse, time * 0.4);
          this.head(p.x, 0.6, p.z, 0.6 + 0.4 * pulse, COL.fire, 0.8);
          if (Math.random() < dt * 25 * this.q) this.smoke(p.x + rand(-0.4, 0.4), 0.5, p.z + rand(-0.4, 0.4), 0, rand(1.5, 2.5), 0, 0.9, 0.25, 0.7, COL.steam, 0.5, 0, 1);
          break;
        }
        case 'strike': {
          const e = world.getEntity(p.targetId);
          const x = e ? e.x : p.x, z = e ? e.z : p.z;
          this.decal(this.dF, x, z, 0.9, 0.9, 0, COL.violet, 0.8, D_DASH, 0.15, 0.3, time * 0.6);
          break;
        }
        default: {
          // spells waiting to resolve: telegraph ring, plus a falling comet / an arcing pod
          const delay = p.delay > 0 ? p.delay : (p.spell && p.spell.delay) || 0.5;
          const prog = Math.max(0, Math.min(1, 1 - p.timeLeft / delay));
          const r = p.radius || 1.5;
          this.decal(this.dF, p.x, p.z, r, r, 0, tg, 0.45 + 0.35 * prog, D_DASH, 0.05, 0.08 + 0.2 * prog, time * 0.1);
          if (p.kind === 'comet') {
            const s = teamSign(p.team);
            const sx = p.x - 3, sy = 16, sz = p.z + 7 * s;
            const t = prog * prog;
            const x = sx + (p.x - sx) * t, y = sy + (0.4 - sy) * t, z = sz + (p.z - sz) * t;
            this.frameSolid(this.rF, x, y, z, time * 5, time * 3, 0, 0.55, 0.5, 0.55, COL.rockDark);
            this.head(x, y, z, 1.4, COL.fire);
            this.head(x, y, z, 0.7, COL.fireCore);
            for (let k = 0; k < 3; k++) {
              this.glow(x + rand(-0.3, 0.3), y + rand(-0.3, 0.3), z + rand(-0.3, 0.3), rand(-0.5, 0.5), rand(0, 1), rand(-0.5, 0.5),
                0.45, 0.6, 0.1, Math.random() < 0.5 ? COL.fire : COL.ember, 1);
            }
            if (Math.random() < 0.6) this.smoke(x, y, z, 0, 0.5, 0, 1.2, 0.5, 1.2, COL.smoke, 0.45, 0, 0.8);
          } else if (p.kind === 'seedpod') {
            const c = towerPosition(p.team, 'citadel');
            const x = c.x + (p.x - c.x) * prog, z = c.z + (p.z - c.z) * prog;
            const y = 5 * (1 - prog) + 0.3 + 7 * prog * (1 - prog);
            this.frameSolid(this.gF, x, y, z, time * 4, time * 2, 0, 0.3, 0.42, 0.3, COL.podGreen);
            if (Math.random() < 0.5) this.glow(x, y, z, 0, 0, 0, 0.4, 0.15, 0.03, COL.heal, 1);
          } else if (p.kind === 'skyfork' && Math.random() < dt * 6) {
            this.bolt(this.sT, p.x + rand(-r, r), 12, p.z + rand(-r, r), p.x + rand(-r, r), 9, p.z + rand(-r, r), 4, 0.6, 0.03, COL.violet, 0.8, 0.12);
          } else if (p.kind === 'stasis' || p.kind === 'shardstorm') {
            if (Math.random() < dt * 20 * this.q) {
              const a = Math.random() * TAU, d = r * Math.sqrt(Math.random());
              this.glow(p.x + Math.cos(a) * d, 3.5, p.z + Math.sin(a) * d, 0, -4, 0, 0.6, 0.12, 0.04, COL.ice, 1);
            }
          }
          break;
        }
      }
    }
  }

  // ───────────────────────────── per frame: simulate + upload ─────────────────────────────

  update(dt, time) {
    if (!(dt >= 0)) dt = 0;
    if (dt > 0.1) dt = 0.1;
    this.time = time;
    try {
      this.glowP.step(dt);
      this.smokeP.step(dt);
      this.writeSprites(this.glowMesh, this.glowP, true);
      this.writeSprites(this.smokeMesh, this.smokeP, false);
      this.stepDecals(this.dT, dt);
      this.writeDecals();
      this.stepSegs(this.sT, dt);
      this.writeSegs();
      this.stepSolids(this.rT, dt);
      this.stepSolids(this.gT, dt);
      this.writeSolids(this.rockMesh, this.rT, this.rF);
      this.writeSolids(this.gemMesh, this.gT, this.gF);
      this.iceMesh.count = this.iceN;
      if (this.iceN) { this.iceMesh.instanceMatrix.needsUpdate = true; this.iceMesh.instanceColor.needsUpdate = true; }
    } catch (err) {
      if (!this.warnedUpdate) { this.warnedUpdate = true; console.warn('[fx] update failed', err); }
    }
  }

  writeSprites(mesh, pool, heads) {
    const g = mesh.geometry;
    const P = g.attributes.iPos.array, C = g.attributes.iCol.array, S = g.attributes.iSz.array;
    let n = 0;
    for (let i = 0; i < pool.n; i++) {
      const t = pool.life[i] / pool.max[i];
      const fadeIn = t < 0.08 ? t / 0.08 : 1;
      const fade = heads ? (1 - t) * (1 - t * 0.3) : (1 - t);
      P[n * 3] = pool.x[i]; P[n * 3 + 1] = pool.y[i]; P[n * 3 + 2] = pool.z[i];
      C[n * 4] = pool.r[i]; C[n * 4 + 1] = pool.g[i]; C[n * 4 + 2] = pool.b[i]; C[n * 4 + 3] = pool.a[i] * fade * fadeIn;
      S[n * 2] = pool.s0[i] + (pool.s1[i] - pool.s0[i]) * t; S[n * 2 + 1] = pool.seed[i];
      n++;
    }
    if (heads) {
      for (let i = 0; i < this.hN; i++) {
        P[n * 3] = this.hx[i]; P[n * 3 + 1] = this.hy[i]; P[n * 3 + 2] = this.hz[i];
        C[n * 4] = this.hc[i * 4]; C[n * 4 + 1] = this.hc[i * 4 + 1]; C[n * 4 + 2] = this.hc[i * 4 + 2]; C[n * 4 + 3] = this.hc[i * 4 + 3];
        S[n * 2] = this.hs[i]; S[n * 2 + 1] = 0;
        n++;
      }
    }
    g.instanceCount = n;
    if (n) { upload(g.attributes.iPos, n); upload(g.attributes.iCol, n); upload(g.attributes.iSz, n); }
  }

  stepDecals(st, dt) {
    let i = 0;
    while (i < st.n) {
      st.life[i] += dt;
      if (st.life[i] >= st.max[i]) {
        st.n--;
        if (i !== st.n) {
          for (let k = 0; k < DECAL_KEYS.length; k++) st[DECAL_KEYS[k]][i] = st[DECAL_KEYS[k]][st.n];
        }
        continue;
      }
      st.spin[i] += st.spinV[i] * dt;
      i++;
    }
  }

  writeDecals() {
    const add = this.decalAdd.geometry, mix = this.decalMix.geometry;
    const AP = add.attributes.iPosR.array, AC = add.attributes.iCol.array, AR = add.attributes.iPar.array;
    const MP = mix.attributes.iPosR.array, MC = mix.attributes.iCol.array, MR = mix.attributes.iPar.array;
    const capA = DECAL_CAP, capM = DECAL_CAP / 2;
    let na = 0, nm = 0;
    const put = (st, i, timed) => {
      let r = st.r1[i], a = st.a[i];
      if (timed) {
        const t = st.life[i] / st.max[i];
        const e = 1 - (1 - t) * (1 - t) * (1 - t);
        r = st.r0[i] + (st.r1[i] - st.r0[i]) * e;
        a *= st.kind[i] === D_SPLAT ? Math.min(1, (1 - t) * 3) : (1 - t);
      }
      if (st.mix[i]) {
        if (nm >= capM) return;
        const o = nm * 4;
        MP[o] = st.x[i]; MP[o + 1] = st.y[i] + nm * 0.0004; MP[o + 2] = st.z[i]; MP[o + 3] = r;
        MC[o] = st.r[i]; MC[o + 1] = st.g[i]; MC[o + 2] = st.b[i]; MC[o + 3] = a;
        MR[o] = st.kind[i]; MR[o + 1] = st.th[i]; MR[o + 2] = st.spin[i]; MR[o + 3] = st.fill[i];
        nm++;
      } else {
        if (na >= capA) return;
        const o = na * 4;
        AP[o] = st.x[i]; AP[o + 1] = st.y[i] + 0.01 + na * 0.0004; AP[o + 2] = st.z[i]; AP[o + 3] = r;
        AC[o] = st.r[i]; AC[o + 1] = st.g[i]; AC[o + 2] = st.b[i]; AC[o + 3] = a;
        AR[o] = st.kind[i]; AR[o + 1] = st.th[i]; AR[o + 2] = st.spin[i]; AR[o + 3] = st.fill[i];
        na++;
      }
    };
    for (let i = 0; i < this.dT.n; i++) put(this.dT, i, true);
    for (let i = 0; i < this.dF.n; i++) put(this.dF, i, false);
    add.instanceCount = na;
    mix.instanceCount = nm;
    if (na) { upload(add.attributes.iPosR, na); upload(add.attributes.iCol, na); upload(add.attributes.iPar, na); }
    if (nm) { upload(mix.attributes.iPosR, nm); upload(mix.attributes.iCol, nm); upload(mix.attributes.iPar, nm); }
  }

  stepSegs(st, dt) {
    let i = 0;
    while (i < st.n) {
      st.life[i] += dt;
      if (st.life[i] >= st.max[i]) {
        st.n--;
        if (i !== st.n) {
          for (let k = 0; k < SEG_KEYS.length; k++) st[SEG_KEYS[k]][i] = st[SEG_KEYS[k]][st.n];
        }
        continue;
      }
      i++;
    }
  }

  writeSegs() {
    const mesh = this.segMesh;
    let n = 0;
    const put = (st, i, timed) => {
      if (n >= SEG_CAP) return;
      _p.set(st.ax[i], st.ay[i], st.az[i]);
      _d.set(st.bx[i] - st.ax[i], st.by[i] - st.ay[i], st.bz[i] - st.az[i]);
      const len = _d.length();
      if (!(len > 1e-4)) return;
      _d.multiplyScalar(1 / len);
      _q.setFromUnitVectors(UP, _d);
      const k = timed ? 1 - st.life[i] / st.max[i] : 1;
      const w = st.w[i] * (timed ? 0.5 + 0.5 * k : 1);
      _s.set(w, len, w);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(n, _m);
      mesh.setColorAt(n, _c.setRGB(st.r[i] * k, st.g[i] * k, st.b[i] * k));
      n++;
    };
    for (let i = 0; i < this.sT.n; i++) put(this.sT, i, true);
    for (let i = 0; i < this.sF.n; i++) put(this.sF, i, false);
    mesh.count = n;
    if (n) { mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; }
  }

  stepSolids(st, dt) {
    let i = 0;
    while (i < st.n) {
      st.life[i] += dt;
      if (st.life[i] >= st.max[i]) {
        st.n--;
        if (i !== st.n) {
          for (let k = 0; k < SOLID_KEYS.length; k++) st[SOLID_KEYS[k]][i] = st[SOLID_KEYS[k]][st.n];
        }
        continue;
      }
      st.vy[i] -= st.grav[i] * dt;
      st.x[i] += st.vx[i] * dt; st.y[i] += st.vy[i] * dt; st.z[i] += st.vz[i] * dt;
      const floor = st.sy[i] * 0.5;
      if (st.y[i] < floor) {
        st.y[i] = floor;
        if (st.vy[i] < 0) st.vy[i] *= -0.35;
        st.vx[i] *= 0.6; st.vz[i] *= 0.6;
        st.wx[i] *= 0.6; st.wy[i] *= 0.6; st.wz[i] *= 0.6;
      }
      st.rx[i] += st.wx[i] * dt; st.ry[i] += st.wy[i] * dt; st.rz[i] += st.wz[i] * dt;
      i++;
    }
  }

  writeSolids(mesh, timed, frame) {
    const cap = timed.cap;
    let n = 0;
    const put = (st, i, shrink) => {
      if (n >= cap) return;
      const k = shrink ? Math.min(1, (1 - st.life[i] / st.max[i]) * 4) : 1;
      _p.set(st.x[i], st.y[i], st.z[i]);
      _e.set(st.rx[i], st.ry[i], st.rz[i]);
      _q.setFromEuler(_e);
      _s.set(st.sx[i] * k, st.sy[i] * k, st.sz[i] * k);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(n, _m);
      mesh.setColorAt(n, _c.setRGB(st.r[i], st.g[i], st.b[i]));
      n++;
    };
    for (let i = 0; i < timed.n; i++) put(timed, i, true);
    for (let i = 0; i < frame.n; i++) put(frame, i, false);
    mesh.count = n;
    if (n) { mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; }
  }

  reset() {
    this.glowP.clear();
    this.smokeP.clear();
    this.hN = 0;
    this.dT.n = 0; this.dF.n = 0;
    this.sT.n = 0; this.sF.n = 0;
    this.rT.n = 0; this.rF.n = 0; this.gT.n = 0; this.gF.n = 0;
    this.iceN = 0;
    this.lastSync = -1;
    this.update(0, this.time);
  }

  dispose() {
    this.stage.scene.remove(this.root);
    for (const m of [this.glowMesh, this.smokeMesh, this.decalAdd, this.decalMix, this.segMesh, this.rockMesh, this.gemMesh, this.iceMesh]) {
      m.geometry.dispose();
      m.material.dispose();
    }
  }
}
