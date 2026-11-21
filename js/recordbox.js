// The small box for one finished or let-go card: its category, project,
// when it was finished and due, its notes, its checklist, and "Put back on
// the board". What you did and project pages both open it. This file only
// shows the box; the page that opened it decides what Put back does.

import { formatShort } from './dates.js';
import { escapeHTML } from './board.js';
import { STATUS } from './model.js';
import { REPEAT_NAMES, repeats } from './repeat.js';
import { categoryOf, dayOf, finishedDay } from './record.js';
import { chainOrder, chainStatus } from './followup.js';

const BOX_EMPTY =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="4"></rect></svg>';
const BOX_FULL =
  '<svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="2.5" width="19" height="19" rx="4.5" fill="currentColor"></rect><path d="M8 12.5l3 3 5-6" fill="none" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></path></svg>';

// The chain's marks: a filled check for finished, a dash for let go, an
// open circle for still on the board.
const CHAIN_ICONS = {
  done: '<svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor"></circle><path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></path></svg>',
  letgo: '<svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"></circle><path d="M8 12h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path></svg>',
  open: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="8.5"></circle></svg>',
};

// loadChain(chainId) returns a promise of every card in a chain of
// follow-ups.
export function setupRecordBox({ loadChain = null } = {}) {
  const box = document.getElementById('record-card');
  const title = document.getElementById('record-title');
  const categoryEl = document.getElementById('record-category');
  const projectEl = document.getElementById('record-project');
  const when = document.getElementById('record-when');
  const notes = document.getElementById('record-notes');
  const series = document.getElementById('record-series');
  const checks = document.getElementById('record-checklist');
  const checksHead = document.getElementById('record-checklist-head');
  const checksList = document.getElementById('record-checklist-list');
  const chain = document.getElementById('record-chain');
  const chainList = document.getElementById('record-chain-list');

  // The card in the box, and what the page that opened it asked for.
  let card = null;
  let callbacks = null;

  document.getElementById('record-x').addEventListener('click', () => box.close());
  document.getElementById('record-close').addEventListener('click', () => box.close());
  document.getElementById('record-putback').addEventListener('click', () => {
    const putBack = card;
    const { onPutBack } = callbacks;
    box.close();
    if (putBack) onPutBack(putBack);
  });
  // A click on the dimmed page around the box.
  box.addEventListener('click', (event) => {
    if (event.target === box) box.close();
  });
  box.addEventListener('close', () => {
    const id = card && card.id;
    const { onClosed } = callbacks || {};
    card = null;
    callbacks = null;
    if (onClosed) onClosed(id);
  });

  // categories: yours. project: the card's project to name, or null (a
  // project page doesn't name its own). today: for "this year or not".
  // onPutBack(card) for the button; onClosed(cardId) to put focus back.
  function open(shown, { categories, project = null, today, onPutBack, onClosed }) {
    card = shown;
    callbacks = { onPutBack, onClosed };
    const category = categoryOf(card, new Map(categories.map((c) => [c.id, c])));
    title.textContent = card.title;
    categoryEl.innerHTML = `<span class="swatch" style="background: ${escapeHTML(category.color)}"></span>${escapeHTML(category.name)}`;
    projectEl.hidden = !project;
    projectEl.innerHTML = project
      ? `<span class="card-project-arrow" style="--project: ${escapeHTML(project.color)}" aria-hidden="true">↗</span><span class="visually-hidden">Project: </span>${escapeHTML(project.name)}`
      : '';
    const how = card.status === STATUS.LET_GO ? 'Let go' : 'Finished';
    const withYear = (iso) => (iso.slice(0, 4) === today.slice(0, 4) ? formatShort(iso) : `${formatShort(iso)}, ${iso.slice(0, 4)}`);
    const due = card.dueDate ? `It was due ${withYear(card.dueDate)}.` : 'It had no date.';
    when.textContent = `${how} ${withYear(finishedDay(card))}. ${due}`;
    notes.textContent = card.notes;
    notes.hidden = !card.notes.trim();
    // The whole checklist, each item with its tick, unticked ones included:
    // the record says what was skipped as plainly as what was done.
    const items = card.checklist || [];
    checks.hidden = !items.length;
    const ticked = items.filter((item) => item.done).length;
    checksHead.textContent = `Checklist, ${ticked} of ${items.length} ticked`;
    checksList.replaceChildren(
      ...items.map((item) => {
        const li = document.createElement('li');
        li.className = item.done ? 'is-done' : 'is-open';
        li.innerHTML = item.done ? BOX_FULL : BOX_EMPTY;
        const words = document.createElement('span');
        if (!item.done) {
          const hint = document.createElement('span');
          hint.className = 'visually-hidden';
          hint.textContent = 'Not ticked: ';
          words.append(hint);
        }
        words.append(item.text);
        li.append(words);
        return li;
      }),
    );
    series.textContent = repeats(card)
      ? `Part of a ${REPEAT_NAMES[card.repeat].toLowerCase()} series. It comes back on its own, as a one-off; the series already has its next card.`
      : '';
    series.hidden = !repeats(card);
    chain.hidden = true;
    chainList.replaceChildren();
    if (card.chainId && loadChain) showChain(card);
    box.showModal();
  }

  // The chain, once Firestore answers, if the box still shows that card.
  // A chain of one (its follow-up never made) shows nothing.
  function showChain(shown) {
    loadChain(shown.chainId)
      .then((cards) => {
        if (card !== shown || cards.length < 2) return;
        chainList.replaceChildren(
          ...chainOrder(cards).map((link) => {
            const { kind, text } = chainStatus(link, dayOf);
            const li = document.createElement('li');
            li.className = `is-${kind}${link.id === shown.id ? ' is-this' : ''}`;
            li.innerHTML = CHAIN_ICONS[kind];
            const words = document.createElement('span');
            const name = document.createElement('span');
            name.className = 'chain-title';
            name.textContent = link.title;
            const when = document.createElement('span');
            when.className = 'chain-when';
            when.textContent = text;
            words.append(name, when);
            if (link.id === shown.id) {
              const me = document.createElement('span');
              me.className = 'visually-hidden';
              me.textContent = ' (this card)';
              words.append(me);
            }
            li.append(words);
            return li;
          }),
        );
        chain.hidden = false;
      })
      // The chain is extra: if it can't be read, the box simply goes
      // without it.
      .catch(() => {});
  }

  return {
    open,
    close() {
      if (box.open) box.close();
    },
  };
}
