// The card editor: a panel that opens beside the card you clicked, or under
// the quick add field when you press Enter there to start a new card. On a
// phone it fills the screen instead. This file only fills in the form and
// collects what changed; app.js decides how changes are saved.

import { activeOf } from './categories.js';
import { addDays, formatShort, todayISO, zoneBounds } from './dates.js';
import { PROJECT_STATUS, STATUS, WAITING_ON_MAX, FOLLOW_UP_MAX } from './model.js';
import { daysText, isWaiting, waitingDays } from './followup.js';
import { NEW_PROJECT, nameOrder } from './projects.js';
import { placeBeside } from './place.js';
import { anchorOf, describeMove, describeRhythm, repeats } from './repeat.js';
import { sameChecklist, setupChecklist } from './checklist.js';

// The follow-up arrow, small, for the "After ..." line.
const THEN_SMALL = () => {
  const span = document.createElement('span');
  span.className = 'editor-after-icon';
  span.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 4v7a4 4 0 0 0 4 4h9"></path><path d="M15 11l4 4-4 4"></path></svg>';
  return span;
};

// Matches the CSS: up to this width the editor fills the screen.
const narrow = window.matchMedia('(max-width: 760px)');

// onSave(cardId, changes, { moveSeries }) and onDone(cardId, changes,
// { moveSeries }) receive only the fields that differ from the card as it
// was when the panel opened; moveSeries is true when a repeating card's date
// changed and "Move the series too" was checked. onCreate(values, {
// newProject }) receives every field of a new card. When "New project..."
// is chosen, projectId is NEW_PROJECT and newProject is the name typed for
// it (onSave and onDone get it too); app.js makes the project. onClose(card,
// saved) runs whenever the panel closes; a new card has no id until it is
// saved. onTick(cardId, itemId, done) runs when a checklist item on a saved
// card is ticked or unticked: a tick saves at once, not with Save.
//
// Follow-ups: onDone returns nothing when it has finished the card, or {
// parent, followUp, keeps } when the follow-up still needs a title or a
// date. The card is already saved as done then, and the editor turns into
// one question, "What comes next?" (keeps is the line under the title:
// what the new card keeps). onFollowUp(parent, { title, dueDate }, {
// closed }) makes it: from a "when" button, or with closed true when the
// panel is closed with a title in the box (it goes to Someday then, so a
// title isn't lost). Nothing after all, or a blank box, makes nothing.
export function setupEditor({ onSave, onDone, onCreate, onClose, onTick, onFollowUp }) {
  const dialog = document.getElementById('editor');
  const form = document.getElementById('editor-form');
  const title = document.getElementById('editor-title');
  const titleError = document.getElementById('editor-title-error');
  const notes = document.getElementById('editor-notes');
  const due = document.getElementById('editor-due');
  const noDate = document.getElementById('editor-nodate');
  const someday = document.getElementById('editor-someday');
  const category = document.getElementById('editor-category');
  const waiting = document.getElementById('editor-waiting');
  const waitingBox = document.getElementById('editor-waiting-box');
  const waitingOn = document.getElementById('editor-waiting-on');
  const waitingSince = document.getElementById('editor-waiting-since');
  const followTick = document.getElementById('editor-follow');
  const followBox = document.getElementById('editor-follow-box');
  const followTitle = document.getElementById('editor-follow-title');
  const followDue = document.getElementById('editor-follow-due');
  const after = document.getElementById('editor-after');
  const next = document.getElementById('editor-next');
  const nextHeading = document.getElementById('editor-next-heading');
  const nextParent = document.getElementById('editor-next-parent');
  const nextTitle = document.getElementById('editor-next-title');
  const nextKeeps = document.getElementById('editor-next-keeps');
  const nextWhen = next.querySelector('.next-when');
  const nextWeek = next.querySelector('[data-next="week"]');
  const nextPick = document.getElementById('editor-next-pick');
  const nextDateRow = document.getElementById('editor-next-date-row');
  const nextDate = document.getElementById('editor-next-date');
  const nextError = document.getElementById('editor-next-error');
  const hard = document.getElementById('editor-hard');
  const hardTick = document.getElementById('editor-hard-tick');
  const repeat = document.getElementById('editor-repeat');
  const repeatNote = document.getElementById('editor-repeat-note');
  const moveBlock = document.getElementById('editor-move');
  const moveSeries = document.getElementById('editor-move-series');
  const moveNote = document.getElementById('editor-move-note');
  const project = document.getElementById('editor-project');
  const newProjectBlock = document.getElementById('editor-newproject');
  const newProjectName = document.getElementById('editor-project-name');
  const newProjectError = document.getElementById('editor-project-error');
  const heading = document.getElementById('editor-heading');
  const saveButton = document.getElementById('editor-save');
  const doneButton = document.getElementById('editor-done');
  const checklist = setupChecklist({
    root: document.getElementById('editor-checklist'),
    helpId: 'editor-cl-help',
    onTick: (itemId, done) => {
      if (!card || !card.id) return;
      // An item already saved on the card: its tick saves now, and the
      // editor's own copy of the card follows, so Save doesn't see the
      // tick as a change. One added since the panel opened saves with Save.
      if (!card.checklist.some((item) => item.id === itemId)) return;
      card.checklist = card.checklist.map((item) => (item.id === itemId ? { ...item, done } : item));
      onTick(card.id, itemId, done);
    },
    onOffer: () => doneButton.click(),
    onResize: () => follow(),
  });

  let card = null;
  let saved = false;
  // After Mark done, while the editor asks what comes next: { parent,
  // done } (done once a choice is made), or null.
  let step = null;
  // Where the editor sits: { cardId, fallback } beside that card (or under
  // `fallback` if the card isn't showing), or { below } under an element.
  let anchor = null;
  let frame = 0;

  // A new card (one without an id) isn't saved until you press Add card, so
  // it has nothing to mark done yet. categories and projects are yours,
  // for the menus. startFollowUp (the right-click menu's "Follow-up...")
  // opens it with Follow-up on and its title box focused.
  function open(cardToEdit, { categories, projects }, where = null, { startFollowUp = false } = {}) {
    // A copy: a tick changes its checklist (above), never the board's.
    card = { ...cardToEdit, checklist: cardToEdit.checklist || [] };
    saved = false;
    endStep();
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
    fillProjects(projects);
    hard.checked = card.deadlineType === 'hard';
    waiting.checked = isWaiting(card);
    waitingOn.value = card.waitingOn || '';
    followTick.checked = Boolean(card.followUp) || startFollowUp;
    followTitle.value = card.followUp ? card.followUp.title : '';
    followDue.value = card.followUp && card.followUp.dueDate ? card.followUp.dueDate : '';
    showAfter();
    updateBoxes();
    repeat.value = card.repeat;
    moveSeries.checked = false;
    checklist.load(card.checklist, { finish: !isNew });
    updateSomedayNote();
    updateRepeatNotes();
    anchor = where;
    dialog.showModal();
    position();
    // After position(): the panel's width beside a card is what the items
    // wrap to. Then once more, in case the new heights moved it.
    checklist.fit();
    position();
    window.addEventListener('resize', refit);
    // Capture: scrolling the board's own sideways box counts too.
    window.addEventListener('scroll', follow, { capture: true, passive: true });
    // A new card's title is already typed; the date is usually next.
    if (startFollowUp) followTitle.focus();
    else if (isNew) due.focus();
  }

  // "After Weed graphic novels, 741.5, done Thu, Nov 19": on a card made
  // from another card's follow-up.
  function showAfter() {
    after.hidden = !card.afterTitle;
    if (!card.afterTitle) return;
    const name = document.createElement('b');
    name.textContent = card.afterTitle;
    const parts = [THEN_SMALL(), document.createTextNode('After '), name];
    if (card.afterDay) {
      const day = document.createElement('span');
      day.className = 'editor-after-day';
      day.textContent = formatShort(card.afterDay);
      parts.push(document.createTextNode(', done '), day);
    }
    const words = document.createElement('span');
    words.append(...parts.slice(1));
    after.replaceChildren(parts[0], words);
  }

  // Waiting's and Follow-up's boxes show while they're on. Waiting says
  // since when: the day it was turned on, kept while it stays on.
  function updateBoxes() {
    waitingBox.hidden = !waiting.checked;
    followBox.hidden = !followTick.checked;
    if (waiting.checked) {
      const today = todayISO();
      const was = card && isWaiting(card) && card.waitingSince < today;
      waitingSince.textContent = was
        ? `Since ${formatShort(card.waitingSince)} (${daysText(waitingDays(card, today))}).`
        : 'Since today.';
    }
    follow();
  }

  // The card the editor belongs to, if it's on screen. The board redraws
  // whenever Firestore sends news, so it is looked up fresh each time. The
  // board and a project page can both have a copy; only one is showing.
  function anchorCard() {
    if (!anchor || !anchor.cardId) return null;
    const copies = document.querySelectorAll(`[data-drag-id="${CSS.escape(anchor.cardId)}"]`);
    return [...copies].find((el) => el.getClientRects().length) || null;
  }

  function position() {
    // While asking what comes next, the card it sat beside is gone (done),
    // so the panel stays where it is.
    if (step) return;
    for (const el of document.querySelectorAll('.card.is-editing')) el.classList.remove('is-editing');
    const cardEl = anchorCard();
    const below = cardEl ? null : anchor && (anchor.below || anchor.fallback);
    if (narrow.matches || (!cardEl && !below)) {
      dialog.classList.remove('is-beside');
      dialog.style.left = '';
      dialog.style.top = '';
      delete dialog.dataset.side;
      return;
    }
    if (cardEl) cardEl.classList.add('is-editing');
    dialog.classList.add('is-beside');
    const { left, top, side } = placeBeside(
      (cardEl || below).getBoundingClientRect(),
      { width: dialog.offsetWidth, height: dialog.offsetHeight },
      { width: document.documentElement.clientWidth, height: window.innerHeight },
      cardEl ? 'beside' : 'below',
    );
    dialog.style.left = `${Math.round(left)}px`;
    dialog.style.top = `${Math.round(top)}px`;
    dialog.dataset.side = side;
  }

  // Keeps the editor beside its card while the window resizes or the board
  // scrolls underneath.
  function follow() {
    if (!dialog.open || frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (dialog.open) position();
    });
  }

  // A new width can rewrap the checklist's items.
  function refit() {
    checklist.fit();
    follow();
  }

  // Your active categories. A card on a retired one keeps it as an option,
  // "Programs (retired)", so opening the card doesn't change it.
  function fillCategories(categories) {
    const options = activeOf(categories).map((c) => ({ value: c.id, label: c.name }));
    const own = card.category ? categories.find((c) => c.id === card.category) : null;
    if (!card.category) {
      options.unshift({ value: '', label: 'No category' });
    } else if (own && own.retired) {
      options.unshift({ value: own.id, label: `${own.name} (retired)` });
    } else if (!own) {
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

  // No project, your active projects by name, then "New project...". A card
  // in an archived project, or one that's gone, keeps it as an option, so
  // opening the card doesn't change it.
  function fillProjects(projects) {
    const options = [{ value: '', label: 'No project' }];
    for (const p of nameOrder(projects.filter((p) => p.status === PROJECT_STATUS.ACTIVE))) {
      options.push({ value: p.id, label: p.name });
    }
    if (card.projectId && !options.some((o) => o.value === card.projectId)) {
      const own = projects.find((p) => p.id === card.projectId);
      options.splice(1, 0, { value: card.projectId, label: own ? `${own.name} (archived)` : 'A project that was deleted' });
    }
    options.push({ value: NEW_PROJECT, label: 'New project\u2026' });
    project.replaceChildren(
      ...options.map(({ value, label }) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        return option;
      }),
    );
    project.value = card.projectId || '';
    newProjectName.value = '';
    updateNewProject();
  }

  function updateNewProject() {
    newProjectBlock.hidden = project.value !== NEW_PROJECT;
    hideNewProjectError();
    follow();
  }

  function hideNewProjectError() {
    newProjectError.hidden = true;
    newProjectName.removeAttribute('aria-invalid');
  }

  // Called whenever the date changes: the Someday note, and the Hard
  // deadline chip, orange (when it's on) only while Due is today or past,
  // as on the card.
  function updateSomedayNote() {
    someday.hidden = Boolean(due.value);
    hardTick.classList.toggle('is-due', Boolean(due.value) && due.value <= todayISO());
  }

  // The rhythm in words under Repeats, and "Move the series too" when a
  // repeating card's date has changed. A card that already repeats keeps
  // its series' rhythm unless that box is checked (see repeat.js); one
  // that's starting to repeat follows the date in the form.
  function updateRepeatNotes() {
    const rule = repeat.value;
    const was = card && repeats(card);
    const dateChanged = Boolean(card && card.id && was && rule !== 'none' && due.value && due.value !== (card.dueDate || ''));
    moveBlock.hidden = !dateChanged;
    if (dateChanged) moveNote.textContent = describeMove(rule, due.value);
    const anchor = was ? anchorOf(card) : due.value || null;
    const day = was && rule === 'monthly' ? card.seriesDay : null;
    repeatNote.textContent = describeRhythm(rule, anchor, day);
    repeatNote.hidden = !repeatNote.textContent;
    // The editor may have grown or shrunk; keep it on screen.
    follow();
  }

  // What app.js needs beside the fields: whether the series moves, and the
  // name of a project to make.
  function extras() {
    return {
      moveSeries: !moveBlock.hidden && moveSeries.checked,
      newProject: project.value === NEW_PROJECT ? newProjectName.value.trim() : null,
    };
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
    if (project.value === NEW_PROJECT && !newProjectName.value.trim()) {
      newProjectError.hidden = false;
      newProjectName.setAttribute('aria-invalid', 'true');
      newProjectName.setAttribute('aria-describedby', 'editor-project-error');
      newProjectName.focus();
      return null;
    }
    const stillWaiting = waiting.checked && card && isWaiting(card);
    return {
      title: newTitle,
      notes: notes.value,
      dueDate: due.value || null,
      category: category.value || null,
      // Always open: an old In progress card is saved as open.
      status: STATUS.OPEN,
      deadlineType: hard.checked ? 'hard' : 'soft',
      waitingSince: waiting.checked ? (stillWaiting ? card.waitingSince : todayISO()) : null,
      waitingOn: waiting.checked ? waitingOn.value.trim().slice(0, WAITING_ON_MAX) : '',
      followUp: followTick.checked ? { title: followTitle.value.trim().slice(0, FOLLOW_UP_MAX), dueDate: followDue.value || null } : null,
      repeat: repeat.value,
      projectId: project.value || null,
      checklist: checklist.values(),
    };
  }

  // The fields that differ from the card as opened, or null as above.
  function collectChanges() {
    const values = collectValues();
    if (!values) return null;
    const changes = {};
    for (const [key, value] of Object.entries(values)) {
      const same =
        key === 'checklist'
          ? sameChecklist(value, card.checklist)
          : key === 'followUp'
            ? JSON.stringify(value) === JSON.stringify(card.followUp || null)
            : value === (card[key] === undefined ? null : card[key]);
      if (!same) changes[key] = value;
    }
    return changes;
  }

  function close() {
    dialog.close();
  }

  // Ctrl+Enter (Cmd+Enter on a Mac) saves from anywhere in the panel, the
  // notes box included, where Enter alone starts a new line. (Enter in the
  // title box already saves, as a form does.)
  form.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || !(event.ctrlKey || event.metaKey) || event.isComposing) return;
    event.preventDefault();
    form.requestSubmit(saveButton);
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!card.id) {
      const values = collectValues();
      if (!values) return;
      onCreate(values, extras());
    } else {
      const changes = collectChanges();
      if (!changes) return;
      if (Object.keys(changes).length) onSave(card.id, changes, extras());
    }
    saved = true;
    close();
  });

  doneButton.addEventListener('click', () => {
    const changes = collectChanges();
    if (!changes) return;
    // Marking done sets the status itself.
    delete changes.status;
    const asking = onDone(card.id, changes, extras());
    saved = true;
    if (asking) startStep(asking);
    else close();
  });

  // After Mark done: "What comes next?" in place of the form, with the
  // title written ahead (or an empty box) and the "when" buttons.
  function startStep({ parent, followUp, keeps }) {
    step = { parent, done: false };
    form.hidden = true;
    next.hidden = false;
    dialog.setAttribute('aria-labelledby', 'editor-next-heading');
    nextParent.textContent = parent.title;
    nextTitle.value = followUp.title;
    nextKeeps.textContent = keeps;
    nextKeeps.hidden = !keeps;
    nextDate.value = followUp.dueDate || '';
    nextDateRow.hidden = true;
    nextPick.setAttribute('aria-expanded', 'false');
    nextError.hidden = true;
    nextTitle.removeAttribute('aria-invalid');
    // On a Sunday nothing is left of this week.
    const today = todayISO();
    nextWeek.hidden = zoneBounds(today).weekEnd <= today;
    updateNextTitle();
    // A title written ahead: the "when" is all that's left. A blank box:
    // the title first.
    if (followUp.title) next.querySelector('[data-next="today"]').focus();
    else nextTitle.focus();
  }

  function endStep() {
    step = null;
    form.hidden = false;
    next.hidden = true;
    dialog.setAttribute('aria-labelledby', 'editor-heading');
  }

  // The "when" buttons wait (dashed) until there's a title.
  function updateNextTitle() {
    nextWhen.classList.toggle('is-waiting', !nextTitle.value.trim());
    if (nextTitle.value.trim() && !nextError.hidden) {
      nextError.hidden = true;
      nextTitle.removeAttribute('aria-invalid');
    }
  }

  function chooseNext(kind) {
    if (!step) return;
    const title = nextTitle.value.trim();
    if (!title) {
      nextError.hidden = false;
      nextTitle.setAttribute('aria-invalid', 'true');
      nextTitle.setAttribute('aria-describedby', 'editor-next-keeps editor-next-error');
      nextTitle.focus();
      return;
    }
    const today = todayISO();
    let dueDate = null;
    if (kind === 'today') dueDate = today;
    else if (kind === 'tomorrow') dueDate = addDays(today, 1);
    else if (kind === 'week') dueDate = zoneBounds(today).weekEnd;
    else if (kind === 'date') {
      if (!nextDate.value) {
        nextDate.focus();
        return;
      }
      dueDate = nextDate.value;
    }
    step.done = true;
    onFollowUp(step.parent, { title: title.slice(0, FOLLOW_UP_MAX), dueDate }, { closed: false });
    close();
  }

  next.addEventListener('click', (event) => {
    const button = event.target.closest('[data-next]');
    if (button) chooseNext(button.dataset.next);
  });
  nextPick.addEventListener('click', () => {
    const opening = nextDateRow.hidden;
    nextDateRow.hidden = !opening;
    nextPick.setAttribute('aria-expanded', String(opening));
    if (opening) nextDate.focus();
  });
  nextDate.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      chooseNext('date');
    }
  });
  nextTitle.addEventListener('input', updateNextTitle);
  document.getElementById('editor-next-skip').addEventListener('click', () => {
    if (step) step.done = true;
    close();
  });
  document.getElementById('editor-next-close').addEventListener('click', close);

  waiting.addEventListener('change', () => {
    updateBoxes();
    if (waiting.checked) waitingOn.focus();
  });
  followTick.addEventListener('change', () => {
    updateBoxes();
    if (followTick.checked) followTitle.focus();
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
    updateRepeatNotes();
    due.focus();
  });
  due.addEventListener('input', () => {
    updateSomedayNote();
    updateRepeatNotes();
  });
  repeat.addEventListener('change', updateRepeatNotes);
  project.addEventListener('change', () => {
    updateNewProject();
    if (project.value === NEW_PROJECT) newProjectName.focus();
  });
  newProjectName.addEventListener('input', () => {
    if (!newProjectError.hidden) hideNewProjectError();
  });

  title.addEventListener('input', () => {
    if (titleError.hidden) return;
    titleError.hidden = true;
    title.removeAttribute('aria-invalid');
  });

  dialog.addEventListener('close', () => {
    // Closed while asking what comes next, with a title in the box: it
    // goes to Someday rather than vanishing.
    if (step && !step.done && nextTitle.value.trim()) {
      onFollowUp(step.parent, { title: nextTitle.value.trim().slice(0, FOLLOW_UP_MAX), dueDate: null }, { closed: true });
    }
    endStep();
    window.removeEventListener('resize', refit);
    window.removeEventListener('scroll', follow, { capture: true });
    for (const el of document.querySelectorAll('.card.is-editing')) el.classList.remove('is-editing');
    anchor = null;
    if (!card) return;
    const closed = card;
    card = null;
    onClose(closed, saved);
  });

  return { open, close };
}
