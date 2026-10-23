// Starts Horizon: checks the config, handles sign-in, and keeps the board in
// sync with Firestore.

import { config } from '../config.js';
import { todayISO } from './dates.js';
import { renderBoard } from './board.js';

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

  fb.watchAuth(async (user) => {
    const thisChange = ++authChange;
    if (stopWatching) {
      stopWatching();
      stopWatching = null;
    }
    latest = null;
    zonesEl.innerHTML = '';

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

start();
