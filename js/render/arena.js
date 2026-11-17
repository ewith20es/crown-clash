// Crown Clash artwork aligned with the Desktop simulation's bridge coordinates.
import * as THREE from 'three';
import { towerPosition } from '../config.js';
import { DeployVeil, PlacementMarker } from './env/decals.js';
import { createEntityView } from './models/index.js';
import { IDLE_STATE } from './models/kit.js';

export class ArenaView {
  constructor(stage) {
    this.stage = stage;
    this.time = { value: 0 };
    this.root = new THREE.Group();
    this.root.name = 'royal-arena';
    stage.scene.background = new THREE.Color(0x102947);
    stage.scene.fog = new THREE.Fog(0x102947, 100, 240);
    const addBox = (w, h, d, x, y, z, color) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: .82 }));
      mesh.position.set(x, y, z); mesh.receiveShadow = true; mesh.castShadow = true;
      this.root.add(mesh); return mesh;
    };
    addBox(23.2, 1.1, 33, 0, -.65, 0, 0x535f71);
    addBox(23.6, .28, 33.4, 0, -1.25, 0, 0xd2ad59);
    addBox(25.5, .6, 35.4, 0, -1.7, 0, 0x293a53);
    // u=.28/.72 are the bridge centres. Map them to x=+-5, the physics lanes.
    const geo = new THREE.PlaneGeometry(22.7272727, 32, 1, 4);
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    const zs = [-16, -1, 0, 1, 16], vs = [1, .537, .5, .474, 0];
    for (let row = 0; row < 5; row++) for (let c = 0; c < 2; c++) {
      const i = row * 2 + c;
      pos.setXYZ(i, c ? 11.36363635 : -11.36363635, 0, zs[row]);
      uv.setXY(i, c, vs[row]);
    }
    geo.computeVertexNormals();
    const texture = new THREE.TextureLoader().load(new URL('../../assets/arena.png', import.meta.url).href);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, stage.renderer.capabilities.getMaxAnisotropy());
    this.texture = texture;
    const surface = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: texture, roughness: 1 }));
    surface.receiveShadow = true;
    this.root.add(surface);
    for (const x of [-11.65, 11.65]) for (let z = -15.5; z <= 15.5; z += 1.5) addBox(.65, .45, 1.38, x, .12, z, 0x7c8995);
    for (const z of [-16.35, 16.35]) for (let x = -11; x <= 11; x += 1.5) addBox(1.38, .5, .6, x, .12, z, 0x7c8995);
    for (const team of [0, 1]) for (const x of [-12.1, 12.1]) {
      const z = team ? -11 : 11;
      addBox(.12, 3.8, .12, x, 1.3, z, 0xffd16d);
      addBox(1, 1.45, .08, x + (x < 0 ? -.48 : .48), 2.3, z, team ? 0xdf3d50 : 0x287cf0);
    }
    this.preview = new THREE.Group();
    this.previewViews = [];
    for (const team of [0, 1]) for (const slot of ['left', 'right', 'citadel']) {
      const view = createEntityView(slot === 'citadel' ? 'citadel' : 'spire', team);
      const p = towerPosition(team, slot);
      view.root.position.set(p.x, 0, p.z);
      view.root.rotation.y = team === 0 ? Math.PI : 0;
      view.update(0, IDLE_STATE);
      this.preview.add(view.root); this.previewViews.push(view);
    }
    this.root.add(this.preview);
    this.veil = new DeployVeil(this.time); this.marker = new PlacementMarker(this.time);
    this.root.add(this.veil.mesh, this.marker.mesh);
    stage.scene.add(this.root);
  }
  update(dt, time) {
    this.time.value = time % 3600;
    this.preview.visible = this.stage.mode === 'menu';
    this.veil.update(dt);
  }
  showDeployZone(zone) { this.veil.set(zone); }
  setMarker(marker) { this.marker.set(marker); }
  dispose() {
    this.root.removeFromParent();
    for (const v of this.previewViews) v.dispose();
    this.root.remove(this.preview);
    this.root.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
    this.texture.dispose();
  }
}
