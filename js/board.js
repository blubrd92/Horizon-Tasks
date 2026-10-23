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

const FALLBACK_COLOR = '#6B6F78';

export function renderBoard(container, { cards, categories, today }) {
  const bounds = zoneBounds(today);
  const zones = buildZones(bounds);
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  // Undated cards belong to the Someday drawer (slice 1c), not the Horizon.
  for (const card of cards) {
    if (!card.dueDate) continue;
    zones.find((z) => z.key === zoneFor(card.dueDate, bounds)).cards.push(card);
  }
  for (const zone of zones) {
    zone.cards.sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : a.createdAt - b.createdAt));
  }

  container.innerHTML = zones.map((zone) => zoneHTML(zone, today, categoryById)).join('');
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

  return `
    <section class="zone zone-${zone.key}" aria-label="${zone.name}">
      <div class="zone-head">
        ${heading}
        <span class="zone-count" aria-label="${countLabel}">${count}</span>
      </div>
      <div class="zone-cards">
        ${zone.cards.map((card) => cardHTML(card, today, categoryById)).join('')}
      </div>
    </section>`;
}

function cardHTML(card, today, categoryById) {
  const category = categoryById.get(card.category);
  const color = category ? category.color : FALLBACK_COLOR;
  const categoryName = category ? category.name : card.category || 'No category';
  const late = card.dueDate < today ? daysBetween(card.dueDate, today) : 0;
  const lateText = late ? `<span class="card-late">${late} ${late === 1 ? 'day' : 'days'} late</span>` : '';

  const progress =
    card.status === STATUS.IN_PROGRESS
      ? `<span class="card-progress">
           <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><circle cx="5" cy="5" r="4" fill="none" stroke="currentColor" stroke-width="1.5"></circle><path d="M5 1 A4 4 0 0 1 5 9 Z" fill="currentColor"></path></svg>
           In progress
         </span>`
      : '';

  // The title is a real button; CSS stretches its click area over the whole
  // card. app.js finds the card by data-card-id.
  return `
    <article class="card" style="--band: ${escapeHTML(color)}">
      <span class="card-category">${escapeHTML(categoryName)}</span>
      <h3 class="card-title">
        <button type="button" class="card-open" data-card-id="${escapeHTML(card.id)}">${escapeHTML(card.title)}</button>
      </h3>
      <div class="card-meta">
        <span class="card-date">${formatShort(card.dueDate)}</span>
        ${lateText}
        ${progress}
      </div>
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
