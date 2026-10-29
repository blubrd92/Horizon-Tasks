// Starts Horizon: checks the config, handles sign-in, and keeps the board in
// sync with Firestore.

import { config } from '../config.js';
import {
  addDays,
  formatShort,
  ignoredToday,
  isISODate,
  pretendToday,
  todayISO,
  zoneBounds,
  zoneFor,
  zoneStart,
} from './dates.js';
import { FOLD_SHOW, cardsIn, describeZone, offersTriage, placeOf, renderBoard, renderSomeday } from './board.js';
import { renderStrip } from './strip.js';
import { sinceLine } from './since.js';
import { planVisit } from './visits.js';
import { STATUS, newCard, normalizeSettings } from './model.js';
import { keepSeries, nextCard, repeats, seriesChanges } from './repeat.js';
import { planDrop } from './order.js';
import { setupQuickAdd } from './quickadd.js';
import { setupEditor } from './editor.js';
import { setupDrag } from './drag.js';
import { setupSomeday } from './someday.js';
import { setupDatePick } from './datepick.js';
import { setupSettings } from './settings.js';
import { setupDone } from './done.js';
import { copyText, putBackChanges, rangeFor, rangeTimes } from './record.js';
import { NEW_PROJECT, findByName, finishedOf, nextColor, openCounts, projectIdFromHash } from './projects.js';
import { setupProjectList } from './projectlist.js';
import { setupProjectPage } from './projectpage.js';

const views = {
  setup: document.getElementById('view-setup'),
  signin: document.getElementById('view-signin'),
  notallowed: document.getElementById('view-notallowed'),
  board: document.getElementById('view-board'),
  done: document.getElementById('view-done'),
  project: document.getElementById('view-project'),
};
const zonesEl = document.getElementById('zones');
const horizonEl = document.getElementById('horizon');
const somedayCardsEl = document.getElementById('someday-cards');
const stripEl = document.getElementById('strip');
const pretendBar = document.getElementById('pretend-bar');
const quickAddField = document.querySelector('.quickadd');
const boardMessage = document.getElementById('board-message');
const signinButton = document.getElementById('signin-button');
const signinError = document.getElementById('signin-error');
const signoutButton = document.getElementById('signout-button');
const settingsButton = document.getElementById('settings-button');
const projectsButton = document.getElementById('projects-button');
const projectHeading = document.getElementById('project-heading');
const notallowedEmail = document.getElementById('notallowed-email');
const notallowedSignout = document.getElementById('notallowed-signout');

// The latest cards and categories from Firestore, kept so the board can be
// redrawn when the date changes without asking Firestore again.
let latest = null;
let drawnForDay = null;
// The signed-in, approved user's ID, or null. Every save goes under it.
let uid = null;
// While a card is being dragged, redrawing would pull it out from under the
// pointer, so news from Firestore waits until the card is dropped.
let dragging = false;
let drawWaiting = false;

// Firebase (loaded once the config is real) and the quick add field, set up
// in start().
let fb = null;
let quickAdd = null;

// Morning triage and the Since yesterday line (see visits.js).
// claimedDay: the day this tab last counted as a visit.
// triageDay: the day this tab shows triage buttons for.
// since: { day, at } the line counts from, or null for no line.
// finished: cards done since then; undefined while loading, null if they
// couldn't be loaded.
let claimedDay = null;
let triageDay = null;
let since = null;
let finished;
let stopFinished = null;
// After a triage button pressed from the keyboard, focus goes to the next
// overdue card's buttons once the board redraws.
let focusTriageFor = null;
// The strip day whose cards are highlighted, or null. revealDay asks the
// next drawing to scroll them into view.
let highlightDay = null;
let revealDay = false;

// Your settings (see model.js), and the folded zones you've opened on this
// page. focusFold asks the next drawing to put keyboard focus back near a
// zone's fold button: { zone, opened }.
let settings = normalizeSettings(null);
const openZones = new Set();
let focusFold = null;

// Your categories, from your profile.
let categories = [];

// Your projects, active and archived, kept live (see projects.js).
// projectsLoaded is false until Firestore has sent them once, so a project
// page can tell "loading" from "no such project".
let projects = [];
let projectsLoaded = false;

// The Done record (set up in start()): refresh() redraws it for the day,
// and doneDay is the day it was last worked out for, so it can move on at
// midnight.
let doneView = null;
let doneDay = null;
// The project page and the Projects list (set up in start()): refresh()
// redraws them from the latest cards and projects.
let projectView = null;

// A panel's X sits right over the Sign out button, so a double-click on the
// X would close the panel and then sign you out. For a moment after any
// panel closes, Sign out ignores clicks.
const SIGNOUT_PAUSE = 600;
let panelClosedAt = 0;
function notePanelClosed() {
  panelClosedAt = performance.now();
}
for (const id of ['editor', 'datepick', 'settings', 'projects', 'project-edit']) document.getElementById(id).addEventListener('close', notePanelClosed);
document.getElementById('someday-close').addEventListener('click', notePanelClosed);

const someday = setupSomeday({
  tab: document.getElementById('someday-tab'),
  panel: document.getElementById('someday-panel'),
  closeButton: document.getElementById('someday-close'),
  counts: document.querySelectorAll('[data-someday-count]'),
});

function show(name) {
  for (const [key, el] of Object.entries(views)) el.hidden = key !== name;
  document.body.classList.remove('is-loading');
  // The testing bar belongs to the board, the Done record, and project
  // pages.
  pretendBar.hidden = !pretendBar.hasChildNodes() || !['board', 'done', 'project'].includes(name);
  document.title = name === 'done' ? 'What you did \u00b7 Horizon' : 'Horizon';
}

// The board, the Done record at #done, or a project's page at
// #project/<id>.
function routeView() {
  if (location.hash === '#done') return 'done';
  if (projectIdFromHash(location.hash)) return 'project';
  return 'board';
}

function shownView() {
  return Object.keys(views).find((key) => !views[key].hidden);
}

function draw() {
  if (!latest) return;
  if (dragging) {
    drawWaiting = true;
    return;
  }
  // The strip moves on at midnight, and so does a highlighted day.
  if (drawnForDay && todayISO() !== drawnForDay) highlightDay = null;
  drawnForDay = todayISO();
  const data = {
    ...latest,
    projects,
    today: drawnForDay,
    triage: triageDay === drawnForDay,
    highlight: highlightDay,
    fold: settings.foldLongZones ? { open: openZones } : null,
  };
  renderBoard(zonesEl, data);
  someday.setCount(renderSomeday(somedayCardsEl, data));
  renderStrip(stripEl, data);
  drawSince();
  if (projectView) projectView.refresh();

  if (focusFold) {
    const { zone, opened } = focusFold;
    focusFold = null;
    const zoneEl = zonesEl.querySelector(`.zone-${zone}`);
    // Opened: the first card that was hidden. Folded: the "+N more" button.
    const target = zoneEl && (opened ? zoneEl.querySelectorAll('.card-open')[FOLD_SHOW] : zoneEl.querySelector('[data-fold]'));
    if (target) target.focus();
  }

  if (revealDay) {
    revealDay = false;
    const first = zonesEl.querySelector('.card.is-match');
    if (first) reveal(first);
  }

  if (focusTriageFor) {
    const button = zonesEl.querySelector(`[data-triage-card="${CSS.escape(focusTriageFor)}"] button`);
    focusTriageFor = null;
    if (button) button.focus();
  }
}

// Brings a highlighted card into view: its zone sideways inside the board
// (on a phone that swipes to it), then the card itself up or down.
function reveal(cardEl) {
  const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  const box = horizonEl.getBoundingClientRect();
  const zone = cardEl.closest('.zone').getBoundingClientRect();
  if (zone.left < box.left || zone.right > box.right) {
    horizonEl.scrollBy({ left: zone.left - box.left - 16, behavior });
  }
  const r = cardEl.getBoundingClientRect();
  if (r.top < 0 || r.bottom > window.innerHeight) window.scrollBy({ top: r.top - 120, behavior });
}

// Tapping a strip day highlights its cards; tapping it again clears.
function toggleDay(day) {
  highlightDay = highlightDay === day ? null : day;
  revealDay = Boolean(highlightDay);
  draw();
  if (!quickAdd) return;
  if (!highlightDay) {
    quickAdd.dismissNote();
    return;
  }
  const n = latest ? latest.cards.filter((c) => c.dueDate === day).length : 0;
  const when = day === todayISO() ? 'today' : formatShort(day);
  quickAdd.showNote(
    n
      ? `Showing ${n} ${n === 1 ? 'card' : 'cards'} due ${when}. ${clearHint()}`
      : `Nothing due ${when}.`,
  );
}

// A phone has no Escape key to mention.
function clearHint() {
  return window.matchMedia('(any-pointer: fine)').matches
    ? 'Tap the day again or press Escape to clear.'
    : 'Tap the day again to clear.';
}

stripEl.addEventListener('click', (event) => {
  const tile = event.target.closest('[data-strip-day]');
  if (tile) toggleDay(tile.dataset.stripDay);
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !highlightDay || event.defaultPrevented || views.board.hidden) return;
  // Escape in an open panel closes the panel, not the highlight.
  if (document.querySelector('dialog[open]')) return;
  toggleDay(highlightDay);
});

function drawSince() {
  if (!quickAdd) return;
  // Wait for the finished cards rather than showing a line that changes a
  // moment later.
  const ready = latest && since && !(since.at !== null && finished === undefined);
  quickAdd.setSince(
    ready ? sinceLine({ since, today: todayISO(), active: latest.cards, finished: since.at === null ? [] : finished }) : null,
  );
}

// Cards drift left at midnight even if the page stays open: once a minute,
// redraw if the date has changed since the last drawing. A new day while
// you're looking is also a new visit.
setInterval(() => {
  if (latest && todayISO() !== drawnForDay) {
    draw();
    claimVisit();
  }
  // The Done record's "this week" moves on at midnight too. (A project
  // page's groups move with the board, in draw().)
  if (doneView && doneDay && todayISO() !== doneDay) doneView.refresh();
}, 60 * 1000);

// Coming back to a tab or window that was already open is a visit too.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  if (latest && todayISO() !== drawnForDay) draw();
  claimVisit();
});

// Counts this tab as today's visit, once a day, and only while the board is
// on screen: a tab sitting unseen in the background must not use up the
// morning's triage. `stored` is the visit record if it was just read;
// otherwise it's read fresh.
async function claimVisit(stored = null) {
  const today = todayISO();
  if (!uid || document.hidden || claimedDay === today) return;
  claimedDay = today;
  const forUid = uid;
  let record = stored;
  if (!record) {
    try {
      record = await fb.loadVisit(forUid);
    } catch (err) {
      console.warn('Could not read the visit record', err);
      claimedDay = null;
      return;
    }
  }
  if (uid !== forUid || todayISO() !== today) return;

  const plan = planVisit(record, today);
  const testing = Boolean(pretendToday());
  // Test mode always shows triage, and never writes the visit record, so
  // testing can't spoil tomorrow morning's real one.
  if (plan.firstOfDay || testing || triageRemembered(today)) {
    triageDay = today;
    if (!testing) rememberTriage(today);
  }
  if (plan.write && !testing) fb.saveVisit(forUid, plan.write).catch((err) => console.warn('Could not save the visit record', err));
  watchSince(plan.since);
  draw();
}

// The tab that got the day's triage keeps it through a reload (phones reload
// background tabs on their own). sessionStorage belongs to this one tab.
function triageKey() {
  return `horizon.triageDay.${uid}`;
}

function triageRemembered(today) {
  try {
    return sessionStorage.getItem(triageKey()) === today;
  } catch {
    return false;
  }
}

function rememberTriage(today) {
  try {
    sessionStorage.setItem(triageKey(), today);
  } catch {
    // Private browsing can refuse storage; triage still works until reload.
  }
}

// Starts counting finished cards from `next.at` for the Since yesterday line.
function watchSince(next) {
  if (stopFinished) {
    stopFinished();
    stopFinished = null;
  }
  since = next;
  finished = undefined;
  if (since && since.at !== null && uid) {
    stopFinished = fb.watchFinishedSince(
      uid,
      since.at,
      (cards) => {
        finished = cards;
        drawSince();
      },
      (err) => {
        console.warn('Could not load finished cards', err);
        finished = null;
        drawSince();
      },
    );
  }
  drawSince();
}

// The bar that says a ?today= test date is on (or was typed wrong).
function showPretendBar() {
  const date = pretendToday();
  const ignored = ignoredToday();
  if (!date && ignored === null) return;
  const url = new URL(location.href);
  url.searchParams.delete('today');
  const link = document.createElement('a');
  link.href = url.pathname + url.search + url.hash;
  // Stay on whichever view you're on when you follow the link.
  link.addEventListener('click', () => {
    link.href = url.pathname + url.search + location.hash;
  });
  if (date) {
    link.textContent = 'Back to the real today';
    pretendBar.replaceChildren(`Testing: the board is treating ${formatShort(date)} as today. Changes you make still save. `, link);
  } else {
    link.textContent = 'Remove it';
    pretendBar.replaceChildren(`Testing: \u201c?today=${ignored}\u201d isn't a real date, so the board is using the real today. `, link);
  }
}
showPretendBar();

function configIsFilledIn() {
  return Object.values(config.firebase).every((v) => typeof v === 'string' && v && !v.includes('PASTE_'));
}

async function start() {
  if (!configIsFilledIn()) {
    show('setup');
    return;
  }

  // Firebase is loaded only once the config is real, so a blank config shows
  // the setup note instead of a confusing Firebase error.
  fb = await import('./firebase.js');
  let stopWatching = null;
  let stopProjects = null;
  // Counts sign-ins and sign-outs, so a slow check left over from an earlier
  // one can tell it is out of date and stop.
  let authChange = 0;

  signinButton.addEventListener('click', async () => {
    signinError.textContent = '';
    try {
      await fb.signIn();
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
        signinError.textContent = `Sign-in didn't work (${err.code || err.message}).`;
      }
    }
  });
  signoutButton.addEventListener('click', () => {
    if (performance.now() - panelClosedAt < SIGNOUT_PAUSE) return;
    fb.signOut();
  });
  notallowedSignout.addEventListener('click', () => fb.signOut());

  quickAdd = setupQuickAdd({
    input: document.getElementById('quickadd-input'),
    status: document.getElementById('quickadd-status'),
    since: document.getElementById('since-line'),
    onCompose: (title) =>
      editor.open({ id: null, ...newCard({ title }) }, { categories: latest ? latest.categories : [], projects }, { below: quickAddField }),
    onAdd: (title, toToday) => fb.addCard(uid, newCard({ title, dueDate: toToday ? todayISO() : null })),
    onEdit: openCard,
  });

  const editor = setupEditor({
    onSave: (cardId, changes, { moveSeries, newProject }) => {
      resolveProject(changes, newProject);
      const card = findCard(cardId);
      if (card) Object.assign(changes, seriesChanges(card, changes, moveSeries));
      // A new date means a new zone, where the card's old place among its
      // neighbors means nothing; it goes back to date order (see order.js).
      if ('dueDate' in changes) changes.order = null;
      fb.updateCard(uid, cardId, changes).catch(showSaveError);
    },
    onDone: (cardId, changes, { moveSeries, newProject }) => {
      resolveProject(changes, newProject);
      const card = findCard(cardId);
      if (card) Object.assign(changes, seriesChanges(card, changes, moveSeries));
      if (card && repeats({ ...card, ...changes })) {
        finishRepeating({ ...card, ...changes }, STATUS.DONE, changes);
        return;
      }
      fb.markDone(uid, cardId, changes).catch(showSaveError);
    },
    onCreate: (values, { newProject }) => {
      resolveProject(values, newProject);
      const fresh = { id: null, ...newCard(values) };
      const { id, saved } = fb.addCard(uid, { ...newCard(values), ...values, ...seriesChanges(fresh, values, false) });
      quickAdd.showAdded(addedText(values.dueDate), id);
      saved.catch((err) => {
        quickAdd.showText(`Couldn't save \u201c${values.title}\u201d (${err.code || err.message}).`);
        quickAdd.giveBack(values.title);
      });
    },
    onClose: (card, saved) => {
      // A new card closed without saving: its title goes back into quick
      // add, so nothing typed is lost. Focus is already back there.
      if (!card.id) {
        if (!saved) quickAdd.giveBack(card.title);
        return;
      }
      // The board redraws whenever Firestore sends news, which replaces the
      // card that opened the panel. Focus goes back to the new copy of it,
      // on the board or the project page, whichever is showing.
      const scope = views.project.hidden ? views.board : views.project;
      const button = scope.querySelector(`[data-card-id="${CSS.escape(card.id)}"]`);
      if (button) button.focus();
    },
  });

  // Marking a repeating card done, or letting it go, brings the next one in
  // the series (see repeat.js). `card` is the card with any edits made at
  // the same moment, which are `changes`.
  function finishRepeating(card, how, changes) {
    const next = nextCard(card, todayISO());
    const { id, saved } = fb.finishAndRepeat(uid, card.id, how, changes, next);
    const what = how === STATUS.DONE ? 'Done' : 'Let go';
    quickAdd.showAdded(`${what}. The next one is due ${formatShort(next.dueDate)}.`, id);
    saved.catch(showSaveError);
  }

  // "New project..." in the editor: the project is made now, and `fields`
  // (the card's changes or values) point at it. A name you already use
  // joins that project instead of making a twin.
  function resolveProject(fields, newProject) {
    if (fields.projectId !== NEW_PROJECT) return;
    const twin = findByName(projects, newProject || '');
    if (twin) {
      fields.projectId = twin.id;
      return;
    }
    const { id, saved } = fb.addProject(uid, { name: newProject, color: nextColor(projects), endDate: null });
    fields.projectId = id;
    saved.catch(showSaveError);
  }

  function addedText(dueDate) {
    if (!dueDate) return 'Added to Someday.';
    if (dueDate === todayISO()) return 'Added to Today.';
    return `Added for ${formatShort(dueDate)}.`;
  }

  function openCard(cardId) {
    const card = latest && latest.cards.find((c) => c.id === cardId);
    // Beside the card; a card in a closed Someday drawer has nothing to sit
    // beside, so it opens under the quick add field (or the project page's
    // heading).
    const fallback = views.project.hidden ? quickAddField : projectHeading;
    if (card) editor.open(card, { categories: latest.categories, projects }, { cardId, fallback });
  }

  for (const el of [zonesEl, somedayCardsEl]) {
    el.addEventListener('click', (event) => {
      const foldButton = event.target.closest('[data-fold]');
      if (foldButton) {
        const zone = foldButton.dataset.fold;
        const opened = !openZones.has(zone);
        if (opened) openZones.add(zone);
        else openZones.delete(zone);
        focusFold = { zone, opened };
        draw();
        return;
      }
      const triage = event.target.closest('[data-triage]');
      if (triage) {
        handleTriage(triage, event);
        return;
      }
      const button = event.target.closest('[data-card-id]');
      if (button) openCard(button.dataset.cardId);
    });
  }

  // A morning triage button. Tomorrow, This week, and Someday change the
  // date, so the card's old place among its neighbors is cleared, the same
  // as in the editor (see order.js). Let it go takes it off the board.
  function handleTriage(button, event) {
    const group = button.closest('[data-triage-card]');
    const cardId = group && group.dataset.triageCard;
    const card = findCard(cardId);
    const today = todayISO();
    if (!card || !uid || !offersTriage(card, today)) return;
    const action = button.dataset.triage;
    const weekEnd = zoneBounds(today).weekEnd;
    if (action === 'week' && weekEnd <= today) return;

    // From the keyboard (a click with no mouse behind it), focus moves on
    // to the next overdue card, so you can work down the column.
    if (event.detail === 0) {
      const ids = [...zonesEl.querySelectorAll('[data-triage-card]')].map((g) => g.dataset.triageCard);
      const at = ids.indexOf(cardId);
      focusTriageFor = ids[at + 1] || ids[at - 1] || null;
    }

    // Letting go of a repeating card skips this one; the series goes on.
    if (action === 'letgo' && repeats(card)) {
      finishRepeating(card, STATUS.LET_GO, {});
      return;
    }

    let saved;
    if (action === 'letgo') {
      saved = fb.letGo(uid, cardId);
    } else {
      const dueDate = action === 'tomorrow' ? addDays(today, 1) : action === 'week' ? weekEnd : null;
      saved = fb.updateCard(uid, cardId, { dueDate, order: null, ...keepSeries(card) });
    }
    saved.catch(showSaveError);
  }

  const datePick = setupDatePick();

  const settingsBox = setupSettings({
    onChange: (name, value) => {
      if (!uid) return;
      const before = settings;
      settings = { ...settings, [name]: value };
      draw();
      refreshDone();
      fb.saveSetting(uid, name, value).catch((err) => {
        // Refused: put the setting and the board back as they were.
        settings = before;
        settingsBox.show(settings);
        draw();
        refreshDone();
        boardMessage.hidden = false;
        boardMessage.textContent = `The setting didn't save, so it's back as it was (${err.code || err.message}).`;
      });
    },
  });
  settingsButton.addEventListener('click', () => settingsBox.open(settings));

  // The Done record. Only the range on screen is downloaded: done cards by
  // completedAt, let-go cards by letGoAt (see record.js and firebase.js).
  // doneCards and letGoCards are undefined while loading.
  let doneKind = 'month';
  let doneOffset = 0;
  // Custom's dates, { start, end }, once you've picked Custom.
  let doneCustom = null;
  let doneRange = null;
  let doneCards;
  let letGoCards;
  let doneError = null;
  let stopDone = [];

  const doneScreen = setupDone({
    // Week, Month, and Year always open the current one. Custom starts
    // from the range you were looking at.
    onRange: (kind) => {
      if (kind === 'custom' && doneKind !== 'custom' && doneRange) doneCustom = { start: doneRange.start, end: doneRange.end };
      setDoneRange(kind, 0);
    },
    onStep: (step) => setDoneRange(doneKind, Math.min(0, doneOffset + step)),
    onCustom: (start, end) => {
      doneCustom = { start, end };
      setDoneRange('custom', 0);
    },
    onCopy: copyDone,
    onPutBack: putBack,
  });
  doneView = { refresh: refreshDone };

  function setDoneRange(kind, offset) {
    doneKind = kind;
    doneOffset = offset;
    doneScreen.showStatus('');
    refreshDone();
  }

  function stopDoneQueries() {
    for (const stop of stopDone) stop();
    stopDone = [];
    doneRange = null;
  }

  // Draws the record for the chosen range, starting new queries when the
  // range has changed (a button, an arrow, or midnight).
  function refreshDone() {
    if (!uid || views.done.hidden) return;
    doneDay = todayISO();
    if (doneKind === 'custom' && !doneCustom) doneKind = 'month';
    const range = rangeFor(doneKind, doneOffset, doneDay, { yearStart: settings.yearStart, custom: doneCustom });
    if (!doneRange || range.start !== doneRange.start || range.end !== doneRange.end) {
      stopDoneQueries();
      doneCards = undefined;
      letGoCards = undefined;
      doneError = null;
      const { from, to } = rangeTimes(range);
      stopDone = [
        fb.watchStampedBetween(uid, 'completedAt', from, to, (cards) => {
          doneCards = cards.filter((card) => card.status === STATUS.DONE);
          drawDone();
        }, showDoneError),
        fb.watchStampedBetween(uid, 'letGoAt', from, to, (cards) => {
          letGoCards = cards.filter((card) => card.status === STATUS.LET_GO);
          drawDone();
        }, showDoneError),
      ];
    }
    doneRange = range;
    drawDone();
  }

  function drawDone() {
    if (!doneRange) return;
    doneScreen.render({ range: doneRange, today: doneDay, categories, done: doneCards, letGo: letGoCards, error: doneError });
  }

  function showDoneError(err) {
    doneError =
      err.code === 'permission-denied'
        ? 'Firestore refused to share your record. Check that the rules in firestore.rules are published in the Firebase console.'
        : `Couldn't load what you did (${err.code || err.message}).`;
    drawDone();
  }

  async function copyDone({ notes }) {
    if (!doneCards || !doneCards.length) return;
    const n = doneCards.length;
    const copied = await writeClipboard(copyText(doneCards, categories, doneRange, doneDay, { notes }));
    doneScreen.showStatus(
      copied
        ? `Copied ${n} ${n === 1 ? 'card' : 'cards'} as text, ready to paste.`
        : "Couldn't copy: the browser kept the clipboard closed.",
    );
  }

  // A done or let-go card back on the board, with its old due date. It
  // leaves the record (see putBackChanges in record.js).
  function putBack(card) {
    if (!uid) return;
    const where = !card.dueDate ? 'in Someday' : card.dueDate === todayISO() ? 'due today' : `due ${formatShort(card.dueDate)}`;
    doneScreen.showStatus(`\u201c${card.title}\u201d is back on the board, ${where}.`);
    fb.updateCard(uid, card.id, putBackChanges(card)).catch((err) => {
      doneScreen.showStatus(`\u201c${card.title}\u201d didn't go back on the board (${err.code || err.message}).`);
    });
  }

  // Projects: the list, the form, and a project's page. The page's open
  // cards are the board's own (already downloaded and live); its finished
  // ones come from one query on projectId, started when the page opens and
  // stopped when it closes. projectFinished is undefined while loading.
  let projectQueryFor = null;
  let projectFinished;
  let projectError = null;
  let stopProjectCards = null;

  const projectList = setupProjectList({
    onCreate: (fields) => {
      const { saved } = fb.addProject(uid, fields);
      projectList.showListStatus(`Made \u201c${fields.name}\u201d.`);
      saved.catch((err) => projectList.showListStatus(`Couldn't save \u201c${fields.name}\u201d (${err.code || err.message}).`));
    },
    onSave: (id, changes) => {
      fb.updateProject(uid, id, changes).catch(showProjectError);
    },
    onArchive: (id, archived) => {
      projectPage.showStatus(archived ? 'Archived. Its cards stay where they are.' : 'Back on the list.');
      fb.archiveProject(uid, id, archived).catch(showProjectError);
    },
    onDelete: deleteProject,
    // "Its 6 cards (2 open, 4 done or let go) stay where they are, without
    // a project." The finished ones are known once the page's query is in.
    deleteText: (project) => {
      const open = latest ? latest.cards.filter((c) => c.projectId === project.id).length : 0;
      const closed = projectQueryFor === project.id && projectFinished ? projectFinished.done.length + projectFinished.letGo.length : null;
      const total = open + (closed || 0);
      const plural = (n) => `${n} ${n === 1 ? 'card' : 'cards'}`;
      let cards;
      if (closed === null) cards = `Its ${open ? `${plural(open)} on the board` : 'cards'}, and any finished ones, stay where they are, without a project.`;
      else if (!total) cards = 'It has no cards.';
      else if (open && closed) cards = `Its ${plural(total)} (${open} open, ${closed} done or let go) stay where they are, without a project.`;
      else cards = `Its ${plural(total)} ${open ? 'on the board' : 'in What you did'} ${total === 1 ? 'stays where it is' : 'stay where they are'}, without a project.`;
      return `Delete \u201c${project.name}\u201d? ${cards} This can't be undone.`;
    },
  });

  const projectPage = setupProjectPage({
    onOpenCard: openCard,
    onEdit: (project) => projectList.openForm(project, projects),
  });

  for (const button of document.querySelectorAll('[data-open-projects]')) {
    button.addEventListener('click', () => {
      if (uid) projectList.openList(listState());
    });
  }

  function listState() {
    return { projects, counts: openCounts(latest ? latest.cards : []), today: todayISO() };
  }

  projectView = {
    refresh() {
      projectList.refresh(listState());
      refreshProject();
    },
  };

  function stopProjectQuery() {
    if (stopProjectCards) stopProjectCards();
    stopProjectCards = null;
    projectQueryFor = null;
    projectFinished = undefined;
    projectError = null;
  }

  // Draws the project page for the address, starting its query when the
  // project has changed.
  function refreshProject() {
    if (!uid || views.project.hidden) return;
    const projectId = projectIdFromHash(location.hash);
    if (projectId !== projectQueryFor) {
      stopProjectQuery();
      projectQueryFor = projectId;
      if (projectId) {
        stopProjectCards = fb.watchProjectCards(
          uid,
          projectId,
          (cards) => {
            projectFinished = finishedOf(cards);
            refreshProject();
          },
          (err) => {
            projectError =
              err.code === 'permission-denied'
                ? 'Firestore refused to share these cards. Check that the rules in firestore.rules are published in the Firebase console.'
                : `Couldn't load the finished cards (${err.code || err.message}).`;
            projectFinished = { done: [], letGo: [] };
            refreshProject();
          },
        );
      }
    }
    const project = projectsLoaded ? projects.find((p) => p.id === projectId) || null : undefined;
    projectPage.render({
      project,
      loading: !projectsLoaded || !latest,
      today: todayISO(),
      categories,
      cards: latest ? latest.cards.filter((c) => c.projectId === projectId) : [],
      finished: projectFinished,
      error: projectError,
    });
    document.title = `${projectPage.title()} \u00b7 Horizon`;
  }

  function showProjectError(err) {
    const text = `A change to the project didn't save (${err.code || err.message}).`;
    if (!views.project.hidden) projectPage.showStatus(text);
    else projectList.showListStatus(text);
  }

  // Deleting a project: its cards lose the project and stay; then the
  // project goes (see firebase.js). You land on the board.
  function deleteProject(id) {
    const project = projects.find((p) => p.id === id);
    const name = project ? project.name : 'The project';
    location.hash = '';
    quickAdd.showText(`Deleting \u201c${name}\u201d\u2026`);
    fb.deleteProject(uid, id).then(
      () => quickAdd.showNote(`Deleted \u201c${name}\u201d. Its cards are still here, without a project.`),
      (err) => quickAdd.showText(`\u201c${name}\u201d wasn't deleted (${err.code || err.message}).`),
    );
  }

  // #done shows the record, #project/<id> a project's page; anything else,
  // the board. Before sign-in has finished, the sign-in code reads the
  // address itself.
  function route() {
    if (!uid) return;
    const view = routeView();
    const was = shownView();
    const projectChanged = view === 'project' && projectIdFromHash(location.hash) !== projectQueryFor;
    if (view === was && !projectChanged) return;
    if (was === 'done' && view !== 'done') {
      stopDoneQueries();
      doneScreen.reset();
    }
    if (was === 'project') {
      stopProjectQuery();
      projectPage.reset();
    }
    show(view);
    window.scrollTo(0, 0);
    editor.close();
    datePick.cancel();
    settingsBox.close();
    projectList.close();
    if (view === 'done') {
      refreshDone();
      doneScreen.focusHeading();
    } else if (view === 'project') {
      refreshProject();
      projectPage.focusHeading();
    }
  }
  window.addEventListener('hashchange', route);

  setupDrag({
    root: views.board,
    scrollers: () => [horizonEl, somedayCardsEl, stripEl],
    canDrop: (place, cardId) => {
      const card = findCard(cardId);
      if (!card || !uid) return false;
      // A strip day: any of them (they start today).
      if (isISODate(place)) return true;
      const bounds = zoneBounds(todayISO());
      // Rearranging where it already is is always fine.
      if (place === placeOf(card, bounds)) return true;
      // Nobody means to schedule something in the past.
      if (place === 'overdue') return false;
      // On a Sunday, This Week has no days left.
      if (place === 'week' && bounds.weekEnd <= bounds.today) return false;
      return true;
    },
    // Only when the card would go somewhere new: reordering in its own zone,
    // or hovering its own strip day, says nothing.
    labelFor: (place, cardId) => {
      const card = findCard(cardId);
      if (!card) return '';
      const today = todayISO();
      if (isISODate(place)) {
        if (place === card.dueDate) return '';
        return place === today ? 'Today' : formatShort(place);
      }
      if (place === placeOf(card, zoneBounds(today))) return '';
      return place === 'someday' ? 'Someday' : describeZone(place, today).name;
    },
    onStart: (cardId, cardEl) => {
      dragging = true;
      // On a phone the open drawer covers the board; get it out of the way
      // so the card can be dropped on a zone.
      if (someday.coversBoard() && somedayCardsEl.contains(cardEl)) someday.close();
    },
    onEnd: () => {
      dragging = false;
      if (drawWaiting) {
        drawWaiting = false;
        draw();
      }
    },
    onDrop: (drop) => handleDrop(drop).catch(showSaveError),
  });

  // What a drop means. place is a zone ("today", "week", ...) or "someday";
  // index is the card's new position among the cards already there.
  async function handleDrop({ cardId, place, index }) {
    const card = findCard(cardId);
    if (!card || !uid) return;
    // Dropped on a strip day: that exact date, so date order in whatever
    // zone the date belongs to.
    if (isISODate(place)) {
      if (place !== card.dueDate) await fb.updateCard(uid, cardId, { dueDate: place, order: null, ...keepSeries(card) });
      return;
    }
    const today = todayISO();
    const from = placeOf(card, zoneBounds(today));
    // The cards there now, in their shown order, without the dropped one.
    const neighborIds = cardsIn(place, latest.cards, today)
      .map((c) => c.id)
      .filter((id) => id !== cardId);

    let dueDate = card.dueDate;
    if (place === from) {
      const shown = cardsIn(place, latest.cards, today).map((c) => c.id);
      if (shown.indexOf(cardId) === index) return; // dropped where it was
    } else if (place === 'someday') {
      dueDate = null;
    } else if (place === 'today') {
      dueDate = today;
    } else {
      const { name, range } = describeZone(place, today);
      dueDate = await datePick.ask({
        title: `Move to ${name}`,
        card: card.title,
        rangeText: place === 'later' ? `Later is anything ${range}.` : `${name} runs ${range}.`,
        preset: zoneStart(place, zoneBounds(today)),
      });
      if (!dueDate) return;
    }

    // The picker may have been open a while; work from the freshest cards.
    const moved = findCard(cardId);
    if (!moved || !uid) return;
    const updates = new Map();
    if (dueDate !== moved.dueDate) updates.set(cardId, { dueDate, ...keepSeries(moved) });

    const lands = dueDate ? zoneFor(dueDate, zoneBounds(todayISO())) : 'someday';
    if (lands !== place) {
      // A date picked outside the zone it was dropped on: the card goes
      // where its date says, in date order.
      updates.set(cardId, { ...updates.get(cardId), dueDate, order: null });
    } else {
      const list = neighborIds.map(findCard).filter(Boolean);
      const at = Math.min(index, list.length);
      list.splice(at, 0, { ...moved, dueDate });
      for (const [id, order] of planDrop(list, at)) {
        updates.set(id, { ...updates.get(id), order });
      }
    }
    await fb.saveCards(uid, [...updates].map(([id, changes]) => ({ id, changes })));
  }

  function findCard(cardId) {
    return latest ? latest.cards.find((c) => c.id === cardId) : undefined;
  }

  fb.watchAuth(async (user) => {
    const thisChange = ++authChange;
    if (stopWatching) {
      stopWatching();
      stopWatching = null;
    }
    latest = null;
    uid = null;
    zonesEl.innerHTML = '';
    somedayCardsEl.innerHTML = '';
    stripEl.innerHTML = '';
    claimedDay = null;
    triageDay = null;
    focusTriageFor = null;
    highlightDay = null;
    stopDoneQueries();
    doneScreen.reset();
    stopProjectQuery();
    projectPage.reset();
    projectList.close();
    if (stopProjects) {
      stopProjects();
      stopProjects = null;
    }
    projects = [];
    projectsLoaded = false;
    projectsButton.disabled = true;
    categories = [];
    settings = normalizeSettings(null);
    openZones.clear();
    settingsBox.close();
    settingsButton.disabled = true;
    watchSince(null);
    someday.setCount(0);
    someday.close();
    datePick.cancel();
    editor.close();
    quickAdd.clear();
    quickAdd.setEnabled(false);

    if (!user) {
      show('signin');
      return;
    }

    try {
      const approved = await fb.isApproved(user);
      if (thisChange !== authChange) return;
      if (!approved) {
        notallowedEmail.textContent = user.email || 'This account';
        show('notallowed');
        return;
      }
      show(routeView());
      boardMessage.hidden = true;
      const profile = await fb.loadProfile(user.uid);
      const { visit } = profile;
      if (thisChange !== authChange) return;
      uid = user.uid;
      categories = profile.categories;
      settings = profile.settings;
      settingsButton.disabled = false;
      projectsButton.disabled = false;
      quickAdd.setEnabled(true);
      stopProjects = fb.watchProjects(
        user.uid,
        (list) => {
          projects = list;
          projectsLoaded = true;
          // Drawing the board refreshes the project page and list too.
          if (latest) draw();
          else projectView.refresh();
        },
        (err) => {
          console.warn('Could not load projects', err);
          projectsLoaded = true;
          projectView.refresh();
        },
      );
      stopWatching = fb.watchActiveCards(
        user.uid,
        (cards) => {
          latest = { cards, categories };
          draw();
        },
        showLoadError,
      );
      refreshDone();
      refreshProject();
      // The record just read is fresh unless the tab is out of sight, in
      // which case the visit waits until you look, and reads it again then.
      claimVisit(document.hidden ? null : visit);
    } catch (err) {
      if (thisChange !== authChange) return;
      show('board');
      showLoadError(err);
    }
  });
}

// Copies text to the clipboard. Returns whether it worked.
async function writeClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers, or a clipboard the browser keeps closed: the old way,
    // through a hidden text box.
  }
  const had = document.activeElement;
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.append(area);
  area.select();
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  area.remove();
  if (had && had.focus) had.focus();
  return copied;
}

function showLoadError(err) {
  boardMessage.hidden = false;
  boardMessage.textContent =
    err.code === 'permission-denied'
      ? "Firestore refused to share your cards. Check that the rules in firestore.rules are published in the Firebase console."
      : `Couldn't load your cards (${err.code || err.message}).`;
}

// Saves appear on the board at once; if Firestore later refuses one, the board
// puts the card back as it was and this says why.
function showSaveError(err) {
  boardMessage.hidden = false;
  boardMessage.textContent = `A change didn't save, so the board shows the card as it was (${err.code || err.message}).`;
}

start();
