// The quick add field under the header. Type a title, then:
//   Enter          open it as a new card, to add a date and details first
//   Ctrl+Enter     save it to Someday right away (Cmd+Enter on a Mac)
//   Shift+Enter    save it to Today right away
// This file only reads the field; app.js decides how the card is saved.

// onCompose(title) opens the new-card panel. onAdd(title, toToday) saves the
// card and returns { id, saved }, where `saved` fails if the save is refused.
// onEdit(id) opens that card.
export function setupQuickAdd({ input, status, onCompose, onAdd, onEdit }) {
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
      status.textContent = '';
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
    status.textContent = `${text} `;
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'link-button';
    edit.textContent = 'Edit';
    edit.addEventListener('click', () => onEdit(id));
    status.append(edit);
  }

  function showText(text) {
    status.textContent = text;
  }

  return {
    showAdded,
    showText,
    // Puts text back in the field, unless something new was typed meanwhile.
    giveBack(title) {
      if (!input.value) input.value = title;
    },
    clear() {
      input.value = '';
      status.textContent = '';
    },
    // Off until the board knows whose cards it is showing.
    setEnabled(enabled) {
      input.disabled = !enabled;
    },
  };
}
