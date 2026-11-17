// Procedural turf texture: meadow margins, one-tile checker on the play field tinted per team,
// paved sandstone lanes / citadel courts and team trim lines.
import * as THREE from 'three';
import { ARENA, TEAMS, towerPosition } from '../../config.js';
import { ISLAND } from './palette.js';
import { rng } from './util.js';

const PPU = 40; // texture pixels per world unit

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined' && typeof document === 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function hex(c) {
  return '#' + c.toString(16).padStart(6, '0');
}

function rgba(c, a) {
  return `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;
}

/** Paints the turf and returns the canvas (size ≈ 900 × 1420). */
export function paintTurfCanvas(seed = 11) {
  const rand = rng(seed);
  const { HW, HL } = ISLAND;
  const W = Math.round(2 * HW * PPU);
  const H = Math.round(2 * HL * PPU);
  const cv = makeCanvas(W, H);
  const g = cv.getContext('2d');
  const X = (x) => (x + HW) * PPU;
  const Z = (z) => (z + HL) * PPU;
  const AW = ARENA.HALF_W;
  const AL = ARENA.HALF_L;

  // 1 — meadow base with soft mottling
  g.fillStyle = '#4b9658';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 420; i++) {
    const x = rand() * W;
    const y = rand() * H;
    const r = (0.5 + rand() * 1.6) * PPU;
    const light = rand() < 0.5;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, light ? 'rgba(150,210,120,0.10)' : 'rgba(20,70,40,0.10)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  // team tint on each half's meadow
  g.fillStyle = rgba(TEAMS[0].main, 0.05);
  g.fillRect(0, Z(0), W, H - Z(0));
  g.fillStyle = rgba(TEAMS[1].glow, 0.05);
  g.fillRect(0, 0, W, Z(0));

  // 2 — play-field checker (two close greens per team, slight per-tile variation)
  const tiles = [
    // team 1 (−z, Ember): warmer yellow-green
    { a: [96, 44, 47], b: [96, 42, 43] },
    // team 0 (+z, Azure): cooler teal-green
    { a: [138, 38, 47], b: [138, 36, 43] },
  ];
  for (let iz = -AL; iz < AL; iz++) {
    if (iz >= -ARENA.RIFT_HALF && iz < ARENA.RIFT_HALF) continue;
    const pal = iz >= 0 ? tiles[1] : tiles[0];
    for (let ix = -AW; ix < AW; ix++) {
      const odd = ((ix + iz) & 1) !== 0;
      const [h, s, l] = odd ? pal.b : pal.a;
      const j = (rand() - 0.5) * 2.4;
      g.fillStyle = `hsl(${h + (rand() - 0.5) * 3}, ${s}%, ${l + j}%)`;
      g.fillRect(X(ix), Z(iz), PPU + 0.5, PPU + 0.5);
    }
  }

  // grass speckle over everything
  for (let i = 0; i < 26000; i++) {
    const x = rand() * W;
    const y = rand() * H;
    const v = rand();
    g.fillStyle = v < 0.5 ? 'rgba(20,60,30,0.16)' : 'rgba(210,250,170,0.11)';
    g.fillRect(x, y, 1.2, 2.2 + rand() * 1.6);
  }

  // 3 — soft dark vignette along the play-field edges and the rift banks
  const edge = (x0, y0, x1, y1, rx, ry, rw, rh, a) => {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, `rgba(8,40,22,${a})`);
    gr.addColorStop(1, 'rgba(8,40,22,0)');
    g.fillStyle = gr;
    g.fillRect(rx, ry, rw, rh);
  };
  const v = 1.3 * PPU;
  edge(X(-AW), 0, X(-AW) + v, 0, X(-AW), Z(-AL), v, Z(AL) - Z(-AL), 0.3);
  edge(X(AW), 0, X(AW) - v, 0, X(AW) - v, Z(-AL), v, Z(AL) - Z(-AL), 0.3);
  edge(0, Z(-AL), 0, Z(-AL) + v, X(-AW), Z(-AL), X(AW) - X(-AW), v, 0.3);
  edge(0, Z(AL), 0, Z(AL) - v, X(-AW), Z(AL) - v, X(AW) - X(-AW), v, 0.3);
  edge(0, Z(1), 0, Z(1) + v * 0.7, X(-HW), Z(1), W, v * 0.7, 0.35);
  edge(0, Z(-1), 0, Z(-1) - v * 0.7, X(-HW), Z(-1) - v * 0.7, W, v * 0.7, 0.35);

  // 4 — paved lanes and courts: mask → brick layer → composite with a soft drop shadow
  const mask = makeCanvas(W, H);
  const m = mask.getContext('2d');
  m.fillStyle = '#fff';
  m.strokeStyle = '#fff';
  m.lineCap = 'round';
  const laneHalf = 1.05;
  for (const team of [0, 1]) {
    const sgn = team === 0 ? 1 : -1;
    const cit = towerPosition(team, 'citadel');
    for (const slot of ['left', 'right']) {
      const sp = towerPosition(team, slot);
      const z0 = Math.min(sgn * 1.0, sp.z);
      const z1 = Math.max(sgn * 1.0, sp.z);
      roundRect(m, X(sp.x - laneHalf), Z(z0), 2 * laneHalf * PPU, (z1 - z0) * PPU, 0.25 * PPU);
      m.fill();
      m.beginPath();
      m.arc(X(sp.x), Z(sp.z), 2.35 * PPU, 0, Math.PI * 2);
      m.fill();
      m.lineWidth = 1.0 * PPU;
      m.beginPath();
      m.moveTo(X(cit.x), Z(cit.z));
      m.lineTo(X(sp.x), Z(sp.z));
      m.stroke();
    }
    m.beginPath();
    m.arc(X(cit.x), Z(cit.z), 2.9 * PPU, 0, Math.PI * 2);
    m.fill();
  }

  const layer = makeCanvas(W, H);
  const b = layer.getContext('2d');
  b.fillStyle = '#9e7c4f';
  b.fillRect(0, 0, W, H);
  const bw = 0.5 * PPU;
  const bh = 0.5 * PPU;
  for (let row = 0; row * bh < H; row++) {
    const off = (row & 1) ? bw * 0.5 : 0;
    for (let x = -off; x < W; x += bw) {
      const l = 74 + (rand() - 0.5) * 9;
      const h = 36 + (rand() - 0.5) * 8;
      b.fillStyle = `hsl(${h}, ${48 + (rand() - 0.5) * 10}%, ${l}%)`;
      b.fillRect(x + 1.2, row * bh + 1.2, bw - 2.4, bh - 2.4);
      if (rand() < 0.35) {
        b.fillStyle = 'rgba(255,248,225,0.35)';
        b.fillRect(x + 2, row * bh + 2, bw - 4, 2);
      }
    }
  }
  b.globalCompositeOperation = 'destination-in';
  b.drawImage(mask, 0, 0);
  b.globalCompositeOperation = 'source-over';

  g.save();
  g.shadowColor = 'rgba(40,28,8,0.6)';
  g.shadowBlur = 0.35 * PPU;
  g.shadowOffsetY = 0.06 * PPU;
  g.drawImage(layer, 0, 0);
  g.restore();

  // 5 — team trim lines just outside the play field
  for (const team of [0, 1]) {
    const sgn = team === 0 ? 1 : -1;
    const zIn = sgn * ARENA.RIFT_HALF;
    const zOut = sgn * (AL + 0.12);
    const za = Math.min(zIn, zOut);
    const zb = Math.max(zIn, zOut);
    g.fillStyle = rgba(TEAMS[team].main, 0.85);
    const t = 0.09 * PPU;
    g.fillRect(X(-AW - 0.12) - t / 2, Z(za), t, (zb - za) * PPU);
    g.fillRect(X(AW + 0.12) - t / 2, Z(za), t, (zb - za) * PPU);
    g.fillRect(X(-AW - 0.12), Z(zOut) - t / 2, (2 * AW + 0.24) * PPU, t);
  }

  // 6 — flowers on the meadow margins (outside the play field and the hedge)
  const flowerCols = [
    [hex(TEAMS[0].light), hex(TEAMS[0].glow), '#ffffff', '#ffe27a'],
    [hex(TEAMS[1].light), hex(TEAMS[1].glow), '#ffffff', '#ff9ec4'],
  ];
  for (let i = 0; i < 1500; i++) {
    const x = (rand() * 2 - 1) * (HW - 0.2);
    const z = (rand() * 2 - 1) * (HL - 0.2);
    if (Math.abs(x) < AW + 0.75 && Math.abs(z) < AL + 0.75) continue;
    if (Math.abs(z) < 1.2) continue;
    const cols = flowerCols[z > 0 ? 0 : 1];
    g.fillStyle = cols[Math.floor(rand() * cols.length)];
    const r = (0.035 + rand() * 0.045) * PPU;
    g.beginPath();
    g.arc(X(x), Z(z), r, 0, Math.PI * 2);
    g.fill();
  }

  return cv;
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

export function createTurfTexture(renderer) {
  const canvas = paintTurfCanvas();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() || 1);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}
