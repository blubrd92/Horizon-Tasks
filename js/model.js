// The shape of Horizon's data.
//
// Firestore layout (everything a person owns sits under their own user ID):
//
//   users/{uid}                  profile: createdAt, categories, visits
//                                (categories: [{ id, name, color }], in
//                                your order, `retired: true` on a retired
//                                one; see categories.js)
//   users/{uid}/cards/{cardId}   one document per card, in every status
//   users/{uid}/projects/{id}    one document per project
//
//   users/{uid}/inbox/{draftId}  drafts waiting in the Inbox (3b: from
//                                screenshots; 3c: from pasted text and
//                                quick add; later, perhaps, cards a
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
//   source         "manual", "quick_add", "screenshot", or "pasted_text"
//   order          number, or null: the card's place within its zone, set
//                  when you drag it (see order.js). null means date order.
//   checklist      list of { id, text, done }, in the order shown: up to
//                  30 short items, each ticked or not (see checklist.js).
//                  [] or missing for none.
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
// A draft document (the Inbox). Never holds the screenshot or the pasted
// text itself.
//   title           string
//   notes           the notes the card will get, put together from Haiku's
//                   answer by draftNotesFrom (below)
//   dueDate         "YYYY-MM-DD" or null
//   aiDueDate       the date Haiku read, or null. The panel's note about
//                   the date shows only while dueDate still equals it.
//   dueDateConfidence  "explicit", "inferred", or "none"
//   dueDateQuote    the words the date came from, or ""
//   category        a category id, or null
//   deadlineType    "soft" or "hard"
//   source          "screenshot", "pasted_text", or "quick_add"
//   typed           quick add only: the words you typed, to check the date
//                   against while the draft waits (your own words; gone
//                   with the draft). "" otherwise.
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
//   settings.quickAddKeys       what each quick add key does: { enter, alt,
//                               ctrl, shift }, each one of QUICK_ADD_JOBS
//                               (see quickadd.js)

import { formatShort, formatTime, isISODate, toISO, todayISO } from './dates.js';
import { normalizeLinks } from './links.js';
import { normalizeChecklist } from './checklist.js';

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
    checklist: [],
  };
}

// Where a draft came from, and the title it gets if Haiku gave none.
export const DRAFT_SOURCES = {
  screenshot: 'Look at this screenshot',
  pasted_text: 'Look at this pasted text',
  quick_add: 'Look at this',
};

// A draft from the backend's answer to a screenshot, pasted text, or a
// quick add line (see Code.gs, normalizeDraft_). The backend has already
// checked every field; these checks are for safety. `today` is the board's
// today, for the notes' dates. `typed` is what you typed, for quick add.
export function newDraft(answer, today = todayISO(), { source = 'screenshot', typed = '' } = {}) {
  const dueDate = isISODate(answer.due_date) ? answer.due_date : null;
  const kind = Object.hasOwn(DRAFT_SOURCES, source) ? source : 'screenshot';
  const fallback = kind === 'quick_add' && typed.trim() ? typed.trim() : DRAFT_SOURCES[kind];
  return {
    title: typeof answer.title === 'string' && answer.title.trim() ? answer.title.trim() : fallback,
    notes: draftNotesFrom(answer, today),
    dueDate,
    aiDueDate: dueDate,
    dueDateConfidence: !dueDate ? 'none' : answer.due_date_confidence === 'explicit' ? 'explicit' : 'inferred',
    dueDateQuote: dueDate && typeof answer.due_date_quote === 'string' ? answer.due_date_quote : '',
    category: typeof answer.suggested_category === 'string' ? answer.suggested_category : null,
    deadlineType: answer.deadline_type === 'hard' ? 'hard' : 'soft',
    source: kind,
    typed: kind === 'quick_add' ? typed.slice(0, 500) : '',
  };
}

// The notes a screenshot's card gets, as plain text, one line each:
//
//   Bonnie needs them for the December newsletter.          the summary
//   Tue, Nov 10, 5:00 pm: exam link arrives from FastTest.  the timeline,
//   Fri, Nov 13, 11:59 pm: window closes.                   earliest first
//   Need to know: no notes, outside aids, or AI.
//   Contact: Jennifer Landgren, jennifer@example.org
//
// Haiku supplies the pieces; this writes them out, so every date reads the
// way the board writes dates (with the year only when it isn't this year's)
// and the timeline is in date order whatever order Haiku gave it. Any piece
// that's empty is left out.
export function draftNotesFrom(answer, today) {
  const clean = (value) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');
  // A line ends with a full stop unless it already ends a sentence (a
  // closing quote or bracket after the . ! or ? is fine).
  const sentence = (value) => {
    const text = clean(value);
    return text && !/[.!?]["\u201d)\]]?$/.test(text) ? `${text}.` : text;
  };
  const lines = [];
  const summary = sentence(answer.summary);
  if (summary) lines.push(summary);

  const moments = (Array.isArray(answer.timeline) ? answer.timeline : [])
    .filter((m) => m && isISODate(m.date) && clean(m.what))
    .map((m) => ({ date: m.date, time: /^([01]\d|2[0-3]):[0-5]\d$/.test(m.time) ? m.time : '', what: m.what }))
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  for (const m of moments) {
    const year = m.date.slice(0, 4) !== String(today).slice(0, 4) ? `, ${m.date.slice(0, 4)}` : '';
    const time = m.time ? `, ${formatTime(m.time)}` : '';
    lines.push(`${formatShort(m.date)}${year}${time}: ${sentence(m.what)}`);
  }

  const need = sentence(answer.need_to_know);
  if (need) lines.push(`Need to know: ${need}`);

  const contact = answer.contact && typeof answer.contact === 'object' ? answer.contact : {};
  const reach = [contact.name, contact.email, contact.phone].map(clean).filter(Boolean);
  if (reach.length) lines.push(`Contact: ${reach.join(', ')}`);
  return lines.join('\n');
}

// A draft document with defaults filled in, as normalizeCard does. A draft
// saved before its notes were put together this way (a summary and a list
// of people) still reads.
export function normalizeDraft(id, data) {
  let notes = typeof data.notes === 'string' ? data.notes : null;
  if (notes === null) {
    const people = Array.isArray(data.peopleMentioned) ? data.peopleMentioned.filter((p) => typeof p === 'string' && p) : [];
    notes = [typeof data.summary === 'string' ? data.summary.trim() : '', people.length ? `People: ${people.join(', ')}.` : '']
      .filter(Boolean)
      .join('\n');
  }
  return {
    id,
    title: typeof data.title === 'string' ? data.title : '',
    notes,
    dueDate: readDueDate(data.dueDate),
    aiDueDate: readDueDate(data.aiDueDate),
    dueDateConfidence: ['explicit', 'inferred'].includes(data.dueDateConfidence) ? data.dueDateConfidence : 'none',
    dueDateQuote: typeof data.dueDateQuote === 'string' ? data.dueDateQuote : '',
    category: typeof data.category === 'string' && data.category ? data.category : null,
    deadlineType: data.deadlineType === 'hard' ? 'hard' : 'soft',
    source: Object.hasOwn(DRAFT_SOURCES, data.source) ? data.source : 'screenshot',
    typed: typeof data.typed === 'string' ? data.typed : '',
    createdAt: millis(data.createdAt),
  };
}

// What a draft gives the card's notes.
export function draftNotes(draft) {
  return draft.notes;
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

// The jobs a quick add key can do, and what each key does until you
// change it in Settings.
export const QUICK_ADD_JOBS = ['claude', 'editor', 'someday', 'today'];
export const QUICK_ADD_KEYS = { enter: 'claude', alt: 'editor', ctrl: 'someday', shift: 'today' };

// Settings with their defaults filled in. Every setting is off until you
// turn it on, the year starts in January, and the quick add keys are the
// ones above.
export function normalizeSettings(data) {
  const settings = data && typeof data === 'object' ? data : {};
  const yearStart = Number.isInteger(settings.yearStart) && settings.yearStart >= 1 && settings.yearStart <= 12 ? settings.yearStart : 1;
  const saved = settings.quickAddKeys && typeof settings.quickAddKeys === 'object' ? settings.quickAddKeys : {};
  const quickAddKeys = {};
  for (const [key, job] of Object.entries(QUICK_ADD_KEYS)) {
    quickAddKeys[key] = QUICK_ADD_JOBS.includes(saved[key]) ? saved[key] : job;
  }
  return { foldLongZones: settings.foldLongZones === true, yearStart, quickAddKeys };
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
    checklist: normalizeChecklist(data.checklist),
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
