// The quick add field under the header. Type a title, then:
//   Enter          open it as a new card, to add a date and details first
//   Ctrl+Enter     save it to Someday right away (Cmd+Enter on a Mac)
//   Shift+Enter    save it to Today right away
// This file only reads the field; app.js decides how the card is saved.
//
// The spot beside the field is shared. The Since yesterday line normally
// sits there. A confirmation ("Added to Someday. Edit") takes the spot for
// a few seconds, waiting while the pointer or keyboard focus is on it, then
// fades and gives it back. An error stays until the next quick add.

const CONFIRM_FOR = 6000; // milliseconds a confirmation stays
const FADE = 300; // milliseconds it takes to fade (matches the CSS)

// onCompose(title) opens the new-card panel. onAdd(title, toToday) saves the
// card and returns { id, saved }, where `saved` fails if the save is refused.
// onEdit(id) opens that card. `since` is the Since yesterday line.
export function setupQuickAdd({ input, status, since, onCompose, onAdd, onEdit }) {
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

    const quick = event.ctrlKey || event.metaKey || event.shiftKey;
    input.value = '';
    if (!quick) {
      clearMessage();
      onCompose(title);
      return;
    }

    const toToday = event.shiftKey;
    const { id, saved } = onAdd(title, toToday);
    showAdded(`Added to ${toToday ? 'Today' : 'Someday'}.`, id);

    saved.catch((err) => {
      showText(`Couldn't save “${title}” (${err.code || err.message}).`);
      // Give the text back so nothing typed is lost.
      if (!input.value) input.value = title;
    });
  });

  function showAdded(text, id) {
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'link-button';
    edit.textContent = 'Edit';
    edit.addEventListener('click', () => onEdit(id));
    showMessage([`${text} `, edit]);
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
