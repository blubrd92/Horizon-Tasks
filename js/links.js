// A project's notes and links: the limits, checking an address before it
// is saved and again before it is drawn, how an address reads on the
// page, and changing the list of links. No Firebase, no page.

// The longest notes can be: about four printed pages. A Firestore
// document holds about 1 MB, so this leaves plenty of room.
export const NOTES_LIMIT = 10000;
// The countdown under the notes box starts here.
export const NOTES_WARN = 9000;

export const LINK_TITLE_LIMIT = 120;
export const LINK_URL_LIMIT = 2000;
export const LINKS_LIMIT = 50;

const WEB = ['http:', 'https:'];

// Reads what was typed in the Address box. Returns { url } with the
// address as the browser reads it, or { error } saying why it can't be
// saved. Only http:// and https:// addresses pass. An address typed with
// no kind at all ("drive.google.com/...") gets https:// in front first,
// the way a browser's address bar does it; one that names another kind
// ("mailto:", "javascript:") is checked as typed, and refused.
export function readAddress(text) {
  const typed = (text || '').trim();
  if (!typed) return { error: 'Type the link’s address.' };
  // Chrome's reader turns spaces into "%20" even in a site name, so "not
  // a link" would pass. A real address has none (they're written %20).
  if (/\s/.test(typed)) return { error: 'That doesn’t look like a web address.' };
  if (typed.length > LINK_URL_LIMIT) return { error: `That address is longer than ${LINK_URL_LIMIT.toLocaleString('en-US')} characters.` };
  // A kind is letters before a colon. "localhost:8080" and
  // "example.com:443/x" have a port number after theirs, so those are
  // addresses with no kind named.
  const named = /^[a-z][a-z0-9+.-]*:(?!\d)/i.test(typed);
  let url;
  try {
    url = new URL(named ? typed : `https://${typed}`);
  } catch {
    return { error: 'That doesn’t look like a web address.' };
  }
  if (!WEB.includes(url.protocol)) return { error: 'Only web addresses (http:// or https://) can be saved.' };
  if (!url.hostname) return { error: 'That doesn’t look like a web address.' };
  if (url.href.length > LINK_URL_LIMIT) return { error: `That address is longer than ${LINK_URL_LIMIT.toLocaleString('en-US')} characters.` };
  return { url: url.href };
}

// The address to put in a link's href, read again by the browser, or null
// if it isn't an http(s) address. Used every time a link is drawn, so an
// address that got in some other way (typed into the console) never
// becomes something you can click.
export function safeHref(address) {
  if (typeof address !== 'string') return null;
  try {
    const url = new URL(address);
    return WEB.includes(url.protocol) && url.hostname ? url.href : null;
  } catch {
    return null;
  }
}

// The site a link goes to, for the line under its title:
// "drive.google.com".
export function siteOf(href) {
  try {
    return new URL(href).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

// An untitled link's text: the address without "https://", "www.", or a
// lone "/" at the end.
export function shortAddress(href) {
  try {
    const url = new URL(href);
    const host = url.host.replace(/^www\./i, '');
    let rest = `${url.pathname}${url.search}${url.hash}`;
    if (rest === '/') rest = '';
    return `${host}${rest}`;
  } catch {
    return String(href || '');
  }
}

// Notes as they're saved: spaces and empty lines at the very end trimmed,
// and nothing at all if they're only spaces.
export function cleanNotes(text) {
  const notes = (text || '').replace(/\s+$/, '');
  return notes.trim() ? notes : '';
}

// A new link's id: only so the page can tell rows apart while you edit.
export function newLinkId() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// Changing the list. Each returns a new list and leaves the old one alone,
// and each works from the latest list Firestore sent, so a change made
// elsewhere a moment ago isn't undone.

// Puts `link` in place of the one with its id, or at the end if it's new
// (or was removed elsewhere meanwhile).
export function withLink(links, link) {
  const at = links.findIndex((l) => l.id === link.id);
  if (at === -1) return [...links, link];
  const next = [...links];
  next[at] = link;
  return next;
}

export function withoutLink(links, id) {
  return links.filter((l) => l.id !== id);
}

// Moves the link with this id one place up (-1) or down (+1).
export function movedLink(links, id, step) {
  const at = links.findIndex((l) => l.id === id);
  const to = at + step;
  if (at === -1 || to < 0 || to >= links.length) return links;
  const next = [...links];
  [next[at], next[to]] = [next[to], next[at]];
  return next;
}

// Links as stored on the project document: just these three fields.
export function storedLinks(links) {
  return links.map(({ id, title, url }) => ({ id, title, url }));
}

// Links read from a project document, made predictable the way
// normalizeProject does the rest: only entries with a text address, a
// title that's text (or ""), and ids that are unique. Nothing is dropped
// for being too long or for an address that isn't http(s); those are
// shown, and refused only when drawn as links.
export function normalizeLinks(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const links = [];
  value.forEach((entry, i) => {
    if (!entry || typeof entry !== 'object' || typeof entry.url !== 'string') return;
    let id = typeof entry.id === 'string' && entry.id ? entry.id : `link-${i}`;
    if (seen.has(id)) id = `${id}-${i}`;
    seen.add(id);
    links.push({ id, title: typeof entry.title === 'string' ? entry.title.trim() : '', url: entry.url });
  });
  return links;
}
