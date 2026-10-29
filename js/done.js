// The Done record view, "What you did": the range buttons, the tiles, the
// finished cards in weeks, the let-go box, and the small box for one card.
// This file only draws and reports clicks; app.js loads the cards, copies
// the text, and saves.

import { formatShort } from './dates.js';
import { escapeHTML } from './board.js';
import { STATUS } from './model.js';
import { REPEAT_NAMES, repeats } from './repeat.js';
import {
  categoryOf,
  emptyLine,
  finishedDay,
  groupByWeek,
  inSeries,
  letGoLine,
  newestFirst,
  rangeLine,
  tally,
} from './record.js';

const CHECK_ICON =
  '<svg class="record-icon" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#E3E9FA"></circle><path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="#2F5BD3" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
const LETGO_ICON =
  '<svg class="record-icon" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.2" fill="none" stroke="#9A9DA4" stroke-width="1.6"></circle><path d="M8 12h8" fill="none" stroke="#6B6F78" stroke-width="2" stroke-linecap="round"></path></svg>';
const REPEAT_ICON =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 2l4 4-4 4"></path><path d="M3 11V9a3 3 0 0 1 3-3h15"></path><path d="M7 22l-4-4 4-4"></path><path d="M21 13v2a3 3 0 0 1-3 3H3"></path></svg>';

// onRange(kind) for Week, Month, Year; onStep(-1 or 1) for the arrows;
// onCopy() for Copy as text; onPutBack(card) from a card's box.
export function setupDone({ onRange, onStep, onCopy, onPutBack }) {
  const heading = document.getElementById('done-heading');
  const rangeEl = document.getElementById('done-range');
  const statusEl = document.getElementById('done-status');
  const body = document.getElementById('done-body');
  const prev = document.getElementById('done-prev');
  const next = document.getElementById('done-next');
  const copy = document.getElementById('done-copy');
  const rangeButtons = document.querySelectorAll('[data-range]');

  const box = document.getElementById('record-card');
  const boxTitle = document.getElementById('record-title');
  const boxCategory = document.getElementById('record-category');
  const boxWhen = document.getElementById('record-when');
  const boxNotes = document.getElementById('record-notes');
  const boxSeries = document.getElementById('record-series');

  // The cards on screen, by id, for the box.
  let shown = new Map();
  let categoryById = new Map();
  let today = '';
  // The let-go list is folded until you press Show.
  let letGoOpen = false;
  // The card in the box, and whether it was put back (focus then has no
  // row to return to).
  let boxCard = null;

  for (const button of rangeButtons) button.addEventListener('click', () => onRange(button.dataset.range));
  prev.addEventListener('click', () => onStep(-1));
  next.addEventListener('click', () => onStep(1));
  copy.addEventListener('click', () => onCopy());

  body.addEventListener('click', (event) => {
    const toggle = event.target.closest('[data-letgo-toggle]');
    if (toggle) {
      letGoOpen = !letGoOpen;
      redraw();
      return;
    }
    const row = event.target.closest('[data-record-id]');
    if (row && shown.has(row.dataset.recordId)) openBox(shown.get(row.dataset.recordId));
  });

  document.getElementById('record-x').addEventListener('click', () => box.close());
  document.getElementById('record-close').addEventListener('click', () => box.close());
  document.getElementById('record-putback').addEventListener('click', () => {
    const card = boxCard;
    box.close();
    if (card) onPutBack(card);
  });
  // A click on the dimmed page around the box.
  box.addEventListener('click', (event) => {
    if (event.target === box) box.close();
  });
  // Back to the card's row, which may have been redrawn while the box was
  // open; if it's gone (put back), to the heading.
  box.addEventListener('close', () => {
    const id = boxCard && boxCard.id;
    boxCard = null;
    const row = id && body.querySelector(`[data-record-id="${CSS.escape(id)}"]`);
    (row || heading).focus();
  });

  let last = null;

  // state: { range, today, categories, done, letGo, error }. done and
  // letGo are undefined while loading.
  function render(state) {
    last = state;
    redraw();
  }

  function redraw() {
    if (!last) return;
    const { range, categories, done, letGo, error } = last;
    today = last.today;
    categoryById = new Map(categories.map((c) => [c.id, c]));
    const loading = done === undefined || letGo === undefined;

    rangeEl.textContent = `${rangeLine(range, today)} Every card you finished, kept.`;
    for (const button of rangeButtons) button.setAttribute('aria-pressed', String(button.dataset.range === range.kind));
    prev.setAttribute('aria-label', `Previous ${range.kind}`);
    next.setAttribute('aria-label', `Next ${range.kind}`);
    // There's no future to show.
    next.disabled = range.offset >= 0;
    copy.disabled = Boolean(error) || loading || done.length === 0;

    // Keep keyboard focus through a redraw (live updates, Show and Hide).
    const active = body.contains(document.activeElement) ? document.activeElement : null;
    const focusId = active && active.dataset.recordId;
    const focusToggle = active && active.hasAttribute('data-letgo-toggle');

    shown = new Map();
    let html;
    if (error) {
      html = `<p class="done-message">${escapeHTML(error)}</p>`;
    } else if (loading) {
      html = '<p class="done-quiet">Loading what you did…</p>';
    } else {
      for (const card of [...done, ...letGo]) shown.set(card.id, card);
      html = done.length ? tilesHTML(done, categories) + weeksHTML(done, range) : `<p class="done-quiet">${emptyLine(range, today)}</p>`;
      if (letGo.length) html += letGoHTML(letGo, range);
    }
    body.innerHTML = html;

    if (focusId) {
      const row = body.querySelector(`[data-record-id="${CSS.escape(focusId)}"]`);
      (row || heading).focus();
    } else if (focusToggle) {
      const toggle = body.querySelector('[data-letgo-toggle]');
      (toggle || heading).focus();
    }
  }

  function tilesHTML(done, categories) {
    const total = done.length;
    const tiles = tally(done, categories).map(
      (t) => `
        <div class="tile">
          <span class="tile-count">${t.count}</span>
          <span class="tile-name">${swatch(t.color)}${escapeHTML(t.name)}</span>
        </div>`,
    );
    return `
      <section class="tiles" aria-label="Finished by category">
        <div class="tile tile-total">
          <span class="tile-count">${total}</span>
          <span class="tile-name">${total === 1 ? 'card' : 'cards'} finished</span>
        </div>
        ${tiles.join('')}
      </section>`;
  }

  function weeksHTML(done, range) {
    return groupByWeek(done, range, today)
      .map(
        (week) => `
        <section class="record-week" aria-label="${escapeHTML(week.label)}">
          <div class="record-week-head">
            <h2 class="record-week-title">${escapeHTML(week.label)}</h2>
            <span class="record-week-count">${week.cards.length} finished</span>
          </div>
          <ul class="record-list">${week.cards.map((card) => rowHTML(card, CHECK_ICON)).join('')}</ul>
        </section>`,
      )
      .join('');
  }

  function letGoHTML(letGo, range) {
    const list = letGoOpen
      ? `<ul id="letgo-list" class="record-list letgo-list">${newestFirst(letGo, 'letGoAt')
          .map((card) => rowHTML(card, LETGO_ICON))
          .join('')}</ul>`
      : '';
    return `
      <section class="letgo" aria-label="Let go">
        <div class="letgo-head">
          <span class="letgo-text">${letGoLine(letGo.length, range, today)}</span>
          <button type="button" class="button" data-letgo-toggle aria-expanded="${letGoOpen}"${letGoOpen ? ' aria-controls="letgo-list"' : ''}>${letGoOpen ? 'Hide' : 'Show'}</button>
        </div>
        ${list}
      </section>`;
  }

  function rowHTML(card, icon) {
    const category = categoryOf(card, categoryById);
    const repeat = inSeries(card) ? `<span class="record-repeat">${REPEAT_ICON}<span class="visually-hidden">Repeats</span></span>` : '';
    return `
      <li>
        <button type="button" class="record-row" data-record-id="${escapeHTML(card.id)}">
          ${icon}
          <span class="record-title">${escapeHTML(card.title)}${repeat}</span>
          <span class="record-category">${swatch(category.color)}${escapeHTML(category.name)}</span>
          <span class="record-date">${formatShort(finishedDay(card))}</span>
        </button>
      </li>`;
  }

  function openBox(card) {
    boxCard = card;
    const category = categoryOf(card, categoryById);
    boxTitle.textContent = card.title;
    boxCategory.innerHTML = `${swatch(category.color)}${escapeHTML(category.name)}`;
    const how = card.status === STATUS.LET_GO ? 'Let go' : 'Finished';
    const due = card.dueDate ? `It was due ${withYear(card.dueDate)}.` : 'It had no date.';
    boxWhen.textContent = `${how} ${withYear(finishedDay(card))}. ${due}`;
    boxNotes.textContent = card.notes;
    boxNotes.hidden = !card.notes.trim();
    boxSeries.textContent = repeats(card)
      ? `Part of a ${REPEAT_NAMES[card.repeat].toLowerCase()} series. It comes back on its own, as a one-off; the series already has its next card.`
      : '';
    boxSeries.hidden = !repeats(card);
    box.showModal();
  }

  // "Wed, Oct 21", plus the year when it isn't this one.
  function withYear(iso) {
    return iso.slice(0, 4) === today.slice(0, 4) ? formatShort(iso) : `${formatShort(iso)}, ${iso.slice(0, 4)}`;
  }

  return {
    render,
    // A line under the heading: what Copy as text or Put back did.
    showStatus(text) {
      statusEl.textContent = text;
    },
    // Arriving on the view: the heading takes focus, so a screen reader
    // starts at the top.
    focusHeading() {
      heading.focus();
    },
    reset() {
      last = null;
      letGoOpen = false;
      statusEl.textContent = '';
      body.innerHTML = '';
      if (box.open) box.close();
    },
  };
}

function swatch(color) {
  return `<span class="swatch" style="background: ${escapeHTML(color)}"></span>`;
}
