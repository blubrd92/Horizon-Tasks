// Notes on hover: rest the pointer on a card that has notes, and after a
// moment a small box beside it shows them, so you can read them without
// opening the card. Only with a mouse or trackpad (a touch screen has no
// hover; a tap opens the card as before). The box is for reading only: it
// never takes a click, and it goes as soon as the pointer leaves the card,
// a drag starts, the page scrolls, or anything is clicked.
//
// getNotes(cardId) returns the card's notes, or "" for none.

const WAIT = 450; // milliseconds of resting before the notes show
const MAX_CHARS = 1200; // a very long note shows its start, then "…"
const GAP = 8; // pixels between the card and the box

const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

export function setupNotesPeek({ roots, getNotes }) {
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
    const notes = String(getNotes(card.dataset.dragId) || '').trim();
    if (!notes) return;
    box.textContent = notes.length > MAX_CHARS ? `${notes.slice(0, MAX_CHARS).trimEnd()}…` : notes;
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
