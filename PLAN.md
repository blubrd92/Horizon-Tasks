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

**Slice 1c: built, waiting for your test.** Drag to reschedule, reordering
within zones, and the Someday drawer. Details and the test list are below.

**Next, once you confirm 1c:** commit it, then start slice 1d in a fresh
session.

## Slice 1c: drag to reschedule, reorder within zones, the Someday drawer

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
