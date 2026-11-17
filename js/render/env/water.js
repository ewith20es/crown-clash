// The aether rift: a glowing stream flowing from a central wellspring toward both ends of the
// island, where it pours off as luminous falls.
import * as THREE from 'three';
import { AETHER, ISLAND, RIFT_WATER_HALF, RIFT_WATER_Y } from './palette.js';
import { NOISE_GLSL, WORLD_VERT, OUTPUT_GLSL } from './glsl.js';

const STREAM_FRAG = /* glsl */ `
uniform float uTime;
uniform float uHalfW;
uniform vec3 uDeep;
uniform vec3 uMid;
uniform vec3 uBright;
varying vec3 vWorld;
varying vec2 vUv;
${NOISE_GLSL}
void main() {
  float s = abs(vWorld.x);
  float t = clamp(vWorld.z / uHalfW, -1.0, 1.0);
  float flow = uTime * 1.25;
  float n1 = envFbm(vec2(s * 0.55 - flow * 0.6, t * 1.4 + 3.1));
  float n2 = envFbm(vec2(s * 1.3 - flow * 1.3, t * 2.6) + n1 * 1.8);
  float ridge = clamp(1.0 - abs(n2 * 2.0 - 1.0), 0.0, 1.0);
  float streak = pow(ridge, 7.0);
  float bank = smoothstep(0.62, 1.0, abs(t));
  float foam = bank * (0.6 + 0.4 * envNoise(vec2(s * 3.0 - flow * 2.0, t * 4.0)));
  float spring = exp(-s * s * 0.9);
  vec3 col = mix(uDeep, uMid, smoothstep(0.2, 0.8, n1));
  col += uBright * (streak * 1.4 + foam * 0.9 + spring * 1.3);
  col *= 0.92 + 0.08 * sin(uTime * 2.3 + s * 1.7);
  gl_FragColor = vec4(col, 1.0);
  ${OUTPUT_GLSL}
}
`;

const FALLS_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uMid;
uniform vec3 uBright;
varying vec3 vWorld;
varying vec2 vUv;
${NOISE_GLSL}
void main() {
  float u = vUv.x;
  float v = vUv.y;
  float n = envFbm(vec2(u * 6.0, v * 2.2 - uTime * 1.6));
  float n2 = envNoise(vec2(u * 14.0, v * 5.0 - uTime * 3.1));
  float streak = smoothstep(0.45, 0.85, n * 0.8 + n2 * 0.35);
  float edge = smoothstep(0.0, 0.18, u) * (1.0 - smoothstep(0.82, 1.0, u));
  float fade = 1.0 - smoothstep(0.35, 1.0, v);
  float a = edge * fade * (0.45 + 0.55 * streak);
  if (a < 0.004) discard;
  vec3 col = mix(uMid, uBright * 1.6, streak) * (1.15 - 0.5 * v);
  gl_FragColor = vec4(col, a);
  ${OUTPUT_GLSL}
}
`;

/** Curved sheets pouring off both ends of the island (u across the stream, v down the fall). */
function buildFallsGeometry() {
  const nu = 8;
  const nv = 24;
  const drop = 9;
  const pos = [];
  const uv = [];
  const idx = [];
  let base = 0;
  for (const e of [-1, 1]) {
    for (let j = 0; j <= nv; j++) {
      const v = j / nv;
      const x = e * (ISLAND.HW - 0.02 + 1.8 * v);
      const y = RIFT_WATER_Y - drop * v * v;
      const spread = RIFT_WATER_HALF * (1 + 0.45 * v);
      for (let i = 0; i <= nu; i++) {
        const u = i / nu;
        pos.push(x, y, (u * 2 - 1) * spread);
        uv.push(u, v);
      }
    }
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const a = base + j * (nu + 1) + i;
        const b = a + nu + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    base += (nv + 1) * (nu + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

export class RiftView {
  constructor(timeUniform) {
    this.group = new THREE.Group();
    this.group.name = 'arena-rift';
    const deep = new THREE.Color(AETHER.deep);
    const mid = new THREE.Color(AETHER.mid).multiplyScalar(1.15);
    const bright = new THREE.Color(AETHER.bright);

    const streamGeo = new THREE.PlaneGeometry(2 * ISLAND.HW + 0.1, 2 * RIFT_WATER_HALF + 0.04, 1, 1);
    streamGeo.rotateX(-Math.PI / 2);
    this.stream = new THREE.Mesh(streamGeo, new THREE.ShaderMaterial({
      vertexShader: WORLD_VERT,
      fragmentShader: STREAM_FRAG,
      uniforms: {
        uTime: timeUniform,
        uHalfW: { value: RIFT_WATER_HALF },
        uDeep: { value: deep },
        uMid: { value: mid },
        uBright: { value: bright },
      },
    }));
    this.stream.position.y = RIFT_WATER_Y;
    this.stream.name = 'arena-stream';
    this.group.add(this.stream);

    this.falls = new THREE.Mesh(buildFallsGeometry(), new THREE.ShaderMaterial({
      vertexShader: WORLD_VERT,
      fragmentShader: FALLS_FRAG,
      uniforms: { uTime: timeUniform, uMid: { value: mid }, uBright: { value: bright } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    }));
    this.falls.name = 'arena-falls';
    this.falls.renderOrder = 2;
    this.group.add(this.falls);
  }
}
