// The words of the Since yesterday line beside quick add:
//   "Since yesterday: 2 cards moved into Today, and you finished 3."
// No Firebase, no page.

import { daysBetween, formatMonthDay, startOfDay, weekdayName } from './dates.js';
import { STATUS } from './model.js';

// since is { day, at } from visits.js. active is the board's cards; finished
// is the cards marked done since `since.at`, or null if they couldn't be
// loaded. Returns { lead, strong, rest } (strong is the part shown darker),
// or null when there's nothing to say.
export function sinceLine({ since, today, active, finished }) {
  if (!since) return null;
  const gap = daysBetween(since.day, today);
  // Only possible with a ?today= test date before your last real visit.
  if (gap < 1) return null;
  const label = gap === 1 ? 'yesterday' : gap < 7 ? weekdayName(since.day) : formatMonthDay(since.day);

  // Cards due today that existed before today began. Cards added today
  // were added, not moved; Today cards you've since finished still count.
  // (A card marked done and then reopened still has its completedAt, so
  // status decides.)
  const doneCards = finished ? finished.filter((card) => card.status === STATUS.DONE) : [];
  const dayStart = startOfDay(today);
  const ids = new Set();
  for (const card of [...active, ...doneCards]) {
    if (card.dueDate === today && card.createdAt < dayStart) ids.add(card.id);
  }
  const moved = ids.size;
  const done = doneCards.length;

  const lead = `Since ${label}:`;
  const movedText = moved ? `${moved} ${moved === 1 ? 'card' : 'cards'} moved into Today` : 'nothing new in Today';
  if (!done) return { lead, strong: movedText, rest: '.' };
  return { lead, strong: movedText, rest: `, and you finished ${done}.` };
}
