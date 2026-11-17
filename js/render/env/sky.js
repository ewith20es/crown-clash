// Golden-hour sky: gradient dome with a soft sun, a sea of clouds below the island, drifting
// cloud puffs and a few far floating islets.
import * as THREE from 'three';
import { SKY, SKY_SUN_DIR } from './palette.js';
import { NOISE_GLSL, WORLD_VERT, OUTPUT_GLSL } from './glsl.js';
import { GeoBag, rng, hash3, trs } from './util.js';

const DOME_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
}
`;

const DOME_FRAG = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uMid;
uniform vec3 uHorizon;
uniform vec3 uBelow;
uniform vec3 uSun;
uniform vec3 uSunDir;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col;
  if (h >= 0.0) {
    col = mix(uHorizon, uMid, smoothstep(0.0, 0.28, h));
    col = mix(col, uZenith, smoothstep(0.22, 0.9, h));
  } else {
    col = mix(uHorizon, uBelow, smoothstep(0.0, 0.3, -h));
  }
  float s = max(dot(d, uSunDir), 0.0);
  float band = 1.0 - smoothstep(0.0, 0.45, abs(h));
  col += uSun * (pow(s, 5.0) * 0.32 * band + pow(s, 48.0) * 0.8 + smoothstep(0.9990, 0.9996, s) * 3.0);
  gl_FragColor = vec4(col, 1.0);
  ${OUTPUT_GLSL}
}
`;

const CLOUD_SEA_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uLit;
uniform vec3 uShade;
uniform vec3 uHaze;
varying vec3 vWorld;
varying vec2 vUv;
${NOISE_GLSL}
void main() {
  vec2 p = vWorld.xz;
  float r = length(p);
  vec2 drift = vec2(uTime * 0.9, uTime * 0.35);
  float n = envFbm((p + drift) * 0.016);
  float m = envFbm((p - drift * 0.6) * 0.045 + 7.3);
  float dens = smoothstep(0.3, 0.7, n * 0.8 + m * 0.35);
  vec3 col = mix(uShade, uLit, smoothstep(0.3, 0.9, n * 0.6 + m * 0.6));
  float far = smoothstep(260.0, 640.0, r);
  col = mix(col, uHaze, far);
  float a = dens * 0.95 * (1.0 - far);
  if (a < 0.003) discard;
  gl_FragColor = vec4(col, a);
  ${OUTPUT_GLSL}
}
`;

export class SkyView {
  constructor(timeUniform) {
    this.group = new THREE.Group();
    this.group.name = 'arena-sky';
    const rand = rng(99);
    const c = (hex) => new THREE.Color(hex);

    // dome
    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(400, 32, 16),
      new THREE.ShaderMaterial({
        vertexShader: DOME_VERT,
        fragmentShader: DOME_FRAG,
        uniforms: {
          uZenith: { value: c(SKY.zenith) },
          uMid: { value: c(SKY.mid) },
          uHorizon: { value: c(SKY.horizon) },
          uBelow: { value: c(SKY.below) },
          uSun: { value: c(SKY.sun) },
          uSunDir: { value: SKY_SUN_DIR.clone() },
        },
        side: THREE.BackSide,
        depthWrite: false,
      }),
    );
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -100;
    this.group.add(this.dome);

    // cloud sea
    const seaGeo = new THREE.PlaneGeometry(1400, 1400, 1, 1);
    seaGeo.rotateX(-Math.PI / 2);
    this.sea = new THREE.Mesh(seaGeo, new THREE.ShaderMaterial({
      vertexShader: WORLD_VERT,
      fragmentShader: CLOUD_SEA_FRAG,
      uniforms: {
        uTime: timeUniform,
        uLit: { value: c(SKY.cloudLit) },
        uShade: { value: c(SKY.cloudShade) },
        uHaze: { value: c(SKY.below) },
      },
      transparent: true,
      depthWrite: false,
    }));
    this.sea.position.y = -30;
    this.sea.renderOrder = -90;
    this.sea.frustumCulled = false;
    this.group.add(this.sea);

    // cloud puffs on a slowly turning ring
    const puffs = [];
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2 + rand() * 0.3;
      const R = 36 + rand() * 70;
      const y = -6 - rand() * 15;
      const n = 4 + Math.floor(rand() * 3);
      const base = 2.4 + rand() * 2.6;
      const tx = -Math.sin(a);
      const tz = Math.cos(a);
      for (let i = 0; i < n; i++) {
        const t = (i / (n - 1) - 0.5) * base * 2.2;
        const s = base * (1 - Math.abs(t) / (base * 2.4)) * (0.7 + rand() * 0.45);
        puffs.push({
          x: Math.cos(a) * R + tx * t + (rand() - 0.5) * base * 0.4,
          y: y + (rand() - 0.3) * s * 0.4,
          z: Math.sin(a) * R + tz * t + (rand() - 0.5) * base * 0.4,
          s,
        });
      }
    }
    const puffGeo = new THREE.IcosahedronGeometry(1, 2);
    const puffMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x5a3c46, emissiveIntensity: 0.6 });
    this.puffs = new THREE.InstancedMesh(puffGeo, puffMat, puffs.length);
    const lit = c(SKY.cloudLit);
    const shade = c(SKY.cloudShade);
    const col = new THREE.Color();
    puffs.forEach((p, i) => {
      this.puffs.setMatrixAt(i, trs(p.x, p.y, p.z, 0, rand() * 3, 0, p.s, p.s * 0.62, p.s));
      // kept below 1 after lighting so the puffs do not bloom
      col.copy(shade).lerp(lit, 0.55 + rand() * 0.45).multiplyScalar(0.72);
      this.puffs.setColorAt(i, col);
    });
    this.puffs.instanceMatrix.needsUpdate = true;
    if (this.puffs.instanceColor) this.puffs.instanceColor.needsUpdate = true;
    this.puffs.computeBoundingSphere();
    this.puffRing = new THREE.Group();
    this.puffRing.add(this.puffs);
    this.group.add(this.puffRing);

    // far islets
    const bag = new GeoBag();
    const ISLETS = [
      [-78, -9, -60, 4.0], [92, -14, -38, 3.0], [64, -4, -118, 5.0], [-120, -16, 40, 3.4], [128, -8, 70, 4.4], [-40, -20, 130, 2.6],
    ];
    for (const [x, y, z, r] of ISLETS) {
      const rock = new THREE.CylinderGeometry(r, r * 0.08, r * 2.2, 9, 3);
      const p = rock.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
        const k = 1 + (hash3(vx + x, vy, vz + z) - 0.5) * 0.35;
        p.setXYZ(i, vx * k, vy, vz * k);
      }
      bag.add(rock, (px, py) => (py > y - r * 0.3 ? 0x9b7350 : 0x5e4a5e), {
        matrix: trs(x, y - r * 1.1, z, 0, rand() * 3, 0), flat: true, jitter: 0.15, rand,
      });
      bag.add(new THREE.CylinderGeometry(r * 1.04, r * 0.98, r * 0.18, 9, 1), 0x4f9a55, {
        matrix: trs(x, y + r * 0.05, z, 0, rand() * 3, 0), flat: true, jitter: 0.1, rand,
      });
      const trees = 1 + Math.floor(rand() * 3);
      for (let t = 0; t < trees; t++) {
        const a = rand() * Math.PI * 2;
        const d = rand() * r * 0.55;
        const s = r * (0.22 + rand() * 0.12);
        const tx = x + Math.cos(a) * d;
        const tz = z + Math.sin(a) * d;
        bag.add(new THREE.CylinderGeometry(s * 0.12, s * 0.18, s * 1.2, 5), 0x6e4c34, { matrix: trs(tx, y + r * 0.1 + s * 0.6, tz), flat: true });
        bag.add(new THREE.IcosahedronGeometry(s * 0.8, 0), [0x3aa596, 0xddb03c, 0xe98aa9][t % 3], {
          matrix: trs(tx, y + r * 0.1 + s * 1.6, tz), flat: true,
        });
      }
    }
    this.islets = new THREE.Mesh(bag.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 }));
    this.isletRing = new THREE.Group();
    this.isletRing.add(this.islets);
    this.group.add(this.isletRing);
  }

  update(dt, time, camera) {
    if (camera) this.dome.position.copy(camera.position);
    this.puffRing.rotation.y = time * 0.008;
    this.isletRing.rotation.y = -time * 0.003;
    this.isletRing.position.y = Math.sin(time * 0.25) * 0.6;
  }
}
