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
  where,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

import { config } from '../config.js';
import { ACTIVE_STATUSES, normalizeCard } from './model.js';

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
// categories from config.js. Returns the user's categories.
export async function loadProfile(uid) {
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  if (snap.exists() && Array.isArray(snap.data().categories)) {
    return snap.data().categories;
  }
  const categories = config.starterCategories;
  await setDoc(ref, { createdAt: serverTimestamp(), categories }, { merge: true });
  return categories;
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
    (snapshot) => onChange(snapshot.docs.map((d) => normalizeCard(d.id, d.data()))),
    onError,
  );
}
