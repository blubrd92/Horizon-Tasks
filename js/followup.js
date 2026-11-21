// Waiting and follow-ups: the rules, with no Firebase and no page.
//
// Waiting: the next move on a card is someone else's. The card remembers
// the day you turned it on (waitingSince, the board's today then) and
// counts the days from it, so the mark ages where you can see it.
//
// Follow-up: the card that comes after this one. Written ahead in the
// editor (a title, and a date if you know it), it's made when this one is
// marked done. With both, nothing is asked; with either missing, the
// editor asks then. The two cards are linked in a chain: every card in it
// shares chainId (the first card's id), and each remembers the card it
// followed (afterId, with a copy of its title and the day it was finished).

import { addDays, daysBetween, formatShort } from './dates.js';
import { STATUS, newCard } from './model.js';

export function isWaiting(card) {
  return Boolean(card && card.waitingSince);
}

// Whole days since Waiting was turned on: 0 on the day itself. A date in
// the future (a ?today= earlier than the real one) counts as 0.
export function waitingDays(card, today) {
  if (!isWaiting(card)) return null;
  return Math.max(0, daysBetween(card.waitingSince, today));
}

// "today", "1 day", "7 days".
export function daysText(days) {
  if (!days) return 'today';
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

// The hover box's line: "Waiting on Tech Services since Sat, Nov 14."
export function waitingLine(card, today) {
  const who = card.waitingOn ? ` on ${card.waitingOn}` : '';
  const since = card.waitingSince >= today ? 'today' : formatShort(card.waitingSince);
  return `Waiting${who} since ${since}.`;
}

// For screen readers on the card: "Waiting on Tech Services, 7 days".
export function waitingLabel(card, today) {
  const days = waitingDays(card, today);
  const who = card.waitingOn ? ` on ${card.waitingOn}` : '';
  return `Waiting${who}, ${days ? daysText(days) : 'since today'}`;
}

// The hover box's line for a follow-up: "Then: Send the list, due Fri, Dec 4."
export function followUpLine(followUp) {
  if (!followUp.title) return "Then: you'll be asked when it's done.";
  return `Then: ${followUp.title}${followUp.dueDate ? `, due ${formatShort(followUp.dueDate)}` : ''}.`;
}

// True when Mark done has to ask: no title, or no date.
export function needsAsking(followUp) {
  return Boolean(followUp) && (!followUp.title || !followUp.dueDate);
}

// The fields of the follow-up card made from `parent` when it's finished.
// It keeps the parent's category and project, and joins (or starts) its
// chain. `today` is the day the parent was finished.
export function followUpCard(parent, { title, dueDate }, today) {
  const fields = {
    ...newCard({ title, dueDate: dueDate || null }),
    category: parent.category || null,
    projectId: parent.projectId || null,
    source: 'follow_up',
    chainId: parent.chainId || parent.id,
    afterId: parent.id,
    afterTitle: parent.title,
    afterDay: today,
  };
  // Sample cards stay findable by the script that removes them.
  if (parent.sample) fields.sample = true;
  return fields;
}

// What the parent needs once a follow-up is actually made: the chain's id,
// if it's the first card in it.
export function parentChainChanges(parent) {
  return parent.chainId ? {} : { chainId: parent.id };
}

// A repeating card's next card carries the follow-up too. A date moves by
// as many days as the series moved (Dec 4 after a Nov 24 card becomes Dec
// 11 after the Dec 1 one); with no date to measure from, it has none.
export function nextFollowUp(card, nextDueDate) {
  if (!card.followUp) return null;
  const { title, dueDate } = card.followUp;
  if (!dueDate || !card.dueDate || !nextDueDate) return { title, dueDate: null };
  return { title, dueDate: addDays(dueDate, daysBetween(card.dueDate, nextDueDate)) };
}

// The cards of one chain, oldest first: each follows the one before it.
// Ties (two made in the same write) go by which one the other followed.
export function chainOrder(cards) {
  return [...cards].sort((a, b) => {
    if (a.afterId === b.id) return 1;
    if (b.afterId === a.id) return -1;
    return (a.createdAt || 0) - (b.createdAt || 0);
  });
}

// Where a card in a chain stands, for the record box: "Done Thu, Nov 19",
// "Let go Fri, Nov 20", "On the board, due Tue, Nov 24", "In Someday".
export function chainStatus(card, dayOf) {
  if (card.status === STATUS.DONE) return { kind: 'done', text: `Done ${formatShort(dayOf(card.completedAt))}` };
  if (card.status === STATUS.LET_GO) return { kind: 'letgo', text: `Let go ${formatShort(dayOf(card.letGoAt))}` };
  return { kind: 'open', text: card.dueDate ? `On the board, due ${formatShort(card.dueDate)}` : 'In Someday' };
}
