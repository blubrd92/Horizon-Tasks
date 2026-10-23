// The shape of Horizon's data.
//
// Firestore layout (everything a person owns sits under their own user ID):
//
//   users/{uid}                  profile: createdAt, categories, visits
//   users/{uid}/cards/{cardId}   one document per card, in every status
//
// Later slices add, under the same users/{uid}:
//   projects/{projectId}         Phase 2
//   inbox/{draftId}              Phase 3 drafts (and, later, cards a
//                                colleague sends you)
//
// A card document:
//   title          string
//   notes          string, optional
//   dueDate        "YYYY-MM-DD" string, or null for Someday
//   deadlineType   "soft" (default) or "hard"
//   projectId      string or null
//   category       a category id from the profile, e.g. "programs"
//   status         "open", "in_progress", "done", or "let_go"
//   repeat         "none", "weekly", or "monthly"
//   source         "manual", "quick_add", or "screenshot"
//   order          number, or null: the card's place within its zone, set
//                  when you drag it (see order.js). null means date order.
//   createdAt, updatedAt, completedAt, letGoAt   Firestore timestamps
//
// The profile document also keeps the visit record that morning triage and
// the Since yesterday line use (see visits.js):
//   lastVisitDay, lastVisitAt   the most recent day you opened the board,
//                               and when you first opened it that day
//   sinceDay, sinceAt           the visit day before that one

import { isISODate, toISO } from './dates.js';

export const STATUS = {
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  DONE: 'done',
  LET_GO: 'let_go',
};

// Cards that belong on the board (and in the Someday drawer).
export const ACTIVE_STATUSES = [STATUS.OPEN, STATUS.IN_PROGRESS];

// A card as quick add creates it: just a title, and either no date (Someday)
// or today. firebase.js adds the createdAt and updatedAt times.
export function newCard({ title, dueDate = null }) {
  return {
    title,
    notes: '',
    dueDate,
    deadlineType: 'soft',
    projectId: null,
    category: null,
    status: STATUS.OPEN,
    repeat: 'none',
    source: 'quick_add',
    order: null,
  };
}

// Turns a Firestore card document into a predictable object, filling in
// defaults so a card typed by hand in the console with a few fields missing
// still renders.
export function normalizeCard(id, data) {
  return {
    id,
    title: typeof data.title === 'string' && data.title.trim() ? data.title : 'Untitled',
    notes: typeof data.notes === 'string' ? data.notes : '',
    dueDate: readDueDate(data.dueDate),
    deadlineType: data.deadlineType === 'hard' ? 'hard' : 'soft',
    projectId: data.projectId || null,
    category: data.category || null,
    status: data.status || STATUS.OPEN,
    repeat: data.repeat || 'none',
    source: data.source || 'manual',
    order: typeof data.order === 'number' && Number.isFinite(data.order) ? data.order : null,
    createdAt: millis(data.createdAt),
    updatedAt: millis(data.updatedAt),
    completedAt: millis(data.completedAt),
    letGoAt: millis(data.letGoAt),
  };
}

// Accepts the "YYYY-MM-DD" string Horizon writes, and also a Firestore
// timestamp in case one was entered by hand in the console.
function readDueDate(value) {
  if (isISODate(value)) return value;
  if (value && typeof value.toDate === 'function') return toISO(value.toDate());
  return null;
}

function millis(value) {
  return value && typeof value.toMillis === 'function' ? value.toMillis() : 0;
}
