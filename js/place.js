// Where the card editor sits beside a card. No page: it takes sizes and
// returns a position, all in window coordinates (pixels).
//
// To the right of the card when there's room, otherwise to the left. When
// neither side has room (a narrow window), the side with more room, slid
// over just enough to stay on screen. Its top lines up with the card's top,
// moved up if it would run off the bottom.

const GAP = 12; // between the card and the editor
const MARGIN = 16; // between the editor and the window's edges

// anchor is { left, top, right, bottom }; panel is { width, height }; view
// is { width, height }. prefer 'below' puts it under the anchor instead
// (the quick add field, for a new card). Returns { left, top, side }.
export function placeBeside(anchor, panel, view, prefer = 'beside') {
  const maxLeft = Math.max(MARGIN, view.width - panel.width - MARGIN);
  const maxTop = Math.max(MARGIN, view.height - panel.height - MARGIN);
  const clamp = (value, max) => Math.min(Math.max(value, MARGIN), max);

  if (prefer === 'below') {
    return { left: clamp(anchor.left, maxLeft), top: clamp(anchor.bottom + 8, maxTop), side: 'below' };
  }

  const roomRight = view.width - MARGIN - (anchor.right + GAP);
  const roomLeft = anchor.left - GAP - MARGIN;
  let side;
  if (roomRight >= panel.width) side = 'right';
  else if (roomLeft >= panel.width) side = 'left';
  else side = roomRight >= roomLeft ? 'right' : 'left';

  const left = side === 'right' ? anchor.right + GAP : anchor.left - GAP - panel.width;
  return { left: clamp(left, maxLeft), top: clamp(anchor.top, maxTop), side };
}
