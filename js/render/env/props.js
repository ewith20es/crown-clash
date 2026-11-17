// Static scenery of the island: rift masonry, bridges, tower plinths, curb, rocks, trees,
// hedges, crystals, banners and lanterns. Everything is merged per material:
//   stone (vertex-coloured masonry, wood, metal)  → 1 draw
//   crystal (emissive, twinkling)                 → 1 draw
//   cloth (waving banners)                        → 1 draw
//   foliage (instanced blobs: canopies, hedge)    → 1 draw
import * as THREE from 'three';
import { ARENA, TEAMS, towerPosition } from '../../config.js';
import { ISLAND } from './palette.js';
import { GeoBag, rng, hash3, trs, withTime } from './util.js';

const C = {
  stone: 0xd9c49c,
  stoneDark: 0xa58c66,
  paving: 0xead3a2,
  wetStone: 0x7d7a74,
  wood: 0x6a4a32,
  bark: 0x6e4c34,
  metal: 0x3e3a46,
  gold: 0xe4b64a,
  rock: 0xa09078,
  cyan: 0x46e0ff,
  azure: 0x3d9dff,
  ember: 0xff8a3a,
  lantern: 0xffc35a,
};

const TREE_PAL = {
  teal: [0x2e8f84, 0x3aa596, 0x5cc2b0],
  gold: [0xc8962a, 0xddb03c, 0xf0cc60],
  pink: [0xd8678f, 0xe98aa9, 0xf6b0c6],
  green: [0x3f8f45, 0x55a557, 0x74be6c],
};

// [x, z, scale, palette] — sides and far end only; the camera end (z > 15) stays low.
const TREES = [
  [10.45, 13.4, 0.9, 'teal'], [10.55, 9.6, 1.0, 'green'], [10.4, 6.6, 0.8, 'teal'], [10.5, 3.3, 0.95, 'pink'], [10.45, -3.4, 0.9, 'gold'], [10.55, -6.9, 1.0, 'green'], [10.4, -10.2, 0.85, 'pink'], [10.5, -13.6, 1.0, 'gold'], [-8.4, -16.5, 1.05, 'gold'], [-5.4, -16.9, 0.9, 'pink'], [5.6, -16.8, 0.95, 'teal'], [8.6, -16.4, 1.1, 'gold'],
];

// [x, z, size, colour]
const CLUSTERS = [
  [10.65, 1.75, 0.95, C.cyan], [-10.65, 1.75, 0.9, C.cyan], [10.6, -1.75, 0.9, C.cyan], [-10.6, -1.8, 0.95, C.cyan],
  [10.7, 8.1, 0.85, C.azure], [-10.7, 8.2, 0.9, C.azure], [10.7, -8.1, 0.9, C.ember], [-10.7, -8.2, 0.85, C.ember],
  [0, -16.9, 1.7, C.cyan], [-9.9, -16.3, 1.0, C.ember], [9.9, -16.2, 1.05, C.ember],
  [6.2, 16.7, 0.55, C.azure], [-6.2, 16.75, 0.55, C.azure], [0, 16.95, 0.5, C.cyan],
  [-9.9, 16.45, 0.6, C.azure], [9.9, 16.4, 0.6, C.azure],
];

// [x, z, poleHeight, flagW, flagH, team]
const FLAGS = [
  [10.75, 4.8, 2.7, 1.05, 0.62, 0], [-10.75, 4.8, 2.7, 1.05, 0.62, 0],
  [10.75, 11.6, 2.9, 1.1, 0.64, 0], [-10.75, 11.6, 2.9, 1.1, 0.64, 0],
  [10.75, -4.9, 2.7, 1.05, 0.62, 1], [-10.75, -4.9, 2.7, 1.05, 0.62, 1],
  [10.75, -11.7, 2.9, 1.1, 0.64, 1], [-10.75, -11.7, 2.9, 1.1, 0.64, 1],
  [-2.9, -16.5, 3.4, 1.2, 0.72, 1], [2.9, -16.5, 3.4, 1.2, 0.72, 1],
  // camera end: short pennants (total height < 1.2)
  [-3.6, 16.6, 1.0, 0.42, 0.26, 0], [3.6, 16.6, 1.0, 0.42, 0.26, 0],
];

// [x, z, height]
const LANTERNS = [
  [10.3, 2.4, 1.5], [-10.3, 2.4, 1.5], [10.3, -2.4, 1.5], [-10.3, -2.4, 1.5],
  [-1.5, -16.3, 1.8], [1.5, -16.3, 1.8],
  [-1.7, 16.3, 1.0], [1.7, 16.3, 1.0],
];

function addBox(bag, w, h, d, x, y, z, color, opts = {}) {
  bag.add(new THREE.BoxGeometry(w, h, d), color, { ...opts, matrix: trs(x, y, z, 0, opts.ry || 0, 0) });
}

/** Hexagonal crystal (prism + pointed tip), base at the origin before the transform. */
function addCrystal(bag, x, y, z, h, w, rx, ry, rz, color, tw) {
  const body = new THREE.CylinderGeometry(w * 0.82, w, h * 0.7, 6, 1);
  body.translate(0, h * 0.35, 0);
  const tip = new THREE.ConeGeometry(w * 0.82, h * 0.3, 6, 1);
  tip.translate(0, h * 0.85, 0);
  const m = trs(x, y, z, rx, ry, rz).clone();
  bag.add(body, color, { matrix: m, flat: true, aTw: tw });
  bag.add(tip, color, { matrix: m, flat: true, aTw: tw });
}

function addCluster(bag, rand, x, y, z, size, color, n = 5, down = false) {
  for (let i = 0; i < n; i++) {
    const main = i === 0;
    const h = size * (main ? 1 : 0.4 + rand() * 0.45);
    const w = h * (0.15 + rand() * 0.06);
    const a = rand() * Math.PI * 2;
    const tilt = main ? rand() * 0.12 : 0.25 + rand() * 0.45;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const ox = main ? 0 : dx * size * 0.17;
    const oz = main ? 0 : dz * size * 0.17;
    const rx = tilt * dz + (down ? Math.PI : 0);
    const rz = -tilt * dx;
    addCrystal(bag, x + ox, y, z + oz, h, w, rx, rand() * Math.PI, rz, color, rand() * Math.PI * 2);
  }
}

function addRock(bag, rand, x, z, s, sy, y0 = 0) {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
    const k = 1 + (hash3(vx * 3.1 + x, vy * 3.1, vz * 3.1 + z) - 0.5) * 0.45;
    p.setXYZ(i, vx * k, vy * k, vz * k);
  }
  const shade = 0.85 + rand() * 0.25;
  const c = new THREE.Color(C.rock).multiplyScalar(shade);
  bag.add(g, c, {
    matrix: trs(x, y0 + s * sy * 0.3, z, 0, rand() * Math.PI * 2, 0, s, s * sy, s),
    flat: true, jitter: 0.12, rand,
  });
}

function addBridge(stone, crystal, rand, cx) {
  const shape = new THREE.Shape();
  shape.moveTo(-1.5, 0.03);
  shape.lineTo(-1.5, -0.62);
  shape.lineTo(-0.88, -0.62);
  shape.absellipse(0, -0.62, 0.88, 0.54, Math.PI, 0, true);
  shape.lineTo(1.5, -0.62);
  shape.lineTo(1.5, 0.03);
  shape.lineTo(-1.5, 0.03);
  const g = new THREE.ExtrudeGeometry(shape, { depth: 2.7, bevelEnabled: false, curveSegments: 10 });
  g.rotateY(Math.PI / 2);          // shape x → world −z, extrusion → world +x
  g.translate(cx - 1.35, 0, 0);
  stone.add(g, (x, y, z, nx, ny) => (ny > 0.9 && y > 0 ? C.paving : y < -0.3 ? C.wetStone : C.stone), {
    flat: true, jitter: 0.06, rand,
  });
  // deck paving slabs (top at y = 0.05)
  for (let k = 0; k < 6; k++) {
    addBox(stone, 2.5, 0.03, 0.47, cx, 0.035, -1.25 + k * 0.5, C.paving, { jitter: 0.1, rand });
  }
  for (const sx of [-1, 1]) {
    const px = cx + sx * 1.42;
    addBox(stone, 0.2, 0.3, 3.0, px, 0.18, 0, C.stone, { jitter: 0.06, rand });
    addBox(stone, 0.28, 0.06, 3.1, px, 0.36, 0, C.stoneDark, { jitter: 0.05, rand });
    addBox(stone, 0.06, 0.16, 0.22, cx + sx * 1.37, -0.06, 0, C.gold);   // keystone accent
    for (const sz of [-1, 1]) {
      addBox(stone, 0.34, 0.6, 0.34, px, 0.3, sz * 1.62, C.stone, { jitter: 0.06, rand });
      addBox(stone, 0.42, 0.07, 0.42, px, 0.635, sz * 1.62, C.stoneDark);
      addCrystal(crystal, px, 0.66, sz * 1.62, 0.34, 0.09, 0, rand(), 0, sz > 0 ? C.azure : C.ember, rand() * 6.28);
    }
  }
}

function addFlag(stone, crystal, cloth, rand, x, z, poleH, fw, fh, team) {
  const pal = TEAMS[team];
  stone.add(new THREE.CylinderGeometry(0.045, 0.06, poleH, 6), C.wood, { matrix: trs(x, poleH / 2, z) });
  stone.add(new THREE.CylinderGeometry(0.12, 0.15, 0.12, 8), C.stoneDark, { matrix: trs(x, 0.06, z) });
  const fin = Math.min(0.24, 0.08 + poleH * 0.05);
  addCrystal(crystal, x, poleH - 0.02, z, fin, fin * 0.32, 0, 0, 0, pal.glow, rand() * 6.28);

  const g = new THREE.PlaneGeometry(fw, fh, 8, 3);
  const pos = g.attributes.position;
  const wave = new Float32Array(pos.count * 2);
  const colors = new Float32Array(pos.count * 3);
  const phase = rand() * Math.PI * 2;
  const cMain = new THREE.Color(pal.main);
  const cTrim = new THREE.Color(pal.trim);
  const cLight = new THREE.Color(pal.light);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    let px = pos.getX(i) + fw / 2;
    const py = pos.getY(i);
    const u = px / fw;
    if (u > 0.999) px -= fw * 0.28 * (1 - Math.abs(py) / (fh / 2));    // swallow-tail
    pos.setX(i, px);
    wave[i * 2] = px;
    wave[i * 2 + 1] = phase;
    if (u < 0.13) c.copy(cTrim);
    else if (Math.abs(u - 0.5) < 0.07 && Math.abs(py) < fh * 0.25) c.copy(cLight);
    else c.copy(cMain);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('aWave', new THREE.BufferAttribute(wave, 2));
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  cloth.add(g, null, { matrix: trs(x + 0.04, poleH - fh / 2 - 0.1, z) });
}

function addLantern(stone, crystal, rand, x, z, h) {
  addBox(stone, 0.3, 0.12, 0.3, x, 0.06, z, C.stoneDark);
  addBox(stone, 0.11, h - 0.3, 0.11, x, 0.1 + (h - 0.3) / 2, z, C.metal);
  stone.add(new THREE.ConeGeometry(0.17, 0.14, 4), C.metal, { matrix: trs(x, h + 0.04, z, 0, Math.PI / 4, 0) });
  addBox(stone, 0.2, 0.03, 0.2, x, h - 0.29, z, C.metal);
  addCrystal(crystal, x, h - 0.28, z, 0.26, 0.085, 0, rand(), 0, C.lantern, rand() * 6.28);
}

/**
 * Builds every static prop. `anchors` are hanging-crystal points under the island.
 * Returns { meshes: THREE.Object3D[] } — add them to the scene; dispose geometry/material on teardown.
 */
export function buildProps({ timeUniform, anchors = [] }) {
  const rand = rng(1234);
  const stone = new GeoBag();
  const crystal = new GeoBag({ aTw: 1 });
  const cloth = new GeoBag({ aWave: 2 });
  const foliage = [];   // { x, y, z, sx, sy, sz, ry, color }
  const { HW } = ISLAND;
  const AW = ARENA.HALF_W;
  const AL = ARENA.HALF_L;

  // ── rift: channel bed (closes the island interior below the stream), walls, coping, wellspring ──
  addBox(stone, 2 * HW, 0.3, 1.9, 0, -0.52, 0, C.wetStone);
  for (const s of [-1, 1]) {
    addBox(stone, 2 * HW, 0.7, 0.06, 0, -0.3, s * 0.95, C.wetStone);
    const n = 16;
    const len = (2 * HW) / n;
    for (let i = 0; i < n; i++) {
      addBox(stone, len - 0.04, 0.1, 0.24, -HW + (i + 0.5) * len, 0.0, s * 1.03, C.stone, { jitter: 0.12, rand });
    }
  }
  addRock(stone, rand, 0, 0, 0.6, 0.55, -0.42);
  addCluster(crystal, rand, 0, -0.2, 0, 0.8, C.cyan, 6);

  // ── bridges ──
  addBridge(stone, crystal, rand, -ARENA.BRIDGE_X);
  addBridge(stone, crystal, rand, ARENA.BRIDGE_X);

  // ── tower plinths (radius = tower radius + 0.35, height 0.06) ──
  for (const team of [0, 1]) {
    for (const slot of ['left', 'right', 'citadel']) {
      const p = towerPosition(team, slot);
      const r = (slot === 'citadel' ? 1.9 : 1.4) + 0.35;
      stone.add(new THREE.CylinderGeometry(r, r + 0.06, 0.06, 40, 1),
        (x, y, z, nx, ny) => (ny > 0.9 ? C.paving : C.stoneDark), { matrix: trs(p.x, 0.03, p.z) });
      const ring = new THREE.RingGeometry(r - 0.2, r - 0.08, 40, 1);
      ring.rotateX(-Math.PI / 2);
      stone.add(ring, TEAMS[team].main, { matrix: trs(p.x, 0.066, p.z) });
    }
  }

  // ── curb just outside the play field (top at y = 0.1) ──
  const curbX = AW + 0.32;
  const curbZ = AL + 0.32;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const z0 = 1.15;
      const z1 = curbZ + 0.11;
      const n = 10;
      const len = (z1 - z0) / n;
      for (let i = 0; i < n; i++) {
        addBox(stone, 0.22, 0.12, len - 0.04, sx * curbX, 0.04, sz * (z0 + (i + 0.5) * len), C.stone, { jitter: 0.1, rand });
      }
    }
  }
  for (const sz of [-1, 1]) {
    const n = 13;
    const x0 = -(curbX + 0.11);
    const len = (2 * -x0) / n;
    for (let i = 0; i < n; i++) {
      addBox(stone, len - 0.04, 0.12, 0.22, x0 + (i + 0.5) * len, 0.04, sz * curbZ, C.stone, { jitter: 0.1, rand });
    }
  }

  // ── rocks ──
  for (let i = 0; i < 12; i++) {
    const sx = i % 2 ? 1 : -1;
    let z = (rand() * 2 - 1) * 15.5;
    if (Math.abs(z) < 2.8) z += Math.sign(z || 1) * 2.8;
    addRock(stone, rand, sx * (10.35 + rand() * 0.6), z, 0.22 + rand() * 0.3, 0.6 + rand() * 0.3);
  }
  for (let i = 0; i < 7; i++) {
    addRock(stone, rand, (rand() * 2 - 1) * 9.5, -16.1 - rand() * 1.3, 0.28 + rand() * 0.35, 0.6 + rand() * 0.3);
  }
  for (let i = 0; i < 7; i++) {
    addRock(stone, rand, (rand() * 2 - 1) * 9.5, 16.0 + rand() * 1.3, 0.14 + rand() * 0.14, 0.55 + rand() * 0.2);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) addRock(stone, rand, sx * 10.75, sz * 1.25, 0.28, 0.7);

  // ── trees: trunks into the stone bag, canopies as foliage instances ──
  for (const [x, z, s, palName] of TREES) {
    const pal = TREE_PAL[palName];
    const th = 1.1 * s;
    stone.add(new THREE.CylinderGeometry(0.1 * s, 0.17 * s, th, 6), C.bark, { matrix: trs(x, th / 2, z, 0, rand() * 3, 0), flat: true });
    const a = rand() * Math.PI * 2;
    foliage.push({ x, y: th + 0.5 * s, z, sx: 0.95 * s, sy: 0.78 * s, sz: 0.95 * s, ry: rand() * 3, color: pal[0] });
    foliage.push({ x: x + Math.cos(a) * 0.28 * s, y: th + 1.08 * s, z: z + Math.sin(a) * 0.28 * s, sx: 0.7 * s, sy: 0.6 * s, sz: 0.7 * s, ry: rand() * 3, color: pal[1] });
    foliage.push({ x: x - Math.cos(a) * 0.12 * s, y: th + 1.52 * s, z: z - Math.sin(a) * 0.12 * s, sx: 0.44 * s, sy: 0.4 * s, sz: 0.44 * s, ry: rand() * 3, color: pal[2] });
  }

  // ── hedge (top ≤ 0.45, lower toward the camera) with flowers ──
  const hedgeCols = [0x2f7a3e, 0x357f42, 0x3c8c48, 0x2c7039];
  const flowerCols = [
    [TEAMS[0].light, TEAMS[0].glow, 0xffffff, 0xffe27a],
    [TEAMS[1].light, TEAMS[1].glow, 0xffffff, 0xff9ec4],
  ];
  const hedgeX = AW + 0.72;
  const hedgeZ = AL + 0.72;
  const hedge = (x, z, sy) => {
    const sxz = 0.32 + rand() * 0.07;
    foliage.push({ x, y: sy * 0.6, z, sx: sxz, sy, sz: sxz, ry: rand() * 3, color: hedgeCols[Math.floor(rand() * hedgeCols.length)] });
    if (rand() < 0.34) {
      const cols = flowerCols[z > 0 ? 0 : 1];
      const fs = 0.07 + rand() * 0.04;
      foliage.push({
        x: x + (rand() - 0.5) * 0.3, y: sy * 1.5, z: z + (rand() - 0.5) * 0.3,
        sx: fs, sy: fs, sz: fs, ry: rand() * 3, color: cols[Math.floor(rand() * cols.length)],
      });
    }
  };
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      for (let z = 1.6; z <= AL + 0.35; z += 0.6) hedge(sx * hedgeX + (rand() - 0.5) * 0.08, sz * z, 0.27);
    }
  }
  for (const sz of [-1, 1]) {
    for (let x = -hedgeX; x <= hedgeX + 1e-3; x += 0.6) hedge(x, sz * hedgeZ + (rand() - 0.5) * 0.08, sz > 0 ? 0.23 : 0.28);
  }

  // ── crystals ──
  for (const [x, z, size, col] of CLUSTERS) addCluster(crystal, rand, x, 0, z, size, col, size > 1.2 ? 7 : 5);
  for (const a of anchors) addCluster(crystal, rand, a.x, a.y, a.z, a.size, C.cyan, 4, true);

  // ── banners and lanterns ──
  for (const [x, z, h, fw, fh, team] of FLAGS) addFlag(stone, crystal, cloth, rand, x, z, h, fw, fh, team);
  for (const [x, z, h] of LANTERNS) addLantern(stone, crystal, rand, x, z, h);

  // ── meshes ──
  const meshes = [];

  const stoneMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0 });
  const stoneMesh = new THREE.Mesh(stone.build(), stoneMat);
  stoneMesh.name = 'arena-stone';
  stoneMesh.castShadow = false;   // the shadow map is reserved for towers and troops
  stoneMesh.receiveShadow = true;
  meshes.push(stoneMesh);

  const crystalMat = withTime(new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.16, metalness: 0.2, flatShading: true,
    emissive: 0xffffff, emissiveIntensity: 1.15,
  }), timeUniform, 'arena-crystal', (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aTw;\nvarying float vTw;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vTw = aTw;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying float vTw;')
      .replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n  totalEmissiveRadiance *= vColor.rgb * (0.7 + 0.3 * sin(uTime * 1.8 + vTw));');
  });
  const crystalMesh = new THREE.Mesh(crystal.build(), crystalMat);
  crystalMesh.name = 'arena-crystal';
  crystalMesh.castShadow = false;   // the shadow map is reserved for towers and troops
  meshes.push(crystalMesh);

  const clothMat = withTime(new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.78, metalness: 0, side: THREE.DoubleSide,
  }), timeUniform, 'arena-cloth', (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute vec2 aWave;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  float wv = sin(uTime * 3.4 + aWave.y + aWave.x * 4.2) * 0.12 + sin(uTime * 5.3 + aWave.y * 1.7 + aWave.x * 7.0) * 0.035;
  transformed += objectNormal * wv * aWave.x;
  transformed.y -= 0.05 * aWave.x * aWave.x;`);
  });
  const clothMesh = new THREE.Mesh(cloth.build(), clothMat);
  clothMesh.name = 'arena-cloth';
  clothMesh.castShadow = false;   // the shadow map is reserved for towers and troops
  meshes.push(clothMesh);

  const blob = new THREE.IcosahedronGeometry(1, 1);
  const foliageMat = withTime(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, metalness: 0, flatShading: true }),
    timeUniform, 'arena-foliage', (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
  float swayPh = instanceMatrix[3].x * 0.9 + instanceMatrix[3].z * 0.7;
#else
  float swayPh = 0.0;
#endif
  float swayK = max(position.y + 0.6, 0.0);
  transformed.x += sin(uTime * 1.4 + swayPh) * 0.045 * swayK;
  transformed.z += cos(uTime * 1.1 + swayPh * 1.3) * 0.03 * swayK;`);
    });
  const foliageMesh = new THREE.InstancedMesh(blob, foliageMat, foliage.length);
  foliageMesh.name = 'arena-foliage';
  const col = new THREE.Color();
  foliage.forEach((f, i) => {
    foliageMesh.setMatrixAt(i, trs(f.x, f.y, f.z, (rand() - 0.5) * 0.3, f.ry, (rand() - 0.5) * 0.3, f.sx, f.sy, f.sz));
    col.setHex(f.color).multiplyScalar(0.92 + rand() * 0.16);
    foliageMesh.setColorAt(i, col);
  });
  foliageMesh.instanceMatrix.needsUpdate = true;
  if (foliageMesh.instanceColor) foliageMesh.instanceColor.needsUpdate = true;
  foliageMesh.computeBoundingSphere();
  foliageMesh.castShadow = false;   // the shadow map is reserved for towers and troops
  foliageMesh.receiveShadow = true;
  meshes.push(foliageMesh);

  return { meshes };
}
