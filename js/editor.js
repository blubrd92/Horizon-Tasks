// The card editor: a panel that opens beside the card you clicked, or under
// the quick add field when you press Enter there to start a new card. On a
// phone it fills the screen instead. This file only fills in the form and
// collects what changed; app.js decides how changes are saved.

import { activeOf } from './categories.js';
import { formatShort, todayISO } from './dates.js';
import { PROJECT_STATUS, STATUS, WAITING_ON_MAX, FOLLOW_UP_MAX } from './model.js';
import { daysText, isWaiting, waitingDays } from './followup.js';
import { NEW_PROJECT, nameOrder } from './projects.js';
import { placeBeside } from './place.js';
import { anchorOf, describeMove, describeRhythm, repeats } from './repeat.js';
import { sameChecklist, setupChecklist } from './checklist.js';
import { dateNote } from './plan.js';

// The follow-up arrow, small, for the "After ..." line.
const THEN_SMALL = () => {
  const span = document.createElement('span');
  span.className = 'editor-after-icon';
  span.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 4v7a4 4 0 0 0 4 4h9"></path><path d="M15 11l4 4-4 4"></path></svg>';
  return span;
};

// A plan step: a short numbered list, for the "Step 3 of 6" line.
const STEPS_SMALL = () => {
  const span = document.createElement('span');
  span.className = 'editor-after-icon';
  span.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 6h10M10 12h10M10 18h10"></path><path d="M4 5l1.5-1v4"></path><path d="M3.5 11.5a1.3 1.3 0 0 1 2.4.6c0 .9-2.4 1.9-2.4 2.9h2.5"></path><path d="M3.6 17.2h2.2l-1.2 1.4a1.1 1.1 0 1 1-1 1.6"></path></svg>';
  return span;
};

const FOLLOW_NOTE = "With a title and a date, Mark done makes it without asking. It keeps this card's category and project.";
const FOLLOW_NOTE_STEP = 'A follow-up here joins the plan: when this step is done, it becomes the next step, with this one\u2019s category.';

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
// card, context, where } when its follow-up still needs a title or a
// date: the card is saved as done by then, and the editor reopens as a
// New card with those fields (the follow-up, in the chain: see
// followup.js), opened with context and where as open() takes them. Add
// card goes to onCreate as for any new card; the card's own hidden fields
// (its chain) come along as `base`.
export function setupEditor({ onSave, onDone, onCreate, onClose, onTick }) {
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
  const stepNote = document.getElementById('editor-step-note');
  const followNote = document.getElementById('editor-follow-note');
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
  // For a plan step: { number, total, prev, before, after } (plan.js
  // stepContext), or { number, total } until the rest is known; null for
  // any other card.
  let plan = null;
  // A follow-up to open as a New card once this panel has finished
  // closing (the close event comes a moment after close()).
  let reopen = null;
  // Where the editor sits: { cardId, fallback } beside that card (or under
  // `fallback` if the card isn't showing), or { below } under an element.
  let anchor = null;
  let frame = 0;

  // A new card (one without an id) isn't saved until you press Add card, so
  // it has nothing to mark done yet. categories and projects are yours,
  // for the menus. startFollowUp (the right-click menu's "Follow-up...")
  // opens it with Follow-up on and its title box focused.
  //
  // plan: for a step in a project's plan, where it stands (see above).
  function open(cardToEdit, { categories, projects, plan: step = null }, where = null, { startFollowUp = false } = {}) {
    // A copy: a tick changes its checklist (above), never the board's.
    card = { ...cardToEdit, checklist: cardToEdit.checklist || [] };
    plan = step;
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
    fillProjects(projects);
    hard.checked = card.deadlineType === 'hard';
    waiting.checked = isWaiting(card);
    waitingOn.value = card.waitingOn || '';
    followTick.checked = Boolean(card.followUp) || startFollowUp;
    followTitle.value = card.followUp ? card.followUp.title : '';
    followDue.value = card.followUp && card.followUp.dueDate ? card.followUp.dueDate : '';
    showAfter();
    updateBoxes();
    repeat.value = plan ? 'none' : card.repeat;
    // A plan step doesn't repeat: Repeats stays at Doesn't repeat, grayed.
    repeat.disabled = Boolean(plan);
    followNote.textContent = plan ? FOLLOW_NOTE_STEP : FOLLOW_NOTE;
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
    // A new card's title is already typed; the date is usually next. A
    // follow-up left blank starts with its title.
    if (startFollowUp) followTitle.focus();
    else if (isNew) (card.title ? due : title).focus();
  }

  // "After Weed graphic novels, 741.5, done Thu, Nov 19": on a card made
  // from another card's follow-up. A plan step says where it stands
  // instead: "Step 3 of 6, after Confirm the troupe, due Mon, Nov 30".
  function showAfter() {
    if (plan) {
      showStep();
      return;
    }
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

  function showStep() {
    after.hidden = false;
    const words = document.createElement('span');
    words.append(`Step ${plan.number} of ${plan.total}`);
    if (plan.prev) {
      const name = document.createElement('b');
      name.textContent = plan.prev.title;
      words.append(', after ', name);
      if (plan.prev.day) {
        const day = document.createElement('span');
        day.className = 'editor-after-day';
        day.textContent = formatShort(plan.prev.day);
        words.append(plan.prev.how === 'open' ? ', due ' : `, ${plan.prev.how} `, day);
      }
    }
    after.replaceChildren(STEPS_SMALL(), words);
  }

  // The yellow note under Due for a step dated before the step ahead of
  // it, or after the one behind it. Nothing is moved.
  function updateStepNote() {
    const text = plan ? dateNote(plan, due.value || null) : '';
    stepNote.textContent = text;
    stepNote.hidden = !text;
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
    updateStepNote();
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
    repeatNote.textContent = plan ? 'Plan steps don\u2019t repeat.' : describeRhythm(rule, anchor, day);
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
      onCreate(values, { ...extras(), base: card });
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
    const followUp = onDone(card.id, changes, extras());
    saved = true;
    // Its follow-up still needs a title or a date: a New card for it, as
    // soon as this one has closed.
    reopen = followUp || null;
    close();
  });

  waiting.addEventListener('change', () => {
    updateBoxes();
    if (waiting.checked) waitingOn.focus();
  });
  document.getElementById('editor-follow-nodate').addEventListener('click', () => {
    followDue.value = '';
    followDue.focus();
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
    window.removeEventListener('resize', refit);
    window.removeEventListener('scroll', follow, { capture: true });
    for (const el of document.querySelectorAll('.card.is-editing')) el.classList.remove('is-editing');
    anchor = null;
    if (!card) return;
    const closed = card;
    card = null;
    plan = null;
    // A follow-up closed without Add card: the title as you left it goes
    // back to quick add (onClose), so a title typed here isn't lost.
    if (!closed.id && !saved && closed.afterId && title.value.trim()) closed.title = title.value.trim();
    onClose(closed, saved);
    if (reopen) {
      const { card: next, context, where } = reopen;
      reopen = null;
      open(next, context, where);
    }
  });

  // The rest of a step's place in its plan, once it's known (the step
  // before it may be finished, and only Firestore has those).
  function updatePlan(cardId, step) {
    if (!card || card.id !== cardId || !plan || !step) return;
    plan = step;
    showAfter();
    updateStepNote();
    follow();
  }

  return { open, close, updatePlan };
}
