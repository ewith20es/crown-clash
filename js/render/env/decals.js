// Ground decals: the deploy-zone veil (illegal area hatched red, legal border lit) and the
// pulsing placement marker.
import * as THREE from 'three';
import { ARENA, TEAMS } from '../../config.js';
import { WORLD_VERT, OUTPUT_GLSL } from './glsl.js';

const MAX_RECTS = 3;
const FADE_TIME = 0.15;

const VEIL_FRAG = /* glsl */ `
uniform vec4 uRects[${MAX_RECTS}];
uniform int uCount;
uniform float uTime;
uniform float uOpacity;
uniform vec3 uBad;
uniform vec3 uGood;
varying vec3 vWorld;
varying vec2 vUv;
void main() {
  vec2 p = vWorld.xz;
  float d = -100.0;
  for (int i = 0; i < ${MAX_RECTS}; i++) {
    if (i >= uCount) break;
    vec4 r = uRects[i];
    float di = min(min(p.x - r.x, r.y - p.x), min(p.y - r.z, r.w - p.y));
    d = max(d, di);
  }
  float aa = max(fwidth(d), 0.002);
  float outside = 1.0 - smoothstep(-aa, aa, d);
  float stripe = fract((p.x + p.y) * 0.85 + uTime * 0.4);
  float hatch = smoothstep(0.0, 0.08, stripe) * (1.0 - smoothstep(0.42, 0.5, stripe));
  float pulse = 0.5 + 0.5 * sin(uTime * 4.0);
  float line = 1.0 - smoothstep(0.035, 0.035 + aa * 1.5, abs(d));
  float inner = (1.0 - smoothstep(0.0, 0.7, d)) * (1.0 - outside);
  vec3 col = mix(uBad, uGood, inner);
  float a = outside * (0.26 + 0.14 * hatch) + inner * 0.16;
  col = mix(col, uGood * (1.6 + 0.4 * pulse), line);
  a = max(a, line * 0.95) * uOpacity;
  if (a < 0.004) discard;
  gl_FragColor = vec4(col, a);
  ${OUTPUT_GLSL}
}
`;

const MARKER_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uRadius;
uniform float uSize;
uniform float uTime;
uniform float uFill;
uniform float uDash;
varying vec3 vWorld;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * uSize;
  float r = length(p);
  float aa = max(fwidth(r), 0.002);
  float w = clamp(uRadius * 0.05, 0.045, 0.11);
  float ring = 1.0 - smoothstep(w, w + aa, abs(r - uRadius));
  if (uDash > 0.5 && ring > 0.0) {
    float ang = atan(p.y, p.x) / 6.2831853;
    ring *= mix(0.3, 1.0, step(0.35, fract(ang * 24.0 + uTime * 0.6)));
  }
  float pulse = 0.5 + 0.5 * sin(uTime * 5.0);
  float wave = fract(uTime * 0.9);
  float waveRing = (1.0 - smoothstep(0.0, 0.06 + aa, abs(r - uRadius * wave))) * (1.0 - wave) * 0.45;
  float inside = 1.0 - smoothstep(uRadius - aa, uRadius + aa, r);
  float fill = inside * (uFill * (0.13 + 0.07 * pulse) + 0.05);
  float glow = (1.0 - smoothstep(0.0, 0.35, abs(r - uRadius))) * 0.18;
  float a = clamp(max(ring * (0.75 + 0.25 * pulse), max(waveRing * inside, fill)) + glow, 0.0, 1.0);
  float tileEdge = max(abs(p.x), abs(p.y));
  a = max(a, 0.85 * (1.0 - smoothstep(0.025, 0.025 + aa, abs(tileEdge - 0.47))));
  if (a < 0.004) discard;
  vec3 col = uColor * (1.0 + ring * 0.8);
  gl_FragColor = vec4(col, a);
  ${OUTPUT_GLSL}
}
`;

export class DeployVeil {
  constructor(timeUniform) {
    const geo = new THREE.PlaneGeometry(2 * ARENA.HALF_W, 2 * ARENA.HALF_L, 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.uniforms = {
      uRects: { value: Array.from({ length: MAX_RECTS }, () => new THREE.Vector4()) },
      uCount: { value: 0 },
      uTime: timeUniform,
      uOpacity: { value: 0 },
      uBad: { value: new THREE.Color(1.0, 0.16, 0.12) },
      uGood: { value: new THREE.Color(TEAMS[0].glow) },
    };
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      vertexShader: WORLD_VERT,
      fragmentShader: VEIL_FRAG,
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
    }));
    this.mesh.name = 'arena-deploy-veil';
    this.mesh.position.y = 0.075;
    this.mesh.renderOrder = 5;
    this.mesh.visible = false;
    this.target = 0;
    // scratch rects for merging (no allocation per call)
    this._r = Array.from({ length: 8 }, () => ({ x0: 0, x1: 0, z0: 0, z1: 0 }));
  }

  set(zone) {
    const rects = zone && Array.isArray(zone.rects) ? zone.rects : null;
    if (!rects) { this.target = 0; return; }
    // copy valid rects, then merge neighbours that share an edge so no seam line is drawn
    let n = 0;
    for (let i = 0; i < rects.length && n < this._r.length; i++) {
      const r = rects[i];
      if (!r) continue;
      const x0 = Math.min(r.x0, r.x1), x1 = Math.max(r.x0, r.x1);
      const z0 = Math.min(r.z0, r.z1), z1 = Math.max(r.z0, r.z1);
      if (!(Number.isFinite(x0) && Number.isFinite(x1) && Number.isFinite(z0) && Number.isFinite(z1))) continue;
      const o = this._r[n++];
      o.x0 = x0; o.x1 = x1; o.z0 = z0; o.z1 = z1;
    }
    let merged = true;
    while (merged) {
      merged = false;
      for (let i = 0; i < n && !merged; i++) {
        for (let j = i + 1; j < n && !merged; j++) {
          const a = this._r[i];
          const b = this._r[j];
          const eps = 1e-4;
          const sameZ = Math.abs(a.z0 - b.z0) < eps && Math.abs(a.z1 - b.z1) < eps;
          const sameX = Math.abs(a.x0 - b.x0) < eps && Math.abs(a.x1 - b.x1) < eps;
          const touchX = Math.abs(a.x1 - b.x0) < eps || Math.abs(b.x1 - a.x0) < eps;
          const touchZ = Math.abs(a.z1 - b.z0) < eps || Math.abs(b.z1 - a.z0) < eps;
          if ((sameZ && touchX) || (sameX && touchZ)) {
            a.x0 = Math.min(a.x0, b.x0); a.x1 = Math.max(a.x1, b.x1);
            a.z0 = Math.min(a.z0, b.z0); a.z1 = Math.max(a.z1, b.z1);
            const last = this._r[n - 1];
            b.x0 = last.x0; b.x1 = last.x1; b.z0 = last.z0; b.z1 = last.z1;
            n--;
            merged = true;
          }
        }
      }
    }
    const count = Math.min(n, MAX_RECTS);
    const u = this.uniforms.uRects.value;
    for (let i = 0; i < count; i++) {
      const r = this._r[i];
      u[i].set(r.x0, r.x1, r.z0, r.z1);
    }
    this.uniforms.uCount.value = count;
    this.target = 1;
  }

  update(dt) {
    const o = this.uniforms.uOpacity;
    const step = dt / FADE_TIME;
    if (o.value < this.target) o.value = Math.min(this.target, o.value + step);
    else if (o.value > this.target) o.value = Math.max(this.target, o.value - step);
    this.mesh.visible = o.value > 0.001;
  }
}

export class PlacementMarker {
  constructor(timeUniform) {
    const geo = new THREE.PlaneGeometry(1, 1, 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.uniforms = {
      uColor: { value: new THREE.Color(TEAMS[0].glow) },
      uRadius: { value: 1 },
      uSize: { value: 3 },
      uTime: timeUniform,
      uFill: { value: 0 },
      uDash: { value: 0 },
    };
    this.okColor = new THREE.Color(TEAMS[0].glow);
    this.badColor = new THREE.Color(1.0, 0.24, 0.18);
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      vertexShader: WORLD_VERT,
      fragmentShader: MARKER_FRAG,
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
    }));
    this.mesh.name = 'arena-marker';
    this.mesh.renderOrder = 6;
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
  }

  set(m) {
    if (!m || !Number.isFinite(m.x) || !Number.isFinite(m.z)) { this.mesh.visible = false; return; }
    const radius = Number.isFinite(m.radius) && m.radius > 0.05 ? Math.min(m.radius, 30) : 0.5;
    const size = 2 * (radius + 0.5);
    this.mesh.position.set(m.x, 0.09, m.z);
    this.mesh.scale.set(size, 1, size);
    this.uniforms.uRadius.value = radius;
    this.uniforms.uSize.value = size;
    this.uniforms.uColor.value.copy(m.ok ? this.okColor : this.badColor);
    this.uniforms.uFill.value = m.kind === 'spell' ? 1 : 0;
    this.uniforms.uDash.value = m.kind === 'building' ? 1 : 0;
    this.mesh.visible = true;
  }
}
