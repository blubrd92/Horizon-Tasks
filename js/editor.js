// The card editor: a panel that slides in from the right when a card is
// clicked, or when you press Enter in quick add to start a new card. This
// file only fills in the form and collects what changed; app.js decides how
// changes are saved.

import { STATUS } from './model.js';

// onSave(cardId, changes) and onDone(cardId, changes) receive only the fields
// that differ from the card as it was when the panel opened. onCreate(values)
// receives every field of a new card. onClose(card, saved) runs whenever the
// panel closes; a new card has no id until it is saved.
export function setupEditor({ onSave, onDone, onCreate, onClose }) {
  const dialog = document.getElementById('editor');
  const form = document.getElementById('editor-form');
  const title = document.getElementById('editor-title');
  const titleError = document.getElementById('editor-title-error');
  const notes = document.getElementById('editor-notes');
  const due = document.getElementById('editor-due');
  const noDate = document.getElementById('editor-nodate');
  const someday = document.getElementById('editor-someday');
  const category = document.getElementById('editor-category');
  const progress = document.getElementById('editor-progress');
  const heading = document.getElementById('editor-heading');
  const saveButton = document.getElementById('editor-save');
  const doneButton = document.getElementById('editor-done');

  let card = null;
  let saved = false;

  // A new card (one without an id) isn't saved until you press Add card, so
  // it has nothing to mark done yet.
  function open(cardToEdit, categories) {
    card = cardToEdit;
    saved = false;
    const isNew = !card.id;
    heading.textContent = isNew ? 'New card' : 'Edit card';
    saveButton.textContent = isNew ? 'Add card' : 'Save';
    doneButton.hidden = isNew;
    title.value = card.title;
    titleError.hidden = true;
    title.removeAttribute('aria-invalid');
    notes.value = card.notes;
    due.value = card.dueDate || '';
    fillCategories(categories);
    progress.checked = card.status === STATUS.IN_PROGRESS;
    updateSomedayNote();
    dialog.showModal();
    // A new card's title is already typed; the date is usually next.
    if (isNew) due.focus();
  }

  function fillCategories(categories) {
    const options = categories.map((c) => ({ value: c.id, label: c.name }));
    if (!card.category) {
      options.unshift({ value: '', label: 'No category' });
    } else if (!categories.some((c) => c.id === card.category)) {
      // A category id that isn't on the profile (typed by hand in the
      // console, say). Kept as an option so opening the card doesn't change it.
      options.unshift({ value: card.category, label: `${card.category} (not in your categories)` });
    }
    category.replaceChildren(
      ...options.map(({ value, label }) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        return option;
      }),
    );
    category.value = card.category || '';
  }

  function updateSomedayNote() {
    someday.hidden = Boolean(due.value);
  }

  // Every field as the form shows it. Returns null if the title is empty,
  // after pointing that out.
  function collectValues() {
    const newTitle = title.value.trim();
    if (!newTitle) {
      titleError.hidden = false;
      title.setAttribute('aria-invalid', 'true');
      title.setAttribute('aria-describedby', 'editor-title-error');
      title.focus();
      return null;
    }
    return {
      title: newTitle,
      notes: notes.value,
      dueDate: due.value || null,
      category: category.value || null,
      status: progress.checked ? STATUS.IN_PROGRESS : STATUS.OPEN,
    };
  }

  // The fields that differ from the card as opened, or null as above.
  function collectChanges() {
    const values = collectValues();
    if (!values) return null;
    const changes = {};
    for (const [key, value] of Object.entries(values)) {
      if (value !== card[key]) changes[key] = value;
    }
    return changes;
  }

  function close() {
    dialog.close();
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!card.id) {
      const values = collectValues();
      if (!values) return;
      onCreate(values);
    } else {
      const changes = collectChanges();
      if (!changes) return;
      if (Object.keys(changes).length) onSave(card.id, changes);
    }
    saved = true;
    close();
  });

  doneButton.addEventListener('click', () => {
    const changes = collectChanges();
    if (!changes) return;
    // Marking done sets the status itself.
    delete changes.status;
    onDone(card.id, changes);
    saved = true;
    close();
  });

  document.getElementById('editor-close').addEventListener('click', close);
  document.getElementById('editor-cancel').addEventListener('click', close);

  // A click on the dimmed board outside the panel lands on the dialog
  // element itself, since the form fills the whole panel.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) close();
  });

  noDate.addEventListener('click', () => {
    due.value = '';
    updateSomedayNote();
    due.focus();
  });
  due.addEventListener('input', updateSomedayNote);

  title.addEventListener('input', () => {
    if (titleError.hidden) return;
    titleError.hidden = true;
    title.removeAttribute('aria-invalid');
  });

  dialog.addEventListener('close', () => {
    if (!card) return;
    const closed = card;
    card = null;
    onClose(closed, saved);
  });

  return { open, close };
}
