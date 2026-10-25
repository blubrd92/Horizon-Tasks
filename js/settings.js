// The Settings box, opened by the gear beside Sign out. Each setting saves
// the moment you change it. This file only shows the box and reports
// changes; app.js saves them.

// onChange(name, value) runs when a setting is changed.
export function setupSettings({ onChange }) {
  const dialog = document.getElementById('settings');
  const fold = document.getElementById('setting-fold');

  function open(settings) {
    fold.checked = settings.foldLongZones;
    dialog.showModal();
  }

  // Puts a checkbox back (when a save is refused).
  function show(settings) {
    fold.checked = settings.foldLongZones;
  }

  fold.addEventListener('change', () => onChange('foldLongZones', fold.checked));

  document.getElementById('settings-close').addEventListener('click', () => dialog.close());
  document.getElementById('settings-done').addEventListener('click', () => dialog.close());
  // A click on the dimmed board around the box.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  return { open, show, close: () => dialog.close() };
}
