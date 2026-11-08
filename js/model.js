// The shape of Horizon's data.
//
// Firestore layout (everything a person owns sits under their own user ID):
//
//   users/{uid}                  profile: createdAt, categories, visits
//   users/{uid}/cards/{cardId}   one document per card, in every status
//   users/{uid}/projects/{id}    one document per project
//
//   users/{uid}/inbox/{draftId}  drafts waiting in the Inbox (3b: from
//                                screenshots; later, perhaps, cards a
//                                colleague sends you)
//
// Shared projects, if they come, would live in a top-level projects/{id}
// collection with a members list. Ids never collide, so a card's projectId
// can point at either kind, and sharing one of yours means moving its
// document there under the same id. Cards always stay under their owner.
//
// A card document:
//   title          string
//   notes          string, optional
//   dueDate        "YYYY-MM-DD" string, or null for Someday
//   deadlineType   "soft" (default) or "hard"
//   projectId      string or null: the project the card belongs to
//   category       a category id from the profile, e.g. "programs"
//   status         "open", "in_progress", "done", or "let_go"
//   repeat         "none", "weekly", or "monthly"
//   seriesId       string or null: on repeating cards, the id of the card
//                  the series started with, shared by every card in it
//   seriesDate     "YYYY-MM-DD" or null: the date the rhythm planned for
//                  this card. Dragging and triage change dueDate, not this.
//   seriesDay      1 to 31, or null: monthly only, the day of the month the
//                  series aims for (see repeat.js)
//   source         "manual", "quick_add", or "screenshot"
//   order          number, or null: the card's place within its zone, set
//                  when you drag it (see order.js). null means date order.
//   createdAt, updatedAt, completedAt, letGoAt   Firestore timestamps
//
// A project document:
//   name           string, unique among your projects (ignoring capitals)
//   color          "#RRGGBB", one of PROJECT_COLORS in projects.js
//   endDate        "YYYY-MM-DD" string, or null. It's only shown; it never
//                  moves or hides anything.
//   status         "active" or "archived"
//   archivedAt     Firestore timestamp, or null
//   notes          string, up to 10,000 characters; "" or missing for none
//   links          list of { id, title, url }, in the order shown; title
//                  is "" for none, url an http(s) address (see links.js)
//   createdAt, updatedAt   Firestore timestamps
//
// A draft document (the Inbox). Never holds the screenshot itself.
//   title, summary  strings
//   dueDate         "YYYY-MM-DD" or null
//   aiDueDate       the date Haiku read, or null. The panel's note about
//                   the date shows only while dueDate still equals it.
//   dueDateConfidence  "explicit", "inferred", or "none"
//   dueDateQuote    the words the date came from, or ""
//   category        a category id, or null
//   deadlineType    "soft" or "hard"
//   peopleMentioned list of names
//   source          "screenshot"
//   createdAt, updatedAt   Firestore timestamps
//
// The profile document also keeps the visit record that morning triage and
// the Since yesterday line use (see visits.js):
//   lastVisitDay, lastVisitAt   the most recent day you opened the board,
//                               and when you first opened it that day
//   sinceDay, sinceAt           the visit day before that one
// and your settings:
//   settings.foldLongZones      true to fold long zones (see board.js)
//   settings.yearStart          1 to 12: the month the Done record's Year
//                               starts in (see record.js)

import { isISODate, toISO } from './dates.js';
import { normalizeLinks } from './links.js';

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
    seriesId: null,
    seriesDate: null,
    seriesDay: null,
  };
}

// A draft from the backend's answer to a screenshot (see Code.gs,
// normalizeDraft_). The backend has already checked every field; these
// checks are for a draft typed by hand in the console.
export function newDraft(answer) {
  const dueDate = isISODate(answer.due_date) ? answer.due_date : null;
  return {
    title: typeof answer.title === 'string' && answer.title.trim() ? answer.title.trim() : 'Look at this screenshot',
    summary: typeof answer.summary === 'string' ? answer.summary : '',
    dueDate,
    aiDueDate: dueDate,
    dueDateConfidence: !dueDate ? 'none' : answer.due_date_confidence === 'explicit' ? 'explicit' : 'inferred',
    dueDateQuote: dueDate && typeof answer.due_date_quote === 'string' ? answer.due_date_quote : '',
    category: typeof answer.suggested_category === 'string' ? answer.suggested_category : null,
    deadlineType: answer.deadline_type === 'hard' ? 'hard' : 'soft',
    peopleMentioned: Array.isArray(answer.people_mentioned) ? answer.people_mentioned.filter((p) => typeof p === 'string' && p) : [],
    source: 'screenshot',
  };
}

// A draft document with defaults filled in, as normalizeCard does.
export function normalizeDraft(id, data) {
  const dueDate = readDueDate(data.dueDate);
  return {
    id,
    title: typeof data.title === 'string' ? data.title : '',
    summary: typeof data.summary === 'string' ? data.summary : '',
    dueDate,
    aiDueDate: readDueDate(data.aiDueDate),
    dueDateConfidence: ['explicit', 'inferred'].includes(data.dueDateConfidence) ? data.dueDateConfidence : 'none',
    dueDateQuote: typeof data.dueDateQuote === 'string' ? data.dueDateQuote : '',
    category: typeof data.category === 'string' && data.category ? data.category : null,
    deadlineType: data.deadlineType === 'hard' ? 'hard' : 'soft',
    peopleMentioned: Array.isArray(data.peopleMentioned) ? data.peopleMentioned.filter((p) => typeof p === 'string' && p) : [],
    source: data.source || 'screenshot',
    createdAt: millis(data.createdAt),
  };
}

// What a draft adds to a card's notes: the summary, then the people.
export function draftNotes(draft) {
  const people = draft.peopleMentioned.length ? `People: ${draft.peopleMentioned.join(', ')}.` : '';
  return [draft.summary.trim(), people].filter(Boolean).join('\n');
}

export const PROJECT_STATUS = {
  ACTIVE: 'active',
  ARCHIVED: 'archived',
};

// A project with defaults filled in, the same way normalizeCard does for
// cards. A color that isn't a plain "#RRGGBB" becomes gray. A project made
// before notes and links existed reads as having none.
export function normalizeProject(id, data) {
  return {
    id,
    name: typeof data.name === 'string' && data.name.trim() ? data.name.trim() : 'Untitled project',
    color: typeof data.color === 'string' && /^#[0-9a-f]{6}$/i.test(data.color) ? data.color : '#6B6F78',
    endDate: readDueDate(data.endDate),
    status: data.status === PROJECT_STATUS.ARCHIVED ? PROJECT_STATUS.ARCHIVED : PROJECT_STATUS.ACTIVE,
    archivedAt: millis(data.archivedAt),
    notes: typeof data.notes === 'string' ? data.notes : '',
    links: normalizeLinks(data.links),
    createdAt: millis(data.createdAt),
    updatedAt: millis(data.updatedAt),
  };
}

// Settings with their defaults filled in. Every setting is off until you
// turn it on, and the year starts in January.
export function normalizeSettings(data) {
  const settings = data && typeof data === 'object' ? data : {};
  const yearStart = Number.isInteger(settings.yearStart) && settings.yearStart >= 1 && settings.yearStart <= 12 ? settings.yearStart : 1;
  return { foldLongZones: settings.foldLongZones === true, yearStart };
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
    repeat: data.repeat === 'weekly' || data.repeat === 'monthly' ? data.repeat : 'none',
    source: data.source || 'manual',
    order: typeof data.order === 'number' && Number.isFinite(data.order) ? data.order : null,
    seriesId: typeof data.seriesId === 'string' && data.seriesId ? data.seriesId : null,
    seriesDate: isISODate(data.seriesDate) ? data.seriesDate : null,
    seriesDay: Number.isInteger(data.seriesDay) && data.seriesDay >= 1 && data.seriesDay <= 31 ? data.seriesDay : null,
    // The sample cards on your board (a repeating one's next card keeps it).
    sample: data.sample === true,
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
