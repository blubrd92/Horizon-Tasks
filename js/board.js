// Draws the Horizon: five zones, left to right, with each card placed by its
// due date. This file only turns data into HTML; it never talks to Firebase.

import {
  dayOfMonth,
  fromISO,
  daysBetween,
  formatMonthDay,
  formatRange,
  formatShort,
  formatWeekdayMonth,
  zoneBounds,
  zoneFor,
  addDays,
} from './dates.js';
import { STATUS } from './model.js';
import { compareCards } from './order.js';

const FALLBACK_COLOR = '#6B6F78';

// Folding long zones (a setting, off by default): these zones show their
// first FOLD_SHOW cards and a button for the rest, but only when at least
// two would be hidden. Overdue and Today never fold: they're what you act
// on now.
const FOLDABLE = ['week', 'twoWeeks', 'later'];
const FOLD_SHOW = 5;

// triage is true during morning triage: soft cards in Overdue then show
// "Still on your plate?" and their buttons. highlight is a day tapped in the
// strip: its cards are outlined and the rest dimmed. fold is null, or
// { open } (a Set of zone keys you've opened) when long zones fold. Returns
// how many cards are highlighted.
export function renderBoard(container, { cards, categories, today, triage = false, highlight = null, fold = null }) {
  const zones = buildZones(zoneBounds(today));
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  for (const zone of zones) zone.cards = cardsIn(zone.key, cards, today);
  const options = { triage, highlight, fold };
  container.innerHTML = zones.map((zone) => zoneHTML(zone, today, categoryById, options)).join('');
  const matches = highlight ? cards.filter((card) => card.dueDate === highlight).length : 0;
  // An empty day dims nothing: a board of faded cards would look broken.
  container.classList.toggle('is-highlighting', matches > 0);
  return matches;
}

// True if a card gets triage buttons in the morning: soft and overdue.
// Hard cards stay until you open them and decide.
export function offersTriage(card, today) {
  return card.deadlineType !== 'hard' && Boolean(card.dueDate) && card.dueDate < today;
}

// The Someday drawer's cards: every card without a date.
export function renderSomeday(container, { cards, categories, today }) {
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const someday = cardsIn('someday', cards, today);
  container.innerHTML = someday.length
    ? someday.map((card) => cardHTML(card, today, categoryById)).join('')
    : '<p class="someday-empty">Nothing here. Cards without a date land in Someday.</p>';
  return someday.length;
}

// The cards in one zone ("overdue", "today", "week", "twoWeeks", "later"),
// or in "someday", in the order they're shown.
export function cardsIn(place, cards, today) {
  const bounds = zoneBounds(today);
  return cards.filter((card) => placeOf(card, bounds) === place).sort(compareCards);
}

export function placeOf(card, bounds) {
  return card.dueDate ? zoneFor(card.dueDate, bounds) : 'someday';
}

// A zone's name and the dates it covers: { name: 'This Week', range: 'Oct 23 to 25' }.
export function describeZone(key, today) {
  const { name, range } = buildZones(zoneBounds(today)).find((z) => z.key === key);
  return { name, range };
}

function buildZones(bounds) {
  const tomorrow = addDays(bounds.today, 1);
  const nextMonday = addDays(bounds.weekEnd, 1);
  return [
    { key: 'overdue', name: 'Overdue', range: 'before today', cards: [] },
    { key: 'today', name: 'Today', range: '', cards: [] },
    {
      key: 'week',
      name: 'This Week',
      // On a Sunday nothing is left between tomorrow and the end of the week.
      range: bounds.weekEnd > bounds.today ? formatRange(tomorrow, bounds.weekEnd) : 'nothing left this week',
      cards: [],
    },
    { key: 'twoWeeks', name: 'Next Two Weeks', range: formatRange(nextMonday, bounds.twoWeeksEnd), cards: [] },
    { key: 'later', name: 'Later', range: `after ${formatMonthDay(bounds.twoWeeksEnd)}`, cards: [] },
  ];
}

function zoneHTML(zone, today, categoryById, options) {
  const count = zone.cards.length;
  const { shown, foldButton } = foldZone(zone, options);
  const countLabel = `${count} ${count === 1 ? 'card' : 'cards'}`;
  const heading =
    zone.key === 'today'
      ? `<div class="zone-head-text zone-head-today">
           <span class="today-numeral" aria-hidden="true">${dayOfMonth(today)}</span>
           <div class="zone-head-stack">
             <h2 class="zone-title">Today</h2>
             <span class="zone-range">${formatWeekdayMonth(today)}</span>
           </div>
         </div>`
      : `<div class="zone-head-text">
           <h2 class="zone-title">${zone.name}</h2>
           <span class="zone-range">${zone.range}</span>
         </div>`;

  // data-drop marks the zone as a place a dragged card can land (drag.js).
  return `
    <section class="zone zone-${zone.key}" aria-label="${zone.name}" data-drop="${zone.key}" data-drop-name="${zone.name}">
      <div class="zone-head">
        ${heading}
        <span class="zone-count" aria-label="${countLabel}">${count}</span>
      </div>
      <div class="zone-cards" data-drop-list>
        ${shown.map((card) => cardHTML(card, today, categoryById, options)).join('')}
      </div>
      ${foldButton}
    </section>`;
}

// Which of a zone's cards show, and the "+16 more" or "Show fewer" button.
// app.js handles the button by data-fold (the zone's key).
function foldZone(zone, { fold, highlight }) {
  const hidden = zone.cards.length - FOLD_SHOW;
  if (!fold || !FOLDABLE.includes(zone.key) || hidden < 2) return { shown: zone.cards, foldButton: '' };
  // A highlighted strip day with cards in the folded part opens the zone,
  // so the highlight has something to show.
  const highlighted = highlight && zone.cards.slice(FOLD_SHOW).some((card) => card.dueDate === highlight);
  if (fold.open.has(zone.key) || highlighted) {
    const button = highlighted
      ? ''
      : `<button type="button" class="zone-fold" data-fold="${zone.key}" aria-expanded="true" aria-label="Show fewer cards in ${zone.name}">Show fewer</button>`;
    return { shown: zone.cards, foldButton: button };
  }
  return {
    shown: zone.cards.slice(0, FOLD_SHOW),
    foldButton: `<button type="button" class="zone-fold" data-fold="${zone.key}" aria-expanded="false" aria-label="Show ${hidden} more cards in ${zone.name}"><span class="zone-fold-count">+${hidden}</span> more</button>`,
  };
}

export { FOLD_SHOW };

function cardHTML(card, today, categoryById, { triage = false, highlight = null } = {}) {
  const category = categoryById.get(card.category);
  const color = category ? category.color : FALLBACK_COLOR;
  const categoryName = category ? category.name : card.category || 'No category';
  const late = card.dueDate && card.dueDate < today ? daysBetween(card.dueDate, today) : 0;
  const lateText = late ? `<span class="card-late">${late} ${late === 1 ? 'day' : 'days'} late</span>` : '';

  const progress =
    card.status === STATUS.IN_PROGRESS
      ? `<span class="card-progress">
           <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><circle cx="5" cy="5" r="4" fill="none" stroke="currentColor" stroke-width="1.5"></circle><path d="M5 1 A4 4 0 0 1 5 9 Z" fill="currentColor"></path></svg>
           In progress
         </span>`
      : '';

  // Orange only when a hard deadline is due today or already past; further
  // out (or undated), a quiet gray outline.
  const hard =
    card.deadlineType === 'hard'
      ? `<span class="card-hard${card.dueDate && card.dueDate <= today ? ' is-due' : ''}">Hard deadline</span>`
      : '';

  // Someday cards have no date to show.
  const date = card.dueDate ? `<span class="card-date">${formatShort(card.dueDate)}</span>` : '';
  const meta =
    date || lateText || hard || progress ? `<div class="card-meta">${date}${lateText}${hard}${progress}</div>` : '';
  const triageSection = triage && offersTriage(card, today) ? triageHTML(card, today) : '';

  // The title is a real button; CSS stretches its click area over the whole
  // card. app.js finds the card by data-card-id; drag.js by data-drag-id.
  return `
    <article class="card${highlight && card.dueDate === highlight ? ' is-match' : ''}" style="--band: ${escapeHTML(color)}" data-drag-id="${escapeHTML(card.id)}">
      <span class="card-category">${escapeHTML(categoryName)}</span>
      <h3 class="card-title">
        <button type="button" class="card-open" data-card-id="${escapeHTML(card.id)}">${escapeHTML(card.title)}</button>
      </h3>
      ${meta}
      ${triageSection}
    </article>`;
}

// "Still on your plate?" and its buttons. app.js handles the clicks, by
// data-triage (what to do) and data-triage-card (which card).
function triageHTML(card, today) {
  // On a Sunday This Week has no days left.
  const weekLeft = fromISO(today).getDay() !== 0;
  const button = (action, label, extra = '') =>
    `<button type="button" class="triage-button${extra}" data-triage="${action}">${label}</button>`;
  return `
      <div class="card-triage" role="group" aria-label="Still on your plate? ${escapeHTML(card.title)}" data-triage-card="${escapeHTML(card.id)}">
        <span class="triage-prompt">Still on your plate?</span>
        <div class="triage-buttons">
          ${button('tomorrow', 'Tomorrow')}
          ${weekLeft ? button('week', 'This week') : ''}
          ${button('someday', 'Someday')}
          ${button('letgo', 'Let it go', ' triage-letgo')}
        </div>
      </div>`;
}

// Card text comes from Firestore, so it is escaped before going into HTML.
function escapeHTML(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
