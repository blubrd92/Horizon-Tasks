# Horizon: a personal task board where position means time

## About me and how to work with me
I'm a librarian and a proficient vibe coder, not a trained programmer. Explain
technical decisions in plain language as you go. Only implement what I
explicitly ask for. If you see something else that should change, propose it,
explain why, and wait for my approval before writing it. Work in phases and stop
at the end of each phase so I can test. Before writing any code in Phase 1,
propose the Firestore data model and wait for my OK.

## What this is, and what it refuses to be
A single-user board that shows what I need to do and when, at a glance. It is
not a team tool. No notifications, no streaks, no engagement tricks. The goal is
that I open it, understand my week in a few seconds, and leave feeling clear.
When a feature choice is unclear, choose the one that reduces friction for me
and keeps the board honest.

## Stack
- Vanilla HTML, CSS, and JavaScript. No framework, no build step.
- Hosted on GitHub Pages.
- Firebase Authentication (Google sign-in) and Cloud Firestore, on the free
  Spark plan. Do not use Cloud Functions or Cloud Storage.
- A Google Apps Script web app is the backend for AI features. It holds the
  Anthropic API key in Script Properties and is the only code that talks to the
  Anthropic API.
- AI model: Claude Haiku via the Anthropic Messages API (model string
  `claude-haiku-5-5`; confirm against current Anthropic docs before using).
- No image storage anywhere. Screenshots exist only in the browser during review.

## Core concept: two layers
1. The Horizon (home view): vertical zones left to right: Overdue, Today,
   This Week, Next Two Weeks, Later. Zones are unequal widths, roughly
   0.85 / 1.4 / 1.15 / 1 / 0.85, so nearer time gets more space. Cards place
   themselves by due date and drift left as days pass. Dragging a card into a
   zone reschedules it: Today sets today's date; This Week and Next Two Weeks
   open a date picker preset to the start of that range. Within a zone, cards
   stack and can be reordered.
2. Project pages (see Projects).

Undated cards never appear on the Horizon. They live in a Someday drawer behind
a tab on the right edge (with a count). Dragging a card from the drawer onto a
zone gives it a date; dragging a card into the drawer clears it.

On desktop the whole board fits without page-level horizontal scrolling. On
narrow screens the zones scroll sideways inside their own container.

## Cards
Fields: title, notes (optional), due date (optional), deadline type ("soft" by
default, or "hard" for real external cutoffs), project (optional), category,
status (open, in progress, done, let go), repeat rule (none, weekly, monthly),
source (manual, quick add, or screenshot), created, updated, and completed or
let-go timestamps.

- Clicking a card opens it for editing.
- In-progress cards show a small "In progress" pill.
- Repeating cards create their next instance when marked done.
- Overdue cards show how late they are ("2 days late").
- Marking a card done removes it from the board and adds it to the Done record.

Categories are editable by me. Start with: Collection Development, Programs,
Digital Resources, Saturday PIC, Admin.

## Quick add
A single text field under the header, always visible. There is no "new card"
form. I type a plain sentence and press Enter.
- Phase 1: the text becomes the card title with no date (it lands in Someday,
  or Today if I hold Shift while pressing Enter). I can edit it afterward.
- Phase 3: the text goes to the Apps Script backend and Haiku parses it into
  the same JSON shape as screenshots. Entries with an explicit date go straight
  onto the board; anything with an inferred date goes to the Inbox for review.

## Morning triage
The first time I open the board each day, every soft-deadline card in Overdue
shows four buttons: Tomorrow, This week, Someday, Let it go. Hard-deadline cards
never offer "Let it go"; they stay until I act on them directly. "Let it go"
sets status to "let go" and removes the card from the board.

## Since yesterday
One line beside the quick add field: how many cards moved into Today since my
last visit, and how many I finished since then. Store the last-visit timestamp
in Firestore.

## The Done record ("What you did")
A separate view reached from the Done button in the header.
- Finished cards grouped by week, newest first, each row showing title,
  category, and completion date.
- Week, Month, and Year range buttons. A total for the range in a prominent
  dark tile, plus a count tile per category.
- "Copy as text" copies the current range as a plain list (date, title,
  category) for pasting into evaluations or reports.
- Let-go cards appear in a collapsed section at the bottom of the range, with a
  count and a Show button.
- A "Back to the board" link returns to the Horizon.

## Projects
A project has a name, color, optional end date, and a project page. The page
shows free-text notes, a list of links (each with a title, for things like a
Drive folder of reference images), and the project's task cards, which stay in
sync with the Horizon. A project list (from the Projects button) opens any
project page; clicking a card's project tag on the Horizon also opens it.

## Screenshot to card (the AI feature)
I add a screenshot by pasting anywhere on the page (Ctrl/Cmd+V), dragging an
image onto the board, or using a file picker.

Flow:
1. Compress the image in the browser (max width around 1600px, JPEG or WebP).
2. Send it (base64), today's date in my time zone, and my Firebase ID token to
   the Apps Script web app.
3. The script verifies the token using the Firebase Auth REST API and checks my
   user ID against an allowlist in Script Properties. It rejects anything else.
4. The script calls Haiku, which must return only JSON:
   { "title", "summary", "due_date" (ISO date or null),
     "due_date_confidence" ("explicit" | "inferred" | "none"),
     "suggested_category", "deadline_type" ("soft" | "hard"),
     "people_mentioned" }
   Haiku resolves relative dates ("next Friday") using the date I sent.
5. The script returns the JSON. The image is never saved anywhere.
6. The result becomes a draft in the Inbox, never directly on the board.

Apps Script web apps have known issues with cross-origin browser requests.
Explain the approach you choose to handle this before implementing it.

## The Inbox review panel
- An Inbox button in the header shows the number of drafts in a small blue
  count pill. Clicking it slides a panel in from the right (about 460px wide)
  over a dimmed board. An X closes it.
- Panel header: "Inbox", plus the line "Nothing reaches the board until you add
  it, and screenshots are never saved."
- Each draft shows the screenshot preview (for checking only), and editable
  Title, Due date, and Category fields.
- An inferred date shows a soft yellow note ("Date inferred from 'end of next
  month.' Worth a second look."). An explicit date shows a soft green note
  ("Date read directly from the screenshot.").
- Buttons: Discard and Add to board. Both discard the screenshot from memory.
- At the bottom: a dashed drop zone, "Paste a screenshot with Ctrl+V, or drop
  an image here."

## Security
- Firestore rules restrict every read and write to the owning user.
- The Anthropic API key exists only in Apps Script Script Properties.
- The Apps Script rejects requests without a valid, allowlisted Firebase ID
  token, and enforces a simple per-day rate limit.
- Explain each rule you write so I understand what it protects.

## Visual design
Design reference files are in `/design` (see "Design reference" below). Match
them closely.

- Ground #F3F1EB; surfaces #FFFFFF and #FBFAF6; borders #DDD9CF and #E2DFD6;
  ink #18191C; secondary text #4B4F57.
- Typefaces (Google Fonts): Bricolage Grotesque 700 for headings and the
  wordmark; IBM Plex Sans for body; IBM Plex Mono for every date and count.
- Corners: 10px buttons, 12px cards and inputs, 18px zone panels and large
  panels. Soft shadows only.
- Blue #2F5BD3 is the single accent: today, counts, primary buttons.
- Overdue zone: rose tint #F5E3EA, heading and late text #8E2F51. This is the
  gentle reminder color.
- Orange (#9A3F06 text on #FDEBDD) is reserved for hard deadlines that are due
  today or overdue, shown as a "Hard deadline" chip. Nothing else is orange.
  A hard deadline further out shows a gray outlined chip instead.
- Today zone: blue tint #DCE4F7, and its header shows the date as a large blue
  numeral (64px) beside the word "Today."
- Category colors appear as a 4px band across the top of each card, always
  paired with the category name in small caps above the title:
  Collection Development #2F7D6B, Programs #6A4FB3, Digital Resources #3B6FB6,
  Saturday PIC #B07A00, Admin #6B6F78.
- Header, left to right: the "Horizon" wordmark; a 14-day strip of small
  rounded tiles (weekday, date, one dot per card due; today in solid blue,
  weekends lighter); then Projects, Done, and Inbox buttons.
- Below the header: the quick add field (with a plus icon and an "Enter" hint)
  and the "Since yesterday" line.
- Icons are simple inline stroke SVGs. No emoji.
- Accessibility: real buttons, links, inputs, and labels; touch targets at
  least 44px; text contrast at least 4.5:1; never rely on color alone.

## Design reference
`/design` contains screenshots of the mockup and its source markup:
- `horizon-board.png`, `horizon-inbox-open.png`, `horizon-done.png`: what it
  should look like.
- `Main.dc.html` and `Done.dc.html`: the mockup source. These were built for a
  design canvas and will not run on their own. Read them for exact layout,
  spacing, colors, and copy, not as code to copy. Sample card content in them
  is placeholder data.

## Future: colleagues and other people (do not build yet)
Two kinds of future users are expected. Design the Phase 1 data model and file
structure so both can be added later without migrating existing data.

Colleagues on my instance:
- Multiple users, each with a private board. Access controlled by an allowlist.
- Sending a card to another user: it arrives in their Inbox as a draft they can
  edit, add, or discard. The sender's and recipient's copies are separate cards
  linked by an ID, so the sender sees when the recipient completes it (as part
  of the Since yesterday line).
- Later, possibly: shared projects with members, where each member sees only
  cards assigned to them on their own board.

People elsewhere who want to try it:
- They run their own copy: fork the GitHub repo, connect their own Firebase
  project, Apps Script, and Anthropic API key. My instance never holds their
  data or spends my key on their screenshots.
- Keep every instance-specific value (Firebase config, Apps Script URL,
  allowlist location) in one clearly labeled config file, never scattered
  through the code.
- Later, a demo mode: the board loads with sample cards in memory, no sign-in,
  nothing saved, so someone can try it in thirty seconds before deciding to
  set up their own copy.

Non-negotiable under every future design: the Done record is private to its
owner. No user, including an admin, can view another user's Done record.

Explain how your proposed data model and file structure leave room for this.

## Phases
Phase 1: Sign-in, the Horizon, the Someday drawer, quick add (title only),
card editing, drag to reschedule, hard and soft deadlines, repeating cards,
morning triage, the Since yesterday line, the Done record, Firestore
persistence. Stop here.

Phase 2: Projects and project pages. Stop here.

Phase 3: The Apps Script backend, the screenshot-to-card pipeline, Haiku
parsing for quick add, and the Inbox review panel. Stop here.

For each phase, include the setup steps I need to do myself in the Firebase
console, Google Apps Script, or GitHub, written for someone who has done this
a few times but not often.
