// The Done record ("What you did"): which days a range covers, the weeks
// and tallies inside it, its wording, and the text Copy as text produces.
// No Firebase, no page.
//
// Week is Monday to Sunday; Month and Year are the calendar's. A range is
// { kind, offset, start, end }: offset 0 is the one holding today, -1 the
// one before. start and end are "YYYY-MM-DD", both included.

import {
  addDays,
  formatMonthDay,
  formatRange,
  formatShort,
  fromISO,
  startOfDay,
  toISO,
  weekStartOf,
} from './dates.js';
import { STATUS } from './model.js';
import { repeats } from './repeat.js';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const FALLBACK_COLOR = '#6B6F78';

export const RANGE_KINDS = ['week', 'month', 'year'];

export function rangeFor(kind, offset, today) {
  if (kind === 'week') {
    const start = addDays(weekStartOf(today), offset * 7);
    return { kind, offset, start, end: addDays(start, 6) };
  }
  const now = fromISO(today);
  if (kind === 'month') {
    const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
    return { kind, offset, start: toISO(first), end: toISO(last) };
  }
  const year = now.getFullYear() + offset;
  return { kind, offset, start: `${year}-01-01`, end: `${year}-12-31` };
}

// The range as times for a query: from its first midnight up to, not
// including, the midnight after its last day. Your own time zone's
// midnights, so a card finished at 11:58 pm counts on that day.
export function rangeTimes(range) {
  return { from: startOfDay(range.start), to: startOfDay(addDays(range.end, 1)) };
}

// The day a card was finished, or let go, in your time zone.
export function dayOf(millis) {
  return toISO(new Date(millis));
}

export function finishedDay(card) {
  return dayOf(card.status === STATUS.LET_GO ? card.letGoAt : card.completedAt);
}

// Newest first.
export function newestFirst(cards, field) {
  return [...cards].sort((a, b) => b[field] - a[field] || a.title.localeCompare(b.title));
}

// The line under the heading: "October so far."
export function rangeLine(range, today) {
  const current = range.offset === 0;
  if (range.kind === 'week') {
    if (current) return 'This week so far.';
    return `${formatRange(range.start, range.end)}${yearSuffix(range.end, today, ', ')}.`;
  }
  if (range.kind === 'month') return `${monthName(range, today)}${current ? ' so far' : ''}.`;
  return `${range.start.slice(0, 4)}${current ? ' so far' : ''}.`;
}

// "this month", "that week", "in September", "in 2025".
function rangePhrase(range, today) {
  if (range.offset === 0) return `this ${range.kind}`;
  if (range.kind === 'week') return 'that week';
  if (range.kind === 'month') return `in ${monthName(range, today)}`;
  return `in ${range.start.slice(0, 4)}`;
}

// "September", or "September 2025" when it isn't this year.
function monthName(range, today) {
  return `${MONTH_NAMES[fromISO(range.start).getMonth()]}${yearSuffix(range.start, today, ' ')}`;
}

function yearSuffix(iso, today, glue) {
  return iso.slice(0, 4) === today.slice(0, 4) ? '' : `${glue}${iso.slice(0, 4)}`;
}

// What an empty range says instead of a big zero.
export function emptyLine(range, today) {
  if (range.offset === 0) return `Nothing finished this ${range.kind} yet.`;
  return `Nothing finished ${rangePhrase(range, today)}.`;
}

// The dashed box: "You let 1 card go this month. It's kept here too, quietly."
export function letGoLine(count, range, today) {
  const cards = `${count} ${count === 1 ? 'card' : 'cards'}`;
  const kept = count === 1 ? 'It’s' : 'They’re';
  return `You let ${cards} go ${rangePhrase(range, today)}. ${kept} kept here too, quietly.`;
}

// The finished cards in weeks, newest first, each newest first. A week
// with nothing in it isn't listed. A week that crosses the range's edge is
// labeled with the part inside it. Returns [{ label, cards }].
export function groupByWeek(cards, range, today) {
  const thisWeek = weekStartOf(today);
  const weeks = new Map();
  for (const card of newestFirst(cards, 'completedAt')) {
    const start = weekStartOf(dayOf(card.completedAt));
    if (!weeks.has(start)) weeks.set(start, []);
    weeks.get(start).push(card);
  }
  return [...weeks].map(([start, list]) => {
    const from = start < range.start ? range.start : start;
    const end = addDays(start, 6);
    const to = end > range.end ? range.end : end;
    return { label: start === thisWeek ? 'This week' : formatRange(from, to), cards: list };
  });
}

// A card's category name and color, the way the board shows it: an id not
// on your profile shows as itself, in gray.
export function categoryOf(card, categoryById) {
  const category = categoryById.get(card.category);
  if (category) return { name: category.name, color: category.color };
  return { name: card.category || 'No category', color: FALLBACK_COLOR };
}

// One count per category with any cards: your categories in their own
// order, then ids not on your profile, then "No category".
// Returns [{ name, color, count }].
export function tally(cards, categories) {
  const counts = new Map();
  for (const card of cards) {
    const key = card.category || '';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const known = new Set(categories.map((c) => c.id));
  const out = categories.filter((c) => counts.get(c.id)).map((c) => ({ name: c.name, color: c.color, count: counts.get(c.id) }));
  const unknown = [...counts.keys()].filter((id) => id && !known.has(id)).sort();
  for (const id of unknown) out.push({ name: id, color: FALLBACK_COLOR, count: counts.get(id) });
  if (counts.get('')) out.push({ name: 'No category', color: FALLBACK_COLOR, count: counts.get('') });
  return out;
}

// True if a card belongs to a repeating series: it repeats, or it was a
// later card in one (the last card of a series you ended). A card set to
// repeat and back before it ever repeated isn't.
export function inSeries(card) {
  return repeats(card) || Boolean(card.seriesId && card.seriesId !== card.id);
}

// What putting a card back on the board writes: open again, out of the
// record, in date order. A repeating card's next one already exists, so
// this one comes back on its own, still linked by seriesId.
export function putBackChanges(card) {
  const changes = { status: STATUS.OPEN, order: null };
  changes[card.status === STATUS.LET_GO ? 'letGoAt' : 'completedAt'] = null;
  if (repeats(card)) Object.assign(changes, { repeat: 'none', seriesDate: null, seriesDay: null });
  return changes;
}

// Copy as text: a heading, the counts, then one line per card, newest
// first. A repeating series with the same title is one line, at its latest
// date, with how many times.
export function copyText(cards, categories, range, today) {
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const last = range.offset === 0 && today >= range.start && today < range.end ? today : range.end;
  const total = cards.length;
  const counts = tally(cards, categories).map((t) => `${t.name} ${t.count}`).join(', ');
  const lines = [
    `What I did, ${spanText(range.start, last)}`,
    `${total} ${total === 1 ? 'card' : 'cards'} finished: ${counts}.`,
    '',
  ];

  const groups = [];
  const bySeries = new Map();
  for (const card of newestFirst(cards, 'completedAt')) {
    const key = card.seriesId ? `${card.seriesId}\u0000${card.title}` : null;
    if (key && bySeries.has(key)) {
      bySeries.get(key).push(card);
      continue;
    }
    const group = [card];
    if (key) bySeries.set(key, group);
    groups.push(group);
  }

  for (const group of groups) {
    const latest = group[0];
    const days = group.map((c) => dayOf(c.completedAt)).reverse();
    let times = '';
    if (group.length > 5) {
      times = `, ${group.length} times, ${formatMonthDay(days[0])} to ${formatMonthDay(days[days.length - 1])}`;
    } else if (group.length > 1) {
      times = `, ${group.length} times (${days.map(formatMonthDay).join(', ')})`;
    }
    const category = categoryOf(latest, categoryById).name;
    lines.push(`${formatShort(days[days.length - 1])} · ${latest.title}${times} · ${category}`);
  }
  return `${lines.join('\n')}\n`;
}

// "Oct 1 to 29, 2026", or "Dec 29, 2025 to Jan 4, 2026" across a new year.
function spanText(start, end) {
  if (start.slice(0, 4) === end.slice(0, 4)) return `${formatRange(start, end)}, ${start.slice(0, 4)}`;
  return `${formatMonthDay(start)}, ${start.slice(0, 4)} to ${formatMonthDay(end)}, ${end.slice(0, 4)}`;
}
