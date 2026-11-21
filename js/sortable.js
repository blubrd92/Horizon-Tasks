// Dragging a row up or down a list by its handle (Settings' categories).
// The row follows the pointer; its neighbors step around it as it passes
// their middle. Near the top or bottom of the box that scrolls, it
// scrolls. Nothing is saved here: onDrop(ids) gets the rows' order when
// the pointer lets go, and only if it changed.
//
// The dragged row's own element never moves: moving it would make the
// browser let go of the pointer mid-drag. (The checklist's own drag,
// checklist.js, works the same way.)

const EDGE = 48; // pixels from the scrolling box's edge where it scrolls

// list: the <ul>. row: the <li> whose handle was pressed. event: that
// pointerdown. idOf(row) reads a row's id; rows without one stay put but
// count as neighbors.
export function startSort(list, row, event, { idOf, onDrop }) {
  const handle = event.target;
  const scroller = scrollingBox(list);
  const before = order();
  let y = event.clientY;
  let frame = 0;

  event.preventDefault();
  handle.setPointerCapture(event.pointerId);
  row.classList.add('is-dragging');
  list.classList.add('is-sorting');

  function order() {
    return [...list.children].map(idOf).filter(Boolean);
  }

  function middle(el) {
    const r = el.getBoundingClientRect();
    return r.top + r.height / 2;
  }

  function place() {
    let prev = row.previousElementSibling;
    while (prev && y < middle(prev)) {
      list.insertBefore(prev, row.nextElementSibling);
      prev = row.previousElementSibling;
    }
    let next = row.nextElementSibling;
    while (next && y > middle(next)) {
      list.insertBefore(next, row);
      next = row.nextElementSibling;
    }
  }

  function tick() {
    if (scroller) {
      const r = scroller.getBoundingClientRect();
      let by = 0;
      if (y < r.top + EDGE) by = -Math.ceil((r.top + EDGE - y) / 6);
      else if (y > r.bottom - EDGE) by = Math.ceil((y - (r.bottom - EDGE)) / 6);
      if (by) {
        scroller.scrollTop += by;
        place();
      }
    }
    frame = requestAnimationFrame(tick);
  }

  function move(e) {
    if (e.pointerId !== event.pointerId) return;
    y = e.clientY;
    place();
  }

  function end(e) {
    if (e.pointerId !== event.pointerId) return;
    cancelAnimationFrame(frame);
    handle.removeEventListener('pointermove', move);
    handle.removeEventListener('pointerup', end);
    handle.removeEventListener('pointercancel', end);
    handle.removeEventListener('lostpointercapture', end);
    row.classList.remove('is-dragging');
    list.classList.remove('is-sorting');
    const after = order();
    if (after.join('\u0000') !== before.join('\u0000')) onDrop(after);
  }

  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
  handle.addEventListener('lostpointercapture', end);
  tick();
}

// The nearest box around the list that scrolls up and down.
function scrollingBox(el) {
  for (let box = el.parentElement; box; box = box.parentElement) {
    const { overflowY } = getComputedStyle(box);
    if ((overflowY === 'auto' || overflowY === 'scroll') && box.scrollHeight > box.clientHeight) return box;
  }
  return null;
}
