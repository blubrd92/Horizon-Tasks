// Draws the Horizon: five zones, left to right, with each card placed by its
// due date. This file only turns data into HTML; it never talks to Firebase.

import {
  dayOfMonth,
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

export function renderBoard(container, { cards, categories, today }) {
  const zones = buildZones(zoneBounds(today));
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  for (const zone of zones) zone.cards = cardsIn(zone.key, cards, today);
  container.innerHTML = zones.map((zone) => zoneHTML(zone, today, categoryById)).join('');
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

function zoneHTML(zone, today, categoryById) {
  const count = zone.cards.length;
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
        ${zone.cards.map((card) => cardHTML(card, today, categoryById)).join('')}
      </div>
    </section>`;
}

function cardHTML(card, today, categoryById) {
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

  // Someday cards have no date to show.
  const date = card.dueDate ? `<span class="card-date">${formatShort(card.dueDate)}</span>` : '';
  const meta = date || lateText || progress ? `<div class="card-meta">${date}${lateText}${progress}</div>` : '';

  // The title is a real button; CSS stretches its click area over the whole
  // card. app.js finds the card by data-card-id; drag.js by data-drag-id.
  return `
    <article class="card" style="--band: ${escapeHTML(color)}" data-drag-id="${escapeHTML(card.id)}">
      <span class="card-category">${escapeHTML(categoryName)}</span>
      <h3 class="card-title">
        <button type="button" class="card-open" data-card-id="${escapeHTML(card.id)}">${escapeHTML(card.title)}</button>
      </h3>
      ${meta}
    </article>`;
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
