// Starts Horizon: checks the config, handles sign-in, and keeps the board in
// sync with Firestore.

import { config } from '../config.js';
import { formatShort, todayISO } from './dates.js';
import { renderBoard } from './board.js';
import { newCard } from './model.js';
import { setupQuickAdd } from './quickadd.js';
import { setupEditor } from './editor.js';

const views = {
  setup: document.getElementById('view-setup'),
  signin: document.getElementById('view-signin'),
  notallowed: document.getElementById('view-notallowed'),
  board: document.getElementById('view-board'),
};
const zonesEl = document.getElementById('zones');
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

function show(name) {
  for (const [key, el] of Object.entries(views)) el.hidden = key !== name;
  document.body.classList.remove('is-loading');
}

function draw() {
  if (!latest) return;
  drawnForDay = todayISO();
  renderBoard(zonesEl, { ...latest, today: drawnForDay });
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
    onSave: (cardId, changes) => fb.updateCard(uid, cardId, changes).catch(showSaveError),
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
      const button = zonesEl.querySelector(`[data-card-id="${CSS.escape(card.id)}"]`);
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

  zonesEl.addEventListener('click', (event) => {
    const button = event.target.closest('[data-card-id]');
    if (button) openCard(button.dataset.cardId);
  });

  fb.watchAuth(async (user) => {
    const thisChange = ++authChange;
    if (stopWatching) {
      stopWatching();
      stopWatching = null;
    }
    latest = null;
    uid = null;
    zonesEl.innerHTML = '';
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
