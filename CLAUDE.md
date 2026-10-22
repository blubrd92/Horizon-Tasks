# Horizon

A personal task board where position means time. The full product spec is in
`SPEC.md`; read the sections relevant to the current slice, not the whole file
every time. Visual references are in `/design`.

## How to work with me
- I'm a proficient vibe coder, not a trained programmer. Explain technical
  decisions in plain language.
- Only implement what I explicitly ask for. If something else should change,
  propose it, explain why, and wait for my approval.
- Work one slice at a time (see "Build order" in SPEC.md). Plan first, then
  build, then stop so I can test.
- Write each slice's plan and any open questions to `PLAN.md`. Update it as
  the slice progresses so a fresh session can pick up where we left off.
- After I confirm a slice works, commit with a clear message describing what
  the slice does.
- If a fix starts piling patches on patches, stop and tell me. Rolling back to
  the last commit is often better.

## Stack and constraints
- Vanilla HTML, CSS, JavaScript. No framework, no build step. GitHub Pages.
- Firebase Auth (Google sign-in) and Firestore on the free Spark plan. No Cloud
  Functions, no Cloud Storage.
- Google Apps Script is the only backend and the only place the Anthropic API
  key lives.
- Every instance-specific value lives in one config file.
- No image storage anywhere.
- The Done record is private to its owner under every design. No exceptions.

## Style
- Match the colors, type, and spacing in SPEC.md "Visual design" and `/design`.
