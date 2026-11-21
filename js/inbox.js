// The Inbox: the panel where screenshots and pasted text become drafts,
// and drafts become cards only when you say so (SPEC "The Inbox review
// panel").
//
// Two kinds of item live in the panel:
//   - a screenshot or pasted text being read, or one that failed: in this
//     tab's memory only, never saved. It has Try again (when that could
//     help) and Discard.
//   - a draft: saved in Firestore (users/{uid}/inbox), so it survives a
//     reload and shows on your other devices. Its fields, notes included,
//     save as you leave them. Drafts come from screenshots, pasted text,
//     and quick add lines whose date needs a second look (slice 3c).
// The screenshot or pasted text itself is kept only here, in memory, as a
// preview, until you press Add to board or Discard (or sign out, or close
// the tab). It is never saved anywhere. After a reload, a draft shows a
// note in its place. A quick add draft shows what you typed instead.
//
// This file also takes screenshots in: a paste (Ctrl/Cmd+V) or a dropped
// image anywhere on the board, or the panel's file picker; and pasted text,
// from the panel's text box. app.js decides how drafts are saved and how
// the backend is called.

import { activeOf } from './categories.js';
import { canRetry, costLine } from './backend.js';
import { bestClash, describeClash, isISODate, todayISO } from './dates.js';
import { draftNotes, newCard, newDraft } from './model.js';
import { shrink, splitImages, toBase64 } from './screenshot.js';
import { sameChecklist, sectionHTML, setupChecklist } from './checklist.js';
import { describeRhythm } from './repeat.js';

const MAX_AT_ONCE = 5;
const NO_CATEGORY_COLOR = '#6B6F78';
const MAX_TEXT = 20000; // characters of pasted text sent (the backend's limit)
const MAX_NOTES = 10000; // the same as a project's notes
const NOTES_ROWS = 14; // the notes box grows to this many lines, then scrolls
const NOTES_MIN_ROWS = 5; // and never starts smaller than this

// What each kind of draft calls its source, in the panel's notes.
const SOURCE_WORDS = {
  screenshot: { read: 'the screenshot', none: 'No date in the screenshot.', gone: "The screenshot isn't kept, so it's gone after a reload. Check the details against the original if you need to." },
  pasted_text: { read: 'the text', none: 'No date in the text.', gone: "The pasted text isn't kept, so it's gone after a reload. Check the details against the original if you need to." },
  quick_add: { read: 'what you typed', none: 'No date in what you typed.', gone: '' },
};

// The Hard deadline tick's face (a plus when off, a check when on) and what
// it means, as in the editor (index.html, "The ticks").
const TICK_PLUS = '<svg class="tick-off" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>';
const TICK_CHECK = '<svg class="tick-on" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"></path></svg>';
const HARD_TIP = "A date someone else set. The chip turns orange when it's due today or late, and it never gets a Let it go button.";

const finePointer = window.matchMedia('(any-pointer: fine)');
// Wide enough for a screenshot beside the Inbox (460 pixels) to be worth
// reading: the rest of the window, at least 440 pixels.
const wide = window.matchMedia('(min-width: 900px)');
const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

// read(request) sends { action: "screenshot", image: { mediaType, data } }
// or { action: "text", text } to the backend and returns its answer. saveDraft(fields) returns { id, saved }. changeDraft(id, changes)
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
  const textInput = document.getElementById('inbox-text-input');
  const textButton = document.getElementById('inbox-text-read');
  const overlay = document.getElementById('drop-overlay');
  const viewer = document.getElementById('shot-viewer');
  const viewerImg = document.getElementById('shot-viewer-img');
  const side = document.getElementById('shot-side');
  const sideImg = document.getElementById('shot-side-img');

  let enabled = false;
  let drafts = [];
  // Screenshots being read or that failed, by a number of their own.
  const pending = new Map();
  let nextPid = 1;
  // Draft id -> its preview, for drafts made in this tab: { url } for a
  // screenshot, { text } for pasted text.
  const previews = new Map();
  // Item key ("p3", "d<id>") -> its element and fields.
  const shown = new Map();
  let scrollTo = null;
  // Screenshots are read one at a time.
  let queue = Promise.resolve();

  closeButton.addEventListener('click', close);

  // The full-size screenshot viewer: a click anywhere in it (the X, the
  // image, or the dark around it) or Escape (the browser's own, for the
  // top dialog) closes it. Scrolling a tall one doesn't count as a click.
  viewer.addEventListener('click', closeViewer);
  viewer.addEventListener('close', () => viewerImg.removeAttribute('src'));

  // The screenshot beside the Inbox (wide screens): its X, Escape (which
  // closes it before the Inbox), the Inbox closing, or the window getting
  // too narrow put it away.
  document.getElementById('shot-side-close').addEventListener('click', () => {
    const url = sideImg.getAttribute('src');
    closeSide();
    const button = url && [...list.querySelectorAll('.inbox-shot-open')].find((b) => b.dataset.url === url);
    if (button) button.focus();
  });
  dialog.addEventListener('cancel', (event) => {
    if (side.hidden) return;
    event.preventDefault();
    closeSide();
  });
  dialog.addEventListener('close', closeSide);
  wide.addEventListener('change', () => {
    if (!wide.matches) closeSide();
  });
  pickButton.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const files = [...fileInput.files];
    fileInput.value = '';
    take(files);
  });
  drawDropText();
  finePointer.addEventListener('change', drawDropText);

  // Pasted text: Read the text, or Ctrl/Cmd+Enter in the box.
  textButton.addEventListener('click', takeText);
  textInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.isComposing) {
      event.preventDefault();
      takeText();
    }
  });

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
      const item = { pid: nextPid++, kind: 'screenshot', file, blob: null, url: null, width: 0, height: 0, state: 'reading', error: null };
      pending.set(item.pid, item);
      scrollTo = `p${item.pid}`;
      queue = queue.then(() => process(item));
    }
    render();
  }

  // Starts reading the text in the panel's text box.
  function takeText() {
    if (!enabled) return;
    const raw = textInput.value.replace(/\r\n?/g, '\n').trim();
    if (!raw) {
      showStatus('Paste some text into the box first.');
      textInput.focus();
      return;
    }
    textInput.value = '';
    startText(raw);
  }

  // Text pasted somewhere else (an email pasted into quick add): read it
  // the same way, without opening the panel. The pill counts it, and the
  // draft waits here like any other. Returns undo(), which takes it back:
  // the item while it's being read, or its draft once one is made. Null if
  // the Inbox isn't on (signed out).
  function readText(raw) {
    if (!enabled) return null;
    const text = String(raw).replace(/\r\n?/g, '\n').trim();
    if (!text) return null;
    const item = startText(text);
    return () => {
      item.undone = true;
      pending.delete(item.pid);
      if (item.draftId) {
        dropPreview(item.draftId);
        discardDraft(item.draftId).catch((err) => showStatus(`The draft wasn't discarded (${err.code || err.message}).`));
      }
      forget(item);
      render();
    };
  }

  function startText(raw) {
    // In a thread the newest message is usually on top, so the start is kept.
    const text = raw.slice(0, MAX_TEXT);
    showStatus(raw.length > MAX_TEXT ? `Only the first ${MAX_TEXT.toLocaleString()} characters are read.` : '');
    const item = { pid: nextPid++, kind: 'text', text, state: 'reading', error: null };
    pending.set(item.pid, item);
    scrollTo = `p${item.pid}`;
    queue = queue.then(() => process(item));
    render();
    return item;
  }

  async function process(item) {
    if (!pending.has(item.pid)) return; // discarded while waiting
    if (item.kind === 'screenshot' && !item.blob) {
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
      answer =
        item.kind === 'text'
          ? await read({ action: 'text', text: item.text })
          : // The base64 copy exists only for the length of the request.
            await read({ action: 'screenshot', image: { mediaType: 'image/jpeg', data: await toBase64(item.blob) } });
    } catch (err) {
      answer = { ok: false, error: 'unreachable', message: `Something went wrong reading it (${err.message}).` };
    }
    // Discarded, or signed out, while it was being read: the answer goes
    // unused.
    if (!pending.has(item.pid) || !enabled) return;

    if (!answer.ok) {
      console.info(`${item.kind === 'text' ? 'Pasted text' : 'Screenshot'} refused: ${answer.error}`);
      item.state = 'failed';
      item.error = { message: answer.message, retry: canRetry(answer.error) };
      render();
      return;
    }

    logCost(item, answer);
    const source = item.kind === 'text' ? 'pasted_text' : 'screenshot';
    const { id, saved } = saveDraft(newDraft(answer.draft, undefined, { source }));
    // The screenshot or text stays a pending item until the draft arrives
    // from Firestore (a moment later), then hands its preview over to it.
    previews.set(id, item.kind === 'text' ? { text: item.text } : { url: item.url });
    item.draftId = id;
    item.state = 'saving';
    render();
    saved.catch((err) => {
      // Taken back (undo from quick add) before Firestore answered.
      if (item.undone) return;
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
    const what = item.kind === 'text' ? `Pasted text: ${item.text.length.toLocaleString()} characters` : `Screenshot: ${item.width}×${item.height}`;
    console.info(`${what}, ${costLine(answer)}`);
  }

  function retry(item) {
    item.state = 'reading';
    item.error = null;
    render();
    queue = queue.then(() => process(item));
  }

  function forget(item) {
    closeViewerFor(item.url);
    if (item.url) URL.revokeObjectURL(item.url);
    item.url = null;
    item.blob = null;
    item.file = null;
    item.text = null;
  }

  function dropPreview(id) {
    const preview = previews.get(id);
    previews.delete(id);
    if (preview) closeViewerFor(preview.url);
    if (preview && preview.url && !inUse(preview.url)) URL.revokeObjectURL(preview.url);
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
      ? `${n} ${n === 1 ? 'draft' : 'drafts'} to look over. Nothing reaches the board until you add it, and screenshots and pasted text are never saved.`
      : 'Nothing to look over. Cards reach the board only when you add them, and screenshots and pasted text are never saved.';
    onCount(n);

    const ordered = [...drafts].sort((a, b) => a.createdAt - b.createdAt);
    const keys = [];
    // Drafts built just now: their checklist items are measured once
    // they're in the panel (a box outside the page has no width to wrap to).
    const built = [];
    for (const draft of ordered) {
      const key = `d${draft.id}`;
      keys.push(key);
      if (!shown.has(key)) built.push(key);
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
    if (dialog.open) for (const key of built) shown.get(key).checklist.fit();

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

  // The screenshot, if this tab still has it; otherwise a note. Clicking
  // it opens it full size, to check the details against.
  function fillShot(box, url) {
    const img = box.querySelector('img');
    if (url) {
      if (img && img.getAttribute('src') === url) return;
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'inbox-shot-open';
      open.dataset.url = url;
      open.setAttribute('aria-label', 'Show your screenshot');
      open.title = 'Show the screenshot';
      const fresh = document.createElement('img');
      fresh.src = url;
      fresh.alt = '';
      const hint = document.createElement('span');
      hint.className = 'inbox-shot-hint';
      hint.setAttribute('aria-hidden', 'true');
      hint.textContent = 'Click to view';
      open.append(fresh, hint);
      open.addEventListener('click', () => openViewer(url));
      box.className = 'inbox-shot';
      box.replaceChildren(open);
    } else {
      showGone(box, SOURCE_WORDS.screenshot.gone);
    }
  }

  // On a wide screen, beside the Inbox (a second click on the same one
  // puts it away); on a phone, full screen over everything.
  function openViewer(url) {
    if (wide.matches && dialog.open) {
      if (!side.hidden && sideImg.getAttribute('src') === url) {
        closeSide();
        return;
      }
      sideImg.src = url;
      side.hidden = false;
      side.querySelector('.shot-side-body').scrollTop = 0;
      markShown(url);
      return;
    }
    viewerImg.src = url;
    if (!viewer.open) viewer.showModal();
    viewer.scrollTop = 0;
  }

  function closeViewer() {
    if (viewer.open) viewer.close();
  }

  function closeSide() {
    if (side.hidden) return;
    side.hidden = true;
    sideImg.removeAttribute('src');
    markShown(null);
  }

  // The thumbnail whose screenshot is showing beside the Inbox is marked,
  // so with several drafts you know which one you're looking at.
  function markShown(url) {
    for (const button of list.querySelectorAll('.inbox-shot-open')) {
      const on = Boolean(url) && button.dataset.url === url;
      button.classList.toggle('is-shown', on);
      button.setAttribute('aria-pressed', String(on));
    }
  }

  // When a screenshot is let go (Add to board, Discard), its view goes too,
  // full size or beside.
  function closeViewerFor(url) {
    if (url && viewer.open && viewerImg.getAttribute('src') === url) closeViewer();
    if (url && !side.hidden && sideImg.getAttribute('src') === url) closeSide();
  }

  // The pasted text, if this tab still has it; otherwise a note. Shown as
  // text, never as HTML.
  function fillText(box, text) {
    if (text) {
      if (box.classList.contains('is-text') && box.dataset.shown === 'yes') return;
      box.className = 'inbox-shot is-text';
      box.dataset.shown = 'yes';
      box.tabIndex = 0;
      box.setAttribute('role', 'region');
      box.setAttribute('aria-label', 'Your pasted text, for checking');
      box.textContent = text;
    } else {
      showGone(box, SOURCE_WORDS.pasted_text.gone);
    }
  }

  // A quick add draft: what you typed.
  function fillTyped(box, typed) {
    box.className = 'inbox-shot is-typed';
    const label = document.createElement('span');
    label.className = 'inbox-notes-label';
    label.textContent = 'You typed';
    box.replaceChildren(label, `\u201c${typed}\u201d`);
  }

  function showGone(box, text) {
    if (box.classList.contains('is-gone') && box.textContent === text) return;
    box.className = 'inbox-shot is-gone';
    box.removeAttribute('tabindex');
    box.removeAttribute('role');
    box.removeAttribute('aria-label');
    delete box.dataset.shown;
    box.textContent = text;
  }

  // A draft's preview box, by where the draft came from.
  function fillPreview(box, draft) {
    const preview = previews.get(draft.id) || {};
    if (draft.source === 'quick_add') fillTyped(box, draft.typed);
    else if (draft.source === 'pasted_text') fillText(box, preview.text);
    else fillShot(box, preview.url);
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
    el.setAttribute('aria-label', item.kind === 'text' ? 'Pasted text being read' : 'Screenshot being read');
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
    if (item.kind === 'text') fillText(entry.shot, item.text);
    else if (item.url) fillShot(entry.shot, item.url);
    else entry.shot.replaceChildren();
    entry.el.classList.toggle('is-failed', item.state === 'failed');
    const reading = item.kind === 'text' ? 'Reading the text…' : 'Reading the screenshot…';
    entry.message.textContent = item.state === 'failed' ? item.error.message : item.state === 'saving' ? 'Saving the draft…' : reading;
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
    // Repeats, beside Due as in the editor: yours to set (Haiku never
    // does), with the rhythm in words under it.
    const repeatField = document.createElement('label');
    repeatField.className = 'field';
    const repeat = document.createElement('select');
    repeat.className = 'field-input';
    for (const [value, label] of [['none', "Doesn't repeat"], ['weekly', 'Weekly'], ['monthly', 'Monthly']]) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      repeat.append(option);
    }
    repeatField.append('Repeats', repeat);
    row.append(dueField, repeatField);
    const rhythm = document.createElement('p');
    rhythm.className = 'inbox-rhythm';
    rhythm.id = `inbox-rhythm-${n}`;
    rhythm.hidden = true;
    repeat.setAttribute('aria-describedby', rhythm.id);

    const categoryField = document.createElement('label');
    categoryField.className = 'field';
    const category = document.createElement('select');
    category.className = 'field-input';
    categoryField.append('Category', category);

    const note = document.createElement('p');
    note.className = 'inbox-note';
    note.id = `inbox-note-${n}`;
    due.setAttribute('aria-describedby', note.id);

    // Hard deadline, drawn as the card's chip, as in the editor (index.html,
    // "The ticks"): a real checkbox, its face, and what it means on hover.
    const ticks = document.createElement('div');
    ticks.className = 'ticks';
    const hardTick = document.createElement('span');
    hardTick.className = 'tick tick-hard';
    const hard = document.createElement('input');
    hard.type = 'checkbox';
    hard.className = 'tick-input';
    hard.id = `inbox-hard-${n}`;
    const hardFace = document.createElement('label');
    hardFace.className = 'tick-face';
    hardFace.htmlFor = hard.id;
    hardFace.innerHTML = `${TICK_PLUS}${TICK_CHECK}`;
    hardFace.append('Hard deadline');
    const hardTip = document.createElement('span');
    hardTip.className = 'tick-tip';
    hardTip.id = `inbox-hard-tip-${n}`;
    hardTip.setAttribute('role', 'tooltip');
    hardTip.textContent = HARD_TIP;
    hard.setAttribute('aria-describedby', hardTip.id);
    hardTick.append(hard, hardFace, hardTip);
    ticks.append(hardTick);

    // The notes: a box you can edit, saving when you leave it (3c).
    const notesField = document.createElement('label');
    notesField.className = 'field';
    const notes = document.createElement('textarea');
    notes.className = 'field-input field-notes inbox-notes';
    notes.maxLength = MAX_NOTES;
    notes.rows = NOTES_MIN_ROWS;
    notesField.append('Notes', notes);

    // The checklist: the steps Haiku found, if any, to edit before the card
    // exists, the same as the editor's (checklist.js). Each change saves to
    // the draft as it's made, so it survives a reload. A draft has no Mark
    // done, so no offer.
    const checks = document.createElement('div');
    checks.className = 'cl';
    checks.setAttribute('role', 'group');
    checks.setAttribute('aria-labelledby', `inbox-cl-label-${n}`);
    checks.innerHTML = sectionHTML({
      labelId: `inbox-cl-label-${n}`,
      helpId: `inbox-cl-help-${n}`,
      help: 'Enter adds the item. Several lines pasted here become one item each. Alt with the up or down arrow moves the item you\u2019re typing in. The list goes onto the card with Add to board.',
    });

    const foot = document.createElement('div');
    foot.className = 'inbox-foot';
    const discard = button('Discard', 'button');
    const add = button('Add to board', 'button button-primary');
    foot.append(discard, add);

    el.append(shot, titleField, titleError, row, note, rhythm, categoryField, ticks, notesField, checks, foot);
    const entry = { el, id, shot, title, titleError, due, repeat, rhythm, category, note, hard, hardTick, notes, checks, add, discard, stored: {} };
    entry.checklist = setupChecklist({
      root: checks,
      helpId: `inbox-cl-help-${n}`,
      onChange: (list) => {
        if (!sameChecklist(list, entry.stored.checklist || [])) save(entry, { checklist: list });
      },
    });

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
      drawHardDue(entry);
      drawRhythm(entry);
      if (value !== entry.stored.dueDate) save(entry, { dueDate: value });
    });
    repeat.addEventListener('change', () => {
      drawRhythm(entry);
      if (repeat.value !== entry.stored.repeat) save(entry, { repeat: repeat.value });
    });
    category.addEventListener('change', () => {
      drawColor(entry);
      const value = category.value || null;
      if (value !== entry.stored.category) save(entry, { category: value });
    });
    hard.addEventListener('change', () => {
      save(entry, { deadlineType: hard.checked ? 'hard' : 'soft' });
    });
    notes.addEventListener('input', () => sizeNotes(notes));
    notes.addEventListener('change', () => {
      const value = notes.value.replace(/\r\n?/g, '\n').replace(/\s+$/, '');
      if (value !== entry.stored.notes) save(entry, { notes: value });
    });
    discard.addEventListener('click', () => discardDraftItem(entry));
    add.addEventListener('click', () => addDraftItem(entry));
    // Ctrl+Enter (Cmd+Enter on a Mac) anywhere in the draft adds it, as
    // Save does in the card editor. Enter alone in its notes starts a line.
    add.title = 'Add to board (Ctrl+Enter)';
    add.setAttribute('aria-keyshortcuts', 'Control+Enter Meta+Enter');
    el.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || !(event.ctrlKey || event.metaKey) || event.isComposing) return;
      event.preventDefault();
      if (!add.disabled) addDraftItem(entry);
    });
    return entry;
  }

  // Fills a draft's fields from Firestore, leaving alone any field you're
  // in the middle of, and any you've changed that hasn't come back yet.
  function fillDraft(entry, draft) {
    entry.draft = draft;
    fillPreview(entry.shot, draft);
    // A field takes Firestore's value the first time, and again only when
    // that value changes (from another device, or a refused save putting it
    // back), and never while you're in it.
    const was = entry.stored;
    const fresh = (prop) => !(prop in was) || draft[prop] !== was[prop];
    if (fresh('title') && document.activeElement !== entry.title) entry.title.value = draft.title;
    if (fresh('dueDate') && document.activeElement !== entry.due) entry.due.value = draft.dueDate || '';
    if (fresh('repeat') && document.activeElement !== entry.repeat) entry.repeat.value = draft.repeat;
    fillCategories(entry, draft);
    if (fresh('deadlineType')) entry.hard.checked = draft.deadlineType === 'hard';
    if (fresh('notes') && document.activeElement !== entry.notes) {
      entry.notes.value = draftNotes(draft);
      sizeNotes(entry.notes);
    }
    // The checklist, the same way: on arrival, then only when Firestore's
    // list differs from the last one saved here (another device), and
    // never while you're working in it.
    const listFresh = !('checklist' in was) || !sameChecklist(draft.checklist, was.checklist);
    if (listFresh && !entry.checks.contains(document.activeElement)) {
      entry.checklist.load(draft.checklist, { finish: false });
      if (dialog.open) entry.checklist.fit();
    }
    entry.stored = {
      title: draft.title,
      dueDate: draft.dueDate,
      repeat: draft.repeat,
      category: draft.category,
      deadlineType: draft.deadlineType,
      notes: draft.notes,
      checklist: draft.checklist,
    };
    drawNote(entry);
    drawHardDue(entry);
    drawRhythm(entry);
    drawColor(entry);
  }

  // "Every Friday." under Repeats, from the draft's date as it stands (a
  // new series follows its first date, as in the editor).
  function drawRhythm(entry) {
    const due = isISODate(entry.due.value) ? entry.due.value : null;
    entry.rhythm.textContent = describeRhythm(entry.repeat.value, due);
    entry.rhythm.hidden = !entry.rhythm.textContent;
  }

  // The Hard deadline chip is orange (when it's on) only while the draft's
  // date is today or past, as on the card.
  function drawHardDue(entry) {
    const due = entry.due.value;
    entry.hardTick.classList.toggle('is-due', isISODate(due) && due <= todayISO());
  }

  function fillCategories(entry, draft) {
    const select = entry.category;
    if (document.activeElement === select) return;
    const mine = categories();
    const options = [{ value: '', label: 'No category' }, ...activeOf(mine).map((c) => ({ value: c.id, label: c.name }))];
    // A retired category, or an id that isn't yours any more, stays, so it
    // isn't lost.
    const own = draft.category ? mine.find((c) => c.id === draft.category) : null;
    if (own && own.retired) {
      options.push({ value: own.id, label: `${own.name} (retired)` });
    } else if (draft.category && !own) {
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

  // The notes box starts at NOTES_MIN_ROWS lines and grows to show
  // everything, long lines that wrap included, up to NOTES_ROWS; past that
  // it scrolls. (It can't measure itself while the panel is closed, so
  // then it goes by the number of lines.)
  function sizeNotes(box) {
    box.rows = NOTES_MIN_ROWS;
    if (!box.clientHeight) {
      box.rows = Math.max(NOTES_MIN_ROWS, Math.min(NOTES_ROWS, box.value.split('\n').length));
      // A box not on screen yet (just drawn): measure again once it is.
      requestAnimationFrame(() => {
        if (box.clientHeight) sizeNotes(box);
      });
      return;
    }
    while (box.rows < NOTES_ROWS && box.scrollHeight > box.clientHeight) box.rows += 1;
  }

  // The note under the date: what Haiku made of it, while the date is
  // still Haiku's.
  function drawNote(entry) {
    const draft = entry.draft;
    const words = SOURCE_WORDS[draft.source] || SOURCE_WORDS.screenshot;
    const due = entry.due.value || null;
    let text = '';
    let tone = '';
    // The words the date came from don't add up ("Thursday, December 4",
    // when Dec 4 is a Friday), or don't match the date chosen: Haiku chose
    // for you. Checked here in code, since Haiku tends to settle a
    // contradiction quietly rather than mention it (dates.js, dateClash).
    // A quick add draft checks your whole typed line too: Haiku's quote of
    // it can leave part out.
    const clashWords = [draft.dueDateQuote, draft.source === 'quick_add' ? draft.typed : ''];
    const clash = draft.aiDueDate && due === draft.aiDueDate ? bestClash(clashWords, due) : null;
    if (clash) {
      const source = words.read.charAt(0).toUpperCase() + words.read.slice(1);
      text = `${describeClash(clash, `${source} says`, due)} Worth a second look.`;
      tone = 'is-inferred';
    } else if (draft.aiDueDate && due === draft.aiDueDate) {
      if (draft.dueDateConfidence === 'explicit') {
        text = `Date read directly from ${words.read}.`;
        tone = 'is-explicit';
      } else {
        text = draft.dueDateQuote
          ? `Date inferred from “${draft.dueDateQuote.replace(/[.\s]+$/, '')}.” Worth a second look.`
          : 'Date inferred, not read directly. Worth a second look.';
        tone = 'is-inferred';
      }
    } else if (!draft.aiDueDate && !due) {
      text = `${words.none} Without one, it goes to Someday.`;
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
    // The notes as they are in the box, even if you haven't left it yet.
    const card = {
      ...newCard({ title, dueDate }),
      source: entry.draft.source,
      category: entry.category.value || null,
      deadlineType: entry.hard.checked ? 'hard' : 'soft',
      repeat: entry.repeat.value,
      notes: entry.notes.value.replace(/\r\n?/g, '\n').replace(/\s+$/, ''),
      // The list as it is, words still in "Add an item" included.
      checklist: entry.checklist.values(),
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
        const target = other ? other.el.querySelector('input, textarea, button:not([hidden])') : pickButton;
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
    // Notes boxes drawn while the panel was closed couldn't measure their
    // wrapped lines; now they can.
    for (const entry of shown.values()) {
      if (entry.notes) sizeNotes(entry.notes);
      if (entry.checklist) entry.checklist.fit();
    }
  }

  function close() {
    if (dialog.open) dialog.close();
    dialog.classList.remove('is-dropping');
  }

  return {
    open,
    close,
    take,
    readText,
    setEnabled(on) {
      enabled = on;
    },
    // Your categories changed (Settings, here or on another device): each
    // draft's menu and color follow, leaving a menu you're in alone.
    refreshCategories() {
      for (const [key, entry] of shown) {
        if (!key.startsWith('d') || !entry.draft) continue;
        fillCategories(entry, entry.draft);
        drawColor(entry);
      }
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
