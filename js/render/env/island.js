// The floating island: its outline, the flat turf top and the rocky underside.
import * as THREE from 'three';
import { ISLAND } from './palette.js';
import { rng } from './util.js';

function linspace(a, b, step) {
  const n = Math.max(1, Math.ceil(Math.abs(b - a) / step));
  const out = [];
  for (let i = 0; i <= n; i++) out.push(a + ((b - a) * i) / n);
  return out;
}

function uniqSorted(values) {
  const s = [...values].sort((p, q) => p - q);
  const out = [];
  for (const v of s) if (!out.length || Math.abs(v - out[out.length - 1]) > 1e-4) out.push(v);
  return out;
}

// Extra outline samples on the long sides so the rift notch and its coping line up exactly.
const BREAKS = [0, 0.3, 0.6, 0.9, 0.92, 1.0, 1.12];
const NOTCH_HALF = 0.9;

/**
 * Rounded-rectangle outline of the island top, counter-clockwise in (x, z) (angle measured from
 * +x toward +z), starting at (hw, 0). Points at z = ±1 exist on both long sides.
 */
export function islandOutline(hw = ISLAND.HW, hl = ISLAND.HL, r = ISLAND.CORNER) {
  const pts = [];
  const side = uniqSorted([...linspace(-(hl - r), hl - r, 1.15), ...BREAKS, ...BREAKS.map((v) => -v)]);
  const arc = (cx, cz, a0) => {
    for (let k = 1; k < 7; k++) {
      const a = a0 + (k / 7) * (Math.PI / 2);
      pts.push({ x: cx + r * Math.cos(a), z: cz + r * Math.sin(a) });
    }
  };
  for (const z of side) if (z >= 0) pts.push({ x: hw, z });
  arc(hw - r, hl - r, 0);
  for (const x of linspace(hw - r, -(hw - r), 1.15)) pts.push({ x, z: hl });
  arc(-(hw - r), hl - r, Math.PI / 2);
  for (let i = side.length - 1; i >= 0; i--) pts.push({ x: -hw, z: side[i] });
  arc(-(hw - r), -(hl - r), Math.PI);
  for (const x of linspace(-(hw - r), hw - r, 1.15)) pts.push({ x, z: -hl });
  arc(hw - r, -(hl - r), 1.5 * Math.PI);
  for (const z of side) if (z < 0) pts.push({ x: hw, z });
  return pts;
}

/**
 * Flat turf top (y = 0) as two pieces, z ≥ 1 and z ≤ −1 (the rift channel runs between them).
 * UVs map the whole island rectangle onto the turf texture: u = (x + HW) / 2HW,
 * v = 1 − (z + HL) / 2HL (canvas row 0 is the far, −z end).
 */
export function buildTurfGeometry(outline) {
  const { HW, HL } = ISLAND;
  const halves = [];
  for (const north of [true, false]) {
    const pts = outline.filter((p) => (north ? p.z >= 1 - 1e-6 : p.z <= -1 + 1e-6));
    const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, -p.z)));
    const g = new THREE.ShapeGeometry(shape, 1);
    g.rotateX(-Math.PI / 2);
    halves.push(g);
  }
  const merged = mergeIndexed(halves);
  const pos = merged.attributes.position;
  const uv = merged.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, 0);
    uv.setXY(i, (pos.getX(i) + HW) / (2 * HW), 1 - (pos.getZ(i) + HL) / (2 * HL));
  }
  merged.computeVertexNormals();
  merged.computeBoundingSphere();
  return merged;
}

function mergeIndexed(geoms) {
  let vCount = 0;
  let iCount = 0;
  for (const g of geoms) { vCount += g.attributes.position.count; iCount += g.index.count; }
  const pos = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const idx = new Uint32Array(iCount);
  let vo = 0;
  let io = 0;
  for (const g of geoms) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      pos[(vo + i) * 3] = p.getX(i); pos[(vo + i) * 3 + 1] = p.getY(i); pos[(vo + i) * 3 + 2] = p.getZ(i);
    }
    for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.getX(i) + vo;
    vo += p.count;
    io += g.index.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(vCount * 3), 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

const RINGS = [
  { y: 0.0, s: 1.0, amp: 0.0, yj: 0.0, col: 0x4f9a50 },
  { y: -0.2, s: 1.0, amp: 0.05, yj: 0.0, col: 0x3a7a40 },
  { y: -0.8, s: 1.0, amp: 0.3, yj: 0.1, col: 0x7b5a3a },
  { y: -2.0, s: 0.94, amp: 0.6, yj: 0.25, col: 0xb58a5a },
  { y: -3.5, s: 0.8, amp: 0.85, yj: 0.35, col: 0xa47a4e },
  { y: -5.4, s: 0.6, amp: 1.0, yj: 0.45, col: 0x83604a },
  { y: -7.4, s: 0.38, amp: 0.9, yj: 0.45, col: 0x5e4654 },
  { y: -9.2, s: 0.17, amp: 0.6, yj: 0.35, col: 0x463a5a },
];
const APEX = { x: 0.25, y: -11.2, z: -0.5, col: 0x3a3152 };
const NOTCH_COL = 0x56707e;

/**
 * Rocky underside hanging below the turf: rings of the outline tapering downward with radial
 * noise, faceted, vertex-coloured from grass lip to violet base. A notch at both rift ends lets
 * the aether pour off the island. Returns { geometry, anchors } where anchors are points on the
 * lower rock surface for hanging crystals.
 */
export function buildRockGeometry(outline, seed = 7) {
  const rand = rng(seed);
  const { HW } = ISLAND;
  const N = outline.length;
  const normals = outline.map((p, i) => {
    const a = outline[(i - 1 + N) % N];
    const b = outline[(i + 1) % N];
    const tx = b.x - a.x;
    const tz = b.z - a.z;
    const l = Math.hypot(tx, tz) || 1;
    return { x: tz / l, z: -tx / l };
  });

  const col = new THREE.Color();
  const verts = RINGS.map((ring, k) => outline.map((p, i) => {
    const a = (i / N) * Math.PI * 2;
    const notch = k <= 1 && Math.abs(p.x) >= HW - 1e-3 && Math.abs(p.z) <= NOTCH_HALF + 1e-6;
    const wave = 0.5 + 0.5 * (0.5 * Math.sin(3 * a + 1.7 * k) + 0.3 * Math.sin(7 * a + 2.9 * k + 1) + 0.2 * Math.sin(13 * a + 0.7 * k + 2));
    const n = ring.amp * Math.max(0, wave + (rand() - 0.5) * 0.35);
    const x = p.x * ring.s + normals[i].x * n;
    const z = p.z * ring.s + normals[i].z * n;
    let y = ring.y + (rand() - 0.5) * 2 * ring.yj;
    if (notch) y = k === 0 ? -0.45 : -0.6;
    col.setHex(notch ? NOTCH_COL : ring.col);
    const k2 = (0.9 + rand() * 0.2) * (k >= 3 ? 0.9 + 0.1 * Math.sin(y * 3.1 + a * 2) : 1);
    return { x, y, z, r: col.r * k2, g: col.g * k2, b: col.b * k2 };
  }));

  const pos = [];
  const cols = [];
  const tri = (A, B, C, refY) => {
    // Orientation check: the face normal must point away from the island's vertical axis.
    const ux = B.x - A.x, uy = B.y - A.y, uz = B.z - A.z;
    const vx = C.x - A.x, vy = C.y - A.y, vz = C.z - A.z;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const cx = (A.x + B.x + C.x) / 3;
    const cz = (A.z + B.z + C.z) / 3;
    if (nx * cx + ny * refY + nz * cz < 0) { const t = B; B = C; C = t; }
    for (const V of [A, B, C]) { pos.push(V.x, V.y, V.z); cols.push(V.r, V.g, V.b); }
  };
  for (let k = 0; k < RINGS.length - 1; k++) {
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      const A = verts[k][i], B = verts[k + 1][i], C = verts[k][j], D = verts[k + 1][j];
      tri(A, C, B, 0);
      tri(C, D, B, 0);
    }
  }
  col.setHex(APEX.col);
  const apex = { x: APEX.x, y: APEX.y, z: APEX.z, r: col.r, g: col.g, b: col.b };
  const last = verts[RINGS.length - 1];
  for (let i = 0; i < N; i++) tri(last[i], last[(i + 1) % N], apex, -40);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();

  const anchors = [];
  for (let c = 0; c < 9; c++) {
    const k = 4 + Math.floor(rand() * 4);
    const v = verts[Math.min(k, RINGS.length - 1)][Math.floor(rand() * N)];
    anchors.push({ x: v.x * 0.94, y: v.y + 0.25, z: v.z * 0.94, size: 0.7 + rand() * 0.8 });
  }
  anchors.push({ x: APEX.x, y: APEX.y + 0.5, z: APEX.z, size: 1.8 });
  return { geometry: g, anchors };
}
