// A project's page, at #project/<id>: its name, its end date, its open
// cards grouped the way the board places them, and its finished ones
// folded at the bottom. This file only draws and reports clicks; app.js
// loads the cards and saves.

import { formatShort } from './dates.js';
import { cardsHTML, cardsIn, describeZone, escapeHTML } from './board.js';
import { PROJECT_STATUS, STATUS } from './model.js';
import { endSentence, finishedLine, openLine } from './projects.js';
import { categoryOf, finishedDay } from './record.js';

// The board's places, left to right, then Someday.
const PLACES = ['overdue', 'today', 'week', 'twoWeeks', 'later', 'someday'];

const CHECK_ICON =
  '<svg class="record-icon" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#E3E9FA"></circle><path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="#2F5BD3" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
const LETGO_ICON =
  '<svg class="record-icon" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.2" fill="none" stroke="#9A9DA4" stroke-width="1.6"></circle><path d="M8 12h8" fill="none" stroke="#6B6F78" stroke-width="2" stroke-linecap="round"></path></svg>';

// onOpenCard(cardId) when a card is clicked; onEdit(project) for Edit
// project.
export function setupProjectPage({ onOpenCard, onEdit }) {
  const header = document.getElementById('project-header');
  const heading = document.getElementById('project-heading');
  const line = document.getElementById('project-line');
  const statusEl = document.getElementById('project-status');
  const body = document.getElementById('project-body');
  const editButton = document.getElementById('project-edit-button');

  let last = null;
  let finishedOpen = false;

  editButton.addEventListener('click', () => {
    if (last && last.project) onEdit(last.project);
  });

  body.addEventListener('click', (event) => {
    if (event.target.closest('[data-finished-toggle]')) {
      finishedOpen = !finishedOpen;
      redraw();
      return;
    }
    const button = event.target.closest('[data-card-id]');
    if (button) onOpenCard(button.dataset.cardId);
  });

  // state: { project, loading, today, categories, cards, finished, error }.
  // project is undefined while projects load and null if there's no such
  // project; cards are its open cards; finished is { done, letGo }, or
  // undefined while loading.
  function render(state) {
    if (last && state.project && last.project && state.project.id !== last.project.id) finishedOpen = false;
    last = state;
    redraw();
  }

  function redraw() {
    if (!last) return;
    const { project, loading, today, categories, cards, finished, error } = last;
    const active = body.contains(document.activeElement) ? document.activeElement : null;
    const focusId = active && active.dataset.cardId;
    const focusToggle = active && active.hasAttribute('data-finished-toggle');

    editButton.hidden = !project;
    if (!project) {
      header.style.removeProperty('--project');
      heading.textContent = loading ? 'Loading…' : 'Not here';
      line.textContent = '';
      body.innerHTML = loading
        ? ''
        : '<p class="done-quiet">This project isn’t here. It may have been deleted, or the address is wrong. <a href="#">Back to the board</a>.</p>';
      return;
    }

    header.style.setProperty('--project', project.color);
    heading.textContent = project.name;
    const done = finished ? finished.done.length : 0;
    const archived = project.status === PROJECT_STATUS.ARCHIVED ? 'Archived. ' : '';
    line.textContent = `${archived}${endSentence(project, today)} ${openLine(cards.length)}${done ? `, ${done} finished` : ''}.`;

    let html = '';
    if (error) html += `<p class="done-message">${escapeHTML(error)}</p>`;
    const groups = PLACES.map((place) => ({ place, cards: cardsIn(place, cards, today) })).filter((g) => g.cards.length);
    // Left to right, like the board: position means time here too.
    html += groups.length
      ? `<div class="project-groups">${groups.map((g) => groupHTML(g, today, categories)).join('')}</div>`
      : '<p class="done-quiet">No open cards. To add one, open a card on the board and choose this project.</p>';
    if (finished && finished.done.length + finished.letGo.length) html += finishedHTML(finished, categories);
    body.innerHTML = html;

    if (focusId) {
      const again = body.querySelector(`[data-card-id="${CSS.escape(focusId)}"]`);
      (again || heading).focus();
    } else if (focusToggle) {
      const again = body.querySelector('[data-finished-toggle]');
      (again || heading).focus();
    }
  }

  function groupHTML({ place, cards }, today, categories) {
    const zone = place === 'someday' ? { name: 'Someday', range: 'no date yet' } : describeZone(place, today);
    const { name } = zone;
    // The board shows today's date as a big numeral; here it's words.
    const range = place === 'today' ? formatShort(today) : zone.range;
    const count = `${cards.length} ${cards.length === 1 ? 'card' : 'cards'}`;
    return `
      <section class="project-group project-group-${place}" aria-label="${name}, ${count}">
        <div class="project-group-head">
          <div class="zone-head-text">
            <h2 class="zone-title">${name}</h2>
            <span class="zone-range">${escapeHTML(range)}</span>
          </div>
          <span class="zone-count" aria-hidden="true">${cards.length}</span>
        </div>
        <div class="project-cards">${cardsHTML(cards, { categories, today })}</div>
      </section>`;
  }

  // The dashed box: "5 cards finished, 1 let go." and, once shown, both
  // lists in one, newest first.
  function finishedHTML({ done, letGo }, categories) {
    const categoryById = new Map(categories.map((c) => [c.id, c]));
    const rows = [...done, ...letGo]
      .sort((a, b) => stamp(b) - stamp(a) || a.title.localeCompare(b.title))
      .map((card) => rowHTML(card, categoryById))
      .join('');
    return `
      <section class="letgo project-finished" aria-label="Finished">
        <div class="letgo-head">
          <span class="letgo-text">${finishedLine(done.length, letGo.length)}</span>
          <button type="button" class="button" data-finished-toggle aria-expanded="${finishedOpen}"${finishedOpen ? ' aria-controls="project-finished-list"' : ''}>${finishedOpen ? 'Hide' : 'Show'}</button>
        </div>
        ${finishedOpen ? `<ul id="project-finished-list" class="record-list">${rows}</ul>` : ''}
      </section>`;
  }

  function rowHTML(card, categoryById) {
    const category = categoryOf(card, categoryById);
    const letGo = card.status === STATUS.LET_GO;
    return `
      <li class="${letGo ? 'is-letgo' : ''}">
        <div class="record-row record-row-plain">
          ${letGo ? LETGO_ICON : CHECK_ICON}
          <span class="record-title">${escapeHTML(card.title)}${letGo ? '<span class="visually-hidden"> (let go)</span>' : ''}</span>
          <span class="record-category"><span class="swatch" style="background: ${escapeHTML(category.color)}"></span>${escapeHTML(category.name)}</span>
          <span class="record-date">${formatShort(finishedDay(card))}</span>
        </div>
      </li>`;
  }

  return {
    render,
    // The page's title, for the browser tab.
    title() {
      return last && last.project ? last.project.name : 'Project';
    },
    showStatus(text) {
      statusEl.textContent = text;
    },
    focusHeading() {
      heading.focus();
    },
    reset() {
      last = null;
      finishedOpen = false;
      statusEl.textContent = '';
      body.innerHTML = '';
      heading.textContent = '';
      line.textContent = '';
    },
  };
}

function stamp(card) {
  return card.status === STATUS.LET_GO ? card.letGoAt : card.completedAt;
}
