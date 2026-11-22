// Plans in projects: the rules, with no Firebase and no page.
//
// A plan is a project's steps in order, each a real card at its own date,
// all on the board from the day they're made. The order lives on the
// project (planSteps, the step cards' ids, first to last), so moving,
// adding, or taking off a step rewrites one list, and "Step 3 of 6" is
// known wherever the project is. Every step also carries chainId = the
// project's id, so What you did finds the whole plan with the question it
// already asks for a chain of follow-ups (see followup.js).

import { formatShort } from './dates.js';
import { STATUS, newCard } from './model.js';

// The most steps a plan holds.
export const PLAN_MAX = 30;

// The project's step ids, first to last ([] for no plan).
export function planIds(project) {
  return project && Array.isArray(project.planSteps) ? project.planSteps : [];
}

export function hasPlan(project) {
  return planIds(project).length > 0;
}

// True when the card is a step in that project's plan.
export function isStep(project, cardId) {
  return Boolean(cardId) && planIds(project).includes(cardId);
}

// The project whose plan the card is a step in, or null.
export function planProjectOf(projects, card) {
  if (!card || !card.id || !card.projectId) return null;
  const project = projects.find((p) => p.id === card.projectId);
  return project && isStep(project, card.id) ? project : null;
}

// { number, total } for a step, or null.
export function stepNumber(project, cardId) {
  const ids = planIds(project);
  const i = ids.indexOf(cardId);
  return i < 0 ? null : { number: i + 1, total: ids.length };
}

// The step cards in order, from the cards you have (any status). Ids
// with no card behind them (removed by hand, say) are skipped.
export function stepsOf(project, cards) {
  const byId = new Map(cards.map((c) => [c.id, c]));
  return planIds(project)
    .map((id) => byId.get(id))
    .filter((c) => c && c.projectId === project.id);
}

function isOpen(card) {
  return card.status !== STATUS.DONE && card.status !== STATUS.LET_GO;
}

// For each open step dated earlier than the open step before it (the
// nearest one with a date): the number and date of that step. A Map from
// card id to { number, dueDate }. Finished steps don't count: their dates
// are history.
export function orderNotes(steps) {
  const notes = new Map();
  let last = null;
  steps.forEach((step, i) => {
    if (!isOpen(step) || !step.dueDate) return;
    if (last && step.dueDate < last.dueDate) notes.set(step.id, last);
    last = { number: i + 1, dueDate: step.dueDate };
  });
  return notes;
}

// What the editor needs about a step: its number, the plan's length, the
// step before it (title, and whether and when it was finished, or its
// date), and the nearest open dated steps on either side, for the date
// note. `steps` is stepsOf(); null if the card isn't among them.
export function stepContext(steps, cardId, dayOf) {
  const i = steps.findIndex((s) => s.id === cardId);
  if (i < 0) return null;
  const prevCard = steps[i - 1] || null;
  let prev = null;
  if (prevCard) {
    if (prevCard.status === STATUS.DONE) prev = { title: prevCard.title, how: 'done', day: dayOf(prevCard.completedAt) };
    else if (prevCard.status === STATUS.LET_GO) prev = { title: prevCard.title, how: 'let go', day: dayOf(prevCard.letGoAt) };
    else prev = { title: prevCard.title, how: 'open', day: prevCard.dueDate };
  }
  const near = (from, step) => {
    for (let j = from; j >= 0 && j < steps.length; j += step) {
      if (isOpen(steps[j]) && steps[j].dueDate) return { number: j + 1, dueDate: steps[j].dueDate };
    }
    return null;
  };
  return { number: i + 1, total: steps.length, prev, before: near(i - 1, -1), after: near(i + 1, 1) };
}

// The editor's yellow note for a date, or "": "This is now before step
// 2's date (Mon, Nov 30)." or "... after step 4's date (...)."
export function dateNote(context, dueDate) {
  if (!context || !dueDate) return '';
  if (context.before && dueDate < context.before.dueDate) {
    return `This is now before step ${context.before.number}’s date (${formatShort(context.before.dueDate)}).`;
  }
  if (context.after && dueDate > context.after.dueDate) {
    return `This is now after step ${context.after.number}’s date (${formatShort(context.after.dueDate)}).`;
  }
  return '';
}

// The panel's line: "1 of 6 done. Next: Confirm the troupe, Mon, Nov 30."
// Returns { done, total, next } (next: the first open step, or null).
export function progress(steps) {
  const done = steps.filter((s) => s.status === STATUS.DONE).length;
  const next = steps.find(isOpen) || null;
  return { done, total: steps.length, next };
}

// The first open step after this one, for Mark done's line, or null.
export function nextOpenStep(steps, cardId) {
  const i = steps.findIndex((s) => s.id === cardId);
  if (i < 0) return null;
  return steps.slice(i + 1).find(isOpen) || null;
}

// A new step's fields: a plain card in the project, in the plan's chain.
export function stepFields(project, { title, dueDate, category }) {
  return {
    ...newCard({ title, dueDate: dueDate || null }),
    projectId: project.id,
    category: category || null,
    source: 'plan',
    chainId: project.id,
  };
}

// The plan with `newId` right after `afterId` (at the end if afterId isn't
// in it).
export function insertAfter(ids, afterId, newId) {
  const list = ids.filter((id) => id !== newId);
  const i = list.indexOf(afterId);
  if (i < 0) return [...list, newId];
  list.splice(i + 1, 0, newId);
  return list;
}

// The category most of the project's cards have, for a new plan's steps,
// or null.
export function usualCategory(cards, categories) {
  const active = new Set(categories.filter((c) => !c.retired).map((c) => c.id));
  const counts = new Map();
  for (const card of cards) {
    if (card.category && active.has(card.category)) counts.set(card.category, (counts.get(card.category) || 0) + 1);
  }
  let best = null;
  for (const [id, n] of counts) if (!best || n > best.n) best = { id, n };
  return best ? best.id : null;
}
