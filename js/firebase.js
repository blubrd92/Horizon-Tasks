// Everything that talks to Firebase goes through this file, so the SDK
// version is pinned in one place (the import URLs below).

import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

import { config } from '../config.js';
import { ACTIVE_STATUSES, STATUS, normalizeCard, normalizeSettings } from './model.js';

const app = initializeApp(config.firebase);
const auth = getAuth(app);
const db = getFirestore(app);

export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export function signIn() {
  return signInWithPopup(auth, new GoogleAuthProvider());
}

export function signOut() {
  return firebaseSignOut(auth);
}

// True if this person's email is on the approved list (the "allowlist"
// collection; see firestore.rules). A refusal from Firestore counts as no.
export async function isApproved(user) {
  if (!user.email) return false;
  try {
    const snap = await getDoc(doc(db, 'allowlist', user.email));
    return snap.exists();
  } catch (err) {
    if (err.code === 'permission-denied') return false;
    throw err;
  }
}

// Reads the user's profile, creating it on first sign-in with the starter
// categories from config.js. Returns { categories, visit, settings }, where
// visit is the visit record (see visits.js) with times in milliseconds.
export async function loadProfile(uid) {
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  const data = snap.exists() ? snap.data() : {};
  const visit = readVisit(data);
  const settings = normalizeSettings(data.settings);
  if (Array.isArray(data.categories)) return { categories: data.categories, visit, settings };
  const categories = config.starterCategories;
  await setDoc(ref, { createdAt: serverTimestamp(), categories }, { merge: true });
  return { categories, visit, settings };
}

// Saves one setting, leaving the others alone.
export function saveSetting(uid, name, value) {
  return setDoc(doc(db, 'users', uid), { settings: { [name]: value } }, { merge: true });
}

// Just the visit record, fresh: for when the date changes while the board
// is open.
export async function loadVisit(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return readVisit(snap.exists() ? snap.data() : {});
}

function readVisit(data) {
  const day = (value) => (typeof value === 'string' ? value : null);
  const time = (value) => (value && typeof value.toMillis === 'function' ? value.toMillis() : null);
  return {
    lastVisitDay: day(data.lastVisitDay),
    lastVisitAt: time(data.lastVisitAt),
    sinceDay: day(data.sinceDay),
    sinceAt: time(data.sinceAt),
  };
}

// Records the first visit of a day: `fields` from visits.js, with
// lastVisitAt stamped by the server's clock, the same clock that stamps
// completedAt, so the two compare fairly.
export function saveVisit(uid, { lastVisitDay, sinceDay, sinceAt }) {
  return setDoc(
    doc(db, 'users', uid),
    {
      lastVisitDay,
      lastVisitAt: serverTimestamp(),
      sinceDay,
      sinceAt: sinceAt === null ? null : Timestamp.fromMillis(sinceAt),
    },
    { merge: true },
  );
}

// Calls onChange with every card marked done at or after `since` (in
// milliseconds), now and whenever that changes. Filtering on completedAt
// alone needs no extra index. A card marked done and then reopened keeps
// its completedAt, so the caller checks status. Returns a function that
// stops listening.
export function watchFinishedSince(uid, since, onChange, onError) {
  const q = query(collection(db, 'users', uid, 'cards'), where('completedAt', '>=', Timestamp.fromMillis(since)));
  return onSnapshot(
    q,
    (snapshot) => onChange(snapshot.docs.map((d) => normalizeCard(d.id, d.data({ serverTimestamps: 'estimate' })))),
    onError,
  );
}

// Calls onChange with the full list of open and in-progress cards now, and
// again every time one of them changes. Done and let-go cards are never
// downloaded for the board. Returns a function that stops listening.
export function watchActiveCards(uid, onChange, onError) {
  const q = query(
    collection(db, 'users', uid, 'cards'),
    where('status', 'in', ACTIVE_STATUSES),
  );
  return onSnapshot(
    q,
    // "estimate" fills in a just-added card's createdAt right away, instead
    // of leaving it blank until Firestore confirms the save.
    (snapshot) => onChange(snapshot.docs.map((d) => normalizeCard(d.id, d.data({ serverTimestamps: 'estimate' })))),
    onError,
  );
}

// Saves a new card. Returns its id at once (the board shows the card before
// Firestore confirms), plus `saved`, which fails if Firestore refuses it.
export function addCard(uid, fields) {
  const ref = doc(collection(db, 'users', uid, 'cards'));
  const saved = setDoc(ref, { ...fields, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return { id: ref.id, saved };
}

// Writes only the fields in `changes`, so anything changed elsewhere in the
// meantime is left alone.
export function updateCard(uid, cardId, changes) {
  return updateDoc(doc(db, 'users', uid, 'cards', cardId), { ...changes, updatedAt: serverTimestamp() });
}

// Saves changes to several cards in one write: a drop can nudge a few
// neighbors along with the card you moved. Either all of them save or none.
// `updates` is a list of { id, changes }.
export function saveCards(uid, updates) {
  const batch = writeBatch(db);
  for (const { id, changes } of updates) {
    batch.update(doc(db, 'users', uid, 'cards', id), { ...changes, updatedAt: serverTimestamp() });
  }
  return batch.commit();
}

// Lets a card go: it leaves the board, and stays in Firestore for the Done
// record's "let go" section.
export function letGo(uid, cardId) {
  return updateCard(uid, cardId, { status: STATUS.LET_GO, letGoAt: serverTimestamp() });
}

// Marks a card done, along with any edits made at the same moment. The card
// stays in Firestore for the Done record; the board stops showing it.
export function markDone(uid, cardId, changes = {}) {
  return updateCard(uid, cardId, { ...changes, status: STATUS.DONE, completedAt: serverTimestamp() });
}
