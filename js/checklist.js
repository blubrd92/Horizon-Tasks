// Checklists on cards: short items, each ticked or not, kept on the card as
// `checklist: [{ id, text, done }]`, in the order shown. This file has the
// rules for that list (no Firebase) and the editor's checklist section
// (setupChecklist). editor.js decides what gets saved and when; app.js
// saves a tick the moment it's made.

export const MAX_ITEMS = 30;
export const MAX_TEXT = 200;

// A card's list as stored, made predictable: only items with words, at
// most 30, each at most 200 characters, each with an id of its own. An item
// typed by hand in the console without an id gets one from its place.
export function normalizeChecklist(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const [i, item] of value.entries()) {
    if (!item || typeof item !== 'object' || typeof item.text !== 'string') continue;
    const text = cleanText(item.text);
    if (!text) continue;
    let id = typeof item.id === 'string' && item.id ? item.id : `item${i}`;
    if (seen.has(id)) id = `${id}-${i}`;
    seen.add(id);
    out.push({ id, text, done: item.done === true });
    if (out.length === MAX_ITEMS) break;
  }
  return out;
}

// One line, no runs of spaces, cut at 200.
function cleanText(text) {
  return String(text).replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
}

export function newItemId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID().slice(0, 8);
  return Math.random().toString(36).slice(2, 10);
}

// { done, total } for the count on a card.
export function checklistCount(list) {
  return { done: list.filter((item) => item.done).length, total: list.length };
}

// The list a repeating card's next card gets: the same items, in the same
// order, none ticked.
export function unticked(list) {
  return list.map((item) => ({ ...item, done: false }));
}

// True if two lists hold the same items, words, ticks, and order.
export function sameChecklist(a, b) {
  if (a.length !== b.length) return false;
  return a.every((item, i) => item.id === b[i].id && item.text === b[i].text && item.done === b[i].done);
}

// ---------- The editor's checklist section ----------

const ICONS = {
  handle:
    '<svg width="12" height="18" viewBox="0 0 12 18" fill="currentColor" aria-hidden="true"><circle cx="3" cy="3" r="1.6"></circle><circle cx="9" cy="3" r="1.6"></circle><circle cx="3" cy="9" r="1.6"></circle><circle cx="9" cy="9" r="1.6"></circle><circle cx="3" cy="15" r="1.6"></circle><circle cx="9" cy="15" r="1.6"></circle></svg>',
  remove:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg>',
};

// root: the section in the editor (index.html, #editor-checklist).
// onTick(itemId, done) runs on every tick; onOffer() when "Mark done" in
// the offer is pressed; onResize() when the section grows or shrinks, so
// the editor can stay on screen.
export function setupChecklist({ root, onTick, onOffer, onResize }) {
  const list = root.querySelector('.cl-list');
  const count = root.querySelector('.cl-count');
  const add = root.querySelector('.cl-add-input');
  const addRow = root.querySelector('.cl-add');
  const offer = root.querySelector('.cl-offer');
  const status = root.querySelector('.cl-status');
  const placeholder = add.placeholder;

  let items = [];
  // A card that isn't saved yet has nothing to mark done, so no offer.
  let canFinish = false;

  function load(checklist, { finish }) {
    items = checklist.map((item) => ({ ...item }));
    canFinish = finish;
    add.value = '';
    status.textContent = '';
    draw();
  }

  // The list as it stands, for saving: words typed in "Add an item" but not
  // yet added count too (Ctrl+Enter shouldn't lose them), and an item
  // emptied of its words is left out.
  function values() {
    const pending = splitLines(add.value).map((text) => ({ id: newItemId(), text, done: false }));
    return [...items, ...pending]
      .map((item) => ({ id: item.id, text: cleanText(item.text), done: item.done }))
      .filter((item) => item.text)
      .slice(0, MAX_ITEMS);
  }

  // Redraws the rows. Focus returns to the same item's same control, if it
  // had it.
  function draw(focus = null) {
    list.replaceChildren(...items.map((item, i) => rowFor(item, i)));
    addRow.classList.toggle('is-first', items.length === 0);
    const full = items.length >= MAX_ITEMS;
    add.disabled = full;
    add.placeholder = full ? `The list is full (${MAX_ITEMS} items)` : placeholder;
    refresh();
    for (const text of list.querySelectorAll('.cl-text')) grow(text);
    if (focus) {
      const row = list.querySelector(`[data-item="${CSS.escape(focus.id)}"]`);
      const target = row && row.querySelector(focus.part);
      if (target) target.focus();
    }
    onResize();
  }

  // The count and the offer, which follow every tick.
  function refresh() {
    const { done, total } = checklistCount(items);
    count.textContent = total ? `${done} of ${total}` : '';
    root.querySelector('.cl-label-count').textContent = total ? `, ${done} of ${total} ticked` : '';
    const wasHidden = offer.hidden;
    offer.hidden = !(canFinish && total > 0 && done === total);
    if (wasHidden !== offer.hidden) onResize();
  }

  function rowFor(item, i) {
    const row = document.createElement('li');
    row.className = 'cl-row';
    row.dataset.item = item.id;

    const handle = document.createElement('span');
    handle.className = 'cl-handle';
    handle.title = 'Drag to move';
    handle.innerHTML = ICONS.handle;

    const check = document.createElement('label');
    check.className = 'cl-check';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = item.done;
    box.setAttribute('aria-label', `Ticked: ${item.text || `item ${i + 1}`}`);
    check.append(box);

    const text = document.createElement('textarea');
    text.className = 'cl-text';
    text.rows = 1;
    text.maxLength = MAX_TEXT;
    text.value = item.text;
    text.spellcheck = true;
    text.setAttribute('aria-label', `Item ${i + 1} of ${items.length}`);
    text.setAttribute('aria-describedby', 'editor-cl-help');

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'cl-icon cl-remove';
    remove.setAttribute('aria-label', `Remove “${item.text || `item ${i + 1}`}”`);
    remove.innerHTML = ICONS.remove;

    row.append(handle, check, text, remove);
    return row;
  }

  function itemOf(el) {
    const row = el.closest('.cl-row');
    return row ? items.find((item) => item.id === row.dataset.item) : null;
  }

  // A one-row box that grows as its words wrap.
  function grow(text) {
    text.style.height = 'auto';
    text.style.height = `${text.scrollHeight}px`;
  }

  function addLines(lines) {
    const room = MAX_ITEMS - items.length;
    const taken = lines.slice(0, room);
    for (const text of taken) items.push({ id: newItemId(), text, done: false });
    draw();
    if (lines.length > room) status.textContent = `Added ${taken.length}. The list holds ${MAX_ITEMS} items, so ${lines.length - room} didn't fit.`;
    else status.textContent = taken.length === 1 ? `Added. ${items.length} items.` : `Added ${taken.length} items.`;
    if (!add.disabled) add.focus();
  }

  function move(item, to, part) {
    const from = items.indexOf(item);
    if (to < 0 || to >= items.length || to === from) return;
    items.splice(from, 1);
    items.splice(to, 0, item);
    draw({ id: item.id, part });
    status.textContent = `Moved to ${to + 1} of ${items.length}.`;
  }

  // Ticking: the item, the count, the offer; app.js saves it.
  list.addEventListener('change', (event) => {
    const box = event.target.closest('.cl-check input');
    if (!box) return;
    const item = itemOf(box);
    if (!item) return;
    item.done = box.checked;
    refresh();
    onTick(item.id, item.done);
  });

  list.addEventListener('input', (event) => {
    const text = event.target.closest('.cl-text');
    if (!text) return;
    const item = itemOf(text);
    // Line breaks (pasted ones) become spaces: an item is one line.
    if (/[\r\n]/.test(text.value)) text.value = text.value.replace(/[\r\n]+/g, ' ');
    if (item) item.text = text.value;
    grow(text);
    onResize();
  });

  list.addEventListener('click', (event) => {
    const remove = event.target.closest('.cl-remove');
    if (!remove) return;
    const item = itemOf(remove);
    if (!item) return;
    const at = items.indexOf(item);
    items.splice(at, 1);
    const next = items[Math.min(at, items.length - 1)];
    draw(next ? { id: next.id, part: '.cl-text' } : null);
    if (!next) add.focus();
    status.textContent = `Removed “${item.text}”. ${items.length} left.`;
  });

  list.addEventListener('keydown', (event) => {
    const text = event.target.closest('.cl-text');
    if (!text || event.isComposing) return;
    const item = itemOf(text);
    if (!item) return;
    // Ctrl+Enter is the editor's save: let it through.
    if (event.key === 'Enter' && !(event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      if (!add.disabled) add.focus();
      return;
    }
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      move(item, items.indexOf(item) + (event.key === 'ArrowUp' ? -1 : 1), '.cl-text');
    }
  });

  add.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.isComposing || event.ctrlKey || event.metaKey) return;
    // Enter adds the item instead of saving the card.
    event.preventDefault();
    const lines = splitLines(add.value);
    if (!lines.length) return;
    add.value = '';
    addLines(lines);
  });

  // Several lines pasted (a list from an email): one item each.
  add.addEventListener('paste', (event) => {
    const pasted = event.clipboardData && event.clipboardData.getData('text/plain');
    if (!pasted || !/[\r\n]/.test(pasted.trim())) return;
    event.preventDefault();
    const before = add.value.slice(0, add.selectionStart);
    const after = add.value.slice(add.selectionEnd);
    add.value = '';
    addLines(splitLines(before + pasted + after));
  });

  offer.querySelector('.cl-offer-done').addEventListener('click', () => onOffer());

  // ---------- Dragging by the handle ----------
  // The row follows the pointer up and down the list; the others make room
  // as it passes their middle. Near the top or bottom of the editor's
  // scrolling area, it scrolls. Nothing is saved until Save.
  let drag = null;

  list.addEventListener('pointerdown', (event) => {
    const handle = event.target.closest('.cl-handle');
    if (!handle || event.button !== 0) return;
    const row = handle.closest('.cl-row');
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    drag = { row, handle, pointerId: event.pointerId, y: event.clientY, scroller: root.closest('.panel-body'), frame: 0 };
    row.classList.add('is-dragging');
    list.classList.add('is-sorting');
    tick();
  });

  list.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag.y = event.clientY;
    place();
  });

  // Puts the dragged row where the pointer is among the others. Its
  // neighbors step around it, one at a time, rather than the row itself
  // moving: moving the row's own element would make the browser let go of
  // the pointer, ending the drag.
  function place() {
    const { row } = drag;
    const middle = (el) => {
      const r = el.getBoundingClientRect();
      return r.top + r.height / 2;
    };
    let prev = row.previousElementSibling;
    while (prev && drag.y < middle(prev)) {
      list.insertBefore(prev, row.nextElementSibling);
      prev = row.previousElementSibling;
    }
    let next = row.nextElementSibling;
    while (next && drag.y > middle(next)) {
      list.insertBefore(next, row);
      next = row.nextElementSibling;
    }
  }

  // Scrolls the editor while the pointer rests near its top or bottom.
  function tick() {
    if (!drag) return;
    const s = drag.scroller;
    if (s) {
      const r = s.getBoundingClientRect();
      const edge = 48;
      let by = 0;
      if (drag.y < r.top + edge) by = -Math.ceil((r.top + edge - drag.y) / 6);
      else if (drag.y > r.bottom - edge) by = Math.ceil((drag.y - (r.bottom - edge)) / 6);
      if (by) {
        s.scrollTop += by;
        place();
      }
    }
    drag.frame = requestAnimationFrame(tick);
  }

  function endDrag(event) {
    if (!drag || (event && event.pointerId !== drag.pointerId)) return;
    cancelAnimationFrame(drag.frame);
    const { row } = drag;
    row.classList.remove('is-dragging');
    list.classList.remove('is-sorting');
    drag = null;
    const order = [...list.children].map((r) => r.dataset.item);
    const before = items.map((item) => item.id).join('\u0000');
    items = order.map((id) => items.find((item) => item.id === id));
    if (items.map((item) => item.id).join('\u0000') !== before) {
      draw();
      status.textContent = `Moved to ${order.indexOf(row.dataset.item) + 1} of ${items.length}.`;
    }
  }

  list.addEventListener('pointerup', endDrag);
  list.addEventListener('pointercancel', endDrag);
  list.addEventListener('lostpointercapture', endDrag);

  // Measures each item's box again, once the editor is open (a closed
  // panel can't be measured) and when the window changes width.
  function fit() {
    for (const text of list.querySelectorAll('.cl-text')) grow(text);
  }

  return { load, values, fit };
}

// Non-empty lines, each made one clean line.
function splitLines(text) {
  return String(text)
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•–]|\[[ xX]?\]|\d+[.)])\s+/, ''))
    .map(cleanText)
    .filter(Boolean);
}
