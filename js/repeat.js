// Repeating cards: when the next one is due, and the rhythm in words. No
// Firebase, no page.
//
// A series follows a schedule, not the day you finished. Each card
// remembers the date the rhythm planned for it (seriesDate), which dragging
// and triage leave alone. The next card is due on the first planned date
// after both that date and today: finishing early doesn't bring the next
// one sooner, and finishing late doesn't create a copy for every period
// you missed.
//
// Monthly series remember the day of the month they aim for (seriesDay),
// so one on the 31st lands on the last day of shorter months and comes back
// to the 31st after: Jan 31, Feb 28, Mar 31.
//
// A repeating card with no date has no schedule to follow, so its next one
// counts from the day you finish it.

import { addDays, dayOfMonth, fromISO, toISO, weekdayName } from './dates.js';

export const REPEAT_NAMES = { weekly: 'Weekly', monthly: 'Monthly' };

export function repeats(card) {
  return card.repeat === 'weekly' || card.repeat === 'monthly';
}

// The date the rhythm planned for this card. A card typed by hand in the
// console may only have its due date.
export function anchorOf(card) {
  return card.seriesDate || card.dueDate || null;
}

// Fields to save alongside a move that only shifts this card (triage, a
// drag): a repeating card whose series date was never written down (one
// typed by hand in the console) gets it now, from the date it's leaving,
// so the move doesn't quietly become the series' new schedule.
export function keepSeries(card) {
  return repeats(card) && !card.seriesDate && card.dueDate ? { seriesDate: card.dueDate } : {};
}

// The day of the month a monthly series aims for.
function aimDay(card, anchor) {
  return card.seriesDay || dayOfMonth(anchor);
}

// One step along the rhythm.
function step(iso, repeat, day) {
  if (repeat === 'weekly') return addDays(iso, 7);
  const date = fromISO(iso);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  // Day 0 of the month after next is the last day of next month.
  const last = new Date(year, month + 1, 0).getDate();
  return toISO(new Date(year, month, Math.min(day, last)));
}

// The next card's due date, given the card being finished and today.
export function nextDate(card, today) {
  const anchor = anchorOf(card);
  if (!anchor) return step(today, card.repeat, dayOfMonth(today));
  const day = aimDay(card, anchor);
  let next = step(anchor, card.repeat, day);
  // Ten thousand steps is two centuries of weeks: only a nonsense date
  // could need more.
  for (let i = 0; next <= today && i < 10000; i++) next = step(next, card.repeat, day);
  return next;
}

// The fields of the card that follows `card` once it's finished. The
// caller adds createdAt and updatedAt.
export function nextCard(card, today) {
  const dueDate = nextDate(card, today);
  const anchor = anchorOf(card);
  const fields = {
    title: card.title,
    notes: card.notes,
    dueDate,
    deadlineType: card.deadlineType,
    projectId: card.projectId,
    category: card.category,
    status: 'open',
    repeat: card.repeat,
    source: card.source,
    order: null,
    seriesId: card.seriesId || card.id,
    seriesDate: dueDate,
    // An undated card's series starts from today's day of the month.
    seriesDay: card.repeat === 'monthly' ? (anchor ? aimDay(card, anchor) : dayOfMonth(today)) : null,
  };
  // Sample cards stay findable by the script that removes them.
  if (card.sample) fields.sample = true;
  return fields;
}

// What a save from the editor does to the series fields. `card` is the card
// as it was, `changes` what the editor changed (null id for a new card),
// moveSeries whether "Move the series too" was checked.
export function seriesChanges(card, changes, moveSeries) {
  const after = { ...card, ...changes };
  if (!repeats(after)) {
    // Turning repeat off: the schedule goes, the link to the cards you
    // already finished stays.
    return repeats(card) ? { seriesDate: null, seriesDay: null } : {};
  }
  const out = {};
  if (card.id && !card.seriesId) out.seriesId = card.id;
  // A new series, or one moved on purpose, follows the new date. Otherwise
  // the series keeps its own date, written down now if it only existed as
  // the old due date.
  const fresh = !repeats(card) || (moveSeries && 'dueDate' in changes);
  const anchor = fresh ? after.dueDate : anchorOf(card);
  if (anchor !== card.seriesDate) out.seriesDate = anchor;
  const day = after.repeat === 'monthly' && anchor ? (fresh ? dayOfMonth(anchor) : aimDay(card, anchor)) : null;
  if (day !== card.seriesDay) out.seriesDay = day;
  return out;
}

// The rhythm in words, for the editor: "Every Thursday."
export function describeRhythm(repeat, anchor, day = null) {
  if (repeat !== 'weekly' && repeat !== 'monthly') return '';
  if (!anchor) {
    return `No date, so the next one is due a ${repeat === 'weekly' ? 'week' : 'month'} after you mark this one done.`;
  }
  if (repeat === 'weekly') return `Every ${weekdayName(anchor)}.`;
  const d = day || dayOfMonth(anchor);
  return d > 28 ? `The ${ordinal(d)} of every month, or the last day of shorter months.` : `The ${ordinal(d)} of every month.`;
}

// "From now on: every Friday." for the "Move the series too" checkbox.
export function describeMove(repeat, date) {
  if (repeat === 'weekly') return `From now on: every ${weekdayName(date)}.`;
  const d = dayOfMonth(date);
  return `From now on: the ${ordinal(d)} of every month${d > 28 ? ', or the last day of shorter months' : ''}.`;
}

function ordinal(n) {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? 'th' : { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th';
  return `${n}${suffix}`;
}
