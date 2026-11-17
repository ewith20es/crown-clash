// Small build-time helpers for the environment: seeded random numbers and a geometry bag
// that bakes vertex colours (and optional extra attributes) and merges everything that
// shares one material into a single draw call.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Deterministic PRNG (mulberry32) → () => [0, 1). */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable pseudo-random value in [0, 1) for a 3-D point (equal points → equal values). */
export function hash3(x, y, z) {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

const _col = new THREE.Color();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

/** Matrix from position, Euler rotation and scale (scratch matrix, copy if you keep it). */
export function trs(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(sx, sy, sz);
  return _m.compose(_p, _q, _s);
}

export class GeoBag {
  /** extra: { attributeName: itemSize } that every part will carry (filled with defaults). */
  constructor(extra = {}) {
    this.parts = [];
    this.extra = extra;
  }

  /**
   * Adds a geometry (takes ownership and disposes it).
   * color: hex | THREE.Color | (x, y, z, nx, ny, nz) => hex | null (keep an existing colour attribute)
   * opts.matrix  transform applied first
   * opts.flat    recompute faceted normals
   * opts.jitter  per-triangle brightness jitter (0..1), opts.rand = rng
   * opts[extraName] number | number[]  default value for an extra attribute missing on the geometry
   */
  add(geom, color, opts = {}) {
    const g = geom.index ? geom.toNonIndexed() : geom.clone();
    geom.dispose();
    const keep = new Set(['position', 'normal', ...Object.keys(this.extra)]);
    const hadColor = !!g.attributes.color;
    if (color == null && hadColor) keep.add('color');
    for (const name of Object.keys(g.attributes)) if (!keep.has(name)) g.deleteAttribute(name);
    g.clearGroups();
    if (opts.matrix) g.applyMatrix4(opts.matrix);
    if (opts.flat || !g.attributes.normal) g.computeVertexNormals();

    const pos = g.attributes.position;
    const nrm = g.attributes.normal;
    const n = pos.count;
    if (color != null || !hadColor) {
      const arr = new Float32Array(n * 3);
      const fixed = typeof color === 'function' ? null : _col.set(color ?? 0xffffff).clone();
      for (let i = 0; i < n; i++) {
        if (fixed) _col.copy(fixed);
        else _col.set(color(pos.getX(i), pos.getY(i), pos.getZ(i), nrm.getX(i), nrm.getY(i), nrm.getZ(i)));
        arr[i * 3] = _col.r; arr[i * 3 + 1] = _col.g; arr[i * 3 + 2] = _col.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    }
    if (opts.jitter) {
      const rand = opts.rand || Math.random;
      const c = g.attributes.color.array;
      for (let t = 0; t + 2 < n; t += 3) {
        const k = 1 + (rand() - 0.5) * opts.jitter;
        for (let v = t; v < t + 3; v++) { c[v * 3] *= k; c[v * 3 + 1] *= k; c[v * 3 + 2] *= k; }
      }
    }
    for (const [name, size] of Object.entries(this.extra)) {
      if (g.attributes[name]) continue;
      const def = opts[name] ?? 0;
      const arr = new Float32Array(n * size);
      for (let i = 0; i < n; i++) {
        for (let k = 0; k < size; k++) arr[i * size + k] = Array.isArray(def) ? (def[k] ?? 0) : def;
      }
      g.setAttribute(name, new THREE.BufferAttribute(arr, size));
    }
    this.parts.push(g);
    return g;
  }

  /** Merges everything added so far (null when empty). */
  build() {
    if (!this.parts.length) return null;
    const merged = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts.length = 0;
    if (merged) merged.computeBoundingSphere();
    return merged;
  }
}

/**
 * Material helper: patches a three.js built-in shader with a shared time uniform. `key` must be
 * unique per patch: three caches programs by onBeforeCompile's source text, which is identical
 * for every material patched through this helper.
 */
export function withTime(material, timeUniform, key, patch) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = timeUniform;
    patch(shader);
  };
  material.customProgramCacheKey = () => key;
  return material;
}
