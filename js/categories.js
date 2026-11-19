// Your categories: the colors to pick from, and the rules for adding,
// renaming, recoloring, reordering, retiring, and deleting them. No
// Firebase, no page: each change takes the list and gives back a new one
// (or an error to show), and app.js saves it.
//
// The list lives on your profile, in your order: [{ id, name, color }],
// with `retired: true` on a retired one. A retired category stays in the
// list so cards that have it keep its name and color, on the board and in
// What you did; it just isn't offered in menus or sent to Haiku.

// The swatches. Your five starters, then five more, each dark enough to
// read as a band across a white card. Left out on purpose: the accent blue
// (Today), the overdue rose, and the hard-deadline orange, since each
// already means something.
export const CATEGORY_COLORS = [
  { name: 'Green', color: '#2F7D6B' },
  { name: 'Purple', color: '#6A4FB3' },
  { name: 'Blue', color: '#3B6FB6' },
  { name: 'Gold', color: '#B07A00' },
  { name: 'Gray', color: '#6B6F78' },
  { name: 'Forest', color: '#2F7A3F' },
  { name: 'Plum', color: '#86478F' },
  { name: 'Navy', color: '#2C4778' },
  { name: 'Brown', color: '#8B5530' },
  { name: 'Lagoon', color: '#0F7792' },
];

// The most active categories you can have. Retired ones don't count.
export const MAX_ACTIVE = 12;

// The longest name a category can have.
export const NAME_LIMIT = 40;

// What a category with no usable color shows.
export const FALLBACK_COLOR = '#6B6F78';

// The list as read from your profile, made safe to draw: an entry with no
// id is skipped (and so is a repeated id), a missing name shows the id,
// and a color that isn't a plain hex color shows gray. The color goes into
// the page's styles, so nothing else gets through.
export function normalizeCategories(data) {
  if (!Array.isArray(data)) return [];
  const seen = new Set();
  const out = [];
  for (const c of data) {
    if (!c || typeof c !== 'object' || typeof c.id !== 'string' || !c.id || seen.has(c.id)) continue;
    seen.add(c.id);
    const name = typeof c.name === 'string' && c.name.trim() ? c.name : c.id;
    const color = typeof c.color === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c.color) ? c.color : FALLBACK_COLOR;
    out.push(c.retired === true ? { id: c.id, name, color, retired: true } : { id: c.id, name, color });
  }
  return out;
}

// The ones offered in menus and sent to Haiku.
export function activeOf(list) {
  return list.filter((c) => !c.retired);
}

export function retiredOf(list) {
  return list.filter((c) => c.retired);
}

// Two lists the same, entry by entry (to skip redrawing when the profile
// changed for some other reason).
export function sameCategories(a, b) {
  return (
    a.length === b.length &&
    a.every((c, i) => c.id === b[i].id && c.name === b[i].name && c.color === b[i].color && Boolean(c.retired) === Boolean(b[i].retired))
  );
}

// Spaces at the ends trimmed, and runs of spaces made one.
export function cleanName(name) {
  return String(name || '').replace(/\s+/g, ' ').trim();
}

// Why `name` can't be used, or null if it can. `except` is the id of the
// category being renamed. Names are compared ignoring capitals, against
// retired categories too.
export function nameProblem(list, name, except = null) {
  const clean = cleanName(name);
  if (!clean) return 'Give the category a name.';
  if (clean.length > NAME_LIMIT) return `Keep the name to ${NAME_LIMIT} characters.`;
  const twin = list.find((c) => c.id !== except && cleanName(c.name).toLowerCase() === clean.toLowerCase());
  if (!twin) return null;
  return twin.retired
    ? `\u201c${twin.name}\u201d is retired. Bring it back from the retired list instead.`
    : `You already have a category called \u201c${twin.name}\u201d.`;
}

// The first swatch no active category is using, so new ones look
// different until all ten are taken.
export function nextColor(list) {
  const used = new Set(activeOf(list).map((c) => c.color.toUpperCase()));
  const free = CATEGORY_COLORS.find((c) => !used.has(c.color));
  return (free || CATEGORY_COLORS[activeOf(list).length % CATEGORY_COLORS.length]).color;
}

// A new category's id, from its name: "Book Club" becomes "book-club",
// then "book-club-2" if that's taken (retired ones included). Renaming
// never changes an id, so cards never need touching.
export function makeId(list, name) {
  const base =
    cleanName(name)
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, NAME_LIMIT)
      .replace(/-+$/, '') || 'category';
  const taken = new Set(list.map((c) => c.id));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
  }
}

// Each change below returns { list } on success, or { error } with a
// sentence to show.

export function addCategory(list, { name, color }) {
  if (activeOf(list).length >= MAX_ACTIVE) return { error: `${MAX_ACTIVE} is the most. Retire one to add another.` };
  const problem = nameProblem(list, name);
  if (problem) return { error: problem };
  const clean = cleanName(name);
  return { list: [...list, { id: makeId(list, clean), name: clean, color }] };
}

// A new name, a new color, or both. A name left as it was is fine even
// if it's longer than today's limit (one typed in the console, say).
export function changeCategory(list, id, { name, color }) {
  const at = list.findIndex((c) => c.id === id);
  if (at === -1) return { error: 'That category is gone (changed on another device?).' };
  const was = list[at];
  const clean = cleanName(name);
  if (clean !== cleanName(was.name)) {
    const problem = nameProblem(list, clean, id);
    if (problem) return { error: problem };
  }
  const next = [...list];
  next[at] = { ...was, name: clean === cleanName(was.name) ? was.name : clean, color };
  return { list: next };
}

// Moves an active category one place up (-1) or down (+1) among the
// active ones. Retired ones keep their places in between.
export function moveCategory(list, id, step) {
  const active = activeOf(list);
  const from = active.findIndex((c) => c.id === id);
  const to = from + step;
  if (from === -1 || to < 0 || to >= active.length) return { list };
  const a = list.findIndex((c) => c.id === id);
  const b = list.findIndex((c) => c.id === active[to].id);
  const next = [...list];
  [next[a], next[b]] = [next[b], next[a]];
  return { list: next };
}

export function retireCategory(list, id) {
  if (!list.some((c) => c.id === id)) return { error: 'That category is gone (changed on another device?).' };
  return { list: list.map((c) => (c.id === id ? { ...c, retired: true } : c)) };
}

// Back in its old place in the order.
export function restoreCategory(list, id) {
  if (!list.some((c) => c.id === id)) return { error: 'That category is gone (changed on another device?).' };
  if (activeOf(list).length >= MAX_ACTIVE) return { error: `${MAX_ACTIVE} is the most. Retire one to bring this back.` };
  return {
    list: list.map((c) => {
      if (c.id !== id) return c;
      const { retired, ...rest } = c;
      return rest;
    }),
  };
}

// Only for a category nothing uses; app.js asks Firestore first.
export function deleteCategory(list, id) {
  return { list: list.filter((c) => c.id !== id) };
}
