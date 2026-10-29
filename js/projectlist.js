// The Projects list (from the Projects button) and the form that makes or
// changes a project. This file only shows them and reports what was asked
// for; app.js saves.

import { escapeHTML } from './board.js';
import { PROJECT_STATUS } from './model.js';
import { NAME_LIMIT, PROJECT_COLORS, endLine, findByName, listOrder, nextColor, openLine, projectHref } from './projects.js';

// onCreate({ name, color, endDate }) for a new project; onSave(id,
// changes) with only what changed; onArchive(id, archived);
// onDelete(id). deleteText(project) is the question Delete asks, with the
// project's card counts in it.
export function setupProjectList({ onCreate, onSave, onArchive, onDelete, deleteText }) {
  const list = document.getElementById('projects');
  const listBody = document.getElementById('projects-body');
  const listStatus = document.getElementById('projects-status');

  const form = document.getElementById('project-edit');
  const formEl = document.getElementById('project-edit-form');
  const heading = document.getElementById('project-edit-heading');
  const name = document.getElementById('project-name');
  const nameError = document.getElementById('project-name-error');
  const colors = document.getElementById('project-colors');
  const end = document.getElementById('project-end');
  const manage = document.getElementById('project-manage');
  const archive = document.getElementById('project-archive');
  const archiveNote = document.getElementById('project-archive-note');
  const confirm = document.getElementById('project-confirm');
  const confirmText = document.getElementById('project-confirm-text');
  const foot = document.getElementById('project-edit-foot');

  name.maxLength = NAME_LIMIT;

  // What the list was last drawn from: { projects, counts, today }.
  let state = null;
  let archivedOpen = false;
  // The project in the form (null for a new one), every project (to check
  // names against), and whether the list comes back when the form closes.
  let editing = null;
  let all = [];
  let backToList = false;

  // ---- The list ----

  function openList(next) {
    archivedOpen = false;
    listStatus.textContent = '';
    state = next;
    drawList();
    list.showModal();
  }

  // Live: projects and counts change while the list is open.
  function refresh(next) {
    state = next;
    if (list.open) drawList();
  }

  function drawList() {
    const { projects, counts, today } = state;
    const active = listOrder(projects.filter((p) => p.status === PROJECT_STATUS.ACTIVE));
    const archived = listOrder(projects.filter((p) => p.status === PROJECT_STATUS.ARCHIVED));
    const had = listBody.contains(document.activeElement) ? document.activeElement : null;
    const focusId = had && had.dataset.projectRow;
    const focusToggle = had && had.hasAttribute('data-archived-toggle');

    const row = (p) => `
      <li>
        <a class="project-row" href="${projectHref(p.id)}" data-project-row="${escapeHTML(p.id)}">
          <span class="project-swatch" style="background: ${escapeHTML(p.color)}"></span>
          <span class="project-row-text">
            <span class="project-row-name">${escapeHTML(p.name)}</span>
            <span class="project-row-line">${escapeHTML(endLine(p, today))} · ${openLine(counts.get(p.id) || 0)}</span>
          </span>
        </a>
      </li>`;

    let html = active.length
      ? `<ul class="projects-list">${active.map(row).join('')}</ul>`
      : `<p class="projects-empty">${
          archived.length ? 'No active projects.' : 'No projects yet. A project gathers the cards that belong together, like a display or a program series.'
        }</p>`;
    if (archived.length) {
      html += `
        <div class="projects-archived">
          <div class="projects-archived-head">
            <span>${archived.length} archived</span>
            <button type="button" class="button button-small" data-archived-toggle aria-expanded="${archivedOpen}"${archivedOpen ? ' aria-controls="projects-archived-list"' : ''}>${archivedOpen ? 'Hide' : 'Show'}</button>
          </div>
          ${archivedOpen ? `<ul id="projects-archived-list" class="projects-list is-archived">${archived.map(row).join('')}</ul>` : ''}
        </div>`;
    }
    listBody.innerHTML = html;

    if (focusId) {
      const again = listBody.querySelector(`[data-project-row="${CSS.escape(focusId)}"]`);
      if (again) again.focus();
    } else if (focusToggle) {
      const again = listBody.querySelector('[data-archived-toggle]');
      if (again) again.focus();
    }
  }

  listBody.addEventListener('click', (event) => {
    if (event.target.closest('[data-archived-toggle]')) {
      archivedOpen = !archivedOpen;
      drawList();
      return;
    }
    // The link changes the address and app.js shows the page; the list
    // gets out of the way (even for the page you're already on).
    if (event.target.closest('[data-project-row]')) list.close();
  });

  document.getElementById('projects-close').addEventListener('click', () => list.close());
  list.addEventListener('click', (event) => {
    if (event.target === list) list.close();
  });
  document.getElementById('projects-new').addEventListener('click', () => {
    const projects = state ? state.projects : [];
    list.close();
    openForm(null, projects, true);
  });

  // ---- The form ----

  // The color choices: the eight swatches, plus the project's own color if
  // it was set to something else in the console.
  function fillColors(selected) {
    const choices = [...PROJECT_COLORS];
    if (!choices.some((c) => c.color.toUpperCase() === selected.toUpperCase())) choices.push({ name: 'Its current color', color: selected });
    colors.innerHTML = choices
      .map(
        (c) => `
        <label class="swatch-choice" title="${escapeHTML(c.name)}">
          <input type="radio" name="project-color" value="${escapeHTML(c.color)}">
          <span class="swatch-dot" style="background: ${escapeHTML(c.color)}" aria-hidden="true"></span>
          <span class="visually-hidden">${escapeHTML(c.name)}</span>
        </label>`,
      )
      .join('');
    const match = [...colors.querySelectorAll('input')].find((input) => input.value.toUpperCase() === selected.toUpperCase());
    if (match) match.checked = true;
  }

  function chosenColor() {
    const checked = colors.querySelector('input:checked');
    return checked ? checked.value : PROJECT_COLORS[0].color;
  }

  // project is null for a new one. fromList: the list comes back after.
  function openForm(project, projects, fromList = false) {
    editing = project;
    all = projects;
    backToList = fromList;
    heading.textContent = project ? 'Edit project' : 'New project';
    name.value = project ? project.name : '';
    hideNameError();
    fillColors(project ? project.color : nextColor(projects));
    end.value = project && project.endDate ? project.endDate : '';
    manage.hidden = !project;
    archiveNote.hidden = !project;
    if (project) {
      const archived = project.status === PROJECT_STATUS.ARCHIVED;
      archive.textContent = archived ? 'Unarchive project' : 'Archive project';
      archiveNote.textContent = archived
        ? 'Archived: folded away at the bottom of the list. Unarchive puts it back.'
        : "Archive it when you're finished: it folds away on the list, and any cards left stay where they are.";
    }
    showConfirm(false);
    form.showModal();
    name.focus();
  }

  function showNameError(text) {
    nameError.textContent = text;
    nameError.hidden = false;
    name.setAttribute('aria-invalid', 'true');
    name.setAttribute('aria-describedby', 'project-name-error');
    name.focus();
  }

  function hideNameError() {
    nameError.hidden = true;
    name.removeAttribute('aria-invalid');
  }

  function showConfirm(on) {
    confirm.hidden = !on;
    foot.hidden = on;
    manage.hidden = on || !editing;
    archiveNote.hidden = on || !editing;
  }

  name.addEventListener('input', () => {
    if (!nameError.hidden) hideNameError();
  });

  document.getElementById('project-noend').addEventListener('click', () => {
    end.value = '';
    end.focus();
  });

  formEl.addEventListener('submit', (event) => {
    event.preventDefault();
    const newName = name.value.trim();
    if (!newName) {
      showNameError('A project needs a name.');
      return;
    }
    const twin = findByName(all, newName, editing ? editing.id : null);
    if (twin) {
      showNameError(`You already have a project called “${twin.name}”${twin.status === PROJECT_STATUS.ARCHIVED ? ' (archived)' : ''}.`);
      return;
    }
    const values = { name: newName, color: chosenColor(), endDate: end.value || null };
    if (!editing) {
      onCreate(values);
    } else {
      const changes = {};
      for (const [key, value] of Object.entries(values)) {
        if (value !== editing[key]) changes[key] = value;
      }
      if (Object.keys(changes).length) onSave(editing.id, changes);
    }
    closeForm();
  });

  archive.addEventListener('click', () => {
    if (!editing) return;
    onArchive(editing.id, editing.status !== PROJECT_STATUS.ARCHIVED);
    closeForm();
  });

  document.getElementById('project-delete').addEventListener('click', () => {
    if (!editing) return;
    confirmText.textContent = deleteText(editing);
    showConfirm(true);
    document.getElementById('project-confirm-keep').focus();
  });
  document.getElementById('project-confirm-keep').addEventListener('click', () => {
    showConfirm(false);
    document.getElementById('project-delete').focus();
  });
  document.getElementById('project-confirm-delete').addEventListener('click', () => {
    const project = editing;
    backToList = false;
    closeForm();
    if (project) onDelete(project.id);
  });

  document.getElementById('project-edit-x').addEventListener('click', closeForm);
  document.getElementById('project-edit-cancel').addEventListener('click', closeForm);
  form.addEventListener('click', (event) => {
    if (event.target === form) closeForm();
  });

  function closeForm() {
    if (form.open) form.close();
  }

  // Closing the form by any route (Escape too) brings the list back if it
  // came from there.
  form.addEventListener('close', () => {
    editing = null;
    if (backToList && state) {
      backToList = false;
      list.showModal();
      drawList();
    }
  });

  return {
    openList,
    refresh,
    openForm,
    // A line at the top of the list: what was just made, or what failed.
    showListStatus(text) {
      listStatus.textContent = text;
    },
    close() {
      backToList = false;
      if (form.open) form.close();
      if (list.open) list.close();
    },
  };
}
