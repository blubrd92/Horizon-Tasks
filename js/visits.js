// Visits: what makes an open the first of the day (morning triage) and what
// the Since yesterday line counts from. No Firebase, no page.
//
// A visit is the board on screen: it loads in a tab you're looking at, you
// come back to a tab that was already open, or the date changes while you're
// looking. app.js decides when that happens; this file decides what it means.
//
// The record lives on the profile document (see model.js):
//   lastVisitDay, lastVisitAt   the most recent visit day, and when it began
//   sinceDay, sinceAt           the visit day before that
// Times here are milliseconds; firebase.js turns them into timestamps.

// stored is the record as read (any field may be null). Returns:
//   firstOfDay   true if this is the first visit today
//   since        { day, at } that today's Since yesterday line counts
//                from, or null when there's no earlier visit on record
//   write        the fields to save, or null when nothing changes.
//                lastVisitAt is left out: firebase.js stamps it with the
//                server's clock.
export function planVisit(stored, today) {
  const { lastVisitDay, lastVisitAt, sinceDay, sinceAt } = stored;
  // Today already has its first visit. (A later stored day only happens if
  // the clock or time zone moved backwards; treat it the same way.)
  if (lastVisitDay && lastVisitDay >= today) {
    return { firstOfDay: false, since: sinceDay ? { day: sinceDay, at: sinceAt } : null, write: null };
  }
  const since = lastVisitDay ? { day: lastVisitDay, at: lastVisitAt } : null;
  return {
    firstOfDay: true,
    since,
    write: { lastVisitDay: today, sinceDay: since ? since.day : null, sinceAt: since ? since.at : null },
  };
}
