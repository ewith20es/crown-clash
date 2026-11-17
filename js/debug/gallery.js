// Model gallery for visual review. Not linked from the game; open it by URL:
//   ?gallery                 every model on a turntable grid, cycling deploy → idle → move → attack
//   ?gallery=thumbs          the generated card art
// Options: page=0  cols=4 rows=3  team=0|1|both  state=cycle|idle|move|attack|deploy|dash
//          phase=0..1 (freeze the animation at that point)  yaw=0.5  spin=1  only=warden,scout  quality=high
import * as THREE from 'three';
import { UNITS, CARDS } from '../data/cards.js';
import { ARENA } from '../config.js';

function makeAnim() {
  return {
    time: 0, state: 'idle', stateTime: 0, deployFrac: 1, moveSpeed: 0, attackT: -1, windup: 0.3, hitSpeed: 1,
    hpFrac: 1, frozen: false, stunned: false, slowed: false, hasted: false, active: true, aimYaw: null,
    lifeFrac: 1, charged: false, hop: 0, shieldFrac: 0, rampT: 0, beam: false,
  };
}

async function runThumbs() {
  const models = await import('../render/models/index.js');
  document.getElementById('boot')?.remove();
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;inset:0;overflow:auto;padding:12px;display:grid;gap:10px;'
    + 'grid-template-columns:repeat(auto-fill,minmax(120px,1fr));background:#1b2440;touch-action:pan-y;z-index:10';
  document.body.appendChild(wrap);
  const thumbs = await models.renderCardThumbs(256);
  for (const card of CARDS) {
    const cell = document.createElement('div');
    cell.style.cssText = 'background:linear-gradient(#3a4a7c,#232c4e);border-radius:10px;padding:6px;color:#fff;'
      + 'font:700 12px system-ui;text-align:center';
    const img = document.createElement('img');
    img.src = thumbs[card.id] || '';
    img.style.cssText = 'width:100%;aspect-ratio:1;display:block';
    cell.append(img, document.createTextNode(`${card.name} (${card.cost})`));
    wrap.appendChild(cell);
  }
}

export async function runGallery(params) {
  if (params.get('gallery') === 'thumbs') { await runThumbs(); return; }

  const { Stage } = await import('../render/stage.js');
  const models = await import('../render/models/index.js');
  const canvas = document.getElementById('game-canvas');
  const overlay = document.getElementById('overlay-canvas');
  const octx = overlay.getContext('2d');
  const stage = new Stage(canvas, { quality: params.get('quality') || 'high' });
  stage.scene.background = new THREE.Color(0x27304f);
  document.getElementById('boot')?.remove();

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 120),
    new THREE.MeshStandardMaterial({ color: 0x5f8a66, roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  stage.scene.add(ground);

  const cols = Number(params.get('cols')) || 4;
  const rows = Number(params.get('rows')) || 3;
  const page = Number(params.get('page')) || 0;
  const teamParam = params.get('team') || '0';
  const stateParam = params.get('state') || 'cycle';
  const phase = params.has('phase') ? Number(params.get('phase')) : null;
  const yaw = params.has('yaw') ? Number(params.get('yaw')) : 0.45;
  const spin = params.has('spin');
  const only = params.get('only');

  let types = Object.keys(UNITS);
  if (only) types = only.split(',').filter((t) => UNITS[t]);
  const perPage = cols * rows;
  const shown = types.slice(page * perPage, page * perPage + perPage);
  const cellW = 4.6;
  const cellD = 5.6;

  const items = [];
  shown.forEach((type, i) => {
    const cx = ((i % cols) - (cols - 1) / 2) * cellW;
    const cz = (Math.floor(i / cols) - (rows - 1) / 2) * cellD;
    const teams = teamParam === 'both' ? [0, 1] : [Number(teamParam) === 1 ? 1 : 0];
    teams.forEach((team, k) => {
      const view = models.createEntityView(type, team);
      const def = UNITS[type];
      const x = cx + (teams.length > 1 ? (k - 0.5) * 2.1 : 0);
      view.root.position.set(x, def.flying ? ARENA.FLY_HEIGHT * 0.6 : 0, cz);
      view.root.rotation.y = yaw;
      stage.scene.add(view.root);
      items.push({ type, def, view, x, z: cz, anim: makeAnim(), label: k === 0 });
    });
  });

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 400);
  const span = Math.max(cols * cellW, rows * cellD * 1.25);
  camera.position.set(0, span * 0.78, span * 1.05);
  camera.lookAt(0, 1.0, 0.4);

  const resize = () => {
    stage.resize();
    camera.aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    // keep the whole grid in view on narrow windows
    const need = (cols * cellW + 2) / (rows * cellD + 6);
    camera.fov = camera.aspect < need ? 30 * (need / camera.aspect) : 30;
    camera.updateProjectionMatrix();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    overlay.width = Math.round(overlay.clientWidth * dpr);
    overlay.height = Math.round(overlay.clientHeight * dpr);
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  window.addEventListener('resize', resize);
  resize();

  const v = new THREE.Vector3();
  let last = performance.now();
  let time = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    time += dt;
    for (const it of items) {
      const s = it.anim;
      const def = it.def;
      s.time = time;
      s.windup = def.windup;
      s.hitSpeed = def.hitSpeed || 1;
      s.shieldFrac = def.shield > 0 ? 1 : 0;
      let mode = stateParam;
      let local = time;
      if (mode === 'cycle') {
        local = time % 8;
        mode = local < 1 ? 'deploy' : local < 2.5 ? 'idle' : local < 5 ? 'move' : 'attack';
        if (mode === 'idle') local -= 1; else if (mode === 'move') local -= 2.5; else if (mode === 'attack') local -= 5;
      }
      s.state = mode;
      s.stateTime = local;
      s.deployFrac = 1;
      s.moveSpeed = 0;
      s.attackT = -1;
      s.beam = false;
      s.charged = false;
      if (mode === 'deploy') {
        s.deployFrac = phase !== null ? phase : Math.min(1, local / 1);
      } else if (mode === 'move' || mode === 'dash') {
        s.moveSpeed = def.speed || 0;
        s.charged = !!def.charge && local > 1.2;
        if (def.speed <= 0) s.state = 'idle';
      } else if (mode === 'attack') {
        if (def.dmg > 0) {
          const period = s.hitSpeed;
          s.attackT = phase !== null ? phase * period : local % period;
          s.beam = !!def.ramp;
          s.rampT = local;
          s.aimYaw = yaw;
        } else {
          s.state = 'idle';
        }
      }
      if (spin) it.view.root.rotation.y = yaw + time * 0.6;
      it.view.update(dt, s);
    }
    stage.renderer.render(stage.scene, camera);

    const w = overlay.clientWidth;
    const h = overlay.clientHeight;
    octx.clearRect(0, 0, w, h);
    octx.font = '700 12px system-ui, sans-serif';
    octx.textAlign = 'center';
    for (const it of items) {
      if (!it.label) continue;
      v.set(it.x, 0, it.z + 1.6).project(camera);
      const sx = (v.x * 0.5 + 0.5) * w;
      const sy = (-v.y * 0.5 + 0.5) * h;
      octx.fillStyle = '#000a';
      octx.fillText(`${it.type} · ${it.def.height}`, sx + 1, sy + 1);
      octx.fillStyle = '#fff';
      octx.fillText(`${it.type} · ${it.def.height}`, sx, sy);
    }
  }
  requestAnimationFrame(frame);
  window.__gallery = { stage, items, camera, models };
}
