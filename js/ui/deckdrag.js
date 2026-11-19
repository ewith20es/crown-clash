import { replaceInDeck } from './format.js';

/** A tap still opens details. On touch, a short hold lifts a collection card so ordinary swipes scroll. */
export class DeckDrag {
  constructor(builder) {
    this.builder = builder;
    const panel = builder.el;
    panel.addEventListener('pointerdown', e => {
      if (e.button !== 0 || !e.isPrimary || e.pointerType === 'touch') return;
      if (this.start(e.target, e.clientX, e.clientY, e.pointerId)) this.source.setPointerCapture(e.pointerId);
    });
    panel.addEventListener('pointermove', e => {
      if (this.source && e.pointerId === this.pointer) this.move(e.clientX, e.clientY);
    });
    panel.addEventListener('pointerup', e => {
      if (this.source && e.pointerId === this.pointer) this.release(e.clientX, e.clientY);
    });
    panel.addEventListener('lostpointercapture', e => { if (e.pointerId === this.pointer) this.cancel(); });
    panel.addEventListener('touchstart', e => {
      if (e.touches.length !== 1) { this.cancel(); return; }
      const t = e.touches[0];
      if (this.start(e.target, t.clientX, t.clientY, 'touch') && this.source.matches('.coll-item')) {
        this.hold = setTimeout(() => { this.hold = null; this.lift(this.x, this.y); }, 230);
      }
    }, { passive: true });
    panel.addEventListener('touchmove', e => {
      if (!this.source || this.pointer !== 'touch') return;
      const t = e.touches[0];
      if (this.hold) {
        if (Math.hypot(t.clientX - this.x, t.clientY - this.y) > 7) this.cancel();
        return;
      }
      if (e.cancelable) e.preventDefault();
      this.move(t.clientX, t.clientY);
    }, { passive: false });
    panel.addEventListener('touchend', e => {
      if (!this.source || this.pointer !== 'touch') return;
      if (this.ghost && e.cancelable) e.preventDefault();
      const t = e.changedTouches[0];
      this.release(t.clientX, t.clientY);
    }, { passive: false });
    panel.addEventListener('touchcancel', () => this.cancel());
    panel.addEventListener('contextmenu', e => { if (this.source) e.preventDefault(); });
    panel.addEventListener('dragstart', e => e.preventDefault());
    panel.addEventListener('click', e => {
      if (this.suppressClick && e.detail !== 0) { e.preventDefault(); e.stopImmediatePropagation(); }
    }, true);
    window.addEventListener('blur', () => this.cancel());
  }

  start(target, x, y, pointer) {
    this.cancel();
    this.suppressClick = false;
    const source = target.closest('.deck-slot, .coll-item');
    if (!source || this.builder.detailId) return false;
    this.source = source;
    this.id = source.dataset.id || this.builder.deck()[Number(source.dataset.i)];
    this.pointer = pointer;
    this.x = x;
    this.y = y;
    return true;
  }

  lift(x, y) {
    this.builder.setPick(null);
    const card = this.source.querySelector('.card');
    this.ghost = card.cloneNode(true);
    this.ghost.classList.add('deck-drag-ghost');
    this.ghost.setAttribute('aria-hidden', 'true');
    this.ghost.style.width = card.getBoundingClientRect().width + 'px';
    document.body.append(this.ghost);
    this.source.classList.add('is-lifted');
    this.moves = this.builder.slotBtns.map((button, i) => {
      const next = replaceInDeck(this.builder.deck(), i, this.id);
      button.classList.toggle('can-drop', !!next);
      return next;
    });
    this.move(x, y);
  }

  move(x, y) {
    if (!this.ghost) {
      if (Math.hypot(x - this.x, y - this.y) >= 6) this.lift(x, y);
      return;
    }
    this.ghost.style.left = x + 'px';
    this.ghost.style.top = y + 'px';
    const slot = document.elementFromPoint(x, y)?.closest('.deck-slot');
    const index = this.builder.slotBtns.indexOf(slot);
    this.target?.classList.remove('drop-target');
    this.target = this.moves[index] ? slot : null;
    this.target?.classList.add('drop-target');
  }

  release(x, y) {
    if (!this.ghost) { this.cancel(); return; }
    this.move(x, y);
    const index = this.builder.slotBtns.indexOf(this.target);
    const next = this.moves[index];
    this.cancel();
    if (next) this.builder.commit(next, index);
  }

  cancel() {
    clearTimeout(this.hold);
    this.hold = null;
    const dragging = !!this.ghost;
    if (dragging) {
      this.suppressClick = true;
      this.ghost.remove();
      this.source.classList.remove('is-lifted');
      for (const b of this.builder.slotBtns) b.classList.remove('can-drop', 'drop-target');
    }
    this.source = this.ghost = this.target = this.pointer = this.moves = null;
    return dragging;
  }
}
