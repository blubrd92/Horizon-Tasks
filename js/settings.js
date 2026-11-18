// The Settings box, opened by the gear beside Sign out. Each setting saves
// the moment you change it. This file only shows the box and reports
// changes; app.js saves them.

import { QUICK_ADD_KEYS } from './model.js';

// What each quick add job is called in the menus.
const JOB_NAMES = {
  claude: 'Read with Claude',
  editor: 'Open in the editor',
  someday: 'Add to Someday',
  today: 'Add to Today',
};

// onChange(name, value) runs when a setting is changed. withClaude is
// false on a copy of Horizon with no backend, where Read with Claude isn't
// offered.
export function setupSettings({ onChange, withClaude = true }) {
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

  function open(settings) {
    show(settings);
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

  return { open, show, close: () => dialog.close() };
}
