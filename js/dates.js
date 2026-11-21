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

// The Monday of the week a date falls in.
export function weekStartOf(iso) {
  return addDays(iso, -((fromISO(iso).getDay() + 6) % 7));
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

// "5:00 pm" from "17:00"; "12:00 am" from "00:00". For the times in a
// screenshot draft's notes; the board itself has no times.
export function formatTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
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

// Dates that don't add up, in the few words a date came from (Haiku's
// quote of them, or a quick add line), checked against the date chosen.
// Three kinds, returned as { kind, ... }, or null when it all agrees or
// the words name no day:
//   self:    the words disagree with themselves: "thurs dec 4", when
//            Dec 4 is a Friday ({ said: 'Thursday', date, is: 'Friday' }),
//            whichever of the two was chosen;
//   date:    the words name a calendar date that isn't the one chosen
//            ({ said: '2026-12-04' });
//   weekday: the words name a weekday that isn't the chosen date's own
//            ({ said: 'Thursday', is: 'Friday' }).
// Weekday names count full or short, in any case ("Thursday", "thurs",
// "Sat", "weds"); calendar dates as "Dec 4", "December 4th", "4 Dec", or
// "12/4" (month first). If the words name two weekdays and one fits, no
// flag. Used for the Inbox's date note and quick add's line.
const WEEKDAY_WORDS = [
  ['Sunday', /\b(?:sundays?|sun)\b/i],
  ['Monday', /\b(?:mondays?|mon)\b/i],
  ['Tuesday', /\b(?:tuesdays?|tues?)\b/i],
  ['Wednesday', /\b(?:wednesdays?|weds?)\b/i],
  ['Thursday', /\b(?:thursdays?|thu(?:rs?)?)\b/i],
  ['Friday', /\b(?:fridays?|fri)\b/i],
  ['Saturday', /\b(?:saturdays?|sat)\b/i],
];
const MONTH_WORDS = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const MONTH_DAY = new RegExp(`\\b${MONTH_WORDS}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i');
const DAY_MONTH = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_WORDS}\\b`, 'i');
const NUMERIC = /\b(\d{1,2})\/(\d{1,2})\b/;

// The calendar date some words name, in the year that puts it nearest the
// chosen date, or null.
function namedDate(words, near) {
  let month = null;
  let day = null;
  let m = words.match(MONTH_DAY);
  if (m) [month, day] = [monthIndex(m[1]), Number(m[2])];
  else if ((m = words.match(DAY_MONTH))) [month, day] = [monthIndex(m[2]), Number(m[1])];
  else if ((m = words.match(NUMERIC))) [month, day] = [Number(m[1]) - 1, Number(m[2])];
  if (month === null || month < 0 || month > 11 || day < 1 || day > 31) return null;
  const year = fromISO(near).getFullYear();
  const options = [year - 1, year, year + 1]
    .map((y) => new Date(y, month, day))
    .filter((d) => d.getMonth() === month)
    .map(toISO);
  if (!options.length) return null;
  return options.reduce((best, iso) => (Math.abs(daysBetween(iso, near)) < Math.abs(daysBetween(best, near)) ? iso : best));
}

function monthIndex(word) {
  return MONTHS.findIndex((name) => word.toLowerCase().startsWith(name.toLowerCase()));
}

export function dateClash(words, iso) {
  if (typeof words !== 'string' || !words.trim() || !isISODate(iso)) return null;
  const named = WEEKDAY_WORDS.filter(([, pattern]) => pattern.test(words)).map(([name]) => name);
  const date = namedDate(words, iso);
  if (date && named.length && !named.includes(weekdayName(date))) {
    return { kind: 'self', said: named[0], date, is: weekdayName(date) };
  }
  if (date && date !== iso) return { kind: 'date', said: date };
  const is = weekdayName(iso);
  if (named.length && !named.includes(is)) return { kind: 'weekday', said: named[0], is };
  return null;
}

// The clash in words, after who said it ("The text says", "You typed"):
//   "The text says Thursday, Dec 4, but Dec 4 is a Friday."
//   "You typed Dec 4, not Dec 3."
//   "You typed Thursday, but Dec 4 is a Friday."
export function describeClash(clash, who, iso) {
  if (clash.kind === 'self') return `${who} ${clash.said}, ${formatMonthDay(clash.date)}, but ${formatMonthDay(clash.date)} is a ${clash.is}.`;
  if (clash.kind === 'date') return `${who} ${formatMonthDay(clash.said)}, not ${formatMonthDay(iso)}.`;
  return `${who} ${clash.said}, but ${formatMonthDay(iso)} is a ${clash.is}.`;
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
