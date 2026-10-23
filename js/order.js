// Where each card sits within its zone, and within the Someday drawer.
//
// Every card has a sort key, and a zone lists its cards from the smallest key
// to the largest. A card you have never dragged has no stored order, so its
// key is its due date counted in days: untouched cards sit in date order.
// When you drop a card, it gets an `order` that falls between its new
// neighbors' keys. Since those keys are on the same scale as dates, a card
// you placed "above Friday" stays near Friday as new cards arrive and as days
// pass and cards drift into other zones.
//
// In Someday there are no dates, so an untouched card's key comes from when
// it was created instead, newest first.
//
// Changing a card's date any other way clears its order (app.js does this),
// so it falls back to date order in its new zone.

import { dayNumber } from './dates.js';

export function sortKey(card) {
  if (card.order !== null && card.order !== undefined) return card.order;
  return card.dueDate ? dayNumber(card.dueDate) : -card.createdAt;
}

// Two cards with the same key fall back to when they were created, then to
// their ids, so the order never depends on how Firestore happened to send
// them.
function compareWithKeys(a, keyA, b, keyB) {
  return keyA - keyB || a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export function compareCards(a, b) {
  return compareWithKeys(a, sortKey(a), b, sortKey(b));
}

// `list` is a zone's cards in the order you want them, with the dropped card
// at `index`. Returns a Map of card id to the order to save: always the
// dropped card's, plus any card below it that needs a nudge so the zone sorts
// exactly as `list` says (this happens when neighbors are tied, like two
// cards due the same day). A card dropped into an empty zone gets null:
// there is nothing to be in order with.
export function planDrop(list, index) {
  const orders = new Map();
  const moved = list[index];
  if (list.length === 1) {
    orders.set(moved.id, null);
    return orders;
  }

  const keys = list.map(sortKey);
  if (index === 0) keys[0] = keys[1] - 1;
  else if (index === list.length - 1) keys[index] = keys[index - 1] + 1;
  else keys[index] = (keys[index - 1] + keys[index + 1]) / 2;
  orders.set(moved.id, keys[index]);

  for (let i = 1; i < list.length; i++) {
    if (compareWithKeys(list[i - 1], keys[i - 1], list[i], keys[i]) < 0) continue;
    keys[i] = keys[i - 1] + nudge(keys[i - 1]);
    orders.set(list[i].id, keys[i]);
  }
  return orders;
}

// Small enough to stay within the same day, big enough that the computer can
// still tell the two numbers apart.
function nudge(key) {
  return Math.max(1 / 1024, Math.abs(key) * 1e-12);
}
