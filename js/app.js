// Starts Horizon: checks the config, handles sign-in, and keeps the board in
// sync with Firestore.

import { config } from '../config.js';
import { formatShort, todayISO, zoneBounds, zoneFor, zoneStart } from './dates.js';
import { cardsIn, describeZone, placeOf, renderBoard, renderSomeday } from './board.js';
import { newCard } from './model.js';
import { planDrop } from './order.js';
import { setupQuickAdd } from './quickadd.js';
import { setupEditor } from './editor.js';
import { setupDrag } from './drag.js';
import { setupSomeday } from './someday.js';
import { setupDatePick } from './datepick.js';

const views = {
  setup: document.getElementById('view-setup'),
  signin: document.getElementById('view-signin'),
  notallowed: document.getElementById('view-notallowed'),
  board: document.getElementById('view-board'),
};
const zonesEl = document.getElementById('zones');
const horizonEl = document.getElementById('horizon');
const somedayCardsEl = document.getElementById('someday-cards');
const boardMessage = document.getElementById('board-message');
const signinButton = document.getElementById('signin-button');
const signinError = document.getElementById('signin-error');
const signoutButton = document.getElementById('signout-button');
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

const someday = setupSomeday({
  tab: document.getElementById('someday-tab'),
  panel: document.getElementById('someday-panel'),
  closeButton: document.getElementById('someday-close'),
  counts: document.querySelectorAll('[data-someday-count]'),
});

function show(name) {
  for (const [key, el] of Object.entries(views)) el.hidden = key !== name;
  document.body.classList.remove('is-loading');
}

function draw() {
  if (!latest) return;
  if (dragging) {
    drawWaiting = true;
    return;
  }
  drawnForDay = todayISO();
  const data = { ...latest, today: drawnForDay };
  renderBoard(zonesEl, data);
  someday.setCount(renderSomeday(somedayCardsEl, data));
}

// Cards drift left at midnight even if the page stays open: once a minute,
// redraw if the date has changed since the last drawing.
setInterval(() => {
  if (latest && todayISO() !== drawnForDay) draw();
}, 60 * 1000);

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
  const fb = await import('./firebase.js');
  let stopWatching = null;
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
  signoutButton.addEventListener('click', () => fb.signOut());
  notallowedSignout.addEventListener('click', () => fb.signOut());

  const quickAdd = setupQuickAdd({
    input: document.getElementById('quickadd-input'),
    status: document.getElementById('quickadd-status'),
    onCompose: (title) => editor.open({ id: null, ...newCard({ title }) }, latest ? latest.categories : []),
    onAdd: (title, toToday) => fb.addCard(uid, newCard({ title, dueDate: toToday ? todayISO() : null })),
    onEdit: openCard,
  });

  const editor = setupEditor({
    onSave: (cardId, changes) => {
      // A new date means a new zone, where the card's old place among its
      // neighbors means nothing; it goes back to date order (see order.js).
      if ('dueDate' in changes) changes.order = null;
      fb.updateCard(uid, cardId, changes).catch(showSaveError);
    },
    onDone: (cardId, changes) => fb.markDone(uid, cardId, changes).catch(showSaveError),
    onCreate: (values) => {
      const { id, saved } = fb.addCard(uid, { ...newCard(values), ...values });
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
      // card that opened the panel. Focus goes back to the new copy of it.
      const button = views.board.querySelector(`[data-card-id="${CSS.escape(card.id)}"]`);
      if (button) button.focus();
    },
  });

  function addedText(dueDate) {
    if (!dueDate) return 'Added to Someday.';
    if (dueDate === todayISO()) return 'Added to Today.';
    return `Added for ${formatShort(dueDate)}.`;
  }

  function openCard(cardId) {
    const card = latest && latest.cards.find((c) => c.id === cardId);
    if (card) editor.open(card, latest.categories);
  }

  for (const el of [zonesEl, somedayCardsEl]) {
    el.addEventListener('click', (event) => {
      const button = event.target.closest('[data-card-id]');
      if (button) openCard(button.dataset.cardId);
    });
  }

  const datePick = setupDatePick();

  setupDrag({
    root: views.board,
    scrollers: () => [horizonEl, somedayCardsEl],
    canDrop: (place, cardId) => {
      const card = findCard(cardId);
      if (!card || !uid) return false;
      const bounds = zoneBounds(todayISO());
      // Rearranging where it already is is always fine.
      if (place === placeOf(card, bounds)) return true;
      // Nobody means to schedule something in the past.
      if (place === 'overdue') return false;
      // On a Sunday, This Week has no days left.
      if (place === 'week' && bounds.weekEnd <= bounds.today) return false;
      return true;
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
    if (dueDate !== moved.dueDate) updates.set(cardId, { dueDate });

    const lands = dueDate ? zoneFor(dueDate, zoneBounds(todayISO())) : 'someday';
    if (lands !== place) {
      // A date picked outside the zone it was dropped on: the card goes
      // where its date says, in date order.
      updates.set(cardId, { dueDate, order: null });
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
      show('board');
      boardMessage.hidden = true;
      const categories = await fb.loadProfile(user.uid);
      if (thisChange !== authChange) return;
      uid = user.uid;
      quickAdd.setEnabled(true);
      stopWatching = fb.watchActiveCards(
        user.uid,
        (cards) => {
          latest = { cards, categories };
          draw();
        },
        showLoadError,
      );
    } catch (err) {
      if (thisChange !== authChange) return;
      show('board');
      showLoadError(err);
    }
  });
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
