// Projects: the colors to pick from, their order on the list, and how
// their dates and counts read. No Firebase, no page.

import { formatLong, formatShort } from './dates.js';
import { ACTIVE_STATUSES, PROJECT_STATUS, STATUS } from './model.js';

// A project's color marks its tag's arrow, its swatch on the list, and its
// page's header edge; a card's band stays its category's. Chosen away from
// the category colors, the overdue rose, and the orange that only hard
// deadlines use. Each is at least 4.4:1 against the page's ground.
export const PROJECT_COLORS = [
  { name: 'Moss', color: '#557A2B' },
  { name: 'Teal', color: '#15788A' },
  { name: 'Indigo', color: '#4C4AB8' },
  { name: 'Berry', color: '#A3367C' },
  { name: 'Cocoa', color: '#7B5B43' },
  { name: 'Steel', color: '#4E6A8F' },
  { name: 'Olive', color: '#6E6A1E' },
  { name: 'Charcoal', color: '#45484F' },
];

// In the editor's Project menu, the choice that makes a new project.
export const NEW_PROJECT = '__new__';

// The longest name a project can have.
export const NAME_LIMIT = 80;

// The address of a project's page, and the project id in an address.
export function projectHref(id) {
  return `#project/${encodeURIComponent(id)}`;
}

export function projectIdFromHash(hash) {
  const match = /^#project\/(.+)$/.exec(hash);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

// The first color no active project is using, so new projects look
// different from each other until all eight are taken.
export function nextColor(projects) {
  const active = projects.filter((p) => p.status === PROJECT_STATUS.ACTIVE);
  const used = new Set(active.map((p) => p.color.toUpperCase()));
  const free = PROJECT_COLORS.find((c) => !used.has(c.color));
  return (free || PROJECT_COLORS[active.length % PROJECT_COLORS.length]).color;
}

// The project with this name, ignoring capitals and spaces at the ends,
// or undefined. `except` is a project id to leave out (the one being
// renamed).
export function findByName(projects, name, except = null) {
  const wanted = name.trim().toLowerCase();
  return projects.find((p) => p.id !== except && p.name.toLowerCase() === wanted);
}

// The list's order: the soonest end date first, since position means
// time; projects without one after those; names break ties.
export function listOrder(projects) {
  return [...projects].sort((a, b) => {
    if (a.endDate !== b.endDate) {
      if (!a.endDate) return 1;
      if (!b.endDate) return -1;
      return a.endDate < b.endDate ? -1 : 1;
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

// The editor's menu: by name.
export function nameOrder(projects) {
  return [...projects].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

// "Ends Fri, Nov 20", "Ends today", "Ended Thu, Oct 15", or "No end date".
// A date in another year gets its year.
export function endLine(project, today) {
  if (!project.endDate) return 'No end date';
  if (project.endDate === today) return 'Ends today';
  const when = withYear(formatShort(project.endDate), project.endDate, today);
  return project.endDate < today ? `Ended ${when}` : `Ends ${when}`;
}

// The project page's longer version: "Ends Friday, Nov 20."
export function endSentence(project, today) {
  if (!project.endDate) return 'No end date.';
  if (project.endDate === today) return 'Ends today.';
  const when = withYear(formatLong(project.endDate), project.endDate, today);
  return project.endDate < today ? `Ended ${when}.` : `Ends ${when}.`;
}

function withYear(text, iso, today) {
  return iso.slice(0, 4) === today.slice(0, 4) ? text : `${text}, ${iso.slice(0, 4)}`;
}

// How many of `cards` (the board's open and in-progress cards) are in
// each project, by project id.
export function openCounts(cards) {
  const counts = new Map();
  for (const card of cards) {
    if (!card.projectId || !ACTIVE_STATUSES.includes(card.status)) continue;
    counts.set(card.projectId, (counts.get(card.projectId) || 0) + 1);
  }
  return counts;
}

// "3 open cards", "1 open card", "No open cards".
export function openLine(n) {
  if (!n) return 'No open cards';
  return `${n} open ${n === 1 ? 'card' : 'cards'}`;
}

// The finished part of a project page: "5 cards finished, 1 let go."
export function finishedLine(done, letGo) {
  const parts = [];
  if (done) parts.push(`${done} ${done === 1 ? 'card' : 'cards'} finished`);
  if (letGo) parts.push(`${letGo} let go`);
  const text = parts.join(', ');
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}.` : '';
}

// A project's cards from its own query, split into finished (done) and let
// go. Open ones are left out: the board's cards already have them, fresher.
export function finishedOf(cards) {
  return {
    done: cards.filter((c) => c.status === STATUS.DONE),
    letGo: cards.filter((c) => c.status === STATUS.LET_GO),
  };
}
