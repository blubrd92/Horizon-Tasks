// The small "Move to This Week" box that opens when a card is dropped on a
// zone spanning several days. ask() resolves with the chosen "YYYY-MM-DD"
// date, or with null if you cancel. This file never saves anything.

export function setupDatePick() {
  const dialog = document.getElementById('datepick');
  const form = document.getElementById('datepick-form');
  const heading = document.getElementById('datepick-heading');
  const cardTitle = document.getElementById('datepick-card');
  const input = document.getElementById('datepick-date');
  const range = document.getElementById('datepick-range');

  let resolve = null;

  function ask({ title, card, rangeText, preset }) {
    finish(null);
    heading.textContent = title;
    cardTitle.textContent = `“${card}”`;
    range.textContent = rangeText;
    input.value = preset;
    dialog.showModal();
    input.focus();
    return new Promise((r) => {
      resolve = r;
    });
  }

  function finish(value) {
    const r = resolve;
    resolve = null;
    if (dialog.open) dialog.close();
    if (r) r(value);
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!input.value) {
      input.focus();
      return;
    }
    finish(input.value);
  });

  document.getElementById('datepick-cancel').addEventListener('click', () => finish(null));
  // Escape, or a click on the dimmed board around the box.
  dialog.addEventListener('close', () => finish(null));
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) finish(null);
  });

  return { ask, cancel: () => finish(null) };
}
