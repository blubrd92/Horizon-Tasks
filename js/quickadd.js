// The quick add field under the header. Type a title, then press Enter,
// Alt+Enter (Option on a Mac), Ctrl+Enter (or Cmd+Enter on a Mac), or
// Shift+Enter. What each key does is yours to set in Settings; out of the
// box:
//   Enter          read it with Claude (slice 3c): app.js decides where
//                  it goes
//   Alt+Enter      open it as a new card in the editor
//   Ctrl+Enter     save it to Someday right away
//   Shift+Enter    save it to Today right away
// Where Claude isn't on offer (a project page, or no backend), "read with
// Claude" opens the editor instead. This file only reads the field;
// app.js decides how the card is saved.
//
// The spot beside the field is shared. The Since yesterday line normally
// sits there. A confirmation ("Added to Someday. Edit") takes the spot for
// a few seconds, waiting while the pointer or keyboard focus is on it, then
// fades and gives it back. An error stays until the next quick add.

const CONFIRM_FOR = 6000; // milliseconds a confirmation stays
const FADE = 300; // milliseconds it takes to fade (matches the CSS)
// A paste longer than this, or with more than one line, is taken for an
// email and sent to the Inbox to read (when onPasteText is given). A
// shorter one-line paste is ordinary typing.
const LONG_PASTE = 200;

// True if pasted text looks like an email rather than a title.
export function looksLikeEmail(text) {
  const trimmed = String(text || '').trim();
  return /\n/.test(trimmed) || trimmed.length > LONG_PASTE;
}

// onCompose(title) opens the new-card panel. onAdd(title, toToday) saves the
// card and returns { id, saved }, where `saved` fails if the save is refused.
// onRead(title), if given, reads it with Claude; without it, that job opens
// the editor. keys() returns what each key does (settings.quickAddKeys).
// onEdit(id) opens that card. `since` is the Since yesterday line.
// onPasteText(text), if given, takes a pasted email to the Inbox and
// returns undo() (or null if it couldn't); without it, every paste is a
// normal paste.
export function setupQuickAdd({ input, status, since, onCompose, onAdd, onRead, keys, onEdit, onPasteText }) {
  let timer = 0;
  let deadline = 0;
  // A confirmation stays put while you're pointing at it or on its button.
  let held = false;
  status.addEventListener('pointerenter', () => hold(true));
  status.addEventListener('pointerleave', () => hold(status.contains(document.activeElement)));
  status.addEventListener('focusin', () => hold(true));
  status.addEventListener('focusout', (event) => hold(status.contains(event.relatedTarget) || status.matches(':hover')));

  input.addEventListener('keydown', (event) => {
    // isComposing: Enter that finishes an accented or non-Latin character
    // shouldn't also add the card.
    if (event.key !== 'Enter' || event.isComposing) return;
    event.preventDefault();
    const title = input.value.trim();
    if (!title) return;

    // One key per press: Shift wins, then Ctrl (or Cmd), then Alt.
    const key = event.shiftKey ? 'shift' : event.ctrlKey || event.metaKey ? 'ctrl' : event.altKey ? 'alt' : 'enter';
    let job = keys()[key];
    if (job === 'claude' && !onRead) job = 'editor';
    input.value = '';
    if (job === 'claude') {
      onRead(title);
      return;
    }
    if (job !== 'someday' && job !== 'today') {
      clearMessage();
      onCompose(title);
      return;
    }

    const toToday = job === 'today';
    const { id, saved } = onAdd(title, toToday);
    showAdded(`Added to ${toToday ? 'Today' : 'Someday'}.`, id);

    saved.catch((err) => {
      showText(`Couldn't save “${title}” (${err.code || err.message}).`);
      // Give the text back so nothing typed is lost.
      if (!input.value) input.value = title;
    });
  });

  // Pasting an email here sends it to the Inbox (someone else's writing
  // always waits for review there; quick add's straight-to-the-board path
  // is for your own words). A screenshot is left alone: the Inbox's own
  // paste handler takes images anywhere on the board.
  input.addEventListener('paste', (event) => {
    if (!onPasteText) return;
    const data = event.clipboardData;
    if (!data || data.files.length) return;
    const text = data.getData('text/plain');
    if (!looksLikeEmail(text)) return;
    const undo = onPasteText(text);
    if (!undo) return;
    event.preventDefault();
    showAction('Sent the pasted text to the Inbox to read.', 'Paste it here instead', () => {
      undo();
      clearMessage();
      // The field holds one line, so line breaks become spaces.
      const flat = text.replace(/\s+/g, ' ').trim();
      input.value = input.value.trim() ? `${input.value.trim()} ${flat}` : flat;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    });
  });

  function showAdded(text, id) {
    showAction(text, 'Edit', () => onEdit(id));
  }

  // A confirmation with one button after it ("Edit", "Review").
  function showAction(text, label, onClick) {
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'link-button';
    action.textContent = label;
    action.addEventListener('click', onClick);
    showMessage([`${text} `, action]);
    deadline = performance.now() + CONFIRM_FOR;
    schedule();
  }

  // A note that fades like a confirmation (a strip day you tapped).
  function showNote(text) {
    showMessage([text]);
    deadline = performance.now() + CONFIRM_FOR;
    schedule();
  }

  // Errors stay until the next quick add.
  function showText(text) {
    showMessage([text]);
  }

  function showMessage(parts) {
    clearTimeout(timer);
    deadline = 0;
    status.classList.remove('is-fading');
    // The status stays in the page even when empty, so screen readers
    // announce what appears in it.
    status.replaceChildren(...parts);
    since.hidden = true;
  }

  function hold(on) {
    held = on;
    if (!deadline) return;
    if (on) {
      clearTimeout(timer);
      status.classList.remove('is-fading');
    } else {
      // Leaving gives it a moment before it goes, rather than vanishing.
      deadline = Math.max(deadline, performance.now() + 2000);
      schedule();
    }
  }

  function schedule() {
    clearTimeout(timer);
    if (held) return;
    timer = setTimeout(fade, Math.max(0, deadline - performance.now()));
  }

  function fade() {
    status.classList.add('is-fading');
    timer = setTimeout(clearMessage, FADE);
  }

  function clearMessage() {
    clearTimeout(timer);
    deadline = 0;
    held = false;
    // If focus was on the Edit button, put it somewhere sensible.
    const hadFocus = status.contains(document.activeElement);
    status.classList.remove('is-fading');
    status.replaceChildren();
    since.hidden = !since.hasChildNodes();
    if (hadFocus) input.focus();
  }

  // parts is { lead, strong, rest } from since.js, or null for no line.
  function setSince(parts) {
    if (!parts) {
      since.replaceChildren();
    } else {
      const strong = document.createElement('span');
      strong.className = 'since-strong';
      strong.textContent = parts.strong;
      since.replaceChildren(`${parts.lead} `, strong, parts.rest);
    }
    since.hidden = !since.hasChildNodes() || status.hasChildNodes();
  }

  return {
    showAdded,
    showAction,
    showNote,
    // Takes away a confirmation or note at once (an error stays).
    dismissNote() {
      if (deadline) clearMessage();
    },
    showText,
    setSince,
    // Puts text back in the field, unless something new was typed meanwhile.
    giveBack(title) {
      if (!input.value) input.value = title;
    },
    clear() {
      input.value = '';
      clearMessage();
      setSince(null);
    },
    // Off until the board knows whose cards it is showing.
    setEnabled(enabled) {
      input.disabled = !enabled;
    },
  };
}
