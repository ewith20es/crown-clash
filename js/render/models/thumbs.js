// Aether Spires — card art. Renders every card's subject with a temporary renderer into a
// transparent PNG data URL: troops in a hero 3/4 pose (2–3 overlapping for multi-unit cards),
// buildings alone, spells through ICON_BUILDERS (a generic sigil until their icons exist).

import * as THREE from 'three';
import { CARDS, UNITS } from '../../data/cards.js';
import { UNIT_BUILDERS, ICON_BUILDERS } from './registry.js';
import { PAL, col, mix, defineModel, staticGroup, placeholderView, envTexture, IDLE_STATE } from './kit.js';

const FOV = 24;
const FILL = 0.8;                       // subject spans ~80% of the image
const ELEV = 0.36;                      // camera elevation (radians)
const HERO_YAW = 0.5;                   // turn the subject's face toward the right of the frame

const SPELL_HUES = {
  comet: 0xff8a3d, shardstorm: 0x7fe0ff, stasis: 0xbfefff, jolt: 0xfff06a, overclock: 0xffb03a,
  blight: 0x8ee04a, maelstrom: 0x5fd6c8, rockslide: 0xc79a62, seedpod: 0x7ed957, skyfork: 0xc9b6ff,
};

function viewFor(type, team) {
  const b = UNIT_BUILDERS[type];
  if (b) {
    try {
      const v = b(team);
      if (v && v.root) return v;
    } catch (e) {
      console.warn(`[models] ${type} failed to build; using a placeholder`, e);
    }
  }
  return placeholderView(type, team);
}

/** Fallback spell art: a rune disc with a floating crystal in the spell's colour. */
function sigil(card) {
  const kind = card.spell && card.spell.kind;
  const hue = col(SPELL_HUES[kind] !== undefined ? SPELL_HUES[kind] : 0x9fd6ff);
  const def = defineModel(`icon:sigil:${card.id}`, (m) => {
    const body = m.part('body');
    body.paint.lathe([[0.78, 0], [0.8, 0.06], [0.74, 0.12], [0, 0.12]], PAL.stoneDark, { seg: 16, c2: PAL.rockDark });
    body.metal.torus(0.79, 0.04, PAL.brass, { at: [0, 0.08, 0], seg: 24, tube: 5 });
    body.glow.torus(0.55, 0.025, hue, { at: [0, 0.13, 0], seg: 24, tube: 4 });
    body.glow.ring(6, (b) => b.box(0.05, 0.02, 0.15, hue, { at: [0, 0.13, 0.66], bevel: 0 }));
    body.glow.crystal(0.22, 0.75, mix(hue, PAL.white, 0.35), { at: [0, 0.75, 0], sides: 6, c2: hue });
    body.glow.ring(3, (b, i) => b.crystal(0.06, 0.2, hue, { at: [0, 0.6 + i * 0.12, 0.42], rot: [0.3, 0, 0], sides: 4 }));
  });
  return staticGroup(def, { cast: false, receive: false });
}

// scratch objects (card art runs once at boot, but there is no reason to churn)
const _box = new THREE.Box3();
const _tmp = new THREE.Box3();
const _v = new THREE.Vector3();
const _c = new THREE.Vector3();
const _target = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const DIR = new THREE.Vector3(0, Math.sin(ELEV), Math.cos(ELEV));

function boundsOf(obj, box) {
  box.makeEmpty();
  obj.updateMatrixWorld(true);
  obj.traverseVisible((o) => {
    if (!o.isMesh || !o.geometry || (o.userData && o.userData.noBounds)) return;
    const g = o.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    _tmp.copy(g.boundingBox).applyMatrix4(o.matrixWorld);
    box.union(_tmp);
  });
  if (box.isEmpty()) box.set(_v.set(-0.5, 0, -0.5), _c.set(0.5, 1, 0.5));
  return box;
}

/** Places the camera so the box's projection is centred and spans FILL of the frame. */
function frame(camera, box) {
  box.getCenter(_target);
  const half = Math.tan((FOV * Math.PI) / 360);
  let d = Math.max(0.5, box.getSize(_v).length()) * 1.8;
  for (let it = 0; it < 4; it++) {
    camera.position.copy(_target).addScaledVector(DIR, d);
    camera.lookAt(_target);
    camera.updateMatrixWorld(true);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let k = 0; k < 8; k++) {
      _v.set(k & 1 ? box.max.x : box.min.x, k & 2 ? box.max.y : box.min.y, k & 4 ? box.max.z : box.min.z);
      _v.project(camera);
      if (_v.x < x0) x0 = _v.x; if (_v.x > x1) x1 = _v.x;
      if (_v.y < y0) y0 = _v.y; if (_v.y > y1) y1 = _v.y;
    }
    const ext = Math.max(x1 - x0, y1 - y0) / 2;
    if (!(ext > 1e-4) || !Number.isFinite(ext)) break;
    _right.setFromMatrixColumn(camera.matrixWorld, 0);
    _up.setFromMatrixColumn(camera.matrixWorld, 1);
    _target.addScaledVector(_right, ((x0 + x1) / 2) * d * half).addScaledVector(_up, ((y0 + y1) / 2) * d * half);
    d *= ext / FILL;
  }
  camera.position.copy(_target).addScaledVector(DIR, d);
  camera.lookAt(_target);
  camera.near = Math.max(0.01, d * 0.05);
  camera.far = d * 6 + 10;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}

const LAYOUTS = [
  null,
  [[0, 0]],
  [[0.38, 0.3], [-0.48, -0.36]],
  [[0, 0.45], [-0.8, -0.3], [0.8, -0.38]],
];

/** Builds the card's subject into `group`; returns the views to dispose afterwards. */
function buildSubject(card, group) {
  const views = [];
  if (card.type === 'spell') {
    let icon = null;
    const ib = ICON_BUILDERS[card.id];
    if (ib) {
      try { icon = ib(0); } catch (e) { console.warn(`[models] icon ${card.id} failed`, e); }
    }
    group.add(icon && icon.isObject3D ? icon : sigil(card));
    return views;
  }
  const type = card.unit;
  const u = UNITS[type] || { radius: 0.45, flying: false };
  const n = card.type === 'building' ? 1 : Math.max(1, Math.min(3, card.count || 1));
  const sp = Math.max(0.4, u.radius * 1.9);
  const layout = LAYOUTS[n];
  for (let i = 0; i < n; i++) {
    const v = viewFor(type, 0);
    const st = { ...IDLE_STATE, time: 1.3 + i * 0.71, stateTime: 1 + i };
    for (let k = 0; k < 4; k++) v.update(1 / 30, st);
    v.root.position.set(layout[i][0] * sp, u.flying ? 0.45 : 0, layout[i][1] * sp);
    v.root.rotation.y = HERO_YAW + (i === 0 ? 0 : (i === 1 ? 0.18 : -0.14));
    group.add(v.root);
    views.push(v);
  }
  return views;
}

/**
 * Renders card art for all cards. Resolves to { cardId: 'data:image/png;base64,...' }.
 * Never rejects: on failure it returns whatever was produced.
 */
export async function renderCardThumbs(size = 256, onProgress) {
  const out = {};
  const total = CARDS.length;
  let renderer = null;
  let done = 0;
  const progress = () => {
    if (typeof onProgress === 'function') {
      try { onProgress(done, total); } catch (e) { /* the caller's problem */ }
    }
  };
  try {
    const px = Math.max(32, Math.min(1024, Math.round(Number(size)) || 256));
    const canvas = document.createElement('canvas');
    canvas.width = px;
    canvas.height = px;
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(px, px, false);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const scene = new THREE.Scene();
    scene.environment = envTexture();
    scene.environmentIntensity = 0.5;
    scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x4a4058, 0.9));
    const key = new THREE.DirectionalLight(0xfff0d8, 2.7);
    key.position.set(-4, 6, 5);
    const fill = new THREE.DirectionalLight(0xbfd4ff, 0.9);
    fill.position.set(5, 2, 3);
    const rim = new THREE.DirectionalLight(0xffffff, 2.2);
    rim.position.set(1.5, 4, -6);
    scene.add(key, fill, rim);

    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 200);
    const group = new THREE.Group();
    scene.add(group);

    for (const card of CARDS) {
      let views = [];
      try {
        views = buildSubject(card, group);
        frame(camera, boundsOf(group, _box));
        renderer.render(scene, camera);
        out[card.id] = canvas.toDataURL('image/png');
      } catch (e) {
        console.warn(`[models] card art for ${card.id} failed`, e);
      }
      for (let i = group.children.length - 1; i >= 0; i--) group.remove(group.children[i]);
      for (const v of views) { try { v.dispose(); } catch (e) { /* ignore */ } }
      done++;
      progress();
      if (done % 3 === 0) await new Promise((r) => setTimeout(r, 0));
    }
  } catch (e) {
    console.warn('[models] card art unavailable', e);
  } finally {
    if (renderer) {
      try { renderer.dispose(); renderer.forceContextLoss(); } catch (e) { /* ignore */ }
    }
  }
  return out;
}
