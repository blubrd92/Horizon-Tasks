// The project page's Plan panel: the project's steps in order, each a
// card at its own date. Read, it shows how far along the plan is and the
// steps in the chain's look (done, open, let go), each one a button that
// opens its card. Make a plan and Change turn it into rows like the
// checklist's: a handle, the step's words, its date on a second line, and
// an X. Nothing saves until Add to the board or Save, and then in one
// write; app.js does the writing. On a phone the panel folds to one row,
// like Notes and Links (the folding is in the CSS).

import { escapeHTML } from './board.js';
import { formatShort } from './dates.js';
import { STATUS } from './model.js';
import { activeOf } from './categories.js';
import { dayOf } from './record.js';
import { startSort } from './sortable.js';
import { PLAN_MAX, orderNotes, progress, stepsOf, usualCategory } from './plan.js';

const ICONS = {
  done: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor"></circle><path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></path></svg>',
  letgo: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" stroke-width="1.6"></circle><path d="M8 12h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path></svg>',
  open: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="8.5"></circle></svg>',
  handle:
    '<svg width="12" height="18" viewBox="0 0 12 18" fill="currentColor" aria-hidden="true"><circle cx="3" cy="3" r="1.6"></circle><circle cx="9" cy="3" r="1.6"></circle><circle cx="3" cy="9" r="1.6"></circle><circle cx="9" cy="9" r="1.6"></circle><circle cx="3" cy="15" r="1.6"></circle><circle cx="9" cy="15" r="1.6"></circle></svg>',
  remove:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg>',
  check:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"></path></svg>',
  plus: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>',
};

const TITLE_MAX = 200;

// onOpenCard(cardId) for an open step; onOpenRecord(card, onClosed) for a
// finished one, as the project page does. onSave(project, { category,
// rows, off }) when Add to the board or Save is pressed: rows are the
// plan in order, { id (null for a new step), title, dueDate }; off are
// the ids of steps taken off. It returns a promise that fails if
// Firestore refuses, and the panel then reopens what you had.
export function setupPlanPanel({ onOpenCard, onOpenRecord, onSave }) {
  const panel = document.getElementById('plan-panel');
  const heading = document.getElementById('plan-heading');
  const summary = document.getElementById('plan-summary');
  const changeButton = document.getElementById('plan-change');
  const fold = document.getElementById('plan-fold');
  const status = document.getElementById('plan-status');
  const read = document.getElementById('plan-read');
  const form = document.getElementById('plan-form');
  const catRow = document.getElementById('plan-cat-row');
  const category = document.getElementById('plan-category');
  const rowsEl = document.getElementById('plan-rows');
  const add = document.getElementById('plan-add');
  const note = document.getElementById('plan-note');
  const error = document.getElementById('plan-error');
  const saveButton = document.getElementById('plan-save');

  // What the page last gave: { project, cards (every card in the project,
  // any status; undefined while loading), categories, today }.
  let state = null;
  let open = false;
  // While making or changing: 'make' or 'change', and the rows, each
  // { key, id, title, dueDate, locked, off, how }.
  let mode = null;
  let rows = [];
  let nextKey = 1;

  changeButton.addEventListener('click', () => startChange());
  fold.addEventListener('click', () => {
    open = !open;
    drawFold();
  });

  read.addEventListener('click', (event) => {
    if (event.target.closest('[data-plan-make]')) {
      startMake();
      return;
    }
    const button = event.target.closest('[data-step-id]');
    if (!button || !state || !state.cards) return;
    const card = state.cards.find((c) => c.id === button.dataset.stepId);
    if (!card) return;
    if (card.status === STATUS.DONE || card.status === STATUS.LET_GO) {
      onOpenRecord(card, () => {
        const again = read.querySelector(`[data-step-id="${CSS.escape(card.id)}"]`);
        (again || heading).focus();
      });
    } else {
      onOpenCard(card.id);
    }
  });

  // ---- Read ----

  function steps() {
    return state && state.cards ? stepsOf(state.project, state.cards) : [];
  }

  function drawRead() {
    const list = steps();
    changeButton.hidden = Boolean(mode) || !list.length;
    if (!state.cards) {
      read.innerHTML = '<p class="plan-empty">Loading…</p>';
      summary.textContent = '';
      return;
    }
    if (!list.length) {
      summary.textContent = 'None yet';
      read.innerHTML = `
        <p class="plan-empty">No plan yet. A plan is this project's steps in order, each with its own date. Every step becomes a card on the board.</p>
        <div class="side-foot"><button type="button" class="button side-add" data-plan-make>${ICONS.plus}Make a plan</button></div>`;
      return;
    }
    const { done, total, next } = progress(list);
    const notes = orderNotes(list);
    const nextText = next ? (next.dueDate ? formatShort(next.dueDate) : 'in Someday') : '';
    summary.textContent = next ? `${done} of ${total} done · next ${nextText}` : `${done} of ${total} done`;
    const line = next
      ? `${done} of ${total} done. Next: <b>${escapeHTML(next.title)}</b>, ${next.dueDate ? `<span class="plan-date">${formatShort(next.dueDate)}</span>` : 'in Someday'}.`
      : `${done} of ${total} done. Nothing left open.`;
    const items = list
      .map((step, i) => {
        const kind = step.status === STATUS.DONE ? 'done' : step.status === STATUS.LET_GO ? 'letgo' : 'open';
        const when =
          kind === 'done'
            ? `Done ${formatShort(dayOf(step.completedAt))}`
            : kind === 'letgo'
              ? `Let go ${formatShort(dayOf(step.letGoAt))}`
              : step.dueDate
                ? `<span class="plan-date">${formatShort(step.dueDate)}</span>${lateText(step)}`
                : 'In Someday';
        const order = notes.get(step.id);
        const orderNote = order ? `<span class="plan-order">Before step ${order.number}’s date</span>` : '';
        const isNext = next && step.id === next.id;
        const said = kind === 'done' ? 'done' : kind === 'letgo' ? 'let go' : isNext ? 'next' : 'open';
        return `
          <li class="is-${kind}${isNext ? ' is-next' : ''}">${ICONS[kind]}
            <button type="button" class="plan-step" data-step-id="${escapeHTML(step.id)}">
              <span class="chain-title"><span class="plan-num" aria-hidden="true">${i + 1}</span><span class="visually-hidden">Step ${i + 1}, ${said}: </span>${escapeHTML(step.title)}</span>
              <span class="chain-when">${when}</span>${orderNote}
            </button>
          </li>`;
      })
      .join('');
    read.innerHTML = `<p class="plan-line">${line}</p><ol class="chain-list plan-list" aria-label="Steps">${items}</ol>`;
  }

  function lateText(step) {
    if (!state || step.dueDate >= state.today) return '';
    const days = Math.round((Date.parse(state.today) - Date.parse(step.dueDate)) / 86400000);
    return ` <span class="plan-late">${days} ${days === 1 ? 'day' : 'days'} late</span>`;
  }

  // ---- Making and changing ----

  function startMake() {
    if (!state || !state.cards) return;
    mode = 'make';
    rows = [];
    fillCategories(usualCategory(state.cards, state.categories));
    openForm();
    add.focus();
  }

  function startChange() {
    if (!state || !state.cards) return;
    mode = 'change';
    rows = steps().map((step) => ({
      key: nextKey++,
      id: step.id,
      title: step.title,
      dueDate: step.dueDate,
      locked: step.status === STATUS.DONE || step.status === STATUS.LET_GO,
      how: step.status === STATUS.DONE ? `Done ${formatShort(dayOf(step.completedAt))}` : `Let go ${formatShort(dayOf(step.letGoAt))}`,
      off: false,
    }));
    openForm();
    const first = rowsEl.querySelector('textarea.pe-title');
    (first || add).focus();
  }

  function openForm() {
    open = true;
    showError('');
    status.textContent = '';
    heading.textContent = mode === 'make' ? 'Make a plan' : 'Change the plan';
    catRow.hidden = mode !== 'make';
    form.hidden = false;
    read.hidden = true;
    changeButton.hidden = true;
    drawRows();
    drawFold();
  }

  function closeForm(focus = true) {
    mode = null;
    rows = [];
    heading.textContent = 'Plan';
    form.hidden = true;
    read.hidden = false;
    showError('');
    if (state) drawRead();
    drawFold();
    if (focus) (changeButton.hidden ? heading : changeButton).focus();
  }

  function fillCategories(chosen) {
    const options = [{ value: '', label: 'No category' }, ...activeOf(state.categories).map((c) => ({ value: c.id, label: c.name }))];
    category.replaceChildren(
      ...options.map(({ value, label }) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        return option;
      }),
    );
    category.value = chosen || '';
  }

  // The steps that will be in the plan, in order.
  function kept() {
    return rows.filter((r) => !r.off);
  }

  function drawRows() {
    const active = document.activeElement;
    const focus =
      active && rowsEl.contains(active)
        ? { key: active.closest('[data-key]').dataset.key, part: active.dataset.part }
        : null;
    // Dates out of order among the open steps that stay: the same note as
    // the panel's, on the step that's dated earlier than the one before.
    const before = orderOf();
    rowsEl.innerHTML = rows.map((r) => rowHTML(r, before.get(r.key))).join('');
    for (const el of rowsEl.querySelectorAll('textarea.pe-title')) fit(el);
    if (focus) {
      const again = rowsEl.querySelector(`[data-key="${focus.key}"] [data-part="${focus.part}"]`);
      if (again) again.focus();
    }
    const count = kept().length;
    const made = rows.filter((r) => !r.id && !r.off).length;
    const full = count >= PLAN_MAX;
    add.disabled = full;
    add.placeholder = full ? `A plan holds ${PLAN_MAX} steps` : 'Add a step';
    if (mode === 'make') {
      saveButton.textContent = count ? `Add ${count} ${count === 1 ? 'step' : 'steps'} to the board` : 'Add to the board';
      note.textContent = `Each step becomes a card in ${state.project.name}, at its own date. No date: that step waits in Someday.`;
    } else {
      saveButton.textContent = 'Save';
      const parts = [];
      if (made) parts.push(`New steps become cards in ${state.project.name}.`);
      if (rows.some((r) => r.off)) parts.push('Taken off: the card stays in this project, at its date.');
      parts.push("Dragging a step doesn't change its date.");
      note.textContent = parts.join(' ');
    }
  }

  // The "Before step N's date" notes, put right in place.
  function drawOrderNotes() {
    const before = orderOf();
    for (const li of rowsEl.querySelectorAll('.pe-row')) {
      const main = li.querySelector('.pe-main');
      const old = main && main.querySelector('.plan-order');
      if (old) old.remove();
      const number = before.get(Number(li.dataset.key));
      if (main && number && !li.classList.contains('pe-locked') && !li.classList.contains('pe-off')) {
        main.insertAdjacentHTML('beforeend', `<span class="plan-order">Before step ${number}\u2019s date</span>`);
      }
    }
  }

  // Numbers the rows that stay, and finds the open steps dated earlier
  // than the open step before them: a Map from row key to that step's
  // number.
  function orderOf() {
    let n = 0;
    let last = null;
    const before = new Map();
    for (const r of rows) {
      if (r.off) continue;
      n += 1;
      r.number = n;
      if (r.locked || !r.dueDate) continue;
      if (last && r.dueDate < last.dueDate) before.set(r.key, last.number);
      last = { number: n, dueDate: r.dueDate };
    }
    return before;
  }

  function rowHTML(r, beforeNumber) {
    const title = escapeHTML(r.title);
    if (r.locked) {
      return `
        <li class="pe-row pe-locked" data-key="${r.key}">
          <span class="pe-lock" title="Finished: stays where it is">${ICONS.check}</span>
          <div class="pe-main"><span class="pe-title pe-title-fixed"><span class="visually-hidden">Step ${r.number}, finished: </span>${title}</span><span class="pe-done">${escapeHTML(r.how)}</span></div>
          <span></span>
        </li>`;
    }
    if (r.off) {
      return `
        <li class="pe-row pe-off" data-key="${r.key}">
          <span></span>
          <div class="pe-main"><span class="pe-title pe-title-fixed"><span class="visually-hidden">Taken off: </span>${title}</span>
            <span class="pe-off-note"><span>Off the plan; still a card in this project.</span> <button type="button" class="link-button" data-part="undo" data-undo>Undo</button></span></div>
          <span></span>
        </li>`;
    }
    const label = `Step ${r.number}`;
    const order = beforeNumber ? `<span class="plan-order">Before step ${beforeNumber}’s date</span>` : '';
    // The words beside the handle and the X; the date under them, the
    // whole width of the row, so the full date shows in the side column.
    return `
      <li class="pe-row" data-key="${r.key}">
        <span class="cl-handle pe-handle" title="Drag to move">${ICONS.handle}</span>
        <textarea class="pe-title" data-part="title" rows="1" maxlength="${TITLE_MAX}" aria-label="${label}" aria-describedby="plan-help">${title}</textarea>
        <button type="button" class="pe-x" data-part="x" data-remove aria-label="${r.id ? 'Take off the plan' : 'Drop'}: ${title}">${ICONS.remove}</button>
        <div class="pe-main pe-under">
          <div class="pe-due">
            <input type="date" class="field-input field-date" data-part="due" value="${r.dueDate || ''}" aria-label="${label}’s date">
            <button type="button" class="button button-small" data-part="nodate" data-nodate>No date</button>
          </div>${order}
        </div>
      </li>`;
  }

  // A step's words grow to fit, as the checklist's do.
  function fit(el) {
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }

  function rowOf(el) {
    const li = el.closest('[data-key]');
    return li ? rows.find((r) => String(r.key) === li.dataset.key) : null;
  }

  rowsEl.addEventListener('input', (event) => {
    const r = rowOf(event.target);
    if (!r) return;
    if (event.target.dataset.part === 'title') {
      r.title = event.target.value.replace(/\s*\n\s*/g, ' ');
      fit(event.target);
    } else if (event.target.dataset.part === 'due') {
      // Only the notes change: redrawing the row would throw away where
      // you are in the date box.
      r.dueDate = event.target.value || null;
      drawOrderNotes();
    }
  });

  rowsEl.addEventListener('click', (event) => {
    const r = rowOf(event.target);
    if (!r) return;
    if (event.target.closest('[data-nodate]')) {
      r.dueDate = null;
      drawRows();
      const due = rowsEl.querySelector(`[data-key="${r.key}"] [data-part="due"]`);
      if (due) due.focus();
    } else if (event.target.closest('[data-remove]')) {
      const i = rows.indexOf(r);
      if (r.id) r.off = true;
      else rows.splice(i, 1);
      drawRows();
      // Focus stays near: the Undo, or the next row's words, or the add field.
      const undo = r.off && rowsEl.querySelector(`[data-key="${r.key}"] [data-undo]`);
      const next = rowsEl.querySelectorAll('[data-key] .pe-title')[i];
      const words = next && next.matches('textarea') ? next : null;
      (undo || words || add).focus();
    } else if (event.target.closest('[data-undo]')) {
      r.off = false;
      drawRows();
      const words = rowsEl.querySelector(`[data-key="${r.key}"] .pe-title`);
      if (words) words.focus();
    }
  });

  rowsEl.addEventListener('keydown', (event) => {
    const r = rowOf(event.target);
    if (!r || event.isComposing) return;
    const part = event.target.dataset.part;
    if (event.key === 'Enter' && !(event.ctrlKey || event.metaKey) && (part === 'title' || part === 'due')) {
      // Enter in the words goes to the date; in the date, to the next
      // step's words, or the add field after the last.
      event.preventDefault();
      if (part === 'title') {
        rowsEl.querySelector(`[data-key="${r.key}"] [data-part="due"]`).focus();
      } else {
        const titles = [...rowsEl.querySelectorAll('textarea.pe-title')];
        const here = titles.indexOf(rowsEl.querySelector(`[data-key="${r.key}"] textarea.pe-title`));
        (titles[here + 1] || add).focus();
      }
      return;
    }
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      // One press moves past one step: a step taken off doesn't count.
      const i = rows.indexOf(r);
      const by = event.key === 'ArrowUp' ? -1 : 1;
      let j = i + by;
      while (j >= 0 && j < rows.length && rows[j].off) j += by;
      if (j < 0 || j >= rows.length) return;
      rows.splice(i, 1);
      rows.splice(j, 0, r);
      drawRows();
    }
  });

  // Dragging by the handle (sortable.js). The rows' order on screen
  // becomes the plan's.
  rowsEl.addEventListener('pointerdown', (event) => {
    const handle = event.target.closest('.pe-handle');
    if (!handle || event.button !== 0) return;
    startSort(rowsEl, handle.closest('.pe-row'), event, {
      idOf: (li) => li.dataset.key,
      onDrop: (keys) => {
        const byKey = new Map(rows.map((r) => [String(r.key), r]));
        rows = keys.map((k) => byKey.get(k)).filter(Boolean);
        drawRows();
      },
    });
  });

  add.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.isComposing || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    const lines = splitLines(add.value);
    if (!lines.length) return;
    add.value = '';
    addLines(lines);
  });

  // Several lines pasted (a list from an email): one step each.
  add.addEventListener('paste', (event) => {
    const pasted = event.clipboardData && event.clipboardData.getData('text/plain');
    if (!pasted || !/[\r\n]/.test(pasted.trim())) return;
    event.preventDefault();
    const before = add.value.slice(0, add.selectionStart);
    const after = add.value.slice(add.selectionEnd);
    add.value = '';
    addLines(splitLines(before + pasted + after));
  });

  function addLines(lines) {
    const room = PLAN_MAX - kept().length;
    const added = lines.slice(0, Math.max(0, room)).map((title) => ({
      key: nextKey++,
      id: null,
      title: title.slice(0, TITLE_MAX),
      dueDate: null,
      locked: false,
      off: false,
    }));
    rows.push(...added);
    drawRows();
    showError(lines.length > added.length ? `A plan holds ${PLAN_MAX} steps; the rest weren't added.` : '');
    // One step: its date is next. Several pasted: back to the add field.
    const due = added.length === 1 && rowsEl.querySelector(`[data-key="${added[0].key}"] [data-part="due"]`);
    (due || add).focus();
  }

  document.getElementById('plan-cancel').addEventListener('click', () => closeForm());

  form.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !changed()) {
      event.preventDefault();
      closeForm();
    }
  });

  function changed() {
    if (mode === 'make') return rows.length > 0 || add.value.trim() !== '';
    const was = steps();
    const now = rows.filter((r) => !r.off);
    if (now.length !== was.length || rows.some((r) => r.off) || add.value.trim()) return true;
    return now.some((r, i) => r.id !== was[i].id || r.title.trim() !== was[i].title || (r.dueDate || null) !== (was[i].dueDate || null));
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    // Words left in the add field count as a step.
    const typed = splitLines(add.value);
    if (typed.length) {
      add.value = '';
      addLines(typed);
    }
    const plan = kept();
    const blank = plan.find((r) => !r.locked && !r.title.trim());
    if (blank) {
      showError(`Step ${blank.number} needs words.`);
      const words = rowsEl.querySelector(`[data-key="${blank.key}"] .pe-title`);
      if (words) words.focus();
      return;
    }
    if (mode === 'make' && !plan.length) {
      showError('Add a step first.');
      add.focus();
      return;
    }
    const project = state.project;
    const result = {
      category: mode === 'make' ? category.value || null : null,
      rows: plan.map((r) => ({ id: r.id, title: r.title.trim(), dueDate: r.dueDate || null, locked: r.locked })),
      off: rows.filter((r) => r.off).map((r) => r.id),
    };
    const kept0 = { mode, rows: rows.map((r) => ({ ...r })), category: category.value };
    const made = mode === 'make';
    closeForm(false);
    status.textContent = made ? `Made the plan: ${plan.length} ${plan.length === 1 ? 'step' : 'steps'} on the board.` : 'Saved the plan.';
    heading.focus();
    onSave(project, result).catch((err) => {
      // Refused: what you had comes back, with a line saying so.
      if (!state || state.project.id !== project.id) return;
      mode = kept0.mode;
      rows = kept0.rows;
      if (mode === 'make') fillCategories(kept0.category);
      status.textContent = '';
      openForm();
      showError(`The plan didn't save (${err.code || err.message}). Try again.`);
    });
  });

  function showError(text) {
    error.textContent = text;
    error.hidden = !text;
  }

  function drawFold() {
    const isOpen = open || Boolean(mode);
    panel.classList.toggle('is-folded', !isOpen);
    fold.hidden = Boolean(mode);
    fold.textContent = isOpen ? 'Hide' : 'Show';
    fold.setAttribute('aria-expanded', String(isOpen));
    fold.setAttribute('aria-label', `${isOpen ? 'Hide' : 'Show'} plan`);
  }

  // next: { project, cards, categories, today }, or null to hide. While
  // you're making or changing, the rows hold still; the read view catches
  // up when you're done.
  function render(next) {
    if (!next) {
      leave();
      return;
    }
    if (state && state.project.id !== next.project.id) leave();
    state = next;
    if (!mode) drawRead();
    else if (mode === 'change' && !state.project) closeForm(false);
    drawFold();
  }

  function leave() {
    state = null;
    mode = null;
    rows = [];
    open = false;
    heading.textContent = 'Plan';
    form.hidden = true;
    read.hidden = false;
    read.innerHTML = '';
    status.textContent = '';
    showError('');
    add.value = '';
  }

  return {
    render,
    leave,
    // True while a plan is being made or changed.
    editing: () => Boolean(mode),
  };
}

function splitLines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim())
    .filter(Boolean);
}
