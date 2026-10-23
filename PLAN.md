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

**Next: slice 1c** (drag to reschedule, reordering within zones, the Someday
drawer). Start it in a fresh session: read this file, then the 1c parts of
SPEC.md ("Core concept: two layers", the Someday drawer paragraph). Two
things from 1b to settle there: whether the "Added to Someday. Edit" line
stays once the drawer exists, and where a card's manual order is stored
(reordering needs a field the 1a/1b cards don't have yet). Also decide how
dragging works on a phone, where there's no mouse.

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
