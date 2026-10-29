# PLAN

Working notes so any session can pick up where the last one stopped.

## Status

**Slice 1a: done and confirmed** (2026-10-23) on the live site,
`https://blubrd92.github.io/Horizon-Tasks/`, with Firebase project
`horizontasks-29d6c`. Sign-in, the approved list, zone placement, live
updates, and done cards disappearing all checked out.

**Slice 1b: done and confirmed** (2026-10-23). Quick add (Enter opens a new
card, Ctrl+Enter adds to Someday, Shift+Enter adds to Today), the editing
panel, Mark done, and the In progress pill.

**Slice 1c: done and confirmed** (2026-10-23). Drag to reschedule,
reordering within zones, the Someday drawer, then revisions after your first
test: a card-sized landing slot, zones that snap one at a time on a phone, a
Someday pill and full-screen sheet on phones, and a guard so a double-click
on a panel's X can't sign you out.

**Slice 1d: done and confirmed** (2026-10-25). Hard and soft deadlines,
morning triage, Let it go, the Since yesterday line, the 14-day header
strip, and the `?today=` testing parameter, then eight revisions after your
tests: the editor opens beside the card; drop a card on a strip day; tap a
strip day to highlight its cards; 44px strip tiles; triage buttons that
stack when the card is narrow; busy days show their number on the strip; a
Settings box (the gear beside Sign out) with "Fold long zones", off by
default; and lanes plus a "Move to ..." label that show where a dragged
card will land, with the board holding its height mid-drag.

Your board has 44 sample cards on it, each marked `sample: true` (some done
and one let go, for 1f). The scripts that add and remove them were given in
the chat and aren't in the repo; saving them as a `tools/` folder is an open
proposal.

**Slice 1e: done and confirmed** (2026-10-29). Repeating cards: a Repeats
menu in the editor (Doesn't repeat, Weekly, Monthly) with the rhythm in
words; Mark done and Let it go add the next card in the same write; the
next date follows the schedule, never piling up missed periods; monthly on
the 29th to 31st uses the last day of shorter months and comes back;
triage and drags move one card, and the editor's "Move the series too"
moves the series; the mockup's repeat icon on cards. Every card in a
series shares a `seriesId`.

**Branches:** 1d and 1e were built on side branches and merged into `main`
on 2026-10-29 (a fast-forward: `main` simply caught up, nothing was
rewritten). `main` now has every confirmed slice. If GitHub Pages is still
pointed at a side branch, point it back at `main` (Settings > Pages).

**Slice 1f: built, awaiting your test** (2026-10-29). The Done record
view, "What you did". See the 1f section below for what it does, the five
questions settled, and the test list.

**Next:** your test of 1f. Once it's confirmed and committed, Phase 1 is
done; Phase 2 (Projects) starts in a fresh session.

Open proposals carried over: Undo for Let it go and Mark done (1f covers
the "get it back" half from the Done view; a 6-second Undo on the board is
still open), Let it go in the editor, triage per device instead of per
account, pinning zone headers on long columns, and saving the sample card
scripts in `tools/`. New from 1f: see its Proposals.

## Slice 1f: the Done record, "What you did" (awaiting test)

### What it does

**Getting there.** A "Done" button joins the header, before the gear and
Sign out (where the mockup puts it; Projects and Inbox join it in later
phases). It opens "What you did", laid out like `design/Done.dc.html`: the
wordmark and "Back to the board" on top; the big heading and a line naming
the range ("October so far. Every card you finished, kept."); Week, Month,
Year; Copy as text; the dark total tile and one tile per category; the
finished cards grouped by week, newest first; and the dashed let-go box at
the bottom. The address becomes `#done`, so the browser's Back button
returns to the board, a reload stays on the record, and `?today=` keeps
working there (the testing bar shows on both views).

**Rows.** Each row: a blue check, the title, the category with its swatch,
and the day it was finished ("Wed, Oct 21"). Each row is a button: click it
and a small box shows the card (category, when it was finished, when it
had been due, its notes) with "Put back on the board". The mockup's rows
stay as clean as they look; the way back is one click deeper.

### The five open questions, settled

**1. Only the range on screen is downloaded.** Two live queries, both
"between the start of the range and the start of the next one": done
cards by `completedAt`, let-go cards by `letGoAt`. A Month view reads
that month's cards and nothing older; years of history stay on the
server. Each query filters on one field only, so Firestore's automatic
single-field indexes answer it: **no index to create** (the same kind of
query 1d's "you finished" count already runs on your live project). The
status check (done vs. let go) happens in the browser, which also drops a
card that was finished and then put back. Cost on the free plan: one read
per card in the range when you open it, so a Year view with 600 cards is
600 of the 50,000 free daily reads. The queries are live, so a card you
finish in another tab appears without a reload. Leaving the view stops
them.

**2. Weeks run Monday to Sunday, months and years are the calendar's,
and you can step back.**
- Week is the Monday-to-Sunday week holding today; Month is the calendar
  month; Year is the calendar year. Ranges use your own time zone's
  midnights, so a card finished at 11:58 pm counts on that day.
- Two arrow buttons beside Week, Month, Year step to the previous or next
  one: last week, September, 2025. Without them, January 2 would show a
  Year of two days, and "Every card you finished, kept" would quietly stop
  being true for anything older than the current year. Next stops at the
  current one (there's no future to show). Pressing Week, Month, or Year
  always jumps to the current one, so you're never more than one click
  from now.
- The line under the heading names what's showing: "October so far.",
  "September.", "September 2025." (a past year gets its year), "This week
  so far.", "Oct 12 to 18.", "2026 so far.", "2025."
- Month opens first, as in the mockup. The range you pick stays while the
  page is open (board and back again); a reload starts at Month.
- Grouped by week in every range, as SPEC says. A week that crosses the
  range's edge is labeled with the part inside it ("Oct 1 to 4" in an
  October that starts on a Thursday). The current week reads "This week",
  as in the mockup; others read by their dates ("Oct 12 to 18").
- A week with nothing finished is left out rather than shown empty. This
  is a record of what you did, not a ledger of what you didn't.
- An empty range shows one quiet line ("Nothing finished in September.")
  instead of a big dark zero, and Copy as text is off.

**3. Repeating cards: one row per time, an icon, and grouped when
copied.**
- Each finished card is its own row: four weekly orders in a month are four
  rows, and count as four.
- Rows show the board's two-arrow repeat icon after the title (a screen
  reader hears "Repeats"), so four rows of the same title read as a
  rhythm, not a duplicate. The icon shows on any card that belongs to a
  series: it repeats, or it was a later card in one (so the last card of a
  series you ended still gets it). A card you set to Weekly and then back
  to "Doesn't repeat" before it ever repeated doesn't.
- **Copy as text groups a series** by `seriesId` and title together:
  "Thu, Oct 15 · Weekly order: 300s nonfiction, 2 times (Oct 8, Oct 15)
  · Collection Development", placed at its latest date. Same series but a
  changed title ("600s" then "300s") stays separate lines, since grouping
  would hide the change. More than five times reads "12 times, Jan 8 to
  Oct 22" instead of listing every date. On screen nothing is grouped.

**4. Let-go cards, and putting cards back.**
- The dashed box at the bottom counts cards let go in the same range, by
  `letGoAt`: "You let 1 card go this month. It's kept here too, quietly."
  ("this week", "this year", "that week", "in September", "in 2025"). Show
  opens the list inside the box (newest first, a gray dash icon instead of
  the check, the day it was let go); Hide closes it. When nothing was let
  go, the box isn't shown. Let-go cards are never in the total, the tiles,
  or Copy as text: letting go isn't finishing.
- **Yes, a done or let-go card can go back on the board**, from its box:
  "Put back on the board". It returns as an open card with its old due
  date (so possibly in Overdue, or Someday if it had none), in date order,
  and leaves the record: its `completedAt` or `letGoAt` is cleared, so
  nothing still counts it as finished. A line at the top says "'Kanopy
  usage check' is back on the board, due Tue, Oct 13."
- **A repeating card comes back as a one-off.** Finishing it already made
  the next card in the series, so putting the old one back as repeating
  would put two of the series on the board, and finishing either would
  spawn yet another. So it returns with Repeats set to "Doesn't repeat",
  still linked to the series by `seriesId`, and the series carries on
  with the card that already exists. The box says so before you press the
  button: "Part of a weekly series. It comes back on its own, as a one-off;
  the series already has its next card." Finishing the one-off later
  makes no new card.

**5. Cards with no category, or a category not on your profile.** Tiles
follow your profile's category order (so they don't shuffle between
ranges), showing only categories with at least one card. After them, each
unknown category id gets its own gray tile with the raw id as its name,
the same way the board shows it; last comes a gray "No category" tile.
Rows use the same names. The color is never the only clue: every tile and
row has the name.

**Carried over: Done privacy and the Firebase console.** Still parked, and
nothing in 1f changes it: the Done view reads only under your own
`users/{uid}`, and the rules already refuse everyone else. 1f did teach one
thing worth writing down for that decision. The range queries need
`completedAt` and `letGoAt` readable by the database, so encrypting Done
records in the browser could hide titles, notes, and categories from a
project owner, but never *when* someone finished things. The other honest
route is the one SPEC already plans for people elsewhere: each colleague
runs their own copy, so there's no shared owner at all. Decide before
colleagues join.

### Data

No new fields. Putting a card back writes `status: "open"`, clears its
`completedAt` (or `letGoAt`) to null and its `order`, and for a repeating
card sets `repeat: "none"` with `seriesDate` and `seriesDay` null,
keeping `seriesId`.

### Files touched

```
index.html         the Done button; the testing bar moves up so both views
                   share it; the Done view; the box for one finished card
css/horizon.css    the Done view, laid out from the mockup, and its phone
                   layout
js/dates.js        weekStartOf(): the Monday of a date's week
js/record.js       NEW: ranges, weeks, tallies, wording, and the copied
                   text; no Firebase, no page
js/done.js         NEW: draws the Done view and its card box, reports
                   clicks; no Firebase
js/firebase.js     watchStampedBetween(): the range queries
js/app.js          #done and the board, the range, the queries, Copy as
                   text, putting a card back
```

### Setup steps (yours)

None. No rule changes (reading your own cards is already allowed), no
index.

### Decisions I made that the questions didn't cover (change any of them)

1. **Rows open a small box** with "Put back on the board", instead of a
   button on every row.
2. **Month first**, as in the mockup; the choice lasts until a reload.
3. **Empty weeks are left out; an empty range shows a line, not a zero.**
4. **Put back means open, not In progress**, with its old due date.
5. **Copy as text** starts with a heading and the counts, newest first,
   in your own voice, ready for an evaluation:
   ```
   What I did, Oct 1 to 29, 2026
   11 cards finished: Collection Development 5, Programs 2, ...

   Wed, Oct 21 · Booklist descriptions for the November display · Programs
   ```

### Proposals (not built; say yes and I'll add them)

- **A fiscal year range.** Library evaluations often run July to June, not
  January to December. A "starts in" setting for Year would make Copy as
  text match your evaluation period in one click.
- **Group the Year view by month** instead of week. SPEC says by week, and
  that's what's built, but a year is up to 52 headings.
- **Notes in Copy as text**, as an option, for evaluations that want the
  detail.

### How to test

Open the board and click Done (use `?today=` if you like; the testing bar
follows you there).
- [ ] The page matches the mockup: heading, range line, Week/Month/Year
      with Month pressed, Copy as text, the dark total, category tiles,
      weeks newest first with "This week" on top, the dashed box last.
- [ ] Your sample cards that are done show up, each on the day it was
      finished. The total equals the rows; each tile equals its rows.
- [ ] Week and Year switch the range; the line under the heading follows.
- [ ] The left arrow steps back (last week, September, 2025); the right
      arrow steps forward and is off on the current one. Pressing Month
      from September jumps back to this month.
- [ ] A range with nothing in it: one quiet line, Copy as text off.
- [ ] A card with no category: a gray "No category" tile and row label.
- [ ] A repeating card's finished rows show the repeat icon.
- [ ] Copy as text, then paste into a document: heading, counts, one line
      per card, a repeating series on one line with "N times".
- [ ] The let-go box counts your let-go sample card. Show lists it; Hide
      folds it.
- [ ] Click a done row: the box shows its details. Put back on the board:
      the row leaves, the line at the top says where it went, and Back to
      the board shows it there. In the console it's `open` with
      `completedAt: null`.
- [ ] Put back a let-go card: same, from the let-go list.
- [ ] Put back a repeating card whose next card is on the board: it comes
      back without the repeat icon, the next card is still there, and
      marking the old one done makes no new card.
- [ ] The browser's Back button returns to the board; reload on `#done`
      stays on the record.
- [ ] Phone width: everything fits, nothing scrolls sideways, buttons are
      44px.

What I checked here, in a real browser (Chromium) with a pretend Firebase,
Pacific time, the clock on Thu, Oct 22, 2026, and the mockup's October as
sample data plus edge cases: 109 checks, all passing, no console errors.
The Done button and `#done`; the heading taking focus; both queries
running from Oct 1 to Nov 1 at Pacific midnights, one on each field; the
total and tiles (profile order, then `outreach`, an id not on the
profile, then "No category"); weeks newest first with "This week" and
the first week clipped to "Oct 1 to 4"; a card finished at 11:58 pm on a
Sunday staying in that week; a reopened card, a September card, and a
let-go card kept out of the rows, total, and copy; a title with HTML in it
shown as plain text; the repeat icon on series cards, on the last card of
an ended series, and not on a card toggled on and off; the let-go box,
Show and Hide, with keyboard focus kept; Copy as text (heading, counts,
two series grouped, a changed title kept separate); Week, Year, the
arrows, last week, 2025, September (its last week clipped to "Sep 28 to
30"), an empty August with Copy off, October 2025 getting its year, and
Month jumping back to now; the old queries stopping on every change and
when you leave the view; the box's details, notes, Escape back to the row;
putting back a plain card, a repeating card (one-off, `seriesId` kept),
and a let-go card, each landing in Overdue on the board; marking the
one-off done making no new card; a refused put-back leaving the row with a
message; a Firestore refusal on load; the browser's Back and a reload on
`#done`; the testing bar on both views with `?today=` kept; and at phone
width (390px), no sideways scroll and every button 44px or taller.
Screenshots at 1440px and 390px looked right against the mockup.

One thing you'll see on the board: the Done button makes the header's
buttons wrap under the strip about 80px sooner than before. They stay on
one row from about 1,180px wide up, so a full laptop screen is unchanged.

Not checked: real Firestore (the range query is the one new kind of
read), a real phone, and the 1a to 1e checks from earlier sessions (their
test setup wasn't saved). On the board I changed only the header, the
testing bar's spot, and Escape (which now ignores the Done view), so a
quick look at the board is enough.

## Slice 1e: repeating cards (confirmed)

### What it does

**Setting it.** The editor gets a "Repeats" menu under Due and Category:
Doesn't repeat, Weekly, Monthly. Under it, one line says the rhythm in
words, worked out from the date: "Every Thursday.", "The 5th of every
month.", "The 31st of every month, or the last day of shorter months." It
updates as you change the date or the menu. A new card from Enter in quick
add can be made repeating before Add card.

**On the board.** A repeating card shows the mockup's two-arrow icon and
"Weekly" or "Monthly", after the date and any hard deadline chip, before
In progress. A screen reader hears "Repeats weekly".

**Marking it done.** The card goes to your Done record as always, and in
the same save a new card appears with the next date. The spot beside quick
add says "Done. The next one is due Thu, Oct 29." with an Edit button for
the new card, then fades like any confirmation. Only one card of a series
is ever on the board: the next one exists once you've finished this one.
The strip doesn't show future repeats that don't exist yet.

### The four open questions, settled

**1. The next date follows the schedule, not the day you finished.**
The rhythm is set by the card's planned date. The next one is the first
date on that rhythm that is after both the planned date of the one you
finished and today. With a weekly card planned for Thu, Oct 22:
- Done on Oct 22: next is Oct 29.
- Done early, on Tue, Oct 20: next is Oct 29. Finishing early doesn't make
  next week's come sooner.
- Done late, on Sat, Oct 24: next is Oct 29. The schedule holds.
- Done on Thu, Oct 29, a full week late: next is Nov 5. Doing it today
  covers today; you don't get a second copy due the same afternoon.
- Done on Nov 10, nearly three weeks late: next is Nov 12. The missed
  Oct 29 and Nov 5 are not created. No pile of overdue copies, which
  would be a streak by another name.

Why the schedule and not "done plus a week": the repeating work you'd put
here (the Thursday order, the Saturday checklist, a monthly meeting) is
pinned to the calendar. Counting from the day you finished would slide the
Thursday order to Saturday the first time you were two days late, and it
would stay there.

A repeating card with no date (in Someday) has no schedule to follow, so
its next one is due a week or a month after the day you mark it done.
That's the one case that counts from the finish.

**Moving one card doesn't move the series.** Each card remembers the date
the rhythm planned for it (`seriesDate`, below). Triage buttons, dragging
to a zone or a strip day, and the drawer change when this one is due, and
leave the series alone. Triage the Thursday order to Friday, finish it on
Friday, and the next one is still Thursday.

The editor is where you'd change the series on purpose, so changing a
repeating card's date there shows one more checkbox, off by default:
"Move the series too", with a line saying what that means ("From now on:
every Friday."). Unchecked, only this card's date changes. Checked, the
rhythm follows the new date. This is the "this one or all of them"
question calendars ask, asked only when it matters.

**2. Monthly on the 29th to 31st: the last day of shorter months, then
back.** A card on the 31st goes Jan 31, Feb 28 (29 in a leap year), Mar 31,
Apr 30, May 31. It never drifts down to the 28th for good, because the
series remembers the day it aims for (`seriesDay`). The rhythm line says so
in the editor whenever the day is 29 or later.

**3. Letting go of a repeating card means this one.** The series goes on:
the card is let go (not done, so it stays out of your Done record and the
"you finished" count) and the next one appears, exactly as with Mark done.
The confirmation says "Let go. The next one is due Thu, Oct 29." Letting go
of last week's missed order is the common case; ending the series is rare
and deliberate. To end one: open the card, set Repeats to "Doesn't repeat",
then Mark done (or Save, and let it go in tomorrow's triage). No next card
is made.

**4. What the next card keeps, and how they're linked.**
- It keeps: title, notes, category, hard or soft, project (Phase 2), the
  repeat rule, and where it came from (`source`). Notes come along because
  for repeating work they're often the recipe.
- It starts fresh: the new date, open (not In progress; you haven't
  started the new one), no manual order (a new date means date order in its
  zone, the same rule as every other date change), and its own created
  time.
- The finished card is never reused. It stays its own document with status
  `done` (or `let_go`), so your Done record keeps one row per time you did
  it: four weekly orders in a month are four rows, which is what an
  evaluation wants to see.
- Every card in a series carries the same `seriesId`: the id of the card
  the series started with. That's the link 1f can use (a repeat icon on Done
  rows, or "Weekly order, 4 times" when copying as text). Nothing in 1e
  reads it yet.
- The finished card and the new one are saved in one write: both or
  neither, so a refused save can't leave you with a done card and no next
  one, or two cards on the board.
- Your sample cards: a next card made from a card marked `sample: true`
  is marked `sample: true` too, so your clean-up script still finds it.

### Data

Three new card fields, only meaningful on repeating cards (null otherwise):

```
seriesId     string   the id of the first card in the series; shared by
                      every card in it
seriesDate   "YYYY-MM-DD"  the date the rhythm planned for this card.
                      Dragging and triage change dueDate, not this.
seriesDay    1 to 31  monthly only: the day of the month the series aims
                      for (31 means the last day in shorter months)
```

A card typed by hand in the console with only `repeat: "weekly"` still
works: a missing `seriesDate` is read as the card's due date, and a missing
`seriesDay` as that date's day. Turning repeat off clears `seriesDate` and
`seriesDay` and keeps `seriesId`, so the cards you already finished stay
linked.

### Files touched

```
index.html         the Repeats menu, its rhythm line, and the "Move the
                   series too" checkbox in the editor
css/horizon.css    the repeat label on cards
js/repeat.js       NEW: the next date, the rhythm in words, what a save
                   does to the series fields; no Firebase, no page
js/model.js        the three new fields, read with defaults
js/board.js        the repeat icon and label on cards
js/editor.js       the Repeats menu, its line, the checkbox; re-places
                   itself when a note makes it taller
js/firebase.js     a new repeating card gets its own id as seriesId;
                   finishing a card and adding the next in one write
js/app.js          Mark done and Let it go make the next card; the
                   confirmation; a drag or triage on a console-typed
                   repeating card writes down its series date first
```

### Setup steps (yours)

None. No rule changes (the rules check who writes, not which fields), no
new index.

### Decisions I made that the questions didn't cover (change any of them)

1. **The confirmation after finishing a repeating card**, with Edit for the
   new one. Without it, a card vanishes and another appears somewhere
   else, silently.
2. **"Move the series too" is off by default** when you change a repeating
   card's date in the editor.
3. **No ghost repeats** on the strip or the board: only real cards.
4. **Undated repeating cards count from the day you finish.**

### How to test

The editor:
- [ ] Open a card: "Repeats" sits under Due and Category, set to "Doesn't
      repeat". Choose Weekly: the line says "Every Thursday." (whatever
      the card's weekday is). Change the date: the line follows.
- [ ] Monthly on a card dated the 31st (or 29th, 30th): the line mentions
      the last day of shorter months. On the 5th it doesn't.
- [ ] Save: the card shows the icon and "Weekly" or "Monthly".
- [ ] In the console the card has `repeat`, `seriesId` (its own id),
      `seriesDate` (its date), and for monthly `seriesDay`.
- [ ] Enter in quick add, set Weekly and a date, Add card: same fields,
      `seriesId` is the new card's own id.

Marking done (try with `?today=` to stand on different days):
- [ ] Mark a weekly card done on its day: it leaves, a copy appears a week
      later, and the note says when. The copy has the same title, notes,
      category, hard/soft, and is not In progress. Edit in the note opens it.
- [ ] Mark one done early (test date before its due date): the next one is
      a week after its planned date, not a week after today.
- [ ] Mark one done three weeks late: only one new card, on the first
      planned date after today.
- [ ] Monthly on Jan 31 (or set one to Oct 31 and finish it): Nov 30, then
      finishing that gives Dec 31.
- [ ] A repeating card with no date: done gives a card due a week (or a
      month) from today.
- [ ] In the console, the old card is `done` with `completedAt`; the new
      one is `open` and shares its `seriesId`. A sample card's copy has
      `sample: true`.

Moving one vs. the series:
- [ ] Triage a weekly overdue card to Tomorrow, then mark it done: the next
      one is on the original weekday.
- [ ] Drag a repeating card to another day, mark it done: same.
- [ ] In the editor, change a repeating card's date: "Move the series too"
      appears, off. Save without it, mark done: next follows the old
      rhythm. Again with it checked: next follows the new date.

Letting go and stopping:
- [ ] Let go of an overdue repeating card in triage: the next one appears,
      and the note says "Let go." The old card is `let_go`, and "you
      finished" didn't go up.
- [ ] Set Repeats to "Doesn't repeat" and Mark done: no new card.

Looks:
- [ ] The card line reads like the mockup: "Thu, Oct 22 ⇄ Weekly", before
      In progress and after a hard deadline chip.
- [ ] Phone: the Repeats menu is full width, and the editor still fits.

What I checked here, in a real browser (Chromium) with a pretend Firebase,
Pacific time, test date Thu, Oct 22 (and Oct 27, Nov 10): 35 checks on the
date math alone (on time, early, late, a week late, three weeks late, a
card moved by triage, a card typed in the console, undated, Jan 31 to Feb
28 to Mar 31, leap years, December into January, the daylight saving
change), then 76 in the page, all passing, no console errors. In the page:
the icon and label on weekly and monthly cards, in the mockup's order and
color, with "Repeats weekly" for a screen reader; the editor's menu, rhythm
line, and "Move the series too" appearing and hiding as the date changes;
Mark done saving the old card and the new one in one write, with every
kept and fresh field checked; Edit in the note opening the new card beside
it; the series moved on purpose; a console card with only `repeat` (and
`sample: true`) getting its series written down and its copy keeping
`sample`; the 31st becoming Nov 30 and remembering 31; an undated card;
stopping a series; turning repeat on for a plain card and for a new card;
Let it go in triage making the next card, saying "Let go.", and not
counting as finished; triage, a strip-day drop, and a zone drop each moving
the card but not the series, then finishing on Oct 27 landing back on
Thursday and Saturday; a refused save leaving the card untouched with no
new card and the usual message; "you finished" going up and the strip
gaining the next card; and at phone width, the 44px menu and checkbox with
no sideways scroll.

One bug the checks caught, fixed: the editor places itself when it opens,
and "Move the series too" appearing afterward made it taller, pushing its
buttons off the bottom of a shorter window. It now re-places itself
whenever its notes change. That also fixes an older, smaller case of the
same thing: the "No date: this card lives in Someday." line appearing
after you clear the date.

Not checked: real Firestore, a real phone, and the 1a to 1d checks from
earlier sessions (their test setup wasn't saved in the repo, so I couldn't
rerun them). I only touched the drag and triage code where it saves a date,
so I'd still give dragging and triage a quick pass.

## Slice 1d: deadlines, morning triage, Let it go, Since yesterday, the 14-day strip, `?today=`

### Revisions after your first test (confirmed)

You said: opening a card on the left means a big head turn to the editor on
the far right; and the strip shows busy days well but feels like it should
do something. You picked the editor beside the card, made smart about which
side, plus two strip features: drop a card on a day, and tap a day to
highlight its cards.

**1. The editor opens beside the card** (screens wider than 760px; phones
keep the full-screen panel, since there's no room beside anything there).
- It's the same form, 420px wide, as tall as its contents need, and never
  taller than the window (the middle scrolls if it has to).
- **Which side:** to the right of the card when there's room, otherwise to
  the left. So Overdue, Today, and This Week cards open to their right;
  Next Two Weeks, Later, and Someday drawer cards open to their left. On a
  narrower window where neither side has room, it takes the side with more
  room and slides over just enough to stay on screen.
- **Up and down:** its top lines up with the card's top, then shifts up
  if it would run off the bottom of the window. A card near the bottom
  gets an editor that sits higher; it never hangs off screen.
- It follows the card if the window is resized or the board scrolls while
  it's open.
- The card you're editing gets a blue outline, and the dimming behind the
  editor is lighter (so the card stays easy to see beside it).
- It slides in from the card's side, a short distance, instead of from the
  far right edge.
- **A new card** (Enter in quick add) has no card to sit beside yet, so its
  editor opens just under the quick add field, lined up with it.
- **"Edit" in the quick add confirmation** opens beside the new card if
  it's on the board or in the open drawer; if it went to a closed Someday,
  under the quick add field.

**2. Drop a card on a strip day.** Drag any card onto a tile and it gets
that exact date, with no date box. The tile under the card gets the same
blue outline zones get. Since you picked an exact date, the card lands in
date order in whatever zone that date belongs to (its `order` is cleared).
Dropping on the card's own date does nothing. On a phone, hold the card,
drag it up to the strip (the page scrolls up near the top edge), and
dragging near the strip's left or right edge scrolls the strip.

**3. Tap a day to highlight its cards.** Each tile becomes a button. Tap it
and the board dims every card except the ones due that day, which get a
blue outline (so it doesn't rely on color alone), and the board scrolls to
the zone they're in (on a phone, it swipes over to that zone). The tile
stays pressed. Tap it again, or press Escape, to clear; tap another day to
switch. The shared spot beside quick add says what's showing ("Showing 4
cards due Tue, Oct 27. Tap the day again or press Escape to clear.", with
the Escape part left off on a phone, which has no Escape key) and
fades like a confirmation, which also tells a screen reader what happened.
An empty day says "Nothing due Tue, Oct 27." and doesn't dim anything. The
highlight clears itself at midnight, since the strip moves on.

**4. Tiles grow from 40 to 44px wide**, to meet SPEC's 44px touch target
now that they're buttons. The strip becomes about 668px on a desktop, which
still fits beside the wordmark at the mockup's width. On a phone it already
scrolls sideways.

**5. Triage buttons that fit at any width** (added after your half-screen
screenshot). Below about 1,300px of window the zones stop shrinking and
scroll sideways instead, and Overdue settles at its narrowest: each
button was 52px wide while "Tomorrow" needs 63px, so the word ran out of
its button. Now the triage section watches its own width and, when it's
under 145px, stacks the buttons in one column, full width, in the same
order (Tomorrow, This week, Someday, Let it go). That's every window
narrower than about 1,400px; at 1,440px and wider it keeps the mockup's 2 by 2.
Separately, on a Sunday (three buttons) the last one spans the whole row
instead of sitting alone beside an empty space. CSS only.

**6. A busy day shows its number on the strip** (added after you asked
what happens with a huge number of cards on one day). The dots stopped at
4, so a day with 4 cards and a day with 25 looked the same: the strip went
quiet exactly when a day got truly busy. Now 1 to 4 cards are still dots,
as in the mockup. From 5 on, the dots give way to the count itself in IBM
Plex Mono (SPEC's font for every count), in the strip's blue, or white on
today's tile. 100 or more reads "99+" so it never outgrows the tile.
Nothing else about the tile changes size. Checked at desktop and phone
width: 1 and 4 cards as dots, 5 and 12 as numbers (white on today), 120 as
"99+" inside its tile, the hidden label always exact, every tile still
44 by 56, and the earlier 132 checks still passing.

The other ideas from that conversation stay proposals: pinning each zone's
header while you scroll a long column, and (rejected) folding a long zone
into "Show 12 more", which tidies the board by hiding what you need to see.

**7. A setting to fold long zones** (you asked for it after seeing 21
sample cards in Next Two Weeks). Off by default, so the board shows every
card unless you choose otherwise.
- **Where:** a new Settings button (a gear icon, labeled "Settings" for
  screen readers) beside Sign out opens a small box with one checkbox,
  "Fold long zones". It saves the moment you click it. Future settings
  (editing your categories, which SPEC promises) can live in the same box.
- **What it does when on:** This Week, Next Two Weeks, and Later show their
  first 5 cards (the soonest, or your arranged order), then a "+16 more"
  button. Click it and the zone opens fully, with "Show fewer" at the
  bottom. A zone only folds when at least 2 cards would be hidden; a
  "+1 more" button would take as much room as the card it hides.
- **Overdue and Today never fold.** They're what you act on now, and
  hiding overdue work is the one thing the board must not do.
- The zone's count still shows the full number (21), and the strip is
  unchanged, so a folded zone never hides how much is in it.
- Tapping a strip day whose cards are folded away opens that zone so the
  highlight has something to show.
- An opened zone stays open until you fold it again or reload the page.
- Dragging into a folded zone works as before: the card lands where the
  gap shows, among the visible cards.
- **Stored** on your profile document as `settings.foldLongZones`
  (true/false), so it follows you to every device. Another device that's
  already open picks up the change on its next reload.

Checked here (33 checks, plus the earlier 148 still passing, no console
errors): off by default with every card showing; the gear opens the box
and the change saves at once; This Week, Next Two Weeks, and Later fold to
their 5 soonest while Overdue, Today, and a 6-card Later don't; the count
keeps the full number; "+16 more" opens the zone and puts keyboard focus
on the first card that was hidden, "Show fewer" folds it and puts focus
back on the button; an opened zone survives the board redrawing; a strip
day hidden in the fold opens the zone and clearing it folds it back; a
drag into a folded zone shows the gap after the 5 visible cards and saves;
a refused save puts the checkbox and board back with a message; the
setting applies on load when stored; Sign out ignores a click right after
the box closes; on a phone the gear sits beside Sign out at 44px and the
box fits the screen.

**8. A clear sign of where a dragged card will land** (your last note for
this slice). Dragging from low in a long column over a short one worked,
but showed nothing near the pointer: the short zone's blue outline wraps
only its own box, and its landing gap sits under its last card, both far
above and often off screen. Two fixes that work together:
- **Columns become full-height lanes while you drag.** Every zone
  stretches down to the bottom of the tallest one, so the zone under the
  pointer lights up right there. Cards don't move and the page doesn't
  grow (the tallest zone already sets the height); when you let go, the
  zones go back to their own heights.
- **A label rides on the dragged card** naming where it will land: "Move
  to This Week", "Move to Tue, Oct 27" over a strip day, "Move to Today"
  over today's tile or Today, "Move to Someday". It appears only when the
  card would actually go somewhere new: reordering within its own zone,
  or hovering its own strip day, shows nothing. It's on the card itself,
  so it shows even when the lane is out of view, and on a phone. Over
  Overdue (which refuses drops) there's no label and no outline, as now.
  On a phone it slides sideways to stay on screen when the card hangs off
  an edge under your finger.
- **The board holds its height while you drag** (found while testing this,
  and older than this round: it came with 1c). When a card leaves a long
  column, that column gets a card shorter, and so did the page and every
  lane beside it. Scrolled to the bottom, everything jumped by a card's
  height, and the pointer ended up below the shortened lanes. Now the
  board keeps the height it had when the card lifted, until you let go.

Checked here (20 checks, plus every earlier set again, 201 checks in all,
no console errors): low beside a 12-card Today, the 1-card This Week is
the target, its lane reaches the pointer, the label reads "Move to This
Week", and the page neither grows nor jumps; back over its own zone, no
label; over Overdue, no outline and no label; the drop opens the date box
and moves the card; the lanes shrink back after; over its own strip day,
nothing; another day, "Move to Tue, Oct 27", still on screen at the top;
today's tile, "Move to Today"; the Someday tab, "Move to Someday"; Escape
puts it back. On a phone, after one hop the label says "Move to This
Week" and stays fully on screen with the finger at the middle and at
either edge.

Files touched: `js/place.js` (NEW: the beside-the-card math, no page),
`js/editor.js` (opens beside an anchor, follows it), `js/strip.js` (tiles as
buttons and drop targets, the pressed day), `js/board.js` (highlighted and
dimmed cards), `js/quickadd.js` (a fading note for the shared spot),
`js/drag.js` (the strip scrolls during a drag), `js/app.js` (wiring),
`css/horizon.css`; for revision 7, also `js/settings.js` (NEW: the
Settings box), `js/firebase.js` and `js/model.js` (the `settings` field on
your profile), and `index.html` (the button and the box). No rule
changes.

Test list for this round:
- [ ] Desktop: click a card in Overdue, Today, and This Week: the editor
      opens to its right, top lined up with the card. Next Two Weeks,
      Later, and a drawer card: to its left.
- [ ] A card near the bottom of the window: the editor shifts up and fits.
- [ ] Narrow the window (about 900px wide): it still opens fully on screen.
- [ ] The edited card has a blue outline while the editor is open.
- [ ] Enter in quick add: the new-card editor opens under the field.
- [ ] Phone: the editor is still full screen.
- [ ] Drag a card onto a strip day: it gets that date and moves to the
      zone that date belongs to. Drop it on its own day: nothing changes.
- [ ] Tap a day with cards: others dim, its cards are outlined, the board
      scrolls to them, the note appears. Tap again or press Escape: back to
      normal. Tap an empty day: "Nothing due ..." and no dimming.
- [ ] Phone: tap a day whose cards are in a far zone: the board swipes to
      that zone.
- [ ] Half-screen window: overdue triage buttons stack in one column and
      every word fits inside its button. Full screen: 2 by 2.
- [ ] On a Sunday: Let it go spans the row under Tomorrow and Someday
      (or simply sits last, when stacked).
- [ ] Put 5 or more cards on one day: its strip tile shows the number
      instead of dots. 4 cards: 4 dots. On today's tile the number is white.
- [ ] Settings (the gear beside Sign out): "Fold long zones" is off. Turn
      it on: a zone with 7 or more cards shows 5 and "+N more"; Overdue
      and Today show everything. The zone count still shows the total.
- [ ] "+N more" opens the zone; "Show fewer" folds it again.
- [ ] Tap a strip day whose cards are folded away: the zone opens and
      they're outlined.
- [ ] Reload, and open the board on another device: the setting stuck. In
      the console, your `users` document has `settings.foldLongZones`.
- [ ] Turn it off: every card shows again.
- [ ] Scroll to the bottom of a long column and drag a card sideways over
      a short column: that column's lane lights up beside the pointer, and
      the card says "Move to ..." with the zone's name. Let go: it moves.
- [ ] Drag within the card's own column: no label. Over a strip day: the
      date. Over Someday: "Move to Someday". Over Overdue: nothing.
- [ ] Scrolled to the very bottom, drag the last card of a long column
      sideways: nothing jumps.

What I checked here, the same way as before (pretend Firebase, clock on
Thursday, Oct 22): 56 new checks, plus the first round's 76 again, all
passing, no console errors. The editor opens to the right of Overdue,
Today, and This Week cards and to the left of Next Two Weeks, Later, and
drawer cards, 12px from the card, top lined up; a card low in the window
gets an editor shifted up to fit; at 900px wide every card's editor stays
fully on screen; it follows the page when you scroll; it turns full screen
if the window shrinks to phone width while it's open, and back; the card
outline comes and goes; clicking outside, saving, and Escape still work;
the new card editor sits under quick add with the cursor in the date. On
the strip: 44px tiles; tapping highlights, switches, and clears (tap again
or Escape, but Escape inside the editor only closes the editor); the
highlight survives the board redrawing; an empty day dims nothing; on a
phone the board swipes to the right zone. Dropping on a day sets the date
with `order` cleared and no picker; dropping on the card's own day writes
nothing; a Someday card can be dropped on a day; with the page scrolled
down, dragging to the top edge scrolls up until the strip is in reach;
dropping on zones still works. Two things the screenshots caught, fixed:
on a phone the pressed day's outline was clipped by the strip's scrolling
box, and the note told phone users to press Escape.

### What it does

**Hard and soft deadlines.** The editor gets a "Hard deadline" checkbox
under "In progress", with the line "A real outside cutoff. It never gets a
Let it go button." Every card is soft unless you check it; your existing
cards already read as soft. On the board:
- A hard card due today or overdue shows the orange "Hard deadline" chip
  (`#9A3F06` on `#FDEBDD`), as in the mockup's Today column.
- A hard card further out, or in Someday, shows the gray outlined chip, as
  in the mockup's Later column.
- Nothing else is orange.

**Morning triage.** On the first open of the day (what that means is
question 3 below), every soft card in Overdue gets the mockup's dashed
section: "Still on your plate?" and four buttons.
- **Tomorrow:** due tomorrow.
- **This week:** due on the last day of This Week (Sunday, since weeks run
  Monday to Sunday). "This week" reads as "by the end of the week", and it
  gives the card the most room before it comes back to Overdue. On a
  Sunday This Week has no days left (the zone already refuses drops then),
  so the button isn't shown and the card gets three.
- **Someday:** the date is cleared and the card goes to the drawer.
- **Let it go:** the card's status becomes `let_go` with a `letGoAt` time,
  and it leaves the board. It stays in Firestore for the Done view's
  "let go" section in 1f.

Hard cards never get triage buttons. SPEC says they "never offer Let it go;
they stay until I act on them directly", and I read "directly" as: open the
card and decide. A missed hard deadline shouldn't be one tap from being
quietly pushed to tomorrow. They keep the orange chip and "N days late"
until you do. (If you'd rather they get Tomorrow, This week, and Someday,
that's a small change.)

After you press a triage button, keyboard focus moves to the next overdue
card's buttons, so a keyboard user can work down the column.

**Since yesterday.** The line beside quick add, worded as in the mockup:
"Since yesterday: **2 cards moved into Today**, and you finished 3."
- *Moved into Today* counts the cards due today that already existed before
  today began. Cards you add today don't count (they were added, not
  moved). A Today card you finish keeps counting, so finishing things
  doesn't shrink the number.
- *Finished* counts cards marked done since your previous visit began. Let
  go cards don't count: letting go isn't finishing.
- It stays live: mark a card done and "you finished 3" becomes 4.
- When your previous visit wasn't yesterday, the label says so: "Since
  Friday:" after a weekend, "Since Oct 12:" after a longer gap. The mockup's
  "Since yesterday" would be untrue on a Monday.
- Zero cases read plainly: "Since yesterday: 2 cards moved into Today." (no
  finished clause when nothing was finished), "Since Friday: nothing new in
  Today, and you finished 2.", "Since yesterday: nothing new in Today."
- With no earlier visit on record (your first day with 1d, including the
  day you test this) the line doesn't show. `?today=` lets you see it right
  away; see "How to test".

**The 14-day strip.** In the header after the wordmark, as in the mockup:
14 small tiles starting today, each with the weekday, the date, and one
blue dot per open card due that day. Today is solid blue with white dots;
Saturday and Sunday are lighter. Up to 4 cards show as dots; 5 or more
show the number instead (revision 6 below). A screen reader hears the real
number either way ("Thursday, Oct 22: 6 cards due"). Overdue cards don't
show on the strip: it starts at today.

**`?today=2026-10-22`.** Add it to the address and the whole app treats
that date as today: zones, "days late", triage, Since yesterday, the strip,
and the dates that drags and triage buttons pick. It never rewrites a
stored date by itself. Two safety rules while it's on:
- A thin bar at the top says "Testing: the board is treating Thu, Oct 22 as
  today. Changes you make still save." with a link back to the real today.
  Things you *do* in test mode are real saves: pressing Tomorrow under
  `?today=2026-10-30` really sets Oct 31. The bar keeps that from being a
  surprise, and keeps a forgotten test link from looking like a broken
  board.
- It never writes your visit record (question 3), so testing can't spoil
  tomorrow morning's real triage or Since yesterday line. Triage is always
  on in test mode, so you can see it whenever you like.

A value that isn't a real date (`?today=2026-13-40`) is ignored, and the bar
says so.

### The four open questions, settled

**1. Triage and `order`, and the click area.** Tomorrow, This week, and
Someday save the new date with `order: null`, the same rule as the editor
(see order.js), so the card falls into date order in its new zone. The
buttons get `position: relative; z-index: 1` so they sit above the card's
stretched click area; the gaps between them and the "Still on your plate?"
text still open the editor, like the rest of the card. drag.js already
ignores presses on buttons, so pressing a triage button never lifts the
card.

**2. Sharing the spot beside quick add.** The Since yesterday line is what
normally sits there. A quick add confirmation ("Added to Someday. Edit")
takes the spot, stays 6 seconds, then fades and gives it back. While your
mouse is over it, or keyboard focus is on its Edit button, the clock waits,
so the Edit button never vanishes from under you. An error ("Couldn't save
...") doesn't fade: it stays until your next quick add, because an error
you missed is worse than a line you have to look past.

**3. What counts as a visit, and where it's stored.** A visit is the board
on screen: it loads in a tab you're looking at, or you come back to a tab
or window that was already open, or the date changes while you're looking
at it. A tab sitting unseen in the background never counts, so a laptop tab
you forgot about can't use up the morning's triage at midnight.

It's stored on your profile document, `users/{uid}`, in four fields:

```
lastVisitDay   "2026-10-23"   the most recent day you opened the board
lastVisitAt    timestamp      when you first opened it that day
sinceDay       "2026-10-22"   the visit day before that one
sinceAt        timestamp      when that visit began
```

The first visit of a new day moves `lastVisit...` into `since...` and
writes today into `lastVisit...`. That's one write a day; every other visit
that day writes nothing. "First open of the day" means `lastVisitDay` was
before today. The Since yesterday line counts from `sinceAt`.

Why the start of the previous visit, not its end: finishing cards only
happens during a visit, so counting from when yesterday's visit began
catches yesterday's work, which is what "you finished 3" in the morning
means. Counting from the end of yesterday's visit would almost always say
"you finished 0" at 8am. It also means nothing has to be written when you
close a tab, which browsers don't reliably allow.

Triage belongs to the tab where the day's first visit happened, and it
stays there all day, even if that tab reloads (phones reload background
tabs on their own). That memory lives in the tab itself (the browser's
`sessionStorage`), not in Firestore. A second tab, or your other device,
opened later that day shows no triage. That's SPEC read literally: "the
first time I open the board each day". The catch: a quick glance at your
phone in bed would use up the triage you meant to do at your desk. If that
happens to you, the alternative is "the first open of the day on each
device", which is a small change.

**4. On a phone.** The strip moves to its own row under the wordmark, full
width, and scrolls sideways inside itself (about 8 days show at once, the
rest a swipe away), the same way the zones scroll inside their own box.
Shrinking 14 tiles to fit 358px would make each one about 25px wide, too
small to read. The page itself still never scrolls sideways. The triage
buttons stay a 2 by 2 grid inside the Overdue card: a phone's Overdue zone
is about 320px wide, so each button is about 130px by 44px, a comfortable
target. Overdue is the first zone, the one a phone opens on, so the
morning's triage is the first thing you see, with Today peeking in at the
right. The Since yesterday line wraps under the quick add field.

### Files touched

```
index.html         the strip in the header; the testing bar; the Since
                   yesterday line beside the quick add status; the Hard
                   deadline checkbox in the editor
css/horizon.css    chips, triage section, strip (and its phone row),
                   the shared spot's fade, the testing bar
js/dates.js        todayISO() honors ?today=; pretendToday() says whether
                   it's on
js/model.js        cards carry completedAt and letGoAt when read
js/board.js        the chips and the triage section on cards
js/strip.js        NEW: draws the 14-day strip; no Firebase
js/since.js        NEW: works out the Since yesterday line's words; no
                   Firebase, no page
js/visits.js       NEW: decides whether a visit is the day's first and
                   what to write; no Firebase, no page
js/quickadd.js     owns the shared spot: confirmation, fade, the line
js/editor.js       the Hard deadline checkbox
js/firebase.js     the visit record; letGo(); a watch on cards finished
                   since a given time
js/app.js          wires it together: claims the day's visit, handles
                   triage buttons, keeps the line live
```

### Setup steps (yours)

None. No new rules: the profile document is already yours to write. No new
index: the "finished since" lookup filters on one field (`completedAt`),
which Firestore indexes by itself. The status check happens in the browser.

### Decisions I made that SPEC doesn't cover (change any of them)

1. **Hard cards get no triage at all** (see above).
2. **"This week" means the last day of This Week**, and it's hidden on
   Sundays.
3. **The Since yesterday label names the real day** when the last visit
   wasn't yesterday.
4. **"Moved into Today" leaves out cards added today** and keeps cards
   finished today.
5. **The strip's dots stop at 4**, as in the mockup source, and the number
   takes over from 5 (revision 6).
6. **The testing bar**, and test mode never writing the visit record.
7. **Triage is per account, not per device**, and survives a reload of
   the tab that got it.

### Proposals (not built; say yes and I'll add them)

- **Undo for Let it go** (and Mark done): "Let go. Undo" in the shared spot
  for its 6 seconds. Let it go is one tap on a phone, and until 1f the only
  way back is the Firebase console.
- **Let it go in the editor**, for soft cards anywhere on the board. Right
  now it only exists in morning triage, so an unwanted card that isn't
  overdue can only be marked done, which would put it in your Done record.
- **Triage per device** instead of per account (see question 3).

### How to test

Hard and soft:
- [ ] Open a card: a "Hard deadline" checkbox sits under "In progress".
      Check it and save: a card due today or earlier shows the orange chip;
      one due later shows the gray outlined chip. Uncheck: the chip goes.
- [ ] In the console the card has `deadlineType: "hard"`, then `"soft"`.
- [ ] A new card from Enter in quick add can be made hard before Add card.

Triage (easiest with a test date; cards dated before it are overdue):
- [ ] Open the board with `?today=` set a few days ahead. The testing bar
      shows. Every soft card in Overdue has "Still on your plate?" and four
      buttons. Hard overdue cards have the orange chip and no buttons.
- [ ] Tomorrow: the card moves to the day after the test date. This week:
      it moves to that week's Sunday. Someday: it goes into the drawer.
      Let it go: it leaves the board; in the console it has
      `status: "let_go"` and a `letGoAt` time.
- [ ] Reorder a card by dragging, then triage it: in the console its
      `order` is `null`.
- [ ] Clicking the gap between buttons, or "Still on your plate?", opens
      the editor. Pressing and dragging a button never lifts the card.
- [ ] With a Sunday test date (`?today=2026-10-25`), cards show three
      buttons, no This week.
- [ ] Tab to a triage button and press Enter: focus lands on the next
      overdue card's first button.
- [ ] Without `?today=`, real time: the first time you open the board on
      a new day, overdue soft cards show triage. Reload that tab: still
      there. Open the board in a second tab: no triage.

Since yesterday:
- [ ] Today (your first day with 1d) the line doesn't show without a test
      date. Open the board once normally first (that writes today's visit),
      then with `?today=` set to tomorrow it reads "Since yesterday: ..."
      and counts tomorrow's cards as moved into Today.
- [ ] Mark a card done in test mode: "you finished" goes up by one.
- [ ] `?today=` set three days ahead: the label names your real last
      visit's weekday ("Since Friday:"). Eight days ahead: it names the date
      ("Since Oct 23:").
- [ ] Tomorrow, with no test date, the line appears for real.
- [ ] Ctrl+Enter a card: "Added to Someday. Edit" takes the spot, then
      fades after about 6 seconds and the Since line comes back. Hover the
      confirmation: it waits until you move away.

The strip:
- [ ] 14 tiles from today, today in solid blue, weekends lighter, one dot
      per card due (up to 4). With a test date, the strip starts there.
- [ ] Phone width: the strip is its own row under the wordmark and swipes
      sideways; the page doesn't.

`?today=`:
- [ ] The bar's link takes you back to the real today.
- [ ] `?today=garbage` shows the bar saying it was ignored, and the board
      uses the real date.
- [ ] After testing, open the board normally: your real visit record (in
      the console, on your `users` document) wasn't changed by the test
      visits.

What I checked here, in a real browser (Chromium) with a pretend Firebase
and the clock set to Thursday, Oct 22, Pacific time: 76 checks plus a 1c
drag regression, all passing, no console errors or warnings. Specifically:
triage on every soft overdue card and none on hard ones; each button's
saved date (Tomorrow Oct 23, This week Oct 25, Someday none) with `order`
cleared; Let it go's status and time; three buttons on a Sunday; a click
on the prompt opening the editor, a click on a button not; pressing a
button and dragging never lifting the card, while the title still drags;
keyboard focus moving to the next card; orange and gray chips in the
right places, with the exact mockup colors; the Since line's wording and
counts (a card added today left out, a card finished in another session
counted, a card done then reopened not counted), live after Mark done, and
its "Wednesday" and "Oct 21" labels; the confirmation leaving after 6
seconds, waiting while hovered; the strip's 14 tiles, weekends, dot cap,
and hidden labels; the visit record written once on the first open,
nothing on a reload or a second tab, triage kept through a reload and
absent in the second tab; a tab loaded out of sight waiting until it's
looked at; the new day claimed at midnight in an open tab; test mode never
writing the visit record; bad and impossible test dates ignored with the
bar saying so; no line on the first day with no record; and at phone
width, the strip in its own swiping row, 128 by 44px triage buttons, taps
working, and no sideways page scroll (that check caught one real bug,
fixed: the strip's hidden labels were widening the page). Screenshots at
desktop and phone width looked right against the mockup.

Not checked: real Firestore saves, a real phone in your hand, and a real
overnight. The visit logic around midnight and returning to a tab is the
part most worth living with for a few days.

## Slice 1c: drag to reschedule, reorder within zones, the Someday drawer

### Revisions after your first test

You said: the phone drawer shows a sliver of the board on its left; the
phone needs more tuning in general; and while reordering it's hard to see
where a card will land, partly because the dragged card hides the column.
You picked "snap zone to zone" and "bottom pill" from the options I offered.

**1. Clearer landing spot (phone and desktop).** The thin blue line becomes
an empty slot the same height as the card you're dragging, with a dashed
blue border. The cards around it visibly part to make room. The faded copy
left behind at the card's old spot goes away, so there's only one gap on
the board, and it is exactly where the card will land. Leaving a zone
closes its gap.

**2. Zones snap on a phone** (screens up to 760px wide, which is where the
earlier phone styles already start). Each zone is nearly the full screen
width, capped at 420px on bigger screens like a tablet, with the next zone
peeking in at the right edge. A swipe settles on one whole zone instead of
leaving one and a half cut off. This stays within SPEC: zones still scroll
sideways inside their own container. While dragging, holding a card near
the left or right edge hops one zone over, then pauses before hopping again,
instead of sliding continuously (sliding fights the snapping). On desktop
nothing changes.

**3. Someday on a phone is a pill, not a side tab.** The 52px tab took about
13% of the phone's width. On phones it becomes a small "Someday 3" pill
floating at the bottom right. Tap it and the drawer opens as a full-screen
sheet, edge to edge (so no sliver), with its own close button at the top.
Dragging a card out of the sheet tucks it away as before, and you can drop a
card on the pill to send it to Someday. The board gets extra room at the
bottom so the pill never sits on top of the last card. Desktop keeps the
mockup's tab.

**4. Small phone tidying** that comes with the above: the header and board
use 16px side margins instead of 32px, and the "Enter" key hint in quick add
is hidden on phones, which have no physical Enter key to hint at.

**5. A double-click on a panel's X can't sign you out** (added after your
second note). The editor's X, and on a phone the Someday sheet's X, sit
right over the Sign out button. A double-click on the X closed the panel
with the first click and signed you out with the second. Now Sign out
ignores clicks for 0.6 seconds after any panel closes (the editor, the
Someday sheet, the date box). A double-click lands well inside that window,
and nobody signs out on purpose that fast, so it costs nothing when you do
mean it. The other fix I considered, an "Are you sure?" step on Sign out,
would also catch a stray single click, but it adds a step every time. Say if
you'd like it anyway.

Files touched: `js/app.js` (the Sign out guard), `js/drag.js` (the slot, zone hopping), `js/someday.js` and
`index.html` (the sheet's close button), `css/horizon.css` (everything
visual). No data or Firebase changes.

Test list for this round:
- [ ] Desktop and phone: drag a card within a column. A card-sized dashed
      gap opens where it will land, and nothing is left at its old spot.
      Escape brings it back.
- [ ] Phone: swipe the board; it settles on one zone, with the next one
      peeking in.
- [ ] Phone: hold a card and drag it to the right edge; the board hops one
      zone, waits, then hops again if you keep holding there.
- [ ] Phone: the "Someday" pill sits at the bottom right with the count.
      Tap it: the drawer fills the screen with no board showing, and the X
      closes it.
- [ ] Phone: drag a card from the sheet onto a zone; drag a board card onto
      the pill.
- [ ] Phone: scroll to the bottom of a long zone; the last card clears the
      pill.
- [ ] Desktop: the side tab and drawer look and work as before.
- [ ] Open a card, then double-click the panel's X: the panel closes and
      you're still signed in. Wait a moment, click Sign out: it works.

What I checked here, with the same pretend Firebase and simulated touch:
the whole first-round list again plus this round's (80 checks, all
passing, no console errors). Specifically: the slot matches the dragged
card's height, there is only ever one slot, and Escape restores the card;
a swipe settles with a zone lined up at the left edge; holding at the right
edge hops one zone (330px on a 390px screen), pauses, then hops again, with
the zone under the finger outlined; the pill sits at the bottom right; the
sheet covers the full screen at both 390px and 430px wide (so no sliver),
its X closes it, and it takes focus when it opens; dropping a card on the
pill sends it to Someday. Not checked: a real phone in your hand, where
swipe feel and hop timing are worth judging for yourself.

### What it does

**Dragging.** Grab any card and drag it. A blue line shows where it will land
and the zone under it gets a blue outline.

- **Into Today:** the card gets today's date at once.
- **Into This Week, Next Two Weeks, or Later:** a small "Move to This Week"
  box opens with a date already filled in: the first day of that range
  (tomorrow for This Week, the next Monday for Next Two Weeks, the day after
  the Next Two Weeks range for Later). Press Enter or Move to accept it, or
  pick another date. Cancel or Escape leaves the card where it was.
- **Within the same zone:** the card just changes places. Its date stays.
- **Into Overdue:** refused (no outline, no line). Nobody means to schedule
  something in the past. Reordering cards that are already in Overdue works.
- **On a Sunday,** This Week is empty ("nothing left this week") and refuses
  drops too.
- **Escape** while dragging puts the card back.

**The Someday drawer.** The tab on the right edge, styled as in the mockup,
shows "Someday" and the count of undated cards. Click it and a drawer opens
between the board and the tab, listing every undated card. Newest cards sit
on top until you arrange them. Click a card in the drawer to edit it, the
same as on the board.

- Drag a drawer card onto a zone: it gets a date, by the same rules as above.
- Drag a board card into the drawer: its date is cleared. Drop it on the
  closed tab and it goes to the top of the drawer.
- Cards inside the drawer can be reordered too.
- The drawer stays open while you drag, so you can change your mind and drop
  the card back. On a phone the open drawer covers the board, so it tucks
  itself away the moment you start dragging a card out of it.

The mockup only shows the closed tab, so the open drawer is my design within
the SPEC palette: the tab keeps its mockup look, and the drawer is a
`#FBFAF6` column, 300px wide, with "Someday" as a heading, the count, and
one line: "No date yet. Drag a card onto the board to give it one."

### The three open questions, settled

**1. The "Added to Someday. Edit" line stays.** It was never only about
Someday: it is also the only confirmation that Shift+Enter landed in Today
and that a new card went to "Fri, Oct 30". And with the drawer closed, a
Ctrl+Enter add still changes nothing you can see except a number on the tab.
The Edit button stays useful for catching a typo the second after you press
Enter. One note for 1d: the Since yesterday line will want the same spot, so
1d should probably make this confirmation fade after a few seconds and give
the spot back.

**2. Manual order is one optional number per card, `order`.**

- A card you have never dragged has no `order` (it's `null`), and it sorts
  by date, exactly as it did in 1a and 1b. Your existing cards need no
  change.
- When you drop a card, it gets an `order` that puts it between its new
  neighbors. Usually only that one card is written. If two neighbors are tied
  (two cards due the same day with nothing to tell them apart), the cards
  below get a small nudge, and those are saved too, all in one write.
- The trick that keeps this sane as time passes: the numbers are on the same
  scale as dates, one step per day. A card you place "above the Friday card"
  gets a number just under Friday's. So when a new card with a later date
  shows up in that zone, it lands by its date around the cards you arranged,
  and when days pass and cards drift into a new zone, your arrangement comes
  along instead of turning into nonsense.
- Changing a card's date any other way (the editor, and later 1d's triage
  buttons) clears its `order`, so it falls back to date order in its new
  zone. A number left over from the old zone would put it somewhere
  arbitrary.
- In the Someday drawer there are no dates, so the scale there is "when it
  was created, newest first" instead.

The rejected alternatives: a plain 1, 2, 3 position per zone (zones change
every midnight, so "position 2" in This Week means nothing once the card
drifts into Today), and date order with manual order only among same-day
cards (then dragging a Saturday card above a Friday card would snap back,
which feels broken).

**3. On a phone, press and hold a card for about a third of a second, then
drag.** A quick swipe still scrolls the board, because the zones scroll
sideways inside their own container on narrow screens and the page scrolls
down. Holding is how the phone tells "I want to scroll" from "I want to pick
this up". Once a card is lifted, scrolling stops so the card follows your
finger, and the board scrolls by itself when you drag near an edge (this
works with a mouse too). A plain tap still opens the editor. On a computer
it's an ordinary drag: press, move a few pixels, and the card lifts.

How it's built: one piece of code handles mouse, touch, and pen alike
(browsers call these "pointer events"). The browser's built-in drag and drop
was the other option, but it doesn't work on most phones, which would have
meant writing touch dragging separately anyway.

### Decisions I made that SPEC doesn't cover (change any of them)

1. **Later accepts drops** and opens the date picker preset to its first day.
   SPEC names Today, This Week, and Next Two Weeks; leaving Later out would
   mean the only way to push something far out is the editor.
2. **Overdue refuses drops** from other zones and the drawer (see above).
3. **The date picker allows any date**, not just dates inside the zone you
   dropped on. If you pick one outside it, the card goes where its date says,
   in date order.
4. **The drawer is closed when the page loads.** Remembering open or closed
   between visits is a proposal below.
5. **Opening the drawer narrows the board.** On a typical laptop the five
   zones then don't quite fit, so they scroll sideways inside their own area
   (never the whole page), and dragging near the edge scrolls them for you.

### Files touched

```
index.html         the Someday drawer and its tab; the date picker box
css/horizon.css    drawer, tab, picker, drag visuals
js/model.js        cards gain an `order` field (null by default)
js/dates.js        dayNumber(): a date as a count of days, for ordering
js/order.js        NEW: how cards sort within a zone, and where a dropped
                   card's number goes; no Firebase, no page
js/board.js        sorts with order.js; draws the drawer's cards; marks
                   zones as drop targets
js/drag.js         NEW: the dragging itself (mouse, touch, pen); reports
                   "card X dropped on zone Y at position N"; no Firebase
js/someday.js      NEW: opening and closing the drawer
js/datepick.js     NEW: the "Move to This Week" box
js/firebase.js     saveCards(): several card changes in one write
js/app.js          decides what a drop means and saves it; clears `order`
                   when the editor changes a date; holds off redrawing the
                   board while a card is mid-drag
```

The same split as before: dragging, the drawer, and the picker only report
what you did. `app.js` decides what that means and saves it.

### Setup steps (yours)

None. No new rules, no new index. The cards query is unchanged; sorting
happens in the browser.

### Proposals (not built; say yes and I'll add them)

- **Keyboard reordering.** Dragging needs a mouse or a finger. Moving a
  focused card up or down with Alt+Arrow keys would cover keyboard use. (A
  keyboard user can already reschedule through the editor's date field.)
- **Remember the drawer** open or closed on this device between visits.
- **Quick day buttons in the picker** (Fri, Sat, Sun for This Week) in place
  of, or beside, the calendar field. One tap instead of a calendar on a phone.
- **A short buzz on Android** when a held card lifts, so you feel it pick up.
  (iPhones don't allow this from a web page.)

### How to test

Desktop:
- [ ] Drag a card from This Week into Today: it moves and gets today's date
      at once.
- [ ] Drag a card from Today into This Week: a "Move to This Week" box opens
      with tomorrow filled in. Enter: the card moves there. Try again with
      Next Two Weeks (next Monday) and Later (the day after Next Two Weeks
      ends).
- [ ] In that box, pick a different date and press Move: the card lands by
      that date. Cancel or Escape: nothing changes.
- [ ] Drag a card onto Overdue from another zone: no outline, and letting go
      puts it back.
- [ ] Reorder within Today (4 cards due the same day): move the bottom card
      to the top, then one into the middle. Reload: the order holds.
- [ ] Reorder within Next Two Weeks across dates (put a Nov 5 card above an
      Oct 30 card): it stays. Then add a card dated between them: it lands by
      its date relative to the untouched cards.
- [ ] Change an arranged card's date in the editor: it drops back into date
      order in its new zone.
- [ ] Press Escape mid-drag: the card goes back.
- [ ] A plain click on a card still opens the editor; a drag never does.
- [ ] The Someday tab shows the right count. Ctrl+Enter a new card: the count
      goes up and "Added to Someday. Edit" still appears.
- [ ] Click the tab: the drawer opens, newest card on top. Click a drawer
      card: the editor opens.
- [ ] Drag a drawer card onto Today: it leaves the drawer with today's date.
- [ ] Drag a board card into the open drawer: its date is cleared and it
      lands where the line showed. Close the drawer and drop a card on the
      tab: it goes to the top of the drawer.
- [ ] Reorder inside the drawer; reload; the order holds.
- [ ] In the console, a dragged card has a number in `order`; a card never
      dragged has `order: null` or no `order` at all.

Phone (or the browser's phone view with touch on):
- [ ] A quick swipe across the board scrolls it sideways; it doesn't grab a
      card.
- [ ] Press and hold a card, then drag: it lifts and follows your finger,
      and the page doesn't scroll. Near the screen's edge, the board scrolls.
- [ ] A tap opens the editor. Holding without moving and letting go does
      nothing.
- [ ] Open the drawer (it covers the board), hold a card and drag: the
      drawer tucks away and you can drop the card on a zone.

What I checked here, in a real browser (Chromium) with a pretend Firebase
standing in for Google's and the clock set to Thursday, Oct 22: every item
above except real Firestore saves (65 checks, all passing, no console
errors). That covers mouse drags into each zone and the picker presets
(Oct 23, Oct 26, Nov 9); Escape and Cancel in the picker; Overdue refusing;
reordering in Today and across dates; dropping a card where it was, which
saves nothing; a redraw arriving mid-drag waiting until the drop; the drawer
in both directions, the tab drop, and drawer reordering; and, with simulated
touch on a phone-sized screen, swipe-to-scroll, tap-to-edit, hold-and-drag,
hold-and-release, the drawer tucking away, and the board scrolling itself
near the edge. Also: opening the drawer never makes the page itself scroll
sideways or grow taller, and the drawer stays in view on a short window.
Not checked: a real phone's finger (the simulation is close but not the
same), and real Firestore.

Known rough edge: on a phone, the open drawer covers the header as well as
the board, so a narrow strip of the header shows above the tab. It works;
it just isn't tidy. Easy to adjust once you've seen it on your phone.

## Slice 1b: quick add, card editing, marking done, in progress

### What it does

A text field sits under the header, as in the mockup. Type a title, then:

- **Enter** opens the editing panel as a "New card" with your title filled
  in and the cursor in the date field. Nothing is saved until you press
  **Add card**. Cancel or Escape saves nothing and puts your text back in the
  field.
- **Ctrl+Enter** (Cmd+Enter on a Mac) saves it at once with no date, which
  means Someday.
- **Shift+Enter** saves it at once in Today.

(Changed after your first test: originally plain Enter was the instant
Someday add. You expect to have a date more often than not, so Enter now
opens the panel and the instant add moved to Ctrl+Enter.)

A short line beside the field confirms where each new card went ("Added to
Someday.", "Added for Fri, Oct 30.") with an **Edit** button, because a
Someday card has nowhere to be seen until the drawer arrives in 1c.

Click any card and an editing panel slides in from the right, styled like the
mockup's Inbox panel. It has Title, Notes, Due date (with a "No date" button
that sends the card to Someday), Category, and an "In progress" checkbox.
Buttons: **Mark done**, **Cancel**, **Save**. Escape, the X, or a click on
the dimmed board closes it without saving. Mark done also keeps any edits
you made in the panel, then the card leaves the board (it stays in Firestore
with status `done` and a `completedAt` time, ready for the Done view in 1f).

In-progress cards show the mockup's small blue "In progress" pill.

Deliberately not in 1b: deadline type (1d), repeat (1e), project (Phase 2),
Let it go (1d), the Someday drawer and dragging (1c), and Haiku parsing of
quick add text (3c).

### Files touched

```
index.html         quick add bar; the editing panel (a <dialog>)
css/horizon.css    quick add, clickable cards, pill, panel and form styles
js/model.js        newCard(): the shape of a freshly added card
js/firebase.js     addCard, updateCard, markDone
js/board.js        cards become clickable; the In progress pill
js/quickadd.js     NEW: the quick add field and its three keys; no Firebase
js/editor.js       NEW: the editing panel; no Firebase
js/app.js          wires the two new pieces to Firebase
```

The same split as 1a: the quick add and the editor only collect what you
typed and hand it to `app.js`, which is the one place that decides what to
save. Demo mode can later hand them a pretend save function.

How a click reaches the editor: each card's title is a real button, and a
CSS trick stretches its clickable area over the whole card. A screen reader
hears "button, Finalize the display booklist"; a mouse can click anywhere on
the card. When 1d adds triage buttons inside cards, they sit on top of that
stretched area and still work.

Saving only writes the fields you actually changed. That way, if a card is
changed somewhere else (another tab, the console) while the panel is open,
Save doesn't overwrite the parts you didn't touch.

Saves show up on the board instantly, before Firestore confirms them. If
Firestore later refuses a save, the board undoes it and a message says so.

### Setup steps (yours)

None. The 1a rules already let you write your own cards, and no new index is
needed. Test on the live site once this branch is pushed (GitHub Pages
redeploys within a minute or two), or locally with `python3 -m http.server`.

### Defaults (you confirmed 1b with these in place; change any of them anytime)

1. **Category for quick-added cards.** Quick add has no way to say a
   category, so new cards start with none: a gray band reading "No category"
   until you pick one in the editor. The alternative is a default category
   (Admin, say) set in `config.js`. I went with none because a wrong
   category looks right at a glance and a missing one doesn't.
2. **The quick add placeholder.** The mockup says *Add anything: "flyer draft
   for nov program fri"*, which promises that "fri" becomes a date. That's
   Phase 3. Until then the placeholder reads *Add anything: "flyer draft for
   the November program"* so the board doesn't promise what it can't do yet.
3. **No delete.** SPEC has no delete, and I didn't add one. A typo card can be
   fixed in the editor; an unwanted one can be marked done now, and let go
   once 1d exists. Say if you want a real delete.

### Proposals (not built; say yes and I'll add them)

- **A one-click done on the card itself** (a small circle beside the title),
  so finishing something doesn't take two clicks and a panel. The mockup
  doesn't show one, which is why I held off.
- **Undo after Mark done**: "Marked done. Undo" in the quick add status line
  for a few seconds. Until 1f there is no other way to get a done card back
  except the Firebase console.
- **Field checks in the security rules** (status must be one of the four
  words, title must be text, and so on). Today the rules check *who* writes,
  not *what*. The app only writes valid cards, so this guards against bugs
  rather than people. Cheap to add whenever you like.

### How to test

- [ ] Type a title, press Enter: the "New card" panel opens with the title
      in it and the cursor in Due. No Mark done button. Pick a date and
      category, press Add card: the card appears in its zone and the line
      says "Added for ...".
- [ ] Enter, then Escape: nothing saved, and the title is back in the field.
- [ ] Ctrl+Enter (Cmd+Enter on a Mac): the field clears, "Added to Someday."
      appears, and no card shows on the board. Edit opens that card.
- [ ] Shift+Enter puts the new card in Today.
- [ ] Enter on an empty or all-spaces field does nothing.
- [ ] In the console, new cards have `source: "quick_add"`, `status: "open"`,
      `category: null`, and `createdAt`/`updatedAt` times.
- [ ] Click a card (anywhere on it): the panel opens with its values filled in.
      Tab to a card and press Enter: same.
- [ ] Change the title, notes, date, category; Save. The card updates and moves
      zones if the date changed.
- [ ] "No date" then Save: the card leaves the board (it's in Someday).
- [ ] Check "In progress", Save: the pill appears. Uncheck, Save: it goes.
- [ ] Mark done: the card disappears; in the console it has `status: "done"`
      and a `completedAt` time.
- [ ] Escape, X, Cancel, and clicking the dim area all close without saving.
- [ ] Clearing the title and pressing Save asks for a title instead of saving.
- [ ] Shrink to phone width: the panel fills the screen and nothing scrolls
      sideways.

What I checked here, in a real browser with a pretend Firebase standing in
for Google's: every item above (52 checks, all passing, no console errors),
plus that only changed fields are written, that focus returns to the card
after the panel closes, that a refused quick add gives your text back, and
that a title containing HTML shows as plain text. Screenshots of the board,
the panel, and phone width looked right against the mockup. Not checked
here: real Firestore saves and the rules, which need your live project.

Confirmed by you on the live site and committed as one slice.

## Slice 1a: config, sign-in, rules, and the Horizon from Firestore

### What it does

Open the site and you see a sign-in screen. Sign in with Google and the
Horizon appears: five zones (Overdue, Today, This Week, Next Two Weeks,
Later) at the mockup's unequal widths, with every open or in-progress card
placed by its due date. Cards show their category band, category name, title,
date, and "N days late" when overdue. The board updates live: change a card
in the Firebase console and the page moves it without a reload.

Only people on the approved list get in. Anyone else who signs in sees a
plain "this Horizon is private" screen with a Sign out button. If the page
stays open past midnight, cards drift into their new zones within a minute.

If `config.js` still has placeholder values, the site says so instead of
throwing a Firebase error. If Firestore refuses to share your cards (usually
because the rules aren't published), the board says that too.

Deliberately not in 1a, because later slices own them: quick add, the 14-day
strip, the Projects/Done/Inbox buttons, the Someday drawer (undated cards are
simply not shown yet), hard-deadline chips, in-progress pills, repeat icons,
triage buttons, and clicking a card.

### Files

```
index.html         the page: setup note, sign-in screen, board
config.js          THE config file: every instance-specific value
firestore.rules    security rules, pasted into the Firebase console
css/horizon.css    all styles; colors and type from SPEC "Visual design"
js/app.js          starts the app: config check, sign-in, live board
js/firebase.js     the only file that talks to Firebase (SDK pinned here)
js/model.js        the data model, written down, plus card cleanup
js/dates.js        date math and formatting; zone boundaries
js/board.js        turns cards into the Horizon's HTML; no Firebase
```

Why split this way: the board and date code don't know Firebase exists. That
matters for two later features. The `?today=` testing parameter (1d) is a
one-function change in `dates.js`. Demo mode (future) can feed sample cards
straight into `renderBoard` with no sign-in and nothing saved.

Firebase SDK: version 12.19.0, loaded from Google's CDN. npm shows 12.19.0
released 2026-09-09. Version 13 exists but its first release came out this
month, so I stayed on the mature line. Upgrading means changing the three URLs
at the top of `js/firebase.js`.

### Data model

Everything you own lives under one path, `users/{your user ID}`. The
approved list sits beside it:

```
allowlist/{email}            one document per approved person
users/{uid}                  profile: createdAt, categories
users/{uid}/cards/{cardId}   every card, whatever its status
```

Later: `users/{uid}/projects/...` (Phase 2) and `users/{uid}/inbox/...`
(Phase 3). The full card shape is written at the top of `js/model.js`.

Decisions worth knowing:

- **Due dates are text, like `2026-10-22`,** not Firestore timestamps. A
  timestamp is a moment in time, and when the browser converts it to your time
  zone a date near midnight can slide to the day before. Plain text can't
  slide. (If you type a timestamp by hand in the console, the app still reads
  it.)
- **Cards store a category id** (`programs`), not the name. Your categories
  live on your profile with id, name, and color, so you can rename "Saturday
  PIC" later without touching a single card.
- **On first sign-in** the app creates your profile with the starter
  categories from `config.js`. This also makes the `users` collection appear in
  the console, which makes adding test cards by hand easier.
- **Done and let-go cards stay in the same `cards` collection,** just with a
  different status. The board only downloads open and in-progress cards, so
  years of Done history never slow it down or eat the free read quota.
- **Weeks run Monday to Sunday**, matching the mockups ("Oct 23 to 25" on a
  Thursday, "Oct 12 to 18" in the Done view).

### How this leaves room for colleagues and forks

*Colleagues on your instance.* Each person's data is already sealed under their
own user ID, so adding people adds new `users/{uid}` branches and changes
nothing about yours. Sending a card later means writing a draft into the
recipient's `users/{them}/inbox`, with a `linkId` shared by both copies. The
rules would gain one narrow exception: an allowlisted sender may *create* (not
read) a document in someone else's inbox. Shared projects would live in a
separate top-level `projects` collection with a members list; the cards stay
on each person's own board under their own ID.

*Your Done record stays private.* Done cards live under your user ID, and the
rules let only that ID read them. No future feature needs to read another
person's cards, so no rule will ever grant it. (See the open question below
about the Firebase console, which is the one honest exception.)

*People running their own copy.* Every instance value is in `config.js`. The
rules file contains no IDs, emails, or project names, so a fork pastes it in
unchanged.

### The security rules, in plain language

`firestore.rules` has two rules, and everything not covered by them is closed.

1. **Your own cards.** You may read or write anything under `users/X` only if
   your user ID is X *and* your email has a document in `allowlist`. The
   first part keeps everyone out of everyone else's data. The second keeps
   strangers from opening boards in your project and using your free quota.
2. **Your own place on the list.** You may look up the `allowlist` document
   with your own email, and no other. That's how the app knows to show "you're
   not on the list" instead of a cryptic error, without letting anyone see who
   else is on it. Nobody can add themselves: the app has no write access to
   the list. Only you can, in the console.

The list is keyed by email rather than user ID because you can add an email
before that person has ever signed in. The rules also require the email to be
verified, so nobody can claim an address they don't own. Google accounts are
always verified.

This is what makes the Firebase config values safe to publish on GitHub: they
say *which* database, and the rules decide *who* gets in.

### Setup steps (yours)

**1. Create the Firebase project**
1. Go to console.firebase.google.com, click **Create a project**, name it
   (e.g. "horizon"). You can turn Google Analytics off.
2. It starts on the free Spark plan. Don't upgrade.

**2. Turn on Google sign-in**
1. Left menu: **Build > Authentication > Get started**.
2. **Sign-in method** tab > **Google** > Enable. Pick your support email. Save.
3. **Settings** tab > **Authorized domains** > **Add domain** >
   `blubrd92.github.io`. (`localhost` is already there.)

**3. Create Firestore and publish the rules**
1. **Build > Firestore Database > Create database.** Pick a location near you
   (it can't be changed later). Start in **production mode**.
2. **Rules** tab: delete what's there, paste all of `firestore.rules`, click
   **Publish**.
3. **Data** tab: put yourself on the approved list. Click **Start
   collection**, Collection ID `allowlist`, Next. For **Document ID**, type
   your Google email in all lowercase. The console wants at least one field,
   so add `note` (string) with anything in it, like `owner`. Save.

**4. Register the web app and fill in config.js**
1. Gear icon > **Project settings** > **General** > "Your apps" > the `</>`
   (Web) icon. Nickname "horizon web". Skip Firebase Hosting.
2. It shows a `firebaseConfig` block. Copy each value into the matching line
   of `config.firebase` in `config.js`, replacing the `PASTE_...` text.
3. Commit and push that change.

**5. Turn on GitHub Pages**
1. On GitHub: the repo > **Settings > Pages**.
2. Source: **Deploy from a branch**. Branch: the one with this slice on it
   (`claude/exciting-wozniak-20fv7s` for now, `main` once merged), folder
   `/ (root)`. Save.
3. After a minute or two the site is at
   `https://blubrd92.github.io/Horizon-Tasks/`.

(Or test on your computer: in the repo folder run `python3 -m http.server`,
then open `http://localhost:8000`. Opening `index.html` by double-clicking
won't work, because browsers block modules on `file://` pages.)

**6. Sign in, then add test cards by hand**
1. Open the site and sign in. The empty board appears. (If you see "this
   Horizon is private", check that the `allowlist` document ID matches your
   email exactly, in lowercase.)
2. Firebase console > **Firestore Database > Data**. Open `users`, then your
   document (the long ID; it matches your user UID under Authentication >
   Users).
3. **Start collection** > Collection ID `cards` > Auto-ID, then add fields:

   | Field      | Type   | Example                         |
   |------------|--------|---------------------------------|
   | `title`    | string | `Finalize the display booklist` |
   | `dueDate`  | string | `2026-10-22`                    |
   | `category` | string | `programs`                      |
   | `status`   | string | `open`                          |
   | `createdAt`| timestamp | (any)                        |

   `status` is required: without it the card won't appear. Category ids:
   `collection-development`, `programs`, `digital-resources`, `saturday-pic`,
   `admin`.
4. Add a few with dates in the past, today, later this week, in two weeks,
   and next month, and watch each land in its zone.

### How to test

- [ ] Before filling in config.js, the site shows the "isn't connected" note.
- [ ] Sign-in works; Sign out returns to the sign-in screen.
- [ ] A Google account that isn't on the list sees the "private" screen, and
      its Sign out button works.
- [ ] Removing your own `allowlist` document locks you out; adding it back
      lets you in.
- [ ] Each test card lands in the right zone; zone counts are right.
- [ ] An overdue card says "N days late" in rose.
- [ ] Editing a card's `dueDate` in the console moves it live.
- [ ] Setting a card's `status` to `done` makes it disappear.
- [ ] A card with no `dueDate` doesn't appear (it's for the Someday drawer).
- [ ] An unknown category shows in gray with its raw id.

What I checked here: zone math against the mockup dates (Thursday Oct 22
gives "Oct 23 to 25" and "Oct 26 to Nov 8"), across the November daylight
saving change, and on a Sunday; a screenshot of the board with the mockup's
sample cards (Firebase stubbed out); that HTML in a title shows as text; no
page-level sideways scrolling at phone width; the "private" screen for an
account that isn't approved; and, with a fake clock, the board redrawing
itself between 11:59 pm and 12:01 am. I could not test real sign-in, the
rules, or Firestore, since there's no Firebase project yet.

## Decisions made

- **Approved list:** yes. Built as the `allowlist` collection (see the rules
  section above).
- **Design files** moved into `design/`, where SPEC and CLAUDE.md say they
  are.
- **Sunday:** literal. This Week is empty and reads "nothing left this
  week"; Next Two Weeks starts the next morning.
- **Sign out** stays at the right of the header, where Projects, Done, and
  Inbox will join it.
- **Midnight:** fixed now rather than in 1d, since it was a few lines. The
  board checks the date once a minute and redraws when it changes.

## Parked for later

- **The console exception to Done privacy.** Rules bind the app, not the
  Firebase project owner: whoever owns the project can open any document in
  the console. Today that's only you reading your own data. Once colleagues
  join your instance, you as owner could technically see their Done records,
  which collides with "No user, including an admin." The real fix is
  encrypting Done records in the browser with a key only their owner holds.
  Decide before colleagues join.
- **One approved list, not two (for slice 3a).** SPEC puts the Apps Script
  allowlist in Script Properties, which would mean keeping two lists in sync.
  The script will already receive your Firebase sign-in token, and with it
  it can ask Firestore "is this person on `allowlist`?" exactly the way the
  app does. Worth deciding when 3a starts.
