// The right-click menu on a card: Waiting and Hard deadline, turned on or
// off at once, and "Follow-up..." (which opens the editor with Follow-up
// on, since a follow-up needs words a menu can't take). A shortcut, never
// the only way: everything in it is also in the editor.
//
// On the board, in the Someday drawer, and on a project page. The Menu key
// or Shift+F10 on a focused card opens it too, as a real menu: the arrow
// keys move, Enter or Space chooses, Escape goes back to the card. Not on
// a card's project link (the browser's own menu, with "Open in new tab",
// stays there), not on a touch screen (press and hold lifts a card to drag
// it), and not while a card is being dragged.
//
// getCard(cardId) returns the card, or null. onToggle(cardId, 'waiting' or
// 'hard') saves the change. onFollowUp(cardId) opens the editor.

import { THEN_ICON, WAIT_ICON } from './board.js';
import { isWaiting } from './followup.js';

const CHECK =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"></path></svg>';
const FLAG =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 21V4"></path><path d="M5 4h11l-2 4 2 4H5"></path></svg>';
const GAP = 4; // pixels between the menu and the screen's edge

export function setupCardMenu({ roots, getCard, onToggle, onFollowUp }) {
  const menu = document.createElement('div');
  menu.className = 'card-menu';
  menu.setAttribute('role', 'menu');
  menu.hidden = true;
  document.body.append(menu);

  // The card the menu is for, and whether the keyboard opened it (focus
  // goes back to the card when it closes).
  let cardId = null;
  let fromKeyboard = false;
  // The last pointer pressed, for browsers whose contextmenu event doesn't
  // say whether a finger made it.
  let lastPointer = { type: 'mouse', at: 0 };

  document.addEventListener(
    'pointerdown',
    (event) => {
      lastPointer = { type: event.pointerType, at: performance.now() };
      if (!menu.hidden && !menu.contains(event.target)) close(false);
    },
    true,
  );
  window.addEventListener('scroll', () => close(false), true);
  window.addEventListener('resize', () => close(false));
  window.addEventListener('blur', () => close(false));

  for (const root of roots) {
    root.addEventListener('contextmenu', (event) => {
      const cardEl = event.target.closest('.card[data-drag-id]');
      if (!cardEl || !root.contains(cardEl)) return;
      // The project link keeps the browser's menu.
      if (event.target.closest('a')) return;
      if (document.body.classList.contains('is-dragging')) return;
      const touch = event.pointerType
        ? event.pointerType === 'touch'
        : lastPointer.type === 'touch' && performance.now() - lastPointer.at < 1500;
      if (touch) return;
      const card = getCard(cardEl.dataset.dragId);
      if (!card) return;
      event.preventDefault();
      // A right click is button 2; the Menu key and Shift+F10 aren't.
      open(card, cardEl, event.button !== 2 ? null : { x: event.clientX, y: event.clientY });
    });
  }

  function open(card, cardEl, at) {
    cardId = card.id;
    fromKeyboard = !at;
    const waiting = isWaiting(card);
    const hard = card.deadlineType === 'hard';
    menu.setAttribute('aria-label', card.title);
    menu.innerHTML = `
      <button type="button" class="card-menu-item" role="menuitemcheckbox" aria-checked="${waiting}" data-menu="waiting" tabindex="-1">
        <span class="card-menu-check">${waiting ? CHECK : ''}</span>${WAIT_ICON(14)}<span>Waiting</span>
      </button>
      <button type="button" class="card-menu-item" role="menuitemcheckbox" aria-checked="${hard}" data-menu="hard" tabindex="-1">
        <span class="card-menu-check">${hard ? CHECK : ''}</span>${FLAG}<span>Hard deadline</span>
      </button>
      <div class="card-menu-rule" role="separator"></div>
      <button type="button" class="card-menu-item" role="menuitem" data-menu="follow" tabindex="-1">
        <span class="card-menu-check"></span>${THEN_ICON(14)}<span>${card.followUp ? 'Edit follow-up' : 'Follow-up'}…</span>
      </button>`;
    menu.hidden = false;
    place(at || keyboardSpot(cardEl));
    items()[0].focus();
  }

  // Opened from the keyboard: just under the card's title.
  function keyboardSpot(cardEl) {
    const title = cardEl.querySelector('.card-title') || cardEl;
    const r = title.getBoundingClientRect();
    return { x: r.left, y: r.bottom + 4 };
  }

  // At the pointer, flipped left or up when it would leave the screen.
  function place({ x, y }) {
    const w = menu.offsetWidth;
    const h = menu.offsetHeight;
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const left = x + w + GAP > vw ? Math.max(GAP, x - w) : x;
    const top = y + h + GAP > vh ? Math.max(GAP, y - h) : y;
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
  }

  function items() {
    return [...menu.querySelectorAll('.card-menu-item')];
  }

  // refocus: put focus back on the card (when the keyboard opened the
  // menu, or a choice was made with it).
  function close(refocus) {
    if (menu.hidden) return;
    menu.hidden = true;
    const id = cardId;
    cardId = null;
    if (refocus && id) focusCard(id);
  }

  // The board redraws when Firestore sends news, which replaces the card's
  // button; so it's looked up now, and once more a moment later.
  function focusCard(id) {
    const find = () =>
      roots
        .map((root) => root.querySelector(`[data-card-id="${CSS.escape(id)}"]`))
        .find((el) => el && el.getClientRects().length);
    const button = find();
    if (button) button.focus();
    setTimeout(() => {
      if (document.activeElement && document.activeElement !== document.body) return;
      const again = find();
      if (again) again.focus();
    }, 60);
  }

  menu.addEventListener('click', (event) => {
    const item = event.target.closest('[data-menu]');
    if (!item || !cardId) return;
    const id = cardId;
    const keyboard = fromKeyboard || event.detail === 0;
    const what = item.dataset.menu;
    if (what === 'follow') {
      close(false);
      onFollowUp(id);
      return;
    }
    close(keyboard);
    onToggle(id, what);
  });

  menu.addEventListener('keydown', (event) => {
    const list = items();
    const at = list.indexOf(document.activeElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      list[(at + step + list.length) % list.length].focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      list[event.key === 'Home' ? 0 : list.length - 1].focus();
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      // Escape anywhere else on the page goes on as usual.
      event.stopPropagation();
      close(true);
    }
  });

  return { close: () => close(false) };
}

