// Date helpers.
//
// Due dates are stored as plain "YYYY-MM-DD" strings, read in your own time
// zone. A plain string can't drift a day when the browser converts time zones,
// and two of them compare correctly as text ("2026-10-20" < "2026-10-22").
//
// Weeks run Monday to Sunday.

const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(value) {
  return typeof value === 'string' && ISO_PATTERN.test(value);
}

export function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function fromISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// The testing parameter: ?today=2026-10-22 in the address makes the whole
// app treat that date as today. It only changes what the app shows and
// works out; it never rewrites a stored date by itself.
const pretend = readPretend();

function readPretend() {
  const value = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('today');
  if (value === null) return { date: null, ignored: null };
  // A real calendar date only: 2026-02-30 doesn't survive the round trip.
  if (isISODate(value) && toISO(fromISO(value)) === value) return { date: value, ignored: null };
  return { date: null, ignored: value };
}

// The test date, or null in normal use.
export function pretendToday() {
  return pretend.date;
}

// What was typed after ?today= if it wasn't a real date, or null.
export function ignoredToday() {
  return pretend.ignored;
}

// The one place the app asks what day it is.
export function todayISO() {
  return pretend.date || toISO(new Date());
}

export function addDays(iso, n) {
  const date = fromISO(iso);
  date.setDate(date.getDate() + n);
  return toISO(date);
}

// Whole days from a to b (positive when b is later).
export function daysBetween(a, b) {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

// A date as a count of days since Jan 1, 1970. Cards sort on this scale
// within a zone (see order.js).
export function dayNumber(iso) {
  return daysBetween('1970-01-01', iso);
}

// The last day of each zone, given today.
//   This Week:      tomorrow through this Sunday
//   Next Two Weeks: the following Monday through the Sunday two weeks later
//   Later:          everything after that
export function zoneBounds(today) {
  const dow = fromISO(today).getDay();
  const weekEnd = addDays(today, (7 - dow) % 7);
  const twoWeeksEnd = addDays(weekEnd, 14);
  return { today, weekEnd, twoWeeksEnd };
}

// The first day of a zone that spans several days: where the date picker
// starts when a card is dropped there.
export function zoneStart(zone, bounds) {
  if (zone === 'week') return addDays(bounds.today, 1);
  if (zone === 'twoWeeks') return addDays(bounds.weekEnd, 1);
  if (zone === 'later') return addDays(bounds.twoWeeksEnd, 1);
  return bounds.today;
}

export function zoneFor(due, bounds) {
  if (due < bounds.today) return 'overdue';
  if (due === bounds.today) return 'today';
  if (due <= bounds.weekEnd) return 'week';
  if (due <= bounds.twoWeeksEnd) return 'twoWeeks';
  return 'later';
}

// "Thu, Oct 22"
export function formatShort(iso) {
  const date = fromISO(iso);
  return `${DOW_SHORT[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

// "Thursday, Oct 22"
export function formatLong(iso) {
  const date = fromISO(iso);
  return `${DOW_LONG[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

// "Thursday"
export function weekdayName(iso) {
  return DOW_LONG[fromISO(iso).getDay()];
}

// "Th": the strip's tiles.
export function weekdayLetters(iso) {
  return DOW_SHORT[fromISO(iso).getDay()].slice(0, 2);
}

export function isWeekend(iso) {
  const dow = fromISO(iso).getDay();
  return dow === 0 || dow === 6;
}

// Local midnight at the start of a day, in milliseconds.
export function startOfDay(iso) {
  return fromISO(iso).getTime();
}

// "Nov 8"
export function formatMonthDay(iso) {
  const date = fromISO(iso);
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

// "Thursday, Oct"
export function formatWeekdayMonth(iso) {
  const date = fromISO(iso);
  return `${DOW_LONG[date.getDay()]}, ${MONTHS[date.getMonth()]}`;
}

export function dayOfMonth(iso) {
  return fromISO(iso).getDate();
}

// "Oct 23 to 25", or "Oct 26 to Nov 8" when the range crosses a month.
export function formatRange(start, end) {
  if (start === end) return formatMonthDay(start);
  const a = fromISO(start);
  const b = fromISO(end);
  const endText = a.getMonth() === b.getMonth() ? String(b.getDate()) : formatMonthDay(end);
  return `${formatMonthDay(start)} to ${endText}`;
}
