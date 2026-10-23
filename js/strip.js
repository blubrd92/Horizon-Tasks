// The 14-day strip in the header: one small tile per day starting today,
// with the weekday, the date, and a dot per card due. Today is solid blue
// and weekends are lighter. This file only turns data into HTML.

import { addDays, dayOfMonth, formatLong, isWeekend, weekdayLetters } from './dates.js';

const DAYS = 14;
// A fifth dot no longer fits a 40px tile. The hidden label says the real
// number.
const MAX_DOTS = 4;

export function renderStrip(container, { cards, today }) {
  const due = new Map();
  for (const card of cards) {
    if (card.dueDate) due.set(card.dueDate, (due.get(card.dueDate) || 0) + 1);
  }

  const tiles = [];
  for (let i = 0; i < DAYS; i++) {
    const day = addDays(today, i);
    const n = due.get(day) || 0;
    const kind = i === 0 ? ' is-today' : isWeekend(day) ? ' is-weekend' : '';
    const dots = '<span class="strip-dot"></span>'.repeat(Math.min(n, MAX_DOTS));
    tiles.push(`
      <li class="strip-day${kind}">
        <span class="strip-dow" aria-hidden="true">${weekdayLetters(day)}</span>
        <span class="strip-num" aria-hidden="true">${dayOfMonth(day)}</span>
        <span class="strip-dots" aria-hidden="true">${dots}</span>
        <span class="visually-hidden">${i === 0 ? 'Today, ' : ''}${formatLong(day)}: ${n} ${n === 1 ? 'card' : 'cards'} due</span>
      </li>`);
  }
  container.innerHTML = tiles.join('');
}
