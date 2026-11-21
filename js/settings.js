// The Settings box, opened by the gear beside Sign out. Each setting saves
// the moment you change it. This file only shows the box and reports
// changes; app.js saves them.

import { escapeHTML } from './board.js';
import {
  CATEGORY_COLORS,
  MAX_ACTIVE,
  activeOf,
  addCategory,
  changeCategory,
  deleteCategory,
  moveCategory,
  nextColor,
  orderCategories,
  restoreCategory,
  retireCategory,
  retiredOf,
} from './categories.js';
import { QUICK_ADD_KEYS } from './model.js';
import { startSort } from './sortable.js';

// What each quick add job is called in the menus.
const JOB_NAMES = {
  claude: 'Read with Claude',
  editor: 'Open in the editor',
  someday: 'Add to Someday',
  today: 'Add to Today',
};

// onChange(name, value) runs when a setting is changed. withClaude is
// false on a copy of Horizon with no backend, where Read with Claude isn't
// offered. onCategories(list) saves a changed category list and returns
// the save (a promise); categoryInUse(id) asks Firestore whether any card
// or draft has that category (a promise of true or false).
export function setupSettings({ onChange, withClaude = true, onCategories, categoryInUse }) {
  const dialog = document.getElementById('settings');
  const fold = document.getElementById('setting-fold');
  const yearStart = document.getElementById('setting-year-start');
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  yearStart.innerHTML = months.map((name, i) => `<option value="${i + 1}">${name}</option>`).join('');

  // The quick add keys: one menu per key, the same jobs in each.
  const jobs = Object.keys(JOB_NAMES).filter((job) => withClaude || job !== 'claude');
  const keyMenus = {};
  for (const key of Object.keys(QUICK_ADD_KEYS)) {
    const menu = document.getElementById(`setting-key-${key}`);
    menu.innerHTML = jobs.map((job) => `<option value="${job}">${JOB_NAMES[job]}</option>`).join('');
    menu.addEventListener('change', () => {
      const all = {};
      for (const [k, m] of Object.entries(keyMenus)) all[k] = m.value;
      onChange('quickAddKeys', all);
    });
    keyMenus[key] = menu;
  }
  document.getElementById('setting-keys-note').hidden = !withClaude;
  // On a Mac the keys go by their Mac names.
  if (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) {
    dialog.querySelector('[data-key="alt"]').textContent = 'Option+Enter';
    dialog.querySelector('[data-key="ctrl"]').textContent = 'Cmd+Enter';
  }

  const categoryList = setupCategories({ dialog, onCategories, categoryInUse });

  // The tabs: General, Quick add, Categories. Only the chosen one's pane
  // shows; the arrow keys, Home, and End move between tabs, as screen
  // reader users expect. Settings opens on the tab you last used.
  const body = document.getElementById('settings-body');
  const tabs = [...dialog.querySelectorAll('[role="tab"]')];
  let tabId = tabs[0].id;

  function selectTab(id, { focus = false } = {}) {
    tabId = id;
    for (const tab of tabs) {
      const on = tab.id === id;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      document.getElementById(tab.getAttribute('aria-controls')).hidden = !on;
      if (on && focus) tab.focus();
    }
    body.scrollTop = 0;
  }

  for (const tab of tabs) {
    tab.addEventListener('click', () => selectTab(tab.id));
    tab.addEventListener('keydown', (event) => {
      const at = tabs.indexOf(tab);
      const to = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: tabs.length - 1 }[event.key];
      if (to === undefined) return;
      event.preventDefault();
      selectTab(tabs[(to + tabs.length) % tabs.length].id, { focus: true });
    });
  }

  function open(settings, categories) {
    show(settings);
    categoryList.show(categories);
    selectTab(tabId);
    dialog.showModal();
  }

  // Puts the controls back as saved (when a save is refused).
  function show(settings) {
    fold.checked = settings.foldLongZones;
    yearStart.value = String(settings.yearStart);
    for (const [key, menu] of Object.entries(keyMenus)) {
      const job = settings.quickAddKeys[key];
      // Without a backend, a key saved as Read with Claude opens the editor.
      menu.value = jobs.includes(job) ? job : 'editor';
    }
  }

  fold.addEventListener('change', () => onChange('foldLongZones', fold.checked));
  yearStart.addEventListener('change', () => onChange('yearStart', Number(yearStart.value)));

  document.getElementById('settings-close').addEventListener('click', () => dialog.close());
  document.getElementById('settings-done').addEventListener('click', () => dialog.close());
  // A click on the dimmed board around the box.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  return { open, show, showCategories: categoryList.show, close: () => dialog.close() };
}

// The Categories section: a row per active category (drag it by the
// handle on its left to move it, or press Alt with the up or down arrow on
// its name; the name opens it for changing), Add a category, and the retired
// ones, folded. One box (the form) at a time, moved in place of the row
// it changes. Every change saves at once; the list redraws from the
// result, and again whenever the categories change on another device.
function setupCategories({ dialog, onCategories, categoryInUse }) {
  const listEl = document.getElementById('category-list');
  const addButton = document.getElementById('category-add');
  const countEl = document.getElementById('category-count');
  const retiredBox = document.getElementById('category-retired');
  const retiredCount = document.getElementById('category-retired-count');
  const retiredToggle = document.getElementById('category-retired-toggle');
  const retiredList = document.getElementById('category-retired-list');
  const status = document.getElementById('category-status');
  const form = document.getElementById('category-form');
  const nameInput = document.getElementById('category-name');
  const nameError = document.getElementById('category-name-error');
  const colors = document.getElementById('category-colors');
  const retireButton = document.getElementById('category-retire');
  const saveButton = document.getElementById('category-save');
  const formHome = form.parentElement;

  let list = [];
  // What the form is doing: null (closed), { id } changing that category,
  // or { id: null } adding one.
  let editing = null;
  let retiredOpen = false;
  // Retired ones being checked before a delete, by id.
  const checking = new Set();

  const pencil =
    '<svg class="category-pencil" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"></path><path d="M13.5 6.5l4 4"></path></svg>';
  // The six dots, as on a checklist item.
  const handle =
    '<span class="category-handle" title="Drag to move" aria-hidden="true"><svg width="12" height="18" viewBox="0 0 12 18" fill="currentColor"><circle cx="3" cy="3" r="1.6"></circle><circle cx="9" cy="3" r="1.6"></circle><circle cx="3" cy="9" r="1.6"></circle><circle cx="9" cy="9" r="1.6"></circle><circle cx="3" cy="15" r="1.6"></circle><circle cx="9" cy="15" r="1.6"></circle></svg></span>';
  const dot = (c) => `<span class="category-dot" style="background: ${escapeHTML(c.color)}" aria-hidden="true"></span>`;

  // A row's controls, found by what they do and which category: so focus
  // can go back to the same control after the list redraws.
  function controlKey(el) {
    if (!el || !el.dataset) return null;
    for (const name of ['catEdit', 'catRestore', 'catDelete']) {
      if (el.dataset[name]) return { name, id: el.dataset[name] };
    }
    return null;
  }

  function findControl({ name, id }) {
    const attr = name.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
    return dialog.querySelector(`[data-${attr}="${CSS.escape(id)}"]`);
  }

  function draw() {
    const had = document.activeElement;
    const key = listEl.contains(had) || retiredList.contains(had) ? controlKey(had) : null;
    const typing = form.contains(had) ? had : null;
    const selection = typing === nameInput ? [nameInput.selectionStart, nameInput.selectionEnd] : null;
    // Out of the list before it's redrawn, so it isn't thrown away.
    formHome.append(form);

    const active = activeOf(list);
    const retired = retiredOf(list);
    if (editing && editing.id && !active.some((c) => c.id === editing.id)) {
      closeForm();
      say('That category changed on another device, so the box closed.');
    }

    listEl.innerHTML = active.length
      ? active
          .map(
            (c, i) => `
        <li class="category-row" data-category-row="${escapeHTML(c.id)}">
          ${handle}
          <button type="button" class="category-name-button" data-cat-edit="${escapeHTML(c.id)}" aria-label="Change ${escapeHTML(c.name)}, ${i + 1} of ${active.length}" aria-describedby="category-move-help">
            ${dot(c)}<span class="category-name">${escapeHTML(c.name)}</span>${pencil}
          </button>
        </li>`,
          )
          .join('')
      : '<li class="category-empty">No categories. Cards show \u201cNo category\u201d until you add one.</li>';

    if (editing) {
      const row = editing.id ? listEl.querySelector(`[data-category-row="${CSS.escape(editing.id)}"]`) : null;
      if (row) {
        row.classList.add('is-open');
        row.replaceChildren(form);
      } else {
        const li = document.createElement('li');
        li.className = 'category-row is-open';
        li.append(form);
        if (!active.length) listEl.replaceChildren();
        listEl.append(li);
      }
    }

    const full = active.length >= MAX_ACTIVE;
    addButton.disabled = full || Boolean(editing && !editing.id);
    countEl.textContent = full ? `${MAX_ACTIVE} is the most. Retire one to add another.` : `${active.length} of ${MAX_ACTIVE}`;
    countEl.classList.toggle('is-full', full);

    retiredBox.hidden = !retired.length;
    retiredCount.textContent = `${retired.length} retired`;
    retiredToggle.textContent = retiredOpen ? 'Hide' : 'Show';
    retiredToggle.setAttribute('aria-expanded', String(retiredOpen));
    retiredList.hidden = !retiredOpen || !retired.length;
    retiredList.innerHTML = retired
      .map(
        (c) => `
        <li class="category-row is-retired">
          ${dot(c)}<span class="category-name">${escapeHTML(c.name)}</span>
          <span class="category-retired-actions">
          <button type="button" class="button button-small" data-cat-restore="${escapeHTML(c.id)}" aria-label="Bring back ${escapeHTML(c.name)}"${full ? ' disabled' : ''}>Bring back</button>
          <button type="button" class="button button-small" data-cat-delete="${escapeHTML(c.id)}" aria-label="Delete ${escapeHTML(c.name)}"${checking.has(c.id) ? ' aria-disabled="true"' : ''}>${checking.has(c.id) ? 'Checking\u2026' : 'Delete'}</button>
          </span>
        </li>`,
      )
      .join('');

    if (typing && form.isConnected) {
      typing.focus();
      if (selection) nameInput.setSelectionRange(...selection);
    } else if (key) {
      const again = findControl(key);
      if (again && !again.disabled) again.focus();
    }
  }

  // Shows the list from Firestore (or as just changed here).
  function show(next) {
    list = next || [];
    draw();
  }

  function say(text) {
    status.textContent = text;
  }

  // Changes the list here at once and saves it; if the save is refused,
  // Firestore sends the old list back and the line says why.
  function commit(next, message) {
    list = next;
    say(message);
    draw();
    Promise.resolve(onCategories(next)).catch((err) => {
      say(`That change didn't save, so the list is back as it was (${err.code || err.message}).`);
    });
  }

  // ---- The form ----

  function fillColors(selected) {
    const choices = [...CATEGORY_COLORS];
    if (!choices.some((c) => c.color.toUpperCase() === selected.toUpperCase())) choices.push({ name: 'Its current color', color: selected });
    colors.innerHTML = choices
      .map(
        (c) => `
        <label class="swatch-choice" title="${escapeHTML(c.name)}">
          <input type="radio" name="category-color" value="${escapeHTML(c.color)}">
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
    return checked ? checked.value : CATEGORY_COLORS[0].color;
  }

  function openForm(id) {
    const category = id ? list.find((c) => c.id === id) : null;
    editing = { id: category ? category.id : null };
    nameInput.value = category ? category.name : '';
    fillColors(category ? category.color : nextColor(list));
    showNameError('');
    retireButton.hidden = !category;
    saveButton.textContent = category ? 'Save' : 'Add';
    form.setAttribute('aria-label', category ? `Change ${category.name}` : 'New category');
    form.hidden = false;
    say('');
    draw();
    nameInput.focus();
    if (category) nameInput.select();
  }

  function closeForm() {
    editing = null;
    form.hidden = true;
    formHome.append(form);
  }

  // Back to where you were: the row's name, or Add a category.
  function cancelForm() {
    const id = editing && editing.id;
    closeForm();
    draw();
    focusAfter(id);
  }

  function focusAfter(id) {
    const target = id ? findControl({ name: 'catEdit', id }) : null;
    const fallback = !addButton.disabled ? addButton : !retiredBox.hidden ? retiredToggle : document.getElementById('settings-done');
    (target || fallback).focus();
  }

  function showNameError(text) {
    nameError.textContent = text;
    nameError.hidden = !text;
    nameInput.setAttribute('aria-invalid', text ? 'true' : 'false');
  }

  nameInput.addEventListener('input', () => showNameError(''));

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!editing) return;
    const values = { name: nameInput.value, color: chosenColor() };
    const id = editing.id;
    const result = id ? changeCategory(list, id, values) : addCategory(list, values);
    if (result.error) {
      showNameError(result.error);
      nameInput.focus();
      return;
    }
    const savedId = id || result.list[result.list.length - 1].id;
    const saved = result.list.find((c) => c.id === savedId);
    closeForm();
    commit(result.list, id ? `Saved \u201c${saved.name}\u201d.` : `Added \u201c${saved.name}\u201d.`);
    focusAfter(savedId);
  });

  document.getElementById('category-cancel').addEventListener('click', cancelForm);

  retireButton.addEventListener('click', () => {
    if (!editing || !editing.id) return;
    const id = editing.id;
    const category = list.find((c) => c.id === id);
    const result = retireCategory(list, id);
    if (result.error) {
      showNameError(result.error);
      return;
    }
    const place = activeOf(list).findIndex((c) => c.id === id);
    closeForm();
    commit(result.list, `Retired \u201c${category.name}\u201d. Its cards keep it, and you can bring it back from the retired list.`);
    // Focus goes to the row that took its place, or the one above.
    const active = activeOf(list);
    const next = active[Math.min(place, active.length - 1)];
    focusAfter(next ? next.id : null);
  });

  // Escape closes the box, not Settings.
  form.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      cancelForm();
    }
  });
  dialog.addEventListener('cancel', (event) => {
    // Only when the box is on screen (its tab is showing).
    if (editing && form.getClientRects().length) {
      event.preventDefault();
      cancelForm();
    }
  });
  // Closing Settings drops anything half typed.
  dialog.addEventListener('close', () => {
    if (editing) closeForm();
    say('');
  });

  // ---- The rows ----

  addButton.addEventListener('click', () => openForm(null));

  listEl.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button || !listEl.contains(button) || form.contains(button)) return;
    const { catEdit } = button.dataset;
    if (catEdit) openForm(catEdit);
  });

  // Moving: drag a row by its handle (sortable.js), or press Alt with the
  // up or down arrow on its name. Either saves at once, like every change
  // here, and the line says where it went.
  function moved(id, result) {
    const active = activeOf(result.list);
    const at = active.findIndex((c) => c.id === id);
    if (at === -1) return;
    commit(result.list, `Moved \u201c${active[at].name}\u201d to ${at + 1} of ${active.length}.`);
  }

  listEl.addEventListener('pointerdown', (event) => {
    const grip = event.target.closest('.category-handle');
    if (!grip || event.button !== 0) return;
    const row = grip.closest('[data-category-row]');
    if (!row) return;
    startSort(listEl, row, event, {
      idOf: (li) => li.dataset.categoryRow || null,
      onDrop: (ids) => moved(row.dataset.categoryRow, orderCategories(list, ids)),
    });
  });

  listEl.addEventListener('keydown', (event) => {
    const button = event.target.closest('[data-cat-edit]');
    if (!button || !event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    event.preventDefault();
    const id = button.dataset.catEdit;
    const result = moveCategory(list, id, event.key === 'ArrowUp' ? -1 : 1);
    if (result.list !== list) moved(id, result);
  });

  retiredToggle.addEventListener('click', () => {
    retiredOpen = !retiredOpen;
    draw();
  });

  retiredList.addEventListener('click', async (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    const { catRestore, catDelete } = button.dataset;
    if (catRestore) {
      const category = list.find((c) => c.id === catRestore);
      const result = restoreCategory(list, catRestore);
      if (result.error) {
        say(result.error);
        return;
      }
      commit(result.list, `Brought back \u201c${category.name}\u201d.`);
      if (!retiredOf(list).length) retiredOpen = false;
      draw();
      focusAfter(catRestore);
      return;
    }
    if (!catDelete || checking.has(catDelete)) return;
    const category = list.find((c) => c.id === catDelete);
    if (!category) return;
    checking.add(catDelete);
    say(`Checking whether any card has \u201c${category.name}\u201d\u2026`);
    draw();
    let used;
    try {
      used = await categoryInUse(catDelete);
    } catch (err) {
      checking.delete(catDelete);
      say(`Couldn't check whether any card has \u201c${category.name}\u201d (${err.code || err.message}), so it stays retired. Try again when you're online.`);
      draw();
      return;
    }
    checking.delete(catDelete);
    // The list may have changed while Firestore was asked.
    const still = list.find((c) => c.id === catDelete);
    if (!still || !still.retired) {
      draw();
      return;
    }
    if (used) {
      say(`Cards have \u201c${category.name}\u201d, so it stays retired: they keep its name and color.`);
      draw();
      return;
    }
    commit(deleteCategory(list, catDelete).list, `Deleted \u201c${category.name}\u201d. No card had it.`);
    if (!retiredOf(list).length) retiredOpen = false;
    draw();
    // Its Delete button is gone; focus goes on if it was there.
    if (dialog.open && !dialog.contains(document.activeElement)) focusAfter(null);
  });

  return { show };
}
