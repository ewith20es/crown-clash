// Card input: drag a card from the hand onto the island, or tap a card and then tap/drag on
// the island. Shows a translucent preview of what will be deployed and where it is legal.
import { UNITS } from '../data/cards.js';
import { UNIT_VISUAL_SCALE } from '../config.js';
import { createGhostView } from '../render/models/index.js';

const DRAG_THRESHOLD = 9;   // px before a press on a card counts as a drag

function markerRadius(card) {
  if (card.type === 'spell') return card.spell.radius || card.spell.halfWidth || 1.5;
  const def = UNITS[card.unit];
  if (card.type === 'building') return def.radius + 0.25;
  return Math.max(0.7, def.radius + (card.count > 1 ? 0.35 * Math.sqrt(card.count) : 0.2));
}

export class CardInput {
  /** @param ctx { stage, arena, ui, audio, battle, canvas } */
  constructor(ctx) {
    this.stage = ctx.stage;
    this.arena = ctx.arena;
    this.ui = ctx.ui;
    this.audio = ctx.audio;
    this.battle = ctx.battle;
    this.canvas = ctx.canvas;

    this.selected = null;   // hand index picked by a tap
    this.drag = null;       // press that started on a hand card
    this.aim = null;        // press on the island while a card is selected
    this.ghosts = new Map();
    this.ghost = null;
    this.previewOn = false;

    this.onDragMove = this.onDragMove.bind(this);
    this.onDragUp = this.onDragUp.bind(this);
    this.onAimMove = this.onAimMove.bind(this);
    this.onAimUp = this.onAimUp.bind(this);

    this.canvas.addEventListener('pointerdown', (ev) => this.onCanvasDown(ev));
    window.addEventListener('keydown', (ev) => this.onKey(ev));
    window.addEventListener('blur', () => this.reset());
  }

  // ───────────────────────── presses that start on a card ─────────────────────────

  onCardDown(index, ev) {
    if (!this.battle.canPlayerAct()) return;
    if (ev.button !== undefined && ev.button > 0) return;
    this.endAim();
    this.endDrag();
    this.drag = {
      index, pointerId: ev.pointerId, startX: ev.clientX, startY: ev.clientY,
      moved: false, over: false, wasSelected: this.selected === index,
    };
    this.select(index);
    this.audio.play('cardSelect');
    window.addEventListener('pointermove', this.onDragMove, { passive: true });
    window.addEventListener('pointerup', this.onDragUp);
    window.addEventListener('pointercancel', this.onDragUp);
  }

  onDragMove(ev) {
    const d = this.drag;
    if (!d || ev.pointerId !== d.pointerId) return;
    if (!d.moved) {
      if (Math.hypot(ev.clientX - d.startX, ev.clientY - d.startY) < DRAG_THRESHOLD) return;
      d.moved = true;
    }
    const cardId = this.cardIdAt(d.index);
    d.over = this.isOverArena(ev.clientY);
    if (d.over) {
      this.ui.moveDragProxy(null, 0, 0);
      this.ui.setDragging(d.index);
      this.preview(d.index, ev.clientX, ev.clientY);
    } else {
      this.ui.setDragging(null);
      this.ui.moveDragProxy(cardId, ev.clientX, ev.clientY);
      this.hidePreview();
    }
  }

  onDragUp(ev) {
    const d = this.drag;
    if (!d || ev.pointerId !== d.pointerId) return;
    this.endDrag();
    if (ev.type === 'pointercancel') { this.deselect(); return; }
    if (d.moved) {
      if (this.isOverArena(ev.clientY)) this.tryPlay(d.index, ev.clientX, ev.clientY);
      this.deselect();
    } else if (d.wasSelected) {
      this.deselect();                       // second tap on the same card puts it back
    } else {
      this.ui.hint('Tap the island to deploy');
    }
  }

  endDrag() {
    if (!this.drag) return;
    this.drag = null;
    window.removeEventListener('pointermove', this.onDragMove);
    window.removeEventListener('pointerup', this.onDragUp);
    window.removeEventListener('pointercancel', this.onDragUp);
    this.ui.moveDragProxy(null, 0, 0);
    this.ui.setDragging(null);
    this.hidePreview();
  }

  // ───────────────────────── presses on the island with a card selected ─────────────────────────

  onCanvasDown(ev) {
    if (this.selected === null || this.drag || this.aim) return;
    if (!this.battle.canPlayerAct()) return;
    if (ev.button !== undefined && ev.button > 0) return;
    ev.preventDefault();
    this.aim = { pointerId: ev.pointerId };
    this.preview(this.selected, ev.clientX, ev.clientY);
    window.addEventListener('pointermove', this.onAimMove, { passive: true });
    window.addEventListener('pointerup', this.onAimUp);
    window.addEventListener('pointercancel', this.onAimUp);
  }

  onAimMove(ev) {
    if (!this.aim || ev.pointerId !== this.aim.pointerId || this.selected === null) return;
    if (this.isOverArena(ev.clientY)) this.preview(this.selected, ev.clientX, ev.clientY);
    else this.hidePreview();
  }

  onAimUp(ev) {
    if (!this.aim || ev.pointerId !== this.aim.pointerId) return;
    const index = this.selected;
    this.endAim();
    if (ev.type === 'pointercancel' || index === null) return;
    if (this.isOverArena(ev.clientY) && this.tryPlay(index, ev.clientX, ev.clientY)) this.deselect();
  }

  endAim() {
    if (!this.aim) return;
    this.aim = null;
    window.removeEventListener('pointermove', this.onAimMove);
    window.removeEventListener('pointerup', this.onAimUp);
    window.removeEventListener('pointercancel', this.onAimUp);
    this.hidePreview();
  }

  onKey(ev) {
    if (ev.repeat || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (!this.battle.canPlayerAct()) return;
    if (ev.key >= '1' && ev.key <= '4') {
      const index = Number(ev.key) - 1;
      if (this.selected === index) this.deselect();
      else { this.select(index); this.ui.hint('Click the island to deploy'); this.audio.play('cardSelect'); }
    } else if (ev.key === 'Escape') {
      this.reset();
    }
  }

  // ───────────────────────── helpers ─────────────────────────

  cardIdAt(index) {
    const world = this.battle.world;
    return world ? world.players[this.battle.player].hand[index] : null;
  }

  isOverArena(clientY) {
    return clientY < this.ui.getHandRect().top - 4;
  }

  select(index) {
    this.selected = index;
    this.ui.setSelected(index);
  }

  deselect() {
    this.selected = null;
    this.ui.setSelected(null);
    this.ui.hint(null);
    this.hidePreview();
  }

  /** Drop every in-progress interaction (match ended, window lost focus, ...). */
  reset() {
    this.endDrag();
    this.endAim();
    this.deselect();
  }

  tryPlay(index, clientX, clientY) {
    const g = this.stage.screenToGround(clientX, clientY);
    if (!g) return false;
    return this.battle.playCard(index, g.x, g.z);
  }

  preview(index, clientX, clientY) {
    const world = this.battle.world;
    const g = world && this.stage.screenToGround(clientX, clientY);
    if (!g) { this.hidePreview(); return; }
    const res = world.canPlay(this.battle.player, index, g.x, g.z);
    const card = res.deployment;
    if (!card) { this.hidePreview(); return; }
    this.previewOn = true;
    if (card.type === 'spell') {
      this.setGhost(null);
      this.arena.showDeployZone(null);
    } else {
      const ghost = this.ghostFor(card);
      this.setGhost(ghost);
      ghost.position.set(res.x, 0, res.z);
      world.deploymentPositions(card, this.battle.player, res.x, res.z).forEach((member, i) => {
        const pos = ghost.children[i]?.position;
        if (pos) pos.set(member.x - res.x, pos.y, member.z - res.z);
      });
      const anywhere = UNITS[card.unit].deployAnywhere;
      this.arena.showDeployZone(anywhere ? null : { rects: world.deployRects(this.battle.player) });
    }
    this.arena.setMarker({ x: res.x, z: res.z, radius: markerRadius(card), ok: res.ok, kind: card.type });
  }

  hidePreview() {
    if (!this.previewOn) return;
    this.previewOn = false;
    this.setGhost(null);
    this.arena.showDeployZone(null);
    this.arena.setMarker(null);
  }

  ghostFor(card) {
    const key = this.battle.player + '/' + card.id + '/' + card.unit;
    let g = this.ghosts.get(key);
    if (!g) {
      g = createGhostView(card, this.battle.player);
      // match the in-battle troop size; offsets stay unscaled so the preview matches spawn spots
      if (card.type === 'troop') {
        for (const child of g.children) child.scale.multiplyScalar(UNIT_VISUAL_SCALE);
      }
      this.ghosts.set(key, g);
    }
    return g;
  }

  setGhost(ghost) {
    if (this.ghost === ghost) return;
    if (this.ghost) this.stage.scene.remove(this.ghost);
    this.ghost = ghost;
    if (ghost) this.stage.scene.add(ghost);
  }
}
