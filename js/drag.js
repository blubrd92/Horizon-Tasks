// Dragging cards: between zones, within a zone, and in and out of the Someday
// drawer. One piece of code handles a mouse, a finger, and a pen.
//
//   Mouse or pen:  press on a card and move a few pixels; the card lifts.
//   Finger:        press and hold a card for a moment, then move. A quick
//                  swipe still scrolls the board, as it should.
//
// This file only moves things on screen and reports where a card was
// dropped. app.js decides what the drop means and saves it.
//
// Places a card can land are marked in the HTML with data-drop="<place>".
// Inside one, data-drop-list holds its cards in order. data-drop-top means
// "always the top of the list" (the Someday tab, which has no list showing).

const MOUSE_THRESHOLD = 5; // pixels a mouse moves before the card lifts
const HOLD_DELAY = 350; // milliseconds a finger rests before the card lifts
const HOLD_SLOP = 10; // pixels a finger may wander while holding
const EDGE = 56; // within this many pixels of an edge, things scroll by themselves
const EDGE_SPEED = 16; // pixels per frame at the very edge
const HOP_PAUSE = 700; // milliseconds between hops in a box that snaps zone to zone

// scrollers() returns the boxes that should scroll by themselves when a card
// is dragged near their edges. canDrop(place, cardId) says whether a card may
// land on a place. onStart(cardId, cardEl) runs when a card lifts; onEnd()
// when the drag is over, dropped or not, just before onDrop({ cardId, place,
// index }). index is the card's new position among the other cards there.
export function setupDrag({ root, scrollers, canDrop, onStart, onEnd, onDrop }) {
  let pending = null;
  let drag = null;
  let frame = 0;

  root.addEventListener('pointerdown', (event) => {
    if (pending || drag || !event.isPrimary) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const card = event.target.closest('[data-drag-id]');
    if (!card) return;
    // Buttons and links inside a card (like 1d's triage buttons) keep their
    // own clicks. The title button is the card itself, so it doesn't count.
    const control = event.target.closest('button, a, input, select, textarea, label');
    if (control && !control.classList.contains('card-open')) return;

    pending = {
      pointerId: event.pointerId,
      touch: event.pointerType === 'touch',
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      card,
      pressed: event.target,
      timer: 0,
    };
    if (pending.touch) pending.timer = setTimeout(begin, HOLD_DELAY);
  });

  window.addEventListener('pointermove', (event) => {
    if (drag && event.pointerId === drag.pointerId) {
      drag.x = event.clientX;
      drag.y = event.clientY;
      moveGhost();
      updateTarget();
      return;
    }
    if (!pending || event.pointerId !== pending.pointerId) return;
    pending.x = event.clientX;
    pending.y = event.clientY;
    const distance = Math.hypot(pending.x - pending.startX, pending.y - pending.startY);
    // A finger that moves before the hold is up means "scroll", not "drag".
    if (pending.touch) {
      if (distance > HOLD_SLOP) cancelPending();
    } else if (distance > MOUSE_THRESHOLD) {
      begin();
    }
  });

  window.addEventListener('pointerup', (event) => {
    if (drag && event.pointerId === drag.pointerId) finish(true);
    else if (pending && event.pointerId === pending.pointerId) cancelPending();
  });

  window.addEventListener('pointercancel', (event) => {
    if (drag && event.pointerId === drag.pointerId) finish(false);
    else if (pending && event.pointerId === pending.pointerId) cancelPending();
  });

  window.addEventListener('keydown', (event) => {
    if (drag && event.key === 'Escape') {
      event.preventDefault();
      finish(false);
    }
  });

  // Once a finger has lifted a card, the page must not scroll under it.
  document.addEventListener(
    'touchmove',
    (event) => {
      if (drag) event.preventDefault();
    },
    { passive: false },
  );

  // Holding a finger on a card would otherwise open the phone's own menu.
  root.addEventListener('contextmenu', (event) => {
    if (drag || (pending && pending.touch)) event.preventDefault();
  });

  // The browser's own dragging of selected text would fight this one.
  root.addEventListener('dragstart', (event) => {
    if (event.target.closest && event.target.closest('[data-drag-id]')) event.preventDefault();
  });

  function cancelPending() {
    clearTimeout(pending.timer);
    pending = null;
  }

  function begin() {
    const { pointerId, card, pressed, startX, startY, x, y } = pending;
    cancelPending();

    // A finger's events stick to the element it first touched. Letting go of
    // that means they keep arriving even if the card's container is hidden
    // (the Someday drawer tucks away on a phone).
    if (pressed.hasPointerCapture && pressed.hasPointerCapture(pointerId)) {
      pressed.releasePointerCapture(pointerId);
    }

    const rect = card.getBoundingClientRect();
    const ghost = card.cloneNode(true);
    ghost.classList.add('card-ghost');
    ghost.removeAttribute('data-drag-id');
    for (const el of ghost.querySelectorAll('[data-card-id]')) el.removeAttribute('data-card-id');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.style.width = `${rect.width}px`;
    document.body.append(ghost);

    // The slot: an empty, card-sized gap that opens where the card will land.
    // It starts in the card's own spot, and the card itself steps out of the
    // way, so the board doesn't jump when the card lifts.
    const marker = document.createElement('div');
    marker.className = 'drop-slot';
    marker.setAttribute('aria-hidden', 'true');
    marker.style.height = `${rect.height}px`;
    card.before(marker);

    drag = {
      pointerId,
      card,
      id: card.dataset.dragId,
      ghost,
      marker,
      offsetX: startX - rect.left,
      offsetY: startY - rect.top,
      x,
      y,
      target: null,
      index: 0,
      // Boxes that snap zone to zone (the board on a phone) hop one zone at
      // a time near an edge; sliding smoothly would fight the snapping.
      snaps: new Set(scrollers().filter((box) => box && getComputedStyle(box).scrollSnapType.startsWith('x'))),
      lastHop: 0,
    };
    card.classList.add('is-lifted');
    document.body.classList.add('is-dragging');
    const selection = window.getSelection();
    if (selection) selection.removeAllRanges();

    onStart(drag.id, card);
    moveGhost();
    updateTarget();
    frame = requestAnimationFrame(autoScroll);
  }

  function moveGhost() {
    drag.ghost.style.transform = `translate(${drag.x - drag.offsetX}px, ${drag.y - drag.offsetY}px) rotate(1.5deg)`;
  }

  // Works out which place is under the pointer and where in its list the card
  // would land, and shows that with an outline and the slot.
  function updateTarget() {
    const { x, y } = drag;
    const under = document.elementFromPoint(x, y);
    let target = under ? under.closest('[data-drop]') : null;
    // Below a zone's last card, or in the gap under a short zone, still
    // counts as that zone.
    if (!target && under && under.closest('.horizon')) target = columnAt(x, y);
    if (target && !canDrop(target.dataset.drop, drag.id)) target = null;

    if (target !== drag.target) {
      if (drag.target) drag.target.classList.remove('is-drop-target');
      if (target) target.classList.add('is-drop-target');
      drag.target = target;
    }

    const list = target && !target.hasAttribute('data-drop-top') ? target.querySelector('[data-drop-list]') : null;
    if (!list) {
      drag.index = 0;
      drag.marker.remove();
      return;
    }

    const others = [...list.querySelectorAll('[data-drag-id]')].filter((el) => el !== drag.card);
    let index = others.findIndex((el) => {
      const r = el.getBoundingClientRect();
      return y < r.top + r.height / 2;
    });
    if (index === -1) index = others.length;
    drag.index = index;

    const before = others[index] || null;
    const placed =
      drag.marker.parentNode === list &&
      (before ? drag.marker.nextElementSibling === before : !drag.marker.nextElementSibling);
    if (!placed) list.insertBefore(drag.marker, before);
  }

  function columnAt(x, y) {
    for (const zone of root.querySelectorAll('.zone[data-drop]')) {
      const r = zone.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top) return zone;
    }
    return null;
  }

  // Near an edge, scroll: the zones sideways (on a narrow screen they don't
  // all fit), the drawer's list, and the page itself.
  function autoScroll() {
    if (!drag) return;
    const { x, y } = drag;
    const boxes = scrollers().filter((box) => box && box.offsetParent);

    for (const box of boxes) {
      const r = box.getBoundingClientRect();
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
      if (box.scrollWidth > box.clientWidth) {
        if (drag.snaps.has(box)) hop(box, r);
        else box.scrollLeft += speed(r.right - x) - speed(x - r.left);
      }
      if (box.scrollHeight > box.clientHeight) box.scrollTop += speed(r.bottom - y) - speed(y - r.top);
    }
    window.scrollBy(0, speed(window.innerHeight - y) - speed(y));

    // Anything that moved since the last frame (including a hop that is
    // still gliding) changes what is under the pointer.
    const where = [window.scrollY, ...boxes.flatMap((box) => [box.scrollLeft, box.scrollTop])].join();
    if (where !== drag.where) {
      drag.where = where;
      updateTarget();
    }
    frame = requestAnimationFrame(autoScroll);
  }

  function hop(box, r) {
    const direction = drag.x > r.right - EDGE ? 1 : drag.x < r.left + EDGE ? -1 : 0;
    const now = performance.now();
    if (!direction || now - drag.lastHop < HOP_PAUSE) return;
    drag.lastHop = now;
    // The snapping settles this on the next zone over.
    box.scrollBy({ left: direction * box.clientWidth * 0.6, behavior: 'smooth' });
  }

  function speed(distanceFromEdge) {
    if (distanceFromEdge >= EDGE) return 0;
    return Math.ceil(EDGE_SPEED * (1 - Math.max(0, distanceFromEdge) / EDGE));
  }

  function finish(dropped) {
    cancelAnimationFrame(frame);
    const { id, card, ghost, marker, target, index } = drag;
    ghost.remove();
    marker.remove();
    card.classList.remove('is-lifted');
    if (target) target.classList.remove('is-drop-target');
    document.body.classList.remove('is-dragging');
    drag = null;
    swallowNextClick();
    onEnd();
    if (dropped && target) onDrop({ cardId: id, place: target.dataset.drop, index });
  }

  // Letting go of a dragged card can also count as a click on whatever is
  // underneath, which would open the editor. This throws that click away.
  function swallowNextClick() {
    const swallow = (event) => {
      event.stopPropagation();
      event.preventDefault();
    };
    const stop = () => {
      window.removeEventListener('click', swallow, { capture: true });
      window.removeEventListener('pointerdown', stop, { capture: true });
    };
    window.addEventListener('click', swallow, { capture: true, once: true });
    // A fresh press means a fresh click, which must go through.
    window.addEventListener('pointerdown', stop, { capture: true, once: true });
    setTimeout(stop, 300);
  }

  return {
    isDragging: () => Boolean(drag),
  };
}
