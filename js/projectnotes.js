// The project page's Notes and Links panels. This file draws them and runs
// their editing; app.js saves. Saves are shown at once, and if Firestore
// refuses one, what you typed comes back with a line saying so.

import { escapeHTML } from './board.js';
import {
  LINKS_LIMIT,
  LINK_TITLE_LIMIT,
  LINK_URL_LIMIT,
  NOTES_LIMIT,
  NOTES_WARN,
  cleanNotes,
  movedLink,
  newLinkId,
  readAddress,
  safeHref,
  shortAddress,
  siteOf,
  storedLinks,
  withLink,
  withoutLink,
} from './links.js';

// Below 960px wide the panels sit above the cards, each folded to one row
// until you open it. That's all in the CSS: on a wide screen, folding does
// nothing and the Show buttons are hidden.

const LINK_ICON =
  '<svg class="link-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"></path><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"></path></svg>';
const OUT_ICON =
  '<svg class="link-out" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6"></path><path d="M20 4l-9 9"></path><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"></path></svg>';
const PENCIL_ICON =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"></path><path d="M13.5 6.5l4 4"></path></svg>';
const UP_ICON =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"></path></svg>';
const DOWN_ICON =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6"></path></svg>';

// onSaveNotes(projectId, notes) and onSaveLinks(projectId, links) save,
// returning a promise that fails if Firestore refuses.
export function setupProjectNotes({ onSaveNotes, onSaveLinks }) {
  const aside = document.getElementById('project-aside');

  const notesPanel = document.getElementById('notes-panel');
  const notesSummary = document.getElementById('notes-summary');
  const notesFold = document.getElementById('notes-fold');
  const notesEdit = document.getElementById('notes-edit');
  const notesEditLabel = document.getElementById('notes-edit-label');
  const notesView = document.getElementById('notes-view');
  const notesText = document.getElementById('notes-text');
  const notesForm = document.getElementById('notes-form');
  const notesInput = document.getElementById('notes-input');
  const notesCount = document.getElementById('notes-count');
  const notesError = document.getElementById('notes-error');

  const linksPanel = document.getElementById('links-panel');
  const linksSummary = document.getElementById('links-summary');
  const linksFold = document.getElementById('links-fold');
  const linksReorder = document.getElementById('links-reorder');
  const linksStatus = document.getElementById('links-status');
  const linksBody = document.getElementById('links-body');
  const linksAdd = document.getElementById('links-add');
  const linksFull = document.getElementById('links-full');
  const linkForm = document.getElementById('link-form');
  const linkTitle = document.getElementById('link-title');
  const linkUrl = document.getElementById('link-url');
  const linkUrlError = document.getElementById('link-url-error');
  const linkRemove = document.getElementById('link-remove');
  const linkFormHome = linkForm.parentElement;

  notesInput.maxLength = NOTES_LIMIT;
  linkTitle.maxLength = LINK_TITLE_LIMIT;
  linkUrl.maxLength = LINK_URL_LIMIT;

  // The project on screen, as last drawn.
  let project = null;
  // Notes being edited: the text they started from, to tell whether
  // anything changed.
  let notesEditing = false;
  let notesBase = '';
  // Unsaved notes left behind when you went elsewhere, by project id:
  // { text, note }, where note is the line to show when they come back.
  const drafts = new Map();
  // On a phone, whether each panel is open (Show) or folded to its row.
  let notesOpen = false;
  let linksOpen = false;
  let reordering = false;
  // The link being added or changed: { id } (null for a new one).
  let editingLink = null;

  // ---- Notes ----

  notesEdit.addEventListener('click', () => {
    if (project) openNotes(project.notes, project.notes, '');
  });

  notesFold.addEventListener('click', () => {
    notesOpen = !notesOpen;
    drawNotes();
  });

  function openNotes(text, base, note) {
    notesEditing = true;
    notesOpen = true;
    notesBase = base;
    notesInput.value = text;
    showNotesError(note);
    drawNotes();
    countNotes();
    fitNotes();
    notesInput.focus();
    notesInput.setSelectionRange(notesInput.value.length, notesInput.value.length);
  }

  function closeNotes() {
    notesEditing = false;
    showNotesError('');
    drawNotes();
    notesEdit.focus();
  }

  function showNotesError(text) {
    notesError.textContent = text;
    notesError.hidden = !text;
  }

  function notesChanged() {
    return notesEditing && notesInput.value !== notesBase;
  }

  notesInput.addEventListener('input', () => {
    countNotes();
    fitNotes();
  });

  notesInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      notesForm.requestSubmit();
    } else if (event.key === 'Escape' && !notesChanged()) {
      event.preventDefault();
      closeNotes();
    }
  });

  document.getElementById('notes-cancel').addEventListener('click', () => {
    if (project) drafts.delete(project.id);
    closeNotes();
  });

  notesForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!project) return;
    const notes = cleanNotes(notesInput.value.slice(0, NOTES_LIMIT));
    const id = project.id;
    drafts.delete(id);
    if (notes !== project.notes) {
      // Shown at once; Firestore's own copy follows a moment later.
      project = { ...project, notes };
      onSaveNotes(id, notes).catch((err) => {
        const note = `Your notes didn’t save (${err.code || err.message}). They’re still here; try Save again.`;
        if (project && project.id === id && !notesEditing) openNotes(notes, project.notes, note);
        else if (!project || project.id !== id) drafts.set(id, { text: notes, note });
        else showNotesError(note);
      });
    }
    closeNotes();
  });

  // "812 characters left", once there are 9,000.
  function countNotes() {
    const used = notesInput.value.length;
    const left = NOTES_LIMIT - used;
    if (used < NOTES_WARN) notesCount.textContent = '';
    else if (left > 0) notesCount.textContent = `${left.toLocaleString('en-US')} ${left === 1 ? 'character' : 'characters'} left`;
    else notesCount.textContent = `Notes stop at ${NOTES_LIMIT.toLocaleString('en-US')} characters.`;
    notesCount.hidden = !notesCount.textContent;
  }

  // The box grows with what's in it, up to most of the window.
  function fitNotes() {
    notesInput.style.height = 'auto';
    const most = Math.max(200, Math.round(window.innerHeight * 0.6));
    notesInput.style.height = `${Math.min(notesInput.scrollHeight + 2, most)}px`;
  }

  function drawNotes() {
    notesForm.hidden = !notesEditing;
    notesView.hidden = notesEditing;
    notesEdit.hidden = notesEditing;
    // Hide is gone while you're typing; Save and Cancel close it.
    notesFold.hidden = notesEditing;
    drawFold(notesPanel, notesFold, notesOpen || notesEditing, 'notes');
    if (notesEditing || !project) return;
    const has = Boolean(project.notes);
    notesEditLabel.textContent = has ? 'Edit' : 'Add notes';
    notesEdit.setAttribute('aria-label', has ? 'Edit notes' : 'Add notes');
    notesText.textContent = has ? project.notes : 'No notes yet.';
    notesText.classList.toggle('is-empty', !has);
    // The folded row shows the first line that has anything on it.
    notesSummary.textContent = (project.notes.split('\n').find((l) => l.trim()) || '').trim() || 'None yet';
  }

  // A panel folded to its row on a phone, or open.
  function drawFold(panel, button, open, name) {
    panel.classList.toggle('is-folded', !open);
    button.textContent = open ? 'Hide' : 'Show';
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', `${open ? 'Hide' : 'Show'} ${name}`);
  }

  // ---- Links ----

  linksFold.addEventListener('click', () => {
    linksOpen = !linksOpen;
    if (!linksOpen) reordering = false;
    drawLinks();
  });

  linksReorder.addEventListener('click', () => {
    reordering = !reordering;
    setLinksStatus('');
    drawLinks();
    linksReorder.focus();
  });

  linksAdd.addEventListener('click', () => {
    if (project && project.links.length < LINKS_LIMIT) openLinkForm(null);
  });

  linksBody.addEventListener('click', (event) => {
    const edit = event.target.closest('[data-link-edit]');
    if (edit) {
      openLinkForm(edit.dataset.linkEdit);
      return;
    }
    const move = event.target.closest('[data-link-move]');
    if (move && project) {
      const id = move.dataset.linkId;
      const step = move.dataset.linkMove === 'up' ? -1 : 1;
      const links = movedLink(project.links, id, step);
      if (links === project.links) return;
      saveLinks(links, (err) => `The new order didn’t save (${err.code || err.message}).`);
      setLinksStatus('');
      // Focus follows the button you pressed into its new row (drawLinks).
      move.focus();
      drawLinks();
    }
  });

  // A line under the heading: what was removed, or (in rose) what
  // didn't save.
  function setLinksStatus(text, error = false) {
    linksStatus.textContent = text;
    linksStatus.classList.toggle('is-error', error);
  }

  // Saves a new list of links, showing it at once. failText(err) is the
  // line to show if Firestore refuses; onFail(), if given, runs then too.
  function saveLinks(links, failText, onFail) {
    const id = project.id;
    project = { ...project, links };
    onSaveLinks(id, storedLinks(links)).catch((err) => {
      if (!project || project.id !== id) return;
      setLinksStatus(failText(err), true);
      if (onFail) onFail();
    });
  }

  function openLinkForm(id, values = null, error = '') {
    const link = id ? project.links.find((l) => l.id === id) : null;
    if (id && !link && !values) return;
    reordering = false;
    linksOpen = true;
    editingLink = { id };
    linkTitle.value = values ? values.title : link ? link.title : '';
    linkUrl.value = values ? values.url : link ? link.url : '';
    linkRemove.hidden = !link;
    showLinkError(error);
    if (!values) setLinksStatus('');
    drawLinks();
    (error ? linkUrl : linkTitle).focus();
  }

  function closeLinkForm(focusId = null) {
    editingLink = null;
    showLinkError('');
    drawLinks();
    const row = focusId && linksBody.querySelector(`[data-link-row="${CSS.escape(focusId)}"]`);
    const target = row && (row.querySelector('a') || row.querySelector('[data-link-edit]'));
    (target || linksAdd).focus();
  }

  function showLinkError(text) {
    linkUrlError.textContent = text;
    linkUrlError.hidden = !text;
    if (text) linkUrl.setAttribute('aria-invalid', 'true');
    else linkUrl.removeAttribute('aria-invalid');
  }

  document.getElementById('link-cancel').addEventListener('click', () => {
    const id = editingLink && editingLink.id;
    closeLinkForm(id);
  });

  linkForm.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeLinkForm(editingLink && editingLink.id);
    }
  });

  linkForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!project || !editingLink) return;
    const read = readAddress(linkUrl.value);
    if (read.error) {
      showLinkError(read.error);
      linkUrl.focus();
      return;
    }
    const typed = { title: linkTitle.value, url: linkUrl.value };
    const link = { id: editingLink.id || newLinkId(), title: linkTitle.value.trim().slice(0, LINK_TITLE_LIMIT), url: read.url };
    const isNew = !editingLink.id;
    if (isNew && project.links.length >= LINKS_LIMIT) {
      showLinkError(`A project holds up to ${LINKS_LIMIT} links.`);
      return;
    }
    const name = link.title || shortAddress(link.url);
    saveLinks(
      withLink(project.links, link),
      (err) => `“${name}” didn’t save (${err.code || err.message}).`,
      // What you typed comes back, unless you're busy with another link.
      () => {
        if (!editingLink) openLinkForm(isNew ? null : link.id, typed);
      },
    );
    setLinksStatus('');
    closeLinkForm(link.id);
  });

  linkRemove.addEventListener('click', () => {
    if (!project || !editingLink || !editingLink.id) return;
    const link = project.links.find((l) => l.id === editingLink.id);
    if (!link) {
      closeLinkForm();
      return;
    }
    const name = link.title || shortAddress(link.url);
    saveLinks(withoutLink(project.links, link.id), (err) => `“${name}” wasn’t removed (${err.code || err.message}).`);
    closeLinkForm();
    setLinksStatus(`Removed “${name}”.`);
  });

  function drawLinks() {
    if (!project) return;
    const { links } = project;
    // While a link is being changed, its row is the form.
    if (editingLink && editingLink.id && !links.some((l) => l.id === editingLink.id)) editingLink.id = null;
    const formOpen = Boolean(editingLink);
    if (links.length < 2) reordering = false;
    drawFold(linksPanel, linksFold, linksOpen || formOpen, 'links');
    linksFold.hidden = formOpen;
    linksSummary.textContent = links.length ? `${links.length} ${links.length === 1 ? 'link' : 'links'}` : 'None yet';

    // What has focus in the list, to put it back after the redraw: which
    // row, and which part of it.
    const had = linksBody.contains(document.activeElement) && !linkForm.contains(document.activeElement) ? document.activeElement : null;
    const hadRow = had && had.closest('[data-link-row]');
    const hadId = hadRow && hadRow.dataset.linkRow;
    const hadPart = had && (had.dataset.linkMove || (had.hasAttribute('data-link-edit') ? 'edit' : 'link'));

    // The form leaves the list before it's redrawn, so what's typed in it
    // survives.
    if (linkForm.parentElement !== linkFormHome) linkFormHome.appendChild(linkForm);

    if (!links.length) {
      linksBody.innerHTML = formOpen ? '' : '<p class="side-empty">No links yet. Add one for things like a Drive folder of reference images.</p>';
    } else {
      const rows = links.map((link, i) => (editingLink && editingLink.id === link.id ? '<li class="link-item link-form-slot"></li>' : rowHTML(link, i, links.length))).join('');
      linksBody.innerHTML = `<ul class="links-list${reordering ? ' is-reordering' : ''}">${rows}</ul>`;
    }
    linkForm.hidden = !formOpen;
    if (formOpen) {
      const slot = linksBody.querySelector('.link-form-slot');
      if (slot) slot.appendChild(linkForm);
      else linksBody.appendChild(linkForm);
    }

    if (hadId) refocus(hadId, hadPart);

    linksReorder.hidden = formOpen || links.length < 2;
    linksReorder.textContent = reordering ? 'Done' : 'Reorder';
    linksReorder.setAttribute('aria-pressed', String(reordering));
    linksReorder.setAttribute('aria-label', reordering ? 'Done reordering links' : 'Reorder links');
    const full = links.length >= LINKS_LIMIT;
    linksAdd.hidden = formOpen || reordering;
    linksAdd.disabled = full;
    linksFull.hidden = !full || formOpen || reordering;
    linksFull.textContent = `A project holds up to ${LINKS_LIMIT} links. Remove one to add another.`;
  }

  // Focus back on the same part of the same row: the link, its pencil, or
  // a move button (the other one if this one is now greyed at the top or
  // bottom). If the row is gone, Add link.
  function refocus(id, part) {
    const row = linksBody.querySelector(`[data-link-row="${CSS.escape(id)}"]`);
    let target = null;
    if (row && (part === 'up' || part === 'down')) {
      const same = row.querySelector(`[data-link-move="${part}"]`);
      target = same && !same.disabled ? same : row.querySelector(`[data-link-move="${part === 'up' ? 'down' : 'up'}"]`);
    } else if (row) {
      target = part === 'edit' ? row.querySelector('[data-link-edit]') : row.querySelector('a') || row.querySelector('[data-link-edit]');
    }
    if (!target && row) target = row.querySelector('button, a');
    (target || linksAdd).focus();
  }

  function rowHTML(link, i, count) {
    const href = safeHref(link.url);
    const text = link.title || (href ? shortAddress(href) : link.url);
    const id = escapeHTML(link.id);
    if (reordering) {
      const label = escapeHTML(text);
      return `
        <li class="link-item" data-link-row="${id}">
          <span class="link-row">
            ${LINK_ICON}
            <span class="link-text"><span class="link-title${link.title ? '' : ' is-address'}">${label}</span></span>
          </span>
          <span class="link-moves">
            <button type="button" class="icon-button" data-link-move="up" data-link-id="${id}" aria-label="Move “${label}” up"${i === 0 ? ' disabled' : ''}>${UP_ICON}</button>
            <button type="button" class="icon-button" data-link-move="down" data-link-id="${id}" aria-label="Move “${label}” down"${i === count - 1 ? ' disabled' : ''}>${DOWN_ICON}</button>
          </span>
        </li>`;
    }
    const editButton = `<button type="button" class="icon-button link-edit" data-link-edit="${id}" aria-label="Edit link: ${escapeHTML(text)}">${PENCIL_ICON}</button>`;
    if (!href) {
      // Not an http(s) address: shown, never clickable.
      return `
        <li class="link-item" data-link-row="${id}">
          <span class="link-row is-broken">
            ${LINK_ICON}
            <span class="link-text">
              <span class="link-title${link.title ? '' : ' is-address'}">${escapeHTML(text)}</span>
              <span class="link-site">This address can’t be opened from here.</span>
            </span>
          </span>
          ${editButton}
        </li>`;
    }
    const site = link.title ? `<span class="link-site">${escapeHTML(siteOf(href))}</span>` : '';
    return `
      <li class="link-item" data-link-row="${id}">
        <a class="link-row" href="${escapeHTML(href)}" target="_blank" rel="noopener noreferrer">
          ${LINK_ICON}
          <span class="link-text">
            <span class="link-title${link.title ? '' : ' is-address'}">${escapeHTML(text)}</span>
            ${site}
          </span>
          ${OUT_ICON}
          <span class="visually-hidden"> (opens in a new tab)</span>
        </a>
        ${editButton}
      </li>`;
  }

  // ---- The page ----

  // Unsaved notes get the browser's own "Leave site?" question on reload
  // or closing the tab.
  window.addEventListener('beforeunload', (event) => {
    if (notesChanged()) {
      event.preventDefault();
      event.returnValue = '';
    }
  });

  // project: the project on the page (with notes and links), or null when
  // there isn't one (loading, or not there).
  function render(next) {
    if (!next) {
      if (project) leave();
      aside.hidden = true;
      return;
    }
    if (project && project.id !== next.id) leave();
    const first = !project;
    project = next;
    aside.hidden = false;
    if (first && drafts.has(project.id)) {
      // Notes you left unsaved come back as you left them.
      const { text, note } = drafts.get(project.id);
      drafts.delete(project.id);
      notesEditing = true;
      notesBase = project.notes;
      notesInput.value = text;
      showNotesError(note);
      drawNotes();
      countNotes();
      requestAnimationFrame(fitNotes);
    } else {
      drawNotes();
    }
    // The list holds still while a link's form is open, so its row stays
    // put under your cursor; it catches up when the form closes.
    if (!editingLink) drawLinks();
  }

  // Leaving the page (or going to another project): unsaved notes are
  // kept for when you come back; everything else starts fresh.
  function leave() {
    if (project && notesChanged()) drafts.set(project.id, { text: notesInput.value, note: 'Not saved yet.' });
    project = null;
    notesEditing = false;
    notesBase = '';
    notesOpen = false;
    linksOpen = false;
    reordering = false;
    editingLink = null;
    notesInput.value = '';
    showNotesError('');
    showLinkError('');
    setLinksStatus('');
    if (linkForm.parentElement !== linkFormHome) linkFormHome.appendChild(linkForm);
    linkForm.hidden = true;
    notesForm.hidden = true;
    notesView.hidden = false;
    notesEdit.hidden = false;
    linksBody.innerHTML = '';
    aside.hidden = true;
  }

  return {
    render,
    leave,
    // Signing out: unsaved notes left behind are dropped.
    forget() {
      drafts.clear();
    },
  };
}
