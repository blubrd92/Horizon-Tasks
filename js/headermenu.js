// The board header's menu on a phone (600 pixels wide or narrower): the
// header's buttons (Projects, What you did, Inbox, Settings, Sign out) fold
// into one menu button beside the name, and open as a list below it. On a
// wider screen the menu button is hidden by the CSS and the buttons sit in
// a row, so none of this does anything there.
//
// The menu closes when you choose something in it, press Escape, tap
// outside it, or the screen grows wider than a phone.

const PHONE = window.matchMedia('(max-width: 600px)');

export function setupHeaderMenu({ button, menu }) {
  function open() {
    menu.classList.add('is-open');
    button.setAttribute('aria-expanded', 'true');
  }

  function close({ refocus = false } = {}) {
    if (!menu.classList.contains('is-open')) return;
    menu.classList.remove('is-open');
    button.setAttribute('aria-expanded', 'false');
    if (refocus) button.focus();
  }

  button.addEventListener('click', () => {
    if (menu.classList.contains('is-open')) close();
    else open();
  });

  // Choosing anything in the menu closes it (the choice itself still
  // happens: the Inbox opens, the Projects list opens, and so on).
  menu.addEventListener('click', (event) => {
    if (event.target.closest('button, a')) close();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menu.classList.contains('is-open')) {
      event.preventDefault();
      close({ refocus: true });
    }
  });

  // A tap anywhere else closes it.
  document.addEventListener('pointerdown', (event) => {
    if (!menu.classList.contains('is-open')) return;
    if (menu.contains(event.target) || button.contains(event.target)) return;
    close();
  });

  PHONE.addEventListener('change', () => close());

  return { close };
}
