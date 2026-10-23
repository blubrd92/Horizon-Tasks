// The Someday drawer: a tab on the right edge with the count of undated
// cards, which opens a column listing them. board.js draws the cards into
// it; this file only opens, closes, and keeps the count.

export function setupSomeday({ tab, panel, counts }) {
  // Matches the CSS: below this width the open drawer covers the board.
  const narrow = window.matchMedia('(max-width: 760px)');
  let count = 0;

  function setOpen(open) {
    panel.hidden = !open;
    tab.setAttribute('aria-expanded', String(open));
    tab.classList.toggle('is-open', open);
    label();
  }

  function label() {
    const cards = `${count} undated ${count === 1 ? 'card' : 'cards'}`;
    tab.setAttribute('aria-label', `${panel.hidden ? 'Open' : 'Close'} Someday drawer, ${cards}`);
  }

  tab.addEventListener('click', () => setOpen(panel.hidden));

  return {
    open: () => setOpen(true),
    close: () => setOpen(false),
    // True when the open drawer is covering the board (on a phone).
    coversBoard: () => !panel.hidden && narrow.matches,
    setCount(n) {
      count = n;
      for (const el of counts) {
        el.textContent = String(n);
        if (el.hasAttribute('aria-label')) el.setAttribute('aria-label', `${n} ${n === 1 ? 'card' : 'cards'}`);
      }
      label();
    },
  };
}
