// Notes on hover: rest the pointer on a card that has notes, and after a
// moment a small box beside it shows them, so you can read them without
// opening the card. Only with a mouse or trackpad (a touch screen has no
// hover; a tap opens the card as before). The box is for reading only: it
// never takes a click, and it goes as soon as the pointer leaves the card,
// a drag starts, the page scrolls, or anything is clicked.
//
// Under the notes: a line for Waiting ("Waiting on Tech Services since
// Sat, Nov 14.") and one for the follow-up ("Then: ..."), each with its
// icon; then the card's checklist, read only, ticked items struck
// through. Whatever a card has shows; a card with none of it shows nothing.
//
// getCard(cardId) returns { notes, checklist, lines } for the card, or
// null; lines is a list of { kind: 'wait', 'then', or 'step', text }.

const WAIT = 450; // milliseconds of resting before the notes show
const MAX_CHARS = 1200; // a very long note shows its start, then "…"
const MAX_ITEMS = 12; // a long checklist shows its first 12, then "and 3 more"
const GAP = 8; // pixels between the card and the box

const BOX_EMPTY =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="4"></rect></svg>';
const BOX_FULL =
  '<svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="2.5" width="19" height="19" rx="4.5" fill="currentColor"></rect><path d="M8 12.5l3 3 5-6" fill="none" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></path></svg>';

const LINE_ICONS = {
  wait: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12M6 21h12"></path><path d="M8 3v3.5a4 4 0 0 0 1.8 3.3L12 11.5l2.2-1.7A4 4 0 0 0 16 6.5V3"></path><path d="M8 21v-3.5a4 4 0 0 1 1.8-3.3l2.2-1.7 2.2 1.7a4 4 0 0 1 1.8 3.3V21"></path></svg>',
  then: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 4v7a4 4 0 0 0 4 4h9"></path><path d="M15 11l4 4-4 4"></path></svg>',
  step: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 6h10M10 12h10M10 18h10"></path><path d="M4 5l1.5-1v4"></path><path d="M3.5 11.5a1.3 1.3 0 0 1 2.4.6c0 .9-2.4 1.9-2.4 2.9h2.5"></path><path d="M3.6 17.2h2.2l-1.2 1.4a1.1 1.1 0 1 1-1 1.6"></path></svg>',
};

const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

export function setupNotesPeek({ roots, getCard }) {
  const box = document.createElement('div');
  box.className = 'notes-peek';
  box.setAttribute('aria-hidden', 'true');
  box.hidden = true;
  document.body.append(box);

  let timer = 0;
  let current = null; // the card element the pointer is resting on

  for (const root of roots) {
    root.addEventListener('pointerover', (event) => {
      if (!finePointer.matches || document.body.classList.contains('is-dragging')) return;
      const card = event.target.closest('.card[data-drag-id]');
      if (!card || card === current) return;
      hide();
      current = card;
      timer = setTimeout(() => show(card), WAIT);
    });
    root.addEventListener('pointerout', (event) => {
      if (!current) return;
      // Still inside the same card (moving between its parts): keep it.
      if (event.relatedTarget && current.contains(event.relatedTarget)) return;
      hide();
    });
  }

  document.addEventListener('pointerdown', hide, true);
  document.addEventListener('keydown', hide, true);
  window.addEventListener('scroll', hide, true);
  window.addEventListener('resize', hide);

  function show(card) {
    if (!card.isConnected || document.body.classList.contains('is-dragging')) return;
    const found = getCard(card.dataset.dragId);
    if (!found) return;
    const notes = String(found.notes || '').trim();
    const items = Array.isArray(found.checklist) ? found.checklist : [];
    const lines = Array.isArray(found.lines) ? found.lines : [];
    if (!notes && !items.length && !lines.length) return;
    const parts = [];
    if (notes) {
      const text = document.createElement('p');
      text.className = 'notes-peek-text';
      text.textContent = notes.length > MAX_CHARS ? `${notes.slice(0, MAX_CHARS).trimEnd()}…` : notes;
      parts.push(text);
    }
    for (const line of lines) {
      const row = document.createElement('p');
      row.className = 'notes-peek-line';
      row.innerHTML = LINE_ICONS[line.kind] || '';
      const words = document.createElement('span');
      words.textContent = line.text;
      row.append(words);
      parts.push(row);
    }
    if (items.length) {
      const list = document.createElement('ul');
      list.className = 'notes-peek-list';
      for (const item of items.slice(0, MAX_ITEMS)) {
        const li = document.createElement('li');
        li.className = item.done ? 'is-done' : '';
        li.innerHTML = item.done ? BOX_FULL : BOX_EMPTY;
        const words = document.createElement('span');
        words.textContent = item.text;
        li.append(words);
        list.append(li);
      }
      if (items.length > MAX_ITEMS) {
        const more = document.createElement('li');
        more.className = 'notes-peek-more';
        more.textContent = `and ${items.length - MAX_ITEMS} more`;
        list.append(more);
      }
      parts.push(list);
    }
    box.replaceChildren(...parts);
    box.hidden = false;
    place(card);
  }

  // Beside the card: to the right if there's room, else to the left, else
  // below it; never off the screen.
  function place(card) {
    const r = card.getBoundingClientRect();
    const w = box.offsetWidth;
    const h = box.offsetHeight;
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    let left;
    let top = r.top;
    if (r.right + GAP + w <= vw - GAP) left = r.right + GAP;
    else if (r.left - GAP - w >= GAP) left = r.left - GAP - w;
    else {
      left = Math.min(Math.max(GAP, r.left), vw - GAP - w);
      top = r.bottom + GAP;
    }
    top = Math.min(Math.max(GAP, top), vh - GAP - h);
    box.style.left = `${Math.round(left)}px`;
    box.style.top = `${Math.round(top)}px`;
  }

  function hide() {
    clearTimeout(timer);
    current = null;
    box.hidden = true;
  }

  return { hide };
}
