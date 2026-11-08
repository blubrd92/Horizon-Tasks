// The Inbox: the panel where screenshots become drafts, and drafts become
// cards only when you say so (SPEC "The Inbox review panel").
//
// Two kinds of item live in the panel:
//   - a screenshot being read, or one that failed: in this tab's memory
//     only, never saved. It has Try again (when that could help) and
//     Discard.
//   - a draft: saved in Firestore (users/{uid}/inbox), so it survives a
//     reload and shows on your other devices. Its fields save as you leave
//     them.
// The screenshot itself is kept only here, in memory, as a preview, until
// you press Add to board or Discard (or sign out, or close the tab). It is
// never saved anywhere. After a reload, a draft shows a note in its place.
//
// This file also takes screenshots in: a paste (Ctrl/Cmd+V) or a dropped
// image anywhere on the board, or the panel's file picker. app.js decides
// how drafts are saved and how the backend is called.

import { canRetry } from './backend.js';
import { isISODate } from './dates.js';
import { draftNotes, newCard, newDraft } from './model.js';
import { shrink, splitImages, toBase64 } from './screenshot.js';

const MAX_AT_ONCE = 5;
const NO_CATEGORY_COLOR = '#6B6F78';
// Haiku 5.5's prices per token, for the console's cost line only
// (Anthropic's pricing page, 2026-11-08: $0.10 and $0.50 per million).
const PRICE_IN = 0.1 / 1e6;
const PRICE_OUT = 0.5 / 1e6;

const finePointer = window.matchMedia('(any-pointer: fine)');
const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

// read(image) sends { mediaType, data } to the backend and returns its
// answer. saveDraft(fields) returns { id, saved }. changeDraft(id, changes)
// and discardDraft(id) return promises. addToBoard(id, card) returns
// { id, saved }. categories() is your category list. addedText(dueDate)
// says where a new card went. onCount(n) hears the number of items.
// onBoard() is true while the board is on screen, where pastes and drops
// are taken.
export function setupInbox({ read, saveDraft, changeDraft, discardDraft, addToBoard, categories, addedText, onCount, onBoard }) {
  const dialog = document.getElementById('inbox');
  const list = document.getElementById('inbox-list');
  const line = document.getElementById('inbox-line');
  const status = document.getElementById('inbox-status');
  const closeButton = document.getElementById('inbox-close');
  const dropText = document.getElementById('inbox-drop-text');
  const pickButton = document.getElementById('inbox-pick');
  const fileInput = document.getElementById('inbox-file');
  const overlay = document.getElementById('drop-overlay');

  let enabled = false;
  let drafts = [];
  // Screenshots being read or that failed, by a number of their own.
  const pending = new Map();
  let nextPid = 1;
  // Draft id -> the preview's address, for drafts made in this tab.
  const previews = new Map();
  // Item key ("p3", "d<id>") -> its element and fields.
  const shown = new Map();
  let scrollTo = null;
  // Screenshots are read one at a time.
  let queue = Promise.resolve();

  closeButton.addEventListener('click', close);
  pickButton.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const files = [...fileInput.files];
    fileInput.value = '';
    take(files);
  });
  drawDropText();
  finePointer.addEventListener('change', drawDropText);

  // --- Taking screenshots in -----------------------------------------------

  // Pastes and drops count only on the board, and not while some other
  // panel (the card editor, say) is open over it.
  function allowed() {
    return enabled && onBoard() && [...document.querySelectorAll('dialog[open]')].every((d) => d === dialog);
  }

  document.addEventListener('paste', (event) => {
    if (!allowed()) return;
    const { images } = splitImages(event.clipboardData && event.clipboardData.files);
    // Text in the clipboard pastes as usual; only an image is taken.
    if (!images.length) return;
    event.preventDefault();
    take(images);
  });

  const hasFiles = (event) => event.dataTransfer && [...event.dataTransfer.types].includes('Files');
  let overTimer = 0;
  document.addEventListener('dragover', (event) => {
    if (!enabled || !hasFiles(event)) return;
    // Stops the browser from opening a dropped file in place of Horizon.
    event.preventDefault();
    if (!allowed()) {
      event.dataTransfer.dropEffect = 'none';
      return;
    }
    event.dataTransfer.dropEffect = 'copy';
    showOver(true);
    // dragover repeats while a file is over the page; when it stops, the
    // file has left.
    clearTimeout(overTimer);
    overTimer = setTimeout(() => showOver(false), 150);
  });
  document.addEventListener('drop', (event) => {
    if (!enabled || !hasFiles(event)) return;
    event.preventDefault();
    showOver(false);
    if (allowed()) take(event.dataTransfer.files);
  });

  function showOver(on) {
    if (dialog.open) {
      dialog.classList.toggle('is-dropping', on);
      overlay.hidden = true;
    } else {
      overlay.hidden = !on;
    }
  }

  function drawDropText() {
    if (finePointer.matches) {
      const key = document.createElement('kbd');
      key.className = 'inbox-key';
      key.textContent = isMac ? 'Cmd+V' : 'Ctrl+V';
      dropText.replaceChildren('Paste a screenshot with ', key, ', or drop an image here.');
      pickButton.textContent = 'Choose a file';
    } else {
      dropText.textContent = 'Choose a screenshot from your photos.';
      pickButton.textContent = 'Choose a screenshot';
    }
  }

  // Starts reading pasted, dropped, or picked images.
  function take(fileList) {
    if (!enabled) return;
    const { images, others } = splitImages(fileList);
    open();
    const notes = [];
    if (!images.length) {
      showStatus("That isn't an image. Horizon reads screenshots: PNG, JPEG, WebP, or GIF.");
      return;
    }
    if (others) notes.push('Only the images were taken.');
    if (images.length > MAX_AT_ONCE) notes.push(`Up to ${MAX_AT_ONCE} at a time: the first ${MAX_AT_ONCE} are being read.`);
    showStatus(notes.join(' '));
    for (const file of images.slice(0, MAX_AT_ONCE)) {
      const item = { pid: nextPid++, file, blob: null, url: null, width: 0, height: 0, state: 'reading', error: null };
      pending.set(item.pid, item);
      scrollTo = `p${item.pid}`;
      queue = queue.then(() => process(item));
    }
    render();
  }

  async function process(item) {
    if (!pending.has(item.pid)) return; // discarded while waiting
    if (!item.blob) {
      try {
        const small = await shrink(item.file);
        item.blob = small.blob;
        item.width = small.width;
        item.height = small.height;
        item.url = URL.createObjectURL(small.blob);
      } catch (err) {
        console.warn('Could not open the image', err);
        item.error = { message: "This browser couldn't open that image. Try a PNG or JPEG screenshot.", retry: false };
        item.state = 'failed';
        render();
        return;
      } finally {
        // The original file is let go once the small copy exists.
        item.file = null;
      }
      if (!pending.has(item.pid)) {
        forget(item);
        return;
      }
      render();
    }

    item.state = 'reading';
    item.error = null;
    render();
    let answer;
    try {
      // The base64 copy exists only for the length of the request.
      answer = await read({ mediaType: 'image/jpeg', data: await toBase64(item.blob) });
    } catch (err) {
      answer = { ok: false, error: 'unreachable', message: `Something went wrong reading the screenshot (${err.message}).` };
    }
    // Discarded, or signed out, while it was being read: the answer goes
    // unused.
    if (!pending.has(item.pid) || !enabled) return;

    if (!answer.ok) {
      console.info(`Screenshot refused: ${answer.error}`);
      item.state = 'failed';
      item.error = { message: answer.message, retry: canRetry(answer.error) };
      render();
      return;
    }

    logCost(item, answer);
    const { id, saved } = saveDraft(newDraft(answer.draft));
    // The screenshot stays a pending item until the draft arrives from
    // Firestore (a moment later), then hands its preview over to it.
    previews.set(id, item.url);
    item.draftId = id;
    item.state = 'saving';
    render();
    saved.catch((err) => {
      // Firestore refused the draft: back to a failed screenshot, which
      // still has its image, so Try again works.
      previews.delete(id);
      item.draftId = null;
      item.state = 'failed';
      item.error = { message: `The draft didn't save (${err.code || err.message}).`, retry: true };
      pending.set(item.pid, item);
      render();
    });
  }

  function logCost(item, answer) {
    const tokens = answer.tokens || {};
    const input = Number(tokens.input) || 0;
    const output = Number(tokens.output) || 0;
    const cost = input * PRICE_IN + output * PRICE_OUT;
    const usage = answer.usage ? ` ${answer.usage.used} of ${answer.usage.limit} AI requests used today.` : '';
    console.info(
      `Screenshot: ${item.width}×${item.height}, ${Math.round((answer.sentBytes || 0) / 1024)} KB sent, ` +
        `${input.toLocaleString()} tokens in, ${output.toLocaleString()} out, about $${cost.toFixed(4)}.${usage}`,
    );
  }

  function retry(item) {
    item.state = 'reading';
    item.error = null;
    render();
    queue = queue.then(() => process(item));
  }

  function forget(item) {
    if (item.url) URL.revokeObjectURL(item.url);
    item.url = null;
    item.blob = null;
    item.file = null;
  }

  function dropPreview(id) {
    const url = previews.get(id);
    previews.delete(id);
    if (url && !inUse(url)) URL.revokeObjectURL(url);
  }

  // --- Drawing the panel ---------------------------------------------------

  function count() {
    return drafts.length + pending.size;
  }

  // The preview stays while a screenshot still being read or saved uses it.
  function inUse(url) {
    return [...pending.values()].some((item) => item.url === url);
  }

  function render() {
    const n = count();
    line.textContent = n
      ? `${n} ${n === 1 ? 'draft' : 'drafts'} to look over. Nothing reaches the board until you add it, and screenshots are never saved.`
      : 'Nothing to look over. Cards reach the board only when you add them, and screenshots are never saved.';
    onCount(n);

    const ordered = [...drafts].sort((a, b) => a.createdAt - b.createdAt);
    const keys = [];
    for (const draft of ordered) {
      const key = `d${draft.id}`;
      keys.push(key);
      const entry = shown.get(key) || buildDraft(draft);
      shown.set(key, entry);
      fillDraft(entry, draft);
    }
    for (const item of pending.values()) {
      const key = `p${item.pid}`;
      keys.push(key);
      const entry = shown.get(key) || buildPending(item);
      shown.set(key, entry);
      fillPending(entry, item);
    }
    for (const [key, entry] of shown) {
      if (!keys.includes(key)) {
        entry.el.remove();
        shown.delete(key);
      }
    }
    // Put them in order, moving only what's out of place, so a field you're
    // typing in keeps its focus.
    keys.forEach((key, i) => {
      const el = shown.get(key).el;
      if (list.children[i] !== el) list.insertBefore(el, list.children[i] || null);
    });

    if (scrollTo && shown.has(scrollTo) && dialog.open) {
      shown.get(scrollTo).el.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
    }
    scrollTo = null;
  }

  function reducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function shotBox() {
    const box = document.createElement('div');
    box.className = 'inbox-shot';
    return box;
  }

  // The screenshot, if this tab still has it; otherwise a note.
  function fillShot(box, url) {
    const img = box.querySelector('img');
    if (url) {
      if (img && img.getAttribute('src') === url) return;
      const fresh = document.createElement('img');
      fresh.src = url;
      fresh.alt = 'Your screenshot, for checking';
      box.classList.remove('is-gone');
      box.replaceChildren(fresh);
    } else if (img || !box.textContent) {
      box.classList.add('is-gone');
      box.replaceChildren("The screenshot isn't kept, so it's gone after a reload. Check the details against the original if you need to.");
    }
  }

  function button(text, className) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = className;
    b.textContent = text;
    return b;
  }

  function buildPending(item) {
    const el = document.createElement('article');
    el.className = 'inbox-item is-pending';
    el.setAttribute('aria-label', 'Screenshot being read');
    const shot = shotBox();
    const message = document.createElement('p');
    message.className = 'inbox-reading';
    message.setAttribute('role', 'status');
    const foot = document.createElement('div');
    foot.className = 'inbox-foot';
    const discard = button('Discard', 'button');
    const again = button('Try again', 'button button-primary');
    foot.append(discard, again);
    el.append(shot, message, foot);
    discard.addEventListener('click', () => {
      const next = neighborFocus(`p${item.pid}`);
      pending.delete(item.pid);
      forget(item);
      showStatus('Discarded.');
      render();
      next();
    });
    again.addEventListener('click', () => retry(item));
    return { el, shot, message, foot, again };
  }

  function fillPending(entry, item) {
    if (item.url) fillShot(entry.shot, item.url);
    else entry.shot.replaceChildren();
    entry.el.classList.toggle('is-failed', item.state === 'failed');
    entry.message.textContent =
      item.state === 'failed' ? item.error.message : item.state === 'saving' ? 'Saving the draft…' : 'Reading the screenshot…';
    entry.foot.hidden = item.state !== 'failed';
    entry.again.hidden = !(item.error && item.error.retry);
  }

  let uniq = 0;
  function buildDraft(draft) {
    const id = draft.id;
    const n = ++uniq;
    const el = document.createElement('article');
    el.className = 'inbox-item';
    el.setAttribute('aria-labelledby', `inbox-title-label-${n}`);
    const shot = shotBox();

    const titleField = document.createElement('label');
    titleField.className = 'field';
    titleField.id = `inbox-title-label-${n}`;
    const title = document.createElement('input');
    title.type = 'text';
    title.className = 'field-input field-title';
    title.maxLength = 200;
    title.autocomplete = 'off';
    titleField.append('Title', title);
    const titleError = document.createElement('p');
    titleError.className = 'field-error';
    titleError.id = `inbox-title-error-${n}`;
    titleError.textContent = 'A card needs a title.';
    titleError.hidden = true;
    title.setAttribute('aria-describedby', titleError.id);

    const row = document.createElement('div');
    row.className = 'field-row inbox-row';
    const dueField = document.createElement('label');
    dueField.className = 'field';
    const due = document.createElement('input');
    due.type = 'date';
    due.className = 'field-input field-date';
    dueField.append('Due', due);
    const categoryField = document.createElement('label');
    categoryField.className = 'field';
    const category = document.createElement('select');
    category.className = 'field-input';
    categoryField.append('Category', category);
    row.append(dueField, categoryField);

    const note = document.createElement('p');
    note.className = 'inbox-note';
    note.id = `inbox-note-${n}`;
    due.setAttribute('aria-describedby', note.id);

    const hardLabel = document.createElement('label');
    hardLabel.className = 'check';
    const hard = document.createElement('input');
    hard.type = 'checkbox';
    hardLabel.append(hard, 'Hard deadline');

    const notes = document.createElement('p');
    notes.className = 'inbox-notes';

    const foot = document.createElement('div');
    foot.className = 'inbox-foot';
    const discard = button('Discard', 'button');
    const add = button('Add to board', 'button button-primary');
    foot.append(discard, add);

    el.append(shot, titleField, titleError, row, note, hardLabel, notes, foot);
    const entry = { el, id, shot, title, titleError, due, category, note, hard, notes, add, discard, stored: {} };

    // Each field saves when you leave it (or pick from it).
    title.addEventListener('input', () => {
      if (title.value.trim()) clearTitleError(entry);
    });
    title.addEventListener('change', () => {
      const value = title.value.trim();
      if (value && value !== entry.stored.title) save(entry, { title: value });
    });
    due.addEventListener('change', () => {
      const value = isISODate(due.value) ? due.value : null;
      drawNote(entry);
      if (value !== entry.stored.dueDate) save(entry, { dueDate: value });
    });
    category.addEventListener('change', () => {
      drawColor(entry);
      const value = category.value || null;
      if (value !== entry.stored.category) save(entry, { category: value });
    });
    hard.addEventListener('change', () => {
      save(entry, { deadlineType: hard.checked ? 'hard' : 'soft' });
    });
    discard.addEventListener('click', () => discardDraftItem(entry));
    add.addEventListener('click', () => addDraftItem(entry));
    return entry;
  }

  // Fills a draft's fields from Firestore, leaving alone any field you're
  // in the middle of, and any you've changed that hasn't come back yet.
  function fillDraft(entry, draft) {
    entry.draft = draft;
    fillShot(entry.shot, previews.get(draft.id));
    // A field takes Firestore's value the first time, and again only when
    // that value changes (from another device, or a refused save putting it
    // back), and never while you're in it.
    const was = entry.stored;
    const fresh = (prop) => !(prop in was) || draft[prop] !== was[prop];
    if (fresh('title') && document.activeElement !== entry.title) entry.title.value = draft.title;
    if (fresh('dueDate') && document.activeElement !== entry.due) entry.due.value = draft.dueDate || '';
    fillCategories(entry, draft);
    if (fresh('deadlineType')) entry.hard.checked = draft.deadlineType === 'hard';
    entry.stored = { title: draft.title, dueDate: draft.dueDate, category: draft.category, deadlineType: draft.deadlineType };

    const text = draftNotes(draft);
    entry.notes.hidden = !text;
    const label = document.createElement('span');
    label.className = 'inbox-notes-label';
    label.textContent = 'Notes';
    entry.notes.replaceChildren(label, text);
    drawNote(entry);
    drawColor(entry);
  }

  function fillCategories(entry, draft) {
    const select = entry.category;
    if (document.activeElement === select) return;
    const mine = categories();
    const options = [{ value: '', label: 'No category' }, ...mine.map((c) => ({ value: c.id, label: c.name }))];
    // A category id that isn't yours any more stays, so it isn't lost.
    if (draft.category && !mine.some((c) => c.id === draft.category)) {
      options.push({ value: draft.category, label: `${draft.category} (not in your categories)` });
    }
    const keep = 'category' in entry.stored && draft.category === entry.stored.category ? select.value : draft.category || '';
    const sameOptions =
      select.options.length === options.length && options.every((o, i) => select.options[i].value === o.value && select.options[i].text === o.label);
    if (!sameOptions) {
      select.replaceChildren(
        ...options.map(({ value, label }) => {
          const option = document.createElement('option');
          option.value = value;
          option.textContent = label;
          return option;
        }),
      );
    }
    select.value = keep;
  }

  // The note under the date: what Haiku made of it, while the date is
  // still Haiku's.
  function drawNote(entry) {
    const draft = entry.draft;
    const due = entry.due.value || null;
    let text = '';
    let tone = '';
    if (draft.aiDueDate && due === draft.aiDueDate) {
      if (draft.dueDateConfidence === 'explicit') {
        text = 'Date read directly from the screenshot.';
        tone = 'is-explicit';
      } else {
        text = draft.dueDateQuote
          ? `Date inferred from “${draft.dueDateQuote.replace(/[.\s]+$/, '')}.” Worth a second look.`
          : 'Date inferred, not read directly. Worth a second look.';
        tone = 'is-inferred';
      }
    } else if (!draft.aiDueDate && !due) {
      text = 'No date in the screenshot. Without one, it goes to Someday.';
      tone = 'is-none';
    }
    entry.note.className = `inbox-note ${tone}`;
    entry.note.textContent = text;
    entry.note.hidden = !text;
  }

  function drawColor(entry) {
    const found = categories().find((c) => c.id === entry.category.value);
    entry.el.style.borderTopColor = found && /^#[0-9a-f]{6}$/i.test(found.color) ? found.color : NO_CATEGORY_COLOR;
  }

  function save(entry, changes) {
    Object.assign(entry.stored, changes);
    changeDraft(entry.id, changes).catch((err) => {
      showStatus(`A change to the draft didn't save (${err.code || err.message}).`);
    });
  }

  function clearTitleError(entry) {
    entry.titleError.hidden = true;
    entry.title.removeAttribute('aria-invalid');
  }

  // After Add or Discard, the item waits a moment for Firestore to take it
  // away; its buttons are off meanwhile, so a second tap can't make a
  // second card.
  function hold(entry, on) {
    entry.add.disabled = on;
    entry.discard.disabled = on;
  }

  function discardDraftItem(entry) {
    hold(entry, true);
    const next = neighborFocus(`d${entry.id}`);
    dropPreview(entry.id);
    showStatus('Discarded.');
    discardDraft(entry.id).catch((err) => {
      hold(entry, false);
      showStatus(`The draft wasn't discarded (${err.code || err.message}).`);
    });
    // Firestore's own copy updates at once; the panel redraws from it.
    next();
  }

  function addDraftItem(entry) {
    const title = entry.title.value.trim();
    if (!title) {
      entry.titleError.hidden = false;
      entry.title.setAttribute('aria-invalid', 'true');
      entry.title.focus();
      return;
    }
    clearTitleError(entry);
    hold(entry, true);
    const dueDate = isISODate(entry.due.value) ? entry.due.value : null;
    const card = {
      ...newCard({ title, dueDate }),
      source: 'screenshot',
      category: entry.category.value || null,
      deadlineType: entry.hard.checked ? 'hard' : 'soft',
      notes: draftNotes(entry.draft),
    };
    const next = neighborFocus(`d${entry.id}`);
    dropPreview(entry.id);
    const { saved } = addToBoard(entry.id, card);
    showStatus(addedText(dueDate));
    saved.catch((err) => {
      hold(entry, false);
      showStatus(`“${title}” didn't reach the board (${err.code || err.message}), so the draft is back.`);
    });
    next();
  }

  // Where keyboard focus goes once an item leaves: the next item's first
  // field, or the one before, or the file button. Worked out before the
  // item goes; run after.
  function neighborFocus(key) {
    const keys = [...shown.keys()];
    const at = keys.indexOf(key);
    const otherKey = keys[at + 1] || keys[at - 1];
    return () => {
      requestAnimationFrame(() => {
        const other = otherKey && shown.get(otherKey);
        const target = other ? other.el.querySelector('input, button:not([hidden])') : pickButton;
        if (dialog.open && target) target.focus();
      });
    };
  }

  function showStatus(text) {
    status.textContent = text;
  }

  // --- Opening and closing -------------------------------------------------

  function open() {
    if (!enabled || dialog.open) return;
    showStatus('');
    dialog.showModal();
    render();
  }

  function close() {
    if (dialog.open) dialog.close();
    dialog.classList.remove('is-dropping');
  }

  return {
    open,
    close,
    take,
    setEnabled(on) {
      enabled = on;
    },
    // The drafts from Firestore, now and whenever they change.
    setDrafts(next) {
      const before = new Set(drafts.map((d) => d.id));
      drafts = next;
      const now = new Set(drafts.map((d) => d.id));
      // A screenshot whose draft has arrived gives way to it.
      for (const item of [...pending.values()]) {
        if (item.draftId && now.has(item.draftId)) {
          pending.delete(item.pid);
          scrollTo = `d${item.draftId}`;
        }
      }
      // A draft that's gone (added or discarded, here or on another device)
      // takes its preview with it.
      for (const id of [...previews.keys()]) {
        if (before.has(id) && !now.has(id)) dropPreview(id);
      }
      render();
    },
    // Signing out: everything goes, the screenshots first.
    reset() {
      enabled = false;
      close();
      for (const item of pending.values()) forget(item);
      pending.clear();
      for (const id of [...previews.keys()]) dropPreview(id);
      drafts = [];
      for (const entry of shown.values()) entry.el.remove();
      shown.clear();
      showStatus('');
      overlay.hidden = true;
      render();
    },
  };
}
